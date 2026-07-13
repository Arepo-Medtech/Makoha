/**
 * Contract test for MI-14 / MI-04 — Evidence Broker arbiter of model output (§5).
 *
 * Integration test against a REAL (mock-backed) Broker: a model claim with a
 * resolvable receipt is grounded; a receipt-less claim (unknown / preprint / openFDA)
 * is STRIPPED TO `unknown` and never asserted. composeArbitration folds this into
 * verification with monotone-AND — a stripped claim can only ADD a failure, never
 * rescue one, and leaves the five verifier checks untouched.
 * Run from repo root: node test/contract-evidence-arbiter.js
 */
import { createEvidenceBroker } from "../mcp/servers/knowledge/broker.js";
import { arbitrateModelClaims, composeArbitration } from "../integration/evidence-arbiter.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

async function main() {
  const broker = createEvidenceBroker();
  const claims = [
    { claim: "atorvastatin reduces cardiovascular events", query_intent: "CV benefit" }, // pubmed → grounded
    { claim: "unheard of miracle cure works", query_intent: "efficacy" },                // no source → unknown (E2)
    { claim: "novel biomarker predicts outcome (preprint)", query_intent: "prognosis" }, // preprint → unknown (E9)
    { claim: "drug adverse event frequency from us labels", query_intent: "safety" },    // openFDA → unknown (E10)
  ];

  const arb = await arbitrateModelClaims({ claims, broker });
  expect(arb.grounded.length === 1 && arb.grounded[0].claim.startsWith("atorvastatin"), "grounded: only the receipt-backed claim");
  expect(arb.grounded[0].receipt && arb.grounded[0].receipt.source_rank === 1, "grounded: carries a valid receipt");
  expect(arb.unknown.length === 3, "MI-04: the 3 receipt-less claims are stripped to unknown");
  expect(arb.unknown.every((u) => u.claim && u.reason), "unknown claims carry a reason");
  expect(arb.all_grounded === false && arb.receipts.length === 1, "all_grounded false; one grounding receipt");

  // composeArbitration — monotone-AND.
  const basePass = { pass: true, results: [{ check: "no_invented_codes", passed: true }], missing_receipts: [] };
  const composedFail = composeArbitration(basePass, arb);
  expect(composedFail.pass === false, "MI-04: a stripped-to-unknown claim forces verification pass=false");
  expect(composedFail.results.length === 1, "results (the five checks) left unchanged");
  expect(composedFail.missing_receipts.some((m) => /stripped to unknown/.test(m)), "stripped claims surfaced in missing_receipts");
  expect(composedFail.evidence_arbitration.all_grounded === false, "structured arbitration side-field present");

  // A fully-grounded set does not change a passing base.
  const groundedOnly = await arbitrateModelClaims({ claims: [claims[0]], broker });
  const composedPass = composeArbitration(basePass, groundedOnly);
  expect(composedPass.pass === true, "fully-grounded arbitration leaves a passing base passing");

  // NEVER rescues a failing base.
  const baseFail = { pass: false, results: [{ check: "x", passed: false }], missing_receipts: ["prior"] };
  const stillFail = composeArbitration(baseFail, groundedOnly);
  expect(stillFail.pass === false, "monotone: arbitration never rescues a failing base");

  if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-14 evidence-arbiter FAIL (${errors.length})`); process.exit(1); }
  console.log("MI-14 evidence-arbiter PASS");
  process.exit(0);
}

main().catch((e) => { console.error("MI-14 evidence-arbiter ERROR:", e); process.exit(1); });
