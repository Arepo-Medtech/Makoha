# HeyDoc MCP Server Map

**Document ID:** `heydoc-grounding:mcp-server-map:2026-06`  
**Version:** 1.0.0  
**Last reviewed:** 2026-06-23  
**Citation ID:** `mcp-server-map:v1.0.0:2026-06`

Operational reference for all seven HeyDoc MCP servers. Defines tool interfaces, receipt ID conventions, stub versus live mode parameters, and the integration patterns connecting each server to the grounding pipeline. Retrieved by the docs MCP server when trunks or the retrieval layer need to ground server capability assertions.

All servers are currently in stub mode. `HEYDOC_MODE_DEFAULT=mock` is set in `mcp/mcpServers.template.json` for all servers. See the Gap Register (`gap-register:v1.0.0:2026-06`) for live-mode requirements and gaps.

---

## Receipt ID Conventions

Every MCP tool call returns a `receipt` object matching `mcp/schemas/receipt.schema.json`. Receipt `request_id` values follow this convention — prefix identifies the originating server at a glance in audit logs:

| Server | Request ID prefix | Example |
|---|---|---|
| `docs` | `doc-` | `doc-1719014400000-a3f7b2c` |
| `identity-au` | `id-` | `id-1719014400000-b4d8e1f` |
| `terminology` | `term-` | `term-1719014400000-c5e9f2g` |
| `knowledge` | `kg-` | `kg-1719014400000-d6f0a3h` |
| `fhir-broker` | `fhir-` | `fhir-1719014400000-e7a1b2c` |
| `pharmacology` | `pharmchk-` | `pharmchk-1719014400000-f8b2c3d` |
| `messaging-geo` | `msg-` | `msg-1719014400000-g9c3d4e` |

Format: `<prefix><epoch-ms>-<random-7-chars>`

---

## Server 1: `docs` — Static Documentation

**MCP key:** `docs`  
**Process:** `node mcp/servers/docs/index.js`  
**Upstream (stub):** `heydoc-mcp-docs`  
**Upstream (live):** pinned docs corpus at `HEYDOC_DOCS_DIR`  
**Implementation status:** ✓ **Implemented** (`mcp/servers/docs/index.js`)

### Purpose

Retrieve and cite static grounding documents — clinical guidelines, policy documents, and schema references. The docs server is the only authorised source for guideline citation IDs. Any trunk output that says "per Choosing Wisely..." must back that with a `citation_id` from this server.

### Tools

#### `docs_search`

Search the static documentation index.

```
Input:  { query: string, sources?: string[], top_k?: number (default 5), mode: "live"|"dry_run"|"mock" }
Output: { results: [{ source_id, locator, title, excerpt, citation_id, version }], receipt }
```

- `citation_id` format: `<source_id>:<locator>:<version>` (e.g., `cw-au:imaging-lbp:2024-01`)
- Mock snippets: `choosing-wisely-au` and `etg-licensing` in current stub
- Used by retrieval layer in `retrieveDocs(plan)` in `verification/retrieval-mcp.js`

#### `docs_get`

Retrieve full content for a known source and locator.

```
Input:  { source_id: string, locator: string, mode }
Output: { content: string, metadata: { version, date }, receipt }
```

#### `docs_cite`

Produce a citation artifact for use in `EvidenceNode.supports[].ref` with `kind: "static_doc"`.

```
Input:  { source_id: string, locator: string, excerpt_max_chars?: number (default 500), mode }
Output: { citation_id: string, excerpt: string, metadata, receipt }
```

- `citation_id` from this call is the value that goes into `EvidenceNode.supports[].ref`
- The `receipt` from this call is stored in `ContextPacket.receipts[]`

### ContextPacket integration

- `evidence[].supports[].kind` = `"static_doc"`
- `evidence[].supports[].ref` = `citation_id` from `docs_cite`
- `GroundingPlan.needs_static_docs` drives which topics are retrieved here

### Stub mock snippets (current)

| source_id | locator | citation_id |
|---|---|---|
| `choosing-wisely-au` | `section:imaging-lbp` | `cw-au:imaging-lbp:2024-01` |
| `etg-licensing` | `license` | `etg:license:current` |

**Grounding doc citation IDs** (these docs, once indexed):
| Document | citation_id |
|---|---|
| Gap Register | `gap-register:v1.0.0:2026-06` |
| Trunk Constraints | `trunk-constraints:v1.0.0:2026-06` |
| MCP Server Map (this doc) | `mcp-server-map:v1.0.0:2026-06` |
| Evaluation Guide | `evaluation-guide:v1.0.0:2026-06` |

