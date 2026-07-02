# Breath-Ezy — State Snapshot / Resume-Here

Dense context handoff for continuing in a fresh Claude Code session or Claude Chat.
Source of truth remains the repo; this is a pointer + current-state index.

**Repo:** `kenleefreo/breath-ezy` · `main` @ `9d376c1` (PRs #1–#12 merged; updated 2026-07-02).
**Stack:** Node 20 (CI), ESM, `@modelcontextprotocol/sdk ^1.29`, `zod ^3`, `ajv ^8` (case-schema validation). Mock by default (`HEYDOC_MODE_DEFAULT=mock`). **Nothing patient-facing.**

## Run / verify
```
npm ci
npm test                        # 15 contract suites, all OK
npm run cases:ingest -- "<folder>" --dry-run   # validate casebundles (no write)
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
| Terminology server (multi-system) | ✅ mock; grounds SNOMED_CT/ICD_10_AM/ICD_11/LOINC/PBS/AMT; **live NCTS + AU Core value-set binding pending** |
| Pipeline edges (GroundingPlan/ContextPacket/EvidenceNode/Report) | ✅ zod-gated |
| Investigation parser (sanitiser) | ✅ engine; ranges **provisional (dev)**; fed by mock fhir Observations |
| Pharmacology server + **Trunk 8.0 firewall** | ✅ mock; HARD_FAIL no-override; **live vendor pending** |
| Knowledge server + 3 datasets (benign/Axis-B/red-flag) | ✅ mock; datasets **provisional (dev)** |
| fhir-broker (read/search; Observation→parser; **fhir_validate** AU Core structural conformance vs vendored SDs 2.0.1-ci) | ✅ mock; live EHR + live-NCTS value-set binding pending |
| messaging-geo (never sends) | ✅ mock; not wired to pipeline (gated by Portal) |
| docs / identity-au | pre-existing stubs |
| **Case-set + authoring pipeline** | ✅ **52 cases** in `data/cases/` (51 clinician-attested AUC + reference); `cases:ingest` tool (validate+split+hash+field-scoped firewall, contract-tested); SOAP→bundle protocol v1.2.0 + single-file kit |

## Open register items (see docs/grounding/completeness-register.md + gap-register R-rows)
**Critical / High, input-gated:**
- Clinician Verification Portal — **not started** (Critical, release blocker).
- Session-bound persistence — **not enforced** (Critical, release blocker).
- Pharmacology live vendor (MIMS-AU/SafeScript) — R-22, needs credentials.
- `lab-reference-ranges-provisional`, `knowledge-datasets-provisional` — clinical sign-off (High).
- `terminology-contract-incomplete` — multi-system grounding **built (mock)**; **live NCTS + AU Core value-set binding pending** (High).
- **`context-injection-allowlist` (High, NEW)** — `cases:ingest` enforces the sub-field firewall allow-list (which parts of `00/01/02` are patient-facing vs sim/scorer metadata); the **live context-injection layer must enforce the same** before injecting into a trunk. Unbuilt.
- `receipt-store-append-only` (R-17) — mock-resolved; production WORM + retention policy pending.

**Buildable next (no external inputs):**
1. **`context-injection-allowlist`** (High) — apply the ingest allow-list in the live context-injection path (`verification/pipeline.js`).
2. **Terminology batch-verify** the 52 cases' candidate codes against the mock terminology server (produce receipts; flip `unverified_pending_terminology_receipt`).
3. `case-set` **difficulty top-up** — count minimum cleared (52 ≥ 45), but distribution is 47 straightforward / 4 atypical-high-risk vs the 60/30/10 target; author more atypical/complex cases.
4. `aucdi-r3-valueset-binding-unbuilt` (Medium) — needs live NCTS; AU Core *structural* conformance is done.
5. Optional code-review cleanups: extract `withMcpClient` helper (retrieval-mcp.js); dedupe the per-server receipt builder.

## Key file map
- Charter & invariants: `CLAUDE.md`
- Backlog / gaps / log: `docs/grounding/{completeness-register,gap-register,CHANGELOG}.md`; quick-ref `.claude/{completeness-index,schema-index,server-status}.md`
- Pipeline: `verification/pipeline.js` (routing→retrieval→inject→verify; firewall; fhir→parser), `verification/retrieval-mcp.js`
- Safety code: `verification/{verifier,hash,audit-store,ledger-schema,report-schema,pipeline-schemas,investigation-parser,rehash}.js`
- Servers: `mcp/servers/{pharmacology(engine.js),knowledge,fhir-broker(conformance.js,au-core/),messaging-geo}/`
- Contracts: `mcp/schemas/*.json`, `data/schemas/*.json` (scoring nodes 10–13 are the **firewall** — never read by the AI Doctor)
- Case authoring/ingest: `docs/case-authoring/{case-transformation-protocol.md (v1.2.0), breath-ezy-case-transformation-kit.json}`, `scripts/{ingest-case-bundles.mjs, build-case-transformation-kit.mjs}`, `data/cases/<SPEC-ID>/` (52 cases), `data/digital_tablet_omnibus.json`
- Tests: `test/contract-*.js` (15 suites, wired into `npm test`)

## Workflow reminders (from the charter)
- Plan-gated: no code without an approved Phase-2 plan. Phases 0 (Completeness Scan) → 1 (Research/Clarify) → 2 (Plan, GATE) → 3 (Execute, per-phase GATE) → 4 (Review/docs).
- Every task: update the Completeness Register + gap-register + CHANGELOG when an item moves.
- All clinical data is DEV/SYNTHETIC-ONLY; mock must never be presented as live; doses only from the pharmacology server; raw labs only via the parser.

## To continue in Claude Chat (claude.ai)
Chat has no repo access. Create a **Project**, put an adapted `CLAUDE.md` as **custom instructions**, and upload as **project knowledge**: this file, `completeness-register.md`, `gap-register.md`, `CHANGELOG.md`, `.claude/schema-index.md`, `.claude/server-status.md`. Use Chat for planning/architecture/review; run execution back in Claude Code.

## Case transformation (Chat / Cowork)
Turn SOAP `.txt` notes into case-set bundles with the **single-file kit** `docs/case-authoring/breath-ezy-case-transformation-kit.json` (embeds protocol v1.2.0 + omnibus + 7 schemas + reference case + runner prompt). Attach only that file; regenerate with `npm run kit:build`. Output is one `<CASE_ID>.casebundle.json` per case → `npm run cases:ingest` splits it into `data/cases/`, computes SHA-256, runs the field-scoped firewall, and carries the clinician attestation. **Machine-generated cases stay `llm_generated_unreviewed` until a clinician attests** (the 52 in-repo carry a recorded bulk attestation, reviewer `KL`, 2026-07-02).
