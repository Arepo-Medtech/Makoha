/**
 * llm-adapter-medgemma — MedGemma as an ALTERNATIVE Step-4 generation backend
 * (MEDGEMMA-ADAPTER-PLAN; sibling of integration/llm-adapter.js / LIVE_PLAN L3).
 *
 * SAME CONTRACT, SAME BARS as the Claude adapter — the pipeline's Step-4 hook
 * cannot tell them apart:
 *   generateCandidate({ packet, trunk_id }, opts?) -> { ok, candidate_output?,
 *                                                       status?, reason?, audit }
 *
 * THE PACKET-ONLY BAR (trust boundary 1, mechanical + default-deny): generation
 * sees ONLY the validated ContextPacket. generateCandidate() re-gates through
 * the strict validateContextPacket zod contract and serialises EXACTLY that
 * parsed object — a field outside the contract REFUSES generation before any
 * transport call. No case content, raw patient data, scoring material, or
 * parametric side-channel can ride along.
 *
 * FIRST-PARTY CLEAN-ROOM (harvest discipline): NO Google code and NO model
 * weights are in this repo. This is a plain HTTPS client (record-sources /
 * fhir-broker/live-backend precedent) that POSTs to a deploy-chosen MedGemma
 * endpoint. Endpoint-agnostic: it speaks an OpenAI-compatible chat-completions
 * shape (the common vLLM/TGI/HF serving contract); a Vertex-native shape is a
 * deploy-time adapter concern confirmed at staging connect. Licence: MedGemma
 * ships under the Health AI Developer Foundations terms (NOT OSI open-source);
 * clinician-attested cleared for use here (Decision B, attested_by KL
 * 2026-07-11) — recorded in the harvest manifest + register, NOT decided here.
 *
 * FAIL-CLOSED (never fabricate): invalid packet, missing endpoint/key,
 * live-without-config, HTTP non-2xx, timeout, safety/refusal finish signal,
 * empty output, truncation → { ok:false, status:"BLOCKED_NO_PROOF" }. The
 * pipeline turns that into a blocked run; a missing generation is a blocked
 * status, never an invented one. One bounded HTTP call — never loops.
 *
 * MOCK BY DEFAULT (rollback intact): live runs ONLY when HEYDOC_MEDGEMMA_LIVE
 * is enabled AND an endpoint is set AND the key resolves through the
 * fail-closed secrets seam. Otherwise the deterministic mock draft, audited
 * mode:"mock" — mock is never presented as live.
 *
 * SAME DOWNSTREAM GATE: MedGemma output flows to the frozen verifier +
 * detectors + PPP-TTT exactly like any candidate — it cannot mint codes/doses/
 * facts, never sets the patient-eligibility flag, and a dose-leaking draft is
 * blocked by the composed detectors. Imaging/DICOM is OUT of scope (the packet
 * carries no images; feeding one would breach the packet-only bar).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContextPacket } from "../verification/pipeline-schemas.js";
import { sha256Prefixed } from "../verification/hash.js";
import { getSecret, hasSecret } from "./secrets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "trunk", "prompts");

/** Pinned default served model id (override via HEYDOC_MEDGEMMA_MODEL). */
export const DEFAULT_MEDGEMMA_MODEL = "medgemma-1.5-4b-it";
/** Secrets-seam ref for the endpoint key (override via HEYDOC_MEDGEMMA_KEY_REF). */
export const DEFAULT_MEDGEMMA_KEY_REF = "env:HEYDOC_MEDGEMMA_KEY";

/** Same grounding preamble contract as the Claude adapter (defence in depth;
 *  the mechanical bars are the packet re-gate + the verifier downstream). */
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

function endpoint() {
  return String(process.env.HEYDOC_MEDGEMMA_ENDPOINT || "").trim();
}

/** Live enabled AND endpoint set AND key resolvable — all three required. */
export function isMedgemmaLiveEnabled() {
  const flag = String(process.env.HEYDOC_MEDGEMMA_LIVE || "").trim().toLowerCase();
  const on = flag === "1" || flag === "true" || flag === "on";
  return on && !!endpoint() && hasSecret(process.env.HEYDOC_MEDGEMMA_KEY_REF || DEFAULT_MEDGEMMA_KEY_REF);
}

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

