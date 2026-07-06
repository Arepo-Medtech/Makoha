/**
 * evidence-fda-pubmed live backend (FLOW_PLAN H2, #14 Cicatriiz/healthcare-mcp-public,
 * MIT, pinned 1c4c40c3bb63b94ecf71f972d9806c76e7ffee7b). Node adapter seam to the
 * EXTERNAL pinned #14 MCP process (FDA / PubMed / ClinicalTrials / ICD-10). No
 * vendored code — the MIT server runs as a SEPARATE process; this adapter speaks
 * MCP and maps results onto the common evidence_search → { results[], receipt }
 * contract. Mock (index.js) remains the default and the rollback.
 *
 * SAFETY (identical posture to fhir-broker/live-backend.js, H1):
 * - FAIL-SAFE: any transport/tool error → { results: [] } with an error-carrying
 *   receipt — never a fabricated literature result.
 * - mode:"live" on live receipts, so the mode-normaliser (C16) applies.
 * - MOCK-NEVER-AS-LIVE: a live context with NO endpoint configured BLOCKS; it
 *   must never fall back to serving mock results under a live receipt.
 * - PATIENT-GATED: retrieval is patient_eligible:false until the H3 MIRAGE gate
 *   scores it (see _shared/evidence-map.js). This seam does not change that.
 * - Egress is operator-scoped (allow-list) at deploy; no keys are read here.
 * No new dependency — Node 20 global fetch; input-gated (unset ⇒ mock).
 */
import { normaliseMode } from "../../../verification/mode.js";

/**
 * Resolve the live endpoint from env. null ⇒ the MOCK path (rollback default).
 * Throws on a placeholder endpoint (fail-safe: never call a placeholder host).
 * @param {Record<string,string|undefined>} env
 */
export function resolveEvidenceEndpoint(env) {
  const raw = ((env.HEYDOC_EVIDENCE_FDA_PUBMED_ENDPOINT || "mock").trim()) || "mock";
  if (raw === "mock") return null;
  if (raw.startsWith("<") || raw.includes("example.invalid")) {
    throw new Error("HEYDOC_EVIDENCE_FDA_PUBMED_ENDPOINT is a placeholder — set the real #14 MCP server URL or 'mock'");
  }
  return { mcp_url: raw.replace(/\/$/, ""), upstream: "Cicatriiz/healthcare-mcp-public@1c4c40c3" };
}

/**
 * Decide the route. PURE (no I/O) so it is unit-testable without the transport.
 *   { kind:"mock",    mode }            — serve the deterministic mock (dev/rollback)
 *   { kind:"live",    cfg }             — call the external #14 process
 *   { kind:"blocked", mode:"live" }     — live context but NO endpoint (mock-never-as-live)
 * @param {Record<string,string|undefined>} env
 * @param {string|undefined} requestedMode
 * @param {string} defaultMode
 */
export function chooseEvidenceRoute(env, requestedMode, defaultMode) {
  const { context_mode } = normaliseMode(requestedMode || defaultMode);
  if (context_mode !== "live") return { kind: "mock", mode: context_mode };
  const cfg = resolveEvidenceEndpoint(env);
  return cfg ? { kind: "live", cfg } : { kind: "blocked", mode: "live" };
}
