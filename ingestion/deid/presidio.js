/**
 * PHI de-identification edge (MI-12; execution plan §2.3, §4.3 Stage 2, E4).
 *
 * Microsoft Presidio de-id, ON BY DEFAULT at the ingestion edge. Stage 2 CANNOT be
 * skipped: dev/eval never touches raw PHI regardless of consent state.
 *
 * FAIL-CLOSED — this is the crucial difference from the other input-gated wrappers
 * (synthea / MOSTLY AI), which fail-safe to "produce nothing". De-id must fail-safe to
 * "BLOCK", never to "pass raw text through". If the Presidio engine is unavailable or
 * errors, deidentify() returns { ok:false, blocked:true, text:null } — it NEVER
 * returns the un-de-identified input. There is no bypass flag and no code path that
 * returns the original text.
 *
 * Split of responsibility: ANALYSIS (finding PHI spans) is Presidio's job — external,
 * input-gated, deploy-connected. ANONYMISATION (redacting the found spans) is the
 * deterministic Node logic below, fully unit-tested with injected analyzer results.
 * No new dependency — Node 20 global fetch for the deploy client.
 */

/** Input-gated Presidio Analyzer endpoint. Default UNAVAILABLE → ingestion blocks. */
export function presidioAvailable(env = process.env) {
  const raw = (env.HEYDOC_PRESIDIO_ENDPOINT || "").trim();
  if (!raw || raw.startsWith("<") || raw.includes("example.invalid")) {
    return { available: false, reason: "HEYDOC_PRESIDIO_ENDPOINT unset — Presidio de-id engine not connected" };
  }
  return { available: true, endpoint: raw.replace(/\/$/, "") };
}

/**
 * Redact PHI spans from text. Deterministic: spans are replaced right-to-left so
 * earlier indices stay valid. Each span becomes `<REDACTED:TYPE>`.
 * @param {string} text
 * @param {Array<{ start: number, end: number, type: string }>} entities
 * @returns {string}
 */
export function redact(text, entities) {
  const spans = [...(entities || [])].filter((e) => Number.isInteger(e.start) && Number.isInteger(e.end) && e.end > e.start).sort((a, b) => b.start - a.start);
  let out = String(text);
  for (const s of spans) {
    out = out.slice(0, s.start) + `<REDACTED:${s.type || "PHI"}>` + out.slice(s.end);
  }
  return out;
}

/** A fetch-based Presidio Analyzer client (deploy-connected). Throws on any error so
 *  deidentify() fails CLOSED rather than under-redacting. */
function makePresidioAnalyzer(endpoint) {
  return async (text) => {
    const res = await fetch(`${endpoint}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text, language: "en" }),
    });
    if (!res || !res.ok) throw new Error(`presidio HTTP ${res ? res.status : "no-response"}`);
    const results = await res.json();
    return (results || []).map((r) => ({ start: r.start, end: r.end, type: r.entity_type || r.type || "PHI" }));
  };
}

/**
 * De-identify text at the ingestion edge. Fail-closed: no engine → blocked, no raw
 * passthrough. `analyze` is injectable (a function text→spans) for tests; otherwise a
 * connected Presidio endpoint is used.
 * @param {string} text
 * @param {{ analyze?: (t: string) => Promise<Array<object>>, env?: Record<string,string|undefined> }} [opts]
 * @returns {Promise<{ ok: boolean, blocked: boolean, phi_removed: boolean, text: string|null, entities?: object[], engine?: string, reason?: string }>}
 */
export async function deidentify(text, { analyze, env = process.env } = {}) {
  const avail = presidioAvailable(env);
  const analyzer = analyze || (avail.available ? makePresidioAnalyzer(avail.endpoint) : null);
  if (typeof analyzer !== "function") {
    // FAIL CLOSED — never return raw text.
    return { ok: false, blocked: true, phi_removed: false, text: null, reason: `Presidio de-id engine unavailable (${avail.reason}) — ingestion BLOCKED; raw text never passes the de-id edge (E4, fail-closed)` };
  }
  let entities;
  try {
    entities = await analyzer(text);
  } catch (e) {
    return { ok: false, blocked: true, phi_removed: false, text: null, reason: `de-id analyzer error: ${(e && e.message) || e} — ingestion BLOCKED (fail-closed)` };
  }
  return { ok: true, blocked: false, phi_removed: true, text: redact(text, entities || []), entities: entities || [], engine: analyze ? "injected" : "presidio" };
}
