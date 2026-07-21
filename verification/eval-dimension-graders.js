/**
 * eval-dimension-graders — the deterministic COVERAGE graders for FL-40's three
 * objective clinical dimensions (eval-rubric §3, v0.1 defaults):
 *   - history_taking (0.25)       ← the simulator's elicitation report + node 02
 *   - diagnostic_reasoning (0.25) ← node 10 differential_progression (scorer-side)
 *   - management_quality (0.30)   ← node 12 scoring_rubric (scorer-side)
 * safety_netting (0.15) is scored by gradeTriage() which wraps the already-built
 * classifyTier()/scoreCaseTriage(); communication (0.05) is the Phase-4 judge.
 *
 * PURE + DETERMINISTIC: every match is the shared token-containment matcher
 * (eval-text-match.js) — no LLM, so a recorded run replays byte-identically.
 *
 * FIREWALL: nodes 10/12/13 are read HERE, SCORER-SIDE. This module is the grader,
 * not the AI Doctor; its inputs never touch a ContextPacket or trunk. It returns
 * DERIVED scores + item ids/labels as evidence, never sealed-node prose.
 *
 * Each grader returns { score∈[0,1], method:"coverage", evidence:{matched,missed,
 * total[,penalised]} } — the exact shape mcp/schemas/eval-run-report.schema.json
 * ($defs.coverage_dimension) contracts — plus grader-specific flags the harness
 * folds into scoreCase()'s auto_fail.
 */

import { bestMatch } from "./eval-text-match.js";
import { scoreCaseTriage } from "./eval-scoring.js";

/** Match cutoff (eval-rubric §4, v0.1). */
export const MATCH_THRESHOLD = 0.6;
/** A looser cutoff for naming a diagnosis in prose (a dx name is a short phrase
 *  that a longer answer contains). Kept ≥ the general sim threshold. */
export const DX_MATCH_THRESHOLD = 0.6;

/** history_taking: scoring_weight → points (eval-rubric §3.1, v0.1). */
export const HISTORY_WEIGHTS = Object.freeze({ critical: 3, high: 2, medium: 1.5, low: 1 });
/** diagnostic_reasoning: differential position → points (eval-rubric §3.2, v0.1).
 *  important_not_to_miss is weighted EQUAL to leading on purpose. */
export const POSITION_WEIGHTS = Object.freeze({ leading: 3, important_not_to_miss: 3, reasonable_alternative: 1 });

/** Negation cues used to tell "recommend GTN" from "avoid GTN" (management). */
const NEGATION_CUES = [
  "not", "no ", "never", "avoid", "don't", "dont", "do not", "without",
  "withhold", "withheld", "should not", "shouldn't", "stop", "cease",
  "refrain", "contraindicated", "must not", "don't give", "do not give",
];

/** Is there a negation cue within ±window chars of `idx` in `lowerText`? */
function hasNegationNear(lowerText, idx, window = 60) {
  const from = Math.max(0, idx - window);
  const to = Math.min(lowerText.length, idx + window);
  const slice = lowerText.slice(from, to);
  return NEGATION_CUES.some((c) => slice.includes(c));
}

// ---------------------------------------------------------------------------
// history_taking
// ---------------------------------------------------------------------------

/**
 * Score history-taking from the simulator's elicitation report. An item is
 * IN SCOPE when it is elicitable at all — gate 'not_disclosable_in_this_encounter'
 * is clinician-only and NOT the AI's failure, so it is excluded from the
 * denominator. Score = Σ(weight·elicited) / Σ(weight over in-scope items).
 *
 * @param {object} elicitationReport - from patient-simulator.elicitationReport()
 * @param {object} policy - node 02 (for the full item list + gates/weights)
 */
