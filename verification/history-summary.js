/**
 * history-summary — AUCDI-aligned encounter history summary builder (HIST-3;
 * register item `patient-history-summary-unbuilt`; operator-approved
 * 2026-07-11).
 *
 * Assembles the clinician-facing digest of everything the patient
 * self-disclosed or self-measured in ONE encounter, from the packet's
 * patient-provenance facts plus the audit-channel provenance nodes
 * (fhir_path, taxonomy_tags). Mirrors mcp/schemas/patient-history-summary.
 * schema.json — the JSON schema is the source of truth; keep the zod gate
 * below in lockstep.
 *
 * Boundaries (all load-bearing):
 *  - CLINICIAN-FACING ONLY. Consumed by the Clinician Verification Portal
 *    reviewer and rendered into evidence_tree.md. NEVER injected into a
 *    ContextPacket; never feeds back to the trunk LLM.
 *  - ENCOUNTER-SCOPED, MEMORY-ONLY. Pure function, no filesystem writes —
 *    persistence beyond the session is a separately-gated Critical item.
 *  - UNVERIFIED BY CONSTRUCTION. Every entry is verified:false and the
 *    mandatory disclaimer is schema-const; verification happens at the
 *    portal, by a human.
 *  - DETERMINISTIC. Same packet + provenance in, same summary out (the
 *    caller supplies generated_at_utc/run_id; the sha256 covers exactly
 *    what the clinician is shown).
 *  - AU Core conformance is ADVISORY: minimal FHIR shapes built from the
 *    as-stated text are checked structurally against the vendored snapshot
 *    (2.0.1-ci-build) and the result recorded — never gating, and expected
 *    to be "fail" on required elements a patient's account cannot supply.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { validateResource } from "../mcp/servers/fhir-broker/conformance.js";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export const HISTORY_SUMMARY_DISCLAIMER =
  "PATIENT-REPORTED, UNVERIFIED: every entry below is the patient's own account or a patient-provided measurement captured during this encounter. Nothing here is a confirmed diagnosis, a verified medication record, or a clinician-obtained measurement. Clinician confirmation is required before any clinical action.";

/** packet fact category → summary section. Only patient-provenance facts are
 *  summarised; tool-derived facts (receipts) are not the patient's account. */
const SECTION_BY_CATEGORY = {
  demographic: "demographics",
  symptom: "presenting_symptoms",
  past_history: "conditions",
  medication: "medications",
  allergy: "allergies",
  family_history: "family_history",
  social_history: "social_history",
  vital_sign: "vitals_offered",
};

/** Sections that map to a vendored AU Core profile → minimal FHIR shape for
 *  the ADVISORY structural check. The patient's words become the .text of the
 *  codeable concept — never a code. */
const FHIR_SHAPE = {
  conditions: (text) => ({ resourceType: "Condition", code: { text } }),
  medications: (text) => ({ resourceType: "MedicationRequest", medicationCodeableConcept: { text } }),
  allergies: (text) => ({ resourceType: "AllergyIntolerance", code: { text } }),
};

const TagSchema = z.object({ group: z.string(), tag: z.string(), matched: z.string().optional() }).strict();
const EntrySchema = z
  .object({
    fact_id: z.string(),
    as_stated: z.string(),
    provenance: z.enum(["patient_home_device", "patient_wearable", "patient_reported", "video_observable", "caregiver_reported"]),
    verified: z.literal(false),
    fhir_path: z.string().nullable().optional(),
    taxonomy_tags: z.array(TagSchema).optional(),
    au_core: z.object({ profile: z.string().nullable(), status: z.string() }).strict().optional(),
  })
  .strict();

export const PatientHistorySummarySchema = z
  .object({
    run_id: z.string(),
    generated_at_utc: z.string().datetime(),
    dataset_receipt: z.object({ ref: z.string(), sha256: z.string().length(64) }).strict(),
    disclaimer: z.literal(HISTORY_SUMMARY_DISCLAIMER),
    sections: z
      .object({
        demographics: z.array(EntrySchema),
        presenting_symptoms: z.array(EntrySchema),
        conditions: z.array(EntrySchema),
        medications: z.array(EntrySchema),
        allergies: z.array(EntrySchema),
        family_history: z.array(EntrySchema),
        social_history: z.array(EntrySchema),
        vitals_offered: z.array(EntrySchema),
      })
      .strict(),
    summary_sha256: z.string().length(64),
  })
  .strict();

/**
 * Build the encounter history summary from a pipeline result's packet facts
 * and audit-channel provenance.
 *
 * @param {{ packet: {facts: Array}, fact_provenance: {dataset_receipt: object, evidence: Array}|null, run_id: string, generated_at_utc?: string }} input
 * @returns {object|null} schema-valid summary, or null when there is nothing
 *   patient-provided to summarise (no case content).
 */
export function buildEncounterHistorySummary({ packet, fact_provenance, run_id, generated_at_utc }) {
  if (!fact_provenance) return null;
  const provByFact = new Map(fact_provenance.evidence.map((e) => [e.id.replace(/^prov-/, ""), e]));

  const sections = {
    demographics: [], presenting_symptoms: [], conditions: [], medications: [],
    allergies: [], family_history: [], social_history: [], vitals_offered: [],
  };

  for (const f of packet.facts || []) {
    if (!f.provenance) continue; // only the patient's account belongs here
    const section = SECTION_BY_CATEGORY[f.category];
    if (!section) continue; // a category with no history-taking section (e.g. lab_result can't occur — mechanical bar)
    const prov = provByFact.get(f.fact_id);
    const asStated = typeof f.value === "string" ? f.value : JSON.stringify(f.value);
    const entry = {
      fact_id: f.fact_id,
      as_stated: asStated,
      provenance: f.provenance,
      verified: false,
      fhir_path: prov?.fhir_path ?? null,
      ...(prov?.taxonomy_tags?.length ? { taxonomy_tags: prov.taxonomy_tags } : {}),
    };
    const shape = FHIR_SHAPE[section];
    if (shape) {
      const { conformance } = validateResource(shape(asStated));
      entry.au_core = { profile: conformance.profile, status: conformance.status };
    }
    sections[section].push(entry);
  }

  const body = {
    run_id,
    generated_at_utc: generated_at_utc || new Date().toISOString(),
    dataset_receipt: { ref: fact_provenance.dataset_receipt.ref, sha256: fact_provenance.dataset_receipt.sha256 },
    disclaimer: HISTORY_SUMMARY_DISCLAIMER,
    sections,
  };
  // Hash exactly what the clinician is shown — the audit anchor for this
  // summary, in the same spirit as candidate_output_hash.
  const summary = { ...body, summary_sha256: sha256(JSON.stringify(body)) };
  return PatientHistorySummarySchema.parse(summary);
}
