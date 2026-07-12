/**
 * ppp-ttt ledger — PARALLEL append-only, hash-chained PPP-TTT audit trail.
 *
 * WHY parallel and not audit-store.js: audit-store.js is FROZEN (RETAIN,
 * byte-unchanged) and its appendEntry() shape is gated by validateLedgerEntry()
 * — the triage record does not fit it. This module reuses the audit-store
 * PATTERN (canonical JSON, entry_hash = sha256(canonical(entry) + prev_hash),
 * verifyChain, HEYDOC_DATA_DIR override) with its OWN schema and file
 * (ppp-ttt-ledger.jsonl), and CROSS-LINKS to the main ledger by
 * { run_id, candidate_output_hash, trunk_id } — the join key is the hash the
 * frozen verifier already anchors. Both chains are independently verifiable.
 *
 * PHI-FREE BY CONSTRUCTION: entries carry discriminator IDs, tier codes,
 * caveat codes, safety-net IDs, and a patient-decision enum — never free-text
 * patient narrative. The .strict() ledger schema is enforced BEFORE append.
 *
 * Mode discipline: the entry's mode comes from mode.js normaliseMode — a
 * staging/production/unknown environment is recorded as "live" (mock is never
 * presented as live; no new mock-as-live seam).
 *
 * SUBSTRATE SEAM (mirrors audit-store M8 + portal/gate-record-store.js): the
 * hash-chain logic sits on a two-op { appendLine, readLines } storage seam — it
 * never touches the filesystem directly. The built-in `local` substrate is the
 * dev JSONL file (NOT WORM, NOT multi-process safe). Production registers a WORM
 * adapter (e.g. S3 Object Lock) via registerPppTttLedgerSubstrate() at deploy;
 * the chain algorithm is frozen and unchanged (pure I/O indirection). FAIL-SAFE:
 * selecting a non-local substrate (HEYDOC_PPP_TTT_SUBSTRATE) with no adapter
 * registered REFUSES — the triage ledger is never silently written to a non-WORM
 * backend. Live WORM + retention ride the same deploy/regulatory decision (R-39)
 * as the M8 audit substrate (surface, don't decide).
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Prefixed } from "../hash.js";
import { normaliseMode } from "../mode.js";
import { validatePppTttLedgerEntry } from "./ledger-schema.js";
import { CAVEAT_CODES } from "./abcde/c-caveats.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

/** Genesis link for the first entry: sha256: + 64 zeros (audit-store idiom). */
export const PPP_TTT_GENESIS_HASH = "sha256:" + "0".repeat(64);

function dataDir() {
  return process.env.HEYDOC_DATA_DIR || join(REPO_ROOT, ".heydoc-data");
}
function ledgerPath() {
  return join(dataDir(), "ppp-ttt-ledger.jsonl");
}

// --- substrate seam (mirrors verification/audit-store.js M8 + portal/gate-record-store.js) ---
// The chain algorithm calls { appendLine, readLines } only; it never touches
// `fs` directly. A production WORM adapter implements the same two ops. Default:
// `local` (dev JSONL, NOT WORM). Paths resolve per call so HEYDOC_DATA_DIR keeps
// working.
const substrates = new Map([
  [
    "local",
    {
      appendLine(line) {
        const dir = dataDir();
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        appendFileSync(ledgerPath(), line + "\n");
      },
      readLines() {
        const p = ledgerPath();
        if (!existsSync(p)) return [];
        return readFileSync(p, "utf8").split("\n").filter((l) => l.trim().length > 0);
      },
    },
  ],
]);

/**
 * Register a production (WORM) PPP-TTT ledger substrate at deploy time. The
 * adapter MUST implement { appendLine, readLines } and MUST be append-only /
 * write-once — the chain's tamper-evidence assumes the backend never rewrites or
 * reorders. Selected by HEYDOC_PPP_TTT_SUBSTRATE.
 * @param {string} name
 * @param {{ appendLine: Function, readLines: Function }} adapter
 */
export function registerPppTttLedgerSubstrate(name, adapter) {
  for (const op of ["appendLine", "readLines"]) {
    if (typeof (adapter || {})[op] !== "function") throw new Error(`ppp-ttt ledger substrate "${name}" missing required op: ${op}()`);
  }
  substrates.set(name, adapter);
}

/** Resolve the active substrate. FAIL-CLOSED: a non-local name with no
 *  registered adapter REFUSES — the triage ledger is never silently written to
 *  a non-WORM backend (same discipline as the medicolegal audit ledger). */
