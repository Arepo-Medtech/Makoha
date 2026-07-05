#!/usr/bin/env node
/**
 * HeyDoc MCP server: terminology (SNOMED CT-AU / ICD-10-AM / ICD-11 / LOINC / PBS / AMT).
 * Tools: terminology_lookup, terminology_validate, terminology_map
 * Modes: mock | dry_run | live.
 *
 * Systems match the Digital Tablet (data/digital_tablet_omnibus.json). Mock NEVER
 * calls a live server and returns a per-system placeholder code.
 *
 * LIVE PATH (M11 P1): set HEYDOC_TERMINOLOGY_ENDPOINT to a live environment from
 * terminology-servers.json (`dev_sandbox` | `ncts_live_api` | `self_hosted`) and
 * a *code* lookup/validate is checked against that FHIR server via
 * CodeSystem $validate-code (live-adapter.js). Unset/`mock` = the mock rollback.
 * The `dev_sandbox` (CSIRO, unlicensed reference content) is REFUSED in
 * production. Fail-safe: any error/miss returns an unvalidated result, never a
 * fabricated concept — the verifier then blocks the unbound code.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTxEndpoint, validateCodeLive } from "./live-adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";
const TERMINOLOGY_UPSTREAM = process.env.TERMINOLOGY_UPSTREAM_NAME || "stub";
const TX = JSON.parse(readFileSync(join(__dirname, "terminology-servers.json"), "utf8"));

// Resolve the active endpoint ONCE at startup. null = mock path (default). A
// forbidden selection (e.g. dev_sandbox in production) throws → the server
// refuses to start (fail-safe), rather than silently grounding on the wrong source.
let LIVE_ENDPOINT = null;
try {
  LIVE_ENDPOINT = resolveTxEndpoint(process.env, TX);
} catch (e) {
  process.stderr.write("terminology: " + e.message + "\n");
  process.exit(1);
}

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

function receipt(mode, requestId, upstream) {
  return {
    request_id: requestId || `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    // Live receipts carry the ACTUAL endpoint used (auditable which source
    // grounded the code — sandbox vs NCTS vs self-host); mock uses the stub label.
    upstream: upstream || (mode === "live" ? TX.primary : TERMINOLOGY_UPSTREAM),
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
    // Live path (M11 P1): validate a CODE against the configured FHIR server.
    // Text lookups need $expand/search (out of P1 scope) → fail-safe miss.
    if (LIVE_ENDPOINT) {
      let response;
      if (query.kind === "code") {
        const v = await validateCodeLive(LIVE_ENDPOINT.url, system, query.value);
        response = v.validated
          ? { status: "hit", concept: { system, code: query.value, display: v.display || query.value, version: v.version } }
          : { status: "miss", detail: v.reason };
      } else {
        response = { status: "miss", detail: "live text lookup not implemented in P1 (use query.kind=code)" };
      }
      const out = { request: { system, query }, response, receipt: receipt("live", requestId, LIVE_ENDPOINT.url) };
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
    // Live path (M11 P1): validate against the configured FHIR server; fail-safe.
    if (LIVE_ENDPOINT) {
      const v = await validateCodeLive(LIVE_ENDPOINT.url, system, code);
      const payload = { valid: v.validated, display: v.validated ? (v.display || code) : undefined, version: v.version, detail: v.validated ? undefined : v.reason, receipt: receipt("live", requestId, LIVE_ENDPOINT.url) };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
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
    // Live path: ConceptMap $translate is out of P1 scope → fail-safe empty
    // mappings (never fabricated) rather than returning mock mappings live.
    if (LIVE_ENDPOINT) {
      return { content: [{ type: "text", text: JSON.stringify({ mappings: [], detail: "live $translate not implemented in P1", receipt: receipt("live", requestId, LIVE_ENDPOINT.url) }, null, 2) }] };
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
