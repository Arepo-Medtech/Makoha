/**
 * consent-store — append-only, hash-chained consent-event trail
 * (LIVE_PLAN L12 / R-40 / FL-01; plan .planning/CONSENT-PLAN.md).
 *
 * WHY a fourth parallel chain and not audit-store.js: audit-store.js is FROZEN
 * (RETAIN, byte-unchanged) and its .strict() entry shape cannot carry a consent
 * event. This module reuses the audit-store PATTERN (canonical JSON,
 * entry_hash = sha256(canonical(entry) + prev_hash), verify walk,
 * HEYDOC_DATA_DIR override) with its OWN schema and file (consent-records.jsonl).
 * Consent history is medicolegal evidence — proof of what a patient agreed to,
 * and when — so it gets the same append-only, tamper-evident treatment as the
 * other three chains.
 *
 * PHI-FREE BY CONSTRUCTION: records carry an encounter-scoped session_ref,
 * closed enums, proven omnibus bindings, and hashes — never free text and never
 * demographics/IHI (Trust Boundary 4). The .strict() schema is enforced BEFORE
 * append.
 *
 * SUBSTRATE SEAM BUILT ON DAY ONE (the R-43 lesson: never ship a chained store
 * without its seam): the chain logic sits on a two-op { appendLine, readLines }
 * storage seam and never touches the filesystem directly. The built-in `local`
 * substrate is the dev JSONL file (NOT WORM). Production registers a WORM
 * adapter via registerConsentStoreSubstrate() at deploy — registerWormAudit()
 * (integration/audit-substrates/s3-object-lock.js) covers this chain alongside
 * the other three. FAIL-SAFE: selecting a non-local substrate
 * (HEYDOC_CONSENT_SUBSTRATE) with no adapter registered REFUSES.
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Prefixed } from "./hash.js";
import { normaliseMode } from "./mode.js";
import { validateConsentRecord } from "./consent-schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

/** Genesis link for the first record: sha256: + 64 zeros (audit-store idiom). */
export const CONSENT_GENESIS_HASH = "sha256:" + "0".repeat(64);

function dataDir() {
  return process.env.HEYDOC_DATA_DIR || join(REPO_ROOT, ".heydoc-data");
}
function storePath() {
  return join(dataDir(), "consent-records.jsonl");
}

// --- substrate seam (mirrors verification/ppp-ttt/ledger.js) -----------------
const substrates = new Map([
  [
    "local",
    {
      appendLine(line) {
        const dir = dataDir();
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        appendFileSync(storePath(), line + "\n");
      },
      readLines() {
        const p = storePath();
        if (!existsSync(p)) return [];
        return readFileSync(p, "utf8").split("\n").filter((l) => l.trim().length > 0);
      },
    },
  ],
]);

/**
 * Register a production (WORM) consent-store substrate at deploy time. The
 * adapter MUST implement { appendLine, readLines } and MUST be append-only /
 * write-once. Selected by HEYDOC_CONSENT_SUBSTRATE.
 */
export function registerConsentStoreSubstrate(name, adapter) {
  for (const op of ["appendLine", "readLines"]) {
    if (typeof (adapter || {})[op] !== "function") throw new Error(`consent-store substrate "${name}" missing required op: ${op}()`);
  }
  substrates.set(name, adapter);
}

/** Resolve the active substrate. FAIL-CLOSED: a non-local name with no
 *  registered adapter REFUSES — consent evidence is never silently written to
 *  an unconfigured/non-WORM backend. */
function substrate() {
  const name = (process.env.HEYDOC_CONSENT_SUBSTRATE || "local").trim() || "local";
  const s = substrates.get(name);
  if (!s) {
    throw new Error(
      `consent-store substrate "${name}" is not configured — register a WORM adapter at deploy via registerConsentStoreSubstrate(). ` +
      `Refusing to write consent records to an unconfigured/non-WORM backend.`
    );
  }
  return s;
}

/** Deterministic JSON: object keys sorted recursively, so hashing is stable. */
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

/** entry_hash = sha256( canonical(record-without-entry_hash) + prev_hash ). */
function computeEntryHash(recordWithoutHash, prevHash) {
  return sha256Prefixed(canonical(recordWithoutHash) + prevHash);
}

/** Read and parse every consent record in order ([] if none yet). */
export function readConsentLedger() {
  return substrate().readLines().map((l) => JSON.parse(l));
}

/**
 * Append one consent EVENT. The store assigns seq, consent_id, recorded_at_utc,
 * prev_hash, mode, and entry_hash; the caller supplies the event fields.
 * Validated (strict, PHI-free) BEFORE the durable write.
 *
 * @param {{ session_ref: string, consent_type: string,
 *           type_source: "heydoc-first-party"|"omnibus",
 *           omnibus_binding: object|null, status: "active"|"rejected"|"inactive",
 *           reason: string, scope: string, provision_actions: string[] }} core
 * @returns {object} the full consent record that was appended
 */
export function appendConsentEntry(core) {
  const entries = readConsentLedger();
  const prev = entries[entries.length - 1];
  const prev_hash = prev ? prev.entry_hash : CONSENT_GENESIS_HASH;

  const withoutHash = {
    seq: entries.length,
    consent_id: `consent-${sha256Prefixed(`${core.session_ref}|${core.consent_type}|${entries.length}`).slice(7, 23)}`,
    recorded_at_utc: new Date().toISOString(),
    prev_hash,
    session_ref: core.session_ref,
    consent_type: core.consent_type,
    type_source: core.type_source,
    omnibus_binding: core.omnibus_binding ?? null,
    status: core.status,
    reason: core.reason,
    scope: core.scope,
    provision_actions: core.provision_actions,
    policy_rule: "OPTIN",
    method: "patient_attested_in_session",
    expires: "session_end",
    mode: normaliseMode(process.env.HEYDOC_MODE_DEFAULT).context_mode,
  };
  const record = { ...withoutHash, entry_hash: computeEntryHash(withoutHash, prev_hash) };

  // Gate BEFORE the durable log — never append a malformed or PHI-bearing record.
  validateConsentRecord(record);

  substrate().appendLine(JSON.stringify(record));
  return record;
}

/**
 * Walk the consent store and verify the hash chain end to end.
 * @returns {{ valid: boolean, entries: number, brokenAt?: number, reason?: string }}
 */
export function verifyConsentChain() {
  const entries = readConsentLedger();
  let prev_hash = CONSENT_GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.seq !== i) return { valid: false, entries: entries.length, brokenAt: i, reason: `seq mismatch (expected ${i}, got ${e.seq})` };
    if (e.prev_hash !== prev_hash) return { valid: false, entries: entries.length, brokenAt: i, reason: "prev_hash does not link to previous entry" };
    const { entry_hash, ...withoutHash } = e;
    if (computeEntryHash(withoutHash, e.prev_hash) !== entry_hash) {
      return { valid: false, entries: entries.length, brokenAt: i, reason: "entry_hash does not match content (record edited)" };
    }
    prev_hash = entry_hash;
  }
  return { valid: true, entries: entries.length };
}
