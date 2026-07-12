/**
 * llm-adapter — the gated live-LLM generation client for pipeline Step 4
 * (LIVE_PLAN L3, R-32). The model finally enters the loop — behind bars.
 *
 * THE PACKET-ONLY BAR (trust boundary 1, mechanical): generation sees ONLY the
 * validated ContextPacket. generateCandidate() re-gates the packet through the
 * same zod contract the pipeline uses (validateContextPacket) and serialises
 * EXACTLY that parsed object into the user message — no case content, no raw
 * patient data, no scoring material, no parametric side-channel can ride
 * along, because nothing else is accepted or read. The system prompt is the
 * trunk's versioned prompt file plus a fixed grounding preamble.
 *
 * FAIL-CLOSED (never fabricate): any failure — packet invalid, live mode
 * without a key, API error/timeout, safety refusal (stop_reason "refusal"),
 * empty output — returns { ok:false, status:"BLOCKED_NO_PROOF", reason }.
 * The pipeline turns that into a blocked run; a missing generation is a
 * blocked status, never a degraded or invented one. The SDK's built-in
 * retries (2x on 429/5xx) are the only retries; the adapter never loops.
 *
 * MOCK BY DEFAULT (rollback intact): live generation runs ONLY when
 * HEYDOC_LLM_LIVE is enabled AND the API key resolves through the fail-closed
 * secrets seam (integration/secrets.js — placeholders refuse). Otherwise the
 * adapter returns the deterministic mock draft, and its audit record says
 * mode:"mock" — mock is never presented as live.
 *
 * MEDICOLEGAL AUDIT: every call returns { model, prompt_sha256, mode,
 * latency_ms } — the prompt hash + model id ride the pipeline result's audit
 *
 * channel so any generated output can later be tied to exactly what the model
 * was shown (reproducibility, same discipline as candidate_output_hash).
 *
 * What the adapter NEVER does: mint codes/doses/facts (the frozen verifier +
 * detectors still gate every output downstream), set the patient-eligibility
 * flag, read scoring nodes, or bypass a pipeline step.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContextPacket } from "../verification/pipeline-schemas.js";
import { sha256Prefixed } from "../verification/hash.js";
import { getSecret, hasSecret } from "./secrets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "trunk", "prompts");

/** Pinned default model (operator selection 2026-07-11; override via
 *  HEYDOC_LLM_MODEL). Claude Sonnet 5 — near-Opus quality on the short,
 *  structured clinical drafts the trunks produce, at Sonnet cost. Same request
 *  surface the adapter already uses: adaptive thinking, no sampling params. */
export const DEFAULT_LLM_MODEL = "claude-sonnet-5";
/** Secrets-seam ref for the API key (override via HEYDOC_LLM_KEY_REF). */
export const DEFAULT_KEY_REF = "env:ANTHROPIC_API_KEY";

/** Grounding preamble appended to every trunk system prompt — restates the
 *  packet-only contract IN the prompt (defence in depth; the mechanical bars
 *  are the packet re-gate here and the verifier downstream). */
const GROUNDING_PREAMBLE = `
--- GROUNDING CONTRACT (mechanically enforced downstream) ---
You will receive ONE JSON ContextPacket. It is your ONLY source of facts.
- Use only the facts, evidence, receipts, and constraints in the packet.
- Never state a clinical code, dose, lab value, guideline, identity, or
  operational fact that is not receipt-backed in the packet.
- If the packet lacks the proof a claim needs, say the item is blocked
  pending proof (BLOCKED_NO_PROOF) instead of supplying the claim.
- Your output is a provisional draft for a clinician to review: no diagnosis,
  no dosages, no decisions. Every output is verified and hashed after you.`;

/** Is live generation enabled AND actually credentialed? Both must hold. */
export function isLlmLiveEnabled() {
  const flag = String(process.env.HEYDOC_LLM_LIVE || "").trim().toLowerCase();
  const on = flag === "1" || flag === "true" || flag === "on";
  return on && hasSecret(process.env.HEYDOC_LLM_KEY_REF || DEFAULT_KEY_REF);
}

/** Load a trunk's versioned system prompt (fail-closed: absent → throws,
 *  which generateCandidate converts to BLOCKED_NO_PROOF). */
function trunkSystemPrompt(trunkId) {
  const p = join(PROMPTS_DIR, `trunk-${trunkId}-system.md`);
  if (!existsSync(p)) throw new Error(`no trunk prompt for "${trunkId}" (${p})`);
  return readFileSync(p, "utf8");
}

