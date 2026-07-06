# CASEBUNDLE-SHAPING-CONTRACT.md — Synthea → `.casebundle.json` mapping (H4 case factory)

> **Read before building the case-factory shaper.** Sits under FLOW_PLAN H4. It defines the exact object
> the Synthea + chatty-notes generator must emit so the EXISTING `scripts/ingest-case-bundles.mjs` accepts
> it — validated, firewall-clean, split into `data/cases/<CASE_ID>/`. The generator does NOT write
> `data/cases/` and does NOT invent a path; it produces a `<CASE_ID>.casebundle.json` and the existing
> ingest does the rest.
> **Authority:** live repo (`scripts/ingest-case-bundles.mjs`, `data/schemas/*`) > this contract > FLOW_PLAN.
> If the live ingest tool and this document disagree, the tool wins — re-read it and correct this file.
> Version 0.1.0 · 2026-07-06 · Verified against ingest-case-bundles.mjs + the three presentation schemas.

---

## §1 — What ingest accepts, in one paragraph

`ingest-case-bundles.mjs` admits files matching `*.casebundle.json`. For each bundle it: validates all
**seven nodes** against `data/schemas/*.schema.json` (ajv, draft 2020-12); checks `case_id` consistency
across `_bundle` and every node; runs a **field-scoped firewall** over the injectable sub-fields only;
verifies the **honesty gate** (all `case_manifest.files[].sha256` null, all codes `unverified_pending_
terminology_receipt`); then **splits** the bundle into `data/cases/<CASE_ID>/{00..13}.json` +
`case_manifest.json`, computing the real SHA-256 per file. A bundle that fails any gate is **refused, not
written**. `--reseq` resolves a `case_id` collision by assigning the next free global seq; `--dry-run`
validates and writes nothing.

**The load-bearing consequence for H4:** Synthea produces *presentation-side* clinical reality (files 00,
01, 02). The **scoring nodes (10–13) are NOT Synthea's to author** — they hold the hidden diagnostic truth
and are the clinician-attested protocol's job. But the bundle must still *carry* well-formed 10–13 nodes for
ingest to validate and split. See §5 for how H4 handles this without the generator inventing answer keys.

---

## §2 — Top-level `.casebundle.json` shape (exact)

The bundle is a single JSON object with **exactly these keys** — the seven node keys, `case_manifest`, and
the `_bundle` wrapper. Ingest reads `bundle._bundle`, `bundle["00_case_envelope"]`, etc.

```json
{
  "_bundle": {
    "format": "breath-ezy-casebundle",
    "case_id": "SPEC-<SPECIALTY>-<DD>-<NNNNN>"
  },
  "00_case_envelope":        { "case_id": "…", "…": "…" },
  "01_presentation_layer":   { "case_id": "…", "…": "…" },
  "02_conversational_policy":{ "case_id": "…", "…": "…" },
  "10_ground_truth_node":     { "case_id": "…", "…": "…" },
  "11_symptom_links_node":    { "case_id": "…", "…": "…" },
  "12_management_plan_node":  { "case_id": "…", "…": "…" },
  "13_safety_netting_node":   { "case_id": "…", "…": "…" },
  "case_manifest":            { "case_id": "…", "…": "…" }
}
```

Hard requirements ingest enforces (`checkBundle`):

- `_bundle.format` **must equal** `"breath-ezy-casebundle"` — anything else is refused.
- `_bundle.case_id` **must match** `^SPEC-[A-Z]{2,6}-0[1-7]-[0-9]{5}$` (`CASEID_RE`).
- **Every** node key in the list above must be present, and each node's own `case_id` must equal
  `_bundle.case_id`. A missing key or a mismatched `case_id` is refused.
- Each of the seven nodes must pass its schema validator.
- `case_manifest.files[].sha256` must **all be null** (ingest computes them — a non-null hash is refused).
- `case_manifest.codes_manifest[].verification_status` must **all be** `unverified_pending_terminology_
  receipt` (the honesty gate — codes are unverified until the terminology receipt pass, M6/M11).

---

## §3 — CASE_ID construction

`SPEC-{SPECIALTY}-{DD}-{NNNNN}`:

