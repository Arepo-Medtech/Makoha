/**
 * tooluniverse-gateway — pure security core (FLOW_PLAN H5, #28 mims-harvard/ToolUniverse,
 * Apache-2.0, pinned v1.3.1 = 9b7ff91d, floor v1.3.0).
 *
 * Fable-5-authored: this file is the SECURITY BOUNDARY, deliberately separated
 * from the MCP transport plumbing (index.js) so the boundary is pure and
 * unit-testable WITHOUT a running ToolUniverse process. Every claim the H5 exit
 * makes — executor unreachable, auth required, egress bounded, Receipt emitted,
 * fail-safe absence — is enforced here and asserted in contract-tooluniverse-gateway.js.
 *
 * WHY THIS MATTERS. ToolUniverse aggregates 600–1000+ scientific tools. Among them
 * are CODE-EXECUTION tools (python_code_executor / python_script_runner /
 * read_executed_notebook). v1.3.0 patched an UNAUTHENTICATED remote-code-execution
 * hole in python_code_executor. We adopt the library ONLY behind our own auth, with
 * the executor DISABLED at config AND PROVEN UNREACHABLE by invocation. The proof is
 * not "a flag is set" — it is that executeTool() REFUSES an executor name and NEVER
 * forwards it to the subprocess (the injected `forward` seam is never called).
 *
 * LAYERED DEFENCE (each fails closed; layers 1–2 are proven runtime-independently):
 *   1. Deny-list (HERE, primary)  — executor tool names are refused before any
 *      subprocess forward, INDEPENDENT of auth. The forward seam is never reached.
 *   2. Launch config (launch-spec.js) — compact_mode + exclude_tools so the executor
 *      is never even loaded in the subprocess.
 *   3. Auth (HERE)               — the RCE was UNAUTHENTICATED; every reaching call
 *      needs a Breath-Ezy auth principal or it is refused before routing.
 *   4. Egress allow-list (egress-allowlist.js) — a hypothetical executed tool cannot
 *      reach an unlisted host (default-deny).
 *   5. Fail-safe absence (HERE)  — runtime absent → { available:false } + receipt;
 *      NEVER a fabricated tool result (H4 Synthea precedent).
 *
 * STANDING STOP CONDITION (operator, H5): if the executor ever appears reachable
 * (the forward seam is called for an executor name) or the runtime forces it on,
 * STOP and report — do not work around it. The contract test turning RED here is
 * that stop signal.
 */
import { normaliseMode } from "../../../verification/mode.js";
import { assertEgressAllowed } from "./egress-allowlist.js";

/** Self-identify via `upstream` — receipt.schema.json's `server` enum lists only the
 *  7 original servers, so a harvested server omits `server` and names itself here
 *  (same convention as the H2 evidence servers). */
export const UPSTREAM = "heydoc-mcp-tooluniverse-gateway";

/**
 * Harvested retrieval/answer paths are NOT patient-eligible at H5. Every gateway
 * tool output carries patient_eligible:false; retrieval-type tools are additionally
 * MIRAGE-gated (H3) and, on top, governance-gated (H7) before any future eligibility.
 * The gateway NEVER sets this true. (FLOW_PLAN §1 evidence-verified-trust.)
 */
export const PATIENT_ELIGIBLE = false;

/**
 * The EXACT code-execution tool names in ToolUniverse v1.3.1 (read from the pinned
 * source: src/tooluniverse/data/python_executor_tools.json +
 * executed_notebook_tools.json). All are DENIED. Keep this list in lockstep with the
 * pin — a version bump that adds a new executor MUST be added here (and to the
 * launch-spec exclude set) under a plan.
 */
export const EXECUTOR_TOOLS = [
  "python_code_executor",
  "python_script_runner",
  "read_executed_notebook",
];

/** Canonical form for matching: lowercase, strip EVERYTHING non-alphanumeric.
 *  Defeats separator / case / zero-width / unicode-spacing evasion so
 *  "python_code_executor", "Python Code Executor", "python-code‑executor",
 *  "python​code​executor" all canonicalise identically. */
