# Mechanical Inventory — Verified Knowledge Base & Reuse Dossier

> Research artifact. Compiled 2026-07-23 from an exhaustive parallel verification of the
> `Mechanical_Inventory.md` list (L1–L7) against primary sources + the live Makoha codebase.
> This is a **knowledge base**, not an approved plan. Adopting anything here (adding a
> dependency, wiring a vendor, adding a rule layer) is a stack change subject to the CLAUDE.md
> Phase-2 gate. Verdicts are MY verdicts after verification — where they diverge from the
> inventory's, that is called out. Every external claim is cited to a primary source in the
> source lists below.
>
> Verdict scale: **ADOPT** (use it) · **BENCHMARK** (measure against it) · **REFERENCE** (read
> it, do not depend) · **BUY** (contract) · **FLAG** (licence or safety trap).

---

## 0. Corrections to the inventory (credibility-critical — fix before any of this reaches a deck)

| Item | Inventory said | Verified truth | Source |
|---|---|---|---|
| MedGemma 1.5 4B MedQA | 64.4% | **69.1%** (64.4% was MedGemma **1** 4B) | Google model card |
| MedGemma "1.5 27B / 87.7%" | exists | **Does not exist.** 1.5 shipped **4B only**. 87.7% = MedGemma **1** 27B *text-only zero-shot* | HF 27b-text-it card |
| HealthBench arXiv id | 2505.10074 | **2505.08775** | arXiv |
| MedHELM public datasets | "13 of 35 public" | **35 benchmarks; ≈14–16 public + 7 gated + 14 private** | medhelm.org |
| AU Core version | 2.0.0 (correct!) | **2.0.0 published & current** — but **our repo pins 0.3.0** (stale) and vendors a pre-release `2.0.1-ci-build` | hl7.org.au/fhir/core |
| ICD-10-AM | 12th Ed | **13th Ed** current since 1 Jul 2025 — our pin is stale | IHACPA |
| PBS API v3 | "free public API" | True, but **1 req / 20 s** + 12-month window → must cache | data.pbs.gov.au |
| openEHR CKM | "~1000 archetypes" | Unverified; last hard figure 478 (2019). Treat as approximate | openEHR |
| Synthea CSV/C-CDA/NDJSON | implied default | **Opt-in via config**; only FHIR + C-CDA emit by default | MITRE |
| rdmgator12 healthcare-MCP list | "highest-value find, physician-rated" | **Debunk.** Real repo, but HIPAA/validity grades are self-asserted marketing (12★, directory-farming owner). Untrusted lead list only | GitHub |
| registry.modelcontextprotocol.io | "self-hostable" | Maintainers say it is **not designed for self-hosting**; still preview/API-freeze | blog.mcp.io |
| Vishwanath wording | "alignment, completeness, context sensitivity" | Precise: **"completeness, communication quality, context awareness, and systems-based safety reasoning"** | arXiv 2512.01191 |

**Two "prove-a-negative" claims that held up:** no AU Synthea locale exists (NZ is nearest); no AU-localised HealthBench exists (J-HealthBench exists for Japan). Both are genuine open lanes, stated as "no known…".

---

## 1. The reuse map — what already exists in OUR code (do not rebuild)

The largest finding of the codebase scan: **several inventory "builds" are already seeded in the repo, and one "part we have not built" is already partly built.**

