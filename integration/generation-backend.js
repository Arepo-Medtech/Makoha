/**
 * generation-backend — SELECTABLE Step-4 generation backend (Decision A3).
 *
 * The pipeline's Step-4 hook takes one generator. This module picks WHICH
 * backend implements it — Claude (LIVE_PLAN L3) or MedGemma
 * (MEDGEMMA-ADAPTER-PLAN) — from HEYDOC_LLM_BACKEND. Both backends expose the
 * identical generateCandidate/makeGenerator contract and are subject to the
 * identical bars (packet-only input, fail-closed BLOCKED_NO_PROOF, mock by
 * default, output → the frozen verifier + detectors + PPP-TTT).
 *
 * DECISION A3 — SELECTABLE ONLY, NO FAILOVER: exactly one backend serves a
 * run. There is deliberately NO automatic model-to-model failover. In
 * particular a safety refusal from the selected backend stays
 * BLOCKED_NO_PROOF and escalates to a clinician — it is NEVER rerouted to the
 * other model to "get an answer anyway" (that would route around a safety
 * signal). The absence of failover code IS that guarantee.
 *
 * Config: HEYDOC_LLM_BACKEND ∈ { "claude" (default when unset), "medgemma" }.
 * An explicitly-unknown value THROWS at selection time — a misconfigured
 * deployment fails loud at construction, never silently defaults to a model
 * the operator did not choose.
 */
import * as claude from "./llm-adapter.js";
import * as medgemma from "./llm-adapter-medgemma.js";

const BACKENDS = { claude, medgemma };

/** Resolve the selected backend name. Unset ⇒ "claude" (documented default);
 *  an explicit unrecognised value throws (loud misconfig). */
export function resolveBackendName() {
  const raw = process.env.HEYDOC_LLM_BACKEND;
  if (raw === undefined || String(raw).trim() === "") return "claude";
  const name = String(raw).trim().toLowerCase();
  if (!BACKENDS[name]) {
    throw new Error(`HEYDOC_LLM_BACKEND="${raw}" is not a known generation backend (expected "claude" or "medgemma")`);
  }
  return name;
}

/** The selected backend module (its generateCandidate/makeGenerator/is*LiveEnabled). */
export function selectedBackend(nameOverride) {
  const name = nameOverride || resolveBackendName();
  const mod = BACKENDS[name];
  if (!mod) throw new Error(`unknown generation backend "${name}"`);
  return { name, module: mod };
}

/**
 * Build the Step-4 generator for the selected backend. Pass to
 * runPipeline({ generate_candidate: makeSelectedGenerator(trunkId, opts) }).
 *
 * @param {string} trunkId
 * @param {{ backend?: "claude"|"medgemma", client?: object, fetchImpl?: Function }} [opts]
 *   backend overrides HEYDOC_LLM_BACKEND (tests / explicit callers); client is
 *   the Claude transport override, fetchImpl the MedGemma transport override.
 * @returns {(packet: object) => Promise<object>} the packet-only generator
 */
export function makeSelectedGenerator(trunkId, opts = {}) {
  const { name, module: mod } = selectedBackend(opts.backend);
  // Pass only the transport override that belongs to the chosen backend, so a
  // caller can't accidentally hand a Claude client to MedGemma or vice versa.
  const backendOpts = name === "claude"
    ? (opts.client !== undefined ? { client: opts.client } : {})
    : (opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {});
  return mod.makeGenerator(trunkId, backendOpts);
}
