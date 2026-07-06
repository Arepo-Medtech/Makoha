#!/usr/bin/env node
/**
 * HeyDoc MCP server: evidence-drug-guideline (FLOW_PLAN H2, #15 JamesANZ/medical-mcp,
 * MIT, pinned 13d2fddd) — MOCK CORE. ADVISORY ONLY.
 *
 * Tool: evidence_search(query, filters?) → { results[], receipt }
 *   Categories: drug-interaction, paediatric, guideline.
 *   Each result is a conformant EvidenceNode (evidence-node.schema.json, NO
 *   schema churn) grounded on the search Receipt.
 *
 * ══ THE HARD BOUNDARY (G9 / §1 dose-source-singular) ═══════════════════════════
 * This server's output is ADVISORY and is STRUCTURALLY BARRED from ever carrying
 * a dose. Three mechanical layers, fail-closed:
 *   (1) AdvisoryResultSchema is z.strict() with advisory:true REQUIRED and NO
 *       dose/dosage/strength/frequency field EXPRESSIBLE — a dose cannot be typed.
 *   (2) assertNoDose() runs on every result before serialisation — any dose-shaped
 *       KEY anywhere THROWS (never a filter; a fail-closed bar).
 *   (3) The EvidenceNode claim is advisory-framed and no dose value is placed in a
 *       readable field.
 * The pharmacology firewall's deterministic PharmCheck (Trunk 8.0) + verifier
 * check 5 remain the ONLY dose source. No result here can reach a dose field.
 *
 * Modes: mock (default). Live requires the external pinned #15 process (input-
 * gated; live-backend.js). Mock is the rollback. patient_eligible:false until H3.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { toEvidenceNode, assertNoDose, PATIENT_ELIGIBLE } from "../_shared/evidence-map.js";
import { chooseDrugGuidelineRoute } from "./live-backend.js";

const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";
const CREATOR = "mcp-evidence-drug-guideline";
const UPSTREAM = "heydoc-mcp-evidence-drug-guideline"; // `server` enum omitted (no schema churn)

function receipt(mode) {
  return {
    request_id: `evdg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    upstream: UPSTREAM,
    mode,
    tool: "evidence_search",
  };
}
const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

const ADVISORY_CATEGORIES = ["drug-interaction", "paediatric", "guideline"];

/**
 * The advisory result contract. .strict() => additionalProperties:false, so a
 * dose/dosage/strength/frequency field literally CANNOT be represented. advisory
 * is a REQUIRED literal true. This is enforcement layer (1) of the no-dose bar.
 */
const AdvisoryResultSchema = z
  .object({
    category: z.enum(ADVISORY_CATEGORIES),
    advisory: z.literal(true),
    locator: z.string().min(1), // literature/guideline id → EvidenceNode excerpt
    claim: z.string().min(1),   // advisory-framed, present-tense
  })
  .strict();

/**
 * Deterministic mock advisory corpus. NONE of these carries a dose — they are
 * qualitative advisory statements (an interaction exists; a paediatric caution
 * applies; a guideline recommends an approach). Any dose belongs to PharmCheck.
 */
const MOCK_ADVISORY = [
  { category: "drug-interaction", locator: "interaction:warfarin+nsaid", claim: "Advisory: co-administration of warfarin and an NSAID is reported to increase bleeding risk (interaction context only — not a dosing instruction)." },
  { category: "drug-interaction", locator: "interaction:ssri+nsaid", claim: "Advisory: concurrent SSRI and NSAID use is associated with increased gastrointestinal bleeding risk (interaction context only)." },
  { category: "paediatric", locator: "paediatric:aspirin-reye", claim: "Advisory: aspirin is cautioned in children due to association with Reye syndrome — paediatric cases are flagged for in-person review, never dosed here." },
  { category: "guideline", locator: "guideline:acute-lbp-imaging", claim: "Advisory: guidelines recommend against routine imaging for acute non-specific low back pain without red flags (management approach, not a prescription)." },
];

