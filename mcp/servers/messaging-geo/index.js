#!/usr/bin/env node
/**
 * HeyDoc MCP server: messaging-geo (messaging + geolocation + pharmacy) — MOCK.
 * Tools: geo_locate, pharmacy_search (mock); msg_send SAFE_STUB (NEVER sends).
 * Modes: mock (default). Live requires MSG_PROVIDER / GEO_PROVIDER / pharmacy directory.
 *
 * SAFETY: msg_send is the only patient-contacting tool. It is a SAFE_STUB — it NEVER
 * actually sends, returns delivery_receipt.status='mock_not_sent', and is flagged
 * not-patient-facing. Nothing reaches a patient: the prime directive requires the
 * (unbuilt) Clinician Verification Portal before any patient-facing path. The
 * recipient address is NOT echoed back (patient-data minimisation). geo/pharmacy
 * results are mock and clearly marked.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";
const MSG_UPSTREAM = process.env.MSG_PROVIDER || "stub";

function receipt(prefix, mode) {
  return { request_id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, timestamp_utc: new Date().toISOString(), upstream: MSG_UPSTREAM, mode, server: "messaging-geo" };
}
const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: "heydoc-mcp-messaging-geo", version: "0.1.0" }, { capabilities: { tools: {} } });

// SAFE_STUB: NEVER sends. No patient-facing path exists (Clinician Portal unbuilt).
server.registerTool(
  "msg_send",
  {
    title: "Message Send (mock — never sends)",
    description: "Patient/clinician messaging. MOCK ONLY — never actually sends; returns a mock delivery receipt. Not patient-facing.",
    inputSchema: z.object({ channel: z.string(), to: z.string().optional(), template_id: z.string().optional(), variables: z.record(z.unknown()).optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE) }),
  },
  async ({ channel, template_id }) => text({
    delivery_receipt: { status: "mock_not_sent", channel, template_id: template_id || null, recipient_redacted: true, note: "MOCK — no message was sent; messaging is not patient-facing until the Clinician Verification Portal exists" },
    receipt: receipt("msg", MODE),
  })
);

server.registerTool(
  "geo_locate",
  {
    title: "Geolocate (mock)",
    description: "Resolve a location signal to coordinates. MOCK — returns fixed coordinates.",
    inputSchema: z.object({ signal: z.string().optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE) }),
  },
  async ({ mode }) => text({ coords: { lat: -31.9505, lng: 115.8605, note: "MOCK (Perth WA)" }, receipt: receipt("geo", mode || MODE) })
);

server.registerTool(
  "pharmacy_search",
  {
    title: "Pharmacy Search (mock)",
    description: "Find nearby pharmacies. MOCK — returns illustrative candidates; 'open_now' is not authoritative.",
    inputSchema: z.object({ coords: z.record(z.unknown()).optional(), radius_km: z.number().optional(), open_now: z.boolean().optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE) }),
  },
  async ({ mode }) => text({
    candidates: [
      { name: "MOCK Pharmacy — Central", distance_km: 1.2, open_now: true, note: "MOCK — not an authoritative directory" },
      { name: "MOCK Pharmacy — Riverside", distance_km: 3.4, open_now: false, note: "MOCK — not an authoritative directory" },
    ],
    receipt: receipt("geo", mode || MODE),
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
