/**
 * Contract test for the eval orchestrator (FL-40, Phase 5). Drives the worked
 * case through a SCRIPTED "model" (standing in for the recorded/live backend)
 * and asserts:
 *   - a multi-turn consult runs; every turn carries a valid candidate_output_hash;
 *   - the graders + scoreCase assemble a fully_scored, clinical_pass case;
 *   - a full EvalRunReport validates against the schema, for BOTH backends;
 *   - HARNESS-LEVEL FIREWALL: nothing the model sees (the packets) contains
 *     answer-key content — the sealed diagnosis name, gold drug names, or any
 *     sealed-node key — even though the graders legitimately cite dx labels
 *     scorer-side in the report;
 *   - RECORD → REPLAY is deterministic: a replay run reproduces the case score
 *     with the generator + judge transports never called.
 * Run from repo root: node test/contract-eval-harness.js
 */
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync, existsSync } from "node:fs";
import { loadCaseNodes } from "../verification/eval-case-loader.js";
import { runBackendCases } from "../verification/eval-harness.js";
import { createReplayer } from "../verification/llm-replay.js";
import { validateEvalRunReport } from "../verification/eval-report-schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASE = loadCaseNodes(join(HERE, "..", "data", "cases", "SPEC-CARD-01-00023"));
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const NOW = "2026-07-20T00:00:00.000Z";

// The scripted "AI Doctor" — one utterance per trunk. Non-final turns ask the
// case's trigger questions (drives elicitation); the final turn is a correct
// emergency assessment. Deliberately NAMES ACS/PE but NOT "tamponade" (proves
// the model never had the sealed answer).
const AI_TURNS = {
  "1.0": "Thank you. Is there any position that makes it better or worse? Have you felt faint or like you might pass out?",
  "3.0": "How do his hands and skin look and feel? Has the type of chest discomfort changed — is it sharp or a constant pressure now? What medications is he taking right now?",
  "9.0":
    "This is a life-threatening cardiovascular emergency in someone with recent pericarditis who now has sudden severe breathlessness, near-syncope and signs of shock. " +
    "Call 000 immediately for an emergency ambulance — do not wait to take measurements or confirm a diagnosis. " +
    "Keep him sitting upright and leaning forward; do not let him lie flat or stand or walk. Keep him nil by mouth, stay with him and monitor his conscious level. " +
    "No home medication treats this — the definitive treatment is drainage of the fluid at hospital. Do not give GTN, nitrates, a diuretic or a beta-blocker. " +
    "We must also exclude acute coronary syndrome and pulmonary embolism at hospital.",
};

function scriptedFactory(captured) {
  return (trunkId) => (packet) => {
    if (captured) captured.push(packet);
    return Promise.resolve({
      ok: true,
      candidate_output: AI_TURNS[trunkId] || "Understood, please continue.",
      audit: { mode: "mock", model: "scripted", prompt_sha256: "sha256:" + "0".repeat(64) },
    });
  };
}
const scriptedJudge = () => Promise.resolve("clear");
const throwGenFactory = () => () => {
  throw new Error("generator must not be called in replay");
};
const throwJudge = () => {
  throw new Error("judge transport must not be called in replay");
};

function assembleReport(body, backend, mode) {
  return validateEvalRunReport({
    schema_version: "1.0.0",
    run_id: `eval-test-${backend}`,
    rubric_version: "eval-rubric:v0.1",
    backend,
    mode,
    generated_at_utc: NOW,
    cases: body.cases,
    positional_stability: body.positional_stability,
    metrics: body.metrics,
    release_gate: body.release_gate,
  });
}

