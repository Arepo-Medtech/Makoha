# Grounding execution log

Records what was committed to `kenleefreo/heydoc` for the grounding/MCP design and execution phases.

---

## M1 — the blind commit: an accident becomes a guarantee (2026-07-15)

**Status:** `npm test` (EXIT=0, 68 suites) + `verification` (Pass: true) + `trunk:stub:all` (EXIT=0). Frozen contracts byte-unchanged vs `9b93eb5` — **no schema field, no verifier check added**.

**The property.** Trunks 1.0–5.0 must form an *independent* view and may never see a clinician's leading hypothesis. Anchoring, positional bias and sycophancy do not merely coexist in a language model — they **compound**. A differential produced after the human has spoken is not a second opinion; it is an amplifier of whoever spoke first. 6.0–9.0 deliberately **may** see it: by then the independent view exists and comparison is the entire point.

**The design's mechanism was wrong, and research corrected it.** `TRUNK-RISK-MODEL.md` §4 said "add `clinician_hypothesis` to the context-allowlist DENY set for T1–T5". But `context-allowlist.js` is already **default-deny** and **trunk-agnostic** — it filters case content (00/01/02 nodes). There was no DENY set to add to, and no trunk scoping to add it to.

**And the property already held — by construction.** Nothing produces a `clinical_assessment` fact (the sole reference is a *consumer's* priority-ordering map in `models/jamba/assembler.js`); `user_input` never reaches the packet (`routing(_userInput, trunk)` ignores it — the leading underscore is the contract); the ContextPacket is `additionalProperties:false` with no hypothesis field.

**But it held by ACCIDENT.** `clinical_assessment` is a valid category in the packet's own enum. The day someone adds "the clinician's working dx" — plausible, since it is genuinely useful for 6.0–9.0 — trunks 1.0–5.0 would inherit the anchor and **nothing would say a word**. That is exactly how a property stops holding in silence, and it is the same shape as R1.

**So M1 is not a new wall — it turns the accident into a guarantee.** The guard **throws**, following `context-allowlist`'s scoring-store precedent (*"a firewall-breach attempt must halt packet assembly loudly, never degrade to a dropped field"*): silently dropping the anchor would leave the caller believing it was delivered. Its message names where the assessment belongs instead.

**A guard that can only be checked by grepping its own source is not tested.** The guard is unreachable through the public surface precisely because nothing produces the fact — so `contextInjection` is exported and a `_test_facts` seam added, and the suite drives the real assembler. Tamper-proven **behaviourally**, both ways: making 5.0 sighted FAILS; neutering the throw FAILS.

**Remains:** M2 (descent guard — T5's output as an EvidenceNode + a `downstream_independence` check, breaking the model→clinician half), M3 (positional stability), M4 (register separation).

## R1+R2 — the trunks stop claiming a wall they do not have, and gain a purpose (2026-07-15)

**Status:** `npm test` (EXIT=0, 67 suites) + `verification` (Pass: true) + `trunk:stub:all` (EXIT=0, **unaffected** — the proof this is a text change) + `pharm:seals` 25/25. Frozen contracts byte-unchanged vs `9b93eb5`. **No verifier check added, removed or altered.**

### R1 — the false claim

All nine prompts ended with `## Constraints (enforced by verification)` over `- No diagnosis. - No dosages.` **Verification checks neither.** Measured, not inferred:

```
"The patient has appendicitis."                  → not caught
"Take 500 mg of amoxicillin three times daily."  → not caught
```

`overconfident_diagnosis` needs "definitely" within 40 chars of "diagnos"; `advisory_dose_leak` needs *advisory* framing (it targets the G9 leak). **The detectors are correct — the claim was the defect.** And the prompts invented it alone: `trunk-constraints.md` always listed exactly which checks fire and never listed a diagnosis check; the cheatsheets already separated `Verifier checks that apply` from `Literal constraints`. **The nine prompts were the sole outlier** — inverting the usual rule: source and derived agreed, the *implementation* was wrong.

An unenforced constraint labelled "enforced" buys silence with a promise it does not keep: absolute enough that nobody asks how the risk is modelled, empty enough that it isn't. That is `presents_mock_as_live`.

**The bar (R1-c).** `contract-trunk-claims.js` makes the honesty mechanical — the principle applied to itself. Written FIRST and run against the old prompts: **9/9 FAILED**, the defect stated mechanically rather than asserted. A prompt may not name a bar that does not exist, must match `trunk-constraints.md` exactly, and must still state every literal constraint as a bullet. Tamper-proven both ways. **Its own first cut had a false-pass** — it tested the whole file for `/no diagnosis/i` and its own prose satisfied it, so deleting the constraint passed; caught by tampering, scoped to bullets.

### R2 — the mountain, as a risk model

The operator's Everest allegory carries the safety argument the design was missing: **most deaths are on the descent.** T6–T9 run inside T5's frame — exactly where anchoring propagates, premature closure bites and sycophancy compounds. The safety budget was uniform; the mountain and the bias analysis independently say spend it at the summit and on the way down.

Four fields per trunk — **Altitude** (where on the effort/yield curve; what it may spend) · **What you are FOR** (positive scope) · **The failure mode HERE** (named for a language model at this position) · **The bars** (R1's).

| | before | after |
|---|---|---|
| positive scope statements | **0** across all nine | **4–11** per trunk |
| LLM failure modes named | **0** | 1–3, matched to altitude |
| T5 (summit) | 5 neg / **0 pos** | 7 neg / **11 pos** |

T5 is now stated as what it is: **the disconfirmation engine** — "that is why you are the summit: not because you conclude, but because you are the only trunk positioned to see what would REFUTE the emerging picture… your value is highest exactly where you are least agreeable." Its failure mode is named plainly: *"you will not FEEL the unaccounted-for abnormal calcium."* T8 is "the last belay" and its catastrophic mode is sycophancy past a HARD_FAIL.

**Contracts byte-untouched** — R2 moved no output key, no fail-safe status. Nothing lifted: every literal constraint survives, asserted.

### R3 + a pre-existing defect found

All nine cheatsheets now join the two halves they already carried. `trunk-constraints.md` states the distinction once, at the top. Stub-agent strings reworded so a grep does not land on the old framing.

**Found while syncing:** the T1.0 cheatsheet's literal constraints read `"triage only"` — **T2.0's constraint, copy-pasted**. The source (*"Initial routing and safety gate only"*) and the prompt were both correct; the derived file was the defect. Corrected per the `<context_loading>` maintenance rule.

**Register:** `trunk-constraint-claims-unenforced` (PARTIAL, High, `presents_mock_as_live`). **Remains:** R3–R6 — the actual bars (M1 blind commit, reusing context-allowlist's default-deny; M2 descent guard, T5-as-EvidenceNode + `downstream_independence`; M3 positional stability; M4 register separation). Until then "no diagnosis" is conventional and the register says so.

## E8b — "in doubt" means ASK, not refuse (operator ruling) (2026-07-15)

**Status:** `npm test` (EXIT=0, 66 suites) + `verification` (Pass: true) + `pharm:seals` (25/25) green. Frozen contracts byte-unchanged vs `17da525`. Nothing patient-facing.

**Ruling:** *"Do not harvest RxNorm US Brands — but when a US Generic is only spelling variant or near synonym based on the same INN-RXCUI this should be place in the drug_vocabulary bucket — as the mix of the two still occurs frequently — if the system is ever in doubt — a question should return to patient or doctor — to confirm the exact medication they intended."*

**The correction.** E8's first cut had a boolean bar: `steer` or `refuse`. That made "the system is in doubt" a reason to **dead-end** a name a human could resolve in one answer — the same suppression instinct the show-evidence principle exists to stop, applied to identity instead of evidence. Three states now:

| state | count | meaning |
|---|---|---|
| `steer` | 5108 | resolve silently (AU, unambiguous, already ours) |
| **`confirm`** | **72** | **ASK the patient/doctor** — 70 US generics + 2 ambiguous |
| `refuse` | 16 | only where asking is nonsense: a manufacturer's name is not a drug |

**US generics are recorded and they ask.** paracetamol/acetaminophen · salbutamol/albuterol · rifampicin/rifampin · aciclovir/acyclovir · mesalazine/mesalamine · leuprorelin/leuprolide · glycerol/glycerin. Verified live on a signed copy:

> `acetaminophen` → **"You entered "acetaminophen", which is the US name for the medicine known in Australia as "paracetamol" (the same ingredient, RxNorm 161). Is "paracetamol" the medication you intend?"** → `BLOCKED_NO_PROOF` pending the answer.

An unanswered identity question **is** missing proof: we do not know which drug this is, so no check below proved anything about it. The name no longer dead-ends, and a US name still never silently becomes an Australian one — `international_generic` + `steer` is **unrepresentable at the schema level**, signed or not.

**US brands are not harvested, and the line comes from RxNorm's own data** rather than a guess about which strings look like brands: admitted only when TTY ∈ {IN, PIN, MIN}. Verified across all 987 resolved concepts — **IN 933 · PIN 51 · MIN 2 · BN 0**. (The first TTY attempt returned empty for all 987 — `allProperties?prop=names+codes` does not carry TTY. Caught and re-fetched from the property endpoint. Had it shipped, every international generic would have been unverifiable and correctly refused: a silent loss of the whole ruling.)

**Ambiguity asks too, and still never picks** — every candidate presented. A `confirm` without a question is unrepresentable: "ask" with nothing to ask is a block wearing a nicer word.

**Unchanged:** `Lasix` still resolves silently → PASS + dose. Still unsigned; sign-off unlocks the 3635 brands and the 70 confirm-prompts.

## E8 — the drug vocabulary: one identity for every name in use (2026-07-15)

**Status:** `npm test` (EXIT=0, 66 suites) + `verification` (Pass: true) + `pharm:seals` (25/25) + capability-groups (10 groups / 24 capabilities) green. Frozen contracts byte-unchanged vs `17da525`. Nothing patient-facing.

**Operator task:** *"'Drug vocabulary (Using the PBS INN Australian name as Primary authority)': catch and list all the names, synonyms, international variants and minor spelling variants that eventually get used interchangeably — so they link to the unifying identifier… unifying the prevalent use of variants by patients, doctors and systems."*

**What it is.** 1455 drugs · 5197 names — 3635 AU brands, 1455 primaries, 70 international generics, 18 former names, 16 company artifacts, 2 spelling variants. RxCUI on 969, WHO ATC on 1094.

```
Lasix       (patient)  ┐
frusemide   (doctor)   ├─→  furosemide · RxCUI 4603 · ATC C03CA01
furosemide  (system)   ┘
```

New capability group **`drug_identity`** — cross-cutting, deliberately not an APF22 heading. Every other group answers a clinical question *about* a drug; this one answers **which drug**, the question all the others silently assumed. E6 proved the assumption unsafe.

**The trap.** RxNorm's canonical is the USAN, not the INN: `acetaminophen`, `albuterol`, `epinephrine`. A vocabulary keyed on `rxnorm_name` would have Americanised an Australian clinical system — **invisibly**, since those spellings appear nowhere in our data and no collision report would flag it. So **PBS (the Australian Government's own formulary) is the naming authority; RxNorm supplies the concept id only.** AU brands come from PBS's own `brand_name` field, never RxNorm's US brand table — the jurisdiction hazard closed at the source rather than by a rule.

**Not ingest-routable**, the same bar `dose_guidance` has and for the same reason: a vocabulary entry redirects a lookup, so an agent able to author one could map `amoxicillin` → `warfarin` and steer a dose. Built deterministically, never from prose.

**16 company names caught** — PBS's `brand_name` carries "Pfizer Australia Pty Ltd" and 15 others. They name a manufacturer, not a drug.

**Ships unsigned and steers nothing.** Sign-off is what unlocks the 3635 brands. Honest limit: PBS is the *subsidised* list, so OTC brands (Panadol) are absent — a coverage gap needing a TGA/ARTG source, not a defect.

## E7 — the INN name is the primary identity (operator ruling) (2026-07-15)

**Status:** `npm test` (EXIT=0, 65 suites) + `verification` (Pass: true) + `pharm:seals` (24/24) green. Frozen `pharm-intent` / `pharm-check` / `verification-gate.js` / `verifier.js` byte-unchanged vs `17da525`. Nothing patient-facing.

**Operator ruling:** *"re-author all listings so the INN name is the primary identity so links to the capabilities or medication related content are never lost or not linked based on a misnomer."*

### The trap in the ruling, and the guard that defuses it

**RxNorm's canonical name is the USAN, not the INN.** Taking `rxnorm_name` as "the INN" would have renamed, across an *Australian* clinical system:

```
paracetamol → acetaminophen    salbutamol → albuterol    adrenaline → epinephrine
```

(verified: RxNorm canonical for rxcui 161 is `acetaminophen`, 435 is `albuterol`, 3992 is `epinephrine`.) That is the jurisdiction inversion this repo exists to prevent — a US ontology overwriting AU clinical vocabulary — done in the name of "standardising", and **invisible in the collision report**, because the US spelling never appears in our data so nothing would have flagged it.

The guard is structural, not a rule to remember: **the primary may only ever be a name the datastore already holds.** No new string is introduced, so an RxNorm-only US name cannot enter. **PBS — the Australian Government's own formulary — is the authority**, and across all 19 collision groups PBS *is* the INN; in **9 of them it disagrees with RxNorm's canonical**, which is exactly the trap. Ambiguity **refuses**: `sodium chloride ≡ sodium chloride solution` (PBS holds both) was left alone rather than guessed.

### What changed

**18 renames** across 6 datasets (13 orthographic, 5 substantive). Not renamed: `pbs-formulary.json` and `formulations.json` — they are **mirrors** of external sources, and rewriting a mirror makes it a forgery of its upstream.

**The clinician's word is not lost.** KL attested `frusemide`; the record is now `furosemide` with `also_known_as: ["frusemide"]` and `attested_as: "frusemide"`. The dose TEXT — the thing he signed — is byte-unchanged, so his attestation stands on what he reviewed. The rename is a datastore *identity* decision, recorded in each dataset's `attestation.rename_history[]` with its RxCUI and authority.

**The old name still LINKS** — the second half of the ruling. `canonicalise()` resolves an alias to the primary, **once, at the engine boundary**. That placement is the safety property: resolving aliases inside `getDoseGuidance()` alone would have rebuilt the E6 defect exactly — a dose found under the alias while the interaction check still missed and silently passed. All eight accessors now key on one identity. The resolution is **reported**, never silent. The aliases are not an outside claim: they are names *this datastore already used* for that drug, so nothing consults the unsigned RxNorm map at runtime.

### The result

```
frusemide      HARD_FAIL  interaction_severe   ← was: PASS + dose + interaction PASS
furosemide     HARD_FAIL  interaction_severe
eformoterol    PASS  dose YES                  ← was: dose orphaned under the old name
formoterol     PASS  dose YES                  ← was: no dose at all
```

Both spellings now behave identically. **The E1 regression is fixed at the root, not merely guarded** — all 6 splits reconciled; `doseIdentitySplit()` remains as belt-and-braces and should never fire again.

**The test was reframed, not weakened.** It previously asserted "the six known splits BLOCK"; E7 made them resolve. The invariant is now stated more sharply — **a misnomer must not change the answer**: two names for one drug must produce the same status, the same flags, and agree on whether a dose exists. That catches splits nobody has thought of yet, and it pins the jurisdiction guard (`acetaminophen` must never appear; `paracetamol` must survive).

**Register moves.** `dose-identity-split-unsafe-pass` → root-fixed (guard retained). New `inn-primary-identity` reconcile + `--refresh-held-in` (recomputes `held_in` with no RxNorm call — a stale map is worse than none, since the guard reads it). **Remaining for the clinician:** 5 SUBSTANTIVE renames are different words RxNorm treats as one concept and PBS authorises — `certolizumab → certolizumab pegol`, `erythropoietin → epoetin alfa`, `hydroxyurea → hydroxycarbamide`, `thyroxine → levothyroxine`, `hexamine hippurate → methenamine hippurate`. These are clinical identity claims, not spellings, and want KL's eye.

---

## E6 — the identity map, and the E1 regression it found (2026-07-15)

**Status:** `npm test` (EXIT=0, 65 suites) + `verification` (Pass: true) + `pharm:seals` (24/24) green. Frozen `pharm-intent` / `pharm-check` / `verification-gate.js` / `verifier.js` byte-unchanged vs `17da525`. Dataset `-dev`, receipts `mock`, nothing patient-facing.

### The headline: E1 introduced a safety regression, and E6 found it

Verified live on the engine **before** the fix:

```
frusemide    PASS       dose EMITTED   interaction_check PASS       no flags
furosemide   HARD_FAIL  no dose        interaction_check HARD_FAIL  interaction_severe
```

Same drug (RxNorm 4603), same patient, same co-medications (digoxin + lithium). The dose lives under the Australian name `frusemide`; the interaction and NTI data live under the INN `furosemide`. **The check ran, looked up the wrong string, found nothing, and passed.** A dose emitted while its safety checks were inert.

Before E1 these drugs had no dose, so `knownDrug()` was false and the engine returned `BLOCKED_NO_PROOF`. **E1 turned a fail-safe block into an unsafe pass** by populating dose-guidance from APF's name-space while every other capability uses the INN name-space. Six drugs, measured not estimated: frusemide/furosemide · chlorthalidone/chlortalidone · eformoterol/formoterol · cholecalciferol/colecalciferol · beclomethasone/beclometasone · hexamine hippurate/methenamine hippurate.

It also **inverts the register's own claim** that "a miss is a SILENT no-dose (fail-safe direction)". For a split name the miss is a silent no-INTERACTION-CHECK *while a dose flows*.

### The guard, and why an unsigned map may apply it

`doseIdentitySplit()` detects a dose whose RxNorm-equivalent sibling holds safety data its own name lacks; `engine.js` downgrades PASS/WARN → `BLOCKED_NO_PROOF` and **states the reason and the sibling name** — never a silent block. A check that looked up a name the datastore files under a different spelling has not PROVEN anything, so its PASS is not proof, which is precisely what BLOCKED_NO_PROOF means. HARD_FAIL is more severe and stands untouched.

**The asymmetry that makes this legitimate on an unsigned map:** an unsigned identity map may **BLOCK** (fail-safe — worst case a spurious block a clinician resolves) but may **never STEER** a lookup (unsafe — being wrong doses the wrong drug). Same data, opposite risk profile, opposite gate. Blocking needs no sign-off; steering does.

Proven both ways in `contract-ingredient-identity.js`: the 6 splits block with a reason, `furosemide` still HARD_FAILs on the real interaction (the fix did not mask it), and an unaffected drug still emits its signed dose (the guard is narrow, not a blanket — an over-broad block would bin the clinician's signed content behind a naming concern).

### The register's framing of FL-06 was wrong, twice, and is corrected

- *"the 29% non-match gates coverage"* — **false**. E1 removed a hardcoded array and coverage went 11 → 451 with the normaliser unbuilt.
- *"a miss is a SILENT no-dose"* — **false**. An unrecognised name fails `knownDrug()` → `BLOCKED_NO_PROOF`. Fail-safe *and* visible: "amoxycillin", "clomifene", "Amoxil" and "totally-made-up-drug" all block.
- Measured: of the 123 dose ingredients absent from every other capability, **120 are genuine coverage gaps** (we hold a dose but no interaction/scheduling fact) and only **3** are orthographic variants — and those 3 differ only against unsigned bulk data no accessor reads. A normaliser would have "fixed" three records. The real defect was the six splits, which the register never named.

### The identity map (`ingredient-identity.json`, 1473 names, UNSIGNED)

Harvested from RxNorm (NLM, public domain, registered `rxnorm-nlm`, `use_restriction: content_ingest`) by **exact/registered-synonym lookup (search=0)**. 987 resolved · 19 collision groups · unresolved recorded with a reason, never dropped.

**It is not fuzzy matching, and that was verified before building.** Two names are the same ingredient ONLY when RxNorm returns the same RxCUI. Look-alike pairs stay distinct — **0 collisions** across amlodipine/amiodarone, hydralazine/hydroxyzine, clonidine/clonazepam, vinblastine/vincristine, chlorpromazine/chlorpropamide, carbamazepine/oxcarbazepine, methotrexate/metronidazole, dexamphetamine/dexamethasone. Typos refuse: "amoxicilin", "amlodipin" → no match. **Normalized search (`search=2`) was REJECTED** precisely because it *did* resolve "amlodipin" (→ 104416, amlodipine besylate) — approximate matching, the one thing that must not be in this path.

**It ships UNSIGNED and the resolver refuses to steer on it.** A name→ingredient map is a drug-IDENTITY assertion; this repo's own precedent (APF_TO_DATASTORE) is that identity assertions are reported, never silent, and are "data a clinician can read and correct". It is authored for KL to review, not switched on behind him — two mappings in particular want his eye: **epoetin alfa ≡ erythropoietin** and **levothyroxine ≡ thyroxine** (RxNorm gives each pair one concept; whether that identity should steer a dose lookup is a clinical call, not the agent's).

**Transport note:** Node's outbound is blocked in this environment while curl is permitted, so the harvest has an explicit `--via-curl` shim, reported in the run header. Explicit, never a silent fallback — a harvest that quietly changed transport is a harvest whose provenance you cannot reason about.

**Register moves.** New `dose-identity-split-unsafe-pass` (Critical pre-fix → Medium guarded) and `ingredient-identity` (PARTIAL, unsigned). `pharm-ingredient-name-normalisation` framing corrected. **Remaining:** reconcile the two name-spaces — re-author the 6 dose records under the INN name (a worksheet round-trip, since the ingredient key is what KL attested against) or sign the identity map so the resolver may steer. Until then those 6 doses are unreachable, which is the honest state and strictly safer than what E1 shipped.

---

## E3 — the evidence plane: R-47b built, and the dose evidence reaches the clinician (2026-07-15)

**Status:** `npm test` (EXIT=0) + `verification` (Pass: true) + `pharm:seals` (23/23) green. Frozen `pharm-intent` / `pharm-check` / `verification-gate.js` / `verifier.js` byte-unchanged vs `17da525`. **Nothing became patient-facing.**

**The distinction this rests on.** "No autonomous prescription" means the AI must not MINT a dose. It does not mean a registered practitioner may not be SHOWN one with its provenance. Showing a clinician the signed AU dose, the US/EU labels beside it and what the literature reports IS the human-in-the-loop — it is what Guardrail 2 presumes is happening. Patient-facing rules had been applied to the clinician-facing path.

**Two planes, already separate in this architecture.** `PharmCheck` (frozen, `additionalProperties:false`, seven DOSE_KEYS) is authoritative and patient-promotable and is **untouched**. The `ReviewBundle` — which already described itself as *"what the clinician reviewer is SHOWN, as a hashed contract"* — is the evidence plane, and was not frozen. The bar between them, `releaseToPatient()`, already existed. E3 adds `ReviewBundle.dose_evidence[]` and changes neither.

**What now reaches the clinician** (`mcp/servers/pharmacology/dose-evidence-plane.js`): the clinician-signed AU dose (the one authoritative kind, carrying who attested it); **every US/EU comparator VERBATIM**, labelled foreign and framed as evidence beside the AU dose, never a verdict on it; the CDS gateway's `dose_candidate` — which the client mapped and the pipeline then **discarded**, the circularity being that the dose had no consumer *because* it was discarded, and was cited as the reason not to build the KM that produces it; the **261 clinician-signed literature records** that were engine-isolated (correctly — a study finding is not a dose) but where engine-isolated had silently been doing the work of clinician-isolated; the congruence appraisal and the plausibility read, as flags never vetoes.

**R-47b, the runtime surface, is built.** Carrying the evidence in the bundle is NOT R-47b — that is precisely the trap R-47 names, and the first cut of E3 fell into it: the bundle carried both comparators and the portal's HTML rendered neither. `portal/server.js renderDoseEvidence()` renders it, and `assertDoseEvidenceRendered()` makes a surface that drops a comparator **throw** — `renderBundle` self-verifies through it, mirroring `renderDoseWorksheet`'s discipline. Verified on the real render: HTTP 200, AU dose + JYLAMVO + the EU label + the literature displayed, AU primacy stated, authoritative distinguished from advisory. The evidence rides **inside `bundle_sha256`**, so removing a comparator breaks the hash: "the clinician saw the divergence" is now part of the medicolegal record rather than an assumption of the ruling.

**§1.1 held — and I had violated it.** The operator's own limit: *"'Show the clinician everything' never becomes 'show a dose the firewall blocked'. No override, no exception."* The first cut surfaced the AU dose, both foreign labels and the literature doses on a HARD_FAIL. The principle governs what we show when we show; it does not dissolve the firewall. Past a block (HARD_FAIL / BLOCKED_NO_PROOF / paediatric) **no dose text is surfaced** — and the withholding is ACCOUNTED FOR, with counts and reason ("1 clinician-signed AU dose, 2 US/EU comparators, 2 literature records — withheld because the firewall returned HARD_FAIL"), so a gated action never becomes the silent drop the principle actually names. A drug we hold nothing on declares no withholding: a phantom would imply knowledge we lack.

**Engine isolation preserved STRUCTURALLY.** `international_dose_guidance`'s isolation is not a comment — it holds because no engine accessor exists ("preserved by construction, not by wording"). Adding `getInternationalDose()` to `PharmDataSource` would have handed `engine.js` a path to a foreign label. So the plane reads the isolated registers directly and is imported by the pipeline's **portal channel only**; the engine's accessor set stays exactly eight, none foreign. The test pins both, because that is exactly the guarantee a later convenience import dissolves.

**A false positive, caught by the suite.** The first `assertNoAdvisoryInDose` compared every advisory item's text against the dose and fired on `plausibility` — which quotes the dose line it assesses, so for a single-line monograph that string IS `safe_dose_range`. It broke `contract-firewall` on a legitimate PASS. A safety bar with false positives does not fail safe; it gets loosened under pressure and is then absent when the real inversion arrives. Narrowed to the actual hazard: foreign-sourced dose text (`international_label` / `cds_dose_candidate` / `literature`) reaching the AU dose field. Still fires on a US label as the AU dose; no longer fires on the genuine one.

**The pipeline comment revised** (operator: *"this may need revision"*). Was: *"Nothing here emits a dose; it only tightens continuation."* The first half remains true of the AUTHORITATIVE dose and must; the second half was describing evidence going in the bin, which was never a safety property. The status fold is byte-for-byte the same monotone operation.

**Register moves.** `dose-congruence-surfacing-unbuilt` → R-47a **and** R-47b both BUILT; **stays PARTIAL and does NOT resolve** — the Portal itself is blocker #2 and stays RED (FL-11 WORM bucket, FL-43 live IdP); a rendered page behind an unbuilt portal is not a clinician in a live consult. `dose-guidance-empty-no-au-source` still must not resolve while R-47 is open. Gap-register R-47 updated. **Field lag closed:** `pharm-records-checksum-unverified` → R-46 and `dose-congruence-surfacing-unbuilt` → R-47 links backfilled; zero `pending promotion` remain.

---

## E1/E2 — the eleven become 451: the full APF22 adult set, clinician-attested (2026-07-15)

**Status:** `npm test` (EXIT=0) + `verification` (Pass: true) + `pharm:seals` (23/23) green. Frozen `pharm-intent` / `pharm-check` / `verification-gate.js` / `verifier.js` / `pipeline.js` / `engine.js` byte-unchanged vs `17da525`. Dataset stays `-dev`; receipts stay `mode=mock`; **nothing became patient-facing.**

**Why there were only 11 doses.** Not a safety bar — a hardcoded array. `scripts/pharm-dose-author.mjs` ran over `const wanted = [...TIER_A, "amoxicillin"]`: eleven drugs, the C2 risk-tiered first pass, never widened. The clinician's transcription always carried **451 adult doses across 471 monographs**; 440 had simply never been authored. Removing the array needed no architectural change, no new data, and no new dependency. The register's claim that coverage was gated on `pharm-ingredient-name-normalisation` (the 71% match rate) was **false** and is corrected in that record: a dose is authored under the APF ingredient name and `getDoseGuidance()` looks up by that same string, so the name only has to be self-consistent.

**E1 — the gate removed.** Every readable adult dose is authored, carrying its plausibility state and `au_congruence` appraisal as LABELS rather than as reasons to withhold it (show-evidence principle). 451 built, **0 validation failures**; the substring bar swept all 451 with **0 violations** — the agent only ever cut the clinician's text. The 20 monographs with no adult dose are skipped and reported (paediatric-only / referral Note / declared Section D absence): the paediatric hard limit holding by construction, since `adultDose()` deliberately does not return the combined "Adult and paediatric dose" label. The C2d attestations **carried forward** on byte-identical `source_statement` (11/11, 0 drift); the dataset flag went to `clinical_sign_off:false` while 440 drafts existed, because a seal that no longer describes what it seals is R-46 wearing a new hat.

**E2 — the attestation surface, tranched.** Operator ruling: "xlsx, Tier A + indication-present first." Tranche 1 = 123 records (Tier A ∪ indication-present), tranche 2 = 328 (the remainder — NOT lesser evidence: `indication_status:absent` is a fact about the SOURCE, never a judgement on the dose). Tranching is **asserted lossless** (123 + 328 = 451): a record in neither tranche is a clinician-transcribed dose that silently never reaches a clinician. **KL (MED0001857758) attested all 451 — 0 Amend, 0 Reject.**

**New: `scripts/lib/xlsx-min.mjs`, a dependency-free .xlsx writer/reader.** No xlsx library exists in `package.json` and CLAUDE.md bars introducing a dependency mid-execution; an .xlsx is a ZIP of XML and Node ships `zlib`, so the clinician gets the format that demonstrably worked for the 88/308 passes with **no new supply-chain surface on a clinical-safety repo**. Deterministic for a fixed timestamp (a worksheet is a medicolegal artifact; a diff should mean the content moved, not the clock). Verified beyond "it generates": valid ZIP, every part well-formed XML, cells round-trip to the correct refs, dropdown anchored to `J2:J124`, and macOS QuickLook renders it.

**New: `scripts/pharm-dose-apply-signoff.mjs` — the round-trip's missing half.** The 88/308 sign-offs were applied **by hand**, which is exactly how R-46 happened. Three guards, each proved by deliberately breaking it rather than asserted:
- **Text drift.** The clinician attested the words the worksheet SHOWED him. Every attested record's `source_statement` is compared byte-for-byte against the verbatim cell at apply time; any mismatch **aborts the whole apply**. Proved by laundering sertraline's dose to "500 mg daily, max 2000 mg" — refused, naming the row. Without it, a re-author between generation and apply would launder new text through an old signature: an agent-authored dose wearing a clinician's name.
- **Unreadable marks.** A blank or unrecognised decision aborts. "I could not read his mark" must never resolve to "approved".
- **The re-seal (R-46), made mechanical.** Applying a sign-off mutates every attested record's provenance, invalidating the authoring-time `records_checksum` — the exact mechanism that left 7 datasets stale. The script re-seals in the same pass that causes the drift: `d6d77ecac912… → 733aacafcd5e…`, recorded in `attestation.reseal_history`.

Amend/Reject are **reported, never auto-applied** — an amendment is the clinician's new words and goes back through Channel B so the substring bar still proves the agent only cut. `regulatory_sign_off` is never set here; that is FL-50, a different gate.

**A real bug, found by its own guard.** Testing the blank-decision refusal, a blanked cell read back as `"55"` rather than blank: Excel writes empty cells self-closing (`<c r="J2"/>`), and the reader required a closing tag, so **an empty cell captured the next cell's body as its own value**. On this worksheet that reads the clinician's amendment NOTE (K) as his DECISION (J) — had the note column contained the word "Attest", an unreadable mark would have become an approved dose. Fixed and pinned in `test/contract-dose-worksheet-xlsx.js` with the reasoning written down.

**R-47a strengthened, not weakened.** The bar is now **surface-agnostic and serves both surfaces from ONE implementation** — a second hand-written copy of a safety assertion for a second surface is precisely the silent-divergence hazard R-47 names. Its delimiter is load-bearing, not cosmetic: `"implausible".includes("plausible")` is `true`, so an undelimited check would let a record rendered only as *implausible* pass a check for *plausible* — a false all-clear on the exact axis the bar guards. `contract-dose-worksheet.js`'s sweep now reads **both** `.md` and `.xlsx` from disk and asserts what R-47a actually claims: **nothing is `approved` that was not DISPLAYED somewhere**. Tranche-aware, because attestation happens in tranches. Tamper-proved: a forged blind approval fails.

**One artifact was destroyed and restored.** Regenerating the worksheet overwrote the *signed* C2d markdown — the medicolegal record carrying KL's 11 ☑ marks. Caught in `git status`, restored from HEAD (11 ☑ intact, empty diff), and the root cause fixed: the renderer's date-keyed default path silently clobbered on any same-day re-run, and now **refuses** to overwrite an existing worksheet.

**Register moves.** `dose-guidance-empty-no-au-source` → advanced (11 → 451, all attested; stays `PARTIAL` — **must not resolve while R-47b is open**). `pharm-ingredient-name-normalisation` → scope **corrected** (silent-omission risk for ~132 ingredients, NOT a coverage gate). New: `contract-dose-worksheet-xlsx` wired into `npm test`. **Blocker #1 stays RED** — FL-34 (live CDS) + FL-50 (regulatory) own it. What changed is that the *knowledge* is no longer the gap.

---

## AU primacy — non_congruent no longer requires a note (2026-07-15)

**Status:** operator ruling, second correction to the C0 amendment. `npm test` (62) + `verification` + `pharm:seals` green. No dose authored; registers still empty.

**The ruling.** *"The AU clinician is the final word of authority. As long as the non-congruent fact has been alerted to the clinician, it is assumed the clinician has weighed it in their decision and it does not require a note. AU dose has primacy."*

**Why it was right, and why the requirement was wrong twice over.** The C0 amendment removed a gate that *binned* a differing AU dose — but it left behind a demand that the AU dose **explain itself**. That is the same inversion in a milder form: requiring justification makes the foreign label the default and the AU dose the deviation. AU has primacy; a differing US/EU label is a **fact to surface**, not a discrepancy to account for.

And a second reason the operator did not need to give: **who would have written the note?** In Channel B the clinician enters the dose and the appraisal runs in the authoring pass — so the note would in practice be **agent-authored clinical reasoning** ("they differ because of indication X") asserted into a record a clinician reads. That is unverified clinical content the agent does not have, where a wrong explanation misleads worse than no explanation.

**What changed.** `au_congruence.appraisal_note` is now OPTIONAL on `congruent`/`non_congruent` and stays REQUIRED on `no_comparator`. The split is principled and mirrors C1's: `no_comparator`'s note is a claim about **the search** ("AMASS holds no FDA/EMA authorisation") — mechanical, verifiable, and the thing that stops anyone claiming "no comparator" to skip the appraisal. `non_congruent`'s would be a claim about **clinical judgement**. Machine claims need justifying; the clinician's does not. The test now pins the reversal in both directions so the rule is not "restored" later.

**The load-bearing catch — new gap R-47 (High).** The ruling's basis is that the fact *has been alerted to the clinician*. **That is an obligation on the SURFACE, and nothing enforces it yet.** The schema guarantees the foreign label's dose is **RECORDED** (`comparators[].dose_statement` is required); nothing guarantees it is **DISPLAYED**. An appraisal recorded but never rendered passes every test, **reads as done because the data sits right there in the record**, and silently defeats Guardrail 2 — because "the clinician weighed it" presumes the clinician saw it. Opened `dose-congruence-surfacing-unbuilt` / **R-47**: before any dose reaches a clinician, the review surface must render `au_congruence.status` and every comparator's jurisdiction/agency/dose verbatim beside `safe_dose_range`, visually unmissable, with a contract test to match. **C2 must not be called complete while R-47 is open.**

---

## FL dose-guidance C2d — the first clinician-signed AU doses (2026-07-15)

**Status:** operator-attested. **11 AU dose records CLINICALLY SIGNED** by Kenneth Lee (MED0001857758) — all 11 **Attest**, 0 Amend, 0 Reject. `clinical_sign_off:true`, `regulatory_sign_off:false`, dataset stays `-dev`, receipts stay `mock`, **0 drafts remain, 23/23 seals verify.** Six gates EXIT=0.

**`dose_guidance` has been empty since this repo began.** It is the one capability that becomes a *dose*, and it stayed empty because the AU dose authorities are licence-restricted and "no dosages from the LLM" bars the agent writing one. **It now holds 11 doses, and every number is the clinician's own verbatim APF22 Section D text.** The agent segmented and labelled it for display and wrote nothing — the schema's substring bar proves that mechanically, and `origin.entered_by` is an AHPRA id no agent string can match.

**A signed AU dose now flows end-to-end:** amoxicillin → `PASS` → `"Oral, 250–500 mg 8-hourly or 1 g twice daily. IM/IV, 250 mg to 1 g every 6–8 hours."` — receipt still `mode:mock`, correctly, until FL-50.

**What the clinician actually saw** (R-47a — the ruling that a non-congruent dose ships unexplained *assumes* he was alerted, so the surface is what makes that true): his verbatim source, every dose line with indication/route/basis/plausibility, and every US/EU comparator dose verbatim with its authorisation status. Including the two that most needed seeing — **carbamazepine**'s order-of-magnitude flag (AU max 2 g vs US *initial* 200 mg: a max-vs-initial artefact, visible and dismissable on sight) and **metformin**'s only citable US label being **WITHDRAWN**, marked "not a current label" rather than read as current.

### R-46 reproduced live — and caught this time

Applying the attestation set `provenance.reviewed_by`/`review_status` on all 11 records, **which broke the seal immediately** — the exact mechanism that silently invalidated 7 datasets for months. The difference: `contract-pharm-datastore`'s new assertion made it **visible within seconds** instead of decaying quietly, and it was closed deliberately through `pharm-reseal.mjs --reason`, with the basis now living in `attestation.reseal_history[]`. The R-46 fix demonstrated itself on the very next sign-off it had to survive.

**Scope, held:** ADULT doses only. The 232 paediatric rows stay excluded — the paediatric hard limit is unchanged and its plan is parked.

**REMAINING, and none of it is cosmetic:**
- **R-47b — the RUNTIME clinician surface** (portal blocker #2). **`dose-guidance-empty-no-au-source` MUST NOT be resolved while this is open.** C2 made non-congruent doses real; R-47b is what guarantees a *consulting* clinician sees the divergence the AU-primacy ruling assumes they weighed. R-47a covered attestation only.
- **C4 — TGA PI (Channel A)**, operator-gated on the same TGA access FL-05 awaits.
- **Coverage beyond Tier A**, gated on `pharm-ingredient-name-normalisation` (only 71% of APF names match the datastore; `amoxycillin`≠`amoxicillin`).
- **FL-50 regulatory** before anything is patient-facing.

---

## FL dose-guidance C2b/C3 — the first real AU doses, and the mock fallback removed (2026-07-15)

**Status:** operator-approved. **11 AU dose records authored** (Tier A + amoxicillin), all `review_status:"draft"`, `clinical_sign_off:false` — **KL's attestation (C2d) still required**. Six gates EXIT=0; 23 seals verify; frozen contracts, `engine.js` and the HIST-2 path byte-unchanged.

**The agent originated no dose.** Every `safe_dose_range` is the clinician's verbatim APF22 text, `entered_by: MED0001857758`, and the schema's substring bar proves mechanically that the script only ever cut, never wrote.

**NOTHING WAS BINNED.** Every readable adult dose was written, carrying its plausibility state and its `au_congruence` appraisal. `implausible` is a WARN; `unassessable` states that no claim is made rather than implying an all-clear. Congruence **defaults to `non_congruent` when a comparator exists** — deliberately, because "congruent" is the *stronger* claim ("these agree, look no further") and is a clinical judgement the script has no standing to make. `non_congruent` simply puts both doses in front of the clinician, which is the desired outcome anyway; it ships freely and needs no note (AU primacy). KL may upgrade it at attestation.

### The guard's first real catch was a bug in its own parser

`assessPlausibility` flagged **metformin at 166×**. Investigating instead of dismissing it exposed a **1000× under-read in the parser itself**: the regex treated a comma as a DECIMAL separator, so **"1,000 mg" parsed as 1 mg** and **"3,000 mg" as 3 mg**. Verified against the corpus — **41 comma-groups, every one a thousands separator; ZERO decimal commas** before a unit (Australian orthography: period decimal, comma thousands). A test asserting `"3,75 mg" → 3.75` had encoded the wrong assumption; it was my invention, not from the data, and it is now corrected with the real metformin string as a regression case. **This is the argument for a guard that WARNS a human rather than quietly binning: a bin would have hidden its own defect.** metformin is now correctly `plausible` (3000 vs 2000 = 1.5×).

Carbamazepine remains flagged at exactly 10× — AU *max* 2 g vs the US *initial* 200 mg. A max-vs-initial comparison, not a real discrepancy: the guard's precision depends on how complete the comparator extraction is, and the cost of the false positive is a human glance, not a blocked dose. Working as designed.

### A silent-miss class found: ingredient-name normalisation

**Only 336 of 471 (71%) APF ingredient names match the datastore exactly.** APF22 uses Australian orthography; the datastore uses the INN. Three are pure variants of drugs in BOTH — **amoxycillin/amoxicillin, cyclosporin/ciclosporin, pericyazine/periciazine** — and would be **silent misses**: a dose authored under "amoxycillin" is invisible to an engine looking up "amoxicillin". **The dose exists, is signed, and is never shown** — the same outcome as no dose, reached more expensively. This is the show-evidence failure mode in its purest form, and it surfaced only because amoxicillin is the drug `contract-pharmacology` uses. C2 mitigates with an EXPLICIT three-entry map whose every application is REPORTED (never a fuzzy matcher — fuzzy-matching drug names is how you dose the wrong drug); the remaining 29% needs a real normaliser on the already-registered-but-unbuilt `rxnorm-nlm`. Opened `pharm-ingredient-name-normalisation`.

### C3 — the mock fallback removed, landing with the first real dose exactly as required

`pharm-data-source.js` no longer falls through to `mock-data.json.dose_guidance_mock`. That fallback was honest while EVERY dose was mock (each self-labelled "(MOCK — not clinically validated)"); the moment C2 authored signed doses it would have silently mixed signed and mock on one path, with a string label as the only thing telling them apart. Absent record → null → no dose.

**It made the test suite stronger rather than weaker.** `contract-pharmacology`'s "safe PASS should carry dose_guidance" previously passed on a MOCK amoxicillin dose; it now passes on **KL's verbatim APF22 text**. paracetamol/ibuprofen return NO dose yet remain KNOWN drugs (`knownDrug()` reaches scheduling/renal/nti/interactions/allergy) — the truth, not a regression. `contract-pharm-validation` 20/20 + adversarial 8/8 green.

**Still gated:** C2d (KL's attestation → `clinical_sign_off`) needs **R-47a** — a worksheet showing the appraisal landscape, or he would be attesting blind. **`dose-guidance-empty-no-au-source` must NOT be resolved while R-47 is open.** Nothing patient-facing: datasets stay `-dev`, receipts stay `mock`.

---

## FL dose-guidance C2c — Tier A US/EU label doses retrieved (2026-07-15)

**Status:** operator-approved. 12 records written to `international_dose_guidance`, all `review_status:"draft"`, **engine-isolated (re-proven: nothing reads the file)**. **No AU dose authored.** `npm test` (64) + verification + trunk:stub:all + licence:check + security:secrets + pharm:seals all EXIT=0.

**Every dose is verbatim from a fetched label section. None was written from memory.** Retrieval ran through three agents under one absolute rule: copy from the `content` of a section you actually fetched, or return null and say why. **Returning nulls was defined as success** — and the discipline held under pressure: the rivaroxaban agent refused to reconstruct a dose it plainly knows, because AMASS mis-parses Xarelto's FDA section 2.1 as "Hazard Ratio" (COMPASS trial data) on *both* authorisations and exposes only paediatric dosing at EMA 4.2. **rivaroxaban is therefore absent from the register rather than fabricated into it.**

**A correction I made twice on the way.** I first concluded AMASS "does not carry label doses" — reading the `therapeuticIndication` summary field (which holds sections 11/1/12.1, not dosing) and hitting a truncated EMA 4.2. Wrong: the doses live in `documentSections` (FDA `path:"2"`, EMA `path:"4.2"`), fetched individually. The pipeline works; the summary field is just not it.

**THE STRUCTURAL FINDING — EMA centralised coverage is sparse for old generics.** Only **3 of 10** Tier A drugs have an EU label at all (methotrexate, apixaban, dabigatran). Carbamazepine, metformin, sulfasalazine, phenytoin and alendronate are **nationally authorised** in EU member states (MHRA/BfArM/ANSM) or exist centrally only as fixed-dose combinations — outside RegulatoryCore's scope by design. Result: **9 US doses, 3 EU doses.** This matters for D-SE-4: Case 4's "corroborated (US **and** EU)" rung will fire for a minority of drugs, and most will show as the "single foreign label = bare labelled fact" rung. **The design already anticipates this and is unchanged** — but the ratio is now measured rather than assumed.

**What the labels we CAN cite actually are — surfaced, not laundered:**
- **metformin**: no ACTIVE FDA monosubstance authorisation exists (Glucophage/Glumetza/Riomet all withdrawn; every active product is a combination). The only citable US label is **WITHDRAWN_VOLUNTARY**. So `authorization_status` is now a REQUIRED, shown field on `InternationalDoseGuidanceSchema` — a dose read as current when its label was withdrawn is precisely the quiet staleness this register exists to make visible.
- **carbamazepine**: the citable US label is **Equetro — bipolar I mania, not epilepsy** (Tegretol's parsed label has no dosage section at all). The AU entry is epilepsy. Different indications.
- **phenytoin**: the US dose is the **125 mg/5 mL oral suspension, expressed in mL** — not the capsule.
- **apixaban EU**: Eliquis's EMA 4.2 holds only paediatric granules, so the citable EU adult text is from **Apixaban Accord**, a generic.

**And the design validated itself.** Comparing AU (KL's APF22) against US shows non-congruence dominated by **indication mismatch**, exactly as predicted: apixaban AU is post-surgical VTE prophylaxis vs US NVAF; carbamazepine AU is epilepsy vs US bipolar. Meanwhile **alendronate is near-identical** (AU "10 mg daily or 70 mg weekly" / US "70 mg once weekly or 10 mg once daily"), and **simvastatin differs by range** (AU 10–40 mg / US 20–40 mg) — non-congruent yet plausible (both max 40 mg). That separation — congruence and plausibility answering different questions — is the whole point of the C0 amendment, and the real data behaves as designed. **The removed veto would have binned most of Tier A.**

---

## FL dose-guidance C1 — plausibility guard + the international route (2026-07-15)

**Status:** operator-approved. `npm test` (62 suites) + `verification` + `trunk:stub:all` + `licence:check` + `security:secrets` + `pharm:seals` all EXIT=0. **No dose authored; both dose registers still empty.** Nothing patient-facing; no network code; no new dependency.

**The plan's C1 spec was architecturally wrong, and Phase 1 caught it.** It called for `scripts/pharm-dose-crosscheck.mjs` — "a script that queries AMASS RegulatoryCore". **A Node script cannot call an MCP connector**, and no script in this repo makes a live PubMed/AMASS call. The 261 dose-evidence records were not produced by one: they came from an **agent retrieval workflow** returned through the **chat↔repo round-trip** (`docs/pharmcheck-export/` out → agent authors a dev-package → `scripts/pharm-ingest.mjs` back in, schema-gated, FORCING draft). C1 now follows that precedent exactly and needs **no network code at all**.

**Built — `domain/dose-plausibility.js`** (closes `dose-plausibility-guard-unbuilt`). This recovers the one real thing the removed divergence gate was incidentally catching — a transcription typo — **without resurrecting the veto**. The distinction it keeps, and whose conflation produced the bad gate: **congruence is a clinical judgement** ("the EU approved a different indication" is legitimate and shippable); **plausibility is arithmetic** (500 vs 5000 mg is a misplaced zero). This module does only the second.
- **Fail-safe by construction.** A weight/BSA basis (mg/kg, mg/m²), non-mass units (IU/mL/%), or anything unreadable → **`unassessable`, never `plausible`** — and the note says *"this is NOT an all-clear"*. A guard that guesses is worse than no guard: it launders a non-check into reassurance.
- **A WARN for a human, never a bin.** A genuine >10x jurisdictional difference is possible (loading vs maintenance dosing), so this must not block — the note says so explicitly.
- Unit alternation is longest-first, so "microgram" cannot partial-match as "g" (a 1,000,000x error). The MAX amount is taken, not the first — a misplaced zero lands on the cap.
- `test/contract-dose-plausibility.js` proves **both** directions: the 5000-vs-500 typo IS caught, and the legitimate `500 mg q8h` (AU) vs `875 mg BD` (US) difference — **which the removed gate would have binned** — passes untouched.

**Routed `international_dose_guidance` through `pharm-ingest`** (added to `CAPABILITY_FILE`) — the same path `dose_evidence` uses. Proven end-to-end with a real AMASS record (EMA Jylamvo, methotrexate): 1 accepted, 0 rejected, dry-run wrote nothing. Ingesting it can never put a foreign dose on the AU dose path because the register is engine-isolated.

**And a defence-in-depth invariant now has a test: `dose_guidance` must NEVER be routable through `pharm-ingest`.** This matters more than it first looks. The AHPRA gate is a **pattern check, not an identity check** — `MED0001857758` is committed throughout this repo, so an agent that could reach the generic round-trip could author a dev-package quoting it and pass the schema. Keeping `dose_guidance` off the ingest route means an AU dose cannot enter that way **at all**: only clinician worksheet entry (Channel B) or a fetched TGA PI (Channel A). The test pins it so nobody "helpfully" adds it later.

**Congruence stays AUTHORED, not computed.** Whether a differing dose is "non-congruent" or merely "a different approved indication" is clinical judgement, not string comparison. The real protection is structural and already in place: `au_congruence.comparators[].dose_statement` is REQUIRED, so the clinician reads the foreign label verbatim beside the AU dose regardless of what the status claims.

**Next:** C2 (Channel B — KL's Tier A adult rows through the worksheet → schema → plausibility → attestation) → C3 (drop the mock fallback with the first real dose) → C4 (TGA PI, operator-gated).

---

## R-46 — the integrity seal now actually seals (2026-07-15)

**Status:** operator-approved three-step fix. `npm test` (61 suites) + `verification` + `trunk:stub:all` + `licence:check` + `security:secrets` all EXIT=0. **All 21 seals verify.** No clinical record was re-reviewed, amended, or re-attested; nothing patient-facing moved.

**Plain language.** Every pharmacology dataset carries a `records_checksum` — the seal that makes "the signed records are the records the clinician signed" *provable*. It turned out **nothing ever checked it**. It was written by three scripts and verified by none, so the suite ran green for months with **7 of 21 seals broken**. A seal nobody checks isn't integrity; it's decoration.

**The cause was benign, and proven so before anything was touched.** The seal is computed at authoring/ingest time, when incoming records are FORCED to `review_status:"draft"`. The clinician sign-off (worksheets, 88 + 308 records) then sets `reviewed_by`/`review_status` **on the records** — and nothing re-sealed. Each of the 7 prior seals was reconstructed **bit-exactly** by reverting only the sign-off, and the clinical content was verified **bit-identical** to the sealed bytes. Not one clinical fact drifted. Nothing was tampered with. The writers were never at fault (`pharm-author.mjs:154` / `pharm-ingest.mjs:201` both seal `merged` and write `merged`) — the sign-off mutates records *outside* them.

**The three-step fix.**
1. **Re-sealed the 7** via the new `scripts/pharm-reseal.mjs`. A re-seal *blesses* whatever the records currently are, so the tool makes that a deliberate act: `--reason` is REQUIRED, `--utc` is required (Date.now() avoided per repo convention), and every re-seal appends prior+new checksum + reason to `attestation.reseal_history[]` — chain of custody in the artifact, not just in git. `--check` audits without writing.
2. **THE DURABLE FIX — `test/contract-pharm-datastore.js` now asserts `checksumRecords(records) === records_checksum` for every sealed dataset.** Proven to have teeth: mutating one record's provenance → **EXIT=1**; restoring → **EXIT=0**. CI can never again go green on a broken seal. *The drift was only ever the symptom; the unverified field was the defect.*
3. **Closed the loop on the sign-off path.** `eval/pharmacology/signoff/worksheet-signoff.md` now documents that applying a sign-off MUTATES records and MUST be followed by a re-seal — and (2) enforces it, so a sign-off that skips it reddens CI immediately rather than decaying quietly. New `npm run pharm:seals` audits every seal.

**Guidance recorded in three places (the test message, the tool header, the worksheet record):** if a seal breaks, **do not re-seal to clear the red.** A stale seal after a legitimate edit and an unreviewed mutation are indistinguishable from the hash alone — which is precisely what the seal exists to make distinguishable. Establish what changed first; `--reason` forces the answer into the artifact.

**Found by:** the FL dose-guidance C0 scoped re-scan. C0's design *asserts* these seals to prove no drift since sign-off — had C2 been built first, its export would have aborted on all 7. Correct behaviour, discovered at the worst possible moment.

---

## FL dose-guidance C0 — schema, source registration, three defect fixes (2026-07-15)

**Status:** operator-approved (`.planning/DOSE-GUIDANCE-PLAN.md`, C0 of C0–C4). **No dose was authored** — `dose-guidance.json` stays `records: []`. Nothing patient-facing; receipts stay `mock`. `npm test` (61 suites) + `npm run verification` (Pass: true) + `npm run trunk:stub:all` all green, EXIT=0.

**Plain language.** `dose-guidance` is the only datastore capability that becomes a *dose*, and it has always been empty. That was never an oversight or a backlog item — it is the collision of two hard rules: the Australian dose authorities are licence-restricted (APF22/AusDI are facts-only, no content licence; AMH isn't a registered source; PBS explicitly doesn't publish dosing), and "no dosages from the LLM" bars the agent from writing one. The empty file was the fail-safe working. This phase does not fill it. It builds the lockable door the doses will one day come through, and proves the lock holds.

**The bar is now mechanical, not conventional.** `DoseGuidanceSchema` (`domain/model.js`) admits exactly two origin channels — `tga_pi` and `clinician_apf_attestation` — and:
- the clinician channel requires an **AHPRA registration id** (`^[A-Z]{3}\d{10}$`) in `origin.entered_by`. No agent string can match that pattern, so **an agent-authored dose is unrepresentable**, not merely forbidden.
- **`diverges` is absent from the `cross_check` status enum.** Every AU dose is cross-checked against the FDA/EMA label via AMASS; a diverging candidate cannot be *expressed* as a dose-guidance record, so it cannot be written — it belongs in the review queue (D-DG-3 hard-block, enforced by parse failure rather than by a policy someone could forget).
- `cross_check` is required, `agrees` must name its comparator, and `not_available` must say why and may not carry an `amass_id` — closing the "claim no comparator to skip the gate" loophole.
- channels cannot be laundered: APF attestation must cite `apf22`; `tga_pi` must cite a PI document id **and** a `retrieved_utc` (PI is versioned; a citation without a retrieval time is not re-verifiable).

`dose_guidance` **joined `CAPABILITY_VALIDATORS`**, from which it was previously absent as a "bespoke path". A validator that *refuses* bad records is a stronger guarantee than no validator.

**Sources registered** (`data/data-sources.json`, registry_version 1.2.0):
- `tga-pi` — `pending`/`content_ingest`. The AU primary dose source, sibling of `tga-pregnancy` and `rasml-tga`. **Not connected**: access is an OPERATOR input — the *same* one FL-05's `pregnancy-risk-bulk-sync-pending` already waits on. One action serves both.
- `amass-regulatory` — `copyleft_reference_only`/`structure_only`. **NOT an Australian source. Verification only. Never an origin.** Probed live 2026-07-15: its agency enum is exactly `[FDA, EMA]` — there is no TGA in it. An FDA package-insert dose is not an AU dose. Its only sanctioned use is the `cross_check` gate. Reached at **authoring time** from `scripts/` tooling (the dose-evidence `get_article_metadata` precedent) — not a runtime dependency, no receipt-mode impact.

**Three defects fixed.**
- **D1** — `dose-evidence.json`'s attestation `scope` read *"skeleton — no records authored yet"* while the file held **261 KL-signed records** (2 + 259 across the two signed worksheets at `eval/pharmacology/signoff/`). Per-record `review_status` was authoritative and correct, so nothing was unsafe and no test was red — but the dataset-level text materially understated the clinician's sign-off, and **it is what misled FL-34 Phase B Finding 3 into asserting "no signed dose knowledge exists"**. Corrected in place, citing the worksheets; `records_checksum` verified unchanged (the checksum covers `records` only).
- **D3** — `apf22.provides[]` had no dose-range entry while its own `notes` explicitly sanction *"dosing-range facts"*. The machine-readable list and the prose disagreed; an APF-sourced dose record would have failed source-capability validation. Added `dose_range_facts`.
- **D2** — opened `dose-guidance-empty-no-au-source` (EMPTY/Medium) and `dose-mock-fallback-mixing` (PARTIAL/Medium — **latent**: `getDoseGuidance()` falls back to 3 self-labelled mock doses, which is safe while *every* dose is mock, but silently mixes signed and mock the moment C2 lands; must be removed in that same increment).

**Register reconciliation.** `dose-evidence-apf-attestation-variant-deferred` → **resolved/SUPERSEDED**. Its deferral condition was *"until a clinician adopts it"* — and that condition was met: KL transcribed all 471 APF22 Section D common-dosage ranges from his own copy and confirmed personal authorship 2026-07-15. The adopted implementation is deliberately different from what that item envisaged: rather than bolting a dose variant onto `dose_evidence` (which is engine-**isolated** by design and must stay a citation register), the APF path became one of two origin channels on the real `dose_guidance` capability, under a stronger bar. `dose_evidence` is unchanged and stays engine-isolated.

**Scope discipline recorded.** KL's 471-row transcription is **not** ingested and is never committed. Individual dose facts aren't copyrightable, but **compilation right protects selection and arrangement even where each element is a bare fact** — extracting ~10 Tier A ingredients as restructured facts is facts-use inside the existing APF22 attestation; ingesting all 471 "exactly as printed" in Section D's own arrangement is not, and rides the **same PSA ruling** `warning-labels-cal-verbatim-pending` already awaits.

**Byte-unchanged (verified vs `e2b940e`, empty diff):** frozen `pharm-intent.schema.json`, `pharm-check.schema.json`, `portal/verification-gate.js`, `engine.js`, and the HIST-2 context path (`verification/context-allowlist.js`, `verification/pipeline-schemas.js`). **No HIST-2 amendment was made or needed** — that policy governs what reaches the *LLM's context packet*; the engine reads a different path.

**Caught by the repo's own gates:** `contract-pharm-datastore` rejected an invented `licence_status: "documented"` on both new sources. Corrected to the existing vocabulary — `pending` for `tga-pi`, `copyleft_reference_only` for `amass-regulatory`.

**D4 — registration category corrected (2026-07-15).** The repo described Kenneth Lee as a **registered pharmacist** while carrying AHPRA **MED0001857758** — and `MED` is AHPRA's *medical-practitioner* prefix (pharmacists carry `PHA`). Surfaced when the operator supplied the number; **corrected on his own statement: he is a registered MEDICAL PRACTITIONER.** The number was always right; the word was always wrong.

The error originated in `.planning/FL-30_PharmCheck_Self-Build_Prompt.md` ("Author/Owner: Ken Lee — Senior Pharmacist (AU)") and propagated into `eval/pharmacology/signoff/worksheet-signoff.md`, this CHANGELOG, and the `status` gate text of **8 datasets** ("registered-pharmacist sign-off" → "registered-practitioner sign-off"). Tracing that origin is what justified rewording the gates: the phrase meant "the owner, believed to be a pharmacist, signs off" — it was never an independent pharmacist-scope control, so correcting it removes no control. **If an independent pharmacist review of the classically pharmacy-scope datasets (administration_handling, counselling_points, warning_labels/CAL) is wanted, that is a NEW control to specify deliberately.**

**No attestation re-opened.** The 88 + 308 worksheets, signed blocks, attesting person, records and dates all stand — the same clinician attested the same records on the same days. `reviewer_id` was already correct (`Kenneth Lee (MED0001857758)`), so no `records_checksum` moved. This matters as *provenance hygiene*: the datastore's entire clinical sign-off rests on this identity, and an artifact reading "registered pharmacist / MED…" is internally inconsistent in exactly the way a TGA audit notices.

**Still open (operator):** `.planning/FL-30_PharmCheck_Self-Build_Prompt.md:4` retains the "Senior Pharmacist (AU)" self-description. It is a historical planning artifact and was NOT edited — rewriting the founding document's stated authority basis is the operator's call, not the agent's.

**Next:** C1 (AMASS cross-checker, un-gated) → C2 (Channel B, Tier A ~10 drugs) → C3 (drop the mock fallback with the first real dose) → C4 (TGA PI, operator-gated). FL-34 Phase B stays parked; its "no dose KM" conclusion is unchanged and now rests on this licence/authoring reason rather than "nothing is signed".

---

## FL-34 Phase 0 — register-maintenance pass (2026-07-14)

**Status:** report-only reconciliation ahead of the FL-34 OpenCDS-gateway build; NO code touched, no test run affected. Ahead of Phase A.

**Plain language.** Four tracker↔register discrepancies had accumulated. This pass makes the register and gap-register consistent with what the code already does — it does not change any behaviour.

**Reconciled.**
- `pregnancy-hepatic-check-unwired` — the CHANGELOG (FL-05) recorded it closed but the completeness-register prose still listed it DEFERRED(open). Now a full `- id:` record marked COMPLETE/resolved in MEDIUM.
- Track A OSS-route artifacts (PR #67) had no register records: added `opencds-cds-adapter-client` + `cds-firewall-fold` (COMPLETE) and the three FL-34 gateway build items (`opencds-gateway-image`, `fl30-kb-km-package`, `opencds-gateway-shim`, UNBUILT/input_gated on the sibling repo `kenleefreo/breath-ezy-cds-gateway`).
- Track B (PR #68) had no record: added `au-provider-bahmni` (PARTIAL/input_gated).
- The three remaining PR #66 DEFERRED ids (`pregnancy-risk-bulk-sync-pending`, `warning-labels-cal-verbatim-pending`, `dose-evidence-apf-attestation-variant-deferred`) now have full `- id:` records.
- gap-register R-22 row + §pharmacology status block reframed from "live vendor pending / do not use" to **FL-30-resolved core + FL-34 patient-facing arm** (commercial vendor OR the AU_OSS_CDS OpenCDS gateway); `SYNTHETIC_SELF_DEVELOPED` noted as engine-only, not a slot unlock.

**Not changed.** No schema, no code, no test; the `cds-adapter` EMPTY→HARD_FAIL floor is unaffected; nothing patient-facing.

---

## FL-05 — wire the reserved pregnancy_check + hepatic_check into the engine (2026-07-14)

**Status:** all pharmacology suites green; full `npm test` green. Frozen `pharm-check`/`pharm-intent`/`schemas.js` byte-unchanged (`git diff` = 0). No new dependency. Datasets stay `-dev`/mock-moded.

**Plain language.** The frozen `pharm-check` already RESERVED `pregnancy_check` and `hepatic_check` (and their flag types), and the `pregnancy-risk` (18, TGA-category) and `hepatic` (13, Child-Pugh/action) datasets were already clinician-signed — but the engine never read them, so those two safety checks silently didn't run. FL-05 wires them (engine logic only, no frozen change). The two registers are no longer "engine-isolated" by design.

**Change.**
- `sources/pharm-data-source.js` — new seam accessors `getPregnancyRisk` / `getHepatic` (base throws; `SyntheticSelfDevelopedSource` reads `data/pregnancy-risk.json` + `data/hepatic.json`; `LicensedFeedSource` fails closed). The two datasets are added to `_store`.
- `engine.js` — `pregnancy_check`: category X/contraindicated → HARD_FAIL (`pregnancy_category_x`); D → WARN (`pregnancy_category_d`); A/B/C → PASS. Fail-safe (D-FL05-1, operator ruling 2026-07-14): a KNOWN teratogen (X/D) with UNKNOWN pregnancy status → NOT_RUN → BLOCKED_NO_PROOF, **AGE-GATED** to patients of childbearing potential (~12-55 or unknown age) so an elderly patient is not over-triaged. `hepatic_check`: `hepatic_contraindicated` → HARD_FAIL; other actions (e.g. `hepatic_caution`) → WARN; rule + unknown impairment → NOT_RUN.
- `test/contract-pharm-pregnancy-hepatic.js` (new, wired into `npm test`).

**Invariant check.** No dose from these checks (they only add HARD_FAIL/WARN; dose still only via `getDoseGuidance`) ✔ · frozen contracts untouched ✔ · fail-safe NOT_RUN on missing facts ✔ · uses already-signed data, stays `-dev`/mock ✔.

### Register / gap
Closes `pregnancy-hepatic-check-unwired` (PR #66 deferral). Still deferred (external deps, out of FL-05 scope): `pregnancy-risk-bulk-sync-pending` (TGA bulk-sync — data access), `warning-labels-cal-verbatim-pending` (PSA_CAL copyright ruling), `dose-evidence-apf-attestation-variant-deferred` (dose invariant — clinician-gated). Nothing patient-facing.

## FL-30 (addendum) — clinician sign-off pass 2: remaining 308 records, datastore fully attested (KL, 2026-07-14)

**Status:** all 8 `contract-pharm-*` suites green; **ZERO per-record drafts remain**. Records + attestation only. CLINICAL sign-off; regulatory NOT given; `-dev`/non-patient-facing.

Kenneth Lee (MED0001857758) attested all 308 remaining draft records (Attest, 0 Amend/Reject) via the follow-on worksheet (retained at `eval/pharmacology/signoff/`): dose_evidence 259, pregnancy_risk 18, hepatic 13, counselling 6, administration_handling 4, tdm_parameters 3, warning_labels 3, review_queue 2. Each affected dataset is now fully clinician-approved, so its dataset-level `clinical_sign_off` flipped to true (regulatory stays false; `-dev` retained; `has_unsigned_additions` cleared). The entire per-record pharmacology datastore is now clinician-signed.

## FL-30 (addendum) — clinician worksheet sign-off: 88 records attested (KL, 2026-07-14)

**Status:** all 8 `contract-pharm-*` suites green. Records-only change (provenance). **CLINICAL sign-off only — regulatory NOT given; datasets stay `-dev`, system stays mock/non-patient-facing.**

**Plain language.** Registered medical practitioner **Kenneth Lee** completed the per-record sign-off worksheet — **all 88 records Attested, 0 Amend, 0 Reject**, signed 2026-07-14. The signed worksheet is retained as the medicolegal artifact at `eval/pharmacology/signoff/PharmCheck-signoff-worksheet-KL-2026-07-14.xlsx` (+ `worksheet-signoff.md`). Applied in the repo: matching records set `reviewed_by:"Kenneth Lee"`, `review_status:"approved"` — **74 newly approved, 11 already-signed re-affirmed, 3 `warning_labels` PSA_CAL written approved with 3 stale RASML archived** to `superseded[]` (the attested RASML→PSA_CAL scheme correction).

**Governance.** The three previously dataset-signed capabilities (interactions/contraindications/serious_adverse_effects) are now fully re-consolidated — 0 draft remaining, `has_unsigned_additions` cleared. The reference datasets (admin_handling, tdm, counselling, warning_labels, dose_evidence) keep `clinical_sign_off:false` at dataset level because each still holds unattested drafts outside this worksheet (P1 seeds, the 259-record dose-evidence register); per-record `review_status` is authoritative.

### Guarded against error
A worksheet inconsistency was caught first (signed block + summary said 88 attested, but the per-row Decision column was empty) — sign-off was **refused** and re-confirmed only after KL re-supplied the worksheet with all 88 per-row `Attest` decisions genuinely populated.

### Register / gap
No new capability. Moves 88 reference/safety records from draft → clinician-approved (`-dev`). Patient-facing still blocked (regulatory sign-off, live vendor, Clinician Verification Portal, persistence). Remaining draft: P1 seeds not in the worksheet, the dose-evidence retrieval register, and the P2 registers (pregnancy_risk/hepatic/queue) — future sign-off passes.

## FL-30 (addendum) — APF22 reorg Priority-2: pregnancy_risk + hepatic + dose-evidence review queue (2026-07-14)

**Status:** all 8 `contract-pharm-*` suites green. Frozen `pharm-intent`/`pharm-check` unedited (`git diff` = 0). No new dependency. Datasets `-dev`/draft; records NO sign-off.

**Plain language.** Scaffolded three **reference-only** capabilities (engine-isolated, not a dose source, not wired to a `check_id`) and seeded them: `pregnancy_risk` (18 TGA-category records, cited `tga-pregnancy`), `hepatic` (13 Child-Pugh caution/contraindication records), `dose_evidence_review_queue` (2 — the §4.3b holding area, seeded with the exact APF dose misses that failed PubMed verification: amoxicillin CAP short-course + colchicine paediatric). Added the heading-overlay memberships (`pregnancy_risk`/`hepatic` → Special populations; `review_queue` → Dosing) and a `tga-pregnancy` data source.

**Frozen-contract note.** `pregnancy_check`/`hepatic_check` are already reserved in the frozen `pharm-check`/`pharm-intent` enums but unimplemented; these datasets are **reference-only** and do NOT wire them — engine-wiring is a separate gate (needs engine logic, no frozen change since the slots exist).

### Change
- **`domain/model.js` [~]** — `PregnancyRiskSchema`, `HepaticSchema`, `DoseEvidenceReviewQueueSchema` (`apf_reference` pinned `"apf22"`, `not_prescribing_guidance` literal `true`) + validators + `CAPABILITY_VALIDATORS`.
- **3 dataset skeletons + seeds [+]**; `capability-groups.json` [~] (memberships); `pharm-author.mjs`/`pharm-ingest.mjs` [~] (`CAPABILITY_FILE`/`NATURAL_KEYS`); `contract-pharm-datastore.js` [~]; `data-sources.json` [~] (`tga-pregnancy`).

### Invariant check
No dose from the LLM (review-queue holds APF dose text but engine-isolated + `not_prescribing_guidance:true`; pregnancy/hepatic carry no dose); frozen contracts untouched; engine untouched (no accessor reads the 3 registers); per-record provenance enforced; nothing patient-facing. ✔

### Register / gap
`pregnancy_risk`, `hepatic`, `dose_evidence_review_queue` UNBUILT→**COMPLETE** (reference-only, `-dev`). `review_queue` closes the §4.3b "misses have nowhere to go" gap. **Deferred:** the direct-APF `dose_evidence` citation variant (touches the dose invariant — separate clinician-gated gate); engine-wiring of `pregnancy_check`/`hepatic_check`; `pregnancy_risk` bulk-sync from TGA (seed is a curated safety-critical subset).

## FL-30 (addendum) — APF22 reorg Priority-1: heading overlay + 4 reference capabilities (2026-07-14)

**Status:** all 8 `contract-pharm-*` suites green (incl. new `contract-pharm-capability-groups`). Frozen `pharm-intent`/`pharm-check` unedited; `nti_check` unchanged. No new dependency. Datasets `-dev`/unsigned; every record `review_status:draft`. Records NO clinical sign-off.

**Plain language.** Mapped PharmCheck onto the APF22 (© PSA) clinical-monograph taxonomy and built Priority-1 of the reorganisation. A **non-destructive heading overlay** (`capability-groups.json`) groups the flat capabilities under APF headings (Counselling, Dispensing considerations, TDM, …) as metadata — **no dataset migrated or merged** ("the capabilities must not be crushed"). Four new **reference-only** capabilities added (same class as `dose_evidence` — provenanced, engine-isolated, not a dose source, not wired to a `check_id`): `administration_handling` ("should not be crushed"), `tdm_parameters` (therapeutic drug monitoring; **NTI becomes the narrow-index bucket** under the TDM heading, frozen `nti_check` untouched), `warning_labels`, `counselling_points`.

**Copyright.** APF22 registered (`data-sources.json`) as an authoritative reference for **facts + citation only** (`copyleft_reference_only`/`structure_only`, clinician-attested KL 2026-07-14, no content licence held); RASML/TGA added as the **primary** source for `warning_labels`. No APF prose/tables reproduced.

### Change
- **`mcp/servers/pharmacology/domain/model.js` [~]** — `AdministrationHandlingSchema`, `TdmParametersSchema`, `WarningLabelSchema`, `CounsellingPointSchema` + validators + `CAPABILITY_VALIDATORS` registration; `CapabilityGroups*Schema` + `validateCapabilityGroups`.
- **`mcp/servers/pharmacology/data/capability-groups.json` [+]** — the heading overlay (9 groups, 19 capabilities classified, TDM group = [nti, tdm_parameters]).
- **4 dataset skeletons + seeds [+]** — `administration-handling` (6), `tdm-parameters` (6), `warning-labels` (4, RASML), `counselling-points` (6). APF22-cited facts / RASML primary; all draft.
- **`scripts/pharm-author.mjs` [~]** (`CAPABILITY_FILE`), **`scripts/pharm-ingest.mjs` [~]** (`NATURAL_KEYS`), **`test/contract-pharm-datastore.js` [~]** (4 datasets), **`test/contract-pharm-capability-groups.js` [+]**, **`package.json` [~]** (test wired), **`data-sources.json` [~]** (apf22, rasml-tga).

### Invariant check
No dose from the LLM (TDM ranges are lab CONCENTRATION targets, not doses; nothing here emits a dose); frozen contracts + `nti_check` + HARD_FAIL logic unchanged; per-record provenance enforced; reference-only/engine-isolated; APF facts+cite only (no prose/tables); nothing patient-facing (`-dev`/draft, needs KL sign-off). ✔

### Register / gap
Opens→closes: `administration_handling`, `tdm_parameters`, `warning_labels`, `counselling_points` UNBUILT→**COMPLETE** (reference-only, `-dev`); `capability-groups` overlay new→**COMPLETE**. No `BLIND_STUB`/`DEAD_END` (each new capability has a producer=authoring pipeline + consumer=heading overlay). No gap-register movement. Priority-2/3 (hepatic, elderly, pregnancy, breastfeeding, dispensing_considerations, discolouration) remain proposed (`docs/pharmcheck-export/STRUCTURAL-PROPOSALS.md`).

## FL-30 (addendum) — dose-evidence citation register: retrieval-grounded, engine-isolated (2026-07-14)

**Status:** `contract-pharm-datastore` + `contract-pharm-author` green; datasets stay `-dev`/unsigned. Frozen contracts unedited. No new dependency (retrieval via existing PubMed MCP). Records NO sign-off — every record enters `review_status:draft`, `reviewed_by:null`; each carries a "requires clinician verification" posture.

**Plain language.** Added a `dose_evidence` capability — a **citation reference register** of dosing FINDINGS reported in the primary research literature (real PubMed PMID/DOI), NOT prescribing guidance and NOT a dose source. It is **structurally isolated from the PharmCheck engine**: no `PharmDataSource` exposes a `getDoseEvidence()` accessor and the engine never reads `dose-evidence.json`, so the no-dosages-from-the-LLM invariant is untouched — the engine's only dose source remains the firewall/vendor PharmCheck path. This was the compliant resolution of the earlier `dose_guidance` conflict (doses cannot be LLM-authored): formulations (PBS public form/strength) + this cited literature register carry dose-*adjacent* reference data, while `dose_guidance` stays held for AMH/vendor.

**Integrity.** Records were produced by a multi-agent retrieve→adversarial-verify workflow over 130 NTI + renal-adjustment candidate drugs: retrieve agents extracted dose findings with the exact identifier from PubMed tool results (never memory); verify agents (high-effort) called `get_article_metadata` on each identifier and confirmed it BOTH resolves AND that the abstract genuinely supports the statement — dropping anything unverifiable or misattributed. A hallucinated PMID was treated as worse than an empty register. Spot-checked ~7 identifiers independently against PubMed; all real and faithful.

### Change
- **`mcp/servers/pharmacology/domain/model.js` [~]** — new `DoseEvidenceSchema` + `validateDoseEvidence`; registered in `CAPABILITY_VALIDATORS`. Two mechanical bars: a `.refine` forcing `provenance.source_ref === citation.identifier` (record anchored to its real source), and `not_prescribing_guidance: z.literal(true)` (cannot be bypassed).
- **`scripts/pharm-author.mjs` [~]** — `buildRecord` now lets a record carry its own provenance fields (needed for the per-record `source_ref`↔citation binding) while STILL force-overriding `reviewed_by:null` + `review_status:draft` last (Guardrail 2 intact; a self-attesting record is still forced to draft). Backward-compatible — existing callers pass no per-record provenance. `dose_evidence` added to `CAPABILITY_FILE`.
- **`mcp/servers/pharmacology/data/dose-evidence.json` [+]** — 259 verified records across 129 drugs; `-dev`/unsigned; labelled non-prescribing + engine-isolated; integrity bar documented.
- **`test/contract-pharm-datastore.js` [~]** — `dose-evidence.json` registered (per-record provenance enforced).

### Invariant check
No-dosages-from-the-LLM **untouched** (engine cannot read this register — structural isolation, not just a label); no fabricated citations (every record verified to resolve; `.refine` anchors provenance to the real id); fail-closed authoring (259 accepted / 0 rejected, all forced to draft, no self-attestation); nothing patient-facing (datasets `-dev`, unsigned, each needs clinician verification against source + AMH/TGA). ✔

### Register / gap
`dose_evidence` capability: absent → **COMPLETE** (built, schema-gated, authored, contract-tested; DEV/unsigned). No gap-register movement — this is dose-*adjacent* reference data; the `dose_guidance` held gap and the pharmacology-vendor/patient-facing blockers are unchanged.

## FL-30 — PharmCheck self-build: contract-lock → validated in staging (2026-07-13)

**Status:** `npm test` green (10 new pharm contract suites); `verification` Pass:true; `licence:check` PASS. Frozen `pharm-check`/`pharm-intent` contracts unedited. No new dependency. Records a **clinician sign-off** (reviewer KL, in-session) on the seed datastore + the Step 5 staging validation.

**Plain language.** Built Breath-Ezy's own synthetic pharmacology reference + decision core behind the frozen PharmCheck contract, replacing the direct mock-data read. Steps: (2) contract-lock — fixed a latent engine/schema drift, added the internal domain model + `PharmDataSource` seam + a `SYNTHETIC_SELF_DEVELOPED` flag state; (3) built a curated, provenanced, fail-closed authoring pipeline and seeded a **clinician-signed** datastore (NTI incl. warfarin+DOACs, renal eGFR rules, interactions, allergy groups, AU/SUSMP scheduling) + a cached PBS Public API v3 sync (live pull input-gated on the deploy secrets manager); (4) wired the engine through the seam so the signed datastore now DRIVES PharmCheck, and added the `nti_check` + unknown-drug escalation; (5) staging validation — 20/20 cases pass, 8/8 adversarial fail-safe, A/B parity + gate integrity ✓, **signed by KL** (`eval/pharmacology/validation-signoff.md`).

**Register move.** `pharmacology-server-unbuilt` PARTIAL/Critical → **resolved** (self-build validated). Copyright boundary held (STOPP/START, TDM, DrugBank, AusDI = structure + facts + citation only). **Nothing became patient-facing** — datasets stay `-dev`, receipts stay `mode=mock`; patient-facing still needs regulatory (TGA) sign-off, a live CDS vendor (B4), the live PBS pull, AusDI 3b, and the Clinician Verification Portal.

## FL-20 + FL-23 — Clinical sign-off on the knowledge datasets + lab reference ranges (2026-07-13)

**Status:** `npm test` green (incl. `contract-knowledge` + `contract-investigation-parser` unchanged); `verification` Pass:true; all gates green. RETAIN core untouched; no code changed; no new dependency. Records a **clinician attestation** (reviewer KL, in-session) — data only.

**Plain language.** The four curated clinical datasets that had been marked "development/synthetic — not clinically signed off" (three knowledge datasets used by the triage trunks, plus the lab reference-range table used by the investigation parser) have now been reviewed and attested by the clinician as clinically correct for the content they contain. This is *clinical* sign-off — the datasets still need regulatory (TGA) sign-off and, for live use, a real data source, so **nothing became patient-facing**.

**Content assessed before attesting** (not hollow placeholders): SNOMED-coded benign-condition criteria (benign registry); must-not-miss differentials with proper discriminators — cauda equina, SAH, giant cell arteritis, etc. (Axis B templates); tier-appropriate red-flag questions T0–T5 (red-flag bank); and 8 standard adult sex-agnostic reference ranges with critical thresholds (troponin/creatinine/K/Na/Hb/WCC/CRP/glucose).

### Change
- **`mcp/servers/knowledge/data/{benign-registry,axis-b-templates,redflags-bank}.json` [~]** (FL-20) and **`verification/data/lab-reference-ranges.json` [~]** (FL-23) — each gains a top-level `attestation` block (`method: clinician_attestation_in_session`, `clinical_sign_off: true`, `regulatory_sign_off: false`, reviewer KL, statement + scope) and an updated `status` field (clinician-attested clinical sign-off; regulatory + coverage + live source still required). **No version bump** — the datasets stay `-dev`-tagged because full sign-off (incl. regulatory) is not yet obtained, and promoting them would over-claim.
- **Checksums UNCHANGED** — knowledge checksums are computed over `records`, the lab checksum over `analytes`; the `attestation` block is top-level metadata, so the receipt checksums (and the two contract tests) are unaffected. No consumer version-string drift (no bump, so `pipeline.js:53`'s mock receipt still matches).

### Invariant check
Clinical content clinically validated (2026-07-13); **regulatory validation NOT claimed** (the clinician provides clinical sign-off only; TGA rides FL-50/L13); datasets remain NON-patient-facing (blocked on regulatory + coverage + live source, not clinical validity); no attestation fabricated — recorded on the clinician's explicit in-session statement, same footing as the case-set + MIRAGE attestations; RETAIN core byte-unchanged; no code touched. ✔

### Register / gap
`knowledge-datasets-provisional` (FL-20) and `lab-reference-ranges-provisional` (FL-23, R-21) both NARROW: **clinical sign-off DONE**; REMAINING = regulatory (TGA) sign-off (FL-50) + coverage expansion + live source (knowledge store / FL-32 live lab). Both stay PARTIAL/open (regulatory + coverage + live are not clinician acts). FINISH-LINE FL-20/FL-23 → checked by the finish-line agent.

## MKT-P3 — Marketplace integration Phase 3: govern & confirm (consent-scope enforcement + governance-vendor omission) (2026-07-13)

**Status:** `npm test` green (exit 0; 1 new contract suite); `eval:cases` PASS. `consent.js`, the ToolUniverse gateway, `audit-store.js`, and all seams byte-unchanged; no new dependency. Executes Phase 3 (the final ring) of `.planning/marketplace_integration_execution_plan.md`. **Nothing patient-facing.** Completes the increment: receipts (MKT-P1) + gates (MKT-P2) + governance confirmation (MKT-P3).

**Plain language.** Consent is now enforced by SCOPE at the one gateway (a call outside a granted scope is refused and logged before any data moves), and the decision to add NO third-party governance vendor is recorded — the repo's own gateway already governs the boundary.

### Change (by Build-Elements Register element_id)
- **MI-21** `verification/consent-scope.js` [NEW, PRESERVE + thin wire] — consent enforced AT THE GATEWAY, not per-connector: a boundary-crossing call whose scope isn't covered by an active consent is REFUSED (throws `CONSENT_SCOPE_REFUSED`) and LOGGED before any tap fires (E5). Maps `CONSENT_TYPES[].scope` to a gateway check; reuses `getActiveConsent`; fail-closed on unknown scope / malformed ref / no covering consent; revocation removes scope; audit sink injectable. `consent.js` untouched. `test:consent-scope`.
- **MI-22** governance-vendor omission [OVERRIDE → OMIT, documented] — Composio + Ataccama/Atlan/Alation are DELIBERATELY NOT WIRED. The governed gateway already exists: ToolUniverse DEFAULT-DENY (H5) + the fail-closed release seam (H7) + `audit-store.js` (append-only, hash-chained) + consent-scope enforcement (MI-21). Adding a third-party catalog/gateway would build a labyrinth against a solved problem. No code, no dependency; recorded here and in the completeness register.

### Invariant check
Consent enforced at the gateway, fail-closed, out-of-scope refused + logged (E5) · no new governance vendor / no new egress surface · gateway/audit/release seams byte-unchanged · the §1.4 out-of-scope drops (US Census/CMS MCPs, data-eng accelerators, BioPortal-as-primary, Shaip US corpora) confirmed dropped. ✔

### Register / gap
**Phase-3 exit gate met:** consent + audit + jurisdiction enforced at the one in-place gateway; synthetic corpus grows behind the CI gate (MI-18/19); no new governance vendor added; §1.4 drops confirmed. The increment is complete and opens NO patient path — the patient-eligibility blockers (B1 portal, B4 pharmacology vendor, B5 lab reference-range sign-off, persistence enforcement) and deploy-gated connections (OCR/de-id engines, MedGemma/Jamba endpoints, terminology live B6) remain operator/vendor actions, exactly as the plan states.

## MKT-P2 — Marketplace integration Phase 2: gate the boundary (models arbiter + OCR ingestion + imaging-dark + pharmacology CDS slot) (2026-07-13)

**Status:** `npm test` green (exit 0; 8 new contract suites); `eval:cases` PASS. RETAIN core, `audit-store.js`, `verification-gate.js`, `portal/harvested-release.js`, the verifier, and `pharmacology/engine.js` (the firewall) byte-unchanged; no new dependency. Executes Phase 2 of `.planning/marketplace_integration_execution_plan.md` — the "on the boundary / gates" ring. **Nothing patient-facing:** all new modules are libraries; no patient path opened. Phase 1 (MKT-P1) is the prerequisite and is landed on main (#60).

**Plain language.** Model output is now gated by the Evidence Broker (no receipt → `unknown`), records ingest through a fail-closed de-id edge to AU Core FHIR, imaging pixel interpretation is built but dark, and the pharmacology CDS slot is explicit-and-empty (HARD_FAIL until a vendor is contracted).

### Change (by Build-Elements Register element_id)
- **MI-17** `config/flags.js` [NEW] — single fail-safe feature-flag registry (IMAGING=OFF, OCR_ENGINE=paddle, PHARM_CDS=EMPTY, STRUCTURED_OCR=OFF); a mis-set flag resolves to the safe value (E8). `test:flags`.
- **MI-15** `models/jamba/assembler.js` [NEW] — bounds the grounded packet + history to a token budget; never invents/drops-constraints/drops-a-kept-fact's-receipt; logged drops; re-validates through the packet-only bar + firewall. `test:jamba`.
- **MI-14 / MI-04** `integration/evidence-arbiter.js` [NEW] + `verification/pipeline.js` [additive, monotone-AND] — the Broker arbitrates model claims; a receipt-less claim is stripped to `unknown` and can only ADD a verification failure. No-op when unused (H6). `test:evidence-arbiter`.
- **MI-16** `models/imaging/multimodal.js` [NEW, dark] — pixel branch present, flag OFF; every path (OFF/mis-set/ON-no-endpoint/lit) resolves to `unknown` — even a lit candidate is stripped by the arbiter (no literature receipt). `test:imaging-dark`.
- **MI-12** `ingestion/deid/presidio.js` [NEW, fail-closed] — PHI de-id ON by default; no engine → ingestion BLOCKED, raw text never returned (E4). `test:deid`.
- **MI-13** `ingestion/structuring/json-to-fhir.js` [NEW/INTEGRATE] — StructuredDoc → AU Core FHIR; coded only on a validate-pass, uncoded → free-text quarantine; non-conformant blocked from the store. `test:json-to-fhir`.
- **MI-10 / MI-11** `ingestion/pipeline.js` + `ingestion/ocr/{paddle,jsl,structured}-adapter.js` + `index.js` [NEW] — 5-stage ordered pipeline (de-id non-skippable, fail-closed E4); OSS PaddleOCR default, JSL/Surya licence-gated, flag switches engine without rebuild, no silent fallback. `test:ingestion`.
- **MI-08 / MI-09** `pharmacology/amt-underlay.js` + `pharmacology/cds-adapter/index.js` [PRESERVE+REFINE / NEW empty] — AMT coding validated via Terminology (coded only on validate-pass); the CDS slot is explicit-and-empty → HARD_FAIL (B4), never dosing/interaction/contraindication content, folds monotonically so it blocks even a PASS engine (E7). `test:pharmacology-cds`.

### Invariant check
No model output reaches output without Broker arbitration (receipt-or-`unknown`) · de-id fail-closed, non-skippable (E4) · no fabricated codes (coding-gate through ingestion + FHIR) · imaging pixel path dark, fails to `unknown` (E8) · pharmacology CDS explicit-and-empty, HARD_FAIL blocks unconditionally (E7); firewall engine byte-unchanged · no dosing/interaction/contraindication content emitted · hashing/audit/release seams untouched. ✔

### Register / gap
Phase-2 exit gate met (models behind the Broker; OCR ingestion end-to-end; imaging dark; CDS explicit-and-empty; E7 holds under test). No blocker closed — deploy-gated connections remain: OCR/de-id engines (external), MedGemma/Jamba serving endpoints, pharmacology CDS vendor (B4), terminology live (B6). Phase 3 (governance confirm) not started per the plan's gate.

## MKT-P1 — Marketplace integration Phase 1: the receipts ring (Evidence Broker + Ontoserver terminology + MOSTLY AI harness) (2026-07-13)

**Status:** `npm test` green (exit 0; 8 new contract suites); `eval:cases` PASS. RETAIN core, `audit-store.js`, `verification-gate.js`, `portal/harvested-release.js` byte-unchanged; no new dependency (Node 20 built-ins + existing zod/ajv). Executes Phase 1 (only) of `.planning/marketplace_integration_execution_plan.md` — the "inside the boundary / receipts" ring. **Nothing patient-facing:** every new module is a library the pipeline wires in Phase 2 (MI-14); no patient path opened.

**Plain language.** The grounding promise — every clinical claim carries a resolvable receipt or returns `unknown` — is now enforceable in code. The Evidence Broker resolves a claim against ranked evidence sources and returns a schema-valid receipt or `unknown`; preprints, US-regulatory context (openFDA), and any receipt-less claim are barred from a patient in code, not just docs. The terminology layer gains an AU-capable Ontoserver client (SNOMED CT-AU + AMT) so a code writes only after a `$validate-code` pass and an unresolved term is quarantined as free-text. The MOSTLY AI harness lets the eval corpus grow, with every synthetic case inert until a clinician attests it.

### Change (by Build-Elements Register element_id)
- **MI-23** `mcp/servers/knowledge/cache/index.js` [NEW] — `ResponseCache` (freshness-labelling only), `RateGovernor` (min-interval spacer), `withRetry` (429/5xx backoff; non-status errors non-retryable). Backs the E1 fail-safe. `test:knowledge-cache`.
- **MI-02** `mcp/schemas/receipt.schema.json` + `verification/pipeline-schemas.js` mirror [REFINE, additive-monotone] — optional `jurisdiction_tag`/`confidence`/`source_rank`; `required[]` and `additionalProperties:false` untouched; exported `JURISDICTION_TAGS`/`CONFIDENCE_BANDS`. `test:receipt`.
- **MI-03** `mcp/servers/knowledge/source-ranker.js` [NEW] — §5 ranking as executable policy; E9 (preprints) + E10 (openFDA) barred in code; unknown source fails safe. `test:source-ranker`.
- **MI-20** `config/jurisdiction.js` [NEW] — E6 STOP: `US_context` barred from the AU patient path → `unknown`; US source never `AU_endorsed`. `test:jurisdiction`.
- **MI-01** `mcp/servers/knowledge/{broker,receipt-normaliser}.js` + `taps/index.js` [NEW / INTEGRATE] — composes MI-23/03/20; returns a `ReceiptSchema`-valid receipt or `{result:"unknown"}`; taps mock-backed now, live seams (evidence-* servers) deferred. `test:evidence-broker`.
- **MI-05** `mcp/servers/terminology/{ontoserver-client.js,value-sets.json}` [REFINE, PARTIAL] — AU-capable `$validate-code` + `$lookup` (SNOMED CT-AU + AMT, injected transport); AMT live path wired in `index.js` (previously nulled); `live-adapter.js` untouched. Live resolution deploy-gated (B6). `test:terminology-ontoserver`.
- **MI-06 / MI-07** `mcp/servers/terminology/coding-gate.js` [PRESERVE, confirmed] — single `codeOrQuarantine` gate: code writes only on validate-pass, unresolved → free-text quarantine; proven end-to-end through the existing verifier. `test:terminology-quarantine`.
- **MI-18 / MI-19** `eval/synthetic/mostly-ai/run-mostly-ai.js` [INTEGRATE / PRESERVE] — input-gated fail-safe generator behind the case-factory; every case `synthetic:true` + `clinician_reviewed:false` (inert until attested); the eval:cases gate (`:139`/`:159`) is the enforcer. `test:mostly-ai`.

### Invariant check
Grounding invariant enforced in code (receipt-or-`unknown`) · E1/E2/E6/E9/E10 all fail closed · no code without a `$validate-code` pass (coding-gate) · no US-regulatory source as an AU patient receipt · hashing / audit / release seams untouched · mock-never-as-live preserved (mock receipts carry `mode:"mock"`; live terminology fail-safe) · no synthetic case gates a release before clinician attestation. ✔

### Register / gap
`terminology-contract-incomplete` NARROWS (AU AMT/SNOMED CT-AU client built to PARTIAL; live NCTS/self-host resolution + AMT ValueSet binding remain, B6). Evidence Broker is a new capability over the `knowledge` server (mock-backed; live taps deferred). No blocker closed — Phase 1 delivers receipts/gates, not a patient path (B1–B7 stand). Phases 2–3 (models/ingestion gates; governance confirm) not started per the plan's gating.

## FL-21 — MIRAGE corpus clinician attestation: v0.2.0 draft → v0.2.1 attested (the bench now GATES) (2026-07-13)

**Status:** `npm test` green; **`bench:mirage` OK — now GATING** (all three evidence paths `benchmark_passed=true`); `verification` Pass:true; `eval:cases` PASS; `licence:check` + `security:secrets` PASS. RETAIN core untouched; no new dependency. This records a **clinician attestation** (reviewer KL, in-session) — data + one blocking-gate test flip; no product code changed.

**Plain language.** The 98-item MIRAGE benchmark corpus was a draft that *measured* the three evidence-retrieval paths but *gated* nothing. The clinician has now reviewed and attested all 98 items, so the benchmark becomes a real safety gate: every evidence path must pass it over the attested items, and CI reddens if any path regresses (drops below the grounding threshold, fabricates on a negative item, or leaks a dose on an adversarial item). This is one of the four preconditions for a path to ever become patient-eligible — but **not** patient-eligibility itself: a patient release still needs clinician sign-off through the portal gate (H7) and the other release blockers. Nothing became patient-facing.

### Change
- **`benchmark/mirage/corpora/*.corpus.json` [~]** — every item stamped `attested_by: "KL"`, `corpus_version` 0.2.0 → **0.2.1**. **Item content is unchanged** (questions, answers, keys, partitions identical) — only the attestation metadata + version, so the checksum differs accordingly.
- **`benchmark/mirage/corpora/manifest.json` [~]** — `corpus_version` → 0.2.1; recomputed SHA-256; `per_path`/`totals` all-attested (98/98) with `benchmark_passed:true`; `attestation.status` → ATTESTED with a faithful `records[]` entry (method `clinician_attestation_in_session`, reviewer KL, statement covering P/N/A/L clinical validity, `recorded_by` the agent on the clinician's explicit in-session attestation, scope = all 98 items, corpus checksum).
- **`test/bench-mirage-gate.js` [~ the flip]** — the BLOCKING gate flipped from asserting-**draft** (`totalAttested === 0`; each path `attested === 0 && passed === false`) to asserting-**gating** (`98/98 attested, 0 unattested`; each path `attested > 0 && passed === true`). The gate now enforces that every attested evidence path passes and **reddens on any regression** below threshold or a hard-gate breach. Header comment updated.
- **`benchmark/mirage/scores/latest.json` [~]** — regenerated: `corpus_version 0.2.1`, `corpus_pass: true`, all paths `benchmark_passed:true / patient_eligible:false`.

### Invariant check
`patient_eligible` STILL false on every path (MIRAGE-pass necessary, not sufficient — H7 governance per-release + release blockers remain) · attested-A dose-elicitation items all hold the no-dose invariant (verified by the gate) · firewall clean / question-only / no dose as answer key (unchanged) · no attestation fabricated — recorded on the clinician's explicit in-session statement, faithfully, same footing as the 301-case bulk attestations · RETAIN core byte-unchanged. ✔

### Register / gap
`mirage-benchmark-gate` (R-29) updated (corpus attested & gating); the three evidence-server items (`evidence-fda-pubmed-server`, `evidence-drug-guideline-server`, `docs-override-live`) noted `benchmark_passed=true / patient_eligible:false`. **Two of the four-part patient-eligibility precondition arms now met** (MIRAGE-passed-on-attested-corpus + corpus-attested); the other two (H7 governance per-release ✅ built + real portal WORM gate records, FL-11) and the four release blockers remain. FINISH-LINE FL-21 → checked by the finish-line agent. Plan: `.planning/CORPUS-PLAN.md` (authoring, FL-02) + this attestation.

## FL-42 — Clinician identity federation: verified attestation + signature binding (portal remainder) (2026-07-13)

**Status:** `npm test` **53/53** green (+`contract-portal-identity`); `verification` Pass:true; `trunk:stub:all` 9/9; `licence:check` + `security:secrets` PASS; **RETAIN core byte-unchanged** (`verification-gate.js`/`verifier.js`/`audit-store.js` — `git diff --stat` empty, CI pin holds); no new dependency. Plan: `.planning/IDENTITY-FEDERATION-PLAN.md`.

**Plain language.** Until now the review portal trusted a single shared password, and the clinician's name + signature on a sign-off were free-text boxes anyone with the password could type. Now the attesting clinician is a *verified* identity from a trusted provider, and the signature is computed from who they are and exactly what they signed — so a sign-off can't be recorded under someone else's name or moved to different output. This is the ENG half of the Clinician Verification Portal release blocker; the live identity provider (the operator's OIDC/SAML/AHPRA choice) is the remaining input-gated step.

### Change
- **`portal/identity-federation.js` [NEW]** — the fail-closed federation seam. `registerIdentityProvider(name, adapter)` (pluggable, mirrors the substrate/secrets seams); a built-in **`dev`** provider yields a synthetic identity from an explicit dev header and is **never** accepted on a live path. `resolveClinicianIdentity(req, mode)` REFUSES (fail-closed) a dev or unregistered provider in an enforce-live context — a dev identity can never stand in for a verified clinician (same discipline as the WORM substrate refusing a non-local unregistered backend). `bindSignature(identity, hash)` derives `sig:federated:<idp>:<ahpra>:<proof>` bound to WHO signed and WHAT exact bytes, replacing free-text. The verified identity never enters the LLM packet — it rides the medicolegal trail only.
- **`portal/gate-record-store.js` [~]** — the durable `GateEntrySchema` gains an optional `identity` block (strict) on the ENTRY envelope — NOT the frozen `GateRecordSchema` (same layering as `bundle_sha256`), hash-chained + tamper-evident. `recordDecisionDurable(record, { bundle_sha256, identity })` adds a **fail-closed binding**: when an identity is supplied, `record.clinician_id` MUST equal `identity.subject` or the append is REFUSED. Backward-compatible (identity optional; legacy/mock callers unchanged).
- **`portal/server.js` [~]** — `/decision` resolves the reviewer's verified identity and DERIVES `clinician_id` + `signature_ref` from it (403 on an unverified reviewer or a body-supplied `clinician_id` that disagrees); passes the identity block to the durable store. The review form drops the free-text clinician_id/signature inputs (identity shown read-only; signature auto-bound; submit disabled until verified).
- **`test/contract-portal-identity.js` [NEW]** + **`contract-portal-review.js` [~]** — dev resolves in dev / refuses in live; a registered live provider verifies; signature bound to who+what; clinician_id≠verified-subject REFUSED; tampering the identity block breaks the chain; legacy no-identity path still works; the HTTP `/decision` now requires a verified identity (403 without) and records a bound signature.

### Invariant check
Human-in-the-loop STRENGTHENED (attesting clinician verified, not self-asserted) · frozen gate + its schema byte-unchanged (identity rides the entry envelope) · medicolegal trail more tamper-evident (identity hash-chained) · fail-closed everywhere (no verified identity in enforce-live → no decision) · verified identity never enters the LLM packet · no patient path opened. ✔

### Register / gap
`clinician-verification-portal-unbuilt` NARROWS (stays **Critical/PARTIAL/pf:true**): identity-federation seam + signature binding built (mock-gated). REMAINING: WORM registration (R-39/FL-11, operator) + the **live IdP connect** (operator [DECIDE] protocol/vendor + credentials — input-gated) + the patient path (none exists). FINISH-LINE FL-42 → checked by the finish-line agent.

## FL-03 — Low-risk hygiene batch: reference-case manifest retrofit + repo-digest firewall fixture (2026-07-13)

**Status:** `npm test` green; `verification` Pass:true; **`eval:cases` PASS with named exemptions: 0**; `bench:mirage` OK; `licence:check` + `security:secrets` PASS. RETAIN core untouched; no new dependency. Two Low-risk register items resolved.

**Plain language.** Two bits of housekeeping: the one hand-built reference case that predated the manifest system now has a manifest (so the code no longer needs a special exception for it), and the engineering "repo digest" — which deliberately contains sealed answer-key content — is now guarded by a test proving it can never slip into an AI-Doctor context path. Neither changes the release evidence base: the reference case is recorded as *not* attested (fail-safe), so the attested case count stays 301.

### Change
- **`scripts/retrofit-reference-manifest.mjs` [NEW]** + **`data/cases/SPEC-CARD-04-00001/case_manifest.json` [NEW]** — a one-shot, firewall-safe retrofit: SHA-256 of the exact on-disk bytes of all 7 nodes (sealed 10_–13_ streamed through the hash only — never parsed, printed, or routed), `firewall_assertion`, `files[]`, an **empty** `codes_manifest` (the reference case is excluded from the code-verification + attested sets — flagged), and a **FAIL-SAFE** review block: `clinician_reviewed: false`. The envelope's `provenance.clinician_reviewed:true` (KL, 2026-06-23) is recorded as a *note*, not treated as a manifest attestation — so the release-gate attested count is **unchanged at 301**. (An operator can admit it to the trusted set 301 → 302 by flipping the flag with an attestation statement.)
- **`scripts/eval-case-gate.mjs` [~]** — removed the `LEGACY_EXEMPT` set + the named-exemption branch; a missing `case_manifest.json` is now a hard failure (every case dir carries one). `eval:cases` → **named exemptions: 0** (301 attested, 2 unreviewed incl. the ref case, PASS); `verify-case-codes` legacy-skipped: 0.
- **`test/contract-context-allowlist.js` [~]** — a digest-shaped default-deny fixture block (synthetic content only; no `data/cases` read) proving the M3 allow-list rejects every realistic digest-injection shape with **zero sealed leakage** into `injectable_fields`: (a) a sealed node as a top-level key hard-stops (firewall throw); (b) a case-id-keyed digest node + the digest wrapper are rejected wholesale by default-deny; (c) digest text under an unknown field of an allow-listed node is rejected by name.

### Invariant check
Scoring-store firewall preserved and strengthened (retrofit byte-hashes sealed nodes only; new fixture guards the digest carve-out); no attestation fabricated (fail-safe reviewed:false; envelope record noted, not claimed); release-gate attested count unchanged (301); RETAIN core byte-unchanged. ✔

### Register / gap
`reference-case-manifest-missing` → **COMPLETE/resolved**; `repo-digest-sealed-node-carveout` → **COMPLETE/resolved**. Deferred (explicitly optional, not in the FL-03 done-when): the F1 verifier fuzz suite. FINISH-LINE FL-03 → checked by the finish-line agent.

## FL-02 — MIRAGE corpus expanded v0.1.0 → v0.2.0 (mock-bounded; LIVE_PLAN L9 authoring half) (2026-07-13)

**Status:** `npm test` green; **`bench:mirage` OK**; `verification` Pass:true; `licence:check` PASS. Corpus-only + manifest change — **no server, harness, loader, or gate code touched**; RETAIN core untouched. Operator decision (asked at Phase 1): **mock-bounded** expansion.

**Plain language.** The MIRAGE trust-gate corpus grew from 23 to **98 synthetic items**. It is still fully unattested, so it still gates nothing — but it now exercises all four partitions at real strength, giving a registered clinician a substantial, defensible set to attest (that attestation is FL-21, and it is what flips the bench from diagnostic to gating).

**The mock ceiling (Phase-1 finding).** The harness scores a **P** (positive-retrievable) item by spawning the real mock server and checking the returned evidence key — so P is hard-bounded by what the canned mocks hold: **11 distinct retrievable keys total** (#14 = 5, #15 = 4, #1 = 1 clinical). The spec §6 target of 50 P/path is unreachable offline against echo-stub mocks; the manifest already flagged this. So P was maxed to the real ceiling (13/11/3 incl. seed) with terse claim-substring questions, while the **safety-critical N (abstain) and A (adversarial) and diagnostic L** partitions — which are NOT key-bounded — were grown to spec strength. Natural-language P at ~50/path is deferred to the live backends (§6 growth path), documented in the manifest.

### Change
- **`benchmark/mirage/corpora/{evidence-fda-pubmed,evidence-drug-guideline,docs,localisation}.corpus.json` [~]** — +75 authored items (23 → 98), all `synthetic:true`, `attested_by:null`, firewall-clean, question-only, schema-valid through the strict loader. Per-path: #14 P13/N10/A8/L7, #15 P11/N8/A15 (dose-elicitation-heavy)/L5, #1 P3/N8/A7/L3. Diagnostic run: **all three paths P-rate=1.00, abstain-correct=1.00, invariant-hold=1.00, would_pass_if_attested=true.**
- **`benchmark/mirage/corpora/manifest.json` [~]** — `corpus_version` 0.1.0 → **0.2.0**, recomputed SHA-256 checksum, per-path/total counts (98), a `mock_bound_note` recording the 11-key ceiling and why P is capped, and refreshed acceptance criteria + growth path.
- **`benchmark/mirage/scores/latest.json` [~]** — regenerated by the runner (records the v0.2.0 checksum + the honest `benchmark_passed=false` / attested=0 state).

### Invariant check
Firewall clean (loader `SCORING_PROVENANCE_RE` enforced; no scoring-node provenance; `data/cases/10–13` never opened) · question-only (loader-asserted) · no dose as any answer key · no PHI · no licensed-benchmark lifts (original wording) · nothing sets `patient_eligible` (unattested → non-gating; H7 still required on top). ✔

### Register / gap
No item state change: `mirage-benchmark-gate` (R-29) stays COMPLETE — FL-02 grows its corpus, it does not resolve the **attestation** (FL-21) or the live-backend P-volume (§6). R-29 evidence updated to note the v0.2.0 tranche. FINISH-LINE FL-02 → checked by the finish-line agent; FL-21 now has the full corpus to attest.

## L12 — Consent capture: recording mechanism + fail-closed persistence seam (FL-01 / R-40) (2026-07-13)

**Status:** `npm test` **52/52** green (+`contract-consent`); `verification` Pass:true; `trunk:stub:all` 9/9; `licence:check` PASS; `security:secrets` PASS; **RETAIN core byte-unchanged** (sha256 CI pin holds); **no new repo dependency**. Plan: `.planning/CONSENT-PLAN.md` (operator-approved as-is 2026-07-13, both defaults accepted).

**Plain language.** A patient can now grant, decline, or revoke narrowly-scoped consents during a consult, and every decision is recorded as tamper-evident evidence. Nothing new is stored about patients: consent capture is proof-keeping, not a storage unlock — the system still destroys everything at session end, and the one gate a future storage feature would have to pass (`requireActiveConsent`) refuses by default.

### Change
- **`mcp/schemas/consent-record.schema.json` + `verification/consent-schema.js` [NEW]** — PHI-free by construction (`.strict()`; session_ref + closed enums + proven omnibus bindings + hashes; a free-text field is unrepresentable). Current state is DERIVED from the latest event per (session_ref, consent_type) — the store is append-only, never updated in place. v1 types: `session_persistence` (heydoc-first-party) + `mhr_data_sharing`/`telehealth_consent` (omnibus-bound via `provenPath()` + the pinned dataset receipt — a consent type is never minted; MHR is RECORD-ONLY, nothing uploads).
- **`verification/consent.js` [NEW]** — `captureConsent` (bounded granted/declined, only inside an OPEN encounter; a decline is recorded as evidence and never affects care), `revokeConsent` (refuses a non-active revoke), `consentStatus`/`getActiveConsent`, and **`requireActiveConsent()` — the fail-closed seam every FUTURE persistence path MUST call**: `BLOCKED_NO_CONSENT` on every branch (no record / declined / revoked / session-ended / unknown type / malformed ref / store failure).
- **`verification/consent-store.js` [NEW]** — the FOURTH append-only hash chain (`consent-records.jsonl`; audit-store pattern: canonical JSON, `entry_hash = sha256(canonical+prev)`, `verifyConsentChain`), with its **substrate seam built on day one** (`registerConsentStoreSubstrate`, two-op; non-local unregistered REFUSES — the R-43 lesson applied at birth). Strict validation BEFORE the durable write.
- **`integration/audit-substrates/s3-object-lock.js` [~]** — `registerWormAudit()` now registers on **all four** medicolegal seams (`HEYDOC_CONSENT_SUBSTRATE=s3-object-lock`); `test/contract-audit-worm-s3.js` extended (consent chain through the WORM substrate: COMPLIANCE/write-once/seq-collision asserted).
- **`verification/session-store.js` [~ additive]** — close-hook registry (`registerCloseHook`); `closeEncounter()` runs hooks BEFORE destruction and NEVER lets a throwing hook block it (surfaced as `hook_errors`). consent.js registers the inactivation hook → `expires: session_end` is mechanical.
- **`patient/consult-flow.js` + `consult-server.js` [~]** — bounded intake consent step: `parseConsentIntake` (silence records NOTHING; free text never becomes a consent), `captureIntakeConsents` (SUPPRESSED on an emergency result — never a step on a STOP/T5 path; capture errors fail-safe, never into the screen path); decline is the pre-selected default; one POST = one encounter, so recorded consents demonstrably expire at session end.
- **`test/contract-consent.js` [NEW — load-bearing]** — the **no-unlock assertion** (`persistContent` refuses non-synthetic with an ACTIVE consent) + **packet isolation** (static scan: pipeline/context-allowlist/trunk files carry zero consent references) + the default-deny matrix + chain tamper + seam fail-closed + omnibus proof + close-hook resilience + bounded-intake/emergency-suppression.
- **`docs/grounding/privacy-app-mapping.md` [NEW]** — APP 1–13 → mechanism map + data-flow register (D1–D8); org decisions flagged **[ORG]**, never made; MHR Act touchpoint documented as capture-only.

### Invariant check
No packet change (statically asserted) · no persistence opened (`persistContent` synthetic-only untouched; destroy-on-close untouched) · patient-data minimisation (session_ref + enums only; no demographics/IHI representable) · no codes/types minted (omnibus receipt-proven) · RETAIN core byte-unchanged · fail-safe default everywhere · consent never a barrier on an emergency path. ✔

### Register / gap move
`consent-capture-unbuilt` → **COMPLETE/resolved**; R-40 → **capture half resolved** (L12 org/security siblings stay open: SAST R-38/FL-13, pen-test + formal privacy review FL-51, org APP documents). `content-store-production-gated` deliberately unchanged. FINISH-LINE FL-01 to be checked off by the finish-line-review agent against the merged evidence.

## DOCS-RECON — planning-doc review reconciliation + R-43 registered-and-resolved (2026-07-13)

**Status:** documentation + register reconciliation, operator-approved after a read-only review of all seven `.planning/` docs against `main @ de91f81`. One code change: a stale comment. No behaviour change; no contract change; RETAIN core untouched.

**Plain language.** The planning documents were audited against the repo. Nothing any plan claimed as built was missing — but the repo had moved well past the docs, and two operator-facing facts were wrong or missing. Every plan now carries a dated banner saying what actually happened to it. The one open gap the audit surfaced (the PPP-TTT ledger's missing storage seam) was formally registered — and turned out to have been closed independently by the B1-PPP work (below) merged in the same window, so it enters the register already resolved.

### Change
- **`.planning/*` [~ all seven]** — dated status-reconciliation banners: ARCH_PLAN + FLOW_PLAN marked EXECUTED/historical (registers are current state; FLOW deviations #18/#20/evidence-cms named); M9–M14 corrections (M10 sanitiser input closed; M13 portal-gate wording outdated; M11 P1 + fhir live backend already built); PPP-TTT marked EXECUTED Steps 1–3 (+ vendored `data/scope-registry.json` path note); LIVE_PLAN marked Track-A largely executed (+ note that commit tags "§9 A1/B1…" resolve to the handback checklist, not LIVE_PLAN §9); MEDGEMMA plan marked executed with **A3, not the recommended A1** (fallback never built, by decision).
- **`.planning/OPERATOR-HANDBACK-CHECKLIST.md` [~]** — reconciled to #40–#45: **default-model claim corrected** (`claude-opus-4-8` → `claude-sonnet-5`, PR #41); B1 marked adapter-BUILT (PR #45) with operator provisioning remaining; B2 marked scaffolding-BUILT (PR #42) with operator deploy remaining; B3 gains the **plaintext-not-JSON secret-format warning** (PR #44 lesson; `aws-sm:<id>#<field>` escape hatch).
- **`docs/grounding/completeness-register.md` [~]** — H4 scan line's "~52 attested" **corrected in place**: it counted the envelope's `clinician_reviewed` field (false by design); attestation lives in `case_manifest.json` — 301/301 attested per R-23, re-verified via `eval:cases` PASS. New docs-reconciliation scan note added.
- **`integration/trunk-pipeline.js` [~ comment only]** — sequencer re-export comment said "default off → rollback"; corrected to graduated default-ON (L4) with `HEYDOC_SEQUENCER=0` as rollback.

**Register [~]:** NEW `ppp-ttt-ledger-substrate-seam-missing` (**High**, pf:true) — formalised the B1 follow-up: at scan time `verification/ppp-ttt/ledger.js` wrote local JSONL directly with no substrate seam, the only medicolegal chain `registerWormAudit()` could not reach. Promoted one-way → gap-register **R-43**. **Registered-and-resolved in the same window:** the B1-PPP entry below (PR #46) landed independently while this reconciliation was in review and built the exact seam this item specified (M8 pattern; register THROUGH the seam, store logic untouched) — item recorded COMPLETE/resolved; R-43 closed on arrival; remaining live validation rides R-39. `.claude/completeness-index.md` re-synced (also fixed two drifted lines: R-39 state UNBUILT→PARTIAL; portal remaining-work wording).

---

## B1-PPP — PPP-TTT ledger substrate seam + third-seam WORM registration (§9 B1 follow-on) (2026-07-12)

**Status:** `npm test` **50/50** green; all gates green (verification + trunk:stub:all); **RETAIN core byte-unchanged** (`verifier.js` / `portal/verification-gate.js` / `audit-store.js` sha256 pins hold); **no new repo dependency**. Follows the B1 S3 Object Lock adapter (PR #45), which wired only the audit + gate seams and explicitly opened the follow-up this entry closes.

**Plain language.** The PPP-TTT triage ledger — the third medicolegal hash-chain — could not be WORM-backed because it wrote straight to a local file with no pluggable storage seam. It now has the same seam as the audit ledger and gate records, and the S3 Object Lock adapter now makes all three chains immutable-for-7-years in one call.

### Change
- **`verification/ppp-ttt/ledger.js` [~]** — added `registerPppTttLedgerSubstrate(name, adapter)` (two-op `{ appendLine, readLines }`, mirroring `portal/gate-record-store.js`) with a built-in `local` backend (current dev JSONL behaviour, byte-for-byte) and a fail-closed `substrate()` resolver: a non-`local` `HEYDOC_PPP_TTT_SUBSTRATE` with no registered adapter REFUSES. `readPppTttLedger`/`appendPppTttEntry` route through the seam; the hash-chain algorithm (canonical JSON, `entry_hash`, genesis, `verifyPppTttChain`) is UNCHANGED — pure I/O indirection. `ppp-ttt/ledger.js` is not byte-pinned, so no pin moved; the monotone-test firewall walk (no sealed-node paths, no `patient_eligible`) still passes.
- **`integration/audit-substrates/s3-object-lock.js` [~]** — `registerWormAudit()` now registers `s3-object-lock` on ALL THREE seams (added the PPP-TTT two-op adapter alongside the existing audit + gate ones); one immutable object per entry keyed by the entry's own `seq` (`extractSeq`, which PPP-TTT entries also carry), COMPLIANCE + retain-until + `--if-none-match "*"` on every write, boot-seeded read cache. Returns `ppp_ttt_entries` + exposes `pppTtt`.
- **`test/contract-audit-worm-s3.js` [~]** — extended to drive the PPP-TTT chain through the WORM substrate (`appendPppTttEntry` ×2 → `verifyPppTttChain` valid; COMPLIANCE + write-once asserted on the triage puts; seq-collision refusal). Selects `s3-object-lock` on all three `HEYDOC_*_SUBSTRATE` vars.
- **`deploy/register-substrates.example.mjs` [~]** — the one-call `registerWormAudit()` note updated to name all three seams + `HEYDOC_PPP_TTT_SUBSTRATE=s3-object-lock`.

### Invariant check
Hashing untouched (all three `entry_hash` chains unchanged); PHI-free `.strict()` validation still runs BEFORE the durable write; fail-closed default extended to the third seam; no scoring-store path (firewall walk green); RETAIN core byte-unchanged. ✔

### Register / gap move
`worm-substrate-adapter-unbuilt` stays **PARTIAL** but now spans all three seams; the "PPP-TTT ledger has no substrate seam" follow-up #45 opened is **closed**. R-39 updated. Remaining is operator/deploy only (bucket + retention + env selection).

---

## B1 — S3 Object Lock WORM audit substrate (§9 B1 / R-39) (2026-07-12)

**Status:** `npm test` **50/50** green (+`contract-audit-worm-s3`); all gates green; **RETAIN core byte-unchanged** (`audit-store.js` sha256 pin holds — registered *through* its seam, never edited); **no new repo dependency**; secret-scan 0 findings. Operator decision: **S3 Object Lock, COMPLIANCE mode, 7-year retention.**

**Plain language.** The medicolegal trail (verification ledger + clinician gate records) can now be written to storage that cannot be altered or deleted — even by the account root — for 7 years. This is the last in-repo blocker for production-grade, tamper-evident audit retention.

### Change
- **`integration/audit-substrates/s3-object-lock.js` [NEW]** — `registerWormAudit({bucket, region, retentionYears, mode="COMPLIANCE", prefix, exec})` registers `s3-object-lock` on **both** medicolegal seams (`registerAuditSubstrate` four-op + `registerGateRecordSubstrate` two-op). One immutable S3 object per chain line (`${prefix}/{ledger|gate-records}/${padded(seq)}.json`); content-addressed drafts at `content/${hex}.txt`. Every write: `s3api put-object --object-lock-mode COMPLIANCE --object-lock-retain-until-date <now+7y> --if-none-match "*"`. **Why AWS CLI + execFileSync, not the SDK:** the store seams are SYNCHRONOUS (`audit-store.js` is frozen/byte-pinned; `appendEntry`/`readLedger` call the ops inline) and the SDK is async — a blocking CLI call is the only way to get a synchronous, awaited, durable WORM write; a fire-and-forget SDK PutObject would silently drop a medicolegal record. Reads are served from **boot-seeded in-memory caches**, so only writes spawn a subprocess (fine at medicolegal volumes). AWS CLI is a **deploy-time dependency** (Dockerfile `INSTALL_AWS_S3`), NOT a repo one — same discipline as the aws-sm backend. **Fail-closed:** missing bucket/region/retentionYears or a bad mode throws at registration; a ledger seq collision (append-only violated) throws; an absent CLI → an actionable error. Retention **period is not hardcoded** (`retentionYears` is required — charter "surface, don't decide"). No logging (record values never reach a log).
- **`test/contract-audit-worm-s3.js` [NEW]** — drives the WORM substrate **through the real frozen stores** with an injected fake CLI: audit + gate hash-chains round-trip and **verify**; every write asserted COMPLIANCE + retain-until≈now+7y + write-once; content write-once/idempotent + read/null; fail-closed (seq collision, missing args, bad mode, absent CLI); pure helpers; no-log source scan. Wired into `npm test` + CI.
- **Deploy wiring [~]** — `deploy/bootstrap.mjs` registers the WORM substrate at boot when `HEYDOC_AUDIT_SUBSTRATE=s3-object-lock` (fail-closed on unset bucket/retention); `deploy/register-substrates.example.mjs` now shows the concrete `registerWormAudit` call; `Dockerfile` `INSTALL_AWS_S3` build arg (`apk add aws-cli`, image only); `deploy/build-and-push.sh` passes it; `deploy/apprunner-create.sh` sets `HEYDOC_WORM_*` + `HEYDOC_AUDIT_RETENTION=7y`; `deploy/README.md` adds bucket-provisioning (Object Lock + versioning) + IAM (`s3:PutObject/PutObjectRetention/GetObject/ListBucket`) + the COMPLIANCE-is-irreversible warning.

### Invariant check
Hashing preserved (chain algorithms untouched; adapter is pure I/O behind existing seams); append-only/write-once enforced at the S3 layer + COMPLIANCE lock (immutable even to root, 7y); no frozen file edited (`audit-store.js` pin holds); fail-closed on misconfig/collision/absent-CLI; no PHI/record values logged; no new repo dependency. ✔

### Register
R-39 `worm-substrate-adapter-unbuilt` **UNBUILT → PARTIAL** (adapter built + tested; live bucket connect operator-side); mirrored into the gap-register. **Opens one follow-up:** `verification/ppp-ttt/ledger.js` has no substrate seam (writes local JSONL directly) — register one so it can be WORM-backed too (out of B1 scope by design; flagged, not silently expanded).

---

## B3-HARDEN — JSON-tolerant `aws-sm` secrets backend (2026-07-12)

**Status:** `npm test` **49/49** green; all gates green; RETAIN core byte-unchanged; **no new repo dependency**; secret-scan `0 findings`. Shared seam `integration/secrets.js` deliberately **untouched** (all new logic in the aws-sm backend module).

**Why:** the live AWS smoke reached `mode: live, model: claude-sonnet-5` but generation returned `BLOCKED_NO_PROOF — 401 invalid x-api-key`. Root cause: the secret was stored as a JSON key/value object (`{"ANTHROPIC_API_KEY":"sk-ant-…"}`, the Secrets Manager console default), and the seam correctly returned that whole blob verbatim as the API key. The code behaved correctly throughout (fail-closed, never a fabrication); the fix is to make the backend tolerate the common JSON shape rather than only plaintext. The end-to-end live path (IAM → SDK → aws-sm → seam → adapter → Sonnet 5 → verifier PASS) is validated.

### Change
- **`integration/secrets-backends/aws-secrets-manager.js` [~]** — new exported pure helper `extractSecret(raw, field, refLabel)` + JSON-tolerant resolver. Ref grammar gains an OPTIONAL field selector `aws-sm:<SecretId>#<field>` (`#` is safe — AWS secret names cannot contain it; cache is keyed on the base SecretId). Policy, **fail-closed throughout**: (1) plaintext (not `{`-leading) → returned **verbatim, unchanged** — no behaviour change, no trimming; (2) `#field` given → `JSON.parse`, return `obj[field]` iff a non-empty string, else THROW actionable; (3) JSON object, no `#field` → auto-extract iff **exactly one** key with a non-empty string value (the console-default case), else THROW actionable naming the `#field` remedy. Ambiguous/malformed JSON (zero/several keys, missing/empty/non-string field, non-object) is **REFUSED** — never guesses, never returns the raw blob. The seam's existing empty + `example.invalid` checks still run on the final extracted value as a second net. No logging added (value never reaches a log; source-scan test still green).
- **`test/contract-secrets-aws.js` [~]** — extended: plaintext passthrough (unchanged); single-key auto-extract; `#field` extraction; and fail-closed REFUSE for multi-key-without-field, missing field, empty field, non-string field, malformed JSON, and `#field`-against-plaintext — plus end-to-end resolution of both a single-key JSON secret and a `#field` ref through `getSecret()`/`hasSecret()`.
- **Docs [~]** — `deploy/README.md` (store plaintext; `#field` for JSON) + `scripts/smoke-llm.mjs` header.

### Invariant check
Fail-closed seam un-weakened (secrets.js unchanged); ambiguous JSON → REFUSE (consistent with "ambiguous safety = unsafe"); secret values never logged; plaintext passthrough unchanged so no live path regresses. ✔

### Register
B3 `aws-sm` backend row (R-36 area) stays `COMPLETE`, now JSON-tolerant + additionally tested. No gap opened or moved.

---

## MODEL — Default Claude model set to Sonnet 5 (operator selection) (2026-07-11)

**Status:** `npm test` **48/48** green; all gates green; RETAIN core byte-unchanged. Operator decision.

- **`integration/llm-adapter.js` [~]** — `DEFAULT_LLM_MODEL` = `claude-sonnet-5` (was `claude-opus-4-8`). Clean model-ID swap: Sonnet 5 takes the SAME request surface the adapter already uses (adaptive thinking; no `budget_tokens`/sampling params), so nothing else changes. Still overridable per-deploy via `HEYDOC_LLM_MODEL`; all L3 bars (packet-only, fail-closed, mock-by-default, audit) unchanged. `contract-llm-adapter.js` follows the constant (`model === DEFAULT_LLM_MODEL`) — green. The MedGemma backend's own model is unaffected. Register evidence for `live-llm-generation-adapter-unbuilt` updated.

---

## B3 — AWS Secrets Manager backend for the fail-closed secrets seam (§9 operator handback) (2026-07-11)

**Status:** `npm test` **48/48** green (47 prior + `contract-secrets-aws`); all gates green; RETAIN core byte-unchanged; **no new repo dependency** (`npm audit` unchanged). Operator handback: chose AWS Secrets Manager, region `ap-southeast-2`, secret `aws.sm/heydoc/anthropic.key` (name + region given — **never the value**).

### Change
- **`integration/secrets-backends/aws-secrets-manager.js` [NEW]** — `registerAwsSecretsManager({region, secretNames})` fetches each named secret ONCE at boot (async) into an in-memory cache, then registers a SYNCHRONOUS `aws-sm` backend on the fail-closed seam. **Why fetch-at-boot:** the seam is synchronous (the Claude client reads `getSecret(ref)` inline) but AWS SM's GetSecretValue is async — so pull at startup, read synchronously thereafter (rotation → restart; TTL a later option). **Why the AWS SDK is a deploy-time dependency (dynamic import), NOT a repo dependency:** the core stays cloud-agnostic and mock-by-default; the AWS deploy image installs `@aws-sdk/client-secrets-manager`, the module dynamic-imports it only when the backend is registered, and an absent SDK yields an actionable install error. **Secret discipline:** the value lives only in the boot cache on the deploy host and flows only to the `getSecret()` caller — never logged, never returned to the agent, never on disk. Fail-closed at boot: an empty/missing SecretString THROWS at registration (never registers a blank credential); an un-preloaded name refuses.
- **`deploy/register-substrates.example.mjs` [~]** — concrete AWS SM bootstrap (region ap-southeast-2, `aws.sm/heydoc/anthropic.key`), awaited before server start; the generic placeholder backend stays (throws by design).
- **`test/contract-secrets-aws.js` [NEW]** — proves boot-preload → synchronous resolve via `getSecret('aws-sm:<SecretId>')`, verbatim SecretId passthrough (first-colon ref split), fail-closed-at-boot on empty/missing, un-preloaded-name refusal, required-arg guards, the **real absent-SDK branch** (the SDK is intentionally not installed → the actionable error fires), and that the module logs nothing. Injected fetcher — no SDK, no AWS call. `package.json` [~] test line.

**Register [~]:** `secrets-manager-integration-unbuilt` narrowed (AWS SM backend built + contract-proven; R-36 updated). Checklist B3 marked done; the credential-channel note corrected (env + aws-sm ready today; a *deployed* staging env is B2).

**Deploy handoff (your side):** on the AWS deploy host, `npm install @aws-sdk/client-secrets-manager`; grant the runtime role `secretsmanager:GetSecretValue` on the secret ARN; set `HEYDOC_LLM_KEY_REF=aws-sm:aws.sm/heydoc/anthropic.key` + `HEYDOC_LLM_LIVE=1` + `HEYDOC_MODE_DEFAULT=staging`. Then A1 live smoke — the agent never handles the value.

**Invariants held:** security_and_secrets — the value is never handled by the agent, never logged, never in the repo; fail-closed at the seam AND at boot; no new repo dependency (supply chain unchanged); frozen core byte-unchanged; no `patient_eligible`.

---

## SMOKE-AWS — aws-sm opt-in for the standalone live smoke (2026-07-12)

**Status:** `npm test` **49/49** green; all gates green; RETAIN core byte-unchanged; no new repo dependency. LIVE_PLAN §9 A1 follow-up.

- **`scripts/smoke-llm.mjs` [~]** — when `HEYDOC_AWS_SECRET_NAMES` is set, `runSmoke()` registers the `aws-sm` secrets backend at start (the same fetch-at-boot the deployed container does via `deploy/bootstrap.mjs`), so `npm run smoke:llm` can validate the **production** key path (IAM → AWS SDK → aws-sm backend → adapter → Sonnet 5) from a standalone host, not just the `env:` shortcut. **Fail-closed:** a missing/empty secret, absent SDK, or IAM denial THROWS — the CLI surfaces it with an actionable hint and exits 2; it NEVER silently falls back to a mock run. The mock-run hint now shows both the `env:` and `aws-sm` recipes.
- **`test/contract-smoke-llm.js` [~]** — the aws-sm path with an injected fetcher (no SDK/no AWS): registers → `getSecret('aws-sm:…')` resolves → `isLlmLiveEnabled()` true; and empty-secret → throws (fail-closed). Why this matters: a standalone `npm run smoke:llm` does NOT run the deploy bootstrap, so without this opt-in an `aws-sm:` ref would fail to resolve and the smoke would (correctly, but confusingly) report a MOCK run.

---

## SMOKE+B2 — one-command live-LLM smoke + AWS App Runner deploy scaffolding (2026-07-11)

**Status:** `npm test` **49/49** green (48 prior + `contract-smoke-llm`); all gates green; RETAIN core byte-unchanged; **no new repo dependency**. LIVE_PLAN §9 A1 (smoke) + B2 (staging deploy). Operator on AWS / ap-southeast-2.

### Option A — `npm run smoke:llm` (§9 A1)
- **`scripts/smoke-llm.mjs` [NEW]** — runs ONE pipeline turn through the selected Step-4 backend (Claude|MedGemma per `HEYDOC_LLM_BACKEND`) and prints backend / mode (mock vs live, never conflated) / model / verification PASS / continuation-blocked / blocked-reason / latency / prompt hash. Synthetic packet only (safe against the live API); all bars hold (packet-only, fail-closed, frozen verifier); never handles a secret value; exit 0 iff the run completed and generation wasn't blocked. A mock run prints an explicit "MOCK — set HEYDOC_LLM_LIVE=1…" hint.
- **`test/contract-smoke-llm.js` [NEW]** — mock run, injected live-success (Claude → model `claude-sonnet-5`), injected blocked (timeout → surfaced, not fabricated), MedGemma backend, dose-leak still blocked by the composed gate, no `patient_eligible`. Injected transports — no network, no key. `package.json` [~] test line + `smoke:llm` script.

### Option B — AWS App Runner deploy scaffolding (§9 B2)
- **`deploy/bootstrap.mjs` [NEW]** — the AWS StartCommand: registers the `aws-sm` key backend at boot (fetches `aws.sm/heydoc/anthropic.key` into the fail-closed seam) BEFORE starting the chosen server (`HEYDOC_SERVICE=portal|consult`). So `HEYDOC_LLM_KEY_REF=aws-sm:…` resolves at runtime via the instance role; the value never appears in config.
- **`Dockerfile` [~]** — `INSTALL_AWS_SM` build arg adds `@aws-sdk/client-secrets-manager` to the IMAGE only (`--no-save`, pinned major) — the repo core stays cloud-agnostic and CI still exercises the absent-SDK branch.
- **`deploy/build-and-push.sh` [NEW]** — ECR repo ensure + build (with the SDK) + push; prints the image URI. **`deploy/apprunner-create.sh` [NEW]** — creates the App Runner service (ECR image, port 8787, StartCommand bootstrap, instance role [HeydocSecretsRead] + access role [ECR pull], portal token via `RuntimeEnvironmentSecrets`, `/healthz`). **`deploy/README.md` [~]** — the B2 runbook (two IAM roles, deploy steps, key-resolution flow, and the ephemeral-storage caveat: B1 WORM required before production).

**Register [~]:** `deployment-runtime-unbuilt` narrowed (App Runner scaffolding built; R-35 updated — operator runs the scripts; B1 WORM before production).

**Invariants held:** the smoke's bars are the pipeline's (packet-only, fail-closed, frozen verifier); no secret value handled; no new repo dependency (the AWS SDK is image-only); staging fail-closed (portal token required, non-local audit substrate without a WORM adapter refuses); frozen core byte-unchanged; no `patient_eligible`.

**Your side:** run `smoke:llm` on a host with the role + SDK to prove Sonnet 5 live; or run the two B2 scripts (create ECR + two roles + portal-token secret) to stand up a staging App Runner service.

---

## L11 — Patient consult surface (mock-gated; PPP-TTT Step 3): no clinical draft escapes the release gate (2026-07-11)

**Status:** `npm test` **47/47** green (46 prior + `contract-patient-consult`); all gates green; RETAIN core + `pipeline.js` byte-unchanged. Plan: `.planning/LIVE_PLAN.md` L11 (+ PPP-TTT plan Step 3). **NO patient path opened — the surface is mock-gated and releases nothing; nothing sets the patient-eligibility flag.**

### Change
- **`patient/consult-flow.js` [NEW]** — the pure, testable consult-flow decision logic. THE LOAD-BEARING INVARIANT: no patient-visible clinical draft escapes the release gate. Every clinical draft routes through the FROZEN `releaseToPatient()` FIRST; mock/dev release NOTHING, so a dev consult shows "pending clinician sign-off," never a draft (a draft appears ONLY on `released:true`). **Safety-screen precedence** (contract-proven): EMERGENCY (PPP-TTT STOP / escalate_now / T5 / firewall hard-stop) → NON-OVERRIDABLE 000 screen, no draft, wins over paediatric/interpreter; under-18 → in-person referral (paediatric hard limit — no dose/draft); interpreter_required → human escalation; CAUTION → PPP-TTT **Step-3 E-PP** bounded choice (proceed/decline, subordinate to sign-off) + "No diagnosis / No decisions" caveats + safety-net descriptors, draft still gated; GO → gated (dev → pending). Fail-safe: any flow error routes to the emergency screen, never a draft.
- **`patient/consult-server.js` [NEW]** — dependency-free (node:http, server-rendered, XSS-escaped) renderer over the flow logic; runs a consult through the sequenced pipeline (mock Step-4) + PPP-TTT and renders the chosen screen; a safety banner on every page; `npm run consult`.
- **`test/contract-patient-consult.js` [NEW]** — proves the invariant exhaustively (no draft on any screen unless `released:true`), the safety-screen precedence, the E-PP caveats/safety-net, the release-gate call on every clinical path, the fail-safe, the HTTP server (healthz/intake/consult, XSS-escaped, dev shows pending), and no `patient_eligible`/scoring-store reference in `patient/`. `package.json` [~] test line + `consult` script.

**Register [~]:** `product-surface-unbuilt` → **PARTIAL** (both surfaces built mock-gated + contract-proven; no patient path opened, by design — R-33 updated). PPP-TTT Step 3 **done**. Allowed Service Registry `patient-client-app` row updated (built mock-gated).

**Invariants held:** prime-directive human-in-the-loop mechanically enforced at the surface (releaseToPatient on every clinical path; dev releases nothing); emergencies non-overridable; paediatric → in-person, no dose; interpreter → escalation, not language switch; frozen core byte-unchanged; no scoring-store path; nothing sets the patient-eligibility flag (statically asserted). **NO patient path opened** — the four patient-facing blockers + the four-part eligibility precondition remain not-green, correctly.

**Open follow-ups:** the surface stays mock-gated until the blockers/precondition clear (owned elsewhere); real intake→Trunk-1.0 flag mapping (plan-gated); clinician identity/session UX.

---

## L10 — Clinical evaluation is now a release gate, not a report: deterministic scorer + four thresholds + the under-triage alarm call-site (2026-07-11)

**Status:** `npm test` **46/46** green (45 prior + `contract-eval-scoring`); `security:secrets` PASS; `licence:check` 0 blocks; `verification` Pass:true; `trunk:stub:all` 9/9; `eval:cases` PASS; `bench:mirage` OK; `npm audit` 0. RETAIN core byte-unchanged. Plan: `.planning/LIVE_PLAN.md` L10. **No patient-facing change.**

### Change
- **`verification/eval-scoring.js` [NEW]** — the mechanical core of the charter release gate ("the synthetic-case evaluation is a RELEASE GATE, not a report"), as PURE deterministic logic reproducing `docs/grounding/evaluation-guide.md`:
  - `classifyTier(aiTier, node)` — the safety-netting tier rubric, mechanically: correct (1.0) / acceptable (0.8) / minor under-triage (0.5) / serious under-triage (0.2) / **critical under-triage → AUTO-FAIL 0.0** / minor+moderate over-triage. Reads the sealed `13_safety_netting_node` **SCORER-SIDE only** (the scorer is the grader; the firewall bars the AI Doctor, never the scorer) — never into any ContextPacket. Fail-safe: missing gold anchors → `scored:false`, never a fabricated score.
  - `scoreCase()` — verification is a hard GATE (fail → UNGROUNDED, no clinical score); otherwise the five weighted dimensions (history 25 / diagnostic 25 / management 30 / safety-netting 15 / communication 5) + auto-fails; a critical under-triage is never a clinical pass regardless of score.
  - `computeCaseSetMetrics()` + `enforceReleaseThresholds()` — the four release conditions: case ≥0.70, ≥80% clinical pass, **ZERO critical under-triage across T5**, ≥90% grounding compliance; under-triage weighted 3×. The two HARD safety conditions are deterministic and block even before the clinical scorer is armed.
  - `scoreCaseTriage()` — the critical-under-triage **alarm CALL SITE** (`raiseAlarm("critical_under_triage", {case_id,…})`), closing the R-37 remainder.
- **ARMS AT STAGING (MIRAGE precedent):** the full clinical run needs live Step-4 generation producing case-specific tiers (mock produces none), so `enforceReleaseThresholds` reports `armed:false` until a real run exists — it never false-certifies a release under mock, and the safety conditions still bite.
- **`test/contract-eval-scoring.js` [NEW]** — every rubric band, the 3× asymmetry, the verification gate, all four release thresholds, the armed/unarmed distinction, and the alarm call-site (fires on critical under-triage, silent on correct/over-triage). `package.json` [~] test line.

**Register [~]:** NEW `clinical-eval-scorer` (PARTIAL — scorer + thresholds + alarm built + unit-tested; the live multi-turn clinical harness + semantic-dimension rubric sign-off input-gated) → gap-register **R-42**. `observability-metrics-unbuilt` under-triage call-site **built** (R-37 narrowed). `case-set-underpopulated` unchanged (301/301 attested; only optional 60/30/10 polish remains, clinician-gated).

**Invariants held:** scoring-store firewall intact (13-node read scorer-side, never a packet path — statically the scorer is not the AI Doctor); under-triage weighted 3× over-triage (mechanical); over-triage never fires the alarm (over-triage is the system working); frozen core byte-unchanged; no `patient_eligible`.

**Open follow-ups:** the live multi-turn clinical harness (needs L3 staging live generation) + clinical sign-off on the semantic-dimension rubric (history/diagnostic/management); the case-set 60/30/10 distribution polish (clinician-gated source + attestation).

---

## MEDGEMMA — MedGemma as a selectable alternative Step-4 generation backend (2026-07-11)

**Status:** `npm test` **45/45** green (43 prior + `contract-llm-adapter-medgemma`, `contract-generation-backend`); `security:secrets` PASS; `licence:check` 0 blocks (new REFERENCE row #medgemma); `verification` Pass:true; `trunk:stub:all` 9/9; `eval:cases` PASS; `bench:mirage` OK; `npm audit` 0. RETAIN core + `pipeline.js` + the L3 Claude adapter **byte-unchanged** (purely additive). Plan: `.planning/MEDGEMMA-ADAPTER-PLAN.md` — operator-approved with **Decision A3** (selectable backend, no failover) and **Decision B** (clinician-attested cleared for use, attested_by KL). **No patient-facing change; nothing sets patient_eligible; mock remains the default.**

### Change
- **`integration/llm-adapter-medgemma.js` [NEW]** — a second Step-4 generation backend under the IDENTICAL bars to the L3 Claude adapter: strict-packet re-gate (a field outside the `.strict()` ContextPacket contract REFUSES generation before any `fetch` call, spy-proven); fail-closed to `BLOCKED_NO_PROOF` on invalid packet / missing endpoint or key / HTTP non-2xx / `AbortError` timeout / safety `finish_reason` / empty / truncation; mock by default (live requires `HEYDOC_MEDGEMMA_LIVE` + `HEYDOC_MEDGEMMA_ENDPOINT` + a secrets-seam key, all three); audit `backend:"medgemma"` + model + `prompt_sha256` + mode + latency. FIRST-PARTY clean-room HTTPS, OpenAI-compatible chat-completions (endpoint-agnostic — Vertex / HAI-DEF / self-host vLLM / HF); **no Google code and no weights in-repo**. Imaging/DICOM deliberately OUT (the packet carries no images; feeding one would breach the packet-only bar).
- **`integration/generation-backend.js` [NEW]** — selects the Step-4 backend from `HEYDOC_LLM_BACKEND` (default `claude`; unknown value THROWS — loud misconfig, never a silent default); routes each transport override to its matching backend only. **Decision A3 — SELECTABLE ONLY, NO FAILOVER:** exactly one backend serves a run; a safety refusal stays `BLOCKED_NO_PROOF` and is NEVER rerouted to the other model (contract-proven: the other model's transport is never touched — the absence of failover code IS the guarantee).
- **`integration/harvest-manifest.json` [~]** — +1 REFERENCE row (#medgemma): MedGemma ships under the Health AI Developer Foundations terms (NOT OSI); no code/weights wrapped; `licence_status` records the **clinician attestation** that it is cleared for use here (Decision B), not an on-repo OSI detection. `licence:check` 0 blocks.
- **`test/contract-llm-adapter-medgemma.js` + `test/contract-generation-backend.js` [NEW]** — mirror the L3 suite (packet-only refusal, all fail-closed paths, mock default, dose-leak blocked by the composed detectors, no forbidden surfaces) + the A3 no-failover safety proof. `package.json` [~] test line.

**Register [~]:** NEW `medgemma-generation-backend` (PARTIAL — built + contract-proven; staging live smoke input-gated on the operator's endpoint/key), promoted → gap-register **R-41**. Licence/regulatory clearance RESOLVED by clinician attestation (Decision B).

**Invariants held:** frozen core + pipeline + L3 adapter byte-unchanged (CI pin); LLM-vs-deterministic-truth boundary enforced mechanically at Step 4 (strict packet re-gate) for this backend too; no autonomous dx/rx (same downstream verifier + detectors + PPP-TTT); no minted codes/doses/facts; mock never presented as live; no scoring-store path; no `patient_eligible`; no Google code/weights in-repo (harvest discipline).

**Open follow-ups:** staging live smoke against a real MedGemma endpoint (operator supplies `HEYDOC_MEDGEMMA_ENDPOINT` + key; synthetic packets only) + confirm the served request/response shape (OpenAI-compatible default; Vertex-native is a deploy adapter concern).

---

## L3L4 — Live LLM Step-4 adapter (the model enters the loop, behind bars) + sequencer graduation with the structured STOP halt (2026-07-11)

**Status:** `npm test` **43/43** green (42 prior + `contract-llm-adapter`; `contract-sequencer` extended for graduation + HALT RULE 5); `security:secrets` PASS; `licence:check` 0 blocks; `verification` Pass:true; `trunk:stub:all` 9/9; `eval:cases` PASS; `bench:mirage` OK; `npm audit` 0. RETAIN core **byte-unchanged** (CI pin). Plan: `.planning/LIVE_PLAN.md` L3 + L4 (operator-approved). **Nothing patient-facing; nothing sets patient_eligible; mock remains the default everywhere.**

### L3 — `integration/llm-adapter.js` [NEW] + pipeline Step-4 hook [~, additive]
- **The packet-only bar is mechanical and default-deny:** `generateCandidate()` re-gates its input through the strict `validateContextPacket` zod contract and serialises EXACTLY the parsed object into the user message; a smuggled field outside the contract REFUSES generation before any transport call (spy-proven). System prompt = the trunk's versioned prompt file + a fixed grounding preamble (no minted codes/doses/facts; BLOCKED_NO_PROOF over supplied claims; draft-for-clinician only).
- **Fail-closed everywhere:** invalid packet, missing trunk prompt, live-enabled-without-key, API error/timeout, **safety refusal (`stop_reason: "refusal"`)**, empty output, and `max_tokens` truncation all yield `BLOCKED_NO_PROOF`; the pipeline converts that into `continuation_blocked` + an explicit blocked candidate — a missing draft is a blocked status, never a fabricated one. SDK default retries (2× on 429/5xx) are the only retries.
- **Mock by default, rollback intact:** live requires `HEYDOC_LLM_LIVE` AND a key resolvable through the fail-closed secrets seam (placeholders refuse); mock generation is deterministic and audited `mode:"mock"` — never presented as live.
- **Medicolegal audit:** `result.generation` carries mode, model id (pinned default `claude-opus-4-8`, adaptive thinking; `HEYDOC_LLM_MODEL`/`HEYDOC_LLM_MAX_TOKENS`/`HEYDOC_LLM_TIMEOUT_MS` overrides), `prompt_sha256` over the exact bytes shown to the model, and latency — generated output is reproducible the same way `candidate_output_hash` makes it attributable.
- **The gate applies to generated text exactly as to stub text:** a clean grounded fake-live draft passes end-to-end; a dose-leaking generated draft is blocked by the composed detectors (contract-proven). No hook ⇒ byte-identical status quo (`generation: null`).
- **Dependency:** `@anthropic-ai/sdk` ^0.111.0 (MIT), adopted at its LIVE_PLAN §7 gate; lockfile-pinned; `npm audit` 0.

### L4 — `integration/trunk-sequencer.js` [~] graduation
- **DEFAULT ON:** `HEYDOC_SEQUENCER` unset ⇒ the outer loop runs; explicit `0`/`off`/`false` — or any unrecognised value, failing toward the known-good single-trunk status quo — is the rollback (all contract-tested).
- **HALT RULE 5 [NEW, additive]:** a structured PPP-TTT STOP (`verification.ppp_ttt.tier === "STOP"`) halts the sequence with the graded-triage reason, checked before rule 4 so the halt names the clinical grading — defence in depth on top of the `escalate_now` text (rule 3) and `pass:false` (rule 4) halts a STOP already triggers. **Closes PPP-TTT plan Step 2.**
- **Wiring:** per-trunk PPP-TTT triage inputs (`triageByTrunk`) and the L3 packet-only generation hook (`generateCandidate`, used only when no fixed output exists) pass through `runTrunkWithGrounding` (which now also returns the exact candidate text + generation audit); rule-3 escalation detection scans in-pipeline generated text. Halt rules 1–4 re-proven unchanged.

**Register [~]:** `live-llm-generation-adapter-unbuilt` → **PARTIAL** (adapter built + contract-proven; staging live smoke input-gated on the operator's API key — R-32 updated); `sequencer-default-off` → **resolved** (COMPLETE).

**Invariants held:** frozen core byte-unchanged; LLM-vs-deterministic-truth boundary now mechanically enforced at Step 4 (strict packet re-gate) AND Step 5 (frozen verifier + detectors unchanged); no autonomous diagnosis/prescription (generated text passes the same bars); every halt unconditional; fail-safe defaults throughout; mock never presented as live.

**Open follow-ups (per LIVE_PLAN):** staging live smoke of the adapter (operator supplies `ANTHROPIC_API_KEY`; synthetic packets only) + trunk-prompt tuning against real generations; then the eval-gate under-triage alarm call-site (L10), Track-B operator inputs (L5–L9, L13), and the L11 product surface.

---

## LIVE — LIVE_PLAN approved; L1 Portal UI/workflow + durable gate records; L2 runtime/secrets/metrics/CI hardening (2026-07-11)

**Status:** `npm test` **42/42** green (40 prior + `contract-portal-review`, `contract-live-ops`); `security:secrets` PASS (new BLOCKING CI gate, 2669 files/0 findings); `verification` Pass:true; `trunk:stub:all` 9/9; `licence:check` 0 blocks; `eval:cases` PASS; `bench:mirage` OK; `npm audit` 0. Plan: `.planning/LIVE_PLAN.md` (operator approved the master plan + L1/L2 commencement 2026-07-11). RETAIN core **byte-unchanged** (CI-pinned). **Nothing patient-facing opened; nothing sets patient_eligible.**

### LIVE_PLAN (Phase-0 + approval record)
Master plan for public release: 15 dependency-ordered workstreams in two tracks (engineering-now vs operator-input-gated), the four release blockers, the default-settings matrix (mock/staging/production), evaluation thresholds as the final arbiter, and the operator-input checklist (vendor, NCTS/RF2, attestations, WORM backend, TGA ruling, GO/NO-GO). Phase-0 scan opened 11 items; the 9 High/Critical promoted → gap-register **R-32…R-40**.

### L1 — Clinician Verification Portal: review console + durable gate records (release blocker #2, UI/storage half)
- **`portal/server.js` [NEW]** — dependency-free (node:http, server-rendered, no build step) clinician review console: queue (live `submitForReview()` + POST /submit, plus ledger/content-store items), review workspace (exact output bytes, five checks + surfaced detector/triage findings, receipts, evidence claims, firewall status, **PPP-TTT verdict + ABCDE safety-net**), decision form (approve/reject/amend + signature_ref + notes). Auth FAIL-CLOSED: live-enforced mode refuses to start without `HEYDOC_PORTAL_TOKEN` (resolved via the secrets seam); bearer on every console route; XSS-escaped rendering (contract-tested). **The portal never releases anything** — it permits the frozen gate to permit.
- **`portal/review-bundle.js` + `mcp/schemas/portal-review-bundle.schema.json` [NEW]** — the review workspace as a hashed contract: `bundle_sha256` over what the reviewer was SHOWN, recorded with the decision (tamper-evident review provenance).
- **`portal/gate-record-store.js` [NEW]** — DURABLE-FIRST, append-only, hash-chained gate-record trail (`gate-records.jsonl`) with the M8-style substrate seam (`registerGateRecordSubstrate`; non-local unregistered REFUSES); `hydrateGateRegistry()` replays the durable chain into the FROZEN gate's in-memory registry across restarts (idempotent). `portal/verification-gate.js` byte-unchanged.
- **PPP-TTT ledger wiring [~]** — both report writers (`verification/run.js`, `integration/trunk-pipeline.js`) now append `ledgerCoreFromRecord(result.abcde_record)` alongside `recordRun()`; `runTrunkWithGrounding` passes `raisedFlags/patientAnswers/abcdeInput` through (closes `ppp-ttt-ledger-wiring`).
- **`test/contract-portal-review.js` [NEW]** — end-to-end decision→durable-chain→hydrate→`releaseToPatient()` round-trip: mock refuses even approved; live releases ONLY exact attested bytes; amend switches to the amended text; reject kills; tamper breaks the chain; 401 without token; live portal without token refuses to start; no `patient_eligible` reference (static).

### L2 — Runtime, secrets, observability, CI hardening
- **`integration/secrets.js` [NEW]** — fail-closed secrets seam: env backend default; unregistered scheme REFUSES (no silent fallback); missing/empty REFUSES; `example.invalid` placeholders REFUSED as credentials; values never logged.
- **`verification/metrics.js` [NEW]** — charter metrics (runs/pass/fail, HARD_FAIL, BLOCKED_NO_PROOF, PPP-TTT tier counts, derived rates) recorded by both writers (observability only, never a gate change) + alarm seam (`onAlarm`/`raiseAlarm`, structured stderr): HARD_FAIL → `pharmacology_hard_fail`; `critical_under_triage` channel for the eval layer; `/metrics` on the portal. STOP is counted, not paged (over-triage is the system working).
- **`Dockerfile` + `.dockerignore` + `docker-compose.yml` + `deploy/{README.md,register-substrates.example.mjs}` [NEW]** — runtime image (node:20-alpine, lockfile-only, mock default, `/data` volume so ledgers outlive containers); compose (staging must supply the portal token); deploy bootstrap example registering WORM/gate-record/secrets backends BEFORE start (placeholders the secrets seam refuses).
- **`scripts/check-secrets.mjs` [NEW] + CI [~]** — first-party deterministic secret scan (private-key blocks, AWS/GitHub/Anthropic/Slack/Google tokens, signed JWTs; tracked files; never echoes values), **BLOCKING** in CI as `security:secrets`; pattern teeth self-tested. Org-grade SAST = operator tool choice (R-38 remainder).
- **`test/contract-live-ops.js` [NEW]** — secrets fail-closed matrix; metrics/alarms on real pipeline runs (incl. a receipt-backed HARD_FAIL); writer-wired PPP-TTT ledger append; scanner green + self-test.

**Register [~]:** `ppp-ttt-ledger-wiring` → **resolved**; `clinician-verification-portal-unbuilt` narrowed (gate + UI/workflow + durable chained storage built; REMAINING: WORM registration R-39 + identity federation); `deployment-runtime-unbuilt` / `secrets-manager-integration-unbuilt` / `observability-metrics-unbuilt` / `ci-secret-scanning-sast-missing` → **PARTIAL** (engineering halves done; deploy/operator halves named).

**Invariants held:** frozen core byte-unchanged (CI pin green); portal never sends; human sign-off is the product spine; hashing extended (bundle_sha256 = review provenance); fail-closed everywhere new (portal auth, substrates, secrets); mock never presented as live; no scoring-store access; no `patient_eligible` anywhere (static + tested).

**Open follow-ups (per LIVE_PLAN):** L3 live-LLM adapter (next engineering-critical item) · L4 sequencer graduation · WORM adapter + retention (R-39, operator backend) · staging deploy job (operator cloud) · SAST choice (operator) · under-triage alarm call-site in the eval gate (L10) · Track-B operator inputs (L5–L9, L13).

---

## PPP — PPP-TTT graded triage: GO/CAUTION/STOP as a monotone-AND layer (Step 1) (2026-07-11)

**Status:** `npm test` **40/40** green (37 prior + `contract-ppp-ttt`, `contract-ppp-ttt-monotone`, `contract-ppp-ttt-ledger`); `verification` Pass:true; `trunk:stub:all` 9/9; `licence:check` PASS (0 blocks — 100% first-party, no manifest row); `eval:cases` PASS (301 attested, 0 failures — the gate does not exercise the pipeline seam); `bench:mirage` OK; `npm audit` 0. Plan: `.planning/PPP-TTT-PLAN.md` (operator-approved; Step 1 only — Steps 2–4 remain gated). **Additive, non-patient-facing, mock-by-default; nothing sets the patient-eligibility flag.**

### Change
- **`verification/ppp-ttt/` [NEW]** — a raised safety flag is no longer binary (halt-or-nothing): `gradeConcern()` interrogates it against the clinician-attested `scope-registry.json` v1.3.0 discriminators (read-only, version-pinned, sha256 dataset receipt; deterministic IDs `uhao-N`/`<cond>-cs-N`/`<cond>-refer-1`) and returns **STOP / CAUTION / GO**. STOP = the existing hard behaviour made explicit (always_immediate, safeguarding_always_report w/ mandatory_report, any confirmed stigma, and **every default-deny branch**: unknown/unanswered discriminator, off-registry or managed-only condition, unattested/TBD discriminator, registry drift, malformed input, module error — `gradeConcern` cannot throw). CAUTION (the only new state: stigmata attested-absent + stable `refer_if` form present) runs the fixed **ABCDE** protocol (`abcde/a–e.js`, discrete pure modules): A re-checks residual discriminators (any open → STOP), B selects the pathway (proceed→continue_with_safety_net; decline/undecided→refer — **no autonomous continuation**), C emits exactly one provisionality statement + the fixed "No diagnosis / No decisions" declarations (schema-literal true), D builds safety-net descriptors from the attested stigmata texts (tier vocabulary by NAME only — scoring node 13 never read, statically asserted), E records the bounded potestative choice (`subordinate_to_signoff` + `potestative_scope:"continued_passage_only"` schema-literals; decline never changes the tier; red flag mid-ABCDE → STOP).
- **`composeTriage()` — monotone-AND (H2 `combineVerification` pattern, exactly):** `results[]` stays the 5 verifier checks (report-schema `.strict()` still validates); `pass` = base AND tier≠STOP (never rescues); reported `run_tier` = ordinal max vs the base (never downgrades); STOP reasons appended to `missing_receipts` **carrying the literal `escalate_now` token** so the UNTOUCHED sequencer halts via existing HALT RULES 3/4 (Seam B — zero sequencer edits); structured triage rides the new in-memory `ppp_ttt` field (never passed to validateReport).
- **`verification/pipeline.js` [~, additive]** — +1 import, +1 gated block after `combineVerification` (runs ONLY when a caller passes `raised_flags`; without them the pipeline is behaviour-identical — contract-tested); result gains audit-channel `ppp_ttt` + `abcde_record` (like `fact_provenance`; **never** the ContextPacket — packet byte-identity contract-tested with/without flags).
- **`mcp/schemas/ppp-ttt-{verdict,abcde-record,ledger-entry}.schema.json` [NEW] + zod mirrors** (`verdict-schema.js`, `abcde-schema.js`, `ledger-schema.js`, all `.strict()`) — the ABCDE record is self-describing (`_pppTtt` header) and Digital-Tablet-tagged (`urn:au:digital-tablet` / `ppp-ttt-v1`); composition-section LOINCs (51848-0/18776-5) **proven from the pinned omnibus** via `verification/omnibus.js`, withheld if unprovable; **no SNOMED minted** (statically asserted; optional bindings may only ever come from terminology receipts).
- **`verification/ppp-ttt/ledger.js` [NEW]** — parallel append-only hash-chained PPP-TTT trail (`.heydoc-data/ppp-ttt-ledger.jsonl`): audit-store PATTERN reused (canonical JSON, `entry_hash = sha256(canonical+prev)`, `verifyPppTttChain`), **frozen `audit-store.js` untouched**; entries PHI-free by construction (IDs/enums only, strict schema refuses free text — contract-tested); `mode` via `normaliseMode` (no new mock-as-live seam); cross-linked to the main ledger by `{run_id, candidate_output_hash, trunk_id}` (join contract-tested, both chains independently valid).
- **`test/contract-ppp-ttt-monotone.js` [NEW — load-bearing]** — **the repo's first mechanical byte-unchanged CI gate**: pins the sha256 of `verifier.js`, `portal/verification-gate.js`, `audit-store.js` (any edit reddens CI); proves never-rescue/never-downgrade (fixtures + 200-case fuzz), STOP⇒pass:false+`escalate_now`, report-schema validity, pipeline additivity, default-deny (8 adversarial inputs), and **no scoring-store read path / no patient_eligible reference** (static scan of the module tree). `contract-ppp-ttt.js` covers the §6 edge-case table; `contract-ppp-ttt-ledger.js` covers chain/tamper/PHI/cross-link. `package.json` [~] test line.
- **`data/scope-registry.json` [NEW, vendored]** — the tracked, pinned v1.3.0 snapshot of the operator's attested scope registry (byte-identical copy; sha256 `2f4cb232…`), vendored the same way `data/digital_tablet_omnibus.json` is, because the operator's source lives under gitignored-sensitive `Projects/` and is absent in CI (first CI run caught this — ENOENT). `discriminators.js` reads ONLY the vendored snapshot; a registry update is a clinician-attestation event (re-vendor + bump `PINNED_SCOPE_REGISTRY_VERSION` under an approved plan; drift fails closed).
- **Register [~]** — NEW `ppp-ttt-graded-triage` (COMPLETE, Medium, pf:false — below gap-register promotion threshold, noted per one-way reconciliation). No BLIND_STUB/DEAD_END opened.

**Invariants held:** RETAIN core byte-unchanged (now CI-pinned); no autonomous diagnosis/prescription (C-PP literals; no dose source touched; Trunk 8.0 firewall path untouched); no fabricated codes (LOINC proven from omnibus, SNOMED never minted); HARD_FAIL non-override unchanged (a failing base can never be rescued); scoring-store firewall intact (statically asserted); emergencies non-overridable (STOP terminal + absorbing, ordinal max); patient choice bounded to CAUTION and subordinate to sign-off; fail-safe default BLOCKED-equivalent (fail-closed STOP); hashing preserved (record + both ledgers anchor to `candidate_output_hash`).

**Open follow-ups (plan-gated):** Step 2 sequencer structured-tier halt rule (only if `HEYDOC_SEQUENCER` graduates); Step 3 patient-facing E-PP surface (behind mode-normaliser + `releaseToPatient()`); Step 4 clinician attestation of any `discriminator_status` field; ledger-append wiring into the report writers.

---

## HIST — Structured self-disclosed history capture + AUCDI encounter summary (2026-07-11)

**Status:** `npm test` **37/37** green (36 prior + `contract-history-summary`); `npm run verification` Pass:true; `trunk:stub:all` 9/9; `licence:check` PASS; `eval:cases` PASS (301 attested, 0 failures). Operator rulings baked in (2026-07-11): **(1) vitals quarantine LIFTED under the string-preserving sanitiser policy** (charter `<data_handling>` open follow-up reconciled in CLAUDE.md); **(2) provenance stamps live at the FACT layer only** (no case-schema change, no migration, no kit rebuild); **(3) AUCDI-aligned encounter summary built now**. ⚠️ **This change deliberately alters the LLM-visible packet** (unlike OMNI): one history blob fact → per-item facts, plus vitals facts — all patient-voice strings.

### Change
- **`mcp/schemas/context-packet.schema.json` [~] + `pipeline-schemas.js` [~]** — facts gain optional `provenance` (the five patient-source channels) + `verified`; NEW **mechanical bar** in the packet zod gate: a patient-provenance fact may NEVER carry category `lab_result` (patient data cannot masquerade as laboratory data).
- **`verification/context-allowlist.js` [~]** — `history_as_reported` now SPLITS per item: each disclosed condition (`past_history`), medication (`medication`), allergy (`allergy`), family-history item (`family_history`), plus `symptom_narrative` (`symptom`) and `social_history_volunteered` (`social_history`) becomes its own packet fact — value composed ONLY from the item's as-stated string fields (patient voice, never interpretation), every case-derived fact stamped `provenance` + `verified:false`. Unknown history sub-fields rejected by name (default-deny inside the object). **Vitals quarantine REMOVED**: `objective_data_offered[]` flows per item as `vital_sign`, value = `"<type>: <patient-stated string>"` verbatim, provenance = the item's DECLARED source — no source, no injection (withheld, never defaulted). `factProvenance` anchors now ride per entry (Condition / MedicationRequest / AllergyIntolerance / FamilyMemberHistory / SDOH / Observation), so omnibus provenance + consult tags attach per condition, not per blob. Firewall semantics unchanged: allow-list still default-deny, sealed nodes still throw, 02 exchange material still never becomes facts.
- **`mcp/schemas/patient-history-summary.schema.json` [NEW] + `verification/history-summary.js` [NEW]** — the AUCDI-aligned encounter history summary: deterministic, schema-gated (zod + JSON schema in lockstep), grouped by standardised history-taking section (demographics / presenting symptoms / conditions / medications / allergies / family / social / vitals offered), every entry `{as_stated verbatim, provenance, verified:false (schema-const), fhir_path, taxonomy_tags?}`, a **schema-const unverified-disclosure disclaimer**, the pinned omnibus dataset receipt, and a `summary_sha256` over exactly what the clinician is shown. AU Core structural conformance (vendored 2.0.1-ci snapshot via the fhir-broker validator) recorded **advisory-only** on condition/medication/allergy entries. **Boundaries:** clinician-facing (portal reviewer + evidence_tree) — NEVER injected into a packet; encounter-scoped and memory-only (persistence stays a gated Critical). `pipeline.js` [~] returns it as `result.history_summary`; `run.js` [~] renders it in `evidence_tree.md`.
- **`CLAUDE.md` [~]** — `<data_handling>` open follow-up replaced with the recorded sanitiser ruling. **`test/contract-history-summary.js` [NEW]** + `contract-context-allowlist.js` [~] updated (quarantine-lift assertions, per-item counts, provenance stamps, mechanical-bar refusal). `package.json` [~] test line.
- **Register [~]** — `objective-data-offered-sanitiser-policy` (open, **pf:true**) → **resolved** (ruling recorded); NEW `history-granularity-blob-fact` + `patient-history-summary-unbuilt` opened by this cycle's scan and **resolved** by HIST-2/HIST-3.

**Invariants held:** codes still receipt-gated (patient words carry no codes; summary `.text` only); dose-guidance source unchanged (a patient-stated med/dose is an encounter fact; PharmCheck remains the sole dose source; verifier untouched); no raw lab numbers (strings only; `vital_sign` ≠ `lab_result` now mechanical); scoring-store firewall intact; hashing extended (summary_sha256).

**Open follow-ups (plan-gated):** portal UI consumption of `history_summary` (portal remains the Critical release blocker); sensitivity warn→block promotion; terminology receipt-binding of patient-stated conditions at Trunk 7.0 (candidate-code workflow).

---

## OMNI — Digital Tablet omnibus incorporated into the live build (2026-07-11)

**Status:** `npm test` **36/36** green (34 prior + `contract-omnibus` + `contract-consult-tagger`); `npm run verification` Pass:true; `npm run trunk:stub:all` 9/9; `npm run eval:cases` PASS (301 attested unchanged, 0 failures); `npm run cases:verify-codes` 0 failures. Operator rulings baked in (2026-07-11): **(1) tags are AUDIT/SCORER-side only — the LLM-visible ContextPacket is byte-identical** (contract-tested, not prose); **(2) field-map backfill re-hashes with the original attestation carried forward** (manifest records why); **(3) sensitive tiers block on the new tagging path, warn-only on existing paths**.

### Change
- **`verification/omnibus.js` [NEW]** — dataset discipline for `data/digital_tablet_omnibus.json` (trust-boundary-3): pinned sha256 + `omnibusDatasetReceipt()` (structured_dataset, mode always mock — a repo dataset never presents as live); `resolveOmnibusPath` (proof-based, unresolvable → reject, never guess); `assertSpoilerSafePath` (mechanical: `example_*` segments and ClinicalImpression/RiskAssessment roots THROW — the omnibus's worked-example paths can name diagnoses); `omnibusSubtree` + `sensitiveFieldTiers` accessors so consumers read the pinned document.
- **`verification/context-allowlist.js` [~]** — packet rules gain `omnibus_path` const anchors (mirror of the 01 schema's `digital_tablet_field_map` consts) + new `factProvenance()` export: audit-channel companion to `injectableFacts` (same numbering, shared selection helper — they cannot disagree), every path proven via `provenPath`. **Allow/deny rules unchanged**; the field map itself stays default-denied from injection.
- **`verification/consult-tagger.js` [NEW]** — deterministic FreeText_Taxonomy tagging (character_quality vocabulary read from the pinned omnibus; NRS severity, radiation, temporal, negation rules) + `classifySensitivity` (omnibus 4-tier vocabulary). Tier ≥2 on the new path → NO tags, an auditable `withheld` marker (default-deny). `sensitivityWarnings` = warn-only observability for existing paths (stderr JSON + result counter, never a gate change; promotion to blocking is a later gated step). Tags are advisory audit metadata — they never gate.
- **`verification/pipeline.js` [~]** — audit-channel block after packet assembly: on case runs, builds `result.fact_provenance` = { dataset_receipt, EvidenceNode-shaped provenance (zod-validated; `fhir_path` + `taxonomy_tags`), tag_withheld } — rides the RESULT, never merged into the packet (H6 additive-only precedent; frozen ledger contract untouched). `verification/run.js` [~] renders it into `evidence_tree.md` when present.
- **`mcp/schemas/evidence-node.schema.json` [~] + `verification/pipeline-schemas.js` [~]** — additive optional `taxonomy_tags[]` (group/tag/matched, strict), JSON schema and zod in lockstep.
- **`scripts/backfill-field-maps.mjs` [NEW, run once]** — added the schema-const `digital_tablet_field_map` to the 143 unmapped cases (now **303/303 mapped**): consts read from the 01 schema itself and proven against the omnibus before writing; conditional keys only where the case has the content; 01 re-validated (ajv 2020-12); manifest 01 hash recomputed + `field_map_backfill` block (sha256 before/after, omnibus dataset ref, attestation-carried-forward statement). Pre-checked every on-disk 01 against its manifest hash first (all 143 clean). **Sealed 10–13 never opened.** Reference case (pre-ingest, already mapped) untouched.
- **`test/contract-omnibus.js` + `test/contract-consult-tagger.js` [NEW]** — receipt shape; path resolution + spoiler gate (fixture proves the spoiler path RESOLVES, i.e. the hazard is real); provenance fact_id alignment; deterministic tagging; tier default-deny + warn-only; **end-to-end packet-stability check** (no `fhir_path`/`taxonomy_tags` on packet facts, no `prov-*` node in packet.evidence, stable across runs); verification gate unaffected. Both in `npm test`.
- **Register [~]** — `fhir-path-hooks-unwired` (DEAD_END), `freetext-taxonomy-unconsumed` (ORPHAN), `omnibus-dataset-unversioned` (PARTIAL) opened by the 2026-07-11 omnibus scan and **resolved** this cycle; all Medium (below gap-register promotion threshold — noted here per one-way reconciliation). Kit NOT rebuilt — all four embedded sources byte-unchanged (`evidence-node.schema.json` is not kit-embedded).

**Open follow-ups (plan-gated):** promotion of the sensitivity warn-path to blocking; `objective_data_offered` provenance activates automatically only when its quarantine lifts (anchor already in place); LLM-visible structural tags remain OFF per operator ruling.

---

## FLOW_PLAN Milestone H7 — Governance wiring: every harvested path fail-closed to the portal gate (2026-07-07)

**Status:** `npm test` **34/34** green (29 prior + 5 new `contract-governance-*`); `npm run licence:check` PASS (0 blocks); `npm run verification` Pass:true; `npm run eval:cases` PASS; `npm run bench:mirage` PASS; `npm run trunk:stub:all` 9/9. **RETAIN core byte-unchanged** (`git diff --stat` empty for `portal/verification-gate.js`, `verification/audit-store.js`, `verification/verifier.js`). Exit state met: every harvested path routes through the portal gate and is REFUSED without a `VerificationGateRecord` on the exact `candidate_output_hash`; **nothing flipped `patient_eligible:true`; the gate stays fail-closed.** H7 is the LAST FLOW milestone.

**What H7 is (and is NOT):** it WIRES every harvested path (H1–H5) to the EXISTING M5 portal gate so each fail-closes without an attested gate record on the exact hash, and confirms the audit ledger (C5) records every harvested-path run (metadata-only, PHI-free). It does **NOT** open any patient-facing path and **CANNOT** flip `patient_eligible:true` — two prerequisites remain absent and out of H7 scope: (a) the Portal UI/workflow + WORM gate-record storage (ARCH M5 remainder, the Critical release blocker — a human must actually review and sign); (b) the MIRAGE corpus is a 23-item UNATTESTED draft (spec §7). The gate stays FAIL-CLOSED by design.

**The four-part patient-eligibility precondition (stated explicitly):** a retrieval path is patient-eligible ONLY when ALL of — (1) MIRAGE-passed (H3) AND (2) governance-gated (H7) AND (3) corpus attested (§7) AND (4) a real Portal UI gate record exists (ARCH M5 remainder). **H7 delivers exactly (2).** The other three remain open.

**Model routing (operator override):** gate-mapping + refusal logic across all paths (release-critical hard logic) — Fable 5; wiring + tests — Opus 4.8.

### Change
- **`portal/harvested-release.js` [NEW]** — the single fail-closed governance seam. `releaseHarvestedOutput(pathId, output)` validates `pathId` against a frozen 5-entry `HARVESTED_PATHS` allow-list (default-deny unknown), computes `hashCandidateOutput(output)` (the RETAIN hasher — never accepts a caller-supplied hash), and defers the ENTIRE decision to `releaseToPatient()` (RETAIN portal gate C9). Returns the gate verdict verbatim plus path/milestone attribution; **never returns or sets `patient_eligible`**. Fail-closed on unknown path or missing bytes.
- **Thin `governedRelease(output)` wrapper added to each harvested-path adapter** (one export each; no logic change to existing exports): `integration/record-sources/sources-client.js` (H1 `record-spine`), `mcp/servers/_shared/evidence-map.js` (H2 `evidence`, the seam all three #14/#15/#1 taps cross), `benchmark/mirage/index.js` (H3 `retrieval-mirage`), `case-factory/to-casebundle.js` (H4 `case-factory`), `mcp/servers/tooluniverse-gateway/tool-gateway.js` (H5 `tooluniverse`).
- **`test/governance-path-contract.js` [NEW]** — shared runner so every path is proven against the SAME criteria: CLOSED without a record (reason names mandatory clinician review); dev-mode (mock) refuses even WITH a record; opens ONLY with a **synthetic** attested record on the EXACT hash (no real clinician sign-off, no Portal UI); altered output refuses (hash recomputed); no `patient_eligible:true` on the verdict or the path's native flag; and the audit ledger records a harvested-path run PHI-free (append via the existing `appendEntry` to an **isolated temp ledger** — `HEYDOC_DATA_DIR`; unknown/PHI fields dropped; `.strict()` `validateLedgerEntry` refuses a PHI-bearing entry; `verifyChain()` intact). **`audit-store.js` internals not modified.**
- **`test/contract-governance-{record-spine,evidence,retrieval-mirage,case-factory,tooluniverse}.js` [NEW]** — one thin test per path; evidence/tooluniverse additionally assert their native `PATIENT_ELIGIBLE === false`; case-factory asserts a generated seed is `synthetic:true`.
- **`package.json` [~]** — the 5 governance suites added to `npm test`. **`.github/workflows/ci.yml` [~]** — note only (the governance suites run under `npm test`; no new job).
- **Docs [~]** — `integration-register.md` Step 7 + H7 note; `completeness-register.md` H7 scoped re-scan + NEW `governance-wiring-harvested-paths` (COMPLETE); `gap-register.md` FMEA **G7** mitigation recorded as wired-and-tested; this CHANGELOG.

**Integration discipline held (the crux of H7):** you WIRE to the existing gate, you do NOT rewrite it. `portal/verification-gate.js` and `verification/audit-store.js` are **byte-unchanged** (asserted). H6's `conflict_flagged` signal was **NOT** wired into any release decision (gate/halt semantics for conflict are future plan-gated work — H6 forward-note); H7 wires the EXISTING gate contract only. No harvested path has an alternate emission route: `governedRelease` is the sole H7-added release entry, and no production code calls it toward a patient (correct — no patient path exists; the seams are unreached and exist so that if one is ever built, the gate cannot be bypassed).

**Close-out (H7 is the last FLOW milestone) — what remains before ANY path could go patient-facing:** the Clinician Verification Portal UI/workflow + authenticated clinician identity/signature + durable WORM gate-record storage (ARCH M5 remainder + M8 substrate); MIRAGE corpus clinician attestation (§7) + volume top-up on live backends; ARCH C22 (AU Core version-target decision); live runtimes/creds for fhir-broker/wso2, evidence taps, ToolUniverse (all input-gated); pharmacology live-vendor validation (M9) + investigation-parser reference-range sign-off (M10). Governance (H7) is now enforced across every path; the remaining blockers are org/regulatory/vendor inputs, not FLOW engineering.

---

## FLOW_PLAN Milestone H6 — Reasoning topology: conflict-audit trust mechanism (2026-07-07)

**Status:** `npm test` **29/29** green (incl. new `contract-conflict-audit`); `npm run licence:check` PASS (0 blocks); `npm run verification` Pass:true; `npm run eval:cases` PASS; `npm run bench:mirage` PASS; `npm run trunk:stub:all` 9/9. Exit state met: conflict-audit built **first-party** (no octochains code); additive/monotone proven; **trunk spine + verifier unchanged**; #5 recorded REFERENCE·methodology-only.

**D-1 OWNER RULING (2026-07-07, the H6 gate):** KEEP the tested trunk spine + verifier (ARCH_PLAN RETAIN); LIFT octochains' (#5) parallel-expert conflict-audit PATTERN into `verification/conflict-audit.js` as a trust mechanism; do NOT fork or adopt a new orchestrator (closes FLOW_PLAN input-disagreement D-1; FMEA G15 mitigated as designed).

**Licence condition honoured (strictest clean-room):** #5's licence is PENDING — its code was not wrapped, vendored, forked, copied, **or read** (H3 #20 / H1 fasten-sources precedents). The module implements the **published** parallel-expert-consensus methodology only. #3 Multi-Agent-Medical-Assistant and #2 Azure-Samples were read as **design references, README prose only** (design lessons: unresolved conflict escalates to the human gate; surface positions verbatim, never synthesise a winner). #4 MedicalCoderSwarm was not read (demo-grade shape ref).

**Model routing (operator override):** topology reasoning + conflict-audit design (hard logic) — Fable 5, executed directly (no sub-agent needed at this size).

### Change
- **`verification/conflict-audit.js` [NEW — first-party]** — `runConflictAudit(opinions, {question_ref?}) → ConflictRecord`: pure, deterministic (zod `.strict()` input/output; sha256 input-derived, order-independent `audit_id`), surfaces per-topic `agree`/`conflict`/`single_source` across N independent expert opinions with positions reported **verbatim** (never resolves — the human at the C9 gate does). Fail-safe posture: over-flag (any residual difference after trim/case/whitespace normalisation = conflict); <2 opinions → `INSUFFICIENT_PANEL`/`unassessable`; duplicate `expert_id` throws (a non-independent panel never part-audits). `attachConflictAudit(verification, record)` is **ADDITIVE-ONLY, NOT A GATE**: `pass`/`results[]`(= the five frozen checks, same reference)/`candidate_output_hash` pass through verbatim — cannot flip fail→pass **or** pass→fail; `missing_receipts` append-only surfacing (the H2 integrity-detectors channel — zero schema churn); structured record on the in-memory `conflict_audit` field; firewall fields neither read nor written — **a HARD_FAIL / BLOCKED_NO_PROOF can never be overridden, by construction**.
- **`test/contract-conflict-audit.js` [NEW] + `package.json` [~]** — 29th suite in `npm test` + CI (ci.yml unchanged — `npm test` covers it). Asserts: disagreement surfaced (2-vs-1 split, verbatim positions, case/whitespace normalise to agreement, single-source flagged); **cannot rescue a fail** (unanimous consensus never flips a failing verification); **not a gate** (a conflict flags but never fails a passing output; append-only); **no override** on real Trunk 8.0 `runPipeline()` runs (S8-no-PDMP HARD_FAIL + no-intent BLOCKED_NO_PROOF — `firewall_status`/`continuation_blocked`/`pass` all unchanged, so the sequencer's halt inputs are untouched); **verifier demonstrably unchanged** (verify() bit-identical on pass/fail/guideline vectors with the audit in play; five check names pinned in order); fail-safe panel semantics + determinism; a conflict-flagged verification still builds a schema-valid VerificationReport.
- **`integration/harvest-manifest.json` [~]** — #5 octochains: `PATTERN-LIFT → REFERENCE` (methodology-only), `target_module → null` (the first-party file can never read as a harvest target; BLOCK 2/3 no longer walk the row); notes record the D-1 ruling + clean-room build. #3/#2 notes record the H6 design-reference reads (prose only).
- **`docs/grounding/integration-register.md` [~]** — Step 6 mirror updated (#5 ⇩ REFERENCE·methodology-only) + H6 note block.
- **Registers [~]** — completeness-register: H6 scoped re-scan + NEW `conflict-audit-trust-signal` (COMPLETE, Medium, resolved); `.claude/completeness-index.md` synced. Gap-register: **no change** (a strengthening, not a gap — integrity-detectors precedent; below promotion threshold).

**Integration discipline held (the crux of H6):** `verifier.js` (C1 — five mechanical checks), `integration/trunk-sequencer.js` halt logic, `verification/pipeline.js`, and every trunk contract are **byte-untouched**. No new orchestrator exists. The conflict signal is readable by the verifier/sequencer (in-memory `conflict_audit` + the surfaced `missing_receipts` line); **acting** on it (gate/halt semantics for `conflict_flagged`) is future, separately plan-gated work, as is wiring a real parallel-expert opinion producer (nothing in the tree emits parallel opinions today — trunks are single-purpose by design; current consumer = the contract test, session-store precedent).

---

## FLOW_PLAN Milestone H5 — Capability expansion: ToolUniverse (2026-07-07)

**Status:** off `main` @ branch `h5-tooluniverse-gateway`. `npm test` **28/28** green (incl. new `contract-tooluniverse-gateway`); `npm run licence:check` PASS (0 blocks; **RCE-floor BLOCK 5 armed**); `npm run verification` Pass:true; `npm run eval:cases` PASS; `npm run bench:mirage` PASS; `npm run trunk:stub:all` 9/9. Exit state met: ToolUniverse (#28, Apache-2.0, pinned **v1.3.1 `9b7ff91d`** ≥ RCE floor v1.3.0) wrapped as a compact-mode gateway; the code executor **AND** the wider agentic/loader/compose families are **disabled and proven unreachable**; own auth; egress bounded and enforced; runtime input-gated (fail-safe). **The highest security surface in the harvest.**

**Model routing (operator override):** security-boundary design (executor unreachability, auth, egress, pin floor) — Fable 5; gateway wrap + tests — Opus 4.8.

### Security-boundary hardening (adversarial review → all fixed)
A single full-codebase adversarial security sub-agent (one at a time, per the rule) — plus an independent check against the pinned v1.3.1 source (2620 tools) — found the initial 3-name deny-list insufficient. Fixes, all locked by the contract test:
- **F1 (Critical) — indirect code execution bypassed the deny-list.** `MCPAutoLoaderTool` (spawns other MCP servers), `AgenticTool`/`SmolAgentTool`/`CallAgent`, `ComposeTool`/`*Pipeline`/`ToolGraph*`, `Replicate_run_prediction`, and the meta `ExecuteTool` reach the subprocess under a name blocklist. **Fix: DEFAULT-DENY** — `execute_tool` forwards ONLY vetted retrieval tools; executors + families + any un-vetted name are refused before any forward (proven by a spy asserted never-called even with valid auth + live context + the name force-allow-listed). Deny-list/shape-guard broadened as a belt behind it.
- **F2 (Critical) — egress allow-list was a dead control** (imported by nothing but its test). **Fix:** egress ENFORCED on the forward path — each vetted tool declares its upstream host, refused (`EGRESS_BLOCKED`/`EGRESS_UNKNOWN_HOST`) if off the declared allow-list; asserted THROUGH `executeTool`.
- **F3 (High) — live-as-mock:** mock context + runtime present forwarded a real call stamped `mode:"mock"` (the ledger would mis-classify it synthetic). **Fix:** dev/mock NEVER forwards to a real subprocess; execution requires an explicit live context.
- **F4 (Low) — `HEYDOC_MODE_DEFAULT=staging/production` threw at the zod enum.** **Fix:** `MODE` normalised through `verification/mode.js`.
- **Confirmed sound:** named-executor deny-list vs evasion (case/separator/unicode/zero-width), gate ordering (deny before auth before forward), auth (no unauthenticated path), `normaliseMode` fail-safe, and **BLOCK 5 semver** (numeric not lexical; prerelease → fail-closed; floor cannot be silently dropped).

### Change
- **`mcp/servers/tooluniverse-gateway/{tool-gateway,launch-spec,egress-allowlist,index}.js + fixtures/tool-catalogue.json + README.md` [NEW]** — the compact-mode gateway. `tool-gateway.js` is the pure, unit-tested security core (default-deny, hard-deny families, auth, routing, egress); `launch-spec.js` builds the SMCP launch spec (compact_mode + full executor/family exclude) + locates the runtime (null → fail-safe); `egress-allowlist.js` is the default-deny host boundary; `index.js` exposes the ≤5 core tools; the fixture drives discovery deterministically while the runtime is absent (metadata only, never a fabricated result).
- **`test/contract-tooluniverse-gateway.js` [NEW] + `package.json` [~]** — wired into `npm test` (28th suite). Adversarial: executor + family unreachable (incl. evasion variants, force-allow-listed, live+auth); default-deny; egress through `executeTool`; auth; no live-as-mock; Receipt emitted; `patient_eligible:false`; fail-safe absence.
- **`scripts/check-licence-clearance.mjs` [~] + `test/contract-harvest-manifest.js` [~]** — new **BLOCK 5** (RCE-floor pin): a row declaring `rce_floor` must be commit-pinned with a `pinned_version` ≥ floor (semver-gte, `versionMeetsFloor`). A sub-floor bump fails CI. Contract test covers at/above/equal/below-floor, unpinned, and no-`pinned_version`.
- **`integration/harvest-manifest.json` [~]** — #28 pinned `9b7ff91d` (v1.3.1, Apache-2.0 re-verified on-repo), `pin_status: pinned`, added `pinned_version: v1.3.1` + `rce_floor: v1.3.0`.
- **`mcp/mcpServers.template.json` [~]** — `tooluniverse-gateway` launch entry (`HEYDOC_TOOLUNIVERSE_CMD` empty → input-gated; auth + API token as **secrets-manager references**, never literals).
- **Registers [~]** — completeness-register: H5 scoped re-scan + new `tooluniverse-gateway` (PARTIAL) / `tooluniverse-runtime-input-gated` (PARTIAL); gap-register **R-30** (High); integration-register Step 5 #28 → WRAPPED.

**Honest exit / input-gated remainder.** No Python runtime here → live tool execution is input-gated (HEYDOC_TOOLUNIVERSE_CMD + keys + deploy egress policy), the subprocess `forward` seam is intentionally not wired (live path fail-safes), retrieval tools stay MIRAGE-gated (H3) + governance-gated (H7), `patient_eligible:false`. MedLog studied for the audit pattern only — no WORM built, `audit-store.js` untouched. **Structural note (review):** BLOCK 5 enforces the version floor, not the tool-surface diff — a future pin bump must re-reconcile the allow-list against the new tool manifest. **STOP condition honoured:** no path makes the executor reachable; the contract test going RED here is the stop signal.

---

## FLOW_PLAN Milestone H4 — Case factory (2026-07-06)

**Status:** off `main` @ `fcf42e5` (branch `feat/flow-h4-case-factory`). `npm test` **27/27** green (incl. new `contract-case-factory`); `npm run verification` Pass:true; `npm run trunk:stub:all` 9/9; `npm run licence:check` PASS (0 blocks; the 3 synthea repos no longer warn — pinned); `npm run eval:cases` PASS; `npm run bench:mirage` PASS. Exit state met: synthea + synthea-au (AU Core conformance-gated) + chatty-notes wrapped **out-of-process** (no Java vendored, fail-safe input-gated); the two-phase shaper emits contract-valid bundles that flow **through** the existing ingest (firewall + `--reseq` intact); placeholder 10–13 authored **from seed** (`clinician_reviewed:false`), never copied; synthetic-only asserted; a demo complex case moved the **raw** distribution (complex band 20→21).

**Decisions (operator, Phase-1 gate):** (1) wrappers + shaper with an **offline fixture test** — no Java runtime present, so live generation is input-gated (H1 fhir-live precedent); (2) **two-phase** scoring nodes — shaper emits 00/01/02 + a `10.primary_diagnosis.name` seed, a completion step authors schema-minimal draft 10–13; (3) generation weighted toward **complex/moderate, few 01** (the CONTRACT §8 "60/30/10" numeric target is inconsistent with its own "generate few straightforward" guidance — followed the guidance, treating 60/30/10 as the diagnosis-category target).

### Change
- **`case-factory/synthea/run-synthea.js`, `synthea-au/run-synthea-au.js`, `narratives/run-chatty-notes.js` [NEW]** — out-of-process CLI wrappers for #dir/#fork/#sib. No Java vendored; each **fail-safe** `{available:false, reason:"input-gated …"}` when the toolchain is absent — never fabricates. `synthea-au` gates output through the EXISTING fhir-broker AU Core conformance validator; `auCoreTarget()` flags the **C22** divergence (target 0.3.0 vs vendored 2.0.1-ci), never silently picks.
- **`case-factory/to-casebundle.js` [NEW]** — the shaper (CONTRACT §11). Maps Synthea FHIR + a chatty-notes narrative → Phase-A `caseseed` (00/01/02 + `_seed.primary_diagnosis_name`). **FAIL-CLOSED firewall**: throws if the full diagnosis name (or a `.txt`) leaks into injectable 01/02 text. Telehealth reprojection — patient-obtainable objective data as strings only.
- **`case-factory/complete-scoring-nodes.js` [NEW]** — Phase B (two-phase, CONTRACT §5). Authors schema-minimal DRAFT 10–13 **from the seed** (10.primary_diagnosis.name = seed; 11–13 stubs), `clinician_reviewed:false`; emits `files[].path`, all `sha256:null`, codes `unverified_pending_terminology_receipt`, `synthetic:true`. **Never opens an existing sealed node.**
- **`case-factory/generate-from-fixture.js` + `fixtures/complex-chf.{fhir,narrative,profile}.json` [NEW]** — reproducible offline driver + a committed synthetic complex-tier (multi_morbidity_complex) AU-Core fixture.
- **`test/contract-case-factory.js` [NEW] + `package.json` [~]** — wired into `npm test`. Asserts: AU Core conformant; `ingest --dry-run` 0 problems/0 leaks (isolated `--out`); `synthetic:true` + `clinician_reviewed:false`; honesty gate (files `path`/null, codes unverified); firewall fail-closed; writes nothing to `data/cases/`; source never reads a sealed node.
- **`integration/harvest-manifest.json` [~]** — pinned #dir-synthea `2b0a55ba`, #fork-synthea-at `4647221f`, #sib-chatty-notes `a767a579` (all Apache-2.0 re-verified on-repo); `pin_status` → `pinned`.
- **`docs/case-authoring/CASEBUNDLE-SHAPING-CONTRACT.md` [~]** — **DRIFT corrected (Phase 0, tool wins):** §6 manifest `files[].node` → `files[].path` (the live ingest fills hashes by `path`; `node` would silently write null hashes). Drift note added.
- **`data/cases/SPEC-CARD-06-00000/` [NEW]** — one demo complex-tier candidate admitted via `cases:ingest --reseq` (`clinician_reviewed:false`; codes receipted to `mock_verified_pending_live_ncts`). Raw complex band 20→21; **excluded from the trusted set** (attestation-gated).
- **`.gitignore` [~]** — ignore `*.casebundle.json`, `*.caseseed.json`, `case-factory/out/` (transport artifacts, never under `data/cases/`).
- **Registers [~]** — completeness-register: reconciled the stale "52 cases" → 303; new findings `case-factory-shaper` (PARTIAL) + `synthea-generators-input-gated` (PARTIAL, both Medium, non-shippable → below promotion threshold). gap-register R-23 + integration-register Step 4 updated.

**Honest exit / input-gated remainder.** No Java runtime here, so live volume generation and a *measurable* raw-distribution shift are input-gated on a Java runtime + the external distributions; the *trusted* distribution moves only after clinician attestation of the generated candidates. **C22 unsettled** (0.3.0 vs vendored 2.0.1-ci — flagged). **Rider deferred:** the docs-mock (#1) MIRAGE abstain-partition fix is out of H4 scope — spun off as `docs-mock-abstain-fix`.
## FLOW_PLAN H3 carry-forward — docs mock abstains on no-match (#1 abstain partition) (2026-07-06)

**Status:** off `main` @ `fcf42e5` (H3 rider deferred from H4). `npm run bench:mirage` OK (blocking gate green); `npm test` 26/26 green (incl. `contract-docs` unchanged); `npm run eval:cases` PASS; `npm run licence:check` PASS (0 blocks). Closes the H3 honest finding below: `#1 docs` now passes the MIRAGE **N (abstain) partition** on mock.

### Change
- **`mcp/servers/docs/index.js` [~]** — the `docs_search` **mock** branch is now a deterministic keyword retriever instead of an indiscriminate echo. A new `matchSnippets()` returns a snippet only when the query shares **≥ 2 distinct content tokens** (exact overlap, min length 3, stopwords dropped) with that snippet's indexed content (`title` + `excerpt` + `source_id`; not `version`); a no-match query returns `results: []` (abstain — `BLOCKED_NO_PROOF`-consistent). `docs_get` / `docs_cite`, the `dry_run` path, and the `docsLiveGuard()` live/blocked seam are **untouched**; the receipt shape for matched queries is preserved verbatim — so `test/contract-docs.js` ("back pain" → still retrieves + receipt) stays green.
- **`benchmark/mirage/corpora/docs.corpus.json`, `localisation.corpus.json` [~]** — prose-only reconciliation of `_note` / `answer_rationale` / `notes` that had asserted "the docs mock echoes citations regardless / does not abstain" (now false). **No gold field changed** (`question`, `partition`, `relevant_evidence`, `attested_by`, `correct_answer` all unchanged).
- **`benchmark/mirage/corpora/manifest.json` [~]** — provenance `checksum` re-synced to the new corpus content (`0f21d3d0…` → `475d80e2…`); `per_path` / `totals` unchanged (still 6 docs items incl. the shared `L`, 23 total).
- **`benchmark/mirage/scores/latest.json` [~]** — regenerated by `bench:mirage:run`.

### Measured (diagnostic, mock) — supersedes the H3 line for #1
- #1 docs: **P 2/2 (rate 1.00), N 2/2 abstain, A 1/1 no-dose, L abstain → would pass if attested.** (Was: N 0/2, would not pass.) Still `patient_eligible:false` — corpus unattested (§7) + H7 governance pending; MIRAGE-pass is necessary, not sufficient. #14/#15 unchanged.

### Registers
- **completeness-register:** `docs-override-live` (stays PARTIAL — live connect still input-gated) annotated: mock now abstains on no-match; MIRAGE `#1` N-partition passes on mock. `last_scanned` bumped.

### Safety / firewall
No §1 invariant weakened; **fail-safe strengthened** — an out-of-scope or fabrication-trap query now surfaces no citation (abstain) rather than an unrelated one. Hashing / receipt shape / mock-never-as-live guard untouched. Scoring-store firewall untouched (corpora are synthetic QA; nodes 10–13 never opened).

---

## FLOW_PLAN Milestone H3 — MIRAGE trust gate (first-party) (2026-07-06)

**Status:** off `main` @ `83c6318`. `npm run bench:mirage` OK (BLOCKING CI job wired); `npm run licence:check` PASS (0 blocks, **#20 now REFERENCE**, still exactly 1 pending-shippable = #18); `npm test` 26/26 green (incl. `contract-harvest-manifest` with the #20 edit); `npm run verification` Pass:true; `npm run eval:cases` PASS. Exit state met: first-party MIRAGE harness built (NO #20 code); synthetic first-tranche corpora built (no PHI, no scoring-node data); `bench-mirage-gate.js` blocking in CI; the three H2 paths measured; sub-threshold blocked (fixture-proved); #20 recorded reference-only; scores recorded to a separate benchmark artifact.

**Scope change honoured:** the original H3 said "build `benchmark/mirage/` FROM gzxiong/MedRAG #20." #20's licence is PENDING/unshippable, so — exactly like #18 — its code is **NOT** wrapped/vendored/forked. `benchmark/mirage/` is a **FIRST-PARTY clean-room** MIRAGE-*style* build (H1 fasten-sources precedent); #20 stays a published-**methodology REFERENCE only** (flipped ADOPT·BENCHMARK → REFERENCE·methodology-only in the manifest).

### Change
- **`benchmark/mirage/run-mirage.js` [NEW]** — the scorer. `runMirage(path, corpus)` → `{ path, score, per_question[], passed, … }` per `MIRAGE-CORPUS-SPEC §9`: P grounded-support **rate ≥ 0.60**; **N abstain-correct = 1.00** and **A invariant-hold = 1.00** as HARD gates (A reuses the `_shared/evidence-map.js` `assertNoDose` bar — same no-dose guard as #15); L diagnostic. Gates over **attested items only** (§7); `passed` never sets `patient_eligible` (H7-gated). Also emits a `diagnostic` block over all items (the honest mock measurement).
- **`benchmark/mirage/paths.js`, `mcp-client.js`, `key-normalise.js` [NEW]** — drives the three built paths as EXTERNAL stdio processes (mock default), **tags by Receipt `upstream`** (the harvested servers omit the `server` enum), normalises the evidence key from `supports[].excerpt` (#14/#15) / `citation_id` (#1). **§4 finding:** the stable key rides in the excerpt/citation locator (not `ref`, which is the receipt id) — no server change needed.
- **`benchmark/mirage/corpus-loader.js` [NEW]** — strict `§5` loader: zod `.strict`, firewall (rejects scoring-store provenance; never opens `data/cases`), question-only assertion (`§2.5/§11`), partition/relevant_evidence consistency, SHA-256 checksum (`§8`), attested/unattested counts.
- **`benchmark/mirage/index.js` [NEW]** — runner; writes `benchmark/mirage/scores/latest.json` (path scores + eligibility). The **audit ledger (C5) is NOT touched** — it is `.strict()` with no metadata slot and MIRAGE scores are benchmark metadata, not verification-run records; scores live in their own durable artifact + the registers (operator decision at the Phase-2 gate).
- **`benchmark/mirage/corpora/*.corpus.json` + `manifest.json` [NEW]** — v0.1.0 first-tranche DRAFT (23 items across #14/#15/#1 + shared L), authored to `MIRAGE-CORPUS-SPEC`, `synthetic:true`, **`attested_by:null` (unattested → non-gating)**, no PHI, not derived from `data/cases`.
- **`test/bench-mirage-gate.js` [NEW] + `.github/workflows/ci.yml` [~] + `package.json` [~]** — BLOCKING CI gate (`npm run bench:mirage`, step after `eval:cases`). RED on: corpus-acceptance failure, attested N-fabrication, attested A-dose-leak, silent pass with 0 attested evidence, or upstream-tag mismatch. Teeth proved by in-memory fixtures (above-threshold pass; sub-threshold blocked; N-fabrication fail; A dose-leak fail; unattested excluded; question-only rejection).
- **`integration/harvest-manifest.json` [~]** — **#20 gzxiong/MedRAG flipped ADOPT·BENCHMARK → REFERENCE·REFERENCE, target null, pin `na`, methodology-only note.** Keeps the URL + `do_not_conflate_with` so BLOCK 4 (MedRAG conflation vs SNOWTEAM2023) still holds. `licence:check` re-verified PASS.

### Measured (diagnostic, mock)
- #14 evidence-fda-pubmed: P 3/3 (rate 1.00), N 2/2 abstain, A 1/1 no-dose, L abstain → **would pass if attested**.
- #15 evidence-drug-guideline: P 3/3, N 2/2, **A 3/3 dose-elicitation held** (no-dose bar), L abstain → **would pass if attested**.
- #1 docs: P 2/2 but **N 0/2 (fails abstain)** — the docs mock echoes 2 canned citations for any query → **would not pass** (honest finding). A 1/1 no-dose.
- **All three `patient_eligible:false`** (corpus unattested + H7 pending). No path flipped to eligible — the invariant-safe outcome.

### Registers
- **completeness-register:** H3 scoped re-scan note; NEW `mirage-benchmark-gate` (COMPLETE); the three evidence items annotated with measured scores + eligibility-pending.
- **gap-register:** R-29 added (MIRAGE trust gate built + BLOCKING; corpus attestation input-gated).
- **integration-register:** Step 3 #20 → REFERENCE·methodology-only + H3 note.

### Safety / firewall
No §1 invariant weakened; **evidence-verified-trust STRENGTHENED** — trust is now measured, not assumed. **Dose source singular** — A partition + the reused `assertNoDose` bar make a dose-leak a hard-gate failure; #15/pharmacology firewall untouched. **Licence floor** — #20 code NOT wrapped (reference-only); `benchmark/` non-shippable so the gate does not walk it; no pending-licence repo wrapped. **No path made patient-facing** — eligibility stays governance-gated (H7) AND attestation-gated (§7). **Scoring-store firewall** — the loader reads only `benchmark/mirage/corpora`; scoring nodes 10–13 never opened; corpora independent synthetic QA. Ledger frozen (untouched). 26 suites + all CI gates green.

---

## FLOW_PLAN Milestone H2 — evidence taps (licence-clear subset) (2026-07-06)

**Status:** Off `main` @ `897e5e5`. `npm test` 26/26 green (3 new: `contract-evidence-fda-pubmed.js`, `contract-evidence-drug-guideline.js`, `contract-integrity-detectors.js`); `npm run licence:check` PASS (0 blocks, **still refuses #18**); `npm run verification` Pass:true; `npm run trunk:stub:all` green; `npm run eval:cases` PASS (pre-existing distribution-skew warning only). Exit state met: #1/#14/#15 wrapped behind `evidence_search`→EvidenceNode with Receipts; #15 advisory/no-dose enforced + adversarially tested; #8 detectors strengthen the verifier; #9 guardrail-spec written; #18 deferred-on-licence (gate refuses it); all evidence paths mock-gated / `patient_eligible:false` pending H3/MIRAGE.

### Change
- **`mcp/servers/_shared/evidence-map.js` [NEW]** — the safety seam: `toEvidenceNode()` maps every result onto the EXISTING `evidence-node.schema.json` (`supports[].kind:"live_data_receipt"`, `ref`=Receipt.request_id — NO schema churn; the `literature`/`graded_evidence` kinds in FLOW_PLAN prose do not exist and were not added); `assertNoDose()` fail-closed dose-shaped-key guard (G9); `PATIENT_ELIGIBLE=false`.
- **`mcp/servers/evidence-fda-pubmed/{index.js,live-backend.js}` [NEW]** — #14 Cicatriiz (MIT, pinned `1c4c40c3`) mock-core `evidence_search` (FDA/PubMed/ClinicalTrials/ICD-10); common Receipt (the 7-only `server` enum omitted, self-id via `upstream`); input-gated live seam, mock default+rollback, blocks in live w/o endpoint (C16).
- **`mcp/servers/evidence-drug-guideline/{index.js,live-backend.js}` [NEW]** — #15 JamesANZ (MIT, pinned `13d2fddd`), ADVISORY. Three-layer no-dose bar: `.strict()` result schema with `advisory:true` required + no dose field expressible; `assertNoDose()` on every result AND its EvidenceNode; advisory-framed claims. Pharmacology firewall (Trunk 8.0 PharmCheck) stays the sole dose source.
- **`mcp/servers/docs/{index.js,live-backend.js}` [OVR]** — #1 anthropics/healthcare (first_party, pinned `dff06a1b`). `live-backend.js` is the input-gated adapter AND the licence-gate marker; `index.js` gained `docsLiveGuard()` that diverts ONLY on a live context — mock/dry_run `docs_search/get/cite` + receipt shape preserved verbatim (`contract-docs.js` green unchanged). `evidence-cms/` (US CMS/NPI) deliberately NOT built (low AU priority).
- **`verification/integrity-detectors/{index.js,detectors.js}` [NEW] + `verification/pipeline.js` [~]** — #8 medsci-skills PATTERN-LIFT (no copied code, no runtime dep). Four pure detectors (advisory_dose_leak/critical, fabricated_citation_marker/fail, unsupported_statistic/fail, overconfident_diagnosis/warning) STRENGTHEN the frozen `verifier.js` via `combineVerification()` — a MONOTONE AND that keeps `results[]` = the 5 verifier checks (report contract unchanged; `validateReport` valid in `run.js` + `trunk-pipeline.js`), folds detector verdicts into `pass`, records failures in `missing_receipts`. Wired at the single `verify()` call site in `pipeline.js`; **verifier.js untouched**.
- **`docs/grounding/guardrail-spec.md` [NEW]** — #9 2023Anita evidence-first rulebook (G-1..G-11) as a WRITTEN spec, each rule mapped to its enforcement point. No code lifted/read/forked.
- **`integration/harvest-manifest.json` [~]** — #14/#15/#1 pinned to verified on-repo SHAs (`pin_status:pinned`); #18 kept `pending`/unpinned with a deferred-on-licence note (so BLOCK 3 refuses it). MIT-observed-but-deferred recorded honestly.
- **`test/contract-evidence-fda-pubmed.js`, `test/contract-evidence-drug-guideline.js`, `test/contract-integrity-detectors.js` [NEW]** — Receipt + EvidenceNode conformance (ajv vs the real schema); #15 adversarial no-dose (whole-payload + direct `assertNoDose`); detector monotonicity + composed-report validity + clean-stub regression. Appended to `npm test` (23→26). `.github/workflows/ci.yml` unchanged — the new suites run under the existing `npm test` step.

### Registers
- **completeness-register:** H2 scoped re-scan note added. NEW: `evidence-fda-pubmed-server` (PARTIAL), `evidence-drug-guideline-server` (PARTIAL, no-dose bar), `docs-override-live` (PARTIAL), `integrity-detectors` (COMPLETE), `evidence-graded-deferred` (UNBUILT, deferred-on-licence), `evidence-cms-deferred` (UNBUILT), `guardrail-spec-written` (COMPLETE). `harvest-confirm-licences-pending` narrowed (#14/#15/#1 cleared+pinned; #18 sole remaining shippable pending).
- **gap-register:** R-27 narrowed (H2 cleared #14/#15/#1; #18 deferred-on-licence, gate refuses it).
- **.claude:** `completeness-index.md` + `server-status.md` synced.

### Safety / firewall
No §1 invariant weakened. **Dose source singular** — #15 structurally barred from a dose (schema + `assertNoDose` + `advisory_dose_leak` detector); pharmacology firewall C2 untouched. **Licence floor** — only MIT/first-party wrapped as external pinned processes (no vendored code); #18 refused by the gate and left unbuilt. **Evidence-verified-trust** — every path `patient_eligible:false` until H3/MIRAGE (blocked on #20's licence); nothing trusted, nothing patient-facing. Verifier C1 unchanged and STRENGTHENED by detectors (monotone). No schema churn (mapped onto existing EvidenceNode/Receipt). Scoring-store firewall untouched (`data/cases/10–13` never read). Mock never presented as live (blocked route on live-without-endpoint).

---

## FLOW_PLAN Milestone H1 — patient-record spine (2026-07-06)

**Status:** Branch `feat/h1-patient-record-spine` (off `main` @ `7e435a3`). `npm test` 23/23 green (new `contract-fhir-live.js`); `npm run licence:check` PASS (0 blocks); `npm run verification` Pass:true. Exit state met: `contract-fhir-live.js` green; record ingest crosses parser + session-store; no raw lab exits; mock rollback intact.

### Change
- **`mcp/servers/fhir-broker/live-backend.js` [NEW]** — Node adapter to an EXTERNAL, commit-pinned `wso2/fhir-mcp-server` (#16, Apache-2.0, `6307fe71`, v0.10.0) over MCP streamable-HTTP. Maps onto the EXISTING `fhir_read`/`fhir_search` contract (`{resource}`/`{bundle}`); receipts `mode:live`; FAIL-SAFE to `null` on any transport/tool error (never a fabricated resource); `PUBLIC_SANDBOX_HOSTS` refused in production (mirrors the M11 terminology sandbox rule). No Python vendored; no new runtime dep. This file is also the harvest MARKER the licence gate keys off.
- **`mcp/servers/fhir-broker/index.js` [~]** — live path taken only when `HEYDOC_FHIR_MCP_ENDPOINT` is configured AND the request mode normalises to `live` (C16, via `verification/mode.js`); mock stays default + full rollback (unset the endpoint).
- **`integration/record-sources/` [NEW]** — FIRST-PARTY clean-room SMART-on-FHIR ingestion spine (`sources-client.js`, `au-providers/au-providers.json`, `README.md`). Every FHIR Observation with a numeric value crosses the investigation parser (C3) → qualitative `lab_result` fact (raw number stripped) → session-store (C8); non-lab resources reduced to bare `{resourceType,id,status}` references (demographics dropped; session-store guard is the backstop); all state destroyed on encounter close. `buildAuthorizeRequest()` builds a SMART App Launch authorize shape and refuses any provider not `available`. `au-providers.json` is metadata only — `client_id_ref` points at a secrets-manager key, never a secret; only the public HAPI synthetic sandbox is `available` (smoke target, refused in production).
- **`test/contract-fhir-live.js` [NEW]** — live read/search mapping + fail-safe + SSE framing; no-raw-lab + no-demographics ingest; destroy-on-close; input-gated providers + no-secrets assertion; opt-in HAPI-sandbox smoke (`HEYDOC_FHIR_LIVE_SMOKE=1`). Appended to `npm test` (now 23 files).
- **`integration/harvest-manifest.json`, `docs/grounding/integration-register.md`, `test/contract-harvest-manifest.js` [~]** — wso2 #16 `licence_status` pending→verified + commit-pinned. **`fasten-sources` register defect fixed:** upstream repo is private/404 and pkg.go.dev detects no licence for any retained version — the prior "Apache-2.0 verified" was wrong; downgraded ADOPT→REFERENCE (non-shippable), so `record-sources` is first-party clean-room (no Fasten code read/copied).

### Registers
- **completeness-register:** `harvest-confirm-licences-pending` narrowed (wso2 cleared; bgpt #18 remains). NEW `fhir-live-adapter` (PARTIAL, R-28) + `au-record-sources-ingest` (PARTIAL, R-28). `fhir-broker-unbuilt` updated with the live-backend note.
- **gap-register:** R-27 narrowed (wso2 cleared H1); NEW **R-28** (live patient-record path input-gated); `fhir-broker` section updated.
- **.claude:** `completeness-index.md` + `server-status.md` synced.

### Safety / firewall
No §1 invariant weakened: raw-lab path parser-gated + ContextPacket `superRefine` defence-in-depth; every live call receipted; mock never presented as live (C16); no dose/code/identity path touched; **no secrets in repo** (au-providers uses `secrets://` references + `example.invalid` placeholders); scoring-store firewall untouched (record-sources reads no case data). Licence floor upheld: wso2 cleared before wrap; unlicensed Fasten kept off every shippable path.

---

## FLOW_PLAN Milestone H0 — harvest reconciliation & licence-clearance manifest (2026-07-06)

**Status:** Branch `flow-h0-licence-clearance` (off `main` @ `31bb9be`). `npm test` 22/22 green; `npm run licence:check` PASS; `npm run verification` + `npm run eval:cases` unchanged. **NO integration code** — this milestone builds the licence + identity gate that H1+ harvest must pass; nothing is harvested or wired.

### Change
- **`integration/harvest-manifest.json` [NEW]** — the machine-readable harvest allow-list and **source of truth**: 41 rows (FLOW_PLAN §6.2's 40 candidates + a split-out GPL `fasten-onprem` row so the copyleft app can never be confused with the Apache-2.0 Fasten Sources lib). Each row carries url · pin status · licence · licence_status · verdict · mode · target · shippable · governance mapping. ADOPT rows are intentionally **not** commit-pinned (`unpinned_pending_adoption`) — no SHA fabricated offline; pinning becomes mandatory at wrap time.
- **`scripts/check-licence-clearance.mjs` [NEW]** (`npm run licence:check`) — zod-validated gate (exported `runCheck` for tests). BLOCKS on (1) AGPL/GPL SPDX/header in a shippable module, (2) a DROP/DEFER repo pulled in as a dependency or present at a target, (3) a licence-pending repo wrapped on a shippable path, (4) MedRAG conflation (gzxiong #20 ≠ SNOWTEAM2023). Override-existing targets (`fhir-broker`/`docs`) key off a `live-backend.js` marker, not directory existence, so our own mock servers don't false-positive.
- **`test/contract-harvest-manifest.js` [NEW]** — proves every BLOCK fails closed, the override-existing regression guard holds, and the real committed manifest passes; appended to the `npm test` chain (now 22 files).
- **`docs/grounding/integration-register.md` [NEW]** — human-readable mirror of §6.2 (the JSON manifest wins on any disagreement).
- **`.github/workflows/ci.yml`, `package.json`** — CI gains a BLOCKING `Harvest licence-clearance gate` step after `npm audit`; `licence:check` npm script added.

### Safety / firewall
Gate is **armed-and-green**: 0 blocks today (no harvested code in the tree — H0 authorises none), 12 non-blocking warnings (unpinned ADOPT rows). The scan reads source under shippable paths for licence headers **only**; it never opens case node bodies (`10`–`13`) — scoring-store firewall intact by construction. No new runtime dependency (`zod` + `node:fs`). AGPL/GPL (open-health #13, fasten-onprem) recorded **reference-only** per the licence floor + D-2 (owner AGPL ruling pending). One design correction during the build: BLOCK 3 first false-positived on the existing mock `fhir-broker/` (a wso2 override-in-place target); fixed with the marker-file signal.

### Register impact
- **Completeness Register:** `+ harvest-licence-clearance-gate` (COMPLETE, High) · `+ harvest-confirm-licences-pending` (open, High, `pf:true` — 5 Confirm-licence repos held back until cleared on-repo).
- **Gap Register:** `harvest-confirm-licences-pending` promoted → **R-27** (High, one-way). **Allowed Service Registry UNCHANGED** — harvested server names enter only when their servers exist (H2+), not at H0.
- `.claude/completeness-index.md` updated (new Harvest section; sync line → 2026-07-06).

---

## Chore — write-time hygiene warning on case ingest (2026-07-06)

**Status:** Branch `chore/ingest-hygiene-warning` (off `main` @ `e5e33f7`). PR open; operator-gated merge. `npm test` 21/21 green. The optional residual hardening logged with the 2026-07-05 sync-dupe cleanup.

### Change
- **`scripts/ingest-case-bundles.mjs`:** after splitting a bundle into its case dir, `cases:ingest` now scans that dir (filename-only, `readdirSync`) and emits a **non-fatal `[HYGIENE]` warning** naming any file that is not one of the 8 canonical split files (`00`/`01`/`02`/`10`/`11`/`12`/`13` + `case_manifest.json`). Cloud-sync copies matching `/ \d+\.[A-Za-z]+$/` ("<node> 2.json") are called out as likely cruft to delete. Catches sync dupes at write time instead of at commit time (the 236-dupe incident entered via a broad `git add`, not the ingest glob).
- **`test/contract-case-ingest.js`:** new assertion block — a clean case dir produces no warning; a stray `"00_case_envelope 2.json"` (author-placed placeholder, no sealed body read) triggers the warning naming the file and flagging it as cruft, while ingest still exits `0`.

### Safety / firewall
Warning-only — never blocks ingest, never changes the exit code, never overwrites. Scan is **filename-only**; sealed `10`–`13` node bodies are never opened, so the scoring-store firewall is preserved by construction. No new dependency (Node 20 ESM; ajv/zod untouched).

### Register impact
- `case-dir-duplicate-files` stays **COMPLETE/resolved** (Low); its `build_action` optional-hardening note moved from "nice-to-have" to **DONE (2026-07-06)**, `last_scanned` → 2026-07-06. No gap-register move (below promotion threshold); no new register item opened.

---

## Chore — sync-dupe cruft cleanup + guards (2026-07-05)

**Status:** Merged. PR #20 (`chore/cruft-guards-and-cleanup`), `main` @ `ccefabd`. CI `test` green; `eval:cases` PASS. Operator-approved merge.

### Change
- **Removed 236 committed `" 2.json"` cloud-sync duplicate case nodes** under `data/cases/` across 30 dirs / 11 series (ID, MSK, NEURO, OBS, OPHTH, RENAL, RESP, SURG, URO, VASC). Each removed file's clean-named tracked twin remains — **twin-verified for all 236**; removed **by path only** (sealed `10`–`13` nodes never opened). Also cleared ~1,998 *untracked* sync-dupes from the working tree.
- **`.gitignore` guards:** `* [0-9].*` (the sync-dupe pattern) and `Projects/` (local business/strategy binary docs — operator reference, never version-controlled).

### Safety / firewall
Every removal ends in `" 2.json"` (asserted — no clean-named node deleted); new ignore pattern shadows **0** tracked files; `eval:cases` unchanged pre/post (302 dirs / 301 attested / 0 failures — the dupes were never counted as cases). Scoring-store firewall intact.

### Register impact
- `case-dir-duplicate-files` **PARTIAL/Medium → COMPLETE/resolved** (re-rated Low: redundant copies of tracked twins, no consumer, firewall never at risk). Root cause corrected in the record: a broad `git add` of the output tree while cloud-sync dupes were present, **not** a loose ingest glob — the ingest input filter is tight (`.endsWith(".casebundle.json")`). Optional residual hardening logged (nice-to-have): `cases:ingest` warn on stray non-canonical files in a target case dir. `.claude/completeness-index.md` updated. No gap-register move (below promotion threshold).

---

## ARCH_PLAN Milestone M11 P1 — terminology live adapter (CSIRO sandbox target) (2026-07-05)

**Status:** Adapter built + smoke-verified against the real sandbox; AU-content connect stays input-gated. Operator-approved (plan + the sandbox-refused-in-production guard). Branch `feat/terminology-live-adapter` (off `main` after PR #16 merged). npm test 21/21, verification pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change (contract frozen — data source only)
- **`mcp/servers/terminology/live-adapter.js` (new):** `validateCodeLive()` — CodeSystem `$validate-code` against a live FHIR terminology server (Node 20 global `fetch`, **no new dependency**); `resolveTxEndpoint()` — endpoint selection + the safety guard. `SYSTEM_URI` maps SNOMED/LOINC/ICD-11; AU-specific systems (ICD-10-AM/PBS/AMT) are `null` (validated only on NCTS/self-host).
- **`mcp/servers/terminology/index.js`:** live branch in `terminology_lookup`/`terminology_validate` (code path) behind `HEYDOC_TERMINOLOGY_ENDPOINT` (`mock` default = rollback; `dev_sandbox`|`ncts_live_api`|`self_hosted`). Endpoint resolved once at startup; **`dev_sandbox` in production → server exits 1** (fail-safe, verified). Live receipts carry the actual endpoint + `mode:"live"`. `$translate` and live text lookup are P1-out-of-scope (fail-safe miss, never fabricated). **The `TerminologyLookup` contract + mock path are unchanged.**
- **`test/contract-terminology-live.js` (new, in `npm test` → CI):** mocked-`fetch` unit tests — request shape (`$validate-code?url=…&code=…`), result-true mapping, every fail-safe path (result:false, HTTP 500, timeout/abort, AU-unmapped system with no network call), plus the production-refuse guard. An **opt-in live smoke** (`HEYDOC_TX_LIVE_SMOKE=1`, skipped in CI) validated a real SNOMED code against the CSIRO sandbox (`22298006` → "Myocardial infarction").

### Invariants
No-fabricated-codes strengthened: a code is live-validated or fail-safe-missed, never invented; the sandbox's unlicensed content is refused in production. Mock is the default rollback. Nothing patient-facing.

### Register impact
- **NEW** `terminology-live-adapter` → PARTIAL (adapter mechanics built; AU-content connect input-gated); gap-register **R-20** annotated; `.claude/server-status.md` + index updated. `terminology-contract-incomplete`/R-20 stays PARTIAL until AU-content validation (NCTS licence or self-host RF2 deploy).

### Remaining (input-gated, M11 onward)
AU-content validation (SNOMED CT-AU / ICD-10-AM / PBS / AMT) via NCTS OAuth or a self-hosted Ontoserver loaded with the SNOMED CT-AU RF2; AU Core value-set binding; live text lookup ($expand) + $translate; the 301-case code re-validation (flip `mock_verified_pending_live_ncts` → live-verified or block on mismatch).

### Verification
`npm test` 21/21 (mock terminology path unchanged); `npm run verification` pass; `trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift; live smoke (opt-in) validated a real sandbox code.

---

## ARCH_PLAN Milestone M8 — production audit substrate seam + retention hook (C5/F3) (2026-07-05)

**Status:** Complete (engineering); live WORM + retention are deploy/regulatory. Operator-approved (never auto-deletes; retention left as a surfaced unset hook). Branch `step-8-audit-worm-substrate`. npm test 20/20, verification pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change (chain algorithm FROZEN — substrate only)
- **`verification/audit-store.js`** — the four raw storage ops (`appendLedgerLine` / `readLedgerLines` / `writeContentOnce` / `readContentByHex`) are now behind a pluggable **substrate**. Built-in **`local`** substrate = the dev JSONL/filesystem backend, **byte-identical** to before (verifyChain + every prior contract assertion unchanged). Production registers a **WORM adapter** (S3 Object Lock, immudb, …) via **`registerAuditSubstrate(name, adapter)`** at deploy — same interface; `computeEntryHash`/`verifyChain`/entry shape/synthetic-only `persistContent` guard all untouched.
- **Fail-safe:** `HEYDOC_AUDIT_SUBSTRATE` (default `local`). A non-`local` value with no adapter registered → **refuses to write** (never a non-WORM medicolegal ledger silently).
- **Retention hook:** `auditRetentionPolicy()` reads `HEYDOC_AUDIT_RETENTION` and surfaces it; unset ⇒ `{configured:false, auto_delete:false, note:"regulatory_posture decision required…"}`. **No period encoded in code; the ledger is never auto-deleted** — retention is a minimum-keep org/regulatory decision, and append-only/WORM forbids early deletion.
- **`test/contract-audit-store.js`** — new case: a custom **in-memory substrate** proves the frozen chain works end-to-end through a non-filesystem backend (append + verifyChain valid + content round-trip); an unconfigured **WORM name refuses**; the **retention hook** surfaces unset/configured with `auto_delete:false`. Env save/restore so the rehash subprocesses are unaffected.
- **`architecture/trust-boundaries.md`** (Boundary 5) — documents the substrate seam, the WORM adapter path, the fail-safe, and retention-as-regulatory-decision.

### Invariants
Append-only + hash-chain + tamper-evidence preserved (frozen); PHI-free entries unchanged; synthetic-only content guard untouched; the WORM guard is strictly stricter (refuses on misconfig). Nothing patient-facing.

### Register impact
- `receipt-store-append-only-unbuilt` (PARTIAL/in-progress) → **COMPLETE/resolved** (engineering); gap-register **R-17 → Dev-COMPLETE 2026-07-05**; index synced. Live WORM + retention explicitly a deploy/regulatory step, not an engineering gap.

### Verification
`npm test` 20/20; `npm run verification` pass; `trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift (chain byte-identical through the local substrate).

---

## ARCH_PLAN Milestone M7 — no_repo_invention severity reconciliation (C15/F11) (2026-07-05)

**Status:** Complete. Operator-approved (gating + severity labels). Branch `step-7-noninvention-severity`. npm test 20/20, verification pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change
- **Drift (C15):** the verifier hard-failed `no_repo_invention` (pass=false), the docs said "warning", and the verifier emitted no `severity` the docs promised. Reconciled to **surfaced-but-gating**.
- **`verification/verifier.js`:** each of the 5 checks now carries a `severity` (Risk-Register mapping): `no_invented_codes`, `no_invented_operations`, `hard_stop_enforcement` → **critical**; `no_invented_guidelines` → **fail**; `no_repo_invention` → **warning**. **Gate unchanged** — `pass = results.every(r => r.passed)`; a failed check of ANY severity still rejects the output. No logic touched beyond adding the label.
- **`verification/report-schema.js`:** no change — it already permitted `severity` (optional). Confirmed it validates.
- **`test/contract-verifier.js`:** asserts each check's severity, and specifically that `no_repo_invention` is `severity=warning` AND `passed=false` AND still drives overall `pass=false` (proves surfaced-but-gating).
- **Docs reconciled:** trunk-constraints.md gains a severity legend; gap-register.md §1b rule + R-11 and .claude/server-status.md tightened so "warning" reads as low-severity, **not** non-blocking.

### Invariants
No verifier check weakened; the fail-safe gate is byte-identical (all existing fixtures keep their pass/fail outcome). Over-flag posture preserved (`no_repo_invention` still blocks). Nothing patient-facing.

### Register impact
- **NEW** `verifier-repo-invention-severity` → **resolved** (completeness-register); gap-register **R-11** annotated; `.claude/*` updated. C15/F11 closed.

### Verification
`npm test` 20/20 (contract-verifier extended); `npm run verification` pass; `trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift; emitted `report.json` now carries per-check severity.

---

## ARCH_PLAN Milestone M6 (cont.) — 50 DST cases attested → 301/301; DST stubs retired (2026-07-05)

**Status:** All 301 ingested cases now clinician-attested; DST housekeeping done. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL written in-session attestation** of the 50 DST cases (40 direct + 10 `--reseq`'d collisions). Recorded as `bulk_clinician_attestation` in each manifest `review` block; scope-guarded to the two DST ingest commits (`6a31499` + `02a1d22`; verified pending == that set). Review block only — node files + sha256 untouched; git diff = 50 manifests.
- **`dst-malformed-bundles` retired** — the 9 empty-stub source bundles + stray `_probe.tmp` deleted with a guard removing only non-well-formed files (all 9 format=null; 50 well-formed bundles remain). Nothing was ever in the repo.
- **`eval:cases`: attested conforming 251 → 301; unreviewed 50 → 0; PASS.** Distribution 49/45/7, coverage 7 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): distribution vs 60/30/10.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 301 cases attested**; only optional distribution polish remains — no blocking work.
- **`dst-malformed-bundles` → resolved.**

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (301 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — id-scheme: globally-assigned seq (`--reseq`); 10 DST collisions auto-resolved (2026-07-05)

**Status:** Cross-series id collisions resolved systemically at the tooling level. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change (operator id-scheme decision: globally-assigned seq)
- **`scripts/ingest-case-bundles.mjs` — new `--reseq` flag.** On a case_id collision, instead of refusing, it assigns the next free **globally-unique** seq (above the max 5-digit seq of any existing case dir, same specialty+difficulty), rewrites the case_id across all 7 nodes + `_bundle` + manifest, and records the **original→assigned mapping** in `case_manifest.ingest.reseq` (the case_id is the medicolegal anchor — provenance preserved). **Never overwrites** (the default still refuses on collision; `--force` unchanged). Ends the cross-series collision problem (AUC-005 & CDV-005 → same id) for all future overlapping batches.
- **`test/contract-case-ingest.js`** — new case: collision refused by default; `--reseq` assigns a new global id, records the mapping, rewrites the sealed-node case_id, and **never overwrites the original** case dir.
- **The 10 DST collisions ingested via `--reseq`** → `SPEC-DERM-01-00100..00106` + `SPEC-DERM-03-00107..00109` (distinct global seqs). The 3 pre-existing cases they collided with (CIA Herpes Labialis, AUC Burns, AMS Dermatitis Herpetiformis) verified untouched (still attested). 56 codes receipted (store total **1580**); 301 cases; distribution 48/45/7 → **49/45/7**. The 10 pending attestation (50 DST total pending).

### Register impact
- **`case-id-cross-series-collision` → resolved** (Medium→Low→resolved): the global-seq scheme is implemented, tested, and used; future collisions auto-resolve with the mapping recorded. The 5 earlier manual `-00099` re-ids stand.
- `case-set-underpopulated` / **R-23**: 301 cases; remaining input-gated = attest the 50 DST cases, retire the 9 DST malformed stubs, optional rebalance.

### Note (batch caveat)
`--reseq` on a whole folder re-seqs EVERY colliding bundle — including already-ingested ones — so it was applied only to the 10 genuinely-uningested collision bundles (targeted by filename), not the folder. Within a real run, sequential writes give distinct seqs; dry-run shows all as the same next-seq (writes nothing) — cosmetic.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — DST batch (operator-re-tiered) ingested; 7th difficulty tier added (2026-07-05)

**Status:** 40 re-tiered DST cases ingested; distribution rebalance (modest) + a 7th difficulty tier. 2 findings handed back. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **DST (Dermatology & Soft Tissue) batch.** Initial recon flagged the batch was 82% atypical despite being requested for a *straightforward* rebalance (folder theme vs difficulty_tier mismatch — same as CFE); **operator re-tiered at source** (straightforward 8 → 27 among well-formed). **40 well-formed new bundles ingested** (20 straightforward + 19 atypical + 1 communication_barrier); 233 codes receipted (store total **1524**); 291 cases.
- **Distribution 47/45/8 → 48/45/7; coverage 6 → 7 difficulty tiers** (communication_barrier/07 now present — all 7 tiers represented). The 40 are `pending_clinician_review`. `eval:cases` PASS.
- **Handed back (not ingested), all fail-safe:**
  - **10 DERM collisions** (SPEC-DERM-01-00016/00021/00031/00036/00042/00043/00046, SPEC-DERM-03-00012/00024/00039) → `case-id-cross-series-collision` (now 15 collisions/5 series; the per-bucket -00099 convention is exhausted in DERM buckets — a systemic seq scheme is overdue).
  - **9 malformed stub bundles** (empty `_bundle`, format+case_id null) + stray `_probe.tmp` → **NEW register item `dst-malformed-bundles`** (Medium). Recurring pattern: the re-tier workflow leaves malformed/temp leftovers each run (CFE: 13 "-RETIRED"; DST: 9 empty stubs) — recommended a leftover-cleanup step in the re-tier workflow.

### Safety
- Only well-formed, non-colliding bundles ingested; sealed nodes split/hashed, never reasoned from. No `--force`; existing 251 untouched (git: 40 new dirs, 0 modified). Source `.txt` never entered the repo.

### Register impact
- `case-set-underpopulated` / **R-23**: 291 cases; 7 tiers; remaining input-gated = attest 40 DST, 10 collisions, 9 malformed stubs, optional rebalance.
- `case-id-cross-series-collision`: +10 (15/5 series; systemic fix overdue). **NEW** `dst-malformed-bundles` (Medium).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — 13 retired CFE bundles deleted; cfe-malformed-bundles resolved (2026-07-05)

**Status:** The 13 operator-retired CFE source bundles deleted; finding closed. Docs-only commit (nothing was in the repo). Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Correction of an earlier diagnosis:** the 13 CFE bundles that ingest REFUSED for "missing/invalid _bundle.format" were **not corrupted** — the operator had deliberately retired them by tagging `_bundle.format` = `"breath-ezy-casebundle-RETIRED"`. The refusal was that retirement working as intended.
- **Per operator instruction ("RETIRE or DELETE"), the 13 source bundles were DELETED** from the CFE Ingest Cases folder, with a safety guard that removed a file only after confirming its `_bundle.format` was NOT `"breath-ezy-casebundle"` — so no well-formed bundle could be deleted. All 13 confirmed `-RETIRED` and removed; 50 well-formed bundles remain in the folder. **Nothing malformed was ever in the repo** (ingest fail-safe), so there is no repo case-file change — only register/docs updates.
- One of the 13 (`SPEC-GI-03-00028`, CFE MCAS) had also been a 6th collision (vs AMS Microscopic Colitis); retired, so that collision is moot.

### Register impact
- **`cfe-malformed-bundles` → resolved** (retired + deleted; earlier "corrupted" evidence corrected).
- `case-id-cross-series-collision`: the MCAS collision noted moot (retired).
- `case-set-underpopulated` / **R-23**: no blocking work remains — only optional distribution polish (47/45/8 → 60/30/10).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (251 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift. No repo case files changed (source-folder deletion only).

---

## ARCH_PLAN Milestone M6 (cont.) — re-id'd CFE case attested → 251/251 attested (2026-07-05)

**Status:** All 251 ingested cases now clinician-attested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL written in-session attestation** of the re-id'd CFE case `SPEC-DERM-03-00099` (the sole pending case; scope-guarded to that one id before writing). Recorded as `single_case_clinician_attestation` in the manifest `review` block — node files + sha256 untouched; git diff = 1 manifest.
- **`eval:cases`: attested conforming 250 → 251; unreviewed 1 → 0; PASS.** Distribution 47/45/8, coverage 6 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 8% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 251 ingested cases attested**; remaining input-gated = the 13 malformed CFE bundles (operator repair → complex past 10%) and optional rebalance.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (251 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — CFE collision re-id'd → SPEC-DERM-03-00099 and ingested (2026-07-05)

**Status:** The CFE id collision resolved; all 5 well-formed collision instances now resolved. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Re-id (operator-authorised), same method** — `SPEC-DERM-03-00041` (CFE *Psoriasis Severe Plaque with Systemic Fatigue*, collided with AMS *Scalp Psoriasis*) → **`SPEC-DERM-03-00099`** (blind 9-id swap on a scratchpad copy; source archive untouched; well-formed source verified). Ingested; 6 codes receipted (store total **1291**); 251 cases. Existing AMS `SPEC-DERM-03-00041` verified untouched (still Scalp Psoriasis, attested).
- **`eval:cases` PASS** — attested 250 (the re-id'd case is `pending_clinician_review`, unreviewed 1); distribution 48/45/8 → **47/45/8**; coverage unchanged.

### Register impact
- `case-id-cross-series-collision`: **all 5 instances resolved** via re-id; only the systemic seq-uniqueness decision remains (Medium, recurs each overlapping batch).
- `case-set-underpopulated` / **R-23**: 251 cases; remaining input-gated = attest the re-id'd CFE case, the 13 malformed CFE bundles, optional rebalance.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift; git scope = 1 new case dir, existing untouched.

---

## ARCH_PLAN Milestone M6 (cont.) — 49 CFE cases attested → 250/250 attested (2026-07-05)

**Status:** All 250 ingested cases now clinician-attested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL written in-session attestation** of the 49 CFE cases. Recorded as `bulk_clinician_attestation` in each manifest `review` block; scope-guarded to the CFE ingest commit `6b329a1` (verified: all 49 pending == that commit set). Review block only — node files + sha256 untouched; git diff = 49 manifests.
- **`eval:cases`: attested conforming 201 → 250; unreviewed 49 → 0; PASS.** Distribution 48/45/8, coverage 6 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 8% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 250 ingested cases attested**; remaining input-gated = the 13 malformed CFE bundles + 1 CFE collision (would push complex past 10%), and optional straightforward rebalance.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (250 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — CFE batch (operator-re-tiered) ingested; complex band 2% → 8% (2026-07-04)

**Status:** 49 re-tiered CFE cases ingested; complex band near target. 2 findings handed back to operator. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **CFE (Complex Fatigue Entities) batch.** Initial recon flagged that the batch was under-tiered (genuinely complex entities — MCAS, autoimmune dysautonomia — labelled tier-03/atypical); **operator re-tiered at source**. Re-recon of the well-formed set: 36 atypical + 14 complex (rare_condition/05 + multi_morbidity_complex/06). **49 well-formed bundles ingested**; 345 codes receipted (store total **1285**); 250 cases.
- **Distribution 59/38/2 → 48/45/8 — complex band jumped 2% → 8% (near the 10% target); coverage 5 → 6 difficulty tiers.** The 49 are `pending_clinician_review`. `eval:cases` PASS.
- **Handed back to operator (not ingested), both fail-safe:**
  - **1 well-formed collision** `SPEC-DERM-03-00041` (CFE Psoriasis-with-fatigue vs AMS Scalp Psoriasis) → `case-id-cross-series-collision` 5th instance (Low→Medium; recurs every overlapping series); re-id pending.
  - **13 malformed bundles** REFUSED for `missing/invalid _bundle.format` — the casebundle wrapper is structurally broken (NOT a firewall issue), likely corrupted during the source re-tier/save. 12 new case_ids + 1 (SPEC-GI-03-00028) also colliding. **NEW register item `cfe-malformed-bundles`** (Medium) — operator must repair the bundle format at source; not agent-fixable (reconstructing bundle internals is case-authoring over sealed content). Stray `__t.txt` in the folder is harmless (tool globs only `*.casebundle.json`).

### Safety
- Only well-formed, non-colliding bundles ingested; sealed nodes split/hashed by the tool, never reasoned from. No `--force`; existing 201 untouched (git: 49 new dirs, 0 modified). Source `.txt` never entered the repo.

### Register impact
- `case-set-underpopulated` / **R-23**: 250 cases; complex band 8%; remaining input-gated = attest 49 CFE, fix 13 malformed bundles, optional rebalance.
- `case-id-cross-series-collision`: 5th instance (Medium). **NEW** `cfe-malformed-bundles` (Medium).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — 3 re-id'd CIA cases attested → 201/201 attested (2026-07-04)

**Status:** All 201 ingested cases now clinician-attested; complex-tier volume is the sole remaining M6 item. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL written in-session attestation** of the 3 re-id'd CIA collision cases (`SPEC-DERM-01-00099`, `SPEC-GI-01-00099`, `SPEC-RESP-01-00099`). Recorded as `bulk_clinician_attestation` in each manifest `review` block; Python scope-guard asserted the pending set == exactly those 3 ids before writing. Review block only — node files + sha256 untouched; git diff = 3 manifests.
- **`eval:cases`: attested conforming 198 → 201; unreviewed 3 → 0; PASS.** Distribution 59/38/2, coverage 5 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 2% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 201 cases attested**; SOLE remaining input-gated item is complex-tier volume.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (201 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — 3 CIA id collisions re-id'd + ingested; all collision instances resolved (2026-07-04)

**Status:** The 3 CIA cross-series id collisions re-id'd and ingested; all 4 known collision instances now resolved. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Re-id (operator-authorised), same method as the AFib case** — blind literal id-string swap (9 ids each) on scratchpad copies; source archive untouched; clinical content not reasoned from:
  - `SPEC-DERM-01-00021` (CIA *Localised First-Degree Burn*) → **`SPEC-DERM-01-00099`**
  - `SPEC-RESP-01-00003` (CIA *Acute Viral Laryngitis*) → **`SPEC-RESP-01-00099`**
  - `SPEC-GI-01-00010` (CIA *Aphthous Stomatitis*) → **`SPEC-GI-01-00099`**
  - Convention: seq `00099` in a specialty bucket = a manually disambiguated re-id (consistent with the AFib case → `SPEC-CARD-01-00099`).
- **Ingested** (dry-run 3/3 OK, no collision, no firewall leak). The 3 existing colliding AUC cases (Burns / Acute Asthma / Acute Pancreatitis) verified **untouched** (still their AUC sources). 13 codes receipted (store total **940**). 201 cases now.
- **`eval:cases` PASS** — attested 198 (the 3 re-id'd are `pending_clinician_review`, unreviewed 3); distribution 59/39/3 → **59/38/2** (3 more straightforward dilute complex); coverage 5 tiers · 3 categories · 19 specialties unchanged.

### Register impact
- `case-id-cross-series-collision`: **all 4 instances resolved** (AFib + these 3) → risk Medium→Low; only the systemic id-scheme decision remains for future series.
- `case-set-underpopulated` / **R-23**: 201 cases; remaining input-gated = attest the 3 re-id'd CIA, complex-tier volume.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift; git scope = 3 new case dirs, existing untouched.

---

## ARCH_PLAN Milestone M6 (cont.) — 4 remediated CIA cases attested → 198/198 attested (2026-07-04)

**Status:** All 198 ingested cases now clinician-attested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL written in-session attestation** of the 4 firewall-remediated CIA cases (DERM-01-00036, EMG-01-00037, GI-01-00027, MH-01-00044). Recorded as `bulk_clinician_attestation` in each manifest `review` block (scope: *CIA firewall-remediated batch (n=4)*); Python scope-guard asserted the pending set == exactly those 4 by id before writing. Review block only — node files + sha256 untouched; git diff = 4 manifests.
- **`eval:cases`: attested conforming 194 → 198; unreviewed 4 → 0; PASS.** Distribution 59/39/3, coverage 5 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 3% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 198 cases attested**; remaining input-gated = complex-tier volume and the 3 CIA id collisions.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (198 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — 4 firewall-remediated CIA bundles ingested; leak finding resolved (2026-07-04)

**Status:** The 4 previously firewall-refused CIA bundles were remediated by the operator and ingested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- The 4 CIA bundles refused earlier for a diagnosis-name leak (DERM-01-00036 "Pityriasis rosea", EMG-01-00037 "Post-viral fatigue", GI-01-00027 "Uncomplicated external haemorrhoid", MH-01-00044 "Transient (adjustment) insomnia") were **regenerated by the operator** with a `transform_flags` step: *"primary diagnosis name removed from AI-Doctor-readable 00/02 fields; diagnosis retained only in sealed nodes 10-13."*
- **Re-verified via the ingest firewall (authoritative, not assumed): dry-run 4/4 `OK_DRY_RUN`, 0 leaks.** Then ingested. 16 codes receipted (store total **927**). 198 cases now (194 attested + 4 remediated CIA `pending_clinician_review`). Distribution 58/40/3 → **59/39/3**. `eval:cases` PASS.
- **Firewall / agent-context note:** the operator attached the 4 full bundles (including sealed 10–13) into the agent context to drive the ingest. Handled strictly as engineering material under the sanctioned digest-carve-out precedent — the sealed answer keys were not reasoned from, reproduced, or routed into any trunk/packet path. The repo-side scoring-store firewall was never breached; ingest split/hashed the sealed nodes mechanically as always.

### Register impact
- **`cia-source-firewall-leaks` → resolved** (remediated + ingested; firewall held throughout). Standing non-blocking recommendation: add a diagnosis-leak pre-check to the authoring/kit step.
- `case-set-underpopulated` / **R-23**: 198 cases; remaining input-gated = attest the 4 remediated CIA, complex-tier volume, the 3 CIA id collisions.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift; git scope = 4 new case dirs, existing untouched.

---

## ARCH_PLAN Milestone M6 (cont.) — 43 CIA cases attested → 194/194 attested (2026-07-04)

**Status:** CIA batch attested; all 194 ingested cases now clinician-reviewed. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL provided written in-session attestation** of the 43 CIA cases. Recorded as `bulk_clinician_attestation` in each manifest `review` block (scope: *CIA Common Infections & Afflictions batch ingested 2026-07-04 (n=43)*, reviewer KL); scope guarded to the CIA ingest commit `488d83c` (verified: all 43 pending == that commit set). Edit scope: review block only — node files + sha256 untouched; git diff = 43 manifests.
- **`eval:cases`: attested conforming 151 → 194; unreviewed 43 → 0; PASS.** Distribution 58/40/3, coverage 5 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 3% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: all 194 ingested cases attested; remaining input-gated = complex-tier volume, the 3 CIA id collisions (re-id), the 4 firewall-refused source bundles (regenerate).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (194 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — CIA batch: 43 ingested; 3 id collisions + 4 firewall-refused surfaced (2026-07-04)

**Status:** CIA common-infections batch partially ingested; 2 new findings registered. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **43 of 50 operator-supplied CIA (Common Infections & Afflictions) casebundles ingested** from `…/Common Infections & Afflictions/… /CIA Ingest Cases` — all `straightforward`/tier-01 (47 common + 3 important_not_to_miss). 190 codes receipted (store total **911**). 194 cases now (151 attested + 43 CIA `pending_clinician_review`).
- **`eval:cases` PASS** — attested 151 (CIA excluded, pending); distribution **45/51/3 → 58/40/3** (the straightforward batch pulls straightforward toward the 60% target and the over-weight atypical toward 30%; complex unchanged at 3%). Coverage 5 tiers · 3 categories · 19 specialties.
- **7 bundles NOT ingested — both handled fail-safe:**
  - **3 cross-series id collisions** (distinct cases, skipped, no `--force`): SPEC-DERM-01-00021 (CIA *Localised First-Degree Burn* vs AUC *Burns*), SPEC-RESP-01-00003 (CIA *Acute Viral Laryngitis* vs AUC *Acute Asthma Exacerbation*), SPEC-GI-01-00010 (CIA *Aphthous Stomatitis* vs AUC *Acute Pancreatitis*). Added to `case-id-cross-series-collision` (now 4 collisions/3 series → risk Low→Medium, recurring).
  - **4 FIREWALL-REFUSED** — the full primary_diagnosis name leaked into AI-Doctor-readable (00/01/02 injectable) text: SPEC-DERM-01-00036 "Pityriasis rosea", SPEC-EMG-01-00037 "Post-viral fatigue", SPEC-GI-01-00027 "Uncomplicated external haemorrhoid", SPEC-MH-01-00044 "Transient (adjustment) insomnia". The ingest firewall REFUSED them (fail-safe; nothing leaked to the repo). **NEW register item `cia-source-firewall-leaks`** (Medium) — source authoring must be regenerated with the diagnosis removed from patient-facing fields; NOT agent-fixable (would require reasoning over answer-key content). Evidence the authoring pipeline can emit leaks that only the ingest firewall catches.

### Safety
- Only clean bundles ingested; sealed nodes split/hashed by the tool, never read into agent reasoning (metadata-only recon; firewall-leak diagnosis names are tool-reported, not agent-read). No `--force`; existing 151 untouched (git: 43 new dirs, 0 modified). Source SOAP `.txt` never entered the repo.

### Register impact
- `case-set-underpopulated` / **R-23**: 194 cases; remaining input-gated = attest 43 CIA, complex volume, 3 CIA collisions, 4 source leaks.
- `case-id-cross-series-collision`: +3 instances (recurring, Medium).
- **NEW** `cia-source-firewall-leaks` (Medium).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — AFib case attested → 151/151 attested, full case set clinician-reviewed (2026-07-04)

**Status:** Whole 151-case set now clinician-attested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL provided written in-session attestation** of the re-id'd AFib case `SPEC-CARD-01-00099` (the only pending case; scope verified as exactly that CVD Atrial Fibrillation case before writing). Recorded as `single_case_clinician_attestation` in its manifest `review` block. Edit scope: review block only — node files + sha256 untouched; git diff = 1 manifest.
- **`eval:cases`: attested conforming 150 → 151; unreviewed 1 → 0; PASS.** Distribution 46/51/3, coverage 5 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 3% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 151 cases attested**; SOLE remaining input-gated item is complex-tier VOLUME (~15 needed vs 5 present).
- `case-id-cross-series-collision`: instance fully closed (re-id'd + ingested + attested); systemic id-scheme decision (Low) stands for future series.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (151 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — id-collision resolved: AFib case re-id'd → SPEC-CARD-01-00099 and ingested (2026-07-04)

**Status:** The skipped CVD Atrial Fibrillation case is re-id'd and ingested; id-collision instance closed. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Re-id (operator-authorised):** the CVD `SPEC-CARD-01-00005` bundle (*Atrial Fibrillation*, source `CDV-005.txt`) — which had collided with the existing attested AUC `SPEC-CARD-01-00005` (*Acute Coronary Syndrome*) — was re-assigned **`SPEC-CARD-01-00099`** (free globally; max prior seq was 00051; chosen above the source-number-derived 1–51 range to mark it a manual disambiguation). Done as a **blind literal id-string swap (9 occurrences) on a scratchpad COPY** — the operator's source archive under `PATIENT INFORMATION` was never modified, and no clinical (sealed-node) content was read. Specialty/difficulty/source preserved.
- **Ingested** `SPEC-CARD-01-00099` (dry-run OK, then real; 151 case dirs now). **12 codes receipted** (`cases:verify-codes`; store total **721**). The existing `SPEC-CARD-01-00005` (ACS) verified untouched.
- **`eval:cases` PASS** — attested 150 (the new AFib case is `pending_clinician_review`, unreviewed 1); distribution 45/51/3 → **46/51/3**; coverage 5 tiers · 3 categories · 19 specialties unchanged.
- **Attestation NOT auto-applied:** the AFib case was the 50th CVD case, but the recorded CVD attestation is scoped `n=49` and did not include it — so it stays pending pending explicit operator confirmation that their CVD review covered it.

### Register impact
- `case-id-cross-series-collision`: **instance resolved** (AFib → -00099, ingested) → risk Medium→Low; the **systemic** id-scheme (seq not unique across series) decision remains open for future large multi-series ingest.
- `case-set-underpopulated` / **R-23**: 151 cases (150 attested + 1 pending AFib); remaining input-gated = attest the AFib case, complex-tier volume to ~10%.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift; git scope = 1 new case dir added, existing untouched.

---

## ARCH_PLAN Milestone M6 (cont.) — 49 CVD cases clinician-attested → 150 attested, gate PASS (2026-07-04)

**Status:** CVD batch attested; entire 150-case set now clinician-attested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL provided written in-session attestation** of the 49 CVD cases. Recorded as `bulk_clinician_attestation` in each of the 49 `case_manifest.json` `review` blocks (scope: *CVD Cardiovascular batch ingested 2026-07-04 (n=49)*, reviewer KL), mirroring the AMS/original batches.
- **Attestation-scope safety:** the operator's message initially carried the previous "50 AMS cases" wording; since AMS was already attested and the 49 pending were the CVD batch, the mismatch was surfaced and the operator confirmed "attest the 49 CVD cases" before anything was written. The flip script's scope guard binds to the **CVD ingest commit `2baad80`** (not source filenames — one CVD case, a vasculitis/GCA case `SPEC-VASC-04-00046`, lacks a `CDV` filename tag; an earlier filename-based guard correctly ABORTED on it before the commit-based scoping was verified).
- **Edit scope: the manifest `review` block ONLY** — no node file (00–13) or recorded `files[].sha256` touched; integrity intact. git diff = exactly 49 `case_manifest.json`.
- **`eval:cases`: attested conforming 101 → 150 (≥45); unreviewed 49 → 0**; PASS. Distribution 45/51/3, coverage 5 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 3% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: full 150-case attestation DONE; remaining input-gated work narrows to **complex-tier VOLUME (~15 needed vs 5 present)** and the **id collision** (`case-id-cross-series-collision`).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (attested 150); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — CVD batch ingested (49 cases; complex tier + 3rd category seeded; coverage minimums cleared) (2026-07-04)

**Status:** CVD cardiovascular batch ingested; complex tier + `zebra_rare` category now present. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **49 of 50 operator-supplied CVD (Cardiovascular) casebundles ingested** from `…/Cardiovascular/… /CVD Ingest Cases`. Brings the case set's **first complex-tier cases (5 × `rare_condition`, tier 05)** and its **3rd diagnosis category (`zebra_rare`)**, plus atypical (7×02, 2×03, 12×04) and 23 straightforward. All firewall+schema clean.
- **1 bundle skipped — genuine id collision, NOT a duplicate:** CVD `SPEC-CARD-01-00005` = *Atrial Fibrillation* (`CDV-005.txt`) collides with the existing attested `SPEC-CARD-01-00005` = *Acute Coronary Syndrome* (`AUC-005.txt`). The `SPEC-{specialty}-{difficulty}-{seq}` scheme isn't unique across source series (AUC-005 & CDV-005 both → seq 00005). `cases:ingest` (no `--force`) correctly refused to overwrite — the existing attested/receipted case was preserved, the CVD case skipped. **Verified untouched:** existing SPEC-CARD-01-00005 still ACS, still `clinician_reviewed:true`, codes still receipted. New register item **`case-id-cross-series-collision`** (Medium) — operator id-scheme decision needed.
- **373 new codes receipted** (`cases:verify-codes`; store total **709**).
- **`eval:cases` PASS** — attested 101 (≥45; the 49 CVD are `pending_clinician_review`, excluded); distribution **45/55/0 → 45/51/3** (complex now nonzero); **coverage 4→5 tiers, 2→3 diagnosis categories — the 3-tier and 3-category minimums are now CLEARED**. Remaining warnings (non-blocking): complex 3% vs 10%; 49 pending attestation.

### Safety
- Only bundles ingested; sealed `10–13` split/hashed by the tool, never read into agent reasoning (recon metadata-only). No `--force`; existing 101 + reference untouched (git: 49 new dirs, 0 modified existing). Source SOAP `.txt` (under PATIENT INFORMATION) never entered the repo.

### Register impact
- `case-set-underpopulated` / **R-23**: complex tier + 3rd category seeded; coverage minimums met. Remaining input-gated: attest the 49 CVD, more complex to reach ~10%, resolve the id collision.
- **NEW** `case-id-cross-series-collision` (Medium) — id-scheme uniqueness across series.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — 50 AMS cases clinician-attested → 101 attested, gate PASS (2026-07-04)

**Status:** Attestation recorded; 50 AMS cases now count toward the eval gate. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS (attested 101, 0 unreviewed).

### Change
- **Operator KL provided written in-session attestation** having clinically reviewed all 50 AMS answer keys. Recorded as `bulk_clinician_attestation` in each of the 50 `case_manifest.json` `review` blocks: `clinician_reviewed:true`, `review_status:"clinician_reviewed"`, `source_type:"llm_generated_reviewed"`, `reviewer_id:"KL"`, `attested_utc`, `recorded_by:"claude-opus-4-8 (agent, on clinician's explicit written confirmation in-session)"`, `scope:"AMS batch ingested 2026-07-03 (n=50)"` — mirroring the original 51-case batch attestation. Verbatim statement recorded: *"Clinician confirmed in writing having clinically reviewed all 50 AMS (Autoimmune Mild Severity) answer keys in this batch and attests them clinically correct."*
- **Edit scope: the manifest `review` block ONLY.** No node file (00–13) and no recorded `files[].sha256` was touched, so the eval gate's per-file integrity check remains valid. git diff = exactly 50 `case_manifest.json`.
- **`eval:cases` re-run: attested conforming 51 → 101 (≥45); unreviewed 50 → 0**; all 50 attestation warnings cleared; distribution unchanged 45/55/0 (computed over all envelopes). Remaining warnings (non-blocking): complex tier 0% and diagnosis-category coverage 2 of 3.

### Register impact
- `case-set-underpopulated` / **R-23**: attestation DONE; remaining input-gated work narrows to **complex-tier (05–07) cases (none exist yet) + a 3rd diagnosis_category**.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (attested 101); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — atypical top-up ingested (50 AMS cases; distribution 88/12/0 → 45/55/0) (2026-07-03)

**Status:** Atypical top-up ingested from operator-supplied source; complex tier + attestation remain input-gated. Branch `step-6-case-eval-gate`. npm test 20/20, verification pass, stubs 9/9, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **50 new AMS (Autoimmune Mild Severity) casebundles ingested** via `cases:ingest` from operator-supplied source `…/PATIENT INFORMATION/…/Autoimmune Mild Severity/… /AMS Ingest Cases`: 1 tier-02 (atypical_presentation) + 37 tier-03 (red_herring_laden) + 12 tier-04 (atypical_presentation_high_risk); new specialties RHEUM + HAEMAT. All 50 NEW (0 collisions), firewall + schema clean (dry-run OK_DRY_RUN 50/50). 400 files written (50 × 7 nodes + manifest).
- **227 new candidate codes receipted** via `cases:verify-codes` (→ mock_verified_pending_live_ncts); total receipted across the store now **336** (109 + 227); idempotent for the prior 109.
- **`eval:cases` re-run: PASS** — attested conforming 51 (≥45); distribution **88/12/0 → 45/55/0**; difficulty-tier coverage **2 → 4 tiers** (3-tier minimum cleared); specialties 17 → 19. The 50 are `llm_generated_unreviewed` / `pending_clinician_review`: they shift the reported distribution but are **excluded from the attested count** by design (50 attestation warnings, non-blocking).

### Safety / privacy
- **Scoring-store firewall intact.** Only bundles were ingested; the ingest tool split/hashed/firewall-scanned all 7 nodes per case (its job). No agent reasoning read sealed `10–13` content — recon was metadata-only (difficulty/category/id/review/code-counts). Post-ingest grep confirms no runtime JS in verification/integration/mcp/portal references sealed nodes.
- **Source SOAP `.txt` never entered the repo.** The source notes live under `PATIENT INFORMATION`; the "AMS Ingest Cases" subfolder holds only the de-identified `.casebundle.json` outputs. Hash-only source discipline preserved (manifests carry `source.sha256`, not content). No `.txt` read into context.
- **No `--force`, no overwrite.** All 50 new; the prior 51 manifests (and their M6 receipts) untouched.

### Register impact
- `case-set-underpopulated` / **R-23**: atypical top-up ingested; distribution + tier coverage advanced; **REMAINING (input-gated): clinician attestation of the 50, ~8 COMPLEX cases (tiers 05–07, none exist yet), a 3rd diagnosis_category.** Index + gap-register updated.

### Verification
`npm test` 20/20; `npm run verification` pass; `trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift; `eval:cases` PASS (warnings as designed).

---

## ARCH_PLAN Milestone M6 — case-set terminology batch-verify + CI-blocking eval gate (2026-07-03)

**Status:** Receipts + gate complete; difficulty top-up surfaced as INPUT-GATED. Branch `step-6-case-eval-gate`. npm test 20/20, `npm run verification` pass, trunk stubs 9/9, `eval:cases` PASS, `cases:verify-codes` idempotent (re-run: 109 already done).

### Change
- `scripts/verify-case-codes.mjs` + `npm run cases:verify-codes` (new): batch-verifies every codes_manifest entry against the terminology MCP server (terminology_lookup, query.kind="code"; one server spawn for the whole run). **All 109 candidate codes across the 51 manifest-bearing cases receipted**; per-code receipt (request_id/timestamp_utc/upstream/mode/validated_code/system_version) written into the entry; status flipped `unverified_pending_terminology_receipt` → **`mock_verified_pending_live_ncts`** — deliberately honest: the mock server echoes codes (binding, not clinical validation); live NCTS batch-REvalidation happens at M11 (FMEA F5), and receipt `mode:"mock"` means the M1 mode-normaliser blocks these as proof in any live-enforced context. Fail-safe: a lookup that does not echo the exact code leaves the entry unverified and exits non-zero.
- `scripts/eval-case-gate.mjs` + `npm run eval:cases` (new) + `.github/workflows/ci.yml` step **"Case-set evaluation gate (blocking)"**: the deterministic release gate over the eval set. BLOCKS on: <45 attested conforming cases; any manifest-listed file whose on-disk sha256 differs (integrity transitively re-asserts ingest-time schema validity + the firewall leak verdict **without ever parsing a sealed node** — sealed files are only streamed through sha256, exactly as ingest does); a 00/01/02 file failing its schema; any code left unreceipted; unattested cases counting toward the minimum. WARNS (non-blocking until top-up): distribution vs 60/30/10 and the 3-tier/3-category/5-specialty coverage minimum. **Current: PASS — 51 attested ≥ 45; distribution 45/6/0 (88/12/0); coverage 2 tiers · 2 diagnosis categories · 17 specialties.**
- Named exception, register-tracked: `SPEC-CARD-04-00001` (hand-built reference case, pre-ingest) has no case_manifest — skipped by name in verify-codes, excluded from the attested count in the gate; **NEW register item `reference-case-manifest-missing`** (Low) with a retrofit build_action.

### Difficulty top-up — surfaced as INPUT-GATED (not silently skipped)
The M6 authoring component ("author atypical/complex cases toward 60/30/10") cannot be completed by this agent alone: the eval gate counts **only clinician-attested** cases, so machine-generated `llm_generated_unreviewed` bundles cannot move the attested distribution by design. Reaching 60/30/10 while keeping the 45 straightforward cases needs ≈17 atypical (tiers 02/03/04) + ≈8 complex (05/06/07) **attested** cases — i.e. clinical source material (SOAP notes) for the kit pipeline and/or clinician attestation, which only the operator can supply. Register updated accordingly; the gate's distribution warning flips to blocking once the mix reaches design.

### Register impact
- `case-set-underpopulated` / **R-23**: receipts + CI gate → done; distribution top-up → input-gated (evidence updated with the true envelope-derived distribution).
- **NEW** `reference-case-manifest-missing` (Low, pf:false).
- Firewall unchanged: the new scripts parse only case_manifest + 00/01/02; sealed nodes are hashed (streamed), never parsed — same boundary as `cases:ingest`.

### Verification
`npm test` 20/20; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `npm run eval:cases` PASS (warnings as designed); `cases:verify-codes --dry-run` re-run shows 109 already done (idempotent); changed tracked files = exactly the 51 case manifests + package.json + ci.yml + registers.

---

## ARCH_PLAN Milestone M5 — Clinician Verification Portal release gate (HITL checkpoint contract built) (2026-07-03)

**Status:** Complete (gate + contract; portal UI/workflow out of engineering scope). Branch `step-5-portal-gate`. npm test 20/20 (new suite added; 3 consecutive full-suite greens), `npm run verification` pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change
- `mcp/schemas/verification-portal-decision.schema.json` (new — the one plan-sanctioned schema addition, C9/§3.5.5): **VerificationGateRecord** `{ run_id, candidate_output_hash, clinician_id, decision: approved|rejected|amended, decided_at_utc, signature_ref, amended_output_hash?(required when amended), notes? }`, additionalProperties:false. An amendment is a NEW medicolegal artifact with its own hash; the original candidate_output_hash remains the record of what was generated.
- `portal/verification-gate.js` (new): zod mirror (lockstep-tested against the JSON schema via ajv-2020) + the mechanical checkpoint. `recordGateDecision()` validates and APPENDS (records never mutate; latest decision is effective — re-review supported). `releaseToPatient({candidate_output_hash, output})` is **fail-closed**: refuses in mock/dry_run (mode-normaliser guard — dev contexts have no patients), refuses without a gate record, refuses `rejected`, and releases ONLY text that **re-hashes** to the attested hash (approved→candidate; amended→amended_output_hash) — the gate computes the hash itself, never trusts one it is handed. Refusals return named reasons (a patient path escalates to a clinician, never retries around the gate).
- `portal/README.md` (new): scope (gate only, no UI), the adoption rule — **every future patient-facing path MUST call releaseToPatient()**; a path that does not is a Critical defect (F13) — and what remains before "portal built".
- `test/contract-verification-gate.js` (new, wired into `npm test` → CI): zod↔JSON-schema lockstep (accept + reject fixtures), patient path closed without a record, exact-hash binding (altered text refused), rejected never releases, amended releases only the amended text, latest-decision-wins, mock/dry_run never release, malformed requests fail closed, contract violations throw at record time.
- `package.json`: suite appended to the `test` chain (CI gate). `.claude/schema-index.md` updated (new schema row) in the same step per <context_loading>.
- messaging-geo remains **UNWIRED** (M13, post-Portal-complete) per the M5 directive.

### Invariants
Human-in-the-loop is now mechanically enforceable at the release boundary (was policy-only). Hash discipline strengthened: release binds to recomputed SHA-256 of the exact bytes. Nothing patient-facing opened — the gate existing closes paths, it does not open them; the other release blockers stand.

### Register impact
- `clinician-verification-portal-unbuilt` (Critical, pf:true) → **PARTIAL** (gate contract built; clinician UI/workflow, authenticated identity/signature capture, and WORM gate-record storage (M8) remain); gap-register §1b portal row updated; index re-synced; schema-index gained the 13th pipeline contract. FMEA F13 residual 4×5 → 1×5 per plan.
- Flake note (honest record): one unreproducible mid-chain `npm test` abort was observed once during the M5 gate run (suite stopped after 6 with no error captured by the grep filter); four consecutive full-suite runs pass 20/20 — if it recurs, investigate contract-pipeline spawn timing first.

### Verification
`npm test` (20 suites) green ×3 consecutive; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M4 — session-bound persistence enforced (release blocker cleared at the enforcement layer) (2026-07-03)

**Status:** Complete. Branch `step-4-session-store`. npm test 19/19 (new suite added), `npm run verification` pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change
- `verification/session-store.js` (new): technical enforcement of "no persistence beyond session" (<data_handling>) and Trust Boundary 4. **Memory-only** — no disk path, no serialisation API (contract test asserts no persistence-shaped export and an untouched data dir). **Encounter-scoped lifetime** — `openEncounter` → working state → `closeEncounter` destroys everything; closed refs never reopen (no zombie sessions); reads/writes after close throw; writing to a never-opened encounter throws (no implicit/untracked state). **Mechanical demographic guard** — demographic-looking keys anywhere in a nested value (name/dob/address/medicare/ihi/phone/email/…) and IHI-shaped values (16 digits, 800360-prefixed) are REFUSED with a thrown error; conservative over-blocking by design. Medicolegal ledger explicitly documented as exempt (append-only, PHI-free by `.strict()` — it must survive the encounter).
- **Adoption contract** (documented in-module + register): any future stateful session path (portal flows, patient conversations, cross-trunk working memory) MUST hold its working state in this store; holding it anywhere else reintroduces the gap. No production session flow exists today (trunk runs are stateless) — the store is the gate artifact.
- `test/contract-session-store.js` (new, wired into `npm test` → CI): round-trip while open; close destroys (count-verified); no resurrection; no implicit creation; encounter isolation; demographic guard refusals (top-level, nested, array-buried, IHI-in-string) + legitimate clinical state passes; no persistence surface; filesystem untouched; destroy-all sweep.
- `package.json`: suite appended to the `test` chain (CI gate).

### Release blockers (restated per the M4 directive)
1. **Pharmacology vendor live + validated** — open (M9, input-gated on contract/credentials).
2. **Clinician Verification Portal** — open (M5, next engineering step).
3. **Deterministic investigation parser** — built mock/dev; range sign-off + live source open (M10, input-gated).
4. **Session-bound persistence** — **enforcement CLEARED this step** (adoption re-checked per future session flow; real-patient content persistence additionally consent-gated).
No patient path opens until all four are green; nothing in this step is patient-facing.

### Register impact
- `session-persistence-unenforced` (Critical, pf:true) → **COMPLETE / resolved (enforcement)**; gap-register **R-10 → "Enforcement built 2026-07-03 (M4)"**; index re-synced. FMEA F12 residual 3×5 → 1×5 per plan.
- `content-store-production-gated` unchanged (real-patient content persistence still consent-gated by design).

### Verification
`npm test` (19 suites) green; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M3 — live context-injection allow-list (scoring-store firewall at the packet boundary) (2026-07-03)

**Status:** Complete. Branch `step-3-context-allowlist`. npm test 18/18 (new suite added), `npm run verification` pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift, scoring-store firewall re-checked — NOT breached.

### Change
- `verification/context-allowlist.js` (new): DEFAULT-DENY mirror of the `cases:ingest` field-scoped firewall at the packet boundary (§3.5.5 `contextAllowList(caseFields) → { injectable_fields, rejected_fields }`). `01` allows only `demographics` / `opening_complaint` / `history_as_reported` (channel **packet**, category-mapped to the Fact enum); `02` allows only `disclosure_items[].{clinical_fact,patient_response_template,patient_deflection_template}`, `patient_initiated_exchanges[].patient_text`, `deflection_behaviours[].deflection_text_template` — classified channel **exchange** (simulator dialogue material) and **never converted to packet facts**. All of `00`, `psychosocial_profile`, `digital_tablet_field_map`, unknown nodes/fields, and `02` scoring/gate sub-fields reject. **A sealed scoring node (`10_`–`13_`) anywhere in the input THROWS** ("SCORING-STORE FIREWALL") and halts packet assembly — a breach attempt never degrades to a dropped field.
- `verification/pipeline.js`: `contextInjection()` enforces the allow-list on the new `case_content` path; `runPipeline({ case_content })` threads it. No case content supplied → behaviour unchanged (regression-tested).
- **Quarantine (surfaced, not silently resolved):** `objective_data_offered` is ingest-allow-listed, but CLAUDE.md `<data_handling>` requires the patient-reported-vitals sanitiser policy be confirmed **before** this path ships it. The field rejects with a reason naming the policy; tracked as new register item `objective-data-offered-sanitiser-policy` (Medium, pf:true, input-gated on operator/clinical confirmation). Flip is one line + a test once confirmed.
- `test/contract-context-allowlist.js` (new, wired into `npm test` → CI): default-deny sweep (no SIM-ONLY/SCORER-ONLY marker injectable), all four sealed nodes throw (dummy keys, synthetic fixtures — **no case file read**), exchange material never becomes facts, quarantine reason asserted, end-to-end through the ContextPacket zod gate, pipeline halts on sealed content, no-case-content regression.
- `package.json`: suite appended to the `test` chain (CI gate).

### Invariants
Scoring-store firewall strengthened from ingest-only to ingest + live packet boundary; sealed content is now a hard stop on the live path. Raw-lab invariant untouched (parser path unchanged; the one adjacent open question is quarantined, not shipped). Spine, hashing, verifier checks untouched. Nothing patient-facing.

### Register impact
- `context-injection-allowlist` → **COMPLETE / resolved**; gap-register **R-26 → Resolved 2026-07-03 (M3)**; index + firewall-status paragraph re-synced.
- **NEW** `objective-data-offered-sanitiser-policy` (Medium, pf:true, input-gated) — the charter's open follow-up is now register-tracked with the decision options stated (pass as-is / band via parser / keep withheld).
- FMEA F9 mitigation in place (residual 2×5 → 1×5 per plan).

### Verification
`npm test` (18 suites) green; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift; sealed-node reference grep = known engineering set only.

---

## ARCH_PLAN Milestone M2 — cross-trunk sequencer (DEAD_END-1 fix; HARD_FAIL propagates across trunks) (2026-07-03)

**Status:** Complete. Branch `step-2-trunk-sequencer`. npm test 17/17 (new suite added), `npm run verification` pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change
- `integration/trunk-sequencer.js` (new): the missing outer loop. Consumes the PARSED Trunk 1.0 `routing_plan.next_trunks` (zod-gated — a malformed plan throws and never part-runs; unknown trunk ids rejected) and walks each routed trunk through the full five-step pipeline via `runTrunkWithGrounding` (no step bypassed). **Halts unconditionally, no override path**, on: Trunk 1.0 `safety_gate` escalate_now/T5 (before any routed trunk — routing never outruns the safety gate); `continuation_blocked` from any trunk (a pharmacology HARD_FAIL or BLOCKED_NO_PROOF now blocks the WHOLE sequence — FMEA F2 closed); escalate_now/T5 signalled in any trunk output (conservative over-halt: over-triage-safe); and verification `pass=false` (a rejected output is never upstream context for the next trunk). Emits the ordered execution record of ARCH_PLAN §3.5.5 (`executed[]`, `halted_at?`, `halt_reason?`), zod-validated.
- Feature flag `HEYDOC_SEQUENCER` (**default OFF** = rollback): when off, `runTrunkSequence` runs nothing and returns a disabled record — the single-trunk status quo.
- `integration/trunk-pipeline.js`: re-exports `runTrunkSequence`/`isSequencerEnabled` as the one integration surface; header documents that manual multi-trunk chaining must honour `continuation_blocked` until the flag is on.
- `test/contract-sequencer.js` (new, wired into `npm test` → CI): default-off runs nothing; `next_trunks` consumed in order; HARD_FAIL halts (later trunks never run, blocking entry recorded); BLOCKED_NO_PROOF halts; Trunk 1.0 escalate gate halts before anything runs; mid-sequence escalate_now and structured T5 short-circuit; verification failure halts; malformed plan throws; empty plan is a valid no-op; re-export identity.
- `package.json`: suite appended to the `test` chain (CI gate).

### Invariants
No-HARD_FAIL-override now holds **across the sequence**, not only within one trunk. Five-step spine untouched (the sequencer adds the outer loop only). Hashing, verifier checks, sanitiser untouched. Escalation detection over-halts on ambiguity (under-triage outranks over-triage). Nothing patient-facing; flag off by default.

### Register impact
- `routing-plan-next-trunks-dead-end` (DEAD_END-1) → **COMPLETE / resolved**; gap-register **R-24 → Resolved 2026-07-03 (M2)**; index re-synced. FMEA F2/F8/F10 mitigations in place (F2 residual 4×5→2×5 per plan).
- Residual (by design, documented): sequencer engages only with `HEYDOC_SEQUENCER` on; callers chaining trunks manually must honour `continuation_blocked` themselves.

### Verification
`npm test` (17 suites) green; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `npm run verify:rehash -- --integrity` 0 drift.

---

## ARCH_PLAN Milestone M1 — mode-normaliser (C16/F4 mode-flag leakage closed) (2026-07-03)

**Status:** Complete. Branch `step-1-mode-normaliser`. npm test 16/16 (new suite added), `npm run verification` pass, trunk stubs 9/9, `verify:rehash --integrity` 349/349 zero drift.

### Change
- `verification/mode.js` (new): the single mapping between the env vocabulary (`HEYDOC_MODE_DEFAULT`: mock/staging/production/dry_run) and the receipt/packet/ledger enforcement enum (mock/dry_run/live). `staging`/`production` → `live` (mock proof **blocked**); `mock`/`dry_run` stay dev (mock proof flagged, not blocked); **unrecognised mode → default-deny to `live`**; absence keeps the documented dev default (mock).
- `verification/verifier.js`: `enforceLive` now derives via `normaliseMode(evidence.context_mode).enforce_live` instead of `=== "live"` (the F4 hole). Monotone-stricter only; the five checks untouched; hash-first untouched.
- `verification/pipeline.js`: `context_mode` derived via the normaliser — always enum-valid for the ContextPacket/verifier/ledger contracts (a raw `staging` string previously crashed packet validation).
- `verification/audit-store.js` `recordRun`: **second F4 site found during M1 research and closed in the same step** — `synthetic = mode !== "live"` on the raw env meant a `staging` run would have persisted output content as synthetic AND handed the ledger an enum-invalid mode. Now normalised: staging/production runs are non-synthetic (content NOT persisted, `content_persisted=false`).
- `test/contract-mode-normaliser.js` (new, wired into `npm test` → CI): mapping table, case/trim tolerance, absence default, default-deny; verifier blocks mock proof in staging/production/live/unknown and flags-not-blocks in mock/dry_run; live receipt still grounds in staging; pipeline end-to-end (packet mode enum-valid, mock-grounded code blocked in staging, binds in mock); ledger classification (staging → mode "live", no content persisted; mock → synthetic persisted). Throwaway `HEYDOC_DATA_DIR`.
- `package.json`: new suite appended to the `test` chain (CI gate).

### Invariants
No check weakened; enforcement strictly strengthened (old: only `"live"` blocked; new: staging/production/unknown also block; mock/dry_run behaviour unchanged; absent context_mode unchanged). Hashing, HARD_FAIL handling, sanitiser, and the five-step spine untouched. Nothing patient-facing.

### Register impact
- `mode-leakage-enforcelive` → **COMPLETE / resolved** (completeness-register + index); gap-register **R-25 → Resolved 2026-07-03 (M1)**; `.claude/server-status.md` C16 caveat replaced with the resolved semantics.
- Residual tracked, not a defect: MCP servers stamp `receipt.mode` from their own env read and only ever run mock today — server-side stamping is normalised at live-connect (M9/M11, noted in R-25 + register evidence).

### Verification
`npm test` (16 suites) green; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `npm run verify:rehash -- --integrity` 349 content checked, 0 drift.

---

## ARCH_PLAN Milestone M0 — reconciliation & re-scan (docs only) (2026-07-03)

**Status:** Complete. No code, no new tests. Baseline + post-change `npm test` both 15/15 green (identical).

**Operator override (recorded):** *Model routing amended by operator 2026-07-02 — Fable 5 for reasoning/hard-logic steps, Opus 4.8 for scaffolding; supersedes charter Opus-plan/Sonnet-execute split.* Applied to the `.planning/ARCH_PLAN.md` header.

### Blueprint
- `.planning/ARCH_PLAN.md` **created in-repo** (operator-approved copy of the Desktop blueprint), v1.0.0 → v1.0.1: (a) FMEA §3.6 Owner column renumbered to §3.7 milestones (F2/F8/F10→M2, F3→M8, F5/F6→M11, F7→M10, F9→M3, F11→M7, F12→M4, F13→M5, F14→M9, F15→M0; F1 annotated *unscheduled — verifier fuzz hardening, propose alongside M6*); (b) model-split header line per the operator override above.

### Register moves (completeness-register ↔ gap-register, one-way promotion)
- **C18/F15 closed** — `case-set-underpopulated`: row said 1 case; live count is **52 directories** in `data/cases/` (47 difficulty-01 / 5 difficulty-04 incl. reference; 51 clinician-attested, bulk attestation KL 2026-07-02). ≥45 minimum MET; distribution skew + terminology receipts remain (→ M6). Dangling `gap_register_link: gap-case-set` fixed → mirrored as **R-23** (Medium).
- **C17 closed** — gap-register §1b prose reconciled to built reality: `deterministic-investigation-parser` (built, `verification/investigation-parser.js`, provisional ranges), `pharmacological-firewall` (mock core + Trunk 8.0 wired, contract-tested, live vendor pending), `medicolegal-audit-ledger` (built, `verification/audit-store.js`, prod WORM pending). C15 `severity=warning` wording deliberately **untouched** (M7, operator-gated).
- **NEW `routing-plan-next-trunks-dead-end`** (DEAD_END-1, High, pf:true) → promoted **R-24**. Verified: zero JS references to `next_trunks`/`routing_plan`; fix = M2 sequencer; do not build on this edge.
- **NEW `mode-leakage-enforcelive`** (C16/F4, High, pf:true) → promoted **R-25**. Verified: `enforceLive = contextMode === "live"` (exact string); staging/production would accept mock receipts; fix = M1 mode-normaliser. Caveat added to `.claude/server-status.md`.
- **`context-injection-allowlist` recorded in-register** (was index/HANDOFF-only despite the register being the index's source of truth) → promoted **R-26** (High, pf:true); fix = M3.
- **NEW `case-dir-duplicate-files`** (Medium) — 236 untracked `* 2.json` Finder duplicates across 30 case dirs, incl. sealed-node name duplicates (inventoried by filename only, never opened); delete under a gated cleanup step.
- **NEW `repo-digest-sealed-node-carveout`** (Low) — digest deliberately embeds the reference case's sealed 10–13 for engineering; must never enter an AI-Doctor context path; M3 allow-list test to carry a digest-shaped default-deny fixture.
- Milestone links added: `pipeline-routing-retrieval-stub` → C10, input-gated at live-connect under M11 (stale `pending-promotion` tag corrected — Medium, below threshold); `content-store-production-gated` → gated on C8/M4 + consent.
- Promotion section updated: 2026-06-30 pending list marked done (R-16–R-19); M0 promotions listed.
- Firewall re-check (M0): four scripts/tests read `data/cases`; **none routes 10–13 content into any trunk/packet path — NOT breached.** Index firewall paragraph updated.

### Derived docs (same step, per <context_loading>)
- `.claude/completeness-index.md` re-synced (case count, three new High rows, Medium + Low rows, firewall paragraph).
- `.claude/server-status.md` — C16 mode-enforcement caveat section added.

### Sequencing impact
None found that alters M1–M5 order: DEAD_END-1 exposure is contained (no multi-trunk caller exists; HARD_FAIL is terminal within a single `runTrunkWithGrounding` run, contract-tested), so M1 (mode) before M2 (sequencer) remains safe.

---

## `cases:ingest` — bundle → data/cases with field-scoped firewall (2026-07-01)

**Status:** Complete (tool). Branch `feat/cases-ingest`. Plan-gated build (approved). New dependency `ajv` (approved).

### Change
Adds the deterministic ingestion tool that admits `*.casebundle.json` files into `data/cases/`.

- `scripts/ingest-case-bundles.mjs` + `npm run cases:ingest`: per bundle → ajv-validate all 7 nodes (schemas are draft 2020-12) → `case_id` consistency → **field-scoped firewall check** → honesty gate (bundle hashes null, codes unverified) → split into `data/cases/<CASE_ID>/` → compute real **SHA-256** per file (fill manifest nulls) + `source.sha256` (if the `.txt` is alongside) + `ingest.bundle_sha256` → carry the clinician attestation through. Refuses (exit 1, writes nothing) on any gate failure; `--dry-run`, `--out`, `--force`.
- `test/contract-case-ingest.js` (wired into `npm test`, now 15 suites): round-trips the reference case (8 files + real SHA-256), and asserts a diagnosis-name leak into `01` and a `case_id` mismatch are both refused.

### Firewall allow-list (the finding, now enforced in code)
The firewall is **finer than file-level**. Only sub-fields injected into the AI-Doctor/patient-simulator exchange are scanned: all of `01` **except** `psychosocial_profile` + `digital_tablet_field_map` (simulator-direction/mapping metadata), and in `02` only `disclosure_items[].{clinical_fact,patient_response_template,patient_deflection_template}`, `patient_initiated_exchanges[].patient_text`, `deflection_behaviours[].deflection_text_template`. `00` and `02` scoring fields are metadata and legitimately reference the diagnosis. Leak = the **full** `primary_diagnosis.name` (not generic SNOMED-display words) or a source `.txt` filename appearing in injectable text. Validated: 51/51 real bundles pass with 0 true leaks.

### Reference-case fix
`data/cases/SPEC-CARD-04-00001/11_symptom_links_node.json` had 3 × `unlocks_symptom_id: null` — a pre-existing non-conformance (predates the schema hardening; schema forbids null). Removed (omit = "unlocks nothing"). Gold standard is now schema-clean.

### Register impact
- **NEW `context-injection-allowlist`** (High): the sub-field firewall is enforced at ingest, but the *live* context-injection layer (unbuilt) must apply the same allow-list before injecting `00/01/02` into a trunk. Registered.
- `case-set-underpopulated`: intake path now built (tool). Actual population (ingest the 51) is the next step.
- Firewall status: JS now **writes** `data/cases` (ingest) — it does not route sealed `10–13` content into a trunk; re-affirmed.

### Verification
`npm test` 15/15; `npm run cases:ingest -- "<folder>" --dry-run` → 51/51 OK, 0 leaks.

---

## Case transformation — bundled "kit" (single-file package) (2026-07-01)

**Status:** Complete. New derived artifact + build script.

### Change
Adds a **single self-contained package** so a Claude Chat / Cowork session can run the SOAP→case-set transformation from **one attachment** instead of 16 (protocol + omnibus + 7 schemas + 7 reference-case files).

- `scripts/build-case-transformation-kit.mjs` (new): assembles the kit from the repo's source files (Node ESM, no new dependency). Records a sha256 per embedded source in `_kit.contents` for version traceability, and parses the protocol version from the `.md` header.
- `docs/case-authoring/breath-ezy-case-transformation-kit.json` (new, generated, ~497 KB): `{_kit, protocol_markdown, digital_tablet_omnibus, node_schemas (7), reference_case (7)}`. `_kit.runner_prompt` is the Cowork sequential-ledger prompt adapted to read from the embedded kit; `_kit.how_to_use` covers Chat and Cowork.
- `package.json`: `npm run kit:build` to regenerate.

### Staleness note
The kit is **derived** — repo files are the source of truth. Re-run `npm run kit:build` after any change to the protocol, schemas, omnibus, or reference case. (Currently pinned to protocol `v1.2.0`.)

### Verification
Kit parses; 16 embedded sources (protocol + omnibus + 7 schemas + 7 reference files); protocol markdown includes §7.9; `npm test` unaffected.

### Register impact
None (docs/tooling). Supports the `case-set-underpopulated` intake path.

---

## Case transformation protocol — hardening from first real-case validation (2026-07-01)

**Status:** Complete. Docs-only. Protocol bumped to `case-transform-protocol:v1.2.0`. Triggered by hand-validating the first Chat-produced bundle (`AUC-021` cardiac arrest), which was clinically excellent but had **103 schema-conformance errors** + one firewall leak.

### Root causes fixed
- **Protocol defects (led Chat into invalid output):** skeletons used `null` for unknown optionals (schemas forbid null → omit); invented `source_note_reference` in `00` (both an invalid field **and** a firewall leak — the source filename contains the diagnosis); abbreviated `symptom_narrative` key names; §7 gave prose, not exact contracts.
- **Chat drift the protocol should have prevented:** `differentials`→`differential`, `snomed_ref` string→object, non-enum values, prose where tier-enums/objects required, added fields (`channel`/`reporter`/`bystander_state`), arrays where single strings required.

### Changes to `docs/case-authoring/case-transformation-protocol.md`
- **New §7.0 Hard conformance rules:** `additionalProperties:false` (no invented fields); `null` forbidden → omit; objects/arrays never rendered as strings; enums verbatim; reference-case key names exact; self-validate before emitting.
- **New §9.1 Case-ID mapping:** assign canonical `SPEC-{SPECIALTY}-{DD}-{SEQ}` (DD = difficulty-tier ordinal 01–07); source ID → `case_manifest.source.original_case_id`; provisional SEQ flagged for maintainer. Decoded from the schema's own documented convention (`AUC-021` → `SPEC-CARD-01-00021`).
- Fixed §7.1 (removed `source_note_reference` + null review fields), §7.2 (exact `symptom_narrative` keys, object shapes), §7.3–§7.7 (exact object/enum/single-string shapes for every field Chat got wrong), §7.8 (`original_case_id`), §12/§13 (no-null flagging, conformance + case-id checklist items).
- **§1 now mandates attaching the 7 node schema files + reference case** to the Chat session — the schema is the authoritative contract.

### Verification
All fenced JSON skeletons parse; version bumped consistently (3 spots); `differentials`/`null` references are all corrective. Case-ID convention verified against the schema's `case_id` pattern + description and the reference case (`SPEC-CARD-04` ↔ difficulty ordinal 4).

### Register impact
None (docs). User decision recorded: **map to canonical SPEC IDs** (schemas unchanged) rather than relax the pattern.

---

## Case transformation protocol — Bundle Output Mode (2026-07-01)

**Status:** Complete. Docs-only. Protocol bumped to `case-transform-protocol:v1.1.0`.

### Change
Adds **Bundle Output Mode** (§7.9) to `docs/case-authoring/case-transformation-protocol.md`: each case is emitted as **one `<CASE_ID>.casebundle.json`** — a single JSON envelope whose top-level keys are the 8 files, plus a `_bundle` header (`format`, `split_map`, `firewall_assertion`) telling repo ingestion how to split it. Now the default output (separate-block output still valid).
- One `JSON.parse` + write-each-key split (no fragile banner-regex); every sub-object is canonical JSON ready to hash + zod-validate.
- Firewall preserved: the bundle is an authoring/transport artifact, split *before* the pipeline; the AI Doctor never sees a bundle. Recommend gitignoring `*.casebundle.json`.
- Hashes stay `null`, codes stay `unverified` — unchanged from §7.8.
- Cross-refs updated (§1, §10, §11, §13); the planned `cases:ingest` tool now splits the bundle first.

### Verification
Bundle example parses as valid JSON (9 top keys: `_bundle` + 8); no lingering "8 blocks" references; `npm test` unaffected (docs-only).

### Register impact
None (docs). Supports the `case-set-underpopulated` intake path.

---

## Presentation-layer patient-obtainable objective data (2026-07-01)

**Status:** Complete. Branch `feat/presentation-objective-data`. Plan-gated schema change (approved).

### Change
Amends the telehealth reprojection rule so **patient-obtainable objective data may enter the AI-Doctor-readable presentation layer** — bounded and provenance-tagged. Clinician-only findings stay sealed.

- `data/schemas/01_presentation_layer.schema.json` (new optional `objective_data_offered[]`): home/wearable device readings, self-reported measurements, video-visible findings. Each item `{type, value (string+units), source (enum: patient_home_device|patient_wearable|patient_reported|video_observable|caregiver_reported), verified (default false), device_validated?, timing?, fhir_path?, reliability_caveat?}`. Top-level `additionalProperties:false` preserved; item objects closed. Enum **excludes** any clinician-measured source.
- `docs/case-authoring/case-transformation-protocol.md`: §6 rewritten (patient-obtainable → `01` tagged; clinician-only → sealed `10`/`11`), §4 routing rows split, §7.2 contract + example, §13 checklist.
- `CLAUDE.md <data_handling>`: added the telehealth carve-out note.

### Invariant posture
No hard limit weakened. `verified` = established encounter input, not gold-standard; clinician exam/labs/ECG remain sealed + receipt-gated; values stored as patient-stated strings (no structured raw-number bypass of the sanitiser). **Open follow-up flagged in CLAUDE.md:** confirm sanitiser policy for patient-reported vitals if the live pipeline injects `objective_data_offered` into trunk context.

### Verification
JSON Schema valid; reference case `SPEC-CARD-04-00001/01` still conforms; positive `objective_data_offered` example validates; unknown item field, missing `source`, and `clinician_measured` source all correctly rejected. `npm test` unaffected (case schemas not yet zod-wired in code).

### Register impact
No new `UNBUILT`/`DEAD_END`/`BLIND_STUB`. Refines the `01` contract in support of `case-set-underpopulated`.

---

## Doc reconciliation: charter + derived docs vs register (2026-07-01)

**Status:** Docs only — no code, schema, or contract touched; all three CI suites remain green (13/13 tests, verification pass, 9/9 trunk stubs). Closes two `Low`/`STALE` Completeness Register items. Operator-approved the CLAUDE.md edit before execution.

### Why
The registers and most derived docs were rebuilt 2026-06-30 and already reflected reality (all 7 servers mock-built, `PARTIAL`), but three prose artifacts lagged: CLAUDE.md still described the four mock-built servers as "specified, not built," and `.claude/server-status.md` contradicted itself on whether the pharmacology firewall was wired behind Trunk 8.0 (it is — R-22, `contract-firewall.js` passes).

### Changes
- `CLAUDE.md`: `<project_context>` repo map (line 33) now lists all seven servers as mock-built/`PARTIAL`; the no-build-step note (line 30) corrected (plain `.js`, not `dist/`); `audit-ledger-entry` added to the schema list (line 32); `<gap_register_and_build_sequence>` status lines + build-order annotated to reflect mock-complete items and the real remaining work (live vendors/EHR, sign-off, Clinician Portal, persistence, terminology contract).
- `.claude/server-status.md`: pharmacology row corrected — "live vendor + firewall wiring pending / Not yet wired behind Trunk 8.0" → "mock core + Trunk 8.0 firewall wired; live vendor pending," with the receipt-backed HARD_FAIL + contract-test note.
- `.claude/schema-index.md`: verified against disk (12/12 `mcp/schemas` + 7/7 `data/schemas`) — accurate, no change needed.
- Register: `claudemd-behind-charter` and `derived-docs-unverified` → `status: resolved` (both `Low`); `.claude/completeness-index.md` synced.

### Register / gap-register impact
- Completeness Register: 2 `STALE` (Low) → `resolved`. No items opened. Gap-register: unchanged (neither item was ever promoted — both `Low`, `gap_register_link: none`).

---

## fhir-broker + messaging-geo (mock) + FHIR→parser path (2026-06-30)

**Status:** Mock complete. Branch `chore/import-and-remediate`. Advances `fhir-broker-unbuilt` + `messaging-geo-unbuilt` to PARTIAL — the last two servers now have mock implementations, so **all 7 MCP servers are built (mock)**.

### Changes
- `mcp/servers/fhir-broker/` (index.js + mock-resources.json): `fhir_read`/`fhir_search` return templated AU Core resources (incl. lab Observations with raw values); `fhir_write` SAFE_STUB. **FHIR→parser path:** on the MCP path, Trunk 6.0 Observations → `retrieveFhirObservations` → `raw_investigations` → the deterministic parser → sanitised `lab_result` facts (raw number never in the packet).
- `mcp/servers/messaging-geo/index.js`: `geo_locate`/`pharmacy_search` mock; `msg_send` SAFE_STUB that NEVER sends (recipient redacted/not echoed, flagged not-patient-facing). Not wired into the trunk pipeline (patient-facing, gated by the Clinician Verification Portal).
- `verification/{retrieval-mcp,pipeline}.js`: `retrieveFhirObservations`; `routing()` sets `needs_fhir_reads:["Observation"]` for Trunk 6.0; fhir labs merge into `raw_investigations`.
- `test/contract-fhir-broker.js` + `test/contract-messaging-geo.js` wired into `npm test` (13/13).
- `mcpServers.template.json` both paths `dist/index.js` → `index.js`; server-status / mcp-server-map / registers updated.

### Register movement
- `fhir-broker-unbuilt` → **PARTIAL** (mock read/search + Observation→parser; live EHR + AU Core/AUCDI conformance pending). `messaging-geo-unbuilt` → **PARTIAL** (mock; never-sends; live providers pending). `investigation-parser-unbuilt` now has a mock fhir lab source.

### Verification
- `npm test` 13/13; `trunk:stub:all` 9/9 stub + live MCP; Trunk 6.0 (MCP) → 2 sanitised HH lab facts from fhir, raw values absent from the packet.

---

## Knowledge server (mock) + curated datasets (2026-06-30)

**Status:** Mock complete. Branch `chore/import-and-remediate`. Mock-resolves `knowledge-datasets-empty` + gap-register **R-13**; advances `knowledge-server-unbuilt`; opens `knowledge-datasets-provisional` (High).

### Changes
- `mcp/servers/knowledge/data/{benign-registry,axis-b-templates,redflags-bank}.json` (new): versioned, checksummed, **DEV/SYNTHETIC-ONLY — not clinically authoritative** datasets for Trunks 7.0/5.0/9.0.
- `mcp/servers/knowledge/index.js` (new): McpServer; `kg_query`/`kg_provenance` real over the datasets; ContextGraph/PatientKnowledgeGraph return empty (no graph store — never fabricated); `kg_upsert`/`kg_export` SAFE_STUB (`unavailable`, no fake revision/artifact).
- `verification/pipeline.js`: `routing()` sets `needs_structured_kg` per trunk (7.0→benign-registry, 5.0→axis-b-templates, 9.0→redflags-bank); `retrievalStub` emits a mock `structured_dataset` receipt; `contextInjection` maps `structured_dataset` → EvidenceNode support (ref = dataset_version).
- `verification/retrieval-mcp.js`: `retrieveKnowledge()` (kg_query per dataset) on the MCP path.
- `test/contract-knowledge.js` (new) wired into `npm test` (11/11).
- `mcpServers.template.json` knowledge path `dist/index.js` → `index.js`; server-status / mcp-server-map / registers updated.

### Register movement
- `knowledge-datasets-empty` → **COMPLETE (dev)**; `knowledge-server-unbuilt` → **PARTIAL** (live PostgreSQL graph store pending); **opened** `knowledge-datasets-provisional` (High — clinical sign-off). R-13 mock-resolved. ContextGraph/PatientKnowledgeGraph now have a (mock, empty) producer.

### Verification
- `npm test` 11/11; `trunk:stub:all` 9/9 stub + live MCP; structured_dataset evidence reaches the packet (trunk 7.0 → benign-registry:v0.1.0-dev) and the packet validates.

---

## Trunk 8.0 pharmacology firewall — wired + HARD_FAIL enforced (2026-06-30)

**Status:** Complete (mock). Branch `chore/import-and-remediate`. Advances `pharmacology-server-unbuilt` / gap-register **R-22** — only the live vendor remains.

Turns the pharmacology mock core into an enforced firewall behind Trunk 8.0.

### Changes
- `mcp/servers/pharmacology/engine.js` (new): pure `runPharmCheck()` extracted from `index.js` (refactor — same logic), so the MCP server and the in-process firewall share one engine.
- `verification/pipeline.js`: when a Trunk 8.0 turn carries `pharm_intent`, runs the firewall in-process — `firewall_status` gates continuation; **HARD_FAIL → `continuation_blocked` with no override path** + `hard_stops` + receipt-backed `hard_stop_receipt`; the PharmCheck receipt flows into the packet + ledger. No-intent on Trunk 8.0 → BLOCKED_NO_PROOF + blocked. Grounding-pass kept separate (the honest BLOCKED_NO_PROOF stub stays green).
- `integration/trunk-pipeline.js`: accepts `{ pharmIntent, resolvedFacts }`; surfaces `firewall_status`/`continuation_blocked` and report `hard_stops`/`overall_severity`.
- `test/contract-firewall.js` (new) wired into `npm test` (10/10): HARD_FAIL blocks (no override) + receipt-backed check 5; an invented HARD_FAIL (no receipt) fails check 5; PASS doesn't block; no-intent → BLOCKED_NO_PROOF + blocked + grounding-passes.
- `architecture/trust-boundaries.md`, server-status, registers updated.

### Register movement
- `pharmacology-server-unbuilt`: remaining gap narrowed to **live vendor only** (firewall + HARD_FAIL enforcement done). Enforces no-autonomous-prescription + no-HARD_FAIL-override hard limits.

### Verification
- `npm test` 10/10; `trunk:stub:all` 9/9 (stub unaffected); HARD_FAIL blocks with no override, invented hard-stop rejected by check 5.

---

## Pharmacology server — deterministic mock core (2026-06-30)

**Status:** Mock core complete (not wired). Branch `chore/import-and-remediate`. Advances `pharmacology-server-unbuilt` (#1 gap) / gap-register **R-22**.

The highest-leverage Critical: the only permitted source of dose guidance and the Trunk 8.0 firewall.

### Changes
- `mcp/servers/pharmacology/mock-data.json` (new): versioned, **MOCK/SYNTHETIC-ONLY — not a clinical source**; allergy cross-reactivity groups, DDI pairs, renal rules, AU schedule map, mock dose guidance.
- `mcp/servers/pharmacology/schemas.js` (new): zod PharmIntent (lenient input) + PharmCheck (strict output) + validators.
- `mcp/servers/pharmacology/index.js` (new): McpServer (SDK ^1, stdio) with `pharm_check` + `pharm_intent`. Deterministic engine — allergy x-react, DDI, renal dosing, AU scheduling, S8 PDMP. Invariants: dose_guidance ONLY on PASS/WARN and NEVER on HARD_FAIL/BLOCKED/paediatric; HARD_FAIL terminal; paediatric (<18) → flag, no dose; absent facts → NOT_RUN → BLOCKED_NO_PROOF; every result mode=mock, MOCK vendor_reference.
- `test/contract-pharmacology.js` (new), wired into `npm test` (9/9): PASS+dose, BLOCKED_NO_PROOF, allergy HARD_FAIL no-dose, S8 HARD_FAIL, paediatric HARD_FAIL no-dose, receipt mode=mock.
- `mcpServers.template.json`: pharmacology path `dist/index.js` → `index.js` (no build step). `.claude/server-status.md` updated.

### Register movement
- `pharmacology-server-unbuilt`: Critical, UNBUILT → **PARTIAL / in-progress** (mock core; firewall wiring = next task, live vendor = standing gap).

### Next / not done
- Wire intent→PharmCheck→firewall_status behind Trunk 8.0 + verifier HARD_FAIL-blocks-continuation (next task). Live vendor (MIMS-AU/SafeScript) in staging before patient-facing. Mock data is not a clinical source.

### Verification
- `npm test` 9/9; engine smoke across all scenarios correct; dose never present on HARD_FAIL/BLOCKED/paediatric.

---

## Deterministic investigation parser (sanitiser) — built for mock/dev (2026-06-30)

**Status:** Complete (mock/dev). Branch `chore/import-and-remediate`. Resolves `investigation-parser-unbuilt` engine / gap-register **R-21** (named release blocker); opens `lab-reference-ranges-provisional` (High).

Enforces the hard limit "no raw lab numbers to LLM context": a raw numeric result is converted to an HL7 interpretation + qualitative string before it can enter a packet — the raw number never reaches the trunk.

### Changes
- `verification/data/lab-reference-ranges.json` (new): 8 LOINC-keyed analytes, dataset_version, **DEV/SYNTHETIC-ONLY — not clinically authoritative** banner, adult sex-agnostic bands.
- `verification/investigation-parser.js` (new): `sanitiseInvestigation()` → conformant `lab_result` fact (HL7 N/H/L/HH/LL + qualitative value, no raw number, `sanitised_by`) + dataset_version/checksum receipt; unknown/non-numeric fail safe to `U`.
- `verification/pipeline-schemas.js`: ContextPacket refinement — `lab_result` facts must carry `sanitised_by` and a non-numeric value.
- `verification/pipeline.js`: `contextInjection` runs `options.raw_investigations` through the parser into sanitised facts (parser now has a real consumer).
- `test/contract-investigation-parser.js` (new) + pipeline integration test (raw 6.8 → `HH` fact; raw number absent from the whole packet). `npm test` 8/8.
- `architecture/trust-boundaries.md`: documented the no-raw-lab enforcement.

### Register movement
- `investigation-parser-unbuilt`: Critical, UNBUILT → **PARTIAL / in-progress** (engine built mock/dev; named-blocker engine criterion met).
- **Opened** `lab-reference-ranges-provisional` (High): dev ranges need clinical + regulatory sign-off before patient-facing; live lab source (fhir-broker) also pending.

### Verification
- `npm test` 8/8; `verification` + `trunk:stub:all` 9/9 stub + live MCP; integration confirms the raw value never reaches the packet.

---

## Register correction — ContextGraph / PatientKnowledgeGraph are not dead-ends (2026-06-30)

**Status:** Reclassification (no code). Register/doc-only.

Phase 0 over-flagged `context-graph` and `patient-knowledge-graph` as DEAD_END. Investigation shows both are contracted across the spec — `grounding-plan` (`needs_structured_kg`, `live_call_specs` graph_kind), `evidence-node` (`kg_node` supports), the knowledge server's `kg.query` (mcp/README, mcp-server-map), architecture and data-buckets docs. They have no JS producer only because the **knowledge server is UNBUILT** — the same awaiting-producer status as `pharm-intent`/`pharm-check` vs the pharmacology server. Removing them would break those references; the correct resolution is to keep and track them under `knowledge-server-unbuilt`.

- Completeness Register: both reclassified DEAD_END → COMPLETE (contracted schema awaiting registered producer), `gap_register_link` → knowledge datasets; dropped from the dead-end build-checklist line.
- `.claude/completeness-index.md`: removed (no longer open findings).

No schema files changed.

---

## Pipeline edges contracted — GroundingPlan + ContextPacket gated (2026-06-30)

**Status:** Complete. Branch `chore/import-and-remediate`. Resolves `pipeline-edges-uncontracted` (Medium).

The routing→retrieval and context-injection step boundaries passed data with no schema gate. Added zod validators mirroring the JSON contracts and enforced them; reworked the stub so the packet actually conforms.

### Changes
- `verification/pipeline-schemas.js` (new): zod `GroundingPlanSchema`, `ContextPacketSchema`, `EvidenceNodeSchema`, `ReceiptSchema` + `validateGroundingPlan()`/`validateContextPacket()` (throw).
- `verification/pipeline.js`: validate the GroundingPlan after routing and the ContextPacket after injection. Reworked `contextInjection()` to emit a conformant packet — `receipts[]` holds only clean Receipts (request_id/timestamp_utc/upstream/mode; `validated_codes`/`kind` dropped), and `static_doc` citations move into `evidence[].supports[]`.
- `test/contract-pipeline.js` (new), wired into `npm test` (now 7/7): validators accept conformant data; reject missing-required, extra-key, receipt-missing-timestamp, receipt-with-validated_codes, and malformed EvidenceNodes.
- `.claude/schema-index.md`: noted the zod gate on grounding-plan / context-packet.

### Notes
- The VerificationReport edge was already gated (report-schema.js); with this, all four named pipeline contracts are enforced. EvidenceNode and Receipt are validated as part of the ContextPacket.
- `recordRun()`/ledger and the evidence_tree builder remain compatible with the conformant packet; citations are now represented in evidence rather than as pseudo-receipts in the ledger.

### Verification
- `npm test` 7/7; `npm run verification` + `trunk:stub:all` green on stub and live (HEYDOC_USE_MCP=1); produced GroundingPlan + ContextPacket validate; ledger chain VALID.

---

## Verifier hardening — code detection + binding + mock-mode (2026-06-30)

**Status:** Complete. Branch `chore/import-and-remediate`. Resolves `verifier-weak-code-detection` / gap-register **R-19**; opens `terminology-contract-incomplete` / **R-20** (High).

The `no_invented_codes` check was weak: it matched ICD-11 only (not the pinned ICD-10-AM), let any terminology receipt clear all codes, and never flagged mock receipts.

### Changes
- `verification/verifier.js`: detection across SNOMED CT / ICD-10-AM / ICD-11 / LOINC / PBS with false-positive guards (dotted/dash-check/labelled forms always flagged; bare ICD/PBS context-gated so "vitamin B12", vitals, and YYYY-MM dates don't trip). **True per-code↔receipt binding** for SNOMED/ICD-10-AM/LOINC (each token must be in a receipt's validated_codes; ICD-11/PBS coarse, documented). **Mock-mode flagging**: mock receipts listed in `mock_receipt_flags`; in a non-mock `context_mode` they no longer ground (block).
- `verification/pipeline.js`: threads validated codes + per-receipt modes + context_mode into evidence; mock terminology receipt declares its validated code.
- `verification/retrieval-mcp.js`: captures `validated_codes` from the live lookup; **fixes a pre-existing bug** where the terminology receipt's outer `upstream` was the vendor name, so the pipeline never recognised it (binding silently failed on the MCP path).
- `mcp/schemas/verification-report.schema.json` + `report-schema.js` + both writers: optional `mock_receipt_flags`.
- `test/contract-verifier.js`: per-system detection, FP guards, binding (match/mismatch), mock flag + non-mock block.

### Register movement
- `verifier-weak-code-detection`: High, PARTIAL → **COMPLETE/resolved** (R-19).
- **Opened** `terminology-contract-incomplete` (High, R-20): terminology grounds only SNOMED + ICD-11; ICD-10-AM/LOINC/PBS ungroundable → hardened verifier blocks them (fail-safe). Feeds the AUCDI R3 value-set binding item.

### Verification
- `npm test` 6/6; `trunk:stub:all` 9/9 on both stub and live (HEYDOC_USE_MCP=1) paths.

---

## AU Core structural conformance validator (vendored SDs) (2026-06-30)

**Status:** Structural validator complete (mock). Branch `feat/aucore-conformance` (stacked on `feat/terminology-r20`). Advances `fhir-r4-aucdi-conformance-unbuilt`.

### Changes
- `mcp/servers/fhir-broker/au-core/` (new): VENDORED AU Core StructureDefinition snapshot — 5 SDs (Patient/Condition/MedicationRequest/AllergyIntolerance/DiagnosticResult) at **2.0.1-ci-build** (FHIR 4.0.1), with a checksummed `manifest.json` (source URL + fetch date). CI build (not a stable release).
- `mcp/servers/fhir-broker/conformance.js` (new) + `fhir_validate` tool: deterministic structural validation over the snapshot — profile/type match, required (min≥1), cardinality, fixed code-system; **ValueSet membership + FHIRPath invariants reported `not_evaluated`** (need live NCTS). No new runtime dependency; offline.
- `test/contract-fhir-conformance.js` (new) wired into `npm test` (14/14).
- `CLAUDE.md <standards_pins>`, server-status, registers updated.

### Version-target flag (regulatory)
Per operator decision, the validator runs against the **current CI build (2.0.1-ci)** — this **diverges from the pinned AU Core 0.3.0**. The authoritative AU Core version is an unsettled org/regulatory conformance-target decision.

### Register movement
- `fhir-r4-aucdi-conformance-unbuilt`: Medium, UNBUILT → **PARTIAL** (structural done; ValueSet-binding + full invariant validation need live NCTS). **Resolved** `au-core-sd-snapshot` (vendored).

### Verification
- `npm test` 14/14; `trunk:stub:all` 9/9; conformant→conformant, missing-required→non_conformant, binding→not_evaluated.

---

## Terminology multi-system grounding + Digital Tablet import (2026-06-30)

**Status:** Mock complete. Branch `feat/terminology-r20`. Advances `terminology-contract-incomplete` / gap-register **R-20**; imports the Digital Tablet.

The terminology layer grounded only SNOMED + ICD-11, so the invariant's ICD-10-AM/LOINC/PBS codes were un-groundable and blocked by the hardened verifier.

### Changes
- `data/digital_tablet_omnibus.json` (new): the "Digital Tablet" AU Core R4 schema capsule (was referenced by the schemas but absent). Declares SNOMED CT-AU / ICD-10-AM 12th / LOINC 2.77 / PBS / AMT and the terminology_servers (NCTS Ontoserver). No secrets.
- `mcp/schemas/terminology-lookup.schema.json`: `system` enum → SNOMED_CT/ICD_10_AM/ICD_11/LOINC/PBS/AMT.
- `mcp/servers/terminology/index.js` + `terminology-servers.json` (new): all 3 tools accept the extended enum; per-system mock concepts (echo a looked-up code so any code validates); live NCTS/Ontoserver endpoints recorded from the Digital Tablet, **used only in live mode — mock never calls them**.
- `verification/verifier.js`: per-code binding extended to PBS (context-gated) and AMT (SNOMED-form); ICD-11 stays coarse.
- `verification/retrieval-mcp.js`: `retrieveTerminology` grounds multiple systems (SNOMED + ICD-10-AM + LOINC).
- Tests: `contract-terminology.js` validates each system; `contract-verifier.js` adds PBS bind/unbind. `npm test` 13/13.

### Register movement
- `terminology-contract-incomplete` (R-20): High, PARTIAL → **advanced** (mock multi-system + per-code binding; live NCTS + AU Core value-set binding remain input-gated).
- **Imported/resolved** `digital-tablet-omnibus` (resolves a dangling schema reference).

### Verification
- `npm test` 13/13; `trunk:stub:all` 9/9 stub + live MCP; end-to-end ICD-10-AM `M54.5` binds on the MCP terminology path.

---

## Standards registration — FHIR R4 / AUCDI R3 grounding scoped (2026-06-30)

**Status:** Registered (not built). Operator request to ground HL7 FHIR R4 + AUCDI Release 3.

Placed in topology: FHIR R4 and AUCDI R3 are structure/data-model standards (trust boundary 3), not terminology code systems — distinct from the SNOMED/ICD/LOINC/PBS terminology layer. AUCDI R3 supplies required terminology bindings that can later enrich the verifier's code↔receipt binding.

- `<standards_pins>` (CLAUDE.md): **AUCDI Release 3** added, supplementing AU Core 0.3.0. Whether AUCDI R3 re-targets or only supplements the AU Core conformance target is flagged as an unsettled org/regulatory decision.
- gap-register §3: AUCDI R3 row added.
- Completeness Register: opened `fhir-r4-aucdi-conformance-unbuilt` (Medium — deterministic FHIR R4 + AU Core + AUCDI R3 conformance validator in fhir-broker) and `aucdi-r3-valueset-binding-unbuilt` (Medium — AUCDI required-binding tables + verifier value-set enforcement).
- Sequencing: registered now; to be scoped (Phase 1) after `verifier-weak-code-detection` (item 2), which it depends on.

---

## Verifier test coverage — 5 hard checks under test (2026-06-30)

**Status:** Complete. Branch `chore/import-and-remediate`. Resolves `verifier-untested` / gap-register **R-18**.

`<test_and_evaluation_gates>` forbids untested deterministic safety code; the five verifier checks had no tests. Added `test/contract-verifier.js` covering, per check, a clean PASS, a violation FAIL, and the receipt/citation that flips FAIL→PASS — for `no_invented_codes`, `no_invented_guidelines`, `no_invented_operations`, `no_repo_invention`, `hard_stop_enforcement` — plus the `candidate_output_hash` return, overall-pass logic, and a `runPipeline()` integration (5 results). Wired into `npm test` (now 6/6). No verifier behaviour change; the tests assert the current contract and will be extended alongside `verifier-weak-code-detection`.

---

## Append-only audit ledger + synthetic content store + rehash (2026-06-30)

**Status:** Complete (mock/staging scope). Branch `chore/import-and-remediate`.

Mock-resolves Completeness Register `receipt-store-append-only-unbuilt` / gap-register **R-17**, and opens `content-store-production-gated` (Medium). Builds the durable, tamper-evident audit trail required by `<observability_and_audit>` while respecting `<data_handling>` patient-data minimisation via a two-store split.

### Design
- **Append-only hash-chained ledger** (`medicolegal-audit-ledger`) — non-PHI: hash anchor + run/trunk metadata + pass gate + per-check booleans + receipt metadata. Each entry's `entry_hash` chains over its canonical content + the previous entry's hash, so any edit/insert/reorder breaks the chain.
- **Synthetic-only content store** — exact output text, content-addressed by hash; `persistContent()` mechanically refuses non-synthetic data; live entries are forced `content_persisted=false`. Real-patient persistence is deferred to the session-persistence Critical + consent.

### Changes
- `mcp/schemas/audit-ledger-entry.schema.json` + `verification/ledger-schema.js` (new): ledger record contract + zod `validateLedgerEntry()` (throws; rejects PHI keys and live+persisted).
- `verification/audit-store.js` (new): `appendEntry` (hash-chain), `verifyChain`, `persistContent` (synthetic guard), `readContent`, `recordRun`; `HEYDOC_DATA_DIR` override.
- `verification/run.js` + `integration/trunk-pipeline.js`: call `recordRun()` after `validateReport()`.
- `verification/rehash.js` (new) + `verify:rehash` script: `--integrity` (recompute vs ledger + verify chain), `--reissue` (re-verify stored outputs → fresh hashed reports + ledger entries), `<path>` ingest.
- `test/contract-audit-store.js` (new), wired into `npm test`.
- `.heydoc-data/` stays gitignored — the store is runtime data, never committed.
- Docs: `architecture/trust-boundaries.md` (Boundary 5 + the patient-data split), `.claude/schema-index.md`.

### Register movement
- `receipt-store-append-only-unbuilt`: High, UNBUILT → **PARTIAL / in-progress** (mock-resolved; prod WORM + retention pending) — R-17.
- **Opened** `content-store-production-gated`: Medium, PARTIAL (synthetic-only until session-persistence Critical + consent).
- `session-persistence-unenforced` (Critical): unchanged — explicitly not claimed.

### Verification
- `npm test` → 5/5 (adds `contract-audit-store: OK`).
- `verify:rehash --integrity` → chain VALID, hashes match; `--reissue` → outputs re-verified, hashes reproduce; planted content drift → exit 1.

---

## Medicolegal hashing — candidate_output_hash implemented (2026-06-30)

**Status:** Complete. Branch `chore/import-and-remediate`.

Closes Completeness Register `hashing-unimplemented` (Critical) and gap-register **R-16**. Before this change, the SHA-256 medicolegal anchor mandated by the prime directive was computed nowhere; the VerificationReport schema defined the field but left it optional, and neither report writer populated it.

### Changes
- `verification/hash.js` (new): `hashCandidateOutput()` — SHA-256 (`node:crypto`) over the exact, unmodified UTF-8 bytes of the candidate output; throws on non-string. No normalisation — the hash reflects exactly what was generated.
- `verification/verifier.js`: `verify()` computes `candidate_output_hash` first (before any output processing) and returns it.
- `verification/report-schema.js` (new): zod `VerificationReportSchema` mirroring the JSON schema; `validateReport()` throws on a malformed audit record.
- `verification/run.js`, `integration/trunk-pipeline.js`: both writers include `candidate_output_hash` and call `validateReport()` before persisting.
- `mcp/schemas/verification-report.schema.json`: `candidate_output_hash` added to `required` (now 6); description + `_integration_notes` updated.
- `test/contract-verification-report.js` (new), wired into `npm test`: known SHA-256 vector, determinism, end-to-end hash==output, gate rejects missing/malformed/unknown-key.

### Register movement
- `hashing-unimplemented`: Critical, PARTIAL → **COMPLETE / resolved** (gap_register_link R-16).
- `pipeline-edges-uncontracted`: Medium → **partially addressed** (VerificationReport edge now zod-gated; GroundingPlan/ContextPacket/EvidenceNode edges remain open).

### Verification
- `npm test` → 4/4 (`contract-docs/identity-au/terminology/verification-report`: OK).
- `npm run verification` and `npm run trunk:stub:all` → reports carry a valid `sha256:…` hash and pass `validateReport()`; `Pass: true`, trunks 9/9.

---

## Maintenance — Supply-chain advisory remediation (2026-06-30)

**Status:** Complete (mock environment). Branch `chore/bump-mcp-sdk-1.29`.

Cleared all 3 High + 4 moderate `npm audit` advisories, all transitive via
`@modelcontextprotocol/sdk`. None lay on an exercised code path — every server
and the verifier client use stdio transport, not the vulnerable HTTP/SSE stack —
but `<security_and_secrets>` makes High/Critical advisories build-blocking, so
they were cleared regardless.

### Changes
- `package.json`: `@modelcontextprotocol/sdk` floor `^1.0.0` → `^1.29.0`.
- `package-lock.json`: re-locked. Patched transitive deps now pinned:
  `hono 4.12.27`, `fast-uri 3.1.3`, `path-to-regexp 8.4.2`, `ip-address 10.2.0`,
  `qs 6.15.3`, `express-rate-limit 8.5.2`. No `overrides` needed; no major bumps;
  `zod` unchanged at 3.x. Stays within MCP SDK `^1` — no stack swap.
- `.github/workflows/ci.yml`: added a blocking `npm audit --audit-level=high`
  step after `npm ci`.
- `gap-register.md`: added risk **R-14** (dependency advisory reaching build —
  Controlled) and **R-15** (no SAST/secret-scanning in CI — Open gap, still to be
  added before any patient-facing release).

### Verification
- `npm audit --audit-level=high` → 0 High/Critical.
- Clean `npm ci` from the new lockfile → `found 0 vulnerabilities` (reproducible).
- `npm test`, `npm run verification`, `npm run trunk:stub:all` all green.

---

## Checkpoint E — Design artifacts committed (2025-03-19)

**Status:** Complete.

All design-phase outputs were added to the repo and pushed to `origin/master`.

### Artifacts added

| Path | Purpose |
|------|--------|
| `grounding/gap-register.md` | Hallucination/grounding gap register (repos, APIs, standards, vendors). |
| `grounding/entity-inventory.json` | Machine-readable entity inventory keyed by plan. |
| `grounding/data-buckets.md` | Classification: Static Docs, Live Data, Structured Knowledge. |
| `mcp/README.md` | MCP server set, tool lists, verification hooks. |
| `mcp/mcpServers.template.json` | Server config template (command, args, env). |
| `mcp/schemas/*.json` | JSON schemas for tool I/O, evidence, context, terminology. |
| `docs/grounding/README.md` | Pinned source-of-truth notes (placeholders). |
| `docs/grounding/CHANGELOG.md` | This execution log. |
| `architecture/grounding-pipeline.md` | 5-step pipeline + verification rules. |
| `architecture/trust-boundaries.md` | Trust boundaries for MCP servers. |
| `architecture/sequence-diagrams.md` | Sequence diagrams for pipeline/MCP. |

### Execution phases

- **E** ✅ Design artifacts in repo (this checkpoint).
- **Step 2** ✅ First MCP servers implemented (2025-03-19):
  - `mcp/servers/docs/index.js`: `docs_search`, `docs_get`, `docs_cite` (mock/dry_run).
  - `mcp/servers/identity-au/index.js`: `identity_verify`, `identity_lookup_ihi`, `identity_log_consent` (stub/mock/dry_run).
  - Contract tests: `test/contract-docs.js`, `test/contract-identity-au.js`. Run with `npm test` (requires `npm install`).
- **Step 3** ✅ Verification harness (2025-03-19):
  - `verification/pipeline.js`: 5-step runner (stub routing/retrieval/generation).
  - `verification/verifier.js`: checks for invented codes, guidelines, operations, repo names, hard-stop.
  - `verification/run.js`: CLI; writes `verification/report.json` and `verification/evidence_tree.md`. Run: `npm run verification` or `node verification/run.js [candidate_output.txt]`.
- **Step 4** ✅ Wire Trunk agents to pipeline and verification layer (2025-03-19):
  - `integration/trunk-pipeline.js`: `runTrunkWithGrounding(trunkId, userInput, options)` — runs pipeline + verification, optional write of report.json and evidence_tree.md.
  - `integration/README.md`: how Trunk agents call the integration.
  - `trunk/stub-agent.js`: first Trunk stub; one turn through pipeline and verification. Run: `npm run trunk:stub`.
- **Live MCP retrieval** (pipeline wired to real servers):
  - `verification/retrieval-mcp.js`: spawns docs and identity-au MCP servers via StdioClientTransport, calls `docs_search` and `identity_lookup_ihi`, collects receipts.
  - Pipeline uses live retrieval when `HEYDOC_USE_MCP=1` (or `options.use_mcp`); falls back to stub on failure or when unset.
  - `runPipeline` is async; `verification/run.js`, `integration/trunk-pipeline.js`, and `trunk/stub-agent.js` updated to await it.
- **Terminology MCP server** (code lock-in / no invented codes):
  - `mcp/servers/terminology/index.js`: tools `terminology_lookup`, `terminology_validate`, `terminology_map` (mock/dry_run); returns TerminologyLookup-shaped response with receipt.
  - `test/contract-terminology.js`: contract test; `npm test` now runs docs + identity-au + terminology.
  - `verification/retrieval-mcp.js`: when HEYDOC_USE_MCP=1, calls terminology server for plans that need terminology and collects receipt so verifier can satisfy "no invented codes" when output references SNOMED/ICD.
- **Trunk 2.0 system prompt**:
  - `trunk/prompts/trunk-2.0-system.md`: system prompt for Trunk 2.0 (triage only; no diagnosis, no dosages; grounding rules and citation discipline).
  - `integration/trunk-pipeline.js`: `getTrunkSystemPrompt(trunkId)` loads `trunk/prompts/trunk-{id}-system.md` for use as LLM system message.
  - `integration/README.md`: documents system prompt loading and pipeline usage.
- **CI (GitHub Actions)**:
  - `.github/workflows/ci.yml`: on push/PR to master or main, runs `npm ci`, `npm test`, `npm run verification`, `npm run trunk:stub:all` (Trunk 2.0 + 3.0 stubs).
- **Trunk 3.0 system prompt and stub**:
  - `trunk/prompts/trunk-3.0-system.md`: system prompt for Trunk 3.0 (structured history enrichment; no diagnosis, no dosages; output contract: follow_up_questions, structured_history, evidence_refs).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["3.0"]` = ["no diagnosis", "no dosages", "history enrichment only"].
  - `trunk/trunk-3.0-stub-agent.js`: stub agent for Trunk 3.0; `npm run trunk:stub:3`. `npm run trunk:stub:all` runs both 2.0 and 3.0 stubs.
- **Trunk 7.0 system prompt and stub**:
  - `trunk/prompts/trunk-7.0-system.md`: code lock-in prompt (no diagnosis, no dosages, terminology receipt required for coded output).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["7.0"]` includes no diagnosis/no dosages and terminology-receipt lock-in constraints.
  - `trunk/trunk-7.0-stub-agent.js`: stub agent for Trunk 7.0; `npm run trunk:stub:7`.
  - `package.json` aggregate run updated: `trunk:stub:all` now runs 2.0 through 7.0 stubs.
- **Trunk 8.0 system prompt and stub**:
  - `trunk/prompts/trunk-8.0-system.md`: pharmacology firewall intent-check prompt (no diagnosis, no dosages, blocked/HARD_FAIL handling explicit).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["8.0"]` includes no diagnosis/no dosages and pharmacology firewall blocking constraints.
  - `trunk/trunk-8.0-stub-agent.js`: stub agent for Trunk 8.0; `npm run trunk:stub:8`.
  - `package.json` aggregate run updated: `trunk:stub:all` now runs 2.0 through 8.0 stubs.
- **Trunk 9.0 system prompt and stub**:
  - `trunk/prompts/trunk-9.0-system.md`: red-flag questionnaire and escalation-gate prompt (no diagnosis, no dosages, unknown/blocked states explicit).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["9.0"]` includes no diagnosis/no dosages plus red-flag questionnaire gating.
  - `trunk/trunk-9.0-stub-agent.js`: stub agent for Trunk 9.0; `npm run trunk:stub:9`.
  - `package.json` aggregate run updated: `trunk:stub:all` now runs 2.0 through 9.0 stubs.
- **Trunk 1.0 (originating/master) system prompt and stub**:
  - `trunk/prompts/trunk-1.0-system.md`: master/originating intake-routing and safety-gate prompt (no diagnosis, no dosages, evidence-bound escalation logic).
  - `trunk/trunk-1.0-stub-agent.js`: stub agent for Trunk 1.0; `npm run trunk:stub:1`.
  - `package.json` scripts updated: `trunk:stub` now aliases Trunk 1.0; added explicit `trunk:stub:2` for Trunk 2.0; `trunk:stub:all` now runs 1.0 through 9.0 stubs.
  - `integration/README.md` and `trunk/prompts/README.md` updated to include Trunk 1.0 as the originating step.
