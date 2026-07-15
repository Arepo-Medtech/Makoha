# FL dose-guidance C2 — Channel B: the first real AU doses (PLAN — awaiting Phase 2 approval)

> Mode: IDE Planner. Produced 2026-07-15 at `main @ a8c83af`. **Nothing here authorises code.**
> Supersedes the C2 stub in `.planning/DOSE-GUIDANCE-PLAN.md`, which still describes the REMOVED veto
> ("writes only rows whose cross-check is `agrees`; `diverges` … to the queue"). That model is gone:
> non-congruent ships (C0 amendment) and needs no note (AU primacy ruling).
> **C2 is the first phase in which a real dose exists.** C3 must land with it; R-47 gates its completion.

## Phase 1 — Findings (four, and F1/F3 change the build)

### F1 — The existing CSV helper SHREDS the transcription, with silent column shift `[CRITICAL]`
`scripts/pharm-author.mjs` exports `csvToRecords()`, documented *"controlled authoring files only: no
embedded commas/quotes"* — it does `line.split(",")`. KL's 471-row CSV is properly quoted RFC-4180 with
commas inside nearly every field. Run live against the real file, row 1 (abacavir):

| field | what it should be | what the parser produces |
|---|---|---|
| `drug_class` | nucleoside reverse transcriptase inhibitor, antiretroviral | `"nucleoside reverse transcriptase inhibitor` |
| **`adult_dose`** | **300 mg twice daily, or 600 mg once daily.** | **`antiretroviral"`** |
| **`paediatric_dose`** | 3 months to 12 years, 8 mg/kg twice daily… | **`"300 mg twice daily`** |

Two distinct failures, and the second is the dangerous one:
1. `safe_dose_range` would become the string **`"antiretroviral"`** — caught downstream, because the
   plausibility guard finds no mg amount → `unassessable`, never `plausible`.
2. **The columns SHIFT: the paediatric dose lands in the adult field.** `"300 mg twice daily"` in
   `adult_dose` is a perfectly plausible adult dose. **The plausibility guard cannot catch this** — both
   sides parse, both look sane. A paediatric mg dose silently presented as an adult range is exactly the
   class of error this whole subsystem exists to prevent, and no existing bar would stop it.
⇒ **C2 needs a correct RFC-4180 parser with a round-trip test, and that is C2's single highest-risk item.**
`parseAuthoring()` also only accepts JSON today, so `csvToRecords()` is exported but unwired — nothing
currently depends on the broken behaviour, which is why this has never bitten.

### F2 — The engine CANNOT select by indication, so one drug = one record `[shapes the whole phase]`
The frozen `pharm-intent` **does** carry an `indication` block (`diagnosis_snomed_code`) — its own
description says *"without this, the firewall cannot assess whether the drug is appropriate for the
condition"*. **But `getDoseGuidance(drug)` takes only the drug**, and `engine.js` calls it with only the
drug. The dose lookup is indication-blind.

KL's APF Section D rows are frequently multi-indication:
- **sulfasalazine** — *"Ulcerative colitis: 2–4 g daily… Rheumatoid arthritis: …"*
- **carbamazepine** — *"Epilepsy: Initially 100 mg twice daily…"*
- **apixaban** — *"2.5 mg twice daily; initial dose taken 12–24 hours after surgery"* — the **VTE-prophylaxis
  post-surgery** dose, *not* the 5 mg BD AF stroke-prevention dose a US label carries.

⇒ **If C2 authored one record per indication, the engine would arbitrarily emit whichever matched the
drug first — apixaban 2.5 mg BD (post-surgical prophylaxis) to an AF patient needing 5 mg BD.** A silent
wrong-indication dose. The schema would be satisfied; every test would pass.

**⇒ One record per drug** (D-C2-1). `context` states exactly what it is: `"adult — APF22 Section D common
dosage range"`. `safe_dose_range` carries **KL's string verbatim**, indications embedded, unsplit. This is
honest — APF Section D *is* a common dosage range, not an indication-specific one — and it makes the
wrong-indication failure **unrepresentable**: there is only one record, and it carries every indication
the clinician needs to choose between, in KL's words.
**Cost, named:** the frozen field's description says *"considered safe for this patient given their current
clinical context"*, and a common range is not patient-specific. C2 surfaces a **reference range to a
clinician who selects**, which is how the APF book is used and is consistent with Guardrail 2 —
`required_human_review` is always true. Indication-aware selection is a real future capability and is
registered as a follow-up (`dose-guidance-indication-blind`), not smuggled in here: it would need
`getDoseGuidance(drug, indication)`, SNOMED→indication matching, and a change to the engine's dose path.
**Splitting KL's clinical text by indication would also be the agent parsing clinical prose — the thing
the AHPRA gate exists to prevent.** Not in C2.

