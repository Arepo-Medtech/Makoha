# tooluniverse-gateway (FLOW_PLAN H5, #28)

Compact-mode MCP gateway wrapping **mims-harvard/ToolUniverse** (Apache-2.0, pinned
**v1.3.1 = `9b7ff91d`**, enforced RCE floor **v1.3.0**) — 600–1000+ scientific tools
behind the Breath-Ezy security boundary. **Highest strategic leverage and highest
security surface in the harvest.**

## The one rule
`python_code_executor` (and the sibling code-execution tools `python_script_runner`,
`read_executed_notebook`) are **DISABLED at config AND proven UNREACHABLE**. The
gateway executes **no code by any path**. v1.3.0 patched an *unauthenticated* RCE in
`python_code_executor`; we adopt the library only behind our own auth with the
executor sealed off. **If the executor ever appears reachable, or the runtime forces
it on — STOP and report. Do not work around it.**

**Why a deny-list alone is not enough.** ToolUniverse v1.3.1 ships ~2620 tools,
including whole families that execute code *indirectly* or run *autonomous* loops —
`MCPAutoLoaderTool` (spawns other MCP servers), `AgenticTool`/`SmolAgentTool`/`CallAgent`,
`ComposeTool`/`*Pipeline`/`ToolGraph*`, `Replicate_run_prediction`, and the meta
`ExecuteTool`. A blocklist against a library that ships its own composition layer
cannot be complete. So the **authoritative reachability control is DEFAULT-DENY**: the
gateway forwards a tool **only** if it is on the vetted retrieval allow-list; everything
else — executors, the agentic/loader/compose families, and any un-vetted or unknown
name — is refused. The executor/family hard-deny is a belt behind that (defence in depth).

## Envelope (≤5 core tools; compact mode)
- `execute_tool(name, args) → { result, receipt }` — the AITIP dispatch; the full
  library is reached only through this. Deny-list + auth + route applied in fail-closed
  order.
- `list_tools` / `find_tools` / `get_tool_info` — discovery over the committed fixture
  catalogue while the runtime is absent (metadata only, `mode:mock`, `source:fixture`).

## Gate order in `executeTool` (each fails closed; a denied call never reaches `forward`)
1. **Hard-deny** (`tool-gateway.js`, runtime-independent, independent of auth) — raw
   code executors (`isExecutorTool`) and the autonomous/loader/compose family
   (`isAutonomousOrLoaderTool`) are refused before any subprocess forward. Canonical
   matching defeats case/separator/zero-width/unicode evasion; a defensive shape guard
   over-blocks renamed surfaces.
2. **Auth** — no unauthenticated path to any tool. Expected token is a **secrets-manager
   reference** (`HEYDOC_TOOLUNIVERSE_AUTH_TOKEN`), never a literal.
3. **Default-deny allow-list** (the AUTHORITATIVE reachability control) — only vetted
   retrieval tool names may proceed; everything else is `TOOL_NOT_ALLOWLISTED`.
4. **Route** — dev/mock **never** forwards to a real subprocess (no live-as-mock);
   execution requires an explicit live context + a located runtime, else `BLOCKED`/absent.
5. **Egress** (`egress-allowlist.js`, ENFORCED on the forward path) — a live forward is
   bounded to the tool's **declared** upstream host, which must be on the allow-list;
   otherwise `EGRESS_BLOCKED` / `EGRESS_UNKNOWN_HOST`. Also applied at deploy as the
   subprocess network policy (input-gated).

**Config layer** (`launch-spec.js`) — SMCP is launched `compact_mode=True`,
`exclude_tools=[executors + representative families]`, `hooks_enabled=False`, loopback
host. `buildLaunchSpec()` is pure and asserted to always carry the full exclude set.

**Fail-safe absence** (H4 precedent) — runtime absent → `{ available:false,
reason:"input-gated: ToolUniverse runtime absent" }` + receipt. Never a fabricated result.

## Proof (contract-tooluniverse-gateway.js)
- **Invocation proof:** a spy injected as the subprocess seam is **never called** for an
  executor or family name — even when that name is force-added to the allow-list and
  auth is valid on a live context. The request never crosses the process boundary.
- **Default-deny proof:** an un-vetted name never reaches `forward`.
- **Egress proof (through `executeTool`):** a vetted tool with an off-list or missing
  host is refused before forward.
- **Config proof:** the launch spec always excludes every executor and sets `compact_mode`.
- Plus: auth required, no live-as-mock, Receipt emitted, `patient_eligible:false`,
  fail-safe absence.

## Hardening history
The initial build used a 3-name executor deny-list. An adversarial security review found
that ToolUniverse's compose/agentic/auto-loader tools bypass a name blocklist and reach
the subprocess (F1), that the egress module was imported by nothing but its test (F2),
that a mock context with a runtime present forwarded a real call stamped `mode:"mock"`
(F3), and that a staging/production `HEYDOC_MODE_DEFAULT` threw at the zod enum (F4). All
four are fixed and locked by the contract test: default-deny + family hard-deny (F1),
egress enforced on the forward path (F2), dev/mock never forwards (F3), normalised mode
default (F4).

## Input-gated (live execution)
Live execution needs a Python runtime + a runnable SMCP entrypoint
(`HEYDOC_TOOLUNIVERSE_CMD`) + API keys via the secrets manager + the deploy-time egress
policy. Absent here → fail-safe. Retrieval-type tools are additionally **MIRAGE-gated**
(H3) and **governance-gated** (H7) before any patient eligibility. Nothing is wired to a
patient-facing path.

## Audit pattern (MedLog #org — STUDY ONLY)
mims-harvard/MedLog's event-level clinical-AI logging pattern informs the **future**
live audit substrate (ARCH M8 seam in `verification/audit-store.js`). This milestone
builds **no WORM** and does **not** modify the RETAIN audit ledger; every gateway call
emits the common Receipt the existing pipeline already records.
