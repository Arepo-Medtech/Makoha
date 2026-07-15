# PharmCheck — clinician worksheet sign-off (KL, 2026-07-14)

Registered medical practitioner **Kenneth Lee** completed the per-record sign-off worksheet (`PharmCheck-signoff-worksheet-KL-2026-07-14.xlsx`, retained here as the medicolegal artifact): **all 88 records Attested, 0 Amend, 0 Reject**, signed block dated 2026-07-14.

Applied in the repo: matching records set `reviewed_by:"Kenneth Lee"`, `review_status:"approved"` (74 newly approved; 11 already-signed re-affirmed; 3 warning_labels PSA_CAL written approved with 3 stale RASML archived to superseded[]).

- administration_handling: 28 records attested by KL
- tdm_parameters: 8 records attested by KL
- counselling_points: 6 records attested by KL
- warning_labels: 3 records attested by KL
- interactions: 12 records attested by KL
- strong_contraindications: 8 records attested by KL
- serious_adverse_effects: 9 records attested by KL
- allergy: 1 records attested by KL
- dose_evidence: 2 records attested by KL

**Scope of this sign-off:** CLINICAL only. Datasets remain `-dev`; **regulatory (TGA) sign-off NOT given**; the system stays mock/non-patient-facing. The reference datasets keep `clinical_sign_off:false` at dataset level because each still holds unattested draft records outside this worksheet (P1 seeds, the 259-record dose-evidence register, etc.). Per-record `review_status` is authoritative.

## Second pass — remaining 308 records (KL, 2026-07-14)

Registered medical practitioner **Kenneth Lee (MED0001857758)** completed the follow-on worksheet
(`PharmCheck-signoff-worksheet-DRAFTS-308-KL-2026-07-14.xlsx`): **all 308 remaining draft
records Attested, 0 Amend, 0 Reject**. Applied as `reviewed_by:"Kenneth Lee"` +
`review_status:"approved"`. Covered: dose_evidence (259), pregnancy_risk (18), hepatic (13),
counselling (6), administration_handling (4), tdm_parameters (3), warning_labels (3),
dose_evidence_review_queue (2).

**Datastore now carries ZERO per-record drafts** — every clinical-judgement dataset is
`clinical_sign_off:true` at dataset level (regulatory_sign_off still false; datasets remain
`-dev`/non-patient-facing). Bulk open-data (pbs, formulations) keep dataset-level governance.

---

## Correction — registration category (D4, 2026-07-15)

This record previously described Kenneth Lee as a **registered pharmacist**. That is incorrect and is corrected here on the operator's own statement (2026-07-15): **Kenneth Lee is a registered MEDICAL PRACTITIONER**, AHPRA **MED0001857758** — `MED` is AHPRA's medical-practitioner prefix (pharmacists carry `PHA`), so the number was always right and the word was always wrong.

**Origin of the error.** The wording descends from `.planning/FL-30_PharmCheck_Self-Build_Prompt.md` ("Author/Owner: Ken Lee — Senior Pharmacist (AU)") and propagated into this record, `docs/grounding/CHANGELOG.md`, and the `status` gate text of 8 datasets ("registered-pharmacist sign-off" → now "registered-practitioner sign-off").

**What did NOT change.** No attestation is re-opened and no record's `review_status` moves. The 88 + 308 worksheets, their signed blocks, the attesting person, and the dates all stand exactly as they were — the same clinician attested the same records on the same days. Only the description of his registration category is corrected. The `reviewer_id` (`Kenneth Lee (MED0001857758)`) was already correct and is untouched, so no `records_checksum` is affected.

**Scope note (recorded, not resolved).** The gate reword slightly widens who may give the outstanding sign-off (any registered practitioner, not a pharmacist specifically). This is faithful to the wording's origin — no independent pharmacist-scope control was ever specified; the phrase simply meant "the owner, believed to be a pharmacist, signs off". If an independent pharmacist review of the classically pharmacy-scope datasets (administration_handling, counselling_points, warning_labels/CAL) is wanted, that is a NEW control to specify deliberately — it is not something this correction removed.

---

## Applying a sign-off — MANDATORY re-seal step (R-46, added 2026-07-15)

**A sign-off MUTATES the records.** Setting `reviewed_by` / `review_status:"approved"` writes to each
record's `provenance` block — so the dataset's `records_checksum`, computed at authoring/ingest time when
those records were still `draft`, becomes stale the instant a sign-off is applied.

That is precisely how R-46 happened: two worksheet passes (88 + 308 records) were applied faithfully, and
**7 of 21 seals were silently invalidated** — undetected for months, because `records_checksum` was written
by three scripts and verified by none. No data was harmed (the clinical content was later proven
bit-identical to the sealed bytes); the *proof* was.

**So: any process that applies a sign-off MUST re-seal afterwards.**

```sh
npm run pharm:seals          # audit every seal (exit 1 if any is broken)
node scripts/pharm-reseal.mjs <file.json> --reason "applied worksheet <name>, <n> records attested by <id>" --utc <YYYY-MM-DD>
```

This is now **enforced, not merely documented**: `test/contract-pharm-datastore.js` asserts every seal on
every `npm test` run, so a sign-off that skips the re-seal reddens CI immediately instead of decaying quietly.

