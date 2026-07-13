/**
 * Structured JSON → FHIR mapping (MI-13; execution plan §4.3 Stage 5).
 *
 * Maps a StructuredDoc (Stage 3 output: observations / problems / medications /
 * reports) to AU Core FHIR R4 resources, then submits them to the fhir-broker #16
 * write path → the (AU)PAIR store.
 *
 * INVARIANTS carried from upstream (never re-derived here):
 *   - NO fabricated codes: an entity is coded ONLY if it carries a `coding` that
 *     passed the terminology coding-gate (MI-06/07). An unresolved entity maps to a
 *     free-text element (code.text / valueString) — NEVER an invented coded field.
 *   - Non-conformant resources do NOT enter the store: each mapped resource is
 *     validated against its vendored AU Core StructureDefinition first; a
 *     non_conformant resource is blocked, not written.
 * The store WRITE itself is fhir-broker's job (SAFE_STUB 'unavailable' in mock; live
 * at deploy) — this module maps + validates + submits, it never fabricates a write.
 */
import { validateResource } from "../../mcp/servers/fhir-broker/conformance.js";

const AU = "http://hl7.org.au/fhir/core/StructureDefinition";
export const PROFILE = {
  Condition: `${AU}/au-core-condition`,
  Observation: `${AU}/au-core-diagnosticresult`,
  MedicationRequest: `${AU}/au-core-medicationrequest`,
};

/** code element: coding when the entity passed the coding-gate, else free-text only. */
function codeableConcept(entity) {
  if (entity.coding && entity.coding.code) {
    return { coding: [{ system: entity.coding.system, code: entity.coding.code, ...(entity.coding.display ? { display: entity.coding.display } : {}) }], ...(entity.text ? { text: entity.text } : {}) };
  }
  return { text: entity.text || "(unspecified)" }; // quarantined — no fabricated code
}

/**
 * Map a StructuredDoc to AU Core FHIR resources.
 * @param {{ subject_ref: string, observations?: object[], problems?: object[], medications?: object[], reports?: object[] }} doc
 * @param {{ now?: () => number }} [opts]
 * @returns {{ resources: object[], quarantined: object[] }}
 */
export function structuredDocToFhir(doc, { now = () => Date.now() } = {}) {
  if (!doc || typeof doc.subject_ref !== "string") throw new TypeError("structuredDocToFhir requires doc.subject_ref (encounter-scoped subject reference)");
  const subject = { reference: doc.subject_ref };
  const when = new Date(now()).toISOString();
  const resources = [];
  const quarantined = [];
  const noteQuarantine = (kind, e) => { if (!(e.coding && e.coding.code)) quarantined.push({ kind, text: e.text || null, reason: "no validated code — stored as free-text, not coded" }); };

  for (const e of doc.problems || []) {
    noteQuarantine("problem", e);
    resources.push({
      resourceType: "Condition", meta: { profile: [PROFILE.Condition] },
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "problem-list-item" }] }],
      code: codeableConcept(e), subject,
    });
  }
  for (const e of doc.observations || []) {
    noteQuarantine("observation", e);
    resources.push({
      resourceType: "Observation", meta: { profile: [PROFILE.Observation] },
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
      code: codeableConcept(e), subject, effectiveDateTime: when,
      // Values arrive as the sanitised/observed string; the store is the source of
      // truth and the sanitiser applies only on the LLM-context path, not here.
      ...(e.value !== undefined ? { valueString: String(e.value) } : {}),
    });
  }
  for (const e of doc.medications || []) {
    noteQuarantine("medication", e);
    resources.push({
      resourceType: "MedicationRequest", meta: { profile: [PROFILE.MedicationRequest] },
      status: "active", intent: "order",
      medicationCodeableConcept: codeableConcept(e), subject, authoredOn: when,
      requester: { display: "unknown (ingested record)" },
    });
  }
  for (const e of doc.reports || []) {
    // Imaging/other reports enter as TEXT. No AU Core profile is vendored for
    // DiagnosticReport, so it maps to base FHIR R4 (conformance not_evaluated).
    resources.push({
      resourceType: "DiagnosticReport", status: "final",
      code: codeableConcept(e), subject, effectiveDateTime: when,
      ...(e.text ? { conclusion: e.text } : {}),
    });
  }
  return { resources, quarantined };
}

/** The mock write path (fhir-broker fhir_write is a SAFE_STUB): unavailable, never fabricated. */
async function mockWrite(resource) {
  return { status: "unavailable", reason: "no EHR write in mock (fhir-broker fhir_write SAFE_STUB)", resource_type: resource.resourceType };
}

/**
 * Validate each resource against AU Core and submit conformant ones to the store.
 * Non-conformant resources are BLOCKED (never written). DiagnosticReport (no vendored
 * AU Core profile) is treated as not_evaluated and allowed as base FHIR.
 * @param {object[]} resources
 * @param {{ write?: (r: object) => Promise<object>, validate?: Function }} [opts]
 * @returns {Promise<{ landed: object[], blocked: object[] }>}
 */
export async function submitToFhir(resources, { write = mockWrite, validate = validateResource } = {}) {
  const landed = [];
  const blocked = [];
  for (const resource of resources) {
    const profileUrl = (resource.meta && resource.meta.profile && resource.meta.profile[0]) || undefined;
    const { conformance } = validate(resource, profileUrl);
    const auCoreValidated = profileUrl != null; // DiagnosticReport has no AU Core profile
    if (auCoreValidated && conformance.status !== "conformant") {
      blocked.push({ resourceType: resource.resourceType, conformance });
      continue;
    }
    const write_result = await write(resource);
    landed.push({ resourceType: resource.resourceType, conformance: auCoreValidated ? conformance.status : "not_evaluated", write_result });
  }
  return { landed, blocked };
}
