#!/usr/bin/env node
/**
 * HeyDoc MCP server: identity-au (AU identity + IHI).
 * Tools: identity_verify, identity_lookup_ihi, identity_log_consent
 * Modes: mock | dry_run | live (stub until real connector)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";
const AU_IHI_PROVIDER = process.env.AU_IHI_PROVIDER || "stub";

function receipt(mode, requestId) {
  return {
    request_id: requestId || `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    upstream: AU_IHI_PROVIDER,
    mode,
  };
}

const server = new McpServer(
  { name: "heydoc-mcp-identity-au", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.registerTool(
  "identity_verify",
  {
    title: "Identity Verify",
    description: "Verify identity (method + payload). Returns verified, receipt, attributes_minimal. No plaintext demographics persist.",
    inputSchema: z.object({
      method: z.string(),
      payload: z.record(z.unknown()),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ mode }) => {
    const requestId = `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    if (mode === "dry_run") {
      return { content: [{ type: "text", text: JSON.stringify({ receipt: receipt("dry_run", requestId), message: "dry_run: validated" }, null, 2) }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ verified: true, receipt: receipt("mock", requestId), attributes_minimal: { ref: "mock-ref", level: "mock" } }, null, 2) }],
    };
  }
);

server.registerTool(
  "identity_lookup_ihi",
  {
    title: "Identity Lookup IHI",
    description: "Look up IHI from minimal attributes. Returns ihi and receipt.",
    inputSchema: z.object({
      attributes_minimal: z.record(z.unknown()),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ mode }) => {
    const requestId = `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    if (mode === "dry_run") {
      return { content: [{ type: "text", text: JSON.stringify({ receipt: receipt("dry_run", requestId), message: "dry_run: validated" }, null, 2) }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ ihi: "8003600000000000", receipt: receipt("mock", requestId) }, null, 2) }],
    };
  }
);

server.registerTool(
  "identity_log_consent",
  {
    title: "Identity Log Consent",
    description: "Log consent hashes for an encounter. Returns ledger_ref and receipt.",
    inputSchema: z.object({
      encounter_id: z.string(),
      consent_hashes: z.array(z.string()),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ encounter_id, mode }) => {
    const requestId = `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    if (mode === "dry_run") {
      return { content: [{ type: "text", text: JSON.stringify({ receipt: receipt("dry_run", requestId), message: "dry_run: validated" }, null, 2) }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ ledger_ref: `ledger:${encounter_id}:${Date.now()}`, receipt: receipt("mock", requestId) }, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
