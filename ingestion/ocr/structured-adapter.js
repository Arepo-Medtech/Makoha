/**
 * Surya + Marker structured PDF → JSON adapter (MI-11; execution plan §7) — behind
 * the `STRUCTURED_OCR` flag AND a licence check (Surya/Marker are revenue-gated). OFF
 * by default (`STRUCTURED_OCR=OFF`); best structured output when cleared. Input-gated,
 * fail-safe — a licence-uncleared or unset path is unavailable, never fabricated.
 */
import { isStructuredOcrEnabled } from "../../config/flags.js";

/** @param {Record<string,string|undefined>} [env] */
export function structuredOcrAvailable(env = process.env) {
  if (!isStructuredOcrEnabled(env)) return { available: false, reason: "STRUCTURED_OCR is OFF (default)" };
  if ((env.HEYDOC_OCR_SURYA_LICENCE_CLEARED || "").trim().toLowerCase() !== "true") return { available: false, reason: "Surya/Marker licence not cleared (HEYDOC_OCR_SURYA_LICENCE_CLEARED)", licence_required: true };
  const raw = (env.HEYDOC_OCR_SURYA_ENDPOINT || "").trim();
  if (!raw || raw.startsWith("<")) return { available: false, reason: "HEYDOC_OCR_SURYA_ENDPOINT unset", licence_required: true };
  return { available: true, endpoint: raw.replace(/\/$/, ""), licence_required: true };
}

function makeSuryaClient(endpoint) {
  return async (artifact) => {
    const res = await fetch(`${endpoint}/structure`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ document: artifact }) });
    if (!res || !res.ok) throw new Error(`surya HTTP ${res ? res.status : "no-response"}`);
    const j = await res.json();
    return { text: j.text || "", tables: j.tables || [], fields: j.fields || [], layout: j.layout || null };
  };
}

export async function runStructuredOcr(artifact, { env = process.env, ocrImpl } = {}) {
  const avail = structuredOcrAvailable(env);
  const impl = ocrImpl || (avail.available ? makeSuryaClient(avail.endpoint) : null);
  if (typeof impl !== "function") return { ok: false, available: false, reason: avail.reason, engine: "surya" };
  try {
    return { ok: true, extraction: await impl(artifact), engine: "surya" };
  } catch (e) {
    return { ok: false, available: true, reason: `surya error: ${(e && e.message) || e}`, engine: "surya" };
  }
}
