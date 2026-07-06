/**
 * MIRAGE corpus loader (FLOW_PLAN H3, MIRAGE-CORPUS-SPEC §5/§11) — the strict,
 * fail-closed gate on the corpora files. Enforces the construction firewall so a
 * weak, leaky, or contaminated corpus can never drive an eligibility decision.
 *
 * Enforces:
 *   - §5 schema (zod .strict — unknown fields rejected).
 *   - §2.1/§10 firewall: NO item may carry scoring-store / case-node provenance;
 *     the loader NEVER opens data/cases/10..13 (it reads only benchmark/mirage/corpora).
 *   - §2.5/§11 question-only: no relevant_evidence key or answer text in the query.
 *   - partition/relevant_evidence consistency (P has >=1 key; N/A have none).
 *   - synthetic:true on every item.
 *
 * The loader also computes the SHA-256 corpus checksum (§8) — a score is
 * meaningless without the corpus version + checksum that produced it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { assertQuestionOnly } from "./run-mirage.js";

const ItemSchema = z
  .object({
    id: z.string().regex(/^MRG-[0-9]+-[PNAL]-\d{5}$/, "id must be MRG-<pathref>-<PNAL>-<5 digits>"),
    corpus_version: z.string().min(1),
    path: z.enum(["evidence-fda-pubmed", "evidence-drug-guideline", "docs"]),
    partition: z.enum(["P", "N", "A", "L"]),
    question: z.string().min(1),
    answer_options: z.array(z.string().min(1)).min(2),
    correct_answer: z.string().min(1),
    relevant_evidence: z.array(z.string()),
    answer_rationale: z.string(),
    au_context: z.boolean(),
    expected_behaviour: z.enum(["retrieve", "abstain", "hold_invariant"]),
    synthetic: z.literal(true),
    authored_by: z.string().min(1),
    attested_by: z.string().nullable(),
    provenance: z.string().min(1),
    notes: z.string(),
  })
  .strict()
  .superRefine((it, ctx) => {
    if (it.partition === "P" && it.relevant_evidence.length < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "P item must carry >=1 relevant_evidence key" });
    }
    if ((it.partition === "N" || it.partition === "A") && it.relevant_evidence.length !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "N/A item must have empty relevant_evidence (nothing should be retrieved)" });
    }
  });

// A provenance string that points at the sealed scoring store / case nodes is a
// firewall breach (§2.1/§10). Author provenance is always a PUBLIC source.
const SCORING_PROVENANCE_RE = /(data\/cases|(^|[^0-9])1[0-3]_|_node\.json|ground_truth|symptom_links|management_plan|safety_netting|scoring[-_ ]?node)/i;

function assertFirewall(item) {
  if (SCORING_PROVENANCE_RE.test(item.provenance)) {
    throw new Error(`FIREWALL: item ${item.id} provenance references the sealed scoring store / case nodes — forbidden (MIRAGE-CORPUS-SPEC §2.1/§10)`);
  }
}

/** Parse + validate one corpus file, returning its items (each fully checked). */
export function loadCorpusFile(absPath) {
  const raw = JSON.parse(readFileSync(absPath, "utf8"));
  const items = Array.isArray(raw) ? raw : raw.items;
  if (!Array.isArray(items)) throw new Error(`corpus file ${absPath} has no items[]`);
  return items.map((it) => {
    const parsed = ItemSchema.safeParse(it);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      throw new Error(`corpus item invalid in ${absPath} (${it && it.id}): ${issues}`);
    }
    const item = parsed.data;
    assertFirewall(item);
    assertQuestionOnly(item); // §2.5/§11
    return item;
  });
}

/**
 * Load every *.corpus.json in the corpora dir, validate all items, and group them
 * by their target `path`. Returns { corpora: {path -> {corpus_version, path, items[]}},
 * checksum, corpus_version, counts }.
 */
export function loadAllCorpora(corporaDir) {
  const files = readdirSync(corporaDir).filter((f) => f.endsWith(".corpus.json")).sort();
  const all = [];
  const hash = createHash("sha256");
  for (const f of files) {
    const abs = join(corporaDir, f);
    // Checksum the canonical file bytes (§8).
    hash.update(f + "\0" + readFileSync(abs, "utf8"));
    all.push(...loadCorpusFile(abs));
  }
  const versions = new Set(all.map((i) => i.corpus_version));
  if (versions.size > 1) throw new Error(`corpus_version mismatch across files: ${[...versions].join(", ")}`);
  const corpus_version = [...versions][0] || "0.0.0";

  const byPath = {};
  for (const it of all) {
    (byPath[it.path] ||= { corpus_version, path: it.path, items: [] }).items.push(it);
  }
  const counts = {};
  for (const [p, c] of Object.entries(byPath)) {
    counts[p] = c.items.reduce(
      (acc, it) => {
        acc[it.partition]++;
        if (it.attested_by != null) acc.attested++;
        else acc.unattested++;
        return acc;
      },
      { P: 0, N: 0, A: 0, L: 0, attested: 0, unattested: 0 }
    );
  }
  return { corpora: byPath, checksum: "sha256:" + hash.digest("hex"), corpus_version, counts, files };
}
