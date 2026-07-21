/**
 * eval-positional — long-list selection + the positional-stability BLOCKING
 * threshold for FL-40 (M3, operator ruling 2026-07-15).
 *
 * WHY (from the ruling): positional bias is a MODEL property — a transformer
 * over-attends the first/last items of a list and under-attends the middle
 * ("lost in the middle"), so the ORDER a differential/symptom list is presented
 * can change the model's ranking with no bedside equivalent and no reviewer able
 * to catch it. It is EVALUATION-ONLY (never runtime — a runtime flag has no
 * action since human review is always required) and measured PER MODEL.
 *
 * THE LOAD-BEARING REQUIREMENT: "an eval set of only typical-length cases would
 * certify stability on the EASY SHAPE and miss the failure." So the check runs
 * over cases with DELIBERATELY LONG lists — where the middle is genuinely
 * under-attended. A certifying run with NO long-list cases is a coverage
 * FAILURE, not a pass (overall 'not_applicable' does not certify).
 *
 * FIREWALL: node 10 is read HERE scorer-side for SELECTION (how many diagnoses)
 * and for the ranking vocabulary only — it is never injected. The permutation
 * packet is built from node 01 presentation facts (the firewall allow-list); the
 * sealed differential never enters the packet the model sees.
 */
import { contextInjection } from "./pipeline.js";
import { checkPositionalStability } from "./positional-stability.js";

/** Long-list threshold (eval-rubric §6, v0.1): a list is "long" at ≥ 8 items,
 *  where the middle is genuinely under-attended. Corpus scan (2026-07-20): 343
 *  of 709 attested cases qualify — the M3 coverage requirement is met. */
export const LONG_LIST_N = 8;

/** Count distinct diagnoses the model is expected to consider (node 10). */
export function differentialDxNames(groundTruth) {
  const set = new Set();
  for (const stage of groundTruth?.differential_progression || []) {
    for (const d of stage.differential || []) {
      if (d.should_be_considered && d.diagnosis) set.add(String(d.diagnosis).trim());
    }
  }
  return Array.from(set);
}

/** Long-list signals for one case (scorer-side). Qualifies when the disclosure
 *  list OR the differential is ≥ N — either is a long list the model must rank
 *  or attend to across. */
export function longListSignals(caseNodes, n = LONG_LIST_N) {
  const disclosure_count = (caseNodes.policy?.disclosure_items || []).length;
  const differential_count = differentialDxNames(caseNodes.ground_truth || {}).length;
  return {
    disclosure_count,
    differential_count,
    qualifies: disclosure_count >= n || differential_count >= n,
  };
}

/** Select the long-list subset from a list of loaded cases. */
export function selectLongListCases(caseNodesList, n = LONG_LIST_N) {
  return caseNodesList.filter((c) => longListSignals(c, n).qualifies);
}

/** Build a permutation packet from node 01 presentation ONLY (full history), so
 *  it carries a LONG facts list for the check to bite on. The sealed differential
 *  is NOT in it — it is the ranking vocabulary, applied scorer-side. */
export function buildPositionalPacket(caseNodes) {
  return contextInjection({}, [], {
    run_id: "positional",
    trunk_id: "9.0", // assessment trunk (not a blind trunk); may rank a differential
    mode: "mock",
    case_content: { "01_presentation_layer": caseNodes.presentation },
  });
}

/** Clinical ranking signal: the order the KNOWN differential diagnoses appear in
 *  the output. A merit-ranking model produces the same order regardless of input
 *  order; a position-riding model does not. dxNames come from node 10 scorer-side. */
export function rankByDifferential(dxNames) {
  return (output) => {
    const text = String(output ?? "").toLowerCase();
    return dxNames
      .map((dx) => ({ dx, at: text.indexOf(dx.toLowerCase()) }))
      .filter((x) => x.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((x) => x.dx);
  };
}

/**
 * Run the positional-stability check for one long-list case.
 * @param {object} caseNodes
 * @param {(p: object) => Promise<any>} generate - packet-only generator (replay-wrapped)
 * @param {object} [opts] - forwarded to checkPositionalStability
 * @returns {Promise<{case_id, verdict, reason?, permutations?}>}
 */
export async function runPositionalForCase(caseNodes, generate, opts = {}) {
  const case_id = caseNodes.envelope?.case_metadata?.case_id || caseNodes.presentation?.case_id || "UNKNOWN";
  const dxNames = differentialDxNames(caseNodes.ground_truth || {});
  const packet = buildPositionalPacket(caseNodes);
  const r = await checkPositionalStability(packet, generate, { rank: rankByDifferential(dxNames), ...opts });
  return { case_id, verdict: r.verdict, ...(r.reason ? { reason: r.reason } : {}), ...(r.permutations ? { permutations: r.permutations } : {}) };
}

/**
 * Aggregate per-case verdicts into the EvalRunReport positional_stability block.
 * Order of severity: any unstable → unstable; else any indeterminate →
 * indeterminate; else stable. Empty (no long-list cases) → not_applicable.
 */
export function aggregatePositional(results) {
  const long_list_case_ids = results.map((r) => r.case_id);
  if (!results.length) return { overall: "not_applicable", long_list_case_ids: [], results: [] };
  let overall = "stable";
  if (results.some((r) => r.verdict === "unstable")) overall = "unstable";
  else if (results.some((r) => r.verdict === "indeterminate")) overall = "indeterminate";
  return { overall, long_list_case_ids, results };
}

/**
 * The positional BLOCKING gate. A certifying run must have long-list coverage
 * AND survive it. unstable / indeterminate / not_applicable all block.
 * @returns {{ passes: boolean, reasons: string[] }}
 */
export function positionalGate(positional_stability) {
  const ps = positional_stability || {};
  const reasons = [];
  if (ps.overall === "unstable") {
    const n = (ps.results || []).filter((r) => r.verdict === "unstable").length;
    reasons.push(`RELEASE BLOCKED: positional instability on ${n} long-list case(s) — the model's ranking rode input ORDER, not clinical merit (M3, no bedside equivalent, invisible to reviewers)`);
  } else if (ps.overall === "indeterminate") {
    reasons.push("RELEASE BLOCKED: positional stability INDETERMINATE on a long-list case — the generator was non-deterministic, so bias cannot be attributed. Cannot certify what cannot be judged");
  } else if (ps.overall === "not_applicable") {
    reasons.push("RELEASE BLOCKED: no long-list cases in the run — the M3 coverage requirement is unmet; a typical-length-only set certifies the easy shape and misses positional bias");
  }
  return { passes: reasons.length === 0, reasons };
}
