# Breath-Ezy Completeness Register

**Document ID:** `heydoc-grounding:completeness-register:2026-06`
**Version:** 1.0.0
**Generated:** 2026-06-30 (Phase 0 full scan)
**Scope:** entire tree excluding `node_modules/`, `.git/`. Read-only discovery per `<completeness_audit>`.

This is the exhaustive inventory of every artifact that is unbuilt, empty, partial, stubbed, dead-end, orphaned, missing a contract, or stale. It is a **superset** of `gap-register.md`; the gap-register stays authoritative for curated build order. High/Critical findings here promote one-way into the gap-register (see "Promotion" at end). Remediation of any item is normal plan-gated work — this register is not authorisation to write code.

**Method.** Tree enumeration with byte sizes; placeholder-marker grep (`TODO/FIXME/XXX/STUB/z.any()/.passthrough()/return {}/throw new Error('not`); schema-integrity reads; producer→consumer wiring from `mcpServers.template.json`, the pipeline, and `.claude/schema-index.md`; hashing/zod/firewall greps. Evidence is recorded per item, not inferred.

**Scan summary:** 3 MCP servers built (`docs`, `identity-au`, `terminology`); 4 unbuilt (`knowledge`, `fhir-broker`, `pharmacology`, `messaging-geo`). 9 trunk prompts + 9 stub agents + 9 cheat-sheets present. Verifier present; the hash/report path is now tested, the 5 checks themselves still untested (`verifier-untested`). ~~No code computes `candidate_output_hash`.~~ **Resolved 2026-06-30** — `candidate_output_hash` (SHA-256) computed in `verify()`, required in the report schema, gated by zod, and tested (`hashing-unimplemented` → COMPLETE). The VerificationReport edge is now zod-validated; GroundingPlan/ContextPacket/EvidenceNode edges remain ungated. Scoring-store firewall **not breached in code today** — no JS reads `data/cases` at all (case ingestion unbuilt).

---

## CRITICAL

```md
- id: hashing-unimplemented
  path: verification/{hash.js,verifier.js,report-schema.js,run.js}, integration/trunk-pipeline.js, mcp/schemas/verification-report.schema.json, test/contract-verification-report.js
  component_type: verifier
  state: COMPLETE
  evidence: RESOLVED 2026-06-30 — hashCandidateOutput() (node:crypto, exact UTF-8 bytes) computed first in verify(); candidate_output_hash written by both report writers and now REQUIRED in verification-report.schema.json; validateReport() (zod) gates every write; covered by test/contract-verification-report.js (known vector, determinism, end-to-end hash==output, gate rejects missing/malformed). npm test 4/4 green.
  blocks: (cleared)
  safety_class: none
  invariant_exposure: prime_directive hashing — now enforced mechanically
  risk: Critical
  blocks_patient_facing: true
  build_action: DONE — see evidence.
  gap_register_link: R-16
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: pharmacology-server-unbuilt
  path: mcp/servers/pharmacology/ (absent; template points at dist/index.js)
  component_type: mcp-server
  state: UNBUILT
  evidence: dir absent under mcp/servers/; mcpServers.template.json `pharmacology -> mcp/servers/pharmacology/dist/index.js` resolves to nothing.
  blocks: Trunk 8.0 firewall (real PharmCheck), every prescription-adjacent feature, patient-facing readiness
  safety_class: can_emit_fabrication
  invariant_exposure: no-autonomous-prescription; no-HARD_FAIL-override (HARD_FAIL currently runs on mock only)
  risk: Critical
  blocks_patient_facing: true
  build_action: build deterministic pharmacology server (Appendix A master plan); doses sourced ONLY here; HARD_FAIL terminal; paediatric → flag-for-in-person-review.
  gap_register_link: gap-pharmacology-vendor
  status: open
  last_scanned: 2026-06-30
```

```md
- id: investigation-parser-unbuilt
  path: (no file) — specified as deterministic-investigation-parser, consumed by Trunk 6.0 / fhir-broker
  component_type: parser
  state: UNBUILT
  evidence: grep `sanitis|investigation.parser|parseInvestigation` → only a comment in verifier.js; pipeline contextInjection always emits `facts: []`.
  blocks: Trunk 6.0 live data ingestion; safe injection of lab values; fhir-broker
  safety_class: degrades_safe (no live labs flow today — fhir-broker unbuilt)
  invariant_exposure: no-raw-lab-numbers-to-LLM-context
  risk: Critical
  blocks_patient_facing: true
  build_action: build deterministic parser that converts raw numerics → sanitised qualitative form + receipt ref before any ContextPacket injection; unit-test it; gate Trunk 6.0 on it.
  gap_register_link: gap-investigation-parser
  status: open
  last_scanned: 2026-06-30
```

