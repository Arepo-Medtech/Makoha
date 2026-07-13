/**
 * Evidence Broker (MI-01; execution plan §4.1, §5, §8).
 *
 * The arbiter of grounding: given a {claim, query_intent} it resolves the claim
 * against ranked evidence taps and returns EITHER a normalised receipt (base
 * Receipt + evidence layer) OR { result: "unknown" }. It never returns an empty
 * receipt and never a low-confidence guess. The MODEL calls the Broker; it never
 * calls a tap directly.
 *
 * Failure modes enforced here, all fail CLOSED:
 *   E2  no resolvable source                      → unknown
 *   E6  US_context source on the AU patient path   → excluded (jurisdiction guard)
 *   E9  provisional preprint (rank 4)              → excluded (not a patient receipt)
 *   E10 openFDA context-only (rank 5)              → excluded (never a receipt)
 *   E1  upstream outage                            → serve a FRESH cached receipt,
 *                                                    else unknown (never stale-unlabelled)
 *
 * The Broker is a library invoked by the pipeline (MI-14 wires it as the model-
 * output arbiter). It is deliberately NOT a model-facing MCP tool — exposing a tap
 * to the model is exactly what the grounding invariant forbids.
 */
import { z } from "zod";
import { ResponseCache, RateGovernor } from "./cache/index.js";
import { applyRanking } from "./source-ranker.js";
import { stampJurisdiction, enforceAuJurisdiction } from "../../../config/jurisdiction.js";
import { normaliseReceipt } from "./receipt-normaliser.js";
import { queryTaps as defaultQueryTaps } from "./taps/index.js";

/** BrokerRequest (execution plan §4.1). consent_scope is enforced upstream at the gateway (§3.2). */
export const BrokerRequestSchema = z
  .object({
    claim: z.string().min(1),
    query_intent: z.string().min(1),
    jurisdiction: z.literal("AU").default("AU"),
    consent_scope: z.string().optional(),
  })
  .strict();

const HOUR_MS = 3600 * 1000;

function cacheKey(claim, query_intent) {
  return `${String(query_intent || "").trim()}::${String(claim || "").trim()}`.toLowerCase();
}

/**
 * Construct an Evidence Broker. Dependencies are injectable for deterministic tests;
 * defaults give the mock-backed prototype path (§2.1).
 * @param {{ mode?: "live"|"dry_run"|"mock", now?: () => number, ttlMs?: number,
 *           rps?: number, cache?: ResponseCache, governor?: RateGovernor,
 *           queryTaps?: Function }} [opts]
 */
export function createEvidenceBroker({
  mode = "mock",
  now = () => Date.now(),
  ttlMs = 6 * HOUR_MS,
  rps = 3,
  cache = new ResponseCache({ now }),
  governor = new RateGovernor({ rps, now }),
  queryTaps = defaultQueryTaps,
} = {}) {
  /**
   * Resolve a claim to a receipt or unknown.
   * @param {{ claim: string, query_intent: string, jurisdiction?: "AU", consent_scope?: string }} request
   */
  async function resolveClaim(request) {
    const req = BrokerRequestSchema.parse(request); // throws on a malformed request — the model must not pass junk
    const patient_path = req.jurisdiction === "AU";
    const key = cacheKey(req.claim, req.query_intent);

    let hits;
    try {
      hits = await queryTaps({ claim: req.claim, query_intent: req.query_intent, mode }, { governor });
    } catch (err) {
      // E1: upstream outage. Serve a FRESH cached receipt, else unknown — never a
      // stale-but-unlabelled claim.
      const cached = cache.get(key);
      if (cached.hit && cached.fresh) return { ...cached.value, from_cache: true };
      return { result: "unknown", reason: `upstream_unavailable: ${err?.message || err?.code || "tap error"}; no fresh cache` };
    }

    if (!hits || hits.length === 0) {
      return { result: "unknown", reason: "no_resolvable_source" }; // E2
    }

    // Rank every hit and stamp jurisdiction, then keep only those that are BOTH
    // patient-receipt eligible (E9/E10) AND admitted on the AU patient path (E6).
    const ranked = hits.map((h) => stampJurisdiction(applyRanking({ ...h, claim: req.claim })));
    const excluded = [];
    const admissible = ranked.filter((c) => {
      if (!c.patient_receipt_eligible) { excluded.push({ source: c.source, reason: c.context_only ? "context_only" : c.provisional ? "provisional" : "ineligible" }); return false; }
      const j = enforceAuJurisdiction(c, { patient_path });
      if (!j.admitted) { excluded.push({ source: c.source, reason: "jurisdiction_mismatch" }); return false; }
      return true;
    });

    if (admissible.length === 0) {
      return { result: "unknown", reason: "no_admissible_source", excluded };
    }

    // Best = lowest source_rank (highest tier). Stable: preserves fixture order on ties.
    const best = admissible.reduce((a, b) => (b.source_rank < a.source_rank ? b : a));
    const normalised = normaliseReceipt(best, { mode, now });
    if (excluded.length) normalised.excluded = excluded; // transparency: what was resolved but barred

    cache.set(key, normalised, ttlMs); // seed the cache so a later outage can serve this fresh (E1)
    return normalised;
  }

  return { resolveClaim };
}