/** Deterministic JSON (sorted keys) — the exact bytes the model is shown. */
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

/** Deterministic mock draft — grounded in the packet, never presented as live. */
function mockDraft(packet) {
  const citation = (packet.evidence || []).flatMap((e) => e.supports || []).find((s) => s.kind === "static_doc");
  return (
    `Based on the provided context${citation ? ` (citation: ${citation.ref})` : ""}, ` +
    `this provisional draft is limited to the packet's receipt-backed facts and awaits clinician review. ` +
    `No diagnosis or dosages are given.`
  );
}

let liveClient = null;
async function getClient() {
  if (liveClient) return liveClient;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  liveClient = new Anthropic({
    apiKey: getSecret(process.env.HEYDOC_LLM_KEY_REF || DEFAULT_KEY_REF),
    timeout: Number(process.env.HEYDOC_LLM_TIMEOUT_MS || 60_000), // ms; fail-closed on expiry
    // SDK default retries (2x on 429/5xx) are the only retries — never loop here.
  });
  return liveClient;
}

const blocked = (reason, audit) => ({ ok: false, status: "BLOCKED_NO_PROOF", reason, audit });

/**
 * Step-4 generation over ONE validated ContextPacket. Cannot throw.
 *
 * @param {{ packet: object, trunk_id: string }} args
 * @param {{ client?: object }} [opts] - transport override (contract tests)
 * @returns {Promise<{ ok: boolean, candidate_output?: string, status?: string, reason?: string,
 *                     audit: { mode: "mock"|"live", model: string, prompt_sha256: string, latency_ms?: number } }>}
 */
export async function generateCandidate({ packet, trunk_id }, opts = {}) {
  const model = process.env.HEYDOC_LLM_MODEL || DEFAULT_LLM_MODEL;
  let gated, system, userContent, prompt_sha256;
  try {
    // THE BAR: re-gate the packet; serialise exactly the parsed object.
    gated = validateContextPacket(packet);
    system = trunkSystemPrompt(trunk_id) + "\n" + GROUNDING_PREAMBLE;
    userContent = canonical(gated);
    prompt_sha256 = sha256Prefixed(system + "\n" + userContent);
  } catch (err) {
    return blocked(
      `generation refused: invalid packet or trunk prompt — ${err && err.message ? err.message.slice(0, 200) : "unknown"}`,
      { mode: "mock", model, prompt_sha256: sha256Prefixed("(unbuilt)") }
    );
  }

  const live = opts.client !== undefined || isLlmLiveEnabled();
  if (!live) {
    return {
      ok: true,
      candidate_output: mockDraft(gated),
      audit: { mode: "mock", model: "mock-stub", prompt_sha256 },
    };
  }

  const started = Date.now();
  try {
    const client = opts.client || (await getClient());
    const response = await client.messages.create({
      model,
      max_tokens: Number(process.env.HEYDOC_LLM_MAX_TOKENS || 8192), // trunk contracts are deliberately short structured drafts
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: userContent }],
    });
    const audit = { mode: "live", model, prompt_sha256, latency_ms: Date.now() - started };

    // Safety refusal is a BLOCKED outcome, never an empty answer to paper over.
    if (response.stop_reason === "refusal") {
      return blocked("generation refused by model safety classifiers (stop_reason=refusal) — escalate to clinician", audit);
    }
    const text = (response.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return blocked("generation returned no text — blocked, never fabricated", audit);
    if (response.stop_reason === "max_tokens") {
      // A truncated clinical draft is not a reviewable draft.
      return blocked("generation truncated at max_tokens — blocked (raise HEYDOC_LLM_MAX_TOKENS)", audit);
    }
    return { ok: true, candidate_output: text, audit };
  } catch (err) {
    return blocked(
      `generation failed: ${err && err.message ? err.message.slice(0, 200) : "unknown error"}`,
      { mode: "live", model, prompt_sha256, latency_ms: Date.now() - started }
    );
  }
}

/**
 * Pipeline hook factory: runPipeline({ generate_candidate: makeGenerator("5.0") }).
 * The returned function receives ONLY the validated packet (the pipeline's
 * calling convention enforces the bar at the call site too).
 */
export function makeGenerator(trunkId, opts = {}) {
  return (packet) => generateCandidate({ packet, trunk_id: trunkId }, opts);
}

/** Test helper: drop the memoised live client (key/env changes). */
export function resetLlmClient() {
  liveClient = null;
}
