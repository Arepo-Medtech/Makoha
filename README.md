# HeyDoc — AI Doctor Grounding Infrastructure

**Repository:** `Arepo-Medtech/Makoha`  
**Build date:** 2026-06-23  
**Schema version:** 1.0.0  
**Digital Tablet version:** 1.0 (FHIR R4 4.0.1 · SNOMED CT AU 20240301 · ICD-10-AM 12th Ed · AU Core 0.3.0)

HeyDoc is the grounding, verification, and evaluation infrastructure for an AI Doctor — a telehealth chat agent that takes patient history, narrows differentials, and produces management plans. This repo contains everything except the LLM itself: schemas, MCP server stubs, grounding pipeline, trunk system prompts, and the synthetic patient case set used to evaluate clinical performance.

---

## Architecture in 30 seconds

```
Patient message
    │
    ▼
Step 1 · Routing (GroundingPlan)
    │   Determines which MCP servers must be called before generation
    ▼
Step 2 · Retrieval (MCP tool calls)
    │   docs · knowledge · identity-au · terminology · fhir-broker · pharmacology · messaging-geo
    │   Every call returns a Receipt (request_id + timestamp + upstream + mode)
    ▼
Step 3 · Context Injection (ContextPacket)
    │   Bounded packet of sanitised facts + evidence nodes + constraints + receipts
    │   The trunk LLM sees ONLY this — never raw patient data or parametric memory
    ▼
Step 4 · Generation (Trunk LLM, 1.0–9.0)
    │   9 specialised trunks: intake, triage, history enrichment, problem representation,
    │   Axis B rule-out, investigation interpretation, code lock-in, pharmacology firewall,
    │   red-flag questionnaire
    ▼
Step 5 · Verification (VerificationReport)
        5 hard checks: no invented codes · no invented guidelines · no invented operations ·
        no repo invention · HARD_FAIL enforcement
        pass=false → output rejected · HARD_FAIL → pipeline blocked
```

**Key invariants:**
- No SNOMED/ICD code without a `mcp-terminology` lookup receipt
- No dosages from the LLM — doses come only from `mcp-pharmacology` PharmCheck output
- No raw lab values in LLM context — sanitised form only
- All clinical claims traceable to an EvidenceNode → Receipt → MCP tool call

---

## Repository layout

```
heydoc/
├── README.md                          ← you are here
│
├── mcp/
│   ├── mcpServers.template.json       ← all 7 server configs (all stub/mock)
│   ├── schemas/                       ← MCP grounding schemas (7 new files this build)
│   │   ├── receipt.schema.json        ← proof artifact from every MCP call
│   │   ├── evidence-node.schema.json  ← claim + supports + provenance
│   │   ├── grounding-plan.schema.json ← Step 1 router output
│   │   ├── context-packet.schema.json ← Step 3 injection bundle
│   │   ├── verification-report.schema.json ← Step 5 audit output
│   │   ├── pharm-intent.schema.json   ← pharmacology intent (no doses)
│   │   ├── pharm-check.schema.json    ← firewall result (only place doses exist)
│   │   └── [pre-existing schemas]
│   └── servers/
│       ├── docs/index.js              ← implemented · stub mode
│       ├── identity-au/index.js       ← implemented · stub mode
│       ├── terminology/index.js       ← implemented · stub mode
│       └── [knowledge|fhir-broker|pharmacology|messaging-geo] ← stubs pending
│
├── data/
│   ├── schemas/                       ← synthetic patient case schemas (7 files)
│   │   ├── 00_case_envelope.schema.json
│   │   ├── 01_presentation_layer.schema.json   ← PRESENTATION STORE
│   │   ├── 02_conversational_policy.schema.json ← PRESENTATION STORE
│   │   ├── 10_ground_truth_node.schema.json    ← SCORING STORE (access-controlled)
│   │   ├── 11_symptom_links_node.schema.json   ← SCORING STORE
│   │   ├── 12_management_plan_node.schema.json ← SCORING STORE
│   │   └── 13_safety_netting_node.schema.json  ← SCORING STORE
│   └── cases/
│       └── SPEC-CARD-04-00001/        ← first synthetic case (atypical NSTEMI)
│           ├── 00_case_envelope.json
│           ├── 01_presentation_layer.json
│           ├── 02_conversational_policy.json
│           ├── 10_ground_truth_node.json       ← clinician reviewed ✓
│           ├── 11_symptom_links_node.json
│           ├── 12_management_plan_node.json
│           └── 13_safety_netting_node.json
│
├── docs/
│   └── grounding/                     ← static docs served by docs MCP server
│       ├── gap-register.md            ← canonical gap/status register
│       ├── trunk-constraints.md       ← per-trunk clinical constraints
│       ├── mcp-server-map.md          ← server capabilities + receipt patterns
│       └── evaluation-guide.md        ← scoring methodology
│
├── trunk/
│   ├── prompts/                       ← system prompts for all 9 trunks
│   └── trunk-*.js                     ← stub agents
│
├── integration/
│   └── trunk-pipeline.js             ← runTrunkWithGrounding()
│
├── verification/
│   ├── pipeline.js                   ← 5-step grounding pipeline
│   ├── verifier.js                   ← 5 hard verification checks
│   ├── retrieval-mcp.js              ← live MCP retrieval (docs, identity, terminology)
│   └── run.js                        ← standalone verification runner
│
├── grounding/                        ← legacy gap register (pre-build)
└── architecture/                     ← architecture diagrams
```

