/**
 * Contract test: intake-concern classifier (verification/ppp-ttt/intake-concern.js),
 * Phase A of the intake escalation de-biasing. Proves the articulation contract's
 * classification and — critically — the fail-safe: an escalation we cannot
 * interrogate is HONOURED (broken → STOP), never silently downgraded.
 *
 * Run from repo root: node test/contract-intake-concern.js
 */
import { buildIntakeConcern, interrogateIntakeConcern } from "../verification/ppp-ttt/intake-concern.js";
import { ConcernVerdict } from "../verification/ppp-ttt/verdict-schema.js";

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

// ── Phase B: interrogateIntakeConcern → PPP-TTT verdict + disposition ─────────
const notEsc = interrogateIntakeConcern({ status: "clear" });
check(notEsc === null, "interrogate: non-escalate_now → null (nothing to interrogate)");

// grounded present danger sign (thunderclap SAH) → STOP → escalate_now, and it's a
// POSITIVELY-interrogated verdict (not a fail-closed default).
const iThunder = interrogateIntakeConcern({
  status: "escalate_now",
  danger_signs: [{ sign: "thunderclap-onset worst-ever headache", status: "present", evidence_ref: "case-1" }],
});
check(iThunder.verdict.tier === "STOP" && iThunder.disposition === "escalate_now", "interrogate: present thunderclap → STOP → escalate_now (genuine red stands)");
check(iThunder.verdict.fail_closed === false, "grounded STOP is positively interrogated (fail_closed:false)");
check(ConcernVerdict.safeParse(iThunder.verdict).success, "grounded verdict is a valid ConcernVerdict (composes through the frozen core)");

// present poor-perfusion → STOP.
const iPerf = interrogateIntakeConcern({
  status: "escalate_now",
  danger_signs: [{ sign: "cold clammy mottled skin", status: "present", evidence_ref: "case-3" }],
});
check(iPerf.verdict.tier === "STOP" && iPerf.disposition === "escalate_now", "interrogate: present poor-perfusion → STOP → escalate_now");

// severe pain, otherwise well (no present sign) → CAUTION → urgent_review (look closer).
const iSevere = interrogateIntakeConcern({
  status: "escalate_now",
  danger_signs: [{ sign: "severe pain", status: "inferred", evidence_ref: "case-2" }],
});
check(iSevere.verdict.tier === "CAUTION" && iSevere.disposition === "urgent_review", "interrogate: severe-pain-only (no present sign) → CAUTION → urgent_review (NOT 000)");
check(iSevere.verdict.fail_closed === true, "ungrounded CAUTION is the fail-safe default (fail_closed:true)");

// un-interrogable escalation (no danger_signs) → STOP → escalate_now (HONOURED).
const iBroken = interrogateIntakeConcern({ status: "escalate_now", reasons: ["acute emergency"] });
check(iBroken.verdict.tier === "STOP" && iBroken.disposition === "escalate_now", "interrogate: un-interrogable escalation → STOP → escalate_now (honoured, never downgraded)");
check(iBroken.verdict.fail_closed === true, "broken-instrument STOP is fail-closed");

// escalate_now with an explicitly EMPTY danger_signs[] → CAUTION (articulated nothing).
const iEmpty = interrogateIntakeConcern({ status: "escalate_now", danger_signs: [] });
check(iEmpty.verdict.tier === "CAUTION" && iEmpty.disposition === "urgent_review", "interrogate: empty danger_signs[] → CAUTION (escalated but articulated nothing present)");

// An intake escalation NEVER grades to GO (orange, never green).
for (const v of [iThunder, iPerf, iSevere, iBroken, iEmpty]) check(v.verdict.tier !== "GO", "intake interrogation never yields GO");

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-intake-concern: OK");
