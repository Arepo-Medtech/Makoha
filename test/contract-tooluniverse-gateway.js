/**
 * Contract tests — tooluniverse-gateway (FLOW_PLAN H5, #28 mims-harvard/ToolUniverse).
 * <test_and_evaluation_gates>: deterministic safety code must be tested. This is the
 * HIGHEST security surface in the harvest, so the test is adversarial and proves the
 * H5 exit state MECHANICALLY, not by inspecting a config flag. It also locks in the
 * fixes for the four findings the adversarial security review raised:
 *
 *   PROOF 1 (invocation)  — execute_tool refuses every code-execution tool AND the
 *     autonomous/loader/compose family (F1) AND anything not on the vetted allow-list
 *     (default-deny), BEFORE any subprocess forward: the injected `forward` spy is
 *     NEVER called, with OR without auth.
 *   PROOF 2 (config)      — buildLaunchSpec() ALWAYS excludes every executor + the
 *     representative dangerous families + sets compact_mode.
 *   AUTH                  — no unauthenticated path.
 *   ALLOW-LIST            — DEFAULT-DENY: only vetted retrieval tools may forward (F1).
 *   EGRESS (F2)           — enforced THROUGH executeTool: a vetted tool whose declared
 *     host is off the allow-list is refused before forward (not just via the helper).
 *   NO LIVE-AS-MOCK (F3)  — dev/mock context never forwards to a real subprocess.
 *   RECEIPT               — every output carries the common Receipt; patient_eligible:false.
 *   FAIL-SAFE ABSENCE     — runtime absent → { available:false }, never a fabrication.
 *   MODE DEFAULT (F4)     — a staging/production env default normalises to a valid enum.
 *
 * No network, no ToolUniverse runtime, no case files touched. Run from repo root:
 *   node test/contract-tooluniverse-gateway.js
 */
import {
  executeTool,
  isExecutorTool,
  isAutonomousOrLoaderTool,
  isHardDeniedTool,
  isAllowlistedTool,
  canonicaliseToolName,
  checkAuth,
  chooseToolRoute,
  EXECUTOR_TOOLS,
  UPSTREAM,
  PATIENT_ELIGIBLE,
} from "../mcp/servers/tooluniverse-gateway/tool-gateway.js";
import { buildLaunchSpec, locateToolUniverse, COMPACT_CORE_TOOLS, HARD_EXCLUDE_TOOLS } from "../mcp/servers/tooluniverse-gateway/launch-spec.js";
import { isEgressAllowed, assertEgressAllowed, DECLARED_EGRESS_HOSTS } from "../mcp/servers/tooluniverse-gateway/egress-allowlist.js";
import { normaliseMode } from "../verification/mode.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };
const throwsRe = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

const VALID_AUTH = { token: "ok-token", principal: "clinician-svc" };
const ENV = { HEYDOC_TOOLUNIVERSE_AUTH_TOKEN: "ok-token" };
// A vetted allow-list (name → declared upstream host on the egress list).
const VETTED = {
  PubMed_search_articles: { host: "eutils.ncbi.nlm.nih.gov" },
  FDA_get_drug_label_info: { host: "api.fda.gov" },
};
const base = (over = {}) => ({ env: ENV, defaultMode: "mock", runtime: null, vetted: VETTED, egressAllow: DECLARED_EGRESS_HOSTS, ...over });

// A spy standing in for the subprocess seam. If it is EVER called for a denied or
// non-allowlisted name, the boundary has failed.
function spyForward() {
  const calls = [];
  const fn = async (cfg, name, args) => { calls.push({ name, args }); return { ok: true, result: { echoed: name } }; };
  return { fn, calls };
}

// ── PROOF 1a: the raw code EXECUTORS are unreachable by invocation ─────────────
{
  const evasions = [
    "python_code_executor", "python_script_runner", "read_executed_notebook",
    "PYTHON_CODE_EXECUTOR", "Python Code Executor", "python-code-executor",
    "  python_code_executor  ", "python.code.executor", "pythoncodeexecutor",
    "python​code​executor", "ｐython_code_executor",
    "run_python_code", "code_executor", "exec_code", "code_interpreter", "python_repl",
    "run_notebook", "shell_exec", "subprocess_run", "os_system_call",
  ];
  for (const name of evasions) {
    // Even with VALID auth AND the name force-added to the allow-list, it must be denied.
    const spy = spyForward();
    const out = await executeTool(base({ input: { auth: VALID_AUTH, mode: "live" }, runtime: { cmd: "smcp" }, vetted: { ...VETTED, [name]: { host: "api.fda.gov" } }, forward: spy.fn, name }));
    check(`executor refused (even if allow-listed + auth + live): ${JSON.stringify(name)}`, out.ok === false && out.blocked === true);
    check(`executor forward NEVER called: ${JSON.stringify(name)}`, spy.calls.length === 0);
    check(`executor refusal carries a receipt: ${JSON.stringify(name)}`, out.receipt && out.receipt.mode === "blocked" && out.receipt.upstream === UPSTREAM && out.patient_eligible === false);
  }
}

