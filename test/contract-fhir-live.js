/**
 * Contract tests for the fhir-broker LIVE backend (FLOW_PLAN H1, #16 wso2 wrap)
 * and the record-sources ingestion spine. <test_and_evaluation_gates> requires
 * deterministic safety code to be tested. UNIT tests with a MOCKED MCP transport
 * (no network, CI-safe); a real HAPI-sandbox call is an OPT-IN smoke test
 * (HEYDOC_FHIR_LIVE_SMOKE=1), skipped by default.
 *
 * Asserts the H1 exit state:
 *   - resolveFhirMcpEndpoint: mock/unset → null (rollback); a live endpoint →
 *     config; placeholder / missing upstream → throws; PUBLIC SANDBOX in
 *     PRODUCTION → REFUSED.
 *   - fhirReadLive / fhirSearchLive: speak MCP streamable-HTTP to the wso2
 *     process, map onto the EXISTING { resource } / { bundle } contract, emit a
 *     Receipt(mode:live); fail-safe to null (never a fabricated resource) on
 *     transport error.
 *   - record-sources ingest: every Observation crosses the investigation parser
 *     (NO raw lab number in the stored fact; sanitised_by present); non-lab
 *     resources become bare references; demographics are refused; state is
 *     destroyed on encounter close (session-store C8).
 * Run from repo root: node test/contract-fhir-live.js
 */
import {
  resolveFhirMcpEndpoint,
  fhirReadLive,
  fhirSearchLive,
  _resetSessions,
  PUBLIC_SANDBOX_HOSTS,
} from "../mcp/servers/fhir-broker/live-backend.js";
import {
  ingestResource,
  ingestBundle,
  collectEncounterFacts,
  buildAuthorizeRequest,
  AU_PROVIDERS,
} from "../integration/record-sources/sources-client.js";
import {
  openEncounter,
  closeEncounter,
  listWorkingState,
  putWorkingState,
  destroyAllEncounters,
} from "../verification/session-store.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
// Probe: hand the session-store guard a raw demographic value directly.
const putWorkingStateProbe = (ref) => putWorkingState(ref, "leak", { name: "Smith", dob: "1970-01-01" });

// ── A fake wso2 fhir-mcp-server over streamable-HTTP (JSON-RPC) ────────────────
// Emulates: initialize → issues mcp-session-id; tools/call read|search → returns
// content[].text = JSON of the resource/bundle. `fail` forces a tool error.
function fakeWso2({ resources = {}, fail = false, sse = false } = {}) {
  const calls = [];
  const jsonResponse = (obj, sessionId) => ({
    ok: true,
    status: 200,
    headers: { get: (n) => (n.toLowerCase() === "mcp-session-id" ? sessionId : sse ? "text/event-stream" : "application/json") },
    text: async () => (sse ? `event: message\ndata: ${JSON.stringify(obj)}\n\n` : JSON.stringify(obj)),
  });
  const fetchImpl = async (url, { body }) => {
    const req = JSON.parse(body);
    calls.push(req.method);
    if (req.method === "initialize") {
      return jsonResponse({ jsonrpc: "2.0", id: req.id, result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "wso2-fake" } } }, "sess-123");
    }
    if (req.method === "notifications/initialized") return { ok: true, status: 202, headers: { get: () => null }, text: async () => "" };
    if (req.method === "tools/call") {
      if (fail) return jsonResponse({ jsonrpc: "2.0", id: req.id, result: { isError: true, content: [{ type: "text", text: "upstream FHIR 502" }] } });
      const { name, arguments: args } = req.params;
      const payload = name === "read" ? (resources[args.type] || [])[0] || { note: "not-found" } : { resourceType: "Bundle", type: "searchset", total: (resources[args.type] || []).length, entry: (resources[args.type] || []).map((r) => ({ resource: r })) };
      return jsonResponse({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } });
    }
    return jsonResponse({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "method not found" } });
  };
  return { fetchImpl, calls };
}

const CFG = { mcp_url: "http://localhost:8000/mcp", upstream_base: "https://hapi.fhir.org/baseR4", upstream_host: "hapi.fhir.org" };

