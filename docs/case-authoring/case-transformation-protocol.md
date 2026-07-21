# Breath-Ezy Case Transformation Protocol

**Augmented Digital Tablet — synthetic case ingestion instructions for Claude Chat**

- Protocol version: `case-transform-protocol:v2.0.0:2026-07-16`
- Companion (attach alongside this file): `digital_tablet_omnibus.json` (`Digital Tablet — Omnibus HL7 FHIR R4 Patient Record Schema` v1.1 — the descent expansion)
- **v2.0.0 (Case Corpus v2):** the DESCENT now matters as much as the ascent — a case is a clinical *record*, not just an intake. New in v2: the descent-completeness discipline (§4a), the three warrants (§1b + §8), the versioned taxonomy, and the "what this corpus is / is not" page (§1b). A v2 transform REACHES FOR the management + safety-netting map, captures codes aggressively as derived, and never lets a tool author the answer.
- Target repo: `Arepo-Medtech/Makoha` — case-set at `data/cases/<CASE_ID>/`
- Target schema version: case-set node schemas `1.0.0` (`data/schemas/*.schema.json`)

---

## 0. Plain-language summary (read first)

You are being asked to turn a **semi-structured clinical SOAP note** (`.txt`) into a **Breath-Ezy evaluation case**: a folder of **7 JSON node files plus 1 manifest**, split across a hard safety boundary called the **scoring-store firewall**.

The single most important rule in this entire document:

> **Three of the files are readable by the AI Doctor under test (`00`, `01`, `02`). Four of them are the sealed answer key (`10`, `11`, `12`, `13`) and the AI Doctor must NEVER see them.** If a diagnosis, differential, management decision, red-flag "answer", or triage tier leaks from the answer-key side into the AI-Doctor-readable side, the case is **invalid and dangerous** — it trains/tests the model on leaked answers. When in doubt about which side a fact belongs on, put it on the **sealed** side and flag it.

Two more rules that keep the output honest:

- **You (Claude Chat) cannot verify medical codes against the live terminology server, and you cannot compute file hashes.** So you never *claim* a code is verified and you never *invent* a hash digest. You emit **candidate** codes marked `unverified`, and you leave hash fields `null` for the repo's deterministic ingestion step to fill. Guessing either would be a fabrication — exactly what this system forbids.
- **A machine-transformed case is not clinician-reviewed.** Every case you produce is stamped `clinician_reviewed: false` / `source_type: "llm_generated_unreviewed"`. It cannot count toward the evaluation gate until a human clinician reviews it.

---

## 1. How to use this protocol

1. Start a new Claude chat. Attach: this `case-transformation-protocol.md`, `digital_tablet_omnibus.json`, **the 7 node schema files** `data/schemas/{00_case_envelope,01_presentation_layer,02_conversational_policy,10_ground_truth_node,11_symptom_links_node,12_management_plan_node,13_safety_netting_node}.schema.json`, **and** the reference case folder `data/cases/SPEC-CARD-04-00001/`. The **schemas are the authoritative contract** — this protocol is guidance, and if the two ever disagree, the schema wins (§7.0).
2. Send: *"Load the Case Transformation Protocol, the Digital Tablet, the 7 node schemas, and the reference case. Confirm you have all of them, then I will upload SOAP case files."*
3. Upload your `.txt` SOAP case files (see §11 for batch sizing).
4. For **each** case, Claude returns one complete case package as a **single `<CASE_ID>.casebundle.json`** (the default — see §7.9), which the repo ingestion splits into the 8 files under `data/cases/<CASE_ID>/`.
5. Run the case package through the repo's in-repo ingestion + validation (see §10) — that step computes the real hashes, runs the zod gate, and batch-checks the candidate codes against the terminology server. **Then** a clinician reviews it.

### Model recommendation
- **Bulk transform:** **Claude Sonnet 5** is acceptable, *because* every output is gated behind mandatory in-repo zod validation, terminology verification, and clinician review — Sonnet is fast and schema-faithful.
- **Diagnostically subtle / high-risk cases** (atypical presentations, zebras, anything where the *ground-truth reasoning* is the hard part): use **Claude Opus 4.8**. The answer-key nodes (`10`/`11`) carry the clinical reasoning that the whole evaluation depends on — spend the reasoning budget there.
- Do **not** use a small/fast model for the `10`–`13` nodes. Under-reasoned answer keys silently corrupt the eval.

### Why this is a Markdown protocol used *with* the omnibus (not one merged JSON)
The omnibus is the **FHIR field vocabulary** — it defines the `fhir_path` values (`Condition._freetext_HPC_tags.site_radiation`, `SDOH_Observations.full_SDOH_field_map`, `ClinicalImpression._freetext_reasoning_tags`, …) that the case files point into. This protocol is the **procedure**. Keeping them separate lets you update the field vocabulary and the transform rules independently, and keeps the instruction Claude reads compact. (If you specifically want a single merged JSON artifact instead, that can be produced — ask.)

---

## 1a. Two standing rules (operator rulings, 2026-07-16) — read before §2

**RULE 1 — the `case_id` is a NAME, not a claim.**
The id is an **opaque partition key** assigned at ingest. **`case_metadata` is authoritative.** Where
they disagree, the id is just a name — never derive specialty or difficulty from it, and never
rename a case to "fix" a disagreement.

*This is not a new policy; it is a description of what has always been true.* `eval-case-gate.mjs`
reads `case_metadata.difficulty_tier`, never the id. And the corpus proves it: the taxonomy code
`OPHTHAL` is 7 characters, the id regex allows `[A-Z]{2,6}`, so **six live cases carry
`SPEC-OPHTH-…` while their metadata says `["OPHTHAL"]`**. They have disagreed since ingest and
nothing broke, because nothing reads the id. The id cannot represent the taxonomy — it is a
constrained slot — which is exactly why it must not be trusted to.

**Why ids are never re-cut:** `case_id` appears inside all seven node files. Changing it rewrites
every file, breaks every sha256, and leaves the **clinician's attestation no longer covering the
bytes they signed**. That is a trust-chain operation, not a rename. Classification lives in
`case_metadata.specialty_tags` (multi-valued) and `coverage_matrix_tags`, both revisable at zero
cost to the seal.

**RULE 2 — 60/30/10 is a GUIDE, not a gate.**
The difficulty mix and the coverage matrix are design heuristics. `eval:cases` reports them and
must never block on them. **Do not re-derive a strict reading from planning artifacts** — that
reading is precisely what turned a heuristic into a defect classification (the register carried
`case-set-underpopulated` / "blocks: full 60/30/10 mix" against a set that was 301/301 attested,
gated and receipted). Author for **clinical value and test power**, not to hit a ratio; the rare and
the dangerous carry a set's teeth, and epidemiological realism tells you what is *common*, not what
is *hard*.

The canonical vocabulary for both rules is `data/taxonomy/case-taxonomy.json` (versioned +
checksummed). Both rules are carried inside it as data (`id_rule`, `distribution_rule`) so they
travel with the dataset rather than living only in prose someone can miss.

## 1b. What this corpus is, and is not (v2 — read before authoring the descent)

Three facts fix what your work is worth. Getting them wrong is expensive at 300 cases and ruinous at
14,000.

