/**
 * Contract test: integrity detectors (FLOW_PLAN H2, #8 medsci-skills pattern-lift)
 * and their composition with the frozen verifier.
 *
 * Proves the detectors STRENGTHEN verifier.js (ARCH C1) and NEVER loosen it:
 *  - each detector fires on its violation fixture and passes clean/grounded prose;
 *  - combineVerification is a MONOTONE AND — a detector failure fails a passing
 *    base; a detector can never rescue a failing base;
 *  - the composed `results` array is EXACTLY the five verifier checks, so the
 *    VerificationReport contract (report-schema.js) still validates;
 *  - the pipeline's clean stub output passes all detectors (no regression).
 *
 * Run from repo root: node test/contract-integrity-detectors.js
 */
import {
  runDetectors,
  combineVerification,
  DETECTORS,
} from "../verification/integrity-detectors/index.js";
import {
  advisoryDoseLeak,
  fabricatedCitationMarker,
  unsupportedStatistic,
  overconfidentDiagnosis,
} from "../verification/integrity-detectors/detectors.js";
import { verify } from "../verification/verifier.js";
import { validateReport } from "../verification/report-schema.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

// ── 1. Per-detector: fires on violation, passes on clean/grounded ──────────────

// advisory_dose_leak — advisory framing + a dosing instruction is a leak.
check(!advisoryDoseLeak("Advisory: give ibuprofen 400 mg three times daily.").passed,
  "advisory_dose_leak should FIRE on advisory text carrying a dosing instruction");
check(advisoryDoseLeak("Advisory: an interaction between warfarin and NSAIDs increases bleeding risk.").passed,
  "advisory_dose_leak should PASS advisory text with no dosing instruction");
check(advisoryDoseLeak("No diagnosis or dosages are given.").passed,
  "advisory_dose_leak should PASS the disclaimer 'no dosages are given' (no number+unit+frequency)");

// fabricated_citation_marker — DOI/PMID with no grounding fails; grounded passes.
check(!fabricatedCitationMarker("This is supported by PMID: 31234567.", {}).passed,
  "fabricated_citation_marker should FIRE on a PMID with no grounding");
check(!fabricatedCitationMarker("See doi:10.1000/xyz123 for details.", {}).passed,
  "fabricated_citation_marker should FIRE on a DOI with no grounding");
check(fabricatedCitationMarker("Supported by PMID: 31234567.", { citations: ["cw-au:x:2024-01"] }).passed,
  "fabricated_citation_marker should PASS when a citation is present in evidence");
check(fabricatedCitationMarker("No identifiers here at all.", {}).passed,
  "fabricated_citation_marker should PASS clean prose");

// unsupported_statistic — a stat with no grounding fails; grounded passes.
check(!unsupportedStatistic("About 40% of patients respond.", {}).passed,
  "unsupported_statistic should FIRE on an ungrounded percentage");
check(!unsupportedStatistic("Roughly 1 in 5 cases recur.", {}).passed,
  "unsupported_statistic should FIRE on an ungrounded 'N in M' statistic");
check(unsupportedStatistic("About 40% of patients respond.", { live_receipts: ["evfp-1-abcd234"] }).passed,
  "unsupported_statistic should PASS when a receipt grounds the claim");

// overconfident_diagnosis — definitive diagnostic language (warning severity).
const odFail = overconfidentDiagnosis("This is definitely the diagnosis of appendicitis.");
check(!odFail.passed && odFail.severity === "warning",
  "overconfident_diagnosis should FIRE (severity warning) on definitive diagnostic language");
check(overconfidentDiagnosis("The provisional impression may be consistent with low back pain.").passed,
  "overconfident_diagnosis should PASS provisional language");

// Every detector returns the verifier-shaped record.
for (const fn of DETECTORS) {
  const r = fn("some output", {});
  check(typeof r.detector === "string" && typeof r.passed === "boolean" && ["critical", "fail", "warning"].includes(r.severity),
    `detector ${fn.name} must return { detector, passed, severity }`);
}

