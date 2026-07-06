/**
 * tooluniverse-gateway — SMCP launch-spec builder + runtime locator (FLOW_PLAN H5).
 *
 * ToolUniverse (Python) runs OUT-OF-PROCESS behind a CLI/MCP boundary — no Python is
 * vendored into this Node repo and no in-process contamination occurs (the H1
 * fhir-live / H4 synthea precedent). This module (a) LOCATES a runnable distribution
 * (null when absent → the gateway fail-safes), and (b) builds the launch SPEC that
 * DISABLES every code-execution surface at config — the second, config-level proof
 * layer behind the runtime-independent deny-list in tool-gateway.js.
 *
 * The spec is a PURE value so the contract test can assert, without spawning anything,
 * that it ALWAYS carries compact_mode + the FULL executor exclude set + hooks off. If
 * an executor name is ever missing from the exclude set the test goes RED — that is
 * the standing STOP signal, not a thing to work around.
 *
 * Mapping to the real ToolUniverse v1.3.1 SMCP knobs (src/tooluniverse/smcp.py):
 *   compact_mode=True      → auto_expose_tools=False; only the ~4-5 discovery core tools
 *   exclude_tools=[...]    → named tools are never loaded/exposed
 *   hooks_enabled=False    → no output hooks (extended_hooks / output_hook off)
 *   host="127.0.0.1"       → loopback bind; TOOLUNIVERSE_API_TOKEN → bearer required off-loopback
 */
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EXECUTOR_TOOLS } from "./tool-gateway.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The commit/version this wrapper targets, read from the harvest manifest (single
 *  source of truth). The RCE floor rides along so the launch note can state it. */
export function tooluniversePin() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "integration/harvest-manifest.json"), "utf8"));
  const el = manifest.elements.find((e) => e.ref === "28");
  return el
    ? { repo: el.repo, url: el.url, commit: el.pinned_commit, version: el.pinned_version, rce_floor: el.rce_floor, licence: el.licence }
    : null;
}

/** The ≤5 core tools exposed in compact mode (the AITIP discovery surface). The
 *  gateway's `execute_tool` envelope is our name for compact-mode's call/dispatch.
 *  These are the ONLY tools the gateway exposes; the full library is reached via
 *  execute_tool(name, args), never by registering 1000+ tools. */
export const COMPACT_CORE_TOOLS = ["execute_tool", "list_tools", "find_tools", "get_tool_info"];

/**
 * Named dangerous tools excluded at CONFIG level (defence-in-depth behind compact_mode
 * and the Node default-deny allow-list). compact_mode already sets
 * auto_expose_tools=False so only the ≤5 discovery tools are exposed; this explicit
 * list additionally names the code-execution + representative autonomous/loader/compose
 * surfaces so they are excluded even if a future config re-enabled auto-exposure.
 * NOTE: the AUTHORITATIVE reachability gate is the Node allow-list in tool-gateway.js
 * (a name blocklist cannot be complete against a 600-1000+ tool library); this is a
 * belt, not the trousers.
 */
export const HARD_EXCLUDE_TOOLS = [
  ...EXECUTOR_TOOLS,
  "execute_tool", // ToolUniverse's own meta-dispatch (never expose the generic executor)
  "mcp_auto_loader_txagent",
  "mcp_auto_loader_boltz",
  "mcp_auto_loader_esm",
  "mcp_auto_loader_uspto_downloader",
  "CallAgent",
  "call_agentic_human",
  "open_deep_research_agent",
  "advanced_literature_search_agent",
  "ComprehensiveDrugDiscoveryPipeline",
  "ToolGraphComposer",
  "Replicate_run_prediction",
];

/**
 * Build the SMCP launch specification. Deterministic and pure. `extraExcludes` lets a
 * deploy add more names; it can never REMOVE an executor — the executor exclude set is
 * unconditional.
 * @param {{extraExcludes?:string[]}} [opts]
 * @returns {{compact_mode:boolean, auto_expose_tools:boolean, hooks_enabled:boolean, host:string, exclude_tools:string[], expose_tools:string[], executor_disabled:boolean}}
 */
export function buildLaunchSpec(opts = {}) {
  const extra = Array.isArray(opts.extraExcludes) ? opts.extraExcludes : [];
  // The exclude set ALWAYS contains the full executor + hard-exclude list — never a subset.
  const exclude_tools = Array.from(new Set([...HARD_EXCLUDE_TOOLS, ...extra]));
  return {
    compact_mode: true, // → auto_expose_tools=False downstream
    auto_expose_tools: false,
    hooks_enabled: false,
    host: "127.0.0.1", // loopback only; TOOLUNIVERSE_API_TOKEN gives bearer auth off-loopback
    exclude_tools,
    expose_tools: [...COMPACT_CORE_TOOLS],
    executor_disabled: EXECUTOR_TOOLS.every((t) => exclude_tools.includes(t)),
  };
}

/**
 * Locate a runnable ToolUniverse SMCP distribution. Configured by env (no secrets — a
 * command reference): HEYDOC_TOOLUNIVERSE_CMD = a runnable SMCP entrypoint. Returns a
 * config object, or null when the toolchain is absent (→ the gateway fail-safes to
 * input-gated absence, H4 precedent). We do NOT probe the network here.
 * @param {Record<string,string|undefined>} env
 * @returns {{cmd:string, spec:object, pin:object|null}|null}
 */
export function locateToolUniverse(env = process.env) {
  const cmd = (env.HEYDOC_TOOLUNIVERSE_CMD || "").trim();
  if (!cmd) return null;
  if (cmd.startsWith("<") || cmd.includes("example.invalid")) return null; // placeholder → treat as absent
  // A path-style command must exist on disk; a bare command name is taken on trust
  // (resolved on PATH at spawn) — mirrors locateSynthea's jar-existence check.
  if ((cmd.startsWith("/") || cmd.startsWith("./")) && !existsSync(cmd.split(" ")[0])) return null;
  return { cmd, spec: buildLaunchSpec(), pin: tooluniversePin() };
}