// ── PROOF 1b: the AUTONOMOUS / LOADER / COMPOSE family is unreachable (F1) ──────
{
  // Confirmed against ToolUniverse v1.3.1's real tool surface — these bypass a
  // 3-name blocklist but can execute code indirectly or run an autonomous loop.
  const family = [
    "compose_tools", "ComprehensiveDrugDiscoveryPipeline", "BiomarkerDiscoveryWorkflow",
    "AgenticTool", "CompoundDiscoveryAgent", "open_deep_research_agent", "advanced_literature_search_agent",
    "MCPAutoLoader", "mcp_auto_loader_txagent", "mcp_auto_loader_boltz",
    "ToolFinderLLM", "ToolGraphComposer", "tool_composition", "CallAgent", "call_agentic_human",
    "execute_tool", "Replicate_run_prediction",
  ];
  for (const name of family) {
    const spy = spyForward();
    const out = await executeTool(base({ input: { auth: VALID_AUTH, mode: "live" }, runtime: { cmd: "smcp" }, vetted: { ...VETTED, [name]: { host: "api.fda.gov" } }, forward: spy.fn, name }));
    check(`family refused (F1): ${JSON.stringify(name)}`, out.ok === false && out.blocked === true && (out.block_reason === "AUTONOMOUS_OR_LOADER_DISABLED" || out.block_reason === "EXECUTOR_DISABLED_UNREACHABLE"));
    check(`family forward NEVER called (F1): ${JSON.stringify(name)}`, spy.calls.length === 0);
  }
}

// Deny-list holds with NO auth and on any mode (executor never reaches auth/route/forward).
{
  const spy = spyForward();
  const out = await executeTool(base({ input: { auth: undefined, mode: "mock" }, forward: spy.fn, name: "python_code_executor" }));
  check("executor refused even without auth", out.block_reason === "EXECUTOR_DISABLED_UNREACHABLE");
  check("executor: forward not called (no auth)", spy.calls.length === 0);
}
// Classification unit coverage.
check("isExecutorTool: all known executors true", EXECUTOR_TOOLS.every(isExecutorTool));
check("isAutonomousOrLoaderTool: family true", ["mcp_auto_loader_txagent", "CompoundDiscoveryAgent", "compose_tools", "open_deep_research_agent", "execute_tool", "CallAgent"].every(isAutonomousOrLoaderTool));
check("isHardDeniedTool: unions both", isHardDeniedTool("python_code_executor") && isHardDeniedTool("mcp_auto_loader_txagent"));
check("isHardDeniedTool: benign retrieval tools false", ["FDA_get_drug_label_info", "PubMed_search_articles", "OpenTargets_get_associated_targets", "UniProt_get_entry"].every((n) => !isHardDeniedTool(n)));
check("canonicalise strips separators/case", canonicaliseToolName("Python-Code_Executor") === "pythoncodeexecutor");

// ── DEFAULT-DENY allow-list: an un-vetted (but not hard-denied) tool is refused ─
{
  const spy = spyForward();
  const out = await executeTool(base({ input: { auth: VALID_AUTH, mode: "live" }, runtime: { cmd: "smcp" }, vetted: VETTED, forward: spy.fn, name: "SomeUnvettedRetrievalTool" }));
  check("default-deny: un-vetted tool refused", out.ok === false && out.block_reason === "TOOL_NOT_ALLOWLISTED");
  check("default-deny: forward not called for un-vetted tool", spy.calls.length === 0);
  check("isAllowlistedTool: undefined policy denies all", !isAllowlistedTool("anything", undefined));
  check("isAllowlistedTool: vetted name passes", isAllowlistedTool("PubMed_search_articles", new Set(Object.keys(VETTED))));
}

