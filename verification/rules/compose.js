/**
 * composeRules (A2.2) — fold deterministic rule verdicts into the verification result.
 *
 * ADDITIVE + MONOTONE, exactly like combineVerification / composeArbitration / composeTriage
 * in verification/pipeline.js: it can only ADD a rule record and (at most) a review/caveat
 * annotation. It NEVER flips `pass`, NEVER touches `candidate_output_hash`, and NEVER rescues
 * or downgrades an existing failure. The verdicts ride the AUDIT CHANNEL on the result — they
 * are not merged into the ContextPacket (a rule output in the packet would be an anchor).
 *
 * Note on "review": routing a minor <16 to in-person review is a CAUTION/routing signal, not a
 * verification failure — so it is surfaced as `requires_in_person_review` (+ the rule flags),
 * NOT folded into pass=false. In a low-acuity everyday tool, a review annotation must not be
 * conflated with a hard block; over-restriction is a harm, not a safe default.
 */

/**
 * @param {object} verification - the verification object so far (from verify()/combine…/composeTriage)
 * @param {Array<{rule_id:string,version:string,outcome:string,flags:string[],caveats:string[]}>} ruleVerdicts
 * @returns {object} verification with `rules` (+ optional review/caveat annotations) added; pass unchanged
 */
export function composeRules(verification, ruleVerdicts) {
  if (!ruleVerdicts || !ruleVerdicts.length) return verification; // no ruleset → byte-identical no-op
  const reviewRequired = ruleVerdicts.some((r) => r.outcome === "review");
  const flags = [...new Set(ruleVerdicts.flatMap((r) => r.flags || []))];
  const caveats = [...new Set(ruleVerdicts.flatMap((r) => r.caveats || []))];
  return {
    ...verification,
    rules: ruleVerdicts,
    ...(reviewRequired ? { requires_in_person_review: true } : {}),
    ...(flags.length ? { rule_flags: flags } : {}),
    ...(caveats.length ? { rule_caveats: caveats } : {}),
    // pass is deliberately UNCHANGED — a review/caveat is additive annotation, not a failure.
  };
}
