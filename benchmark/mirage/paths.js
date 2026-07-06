/**
 * Retrieval-path adapters for the MIRAGE harness (FLOW_PLAN H3).
 *
 * Each adapter wraps ONE built H2 evidence path as an object the scorer can drive:
 *   { ref, upstream, kind, open(), ask(question) -> {upstream, keys[], empty, payload}, close() }
 *
 * The harness TAGS a path by the Receipt `upstream` field it returns — NOT by a
 * server enum (the harvested evidence servers deliberately omit the receipt.schema
 * `server` enum and self-identify via `upstream`, per H2). ask() returns the
 * normalised evidence keys the path surfaced for a question, whether it abstained
 * (empty), and the raw payload (so the scorer can run the no-dose invariant check).
 *
 * The three built paths under test (MIRAGE-CORPUS-SPEC §1):
 *   #14 evidence-fda-pubmed   — evidence_search, results = EvidenceNode[]
 *   #15 evidence-drug-guideline — evidence_search, results = {advisory,category,evidence_node}[]
 *   #1  docs override         — docs_search, results = snippet[] (keyed by citation_id)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpStdioClient } from "./mcp-client.js";
import { normaliseKey } from "./key-normalise.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

/** Extract normalised evidence keys from a path payload, by result shape. */
function extractKeys(kind, payload) {
  const results = payload?.results;
  if (!Array.isArray(results)) return [];
  if (kind === "evidence-node") {
    // #14: each result IS an EvidenceNode.
    return results.map((n) => normaliseKey(n?.supports?.[0]?.excerpt)).filter(Boolean);
  }
  if (kind === "advisory") {
    // #15: each result is { advisory, category, evidence_node }.
    return results.map((r) => normaliseKey(r?.evidence_node?.supports?.[0]?.excerpt)).filter(Boolean);
  }
  if (kind === "docs") {
    // #1: each result is a docs snippet keyed by citation_id.
    return results.map((s) => normaliseKey(s?.citation_id)).filter(Boolean);
  }
  return [];
}

function makeAdapter({ ref, upstream, kind, serverRel, tool }) {
  const serverPath = join(REPO_ROOT, serverRel);
  let client = null;
  return {
    ref,
    upstream,
    kind,
    tool,
    async open() {
      client = new McpStdioClient(serverPath);
      await client.start();
    },
    /**
     * Run the path with the QUESTION only (MIRAGE-CORPUS-SPEC §2.5). Returns the
     * normalised keys retrieved, whether the path abstained (empty), and the raw
     * payload for the invariant check.
     */
    async ask(question) {
      const payload = await client.callTool(tool, { query: question, mode: "mock" });
      const keys = extractKeys(kind, payload);
      const resultCount = Array.isArray(payload?.results) ? payload.results.length : 0;
      return {
        upstream: payload?.receipt?.upstream ?? upstream,
        keys,
        empty: resultCount === 0,
        payload,
      };
    },
    close() {
      client?.close();
      client = null;
    },
  };
}

/** The three real retrieval paths under test at H3. */
export function realPaths() {
  return [
    makeAdapter({
      ref: "14",
      upstream: "heydoc-mcp-evidence-fda-pubmed",
      kind: "evidence-node",
      serverRel: "mcp/servers/evidence-fda-pubmed/index.js",
      tool: "evidence_search",
    }),
    makeAdapter({
      ref: "15",
      upstream: "heydoc-mcp-evidence-drug-guideline",
      kind: "advisory",
      serverRel: "mcp/servers/evidence-drug-guideline/index.js",
      tool: "evidence_search",
    }),
    makeAdapter({
      ref: "1",
      upstream: "heydoc-mcp-docs",
      kind: "docs",
      serverRel: "mcp/servers/docs/index.js",
      tool: "docs_search",
    }),
  ];
}

/** Map a corpus `path` field to the upstream tag its adapter reports. */
export const PATH_TO_UPSTREAM = {
  "evidence-fda-pubmed": "heydoc-mcp-evidence-fda-pubmed",
  "evidence-drug-guideline": "heydoc-mcp-evidence-drug-guideline",
  docs: "heydoc-mcp-docs",
};
