/**
 * consent — capture, query, revoke, and REQUIRE patient consents
 * (LIVE_PLAN L12 / R-40 / FL-01; plan .planning/CONSENT-PLAN.md).
 *
 * CONSENT CAPTURE IS A RECORDING MECHANISM, NOT A PERMISSION UNLOCK.
 * Nothing in this module (or anywhere else in this build) opens a persistence
 * path: audit-store persistContent() stays synthetic-only, and session-store
 * still destroys all working state on close. What this module adds is:
 *   1. the ability to RECORD a patient's grant/decline/revocation as
 *      tamper-evident, PHI-free evidence (consent-store.js), and
 *   2. requireActiveConsent() — the FAIL-CLOSED seam every FUTURE persistence
 *      path MUST call before persisting anything beyond the session
 *      (<data_handling>: "No persistence beyond session without explicit
 *      consent"). Today no such path exists; the seam exists so one can never
 *      be built without it.
 *
 * DEFAULT-DENY EVERYWHERE: no record, a declined record, a revoked record, a
 * session-end-expired record, an unknown consent type, a malformed ref, an
 * unopened/closed encounter — every branch refuses (BLOCKED_NO_CONSENT).
 * Declining NEVER affects care: the consult proceeds session-only.
 *
 * CONSENT TYPES ARE NEVER MINTED: omnibus-sourced types carry a provenPath()-
 * proven binding + the pinned dataset receipt fields; the first-party
 * `session_persistence` type is explicitly namespaced as heydoc-first-party
 * (it is OUR product consent, not claimed from the omnibus). v1 scope per the
 * approved plan: session_persistence + RECORD-ONLY mhr_data_sharing /
 * telehealth_consent (no MHR integration exists; nothing acts on the record).
 *
 * SESSION-BOUND BY CONSTRUCTION: closeEncounter() inactivates every active
 * consent for that encounter via the session-store close-hook registry — a
 * consent cannot outlive its session (expires: session_end is mechanical, not
 * aspirational).
 */
import { isOpen, registerCloseHook } from "./session-store.js";
import { provenPath, omnibusDatasetReceipt } from "./omnibus.js";
import { appendConsentEntry, readConsentLedger } from "./consent-store.js";

/** The v1 consent-type registry (approved plan §Contracts). scope/actions are
 *  the omnibus Consent vocabulary; omnibus_path is proven at capture time. */
export const CONSENT_TYPES = Object.freeze({
  session_persistence: {
    type_source: "heydoc-first-party",
    omnibus_path: null,
    scope: "patient-privacy",
    provision_actions: ["collect", "use", "destroy"],
    plain_language: "Keep my consult information for this service to use beyond this session.",
  },
  mhr_data_sharing: {
    type_source: "omnibus",
    omnibus_path: "Consent.au_consent_types.MHR_data_sharing",
    scope: "patient-privacy",
    provision_actions: ["collect", "use", "disclose"],
    plain_language: "Record my My Health Record sharing preference. (Recorded only — nothing is uploaded.)",
  },
  telehealth_consent: {
    type_source: "omnibus",
    omnibus_path: "Consent.au_consent_types.telehealth_consent",
    scope: "treatment",
    provision_actions: ["collect", "use"],
    plain_language: "Record my consent to a telehealth consultation.",
  },
});

/** The refusal prefix future persistence paths (and tests) key off. */
export const BLOCKED_NO_CONSENT = "BLOCKED_NO_CONSENT";

function requireKnownType(consent_type) {
  const def = CONSENT_TYPES[consent_type];
  if (!def) {
    throw new Error(`${BLOCKED_NO_CONSENT}: unknown consent type "${consent_type}" — v1 types are ${Object.keys(CONSENT_TYPES).join(", ")} (a consent type is never minted)`);
  }
  return def;
}

function requireSessionRef(session_ref) {
  if (typeof session_ref !== "string" || session_ref.trim().length < 8) {
    throw new Error(`${BLOCKED_NO_CONSENT}: session_ref must be a non-empty encounter-scoped reference`);
  }
  return session_ref;
}

/** Build the proven omnibus binding for an omnibus-sourced type. FAIL-CLOSED:
 *  a path that no longer proves against the pinned omnibus refuses the capture
 *  (never records an unproven claim). */
function bindingFor(def, consent_type) {
  if (def.type_source !== "omnibus") return null;
  const proven = provenPath(def.omnibus_path); // spoiler gate throws; unresolved → null
  if (proven === null) {
    throw new Error(`${BLOCKED_NO_CONSENT}: omnibus path for "${consent_type}" does not prove against the pinned omnibus — refusing to record an unproven consent type`);
  }
  const receipt = omnibusDatasetReceipt();
  return { path: proven, dataset_version: receipt.dataset_version, sha256: receipt.sha256 };
}

/**
 * Capture a patient's consent DECISION inside an OPEN encounter.
 * decision "granted" → status active; "declined" → status rejected (recorded —
 * a decline is evidence too, and it never affects care).
 * @returns {object} the appended consent record
 */