const blocked = (reason, audit) => ({ ok: false, status: "BLOCKED_NO_PROOF", reason, audit });

/**
 * Step-4 generation over ONE validated ContextPacket via a MedGemma endpoint.
 * Cannot throw.
 *
 * @param {{ packet: object, trunk_id: string }} args
 * @param {{ fetchImpl?: Function }} [opts] - transport override (contract tests);
 *   its presence forces the live path with the supplied fetch.
 * @returns {Promise<{ ok:boolean, candidate_output?:string, status?:string, reason?:string,
 *   audit:{ backend:"medgemma", mode:"mock"|"live", model:string, prompt_sha256:string, latency_ms?:number } }>}
 */
export async function generateCandidate({ packet, trunk_id }, opts = {}) {
  const model = process.env.HEYDOC_MEDGEMMA_MODEL || DEFAULT_MEDGEMMA_MODEL;
  const auditBase = { backend: "medgemma", model };
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
      { ...auditBase, mode: "mock", prompt_sha256: sha256Prefixed("(unbuilt)") }
    );
  }

  const live = opts.fetchImpl !== undefined || isMedgemmaLiveEnabled();
  if (!live) {
    return { ok: true, candidate_output: mockDraft(gated), audit: { ...auditBase, model: "mock-stub", mode: "mock", prompt_sha256 } };
  }

  const doFetch = opts.fetchImpl || globalThis.fetch;
  const url = endpoint();
  const audit = { ...auditBase, mode: "live", prompt_sha256 };
  if (!url) return blocked("generation refused: HEYDOC_MEDGEMMA_ENDPOINT is not set", audit);

  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = Number(process.env.HEYDOC_MEDGEMMA_TIMEOUT_MS || 60_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const key = getSecret(process.env.HEYDOC_MEDGEMMA_KEY_REF || DEFAULT_MEDGEMMA_KEY_REF);
    const res = await doFetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      // OpenAI-compatible chat-completions shape (vLLM/TGI/HF serving). The
      // packet is the ONLY user content; the trunk prompt + preamble is system.
      body: JSON.stringify({
        model,
        max_tokens: Number(process.env.HEYDOC_MEDGEMMA_MAX_TOKENS || 8192),
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
    });
    audit.latency_ms = Date.now() - started;

    if (!res.ok) return blocked(`generation failed: MedGemma endpoint returned HTTP ${res.status}`, audit);
    const data = await res.json();
    const choice = (data && Array.isArray(data.choices) && data.choices[0]) || null;
    const finish = choice && (choice.finish_reason || choice.finishReason);
    // A safety/content-filter stop is a BLOCKED outcome, never an empty answer.
    if (finish === "content_filter" || finish === "refusal" || finish === "safety") {
      return blocked(`generation refused by MedGemma safety filter (finish_reason=${finish}) — escalate to clinician`, audit);
    }
    const text = (choice && choice.message && typeof choice.message.content === "string" ? choice.message.content : "").trim();
    if (!text) return blocked("generation returned no text — blocked, never fabricated", audit);
    if (finish === "length") {
      return blocked("generation truncated (finish_reason=length) — blocked (raise HEYDOC_MEDGEMMA_MAX_TOKENS)", audit);
    }
    return { ok: true, candidate_output: text, audit };
  } catch (err) {
    const reason = err && err.name === "AbortError"
      ? `generation timed out after ${timeoutMs}ms — blocked`
      : `generation failed: ${err && err.message ? err.message.slice(0, 200) : "unknown error"}`;
    audit.latency_ms = Date.now() - started;
    return blocked(reason, audit);
  } finally {
    clearTimeout(timer);
  }
}

/** Pipeline hook factory (same signature as the Claude adapter's). */
export function makeGenerator(trunkId, opts = {}) {
  return (packet) => generateCandidate({ packet, trunk_id: trunkId }, opts);
}
