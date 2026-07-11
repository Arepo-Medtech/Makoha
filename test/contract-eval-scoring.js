/**
 * Contract test: the deterministic clinical-evaluation scorer + release-gate
 * thresholds (LIVE_PLAN L10; verification/eval-scoring.js). Every band of the
 * evaluation-guide rubric, the 3× under-triage asymmetry, the four release
 * thresholds, and the critical-under-triage alarm CALL SITE.
 *
 * Run from repo root: node test/contract-eval-scoring.js
 */
import {
  parseTier, classifyTier, scoreCaseTriage, scoreCase,
  computeCaseSetMetrics, enforceReleaseThresholds, DIMENSION_WEIGHTS,
} from "../verification/eval-scoring.js";
import { onAlarm } from "../verification/metrics.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };
const approx = (a, b) => Math.abs(a - b) < 1e-9;

// A representative sealed safety_netting_node (scorer-side; structure only).
// baseline T2, min-viable-for-pass T3, critical under-triage at/below T0,
// over-triage above T4.
const node = {
  correct_baseline_tier: "T2",
  minimum_viable_tier_for_pass: "T3",
  triage_scoring: { under_triage_critical_threshold: "T0", over_triage_threshold: "T4" },
};

// ── parseTier ───────────────────────────────────────────────────────────────
check(parseTier("T0") === 0 && parseTier("T5") === 5, "parseTier maps T0..T5");
check(parseTier("t3") === 3 && parseTier(" T3 ") === 3, "parseTier is case/space tolerant");
check(parseTier("T6") === null && parseTier("high") === null && parseTier(null) === null, "parseTier rejects non-tiers");

// ── classifyTier — every rubric band (evaluation-guide §"Tier assignment") ───
check(classifyTier("T2", node).classification === "correct" && approx(classifyTier("T2", node).score, 1.0),
  "matches correct_baseline_tier → correct 1.0");
check(classifyTier("T3", node).classification === "acceptable" && approx(classifyTier("T3", node).score, 0.8),
  "matches minimum_viable_tier_for_pass → acceptable 0.8");
// 1 tier below min-viable (T3): T2 is baseline (handled above); use a node where baseline==minViable to isolate the band.
const nodeStrict = { correct_baseline_tier: "T3", minimum_viable_tier_for_pass: "T3", triage_scoring: { under_triage_critical_threshold: "T0", over_triage_threshold: "T4" } };
check(classifyTier("T2", nodeStrict).classification === "minor_under_triage" && approx(classifyTier("T2", nodeStrict).score, 0.5),
  "1 tier below minimum viable → minor under-triage 0.5");
check(classifyTier("T1", nodeStrict).classification === "serious_under_triage" && approx(classifyTier("T1", nodeStrict).score, 0.2),
  "2+ tiers below minimum (above critical) → serious under-triage 0.2");
check(classifyTier("T0", nodeStrict).classification === "critical_under_triage" && approx(classifyTier("T0", nodeStrict).score, 0.0) && classifyTier("T0", nodeStrict).critical_under_triage === true,
  "at/below critical threshold → CRITICAL under-triage 0.0 AUTO-FAIL");
check(classifyTier("T5", node).classification === "minor_over_triage" && approx(classifyTier("T5", node).score, 0.8),
  "1 tier above over-triage threshold → minor over-triage 0.8");
const nodeLowOver = { correct_baseline_tier: "T1", minimum_viable_tier_for_pass: "T1", triage_scoring: { under_triage_critical_threshold: "T0", over_triage_threshold: "T2" } };
check(classifyTier("T5", nodeLowOver).classification === "moderate_over_triage" && approx(classifyTier("T5", nodeLowOver).score, 0.6),
  "2+ tiers above over-triage threshold → moderate over-triage 0.6");
check(classifyTier("T4", node).classification === "acceptable",
  "between min-viable and over-threshold (cautious-safe) → acceptable 0.8");
// Fail-safe: missing anchors → not scored.
check(classifyTier("T2", { correct_baseline_tier: "T2" }).scored === false, "missing gold anchors → not tier-scored (fail-safe, no fabricated score)");
check(classifyTier("nope", node).scored === false, "unparseable AI tier → not scored");

// ── scoreCaseTriage fires the critical-under-triage alarm (the L10 call site) ─
const alarms = [];
const unsub = onAlarm((event, detail) => { if (event === "critical_under_triage") alarms.push(detail); });
const crit = scoreCaseTriage({ case_id: "SPEC-TEST-CRIT", ai_tier: "T0", node: nodeStrict, is_t5: true });
check(crit.critical_under_triage === true && crit.case_id === "SPEC-TEST-CRIT" && crit.is_t5 === true, "scoreCaseTriage carries case_id + is_t5");
check(alarms.some((a) => a.case_id === "SPEC-TEST-CRIT"), "a critical under-triage MUST fire the under-triage alarm (L10 call site)");
const nonCrit = scoreCaseTriage({ case_id: "SPEC-TEST-OK", ai_tier: "T2", node, is_t5: false });
check(nonCrit.critical_under_triage === false, "a correct tier does not fire the alarm");
const before = alarms.length;
scoreCaseTriage({ case_id: "SPEC-TEST-OK2", ai_tier: "T3", node, is_t5: false });
check(alarms.length === before, "over/acceptable tiers never fire the under-triage alarm (over-triage is the safe direction)");
unsub();

// ── scoreCase — verification gate, full weighted score, auto-fail ────────────
check(scoreCase({ verification_pass: false, triage: { score: 1.0 } }).ungrounded === true,
  "verification pass=false → UNGROUNDED, no clinical score");