function substrate() {
  const name = (process.env.HEYDOC_PPP_TTT_SUBSTRATE || "local").trim() || "local";
  const s = substrates.get(name);
  if (!s) {
    throw new Error(
      `ppp-ttt ledger substrate "${name}" is not configured — register a WORM adapter at deploy via registerPppTttLedgerSubstrate(). ` +
      `Refusing to write the PPP-TTT triage ledger to an unconfigured/non-WORM backend.`
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

/** Drop undefined-valued keys so the canonical form is stable. */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/** entry_hash = sha256( canonical(entry-without-entry_hash) + prev_hash ). */
function computeEntryHash(entryWithoutHash, prevHash) {
  return sha256Prefixed(canonical(entryWithoutHash) + prevHash);
}

/** Read and parse every PPP-TTT ledger entry in order ([] if none yet). Reads
 *  through the active substrate (local JSONL by default; a WORM adapter in
 *  production). */
export function readPppTttLedger() {
  return substrate().readLines().map((l) => JSON.parse(l));
}

/**
 * Append one PPP-TTT audit record. The store assigns seq, entry_id,
 * recorded_at_utc, prev_hash, mode, and entry_hash; the caller supplies the
 * run-specific PHI-free fields. Validated (strict, PHI-free) before write.
 *
 * @param {{ run_id: string, trunk_id?: string, candidate_output_hash: string,
 *           tier: "GO"|"CAUTION"|"STOP", fail_closed: boolean,
 *           discriminator_ids: string[], caveat_codes: string[],
 *           safety_net_ids: string[], patient_decision: string }} core
 * @returns {object} the full ledger entry that was appended
 */
export function appendPppTttEntry(core) {
  const entries = readPppTttLedger();
  const prev = entries[entries.length - 1];
  const prev_hash = prev ? prev.entry_hash : PPP_TTT_GENESIS_HASH;

  const withoutHash = compact({
    seq: entries.length,
    entry_id: `ppp-ttt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    recorded_at_utc: new Date().toISOString(),
    prev_hash,
    run_id: core.run_id,
    trunk_id: core.trunk_id,
    candidate_output_hash: core.candidate_output_hash,
    tier: core.tier,
    fail_closed: !!core.fail_closed,
    discriminator_ids: core.discriminator_ids || [],
    caveat_codes: core.caveat_codes || [],
    safety_net_ids: core.safety_net_ids || [],
    patient_decision: core.patient_decision || "n/a",
    mode: normaliseMode(process.env.HEYDOC_MODE_DEFAULT).context_mode,
  });
  const entry = { ...withoutHash, entry_hash: computeEntryHash(withoutHash, prev_hash) };

  // Gate BEFORE the durable log — never append a malformed or PHI-bearing entry.
  validatePppTttLedgerEntry(entry);

  // Append via the active substrate (local JSONL by default; a WORM adapter in
  // production). substrate() refuses if a non-local backend is selected but not
  // registered, so a misconfigured production run never writes the triage ledger
  // to a non-WORM file.
  substrate().appendLine(JSON.stringify(entry));
  return entry;
}

/**
 * Derive the PHI-free ledger core from a triage verdict + ABCDE record.
 * IDs and enums only — the free-text record stays on the audit channel.
 */
export function ledgerCoreFromRecord(record) {
  const v = record.step1_verdict;
  return {
    run_id: record.run_id,
    trunk_id: record.trunk_id,
    candidate_output_hash: record.candidate_output_hash,
    tier: v.tier,
    fail_closed: v.fail_closed,
    discriminator_ids: v.discriminators_asked.map((d) => d.id),
    caveat_codes: record.abcde ? [...CAVEAT_CODES] : [],
    safety_net_ids: record.abcde ? record.abcde.D_pitfalls.safety_net.map((s) => s.id) : [],
    patient_decision: record.abcde ? record.abcde.E_education.patient_decision : "n/a",
  };
}

/**
 * Walk the PPP-TTT ledger and verify the hash chain end to end.
 * @returns {{ valid: boolean, entries: number, brokenAt?: number, reason?: string }}
 */
export function verifyPppTttChain() {
  const entries = readPppTttLedger();
  let prev_hash = PPP_TTT_GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.seq !== i) return { valid: false, entries: entries.length, brokenAt: i, reason: `seq mismatch (expected ${i}, got ${e.seq})` };
    if (e.prev_hash !== prev_hash) return { valid: false, entries: entries.length, brokenAt: i, reason: "prev_hash does not link to previous entry" };
    const { entry_hash, ...withoutHash } = e;
    if (computeEntryHash(compact(withoutHash), e.prev_hash) !== entry_hash) {
      return { valid: false, entries: entries.length, brokenAt: i, reason: "entry_hash does not match content (entry edited)" };
    }
    prev_hash = entry_hash;
  }
  return { valid: true, entries: entries.length };
}