### Live mode requirements

- `HEYDOC_DOCS_DIR` must point to a directory with indexed grounding documents
- `HEYDOC_DOCS_INDEX_DIR` must contain a semantic search index built over `HEYDOC_DOCS_DIR`
- Index must be rebuilt after any document update before live queries are valid

---

## Server 2: `knowledge` — Structured Knowledge Graph

**MCP key:** `knowledge`  
**Process:** `node mcp/servers/knowledge/dist/index.js`  
**Upstream (stub):** in-memory mock  
**Upstream (live):** PostgreSQL at `HEYDOC_KG_DB_URL` (`postgres://heydoc:heydoc@localhost:5432/heydoc`)  
**Implementation status:** ⚠ **Stub only** — `dist/index.js` not yet built; mock only

### Purpose

Query and update the two structured knowledge graphs:
- **ContextGraph** — session-scoped facts accumulated during the current encounter
- **PatientKnowledgeGraph** — patient-specific longitudinal facts derived from FHIR pulls and prior encounters

Also provides access to curated knowledge datasets: benign registry (Trunk 7.0), red-flag questionnaire bank (Trunk 9.0), Axis B templates (Trunk 5.0).

### Tools (defined; stub implementations pending)

#### `kg_query`

```
Input:  { graph_kind: "ContextGraph"|"PatientKnowledgeGraph"|dataset_name, query: string, mode }
Output: { rows: object[], receipt }
```

#### `kg_upsert`

```
Input:  { graph_kind: string, key: string, payload: object, mode }
Output: { revision: string, receipt }
```

#### `kg_provenance`

```
Input:  { graph_kind: string, key: string }
Output: { lineage: object, receipt }
```

#### `kg_export`

```
Input:  { graph_kind: string, key: string, format: "json"|"turtle" }
Output: { artifact_ref: string, receipt }
```

### ContextPacket integration

- `GroundingPlan.needs_structured_kg` drives which dataset names are queried here
- Dataset names: `"benign-registry"`, `"axis-b-templates"`, `"redflags-lbp"`, `"patient-baseline"`
- Receipts: `kg-` prefix; stored in `ContextPacket.receipts[]`

### Knowledge gaps (current)

| Dataset | Status | Required by |
|---|---|---|
| `benign-registry` | Not populated | Trunk 7.0 |
| `axis-b-templates` | Not populated | Trunk 5.0 |
| Red-flag questionnaire bank | Not populated | Trunk 9.0 |
| `patient-baseline` | Not seeded | All trunks requiring PMHx |

Until populated, any query returns empty rows and the trunk must return `blocked_no_<dataset>`.

---

## Server 3: `identity-au` — Australian Identity / IHI

**MCP key:** `identity-au`  
**Process:** `node mcp/servers/identity-au/index.js`  
**Upstream (stub):** `stub` (env `AU_IHI_PROVIDER=stub`)  
**Upstream (live):** AU HI Service via PRODA / mTLS  
**Implementation status:** ✓ **Implemented** (`mcp/servers/identity-au/index.js`)

### Purpose

Isolate all Australian patient identity operations behind a deterministic interface. Prevents the LLM from ever generating IHI values — identity facts must come from this server's receipt or be absent from the ContextPacket.

**Hard rule:** No plaintext patient demographics persist beyond `identity_lookup_ihi`. Only `receipt.request_id` and `attributes_minimal` persist in the session.

### Tools

#### `identity_verify`

```
Input:  { method: string, payload: object, mode }
Output: { verified: boolean, receipt, attributes_minimal: { ref, level } }
```

#### `identity_lookup_ihi`

```
Input:  { attributes_minimal: object, mode }
Output: { ihi: string, receipt }
```

- Mock IHI: `"8003600000000000"` (AU HI Service format — 16-digit string, starts with `800360`)
- Real IHI must come from AU HI Service with valid mTLS credentials
- The `receipt.request_id` from this call is what appears in `EvidenceNode.supports[].ref` with `kind: "live_data_receipt"`

#### `identity_log_consent`

```
Input:  { encounter_id: string, consent_hashes: string[], mode }
Output: { ledger_ref: string, receipt }
```

### ContextPacket integration

- `GroundingPlan.needs_live_calls` includes `"IHI"` when identity verification is required
- `evidence[].supports[].kind` = `"live_data_receipt"`
- `evidence[].supports[].ref` = `receipt.request_id` from `identity_lookup_ihi`
- The verifier's `no_invented_operations` check looks for IHI claims without a matching receipt

