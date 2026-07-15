# The Evidence Plane — landing what we hold with the clinician

> Mode: AI Architect → IDE Planner. Produced 2026-07-15 at `main @ 17da525`. **Nothing here authorises code.**
> Operator ruling 2026-07-15: *"TAKE THE HANDBRAKE off… make these HELPING things HIT where they need to
> LAND — with the CLINICIAN and when appropriate with the PATIENT."*
> Extends `.planning/SHOW-EVIDENCE-PRINCIPLE.md` (which named the pattern; this builds the thing).
> **Amends `.planning/FL-34-PHASE-B-PLAN.md` — F3 flips (see §5).**

## 1. Why only 11 doses — the actual answer

Not a safety bar. **A hardcoded array.**

```js
// scripts/pharm-dose-author.mjs:38
export const TIER_A = ["methotrexate", "carbamazepine", "metformin", "sulfasalazine", "phenytoin",
  "alendronate", "apixaban", "dabigatran", "simvastatin", "rivaroxaban"];
// :129
const wanted = [...TIER_A, "amoxicillin"];   // ← the gate. 11 drugs.
```

The clinician transcribed **471 APF22 ingredients**. **336 match the datastore exactly.** The author
script ran on **11**. The other ~325 readable, matched, clinician-transcribed adult doses were never
authored — because `wanted` is an eleven-element list from the C2 risk-tiered first pass, and nobody
widened it.

The machinery around it is **already built to the show-evidence principle** and already tested. Its own
header says so:

> *"NOTHING IS BINNED. Under the show-evidence principle every readable adult dose is WRITTEN, carrying
> its plausibility state… `implausible` is a WARN for the clinician, never a veto; `unassessable` states
> that no plausibility claim is made rather than implying an all-clear. The clinician disposes."*

So the segmentation, the plausibility assessor, the congruence appraiser, the AHPRA-gated origin bar, the
worksheet round-trip and the re-seal are all done and green. **The only thing standing between 11 doses
and ~336 is the array.** This is the handbrake, and it is one line.

## 2. Where the real constraints are (three, and only three)

| Constraint | Real? | Effect on the widening |
|---|---|---|
| **Paediatric (232 APF rows held)** | **Yes — a hard limit, and the operator's own §1 carve-out.** No paediatric tables exist; under-18 → in-person review. | Stays held. Does not touch the ~336 adult doses. |
| **Name normalisation (336/471 = 71%)** | **Yes — and it's a *silent-miss* bug, not a bar.** A dose authored under "amoxycillin" is invisible to a lookup for "amoxicillin". | Doesn't block the 336 that *do* match. Fixing it (FL-06, `rxnorm-nlm`) adds up to ~135 more. |
| **Each tranche needs KL's attestation** | **Yes — and it's the point.** Guardrail 2: engine proposes, practitioner disposes. | Not a bottleneck: KL attested **308 records in a single pass** on 2026-07-14. |

Everything else I have been calling a constraint was me. `implausible` is already a WARN not a veto.
`non_congruent` already ships freely with no note. `unassessable` already refuses to imply an all-clear.

## 3. The Evidence Plane — the design, using what is already built

The unlock is a distinction I had collapsed:

> **"No autonomous prescription" means the AI must not MINT a dose. It does not mean a registered
> practitioner may not be SHOWN one, with its provenance.**

The system already has two surfaces, and they are already separate:

| Plane | Artifact | Frozen? | Audience | Rule |
|---|---|---|---|---|
| **Authoritative** | `PharmCheck` (`pharm-check.schema.json`, `additionalProperties:false`) | **Yes — frozen, medicolegal** | patient-promotable | `dose_guidance` = the signed AU record **only**. Unchanged. |
| **Evidence** | `ReviewBundle` (`portal/review-bundle.js`) | **No** | **the clinician** | everything we hold, labelled for what it is |

`portal/review-bundle.js` already describes itself as *"what the clinician reviewer is SHOWN, as a hashed
contract"* — and it is already **hashed into `bundle_sha256`** precisely so the audit can prove *"not only
WHAT was approved but WHAT THE REVIEWER WAS LOOKING AT when they approved it."*

