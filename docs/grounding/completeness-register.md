# Breath-Ezy Completeness Register

**Document ID:** `heydoc-grounding:completeness-register:2026-06`
**Version:** 1.0.0
**Generated:** 2026-06-30 (Phase 0 full scan)
**Scope:** entire tree excluding `node_modules/`, `.git/`. Read-only discovery per `<completeness_audit>`.

This is the exhaustive inventory of every artifact that is unbuilt, empty, partial, stubbed, dead-end, orphaned, missing a contract, or stale. It is a **superset** of `gap-register.md`; the gap-register stays authoritative for curated build order. High/Critical findings here promote one-way into the gap-register (see "Promotion" at end). Remediation of any item is normal plan-gated work — this register is not authorisation to write code.

**Method.** Tree enumeration with byte sizes; placeholder-marker grep (`TODO/FIXME/XXX/STUB/z.any()/.passthrough()/return {}/throw new Error('not`); schema-integrity reads; producer→consumer wiring from `mcpServers.template.json`, the pipeline, and `.claude/schema-index.md`; hashing/zod/firewall greps. Evidence is recorded per item, not inferred.

**Scan summary:** _(updated 2026-06-30)_ — **all 7 MCP servers now have a mock implementation**: `docs`/`identity-au`/`terminology` (stubs), and `pharmacology` (+ Trunk 8.0 firewall), `knowledge` (+ datasets), `fhir-broker` (+ Observation→parser), `messaging-geo` (never-sends) as mock cores. Remaining: live vendors/EHR + conformance, clinical sign-off on provisional datasets/ranges, Clinician Verification Portal, session persistence, terminology contract (ICD-10-AM/LOINC/PBS). _(Original Phase-0 line: 3 built / 4 unbuilt.)_ 9 trunk prompts + 9 stub agents + 9 cheat-sheets present. Verifier present; the hash/report path is now tested, the 5 checks themselves still untested (`verifier-untested`). ~~No code computes `candidate_output_hash`.~~ **Resolved 2026-06-30** — `candidate_output_hash` (SHA-256) computed in `verify()`, required in the report schema, gated by zod, and tested (`hashing-unimplemented` → COMPLETE). The VerificationReport edge is now zod-validated; GroundingPlan/ContextPacket/EvidenceNode edges remain ungated. Scoring-store firewall **not breached in code today** — no JS reads `data/cases` at all (case ingestion unbuilt).

**M0 scoped re-scan** _(2026-07-03, ARCH_PLAN milestone M0)_ — Case set is now **52 cases** (47 difficulty-01 / 5 difficulty-04 incl. reference `SPEC-CARD-04-00001`; 51 clinician-attested AUC bundles, bulk attestation reviewer KL 2026-07-02) — `case-set-underpopulated` row updated (C18/F15 closed). New findings registered: `routing-plan-next-trunks-dead-end` (DEAD_END-1, High), `mode-leakage-enforcelive` (C16/F4, High), `context-injection-allowlist` (recorded in-register — previously index-only — High), `case-dir-duplicate-files` (Medium), `repo-digest-sealed-node-carveout` (Low). Firewall line superseded: JS now reads `data/cases` via `scripts/ingest-case-bundles.mjs` (field-scoped firewall, contract-tested), `scripts/export-repo-digest.mjs` (documented engineering carve-out), `scripts/build-case-transformation-kit.mjs` (schemas only) and `test/contract-case-ingest.js` — **none routes `10`–`13` content into any trunk/packet path; firewall NOT breached.**

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
  path: portal/verification-gate.js + mcp/schemas/verification-portal-decision.schema.json (gate + contract built); UI/workflow absent
  component_type: other
  state: PARTIAL
  evidence: GATE BUILT 2026-07-03 (M5) — the server-side HITL release gate and its contract exist: VerificationGateRecord (JSON Schema + zod mirror, lockstep-tested) binds a clinician decision (approved/rejected/amended, clinician_id, decided_at_utc, signature_ref) to the EXACT candidate_output_hash; releaseToPatient() is fail-closed — refuses without a gate record, refuses 'rejected', releases ONLY text that re-hashes to the attested hash (approved→candidate hash; amended→amended_output_hash — the amendment is its own medicolegal artifact), and refuses ANY release in mock/dry_run (mode-normaliser guard). Latest decision wins (re-review); records append, never mutate. Contract-tested (test/contract-verification-gate.js, npm test + CI). messaging-geo remains UNWIRED (M13). REMAINING for COMPLETE: clinician review UI/workflow, authenticated clinician identity + signature capture, durable (WORM) gate-record storage (M8 substrate) — the portal is NOT done; the release-blocking checkpoint contract is.
  blocks: patient-facing readiness (UI/workflow + durable storage still open; the mechanical gate now exists for every future patient path to call)
  safety_class: degrades_safe (fail-closed; dev modes never release)
  invariant_exposure: prime_directive human-in-the-loop — now mechanically enforceable at the release boundary
  risk: Critical
  blocks_patient_facing: true
  build_action: build the clinician review UI/workflow + authenticated identity/signature capture on top of the gate contract; move gate records to the M8 WORM substrate. Every patient-facing path MUST call releaseToPatient() (adoption rule, portal/README.md).
  gap_register_link: gap-verification-portal
  status: open (gate resolved; UI/workflow + durable storage remain)
  last_scanned: 2026-07-03
