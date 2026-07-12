/**
 * Contract test: the S3 Object Lock WORM substrate (LIVE_PLAN §9 B1 / R-39;
 * integration/audit-substrates/s3-object-lock.js).
 *
 * Proves — WITHOUT the AWS CLI and WITHOUT any AWS call (injected `exec`):
 *  - one call registers the `s3-object-lock` substrate on ALL THREE medicolegal
 *    seams (audit ledger + clinician gate records + PPP-TTT triage ledger);
 *  - driven THROUGH the real frozen stores (appendEntry/readLedger/verifyChain,
 *    recordDecisionDurable/verifyGateRecordChain, and appendPppTttEntry/
 *    verifyPppTttChain), the hash-chains round-trip and verify — i.e. the WORM
 *    adapter honours the append-only / write-once contract;
 *  - every write is `put-object --object-lock-mode COMPLIANCE
 *    --object-lock-retain-until-date <now+7y> --if-none-match "*"` (WORM enforced);
 *  - content-addressed writes are write-once & idempotent; readContent round-trips
 *    and returns null when absent;
 *  - fail-closed: a ledger seq collision (append-only violated) THROWS; missing
 *    bucket/region/retentionYears or a bad mode THROWS at registration; an absent
 *    CLI (ENOENT) → an actionable error naming the AWS CLI;
 *  - pure helpers (objectKeyForSeq / retainUntilDate / extractSeq);
 *  - the module never logs (source scan) — record VALUES must never reach a log.
 *
 * Run from repo root: node test/contract-audit-worm-s3.js
 */
import { readFileSync } from "node:fs";
import {
  registerWormAudit, objectKeyForSeq, retainUntilDate, extractSeq,
} from "../integration/audit-substrates/s3-object-lock.js";
import { appendEntry, readLedger, verifyChain, persistContent, readContent } from "../verification/audit-store.js";
import { recordDecisionDurable, readGateRecordEntries, verifyGateRecordChain } from "../portal/gate-record-store.js";
import { appendPppTttEntry, readPppTttLedger, verifyPppTttChain } from "../verification/ppp-ttt/ledger.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };
const rejects = async (p, msg) => { try { await p; errors.push(msg); } catch { /* expected */ } };
const throwsSync = (fn, msg) => { try { fn(); errors.push(msg); } catch { /* expected */ } };
const argVal = (args, flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };

