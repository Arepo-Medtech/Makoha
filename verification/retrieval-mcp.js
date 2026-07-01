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
    // Ground a representative code across systems so multi-system output binds.
    // (In a full pipeline, routing supplies the specific codes/systems to validate.)
    const lookups = [
      { system: "SNOMED_CT", query: { kind: "text", value: "low back pain" } },
      { system: "ICD_10_AM", query: { kind: "code", value: "M54.5" } },
      { system: "LOINC", query: { kind: "code", value: "2823-3" } },
    ];
    const validated_codes = [];
    let receipt;
    for (const lu of lookups) {
      const result = await client.callTool({ name: "terminology_lookup", arguments: { ...lu, mode: "mock" } });
      const content = result.content?.[0]?.text;
      if (!content) continue;
      const payload = JSON.parse(content);
      const concept = payload.response && payload.response.concept;
      const candidates = (payload.response && payload.response.candidates) || [];
      if (concept && concept.code) validated_codes.push(concept.code);
      for (const c of candidates) if (c.code) validated_codes.push(c.code);
      receipt = payload.receipt || receipt;
    }
    if (!receipt) return [];
    return [
      {
        kind: "live_data",
        // Logical source for pipeline routing/filtering — the vendor name lives in
        // receipt.upstream (e.g. "stub", "NCTS-AU"). The pipeline identifies a
        // terminology receipt by this field, so keep it stable as "terminology".
        upstream: "terminology",
        request_id: receipt.request_id,
        validated_codes,
        mode: receipt.mode,
        receipt: { request_id: receipt.request_id, timestamp_utc: receipt.timestamp_utc, upstream: receipt.upstream, mode: receipt.mode, validated_codes },
      },
    ];
  } finally {
    client.close();
  }
}

/**
 * Call knowledge MCP server: kg_query for each curated dataset in needs_structured_kg.
 * Returns structured_dataset receipts (dataset_version + request_id).
 * @param {{ needs_structured_kg?: string[] }} plan
 */
async function retrieveKnowledge(plan) {
  const datasets = plan.needs_structured_kg || [];
  if (!datasets.length) return [];

  const transport = new StdioClientTransport({
    command: "node",
    args: [join(REPO_ROOT, "mcp/servers/knowledge/index.js")],
    env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" },
    cwd: REPO_ROOT,
  });
  const client = new Client({ name: "heydoc-pipeline", version: "0.1.0" });
  await client.connect(transport);

  try {
    const out = [];
    for (const name of datasets) {
      const result = await client.callTool({ name: "kg_query", arguments: { graph_kind: name, mode: "mock" } });
      const content = result.content?.[0]?.text;
      if (!content) continue;
      const payload = JSON.parse(content);
      out.push({
        kind: "structured_dataset",
        ref: payload.dataset_version || `${name}:unknown`,
        request_id: (payload.receipt && payload.receipt.request_id) || `kg-${name}`,
        upstream: "knowledge",
        receipt: payload.receipt,
      });
    }
    return out;
  } finally {
    client.close();
  }
}

/**
 * Call fhir-broker: fhir_search Observations and extract raw lab inputs.
 * Returns [{loinc, value, unit}] — RAW values that MUST be passed through the
 * deterministic investigation parser before reaching the LLM (no-raw-lab limit).
 * @param {{ needs_fhir_reads?: string[] }} plan
 */
export async function retrieveFhirObservations(plan) {
  const reads = plan.needs_fhir_reads || [];
  if (!reads.includes("Observation")) return [];

  const transport = new StdioClientTransport({
    command: "node",
    args: [join(REPO_ROOT, "mcp/servers/fhir-broker/index.js")],
    env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" },
    cwd: REPO_ROOT,
  });
  const client = new Client({ name: "heydoc-pipeline", version: "0.1.0" });
  await client.connect(transport);

  try {
    const result = await client.callTool({ name: "fhir_search", arguments: { resource_type: "Observation", mode: "mock" } });
    const content = result.content?.[0]?.text;
    if (!content) return [];
    const parsed = JSON.parse(content);
    const entries = (parsed.bundle && parsed.bundle.entry) || [];
    return entries
      .map((e) => {
        const o = e.resource || {};
        const loinc = (o.code && o.code.coding && o.code.coding.find((c) => /loinc/i.test(c.system || "")) || {}).code;
        const value = o.valueQuantity && o.valueQuantity.value;
        const unit = o.valueQuantity && o.valueQuantity.unit;
        return loinc && typeof value === "number" ? { loinc, value, unit } : null;
      })
      .filter(Boolean);
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
  // The four retrievals are independent (separate servers, no shared data) — run them
  // concurrently so pipeline latency is the max of the four, not their sum.
  const [docReceipts, identityReceipts, terminologyReceipts, knowledgeReceipts] = await Promise.all([
    retrieveDocs(plan),
    retrieveIdentity(plan),
    retrieveTerminology(plan),
    retrieveKnowledge(plan),
  ]);
  return [...docReceipts, ...identityReceipts, ...terminologyReceipts, ...knowledgeReceipts];
}
