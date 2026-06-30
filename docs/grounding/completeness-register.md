# Breath-Ezy Completeness Register

**Document ID:** `heydoc-grounding:completeness-register:2026-06`
**Version:** 1.0.0
**Generated:** 2026-06-30 (Phase 0 full scan)
**Scope:** entire tree excluding `node_modules/`, `.git/`. Read-only discovery per `<completeness_audit>`.

This is the exhaustive inventory of every artifact that is unbuilt, empty, partial, stubbed, dead-end, orphaned, missing a contract, or stale. It is a **superset** of `gap-register.md`; the gap-register stays authoritative for curated build order. High/Critical findings here promote one-way into the gap-register (see "Promotion" at end). Remediation of any item is normal plan-gated work — this register is not authorisation to write code.

**Method.** Tree enumeration with byte sizes; placeholder-marker grep (`TODO/FIXME/XXX/STUB/z.any()/.passthrough()/return {}/throw new Error('not`); schema-integrity reads; producer→consumer wiring from `mcpServers.template.json`, the pipeline, and `.claude/schema-index.md`; hashing/zod/firewall greps. Evidence is recorded per item, not inferred.

**Scan summary:** _(updated 2026-06-30)_ — **all 7 MCP servers now have a mock implementation**: `docs`/`identity-au`/`terminology` (stubs), and `pharmacology` (+ Trunk 8.0 firewall), `knowledge` (+ datasets), `fhir-broker` (+ Observation→parser), `messaging-geo` (never-sends) as mock cores. Remaining: live vendors/EHR + conformance, clinical sign-off on provisional datasets/ranges, Clinician Verification Portal, session persistence, terminology contract (ICD-10-AM/LOINC/PBS). _(Original Phase-0 line: 3 built / 4 unbuilt.)_ 9 trunk prompts + 9 stub agents + 9 cheat-sheets present. Verifier present; the hash/report path is now tested, the 5 checks themselves still untested (`verifier-untested`). ~~No code computes `candidate_output_hash`.~~ **Resolved 2026-06-30** — `candidate_output_hash` (SHA-256) computed in `verify()`, required in the report schema, gated by zod, and tested (`hashing-unimplemented` → COMPLETE). The VerificationReport edge is now zod-validated; GroundingPlan/ContextPacket/EvidenceNode edges remain ungated. Scoring-store firewall **not breached in code today** — no JS reads `data/cases` at all (case ingestion unbuilt).

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
  path: mcp/servers/pharmacology/{index.js,schemas.js,mock-data.json}, test/contract-pharmacology.js, mcp/mcpServers.template.json
  component_type: mcp-server
  state: PARTIAL
  evidence: MOCK CORE + FIREWALL WIRED 2026-06-30 — deterministic engine (engine.js, all 5 checks) shared by the MCP server and the in-process firewall; dose_guidance ONLY here and ONLY on PASS/WARN, never on HARD_FAIL/BLOCKED/paediatric; HARD_FAIL terminal; paediatric→flag, no dose; facts-absent→BLOCKED_NO_PROOF; receipt mode=mock. Wired behind Trunk 8.0 (verification/pipeline.js): firewall_status gates continuation, HARD_FAIL blocks continuation with NO override path and is receipt-backed (verifier check 5 distinguishes legitimate vs invented hard-stops); grounding-pass kept separate. Contract-tested (contract-pharmacology + contract-firewall). PARTIAL: live vendor only.
  blocks: (mock core + firewall cleared) — only live vendor connection remains
  safety_class: can_emit_fabrication
  invariant_exposure: no-autonomous-prescription (doses only here) + no-HARD_FAIL-override — both now enforced mechanically
  risk: Critical
  blocks_patient_facing: true
  build_action: REMAINING — connect live vendor (MIMS-AU/SafeScript) in staging (Appendix A Phase 4) with synthetic-case validation before any patient-facing use. Mock data must never reach patient-facing.
  gap_register_link: R-22
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: investigation-parser-unbuilt
  path: verification/investigation-parser.js, verification/data/lab-reference-ranges.json, verification/pipeline.js, verification/pipeline-schemas.js, test/contract-investigation-parser.js
  component_type: parser
  state: PARTIAL
  evidence: RESOLVED FOR MOCK/DEV 2026-06-30 — deterministic sanitiseInvestigation() maps (analyte/LOINC, numeric) → HL7 band + qualitative value with NO raw number; unknown/non-numeric fail safe to "U"; emits a dataset_version+checksum receipt; wired into contextInjection (runPipeline raw_investigations → sanitised facts); ContextPacket gate enforces sanitised_by + non-numeric value for lab_result. Tested (test/contract-investigation-parser.js). PARTIAL: reference ranges are provisional/dev (lab-reference-ranges-provisional) and there is no live lab source until fhir-broker.
  blocks: (engine cleared) — live use awaits authoritative ranges + fhir-broker
  safety_class: degrades_safe
  invariant_exposure: no-raw-lab-numbers-to-LLM-context — now enforced at parser source AND packet gate
  risk: Critical
  blocks_patient_facing: true
  build_action: DONE for mock/dev (engine met). A MOCK fhir-broker lab source is now wired (Trunk 6.0 Observations → parser). Before patient-facing: authoritative ranges sign-off (lab-reference-ranges-provisional) + a LIVE fhir-broker/EHR source.
  gap_register_link: R-21
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: lab-reference-ranges-provisional
  path: verification/data/lab-reference-ranges.json
  component_type: dataset
  state: PARTIAL
  evidence: OPENED 2026-06-30 — 8 analytes, adult sex-agnostic, explicitly DEV/SYNTHETIC-ONLY and NOT clinically authoritative. Banner in the dataset; sign-off not obtained.
  blocks: patient-facing use of the investigation parser
  safety_class: degrades_safe (marked non-authoritative; mock/dev only)
  invariant_exposure: clinical-safety (ranges must be clinically validated before live)
  risk: High
  blocks_patient_facing: true
  build_action: obtain clinical + regulatory sign-off on authoritative AU reference ranges (sex/age-specific); expand analyte coverage; version + checksum. Until then, parser is dev/synthetic-only.
  gap_register_link: R-21
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
  path: mcp/servers/knowledge/index.js, mcp/servers/knowledge/data/*.json, test/contract-knowledge.js, verification/{pipeline,retrieval-mcp}.js
  component_type: mcp-server
  state: PARTIAL
  evidence: MOCK BUILT 2026-06-30 — knowledge MCP (kg_query/kg_provenance real over the 3 curated datasets; ContextGraph/PatientKnowledgeGraph return empty-not-fabricated; kg_upsert/kg_export SAFE_STUB 'unavailable'). Wired into retrieval (needs_structured_kg → kg_query) + contextInjection (structured_dataset evidence). Contract-tested; trunk:stub:all 9/9 stub + MCP. Also gives ContextGraph/PatientKnowledgeGraph a (mock, empty) producer. PARTIAL: live graph store (PostgreSQL) not built.
  blocks: (mock cleared) — live PostgreSQL graph store remains
  safety_class: degrades_safe (BLOCKED_NO_PROOF / empty graphs)
  invariant_exposure: none (fail-safe holds)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING — live PostgreSQL graph store + the graph write path (kg_upsert/export) when a graph producer exists.
  gap_register_link: gap-knowledge-datasets
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: knowledge-datasets-empty
  path: mcp/servers/knowledge/data/{benign-registry,axis-b-templates,redflags-bank}.json
  component_type: dataset
  state: COMPLETE
  evidence: POPULATED (DEV) 2026-06-30 — three versioned, checksummed datasets seeded; served via kg_query as structured_dataset evidence. Content is DEV/SYNTHETIC-ONLY (see lab-reference-ranges-provisional sibling: knowledge-datasets-provisional).
  blocks: (cleared for mock) — Trunks 5.0/7.0/9.0 now receive curated dev content
  safety_class: degrades_safe
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE for dev. See knowledge-datasets-provisional for the sign-off gate before live.
  gap_register_link: gap-knowledge-datasets
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: knowledge-datasets-provisional
  path: mcp/servers/knowledge/data/*.json
  component_type: dataset
  state: PARTIAL
  evidence: OPENED 2026-06-30 — benign registry / Axis B templates / red-flag bank are DEV/SYNTHETIC-ONLY, not clinically authoritative (banners in each file). Sign-off not obtained.
  blocks: patient-facing use of Trunk 5.0/7.0/9.0 curated content
  safety_class: degrades_safe (marked non-authoritative; mock/dev only)
  invariant_exposure: clinical-safety (curated clinical content must be validated before live)
  risk: High
  blocks_patient_facing: true
  build_action: clinical + regulatory sign-off on authoritative content (benign criteria, must-not-miss differentials, red-flag tiers); expand coverage; version + checksum.
  gap_register_link: gap-knowledge-datasets
  status: open
  last_scanned: 2026-06-30
```

```md
- id: fhir-broker-unbuilt
  path: mcp/servers/fhir-broker/{index.js,mock-resources.json}, test/contract-fhir-broker.js, verification/{retrieval-mcp,pipeline}.js
  component_type: mcp-server
  state: PARTIAL
  evidence: MOCK BUILT 2026-06-30 — fhir_read/fhir_search return templated AU Core resources (incl. lab Observations); fhir_write SAFE_STUB. Wired: on the MCP path, Trunk 6.0 Observations flow through the investigation parser into sanitised lab_result facts (raw number never in the packet). Contract-tested. PARTIAL: live FHIR/SMART-on-FHIR/EHR + AU Core/AUCDI conformance validation (fhir-r4-aucdi-conformance-unbuilt) pending.
  blocks: (mock cleared) — live EHR + conformance validation remain
  safety_class: degrades_safe
  invariant_exposure: no-raw-lab-numbers (raw fhir values pass through the parser)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING — live FHIR R4 base URL + SMART-on-FHIR/mTLS + AU Core 0.3.0/AUCDI R3 conformance validator; patient consent for MHR.
  gap_register_link: gap-fhir-broker
  status: in-progress
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
  path: mcp/servers/messaging-geo/index.js, test/contract-messaging-geo.js
  component_type: mcp-server
  state: PARTIAL
  evidence: MOCK BUILT 2026-06-30 — geo_locate/pharmacy_search return mock results; msg_send is a SAFE_STUB that NEVER sends (mock_not_sent, recipient redacted/not echoed), flagged not-patient-facing. Contract-tested. NOT wired into the trunk pipeline (patient-facing, gated by the Clinician Verification Portal). PARTIAL: live MSG/GEO/pharmacy-directory providers pending.
  blocks: (mock cleared) — live providers + patient-facing gate remain
  safety_class: degrades_safe (never sends; not patient-facing)
  invariant_exposure: human-in-the-loop (no patient-facing send path)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING — live MSG_PROVIDER/GEO_PROVIDER/pharmacy directory; wire only behind the Clinician Verification Portal.
  gap_register_link: gap-messaging-geo
  status: in-progress
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
  state: COMPLETE
  evidence: RECLASSIFIED 2026-06-30 — NOT a true DEAD_END. The schema is contracted across the spec: grounding-plan.needs_structured_kg + live_call_specs (graph_kind="ContextGraph"), evidence-node kg_node supports (ref = ContextGraph node_id), and the knowledge server's kg.query (mcp/README, mcp-server-map). No JS produces it yet only because its producer — the knowledge server — is UNBUILT (same status as pharm-intent/pharm-check vs the pharmacology server). Wired when knowledge-server-unbuilt is built.
  blocks: nothing (contracted; awaits knowledge server producer)
  safety_class: none
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: produced/consumed when the knowledge server is built (kg.query graph_kind=ContextGraph); tracked under knowledge-server-unbuilt. No standalone action.
  gap_register_link: gap-knowledge-datasets
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: patient-knowledge-graph-orphan
  path: mcp/schemas/patient-knowledge-graph.schema.json
  component_type: schema
  state: COMPLETE
  evidence: RECLASSIFIED 2026-06-30 — NOT a true DEAD_END. Contracted across the spec: grounding-plan ("patient-baseline" PatientKnowledgeGraph pull), evidence-node kg_node supports, knowledge server kg.query (graph_kind="PatientKnowledgeGraph"), data-buckets. Producer is the UNBUILT knowledge server (+ identity boundary). Same awaiting-producer status as the pharm-* schemas.
  blocks: nothing (contracted; awaits knowledge server + identity boundary)
  safety_class: none
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: produced/consumed when the knowledge server + identity boundary are built; tracked under knowledge-server-unbuilt. No standalone action.
  gap_register_link: gap-knowledge-datasets
  status: resolved
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

- ~~`receipt-store-append-only-unbuilt`~~ **mock-resolved 2026-06-30** (R-17; production WORM + retention still to configure); `content-store-production-gated` (**Medium**, new — synthetic-only until persistence Critical); `session-persistence-unenforced` (**Critical**); ~~`context-graph-orphan` + `patient-knowledge-graph-orphan`~~ **reclassified 2026-06-30** (not dead-ends — contracted schemas awaiting the knowledge-server producer; tracked under `knowledge-server-unbuilt`); `claudemd-behind-charter` + `derived-docs-unverified` (**Low**).

---

## Promotion into gap-register (one-way)

Already represented in `gap-register.md`: pharmacology, verification portal, investigation parser, persistence, knowledge datasets, fhir-broker, messaging-geo, case-set.

**New High/Critical findings requiring promotion this cycle (pending):** `hashing-unimplemented` (Critical), `verifier-untested` (High), `verifier-weak-code-detection` (High), `receipt-store-append-only-unbuilt` (High). These are flagged `gap_register_link: pending-promotion` until mirrored, with the move noted in `CHANGELOG.md`.

*Source of truth: this register + the live scan. Derived quick-reference: `.claude/completeness-index.md`.*
