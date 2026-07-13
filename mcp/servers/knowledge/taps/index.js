/**
 * Evidence Broker taps (MI-01; execution plan §2.1).
 *
 * The Broker resolves a claim by querying evidence taps; the MODEL never calls a
 * tap directly. Taps are adapters over the harvested taps (#1/#14/#15, i.e. the
 * in-repo evidence-fda-pubmed / evidence-drug-guideline MCP servers) and, in
 * production, the live bio-research endpoints. Right now the backend is a
 * DETERMINISTIC MOCK fixture (§2.1 "prototype backends now; production hosting
 * later"); it carries mode:"mock" so a mock hit is never mistaken for live.
 *
 * The query path is wrapped in the rate governor + retry NOW so the live swap is a
 * backend change, not a re-architecture. FAIL-SAFE: the tap layer surfaces the
 * failure to the Broker (which applies the E1 cached-or-unknown rule) — it never
 * fabricates a hit.
 */
import { withRetry } from "../cache/index.js";

/** Normalise a claim string for deterministic fixture lookup. */
function normaliseClaim(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Deterministic mock evidence fixture: normalised claim → candidate hits.
 * Each candidate is { source, id }; the Broker attaches the claim and ranks them.
 * Sources span every §5 tier so the ranker/jurisdiction exclusions are exercisable.
 */
export const MOCK_FIXTURE = {
  "atorvastatin reduces cardiovascular events": [{ source: "pubmed", id: "PMID:10021437" }],
  "sacubitril valsartan reduces heart failure mortality": [
    { source: "clinicaltrials_gov", id: "NCT01035255" },
    { source: "pubmed", id: "PMID:25176015" },
  ],
  "compound binds the target of interest": [
    { source: "chembl", id: "CHEMBL25" },
    { source: "open_targets", id: "ENSG00000130203" },
  ],
  "novel biomarker predicts outcome (preprint)": [{ source: "biorxiv_medrxiv", id: "10.1101/2024.01.01.573210" }],
  "drug adverse event frequency from us labels": [{ source: "openfda", id: "openfda-ae-0001" }],
};

/**
 * The mock tap backend. Returns candidate hits for a known claim, [] otherwise.
 * Never throws for a normal lookup (an unknown claim is [], not an error).
 * @param {{ claim: string }} req
 * @returns {Promise<Array<{ source: string, id: string }>>}
 */
export async function mockTapBackend({ claim }) {
  return (MOCK_FIXTURE[normaliseClaim(claim)] || []).map((c) => ({ ...c }));
}

/**
 * Query the taps for a claim, spaced by the rate governor and retried on transient
 * failure. Returns candidate hits stamped with the mode. A backend failure
 * propagates (the Broker handles E1); the tap layer never invents a hit.
 * @param {{ claim: string, query_intent?: string, mode?: "live"|"dry_run"|"mock" }} req
 * @param {{ governor?: { acquire: () => Promise<void> }, tapBackend?: (r: any) => Promise<Array<object>>, retry?: object }} [deps]
 * @returns {Promise<Array<{ source: string, id: string, mode: string }>>}
 */
export async function queryTaps({ claim, query_intent, mode = "mock" }, { governor, tapBackend = mockTapBackend, retry } = {}) {
  if (governor) await governor.acquire();
  const hits = await withRetry(() => tapBackend({ claim, query_intent, mode }), retry || {});
  return hits.map((h) => ({ ...h, mode }));
}
