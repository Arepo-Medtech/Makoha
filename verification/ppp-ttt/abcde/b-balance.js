/**
 * B-PP — Balancing Practicalities with Precautions (pure, deterministic).
 *
 * Selects the CAUTION pathway. The rules are deliberately narrow:
 *   - A-PP not_safe                    → escalate (the composer upgrades to STOP);
 *   - patient decision "proceed"       → continue_with_safety_net;
 *   - decline / undecided              → refer (there is NO autonomous continuation:
 *     absent an informed patient decision to proceed, the consult routes to a
 *     human professional — edge case 4; declining never changes the tier).
 *
 * residual_risk uses the omnibus RiskAssessment.prediction_qualitative
 * vocabulary. The only reachable CAUTION entry state is "every high-acuity
 * discriminator attested-absent, stable refer_if form present", which the
 * attested registry grades REFER-by-default — recorded here as "low". Any
 * finer risk stratification is future clinician-attested work, not code.
 */
import { BPP } from "../abcde-schema.js";

/**
 * @param {{graded_verdict:string}} app - A-PP result
 * @param {{patient_decision?:string, practicality_benefit?:string}} abcdeInput
 * @returns {{pathway:string, residual_risk:string, practicality_benefit:string}}
 */
export function balancePracticalities(app, abcdeInput = {}) {
  const pathway =
    app.graded_verdict === "not_safe"
      ? "escalate"
      : abcdeInput.patient_decision === "proceed"
        ? "continue_with_safety_net"
        : "refer";
  return BPP.parse({
    pathway,
    residual_risk: "low",
    practicality_benefit:
      abcdeInput.practicality_benefit ||
      "telehealth review adequate: all attested high-acuity discriminators answered absent; no exam-dependent stigma outstanding",
  });
}
