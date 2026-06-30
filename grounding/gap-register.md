## Grounding Gap Register (AI Doctor briefing → buildable reality)

This register enumerates **every referenced repository/service/API/standard/data source** implied by the briefing and flags where the text is **ungrounded** (hallucinated internal repos, missing endpoints, missing licensing, missing data provenance).

### Legend
- **Status**
  - **Hallucinated_internal**: named as an internal repo/service but not grounded in any real repo/API.
  - **Real_but_unpinned**: real standard/vendor/guideline exists, but the briefing does not specify the concrete endpoint/dataset/license/version needed.
  - **Potentially_out_of_scope**: real thing, but likely mismatched for AU deployment unless explicitly justified.
- **Bucket**: Static_Docs | Live_Data | Structured_Knowledge

### 1) Internal repos/services (briefing-invented names)
These appear as “required repositories” but have **no grounding artifacts** (no code, no interfaces, no schemas, no deployment target). Treat them as **to-be-created modules** inside `heydoc/` or mapped to real services you already operate.

| Name | Status | Bucket | What’s missing (grounding) | Make it real via |
|---|---|---:|---|---|
| `core-agent-orchestrator` | Hallucinated_internal | Live_Data | Orchestration contracts, state machine spec, event bus choice | Orchestrator service + MCP routing contracts |
| `shell-matrix-agent` | Hallucinated_internal | Live_Data | LLM runtime, latency SLOs, UI/websocket protocol | Frontend agent adapter; MCP “context packet” injection |
| `deep-library-agent` | Hallucinated_internal | Live_Data | Async job queue, webhook contract to shell | Background worker + queue + MCP callback tool |
| `triage-state-machine` | Hallucinated_internal | Structured_Knowledge | Deterministic triad definitions, thresholds, auditability | Rules engine + versioned rule sets |
| `bayesian-inference-engine` / `neuro-symbolic-bayesian-engine` | Hallucinated_internal | Structured_Knowledge | LR tables, prevalence priors, math implementation | Deterministic calculator module + provenance |
| `diagnostic-gating-service` | Hallucinated_internal | Structured_Knowledge | Green/Amber/Red policy, benign registry source | Policy module + benign registry dataset |
| `clinical-knowledge-graph` / `graph-db-manager` | Hallucinated_internal | Structured_Knowledge | Graph schema, provenance, ingestion pipelines | `mcp-knowledge` + db migrations |
| `deterministic-investigation-parser` | Hallucinated_internal | Live_Data | HL7 ingestion, LOINC translation, delta-check rules | Parser service + contract tests + schemas |
| `hl7-fhir-broker` | Hallucinated_internal | Live_Data | FHIR base URLs, auth (SMART-on-FHIR/mTLS), webhook security | `mcp-fhir-broker` + connector selection |
| `identity-gateway` | Hallucinated_internal | Live_Data | AU HI/IHI lookup process, auth requirements, audit | `mcp-identity-au` with stub+contract tests |
| `medicolegal-audit-ledger` | Hallucinated_internal | Structured_Knowledge | What is hashed, canonicalization, storage backend | Audit service + WORM storage policy |
| `pharmacological-firewall` / `deterministic-pharmacology-firewall` | Hallucinated_internal | Live_Data | Vendor choice, API contract, NTI sets, renal dosing | `mcp-pharmacology` with strict PASS/FAIL schema |
| `discharge-monitoring-loop` | Hallucinated_internal | Live_Data | Timer engine, PROM forms, red-flag question bank | Orchestrator timers + PROM dataset + MCP docs/kg |
| `patient-client-app` | Hallucinated_internal | Live_Data | UI flows, auth capture, consent UX, chat transport | Web/mobile app + secure storage |
| `clinician-verification-portal` | Hallucinated_internal | Live_Data | Human-in-loop queue UX, escalation workflow, audit | Portal app + queue + evidence viewer |
| `clinical-evals-suite` | Hallucinated_internal | Static_Docs | Vignette dataset, metrics, CI harness | Eval harness + test vectors + CI pipeline |
| `mlops-weights-registry` | Hallucinated_internal | Structured_Knowledge | Model provenance, versioning, access control | Artifact registry (S3/MLflow/etc.) |
| `nlp-snomed-extractor` / `nlp-clinical-extraction` | Hallucinated_internal | Live_Data | Model choice, training data, evaluation | NLP component with citations + tests |
| `geolocation-pharmacy-api` / `mcp-messaging-geo` | Hallucinated_internal | Live_Data | Pharmacy directory source, open-hours data | Vendor integration + caching + ToS compliance |
| `infrastructure-iac` | Hallucinated_internal | Static_Docs | Cloud target (AWS vs GCP), network topology | IaC repo/module pinned to chosen cloud |

