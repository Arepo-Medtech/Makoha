#!/usr/bin/env node
/**
 * HeyDoc MCP server: pharmacology (deterministic safety firewall) — MOCK CORE.
 * Tools: pharm_intent (validate/normalise), pharm_check (PharmIntent -> PharmCheck).
 * Modes: mock (default). Live (MIMS-AU + SafeScript) is NOT connected.
 *
 * This server is the ONLY source of dose guidance (no_dosages_from_LLM invariant).
 * The deterministic engine (and its hard rules — dose-only-here, HARD_FAIL terminal,
 * paediatric flag/no-dose, S8 PDMP, BLOCKED_NO_PROOF on absent facts) lives in
 * engine.js, shared with the in-process firewall in the grounding pipeline.
 *
 * Reference rules are MOCK/SYNTHETIC-ONLY (mock-data.json). A contracted vendor
 * + SafeScript are required before any staging-live or patient-facing use.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PharmIntentSchema, validatePharmIntent } from "./schemas.js";
import { runPharmCheck, receipt } from "./engine.js";

const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";

const ResolvedFactsSchema = z
  .object({
    allergens: z.array(z.string()).optional(),
    current_medications: z.array(z.string()).optional(),
    egfr_ml_min: z.number().optional(),
    pregnancy: z.boolean().optional(),
    s8_pdmp_checked: z.boolean().optional(),
    nti_monitoring_documented: z.boolean().optional(),
  })
  .optional();

const server = new McpServer({ name: "heydoc-mcp-pharmacology", version: "0.1.0" }, { capabilities: { tools: {} } });

server.registerTool(
  "pharm_intent",
  {
    title: "Pharmacology Intent",
    description: "Validate/normalise a PharmIntent payload. Returns the validated intent (no safety check).",
    inputSchema: z.object({ intent: PharmIntentSchema, mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE) }),
  },
  async ({ intent }) => {
    const validated = validatePharmIntent(intent);
    return { content: [{ type: "text", text: JSON.stringify({ intent: validated, receipt: receipt("mock") }, null, 2) }] };
  }
);

server.registerTool(
  "pharm_check",
  {
    title: "Pharmacology Safety Check",
    description: "Run the deterministic firewall on a PharmIntent. Returns a PharmCheck (status PASS/WARN/HARD_FAIL/BLOCKED_NO_PROOF). The only source of dose guidance.",
    inputSchema: z.object({
      intent: PharmIntentSchema,
      resolved_facts: ResolvedFactsSchema,
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ intent, resolved_facts }) => {
    const result = runPharmCheck(intent, resolved_facts || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