- `SPECIALTY` — 2–6 uppercase chars from the standard list: `CARD RESP GI NEURO MSK DERM PAEDS MH ENDO ID
  OBS URO OPHTHAL SURG EMG ONCO RHEUM HAEMAT RENAL VASC`. Derived from the case's primary specialty.
- `DD` — the two-digit difficulty code, and it **must equal** `00_case_envelope.metadata.difficulty_tier`
  (the tier appears in the id so the distribution is visible without opening the file):
  `01 straightforward · 02 atypical_presentation · 03 red_herring_laden · 04 atypical_presentation_high_risk
  · 05 rare_condition · 06 multi_morbidity_complex · 07 communication_barrier`.
- `NNNNN` — zero-padded 5-digit seq. **Do not hand-assign to avoid collisions** — emit any placeholder seq
  and run ingest with `--reseq`, which assigns the next free GLOBAL seq in that specialty+difficulty bucket
  and records the original→assigned mapping. This is the 2026-07-05 id-scheme that ended cross-series
  collisions; H4 relies on it rather than reinventing sequencing.

---

## §4 — Presentation nodes: what Synthea + chatty-notes map onto

These are the only nodes carrying generated clinical content. Map Synthea FHIR + the chatty-notes narrative
onto the **required** fields of each schema; keep everything synthetic.

### 4.1 — `00_case_envelope` (metadata; never shown to the AI Doctor)

Required: `case_id`, plus `metadata{ difficulty_tier, diagnosis_category, specialty_tags, provenance }`.

| Field | Source | Rule |
|---|---|---|
| `case_id` | = `_bundle.case_id` | SPEC pattern |
| `metadata.difficulty_tier` | H4 generation intent | one of the 7 enum values; **must match `DD`** in the id |
| `metadata.diagnosis_category` | Synthea condition class | enum per schema |
| `metadata.specialty_tags[]` | Synthea condition → specialty | first tag = primary; from the code list §3 |
| `metadata.provenance.source_type` | **`deliberately_constructed_edge_case`** (Synthea = synthetic construct) | one of the 5 enum values |
| `metadata.provenance.clinician_reviewed` | **`false`** at generation | see §6 — generated cases are unreviewed until attested |

**Do not** set `clinician_reviewed:true` or fill `reviewer_id`/`review_date` — the generator has no authority
to attest. `source_type:deliberately_constructed_edge_case` is the honest label for a Synthea case (it is a
synthetic construct, not a de-identified real pattern or a guideline transcription).

### 4.2 — `01_presentation_layer` (the AI Doctor MAY read — firewall-scanned)

Required: `demographics{ age, sex_at_birth }`, `opening_complaint{ verbatim_patient_text }`,
`history_as_reported`.

| Field | Source | Rule |
|---|---|---|
| `demographics.age` | Synthea patient age | integer; drives `age_band` if set |
| `demographics.sex_at_birth` | Synthea patient | per schema enum |
| `opening_complaint.verbatim_patient_text` | **chatty-notes narrative**, patient voice | **firewall-scanned — must NOT contain the full `10.primary_diagnosis.name`** (see §7) |
| `history_as_reported` | chatty-notes narrative + Synthea conditions/observations, in patient voice | firewall-scanned |
| `objective_data_offered` | Synthea vitals/observations the patient could self-report | firewall-scanned; **no raw lab numbers presented as clinician-grade** — patient-reported only, and the sanitiser policy (M10) still applies downstream |

`psychosocial_profile` and `digital_tablet_field_map`, if present, are simulator-direction / mapping
metadata — **NOT firewall-scanned**, so they may reference the condition. Do not put patient-voice content
there to dodge the firewall; that inverts the design.

### 4.3 — `02_conversational_policy` (partly AI-Doctor-facing — firewall-scanned)

Required: `disclosure_items[]`, each with `clinical_fact` + `patient_response_template`.

| Field | Source | Firewall |
|---|---|---|
| `disclosure_items[].clinical_fact` | Synthea condition/observation to be elicited | **scanned** |
| `disclosure_items[].patient_response_template` | chatty-notes, how the patient reveals it | **scanned** |
| `disclosure_items[].patient_deflection_template` | optional | scanned |
| `patient_initiated_exchanges[].patient_text` | optional | scanned |
| `deflection_behaviours[].deflection_text_template` | optional | scanned |