### Live mode requirements

- `AU_IHI_PROVIDER` → authenticated PRODA connector (production)
- `AU_IHI_ENDPOINT` → AU HI Service SOAP/REST endpoint
- `AU_IHI_MTLS_CERT_PATH` + `AU_IHI_MTLS_KEY_PATH` → mTLS certificates (device PKI)
- Legal basis documentation for IHI lookup must be on file before live mode

---

## Server 4: `terminology` — SNOMED CT / ICD-11

**MCP key:** `terminology`  
**Process:** `node mcp/servers/terminology/index.js`  
**Upstream (stub):** `stub` (env `TERMINOLOGY_UPSTREAM_NAME=stub`)  
**Upstream (live):** `SNOMED_ENDPOINT` / `ICD11_ENDPOINT`  
**Implementation status:** ✓ **Implemented** (`mcp/servers/terminology/index.js`)

### Purpose

Prevent code hallucination. Every SNOMED CT or ICD code that appears in trunk output must be backed by a lookup receipt from this server. The verifier's `no_invented_codes` check (severity=critical) enforces this.

### Tools

#### `terminology_lookup`

```
Input:  { system: "SNOMED_CT"|"ICD_11", query: { kind: "text"|"code", value: string }, mode }
Output: { request, response: { status: "hit"|"miss", concept: { system, code, display, version } }, receipt }
```

- Mock SNOMED code (text lookup): `"279039003"` (low back pain — returns regardless of query text)
- Mock ICD code: `"ME84.0"`
- Real lookups: NCTS Ontoserver (`https://r4.ontoserver.csiro.au/fhir`) for SNOMED CT AU Edition 20240301

#### `terminology_validate`

```
Input:  { system: "SNOMED_CT"|"ICD_11", code: string, mode }
Output: { valid: boolean, display: string, version: string, receipt }
```

#### `terminology_map`

```
Input:  { from_system, to_system: "SNOMED_CT"|"ICD_11", code: string, mode }
Output: { mappings: [{ code, display, score }], receipt }
```

### ContextPacket integration

- `GroundingPlan.needs_live_calls` includes `"terminology"` when codes must be validated
- `GroundingPlan.live_call_specs` typed form: `{ server: "terminology", tool: "terminology_lookup", query: { system: "SNOMED_CT", query: { kind: "text", value: "<symptom>" }, mode: "mock" } }`
- Receipt ref goes into `EvidenceNode.snomed_ref.receipt_id` AND `EvidenceNode.supports[].ref`
- Used by retrieval layer in `retrieveTerminology(plan)` in `verification/retrieval-mcp.js`

### Live mode requirements

- `SNOMED_ENDPOINT` → `https://r4.ontoserver.csiro.au/fhir` (NCTS Ontoserver)
- `ICD11_ENDPOINT` → WHO ICD-11 API (`https://id.who.int/icd/release/11/...`)
- SNOMED CT Australian Edition licence via NCTS required
- `TERMINOLOGY_UPSTREAM_NAME` → `"ncts-ontoserver"` or `"who-icd11-api"` in live mode

---

## Server 5: `fhir-broker` — FHIR Patient Record

**MCP key:** `fhir-broker`  
**Process:** `node mcp/servers/fhir-broker/dist/index.js`  
**Upstream (stub):** `stub` (env `FHIR_AUTH_MODE=stub`)  
**Upstream (live):** `FHIR_BASE_URL` with `SMART-on-FHIR` or mTLS auth  
**Implementation status:** ⚠ **Stub only** — `dist/index.js` not yet built

### Purpose

Retrieve patient record data from a FHIR R4 endpoint (EHR, MHR) and present it as sanitised facts for the ContextPacket. Raw numeric lab values must be sanitised by the deterministic investigation parser before entering `ContextPacket.facts[]`. The fhir-broker is never exposed directly to the LLM — only via the ContextPacket facts it produces.

### Tools (specified; not yet implemented)

#### `fhir_read`

```
Input:  { resource_type: string, id: string, mode }
Output: { resource: FHIRResource, receipt }
```

Resource types: 17 types listed in `GroundingPlan.needs_fhir_reads` enum (Patient, Condition, MedicationRequest, AllergyIntolerance, Observation, Procedure, Immunization, DiagnosticReport, FamilyMemberHistory, ClinicalImpression, CareTeam, CarePlan, Goal, Consent, RiskAssessment, Encounter, Composition).