- **The model is FROZEN. Cases MEASURE the system; they do not TRAIN it.** The AI Doctor's behaviour
  comes from the knowledge datasets, the trunk prompts and the pharmacology datastore — never from
  this corpus. So your job is not to "teach the model the answer" — it is to record, faithfully and
  independently, what a competent clinician did, so the system can be *measured* against it.
- **These cases are SYNTHETIC.** What makes the corpus safe to grow is that it is synthetic (no real
  patient), schema-valid, hash-sealed, and code-receipted — NOT that it is de-identified (there is
  nothing to de-identify). Never write a real patient's data into a case.
- **One principle, three hats.** The scoring-store firewall (§5), "validate never author" (§8), and —
  for any future ML use of this corpus — "never test a model on data it trained on" are the SAME
  rule: *the thing being measured must not contaminate the measurement.* This is why a tool may
  translate and fact-check but must never author the answer. Every case you build with clean
  provenance stays uncontaminated for whatever it is later pointed at.

## 2. The mental model — what a Breath-Ezy case is

A case is a folder `data/cases/<CASE_ID>/` containing:

| File | Side of firewall | Purpose |
|---|---|---|
| `00_case_envelope.json` | 🟢 AI-Doctor-readable | Metadata, difficulty, provenance, version anchoring, node refs |
| `01_presentation_layer.json` | 🟢 AI-Doctor-readable | **What the AI Doctor sees**: patient-reported demographics, complaint, history |
| `02_conversational_policy.json` | 🟢 AI-Doctor-readable* | Simulated-patient behaviour: what is volunteered vs gated behind questions |
| `10_ground_truth_node.json` | 🔴 **SEALED answer key** | True diagnosis, differentials, red flags, pitfalls, telehealth limits |
| `11_symptom_links_node.json` | 🔴 **SEALED answer key** | Symptom→diagnosis weighted edges, clusters, expected investigations |
| `12_management_plan_node.json` | 🔴 **SEALED answer key** | Correct/incorrect meds, education, follow-up, scoring rubric |
| `13_safety_netting_node.json` | 🔴 **SEALED answer key** | Correct triage tier, escalation edges, under-/over-triage taxonomy |
| `case_manifest.json` | integrity layer | Source hash, per-file hashes (pending), candidate codes, review status |

**\* Important nuance about `02`.** The AI Doctor is *allowed* to be driven by `02`, but `02` also contains scoring metadata (`is_diagnosis_critical`, `scoring_weight`, `ground_truth_ref` back-links). Those scoring fields are for the **patient-simulator and scorer**, not for injection into the model's context. Author `02` fully, but understand: in the live pipeline only the *behavioural* parts (`patient_response_template`, `patient_deflection_template`, trigger questions) drive the simulated patient — the `ground_truth_ref` / `is_diagnosis_critical` / `scoring_weight` fields must be stripped before anything reaches the AI Doctor. Never put the actual diagnosis name or the word "NSTEMI/ACS/etc." into a `clinical_fact` phrasing that gives away the answer; describe the *observable fact* ("discomfort radiates to jaw on exertion"), not the *conclusion* ("cardiac ischaemia").

---

## 3. Input format — the SOAP long-form note

Your input `.txt` files use this semi-structured "AUC Clinical Case Files SOAP Format Long Form" layout. Not every field is always present. Typical sections:

- **Header** (first ~3 lines): condition name; care context (e.g. "Acute Urgent Care"); a one-line symptom tetrad/summary.
- **VISIT CONTEXT** — Case ID, Reason for Visit, Location, Present at Visit, Urgency Justification.
- **SUBJECTIVE** — Chief Complaint (often a verbatim/bystander quote), History of Present Illness, Functional Status, Social/Safety Concerns.
- **OBJECTIVE** — Vitals, General, Physical Exam, Environmental Observations, Medication Reconciliation.
- **ASSESSMENT** — Primary Diagnosis (+ status), Differentials (with rule-in/out reasoning), Risk Level.
- **CLINICAL REASONING SUMMARY** — the diagnostic narrative.
- **CLINICIAN CARE PLAN** — Interventions, Behavioural Change, Home Services, DME/Safety, Follow-up.
- **SAFETY-NETTING ESCALATION PLAN** — escalation triggers.
- **PATIENT INFORMATION / SAFETY-NETTING ADVICE / PATIENT EDUCATION / SMS INFORMATION / SMS EDUCATION** — patient-facing outputs.

---

## 4. The transformation — section → file map

This is the core routing table. **Left = where the source content lives. Right = which case file and side of the firewall it flows into.**

| SOAP source section | → Destination file | Firewall side | Notes |
|---|---|---|---|
| Header condition name, care context | `00` metadata + `10` primary_diagnosis | 🟢/🔴 | The *name* of the diagnosis is answer-key. `00` only records neutral tags. |
| VISIT CONTEXT → Reason for Visit, Location, Present at Visit | `01` opening_complaint + demographics context | 🟢 | Patient-facing framing only. |
| VISIT CONTEXT → Urgency Justification | `13` rationale_for_baseline_tier | 🔴 | Justifies the *correct* tier — sealed. |
| SUBJECTIVE → Chief Complaint (verbatim) | `01` opening_complaint.verbatim_patient_text | 🟢 | Keep the patient's own words. Strip any clinician interpretation. |
| SUBJECTIVE → HPI (patient-reportable parts) | `01` history_as_reported.symptom_narrative | 🟢 | Only what the patient/bystander would actually say. |
| SUBJECTIVE → HPI (red-flag features) | `02` disclosure_items + `10` red_flags + `11` symptoms | 🟢+🔴 | See §5 gating rules. |
| SUBJECTIVE → PMH / meds / allergies / FHx / social | `01` history_as_reported.* | 🟢 | As the patient reports them (lay wording, uncertainty preserved). |
| OBJECTIVE → patient-obtainable vitals/findings (home/wearable device, self-report, video-visible) | `01` objective_data_offered (tagged) | 🟢 | Patient could obtain/observe it. See §6. |
| OBJECTIVE → clinician-only exam/labs (auscultation, palpation, bloods, 12-lead ECG, imaging) | `10` + `11` (physical_sign / investigation_result) + `10` telehealth_limits | 🔴 | **NOT `01`.** Requires clinician/equipment the patient doesn't operate. See §6. |
| ASSESSMENT → Primary Diagnosis | `10` primary_diagnosis | 🔴 | + SNOMED/ICD-10-AM candidate codes. |
| ASSESSMENT → Differentials (+ reasoning) | `10` differential_progression | 🔴 | Model the progression across stages (see §7). |
| ASSESSMENT → Risk Level | `10` + `13` triage inputs | 🔴 | |
| CLINICAL REASONING SUMMARY | `10` pathophysiology_summary + diagnostic_reasoning_pitfalls | 🔴 | |
| CLINICIAN CARE PLAN → Interventions/meds | `12` medications + behavioural_change_actions | 🔴 | Tag each with `necessity` (§8). |
| CLINICIAN CARE PLAN → Follow-up | `12` follow_up_plan | 🔴 | |
| SAFETY-NETTING ESCALATION PLAN | `13` escalation_edges + baseline_safety_net_advice | 🔴 | |
| PATIENT EDUCATION / PATIENT INFORMATION | `12` patient_education_points | 🔴 | These are the *model answers* the AI Doctor should produce. |
| SMS INFORMATION / SMS EDUCATION | `12` patient_education_points (channel-tagged) or note | 🔴 | Optional; capture as education points. |

