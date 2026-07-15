# R1 + R2 — trunk constraint honesty, and the risk model (PLAN — awaiting Phase 2 approval)

> Mode: IDE Planner. Produced 2026-07-15 at `main @ 9b93eb5`. **Nothing here authorises code.**
> Design basis: `.planning/TRUNK-RISK-MODEL.md` (approved direction: "Plan R1+R2 together").
> Inputs read: all 9 `trunk/prompts/trunk-*-system.md`, `docs/grounding/trunk-constraints.md` (311 ln),
> all 9 `.claude/trunk-cheatsheets/*.md`, `trunk/*-stub-agent.js`, `verification/verifier.js`,
> `verification/integrity-detectors/{index,detectors}.js`, `verification/context-allowlist.js`.

## Phase 0 — Completeness scan (done, read-only)

No `BLIND_STUB` or `DEAD_END` on this path. The nine prompts, the constraints doc and the cheatsheets
are all present and in sync **except** for the defect this plan fixes (F1). No test covers prompt
content (F6) — so R2 cannot regress a test, and nothing currently protects it either.

---

## Phase 1 — Findings

### F1 — **The prompts are the sole outlier. The docs were already honest.** `[the whole of R1]`

`docs/grounding/trunk-constraints.md` — the source of truth — states per trunk:

```
**Verifier checks triggered:** no_invented_codes, no_invented_guidelines,
                               no_invented_operations, no_repo_invention[, hard_stop_enforcement]
```

**No diagnosis check. No dose check. It never claimed one.** The derived cheatsheets are *also* honest,
and go further — `.claude/trunk-cheatsheets/trunk-5.0.md` separates the two categories already:

```
Verifier checks that apply: no_invented_codes, no_invented_guidelines, no_invented_operations, no_repo_invention.
Literal constraints: ["no diagnosis","no dosages","Axis B rule-out per template"]
```

The mechanical/conventional split is **half-made**. Nobody joined the dots and said: *the literal
constraints are not among the checks.*

Then each of the nine prompts ends with:

```md
## Constraints (enforced by verification)
- No diagnosis.
- No dosages.
```

**The prompts invented an enforcement claim the contract never made.** This inverts the usual
`<context_loading>` rule ("when a derived file and its source disagree, the source wins"): here the
source and the derived file agree with each other, and the *implementation* is the defect.

⇒ R1 is not a redesign. It is **making nine files say what the contract already says**.

### F2 — What verification actually catches `[measured, not inferred]`

Five verifier checks (`no_invented_codes`, `no_invented_guidelines`, `no_invented_operations`,
`no_repo_invention`, `hard_stop_enforcement`) — none looks for a diagnosis or a dose. Two detectors do,
correctly wired (monotone AND: a detector failure fails the output and can never rescue it), but narrow:

| output | caught? |
|---|---|
| `The patient has appendicitis.` | **no** |
| `This is definitely appendicitis.` | **no** — `overconfidentDiagnosis` needs "definitely" within 40 chars of "diagnos" |
| `Diagnosis: appendicitis.` | **no** |
| `Take 500 mg of amoxicillin three times daily.` | **no** — `advisoryDoseLeak` needs *advisory framing* too (it targets G9, one named leak) |

The detectors are **targeted, and that is correct design** — a general dose regex would false-positive on
a trunk legitimately quoting a PharmCheck receipt. The bug is the **claim**, not the detector.

### F3 — 9/9 prompts: 4–6 negative statements, **zero** positive scope `[the whole of R2]`
No trunk says what it is *for*. A wall has one setting; nothing states the tariff.

### F4 — 9/9 prompts name **zero** of the LLM-specific failure modes
`sycophancy` · `anchoring` · `positional` · `confabulation` · `premature closure` → 0 files each.
These are the modes with no bedside analogue, i.e. the ones a clinician reviewer will not catch.

### F5 — The constraint lives in **three** places; all must move together
`trunk/prompts/*-system.md` (9) · `trunk/*-stub-agent.js` (the stub output strings) ·
`.claude/trunk-cheatsheets/*.md` (9, derived) — plus `docs/grounding/trunk-constraints.md` as source.
Per `<context_loading>`'s maintenance rule, the derived files move **in the same phase**.

### F6 — **Nothing tests prompt content** `[and this is R1's opportunity]`
No test reads `trunk/prompts/`. So R1's fix would be unprotected — and the same class of drift could
recur the moment someone adds a constraint line.

⇒ **R1 ships a bar, not just a wording fix** (see R1-c). Making the honesty *mechanical* is the same
principle the exercise is about, applied to itself.

---

## Phase 2 — Design