export function captureConsent({ session_ref, consent_type, decision } = {}) {
  requireSessionRef(session_ref);
  const def = requireKnownType(consent_type);
  if (decision !== "granted" && decision !== "declined") {
    throw new Error(`${BLOCKED_NO_CONSENT}: decision must be "granted" or "declined" (got "${decision}") — consent is never assumed`);
  }
  if (!isOpen(session_ref)) {
    throw new Error(`${BLOCKED_NO_CONSENT}: encounter "${session_ref}" is not open — consent is captured only inside a live encounter`);
  }
  return appendConsentEntry({
    session_ref,
    consent_type,
    type_source: def.type_source,
    omnibus_binding: bindingFor(def, consent_type),
    status: decision === "granted" ? "active" : "rejected",
    reason: decision === "granted" ? "patient_granted" : "patient_declined",
    scope: def.scope,
    provision_actions: def.provision_actions,
  });
}

/** Latest event for (session_ref, consent_type), or null. */
function latestEvent(session_ref, consent_type) {
  const events = readConsentLedger().filter((e) => e.session_ref === session_ref && e.consent_type === consent_type);
  return events.length ? events[events.length - 1] : null;
}

/** Derived current status: "absent" | "active" | "rejected" | "inactive". */
export function consentStatus(session_ref, consent_type) {
  requireSessionRef(session_ref);
  requireKnownType(consent_type);
  const latest = latestEvent(session_ref, consent_type);
  return latest ? latest.status : "absent";
}

/** The active consent record for (session_ref, consent_type), or null. */
export function getActiveConsent(session_ref, consent_type) {
  requireSessionRef(session_ref);
  requireKnownType(consent_type);
  const latest = latestEvent(session_ref, consent_type);
  return latest && latest.status === "active" ? latest : null;
}

/**
 * THE SEAM: refuse unless an ACTIVE consent record exists for this encounter
 * and type. Every future persistence path MUST call this before persisting
 * anything beyond the session. Cannot be satisfied by a declined, revoked, or
 * session-ended record — only a live grant.
 * @returns {object} the active consent record
 * @throws on every other branch (default-deny)
 */
export function requireActiveConsent(session_ref, consent_type) {
  let active;
  try {
    active = getActiveConsent(session_ref, consent_type);
  } catch (err) {
    // Malformed input / unknown type already carry the BLOCKED prefix; a store
    // failure is wrapped so the caller still sees a refusal, never a pass.
    if (String(err && err.message).startsWith(BLOCKED_NO_CONSENT)) throw err;
    throw new Error(`${BLOCKED_NO_CONSENT}: consent store unavailable (${err && err.message ? err.message.slice(0, 120) : "unknown"}) — refusing without proof of consent`);
  }
  if (!active) {
    throw new Error(`${BLOCKED_NO_CONSENT}: no active "${consent_type}" consent recorded for this encounter — nothing persists beyond the session without explicit consent (<data_handling>)`);
  }
  return active;
}

/**
 * Revoke an ACTIVE consent (patient changed their mind). Appends an inactive
 * event; refuses if there is nothing active to revoke (a silent no-op would
 * hide a lifecycle bug).
 * @returns {object} the appended revocation record
 */
export function revokeConsent({ session_ref, consent_type } = {}) {
  requireSessionRef(session_ref);
  const def = requireKnownType(consent_type);
  const active = getActiveConsent(session_ref, consent_type);
  if (!active) {
    throw new Error(`${BLOCKED_NO_CONSENT}: no active "${consent_type}" consent to revoke for this encounter`);
  }
  return appendConsentEntry({
    session_ref,
    consent_type,
    type_source: def.type_source,
    omnibus_binding: bindingFor(def, consent_type),
    status: "inactive",
    reason: "patient_revoked",
    scope: def.scope,
    provision_actions: def.provision_actions,
  });
}

/**
 * Inactivate every ACTIVE consent for a closing encounter (expires:
 * session_end made mechanical). Called by the session-store close hook; safe
 * to call directly. @returns {number} consents inactivated
 */
export function endSessionConsents(session_ref) {
  requireSessionRef(session_ref);
  let ended = 0;
  for (const [consent_type, def] of Object.entries(CONSENT_TYPES)) {
    const latest = latestEvent(session_ref, consent_type);
    if (latest && latest.status === "active") {
      appendConsentEntry({
        session_ref,
        consent_type,
        type_source: def.type_source,
        omnibus_binding: bindingFor(def, consent_type),
        status: "inactive",
        reason: "session_end",
        scope: def.scope,
        provision_actions: def.provision_actions,
      });
      ended += 1;
    }
  }
  return ended;
}

// Session-bound expiry, wired: closing an encounter inactivates its consents.
// Registered via the session-store hook registry (no import cycle; the hook
// never blocks state destruction — see session-store closeEncounter).
registerCloseHook((session_ref) => {
  endSessionConsents(session_ref);
});
