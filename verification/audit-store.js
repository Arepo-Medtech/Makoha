/**
 * medicolegal-audit-ledger — append-only, hash-chained audit store.
 *
 * Implements the registered internal component `medicolegal-audit-ledger`. It
 * persists the PROOF of every verification run (hash + run/trunk metadata + pass
 * gate + per-check booleans + receipt metadata) to a tamper-evident, append-only
 * log, and — for SYNTHETIC data only — the exact output text to a content-
 * addressed store so outputs can be re-verified ("rehashed") later.
 *
 * WHY append-only + hash-chain: <observability_and_audit> requires the audit
 * trail be durable and tamper-evident, and forbids any path that discards,
 * overwrites, or mutates it. Each entry's entry_hash is computed over the entry's
 * canonical content PLUS the previous entry's hash, so any edit, insertion, or
 * reorder breaks the chain (verifyChain()). We only ever append; we never rewrite.
 *
 * WHY a synthetic-only content guard: the exact output can carry patient data.
 * <data_handling> forbids persisting patient data beyond session without consent,
 * and session-bound persistence is an open Critical. So persistContent() refuses
 * to write unless the caller asserts the data is synthetic. The non-PHI ledger is
 * always safe to persist; the PHI-bearing content store is gated.
 *
 * SUBSTRATE SEAM (M8/C5): the hash-chain logic sits ON a small storage
 * "substrate" interface (appendLedgerLine / readLedgerLines / writeContentOnce /
 * readContentByHex) — it never touches the filesystem directly. The built-in
 * `local` substrate is the dev JSONL/filesystem backend (NOT WORM, NOT
 * multi-process safe). Production registers a WORM adapter (e.g. S3 Object Lock,
 * immudb) implementing the SAME interface via registerAuditSubstrate() at
 * deploy; the chain algorithm is frozen and unchanged. Fail-safe: selecting a
 * non-local substrate (HEYDOC_AUDIT_SUBSTRATE) with no adapter registered
 * REFUSES — the medicolegal ledger is never silently written to a non-WORM
 * backend. Retention is a MINIMUM-KEEP <regulatory_posture> decision surfaced by
 * auditRetentionPolicy(); the ledger is NEVER auto-deleted here.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLedgerEntry } from "./ledger-schema.js";
import { sha256Prefixed } from "./hash.js";
import { normaliseMode } from "./mode.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

/** Genesis link for the first entry: sha256: + 64 zeros. */
export const GENESIS_HASH = "sha256:" + "0".repeat(64);

/** Resolve the data root. HEYDOC_DATA_DIR override lets tests use a temp dir. */
function dataDir() {
  return process.env.HEYDOC_DATA_DIR || join(REPO_ROOT, ".heydoc-data");
}
function ledgerPath() {
  return join(dataDir(), "audit-ledger.jsonl");
}
function contentDir() {
  return join(dataDir(), "content");
}

// --- Audit substrate seam (M8/C5) ------------------------------------------
// The chain algorithm calls these four I/O ops; it never touches `fs` directly.
// A production WORM adapter implements the same interface. Default: `local`.

const REQUIRED_SUBSTRATE_OPS = ["appendLedgerLine", "readLedgerLines", "writeContentOnce", "readContentByHex"];
const substrateRegistry = new Map();

/**
 * Register a production audit substrate (e.g. a WORM adapter) at deploy time.
 * The adapter MUST implement all four ops; it MUST be append-only / write-once
 * (the chain's tamper-evidence assumes the backend never rewrites or reorders).
 * @param {string} name - value that HEYDOC_AUDIT_SUBSTRATE selects
 * @param {{appendLedgerLine:Function, readLedgerLines:Function, writeContentOnce:Function, readContentByHex:Function}} adapter
 */
export function registerAuditSubstrate(name, adapter) {
  for (const op of REQUIRED_SUBSTRATE_OPS) {
    if (typeof (adapter || {})[op] !== "function") throw new Error(`audit substrate "${name}" missing required op: ${op}()`);
  }
  substrateRegistry.set(name, adapter);
}

/** Built-in `local` substrate: dev JSONL/filesystem (NOT WORM). Resolves paths
 *  per call so the HEYDOC_DATA_DIR override keeps working. */
const localSubstrate = {
  appendLedgerLine(line) {
    const dir = dataDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(ledgerPath(), line + "\n");
  },
  readLedgerLines() {
    const p = ledgerPath();
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf8").split("\n").filter((l) => l.trim().length > 0);
  },
  writeContentOnce(hex, text) {
    const dir = contentDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const p = join(contentDir(), `${hex}.txt`);
    if (!existsSync(p)) writeFileSync(p, text, "utf8"); // content-addressed → write once
    return p;
  },
  readContentByHex(hex) {
    const p = join(contentDir(), `${hex}.txt`);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  },
};
substrateRegistry.set("local", localSubstrate);