### Topology impact
**Trunks:** all nine — **prompt text and derived docs only**. **Servers:** none. **Schemas:** none.
**Receipts:** none. **Verifier:** **unchanged** — R1/R2 add no check and remove none; they describe the
existing bars accurately. One **new contract test**. **Trust boundaries:** #1 (LLM vs deterministic
truth) is *described* more accurately; nothing about it moves.
**Blast radius:** zero on pipeline behaviour. The trunk stubs are deterministic string emitters; the
prompts are not executed by CI. `npm test` / `verification` / `trunk:stub:all` must be **unaffected**,
and that is itself the proof this is a text change.

### The four-field model (per trunk)

```md
## Altitude
<where on the effort/yield curve; what this trunk may SPEND; what it inherits and what inherits it>

## What you are FOR
<positive scope — "You MAY: …". The tariff, not the wall.>

## The failure mode HERE
<the specific way THIS trunk goes wrong, named for a language model at this position>

## The bars
MECHANICAL (verification will fail your output): <only checks that actually exist>
CONVENTIONAL (nothing enforces this — it holds because you hold it): <the rest, named honestly>
```

Field 4 is the whole point: an unenforced constraint labelled "enforced" is the F1 defect. A constraint
labelled **conventional** is a registered gap someone can close.

### The altitude assignment (from the operator's allegory)

| trunk | altitude | may spend | the bias that bites |
|---|---|---|---|
| 1.0 | the crevasses — visible, lethal, front-loaded | freely: yield is highest here | availability (the vivid recent miss) |
| 2.0 | the crevasses | freely | availability · framing |
| 3.0 | thinning air | **less** — marginal yield falling | anchoring sets in |
| 4.0 | thin air, acclimatising | **less** — reassurance accumulates | anchoring hardens into a frame |
| **5.0** | **summit + death zone** | peak — and **you become the gravity** | **premature closure** (no internal signal) |
| 6.0 | descent begins | flows — but **this is where the deaths are** | sycophancy toward T5's frame |
| 7.0 | descent | flows | sycophancy · positional bias in code lists |
| 8.0 | descent — **the last belay** | flows | sycophancy (agreeing past a HARD_FAIL) |
| 9.0 | descent — the final gate | flows | premature closure (we already have the answer) |

**Most Everest deaths are on the descent.** T6–T9 run inside T5's frame; that is where anchoring
propagates, closure bites and sycophancy compounds. The altitude text says so, per trunk.

### What R1/R2 do NOT do
- **No verifier change.** Not one check added, removed or altered.
- **No relaxation.** Every literal constraint stays; it is *re-labelled*, not lifted.
- **No M1–M4.** The blind commit, descent guard, positional stability and register separation are
  R3–R6, separately planned. R1/R2 make the ground truthful so those can be built on it.

---

## Phases

### R1-a — Relabel the nine prompts' constraint blocks `[the false claim]`
Replace `## Constraints (enforced by verification)` with the MECHANICAL/CONVENTIONAL split, per trunk,
sourced from `trunk-constraints.md`'s existing `Verifier checks triggered` line (which is already
correct — no new fact is invented).
**Verify:** every mechanical claim names a check that exists in `verifier.js` or `DETECTORS`; every
literal constraint from the cheatsheet's `Literal constraints` still appears, under one heading or the
other. Diff review: nothing *removed*, only *re-labelled*.

### R1-b — Register the gap `[honesty made durable]`
New register item `trunk-constraint-claims-unenforced`:
`state: PARTIAL` · `safety_class: presents_mock_as_live` — a **conventional** constraint presented as a
**mechanical** one is precisely that · `risk: High` · `blocks_patient_facing: false` (nothing is) ·
`invariant_exposure: no-autonomous-diagnosis / no-autonomous-prescription — the constraints are real
obligations, but the enforcement was overstated in 9 files, which is how a gap stops being asked about`.
Mirror to the gap-register (High → one-way promotion), `.claude/completeness-index.md`, `CHANGELOG.md`.

### R1-c — **The bar: `contract-trunk-claims.js`** `[NEW — makes the honesty mechanical]`
A prompt may not claim an enforcement that does not exist. The test:
1. Parse every `MECHANICAL (…)` bullet in all nine prompts.
2. Assert each names a check present in `verifier.js`'s emitted `check:` set **or** in
   `integrity-detectors`' `DETECTORS`.
3. Assert no prompt contains the string `enforced by verification` outside a MECHANICAL block.
4. Assert every trunk's mechanical list **matches** `trunk-constraints.md`'s `Verifier checks triggered`
   for that trunk — so the prompt can never drift from the contract again.
