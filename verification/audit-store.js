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
 * NOTE: this mock-scope store reads/appends a local JSONL file and is NOT
 * multi-process safe. A production ledger needs atomic append + durable, WORM
 * storage + an org-defined retention policy (a <regulatory_posture> decision).
 */
import { createHash } from "node:crypto";
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
  const digest = createHash("sha256")
    .update(canonical(entryWithoutHash) + prevHash, "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

function randomId() {
  return `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Read and parse every ledger entry (in order). Returns [] if no ledger yet. */
export function readLedger() {
  const p = ledgerPath();
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
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
      compact({ request_id: r.request_id, upstream: r.upstream, mode: r.mode, timestamp_utc: r.timestamp_utc })
    ),
    mode: core.mode,
    content_persisted: !!core.content_persisted,
  });

  const entry = { ...withoutHash, entry_hash: computeEntryHash(withoutHash, prev_hash) };

  // Gate the record before it touches the durable log — never append a malformed
  // or PHI-bearing entry (throws on failure).
  validateLedgerEntry(entry);

  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(ledgerPath(), JSON.stringify(entry) + "\n");
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
function contentPath(candidateHash) {
  return join(contentDir(), `${hexOf(candidateHash)}.txt`);
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
  const dir = contentDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = contentPath(candidateHash);
  if (!existsSync(p)) writeFileSync(p, output, "utf8"); // content-addressed → write once
  return p;
}

/** Read stored output by its hash, or null if not persisted. */
export function readContent(candidateHash) {
  const p = contentPath(candidateHash);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
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
  const mode = process.env.HEYDOC_MODE_DEFAULT || "mock";
  const synthetic = mode !== "live";
  const hash = result.verification.candidate_output_hash;

  let content_persisted = false;
  if (synthetic && typeof result.output === "string") {
    persistContent(hash, result.output, { synthetic: true });
    content_persisted = true;
  }

  return appendEntry({
    run_id: result.run_id,
    trunk_id: opts.trunkId,
    session_ref: opts.sessionRef,
    candidate_output_hash: hash,
    pass: result.verification.pass,
    check_results: result.verification.results,
    receipts: receiptMeta(result.packet && result.packet.receipts),
    mode,
    content_persisted,
  });
}
