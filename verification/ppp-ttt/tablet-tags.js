/**
 * ppp-ttt tablet-tags — Digital Tablet tagging helpers.
 *
 * Every PPP-TTT artefact is tagged per data/digital_tablet_omnibus.json
 * conventions (meta.tag { system: "urn:au:digital-tablet" }). The LOINC
 * composition-section codes (Assessment 51848-0, Plan 18776-5) are NOT minted
 * here: they are READ from the pinned omnibus via the single omnibus reader
 * (verification/omnibus.js), so the record carries only codes PROVEN to exist
 * in the versioned dataset, backed by the omnibus structured_dataset receipt.
 * If the omnibus subtree does not resolve, the codes are WITHHELD (fail-safe:
 * a tag that cannot be proven is a fabrication risk, never a default).
 */
import { omnibusSubtree, omnibusDatasetReceipt } from "../omnibus.js";

/** The PPP-TTT meta.tag (Digital Tablet idiom). */
export const PPP_TTT_TAG = {
  system: "urn:au:digital-tablet",
  code: "ppp-ttt-v1",
  display: "PPP-TTT graded-triage record",
};

/** The self-describing record header (`_pppTtt`, mirroring `_digitalTablet`). */
export function pppTttHeader() {
  return {
    schema: "ppp-ttt-abcde-record",
    version: "1.0",
    meta: { tag: [{ ...PPP_TTT_TAG }] },
  };
}

/**
 * Composition-section LOINC codes proven against the pinned omnibus
 * (FreeText_Taxonomy._composition_section_LOINC). Returns null (withhold) if
 * the subtree does not resolve or lacks either section — never a hardcoded
 * fallback.
 * @returns {{Assessment:string, Plan:string}|null}
 */
export function compositionSectionLoinc() {
  const sections = omnibusSubtree("FreeText_Taxonomy._composition_section_LOINC");
  if (!sections || typeof sections !== "object") return null;
  const { Assessment, Plan } = sections;
  if (typeof Assessment !== "string" || typeof Plan !== "string") return null;
  return { Assessment, Plan };
}

/** The omnibus structured_dataset receipt backing every proven tag. */
export function omnibusReceiptRef() {
  return omnibusDatasetReceipt().ref;
}
