/**
 * Contract tests for the fhir-broker MCP server (mock).
 * Asserts: tools list includes fhir_read/fhir_search/fhir_write; fhir_read returns a
 * typed resource; fhir_search returns a searchset Bundle incl. the lab Observation
 * (LOINC 2823-3) with its raw value; fhir_write is SAFE_STUB ('unavailable', null
 * result); receipt mode=mock.
 * Run from repo root: node test/contract-fhir-broker.js
 */
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const serverPath = join(repoRoot, "mcp/servers/fhir-broker/index.js");

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
  const call = async (name, args) => JSON.parse((await rpc(++id, "tools/call", { name, arguments: args })).result.content[0].text);

  try {
    const init = await rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ct", version: "0.1.0" } });
    if (init.error) throw new Error(init.error.message);
    notify("notifications/initialized");
    const names = ((await rpc(3, "tools/list")).result?.tools ?? []).map((t) => t.name);
    for (const t of ["fhir_read", "fhir_search", "fhir_write"]) if (!names.includes(t)) errors.push("missing tool: " + t);

    const read = await call("fhir_read", { resource_type: "Patient", mode: "mock" });
    if (read.resource?.resourceType !== "Patient") errors.push("fhir_read Patient did not return a Patient");
    if (read.receipt?.mode !== "mock") errors.push("receipt mode not mock");

    const search = await call("fhir_search", { resource_type: "Observation", mode: "mock" });
    if (search.bundle?.resourceType !== "Bundle") errors.push("fhir_search did not return a Bundle");
    const obs = (search.bundle.entry || []).map((e) => e.resource);
    const k = obs.find((o) => o.code?.coding?.some((c) => c.code === "2823-3"));
    if (!k || k.valueQuantity?.value !== 6.8) errors.push("lab Observation (potassium 2823-3, 6.8) missing");

    const write = await call("fhir_write", { resource_type: "Observation", resource: {} });
    if (!(write.status === "unavailable" && write.result === null)) errors.push("fhir_write should be unavailable with null result");
  } finally {
    proc.kill("SIGTERM");
  }
  if (errors.length) { console.error("Contract failures:", errors); process.exit(1); }
  console.log("contract-fhir-broker: OK");
}
run().catch((e) => { console.error(e); process.exit(1); });
