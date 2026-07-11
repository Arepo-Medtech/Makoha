/**
 * Contract test: the Step-4 live-LLM generation adapter (LIVE_PLAN L3, R-32)
 * and its pipeline seam.
 *
 * Proves:
 *  - PACKET-ONLY BAR: the transport receives EXACTLY the validated packet
 *    serialisation + the trunk system prompt — nothing else (a marker planted
 *    outside the packet never reaches the wire); an invalid packet refuses.
 *  - MOCK BY DEFAULT: without HEYDOC_LLM_LIVE + key, generation is the
 *    deterministic mock draft, audited mode:"mock" (never presented as live).
 *  - FAIL-CLOSED: transport error, safety refusal (stop_reason "refusal"),
 *    empty output, and truncation (max_tokens) all yield BLOCKED_NO_PROOF;
 *    live-enabled with no key yields BLOCKED (never a partial live call);
 *    the pipeline turns a blocked generation into continuation_blocked with
 *    an explicit blocked candidate — never a fabricated draft.
 *  - AUDIT: model id + prompt_sha256 + mode ride result.generation.
 *  - E2E: a clean grounded fake-live output passes the full gate; a
 *    dose-leaking fake-live output is BLOCKED by the composed detectors
 *    (the bar applies to generated text exactly as to stub text).
 *
 * Run from repo root: node test/contract-llm-adapter.js
 */
import { generateCandidate, makeGenerator, isLlmLiveEnabled, DEFAULT_LLM_MODEL } from "../integration/llm-adapter.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

/** A fake Anthropic client whose transport we can script + spy on. */
function fakeClient(scenario) {
  const calls = [];
  return {
    calls,
    messages: {
      async create(req) {
        calls.push(req);
        if (scenario.throws) throw new Error(scenario.throws);
        return {
          stop_reason: scenario.stop_reason ?? "end_turn",
          content: scenario.content ?? [{ type: "text", text: scenario.text ?? "" }],
        };
      },
    },
  };
}

const CLEAN_TEXT =
  "Based on the provided context (citation: cw-au:imaging-lbp:2024-01), imaging is not recommended for non-specific low back pain without red flags. This is a provisional draft for clinician review. No diagnosis or dosages are given.";

