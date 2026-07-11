/**
 * E-PP — Education / Explanations for a Patient Potestative Position (pure).
 *
 * Records the bounded patient choice. The bounds are structural (schema
 * literals): the choice is offered ONLY in CAUTION, covers CONTINUED PASSAGE
 * ONLY (never a diagnosis, dose, or release), and is ALWAYS subordinate to
 * professional sign-off. Decline is a first-class, non-penalised option and
 * never changes the clinical tier — it only stops continued passage (B-PP
 * routes to refer). No patient-facing UI exists in Step 1: this MODELS and
 * RECORDS the decision; the screen is later, gated work.
 */
import { EPP } from "../abcde-schema.js";

/**
 * @param {Array<object>} concerns - CAUTION-tier ConcernVerdicts
 * @param {{patient_decision?:"proceed"|"decline"|"undecided"}} abcdeInput
 * @returns {object} EPP-shaped record
 */
export function educationPotestative(concerns, abcdeInput = {}) {
  const conditions = concerns.map((c) => c.condition).join(", ");
  return EPP.parse({
    explanation_plain:
      `A possible concern (${conditions}) was checked with structured questions. ` +
      `None of the urgent warning signs were present. You can choose to continue this consult ` +
      `(with clear advice on what to watch for) or be referred to a doctor now. ` +
      `Either way, everything here is reviewed and signed off by a health professional before it applies to you.`,
    bounded_choice_offered: true,
    patient_decision: abcdeInput.patient_decision || "undecided",
    decision_recorded_at_utc: new Date().toISOString(),
    subordinate_to_signoff: true,
    potestative_scope: "continued_passage_only",
  });
}