```md
- id: clinician-verification-portal-unbuilt
  path: (no file) — clinician-verification-portal
  component_type: other
  state: UNBUILT
  evidence: absent from tree; listed Critical "Not started" in gap-register §1b.
  blocks: any output becoming patient-facing (required human-in-the-loop gate)
  safety_class: none
  invariant_exposure: prime_directive human-in-the-loop
  risk: Critical
  blocks_patient_facing: true
  build_action: build the verification portal as the mandatory checkpoint before any patient-facing path; out of current mock scope — plan separately.
  gap_register_link: gap-verification-portal
  status: open
  last_scanned: 2026-06-30
```

```md
- id: session-persistence-unenforced
  path: (no file) — session-bound persistence enforcement
  component_type: repository-store
  state: UNBUILT
  evidence: no persistence-boundary code; gap-register R-10 "not yet technically enforced".
  blocks: data-handling no-persistence-beyond-session; patient-facing readiness
  safety_class: none
  invariant_exposure: patient-data minimisation; no-persistence-without-consent
  risk: Critical
  blocks_patient_facing: true
  build_action: enforce session-bound persistence technically (encounter-scoped lifetime, no demographic persistence); plan separately.
  gap_register_link: gap-persistence
  status: open
  last_scanned: 2026-06-30
```

---

## HIGH

```md
- id: verifier-untested
  path: verification/verifier.js, verification/pipeline.js, test/contract-verifier.js
  component_type: test
  state: COMPLETE
  evidence: RESOLVED 2026-06-30 — test/contract-verifier.js covers all 5 checks (clean PASS + violation FAIL + receipt/citation flip), the candidate_output_hash return, overall-pass logic, and a runPipeline() integration (5 results). Wired into npm test (6/6) + CI.
  blocks: (cleared)
  safety_class: none
  invariant_exposure: all 5 verifier checks — now under test
  risk: High
  blocks_patient_facing: true
  build_action: DONE — see evidence. (Check coverage will be extended alongside verifier-weak-code-detection.)
  gap_register_link: R-18
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: verifier-weak-code-detection
  path: verification/{verifier.js,pipeline.js,retrieval-mcp.js}, test/contract-verifier.js
  component_type: verifier
  state: COMPLETE
  evidence: RESOLVED 2026-06-30 — CODE_PATTERNS now span SNOMED/ICD-10-AM/ICD-11/LOINC/PBS with false-positive guards; true per-code binding for SNOMED/ICD-10-AM/LOINC (each token must appear in a terminology receipt's validated_codes; ICD-11/PBS coarse, documented); mock-mode flagging (flag in mock, block in non-mock context). Fixed a pre-existing terminology-receipt upstream-naming bug on the MCP path. Covered by test/contract-verifier.js; trunk:stub:all 9/9 on stub + live MCP.
  blocks: (cleared)
  safety_class: degrades_safe (ungroundable codes now blocked)
  invariant_exposure: no-fabricated-codes — now bound per code
  risk: High
  blocks_patient_facing: true
  build_action: DONE — see evidence. Exact ICD-11/PBS token binding remains future work, bounded by terminology-contract-incomplete + aucdi-r3-valueset-binding-unbuilt.
  gap_register_link: R-19
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: terminology-contract-incomplete
  path: mcp/schemas/terminology-lookup.schema.json, mcp/servers/terminology/index.js
  component_type: schema
  state: PARTIAL
  evidence: OPENED 2026-06-30 — terminology `system` enum is ["SNOMED_CT","ICD_11"] only; the no-fabricated-codes invariant + standards_pins require SNOMED CT, ICD-10-AM, LOINC, PBS. So ICD-10-AM/LOINC/PBS codes cannot be grounded and are blocked by the hardened verifier (fail-safe). ICD-10-AM-vs-ICD_11 is also a pin divergence.
  blocks: grounding (and therefore emission) of ICD-10-AM, LOINC, PBS codes
  safety_class: degrades_safe (ungroundable codes blocked)
  invariant_exposure: no-fabricated-codes (3 of 4 mandated systems ungroundable)
  risk: High
  blocks_patient_facing: true
  build_action: extend terminology contract + server to ICD-10-AM (reconcile vs ICD_11), LOINC, PBS; then enable per-code binding for those systems. Feeds aucdi-r3-valueset-binding-unbuilt.
  gap_register_link: R-20
  status: open
  last_scanned: 2026-06-30
```

