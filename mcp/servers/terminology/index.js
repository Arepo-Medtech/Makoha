#!/usr/bin/env node
/**
 * HeyDoc MCP server: terminology (SNOMED CT-AU / ICD-10-AM / ICD-11 / LOINC / PBS / AMT).
 * Tools: terminology_lookup, terminology_validate, terminology_map
 * Modes: mock | dry_run | live.
 *
 * Systems match the Digital Tablet (data/digital_tablet_omnibus.json). Live grounding
 * is via the terminology servers it declares (NCTS Ontoserver) — see
 * terminology-servers.json — and requires an NCTS licence; mock NEVER calls them and
 * returns a per-system placeholder code.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";
const TERMINOLOGY_UPSTREAM = process.env.TERMINOLOGY_UPSTREAM_NAME || "stub";
const TX = JSON.parse(readFileSync(join(__dirname, "terminology-servers.json"), "utf8"));

/** The code systems the Digital Tablet uses. */
const SYSTEMS = ["SNOMED_CT", "ICD_10_AM", "ICD_11", "LOINC", "PBS", "AMT"];
const SystemEnum = z.enum(SYSTEMS);

/** Per-system placeholder concept for mock lookups (NOT clinically authoritative). */
const MOCK_CONCEPT = {
  SNOMED_CT: { code: "279039003", display: "Low back pain", version: "20240301" },
  ICD_10_AM: { code: "M54.5", display: "Low back pain", version: "12th Edition" },
  ICD_11: { code: "ME84.0", display: "Low back pain", version: "2024" },
  LOINC: { code: "2823-3", display: "Potassium [Moles/volume] in Serum or Plasma", version: "2.77" },
  PBS: { code: "2622B", display: "MOCK PBS item", version: "current" },
  AMT: { code: "23628011000036104", display: "MOCK AMT — paracetamol 500 mg tablet", version: "AMT" },
};

function receipt(mode, requestId) {
  return {
    request_id: requestId || `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    // Live mode targets the NCTS endpoint from the Digital Tablet; mock never calls it.
    upstream: mode === "live" ? TX.primary : TERMINOLOGY_UPSTREAM,
    mode,
  };
}

const server = new McpServer(
  { name: "heydoc-mcp-terminology", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.registerTool(
  "terminology_lookup",
  {
    title: "Terminology Lookup",
    description: "Look up a concept by text or code. Returns TerminologyLookup (request, response, receipt).",
    inputSchema: z.object({
      system: SystemEnum,
      query: z.object({
        kind: z.enum(["text", "code"]),
        value: z.string().min(1),
      }),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ system, query, mode }) => {
    const requestId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    if (mode === "dry_run") {
      const out = {
        request: { system, query },
        response: { status: "hit" },
        receipt: receipt("dry_run", requestId),
      };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }
    const m = MOCK_CONCEPT[system];
    const lookup = {
      request: { system, query },
      response: {
        status: "hit",
        concept: {
          system,
          // When the caller looks up a specific code, echo it back as validated;
          // otherwise return the per-system placeholder concept.
          code: query.kind === "code" ? query.value : m.code,
          display: query.kind === "text" ? (query.value.slice(0, 40) || m.display) : m.display,
          version: m.version,
        },
      },
      receipt: receipt("mock", requestId),
    };
    return { content: [{ type: "text", text: JSON.stringify(lookup, null, 2) }] };
  }
);

server.registerTool(
  "terminology_validate",
  {
    title: "Terminology Validate",
    description: "Validate a code and return display/version if valid.",
    inputSchema: z.object({
      system: SystemEnum,
      code: z.string().min(1),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ system, code, mode }) => {
    const requestId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    if (mode === "dry_run") {
      return { content: [{ type: "text", text: JSON.stringify({ valid: true, receipt: receipt("dry_run", requestId) }, null, 2) }] };
    }
    const payload = {
      valid: true,
      display: "Mock display for " + code,
      version: "2024",
      receipt: receipt("mock", requestId),
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "terminology_map",
  {
    title: "Terminology Map",
    description: "Map a code from one system to another.",
    inputSchema: z.object({
      from_system: SystemEnum,
      to_system: SystemEnum,
      code: z.string().min(1),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ from_system, to_system, code, mode }) => {
    const requestId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    if (mode === "dry_run") {
      return { content: [{ type: "text", text: JSON.stringify({ mappings: [], receipt: receipt("dry_run", requestId) }, null, 2) }] };
    }
    const payload = {
      mappings: [{ code: "mock-mapped", display: "Mock mapping", score: 1 }],
      receipt: receipt("mock", requestId),
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
