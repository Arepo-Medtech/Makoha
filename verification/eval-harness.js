/**
 * eval-harness — the FL-40 orchestrator. It ties Phases 1–4 together: for each
 * attested case it drives a MULTI-TURN consult through the real grounding
 * pipeline (with a replayable generator), grades the transcript against the
 * sealed scoring nodes SCORER-SIDE, and aggregates into a schema-valid
 * EvalRunReport per generation backend.
 *
 * DATA FLOW (per case, per backend):
 *   1. Seed the packet with node 01's demographics + opening_complaint ONLY
 *      (firewall allow-listed). The rest of the history is NOT front-loaded —
 *      it is elicited through the conversation, so history-taking is meaningful.
 *   2. Turn loop: the patient simulator (nodes 01/02) speaks; each AI turn runs
 *      runTrunkWithGrounding with the growing `conversation` in the packet (the
 *      FL-40 packet field) and a generator wrapped in the replay layer. The AI's
 *      questions drive the simulator's disclosure gates.
 *   3. Grade: history_taking from the simulator's elicitation report;
 *      diagnostic/management from the concatenated assistant transcript vs nodes
 *      10/12; triage from node 13; communication from the judge (node-free).
 *   4. scoreCase → computeCaseSetMetrics → enforceReleaseThresholds.
 *
 * FIREWALL: sealed nodes 10–13 are read here SCORER-SIDE only and passed ONLY to
 * the graders. They never enter case_content, the conversation, or the packet —
 * the pipeline's contextAllowList throws if they ever did (defence in depth).
 *
 * REPLAY DETERMINISM: the replay key is a STABLE projection of the packet
 * (volatile run_id / timestamps / receipt ids stripped) + backend + trunk, so a
 * run recorded once replays byte-identically even though run_ids differ per run.
 *
 * V1 TURN POLICY (documented, flagged for review): each AI turn is generated via
 * one trunk from `turnPlan` (default: triage → history×N → assessment); the
 * dimension graders read the CONCATENATED assistant transcript, since diagnostic
 * reasoning / management / communication are spread across a real consult rather
 * than owned by a single trunk. The exact clinical turn choreography is a v1
 * parameter — the orchestration, firewall, scoring, and report are the contract.
 */
import { runTrunkWithGrounding } from "../integration/trunk-pipeline.js";
import { makeSelectedGenerator } from "../integration/generation-backend.js";
import { detectEscalation } from "../integration/trunk-sequencer.js";
import { sha256Prefixed } from "./hash.js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPatientSimulator } from "./patient-simulator.js";
import { gradeCommunication, judgeManagementItems } from "./eval-judge.js";
import { interrogateIntakeConcern } from "./ppp-ttt/intake-concern.js";
import { scoreCase, computeCaseSetMetrics, enforceReleaseThresholds, careClass } from "./eval-scoring.js";
import {
  gradeHistoryTaking,
  gradeDiagnosticReasoning,
  gradeManagementQuality,
  gradeTriage,
} from "./eval-dimension-graders.js";
import { selectLongListCases, runPositionalForCase, aggregatePositional, positionalGate } from "./eval-positional.js";

/** Default per-turn trunk plan (v1). Triage first (produces a safety tier),
 *  history-enrichment turns to elicit, an assessment turn last. */
export const DEFAULT_TURN_PLAN = ["1.0", "3.0", "3.0", "9.0"];

/** Deterministic JSON (sorted keys) — same discipline as the llm-adapter. */
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

const TRUNK_PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "trunk", "prompts");
const _promptFingerprints = new Map();

/**
 * A stable fingerprint of a trunk's system prompt. Included in the replay key so
 * an EDIT to the prompt invalidates that trunk's generation cache and forces
 * regeneration — the fix for the silent stale-replay footgun (before this,
 * replayKey ignored the prompt entirely, so a reworked prompt REPLAYED old
 * outputs and a re-run finished in ~2s having tested nothing). Memoised per trunk
 * (the file does not change mid-run); an absent prompt → "none" so scripted-factory
 * tests and prompt-less trunks stay stable. sha256 of the exact prompt bytes: any
 * change (even whitespace) regenerates — the conservative, correct direction.
 */
