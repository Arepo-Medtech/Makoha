/**
 * patient/consult-flow — the patient-facing consult flow decision logic
 * (LIVE_PLAN L11; PPP-TTT plan Step 3). PURE + testable; the HTTP surface
 * (consult-server.js) is a thin renderer over this.
 *
 * THE ABSOLUTE RULE (prime directive, mechanical): NO patient-visible CLINICAL
 * OUTPUT escapes the release gate. Any screen that would show generated
 * clinical text routes it through portal/verification-gate.js releaseToPatient()
 * FIRST — which is fail-closed and, in mock/dev, releases NOTHING (there are no
 * patients in dev). So this surface demonstrates the flow and enforces the gate
 * without opening a patient path. Nothing here sets the patient-eligibility
 * flag; that remains the four-part precondition owned elsewhere.
 *
 * SAFETY SCREENS take precedence over any clinical draft and are shown
 * REGARDLESS of the release gate (they are universal safety routing, not a
 * clinical recommendation requiring sign-off):
 *   1. EMERGENCY (PPP-TTT STOP / escalate_now / T5 / firewall hard-stop) →
 *      a NON-OVERRIDABLE "call 000 / go to ED" screen. No clinical draft, no
 *      "continue anyway" option. Highest precedence — an emergency in any
 *      patient beats every other branch.
 *   2. PAEDIATRIC (age < 18) → in-person review referral (paediatric hard
 *      limit: no dosing tables; flag for in-person review, never a dose/draft).
 *   3. INTERPRETER REQUIRED → human escalation (interpreter_required triggers
 *      escalation, never a language switch or an autonomous consult).
 *   4. CAUTION (PPP-TTT) → the E-PP bounded-choice screen: the fixed
 *      "No diagnosis / No decisions" caveats + the safety-net descriptors + a
 *      proceed/decline choice (subordinate to sign-off). The underlying draft
 *      is still gated through releaseToPatient() (dev → pending sign-off).
 *   5. GO / no triage → the draft screen: releaseToPatient() decides — released
 *      text only if a clinician attested it on the exact hash (never in dev),
 *      else "pending clinician sign-off, not available in this environment."
 */
import { releaseToPatient as realReleaseToPatient } from "../portal/verification-gate.js";
import { captureConsent as realCaptureConsent } from "../verification/consent.js";

/** Screen kinds (a closed set — the renderer maps each to a template). */
export const SCREENS = Object.freeze({
  EMERGENCY: "emergency_escalation",
  PAEDIATRIC: "in_person_referral_paediatric",
  INTERPRETER: "interpreter_escalation",
  CAUTION: "caution_bounded_choice",
  DRAFT_RELEASED: "draft_released",
  DRAFT_PENDING: "draft_pending_signoff",
});

/** Universal, non-clinical safety text (no sign-off required — it is routing,
 *  not a clinical recommendation). */
const EMERGENCY_TEXT =
  "This may be an emergency. Call 000 now (or go to your nearest emergency department). " +
  "Do not wait for this consult. If you cannot call, ask someone with you to call for you.";

/** Detect an emergency from the pipeline result — conservative (over-detect is
 *  the safe direction). */
function isEmergency(result) {
  const tier = result && result.ppp_ttt && result.ppp_ttt.tier;
  if (tier === "STOP") return true;
  if (result && Array.isArray(result.hard_stops) && result.hard_stops.length) return true;
  if (result && result.firewall_status === "HARD_FAIL") return true;
  // Text signal (matches the sequencer's conservative detector).
  const blob = JSON.stringify({ o: result && result.output, r: result && result.ppp_ttt && result.ppp_ttt.reason });
  return /\bescalate_now\b/i.test(blob) || /\bT5\b/.test(blob);
}

/** Extract the CAUTION safety-net descriptors + caveats from the ABCDE record
 *  (audit channel) — codes/descriptors only, patient-safe. */
function cautionContent(result) {
  const abcde = result && result.abcde_record && result.abcde_record.abcde;
  const safety_net = abcde && abcde.D_pitfalls && Array.isArray(abcde.D_pitfalls.safety_net)
    ? abcde.D_pitfalls.safety_net.map((s) => ({ descriptor: s.descriptor, when_urgent: s.when_urgent }))
    : [];
  const caveats = abcde && abcde.C_caveats ? abcde.C_caveats : { no_diagnosis: true, no_decisions: true, plain_language: "This is a suggestion for a clinician to review, not a diagnosis or a decision." };
  return { safety_net, caveats };
}

/**
 * Parse the BOUNDED consent choices from the intake form (L12 / FL-01).
 * Only the known v1 types, only explicit answers: consent_session is a yes/no
 * radio (an explicit decline is evidence too); consent_telehealth is a
 * checkbox that records a grant ONLY when ticked — an untouched control
 * records NOTHING (consent is never assumed, in either direction, from
 * silence). Free text never becomes a consent.
 * @returns {Array<{ consent_type: string, decision: "granted"|"declined" }>}
 */
