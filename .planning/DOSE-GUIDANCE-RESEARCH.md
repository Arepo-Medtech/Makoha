# Dose-guidance — research memo (why it's empty, and what would fill it)

> Mode: AI Architect. Produced 2026-07-15 at `main @ e2b940e`, read-only. **Nothing here authorises code.**
> Prompted by the operator's challenge to FL-34 Phase B Finding 3 ("I signed off on over 300
> dose-evidence records — are these not useful?"). That challenge was correct; F3 is corrected below.

## 0. Correction to FL-34 Phase B Finding 3

**What I wrote:** "there is no signed dose knowledge to export."
**What is true:** there is 261 records of signed dose *evidence* (`dose-evidence.json`, all
`review_status:"approved"`, reviewer Kenneth Lee MED0001857758) and **zero** records of dose
*guidance* (`dose-guidance.json`, `clinical_sign_off:false`, `records: []`).
Sign-off is evidenced at `eval/pharmacology/signoff/worksheet-signoff.md`: first pass attested
2 dose_evidence records, second pass 259 more — 261 total, inside a 308-record worksheet
(`PharmCheck-signoff-worksheet-DRAFTS-308-KL-2026-07-14.xlsx`). The operator's recollection is accurate.

The *conclusion* of F3 (build no dose KM in Phase B) survives, but for a different and more important
reason than "nothing is signed". See §2.

## 1. `dose_evidence` and `dose_guidance` are different epistemic categories — by design

Not an accident, and not a gap. `dose-evidence.json` carries two fields no other dataset has:

- `isolation_note`: *"No PharmDataSource exposes a getDoseEvidence() accessor and the engine never
  reads this file. The no-dosages-from-the-LLM invariant is untouched."*
- `integrity_bar`: *"A record ships only if its citation.identifier resolved to a real article via
  get_article_metadata during the verify pass. Unverifiable (potentially hallucinated) PMIDs/DOIs are
  DROPPED… a hallucinated citation is worse than an empty register."*

and every record is stamped `not_prescribing_guidance: true`.

**What a dose-evidence record actually is** (verbatim, apixaban):
> `dose_statement`: "In a multicentre retrospective cohort, patients given off-label reduced-dose
> apixaban … versus standard 5 mg twice daily showed no significant difference in stroke (2.7% vs
> 2.2%) … while all-cause mortality was higher in the off-label reduced-dose group (10.9% vs 1.4%)"
> `evidence_note`: "association only, susceptible to confounding by indication (sicker patients underdosed)"
> `citation`: PMID 37712551, `verified: true`

That is **a finding about doses**, population-scoped and caveated — in this case a finding about what
*not* to do. It is not "give apixaban 5 mg BD". `dose_guidance` is the opposite kind of object: a
prescribable range the engine emits via `PharmCheck.dose_guidance` on PASS/WARN.

**So: the 261 records cannot be promoted into dose-guidance by transformation.** They are the wrong
shape *and the wrong epistemic category*. Mechanically re-labelling them would take an observational
association ("underdosing was associated with higher mortality") and hand it to a clinician as a dose
recommendation. That is precisely the failure the isolation was built to prevent.

**But they are far from useless.** Their correct role is the **corroboration layer** underneath an
authored dose-guidance record: the range comes from an AU authority; dose-evidence supplies the
literature backing, the edge cases, and the caveats — already citation-verified to a real PMID.
The register is an asset in the plan of §4, just not the one it was mistaken for.

## 2. The real reason `dose-guidance.json` is empty: a **licence wall**, not an effort gap

