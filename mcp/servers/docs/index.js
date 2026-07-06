#!/usr/bin/env node
/**
 * HeyDoc MCP server: docs (static documentation).
 * Tools: docs_search, docs_get, docs_cite
 * Modes: mock | dry_run | live
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { chooseDocsRoute } from "./live-backend.js";

const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";
// FLOW_PLAN H2 #1: docs retrieval is patient_eligible:false until the H3 MIRAGE
// gate scores it. This override adds an input-gated live route (live-backend.js)
// while the mock/dry_run behaviour below is preserved verbatim (contract-docs.js).
const PATIENT_ELIGIBLE = false;

function receipt(mode, requestId) {
  return {
    request_id: requestId || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    upstream: "heydoc-mcp-docs",
    mode,
  };
}

/**
 * Input-gated live-route guard shared by all three docs tools. Returns a response
 * object to SHORT-CIRCUIT with (blocked or fail-safe live), or null to fall
 * through to the UNCHANGED mock/dry_run logic. Only diverts when the context
 * normalises to "live" (never during mock/dry_run — so the docs contract holds).
 */
function docsLiveGuard(mode, requestId, tool) {
  const route = chooseDocsRoute(process.env, mode, MODE);
  if (route.kind === "blocked") {
    return { content: [{ type: "text", text: JSON.stringify({
      blocked: true, patient_eligible: PATIENT_ELIGIBLE,
      block_reason: "BLOCKED_NO_PROOF: live context but no #1 docs endpoint configured; mock citations must not be served under a live receipt",
      receipt: { ...receipt("live", requestId), tool, error: { code: "NO_LIVE_ENDPOINT", message: "docs live endpoint unset", retryable: false } },
    }, null, 2) }] };
  }
  if (route.kind === "live") {
    // Input-gated (external #1 backend + creds). Fail-safe until wired: no fabricated citation.
    return { content: [{ type: "text", text: JSON.stringify({
      patient_eligible: PATIENT_ELIGIBLE,
      receipt: { ...receipt("live", requestId), tool, upstream: route.cfg.upstream, error: { code: "LIVE_NOT_WIRED", message: "anthropics/healthcare backend adapter not yet connected (input-gated)", retryable: true } },
    }, null, 2) }] };
  }
  return null; // mock / dry_run — continue with the existing contract behaviour
}

const MOCK_SNIPPETS = [
  {
    source_id: "choosing-wisely-au",
    locator: "section:imaging-lbp",
    title: "Choosing Wisely: imaging for low back pain",
    excerpt: "Do not recommend imaging for patients with non-specific low back pain in the absence of red flags.",
    version: "2024-01",
    citation_id: "cw-au:imaging-lbp:2024-01",
  },
  {
    source_id: "etg-licensing",
    locator: "license",
    title: "Therapeutic Guidelines (eTG) – licensing",
    excerpt: "Licensed corpus; retrieval via licensed adapter only. No free-text reproduction.",
    version: "current",
    citation_id: "etg:license:current",
  },
];

const server = new McpServer(
  { name: "heydoc-mcp-docs", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.registerTool(
  "docs_search",
  {
    title: "Docs Search",
    description: "Search the static documentation index. Returns snippets with source_id and citation_id.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      sources: z.array(z.string()).optional().describe("Optional source filter"),
      top_k: z.number().optional().default(5),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ query, top_k, mode }) => {
    const requestId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const gated = docsLiveGuard(mode, requestId, "docs_search");
    if (gated) return gated;
    if (mode === "dry_run") {
      return { content: [{ type: "text", text: JSON.stringify({ receipt: receipt("dry_run", requestId), message: "dry_run: validated" }, null, 2) }] };
    }
    const results = MOCK_SNIPPETS.slice(0, top_k ?? 5).map((s) => ({
      source_id: s.source_id, locator: s.locator, title: s.title, excerpt: s.excerpt, citation_id: s.citation_id, version: s.version,
    }));
    return { content: [{ type: "text", text: JSON.stringify({ results, receipt: receipt("mock", requestId) }, null, 2) }] };
  }
);

server.registerTool(
  "docs_get",
  {
    title: "Docs Get",
    description: "Get content for a source and locator. Returns content and metadata.",
    inputSchema: z.object({
      source_id: z.string(),
      locator: z.string(),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ source_id, locator, mode }) => {
    const requestId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const gated = docsLiveGuard(mode, requestId, "docs_get");
    if (gated) return gated;
    if (mode === "dry_run") {
      return { content: [{ type: "text", text: JSON.stringify({ receipt: receipt("dry_run", requestId), message: "dry_run: validated" }, null, 2) }] };
    }
    const mock = MOCK_SNIPPETS.find((s) => s.source_id === source_id && s.locator === locator) || {
      source_id, locator, content: "(mock: no content)", metadata: { version: "mock", date: new Date().toISOString() },
    };
    const content = mock.content || mock.excerpt || "(no content)";
    const metadata = mock.metadata || { version: mock.version, date: new Date().toISOString() };
    return { content: [{ type: "text", text: JSON.stringify({ content, metadata, receipt: receipt("mock", requestId) }, null, 2) }] };
  }
);

server.registerTool(
  "docs_cite",
  {
    title: "Docs Cite",
    description: "Produce a citation for use in EvidenceNode (supports.kind=static_doc).",
    inputSchema: z.object({
      source_id: z.string(),
      locator: z.string(),
      excerpt_max_chars: z.number().optional().default(500),
      mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE),
    }),
  },
  async ({ source_id, locator, excerpt_max_chars, mode }) => {
    const requestId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const gated = docsLiveGuard(mode, requestId, "docs_cite");
    if (gated) return gated;
    if (mode === "dry_run") {
      return { content: [{ type: "text", text: JSON.stringify({ receipt: receipt("dry_run", requestId), message: "dry_run: validated" }, null, 2) }] };
    }
    const mock = MOCK_SNIPPETS.find((s) => s.source_id === source_id && s.locator === locator) || {
      source_id, locator, citation_id: `cite:${source_id}:${locator}:${Date.now()}`, excerpt: "(mock)", metadata: { version: "mock" },
    };
    let excerpt = (mock.excerpt || mock.content || "").slice(0, excerpt_max_chars ?? 500);
    if ((mock.excerpt || mock.content || "").length > (excerpt_max_chars ?? 500)) excerpt += "…";
    return {
      content: [{ type: "text", text: JSON.stringify({ citation_id: mock.citation_id, excerpt, metadata: mock.metadata, receipt: receipt("mock", requestId) }, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
