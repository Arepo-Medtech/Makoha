# AU dose-guidance — clinician attestation worksheet (2026-07-15)

**Reviewer:** Kenneth Lee (MED0001857758) · **Records:** 11 · all `review_status: draft`

Every AU dose below is **your own verbatim APF22 Section D text**. The agent segmented and labelled it for display; it did not write any dose (the schema's substring bar enforces this mechanically).

**AU has primacy.** The US/EU labels shown are *evidence beside* your dose, never a verdict on it. A dose differing from a foreign label is normal — jurisdictions differ by approved indication, population and regulatory history — and needs no justification from you. They are shown so the decision is yours with everything we hold in front of you.

Mark each record **Attest** / **Amend** / **Reject**.

---

## methotrexate

**Your APF22 text (verbatim — this is what the engine emits):**

> Rheumatology/dermatology: 5–25 mg once weekly (may be taken in three divided doses at 0, 12 and 24 hours). Antineoplastic chemotherapy: See approved product information and specialist protocols.

Indication status: `present`

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | Rheumatology/dermatology | — | flat_mg | `plausible` no order-of-magnitude discrepancy |
| 2 | Antineoplastic chemotherapy | — | none | `unassessable` — no plausibility claim made (NOT an all-clear) |

- **Line 1** (Rheumatology/dermatology): 5–25 mg once weekly (may be taken in three divided doses at 0, 12 and 24 hours).
- **Line 2** (Antineoplastic chemotherapy): See approved product information and specialist protocols.
  - AU dose not comparable: no mass amount found. No plausibility claim is made — this is NOT an all-clear.

**International labels — `non_congruent`** — **the AU dose differs from the foreign label(s) below.** This is shown for your judgement; it does not question your dose.

| Jurisdiction | Agency | Authorisation status | Label dose (verbatim) | Amass id |
|---|---|---|---|---|
| US | FDA | ACTIVE | The recommended starting dosage of JYLAMVO is 7.5 mg orally once weekly with escalation to achieve optimal response. Dosages of more than 20 mg once weekly result in an increased risk of serious adverse reactions, including myelosuppression. | `AMRC_3fGlV6Dt4OPHPpblkubUitVUbN3` |
| EU | EMA | ACTIVE | The recommended initial dose is 7.5 mg (3.75 ml) methotrexate once weekly. | `AMRC_1b7jWbEDFeccd6RkJS01idTnGGk` |

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## carbamazepine

**Your APF22 text (verbatim — this is what the engine emits):**

> Epilepsy: Initially 100 mg twice daily; increase gradually until optimum response achieved. Usual dose 400–1,200 mg daily in two or more doses. Up to 2 g daily may be required.

Indication status: `present`

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | Epilepsy | — | flat_mg | `implausible` ⚠️ ORDER-OF-MAGNITUDE FLAG — read this line against the source before attesting |

- **Line 1** (Epilepsy): Initially 100 mg twice daily; increase gradually until optimum response achieved. Usual dose 400–1,200 mg daily in two or more doses. Up to 2 g daily may be required.
  - AU dose (max 2000 mg) differs from the US label (max 200 mg) by 10.0x — at or beyond the 10x threshold. This is an ORDER-OF-MAGNITUDE flag for a human (a misplaced zero looks exactly like this), NOT a judgement that the AU dose is wrong and NOT a block. Confirm the entry against the source before attesting.

**International labels — `non_congruent`** — **the AU dose differs from the foreign label(s) below.** This is shown for your judgement; it does not question your dose.

| Jurisdiction | Agency | Authorisation status | Label dose (verbatim) | Amass id |
|---|---|---|---|---|
| US | FDA | ACTIVE | The recommended initial dose of EQUETRO is 200 mg administered twice daily. The dose may be increased by 200 mg per day to achieve optimal clinical response. | `AMRC_MptXnon1tbyon6nDa0hATWdzXhl` |

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## metformin

**Your APF22 text (verbatim — this is what the engine emits):**

> Immediate-release tablet, 500–1,000 mg daily in one or two doses; maximum 3,000 mg daily in three doses. Controlled-release tablet, 500–2,000 mg once daily.

Indication status: `absent` — the monograph carries no indication for this range. Stated, not withheld.

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | *(indication absent)* | — | flat_mg | `plausible` no order-of-magnitude discrepancy |

- **Line 1** (indication absent): Immediate-release tablet, 500–1,000 mg daily in one or two doses; maximum 3,000 mg daily in three doses. Controlled-release tablet, 500–2,000 mg once daily.

**International labels — `non_congruent`** — **the AU dose differs from the foreign label(s) below.** This is shown for your judgement; it does not question your dose.

| Jurisdiction | Agency | Authorisation status | Label dose (verbatim) | Amass id |
|---|---|---|---|---|
| US | FDA | WITHDRAWN_VOLUNTARY **⚠️ WITHDRAWN_VOLUNTARY — not a current label** | The recommended starting dose of GLUMETZA is 500 mg orally once daily with the evening meal. Increase the dose in increments of 500 mg every 1 to 2 weeks on the basis of glycemic control and tolerability, up to a maximum of 2,000 mg once daily with the evening meal. | `AMRC_VaZiOgNDr4gLmMMzOosoYBlRNPt` |

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## sulfasalazine

**Your APF22 text (verbatim — this is what the engine emits):**

> Ulcerative colitis: 2–4 g daily in three or four divided doses. Rheumatoid arthritis: Initially 500 mg daily, increasing by 500 mg each week to 2–3 g daily in divided doses.

Indication status: `present`

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | Ulcerative colitis | — | flat_mg | `plausible` no order-of-magnitude discrepancy |
| 2 | Rheumatoid arthritis | — | flat_mg | `plausible` no order-of-magnitude discrepancy |

- **Line 1** (Ulcerative colitis): 2–4 g daily in three or four divided doses.
- **Line 2** (Rheumatoid arthritis): Initially 500 mg daily, increasing by 500 mg each week to 2–3 g daily in divided doses.

**International labels — `non_congruent`** — **the AU dose differs from the foreign label(s) below.** This is shown for your judgement; it does not question your dose.

| Jurisdiction | Agency | Authorisation status | Label dose (verbatim) | Amass id |
|---|---|---|---|---|
| US | FDA | ACTIVE | Adults: 3 to 4 g daily in evenly divided doses with dosage intervals not exceeding eight hours. It may be advisable to initiate therapy with a lower dosage, e.g., 1 to 2 g daily, to reduce possible gastrointestinal intolerance. | `AMRC_8zDRix9bWVQRcpfgZP6FN4e3TZA` |

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## phenytoin

**Your APF22 text (verbatim — this is what the engine emits):**

> Anticonvulsant: Oral, initially 4–5 mg/kg daily in two or three doses. Adjust dosage according to plasma levels; usual maintenance dose 200–500 mg daily. Maximum daily dose 600 mg. Status epilepticus: IV, 15–20 mg/kg.

Indication status: `present`

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | Anticonvulsant | Oral | **mixed** (weight-based AND flat mg — both shown) | `plausible` no order-of-magnitude discrepancy |
| 2 | Status epilepticus | IV | weight_based | `unassessable` — no plausibility claim made (NOT an all-clear) |

- **Line 1** (Anticonvulsant): Oral, initially 4–5 mg/kg daily in two or three doses. Adjust dosage according to plasma levels; usual maintenance dose 200–500 mg daily. Maximum daily dose 600 mg.
- **Line 2** (Status epilepticus): IV, 15–20 mg/kg.
  - AU dose not comparable: weight- or BSA-based only (mg/kg, mg/m²) — a different scale, never compared to a flat mg dose. No plausibility claim is made — this is NOT an all-clear.

**International labels — `non_congruent`** — **the AU dose differs from the foreign label(s) below.** This is shown for your judgement; it does not question your dose.

| Jurisdiction | Agency | Authorisation status | Label dose (verbatim) | Amass id |
|---|---|---|---|---|
| US | FDA | ACTIVE | The recommended starting dosage for adult patients who have received no previous treatment is 5 mL (125 mg/5 mL), or one teaspoonful, by mouth three times daily. Adjust the dosage to suit individual requirements, up to a maximum of 25 mL daily. | `AMRC_IoFIOhdH6gJ0LAD29QZobqErVn1` |

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## alendronate

**Your APF22 text (verbatim — this is what the engine emits):**

> Postmenopausal osteoporosis, and osteoporosis in men: 10 mg daily or 70 mg weekly. Paget’s disease: 40 mg daily for up to 6 months.

Indication status: `present`

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | Postmenopausal osteoporosis, and osteoporosis in men | — | flat_mg | `plausible` no order-of-magnitude discrepancy |
| 2 | Paget’s disease | — | flat_mg | `plausible` no order-of-magnitude discrepancy |

- **Line 1** (Postmenopausal osteoporosis, and osteoporosis in men): 10 mg daily or 70 mg weekly.
- **Line 2** (Paget’s disease): 40 mg daily for up to 6 months.

**International labels — `non_congruent`** — **the AU dose differs from the foreign label(s) below.** This is shown for your judgement; it does not question your dose.

| Jurisdiction | Agency | Authorisation status | Label dose (verbatim) | Amass id |
|---|---|---|---|---|
| US | FDA | ACTIVE | The recommended dosage is: one 70 mg tablet once weekly or one bottle of 70 mg oral solution once weekly or one 10 mg tablet once daily | `AMRC_SQXLnFmyFx7BnPY5Xaie3X3UGNb` |

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## apixaban

**Your APF22 text (verbatim — this is what the engine emits):**

> 2.5 mg twice daily; initial dose taken 12–24 hours after surgery.

Indication status: `absent` — the monograph carries no indication for this range. Stated, not withheld.

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | *(indication absent)* | — | flat_mg | `plausible` no order-of-magnitude discrepancy |

- **Line 1** (indication absent): 2.5 mg twice daily; initial dose taken 12–24 hours after surgery.

**International labels — `non_congruent`** — **the AU dose differs from the foreign label(s) below.** This is shown for your judgement; it does not question your dose.

| Jurisdiction | Agency | Authorisation status | Label dose (verbatim) | Amass id |
|---|---|---|---|---|
| US | FDA | ACTIVE | The recommended dose of ELIQUIS for most patients is 5 mg taken orally twice daily. The recommended dose of ELIQUIS is 2.5 mg twice daily in patients with at least two of the following characteristics: age greater than or equal to 80 years, body weight less than or equal to 60 kg, serum creatinine greater than or equal to 1.5 mg/dL | `AMRC_JKaqdbkiiH5OwMOoJqUpy6NQuY3` |
| EU | EMA | ACTIVE | The recommended dose of apixaban is 5 mg taken orally twice daily. Dose reduction: The recommended dose of apixaban is 2.5 mg taken orally twice daily in patients with NVAF and at least two of the following characteristics: age >= 80 years, body weight <= 60 kg, or serum creatinine >= 1.5 mg/dL (133 micromole/L). | `AMRC_NNBh3l5BiG6yKYz0z8Gn2t6YGKO` |

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## dabigatran

**Your APF22 text (verbatim — this is what the engine emits):**

> Venous thromboembolism prevention: Oral, 110 mg within 1–4 hours of completed surgery, then 220 mg once daily for 10 days after knee replacement or 28–35 days after hip replacement. Atrial fibrillation: Oral, 300 mg, once daily.

Indication status: `present`

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | Venous thromboembolism prevention | Oral | flat_mg | `plausible` no order-of-magnitude discrepancy |
| 2 | Atrial fibrillation | Oral | flat_mg | `plausible` no order-of-magnitude discrepancy |

- **Line 1** (Venous thromboembolism prevention): Oral, 110 mg within 1–4 hours of completed surgery, then 220 mg once daily for 10 days after knee replacement or 28–35 days after hip replacement.
- **Line 2** (Atrial fibrillation): Oral, 300 mg, once daily.

**International labels — `non_congruent`** — **the AU dose differs from the foreign label(s) below.** This is shown for your judgement; it does not question your dose.

| Jurisdiction | Agency | Authorisation status | Label dose (verbatim) | Amass id |
|---|---|---|---|---|
| US | FDA | ACTIVE | For patients with creatinine clearance (CrCl) > 30 mL/min, the recommended dosage of PRADAXA Capsules is 150 mg taken orally, twice daily. For patients with severe renal impairment (CrCl 15-30 mL/min), the recommended dosage of PRADAXA Capsules is 75 mg twice daily | `AMRC_RvQ2eYxeA3lFzm2LJblKvUHFQ4U` |
| EU | EMA | ACTIVE | 300 mg dabigatran etexilate taken as one 150 mg capsule twice daily | `AMRC_WVGU4iehGvIjglnClAZySLe4GN9` |

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## simvastatin

**Your APF22 text (verbatim — this is what the engine emits):**

> 10–40 mg once daily.

Indication status: `absent` — the monograph carries no indication for this range. Stated, not withheld.

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | *(indication absent)* | — | flat_mg | `plausible` no order-of-magnitude discrepancy |

- **Line 1** (indication absent): 10–40 mg once daily.

**International labels — `non_congruent`** — **the AU dose differs from the foreign label(s) below.** This is shown for your judgement; it does not question your dose.

| Jurisdiction | Agency | Authorisation status | Label dose (verbatim) | Amass id |
|---|---|---|---|---|
| US | FDA | ACTIVE | The recommended dosage range of ZOCOR is 20 mg to 40 mg once daily. | `AMRC_JbHcvse1Lby0S0D969VPXYekEhM` |

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## rivaroxaban

**Your APF22 text (verbatim — this is what the engine emits):**

> 10 mg once daily

Indication status: `absent` — the monograph carries no indication for this range. Stated, not withheld.

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | *(indication absent)* | — | flat_mg | `unassessable` — no plausibility claim made (NOT an all-clear) |

- **Line 1** (indication absent): 10 mg once daily
  - no comparator label to compare against. No plausibility claim is made — this is NOT an all-clear.

**International labels:** none. `no_comparator` — No US/EU label dose is available for rivaroxaban in the international register. This is a claim about the SEARCH, not about the AU dose.

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## amoxicillin

**Your APF22 text (verbatim — this is what the engine emits):**

> Oral, 250–500 mg 8-hourly or 1 g twice daily. IM/IV, 250 mg to 1 g every 6–8 hours.

Indication status: `absent` — the monograph carries no indication for this range. Stated, not withheld.

| # | Indication | Route | Dosing basis | Plausibility |
|---|---|---|---|---|
| 1 | *(indication absent)* | Oral | flat_mg | `unassessable` — no plausibility claim made (NOT an all-clear) |

- **Line 1** (indication absent): Oral, 250–500 mg 8-hourly or 1 g twice daily. IM/IV, 250 mg to 1 g every 6–8 hours.
  - no comparator label to compare against. No plausibility claim is made — this is NOT an all-clear.

**International labels:** none. `no_comparator` — No US/EU label dose is available for amoxicillin in the international register. This is a claim about the SEARCH, not about the AU dose.

**Decision:** ☑ Attest ☐ Amend ☐ Reject — _______________

---

## International-only evidence (no AU dose authored)

*None — every drug with an international label also has an AU dose in this worksheet.*