export function parseConsentIntake(body = {}) {
  const decisions = [];
  if (body.consent_session === "yes") decisions.push({ consent_type: "session_persistence", decision: "granted" });
  if (body.consent_session === "no") decisions.push({ consent_type: "session_persistence", decision: "declined" });
  if (body.consent_telehealth === "1") decisions.push({ consent_type: "telehealth_consent", decision: "granted" });
  return decisions;
}

/**
 * Record the intake consent decisions for an open encounter — SUPPRESSED on an
 * emergency (consent capture is never a step on a STOP/T5 path; the 000 screen
 * takes absolute precedence). Fail-safe: a capture error never blocks the
 * patient screen — declining or failing to record leaves the safe default
 * (nothing persists) in force.
 * @returns {{ suppressed: boolean, captured: Array<{consent_type,status}>, errors: string[] }}
 */
export function captureIntakeConsents({ session_ref, result, decisions } = {}, opts = {}) {
  const capture = opts.capture || realCaptureConsent;
  if (isEmergency(result)) return { suppressed: true, captured: [], errors: [] };
  const captured = [];
  const errors = [];
  for (const d of decisions || []) {
    try {
      const rec = capture({ session_ref, consent_type: d.consent_type, decision: d.decision });
      captured.push({ consent_type: rec.consent_type, status: rec.status });
    } catch (err) {
      errors.push(String(err && err.message ? err.message.slice(0, 160) : "consent capture error"));
    }
  }
  return { suppressed: false, captured, errors };
}

/**
 * Decide the patient screen for one consult result. Cannot throw (fail-safe:
 * on any internal error it falls back to the emergency/human-escalation screen,
 * never to a clinical draft).
 *
 * @param {{ result: object, patient_context?: { age?: number, interpreter_required?: boolean } }} args
 * @param {{ release?: Function }} [opts] - releaseToPatient override (tests)
 * @returns {object} { screen, overridable, released, ... } — NEVER carries a
 *   clinical draft unless `released === true`.
 */
export function decidePatientScreen({ result, patient_context } = {}, opts = {}) {
  const release = opts.release || realReleaseToPatient;
  const pctx = patient_context || {};
  try {
    // 1. EMERGENCY — highest precedence, non-overridable, no clinical draft.
    if (isEmergency(result)) {
      return { screen: SCREENS.EMERGENCY, overridable: false, released: false, message: EMERGENCY_TEXT };
    }
    // 2. PAEDIATRIC — no dosing tables exist; in-person review, no draft.
    if (typeof pctx.age === "number" && pctx.age < 18) {
      return { screen: SCREENS.PAEDIATRIC, overridable: false, released: false,
        message: "For anyone under 18, this service refers you to see a clinician in person. We do not provide medication advice for children here." };
    }
    // 3. INTERPRETER — human escalation, no autonomous consult.
    if (pctx.interpreter_required) {
      return { screen: SCREENS.INTERPRETER, overridable: false, released: false,
        message: "You've told us you need an interpreter. We'll connect you with a human clinician and interpreter rather than continue automatically." };
    }

    const tier = result && result.ppp_ttt && result.ppp_ttt.tier;
    const hash = result && result.verification && result.verification.candidate_output_hash;
    const output = result && result.output;

    // 4. CAUTION — E-PP bounded choice + caveats + safety-net. The draft is
    // still gated (dev → pending); the caveats/safety-net are patient-safe.
    if (tier === "CAUTION") {
      const gate = release({ candidate_output_hash: hash, output });
      const { safety_net, caveats } = cautionContent(result);
      return {
        screen: SCREENS.CAUTION,
        overridable: true, // the patient may proceed OR decline (subordinate to sign-off)
        released: gate.released === true,
        bounded_choice: ["proceed", "decline"],
        caveats,
        safety_net,
        // Draft text ONLY if the gate actually released it (never in dev).
        ...(gate.released === true ? { draft: output } : { pending_reason: (gate.reasons || []).join("; ") || "clinician sign-off required" }),
        subordinate_to_signoff: true,
      };
    }

    // 5. GO / no triage — the draft screen, gated.
    const gate = release({ candidate_output_hash: hash, output });
    if (gate.released === true) {
      return { screen: SCREENS.DRAFT_RELEASED, overridable: false, released: true, draft: gate.released_hash === hash ? output : output };
    }
    return {
      screen: SCREENS.DRAFT_PENDING,
      overridable: false,
      released: false,
      pending_reason: (gate.reasons || []).join("; ") || "clinician sign-off required",
      message: "Your consult has been prepared and is awaiting a clinician's review and sign-off before it's shared with you.",
    };
  } catch (err) {
    // Fail-safe: never fall through to a clinical draft on error.
    return { screen: SCREENS.EMERGENCY, overridable: false, released: false,
      message: EMERGENCY_TEXT, error: `consult flow error — routed to safety escalation: ${err && err.message ? err.message.slice(0, 160) : "unknown"}` };
  }
}
