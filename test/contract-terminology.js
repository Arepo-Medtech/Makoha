/**
 * Contract tests for heydoc MCP server: terminology.
 * Asserts: tools list includes terminology_lookup, terminology_validate, terminology_map; call returns TerminologyLookup shape with receipt.
 * Run from repo root: node test/contract-terminology.js
 */
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const serverPath = join(repoRoot, "mcp/servers/terminology/index.js");

function sendRequest(proc, req) {
  const msg = JSON.stringify(req) + "\n";
  proc.stdin.write(msg);
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
    sendRequest(proc, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "contract-test", version: "0.1.0" } },
    });
    const initResp = await readResponse(proc);
    if (initResp.error) throw new Error(initResp.error.message || "init failed");

    sendRequest(proc, { jsonrpc: "2.0", method: "notifications/initialized" });

    sendRequest(proc, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    const listResp = await readResponse(proc);
    if (listResp.error) throw new Error(listResp.error.message || "tools/list failed");
    const tools = listResp.result?.tools ?? [];
    const names = tools.map((t) => t.name);
    if (!names.includes("terminology_lookup")) errors.push("Missing tool: terminology_lookup");
    if (!names.includes("terminology_validate")) errors.push("Missing tool: terminology_validate");
    if (!names.includes("terminology_map")) errors.push("Missing tool: terminology_map");

    sendRequest(proc, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "terminology_lookup",
        arguments: { system: "SNOMED_CT", query: { kind: "text", value: "low back pain" }, mode: "mock" },
      },
    });
    const callResp = await readResponse(proc);
    if (callResp.error) throw new Error(callResp.error.message || "tools/call failed");
    const content = callResp.result?.content?.[0]?.text;
    if (!content) errors.push("terminology_lookup returned no content");
    else {
      const payload = JSON.parse(content);
      if (!payload.receipt) errors.push("response missing receipt");
      else {
        if (!payload.receipt.request_id) errors.push("receipt missing request_id");
        if (!payload.receipt.timestamp_utc) errors.push("receipt missing timestamp_utc");
        if (!payload.receipt.upstream) errors.push("receipt missing upstream");
      }
      if (!payload.request || !payload.response) errors.push("response missing request/response (TerminologyLookup shape)");
      if (payload.response?.status !== "hit" && payload.response?.status !== "miss") errors.push("response.status should be hit or miss");
    }
  } finally {
    proc.kill("SIGTERM");
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-terminology: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
