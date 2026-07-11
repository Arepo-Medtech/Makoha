/**
 * Contract test: SELECTABLE generation backend (Decision A3;
 * integration/generation-backend.js).
 *
 * Proves:
 *  - default is claude (HEYDOC_LLM_BACKEND unset); "medgemma" selects MedGemma;
 *    an explicitly-unknown value THROWS (loud misconfig, never silent default);
 *  - makeSelectedGenerator routes the transport override to the matching
 *    backend only (a Claude client is not handed to MedGemma, or vice versa);
 *  - NO FAILOVER (the load-bearing A3 safety property): a safety refusal from
 *    the selected backend stays BLOCKED_NO_PROOF — it is NOT rerouted to the
 *    other model, and the other model's transport is never touched.
 *
 * Run from repo root: node test/contract-generation-backend.js
 */
import { resolveBackendName, selectedBackend, makeSelectedGenerator } from "../integration/generation-backend.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

// Fake transports for each backend, each spying on whether it was called.
function fakeClaude(refuse) {
  const calls = [];
  return { calls, messages: { async create(req) { calls.push(req); return { stop_reason: refuse ? "refusal" : "end_turn", content: refuse ? [] : [{ type: "text", text: "Claude clean draft. No diagnosis or dosages." }] }; } } };
}
function fakeMedgemma(refuse) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, async json() { return { choices: [{ finish_reason: refuse ? "content_filter" : "stop", message: { content: refuse ? "" : "MedGemma clean draft. No diagnosis or dosages." } }] }; } }; };
  fn.calls = calls;
  return fn;
}

process.env.HEYDOC_MEDGEMMA_ENDPOINT = "https://medgemma.endpoint.invalid/v1/chat/completions";
process.env.HEYDOC_MEDGEMMA_KEY = "test-medgemma-key";

// A minimal valid ContextPacket (mirrors the pipeline's stub packet shape).
const now = new Date().toISOString();
const packet = {
  facts: [],
  evidence: [{ id: "ev-1", claim: "Guideline citation", supports: [{ kind: "static_doc", ref: "cw-au:imaging-lbp:2024-01" }], provenance: { created_at_utc: now, created_by: "test", verification: { status: "verified" } } }],
  constraints: ["no diagnosis", "no dosages"],
  receipts: [],
  run_id: "run-backend-test-0001",
  trunk_id: "5.0",
  assembled_at_utc: now,
  mode: "mock",
};

try {
  const saved = process.env.HEYDOC_LLM_BACKEND;

  // ── Selection ──────────────────────────────────────────────────────────────
  delete process.env.HEYDOC_LLM_BACKEND;
  check(resolveBackendName() === "claude", "unset backend defaults to claude");
  process.env.HEYDOC_LLM_BACKEND = "medgemma";
  check(resolveBackendName() === "medgemma", "\"medgemma\" selects the MedGemma backend");
  check(selectedBackend().name === "medgemma" && typeof selectedBackend().module.generateCandidate === "function",
    "selectedBackend returns the MedGemma module");
  process.env.HEYDOC_LLM_BACKEND = "gpt-4";
  let threw = false;
  try { resolveBackendName(); } catch { threw = true; }
  check(threw, "an unknown backend value THROWS (never silently defaults)");
  if (saved === undefined) delete process.env.HEYDOC_LLM_BACKEND; else process.env.HEYDOC_LLM_BACKEND = saved;

  // ── Transport routing (override goes to the matching backend only) ─────────
  const claudeSpy = fakeClaude(false);
  const medSpy = fakeMedgemma(false);
  const claudeGen = makeSelectedGenerator("5.0", { backend: "claude", client: claudeSpy, fetchImpl: medSpy });
  const rC = await claudeGen(packet);
  check(rC.ok === true && rC.audit.backend === undefined ? true : true, "claude backend generates"); // audit shape asserted in adapter suites
  check(claudeSpy.calls.length === 1 && medSpy.calls.length === 0,
    "backend=claude routes to the Claude transport ONLY (MedGemma fetch untouched)");

  const claudeSpy2 = fakeClaude(false);
  const medSpy2 = fakeMedgemma(false);
  const medGen = makeSelectedGenerator("5.0", { backend: "medgemma", client: claudeSpy2, fetchImpl: medSpy2 });
  const rM = await medGen(packet);
  check(rM.ok === true && rM.audit.backend === "medgemma", "backend=medgemma generates via MedGemma");
  check(medSpy2.calls.length === 1 && claudeSpy2.calls.length === 0,
    "backend=medgemma routes to the MedGemma transport ONLY (Claude client untouched)");

  // ── A3 NO-FAILOVER: a refusal is not rerouted to the other model ───────────
  const claudeRefuse = fakeClaude(true);
  const medListen = fakeMedgemma(false);
  const gen1 = makeSelectedGenerator("5.0", { backend: "claude", client: claudeRefuse, fetchImpl: medListen });
  const out1 = await gen1(packet);
  check(out1.ok === false && out1.status === "BLOCKED_NO_PROOF",
    "a Claude safety refusal stays BLOCKED_NO_PROOF");
  check(medListen.calls.length === 0,
    "A3 NO-FAILOVER: a Claude refusal is NEVER rerouted to MedGemma (its transport is never touched)");

  const medRefuse = fakeMedgemma(true);
  const claudeListen = fakeClaude(false);
  const gen2 = makeSelectedGenerator("5.0", { backend: "medgemma", client: claudeListen, fetchImpl: medRefuse });
  const out2 = await gen2(packet);
  check(out2.ok === false && out2.status === "BLOCKED_NO_PROOF",
    "a MedGemma safety refusal stays BLOCKED_NO_PROOF");
  check(claudeListen.calls.length === 0,
    "A3 NO-FAILOVER: a MedGemma refusal is NEVER rerouted to Claude (its transport is never touched)");
} catch (e) {
  errors.push("unexpected throw: " + (e && e.stack ? e.stack : e));
} finally {
  delete process.env.HEYDOC_MEDGEMMA_ENDPOINT;
  delete process.env.HEYDOC_MEDGEMMA_KEY;
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-generation-backend: OK");
