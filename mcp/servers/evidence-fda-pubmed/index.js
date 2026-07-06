#!/usr/bin/env node
/**
 * HeyDoc MCP server: evidence-fda-pubmed (FLOW_PLAN H2, #14
 * Cicatriiz/healthcare-mcp-public, MIT, pinned 1c4c40c3) — MOCK CORE.
 *
 * Tool: evidence_search(query, filters?) → { results[], receipt }
 *   Sources: FDA drug labels, PubMed literature, ClinicalTrials.gov, ICD-10.
 *   Each result is a conformant EvidenceNode (evidence-node.schema.json, NO
 *   schema churn) grounded on the search Receipt (supports[].kind =
 *   "live_data_receipt", ref = receipt.request_id). The literature locator
 *   (PMID / FDA id / trial id / code) rides in supports[].excerpt.
 *
 * Modes: mock (default, deterministic). Live requires the external pinned #14
 *   MCP process + an egress allow-list + API keys via the secrets manager
 *   (input-gated; see live-backend.js). Mock is the rollback.
 *
 * TRUST: retrieved evidence is public literature, NOT patient data. It is
 *   ADVISORY and — like every harvested retrieval path — patient_eligible:false
 *   until the H3 MIRAGE benchmark scores it (evidence-verified-trust, §1). The
 *   verifier's five checks apply unchanged to any downstream trunk output.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { toEvidenceNode, PATIENT_ELIGIBLE } from "../_shared/evidence-map.js";
import { chooseEvidenceRoute } from "./live-backend.js";

const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";
const CREATOR = "mcp-evidence-fda-pubmed";
// Self-identify via `upstream` — the receipt.schema.json `server` enum lists only
// the 7 original servers, so a harvested evidence server MUST omit `server`
// (no schema churn) and name itself in `upstream`.
const UPSTREAM = "heydoc-mcp-evidence-fda-pubmed";

/** Common Receipt (receipt.schema.json). `server` omitted deliberately. */
function receipt(mode) {
  return {
    request_id: `evfp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    upstream: UPSTREAM,
    mode,
    tool: "evidence_search",
  };
}
const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

/**
 * Deterministic mock literature corpus, keyed by source. Synthetic/illustrative —
 * these are canned dev results, never presented as live. `claim` is written
 * present-tense and declarative to satisfy the EvidenceNode contract; `locator`
 * is the literature id that rides in supports[].excerpt.
 */
const MOCK_CORPUS = {
  pubmed: [
    { locator: "PMID:31234567", claim: "PubMed review reports NSAIDs provide short-term pain relief in acute non-specific low back pain (advisory literature)." },
    { locator: "PMID:29876543", claim: "PubMed cohort study associates early imaging in low back pain without red flags with no improvement in outcomes (advisory literature)." },
  ],
  fda: [
    { locator: "FDA:ANDA-040455", claim: "FDA label lists gastrointestinal bleeding as a labelled warning for ibuprofen (advisory drug-label evidence)." },
  ],
  clinicaltrials: [
    { locator: "NCT01234567", claim: "ClinicalTrials.gov records a completed RCT of physiotherapy versus usual care for chronic low back pain (advisory trial registry evidence)." },
  ],
  icd10: [
    { locator: "ICD-10:M54.5", claim: "ICD-10 lists M54.5 as the descriptor 'Low back pain' (advisory terminology reference — NOT a terminology-receipt code binding)." },
  ],
};

const ALL_SOURCES = Object.keys(MOCK_CORPUS);

function mockResults(query, filters, receiptObj) {
  const sources = (filters && Array.isArray(filters.sources) && filters.sources.length ? filters.sources : ALL_SOURCES)
    .filter((s) => ALL_SOURCES.includes(s));
  const items = [];
  for (const src of sources) {
    for (const entry of MOCK_CORPUS[src]) {
      // Deterministic query filter: substring match on the claim (case-insensitive);
      // "*" or empty query returns all. Never fabricates a result to satisfy a query.
      if (query && query !== "*" && !entry.claim.toLowerCase().includes(String(query).toLowerCase()) && !String(entry.locator).toLowerCase().includes(String(query).toLowerCase())) {
        continue;
      }
      items.push({ src, ...entry });
    }
  }
  return items.map((it, i) =>
    toEvidenceNode({ creator: CREATOR, seq: `${it.src}-${i + 1}`, claim: it.claim, receipt: receiptObj, locator: it.locator })
  );
}

const server = new McpServer({ name: "heydoc-mcp-evidence-fda-pubmed", version: "0.1.0" }, { capabilities: { tools: {} } });

server.registerTool(
  "evidence_search",
  {
    title: "Evidence Search (FDA / PubMed / ClinicalTrials / ICD-10)",
    description:
      "Search harvested public literature (FDA labels, PubMed, ClinicalTrials.gov, ICD-10). Returns EvidenceNodes grounded on a Receipt. ADVISORY only; patient_eligible:false until MIRAGE-gated. Filters: { sources?: string[] } from pubmed|fda|clinicaltrials|icd10.",
    inputSchema: z.object({
      query: z.string().describe("Search query; '*' or empty returns all mock results"),
      filters: z.object({ sources: z.array(z.string()).optional() }).optional(),
      top_k: z.number().int().positive().optional().default(10),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ query, filters, top_k, mode }) => {
    const route = chooseEvidenceRoute(process.env, mode, MODE);

    if (route.kind === "dry_run" || (route.kind === "mock" && route.mode === "dry_run")) {
      return text({ results: [], patient_eligible: PATIENT_ELIGIBLE, receipt: receipt("dry_run"), message: "dry_run: validated" });
    }

    if (route.kind === "blocked") {
      // Live context but no endpoint — BLOCK, never serve mock as live (C16).
      return text({
        results: [],
        patient_eligible: PATIENT_ELIGIBLE,
        blocked: true,
        block_reason: "BLOCKED_NO_PROOF: live context but no #14 endpoint configured; mock results must not be served under a live receipt",
        receipt: { ...receipt("live"), error: { code: "NO_LIVE_ENDPOINT", message: "evidence-fda-pubmed live endpoint unset", retryable: false } },
      });
    }

    if (route.kind === "live") {
      // Live path is input-gated (external pinned process + keys). Until wired, be
      // fail-safe: return no fabricated results, an error-carrying live receipt.
      return text({
        results: [],
        patient_eligible: PATIENT_ELIGIBLE,
        receipt: { ...receipt("live"), upstream: route.cfg.upstream, error: { code: "LIVE_NOT_WIRED", message: "external #14 process adapter not yet connected (input-gated)", retryable: true } },
      });
    }

    // Mock path (dev default + rollback).
    const r = receipt("mock");
    const results = mockResults(query, filters, r).slice(0, top_k ?? 10);
    return text({ results, patient_eligible: PATIENT_ELIGIBLE, receipt: r });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
