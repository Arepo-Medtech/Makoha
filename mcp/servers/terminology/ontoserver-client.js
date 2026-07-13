/**
 * Ontoserver client (MI-05, execution plan §2.1/§4.2) — the AU-capable terminology
 * client that resolves SNOMED CT-AU + AMT against a self-hosted / NCTS Ontoserver
 * via FHIR `$validate-code` and `$lookup`.
 *
 * WHY SEPARATE from live-adapter.js: that adapter targets the CSIRO sandbox, which
 * carries INTERNATIONAL content only, so it deliberately maps the AU-specific
 * systems (AMT, ICD-10-AM, PBS) to null. This client is the piece that DOES resolve
 * AMT and SNOMED CT-AU, using the value-set bindings in value-sets.json — but only
 * against an endpoint that actually holds the licensed AU content (self-host / NCTS,
 * B6). Against the sandbox an AMT lookup simply fails safe (result:false).
 *
 * STATUS: PARTIAL. The mechanics are complete and unit-tested with an injected
 * transport; live resolution is DEPLOY-GATED on a running Ontoserver loaded with the
 * licensed RF2 (never in the repo). The AMT ValueSet URL is provisional until bound
 * at deploy (value-sets.json).
 *
 * SAFETY (identical posture to live-adapter.js): FAIL-SAFE on every error / timeout /
 * miss / unmapped system → `validated:false` (or `found:false`), NEVER a fabricated
 * concept. The verifier then blocks the unbound code (no-fabricated-codes invariant).
 * `fetchImpl` is injectable so the client is fully testable with no network.
 * No new dependency — Node 20 global fetch.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load the value-set bindings. Injectable path for tests; defaults to the repo file. */
export function loadValueSets(path = join(__dirname, "value-sets.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Loaded once at module init; the systems the client can resolve (SNOMED CT-AU + AMT).
const VALUE_SETS = loadValueSets();

/**
 * Resolve a system's URI + optional value-set binding from value-sets.json.
 * @returns {{ system_uri: string, valueset_url: string|null }|null}  null = not an AU system this client resolves
 */
export function resolveSystem(system, valueSets = VALUE_SETS) {
  const s = valueSets.systems && valueSets.systems[system];
  if (!s || !s.system_uri) return null;
  return { system_uri: s.system_uri, valueset_url: s.valueset_url ?? null };
}

/** Parse a FHIR Parameters resource into a name→param lookup (first match per name). */
function paramGetter(params) {
  const list = (params && params.parameter) || [];
  return (name) => list.find((p) => p.name === name) || {};
}

/**
 * Validate a code against the configured Ontoserver. Uses ValueSet/$validate-code
 * when a value-set binding exists, else CodeSystem/$validate-code (system membership).
 * @param {{ baseUrl: string, system: string, code: string, valueSetUrl?: string|null,
 *           fetchImpl?: Function, timeoutMs?: number, valueSets?: object }} args
 * @returns {Promise<{ validated: boolean, display?: string, version?: string, system_uri?: string, valueset_url?: string|null, reason?: string }>}
 */
export async function validateCode({ baseUrl, system, code, valueSetUrl, fetchImpl, timeoutMs = 5000, valueSets = VALUE_SETS } = {}) {
  const resolved = resolveSystem(system, valueSets);
  if (!resolved) return { validated: false, reason: `system ${system} is not an AU system this client resolves (SNOMED CT-AU / AMT only)` };
  const doFetch = fetchImpl || fetch;
  const vs = valueSetUrl !== undefined ? valueSetUrl : resolved.valueset_url;
  const base = String(baseUrl).replace(/\/$/, "");
  // With a bound ValueSet → membership check; without → CodeSystem validation.
  const url = vs
    ? `${base}/ValueSet/$validate-code?url=${encodeURIComponent(vs)}&system=${encodeURIComponent(resolved.system_uri)}&code=${encodeURIComponent(code)}`
    : `${base}/CodeSystem/$validate-code?url=${encodeURIComponent(resolved.system_uri)}&code=${encodeURIComponent(code)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { headers: { Accept: "application/fhir+json" }, signal: ctrl.signal });
    if (!res || !res.ok) return { validated: false, reason: `HTTP ${res ? res.status : "no-response"}`, system_uri: resolved.system_uri, valueset_url: vs };
    const get = paramGetter(await res.json());
    const validated = get("result").valueBoolean === true;
    return {
      validated,
      display: validated ? get("display").valueString : undefined,
      version: get("version").valueString,
      system_uri: resolved.system_uri,
      valueset_url: vs,
    };
  } catch (e) {
    return { validated: false, reason: e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e), system_uri: resolved.system_uri, valueset_url: vs };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Look up a concept's display + designations + properties via CodeSystem/$lookup.
 * Fail-safe: any error / miss → { found:false }.
 * @param {{ baseUrl: string, system: string, code: string, fetchImpl?: Function, timeoutMs?: number, valueSets?: object }} args
 * @returns {Promise<{ found: boolean, display?: string, version?: string, designations?: Array<object>, properties?: Array<object>, system_uri?: string, reason?: string }>}
 */
export async function lookupConcept({ baseUrl, system, code, fetchImpl, timeoutMs = 5000, valueSets = VALUE_SETS } = {}) {
  const resolved = resolveSystem(system, valueSets);
  if (!resolved) return { found: false, reason: `system ${system} is not an AU system this client resolves (SNOMED CT-AU / AMT only)` };
  const doFetch = fetchImpl || fetch;
  const base = String(baseUrl).replace(/\/$/, "");
  const url = `${base}/CodeSystem/$lookup?system=${encodeURIComponent(resolved.system_uri)}&code=${encodeURIComponent(code)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { headers: { Accept: "application/fhir+json" }, signal: ctrl.signal });
    if (!res || !res.ok) return { found: false, reason: `HTTP ${res ? res.status : "no-response"}`, system_uri: resolved.system_uri };
    const params = await res.json();
    const get = paramGetter(params);
    const display = get("display").valueString;
    if (display === undefined) return { found: false, reason: "no display in $lookup result", system_uri: resolved.system_uri };
    const parts = (params && params.parameter) || [];
    const designations = parts.filter((p) => p.name === "designation").map((d) => {
      const g = paramGetter({ parameter: d.part || [] });
      return { language: g("language").valueCode, value: g("value").valueString };
    });
    const properties = parts.filter((p) => p.name === "property").map((pr) => {
      const g = paramGetter({ parameter: pr.part || [] });
      return { code: g("code").valueCode, value: g("value").valueString ?? g("value").valueCode ?? g("value").valueBoolean };
    });
    return { found: true, display, version: get("version").valueString, designations, properties, system_uri: resolved.system_uri };
  } catch (e) {
    return { found: false, reason: e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e), system_uri: resolved.system_uri };
  } finally {
    clearTimeout(timer);
  }
}
