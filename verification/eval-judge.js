/**
 * eval-judge — the LLM(s) in scoring. Two, both contained the same way:
 *   1. the communication-quality judge (dimension weight 0.05; eval-rubric §5);
 *   2. a MANAGEMENT-COVERAGE cross-check (rubric v1.3) — a judge that rescues
 *      must-include items the deterministic containment matcher FALSELY missed
 *      because the model paraphrased them or named a specific example of a class
 *      (e.g. "cetirizine" for "an oral non-sedating antihistamine"). It runs ONLY
 *      on containment MISSES, can only ADD matches (never remove), and is the
 *      documented fix for eval-dimension-graders §3.3's known containment limit.
 *
 * WHY judge here: clarity/empathy (communication) and semantic paraphrase
 * (management) are the two things a token-containment grader cannot read.
 * Everything else stays pure deterministic. Variance is contained three ways:
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
 * FIREWALL: both judges are SCORER-SIDE (the grader, not the AI Doctor). The
 * communication judge sees ONLY the AI's patient-facing text — no case node. The
 * management cross-check additionally sees node-12 must_include_items, exactly as
 * the deterministic management grader already does (scorer-side); its VERDICT is
 * folded into a score + a receipt and NEVER returns to a ContextPacket or trunk,
 * so no answer key can flow toward the model. Same trust boundary, no new leak.
 *
 * FAIL-CLOSED: an unparseable communication verdict → score null (indeterminate),
 * never a guessed number. An unparseable/absent management verdict → NO rescue
 * (items stay missed) — the conservative direction: a judge failure can only
 * withhold credit, never inflate a score.
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

// ---------------------------------------------------------------------------
// management-coverage cross-check (rubric v1.3)
// ---------------------------------------------------------------------------

/** The judge model for the management cross-check (shares the communication
 *  judge's override env for one knob). */
export const DEFAULT_MGMT_JUDGE_MODEL = DEFAULT_JUDGE_MODEL;

/**
 * Build the management cross-check prompt. The judge is shown the AI's output
 * and the numbered must-include items the containment matcher MISSED, and asked
 * which the message substantively addresses — clinical intent, not wording, so a
 * specific example of a drug class counts. It is told NOT to grade correctness
 * or reward partial/incorrect content (keeps this to a coverage question).
 */
export function buildManagementJudgePrompt(outputText, missedItems) {
  const numbered = missedItems.map((it, i) => `${i + 1}. ${it.text}`).join("\n");
  return [
    "You are checking COVERAGE of a telehealth AI assistant's message to a patient",
    "against a list of expected management points. For each numbered point, decide",
    "whether the message SUBSTANTIVELY ADDRESSES it — the same clinical intent, even",
    "if worded differently or via a specific example of a drug class (e.g. naming",
    "'cetirizine' addresses 'an oral non-sedating antihistamine').",
    "",
    "Do NOT grade clinical correctness and do NOT credit a point that is only",
    "partially or incorrectly addressed. Answer the coverage question only.",
    "",
    "Reply with a comma-separated list of the point NUMBERS that are addressed",
    "(e.g. '1,3'). If NONE are addressed, reply with the single word NONE.",
    "",
    "EXPECTED MANAGEMENT POINTS:",
    numbered,
    "",
    "PATIENT-FACING MESSAGE:",
    String(outputText || "").trim(),
  ].join("\n");
}

/**
 * Parse the matched point numbers from a raw reply. Returns a Set of 1-based
 * indices in [1, n]. Fail-closed: "none"/empty/unparseable → empty set (no
 * rescue). Out-of-range integers are ignored.
 */
export function parseMatchedIndices(raw, n) {
  const t = String(raw == null ? "" : raw).toLowerCase();
  const out = new Set();
  const nums = t.match(/\d+/g);
  if (!nums) return out; // includes the "NONE" reply
  for (const s of nums) {
    const v = Number(s);
    if (Number.isInteger(v) && v >= 1 && v <= n) out.add(v);
  }
  return out;
}

/**
 * Cross-check the containment-MISSED management items with the judge. Rescues
 * items the deterministic matcher missed for paraphrase/example reasons.
 *
 * RESUME-SAFE: uses the recorded verdict when present (either mode); in live mode
 * with a transport it records a fresh one; a replay MISS with no transport SKIPS
 * the rescue (returns no matches) rather than throwing — an optional score
 * upgrade must never red a replay run that predates this feature.
 *
 * @param {object} args
 * @param {string} args.outputText - the AI's full consult output.
 * @param {Array<{label:string, text:string}>} args.missedItems - containment misses.
 * @param {{ mode:string, call:Function, has:Function }} args.replayer - judge replayer.
 * @param {Function} [args.transport] - live model call (live-mode miss only).
 * @param {string} [args.judgeModel]
 * @param {string} [args.nowIso]
 * @returns {Promise<{ matchedLabels: string[], judge_receipt: object|null }>}
 */
export async function judgeManagementItems({ outputText, missedItems, replayer, transport, judgeModel, nowIso } = {}) {
  if (!replayer || !Array.isArray(missedItems) || missedItems.length === 0) {
    return { matchedLabels: [], judge_receipt: null };
  }
  const model = judgeModel || process.env.HEYDOC_EVAL_JUDGE_MODEL || DEFAULT_MGMT_JUDGE_MODEL;
  const promptText = buildManagementJudgePrompt(outputText, missedItems);
  const prompt_hash = sha256Prefixed(model + "\n" + promptText);
  const request_id = "mgmtjudge-" + prompt_hash.replace(/^sha256:/, "").slice(0, 12);

  // Resume-safe gate: only proceed if we already have the verdict, or we can
  // legitimately record one now (live + transport). Otherwise skip (no rescue).
  const canRecordLive = replayer.mode === "live" && typeof transport === "function";
  if (!replayer.has(prompt_hash) && !canRecordLive) {
    return { matchedLabels: [], judge_receipt: null };
  }

  const record = await replayer.call(prompt_hash, async () => {
    const raw = await transport(promptText, model);
    const matched = parseMatchedIndices(raw, missedItems.length);
    return {
      request_id,
      timestamp_utc: nowIso || new Date().toISOString(),
      upstream: model,
      mode: "live",
      prompt_hash,
      // verdict is the matched-index summary (schema requires a non-empty string).
      verdict: matched.size ? `matched:${[...matched].sort((a, b) => a - b).join(",")}` : "none",
    };
  });

  const judge_receipt = { ...record, mode: replayer.mode };
  // Re-derive the matched labels from the recorded verdict (verbatim, deterministic).
  const idxs = parseMatchedIndices(judge_receipt.verdict, missedItems.length);
  const matchedLabels = missedItems.filter((_, i) => idxs.has(i + 1)).map((it) => it.label);
  return { matchedLabels, judge_receipt };
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
