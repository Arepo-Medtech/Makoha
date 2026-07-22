/**
 * A-PP — Assessment for Plausible Continued Passage (pure).
 *
 * Re-checks the CAUTION verdict's own discriminators before anything else in
 * ABCDE runs. Continued passage is NOT plausible only if a high-acuity
 * discriminator (universal override + condition-specific stigma) is actually
 * "present" — a genuine red that surfaced — which the composer upgrades to STOP.
 *
 * RECALIBRATED (operator ruling KL 2026-07-22, mākoha): an "unknown" discriminator
 * is NOT treated as residual-open here. Unknown is the telehealth-normal state —
 * no bedside data — and Step 1 now legitimately routes an all-unknown/no-stigma
 * flag to CAUTION on purpose. If A-PP re-escalated on "unknown" it would silently
 * undo that (drag every can't-rule-out-remotely case back to STOP). Only a
 * PRESENT stigma flips continued passage to not_safe. This remains defence in
 * depth against a stigma that IS present slipping through — not a bar on unknowns.
 */
import { APP } from "../abcde-schema.js";

/**
 * @param {Array<object>} concerns - the CAUTION-tier ConcernVerdicts for this run
 * @returns {{graded_verdict:"plausibly_safe"|"not_safe", residual_discriminators_open:string[]}}
 */
export function assessPlausiblePassage(concerns) {
  const open = [];
  for (const c of concerns) {
    for (const d of c.discriminators_asked) {
      if (d.source === "condition_specific.refer_if") continue; // stable-form pattern, not a stigma
      if (d.answer === "present") open.push(d.id); // only a PRESENT stigma is a red; unknown is orange (CAUTION), not not_safe
    }
  }
  return APP.parse({
    graded_verdict: open.length === 0 ? "plausibly_safe" : "not_safe",
    residual_discriminators_open: open,
  });
}
