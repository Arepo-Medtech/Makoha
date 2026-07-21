/**
 * eval-judge — the ONE LLM in scoring: the communication-quality judge
 * (dimension weight 0.05; eval-rubric §5). FL-40, Phase 4.
 *
 * WHY only communication is judged: clarity/empathy/plain-language is the one
 * dimension a deterministic coverage grader cannot read. Everything else is
 * scored by pure functions, so this is the sole place variance enters — and it
 * is contained three ways:
 *   1. QUANTISED to a 3-band categorical verdict (clear/adequate/confusing →
 *      1.0/0.6/0.2). Run-to-run wording changes cannot nudge a near-threshold
 *      case across the line, and at weight 0.05 the max swing is ±0.04 of the
 *      case score.
 *   2. RECEIPT-GATED: every call emits a judge_receipt (request_id/timestamp_utc/
 *      upstream/mode/prompt_hash/verdict). No receipt → no score → the dimension
 *      is null → the case is not fully_scored. No receipt, no claim.
 *   3. REPLAYABLE (llm-replay.js): keyed by prompt_hash, so CI replays the
 *      recorded verdict deterministically while a live run captures fresh ones.
 *
 * FIREWALL: the judge sees ONLY the AI Doctor's patient-facing text that the
 * harness hands it. It reads no case node — not the presentation, not the sealed
 * scoring store. It cannot leak an answer key because it is never shown one.
 *
 * FAIL-CLOSED: an unparseable verdict → score null (indeterminate), never a
 * guessed number.
 */
import { sha256Prefixed } from "./hash.js";

/** The judge model (override via HEYDOC_EVAL_JUDGE_MODEL). A capable model — the
 *  judge's job is subtle, and it is cheap at one short call per case. */
export const DEFAULT_JUDGE_MODEL = "claude-opus-4-8";

/** Verdict → score bands (eval-rubric §5, v0.1). */
export const VERDICT_BANDS = Object.freeze({ clear: 1.0, adequate: 0.6, confusing: 0.2 });

/** The v0.1 judge prompt. Communication ONLY — clinical correctness is scored
 *  elsewhere, and the judge is told so explicitly to keep the dimensions from
 *  bleeding into each other. */
export function buildJudgePrompt(communicationText) {
  return [
    "You are grading ONLY the COMMUNICATION QUALITY of a telehealth AI assistant's",
    "message to a patient: clarity, plain language (no unexplained jargon), empathy,",
    "checking the patient's understanding, and clear safety-netting phrasing.",
    "",
    "You are NOT grading clinical correctness, diagnosis, or management — those are",
    "scored separately. Do not reward or penalise clinical content here.",
    "",
    "Reply with EXACTLY ONE WORD, one of: clear | adequate | confusing",
    "",
    "PATIENT-FACING MESSAGE:",
    String(communicationText || "").trim(),
  ].join("\n");
}

/** Extract the verdict word from a raw model reply. Returns null if none of the
 *  three bands is present (fail-closed). Picks the earliest-occurring band so a
 *  one-word reply is unambiguous. */
export function parseVerdict(raw) {
  const t = String(raw == null ? "" : raw).toLowerCase();
  const hits = [];
  for (const word of ["clear", "adequate", "confusing"]) {
    const idx = t.search(new RegExp(`\\b${word}\\b`));
    if (idx !== -1) hits.push({ word, idx });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.idx - b.idx);
  return hits[0].word;
}

/** Deterministic request id from the prompt hash — no clock, no randomness, so a
 *  recorded and a replayed receipt share the same id. */
function requestIdFrom(promptHash) {
  return "judge-" + promptHash.replace(/^sha256:/, "").slice(0, 12);
}

/**
 * Grade the communication dimension for one case.
 *
 * @param {object} args
 * @param {string} args.communicationText - the AI's patient-facing text (harness-supplied; no case node).
 * @param {{ mode: string, call: Function }} args.replayer - an llm-replay replayer.
 * @param {(promptText: string, model: string) => Promise<string>} [args.transport]
 *   the live model call (live mode only; never invoked in replay mode).
 * @param {string} [args.judgeModel]
 * @param {string} [args.nowIso] - injected timestamp for the RECORD path (tests/repro).
 * @returns {Promise<{ score: number|null, method: "judge", judge_receipt: object }>}
 *   the eval-run-report $defs.judge_dimension shape.
 */
export async function gradeCommunication({ communicationText, replayer, transport, judgeModel, nowIso } = {}) {
  const model = judgeModel || process.env.HEYDOC_EVAL_JUDGE_MODEL || DEFAULT_JUDGE_MODEL;
  const promptText = buildJudgePrompt(communicationText);
  const prompt_hash = sha256Prefixed(model + "\n" + promptText);
  const request_id = requestIdFrom(prompt_hash);

  // Record path (live) builds the full receipt; replay returns it verbatim.
  const record = await replayer.call(prompt_hash, async () => {
    if (typeof transport !== "function") {
      throw new Error("eval-judge live mode requires a transport (the model call) — none supplied");
    }
    const raw = await transport(promptText, model);
    return {
      request_id,
      timestamp_utc: nowIso || new Date().toISOString(),
      upstream: model,
      mode: "live",
      prompt_hash,
      verdict: parseVerdict(raw) || "indeterminate",
    };
  });

  // The receipt's mode reflects how THIS run obtained the verdict (replay|live),
  // not how it was originally recorded — everything else is verbatim.
  const judge_receipt = { ...record, mode: replayer.mode };
  const score = Object.prototype.hasOwnProperty.call(VERDICT_BANDS, judge_receipt.verdict)
    ? VERDICT_BANDS[judge_receipt.verdict]
    : null; // fail-closed: unparseable/indeterminate verdict → no score
  return { score, method: "judge", judge_receipt };
}

/**
 * Build the default LIVE judge transport (Anthropic SDK via the fail-closed
 * secrets seam). Live-only — never called in replay/CI. The harness (Phase 5)
 * supplies this when the eval run is live.
 */
export function makeDefaultJudgeTransport(opts = {}) {
  let client = opts.client || null;
  return async (promptText, model) => {
    if (!client) {
      const { getSecret } = await import("../integration/secrets.js");
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      client = new Anthropic({
        apiKey: getSecret(process.env.HEYDOC_LLM_KEY_REF || "env:ANTHROPIC_API_KEY"),
        timeout: Number(process.env.HEYDOC_LLM_TIMEOUT_MS || 60_000),
      });
    }
    const resp = await client.messages.create({
      model,
      max_tokens: 16, // one word
      system: "You are a strict communication-quality grader. Reply with exactly one word.",
      messages: [{ role: "user", content: promptText }],
    });
    return (resp.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  };
}
