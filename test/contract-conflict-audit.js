/**
 * Contract test: conflict-audit (FLOW_PLAN H6, D-1 owner ruling — first-party
 * clean-room parallel-expert conflict-audit; NO octochains #5 code).
 *
 * Proves the H6 integration discipline mechanically:
 *  1. the audit SURFACES disagreement between independent expert opinions;
 *  2. attachConflictAudit is ADDITIVE — it cannot flip a fail to a pass, cannot
 *     fail a passing output (it is not a gate), and only ever APPENDS to
 *     missing_receipts;
 *  3. a HARD_FAIL / BLOCKED_NO_PROOF can never be overridden — the firewall
 *     fields pass through verbatim;
 *  4. verifier.js's five checks are demonstrably UNCHANGED — same output with
 *     or without conflict-audit in play, exact check names, hash preserved;
 *  5. fail-safe panel semantics — single opinion unassessable, duplicate
 *     expert_id rejected, deterministic audit_id;
 *  6. a composed verification still builds a schema-valid VerificationReport.
 *
 * Run from repo root: node test/contract-conflict-audit.js
 */
import { runConflictAudit, attachConflictAudit, ConflictRecordSchema } from "../verification/conflict-audit.js";
import { verify } from "../verification/verifier.js";
import { runPipeline } from "../verification/pipeline.js";
import { validateReport } from "../verification/report-schema.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const FIVE_CHECKS = [
  "no_invented_codes",
  "no_invented_guidelines",
  "no_invented_operations",
  "no_repo_invention",
  "hard_stop_enforcement",
];

// ── 1. The audit surfaces disagreement (and agreement, and single-source) ──────
const splitPanel = [
  { expert_id: "expert-a", claims: [
    { topic: "imaging indicated", position: "no — no red flags present" },
    { topic: "safety netting", position: "review in 48 hours" },
  ] },
  { expert_id: "expert-b", claims: [
    { topic: "Imaging Indicated", position: "yes — order lumbar MRI now" },
    { topic: "safety netting", position: "Review in 48 hours" },
  ] },
  { expert_id: "expert-c", claims: [
    { topic: "imaging indicated", position: "no — no red flags present" },
    { topic: "escalation", position: "not required" },
  ] },
];
const conflictRec = runConflictAudit(splitPanel, { question_ref: "q-lbp-001" });
check(conflictRec.status === "CONFLICT" && conflictRec.trust_signal === "conflict_flagged",
  "a 2-vs-1 split on a topic must yield status CONFLICT / trust_signal conflict_flagged");
check(conflictRec.conflicts_unresolved === 1,
  "exactly one topic is in conflict (imaging indicated)");
const imaging = conflictRec.topics.find((t) => t.topic === "imaging indicated");
check(imaging && imaging.status === "conflict" && imaging.coverage === 3 && imaging.distinct_positions === 2,
  "the conflicted topic must carry full coverage and both distinct positions (topic normalised across case)");
check(imaging && imaging.positions.length === 3 &&
  imaging.positions.some((p) => p.expert_id === "expert-b" && p.position === "yes — order lumbar MRI now"),
  "positions must be reported VERBATIM per expert — the audit never resolves or synthesises");
const netting = conflictRec.topics.find((t) => t.topic === "safety netting");
check(netting && netting.status === "agree" && netting.distinct_positions === 1,
  "positions differing only by case/whitespace must normalise to agreement (conservative equivalence only)");
const escalation = conflictRec.topics.find((t) => t.topic === "escalation");
check(escalation && escalation.status === "single_source",
  "a topic asserted by one expert only is single_source — surfaced as uncorroborated, not consensus");
check(conflictRec.unanimous === false, "a panel with any conflict/single_source is not unanimous");
check(ConflictRecordSchema.safeParse(conflictRec).success, "the record must satisfy its own .strict() contract");

const consensusPanel = [
  { expert_id: "expert-a", claims: [{ topic: "imaging indicated", position: "no" }] },
  { expert_id: "expert-b", claims: [{ topic: "imaging indicated", position: "No" }] },
];
const consensusRec = runConflictAudit(consensusPanel);
check(consensusRec.status === "CONSENSUS" && consensusRec.trust_signal === "consensus" && consensusRec.unanimous === true,
  "a fully-agreeing full-coverage panel must yield CONSENSUS / unanimous");

