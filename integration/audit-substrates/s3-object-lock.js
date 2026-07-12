/**
 * s3-object-lock — a CONCRETE WORM substrate adapter (LIVE_PLAN L2 / §9 B1,
 * R-39) for the three medicolegal hash-chains behind their storage seams:
 *   - the medicolegal audit ledger   (verification/audit-store.js,   4-op seam)
 *   - the clinician gate records      (portal/gate-record-store.js,   2-op seam)
 *   - the PPP-TTT triage ledger       (verification/ppp-ttt/ledger.js, 2-op seam)
 *
 * registerWormAudit() registers this ONE adapter (name `s3-object-lock`) on ALL
 * THREE seams at deploy, so a single operator call makes every tamper-evident
 * chain durable + write-once on S3 with Object Lock in COMPLIANCE mode.
 *
 * WHY ONE-OBJECT-PER-ENTRY (the only WORM-compatible append model): S3 Object
 * Lock makes each object immutable until its RetainUntilDate — you cannot append
 * to, overwrite, or delete a locked object, even as root. A single growing
 * "ledger.jsonl" object is therefore impossible under WORM. So each appended
 * line becomes its own immutable object keyed by a zero-padded sequence
 * (`<prefix>/<seam>/000000000042.jsonl`); a read lists the prefix, sorts by key
 * (zero-padding ⇒ lexical order == numeric order) and concatenates. This is the
 * standard S3-Object-Lock ledger pattern. The content-addressed synthetic store
 * keys by output hash (`<prefix>/content/<hex>.txt`), write-once by nature.
 *
 * WHY THE AWS CLI (execFileSync), NOT THE AWS SDK: the three seams are
 * SYNCHRONOUS — `substrate().appendLine(line)` / `readLines()` return inline with
 * no await (the frozen chain code cannot be made async without editing the frozen
 * core). AWS SDK v3 is async-only; you cannot await it inside a sync seam op. The
 * AWS CLI via `execFileSync` gives DURABLE-FIRST synchronous I/O (the call blocks
 * until the WORM PutObject is committed), which is exactly the seam's contract.
 * The CLI is a deploy-host tool, not a repo dependency (the core stays
 * cloud-agnostic + mock-by-default). Absent CLI / bucket ⇒ a clear, actionable
 * error — never a silent non-WORM fallback (the seams' own refusal is the outer
 * guard; this is the inner one).
 *
 * WHY INJECTABLE TRANSPORT: the WORM SEMANTICS (write-once, ordered reads,
 * retention-required, content round-trip) are separated from the AWS specifics
 * behind a tiny synchronous transport { putObjectOnce, listKeys, getObject }.
 * Production uses the AWS CLI transport; the contract test injects an in-memory
 * transport to exercise the semantics + three-seam registration + end-to-end
 * chain verification with NO real AWS.
 *
 * FAIL-CLOSED RETENTION: COMPLIANCE-mode Object Lock REQUIRES a RetainUntilDate.
 * If no retention is configured (HEYDOC_AUDIT_RETENTION / opts.retention), this
 * adapter REFUSES to register — it will never write an object that merely looks
 * WORM but carries no lock. Retention is a MINIMUM-KEEP regulatory decision;
 * duration→date rounding is deliberately UP (366 d/yr, 31 d/mo) so we never
 * under-retain. Nothing here ever deletes.
 *
 * SECRET DISCIPLINE (<security_and_secrets>): this module handles only NON-secret
 * configuration (bucket, region, prefix, retention). AWS credentials come from
 * the deploy host's standard AWS chain (IAM instance role) — never from the repo,
 * never passed through here, never logged.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerAuditSubstrate } from "../../verification/audit-store.js";
import { registerGateRecordSubstrate } from "../../portal/gate-record-store.js";
import { registerPppTttLedgerSubstrate } from "../../verification/ppp-ttt/ledger.js";

const SEQ_PAD = 12; // zero-pad width: 10^12 entries per chain before overflow
const HEX_RE = /^[a-f0-9]{8,}$/i;

/** Zero-padded sequence key so a lexical listing is numeric order. */
function seqKey(prefix, seq) {
  return `${prefix}${String(seq).padStart(SEQ_PAD, "0")}.jsonl`;
}

/**
 * Parse a retain-until ISO date from either an explicit absolute date or an
 * ISO-8601 duration (P#Y#M#W#D) added to `now`. Rounds duration→days UP so a
 * MINIMUM-KEEP retention is never under-satisfied. Returns an ISO string.
 * @throws if neither an absolute date nor a parseable duration is given.
 */
