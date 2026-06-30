/**
 * Contract tests for the knowledge MCP server (mock).
 * Asserts: tools list includes kg_query/kg_provenance/kg_upsert/kg_export;
 * kg_query on a curated dataset returns rows + dataset_version + sha256 checksum +
 * receipt; kg_query on a graph_kind returns EMPTY (not fabricated); kg_provenance
 * returns dataset lineage; kg_upsert is SAFE_STUB (status 'unavailable', no fake
 * revision); query filtering by key works.
 * Run from repo root: node test/contract-knowledge.js
 */
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const serverPath = join(repoRoot, "mcp/servers/knowledge/index.js");

async function run() {
  const errors = [];
  const proc = spawn("node", [serverPath], { cwd: repoRoot, env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" }, stdio: ["pipe", "pipe", "pipe"] });
  proc.stderr.on("data", (d) => process.stderr.write(d));
  const pending = new Map();
  const rl = createInterface(proc.stdout);
  rl.on("line", (line) => { let m; try { m = JSON.parse(line); } catch { return; } if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const rpc = (id, method, params) => new Promise((res) => { pending.set(id, res); proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const notify = (method) => proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  let id = 100;
  const query = async (args) => JSON.parse((await rpc(++id, "tools/call", { name: "kg_query", arguments: args })).result.content[0].text);

  try {
    const init = await rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "contract-test", version: "0.1.0" } });
    if (init.error) throw new Error(init.error.message || "init failed");
    notify("notifications/initialized");

    const names = ((await rpc(3, "tools/list")).result?.tools ?? []).map((t) => t.name);
    for (const t of ["kg_query", "kg_provenance", "kg_upsert", "kg_export"]) if (!names.includes(t)) errors.push("missing tool: " + t);

    // dataset query
    const benign = await query({ graph_kind: "benign-registry", mode: "mock" });
    if (!(benign.rows.length > 0)) errors.push("benign-registry returned no rows");
    if (!/^benign-registry:/.test(benign.dataset_version || "")) errors.push("missing dataset_version");
    if (!/^sha256:[a-f0-9]{64}$/.test(benign.checksum || "")) errors.push("missing/invalid checksum");
    if (benign.receipt?.mode !== "mock") errors.push("receipt mode not mock");

    // query filter by key
    const filtered = await query({ graph_kind: "redflags-bank", query: "low_back_pain", mode: "mock" });
    if (!(filtered.rows.length === 1 && filtered.rows[0].key === "low_back_pain")) errors.push("query filter by key failed");

    // graph_kind -> empty, NOT fabricated
    const ctx = await query({ graph_kind: "ContextGraph", mode: "mock" });
    if (!(Array.isArray(ctx.rows) && ctx.rows.length === 0 && /empty/.test(ctx.note || ""))) errors.push("ContextGraph should be empty + noted");

    // unknown dataset -> empty
    const unknown = await query({ graph_kind: "not-a-dataset", mode: "mock" });
    if (unknown.rows.length !== 0) errors.push("unknown dataset should return no rows");

    // provenance
    const prov = JSON.parse((await rpc(++id, "tools/call", { name: "kg_provenance", arguments: { graph_kind: "axis-b-templates" } })).result.content[0].text);
    if (!/^axis-b-templates:/.test(prov.lineage?.dataset_version || "")) errors.push("provenance missing dataset_version");

    // upsert SAFE_STUB
    const up = JSON.parse((await rpc(++id, "tools/call", { name: "kg_upsert", arguments: { graph_kind: "ContextGraph", key: "k", payload: {} } })).result.content[0].text);
    if (!(up.status === "unavailable" && up.revision === null)) errors.push("kg_upsert should be unavailable with null revision (no fabrication)");
  } finally {
    proc.kill("SIGTERM");
  }

  if (errors.length) { console.error("Contract failures:", errors); process.exit(1); }
  console.log("contract-knowledge: OK");
}

run().catch((e) => { console.error(e); process.exit(1); });
