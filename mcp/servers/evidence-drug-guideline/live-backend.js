/**
 * evidence-drug-guideline live backend (FLOW_PLAN H2, #15 JamesANZ/medical-mcp,
 * MIT, pinned 13d2fddd8925239284b9c98d2143f59417bebce7). Node adapter seam to the
 * EXTERNAL pinned #15 MCP process (drug-interaction / paediatric / guideline). No
 * vendored code — the MIT server runs as a SEPARATE process; this adapter maps
 * results onto the common evidence_search → { results[], receipt } contract. Mock
 * (index.js) remains the default and the rollback.
 *
 * HARD BOUNDARY (G9 / §1 dose-source-singular): #15 output is ADVISORY. Whether
 * mock or (future) live, EVERY result crosses assertNoDose() before it leaves the
 * server — a live adapter can NEVER introduce a dose field. The pharmacology
 * firewall (Trunk 8.0 PharmCheck) is the sole dose source; this seam does not and
 * cannot change that.
 *
 * SAFETY (same posture as fhir-broker / evidence-fda-pubmed):
 * - FAIL-SAFE: any transport/tool error → { results: [] } + error receipt.
 * - MOCK-NEVER-AS-LIVE: a live context with no endpoint BLOCKS.
 * - PATIENT-GATED: patient_eligible:false until H3 MIRAGE.
 */
import { normaliseMode } from "../../../verification/mode.js";

/** null ⇒ MOCK path (rollback default). Throws on a placeholder endpoint. */
export function resolveDrugGuidelineEndpoint(env) {
  const raw = ((env.HEYDOC_EVIDENCE_DRUG_GUIDELINE_ENDPOINT || "mock").trim()) || "mock";
  if (raw === "mock") return null;
  if (raw.startsWith("<") || raw.includes("example.invalid")) {
    throw new Error("HEYDOC_EVIDENCE_DRUG_GUIDELINE_ENDPOINT is a placeholder — set the real #15 MCP server URL or 'mock'");
  }
  return { mcp_url: raw.replace(/\/$/, ""), upstream: "JamesANZ/medical-mcp@13d2fddd" };
}

/**
 * PURE route decision (no I/O). mock | live | blocked (live context, no endpoint).
 */
export function chooseDrugGuidelineRoute(env, requestedMode, defaultMode) {
  const { context_mode } = normaliseMode(requestedMode || defaultMode);
  if (context_mode !== "live") return { kind: "mock", mode: context_mode };
  const cfg = resolveDrugGuidelineEndpoint(env);
  return cfg ? { kind: "live", cfg } : { kind: "blocked", mode: "live" };
}