### F3 — Tier A is fully covered; phenytoin is weight-based
All **10/10** Tier A drugs are present in the transcription with adult doses (451/471 rows carry one).
**phenytoin**'s adult range is *"4–5 mg/kg daily"* — weight-based, so `assessPlausibility` returns
**`unassessable`** (correct: mg/kg is a different basis and must never be compared to a flat mg dose).
That is the guard working, not failing — but it means phenytoin ships with no plausibility assurance and
must be visible as such, not silently treated as checked.

### F4 — Provenance of the round-trip
`pharm-ingest` FORCES `review_status:"draft"` — correct for agent-retrieved content, and exactly why
`dose_guidance` is deliberately NOT on that route (C1's defence-in-depth test). C2's authoring path is
separate and bespoke: the dose comes from KL's worksheet, and `origin.entered_by` must be his AHPRA id.

## Topology impact
**Servers:** `pharmacology` — the datastore gains records; **`engine.js` unchanged in C2a–C2c**, then C3
removes the mock fallback. **Schemas:** none new (C0's `DoseGuidanceSchema` is the target). **Trunks:**
none. **Receipts:** `mode` stays `mock` (`receiptMode()` gates on `_validated`, flipped by staging, not C2).
**Blast radius:** the first real doses enter the engine's dose path. `getDoseGuidance` starts returning
signed records instead of falling through to mock — **which is precisely why C3 is not optional here**.

## Phases

### C2a — A correct CSV parser `[ENG, un-gated, the highest-risk item]`
`scripts/lib/csv.mjs` — RFC-4180: quoted fields, embedded commas, escaped `""`, CRLF, BOM. ~40 lines, no
dependency. Wire `parseAuthoring()` to accept CSV. **Leave the broken `csvToRecords()` in place but
deprecate it in a comment** — nothing depends on it, and silently changing a shared helper's behaviour is
its own hazard; C2 uses the new parser explicitly.
**Verify:** a round-trip test over **KL's real 471-row file** asserting: 471 rows; abacavir's `adult_dose`
is `"300 mg twice daily, or 600 mg once daily."` (**not** `"antiretroviral"`); no column shift on any row
(every `paediatric_dose` that contains `mg/kg` stays in `paediatric_dose`); and a golden-row check on all
10 Tier A drugs. Plus the negative: the OLD helper demonstrably shreds the same input, so the test
documents *why* the new one exists.

### C2b — The authoring script `[ENG, un-gated; writes nothing without --write]`
`scripts/pharm-dose-author.mjs`:
1. read KL's CSV → `{medicine, adult_dose}` (**adult only** — paediatric is parked; the paediatric plan
   is a separate, gated item and its 232 rows are held, not discarded);
2. build a `DoseGuidanceSchema` record per drug: `context:"adult — APF22 Section D common dosage range"`,
   `safe_dose_range` = the verbatim adult string, `origin:{channel:"clinician_apf_attestation",
   reference:"apf22", entered_by:"<KL AHPRA>"}`;
3. attach `au_congruence` from the C2c comparators; run `assessPlausibility`;
4. **route, never veto**: `implausible` or `unassessable` → the review queue with the reason, for KL;
   `plausible` + any congruence status (**including `non_congruent`**) → writable;
5. `records_checksum` + `attestation` written through **`pharm-reseal.mjs`'s discipline** (R-46: a
   sign-off mutates records, so the seal is stamped after, not before).
**Verify:** fixtures — an `implausible` row is provably in the queue and NOT in `dose-guidance.json`; a
`non_congruent` row IS written (pins AU primacy end-to-end); a row whose `entered_by` is not an AHPRA id
is rejected; `npm run pharm:seals` green after a write.

