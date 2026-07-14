/**
 * Contract test for FL-30 Step 5 validation (test/ wraps the harness as a permanent gate).
 *
 * Asserts the staging-validation guarantees hold on every run:
 *  - every case passes (representative cases match expected outcome; adversarial cases fail
 *    safe to human escalation with no dose);
 *  - A/B parity: datastore + mock-only sources both produce contract-valid PharmChecks;
 *  - gate integrity: no dose ever rides a HARD_FAIL/BLOCKED result (human-review gate intact);
 *  - the licensed-feed stub stays unavailable (fail-closed).
 * Run from repo root: node test/contract-pharm-validation.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runValidation } from "../scripts/pharm-validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(join(__dirname, "..", "eval", "pharmacology", "validation-cases.json"), "utf8"));

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

const { results, summary } = runValidation(cases);

for (const r of results) if (!r.pass) errors.push(`case ${r.id}: ${r.problems.join("; ")}`);

expect(summary.total >= 18, `expected >=18 validation cases, got ${summary.total}`);
expect(summary.failed === 0, `${summary.failed} validation case(s) failed`);
expect(summary.adversarial_total >= 8, "expected >=8 adversarial cases");
expect(summary.adversarial_fail_safe === summary.adversarial_total, "every adversarial case must fail safe");
expect(summary.ab_parity_all_contract_valid === true, "A/B parity: all outputs must be contract-valid");
expect(summary.gate_integrity_no_bypass === true, "gate integrity: no dose may ride a blocked/hard-fail result");
expect(summary.licensed_stub_unavailable === true, "licensed-feed stub must be unavailable (fail-closed)");
expect(summary.datastore_backed === true, "engine must be driving off the signed datastore");
// The self-build is NOT patient-facing until Step-5-validated; receipts must not claim 'live'.
expect(summary.receipt_mode === "mock", "receipt mode must stay 'mock' until validation flips it (no mock-as-live)");

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-pharm-validation FAIL (${errors.length})`);
  process.exit(1);
}
console.log(`contract-pharm-validation: OK (${summary.passed}/${summary.total}, adversarial ${summary.adversarial_fail_safe}/${summary.adversarial_total})`);
