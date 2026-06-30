# Grounding execution log

Records what was committed to `kenleefreo/heydoc` for the grounding/MCP design and execution phases.

---

## Standards registration — FHIR R4 / AUCDI R3 grounding scoped (2026-06-30)

**Status:** Registered (not built). Operator request to ground HL7 FHIR R4 + AUCDI Release 3.

Placed in topology: FHIR R4 and AUCDI R3 are structure/data-model standards (trust boundary 3), not terminology code systems — distinct from the SNOMED/ICD/LOINC/PBS terminology layer. AUCDI R3 supplies required terminology bindings that can later enrich the verifier's code↔receipt binding.

- `<standards_pins>` (CLAUDE.md): **AUCDI Release 3** added, supplementing AU Core 0.3.0. Whether AUCDI R3 re-targets or only supplements the AU Core conformance target is flagged as an unsettled org/regulatory decision.
- gap-register §3: AUCDI R3 row added.
- Completeness Register: opened `fhir-r4-aucdi-conformance-unbuilt` (Medium — deterministic FHIR R4 + AU Core + AUCDI R3 conformance validator in fhir-broker) and `aucdi-r3-valueset-binding-unbuilt` (Medium — AUCDI required-binding tables + verifier value-set enforcement).
- Sequencing: registered now; to be scoped (Phase 1) after `verifier-weak-code-detection` (item 2), which it depends on.

---

## Verifier test coverage — 5 hard checks under test (2026-06-30)

**Status:** Complete. Branch `chore/import-and-remediate`. Resolves `verifier-untested` / gap-register **R-18**.

`<test_and_evaluation_gates>` forbids untested deterministic safety code; the five verifier checks had no tests. Added `test/contract-verifier.js` covering, per check, a clean PASS, a violation FAIL, and the receipt/citation that flips FAIL→PASS — for `no_invented_codes`, `no_invented_guidelines`, `no_invented_operations`, `no_repo_invention`, `hard_stop_enforcement` — plus the `candidate_output_hash` return, overall-pass logic, and a `runPipeline()` integration (5 results). Wired into `npm test` (now 6/6). No verifier behaviour change; the tests assert the current contract and will be extended alongside `verifier-weak-code-detection`.

---

## Append-only audit ledger + synthetic content store + rehash (2026-06-30)

**Status:** Complete (mock/staging scope). Branch `chore/import-and-remediate`.

Mock-resolves Completeness Register `receipt-store-append-only-unbuilt` / gap-register **R-17**, and opens `content-store-production-gated` (Medium). Builds the durable, tamper-evident audit trail required by `<observability_and_audit>` while respecting `<data_handling>` patient-data minimisation via a two-store split.

### Design
- **Append-only hash-chained ledger** (`medicolegal-audit-ledger`) — non-PHI: hash anchor + run/trunk metadata + pass gate + per-check booleans + receipt metadata. Each entry's `entry_hash` chains over its canonical content + the previous entry's hash, so any edit/insert/reorder breaks the chain.
- **Synthetic-only content store** — exact output text, content-addressed by hash; `persistContent()` mechanically refuses non-synthetic data; live entries are forced `content_persisted=false`. Real-patient persistence is deferred to the session-persistence Critical + consent.

### Changes
- `mcp/schemas/audit-ledger-entry.schema.json` + `verification/ledger-schema.js` (new): ledger record contract + zod `validateLedgerEntry()` (throws; rejects PHI keys and live+persisted).
- `verification/audit-store.js` (new): `appendEntry` (hash-chain), `verifyChain`, `persistContent` (synthetic guard), `readContent`, `recordRun`; `HEYDOC_DATA_DIR` override.
- `verification/run.js` + `integration/trunk-pipeline.js`: call `recordRun()` after `validateReport()`.
- `verification/rehash.js` (new) + `verify:rehash` script: `--integrity` (recompute vs ledger + verify chain), `--reissue` (re-verify stored outputs → fresh hashed reports + ledger entries), `<path>` ingest.
- `test/contract-audit-store.js` (new), wired into `npm test`.
- `.heydoc-data/` stays gitignored — the store is runtime data, never committed.
- Docs: `architecture/trust-boundaries.md` (Boundary 5 + the patient-data split), `.claude/schema-index.md`.

