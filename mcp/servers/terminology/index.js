#!/usr/bin/env node
/**
 * HeyDoc MCP server: terminology (SNOMED CT / ICD-11).
 * Tools: terminology_lookup, terminology_validate, terminology_map
 * Modes: mock | dry_run | live (stub until real terminology server)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";
const TERMINOLOGY_UPSTREAM = process.env.TERMINOLOGY_UPSTREAM_NAME || "stub";

function receipt(mode, requestId) {
  return {
    request_id: requestId || `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    upstream: TERMINOLOGY_UPSTREAM,
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
      system: z.enum(["SNOMED_CT", "ICD_11"]),
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
    const lookup = {
      request: { system, query },
      response: {
        status: "hit",
        concept: {
          system,
          code: system === "SNOMED_CT" ? "279039003" : "ME84.0",
          display: query.kind === "text" ? (query.value.slice(0, 40) || "Mock concept") : "Mock display",
          version: "2024",
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
      system: z.enum(["SNOMED_CT", "ICD_11"]),
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
      from_system: z.enum(["SNOMED_CT", "ICD_11"]),
      to_system: z.enum(["SNOMED_CT", "ICD_11"]),
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
