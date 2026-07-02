/**
 * Contract tests for the mode-normaliser (verification/mode.js) — ARCH_PLAN C16 /
 * FMEA F4 (mode-flag leakage). <test_and_evaluation_gates> requires deterministic
 * safety code to be tested.
 *
 * Asserts, end to end:
 *   - env-name → enforcement mapping (mock/dry_run/staging/production/live);
 *   - DEFAULT-DENY: an unrecognised mode is treated as live (mock proof blocked);
 *   - verifier: mock receipts are BLOCKED in staging/production/live/unknown
 *     contexts and FLAGGED (not blocked) in mock/dry_run;
 *   - a live receipt still grounds in a staging context;
 *   - pipeline: HEYDOC_MODE_DEFAULT=staging yields an enum-valid packet mode
 *     ("live") and blocks mock-grounded codes;
 *   - ledger: recordRun under staging classifies the run NON-synthetic — output
 *     content is NOT persisted and content_persisted=false (mock-never-presented-
 *     as-live, no real-patient content persistence).
 * Uses a throwaway HEYDOC_DATA_DIR so the real .heydoc-data is untouched.
 * Run from repo root: node test/contract-mode-normaliser.js
 */
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { normaliseMode, ENFORCEMENT_MODES } from "../verification/mode.js";
import { verify } from "../verification/verifier.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
function check(label, cond) {
  if (!cond) errors.push(label);
}

// 1. Mapping table — env name → { context_mode, enforce_live }.
const expectMap = [
  ["mock", "mock", false],
  ["dry_run", "dry_run", false],
  ["staging", "live", true],
  ["production", "live", true],
  ["live", "live", true],
];
for (const [input, ctx, enforce] of expectMap) {
  const n = normaliseMode(input);
  check(`map: ${input} -> ${ctx}`, n.context_mode === ctx);
  check(`map: ${input} enforce_live=${enforce}`, n.enforce_live === enforce);
  check(`map: ${input} recognised`, n.recognised === true);
}

// Case/whitespace tolerance — an env var is operator-typed.
check("map: ' Staging ' -> live", normaliseMode(" Staging ").context_mode === "live");
check("map: 'PRODUCTION' enforces", normaliseMode("PRODUCTION").enforce_live === true);

// Absence keeps the documented dev default (HEYDOC_MODE_DEFAULT unset => mock).
for (const absent of [undefined, null, ""]) {
  const n = normaliseMode(absent);
  check(`absent (${String(absent)}) -> mock, not enforced`, n.context_mode === "mock" && n.enforce_live === false);
}

// DEFAULT-DENY: unrecognised mode strings are treated as live (mock proof blocked).
for (const unknown of ["prod", "development", "test", "Live!"]) {
  const n = normaliseMode(unknown);
  check(`default-deny: '${unknown}' -> live`, n.context_mode === "live");
  check(`default-deny: '${unknown}' enforces`, n.enforce_live === true);
  check(`default-deny: '${unknown}' marked unrecognised`, n.recognised === false);
}

// Output is always enum-valid for the receipt/packet/ledger contracts.
for (const input of ["mock", "dry_run", "staging", "production", "live", "garbage", undefined]) {
  check(`enum-valid for '${String(input)}'`, ENFORCEMENT_MODES.includes(normaliseMode(input).context_mode));
}

// 2. Verifier enforcement — mock-only terminology proof for a coded output.
const codeOut = "SNOMED 22298006 noted.";
const mockProof = {
  terminology: [{ request_id: "t-mock", codes: ["22298006"], mode: "mock" }],
  receipt_modes: [{ id: "t-mock", mode: "mock" }],
};
const codeCheck = (ctx) =>
  verify(codeOut, { ...mockProof, ...(ctx === undefined ? {} : { context_mode: ctx }) }).results.find((r) => r.check === "no_invented_codes");