```md
- id: receipt-store-append-only-unbuilt
  path: verification/audit-store.js, verification/ledger-schema.js, mcp/schemas/audit-ledger-entry.schema.json, verification/rehash.js, test/contract-audit-store.js
  component_type: repository-store
  state: PARTIAL
  evidence: RESOLVED FOR MOCK 2026-06-30 — append-only, hash-chained medicolegal-audit-ledger built (.heydoc-data/audit-ledger.jsonl); both report writers append per run via recordRun(); receipt metadata + candidate_output_hash captured; verifyChain() tamper-evidence; verify:rehash re-verifies. PARTIAL because production durability (WORM substrate) + org retention policy (a regulatory_posture decision) are not yet configured.
  blocks: production-grade durable retention (mock/staging covered)
  safety_class: none
  invariant_exposure: auditability — now enforced for mock/staging
  risk: High
  blocks_patient_facing: true
  build_action: configure durable WORM substrate + retention policy for production (the local JSONL ledger covers mock/staging today).
  gap_register_link: R-17
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: content-store-production-gated
  path: verification/audit-store.js (persistContent / content store)
  component_type: repository-store
  state: PARTIAL
  evidence: OPENED 2026-06-30 — exact-output content store + verify:rehash --reissue are built but mechanically restricted to synthetic data (persistContent refuses non-synthetic; live entries forced content_persisted=false). Real-patient output persistence is deliberately deferred.
  blocks: batch rehash over real-patient outputs
  safety_class: degrades_safe (refuses non-synthetic)
  invariant_exposure: patient-data minimisation; no-persistence-beyond-session
  risk: Medium
  blocks_patient_facing: false
  build_action: enable governed (consented, encrypted, retention-bound) content persistence ONLY after session-persistence-unenforced (Critical) + consent are green; keep the synthetic-only guard until then.
  gap_register_link: none
  status: open
  last_scanned: 2026-06-30
```

---

## MEDIUM

```md
- id: knowledge-server-unbuilt
  path: mcp/servers/knowledge/ (absent; template → dist/index.js)
  component_type: mcp-server
  state: UNBUILT
  evidence: dir absent; template entry unresolved.
  blocks: benign registry (Trunk 7.0), Axis B templates (Trunk 5.0), red-flag bank (Trunk 9.0)
  safety_class: degrades_safe (BLOCKED_NO_PROOF)
  invariant_exposure: none (fail-safe holds)
  risk: Medium
  blocks_patient_facing: false
  build_action: build knowledge MCP (kg.query/upsert/provenance/export); seed curated datasets below.
  gap_register_link: gap-knowledge-datasets
  status: open
  last_scanned: 2026-06-30
```

```md
- id: knowledge-datasets-empty
  path: (no files) — benign registry, Axis B templates, red-flag question bank
  component_type: dataset
  state: EMPTY
  evidence: knowledge server unbuilt → backing datasets do not exist; gap-register §2 confirms unpopulated.
  blocks: Trunk 5.0/7.0/9.0 producing curated content (currently BLOCKED_NO_PROOF)
  safety_class: degrades_safe
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: populate with versioned, checksummed records + dataset_version receipts.
  gap_register_link: gap-knowledge-datasets
  status: open
  last_scanned: 2026-06-30
```

```md
- id: fhir-broker-unbuilt
  path: mcp/servers/fhir-broker/ (absent; template → dist/index.js)
  component_type: mcp-server
  state: UNBUILT
  evidence: dir absent; template unresolved.
  blocks: live FHIR resource pulls; Trunk 6.0 live investigations (with parser)
  safety_class: degrades_safe
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: build per AU Core 0.3.0 + AUCDI R3 (see fhir-r4-aucdi-conformance-unbuilt); connect last (build order step 6).
  gap_register_link: gap-fhir-broker
  status: open
  last_scanned: 2026-06-30
```

