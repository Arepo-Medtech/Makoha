/**
 * C-PP — Caveats on Provisionality in Plain Language (pure, fixed).
 *
 * Exactly ONE provisionality statement plus the two fixed declarations — the
 * anti-caveat-fatigue rule is structural (the schema has no field to inflate).
 * no_diagnosis / no_decisions are z.literal(true): a record negating either is
 * unrepresentable.
 */
import { CPP } from "../abcde-schema.js";

/** Stable caveat codes recorded in the PHI-free ledger. */
export const CAVEAT_CODES = ["provisional_clinician_confirmed", "no_diagnosis", "no_decisions"];

export function caveatsOnProvisionality() {
  return CPP.parse({
    provisionality: "provisional, clinician-confirmed",
    no_diagnosis: true,
    no_decisions: true,
    plain_language: "This is a suggestion for a clinician to review, not a diagnosis or a decision.",
  });
}