**Verify:** tamper-proven — add `- no_diagnosis_check` to a prompt's MECHANICAL block → the test FAILS
naming it; remove → passes. Wired into `npm test`.
**This is the phase that stops F1 recurring**, and it is why R1 is worth more than a find-and-replace.

### R2 — The nine rewrites to the four-field model
Trunk 5.0 first (the worked example in `TRUNK-RISK-MODEL.md`), then 1–4, then 6–9. Each gains Altitude /
For / Failure-mode / Bars. F4's four failure modes are named where they apply (per the altitude table).
**Verify per trunk:** `contract-trunk-claims` green (R1-c protects each rewrite as it lands);
`npm run trunk:stub:all` green; the cheatsheet's `Output contract keys` and `Fail-safe status`
byte-identical to before (R2 does not touch contracts — if a key moves, the rewrite is wrong).

### R3 — Sync the derived artifacts `[same phase, per the maintenance rule]`
`.claude/trunk-cheatsheets/*.md` gain the mechanical/conventional split (they already carry both halves
— this joins them). `trunk-constraints.md` gains one paragraph stating the distinction explicitly, so
the next author inherits it. Stub-agent strings re-worded to match. `CHANGELOG.md` + register synced.
**Verify:** `npm test` + `npm run verification` + `npm run trunk:stub:all` green and **unaffected**;
frozen `pharm-intent`/`pharm-check`/`verification-gate.js`/`verifier.js` byte-unchanged vs `9b93eb5`.

---

## Verification summary

| Milestone | Proof | Expected |
|---|---|---|
| R1-a | diff review: re-labelled, nothing removed | every literal constraint still present |
| R1-b | register + gap-register + index + CHANGELOG | `trunk-constraint-claims-unenforced` open, High |
| R1-c | `contract-trunk-claims`, tamper-proven | a fabricated mechanical claim FAILS; real ones pass |
| R2 | `contract-trunk-claims` green ×9; `trunk:stub:all` | 9/9 rewritten; contract keys byte-identical |
| R3 | `npm test`, `verification`, `trunk:stub:all`; frozen byte-diff | green, **unaffected**, empty diff |

## Invariant check

**Every hard limit preserved; nothing relaxed.** *No autonomous diagnosis* / *no autonomous
prescription* — both remain absolute obligations on every trunk; R1 changes **where the sentence sits**
(CONVENTIONAL, not MECHANICAL), not whether it binds. *HARD_FAIL non-overridable* — untouched.
*Dose-source-singular* — untouched. *Scoring-store firewall* — untouched. *Hashing* — untouched.
No verifier check added, removed or weakened; no schema, server or receipt touched.

**The safety posture goes UP:** a false enforcement claim in nine files becomes a registered gap with a
mechanical bar against recurrence. Today the system asserts a property it does not have — R1 stops that,
which is the precondition for M1–M4 meaning anything.

## Register impact
**Opens:** `trunk-constraint-claims-unenforced` (PARTIAL, High, `presents_mock_as_live`) → mirrored to
gap-register (one-way, High). **Closes:** nothing. **Re-classifies:** nothing.
**Unblocks:** R3–R6 (M1 blind commit, M2 descent guard, M3 positional stability, M4 register
separation) — each needs a truthful baseline to attach to.

## New dependencies
**None.** No package, no schema, no runtime code. One new test file using the existing house pattern.

---

## Decisions needed before Phase 3 (GATE)

- **D-R-1 — R1-c's strictness.** Should the test require the prompt's mechanical list to *exactly match*
  `trunk-constraints.md`, or merely be a subset of the checks that exist? *Recommend **exact match***:
  a subset lets a prompt quietly under-claim, and the constraints doc is the contract. Cost: adding a
  verifier check means touching two files. That cost is the point.
- **D-R-2 — how blunt should the failure-mode text be?** The T5 draft says *"you will not FEEL the
  unaccounted-for abnormal calcium"* — written to the model, in the second person, about its own
  architecture. *Recommend keeping it blunt*: a prompt that describes the model's actual failure mode
  in plain terms is more likely to be attended to than a euphemism. But it is unusual, and it is your
  system prompt.
- **D-R-3 — do the stub agents need rewording at all?** They emit fixed strings for contract tests; the
  wording is cosmetic there. *Recommend yes, minimally* — a grep for "No diagnosis or dosages" should
  not land a future reader on a string that repeats the false framing.
- **D-R-4 — R2 order.** T5 first (highest value, the worked example is done), or 1→9 in sequence?
  *Recommend T5 first*, then the descent (6–9, where the deaths are), then the climb (1–4).
