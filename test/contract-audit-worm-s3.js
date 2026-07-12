/**
 * Contract test: the concrete `s3-object-lock` WORM substrate adapter (LIVE_PLAN
 * L2 / §9 B1, R-39). Proves — with an INJECTED in-memory transport, no real AWS —
 * that:
 *   1. resolveRetainUntil parses ISO-8601 durations + absolute dates, rounds
 *      duration UP (minimum-keep), and REFUSES empty/garbage (fail-closed).
 *   2. WORM semantics hold: putObjectOnce is write-once (overwrite throws),
 *      reads are ordered, the content store is idempotent write-once + round-trips,
 *      and EVERY write carries COMPLIANCE mode + a future RetainUntilDate.
 *   3. registerWormAudit() registers ONE adapter on ALL THREE medicolegal seams,
 *      and the three FROZEN hash-chains (audit ledger, gate records, PPP-TTT
 *      ledger) each verify end-to-end THROUGH the S3 adapter, in DISTINCT prefixes.
 *   4. Fail-closed: registering without retention refuses; and the new PPP-TTT
 *      seam still refuses an unregistered non-local substrate.
 *
 * Uses a throwaway HEYDOC_DATA_DIR (unused by the S3 path, but keeps any local
 * fallback off the real .heydoc-data) and restores all env at the end.
 * Run from repo root: node test/contract-audit-worm-s3.js
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

/** In-memory stand-in for S3 Object Lock: a write-once key/value store that
 *  records the lock metadata it was handed, so the test can assert WORM flags. */
function memTransport() {
  const store = new Map(); // key -> { body, retainUntil, mode }
  return {
    store,
    putObjectOnce(key, body, { retainUntil, mode }) {
      if (store.has(key)) throw new Error(`mem S3: object "${key}" already exists (write-once / Object Lock)`);
      if (!retainUntil || !mode) throw new Error("mem S3: a WORM put must carry retainUntil + mode");
      store.set(key, { body, retainUntil, mode });
    },
    listKeys(prefix) {
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    },
    getObject(key) {
      return store.has(key) ? store.get(key).body : null;
    },
  };
}

const FIXED_NOW = () => new Date("2026-07-12T00:00:00.000Z");

