/**
 * Live retrieval via MCP: spawn docs and identity-au servers, call tools, collect receipts.
 * Used by the pipeline when HEYDOC_USE_MCP is set; otherwise pipeline uses stub retrieval.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

/**
 * Call docs MCP server: docs_search, then collect citation_id and receipt from first result.
 * @param {{ needs_static_docs?: string[] }} plan
 * @returns {Promise<Array<{ kind: 'static_doc', citation_id: string, ref: string, receipt?: object }>>}
 */
async function retrieveDocs(plan) {
  const topics = plan.needs_static_docs || [];
  if (topics.length === 0) return [];

  const transport = new StdioClientTransport({
    command: "node",
    args: [join(REPO_ROOT, "mcp/servers/docs/index.js")],
    env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" },
    cwd: REPO_ROOT,
  });
  const client = new Client({ name: "heydoc-pipeline", version: "0.1.0" });
  await client.connect(transport);

  try {
    const query = topics[0]; // e.g. "Choosing Wisely"
    const result = await client.callTool({ name: "docs_search", arguments: { query, mode: "mock" } });
    const content = result.content?.[0]?.text;
    if (!content) return [];
    const payload = JSON.parse(content);
    const receipt = payload.receipt;
    const results = payload.results || [];
    const receipts = [];
    if (results.length && receipt) {
      const first = results[0];
      receipts.push({
        kind: "static_doc",
        citation_id: first.citation_id || first.source_id + ":" + first.locator,
        ref: first.citation_id || first.source_id + ":" + first.locator,
        receipt: { request_id: receipt.request_id, timestamp_utc: receipt.timestamp_utc, upstream: receipt.upstream, mode: receipt.mode },
      });
    }
    return receipts;
  } finally {
    client.close();
  }
}

/**
 * Call identity-au MCP server: identity_lookup_ihi with minimal attributes.
 * @param {{ needs_live_calls?: string[] }} plan
 * @returns {Promise<Array<{ kind: 'live_data', request_id: string, upstream: string, receipt?: object }>>}
 */
async function retrieveIdentity(plan) {
  const needs = plan.needs_live_calls || [];
  if (!needs.some((n) => n.toLowerCase().includes("ihi"))) return [];

  const transport = new StdioClientTransport({
    command: "node",
    args: [join(REPO_ROOT, "mcp/servers/identity-au/index.js")],
    env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" },
    cwd: REPO_ROOT,
  });
  const client = new Client({ name: "heydoc-pipeline", version: "0.1.0" });
  await client.connect(transport);

  try {
    const result = await client.callTool({
      name: "identity_lookup_ihi",
      arguments: { attributes_minimal: {}, mode: "mock" },
    });
    const content = result.content?.[0]?.text;
    if (!content) return [];
    const payload = JSON.parse(content);
    const receipt = payload.receipt;
    if (!receipt) return [];
    return [
      {
        kind: "live_data",
        request_id: receipt.request_id,
        upstream: receipt.upstream || "heydoc-mcp-identity-au",
        receipt: { request_id: receipt.request_id, timestamp_utc: receipt.timestamp_utc, upstream: receipt.upstream, mode: receipt.mode },
      },
    ];
  } finally {
    client.close();
  }
}

/**
 * Call terminology MCP server: terminology_lookup, collect receipt for verification (no invented codes).
 * @param {{ needs_live_calls?: string[] }} plan
 * @returns {Promise<Array<{ kind: 'live_data', request_id: string, upstream: string, receipt?: object }>>}
 */
async function retrieveTerminology(plan) {
  const needs = plan.needs_live_calls || [];
  if (!needs.some((n) => n.toLowerCase().includes("terminology"))) return [];

  const transport = new StdioClientTransport({
    command: "node",
    args: [join(REPO_ROOT, "mcp/servers/terminology/index.js")],
    env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" },
    cwd: REPO_ROOT,
  });
  const client = new Client({ name: "heydoc-pipeline", version: "0.1.0" });
  await client.connect(transport);

  try {
    const result = await client.callTool({
      name: "terminology_lookup",
      arguments: { system: "SNOMED_CT", query: { kind: "text", value: "low back pain" }, mode: "mock" },
    });
    const content = result.content?.[0]?.text;
    if (!content) return [];
    const payload = JSON.parse(content);
    const receipt = payload.receipt;
    if (!receipt) return [];
    return [
      {
        kind: "live_data",
        request_id: receipt.request_id,
        upstream: receipt.upstream || "terminology",
        receipt: { request_id: receipt.request_id, timestamp_utc: receipt.timestamp_utc, upstream: receipt.upstream, mode: receipt.mode },
      },
    ];
  } finally {
    client.close();
  }
}

/**
 * Run MCP retrieval for a grounding plan. Returns receipts in pipeline shape.
 * @param {{ needs_static_docs?: string[], needs_live_calls?: string[], needs_structured_kg?: string[] }} plan
 * @returns {Promise<Array<{ kind: string, citation_id?: string, ref?: string, request_id?: string, upstream?: string, receipt?: object }>>}
 */
export async function retrieveViaMcp(plan) {
  const docReceipts = await retrieveDocs(plan);
  const identityReceipts = await retrieveIdentity(plan);
  const terminologyReceipts = await retrieveTerminology(plan);
  return [...docReceipts, ...identityReceipts, ...terminologyReceipts];
}