### Register movement
- `receipt-store-append-only-unbuilt`: High, UNBUILT → **PARTIAL / in-progress** (mock-resolved; prod WORM + retention pending) — R-17.
- **Opened** `content-store-production-gated`: Medium, PARTIAL (synthetic-only until session-persistence Critical + consent).
- `session-persistence-unenforced` (Critical): unchanged — explicitly not claimed.

### Verification
- `npm test` → 5/5 (adds `contract-audit-store: OK`).
- `verify:rehash --integrity` → chain VALID, hashes match; `--reissue` → outputs re-verified, hashes reproduce; planted content drift → exit 1.

---

## Medicolegal hashing — candidate_output_hash implemented (2026-06-30)

**Status:** Complete. Branch `chore/import-and-remediate`.

Closes Completeness Register `hashing-unimplemented` (Critical) and gap-register **R-16**. Before this change, the SHA-256 medicolegal anchor mandated by the prime directive was computed nowhere; the VerificationReport schema defined the field but left it optional, and neither report writer populated it.

### Changes
- `verification/hash.js` (new): `hashCandidateOutput()` — SHA-256 (`node:crypto`) over the exact, unmodified UTF-8 bytes of the candidate output; throws on non-string. No normalisation — the hash reflects exactly what was generated.
- `verification/verifier.js`: `verify()` computes `candidate_output_hash` first (before any output processing) and returns it.
- `verification/report-schema.js` (new): zod `VerificationReportSchema` mirroring the JSON schema; `validateReport()` throws on a malformed audit record.
- `verification/run.js`, `integration/trunk-pipeline.js`: both writers include `candidate_output_hash` and call `validateReport()` before persisting.
- `mcp/schemas/verification-report.schema.json`: `candidate_output_hash` added to `required` (now 6); description + `_integration_notes` updated.
- `test/contract-verification-report.js` (new), wired into `npm test`: known SHA-256 vector, determinism, end-to-end hash==output, gate rejects missing/malformed/unknown-key.

### Register movement
- `hashing-unimplemented`: Critical, PARTIAL → **COMPLETE / resolved** (gap_register_link R-16).
- `pipeline-edges-uncontracted`: Medium → **partially addressed** (VerificationReport edge now zod-gated; GroundingPlan/ContextPacket/EvidenceNode edges remain open).

### Verification
- `npm test` → 4/4 (`contract-docs/identity-au/terminology/verification-report`: OK).
- `npm run verification` and `npm run trunk:stub:all` → reports carry a valid `sha256:…` hash and pass `validateReport()`; `Pass: true`, trunks 9/9.

---

## Maintenance — Supply-chain advisory remediation (2026-06-30)

**Status:** Complete (mock environment). Branch `chore/bump-mcp-sdk-1.29`.

Cleared all 3 High + 4 moderate `npm audit` advisories, all transitive via
`@modelcontextprotocol/sdk`. None lay on an exercised code path — every server
and the verifier client use stdio transport, not the vulnerable HTTP/SSE stack —
but `<security_and_secrets>` makes High/Critical advisories build-blocking, so
they were cleared regardless.

### Changes
- `package.json`: `@modelcontextprotocol/sdk` floor `^1.0.0` → `^1.29.0`.
- `package-lock.json`: re-locked. Patched transitive deps now pinned:
  `hono 4.12.27`, `fast-uri 3.1.3`, `path-to-regexp 8.4.2`, `ip-address 10.2.0`,
  `qs 6.15.3`, `express-rate-limit 8.5.2`. No `overrides` needed; no major bumps;
  `zod` unchanged at 3.x. Stays within MCP SDK `^1` — no stack swap.
- `.github/workflows/ci.yml`: added a blocking `npm audit --audit-level=high`
  step after `npm ci`.
- `gap-register.md`: added risk **R-14** (dependency advisory reaching build —
  Controlled) and **R-15** (no SAST/secret-scanning in CI — Open gap, still to be
  added before any patient-facing release).

### Verification
- `npm audit --audit-level=high` → 0 High/Critical.
- Clean `npm ci` from the new lockfile → `found 0 vulnerabilities` (reproducible).
- `npm test`, `npm run verification`, `npm run trunk:stub:all` all green.

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
