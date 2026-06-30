# Breath-Ezy — State Snapshot / Resume-Here

Dense context handoff for continuing in a fresh Claude Code session or Claude Chat.
Source of truth remains the repo; this is a pointer + current-state index.

**Repo:** `kenleefreo/breath-ezy` · `main` @ `0e77b9b` (PR #1 merged 2026-06-30).
**Stack:** Node 20 (CI), ESM, `@modelcontextprotocol/sdk ^1.29`, `zod ^3`. Mock by default (`HEYDOC_MODE_DEFAULT=mock`). **Nothing patient-facing.**

## Run / verify
```
npm ci
npm test                        # 13 contract suites, all OK
npm run verification            # Pass
npm run trunk:stub:all          # 9/9 (and HEYDOC_USE_MCP=1 → 9/9 via real MCP servers)
npm run verify:rehash           # ledger integrity (chain VALID, 0 drift)
npm audit --audit-level=high    # 0
```
Gotcha: local dev may be on Node 24; **CI/Node 20 is the gate.**

## Component status (all mock unless noted)
| Component | State |
|---|---|
| Hashing `candidate_output_hash` (SHA-256) | ✅ required, zod-gated, tested |
| Audit ledger (append-only, hash-chained) + content store (synthetic-only) + `verify:rehash` | ✅ mock-durable |
| Verifier (5 checks) | ✅ tested; code detection SNOMED/ICD-10-AM/ICD-11/LOINC/PBS, true per-code↔receipt binding, mock-mode flag |
| Pipeline edges (GroundingPlan/ContextPacket/EvidenceNode/Report) | ✅ zod-gated |
| Investigation parser (sanitiser) | ✅ engine; ranges **provisional (dev)**; fed by mock fhir Observations |
| Pharmacology server + **Trunk 8.0 firewall** | ✅ mock; HARD_FAIL no-override; **live vendor pending** |
| Knowledge server + 3 datasets (benign/Axis-B/red-flag) | ✅ mock; datasets **provisional (dev)** |
| fhir-broker (read/search; Observation→parser) | ✅ mock; live EHR + AU Core/AUCDI conformance pending |
| messaging-geo (never sends) | ✅ mock; not wired to pipeline (gated by Portal) |
| docs / identity-au / terminology | pre-existing stubs |

## Open register items (see docs/grounding/completeness-register.md + gap-register R-rows)
**Critical / High, input-gated:**
- Clinician Verification Portal — **not started** (Critical, release blocker).
- Session-bound persistence — **not enforced** (Critical, release blocker).
- Pharmacology live vendor (MIMS-AU/SafeScript) — R-22, needs credentials.
- `lab-reference-ranges-provisional`, `knowledge-datasets-provisional` — clinical sign-off (High).
- `terminology-contract-incomplete` (R-20) — terminology grounds only SNOMED+ICD-11 vs invariant's 4 systems (High, **buildable**).
- `receipt-store-append-only` (R-17) — mock-resolved; production WORM + retention policy pending.

**Buildable next (no external inputs):**
1. `terminology-contract-incomplete` (R-20, High) — extend terminology to ICD-10-AM/LOINC/PBS, then enable per-code binding for those.
2. `fhir-r4-aucdi-conformance-unbuilt` + `aucdi-r3-valueset-binding-unbuilt` (Medium).
3. `case-set-underpopulated` (Medium) — expand to ≥45 cases (touches the scoring-store firewall — careful).
4. Optional cleanups noted in code review: extract `withMcpClient` helper (retrieval-mcp.js); dedupe the per-server receipt builder.

## Key file map
- Charter & invariants: `CLAUDE.md`
- Backlog / gaps / log: `docs/grounding/{completeness-register,gap-register,CHANGELOG}.md`; quick-ref `.claude/{completeness-index,schema-index,server-status}.md`
- Pipeline: `verification/pipeline.js` (routing→retrieval→inject→verify; firewall; fhir→parser), `verification/retrieval-mcp.js`
- Safety code: `verification/{verifier,hash,audit-store,ledger-schema,report-schema,pipeline-schemas,investigation-parser,rehash}.js`
- Servers: `mcp/servers/{pharmacology(engine.js),knowledge,fhir-broker,messaging-geo}/`
- Contracts: `mcp/schemas/*.json`, `data/schemas/*.json` (scoring nodes 10–13 are the **firewall** — never read by the AI Doctor)
- Tests: `test/contract-*.js` (wired into `npm test`)

## Workflow reminders (from the charter)
- Plan-gated: no code without an approved Phase-2 plan. Phases 0 (Completeness Scan) → 1 (Research/Clarify) → 2 (Plan, GATE) → 3 (Execute, per-phase GATE) → 4 (Review/docs).
- Every task: update the Completeness Register + gap-register + CHANGELOG when an item moves.
- All clinical data is DEV/SYNTHETIC-ONLY; mock must never be presented as live; doses only from the pharmacology server; raw labs only via the parser.

## To continue in Claude Chat (claude.ai)
Chat has no repo access. Create a **Project**, put an adapted `CLAUDE.md` as **custom instructions**, and upload as **project knowledge**: this file, `completeness-register.md`, `gap-register.md`, `CHANGELOG.md`, `.claude/schema-index.md`, `.claude/server-status.md`. Use Chat for planning/architecture/review; run execution back in Claude Code.
