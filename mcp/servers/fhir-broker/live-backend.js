/**
 * fhir-broker live backend (FLOW_PLAN H1, #16) — Node adapter to an EXTERNAL,
 * commit-pinned wso2/fhir-mcp-server process. This file is also the harvest
 * MARKER the licence gate keys off (harvest-manifest override_existing_targets):
 * its existence means "a harvested live backend is wrapped here", so the
 * manifest row #16 must stay licence-verified while this file exists.
 *
 * HARVEST BOUNDARY (no vendored code): wso2/fhir-mcp-server (Apache-2.0,
 * pinned 6307fe719e4d5234b6b1d87a2c49e3eef296d82a, v0.10.0) runs as a SEPARATE
 * process (uvx fhir-mcp-server / docker) fronting a FHIR R4 base URL
 * (FHIR_SERVER_BASE_URL on the wso2 side). This adapter speaks MCP
 * streamable-HTTP to it and maps results onto the EXISTING fhir_read /
 * fhir_search contract shapes ({ resource|bundle, receipt }) — the contract
 * the mock produces is unchanged, so downstream (pipeline retrieval, parser,
 * verifier) needs no change. Mock remains the default and the rollback.
 *
 * SAFETY:
 * - FAIL-SAFE: any transport/tool error, timeout, or unparseable result
 *   returns { resource|bundle: null } with an error-carrying receipt — NEVER a
 *   fabricated resource (fail-safe default: missing proof → blocked, not
 *   substituted).
 * - Receipts carry mode "live" so the mode-normaliser (C16) semantics apply:
 *   in mock/dev contexts live receipts are simply recorded; mock receipts on a
 *   staging/production path stay BLOCKED.
 * - PUBLIC SANDBOX REFUSED IN PRODUCTION: the H1 smoke target is a public
 *   synthetic-data sandbox (e.g. hapi.fhir.org). Like the M11 terminology
 *   dev_sandbox rule, resolveFhirMcpEndpoint() throws if HEYDOC_MODE_DEFAULT
 *   is production and the declared upstream is a known public sandbox —
 *   public test data must never ground production clinical output.
 * - Raw Observation values pass through UNTOUCHED here and therefore MUST be
 *   routed through the deterministic investigation parser before any LLM
 *   context (no-raw-lab hard limit) — see integration/record-sources/.
 * No new dependency — Node 20 global fetch; JSON-RPC framing is ~40 lines.
 */

import { randomUUID } from "node:crypto";
import { normaliseMode } from "../../../verification/mode.js";

/** Public synthetic-data FHIR sandboxes — smoke targets only, never production. */
export const PUBLIC_SANDBOX_HOSTS = [
  "hapi.fhir.org",
  "server.fire.ly",
  "r4.smarthealthit.org",
  "launch.smarthealthit.org",
];

/**
 * Resolve the live MCP endpoint config from env. Returns null for the MOCK
 * path (endpoint unset or "mock" — the rollback default). Throws on a
 * placeholder endpoint, on a live endpoint with no declared upstream base,
 * and on a public-sandbox upstream in production.
 *
 * Env contract:
 *   HEYDOC_FHIR_MCP_ENDPOINT   URL of the running wso2 fhir-mcp-server
 *                              (streamable HTTP), or "mock"/unset for mock.
 *   HEYDOC_FHIR_UPSTREAM_BASE  The FHIR base URL that wso2 process fronts
 *                              (operator-declared; recorded in receipts).
 *
 * @param {Record<string,string|undefined>} env
 * @returns {{ mcp_url: string, upstream_base: string, upstream_host: string }|null}
 */
