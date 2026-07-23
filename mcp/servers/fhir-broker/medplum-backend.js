/**
 * fhir-broker Medplum backend (Mechanical Inventory Phase C, #medplum) — Node adapter to a
 * self-hosted Medplum FHIR R4 server. Medplum is the DECISION for the fhir-broker backend +
 * system-of-record (ADR docs/structure-notes/fhir-backend-and-record-architecture-adr.md):
 * a headless, developer-centric, FHIR-native EHR that matches the Node/TS stack — "one FHIR
 * spine, two views" ((AU)CARE clinician view + (AU)PAIR patient-owned view via AccessPolicies).
 *
 * This file is the harvest MARKER for the Medplum manifest row, exactly like live-backend.js
 * is for wso2 #16: its existence means a Medplum backend is wrapped here.
 *
 * HARVEST BOUNDARY (no vendored code): Medplum (Apache-2.0) runs as a SEPARATE, self-hosted
 * FHIR R4 server (deploy-time, AU residency — see the ADR). This adapter speaks PLAIN FHIR R4
 * REST (Node 20 global fetch — no @medplum/* dependency) and maps results onto the EXISTING
 * fhir_read / fhir_search contract shapes ({ resource|bundle, receipt }) — downstream (pipeline
 * retrieval, parser, verifier) is unchanged. Mock remains the default and the rollback; wso2
 * (live-backend.js) is retained as an alternative/rollback live backend.
 *
 * SAFETY (identical posture to live-backend.js):
 * - FAIL-SAFE: any transport/HTTP/parse error or timeout returns { resource|bundle: null } with
 *   an error-carrying receipt — NEVER a fabricated resource.
 * - Receipts carry mode "live" (mode-normaliser C16 semantics: mock-never-as-live).
 * - RESIDENCY GUARD: in production, a hosted (non-self-host) Medplum SaaS host is REFUSED —
 *   AU patient PHI must sit on the operator's AU-resident self-hosted server, not US SaaS
 *   (Privacy Act / My Health Records Act; ADR + C-5). Mirrors the wso2 public-sandbox refusal.
 * - Raw Observation values pass through UNTOUCHED and MUST route through the deterministic
 *   investigation parser before any LLM context (no-raw-lab hard limit) — see record-sources/.
 * - AUTH: an optional bearer token (HEYDOC_FHIR_MEDPLUM_TOKEN, deploy-injected via the secrets
 *   seam — never in the repo; env templates use example.invalid) is attached when present. Full
 *   OAuth2 client-credentials is the deferred live-connect step (C.3, operator).
 */

import { normaliseMode } from "../../../verification/mode.js";

/** Hosted Medplum SaaS hosts — NOT AU-resident self-host; refused for PHI in production. */
export const HOSTED_MEDPLUM_HOSTS = ["api.medplum.com", "app.medplum.com"];

function isPlaceholder(v) {
  return !v || v.startsWith("<") || v.includes("example.invalid");
}

/**
 * Resolve the Medplum endpoint config from env. Returns null for the MOCK path (endpoint
 * unset or "mock" — the rollback default). Throws on a placeholder endpoint, an invalid URL,
 * and a hosted (non-self-host) Medplum SaaS host in production.
 *
 * Env contract:
 *   HEYDOC_FHIR_MEDPLUM_ENDPOINT  the FHIR R4 BASE URL of the self-hosted Medplum server
 *                                 (e.g. https://fhir.example-clinic.au/fhir/R4), or "mock"/unset.
 *   HEYDOC_FHIR_MEDPLUM_TOKEN     optional bearer token (deploy-injected; never committed).
 *
 * @param {Record<string,string|undefined>} env
 * @returns {{ base: string, host: string, token: string|null }|null}
 */
export function resolveMedplumEndpoint(env) {
  const raw = ((env.HEYDOC_FHIR_MEDPLUM_ENDPOINT || "mock").trim()) || "mock";
  if (raw === "mock") return null; // mock path — the rollback default
  if (raw.startsWith("<") || raw.includes("example.invalid")) {
    throw new Error("HEYDOC_FHIR_MEDPLUM_ENDPOINT is a placeholder — set the self-hosted Medplum FHIR R4 base URL or 'mock'");
  }
  let host;
  try {
    host = new URL(raw).hostname.replace(/\.$/, "").toLowerCase();
  } catch {
    throw new Error(`HEYDOC_FHIR_MEDPLUM_ENDPOINT is not a valid URL: ${raw}`);
  }
  const envMode = (env.HEYDOC_MODE_DEFAULT || "").trim();
  if (envMode === "production" && HOSTED_MEDPLUM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new Error(`Medplum endpoint '${host}' is HOSTED SaaS (not AU-resident self-host) — REFUSED in production (data residency; see ADR)`);
  }
  const rawToken = (env.HEYDOC_FHIR_MEDPLUM_TOKEN || "").trim();
  return { base: raw.replace(/\/$/, ""), host, token: isPlaceholder(rawToken) ? null : rawToken };
}

