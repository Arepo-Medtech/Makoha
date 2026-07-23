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
import { runBackendCases, extractAiTier, interrogatedTier, mostUrgentTier } from "../verification/eval-harness.js";
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
// The scripted judge answers BOTH judges by prompt type: "clear" for the
// communication judge, and "1" for the v1.3 management cross-check (rescues the
// first containment-missed item, proving the rescue merges end-to-end).
const scriptedJudge = (promptText) =>
  Promise.resolve(/EXPECTED MANAGEMENT POINTS/.test(String(promptText)) ? "1" : "clear");
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

// ── UNIT: extractAiTier disposition reading (FL-40 canary regression) ──────
// The trunks express a T5 emergency as the STRUCTURED `escalate_now` disposition
// value, not as patient-facing prose. The scorer must read the field, map it to
// T5, and NOT be fooled by a prose *mention* of the token. Before this fix the
// live canary floored ~27/29 cases to T0 and manufactured a critical-under-triage
// storm; these cases pin the contract so it can never silently regress.
function testExtractAiTier() {
  const errors = [];
  const eq = (label, transcript, expected) => {
    const got = extractAiTier(transcript).ai_tier;
    if (got !== expected) errors.push(`extractAiTier[${label}]: got ${got}, expected ${expected}`);
  };

  // The bug this fixes: a real escalate_now disposition must score T5, not T0.
  eq("safety_gate.status escalate_now", '```json\n{"safety_gate":{"status":"escalate_now","reasons":["acute cardiac emergency"]}}\n```', "T5");
  eq("risk_outcome escalate_now", '{"risk_outcome":"escalate_now","blocking_items":[]}', "T5");
  eq("escalate_now with trailing note", '{"risk_outcome":"escalate_now — call 000 now"}', "T5");

  // FALSE-POSITIVE guards: a PROSE mention of the token must NOT score T5 — the
  // case is scored on its REAL structured disposition. (Empirically 36/174
  // recorded outputs mentioned the token in prose while their real disposition
  // was clear / blocked_incomplete / urgent_review.) Post-Step-2 these score at
  // their real disposition's tier, and — the essential assertion — never T5.
  eq("prose escalate_now mention, real disposition urgent_review -> T3 not T5", '{"risk_outcome":"urgent_review","notes":{"rationale":"rest pain would raise this toward escalate_now/ACS"}}', "T3");
  eq("rationale_for_not_escalate_now field, real disposition routine -> T2 not T5", '{"risk_outcome":"routine_follow_up","notes":{"rationale_for_not_escalate_now":"no acute event"}}', "T2");

  // Conservative fail-safe: genuinely no disposition still defaults to T0.
  eq("no disposition", '{"intake_summary":"56yo male, chest tightness","structured_history":{}}', "T0");

  // Step-2 disposition mapping (operator ruling 2026-07-21, clinician KL):
  // urgent_review ≡ T3, routine_follow_up ≡ T2, blocked_incomplete ≡ INCOMPLETE.
  eq("urgent_review structured -> T3", '{"risk_outcome":"urgent_review","next_actions":["arrange same-day review"]}', "T3");
  eq("routine_follow_up structured -> T2", '{"risk_outcome":"routine_follow_up","next_actions":["book with your GP"]}', "T2");
  eq("blocked_incomplete -> INCOMPLETE (not T0)", '{"risk_outcome":"blocked_incomplete","blocking_items":["need LOC duration"]}', "INCOMPLETE");
  eq("trunk 1.0 safety_gate blocked_incomplete -> INCOMPLETE", '{"safety_gate":{"status":"blocked_incomplete","reasons":["insufficient facts"]}}', "INCOMPLETE");

  // Most-urgent-first: a positive disposition anywhere BEATS an earlier blocked
  // turn, so a consult that DID reach escalation is never masked as INCOMPLETE.
  eq("blocked at intake but escalate_now later -> T5", '{"safety_gate":{"status":"blocked_incomplete"}}\n{"risk_outcome":"escalate_now"}', "T5");
  // ...and escalate_now outranks urgent_review in the same transcript.
  eq("escalate_now outranks urgent_review", '{"risk_outcome":"urgent_review"}\n{"safety_gate":{"status":"escalate_now"}}', "T5");

  // The INCOMPLETE marker must carry the incomplete flag for the scorer.
  {
    const r = extractAiTier('{"risk_outcome":"blocked_incomplete"}');
    if (r.incomplete !== true) errors.push("extractAiTier[blocked_incomplete]: incomplete flag not set");
  }

  return errors;
}

