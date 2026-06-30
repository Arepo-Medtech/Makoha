/**
 * Contract tests for the medicolegal hashing + VerificationReport gate.
 * Asserts:
 *   - hashCandidateOutput: known SHA-256 vector, determinism, distinctness, format, throws on non-string.
 *   - validateReport: accepts a valid report; rejects missing/malformed hash and unknown keys.
 *   - end-to-end: runPipeline()'s report hash equals SHA-256 of the exact candidate output.
 * Run from repo root: node test/contract-verification-report.js
 */
import { hashCandidateOutput } from "../verification/hash.js";
import { validateReport } from "../verification/report-schema.js";
import { runPipeline } from "../verification/pipeline.js";

const KNOWN_EMPTY = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function validReport() {
  return {
    run_id: "run-12345678-abc",
    timestamp_utc: new Date().toISOString(),
    pass: true,
    results: [{ check: "no_invented_codes", passed: true }],
    missing_receipts: [],
    candidate_output_hash: "sha256:" + "a".repeat(64),
  };
}

function expectThrow(fn, label, errors) {
  try {
    fn();
    errors.push(`${label}: expected a throw, got none`);
  } catch (_) {
    /* expected */
  }
}

async function run() {
  const errors = [];

  // 1. hashCandidateOutput
  if (hashCandidateOutput("") !== KNOWN_EMPTY) errors.push('hash known vector sha256("") mismatch');
  if (hashCandidateOutput("abc") !== hashCandidateOutput("abc")) errors.push("hash not deterministic");
  if (hashCandidateOutput("abc") === hashCandidateOutput("abd")) errors.push("hash collision on distinct inputs");
  if (!/^sha256:[a-f0-9]{64}$/.test(hashCandidateOutput("hello"))) errors.push("hash format invalid");
  expectThrow(() => hashCandidateOutput(undefined), "hash(undefined)", errors);
  expectThrow(() => hashCandidateOutput(null), "hash(null)", errors);
  expectThrow(() => hashCandidateOutput({}), "hash(object)", errors);

  // 2. validateReport
  try {
    validateReport(validReport());
  } catch (e) {
    errors.push("valid report rejected: " + e.message);
  }
  expectThrow(() => {
    const { candidate_output_hash, ...noHash } = validReport();
    validateReport(noHash);
  }, "report missing hash", errors);
  expectThrow(() => validateReport({ ...validReport(), candidate_output_hash: "sha256:NOTHEX" }), "report malformed hash", errors);
  expectThrow(() => validateReport({ ...validReport(), unexpected_key: 1 }), "report unknown key", errors);

  // 3. End-to-end: persisted hash must equal SHA-256 of the exact candidate output.
  const result = await runPipeline({ candidate_output: "Trunk output: no diagnosis, no dosages." });
  const expected = hashCandidateOutput(result.output);
  if (result.verification.candidate_output_hash !== expected) {
    errors.push("pipeline report hash does not match SHA-256 of candidate output");
  }
  // and the report shape the writers persist must pass the gate
  try {
    validateReport({
      run_id: result.run_id,
      timestamp_utc: result.timestamp_utc,
      pass: result.verification.pass,
      results: result.verification.results,
      missing_receipts: result.verification.missing_receipts,
      candidate_output_hash: result.verification.candidate_output_hash,
    });
  } catch (e) {
    errors.push("pipeline report failed validateReport: " + e.message);
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-verification-report: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
