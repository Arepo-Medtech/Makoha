/**
 * Integrity detectors — public entry (FLOW_PLAN H2, #8 medsci-skills PATTERN-LIFT).
 *
 * These machine-decided checks STRENGTHEN verifier.js (ARCH C1) WITHOUT touching
 * it: verifier.js is frozen (RETAIN). The composition is monotone — it can only
 * add failure reasons, never remove one — so C1 is strengthened and never
 * loosened. Wired at the single verify() call site in verification/pipeline.js.
 *
 * IMPORTANT — no report-schema churn. verification/report-schema.js pins
 * results[].check to the FIVE fixed verifier check names, and validateReport()
 * runs in BOTH verification/run.js and integration/trunk-pipeline.js. So detector
 * outcomes MUST NOT be pushed into `results[]`. combineVerification() therefore:
 *   - leaves `results` = the five verifier checks, UNCHANGED (report stays valid);
 *   - folds the detectors' verdict into `pass` (monotone AND);
 *   - records detector failure reasons in `missing_receipts` (surfaced in the
 *     report + evidence_tree without a schema change);
 *   - exposes the structured detector results on a NEW in-memory field
 *     `integrity_detectors` (never passed to validateReport by the named-field
 *     report builders, so it cannot break the .strict() report gate).
 */
import { DETECTORS } from "./detectors.js";

/**
 * Run every detector over the output. Pure. Returns the aggregate verdict and the
 * per-detector results (verifier-shaped: { detector, passed, severity, reason? }).
 * @param {string} output
 * @param {object} [evidence]
 * @returns {{ passed: boolean, results: Array<{detector:string,passed:boolean,severity:string,reason?:string}> }}
 */
export function runDetectors(output, evidence = {}) {
  const results = DETECTORS.map((fn) => fn(String(output == null ? "" : output), evidence));
  return { passed: results.every((r) => r.passed), results };
}

/**
 * Compose a base verify() result with detector results — MONOTONE AND. The gate
 * can only become stricter: a detector failure fails the output; a detector can
 * never rescue an output the verifier already failed.
 *
 * @param {{pass:boolean, results:Array, missing_receipts:string[], candidate_output_hash:string, mock_receipt_flags:string[]}} base
 *        the object returned by verifier.verify()
 * @param {{passed:boolean, results:Array}} detectorOutcome  from runDetectors()
 * @returns {object} a verification object of the SAME shape as `base`, plus
 *   `integrity_detectors`, with `pass` and `missing_receipts` strengthened.
 */
export function combineVerification(base, detectorOutcome) {
  const det = detectorOutcome || { passed: true, results: [] };
  const failed = det.results.filter((r) => !r.passed);
  const detectorMisses = failed.map(
    (r) => `integrity detector "${r.detector}" [${r.severity}] failed: ${r.reason || "violation detected"}`
  );
  return {
    ...base,
    // results stays EXACTLY the five verifier checks — report schema unchanged.
    results: base.results,
    // Monotone: strengthen only. base.pass AND all detectors pass.
    pass: base.pass && det.passed,
    // Surface detector failures in the medicolegal record without schema churn.
    missing_receipts: [...(base.missing_receipts || []), ...detectorMisses],
    // Structured detector outcomes for callers/tests; NOT written to the report by
    // the named-field builders (run.js / trunk-pipeline.js).
    integrity_detectors: det.results,
  };
}

export { DETECTORS };
