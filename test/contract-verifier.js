/**
 * Contract tests for the verification layer (verification/verifier.js) — the five
 * deterministic hard checks. <test_and_evaluation_gates> requires deterministic
 * safety code to be tested. Each check gets: a clean PASS, a violation FAIL, and
 * the receipt/citation that flips FAIL -> PASS. Plus: verify() returns a valid
 * candidate_output_hash, and a runPipeline() integration asserts 5 results.
 *
 * These assert the CURRENT verifier contract; the verifier-hardening task extends
 * the verifier and these tests together.
 * Run from repo root: node test/contract-verifier.js
 */
import { verify } from "../verification/verifier.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
function check(label, cond) {
  if (!cond) errors.push(label);
}
const failed = (out, evidence, checkName) => {
  const r = verify(out, evidence).results.find((x) => x.check === checkName);
  return r && r.passed === false;
};
const passed = (out, evidence, checkName) => {
  const r = verify(out, evidence).results.find((x) => x.check === checkName);
  return r && r.passed === true;
};

// 1. no_invented_codes — codes across SNOMED/ICD-10-AM/ICD-11/LOINC/PBS need a receipt.
check("codes: clean output passes", passed("Triage only, no codes.", {}, "no_invented_codes"));
check("codes: code-like text without receipt fails", failed("SNOMED CT code: 22298006 assigned.", {}, "no_invented_codes"));
// true per-code binding: a receipt that validated THIS code flips it to pass
const term = (codes) => ({ terminology: [{ request_id: "t1", codes, mode: "mock" }] });
check("codes: matching validated code binds (pass)", passed("SNOMED CT code: 22298006 assigned.", term(["22298006"]), "no_invented_codes"));
check("codes: receipt for a DIFFERENT code does not bind (fail)", failed("SNOMED CT code: 22298006 assigned.", term(["999999"]), "no_invented_codes"));
check("codes: ICD-10-AM dotted binds when validated (pass)", passed("Diagnosis M54.5 documented.", term(["M54.5"]), "no_invented_codes"));
check("codes: LOINC binds when validated (pass)", passed("Result for 2160-0 pending.", term(["2160-0"]), "no_invented_codes"));
check("codes: PBS binds when validated (pass)", passed("PBS item 2622B supplied.", term(["2622B"]), "no_invented_codes"));
check("codes: PBS unbound without receipt (fail)", failed("PBS item 2622B supplied.", {}, "no_invented_codes"));
check("codes: ICD-11 coarse passes with a terminology receipt present", passed("ICD-11 code ME84.0 assigned.", { terminology_receipts: ["t1"] }, "no_invented_codes"));
// per-system detection (each fails without a receipt)
check("codes: bare SNOMED concept id fails", failed("Concept 22298006 noted.", {}, "no_invented_codes"));
check("codes: ICD-10-AM dotted fails", failed("Diagnosis M54.5 documented.", {}, "no_invented_codes"));
check("codes: ICD-11 (context) fails", failed("ICD-11 code ME84.0 assigned.", {}, "no_invented_codes"));
check("codes: LOINC dash-check fails", failed("Result for 2160-0 pending.", {}, "no_invented_codes"));
check("codes: PBS (context) fails", failed("PBS item 2622B supplied.", {}, "no_invented_codes"));
// false-positive GUARDS (no code → must PASS without a receipt)
check("codes FP: vitamin B12 passes", passed("Patient takes vitamin B12 daily.", {}, "no_invented_codes"));
check("codes FP: vitals number passes", passed("Blood pressure was 120 over 80.", {}, "no_invented_codes"));
check("codes FP: citation date passes", passed("Citation cw-au:imaging-lbp:2024-01 applies.", {}, "no_invented_codes"));
check("codes FP: weeks ago passes", passed("Seen 2 weeks ago, no red flags.", {}, "no_invented_codes"));
// bare long integers (reference/phone numbers) must NOT be flagged as SNOMED codes
check("codes FP: bare reference number passes", passed("Callback on reference 100000 in the file.", {}, "no_invented_codes"));
check("codes FP: phone number passes", passed("Call the clinic on 0731234567 if symptoms worsen.", {}, "no_invented_codes"));

// Mock-mode flagging + non-mock blocking.
{
  // mock context (default): mock receipt is flagged but still grounds.
  const mockEv = { terminology: [{ request_id: "t-mock", codes: ["22298006"], mode: "mock" }] };
  const vMock = verify("SNOMED 22298006 noted.", mockEv);
  check("mock: receipt flagged", Array.isArray(vMock.mock_receipt_flags) && vMock.mock_receipt_flags.includes("t-mock"));
  check("mock: code still binds (pass) in mock context", vMock.results.find((r) => r.check === "no_invented_codes").passed === true);

  // non-mock context: a mock-only receipt does NOT ground -> code blocked.
  const liveCtx = { ...mockEv, context_mode: "live", receipt_modes: [{ id: "t-mock", mode: "mock" }] };
  const vLive = verify("SNOMED 22298006 noted.", liveCtx);
  check("non-mock: mock-only code is blocked", vLive.results.find((r) => r.check === "no_invented_codes").passed === false);

  // non-mock context with a LIVE receipt grounds normally.
  const liveOk = { terminology: [{ request_id: "t-live", codes: ["22298006"], mode: "live" }], context_mode: "live", receipt_modes: [{ id: "t-live", mode: "live" }] };
  check("non-mock: live receipt grounds (pass)", verify("SNOMED 22298006 noted.", liveOk).results.find((r) => r.check === "no_invented_codes").passed === true);
}

