# Completeness Index (derived — read first per <context_loading>)

One line per open Completeness Register item: `id · path · state · risk · blocks_patient_facing`.
Source of truth: `docs/grounding/completeness-register.md` + the live scan. If this disagrees with the register, the register wins and this file is the defect.

Last synced: 2026-07-03 (ARCH_PLAN milestone M0 reconciliation & re-scan: case set corrected to **52 cases** (C18/F15 closed); gap-register §1b prose reconciled to built reality (C17); NEW findings registered + promoted — `routing-plan-next-trunks-dead-end` (DEAD_END-1 → R-24), `mode-leakage-enforcelive` (C16 → R-25), `context-injection-allowlist` recorded in-register (→ R-26); `case-dir-duplicate-files` + `repo-digest-sealed-node-carveout` opened; blueprint copied to `.planning/ARCH_PLAN.md` with FMEA owners renumbered to §3.7 + operator model-split override).
Prior sync: 2026-07-01 (doc reconciliation: closed `claudemd-behind-charter` + `derived-docs-unverified` — CLAUDE.md server-status prose + .claude/server-status.md pharmacology row now match the register; schema-index verified accurate). Prior 2026-06-30 full session: hashing, audit-ledger, verifier tests/hardening, pipeline gates, investigation parser, pharmacology + Trunk 8.0 firewall, knowledge server + datasets, fhir-broker + messaging-geo. All 7 MCP servers now built (mock); investigation parser has a mock fhir lab source. Remaining: live vendors/EHR + conformance, clinical sign-off on provisional datasets/ranges, Clinician Verification Portal, session persistence, terminology-contract (ICD-10-AM/LOINC/PBS).

## Critical
- pharmacology-server-unbuilt · mcp/servers/pharmacology/ · PARTIAL (mock core + Trunk 8.0 firewall wired; only live vendor pending) · Critical · pf:true
- investigation-parser-unbuilt · verification/investigation-parser.js · PARTIAL (engine built mock/dev; provisional ranges + no live source) · Critical · pf:true
- clinician-verification-portal-unbuilt · portal/verification-gate.js (gate + contract BUILT M5 2026-07-03; releaseToPatient fail-closed, hash-bound, dev modes never release) · PARTIAL (UI/workflow + WORM gate-record storage remain) · Critical · pf:true
- ~~session-persistence-unenforced · verification/session-store.js~~ · **resolved 2026-07-03 (M4, enforcement)** — memory-only encounter-scoped store, destroy-on-close, demographic guard; contract-tested (R-10 enforcement built; adoption mandatory for any future stateful session path)

