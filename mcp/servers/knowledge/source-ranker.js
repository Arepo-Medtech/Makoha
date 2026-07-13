/**
 * Evidence Broker source-ranking engine (MI-03; execution plan §5).
 *
 * Encodes the FIXED source ranking as executable policy, not prose. Two safety
 * exclusions live here in CODE (not merely in docs), so a mis-wired caller cannot
 * leak them to a patient:
 *   - E9  provisional (rank 4, bioRxiv/medRxiv preprints) are NEVER a patient receipt.
 *   - E10 context-only (rank 5, openFDA) is NEVER a receipt at all — explanatory
 *         context signal only.
 * Ranks 1-3 (peer-reviewed/guideline, registered trials, mechanism/target/compound)
 * are patient-receipt eligible, at descending confidence.
 *
 * FAIL-SAFE: an unrecognised source is treated as ineligible (no patient receipt,
 * no rank) rather than admitted — ambiguous provenance is unsafe, per the system's
 * "blocked beats fabricated" posture. The confidence bands emitted here are checked
 * against CONFIDENCE_BANDS so this policy can never drift from the receipt contract.
 * Pure module — no I/O.
 */
import { CONFIDENCE_BANDS } from "../../../verification/pipeline-schemas.js";

/**
 * The §5 table as data. `source` keys match the Evidence-Broker source vocabulary
 * (execution plan §4.1). `patient_receipt_eligible` is the single enforced gate.
 * @type {Record<string, { source_rank: number, confidence: string, provisional: boolean, context_only: boolean, patient_receipt_eligible: boolean }>}
 */
export const SOURCE_POLICY = {
  // Rank 1 — peer-reviewed literature / clinical guideline bodies.
  pubmed:            { source_rank: 1, confidence: "high",        provisional: false, context_only: false, patient_receipt_eligible: true },
  guideline:         { source_rank: 1, confidence: "high",        provisional: false, context_only: false, patient_receipt_eligible: true },
  // Rank 2 — registered trials.
  clinicaltrials_gov:{ source_rank: 2, confidence: "moderate",    provisional: false, context_only: false, patient_receipt_eligible: true },
  // Rank 3 — mechanism / target / compound (lower confidence, still receiptable).
  open_targets:      { source_rank: 3, confidence: "low",         provisional: false, context_only: false, patient_receipt_eligible: true },
  chembl:            { source_rank: 3, confidence: "low",         provisional: false, context_only: false, patient_receipt_eligible: true },
  // Rank 4 — provisional preprints. EXCLUDED from patient receipts (E9).
  biorxiv_medrxiv:   { source_rank: 4, confidence: "provisional", provisional: true,  context_only: false, patient_receipt_eligible: false },
  // Rank 5 — context-only. NEVER a receipt (E10).
  openfda:           { source_rank: 5, confidence: "provisional", provisional: false, context_only: true,  patient_receipt_eligible: false },
};

// Drift guard: every confidence band this policy emits must be a legal receipt band.
for (const [src, p] of Object.entries(SOURCE_POLICY)) {
  if (!CONFIDENCE_BANDS.includes(p.confidence)) {
    throw new Error(`source-ranker: source '${src}' emits confidence '${p.confidence}' not in the receipt vocabulary`);
  }
}

/** The fail-safe row for an unrecognised source — ineligible, unranked. */
const UNKNOWN_SOURCE = Object.freeze({ source_rank: null, confidence: null, provisional: false, context_only: false, patient_receipt_eligible: false, unknown_source: true });

/**
 * Resolve the ranking policy for a source. Never throws — unrecognised → fail-safe.
 * @param {string} source
 * @returns {{ source_rank: number|null, confidence: string|null, provisional: boolean, context_only: boolean, patient_receipt_eligible: boolean, unknown_source?: boolean }}
 */
export function rankSource(source) {
  const row = SOURCE_POLICY[source];
  return row ? { ...row } : { ...UNKNOWN_SOURCE };
}

/** True only for a source that may back a patient-facing receipt (ranks 1-3). */
export function isPatientReceiptEligible(source) {
  return rankSource(source).patient_receipt_eligible === true;
}

/**
 * Stamp a resolved evidence candidate with its ranking. The returned object carries
 * both the receipt-level qualifiers (source_rank, confidence) and the evidence-layer
 * exclusion flags (provisional, context_only, patient_receipt_eligible) that the
 * Broker (MI-01) and the release path use to bar E9/E10 items from a patient.
 * @param {{ source: string, [k: string]: any }} candidate
 */
export function applyRanking(candidate) {
  if (!candidate || typeof candidate.source !== "string") {
    throw new TypeError("applyRanking requires a candidate with a string `source`");
  }
  const r = rankSource(candidate.source);
  return {
    ...candidate,
    source_rank: r.source_rank,
    confidence: r.confidence,
    provisional: r.provisional,
    context_only: r.context_only,
    patient_receipt_eligible: r.patient_receipt_eligible,
    ...(r.unknown_source ? { unknown_source: true } : {}),
  };
}
