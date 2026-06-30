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

// 1. no_invented_codes — SNOMED/ICD code without a terminology receipt.
check("codes: clean output passes", passed("Triage only, no codes.", {}, "no_invented_codes"));
check("codes: code-like text without receipt fails", failed("SNOMED CT code: 22298006 assigned.", {}, "no_invented_codes"));
check("codes: terminology receipt flips to pass", passed("SNOMED CT code: 22298006 assigned.", { terminology_receipts: ["term-1"] }, "no_invented_codes"));

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
