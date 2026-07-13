/**
 * Evidence Broker receipt normaliser (MI-01; execution plan §3.3, §4.1, option A).
 *
 * Turns a ranked+jurisdiction-stamped evidence candidate into the normalised
 * output the Broker returns: a base Receipt (validated against receipt.schema.json
 * via ReceiptSchema) carrying the MI-02 trust qualifiers, PLUS an evidence layer
 * carrying the claim/source/id provenance. The receipt is the atom of trust; the
 * evidence layer is what the verification/patient UI reads to show WHY a claim is
 * trusted.
 *
 * SAFETY: the normaliser refuses to emit an invalid receipt — if the object it
 * builds fails ReceiptSchema it throws (an internal contract bug), never returns a
 * malformed proof. This is schema-first discipline at the last mile before trust.
 * Pure module — no I/O; `now` injectable for deterministic tests.
 */
import { ReceiptSchema } from "../../../verification/pipeline-schemas.js";

/** Source → human upstream label for the receipt (execution plan §4.1 vocabulary). */
const UPSTREAM_BY_SOURCE = {
  pubmed: "PubMed",
  clinicaltrials_gov: "ClinicalTrials.gov",
  open_targets: "Open Targets",
  chembl: "ChEMBL",
  biorxiv_medrxiv: "bioRxiv/medRxiv",
  openfda: "openFDA",
  guideline: "guideline-body",
};

/**
 * @param {{ source: string, id: string, claim: string, retrieved_at?: string,
 *           upstream?: string, source_rank: number, confidence: string,
 *           jurisdiction_tag: string, provisional: boolean, context_only: boolean,
 *           patient_receipt_eligible: boolean }} candidate  ranked + jurisdiction-stamped
 * @param {{ mode?: "live"|"dry_run"|"mock", now?: () => number, requestId?: string }} [opts]
 * @returns {{ receipt: object, evidence: object }}
 */
export function normaliseReceipt(candidate, { mode = "mock", now = () => Date.now(), requestId } = {}) {
  const ms = now();
  const iso = new Date(ms).toISOString();
  const receipt = {
    request_id: requestId || `eb-${ms}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: iso,
    upstream: candidate.upstream || UPSTREAM_BY_SOURCE[candidate.source] || String(candidate.source),
    mode,
    server: "knowledge",
    source_rank: candidate.source_rank,
    confidence: candidate.confidence,
    jurisdiction_tag: candidate.jurisdiction_tag,
  };
  const parsed = ReceiptSchema.safeParse(receipt);
  if (!parsed.success) {
    throw new Error("receipt-normaliser produced an invalid receipt: " + parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
  }
  const evidence = {
    claim: candidate.claim,
    source: candidate.source,
    id: candidate.id,
    retrieved_at: candidate.retrieved_at || iso,
    provisional: candidate.provisional,
    context_only: candidate.context_only,
    patient_receipt_eligible: candidate.patient_receipt_eligible,
  };
  return { receipt: parsed.data, evidence };
}