**That is the evidence plane. It exists. It is built, hashed, schema-gated, and not frozen.** It currently
carries `firewall_status` as a bare string and nothing else about the dose.

### The change: `ReviewBundle.dose_evidence[]`

One new array on the clinician's surface, carrying everything we hold, each item provenance-tagged and
explicitly `authority: "advisory"`:

```js
dose_evidence: [
  { kind: "au_dose_signed",     authority: "authoritative", jurisdiction: "AU",
    text: "<KL's verbatim APF22 text>", attested_by: "MED0001857758", receipt_ref: "<id>" },
  { kind: "international_label", authority: "advisory", jurisdiction: "US", agency: "FDA",
    text: "<verbatim label>", amass_id: "AMRC_…", note: "foreign label — evidence beside the AU dose, never a verdict on it" },
  { kind: "cds_dose_candidate",  authority: "advisory", provider: "au_oss_cds",
    text: "<OpenCDS dose_candidate>", km_set: "fl30-kb:v1", receipt_ref: "<id>",
    note: "second independent executor over the same signed records" },
  { kind: "literature",          authority: "advisory",
    text: "<dose_statement>", citation: { pmid: "37712551", verified: true },
    note: "reported in primary literature — NOT prescribing guidance" },
  { kind: "congruence",          authority: "advisory", status: "non_congruent",
    note: "AU differs from the foreign label. Normal — jurisdictions differ. Shown for your judgement." },
  { kind: "plausibility",        authority: "advisory", status: "implausible",
    note: "10x order-of-magnitude flag vs US label — a misplaced zero looks exactly like this. NOT a block." }
]
```

**Why this is safe *and* why it is safer than today:**

1. **The frozen schema is not touched.** `PharmCheck.dose_guidance` stays the signed AU record only.
   `pharm-check.schema.json` stays byte-identical. Hard limit intact, mechanically, unchanged.
2. **The bar between planes already exists** — `portal/verification-gate.js:99 releaseToPatient()`.
   Nothing auto-promotes. The clinician promotes, and their decision is bound to `candidate_output_hash`.
3. **The hash makes "the clinician saw it" *provable*.** R-47a built `assertEvidenceRendered()` for the
   attestation surface; `bundle_sha256` does the identical job at runtime, for free, because the evidence
   is *in* the bundle that is hashed into their decision.
4. **This CLOSES R-47b** — an open **High / `blocks_patient_facing:true`** item on the portal blocker,
   whose definition is literally *"the runtime surface must show a consulting clinician every
   `non_congruent` dose's US/EU comparators verbatim."* I have been treating R-47b as a reason to build
   nothing. It is the specification for this.
5. **The operator's own §1 limits hold, untouched:** HARD_FAIL still blocks unconditionally (it gates an
   **action**, not evidence); international doses still never enter `PharmCheck.dose_guidance`; the agent
   still may not author a dose (the substring bar).

### The engine correction the operator called for

```js
// verification/pipeline.js:178 — CURRENT
// Nothing here emits a dose; it only tightens continuation.

// PROPOSED
// Emits no AUTHORITATIVE dose — that stays the clinician-signed AU record. Carries the CDS
// evidence (dose_candidate, verdict, reason) to the CLINICIAN plane, where the practitioner
// disposes. The fold stays monotone on STATUS (it can only add severity); the evidence rides
// beside it and never promotes itself.
```

`composeCdsVerdict()` gains an `evidence` field on its return. It stays monotone on `status` — the safety
property is untouched. What changes is that the evidence it currently **discards** now reaches the person
whose job is to weigh it.

## 4. What this lands

| Asset | Records | Today | After |
|---|---|---|---|
| AU signed doses (`dose_guidance`) | 11 → **~336** | 11 reach the engine | widen `wanted`; KL attests one worksheet |
| US/EU labels (`international-dose-guidance`) | 12 | attestation-time only | **runtime, beside the AU dose** |
| Literature dose evidence (`dose-evidence`) | **261 signed, real PMIDs** | engine-isolated, reaches nobody | **clinician sees the literature** |
| OpenCDS `dose_candidate` | — | mapped then **discarded** | **second executor's opinion, shown** |
| Held queue (`dose-evidence-review-queue`) | 2 | held | shown as held, with reason |