// Blocked: staging, production, live, and an unrecognised mode (default-deny).
for (const ctx of ["staging", "production", "live", "prod"]) {
  check(`verifier: mock proof BLOCKED in '${ctx}'`, codeCheck(ctx).passed === false);
}
// Flagged, not blocked: mock, dry_run, and absent (dev default).
for (const ctx of ["mock", "dry_run", undefined]) {
  const v = verify(codeOut, { ...mockProof, ...(ctx === undefined ? {} : { context_mode: ctx }) });
  check(`verifier: mock proof grounds in '${String(ctx)}'`, v.results.find((r) => r.check === "no_invented_codes").passed === true);
  check(`verifier: mock proof still FLAGGED in '${String(ctx)}'`, v.mock_receipt_flags.includes("t-mock"));
}
// A live receipt grounds normally in a staging context.
const liveProof = {
  terminology: [{ request_id: "t-live", codes: ["22298006"], mode: "live" }],
  receipt_modes: [{ id: "t-live", mode: "live" }],
  context_mode: "staging",
};
check("verifier: live receipt grounds in staging", verify(codeOut, liveProof).results.find((r) => r.check === "no_invented_codes").passed === true);

// 3. Pipeline integration — HEYDOC_MODE_DEFAULT=staging on the stub (all-mock) path.
const savedMode = process.env.HEYDOC_MODE_DEFAULT;
try {
  process.env.HEYDOC_MODE_DEFAULT = "staging";
  // The stub terminology receipt validates 279039003 in mode "mock": binds in a
  // mock context, must be BLOCKED in staging (mock proof dropped).
  const staged = await runPipeline({ candidate_output: "SNOMED code: 279039003 assigned." });
  check("pipeline(staging): packet mode is enum-valid 'live'", staged.packet.mode === "live");
  check("pipeline(staging): mock-grounded code blocked", staged.verification.results.find((r) => r.check === "no_invented_codes").passed === false);
  check("pipeline(staging): mock receipts flagged", staged.verification.mock_receipt_flags.length > 0);

  process.env.HEYDOC_MODE_DEFAULT = "mock";
  const mocked = await runPipeline({ candidate_output: "SNOMED code: 279039003 assigned." });
  check("pipeline(mock): packet mode 'mock'", mocked.packet.mode === "mock");
  check("pipeline(mock): mock-grounded code binds", mocked.verification.results.find((r) => r.check === "no_invented_codes").passed === true);

  // 4. Ledger classification — staging is NOT synthetic: content not persisted.
  process.env.HEYDOC_DATA_DIR = mkdtempSync(join(tmpdir(), "heydoc-mode-"));
  const { recordRun, readLedger, readContent } = await import("../verification/audit-store.js");

  process.env.HEYDOC_MODE_DEFAULT = "staging";
  const stagedRun = await runPipeline({ candidate_output: "Clean grounded statement, no codes." });
  recordRun(stagedRun, { trunkId: "2.0", sessionRef: "enc-test-mode" });
  const entry = readLedger().at(-1);
  check("ledger(staging): mode recorded as 'live'", entry.mode === "live");
  check("ledger(staging): content_persisted=false", entry.content_persisted === false);
  check("ledger(staging): output content NOT in content store", !readContent(stagedRun.verification.candidate_output_hash));

  process.env.HEYDOC_MODE_DEFAULT = "mock";
  const mockRun = await runPipeline({ candidate_output: "Clean grounded statement, no codes." });
  recordRun(mockRun, { trunkId: "2.0", sessionRef: "enc-test-mode" });
  const mockEntry = readLedger().at(-1);
  check("ledger(mock): mode recorded as 'mock'", mockEntry.mode === "mock");
  check("ledger(mock): synthetic content persisted", mockEntry.content_persisted === true);
} finally {
  if (savedMode === undefined) delete process.env.HEYDOC_MODE_DEFAULT;
  else process.env.HEYDOC_MODE_DEFAULT = savedMode;
}

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-mode-normaliser: OK");
