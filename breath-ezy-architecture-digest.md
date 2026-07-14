# breath-ezy — Repository Architecture Digest

> Principal-engineer-level digest of `kenleefreo/breath-ezy`, regenerated 2026-07-14 at `main @ edb2c7a` (PRs #1–#66 merged). Written to serve as standalone context for future sessions. Supersedes the 2026-07-07 (`4edec92`) snapshot.
> Naming note: the repo is `breath-ezy`; in-code identifiers keep the legacy `heydoc` / `HEYDOC_*` prefix (npm name `heydoc`, env vars, `.heydoc-data`, citation IDs). This is intentional — never rename the code symbols.

---

## 1. Directory Tree

```
breath-ezy/
├── CLAUDE.md                        # Engineering charter: invariants, workflow, safety rules (the governing doc)
├── README.md                        # Architecture-in-30-seconds + repo map + quick start
├── package.json                     # "heydoc" v0.1.0, ESM; +@anthropic-ai/sdk ^0.111 (see §2)
├── Dockerfile · docker-compose.yml  # Portal runtime image (node:20-alpine); mock by default; opt-in AWS SM/S3
├── .github/workflows/ci.yml         # 9 blocking steps (see §6)
├── .planning/                       # Engineering plans + the live finish-line tracker
│   ├── FINISH-LINE.md               # THE tracker: FL-xx items, 4 blockers, per-owner next actions
│   ├── ARCH_PLAN.md · FLOW_PLAN.md · LIVE_PLAN.md · M9-M14-MASTER-PLAN.md
│   ├── PPP-TTT-PLAN.md · MEDGEMMA-ADAPTER-PLAN.md · CONSENT-PLAN.md · CORPUS-PLAN.md
│   ├── IDENTITY-FEDERATION-PLAN.md · HYGIENE-FL03-PLAN.md · OPERATOR-HANDBACK-CHECKLIST.md
│   ├── marketplace_integration_execution_plan.md
│   └── FL-30_PharmCheck_Self-Build_Prompt.md   # operator prompt that drove FL-30 (provenance)
├── .claude/                         # DERIVED quick-refs (source of truth always wins)
│   ├── completeness-index.md · schema-index.md · server-status.md
│   └── trunk-cheatsheets/           # One per trunk 1.0–9.0
├── architecture/                    # grounding-pipeline.md, sequence-diagrams.md, trust-boundaries.md
├── authoring/pharm/                 # ~36 *.author.json — human/agent-authored SOURCE records for the PharmCheck
│                                    #   datastore (NTI, interactions, renal, PK/PD, scheduling, dose-evidence…);
│                                    #   each carries provenance_defaults; every record forced review_status:draft
├── benchmark/mirage/                # First-party MIRAGE retrieval trust gate (H3)
│   ├── run-mirage.js · index.js · corpus-loader.js · mcp-client.js
│   ├── corpora/                     # v0.2.1 ATTESTED corpus (98/98 clinician-attested; the bench now GATES)
│   └── scores/latest.json
├── case-factory/                    # Synthetic case generation (H4)
│   ├── synthea/ · synthea-au/ · narratives/   # Pinned Apache-2.0 wrappers (+AU Core 0.3.0 fork)
│   ├── to-casebundle.js             # Phase-A shaper (firewall fail-closed)
│   ├── complete-scoring-nodes.js    # Phase-B draft scoring nodes (always clinician_reviewed:false)
│   └── generate-from-fixture.js · fixtures/
├── config/                          # flags.js (fail-safe feature-flag registry; IMAGING_PIXEL_INTERPRETATION),
│                                    #   jurisdiction.js (AU-only guard; US-context sources downgraded to unknown)
├── data/
│   ├── schemas/                     # 7 case-node schemas: 00–02 presentation store, 10–13 scoring store
│   ├── cases/                       # 303 SPEC-* case dirs (8 JSON files each; 302 carry an attestation block)
│   └── digital_tablet_omnibus.json  # Synthetic FHIR R4 omnibus patient record (~120 KB)
├── deploy/                          # Deploy-time docs/examples only (LIVE_PLAN L2): apprunner, bootstrap,
│                                    #   substrate registration; 3 envs, one-way promotion; nothing real committed
├── docs/
│   ├── HANDOFF-STATE.md · HANDOFF-ENGINEERING.md    # Resume-here + plain-language briefs
│   ├── case-authoring/              # SOAP→casebundle protocol + single-file transformation kit
│   └── grounding/                   # completeness-register.md, gap-register.md, CHANGELOG.md,
│                                    #   trunk-constraints.md, mcp-server-map.md, evaluation-guide.md, guardrail-spec.md
├── eval/
│   ├── pharmacology/                # FL-30 staging-validation evidence: validation-report + validation-signoff.md
│   │                                #   (KL 2026-07-13) + signoff/ (two signed xlsx worksheets, 88+308 records)
│   └── synthetic/mostly-ai/         # MOSTLY AI synthetic-data harness
├── grounding/                       # LEGACY pre-build gap register (superseded by docs/grounding/)
├── ingestion/                       # Document-intake pipeline (MI-10): OCR → de-id → structure → terminology → FHIR
│   ├── pipeline.js                  # 5 stages in order; de-id ON by default, fail-closed (blocks whole doc)
│   ├── deid/presidio.js             # Presidio de-id; fail-closed to BLOCK, no bypass flag
│   ├── ocr/                         # index + jsl / paddle / structured adapters
│   └── structuring/json-to-fhir.js
├── integration/
│   ├── trunk-pipeline.js            # runTrunkWithGrounding() — the public orchestration API
│   ├── trunk-sequencer.js           # Cross-trunk sequencing (HEYDOC_SEQUENCER, default OFF)
│   ├── llm-adapter.js               # GATED live Step-4 LLM client (default claude-sonnet-5; mock-by-default)
│   ├── llm-adapter-medgemma.js      # MedGemma Step-4 backend (same contract + bars; fetch transport)
│   ├── generation-backend.js        # Selectable Step-4 backend {claude(default), medgemma}; no failover
│   ├── evidence-arbiter.js          # Evidence Broker arbitration: grounded vs unknown; folded monotone into pass
│   ├── audit-substrates/            # s3-object-lock.js — WORM store seam (S3 Object Lock, COMPLIANCE, 7yr)
│   ├── harvest-manifest.json        # Register of ALL external code (licence, pin, adoption class)
│   └── record-sources/              # First-party SMART-on-FHIR client + AU provider registry (H1)
├── mcp/
│   ├── mcpServers.template.json     # Env/launch template; HEYDOC_MODE_DEFAULT=mock
│   ├── schemas/                     # 19 JSON Schemas (receipt, evidence-node, context-packet, pharm-*, …)
│   └── servers/                     # 10 servers + _shared/ (evidence-map.js) — see §4
│       ├── docs/ · identity-au/ · terminology/ (live-adapter.js) · knowledge/
│       ├── fhir-broker/ (live-backend.js, conformance.js, au-core/)
│       ├── pharmacology/ (engine.js, cds-adapter/, sources/, domain/, data/ 24 datasets) — see §4
│       ├── messaging-geo/ · evidence-fda-pubmed/ · evidence-drug-guideline/ (all + live-backend.js)
│       └── tooluniverse-gateway/ (tool-gateway.js DEFAULT-DENY core, fixtures/)
├── models/                          # Harvested-model adapters, SHIPPED DARK behind flags
│   ├── imaging/multimodal.js        # MedGemma pixel path; flag off → returns "unknown"
│   └── jamba/assembler.js           # Long-context bounding layer over Step-3 contextInjection
├── patient/
│   ├── consult-flow.js              # Pure screen-decision logic
│   └── consult-server.js            # `npm run consult` — patient-facing DEMO surface; releases nothing in mock
├── portal/                          # THE CLINICIAN VERIFICATION GATE (M5)
│   ├── server.js                    # `npm run portal` — server-rendered review console (LIVE_PLAN L1)
│   ├── verification-gate.js         # releaseToPatient() — fail-closed, hash-bound clinician gate
│   ├── gate-record-store.js         # Durable-first gate-record persistence (WORM seam)
│   ├── identity-federation.js       # FL-42: fail-closed clinician identity + bindSignature
│   ├── review-bundle.js             # Schema-gated ReviewBundle assembly
│   └── harvested-release.js         # H7 seam: every harvested path passes through here
├── scripts/                         # check-licence-clearance.mjs, check-secrets.mjs, eval-case-gate.mjs,
│                                    #   ingest-case-bundles.mjs, verify-case-codes.mjs, smoke-llm.mjs,
│                                    #   pharm-author.mjs, pharm-ingest.mjs, build-case-transformation-kit.mjs
├── test/                            # 78 contract suites (contract-*.js) + bench-mirage-gate.js + shared runners
├── trunk/
│   ├── prompts/trunk-{1.0..9.0}-system.md
│   └── trunk-*-stub-agent.js        # One runnable stub per trunk (CI entry points; 2.0 is stub-agent.js)
└── verification/                    # THE SAFETY CORE
    ├── pipeline.js                  # 5-step grounding pipeline (runPipeline @ L125; Step-4 hook @ L203)
    ├── verifier.js                  # 5 hard checks (byte-frozen) (verify @ L133)
    ├── hash.js                      # candidate_output_hash (SHA-256, exact bytes) (hashCandidateOutput @ L26)
    ├── integrity-detectors/         # Additive detectors (monotone AND)
    ├── conflict-audit.js            # Additive-only trust signal (H6)
    ├── context-allowlist.js         # Default-deny scoring-store firewall at packet boundary
    ├── investigation-parser.js      # Lab sanitiser (raw numbers → qualitative text)
    ├── session-store.js             # Memory-only, encounter-scoped persistence enforcement (blocker #4)
    ├── consent.js · consent-store.js · consent-schema.js · consent-scope.js   # Consent stack (L12/R-40)
    ├── ppp-ttt/ (+ abcde/, ledger.js)   # Triage layer (present-problem/triage-tag) + its own hash-chained ledger
    ├── consult-tagger.js · history-summary.js · eval-scoring.js · metrics.js
    ├── audit-store.js · ledger-schema.js · rehash.js   # Append-only hash-chained ledger + WORM seam
    ├── mode.js                      # Mode-normaliser (mock proof blocked outside dev)
    ├── pipeline-schemas.js · report-schema.js          # zod contracts
    ├── retrieval-mcp.js · run.js · omnibus.js
    └── data/                        # lab-reference-ranges.json + ledger storage (dev)
```

Ignored/generated (not shown): `node_modules/`, `.git/`, `.heydoc-data/`, `verification/report.json` + `evidence_tree.md` (regenerated per run, gitignored), `case-factory/out/`, `*.casebundle.json`, `breath-ezy-repo-digest.md` (script-generated), `Projects/`. Note the dupe-file pattern (§5.6) — `consult-tagger 2.js`, `history-summary 2.js` currently sit untracked in `verification/`.

---

## 2. Tech Stack & Dependencies

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Node.js 20, pure ESM** (`"type": "module"`) | No build step, no TypeScript — every file runs directly. Local dev may be Node 24; **CI/Node 20 is the gate**. |
| Tool protocol | **`@modelcontextprotocol/sdk` ^1.29** | All 10 MCP servers; stdio transport, spawned per retrieval. |
| LLM client | **`@anthropic-ai/sdk` ^0.111** (NEW since baseline) | Powers the gated live Step-4 path (`integration/llm-adapter.js`). Default model `claude-sonnet-5`; live only when `HEYDOC_LLM_LIVE` + key resolves. MedGemma backend uses `fetch`, not this SDK. |
| Validation | **`zod` ^3.23** (runtime) + **`ajv` ^8.20** (JSON Schema, case validation) | Contracts enforced twice: JSON Schema defines, zod gates at every pipeline boundary. |
| Database | **None.** File-based stores | Append-only hash-chained JSONL ledgers (4 of them: audit, gate-record, PPP-TTT triage, consent), JSON case/dataset files, in-memory session Map. Production **WORM storage** is a pluggable seam (`registerAuditSubstrate()` → `integration/audit-substrates/s3-object-lock.js`, AWS S3 Object Lock), registered at deploy boot — not a repo dependency. |
| Cloud services | **None at runtime today (mock default).** | GitHub Actions (CI). Adapter-ready live endpoints: Anthropic API (Sonnet-5, smoke-validated on AWS staging), AWS Secrets Manager (key path), AWS S3 Object Lock (WORM), CSIRO/NCTS FHIR + Ontoserver (terminology), wso2 fhir-mcp-server, MIMS-AU/SafeScript CDS (uncontracted — the empty slot), ToolUniverse. All credentials deploy-injected via secrets manager — never in repo. |
| LLM slot | **Gated, mock-by-default.** | Step 4 is no longer a bare hole: `llm-adapter.js` / `generation-backend.js` supply a real generator when live-enabled, but default runs still use `stubGenerationOutput()`. Whatever the model emits still passes the frozen verifier + detectors + PPP-TTT; it can never mint a code/dose or set patient-eligibility. |

Key npm scripts: `test` (78 contract suites), `verification`, `trunk:stub:all`, `eval:cases` (blocking gate), `licence:check` (blocking gate), `security:secrets` (blocking gate), `bench:mirage` (blocking gate), `portal`, `consult`, `smoke:llm`, `verify:rehash -- --integrity`, `cases:ingest [--reseq]`, `cases:verify-codes`, `kit:build`.

---

## 3. Architecture Overview

**Style:** a single-repo, layered **pipeline architecture with ports-and-adapters at the tool boundary** — not MVC, not microservices. Think "hexagonal grounding kernel": a deterministic five-step pipeline at the centre, MCP servers as swappable adapters (mock/dry_run/live per server), and a now-gated LLM slot in the middle that only ever sees a validated `ContextPacket`.

```
Patient message
  → 1 Routing        (GroundingPlan: which servers must be called first)
  → 2 Retrieval      (MCP tool calls; every call returns a Receipt)
  → 3 Context inject (ContextPacket: sanitised facts + EvidenceNodes + constraints + receipts — ONLY thing the LLM sees)
  → 4 Generation     (trunk LLM 1.0–9.0; gated live path OR stub — may explain/ask/format/route, never mint facts)
  → 5 Verification   (5 hard checks + integrity detectors + evidence-arbiter; pass=false → rejected; HARD_FAIL → blocked)
```

Structural principles:

- **Nine narrow "trunks"** instead of one agent (intake → triage → history → problem representation → Axis-B rule-out → investigation interpretation → code lock-in → pharmacology firewall → red-flag questionnaire). Each has a fixed output contract, making per-trunk verification tractable.
- **Five trust boundaries** (LLM vs deterministic truth; static docs vs operational facts; structured knowledge vs live APIs; patient-data minimisation; auditability). Preserved mechanically, not by prompt.
- **Two-store evaluation firewall:** case files `00–02` (presentation — AI-readable) vs `10–13` (scoring — sealed answer keys). Enforced at ingest, at the runtime packet boundary (default-deny allowlist that *throws*), and in the case-factory shaper.
- **Governance layer (H7):** every externally-harvested capability path routes through one fail-closed seam (`portal/harvested-release.js`) into the clinician verification gate; no gate record on the exact output hash → refused. The marketplace integration (MKT-P1/P2/P3) brought OCR ingestion, imaging (dark), the pharmacology CDS slot, the Evidence Broker, Ontoserver terminology, and the ToolUniverse gateway all in behind this seam.
- **Human-in-the-loop is now a runnable service:** `portal/server.js` renders the review console; a clinician approves/rejects/amends against the exact output hash, and only then does `releaseToPatient()` permit. `patient/consult-server.js` is the patient-side demo surface — in mock it releases nothing and shows "pending clinician sign-off".
- **Extension pattern:** the safety core is byte-frozen; new checks compose via **monotone AND** (can add failures, never rescue). This is the repo's signature move — integrity detectors, conflict-audit, evidence-arbiter, and the WORM substrate seam (chain algorithm frozen, storage pluggable) all follow it.

---

## 4. Key Domain Models & APIs

### Core data models (JSON Schema in `mcp/schemas/`, zod in `verification/pipeline-schemas.js`)

| Model | Required core | Role |
|---|---|---|
| **Receipt** | `request_id`, `timestamp_utc`, `upstream`, `mode` (live/dry_run/mock) | Proof artifact from every tool call. The cross-reference key for verification. |
| **EvidenceNode** | `id`, `claim`, `supports[]` (minItems 1), `provenance` | Atomic grounding unit: claim → proof refs. An unsupported claim is structurally invalid. |
| **GroundingPlan** | `needs_static_docs[]`, `needs_live_calls[]`, `needs_structured_kg[]` | Step-1 router output. |
| **ContextPacket** | `facts[]`, `evidence[]`, `constraints[]`, `receipts[]`, `trunk_id`, `mode` | The LLM's entire world. `lab_result` facts **must** carry `sanitised_by`; raw numerics rejected. |
| **VerificationReport** | 5 check results, `candidate_output_hash` (`sha256:` + 64 hex of exact bytes) | The medicolegal record. Validated before write; malformed reports throw. |
| **PharmIntent / PharmCheck** | intent has **no dose fields by design**; check carries status PASS/WARN/HARD_FAIL | Doses exist in exactly one schema in the whole system. Contracts frozen (byte-unchanged through FL-30). |
| **Case nodes 00–13** (`data/schemas/`) | envelope, presentation, conversational policy / ground truth, symptom links, management plan, safety netting | `case_id` pattern `^SPEC-[A-Z]{2,6}-0[1-7]-[0-9]{5}$` (difficulty tier baked into the id). |
| **VerificationGateRecord** (portal) | clinician decision bound to the exact `candidate_output_hash` | Required by `releaseToPatient()` / `releaseHarvestedOutput()`; persisted durable-first via `gate-record-store.js`. |
| **ConsentRecord** | encounter-scoped, hash-chained, PHI-minimised | L12/R-40: consent is a *recording* mechanism, not a permission unlock; `requireActiveConsent()` is the fail-closed seam every future persistence path must call. |
| **Audit ledger entry** | hash-chained, append-only, PHI-free | `verify:rehash -- --integrity` proves chain validity across all four ledgers. |

### APIs (MCP tools — the only service surface)

`docs_search/get/cite` · `identity_verify/lookup_ihi/log_consent` · `terminology_lookup/validate/map` (SNOMED_CT, ICD_10_AM, ICD_11, LOINC, PBS, AMT) · `kg_query/kg_provenance` (+ `kg_upsert/kg_export` SAFE_STUB) · `fhir_read/search` (+ `fhir_write` SAFE_STUB) · `pharm_intent/pharm_check` · `geo_locate/pharmacy_search` (+ `msg_send` SAFE_STUB, never sends) · evidence taps (`evidence_search` — FDA/PubMed + drug-guideline, advisory, structurally dose-free) · tooluniverse gateway (`execute_tool`, default-deny routed).

### Server classification (`mcp/servers/`, 10 servers + `_shared`)

| Server | Class | Note |
|---|---|---|
| docs | mock + live-backend | `chooseDocsRoute` |
| identity-au | **stub/mock** | live until a real connector is contracted |
| terminology | mock + **live-adapter** | NCTS Ontoserver `$validate-code` path (M11 P1, smoke-verified) |
| knowledge | **mock core** | real over curated datasets; live needs PostgreSQL |
| fhir-broker | mock + live-backend | templated AU Core; conformance validator runs against vendored CI-build snapshot |
| **pharmacology** | **self-built mock-core** | see below — FL-30 |
| messaging-geo | mock | `msg_send` SAFE_STUB — never sends |
| evidence-drug-guideline | mock core + live-backend | harvested #15 (MIT), advisory-only |
| evidence-fda-pubmed | mock core + live-backend | harvested #14 (MIT) |
| tooluniverse-gateway | compact-mode gateway | harvested #28 (Apache-2.0 v1.3.1); DEFAULT-DENY security boundary |

### The pharmacology server (FL-30 self-built PharmCheck core)

The highest-leverage build since the baseline. Rather than wait on a MIMS-AU contract, the clinical reference core was **self-built and clinician-signed**:

- **`engine.js`** — pure deterministic engine; a **6-check engine** (`nti_check` added + unknown-drug escalation). Reads clinical reference knowledge through the **`PharmDataSource` seam** (`sources/pharm-data-source.js`), not the raw JSON. Default `SyntheticSelfDevelopedSource` reads the clinician-SIGNED datastore in `data/*.json`, falling back to `mock-data.json` for unpopulated capabilities. Hard rules preserved: dose only on PASS/WARN, never HARD_FAIL/BLOCKED/paediatric; absent facts → NOT_RUN → `BLOCKED_NO_PROOF`. `receiptMode()` stays `'mock'` until Step-5 validation (never mock-as-live).
- **`cds-adapter/index.js`** — the AU CDS vendor slot (MIMS-AU/SafeScript), **explicit-but-empty** (blocker #1). `queryCds()` returns HARD_FAIL, emits no dosing/interaction/contraindication content. Critically: `PHARM_CDS=SYNTHETIC_SELF_DEVELOPED` selects the engine's data source but **does NOT unlock** this authoritative slot — only a contracted+validated `"FILLED"` vendor with a real endpoint does.
- **`data/`** — 24 curated JSON datasets: nti-register, drug-interactions, renal-rules, allergy-cross-reactivity, au-scheduling, strong-contraindications, serious-adverse-effects, pbs-formulary, dose-evidence (259 PubMed-verified records / 129 drugs), capability-groups (APF22 heading overlay), plus 8 **reference-only, engine-ISOLATED** capabilities (administration-handling, tdm-parameters, warning-labels, counselling-points, pregnancy-risk, hepatic, dose-evidence-review-queue). Engine-isolated = no `PharmDataSource` accessor reads them → the no-dose-from-LLM invariant stays intact.
- **Clinician sign-off:** Kenneth Lee (MED0001857758) attested the datastore across two worksheets (88 + 308 records); **zero per-record drafts remain**; dataset-level `clinical_sign_off:true` where fully attested, **regulatory `sign_off:false`**, `-dev` retained, non-patient-facing. Staging validation 20/20 pass + 8/8 adversarial fail-safe (`eval/pharmacology/validation-signoff.md`, KL 2026-07-13).

### Where the critical business logic lives

- **`verification/verifier.js`** (`verify` @ L133) — the five hard checks (invented codes/guidelines/operations/repo-names, HARD_FAIL enforcement) with per-code receipt binding. **Byte-frozen.**
- **`verification/pipeline.js`** (`runPipeline` @ L125; Step-4 generation hook @ L203) — step sequencing, sanitiser + allowlist gates, firewall wiring, detector composition.
- **`verification/hash.js`** (`hashCandidateOutput` @ L26) — the `candidate_output_hash` audit anchor.
- **`integration/trunk-pipeline.js`** — `runTrunkWithGrounding()`, the one sanctioned entry point.
- **`integration/llm-adapter.js` / `generation-backend.js`** — the gated Step-4 generator (packet-only bar, fail-closed on any error/refusal, no failover).
- **`mcp/servers/pharmacology/engine.js`** — the only dose source; HARD_FAIL terminal, paediatric → flag-for-review, never a dose.
- **`portal/verification-gate.js` + `server.js` + `harvested-release.js`** — human-in-the-loop release gating and the review console.
- **`scripts/eval-case-gate.mjs` + `check-licence-clearance.mjs` + `check-secrets.mjs`** — the CI-blocking evaluation, licence, and secret gates.

---

## 5. Coding Standards & Gotchas

**Conventions**
- **Plan-gated workflow** (per `CLAUDE.md`): no code without an approved Phase-2 plan; phases 0 (completeness scan) → 1 (research) → 2 (plan, GATE) → 3 (execute, per-phase GATE) → 4 (review/docs). Register + CHANGELOG + `.claude/*` updated whenever an item moves.
- **Schema-first:** define/update JSON Schema + zod before dependent logic. No data crosses a step without a validated contract.
- **Receipt discipline:** citation_id for static docs; full Receipt for live calls; dataset_version+checksum for datasets. *No receipt, no claim.*
- **Fail-closed everywhere:** missing proof → `BLOCKED_NO_PROOF`, never a plausible guess; ambiguous stub safety → classify `BLIND_STUB` until proven otherwise.
- Tests are dependency-free Node scripts using an `ok/no/check` micro-harness; every server ships with a contract test; commit style `type(scope): summary (Hn/Mn/FL-nn ref) (#PR)`.
- Comments explain *why a constraint exists* (clinician-engineer audience), not what the code does.

**Gotchas / hidden complexity**
1. **`heydoc` naming is load-bearing legacy** — package name, env vars (`HEYDOC_*`), `.heydoc-data`, citation IDs. Renaming breaks things; don't.
2. **The frozen-core rule is real:** `verifier.js`, `hash.js`, `audit-store.js`, `portal/verification-gate.js`, and the `pharm-intent`/`pharm-check` schemas are kept byte-identical through whole milestone blocks (verified by adversarial review and `git diff`). Extend via monotone-AND composition, never by editing.
3. **Two registers, one-way flow:** completeness-register (exhaustive) promotes High/Critical items into gap-register (curated, build-order-authoritative). `.claude/` files are derived — when they disagree with source, the derived file is the defect. `.planning/FINISH-LINE.md` is the live cross-owner tracker layered on top.
4. **Mock is honest but flagged:** mock receipts pass in dev, are *blocked as proof* in staging/production by the mode-normaliser. Never present mock as live. The self-built pharmacology datastore stays `mode:'mock'` and `-dev` for exactly this reason — clinician-signed ≠ live.
5. **`PHARM_CDS=SYNTHETIC_SELF_DEVELOPED` is a data-source selector, not a vendor unlock.** The authoritative CDS slot (`cds-adapter/`) stays HARD_FAIL until a real contracted vendor is `"FILLED"`. Do not conflate "self-build validated" with "blocker #1 closed".
6. **Cloud-sync dupe cruft recurs on this machine:** tracked `" 2.json"`/`" 2.js"` dupes have been purged before (PRs #20–#22) with `.gitignore` guards (`* [0-9].*`). Two untracked `verification/*​ 2.js` dupes currently sit in the tree — safe to delete; watch for the pattern before committing.
7. **Ajv `date-time` warnings** in the evidence-server tests ("unknown format ignored") are benign but mean those timestamp formats aren't actually format-validated (`ajv-formats` not wired).
8. **Licence gate BLOCKs are semantic:** refuses unlicensed harvest dirs and enforces the ToolUniverse RCE-fix version floor (a pin downgrade fails CI). Unclear licence → clean-room rebuild, reference-only. APF22/RASML are registered **reference-only** (facts + citation), no content licence held — no prose/tables reproduced.
9. **Node 24 locally vs Node 20 in CI** — CI is the gate.
10. **Secrets:** `example.invalid` placeholders are sanctioned; the secret-scan gate (`security:secrets`) blocks CI on credential-shaped strings; NCTS RF2 / API keys / mTLS never enter the repo. AWS SM/S3 SDKs are Docker opt-ins (`INSTALL_AWS_SM`/`INSTALL_AWS_S3`), not core deps — the runtime stays cloud-agnostic.

---

## 6. Current Roadmap / Todos

Sources: `.planning/FINISH-LINE.md` (the tracker), `docs/grounding/{completeness-register,gap-register,CHANGELOG}.md`, `docs/HANDOFF-*.md`, `README.md`.

**Where the project stands (2026-07-14, `main @ edb2c7a`):** the mock-mode safety scaffolding is built, orchestrated, adversarially reviewed, and CI-gated — and has grown well beyond the baseline: a **self-built + clinician-signed PharmCheck core** (FL-30), a **gated live Sonnet-5 generation path** validated on AWS staging, a **WORM audit substrate** (S3 Object Lock), a **consent stack**, a **runnable Clinician Verification Portal + patient consult UI**, and the **marketplace integration** (OCR ingestion, imaging-dark, CDS slot, Evidence Broker, Ontoserver, ToolUniverse) all behind the H7 governance seam. **Nothing is patient-facing, by design** — every dataset stays `-dev`, receipts stay `mode:mock`, and `patient_eligible` is false on every path.

**CI (all blocking, Node 20):** `npm ci` → `npm audit --audit-level=high` → `security:secrets` → `licence:check` → `npm test` (78 suites) → `verification` → `trunk:stub:all` → `eval:cases` → `bench:mirage`.

**The four patient-facing release blockers:**
1. **Pharmacology vendor** — self-built core validated in staging (FL-30) + full clinician sign-off; but the live CDS vendor slot (`cds-adapter/`) is still empty/HARD_FAIL, and regulatory (TGA) sign-off + live PBS pull remain. **NOT green.**
2. **Clinician Verification Portal** — fail-closed hash-bound gate + L1 review console + identity federation (FL-42) built; **durable WORM gate-record storage (FL-11) + live IdP connect (FL-43) remain**. PARTIAL, not green.
3. **Investigation parser** — engine built + wired + clinical sign-off (FL-23); regulatory sign-off, sex/age-specific ranges, and a live fhir-broker lab source remain. PARTIAL, not green.
4. **Session-bound persistence** — ✅ enforced (memory-only `session-store.js`). Green.

**Four-part patient-eligibility precondition:** MIRAGE H3 gate passed + governance H7 wired + MIRAGE corpus attested (v0.2.1, 98/98) — 2-of-4 arms met, but real Portal UI durable gate-records (M5 remainder) keep `patient_eligible` false everywhere.

**Most recent CHANGELOG movement (newest first):** FL-30 clinician sign-off pass 2 (308 records, datastore fully attested, 2026-07-14) · FL-30 worksheet sign-off (88 records) · FL-30 APF22 reorg P1/P2 (reference-only capabilities) · FL-30 dose-evidence citation register (259 records) · FL-30 PharmCheck self-build validated in staging (2026-07-13) · FL-20/FL-23 knowledge + lab-range clinical sign-off · MKT-P1/P2/P3 marketplace integration · FL-21 MIRAGE corpus attestation (the bench now gates) · FL-42 clinician identity federation · L12 consent capture · B1 S3 Object Lock WORM · MODEL Sonnet-5 default + AWS Secrets Manager + live smoke.

**Highest-leverage next actions (from `.planning/FINISH-LINE.md`, mostly operator-gated):** initiate the long-leads now — live CDS pharmacology vendor (FL-34), NCTS licence + AU Core conformance-target decision (FL-31), clinician-identity IdP vendor (FL-43); the cheapest unblock is the **staging deploy (FL-12)**, which arms the whole eval-gate workstream, with the **WORM bucket (FL-11)** second. Available un-gated engineering: FL-05 (wire the reserved frozen `pregnancy_check`/`hepatic_check`, TGA pregnancy bulk-sync, warning-label CAL verbatim — engine logic only, no frozen change). Everything funnels through **FL-50 TGA classification** for dataset/receipt promotion, then **FL-52 operator release authorisation**.
