/**
 * Contract test: PPP-TTT Step 1 (veracity interrogation) + Step 2 (ABCDE)
 * across the plan's edge-case table (PPP-TTT-PLAN §6).
 *
 * Proves:
 *  - always_immediate / safeguarding_always_report → STOP, no interrogation;
 *  - CAUTION is reachable ONLY from the one legitimate branch (all attested
 *    stigmata absent + stable refer_if pattern present);
 *  - every default-deny branch (unknown answer, unanswered discriminator,
 *    off-registry area/condition, managed-only condition, malformed input)
 *    yields fail-closed STOP;
 *  - multi-flag runs take the ordinal MAX (never an average);
 *  - the ABCDE protocol: bounded patient choice subordinate to sign-off,
 *    decline → refer (no autonomous continuation), red flag mid-ABCDE → STOP;
 *  - the record is self-describing, Digital-Tablet-tagged, schema-valid, and
 *    never carries a patient_eligible field.
 *
 * Run from repo root: node test/contract-ppp-ttt.js
 */
import { gradeConcern, buildAbcdeRecord } from "../verification/ppp-ttt/index.js";
import { validateAbcdeRecord } from "../verification/ppp-ttt/abcde-schema.js";
import { validateStep1Verdict } from "../verification/ppp-ttt/verdict-schema.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

// ── Fixtures (real attested scope-registry v1.3.0 entries) ─────────────────────
const PYELO = { source: "trunk_9.0", area_id: "uti", condition: "Pyelonephritis" };
const ECTOPIC = { source: "trunk_1.0", area_id: "uti", condition: "Ectopic pregnancy" };
const NAI = { source: "trunk_6.0", area_id: "minor_wound", condition: "Non-accidental injury" };

/** All 9 universal-override + all 5 pyelonephritis stigmata answered. */
function pyeloAnswers(stigma, refer) {
  const a = {};
  for (let i = 1; i <= 9; i++) a[`uhao-${i}`] = stigma;
  for (let i = 1; i <= 5; i++) a[`pyelonephritis-cs-${i}`] = stigma;
  a["pyelonephritis-refer-1"] = refer;
  return a;
}

// ── Edge 8: always_immediate → STOP, no interrogation, none can clear it ───────
const stopAlways = gradeConcern({ flags: [ECTOPIC], patient_answers: pyeloAnswers("absent", "absent") });
check(stopAlways.tier === "STOP" && stopAlways.tier_model === "always_immediate",
  "always_immediate condition must STOP regardless of answers");
check(stopAlways.discriminators_asked.length === 0, "always_immediate asks no discriminating questions");
check(stopAlways.reasons_if_blocking.some((r) => r.includes("escalate_now")),
  "a STOP must carry the literal escalate_now token (Seam B: the untouched sequencer halts on it)");
check(stopAlways.abcde === undefined, "ABCDE must never run under STOP");

// ── Edge 9: safeguarding_always_report → STOP-class + mandatory report ─────────
const nai = gradeConcern({ flags: [NAI] });
check(nai.tier === "STOP" && nai.tier_model === "safeguarding_always_report",
  "safeguarding_always_report must be a STOP-class verdict");
check(nai.concerns[0].mandatory_report === true, "safeguarding verdict must carry mandatory_report:true");

// ── Edge 1: red-herring flag (all discriminators negative) → GO ────────────────
const go = gradeConcern({ flags: [PYELO], patient_answers: pyeloAnswers("absent", "absent") });
check(go.tier === "GO", "a flag with every attested discriminator absent must be interrogated away to GO");
check(go.entity_class === "differential_only", "a cleared flag is differential_only");
check(go.discriminators_asked.length === 15, "GO must record all 15 asked discriminators (9 uhao + 5 cs + 1 refer) so the audit shows WHY it cleared");
check(go.reasons_if_blocking.length === 0, "GO produces no blocking reasons");