export function resolveFhirMcpEndpoint(env) {
  const raw = ((env.HEYDOC_FHIR_MCP_ENDPOINT || "mock").trim()) || "mock";
  if (raw === "mock") return null; // mock path — the rollback default
  if (raw.startsWith("<") || raw.includes("example.invalid")) {
    throw new Error("HEYDOC_FHIR_MCP_ENDPOINT is a placeholder — set the real wso2 fhir-mcp-server URL or 'mock'");
  }
  const upstream_base = (env.HEYDOC_FHIR_UPSTREAM_BASE || "").trim();
  if (!upstream_base || upstream_base.startsWith("<") || upstream_base.includes("example.invalid")) {
    throw new Error("HEYDOC_FHIR_UPSTREAM_BASE must declare the FHIR base URL the wso2 process fronts (recorded in receipts)");
  }
  let upstream_host;
  try {
    // Use hostname (not host) so an explicit :port can't slip a sandbox past the
    // guard, and strip a trailing FQDN dot — "hapi.fhir.org." resolves to the
    // same server but would otherwise match neither the equality nor the suffix
    // test. Fail-safe host normalisation for the sandbox check below.
    upstream_host = new URL(upstream_base).hostname.replace(/\.$/, "").toLowerCase();
  } catch {
    throw new Error(`HEYDOC_FHIR_UPSTREAM_BASE is not a valid URL: ${upstream_base}`);
  }
  // Fail-safe: public synthetic sandboxes are smoke targets — never production.
  const envMode = (env.HEYDOC_MODE_DEFAULT || "").trim();
  if (envMode === "production" && PUBLIC_SANDBOX_HOSTS.some((h) => upstream_host === h || upstream_host.endsWith(`.${h}`))) {
    throw new Error(`FHIR upstream '${upstream_host}' is a PUBLIC SANDBOX (synthetic test data) — REFUSED in production`);
  }
  return { mcp_url: raw.replace(/\/$/, ""), upstream_base: upstream_base.replace(/\/$/, ""), upstream_host };
}

/**
 * Decide which path a fhir-broker request takes. PURE (no I/O) so it is
 * unit-testable without the stdio server. Returns one of:
 *   { kind: "mock",    mode }  — serve the templated mock resource (dev/rollback)
 *   { kind: "live",    cfg  }  — call the wso2 live backend
 *   { kind: "blocked", mode:"live" } — mode normalises to live but NO endpoint set
 *
 * THE C1 INVARIANT: rollback-to-mock (endpoint unset ⇒ mock) is safe in a
 * mock/dry_run context but MUST NOT happen in a live one — serving a mock
 * resource under a mode:"live" receipt would present mock as live (the C16 /
 * mock-never-as-live invariant). A live context with no endpoint BLOCKS.
 *
 * @param {Record<string,string|undefined>} env
 * @param {string|undefined} requestedMode  the request's mode field
 * @param {string} defaultMode              server env default (HEYDOC_MODE_DEFAULT)
 */
export function chooseFhirRoute(env, requestedMode, defaultMode) {
  const { context_mode } = normaliseMode(requestedMode || defaultMode);
  if (context_mode !== "live") return { kind: "mock", mode: context_mode };
  const cfg = resolveFhirMcpEndpoint(env); // null ⇒ no live endpoint configured
  return cfg ? { kind: "live", cfg } : { kind: "blocked", mode: "live" };
}

