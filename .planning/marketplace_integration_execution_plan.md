# Breath-Ezy — Marketplace Integration Execution Plan

**Target file:** `.planning/marketplace_integration_execution_plan.md`
**Mode:** PLANNING. No application code in this document.
**Governing input (vetted ground truth):** `Breath-Ezy_Marketplace_Integration_Blueprint.md` (10 categories + §6 addendum).
**Concrete substrate (established, working, not disturbed without cause):** `kenleefreo/breath-ezy` (in-code `heydoc/` prefix) — 5-step grounding pipeline, 9 trunk agents, 7 MCP servers, the 23-file schema build, the H0–H7 harvest, `portal/harvested-release.js`, `audit-store.js`, `verification-gate.js`, and the open blocker register B1–B8.
**Grounding invariant (the product):** every clinical assertion carries a resolvable receipt or returns `unknown`.
**Status:** Design + sequencing. Not legal, clinical, or regulatory advice.

---

## 1. Executive summary, ring/phase sequencing, and out-of-scope

### 1.1 What this increment does

The marketplace's value to Breath-Ezy is not disease data. It is the **evidence + terminology layer that makes the trust promise enforceable**, and the finding that the two highest-value pieces are free and AU-native. This plan wires those in first, gates the reasoning models behind them second, and confirms governance third — reusing the in-place architecture wherever it already satisfies the blueprint, and refusing to rebuild what the harvest already delivered.

The plan is deliberately additive-monotone, matching the H6 owner ruling: keep the record spine, add no orchestrator, break nothing that is byte-frozen (`audit-store.js`, `verification-gate.js`, the RETAIN core hasher).

### 1.2 The three rings map onto three phases

| Ring (trust boundary) | Blueprint categories | Phase | Deliverable that closes the phase |
|---|---|---|---|
| **Inside — the receipts** | 1 Evidence, 2 Terminology | **Phase 1** | Every test claim carries a resolvable receipt or returns `unknown`, measured on the 303-case eval set; every code writes only after `$validate-code` passes. |
| **On — the gates** | 3 Pharmacology, 5 Reasoning models, 4 Ingestion edge | **Phase 2** | No model output reaches a patient except through the Evidence Broker; OCR → structured JSON → Terminology → FHIR ingests records; pharmacology CDS slot explicit-and-empty; imaging pixel path dark. |
| **Outside — the plumbing/governance** | 6 Synthetic data, 9 Governance (confirm only) | **Phase 3** | Consent scopes, audit, and jurisdiction enforced at the one in-place gateway; synthetic corpus grown behind the CI gate; no new governance vendor added. |

Nothing patient-facing ships before its ring's gate clears. The four-part patient-eligibility precondition from the harvest ledger stands unchanged and this increment does not attempt to satisfy all four — see §1.4.

### 1.3 The single most important reuse decision

The blueprint's "Evidence Broker" and "Terminology Service" are **not new services to invent** — they are the service faces of the already-named `knowledge` and `terminology` MCP servers, sitting over the already-harvested evidence taps (#1/#14/#15), emitting the already-built `receipt.schema.json`, verified by the already-built `verification/` 5-step pipeline, and released through the already-built `portal/harvested-release.js` fail-closed seam. This plan formalises and wires them; it does not duplicate them. That collapses most of Phase 1 into integration rather than construction.

### 1.4 Explicitly OUT of scope for this increment

Stated plainly so the coding agent does not drift into them:

| Dropped / deferred | Blueprint origin | Reason |
|---|---|---|
| **Composio + Ataccama/Atlan/Alation governed gateway** | Cat 9 | The governed gateway already exists: ToolUniverse DEFAULT-DENY (H5) + the fail-closed release seam (H7) + `audit-store.js`. Adding a third-party gateway is labyrinth-building against a solved problem. **OVERRIDE → OMIT.** |
| **US Census ACS / CMS Medicare MCPs** | Cat 8 | US-jurisdiction data cannot enter an AU patient product. Pattern-only; AU equivalents (ABS/AIHW) belong to a later equity roadmap, not this increment. **OMIT.** |
| **Data-engineering accelerators** (Frisco, Pingahla, Dataplatr, Kobai, Carbon Arc) | Cat 10 | First-party record-sources (H1) + fhir-broker #16 already carry the store. Kobai's graph angle is covered by the Terminology Service. Pure infra convenience, no clinical utility. **OMIT.** |
| **Shaip US training corpora** | Cat 7 | US-provenance dev/eval material only. The 303 attested cases + case factory (H4) + MOSTLY AI (Cat 6) cover the eval need. **DEFER** to a training-data workstream; not built here. |
| **BioPortal as primary terminology** | Cat 2 | Ontoserver + SNOMED CT-AU/AMT is the AU-native answer. BioPortal is at most a secondary research cross-map, not a launch dependency. **OMIT for launch.** |
| **Patient-facing portal beyond the gate record** | (implied) | B1 (Portal UI + clinician signature + WORM storage) is the one large org-buildable item; it is a *release precondition*, not a receipts/gates deliverable. Referenced here, built elsewhere. **OUT of this increment.** |
| **AU pharmacology CDS content (MIMS-AU, SafeScript WA)** | Cat 3 / B4 | Commercial contract, not engineering. The slot is wired-for and empty. **OUT** until contracted. |
| **Imaging pixel interpretation** | Cat 5/4, §6.2 | Built now, flagged OFF. Lit only after clinical validation + regulatory clearance. **OUT of live use.** |

