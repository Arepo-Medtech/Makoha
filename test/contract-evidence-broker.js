/**
 * Contract test for MI-01 — Evidence Broker (execution plan §4.1, §5, §8).
 *
 * Acceptance gate: a known claim resolves to a VALID receipt; no-resolve returns
 * { result: "unknown" }. Plus the fail-closed edges:
 *   E2 no source → unknown; E9 preprint-only → unknown; E10 openFDA-only → unknown;
 *   E6 US_context barred; E1 outage → fresh-cache-or-unknown; malformed request throws.
 * Also asserts every emitted receipt validates against ReceiptSchema.
 * Run from repo root: node test/contract-evidence-broker.js
 */
import { createEvidenceBroker } from "../mcp/servers/knowledge/broker.js";
import { ReceiptSchema } from "../verification/pipeline-schemas.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
// Injected queryTaps stubs ignore the governor (no real timers) for deterministic speed.
const stubTaps = (hits) => async () => hits.map((h) => ({ ...h, mode: "mock" }));

async function main() {
  // A) Full mock path — known claim resolves to a valid, schema-clean receipt.
  {
    const broker = createEvidenceBroker();
    const r = await broker.resolveClaim({ claim: "atorvastatin reduces cardiovascular events", query_intent: "lipid-lowering CV benefit" });
    expect(!!r.receipt, "A: known claim must return a receipt");
    expect(r.result !== "unknown", "A: known claim must NOT be unknown");
    if (r.receipt) {
      expect(ReceiptSchema.safeParse(r.receipt).success, "A: emitted receipt must validate against ReceiptSchema");
      expect(r.receipt.source_rank === 1 && r.receipt.confidence === "high", "A: pubmed → rank1/high");
      expect(r.receipt.jurisdiction_tag === "non_AU", "A: pubmed → non_AU");
      expect(r.receipt.server === "knowledge", "A: server must be knowledge");
      expect(r.evidence?.source === "pubmed" && r.evidence?.patient_receipt_eligible === true, "A: evidence layer must name pubmed + be patient-eligible");
    }
  }

  // B) Multi-source ranking — pick the lowest source_rank (pubmed rank1 over CT.gov rank2).
  {
    const broker = createEvidenceBroker({ queryTaps: stubTaps([{ source: "clinicaltrials_gov", id: "NCT1" }, { source: "pubmed", id: "PMID1" }]) });
    const r = await broker.resolveClaim({ claim: "any", query_intent: "any" });
    expect(r.evidence?.source === "pubmed" && r.receipt?.source_rank === 1, "B: must select the highest tier (pubmed rank1)");
  }

  // C) E9 — preprint-only resolves to unknown (never a patient receipt).
  {
    const broker = createEvidenceBroker({ queryTaps: stubTaps([{ source: "biorxiv_medrxiv", id: "10.1101/x" }]) });
    const r = await broker.resolveClaim({ claim: "any", query_intent: "any" });
    expect(r.result === "unknown" && r.reason === "no_admissible_source", "C: preprint-only → unknown (E9)");
    expect(Array.isArray(r.excluded) && r.excluded.some((e) => e.reason === "provisional"), "C: exclusion must cite provisional");
  }

  // D) E10/E6 — openFDA-only resolves to unknown (context-only, US_context).
  {
    const broker = createEvidenceBroker({ queryTaps: stubTaps([{ source: "openfda", id: "fda-1" }]) });
    const r = await broker.resolveClaim({ claim: "any", query_intent: "any" });
    expect(r.result === "unknown", "D: openFDA-only → unknown (E10)");
    expect(r.excluded?.some((e) => e.reason === "context_only"), "D: exclusion must cite context_only");
  }

  // E) E2 — no hits at all → unknown.
  {
    const broker = createEvidenceBroker({ queryTaps: stubTaps([]) });
    const r = await broker.resolveClaim({ claim: "unheard-of claim", query_intent: "any" });
    expect(r.result === "unknown" && r.reason === "no_resolvable_source", "E: no hits → unknown (E2)");
  }

  // F) Malformed request — missing claim must throw (the model cannot pass junk).
  {
    const broker = createEvidenceBroker();
    let threw = false;
    try { await broker.resolveClaim({ query_intent: "no claim" }); } catch { threw = true; }
    expect(threw, "F: missing claim must throw");
  }

  // G) E1 — upstream outage serves a FRESH cached receipt, else unknown.
  {
    const clock = { t: 1_000_000 };
    const now = () => clock.t;
    let down = false;
    const flakyTaps = async () => { if (down) throw new Error("tap down"); return [{ source: "pubmed", id: "PMID1", mode: "mock" }]; };
    const broker = createEvidenceBroker({ now, ttlMs: 1000, queryTaps: flakyTaps });
    const first = await broker.resolveClaim({ claim: "cached claim", query_intent: "intent" });
    expect(!!first.receipt, "G: first call must resolve and seed the cache");

    down = true;
    clock.t += 500; // still within ttl → fresh
    const served = await broker.resolveClaim({ claim: "cached claim", query_intent: "intent" });
    expect(served.from_cache === true && !!served.receipt, "G: outage within ttl must serve fresh cache (E1)");

    clock.t += 2000; // now stale
    const stale = await broker.resolveClaim({ claim: "cached claim", query_intent: "intent" });
    expect(stale.result === "unknown" && /upstream_unavailable/.test(stale.reason), "G: outage past ttl must return unknown, never stale-unlabelled (E1)");
  }

  if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-01 evidence-broker FAIL (${errors.length})`); process.exit(1); }
  console.log("MI-01 evidence-broker PASS");
  process.exit(0);
}

main().catch((e) => { console.error("MI-01 evidence-broker ERROR:", e); process.exit(1); });