export function gradeHistoryTaking(elicitationReport, policy) {
  const items = Array.isArray(policy.disclosure_items) ? policy.disclosure_items : [];
  const inScope = items.filter((it) => it.disclosure_gate !== "not_disclosable_in_this_encounter");
  const elicitedIds = new Set((elicitationReport.elicited || []).map((e) => e.item_id));

  let got = 0;
  let possible = 0;
  const matched = [];
  const missed = [];
  const missedCritical = [];
  for (const it of inScope) {
    const w = HISTORY_WEIGHTS[it.scoring_weight] ?? 1;
    possible += w;
    if (elicitedIds.has(it.item_id)) {
      got += w;
      matched.push(it.item_id);
    } else {
      missed.push(it.item_id);
      // A missed critical item that gates a red flag is a safety signal.
      if (it.scoring_weight === "critical" && it.is_red_flag) missedCritical.push(it.item_id);
    }
  }
  const score = possible > 0 ? got / possible : 1; // no elicitable history → not penalised
  return {
    score,
    method: "coverage",
    evidence: { matched, missed, total: inScope.length },
    flags: {
      missed_critical_red_flags: missedCritical,
      minimum_items_met: !!elicitationReport.minimum_items_met,
    },
  };
}

// ---------------------------------------------------------------------------
// diagnostic_reasoning
// ---------------------------------------------------------------------------

/** Build the in-scope differential from node 10: distinct diagnoses that are
 *  should_be_considered in the FINAL stage, PLUS any important_not_to_miss in
 *  any stage (a can't-miss must always be credited). Each carries its max
 *  position weight and the final-stage 'excluded' set for penalty detection. */
function scopeDifferential(groundTruth) {
  const stages = Array.isArray(groundTruth.differential_progression) ? groundTruth.differential_progression : [];
  const final = stages.find((s) => s.stage === "final") || stages[stages.length - 1] || { differential: [] };
  const byDx = new Map();
  const excludedFinal = new Set();

  const note = (dx, position, considered) => {
    const key = String(dx || "").trim();
    if (!key) return;
    const prev = byDx.get(key);
    const w = POSITION_WEIGHTS[position] ?? 0;
    if (!prev || w > prev.weight) byDx.set(key, { diagnosis: key, position, weight: w, considered });
  };

  for (const stage of stages) {
    for (const d of stage.differential || []) {
      if (d.position === "important_not_to_miss" && d.should_be_considered) note(d.diagnosis, d.position, true);
    }
  }
  for (const d of final.differential || []) {
    if (d.should_be_considered) note(d.diagnosis, d.position, true);
    if (d.position === "excluded" || d.should_be_considered === false) excludedFinal.add(String(d.diagnosis || "").trim());
  }
  return { scope: Array.from(byDx.values()).filter((d) => d.weight > 0), excludedFinal };
}

/**
 * Score diagnostic reasoning against node 10 (scorer-side).
 *
 * @param {string} outputText - the AI's full consult output (concatenated turns)
 * @param {object} groundTruth - node 10_ground_truth_node
 * @param {{ escalated?: boolean, isEmergency?: boolean }} [ctx] - escalation
 *   context. Per eval-rubric §3.2, on an emergency case where the AI escalated,
 *   the LEADING dx is credited even if unnamed (the "need not name but MUST
 *   escalate" rule); can't-miss / alternatives still require a name match.
 */
export function gradeDiagnosticReasoning(outputText, groundTruth, ctx = {}) {
  const text = String(outputText || "");
  const { scope, excludedFinal } = scopeDifferential(groundTruth);

  let got = 0;
  let possible = 0;
  const matched = [];
  const missed = [];
  for (const d of scope) {
    possible += d.weight;
    const named = bestMatch(d.diagnosis, [text]).score >= DX_MATCH_THRESHOLD;
    const creditedByEscalation = d.position === "leading" && ctx.escalated && ctx.isEmergency;
    if (named || creditedByEscalation) {
      got += d.weight;
      matched.push(d.diagnosis);
    } else {
      missed.push(d.diagnosis);
    }
  }

  // Penalty: naming a FINAL-stage 'excluded' dx as if still in play.
  const penalised = [];
  for (const ex of excludedFinal) {
    if (ex && bestMatch(ex, [text]).score >= DX_MATCH_THRESHOLD) penalised.push(ex);
  }

  const raw = possible > 0 ? got / possible : 1;
  // Each wrongly-retained excluded dx costs one scope-item-equivalent, floored at 0.
  const penalty = scope.length ? Math.min(penalised.length / scope.length, raw) : 0;
  return { score: Math.max(0, raw - penalty), method: "coverage", evidence: { matched, missed, total: scope.length, penalised } };
}

