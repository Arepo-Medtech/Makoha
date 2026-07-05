# HeyDoc Gap Register

**Document ID:** `heydoc-grounding:gap-register:2026-06`  
**Version:** 1.0.0  
**Last reviewed:** 2026-06-30 (R-16/17/18/19 resolved; R-13/R-20/R-21/R-22 mock built; Digital Tablet imported. Live vendors/EHR/NCTS + sign-off + Portal + persistence remain)  
**Citation ID:** `gap-register:v1.0.0:2026-06`

This register is the primary source of truth for what HeyDoc currently is and is not. It is retrieved by the docs MCP server when trunks need to ground their scope assertions, and it is the authoritative list for the verifier's `no_repo_invention` check. Every trunk agent that references an internal service name must confirm it appears in the Allowed Service Registry below before citing it.

---

## 1. Allowed Service Registry

These are the only internal service and repository names that may appear in trunk output. The verifier (`verification/verifier.js`) checks backtick-quoted identifiers against this list and flags any name not present as `no_repo_invention` failure.

### 1a. MCP Servers (active, stub mode)

| Name | MCP Key | Stub Mode | Live Mode | Status |
|---|---|---|---|---|
| `heydoc-mcp-docs` | `docs` | ✓ mock receipts | Pinned doc corpus | **Stub** |
| `mcp-docs` | `docs` | ✓ | — | Alias |
| `heydoc-mcp-identity-au` | `identity-au` | ✓ mock IHI | AU HI Service / PRODA | **Stub** |
| `mcp-identity-au` | `identity-au` | ✓ | — | Alias |
| `terminology` | `terminology` | ✓ mock codes | NCTS Ontoserver / WHO API | **Stub** |
| `mcp-knowledge` | `knowledge` | ✓ mock KG | PostgreSQL + graph layer | **Stub** |
| `mcp-fhir-broker` | `fhir-broker` | ✓ mock FHIR | SMART-on-FHIR / mTLS EHR | **Stub** |
| `mcp-pharmacology` | `pharmacology` | ✓ mock checks | MIMS-AU or equivalent | **Stub** |
| `mcp-messaging-geo` | `messaging-geo` | ✓ mock | SMS/email vendor + geo API | **Stub** |
| `mcp-terminology` | `terminology` | ✓ mock codes | NCTS Ontoserver / WHO API | Alias |

### 1b. Orchestration and Pipeline Components (internal, not MCP servers)