export function trunkPromptFingerprint(trunkId) {
  if (_promptFingerprints.has(trunkId)) return _promptFingerprints.get(trunkId);
  let fp = "none";
  try {
    const p = join(TRUNK_PROMPTS_DIR, `trunk-${trunkId}-system.md`);
    if (existsSync(p)) fp = sha256Prefixed(readFileSync(p, "utf8"));
  } catch {
    fp = "none";
  }
  _promptFingerprints.set(trunkId, fp);
  return fp;
}

/** Project a packet to the STABLE inputs the model actually depends on, so the
 *  replay key survives across runs (run_id / timestamps / receipt ids differ
 *  every run and must not enter the key) — PLUS the trunk-prompt fingerprint, so a
 *  prompt change correctly busts the cache. PURE: the fingerprint is passed in so
 *  the keying is unit-testable without touching the filesystem. */
export function replayKey(packet, backendName, trunkId, promptFingerprint) {
  const stable = {
    facts: packet.facts,
    evidence: (packet.evidence || []).map((e) => ({ claim: e.claim, supports: e.supports })),
    constraints: packet.constraints,
    receipts: (packet.receipts || []).map((r) => ({ upstream: r.upstream, mode: r.mode })),
    conversation: packet.conversation || [],
    trunk_id: trunkId,
    mode: packet.mode,
    backend: backendName,
    // The prompt the model is actually run under — a prompt edit must regenerate.
    trunk_prompt: promptFingerprint,
  };
  return sha256Prefixed(canonical(stable));
}

/** Wrap a backend generator in the replay layer, keyed by the stable packet +
 *  the trunk-prompt fingerprint. */
function makeReplayGenerator({ trunkId, backendName, replayer, generatorFactory }) {
  const live = generatorFactory(trunkId, backendName);
  const fingerprint = trunkPromptFingerprint(trunkId);
  return async (packet) => {
    const key = replayKey(packet, backendName, trunkId, fingerprint);
    return replayer.call(key, () => live(packet));
  };
}

/** A T5 emergency is expressed by the trunk contract as the STRUCTURED
 *  `escalate_now` disposition value (Trunk 9.0 `risk_outcome`, or the
 *  `safety_gate.status` gate on Trunks 1.0/3.0) — NOT as patient-facing prose
 *  like "call an ambulance", which the trunks (structured-draft producers) rarely
 *  emit. The eval scorer previously scanned only for that prose and so missed
 *  virtually every real escalation, defaulting them to T0 and manufacturing a
 *  corpus-wide critical-under-triage storm (FL-40 canary, 2026-07-21).
 *
 *  This is FIELD-SCOPED on purpose. It mirrors the sequencer's own `T5_FIELD_RE`
 *  and matches `escalate_now` ONLY as a disposition field's VALUE. It must not
 *  match a prose *mention* of the token — a rationale saying rest pain "would
 *  raise this toward escalate_now", or the `rationale_for_not_escalate_now`
 *  field — because those are NOT the AI's assigned disposition. (Empirically,
 *  matching the bare token would have mis-flagged 36/174 recorded outputs whose
 *  real disposition was `clear` / `blocked_incomplete` / `urgent_review` as
 *  false T5 emergencies.) The trailing `\b` tolerates a value that carries an
 *  appended note, e.g. "escalate_now — <reason>".
 *
 *  `escalate_now` ≡ T5 per docs/grounding/trunk-constraints.md (Trunk 9.0).
 *  NOTE: `urgent_review` / `routine_follow_up` are deliberately NOT mapped to a
 *  T-tier here — that binding (Trunk 9.0's 4-value taxonomy → the T0–T5 scoring
 *  taxonomy) is an open MISSING_CONTRACT awaiting clinician sign-off, so those
 *  dispositions fall through to the prose cues / conservative T0 default rather
 *  than being guessed. See the completeness register. */
const ESCALATE_NOW_FIELD_RE =
  /"(?:risk_outcome|status|safety_gate_status|escalation_signal|disposition)"\s*:\s*"\s*escalate_now\b/i;