/**
 * Decide which path a Medplum-backed fhir-broker request takes. PURE (no I/O). Mirrors
 * chooseFhirRoute (wso2). Returns { kind:"mock", mode } | { kind:"live", cfg } |
 * { kind:"blocked", mode:"live" }. THE C1 INVARIANT: a live context with no Medplum endpoint
 * BLOCKS — it never serves a mock resource under a mode:"live" receipt (mock-never-as-live).
 *
 * @param {Record<string,string|undefined>} env
 * @param {string|undefined} requestedMode
 * @param {string} defaultMode
 */
export function chooseMedplumRoute(env, requestedMode, defaultMode) {
  const { context_mode } = normaliseMode(requestedMode || defaultMode);
  if (context_mode !== "live") return { kind: "mock", mode: context_mode };
  const cfg = resolveMedplumEndpoint(env); // null ⇒ no live endpoint configured
  return cfg ? { kind: "live", cfg } : { kind: "blocked", mode: "live" };
}

function receipt(cfg, tool, extra = {}) {
  return {
    request_id: `fhir-medplum-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    upstream: cfg.base,
    mode: "live",
    server: "fhir-broker",
    backend: "medplum",
    tool,
    ...extra,
  };
}

/** Build a FHIR search query string from a params record (fail-safe on odd values). */
function toQuery(params) {
  if (!params || typeof params !== "object") return "";
  const parts = [];
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join("&");
}

/** GET a FHIR resource/bundle over REST. Fail-safe: returns { error } on any failure. */
async function fhirGet(cfg, path, { fetchImpl, timeoutMs = 8000 } = {}) {
  const doFetch = fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { accept: "application/fhir+json" };
    if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
    const res = await doFetch(`${cfg.base}/${path}`, { method: "GET", headers, signal: ctrl.signal });
    if (!res || !res.ok) return { error: `HTTP ${res ? res.status : "no-response"}` };
    const bodyText = await res.text();
    try {
      return { payload: JSON.parse(bodyText) };
    } catch {
      return { error: "unparseable FHIR JSON response" };
    }
  } catch (e) {
    return { error: e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live fhir_read via Medplum FHIR REST. Same result shape as the mock/wso2: { resource, receipt }.
 * Fail-safe: { resource: null, receipt(+error) }. Reads by id, or the first of a _count=1 search.
 */
export async function medplumReadLive(cfg, { resource_type, id }, opts = {}) {
  const path = id ? `${resource_type}/${encodeURIComponent(id)}` : `${resource_type}?_count=1`;
  const r = await fhirGet(cfg, path, opts);
  if (r.error) {
    return { resource: null, receipt: receipt(cfg, "read", { error: { code: "LIVE_READ_FAILED", message: r.error, retryable: true } }) };
  }
  const payload = r.payload;
  const resource =
    payload && payload.resourceType === "Bundle"
      ? ((payload.entry || [])[0] || {}).resource || null
      : payload && payload.resourceType
        ? payload
        : null;
  return { resource, receipt: receipt(cfg, "read") };
}

/**
 * Live fhir_search via Medplum FHIR REST. Same result shape: { bundle, receipt }. Fail-safe:
 * { bundle: null, receipt(+error) } — never a fabricated empty searchset.
 */
export async function medplumSearchLive(cfg, { resource_type, params }, opts = {}) {
  const q = toQuery(params);
  const r = await fhirGet(cfg, `${resource_type}${q ? `?${q}` : ""}`, opts);
  if (r.error) {
    return { bundle: null, receipt: receipt(cfg, "search", { error: { code: "LIVE_SEARCH_FAILED", message: r.error, retryable: true } }) };
  }
  const payload = r.payload;
  const bundle =
    payload && payload.resourceType === "Bundle"
      ? payload
      : payload && payload.resourceType
        ? { resourceType: "Bundle", type: "searchset", total: 1, entry: [{ resource: payload }] }
        : null;
  return { bundle, receipt: receipt(cfg, "search") };
}