If the coding agent finds itself about to build any row above, it stops and flags, rather than proceeding.

---

## 2. File / module structure

Paths are relative to repo root. **PRESERVE** = leave as-is. **REFINE** = additive change only. **NEW** = create. Ownership boundary in the right column decides who signs off a change.

### 2.1 Inside the boundary (receipts) — grounding owner

| Path | Action | Responsibility |
|---|---|---|
| `mcp/servers/knowledge/broker.js` | NEW | Evidence Broker entrypoint. Accepts `{claim, query_intent}`, never a raw upstream call from the model. |
| `mcp/servers/knowledge/source-ranker.js` | NEW | Applies the fixed source ranking; assigns `source_rank` + `confidence` band. |
| `mcp/servers/knowledge/receipt-normaliser.js` | NEW | Emits the normalised receipt object against `receipt.schema.json`. |
| `mcp/servers/knowledge/taps/` | INTEGRATE | Adapters over harvested taps #1/#14/#15 and the live bio-research endpoints (PubMed, ClinicalTrials.gov, ChEMBL, bioRxiv/medRxiv, Amass). Prototype backends now; production hosting later. |
| `mcp/servers/knowledge/cache/` | NEW | Response cache + rate governor (NCBI 10 rps with key). |
| `mcp/schemas/receipt.schema.json` | REFINE | Add `jurisdiction_tag`, `confidence` band, `source_rank` if absent. Additive-monotone; no field removed. |
| `mcp/servers/terminology/` | REFINE | In-place stub → live. Add `ontoserver-client.js`, value-set loaders for SNOMED CT-AU + AMT. |
| `mcp/schemas/terminology-lookup.schema.json` | PRESERVE | Contract unchanged. |
| `verification/` (5-step pipeline, verifier, retrieval-mcp) | PRESERVE | The Broker feeds it; it is not rewritten. |

### 2.2 On the boundary (gates) — clinical-safety owner

| Path | Action | Responsibility |
|---|---|---|
| `mcp/servers/pharmacology/` | PRESERVE + REFINE | Firewall stays. AMT coding wired underneath via Terminology Service. |
| `mcp/servers/pharmacology/cds-adapter/` | NEW (empty) | Stable interface for the AU CDS vendor. Returns `HARD_FAIL`/`unknown` until B4 contracted. No dosing/interaction/contraindication content ships from here. |
| `mcp/schemas/pharm-intent.schema.json`, `pharm-check.schema.json` | PRESERVE | Input/output contract unchanged. |
| `trunk/8_pharmacology_firewall.*` | PRESERVE | HARD_FAIL-blocks-pipeline invariant unchanged. |
| `models/medgemma/` | NEW | MedGemma reasoner serving adapter. Text/reasoning live; multimodal branch present but dark. |
| `models/jamba/` | NEW | Jamba long-context assembler (record + history + receipts → grounded packet). |
| `models/imaging/` | NEW (dark) | MedGemma multimodal pixel path. Present in the graph, gated OFF. |
| `integration/trunk-pipeline.js` | REFINE | Wire Jamba → MedGemma → Evidence Broker as arbiter. Additive; orchestration topology unchanged (H6 ruling). |

### 2.3 Outside the boundary (plumbing) — data-eng owner