## High
- ~~context-injection-allowlist · verification/context-allowlist.js~~ · **resolved 2026-07-03 (M3)** — default-deny mirror of the ingest firewall enforced in contextInjection(); sealed nodes throw; contract-tested (R-26 resolved)
- ~~routing-plan-next-trunks-dead-end · integration/trunk-sequencer.js~~ · **resolved 2026-07-03 (M2)** — sequencer built + contract-tested; HARD_FAIL/escalate/verify-fail halt the sequence unconditionally; behind HEYDOC_SEQUENCER (default off = rollback) (R-24 resolved)
- ~~mode-leakage-enforcelive · verification/mode.js~~ · **resolved 2026-07-03 (M1)** — normaliser built + wired into verifier/pipeline/audit-store; staging/production/unknown block mock proof; contract-tested (R-25 resolved; server-side receipt stamping → M9/M11)
- terminology-contract-incomplete · terminology (SNOMED/ICD-10-AM/ICD-11/LOINC/PBS/AMT, mock; live NCTS + AU Core binding pending) · PARTIAL · High · pf:true
- knowledge-datasets-provisional · mcp/servers/knowledge/data/*.json · PARTIAL (dev seeded; clinical sign-off) · High · pf:true
- receipt-store-append-only-unbuilt · verification/audit-store.js · PARTIAL (mock-resolved; prod WORM+retention pending) · High · pf:true

## Medium
- knowledge-server-unbuilt · mcp/servers/knowledge/ · PARTIAL (mock built; live PostgreSQL graph store pending) · Medium · pf:false
- fhir-broker-unbuilt · mcp/servers/fhir-broker/ · PARTIAL (mock read/search + Observation→parser wired; live EHR + conformance pending) · Medium · pf:false
- messaging-geo-unbuilt · mcp/servers/messaging-geo/ · PARTIAL (mock; never-sends; live providers pending) · Medium · pf:false
- pipeline-routing-retrieval-stub · verification/pipeline.js · PARTIAL · Medium · pf:false
- case-set-underpopulated · data/cases/ (**151 cases**: 150 attested + 1 pending AFib SPEC-CARD-01-00099; **721 codes receipted**; eval gate CI-BLOCKING PASS; distribution **46/51/3**, coverage 5 tiers · 3 categories) · PARTIAL · Medium · pf:false (→ R-23; remaining = attest AFib case, more complex to ~10% — INPUT-GATED)
- case-id-cross-series-collision · data/cases/ SPEC id scheme · PARTIAL · Low · pf:false — INSTANCE RESOLVED (AFib re-id'd → SPEC-CARD-01-00099, ingested); systemic scheme (seq not unique across series) decision outstanding for future series
- reference-case-manifest-missing · data/cases/SPEC-CARD-04-00001/ (pre-ingest, no manifest; named-exempt in verify-codes + eval gate) · PARTIAL · Low · pf:false (retrofit via ingest round-trip under a gated step)
- case-dir-duplicate-files · data/cases/*/ (236 untracked "* 2.json" Finder duplicates across 30 dirs, incl. sealed-node name duplicates — inventoried by filename only, never opened) · PARTIAL · Medium · pf:false (delete under a gated cleanup step)
- objective-data-offered-sanitiser-policy · verification/context-allowlist.js (quarantine rule) · PARTIAL · Medium · pf:true — patient-reported vitals withheld from trunk context until the operator confirms the sanitiser policy (charter <data_handling> open follow-up; input-gated)
- case-ingest-tool · scripts/ingest-case-bundles.mjs · COMPLETE (validate+split+hash+field-scoped firewall; contract-tested) · Low · pf:false
- content-store-production-gated · verification/audit-store.js persistContent · PARTIAL (synthetic-only until persistence Critical) · Medium · pf:false
- lab-reference-ranges-provisional · verification/data/lab-reference-ranges.json · PARTIAL (dev-only; clinical sign-off needed) · High · pf:true
- fhir-r4-aucdi-conformance-unbuilt · mcp/servers/fhir-broker/ (structural validator built vs vendored AU Core 2.0.1-ci; binding/invariants + NCTS pending) · PARTIAL · Medium · pf:false
- aucdi-r3-valueset-binding-unbuilt · AUCDI R3 binding tables + verifier · UNBUILT · Medium · pf:false

## Low
- repo-digest-sealed-node-carveout · scripts/export-repo-digest.mjs · PARTIAL · Low · pf:false — digest deliberately embeds the reference case's sealed 10–13 for engineering (documented carve-out); MUST never enter an AI-Doctor context path; add digest-shaped default-deny fixture to the M3 allow-list test
- ~~claudemd-behind-charter · CLAUDE.md~~ · **resolved 2026-07-01** (server-status prose reconciled to register)
- ~~derived-docs-unverified · .claude/{schema-index,server-status}.md~~ · **resolved 2026-07-01** (schema-index verified; server-status pharmacology row fixed)

## Firewall status
- Scoring-store (data/cases/*/10..13_*) NOT breached in code (re-checked M3 2026-07-03): JS reads data/cases via scripts/ingest-case-bundles.mjs (field-scoped firewall, contract-tested), scripts/export-repo-digest.mjs (documented engineering carve-out — see repo-digest-sealed-node-carveout), scripts/build-case-transformation-kit.mjs (schemas only) and the case-ingest/context-allowlist tests (synthetic fixtures only) — none routes 10–13 content into any trunk/packet path. Since M3 the LIVE packet boundary enforces the same default-deny allow-list and THROWS on any sealed-node key (verification/context-allowlist.js). Re-check on any case-ingestion or context-injection change.