// ── UNIT: Phase C intake-escalation interrogation (interrogatedTier/mostUrgentTier) ──
// An intake `escalate_now` is downgraded to T3 only when it names NO demonstrably
// present danger sign; a present sign or an un-interrogable escalation stands as T5.
// Pre-contract fixtures (no danger_signs) classify broken→honoured→T5 → replay-safe.
function testInterrogatedTier() {
  const errors = [];
  const eq = (label, aiText, expected) => {
    const got = interrogatedTier(aiText).ai_tier;
    if (got !== expected) errors.push(`interrogatedTier[${label}]: got ${got}, expected ${expected}`);
  };
  const gate = (o) => JSON.stringify({ intake_summary: "x", safety_gate: o });

  // present danger sign → stands as T5.
  eq("escalate_now + present sign → T5",
    gate({ status: "escalate_now", reasons: ["r"], danger_signs: [{ sign: "thunderclap worst-ever headache", status: "present", evidence_ref: "c1" }] }), "T5");
  // no present sign (inferred only) → DOWNGRADED to T3.
  eq("escalate_now + inferred-only → T3 (downgrade)",
    gate({ status: "escalate_now", reasons: ["r"], danger_signs: [{ sign: "severe pain", status: "inferred", evidence_ref: "c2" }] }), "T3");
  // un-interrogable (no danger_signs) → HONOURED as T5 (this is the pre-contract fixture case).
  eq("escalate_now + no danger_signs → T5 (honoured, replay-safe)",
    gate({ status: "escalate_now", reasons: ["acute emergency"] }), "T5");
  // empty danger_signs[] → downgraded to T3 (escalated but articulated nothing present).
  eq("escalate_now + empty danger_signs[] → T3",
    gate({ status: "escalate_now", reasons: ["r"], danger_signs: [] }), "T3");
  // a non-escalate gate falls through to extractAiTier (routine prose here → its cue).
  eq("clear gate + prose 'see your gp' → T2 (fallthrough)",
    JSON.stringify({ safety_gate: { status: "clear", reasons: [] } }) + "\nPlease book an appointment to see your GP.", "T2");
  // prose-only escalation (no safety_gate) → T5 via the extractAiTier fallthrough.
  eq("prose 'call 000' (no safety_gate) → T5 (fallthrough)", "This is an emergency — call an ambulance now.", "T5");

  // mostUrgentTier precedence.
  const mu = (arr, expected) => { const got = mostUrgentTier(arr); if (got !== expected) errors.push(`mostUrgentTier(${JSON.stringify(arr)}): got ${got}, expected ${expected}`); };
  mu(["T3", "T5", "T2"], "T5");
  mu(["T2", "T3"], "T3");
  mu(["T0", "INCOMPLETE"], "INCOMPLETE");
  mu(["T1", "T0"], "T1");
  mu([], "T0");
  return errors;
}

async function run() {
  const errors = [...testExtractAiTier(), ...testInterrogatedTier()];
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
    // v1.3: the case record carries a medal band + care_class, and the aggregate
    // metrics carry the medal_table. This case is a correct emergency → gold.
    if (c.medal !== "gold") errors.push(`expected gold medal, got ${c.medal}`);
    if (c.care_class !== "emergency") errors.push(`expected emergency care_class, got ${c.care_class}`);
    if (!liveBody.metrics.medal_table || liveBody.metrics.medal_table.gold !== 1) errors.push("metrics.medal_table did not tally the gold case");
    // v1.3 management-coverage judge cross-check ran + merged. Robust to which
    // items this terse consult happened to cover: IF the judge ran (there were
    // containment misses), it carries a receipt and any rescued label is now in
    // matched and NOT in missed (merge correctness). The report already validated
    // above, which proves the schema accepts judge_receipt/judge_matched on a
    // COVERAGE dimension.
    const mq = c.dimensions.management_quality;
    if (mq.judge_receipt) {
      if (typeof mq.judge_receipt.verdict !== "string" || !mq.judge_receipt.verdict.length) errors.push("mgmt judge_receipt verdict not a non-empty string");
      if (!SHA256.test(mq.judge_receipt.prompt_hash)) errors.push("mgmt judge_receipt prompt_hash bad format");
      const rescued = mq.evidence.judge_matched || [];
      for (const l of rescued) {
        if (!mq.evidence.matched.includes(l)) errors.push(`rescued ${l} not moved into matched`);
        if (mq.evidence.missed.includes(l)) errors.push(`rescued ${l} still listed as missed`);
      }
    }

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
