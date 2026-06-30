/**
 * Contract tests for the Trunk 8.0 pharmacology firewall wiring.
 * Asserts: a HARD_FAIL blocks continuation (no override) and is receipt-backed so
 * verifier check 5 passes (legitimate, not invented); a HARD_FAIL claimed WITHOUT a
 * firewall receipt fails check 5 (invented hard-stop); PASS does not block;
 * no-intent -> BLOCKED_NO_PROOF + blocked but grounding-passes (the honest stub);
 * the PharmCheck receipt is recorded in the packet.
 * Run from repo root: node test/contract-firewall.js
 */
import { runTrunkWithGrounding } from "../integration/trunk-pipeline.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };
const intent = (over = {}) => ({ intent_id: "int-1", session_ref: "enc-stub-008", intent_type: "new_prescription", drug_intent: { drug_name: "oxycodone", drug_class: "opioid" }, patient_facts_ref: {}, mode: "mock", ...over });
const run = (opts) => runTrunkWithGrounding("8.0", "pain meds?", { sessionRef: "enc-stub-008", writeArtifacts: false, ...opts });
const check5 = (r) => r.verification.results.find((x) => x.check === "hard_stop_enforcement").passed;

async function main() {
  // HARD_FAIL (oxycodone, no PDMP) — output references HARD_FAIL.
  const hf = await run({ candidateOutput: "firewall_status: HARD_FAIL. Firewall blocks continuation. No diagnosis or dosages.", pharmIntent: intent(), resolvedFacts: { allergens: [], current_medications: [] } });
  check("HARD_FAIL: firewall_status HARD_FAIL", hf.firewall_status === "HARD_FAIL");
  check("HARD_FAIL: continuation blocked (no override)", hf.continuation_blocked === true);
  check("HARD_FAIL: hard_stops populated", (hf.report.hard_stops || []).length > 0 && hf.report.overall_severity === "critical");
  check("HARD_FAIL: receipt-backed -> check 5 passes", check5(hf) === true);
  check("HARD_FAIL: PharmCheck receipt recorded in packet", hf.packet.receipts.some((x) => x.request_id.startsWith("pharmchk-")));

  // Invented HARD_FAIL: output claims HARD_FAIL but no firewall ran -> no receipt -> check 5 FAILS.
  const invented = await run({ candidateOutput: "firewall_status: HARD_FAIL (asserted by the model with no firewall receipt)." });
  check("invented HARD_FAIL -> check 5 fails", check5(invented) === false);

  // PASS — does not block.
  const pass = await run({ candidateOutput: "firewall_status: PASS. Proceed with caution.", pharmIntent: intent({ drug_intent: { drug_name: "amoxicillin", drug_class: "penicillin" } }), resolvedFacts: { allergens: ["paracetamol"], current_medications: ["paracetamol"] } });
  check("PASS: firewall_status PASS", pass.firewall_status === "PASS");
  check("PASS: continuation not blocked", pass.continuation_blocked === false);

  // No intent (the stub case): BLOCKED_NO_PROOF, blocked, but grounding-passes.
  const noIntent = await run({ candidateOutput: "firewall_status: BLOCKED_NO_PROOF. No diagnosis or dosages." });
  check("no-intent: BLOCKED_NO_PROOF", noIntent.firewall_status === "BLOCKED_NO_PROOF");
  check("no-intent: continuation blocked", noIntent.continuation_blocked === true);
  check("no-intent: grounding still passes", noIntent.pass === true);

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-firewall: OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