Everything the patient-simulator says must read as a patient talking — symptoms, worries, history — never
the diagnosis label.

---

## §5 — Scoring nodes (10–13): present, valid, but NOT generator-authored

Ingest requires all seven nodes to validate and split. But H4's generator has **no authority to author the
diagnostic answer key** — that is the clinician-attested protocol's role, and letting a generator write the
scoring truth would create circular evaluation (the machine grading itself against machine-invented truth).

**Resolution — the generator emits schema-valid PLACEHOLDER scoring nodes, flagged unreviewed:**

- `10_ground_truth_node.primary_diagnosis.name` = the intended synthetic diagnosis Synthea was seeded to
  represent (this is the generation *input*, so it is known — it is not inference). This drives the firewall
  check in §7, so it must be the true label.
- `11/12/13` = schema-minimal valid stubs (symptom links, management plan, safety-netting) sufficient to
  pass the validators, explicitly marked as **draft/unreviewed** via `00.metadata.provenance.clinician_
  reviewed:false`.
- All `codes_manifest[].verification_status` = `unverified_pending_terminology_receipt`.
- All `case_manifest.files[].sha256` = null.

The clinician-attested protocol then **replaces or ratifies** 10–13 and flips `clinician_reviewed:true` — at
which point the case enters the scoring set (§6). **The generator never opens any existing `data/cases/*/
10–13` to copy from** — it authors its own placeholder from its own seed, firewall intact.

> If the team prefers that H4 not emit scoring nodes at all, the alternative is a two-phase bundle: generate
> 00/01/02 + a `10.primary_diagnosis.name` seed only, and have the authoring kit complete 11–13 before
> ingest. Pick one at the Phase-2 gate. Either way, **Synthea does not author the final scoring truth.**

---

## §6 — `case_manifest` and the honesty gate

Required shape (the fields ingest reads):

```json
"case_manifest": {
  "case_id": "SPEC-…",
  "files": [ { "node": "00_case_envelope", "sha256": null }, … ],   // sha256 ALL null — ingest computes
  "codes_manifest": [ { "code": "…", "system": "…",
                        "verification_status": "unverified_pending_terminology_receipt" }, … ],
  "review": { "clinician_reviewed": false }                          // generator cannot attest
}
```

- **`files[].sha256` all null** — a non-null value is refused (ingest owns hashing).
- **Every code `unverified_pending_terminology_receipt`** — refused otherwise. Codes get verified later
  against the terminology server (M6 mock receipts; M11 live NCTS).
- **`review.clinician_reviewed:false`** at generation. A case with `false` may be used for development but is
  **excluded from evaluation runs** until a clinician sets it true with `reviewer_id` + `review_date`. This
  is what makes the H4 distribution top-up honest: Synthea moves the *raw* distribution; the cases only enter
  the *trusted* eval set after attestation (the same bar the 301 cleared).

---

## §7 — The firewall the bundle must survive

Ingest's field-scoped firewall (`injectableText` + `firewallLeaks`) scans **only** the sub-fields that reach
the AI Doctor / patient-simulator exchange (the §4.2 and §4.3 fields listed as scanned). The unambiguous
leak it blocks: the **full `10_ground_truth_node.primary_diagnosis.name`** appearing verbatim in that
injectable text (case-insensitive), and any `.txt` source filename.

Generator rules to pass it every time:

1. The chatty-notes narrative for 01/02 describes **symptoms, history, and the patient's own words** — never
   the diagnosis label. "Crushing chest pain radiating to my left arm" is fine; "I'm having an MI" is a leak
   if the diagnosis name is "…myocardial infarction" and it appears verbatim.