// ── 2. runDetectors aggregate ──────────────────────────────────────────────────
const cleanAgg = runDetectors("A grounded, code-free, dose-free statement.", { citations: ["cw-au:x:2024-01"] });
check(cleanAgg.passed === true && cleanAgg.results.length === DETECTORS.length,
  "runDetectors should PASS clean grounded output and return one result per detector");
const dirtyAgg = runDetectors("Advisory: take paracetamol 1 g four times daily.", {});
check(dirtyAgg.passed === false, "runDetectors should FAIL when any detector fires");

// ── 3. combineVerification is a MONOTONE AND ────────────────────────────────────
const passingBase = { pass: true, results: [{ check: "no_invented_codes", passed: true, severity: "critical" }], missing_receipts: [], candidate_output_hash: "sha256:" + "0".repeat(64), mock_receipt_flags: [] };
const failingBase = { pass: false, results: [{ check: "no_invented_codes", passed: false, severity: "critical", reason: "x" }], missing_receipts: ["boom code"], candidate_output_hash: "sha256:" + "1".repeat(64), mock_receipt_flags: [] };

// (a) detector failure fails a passing base (strengthen).
const c1 = combineVerification(passingBase, { passed: false, results: [{ detector: "advisory_dose_leak", passed: false, severity: "critical", reason: "leak" }] });
check(c1.pass === false, "combineVerification: a detector failure MUST fail a passing base (strengthen)");
check(c1.results === passingBase.results && c1.results.length === 1,
  "combineVerification: results must stay EXACTLY the verifier checks (not gain detector entries)");
check(c1.missing_receipts.some((m) => m.includes("advisory_dose_leak")),
  "combineVerification: a detector failure reason must be recorded in missing_receipts");
check(Array.isArray(c1.integrity_detectors) && c1.integrity_detectors.length === 1,
  "combineVerification: structured detector results must be exposed on integrity_detectors");
check(c1.candidate_output_hash === passingBase.candidate_output_hash,
  "combineVerification: candidate_output_hash must be preserved");

// (b) a passing detector set NEVER rescues a failing base.
const c2 = combineVerification(failingBase, { passed: true, results: [] });
check(c2.pass === false, "combineVerification: passing detectors MUST NOT rescue a failing base (monotone)");

// (c) both passing => pass true, results unchanged.
const c3 = combineVerification(passingBase, { passed: true, results: [] });
check(c3.pass === true && c3.results.length === 1, "combineVerification: both passing => pass true, results unchanged");

// ── 4. Composed report still validates against report-schema.js ────────────────
const cleanOutput = "Based on the provided context (citation: cw-au:imaging-lbp:2024-01), we do not recommend imaging for non-specific low back pain without red flags. No diagnosis or dosages are given.";
const baseVer = verify(cleanOutput, { citations: ["cw-au:imaging-lbp:2024-01"] });
const combined = combineVerification(baseVer, runDetectors(cleanOutput, { citations: ["cw-au:imaging-lbp:2024-01"] }));
check(combined.pass === baseVer.pass && combined.pass === true,
  "regression: the pipeline's clean stub output must PASS the verifier AND all detectors");
try {
  validateReport({
    run_id: "test-run-001",
    timestamp_utc: new Date().toISOString(),
    pass: combined.pass,
    results: combined.results, // the five checks — must stay report-valid
    missing_receipts: combined.missing_receipts,
    candidate_output_hash: combined.candidate_output_hash,
    mock_receipt_flags: combined.mock_receipt_flags,
  });
} catch (e) {
  errors.push("composed verification must build a schema-valid VerificationReport: " + (e && e.message));
}

// ── 5. A dose-leaking output is BLOCKED by the composed gate ────────────────────
const leaky = "Advisory guideline: give amoxicillin 500 mg three times daily.";
const combinedLeaky = combineVerification(verify(leaky, {}), runDetectors(leaky, {}));
check(combinedLeaky.pass === false, "a dose-leaking advisory output MUST be blocked by the composed gate");

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-integrity-detectors: OK");
