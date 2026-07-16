# Case Corpus v2 — Phase 2 Design (the descent, and the three warrants)

> Status: DESIGN, plan-gated. No code until approved. Schema-first (`<engineering_standards>`).
> Builds on Phase 0/1 (PR #91 — the taxonomy contract). Feeds FL-40 Phase 3 (M3 long-list cases).

## 0. Plain-language summary

The case corpus is richly detailed on the **ascent** — the climb to a diagnosis (Observation: 522
omnibus fields) — and nearly blank on the **descent** — the management plan and safety-netting the
patient actually leaves with (CarePlan: 26 fields; the whole care-planning suite is thinner than one
ascent Observation). This phase completes the descent, using **FHIR R4 elements that already exist**
(we finish the map with symbols already in the legend; we do not invent a vocabulary). It also
settles, per field, **who may author it and whether it may grade the AI** — because a case is both a
scoring instrument and a durable clinical record, and those two roles want different rules.

## 1. What this corpus is, and is not (write this into the protocol)

A one-page truth, because tranche 2 makes every misunderstanding 14,000× more expensive:

- **The model is frozen.** Cases MEASURE the system; they do not TRAIN it. Behaviour comes from the
  knowledge datasets, the trunk prompts, and the pharmacology datastore — never from the corpus.
  "The system learns from more cases" is false *as stated*; the compounding is real but flows through
  **queryability, retrieval, QC-signal into the datastore, and optionality for a future deliberate
  fine-tune** — not through model weights.
- **The cases are synthetic.** What makes the corpus safe to grow is *syntheticity* (no privacy
  constraint) + zod validation (structure) + hash-sealing (integrity) + terminology receipts
  (joinability). NOT de-identification — hashing is tamper-evidence, zod is validation, and
  `ingestion/deid/presidio.js` is a separate component for *real* notes that does not apply here.
- **One principle, three hats.** The scoring-store firewall, "validate-never-author," and (for any
  future ML build) "never test on training data" are the SAME rule: *the thing being measured must
  not contaminate the measurement.* The provenance discipline below is what keeps every case
  uncontaminated for whatever it is later pointed at — eval, retrieval, or training.

## 2. The three warrants (the core discipline)

Every field on the descent side carries exactly one **warrant** — the thing that makes its value
trustworthy — and that warrant fixes whether the field may **score** the AI Doctor.

| Warrant | Who authors it | Example fields | May grade the AI? |
|---|---|---|---|
| **A — Clinician** | the SOAP note's clinician (attestation) | dose/route/frequency, necessity, indication rationale, `contraindications_in_this_case`, deprescribing note, safety-net escalation ladder, factors affecting resolution/complication | **YES** |
| **B — Derived** | a terminology receipt (`cases:verify-codes`), never a human choice | `amt_snomed_code`, `pbs_item_code`, `schedule`, FHIR resource anchoring, `interactions_present_reference` | **NEVER (mechanically)** |

**The line, stated sharply:** *derive the code from the clinician's own words; never let a tool
choose the word.* `drug_name: "amoxicillin"` (clinician) → AMT/PBS/schedule (facts about the thing
named) is legitimate and to be captured **aggressively** (operator ruling: uncaptured metadata is
value welded to the table, recoverable later only at re-attestation cost). A tool saying *"for
cellulitis, use amoxicillin"* is authoring the answer — forbidden.

**Group B is captured richly AND excluded from scoring by construction, not by intention.** The
scorer must be structurally unable to read a Group-B field; a contract test must prove it. (Today's
lesson on what intentions are worth.)

### 2a. The `interactions_to_check` split (operator ruling 2026-07-16)

One field name currently hides two different clinical objects. Split into two:

- **`interactions_flagged_for_this_patient`** — Warrant A. The interactions *this clinician judged
  relevant to THIS patient*. Clinical judgment. **Scoreable** — "did the AI flag what mattered here?"
- **`interactions_present_reference`** — Warrant B. Every interaction the named drugs have, per the
  datastore. A lookup. **Reference only, never scored** (scoring it would grade PharmCheck against
  PharmCheck — the circularity the firewall exists to prevent).

## 3. The descent omnibus expansion — the R4 mapping LADDER (not a binary)

The naive rule "map to R4, never invent" COLLIDES with itself where R4 has no home for a concept —
and safety-netting is the textbook case (operator question, 2026-07-16). FHIR R4 has **no
`SafetyNetting` resource and no `safetyNetting` element**: "safety netting" is a UK/AU clinical-
practice term (Neighbour, NICE, RCGP), not an international data-model concept, so it falls *between*
resources rather than into one. Forcing it into `Flag` or `DetectedIssue` would be a bad fit dressed
as standards-compliance. So the rule is a **three-tier ladder**, and every descent field declares
which tier it sits on:

- **Tier 1 — R4 has a faithful home.** Map to it directly. Most of the descent.
- **Tier 2 — no native home, but a standard COMPOSITION exists.** Assemble named-profile-style from
  existing resources, SNOMED-bound where the concept exists and receipt-gated (never a fabricated
  code). Safety-netting lives here: the warning-signs advice as `Communication`, the escalation rungs
  as `CarePlan.activity`/`ServiceRequest`, risk-over-time as `RiskAssessment.prediction`. Still
  "assemble from the legend," not inventing.
- **Tier 3 — genuinely no standard representation.** A **bespoke, explicitly-flagged local
  extension** (`x-local-extension: true` + a `rationale`), so a future reader knows it is OURS not
  FHIR's, and it can be re-homed if HL7 ever standardises it. This is the honest tier — the
  difference between "we invented a field" (bad) and "R4 does not cover this; here is our documented
  extension and why" (auditable, TGA-defensible). **`13_safety_netting_node` is ALREADY this** —
  `escalation_edges`/`baseline_safety_net_advice`/`triage_scoring` are bespoke *because they must be*,
  the correct response to a real FHIR gap. This phase does not "fix" node 13 into a stock resource;
  it FORMALISES it as a documented Tier-3 extension and gives its Tier-2 parts (the advice, the
  escalation actions) their FHIR composition + SNOMED bindings.

| Descent content (from the note) | Tier | FHIR home / representation | Warrant |
|---|---|---|---|
| Medication: drug / dose / route / frequency / duration | 1 | `MedicationRequest.dosageInstruction` | A |
| Medication: AMT code / PBS item / schedule | 1 | `MedicationRequest.medication[x]` coding + AU extensions | B |
| Follow-up plan / review timing / alternate management if first-line fails | 1 | `CarePlan.activity.scheduled[x]` + `.detail` | A |
| Factors affecting resolution / favouring complication | 1 | `RiskAssessment.prediction` (qualitative) | A |
| Behaviour-change steps | 1 | `Goal.target` + `CarePlan.activity.detail` | A |
| Care-team / referral targets | 1 | `CareTeam` + `ServiceRequest` | A (targets) / B (codes) |
| Safety-net warning-signs advice ("what to watch for") | 2 | `Communication` + SNOMED "advice about when to seek help" (receipt-gated) | A |
| Safety-net escalation ladder (self-care → phone → GP → urgent care → ED) | 2 | ordered `CarePlan.activity` rungs + `ServiceRequest` per level | A |
| Safety-netting node structure as a whole (tiers, minimum-viable-tier, escalation edges) | 3 | bespoke local extension (node 13), `x-local-extension` + rationale | A |

Node 13 already models `escalation_edges`, `contextual_modifiers`, `baseline_safety_net_advice`,
`triage_scoring` — its *schema* is sound; the descent omnibus expansion gives it a richer FHIR
vocabulary to anchor to, and protocol v2 makes the transformer *reach for* it.

**Additive only.** New optional fields; existing cases untouched. Omnibus version bumps; the 303
validate unchanged (same regression bar as the taxonomy).

## 4. The firewall map (the ascent/descent split IS the firewall)

- **Ascent omnibus resources** (Observation, Condition-as-reported, …) → feed the GREEN presentation
  layer (`01`, AI-Doctor-readable).
- **Descent omnibus resources** (CarePlan, Goal, RiskAssessment, safety-netting) → feed the RED
  sealed nodes (`12`, `13`) — the gold-standard answer key.

So enriching the descent enriches what the *answer key* can express — firewall-safe by construction,
because descent content belongs behind the firewall. A contract test asserts the partition: no
descent-omnibus field may land in `01`; no ascent presentation field may carry a sealed answer.

## 5. The 303 refresh — SCHEDULED (operator ruling 2026-07-16)

Re-transforming the 303 source notes through v2 and re-ingesting is the SAFE way to enrich them: it
mints a NEW sealed artifact and signs *that* — never edits sealed bytes under a live signature. It
does **not** avoid re-attestation (richer clinical content genuinely needs the clinician's warrant),
but that pass is confirmation ("this faithfully represents my note"), not authorship.

**SCHEDULED (operator ruling 2026-07-16):** the 303 will be re-transformed through v2 and re-ingested
as a refresh, not left thinner. Sequencing so it costs the least and delivers the most:
- it runs **after** protocol v2 + the QC harness exist (2d/2e) — refreshing before the protocol is
  finalised would mean doing it twice;
- it is a **fresh transform + fresh attestation**, never byte-surgery on a sealed file — a new sealed
  artifact, freshly signed;
- the re-attestation is confirmation ("this richer extraction faithfully represents my note"), and
  most of the *new* content is Warrant-B (receipt-gated codes) that never needed the signature at all,
  so the clinician's added burden is bounded to the Warrant-A descent additions;
- it flows as the **first batch through the standing v2 pipeline** — proving the refresh path on
  known-good cases before the ~1,150 new ones — rather than as a separate migration.
Tracked as `case-303-v2-refresh` (scheduled, sequenced behind 2d/2e).

## 6. Phases (each gated)

- **2a — Warrant + schema design (THIS DOC).** GATE: operator approves the three warrants, the R4
  map, and the firewall partition.
- **2b — Schema deltas + zod.** Node 12 (`interactions_*` split, Group-B code fields), node 13
  (descent anchoring), the omnibus descent expansion, all additive. `contract-*` proves the 303
  validate unchanged. GATE.
- **2c — Scorer firewall bar.** The scoring path made structurally unable to read a Group-B field;
  `test/contract-scorer-warrant-firewall.js` proves it by attempting the read and catching it. GATE.
- **2d — Protocol v2 + kit rebuild.** Selection criteria + descent-extraction instructions + the
  warrant rules + the §1 "what this is/isn't" page. 3-case pilot → `cases:ingest --dry-run` 0/0 with
  descent fields populated. GATE (the pilot judges v2 on 3, not 60).
- **2e — QC harness** (`case-qc.mjs`) — every node-12 medication through PharmCheck + terminology;
  disagreements to a worksheet; **flags never fills**; proven unable to write to `data/cases/`.

## 7. Contracts touched

- **Changed (additive):** `12_management_plan_node.schema.json` (interactions split; Group-B code
  fields marked `x-warrant: derived`), `13_safety_netting_node.schema.json` (Tier-2 composition for
  the advice + escalation actions; the node formalised as a Tier-3 `x-local-extension` with
  rationale), `data/digital_tablet_omnibus.json` + its version (descent resources to ascent-parity,
  each field carrying its `x-fhir-tier` 1/2/3). All backward-compatible. Every field declares BOTH
  `x-warrant` (who authors) and `x-fhir-tier` (how it is represented) — the two orthogonal questions.
- **New:** `case-qc` worksheet schema + zod; the scorer-warrant firewall test.
- **Unchanged:** the case-id regex, the taxonomy contract, every frozen pipeline file, the sealed-node
  firewall *mechanism* (this rides it, does not alter it).

## 8. Invariant check

Preserves every hard limit. Scoring-store firewall: reinforced (a new mechanical warrant bar).
No-autonomous-* : untouched — the QC harness reads and flags, never authors. Australian context: AMT/
PBS/AU-Core codes. Synthetic-only throughout. Nothing patient-facing moves. The `x-warrant: derived`
tag is the mechanism that makes "capture aggressively, never score" enforceable rather than aspired.

## 9. Register / gap impact

Closes (at 2e): `case-corpus-field-population-thin`. Advances: `case-taxonomy-unbuilt` (consumed by
the schemas). Opens: `omnibus-descent-underspecified` (Medium — the 522-vs-26 asymmetry, measured).
No blocker flips; feeds FL-40 Phase 3. FL-22 waived under the distribution ruling.

## 10. What is NOT in scope (guarding the edges)

- No id re-cut. No model training. No real-patient data. No de-identification path (synthetic).
- No new clinical *authority* for any tool — tools translate and fact-check; the clinician and the
  terminology receipt remain the only two warrants.
- The descent expansion stops at content with a scoring OR record function. A tag that is neither is
  scope creep, refused at design review — regardless of tier.
- Tier 3 (bespoke) is the EXCEPTION, not the escape hatch: a field only earns Tier 3 by first failing
  Tier 1 (no faithful R4 home) AND Tier 2 (no standard composition). "It was easier to invent one" is
  not a Tier-3 rationale. Every Tier-3 field carries a written reason a reviewer can reject.
