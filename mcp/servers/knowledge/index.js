#!/usr/bin/env node
/**
 * HeyDoc MCP server: knowledge (structured knowledge + curated datasets) — MOCK.
 * Tools: kg_query, kg_provenance (read, real over the curated datasets);
 *        kg_upsert, kg_export (SAFE_STUB — graph write path not built).
 * Modes: mock (default). Live requires PostgreSQL (HEYDOC_KG_DB_URL).
 *
 * Serves three curated datasets (benign registry, Axis B templates, red-flag
 * question bank) and the two structured graphs (ContextGraph,
 * PatientKnowledgeGraph). The datasets are DEV/SYNTHETIC-ONLY and NOT clinically
 * authoritative (see each data file's status banner). The graphs return EMPTY in
 * mock — there is no graph store yet — and that emptiness is reported honestly,
 * never fabricated. The graph WRITE path (kg_upsert/kg_export) is a documented
 * SAFE_STUB that returns 'unavailable', never a fake revision.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODE = process.env.HEYDOC_MODE_DEFAULT || "mock";
const KG_UPSTREAM = process.env.KG_UPSTREAM_NAME || "stub";
const GRAPH_KINDS = ["ContextGraph", "PatientKnowledgeGraph"];

const DATASETS = {};
for (const name of ["benign-registry", "axis-b-templates", "redflags-bank"]) {
  const d = JSON.parse(readFileSync(join(__dirname, "data", `${name}.json`), "utf8"));
  DATASETS[name] = { ...d, checksum: "sha256:" + createHash("sha256").update(JSON.stringify(d.records)).digest("hex") };
}

function receipt(mode) {
  return { request_id: `kg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, timestamp_utc: new Date().toISOString(), upstream: KG_UPSTREAM, mode, server: "knowledge" };
}
const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: "heydoc-mcp-knowledge", version: "0.1.0" }, { capabilities: { tools: {} } });

server.registerTool(
  "kg_query",
  {
    title: "Knowledge Query",
    description: "Query a curated dataset (benign-registry | axis-b-templates | redflags-bank) or a structured graph (ContextGraph | PatientKnowledgeGraph). Returns rows + receipt.",
    inputSchema: z.object({ graph_kind: z.string(), query: z.string().optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE) }),
  },
  async ({ graph_kind, query, mode }) => {
    const r = receipt(mode || MODE);
    if (DATASETS[graph_kind]) {
      const ds = DATASETS[graph_kind];
      let rows = ds.records;
      if (query && query !== "*") {
        const q = String(query).toLowerCase();
        rows = rows.filter((x) => x.key.toLowerCase() === q || (x.display && x.display.toLowerCase().includes(q)));
      }
      return text({ rows, dataset_version: ds.dataset_version, checksum: ds.checksum, receipt: r });
    }
    if (GRAPH_KINDS.includes(graph_kind)) {
      // Honest empty — no graph store in mock; never fabricate session/patient facts.
      return text({ rows: [], graph_kind, note: "empty: no graph store in mock (graph write path unbuilt)", receipt: r });
    }
    return text({ rows: [], note: `unknown graph_kind/dataset: ${graph_kind}`, receipt: r });
  }
);

server.registerTool(
  "kg_provenance",
  {
    title: "Knowledge Provenance",
    description: "Return dataset lineage (version + checksum + status) for a curated dataset, or a note for a graph_kind.",
    inputSchema: z.object({ graph_kind: z.string(), key: z.string().optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE) }),
  },
  async ({ graph_kind, key, mode }) => {
    const r = receipt(mode || MODE);
    if (DATASETS[graph_kind]) {
      const ds = DATASETS[graph_kind];
      return text({ lineage: { dataset_version: ds.dataset_version, checksum: ds.checksum, source: "curated dev dataset", status: ds.status, key: key || null }, receipt: r });
    }
    return text({ lineage: { note: "no provenance: no graph store in mock", graph_kind }, receipt: r });
  }
);

// SAFE_STUB: the graph WRITE path is not built — return 'unavailable', never a fake revision/artifact.
server.registerTool(
  "kg_upsert",
  {
    title: "Knowledge Upsert (unavailable in mock)",
    description: "Graph write path. Not built in mock — returns status 'unavailable' (no fabricated revision).",
    inputSchema: z.object({ graph_kind: z.string(), key: z.string().optional(), payload: z.record(z.unknown()).optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE) }),
  },
  async ({ graph_kind }) => text({ status: "unavailable", reason: "graph write path not built in mock (no graph store)", revision: null, graph_kind, receipt: receipt(MODE) })
);

server.registerTool(
  "kg_export",
  {
    title: "Knowledge Export (unavailable in mock)",
    description: "Graph export path. Not built in mock — returns status 'unavailable' (no fabricated artifact).",
    inputSchema: z.object({ graph_kind: z.string(), key: z.string().optional(), format: z.string().optional(), mode: z.enum(["live", "dry_run", "mock"]).optional().default(MODE) }),
  },
  async ({ graph_kind }) => text({ status: "unavailable", reason: "graph export path not built in mock (no graph store)", artifact_ref: null, graph_kind, receipt: receipt(MODE) })
);

const transport = new StdioServerTransport();
await server.connect(transport);