| Layer | Inventory framing | What's ALREADY in Makoha | Consequence |
|---|---|---|---|
| L1 terminology | "adopt Ontoserver, deletes the terminology build" | `mcp/servers/terminology/ontoserver-client.js` + `live-adapter.js` + `value-sets.json` + `coding-gate.js` already exist (MI-05, PARTIAL). Mock multi-system + code-validate live path built. | We don't build an Ontoserver client — we **point the existing one at a licensed instance** and finish the AMT ValueSet bindings. |
| L2 FHIR backend | "pick HAPI or Medplum" | `fhir-broker/live-backend.js` already targets an **external pinned wso2/fhir-mcp-server** (Python, v0.10.0) over MCP streamable-HTTP; AU Core SDs vendored; `conformance.js` built. | Decision is **Medplum (stack-fit) vs the already-wired wso2 adapter** — not greenfield. |
| L3 decision logic | "the part you have not built… adopt CQL/CDS Hooks" | **A CDS Hooks R4 / OpenCDS adapter already exists and is tested** (`pharmacology/cds-adapter/`), behind `config/flags.js PHARM_CDS=AU_OSS_CDS`, folded monotone. Plus two more deterministic engines: the pharm firewall (`engine.js`) and PPP-TTT (`verification/ppp-ttt/`). **CQL/ELM specifically are absent.** | CDS Hooks is NOT greenfield. The genuinely-new capability is a **pure-Node CQL rule layer** that pushes deterministic clinical logic out of the trunk prompts. |
| L4 pharmacology | "buy MIMS to back Trunk 8.0" | `pharmacology` is the most-built server: validated self-build engine, zod both ways, ~20 tests, `LicensedFeedSource` fail-closed STUB seam + OpenCDS slot ready. | The vendor is a **drop-in behind an existing seam** (FL-34), not a rebuild. |
| L6 models | "adopt MedGemma" | Eval harness already backend-agnostic (Claude live-validated); `FL-33` MedGemma endpoint seam noted. | MedGemma is an **optional alternate backend**, off critical path. |
| L7 eval | "adopt MedHELM/HealthBench…" | Full record/replay harness, tier scoring, medal bands, release-gate arming already built (FL-40 closed). | We **bolt external benchmarks alongside** the existing harness, not replace it. |
| Case store | "use Synthea" | **The whole case-factory already exists** (`case-factory/`, FLOW_PLAN H4): `synthea/run-synthea.js`, `synthea-au/run-synthea-au.js`, `narratives/run-chatty-notes.js`, `to-casebundle.js`, `complete-scoring-nodes.js`, fixtures, `test/contract-case-factory.js`. All three external repos **pinned** in `integration/harvest-manifest.json` (`dir-synthea` synthetichealth/synthea @2b0a55b; `fork-synthea-at` FHOOEAIST/synthea @4647221 — Austrian TEMPLATE, not an AU repo; `sib-chatty-notes` synthetichealth/chatty-notes @a767a57), all Apache-2.0, all run **out-of-process (no Java vendored)**, fail-safe when toolchain absent. AU guarantee is mechanical: every generated resource gated through the existing fhir-broker **AU Core conformance validator**. | **NOT greenfield.** B1 is "enable it" (Java toolchain + pinned distros = operator/input step) → run → existing ingest. Only open eng question: **C22 AU Core target** (0.3.0 vs vendored 2.0.1-ci-build), already surfaced by `auCoreTarget().c22_open`. Doc nit: README calls FHOOEAIST an "AU-localised fork" — code correctly labels it Austrian(AT)-template. |

**Firewall/invariant anchors that constrain every adoption (unchanged):** scoring-store nodes 10–13 never routed to a trunk; `candidate_output_hash` SHA-256 preserved; HARD_FAIL terminal; only `pharmacology` emits `dose_guidance`; only the 7 registered service names may appear in output; mock never served under a live receipt.

---

## 1b. Codebase reconciliation — first-hand whole-tree sweep (2026-07-23)

> Corrects §1: the initial scoped-agent pass undersold the codebase. This matrix is a
> first-hand grep+read sweep of the ENTIRE tree (incl. `authoring/`, `benchmark/`, `eval/`,
> `ingestion/`, `integration/`, `models/`, `portal/`, `grounding/`, all `mcp/servers/`).
> State: **BUILT** (present & wired) · **PARTIAL** (built, live/connect gated) · **ABSENT** (NONE across tree).

