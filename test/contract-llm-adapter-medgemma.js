/**
 * Contract test: the MedGemma alternative Step-4 generation backend
 * (MEDGEMMA-ADAPTER-PLAN). Mirrors contract-llm-adapter.js — proves the
 * MedGemma adapter carries the IDENTICAL bars to the Claude adapter.
 *
 * Proves:
 *  - PACKET-ONLY BAR (default-deny): a smuggled field outside the strict packet
 *    contract REFUSES generation before any transport (fetch) call.
 *  - MOCK BY DEFAULT: without HEYDOC_MEDGEMMA_LIVE + endpoint + key, generation
 *    is the deterministic mock draft audited mode:"mock" (never live).
 *  - FAIL-CLOSED: HTTP non-2xx, timeout (AbortError), safety finish_reason,
 *    empty output, and truncation (finish_reason=length) all → BLOCKED_NO_PROOF;
 *    the pipeline turns a block into continuation_blocked + an explicit blocked
 *    candidate — never fabricated.
 *  - AUDIT: backend:"medgemma" + model + prompt_sha256 + mode ride the result.
 *  - E2E: a clean grounded fake-live output passes the full composed gate; a
 *    dose-leaking fake-live output is BLOCKED by the detectors (same bar).
 *  - No forbidden surfaces (patient_eligible / scoring-store) in the adapter.
 *
 * Uses a fake fetch — no network, no live MedGemma endpoint.
 * Run from repo root: node test/contract-llm-adapter-medgemma.js
 */
import { generateCandidate, makeGenerator, isMedgemmaLiveEnabled, DEFAULT_MEDGEMMA_MODEL } from "../integration/llm-adapter-medgemma.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

/** A fake fetch scripting an OpenAI-compatible response + spying on the wire. */
function fakeFetch(scenario) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (scenario.throws) {
      const e = new Error(scenario.throws.message || "fetch failed");
      if (scenario.throws.name) e.name = scenario.throws.name;
      throw e;
    }
    return {
      ok: scenario.ok ?? true,
      status: scenario.status ?? 200,
      async json() {
        return scenario.body ?? {
          choices: [{ finish_reason: scenario.finish_reason ?? "stop", message: { content: scenario.text ?? "" } }],
        };
      },
    };
  };
  fn.calls = calls;
  return fn;
}

const CLEAN_TEXT =
  "Based on the provided context (citation: cw-au:imaging-lbp:2024-01), imaging is not recommended for non-specific low back pain without red flags. This is a provisional draft for clinician review. No diagnosis or dosages are given.";

// The adapter reads the key through the secrets seam on the live path.
process.env.HEYDOC_MEDGEMMA_ENDPOINT = "https://medgemma.endpoint.invalid/v1/chat/completions";
process.env.HEYDOC_MEDGEMMA_KEY = "test-medgemma-key";