// The rest of the Trunk 9.0 disposition taxonomy, field-scoped the same way and
// mapped to T-tiers per the operator ruling (2026-07-21, clinician KL):
//   urgent_review ≡ T3 (urgent same-day in-person review)
//   routine_follow_up ≡ T2 (routine GP appointment)
//   blocked_incomplete ≡ INCOMPLETE — NOT a tier; the consult reached no
//     disposition on the facts available. Scored INCOMPLETE and excluded from
//     under-triage (see classifyTier) rather than floored to T0, because
//     "need more info" is not "stay home".
const URGENT_REVIEW_FIELD_RE = /"(?:risk_outcome|status|disposition)"\s*:\s*"\s*urgent_review\b/i;
const ROUTINE_FOLLOWUP_FIELD_RE = /"(?:risk_outcome|status|disposition)"\s*:\s*"\s*routine_follow_up\b/i;
const BLOCKED_INCOMPLETE_FIELD_RE = /"(?:risk_outcome|status|safety_gate_status|disposition)"\s*:\s*"\s*blocked_incomplete\b/i;

/** Safety-tier cues, most-urgent first. Conservative: on no explicit T-token we
 *  infer from disposition language; a consult that gives NO disposition defaults
 *  to T0 (least urgent) — the under-triage-penalising direction for a safety
 *  eval. Records what matched for audit. */
const TIER_CUES = [
  { tier: "T5", re: /\bT5\b|\b000\b|triple\s*zero|emergency ambulance|call an ambulance/i },
  { tier: "T4", re: /\bT4\b|emergency department|\bED\b|\bA&E\b|go to hospital now/i },
  { tier: "T3", re: /\bT3\b|urgent care|same[-\s]?day|see (a|your) (doctor|gp) today|call your gp now/i },
  { tier: "T2", re: /\bT2\b|book (an )?appointment|see your gp|within (a few days|48 hours)/i },
  { tier: "T1", re: /\bT1\b|self[-\s]?care|manage at home|over[-\s]the[-\s]counter|rest and fluids/i },
  { tier: "T0", re: /\bT0\b/i },
];
export function extractAiTier(transcript) {
  const t = String(transcript || "");
  // Most-urgent-first across BOTH the structured disposition fields and the
  // prose cues, so the highest acuity anywhere in the consult wins (same
  // over-halting discipline as the sequencer). Structured disposition is the
  // AI's authoritative call; the prose cue is the fallback for free-text turns.
  if (ESCALATE_NOW_FIELD_RE.test(t) || TIER_CUES[0].re.test(t)) return { ai_tier: "T5", matched: "escalate_now / T5" };
  if (TIER_CUES[1].re.test(t)) return { ai_tier: "T4", matched: TIER_CUES[1].re.source };
  if (URGENT_REVIEW_FIELD_RE.test(t) || TIER_CUES[2].re.test(t)) return { ai_tier: "T3", matched: "urgent_review / T3" };
  if (ROUTINE_FOLLOWUP_FIELD_RE.test(t) || TIER_CUES[3].re.test(t)) return { ai_tier: "T2", matched: "routine_follow_up / T2" };
  if (TIER_CUES[4].re.test(t)) return { ai_tier: "T1", matched: TIER_CUES[4].re.source };
  // blocked_incomplete is a NON-disposition — only reached here (below every
  // positive tier) so a consult that DID reach a disposition is never masked by
  // an earlier blocked turn. It is INCOMPLETE, never T0.
  if (BLOCKED_INCOMPLETE_FIELD_RE.test(t)) {
    return { ai_tier: "INCOMPLETE", incomplete: true, matched: "blocked_incomplete — consult reached no disposition (excluded from under-triage)" };
  }
  if (TIER_CUES[5].re.test(t)) return { ai_tier: "T0", matched: TIER_CUES[5].re.source };
  return { ai_tier: "T0", matched: "(no disposition cue — defaulted to T0, conservative under-triage)" };
}

/** Best-effort parse of a trunk turn's `safety_gate` object from its (JSON-ish)
 *  output text. Returns null when there is no parseable safety_gate — the caller
 *  then treats the turn as a non-intake turn (extractAiTier prose/field path). */