// ── PROOF 2: launch config disables every executor + the dangerous families ────
{
  const spec = buildLaunchSpec();
  check("launch: compact_mode true", spec.compact_mode === true && spec.auto_expose_tools === false);
  check("launch: hooks disabled", spec.hooks_enabled === false);
  check("launch: loopback host", spec.host === "127.0.0.1");
  check("launch: exclude_tools contains EVERY executor", EXECUTOR_TOOLS.every((t) => spec.exclude_tools.includes(t)));
  check("launch: exclude_tools contains the meta-dispatcher + loaders", spec.exclude_tools.includes("execute_tool") && spec.exclude_tools.includes("mcp_auto_loader_txagent"));
  check("launch: executor_disabled flag true", spec.executor_disabled === true);
  check("launch: exposes only the ≤5 compact core tools", spec.expose_tools.length <= 5 && spec.expose_tools.every((t) => COMPACT_CORE_TOOLS.includes(t)));
  const spec2 = buildLaunchSpec({ extraExcludes: ["some_other_tool"] });
  check("launch: extraExcludes cannot drop an executor", EXECUTOR_TOOLS.every((t) => spec2.exclude_tools.includes(t)) && spec2.exclude_tools.includes("some_other_tool"));
  check("launch: HARD_EXCLUDE_TOOLS superset of EXECUTOR_TOOLS", EXECUTOR_TOOLS.every((t) => HARD_EXCLUDE_TOOLS.includes(t)));
}

// ── AUTH: no unauthenticated path ──────────────────────────────────────────────
{
  check("auth: missing token refused (expected configured)", checkAuth({}, ENV).ok === false);
  check("auth: wrong token refused", checkAuth({ auth: { token: "nope" } }, ENV).ok === false);
  check("auth: correct token accepted", checkAuth({ auth: VALID_AUTH }, ENV).ok === true);
  check("auth: anonymous refused even with no expected token", checkAuth({}, {}).ok === false);
  check("auth: a principal is accepted in dev", checkAuth({ auth: { principal: "dev" } }, {}).ok === true);
  const spy = spyForward();
  const out = await executeTool(base({ input: { auth: undefined, mode: "live" }, runtime: { cmd: "smcp" }, forward: spy.fn, name: "PubMed_search_articles" }));
  check("execute_tool: vetted tool without auth → AUTH_REQUIRED", out.ok === false && out.block_reason === "AUTH_REQUIRED");
  check("execute_tool: no forward on unauthenticated call", spy.calls.length === 0);
}

// ── EGRESS (F2): enforced THROUGH executeTool, not just the helper ─────────────
{
  // helper-level.
  check("egress: a declared host is allowed", isEgressAllowed("api.fda.gov") && isEgressAllowed("eutils.ncbi.nlm.nih.gov"));
  check("egress: an unlisted host is refused", !isEgressAllowed("evil.example.com"));
  check("egress: a subdomain of a declared host is NOT allowed", !isEgressAllowed("evil.api.fda.gov"));
  check("egress: trailing-dot FQDN still allowed", isEgressAllowed("api.fda.gov."));
  check("egress: host:port normalised then allowed", isEgressAllowed("api.fda.gov:443"));
  check("egress: assertEgressAllowed throws on unlisted host", throwsRe(() => assertEgressAllowed("attacker.net"), /EGRESS BOUNDARY/));
  check("egress: allow-list non-empty", DECLARED_EGRESS_HOSTS.length > 0);
  // THROUGH executeTool: a vetted tool whose declared host is OFF the list is refused before forward.
  const spy1 = spyForward();
  const leaky = await executeTool(base({ input: { auth: VALID_AUTH, mode: "live" }, runtime: { cmd: "smcp" }, vetted: { LeakyTool: { host: "attacker.net" } }, forward: spy1.fn, name: "LeakyTool" }));
  check("egress THROUGH executeTool: off-list host → EGRESS_BLOCKED", leaky.ok === false && leaky.block_reason === "EGRESS_BLOCKED");
  check("egress THROUGH executeTool: forward not called for off-list host", spy1.calls.length === 0);
  // A vetted tool with NO declared host is refused (default-deny egress).
  const spy2 = spyForward();
  const hostless = await executeTool(base({ input: { auth: VALID_AUTH, mode: "live" }, runtime: { cmd: "smcp" }, vetted: { HostlessTool: {} }, forward: spy2.fn, name: "HostlessTool" }));
  check("egress THROUGH executeTool: no declared host → EGRESS_UNKNOWN_HOST", hostless.block_reason === "EGRESS_UNKNOWN_HOST" && spy2.calls.length === 0);
}