```md
- id: fhir-r4-aucdi-conformance-unbuilt
  path: mcp/servers/fhir-broker/ (conformance validator); standards: FHIR R4 4.0.1, AU Core 0.3.0, AUCDI R3
  component_type: mcp-server
  state: UNBUILT
  evidence: OPENED 2026-06-30 (operator request) — no deterministic FHIR R4 / AU Core / AUCDI R3 conformance validation exists; fhir-broker unbuilt. AUCDI R3 newly pinned (supplements AU Core 0.3.0).
  blocks: structured-output conformance grounding (trust boundary 3); receipt-backed conformance claims
  safety_class: degrades_safe (no conformance claim in absence)
  invariant_exposure: none directly (resource structure); supports auditability/grounding
  risk: Medium
  blocks_patient_facing: false
  build_action: build deterministic FHIR R4 + AU Core 0.3.0 + AUCDI R3 conformance validator in fhir-broker, emitting conformance receipts. Scope AFTER verifier-weak-code-detection (item 2). Confirm AUCDI re-target-vs-supplement (org decision) before pinning a single conformance target.
  gap_register_link: none
  status: open
  last_scanned: 2026-06-30
```

```md
- id: aucdi-r3-valueset-binding-unbuilt
  path: AUCDI R3 required-binding tables (dataset) + verifier/terminology integration
  component_type: dataset
  state: UNBUILT
  evidence: OPENED 2026-06-30 (operator request) — no AUCDI R3 required-binding tables (data element → value set / code system); item 2's code↔receipt binding is value-set-agnostic.
  blocks: per-element value-set enforcement (a coded element drawn from the AUCDI-mandated value set)
  safety_class: degrades_safe
  invariant_exposure: no-fabricated-codes (enrichment — codes from the correct value set)
  risk: Medium
  blocks_patient_facing: false
  build_action: curate AUCDI R3 required-binding tables; extend the hardened verifier binding to check element value-set membership. DEPENDS ON item 2 (code↔receipt binding) + terminology-contract-incomplete.
  gap_register_link: none
  status: open
  last_scanned: 2026-06-30
```

```md
- id: messaging-geo-unbuilt
  path: mcp/servers/messaging-geo/ (absent; template → dist/index.js)
  component_type: mcp-server
  state: UNBUILT
  evidence: dir absent; template unresolved.
  blocks: SMS/email + pharmacy geo features
  safety_class: degrades_safe
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: build last (build order step 6).
  gap_register_link: gap-messaging-geo
  status: open
  last_scanned: 2026-06-30
```

```md
- id: pipeline-edges-uncontracted
  path: verification/pipeline.js, verification/pipeline-schemas.js, verification/report-schema.js, test/contract-pipeline.js
  component_type: parser
  state: COMPLETE
  evidence: RESOLVED 2026-06-30 — all named pipeline edges now zod-gated: VerificationReport (report-schema.js), and GroundingPlan + ContextPacket + EvidenceNode + Receipt (pipeline-schemas.js, validateGroundingPlan/validateContextPacket enforced at the routing and context-injection boundaries). The stub contextInjection was reworked to emit a conformant packet (clean Receipts; citations moved to EvidenceNode supports). Covered by test/contract-pipeline.js; trunk:stub:all 9/9 stub + MCP.
  blocks: (cleared)
  safety_class: degrades_safe
  invariant_exposure: engineering_standards schema-first; trust boundary 1 — now enforced at all named edges
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE — see evidence. (When routing/retrieval logic is un-stubbed under pipeline-routing-retrieval-stub, the same validators continue to gate the real output.)
  gap_register_link: none
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: pipeline-routing-retrieval-stub
  path: verification/pipeline.js (routing, retrievalStub, contextInjection)
  component_type: parser
  state: PARTIAL
  evidence: routing() returns hardcoded needs; retrievalStub() returns fixed mock receipts; contextInjection() always facts:[]; constraints hardcoded.
  blocks: real routing decisions; real context assembly
  safety_class: degrades_safe (deterministic, never presents mock as live to a patient path)
  invariant_exposure: none (no patient path wired)
  risk: Medium
  blocks_patient_facing: false
  build_action: replace stubs with real routing + receipt-driven context assembly once servers/datasets exist; keep mock mode deterministic.
  gap_register_link: pending-promotion
  status: open
  last_scanned: 2026-06-30
```

```md
- id: case-set-underpopulated
  path: data/cases/ (only SPEC-CARD-04-00001)
  component_type: dataset
  state: PARTIAL
  evidence: 1 case present; evaluation framework requires ≥45 (60/30/10) before the eval gate can run as a blocking CI job.
  blocks: synthetic-case evaluation release gate
  safety_class: none
  invariant_exposure: test_and_evaluation_gates
  risk: Medium
  blocks_patient_facing: false
  build_action: expand toward 45-case minimum; then wire eval as blocking CI.
  gap_register_link: gap-case-set
  status: open
  last_scanned: 2026-06-30
```