---

## What was built in this session

**23 new files** across 6 build waves, integrated into the repo above.

### Wave 1–2: MCP grounding schemas (`mcp/schemas/`)

| File | Purpose |
|---|---|
| `receipt.schema.json` | Proof artifact returned by every MCP tool call |
| `evidence-node.schema.json` | Extended with `fhir_path` and `snomed_ref` fields |
| `grounding-plan.schema.json` | Step 1 router output — backwards-compatible with `pipeline.js` |
| `context-packet.schema.json` | Step 3 injection bundle with typed `facts[]` and safety constraints |
| `verification-report.schema.json` | Step 5 audit output with severity grading and `candidate_output_hash` |
| `pharm-intent.schema.json` | Pharmacology intent — no dose fields by design (structural constraint) |
| `pharm-check.schema.json` | Firewall result — the **only** schema where doses appear |

### Wave 3–4: Synthetic case schemas (`data/schemas/`)

Two-store architecture:
- **Presentation store** (files 01–02): what the AI Doctor sees — patient voice, no diagnostic spoilers, selective disclosure via 7-level gate taxonomy
- **Scoring store** (files 10–13): what the scorer sees — full ground truth, symptom graph, gold-standard management, safety-netting tiers T0–T5

Key design:
- 7-level `disclosure_gate` enum drives history-taking quality scoring
- Differential `position` enum (`leading` → `important_not_to_miss` → `excluded`) tracks diagnostic reasoning evolution across 5 consultation stages
- Management `necessity` enum (`must_recommend` / `should_NOT_recommend` / `acceptable_alternative`) enables commission error scoring
- Safety-netting tier T0–T5 with asymmetric scoring: under-triage weighted 3× over-triage; T5 case assigned T3 = auto-fail

### Wave 5: Grounding documents (`docs/grounding/`)

Four static documents served by the `docs` MCP server. All carry stable citation IDs for EvidenceNode reference:

| File | Citation ID |
|---|---|
| `gap-register.md` | `gap-register:v1.0.0:2026-06` |
| `trunk-constraints.md` | `trunk-constraints:v1.0.0:2026-06` |
| `mcp-server-map.md` | `mcp-server-map:v1.0.0:2026-06` |
| `evaluation-guide.md` | `evaluation-guide:v1.0.0:2026-06` |

### Wave 6: First synthetic case (`data/cases/SPEC-CARD-04-00001/`)

**SPEC-CARD-04-00001** — Atypical NSTEMI in a diabetic female. Difficulty: `atypical_presentation_high_risk`. Diagnosis category: `important_not_to_miss`.

Clinical scenario: 58F, primary school teacher, T2DM + hypercholesterolaemia, presents via telehealth with "indigestion feeling" — actually an NSTEMI with jaw radiation, dyspnoea, diaphoresis, and exertional onset all gated behind specific directed questioning. Correct management: call 000, aspirin 300mg chewed, do not self-transport. Common AI failure: prescribe PPI and tell her she can go to school.

Intentional test features: anchoring bias · premature closure · availability bias · framing effect · visceral bias (atypical ACS in diabetic female systematically under-recognised). Clinician reviewed: ✓

---

## Quick start — run the verification pipeline

```bash
npm install
node verification/run.js
# Writes verification/report.json and verification/evidence_tree.md
```