// ── 1. resolveFhirMcpEndpoint ─────────────────────────────────────────────────
check("resolve: unset → mock (null, rollback)", resolveFhirMcpEndpoint({}) === null);
check("resolve: 'mock' → null", resolveFhirMcpEndpoint({ HEYDOC_FHIR_MCP_ENDPOINT: "mock" }) === null);
{
  const r = resolveFhirMcpEndpoint({ HEYDOC_FHIR_MCP_ENDPOINT: "http://localhost:8000/mcp", HEYDOC_FHIR_UPSTREAM_BASE: "https://hapi.fhir.org/baseR4" });
  check("resolve: live endpoint + upstream → config", r && r.mcp_url === "http://localhost:8000/mcp" && r.upstream_host === "hapi.fhir.org");
}
check("resolve: placeholder endpoint → throws", throws(() => resolveFhirMcpEndpoint({ HEYDOC_FHIR_MCP_ENDPOINT: "<set-me>", HEYDOC_FHIR_UPSTREAM_BASE: "https://x/r4" }), /placeholder/));
check("resolve: missing upstream base → throws", throws(() => resolveFhirMcpEndpoint({ HEYDOC_FHIR_MCP_ENDPOINT: "http://localhost:8000/mcp" }), /HEYDOC_FHIR_UPSTREAM_BASE/));
// THE safety guard (mirrors the M11 sandbox rule): public sandbox refused in production.
check("resolve: public sandbox + production → REFUSED", throws(() => resolveFhirMcpEndpoint({ HEYDOC_FHIR_MCP_ENDPOINT: "http://localhost:8000/mcp", HEYDOC_FHIR_UPSTREAM_BASE: "https://hapi.fhir.org/baseR4", HEYDOC_MODE_DEFAULT: "production" }), /PUBLIC SANDBOX.*REFUSED in production/));
check("resolve: public sandbox + staging → allowed", resolveFhirMcpEndpoint({ HEYDOC_FHIR_MCP_ENDPOINT: "http://localhost:8000/mcp", HEYDOC_FHIR_UPSTREAM_BASE: "https://hapi.fhir.org/baseR4", HEYDOC_MODE_DEFAULT: "staging" }).upstream_host === "hapi.fhir.org");
check("PUBLIC_SANDBOX_HOSTS includes hapi.fhir.org", PUBLIC_SANDBOX_HOSTS.includes("hapi.fhir.org"));

// ── 2. Live read/search map onto the existing contract + emit a live receipt ──
const OBS = {
  resourceType: "Observation",
  id: "obs-trop-1",
  status: "final",
  code: { text: "Troponin I", coding: [{ system: "http://loinc.org", code: "10839-9", display: "Troponin I" }] },
  valueQuantity: { value: 52, unit: "ng/L" },
};
{
  _resetSessions();
  const srv = fakeWso2({ resources: { Observation: [OBS] } });
  const out = await fhirReadLive(CFG, { resource_type: "Observation", id: "obs-trop-1" }, { fetchImpl: srv.fetchImpl });
  check("read: initialize precedes tools/call", srv.calls[0] === "initialize" && srv.calls.includes("tools/call"));
  check("read: returns { resource } shape", out.resource && out.resource.resourceType === "Observation" && out.resource.id === "obs-trop-1");
  check("read: receipt mode=live, server=fhir-broker, upstream recorded", out.receipt.mode === "live" && out.receipt.server === "fhir-broker" && out.receipt.upstream === CFG.upstream_base);
  check("read: receipt has request_id + timestamp", typeof out.receipt.request_id === "string" && out.receipt.request_id.length >= 8 && /\dT\d/.test(out.receipt.timestamp_utc));
}
{
  _resetSessions();
  const srv = fakeWso2({ resources: { Observation: [OBS, { ...OBS, id: "obs-trop-2" }] } });
  const out = await fhirSearchLive(CFG, { resource_type: "Observation", params: { patient: "x" } }, { fetchImpl: srv.fetchImpl });
  check("search: returns a searchset Bundle", out.bundle && out.bundle.resourceType === "Bundle" && out.bundle.total === 2);
  check("search: receipt mode=live", out.receipt.mode === "live");
}
// Fail-safe: transport/tool error → null, error-carrying receipt, NEVER fabricated.
{
  _resetSessions();
  const srv = fakeWso2({ fail: true });
  const out = await fhirReadLive(CFG, { resource_type: "Observation", id: "x" }, { fetchImpl: srv.fetchImpl });
  check("read fail-safe: resource null, no fabrication", out.resource === null);
  check("read fail-safe: receipt carries an error code", out.receipt.error && out.receipt.error.code === "LIVE_READ_FAILED");
}
{
  _resetSessions();
  const srv = fakeWso2({ resources: { Observation: [OBS] }, sse: true });
  const out = await fhirReadLive(CFG, { resource_type: "Observation", id: "obs-trop-1" }, { fetchImpl: srv.fetchImpl });
  check("read: SSE-framed response also parsed", out.resource && out.resource.id === "obs-trop-1");
}

