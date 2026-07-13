/**
 * s3-object-lock — a WORM (write-once, read-many) substrate for the FOUR
 * medicolegal hash-chained stores (LIVE_PLAN §9 B1 / R-39; consent chain added
 * at L12): the audit ledger, the clinician gate records, the PPP-TTT triage
 * ledger, and the consent records. Operator choice: AWS S3 Object Lock,
 * COMPLIANCE mode, 7-year retention, region ap-southeast-2.
 *
 * WHY THE AWS CLI + execFileSync, NOT THE AWS SDK: the substrate seams are
 * SYNCHRONOUS by contract — verification/audit-store.js `appendEntry()` and
 * `readLedger()` call `appendLedgerLine`/`readLedgerLines` inline (that file is
 * FROZEN/byte-pinned, so it cannot be made async); portal/gate-record-store.js
 * and verification/ppp-ttt/ledger.js do the same on their two-op seams. The AWS
 * SDK is async (`client.send()` returns a Promise), so a
 * straight PutObject from a sync op could only be fire-and-forget — which would
 * SILENTLY DROP a medicolegal record on failure. `execFileSync("aws", …)` BLOCKS
 * until S3 durably acknowledges the write-once, Object-Lock object, then returns;
 * a CLI failure THROWS synchronously and the sync caller sees it (fail-closed).
 * Reads are served from an in-memory cache seeded once at boot, so only WRITES
 * spawn a subprocess (fine at medicolegal volumes).
 *
 * WHY THE AWS CLI IS A DEPLOY-TIME DEPENDENCY, NOT A REPO ONE: same discipline as
 * the aws-sm secrets backend — the core stays cloud-agnostic and mock-by-default.
 * The deploy image installs the AWS CLI (Dockerfile INSTALL_AWS_S3 arg); an
 * absent CLI yields a clear, actionable error, never a silent failure.
 *
 * WORM SEMANTICS: every write is `s3api put-object --object-lock-mode COMPLIANCE
 * --object-lock-retain-until-date <now+retentionYears> --if-none-match "*"`. The
 * bucket MUST be created with Object Lock (and versioning) enabled — the adapter
 * sets per-object retention; it cannot enable the feature. COMPLIANCE mode means
 * the object cannot be overwritten or deleted (even by root) until the retain
 * date — the medicolegal record is immutable for the full retention period.
 *
 * FAIL-CLOSED: missing bucket/region/retentionYears or a bad mode throws at
 * registration; a ledger key collision (append-only violated) throws; an absent
 * CLI throws actionably. Record VALUES are never logged (medicolegal + PHI).
 *
 * RETENTION IS SURFACED, NOT DECIDED (charter <regulatory_posture>): the period
 * is passed in as `retentionYears` (the operator supplied 7) — no period is
 * hardcoded. Set HEYDOC_AUDIT_RETENTION to the same value so the store's
 * auditRetentionPolicy() reporter agrees.
 */
import { execFileSync } from "node:child_process";
import { registerAuditSubstrate } from "../../verification/audit-store.js";
import { registerGateRecordSubstrate } from "../../portal/gate-record-store.js";
import { registerPppTttLedgerSubstrate } from "../../verification/ppp-ttt/ledger.js";
import { registerConsentStoreSubstrate } from "../../verification/consent-store.js";

const SEQ_PAD = 12; // zero-pad the seq so object keys sort in chain order

// --- pure helpers (exported for the contract test) ---------------------------

/** Object key for a chain entry: `${prefix}/${kind}/000000000042.json`. The
 *  zero-padded seq makes ListObjectsV2 return keys in chain order. */
export function objectKeyForSeq(prefix, kind, seq) {
  if (!Number.isInteger(seq) || seq < 0) throw new Error(`objectKeyForSeq: seq must be a non-negative integer (got ${seq})`);
  return `${prefix}/${kind}/${String(seq).padStart(SEQ_PAD, "0")}.json`;
}

