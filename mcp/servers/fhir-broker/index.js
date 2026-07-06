#!/usr/bin/env node
/**
 * HeyDoc MCP server: fhir-broker (FHIR R4 / AU Core resource I/O) — MOCK.
 * Tools: fhir_read, fhir_search (templated AU Core resources); fhir_write SAFE_STUB.
 * Modes: mock (default). Live requires FHIR R4 base URL + SMART-on-FHIR/mTLS.
 *
 * Returns MOCK/SYNTHETIC AU Core-shaped resources (mock-resources.json) — NOT real
 * patient data and NOT conformance-validated (see fhir-r4-aucdi-conformance). The
 * WRITE path is a SAFE_STUB ('unavailable') — no EHR write in mock. Raw lab values
 * in Observations are deliberately present: downstream they MUST pass through the
 * deterministic investigation parser before reaching the LLM (no-raw-lab hard limit).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateResource, AU_CORE_MANIFEST } from "./conformance.js";
import { chooseFhirRoute, fhirReadLive, fhirSearchLive } from "./live-backend.js";
import { normaliseMode } from "../../../verification/mode.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";
const FHIR_UPSTREAM = process.env.FHIR_AUTH_MODE === "live" ? process.env.FHIR_BASE_URL || "live" : "stub";
const RESOURCES = JSON.parse(readFileSync(join(__dirname, "mock-resources.json"), "utf8")).resources;

// The zod `mode` field must default to a VALID enum value. HEYDOC_MODE_DEFAULT
// carries ENV names (mock/staging/production/dry_run), so normalise it to the
// enforcement enum (mock/dry_run/live) — otherwise a `production` env default
// is an invalid enum and every mode-omitting call throws at the tool boundary.
const DEFAULT_MODE = normaliseMode(MODE).context_mode;

// H1 live wiring — the path decision (mock / live / blocked) is the pure,
// unit-tested chooseFhirRoute() in live-backend.js. index.js only renders each
// outcome. Rollback: unset HEYDOC_FHIR_MCP_ENDPOINT ⇒ mock in a mock context.
const routeFor = (requestedMode) => chooseFhirRoute(process.env, requestedMode, MODE);

/** Fail-safe envelope for a live request with no live endpoint (never mock-as-live). */
function blockedLive(nullKey) {
  return {
    [nullKey]: null,
    blocked: true,
    block_reason: "BLOCKED_NO_PROOF",
    receipt: receipt("live", { error: { code: "BLOCKED_NO_LIVE_ENDPOINT", message: "mode is live but HEYDOC_FHIR_MCP_ENDPOINT is not configured — refusing to serve mock under a live receipt", retryable: false } }),
  };
}

function receipt(mode, extra = {}) {
  return { request_id: `fhir-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, timestamp_utc: new Date().toISOString(), upstream: FHIR_UPSTREAM, mode, server: "fhir-broker", ...extra };
}
const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: "heydoc-mcp-fhir-broker", version: "0.1.0" }, { capabilities: { tools: {} } });

server.registerTool(
  "fhir_read",
  {
    title: "FHIR Read",
    description: "Read a single mock AU Core resource by type (and optional id). Returns { resource, receipt }.",
    inputSchema: z.object({ resource_type: z.string(), id: z.string().optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(DEFAULT_MODE) }),
  },
  async ({ resource_type, id, mode }) => {
    const route = routeFor(mode);
    if (route.kind === "live") return text(await fhirReadLive(route.cfg, { resource_type, id }));
    if (route.kind === "blocked") return text(blockedLive("resource"));
    const list = RESOURCES[resource_type] || [];
    const resource = (id ? list.find((r) => r.id === id) : list[0]) || null;
    return text({ resource, receipt: receipt(route.mode) });
  }
);

server.registerTool(
  "fhir_search",
  {
    title: "FHIR Search",
    description: "Search mock AU Core resources of a type. Returns a FHIR searchset Bundle + receipt.",
    inputSchema: z.object({ resource_type: z.string(), params: z.record(z.unknown()).optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(DEFAULT_MODE) }),
  },
  async ({ resource_type, params, mode }) => {
    const route = routeFor(mode);
    if (route.kind === "live") return text(await fhirSearchLive(route.cfg, { resource_type, params }));
    if (route.kind === "blocked") return text(blockedLive("bundle"));
    const list = RESOURCES[resource_type] || [];
    const bundle = { resourceType: "Bundle", type: "searchset", total: list.length, entry: list.map((r) => ({ resource: r })) };
    return text({ bundle, receipt: receipt(route.mode) });
  }
);

// SAFE_STUB: no EHR write in mock — never fabricate a write result.
server.registerTool(
  "fhir_write",
  {
    title: "FHIR Write (unavailable in mock)",
    description: "EHR write path. Not available in mock — returns status 'unavailable' (no fabricated write).",
    inputSchema: z.object({ resource_type: z.string(), resource: z.record(z.unknown()).optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(DEFAULT_MODE) }),
  },
  async ({ resource_type }) => text({ status: "unavailable", reason: "no EHR write in mock (no live FHIR connection)", result: null, resource_type, receipt: receipt(DEFAULT_MODE) })
);

server.registerTool(
  "fhir_validate",
  {
    title: "FHIR Conformance Validate (AU Core, structural)",
    description: `Validate a FHIR resource against the vendored AU Core StructureDefinition snapshot (${AU_CORE_MANIFEST.ig_version}). Deterministic structural checks (profile, required, cardinality, fixed system); ValueSet membership is 'not_evaluated' (needs live NCTS). Returns { conformance, receipt }.`,
    inputSchema: z.object({ resource: z.record(z.unknown()), profile: z.string().optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(DEFAULT_MODE) }),
  },
  async ({ resource, profile }) => text({ ...validateResource(resource, profile), ig_version: AU_CORE_MANIFEST.ig_version, receipt: receipt(DEFAULT_MODE) })
);

const transport = new StdioServerTransport();
await server.connect(transport);
