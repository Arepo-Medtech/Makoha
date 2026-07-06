#!/usr/bin/env node
/**
 * HeyDoc MCP server: tooluniverse-gateway (FLOW_PLAN H5, #28 mims-harvard/ToolUniverse,
 * Apache-2.0, pinned v1.3.1 = 9b7ff91d, RCE floor v1.3.0) — COMPACT-MODE GATEWAY.
 *
 * Exposes ≤5 core tools; the full 600-1000+ ToolUniverse library is reached ONLY via
 * execute_tool(name, args) → { result, receipt }. The security boundary lives in
 * tool-gateway.js (pure, unit-tested). Because ToolUniverse ships ~2620 tools including
 * families that execute code indirectly or run autonomous loops (MCPAutoLoader / Agentic
 * / Compose / Replicate_run / meta ExecuteTool), a name blocklist cannot be complete, so
 * the AUTHORITATIVE control is DEFAULT-DENY: execute_tool forwards ONLY vetted retrieval
 * tools; the code executors, the agentic/loader/compose families, and any un-vetted name
 * are refused before any subprocess forward, with or without auth. No code executes by
 * any path. Egress is enforced on the forward path; dev/mock never makes a live call.
 *
 * Modes: runtime ABSENT here → execute_tool fail-safes to { available:false,
 * reason:"input-gated: ToolUniverse runtime absent" } (never a fabricated result);
 * the discovery tools (list_tools/find_tools/get_tool_info) answer from the committed
 * FIXTURE catalogue (metadata only, mode:mock, source:fixture — never mock-as-live).
 * Live execution is input-gated on HEYDOC_TOOLUNIVERSE_CMD + API keys via the secrets
 * manager, behind own auth + the egress allow-list.
 *
 * TRUST: harvested tool output is patient_eligible:false at H5; retrieval-type tools
 * are additionally MIRAGE-gated (H3) and governance-gated (H7) before any eligibility.
 * The verifier's five checks apply unchanged to any downstream trunk output.
 *
 * AUDIT PATTERN (MedLog #org — STUDY ONLY): mims-harvard/MedLog's event-level
 * clinical-AI logging pattern informs the FUTURE live audit substrate (ARCH M8 seam,
 * verification/audit-store.js). This milestone builds NO WORM and does NOT modify the
 * RETAIN audit ledger — every gateway call still emits the common Receipt the existing
 * pipeline records.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { executeTool, makeReceipt, isHardDeniedTool, PATIENT_ELIGIBLE } from "./tool-gateway.js";
import { locateToolUniverse, COMPACT_CORE_TOOLS } from "./launch-spec.js";
import { DECLARED_EGRESS_HOSTS } from "./egress-allowlist.js";
import { normaliseMode } from "../../../verification/mode.js";

// F4 fix: normalise the env default through the mode-normaliser so a staging/production
// HEYDOC_MODE_DEFAULT maps to a valid receipt-mode enum value (live/dry_run/mock) and
// never throws at the zod layer. Unknown/staging/production → "live" (fail-safe).
const MODE = normaliseMode(process.env.HEYDOC_MODE_DEFAULT).context_mode;
const __dirname = dirname(fileURLToPath(import.meta.url));

/** The committed fixture catalogue (metadata only; drives discovery while absent). */
function loadCatalogue() {
  return JSON.parse(readFileSync(join(__dirname, "fixtures", "tool-catalogue.json"), "utf8"));
}

/**
 * The DEFAULT-DENY vetted allow-list: every enabled retrieval tool in the fixture →
 * { host }. Only these are reachable via execute_tool; everything else is refused.
 * Each declares its single upstream host, which the egress gate bounds to the
 * declared allow-list. Hosts not on DECLARED_EGRESS_HOSTS are dropped (fail-safe).
 */
function vettedTools() {
  const cat = loadCatalogue();
  const vetted = {};
  for (const t of cat.tools) {
    if (t.kind === "retrieval" && !t.disabled && t.host && DECLARED_EGRESS_HOSTS.includes(t.host) && !isHardDeniedTool(t.name)) {
      vetted[t.name] = { host: t.host };
    }
  }
  return vetted;
}

const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

const AuthSchema = z
  .object({ token: z.string().optional(), principal: z.string().optional() })
  .optional()
  .describe("Breath-Ezy auth principal — a call with no auth is refused (no unauthenticated path).");

