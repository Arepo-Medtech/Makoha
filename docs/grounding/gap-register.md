# HeyDoc Gap Register

**Document ID:** `heydoc-grounding:gap-register:2026-06`  
**Version:** 1.0.0  
**Last reviewed:** 2026-06-30 (R-16/17/18/19 resolved; R-21 parser, R-22 pharmacology+firewall, R-13 knowledge — mock built; R-20 terminology contract — open)  
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
| `deterministic-investigation-parser` | Trunk 6.0 sanitiser | Gap — sanitiser not yet implemented |
| `pharmacological-firewall` | `mcp/servers/pharmacology/` | Stub — pharm-intent/pharm-check schemas exist; no vendor API connected |
| `deterministic-pharmacology-firewall` | same | Alias for above |
| `medicolegal-audit-ledger` | Not yet created | Gap — audit hashing and WORM storage TBD |
| `nlp-snomed-extractor` | Not yet created | Gap — NLP component TBD |
| `nlp-clinical-extraction` | same | Alias |
| `geolocation-pharmacy-api` | `mcp/servers/messaging-geo/` | Stub |
| `deep-library-agent` | Not yet created | Gap |
| `discharge-monitoring-loop` | Not yet created | Gap |
| `patient-client-app` | Not yet created | Gap |
| `clinician-verification-portal` | Not yet created | Gap |
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

- **Stub:** Returns mock SNOMED codes. `TERMINOLOGY_UPSTREAM_NAME=stub`.
- **Live requires:** NCTS Ontoserver (`https://r4.ontoserver.csiro.au/fhir`) or equivalent. SNOMED CT Australian Edition 20240301 licence via NCTS.
- **Tools:** `terminology_lookup`, `terminology_validate`
- **Gap:** NCTS licence confirmation. All SNOMED codes in schema files must be re-validated against live Ontoserver before production use.

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
| R-10 | Patient data persists beyond session | High without controls | Critical | Architecture policy; not yet technically enforced | Gap |
| R-11 | LLM invents internal service name | Medium (without verifier) | Moderate | `no_repo_invention` check; ALLOWED_SERVICE_NAMES list | Controlled |
| R-12 | Mock pharmacology data used in patient context | High | Critical | `mode` field required; mode=mock must never reach patient | Policy only; technical gate TBD |
| R-13 | Benign registry empty — Trunk 7.0 blocks all codes | High (was) | Moderate | Knowledge server (mock) built + benign-registry / Axis B / red-flag datasets seeded (DEV), served via kg_query. Content is DEV/SYNTHETIC-ONLY (`knowledge-datasets-provisional`) — clinical sign-off before live. | Mock-resolved 2026-06-30 |
| R-14 | High/Critical advisory in a dependency reaches build | Medium | High | `@modelcontextprotocol/sdk` floor raised to `^1.29.0` (patched transitive deps); CI `npm audit --audit-level=high` blocks the build | Controlled |
| R-15 | No SAST / secret-scanning in CI before production path | High | High | `npm audit` gate added (deps only); static-analysis + secret-scanning still to be added before any patient-facing release | Open gap |
| R-16 | candidate_output_hash (medicolegal SHA-256) not produced | High (was, pre-build) | Critical | Promoted from Completeness Register `hashing-unimplemented`. SHA-256 computed in verify() over exact output; required in verification-report.schema.json; zod validateReport() gates every write; tested (test/contract-verification-report.js). | Resolved 2026-06-30 |
| R-17 | No append-only, tamper-evident audit/receipt store | High | High | Promoted from `receipt-store-append-only-unbuilt`. Hash-chained medicolegal-audit-ledger (verification/audit-store.js) built; both writers append per run; receipt metadata + hash captured; verifyChain() + verify:rehash. Exact-output content store is synthetic-only (`content-store-production-gated`) until R-10/session-persistence + consent are green. Production WORM substrate + retention policy still to configure. | Mock-resolved 2026-06-30 (prod pending) |
| R-18 | Deterministic verifier (5 hard checks) untested | High | High | Promoted from `verifier-untested`. test/contract-verifier.js covers all 5 checks (pass/fail/receipt-flip), hash return, overall-pass logic, and pipeline integration; wired into npm test + CI. | Resolved 2026-06-30 |
| R-19 | Weak code detection — no per-code binding, ICD-10-AM/LOINC/PBS unmatched, mock not flagged | High | High | Promoted from `verifier-weak-code-detection`. Patterns span SNOMED/ICD-10-AM/ICD-11/LOINC/PBS w/ FP guards; true per-code↔receipt binding (SNOMED/ICD-10-AM/LOINC); mock-mode flag+block; MCP upstream bug fixed. Tested; trunk:stub:all 9/9 stub+MCP. | Resolved 2026-06-30 |
| R-20 | Terminology contract grounds only SNOMED + ICD-11 vs invariant's SNOMED/ICD-10-AM/LOINC/PBS | High | High | Promoted from `terminology-contract-incomplete`. ICD-10-AM/LOINC/PBS ungroundable -> hardened verifier blocks them (fail-safe). Extend terminology contract+server; reconcile ICD-10-AM vs ICD_11. Feeds AUCDI R3 value-set binding. | Open |
| R-21 | Deterministic investigation parser (sanitiser) not built — raw lab numbers could reach LLM | Medium (was) | Critical | Promoted from `investigation-parser-unbuilt` (named release blocker). Deterministic parser built (HL7 banding, no raw number, fail-safe), wired into contextInjection, enforced at the ContextPacket gate, tested. Reference ranges are DEV/SYNTHETIC-ONLY (`lab-reference-ranges-provisional`) — clinical + regulatory sign-off + a live fhir-broker source required before patient-facing. | Mock/dev built 2026-06-30 (ranges + live source pending) |
| R-22 | Pharmacology server not built — HARD_FAIL/dose checks ran on nothing | High (#1 gap) | Critical | Promoted from `pharmacology-server-unbuilt`. Deterministic MOCK core built (5 checks, dose-only-here, paediatric flag/no-dose, S8 PDMP, BLOCKED_NO_PROOF) AND wired behind Trunk 8.0: firewall_status gates continuation, HARD_FAIL blocks with NO override (receipt-backed; check 5 distinguishes legitimate vs invented). Contract-tested (pharmacology + firewall). REMAINING: live vendor (MIMS-AU/SafeScript) in staging. **Must NOT be patient-facing until live vendor connected + validated.** | Mock core + firewall wired 2026-06-30 (live vendor pending) |

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
