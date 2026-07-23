/**
 * MedProbeBench scorer (Mechanical Inventory B2.1b) — the first-party citation-accountability
 * rubric. Mirrors the MIRAGE scorer contract: runMedProbe(adapter, corpus) -> a result with
 * per-item verdicts + the two rates + a benchmark_passed gate, over ATTESTED items only.
 *
 * Rubric:
 *   S (supported)          — PASS if the adapter returns "supported" (accept). RATE (soft).
 *   U (unsupported)        — PASS if the adapter FLAGS it (flag_unsupported). HARD gate.
 *   F (fabricated-citation)— PASS if the adapter FLAGS it (flag_fabricated). HARD gate.
 *
 * citation_accountability_rate = correct S / total attested S.
 * hallucination_catch_rate     = correctly-flagged (U + F) / total attested (U + F). HARD = 1.00.
 * benchmark_passed = attested S+U+F > 0 AND accountability_rate >= threshold AND catch_rate == 1.00.
 *
 * ATTESTED-ONLY (MIRAGE §7): an unattested item never gates. Benchmark-eligible is necessary,
 * not sufficient — this scorer NEVER sets any patient-eligibility flag.
 */
import { VERDICT_TO_EXPECTED } from "./adapter.js";

export const DEFAULT_THRESHOLD = 0.6;

/**
 * Score one adapter over a corpus.
 * @param {{verify:(claim:object)=>string, name?:string}} adapter
 * @param {{items:object[], evidence:object}} corpus
 * @param {{threshold?:number}} [opts]
 */
export function runMedProbe(adapter, corpus, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const items = (corpus.items || []).filter((it) => it.attested_by != null); // attested-only

  const per_item = items.map((it) => {
    const verdict = adapter.verify({ claim_ref: it.claim_ref, cited_evidence: it.cited_evidence });
    const mapped = VERDICT_TO_EXPECTED[verdict] || "(unknown)";
    return { id: it.id, partition: it.partition, expected: it.expected_verdict, verdict: mapped, correct: mapped === it.expected_verdict };
  });

  const sItems = per_item.filter((r) => r.partition === "S");
  const flagItems = per_item.filter((r) => r.partition === "U" || r.partition === "F");

  const citation_accountability_rate = sItems.length ? sItems.filter((r) => r.correct).length / sItems.length : null;
  const hallucination_catch_rate = flagItems.length ? flagItems.filter((r) => r.correct).length / flagItems.length : null;

  const counts = {
    total_attested: items.length,
    attested_S: sItems.length,
    attested_U: per_item.filter((r) => r.partition === "U").length,
    attested_F: per_item.filter((r) => r.partition === "F").length,
    unattested: (corpus.items || []).length - items.length,
  };

  // Gate: need attested evidence, S accountability at/above threshold, and EVERY U/F flagged.
  const benchmark_passed =
    items.length > 0 &&
    citation_accountability_rate !== null &&
    citation_accountability_rate >= threshold &&
    hallucination_catch_rate === 1;

  return {
    benchmark: "medprobe",
    adapter: adapter.name || "unnamed",
    threshold,
    citation_accountability_rate,
    hallucination_catch_rate,
    counts,
    per_item,
    benchmark_passed,
  };
}