const server = new McpServer(
  { name: "heydoc-mcp-tooluniverse-gateway", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// ── execute_tool — the AITIP envelope + the full security boundary ─────────────
server.registerTool(
  "execute_tool",
  {
    title: "Execute a ToolUniverse tool (compact-mode gateway)",
    description:
      "Run one ToolUniverse tool by name behind the Breath-Ezy security boundary. Code-execution tools " +
      "(python_code_executor / python_script_runner / read_executed_notebook) are permanently disabled and " +
      "unreachable. Requires auth. Returns { result, receipt }; patient_eligible:false (MIRAGE/governance-gated). " +
      "Runtime absent → { available:false, input-gated }.",
    inputSchema: z.object({
      name: z.string().describe("ToolUniverse tool name to execute"),
      args: z.record(z.any()).optional().default({}),
      auth: AuthSchema,
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ name, args, auth, mode }) => {
    const runtime = locateToolUniverse(process.env);
    const out = await executeTool({
      name,
      args: args || {},
      input: { auth, mode },
      env: process.env,
      defaultMode: MODE,
      runtime: runtime ? { cmd: runtime.cmd } : null,
      vetted: vettedTools(), // DEFAULT-DENY allow-list (name → { host })
      egressAllow: DECLARED_EGRESS_HOSTS,
      // No transport wired at H5 (input-gated) → live path fail-safes; forward omitted.
    });
    return text(out);
  }
);

// ── list_tools — discovery over the fixture catalogue (metadata only) ──────────
server.registerTool(
  "list_tools",
  {
    title: "List ToolUniverse tools (discovery)",
    description:
      "List available ToolUniverse tools (compact-mode discovery). While the runtime is absent this returns the " +
      "committed FIXTURE catalogue (metadata only, mode:mock, source:fixture). Code-execution tools are shown with " +
      "disabled:true — they are never executable through the gateway.",
    inputSchema: z.object({
      mode_filter: z.enum(["all", "retrieval", "enabled"]).optional().default("all"),
      auth: AuthSchema,
    }),
  },
  async ({ mode_filter }) => {
    const cat = loadCatalogue();
    let tools = cat.tools;
    if (mode_filter === "retrieval") tools = tools.filter((t) => t.kind === "retrieval");
    if (mode_filter === "enabled") tools = tools.filter((t) => !t.disabled);
    // Belt-and-braces: mark any executor-shaped name disabled even if the fixture missed it.
    tools = tools.map((t) => (isHardDeniedTool(t.name) ? { ...t, disabled: true } : t));
    return text({
      source: "fixture",
      version: cat.version,
      compact_core_tools: COMPACT_CORE_TOOLS,
      count: tools.length,
      tools,
      patient_eligible: PATIENT_ELIGIBLE,
      receipt: makeReceipt("mock", { tool: "list_tools" }),
    });
  }
);

// ── find_tools — keyword discovery over the fixture catalogue ──────────────────
server.registerTool(
  "find_tools",
  {
    title: "Find ToolUniverse tools by keyword (discovery)",
    description:
      "Keyword search over the tool catalogue (name/category). Fixture-backed while the runtime is absent " +
      "(mode:mock, source:fixture). Never executes anything; discovery only.",
    inputSchema: z.object({
      query: z.string().describe("keyword to match against tool name/category"),
      auth: AuthSchema,
    }),
  },
  async ({ query }) => {
    const cat = loadCatalogue();
    const q = String(query || "").toLowerCase();
    const tools = cat.tools
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
      .map((t) => (isHardDeniedTool(t.name) ? { ...t, disabled: true } : t));
    return text({ source: "fixture", query, count: tools.length, tools, patient_eligible: PATIENT_ELIGIBLE, receipt: makeReceipt("mock", { tool: "find_tools" }) });
  }
);

// ── get_tool_info — detail for one tool (discovery) ────────────────────────────
server.registerTool(
  "get_tool_info",
  {
    title: "Get info for one ToolUniverse tool (discovery)",
    description:
      "Return catalogue metadata for a named tool. Fixture-backed while absent. Code-execution tools return " +
      "disabled:true. Discovery only — never executes.",
    inputSchema: z.object({
      name: z.string(),
      auth: AuthSchema,
    }),
  },
  async ({ name }) => {
    const cat = loadCatalogue();
    let tool = cat.tools.find((t) => t.name === name) || null;
    if (tool && isHardDeniedTool(tool.name)) tool = { ...tool, disabled: true };
    // A tool not in the fixture but executor-shaped is still reported disabled.
    if (!tool && isHardDeniedTool(name)) tool = { name, category: "code_execution", kind: "execution", disabled: true };
    return text({ source: "fixture", tool, found: !!tool, patient_eligible: PATIENT_ELIGIBLE, receipt: makeReceipt("mock", { tool: "get_tool_info" }) });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