async function run() {
  const savedEnv = {
    data: process.env.HEYDOC_DATA_DIR,
    audit: process.env.HEYDOC_AUDIT_SUBSTRATE,
    gate: process.env.HEYDOC_GATE_RECORD_SUBSTRATE,
    ppp: process.env.HEYDOC_PPP_TTT_SUBSTRATE,
    ret: process.env.HEYDOC_AUDIT_RETENTION,
  };
  process.env.HEYDOC_DATA_DIR = mkdtempSync(join(tmpdir(), "worm-s3-"));

  const { resolveRetainUntil, makeSeamAdapters, registerWormAudit } = await import("../integration/audit-substrates/s3-object-lock.js");

  try {
    // ── 1. resolveRetainUntil ────────────────────────────────────────────────
    const until = resolveRetainUntil("P7Y", FIXED_NOW());
    check(new Date(until).getTime() > FIXED_NOW().getTime(), "P7Y must resolve to a future date");
    check(new Date(until).getUTCFullYear() >= 2033, "P7Y from 2026 must reach at least 2033 (round-up, minimum-keep)");
    check(resolveRetainUntil("2040-01-01T00:00:00Z") === new Date("2040-01-01T00:00:00Z").toISOString(), "absolute ISO date must pass through");
    for (const bad of ["", "   ", "7 years", "P", "banana"]) {
      let threw = false;
      try { resolveRetainUntil(bad, FIXED_NOW()); } catch { threw = true; }
      check(threw, `retention "${bad}" must be refused (fail-closed)`);
    }

    // ── 2. WORM semantics via makeSeamAdapters (unit) ────────────────────────
    let noRet = false;
    try { makeSeamAdapters({ transport: memTransport(), retention: "", now: FIXED_NOW }); } catch { noRet = true; }
    check(noRet, "makeSeamAdapters without retention must refuse (COMPLIANCE Object Lock needs a RetainUntilDate)");

    {
      const t = memTransport();
      const a = makeSeamAdapters({ transport: t, prefix: "unit/", retention: "P7Y", now: FIXED_NOW });
      // ordered append/read on the ppp-ttt seam
      a.pppTtt.appendLine("line-0");
      a.pppTtt.appendLine("line-1");
      a.pppTtt.appendLine("line-2");
      check(JSON.stringify(a.pppTtt.readLines()) === JSON.stringify(["line-0", "line-1", "line-2"]), "reads must be in append order (zero-padded seq)");
      // write-once: the underlying objects cannot be overwritten
      const firstKey = t.listKeys("unit/ppp-ttt-ledger/").sort()[0];
      let overwrote = false;
      try { t.putObjectOnce(firstKey, "TAMPER", { retainUntil: until, mode: "COMPLIANCE" }); } catch { overwrote = true; }
      check(overwrote, "an existing object must be write-once (overwrite throws) — WORM");
      // every stored object carries COMPLIANCE + a future retain date
      for (const [k, meta] of t.store) {
        check(meta.mode === "COMPLIANCE", `object ${k} must be locked in COMPLIANCE mode`);
        check(new Date(meta.retainUntil).getTime() > FIXED_NOW().getTime(), `object ${k} must carry a future RetainUntilDate`);
      }
      // content store: idempotent write-once + round-trip
      const hex = "a".repeat(64);
      const key1 = a.audit.writeContentOnce(hex, "synthetic output text");
      const key2 = a.audit.writeContentOnce(hex, "synthetic output text"); // idempotent, no throw
      check(key1 === key2, "writeContentOnce must be idempotent for the same content id");
      check(a.audit.readContentByHex(hex) === "synthetic output text", "content must round-trip by hex");
      check(a.audit.readContentByHex("z".repeat(64)) === null, "absent content must read as null");
      check(t.listKeys("unit/content/").length === 1, "idempotent content write must not create a second object");
    }

    // ── 3. Three-seam end-to-end through registerWormAudit ───────────────────
    const t = memTransport();
    const reg = registerWormAudit({ transport: t, prefix: "prod/", retention: "P7Y", name: "s3-object-lock", now: FIXED_NOW });
    check(reg.registered === "s3-object-lock", "registerWormAudit must register under the s3-object-lock name");
    check(JSON.stringify(reg.seams) === JSON.stringify(["audit", "gate-records", "ppp-ttt"]), "registerWormAudit must cover all three seams");
    check(reg.mode === "COMPLIANCE" && new Date(reg.retain_until).getTime() > FIXED_NOW().getTime(), "registerWormAudit must report COMPLIANCE + a future retain date");

    process.env.HEYDOC_AUDIT_SUBSTRATE = "s3-object-lock";
    process.env.HEYDOC_GATE_RECORD_SUBSTRATE = "s3-object-lock";
    process.env.HEYDOC_PPP_TTT_SUBSTRATE = "s3-object-lock";

    const HASH = "sha256:" + "b".repeat(64);

    // (a) medicolegal audit ledger
    const { appendEntry, verifyChain, persistContent, readContent, readLedger } = await import("../verification/audit-store.js");
    persistContent(HASH, "synthetic through S3 WORM", { synthetic: true });
    appendEntry({ run_id: "run-worm-0-aaaaaaa", candidate_output_hash: HASH, pass: true, check_results: [{ check: "no_invented_codes", passed: true }], receipts: [], mode: "mock", content_persisted: true });
    appendEntry({ run_id: "run-worm-1-aaaaaaa", candidate_output_hash: HASH, pass: true, check_results: [{ check: "no_invented_codes", passed: true }], receipts: [], mode: "mock", content_persisted: false });
    check(readLedger().length === 2, "audit ledger must have 2 entries through the S3 adapter");
    check(verifyChain().valid, "audit-store verifyChain must be valid through the S3 WORM adapter");
    check(readContent(HASH) === "synthetic through S3 WORM", "audit content store must round-trip through the S3 adapter");

    // (b) PPP-TTT triage ledger
    const { appendPppTttEntry, verifyPppTttChain, readPppTttLedger } = await import("../verification/ppp-ttt/ledger.js");
    appendPppTttEntry({ run_id: "run-ppp-0001", candidate_output_hash: HASH, tier: "CAUTION", fail_closed: false, discriminator_ids: ["uhao-1"], caveat_codes: [], safety_net_ids: [], patient_decision: "proceed" });
    appendPppTttEntry({ run_id: "run-ppp-0002", candidate_output_hash: HASH, tier: "STOP", fail_closed: true, discriminator_ids: [], caveat_codes: [], safety_net_ids: [], patient_decision: "n/a" });
    check(readPppTttLedger().length === 2, "ppp-ttt ledger must have 2 entries through the S3 adapter");
    check(verifyPppTttChain().valid, "verifyPppTttChain must be valid through the S3 WORM adapter");

    // (c) clinician gate records
    const { recordDecisionDurable, verifyGateRecordChain, readGateRecordEntries } = await import("../portal/gate-record-store.js");
    recordDecisionDurable(
      { run_id: "run-gate-0001", candidate_output_hash: HASH, clinician_id: "pharm-KL", decision: "approved", decided_at_utc: FIXED_NOW().toISOString(), signature_ref: "sig:worm-test-1" },
      { bundle_sha256: "sha256:" + "c".repeat(64) }
    );
    check(readGateRecordEntries().length === 1, "gate-record chain must have 1 entry through the S3 adapter");
    check(verifyGateRecordChain().valid, "verifyGateRecordChain must be valid through the S3 WORM adapter");

    // Three chains, three DISTINCT prefixes — no collision in one bucket.
    check(t.listKeys("prod/audit-ledger/").length === 2, "audit chain must live under its own prefix");
    check(t.listKeys("prod/ppp-ttt-ledger/").length === 2, "ppp-ttt chain must live under its own prefix");
    check(t.listKeys("prod/gate-records/").length === 1, "gate-record chain must live under its own prefix");
    check(t.listKeys("prod/content/").length === 1, "audit content must live under its own prefix");
    // Every persisted object is genuinely WORM-locked.
    for (const [k, meta] of t.store) {
      check(meta.mode === "COMPLIANCE" && new Date(meta.retainUntil).getTime() > FIXED_NOW().getTime(), `stored object ${k} must be COMPLIANCE-locked with a future retain date`);
    }

    // ── 4. Fail-closed guards ────────────────────────────────────────────────
    // (a) registerWormAudit without retention refuses.
    delete process.env.HEYDOC_AUDIT_RETENTION;
    let noRetReg = false;
    try { registerWormAudit({ transport: memTransport(), retention: undefined, now: FIXED_NOW }); } catch { noRetReg = true; }
    check(noRetReg, "registerWormAudit without retention must refuse (no unlocked pseudo-WORM writes)");

    // (b) the new PPP-TTT seam refuses an unregistered non-local substrate.
    process.env.HEYDOC_PPP_TTT_SUBSTRATE = "not-registered-xyz";
    let pppRefused = false;
    try { appendPppTttEntry({ run_id: "run-refuse-1", candidate_output_hash: HASH, tier: "STOP", fail_closed: true, discriminator_ids: [], caveat_codes: [], safety_net_ids: [], patient_decision: "n/a" }); } catch { pppRefused = true; }
    check(pppRefused, "an unregistered non-local ppp-ttt substrate must REFUSE (never a non-WORM triage ledger)");
  } finally {
    for (const [k, v] of Object.entries({
      HEYDOC_DATA_DIR: savedEnv.data,
      HEYDOC_AUDIT_SUBSTRATE: savedEnv.audit,
      HEYDOC_GATE_RECORD_SUBSTRATE: savedEnv.gate,
      HEYDOC_PPP_TTT_SUBSTRATE: savedEnv.ppp,
      HEYDOC_AUDIT_RETENTION: savedEnv.ret,
    })) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }

  if (errors.length) {
    console.error("Contract failures:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("contract-audit-worm-s3: OK");
}

run().catch((e) => { console.error(e); process.exit(1); });