| Name | Location | Status |
|---|---|---|
| `hl7-fhir-broker` | `mcp/servers/fhir-broker/` | Stub — alias for `mcp-fhir-broker`; used in trunk output and ALLOWED_SERVICE_NAMES |
| `identity-gateway` | `mcp/servers/identity-au/` | Stub — alias for `mcp-identity-au`; used in trunk output |
| `core-agent-orchestrator` | `integration/trunk-pipeline.js` | Partial — `runTrunkWithGrounding()` implements orchestration; no separate service yet |
| `shell-matrix-agent` | Not yet created | Gap — front-end agent adapter TBD |
| `triage-state-machine` | Represented by `verification/pipeline.js` routing() | Stub only |
| `neuro-symbolic-bayesian-engine` | Not yet created | Gap — Bayesian inference module TBD |
| `diagnostic-gating-service` | Trunk 7.0 benign-registry logic | Gap — benign registry dataset not yet populated |
| `clinical-knowledge-graph` | `mcp/servers/knowledge/` | Stub — schema exists, graph DB not yet seeded |
| `graph-db-manager` | `mcp/servers/knowledge/` | Stub |
| `deterministic-investigation-parser` | `verification/investigation-parser.js` | Built (mock/dev, 2026-06-30) — deterministic sanitiser wired into contextInjection + the ContextPacket lab gate; no raw number emitted; reference ranges provisional (`lab-reference-ranges-provisional`), live FHIR source pending (R-21) |
| `pharmacological-firewall` | `mcp/servers/pharmacology/` + Trunk 8.0 wiring in `verification/pipeline.js` | Built (mock core, 2026-06-30) — deterministic 5-check engine wired behind Trunk 8.0; HARD_FAIL blocks continuation with no override; contract-tested (contract-pharmacology + contract-firewall); live vendor pending (R-22) |
| `deterministic-pharmacology-firewall` | same | Alias for above |
| `medicolegal-audit-ledger` | `verification/audit-store.js` + `ledger-schema.js` | Built (2026-06-30) — append-only hash-chained ledger, PHI-free by `.strict()`; verifyChain() + verify:rehash; production WORM substrate + retention policy pending (R-17) |
| `nlp-snomed-extractor` | Not yet created | Gap — NLP component TBD |
| `nlp-clinical-extraction` | same | Alias |
| `geolocation-pharmacy-api` | `mcp/servers/messaging-geo/` | Stub |
| `deep-library-agent` | Not yet created | Gap |
| `discharge-monitoring-loop` | Not yet created | Gap |
| `patient-client-app` | Not yet created | Gap |
| `clinician-verification-portal` | `portal/verification-gate.js` + `mcp/schemas/verification-portal-decision.schema.json` | Gate built (M5 2026-07-03) — server-side HITL release checkpoint: releaseToPatient() refuses without an attested VerificationGateRecord bound to the exact candidate_output_hash; fail-closed; dev modes never release. UI/workflow + durable gate-record storage still open — the portal is NOT complete and patient paths stay closed |
| `clinical-evals-suite` | `data/schemas/` and `data/cases/` | Partially complete — schemas built, synthetic cases in progress |
| `mlops-weights-registry` | Not yet created | Gap |
| `infrastructure-iac` | Not yet created | Gap |
| `bayesian-inference-engine` | Not yet created | Gap — alias for neuro-symbolic engine |
| `SOAP-agent` | Trunk 4.0 problem representation | Conceptual label, not a deployed service |

> **Verifier rule:** Any backtick-quoted identifier in trunk output that does not appear in 1a or 1b above triggers the `no_repo_invention` check to fail with severity=warning.

---

## 2. MCP Server Status Detail

All seven servers are currently in **stub mode** (`HEYDOC_MODE_DEFAULT=mock`). No production endpoints are connected. The table below shows what each server does in stub mode versus what live mode requires.

### `docs` — Static Documentation

- **Stub:** Returns canned guideline snippets for contract tests. Citation IDs are deterministic mocks (e.g., `cw-au:imaging-lbp:2024-01`).
- **Live requires:** A pinned, versioned document corpus in `docs/` indexed for semantic search. Currently populated with grounding docs in `docs/grounding/`. Requires docs index (`docs/index/`) to be built before live queries work.
- **Tools:** `docs_search`, `docs_cite`, `docs_get`
- **Receipt upstream value in stub:** `"heydoc-mcp-docs"`

### `knowledge` — Structured Knowledge Graph

- **Mock (2026-06-30):** kg_query/kg_provenance serve three seeded DEV datasets (benign-registry, axis-b-templates, redflags-bank); ContextGraph/PatientKnowledgeGraph return empty (no graph store); kg_upsert/kg_export are SAFE_STUBs. Wired into retrieval + contextInjection (structured_dataset evidence).
- **Live requires:** PostgreSQL at `HEYDOC_KG_DB_URL`. Authoritative (signed-off) datasets + LOINC→semantic mappings + the graph write path.
- **Tools:** `kg.query`, `kg.provenance` (built); `kg.upsert`, `kg.export` (SAFE_STUB).
- **Gap:** datasets are DEV/SYNTHETIC-ONLY (`knowledge-datasets-provisional`) — clinical + regulatory sign-off required before patient-facing; live graph store not built.

### `identity-au` — Australian Identity / IHI

- **Stub:** Returns mock IHI values with `upstream: "stub"`.
- **Live requires:** mTLS certificates + access to AU HI Service via PRODA or equivalent. Legal basis for IHI lookup documented.
- **Tools:** `identity_verify`, `identity_lookup_ihi`, `identity_log_consent`
- **Hard rule:** No plaintext patient demographics persist beyond `identity_lookup_ihi`. Only `receipt.request_id` and minimal attributes persist.
- **Gap:** mTLS cert provisioning, legal basis documentation, consent workflow.

