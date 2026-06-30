# Server status — derived from gap-register + mcp-server-map

All seven servers default to `HEYDOC_MODE_DEFAULT=mock`. Status drives what you can safely build on. Update this file whenever a gap moves.

| Server | Status | Receipt prefix | Mock vs live | Live-mode prerequisites |
|---|---|---|---|---|
| `docs` | ✓ Implemented (stub) | `doc-` | Mock corpus (choosing-wisely-au, etg-licensing); the only authorised guideline-citation source | HEYDOC_DOCS_DIR populated + indexed; HEYDOC_DOCS_INDEX_DIR rebuilt after any doc update |
| `identity-au` | ✓ Implemented (stub) | `id-` | Stub IHI; isolates AU identity so the LLM never mints an IHI value | mTLS certs + AU HI Service via PRODA; documented legal basis for IHI lookup |
| `terminology` | ✓ Implemented (stub) | `term-` | Stub SNOMED/ICD/LOINC lookups | NCTS Ontoserver (or equiv); SNOMED CT AU Edition 20240301 licence via NCTS |
| `knowledge` | ◑ Implemented (mock) — live graph store pending | `kg-` | kg_query/kg_provenance serve 3 seeded DEV datasets (benign-registry, axis-b-templates, redflags-bank); ContextGraph/PatientKG return empty (no store); kg_upsert/export SAFE_STUB. Datasets DEV/SYNTHETIC-ONLY. | PostgreSQL at HEYDOC_KG_DB_URL; clinically signed-off datasets; graph write path |
| `fhir-broker` | ◑ Implemented (mock) — live EHR pending | `fhir-` | fhir_read/fhir_search return templated AU Core resources; lab Observations flow through the investigation parser (raw never to LLM); fhir_write SAFE_STUB | FHIR_BASE_URL; SMART-on-FHIR or mTLS; AU Core 0.3.0/AUCDI R3 conformance validator; MHR consent |
| `pharmacology` | ◑ Implemented (mock core) — live vendor + firewall wiring pending | `pharmchk-` | Deterministic 5-check engine (allergy x-react, DDI, renal, AU scheduling, S8 PDMP) on MOCK data; dose guidance ONLY here; HARD_FAIL terminal; paediatric→flag no dose. Not yet wired behind Trunk 8.0. | Vendor (MIMS-AU or equiv): NTI, allergy x-react, DDI, renal dosing, AU scheduling; SafeScript WA for S8 PDMP. **Must NOT be patient-facing until a live vendor is connected and validated.** |
| `messaging-geo` | ◑ Implemented (mock) — live providers pending | `msg-`/`geo-` | geo_locate/pharmacy_search mock; msg_send SAFE_STUB (NEVER sends, recipient redacted, not patient-facing) | SMS/email vendor; geocoding API; licensed AU pharmacy directory; msg_send only behind the Clinician Verification Portal |

## Downstream effects of the unbuilt/unpopulated servers
- **knowledge mock built + datasets seeded (DEV)** → Trunks 5.0/7.0/9.0 now receive curated dev content via kg_query (structured_dataset evidence); content needs clinical sign-off before live. Graph queries still return empty (no store).
- **pharmacology mock core built + Trunk 8.0 firewall wired** → HARD_FAIL blocks continuation with no override (receipt-backed); only a live vendor connection remains before patient-ready.
- **fhir-broker mock built + parser wired** → Trunk 6.0 receives sanitised lab facts from mock fhir Observations (raw values never reach the LLM); a LIVE EHR source + conformance validation remain before patient-ready.
- **All 7 MCP servers now have a mock implementation** (docs, identity-au, terminology stubs; knowledge, pharmacology, fhir-broker, messaging-geo mock cores). Remaining work is live connections + the non-server blockers (Clinician Portal, persistence).

## Allowed Service Registry
Only these seven server names may appear in trunk output. Any other internal name triggers a `no_repo_invention` verifier failure (severity: warning). Register any new service in the gap register before it may be referenced.
