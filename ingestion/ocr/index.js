/**
 * OCR engine selector — the licensing fork (MI-11; execution plan §7).
 *
 * OCR_ENGINE (config/flags.js, fail-safe → "paddle") picks the engine WITHOUT a
 * rebuild: paddle (OSS default, no licence) | jsl | surya (both licence-gated). The
 * selector never silently falls back to a different engine — if the selected engine
 * is unavailable/unlicensed it BLOCKS (fail-safe), so an operator's engine choice is
 * honoured, not quietly overridden.
 */
import { ocrEngine } from "../../config/flags.js";
import { runPaddleOcr } from "./paddle-adapter.js";
import { runJslOcr } from "./jsl-adapter.js";
import { runStructuredOcr } from "./structured-adapter.js";

const ENGINES = {
  paddle: { run: runPaddleOcr, licence_required: false },
  jsl: { run: runJslOcr, licence_required: true },
  surya: { run: runStructuredOcr, licence_required: true },
};

/** Resolve the selected OCR engine from the flag. @param {Record<string,string|undefined>} [env] */
export function selectOcrEngine(env = process.env) {
  const engine = ocrEngine(env); // fail-safe → "paddle"
  const spec = ENGINES[engine] || ENGINES.paddle;
  return { engine, run: spec.run, licence_required: spec.licence_required };
}

/**
 * Run the selected OCR engine over an artifact. `ocrImpl` (per-engine) injectable for
 * tests. Fail-safe: an unavailable/unlicensed engine returns { ok:false } — never a
 * fabricated extraction, and never a silent engine swap.
 * @returns {Promise<{ ok: boolean, extraction?: object, engine: string, reason?: string }>}
 */
export async function runOcr(artifact, { env = process.env, ocrImpl } = {}) {
  const sel = selectOcrEngine(env);
  return sel.run(artifact, { env, ocrImpl });
}
