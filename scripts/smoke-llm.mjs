#!/usr/bin/env node
/**
 * smoke-llm — one-command live-LLM smoke (LIVE_PLAN §9 A1; Option A).
 *
 * Runs ONE pipeline turn through the selected Step-4 generation backend
 * (Claude or MedGemma, per HEYDOC_LLM_BACKEND) and prints a readable result:
 * backend, mode (mock/live — never conflated), model, verification pass,
 * continuation-blocked, blocked reason, latency, prompt hash. SYNTHETIC ONLY:
 * it uses the pipeline's own stub packet (no real patient data), so it is safe
 * to run against the live API — it exercises the generation path, nothing more.
 *
 * The bars still hold: packet-only input, fail-closed BLOCKED_NO_PROOF, output
 * through the frozen verifier + detectors + PPP-TTT. This script never handles
 * a secret value (the adapter resolves the key via the fail-closed seam) and
 * never sets the patient-eligibility flag.
 *
 * Usage:
 *   npm run smoke:llm
 *   # live (staging): set HEYDOC_MODE_DEFAULT=staging HEYDOC_LLM_LIVE=1
 *   #   HEYDOC_LLM_KEY_REF=aws-sm:aws.sm/heydoc/anthropic.key (needs the aws-sm
 *   #   backend registered — see deploy/bootstrap.mjs) OR env:ANTHROPIC_API_KEY.
 *   # backend: HEYDOC_LLM_BACKEND=claude|medgemma
 * Exit 0 when the run completed and generation was NOT blocked; 1 otherwise.
 */
import { runPipeline } from "../verification/pipeline.js";
import { makeSelectedGenerator, resolveBackendName } from "../integration/generation-backend.js";

/**
 * Run one smoke turn. Pure enough to unit-test: pass a transport override
 * (client for Claude, fetchImpl for MedGemma) to exercise without the network.
 * @param {{ backend?: string, trunk?: string, user_input?: string, client?: object, fetchImpl?: Function }} [opts]
 */
export async function runSmoke(opts = {}) {
  const backend = opts.backend || resolveBackendName();
  const trunk = opts.trunk || "5.0";
  const generate = makeSelectedGenerator(trunk, opts); // routes client→claude, fetchImpl→medgemma
  const result = await runPipeline({
    user_input: opts.user_input || "Patient reports a mild sore throat for two days, no red flags.",
    trunk,
    generate_candidate: generate,
  });
  const gen = result.generation || {};
  return {
    backend,
    trunk,
    mode: gen.mode || "unknown",
    model: gen.model || "unknown",
    latency_ms: gen.latency_ms,
    prompt_sha256: gen.prompt_sha256,
    generation_ok: gen.ok === true,
    blocked_reason: gen.ok === false ? gen.reason : undefined,
    verification_pass: !!(result.verification && result.verification.pass),
    continuation_blocked: !!result.continuation_blocked,
    candidate_output_hash: result.verification && result.verification.candidate_output_hash,
    run_id: result.run_id,
  };
}

function render(r) {
  const live = r.mode === "live";
  const lines = [
    "",
    "Breath-Ezy LLM smoke",
    `  backend:        ${r.backend}`,
    `  mode:           ${r.mode}${live ? "" : "   ← MOCK (not a real API call)"}`,
    `  model:          ${r.model}`,
    ...(r.latency_ms !== undefined ? [`  latency_ms:     ${r.latency_ms}`] : []),
    `  prompt_sha256:  ${r.prompt_sha256}`,
    `  verification:   ${r.verification_pass ? "PASS" : "FAIL"}`,
    `  continuation:   ${r.continuation_blocked ? "BLOCKED" : "not blocked"}`,
    `  generation:     ${r.generation_ok ? "OK" : `BLOCKED_NO_PROOF — ${r.blocked_reason || "no candidate"}`}`,
    `  run_id:         ${r.run_id}`,
    "",
  ];
  if (!live) {
    lines.push(
      "NOTE: this was a MOCK run — no live model was called. To smoke the live API:",
      "  HEYDOC_MODE_DEFAULT=staging HEYDOC_LLM_LIVE=1 \\",
      "  HEYDOC_LLM_KEY_REF=aws-sm:aws.sm/heydoc/anthropic.key npm run smoke:llm",
      "  (aws-sm needs the backend registered — run via deploy/bootstrap.mjs — or use env:ANTHROPIC_API_KEY.)",
      ""
    );
  }
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await runSmoke();
  process.stdout.write(render(r) + "\n");
  // Success = the run completed and generation was not blocked.
  process.exit(r.generation_ok && r.verification_pass && !r.continuation_blocked ? 0 : 1);
}
