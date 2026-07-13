/**
 * MOSTLY AI synthetic-data eval harness (MI-18 / MI-19; execution plan §2.3, §9.2).
 *
 * Grows the eval corpus with differential-privacy synthesis (MOSTLY AI SDK,
 * Apache-2.0, self-hosted) BEHIND the existing case-factory (H4) interface — it
 * invents NO second corpus path; generated records feed case-factory/to-casebundle.js
 * → the contract-tested ingest → data/cases, exactly like the synthea generators.
 *
 * PROCESS BOUNDARY (the synthea precedent, case-factory/README): the MOSTLY AI SDK is
 * an external, self-hosted generator. This Node wrapper is the boundary; with no SDK
 * output configured it is FAIL-SAFE — returns { available:false, reason } and NEVER
 * fabricates a case.
 *
 * TWO HARD RULES (§9.2), enforced by construction, not by docs:
 *   1. Every MOSTLY AI case is labelled synthetic:true — never mistaken for a real
 *      clinician-attested case.
 *   2. Every MOSTLY AI case is clinician_reviewed:false on emit — INERT until a
 *      clinician attests plausibility. The eval:cases gate counts ONLY
 *      clinician_reviewed===true cases (scripts/eval-case-gate.mjs:139/159), so an
 *      unsigned synthetic case can never gate or admit a release (MI-19). This
 *      generator has no authority to attest (case-factory CONTRACT §6).
 * No new dependency — Node 20 built-ins; input-gated (unset ⇒ unavailable).
 */

/**
 * Is the MOSTLY AI generator configured? Input-gated, fail-safe. `HEYDOC_MOSTLY_AI_OUTPUT`
 * points at the SDK's synthesised output (dir or endpoint). Unset/placeholder ⇒ unavailable.
 * @param {Record<string,string|undefined>} [env]
 * @returns {{ available: boolean, reason?: string, source?: string }}
 */
export function mostlyAiAvailable(env = process.env) {
  const raw = (env.HEYDOC_MOSTLY_AI_OUTPUT || "").trim();
  if (!raw) return { available: false, reason: "HEYDOC_MOSTLY_AI_OUTPUT unset — MOSTLY AI SDK output not configured (self-hosted, external)" };
  if (raw.startsWith("<") || raw.includes("example.invalid")) return { available: false, reason: "HEYDOC_MOSTLY_AI_OUTPUT is a placeholder — set the real SDK output path or leave unset" };
  return { available: true, source: raw };
}

/**
 * Stamp a MOSTLY AI-generated record with synthetic provenance. The two hard rules
 * are baked in here: synthetic:true and clinician_reviewed:false. This mirrors the
 * case-factory provenance conventions so the record flows through the SAME shaper.
 * @param {object} record  a raw MOSTLY AI-synthesised record
 * @returns {object} the record with provenance stamped
 */
export function labelMostlyAiSynthetic(record) {
  return {
    ...record,
    synthetic: true, // rule 1 — never mistaken for a real attested case
    provenance: {
      ...(record && record.provenance ? record.provenance : {}),
      generator: "mostly-ai",
      source_type: "differential_privacy_synthesis",
      differential_privacy: true,
      clinician_reviewed: false, // rule 2 — inert until a clinician attests (MI-19)
    },
  };
}

/**
 * The eval-gate attestation predicate, mirrored from scripts/eval-case-gate.mjs:139
 * so the harness can self-check that an unsigned synthetic case is inert. A case
 * counts toward / can gate a release ONLY when a clinician has attested it.
 * @param {{ clinician_reviewed?: boolean }} review
 * @returns {boolean}
 */
export function isEvalGateAttested(review) {
  return !!review && review.clinician_reviewed === true;
}

// Standalone: report availability (never fabricates). Mirrors case-factory main().
function main() {
  const a = mostlyAiAvailable();
  if (!a.available) {
    console.log(`mostly-ai harness: UNAVAILABLE — ${a.reason}`);
    console.log("  (input-gated; configure HEYDOC_MOSTLY_AI_OUTPUT to feed the case factory. No case fabricated.)");
    return;
  }
  console.log(`mostly-ai harness: available (source=${a.source}). Records feed case-factory/to-casebundle.js → ingest → data/cases.`);
  console.log("  Every case: synthetic:true, clinician_reviewed:false — inert until clinician-attested (MI-19).");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