// ── The one legitimate CAUTION branch: stigmata absent, stable form present ────
const caution = gradeConcern({
  flags: [PYELO],
  patient_answers: pyeloAnswers("absent", "present"),
  abcde_input: { patient_decision: "proceed" },
});
check(caution.tier === "CAUTION", "stigmata absent + refer_if present must yield CAUTION");
check(caution.abcde !== undefined, "CAUTION must run the ABCDE protocol");
if (caution.abcde) {
  check(caution.abcde.A_plausible_passage.graded_verdict === "plausibly_safe",
    "A-PP: all stigmata absent → plausibly_safe");
  check(caution.abcde.B_balance.pathway === "continue_with_safety_net",
    "B-PP: informed proceed decision → continue_with_safety_net");
  check(caution.abcde.C_caveats.no_diagnosis === true && caution.abcde.C_caveats.no_decisions === true,
    "C-PP: the fixed 'No diagnosis / No decisions' declarations must be surfaced");
  check(caution.abcde.D_pitfalls.safety_net.length >= 1 && caution.abcde.D_pitfalls.safety_net[0].watch_for.length >= 1,
    "D-PP: a CAUTION must produce a non-empty safety-net descriptor list");
  check(caution.abcde.D_pitfalls.safety_net.every((s) => !("content" in s)) &&
    caution.abcde.D_pitfalls.safety_net.every((s) => s.tier_ref === undefined || typeof s.tier_ref === "string"),
    "D-PP: safety-net uses attested discriminator text + tier vocabulary NAMES only");
  check(caution.abcde.E_education.subordinate_to_signoff === true &&
    caution.abcde.E_education.potestative_scope === "continued_passage_only",
    "E-PP: the patient choice is bounded and ALWAYS subordinate to professional sign-off");
}

// ── Edge 4: patient declines → refer; decline never lowers (or raises) tier ────
const declined = gradeConcern({
  flags: [PYELO],
  patient_answers: pyeloAnswers("absent", "present"),
  abcde_input: { patient_decision: "decline" },
});
check(declined.tier === "CAUTION" && declined.abcde?.B_balance.pathway === "refer",
  "decline must stop continued passage (refer) without changing the clinical tier");
const undecided = gradeConcern({ flags: [PYELO], patient_answers: pyeloAnswers("absent", "present") });
check(undecided.abcde?.B_balance.pathway === "refer" && undecided.abcde?.E_education.patient_decision === "undecided",
  "no recorded decision → NO autonomous continuation (refer)");

// ── ABCDE red flag mid-protocol → STOP (state machine upgrade) ─────────────────
const midFlag = gradeConcern({
  flags: [PYELO],
  patient_answers: pyeloAnswers("absent", "present"),
  abcde_input: { patient_decision: "proceed", red_flag_reported: true },
});
check(midFlag.tier === "STOP" && midFlag.abcde === undefined,
  "a red flag reported mid-ABCDE must upgrade the run to STOP");

// ── Edge 5: ambiguity (unknown / unanswered) → fail-closed STOP ────────────────
const unknown = gradeConcern({ flags: [PYELO], patient_answers: { ...pyeloAnswers("absent", "present"), "uhao-3": "unknown" } });
check(unknown.tier === "STOP" && unknown.fail_closed === true,
  "an unknown discriminator answer must fail closed to STOP — never CAUTION-by-default");
const unanswered = gradeConcern({ flags: [PYELO] });
check(unanswered.tier === "STOP" && unanswered.fail_closed === true,
  "unanswered discriminators must fail closed to STOP");

// ── Stigma present → STOP ──────────────────────────────────────────────────────
const stigma = gradeConcern({ flags: [PYELO], patient_answers: { ...pyeloAnswers("absent", "present"), "pyelonephritis-cs-2": "present" } });
check(stigma.tier === "STOP" && stigma.entity_class === "typifies_stigmata" && stigma.fail_closed === false,
  "a confirmed condition-specific stigma must STOP (typifies_stigmata)");

