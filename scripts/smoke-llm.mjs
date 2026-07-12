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
 *   #
 *   # SECRET FORMAT: store the AWS secret as a PLAINTEXT key. If it is a JSON
 *   # object (the console "key/value" default), the aws-sm backend auto-extracts
 *   # a SINGLE-key object; for a multi-key object select the field explicitly:
 *   #   HEYDOC_LLM_KEY_REF=aws-sm:aws.sm/heydoc/anthropic.key#ANTHROPIC_API_KEY
 *
 *   # validate the PRODUCTION aws-sm key path from a standalone host (needs the
 *   # instance role/creds + `npm install @aws-sdk/client-secrets-manager`):
 *   #   HEYDOC_AWS_SECRET_NAMES=aws.sm/heydoc/anthropic.key \
 *   #   HEYDOC_LLM_KEY_REF=aws-sm:aws.sm/heydoc/anthropic.key \
 *   #   HEYDOC_MODE_DEFAULT=staging HEYDOC_LLM_LIVE=1 npm run smoke:llm
 *   # (Opt-in: when HEYDOC_AWS_SECRET_NAMES is set the smoke registers the
 *   #  aws-sm backend at start — same fetch-at-boot the deployed container does
 *   #  via deploy/bootstrap.mjs. Fail-closed: a fetch/IAM/SDK failure throws;
 *   #  it never silently falls back to a mock run.)
 * Exit 0 when the run completed and generation was NOT blocked; 1 otherwise.
 */
import { runPipeline } from "../verification/pipeline.js";
import { makeSelectedGenerator, resolveBackendName } from "../integration/generation-backend.js";

/**
 * Run one smoke turn. Pure enough to unit-test: pass a transport override
 * (client for Claude, fetchImpl for MedGemma) to exercise without the network,
 * or awsFetchSecret to exercise the aws-sm registration without AWS.
 * @param {{ backend?: string, trunk?: string, user_input?: string, client?: object, fetchImpl?: Function, awsFetchSecret?: Function }} [opts]
 */
export async function runSmoke(opts = {}) {
  // Opt-in aws-sm registration (LIVE_PLAN §9 A1): resolve an aws-sm:<SecretId>
  // key ref for a standalone smoke. Fail-closed — registration throws on a
  // missing/empty secret, absent SDK, or IAM denial; never a silent mock.
  if (process.env.HEYDOC_AWS_SECRET_NAMES) {
    const { registerAwsSecretsManager } = await import("../integration/secrets-backends/aws-secrets-manager.js");
    const secretNames = String(process.env.HEYDOC_AWS_SECRET_NAMES).split(",").map((s) => s.trim()).filter(Boolean);
    await registerAwsSecretsManager({
      region: process.env.AWS_REGION || "ap-southeast-2",
      secretNames,
      ...(opts.awsFetchSecret ? { fetchSecret: opts.awsFetchSecret } : {}),
    });
  }

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
      "  HEYDOC_LLM_KEY_REF=env:ANTHROPIC_API_KEY npm run smoke:llm",
      "  # ...or the production aws-sm path (needs @aws-sdk/client-secrets-manager + the role):",
      "  HEYDOC_AWS_SECRET_NAMES=aws.sm/heydoc/anthropic.key \\",
      "  HEYDOC_LLM_KEY_REF=aws-sm:aws.sm/heydoc/anthropic.key \\",
      "  HEYDOC_MODE_DEFAULT=staging HEYDOC_LLM_LIVE=1 npm run smoke:llm",
      ""
    );
  }
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let r;
  try {
    r = await runSmoke();
  } catch (err) {
    // Fail-closed: an aws-sm registration failure (missing/empty secret, absent
    // SDK, IAM denial) surfaces here — NEVER a silent mock fallback.
    const msg = err && err.message ? err.message : String(err);
    process.stderr.write(`\nsmoke:llm could not start: ${msg}\n`);
    if (/@aws-sdk\/client-secrets-manager/.test(msg)) {
      process.stderr.write("  → on this host: npm install @aws-sdk/client-secrets-manager\n");
    } else if (/aws-sm|SecretString|GetSecretValue/i.test(msg)) {
      process.stderr.write("  → check HEYDOC_AWS_SECRET_NAMES / AWS_REGION and the role's secretsmanager:GetSecretValue on the secret.\n");
    }
    process.stderr.write("\n");
    process.exit(2);
  }
  process.stdout.write(render(r) + "\n");
  // Success = the run completed and generation was not blocked.
  process.exit(r.generation_ok && r.verification_pass && !r.continuation_blocked ? 0 : 1);
}