| Path | Action | Responsibility |
|---|---|---|
| `ingestion/ocr/paddle-adapter.js` | NEW | Default OSS OCR (PaddleOCR). |
| `ingestion/ocr/jsl-adapter.js` | NEW (flagged OFF) | John Snow Labs OCR path behind a licence flag. Not the default. |
| `ingestion/ocr/structured-adapter.js` | NEW (optional) | Surya + Marker for structured PDF → JSON, behind a licence-check flag. |
| `ingestion/deid/presidio.js` | NEW | Microsoft Presidio PHI de-id, ON by default at the edge. |
| `ingestion/structuring/json-to-fhir.js` | INTEGRATE | Structured JSON → FHIR resources → fhir-broker #16 → patient store. |
| `ingestion/pipeline.js` | NEW | OCR → de-id → Terminology coding → FHIR mapping, in that order. |
| `eval/synthetic/mostly-ai/` | NEW | MOSTLY AI SDK harness (Apache-2.0), self-hosted, behind the case-factory (H4) interface. |
| `portal/harvested-release.js` | PRESERVE | Byte-frozen seam. New paths register in the allow-list only via the existing mechanism; nothing bypasses it. |
| `audit-store.js`, `verification-gate.js` | PRESERVE (byte-unchanged) | Non-negotiable. |

### 2.4 Cross-cutting — grounding owner

| Path | Action | Responsibility |
|---|---|---|
| `config/flags.js` | NEW | Single feature-flag registry: `IMAGING_PIXEL_INTERPRETATION=OFF`, `OCR_ENGINE=paddle` (`jsl` behind licence), `PHARM_CDS=EMPTY`, `STRUCTURED_OCR=OFF`. |
| `config/jurisdiction.js` | NEW | Jurisdiction guard: US-source data is never `AU-endorsed`; drives receipt tagging and the mismatch STOP. |

---

## 3. State-management rules

### 3.1 The patient-owned longitudinal record is the single source of truth

The (AU)PAIR FHIR R4 store behind fhir-broker #16 is authoritative. Everything else is derived, cached, or transient. Concretely:

- **No coded clinical fact** enters the record except through a `$validate-code` pass (Terminology Service). Unresolved terms are stored as free-text with a quarantine flag — never promoted to a coded field. This is the in-place invariant "no SNOMED/ICD code without a terminology lookup receipt", preserved.
- **No raw lab value** enters the LLM context. Investigation interpretation flows through trunk 6.0 and the M10 parser, not the model. Preserved.
- **No dosage** originates from the LLM. Only `pharm-check` output supplies medicines-safety content, and only when the CDS slot is filled. Preserved.
- **Model outputs are not state.** MedGemma/Jamba products are candidate claims until the Evidence Broker resolves receipts and the verification report passes. Unverified claims never persist to the record.

### 3.2 Consent scopes

Consent is enforced **at the gateway, not per-connector** (blueprint Cat 9), which the in-place architecture already does via the release seam + audit store. Rules:

- Every boundary-crossing call carries a consent scope; a call outside scope is refused at the gateway and logged, not at the tap.
- Ingestion runs de-identified by default (§2.3), so dev/eval never touches raw PHI regardless of consent state.
- Scope violations are a named failure mode (§8), not an exception to swallow.

### 3.3 Provenance / receipt objects

The receipt is the atom of trust. Its lifecycle: the model emits `{claim, query_intent}` → Broker resolves against ranked sources → `receipt-normaliser` produces the object below → verification checks it → the release seam decides patient-eligibility. Every receipt is immutable once written and carries its provenance so the patient UI can show *why* a claim is trusted, or that it is `unknown`.

---

## 4. API / interface schemas

Schemas expressed as contracts, not code. Field types are indicative.

### 4.1 Evidence Broker

Input:

```
BrokerRequest {
  claim: string            // the assertion to ground
  query_intent: string     // what the reasoner is trying to establish
  jurisdiction: "AU"       // requesting patient path jurisdiction
  consent_scope: string    // enforced upstream at the gateway
}
```

Output — the normalised receipt, reconciled to `receipt.schema.json`:

```
Receipt {
  claim: string
  source: enum { pubmed, clinicaltrials_gov, open_targets, chembl,
                 biorxiv_medrxiv, openfda, guideline }
  id: string               // PMID | NCT | DOI | source-native id
  retrieved_at: iso8601
  confidence: enum { high, moderate, low, provisional }
  source_rank: int         // derived from the fixed ranking, §5
  jurisdiction_tag: enum { AU_endorsed, US_context, non_AU }
  provisional: bool        // true for preprints; excluded from patient receipts
  context_only: bool       // true for openFDA; never a receipt for a patient claim
}
```

If no source resolves, the Broker returns `{ result: "unknown" }` — not an empty receipt, not a low-confidence guess.

