/**
 * Jurisdiction guard (MI-20; execution plan §8 E6, §1.4).
 *
 * Breath-Ezy is an AU patient product. This guard drives receipt jurisdiction
 * tagging and the E6 mismatch STOP: a source in the US *regulatory/operational*
 * class (openFDA drug data; the out-of-scope US Census/CMS pattern) is tagged
 * `US_context` and is NEVER admitted to an AU patient receipt — the claim
 * downgrades to `unknown`.
 *
 * IMPORTANT boundary (reconciled against §5): "US_context" is the US *regulatory*
 * data class, NOT merely "US-hosted". PubMed and ClinicalTrials.gov are US-hosted
 * but carry international scientific literature; §5 makes them rank-1/2 patient
 * receipts, so they are tagged `non_AU` (transparent, not AU-endorsed) and pass the
 * jurisdiction gate — their patient-receipt eligibility is decided by the source
 * ranker (MI-03), not by this guard. Barring them here would contradict §5.
 *
 * INVARIANT: a US source is NEVER tagged `AU_endorsed`. Fail-safe: an unrecognised
 * source is tagged `non_AU` (never auto-promoted to AU_endorsed).
 * Pure module — no I/O. jurisdiction_tag values mirror JURISDICTION_TAGS.
 */
import { JURISDICTION_TAGS } from "../verification/pipeline-schemas.js";

/**
 * Source → jurisdiction class. Keys match the Evidence-Broker source vocabulary
 * (execution plan §4.1). `guideline` is the AU guidance layer in this product
 * (eTG/RACGP-class taps served through the AU-scoped knowledge/terminology servers).
 * @type {Record<string, "AU_endorsed" | "US_context" | "non_AU">}
 */
export const JURISDICTION_BY_SOURCE = {
  guideline:          "AU_endorsed",
  pubmed:             "non_AU",
  clinicaltrials_gov: "non_AU",
  open_targets:       "non_AU",
  chembl:             "non_AU",
  biorxiv_medrxiv:    "non_AU",
  openfda:            "US_context", // US regulatory drug data — barred from AU patient receipts (E6/E10).
};

// Static self-check: no source may be tagged with a value outside the receipt vocabulary,
// and (the invariant) no US-regulatory source may ever be AU_endorsed.
for (const [src, tag] of Object.entries(JURISDICTION_BY_SOURCE)) {
  if (!JURISDICTION_TAGS.includes(tag)) throw new Error(`jurisdiction: source '${src}' tag '${tag}' not in the receipt vocabulary`);
}
if (JURISDICTION_BY_SOURCE.openfda === "AU_endorsed") throw new Error("jurisdiction invariant breached: a US source tagged AU_endorsed");

/**
 * Tag a source's jurisdiction. Never throws; unrecognised → `non_AU` (fail-safe,
 * never AU_endorsed).
 * @param {string} source
 * @returns {"AU_endorsed" | "US_context" | "non_AU"}
 */
export function tagJurisdiction(source) {
  return JURISDICTION_BY_SOURCE[source] ?? "non_AU";
}

/** Stamp `jurisdiction_tag` onto a candidate from its source. */
export function stampJurisdiction(candidate) {
  if (!candidate || typeof candidate.source !== "string") {
    throw new TypeError("stampJurisdiction requires a candidate with a string `source`");
  }
  return { ...candidate, jurisdiction_tag: tagJurisdiction(candidate.source) };
}

/**
 * The E6 STOP. On an AU patient path a `US_context` source is refused and the claim
 * becomes `unknown`; anything else is admitted carrying its jurisdiction tag. Off the
 * patient path (research/context use) nothing is barred here.
 * @param {{ source: string, jurisdiction_tag?: string, [k: string]: any }} candidate
 * @param {{ patient_path?: boolean }} [opts]
 * @returns {{ admitted: true, jurisdiction_tag: string } | { admitted: false, result: "unknown", reason: string, jurisdiction_tag: string }}
 */
export function enforceAuJurisdiction(candidate, { patient_path = true } = {}) {
  const tag = candidate.jurisdiction_tag ?? tagJurisdiction(candidate.source);
  if (patient_path && tag === "US_context") {
    return { admitted: false, result: "unknown", reason: `jurisdiction_mismatch: ${candidate.source} is US_context, barred from AU patient receipt (E6)`, jurisdiction_tag: tag };
  }
  return { admitted: true, jurisdiction_tag: tag };
}