| Inventory concept | State | Evidence in repo |
|---|---|---|
| Ontoserver / NCTS | PARTIAL | `terminology/ontoserver-client.js`, `live-adapter.js`, `value-sets.json`; free-AU licence + AMT bindings pending |
| AU Core / AU Base / AUCDI | BUILT (pin stale) | vendored SDs `fhir-broker/au-core/`, `conformance.js`, `ingestion/structuring/json-to-fhir.js`, `verification/history-summary.js`; pin 0.3.0 vs published 2.0.0 |
| SNOMED/AMT/ICD-10-AM/LOINC/PBS | BUILT/PARTIAL | `terminology` multi-system mock + live code-validate; ICD-10-AM 12th (13th current); LOINC/PBS bindings open (`terminology-contract-incomplete`) |
| openEHR / CKM | **ABSENT** | REFERENCE-only in inventory; nothing in tree |
| ADHA ECL patterns | **ABSENT** | no ECL-derived ValueSets; enhancement to existing Ontoserver client |
| Synthea (base + AU) | BUILT (input-gated) | `case-factory/synthea/`, `synthea-au/` (AT template + AU-Core gate), pinned in `harvest-manifest.json`; needs Java toolchain |
| chatty-notes | BUILT (input-gated) | `case-factory/narratives/run-chatty-notes.js`, pinned `sib-chatty-notes` |
| **MOSTLY AI** (not in inventory) | BUILT (input-gated) | `eval/synthetic/mostly-ai/run-mostly-ai.js` — DP synthesis behind case-factory; 2nd synthetic generator |
| MIMIC-IV | ABSENT (correct) | FLAG — per-user DUA + wrong cohort; not ingested |
| PrimeKG / biomedical KG | REFERENCED only | `grounding/entity-inventory.json`, gap-register, harvest-manifest — considered, not ingested (licence trap) |
| **ToolUniverse** (not in inventory) | BUILT | `mcp/servers/tooluniverse-gateway/` — 600–1000+ tools behind a security boundary, RCE executor denied; pinned v1.3.1 |
| **Evidence servers** (not in inventory) | BUILT (mock, MIRAGE-gated) | `evidence-fda-pubmed`, `evidence-drug-guideline` (advisory, dose-barred) |
| **Ingestion pipeline** (not in inventory) | BUILT (input-gated) | `ingestion/`: Paddle/JSL OCR → Presidio de-id (fail-closed) → json-to-fhir → coding gate |
| **MIRAGE benchmark** | BUILT | `benchmark/mirage/`, `bench-mirage-gate.js` — grounding/hallucination gate |
| Medplum | **ABSENT** | current FHIR path = wso2/fhir-mcp adapter (`fhir-broker/live-backend.js`) + Bahmni record-source |
| HAPI FHIR | REFERENCED | `integration/record-sources`, docs — reference only |
| wso2/fhir-mcp | BUILT (adapter, input-gated) | `fhir-broker/live-backend.js` targets pinned external wso2 process |
| Bahmni (AU provider) | BUILT (adapter) | `integration/record-sources/au-providers`, `test/contract-au-provider-bahmni.js` |
| **CQL / ELM / encender / cqframework** | **ABSENT** | the genuine L3 gap — decision logic = prompts + OpenCDS-hooks + deterministic engines |
| CDS Hooks / OpenCDS | BUILT (flag-gated) | `pharmacology/cds-adapter/`, `config/flags.js PHARM_CDS`, `verification/pipeline.js`, many tests |
| MIMS / AusDI / SafeScript | PARTIAL (target-wired) | `config/flags.js`, `docs/structure-notes` (3b), gap-register; `LicensedFeedSource` fail-closed stub; vendor not connected (FL-34) |
| Parchment | **ABSENT** | net-new BUY candidate; not yet considered |
| RxNorm | BUILT (safe, guarded) | `scripts/pharm-rxnorm-harvest.mjs`, `pharm-inn-reconcile.mjs`, vocabulary tooling; USAN-vs-INN jurisdiction guard (FL-07) — identity cross-ref only, never dosing |
| eRx / NPDS / RTPM / ScriptCheckWA | ABSENT/PARTIAL | `grounding/data-buckets.md` only; SafeScript-style S8 check in pharm engine; live rails unbuilt (messaging-geo) |
| HI Service / IHI / HPI / NASH | BUILT (mock stub) | `identity-au`, schemas, `verification/session-store.js`, consent path |
| AHPRA sign-off | PARTIAL | `portal/identity-federation.js`, `gate-record-store.js`, `contract-portal-identity.js`; no live API → PIE/cached (FL-43) |
| MedGemma (+ MedSigLIP/MedASR) | BUILT (endpoint-gated) | `integration/llm-adapter-medgemma.js`, `generation-backend.js`, `models/imaging/multimodal.js`; endpoint = FL-33 |
| Jamba (not in inventory) | BUILT | `models/jamba/assembler.js`, `contract-jamba-assembler.js` |
| MedHELM / HealthBench / SCT / MedAgentBench / MedProbeBench | **ABSENT** | our own harness + MIRAGE only; no external medical benchmark adopted |

**True "missing mechanical solutions" (what the prompt asked to surface):** (1) pure-Node **CQL/ELM rule layer** (biggest); (2) **external-benchmark adoption**; (3) **Medplum vs wso2** fhir-broker decision; (4) **openEHR CKM + ECL** enhancements to the existing terminology/taxonomy path; (5) **Parchment** BUY evaluation. Everything else is BUILT, PARTIAL (gated vendor connect already on FINISH-LINE), or a correct ABSENT (MIMIC-IV, PrimeKG-as-shipped).

## 2. Verified verdicts by layer (my verdicts, with integration notes)