### 4.2 Terminology Service

FHIR terminology operations against Ontoserver loaded with SNOMED CT-AU + AMT:

```
$lookup(system, code)            → { display, designation[], property[] } | not-found
$validate-code(system, code|coding|codeableConcept, valueSet?)
                                 → { result: bool, message?, jurisdiction: "AU" }
```

Rules: a code writes to the record only on `$validate-code = true`. AMT is the medicines vocabulary; ICD-10-AM sourcing (IHACPA) is confirmed separately and is not in the marketplace. Self-host is viable now — Ken holds SNOMED CT-AU RF2 module `32506021000036107` (2026-06-30), so live terminology does not block on NCTS OAuth (B6).

### 4.3 OCR → structured-JSON → FHIR ingestion contract

```
IngestRequest { artifact: bytes, mime: string, consent_scope: string }

Stage 1 OCR       → RawExtraction { text, tables[], fields[], layout }
Stage 2 De-id     → DeidExtraction { ...RawExtraction, phi_removed: true }
Stage 3 Structure → StructuredDoc { observations[], problems[], medications[], reports[] }
Stage 4 Coding    → each entity → Terminology $validate-code
                    (fail → quarantine as free-text, never coded)
Stage 5 FHIR map  → FHIR resources → fhir-broker #16 → (AU)PAIR store
```

De-id (Stage 2) is ON by default and cannot be skipped for a dev/eval path. Imaging *reports* enter as text (Stage 1–5). Image *artefacts* are retained in storage but not interpreted — see §6.

### 4.4 Pharmacology-CDS interface — EXPLICIT-BUT-EMPTY

```
pharm-intent  { medication_coding: AMT, patient_context, interaction_set }
      │  AMT coding validated NOW via Terminology Service
      ▼
cds-adapter (stable interface, EMPTY slot)
      │  vendor not contracted (B4) → returns HARD_FAIL / unknown
      ▼
pharm-check   { verdict: HARD_FAIL, reason: "AU CDS source not contracted" }
```

The AMT layer is real and live now. The CDS content layer is a stub behind a stable interface. `pharm-check` returning `HARD_FAIL` blocks the pipeline unconditionally (preserved invariant). The hard STOP in §8 forbids any dosing/interaction/contraindication output crossing to a patient until the slot is filled.

---

## 5. Grounding enforcement path

**One rule:** no model output — MedGemma reasoner, Jamba long-context — reaches a patient except through the Evidence Broker, which strips any receipt-less claim to `unknown`.

Flow:

```
Jamba (assemble + compress: record + history + retrieved receipts)
   → MedGemma (reason over the grounded packet)
   → Evidence Broker (resolve/verify every claim; receipt-less → unknown)
   → verification-report (5-step pipeline)
   → portal/harvested-release.js (fail-closed seam → releaseToPatient())
```

Neither model self-asserts. The Broker is the arbiter. The release seam never sets `patient_eligible`; it defers the entire decision to the RETAIN C9 gate. No production code calls the seam toward a patient in this increment (correct — no patient path exists yet; the seams exist so a future path cannot bypass the gate).

**Source ranking (fixed, clinically signed off before Phase 1 exit):**

| Rank | Tier | Sources | Patient receipt? |
|---|---|---|---|
| 1 | Peer-reviewed / guideline | PubMed, guideline bodies | Yes |
| 2 | Registered trials | ClinicalTrials.gov | Yes |
| 3 | Mechanism / target / compound | Open Targets, ChEMBL | Yes, lower confidence |
| 4 | Provisional | bioRxiv/medRxiv (flagged in-product) | **No** — excluded from patient receipts |
| 5 | Context-only | openFDA | **Never** a receipt |

---

## 6. Feature-flag design — IMAGING = BUILD-NOW-USE-LATER

Imaging is non-live at launch, not absent. No architecture assumes imaging away.

- **Build now:** the image-capable ingestion path, the storage schema (imaging reports as text + image artefacts retained), and the MedGemma multimodal reasoning branch (`models/imaging/`). All present in the graph.
- **Ship dark:** `config/flags.js` sets `IMAGING_PIXEL_INTERPRETATION=OFF`. Only text — including imaging *reports* — is live and patient-facing.
- **Light later:** flip the flag after (a) clinical validation on an attested imaging eval set and (b) regulatory clearance for the expanded intended-use. No re-architecture; the pathway is wired, just dark.

Flag discipline: the flag gates *interpretation output*, not *ingestion*. Image artefacts still store and index at launch. The flag is read at the reasoning boundary; a dark flag routes the multimodal branch to `unknown` for any pixel-derived claim, so a mis-set flag fails safe, not open.

