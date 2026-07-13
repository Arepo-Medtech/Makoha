/**
 * John Snow Labs Visual NLP / OCR adapter (MI-11; execution plan §7) — behind the
 * `OCR_ENGINE=jsl` flag. NOT the default: JSL is a paid annual floating licence, so
 * this path is doubly gated — selected via the flag AND licence-cleared via
 * HEYDOC_OCR_JSL_LICENCE_CLEARED. Un-selected or un-licensed → unavailable (a later
 * commercial decision is a config change, not a rebuild). Input-gated, fail-safe.
 */
import { ocrEngine } from "../../config/flags.js";

/** @param {Record<string,string|undefined>} [env] */
export function jslAvailable(env = process.env) {
  if (ocrEngine(env) !== "jsl") return { available: false, reason: "OCR_ENGINE is not 'jsl' (OSS PaddleOCR is the default)" };
  if ((env.HEYDOC_OCR_JSL_LICENCE_CLEARED || "").trim().toLowerCase() !== "true") return { available: false, reason: "JSL licence not cleared (HEYDOC_OCR_JSL_LICENCE_CLEARED) — budget a licence for production", licence_required: true };
  const raw = (env.HEYDOC_OCR_JSL_ENDPOINT || "").trim();
  if (!raw || raw.startsWith("<")) return { available: false, reason: "HEYDOC_OCR_JSL_ENDPOINT unset", licence_required: true };
  return { available: true, endpoint: raw.replace(/\/$/, ""), licence_required: true };
}

function makeJslClient(endpoint) {
  return async (artifact) => {
    const res = await fetch(`${endpoint}/ocr`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ image: artifact }) });
    if (!res || !res.ok) throw new Error(`jsl HTTP ${res ? res.status : "no-response"}`);
    const j = await res.json();
    return { text: j.text || "", tables: j.tables || [], fields: j.fields || [], layout: j.layout || null };
  };
}

export async function runJslOcr(artifact, { env = process.env, ocrImpl } = {}) {
  const avail = jslAvailable(env);
  const impl = ocrImpl || (avail.available ? makeJslClient(avail.endpoint) : null);
  if (typeof impl !== "function") return { ok: false, available: false, reason: avail.reason, engine: "jsl" };
  try {
    return { ok: true, extraction: await impl(artifact), engine: "jsl" };
  } catch (e) {
    return { ok: false, available: true, reason: `jsl error: ${(e && e.message) || e}`, engine: "jsl" };
  }
}