```md
- id: context-graph-orphan
  path: mcp/schemas/context-graph.schema.json
  component_type: schema
  state: DEAD_END
  evidence: well-formed schema; referenced by 0 JS files; no producer writes a ContextGraph, no consumer reads one.
  blocks: nothing (unwired)
  safety_class: none
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: wire to the session-graph writer (Trunk 3.0/6.0/verifier per its `writers` field) under an approved plan, or remove if superseded by ContextPacket.
  gap_register_link: none
  status: open
  last_scanned: 2026-06-30
```

```md
- id: patient-knowledge-graph-orphan
  path: mcp/schemas/patient-knowledge-graph.schema.json
  component_type: schema
  state: DEAD_END
  evidence: well-formed schema; referenced by 0 JS files; no producer/consumer (knowledge + identity boundary unbuilt).
  blocks: nothing (unwired)
  safety_class: none
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: wire to knowledge server + identity boundary when built, or remove; decide under plan.
  gap_register_link: none
  status: open
  last_scanned: 2026-06-30
```

---

## LOW

```md
- id: claudemd-behind-charter
  path: CLAUDE.md (repo root)
  component_type: derived-doc
  state: STALE
  evidence: on-disk CLAUDE.md lacks the <completeness_audit> section, Phase 0, register context-loading, and Plan/Execute split present in the operator's current charter.
  blocks: next-agent fidelity to the governing prompt
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: persist the operator-approved charter to CLAUDE.md (operator decision — do not self-edit without confirmation).
  gap_register_link: none
  status: open
  last_scanned: 2026-06-30
```

```md
- id: derived-docs-unverified
  path: .claude/schema-index.md, .claude/server-status.md
  component_type: derived-doc
  state: STALE
  evidence: not re-validated against current sources this scan; schema-index lists no completeness-index yet; .claude/completeness-index.md created this phase.
  blocks: trust in derived quick-references
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: reconcile schema-index + server-status against sources; add completeness-index reference (done this phase).
  gap_register_link: none
  status: open
  last_scanned: 2026-06-30
```

---

## Build checklist (recommended order)

Safety-critical, no external dependency — **do first** (pure code, unblocks audit integrity):

1. ~~`hashing-unimplemented` — implement `candidate_output_hash` (SHA-256) + make it required in the report schema + test.~~ **DONE 2026-06-30** (R-16).
2. `verifier-untested` — unit-test the 5 checks + pipeline integration test. **High.**
3. `verifier-weak-code-detection` — ICD-10-AM/LOINC/PBS coverage + code↔receipt binding. **High.**
4. `pipeline-edges-uncontracted` — add zod gates mirroring the JSON schemas. **Medium.**

Then the curated build order (gap-register Part D.11):

5. `pharmacology-server-unbuilt` (+ Trunk 8.0 firewall wiring). **Critical.**
6. `investigation-parser-unbuilt`. **Critical.**
7. `knowledge-server-unbuilt` + `knowledge-datasets-empty`. **Medium.**
8. `clinician-verification-portal-unbuilt`. **Critical (named release blocker).**
9. `case-set-underpopulated` → 45 cases, wire eval as blocking CI. **Medium.**
10. `fhir-broker-unbuilt`, `messaging-geo-unbuilt`. **Medium.**

Cross-cutting / decide under plan:

- ~~`receipt-store-append-only-unbuilt`~~ **mock-resolved 2026-06-30** (R-17; production WORM + retention still to configure); `content-store-production-gated` (**Medium**, new — synthetic-only until persistence Critical); `session-persistence-unenforced` (**Critical**), `context-graph-orphan` + `patient-knowledge-graph-orphan` (wire or remove), `claudemd-behind-charter` + `derived-docs-unverified` (**Low**).

---

## Promotion into gap-register (one-way)

Already represented in `gap-register.md`: pharmacology, verification portal, investigation parser, persistence, knowledge datasets, fhir-broker, messaging-geo, case-set.

**New High/Critical findings requiring promotion this cycle (pending):** `hashing-unimplemented` (Critical), `verifier-untested` (High), `verifier-weak-code-detection` (High), `receipt-store-append-only-unbuilt` (High). These are flagged `gap_register_link: pending-promotion` until mirrored, with the move noted in `CHANGELOG.md`.

*Source of truth: this register + the live scan. Derived quick-reference: `.claude/completeness-index.md`.*