---

## 4a. Descent completeness (v2 — the way down matters as much as the climb)

**The problem v2 exists to fix:** earlier transforms were richly detailed on the ASCENT (the climb to
a diagnosis — history, symptoms, differentials) and nearly blank on the DESCENT (the management plan
and safety-netting the patient actually leaves with). Measured: across the existing set, node-12
`dose_route_frequency` was populated 31% of the time, `amt_snomed_code` 1%, `interactions_to_check`
0.2%, `pbs_item_code` 0%. The map was adorned to the summit and blank on the way down. A note that
richly describes a management plan and yields a case with an empty `12`/`13` has **left its most
valuable content on the table** — and behind an attested seal, recoverable later only at
re-attestation cost.

**So, for every case, actively HARVEST the descent.** If the source note contains it, it goes in:

- **Medication, fully:** `drug_name`, `dose_route_frequency`, `duration`, `necessity`,
  `indication_rationale`, `contraindications_in_this_case`, and — where management is *stopping* a
  drug — `deprescribing_note`. (Dose rules unchanged: only from the note/guideline, never synthesised;
  no paediatric dose — flag for in-person review.)
- **Interactions — mind the split (v2):** `interactions_flagged_for_this_patient` = the interactions
  the note's clinician judged relevant to THIS patient (clinical judgment — scoreable). Do NOT dump
  every interaction the drug has; that is `interactions_present_reference`, a derived lookup you leave
  for the QC harness, not something you author.
- **The escalation ladder (`13`):** the safety-netting rungs the note gives —
  self-care → telehealth re-contact → GP same-day → after-hours → urgent care → ED → 000 — each with
  its trigger and timeframe. Maps to the omnibus `CarePlan.safety_netting_escalation` (Tier 2).
- **The warning-signs advice (`13`):** "what to watch for, and what it means." Maps to omnibus
  `Communication` (Tier 2).
- **Prognostic factors (`10`/`13`):** factors favouring resolution vs favouring complication / delayed
  recovery. Maps to omnibus `RiskAssessment.prognostic_factors` (Tier 1).
- **Behaviour-change steps (`12`):** the non-pharmacological plan — the omnibus
  `CarePlan.behaviour_change_activities` (Tier 1).
- **Follow-up + alternate management if first-line fails (`12`):** review timing and the "if this
  doesn't work, then…" branch.

**Codes — capture AGGRESSIVELY, as derived (v2).** For any drug/condition the *clinician named*,
assign the AMT / PBS / SNOMED / schedule candidate codes (§8). These are **derived** (a fact about the
thing named), not authored answers — capture them richly. What you must NOT do is let a code choose
the clinical content: `drug_name: "amoxicillin"` → its AMT code is fine; a code deciding *that
amoxicillin is the answer* is forbidden. The line is in §8 and §1b.

