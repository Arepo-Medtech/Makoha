# Completeness Index (derived — read first per <context_loading>)

One line per open Completeness Register item: `id · path · state · risk · blocks_patient_facing`.
Source of truth: `docs/grounding/completeness-register.md` + the live scan. If this disagrees with the register, the register wins and this file is the defect.

Last synced: 2026-06-30 (Phase 0 + hashing, audit-ledger, verifier tests, verifier hardening). Resolved: hashing-unimplemented, verifier-untested, verifier-weak-code-detection. Opened: content-store-production-gated, terminology-contract-incomplete, FHIR/AUCDI items. receipt-store mock-resolved.

## Critical
- pharmacology-server-unbuilt · mcp/servers/pharmacology/ · UNBUILT · Critical · pf:true
- investigation-parser-unbuilt · (no file) Trunk 6.0 sanitiser · UNBUILT · Critical · pf:true
- clinician-verification-portal-unbuilt · (no file) · UNBUILT · Critical · pf:true
- session-persistence-unenforced · (no file) · UNBUILT · Critical · pf:true

## High
- terminology-contract-incomplete · terminology schema/server (SNOMED+ICD_11 only) · PARTIAL · High · pf:true
- receipt-store-append-only-unbuilt · verification/audit-store.js · PARTIAL (mock-resolved; prod WORM+retention pending) · High · pf:true

## Medium
- knowledge-server-unbuilt · mcp/servers/knowledge/ · UNBUILT · Medium · pf:false
- knowledge-datasets-empty · benign registry / Axis B / red-flag bank · EMPTY · Medium · pf:false
- fhir-broker-unbuilt · mcp/servers/fhir-broker/ · UNBUILT · Medium · pf:false
- messaging-geo-unbuilt · mcp/servers/messaging-geo/ · UNBUILT · Medium · pf:false
- pipeline-routing-retrieval-stub · verification/pipeline.js · PARTIAL · Medium · pf:false
- case-set-underpopulated · data/cases/ (1 of ≥45) · PARTIAL · Medium · pf:false
- content-store-production-gated · verification/audit-store.js persistContent · PARTIAL (synthetic-only until persistence Critical) · Medium · pf:false
- fhir-r4-aucdi-conformance-unbuilt · mcp/servers/fhir-broker/ (FHIR R4 / AU Core / AUCDI R3) · UNBUILT · Medium · pf:false
- aucdi-r3-valueset-binding-unbuilt · AUCDI R3 binding tables + verifier · UNBUILT · Medium · pf:false
- context-graph-orphan · mcp/schemas/context-graph.schema.json · DEAD_END · Medium · pf:false
- patient-knowledge-graph-orphan · mcp/schemas/patient-knowledge-graph.schema.json · DEAD_END · Medium · pf:false

## Low
- claudemd-behind-charter · CLAUDE.md · STALE · Low · pf:false
- derived-docs-unverified · .claude/{schema-index,server-status}.md · STALE · Low · pf:false

## Firewall status
- Scoring-store (data/cases/*/10..13_*) NOT breached in code: no JS reads data/cases (case ingestion unbuilt). Re-check on any case-ingestion or context-injection change.