### `terminology` — SNOMED CT / ICD-11

- **Mock (2026-06-30):** grounds SNOMED_CT / ICD_10_AM / ICD_11 / LOINC / PBS / AMT (the Digital Tablet's systems); echoes looked-up codes for per-code binding. `terminology-servers.json` records the live NCTS/Ontoserver endpoints (from data/digital_tablet_omnibus.json), used only in live mode.
- **Live requires:** NCTS Ontoserver (`https://r4.ontoserver.csiro.au/fhir`); SNOMED CT-AU 20240301 + ICD-10-AM/LOINC/PBS/AMT licences via NCTS; AU Core value-set bindings.
- **Tools:** `terminology_lookup`, `terminology_validate`, `terminology_map`
- **Gap:** NCTS licence + live connection; AU Core value-set binding; no live PBS API; AMT subset not validated. Mock codes must be re-validated against live Ontoserver before production.

### `fhir-broker` — FHIR Patient Record

- **Mock (2026-06-30):** fhir_read/fhir_search return templated AU Core resources (incl. lab Observations); fhir_write SAFE_STUB. Wired so Trunk 6.0 Observations flow through the investigation parser (raw values never reach the LLM). Contract-tested.
- **Live requires:** FHIR R4 base URL, SMART-on-FHIR or mTLS auth, AU Core 0.3.0 / AUCDI R3 conformance validation (fhir-r4-aucdi-conformance-unbuilt).
- **Tools:** `fhir_read`, `fhir_search` (built); `fhir_write` (SAFE_STUB).
- **Gap:** EHR/MHR connector selection, SMART-on-FHIR client registration, patient consent for MHR access, conformance validator.

### `pharmacology` — Pharmacology Firewall

- **Stub:** Returns mock PASS/WARN/HARD_FAIL results. `PHARM_VENDOR=stub`.
- **Live requires:** Vendor API at `PHARM_ENDPOINT` — MIMS-AU or equivalent with NTI database, allergy cross-reactivity engine, drug-drug interaction module, renal dosing adjustment, Australian scheduling data (S4/S8/S4D).
- **Tools:** `pharm_intent`, `pharm_check`
- **Status (2026-06-30):** deterministic MOCK core built AND wired behind Trunk 8.0 (`mcp/servers/pharmacology/`, R-22) — 5 checks, dose-only-here, HARD_FAIL blocks continuation with no override (receipt-backed), paediatric flag/no-dose, S8 PDMP, BLOCKED_NO_PROOF on absent facts; contract-tested. **Still open:** no pharmacology vendor contracted — HARD_FAIL operates on MOCK data only. **Do not use in any patient-facing context until a live vendor is connected and validated.**

### `messaging-geo` — Messaging and Geolocation

- **Mock (2026-06-30):** geo_locate/pharmacy_search return mock results; msg_send is a SAFE_STUB that NEVER sends (recipient redacted, not echoed) and is flagged not-patient-facing. Contract-tested. Not wired into the trunk pipeline.
- **Live requires:** `MSG_PROVIDER` (SMS/email vendor), `GEO_PROVIDER` (geocoding API), `PHARMACY_DIRECTORY_PROVIDER` (AU pharmacy directory).
- **Gap:** All three providers unselected; pharmacy directory data source + licensing TBD. msg_send may only be wired behind the Clinician Verification Portal.

---

## 3. External Standards — Pinning Status

| Standard | Version in Schemas | Live Endpoint | Gap |
|---|---|---|---|
| HL7 FHIR | R4 (4.0.1) | fhir-broker (stub) | No EHR connected |
| SNOMED CT | AU Edition 20240301 | terminology (stub) | NCTS licence pending |
| ICD-10-AM | 12th Edition | Not queried | Codes manually curated |
| LOINC | 2.77 | Not queried | Mapping tables not built |
| AU Core | 0.3.0 | fhir-broker (stub) | Conformance not validated |
| AUCDI | Release 3 (supplements AU Core 0.3.0) | fhir-broker (unbuilt) | Conformance validator + required-binding tables not built; re-target vs supplement is an org decision |
| PBS | Current | Not queried | No PBS API connected |
| AMT | SNOMED CT AU basis | terminology (stub) | Product subset not validated |
| SafeScript WA | Referenced in pharm-check | Not connected | PDMP integration gap |
| AU HI Service | Referenced in identity-au | Stub | mTLS + PRODA gap |

---

## 4. Clinical Scope Limits

### 4a. Hard limits — never do

1. **No autonomous diagnosis** — All diagnostic output is provisional and requires clinician confirmation.
2. **No autonomous prescription** — No dosing instructions unless sourced from a PharmCheck receipt via `mcp-pharmacology`.
3. **No fabricated codes** — SNOMED CT, ICD-10-AM, LOINC, PBS codes must come from a terminology lookup receipt.
4. **No fabricated operational facts** — IHI numbers, lab values, pharmacy stock, ECG results must come from a live-data receipt.
5. **No invented service names** — Internal component names not in Section 1 above must not appear in trunk output.
6. **No HARD_FAIL override** — A `HARD_FAIL` from `mcp-pharmacology` blocks pipeline continuation unconditionally.
7. **No raw lab numbers to LLM context** — Raw numeric values must be sanitised by the investigation parser before injection into ContextPacket.

### 4b. Telehealth-specific limits

- Cannot perform physical examination, auscultation, palpation, or any procedure requiring physical presence.
- Cannot obtain vital signs without a connected device. Assume unknown unless patient-provided via a validated home device.
- Cannot obtain ECG, troponin, blood tests, or imaging without a live `mcp-fhir-broker` connection.
- Safety-netting thresholds must be conservative to account for these limits. When in doubt, escalate.

### 4c. Population scope

- **Jurisdiction:** Australian healthcare context only.
- **Language:** English-language consultations. `interpreter_required` flag triggers escalation, not language switching.
- **Age:** No paediatric dosing tables in pharmacology stub. Paediatric cases (age <18) should be flagged for in-person review.
- **Emergency scope:** HeyDoc identifies and escalates emergencies (T5 tier) but does not provide resuscitation guidance.

---

## 5. Risk Register

| Risk ID | Description | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| R-01 | LLM hallucinates SNOMED/ICD code | High (without controls) | Critical | Terminology receipt required; verifier CODE_PATTERNS check | Controlled |
| R-02 | LLM hallucinates guideline claim | High (without controls) | High | Docs receipt required; verifier GUIDELINE_PATTERNS check | Controlled |
| R-03 | HARD_FAIL ignored — unsafe drug recommendation | Low (verifier blocks) | Critical | `hard_stop_enforcement` check; HARD_FAIL blocks continuation | Controlled |
| R-04 | IHI hallucinated — wrong patient identity | Medium | Critical | `no_invented_operations` check; identity-au receipt required | Controlled |
| R-05 | Raw lab value in LLM context | Medium | High | `sanitised_by` required on lab_result facts | Schema enforced; parser not built |
| R-06 | Under-triage — patient harm | Medium | Critical | Scoring rubric auto-fail; no real-time gate yet | Eval framework only |
| R-07 | Premature diagnosis in telehealth | High | High | `cannot_diagnose_remotely` certainty tier enforced in scoring | Eval framework only |
| R-08 | Sycophantic alternative therapy recommendation | Medium | Moderate | `evidence_grade` mandatory in integrative_alternative_therapies schema | Schema enforced |
| R-09 | S8 opioid without PDMP check | Low (Trunk 8.0 gates) | Critical | `schedule_8_pdmp_required` flag; HARD_FAIL if no PDMP | Controlled in stub |
| R-10 | Patient data persists beyond session | High without controls (was) | Critical | Technical enforcement built (M4 2026-07-03): `verification/session-store.js` — memory-only, encounter-scoped working state, destroyed on close, closed refs never reopen, demographic-looking keys + IHI-shaped values REFUSED (Trust Boundary 4). Contract-tested (`test/contract-session-store.js`, npm test + CI). Ledger exempt by design (PHI-free, append-only). ADOPTION mandatory for any future stateful session path; real-patient content persistence still gated on consent (`content-store-production-gated`). | Enforcement built 2026-07-03 (M4); adoption re-checked per session-flow change |
| R-11 | LLM invents internal service name | Medium (without verifier) | Moderate | `no_repo_invention` check; ALLOWED_SERVICE_NAMES list | Controlled |
| R-12 | Mock pharmacology data used in patient context | High | Critical | `mode` field required; mode=mock must never reach patient | Policy only; technical gate TBD |
| R-13 | Benign registry empty — Trunk 7.0 blocks all codes | High (was) | Moderate | Knowledge server (mock) built + benign-registry / Axis B / red-flag datasets seeded (DEV), served via kg_query. Content is DEV/SYNTHETIC-ONLY (`knowledge-datasets-provisional`) — clinical sign-off before live. | Mock-resolved 2026-06-30 |
| R-14 | High/Critical advisory in a dependency reaches build | Medium | High | `@modelcontextprotocol/sdk` floor raised to `^1.29.0` (patched transitive deps); CI `npm audit --audit-level=high` blocks the build | Controlled |
| R-15 | No SAST / secret-scanning in CI before production path | High | High | `npm audit` gate added (deps only); static-analysis + secret-scanning still to be added before any patient-facing release | Open gap |
| R-16 | candidate_output_hash (medicolegal SHA-256) not produced | High (was, pre-build) | Critical | Promoted from Completeness Register `hashing-unimplemented`. SHA-256 computed in verify() over exact output; required in verification-report.schema.json; zod validateReport() gates every write; tested (test/contract-verification-report.js). | Resolved 2026-06-30 |
| R-17 | No append-only, tamper-evident audit/receipt store | High | High | Promoted from `receipt-store-append-only-unbuilt`. Hash-chained medicolegal-audit-ledger (verification/audit-store.js) built; both writers append per run; receipt metadata + hash captured; verifyChain() + verify:rehash. Exact-output content store is synthetic-only (`content-store-production-gated`) until R-10/session-persistence + consent are green. Production WORM substrate + retention policy still to configure. | Mock-resolved 2026-06-30 (prod pending) |
| R-18 | Deterministic verifier (5 hard checks) untested | High | High | Promoted from `verifier-untested`. test/contract-verifier.js covers all 5 checks (pass/fail/receipt-flip), hash return, overall-pass logic, and pipeline integration; wired into npm test + CI. | Resolved 2026-06-30 |
| R-19 | Weak code detection — no per-code binding, ICD-10-AM/LOINC/PBS unmatched, mock not flagged | High | High | Promoted from `verifier-weak-code-detection`. Patterns span SNOMED/ICD-10-AM/ICD-11/LOINC/PBS w/ FP guards; true per-code↔receipt binding (SNOMED/ICD-10-AM/LOINC); mock-mode flag+block; MCP upstream bug fixed. Tested; trunk:stub:all 9/9 stub+MCP. | Resolved 2026-06-30 |
| R-20 | Terminology contract grounds only SNOMED + ICD-11 vs invariant's SNOMED/ICD-10-AM/LOINC/PBS | High | High | Promoted from `terminology-contract-incomplete`. MOCK multi-system built: enum now SNOMED_CT/ICD_10_AM/ICD_11/LOINC/PBS/AMT (per the Digital Tablet, imported); per-code binding for all except ICD-11 (coarse); retrieveTerminology grounds multiple systems; end-to-end ICD-10-AM binding verified. REMAINING (input-gated): live NCTS/Ontoserver (licence) + AU Core value-set binding. | Mock built 2026-06-30 (live NCTS + AU Core binding pending) |
| R-21 | Deterministic investigation parser (sanitiser) not built — raw lab numbers could reach LLM | Medium (was) | Critical | Promoted from `investigation-parser-unbuilt` (named release blocker). Deterministic parser built (HL7 banding, no raw number, fail-safe), wired into contextInjection, enforced at the ContextPacket gate, tested. Reference ranges are DEV/SYNTHETIC-ONLY (`lab-reference-ranges-provisional`) — clinical + regulatory sign-off + a live fhir-broker source required before patient-facing. | Mock/dev built 2026-06-30 (ranges + live source pending) |
| R-22 | Pharmacology server not built — HARD_FAIL/dose checks ran on nothing | High (#1 gap) | Critical | Promoted from `pharmacology-server-unbuilt`. Deterministic MOCK core built (5 checks, dose-only-here, paediatric flag/no-dose, S8 PDMP, BLOCKED_NO_PROOF) AND wired behind Trunk 8.0: firewall_status gates continuation, HARD_FAIL blocks with NO override (receipt-backed; check 5 distinguishes legitimate vs invented). Contract-tested (pharmacology + firewall). REMAINING: live vendor (MIMS-AU/SafeScript) in staging. **Must NOT be patient-facing until live vendor connected + validated.** | Mock core + firewall wired 2026-06-30 (live vendor pending) |
| R-23 | Case-set distribution skew vs the 60/30/10 evaluation design | Medium | Moderate | Mirrored from `case-set-underpopulated`. M6 2026-07-03: **336 candidate codes receipted** (`cases:verify-codes`; → mock_verified_pending_live_ncts; live NCTS at M11/F5) and the **eval gate is CI-BLOCKING** (`eval:cases`: ≥45 attested + sha256 integrity + schema + receipts + attestation; PASS at 51 attested / 101 total). **Atypical top-up ingested** 2026-07-03: 50 operator-supplied AMS bundles (tiers 02/03/04; new RHEUM/HAEMAT specialties) — distribution 88/12/0 → **45/55/0**, tier coverage 2 → 4. The 50 AMS were **attested 2026-07-04** (KL). **CVD batch ingested 2026-07-04**: 49 of 50 (1 id collision skipped, see completeness-register `case-id-cross-series-collision`) — brings the first COMPLEX cases (5× rare_condition) + 3rd category `zebra_rare`; 709 codes receipted; **coverage now 5 tiers · 3 categories (minimums CLEARED)**; distribution 45/51/3; eval:cases PASS. The 49 CVD were **attested 2026-07-04** (KL) → **eval:cases: 150 attested ≥45, 0 unreviewed, PASS**; distribution 45/51/3; coverage 5 tiers · 3 categories. 151/151 attested through CVD+AFib. **CIA batch 2026-07-04**: 43 of 50 ingested (all straightforward; 190 codes, store 911); distribution 45/51/3 → **58/40/3** (194 cases). 7 not ingested: 3 more cross-series id collisions + 4 firewall-refused (diagnosis leaked into injectable text). CIA attested → 194/194. **4 firewall-remediated CIA bundles ingested 2026-07-04** (operator removed diagnosis from injectable fields; re-dry-run 0 leaks; 927 codes; 198 cases; distribution 59/39/3; eval:cases PASS; the 4 attested → 198/198. **3 re-id'd CIA collision cases ingested 2026-07-04** (→ per-bucket -00099; all 4 id-collision instances now resolved; 940 codes; 201 cases; distribution 59/38/2; the 3 attested → 201/201. **CFE (Complex Fatigue Entities) batch, operator-re-tiered, ingested 2026-07-04**: 49 well-formed bundles (14 complex) → **complex band 2% → 8%** (near target); 1285 codes; 250 cases; distribution 48/45/8; coverage 6 tiers; eval:cases PASS; the 49 **attested 2026-07-05** → **250/250 attested, 0 unreviewed**. CFE collision re-id'd → SPEC-DERM-03-00099, ingested, and **attested 2026-07-05** → **251/251 attested, 0 unreviewed** (all 5 collision instances resolved). The 13 refused CFE bundles were operator-RETIRED (format tag "-RETIRED") and DELETED 2026-07-05 per operator instruction (`cfe-malformed-bundles` resolved; nothing was in the repo). REMAINING: only optional distribution polish (47/45/8 → 60/30/10) — no blocking work. | M6 core + case population complete; FULL set (251) attested, gated, receipted; only optional rebalance remains |
| R-24 | HARD_FAIL/escalate cannot propagate across trunks — `routing_plan.next_trunks` produced by Trunk 1.0, consumed by no code (DEAD_END-1) | Medium (was) | Critical | Promoted from `routing-plan-next-trunks-dead-end` (M0 2026-07-03). `integration/trunk-sequencer.js` built (M2): consumes `next_trunks` (zod-gated), runs each trunk through the full five-step pipeline, and halts UNCONDITIONALLY on continuation_blocked (HARD_FAIL/BLOCKED_NO_PROOF propagate across the sequence, no override), escalate_now/T5 (gate-first + per-trunk, conservative over-halt), and verification failure. Behind `HEYDOC_SEQUENCER` (default off = rollback); re-exported from trunk-pipeline.js. Contract-tested (`test/contract-sequencer.js`, in npm test + CI). Manual chaining outside the sequencer must still honour continuation_blocked (documented). | Resolved 2026-07-03 (M2) |
| R-25 | Mock receipts accepted outside dev — verifier `enforceLive` fires only on the exact string `"live"`; `staging`/`production` contexts would not block mock proof | Medium (was) | Critical | Promoted from `mode-leakage-enforcelive` (C16/F4, M0 2026-07-03). `verification/mode.js` built and wired into pipeline.js context_mode, verifier.js enforceLive, AND audit-store.js recordRun (second F4 site found in M1: staging would have persisted content as synthetic — closed). staging/production→live⇒mock blocked; unknown mode default-denies; mock/dry_run flag-not-block unchanged. Contract-tested (`test/contract-mode-normaliser.js`, in npm test + CI). Residual: server-side receipt-mode stamping normalised at live-connect (M9/M11). | Resolved 2026-07-03 (M1) |
| R-26 | Live context-injection lacks the field-scoped firewall allow-list already enforced at ingest | Medium (was) | Critical | Promoted from `context-injection-allowlist` (M0 2026-07-03). `verification/context-allowlist.js` built (M3): default-deny mirror of the `cases:ingest` firewall enforced in `contextInjection()`; sealed nodes (10–13) anywhere in the input THROW and halt packet assembly; 02 dialogue material classified exchange-only (never packet facts); `objective_data_offered` quarantined pending the patient-reported-vitals sanitiser policy (charter open follow-up, now register-tracked as `objective-data-offered-sanitiser-policy`). Contract-tested end-to-end through the ContextPacket zod gate (`test/contract-context-allowlist.js`, npm test + CI). Firewall re-checked at M3 close: NOT breached. | Resolved 2026-07-03 (M3) |

---

## 6. FHIR Compliance Status

| Resource | AU Core Profile | Stub | Live Gap |
|---|---|---|---|
| Patient | au-core-patient ✓ | Digital Tablet template | Real record via fhir-broker |
| Condition | au-core-condition ✓ | Templated | Real conditions from EHR |
| MedicationRequest | au-core-medicationrequest ✓ | Templated | Real med list from EHR |
| AllergyIntolerance | au-core-allergyintolerance ✓ | Templated | Real allergy record from EHR |
| Observation | au-core-observation ✓ | Templated | Real results from EHR/lab |
| Immunization | — | Templated | AIR connection gap |
| DiagnosticReport | — | Not templated | Lab/imaging system gap |
| FamilyMemberHistory | — | Patient-reported only | No EHR source |
| ClinicalImpression | — | HeyDoc output schema | Not stored in EHR |

---

## 7. Medicolegal Posture

- **HeyDoc is clinical decision support, not a licensed medical practitioner.** All outputs require human clinician review before clinical action.
- **Human-in-the-loop is mandatory** for any management recommendation reaching a patient. The Clinician Verification Portal (Section 1b — gap) is the required gate before any output is patient-facing.
- **Audit trail:** Every trunk output is hashed (`candidate_output_hash: sha256:<64hex>`) in VerificationReport. This is the medicolegal record of what was generated.
- **Liability:** Clinicians using HeyDoc output retain full professional responsibility. HeyDoc does not hold AHPRA registration.
- **Data retention:** Patient data must not persist beyond the session without explicit consent. Session retention policy is deployment-defined — this register does not set it.

---

*Citation ID: `gap-register:v1.0.0:2026-06`. Retrieved by `docs_search` when trunks ground scope assertions. Pin this ID in EvidenceNode.supports[].ref when citing.*
