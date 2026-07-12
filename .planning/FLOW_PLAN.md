# FLOW_PLAN.md — Breath-Ezy · External Build-Element Harvest & Integration Blueprint

> **⛳ EXECUTED — historical blueprint (status reconciliation 2026-07-13).** Milestones H0–H7 all merged (PRs #24–#32) substantially as written. Deviations recorded in the registers, not here: **#18 evidence-graded deferred-on-licence** (never wrapped; licence gate refuses it), **#20 gzxiong/MedRAG flipped ADOPT → REFERENCE-only** (MIRAGE gate built first-party clean-room), **evidence-cms not built** (US-only, deprioritised), PrimeKG/graph optional path not pursued. Current state: `docs/grounding/completeness-register.md` + `integration-register.md`.

> **Read this first, every session, before writing any code** — together with `.planning/ARCH_PLAN.md`.
> Principal Integration Architect blueprint for harvesting maintained open-source healthcare-AI
> components into `kenleefreo/breath-ezy`. It plugs into the Build-Elements Register (Input R) and is
> keyed by the register's `Ref`.
> **Authority order:** live repo > repo digest (Input S) > ARCH_PLAN > Build-Elements Register (Input R)
> > Complete Reference Parts A–C (Input C, = *aspirations, not architecture*).
> **Model split (operator override):** reasoning/hard-logic/integration-judgement steps → Fable 5;
> mechanical scaffolding/wrapping → Opus 4.8.
> **Scope:** engineering + integration only. Nothing patient-facing ships. Every harvested capability
> routes through the builder-owned governance layer before it could reach a patient.
> Version: 1.0.0 · Generated 2026-07-06 · Complements ARCH_PLAN 1.0.0 (does not supersede it).

---

## §0 — How to use this document

This is an execution-ready integration plan. It has nine parts (6.1–6.9). The **Integration Register
(6.2)** is the spine — one row per external element, keyed by the register's `Ref`, pasteable back into
Input R as added columns. The **Adoption Sequence (steps 1→7)** orders the work; **governance (step 7) is
cross-cutting** — the clinician-verification gate and audit trail (ARCH_PLAN C9/C5) must exist before any
harvested capability is wired to a patient-facing path. The **FMEA (6.6)** predicts integration failure;
the **roadmap (6.7)** sequences it; the **per-step directives (6.8)** are what Claude Code runs.

**Relationship to ARCH_PLAN.** ARCH_PLAN governs the *internal* build (M0–M14): the deterministic safety
core, the sequencer, the portal gate, session-store. FLOW_PLAN governs *external harvest* (H-milestones).
Where they touch the same file, **ARCH_PLAN's RETAIN/REFINE verdict wins** and FLOW_PLAN integrates behind
the existing contract. FLOW_PLAN never rewrites a RETAIN component; it wraps live backends behind the
zod-gated contracts ARCH_PLAN froze.

**Risk notation:** `L×I`, L = likelihood (1 rare … 5 near-certain), I = impact (1 cosmetic … 5
patient-harm / medicolegal / licence-contamination). Band: Critical ≥ 16, High 9–15, Medium 4–8, Low ≤ 3.

---

## §1 — The invariant floor (never weakened by any integration)

Survives the fresh-eyes reset; it is the Complete Reference *ethos* (BREATH), not Part D mechanism.
**No harvested element weakens any of these. If an integration conflicts, the integration is invalid.**

- **Augmented, not autonomous.** No integration causes the system to diagnose, prescribe, or finalise
  care autonomously. Every clinically consequential decision remains a registered human's.
- **Evidence-verified trust — benchmarked before trusted.** Any patient- or clinician-facing claim traces
  to an appropriate evidence base; every harvested retrieval/answer path passes the benchmark harness
  (Adoption step 3 / MIRAGE) before it is trusted. "It runs" is not "it is safe to show."
- **Dose source is singular.** Drug-interaction / paediatric data from harvested evidence servers (#15,
  #14) is advisory context only. Doses come from exactly one place — the pharmacology firewall's
  deterministic PharmCheck (ARCH_PLAN C2). No harvested tool may become a dose source.
- **No fabricated codes/facts/service-names.** Harvested code/terminology output remains bound to a
  terminology receipt; the verifier's five mechanical checks (ARCH_PLAN C1) apply unchanged to any
  harvested-server output. Adopted server names enter the Allowed Service Registry explicitly or are
  rejected.
- **Patient-owned, minimised data.** The longitudinal record is the patient's; identifiers/demographics
  are minimised and never persist beyond lawful basis + session consent (ARCH_PLAN C8 session-store is
  the enforcement point every new data source crosses).
- **No raw labs to the LLM.** Any harvested record/observation source routes through the investigation
  parser (ARCH_PLAN C3) before injection. Raw numbers never reach a trunk.
- **Governance is ours to build, and it is a release blocker.** No repository supplies the
  clinician-verification gate, the audit trail, or regulatory sign-off. Every adopted element that could
  touch a patient path routes through the governance layer (ARCH_PLAN C9 portal gate + C5 audit ledger)
  before it does. Nothing reaches a patient without the human-in-the-loop checkpoint.
- **Australian context.** AU Core 0.3.0, SNOMED CT-AU, My Health Record, PBS/AMT, SafeScript. US-centric
  assets are localisation templates, not connectors to ship as-is.
- **Licence floor.** No unresolved-licence dependency enters a shippable path. AGPL-3.0 (open-health) is a
  network-copyleft commercial decision — architectural reference until an explicit owner ruling.

**Self-verification (6.9) confirms none of the above is weakened anywhere in this plan.**

---

## 6.1 — Reconciled objective & scope

**What this harvest adds.** It replaces self-built mocks with maintained, tested components and adds three
capabilities the current build lacks: real evidence retrieval, a benchmark that makes trust measurable,
and a synthetic-case factory at volume. It does not rebuild the deterministic safety core — that is
ARCH_PLAN's RETAIN set and stays frozen.

**The three integrations that most change the product.**
1. **Evidence-tap layer** (#1, #14, #15, #18) — turns the empty `docs`/`knowledge` stubs into real
   PubMed/FDA/guideline/graded-evidence retrieval. This is the substance behind "evidence-verified trust."
2. **MIRAGE benchmark harness** (#20) — the mechanism that makes "verified" defensible. Highest leverage:
   it gates every harvested retrieval path before a patient could see its output. Without it, the evidence
   layer is an unmeasured claim.
3. **Synthetic case factory** (Synthea + synthea-AT + chatty-notes) — fixes the skewed 52-case set with
   clinician-informed AU-Core FHIR at volume, feeding ARCH_PLAN's M6 eval gate.

**Input disagreements (surfaced, not silently resolved):**
- **D-1 (C vs R): reasoning topology.** Input C fixes a nine-trunk spine; Input R invites adopting a
  maintained topology (octochains #5, Multi-Agent-Medical-Assistant #3). **Recommendation:** retain the
  trunk spine + verifier (tested, ARCH_PLAN RETAIN); lift octochains' parallel-expert *conflict-audit*
  pattern into the verifier/sequencer as a trust mechanism. Do not fork a new orchestrator. Rationale:
  the trunks are tested and verifier-aligned; a new orchestrator is churn for marginal gain and re-opens
  the safety-core surface. **Owner confirmation required before any topology code.**
- **D-2 (R vs S): open-health as fork base.** Register floats it as a fork base; it is AGPL-3.0. **Rec:**
  architectural reference only until an explicit owner AGPL ruling. Default = pattern-lift, no code.
- **D-3 (C vs R): scope of "patient-owned record."** Input C's (AU)PAIR is a full longitudinal portal;
  the harvest can only supply the *ingestion + sources* layer (Fasten Sources, wso2). **Rec:** harvest the
  record-spine plumbing; the patient-facing portal remains gated behind governance (ARCH_PLAN C9) and is
  not opened by this plan.

**Vision cross-check (register category/priority vs source sheets):** the register's A–H categories and
7-step Adoption Sequence match the source `.xlsx` exactly (verified: 40 rows, seq 1–7 + future/opt/—).
No drift defect. One note: the register lists both `gzxiong/MedRAG` and `SNOWTEAM2023/MedRAG` — kept
distinct here (disambiguation gate §4.3).

*Scope guard:* nothing patient-facing ships. Reject any integration whose developer complexity or patient
friction is out of proportion to patient benefit (§1 fresh-eyes guardrail). Specific rejections recorded
in 6.2 (DROP/DEFER rows) with rationale.

---

## 6.2 — Build-Elements Integration Register (the plug-in artifact)

Keyed by register `Ref`; extends the source schema with execution columns. Pasteable back into Input R.
Ordered by Adoption-Sequence step (1→7), then future/optional. Verdicts changed from the register carry a
`⇧`/`⇩` and a justification.

### Step 1 — Patient-record spine

| Ref | Repo | Reg verdict | YOUR verdict | Mode | Target module | Overrides/integrates | Licence | Security/sandbox | Governance mapping | Effort | Seq | Risk | Downstream note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 16 | wso2/fhir-mcp-server | ADOPT | ADOPT | WRAP | `mcp/servers/fhir-broker/` | integrates: live backend behind existing contract; mock = rollback | Confirm (usu. Apache-2.0) | SMART-on-FHIR/OAuth2 behind own auth; read-only | read path; record read gated by C8+C9 | M | 1 | 2×4=8 | AU MHR connector separate build |
| 13 | open-health | REFERENCE/fork | REFERENCE (hold) | PATTERN-LIFT | `portal/patient-ingest/` (pattern) | pattern only; no code | AGPL-3.0 CONFIRMED | n/a | patient-facing; pre-governance closed | L | 1 | 2×3=6 | Owner AGPL ruling gates reuse |
| dir | fastenhealth Sources | REFERENCE | ⇧ ADOPT (Sources lib) | WRAP | `integration/record-sources/` | integrates: per-provider SMART-on-FHIR client | app GPL-3.0 (ref); **Sources+gofhir-models Apache-2.0** | OAuth2 behind own auth | ingest→sanitiser→session-store | M | 1 | 2×4=8 | AU provider metadata = new build |
| 6 | StanfordBDHG/HealthGPT | REFERENCE | REFERENCE | PATTERN-LIFT | `portal/` app-shell | pattern if iOS-first | Confirm (usu. MIT) | on-device | wearable→sanitiser; gated | L | 1 | 1×3=3 | Product call, not forced |

### Step 2 — Evidence taps + trust gate

| Ref | Repo | Reg verdict | YOUR verdict | Mode | Target module | Overrides/integrates | Licence | Security/sandbox | Governance mapping | Effort | Seq | Risk | Downstream note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | anthropics/healthcare | ADOPT | ADOPT | WRAP | `mcp/servers/docs/` + `evidence-cms/` | overrides docs stub; real CMS/NPI/PubMed+FHIR-dev | first-party | own auth; least-priv | retrieval→Receipt; verifier-checked | M | 2 | 1×4=4 | US CMS less AU-relevant |
| 14 | Cicatriiz/healthcare-mcp-public | ADOPT | ADOPT | WRAP | `mcp/servers/evidence-fda-pubmed/` | overrides empty knowledge datasets | MIT | own auth; rate-limited | fact→Receipt→verifier 1/2; MIRAGE-gated | M | 2 | 2×4=8 | Pairs with #15 |
| 15 | JamesANZ/medical-mcp | ADOPT | ADOPT | WRAP | `mcp/servers/evidence-drug-guideline/` | adds drug-interaction/paediatric/guideline | MIT | own auth | advisory only; NEVER a dose source | M | 2 | 3×4=12 | HARD: no dose leak; firewall unchanged |
| 18 | connerlambden/bgpt-mcp | ADOPT (wrap) | ADOPT (wrap) | WRAP | `mcp/servers/evidence-graded/` | graded full-text w/ quality scores | Confirm | hosted svc; own auth; egress-scoped | grade→EvidenceNode.supports; MIRAGE-gated | M | 2 | 3×4=12 | Wrap not own; needs fallback |
| 8 | Aperivue/medsci-skills | REFERENCE | ⇧ ADOPT (detectors) | PATTERN-LIFT | `verification/integrity-detectors/` | strengthens verifier w/ ~30 deterministic checks | MIT | deterministic | machine-decided gates → verifier | M | 2 | 2×3=6 | Lift approach; no runtime dep |
| 9 | 2023Anita/clinical-ai-agent-skills | REFERENCE | REFERENCE (spec) | PATTERN-LIFT | `docs/grounding/guardrail-spec.md` | evidence-first rulebook as spec | Confirm | none | codifies rules | S | 2 | 1×2=2 | Thin; rules only |

### Step 3 — Prove it (benchmark)

| Ref | Repo | Reg verdict | YOUR verdict | Mode | Target module | Overrides/integrates | Licence | Security/sandbox | Governance mapping | Effort | Seq | Risk | Downstream note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20 | gzxiong/MedRAG (MIRAGE) | BENCHMARK/adopt | ADOPT (harness) | BENCHMARK | `benchmark/mirage/` | new: eval harness for every retrieval path | Confirm | offline eval; synthetic QA | **the trust gate**: no retrieval path patient-facing until it passes | L | 3 | 1×5=5 (of relying) | DISTINCT from SNOWTEAM2023/MedRAG |
| 21 | asanmateu/medgraph-ai | REFERENCE | REFERENCE | PATTERN-LIFT | `mcp/servers/knowledge/graph/` (pattern) | graph-RAG reasoning pattern | Confirm | n/a | if adopted, MIRAGE-gated | M | 3 | 2×3=6 | Pattern, not dep (Med maturity) |
| org | mims-harvard/PrimeKG | ADOPT (KG) | ADOPT (substrate) | WRAP | `mcp/servers/knowledge/primekg/` | KG substrate vs build-from-scratch | MIT | offline data load | KG facts→EvidenceNode; MIRAGE-gated | L | 3 | 2×3=6 | Sibling OptimusKG optional |
| comp | SNOWTEAM2023/MedRAG | REFERENCE (disambig) | REFERENCE | PATTERN-LIFT | (reading only) | alt relational reference | Confirm | n/a | n/a | S | 3 | 1×2=2 | NOT #20 |

### Step 4 — Case factory

| Ref | Repo | Reg verdict | YOUR verdict | Mode | Target module | Overrides/integrates | Licence | Security/sandbox | Governance mapping | Effort | Seq | Risk | Downstream note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dir | synthetichealth/synthea | ADOPT | ADOPT | WRAP | `case-factory/synthea/` | new: synthetic patient generator → data/cases | Apache-2.0 | offline; synthetic only | synthetic-only; never real patient | M | 4 | 1×3=3 | Feeds ARCH_PLAN M6 eval |
| fork | FHOOEAIST/synthea-AT | REFERENCE (AU tmpl) | ⇧ ADOPT (template) | FORK | `case-factory/synthea-au/` | AU-Core-profile localisation of Synthea + AuditEvent | Apache-2.0 (fork) | offline | synthetic; AU Core 0.3.0 | L | 4 | 3×3=9 | Fork to localise AT→AU |
| sib | synthetichealth/chatty-notes | ADOPT | ADOPT | WRAP | `case-factory/narratives/` | note narratives from Synthea bundles | Apache-2.0 | offline | synthetic | S | 4 | 1×2=2 | Re-balances difficulty dist |

### Step 5 — Capability expansion

| Ref | Repo | Reg verdict | YOUR verdict | Mode | Target module | Overrides/integrates | Licence | Security/sandbox | Governance mapping | Effort | Seq | Risk | Downstream note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 28 | mims-harvard/ToolUniverse | ADOPT (behind auth) | ADOPT | WRAP | `mcp/servers/tooluniverse-gateway/` | new: 600–1000+ tools via AITIP; compact-mode | **Apache-2.0 CONFIRMED** | **v1.3.0 RCE-patched; NEVER expose code-executor; own auth; sandbox; egress allow-list** | every tool output→Receipt; MIRAGE-gated where retrieval; executor disabled | L | 5 | 3×5=15 | Highest leverage + highest security surface |
| comp | mims-harvard/TxAgent | REFERENCE/reserve | DEFER | DEFER | (reserve) | therapeutic reasoning on ToolUniverse | Confirm | inherits TU sandbox | Rx-Remedy scope; deferred | — | 5 | n/a | Hold until dispensing matures |
| org | mims-harvard/MedLog | REFERENCE (audit) | REFERENCE | PATTERN-LIFT | `verification/audit-store.js` (pattern) | event-level clinical-AI logging pattern | Confirm | n/a | strengthens C5 audit ledger | M | 5 | 1×3=3 | Study before WORM (ARCH M8) |

### Step 6 — Reasoning topology (pick ONE; owner-gated — see D-1)

| Ref | Repo | Reg verdict | YOUR verdict | Mode | Target module | Overrides/integrates | Licence | Security/sandbox | Governance mapping | Effort | Seq | Risk | Downstream note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | ahmadvh/octochains | REFERENCE | REFERENCE (lift pattern) | PATTERN-LIFT | `verification/conflict-audit.js` | parallel-expert conflict-check pattern into verifier | Confirm | zero-dep prototype | consensus/conflict surfacing = trust mech | M | 6 | 2×3=6 | Lift pattern; keep trunk spine |
| 3 | souvikmajumder26/Multi-Agent-Medical-Assistant | REFERENCE | REFERENCE | PATTERN-LIFT | (design ref) | sequential topology w/ HITL wired | Confirm | n/a | HITL reference for C9 | M | 6 | 2×3=6 | Design ref, not drop-in |
| 2 | Azure-Samples/healthcare-agent-orchestrator | REFERENCE | REFERENCE | PATTERN-LIFT | (design ref) | multi-specialist coordination | Confirm (usu. MIT) | n/a | n/a | S | 6 | 1×2=2 | MS-stack coupling; pattern only |
| 4 | The-Swarm-Corporation/MedicalCoderSwarm | REFERENCE-ONLY | REFERENCE-ONLY | PATTERN-LIFT | (shape ref) | diagnosis→coding pipeline shape | Confirm | n/a | n/a | S | 6 | 1×3=3 | Demo-grade; do NOT adopt as dep |

### Step 7 — Governance (cross-cutting; builder-owned — no repo supplies this)

| Ref | Repo | Reg verdict | YOUR verdict | Mode | Target module | Overrides/integrates | Licence | Security/sandbox | Governance mapping | Effort | Seq | Risk | Downstream note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| — | (builder-owned) | — | BUILD | — | `portal/verification-gate.js` (ARCH_PLAN C9/M5) | the HITL release gate every harvested path routes through | n/a | server-side gate | **the gate itself** | L | 7 | 4×5=20→1×5 built | ARCH_PLAN owns; FLOW_PLAN maps every element to it |
| org | mims-harvard/MedLog | REFERENCE | REFERENCE | PATTERN-LIFT | `verification/audit-store.js` | audit-log pattern | Confirm | n/a | audit trail (C5) | M | 7 | 1×3=3 | See step 5 |

### Future / optional / dropped

| Ref | Repo | Reg verdict | YOUR verdict | Mode | Rationale |
|---|---|---|---|---|---|
| 23 | sunlabuiuc/PyHealth | ADOPT (future) | DEFER | DEFER | Predictive modelling on the record; new patient-facing capability — defer until record spine live + governance built. MIT. |
| 22 | Project-MONAI/MONAI | ADOPT (future) | DEFER | DEFER | Imaging DL; adopt only if/when imaging becomes a pillar. Apache-2.0. |
| 19 | fulcradynamics/fulcra-context-mcp | REFERENCE (dep risk) | DEFER | DEFER | Commercial backend = vendor lock-in; prefer open wearable ingest (#13/#6 pattern). |
| 11 | ajhcs/healthcare-agents | REFERENCE (US-admin) | REFERENCE | PATTERN-LIFT | US 42 CFR/CMS-specific; read for revenue-cycle structure only (Rx-Remedy). |
| comp | ajhcs/healthcare-data-mcp | REFERENCE | REFERENCE | PATTERN-LIFT | Investor/market analytics, not clinical. Low priority. |
| dir | cTAKES | REFERENCE (NLP) | REFERENCE | PATTERN-LIFT | Clinical NLP for record enrichment; **re-verify live** (directory-listed only). Apache-2.0. |
| dir | Hermes (SNOMED) | REFERENCE/adopt | REFERENCE | PATTERN-LIFT | SNOMED terminology server; **re-verify live**; relevant to SNOMED-AU grounding. |
| dir | Tidepool | REFERENCE (cond.) | DEFER | DEFER | Only if diabetes/CGM vertical pursued. Verify before relying. |
| 25 | kakoni/awesome-healthcare | REFERENCE (dir) | REFERENCE | — | Reading map. CC0. |
| 26 | medtorch/awesome-healthcare-ai | REFERENCE (dir) | REFERENCE | — | Reading map for future extensions. CC0. |
| 17 | sunanhe/awesome-medical-mcp-servers | REFERENCE (dir) | REFERENCE | — | MCP-server discovery. |
| 10 | Rajathbharadwaj/voice-agent | FLAG | DROP | DROP | Unverified. Source voice from ElevenLabs / Web Speech API instead. |
| 7 | tmc/DoctorGPT | FLAG | DROP | DROP | Inactive fork. Use upstream (llSourcell/Doctor-Dignity) *idea* only. |
| 12 | cittaverse | SKIP/park | DROP | DROP | Early-stage (0–3★). Narrative-quality scoring parked. |
| 24 | taskade/taskade | SKIP | DROP | DROP | No clinical utility. |
| 27 | nowork-studio/awesome-ai-startups | SKIP | DROP | DROP | No clinical value. |

**Verdict changes recorded (against `Ref`):** #dir-Fasten ⇧ADOPT (Sources lib only, Apache-2.0 portion);
#8 ⇧ADOPT (detector patterns into verifier); #fork synthea-AT ⇧ADOPT (localisation template). All other
changes are DEFER/DROP downgrades of already-cautious rows with rationale above. No REFERENCE row was
upgraded to a runtime dependency where the licence was unresolved.

---

## 6.3 — Target architecture & module map

Clean-sheet topology for harvested capabilities. `[NEW]` new · `[INT]` integrates-with-existing ·
`[OVR]` overrides-existing (behind the existing contract). Stack unchanged (Node 20 ESM + zod) except
where a harvested component's native stack is named and justified.

```
kenleefreo/breath-ezy/
├─ .planning/
│  ├─ ARCH_PLAN.md                          [=] internal build (authority on RETAIN core)
│  └─ FLOW_PLAN.md                          [NEW] THIS FILE — harvest/integration
├─ integration/
│  └─ record-sources/                       [NEW] Fasten Sources SMART-on-FHIR client lib (Apache-2.0 portion)
│     ├─ sources-client.js                  [NEW] per-provider OAuth2/SMART-on-FHIR client (wraps Fasten Sources)
│     └─ au-providers/                       [NEW] AU My Health Record provider metadata (built, not harvested)
├─ mcp/servers/
│  ├─ fhir-broker/                          [OVR] wso2/fhir-mcp-server as live backend behind existing contract (#16)
│  ├─ docs/                                 [OVR] anthropics/healthcare PubMed/FHIR-dev (#1) replaces canned citations
│  ├─ evidence-cms/                         [NEW] anthropics/healthcare CMS/NPI (#1) — US, lower AU priority
│  ├─ evidence-fda-pubmed/                  [NEW] Cicatriiz #14 (MIT) — FDA/PubMed/ClinicalTrials/ICD-10
│  ├─ evidence-drug-guideline/              [NEW] JamesANZ #15 (MIT) — drug-interaction/paediatric/guideline (ADVISORY)
│  ├─ evidence-graded/                      [NEW] bgpt-mcp #18 — graded full-text w/ quality scores (wrap hosted svc)
│  ├─ knowledge/
│  │  ├─ primekg/                           [INT] PrimeKG (MIT) KG substrate (#org) behind existing kg_query contract
│  │  └─ graph/                             [INT] medgraph-ai graph-RAG pattern (#21) — pattern, gated behind MIRAGE
│  └─ tooluniverse-gateway/                 [NEW] ToolUniverse (Apache-2.0, #28) — compact-mode; EXECUTOR DISABLED; own auth
├─ verification/
│  ├─ verifier.js                           [=] RETAIN (ARCH_PLAN C1) — harvested output checked, verifier unchanged
│  ├─ integrity-detectors/                  [NEW] medsci-skills detector patterns (#8, MIT) — machine-decided gates
│  ├─ conflict-audit.js                     [NEW] octochains conflict-check pattern (#5) — owner-gated (D-1)
│  ├─ investigation-parser.js               [=] RETAIN (C3) — every harvested observation source crosses this
│  └─ audit-store.js                        [INT] MedLog event-logging pattern (#org) informs C5 WORM (ARCH M8)
├─ benchmark/
│  └─ mirage/                               [NEW] gzxiong/MedRAG MIRAGE harness (#20) — THE trust gate for retrieval
│     ├─ run-mirage.js                      [NEW] eval runner; CI-blocking for any retrieval path
│     └─ corpora/                           [NEW] synthetic QA sets (no patient data)
├─ case-factory/                            [NEW] synthetic case generation (offline, synthetic-only)
│  ├─ synthea/                              [NEW] Synthea (Apache-2.0) generator
│  ├─ synthea-au/                           [FORK] synthea-AT fork localised to AU Core 0.3.0 + AuditEvent
│  └─ narratives/                           [NEW] chatty-notes narrative generator
├─ portal/                                  [=] ARCH_PLAN C9 — governance gate; every harvested path routes here
│  ├─ verification-gate.js                  [=] the HITL release gate (ARCH M5)
│  └─ patient-ingest/                       [NEW/pattern] open-health ingest PATTERN only (#13) — AGPL, no code until ruling
├─ docs/grounding/
│  ├─ guardrail-spec.md                     [NEW] 2023Anita rulebook (#9) as written spec
│  └─ integration-register.md              [NEW] 6.2 kept in sync as elements land
└─ test/
   ├─ contract-fhir-live.js                 [NEW] wso2 backend behind existing fhir contract
   ├─ contract-evidence-*.js               [NEW] one per evidence server; Receipt-emission asserted
   ├─ contract-tooluniverse-gateway.js      [NEW] executor-disabled assertion; auth-required
   └─ bench-mirage-gate.js                  [NEW] retrieval path fails CI if MIRAGE score below threshold
```

**Stack justifications for new elements.** wso2 (Python) and Synthea (Java) run as *separate processes
behind MCP/CLI boundaries*, not in-process — no Node stack contamination. ToolUniverse (Python) runs as a
gateway process with the code-executor disabled. PrimeKG loads as offline data into the knowledge server.
No new in-process runtime dependency enters the Node core without a Phase-2 gate.

---

## 6.4 — State-management & data rules

Per harvested data path: what persists, how long, under what consent, what must never persist, and the
sanitisation/minimisation boundary crossed.

- **Record ingestion (Fasten Sources #dir, wso2 #16).** Provider records enter via SMART-on-FHIR client →
  **investigation parser (C3)** for any observation/lab → **session-store (C8)**: encounter-scoped
  lifetime, destroyed on close. **Persists:** encounter-scoped references + receipts. **Never persists:**
  plaintext demographics beyond the identity boundary; raw lab numbers (parser strips them); any record
  past the session's lawful basis + consent. **Boundary crossed:** identity-au + investigation parser +
  session-store, in that order, before any trunk sees anything.
- **Wearable/CGM signals (HealthGPT #6 pattern; fulcra #19 deferred).** If adopted: on-device/edge
  sanitisation → banded qualitative values only (parser), never raw streams into LLM context.
  **Never persists:** continuous raw signal; only session-scoped derived facts. fulcra deferred to avoid a
  commercial-backend persistence dependency.
- **Evidence retrieval (#1, #14, #15, #18, ToolUniverse #28).** Retrieved evidence is **not patient data**
  — it is public/graded literature. **Persists:** the Receipt (request_id, ts, upstream, mode) + the
  EvidenceNode grade in the ledger (metadata only, PHI-free, C5). **Never persists:** the query bound to
  patient identity in any external call (no PII in URL/query — §Privacy). **Boundary:** every returned
  fact becomes an EvidenceNode.support with a receipt; unbenchmarked paths are blocked from patient use.
- **Synthetic-case generation (Synthea #dir, synthea-au #fork, chatty-notes #sib).** **Synthetic only.**
  Generated FHIR/narratives persist in `data/cases/` as the eval corpus. **Never:** a real patient record
  enters the case factory; `persistContent` refuses non-synthetic (C5 invariant). **Boundary:** the
  cases:ingest field-scoped firewall + the live context-injection allow-list (ARCH_PLAN C7) — scoring
  nodes 10–13 remain sealed; generated cases carry the same two-store firewall.
- **Benchmark corpora (MIRAGE #20).** Synthetic QA only; no patient data. Persists as versioned eval sets;
  results recorded to CI. Never contains PHI.

---

## 6.5 — Interface & schema contracts

Stated as contracts. Every ADOPT/WRAP element emits the common Receipt (ARCH_PLAN §3.5.1) so the
evidence-verified-trust invariant holds. Mock-vs-live via the mode-normaliser (ARCH_PLAN C16): harvested
servers default `mode:mock` in dev, blocked as mock in staging/production until validated.

**Common receipt (unchanged from ARCH_PLAN):**
```
Receipt := { request_id:str(≥8), timestamp_utc:ISO8601, upstream:str(≥1),
             mode:'live'|'dry_run'|'mock', tool?, server?, latency_ms?, correlation_id?, error? }
```

**#16 wso2/fhir-mcp-server (WRAP → fhir-broker live backend).**
- Envelope: existing `fhir_read`/`fhir_search`/`fhir_validate` (unchanged contract).
- Input: FHIR resource ref + query; Output: AU-Core-validated resource → investigation parser for any
  Observation. Emits Receipt(mode). **Live requires:** OAuth2/SMART-on-FHIR creds via secrets manager;
  AU Core 0.3.0 binding. **Mock:** existing templated resources (rollback).
- Contract test `contract-fhir-live.js`: resource passes existing structural validate; raw lab number
  never exits without parser; Receipt emitted.

**#14 Cicatriiz / #15 JamesANZ / #1 anthropics/healthcare / #18 bgpt-mcp (WRAP → evidence servers).**
- Envelope: `evidence_search(query, filters) → { results[], receipt }`; each result →
  `EvidenceNode{ id, claim, supports[≥1]{kind:'literature'|'graded_evidence', ref, grade?, excerpt?},
  provenance{verification{status}} }`.
- **HARD boundary (#15):** drug-interaction/paediatric output carries `advisory:true` and is
  **structurally barred from becoming a dose**; the verifier's check 5 + pharmacology firewall (C2) remain
  the only dose path. Contract test asserts no interaction result can populate a dose field.
- Emits Receipt(mode); **not trusted for patient use until MIRAGE-passed** (benchmark gate below).
- Mock: canned literature receipts; Live requires: API keys via secrets manager; egress allow-list.
- Contract tests `contract-evidence-{fda-pubmed,drug-guideline,graded,cms}.js`: Receipt emitted; result →
  EvidenceNode conformant; #15 advisory-flag + no-dose assertion.

**#20 gzxiong/MedRAG MIRAGE (BENCHMARK harness).**
- Envelope: `runMirage(retrievalPath, corpus) → { path, score, per_question[], passed:boolean }`.
- Contract: a retrieval path is `patient_eligible:false` until `passed:true` at/above the agreed
  threshold. `bench-mirage-gate.js` is a **blocking CI job**. Output recorded to ledger metadata.
- Mock: synthetic corpus subset; Live: full MIRAGE 7,663-QA set (offline).

**#28 ToolUniverse (WRAP → gateway, compact-mode).**
- Envelope: AITIP `execute_tool(name, args) → { result, receipt }` via compact-mode (≤5 exposed core
  tools; full library via execute_tool). **`python_code_executor` DISABLED at config** (RCE surface).
- **Security contract:** runs behind Breath-Ezy auth; egress allow-list; least-privilege; no code
  execution. `contract-tooluniverse-gateway.js`: asserts executor unreachable, auth required, egress
  bounded. Emits Receipt; retrieval-type tools MIRAGE-gated.
- Mock: static tool responses; Live: API keys via secrets manager, sandbox verified.

**#dir Synthea / #fork synthea-au / #sib chatty-notes (WRAP/FORK → case factory).**
- Envelope: `generate(module, n, profile:'au-core-0.3.0') → FHIR bundles + narratives`.
- Contract: output validates against AU Core 0.3.0 SDs; carries the two-store schema + field-scoped
  firewall (C7); `synthetic:true` always; `persistContent` refuses non-synthetic. Feeds ARCH_PLAN M6 eval.
- `contract-case-factory.js`: generated bundle passes cases:ingest firewall; difficulty distribution
  moves toward 60/30/10; scoring nodes sealed.

**#8 medsci-skills detectors (PATTERN-LIFT → integrity-detectors).**
- Contract: each detector is a pure function `detect(output) → { passed, severity, reason? }`, wired into
  the verifier as additional machine-decided checks. No network. Strengthens, never loosens, C1.

**New pipeline edges — validators:** every new server↔pipeline edge is zod-gated exactly as ARCH_PLAN's
existing edges (`validateContextPacket`, `validateGroundingPlan`). No harvested output bypasses the
five-step spine or the ContextPacket `superRefine` lab guard.

---

## 6.6 — Edge cases & failure-mode register (FMEA)

| # | Failure mode | Trigger | Detection | Proactive mitigation | Owner step | Residual (L×I) |
|---|---|---|---|---|---|---|
| G1 | **Licence contamination — AGPL reaches shippable path** | open-health (#13) code copied, not pattern-lifted | licence scan in CI (SPDX headers); dependency audit | #13 = pattern-lift ONLY; no code until owner AGPL ruling; CI blocks AGPL/GPL SPDX in shippable modules | H1 | 1×5=5 |
| G2 | **ToolUniverse RCE / sandbox escape** | code-executor exposed; TU reachable unauth'd | `contract-tooluniverse-gateway.js` asserts executor unreachable + auth required; egress monitor | executor DISABLED at config; own auth; egress allow-list; least-privilege; pin ≥v1.3.0 | H5 | 2×5=10→1×5 |
| G3 | **Unverified evidence reaches a patient answer** | retrieval path wired before MIRAGE pass | `bench-mirage-gate.js` CI-blocking; path `patient_eligible:false` by default | no retrieval path patient-facing until MIRAGE-passed; default-deny | H3 | 2×5=10→1×5 |
| G4 | **US-schema data leaks into AU-Core path** | Fasten US provider defs / Synthea US profiles used raw | AU Core 0.3.0 structural validate on every ingested/generated resource | AU providers = named build; synthea-au fork localises; validate rejects non-AU-Core | H1/H4 | 2×4=8→1×4 |
| G5 | **MedRAG name confusion** | SNOWTEAM2023/MedRAG wired where gzxiong intended | identity check in dependency manifest; repo URL pinned | disambiguation gate (§4.3); pin exact repo URL + commit; #20 = harness, SNOWTEAM = reference only | H3 | 1×3=3 |
| G6 | **FLAG/SKIP element silently adopted** | voice-agent/DoctorGPT/taskade pulled in | dependency manifest allow-list; CI rejects unlisted repos | DROP rows explicit in 6.2; manifest allow-list; FLAG repos never in lockfile | all | 1×3=3 |
| G7 | **Governance-gate bypass — harvested answer reaches patient without clinician checkpoint** | evidence/tool output wired to a patient path pre-portal | every patient path refuses without VerificationGateRecord on the exact candidate_output_hash (C9) | governance (step 7) is cross-cutting + precedes any patient wiring; portal gate = release blocker | H7 | 4×5=20→1×5 |
| G8 | **Vendor lock-in (fulcra commercial backend)** | fulcra wired as sole wearable source | dependency review flags commercial backends | fulcra DEFERRED; prefer open wearable ingest; any commercial dep needs owner sign-off | H-def | 2×3=6 |
| G9 | **Dose leak from advisory evidence (#15)** | drug-interaction result populates a dose claim | verifier check 5 + contract test asserts no interaction→dose | #15 output `advisory:true`, structurally barred; pharmacology firewall (C2) sole dose source | H2 | 3×5=15→1×5 |
| G10 | **Raw lab from harvested FHIR bypasses parser** | wso2/Fasten Observation injected unsanitised | ContextPacket `superRefine` rejects lab_result without sanitised_by | every harvested observation routes through investigation parser (C3) before injection | H1 | 2×5=10→1×5 |
| G11 | **Hosted-service dependency outage (bgpt-mcp #18)** | graded-evidence service down mid-run | receipt error code; health check | wrap with fallback to #14/#15; degrade to BLOCKED_NO_PROOF, never fabricate | H2 | 3×3=9→2×3 |
| G12 | **Synthetic case contaminated with real data** | real record enters case factory | `persistContent` refuses non-synthetic; `synthetic:true` assert | case factory offline, synthetic-only; firewall + assert | H4 | 1×5=5 |
| G13 | **Unresolved-licence dep committed** | "Confirm" licence (#16/#18/#9/#21) wired pre-clearance | CI licence-clearance manifest check | no "Confirm" element enters a shippable path until on-repo licence verified + recorded | all | 2×4=8→1×4 |
| G14 | **Directory-listed item relied on unverified** | cTAKES/Hermes/Tidepool wired from directory listing only | provenance field check | re-verify live before any reliance (§4.4); provenance recorded | H-opt | 1×3=3 |
| G15 | **Topology churn re-opens safety core** | new orchestrator forked (D-1) instead of pattern-lift | plan review gate | keep trunk spine + verifier; lift octochains pattern only; owner-gated | H6 | 2×4=8→1×4 |

---

## 6.7 — Sequenced execution roadmap

Dependency-ordered along the Adoption Sequence (1→7). **Governance (H7) is cross-cutting** — the
clinician-verification gate (ARCH_PLAN C9/M5) and audit ledger (C5) must exist before any harvested
capability is wired to a patient-facing path. Practically: **ARCH_PLAN M1–M5 complete before H-milestones
wire anything patient-adjacent.** Each milestone has a task budget (max sub-agent turns).

**Dependency on ARCH_PLAN:** H-milestones assume ARCH_PLAN M0–M5 done (mode-normaliser, sequencer,
allow-list, session-store, portal gate). If not, H-work proceeds only to the mock/benchmark boundary and
does not wire to a live patient-adjacent path.

**H0 — Harvest reconciliation & licence-clearance manifest (budget: 6).** Create the dependency manifest +
licence-clearance CI check. Record verified licences (open-health AGPL, ToolUniverse Apache-2.0, Fasten
Sources Apache-2.0, #14/#15 MIT); mark "Confirm" items pending. Register the disambiguation pin (#20 vs
SNOWTEAM). *No integration code.* **Exit:** manifest exists; CI blocks unlisted/AGPL-in-shippable/unresolved
licences. **Model: Fable 5.**

**H1 — Patient-record spine (budget: 12).** Wrap Fasten Sources (Apache-2.0 portion) into
`integration/record-sources/`; wrap wso2 (#16) as the fhir-broker live backend behind the existing
contract; scaffold AU My Health Record provider metadata as a named build. Every Observation → parser →
session-store. **Exit:** `contract-fhir-live.js` green; record ingest crosses parser + session-store; no
raw lab exits; mock rollback intact. **Model: Opus 4.8 (wrap) w/ Fable 5 (integration judgement).**

**H2 — Evidence taps + trust gate (budget: 14).** Wrap #14, #15, #1, #18 as evidence servers behind a
common `evidence_search`→EvidenceNode contract; override `docs` stub. Enforce the #15 advisory/no-dose
boundary. Lift #8 detector patterns into the verifier. **Exit:** `contract-evidence-*.js` green; every
result → Receipt → EvidenceNode; #15 no-dose assertion green; detectors strengthen verifier; **still
mock-gated for patient use pending H3.** **Model: Opus 4.8 (wrap) + Fable 5 (boundary logic).**

**H3 — Prove it: MIRAGE benchmark (budget: 10). GATE.** Build `benchmark/mirage/` from #20; wire
`bench-mirage-gate.js` as blocking CI. No retrieval path (#14/#15/#18/#1/ToolUniverse-retrieval) is marked
`patient_eligible` until it passes threshold. Optionally add PrimeKG substrate / medgraph-ai pattern if
relational reasoning pursued (both MIRAGE-gated). **Exit:** MIRAGE runs in CI; all H2 paths carry a
measured score; sub-threshold paths blocked. **Model: Fable 5 (eval design) → Opus 4.8 (harness).**

**H4 — Case factory (budget: 10).** Wrap Synthea (#dir); fork synthea-AT → synthea-au (AU Core 0.3.0 +
AuditEvent); wrap chatty-notes. Generate AU-Core synthetic cases toward 60/30/10, carrying the two-store
firewall (C7). Feeds ARCH_PLAN M6. **Exit:** `contract-case-factory.js` green; generated cases pass
cases:ingest firewall; distribution rebalanced; synthetic-only asserted. **Model: Opus 4.8 (wrap) + Fable
5 (AU localisation).**

**H5 — Capability expansion: ToolUniverse (budget: 12).** Wrap #28 as `tooluniverse-gateway` in
compact-mode; **executor DISABLED**; own auth; egress allow-list; pin ≥v1.3.0. Study MedLog for the audit
pattern (informs ARCH M8). Retrieval-type tools MIRAGE-gated. **Exit:**
`contract-tooluniverse-gateway.js` green — executor unreachable, auth required, egress bounded; tool
output → Receipt. **Model: Fable 5 (security boundary) → Opus 4.8 (wrap).**

**H6 — Reasoning topology (budget: 8). OWNER-GATED (D-1).** Lift octochains' conflict-audit pattern into
`verification/conflict-audit.js` as a trust mechanism; keep the trunk spine + verifier. Do NOT fork a new
orchestrator. Multi-Agent-Medical-Assistant/Azure-Samples read as design refs only. **Exit:** conflict-
audit surfaces expert disagreement; verifier unchanged; owner-approved before merge. **Model: Fable 5.**

**H7 — Governance wiring (cross-cutting; budget: 8).** Map every harvested path to the portal gate (C9):
no harvested capability reaches a patient path without a VerificationGateRecord on the exact
candidate_output_hash. Confirm audit-ledger (C5) records every harvested-path run. **Exit:** governance
contract test green for each harvested path; patient paths refuse without an attested gate record.
**Model: Fable 5 → Opus 4.8.**

**Input-gated / deferred:** PyHealth (#23), MONAI (#22) — future capability, post-spine + governance.
fulcra (#19), Tidepool — vendor/vertical-gated. TxAgent — Rx-Remedy scope. cTAKES/Hermes — re-verify live
before reliance.

**Ordering rationale:** H1 gives the record spine to harvest against; H2 adds evidence but leaves it
mock-gated; **H3 is the gate that makes H2 trustworthy — nothing patient-facing before it**; H4 feeds the
eval; H5 expands capability behind the RCE-safe boundary; H6 is owner-gated topology; H7 confirms every
path routes through governance. Governance is built (ARCH_PLAN M5) before, and wired (H7) across, all of it.

---

## 6.8 — Per-step Claude Code execution directives

**Common preamble (prepend to every H-step):**
> Read `.planning/FLOW_PLAN.md` AND `.planning/ARCH_PLAN.md` first, in full, before any code. Confirm the
> ARCH_PLAN RETAIN core is untouched — you WRAP behind existing contracts, you do not rewrite verifier,
> pharmacology engine, investigation parser, pipeline zod gates, or audit ledger. **Run one sub-agent at
> a time — never parallel sub-agents.** For any security-vulnerability hunt, licence scan, or multi-file
> integration debug, give the sub-agent the **whole relevant codebase** — harvested-dependency bugs live
> in the interaction between the adopted code, the governance gate, and the existing pipeline. For every
> ingestion/retrieval/benchmark/case-generation workflow: **analyse → decide → act → evaluate the result
> against the contract AND the §1 invariant floor → self-correct mid-workflow; do not assume success.**
> After every change: re-run contract tests + the relevant benchmark (MIRAGE for any retrieval/answer
> path) + governance check; keep CI green; update the integration register (6.2) and plan status in the
> same step. **Prove before trust: no harvested retrieval/answer capability is "done" until MIRAGE-passed.**
> No unresolved-licence dependency enters a shippable path. Never expose the ToolUniverse code-executor.

| Step | Directive (executor runs) | Model | Sub-agent constraint |
|---|---|---|---|
| H0 | "Build the dependency manifest + licence-clearance CI check. Record verified licences; mark 'Confirm' items pending on-repo clearance. Pin repo URLs+commits (esp. #20 gzxiong/MedRAG — DISTINCT from SNOWTEAM2023/MedRAG). CI blocks: AGPL/GPL SPDX in shippable modules, unlisted repos, unresolved-licence deps. No integration code." | Fable 5 | single agent; read-only scan |
| H1 | "Wrap Fasten Sources (Apache-2.0 portion ONLY — not the GPL app) into integration/record-sources/; wrap wso2/fhir-mcp-server (#16) as the fhir-broker live backend behind the EXISTING fhir_read/search/validate contract (mock=rollback). Scaffold AU My Health Record provider metadata as a named build item. Route every Observation through investigation-parser (C3) then session-store (C8). Verify #16 licence on-repo first. Add contract-fhir-live.js: resource passes structural validate, no raw lab exits, Receipt emitted, session-scoped destroy on close." | Opus 4.8 + Fable 5 | one agent; whole integration/ + verification/ in context |
| H2 | "Wrap #14/#15/#1/#18 as evidence servers behind a common evidence_search→EvidenceNode contract; override the docs stub with #1 PubMed. HARD boundary: #15 drug-interaction/paediatric output carries advisory:true and is structurally barred from any dose field — pharmacology firewall (C2) stays the sole dose source. Lift #8 medsci-skills detector PATTERNS into the verifier as machine-decided checks (no runtime dep). Verify #18/#9 licences first. Add contract-evidence-*.js incl. #15 no-dose assertion. Mark all paths mock-gated pending H3." | Opus 4.8 + Fable 5 | one agent; whole verification/ + mcp/servers/ in context (dose-leak risk is cross-file) |
| H3 | "Build benchmark/mirage/ from gzxiong/MedRAG (#20 — confirm identity vs SNOWTEAM). Wire bench-mirage-gate.js as a BLOCKING CI job. A retrieval path is patient_eligible:false until passed:true at threshold. Score every H2 path; block sub-threshold. Optional: PrimeKG substrate / medgraph-ai pattern behind the existing kg_query contract, both MIRAGE-gated. Record scores to ledger metadata." | Fable 5 → Opus 4.8 | single agent; do NOT read scoring nodes 10–13 into context |
| H4 | "Wrap Synthea (#dir, Apache-2.0) into case-factory/synthea/; FORK synthea-AT → case-factory/synthea-au/ localised to AU Core 0.3.0 + AuditEvent; wrap chatty-notes (#sib) for narratives. Generate AU-Core synthetic cases toward 60/30/10 carrying the two-store field-scoped firewall (C7); synthetic:true always; persistContent refuses non-synthetic. Feed ARCH_PLAN M6. Add contract-case-factory.js." | Opus 4.8 + Fable 5 | single agent; never read scoring nodes; Java/Node process boundary |
| H5 | "Wrap ToolUniverse (#28, Apache-2.0, pin ≥v1.3.0) as mcp/servers/tooluniverse-gateway/ in compact-mode. DISABLE python_code_executor at config. Deploy behind Breath-Ezy auth; egress allow-list; least-privilege. Study MedLog for the audit pattern (informs ARCH M8 — do not build WORM here). Retrieval-type tools MIRAGE-gated. Add contract-tooluniverse-gateway.js: executor unreachable, auth required, egress bounded." | Fable 5 → Opus 4.8 | single agent; full-codebase for the security-boundary review |
| H6 | "OWNER-GATED (D-1): confirm the topology decision before any code. Lift octochains' (#5) parallel-expert conflict-audit PATTERN into verification/conflict-audit.js as a trust mechanism surfacing expert disagreement. Keep the trunk spine + verifier UNCHANGED. Read Multi-Agent-Medical-Assistant (#3) / Azure-Samples (#2) as design refs only. Do NOT fork a new orchestrator." | Fable 5 | single agent; halt for owner approval at Phase 2 |
| H7 | "Cross-cutting governance wiring: map every harvested path (H1–H5) to the portal gate (C9). Assert no harvested capability reaches a patient path without a VerificationGateRecord bound to the exact candidate_output_hash. Confirm audit-ledger (C5) records every harvested-path run. Add a governance contract test per harvested path." | Fable 5 → Opus 4.8 | single agent; full-codebase for release-gating review |

---

## 6.9 — Self-verification

Re-read Inputs R (register), C (Parts A–C + BREATH ethos), S (digest + ARCH_PLAN). Confirmations:

- **§1 invariant floor — none weakened.** Augmented-not-autonomous holds (no harvested element diagnoses/
  prescribes/finalises; governance gate mandatory). Evidence-verified-trust *strengthened* — the MIRAGE
  gate (H3) makes trust measured, not assumed. Dose source stays singular (G9/#15 no-dose boundary;
  pharmacology firewall C2 untouched). No fabricated codes/facts (verifier C1 applies to harvested output
  unchanged; #8 detectors strengthen it). Patient-owned/minimised data holds (every source crosses parser
  C3 + session-store C8). No raw labs (G10). Governance is builder-owned and cross-cutting (H7 maps every
  path to C9). AU context enforced (G4; synthea-au fork; AU provider build named). Licence floor held
  (H0 manifest; G1/G13; AGPL = reference-only).
- **Every ADOPT element has a licence-clearance status and a governance-gate mapping.** Verified:
  Apache-2.0 (ToolUniverse, Synthea, synthea-au, chatty-notes, Fasten Sources portion), MIT (#14, #15, #8,
  PrimeKG), first-party (#1); "Confirm" gated pre-commit (#16, #18, #9, #21, #20). Every one maps to the
  portal gate (C9) or is explicitly non-patient-facing (benchmark, case factory, detectors).
- **Every FLAG/SKIP is dropped or carries a superseding justification.** Dropped: voice-agent (#10),
  DoctorGPT (#7), cittaverse (#12), taskade (#24), awesome-ai-startups (#27). Deferred with reason:
  fulcra (#19), Tidepool, PyHealth (#23), MONAI (#22), TxAgent. Re-verify-before-reliance: cTAKES, Hermes.
- **No patient-facing path opens without the governance gate.** H7 is cross-cutting; ARCH_PLAN M5 portal
  gate is a release blocker; every H-milestone's patient-adjacent wiring is barred until the gate exists
  and a VerificationGateRecord binds the candidate_output_hash.
- **Input disagreements surfaced, not silently resolved:** D-1 (topology — retain spine, lift pattern,
  owner-gated), D-2 (open-health AGPL — reference only, owner ruling), D-3 (record scope — harvest
  plumbing, portal stays gated). Each carries a recommended resolution requiring owner confirmation.
- **Vision cross-check:** register categories A–H + kakoni buckets and the 7-step Adoption Sequence match
  the source .xlsx exactly (40 rows, seq 1–7/future/opt). No drift defect. Module map (6.3) checked against
  the live repo tree (digest @ cd60065) — every [OVR]/[INT] target exists; every [NEW] is genuinely absent.

**Result: PASS.** No invariant floor weakened; evidence-trust strengthened by the benchmark gate; every
adopted element licence-cleared or gated; every FLAG/SKIP dropped or justified; no patient path opens
without governance. Ready to save to `.planning/FLOW_PLAN.md` and begin H0.

*End of blueprint.*