---

## 7. Ingestion licensing — the build fork

Surfaced as an explicit decision, defaulted, not silently chosen.

| Path | Licence | Default? | Trade-off |
|---|---|---|---|
| **OSS stack** — PaddleOCR → Presidio de-id → Terminology Service | Apache-2.0 / MIT / free (NCTS) | **YES (default)** | You own integration + clinical validation effort instead of outsourcing it — acceptable because the synthetic-data eval harness (Cat 6) is already the validation mechanism. $0 licence, self-hosted, AU-data-resident. |
| **Surya + Marker** (higher-fidelity structured PDF → JSON) | Revenue-gated — **verify** | Optional, behind flag | Best structured output. Flag a licence check against Breath-Ezy's revenue profile, same as Jamba. `STRUCTURED_OCR=OFF` until cleared. |
| **John Snow Labs Visual NLP / OCR** | Paid annual floating licence (`ocr:training`, `ocr:inference`); 30-day trials only | No — behind `OCR_ENGINE=jsl` flag | Pre-validated bundle with built-in de-id/DICOM. Fine for prototyping under trial; budget a licence for production. Not the launch default. |

**Directive:** implement the OSS path as the wired default. Implement the JSL adapter behind its flag so a later commercial decision is a config change, not a rebuild. Do not take a production dependency on any hobby/single-maintainer endpoint (per §6.1, the UK `drug-data-api` pattern is borrowable, the hosted endpoint is not).

---

## 8. Edge cases and failure modes — mitigations pre-placed

Each row states the trigger, the fail-safe behaviour, and where it is enforced. All fail *closed*.

| # | Trigger | Mitigation (pre-placed) | Enforced at |
|---|---|---|---|
| E1 | **Upstream rate limit / outage** (NCBI 10 rps, tap down) | Provision free NCBI key; cache aggressively in `knowledge/cache/`; on outage serve cached receipt if fresh, else return `unknown` (never a stale-but-unlabelled claim). Back-off + jitter on 429/5xx. | Evidence Broker cache/rate governor |
| E2 | **Claim with no resolvable receipt** | Broker returns `unknown`; claim does not persist and does not reach the patient. | Evidence Broker |
| E3 | **Terminology validation failure** | Term quarantined as free-text with a flag; never promoted to a coded field; ingestion continues for the rest of the document. | Terminology Service / ingestion Stage 4 |
| E4 | **OCR extraction error** (garbled, low-confidence field) | Field flagged low-confidence, routed to quarantine, excluded from coded FHIR mapping; document partially ingests rather than failing whole. De-id still runs first. | Ingestion Stage 1→2 |
| E5 | **Consent-scope violation** | Call refused at the gateway before any tap fires; logged to audit store; no partial data leaks. | Gateway / release seam |
| E6 | **Jurisdiction mismatch** (US-source data on an AU patient path) | `jurisdiction.js` tags the source; US-context receipts are barred from AU patient receipts (rank 5 / context-only never crosses); mismatch downgrades the claim to `unknown`. | Jurisdiction guard + Broker |
| E7 | **HARD STOP — pharmacology before CDS contracted** | Any dosing/interaction/contraindication request routes to `cds-adapter` (empty), returns `HARD_FAIL`, blocks the pipeline unconditionally. No override, no context-signal substitution. | Pharmacology firewall (trunk 8.0) |
| E8 | **Imaging flag mis-set** | Dark flag routes the multimodal branch to `unknown` for pixel-derived claims; a mis-set flag fails to `unknown`, never to an unvalidated interpretation. | `config/flags.js` read at reasoning boundary |
| E9 | **Preprint leaks toward a patient receipt** | `provisional:true` receipts are excluded from patient-facing receipts in code, not just docs. | Source ranker (rank 4) |
| E10 | **openFDA treated as a receipt** | `context_only:true` is barred from receipt status in code; usable only as an explanatory context signal. | Source ranker (rank 5) |

---

## 9. Test strategy

### 9.1 Per-module unit + integration tests

