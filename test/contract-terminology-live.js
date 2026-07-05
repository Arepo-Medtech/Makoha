/**
 * Contract tests for the terminology LIVE adapter (M11 P1) —
 * mcp/servers/terminology/live-adapter.js. <test_and_evaluation_gates> requires
 * deterministic safety code to be tested. These are UNIT tests with a MOCKED
 * fetch — no network, CI-safe. A real sandbox call is an OPT-IN smoke test
 * (HEYDOC_TX_LIVE_SMOKE=1), skipped by default.
 *
 * Asserts:
 *   - resolveTxEndpoint: mock/unset → null; a live env → {name,url}; a
 *     placeholder url → throws; **dev_sandbox in production → REFUSES**.
 *   - validateCodeLive: builds the correct CodeSystem $validate-code request
 *     (system-URI map, code); maps result:true → validated+display; fail-safe on
 *     result:false, HTTP error, timeout, and an AU-specific (unmapped) system —
 *     NEVER fabricates.
 * Run from repo root: node test/contract-terminology-live.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCodeLive, resolveTxEndpoint, SYSTEM_URI } from "../mcp/servers/terminology/live-adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TX = JSON.parse(readFileSync(join(__dirname, "..", "mcp/servers/terminology/terminology-servers.json"), "utf8"));
const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

// A canned FHIR Parameters response for $validate-code.
const params = (result, display, version) => ({
  ok: true,
  json: async () => ({ resourceType: "Parameters", parameter: [
    { name: "result", valueBoolean: result },
    ...(display ? [{ name: "display", valueString: display }] : []),
    ...(version ? [{ name: "version", valueString: version }] : []),
  ] }),
});

// 1. resolveTxEndpoint
check("resolve: unset → mock (null)", resolveTxEndpoint({}, TX) === null);
check("resolve: 'mock' → null", resolveTxEndpoint({ HEYDOC_TERMINOLOGY_ENDPOINT: "mock" }, TX) === null);
const sb = resolveTxEndpoint({ HEYDOC_TERMINOLOGY_ENDPOINT: "dev_sandbox" }, TX);
check("resolve: dev_sandbox → CSIRO url", sb && sb.name === "dev_sandbox" && sb.url === "https://r4.ontoserver.csiro.au/fhir");
check("resolve: ncts_live_api → NCTS url", resolveTxEndpoint({ HEYDOC_TERMINOLOGY_ENDPOINT: "ncts_live_api" }, TX).url.includes("api.healthterminologies.gov.au"));
check("resolve: self_hosted placeholder url → throws", throws(() => resolveTxEndpoint({ HEYDOC_TERMINOLOGY_ENDPOINT: "self_hosted" }, TX), /no usable url/));
check("resolve: unknown endpoint → throws", throws(() => resolveTxEndpoint({ HEYDOC_TERMINOLOGY_ENDPOINT: "nope" }, TX), /no usable url/));
// THE safety guard: sandbox refused in production.
check("resolve: dev_sandbox + production → REFUSED", throws(() => resolveTxEndpoint({ HEYDOC_TERMINOLOGY_ENDPOINT: "dev_sandbox", HEYDOC_MODE_DEFAULT: "production" }, TX), /REFUSED in production/));
check("resolve: dev_sandbox + staging → allowed", resolveTxEndpoint({ HEYDOC_TERMINOLOGY_ENDPOINT: "dev_sandbox", HEYDOC_MODE_DEFAULT: "staging" }, TX).name === "dev_sandbox");

// 2. validateCodeLive — request shape + mapping (mocked fetch)
{
  let seenUrl;
  const fetchImpl = async (url) => { seenUrl = url; return params(true, "Myocardial infarction", "http://snomed.info/sct/32506021000036107"); };
  const v = await validateCodeLive("https://r4.ontoserver.csiro.au/fhir", "SNOMED_CT", "22298006", { fetchImpl });
  check("validate: request hits CodeSystem/$validate-code", /\/CodeSystem\/\$validate-code\?/.test(seenUrl));
  check("validate: request carries the SNOMED system URI", seenUrl.includes(encodeURIComponent("http://snomed.info/sct")));
  check("validate: request carries the code", seenUrl.includes("code=22298006"));
  check("validate: result:true → validated + display", v.validated === true && v.display === "Myocardial infarction");
}

// 3. Fail-safe paths — never fabricate
{
  const invalid = await validateCodeLive("https://x/fhir", "SNOMED_CT", "000", { fetchImpl: async () => params(false) });
  check("validate: result:false → not validated, no display", invalid.validated === false && invalid.display === undefined);

  const http500 = await validateCodeLive("https://x/fhir", "SNOMED_CT", "22298006", { fetchImpl: async () => ({ ok: false, status: 500 }) });
  check("validate: HTTP 500 → fail-safe miss", http500.validated === false && /HTTP 500/.test(http500.reason));

  // timeout: fetch that rejects only when the AbortController fires.
  const hangingFetch = (url, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); }));
  const timedOut = await validateCodeLive("https://x/fhir", "SNOMED_CT", "22298006", { fetchImpl: hangingFetch, timeoutMs: 15 });
  check("validate: timeout → fail-safe miss (reason=timeout)", timedOut.validated === false && timedOut.reason === "timeout");

  // AU-specific system → not on this endpoint; must NOT call fetch, must miss.
  let called = false;
  const au = await validateCodeLive("https://x/fhir", "ICD_10_AM", "K65.9", { fetchImpl: async () => { called = true; return params(true); } });
  check("validate: AU-specific system → miss without a network call", au.validated === false && called === false && /not available/.test(au.reason));
  check("SYSTEM_URI: AU systems unmapped (null), intl systems mapped", SYSTEM_URI.ICD_10_AM === null && SYSTEM_URI.PBS === null && SYSTEM_URI.AMT === null && SYSTEM_URI.SNOMED_CT === "http://snomed.info/sct");
}

// 4. OPT-IN live smoke (real CSIRO sandbox; skipped in CI unless HEYDOC_TX_LIVE_SMOKE=1)
if (process.env.HEYDOC_TX_LIVE_SMOKE === "1") {
  const v = await validateCodeLive("https://r4.ontoserver.csiro.au/fhir", "SNOMED_CT", "22298006", { timeoutMs: 15000 });
  check("live smoke: sandbox validates a known SNOMED code", v.validated === true);
  console.log("  [smoke] sandbox $validate-code SNOMED 22298006 →", v.validated, v.display || v.reason);
} else {
  console.log("  [skip] live sandbox smoke (set HEYDOC_TX_LIVE_SMOKE=1 to run a real call)");
}

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-terminology-live: OK");