export function resolveRetainUntil(retention, now = new Date()) {
  if (retention instanceof Date) return retention.toISOString();
  const raw = String(retention || "").trim();
  if (!raw) throw new Error("s3-object-lock: retention is required for COMPLIANCE Object Lock (set HEYDOC_AUDIT_RETENTION, e.g. \"P7Y\", or opts.retention)");

  // Absolute ISO date/datetime (must parse to a real, future-or-any date).
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new Error(`s3-object-lock: retention "${raw}" is not a valid ISO date`);
    return d.toISOString();
  }

  // ISO-8601 duration: P[n]Y[n]M[n]W[n]D (date-part only; time-part not needed
  // for multi-year medicolegal retention). At least one field must be present.
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(raw);
  if (!m || !m.slice(1).some(Boolean)) {
    throw new Error(`s3-object-lock: retention "${raw}" is not an ISO-8601 duration (e.g. "P7Y") or absolute ISO date`);
  }
  const [, y, mo, w, d] = m.map((x) => (x ? Number(x) : 0));
  // Round UP: 366 d/yr, 31 d/mo, 7 d/wk — over-retention is safe, under-retention
  // is a compliance breach.
  const days = y * 366 + mo * 31 + w * 7 + d;
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return until.toISOString();
}

/**
 * The default PRODUCTION transport: synchronous S3 access via the AWS CLI.
 * Deploy-only; each op blocks until the S3 call completes (durable-first). AWS
 * credentials + region resolve through the CLI's standard chain (IAM role).
 * @param {{ bucket: string, region?: string }} cfg
 */
export function awsCliTransport({ bucket, region }) {
  if (!bucket) throw new Error("s3-object-lock: awsCliTransport requires a bucket");
  const regionArgs = region ? ["--region", region] : [];

  function cli(args, opts = {}) {
    try {
      return execFileSync("aws", [...args, ...regionArgs], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts });
    } catch (e) {
      // Surface a clear, actionable error; never swallow into a silent success.
      const stderr = e && e.stderr ? String(e.stderr) : "";
      const err = new Error(`s3-object-lock: aws ${args[0]} ${args[1] || ""} failed: ${e.message}${stderr ? ` — ${stderr.trim()}` : ""}`);
      err.awsStderr = stderr;
      throw err;
    }
  }

  return {
    /** Write-once PUT with Object Lock. `--if-none-match "*"` rejects an
     *  overwrite so a seq collision fails loudly instead of clobbering a locked
     *  object. Body is staged to a temp file (put-object --body needs a path). */
    putObjectOnce(key, body, { retainUntil, mode }) {
      const dir = mkdtempSync(join(tmpdir(), "s3ol-"));
      const bodyPath = join(dir, "body");
      writeFileSync(bodyPath, body, "utf8");
      try {
        cli([
          "s3api", "put-object",
          "--bucket", bucket,
          "--key", key,
          "--body", bodyPath,
          "--object-lock-mode", mode,
          "--object-lock-retain-until-date", retainUntil,
          "--if-none-match", "*",
        ]);
      } finally {
        try { unlinkSync(bodyPath); } catch { /* best-effort temp cleanup */ }
      }
    },
    /** List object keys under a prefix (sorted numerically by the caller). */
    listKeys(prefix) {
      const out = cli(["s3api", "list-objects-v2", "--bucket", bucket, "--prefix", prefix, "--query", "Contents[].Key", "--output", "text"]);
      const text = String(out).trim();
      if (!text || text === "None") return [];
      return text.split(/\s+/).filter(Boolean);
    },
    /** GET an object body, or null if it does not exist. */
    getObject(key) {
      const dir = mkdtempSync(join(tmpdir(), "s3ol-"));
      const outPath = join(dir, "obj");
      try {
        cli(["s3api", "get-object", "--bucket", bucket, "--key", key, outPath]);
      } catch (e) {
        const s = (e.awsStderr || e.message || "");
        if (/NoSuchKey|Not Found|404/i.test(s)) return null; // absent ⇒ null
        throw e;
      }
      try { return readFileSync(outPath, "utf8"); }
      finally { try { unlinkSync(outPath); } catch { /* best-effort */ } }
    },
  };
}

/**
 * Build the three seam adapters over a transport + config. Pure WORM semantics;
 * no AWS specifics here. Exposed for the contract test (inject an in-memory
 * transport). Prefixes are per-seam so the chains never collide in one bucket.
 *
 * @param {{ transport: object, prefix?: string, retention: string|Date,
 *           mode?: string, now?: () => Date }} opts
 * @returns {{ audit: object, gateRecord: object, pppTtt: object, retainUntil: () => string }}
 */