**The two questions every descent field answers** (mirrors the schema's `x-warrant` / `x-fhir-tier`):
*who makes it trustworthy* — the clinician (scoreable) or a terminology receipt (derived, reference) —
and *how FHIR represents it* — a native R4 home (Tier 1), a standard composition (Tier 2, e.g. safety-
netting = Communication + CarePlan.activity), or a documented local extension (Tier 3, e.g. node 13
as a whole, because FHIR R4 has no native safety-netting resource).

## 5. Firewall partition rules (hard constraints)

1. **`00`/`01`/`02` must be answer-free.** Read each of the three green files back and ask: *"Could a reader deduce the diagnosis, the correct triage tier, or which symptoms are the red flags, purely from this file?"* If yes, you have leaked. Fix it.
2. **The diagnosis name appears only in `10` (and derived refs in `11`/`12`/`13`).** Never in `00`, `01`, or `02`. `00` uses neutral `specialty_tags` (e.g. `["CARD"]`) and `diagnosis_category` — not the diagnosis.
3. **Red-flag features are described observationally in `02`, and only *named as red flags* in `10`.** In `02`, `clinical_fact` = the observable finding ("discomfort spreads to the jaw with exertion"); the fact that it *is* a red flag (`is_red_flag`, `scoring_weight`, `red_flag_ref`) is scoring metadata that the live pipeline strips before the model sees it.
4. **The correct triage tier lives only in `13`.** `01`/`02` never state urgency conclusions.
5. **`case_manifest.json` records the firewall assertion explicitly** (which files are sealed) so ingestion can enforce it.
6. **If the source note blends answer and presentation** (common — SOAP notes are written by the clinician who already knows the answer), you must actively *de-anchor* the presentation layer: rewrite it as the patient would present *before* the diagnosis was known.

---

## 6. Telehealth reprojection (critical — most SOAP notes are in-person)

The source notes are frequently written from a **physically-present** clinician's point of view (they take vitals, palpate, auscultate, even perform CPR). **Breath-Ezy is telehealth** and by charter **cannot** perform a physical examination or measure vitals without a connected device — but it **can** receive data the patient offers from a home/wearable device or reports directly. So OBJECTIVE content splits by *who could obtain it*:

1. **Patient-OBTAINABLE objective data CAN go into `01_presentation_layer` — tagged.** Anything the patient can offer over chat — home BP cuff, pulse oximeter, smartwatch HR/single-lead ECG, thermometer, glucometer, weight, or a finding visible on video ("my ankle looks swollen") — enters `01_presentation_layer.objective_data_offered[]`, each item carrying `{type, value, source, verified}`:
   - `value` is a **string** in the patient's own words with units ("150/95 mmHg", "96%") — never a bare structured number.
   - `source` ∈ `patient_home_device` · `patient_wearable` · `patient_reported` · `video_observable` · `caregiver_reported`.
   - `verified` is **almost always `false`** — it means "an established input to this encounter," **not** clinician-measured gold-standard. Add a `reliability_caveat` where the reading may be unreliable (uncalibrated cuff, single reading, motion artifact) — good cases test whether the AI Doctor weights self-reported data appropriately.
2. **Clinician-only findings do NOT go into `01` — they stay sealed.** Anything requiring a clinician's hands or lab/equipment the patient does not operate — auscultation, palpation, professional examination maneuvers, venepuncture/bloods, troponin, 12-lead ECG, imaging — belongs on the sealed side:
   - `10_ground_truth_node.telehealth_limits_for_this_case.cannot_determine_via_chat` — true but clinician-only findings, **and**
   - `11_symptom_links_node.symptoms[]` entries with `symptom_type: "physical_sign"` or `"investigation_result"` and `elicitation_method: "requires_specific_investigation"` — sealed as answer key.
   - Rule of thumb: *could this patient obtain or observe it themselves?* Yes → `01.objective_data_offered` (tagged). No → sealed in `10`/`11`.
   - Narrative sensations a patient/bystander would *say* ("I feel sweaty/clammy", "he's turned blue and isn't breathing normally") remain reported history in `01`/`02`; the clinician's *measurement* of the same thing ("central cyanosis on exam", "SpO2 unrecordable on our monitor") stays sealed.
3. **In-person interventions become recognition + escalation, not action.** If the source shows the clinician doing CPR/AED/defibrillation, the telehealth-correct behaviour in `12`/`13` is: **recognise the emergency, direct the bystander to call 000, and give dispatcher-style CPR/AED guidance** — the AI Doctor does not perform the procedure. Record the actual in-person interventions in `10` as "what the correct emergency pathway is", and make the `13` escalation the telehealth-appropriate action (T5 / call 000).
4. **`encounter_setting`** in `00` is `telehealth_chat` unless the source explicitly indicates a video consult (`telehealth_video`) or a simulated in-person handoff (`in_person_simulated_handoff`).
5. **`certainty_achievable_via_telehealth`** in `10.primary_diagnosis` must reflect telehealth reality: usually `presumptive_pending_workup` or `cannot_diagnose_remotely`, rarely `clinical_diagnosis_confirmed`, essentially never `confirmed_gold_standard` for anything needing bloods/imaging/ECG.

---

## 7. Per-file output contracts

Emit each file as valid JSON conforming to `data/schemas/<file>.schema.json` (v1.0.0). Required (`*`) top-level keys are listed; populate optional keys whenever the source supports them. Use the worked reference case `data/cases/SPEC-CARD-04-00001/` as the gold-standard shape — match its depth and style.

### 7.0 Hard conformance rules (read before authoring any node)

The 7 node schemas are **strict**. Prose in this protocol is a summary; the schema file is the contract. These rules are where real-world output most often fails — obey them mechanically:

1. **No unknown fields.** Every node object has `additionalProperties: false`. You may use **only** the keys defined in the schema / present in the reference case. Do **not** invent fields (real failures seen: `channel`, `reporter`, `bystander_state`, `source_note_reference`). If the source has data with no home in the schema, put it in a `transform_flag`, not a new field.
2. **`null` is not allowed — omit instead.** The schemas type optional fields as `string`/`integer`/`object`/`array`, not nullable. If a value is unknown, **leave the key out entirely**. Never write `"age": null`, `"reviewer_id": null`, `"snomed_ref": null`, `"dose_route_frequency": null`. (The **only** place `null` is legal is `case_manifest` hash fields — the manifest is not schema-gated.)
3. **An object field is always an object; an array field is always an array.** Never collapse one to a placeholder string. `"not obtainable in this acute moment"` is **wrong** for `past_medical_history` (it's an array → use `[]` or omit) and for `social_history_volunteered` (an object → omit or fill). `contact_nok` is an object `{relationship, available}`, never a string.
4. **Enums verbatim.** Fields with an enum accept **only** the listed values (see the §Appendix and the schema). Do not invent `direct_question`, `volunteered`, or prose sentences where an enum (e.g. a `T0–T5` tier) is required.
5. **Use the reference case's key names exactly.** Do not paraphrase keys. `symptom_narrative` uses `severity_patient_description`, `location_as_patient_describes`, `what_makes_it_better`, `what_makes_it_worse`, `associated_symptoms_volunteered`, `previous_episodes` — **not** `severity`/`location`/`better`/`worse`/`associated`/`previous`. `differential_progression[]` uses `differential` (singular), not `differentials`.
6. **Refs are objects or single strings per the schema — check which.** `02.disclosure_items[].ground_truth_ref` is an **object** `{red_flag_ref?, symptom_item_ref?, escalation_edge_ref?}`. `13.escalation_edges[].red_flag_ref` / `disclosure_item_ref` are **single strings**, not arrays. `snomed_ref`/`loinc_ref` are **objects** `{system, code, display}`, never a bare code string.
7. **Self-validate before emitting.** Mentally (or, if you have a tool, actually) validate each sub-object against its attached schema. If you cannot make a field conform, omit it and add a `transform_flag` — never force an invalid shape.

> The single most common failure is treating this protocol's prose as the contract. It isn't. **The attached schema file is.** When unsure of a shape, copy the reference case.

### 7.1 `00_case_envelope.json`
Required: `case_id*`, `schema_version*` (`"1.0.0"`), `case_metadata*`, `digital_tablet_anchoring*`, `node_refs*`. Optional: `coverage_matrix_tags`, `created_at_utc`, `last_reviewed_at_utc`.

```json
{
  "case_id": "<SPEC-{SPECIALTY}-{DD}-{SEQ} — see §9.1>",
  "schema_version": "1.0.0",
  "case_metadata": {
    "difficulty_tier": "<see §9>",
    "diagnosis_category": "common | important_not_to_miss | zebra_rare",
    "specialty_tags": ["CARD"],
    "age_band": "neonate|infant|child|adolescent|adult|older_adult",
    "encounter_setting": "telehealth_chat",
    "provenance": {
      "source_type": "llm_generated_unreviewed",
      "clinician_reviewed": false,
      "guideline_references": ["<if the source cites any; else []>"],
      "intentional_test_features": ["<what this case probes — anchoring, premature closure, etc.>"]
    }
  },
  "digital_tablet_anchoring": {
    "digital_tablet_version": "1.0",
    "fhir_version": "R4 (4.0.1)",
    "snomed_edition": "SNOMED CT Australian Edition 20240301",
    "au_core_version": "0.3.0",
    "icd10am_edition": "ICD-10-AM 12th Edition",
    "amt_version": "AMT — Australian Medicines Terminology (current at build date <YYYY-MM-DD>)",
    "terminology_server": "https://r4.ontoserver.csiro.au/fhir"
  },
  "node_refs": {
    "presentation_layer_ref": "01_presentation_layer.json",
    "conversational_policy_ref": "02_conversational_policy.json",
    "ground_truth_node_ref": "10_ground_truth_node.json",
    "symptom_links_node_ref": "11_symptom_links_node.json",
    "management_plan_node_ref": "12_management_plan_node.json",
    "safety_netting_node_ref": "13_safety_netting_node.json"
  },
  "coverage_matrix_tags": {
    "fhir_resources_exercised": ["Patient", "Condition", "Observation"],
    "red_flags_present": true,
    "requires_investigation_request": true,
    "requires_in_person_review": true,
    "involves_pharmacology_check": false,
    "primary_digital_tablet_part": "Part_A"
  },
  "created_at_utc": "<YYYY-MM-DDT00:00:00Z>"
}
```
> **Omit, do not null (rule §7.0.2).** `reviewer_id`, `review_date`, and `last_reviewed_at_utc` are **left out entirely** until a real clinician reviews — the schema forbids `null`. The source `.txt` filename does **not** go in `00` (it would both violate the schema and leak the diagnosis via the filename) — it lives only in `case_manifest.source.filename` (§7.8).

### 7.2 `01_presentation_layer.json` (🟢 answer-free)
Required: `case_id*`, `demographics*`, `opening_complaint*`, `history_as_reported*`. Optional: `psychosocial_profile`, `paediatric_context` (populate when `age_band` is neonate/infant/child/adolescent), `objective_data_offered`, `digital_tablet_field_map`.
- `demographics`: `age` (integer — **omit if unknown**, never null), `sex_at_birth`, `occupation`, `living_situation`, `geographic_context` (`RA1_major_city`…`RA5_very_remote` — omit if not inferable), `language_and_literacy` (**object** `{primary_language, english_proficiency, health_literacy_level}` — omit if unknown), `contact_nok` (**object** `{relationship, available}` — **not** a string).
- `opening_complaint`: keys `verbatim_patient_text`, `stated_reason_for_presenting_today`, `encounter_type_patient_expectation` **only** (no `reporter` — `additionalProperties:false`). If the Chief Complaint is a bystander quote, keep it verbatim inside `verbatim_patient_text` and note the reporter *inside that text*, not as a new field.
- `history_as_reported`: keys **exactly** — `symptom_narrative`, `past_medical_history` (**array**; `[]` or omit if not obtainable — never the string "not obtainable"), `current_medications_as_reported` (**array**), `allergies_as_reported` (**array**), `family_history_as_reported` (**array**), `social_history_volunteered` (**object** — omit if none). All in lay/patient wording.
  - `symptom_narrative` keys (use these **verbatim**): `onset`, `duration`, `character`, `severity_patient_description`, `location_as_patient_describes`, `timing_pattern`, `what_makes_it_better`, `what_makes_it_worse`, `associated_symptoms_volunteered`, `previous_episodes`, `functional_impact`. Omit any you can't fill — do **not** use short aliases (`severity`/`location`/`better`/`worse`).
- `objective_data_offered[]` (optional): patient-obtainable objective data per §6 rule 1 — each `{type, value (string, with units), source (enum: patient_home_device | patient_wearable | patient_reported | video_observable | caregiver_reported), verified (almost always false), device_validated?, timing?, fhir_path?, reliability_caveat?}`. Only put here what the patient could obtain/observe themselves; clinician-only exam/labs stay sealed in `10`/`11`.

```json
"objective_data_offered": [
  { "type": "blood_pressure", "value": "150/95 mmHg", "source": "patient_home_device", "device_validated": false, "verified": false, "timing": "this morning", "reliability_caveat": "single reading on an uncalibrated home cuff" },
  { "type": "spo2", "value": "96%", "source": "patient_wearable", "verified": false }
]
```
- **Do not** include clinician exam findings, diagnosis, or urgency conclusions. Patient-obtainable vitals are the *only* objective data allowed on this side, and only when tagged.

### 7.3 `02_conversational_policy.json` (🟢 behaviour; scoring fields simulator-only)
Required: `case_id*`, `disclosure_items*`. Optional: `patient_initiated_exchanges`, `deflection_behaviours`, `consultation_end_conditions`.
- Each `disclosure_items[]`: `item_id` (`DI-00N`), `clinical_fact` (**observational, not conclusory**), `fhir_path`, `ros_category` (enum), `disclosure_gate` (enum — most red flags are `revealed_on_specific_targeted_question`), `trigger_question_examples[]`, `patient_response_template`, `patient_deflection_template` (**omit if none** — not null), `is_red_flag`, `is_diagnosis_critical`, `scoring_weight` (enum), `expected_elicitation_turn` (enum), `ground_truth_ref` (**object** `{red_flag_ref?, symptom_item_ref?, escalation_edge_ref?}` — **not** a bare string like `"RF-001"`), optional `snomed_ref` (**object** `{system, code, display}`).
- `consultation_end_conditions`: `max_turns`, `end_on_management_plan`, `end_on_emergency_escalation`, `minimum_items_before_management` (**array** of item IDs, e.g. `["DI-001","DI-002"]` — **not** an integer).

### 7.4 `10_ground_truth_node.json` (🔴 sealed)
Required: `case_id*`, `node_type*` (`"ground_truth"`), `primary_diagnosis*`, `pathophysiology_summary*`, `differential_progression*`, `red_flags*`. Optional: comorbidities, diagnostic_reasoning_pitfalls, risk_scores, telehealth_limits_for_this_case, clinician_review_notes, guidelines_referenced.
- `primary_diagnosis`: name, snomed_code + snomed_display (**candidate**), icd10am_code, certainty_achievable_via_telehealth (enum), verificationStatus_fhir (enum), primary_fhir_path.
- `differential_progression[]`: one entry per stage (e.g. `after_opening_complaint`, `after_red_flag_screen`, `final`); each entry has key **`differential`** (singular — an array), whose items carry `diagnosis`, `position` (enum), `should_be_considered`, `evidence_basis`, `disclosure_items_that_change_position`. Plus a `scoring_note` per stage.
- `red_flags[]`: `red_flag_id` (`RF-00N`), `description`, `status` (enum), `disclosure_item_ref`, `clinical_significance`, `if_missed_consequence`, `safety_netting_edge_ref`.
- `diagnostic_reasoning_pitfalls[]` (optional): **objects** `{pitfall_name, description}` — **not** bare strings.
- `clinician_review_notes`: **omit** until reviewed (string, no null).

### 7.5 `11_symptom_links_node.json` (🔴 sealed)
Required: `case_id*`, `node_type*` (`"symptom_links"`), `symptoms*`. Optional: symptom_clusters, investigation_recommendations_expected.
- `symptoms[]`: `symptom_id` (`SYM-00N`), `symptom_name`, `symptom_type` (enum), `present_in_case`, `fhir_path`, `snomed_ref`/`loinc_ref` (**objects** `{system, code, display}` — **omit if none**, never a bare string or null), `disclosure_item_ref` (link back to `02` for gated ones), `elicitation_method` (**enum** — `history_question_sufficient` | `directed_clinical_question_required` | `requires_physical_examination` | `requires_specific_investigation`; **not** `volunteered`/`direct_question`), and `diagnostic_weight_edges[]` — each edge `{diagnosis, edge_type (enum), strength (enum), likelihood_ratio?, evidence_basis}`. This is the weighted symptom→diagnosis graph; invest reasoning here.
- `symptom_clusters[]` (optional): keys `cluster_id`, `cluster_name`, `constituent_symptom_ids` (**not** `member_symptom_ids`), `target_diagnosis`, `clinical_significance`, `cumulative_strength`, `all_items_required`.
- `investigation_recommendations_expected[]`: `investigation_name` (**not** `name`), `priority` (enum), `unlocks_symptom_id` (**omit if none** — no null), `rationale` — including the ones the AI Doctor should **not** over-order (`priority: "not_recommended"`).

### 7.6 `12_management_plan_node.json` (🔴 sealed)
Required: `case_id*`, `node_type*` (`"management_plan"`), `medications*`, `follow_up_plan*`, `scoring_rubric*`. Optional: allied_health_referrals, integrative_alternative_therapies, behavioural_change_actions, patient_education_points.
- `medications[]`: `drug_name`, `drug_class`, `amt_snomed_code` (candidate — **omit if none**, no null), `necessity` (enum — including the **negative** ones `should_NOT_recommend` / `not_indicated_here`, which encode errors of commission), `indication_rationale`, `dose_route_frequency` (**only where clinically defined by the source/guideline — never invent a dose; omit if none**), `requires_prescription`, `pbs_subsidised`, `contraindications_in_this_case`.
- `behavioural_change_actions[]` (optional): **objects** `{domain, specific_action, rationale, necessity}` — **not** bare strings.
- `patient_education_points[]` (optional): **objects** `{point, necessity, fhir_path?}` — `necessity` is **required** per item; there is **no** `channel` field (`additionalProperties:false`). Fold any SMS/voice distinction into the `point` text or a `transform_flag`.
- `follow_up_plan` (**required**): keys `interval`, `modality`, `what_to_reassess`, `trigger_for_earlier_review`, `care_plan_type` (enum) — **not** `immediate`/`post_event`.
- `scoring_rubric`: `must_include_items`, `acceptable_alternatives`, `errors_of_omission`, `errors_of_commission`, `minimum_domains_required`, `passing_threshold_notes`. For T5/emergency cases, state the automatic-FAIL condition explicitly.

### 7.7 `13_safety_netting_node.json` (🔴 sealed)
Required: `case_id*`, `node_type*` (`"safety_netting"`), `correct_baseline_tier*` (T0–T5), `escalation_edges*`, `baseline_safety_net_advice*`, `triage_scoring*`. Optional: rationale_for_baseline_tier, minimum_viable_tier_for_pass, contextual_modifiers, clinical_uncertainty_handling, digital_tablet_field_map.
- Tier meanings: **T0** self-care · **T1** routine GP (1–2 wk) · **T2** prompt GP (24–48 h) · **T3** urgent same-day / urgent care · **T4** ED (hours; self-transport) · **T5** call 000 ambulance (minutes; life-threatening).
- `escalation_edges[]`: `edge_id` (`ESC-00N`), `trigger_sign_or_symptom`, `target_tier` (enum), `time_bound_condition`, `red_flag_ref` (**single string**, not an array), `disclosure_item_ref` (**single string**), `rationale`, `communication_template`, `is_mandatory_to_communicate`, `contextual_modification` (**omit if none** — no null).
- `baseline_safety_net_advice` (**required, object**): `{default_tier_advice, contact_method, after_hours_advice, documentation_for_gp}` — **not** a plain string.
- `clinical_uncertainty_handling` (optional, **object**): `{key_uncertainty, correct_response_to_uncertainty, wrong_response_to_uncertainty}` — **not** a plain string.
- `triage_scoring`: `under_triage_critical_threshold` (**tier enum** `T0–T4`), `over_triage_threshold` (**tier enum** `T1–T5`) — **not** prose sentences; `mandatory_escalation_edges`, `time_bound_specificity_required`, and `triage_error_taxonomy` (keys `critical_under_triage`, `serious_under_triage`, `moderate_over_triage` — each `{ai_assigns_tier:[…], failure_description, patient_harm_scenario}`). **Under-triage is weighted 3× over-triage** — be conservative.

### 7.8 `case_manifest.json` (integrity layer — new)
This is the "hashing + grounding" record. **You do not compute hashes and you do not verify codes** — you populate everything else and leave those two for the repo.

```json
{
  "case_id": "<CASE_ID>",
  "case_set_version": "case-set:vNEXT",
  "schema_version": "1.0.0",
  "protocol_version": "case-transform-protocol:v2.0.0:2026-07-16",
  "generator": {
    "model": "<claude-sonnet-5 | claude-opus-4-8>",
    "generated_at_utc": "<YYYY-MM-DDThh:mm:ssZ>"
  },
  "source": {
    "filename": "<original .txt filename>",
    "original_case_id": "<the source note's own ID, e.g. AUC-021 — the ONLY place it is recorded>",
    "sha256": null
  },
  "review": {
    "clinician_reviewed": false,
    "review_status": "pending_clinician_review",
    "source_type": "llm_generated_unreviewed"
  },
  "firewall_assertion": {
    "ai_doctor_readable": ["00_case_envelope.json", "01_presentation_layer.json", "02_conversational_policy.json"],
    "scoring_store_sealed": ["10_ground_truth_node.json", "11_symptom_links_node.json", "12_management_plan_node.json", "13_safety_netting_node.json"]
  },
  "files": [
    { "path": "00_case_envelope.json", "sha256": null },
    { "path": "01_presentation_layer.json", "sha256": null },
    { "path": "02_conversational_policy.json", "sha256": null },
    { "path": "10_ground_truth_node.json", "sha256": null },
    { "path": "11_symptom_links_node.json", "sha256": null },
    { "path": "12_management_plan_node.json", "sha256": null },
    { "path": "13_safety_netting_node.json", "sha256": null }
  ],
  "codes_manifest": [
    {
      "code_system": "SNOMED_CT | ICD_10_AM | LOINC | AMT | PBS",
      "code": "<code>",
      "display": "<display>",
      "used_in": ["10_ground_truth_node.json:primary_diagnosis"],
      "verification_status": "unverified_pending_terminology_receipt"
    }
  ],
  "transform_flags": []
}
```
- `files[].sha256` and `source.sha256` = **`null`**. The repo's ingestion step computes SHA-256 over the canonical bytes. **Never write a hash digest yourself — a guessed digest is a fabricated record.**
- `codes_manifest` = every SNOMED/ICD-10-AM/LOINC/AMT/PBS code you used anywhere, each `unverified_pending_terminology_receipt`. The repo batch-verifies them against the terminology MCP server, which produces the receipts.
- `transform_flags` = anything you had to flag rather than guess (see §12).

### 7.9 Bundle Output Mode — **the default single-file output**

Emit each case as **one file**: `<CASE_ID>.casebundle.json` — a single JSON object whose top-level keys *are* the 8 files, plus a `_bundle` header telling the repo how to split it. One case = one fenced ```json block, nothing else. This is the default; producing the 8 files as separate blocks is still valid but harder to handle.

Why one JSON envelope (not a delimited-text file with banner headers): the repo splits it with a single `JSON.parse` + write-each-key — no fragile banner-regex — and every sub-object is already canonical JSON ready to hash and zod-validate.

**Firewall note:** the bundle is an **authoring/transport artifact only**. It is split *before* anything reaches the pipeline, so the AI Doctor never sees a bundle — it only ever sees the split `00/01/02`. The `_bundle.firewall_assertion` lets ingestion enforce which split files are sealed. (Recommend gitignoring `*.casebundle.json` so bundles never land in `data/cases/`.)

```json
{
  "_bundle": {
    "format": "breath-ezy-casebundle",
    "bundle_version": "1.0.0",
    "protocol_version": "case-transform-protocol:v2.0.0:2026-07-16",
    "case_id": "<CASE_ID>",
    "split_map": {
      "00_case_envelope":         "00_case_envelope.json",
      "01_presentation_layer":    "01_presentation_layer.json",
      "02_conversational_policy": "02_conversational_policy.json",
      "10_ground_truth_node":     "10_ground_truth_node.json",
      "11_symptom_links_node":    "11_symptom_links_node.json",
      "12_management_plan_node":  "12_management_plan_node.json",
      "13_safety_netting_node":   "13_safety_netting_node.json",
      "case_manifest":            "case_manifest.json"
    },
    "firewall_assertion": {
      "ai_doctor_readable":   ["00_case_envelope", "01_presentation_layer", "02_conversational_policy"],
      "scoring_store_sealed": ["10_ground_truth_node", "11_symptom_links_node", "12_management_plan_node", "13_safety_netting_node"]
    }
  },

  "00_case_envelope":         { "...": "full node exactly per §7.1" },
  "01_presentation_layer":    { "...": "§7.2" },
  "02_conversational_policy": { "...": "§7.3" },
  "10_ground_truth_node":     { "...": "§7.4" },
  "11_symptom_links_node":    { "...": "§7.5" },
  "12_management_plan_node":  { "...": "§7.6" },
  "13_safety_netting_node":   { "...": "§7.7" },
  "case_manifest":            { "...": "§7.8 — hashes still null" }
}
```

**Bundle rules (in addition to every per-file rule above):**
- Each sub-object is the **complete, unchanged** node from §7.1–§7.8 — bundling changes packaging only, never content. All §5 firewall, §6 telehealth, §8 code, and hashing rules still apply per sub-object.
- Every node's own `case_id` **must equal** `_bundle.case_id`.
- Do **not** duplicate the `_bundle` metadata inside the nodes, and do **not** add a top-level `case_id` outside `_bundle`.
- Hashes stay `null` and codes stay `unverified` — same as §7.8. You still never compute a digest.
- Run the §13 self-QA checklist against the **sub-objects** before emitting the bundle.

**How the repo splits it (deterministic — for reference; you don't do this):**
1. `JSON.parse` the bundle; assert `_bundle.format === "breath-ezy-casebundle"` and that every node's `case_id` equals `_bundle.case_id`.
2. For each `split_map` key except `case_manifest`: serialize canonically (`JSON.stringify(node, null, 2) + "\n"`, UTF-8), write to `data/cases/<CASE_ID>/<target>`, compute SHA-256.
3. Fill `case_manifest.files[].sha256` + `source.sha256`, run the zod gate per node, run the firewall leak-check on `00/01/02`, register `codes_manifest` for terminology verification.
4. Write `case_manifest.json` last. (This split is part of the plan-gated `cases:ingest` tool — see §10.)

---

## 8. Code grounding — candidate, never verified; derived, never authored (v2)

**The v2 warrant frame.** A field is trustworthy for exactly one of two reasons, and the reason fixes
whether it may grade the AI Doctor:
- **Clinician-warranted** — the note's clinician authored it (dose, necessity, the interactions they
  flagged, the escalation plan). This is the answer key; it is **scoreable**.
- **Derived** — a terminology receipt, not a human choice (AMT/PBS/SNOMED/schedule codes, the
  full interactions-present lookup). Captured **aggressively** because uncaptured metadata is value
  welded to an attested seal — but **never scored**, because grading the AI against a lookup from the
  same knowledge base it reads is the system marking its own homework (`interactions_present_reference`
  and the code fields carry `x-warrant: derived` in the schema; the scorer is structurally barred from
  reading them).
- **The line:** derive a code from what the clinician *named*; never let a tool choose *what to name*.

- Assign SNOMED CT-AU, ICD-10-AM, LOINC, and AMT codes from your knowledge as **candidates**, and register **every one** in `codes_manifest` with `verification_status: "unverified_pending_terminology_receipt"`.
- **Never state or imply a code is verified, current, or NCTS-confirmed.** You have no live terminology connection. The repo's terminology server is the only thing that can turn a candidate into a receipted, trusted code.
- **Doses are not codes and are the most dangerous field.** Only record a `dose_route_frequency` where the source note or a cited guideline gives it. Never synthesise a dose. Paediatric dosing especially: if the case is under-18 and needs dosing, do **not** produce a dose — set the management to "flag for in-person review" and add a `transform_flag`.
- If you are unsure of a code, it is better to emit `code: null` + a `transform_flag` than a plausible-looking wrong code.

---

## 9. Metadata inference rules

Infer these from the source; when the signal is weak, pick the more conservative option and add a `transform_flag`.

### 9.1 Case ID — assign a canonical `SPEC-` ID (do not reuse the source ID)

The schema **mandates** `case_id` matching `^SPEC-[A-Z]{2,6}-0[1-7]-[0-9]{5}$`. The source note's own ID (e.g. `AUC-021`) is **not** valid here — record it only in `case_manifest.source.original_case_id`. Build the canonical ID as **`SPEC-{SPECIALTY}-{DD}-{SEQ}`**:

- **`{SPECIALTY}`** — 2–6 uppercase specialty code from the primary `specialty_tags` entry: `CARD` (cardiology), `RESP`, `GI`, `NEURO`, `MSK`, `ENDO`, `RENAL`, `DERM`, `MH` (mental health), `PAEDS`, `EMG` (emergency/undifferentiated), `ID` (infectious), `HAEM`, `OBGYN`, `URO`, `ENT`, `OPHTH`. Pick the single best-fit primary specialty.
- **`{DD}`** — two-digit **difficulty-tier ordinal**, from `difficulty_tier`: `01` straightforward · `02` atypical_presentation · `03` red_herring_laden · `04` atypical_presentation_high_risk · `05` rare_condition · `06` multi_morbidity_complex · `07` communication_barrier. (This is why the tier is visible in the ID.)
- **`{SEQ}`** — 5-digit zero-padded sequence, **per specialty-difficulty bucket**. You cannot know the repo's existing count, so set a **provisional** seq from the source number (e.g. `AUC-021` → `00021`) and add a `transform_flag`: *"case_id SEQ is provisional — maintainer to confirm/reassign within the SPEC-{SPECIALTY}-{DD} bucket."* The `cases:ingest` step / maintainer finalises it.

Worked example: the `Cardiac Arrest AUC-021.txt` case (specialty `CARD`, difficulty `straightforward`) → **`SPEC-CARD-01-00021`**, `original_case_id: "AUC-021"`. (Reclassify specialty to `EMG` if the reviewer prefers.) `case_id` must be **identical** across all 7 nodes, the manifest, and `_bundle.case_id`.

- **`difficulty_tier`** (enum): `straightforward` · `atypical_presentation` · `red_herring_laden` · `atypical_presentation_high_risk` · `rare_condition` · `multi_morbidity_complex` · `communication_barrier`. Signal: how much the ASSESSMENT/REASONING emphasises atypicality, anchoring traps, or comorbidity load.
- **`diagnosis_category`**: `common` · `important_not_to_miss` · `zebra_rare`. Anything emergency/time-critical that is easy to under-call → `important_not_to_miss`.
- **`correct_baseline_tier`** (T0–T5): from Urgency Justification + Risk Level + Safety-Netting. Emergencies (arrest, ACS, sepsis, stroke) → **T5**. Bias toward the higher tier under uncertainty.
- **`specialty_tags`**: short codes (`CARD`, `RESP`, `ENDO`, `NEURO`, `GI`, `MSK`, …) — never the diagnosis name.
- **`age_band`** from stated age: <1 mo `neonate`; <1 yr `infant`; 1–12 `child`; 13–17 `adolescent`; 18–64 `adult`; ≥65 `older_adult`. If `child`/`adolescent`/`infant`/`neonate`, populate `01.paediatric_context` and remember the no-paediatric-dosing rule (§8).
- **`intentional_test_features`**: name the cognitive traps the case exercises (anchoring, premature closure, availability/framing/visceral bias, atypical presentation, red herring).

---

## 10. Where the real gates run (not in this chat)

You produce candidate files. The authoritative gates run **in the repo** after you hand off:
1. **zod validation** — each node is validated against `data/schemas/*.schema.json`. Your job is to make them conform; the repo enforces it.
2. **Hashing** — a deterministic ingestion step computes SHA-256 over canonical bytes and fills the `null` hash fields. This is the medicolegal integrity record; it must be machine-computed, never chat-authored.
3. **Terminology verification** — `codes_manifest` is batch-checked against the terminology MCP server, producing receipts; unresolved codes are flagged.
4. **Scoring-store firewall check** — ingestion confirms nothing in `00`/`01`/`02` leaks answer-key content.
5. **Clinician review** — a human clinician reviews and, only then, flips `clinician_reviewed → true`, sets `source_type → llm_generated_reviewed` (or higher), and stamps `reviewer_id`/`review_date`. **Only reviewed cases count toward the evaluation gate** (case pass ≥0.70; ≥80% of set passing; zero critical under-triage; ≥90% verification compliance).

> Recommended repo counterpart (not yet built — flagged for the engineering agent): an `npm run cases:ingest -- <bundle>` tool that **splits the `.casebundle.json` (§7.9)**, fills hashes, runs the zod + firewall + terminology checks, and reports. Until it exists, split the bundle and run the node schemas through the existing validators manually.

---

## 11. Batch sizing & context

- **Input is cheap, output is the constraint.** Each `.txt` is ~2–4 KB; a full case bundle is ~15–25 K output tokens (the reference case is ~67 KB of JSON). Producing many complete cases in one response risks truncation and quality drop-off on the reasoning-heavy `10`/`11` nodes.
- **Recommended:** attach up to **10–20 `.txt` files per chat session** (input side), but generate **one `.casebundle.json` per response**. After each case, say "next" and Claude produces the next one. This keeps each answer key fully reasoned and un-truncated.
- Do **not** ask for all 20 cases in a single response.
- If a response is getting long, Claude should finish the current case cleanly and stop, rather than compressing the sealed nodes.

---

## 12. What to flag rather than guess (`transform_flags`)

Add a `transform_flags[]` entry (short string) — and never silently invent — when:
- **Case ID conflict.** (The sample `Cardiac Arrest AUC-021.txt` has filename/header "AUC-021" but `Case ID: AUC-022` in the body.) Do not pick one silently — record the filename ID in `case_manifest.source.original_case_id`, assign the canonical `SPEC-` `case_id` per §9.1, and flag the discrepancy for human resolution.
- **Provisional case_id SEQ** (§9.1) — always flag that the maintainer confirms/reassigns the sequence.
- A required schema field has **no source signal** (e.g. no age given). **Omit** the optional field (never `null`, per §7.0.2), or emit the most conservative safe value for a required one, and flag it.
- A **dose** would be required but is not in the source (§8).
- A **code** is uncertain (§8).
- The source is written **in-person** and needed telehealth reprojection (§6) — flag that the presentation layer was de-anchored.
- Anything that would touch the **scoring-store firewall** ambiguously — flag and seal.

---

## 13. Self-QA checklist (run before emitting each case)

- [ ] **Validated each sub-object against its attached schema (§7.0)** — no unknown fields, no `null` (omit instead), objects/arrays never rendered as strings, enums verbatim, reference-case key names exact.
- [ ] `case_id` is a canonical `SPEC-{SPECIALTY}-{DD}-{SEQ}` (§9.1), identical across all 7 nodes + manifest + `_bundle.case_id`; source ID recorded only in `case_manifest.source.original_case_id`.
- [ ] Output is a single `<CASE_ID>.casebundle.json` (§7.9) with a `_bundle` header + all 8 keys; each sub-object valid JSON.
- [ ] `10`/`11`/`12`/`13` contain the answer; `00`/`01`/`02` do **not** — no diagnosis name, no tier, no "these are the red flags" in the green files; **no source filename in `00`** (it leaks the diagnosis — manifest only).
- [ ] `01` contains only patient-reportable/obtainable content; no clinician exam findings, no diagnosis, no urgency conclusions.
- [ ] Telehealth reprojection applied: patient-obtainable vitals → `01.objective_data_offered` (tagged, `verified` almost always false); clinician-only exam/labs/ECG sealed into `10`/`11` + `telehealth_limits`.
- [ ] `02` `clinical_fact`s are observational, not conclusory; scoring fields present but understood as simulator-only.
- [ ] `clinician_reviewed: false`, `source_type: "llm_generated_unreviewed"`, review fields (`reviewer_id`/`review_date`/`last_reviewed_at_utc`) **omitted**, not null.
- [ ] Every code registered in `codes_manifest` as `unverified_pending_terminology_receipt`; no code claimed as verified.
- [ ] No invented doses; paediatric dosing → flag-for-review, not a dose.
- [ ] All hash fields `null`; no digest fabricated.
- [ ] Enum fields use only allowed values (§Appendix).
- [ ] `transform_flags` captures every conflict/guess/gap.
- [ ] Under-triage caution applied — tier is conservative.

---

## Appendix — allowed enum values (from `data/schemas` v1.0.0)

- **age_band:** neonate · infant · child · adolescent · adult · older_adult
- **difficulty_tier:** straightforward · atypical_presentation · red_herring_laden · atypical_presentation_high_risk · rare_condition · multi_morbidity_complex · communication_barrier
- **diagnosis_category:** common · important_not_to_miss · zebra_rare
- **encounter_setting:** telehealth_chat · telehealth_video · in_person_simulated_handoff
- **source_type:** guideline_classic_presentation · deidentified_real_pattern_derived · deliberately_constructed_edge_case · llm_generated_reviewed · llm_generated_unreviewed
- **certainty_achievable_via_telehealth:** confirmed_gold_standard · clinical_diagnosis_confirmed · presumptive_pending_workup · cannot_diagnose_remotely
- **verificationStatus_fhir:** confirmed · provisional · differential · refuted
- **disclosure_gate:** volunteered_unprompted · revealed_on_general_question · revealed_on_specific_targeted_question · revealed_if_rapport_established_first · denied_unless_directly_and_sensitively_asked · revealed_only_on_examination_or_test_request · not_disclosable_in_this_encounter
- **ros_category:** Constitutional · Cardiovascular · Respiratory · Gastrointestinal · Genitourinary · Neurological · Musculoskeletal · Dermatological · Haematological · Endocrine · Psychiatric · HEENT · Obstetric_gynaecological · Vascular · SDOH · Pharmacological · Examination_finding · Investigation_result
- **scoring_weight:** critical · high · medium · low
- **expected_elicitation_turn:** early · mid · late · any
- **status (red_flag):** present_and_disclosed · present_and_gated · present_and_non_disclosable · absent_screened_negative · absent_not_asked
- **symptom_type:** symptom · pertinent_negative · physical_sign · investigation_result · risk_factor · functional_finding
- **edge_type:** supports · argues_against · pathognomonic_for · red_flag_for · non_specific_neutral · required_to_exclude
- **strength:** definitive · strong · moderate · weak
- **position:** leading · close_second · reasonable_alternative · important_not_to_miss · excluded
- **necessity:** must_recommend · recommended_first_line · acceptable_alternative · second_line_if_first_fails · should_NOT_recommend · not_indicated_here
- **priority:** immediate · urgent · semi_urgent · routine · not_recommended
- **evidence_grade:** strong_evidence_adjunct · moderate_evidence_reasonable · weak_evidence_patient_preference_only · no_evidence_should_not_recommend · contraindicated_or_harmful
- **care_plan_type:** GPMP · TCA · MHP · CDM · none_required
- **target_tier / correct_baseline_tier:** T0 · T1 · T2 · T3 · T4 · T5

---

*End of protocol. Source of truth for all field contracts is `data/schemas/*.schema.json` (v1.0.0) and the reference case `data/cases/SPEC-CARD-04-00001/`. If this protocol and a schema disagree, the schema wins — report the drift.*
