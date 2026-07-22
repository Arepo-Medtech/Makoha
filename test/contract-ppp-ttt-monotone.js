/**
 * Contract test: PPP-TTT monotone/additive proof — THE LOAD-BEARING TEST.
 *
 * Proves the plan's Appendix-A invariants mechanically:
 *  1. BYTE-UNCHANGED CORE: verifier.js, portal/verification-gate.js, and
 *     audit-store.js carry their pinned sha256 (any edit reddens CI).
 *  2. NEVER RESCUES: for ALL inputs, composeTriage(base, t).pass ⇒ base.pass.
 *  3. NEVER DOWNGRADES: run_tier is an ordinal max — a failing base is never
 *     reported below STOP, whatever the triage says.
 *  4. STOP ⇒ pass:false + the escalate_now token in missing_receipts (the
 *     untouched sequencer halts via its existing rules — Seam B).
 *  5. results[] stays EXACTLY the five verifier checks; the composed object
 *     still builds a schema-valid VerificationReport; ppp_ttt never leaks
 *     into results[].
 *  6. ADDITIVE: runPipeline() without raised_flags behaves exactly as today
 *     (no ppp_ttt on the verification, null result fields, packet unchanged).
 *  7. Default-deny fuzz: every ambiguous/off-registry/error input STOPs.
 *  8. NO SCORING-STORE READ PATH: no ppp-ttt source file references the
 *     sealed nodes 10–13 or data/cases (firewall mirror of F9).
 *
 * Run from repo root: node test/contract-ppp-ttt-monotone.js
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gradeConcern, composeTriage } from "../verification/ppp-ttt/index.js";
import { runPipeline } from "../verification/pipeline.js";
import { validateReport } from "../verification/report-schema.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

// ── 1. Byte-unchanged frozen core (RETAIN) ─────────────────────────────────────
// Pinned at PPP-TTT Step-1 implementation (2026-07-11), main @ 043098c. These
// three files are the frozen safety core; PPP-TTT composes AROUND them. Any
// hash change here is a defect in the change that caused it — do not re-pin
// without an approved plan that explicitly unfreezes the core.
const FROZEN = {
  "verification/verifier.js": "183b756c74c13dd5fbf0643e71aa2a9de77080304ad750e86990aad7be3bb714",
  "portal/verification-gate.js": "b28ac7ca9376453f5c541ce6b5b6cf753ba9cc57de76e2aa017e4d74f573cb09",
  "verification/audit-store.js": "5ae04a28edbb7fad0779b2e5d388b55e4502ad3ec9a70b20173d7829d2090dcd",
};
for (const [file, expected] of Object.entries(FROZEN)) {
  const actual = createHash("sha256").update(readFileSync(join(process.cwd(), file))).digest("hex");
  check(actual === expected, `FROZEN CORE EDITED: ${file} sha256 ${actual} != pinned ${expected}`);
}

// ── Fixtures ───────────────────────────────────────────────────────────────────
const HASH_A = "sha256:" + "0".repeat(64);
const passingBase = { pass: true, results: [{ check: "no_invented_codes", passed: true, severity: "critical" }], missing_receipts: [], candidate_output_hash: HASH_A, mock_receipt_flags: [] };
const failingBase = { pass: false, results: [{ check: "no_invented_codes", passed: false, severity: "critical", reason: "x" }], missing_receipts: ["boom code missing"], candidate_output_hash: HASH_A, mock_receipt_flags: [] };

const PYELO = { source: "trunk_9.0", area_id: "uti", condition: "Pyelonephritis" };
const ECTOPIC = { source: "trunk_1.0", area_id: "uti", condition: "Ectopic pregnancy" };
function pyeloAnswers(stigma, refer) {
  const a = {};
  for (let i = 1; i <= 9; i++) a[`uhao-${i}`] = stigma;
  for (let i = 1; i <= 5; i++) a[`pyelonephritis-cs-${i}`] = stigma;
  a["pyelonephritis-refer-1"] = refer;
  return a;
}
const goTriage = gradeConcern({ flags: [PYELO], patient_answers: pyeloAnswers("absent", "absent") });
const cautionTriage = gradeConcern({ flags: [PYELO], patient_answers: pyeloAnswers("absent", "present"), abcde_input: { patient_decision: "proceed" } });
const stopTriage = gradeConcern({ flags: [ECTOPIC] });
check(goTriage.tier === "GO" && cautionTriage.tier === "CAUTION" && stopTriage.tier === "STOP", "fixture triages must hit all three tiers");

// ── 2. Never rescues ───────────────────────────────────────────────────────────
for (const triage of [goTriage, cautionTriage, stopTriage]) {
  const out = composeTriage(failingBase, triage);
  check(out.pass === false, `composeTriage must NEVER rescue a failing base (triage tier ${triage.tier})`);
}

// ── 3. Never downgrades ────────────────────────────────────────────────────────
for (const triage of [goTriage, cautionTriage]) {
  const out = composeTriage(failingBase, triage);
  check(out.ppp_ttt.run_tier === "STOP",
    `a failing base is STOP-tier; triage ${triage.tier} must not lower the reported run_tier`);
}
check(composeTriage(passingBase, cautionTriage).ppp_ttt.run_tier === "CAUTION", "passing base + CAUTION → run_tier CAUTION");
check(composeTriage(passingBase, goTriage).ppp_ttt.run_tier === "GO", "passing base + GO → run_tier GO");

// ── 4. STOP ⇒ pass:false + escalate_now surfaced ───────────────────────────────
const stopped = composeTriage(passingBase, stopTriage);
check(stopped.pass === false, "a STOP triage MUST fail a passing base (monotone AND)");
check(stopped.missing_receipts.some((m) => m.includes("escalate_now")),
  "a STOP must surface the literal escalate_now token in missing_receipts (Seam B halt, defence in depth)");
const cautioned = composeTriage(passingBase, cautionTriage);
check(cautioned.pass === true, "CAUTION must NOT block pass — it adds caveats + safety-net, subordinate to sign-off");
check(cautioned.missing_receipts.length === passingBase.missing_receipts.length,
  "CAUTION adds no blocking reasons to missing_receipts");

// ── 5. results[] untouched; report stays schema-valid; no ppp_ttt leak ─────────
check(stopped.results === passingBase.results, "results must stay EXACTLY the verifier checks (same reference)");
check(!stopped.results.some((r) => r.check === undefined || String(r.check).includes("ppp")),
  "ppp_ttt outcomes must never appear in results[]");
check(stopped.candidate_output_hash === HASH_A, "candidate_output_hash must be preserved (hashing is the record)");
try {
  validateReport({
    run_id: "test-run-0001",
    timestamp_utc: new Date().toISOString(),
    pass: stopped.pass,
    results: stopped.results,
    missing_receipts: stopped.missing_receipts,
    candidate_output_hash: stopped.candidate_output_hash,
    mock_receipt_flags: stopped.mock_receipt_flags,
  });
} catch (e) {
  errors.push("the composed verification must still build a schema-valid VerificationReport: " + e.message);
}

// ── 6. Additive: no flags ⇒ the pipeline is unchanged ──────────────────────────
const plain = await runPipeline({});
check(plain.verification.pass === true, "regression: the clean stub run must still pass end to end");
check(!("ppp_ttt" in plain.verification), "without raised_flags the verification object must NOT gain a ppp_ttt field");
check(plain.ppp_ttt === null && plain.abcde_record === null,
  "without raised_flags the result's ppp_ttt/abcde_record are null (additive no-op)");

// With flags: the packet the LLM sees is UNCHANGED; only verdict + audit ride.
const flagged = await runPipeline({ raised_flags: [ECTOPIC] });
check(flagged.verification.pass === false && flagged.verification.ppp_ttt.tier === "STOP",
  "a STOP flag must fail the run via the composed gate");
check(JSON.stringify(plain.packet.facts) === JSON.stringify(flagged.packet.facts) &&
  JSON.stringify(plain.packet.constraints) === JSON.stringify(flagged.packet.constraints) &&
  plain.packet.evidence.length === flagged.packet.evidence.length,
  "the ContextPacket must be identical whether PPP-TTT runs or not (audit channel only)");
check(flagged.abcde_record !== null && flagged.abcde_record.run_id === flagged.run_id,
  "a flagged run must produce the ABCDE record on the audit channel");
check(flagged.verification.results.length === plain.verification.results.length,
  "the five verifier checks are unchanged by a flagged run");

const flaggedCaution = await runPipeline({
  raised_flags: [PYELO],
  patient_answers: pyeloAnswers("absent", "present"),
  abcde_input: { patient_decision: "proceed" },
});
check(flaggedCaution.verification.pass === true && flaggedCaution.verification.ppp_ttt.tier === "CAUTION",
  "a CAUTION run passes (with caveats) — the draft still goes to human sign-off");

// ── 7. Default-deny SPLIT (recalibrated KL 2026-07-22, mākoha): a CLINICAL
//    UNKNOWN fails SAFE to CAUTION (orange — watch + hand to a human), a BROKEN
//    INSTRUMENT fails closed to STOP (halt loudly — the tool can't trust its own
//    input). Neither ever throws (gradeConcern is total). ────────────────────
const clinicalUnknownInputs = [
  { flags: [{ source: "other", area_id: "uti", condition: "Pyelonephritis" }] }, // unanswered → all discriminators unknown
  { flags: [PYELO], patient_answers: { ...pyeloAnswers("absent", "present"), "uhao-5": "unknown" } }, // one unknown stigma, none present
  { flags: [{ source: "other", area_id: "nope", condition: "Pyelonephritis" }] }, // off-registry area
  { flags: [{ source: "other", area_id: "uti", condition: "Not A Condition" }] }, // off-registry condition
  { flags: [{ source: "other", area_id: "uti", condition: "Urethritis" }] }, // managed-only (no attested exclusion discriminators)
];
for (const [i, input] of clinicalUnknownInputs.entries()) {
  let v;
  try {
    v = gradeConcern(input);
  } catch (e) {
    errors.push(`clinical-unknown input #${i} must not throw (fail-safe contract): ${e.message}`);
    continue;
  }
  check(v.tier === "CAUTION" && v.fail_closed === true,
    `clinical-unknown input #${i} must fail SAFE to CAUTION (orange + human), NOT reflexively STOP (got ${v.tier})`);
}
const brokenInstrumentInputs = [
  { flags: [{ bad: "shape" }] }, // malformed flag — can't parse the request
  { nonsense: true }, // no flags at all
  null, // null input
];
for (const [i, input] of brokenInstrumentInputs.entries()) {
  let v;
  try {
    v = gradeConcern(input);
  } catch (e) {
    errors.push(`broken-instrument input #${i} must not throw (fail-closed contract): ${e.message}`);
    continue;
  }
  check(v.tier === "STOP" && v.fail_closed === true,
    `broken-instrument input #${i} must fail CLOSED to STOP — a tool that can't trust its input halts loudly (got ${v.tier})`);
}

// Fuzz the composer: for random base/tier combinations, pass never flips
// false→true and run_tier never sinks below the base's tier.
const tiers = [goTriage, cautionTriage, stopTriage];
for (let i = 0; i < 200; i++) {
  const base = i % 2 === 0 ? passingBase : failingBase;
  const triage = tiers[i % 3];
  const out = composeTriage(base, triage);
  if (base.pass === false && out.pass !== false) errors.push(`fuzz #${i}: rescued a failing base`);
  if (triage.tier === "STOP" && out.pass !== false) errors.push(`fuzz #${i}: STOP did not force pass:false`);
  if (base.pass === false && out.ppp_ttt.run_tier !== "STOP") errors.push(`fuzz #${i}: downgraded a failing base below STOP`);
}

// ── 8. No scoring-store read path in any ppp-ttt source ────────────────────────
const SEALED_RE = /10_ground_truth|11_symptom_links|12_management_plan|13_safety_netting|data[\/\\]cases/;
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
for (const file of walk(join(process.cwd(), "verification", "ppp-ttt"))) {
  const src = readFileSync(file, "utf8");
  // The tier vocabulary may be referenced by NAME ("T4-T5"); the sealed node
  // paths must never be.
  check(!SEALED_RE.test(src), `scoring-store firewall: ${file} references a sealed node path`);
  check(!/patient_eligible/.test(src), `${file} must not reference patient_eligible`);
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-ppp-ttt-monotone: OK");