/** Resolve the active substrate. FAIL-SAFE: a non-local name with no registered
 *  adapter REFUSES — never silently write the medicolegal ledger to a non-WORM
 *  backend. */
function substrate() {
  const name = (process.env.HEYDOC_AUDIT_SUBSTRATE || "local").trim() || "local";
  const s = substrateRegistry.get(name);
  if (!s) {
    throw new Error(
      `audit substrate "${name}" is not configured — a non-local (WORM) substrate ` +
      `must be registered via registerAuditSubstrate() at deploy. Refusing to write ` +
      `the medicolegal ledger to an unconfigured/non-WORM backend.`
    );
  }
  return s;
}

/**
 * Retention policy surface (M8/C5) — SURFACE, do not decide. Append-only/WORM
 * medicolegal records are NEVER auto-deleted here; retention is a MINIMUM-KEEP
 * org/regulatory (<regulatory_posture>) decision, and the WORM substrate forbids
 * early deletion. Reads HEYDOC_AUDIT_RETENTION and reports it; unset ⇒ not
 * configured, with a note. No period is encoded in code.
 * @returns {{ configured: boolean, retention: string|null, auto_delete: false, note: string }}
 */
export function auditRetentionPolicy() {
  const v = (process.env.HEYDOC_AUDIT_RETENTION || "").trim();
  if (!v) {
    return { configured: false, retention: null, auto_delete: false,
      note: "retention unset — a regulatory_posture (minimum-keep) decision required before production; the ledger is never auto-deleted" };
  }
  return { configured: true, retention: v, auto_delete: false,
    note: "minimum-keep retention; the append-only/WORM substrate forbids early deletion" };
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

/** Drop keys whose value is undefined, so canonical form is stable. */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/** entry_hash = sha256( canonical(entry-without-entry_hash) + prev_hash ). */
function computeEntryHash(entryWithoutHash, prevHash) {
  return sha256Prefixed(canonical(entryWithoutHash) + prevHash);
}

function randomId() {
  return `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Read and parse every ledger entry (in order). Returns [] if no ledger yet. */
export function readLedger() {
  return substrate().readLedgerLines().map((l) => JSON.parse(l));
}

/**
 * Append one audit record. The store assigns seq, entry_id, recorded_at_utc,
 * prev_hash, and entry_hash; the caller supplies the run-specific fields. The
 * record is validated (PHI-free, well-formed) before it is written.
 *
 * @param {{ run_id: string, candidate_output_hash: string, pass: boolean,
 *           check_results: Array<{check:string,passed:boolean}>,
 *           receipts: Array<{request_id:string,upstream:string,mode:string,timestamp_utc?:string}>,
 *           mode: string, content_persisted: boolean,
 *           trunk_id?: string, session_ref?: string }} core
 * @returns {object} the full ledger entry that was appended
 */
export function appendEntry(core) {
  const entries = readLedger();
  const prev = entries[entries.length - 1];
  const prev_hash = prev ? prev.entry_hash : GENESIS_HASH;
  const seq = entries.length;

  const withoutHash = compact({
    seq,
    entry_id: randomId(),
    recorded_at_utc: new Date().toISOString(),
    prev_hash,
    run_id: core.run_id,
    trunk_id: core.trunk_id,
    session_ref: core.session_ref,
    candidate_output_hash: core.candidate_output_hash,
    pass: core.pass,
    check_results: (core.check_results || []).map((r) => ({ check: r.check, passed: r.passed })),
    receipts: (core.receipts || []).map((r) =>
      compact({ request_id: r.request_id, upstream: r.upstream, mode: r.mode, timestamp_utc: r.timestamp_utc, codes: r.codes })
    ),
    mode: core.mode,
    content_persisted: !!core.content_persisted,
  });

  const entry = { ...withoutHash, entry_hash: computeEntryHash(withoutHash, prev_hash) };

  // Gate the record before it touches the durable log — never append a malformed
  // or PHI-bearing entry (throws on failure).
  validateLedgerEntry(entry);

  // Append via the active substrate (local JSONL by default; a WORM adapter in
  // production). substrate() refuses if a non-local backend is selected but not
  // registered, so a misconfigured production run never writes to a non-WORM file.
  substrate().appendLedgerLine(JSON.stringify(entry));
  return entry;
}

/**
 * Walk the ledger and verify the hash chain end to end.
 * @returns {{ valid: boolean, entries: number, brokenAt?: number, reason?: string }}
 */
export function verifyChain() {
  const entries = readLedger();
  let prev_hash = GENESIS_HASH;
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

function hexOf(candidateHash) {
  return String(candidateHash).replace(/^sha256:/, "");
}

/**
 * Persist the exact output text to the synthetic-only, content-addressed store.
 * Filename is the SHA-256 hex of the output, so the ledger's candidate_output_hash
 * resolves directly to it. Idempotent.
 *
 * @param {string} candidateHash - 'sha256:<hex>' anchor for this output
 * @param {string} output - the exact candidate output text
 * @param {{ synthetic: boolean }} opts - synthetic MUST be true; otherwise refused
 * @returns {string} the content file path
 * @throws {Error} if synthetic is not asserted (patient-data-minimisation guard)
 */
export function persistContent(candidateHash, output, opts = {}) {
  if (opts.synthetic !== true) {
    // Refuse to persist non-synthetic output: real-patient content must not be
    // retained until session-bound persistence + consent are enforced.
    throw new Error("persistContent refused: content store is synthetic-only (opts.synthetic must be true)");
  }
  if (typeof output !== "string") throw new TypeError("persistContent requires a string output");
  // Write-once via the active substrate (content-addressed by the output hash).
  return substrate().writeContentOnce(hexOf(candidateHash), output);
}

/** Read stored output by its hash, or null if not persisted. */
export function readContent(candidateHash) {
  return substrate().readContentByHex(hexOf(candidateHash));
}

/**
 * Normalise pipeline receipts into ledger receipt METADATA (no payloads).
 * Handles the three shapes the pipeline produces: live MCP receipts (r.receipt),
 * live_data stub receipts (r.request_id), and static_doc citations (r.citation_id).
 */
function receiptMeta(packetReceipts) {
  return (packetReceipts || [])
    .map((r) => {
      if (r.receipt) {
        return { request_id: r.receipt.request_id, upstream: r.receipt.upstream, mode: r.receipt.mode, timestamp_utc: r.receipt.timestamp_utc };
      }
      if (r.request_id) {
        return { request_id: r.request_id, upstream: r.upstream || "stub", mode: r.mode || "mock" };
      }
      const cid = r.citation_id || r.ref;
      if (cid) return { request_id: cid, upstream: r.upstream || "docs", mode: r.mode || "mock" };
      return null;
    })
    .filter((r) => r && r.request_id && r.upstream && r.mode);
}

/**
 * Record one verification run to the audit ledger (and, for synthetic data, the
 * content store). Called by both report writers after validateReport(). Keeps the
 * two writers in lockstep and the synthetic-only guard in one place.
 *
 * Content is persisted only when the run is NOT live — in mock/staging everything
 * is synthetic. Live runs never persist output text (patient-data minimisation),
 * and content_persisted is recorded as false for them.
 *
 * @param {{ run_id: string, output?: string, verification: object, packet?: object }} result - runPipeline() result
 * @param {{ trunkId?: string, sessionRef?: string }} opts
 * @returns {object} the appended ledger entry
 */
export function recordRun(result, opts = {}) {
  // Normalised (C16/F4): staging/production map to "live", so a non-dev run is
  // never classified synthetic (content NOT persisted, content_persisted=false)
  // and the ledger's mode enum (live|dry_run|mock) is never handed a raw env name.
  const mode = normaliseMode(process.env.HEYDOC_MODE_DEFAULT).context_mode;
  const synthetic = mode !== "live";
  const hash = result.verification.candidate_output_hash;

  let content_persisted = false;
  if (synthetic && typeof result.output === "string") {
    persistContent(hash, result.output, { synthetic: true });
    content_persisted = true;
  }

  // Carry each terminology receipt's validated codes into the ledger so a later
  // reissue can rebind codes exactly (see rehash.js / pipeline.js terminology).
  const codesByReq = new Map((result.terminology || []).map((t) => [t.request_id, t.codes || []]));
  const receipts = receiptMeta(result.packet && result.packet.receipts).map((r) => {
    const codes = codesByReq.get(r.request_id);
    return codes && codes.length ? { ...r, codes } : r;
  });

  return appendEntry({
    run_id: result.run_id,
    trunk_id: opts.trunkId,
    session_ref: opts.sessionRef,
    candidate_output_hash: hash,
    pass: result.verification.pass,
    check_results: result.verification.results,
    receipts,
    mode,
    content_persisted,
  });
}
