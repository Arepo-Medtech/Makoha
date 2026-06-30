## MCP grounding stack (HeyDoc)

This directory defines the **grounding infrastructure** that converts the AI Doctor briefing from “conceptual” into **auditable, non-hallucinatory** integrations.

### Design principles
- **Trust boundaries**: Live operational systems are accessed only via MCP servers that emit **receipts** (request IDs, timestamps, upstream identity, mode).
- **No invented facts**: codes, guidelines, lab values, “open pharmacies”, and identity assertions must be returned by tools with proof artifacts.
- **Mock / dry-run support**: every server supports `mode: live | dry_run | mock` so development and evaluation can proceed without production connectivity.

### Server set (by boundary)

#### `docs` (Static Documentation)
**Purpose**: citeable retrieval for specs and guidelines.

- **Tools**
  - `docs.search({query, sources?, top_k?}) -> {results[]}`
  - `docs.get({source_id, locator}) -> {content, metadata}`
  - `docs.cite({source_id, locator, excerpt_max_chars?}) -> {citation_id, excerpt, metadata}`
- **Receipts**
  - `citation_id` is a stable ID used in EvidenceNodes (`supports.kind=static_doc`)
- **Modes**
  - `mock`: returns canned snippets for contract tests
  - `dry_run`: validates queries/locators without returning content (license safe)

#### `knowledge` (Structured Knowledge + graphs)
**Purpose**: ContextGraph + PatientKnowledgeGraph + curated registries.

- **Tools**
  - `kg.upsert({graph_kind, key, payload, mode}) -> {revision, receipt}`
  - `kg.query({graph_kind, query, mode}) -> {rows, receipt}`
  - `kg.provenance({graph_kind, key}) -> {lineage, receipt}`
  - `kg.export({graph_kind, key, format}) -> {artifact_ref, receipt}`
- **Schemas**
  - `ContextGraph` and `PatientKnowledgeGraph` must validate against `mcp/schemas/*.schema.json`

#### `identity-au` (AU identity + IHI)
**Purpose**: isolate AU identity workflows (IHI mapping) behind a deterministic interface.

- **Tools**
  - `identity.verify({method, payload, mode}) -> {verified, receipt, attributes_minimal}`
  - `identity.lookup_ihi({attributes_minimal, mode}) -> {ihi, receipt}`
  - `identity.log_consent({encounter_id, consent_hashes, mode}) -> {ledger_ref, receipt}`
- **Hard rules**
  - No plaintext demographics are allowed to persist beyond `lookup_ihi` boundary; only minimal attributes and receipts.

#### `terminology` (SNOMED CT / ICD-11)
**Purpose**: prevent code hallucination by requiring a lookup receipt.

- **Tools**
  - `terminology.lookup({system, query, mode}) -> TerminologyLookup` (see schema)
  - `terminology.map({from_system, to_system, code, mode}) -> {mappings[], receipt}`
  - `terminology.validate({system, code, mode}) -> {valid, display, version, receipt}`

#### `fhir-broker` (FHIR I/O + webhooks)
**Purpose**: read/write healthcare resources and receive results without LLM parsing.

- **Tools**
  - `fhir.read({resource_type, id, mode}) -> {resource, receipt}`
  - `fhir.search({resource_type, params, mode}) -> {bundle, receipt}`
  - `fhir.write({resource_type, resource, mode}) -> {result, receipt}`
  - `fhir.webhook.verify({event_envelope}) -> {verified, receipt}`
- **Hard rules**
  - Raw clinical numbers must not be interpreted by the LLM; if raw feeds exist, they go to a deterministic parser first.

#### `pharmacology` (Deterministic prescribing firewall)
**Purpose**: the LLM emits intent; the firewall decides PASS/WARN/FAIL with structured reasons.

- **Tools**
  - `pharm.intent({diagnosis_ref, intent, patient_facts_ref, mode}) -> {intent_id, receipt}`
  - `pharm.check({intent_id, mode}) -> {status, flags[], receipt}`
- **Hard rules**
  - Any `HARD_FAIL` must block autonomous continuation.

#### `messaging-geo` (Messaging + geolocation + pharmacy directory)
**Purpose**: keep delivery claims and “open pharmacy” assertions provable.

- **Tools**
  - `msg.send({channel, to, template_id, variables, mode}) -> {delivery_receipt, receipt}`
  - `geo.locate({signal, mode}) -> {coords, receipt}`
  - `pharmacy.search({coords, radius_km, open_now, mode}) -> {candidates[], receipt}`

### Verification hooks (required)
Outputs from the generation layer must be rejected if they contain:
- A SNOMED/ICD code without a `terminology.lookup` receipt
- A guideline claim without a `docs.cite` ID
- Any live operational assertion without a receipt (`request_id`, `timestamp_utc`, `upstream`, `mode`)

