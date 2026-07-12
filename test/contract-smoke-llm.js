/**
 * Contract test: the live-LLM smoke runner (LIVE_PLAN §9 A1; scripts/smoke-llm.mjs).
 * Exercises the smoke logic with injected transports — no network, no key.
 *
 * Run from repo root: node test/contract-smoke-llm.js
 */
import { runSmoke } from "../scripts/smoke-llm.mjs";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

function fakeClaude(scenario) {
  return { messages: { async create() { if (scenario.throws) throw new Error(scenario.throws); return { stop_reason: scenario.stop_reason ?? "end_turn", content: scenario.content ?? [{ type: "text", text: scenario.text ?? "" }] }; } } };
}
function fakeMedgemma(scenario) {
  return async () => ({ ok: scenario.ok ?? true, status: scenario.status ?? 200, async json() { return { choices: [{ finish_reason: scenario.finish_reason ?? "stop", message: { content: scenario.text ?? "" } }] }; } });
}
const CLEAN = "Based on the provided context (citation: cw-au:imaging-lbp:2024-01), a provisional draft for clinician review. No diagnosis or dosages are given.";

try {
  // ── Mock by default (what CI runs) — no live, deterministic mock draft ──────
  delete process.env.HEYDOC_LLM_BACKEND;
  delete process.env.HEYDOC_LLM_LIVE;
  const mock = await runSmoke();
  check(mock.backend === "claude" && mock.mode === "mock" && mock.model === "mock-stub", "default smoke is a mock Claude run");
  check(mock.generation_ok === true && mock.verification_pass === true && mock.continuation_blocked === false, "mock smoke completes clean");
  check(/^sha256:/.test(mock.prompt_sha256) && typeof mock.run_id === "string", "smoke reports the prompt hash + run id");

  // ── Injected live SUCCESS (Claude) — model followed the Sonnet-5 default ────
  const okC = await runSmoke({ backend: "claude", client: fakeClaude({ text: CLEAN }) });
  check(okC.mode === "live" && okC.model === "claude-sonnet-5" && okC.generation_ok === true && okC.verification_pass === true,
    "injected live Claude success → mode live, model claude-sonnet-5, verification PASS");
  check(typeof okC.latency_ms === "number", "a live smoke reports latency");

  // ── Injected BLOCKED (Claude timeout) — surfaced, not fabricated ────────────
  const blkC = await runSmoke({ backend: "claude", client: fakeClaude({ throws: "timeout" }) });
  check(blkC.generation_ok === false && blkC.continuation_blocked === true && /timed out|timeout|failed/i.test(blkC.blocked_reason || ""),
    "a blocked live generation is surfaced (generation_ok false + reason), continuation blocked");

  // ── Injected live SUCCESS (MedGemma backend) ────────────────────────────────
  process.env.HEYDOC_MEDGEMMA_ENDPOINT = "https://medgemma.endpoint.invalid/v1/chat/completions";
  process.env.HEYDOC_MEDGEMMA_KEY = "test-key";
  const okM = await runSmoke({ backend: "medgemma", fetchImpl: fakeMedgemma({ text: CLEAN }) });
  check(okM.backend === "medgemma" && okM.mode === "live" && okM.generation_ok === true, "injected live MedGemma success → backend medgemma, mode live");
  delete process.env.HEYDOC_MEDGEMMA_ENDPOINT;
  delete process.env.HEYDOC_MEDGEMMA_KEY;

  // ── A dose-leaking generated output is still blocked by the composed gate ───
  const leaky = await runSmoke({ backend: "claude", client: fakeClaude({ text: "Advisory: give amoxicillin 500 mg three times daily." }) });
  check(leaky.verification_pass === false, "a dose-leaking generated draft fails the composed gate (bars hold in the smoke too)");

  // ── The script never references forbidden surfaces ──────────────────────────
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../scripts/smoke-llm.mjs", import.meta.url), "utf8");
  check(!/patient_eligible/.test(src), "the smoke script must not reference the patient-eligibility flag");
} catch (e) {
  errors.push("unexpected throw: " + (e && e.stack ? e.stack : e));
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-smoke-llm: OK");