try {
  const base = await runPipeline({});
  const packet = base.packet;

  // ── 1. Mock by default ─────────────────────────────────────────────────────
  const savedLive = process.env.HEYDOC_MEDGEMMA_LIVE;
  delete process.env.HEYDOC_MEDGEMMA_LIVE;
  check(isMedgemmaLiveEnabled() === false, "live must be OFF by default (flag unset)");
  const mock = await generateCandidate({ packet, trunk_id: "5.0" });
  check(mock.ok === true && mock.audit.mode === "mock" && mock.audit.backend === "medgemma",
    "default generation is the mock draft, audited backend:medgemma mode:mock");
  const mock2 = await generateCandidate({ packet, trunk_id: "5.0" });
  check(mock.candidate_output === mock2.candidate_output && mock.audit.prompt_sha256 === mock2.audit.prompt_sha256,
    "mock generation is deterministic");
  if (savedLive !== undefined) process.env.HEYDOC_MEDGEMMA_LIVE = savedLive;

  // Live flag but NO key → not enabled (fail toward mock, never a partial call).
  process.env.HEYDOC_MEDGEMMA_LIVE = "1";
  const savedKey = process.env.HEYDOC_MEDGEMMA_KEY;
  delete process.env.HEYDOC_MEDGEMMA_KEY;
  check(isMedgemmaLiveEnabled() === false, "live flag without a resolvable key must NOT enable live");
  process.env.HEYDOC_MEDGEMMA_KEY = savedKey;

  // ── 2. Packet-only bar (default-deny) ──────────────────────────────────────
  const spy = fakeFetch({ text: CLEAN_TEXT });
  const smuggled = { ...packet, _smuggled_raw_history: "MARKER-NEVER-SEND-45yo-flank-pain" };
  const refused = await generateCandidate({ packet: smuggled, trunk_id: "5.0" }, { fetchImpl: spy });
  check(refused.ok === false && refused.status === "BLOCKED_NO_PROOF" && spy.calls.length === 0,
    "PACKET-ONLY BAR: a field outside the strict packet contract must REFUSE before any fetch call");

  const spy2 = fakeFetch({ text: CLEAN_TEXT });
  const gen = await generateCandidate({ packet, trunk_id: "5.0" }, { fetchImpl: spy2 });
  check(gen.ok === true && spy2.calls.length === 1, "fake-live generation must call fetch once");
  const wire = JSON.stringify(spy2.calls[0]);
  check(!wire.includes("MARKER-NEVER-SEND"), "nothing outside the packet ever reaches the wire");
  check(wire.includes("cw-au:imaging-lbp:2024-01"), "the packet's receipt-backed evidence must reach the model");
  check(wire.includes("GROUNDING CONTRACT"), "the grounding preamble must ride the system message");
  check(spy2.calls[0].init.headers.authorization === "Bearer test-medgemma-key", "the endpoint key rides the Authorization header");
  check(gen.audit.backend === "medgemma" && gen.audit.mode === "live" && /^sha256:/.test(gen.audit.prompt_sha256) && typeof gen.audit.latency_ms === "number",
    "the live audit carries backend/mode/prompt hash/latency");

  const badPacket = await generateCandidate({ packet: { facts: "not-a-packet" }, trunk_id: "5.0" }, { fetchImpl: fakeFetch({ text: CLEAN_TEXT }) });
  check(badPacket.ok === false && badPacket.status === "BLOCKED_NO_PROOF", "an invalid packet refuses");
  const noPrompt = await generateCandidate({ packet, trunk_id: "99.0" }, { fetchImpl: fakeFetch({ text: CLEAN_TEXT }) });
  check(noPrompt.ok === false, "a trunk with no versioned prompt refuses (fail-closed)");

  // ── 3. Fail-closed transport outcomes ──────────────────────────────────────
  for (const [name, scenario] of [
    ["HTTP 500", { ok: false, status: 500 }],
    ["network error", { throws: { message: "ECONNRESET" } }],
    ["timeout", { throws: { name: "AbortError", message: "aborted" } }],
    ["safety finish", { finish_reason: "content_filter", text: "" }],
    ["empty output", { text: "   " }],
    ["truncation", { finish_reason: "length", text: "partial clinical draft that stops mid-" }],
  ]) {
    const out = await generateCandidate({ packet, trunk_id: "5.0" }, { fetchImpl: fakeFetch(scenario) });
    check(out.ok === false && out.status === "BLOCKED_NO_PROOF", `${name} must yield BLOCKED_NO_PROOF`);
  }

  // ── 4. Pipeline seam: generated clean output passes; blocked blocks ────────
  const okRun = await runPipeline({ generate_candidate: makeGenerator("5.0", { fetchImpl: fakeFetch({ text: CLEAN_TEXT }) }) });
  check(okRun.verification.pass === true && okRun.output === CLEAN_TEXT, "a clean grounded MedGemma draft passes the full gate");
  check(okRun.generation?.backend === "medgemma" && okRun.generation.mode === "live", "the MedGemma generation audit rides the result");

  const blockedRun = await runPipeline({ generate_candidate: makeGenerator("5.0", { fetchImpl: fakeFetch({ throws: { message: "timeout" } }) }) });
  check(blockedRun.continuation_blocked === true && /BLOCKED_NO_PROOF/.test(blockedRun.output),
    "a failed MedGemma generation blocks continuation with an explicit blocked candidate");

  const leaky = "Advisory draft: give amoxicillin 500 mg three times daily for this presentation.";
  const leakyRun = await runPipeline({ generate_candidate: makeGenerator("5.0", { fetchImpl: fakeFetch({ text: leaky }) }) });
  check(leakyRun.verification.pass === false, "a dose-leaking GENERATED MedGemma output must be blocked by the composed detectors");

  // ── 5. No forbidden surfaces ────────────────────────────────────────────────
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../integration/llm-adapter-medgemma.js", import.meta.url), "utf8");
  check(!/patient_eligible/.test(src), "the MedGemma adapter must not reference the patient-eligibility flag");
  check(!/10_ground_truth|11_symptom_links|12_management_plan|13_safety_netting|data[\/\\]cases/.test(src),
    "the MedGemma adapter must have no scoring-store read path");
} catch (e) {
  errors.push("unexpected throw: " + (e && e.stack ? e.stack : e));
} finally {
  delete process.env.HEYDOC_MEDGEMMA_ENDPOINT;
  delete process.env.HEYDOC_MEDGEMMA_KEY;
  delete process.env.HEYDOC_MEDGEMMA_LIVE;
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-llm-adapter-medgemma: OK");
