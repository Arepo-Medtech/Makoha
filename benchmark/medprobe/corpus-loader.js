/**
 * MedProbeBench corpus loader (Mechanical Inventory B2.1a) — the strict, fail-closed
 * gate on the claim corpora. Same posture as the MIRAGE loader
 * (benchmark/mirage/corpus-loader.js): a weak, leaky, or contaminated corpus can never
 * drive a benchmark result.
 *
 * MedProbeBench methodology (clean-room, first-party — NO upstream dataset lifted):
 * claim-level CITATION ACCOUNTABILITY. Each item is one atomic clinical claim plus the
 * evidence keys it cites. The benchmark measures whether an output's claims are each
 * traceable to a cited source that actually supports them — the external analogue of our
 * EvidenceNode -> Receipt -> citation invariant. Partitions:
 *   S (supported)          — cited evidence exists AND supports the claim -> ACCEPT.
 *   U (unsupported)        — claim has no citation / no support -> FLAG (ungrounded).
 *   F (fabricated-citation)— cites a source that does not exist or does not support the
 *                            claim -> FLAG (misattributed/fabricated reference).
 *
 * Enforces:
 *   - schema (zod .strict — unknown fields rejected);
 *   - the SAME scoring-store firewall as MIRAGE: no item may carry scoring-store /
 *     case-node provenance; the loader NEVER opens data/cases/10..13 (reads only
 *     benchmark/medprobe/corpora);
 *   - claim hygiene: a claim must not embed its own cited evidence key verbatim (so a
 *     scorer can never trivially string-match the key out of the claim — the MIRAGE
 *     question-only analogue);
 *   - partition <-> expected_verdict consistency;
 *   - synthetic:true on every item.
 *
 * Computes the SHA-256 corpus checksum over the canonical *.corpus.json bytes — a score
 * is meaningless without the corpus version + checksum that produced it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

const EvidenceSchema = z
  .object({
    key: z.string().min(1),
    text: z.string().min(1),
    source: z.string().min(1),
    // Which propositions (claim_ref) this evidence SUPPORTS vs REFUTES. This is how the
    // benchmark models citation accountability deterministically: a grounded verifier can
    // tell a supported citation from a misattributed (contradicting) one without NLI, while
    // a naive existence-only checker cannot. Neither list encodes any item's verdict — a
    // claim_ref is a neutral topic id shared by a claim and the evidence that speaks to it.
    supports: z.array(z.string()),
    refutes: z.array(z.string()),
  })
  .strict();

const ItemSchema = z
  .object({
    id: z.string().regex(/^MPB-[0-9]+-[SUF]-\d{5}$/, "id must be MPB-<n>-<S|U|F>-<5 digits>"),
    corpus_version: z.string().min(1),
    claim: z.string().min(1),
    claim_ref: z.string().min(1), // neutral proposition id — the topic the claim asserts (NOT its truth)
    cited_evidence: z.array(z.string()),
    partition: z.enum(["S", "U", "F"]),
    expected_verdict: z.enum(["accept", "flag_unsupported", "flag_fabricated"]),
    support_note: z.string(),
    synthetic: z.literal(true),
    authored_by: z.string().min(1),
    attested_by: z.string().nullable(),
    provenance: z.string().min(1),
    notes: z.string(),
  })
  .strict()
  .superRefine((it, ctx) => {
    if (it.partition === "S" && (it.cited_evidence.length < 1 || it.expected_verdict !== "accept")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "S item must carry >=1 cited_evidence and expected_verdict 'accept'" });
    }
    if (it.partition === "U" && it.expected_verdict !== "flag_unsupported") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "U item must have expected_verdict 'flag_unsupported'" });
    }
    if (it.partition === "F" && (it.cited_evidence.length < 1 || it.expected_verdict !== "flag_fabricated")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "F item must carry >=1 cited_evidence and expected_verdict 'flag_fabricated'" });
    }
  });

// A provenance string pointing at the sealed scoring store / case nodes is a firewall
// breach — IDENTICAL bar to the MIRAGE loader (author provenance is always PUBLIC).
const SCORING_PROVENANCE_RE = /(data\/cases|(^|[^0-9])1[0-3]_|_node\.json|ground_truth|symptom_links|management_plan|safety_netting|scoring[-_ ]?node)/i;

export function assertFirewall(item) {
  if (SCORING_PROVENANCE_RE.test(item.provenance)) {
    throw new Error(`FIREWALL: item ${item.id} provenance references the sealed scoring store / case nodes — forbidden`);
  }
}

/**
 * Claim hygiene: the claim must not embed a cited evidence key verbatim, else a scorer
 * could pass by string-matching the key out of the claim instead of actually checking
 * the citation. The MIRAGE question-only analogue. Throws on a violation.
 */
