/**
 * record-sources — patient-record ingestion spine (FLOW_PLAN H1).
 *
 * FIRST-PARTY CLEAN-ROOM BUILD. FLOW_PLAN's H1 named the Fasten Sources library
 * as the SMART-on-FHIR client to wrap; at H1 that upstream was found PRIVATE/404
 * with NO detected licence for any version (see integration/harvest-manifest.json
 * dir-fasten-sources, downgraded ADOPT→REFERENCE). No Fasten code is read or
 * copied. This module is built from the PUBLIC SMART App Launch standard alone
 * (a clean-room implementation of a public spec), so it carries no third-party
 * licence obligation and passes the licence floor.
 *
 * WHAT IT DOES. It is the boundary every provider record crosses before any
 * trunk sees it, in this fixed order (Trust Boundary 4 + the no-raw-lab hard
 * limit):
 *
 *   provider record (FHIR R4, from fhir-broker: mock or wso2 live #16)
 *        │
 *        ▼  ingestBundle()
 *   ┌─ Observation? ─ yes ─▶ investigation-parser sanitiseInvestigation()  (C3)
 *   │                          → qualitative lab_result fact (NO raw number)
 *   │                          → session-store putWorkingState()            (C8)
 *   └─ other resource ─────▶ encounter-scoped REFERENCE only (resourceType+id)
 *                              → session-store; demographics are dropped, the
 *                                demographic guard refuses any that slip through
 *
 * INVARIANTS ENFORCED HERE:
 * - Raw lab numbers never leave this module. Only the parser's qualitative
 *   fact is stored; the raw Observation is not persisted anywhere.
 * - Demographics never persist. Non-clinical resources are reduced to a bare
 *   {resourceType, id} reference; the session-store demographic guard is the
 *   backstop (it throws on any demographic-shaped value).
 * - Everything is encounter-scoped: state lives only between openEncounter()
 *   and closeEncounter(); closing destroys it (session-store C8).
 *
 * The actual network fetch is delegated to the fhir-broker contract
 * (fhir_read/fhir_search), so mock is the default and the wso2 live backend is
 * a drop-in behind the same shapes. Live provider connection (SMART-on-FHIR
 * OAuth2) is input-gated on credentials via the secrets manager — this module
 * ships the client scaffold and the ingest boundary, not live provider auth.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitiseInvestigation } from "../../verification/investigation-parser.js";
import { putWorkingState, listWorkingState, getWorkingState } from "../../verification/session-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** AU provider directory (My Health Record etc.) — a named first-party build. */
export const AU_PROVIDERS = JSON.parse(
  readFileSync(join(__dirname, "au-providers/au-providers.json"), "utf8")
);

/**
 * Build a SMART App Launch authorization-request shape for an AU provider.
 * Standards-based (SMART App Launch 2.0.0), scaffold only — it constructs the
 * request parameters an OAuth2 authorize call would use; it does NOT hold or
 * inject any secret (client secrets / launch tokens come from the secrets
 * manager at deploy time, never this repo — <security_and_secrets>).
 *
 * @param {string} providerId  key in au-providers.json
 * @param {{ redirect_uri: string, scope?: string, state: string }} opts
 * @returns {{ authorize_url: string, params: Record<string,string>, provider: object }}
 */
export function buildAuthorizeRequest(providerId, { redirect_uri, scope, state } = {}) {
  const provider = AU_PROVIDERS.providers.find((p) => p.id === providerId);
  if (!provider) throw new Error(`record-sources: unknown AU provider "${providerId}"`);
  if (provider.status !== "available") {
    throw new Error(`record-sources: provider "${providerId}" is ${provider.status} — live connection input-gated (credentials + conformance)`);
  }
  if (!redirect_uri || !state) throw new Error("record-sources: buildAuthorizeRequest requires redirect_uri and state");
  const params = {
    response_type: "code",
    client_id: provider.client_id_ref, // a REFERENCE to the secrets-manager key, never a secret
    redirect_uri,
    scope: scope || provider.default_scope,
    state,
    aud: provider.fhir_base_url,
  };
  return { authorize_url: provider.authorize_endpoint, params, provider };
}