// 2. no_invented_guidelines — guideline claim without a docs citation.
check("guidelines: clean output passes", passed("We discuss options with the patient.", {}, "no_invented_guidelines"));
check("guidelines: claim without citation fails", failed("Choosing Wisely recommends no imaging for back pain.", {}, "no_invented_guidelines"));
check("guidelines: citation flips to pass", passed("Choosing Wisely recommends no imaging for back pain.", { citations: ["cw-au:imaging-lbp:2024-01"] }, "no_invented_guidelines"));

// 3. no_invented_operations — IHI/lab/pharmacy/delivery claim without a live receipt.
check("operations: clean output passes", passed("No operational facts asserted.", {}, "no_invented_operations"));
check("operations: IHI claim without receipt fails", failed("The IHI is 8003 6080 0000 0000.", {}, "no_invented_operations"));
check("operations: live receipt flips to pass", passed("The IHI is 8003 6080 0000 0000.", { live_receipts: ["ihi-1"] }, "no_invented_operations"));

// 4. no_repo_invention — backtick-quoted service name not in the allowed registry.
check("repo: allowed service name passes", passed("Routed via `mcp-docs`.", {}, "no_repo_invention"));
check("repo: invented service name fails", failed("Routed via `totally-made-up-service`.", {}, "no_repo_invention"));

// 5. hard_stop_enforcement — HARD_FAIL/critical override without a hard_stop receipt.
check("hard_stop: clean output passes", passed("Continue with history taking.", {}, "hard_stop_enforcement"));
check("hard_stop: HARD_FAIL without receipt fails", failed("Pharmacology returned HARD_FAIL.", {}, "hard_stop_enforcement"));
check("hard_stop: hard_stop receipt flips to pass", passed("Pharmacology returned HARD_FAIL.", { hard_stop_receipt: "pharm-1" }, "hard_stop_enforcement"));

// verify() returns a valid medicolegal hash and an overall pass on clean output.
{
  const v = verify("A clean, grounded statement.", {});
  check("verify returns sha256 hash", /^sha256:[a-f0-9]{64}$/.test(v.candidate_output_hash));
  check("clean output overall pass", v.pass === true);
  check("results has exactly 5 checks", Array.isArray(v.results) && v.results.length === 5);
}

// A single failing check drives overall pass=false.
check("one failure => overall fail", verify("Choosing Wisely recommends no imaging.", {}).pass === false);

// C15/M7: every check result carries a severity label; the gate is unchanged
// (a failed check of ANY severity still fails pass — surfaced-but-gating).
{
  const sev = (out, ev, name) => (verify(out, ev).results.find((r) => r.check === name) || {}).severity;
  check("severity: no_invented_codes critical", sev("Triage only.", {}, "no_invented_codes") === "critical");
  check("severity: no_invented_operations critical", sev("Triage only.", {}, "no_invented_operations") === "critical");
  check("severity: hard_stop_enforcement critical", sev("Triage only.", {}, "hard_stop_enforcement") === "critical");
  check("severity: no_invented_guidelines fail", sev("Triage only.", {}, "no_invented_guidelines") === "fail");
  check("severity: no_repo_invention warning", sev("Triage only.", {}, "no_repo_invention") === "warning");
  // the C15 reconciliation: no_repo_invention is tagged warning BUT still gates.
  const inv = verify("Routed via `totally-made-up-service`.", {});
  const repo = inv.results.find((r) => r.check === "no_repo_invention");
  check("no_repo_invention: severity warning AND fails (surfaced-but-gating)", repo.severity === "warning" && repo.passed === false);
  check("no_repo_invention failure still drives overall pass=false", inv.pass === false);
  // every result carries a valid severity.
  check("all 5 results carry a severity", verify("Clean output.", {}).results.every((r) => ["critical", "fail", "warning"].includes(r.severity)));
}

// Integration: the pipeline runs all 5 checks and computes pass.
const result = await runPipeline({ candidate_output: "Based on the provided context, no diagnosis or dosages are given." });
check("pipeline returns 5 results", result.verification.results.length === 5);
check("pipeline pass is boolean", typeof result.verification.pass === "boolean");
check("pipeline result carries hash", /^sha256:[a-f0-9]{64}$/.test(result.verification.candidate_output_hash));

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-verifier: OK");
