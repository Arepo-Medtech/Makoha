/**
 * PaddleOCR adapter (MI-10; execution plan §2.3, §7) — the DEFAULT OSS OCR engine
 * (Apache-2.0). Input-gated fail-safe wrapper over an external PaddleOCR service (the
 * synthea/presidio precedent): with no endpoint configured it returns
 * { ok:false, available:false } and NEVER fabricates an extraction.
 * No new dependency — Node 20 global fetch for the deploy client.
 */

/** @param {Record<string,string|undefined>} [env] */
export function paddleAvailable(env = process.env) {
  const raw = (env.HEYDOC_OCR_PADDLE_ENDPOINT || "").trim();
  if (!raw || raw.startsWith("<") || raw.includes("example.invalid")) return { available: false, reason: "HEYDOC_OCR_PADDLE_ENDPOINT unset — PaddleOCR not connected" };
  return { available: true, endpoint: raw.replace(/\/$/, "") };
}

function makePaddleClient(endpoint) {
  return async (artifact) => {
    const res = await fetch(`${endpoint}/ocr`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ image: artifact }) });
    if (!res || !res.ok) throw new Error(`paddle HTTP ${res ? res.status : "no-response"}`);
    const j = await res.json();
    return { text: j.text || "", tables: j.tables || [], fields: j.fields || [], layout: j.layout || null };
  };
}

/**
 * Run PaddleOCR. `ocrImpl` injectable for tests. Fail-safe on every path.
 * @returns {Promise<{ ok: boolean, extraction?: object, available?: boolean, reason?: string, engine: string }>}
 */
export async function runPaddleOcr(artifact, { env = process.env, ocrImpl } = {}) {
  const avail = paddleAvailable(env);
  const impl = ocrImpl || (avail.available ? makePaddleClient(avail.endpoint) : null);
  if (typeof impl !== "function") return { ok: false, available: false, reason: avail.reason, engine: "paddle" };
  try {
    return { ok: true, extraction: await impl(artifact), engine: "paddle" };
  } catch (e) {
    return { ok: false, available: true, reason: `paddle error: ${(e && e.message) || e}`, engine: "paddle" };
  }
}
