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
  buildManagementJudgePrompt,
  parseMatchedIndices,
  judgeManagementItems,
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

    // ── 8. Management-coverage cross-check (rubric v1.3) ─────────────────────
    const missed = [
      { label: "MI-2", text: "Recommend an oral non-sedating antihistamine for the itch" },
      { label: "MI-4", text: "Safety-net for evolving anaphylaxis — call 000" },
    ];
    // prompt scoping + numbering
    const mPrompt = buildManagementJudgePrompt("take cetirizine", missed);
    if (!/SUBSTANTIVELY ADDRESSES/i.test(mPrompt) && !/substantively addresses/i.test(mPrompt)) errors.push("mgmt judge prompt not scoped to coverage");
    if (!/1\. Recommend an oral non-sedating antihistamine/.test(mPrompt)) errors.push("mgmt judge prompt not numbered from 1");
    if (!/take cetirizine/.test(mPrompt)) errors.push("mgmt judge prompt missing the AI text");
    // parseMatchedIndices bands (fail-closed)
    if ([...parseMatchedIndices("1,2", 2)].join(",") !== "1,2") errors.push("parseMatchedIndices(1,2)");
    if (parseMatchedIndices("NONE", 2).size !== 0) errors.push("parseMatchedIndices(NONE) not empty");
    if (parseMatchedIndices("banana", 2).size !== 0) errors.push("parseMatchedIndices(garbage) not empty (fail-closed)");
    if (parseMatchedIndices("9", 2).size !== 0) errors.push("parseMatchedIndices out-of-range ignored");

    // RECORD (live): transport confirms only point 1 (cetirizine ⇒ antihistamine).
    const mFix = join(tmpdir(), `eval-mgmtjudge-${process.pid}.json`);
    const mRec = createReplayer({ fixturePath: mFix, mode: "live" });
    const recM = await judgeManagementItems({
      outputText: "take cetirizine for the itch",
      missedItems: missed,
      replayer: mRec,
      transport: () => Promise.resolve("1"),
      nowIso: "2026-07-22T00:00:00.000Z",
    });
    mRec.save();
    if (recM.matchedLabels.join(",") !== "MI-2") errors.push(`mgmt judge should rescue MI-2, got ${recM.matchedLabels}`);
    if (recM.judge_receipt.verdict !== "matched:1") errors.push(`mgmt judge verdict ${recM.judge_receipt.verdict} != matched:1`);
    if (!SHA256.test(recM.judge_receipt.prompt_hash)) errors.push("mgmt judge prompt_hash bad format");

    // REPLAY: same file, transport MUST NOT be called; rescue is byte-identical.
    const mRep = createReplayer({ fixturePath: mFix, mode: "replay" });
    const repM = await judgeManagementItems({ outputText: "take cetirizine for the itch", missedItems: missed, replayer: mRep, transport: throwTransport });
    if (repM.matchedLabels.join(",") !== "MI-2") errors.push("mgmt judge replay did not reproduce the rescue");
    if (repM.judge_receipt.timestamp_utc !== "2026-07-22T00:00:00.000Z") errors.push("mgmt judge replay timestamp not verbatim");
    if (repM.judge_receipt.mode !== "replay") errors.push("mgmt judge replay mode != replay");

    // RESUME-SAFE: a replay MISS with no transport SKIPS (no throw, no rescue) —
    // an optional upgrade must never red a run that predates the feature.
    const mMiss = createReplayer({ fixturePath: join(tmpdir(), `eval-mgmtjudge-miss-${process.pid}.json`), mode: "replay" });
    let missSkipped = true;
    try {
      const skip = await judgeManagementItems({ outputText: "x", missedItems: missed, replayer: mMiss });
      if (skip.matchedLabels.length !== 0 || skip.judge_receipt !== null) missSkipped = false;
    } catch (_) {
      missSkipped = false;
    }
    if (!missSkipped) errors.push("mgmt judge replay-miss must SKIP (no throw, no rescue), not fail-closed-throw");
  } finally {
    for (const f of [
      FIXTURE,
      join(tmpdir(), `eval-judge-fixture2-${process.pid}.json`),
      join(tmpdir(), `eval-mgmtjudge-${process.pid}.json`),
      join(tmpdir(), `eval-mgmtjudge-miss-${process.pid}.json`),
    ]) {
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