export function assertClaimHygiene(item) {
  const c = String(item.claim || "").toLowerCase();
  for (const k of item.cited_evidence || []) {
    const nk = String(k).toLowerCase();
    if (nk && c.includes(nk)) {
      throw new Error(`claim-hygiene violation: item ${item.id} claim embeds its cited evidence key "${k}"`);
    }
  }
}

/** Validate one item fully (schema + firewall + hygiene). Throws with a precise message. */
export function validateItem(raw, whereLabel = "(inline)") {
  const parsed = ItemSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`corpus item invalid in ${whereLabel} (${raw && raw.id}): ${issues}`);
  }
  const item = parsed.data;
  assertFirewall(item);
  assertClaimHygiene(item);
  return item;
}

/** Parse + validate one corpus file, returning { corpus_version, evidence[], items[] }. */
export function loadClaimFile(absPath) {
  const raw = JSON.parse(readFileSync(absPath, "utf8"));
  const evidenceRaw = Array.isArray(raw.evidence) ? raw.evidence : [];
  const itemsRaw = Array.isArray(raw) ? raw : raw.items;
  if (!Array.isArray(itemsRaw)) throw new Error(`corpus file ${absPath} has no items[]`);
  const evidence = evidenceRaw.map((e) => {
    const p = EvidenceSchema.safeParse(e);
    if (!p.success) throw new Error(`evidence entry invalid in ${absPath}: ${p.error.issues.map((i) => i.message).join("; ")}`);
    return p.data;
  });
  const items = itemsRaw.map((it) => validateItem(it, absPath));
  return { corpus_version: raw.corpus_version || (items[0] && items[0].corpus_version), evidence, items };
}

/**
 * Load every *.corpus.json in the corpora dir, validate all items, and merge. Returns
 * { items, evidence (key->entry map), checksum, corpus_version, counts }.
 */
export function loadAllClaims(corporaDir) {
  const files = readdirSync(corporaDir).filter((f) => f.endsWith(".corpus.json")).sort();
  const items = [];
  const evidenceMap = {};
  const hash = createHash("sha256");
  for (const f of files) {
    const abs = join(corporaDir, f);
    hash.update(f + "\0" + readFileSync(abs, "utf8")); // checksum canonical file bytes
    const { evidence, items: fileItems } = loadClaimFile(abs);
    for (const e of evidence) evidenceMap[e.key] = e;
    items.push(...fileItems);
  }
  const versions = new Set(items.map((i) => i.corpus_version));
  if (versions.size > 1) throw new Error(`corpus_version mismatch across files: ${[...versions].join(", ")}`);
  const corpus_version = [...versions][0] || "0.0.0";

  const counts = items.reduce(
    (acc, it) => {
      acc[it.partition]++;
      if (it.attested_by != null) acc.attested++;
      else acc.unattested++;
      acc.total++;
      return acc;
    },
    { S: 0, U: 0, F: 0, attested: 0, unattested: 0, total: 0 }
  );
  counts.evidence_keys = Object.keys(evidenceMap).length;

  return { items, evidence: evidenceMap, checksum: "sha256:" + hash.digest("hex"), corpus_version, counts, files };
}
