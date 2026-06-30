# Grounding execution log

Records what was committed to `kenleefreo/heydoc` for the grounding/MCP design and execution phases.

---

## Checkpoint E — Design artifacts committed (2025-03-19)

**Status:** Complete.

All design-phase outputs were added to the repo and pushed to `origin/master`.

### Artifacts added

| Path | Purpose |
|------|--------|
| `grounding/gap-register.md` | Hallucination/grounding gap register (repos, APIs, standards, vendors). |
| `grounding/entity-inventory.json` | Machine-readable entity inventory keyed by plan. |
| `grounding/data-buckets.md` | Classification: Static Docs, Live Data, Structured Knowledge. |
| `mcp/README.md` | MCP server set, tool lists, verification hooks. |
| `mcp/mcpServers.template.json` | Server config template (command, args, env). |
| `mcp/schemas/*.json` | JSON schemas for tool I/O, evidence, context, terminology. |
| `docs/grounding/README.md` | Pinned source-of-truth notes (placeholders). |
| `docs/grounding/CHANGELOG.md` | This execution log. |
| `architecture/grounding-pipeline.md` | 5-step pipeline + verification rules. |
| `architecture/trust-boundaries.md` | Trust boundaries for MCP servers. |
| `architecture/sequence-diagrams.md` | Sequence diagrams for pipeline/MCP. |

### Execution phases

- **E** ✅ Design artifacts in repo (this checkpoint).
- **Step 2** ✅ First MCP servers implemented (2025-03-19):
  - `mcp/servers/docs/index.js`: `docs_search`, `docs_get`, `docs_cite` (mock/dry_run).
  - `mcp/servers/identity-au/index.js`: `identity_verify`, `identity_lookup_ihi`, `identity_log_consent` (stub/mock/dry_run).
  - Contract tests: `test/contract-docs.js`, `test/contract-identity-au.js`. Run with `npm test` (requires `npm install`).
- **Step 3** ✅ Verification harness (2025-03-19):
  - `verification/pipeline.js`: 5-step runner (stub routing/retrieval/generation).
  - `verification/verifier.js`: checks for invented codes, guidelines, operations, repo names, hard-stop.
  - `verification/run.js`: CLI; writes `verification/report.json` and `verification/evidence_tree.md`. Run: `npm run verification` or `node verification/run.js [candidate_output.txt]`.
- **Step 4** ✅ Wire Trunk agents to pipeline and verification layer (2025-03-19):
  - `integration/trunk-pipeline.js`: `runTrunkWithGrounding(trunkId, userInput, options)` — runs pipeline + verification, optional write of report.json and evidence_tree.md.
  - `integration/README.md`: how Trunk agents call the integration.
  - `trunk/stub-agent.js`: first Trunk stub; one turn through pipeline and verification. Run: `npm run trunk:stub`.
- **Live MCP retrieval** (pipeline wired to real servers):
  - `verification/retrieval-mcp.js`: spawns docs and identity-au MCP servers via StdioClientTransport, calls `docs_search` and `identity_lookup_ihi`, collects receipts.
  - Pipeline uses live retrieval when `HEYDOC_USE_MCP=1` (or `options.use_mcp`); falls back to stub on failure or when unset.
  - `runPipeline` is async; `verification/run.js`, `integration/trunk-pipeline.js`, and `trunk/stub-agent.js` updated to await it.
- **Terminology MCP server** (code lock-in / no invented codes):
  - `mcp/servers/terminology/index.js`: tools `terminology_lookup`, `terminology_validate`, `terminology_map` (mock/dry_run); returns TerminologyLookup-shaped response with receipt.
  - `test/contract-terminology.js`: contract test; `npm test` now runs docs + identity-au + terminology.
  - `verification/retrieval-mcp.js`: when HEYDOC_USE_MCP=1, calls terminology server for plans that need terminology and collects receipt so verifier can satisfy "no invented codes" when output references SNOMED/ICD.
- **Trunk 2.0 system prompt**:
  - `trunk/prompts/trunk-2.0-system.md`: system prompt for Trunk 2.0 (triage only; no diagnosis, no dosages; grounding rules and citation discipline).
  - `integration/trunk-pipeline.js`: `getTrunkSystemPrompt(trunkId)` loads `trunk/prompts/trunk-{id}-system.md` for use as LLM system message.
  - `integration/README.md`: documents system prompt loading and pipeline usage.
- **CI (GitHub Actions)**:
  - `.github/workflows/ci.yml`: on push/PR to master or main, runs `npm ci`, `npm test`, `npm run verification`, `npm run trunk:stub:all` (Trunk 2.0 + 3.0 stubs).
- **Trunk 3.0 system prompt and stub**:
  - `trunk/prompts/trunk-3.0-system.md`: system prompt for Trunk 3.0 (structured history enrichment; no diagnosis, no dosages; output contract: follow_up_questions, structured_history, evidence_refs).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["3.0"]` = ["no diagnosis", "no dosages", "history enrichment only"].
  - `trunk/trunk-3.0-stub-agent.js`: stub agent for Trunk 3.0; `npm run trunk:stub:3`. `npm run trunk:stub:all` runs both 2.0 and 3.0 stubs.
- **Trunk 7.0 system prompt and stub**:
  - `trunk/prompts/trunk-7.0-system.md`: code lock-in prompt (no diagnosis, no dosages, terminology receipt required for coded output).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["7.0"]` includes no diagnosis/no dosages and terminology-receipt lock-in constraints.
  - `trunk/trunk-7.0-stub-agent.js`: stub agent for Trunk 7.0; `npm run trunk:stub:7`.
  - `package.json` aggregate run updated: `trunk:stub:all` now runs 2.0 through 7.0 stubs.
- **Trunk 8.0 system prompt and stub**:
  - `trunk/prompts/trunk-8.0-system.md`: pharmacology firewall intent-check prompt (no diagnosis, no dosages, blocked/HARD_FAIL handling explicit).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["8.0"]` includes no diagnosis/no dosages and pharmacology firewall blocking constraints.
  - `trunk/trunk-8.0-stub-agent.js`: stub agent for Trunk 8.0; `npm run trunk:stub:8`.
  - `package.json` aggregate run updated: `trunk:stub:all` now runs 2.0 through 8.0 stubs.
- **Trunk 9.0 system prompt and stub**:
  - `trunk/prompts/trunk-9.0-system.md`: red-flag questionnaire and escalation-gate prompt (no diagnosis, no dosages, unknown/blocked states explicit).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["9.0"]` includes no diagnosis/no dosages plus red-flag questionnaire gating.
  - `trunk/trunk-9.0-stub-agent.js`: stub agent for Trunk 9.0; `npm run trunk:stub:9`.
  - `package.json` aggregate run updated: `trunk:stub:all` now runs 2.0 through 9.0 stubs.
- **Trunk 1.0 (originating/master) system prompt and stub**:
  - `trunk/prompts/trunk-1.0-system.md`: master/originating intake-routing and safety-gate prompt (no diagnosis, no dosages, evidence-bound escalation logic).
  - `trunk/trunk-1.0-stub-agent.js`: stub agent for Trunk 1.0; `npm run trunk:stub:1`.
  - `package.json` scripts updated: `trunk:stub` now aliases Trunk 1.0; added explicit `trunk:stub:2` for Trunk 2.0; `trunk:stub:all` now runs 1.0 through 9.0 stubs.
  - `integration/README.md` and `trunk/prompts/README.md` updated to include Trunk 1.0 as the originating step.
