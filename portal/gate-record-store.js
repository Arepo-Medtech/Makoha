/**
 * gate-record-store — DURABLE, append-only, hash-chained storage for
 * VerificationGateRecords (LIVE_PLAN L1; the M5 remainder's storage half).
 *
 * portal/verification-gate.js is FROZEN (RETAIN): its in-memory registry is
 * the mock-scope seam and its GateRecordSchema is the contract. This module
 * adds durability AROUND it, never inside it:
 *
 *   recordDecisionDurable()  validate → append to the durable chain → then
 *                            hydrate the frozen gate's in-memory registry via
 *                            its own recordGateDecision() (so releaseToPatient
 *                            sees the decision) — durable-first, so a crash
 *                            between the two steps loses availability, never
 *                            the record;
 *   hydrateGateRegistry()    replay the durable chain into the in-memory
 *                            registry at process start (idempotent);
 *   verifyGateRecordChain()  end-to-end tamper check, same algorithm as the
 *                            other two ledgers.
 *
 * Each entry also carries the bundle_sha256 of the ReviewBundle the clinician
 * was shown (review-bundle.js), so the trail proves what was reviewed, not
 * just what was decided.
 *
 * SUBSTRATE SEAM (mirrors audit-store M8): the chain sits on
 * { appendLine, readLines }; the built-in `local` backend is the dev JSONL
 * file (NOT WORM). Production registers a WORM adapter via
 * registerGateRecordSubstrate(); selecting a non-local substrate with no
 * adapter REFUSES — clinician decisions are never silently written to a
 * non-WORM backend. (R-39: the WORM adapter itself is input-gated on the
 * operator's backend choice.)
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { sha256Prefixed } from "../verification/hash.js";
import { GateRecordSchema, recordGateDecision, getGateRecords } from "./verification-gate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

export const GATE_GENESIS_HASH = "sha256:" + "0".repeat(64);
const HASH = /^sha256:[a-f0-9]{64}$/;

function dataDir() {
  return process.env.HEYDOC_DATA_DIR || join(REPO_ROOT, ".heydoc-data");
}
function storePath() {
  return join(dataDir(), "gate-records.jsonl");
}

// --- substrate seam -----------------------------------------------------------
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

/** Register a production (WORM) gate-record substrate at deploy. */
export function registerGateRecordSubstrate(name, adapter) {
  for (const op of ["appendLine", "readLines"]) {
    if (typeof (adapter || {})[op] !== "function") throw new Error(`gate-record substrate "${name}" missing required op: ${op}()`);
  }
  substrates.set(name, adapter);
}

function substrate() {
  const name = (process.env.HEYDOC_GATE_RECORD_SUBSTRATE || "local").trim() || "local";
  const s = substrates.get(name);
  if (!s) {
    throw new Error(
      `gate-record substrate "${name}" is not configured — register a WORM adapter at deploy via registerGateRecordSubstrate(). ` +
      `Refusing to write clinician gate records to an unconfigured/non-WORM backend.`
    );
  }
  return s;
}

// --- chain --------------------------------------------------------------------
/** Verified-clinician identity block (FL-42). Rides the durable ENTRY envelope,
 *  NOT the frozen GateRecordSchema — same layering as bundle_sha256. Proves the
 *  decision was made by a federation-verified clinician, not a shared-token
 *  holder typing a name. Optional for backward compatibility (a legacy/mock
 *  caller may omit it); when present it is hash-chained and bound to the record. */
const IdentitySchema = z
  .object({
    verified: z.boolean(),
    idp: z.string().min(1),
    subject: z.string().min(1),
    ahpra_registration: z.string().nullable().optional(),
    display_name: z.string().nullable().optional(),
    session_id: z.string().min(1),
  })
  .strict();

