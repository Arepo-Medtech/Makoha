/**
 * docs live backend (FLOW_PLAN H2, #1 anthropics/healthcare, first-party, pinned
 * dff06a1b02fe6727b236d9f12565a0df93fd0672). This file is ALSO the harvest MARKER
 * the licence gate keys off (harvest-manifest override_existing_targets:
 * "mcp/servers/docs" -> this file): its existence means "a harvested live backend
 * is wrapped here", so manifest row #1 must stay licence-cleared (first_party)
 * while this file exists — see scripts/check-licence-clearance.mjs harvestPresent().
 *
 * OVERRIDE, NOT REBUILD: the docs mock (index.js) keeps its EXACT docs_search /
 * docs_get / docs_cite contract and its canned-citation mock behaviour (so
 * test/contract-docs.js stays green). This seam only adds an input-gated LIVE
 * route to the #1 anthropics/healthcare PubMed / FHIR-dev backend. Mock is the
 * default and the rollback.
 *
 * SAFETY (same posture as fhir-broker/live-backend.js, H1):
 * - MOCK-NEVER-AS-LIVE (C16): a live context with NO endpoint BLOCKS; the mock
 *   citations must never be served under a mode:"live" receipt.
 * - FAIL-SAFE: a live call error yields no fabricated citation (caller degrades).
 * - PATIENT-GATED: docs retrieval is patient_eligible:false until H3 MIRAGE.
 * No new dependency — Node 20 global fetch; input-gated (unset ⇒ mock).
 */
import { normaliseMode } from "../../../verification/mode.js";

/** null ⇒ MOCK path (rollback default). Throws on a placeholder endpoint. */
export function resolveDocsEndpoint(env) {
  const raw = ((env.HEYDOC_DOCS_ENDPOINT || "mock").trim()) || "mock";
  if (raw === "mock") return null;
  if (raw.startsWith("<") || raw.includes("example.invalid")) {
    throw new Error("HEYDOC_DOCS_ENDPOINT is a placeholder — set the real #1 anthropics/healthcare backend URL or 'mock'");
  }
  return { endpoint: raw.replace(/\/$/, ""), upstream: "anthropics/healthcare@dff06a1b" };
}

/**
 * PURE route decision (no I/O). Returns:
 *   { kind:"mock",    mode }         — serve the existing mock/dry_run docs behaviour
 *   { kind:"live",    cfg }          — call the #1 backend (input-gated)
 *   { kind:"blocked", mode:"live" }  — live context but NO endpoint (mock-never-as-live)
 * For any non-live context this returns kind:"mock" and the caller runs its
 * UNCHANGED mock/dry_run path — so the docs contract is preserved verbatim.
 */
export function chooseDocsRoute(env, requestedMode, defaultMode) {
  const { context_mode } = normaliseMode(requestedMode || defaultMode);
  if (context_mode !== "live") return { kind: "mock", mode: context_mode };
  const cfg = resolveDocsEndpoint(env);
  return cfg ? { kind: "live", cfg } : { kind: "blocked", mode: "live" };
}