// ── NO LIVE-AS-MOCK (F3): dev/mock never forwards to a real subprocess ─────────
{
  const spy = spyForward();
  // mock context, runtime PRESENT, vetted tool, valid auth → must NOT forward; absent.
  const out = await executeTool(base({ input: { auth: VALID_AUTH, mode: "mock" }, runtime: { cmd: "smcp" }, forward: spy.fn, name: "PubMed_search_articles" }));
  check("F3: mock ctx + runtime present does NOT forward", spy.calls.length === 0);
  check("F3: mock ctx returns input-gated absence, not a mock-labelled live call", out.available === false && /input-gated/.test(out.reason));
  check("chooseToolRoute: mock ctx + runtime → absent (never live)", chooseToolRoute({}, "mock", "mock", { cmd: "x" }).kind === "absent");
}

// ── FAIL-SAFE ABSENCE: runtime absent → input-gated, never fabricated ──────────
{
  const out = await executeTool(base({ input: { auth: VALID_AUTH, mode: "mock" }, runtime: null, name: "PubMed_search_articles" }));
  check("absent: available:false + input-gated reason", out.available === false && /input-gated: ToolUniverse runtime absent/.test(out.reason));
  check("absent: carries a receipt, patient_eligible:false", out.receipt && out.receipt.upstream === UPSTREAM && out.patient_eligible === false);
  check("absent: NO fabricated result field", !("result" in out) || out.result == null);
  const blocked = await executeTool(base({ input: { auth: VALID_AUTH, mode: "live" }, runtime: null, name: "PubMed_search_articles" }));
  check("live + no runtime → BLOCKED_NO_RUNTIME", blocked.blocked === true && blocked.block_reason === "BLOCKED_NO_RUNTIME");
  check("locate: unset → null (absent)", locateToolUniverse({}) === null);
  check("locate: placeholder → null", locateToolUniverse({ HEYDOC_TOOLUNIVERSE_CMD: "<set-me>" }) === null);
  check("locate: example.invalid → null", locateToolUniverse({ HEYDOC_TOOLUNIVERSE_CMD: "https://example.invalid/smcp" }) === null);
}

// ── ROUTING + dry_run + MODE default (F4) + PATIENT_ELIGIBLE ───────────────────
{
  check("route: dry_run → dry_run", chooseToolRoute({}, "dry_run", "mock", { cmd: "x" }).kind === "dry_run");
  check("route: live ctx + runtime → live", chooseToolRoute({}, "live", "mock", { cmd: "x" }).kind === "live");
  check("route: live ctx + no runtime → blocked", chooseToolRoute({}, "live", "mock", null).kind === "blocked");
  const spy = spyForward();
  const dr = await executeTool(base({ input: { auth: VALID_AUTH, mode: "dry_run" }, runtime: { cmd: "x" }, forward: spy.fn, name: "PubMed_search_articles" }));
  check("execute_tool dry_run: ok, not executed", dr.ok === true && dr.result === null && /dry_run/.test(dr.message));
  check("execute_tool dry_run: forward untouched", spy.calls.length === 0);
  check("PATIENT_ELIGIBLE export is false", PATIENT_ELIGIBLE === false);
  // F4: a staging/production env default must normalise to a valid receipt-mode enum.
  const enumVals = ["live", "dry_run", "mock"];
  for (const envMode of ["staging", "production", "mock", "dry_run", undefined, "weird-unknown"]) {
    check(`F4: normaliseMode(${envMode}) yields a valid enum default`, enumVals.includes(normaliseMode(envMode).context_mode));
  }
}

// ── LIVE forward seam: a VETTED benign tool with an allowed host reaches the spy;
//    transport error fails safe ──────────────────────────────────────────────
{
  const spy = spyForward();
  const out = await executeTool(base({ input: { auth: VALID_AUTH, mode: "live" }, runtime: { cmd: "smcp" }, forward: spy.fn, name: "PubMed_search_articles", args: { q: "asthma" } }));
  check("live vetted tool: forward IS called once", spy.calls.length === 1 && spy.calls[0].name === "PubMed_search_articles");
  check("live vetted tool: result returned + live receipt", out.ok === true && out.result && out.receipt.mode === "live");
  const boom = async () => { throw new Error("transport down"); };
  const failed = await executeTool(base({ input: { auth: VALID_AUTH, mode: "live" }, runtime: { cmd: "smcp" }, forward: boom, name: "PubMed_search_articles" }));
  check("live fail-safe: result null + error receipt", failed.ok === false && failed.result === null && failed.receipt.error && /TOOL_CALL_THREW/.test(failed.receipt.error.code));
}

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-tooluniverse-gateway: OK");
