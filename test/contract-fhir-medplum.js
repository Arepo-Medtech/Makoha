/**
 * Contract tests for the fhir-broker MEDPLUM backend (Mechanical Inventory Phase C, #medplum).
 * <test_and_evaluation_gates>: deterministic backend-selection + fail-safe code must be tested.
 * UNIT tests with a MOCKED FHIR REST transport (no network, CI-safe); a real self-hosted
 * Medplum call is an OPT-IN smoke (HEYDOC_FHIR_MEDPLUM_SMOKE=1), skipped by default.
 *
 * Asserts the Phase-C exit state:
 *   - resolveMedplumEndpoint: mock/unset → null (rollback); a self-host base → config;
 *     placeholder / invalid URL → throws; HOSTED SaaS (api.medplum.com) in PRODUCTION →
 *     REFUSED (AU residency); token placeholder → null, real token → captured.
 *   - chooseMedplumRoute: mock/dry_run → mock; live + endpoint → live; live + NO endpoint →
 *     BLOCKED (never mock-as-live).
 *   - medplumReadLive / medplumSearchLive: speak plain FHIR R4 REST, map onto the EXISTING
 *     { resource } / { bundle } contract, emit a Receipt(mode:live, backend:medplum), attach a
 *     bearer token when present, and fail-safe to null (never a fabricated resource).
 * Run from repo root: node test/contract-fhir-medplum.js
 */
import {
  resolveMedplumEndpoint,
  chooseMedplumRoute,
  medplumReadLive,
  medplumSearchLive,
  HOSTED_MEDPLUM_HOSTS,
} from "../mcp/servers/fhir-broker/medplum-backend.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

// ── A fake self-hosted Medplum FHIR R4 REST server ────────────────────────────
// fetchImpl(url, {method, headers}) — plain FHIR+JSON over HTTP. `fail` forces an HTTP error;
// `garbled` returns unparseable text. Records each request's url + auth header.
function fakeMedplum({ resources = {}, fail = false, garbled = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, { method, headers } = {}) => {
    calls.push({ url, method, authorization: headers && headers.authorization });
    if (fail) return { ok: false, status: 502, headers: { get: () => "" }, text: async () => "" };
    if (garbled) return { ok: true, status: 200, headers: { get: () => "application/fhir+json" }, text: async () => "<<not json>>" };
    const after = url.split("/fhir/R4/")[1] || "";
    const [pathPart] = after.split("?");
    const segs = pathPart.split("/").filter(Boolean);
    const type = segs[0];
    const id = segs[1];
    const list = resources[type] || [];
    let payload;
    if (id) {
      payload = list.find((r) => r.id === id) || { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found" }] };
    } else if (after.includes("_count=1")) {
      payload = { resourceType: "Bundle", type: "searchset", total: list.length, entry: list.slice(0, 1).map((r) => ({ resource: r })) };
    } else {
      payload = { resourceType: "Bundle", type: "searchset", total: list.length, entry: list.map((r) => ({ resource: r })) };
    }
    return { ok: true, status: 200, headers: { get: () => "application/fhir+json" }, text: async () => JSON.stringify(payload) };
  };
  return { fetchImpl, calls };
}

const CFG = { base: "https://fhir.example-clinic.au/fhir/R4", host: "fhir.example-clinic.au", token: null };

// ── 1. resolveMedplumEndpoint ─────────────────────────────────────────────────
check("resolve: unset → mock (null, rollback)", resolveMedplumEndpoint({}) === null);
check("resolve: 'mock' → null", resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "mock" }) === null);
{
  const r = resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "https://fhir.example-clinic.au/fhir/R4" });
  check("resolve: self-host base → config", r && r.base === "https://fhir.example-clinic.au/fhir/R4" && r.host === "fhir.example-clinic.au" && r.token === null);
}
check("resolve: placeholder → throws", throws(() => resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "<set-me>" }), /placeholder/));
check("resolve: example.invalid → throws", throws(() => resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "https://medplum.example.invalid/fhir/R4" }), /placeholder/));
check("resolve: non-URL → throws", throws(() => resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "not a url" }), /not a valid URL/));
// THE residency guard: hosted Medplum SaaS refused in production; self-host allowed.
check("resolve: HOSTED SaaS + production → REFUSED", throws(() => resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "https://api.medplum.com/fhir/R4", HEYDOC_MODE_DEFAULT: "production" }), /HOSTED SaaS.*REFUSED in production/));
check("resolve: HOSTED SaaS + staging → allowed", resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "https://api.medplum.com/fhir/R4", HEYDOC_MODE_DEFAULT: "staging" }).host === "api.medplum.com");
check("resolve: self-host + production → allowed", resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "https://fhir.example-clinic.au/fhir/R4", HEYDOC_MODE_DEFAULT: "production" }).host === "fhir.example-clinic.au");
check("resolve: hosted subdomain + production → still REFUSED", throws(() => resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "https://x.api.medplum.com/fhir/R4", HEYDOC_MODE_DEFAULT: "production" }), /REFUSED in production/));
check("resolve: real token captured", resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "https://fhir.example-clinic.au/fhir/R4", HEYDOC_FHIR_MEDPLUM_TOKEN: "tok-abc123" }).token === "tok-abc123");
check("resolve: placeholder token → null", resolveMedplumEndpoint({ HEYDOC_FHIR_MEDPLUM_ENDPOINT: "https://fhir.example-clinic.au/fhir/R4", HEYDOC_FHIR_MEDPLUM_TOKEN: "<token>" }).token === null);
check("HOSTED_MEDPLUM_HOSTS includes api.medplum.com", HOSTED_MEDPLUM_HOSTS.includes("api.medplum.com"));