// ── 2. Additive — cannot rescue a fail; not a gate on a pass ───────────────────
// A failing base (fabricated code, no receipt) + a unanimous consensus record.
const failingBase = verify("Diagnosis code: SNOMED CT 123456789 applies here.", {});
check(failingBase.pass === false, "fixture sanity: an unbound code must fail the verifier");
const rescued = attachConflictAudit(failingBase, consensusRec);
check(rescued.pass === false,
  "ADDITIVE: a unanimous expert consensus can NEVER flip a failing verification to a pass");

// A passing base + a CONFLICT record: pass unchanged, conflict surfaced.
const cleanOutput = "Based on the provided context (citation: cw-au:imaging-lbp:2024-01), imaging is not recommended. No diagnosis or dosages are given.";
const passingBase = verify(cleanOutput, { citations: ["cw-au:imaging-lbp:2024-01"] });
check(passingBase.pass === true, "fixture sanity: clean grounded output must pass the verifier");
const flagged = attachConflictAudit(passingBase, conflictRec);
check(flagged.pass === true,
  "NOT A GATE: an unresolved conflict flags the output but never fails it — the five checks stay the only gate");
check(flagged.missing_receipts.length === passingBase.missing_receipts.length + 1 &&
  flagged.missing_receipts[flagged.missing_receipts.length - 1].includes("unresolved expert conflict"),
  "an unresolved conflict must be SURFACED via an appended missing_receipts line");
check(passingBase.missing_receipts.every((m, i) => flagged.missing_receipts[i] === m),
  "missing_receipts is APPEND-ONLY — no existing entry removed or reordered");
check(attachConflictAudit(passingBase, consensusRec).missing_receipts.length === passingBase.missing_receipts.length,
  "a consensus record appends nothing — surfacing only on unresolved conflict");
check(flagged.results === passingBase.results &&
  flagged.results.length === 5 &&
  flagged.results.every((r, i) => r.check === FIVE_CHECKS[i]),
  "results[] must be the five verifier checks VERBATIM (same reference, exact names, exact order)");
check(flagged.candidate_output_hash === passingBase.candidate_output_hash,
  "the medicolegal candidate_output_hash must pass through untouched");
check(flagged.conflict_audit && flagged.conflict_audit.audit_id === conflictRec.audit_id,
  "the structured ConflictRecord must ride the in-memory conflict_audit field");

// ── 3. No HARD_FAIL / BLOCKED_NO_PROOF override (pipeline-shaped) ──────────────
// A real Trunk 8.0 run with an S8 intent and no PDMP proof → HARD_FAIL upstream
// of the audit; attaching a unanimous consensus must change NOTHING the
// sequencer's halt rules read.
const hardFailRun = await runPipeline({
  trunk: "8.0",
  pharm_intent: {
    intent_id: "intent-ca-test-1",
    session_ref: "sess-ca-test",
    intent_type: "new_prescription",
    drug_intent: { drug_name: "oxycodone", drug_class: "opioid" },
    clinical_context: { patient_age_years: 40 },
    patient_facts_ref: {},
    mode: "mock",
  },
  resolved_facts: { allergens: [], current_medications: [] },
});
check(["HARD_FAIL", "BLOCKED_NO_PROOF"].includes(hardFailRun.firewall_status) && hardFailRun.continuation_blocked === true,
  "fixture sanity: an S8 intent without PDMP proof must block continuation");
const overridden = {
  ...hardFailRun,
  verification: attachConflictAudit(hardFailRun.verification, consensusRec),
};
check(overridden.firewall_status === hardFailRun.firewall_status,
  "NO OVERRIDE: firewall_status must be untouched by the conflict audit");
check(overridden.continuation_blocked === true,
  "NO OVERRIDE: continuation_blocked must remain true — the sequencer halt input is unchanged");
check(overridden.verification.pass === hardFailRun.verification.pass,
  "NO OVERRIDE: the verification verdict on a blocked run is unchanged by consensus");

