## Data buckets (Static Docs vs Live Data vs Structured Knowledge)

This file converts the gap register into a **grounded data sourcing map**. Every “claimable” concept in generation must resolve to **one** of these buckets, and each bucket must have an explicit **source-of-truth** and **proof artifact**.

### Bucket A: Static Documentation (versioned, citeable)
**Purpose**: justify “hard refusal”, red-flag questionnaires, coding rules, security/compliance claims.

| Domain | Examples from briefing | Source-of-truth (must be pinned) | Proof artifact |
|---|---|---|---|
| Standards/specs | HL7 FHIR, TLS 1.3, W3C VC | Local mirrored docs or vendor-pinned references in `docs/sources/` | `docs.cite` IDs + version/date |
| Clinical guideline text | Choosing Wisely, prescribing guidance (eTG), imaging guidance | Licensed corpus adapter or approved excerpts; *do not assume open access* | Citation snippet + license note |
| Internal policies | “zero retention purge”, “no diagnosis” constraints | Repo-owned policy docs in `docs/grounding/` | Policy version hash + cite |

**Key rule**: If an output references a guideline (“not clinically indicated”), it must include a citation returned by the docs MCP server.

### Bucket B: Live Operational Data (real-time, audited)
**Purpose**: ensure the LLM never invents operational facts (IHI, codes, lab results, pharmacy hours, message delivery).

| Domain | Examples from briefing | Source-of-truth (must be selected) | Proof artifact |
|---|---|---|---|
| Identity/IHI | IHI lookup, consent locking | AU connector (stub until selected) behind `mcp-identity-au` | Request ID + upstream status + timestamp |
| EHR pulls/pushes | FHIR patient history, HL7/FHIR discharge summary | Chosen FHIR endpoint + auth method behind `mcp-fhir-broker` | Correlation ID + resource IDs |
| Terminology resolution | SNOMED/ICD lookups | Terminology server behind `mcp-terminology` | Lookup receipt (code+system+version) |
| Diagnostics ingestion | HL7 webhook listeners, result polling | Webhook receiver + parser behind `mcp-fhir-broker` / `mcp-investigations` | Event envelope + signature verification |
| Pharmacology checks | NTI/allergy/AKI risk | Vendor API behind `mcp-pharmacology` | Deterministic PASS/WARN/FAIL payload |
| Messaging + geo | SMS/email eRx token dispatch, open pharmacy matching | Selected providers behind `mcp-messaging-geo` | Delivery receipt + place lookup provenance |

**Key rule**: Any code, numeric result, pharmacy availability, or delivery claim must be backed by a live-data proof artifact (or explicit `mock_mode: true`).

### Bucket C: Structured Knowledge (curated, queryable datasets/graphs)
**Purpose**: provide machine-usable, versioned “registries” and mappings that cannot be safely improvised by an LLM.

| Dataset/Graph | Used by | Source-of-truth strategy | Proof artifact |
|---|---|---|---|
| ContextGraph (session) | all trunks | Session-scoped graph in `mcp-knowledge` | Graph revision ID + provenance |
| PatientKnowledgeGraph | trunks 2–9 | FHIR-derived baseline + curated overlays | Data lineage to FHIR pulls |
| “Benign registry” | trunk 7 gating | Curated list keyed by SNOMED (initially empty; schema + provenance required) | Dataset version + approver |
| Red-flag questionnaires | trunk 9 | Curated questionnaires keyed by SNOMED + references | Dataset version + citations |
| Axis B rule-out templates | trunks 5–7 | Condition→required negatives/tests mapping | Dataset version + citations |
| LOINC→semantic mappings | trunk 6 | Versioned mapping tables; unit normalization rules | Mapping version + checksum |
| Drug interaction/NTI sets | trunk 8 | Prefer vendor-backed structured output; if local, must be curated | Version + provenance |

**Key rule**: Structured knowledge must be returned as JSON with **dataset version** and **provenance**; never “free text”.

### Cross-bucket enforcement matrix (what is allowed to come from where)

| Claim type | Allowed bucket(s) | Forbidden bucket(s) |
|---|---|---|
| “This test is not indicated because Choosing Wisely says …” | Static Docs (+ citation) | Live Data, Uncited free-text |
| “Patient IHI is …” | Live Data | Static Docs, LLM generation |
| “SNOMED code for diagnosis is …” | Live Data (terminology lookup) or Structured Knowledge (terminology cache with proof) | LLM generation |
| “Red flag questions for SNOMED X are …” | Structured Knowledge (+ citations) | LLM generation |
| “Pharmacology check PASS/FAIL” | Live Data | LLM generation |

