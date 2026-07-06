/**
 * Minimal MCP stdio JSON-RPC client for the MIRAGE harness (FLOW_PLAN H3).
 *
 * The harness drives each retrieval path as an EXTERNAL process over stdio —
 * exactly as the H2 contract tests do (test/contract-evidence-*.js) — so it scores
 * the path AS BUILT, reading its real Receipt/EvidenceNode output, and never
 * imports server internals. One client is spawned per path, initialised once, then
 * reused for every question (request/response correlated by JSON-RPC id), and
 * closed at the end. Mock is the default mode; no network at scoring time.
 *
 * This client is deliberately tiny: no ret/timeout tuning beyond a guard, no MCP
 * SDK dependency on the client side — the servers speak line-delimited JSON-RPC.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export class McpStdioClient {
  /**
   * @param {string} serverPath absolute path to the server's index.js
   * @param {Record<string,string>} [env] extra env (HEYDOC_MODE_DEFAULT defaults to "mock")
   */
  constructor(serverPath, env = {}) {
    this.serverPath = serverPath;
    this.env = env;
    this.proc = null;
    this.rl = null;
    this._id = 0;
    this._pending = new Map();
  }

  async start() {
    this.proc = spawn("node", [this.serverPath], {
      env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock", ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Swallow server stderr (mock servers are quiet; we don't want it on our stream).
    this.proc.stderr.on("data", () => {});
    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return; // non-JSON line — ignore
      }
      if (msg.id != null && this._pending.has(msg.id)) {
        const { resolve } = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        resolve(msg);
      }
    });
    await this._rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mirage-bench", version: "0.1.0" },
    });
    this._notify("notifications/initialized");
  }

  _send(obj) {
    this.proc.stdin.write(JSON.stringify(obj) + "\n");
  }
  _notify(method, params) {
    this._send({ jsonrpc: "2.0", method, params });
  }
  _rpc(method, params) {
    const id = ++this._id;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._send({ jsonrpc: "2.0", id, method, params });
      // Guard: never hang CI if a server dies mid-call.
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`MCP call timed out: ${method} on ${this.serverPath}`));
        }
      }, 15000).unref?.();
    });
  }

  async listTools() {
    const resp = await this._rpc("tools/list", {});
    if (resp.error) throw new Error(resp.error.message || "tools/list failed");
    return (resp.result?.tools ?? []).map((t) => t.name);
  }

  /** Call a tool and return the PARSED JSON payload from its text content. */
  async callTool(name, args) {
    const resp = await this._rpc("tools/call", { name, arguments: args });
    if (resp.error) throw new Error(resp.error.message || `tools/call ${name} failed`);
    const textContent = resp.result?.content?.[0]?.text;
    return textContent ? JSON.parse(textContent) : null;
  }

  close() {
    try {
      this.rl?.close();
    } catch {}
    try {
      this.proc?.kill("SIGTERM");
    } catch {}
  }
}