async function run() {
  const errors = [];
  const fixtures = {
    gen: join(tmpdir(), `eval-harness-gen-${process.pid}.json`),
    judge: join(tmpdir(), `eval-harness-judge-${process.pid}.json`),
  };
  const cleanup = () => [fixtures.gen, fixtures.judge].forEach((f) => existsSync(f) && rmSync(f, { force: true }));

  try {
    // ── RECORD (live) run, backend claude ──────────────────────────────────
    const captured = [];
    const genRec = createReplayer({ fixturePath: fixtures.gen, mode: "live" });
    const judgeRec = createReplayer({ fixturePath: fixtures.judge, mode: "live" });
    const liveBody = await runBackendCases({
      cases: [CASE],
      backendName: "claude",
      replayer: genRec,
      judge: { replayer: judgeRec, transport: scriptedJudge },
      generatorFactory: scriptedFactory(captured),
      nowIso: NOW,
    });
    genRec.save();
    judgeRec.save();

    const c = liveBody.cases[0];
    if (!c.fully_scored) errors.push("case not fully_scored");
    if (!c.clinical_pass) errors.push(`case not clinical_pass (score ${c.case_score})`);
    if (!(c.case_score >= 0.7)) errors.push(`case_score ${c.case_score} < 0.7`);
    if (c.turns.length < 2) errors.push(`expected multi-turn consult, got ${c.turns.length} turns`);
    for (const t of c.turns) {
      if (!SHA256.test(t.candidate_output_hash)) errors.push(`turn ${t.turn} bad hash`);
      if (typeof t.verification_pass !== "boolean") errors.push(`turn ${t.turn} bad verification_pass`);
    }
    if (c.triage.ai_tier !== "T5") errors.push(`triage ai_tier ${c.triage.ai_tier} != T5`);
    if (c.dimensions.communication.judge_receipt.verdict !== "clear") errors.push("judge verdict not recorded");

    let liveReport;
    try {
      liveReport = assembleReport(liveBody, "claude", "live");
    } catch (e) {
      errors.push("live report invalid: " + e.message);
    }

    // ── HARNESS FIREWALL: what the model saw is answer-key-free ─────────────
    const seen = JSON.stringify(captured).toLowerCase();
    if (!captured.length) errors.push("no packets captured — generator never ran");
    if (seen.includes("tamponade")) errors.push("sealed diagnosis 'tamponade' reached a packet the model saw");
    for (const spoiler of ["furosemide", "glyceryl trinitrate"]) {
      if (seen.includes(spoiler)) errors.push(`sealed drug '${spoiler}' reached a packet the model saw`);
    }
    if (/"1[0-3]_[a-z_]+"/.test(seen)) errors.push("a sealed-node key reached a packet the model saw");
    // and the packet genuinely carried the multi-turn transcript + presentation facts
    if (!captured.some((p) => Array.isArray(p.conversation) && p.conversation.length > 0)) errors.push("packet never carried the conversation");
    if (!captured.some((p) => Array.isArray(p.facts) && p.facts.length > 0)) errors.push("packet never carried presentation facts");

    // ── Second backend produces a valid per-backend report ──────────────────
    const genRec2 = createReplayer({ fixturePath: join(tmpdir(), `eval-h-gen2-${process.pid}.json`), mode: "live" });
    const judgeRec2 = createReplayer({ fixturePath: join(tmpdir(), `eval-h-judge2-${process.pid}.json`), mode: "live" });
    const mgBody = await runBackendCases({
      cases: [CASE],
      backendName: "medgemma",
      replayer: genRec2,
      judge: { replayer: judgeRec2, transport: scriptedJudge },
      generatorFactory: scriptedFactory(null),
      nowIso: NOW,
    });
    try {
      assembleReport(mgBody, "medgemma", "live");
    } catch (e) {
      errors.push("medgemma report invalid: " + e.message);
    }
    [join(tmpdir(), `eval-h-gen2-${process.pid}.json`), join(tmpdir(), `eval-h-judge2-${process.pid}.json`)].forEach((f) => existsSync(f) && rmSync(f, { force: true }));

    // ── REPLAY run reproduces the score with transports never called ────────
    const genRep = createReplayer({ fixturePath: fixtures.gen, mode: "replay" });
    const judgeRep = createReplayer({ fixturePath: fixtures.judge, mode: "replay" });
    const replayBody = await runBackendCases({
      cases: [CASE],
      backendName: "claude",
      replayer: genRep,
      judge: { replayer: judgeRep, transport: throwJudge },
      generatorFactory: throwGenFactory,
      nowIso: NOW,
    });
    const rc = replayBody.cases[0];
    if (rc.case_score !== c.case_score) errors.push(`replay case_score ${rc.case_score} != live ${c.case_score} (non-deterministic)`);
    if (rc.triage.classification !== c.triage.classification) errors.push("replay triage classification differs");
    if (rc.dimensions.communication.judge_receipt.timestamp_utc !== NOW) errors.push("replay judge timestamp not verbatim from fixture");
    try {
      assembleReport(replayBody, "claude", "replay");
    } catch (e) {
      errors.push("replay report invalid: " + e.message);
    }
  } finally {
    cleanup();
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-eval-harness: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