// ── 3. record-sources ingest boundary (the no-raw-lab + no-demographics core) ──
{
  const ref = openEncounter();
  const bundle = {
    resourceType: "Bundle",
    type: "searchset",
    entry: [
      { resource: OBS }, // numeric Observation → parser
      { resource: { resourceType: "Condition", id: "cond-1", status: "active", code: { text: "Chest pain" } } },
      { resource: { resourceType: "Observation", id: "obs-coded", status: "final", code: { text: "Smoking status" }, valueCodeableConcept: { text: "never" } } }, // no numeric value → reference
    ],
  };
  const summary = ingestBundle(ref, bundle);
  check("ingest: one lab fact + two references", summary.lab_facts === 1 && summary.references === 2);

  const { facts } = collectEncounterFacts(ref);
  const lab = facts[0];
  check("ingest: lab fact is a sanitised lab_result", lab && lab.category === "lab_result" && typeof lab.sanitised_by === "string");
  // THE hard limit: the raw number 52 must NOT appear in the stored fact — no digit at all.
  check("ingest: NO raw lab number reaches stored state", !/\d/.test(lab.value) && !JSON.stringify(lab).includes("52"));
  check("ingest: Troponin banded critically elevated (HH)", lab.interpretation === "HH");

  // Destroy-on-close: session-store C8. After close the ref refuses forever.
  const closed = closeEncounter(ref);
  check("ingest: close destroys all working state", closed.keys_destroyed === 3);
  check("ingest: closed encounter refuses reads (state gone)", throws(() => listWorkingState(ref), /was closed/));
}
// Demographics never persist. Primary defence: a non-lab resource is reduced to
// a bare {resourceType,id,status} reference — the name/DOB/etc. are dropped
// before anything is stored. Backstop: the session-store demographic guard.
{
  const ref = openEncounter();
  const r = ingestResource(ref, { resourceType: "Patient", id: "p1", status: "active", name: [{ family: "Smith" }], birthDate: "1970-01-01" });
  check("ingest: Patient reduced to bare reference (name/DOB dropped)", r.stored.resourceType === "Patient" && r.stored.id === "p1" && !("name" in r.stored) && !("birthDate" in r.stored) && !JSON.stringify(r.stored).includes("Smith"));
  // Backstop is real: the session-store guard throws if a demographic value is
  // ever handed to it directly (defence-in-depth behind the reduction above).
  check("ingest: session-store guard would refuse a raw demographic write", throws(() => putWorkingStateProbe(ref), /REFUSED/));
  closeEncounter(ref);
}

// ── 4. AU provider scaffold: metadata only, live is input-gated, no secrets ────
{
  const mhr = AU_PROVIDERS.providers.find((p) => p.id === "au-mhr");
  check("providers: MHR present, input_gated", mhr && mhr.status === "input_gated");
  check("providers: client_id_ref is a secrets-manager reference, not a secret", mhr && mhr.client_id_ref.startsWith("secrets://"));
  check("providers: no literal secret/token strings in the directory", !/(client_secret|access_token|-----BEGIN)/i.test(JSON.stringify(AU_PROVIDERS)));
  check("providers: buildAuthorizeRequest refuses an input-gated provider", throws(() => buildAuthorizeRequest("au-mhr", { redirect_uri: "https://app/cb", state: "s" }), /input_gated|input-gated/));
  const req = buildAuthorizeRequest("au-hapi-sandbox", { redirect_uri: "https://app/cb", state: "s" });
  check("providers: available sandbox yields a SMART authorize request", req.params.response_type === "code" && req.params.state === "s" && req.authorize_url.includes("hapi.fhir.org"));
}

// ── 5. OPT-IN live smoke (real HAPI R4 sandbox; skipped unless env set) ─────────
if (process.env.HEYDOC_FHIR_LIVE_SMOKE === "1") {
  // Requires a running wso2 fhir-mcp-server at HEYDOC_FHIR_MCP_ENDPOINT fronting
  // HEYDOC_FHIR_UPSTREAM_BASE=https://hapi.fhir.org/baseR4.
  _resetSessions();
  const cfg = resolveFhirMcpEndpoint(process.env);
  if (cfg) {
    const out = await fhirSearchLive(cfg, { resource_type: "Patient", params: { _count: "1" } }, { timeoutMs: 15000 });
    check("live smoke: sandbox search returns a Bundle", out.bundle && out.bundle.resourceType === "Bundle");
    console.log("  [smoke] HAPI sandbox Patient search →", out.bundle ? `Bundle total=${out.bundle.total}` : `error: ${out.receipt.error && out.receipt.error.message}`);
  } else {
    console.log("  [smoke] HEYDOC_FHIR_LIVE_SMOKE=1 but no endpoint configured — set HEYDOC_FHIR_MCP_ENDPOINT + HEYDOC_FHIR_UPSTREAM_BASE");
  }
} else {
  console.log("  [skip] live HAPI-sandbox smoke (set HEYDOC_FHIR_LIVE_SMOKE=1 + run a wso2 process to exercise a real call)");
}

destroyAllEncounters();
if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-fhir-live: OK");