// ── 2. chooseMedplumRoute — the C1 invariant: never serve mock under a live receipt ─
{
  const liveEnv = { HEYDOC_FHIR_MEDPLUM_ENDPOINT: "https://fhir.example-clinic.au/fhir/R4" };
  check("route: mock env, no mode → mock path", chooseMedplumRoute({}, undefined, "mock").kind === "mock");
  check("route: dry_run → mock path", chooseMedplumRoute({}, "dry_run", "mock").kind === "mock");
  check("route: mode=live + endpoint → live path", chooseMedplumRoute(liveEnv, "live", "mock").kind === "live");
  check("route: mode=live + endpoint UNSET → BLOCKED (never mock)", chooseMedplumRoute({ HEYDOC_MODE_DEFAULT: "production" }, "live", "production").kind === "blocked");
  check("route: production env default + no endpoint → BLOCKED", chooseMedplumRoute({ HEYDOC_MODE_DEFAULT: "production" }, undefined, "production").kind === "blocked");
}

// ── 3. Live read/search map onto the existing contract + emit a live receipt ──
const OBS = {
  resourceType: "Observation",
  id: "obs-trop-1",
  status: "final",
  code: { text: "Troponin I", coding: [{ system: "http://loinc.org", code: "10839-9" }] },
  valueQuantity: { value: 52, unit: "ng/L" },
};
{
  const srv = fakeMedplum({ resources: { Observation: [OBS] } });
  const out = await medplumReadLive(CFG, { resource_type: "Observation", id: "obs-trop-1" }, { fetchImpl: srv.fetchImpl });
  check("read: GET by id path", srv.calls[0].url === "https://fhir.example-clinic.au/fhir/R4/Observation/obs-trop-1" && srv.calls[0].method === "GET");
  check("read: returns { resource } shape", out.resource && out.resource.resourceType === "Observation" && out.resource.id === "obs-trop-1");
  check("read: receipt mode=live, backend=medplum, upstream recorded", out.receipt.mode === "live" && out.receipt.backend === "medplum" && out.receipt.server === "fhir-broker" && out.receipt.upstream === CFG.base);
  check("read: receipt has request_id + timestamp", typeof out.receipt.request_id === "string" && out.receipt.request_id.length >= 8 && /\dT\d/.test(out.receipt.timestamp_utc));
  check("read: NO bearer header when token absent", out && srv.calls[0].authorization === undefined);
}
{
  // No-id read → _count=1 search → first entry unwrapped to a resource.
  const srv = fakeMedplum({ resources: { Patient: [{ resourceType: "Patient", id: "p1" }, { resourceType: "Patient", id: "p2" }] } });
  const out = await medplumReadLive(CFG, { resource_type: "Patient" }, { fetchImpl: srv.fetchImpl });
  check("read no-id: uses _count=1", srv.calls[0].url.includes("Patient?_count=1"));
  check("read no-id: returns the first resource unwrapped", out.resource && out.resource.id === "p1");
}
{
  const srv = fakeMedplum({ resources: { Observation: [OBS, { ...OBS, id: "obs-trop-2" }] } });
  const out = await medplumSearchLive(CFG, { resource_type: "Observation", params: { patient: "x", _count: 5 } }, { fetchImpl: srv.fetchImpl });
  check("search: builds a query string", srv.calls[0].url.includes("Observation?") && srv.calls[0].url.includes("patient=x"));
  check("search: returns a searchset Bundle", out.bundle && out.bundle.resourceType === "Bundle" && out.bundle.total === 2);
  check("search: receipt mode=live/backend=medplum", out.receipt.mode === "live" && out.receipt.backend === "medplum");
}
// Bearer token attached when present.
{
  const srv = fakeMedplum({ resources: { Observation: [OBS] } });
  await medplumReadLive({ ...CFG, token: "tok-xyz" }, { resource_type: "Observation", id: "obs-trop-1" }, { fetchImpl: srv.fetchImpl });
  check("auth: bearer token attached when present", srv.calls[0].authorization === "Bearer tok-xyz");
}
// Fail-safe: HTTP error / garbled → null, error receipt, NEVER fabricated.
{
  const srv = fakeMedplum({ fail: true });
  const out = await medplumReadLive(CFG, { resource_type: "Observation", id: "x" }, { fetchImpl: srv.fetchImpl });
  check("read fail-safe: resource null, no fabrication", out.resource === null);
  check("read fail-safe: receipt carries error code", out.receipt.error && out.receipt.error.code === "LIVE_READ_FAILED");
}
{
  const srv = fakeMedplum({ garbled: true });
  const out = await medplumSearchLive(CFG, { resource_type: "Observation", params: {} }, { fetchImpl: srv.fetchImpl });
  check("search fail-safe: garbled JSON → bundle null", out.bundle === null && out.receipt.error && out.receipt.error.code === "LIVE_SEARCH_FAILED");
}

// ── 4. OPT-IN live smoke (real self-hosted Medplum; skipped unless env set) ────
if (process.env.HEYDOC_FHIR_MEDPLUM_SMOKE === "1") {
  const cfg = resolveMedplumEndpoint(process.env);
  if (cfg) {
    const out = await medplumSearchLive(cfg, { resource_type: "Patient", params: { _count: "1" } }, { timeoutMs: 15000 });
    check("live smoke: Patient search returns a Bundle", out.bundle && out.bundle.resourceType === "Bundle");
    console.log("  [smoke] Medplum Patient search →", out.bundle ? `Bundle total=${out.bundle.total}` : `error: ${out.receipt.error && out.receipt.error.message}`);
  } else {
    console.log("  [smoke] HEYDOC_FHIR_MEDPLUM_SMOKE=1 but no endpoint — set HEYDOC_FHIR_MEDPLUM_ENDPOINT");
  }
} else {
  console.log("  [skip] live Medplum smoke (set HEYDOC_FHIR_MEDPLUM_SMOKE=1 + run a self-hosted Medplum to exercise a real call)");
}

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-fhir-medplum: OK");
