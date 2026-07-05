/**
 * Terminology live adapter (M11 P1) — validate a code against a live FHIR
 * terminology server via CodeSystem `$validate-code`. Built to run against the
 * CSIRO sandbox (r4.ontoserver.csiro.au) with NO credentials — decoupled from the
 * NCTS licence, so the adapter mechanics can be proven before the licensed AU
 * source is deployed.
 *
 * CONTRACT-PRESERVING: the terminology server maps this result onto the SAME
 * TerminologyLookup + receipt shape the mock produces. Only the data SOURCE
 * changes; downstream (pipeline `retrieveTerminology`, verifier per-code binding)
 * is unchanged.
 *
 * SAFETY:
 * - The CSIRO sandbox serves reference/INTERNATIONAL content, NOT the licensed
 *   SNOMED CT-AU / AMT / PBS / AU Core value sets. It validates SNOMED (intl),
 *   LOINC and ICD-11; AU-specific systems (ICD-10-AM/PBS/AMT) return "not
 *   available on this endpoint" and are validated only on NCTS / self-host.
 * - `resolveTxEndpoint()` REFUSES the sandbox in PRODUCTION — unlicensed
 *   reference content must never ground production clinical output.
 * - FAIL-SAFE: any error / timeout / miss / unmapped system returns
 *   `validated:false` — NEVER a fabricated concept. The verifier then blocks the
 *   unbound code (no-fabricated-codes invariant).
 * No new dependency — uses the Node 20 global `fetch`.
 */

/**
 * FHIR code-system URIs. AU-specific systems live on NCTS / self-host, not the
 * international sandbox → `null` here (adapter returns a fail-safe miss for them).
 */
export const SYSTEM_URI = {
  SNOMED_CT: "http://snomed.info/sct",
  LOINC: "http://loinc.org",
  ICD_11: "http://id.who.int/icd11/mms",
  ICD_10_AM: null,
  PBS: null,
  AMT: null,
};

/**
 * Resolve the configured terminology endpoint from env + terminology-servers.json.
 * Returns null for the MOCK path (endpoint unset or "mock"). Throws on an
 * undefined/placeholder endpoint, and REFUSES the dev sandbox in production.
 * @param {Record<string,string|undefined>} env
 * @param {{environments?: Record<string,{url?:string}>}} tx  parsed terminology-servers.json
 * @returns {{name:string, url:string}|null}
 */
export function resolveTxEndpoint(env, tx) {
  const name = ((env.HEYDOC_TERMINOLOGY_ENDPOINT || "mock").trim()) || "mock";
  if (name === "mock") return null; // mock path — the rollback default
  const e = tx.environments && tx.environments[name];
  if (!e || !e.url || String(e.url).startsWith("<")) {
    throw new Error(`terminology endpoint "${name}" has no usable url in terminology-servers.json`);
  }
  // Fail-safe: the CSIRO sandbox is unlicensed reference content — never production.
  if (name === "dev_sandbox" && (env.HEYDOC_MODE_DEFAULT || "").trim() === "production") {
    throw new Error("terminology endpoint 'dev_sandbox' (CSIRO reference server, unlicensed content) is REFUSED in production — use 'ncts_live_api' or 'self_hosted'");
  }
  return { name, url: String(e.url).replace(/\/$/, "") };
}

/**
 * Validate a code via CodeSystem `$validate-code`. Fail-safe on every error path.
 * @param {string} baseUrl - FHIR base URL (e.g. https://r4.ontoserver.csiro.au/fhir)
 * @param {string} system - one of the SYSTEM_URI keys
 * @param {string} code
 * @param {{timeoutMs?: number, fetchImpl?: Function}} [opts]
 * @returns {Promise<{validated:boolean, display?:string, version?:string, system_uri?:string, reason?:string}>}
 */
export async function validateCodeLive(baseUrl, system, code, { timeoutMs = 5000, fetchImpl } = {}) {
  const doFetch = fetchImpl || fetch;
  const uri = SYSTEM_URI[system];
  if (!uri) return { validated: false, reason: `system ${system} not available on this endpoint (AU-specific → NCTS/self-host)` };
  const url = `${String(baseUrl).replace(/\/$/, "")}/CodeSystem/$validate-code?url=${encodeURIComponent(uri)}&code=${encodeURIComponent(code)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { headers: { Accept: "application/fhir+json" }, signal: ctrl.signal });
    if (!res || !res.ok) return { validated: false, reason: `HTTP ${res ? res.status : "no-response"}`, system_uri: uri };
    const params = await res.json();
    const get = (n) => (((params && params.parameter) || []).find((p) => p.name === n)) || {};
    const validated = get("result").valueBoolean === true;
    return {
      validated,
      display: validated ? get("display").valueString : undefined,
      version: get("version").valueString,
      system_uri: uri,
    };
  } catch (e) {
    return { validated: false, reason: e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e), system_uri: uri };
  } finally {
    clearTimeout(timer);
  }
}
