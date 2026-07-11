/**
 * ppp-ttt record — builds the self-describing, Digital-Tablet-tagged ABCDE
 * record for one graded run.
 *
 * AUDIT CHANNEL ONLY: this record rides the pipeline RESULT (next to
 * fact_provenance / history_summary) to the portal and the parallel ledger.
 * It is NEVER injected into the ContextPacket — the LLM-visible packet is
 * byte-identical whether PPP-TTT ran or not.
 *
 * Receipt discipline: the record pins the scope-registry sha256 and the
 * omnibus dataset ref it derived from, and anchors to the exact verified
 * output bytes via candidate_output_hash (the medicolegal join key).
 */
import { validateAbcdeRecord } from "./abcde-schema.js";
import { scopeRegistryReceipt } from "./discriminators.js";
import { pppTttHeader, compositionSectionLoinc, omnibusReceiptRef } from "./tablet-tags.js";

/**
 * @param {{ run_id: string, trunk_id?: string, candidate_output_hash: string, triage: object }} args
 *   triage - the Step1Verdict-shaped aggregate returned by gradeConcern()
 *   (with .abcde present when the tier was CAUTION)
 * @returns {object} schema-gated ABCDE record
 */
export function buildAbcdeRecord({ run_id, trunk_id, candidate_output_hash, triage }) {
  const registry = scopeRegistryReceipt();
  const sections = compositionSectionLoinc();
  // The verdict itself (without the abcde payload, which is recorded at the
  // record's top level so the schema stays self-describing).
  const { abcde, ...step1_verdict } = triage;
  const record = {
    _pppTtt: pppTttHeader(),
    run_id,
    ...(trunk_id ? { trunk_id } : {}),
    candidate_output_hash,
    scope_registry_version: registry.dataset_version,
    dataset_receipts: {
      scope_registry_sha256: registry.sha256,
      omnibus_ref: omnibusReceiptRef(),
    },
    // Proven section codes, or withheld entirely (never defaulted).
    ...(sections ? { _composition_section_LOINC: sections } : {}),
    step1_verdict,
    ...(abcde ? { abcde } : {}),
    provenance: {
      agent_types: ["verifier"],
      created_at_utc: new Date().toISOString(),
      created_by: "verification/ppp-ttt/record.js",
    },
  };
  return validateAbcdeRecord(record);
}
