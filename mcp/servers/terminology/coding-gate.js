/**
 * Terminology coding gate (MI-06 / MI-07; execution plan §3.1, §4.3 Stage 4).
 *
 * THE single enforcement point for the preserved invariant: "no coded clinical fact
 * enters the record except through a $validate-code pass." A validated concept is
 * coded; an UNRESOLVED term is QUARANTINED as free-text with a flag and is NEVER
 * promoted to a coded field. Consolidating this into one function keeps trunk 7.0
 * code lock-in and ingestion Stage 4 (MI-10) from each re-deriving the rule and
 * drifting. Pure module — no I/O.
 *
 * `validation` is the result object from the Terminology Service / ontoserver-client
 * ({ validated, display?, version?, reason? }). The gate trusts ONLY validated===true.
 */

/**
 * @param {{ text?: string, system?: string, code?: string }} entity  a candidate term to code
 * @param {{ validated?: boolean, display?: string, version?: string, reason?: string }} validation
 * @returns {{ coded: { system: string|undefined, code: string, display: string, version: string|undefined } | null,
 *            quarantined: { text: string|null, free_text: true, reason: string } | null }}
 */
export function codeOrQuarantine(entity, validation) {
  if (validation && validation.validated === true && entity && entity.code) {
    return {
      coded: { system: entity.system, code: entity.code, display: validation.display || entity.text, version: validation.version },
      quarantined: null,
    };
  }
  return {
    coded: null,
    // Free-text quarantine: preserved as stated, flagged, never coded.
    quarantined: { text: (entity && (entity.text ?? entity.code)) ?? null, free_text: true, reason: (validation && validation.reason) || "unresolved: no $validate-code pass" },
  };
}

/**
 * Collect the codes that passed the gate — the set the verifier binds against.
 * Anything quarantined is absent by construction, so an unresolved code can never
 * become a validated_code.
 * @param {Array<ReturnType<typeof codeOrQuarantine>>} gateResults
 * @returns {string[]}
 */
export function validatedCodesFrom(gateResults) {
  return gateResults.filter((r) => r.coded).map((r) => r.coded.code);
}