// ── Edge 7: off-registry / managed-only → fail-closed STOP ─────────────────────
const offArea = gradeConcern({ flags: [{ source: "other", area_id: "no-such-area", condition: "Pyelonephritis" }] });
check(offArea.tier === "STOP" && offArea.fail_closed === true, "an off-registry area must fail closed to STOP");
const offCond = gradeConcern({ flags: [{ source: "other", area_id: "uti", condition: "No Such Condition" }] });
check(offCond.tier === "STOP" && offCond.fail_closed === true, "an off-registry condition must fail closed to STOP");
const managedOnly = gradeConcern({ flags: [{ source: "other", area_id: "uti", condition: "Urethritis" }] });
check(managedOnly.tier === "STOP" && managedOnly.fail_closed === true,
  "a flag against a managed (non-exclusion) condition has no attested discriminators → fail-closed STOP");

// ── Edge 10: malformed input → fail-closed STOP (gradeConcern cannot throw) ────
const malformed = gradeConcern({ flags: "not-an-array" });
check(malformed.tier === "STOP" && malformed.fail_closed === true, "malformed input must fail closed to STOP, not throw");
const empty = gradeConcern({ flags: [] });
check(empty.tier === "STOP" && empty.fail_closed === true, "an empty flag set is not a valid grading request → fail-closed STOP");

// ── Edges 2–3: multiple flags → ordinal MAX, never an average ──────────────────
const mixedStop = gradeConcern({ flags: [PYELO, ECTOPIC], patient_answers: pyeloAnswers("absent", "present") });
check(mixedStop.tier === "STOP" && mixedStop.abcde === undefined,
  "a co-present STOP must absorb a CAUTION flag (ordinal max; ABCDE does not run)");
const mixedCaution = gradeConcern({
  flags: [PYELO],
  patient_answers: pyeloAnswers("absent", "present"),
  abcde_input: { patient_decision: "proceed" },
});
check(mixedCaution.concerns.length === 1 && mixedCaution.tier === "CAUTION", "single CAUTION flag → run tier CAUTION");

// ── Every verdict is schema-valid ──────────────────────────────────────────────
for (const [name, v] of [["stopAlways", stopAlways], ["nai", nai], ["go", go], ["unknown", unknown], ["offArea", offArea], ["malformed", malformed]]) {
  try {
    validateStep1Verdict(v);
  } catch (e) {
    errors.push(`verdict "${name}" must validate against Step1Verdict: ${e.message}`);
  }
}

// ── The ABCDE record: self-describing, tablet-tagged, schema-valid, inert ──────
const HASH = "sha256:" + "a".repeat(64);
const record = buildAbcdeRecord({ run_id: "run-test-0001", trunk_id: "9.0", candidate_output_hash: HASH, triage: caution });
try {
  validateAbcdeRecord(record);
} catch (e) {
  errors.push("buildAbcdeRecord must produce a schema-valid record: " + e.message);
}
check(record._pppTtt.meta.tag[0].system === "urn:au:digital-tablet" && record._pppTtt.meta.tag[0].code === "ppp-ttt-v1",
  "the record must carry the Digital Tablet meta.tag (urn:au:digital-tablet / ppp-ttt-v1)");
check(record.dataset_receipts.scope_registry_sha256.startsWith("sha256:") &&
  record.dataset_receipts.omnibus_ref.startsWith("digital-tablet-omnibus:"),
  "the record must carry structured-dataset receipts for the registry and the omnibus");
check(record._composition_section_LOINC?.Assessment === "51848-0" && record._composition_section_LOINC?.Plan === "18776-5",
  "composition section LOINCs must be PROVEN from the pinned omnibus (Assessment 51848-0, Plan 18776-5)");
check(record.candidate_output_hash === HASH && record.run_id === "run-test-0001",
  "the record must anchor to the run + the exact verified output hash");
const recordText = JSON.stringify(record);
check(!/patient_eligible/i.test(recordText), "NOTHING in PPP-TTT may reference patient_eligible");
check(!/"snomed"/.test(recordText), "Step 1 must not mint any SNOMED binding (codes only ever come from terminology receipts)");

// A STOP verdict also builds a valid record (no abcde block).
const stopRecord = buildAbcdeRecord({ run_id: "run-test-0002", trunk_id: "1.0", candidate_output_hash: HASH, triage: stopAlways });
check(stopRecord.abcde === undefined, "a STOP record carries no ABCDE block");

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-ppp-ttt: OK");
