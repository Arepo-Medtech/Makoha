/**
 * Contract test: the PPP-TTT parallel ledger — PHI-free + hash-chain verify +
 * cross-link to the main medicolegal ledger.
 *
 * Proves:
 *  - append → verifyPppTttChain() VALID; tampering with any entry breaks it;
 *  - entries are PHI-free BY CONSTRUCTION (strict schema: an extra free-text
 *    field is refused before it touches the durable log);
 *  - the { run_id, candidate_output_hash } join key resolves to the main
 *    audit-ledger entry for the same run (both chains independently valid);
 *  - the entry's mode comes from the mode-normaliser (mock never presented
 *    as live);
 *  - ledgerCoreFromRecord() derives IDs/enums only from the ABCDE record.
 *
 * Uses HEYDOC_DATA_DIR to isolate the test ledgers in a temp dir (same
 * convention as contract-audit-store.js).
 *
 * Run from repo root: node test/contract-ppp-ttt-ledger.js
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "ppp-ttt-ledger-"));
process.env.HEYDOC_DATA_DIR = tempDir;

const { appendPppTttEntry, readPppTttLedger, verifyPppTttChain, ledgerCoreFromRecord } =
  await import("../verification/ppp-ttt/ledger.js");
const { validatePppTttLedgerEntry, PPP_TTT_LEDGER_KEYS } = await import("../verification/ppp-ttt/ledger-schema.js");
const { gradeConcern, buildAbcdeRecord } = await import("../verification/ppp-ttt/index.js");
const { runPipeline } = await import("../verification/pipeline.js");
const { recordRun, readLedger, verifyChain } = await import("../verification/audit-store.js");

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

try {
  const HASH = "sha256:" + "b".repeat(64);

  // ── Append + chain integrity ──────────────────────────────────────────────
  const e1 = appendPppTttEntry({
    run_id: "run-ledger-0001",
    trunk_id: "9.0",
    candidate_output_hash: HASH,
    tier: "CAUTION",
    fail_closed: false,
    discriminator_ids: ["uhao-1", "pyelonephritis-cs-1", "pyelonephritis-refer-1"],
    caveat_codes: ["provisional_clinician_confirmed", "no_diagnosis", "no_decisions"],
    safety_net_ids: ["sn-pyelonephritis-1"],
    patient_decision: "proceed",
  });
  const e2 = appendPppTttEntry({
    run_id: "run-ledger-0002",
    candidate_output_hash: HASH,
    tier: "STOP",
    fail_closed: true,
    discriminator_ids: [],
    caveat_codes: [],
    safety_net_ids: [],
    patient_decision: "n/a",
  });
  check(e1.seq === 0 && e2.seq === 1 && e2.prev_hash === e1.entry_hash,
    "entries must chain: seq increments and prev_hash links");
  check(e1.mode === "mock", "in the mock dev default, the entry mode must be recorded as mock (normaliseMode)");
  const v1 = verifyPppTttChain();
  check(v1.valid === true && v1.entries === 2, `a freshly written chain must verify (got ${JSON.stringify(v1)})`);

  // Tamper: flip the tier on entry 0 → the chain must break at 0.
  const ledgerFile = join(tempDir, "ppp-ttt-ledger.jsonl");
  const lines = readFileSync(ledgerFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const tampered = { ...lines[0], tier: "GO" };
  writeFileSync(ledgerFile, [JSON.stringify(tampered), JSON.stringify(lines[1])].join("\n") + "\n");
  const v2 = verifyPppTttChain();
  check(v2.valid === false && v2.brokenAt === 0,
    "editing an entry (downgrading a recorded tier) MUST break the hash chain");
  // Restore for the rest of the test.
  writeFileSync(ledgerFile, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  check(verifyPppTttChain().valid === true, "restoring the original bytes must re-validate the chain");

  // ── PHI-free by construction ──────────────────────────────────────────────
  for (const entry of readPppTttLedger()) {
    for (const key of Object.keys(entry)) {
      check(PPP_TTT_LEDGER_KEYS.includes(key), `ledger entry carries non-allow-listed key "${key}"`);
    }
  }
  // A free-text patient field is refused at the schema gate (strict).
  let refused = false;
  try {
    validatePppTttLedgerEntry({ ...e1, patient_narrative: "45yo with flank pain since Tuesday" });
  } catch {
    refused = true;
  }
  check(refused, "a free-text patient field on a ledger entry MUST be refused (PHI-free by construction)");
  let refusedAppend = false;
  try {
    appendPppTttEntry({ run_id: "run-ledger-0003", candidate_output_hash: HASH, tier: "NOT_A_TIER", fail_closed: false, patient_decision: "n/a" });
  } catch {
    refusedAppend = true;
  }
  check(refusedAppend, "a malformed entry must be refused BEFORE touching the durable log");

  // ── ledgerCoreFromRecord: IDs/enums only ──────────────────────────────────
  const PYELO = { source: "trunk_9.0", area_id: "uti", condition: "Pyelonephritis" };
  const answers = {};
  for (let i = 1; i <= 9; i++) answers[`uhao-${i}`] = "absent";
  for (let i = 1; i <= 5; i++) answers[`pyelonephritis-cs-${i}`] = "absent";
  answers["pyelonephritis-refer-1"] = "present";
  const triage = gradeConcern({ flags: [PYELO], patient_answers: answers, abcde_input: { patient_decision: "decline" } });
  const record = buildAbcdeRecord({ run_id: "run-ledger-0004", trunk_id: "9.0", candidate_output_hash: HASH, triage });
  const core = ledgerCoreFromRecord(record);
  check(core.tier === "CAUTION" && core.patient_decision === "decline" && core.discriminator_ids.length === 15,
    "ledgerCoreFromRecord must carry the tier, decision enum, and discriminator IDs");
  check(core.safety_net_ids.every((id) => id.startsWith("sn-")) && core.caveat_codes.includes("no_diagnosis"),
    "ledgerCoreFromRecord must reduce the record to IDs and codes (no narrative)");
  const e4 = appendPppTttEntry(core);
  check(e4.seq === 2, "the derived core must append cleanly");

  // ── Cross-link to the main medicolegal ledger ─────────────────────────────
  const result = await runPipeline({ raised_flags: [PYELO], patient_answers: answers, abcde_input: { patient_decision: "proceed" } });
  check(result.verification.pass === true && result.ppp_ttt.tier === "CAUTION", "fixture run must be a passing CAUTION");
  recordRun(result, { trunkId: "5.0" }); // main ledger (frozen audit-store, read-only use)
  const pppEntry = appendPppTttEntry(ledgerCoreFromRecord(result.abcde_record));
  const mainEntry = readLedger().find((e) => e.run_id === result.run_id);
  check(!!mainEntry, "the main audit ledger must hold the run this triage graded");
  check(mainEntry && mainEntry.candidate_output_hash === pppEntry.candidate_output_hash,
    "the cross-link join key { run_id, candidate_output_hash } must resolve between the two ledgers");
  check(verifyChain().valid === true && verifyPppTttChain().valid === true,
    "BOTH chains must be independently valid after the cross-linked append");
} catch (e) {
  errors.push("unexpected throw: " + (e && e.stack ? e.stack : e));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.HEYDOC_DATA_DIR;
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-ppp-ttt-ledger: OK");