```

```md
- id: session-persistence-unenforced
  path: verification/session-store.js (enforcement built)
  component_type: repository-store
  state: COMPLETE
  evidence: RESOLVED 2026-07-03 (M4, enforcement) — verification/session-store.js built: MEMORY-ONLY working-state store (no disk path, no serialisation API — contract test asserts no persistence-shaped export and an untouched data dir); encounter-scoped lifetime (openEncounter → putWorkingState/getWorkingState → closeEncounter DESTROYS all state; closed refs never reopen; reads/writes after close throw; no implicit state creation); mechanical demographic guard per Trust Boundary 4 (demographic-looking keys anywhere in a value, and IHI-shaped values, are REFUSED with a thrown error — conservative over-blocking; identity data stays inside identity-au). The medicolegal ledger is documented exempt (append-only, PHI-free by .strict()). Tested by test/contract-session-store.js (npm test + CI). ADOPTION CONTRACT documented in-module: any future stateful session path MUST hold working state here — holding it elsewhere reintroduces this gap (re-check at every session-flow change). No production session flow exists yet to wire (trunk runs are stateless); the store is the gate artifact, current consumer = contract test.
  blocks: (cleared — enforcement) 
  safety_class: degrades_safe (refuses demographics; destroys on close)
  invariant_exposure: closed at the enforcement layer — no-persistence-beyond-session is now mechanical, not policy
  risk: Critical
  blocks_patient_facing: true
  build_action: DONE (enforcement). Remaining, tracked separately: real-patient content persistence stays gated on consent + content-store-production-gated; adoption re-checked whenever a stateful session flow is built (portal/M5 onward).
  gap_register_link: gap-persistence (R-10)
  status: resolved
  last_scanned: 2026-07-03
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
  path: mcp/schemas/terminology-lookup.schema.json, mcp/servers/terminology/{index.js,terminology-servers.json}, verification/{verifier,retrieval-mcp}.js, data/digital_tablet_omnibus.json
  component_type: schema
  state: PARTIAL
  evidence: MOCK MULTI-SYSTEM BUILT 2026-06-30 — terminology `system` enum now SNOMED_CT/ICD_10_AM/ICD_11/LOINC/PBS/AMT (the Digital Tablet's systems); server grounds each (mock, echoes looked-up codes); terminology-servers.json records the live NCTS/Ontoserver endpoints (from the Digital Tablet) used ONLY in live mode. Verifier now binds SNOMED/AMT/ICD-10-AM/LOINC/PBS per-code (ICD-11 stays coarse). retrieveTerminology grounds multiple systems; end-to-end ICD-10-AM binding verified on the MCP path. Contract-tested.
  blocks: (mock cleared) — live NCTS + AU Core value-set binding remain
  safety_class: degrades_safe
  invariant_exposure: no-fabricated-codes — all 4 mandated systems now groundable + bound (mock)
  risk: High
  blocks_patient_facing: true
  build_action: REMAINING (input-gated) — live NCTS/Ontoserver connection (NCTS licence) + AU Core value-set binding (fhir-r4-aucdi-conformance-unbuilt / aucdi-r3-valueset-binding-unbuilt); no live PBS API; AMT subset not validated.
  gap_register_link: R-20
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: digital-tablet-omnibus
  path: data/digital_tablet_omnibus.json
  component_type: dataset
  state: COMPLETE
  evidence: IMPORTED 2026-06-30 — the "Digital Tablet" AU Core R4 schema capsule (previously referenced by evidence-node/context-packet schemas but ABSENT). Declares the code systems (SNOMED CT-AU 20240301, ICD-10-AM 12th, LOINC 2.77, PBS, AMT), AU Core conformance profiles, and terminology_servers (NCTS Ontoserver). No secrets (public reference URLs). Resolves the dangling fhir_path reference.
  blocks: (was) terminology grounding design + fhir_path reference resolution
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — imported. Its terminology_servers + AU Core structure feed the (input-gated) live-terminology + AU Core value-set-binding work.
  gap_register_link: none
  status: resolved
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
  build_action: enable governed (consented, encrypted, retention-bound) content persistence ONLY after session-persistence-unenforced (Critical) + consent are green; keep the synthetic-only guard until then. Milestone link: gated on ARCH_PLAN C8/M4 (session-store enforcement) + consent — not independently schedulable.
  gap_register_link: none
  status: open
  last_scanned: 2026-07-03
```

```md
- id: routing-plan-next-trunks-dead-end
  path: integration/trunk-sequencer.js (consumer built) ← trunk 1.0 routing_plan.next_trunks
  component_type: other (pipeline orchestration edge)
  state: COMPLETE
  evidence: RESOLVED 2026-07-03 (M2) — integration/trunk-sequencer.js built: consumes the PARSED Trunk 1.0 routing_plan.next_trunks (zod-gated; a malformed plan throws and never part-runs) and walks each routed trunk through the full five-step pipeline via runTrunkWithGrounding. Halts UNCONDITIONALLY on: (1) Trunk 1.0 safety_gate escalate_now/T5 BEFORE any routed trunk runs; (2) continuation_blocked — HARD_FAIL/BLOCKED_NO_PROOF now propagate ACROSS trunks with no override path (F2 closed); (3) escalate_now/T5 in any trunk output (conservative over-halt detection — over-triage-safe); (4) verification pass=false (a rejected output never grounds the next trunk). Ordered execution record per ARCH_PLAN §3.5.5. Gated behind HEYDOC_SEQUENCER (DEFAULT OFF = rollback; off runs nothing); re-exported from trunk-pipeline.js as the single integration surface. Tested end-to-end by test/contract-sequencer.js (in npm test + CI). RESIDUAL (by design): flag defaults off until an operator turns it on; manual multi-trunk chaining outside the sequencer must still honour continuation_blocked (documented in trunk-pipeline.js).
  blocks: (cleared)
  safety_class: none — halt logic is unconditional; escalation detection over-halts on ambiguity
  invariant_exposure: closed — no-HARD_FAIL-override now holds across the whole sequence, not just within one trunk
  risk: High
  blocks_patient_facing: true
  build_action: DONE — see evidence.
  gap_register_link: R-24
  status: resolved
  last_scanned: 2026-07-03
```

```md
- id: mode-leakage-enforcelive
  path: verification/mode.js (normaliser), verification/{verifier.js,pipeline.js,audit-store.js} (wired seams)
  component_type: verifier
  state: COMPLETE
  evidence: RESOLVED 2026-07-03 (M1) — verification/mode.js built: env(mock/dry_run/staging/production/live)→enforcement(mock/dry_run/live); staging/production→live⇒mock proof BLOCKED; UNKNOWN mode default-denies to live; absence keeps the documented dev default (mock). Wired into all three consumers of the seam: pipeline.js context_mode derivation, verifier.js enforceLive, and audit-store.js recordRun (staging is no longer classified synthetic — content NOT persisted, content_persisted=false, ledger mode enum-valid; this second F4 site was found during M1 research and fixed in the same step). Tested end-to-end by test/contract-mode-normaliser.js (mapping, default-deny, verifier blocking/flagging, pipeline packet mode, ledger classification) — wired into npm test + CI. RESIDUAL (tracked, not a defect here): MCP servers stamp receipt.mode from their own HEYDOC_MODE_DEFAULT read and only ever run mock today; server-side mode stamping is normalised at live-connect (M9/M11).
  blocks: (cleared)
  safety_class: none — enforcement is now monotone-stricter (staging/production/unknown block; mock/dry_run unchanged)
  invariant_exposure: closed — mock proof can no longer stand as grounding evidence on a non-dev path
  risk: High
  blocks_patient_facing: true
  build_action: DONE — see evidence.
  gap_register_link: R-25
  status: resolved
  last_scanned: 2026-07-03
```

```md
- id: context-injection-allowlist
  path: verification/context-allowlist.js (built), enforced in verification/pipeline.js contextInjection()
  component_type: sanitiser
  state: COMPLETE
  evidence: RESOLVED 2026-07-03 (M3) — verification/context-allowlist.js mirrors the cases:ingest field-scoped firewall at the packet boundary, DEFAULT-DENY. 01 allows only demographics/opening_complaint/history_as_reported (→ packet facts, category-mapped); 02 allows only the dialogue text sub-fields (classified exchange-channel and NEVER converted to packet facts — simulator material is not packet material); 00, psychosocial_profile, digital_tablet_field_map, unknown nodes/fields, and 02 scoring/gate sub-fields all reject. A sealed scoring node (10_–13_) ANYWHERE in the input THROWS ("SCORING-STORE FIREWALL") and halts packet assembly — never a silent drop. Enforced in contextInjection() via the new case_content path; end-to-end tested through the ContextPacket zod gate (test/contract-context-allowlist.js, in npm test + CI; all fixtures synthetic, no case file read). Firewall re-check at M3 close: only the known engineering set references sealed nodes; NOT breached. QUARANTINE (see objective-data-offered-sanitiser-policy): objective_data_offered rejects with a named pending-policy reason until the operator confirms the patient-reported-vitals sanitiser policy.
  blocks: (cleared)
  safety_class: none — default-deny; sealed content is a hard stop
  invariant_exposure: closed — the live boundary now mirrors the ingest guard
  risk: High
  blocks_patient_facing: true
  build_action: DONE — see evidence.
  gap_register_link: R-26
  status: resolved
  last_scanned: 2026-07-03
```

```md
- id: objective-data-offered-sanitiser-policy
  path: verification/context-allowlist.js (quarantine rule on 01.objective_data_offered)
  component_type: sanitiser
  state: PARTIAL
  evidence: OPENED 2026-07-03 (M3) — CLAUDE.md <data_handling> flags an open follow-up: confirm the sanitiser policy for patient-reported vitals before the live pipeline injects objective_data_offered into trunk context. M3 built that injection path, so the field is QUARANTINED (rejected with a reason naming this item) rather than shipped unconfirmed. Values are schema-stored as strings (no structured raw number), but a leading-numeric patient-reported reading (e.g. "160 over 95") would enter LLM context under a non-lab category the packet gate does not guard — policy decision needed: pass as-is (telehealth carve-out), band via the investigation parser, or keep withheld.
  blocks: patient-reported home/wearable observations reaching trunk context
  safety_class: degrades_safe (withheld until confirmed)
  invariant_exposure: none while quarantined; no-raw-lab-numbers adjacency is the question to settle
  risk: Medium
  blocks_patient_facing: true
  build_action: operator + clinical confirmation of the sanitiser policy; then flip the quarantine rule (one line) + extend contract-context-allowlist.js for the chosen treatment. Input-gated — not schedulable as pure engineering.
  gap_register_link: none (Medium — below promotion threshold; charter follow-up now register-tracked)
  status: open
  last_scanned: 2026-07-03
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
  path: mcp/servers/fhir-broker/{conformance.js,index.js,au-core/}, test/contract-fhir-conformance.js
  component_type: mcp-server
  state: PARTIAL
  evidence: STRUCTURAL VALIDATOR BUILT 2026-06-30 — fhir_validate tool validates a resource against VENDORED AU Core SD snapshots (au-core/, 2.0.1-ci-build, FHIR 4.0.1, checksummed manifest): profile/type match, required (min≥1), cardinality, fixed system; ValueSet MEMBERSHIP + full FHIRPath invariants reported not_evaluated (need live NCTS). Deterministic, offline, no new runtime dep. Contract-tested (5 SDs: Patient/Condition/MedicationRequest/AllergyIntolerance/DiagnosticResult). VERSION NOTE: vendored the CI build per operator decision — diverges from the AU Core 0.3.0 pin (an org/regulatory conformance-target decision).
  blocks: (structural cleared) — ValueSet-binding validation (aucdi-r3-valueset-binding, needs live NCTS) + full StructureDefinition/invariant validation remain
  safety_class: degrades_safe
  invariant_exposure: none directly (resource structure)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — live NCTS/Ontoserver ValueSet expansion for binding validation; full FHIRPath-invariant/slicing validation (heavier); confirm the AU Core version target (0.3.0 vs current) as an org decision; refresh the vendored snapshot deliberately.
  gap_register_link: none
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: au-core-sd-snapshot
  path: mcp/servers/fhir-broker/au-core/ (5 vendored StructureDefinitions + manifest.json)
  component_type: dataset
  state: COMPLETE
  evidence: VENDORED 2026-06-30 — pinned AU Core SD snapshot (2.0.1-ci-build) with a checksummed manifest (source URL, fetch date). CI build (not a stable release) — refresh deliberately.
  blocks: (was) offline conformance validation
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — vendored. Refresh on IG updates; reconcile version target (0.3.0 vs current) per org decision.
  gap_register_link: none
  status: resolved
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
  build_action: replace stubs with real routing + receipt-driven context assembly once servers/datasets exist; keep mock mode deterministic. Milestone link: ARCH_PLAN C10 — input-gated at live-connect under M11 (contracts/zod gates unchanged; stub remains the rollback).
  gap_register_link: none (Medium — below promotion threshold; stale pending-promotion tag corrected M0 2026-07-03)
  status: open
  last_scanned: 2026-07-03
```

```md
- id: case-set-underpopulated
  path: data/cases/ (52 case directories; 51 manifest-conforming + reference)
  component_type: dataset
  state: PARTIAL
  evidence: M6 2026-07-03 — receipts + gate DONE; atypical top-up INGESTED (pending attestation); complex + attestation remain. (1) **All 336 candidate codes across the 101 manifest-bearing cases receipted** via `cases:verify-codes` (per-code receipt; status unverified_pending_terminology_receipt → **mock_verified_pending_live_ncts**; honest — mock echoes bind, live NCTS revalidates at M11/F5; mode:"mock" blocks them as proof in any live context; idempotent). (2) **Deterministic eval gate CI-BLOCKING** (`eval:cases`): ≥45 attested conforming (51 PASS); per-file sha256 integrity (re-asserts ingest schema+firewall without parsing sealed nodes); 00/01/02 schema-valid; all codes receipted; attestation required to count. (3) **ATYPICAL TOP-UP INGESTED 2026-07-03** — 50 new AMS (Autoimmune Mild Severity) casebundles ingested from operator-supplied source (`.../Autoimmune Mild Severity/.../AMS Ingest Cases`): 1 tier-02 + 37 tier-03 + 12 tier-04, new specialties RHEUM/HAEMAT, all firewall+schema clean (OK_DRY_RUN 50/50, 0 collisions). Distribution moved **88/12/0 → 45/55/0**; difficulty-tier coverage 2 → **4 tiers** (minimum 3 CLEARED); specialties 17 → 19. The 50 were ATTESTED 2026-07-04 (operator KL, written in-session; bulk_clinician_attestation in each manifest review block — node files + sha256 untouched). (4) **CVD (Cardiovascular) batch ingested 2026-07-04** — 49 of 50 operator-supplied CVD bundles (1 skipped: id collision, see `case-id-cross-series-collision`): brings the first COMPLEX-tier cases (5 × rare_condition, tier 05) and the 3rd diagnosis category (`zebra_rare`). 373 codes receipted (store total 709). Distribution now **68 straightforward / 77 atypical / 5 complex = 45/51/3**; **coverage 5 tiers · 3 diagnosis categories · 19 specialties — the 3-category + 3-tier minimums CLEARED**. The 49 CVD + the re-id'd AFib case (SPEC-CARD-01-00099) were ATTESTED 2026-07-04 (operator KL) → 151/151 attested. (5) **CIA (Common Infections & Afflictions) batch 2026-07-04** — 43 of 50 operator-supplied CIA bundles ingested (all straightforward/tier-01; 47 common + 3 important_not_to_miss categories); 190 codes receipted (store total **911**). 7 NOT ingested: **3 cross-series id collisions** (Burn/Laryngitis/Aphthous-Stomatitis vs existing AUC cases — see `case-id-cross-series-collision`) and **4 FIREWALL-REFUSED** (full diagnosis name leaked into AI-Doctor-readable text — see `cia-source-firewall-leaks`). Distribution **45/51/3 → 58/40/3** (194 cases; straightforward toward 60%, atypical over-weight pulled toward 30%; complex still 3%). The 43 CIA were ATTESTED 2026-07-04 (operator KL). (6) **4 firewall-remediated CIA bundles ingested 2026-07-04** (the previously-refused DERM-01-00036/EMG-01-00037/GI-01-00027/MH-01-00044 — operator removed the diagnosis name from injectable fields; see `cia-source-firewall-leaks` → resolved); 16 codes receipted (store total **927**). 198 cases now, and the 4 remediated CIA were ATTESTED 2026-07-04 (operator KL). (7) **3 re-id'd CIA collision cases ingested 2026-07-04** (the DERM/RESP/GI collisions → -00099 per bucket; see `case-id-cross-series-collision` — all 4 instances now resolved); 13 codes receipted (store total **940**); 201 cases. Distribution 59/39/3 → **59/38/2** (3 more straightforward dilute complex). The 3 are pending_clinician_review. **eval:cases: attested 198 (≥45), 0 failures, PASS.** Source `.txt` never entered the repo.
  blocks: full 60/30/10 mix (complex only 2% vs 10% — the binding distribution gap)
  safety_class: none
  invariant_exposure: test_and_evaluation_gates
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated): (a) attest the 3 re-id'd CIA collision cases; (b) more COMPLEX cases (tiers 05/06/07) to reach ~10% (5 present = 2%). Flip the distribution warning to blocking once complex reaches ~10%. (Receipts, CI gate, coverage minimums, firewall-remediation, attestation of the 198, AND all 4 id-collision instances: DONE.)
  gap_register_link: R-23
  status: open (201 cases, 198 attested; 3 re-id'd-CIA attestation + complex-VOLUME input-gated)
  last_scanned: 2026-07-04
```

```md
- id: case-id-cross-series-collision
  path: data/cases/ SPEC id scheme (SPEC-{specialty}-{difficulty}-{seq}); scripts/ingest-case-bundles.mjs
  component_type: dataset
  state: PARTIAL
  evidence: FOUND 2026-07-04 — the SPEC case_id derives seq from the source case number within a series, but seq is NOT unique ACROSS source series: CVD "Atrial Fibrillation CDV-005.txt" and the already-ingested AUC "Acute Coronary Syndrome AUC-005.txt" both mapped to SPEC-CARD-01-00005. cases:ingest failed safe (COLLISION, no --force) and skipped the AFib case. INSTANCE RESOLVED 2026-07-04 (operator-authorised): the AFib bundle was re-id'd (blind literal id-string swap on a scratchpad COPY — source archive untouched, clinical content never read) to **SPEC-CARD-01-00099** (free globally; deliberately above the source-number-derived 1–51 range to mark it manually disambiguated) and ingested; 12 codes receipted; gate PASS. The existing SPEC-CARD-01-00005 (ACS) was never touched. SYSTEMIC gap remains: the id SCHEME is still not unique across series, so a future overlapping series would collide again.
  evidence_addendum: 2026-07-04 — the CIA batch produced 3 MORE cross-series collisions (all distinct cases, all skipped safely). ALL 3 NOW RESOLVED 2026-07-04 (operator-authorised, same re-id method → free per-specialty seq 00099): SPEC-DERM-01-00021 (CIA "Localised First-Degree Burn") → SPEC-DERM-01-00099; SPEC-RESP-01-00003 (CIA "Acute Viral Laryngitis") → SPEC-RESP-01-00099; SPEC-GI-01-00010 (CIA "Aphthous Stomatitis") → SPEC-GI-01-00099. Re-id on scratchpad copies (source archive + the 3 existing AUC cases verified untouched); dry-run 3/3 OK; ingested; 13 codes receipted; gate PASS. **All 4 known collision INSTANCES across 3 series are now resolved (AFib + these 3).** The 3 re-id'd cases are pending_clinician_review. Convention emerged: seq 00099 in a specialty bucket = a manually disambiguated re-id.
  blocks: nothing now (all 4 instances resolved); future overlapping series until the SCHEME is fixed
  safety_class: none (ingest fails safe — skips, never overwrites)
  invariant_exposure: auditability — case_id is the eval/medicolegal anchor; a non-unique scheme undermines it
  risk: Low
  blocks_patient_facing: false
  build_action: SYSTEMIC only (operator, before the next overlapping series): make seq unique across series (series tag, or globally-assigned seq). All current instances tactically resolved via re-id. Never --force over an existing case_id.
  gap_register_link: none (Low — systemic id-scheme decision for future series)
  status: open (all 4 instances resolved; systemic scheme decision outstanding for future series)
  last_scanned: 2026-07-04
```

```md
- id: cia-source-firewall-leaks
  path: data/cases/{SPEC-DERM-01-00036, SPEC-EMG-01-00037, SPEC-GI-01-00027, SPEC-MH-01-00044} (now ingested)
  component_type: dataset
  state: COMPLETE
  evidence: FOUND 2026-07-04 — 4 CIA source bundles REFUSED by the ingest firewall (full primary_diagnosis name in AI-Doctor-readable injectable text: "Pityriasis rosea", "Post-viral fatigue", "Uncomplicated external haemorrhoid", "Transient (adjustment) insomnia"). Firewall worked (fail-safe REFUSE; nothing leaked). RESOLVED 2026-07-04 — operator regenerated all 4 with a "Firewall remediation: primary diagnosis name removed from AI-Doctor-readable 00/02 fields (02 clinical_facts made observational); diagnosis retained only in sealed nodes 10-13" transform step; re-dry-run 4/4 OK_DRY_RUN (0 leaks); ingested; 16 codes receipted; eval:cases PASS. The 4 remain pending_clinician_review (attestation outstanding). NOTE: the operator attached the 4 full bundles (incl. sealed 10-13) into the agent context for the ingest task — handled as engineering-only material (digest-carve-out precedent), not reasoned-from and not routed to any trunk/packet.
  blocks: (cleared)
  safety_class: degrades_safe (firewall blocked the leak at ingest; remediated bundles pass cleanly)
  invariant_exposure: scoring-store firewall — held at the ingest boundary throughout; never breached
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE — remediated + ingested. Standing recommendation (not blocking): add a diagnosis-name leak pre-check to the authoring/kit step so leaks are caught before ingest, not only at it.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-04
```

```md
- id: reference-case-manifest-missing
  path: data/cases/SPEC-CARD-04-00001/ (7 node files, no case_manifest.json)
  component_type: dataset
  state: PARTIAL
  evidence: FOUND M6 2026-07-03 — the hand-built reference/worked case predates the cases:ingest manifest discipline: no case_manifest.json, so no file hashes, no codes_manifest, no attestation record in manifest form. Named-exempt in both cases:verify-codes (skip) and the eval gate (excluded from the attested count — the gate passes at 51 without it).
  blocks: nothing today (gate exempts it by name); reference-case parity with the ingest discipline
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: retrofit under a gated step — round-trip the reference case through the casebundle → cases:ingest path (or hand-author its manifest to the same contract: file sha256s, codes_manifest, review/attestation, firewall_assertion), then remove the named exemption from scripts/eval-case-gate.mjs.
  gap_register_link: none (Low)
  status: open
  last_scanned: 2026-07-03
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
- id: case-dir-duplicate-files
  path: data/cases/*/ (236 untracked "<name> 2.json" files across 30 case directories)
  component_type: dataset
  state: PARTIAL
  evidence: M0 scan 2026-07-03 — 236 untracked Finder-style duplicate files ("00_case_envelope 2.json" … "13_safety_netting_node 2.json", "case_manifest 2.json") across 30 case directories, including name-level duplicates of the sealed scoring nodes. Inventoried by filename only; content never opened. They are outside git and outside the ingest tool's hash/field-firewall discipline.
  blocks: clean case-store provenance; unambiguous ingest/eval inputs (a glob-based reader could pick up the duplicates)
  safety_class: none (untracked; no code reads them today)
  invariant_exposure: scoring-store hygiene — duplicate sealed-node files exist outside the ingest discipline
  risk: Medium
  blocks_patient_facing: false
  build_action: delete the 236 untracked "* 2.json" duplicates under a gated cleanup step (M0 is docs-only and may not retire files); afterwards re-verify case manifests/hashes and confirm any future case reader matches exact filenames, never globs.
  gap_register_link: none (Medium — below promotion threshold)
  status: open
  last_scanned: 2026-07-03
```

```md
- id: repo-digest-sealed-node-carveout
  path: scripts/export-repo-digest.mjs, breath-ezy-repo-digest.md (untracked at repo root; also distributed outside the repo)
  component_type: other (derived engineering artifact)
  state: PARTIAL
  evidence: M0 scan 2026-07-03 — the digest exporter deliberately embeds the reference case's sealed 10–13 nodes for engineering use, with an in-file warning (export-repo-digest.mjs ~line 84: "Do not use this context to role-play the AI Doctor"). The digest is LLM-readable context handed to planning agents. No code routes the digest into any trunk/packet path.
  blocks: nothing (documented carve-out); recorded for guard visibility
  safety_class: none in code (would be firewall_breach only if the digest were ever injected into an AI-Doctor context path)
  invariant_exposure: scoring-store firewall — carve-out is safe only while the digest stays out of every AI-Doctor context path
  risk: Low
  blocks_patient_facing: false
  build_action: keep the carve-out documented; the digest MUST never be routed into an AI-Doctor context path; add a digest-shaped fixture to the M3 context-allowlist contract test (assert default-deny rejects it).
  gap_register_link: none
  status: open
  last_scanned: 2026-07-03
```

```md
- id: claudemd-behind-charter
  path: CLAUDE.md (repo root)
  component_type: derived-doc
  state: STALE
  evidence: RESOLVED 2026-07-01 (operator-approved) — the charter's <completeness_audit>/Phase 0/Plan-Execute sections were already present; the remaining staleness was the server build-status prose, which described knowledge/fhir-broker/pharmacology/messaging-geo as "specified, not built" and the four as dist-shipping. Reconciled: repo map (line 33), the dist/index.js note (line 30, +audit-ledger-entry in the schema list line 32), and <gap_register_and_build_sequence> (mock-built PARTIAL status + build-order annotations) now match the register.
  blocks: next-agent fidelity to the governing prompt
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — CLAUDE.md server-status prose reconciled to the register (operator approved the edit 2026-07-01).
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-01
```

```md
- id: derived-docs-unverified
  path: .claude/schema-index.md, .claude/server-status.md
  component_type: derived-doc
  state: STALE
  evidence: RESOLVED 2026-07-01 — schema-index.md verified against disk (12/12 mcp/schemas + 7/7 data/schemas present and correctly attributed; no change needed). server-status.md pharmacology row was self-contradictory ("firewall wiring pending / Not yet wired behind Trunk 8.0" in the table vs "Trunk 8.0 firewall wired" in the narrative and gap-register R-22); table cell corrected to match the wired-and-contract-tested reality.
  blocks: trust in derived quick-references
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — schema-index verified accurate; server-status pharmacology row reconciled to gap-register R-22 + passing contract-firewall.js.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-01
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
9. `case-set-underpopulated` → **52 cases ingested 2026-07-02 (≥45 minimum MET)**; remaining: 60/30/10 distribution top-up + terminology batch-verify + wire eval as blocking CI (ARCH_PLAN M6). **Medium.**
10. `fhir-broker-unbuilt`, `messaging-geo-unbuilt`. **Medium.**

Cross-cutting / decide under plan:

- ~~`receipt-store-append-only-unbuilt`~~ **mock-resolved 2026-06-30** (R-17; production WORM + retention still to configure); `content-store-production-gated` (**Medium**, new — synthetic-only until persistence Critical); `session-persistence-unenforced` (**Critical**); ~~`context-graph-orphan` + `patient-knowledge-graph-orphan`~~ **reclassified 2026-06-30** (not dead-ends — contracted schemas awaiting the knowledge-server producer; tracked under `knowledge-server-unbuilt`); `claudemd-behind-charter` + `derived-docs-unverified` (**Low**).

---

## Promotion into gap-register (one-way)

Already represented in `gap-register.md`: pharmacology, verification portal, investigation parser, persistence, knowledge datasets, fhir-broker, messaging-geo, case-set.

**Promoted 2026-06-30 cycle (done):** `hashing-unimplemented` → R-16, `verifier-untested` → R-18, `verifier-weak-code-detection` → R-19, `receipt-store-append-only-unbuilt` → R-17.

**Promoted M0 2026-07-03 cycle (done):** `routing-plan-next-trunks-dead-end` → R-24 (High), `mode-leakage-enforcelive` → R-25 (High), `context-injection-allowlist` → R-26 (High). Also mirrored: `case-set-underpopulated` → R-23 (Medium — mirrored to fix the dangling `gap-case-set` link, not a threshold promotion). Moves noted in `CHANGELOG.md`.

*Source of truth: this register + the live scan. Derived quick-reference: `.claude/completeness-index.md`.*