**~610 clinician-attested artifacts that currently reach nobody, landing where they were always meant to.**

## 5. Consequence — FL-34 Phase B's F3 **flips**

My Phase B plan said: build no dose KM, because a gateway dose has no consumer and would be a `DEAD_END`.

**With the evidence plane, it has a consumer, and it is a genuinely valuable one.** OpenCDS becomes a
*second independent executor* over the same clinician-signed records. When its `dose_candidate` agrees
with the engine, that is corroboration. When it diverges, **that divergence is exactly what a clinician
should see** — it is a real dual-source cross-check, the kind of thing commercial CDS charges for.

So Phase B **gains** a dose KM (`getDoseGuidance` → the 11→336 signed records), and the "second dose
source with no reconciliation rule" objection dissolves: the reconciliation rule is *the clinician*, and
the two doses are shown side by side rather than silently merged. That was always the answer.

**F5 (the jurisdiction allowlist) still stands and is unaffected** — it governs what may become
*executable* knowledge. US/EU labels reach the clinician through the evidence plane, as labelled foreign
evidence; they still never become an AU dose in an executable KM. Show ≠ author. That limit is the
operator's own (§1.2) and it costs nothing here, because the evidence plane is the better route anyway.

## 6. Proposed sequence

| # | Step | Where | Gate |
|---|---|---|---|
| **E1** | Widen `wanted` past TIER_A → all 336 matching adult ingredients; generate the worksheet | `scripts/pharm-dose-author.mjs` | **plan-gated code** |
| **E2** | KL attests the worksheet (one pass, as with the 308) | `eval/pharmacology/signoff/` | **clinician** |
| **E3** | `ReviewBundle.dose_evidence[]` + schema + `buildReviewBundle` wiring; contract test asserts advisory items can never reach `PharmCheck.dose_guidance` | `portal/review-bundle.js`, `mcp/schemas/portal-review-bundle.schema.json` | **plan-gated code** |
| **E4** | `composeCdsVerdict` returns `evidence`; pipeline carries it to the bundle; comment corrected | `cds-adapter/index.js`, `verification/pipeline.js` | **plan-gated code** |
| **E5** | Close **R-47b**; re-classify `dose-congruence-surfacing-unbuilt` → COMPLETE | registers | Phase 4 |
| **E6** | FL-06 `rxnorm-nlm` normaliser → recovers up to ~135 more of the 471 | `scripts/` | plan-gated |
| **E7** | FL-34 Phase B dose KM (F3 flipped) | gateway repo | after E3/E4 land the consumer |

**E1+E2 alone take dose coverage from 11 to ~336 and need no architectural change at all.**

## Invariant check

**Every hard limit preserved, mechanically, and one open High item closed.**
*No autonomous prescription* — the AI still authors no dose (AHPRA-gated `origin.entered_by` + substring
bar); `PharmCheck.dose_guidance` still carries only the clinician's signed AU record; frozen schema
byte-unchanged. *No autonomous diagnosis* — untouched. *HARD_FAIL non-overridable* — untouched; the fold
stays monotone on status; no dose emits on HARD_FAIL/BLOCKED/paediatric. *Australian context only* —
foreign labels reach the clinician as labelled evidence, never `PharmCheck.dose_guidance`, never an
executable KM (F5). *Paediatric → flag never dose* — the 232 rows stay held. *Mock never as live* —
`receiptMode()` untouched; every advisory item carries its own provenance and receipt. *Scoring-store
firewall* — not touched. *Hashing* — strengthened: the evidence is inside `bundle_sha256`, so what the
clinician saw is now part of the medicolegal record.

**Register impact:** closes **R-47b / `dose-congruence-surfacing-unbuilt`** (High, `pf:true` — portal
blocker #2). Advances FL-06. Flips FL-34 Phase B F3. Opens nothing.