function parseTrunkSafetyGate(aiText) {
  const t = String(aiText || "");
  const candidates = [];
  const fenced = t.replace(/```(?:json)?/gi, "");
  candidates.push(fenced);
  const blob = fenced.match(/\{[\s\S]*\}/);
  if (blob) candidates.push(blob[0]);
  for (const c of candidates) {
    try {
      const j = JSON.parse(c.trim());
      if (j && typeof j === "object" && j.safety_gate && typeof j.safety_gate === "object") return j.safety_gate;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/**
 * The EFFECTIVE disposition tier for one turn, AFTER intake-escalation
 * interrogation (Phase C). An intake `safety_gate.status === escalate_now` is
 * submitted to PPP-TTT: a demonstrably-present danger sign (or an un-interrogable
 * escalation) STANDS as T5; an escalate_now with no present danger sign is
 * downgraded to `urgent_review` (T3 — look closer, not 000). Every other turn
 * falls through to the unchanged text-based extractAiTier.
 *
 * REPLAY-SAFE: pre-contract fixtures carry no `danger_signs`, so their
 * escalate_now classifies as `broken` → honoured → T5 — identical to prior
 * behaviour. Downgrades (and the consult-flow change they cause) arise only under
 * the new Trunk 1.0 prompt, i.e. on a fresh live run.
 */
export function interrogatedTier(aiText) {
  const sg = parseTrunkSafetyGate(aiText);
  if (sg && sg.status === "escalate_now") {
    const res = interrogateIntakeConcern(sg);
    if (res && res.disposition === "urgent_review") {
      return { ai_tier: "T3", matched: "intake escalate_now interrogated (no present danger sign) → CAUTION → urgent_review (T3)" };
    }
    // grounded / broken → the escalation stands; fall through (extractAiTier → T5).
  }
  return extractAiTier(aiText);
}

/** Most-urgent tier across per-turn effective dispositions (mirrors
 *  extractAiTier's precedence: T5>T4>T3>T2>T1>INCOMPLETE>T0). Used to finalise
 *  the case tier from interrogation-aware per-turn results. */
export function mostUrgentTier(tiers) {
  const order = ["T5", "T4", "T3", "T2", "T1", "INCOMPLETE", "T0"];
  for (const level of order) if (tiers.includes(level)) return level;
  return "T0";
}

/** Project a grader result to the eval-run-report coverage_dimension shape
 *  (score/method/evidence only — grader flags stay internal). */
const coverageDim = (g) => ({
  score: g.score,
  method: "coverage",
  evidence: g.evidence,
  // management_quality may carry a judge cross-check receipt (rubric v1.3).
  ...(g.judge_receipt ? { judge_receipt: g.judge_receipt } : {}),
});

/**
 * Apply the management-coverage judge cross-check (rubric v1.3) to a PURE
 * gradeManagementQuality result. The judge can only ADD matches the deterministic
 * containment matcher missed for paraphrase/example reasons — it never removes a
 * match and never touches auto_fail/commission (that stays deterministic). Score
 * is recomputed as matched/total. Returns the result unchanged when there is
 * nothing to rescue or no judge verdict is available (resume-safe).
 */
async function applyManagementJudge(managementG, management, transcript, judge, nowIso) {
  const missedLabels = (managementG.evidence && managementG.evidence.missed) || [];
  if (!missedLabels.length || !judge || !judge.replayer) return managementG;
  const mustInclude = (management.scoring_rubric && management.scoring_rubric.must_include_items) || [];
  const missedItems = missedLabels
    .map((label) => ({ label, text: mustInclude[Number(String(label).replace("MI-", "")) - 1] || "" }))
    .filter((it) => it.text);
  if (!missedItems.length) return managementG;

  const { matchedLabels, judge_receipt } = await judgeManagementItems({
    outputText: transcript,
    missedItems,
    replayer: judge.replayer,
    transport: judge.transport,
    nowIso,
  });
  if (!matchedLabels.length) {
    // Judge ran and rescued nothing (or was skipped): keep the receipt if we got
    // one, for the audit trail, but the score is unchanged.
    return judge_receipt ? { ...managementG, judge_receipt } : managementG;
  }
  const rescued = new Set(matchedLabels);
  const matched = [...((managementG.evidence && managementG.evidence.matched) || []), ...matchedLabels];
  const missed = missedLabels.filter((l) => !rescued.has(l));
  const total = managementG.evidence.total;
  const score = total > 0 ? matched.length / total : managementG.score;
  return {
    ...managementG,
    score,
    evidence: { ...managementG.evidence, matched, missed, judge_matched: matchedLabels },
    judge_receipt,
  };
}

/**
 * Run ONE case end-to-end for one backend. Returns the EvalRunReport `cases[]`
 * item (not yet aggregated).
 *
 * @param {object} args
 * @param {object} args.caseNodes - { envelope, presentation, policy, ground_truth, management, safety_netting }
 * @param {string} args.backendName - "claude" | "medgemma"
 * @param {object} args.replayer - generation replayer (llm-replay)
 * @param {{ replayer: object, transport?: Function }} args.judge - judge replayer + live transport
 * @param {(trunkId: string, backendName: string) => Function} [args.generatorFactory] - defaults to the real backend
 * @param {string[]} [args.turnPlan]
 * @param {string} [args.sessionRef]
 * @param {string} [args.nowIso] - injected timestamp for the judge RECORD path
 */
export async function runCaseEval({ caseNodes, backendName, replayer, judge, generatorFactory, turnPlan, sessionRef, nowIso }) {
  const { envelope, presentation, policy, ground_truth, management, safety_netting } = caseNodes;
  const plan = Array.isArray(turnPlan) && turnPlan.length ? turnPlan : DEFAULT_TURN_PLAN;
  const genFactory = generatorFactory || ((trunkId, backend) => makeSelectedGenerator(trunkId, { backend }));

  const case_id = envelope?.case_metadata?.case_id || presentation.case_id || "UNKNOWN";
  const is_t5 = String(safety_netting?.correct_baseline_tier || "").toUpperCase() === "T5";

  // Seed the packet with the baseline presentation ONLY (history is elicited).
  const caseContent = {
    "01_presentation_layer": {
      case_id: presentation.case_id,
      demographics: presentation.demographics,
      opening_complaint: presentation.opening_complaint,
    },
  };

  const sim = createPatientSimulator({ presentation, policy });
  const conversation = [];
  const turns = [];
  let convTurn = 0;

  // Turn 0 — the patient's presenting complaint.
  const opening = sim.openingTurn();
  conversation.push({ role: "patient", turn: convTurn++, text: opening.patient_text });

  const verificationPasses = [];
  const turnTiers = []; // per-turn EFFECTIVE disposition (post intake interrogation, Phase C)
  for (let i = 0; i < plan.length; i += 1) {
    const trunkId = plan[i];
    const generateCandidate = makeReplayGenerator({ trunkId, backendName, replayer, generatorFactory: genFactory });
    const latestPatient = [...conversation].reverse().find((c) => c.role === "patient");
    const result = await runTrunkWithGrounding(trunkId, latestPatient ? latestPatient.text : opening.patient_text, {
      caseContent,
      conversation: [...conversation],
      generateCandidate,
      sessionRef,
      writeArtifacts: false,
    });
    const aiText = typeof result.output === "string" ? result.output : String(result.output ?? "");
    turns.push({
      turn: convTurn,
      trunk_id: trunkId,
      candidate_output_hash: result.report.candidate_output_hash,
      verification_pass: !!result.pass,
    });
    verificationPasses.push(!!result.pass);
    conversation.push({ role: "assistant", turn: convTurn++, text: aiText });

    // EFFECTIVE disposition = the turn's tier AFTER intake-escalation interrogation
    // (Phase C). An intake escalate_now with no demonstrably-present danger sign is
    // downgraded to T3 (urgent_review) rather than standing as T5.
    const eff = interrogatedTier(aiText);
    turnTiers.push(eff.ai_tier);

    // Emergency escalation short-circuits the consult (correct for a genuine T5).
    // Break on the FIELD-SCOPED disposition — the same surface the scorer reads —
    // NOT the sequencer's prose-permissive detector. A turn whose reasoning merely
    // *mentions* `escalate_now` while its actual gate is `clear` must not truncate
    // the consult before it reaches the triage gate (that mismatch floored real
    // cases to T0). Only a STANDING escalation (grounded present danger sign, or an
    // un-interrogable escalation) short-circuits; a downgraded intake escalation
    // (T3) routes onward. Production's sequencer keeps its own over-halting detector.
    // NOTE: changes consult flow → old fixtures can't replay a NEW downgrade path;
    // validate on a fresh live run (pre-contract fixtures lack danger_signs, so they
    // classify broken→honoured→T5 and replay unchanged).
    if (eff.ai_tier === "T5") break;
    // Otherwise the patient responds to this turn's questions (unless it was the
    // final planned turn).
    if (i < plan.length - 1) {
      const resp = sim.respondTo(aiText);
      conversation.push({ role: "patient", turn: convTurn++, text: resp.patient_text });
    }
  }
  sim.end();

  // Grade (all scorer-side; the transcript is the AI's own words).
  const transcript = conversation.filter((c) => c.role === "assistant").map((c) => c.text).join("\n");
  const verification_pass = verificationPasses.length > 0 && verificationPasses.every(Boolean);

  // The case tier is the most-urgent EFFECTIVE per-turn disposition (Phase C:
  // interrogation-aware — a downgraded intake escalation contributes T3, not T5).
  // Falls back to the whole-transcript parse if no turn ran (empty plan). May be
  // "INCOMPLETE" (blocked_incomplete).
  const ai_tier = turnTiers.length ? mostUrgentTier(turnTiers) : extractAiTier(transcript).ai_tier;
  // Grading escalation signal is broader than the loop's structured detector: a
  // T5 disposition (call 000 / emergency ambulance) IS escalation, so the
  // leading-dx-by-escalation credit (eval-rubric §3.2) fires on real prose too.
  const escalated = detectEscalation(transcript) || ai_tier === "T5";

  const historyG = gradeHistoryTaking(sim.elicitationReport(), policy);
  const diagnosticG = gradeDiagnosticReasoning(transcript, ground_truth, { escalated, isEmergency: is_t5 });
  const managementG0 = gradeManagementQuality(transcript, management);
  // v1.3 management-coverage judge cross-check: rescue containment misses caused
  // by paraphrase/examples. Pure grader first, then the (resume-safe) judge.
  const managementG = await applyManagementJudge(managementG0, management, transcript, judge, nowIso);
  const triageG = gradeTriage({ case_id, ai_tier, node: safety_netting, is_t5 });
  const communicationG = await gradeCommunication({
    communicationText: transcript,
    replayer: judge.replayer,
    transport: judge.transport,
    nowIso,
  });

  const scored = scoreCase({
    verification_pass,
    // v1.2 tier-class (rubric §10): anchored to the GOLD baseline, scorer-side —
    // an emergency case (gold T4/T5) is scored on triage + safety-netting, not on
    // full-consult coverage it correctly short-circuits.
    care_class: careClass(safety_netting && safety_netting.correct_baseline_tier),
    dimensions: {
      history_taking: historyG.score,
      diagnostic_reasoning: diagnosticG.score,
      management_quality: managementG.score,
      communication: communicationG.score,
    },
    triage: { score: triageG.score, critical_under_triage: triageG.critical_under_triage, incomplete: triageG.incomplete },
    auto_fail: !!managementG.auto_fail,
  });

  return {
    case_id,
    ...(envelope?.case_metadata?.difficulty_tier ? { difficulty_tier: envelope.case_metadata.difficulty_tier } : {}),
    ...(envelope?.case_metadata?.diagnosis_category ? { diagnosis_category: envelope.case_metadata.diagnosis_category } : {}),
    is_t5,
    turns,
    dimensions: {
      history_taking: coverageDim(historyG),
      diagnostic_reasoning: coverageDim(diagnosticG),
      management_quality: coverageDim(managementG),
      communication: communicationG,
    },
    triage: {
      classification: triageG.classification || "critical_under_triage",
      score: typeof triageG.score === "number" ? triageG.score : 0,
      // ai_tier is audit-only and schema-constrained to ^T[0-5]$; omit it for an
      // INCOMPLETE consult (no tier was assigned). The "incomplete" classification
      // carries that state instead.
      ...(/^T[0-5]$/.test(ai_tier) ? { ai_tier } : {}),
      under_triage: !!triageG.under_triage,
      critical_under_triage: !!triageG.critical_under_triage,
      over_triage: !!triageG.over_triage,
    },
    verification_pass,
    ungrounded: scored.ungrounded,
    fully_scored: scored.fully_scored,
    case_score: scored.case_score,
    clinical_pass: scored.clinical_pass,
    // v1.3 medal band (quality lens) + care_class (which scoring path ran). medal
    // is always set by scoreCase; care_class only on a fully/emergency-scored path.
    medal: scored.medal,
    ...(scored.care_class ? { care_class: scored.care_class } : {}),
    auto_fail: !!managementG.auto_fail,
  };
}

/**
 * Run a full set of cases for ONE backend and assemble the aggregate report body
 * (release_gate + metrics + positional_stability). The release gate is the AND of
 * the threshold gate (enforceReleaseThresholds) and the M3 positional-stability
 * gate — both must pass.
 *
 * @param {object} args
 * @param {(trunkId, backend) => Function} [args.generatorFactory]
 * @param {boolean} [args.runPositional=true] - set false to skip the (expensive)
 *   positional pass, e.g. a fast consult-only smoke; a certifying run keeps it on.
 * @param {number} [args.positionalSampleN] - cap the positional pass to the first
 *   N long-list cases (the M3-sanctioned sampled canary for cost). Omit = all.
 *   The CALLER must log the drop (no silent caps) — runBackendCases returns the
 *   sampled long_list_case_ids so the caller can compare against the total.
 * @returns {{ backend, cases, metrics, release_gate, positional_stability }}
 */
export async function runBackendCases({ cases, backendName, replayer, judge, generatorFactory, turnPlan, nowIso, runPositional = true, positionalSampleN }) {
  const genFactory = generatorFactory || ((trunkId, backend) => makeSelectedGenerator(trunkId, { backend }));
  const caseResults = [];
  for (const caseNodes of cases) {
    caseResults.push(await runCaseEval({ caseNodes, backendName, replayer, judge, generatorFactory: genFactory, turnPlan, nowIso }));
  }
  const metrics = computeCaseSetMetrics(
    caseResults.map((c) => ({
      ungrounded: c.ungrounded,
      fully_scored: c.fully_scored,
      clinical_pass: c.clinical_pass,
      critical_under_triage: c.triage.critical_under_triage,
      is_t5: c.is_t5,
      incomplete: c.triage.classification === "incomplete",
      medal: c.medal,
    })),
  );
  const base = enforceReleaseThresholds(metrics);

  // M3 positional stability — EVALUATION-ONLY, per model, over the long-list
  // subset. A separate generation pass (permuted packets), replay-wrapped.
  let positional_stability = { overall: "not_applicable", long_list_case_ids: [], results: [] };
  if (runPositional) {
    let longList = selectLongListCases(cases);
    if (Number.isInteger(positionalSampleN) && positionalSampleN >= 0) longList = longList.slice(0, positionalSampleN);
    const posResults = [];
    for (const caseNodes of longList) {
      const generate = makeReplayGenerator({ trunkId: "9.0", backendName, replayer, generatorFactory: genFactory });
      posResults.push(await runPositionalForCase(caseNodes, generate));
    }
    positional_stability = aggregatePositional(posResults);
  }

  // Release = threshold gate AND positional gate. Fold positional reasons in.
  const pg = positionalGate(positional_stability);
  const release_gate = {
    armed: base.armed,
    release_ready: base.release_ready && pg.passes,
    blocking_reasons: [...base.blocking_reasons, ...pg.reasons],
  };

  return { backend: backendName, cases: caseResults, metrics, release_gate, positional_stability };
}