function receipt(cfg, tool, extra = {}) {
  return {
    request_id: `fhir-live-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    upstream: cfg.upstream_base,
    mode: "live",
    server: "fhir-broker",
    tool,
    ...extra,
  };
}

/** Parse a streamable-HTTP response body: plain JSON or an SSE stream. */
async function parseRpcResponse(res, id) {
  const ctype = (res.headers && typeof res.headers.get === "function" ? res.headers.get("content-type") : "") || "";
  const bodyText = await res.text();
  if (ctype.includes("text/event-stream")) {
    // Take the last data: event whose JSON-RPC id matches (responses may be
    // preceded by server notifications on the same stream).
    let match = null;
    for (const line of bodyText.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      try {
        const msg = JSON.parse(line.slice(5).trim());
        if (msg && msg.id === id) match = msg;
      } catch {
        /* ignore non-JSON keepalives */
      }
    }
    return match;
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

/**
 * Minimal MCP streamable-HTTP session: initialize once per endpoint, then
 * tools/call. Session ids are cached per mcp_url for the process lifetime.
 * fetchImpl is injectable so contract tests run fully offline.
 */
const sessions = new Map();

async function rpc(cfg, method, params, { fetchImpl, timeoutMs = 8000, sessionId } = {}) {
  const doFetch = fetchImpl || fetch;
  const id = randomUUID();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const res = await doFetch(cfg.mcp_url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: ctrl.signal,
    });
    if (!res || !res.ok) return { error: `HTTP ${res ? res.status : "no-response"}` };
    const msg = await parseRpcResponse(res, id);
    if (!msg) return { error: "unparseable JSON-RPC response" };
    if (msg.error) return { error: `rpc: ${msg.error.message || JSON.stringify(msg.error)}` };
    const newSession = res.headers && typeof res.headers.get === "function" ? res.headers.get("mcp-session-id") : null;
    return { result: msg.result, sessionId: newSession || sessionId || null };
  } catch (e) {
    return { error: e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function ensureSession(cfg, opts = {}) {
  const cached = sessions.get(cfg.mcp_url);
  if (cached) return { sessionId: cached };
  const init = await rpc(
    cfg,
    "initialize",
    {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "heydoc-fhir-broker-live-backend", version: "0.1.0" },
    },
    opts
  );
  if (init.error) return { error: `initialize failed: ${init.error}` };
  if (init.sessionId) {
    sessions.set(cfg.mcp_url, init.sessionId);
    // Required by the spec after a successful initialize; fire-and-forget.
    const doFetch = opts.fetchImpl || fetch;
    try {
      await doFetch(cfg.mcp_url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-session-id": init.sessionId,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });
    } catch {
      /* non-fatal */
    }
  }
  return { sessionId: init.sessionId || null };
}

/** Extract the tool payload from an MCP tools/call result. Fail-safe null. */
function toolPayload(result) {
  if (!result) return null;
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
  const textItem = Array.isArray(result.content) ? result.content.find((c) => c && c.type === "text") : null;
  if (!textItem || typeof textItem.text !== "string") return null;
  try {
    return JSON.parse(textItem.text);
  } catch {
    return null;
  }
}

async function callTool(cfg, tool, args, opts = {}) {
  const s = await ensureSession(cfg, opts);
  if (s.error) return { error: s.error };
  const call = await rpc(cfg, "tools/call", { name: tool, arguments: args }, { ...opts, sessionId: s.sessionId });
  if (call.error) return { error: call.error };
  if (call.result && call.result.isError) {
    const textItem = Array.isArray(call.result.content) ? call.result.content.find((c) => c && c.type === "text") : null;
    return { error: `tool error: ${(textItem && textItem.text) || "unknown"}` };
  }
  const payload = toolPayload(call.result);
  if (payload === null) return { error: "empty/unparseable tool result" };
  return { payload };
}

/**
 * Live fhir_read via the wso2 `read` tool. Same result shape as the mock:
 * { resource, receipt }. Fail-safe: { resource: null, receipt(+error) }.
 */
export async function fhirReadLive(cfg, { resource_type, id }, opts = {}) {
  const r = await callTool(cfg, "read", { type: resource_type, id: id || "", searchParam: {} }, opts);
  if (r.error) {
    return { resource: null, receipt: receipt(cfg, "read", { error: { code: "LIVE_READ_FAILED", message: r.error, retryable: true } }) };
  }
  const payload = r.payload;
  // A read may come back as the resource itself or wrapped in a Bundle.
  const resource =
    payload && payload.resourceType === "Bundle"
      ? ((payload.entry || [])[0] || {}).resource || null
      : payload && payload.resourceType
        ? payload
        : null;
  return { resource, receipt: receipt(cfg, "read") };
}

/**
 * Live fhir_search via the wso2 `search` tool. Same result shape as the mock:
 * { bundle, receipt }. Fail-safe: { bundle: null, receipt(+error) } — never a
 * fabricated empty searchset.
 */
export async function fhirSearchLive(cfg, { resource_type, params }, opts = {}) {
  const r = await callTool(cfg, "search", { type: resource_type, searchParam: params || {} }, opts);
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

/** Test seam: reset cached MCP sessions (used by the contract test only). */
export function _resetSessions() {
  sessions.clear();
}
