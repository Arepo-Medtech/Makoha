/**
 * Consent-SCOPE enforcement at the gateway (MI-21; execution plan §3.2, §8 E5).
 *
 * Consent is enforced AT THE GATEWAY, NOT per-connector (blueprint Cat 9). Every
 * boundary-crossing call carries a required consent scope; a call whose scope is not
 * covered by an active consent for the encounter is REFUSED at the gateway and
 * LOGGED — before any tap fires, so no partial data leaks (E5).
 *
 * This is the SCOPE layer over the existing consent seam: consent.js already records
 * consents and enforces presence by TYPE (requireActiveConsent, fail-closed). Here we
 * map the scopes those consent types carry (CONSENT_TYPES[].scope) to a gateway check,
 * and add the auditable refusal. FAIL-CLOSED: an unknown scope, a malformed ref, or no
 * covering active consent all refuse. The audit sink is injectable so the gateway
 * routes the violation to the durable audit store; the default emits a structured log.
 */
import { CONSENT_TYPES, getActiveConsent } from "./consent.js";

export const CONSENT_SCOPE_REFUSED = "CONSENT_SCOPE_REFUSED";

/** The consent scopes the v1 registry covers (derived — never minted). */
export const CONSENT_SCOPES = Object.freeze([...new Set(Object.values(CONSENT_TYPES).map((d) => d.scope))]);

/** The set of scopes with an ACTIVE consent for this encounter. */
export function activeScopesFor(session_ref) {
  const scopes = new Set();
  for (const [type, def] of Object.entries(CONSENT_TYPES)) {
    let active = null;
    try { active = getActiveConsent(session_ref, type); } catch { active = null; } // malformed → no scope (fail-closed)
    if (active) scopes.add(def.scope);
  }
  return scopes;
}

function defaultAuditLog(event) {
  // Logging must never throw — a broken logger cannot be allowed to swallow a refusal.
  try { if (process.stderr && process.stderr.write) process.stderr.write(JSON.stringify(event) + "\n"); } catch { /* noop */ }
}

/**
 * Enforce that a boundary-crossing call is within a granted consent scope. Refuses
 * (throws) and logs on any violation; returns the admitted scope on success.
 * @param {{ session_ref: string, required_scope: string, call_ref?: string }} call
 * @param {{ auditLog?: (event: object) => void, now?: () => number }} [opts]
 * @returns {{ admitted: true, scope: string }}
 */
export function enforceConsentScope({ session_ref, required_scope, call_ref } = {}, { auditLog = defaultAuditLog, now = () => Date.now() } = {}) {
  if (typeof session_ref !== "string" || session_ref.trim().length < 8) {
    throw new Error(`${CONSENT_SCOPE_REFUSED}: session_ref must be a non-empty encounter-scoped reference`);
  }
  if (!CONSENT_SCOPES.includes(required_scope)) {
    throw new Error(`${CONSENT_SCOPE_REFUSED}: unknown consent scope "${required_scope}" — known scopes are ${CONSENT_SCOPES.join(", ")}`);
  }
  if (!activeScopesFor(session_ref).has(required_scope)) {
    // E5: log the violation FIRST (always auditable), then refuse before any tap fires.
    auditLog({ event: "consent_scope_violation", session_ref, required_scope, call_ref: call_ref || null, at_utc: new Date(now()).toISOString(), reason: `no active consent covering scope "${required_scope}"` });
    throw new Error(`${CONSENT_SCOPE_REFUSED}: call outside consent scope "${required_scope}" — refused at the gateway and logged (E5); no tap fired`);
  }
  return { admitted: true, scope: required_scope };
}
