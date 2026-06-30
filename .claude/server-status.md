# Server status — derived from gap-register + mcp-server-map

All seven servers default to `HEYDOC_MODE_DEFAULT=mock`. Status drives what you can safely build on. Update this file whenever a gap moves.

| Server | Status | Receipt prefix | Mock vs live | Live-mode prerequisites |
|---|---|---|---|---|
| `docs` | ✓ Implemented (stub) | `doc-` | Mock corpus (choosing-wisely-au, etg-licensing); the only authorised guideline-citation source | HEYDOC_DOCS_DIR populated + indexed; HEYDOC_DOCS_INDEX_DIR rebuilt after any doc update |
| `identity-au` | ✓ Implemented (stub) | `id-` | Stub IHI; isolates AU identity so the LLM never mints an IHI value | mTLS certs + AU HI Service via PRODA; documented legal basis for IHI lookup |
| `terminology` | ✓ Implemented (stub) | `term-` | Stub SNOMED/ICD/LOINC lookups | NCTS Ontoserver (or equiv); SNOMED CT AU Edition 20240301 licence via NCTS |
| `knowledge` | ⚠ Stub only — `dist/index.js` not built | `kg-` | ContextGraph/PatientKG queries; benign registry, axis-b-templates, redflags bank all UNPOPULATED | PostgreSQL at HEYDOC_KG_DB_URL; populate the three datasets |
| `fhir-broker` | ✗ Not built | `fhir-` | — | FHIR_BASE_URL; SMART-on-FHIR or mTLS; AU Core 0.3.0 conformance; deterministic investigation parser (also not built) |
| `pharmacology` | ◑ Implemented (mock core) — live vendor + firewall wiring pending | `pharmchk-` | Deterministic 5-check engine (allergy x-react, DDI, renal, AU scheduling, S8 PDMP) on MOCK data; dose guidance ONLY here; HARD_FAIL terminal; paediatric→flag no dose. Not yet wired behind Trunk 8.0. | Vendor (MIMS-AU or equiv): NTI, allergy x-react, DDI, renal dosing, AU scheduling; SafeScript WA for S8 PDMP. **Must NOT be patient-facing until a live vendor is connected and validated.** |
| `messaging-geo` | ✗ Not built | `msg-` | — | SMS/email vendor; geocoding API; licensed AU pharmacy directory provider |

## Downstream effects of the unbuilt/unpopulated servers
- **knowledge unpopulated** → Trunk 5.0 returns `blocked_no_templates`, Trunk 7.0 benign-gate degrades, Trunk 9.0 returns `blocked_no_questionnaire_data`. Degrades safely; never fabricates.
- **pharmacology mock core built + Trunk 8.0 firewall wired** → HARD_FAIL blocks continuation with no override (receipt-backed); only a live vendor connection remains before patient-ready.
- **fhir-broker not built + no investigation parser** → no live data may enter Trunk 6.0 safely.

## Allowed Service Registry
Only these seven server names may appear in trunk output. Any other internal name triggers a `no_repo_invention` verifier failure (severity: warning). Register any new service in the gap register before it may be referenced.