/** Retain-until date = now + `years`, calendar-accurate (UTC). */
export function retainUntilDate(years, now = new Date()) {
  const d = new Date(now.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

/** S3 wants ISO8601 without milliseconds, e.g. 2033-07-13T00:00:00Z. */
function retainUntilArg(years) {
  return retainUntilDate(years).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Parse the top-level `seq` from a chain line (both chains define it). */
export function extractSeq(line) {
  let obj;
  try { obj = JSON.parse(line); } catch { obj = null; }
  if (!obj || !Number.isInteger(obj.seq) || obj.seq < 0) {
    throw new Error("s3-object-lock: chain line has no non-negative integer `seq` — cannot form a WORM object key");
  }
  return obj.seq;
}

// --- CLI porcelain -----------------------------------------------------------

/** Default executor: run the AWS CLI synchronously, body via stdin. */
function defaultExec(args, input) {
  return execFileSync("aws", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
}

/** Run the CLI through the (possibly injected) executor. An absent CLI (ENOENT)
 *  is wrapped into an actionable install error; all other errors pass through so
 *  the caller can inspect stderr for S3 conditions. */
function runAws(exec, args, input) {
  try {
    return exec(args, input);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      throw new Error(
        "s3-object-lock WORM adapter requires the AWS CLI on the deploy host — install it in the deploy image " +
        "(the Dockerfile INSTALL_AWS_S3 build arg adds it). It is intentionally NOT a repo dependency (the core is " +
        "cloud-agnostic and mock-by-default)."
      );
    }
    throw err;
  }
}

const stderrOf = (err) => String((err && (err.stderr || err.message)) || "");
const isPreconditionFailed = (err) => /PreconditionFailed|pre-conditions|\b412\b/i.test(stderrOf(err));
const is404 = (err) => /NoSuchKey|Not ?Found|does not exist|\b404\b/i.test(stderrOf(err));

/**
 * Register the `s3-object-lock` WORM substrate on ALL FOUR medicolegal seams
 * (audit ledger + clinician gate records + PPP-TTT triage ledger + consent
 * records), sharing one bucket/config. Call from the deploy bootstrap BEFORE
 * starting the server (await it — the boot read caches are seeded here).
 *
 * @param {{ bucket: string, region: string, retentionYears: number,
 *           mode?: "COMPLIANCE"|"GOVERNANCE", prefix?: string,
 *           exec?: (args: string[], input?: string) => string }} opts
 *   retentionYears — REQUIRED (no period is hardcoded; operator supplied 7).
 *   mode           — default COMPLIANCE (operator choice); GOVERNANCE allowed.
 *   exec           — test/override: (args, input) => stdout. Default: the AWS CLI.
 * @returns {Promise<{ registered: "s3-object-lock", bucket, region, mode,
 *   retentionYears, ledger_entries, gate_records, ppp_ttt_entries,
 *   consent_records, audit, gate, pppTtt, consent }>}
 */
export async function registerWormAudit({ bucket, region, retentionYears, mode = "COMPLIANCE", prefix = "heydoc-audit", exec } = {}) {
  if (!bucket || typeof bucket !== "string") throw new Error('registerWormAudit: `bucket` is required (an Object-Lock-enabled S3 bucket)');
  if (!region || typeof region !== "string") throw new Error('registerWormAudit: `region` is required (e.g. "ap-southeast-2")');
  if (!Number.isInteger(retentionYears) || retentionYears <= 0) {
    // Surface, don't decide: the retention PERIOD is a regulatory decision the
    // operator supplies — never defaulted in code.
    throw new Error("registerWormAudit: `retentionYears` must be a positive integer (the operator-set retention period, e.g. 7) — no period is defaulted in code");
  }
  if (mode !== "COMPLIANCE" && mode !== "GOVERNANCE") throw new Error(`registerWormAudit: \`mode\` must be "COMPLIANCE" or "GOVERNANCE" (got "${mode}")`);

  const run = (args, input) => runAws(exec || defaultExec, [...args, "--region", region], input);

  // --- I/O primitives -------------------------------------------------------
  const putOnce = (key, body, { throwOnExists }) => {
    try {
      run(["s3api", "put-object", "--bucket", bucket, "--key", key, "--body", "/dev/stdin",
        "--object-lock-mode", mode, "--object-lock-retain-until-date", retainUntilArg(retentionYears),
        "--if-none-match", "*"], body);
    } catch (err) {
      if (isPreconditionFailed(err)) {
        // Object already exists. For a content-addressed write that is idempotent
        // (same bytes, same hash); for a ledger append it is a seq COLLISION —
        // append-only violated → refuse.
        if (throwOnExists) throw new Error(`s3-object-lock: object "${key}" already exists — refusing to overwrite an immutable WORM record (append-only violated)`);
        return key;
      }
      throw err;
    }
    return key;
  };
  const getOrNull = (key) => {
    try {
      return run(["s3", "cp", `s3://${bucket}/${key}`, "-"]);
    } catch (err) {
      if (is404(err)) return null;
      throw err;
    }
  };
  const listKeys = (prefixKey) => {
    const out = run(["s3api", "list-objects-v2", "--bucket", bucket, "--prefix", prefixKey, "--query", "Contents[].Key", "--output", "text"]);
    const s = String(out || "").trim();
    if (!s || s === "None") return [];
    return s.split(/\s+/).filter(Boolean).sort();
  };
  const loadLines = (prefixKey) => listKeys(prefixKey).map((k) => getOrNull(k)).filter((v) => v !== null);

  // --- boot-seed the synchronous read caches --------------------------------
  const ledgerKind = "ledger";
  const gateKind = "gate-records";
  const pppKind = "ppp-ttt-ledger";
  const consentKind = "consent-records";
  const ledgerCache = loadLines(`${prefix}/${ledgerKind}/`);
  const gateCache = loadLines(`${prefix}/${gateKind}/`);
  const pppCache = loadLines(`${prefix}/${pppKind}/`);
  const consentCacheLines = loadLines(`${prefix}/${consentKind}/`);
  const contentCache = new Map(); // hex → text (lazy; content is not boot-loaded)

  // --- the two adapters (synchronous ops; cache read, execFileSync write) ----
  const audit = {
    appendLedgerLine(line) {
      const seq = extractSeq(line);
      putOnce(objectKeyForSeq(prefix, ledgerKind, seq), line, { throwOnExists: true });
      ledgerCache.push(line); // seq is monotonic, so append keeps chain order
    },
    readLedgerLines() {
      return ledgerCache.slice();
    },
    writeContentOnce(hex, text) {
      const key = `${prefix}/content/${hex}.txt`;
      putOnce(key, text, { throwOnExists: false }); // content-addressed → idempotent
      contentCache.set(hex, text);
      return key;
    },
    readContentByHex(hex) {
      if (contentCache.has(hex)) return contentCache.get(hex);
      const v = getOrNull(`${prefix}/content/${hex}.txt`);
      if (v !== null) contentCache.set(hex, v);
      return v;
    },
  };
  const gate = {
    appendLine(line) {
      const seq = extractSeq(line);
      putOnce(objectKeyForSeq(prefix, gateKind, seq), line, { throwOnExists: true });
      gateCache.push(line);
    },
    readLines() {
      return gateCache.slice();
    },
  };
  // PPP-TTT triage ledger — same two-op seam as gate records; entries carry a
  // top-level `seq` (extractSeq) so the same WORM object-keying applies.
  const pppTtt = {
    appendLine(line) {
      const seq = extractSeq(line);
      putOnce(objectKeyForSeq(prefix, pppKind, seq), line, { throwOnExists: true });
      pppCache.push(line);
    },
    readLines() {
      return pppCache.slice();
    },
  };

  // Consent records — same two-op seam; entries carry a top-level `seq`
  // (extractSeq) so the same WORM object-keying applies (L12 / FL-01).
  const consent = {
    appendLine(line) {
      const seq = extractSeq(line);
      putOnce(objectKeyForSeq(prefix, consentKind, seq), line, { throwOnExists: true });
      consentCacheLines.push(line);
    },
    readLines() {
      return consentCacheLines.slice();
    },
  };

  registerAuditSubstrate("s3-object-lock", audit);
  registerGateRecordSubstrate("s3-object-lock", gate);
  registerPppTttLedgerSubstrate("s3-object-lock", pppTtt);
  registerConsentStoreSubstrate("s3-object-lock", consent);

  return {
    registered: "s3-object-lock",
    bucket, region, mode, retentionYears,
    ledger_entries: ledgerCache.length,
    gate_records: gateCache.length,
    ppp_ttt_entries: pppCache.length,
    consent_records: consentCacheLines.length,
    // Exposed so callers/tests can drive the ops directly; the same objects are
    // what the seams call. Not required for normal operation.
    audit, gate, pppTtt, consent,
  };
}
