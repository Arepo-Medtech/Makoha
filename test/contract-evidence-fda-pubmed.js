/**
 * Contract tests for heydoc MCP server: evidence-fda-pubmed (FLOW_PLAN H2, #14 Cicatriiz).
 *
 * Asserts:
 *  1. tools/list includes evidence_search.
 *  2. evidence_search(query:"*", mode:"mock") returns a receipt with request_id (>=8),
 *     timestamp_utc, non-empty upstream, mode==="mock", and NO `server` field
 *     (omitted deliberately — harvested servers are absent from the receipt.schema.json
 *     `server` enum, so they self-identify via `upstream`; no schema churn).
 *  3. results is a non-empty array; EVERY result validates against evidence-node.schema.json.
 *  4. EVERY result is grounded on the receipt: supports[0].kind === "live_data_receipt"
 *     AND supports[0].ref === receipt.request_id.
 *  5. payload.patient_eligible === false (H2 is mock-gated; not patient-eligible until H3 MIRAGE).
 *  6. A filtered search (filters.sources=["pubmed"]) returns only pubmed-derived nodes
 *     (id contains "pubmed"), proving the filter works and nothing is fabricated.
 *
 * Run from repo root: node test/contract-evidence-fda-pubmed.js
 */
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import Ajv from "ajv/dist/2020.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const serverPath = join(repoRoot, "mcp/servers/evidence-fda-pubmed/index.js");
const evidenceNodeSchemaPath = join(repoRoot, "mcp/schemas/evidence-node.schema.json");

// Draft 2020-12 schema. strict:false so unknown formats (date-time) are ignored —
// ajv-formats is NOT a declared dependency; structure/required/enums still validate.
const ajv = new Ajv({ strict: false });
const evidenceNodeSchema = JSON.parse(readFileSync(evidenceNodeSchemaPath, "utf8"));
const validateEvidenceNode = ajv.compile(evidenceNodeSchema);

function sendRequest(proc, req) {
  proc.stdin.write(JSON.stringify(req) + "\n");
}

function readResponse(proc) {
  return new Promise((resolve, reject) => {
    const rl = createInterface(proc.stdout);
    rl.once("line", (line) => {
      rl.close();
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function run() {
  const proc = spawn("node", [serverPath], {
    cwd: repoRoot,
    env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const errors = [];
  proc.stderr.on("data", (d) => process.stderr.write(d));

  try {
    // MCP init sequence.
    sendRequest(proc, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "contract-test", version: "0.1.0" } },
    });
    const initResp = await readResponse(proc);
    if (initResp.error) throw new Error(initResp.error.message || "init failed");

    sendRequest(proc, { jsonrpc: "2.0", method: "notifications/initialized" });

    // (1) tools/list includes evidence_search.
    sendRequest(proc, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    const listResp = await readResponse(proc);
    if (listResp.error) throw new Error(listResp.error.message || "tools/list failed");
    const names = (listResp.result?.tools ?? []).map((t) => t.name);
    if (!names.includes("evidence_search")) errors.push("Missing tool: evidence_search");

    // Wildcard mock search — exercises the full corpus.
    sendRequest(proc, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "evidence_search", arguments: { query: "*", mode: "mock" } },
    });
    const callResp = await readResponse(proc);
    if (callResp.error) throw new Error(callResp.error.message || "tools/call failed");
    const content = callResp.result?.content?.[0]?.text;
    if (!content) {
      errors.push("evidence_search returned no content");
    } else {
      const payload = JSON.parse(content);
      const r = payload.receipt;

      // (2) Receipt shape; no `server` field.
      if (!r) {
        errors.push("evidence_search response missing receipt");
      } else {
        if (!r.request_id || String(r.request_id).length < 8) errors.push("receipt request_id missing or <8 chars");
        if (!r.timestamp_utc) errors.push("receipt missing timestamp_utc");
        if (!r.upstream || String(r.upstream).length < 1) errors.push("receipt missing non-empty upstream");
        if (r.mode !== "mock") errors.push("receipt mode expected mock, got " + r.mode);
        if (r.server !== undefined) errors.push("receipt should OMIT `server` (harvested server not in enum), got " + r.server);
      }

      // (3) results non-empty; every result validates against evidence-node.schema.json.
      const results = payload.results;
      if (!Array.isArray(results) || results.length === 0) {
        errors.push("results is not a non-empty array");
      } else {
        results.forEach((node, i) => {
          if (!validateEvidenceNode(node)) {
            errors.push(`result[${i}] fails evidence-node.schema.json: ${ajv.errorsText(validateEvidenceNode.errors)}`);
          }
          // (4) grounded on the receipt.
          const s0 = node.supports?.[0];
          if (!s0 || s0.kind !== "live_data_receipt") errors.push(`result[${i}] supports[0].kind !== live_data_receipt`);
          else if (r && s0.ref !== r.request_id) errors.push(`result[${i}] supports[0].ref !== receipt.request_id`);
        });
      }

      // (5) not patient-eligible at H2.
      if (payload.patient_eligible !== false) errors.push("payload.patient_eligible expected false, got " + payload.patient_eligible);
    }

    // (6) filtered search returns only pubmed-derived nodes.
    sendRequest(proc, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "evidence_search", arguments: { query: "*", mode: "mock", filters: { sources: ["pubmed"] } } },
    });
    const filtResp = await readResponse(proc);
    if (filtResp.error) throw new Error(filtResp.error.message || "filtered tools/call failed");
    const filtContent = filtResp.result?.content?.[0]?.text;
    if (!filtContent) {
      errors.push("filtered evidence_search returned no content");
    } else {
      const filtPayload = JSON.parse(filtContent);
      const filtResults = filtPayload.results;
      if (!Array.isArray(filtResults) || filtResults.length === 0) {
        errors.push("filtered results is not a non-empty array (filter should still yield pubmed nodes)");
      } else {
        filtResults.forEach((node, i) => {
          if (!String(node.id).includes("pubmed")) {
            errors.push(`filtered result[${i}] id "${node.id}" is not pubmed-derived — filter leaked a non-pubmed source`);
          }
        });
      }
    }
  } finally {
    proc.kill("SIGTERM");
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-evidence-fda-pubmed: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