**With live MCP retrieval (docs + identity + terminology):**
```bash
HEYDOC_USE_MCP=1 node verification/run.js
```

**Run a specific trunk:**
```bash
node trunk/trunk-8.0-stub-agent.js
```

All servers default to `HEYDOC_MODE_DEFAULT=mock`. No vendor credentials required for stub mode.

---

## MCP server status

| Server | Tools | Status |
|---|---|---|
| `docs` | `docs_search`, `docs_cite`, `docs_get` | ✅ Implemented |
| `identity-au` | `identity_verify`, `identity_lookup_ihi`, `identity_log_consent` | ✅ Implemented |
| `terminology` | `terminology_lookup`, `terminology_validate`, `terminology_map` | ✅ Implemented |
| `knowledge` | `kg_query`, `kg_upsert`, `kg_provenance` | ⚠ Stub pending |
| `fhir-broker` | `fhir_read`, `fhir_search` | ⚠ Stub pending |
| `pharmacology` | `pharm_intent`, `pharm_check` | ⚠ Stub pending — **do not use patient-facing** |
| `messaging-geo` | `msg_send`, `geo_nearby`, `pharmacy_check` | ⚠ Stub pending |

Full server map: `docs/grounding/mcp-server-map.md`  
Gap register and production requirements: `docs/grounding/gap-register.md`

---

## Building the case set

The schema set supports a full evaluation repository. To add new cases:

1. Pick a `case_id`: `SPEC-{SPECIALTY}-{DIFFICULTY}-{seq}` — e.g. `SPEC-RESP-02-00001`
2. Create `data/cases/{case_id}/` directory
3. Populate files 00–02 (presentation store) and 10–13 (scoring store) against the schemas in `data/schemas/`
4. Set `clinician_reviewed: true` only after a human clinician has verified the ground truth
5. Aim for distribution: 60% `common`, 30% `important_not_to_miss`, 10% `zebra_rare`; minimum 45 cases for a statistically meaningful evaluation run

Evaluation methodology: `docs/grounding/evaluation-guide.md`

Scoring weights: history-taking 25% · diagnostic reasoning 25% · management quality 30% · safety-netting 15% · communication 5%. Case pass threshold: ≥ 0.70. Case-set pass: ≥ 80% pass + 0 critical under-triage + ≥ 90% verification compliance.

---

## Key constants (locked across all schemas)

```
mode enum:          live | dry_run | mock
server enum (7):    docs · knowledge · identity-au · terminology · fhir-broker · pharmacology · messaging-geo
trunk_id enum:      1.0 – 9.0
case_id pattern:    ^SPEC-[A-Z]{2,6}-0[1-7]-[0-9]{5}$
icd10am pattern:    ^[A-Z][0-9]{2}(\.[0-9]+)?$
schema_version:     1.0.0 (const)
pipeline_version:   1.0.0 (const)
Safety tiers:       T0 (self-care) → T5 (call 000 ambulance)
SNOMED edition:     SNOMED CT Australian Edition 20240301
FHIR version:       R4 (4.0.1)
AU Core:            0.3.0
ICD-10-AM:          12th Edition
Digital Tablet:     v1.0
```

---

## Jurisdiction and medicolegal posture

**Australian healthcare context only.** All guideline references are AU-aligned (eTG, NHFA/CSANZ, RACGP, Choosing Wisely Australia). SafeScript WA referenced for S8 controlled substance gating.

HeyDoc is clinical decision support, not a licensed medical practitioner. All outputs require human clinician review before clinical action. The Clinician Verification Portal (gap — not yet built) is required before any output is patient-facing. See `docs/grounding/gap-register.md` §7 for full medicolegal posture.

---

## Pre-existing repo content

The following was in the repo before this build session and remains unchanged:

- `architecture/` — grounding pipeline diagrams and trust boundary specs
- `grounding/` — legacy gap register and data-buckets map (superseded by `docs/grounding/` versions)
- `mcp/servers/` — 3 implemented MCP servers (docs, identity-au, terminology)
- `trunk/` — all 9 trunk system prompts and stub agents
- `verification/` — full 5-step grounding pipeline and verifier
- `integration/trunk-pipeline.js` — `runTrunkWithGrounding()` orchestration
- `test/` — contract tests for implemented MCP servers
- `package.json` + `package-lock.json` — Node.js dependencies

---

*For questions on schema design, architecture, infrastructure, clinical content, or the evaluation framework — contact KL (Director, HeyDoc). 