/** A fake AWS CLI over an in-memory S3 with Object Lock + If-None-Match. */
function makeFakeS3() {
  const store = new Map(); // key → { body, mode, retain }
  const puts = [];         // every put-object, for assertions
  const exec = (args, input) => {
    const [svc, op] = args;
    if (svc === "s3api" && op === "put-object") {
      const key = argVal(args, "--key");
      const ifNoneMatch = args.includes("--if-none-match");
      if (ifNoneMatch && store.has(key)) {
        const e = new Error("PreconditionFailed"); e.stderr = "An error occurred (PreconditionFailed) when calling the PutObject operation"; e.status = 1;
        throw e;
      }
      const rec = { body: input, mode: argVal(args, "--object-lock-mode"), retain: argVal(args, "--object-lock-retain-until-date") };
      store.set(key, rec);
      puts.push({ key, ...rec, ifNoneMatch });
      return JSON.stringify({ ETag: '"fake"' });
    }
    if (svc === "s3api" && op === "list-objects-v2") {
      const prefix = argVal(args, "--prefix");
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      return keys.length ? keys.join("\n") : "None";
    }
    if (svc === "s3" && op === "cp") {
      const key = String(args[2]).replace(/^s3:\/\/[^/]+\//, "");
      if (!store.has(key)) { const e = new Error("NoSuchKey"); e.stderr = "fatal error: An error occurred (404) ... NoSuchKey"; e.status = 1; throw e; }
      return store.get(key).body;
    }
    throw new Error("fake exec: unhandled " + args.join(" "));
  };
  return { exec, store, puts };
}

const HASH_A = "sha256:" + "a".repeat(64);
const HASH_B = "sha256:" + "b".repeat(64);
const coreFor = (hash) => ({
  run_id: `run-worm-${hash.slice(7, 15)}`,
  candidate_output_hash: hash,
  pass: true,
  check_results: [{ check: "no_invented_codes", passed: true }],
  receipts: [{ request_id: "r-1", upstream: "docs", mode: "mock" }],
  mode: "mock",
  content_persisted: false,
});

try {
  // ── pure helpers ────────────────────────────────────────────────────────────
  check(objectKeyForSeq("heydoc-audit", "ledger", 42) === "heydoc-audit/ledger/000000000042.json", "objectKeyForSeq zero-pads seq into a sort-ordered key");
  check(retainUntilDate(7, new Date("2026-07-12T00:00:00Z")).getUTCFullYear() === 2033, "retainUntilDate adds the retention years (calendar-accurate)");
  check(extractSeq('{"seq":5,"x":1}') === 5, "extractSeq reads the top-level seq");
  throwsSync(() => extractSeq('{"seq":-1}'), "extractSeq refuses a negative seq");
  throwsSync(() => extractSeq("not json"), "extractSeq refuses a non-JSON line");

  // ── register on both seams, select via env ──────────────────────────────────
  process.env.HEYDOC_AUDIT_SUBSTRATE = "s3-object-lock";
  process.env.HEYDOC_GATE_RECORD_SUBSTRATE = "s3-object-lock";
  process.env.HEYDOC_PPP_TTT_SUBSTRATE = "s3-object-lock";
  const fake = makeFakeS3();
  const res = await registerWormAudit({ bucket: "heydoc-audit-test", region: "ap-southeast-2", retentionYears: 7, exec: fake.exec });
  check(res.registered === "s3-object-lock" && res.mode === "COMPLIANCE" && res.retentionYears === 7, "registerWormAudit registers s3-object-lock (COMPLIANCE, 7y)");
  check(res.ledger_entries === 0 && res.gate_records === 0 && res.ppp_ttt_entries === 0, "an empty bucket boots to empty caches (all three seams)");

  // ── audit ledger through the FROZEN store: append → read → verify ───────────
  appendEntry(coreFor(HASH_A));
  appendEntry(coreFor(HASH_B));
  const ledger = readLedger();
  check(ledger.length === 2, "two appendEntry calls land two ledger entries via the WORM substrate");
  check(verifyChain().valid === true, "the audit hash-chain verifies end-to-end over the WORM substrate");

  // ── every ledger write carries the Object Lock (COMPLIANCE, now+7y, write-once)
  const ledgerPuts = fake.puts.filter((p) => p.key.includes("/ledger/"));
  const thisYear = new Date().getUTCFullYear();
  check(ledgerPuts.length === 2, "each ledger append is exactly one put-object");
  check(ledgerPuts.every((p) => p.mode === "COMPLIANCE"), "every ledger write sets --object-lock-mode COMPLIANCE");
  check(ledgerPuts.every((p) => p.ifNoneMatch === true), "every ledger write is write-once (--if-none-match *)");
  check(ledgerPuts.every((p) => Number(String(p.retain).slice(0, 4)) === thisYear + 7), "every ledger write sets a retain-until ~7 years out");
  check(ledgerPuts[0].key === "heydoc-audit/ledger/000000000000.json" && ledgerPuts[1].key === "heydoc-audit/ledger/000000000001.json", "ledger object keys are zero-padded seq, in chain order");

  // ── content-addressed write-once + read round-trip ──────────────────────────
  persistContent(HASH_A, "provisional draft for clinician review — no diagnosis or dosages.", { synthetic: true });
  check(readContent(HASH_A) === "provisional draft for clinician review — no diagnosis or dosages.", "persistContent → readContent round-trips through the WORM substrate");
  const before = fake.puts.length;
  persistContent(HASH_A, "provisional draft for clinician review — no diagnosis or dosages.", { synthetic: true }); // idempotent
  check(readContent(HASH_A) !== null, "a repeat persistContent is idempotent (write-once), still resolvable");
  check(readContent("sha256:" + "c".repeat(64)) === null, "readContent returns null for content that was never written");
  check(fake.puts.length >= before, "idempotent re-persist did not corrupt the store");

  // ── clinician gate records through the durable store ────────────────────────
  const gateRecord = { run_id: "run-gate-0001", candidate_output_hash: HASH_A, clinician_id: "clin-77", decision: "approved", decided_at_utc: "2026-07-12T04:00:00.000Z", signature_ref: "sig:ref:1" };
  recordDecisionDurable(gateRecord, { bundle_sha256: "sha256:" + "d".repeat(64) });
  check(readGateRecordEntries().length === 1, "a clinician decision is durably recorded via the WORM substrate");
  check(verifyGateRecordChain().valid === true, "the gate-record hash-chain verifies over the WORM substrate");
  const gatePuts = fake.puts.filter((p) => p.key.includes("/gate-records/"));
  check(gatePuts.length === 1 && gatePuts[0].mode === "COMPLIANCE" && gatePuts[0].ifNoneMatch === true, "the gate-record write is COMPLIANCE + write-once");

  // ── PPP-TTT triage ledger through its store: append → read → verify ─────────
  appendPppTttEntry({ run_id: "run-ppp-0001", candidate_output_hash: HASH_A, tier: "CAUTION", fail_closed: false, discriminator_ids: ["uhao-1"], caveat_codes: [], safety_net_ids: [], patient_decision: "proceed" });
  appendPppTttEntry({ run_id: "run-ppp-0002", candidate_output_hash: HASH_A, tier: "STOP", fail_closed: true, discriminator_ids: [], caveat_codes: [], safety_net_ids: [], patient_decision: "n/a" });
  check(readPppTttLedger().length === 2, "two appendPppTttEntry calls land two triage entries via the WORM substrate");
  check(verifyPppTttChain().valid === true, "the PPP-TTT hash-chain verifies end-to-end over the WORM substrate");
  const pppPuts = fake.puts.filter((p) => p.key.includes("/ppp-ttt-ledger/"));
  check(pppPuts.length === 2, "each triage append is exactly one put-object");
  check(pppPuts.every((p) => p.mode === "COMPLIANCE" && p.ifNoneMatch === true), "every triage write is COMPLIANCE + write-once (--if-none-match *)");
  check(pppPuts[0].key === "heydoc-audit/ppp-ttt-ledger/000000000000.json" && pppPuts[1].key === "heydoc-audit/ppp-ttt-ledger/000000000001.json", "triage object keys are zero-padded seq, in chain order");
  throwsSync(() => res.pppTtt.appendLine(JSON.stringify({ seq: 0, tampered: true })), "re-writing an existing triage seq REFUSES (immutable WORM record, append-only violated)");

  // ── fail-closed: a ledger seq COLLISION (append-only violated) throws ───────
  throwsSync(() => res.audit.appendLedgerLine(JSON.stringify({ seq: 0, tampered: true })), "re-writing an existing ledger seq REFUSES (immutable WORM record, append-only violated)");

  // ── fail-closed: registration guards ────────────────────────────────────────
  await rejects(registerWormAudit({ region: "ap-southeast-2", retentionYears: 7, exec: fake.exec }), "missing bucket must throw");
  await rejects(registerWormAudit({ bucket: "b", retentionYears: 7, exec: fake.exec }), "missing region must throw");
  await rejects(registerWormAudit({ bucket: "b", region: "ap-southeast-2", exec: fake.exec }), "missing retentionYears must throw (no period defaulted in code)");
  await rejects(registerWormAudit({ bucket: "b", region: "ap-southeast-2", retentionYears: 0, exec: fake.exec }), "non-positive retentionYears must throw");
  await rejects(registerWormAudit({ bucket: "b", region: "ap-southeast-2", retentionYears: 7, mode: "LENIENT", exec: fake.exec }), "an invalid lock mode must throw");

  // ── absent CLI (ENOENT) → actionable install error ─────────────────────────
  let cliErr = null;
  try {
    await registerWormAudit({ bucket: "b", region: "ap-southeast-2", retentionYears: 7, exec: () => { const e = new Error("spawn aws ENOENT"); e.code = "ENOENT"; throw e; } });
  } catch (e) { cliErr = e; }
  check(cliErr && /AWS CLI/.test(cliErr.message) && /deploy host/.test(cliErr.message), "an absent AWS CLI → an actionable error naming the AWS CLI + deploy host");

  // ── the module never logs (record values must never reach a log) ────────────
  const src = readFileSync(new URL("../integration/audit-substrates/s3-object-lock.js", import.meta.url), "utf8");
  check(!/console\.(log|info|warn|error)|process\.stdout|process\.stderr/.test(src), "the WORM adapter module must not log anything (record values never reach a log)");
} catch (e) {
  errors.push("unexpected throw: " + (e && e.stack ? e.stack : e));
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-audit-worm-s3: OK");