### C2c — Tier A comparators `[AGENT retrieval, un-gated]`
Agent queries AMASS RegulatoryCore for the 10 Tier A ingredients → authors an
`international_dose_guidance` dev-package → `pharm-ingest --write` (the C1 route, proven).
**Verify:** each record carries a real `amass_id` + the approved indication; ingest accepts; register
populated; **engine isolation re-proven** (nothing reads it).

### C3 — Remove the mock dose fallback `[ENG — MUST land with C2b's first write]`
`pharm-data-source.js:170` falls through to `mock-data.json.dose_guidance_mock` (amoxicillin,
paracetamol, ibuprofen — each self-labelled "(MOCK — not clinically validated)"). Honest **today**, while
every dose is mock. The moment C2b writes a real record, the fallback silently mixes signed and mock on
one path and that label becomes the only thing telling them apart. Absent record → `null` → no dose.
**Verify:** `contract-pharm-validation` (20/20 + 8/8 adversarial) green; a new test asserts an unknown
drug yields no dose; frozen `pharm-intent`/`pharm-check`/`verification-gate.js` byte-unchanged.

### C2d — Attestation `[CLINICIAN — KL]`
KL reviews the generated records + the review queue, attests, and the datasets move to
`clinical_sign_off:true`. **Then `pharm-reseal.mjs --reason "…"` (R-46's rule: a sign-off mutates records).**

## Verification summary

| Milestone | Proof | Expected |
|---|---|---|
| C2a | RFC-4180 round-trip over the real 471-row file; no column shift; 10 golden rows | green; abacavir adult dose intact |
| C2b | fixtures: implausible→queue, non_congruent→written, non-AHPRA→rejected | green; `pharm:seals` green |
| C2c | AMASS ingest + isolation re-proof | green; nothing reads the register |
| C3 | `contract-pharm-validation`; no-dose-for-unknown; frozen byte diff | green; empty diff |
| C2d | `pharm:seals` after attestation | 21+ sealed, 0 broken |

## Invariant check
**Preserved.** *No dosages from the LLM:* every number is KL's, entered under his AHPRA id; the agent
parses and routes but never originates — and C2 does **not** split his clinical text (F2). *No autonomous
prescription:* `required_human_review` always true; doses emit only on PASS/WARN. *AU jurisdiction:*
comparators are appraisal-only, engine-isolated. *Fail-safe:* implausible/unassessable → queue, never
silently written; C3 makes absent → no dose. *Mock-never-as-live:* C3 removes the mixing path.
*Paediatric hard limit:* untouched — adult rows only; the 232 paediatric rows stay held.
*Scoring firewall:* not touched. **Nothing patient-facing: datasets stay `-dev`, receipts stay `mock`.**

## Register impact
**Closes:** `dose-mock-fallback-mixing` (C3). **Advances:** `dose-guidance-empty-no-au-source` → PARTIAL
(Tier A authored; C4 remains). **Opens:** `dose-guidance-indication-blind` (Medium — the engine cannot
select by indication; one-record-per-drug is the mitigation, not the fix).
**⚠️ `dose-guidance-empty-no-au-source` MUST NOT be resolved while R-47 is open** — C2 makes non-congruent
doses real, and R-47 is what guarantees a clinician is SHOWN the divergence they are assumed to have weighed.
**Gap-register:** R-22 unmoved; blocker #1 stays RED.

## New dependencies
**None.** The CSV parser is ~40 lines of first-party code — an xlsx/csv package is not justified for one
controlled input, and adding a dependency to the dose path is exactly where supply-chain risk is least welcome.

## Decisions needed before Phase 3 (GATE)
- **D-C2-1 — One record per drug, verbatim common range** (F2). The alternative silently emits a
  wrong-indication dose. *Recommend as specified.*
- **D-C2-2 — Confirm the Tier A 10**: methotrexate, carbamazepine, metformin, sulfasalazine, phenytoin,
  alendronate, apixaban, dabigatran, simvastatin, rivaroxaban (the NTI/anticoagulant/cytotoxic set, all
  already at 14–17 datasets). All 10 have adult doses in your transcription.
- **D-C2-3 — phenytoin** is `mg/kg` → `unassessable`, no plausibility assurance. Ship it flagged, or hold
  it for the paediatric/weight work? *Recommend ship flagged* — it is an adult reference range and the
  clinician computes, exactly as from the book.
- **D-C2-4 — Input format.** Your CSV as-is (recommended — it exists, and C2a makes it safe to read), or
  JSON.