#### `fhir_search`

```
Input:  { resource_type: string, params: object, mode }
Output: { bundle: FHIRBundle, receipt }
```

### ContextPacket integration

- `GroundingPlan.needs_fhir_reads` drives which FHIR resources are retrieved here
- Fetched resources go through the deterministic investigation parser (gap — not yet built)
- Sanitised output populates `ContextPacket.facts[]` with `category: "lab_result"` items
- `sanitised_by` on each fact must be `"mcp-fhir-broker-parser"` or `"deterministic-investigation-parser"`
- Raw numeric values must never appear in `ContextPacket.facts[].value` for `lab_result` category

### Live mode requirements

- `FHIR_BASE_URL` → EHR or MHR FHIR endpoint (e.g., `https://mhr.digitalhealth.gov.au/fhir/r4`)
- `FHIR_AUTH_MODE` → `"smart"` (SMART-on-FHIR OAuth2) or `"mtls"` (device mTLS)
- AU Core 0.3.0 profile conformance validation required before production
- Deterministic investigation parser must be built before Trunk 6.0 can operate with live data

---

## Server 6: `pharmacology` — Pharmacology Firewall

**MCP key:** `pharmacology`  
**Process:** `node mcp/servers/pharmacology/dist/index.js`  
**Upstream (stub):** `stub` (env `PHARM_VENDOR=stub`)  
**Upstream (live):** `PHARM_ENDPOINT` (e.g., MIMS-AU vendor API)  
**Implementation status:** ⚠ **Stub only** — `dist/index.js` not yet built

### Purpose

Deterministic pharmacology safety checking. The only server that may return dose guidance (PharmCheck output). Never the LLM. All drug interactions, NTI flags, allergy conflicts, renal adjustments, and Schedule 8 gating must come from this server's PharmCheck receipt — never from parametric LLM memory.

### Tools (specified; not yet implemented)

#### `pharm_intent`

Accepts a structured PharmIntent and assigns it an `intent_id`.

```
Input:  PharmIntent (see mcp/schemas/pharm-intent.schema.json)
Output: { intent_id: string, receipt }
```

- `intent_id` format: `pharm-<epoch-ms>-<random-7-chars>`
- The `intent_id` is passed to `pharm_check`

#### `pharm_check`

Runs deterministic safety checks against the PharmIntent and patient facts.

```
Input:  { intent_id: string, patient_facts_ref: object, mode }
Output: PharmCheck (see mcp/schemas/pharm-check.schema.json)
```

- `check_id` format: `pharmchk-<epoch-ms>-<random-7-chars>`
- `status` enum: `PASS | WARN | HARD_FAIL | BLOCKED_NO_PROOF`
- `HARD_FAIL` blocks pipeline continuation — verifier `hard_stop_enforcement` check confirms this
- `dose_guidance` only present when `status` is `PASS` or `WARN`
- `dose_guidance` is the only place in the entire HeyDoc schema set where specific dose values appear

### ContextPacket integration

- `GroundingPlan.needs_pharmacology_check = true` triggers this server
- `ContextPacket.pharm_check_receipt` stores the Receipt from `pharm_check`
- `ContextPacket.blocked = true` when `status: HARD_FAIL`
- `ContextPacket.block_reasons[]` populated from PharmCheck flags
- Trunk 8.0 output's `firewall_status` must match the PharmCheck `status` field
- `VerificationReport.hard_stops[]` populated when `HARD_FAIL` is detected in trunk output

### AU-specific requirements (live mode)

- SafeScript WA integration required for Schedule 8 PDMP checks
- S8 without documented PDMP check → `HARD_FAIL` regardless of other factors
- `PHARM_VENDOR` → contracted pharmacology database (MIMS-AU or equivalent)
- NTI drug list, allergy cross-reactivity engine, renal dosing tables must come from vendor, not from curated internal datasets

---

## Server 7: `messaging-geo` — Messaging and Geolocation

**MCP key:** `messaging-geo`  
**Process:** `node mcp/servers/messaging-geo/dist/index.js`  
**Upstream (stub):** `stub` for all three sub-services  
**Upstream (live):** `MSG_PROVIDER`, `GEO_PROVIDER`, `PHARMACY_DIRECTORY_PROVIDER`  
**Implementation status:** ⚠ **Stub only** — `dist/index.js` not yet built

### Purpose

Delivery of patient communications (SMS, email, in-app messages) and geolocation of nearby healthcare resources (pharmacies, emergency departments, urgent care centres). Provides the operational proof layer for any trunk output that claims a message was sent or a pharmacy is open.

