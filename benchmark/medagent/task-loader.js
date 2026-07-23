/**
 * MedAgentBench task loader (Mechanical Inventory B2, MA.1) — the strict, fail-closed gate
 * on the task corpora. Same posture as the MIRAGE / MedProbe loaders.
 *
 * MedAgentBench methodology (clean-room, first-party — NO upstream dataset lifted):
 * multi-step physician tasks executed against a benchmark-scoped virtual FHIR EHR. Each
 * item is one task (query / order / compute) plus the synthetic FHIR resources that seed
 * the sandbox and the expected correct action/answer. This is the only benchmark that
 * exercises the trunk TOPOLOGY (multi-step grounded tool calls), so the scorer (MA.2) will
 * grade BOTH task success AND invariant adherence during the sequence.
 *
 * Enforces:
 *   - schema (zod .strict — unknown fields rejected);
 *   - the SAME scoring-store firewall as MIRAGE over the prompt + provenance (no task may
 *     reference data/cases/10..13); the loader NEVER opens data/cases;
 *   - each ehr_seed entry is a shaped FHIR resource (resourceType + id) — synthetic by
 *     construction (dev-authored); AU-Core validation happens in the sandbox (virtual-ehr.js);
 *   - synthetic:true on every item.
 *
 * Computes the SHA-256 corpus checksum over the canonical *.corpus.json bytes.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

const FhirResourceSchema = z
  .object({ resourceType: z.string().min(1), id: z.string().min(1) })
  .passthrough(); // a FHIR resource carries many fields; we only require it be identifiable here.

const ItemSchema = z
  .object({
    id: z.string().regex(/^MAB-[0-9]+-[QOC]-\d{5}$/, "id must be MAB-<n>-<Q|O|C>-<5 digits>"),
    corpus_version: z.string().min(1),
    task_type: z.enum(["query", "order", "compute"]),
    prompt: z.string().min(1),
    ehr_seed: z.array(FhirResourceSchema),
    // The executable oracle script: what a CORRECT agent should do against the sandbox
    // (op + operands). The reference agent EXECUTES this (genuine sandbox work); the live
    // pipeline agent IGNORES it (it works from the NL prompt). Distinct from `expected`
    // (the correct RESULT) so task-success is a real comparison, not an echo.
    action_spec: z.object({ op: z.enum(["read_field", "age_at_least", "emit_order"]) }).passthrough(),
    expected: z.record(z.any()),
    invariant_asserts: z.array(z.string()),
    synthetic: z.literal(true),
    authored_by: z.string().min(1),
    attested_by: z.string().nullable(),
    provenance: z.string().min(1),
    notes: z.string(),
  })
  .strict()
  .superRefine((it, ctx) => {
    // A query/compute task with no EHR to read against is ill-formed.
    if ((it.task_type === "query" || it.task_type === "compute") && it.ehr_seed.length < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${it.task_type} task must seed >=1 ehr_seed resource` });
    }
    if (Object.keys(it.expected).length < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "expected must describe the correct action/answer" });
    }
  });

// Identical scoring-store firewall bar as the MIRAGE / MedProbe loaders.
const SCORING_PROVENANCE_RE = /(data\/cases|(^|[^0-9])1[0-3]_|_node\.json|ground_truth|symptom_links|management_plan|safety_netting|scoring[-_ ]?node)/i;

export function assertFirewall(item) {
  for (const [field, val] of [["provenance", item.provenance], ["prompt", item.prompt]]) {
    if (SCORING_PROVENANCE_RE.test(String(val))) {
      throw new Error(`FIREWALL: task ${item.id} ${field} references the sealed scoring store / case nodes — forbidden`);
    }
  }
}

/** Validate one task fully (schema + firewall). Throws with a precise message. */
export function validateTask(raw, whereLabel = "(inline)") {
  const parsed = ItemSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`task invalid in ${whereLabel} (${raw && raw.id}): ${issues}`);
  }
  const item = parsed.data;
  assertFirewall(item);
  return item;
}

/** Parse + validate one corpus file, returning its tasks. */
export function loadTaskFile(absPath) {
  const raw = JSON.parse(readFileSync(absPath, "utf8"));
  const itemsRaw = Array.isArray(raw) ? raw : raw.items;
  if (!Array.isArray(itemsRaw)) throw new Error(`corpus file ${absPath} has no items[]`);
  return itemsRaw.map((it) => validateTask(it, absPath));
}

/**
 * Load every *.corpus.json in the corpora dir, validate all tasks, and merge. Returns
 * { items, checksum, corpus_version, counts }.
 */
export function loadAllTasks(corporaDir) {
  const files = readdirSync(corporaDir).filter((f) => f.endsWith(".corpus.json")).sort();
  const items = [];
  const hash = createHash("sha256");
  for (const f of files) {
    const abs = join(corporaDir, f);
    hash.update(f + "\0" + readFileSync(abs, "utf8"));
    items.push(...loadTaskFile(abs));
  }
  const versions = new Set(items.map((i) => i.corpus_version));
  if (versions.size > 1) throw new Error(`corpus_version mismatch across files: ${[...versions].join(", ")}`);
  const corpus_version = [...versions][0] || "0.0.0";

  const counts = items.reduce(
    (acc, it) => {
      acc[it.task_type]++;
      if (it.attested_by != null) acc.attested++;
      else acc.unattested++;
      acc.total++;
      return acc;
    },
    { query: 0, order: 0, compute: 0, attested: 0, unattested: 0, total: 0 }
  );

  return { items, checksum: "sha256:" + hash.digest("hex"), corpus_version, counts, files };
}
