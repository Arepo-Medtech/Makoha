/**
 * Contract test for MI-21 — consent-scope enforcement at the gateway (§3.2, E5).
 *
 * Asserts: a call within a granted scope is admitted; a call OUTSIDE granted scope is
 * REFUSED (throws CONSENT_SCOPE_REFUSED) AND logged (the violation reaches the audit
 * sink before the refusal); revoking a consent removes its scope; unknown scope and
 * malformed ref fail closed. Uses HEYDOC_DATA_DIR temp isolation (house convention).
 * Run from repo root: node test/contract-consent-scope.js
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HEYDOC_DATA_DIR = mkdtempSync(join(tmpdir(), "heydoc-consent-scope-"));

const { openEncounter } = await import("../verification/session-store.js");
const { captureConsent, revokeConsent } = await import("../verification/consent.js");
const { enforceConsentScope, CONSENT_SCOPES, CONSENT_SCOPE_REFUSED } = await import("../verification/consent-scope.js");

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const throwsRefused = (fn) => { try { fn(); return false; } catch (e) { return String(e.message).startsWith(CONSENT_SCOPE_REFUSED); } };

// Scope vocabulary derives from the consent registry.
expect(CONSENT_SCOPES.includes("treatment") && CONSENT_SCOPES.includes("patient-privacy"), "scopes derived from CONSENT_TYPES");

const ref = openEncounter();

// No consent yet → any scope refused + logged.
{
  const logged = [];
  expect(throwsRefused(() => enforceConsentScope({ session_ref: ref, required_scope: "treatment", call_ref: "evidence-broker#1" }, { auditLog: (e) => logged.push(e) })), "no consent → treatment refused");
  expect(logged.length === 1 && logged[0].event === "consent_scope_violation" && logged[0].required_scope === "treatment" && logged[0].call_ref === "evidence-broker#1", "E5: violation logged with scope + call_ref BEFORE refusal");
}

// Grant treatment-scoped consent → treatment admitted; patient-privacy still refused + logged.
captureConsent({ session_ref: ref, consent_type: "telehealth_consent", decision: "granted" }); // scope: treatment
{
  const admit = enforceConsentScope({ session_ref: ref, required_scope: "treatment" }, { auditLog: () => {} });
  expect(admit.admitted === true && admit.scope === "treatment", "granted scope → admitted");
  const logged = [];
  expect(throwsRefused(() => enforceConsentScope({ session_ref: ref, required_scope: "patient-privacy" }, { auditLog: (e) => logged.push(e) })), "ungranted scope (patient-privacy) refused");
  expect(logged.length === 1, "ungranted scope refusal logged");
}

// Grant a patient-privacy consent → that scope now admitted.
captureConsent({ session_ref: ref, consent_type: "session_persistence", decision: "granted" }); // scope: patient-privacy
expect(enforceConsentScope({ session_ref: ref, required_scope: "patient-privacy" }, { auditLog: () => {} }).admitted === true, "patient-privacy admitted after grant");

// Revoke treatment consent → treatment scope removed → refused again.
revokeConsent({ session_ref: ref, consent_type: "telehealth_consent" });
expect(throwsRefused(() => enforceConsentScope({ session_ref: ref, required_scope: "treatment" }, { auditLog: () => {} })), "revoked scope → refused (session-bound/revocable)");

// Fail-closed: unknown scope + malformed ref.
expect(throwsRefused(() => enforceConsentScope({ session_ref: ref, required_scope: "billing" }, { auditLog: () => {} })), "unknown scope → refused");
expect(throwsRefused(() => enforceConsentScope({ session_ref: "x", required_scope: "treatment" }, { auditLog: () => {} })), "malformed session_ref → refused");

if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-21 consent-scope FAIL (${errors.length})`); process.exit(1); }
console.log("MI-21 consent-scope PASS");
process.exit(0);
