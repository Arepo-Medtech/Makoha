# Breath-Ezy — State Snapshot / Resume-Here

Dense context handoff for continuing in a fresh Claude Code session or Claude Chat.
Source of truth remains the repo; this is a pointer + current-state index.

**Repo:** `kenleefreo/breath-ezy` · `main` @ `a6f42f5` (PRs #1–#32 merged; updated 2026-07-07).
**Stack:** Node 20 (CI), ESM, `@modelcontextprotocol/sdk ^1.29`, `zod ^3`, `ajv ^8` (case-schema validation). Mock by default (`HEYDOC_MODE_DEFAULT=mock`). **Nothing patient-facing.**

**Since the last handoff (was `c9e0a64`, PRs #1–#17):** the **FLOW_PLAN harvest block H0–H7 is complete and merged** (PRs #24–#32; plan: `.planning/FLOW_PLAN.md`). External open-source capability was brought in behind a mechanical licence gate: **H0** harvest manifest (41 rows) + BLOCKING `licence:check` CI gate; **H1** fhir-broker live backend (pinned wso2/fhir-mcp-server) + first-party `record-sources` SMART-on-FHIR client; **H2** evidence taps (#14 FDA/PubMed, #15 drug-guideline with a structural **no-dose bar**, #1 docs override) + four integrity detectors (monotone AND, `verifier.js` byte-unchanged); **H3** first-party **MIRAGE retrieval trust gate, BLOCKING in CI**; **H4** synthetic case factory (synthea/synthea-au/chatty-notes + two-phase shaper) — case set now **303 dirs / 301 attested**; **H5** ToolUniverse gateway (DEFAULT-DENY, executor proven unreachable, RCE-floor pin enforced by licence:check BLOCK 5); **H6** first-party conflict-audit (**additive-only, never a gate**); **H7** governance wiring — **every harvested path fail-closed through the existing M5 portal gate**. Where a licence didn't clear, code was NOT wrapped: #20 (MedRAG) and #5 (conflict-optimizer) flipped to REFERENCE·methodology-only and rebuilt clean-room. RETAIN core (`verifier.js`, `audit-store.js`, `portal/verification-gate.js`) **byte-unchanged**, confirmed by adversarial review. Nothing flipped `patient_eligible:true`. Also: 236 cloud-sync duplicate case files removed + ingest hygiene warning (PRs #20–#22).

## Run / verify
```
npm ci
npm test                        # 34 contract suites, all OK (29 + 5 H7 governance)
npm run licence:check           # BLOCKING harvest-licence gate — 0 blocks, 12 warns (unpinned ADOPT rows)
npm run eval:cases              # BLOCKING case-set gate — PASS (303 dirs; 301 attested; distribution warn)
npm run bench:mirage            # BLOCKING MIRAGE trust gate (retrieval stays patient_eligible:false until passed + attested corpus)
npm run cases:ingest -- "<folder>" [--reseq] [--dry-run]   # ingest bundles (--reseq auto-assigns a global seq on collision)
npm run cases:verify-codes      # receipt case candidate codes vs the mock terminology server
npm run verification            # Pass
npm run trunk:stub:all          # 9/9 (and HEYDOC_USE_MCP=1 → 9/9 via real MCP servers)
npm run verify:rehash -- --integrity   # ledger integrity (chain VALID, 0 drift)
npm audit --audit-level=high    # 0
```
CI order (Node 20, push/PR to `main`): `npm ci` → `npm audit` → **licence:check** → `npm test` → `verification` → `trunk:stub:all` → **eval:cases** → **bench:mirage** — all blocking.
Gotcha: local dev may be on Node 24; **CI/Node 20 is the gate.**
Derived `verification/report.json` + `evidence_tree.md` are **gitignored** (regenerated every run; the durable record is the ledger in `.heydoc-data/`). Case-factory outputs (`*.casebundle.json`, `*.caseseed.json`, `case-factory/out/`) are gitignored.

## Component status (all mock unless noted)
| Component | State |
|---|---|
| Hashing `candidate_output_hash` (SHA-256) | ✅ required, zod-gated, tested |
| Audit ledger (append-only, hash-chained) + content store (synthetic-only) + `verify:rehash` | ✅ + M8 WORM substrate SEAM. Live WORM + retention = deploy/regulatory |
| Verifier (5 checks) | ✅ tested; per-code binding; mock-mode flag; per-check `severity` (M7). **Byte-unchanged through H0–H7** |
| **Integrity detectors** (`verification/integrity-detectors/`, H2) | ✅ four pure detectors (`advisory_dose_leak`, `fabricated_citation_marker`, `unsupported_statistic`, `overconfident_diagnosis`; #8 PATTERN-LIFT, MIT) — composed via **monotone AND** in pipeline.js; can only add failures, never rescue |
| Mode-normaliser (`verification/mode.js`, M1) | ✅ staging/production/unknown **block mock proof** |
| Cross-trunk sequencer (`integration/trunk-sequencer.js`, M2) | ✅ behind `HEYDOC_SEQUENCER` (default OFF); byte-unchanged through H6 (D-1: no new orchestrator) |
| Context-injection allow-list (`verification/context-allowlist.js`, M3) | ✅ default-deny scoring-store firewall; `objective_data_offered` quarantined pending vitals-sanitiser policy |
| Session-bound persistence (`verification/session-store.js`, M4) | ✅ **ENFORCED** — encounter-scoped, memory-only, destroy-on-close, demographic guard |
| Clinician Verification Portal gate (`portal/verification-gate.js`, M5) | ◑ gate contract built, fail-closed, hash-bound; **H7: every harvested path now routes through it via `portal/harvested-release.js`** (frozen 5-entry path allow-list; refuses without a VerificationGateRecord on the exact hash; dev-mode refuses even with a record). UI/workflow + durable WORM gate-record storage remain |
| **Harvest manifest + licence gate** (`integration/harvest-manifest.json` + `scripts/check-licence-clearance.mjs`, H0) | ✅ 41-row manifest; BLOCKING CI; BLOCK 5 enforces the ToolUniverse **RCE floor (v1.3.0 semver-gte)**; 0 blocks / 12 warns today |
| Terminology server (multi-system) | ✅ mock; live `$validate-code` adapter (M11 P1) behind `HEYDOC_TERMINOLOGY_ENDPOINT`; **AU-content validation (NCTS/self-host) pending** |
| **fhir-broker live backend** (`live-backend.js`, H1) | ◑ Node adapter to pinned wso2/fhir-mcp-server (Apache-2.0, v0.10.0 `6307fe71`); mode-gated, mock rollback intact; live input-gated on `HEYDOC_FHIR_MCP_ENDPOINT` |
| **Record-sources ingest** (`integration/record-sources/`, H1) | ◑ first-party clean-room SMART-on-FHIR client + AU provider registry; all non-mock providers `available:false`, secrets-manager refs only |
| **Evidence taps** (`mcp/servers/evidence-fda-pubmed/`, `evidence-drug-guideline/`, H2) | ◑ #14 (MIT, `1c4c40c3`) + #15 (MIT, `13d2fddd`, **ADVISORY with structural no-dose bar**: `.strict()` schema + `assertNoDose()` + detector); shared `_shared/evidence-map.js` → EvidenceNode, no schema churn; `patient_eligible:false` pending MIRAGE-attested + H7 record |
| docs server | ◑ overridden to #1 anthropics/healthcare (first-party, pinned `dff06a1b`); **mock abstains on no-match** (#29) so the MIRAGE abstain partition passes |
| **MIRAGE trust gate** (`benchmark/mirage/`, H3) | ✅ first-party clean-room (#20 = REFERENCE only, no code); BLOCKING CI. Hard gates: P ≥0.60 · N abstain=1.00 · A dose-invariant=1.00, over ATTESTED items only. Corpus v0.1.0 DRAFT (23 items, synthetic, **unattested** → non-gating today; all retrieval paths stay ineligible). Never sets `patient_eligible` |
| Pipeline edges (GroundingPlan/ContextPacket/EvidenceNode/Report) | ✅ zod-gated |
| Investigation parser (sanitiser) | ✅ engine; ranges **provisional (dev)**; live source + range sign-off pending (M10) |
| Pharmacology server + Trunk 8.0 firewall | ✅ mock; HARD_FAIL no-override; **live vendor pending (M9)** |
| Knowledge server + 3 datasets | ✅ mock; datasets provisional (dev) — sign-off pending (M12) |
| messaging-geo (never sends) | ✅ mock; gated by Portal COMPLETE (M13) |
| identity-au | stub |
| **ToolUniverse gateway** (`mcp/servers/tooluniverse-gateway/`, H5) | ◑ DEFAULT-DENY security core (hard-deny executors+families → auth → allow-list → route → **enforced egress**); executor disabled + proven unreachable by contract test; fixture-backed discovery; runtime input-gated on `HEYDOC_TOOLUNIVERSE_CMD` + keys + deploy egress policy |
| **Conflict-audit** (`verification/conflict-audit.js`, H6) | ✅ first-party clean-room (#5 = REFERENCE only, licence pending); pure, deterministic, zod `.strict()`; **additive-only, NOT a gate** — verdicts/hash pass through verbatim, firewall fields never touched; `conflict_flagged` not wired into any release decision (future plan-gated) |
| **Governance wiring** (`portal/harvested-release.js` + `governedRelease()` per adapter, H7) | ✅ every harvested path (H1–H5) fail-closed to the portal gate; ledger records metadata-only/PHI-free; 5 governance contract suites |
| **Case-set + authoring pipeline** | ✅ **303 case dirs = 301 v2-refreshed attested + 2 kept v1 orphans** (1 unreviewed demo `SPEC-CARD-06-00000`; 1 exempt pre-ingest reference `SPEC-CARD-04-00001`) — the v1 303 were retired 2026-07-17 as their v2 telehealth-reprojections superseded them (map `docs/grounding/v1-v2-supersession-map.md`; 0 duplication, 0 coverage loss); `eval:cases` CI-blocking PASS; coverage 7 tiers · 3 categories · 18 specialties; distribution 49/45/7 vs 60/30/10 target (non-blocking warn) |
| **Case factory** (`case-factory/`, H4) | ◑ synthea (Apache-2.0, `2b0a55ba`) + synthea-au fork (AU Core 0.3.0 + AuditEvent, `4647221f`) + chatty-notes narratives (`a767a579`); two-phase shaper (Phase-A firewall fail-closed, no diagnosis-name leak; Phase-B scoring-node drafts `clinician_reviewed:false`); generator runtime input-gated |

## Milestones
**ARCH_PLAN M0–M8 done + merged** (pure engineering) · **M11 P1 done** (live terminology adapter).
**FLOW_PLAN H0–H7 done + merged** (harvest block, PRs #24–#32): H0 licence gate · H1 record spine · H2 evidence taps + detectors · H3 MIRAGE gate · H4 case factory · H5 ToolUniverse · H6 conflict audit · H7 governance wiring. **H7 was the last FLOW milestone**; deferred harvest items (PyHealth #23, MONAI #22, fulcra #19, TxAgent, cTAKES/Hermes, evidence-graded #18) are explicitly out of scope pending licences/decisions.
**Input-gated (see `.planning/M9-M14-MASTER-PLAN.md`):** M9 pharmacology vendor · M10 parser range sign-off · M11 AU-content (NCTS/self-host) + FHIR live + C22 · M12 knowledge sign-off · M13 messaging-geo (after Portal) · M14 portals (Class-1 SaMD decision).

## Patient-eligibility precondition (H7 framing)
A harvested retrieval path opens only when **all four** hold: (1) MIRAGE gate passed (H3 ✅ mechanism), (2) governance-gated to the portal (H7 ✅), (3) MIRAGE corpus clinically attested (§7 — **open**), (4) Portal UI + durable gate-record storage (M5 remainder — **open**). H0–H7 delivered the mechanisms; nothing is eligible today, by design.

## Open register items (see `docs/grounding/completeness-register.md` + gap-register R-rows)
**Patient-facing release blockers:** (1) pharmacology vendor — M9, input-gated; (2) Clinician Verification Portal — gate + **H7 governance wiring built**; UI/workflow/WORM-storage remain; (3) investigation parser range sign-off — M10, input-gated; (4) session-bound persistence — ✅ enforced (M4).
**Input-gated (need vendor/credential/sign-off/decision):**
- Pharmacology live vendor (MIMS-AU/SafeScript) — R-22.
- `lab-reference-ranges-provisional`, `knowledge-datasets-provisional` — clinical sign-off (High).
- `terminology-contract-incomplete` (R-20) — mock + live adapter built; AU-content (NCTS licence or self-host RF2) + AU Core value-set binding pending.
- `fhir-live-adapter` / `au-record-sources-ingest` (R-28) — live endpoint + provider onboarding.
- `harvest-confirm-licences-pending` — narrowed by H1/H2/H5 pins; **#18 evidence-graded deferred on licence (BLOCK 3 refuses it)**; **#5 conflict-optimizer licence pending (reference-only)**.
- **MIRAGE corpus attestation** — v0.1.0 DRAFT, 23 synthetic items, `attested_by:null`; clinical attestation required before the gate can pass anything.
- `tooluniverse-runtime-input-gated` — Python runtime + `HEYDOC_TOOLUNIVERSE_CMD` + keys + deploy egress policy.
- `synthea-generators-input-gated` — Java/generator runtime for live case generation.
- `content-store-production-gated`; C22 AU Core version-target decision; `aucdi-r3-valueset-binding-unbuilt`; `objective-data-offered-sanitiser-policy`.
**Resolved since last handoff:** harvest-licence-clearance-gate (H0) · mirage-benchmark-gate (H3) · integrity-detectors (H2) · guardrail-spec-written (H2) · conflict-audit-trust-signal (H6) · governance-wiring-harvested-paths (H7) · fasten-sources register defect (H1) · case-dir-duplicate-files + sync-dupe cruft (#20–#22) · casebundle contract drift `files[].node`→`files[].path` (H4).

## Remaining WITHOUT external inputs (optional/polish)
1. **Distribution top-up** — 48/45/7 (str/atyp/complex) vs the 60/30/10 target; needs more straightforward/complex source material (non-blocking eval warn).
2. Verifier fuzz-corpus hardening (FMEA F1, unscheduled).
3. Portal UI/workflow + durable WORM gate-record storage (large build, part of release blocker #2).

## Key file map
- Charter & invariants: `CLAUDE.md`; blueprints `.planning/{ARCH_PLAN,FLOW_PLAN,M9-M14-MASTER-PLAN}.md`
- Backlog / gaps / log: `docs/grounding/{completeness-register,gap-register,CHANGELOG}.md`; quick-ref `.claude/{completeness-index,schema-index,server-status}.md`
- Harvest governance: `integration/harvest-manifest.json` · `scripts/check-licence-clearance.mjs` · `docs/grounding/guardrail-spec.md`
- Pipeline: `verification/pipeline.js` (routing→retrieval→inject→verify; firewall; fhir→parser; allow-list; mode-normaliser; **detectors**), `verification/retrieval-mcp.js`
- Safety code: `verification/{verifier,mode,hash,audit-store,ledger-schema,report-schema,pipeline-schemas,investigation-parser,context-allowlist,session-store,rehash,conflict-audit}.js` + `verification/integrity-detectors/`
- Orchestration: `integration/{trunk-pipeline,trunk-sequencer}.js`; record spine `integration/record-sources/`
- Portal: `portal/{verification-gate,harvested-release}.js` + `mcp/schemas/verification-portal-decision.schema.json`
- Servers: `mcp/servers/{terminology(live-adapter.js),pharmacology(engine.js),knowledge,fhir-broker(live-backend.js,conformance.js,au-core/),messaging-geo,evidence-fda-pubmed,evidence-drug-guideline,tooluniverse-gateway,_shared(evidence-map.js)}/`
- Trust gate: `benchmark/mirage/` (runner, corpus v0.1.0 DRAFT, `scores/latest.json`)
- Case factory: `case-factory/{synthea,synthea-au,narratives,to-casebundle.js,complete-scoring-nodes.js,generate-from-fixture.js}`
- Contracts: `mcp/schemas/*.json`, `data/schemas/*.json` (scoring nodes 10–13 = the **firewall**, never read by the AI Doctor)
- Case authoring/ingest: `docs/case-authoring/*`, `scripts/{ingest-case-bundles,verify-case-codes,eval-case-gate,build-case-transformation-kit}.mjs`, `data/cases/` (303 dirs)
- Tests: `test/contract-*.js` + `test/bench-mirage-gate.js` + `test/governance-path-contract.js` (34 suites in `npm test`)

## Workflow reminders (from the charter)
- Plan-gated: no code without an approved Phase-2 plan. Phases 0 (Completeness Scan) → 1 (Research/Clarify) → 2 (Plan, GATE) → 3 (Execute, per-phase GATE) → 4 (Review/docs).
- Every task: update the Completeness Register + gap-register + CHANGELOG + `.claude/*` when an item moves.
- All clinical data is DEV/SYNTHETIC-ONLY; mock must never be presented as live (mode-normaliser enforces); doses only from the pharmacology server; raw labs only via the parser; **NCTS licence material (SNOMED CT-AU RF2) NEVER enters the repo** — gitignored, deploy-injected.
- Harvest discipline (FLOW_PLAN): nothing external enters without a manifest row + licence clearance; unclear licence → REFERENCE·methodology-only + clean-room rebuild; every adopted repo pinned by commit; `licence:check` blocks CI on violation.

## Live-connect note (M9–M14)
Every live connection is **staging-only, synthetic patients only**, contract-frozen (mock is the rollback), and validated against `eval:cases` before any production consideration. Credentials/mTLS/RF2 are injected at deploy from a secrets manager — the agent never enters them. Terminology has three deployment models (`terminology-servers.json`): CSIRO **dev_sandbox** (open, dev only), **NCTS live API** (OAuth), **self_hosted** (own Ontoserver + the SNOMED CT-AU RF2). The RF2 self-host is the production-grade path.

## To continue in Claude Chat (claude.ai)
Chat has no repo access. Create a **Project**, put an adapted `CLAUDE.md` as **custom instructions**, and upload as project knowledge: this file, `.planning/{ARCH_PLAN,FLOW_PLAN,M9-M14-MASTER-PLAN}.md`, `completeness-register.md`, `gap-register.md`, `CHANGELOG.md`, `.claude/{schema-index,server-status}.md`. Or attach the regenerated single-file digest (`node scripts/export-repo-digest.mjs` → `breath-ezy-repo-digest.md`, gitignored; regenerate at `main @ a6f42f5`). Use Chat for planning/review; run execution back in Claude Code.

## Case transformation (Chat / Cowork)
Turn SOAP `.txt` notes into case-set bundles with the **single-file kit** `docs/case-authoring/breath-ezy-case-transformation-kit.json` (rebuilt to current sources, #23). Output is one `<CASE_ID>.casebundle.json` per case → `npm run cases:ingest` (add `--reseq` to auto-assign a global seq on a cross-series id collision) splits it into `data/cases/`, computes SHA-256, runs the field-scoped firewall (non-canonical stray files warn at write time, #22), carries the clinician attestation → `npm run cases:verify-codes` receipts the codes → `npm run eval:cases` gates the set. **Machine-generated cases stay `llm_generated_unreviewed` until a clinician attests** — the H4 factory's Phase-B scoring-node drafts are always `clinician_reviewed:false`; the 301 attested in-repo carry recorded bulk attestations (reviewer `KL`).