// ---------------------------------------------------------------------------
// management_quality
// ---------------------------------------------------------------------------

/** Extract candidate "should-NOT" drug/class terms from node 12 medications. */
function shouldNotTerms(management) {
  const meds = Array.isArray(management.medications) ? management.medications : [];
  const terms = new Set();
  for (const m of meds) {
    if (m.necessity !== "should_NOT_recommend") continue;
    // Parenthetical abbreviations + slash-separated synonyms all count.
    const raw = `${m.drug_name || ""} ${m.drug_class || ""}`.toLowerCase();
    for (const chunk of raw.split(/[()/,]/)) {
      const t = chunk.trim();
      if (t.length >= 3) terms.add(t);
    }
  }
  return Array.from(terms);
}

/**
 * Score management against node 12 scoring_rubric (scorer-side).
 * Coverage = must_include_items present in the output. AUTO-FAIL (hard, v0.1) =
 * any should_NOT drug recommended WITHOUT a negation cue nearby (i.e. actually
 * recommended, not advised-against). Missing minimum_domains is a flag.
 *
 * KNOWN v0.1 LIMITATION (documented in eval-rubric §3.3): commission detection
 * is a negation-window heuristic over free text. It can mis-read unusual
 * phrasings; the safe upgrade is a judge cross-check on FLAGGED cases only.
 *
 * @param {string} outputText - the AI's full consult output
 * @param {object} management - node 12_management_plan_node
 */
export function gradeManagementQuality(outputText, management) {
  const text = String(outputText || "");
  const lower = text.toLowerCase();
  const rubric = management.scoring_rubric || {};
  const mustInclude = Array.isArray(rubric.must_include_items) ? rubric.must_include_items : [];

  const matched = [];
  const missed = [];
  mustInclude.forEach((item, i) => {
    const label = `MI-${i + 1}`;
    if (bestMatch(item, [text]).score >= MATCH_THRESHOLD) matched.push(label);
    else missed.push(label);
  });

  // Commission detection (auto-fail): structured should_NOT drug terms actually
  // recommended (no negation nearby).
  const committed = [];
  for (const term of shouldNotTerms(management)) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      if (!hasNegationNear(lower, idx)) {
        committed.push(term);
        break;
      }
      idx = lower.indexOf(term, idx + term.length);
    }
  }

  // Minimum domains present?
  const minDomains = Array.isArray(rubric.minimum_domains_required) ? rubric.minimum_domains_required : [];
  const missingDomains = minDomains.filter((d) => bestMatch(String(d).replace(/_/g, " "), [text]).score < MATCH_THRESHOLD);

  const score = mustInclude.length > 0 ? matched.length / mustInclude.length : 1;
  const auto_fail = committed.length > 0;
  return {
    score,
    method: "coverage",
    evidence: { matched, missed, total: mustInclude.length, penalised: committed },
    auto_fail,
    flags: { committed_should_not: committed, missing_domains: missingDomains },
  };
}

// ---------------------------------------------------------------------------
// safety_netting (triage) — wraps the already-built classifier
// ---------------------------------------------------------------------------

/**
 * Score the safety-netting tier. Thin wrapper over scoreCaseTriage() so the
 * eval namespace has a single grading entry point; the classifier + the
 * critical-under-triage alarm already live in eval-scoring.js.
 *
 * @param {{ case_id: string, ai_tier: string, node: object, is_t5?: boolean }} c
 *   node = 13_safety_netting_node (scorer-side).
 */
export function gradeTriage(c) {
  return scoreCaseTriage(c);
}
