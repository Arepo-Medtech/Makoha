/**
 * Contract test: intake-concern classifier (verification/ppp-ttt/intake-concern.js),
 * Phase A of the intake escalation de-biasing. Proves the articulation contract's
 * classification and — critically — the fail-safe: an escalation we cannot
 * interrogate is HONOURED (broken → STOP), never silently downgraded.
 *
 * Run from repo root: node test/contract-intake-concern.js
 */
import { buildIntakeConcern } from "../verification/ppp-ttt/intake-concern.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

// 1. Not an escalate_now → nothing to interrogate.
check(buildIntakeConcern({ status: "clear" }) === null, "clear → null (nothing to interrogate)");
check(buildIntakeConcern({ status: "blocked_incomplete" }) === null, "blocked_incomplete → null");
check(buildIntakeConcern(undefined) === null, "undefined safety_gate → null");

// 2. GROUNDED: ≥1 present demonstrable danger sign → honour (STOP).
const grounded = buildIntakeConcern({
  status: "escalate_now",
  danger_signs: [
    { sign: "thunderclap-onset worst-ever headache", status: "present", evidence_ref: "case-1" },
    { sign: "photophobia", status: "unknown", evidence_ref: "" },
  ],
});
check(grounded && grounded.grounded === true && grounded.broken === false, "≥1 present sign → grounded, not broken (honour/STOP)");
check(grounded.present.length === 1 && grounded.unresolved.length === 1, "grounded concern partitions present vs unresolved");

// 3. UNGROUNDED (clean): danger_signs emitted but NONE present → interrogate → CAUTION.
const ungrounded = buildIntakeConcern({
  status: "escalate_now",
  danger_signs: [
    { sign: "severe pain", status: "inferred", evidence_ref: "case-2" },
    { sign: "feels it is worsening", status: "unknown", evidence_ref: "case-2" },
  ],
});
check(ungrounded && ungrounded.grounded === false && ungrounded.broken === false, "escalate_now with only inferred/unknown signs → NOT grounded, NOT broken (interrogate → CAUTION)");
check(ungrounded.present.length === 0 && ungrounded.unresolved.length === 2, "ungrounded: no present signs, all unresolved");

// 4. FAIL-SAFE — un-interrogable escalations are HONOURED (broken → STOP), never downgraded.
const absent = buildIntakeConcern({ status: "escalate_now", reasons: ["acute cardiac emergency"] });
check(absent && absent.broken === true && absent.grounded === false, "escalate_now with NO danger_signs → broken (HONOUR the escalation, never downgrade an un-interrogable emergency)");
const malformedShape = buildIntakeConcern({ status: "escalate_now", danger_signs: "call 000" });
check(malformedShape && malformedShape.broken === true, "escalate_now with non-array danger_signs → broken (fail-closed)");
const malformedItem = buildIntakeConcern({
  status: "escalate_now",
  danger_signs: [{ sign: "poor perfusion", status: "definitely" }], // invalid status
});
check(malformedItem && malformedItem.broken === true, "escalate_now with an invalid danger_sign.status → broken (fail-closed)");
const emptySign = buildIntakeConcern({
  status: "escalate_now",
  danger_signs: [{ sign: "   ", status: "present", evidence_ref: "x" }], // empty sign text
});
check(emptySign && emptySign.broken === true, "escalate_now with a blank sign string → broken (fail-closed)");

// 5. A mixed list with a present sign is GROUNDED even alongside malformed-looking prose,
//    as long as every item is well-typed (the malformed guard is structural, not semantic).
const mixed = buildIntakeConcern({
  status: "escalate_now",
  danger_signs: [
    { sign: "cold clammy mottled skin", status: "present", evidence_ref: "case-3" },
    { sign: "reduced urine output", status: "inferred", evidence_ref: "case-3" },
  ],
});
check(mixed.grounded === true && mixed.broken === false, "one present + one inferred → grounded (the present sign carries it)");

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-intake-concern: OK");
