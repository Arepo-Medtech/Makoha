/**
 * session-store — technical enforcement of session-bound persistence
 * (ARCH_PLAN C8 / FMEA F12; gap `session-persistence-unenforced`, R-10 —
 * a named patient-facing release blocker).
 *
 * <data_handling>: "No persistence beyond session without explicit consent."
 * Until this module, that was policy only. This store makes it mechanical:
 *
 *   - MEMORY ONLY. There is no disk path, no serialisation API, no export
 *     hook. Working state cannot outlive the process, and an encounter's
 *     state cannot outlive the encounter.
 *   - ENCOUNTER-SCOPED LIFETIME. State exists only between openEncounter()
 *     and closeEncounter(). Closing DESTROYS everything held for that
 *     encounter; a closed encounter can never be reopened (no zombie
 *     sessions) and its refs never resolve again.
 *   - NO IMPLICIT CREATION. Writing to an encounter that was never opened
 *     throws — there is no way to accumulate untracked state.
 *   - NO DEMOGRAPHICS (Trust Boundary 4). Downstream trunks hold
 *     encounter-scoped references and receipts, never demographics. The
 *     demographic guard scans every value written: demographic-looking KEYS
 *     (name/dob/address/medicare/ihi/phone/email/…) and IHI-shaped VALUES
 *     (16 digits starting 800360) are refused with a thrown error. Detection
 *     is conservative — over-blocking is the safe direction; identity data
 *     belongs inside the identity-au boundary only.
 *
 * WHAT THIS STORE IS NOT: the medicolegal audit ledger (audit-store.js) is
 * NOT working state — it is the append-only, PHI-free-by-contract
 * (`.strict()` + field set) audit record and MUST survive the encounter.
 * Hashes, receipt metadata, and verification results persist there by design.
 *
 * ADOPTION CONTRACT: any future stateful session path (portal flows, patient
 * conversations, cross-trunk working memory) MUST hold its working state in
 * this store — holding it anywhere else reintroduces the unenforced-persistence
 * gap. Real-patient content persistence additionally requires explicit consent
 * plus the remaining release blockers (see content-store-production-gated).
 */
import { randomUUID } from "node:crypto";

/** Live encounters: session_ref → Map<key, value>. Memory only, by design. */
const encounters = new Map();
/** Refs that have been closed — they refuse forever (no resurrection). */
const closed = new Set();

/** Demographic-looking keys are refused wherever they appear in a value. */
const DEMOGRAPHIC_KEY_RE =
  /(^|[_.-])(name|given_names?|family_name|surname|first_name|last_name|full_name|dob|date_of_birth|birth_date|address|street|suburb|postcode|medicare(_number)?|ihi|phone|mobile|email|demographics)([_.-]|$)/i;
/** AU IHI values are 16 digits starting 800360 — refused wherever they appear. */
const IHI_VALUE_RE = /\b800360\d{10}\b/;

/** Keys that merely REFERENCE identity artefacts without carrying them. */
const SAFE_KEY_EXCEPTIONS = new Set(["snomed_display", "drug_name", "analyte_name", "dataset_name"]);

/**
 * Recursively find the first demographic violation in a value, or null.
 * Conservative by design: a demographic-looking key anywhere (nested included)
 * or an IHI-shaped number in any string refuses the whole write.
 */
function findDemographicViolation(value, path = "value") {
  if (typeof value === "string") {
    return IHI_VALUE_RE.test(value) ? `${path}: contains an IHI-shaped value (identity data stays inside the identity-au boundary)` : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v = findDemographicViolation(value[i], `${path}[${i}]`);
      if (v) return v;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (!SAFE_KEY_EXCEPTIONS.has(k) && DEMOGRAPHIC_KEY_RE.test(k)) {
        return `${path}.${k}: demographic-looking key — demographics never persist outside the identity boundary (Trust Boundary 4)`;
      }
      const nested = findDemographicViolation(v, `${path}.${k}`);
      if (nested) return nested;
    }
  }
  return null;
}

/** Mint an encounter-scoped reference (what downstream trunks hold instead of identity). */
export function newEncounterRef() {
  return `enc-${randomUUID()}`;
}

/**
 * Open an encounter workspace. @returns the session_ref.
 * @throws if the ref is already open, or was closed (closed refs never resurrect).
 */
export function openEncounter(sessionRef = newEncounterRef()) {
  if (typeof sessionRef !== "string" || !sessionRef.trim()) throw new Error("session-store: session_ref must be a non-empty string");
  if (closed.has(sessionRef)) throw new Error(`session-store: encounter "${sessionRef}" was closed — a closed encounter can never be reopened`);
  if (encounters.has(sessionRef)) throw new Error(`session-store: encounter "${sessionRef}" is already open`);
  encounters.set(sessionRef, new Map());
  return sessionRef;
}

export function isOpen(sessionRef) {
  return encounters.has(sessionRef);
}

function requireOpen(sessionRef, verb) {
  if (encounters.has(sessionRef)) return encounters.get(sessionRef);
  const why = closed.has(sessionRef) ? "was closed — its state is destroyed" : "was never opened — no implicit state creation";
  throw new Error(`session-store: cannot ${verb} "${sessionRef}": encounter ${why}`);
}

/**
 * Hold working state for an OPEN encounter. Refuses demographic content.
 * @throws on unknown/closed encounter or a demographic-guard violation.
 */
export function putWorkingState(sessionRef, key, value) {
  const store = requireOpen(sessionRef, "write to");
  const violation = findDemographicViolation(value);
  if (violation) throw new Error(`session-store: REFUSED (${violation})`);
  store.set(key, value);
}

/** Read working state — only while the encounter is open. */
export function getWorkingState(sessionRef, key) {
  return requireOpen(sessionRef, "read from").get(key);
}

/** List the working-state keys of an open encounter. */
export function listWorkingState(sessionRef) {
  return [...requireOpen(sessionRef, "list").keys()];
}

/**
 * Close the encounter and DESTROY all its working state. Idempotence is
 * refused on purpose: closing twice (or closing an unknown ref) throws,
 * because it means the caller's lifecycle tracking is broken.
 * @returns {{ session_ref: string, keys_destroyed: number }}
 */
export function closeEncounter(sessionRef) {
  const store = requireOpen(sessionRef, "close");
  const keys_destroyed = store.size;
  store.clear();
  encounters.delete(sessionRef);
  closed.add(sessionRef);
  return { session_ref: sessionRef, keys_destroyed };
}

/** Destroy every open encounter (process shutdown / test hygiene). */
export function destroyAllEncounters() {
  let destroyed = 0;
  for (const ref of [...encounters.keys()]) {
    destroyed += closeEncounter(ref).keys_destroyed;
  }
  return destroyed;
}
