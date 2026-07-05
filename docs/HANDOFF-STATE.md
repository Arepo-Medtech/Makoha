# Breath-Ezy — State Snapshot / Resume-Here

Dense context handoff for continuing in a fresh Claude Code session or Claude Chat.
Source of truth remains the repo; this is a pointer + current-state index.

**Repo:** `kenleefreo/breath-ezy` · `main` @ `c9e0a64` (PRs #1–#17 merged; updated 2026-07-05).
**Stack:** Node 20 (CI), ESM, `@modelcontextprotocol/sdk ^1.29`, `zod ^3`, `ajv ^8` (case-schema validation). Mock by default (`HEYDOC_MODE_DEFAULT=mock`). **Nothing patient-facing.**

**Since the last handoff (was `9d376c1`, PRs #1–#12):** the ARCH_PLAN pure-engineering block **M0–M8** and the first live-connection slice **M11 P1** are built and merged. Highlights: mode-normaliser, cross-trunk sequencer, live context-injection allow-list, **session-bound persistence enforced**, **Clinician Verification Portal gate** (contract, not UI), **301 clinician-attested cases + CI-blocking eval gate + global-seq id-scheme**, verifier severity labels, **audit-ledger WORM substrate seam**, and a **live terminology `$validate-code` adapter** (sandbox-verified). The M9–M14 input-gated milestones have a master plan: `.planning/M9-M14-MASTER-PLAN.md`.

## Run / verify
```
npm ci
npm test                        # 21 contract suites, all OK
npm run eval:cases              # BLOCKING case-set gate — PASS (301 attested; sha256 integrity; receipts; schema)
npm run cases:ingest -- "<folder>" [--reseq] [--dry-run]   # ingest bundles (--reseq auto-assigns a global seq on collision)
npm run cases:verify-codes      # receipt case candidate codes vs the mock terminology server
npm run verification            # Pass
npm run trunk:stub:all          # 9/9 (and HEYDOC_USE_MCP=1 → 9/9 via real MCP servers)
npm run verify:rehash -- --integrity   # ledger integrity (chain VALID, 0 drift)
npm audit --audit-level=high    # 0
```
Gotcha: local dev may be on Node 24; **CI/Node 20 is the gate.** CI also runs `eval:cases` as a blocking job.
Derived `verification/report.json` + `evidence_tree.md` are **gitignored** (regenerated every run; the durable record is the ledger in `.heydoc-data/`).

## Component status (all mock unless noted)
| Component | State |
|---|---|
| Hashing `candidate_output_hash` (SHA-256) | ✅ required, zod-gated, tested |
| Audit ledger (append-only, hash-chained) + content store (synthetic-only) + `verify:rehash` | ✅ + **M8 WORM substrate SEAM** (`registerAuditSubstrate()`; `local` default; non-local refuses if unregistered; `auditRetentionPolicy()` never auto-deletes). Live WORM + retention = deploy/regulatory |
| Verifier (5 checks) | ✅ tested; per-code binding; mock-mode flag; **M7: emits per-check `severity`** (no_repo_invention=warning, surfaced-but-gating; gate unchanged) |
| **Mode-normaliser** (`verification/mode.js`, M1) | ✅ env(mock/staging/production)→enforcement; staging/production/unknown **block mock proof**; wired into verifier/pipeline/audit-store |
| **Cross-trunk sequencer** (`integration/trunk-sequencer.js`, M2) | ✅ consumes `routing_plan.next_trunks`; HARD_FAIL/escalate/verify-fail halt the sequence; behind `HEYDOC_SEQUENCER` (default OFF = rollback) — resolves DEAD_END-1 |
| **Context-injection allow-list** (`verification/context-allowlist.js`, M3) | ✅ default-deny scoring-store firewall at the packet boundary; sealed nodes throw; `objective_data_offered` quarantined pending the vitals-sanitiser policy |
| **Session-bound persistence** (`verification/session-store.js`, M4) | ✅ **ENFORCED** — encounter-scoped, memory-only, destroy-on-close, demographic guard (release blocker cleared at the enforcement layer) |
| **Clinician Verification Portal gate** (`portal/verification-gate.js`, M5) | ◑ **gate contract built** — `releaseToPatient()` fail-closed, bound to the exact hash; UI/workflow + durable WORM gate-record storage remain |
| Terminology server (multi-system) | ✅ mock; grounds SNOMED_CT/ICD_10_AM/ICD_11/LOINC/PBS/AMT. **M11 P1: LIVE `$validate-code` adapter** (`live-adapter.js`) behind `HEYDOC_TERMINOLOGY_ENDPOINT` (mock default; dev_sandbox/ncts_live_api/self_hosted); dev_sandbox refused in production; fail-safe; smoke-verified vs CSIRO sandbox. **AU-content validation (NCTS/self-host) pending** |
| Pipeline edges (GroundingPlan/ContextPacket/EvidenceNode/Report) | ✅ zod-gated |
| Investigation parser (sanitiser) | ✅ engine; ranges **provisional (dev)**; fed by mock fhir Observations; live source + range sign-off pending |
| Pharmacology server + **Trunk 8.0 firewall** | ✅ mock; HARD_FAIL no-override; **live vendor pending (M9)** |
| Knowledge server + 3 datasets (benign/Axis-B/red-flag) | ✅ mock; datasets **provisional (dev)** — sign-off pending (M12) |
| fhir-broker (read/search; Observation→parser; `fhir_validate` AU Core structural vs vendored SDs 2.0.1-ci) | ✅ mock; live EHR + live-NCTS binding + AU Core version decision (C22) pending (M11) |
| messaging-geo (never sends) | ✅ mock; not wired to pipeline (gated by Portal COMPLETE — M13) |
| docs / identity-au | stubs |
| **Case-set + authoring pipeline** | ✅ **301 clinician-attested cases** (6 series: AUC/AMS/CVD/CIA/CFE/DST) in `data/cases/`; **1580 codes receipted**; `eval:cases` **CI-blocking**; `cases:ingest` (+`--reseq` global-seq id-scheme); all 7 difficulty tiers + 3 diagnosis categories |

## Milestones (ARCH_PLAN §3.7)
**M0–M8 done + merged** (pure engineering): M0 reconciliation · M1 mode-normaliser · M2 sequencer · M3 allow-list · M4 session persistence · M5 portal gate · M6 case set (301) + eval gate + `--reseq` · M7 verifier severity · M8 audit WORM seam.
**M11 P1 done + merged:** live terminology `$validate-code` adapter (sandbox target).
**Input-gated (see `.planning/M9-M14-MASTER-PLAN.md`):** M9 pharmacology vendor · M10 parser range sign-off · M11 AU-content (NCTS/self-host) + FHIR live + C22 · M12 knowledge sign-off · M13 messaging-geo (after Portal) · M14 portals (Class-1 SaMD decision).

## Open register items (see `docs/grounding/completeness-register.md` + gap-register R-rows)
**Patient-facing release blockers:** (1) pharmacology vendor — **M9, input-gated**; (2) Clinician Verification Portal — **gate built, UI/workflow/WORM-storage remain**; (3) investigation parser range sign-off — **M10, input-gated**; (4) session-bound persistence — **✅ enforced (M4)**.
**Input-gated (need vendor/credential/sign-off/decision):**
- Pharmacology live vendor (MIMS-AU/SafeScript) — R-22.
- `lab-reference-ranges-provisional`, `knowledge-datasets-provisional` — clinical sign-off (High).
- `terminology-contract-incomplete` (R-20) — mock + live adapter built; **AU-content (NCTS licence or self-host RF2) + AU Core value-set binding** pending. `terminology-live-adapter` (M11 P1) = adapter built, AU connect pending.
- `content-store-production-gated` — synthetic-only until persistence + consent.
- C22 AU Core version-target decision; `aucdi-r3-valueset-binding-unbuilt` — needs live NCTS.
- `objective-data-offered-sanitiser-policy` — patient-reported vitals withheld until the policy is confirmed.
**Resolved since last handoff:** context-injection-allowlist (M3) · session-persistence-unenforced (M4) · verifier-repo-invention-severity (M7) · receipt-store-append-only (M8, dev) · routing-plan-next-trunks-dead-end (M2) · case-id-cross-series-collision (`--reseq`) · cia-source-firewall-leaks · cfe/dst malformed bundles · mode-leakage-enforcelive (M1).

## Remaining WITHOUT external inputs (optional/polish)
1. **Distribution polish** — case set is 47/45/8 (str/atyp/complex) vs the 60/30/10 target; needs more straightforward and/or complex source (input-gated on operator source material).
2. Verifier fuzz-corpus hardening (FMEA F1, unscheduled).
3. Portal UI/workflow + durable WORM gate-record storage (large build, part of release blocker #2).

## Key file map
- Charter & invariants: `CLAUDE.md`; blueprint `.planning/ARCH_PLAN.md`; input-gated plan `.planning/M9-M14-MASTER-PLAN.md`
- Backlog / gaps / log: `docs/grounding/{completeness-register,gap-register,CHANGELOG}.md`; quick-ref `.claude/{completeness-index,schema-index,server-status}.md`
- Pipeline: `verification/pipeline.js` (routing→retrieval→inject→verify; firewall; fhir→parser; **allow-list**; **mode-normaliser**), `verification/retrieval-mcp.js`
- Safety code: `verification/{verifier,mode,hash,audit-store,ledger-schema,report-schema,pipeline-schemas,investigation-parser,context-allowlist,session-store,rehash}.js`
- Orchestration: `integration/{trunk-pipeline,trunk-sequencer}.js`
- Portal gate: `portal/verification-gate.js` + `mcp/schemas/verification-portal-decision.schema.json`
- Servers: `mcp/servers/{terminology(live-adapter.js,terminology-servers.json),pharmacology(engine.js),knowledge,fhir-broker(conformance.js,au-core/),messaging-geo}/`
- Contracts: `mcp/schemas/*.json` (13), `data/schemas/*.json` (7; scoring nodes 10–13 = the **firewall**, never read by the AI Doctor)
- Case authoring/ingest: `docs/case-authoring/*`, `scripts/{ingest-case-bundles(+`--reseq`),verify-case-codes,eval-case-gate,build-case-transformation-kit}.mjs`, `data/cases/<SPEC-ID>/` (301 cases), `data/digital_tablet_omnibus.json`
- Tests: `test/contract-*.js` (21 suites, wired into `npm test`)

## Workflow reminders (from the charter)
- Plan-gated: no code without an approved Phase-2 plan. Phases 0 (Completeness Scan) → 1 (Research/Clarify) → 2 (Plan, GATE) → 3 (Execute, per-phase GATE) → 4 (Review/docs).
- Every task: update the Completeness Register + gap-register + CHANGELOG + `.claude/*` when an item moves.
- All clinical data is DEV/SYNTHETIC-ONLY; mock must never be presented as live (mode-normaliser enforces); doses only from the pharmacology server; raw labs only via the parser; **NCTS licence material (SNOMED CT-AU RF2) NEVER enters the repo** — gitignored, deploy-injected.

## Live-connect note (M9–M14)
Every live connection is **staging-only, synthetic patients only**, contract-frozen (mock is the rollback), and validated against `eval:cases` before any production consideration. Credentials/mTLS/RF2 are injected at deploy from a secrets manager — the agent never enters them. Terminology has **three deployment models** (`terminology-servers.json`): CSIRO **dev_sandbox** (open, dev only), **NCTS live API** (OAuth), **self_hosted** (own Ontoserver + the SNOMED CT-AU RF2 on hand). The RF2 self-host is the production-grade path.

## To continue in Claude Chat (claude.ai)
Chat has no repo access. Create a **Project**, put an adapted `CLAUDE.md` as **custom instructions**, and upload as project knowledge: this file, `.planning/ARCH_PLAN.md`, `.planning/M9-M14-MASTER-PLAN.md`, `completeness-register.md`, `gap-register.md`, `CHANGELOG.md`, `.claude/{schema-index,server-status}.md`. Or attach the regenerated single-file digest (`node scripts/export-repo-digest.mjs` → `breath-ezy-repo-digest.md`, gitignored, `main @ c9e0a64`). Use Chat for planning/review; run execution back in Claude Code.

## Case transformation (Chat / Cowork)
Turn SOAP `.txt` notes into case-set bundles with the **single-file kit** `docs/case-authoring/breath-ezy-case-transformation-kit.json`. Output is one `<CASE_ID>.casebundle.json` per case → `npm run cases:ingest` (add `--reseq` to auto-assign a global seq on a cross-series id collision) splits it into `data/cases/`, computes SHA-256, runs the field-scoped firewall, carries the clinician attestation → `npm run cases:verify-codes` receipts the codes → `npm run eval:cases` gates the set. **Machine-generated cases stay `llm_generated_unreviewed` until a clinician attests**; the 301 in-repo carry recorded bulk attestations (reviewer `KL`, across 6 batches).
