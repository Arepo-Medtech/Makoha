/**
 * Imaging multimodal reasoning branch — BUILT NOW, SHIPPED DARK (MI-16; execution
 * plan §6, §2.2). The MedGemma multimodal pixel path is present in the graph but the
 * flag `IMAGING_PIXEL_INTERPRETATION` is OFF (config/flags.js). No re-architecture is
 * needed to light it later — only clinical validation on an attested imaging eval set
 * + regulatory clearance for the expanded intended-use.
 *
 * SAFETY (E8) — the flag gates INTERPRETATION OUTPUT, and every failure is to
 * `unknown`, never to an unvalidated finding:
 *   - flag OFF (the default) OR mis-set (a typo, "true", "1", …) → `unknown`. The flag
 *     read goes through the fail-safe registry, so a mis-set flag fails to OFF.
 *   - flag ON but no multimodal endpoint configured → `unknown` (input-gated, fail-safe).
 *   - flag ON + endpoint → a PROVISIONAL pixel-derived candidate, tagged
 *     requires_grounding — it is NOT a finding and must route through the Evidence
 *     Broker + verifier. A pixel claim carries no literature receipt, so the arbiter
 *     (MI-14) strips it to `unknown`. Pixel interpretation therefore cannot reach a
 *     patient in this increment by ANY path.
 * Imaging *reports* (text) are NOT handled here — they ingest as text via OCR
 * Stage 1-5 (MI-10). This module is only the pixel-interpretation branch.
 */
import { isImagingPixelInterpretationEnabled } from "../../config/flags.js";

/**
 * Input-gated MedGemma multimodal endpoint. Default UNAVAILABLE (deploy-gated).
 * @param {Record<string,string|undefined>} [env]
 */
export function multimodalEndpointAvailable(env = process.env) {
  const raw = (env.HEYDOC_IMAGING_MULTIMODAL_ENDPOINT || "").trim();
  if (!raw || raw.startsWith("<") || raw.includes("example.invalid")) {
    return { available: false, reason: "HEYDOC_IMAGING_MULTIMODAL_ENDPOINT unset — multimodal pixel path deploy-gated" };
  }
  return { available: true, endpoint: raw };
}

/**
 * The multimodal reasoning boundary. Returns `unknown` for any pixel-derived claim
 * unless the branch is both lit (flag ON) and connected — and even then it yields a
 * PROVISIONAL candidate that must be grounded, never a direct finding.
 * @param {{ artifact?: any, request?: { claim?: string, query_intent?: string } }} [input]
 * @param {{ env?: Record<string,string|undefined> }} [opts]
 */
export function interpretImage({ artifact, request } = {}, { env = process.env } = {}) {
  // E8: the flag read is fail-safe — a mis-set value resolves to OFF.
  if (!isImagingPixelInterpretationEnabled(env)) {
    return { result: "unknown", pixel_interpreted: false, flag: "OFF", reason: "imaging pixel interpretation is dark (IMAGING_PIXEL_INTERPRETATION=OFF) — pixel-derived claim routed to unknown (E8)" };
  }
  const ep = multimodalEndpointAvailable(env);
  if (!ep.available) {
    return { result: "unknown", pixel_interpreted: false, flag: "ON", reason: `imaging flag ON but ${ep.reason} → unknown (fail-safe)` };
  }
  // Lit + connected (deploy/eval only): a PROVISIONAL candidate — never a finding.
  return {
    result: "provisional_candidate",
    pixel_interpreted: true,
    flag: "ON",
    requires_grounding: true,
    endpoint: ep.endpoint,
    claim: (request && request.claim) || "pixel-derived imaging finding",
    query_intent: (request && request.query_intent) || "imaging interpretation",
    note: "provisional pixel-derived candidate — must route through the Evidence Broker + verifier; a pixel claim carries no literature receipt and resolves to unknown until a clinically-validated, attested imaging path exists",
  };
}

/**
 * Map a provisional pixel candidate to an Evidence-Broker arbiter claim (MI-14), so a
 * lit branch's output is grounded like any other claim (and, lacking a receipt,
 * stripped to unknown).
 * @param {{ claim: string, query_intent: string }} candidate
 * @returns {{ claim: string, query_intent: string }}
 */
export function pixelDerivedClaim(candidate) {
  return { claim: candidate.claim, query_intent: candidate.query_intent };
}
