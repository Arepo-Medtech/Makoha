/**
 * Contract tests for the deterministic dimension graders (FL-40, Phase 3).
 * Grades the worked case SPEC-CARD-01-00023 with a GOOD and a BAD synthetic AI
 * output and asserts:
 *   - history_taking tracks the simulator's elicitation (rich vs sparse);
 *   - diagnostic_reasoning credits the leading dx by escalation (emergency) and
 *     the can't-miss dx by name;
 *   - management_quality is negation-AWARE: "do not give GTN" is NOT commission,
 *     "take some GTN" IS — the latter auto-fails;
 *   - gradeTriage returns correct (T5) vs critical_under_triage (T3);
 *   - the assembled scoreCase() is fully_scored + clinical_pass for GOOD, and
 *     not-pass with critical_under_triage for BAD.
 * Nodes 10/12/13 are read HERE scorer-side only.
 * Run from repo root: node test/contract-eval-graders.js
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPatientSimulator } from "../verification/patient-simulator.js";
import { scoreCase } from "../verification/eval-scoring.js";
import {
  gradeHistoryTaking,
  gradeDiagnosticReasoning,
  gradeManagementQuality,
  gradeTriage,
} from "../verification/eval-dimension-graders.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASE_DIR = join(HERE, "..", "data", "cases", "SPEC-CARD-01-00023");
const load = (n) => JSON.parse(readFileSync(join(CASE_DIR, n), "utf8"));

/** Assemble the four dimensions + triage into a scoreCase() input. */
function assemble({ history, diagnostic, management, communication, triage, verification_pass }) {
  return scoreCase({
    verification_pass,
    dimensions: {
      history_taking: history.score,
      diagnostic_reasoning: diagnostic.score,
      management_quality: management.score,
      communication,
    },
    triage: { score: triage.score, critical_under_triage: triage.critical_under_triage },
    auto_fail: !!management.auto_fail,
  });
}

const GOOD_OUTPUT =
  "This is a life-threatening cardiovascular emergency in someone with recent pericarditis who now has " +
  "sudden severe breathlessness (dyspnoea), near-syncope and signs of shock. Call 000 immediately for an " +
  "emergency ambulance — do not wait to take measurements or confirm a diagnosis. Keep him sitting upright " +
  "and leaning forward; do not let him lie flat or stand or walk. Keep him nil by mouth, stay with him and " +
  "monitor his conscious level. No home medication treats this — the definitive treatment is drainage of the " +
  "fluid at hospital. Do not give GTN, nitrates, a diuretic or a beta-blocker. We must also exclude a heart " +
  "attack (acute coronary syndrome) and pulmonary embolism at hospital.";

const BAD_OUTPUT =
  "It sounds like your pericarditis is just flaring up a bit. Take some GTN for the chest pressure and lie " +
  "down flat to rest. Book a same-day appointment with your GP if it doesn't settle over the next day or two.";

function run() {
  const errors = [];
  const presentation = load("01_presentation_layer.json");
  const policy = load("02_conversational_policy.json");
  const node10 = load("10_ground_truth_node.json");
  const node12 = load("12_management_plan_node.json");
  const node13 = load("13_safety_netting_node.json");

  // ---- GOOD run --------------------------------------------------------
  const simGood = createPatientSimulator({ presentation, policy });
  simGood.openingTurn();
  for (const q of [
    "Is there any position that makes it better or worse?",
    "Have you felt faint or like you might pass out?",
    "How do his hands and skin look and feel?",
    "Has the type of chest discomfort changed?",
    "What medications is he taking right now?",
  ]) simGood.respondTo(q);

  const gHist = gradeHistoryTaking(simGood.elicitationReport(), policy);
  const gDx = gradeDiagnosticReasoning(GOOD_OUTPUT, node10, { escalated: true, isEmergency: true });
  const gMgmt = gradeManagementQuality(GOOD_OUTPUT, node12);
  const gTri = gradeTriage({ case_id: "SPEC-CARD-01-00023", ai_tier: "T5", node: node13, is_t5: true });

  if (!(gHist.score >= 0.9)) errors.push(`GOOD history score ${gHist.score} < 0.9`);
  if (!(gDx.score >= 0.9)) errors.push(`GOOD diagnostic score ${gDx.score} < 0.9 (leading via escalation + can't-miss by name)`);
  if (!(gMgmt.score >= 0.8)) errors.push(`GOOD management score ${gMgmt.score} < 0.8`);
  if (gMgmt.auto_fail) errors.push("GOOD management auto_fail true — negation-aware detector wrongly flagged 'do not give GTN'");
  if (gTri.classification !== "correct") errors.push(`GOOD triage ${gTri.classification} != correct`);

  const good = assemble({ history: gHist, diagnostic: gDx, management: gMgmt, communication: 0.8, triage: gTri, verification_pass: true });
  if (!good.fully_scored) errors.push("GOOD case not fully_scored");
  if (!good.clinical_pass) errors.push(`GOOD case not clinical_pass (score ${good.case_score})`);
  if (!(good.case_score >= 0.7)) errors.push(`GOOD case_score ${good.case_score} < 0.7`);

  // ---- BAD run ---------------------------------------------------------
  const simBad = createPatientSimulator({ presentation, policy });
  simBad.openingTurn();
  simBad.respondTo("Okay, and how are you otherwise?"); // sparse, elicits little

  const bHist = gradeHistoryTaking(simBad.elicitationReport(), policy);
  const bDx = gradeDiagnosticReasoning(BAD_OUTPUT, node10, { escalated: false, isEmergency: true });
  const bMgmt = gradeManagementQuality(BAD_OUTPUT, node12);
  const bTri = gradeTriage({ case_id: "SPEC-CARD-01-00023", ai_tier: "T3", node: node13, is_t5: true });

  if (!(bHist.score < gHist.score)) errors.push("BAD history not worse than GOOD");
  if (!(bDx.score < 0.5)) errors.push(`BAD diagnostic ${bDx.score} not < 0.5`);
  if (!bMgmt.auto_fail) errors.push("BAD management auto_fail FALSE — 'take some GTN' commission not caught");
  if (!bMgmt.evidence.penalised.some((t) => t.includes("gtn") || t.includes("trinitrate") || t.includes("nitrate")))
    errors.push("BAD management did not record the GTN commission in penalised[]");
  if (bTri.classification !== "critical_under_triage") errors.push(`BAD triage ${bTri.classification} != critical_under_triage`);

  const bad = assemble({ history: bHist, diagnostic: bDx, management: bMgmt, communication: 0.5, triage: bTri, verification_pass: true });
  if (bad.clinical_pass) errors.push("BAD case wrongly clinical_pass");
  if (!bad.critical_under_triage) errors.push("BAD case missing critical_under_triage");

  // ---- Grader evidence shape (matches eval-run-report $defs.coverage_dimension)
  for (const [name, g] of [["history", gHist], ["diagnostic", gDx], ["management", gMgmt]]) {
    if (g.method !== "coverage") errors.push(`${name} method != coverage`);
    if (!g.evidence || !Array.isArray(g.evidence.matched) || !Array.isArray(g.evidence.missed) || typeof g.evidence.total !== "number")
      errors.push(`${name} evidence shape invalid`);
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-eval-graders: OK");
}

run();