| Module | Unit tests | Integration test |
|---|---|---|
| Evidence Broker | Ranking correctness; `unknown` on no-resolve; receipt shape vs schema; cache hit/miss; rate back-off. | Broker over live bio-research endpoints returns valid receipts for known PMIDs/NCTs; preprint excluded; openFDA context-only. |
| Terminology Service | `$lookup`/`$validate-code` pass/fail; quarantine on unresolved. | Self-hosted Ontoserver loaded with SNOMED CT-AU + AMT resolves a known medicine and a known problem; unknown term quarantines. |
| Pharmacology firewall | `HARD_FAIL` on empty CDS slot; AMT validation passes; pipeline blocks on HARD_FAIL. | pharm-intent → cds-adapter (empty) → pharm-check HARD_FAIL blocks a synthetic dosing request. |
| Ingestion | OCR field accuracy; de-id removes PHI; JSON→FHIR mapping. | End-to-end: sample AU document → OCR → de-id → coding → FHIR resource in store; imaging report ingests as text. |
| Models | Jamba packet assembly; MedGemma text output shape; imaging branch dark returns `unknown`. | Jamba → MedGemma → Broker: receipt-less claim stripped to `unknown` before release. |
| Flags / jurisdiction | Flag read fails safe; US-source barred from AU receipt. | Mis-set imaging flag → `unknown`; US-context claim on AU path → `unknown`. |

### 9.2 The synthetic-data eval harness is the CI gate

The MOSTLY AI SDK (Apache-2.0, self-hosted, differential privacy) grows the eval corpus beyond the 303 clinician-attested cases, behind the case-factory (H4) interface. It becomes the factory feeding the `eval:cases` CI gate that **every model/behaviour change must pass**.

Two hard rules:

1. **Clinician-plausibility sign-off before any synthetic case gates a release.** A synthetic case is inert until a clinician attests its distribution is clinically plausible. Ungated synthetic cases never block or admit a release.
2. **Synthetic cases are labelled as synthetic in the eval store** and are never mistaken for real attested cases.

CI wiring: `eval:cases` stays CI-blocking (current PASS, ~49/45/7 distribution). New behaviour merges only if the eval set — real attested + clinician-signed synthetic — still passes the grounding invariant: every test claim carries a resolvable receipt or returns `unknown`.

---

## 10. Register binding + dependency-ordered task list

### 10.1 Register reconciliation

Marketplace-integration work items use the `MI-##` namespace and reconcile to concrete IDs where a component already exists. Ring: inside / on / outside. Action: NEW | INTEGRATE | OVERRIDE | PRESERVE.