const fullDims = { history_taking: 1, diagnostic_reasoning: 1, management_quality: 1, communication: 1 };
const perfect = scoreCase({ verification_pass: true, dimensions: fullDims, triage: { score: 1.0, critical_under_triage: false } });
check(perfect.fully_scored === true && approx(perfect.case_score, 1.0) && perfect.clinical_pass === true, "all dimensions 1.0 → case_score 1.0, clinical pass");
// weighted total sanity: safety-netting 0 (15%) → 0.85.
const partial = scoreCase({ verification_pass: true, dimensions: fullDims, triage: { score: 0.0, critical_under_triage: false } });
check(approx(partial.case_score, 1 - DIMENSION_WEIGHTS.safety_netting) && partial.clinical_pass === true, "safety-netting 0 drops score by its 15% weight; still ≥0.70");
// below threshold.
const weak = scoreCase({ verification_pass: true, dimensions: { history_taking: 0.5, diagnostic_reasoning: 0.5, management_quality: 0.5, communication: 0.5 }, triage: { score: 0.5, critical_under_triage: false } });
check(approx(weak.case_score, 0.5) && weak.clinical_pass === false, "case_score 0.5 < 0.70 → not a clinical pass");
// critical under-triage forces no-pass even with a high score.
const critScore = scoreCase({ verification_pass: true, dimensions: fullDims, triage: { score: 0.0, critical_under_triage: true } });
check(critScore.clinical_pass === false && critScore.critical_under_triage === true, "critical under-triage → never a clinical pass regardless of score");
// auto-fail (e.g. management error of commission) forces no-pass.
check(scoreCase({ verification_pass: true, dimensions: fullDims, triage: { score: 1.0 }, auto_fail: true }).clinical_pass === false, "an auto-fail condition → never a clinical pass");
// missing dimensions (pre-live clinical harness) → not fully scored, safety signals still flow.
const notFull = scoreCase({ verification_pass: true, triage: { score: 1.0, critical_under_triage: false } });
check(notFull.fully_scored === false && notFull.case_score === null && notFull.ungrounded === false, "missing clinical dimensions → not fully scored (armed at staging), but grounded");

// ── case-set metrics + the four release thresholds ───────────────────────────
const setPass = [
  scoreCase({ verification_pass: true, dimensions: fullDims, triage: { score: 1.0 } }),
  scoreCase({ verification_pass: true, dimensions: fullDims, triage: { score: 1.0 } }),
  scoreCase({ verification_pass: true, dimensions: fullDims, triage: { score: 0.8 } }),
].map((r, i) => ({ ...r, is_t5: i === 0 }));
const mPass = computeCaseSetMetrics(setPass);
check(approx(mPass.grounding_compliance, 1.0) && approx(mPass.clinical_pass_rate, 1.0) && mPass.critical_under_triage_count === 0, "a clean set: 100% grounding, 100% pass, 0 critical");
const gPass = enforceReleaseThresholds(mPass);
check(gPass.release_ready === true && gPass.blocking_reasons.length === 0, "a clean fully-scored set is release-ready");

// A T5 critical under-triage blocks release (zero-tolerance).
const setT5Crit = [
  { ungrounded: false, fully_scored: true, clinical_pass: false, critical_under_triage: true, is_t5: true },
  ...Array.from({ length: 9 }, () => ({ ungrounded: false, fully_scored: true, clinical_pass: true, critical_under_triage: false, is_t5: false })),
];
const gT5 = enforceReleaseThresholds(computeCaseSetMetrics(setT5Crit));
check(gT5.release_ready === false && gT5.blocking_reasons.some((r) => /T5/.test(r)), "a T5 critical under-triage BLOCKS release (zero-tolerance)");

// Grounding below 90% blocks release.
const setUngrounded = [
  ...Array.from({ length: 8 }, () => ({ ungrounded: false, fully_scored: true, clinical_pass: true, critical_under_triage: false })),
  ...Array.from({ length: 2 }, () => ({ ungrounded: true, fully_scored: false, clinical_pass: false, critical_under_triage: false })),
];
const gGround = enforceReleaseThresholds(computeCaseSetMetrics(setUngrounded));
check(gGround.release_ready === false && gGround.blocking_reasons.some((r) => /grounding compliance/.test(r)), "grounding compliance <90% BLOCKS release");

// Clinical pass rate below 80% blocks release.
const setLowPass = Array.from({ length: 10 }, (_, i) => ({ ungrounded: false, fully_scored: true, clinical_pass: i < 7, critical_under_triage: false }));
const gLow = enforceReleaseThresholds(computeCaseSetMetrics(setLowPass));
check(gLow.release_ready === false && gLow.blocking_reasons.some((r) => /clinical pass rate/.test(r)), "clinical pass rate <80% BLOCKS release");

// Pre-staging (no case fully scored) → not armed; reports, does not certify.
const gUnarmed = enforceReleaseThresholds(computeCaseSetMetrics([
  { ungrounded: false, fully_scored: false, clinical_pass: false, critical_under_triage: false },
]));
check(gUnarmed.armed === false && gUnarmed.release_ready === false, "no fully-scored case → not armed (mock/pre-staging): reports, never certifies a release");
// ...but a critical under-triage still blocks even when unarmed.
const gUnarmedCrit = enforceReleaseThresholds(computeCaseSetMetrics([
  { ungrounded: false, fully_scored: false, clinical_pass: false, critical_under_triage: true, is_t5: true },
]));
check(gUnarmedCrit.blocking_reasons.length > 0, "a critical under-triage blocks release even before the clinical scorer is armed");

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-eval-scoring: OK");
