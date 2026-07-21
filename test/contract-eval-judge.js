/**
 * Contract tests for the communication judge + replay layer (FL-40, Phase 4).
 * Asserts:
 *   - buildJudgePrompt scopes to communication and demands a one-word verdict;
 *   - parseVerdict maps the three bands, is fail-closed on garbage, earliest-wins;
 *   - VERDICT_BANDS quantisation (clear/adequate/confusing → 1.0/0.6/0.2);
 *   - RECORD → REPLAY is byte-deterministic: same verdict, prompt_hash, request_id
 *     and timestamp; the replay run never calls the transport; mode flips
 *     live → replay;
 *   - a REPLAY MISS throws (fail-closed — no model call, no fabrication);
 *   - an unparseable verdict → score null (dimension not scored), never guessed;
 *   - the judge_receipt matches the eval-run-report $defs.judge_dimension shape.
 * Run from repo root: node test/contract-eval-judge.js
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { createReplayer } from "../verification/llm-replay.js";
import {
  buildJudgePrompt,
  parseVerdict,
  VERDICT_BANDS,
  gradeCommunication,
} from "../verification/eval-judge.js";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const FIXTURE = join(tmpdir(), `eval-judge-fixture-${process.pid}.json`);
const AI_TEXT = "I know this is frightening. In plain terms: we need an ambulance now. Is that okay with you?";

async function run() {
  const errors = [];
  const throwTransport = () => {
    throw new Error("transport must not be called");
  };

  try {
    // 1. Prompt scoping.
    const prompt = buildJudgePrompt(AI_TEXT);
    if (!/COMMUNICATION QUALITY/.test(prompt)) errors.push("judge prompt not scoped to communication");
    if (!/one word/i.test(prompt) || !/clear \| adequate \| confusing/.test(prompt)) errors.push("judge prompt missing one-word verdict instruction");
    if (!prompt.includes(AI_TEXT)) errors.push("judge prompt missing the AI text");

    // 2. parseVerdict.
    if (parseVerdict("clear") !== "clear") errors.push("parseVerdict(clear)");
    if (parseVerdict("Adequate.") !== "adequate") errors.push("parseVerdict(Adequate.)");
    if (parseVerdict("confusing") !== "confusing") errors.push("parseVerdict(confusing)");
    if (parseVerdict("banana") !== null) errors.push("parseVerdict(garbage) should be null");
    if (parseVerdict("clear, not confusing") !== "clear") errors.push("parseVerdict earliest-wins");

    // 3. Quantisation.
    if (VERDICT_BANDS.clear !== 1.0 || VERDICT_BANDS.adequate !== 0.6 || VERDICT_BANDS.confusing !== 0.2) {
      errors.push("VERDICT_BANDS values changed from the v0.1 rubric");
    }

    // 4. RECORD (live) then REPLAY.
    const rec = createReplayer({ fixturePath: FIXTURE, mode: "live" });
    const recorded = await gradeCommunication({
      communicationText: AI_TEXT,
      replayer: rec,
      transport: () => Promise.resolve("clear"),
      nowIso: "2026-07-20T00:00:00.000Z",
    });
    rec.save();
    if (recorded.score !== 1.0) errors.push(`recorded score ${recorded.score} != 1.0`);
    if (recorded.judge_receipt.mode !== "live") errors.push("recorded mode != live");
    if (!SHA256.test(recorded.judge_receipt.prompt_hash)) errors.push("recorded prompt_hash bad format");

    const rep = createReplayer({ fixturePath: FIXTURE, mode: "replay" });
    const replayed = await gradeCommunication({ communicationText: AI_TEXT, replayer: rep, transport: throwTransport });
    if (replayed.score !== recorded.score) errors.push("replay score != recorded score");
    if (replayed.judge_receipt.verdict !== recorded.judge_receipt.verdict) errors.push("replay verdict != recorded");
    if (replayed.judge_receipt.prompt_hash !== recorded.judge_receipt.prompt_hash) errors.push("replay prompt_hash != recorded");
    if (replayed.judge_receipt.request_id !== recorded.judge_receipt.request_id) errors.push("replay request_id != recorded");
    if (replayed.judge_receipt.timestamp_utc !== "2026-07-20T00:00:00.000Z") errors.push("replay timestamp not verbatim from fixture (non-deterministic)");
    if (replayed.judge_receipt.mode !== "replay") errors.push("replay mode != replay");

    // 5. Replay MISS on an unseen prompt → fail-closed throw.
    let missThrew = false;
    try {
      await gradeCommunication({ communicationText: "a totally different, never-recorded message", replayer: rep, transport: throwTransport });
    } catch (_) {
      missThrew = true;
    }
    if (!missThrew) errors.push("replay MISS did not throw (fail-closed violated)");

    // 6. Fail-closed on unparseable verdict → score null.
    const rec2 = createReplayer({ fixturePath: join(tmpdir(), `eval-judge-fixture2-${process.pid}.json`), mode: "live" });
    const indet = await gradeCommunication({
      communicationText: "another message",
      replayer: rec2,
      transport: () => Promise.resolve("I'm not sure, maybe okay?"),
      nowIso: "2026-07-20T00:00:00.000Z",
    });
    if (indet.score !== null) errors.push(`unparseable verdict score ${indet.score} should be null`);
    if (indet.judge_receipt.verdict !== "indeterminate") errors.push("unparseable verdict not marked indeterminate");

    // 7. judge_receipt shape (eval-run-report $defs.judge_dimension).
    const r = recorded.judge_receipt;
    for (const k of ["request_id", "timestamp_utc", "upstream", "mode", "prompt_hash", "verdict"]) {
      if (!(k in r)) errors.push(`judge_receipt missing ${k}`);
    }
    if (recorded.method !== "judge") errors.push("dimension method != judge");
    if (!["replay", "live"].includes(r.mode)) errors.push("judge_receipt mode not in eval enum");
  } finally {
    for (const f of [FIXTURE, join(tmpdir(), `eval-judge-fixture2-${process.pid}.json`)]) {
      if (existsSync(f)) rmSync(f, { force: true });
    }
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-eval-judge: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