2. Individual medical words are **not** flagged (a patient may say "infection", "fracture", "could it be
   meningitis?"). Only the *full diagnosis name string* is. So the narrative can be clinically rich; it just
   cannot contain the exact `primary_diagnosis.name`.
3. No source filenames (`.txt`) anywhere in injectable text.
4. The clinician review is the backstop for subtler phrasing; the firewall blocks only the unambiguous
   verbatim leak. Do not treat passing the firewall as "no leak" — §4.2 patient voice still needs review.

---

## §8 — Distribution: the actual H4 target

The 301 attested cases sit at ~**49/45/7** against the **60/30/10** target (straightforward / moderate /
complex). The gap is **complex-tier volume** (7% vs 10%) and over-weighted straightforward. So H4's
generation intent is weighted, not uniform:

- Generate predominantly **`06 multi_morbidity_complex`** and other complex-band tiers (05, 06) to lift the
  complex share toward 10%.
- Generate **moderate** (02/03/04) to hold ~30%.
- Generate **few** `01 straightforward` — that band is already over-represented.

Success = a **measured shift** of the *attested* distribution toward 60/30/10, reported before/after. Raw
generation volume that never gets attested does not move the trusted distribution — so H4's honest exit is
"candidate complex cases generated + ingested, attestation pending," and the distribution goal completes only
after the clinician attests them.

---

## §9 — Acceptance checklist (a bundle is ready for ingest when…)

- [ ] Top-level object has exactly the 7 node keys + `case_manifest` + `_bundle`.
- [ ] `_bundle.format` = `"breath-ezy-casebundle"`; `_bundle.case_id` matches the SPEC pattern.
- [ ] Every node's `case_id` equals `_bundle.case_id`.
- [ ] All 7 nodes validate against `data/schemas/*.schema.json`.
- [ ] `00.metadata.difficulty_tier` matches the `DD` in the id; `source_type` = `deliberately_constructed_
      edge_case`; `clinician_reviewed` = false.
- [ ] `01`/`02` patient-voice fields contain no verbatim `10.primary_diagnosis.name` and no `.txt`.
- [ ] `10.primary_diagnosis.name` = the generation seed (true label); `11–13` schema-valid draft stubs.
- [ ] `case_manifest.files[].sha256` all null; every code `unverified_pending_terminology_receipt`;
      `review.clinician_reviewed` false.
- [ ] `--dry-run` ingest reports OK (0 problems, 0 leaks) before a real run.
- [ ] The generator never opened `data/cases/*/10–13`; scoring truth is its own seed, not copied.

---

## §10 — Risk register (shaping failure modes)

| # | Failure mode | L×I | Mitigation |
|---|---|---|---|
| S1 | Generator writes `data/cases/` directly, bypassing ingest + firewall | 2×5 | Contract: emit `.casebundle.json` ONLY; ingest is the sole writer; contract-test asserts no direct write |
| S2 | Diagnosis name leaks into patient voice (01/02) | 3×4 | §7 rules; `--dry-run` firewall must report 0 leaks before real run |
| S3 | Generator authors real scoring truth → circular evaluation | 2×5 | §5: placeholder 10–13, `clinician_reviewed:false`; attested protocol owns final truth |
| S4 | Generator opens existing 10–13 to copy answer keys | 1×5 | §5/§9: seed-authored only; never read sealed nodes; sub-agent constraint |
| S5 | Non-null sha256 or verified code slips in → ingest refuses (build stall) | 2×2 | §6 honesty gate; emit null hashes + unverified codes |
| S6 | Hand-assigned seq collides across series | 2×3 | §3: placeholder seq + `--reseq`; never hand-assign |
| S7 | AU Core target drift (0.3.0 vs 2.0.1-ci, C22 open) | 2×3 | Target 0.3.0 per FLOW_PLAN; flag if C22 resolves otherwise; validate against the pinned SDs |
| S8 | Distribution "achieved" on unattested cases | 3×3 | §8: report the *attested* shift; unattested cases don't count toward the trusted distribution |

---

## §11 — How this plugs into H4

At H4 Phase 1, the executor confirms this contract against the live `ingest-case-bundles.mjs` and the three
presentation schemas (the tool is authority; correct this file on any drift). At Phase 2, it presents the
generator→shaper→ingest integration and the weighted distribution plan, and waits for approval. The shaper
(`case-factory/to-casebundle.js` or equivalent) is the single new integration surface; everything downstream
of the `.casebundle.json` is the existing, contract-tested ingest — untouched. Clinician attestation of the
generated cases is an operator/clinical input, on the same footing as the 301-case attestation.

*End of contract.*