function mockAdvisoryResults(query, filters) {
  const cats = (filters && Array.isArray(filters.categories) && filters.categories.length ? filters.categories : ADVISORY_CATEGORIES)
    .filter((c) => ADVISORY_CATEGORIES.includes(c));
  return MOCK_ADVISORY
    .filter((e) => cats.includes(e.category))
    .filter((e) => !query || query === "*" || e.claim.toLowerCase().includes(String(query).toLowerCase()) || e.locator.toLowerCase().includes(String(query).toLowerCase()))
    .map((e) => ({ category: e.category, advisory: true, locator: e.locator, claim: e.claim }));
}

/**
 * Build the response. Each advisory item is (1) schema-validated (no dose field
 * expressible), (2) run through assertNoDose (fail-closed), then (3) mapped to a
 * conformant EvidenceNode. The advisory flag is carried alongside each node so a
 * consumer can see it is advisory context, never a dose source.
 */
function buildAdvisoryResponse(rawItems, receiptObj) {
  const results = rawItems.map((raw, i) => {
    const item = AdvisoryResultSchema.parse(raw);   // (1) structural — throws on any dose key
    assertNoDose(item, "evidence-drug-guideline result"); // (2) fail-closed guard
    const node = toEvidenceNode({ creator: CREATOR, seq: `${item.category}-${i + 1}`, claim: item.claim, receipt: receiptObj, locator: item.locator });
    // The EvidenceNode is guarded too — a dose must never appear anywhere in output.
    assertNoDose(node, "evidence-drug-guideline EvidenceNode");
    return { advisory: true, category: item.category, evidence_node: node };
  });
  return results;
}

const server = new McpServer({ name: "heydoc-mcp-evidence-drug-guideline", version: "0.1.0" }, { capabilities: { tools: {} } });

server.registerTool(
  "evidence_search",
  {
    title: "Evidence Search (drug-interaction / paediatric / guideline) — ADVISORY",
    description:
      "Search harvested drug-interaction / paediatric / guideline advisory evidence. ADVISORY ONLY — results carry advisory:true and are STRUCTURALLY BARRED from any dose field (the pharmacology firewall is the sole dose source). Returns { results[], receipt }; patient_eligible:false until MIRAGE-gated. Filters: { categories?: string[] }.",
    inputSchema: z.object({
      query: z.string().describe("Search query; '*' or empty returns all"),
      filters: z.object({ categories: z.array(z.string()).optional() }).optional(),
      top_k: z.number().int().positive().optional().default(10),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ query, filters, top_k, mode }) => {
    const route = chooseDrugGuidelineRoute(process.env, mode, MODE);

    if (route.kind === "mock" && route.mode === "dry_run") {
      return text({ results: [], advisory: true, patient_eligible: PATIENT_ELIGIBLE, receipt: receipt("dry_run"), message: "dry_run: validated" });
    }

    if (route.kind === "blocked") {
      return text({
        results: [],
        advisory: true,
        patient_eligible: PATIENT_ELIGIBLE,
        blocked: true,
        block_reason: "BLOCKED_NO_PROOF: live context but no #15 endpoint configured; mock advisory must not be served under a live receipt",
        receipt: { ...receipt("live"), error: { code: "NO_LIVE_ENDPOINT", message: "evidence-drug-guideline live endpoint unset", retryable: false } },
      });
    }

    if (route.kind === "live") {
      // Input-gated; fail-safe until wired. Even a future live path MUST pass every
      // result through AdvisoryResultSchema + assertNoDose (buildAdvisoryResponse).
      return text({
        results: [],
        advisory: true,
        patient_eligible: PATIENT_ELIGIBLE,
        receipt: { ...receipt("live"), upstream: route.cfg.upstream, error: { code: "LIVE_NOT_WIRED", message: "external #15 process adapter not yet connected (input-gated)", retryable: true } },
      });
    }

    // Mock path (dev default + rollback).
    const r = receipt("mock");
    const raw = mockAdvisoryResults(query, filters).slice(0, top_k ?? 10);
    const results = buildAdvisoryResponse(raw, r);
    return text({ results, advisory: true, patient_eligible: PATIENT_ELIGIBLE, receipt: r });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