### 2) External standards/specs (real but unpinned)

| Entity | Status | Bucket | What’s missing (grounding) | Risks if left implicit |
|---|---|---:|---|---|
| HL7 FHIR | Real_but_unpinned | Static_Docs + Live_Data | Which profiles, AU constraints, connector to real EHR/MHR | “FHIR” becomes a hand-wavy placeholder; interoperability fails |
| AU IHI | Real_but_unpinned | Live_Data | Which service provides IHI lookup, auth/mTLS, legal basis | Identity workflows become fictional; cannot ship |
| SNOMED CT | Real_but_unpinned | Structured_Knowledge | Terminology server choice, licensing, subsets | LLM may hallucinate codes; medicolegal failure |
| ICD-11 | Real_but_unpinned | Structured_Knowledge | Source endpoint/dataset, mapping strategy from SNOMED | Coding becomes untraceable/incorrect |
| LOINC | Real_but_unpinned | Structured_Knowledge | Mapping tables source, version, license | Parser cannot be deterministic; wrong units/interpretation |
| W3C Verifiable Credentials | Real_but_unpinned | Static_Docs + Live_Data | Concrete wallet ecosystem + verifier libraries | “ZKP payload” is undefined; easy to hallucinate verification |
| TLS 1.3 | Real_but_unpinned | Static_Docs | Where enforced (ingress, service mesh), cipher policy | Security requirements not testable |
| Keccak-256 / hashing | Real_but_unpinned | Structured_Knowledge | What data is hashed, canonical form, signatures | Hashes won’t prove anything in court/audit |

### 3) Vendor APIs (real, but licensing + APIs not specified)

| Vendor/API | Status | Bucket | What’s missing | Notes |
|---|---|---:|---|---|
| MIMS | Real_but_unpinned | Live_Data | API access method, pricing, AU regulatory position | Often content licensing; confirm API availability |
| Lexicomp | Real_but_unpinned | Live_Data | API access, AU appropriateness | May be mismatched for AU workflows |
| OCR + liveness detection | Real_but_unpinned | Live_Data | Provider choice, SDKs, accuracy thresholds, privacy | “95% confidence” needs vendor-calibrated meaning |
| SMS/email dispatch | Real_but_unpinned | Live_Data | Provider choice, audit logging, deliverability | Must be deterministic + logged |
| Geolocation + pharmacy directory | Real_but_unpinned | Live_Data | Directory source, open-hours truth, ToS | “24-hour pharmacy” claims must be provable |

### 4) Guidelines/calculators (high-risk for hallucination unless pinned)

| Guideline/Calculator | Status | Bucket | What’s missing | AU concern |
|---|---|---:|---|---|
| AusCVDRisk | Real_but_unpinned | Structured_Knowledge | Deterministic implementation or official API; version pin | Likely the AU-first baseline |
| AHA PREVENT | Potentially_out_of_scope | Structured_Knowledge | Justification for AU use; input definitions | US-focused model; treat as optional unless mandated |
| Choosing Wisely | Real_but_unpinned | Static_Docs | Which region corpus, machine-readable extraction | Needs citations for “hard refusal” |
| Therapeutic Guidelines (eTG) | Real_but_unpinned | Static_Docs | Licensing and retrieval constraints | Likely licensed; plan for a “licensed corpus adapter” |

### 5) Structured clinical content assumed but not provided

| Content | Status | Bucket | What’s missing | Needed for which trunks |
|---|---|---:|---|---|
| “Universally Benign/Self-Limiting registry” | Hallucinated_internal | Structured_Knowledge | Definition + source + versioning | Trunk 7 gating |
| Red-flag questionnaires keyed by SNOMED | Hallucinated_internal | Structured_Knowledge | Question banks + provenance | Trunk 9 |
| “Axis B must-rule-out templates” | Hallucinated_internal | Structured_Knowledge | Condition→required negations/tests mapping | Trunks 5–7 |
| NTI drug list + interaction rules | Real_but_unpinned | Structured_Knowledge | Source (vendor/official), version pin | Trunk 8 firewall |

### Immediate grounding actions (what we will build in-repo)
1. **Static docs index**: a local index + citation IDs for every guideline/spec used to justify “hard refusal” or red-flag logic.\n
2. **Structured knowledge layer**: versioned JSON datasets (initially empty placeholders with schema + provenance) for benign registry, red-flag questionnaires, and Axis B templates.\n
3. **Live-data MCP “firewalls”**: MCP servers that encapsulate real APIs (or stubs with contract tests) so the LLM cannot invent codes/results.\n