try {
  // Fixture packet: run the real pipeline once and reuse its sealed packet.
  const base = await runPipeline({});
  const packet = base.packet;

  // ── 1. Mock by default ─────────────────────────────────────────────────────
  delete process.env.HEYDOC_LLM_LIVE;
  check(isLlmLiveEnabled() === false, "live must be OFF by default");
  const mock = await generateCandidate({ packet, trunk_id: "5.0" });
  check(mock.ok === true && mock.audit.mode === "mock" && mock.audit.model === "mock-stub",
    "default generation is the mock draft, audited as mock (never presented as live)");
  const mock2 = await generateCandidate({ packet, trunk_id: "5.0" });
  check(mock.candidate_output === mock2.candidate_output && mock.audit.prompt_sha256 === mock2.audit.prompt_sha256,
    "mock generation is deterministic (same packet → same draft + prompt hash)");
  check(/No diagnosis or dosages/.test(mock.candidate_output), "the mock draft carries the fixed declarations");

  // Live flag WITHOUT a key: blocked, never a partial live call.
  process.env.HEYDOC_LLM_LIVE = "1";
  delete process.env.ANTHROPIC_API_KEY;
  check(isLlmLiveEnabled() === false, "live flag without a resolvable key must NOT enable live");
  delete process.env.HEYDOC_LLM_LIVE;

  // ── 2. Packet-only bar ─────────────────────────────────────────────────────
  // The packet contract is .strict(): smuggling ANY field outside it does not
  // get stripped — it REFUSES the whole generation before the transport is
  // touched (default-deny, the strongest form of the bar).
  const spySmuggle = fakeClient({ text: CLEAN_TEXT });
  const smuggled = { ...packet, _smuggled_raw_history: "MARKER-NEVER-SEND-45yo-flank-pain" };
  const refused = await generateCandidate({ packet: smuggled, trunk_id: "5.0" }, { client: spySmuggle });
  check(refused.ok === false && refused.status === "BLOCKED_NO_PROOF" && spySmuggle.calls.length === 0,
    "PACKET-ONLY BAR: a field outside the strict packet contract must REFUSE generation before any transport call");

  const spy = fakeClient({ text: CLEAN_TEXT });
  const gen = await generateCandidate({ packet, trunk_id: "5.0" }, { client: spy });
  check(gen.ok === true && spy.calls.length === 1, "fake-live generation must call the transport once");
  const wire = JSON.stringify(spy.calls[0]);
  check(!wire.includes("MARKER-NEVER-SEND"), "nothing outside the packet ever reaches the wire");
  check(wire.includes("cw-au:imaging-lbp:2024-01"), "the packet's receipt-backed evidence must reach the model");
  check(spy.calls[0].system.includes("GROUNDING CONTRACT"), "the grounding preamble must ride the system prompt");
  check(spy.calls[0].model === DEFAULT_LLM_MODEL, "the pinned default model is requested");
  check(spy.calls[0].thinking?.type === "adaptive", "adaptive thinking is requested");
  check(gen.audit.mode === "live" && /^sha256:/.test(gen.audit.prompt_sha256) && typeof gen.audit.latency_ms === "number",
    "the live audit must carry mode/model/prompt hash/latency");

  // Invalid packet refuses before any transport call.
  const spy2 = fakeClient({ text: CLEAN_TEXT });
  const bad = await generateCandidate({ packet: { facts: "not-a-packet" }, trunk_id: "5.0" }, { client: spy2 });
  check(bad.ok === false && bad.status === "BLOCKED_NO_PROOF" && spy2.calls.length === 0,
    "an invalid packet must refuse BEFORE the transport is touched");
  const noPrompt = await generateCandidate({ packet, trunk_id: "99.0" }, { client: fakeClient({ text: CLEAN_TEXT }) });
  check(noPrompt.ok === false, "a trunk with no versioned prompt file must refuse (fail-closed)");

  // ── 3. Fail-closed transport outcomes ──────────────────────────────────────
  for (const [name, scenario] of [
    ["API error", { throws: "connection reset" }],
    ["safety refusal", { stop_reason: "refusal", content: [] }],
    ["empty output", { text: "   " }],
    ["truncation", { stop_reason: "max_tokens", text: "partial clinical draft that stops mid-" }],
  ]) {
    const out = await generateCandidate({ packet, trunk_id: "5.0" }, { client: fakeClient(scenario) });
    check(out.ok === false && out.status === "BLOCKED_NO_PROOF",
      `${name} must yield BLOCKED_NO_PROOF (got ${JSON.stringify({ ok: out.ok, status: out.status })})`);
  }

  // ── 4. Pipeline seam: generated clean output passes; blocked blocks ────────
  const okRun = await runPipeline({ generate_candidate: makeGenerator("5.0", { client: fakeClient({ text: CLEAN_TEXT }) }) });
  check(okRun.verification.pass === true, "a clean grounded generated draft must pass the full composed gate");
  check(okRun.output === CLEAN_TEXT, "the generated text is the verified candidate (exact bytes)");
  check(okRun.generation?.ok === true && okRun.generation.mode === "live" && /^sha256:/.test(okRun.generation.prompt_sha256),
    "the generation audit must ride the pipeline result");
  check(okRun.continuation_blocked === false, "a successful generation does not block continuation");

  const blockedRun = await runPipeline({ generate_candidate: makeGenerator("5.0", { client: fakeClient({ throws: "timeout" }) }) });
  check(blockedRun.continuation_blocked === true, "a failed generation must BLOCK continuation (fail-closed)");
  check(/BLOCKED_NO_PROOF/.test(blockedRun.output) && /No diagnosis or dosages/.test(blockedRun.output),
    "the blocked candidate is an explicit blocked notice, never a fabricated draft");
  check(blockedRun.generation?.ok === false && blockedRun.generation.status === "BLOCKED_NO_PROOF",
    "the blocked generation audit rides the result");

  // The composed gate still bars a generated output that leaks a dose.
  const leaky = "Advisory draft: give amoxicillin 500 mg three times daily for this presentation.";
  const leakyRun = await runPipeline({ generate_candidate: makeGenerator("5.0", { client: fakeClient({ text: leaky }) }) });
  check(leakyRun.verification.pass === false, "a dose-leaking GENERATED output must be blocked by the composed detectors");

  // No hook, no caller text → the deterministic stub (status quo preserved).
  const statusQuo = await runPipeline({});
  check(statusQuo.generation === null && statusQuo.verification.pass === true,
    "without a generation hook the pipeline is byte-identical status quo (stub, generation null)");

  // ── 5. The adapter never references forbidden surfaces ─────────────────────
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../integration/llm-adapter.js", import.meta.url), "utf8");
  check(!/patient_eligible/.test(src), "the adapter must not reference the patient-eligibility flag");
  check(!/10_ground_truth|11_symptom_links|12_management_plan|13_safety_netting|data[\/\\]cases/.test(src),
    "the adapter must have no scoring-store read path");
} catch (e) {
  errors.push("unexpected throw: " + (e && e.stack ? e.stack : e));
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-llm-adapter: OK");