const GateEntrySchema = z
  .object({
    seq: z.number().int().nonnegative(),
    entry_id: z.string().min(8),
    recorded_at_utc: z.string().datetime(),
    prev_hash: z.string().regex(HASH),
    bundle_sha256: z.string().regex(HASH).optional(), // what the reviewer was shown
    identity: IdentitySchema.optional(), // WHO attested (FL-42 federation)
    record: GateRecordSchema, // the clinician decision (frozen contract)
    entry_hash: z.string().regex(HASH),
  })
  .strict();

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}
function computeEntryHash(entryWithoutHash, prevHash) {
  return sha256Prefixed(canonical(entryWithoutHash) + prevHash);
}

/** Read every durable gate-record entry, in order. */
export function readGateRecordEntries() {
  return substrate().readLines().map((l) => JSON.parse(l));
}

/**
 * Record a clinician decision durably, THEN hydrate the frozen gate registry.
 * @param {object} record - VerificationGateRecord (validated against the frozen contract)
 * @param {{ bundle_sha256?: string, identity?: object }} [opts] - hash of the
 *   ReviewBundle shown, and (FL-42) the verified-clinician identity block. When
 *   an identity is supplied its `subject` MUST equal the record's clinician_id —
 *   the frozen record's clinician can never disagree with the verified identity
 *   (fail-closed binding).
 * @returns {{ entry: object, record: object }}
 */
export function recordDecisionDurable(record, opts = {}) {
  const parsed = GateRecordSchema.parse(record); // frozen contract gates first

  let identity;
  if (opts.identity !== undefined) {
    identity = IdentitySchema.parse(opts.identity);
    // BINDING (fail-closed): the attested clinician_id must be the verified one.
    if (identity.subject !== parsed.clinician_id) {
      throw new Error(
        `gate-record identity binding: record.clinician_id="${parsed.clinician_id}" does not match the verified identity subject="${identity.subject}" — refusing to persist a decision whose clinician disagrees with the federated identity`
      );
    }
  }

  const entries = readGateRecordEntries();
  const prev = entries[entries.length - 1];
  const prev_hash = prev ? prev.entry_hash : GATE_GENESIS_HASH;

  const withoutHash = compact({
    seq: entries.length,
    entry_id: `gate-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    recorded_at_utc: new Date().toISOString(),
    prev_hash,
    bundle_sha256: opts.bundle_sha256,
    identity,
    record: compact(parsed),
  });
  const entry = { ...withoutHash, entry_hash: computeEntryHash(withoutHash, prev_hash) };
  GateEntrySchema.parse(entry);

  // Durable first: a crash after this line loses in-memory availability only —
  // hydrateGateRegistry() restores it. The record itself is never lost.
  substrate().appendLine(JSON.stringify(entry));
  const frozen = recordGateDecision(parsed);
  return { entry, record: frozen };
}

/** Is this decision already present in the frozen gate's in-memory registry? */
function inRegistry(rec) {
  return getGateRecords(rec.candidate_output_hash).some(
    (r) =>
      r.clinician_id === rec.clinician_id &&
      r.decision === rec.decision &&
      r.decided_at_utc === rec.decided_at_utc &&
      r.signature_ref === rec.signature_ref
  );
}

/**
 * Replay the durable chain into the frozen gate's in-memory registry, so
 * releaseToPatient() sees past decisions across process restarts. Idempotent
 * (skips decisions already registered). Returns the number replayed.
 */
export function hydrateGateRegistry() {
  let replayed = 0;
  for (const entry of readGateRecordEntries()) {
    if (!inRegistry(entry.record)) {
      recordGateDecision(entry.record);
      replayed += 1;
    }
  }
  return replayed;
}

/** Walk the durable chain and verify it end to end. */
export function verifyGateRecordChain() {
  const entries = readGateRecordEntries();
  let prev_hash = GATE_GENESIS_HASH;
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

/** The latest effective decision for a candidate hash, from the DURABLE trail. */
export function effectiveDecision(candidateOutputHash) {
  const matching = readGateRecordEntries().filter((e) => e.record.candidate_output_hash === candidateOutputHash);
  return matching.length ? matching[matching.length - 1].record : null;
}
