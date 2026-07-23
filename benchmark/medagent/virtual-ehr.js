/**
 * Benchmark-scoped virtual FHIR EHR (Mechanical Inventory B2, MA.1).
 *
 * MedAgentBench needs a FHIR sandbox the agent-under-test queries and writes to. We do NOT
 * build a new FHIR engine: this is a thin, in-memory, benchmark-only store that REUSES the
 * existing fhir-broker AU Core conformance validator (mcp/servers/fhir-broker/conformance.js
 * validateResource) — the same mechanical AU-Core gate the case-factory uses. It mirrors the
 * fhir_read / fhir_search shape of the fhir-broker mock contract.
 *
 * HARD boundaries (why this can never leak):
 *   - IN-MEMORY + NON-PERSISTENT: a fresh Map per sandbox; nothing is written to disk, no
 *     live/real FHIR endpoint is ever contacted. It is a sandbox, not a route to patient data.
 *   - SYNTHETIC-ONLY: it is seeded ONLY from the (dev-authored, synthetic) task corpus.
 *   - The fhir-broker server + its live backend are NEVER touched — we import ONLY the pure
 *     conformance validator, so instantiating a sandbox cannot flip any live-mode marker.
 */
import { validateResource } from "../../mcp/servers/fhir-broker/conformance.js";

/**
 * Create an isolated benchmark FHIR sandbox.
 * @returns {{
 *   seed(resources:object[]): Array<{ref:string,status:string,profile:string|null,ig_version:string}>,
 *   read(sel:{resourceType:string,id:string}): object|null,
 *   search(sel:{resourceType:string,where?:(r:object)=>boolean}): object[],
 *   validate(resource:object): object,
 *   size(): number,
 *   seedReport(): object[]
 * }}
 */
export function createVirtualEhr() {
  const store = new Map(); // `${resourceType}/${id}` -> resource
  const seedResults = [];

  return {
    /** Seed synthetic resources; each is AU-Core-validated and its conformance recorded. */
    seed(resources) {
      for (const r of resources) {
        if (!r || !r.resourceType || !r.id) {
          throw new Error("virtual-ehr.seed: every resource needs resourceType + id (synthetic sandbox)");
        }
        const conf = validateResource(r).conformance;
        store.set(`${r.resourceType}/${r.id}`, r);
        seedResults.push({ ref: `${r.resourceType}/${r.id}`, status: conf.status, profile: conf.profile, ig_version: conf.ig_version });
      }
      return seedResults;
    },
    /** fhir_read analogue. */
    read({ resourceType, id }) {
      return store.get(`${resourceType}/${id}`) || null;
    },
    /** fhir_search analogue (optional predicate over the resource). */
    search({ resourceType, where } = {}) {
      const out = [];
      for (const r of store.values()) {
        if (r.resourceType === resourceType && (!where || where(r))) out.push(r);
      }
      return out;
    },
    /** Expose the AU-Core validator so the scorer (MA.2) can gate an agent's write action. */
    validate(resource) {
      return validateResource(resource).conformance;
    },
    size() {
      return store.size;
    },
    seedReport() {
      return seedResults;
    },
  };
}