| element_id | Cat | Action | Reconciles to | Ring | Rationale | Acceptance gate |
|---|---|---|---|---|---|---|
| MI-01 Evidence Broker service | 1 | INTEGRATE | `knowledge` MCP server + taps #1/#14/#15 | inside | Formalise the service face over harvested taps; the model never calls a tap directly. | Broker resolves a known claim to a valid receipt; `unknown` on no-resolve. |
| MI-02 Receipt reconciliation | 1 | REFINE | `receipt.schema.json` | inside | Add `jurisdiction_tag`/`confidence`/`source_rank`, additive-monotone. | Schema validates existing SPEC-CARD receipts + new fields. |
| MI-03 Source-ranking engine | 1 | NEW | — (policy in Broker) | inside | Encodes the fixed ranking + provisional/context-only exclusions. | Ranking table §5 reproduced by tests. |
| MI-04 Unknown-fallback arbiter | 1/5 | PRESERVE | verification pipeline + Broker | on | The invariant is the product; wire Broker as arbiter of model output. | Receipt-less model claim stripped to `unknown` in integration test. |
| MI-05 Terminology live wiring | 2 | REFINE | `terminology` MCP server (B6) | inside | Self-host Ontoserver (Ken's RF2 module) + AMT; no NCTS OAuth block. | Ontoserver resolves a known SNOMED CT-AU + AMT code. |
| MI-06 `$lookup`/`$validate-code` | 2 | PRESERVE | terminology-lookup schema | inside | Contract unchanged; codes write only on validate-pass. | Unresolved term quarantines; valid term codes. |
| MI-07 Terminology quarantine | 2 | PRESERVE | trunk 7.0 code lock-in | inside | Unresolved → free-text, never coded. | Free-text flag set on fail. |
| MI-08 Pharmacology AMT underlay | 3 | INTEGRATE | pharmacology server + AMT | on | Free correct medicines vocabulary now, under a future CDS. | AMT coding validates via Terminology. |
| MI-09 CDS empty slot | 3 | PRESERVE | `pharm-check` interface, B4 | on | Stable interface, empty until vendor contracted. | Empty slot returns HARD_FAIL; pipeline blocks. |
| MI-10 OCR OSS pipeline | 4 | NEW | ingestion/ | outside | PaddleOCR → Presidio → Terminology → FHIR; $0 default. | End-to-end sample doc ingests to FHIR store. |
| MI-11 OCR licensing fork | 4 | NEW | flags | outside | JSL/Surya behind flags; OSS default. | Flag switches engine without rebuild. |
| MI-12 De-id edge | 4 | NEW | ingestion/deid | outside | PHI removed by default; dev/eval never sees raw PHI. | Presidio strips PHI on sample. |
| MI-13 FHIR mapping | 4 | INTEGRATE | fhir-broker #16 | outside→inside | Structured JSON → FHIR → (AU)PAIR store. | Resource lands in store. |
| MI-14 MedGemma reasoner | 5 | NEW | Generation step | on | Clinical reasoner behind the Broker; text live, imaging dark. | Text output passes through Broker. |
| MI-15 Jamba assembler | 5 | NEW | context-injection step | on | Long-context packet (record+history+receipts). | Packet assembled within context budget. |
| MI-16 Imaging multimodal path | 5/4 | NEW (dark) | models/imaging | on/outside | Built now, flagged OFF; no re-architecture later. | Dark flag → `unknown` for pixel claims. |
| MI-17 Feature-flag registry | 5/6 | NEW | config/flags.js | cross-cut | Imaging OFF, JSL OFF, CDS EMPTY in one place. | Flags read fail-safe. |
| MI-18 MOSTLY AI eval harness | 6 | INTEGRATE | case factory H4 + `eval:cases` | outside | Grow corpus with DP synthesis, behind the CI gate. | Synthetic cases admit only after sign-off. |
| MI-19 Clinician-plausibility gate | 6 | PRESERVE | attestation workflow | outside→gate | No synthetic case gates a release before sign-off. | Unsigned synthetic case is inert. |
| MI-20 Jurisdiction guard | 1/8 | NEW | config/jurisdiction.js | on | US-source never AU-endorsed; drives E6 STOP. | US-context claim on AU path → `unknown`. |
| MI-21 Consent-scope enforcement | 9 | PRESERVE | release seam + audit store | on | Consent enforced at gateway, not per-connector. | Out-of-scope call refused + logged. |
| MI-22 Governance-vendor omission | 9 | OVERRIDE→OMIT | ToolUniverse H5 + seam H7 | n/a | Governed gateway already exists; adding Composio is sprawl. | Documented omission; no vendor wired. |
| MI-23 Cache + rate governor | 1 | NEW | knowledge/cache | outside→inside | NCBI 10 rps + aggressive cache; outage → cached-or-`unknown`. | Back-off on 429; stale served only if fresh-labelled. |

### 10.2 Cost / model policy for the coding agent

Referenced by each task below. Two axes — build-agent model and runtime model.

- **Build-agent routing:** cheapest model that clears the task. Boilerplate/scaffolding → Sonnet/Opus 4.8. Hard grounding, safety-invariant, and schema-contract logic → Fable 5 (strongest for hard logic). This matches the in-place override (Fable 5 planning/hard logic, Opus 4.8 scaffolding). Never route a safety-gate task to a scaffolding-tier model.
- **Runtime models:** MedGemma 4B default reasoner; 27B reserved for hard cases pending cost/benefit on the eval set. Jamba 1.5 Mini for long-context assembly (free under US$1B revenue). Provision directly from Hugging Face/GitHub — no marketplace dependency.

### 10.3 Dependency-ordered task list

Receipts land first. Each task: element_id · build-agent model · acceptance gate. Do not start a task before its dependencies pass.

**Phase 1 — Prove the receipts (inside the boundary).**

1. **MI-23** cache + rate governor · Sonnet · back-off on 429, cache hit/miss covered. *(No dependency; unblocks the taps.)*
2. **MI-02** receipt reconciliation · Fable 5 (schema-invariant) · schema validates old + new fields. *(Dep: none.)*
3. **MI-03** source-ranking engine · Fable 5 (safety logic) · §5 table reproduced; preprint/context-only excluded. *(Dep: MI-02.)*
4. **MI-01** Evidence Broker · Fable 5 · known claim → valid receipt; no-resolve → `unknown`. *(Dep: MI-01 taps, MI-02, MI-03, MI-23.)*
5. **MI-20** jurisdiction guard · Fable 5 (safety) · US-context on AU path → `unknown`. *(Dep: MI-02.)*
6. **MI-05** Terminology live wiring · Opus 4.8 · Ontoserver resolves SNOMED CT-AU + AMT code. *(Dep: none; parallel to Broker.)*
7. **MI-06 / MI-07** validate-code + quarantine · Fable 5 (invariant) · valid term codes, unresolved quarantines. *(Dep: MI-05.)*
8. **MI-18 / MI-19** MOSTLY AI harness + plausibility gate · Opus 4.8 (harness) / process (gate) · synthetic case admits only after clinician sign-off; `eval:cases` stays CI-blocking. *(Dep: case factory H4.)*
   - **Phase 1 exit gate:** every test claim on the 303-case eval set carries a resolvable receipt or returns `unknown`; every code writes only after `$validate-code`; source-ranking policy clinically signed off.

**Phase 2 — Gate the boundary.**

9. **MI-17** feature-flag registry · Sonnet · flags read fail-safe. *(Dep: none; needed before models/OCR ship.)*
10. **MI-15** Jamba assembler · Opus 4.8 · packet within context budget. *(Dep: MI-01.)*
11. **MI-14** MedGemma reasoner · Opus 4.8 (serving) / Fable 5 (Broker wiring) · text output passes through Broker to `unknown`-fallback. *(Dep: MI-01, MI-04, MI-15, MI-17.)*
12. **MI-16** imaging multimodal path (dark) · Opus 4.8 · dark flag → `unknown` for pixel claims. *(Dep: MI-14, MI-17.)*
13. **MI-12** de-id edge · Opus 4.8 · PHI stripped on sample. *(Dep: none.)*
14. **MI-10 / MI-11** OCR OSS pipeline + licensing fork · Opus 4.8 · sample AU doc → FHIR store; flag switches engine. *(Dep: MI-05, MI-06, MI-12, MI-13, MI-17.)*
15. **MI-13** FHIR mapping · Opus 4.8 · resource lands in (AU)PAIR store. *(Dep: MI-10, fhir-broker #16.)*
16. **MI-08 / MI-09** pharmacology AMT underlay + empty CDS slot · Fable 5 (safety gate) · AMT validates; empty slot HARD_FAILs; pipeline blocks. *(Dep: MI-05, MI-06.)*
    - **Phase 2 exit gate:** no model output reaches a patient except through the Broker; OCR ingestion runs end-to-end; imaging pixel path dark; pharmacology CDS slot explicit-and-empty; the E7 hard STOP holds under test.

**Phase 3 — Govern and confirm (outside the boundary).**

17. **MI-21** consent-scope enforcement · Fable 5 (safety) · out-of-scope call refused + logged. *(Dep: existing gateway + audit store.)*
18. **MI-22** governance-vendor omission · process · documented decision; no Composio/catalog wired. *(Dep: none.)*
    - **Phase 3 exit gate:** consent, audit, and jurisdiction enforced at the one in-place gateway; synthetic corpus growing behind the CI gate; no new governance vendor added; out-of-scope items (§1.4) confirmed dropped.

### 10.4 What still blocks a patient-facing release (not this increment)

This plan delivers receipts, gates, and governance confirmation. It does **not** open a patient path. The four-part patient-eligibility precondition and the open blockers remain org/regulatory/vendor inputs, not FLOW engineering:

- **B1** Portal UI + authenticated clinician signature + durable WORM gate-record storage (the one large buildable item; RETAIN C9 release blocker).
- **B2** MIRAGE corpus clinician attestation + volume top-up on live backends.
- **B3** AU-Core version-target ruling (0.3.0 pin vs vendored 2.0.1-ci).
- **B4** Pharmacology live vendor (MIMS-AU or equivalent + SafeScript WA) — the one gap none of the 67 assets closes.
- **B5** Investigation-parser lab reference-range clinical + regulatory sign-off + live lab source.
- **B7** Live runtimes/creds for fhir-broker, evidence taps, ToolUniverse, Synthea.

Each is wired-for and fail-safe today. None is engineering-blocked by this plan; each is an operator action. The pharmacology CDS gap (B4) stays exactly where the spec put it: an operator action, wired-for but empty until filled.

---

## 11. Bottom line

Wire the receipts first — Evidence Broker over the live evidence taps, Terminology Service on self-hosted Ontoserver with SNOMED CT-AU + AMT — mostly free and mostly integration, not construction. Gate second — MedGemma + Jamba behind the Broker, OSS OCR ingestion to FHIR, imaging dark, pharmacology CDS explicit-and-empty. Confirm governance third — the gateway already exists, so add nothing there and drop the vendors that would only build a labyrinth. Everything requiring a licence, a model decision, or a contract sits one ring out, behind an explicit gate. The grounding invariant holds throughout: a resolvable receipt, or `unknown`.