export function canonicaliseToolName(name) {
  return String(name == null ? "" : name)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const EXECUTOR_CANON = new Set(EXECUTOR_TOOLS.map(canonicaliseToolName));

/**
 * Defensive SHAPE guard on the canonical name — over-blocks by design. Per the
 * charter, ambiguous safety is treated as unsafe: a wrongly-refused benign tool is
 * recoverable (allow it under a plan), a leaked code executor is catastrophic. This
 * catches renamed/aliased execution surfaces a future version might introduce.
 * Legitimate ToolUniverse tools (FDA_*, PubMed_*, OpenTargets_*, …) do not match.
 */
const EXECUTOR_SHAPE_RE =
  /(codeexec|execcode|executecode|codeexecutor|scriptrunner|runpython|pythonrun|runcode|execnotebook|notebookexec|executenotebook|runnotebook|notebookrun|evalcode|codeeval|interpreter|repl|subprocess|ossystem|shellexec|execshell|spawnprocess|runshell)/;

/**
 * Is this tool name a code-execution surface that must be refused? Matches the exact
 * known executors AND the defensive shape guard, on the canonical form.
 * @param {string} name
 * @returns {boolean}
 */
export function isExecutorTool(name) {
  const canon = canonicaliseToolName(name);
  if (!canon) return false;
  if (EXECUTOR_CANON.has(canon)) return true;
  return EXECUTOR_SHAPE_RE.test(canon);
}

/**
 * OTHER dangerous tool FAMILIES in ToolUniverse v1.3.1 that either execute code
 * indirectly or run an AUTONOMOUS agent loop — both barred here. Confirmed against the
 * pinned source's tool inventory (2620 tools across data/*.json):
 *   - MCPAutoLoaderTool (`mcp_auto_loader_*`)  — spawns/loads OTHER MCP servers (process/code loading)
 *   - AgenticTool / SmolAgentTool / CallAgent  — autonomous agent loops (breaches augmented-not-autonomous, §1)
 *   - ComposeTool / *Pipeline / *Workflow / ToolGraph* — chain tool graphs; can reach the executor indirectly
 *   - Replicate_run_prediction                 — runs remote model compute
 *   - the meta `execute_tool` (ExecuteTool)     — ToolUniverse's own generic dispatch (never forward the meta-dispatcher)
 * This is a HARD deny, matched on the canonical form. It is a belt behind the primary
 * default-deny allow-list below — a defence-in-depth so these can never be reached
 * even if an allow-list were mis-widened.
 */
const DANGEROUS_FAMILY_RE =
  /(mcpautoloader|autoloader|mcploader|smolagent|callagent|callagentichuman|agentictool|deepresearch|composetool|compose|toolgraph|toolcomposition|toolfinder|tooldiscover|pipeline|workflow|replicaterun|runprediction|metaanalysisrun|unifiedtoolgenerator)/;

/** The meta-dispatch name is our OWN envelope; it must never be forwarded to the
 *  subprocess as a tool to run (that would be ToolUniverse's generic executor). */
const META_DISPATCH_CANON = new Set(["executetool", "calltool", "runtool"]);

/**
 * Is this tool an autonomous-agent / loader / composition / meta-dispatch surface
 * that must be refused (distinct from the raw code executors)?
 * @param {string} name
 * @returns {boolean}
 */
export function isAutonomousOrLoaderTool(name) {
  const canon = canonicaliseToolName(name);
  if (!canon) return false;
  if (META_DISPATCH_CANON.has(canon)) return true;
  // `*_agent` / `*Agent` naming (SmolAgentTool, AgenticTool instances) that the family
  // regex might miss when the word "agent" is a bare suffix.
  if (/agent$/.test(canon) || /^agent/.test(canon)) return true;
  return DANGEROUS_FAMILY_RE.test(canon);
}

/** Any hard-denied tool: a raw code executor OR an autonomous/loader/compose surface. */
export function isHardDeniedTool(name) {
  return isExecutorTool(name) || isAutonomousOrLoaderTool(name);
}

/**
 * DEFAULT-DENY allow-list gate (the PRIMARY reachability control). The gateway
 * forwards a tool ONLY if its name is on the caller-supplied allow-list of vetted
 * retrieval tools; every other name — including any of the 2600+ tools we have not
 * vetted, and anything unknown — is refused. This matches the repo's default-deny
 * posture (context-allowlist C7, egress allow-list) and the charter fail-safe: an
 * un-vetted capability is BLOCKED, never forwarded on trust. Widening the allow-list
 * is a plan-gated change.
 *
 * @param {string} name
 * @param {Set<string>|string[]|undefined} allow  vetted tool names
 * @returns {boolean}
 */
export function isAllowlistedTool(name, allow) {
  if (!allow) return false; // no policy supplied ⇒ deny all (fail-safe)
  const set = allow instanceof Set ? allow : new Set(allow);
  return set.has(String(name));
}

/** Common Receipt (receipt.schema.json); `server` omitted deliberately (see UPSTREAM). */
export function makeReceipt(mode, extra = {}) {
  return {
    request_id: `tugw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp_utc: new Date().toISOString(),
    upstream: UPSTREAM,
    mode,
    tool: "execute_tool",
    ...extra,
  };
}

/**
 * Auth gate. The RCE was UNAUTHENTICATED — auth is a hard wall. A reaching call must
 * present a bearer token that matches the gateway's configured expected token, which
 * is a SECRETS-MANAGER REFERENCE resolved at deploy (never a literal in the repo).
 *
 * Posture:
 *  - If an expected token is configured (env), the call's auth.token must equal it.
 *  - If NO expected token is configured (dev/mock with no auth wired), a call is
 *    still required to carry SOME auth principal, so an anonymous/unauthenticated
 *    invocation is refused in every mode — an unauthenticated path is exactly the
 *    v1.3.0 RCE precondition and must never exist here.
 *
 * @param {{auth?:{token?:string, principal?:string}}} input
 * @param {Record<string,string|undefined>} env
 * @returns {{ok:true, principal:string}|{ok:false, reason:string}}
 */
export function checkAuth(input, env) {
  const auth = input && input.auth;
  const token = auth && typeof auth.token === "string" ? auth.token : null;
  const principal = auth && typeof auth.principal === "string" ? auth.principal : null;
  const expected = (env.HEYDOC_TOOLUNIVERSE_AUTH_TOKEN || "").trim();
  if (expected) {
    if (!token || token !== expected) {
      return { ok: false, reason: "AUTH_REQUIRED: missing or invalid Breath-Ezy bearer token for tooluniverse-gateway" };
    }
    return { ok: true, principal: principal || "tooluniverse-caller" };
  }
  // No expected token configured: still refuse an anonymous call — there is no
  // unauthenticated path to any tool, ever.
  if (!token && !principal) {
    return { ok: false, reason: "AUTH_REQUIRED: no auth principal presented; the gateway has no unauthenticated path (RCE precondition)" };
  }
  return { ok: true, principal: principal || "tooluniverse-caller" };
}

/**
 * Decide the route for a NON-executor, AUTHENTICATED call. Pure (no I/O). Mirrors the
 * H2 evidence servers' chooseEvidenceRoute:
 *   { kind:"dry_run" }                — validated, no call
 *   { kind:"absent",  mode }          — runtime input-gated (no distribution) → fail-safe
 *   { kind:"live",    cfg }           — forward to the external ToolUniverse process
 *   { kind:"blocked", mode:"live" }   — live context but no endpoint (mock-never-as-live)
 *
 * `runtime` is the located distribution (launch-spec.locateToolUniverse), null when absent.
 *
 * F3 fix: a real subprocess forward happens ONLY in a live context. dev/mock NEVER
 * makes a real upstream call — so a genuine external call can never be stamped
 * mode:"mock" (which the ledger would mis-classify as synthetic). In mock/dev the
 * honest state is input-gated absence; execution requires an explicit live context.
 * @param {Record<string,string|undefined>} env
 * @param {string|undefined} requestedMode
 * @param {string} defaultMode
 * @param {object|null} runtime
 */
export function chooseToolRoute(env, requestedMode, defaultMode, runtime) {
  const { context_mode } = normaliseMode(requestedMode || defaultMode);
  if (context_mode === "dry_run") return { kind: "dry_run", mode: "dry_run" };
  if (context_mode !== "live") {
    // dev/mock context: never forward to a real subprocess (no live-as-mock). The
    // honest state is input-gated absence — never a fabricated result.
    return { kind: "absent", mode: context_mode };
  }
  // live context: require a located runtime; never serve absence under a live receipt.
  return runtime ? { kind: "live", cfg: runtime, mode: "live" } : { kind: "blocked", mode: "live" };
}

/** Build a fail-closed refusal envelope (shared shape). */
function refuse(name, block_reason, mode, code, message) {
  return {
    ok: false,
    blocked: true,
    block_reason,
    detail: message,
    patient_eligible: PATIENT_ELIGIBLE,
    receipt: makeReceipt(mode, { requested_tool: name, error: { code, message, retryable: false } }),
  };
}

/**
 * The gateway envelope: execute_tool(name, args) → { result, receipt } with the full
 * security boundary applied, in fail-closed order. PURE except for the injected
 * `forward` seam (the only thing that touches the subprocess); tests pass a spy for
 * `forward` and assert it is NEVER called for a hard-denied or non-allowlisted name.
 *
 * Gate order (each fails closed; a denied call NEVER reaches `forward`):
 *   1. hard-deny   — code executors + autonomous/loader/compose surfaces, independent of auth
 *   2. auth        — no unauthenticated path
 *   3. allow-list  — DEFAULT-DENY: only vetted retrieval tools may proceed
 *   4. route       — dry_run / absent (dev) / live / blocked
 *   5. egress      — a live forward is bounded to the tool's declared, allow-listed host
 *
 * @param {object} p
 * @param {string} p.name                 requested ToolUniverse tool name
 * @param {object} [p.args]               tool arguments (opaque; forwarded only on the live path)
 * @param {{auth?:object, mode?:string}} [p.input]  the raw tool input (auth + mode)
 * @param {Record<string,string|undefined>} p.env
 * @param {string} p.defaultMode
 * @param {object|null} p.runtime         located distribution, or null when absent
 * @param {Map<string,{host?:string}>|Record<string,{host?:string}>} [p.vetted]
 *        DEFAULT-DENY allow-list: vetted tool name → { host } (its declared upstream)
 * @param {string[]} [p.egressAllow]      egress host allow-list (defaults to the declared set)
 * @param {(cfg:object, name:string, args:object)=>Promise<{ok:boolean, result?:any, error?:object}>} [p.forward]
 *        subprocess seam — MUST NOT be reachable for a denied/non-allowlisted name
 * @returns {Promise<object>} envelope
 */
export async function executeTool({ name, args = {}, input = {}, env, defaultMode, runtime, vetted, egressAllow, forward }) {
  const requestedMode = input.mode;
  const vettedMap = vetted instanceof Map ? vetted : new Map(Object.entries(vetted || {}));

  // ── GATE 1: HARD-DENY — code execution + autonomous/loader/compose surfaces. ──
  // Runtime-independent, independent of auth: refuse BEFORE any forward. This is the
  // primary proof point. Raw executors get the specific EXECUTOR reason; the
  // agentic/loader/compose family (which can execute code indirectly or run an
  // autonomous loop) gets its own reason. Neither ever reaches `forward`.
  if (isExecutorTool(name)) {
    return refuse(
      name, "EXECUTOR_DISABLED_UNREACHABLE", "blocked", "EXECUTOR_DISABLED_UNREACHABLE",
      `code-execution tool "${name}" is permanently disabled and unreachable through the tooluniverse-gateway (G2). ` +
        `python_code_executor / python_script_runner / read_executed_notebook are never forwarded, with or without auth. No code executes by any path.`
    );
  }
  if (isAutonomousOrLoaderTool(name)) {
    return refuse(
      name, "AUTONOMOUS_OR_LOADER_DISABLED", "blocked", "AUTONOMOUS_OR_LOADER_DISABLED",
      `tool "${name}" is an autonomous-agent / MCP-loader / composition / meta-dispatch surface and is disabled (G2, augmented-not-autonomous §1). ` +
        `These can execute code indirectly or act autonomously and are never forwarded.`
    );
  }

  // ── GATE 2: auth — no unauthenticated path to any tool (RCE precondition). ────
  const auth = checkAuth(input, env);
  if (!auth.ok) {
    return refuse(name, "AUTH_REQUIRED", "blocked", "AUTH_REQUIRED", auth.reason);
  }

  // ── GATE 3: DEFAULT-DENY allow-list — only vetted retrieval tools proceed. ────
  // A blocklist against a 600-1000+ tool library that ships its own composition layer
  // cannot be complete (reviewer F1). So the reachability control is inverted:
  // anything not explicitly vetted is refused, never forwarded on trust.
  if (!isAllowlistedTool(name, new Set(vettedMap.keys()))) {
    return refuse(
      name, "TOOL_NOT_ALLOWLISTED", "blocked", "TOOL_NOT_ALLOWLISTED",
      `tool "${name}" is not on the gateway's vetted retrieval allow-list (default-deny). ` +
        `Only explicitly vetted retrieval tools are reachable; widening the allow-list is a plan-gated change.`
    );
  }

  // ── GATE 4: route the authenticated, allow-listed call. ──────────────────────
  const route = chooseToolRoute(env, requestedMode, defaultMode, runtime);

  if (route.kind === "dry_run") {
    return { ok: true, result: null, patient_eligible: PATIENT_ELIGIBLE, receipt: makeReceipt("dry_run", { requested_tool: name }), message: "dry_run: validated (not executed)" };
  }

  if (route.kind === "absent") {
    // INPUT-GATED, not hidden (H4 Synthea precedent). No runtime → no fabricated
    // tool output, ever. Live execution is input-gated on the runtime + API keys.
    return {
      ok: false,
      available: false,
      reason: "input-gated: ToolUniverse runtime absent",
      detail:
        "no ToolUniverse distribution located (set HEYDOC_TOOLUNIVERSE_CMD to a runnable SMCP entrypoint " +
        "and provide a Python runtime + API keys via the secrets manager). The gateway never fabricates a tool result.",
      patient_eligible: PATIENT_ELIGIBLE,
      receipt: makeReceipt(route.mode, { requested_tool: name }),
    };
  }

  if (route.kind === "blocked") {
    // live context but no located runtime — BLOCK, never absence-as-live.
    return {
      ok: false,
      blocked: true,
      block_reason: "BLOCKED_NO_RUNTIME",
      detail: "live context but no ToolUniverse runtime located; absence must not be served under a live receipt",
      patient_eligible: PATIENT_ELIGIBLE,
      receipt: makeReceipt("live", { requested_tool: name, error: { code: "NO_LIVE_RUNTIME", message: "tooluniverse runtime unset in live context", retryable: false } }),
    };
  }

  // ── GATE 5: egress — a live forward is bounded to the tool's declared host. ──
  // F2 fix: the egress allow-list is now ENFORCED on the forward path (previously it
  // was a tested-but-unwired module). Each vetted tool declares its upstream host;
  // the forward is refused fail-closed if that host is not on the allow-list (or the
  // tool declares no host). Default-deny — a tool can only reach a declared, listed host.
  const declaredHost = vettedMap.get(name) && vettedMap.get(name).host;
  if (!declaredHost) {
    return refuse(name, "EGRESS_UNKNOWN_HOST", "blocked", "EGRESS_UNKNOWN_HOST",
      `vetted tool "${name}" declares no upstream host; refusing to forward with an unbounded egress target (default-deny).`);
  }
  try {
    assertEgressAllowed(declaredHost, egressAllow);
  } catch (err) {
    return refuse(name, "EGRESS_BLOCKED", "blocked", "EGRESS_BLOCKED", String(err && err.message || err));
  }

  // ── live path: forward to the external ToolUniverse process via the seam. ────
  if (typeof forward !== "function") {
    // No transport wired yet (input-gated). Fail-safe: no fabricated result.
    return {
      ok: false,
      available: false,
      reason: "input-gated: ToolUniverse transport not wired",
      patient_eligible: PATIENT_ELIGIBLE,
      receipt: makeReceipt(route.mode, { requested_tool: name, error: { code: "LIVE_NOT_WIRED", message: "subprocess transport adapter not connected (input-gated)", retryable: true } }),
    };
  }
  try {
    const out = await forward(route.cfg, name, args);
    if (!out || out.ok !== true) {
      return { ok: false, result: null, patient_eligible: PATIENT_ELIGIBLE, receipt: makeReceipt(route.mode, { requested_tool: name, error: out && out.error ? out.error : { code: "TOOL_CALL_FAILED", message: "ToolUniverse tool call failed", retryable: true } }) };
    }
    return { ok: true, result: out.result, patient_eligible: PATIENT_ELIGIBLE, receipt: makeReceipt(route.mode, { requested_tool: name }) };
  } catch (err) {
    // Fail-safe: any transport error → no fabrication, error-carrying receipt.
    return { ok: false, result: null, patient_eligible: PATIENT_ELIGIBLE, receipt: makeReceipt(route.mode, { requested_tool: name, error: { code: "TOOL_CALL_THREW", message: String(err && err.message || err).slice(0, 200), retryable: true } }) };
  }
}