// A BLOCKED_NO_PROOF run (firewall trunk, no intent) — same invariants.
const blockedRun = await runPipeline({ trunk: "8.0" });
check(blockedRun.firewall_status === "BLOCKED_NO_PROOF" && blockedRun.continuation_blocked === true,
  "fixture sanity: Trunk 8.0 with no intent is BLOCKED_NO_PROOF");
const blockedAttached = attachConflictAudit(blockedRun.verification, consensusRec);
check(blockedRun.continuation_blocked === true && blockedAttached.pass === blockedRun.verification.pass,
  "NO OVERRIDE: BLOCKED_NO_PROOF stands regardless of expert consensus");

// ── 4. verifier.js demonstrably UNCHANGED ──────────────────────────────────────
// Same vectors through the real verify(): identical output whether or not the
// conflict audit runs; check names pinned; a fail vector still fails.
const vectors = [
  [cleanOutput, { citations: ["cw-au:imaging-lbp:2024-01"] }],
  ["Diagnosis code: SNOMED CT 123456789 applies here.", {}],
  ["Choosing Wisely recommends against imaging here.", {}],
];
for (const [out, ev] of vectors) {
  const before = verify(out, ev);
  runConflictAudit(splitPanel); // exercise the audit between calls
  const after = verify(out, ev);
  check(JSON.stringify(before) === JSON.stringify(after),
    "verify() must be bit-identical with the conflict audit in play: " + out.slice(0, 40));
  check(after.results.length === 5 && after.results.every((r, i) => r.check === FIVE_CHECKS[i]),
    "the five checks must keep their exact names and order");
}

// ── 5. Fail-safe panel semantics ───────────────────────────────────────────────
const solo = runConflictAudit([{ expert_id: "expert-a", claims: [{ topic: "x", position: "y" }] }]);
check(solo.status === "INSUFFICIENT_PANEL" && solo.trust_signal === "unassessable" && solo.unanimous === false,
  "a single opinion is never presented as consensus — INSUFFICIENT_PANEL / unassessable");
check(runConflictAudit([]).status === "INSUFFICIENT_PANEL", "an empty panel is INSUFFICIENT_PANEL");

let dupThrew = false;
try {
  runConflictAudit([
    { expert_id: "expert-a", claims: [{ topic: "x", position: "y" }] },
    { expert_id: "expert-a", claims: [{ topic: "x", position: "z" }] },
  ]);
} catch { dupThrew = true; }
check(dupThrew, "a duplicate expert_id must THROW — a non-independent panel is rejected, never part-audited");

let malformedThrew = false;
try { runConflictAudit([{ expert_id: "a", claims: [{ topic: "", position: "y" }] }, { expert_id: "b", claims: [] }]); }
catch { malformedThrew = true; }
check(malformedThrew, "a malformed claim (empty topic) must fail the zod contract");

// Determinism: same input (any opinion order) → same audit_id and same record
// modulo generated_at_utc.
const recA = runConflictAudit(splitPanel, { question_ref: "q-lbp-001" });
const recB = runConflictAudit([...splitPanel].reverse(), { question_ref: "q-lbp-001" });
check(recA.audit_id === conflictRec.audit_id && recB.audit_id === conflictRec.audit_id,
  "audit_id must be input-derived and order-independent (replay-stable)");
const strip = (r) => JSON.stringify({ ...r, generated_at_utc: null });
check(strip(recA) === strip(recB) && strip(recA) === strip(conflictRec),
  "the record must be deterministic modulo generated_at_utc");

// ── 6. Composed verification still builds a schema-valid report ────────────────
try {
  validateReport({
    run_id: "test-run-conflict-audit-001",
    timestamp_utc: new Date().toISOString(),
    pass: flagged.pass,
    results: flagged.results,
    missing_receipts: flagged.missing_receipts,
    candidate_output_hash: flagged.candidate_output_hash,
    mock_receipt_flags: flagged.mock_receipt_flags,
  });
} catch (e) {
  errors.push("a conflict-flagged verification must still build a schema-valid VerificationReport: " + (e && e.message));
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-conflict-audit: OK");