**If a seal breaks unexpectedly, do NOT just re-seal to clear the red.** A stale seal (a legitimate edit that
skipped re-sealing) and an unreviewed mutation are indistinguishable from the hash alone — that is the entire
point of the seal. Establish *what* changed first; `--reason` is required so the answer lands in
`attestation.reseal_history[]` and not just in someone's memory.

---

## Third pass — AU dose guidance (KL, 2026-07-15)

Registered medical practitioner **Kenneth Lee (MED0001857758)** reviewed the R-47a attestation worksheet
(`dose-guidance-worksheet-KL-2026-07-15.md`, retained here as the medicolegal artifact): **all 11 records
Attested, 0 Amend, 0 Reject**.

**This is the first clinician sign-off on AU DOSE GUIDANCE — the one capability that becomes a dose.**
Applied as `reviewed_by:"Kenneth Lee"` + `review_status:"approved"` on all 11 records;
`attestation.clinical_sign_off:true`. Regulatory (TGA) sign-off NOT given; the dataset stays
`pharm-dose-guidance:v0.1.0-dev` and non-patient-facing.

**What was in front of the clinician for each record** (R-47a — the ruling that a non-congruent dose
ships without explanation assumes the clinician was ALERTED, so the surface is what makes it true):
his own **verbatim APF22 Section D text**, every segmented dose line with indication / route /
dosing-basis / plausibility, and **every US/EU comparator label dose verbatim** with its authorisation
status — including the two that most needed seeing:
- **carbamazepine** — order-of-magnitude flag: AU max 2 g vs US *initial* 200 mg (10.0x). A
  max-vs-initial comparison, visible and dismissable on sight.
- **metformin** — the only citable US label is **WITHDRAWN_VOLUNTARY**, marked *"not a current label"*
  rather than read as current.

**Scope:** ADULT doses only. The 232 paediatric rows in the transcription are deliberately excluded —
the paediatric hard limit is unchanged and its plan (`.planning/PAEDIATRIC-DOSING-PLAN.md`) is parked.

**Re-sealed after, per R-46.** Applying a sign-off MUTATES the records (`provenance.reviewed_by` /
`review_status`), which is exactly how 7 seals were silently invalidated before. This time the break
was surfaced immediately by the assertion R-46 added, and closed deliberately via
`pharm-reseal.mjs --reason` — the basis is in `attestation.reseal_history[]`. All 23 seals verify.

---

## Third pass — the full APF22 Section D adult set (E1/E2, KL, 2026-07-15)

Registered medical practitioner **Kenneth Lee (MED0001857758)** completed the two tranched dose
worksheets (`dose-guidance-worksheet-KL-2026-07-15-tranche1.xlsx` — 123 records, Tier A +
indication-present; `dose-guidance-worksheet-KL-2026-07-15-tranche2.xlsx` — 328 records, the
remainder): **all 451 records Attested, 0 Amend, 0 Reject**. Applied by
`scripts/pharm-dose-apply-signoff.mjs` as `reviewed_by:"Kenneth Lee"` + `review_status:"approved"`.

**What changed, and why it is 451 and not 11.** The dose author ran over a hardcoded eleven-drug list
(`const wanted = [...TIER_A, "amoxicillin"]`) — the C2 risk-tiered first pass, which outlived its
purpose. It was never a safety bar: the clinician's transcription carries 451 adult doses across 471
monographs, and 440 of them had simply never been authored. E1 removed the gate; every readable adult
dose is now written, each carrying its plausibility state and congruence appraisal as LABELS rather
than as reasons to withhold it. The substring bar swept all 451: **0 violations** — the agent only
ever cut the clinician's text.

**Evidence he was shown (R-47a).** Each record was presented with his verbatim APF22 source statement,
every segmented dose line (indication · route · dosing basis), its plausibility state — including the
carbamazepine order-of-magnitude flag (AU max 2 g vs US initial 200 mg) — and every US/EU comparator
label dose verbatim with its authorisation status, including metformin's WITHDRAWN US label. The
rendering bar (`assertEvidenceRendered`) ran over the generated cells and would have thrown had any
evidence been recorded-but-not-displayed. It is the SAME function the markdown surface uses, called
with an xlsx delimiter — one implementation, two surfaces, because a second hand-written copy of a
safety bar is the silent-divergence hazard R-47 names.

**Text-drift check (new, and load-bearing).** At apply time every attested record's `source_statement`
was compared byte-for-byte against the verbatim cell the worksheet displayed. A mismatch aborts the
whole apply: the clinician attested the words he read, and a re-author between generation and apply
would otherwise launder new text through an old signature. PASSED for all 451.

**The re-seal is now mechanical (R-46).** Applying a sign-off mutates every attested record's
provenance block, invalidating the `records_checksum` computed at authoring time — the exact mechanism
that left 7 datasets stale on 2026-07-15. The apply script re-seals in the same pass that causes the
drift, rather than leaving it to memory: `d6d77ecac912… → 733aacafcd5e…`, recorded in
`attestation.reseal_history`. `npm run pharm:seals` reports 23/23.

**Scope of this sign-off:** CLINICAL only. **Regulatory (TGA) sign-off NOT given** — that is FL-50, a
different gate, and `regulatory_sign_off` stays `false`. The dataset remains `-dev`, receipts stay
`mode=mock`, and nothing became patient-facing. Paediatric doses remain deliberately absent: the 232
paediatric rows are held and the paediatric hard limit is unchanged (under-18 → in-person review).
