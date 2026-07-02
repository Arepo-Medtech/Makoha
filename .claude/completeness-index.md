# Completeness Index (derived — read first per <context_loading>)

One line per open Completeness Register item: `id · path · state · risk · blocks_patient_facing`.
Source of truth: `docs/grounding/completeness-register.md` + the live scan. If this disagrees with the register, the register wins and this file is the defect.

Last synced: 2026-07-01 (doc reconciliation: closed `claudemd-behind-charter` + `derived-docs-unverified` — CLAUDE.md server-status prose + .claude/server-status.md pharmacology row now match the register; schema-index verified accurate). Prior 2026-06-30 full session: hashing, audit-ledger, verifier tests/hardening, pipeline gates, investigation parser, pharmacology + Trunk 8.0 firewall, knowledge server + datasets, fhir-broker + messaging-geo. All 7 MCP servers now built (mock); investigation parser has a mock fhir lab source. Remaining: live vendors/EHR + conformance, clinical sign-off on provisional datasets/ranges, Clinician Verification Portal, session persistence, terminology-contract (ICD-10-AM/LOINC/PBS).

## Critical
- pharmacology-server-unbuilt · mcp/servers/pharmacology/ · PARTIAL (mock core + Trunk 8.0 firewall wired; only live vendor pending) · Critical · pf:true
- investigation-parser-unbuilt · verification/investigation-parser.js · PARTIAL (engine built mock/dev; provisional ranges + no live source) · Critical · pf:true
- clinician-verification-portal-unbuilt · (no file) · UNBUILT · Critical · pf:true
- session-persistence-unenforced · (no file) · UNBUILT · Critical · pf:true

## High
- context-injection-allowlist · verification/pipeline.js (context-injection) · UNBUILT · High · pf:true — ingest enforces the sub-field firewall allow-list; the LIVE context-injection layer must apply the same before injecting 00/01/02 into a trunk
- terminology-contract-incomplete · terminology (SNOMED/ICD-10-AM/ICD-11/LOINC/PBS/AMT, mock; live NCTS + AU Core binding pending) · PARTIAL · High · pf:true
- knowledge-datasets-provisional · mcp/servers/knowledge/data/*.json · PARTIAL (dev seeded; clinical sign-off) · High · pf:true
- receipt-store-append-only-unbuilt · verification/audit-store.js · PARTIAL (mock-resolved; prod WORM+retention pending) · High · pf:true

## Medium
- knowledge-server-unbuilt · mcp/servers/knowledge/ · PARTIAL (mock built; live PostgreSQL graph store pending) · Medium · pf:false
- fhir-broker-unbuilt · mcp/servers/fhir-broker/ · PARTIAL (mock read/search + Observation→parser wired; live EHR + conformance pending) · Medium · pf:false
- messaging-geo-unbuilt · mcp/servers/messaging-geo/ · PARTIAL (mock; never-sends; live providers pending) · Medium · pf:false
- pipeline-routing-retrieval-stub · verification/pipeline.js · PARTIAL · Medium · pf:false
- case-set-underpopulated · data/cases/ (1 of ≥45; ingest tool built, 51 clinician-attested bundles ready to ingest) · PARTIAL · Medium · pf:false
- case-ingest-tool · scripts/ingest-case-bundles.mjs · COMPLETE (validate+split+hash+field-scoped firewall; contract-tested) · Low · pf:false
- content-store-production-gated · verification/audit-store.js persistContent · PARTIAL (synthetic-only until persistence Critical) · Medium · pf:false
- lab-reference-ranges-provisional · verification/data/lab-reference-ranges.json · PARTIAL (dev-only; clinical sign-off needed) · High · pf:true
- fhir-r4-aucdi-conformance-unbuilt · mcp/servers/fhir-broker/ (structural validator built vs vendored AU Core 2.0.1-ci; binding/invariants + NCTS pending) · PARTIAL · Medium · pf:false
- aucdi-r3-valueset-binding-unbuilt · AUCDI R3 binding tables + verifier · UNBUILT · Medium · pf:false

## Low
- _(none open)_
- ~~claudemd-behind-charter · CLAUDE.md~~ · **resolved 2026-07-01** (server-status prose reconciled to register)
- ~~derived-docs-unverified · .claude/{schema-index,server-status}.md~~ · **resolved 2026-07-01** (schema-index verified; server-status pharmacology row fixed)

## Firewall status
- Scoring-store (data/cases/*/10..13_*) NOT breached in code: no JS reads data/cases (case ingestion unbuilt). Re-check on any case-ingestion or context-injection change.
