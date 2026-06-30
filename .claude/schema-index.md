# Schema index — derived from `mcp/schemas/` and `data/schemas/`

One line per schema: what it contracts · producer · consumer. Open the schema file itself before editing any contract it defines.

## Pipeline contracts — `mcp/schemas/`

| Schema | Contracts | Produced by | Consumed by |
|---|---|---|---|
| `grounding-plan.schema.json` | Routing plan: needs_static_docs / needs_live_calls / needs_structured_kg (zod-gated: pipeline-schemas.js) | Step 1 Routing | Step 2 Retrieval |
| `mcp-tool-envelope.schema.json` | Common envelope wrapping every MCP tool request/response | All servers (Step 2) | Retrieval layer |
| `receipt.schema.json` | Live-call proof: request_id, timestamp_utc, upstream, mode (prefix per server) | Every MCP tool call (Step 2) | Step 3 packet · Step 5 verifier · EvidenceNode |
| `evidence-node.schema.json` | Links a critical fact to its proof via supports[].ref (citation_id / receipt) | Step 3 Context injection | Trunks (Step 4) · Step 5 evidence_tree |
| `context-packet.schema.json` | Bounded packet the trunk LLM sees: facts, evidence, constraints[], receipts[]; sanitised_by (zod-gated: pipeline-schemas.js) | Step 3 Context injection | Step 4 Generation (the ONLY thing the trunk LLM sees) |
| `context-graph.schema.json` | Session-scoped ContextGraph (revision + receipts) | knowledge server / session state | Step 0 inputs · knowledge queries |
| `patient-knowledge-graph.schema.json` | Patient baseline KG (revision + receipts) | knowledge server | Step 0 inputs |
| `terminology-lookup.schema.json` | SNOMED CT / ICD-10-AM / LOINC lookup result + receipt | terminology server (Step 2) | Trunk 6.0 (LOINC), 7.0 (code lock), 9.0 (SNOMED keying) |
| `pharm-intent.schema.json` | PharmIntent: drug identity, class, route (NO dose values) | Trunk 8.0 | pharmacology server pharm.check |
| `pharm-check.schema.json` | PharmCheck result: PASS/WARN/HARD_FAIL, dose guidance, interactions, scheduling, PDMP | pharmacology server | Trunk 8.0 firewall gate |
| `verification-report.schema.json` | Machine-readable pass/fail, reasons, missing receipts, candidate_output_hash (SHA-256, required) | Step 5 Verification (zod-gated: report-schema.js) | Audit/medicolegal record · release gate |
| `audit-ledger-entry.schema.json` | Append-only hash-chained ledger record: anchor hash + run metadata + pass + check booleans + receipt metadata (NO PHI) | Step 5 writers via audit-store.js (medicolegal-audit-ledger) | verify:rehash · medicolegal audit retrieval |

## Case store — `data/schemas/`

Two-store split by access control. **Presentation = the AI Doctor may read. Scoring = the AI Doctor must NEVER read** (a scoring-store leak invalidates the entire evaluation).

| Schema | Store | AI Doctor access | Contents |
|---|---|---|---|
| `00_case_envelope.schema.json` | Presentation | may read | Case identity/metadata; ID pattern `SPEC-{SPECIALTY}-{DIFFICULTY}-{seq}` |
| `01_presentation_layer.schema.json` | Presentation | may read | Patient's voice, no diagnostic spoilers |
| `02_conversational_policy.schema.json` | Presentation | may read | 7-level disclosure-gate taxonomy for history-taking |
| `10_ground_truth_node.schema.json` | Scoring | **NEVER** | Ground truth + differential staging (leading → important_not_to_miss → excluded) |
| `11_symptom_links_node.schema.json` | Scoring | **NEVER** | Symptom-to-diagnosis evidence graph |
| `12_management_plan_node.schema.json` | Scoring | **NEVER** | Gold-standard management (must_recommend / should_NOT_recommend / acceptable_alternative) |
| `13_safety_netting_node.schema.json` | Scoring | **NEVER** | Safety-netting tiers T0 (self-care) → T5 (call 000) |
