/**
 * Contract tests for the messaging-geo MCP server (mock).
 * Asserts: tools list includes msg_send/geo_locate/pharmacy_search; msg_send NEVER
 * sends (status 'mock_not_sent'), redacts the recipient, and does not echo the 'to'
 * value; geo_locate + pharmacy_search return mock results; receipt mode=mock.
 * Run from repo root: node test/contract-messaging-geo.js
 */
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const serverPath = join(repoRoot, "mcp/servers/messaging-geo/index.js");

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
  const call = async (name, args) => { const r = await rpc(++id, "tools/call", { name, arguments: args }); return { text: r.result.content[0].text, obj: JSON.parse(r.result.content[0].text) }; };

  try {
    const init = await rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ct", version: "0.1.0" } });
    if (init.error) throw new Error(init.error.message);
    notify("notifications/initialized");
    const names = ((await rpc(3, "tools/list")).result?.tools ?? []).map((t) => t.name);
    for (const t of ["msg_send", "geo_locate", "pharmacy_search"]) if (!names.includes(t)) errors.push("missing tool: " + t);

    const secret = "0400-secret-999";
    const msg = await call("msg_send", { channel: "sms", to: secret, template_id: "t1", mode: "mock" });
    if (msg.obj.delivery_receipt?.status !== "mock_not_sent") errors.push("msg_send should be mock_not_sent (never sends)");
    if (msg.obj.delivery_receipt?.recipient_redacted !== true) errors.push("msg_send should mark recipient redacted");
    if (msg.text.includes(secret)) errors.push("msg_send must NOT echo the recipient address (patient-data minimisation)");
    if (msg.obj.receipt?.mode !== "mock") errors.push("receipt mode not mock");

    const geo = await call("geo_locate", { signal: "postcode:6000", mode: "mock" });
    if (typeof geo.obj.coords?.lat !== "number") errors.push("geo_locate should return coords");

    const ph = await call("pharmacy_search", { coords: { lat: -31.95, lng: 115.86 }, open_now: true, mode: "mock" });
    if (!(Array.isArray(ph.obj.candidates) && ph.obj.candidates.length > 0)) errors.push("pharmacy_search should return candidates");
  } finally {
    proc.kill("SIGTERM");
  }
  if (errors.length) { console.error("Contract failures:", errors); process.exit(1); }
  console.log("contract-messaging-geo: OK");
}
run().catch((e) => { console.error(e); process.exit(1); });