/** Extract a numeric value + unit + LOINC from a FHIR R4 Observation, if present. */
function observationValue(obs) {
  const q = obs && obs.valueQuantity;
  if (!q || typeof q.value !== "number") return null;
  const loinc = ((obs.code && obs.code.coding) || []).find((c) => c && c.system === "http://loinc.org");
  return {
    loinc: loinc ? loinc.code : undefined,
    analyte: (obs.code && obs.code.text) || (loinc && loinc.display) || undefined,
    value: q.value,
    unit: q.unit || q.code,
  };
}

/**
 * Reduce any non-lab resource to an encounter-scoped reference. We deliberately
 * keep ONLY resourceType + id (+ status when clinically benign) — never a name,
 * DOB, address, identifier, or any demographic field. This is what a downstream
 * trunk is allowed to hold (Trust Boundary 4).
 */
function toEncounterReference(resource) {
  return {
    resourceType: resource.resourceType,
    id: resource.id || null,
    ...(typeof resource.status === "string" ? { status: resource.status } : {}),
  };
}

/**
 * Ingest one FHIR resource into an OPEN encounter. Observations are sanitised
 * to a qualitative fact (raw number stripped) and stored; every other resource
 * is stored as a bare reference. Returns what was stored (for logging/tests),
 * never the raw value.
 *
 * @returns {{ kind: "lab_fact"|"reference", key: string, stored: object, recognised?: boolean }}
 */
export function ingestResource(sessionRef, resource) {
  if (!resource || typeof resource !== "object" || !resource.resourceType) {
    throw new Error("record-sources: ingestResource requires a FHIR resource with a resourceType");
  }
  if (resource.resourceType === "Observation") {
    const raw = observationValue(resource);
    if (raw) {
      // C3: the ONLY path a lab value takes toward context. sanitiseInvestigation
      // returns a qualitative fact whose value string carries no digit from the
      // raw number, plus a dataset receipt. The raw Observation is not stored.
      const { fact, recognised } = sanitiseInvestigation(raw);
      const key = `lab:${fact.fact_id}`;
      putWorkingState(sessionRef, key, fact);
      return { kind: "lab_fact", key, stored: fact, recognised };
    }
    // Observation with no numeric value (e.g. a coded finding) → reference only.
  }
  const ref = toEncounterReference(resource);
  const key = `res:${ref.resourceType}:${ref.id || "anon"}`;
  putWorkingState(sessionRef, key, ref); // session-store demographic guard is the backstop
  return { kind: "reference", key, stored: ref };
}

/**
 * Ingest a FHIR searchset/collection Bundle into an OPEN encounter. Walks
 * entries in order; each crosses the same boundary. Returns a summary — counts
 * and the stored keys — never any raw value.
 *
 * @returns {{ lab_facts: number, references: number, unrecognised_labs: number, keys: string[] }}
 */
export function ingestBundle(sessionRef, bundle) {
  const entries = (bundle && Array.isArray(bundle.entry) ? bundle.entry : [])
    .map((e) => e && e.resource)
    .filter(Boolean);
  const summary = { lab_facts: 0, references: 0, unrecognised_labs: 0, keys: [] };
  for (const resource of entries) {
    const r = ingestResource(sessionRef, resource);
    summary.keys.push(r.key);
    if (r.kind === "lab_fact") {
      summary.lab_facts++;
      if (r.recognised === false) summary.unrecognised_labs++;
    } else {
      summary.references++;
    }
  }
  return summary;
}

/**
 * Assemble the encounter's stored working state into the shape a ContextPacket
 * builder consumes: sanitised facts + bare references. Read-only; only works
 * while the encounter is open (session-store refuses a closed/unknown ref).
 *
 * @returns {{ facts: object[], references: object[] }}
 */
export function collectEncounterFacts(sessionRef) {
  const facts = [];
  const references = [];
  for (const key of listWorkingState(sessionRef)) {
    const v = getWorkingState(sessionRef, key);
    if (key.startsWith("lab:")) facts.push(v);
    else references.push(v);
  }
  return { facts, references };
}