### L1 — Data spine · terminology
| Asset | My verdict | Note |
|---|---|---|
| **Ontoserver** (CSIRO) | **ADOPT** | Genuinely **free for AU end-use** via ADHA (email help@digitalhealth.gov.au; licensed Docker image). `$expand/$validate-code/$lookup/$translate`, SNOMED CT-AU syndication. Wire our existing `terminology` server as an authenticated proxy; stamp server+SNOMED version into every receipt `dataset_version`. **Deletes self-built terminology logic.** |
| **NCTS** | **ADOPT** | Content feed behind Ontoserver's syndication. Free national terminology licence; RF2 + FHIR ValueSets + TSV; Postman collection. Don't hand-roll a store. |
| **SNOMED CT-AU + AMT** | **ADOPT (identity) + FLAG** | AMT is **identity, not decision support** ("must be used in conjunction with…") — **no interactions, no dosing**. Confirms the pharmacology vendor buy is unavoidable. Re-pin from 20240301. |
| **PBS API v3** | **ADOPT** | Free public tier; **cache it** (1 req/20 s, 12-mo window). Item codes/restrictions/ATC/AMT maps. Wire into `fhir-broker` or a small PBS path, not `terminology`. |
| **AU Core IG** | **ADOPT + FLAG pin** | Current published = **2.0.0** (R4). Our **0.3.0 pin is stale**; vendored `2.0.1-ci-build` is a pre-release. Bump under a plan (unsettled conformance-target decision per CLAUDE.md). Join Sparked TDG to track authoritatively. |
| **openEHR CKM** | **REFERENCE** | CC-BY-SA 3.0 (copyleft — share-alike bites derivatives). Mine archetype *structure* to shape presentation-layer models; do **not** adopt openEHR as a runtime (we're FHIR R4). GitHub mirror `openEHR/CKM-mirror`. |
| **ecl-examples** (ADHA) | **REFERENCE→ADOPT patterns** | Live, teaches AMT ECL. Lift ECL expressions into our ValueSet definitions resolved by Ontoserver `$expand`. |
| **polecat** (ADHA) | **REFERENCE only** | **Archived 2021**, Medserve backend obsolete. UX inspiration only. |
| **LOINC** | **ADOPT** | Free worldwide incl. AU (free account + ToS). Being added to NCTS → load via Ontoserver syndication. |
| **ICD-10-AM** | **BUY + FLAG pin** | **Not free** — IHACPA/Lane Print licence. **13th Ed** current; our 12th-Ed pin stale. Until licensed → `BLOCKED_NO_PROOF`, never fabricate. |

### L1 — Data spine · synthetic cases
| Asset | My verdict | Note |
|---|---|---|
| **Synthea** | **ADOPT** | Apache-2.0 (Java). Primary generator. FHIR R4 out-of-box; CSV/C-CDA/NDJSON opt-in. "Populates required, rarely optional" confirmed → bundles are thin, need enrichment. |
| **synthea-international** | **ADOPT framework / build AU** | **No `au` locale exists** (nz nearest template). Building an AU locale is a defensible OSS contribution + directly feeds our case store. |
| **chatty-notes** | **REFERENCE (re-implement)** | Pattern is exactly bundle→consult-narrative, but it's a thin OpenAI wrapper — **do not adopt the code** (sends data out, no receipts). Re-implement in Node/MCP inside our trust boundary. |
| **synthea-llm** | **REFERENCE** | Experimental; JAMIA Open found modules runnable-but-not-production. Any generated module needs clinician sign-off. |
| **Synthea Module Builder** | **ADOPT (tool)** | In-browser, no data leaves. Author AU low-acuity disease modules (URTI/UTI). |
| **synthea-AT-implementation** | **REFERENCE** | Proves a national-Core fork is viable; but 1★/stale research artifact. Prefer AU-locale contribution + conformance post-step over a hard fork. |
| **MIMIC-IV** | **FLAG** | Per-user DUA (can't live in a shared repo) + wrong cohort (US ICU, high-acuity, physical-presence data). Do not ingest. |

### L1 — Knowledge graphs
| Asset | My verdict | Note |
|---|---|---|
| **PrimeKG** | **FLAG (commercial no-go as shipped)** | MIT covers **code only**; embedded **DrugBank/UMLS/DrugCentral/SIDER** bar commercial redistribution — independently proven by PrimeKG-CL excluding them. Study schema only; keep out of shipped `knowledge` datasets. Superseded by OptimusKG. |
| **PrimeKG-CL** | **REFERENCE** | Proves KG version-pinning matters (5.83M edges added / 889K removed over 25 mo → validates our `dataset_version`+checksum discipline). Its 9 free DBs = the licence-clean subset. |
| **STaRK-Prime** | **BENCHMARK (methodology)** | Adopt the query-synthesis + ground-truth-retrieval *eval design* for our `knowledge` server; build AU-scoped fixtures. Don't ingest PrimeKG content. ~18% Hit@1 → KG retrieval is hard. |
| **DrugMechDB** | **REFERENCE (CC0 — cleanest licence)** | Usable commercially, but MoA paths peripheral to triage. Low priority. |
| **OHDSI/OMOP + Athena** | **BENCHMARK** | CDM + core vocab Apache-2.0 (Athena bundles some restricted, e.g. CPT-4). Standards-aligned data-model reference. |
| SPOKE / DRKG / CKG | **REFERENCE** (SPOKE = BUY if ever needed) | All carry embedded-licence traps or wrong domain. |

### L2 — MCP + FHIR servers
| Asset | My verdict | Note |
|---|---|---|
| **Medplum** | **ADOPT (fhir-broker backend)** | Only Node/TS stack-fit. Apache-2.0, mature (v5.x). AccessPolicies→data-minimisation; audit log→receipt/ledger; Bots/Subscriptions→Observation→parser path. SOC2/OpenSSF signals for IEC 62304/ISO 27001. Validate against mock.health conformance suite in mock mode. |
| **HAPI FHIR** | **REFERENCE** | Terminology + CQL (cqf-ruler/clinical-reasoning) reference as we close SNOMED/LOINC bindings; not primary broker (JVM). |
| **wso2/fhir-mcp-server** | **REFERENCE** | The current live-adapter target — but **Python**, off our stack. Harvest FHIRPath-filtering/HAPI-compose patterns. Reconsider vs Medplum. |
| **jmandel/health-record-mcp** | **REFERENCE** | Highest-credibility author (SMART/FHIR). Study SMART launch flow; `eval_record` (arbitrary JS) + in-memory EHR retention cut against our minimisation/no-persistence limits — don't import execution model. |
| **the-momentum/fhir-mcp** | **REFERENCE** | Python v0.1.0. LOINC-validation-anti-hallucination pattern maps to our receipt discipline. |
| **xSoVx/fhir-mcp** | **FLAG (spec checklist only)** | TS (stack-fit) but 0★, solo, no releases, unverified "production ready" claims. Mirror its PHI/audit checklist when we build broker hardening; don't depend. |
| **Japan Healthcare MCP** | **REFERENCE (skeleton)** | Real TS monorepo, synthetic-only, v0.1.0/0★. Copy the *shape* for a future "Australia Healthcare MCP" (drug→PBS/AMT, fee→MBS, PMDA→TGA); don't assume its data model is validated. |
| **registry.mcp.io** | **REFERENCE (discovery)** | Preview/API-freeze; not designed for self-host. |
| **rdmgator12 list** | **FLAG** | Real repo, fabricated-adjacent trust signals. Lead list only — **never cite its HIPAA/validity grades**. |
| mcp.so / smithery / glama / PulseMCP / BioMCP / BioPortal / BioContext / MedGemma-MCP | **REFERENCE** | Discovery/research ecosystem; MedGemma-MCP is a generation component we'd firewall, not a receipt source. |

### L3 — Decision logic (CQL / CDS Hooks) — the strategic core
**Thesis holds and there is a pure-Node path.** The one hard fact: **no pure-JS CQL→ELM compiler exists** (translator is JVM-only). But CQL *execution* in Node is production-real.

| Asset | My verdict | Note |
|---|---|---|
| **CQL (the standard)** | **ADOPT (target rule language)** | ANSI-normative HL7 (1.5.3); CMS mandates it for eCQMs. **Caveat: pedigree is US/CMS, not TGA** — strengthens certifiability (IEC 62304 traceability, regulator-readable), does not by itself satisfy TGA. |
| **cql-execution + cql-exec-fhir** (npm) | **ADOPT — the answer to "CQL in Node"** | Both Apache-2.0, R4-native (matches our 4.0.1 pin), maintained by CQF, actively released (2026), **zero JVM at runtime**. Runs in-process Node 20 ESM alongside zod. **The load-bearing dependency of the thesis.** |
| **cql-translation-service** (Docker) | **ADOPT (build-time only)** | Containerised JVM translator: compile `.cql`→`.elm.json` **in CI**, version + checksum the ELM (fits receipt discipline), ship pure-Node. JVM never enters production. |
| **AHRQ CQL-SERVICES** | **BENCHMARK (blueprint)** | Node/Express service wrapping the JS runtime behind REST + CDS Hooks. Presumes offline ELM. The exact shape of a CDS-gateway service; possible adopt for the service layer. |
| **ccsm-cds-tools** | **BENCHMARK (dissect end-to-end)** | Fully-worked all-JS analogue: guideline→CQL→ELM→JS exec→CDS Hooks+dashboard + a CQL testing framework. Learn the pattern; US cervical content ≠ our scope. |
| **encender** (npm) | **BENCHMARK (phase-2 option)** | Pure-JS FHIR `$apply` on top of cql-execution. Only if we model rules as PlanDefinitions/CarePlan. Pre-1.0/small → pin+vendor. Overkill for simple tier/boolean eval. |
| **CDS Hooks** | **ADOPT (interface)** | Shape CDS output as "cards" → portable, feeds the Clinician Verification Portal. Transport/workflow, not rule logic (orthogonal to CQL). |
| **cqf-ruler / cql-evaluator** | **FLAG (avoid for our stack)** | Full JVM+HAPI+JPA. Only if population-scale `$evaluate-measure` ever needed. |
| **CDS Connect (AHRQ)** | **REFERENCE (degraded)** | Hosted service **offline since 2025-04-28**; authoring tool carried on by HL7 community. US-context artifacts. Don't depend on the live site. |
| google/cql / cqf-tooling / cql-on-omop / android-fhir | **REFERENCE** | Go/JVM/OMOP — wrong runtime; watch google/cql's explainability trace idea. |

**Why L3 is the "useful machine" lever:** deterministic CQL triage/safety-netting rules are calm, testable, and **do not drift like a prompt** — directly attacking the over-escalation problem. Any CQL output is a *new deterministic clinical source* → it sits behind the same receipt/EvidenceNode + Clinician-Portal discipline; it does not bypass human-in-the-loop.

### L4 — Pharmacology
| Asset | My verdict | Note |
|---|---|---|
| **MIMS Web Services** | **BUY (primary, Trunk 8.0)** | REST/JSON, **AU-hosted (Azure)**, modular. CDS modules: Drug/Drug, Drug/Allergy, Drug/Disease, Duplicate, Pregnancy, Lactation — each with severity + evidence strength. Editorially independent of manufacturer PI. **No public pricing** (commercial contact). **Gaps: renal dosing + S8/PDMP are NOT in MIMS** — those come from renal logic + RTPM. |
| **Parchment** | **BUY (L5 shortcut — diligence gate)** | One contract folds eRx + IHI validation + all-state RTPM + **bundled MIMS** + **an actual MCP server**; ADHA-conformant. **Critical caveat:** it's an ePrescribing platform presuming a prescriber issuing a script — collides with our non-autonomous/pharmacy-first posture. **Diligence question that decides L5-only vs L4+L5: does its API expose MIMS CDS screening as consumable data, or only inside its prescribing UI?** |
| **AusDI** | **BENCHMARK** | Credible independent second-source vs MIMS; confirm it exposes a REST web service before treating as drop-in. |
| **AMH** | **REFERENCE (FLAG no API)** | Human subscription text, no dev API. Not a programmatic dose source. Children's Dosing Companion noted, but paediatric hard limit stands regardless. |
| **IMgateway** | **REFERENCE (phase-2 add-on)** | Herb/supplement/food–drug (USyd). Verify if exposed via Web Services API vs eMIMS desktop only. |
| **RxNorm/openFDA/DDInter/Stockley's** | **FLAG** | US identity (acetaminophen≠paracetamol) **does not join to AMT/PBS**. Never a live source on the AU dosing/identity path — would violate no-fabricated-codes. |

### L5 — Identity + messaging
| Asset | My verdict | Note |
|---|---|---|
| **eRx / NPDS** (Fred/Telstra) | **ADOPT (national rail)** | Govt NPDS since 1 Jul 2023. **PBS scripts free incl. SMS tokens**; private $0.15/download from **1 Jul 2025** (date corrected). The rail `messaging-geo` rides — but only behind the Clinician Verification Portal. |
| **ADHA e-Prescribing Conformance** | **ADOPT (hard roadmap gate)** | Mandatory to touch eRx/NPDS (profile v3.0.1). Either get conformant or ride a registered partner (Parchment/Fred). |
| ↳ Eucalyptus register claim | **CONFIRMED (competitive intel)** | EUC Services Pty Ltd, product "Eucalyptus" v1.0.0, Prescribing System profile 2.3, valid → 30-Sep-2026. A competitor owning its prescribing conformance. |
| **RTPM / ScriptCheckWA** | **ADOPT (WA pilot)** | Mandatory monitored-drug check; **not covered by MIMS** — separate operational-fact receipt. S8 paths must incorporate ScriptCheckWA. |
| **HI Service (IHI/HPI-I/HPI-O)** | **ADOPT (foundational identity-au)** | PRODA+HPOS→HPI-O→B2B via HI Integration Toolkit + NASH cert. IHI stays inside identity boundary. |
| **NASH cert** | **ADOPT (prerequisite)** | PKI/mTLS for HI/MHR/eRx. Keep out of repo; inject at deploy. |
| **Provider Connect Australia** | **BENCHMARK (later)** | FHIR provider directory + HPI-I/Ahpra linkage. |
| **My Health Record B2B** | **REFERENCE (post-blockers)** | Out of scope until portal + persistence exist. |
| **AHPRA register** | **FLAG (design constraint)** | **No official API.** Sign-off gate must use a **PIE data-usage agreement / cached periodic verification + audit receipt**, NOT a synchronous per-sign-off lookup. Directly shapes the portal design (FL-43). |
| Secure messaging (Argus/HealthLink/Medical-Objects) | **REFERENCE** | Argus+HealthLink now one stable (Clanwilliam). Off the pharmacy-first critical path. |

### L6 — Models
| Asset | My verdict | Note |
|---|---|---|
| **MedGemma 1.5 4B** | **ADOPT (optional offline backend) + FLAG** | 69.1% MedQA (corrected). Multimodal, offline-capable, single GPU. **HAI-DEF terms** (not Apache) with clinical-use disclaimer. **Adapting it makes US the TGA manufacturer** (Feb-2026 guidance) — full conformity burden. Off critical path (Claude backend live). |
| MedSigLIP / MedASR | **ADOPT (if needed)** | ~400M image encoder; ~105M medical ASR (consult capture). |
| HAI-DEF / Google-Health/medgemma | **ADOPT (reference/fine-tune)** | Apache-2.0 notebooks incl. LoRA. Weights behind HAI-DEF click-through. |
| TGA manufacturer + contamination point | **CONFIRMED (strategic)** | Validate on our **non-public synthetic store** (contamination-clean = genuine technical asset). Sell the governance, not the intelligence. |

### L7 — Evaluation harness
| Asset | My verdict | Note |
|---|---|---|
| **MedHELM** | **ADOPT (harness) + REFERENCE (taxonomy)** | Apache-2.0, Nature Medicine 2026 (Bedi et al.). 121 tasks/22 subcat/5 cat/35 benchmarks. Runnable against a vLLM/HTTP endpoint — closest bolt-on to our harness. ~14–16 public sets → full replication impossible. |
| **MedAgentBench** ⭐ | **ADOPT (priority)** | 300 physician tasks in a **FHIR-compliant virtual EHR** — the only benchmark testing our trunk *topology* (multi-step API sequences), maps to fhir-broker + grounding. |
| **MedProbeBench** ⭐ | **ADOPT (priority)** | **Claim-level citation accountability** (5,130+ atomic claims verified vs citations) — the external analogue of our EvidenceNode→Receipt→citation invariant. |
| **SCT-Bench** | **ADOPT (methodology)** | Belief-updating under uncertainty vs expert panels (174 public). The Kahneman/anchoring benchmark; LLMs score far lower than on MCQ — validates that MCQ overstates triage reasoning. |
| **HealthBench (+ Professional)** | **ADOPT** | Open (CC-BY-4.0), 5,000 multi-turn, physician rubrics. Professional (Apr 2026, 525 tasks) closest to product. arXiv id corrected to 2505.08775. |
| **Medmarks** | **BENCHMARK** | Fully-open 30-benchmark suite; good aggregator alongside our harness. |
| MedHallu / MedCalc-Bench / AMEGA / MedR-Bench | **REFERENCE/BENCHMARK** | Fabrication-guard, "no-maths-from-LLM", guideline adherence, multi-step reasoning. |
| MedGUIDE | **REFERENCE** | NCCN oncology — low fit for low-acuity. |
| MultiMedQA/MedQA/MedMCQA/PubMedQA | **FLAG (saturated)** | Sanity floor only; never investor-facing evidence. |
| **Vishwanath et al.** | **REFERENCE (investor-grade)** | arXiv 2512.01191 / Nature Medicine 2026. Quote precisely: clinical tools showed *"deficits in completeness, communication quality, context awareness, and systems-based safety reasoning."* |
| **AU-HealthBench gap** | **open lane** | No AU-localised HealthBench found. Build one from our synthetic store = an asset no competitor has. |

---

## 3. Risk / licence / edge-case register (carry into any plan)

1. **Licence traps (commercial SaMD):** PrimeKG (embedded DrugBank/UMLS/SIDER), Athena CPT-4, openEHR CKM share-alike, MIMIC-IV per-user DUA, RxNorm/US tables on the AU path. **Clean:** Synthea, OMOP core, DrugMechDB (CC0), LOINC, PBS public, Ontoserver (free AU), AU Core/AU Base, cql-execution/cql-exec-fhir (Apache-2.0). MedGemma = custom HAI-DEF terms.
2. **Regulatory:** adapting MedGemma → we are the TGA manufacturer. CQL is US-pedigree (helps certifiability, not sufficient for TGA). ADHA e-prescribing conformance is a hard gate on any eRx path. AU Core 2.0.0 vs 0.3.0 and ICD-10-AM 13th vs 12th are intended-use-adjacent pin decisions → org/regulatory sign-off.
3. **No live AHPRA API** → sign-off gate must be cached/PIE-based, not synchronous. Design constraint on FL-43/portal.
4. **Rate/scale caveats:** PBS 1 req/20 s (cache); Synthea thin bundles (enrich); FHIR benchmarks are 1k-patient in-memory baselines (not scale tests); Health Samurai benchmarks are vendor-run (bias — cross-check with mock.health).
5. **Trust-boundary edges:** chatty-notes/jmandel eval_record send/execute outside boundary — re-implement in-boundary. rdmgator12 grades are untrusted content. Any CQL rule layer is a new deterministic clinical source → must sit behind receipts + portal, never bypass HITL.
6. **Firewall invariants unchanged by everything above:** scoring nodes 10–13 sealed; `candidate_output_hash`; HARD_FAIL terminal; dose only from pharmacology; 7-name service registry; mock-never-as-live.

---

## 4. Primary sources (by layer)

*(URLs captured 2026-07-23; see the per-stream research for the full cited set. Key anchors:)*
- Ontoserver/NCTS: ontoserver.csiro.au, healthterminologies.gov.au, implementer.digitalhealth.gov.au
- AMT identity-not-CDS: healthterminologies.gov.au (Introduction to AMT; AMT Requirements & Use Cases v1.0 2024)
- PBS API v3: data.pbs.gov.au (doc 90834, 91345), data-api.health.gov.au
- AU Core 2.0.0: hl7.org.au/fhir/core, simplifier.net/packages/hl7.fhir.au.core; ICD-10-AM 13th: ihacpa.gov.au
- Synthea: github.com/synthetichealth/{synthea,synthea-international,chatty-notes,synthea-llm,module-builder}; MITRE fhir-for-research
- PrimeKG licence: nature.com s41597-023-01960-3; arXiv 2605.10529 (PrimeKG-CL); DrugBank/UMLS terms
- CQL: cql.hl7.org; github.com/cqframework/{clinical_quality_language,cql-execution,cql-exec-fhir,cql-translation-service}; npm cql-execution v3.3.2 / cql-exec-fhir v2.1.6; github.com/ccsm-cds-tools; AHRQ-CDS/AHRQ-CDS-Connect-CQL-SERVICES; cds-hooks.hl7.org
- FHIR servers: github.com/{medplum/medplum,hapifhir/hapi-fhir}; mock.health/blog/fhir-server-compare; health-samurai.io
- MIMS/Parchment: developer.mims.com/au, mims.com.au/decision-support, parchment.health/api
- eRx/conformance: telstrahealth.com, erx.com.au, digitalhealth.gov.au (EP Conformance Profile v3.0.1 + register PDFs); health.wa.gov.au/scriptcheckwa; servicesaustralia.gov.au (HI Service); ahpra.gov.au (PIE)
- MedGemma: developers.google.com/health-ai-developer-foundations/medgemma; research.google blog (MedGemma 1.5 + MedASR); tga.gov.au (AI & SaMD, Feb 2026)
- Eval: nature.com s41591-025-04151-2 (MedHELM); arXiv 2505.08775 (HealthBench), 2604.27470 (HB Professional), 2501.14654 (MedAgentBench), 2604.18418 (MedProbeBench); medrxiv 2025.02.11.25321822 (SCT-Bench); arXiv 2512.01191 / nature.com s41591-026-04457-9 (Vishwanath)