`data/data-sources.json` is the licence/provenance registry — *"Every clinical fact authored into
mcp/servers/pharmacology/data/* MUST cite one of these source ids."* Its 11 registered sources split:

| `use_restriction` | Sources | Meaning |
|---|---|---|
| `content_ingest` (verified) | `pbs-api-v3`, `susmp-poisons-standard`, `rxnorm-nlm`, `who-atc-ddd`, `rasml-tga`, `tga-pregnancy` | facts may be ingested |
| `structure_only` (copyleft_reference_only) | `stopp-start-v3`, `tdm-reference`, `drugbank-nti-category`, `ausdi-structure`, `apf22` | **facts + citation only — no monograph prose or tables copied** |

Now cross that against who actually publishes **Australian dose ranges**:

- **PBS** (`content_ingest`, our one open AU drug feed) — its own registry note says it *"does NOT
  provide interactions / NTI / renal dosing / allergy / SUSMP scheduling / PDMP."* Formulary and
  subsidy, not doses.
- **APF22 / AusDI** — `structure_only`. Taxonomy and discrete facts, no dose tables.
- **AMH (Australian Medicines Handbook)** — **not registered at all.** It appears only as prose in
  self-authored records ("AMH/product-info aligned"), never as a `source_ref`. It is a subscription
  copyright product.
- **TGA PI (Product Information)** — the AU regulatory dose source. **Not registered.**

⇒ Authoring an AU dose range today has exactly two available routes, and **both are barred**:
1. Copy from AMH/APF/AusDI → licence breach (`structure_only`, and AMH unlicensed entirely).
2. Let the model author it → breaches the hard limit *"No dosages from the LLM — doses come only from
   the pharmacology server's PharmCheck output"* and the `no-autonomous-prescription` invariant.

The empty file is the system **correctly refusing to fabricate**. It is the fail-safe working, and the
`clinical_sign_off:false` on it is honest. This is why F3's conclusion still holds: there is nothing
licence-clean to put in a dose KM, and a KM emitting self-authored doses would be the single worst
thing this repo could ship.

## 3. What makes a "complete" medicine record — and the real shape of the corpus

**Coverage across the 24 datasets, 1354 distinct ingredients:**

| Tier | Datasets | Count | Character |
|---|---|---|---|
| A | 14–17 | 10 | fully profiled — methotrexate (17), carbamazepine (16), metformin/sulfasalazine/phenytoin (15), apixaban/dabigatran/rivaroxaban/simvastatin/alendronate (14) |
| B | 10–13 | 188 | clinically authored, most axes populated |
| C | 2–9 | 220 | partial — authored on the axes that matter for that drug |
| D | **1** | **936** | **886 are PBS-only** + 44 strong-contraindications-only + 6 others |

**Tier A anatomy — methotrexate, and what each source contributes:**

| Axis | Content | `source_ref` |
|---|---|---|
| au-scheduling | S4 | self-authored |
| renal-rules | contraindicated <30, reduce <60 | self-authored |
| hepatic | hepatic_caution; avoid in significant liver disease | self-authored (AMH-*aligned*, not AMH-sourced) |
| nti-register | is_nti, target interval, 24/48 h post-infusion | `tdm-reference` |
| pregnancy-risk | TGA cat D, contraindicated, teratogen | `tga-pregnancy` |
| pharmacokinetics | saturable bioavailability, ~50% protein binding | self-authored |
| counselling-points | **"ONCE A WEEK, not every day… daily can be fatal"** | `apf22` |
| administration-handling | do_not_crush — cytotoxic, occupational exposure | `apf22` |

This is the amalgamation the operator describes, and it is genuinely good: three independent source
classes (TGA open data, APF22 facts-only, TDM reference) plus self-authored structure, per-record
provenance, per-record clinician attestation. **Note what is absent from even the best record: a dose.**
Tier A is complete on every axis the system is licensed to hold.

**Tier D is not an authoring backlog.** The 886 PBS-only entries are raw formulary rows from the
`pbs-api-v3` bulk ingest — `clinical_sign_off:false`, governed as bulk open data
(`BULK_OPEN_DATA` in `test/contract-pharm-datastore.js`). Sampling them returns
`dressing foam with silicone` and `arachidonic acid and docosahexaenoic acid with carbohydrate` —
**they are not all medicines.** PBS lists dressings, nutritional formulas, and appliances.

⇒ "Bring them all up to the same standard" is the wrong target. Uniform 17-axis coverage across 1354
PBS rows would be ~20k clinician-attested records, most for items that will never be prescribed
through a telehealth consult, and it would not move any release blocker. **The right target is
risk-tiered coverage** — which is what the corpus already reflects: the NTI/anticoagulant/cytotoxic
drugs (the ones that kill people when dosed wrong) are exactly the ones at 14–17 axes.

## 4. AMASS — probed live, 2026-07-15. Verification source: **yes**. Dose source: **no**.

Probed `search_amass_regulatorycore_records` for methotrexate dosing. Findings:

- **The `agency` enum is literally `["FDA", "EMA"]`. There is no TGA.** Every methotrexate hit was a US
  NDA or EU centralised authorisation: Jylamvo, Nordimet, Otrexup, Xatmep — US/EU brands, US/EU labels.
- RegulatoryCore returns **full parsed label prose** (FDA SPL sections, EMA SmPCs) with `sourceUrl`.
- DrugCore is ChEMBL-anchored (modality, clinical stage) — chemistry, not prescribing.
- BiomedCore is PubMed — **the same pipe the existing 261 dose-evidence records already used**.

**So the operator's instinct is exactly right, and its precision matters:** the word used was
*"as a verification source"*. That is the only defensible role.
- **As an authoring source it is a jurisdiction breach.** `<non_negotiable_invariants>`: *"Jurisdiction:
  Australian healthcare context only."* An FDA package-insert dose is not an AU dose — AU PI, indications,
  and scheduling diverge. The apixaban dose-evidence record in our own register turns on *"FDA
  package-insert dose-reduction criteria"*; adopting those as AU guidance would import US regulatory
  assumptions under an AU label.
- **As a divergence detector it is valuable and cheap.** Author the AU range from an AU authority, then
  ask AMASS what FDA/EMA say. Agreement → corroboration recorded. **Disagreement → the record does not
  ship; it goes to the review queue for the clinician.** That is real, mechanical safety value that no
  AU source can provide alone, and `dose-evidence-review-queue.json` already exists as the pattern.
- Licence: it would register as `use_restriction: structure_only` — **facts + citation only, no SmPC/SPL
  prose copied** (EMA SmPC text is EMA copyright; FDA SPL is US public domain — the strict rule covers both).

## 5. The path that actually exists

The missing piece is **an AU-jurisdiction, licence-clean, authoritative dose source**. The only
candidate that clears both bars is the **TGA Product Information (PI)** — public, AU regulatory,
sponsor-authoritative, and *facts from it are citable exactly as `tga-pregnancy` and `rasml-tga`
already are* (both registered `content_ingest`/`verified`, both TGA). A `tga-pi` source entry is the
natural sibling of two entries that already exist.

**And it is gated on an operator input that is already open.** FL-05's remainder
`pregnancy-risk-bulk-sync-pending` is blocked on **TGA DB data access** — the same access that would
unblock PI-sourced dose authoring. One operator action serves both.

Proposed shape (**plan-gated — not started**):
1. **Source registration.** `tga-pi` (`content_ingest`) + `amass-regulatory` (`structure_only`,
   flagged *non-AU, verification-only, never primary for an AU dose*) into `data-sources.json`.
2. **Authoring-time only — no runtime change.** All AMASS/TGA calls happen in `scripts/` authoring
   tooling, offline, producing citations. The runtime engine keeps reading only the signed datastore.
   **No new runtime dependency, no receipt-mode change, no pipeline blast radius.** This is exactly the
   dose-evidence precedent (`get_article_metadata` at authoring time, integrity bar, hallucinations dropped).
3. **Integrity bar, mirroring dose-evidence.** A dose record ships only if: PI citation resolves; the
   AMASS FDA/EMA cross-check agrees within a declared tolerance; and a clinician attests it per-record.
   **Any divergence or unresolvable citation → review queue, never ship.**
4. **Risk-tiered scope.** Tier A first (~10 drugs — the NTI/anticoagulant/cytotoxic set), then Tier B.
   Not the 886 PBS rows.
5. **The engine's mock-dose fallback becomes a defect the moment real doses exist.**
   `getDoseGuidance()` currently falls through to `mock-data.json.dose_guidance_mock`. Once
   `dose-guidance.json` is populated for *some* drugs, that fallback silently mixes mock and signed
   doses on one path. It must be removed in the same increment — absent record → `null` → no dose.

## 6. Two defects found while researching (report-only, rule 1)

- **D1 — `dose-evidence.json` attestation `scope` is stale and contradicts its own records** (Medium).
  It reads *"skeleton — no records authored yet"* while the file holds 261 records with
  `reviewed_by: "Kenneth Lee"` / `review_status: "approved"`, attested via the 308-record worksheet.
  Per-record `review_status` is authoritative and correct, so **no safety impact and no test is red** —
  but the dataset-level scope text materially understates what was signed. This is very likely what
  misled F3. Fix: correct the scope text to cite the worksheet.
- **D2 — no register item tracks `dose-guidance` emptiness as a *licence* blocker** (Medium).
  It is currently implicit in `dose-guidance.json`'s `clinical_sign_off:false`. Given it is the one
  dataset the "no autonomous prescription" invariant turns on, it warrants its own register item naming
  the real blocker (no licensed AU dose source), linked to the FL-05 TGA-access operator input.

## 7. Regulatory flag (operator decision, not mine)

Populating `dose-guidance` **changes the device's behaviour from withholding doses to emitting them**.
Per `<regulatory_posture>`, that plausibly alters intended use and clinical risk profile, and therefore
bears on TGA classification (FL-50). It is flagged here, not decided. It does not block *authoring*
into a `-dev`, non-patient-facing dataset — but it must be on the record before that work starts.