export function makeSeamAdapters({ transport, prefix = "heydoc/", retention, mode = "COMPLIANCE", now = () => new Date() }) {
  if (!transport || typeof transport.putObjectOnce !== "function" || typeof transport.listKeys !== "function" || typeof transport.getObject !== "function") {
    throw new Error("s3-object-lock: makeSeamAdapters requires a transport with putObjectOnce/listKeys/getObject");
  }
  // Validate retention NOW (fail-closed at build time), and re-stamp per write so
  // each object is locked for the full period from its own write.
  resolveRetainUntil(retention, now());
  const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const AUDIT = `${base}audit-ledger/`;
  const CONTENT = `${base}content/`;
  const GATE = `${base}gate-records/`;
  const PPP = `${base}ppp-ttt-ledger/`;

  const putLine = (linePrefix, line) => {
    const seq = transport.listKeys(linePrefix).length; // next seq == current count
    transport.putObjectOnce(seqKey(linePrefix, seq), line, { retainUntil: resolveRetainUntil(retention, now()), mode });
  };
  const readLines = (linePrefix) =>
    transport.listKeys(linePrefix).slice().sort().map((k) => transport.getObject(k)).filter((v) => typeof v === "string" && v.trim().length > 0);

  const contentKey = (hex) => `${CONTENT}${hex}.txt`;

  return {
    retainUntil: () => resolveRetainUntil(retention, now()),
    // 4-op medicolegal audit ledger seam.
    audit: {
      appendLedgerLine: (line) => putLine(AUDIT, line),
      readLedgerLines: () => readLines(AUDIT),
      writeContentOnce(hex, text) {
        if (!HEX_RE.test(hex)) throw new Error(`s3-object-lock: writeContentOnce needs a hex content id (got "${hex}")`);
        const key = contentKey(hex);
        // Content-addressed ⇒ idempotent write-once: if it already exists, keep
        // the locked original (identical bytes by construction) rather than
        // attempting a forbidden overwrite.
        if (transport.getObject(key) !== null) return key;
        transport.putObjectOnce(key, text, { retainUntil: resolveRetainUntil(retention, now()), mode });
        return key;
      },
      readContentByHex(hex) {
        if (!HEX_RE.test(hex)) return null;
        return transport.getObject(contentKey(hex));
      },
    },
    // 2-op clinician gate-record seam.
    gateRecord: {
      appendLine: (line) => putLine(GATE, line),
      readLines: () => readLines(GATE),
    },
    // 2-op PPP-TTT triage-ledger seam (the third seam, added this change).
    pppTtt: {
      appendLine: (line) => putLine(PPP, line),
      readLines: () => readLines(PPP),
    },
  };
}

/**
 * Register the `s3-object-lock` WORM adapter on ALL THREE medicolegal seams.
 * Call from the deploy bootstrap BEFORE starting the role, then select it with:
 *   HEYDOC_AUDIT_SUBSTRATE=s3-object-lock
 *   HEYDOC_GATE_RECORD_SUBSTRATE=s3-object-lock
 *   HEYDOC_PPP_TTT_SUBSTRATE=s3-object-lock
 *
 * @param {{ bucket?: string, region?: string, prefix?: string,
 *           retention?: string|Date, mode?: string, name?: string,
 *           transport?: object, now?: () => Date }} opts
 *   bucket    — Object-Lock-enabled S3 bucket (or HEYDOC_S3_OBJECT_LOCK_BUCKET).
 *   region    — AWS region (or HEYDOC_S3_OBJECT_LOCK_REGION).
 *   prefix    — key prefix (or HEYDOC_S3_OBJECT_LOCK_PREFIX; default "heydoc/").
 *   retention — ISO-8601 duration or absolute ISO date (or HEYDOC_AUDIT_RETENTION
 *               / HEYDOC_S3_OBJECT_LOCK_RETAIN_UNTIL). REQUIRED (fail-closed).
 *   mode      — Object Lock mode (default "COMPLIANCE").
 *   name      — substrate name the env vars select (default "s3-object-lock").
 *   transport — test/override injection; when omitted, the AWS CLI transport.
 * @returns {{ registered: string, seams: string[], bucket: string, prefix: string, mode: string, retain_until: string }}
 */
export function registerWormAudit(opts = {}) {
  const bucket = opts.bucket || process.env.HEYDOC_S3_OBJECT_LOCK_BUCKET;
  const region = opts.region || process.env.HEYDOC_S3_OBJECT_LOCK_REGION;
  const prefix = opts.prefix || process.env.HEYDOC_S3_OBJECT_LOCK_PREFIX || "heydoc/";
  const retention = opts.retention || process.env.HEYDOC_S3_OBJECT_LOCK_RETAIN_UNTIL || process.env.HEYDOC_AUDIT_RETENTION;
  const mode = opts.mode || "COMPLIANCE";
  const name = opts.name || "s3-object-lock";
  const now = opts.now || (() => new Date());

  const transport = opts.transport || awsCliTransport({ bucket, region });
  if (!opts.transport && !bucket) {
    // Only the real AWS transport strictly needs a bucket; an injected transport
    // may encapsulate its own target.
    throw new Error("s3-object-lock: a bucket is required (opts.bucket or HEYDOC_S3_OBJECT_LOCK_BUCKET)");
  }

  const adapters = makeSeamAdapters({ transport, prefix, retention, mode, now });
  const retain_until = adapters.retainUntil(); // also validates retention (throws if unset/bad)

  registerAuditSubstrate(name, adapters.audit);
  registerGateRecordSubstrate(name, adapters.gateRecord);
  registerPppTttLedgerSubstrate(name, adapters.pppTtt);

  return {
    registered: name,
    seams: ["audit", "gate-records", "ppp-ttt"],
    bucket: bucket || "(injected transport)",
    prefix: prefix.endsWith("/") ? prefix : `${prefix}/`,
    mode,
    retain_until,
  };
}
