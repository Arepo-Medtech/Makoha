/**
 * Contract tests for heydoc MCP server: docs.
 * Asserts: tools list includes docs_search, docs_get, docs_cite; call responses include receipt with request_id, timestamp_utc, upstream, mode.
 * Run from repo root: node test/contract-docs.js
 */
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const serverPath = join(repoRoot, "mcp/servers/docs/index.js");

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
    // MCP init sequence: initialize then tools/list
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
    if (!names.includes("docs_search")) errors.push("Missing tool: docs_search");
    if (!names.includes("docs_get")) errors.push("Missing tool: docs_get");
    if (!names.includes("docs_cite")) errors.push("Missing tool: docs_cite");

    sendRequest(proc, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "docs_search", arguments: { query: "back pain", mode: "mock" } },
    });
    const callResp = await readResponse(proc);
    if (callResp.error) throw new Error(callResp.error.message || "tools/call failed");
    const content = callResp.result?.content?.[0]?.text;
    if (!content) errors.push("docs_search returned no content");
    else {
      const payload = JSON.parse(content);
      const r = payload.receipt;
      if (!r) errors.push("docs_search response missing receipt");
      else {
        if (!r.request_id) errors.push("receipt missing request_id");
        if (!r.timestamp_utc) errors.push("receipt missing timestamp_utc");
        if (!r.upstream) errors.push("receipt missing upstream");
        if (r.mode !== "mock") errors.push("receipt mode expected mock, got " + r.mode);
      }
    }
  } finally {
    proc.kill("SIGTERM");
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-docs: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
