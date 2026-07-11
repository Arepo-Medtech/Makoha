/**
 * A-PP — Assessment for Plausible Continued Passage (pure).
 *
 * Re-checks the CAUTION verdict's own discriminators before anything else in
 * ABCDE runs: continued passage is plausible ONLY if every high-acuity
 * discriminator (universal override + condition-specific stigmata) was
 * answered "absent". Any residual open or present discriminator — which the
 * Step-1 grading should have already escalated — yields not_safe, which the
 * composer upgrades to STOP. This is defence in depth, not trust in Step 1.
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
      if (d.answer !== "absent") open.push(d.id);
    }
  }
  return APP.parse({
    graded_verdict: open.length === 0 ? "plausibly_safe" : "not_safe",
    residual_discriminators_open: open,
  });
}