### Tools (specified; not yet implemented)

#### `msg_send`

```
Input:  { channel: "sms"|"email"|"in_app", recipient: object, content: object, mode }
Output: { delivery_receipt: { message_id, timestamp, status }, receipt }
```

#### `geo_nearby`

```
Input:  { location: { lat, lng }, resource_type: "pharmacy"|"ed"|"gp"|"urgent_care", radius_km: number, mode }
Output: { results: [{ name, address, distance_km, open_now }], receipt }
```

#### `pharmacy_check`

```
Input:  { location: object, drug_name: string, mode }
Output: { pharmacies: [{ name, address, has_stock: boolean }], receipt }
```

### ContextPacket integration

- Any trunk claim that a message was "sent" or a pharmacy is "open" requires a `msg-` receipt
- `no_invented_operations` verifier check catches SMS/pharmacy claims without receipts
- Geolocation facts populate `ContextPacket.facts[]` with `category: "routing_signal"` items

### Live mode requirements

- `MSG_PROVIDER` → SMS vendor (Twilio, MessageBird, or AU Notify)
- `GEO_PROVIDER` → geocoding API (Google Maps, HERE, or Geoscape)
- `PHARMACY_DIRECTORY_PROVIDER` → AU pharmacy directory source (Guild, CHE, or SFE)
- Pharmacy directory data licensing terms must be confirmed before production

---

## Receipt Flow Through the Pipeline

```
Step 1 (Routing) → GroundingPlan.needs_live_calls = ["IHI", "terminology"]
                    GroundingPlan.needs_static_docs = ["Choosing Wisely"]
                    GroundingPlan.needs_pharmacology_check = false

Step 2 (Retrieval) → docs_search("Choosing Wisely")
                   → identity_lookup_ihi(attributes_minimal)
                   → terminology_lookup(SNOMED_CT, "low back pain")
                   All three return receipts

Step 3 (Injection) → ContextPacket.receipts[] = [doc-receipt, id-receipt, term-receipt]
                   → ContextPacket.evidence[] = [EvidenceNode per receipt]
                   → ContextPacket.facts[] = [demographic, symptom, ...]

Step 4 (Generation) → Trunk LLM generates output citing citation_id / request_id

Step 5 (Verification) → verifier.js checks:
                       citations = [doc-receipt.citation_id]
                       terminology_receipts = [term-receipt.request_id]
                       live_receipts = [id-receipt.request_id, term-receipt.request_id]
                       → no_invented_codes: pass (terminology receipt present)
                       → no_invented_guidelines: pass (citation present)
                       → no_invented_operations: pass (live receipts present)
```

---

## Environment Variable Quick Reference

| Server | Required env vars | Current value (stub) |
|---|---|---|
| `docs` | `HEYDOC_DOCS_DIR`, `HEYDOC_DOCS_INDEX_DIR` | `${workspaceFolder}/docs` |
| `knowledge` | `HEYDOC_KG_DB_URL` | `postgres://heydoc:heydoc@localhost:5432/heydoc` |
| `identity-au` | `AU_IHI_PROVIDER`, `AU_IHI_ENDPOINT`, `AU_IHI_MTLS_CERT_PATH`, `AU_IHI_MTLS_KEY_PATH` | `stub`, `https://example.invalid/ihi`, empty |
| `terminology` | `SNOMED_ENDPOINT`, `ICD11_ENDPOINT`, `TERMINOLOGY_UPSTREAM_NAME` | `https://example.invalid/snomed`, `https://example.invalid/icd11`, `stub` |
| `fhir-broker` | `FHIR_BASE_URL`, `FHIR_AUTH_MODE` | `https://example.invalid/fhir`, `stub` |
| `pharmacology` | `PHARM_VENDOR`, `PHARM_ENDPOINT` | `stub`, `https://example.invalid/pharm` |
| `messaging-geo` | `MSG_PROVIDER`, `GEO_PROVIDER`, `PHARMACY_DIRECTORY_PROVIDER` | all `stub` |

All servers also read `HEYDOC_MODE_DEFAULT` (default: `mock`). Set to `live` only when all vendor credentials are configured and tested.

---

*Citation ID: `mcp-server-map:v1.0.0:2026-06`. Retrieved by `docs_search` when trunks or retrieval layer need to ground server capability assertions. Pin this ID in EvidenceNode.supports[].ref when citing MCP server specifications.*
