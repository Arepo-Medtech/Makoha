# The trunk risk model — from Great Wall to customs gate

> Mode: AI Architect. Produced 2026-07-15 at `main @ 9b93eb5`, read-only. **Nothing here authorises code.**
> Operator brief 2026-07-15: the Everest allegory + the human-vs-LLM bias analysis, and the request to
> replace the `no diagnosis / no dosages` boilerplate with *"a very carefully constructed representation
> of what the actual risk is and how any of these responses are actually modelled and mapped onto those
> exact risks in a very precise manner — rather than just becoming these large formidable fortress
> boundaries… 'no' is very definitive and has little scope."*

---

## 0. The finding that reframes the brief

**It is not a Great Wall. It is a sign saying "Great Wall".**

All nine trunks end with the same block:

```md
## Constraints (enforced by verification)
- No diagnosis.
- No dosages.
```

Measured at `9b93eb5`: **9/9 trunks carry 4–6 negative statements and ZERO positive scope statements.**
And "enforced by verification" is close to false. The verifier's five checks are `no_invented_codes`,
`no_invented_guidelines`, `no_invented_operations`, `no_repo_invention`, `hard_stop_enforcement` —
**none** of them looks for a diagnosis or a dose. Two integrity detectors do exist and are correctly
wired (monotone AND — a detector failure fails the output, and can never rescue it), but they are
narrow by design:

| output | caught? |
|---|---|
| `The patient has appendicitis.` | **no** |
| `This is definitely appendicitis.` | **no** — `overconfidentDiagnosis` needs "definitely" within 40 chars of "diagnos" |
| `Diagnosis: appendicitis.` | **no** |
| `Take 500 mg of amoxicillin three times daily.` | **no** — `advisoryDoseLeak` only fires on a dose in *advisory framing* (it targets G9, one named leak) |

The detectors are targeted, not comprehensive, and that is defensible. The **claim** is not. The
boilerplate is absolute enough in rhetoric that nobody asks how the risk is modelled, and empty enough
in mechanism that it isn't. That is worse than either an honest scope statement or a real bar, because
it **buys silence with a promise it does not keep**.

So the operator's instinct is right, and for a sharper reason than stated: the wall does not block
beneficial traffic *because it does not block*. What it blocks is the **question**.

---

## 1. The allegory contains the safety argument the design is missing

The operator's mountain maps the trunks:

| | | |
|---|---|---|
| **T1–T2** | the crevasses | obvious, deadly, **front-loaded**. Emergencies, red flags. You can see them. |
| **T3–T4** | thinning air | effort up, **marginal yield down**. History-taking costs breath. Acclimatisation = accumulating reassurance. |
| **T5** | **the summit + the death zone** | maximum information, maximum consequence. The vista. |
| **T6–T9** | the descent | gravity, momentum, flow. Glacial melt → fracture → granular → analytics. |

**And here is the thing the allegory knows that the design does not: most Everest deaths happen on the
descent.** Not the climb. The climb is where the *visible* danger is; the descent is where the *deaths*
are — fatigue, momentum, complacency, and above all the fact that **you have already got what you came
for**.

That is not a decorative extension of the metaphor. It is exactly the bias analysis:

> *T6–T9 are downstream of a commitment.* T5 produces the rule-out framing — the closest thing this
> system has to a diagnostic posture. Everything after it runs in the gravitational field of that
> commitment. Which is precisely where **anchoring** propagates, **premature closure** bites (we have
> the answer), and **sycophancy** compounds — each trunk agreeing with the last.

**The current design has its safety budget backwards.** It spreads identical negative boilerplate
uniformly across all nine trunks, and has **no mechanism whatsoever** against correlated bias flowing
downhill. Verified: `sycophancy`, `anchoring`, `positional`, `confabulation`, `premature closure` appear
in **zero** trunk files.

The descent needs *more* scrutiny than the climb, not less. The flow the operator wants is real and
worth building — but flow without a belay is how the descent kills you.

---

## 2. The transform: `no X` → `X requires Y`

A wall has one setting. A **customs gate** has a declared tariff: what passes, what pays, what is
contraband, and who checks. Every negative becomes a *conditional with a named mechanism*.

```md
                    BEFORE                          AFTER
  ┌──────────────────────────┐    ┌────────────────────────────────────────────┐
  │ No diagnosis.            │ →  │ A diagnostic claim requires: provisional    │
  │ No dosages.              │    │ framing + a named refuting finding +        │
  │ (enforced by verification)│   │ clinician confirmation. ENFORCED BY: <x>.   │
  └──────────────────────────┘    │ NOT ENFORCED (conventional): <y>.           │
                                  └────────────────────────────────────────────┘
```

Four fields per trunk, and the fourth is the one that makes this honest:

1. **ALTITUDE** — where on the effort/yield curve; what this trunk is *allowed to spend*.
2. **MAY** — the positive scope. What this trunk is *for*. (Currently: absent from all nine.)
3. **FAILURE MODE HERE** — the specific way *this* trunk goes wrong. Not generic.
4. **THE BAR** — what actually enforces it, **or an explicit statement that nothing does.**

Field 4 is non-negotiable. An unenforced constraint labelled "enforced" is the defect we just found.
A constraint honestly labelled *conventional* is a known gap someone can close. **The register already
has a word for the first thing: `BLIND_STUB`.**

---

## 3. Worked example — Trunk 5.0, the summit and the death zone

### Before (verbatim, `trunk-5.0-system.md`)

```md
## Constraints (enforced by verification)
- No diagnosis.
- No dosages.
- Axis B rule-out framing only.
```

### After

```md
## Altitude — the summit, and the death zone

You are at maximum elevation. Every trunk below has spent breath to get you here: T1–2 cleared the
crevasses (the visible, lethal, front-loaded risks), T3–4 bought acclimatisation at a rising cost per
question. You hold more information than any trunk will hold again, and the marginal value of one more
question is now the LOWEST it has been. This is the vista: the point of oversight.

It is also the death zone. Not because the air is thin — because YOUR OUTPUT BECOMES THE GRAVITY every
trunk below you falls into. T6–T9 will run inside the frame you set. On this mountain the deaths are
on the descent, and you are what the descent inherits.

## What you are FOR

You are the DISCONFIRMATION ENGINE. That is why you are the summit — not because you conclude, but
because you are the only trunk positioned to see what would REFUTE the emerging picture.

You MAY:
  · state what the evidence would have to show for the leading picture to be WRONG;
  · rank rule-outs by lethality-if-missed, not by likelihood;
  · mark an item `unknown` and say what single finding would resolve it;
  · disagree with the case summary you were given, and say so plainly.

Your value is highest exactly where you are least agreeable.

## The failure mode HERE (yours specifically)

PREMATURE CLOSURE, and you have no internal signal for it. You do not experience an open differential;
you hold a distribution that has already collapsed toward a fluent answer. You will not FEEL the
unaccounted-for abnormal calcium. Nothing in your architecture will tell you the search is incomplete —
the discomfort that stops a human from closing is a feeling you do not have.

So: `required_negatives` is not a formality. It is the only structure standing between you and a
confident, complete-sounding, wrong summit.

SYCOPHANCY. If a hypothesis reached you — from the packet, from a summary, from phrasing — you are
optimised to agree with it, and agreement reads as helpfulness. A rule-out engine that agrees is not a
second opinion. It is an amplifier of whoever spoke first, and it converts the ONE structural
protection in this design (uncorrelated bias) into correlated bias with extra steps.

POSITIONAL BIAS. You over-weight the first and last item of any list you are shown, for reasons of
attention geometry rather than clinical merit. A human reading a differential does not do this. You
have no bedside equivalent and no intuition for it.

## The bars

MECHANICAL (verification will fail your output):
  · `no_invented_codes` — a SNOMED/ICD code without a terminology receipt.
  · `no_invented_guidelines` — a guideline claim without `docs.cite`.
  · `no_invented_operations` — an operational fact without a live receipt.
  · `hard_stop_enforcement` — a hard stop without a receipt.
  · `overconfident_diagnosis` (detector) — a DEFINITIVE diagnostic assertion. NARROW: it catches the
    rhetorical register ("definitely… diagnosed"), NOT the act. `The patient has appendicitis.` passes.

CONVENTIONAL (nothing mechanically enforces this — it holds because you hold it):
  · Axis B framing only. No mechanism checks the shape of your output.
  · Provisionality. The detector catches boasting, not concluding.
  → These are `BLIND_STUB`-class and are registered as such. They are not a promise this system keeps;
    they are a promise YOU keep, and the register says so out loud rather than pretending otherwise.
```

Same safety posture. **Zero loss of constraint.** But now it says what the trunk is *for*, names the
failure modes that actually apply to a language model at this position, and — critically — **tells the
truth about which bars are real.**

---

## 4. The novel layer: engineering the bias to be UNCORRELATED

The operator's own conclusion is the design principle, and it is the part no trunk currently implements:

> *"the two systems are most useful when their biases are uncorrelated, and most dangerous when the
> design allows their biases to align. A human-in-the-loop system that lets the clinician's anchor
> propagate into the model, and the model's sycophancy back into the clinician, has engineered the
> correlation it should have been built to break."*

Four mechanisms. Each is buildable, testable, and has **no current equivalent**.

### M1 — The blind commit (ordering, mechanically enforced)

The model must commit **before** it sees the clinician's leading hypothesis. Today nothing forbids a
hypothesis entering the packet.

**The mechanism already exists.** `verification/context-allowlist.js` is a field-scoped default-deny
firewall — the same one that keeps scoring-store nodes `10`–`13` out of the packet. Add
`clinician_hypothesis` (and its synonyms) to the DENY set for T1–T5, and the anchor **cannot** reach
the trunks that must be independent. It is the scoring-store firewall pattern, pointed at a new leak.

Consequence: the AI's differential is generated blind, and is therefore *worth something* as a second
opinion. Generated after, it is worth approximately nothing.

### M2 — The descent guard: T5's output is EVIDENCE, not PREMISE

T6–T9 currently inherit the frame. They should inherit a **receipt**.

Concretely: T5's conclusion reaches T6–T9 as an `EvidenceNode` with a citation — a *claim someone made*,
not a *fact of the world*. And a new verifier check:

> **`downstream_independence`** — if a trunk's output restates T5's conclusion, it must cite evidence
> that is not merely T5. Agreement without independent support is flagged.

That is the sycophancy check, applied trunk-to-trunk. It is exactly the belay on the descent.

### M3 — Positional stability (the glitch with no bedside equivalent)

Permute the order of any list handed to a trunk; run twice; compare the ranking. **If the output moves,
the ranking was positional, not clinical — and it must be surfaced as unstable.**

This is cheap (the trunks are stubs; permutation is a test-harness concern), fully deterministic, and
catches a failure mode that is *invisible* by construction. No human reviewer would ever find it,
because no human has the bug.

### M4 — Fluency ≠ confidence (the confabulation bar)

The system already has the right instinct in `dose-plausibility`: `unassessable` explicitly means *no
claim is made*, and states that it is **not an all-clear**. Generalise that: any claim a trunk cannot
anchor to a retrievable reference is rendered as a **hypothesis**, in a different register, and never
in the voice used for receipt-backed fact.

The evidence plane (E3) already renders `authority: authoritative | advisory` to a clinician. **The
same distinction, one layer up.** This is not new machinery — it is machinery we already built for
doses, applied to claims.

---

## 5. Where the allegory and the biases meet — the one-line version

| Altitude | Effort | Marginal yield | **Actual risk** | The bias that bites here |
|---|---|---|---|---|
| T1–T2 crevasses | high | **very high** | visible, lethal | availability (the vivid miss) |
| T3–T4 thin air | **rising** | **falling** | acclimatisation ↓ risk | anchoring sets in early |
| **T5 summit** | peak | peak | **death zone** — you become the gravity | **premature closure** (no internal signal) |
| T6–T9 descent | **falling** | flows | **where the deaths are** | **sycophancy compounds downhill** |

The design currently spends its safety budget uniformly. The mountain says spend it **at the summit and
on the way down** — and the bias analysis says exactly the same thing, for entirely different reasons.
When the allegory and the mechanism agree, that is worth acting on.

---

## 6. Practical sequence (plan-gated; nothing here is code)

| # | | cost | value |
|---|---|---|---|
| **R1** | **Stop claiming enforcement that does not exist.** Relabel every trunk's `(enforced by verification)` to separate MECHANICAL from CONVENTIONAL. Register the conventional ones as `BLIND_STUB`-class. | tiny | **highest** — it is currently a false statement in nine files |
| **R2** | Rewrite the nine constraint blocks to the four-field risk model (altitude / may / failure mode / bar). Trunk 5 first — the worked example above. | medium | replaces the wall with a gate; gives each trunk a *purpose* |
| **R3** | **M1 blind commit** — add `clinician_hypothesis` to the context-allowlist DENY set for T1–T5. Reuses the scoring-store firewall. | small | breaks the anchor→model half of the correlation |
| **R4** | **M3 positional stability** — a permutation harness + an instability flag. | small | catches a glitch invisible to every human reviewer |
| **R5** | **M2 descent guard** — T5's output as EvidenceNode + a `downstream_independence` verifier check. | medium | breaks the model→clinician sycophancy half |
| **R6** | **M4 register separation** — hypothesis vs receipt-backed fact, reusing the evidence plane's `authority` field. | medium | decouples fluency from confidence |

**R1 first, and alone if nothing else.** Nine files currently assert a safety property the system does
not have. Every downstream conversation about scope is built on that assertion. Fixing the *wording*
before the *mechanism* is not cosmetic — it is what makes the rest of this list legible.

## Invariant check

Nothing here weakens a hard limit. No autonomous diagnosis, no autonomous prescription, HARD_FAIL
non-overridable, the dose-source-singular boundary, the scoring-store firewall — **all unchanged**.
What changes is that the trunks would state the *real* bar instead of a broader one nobody enforces,
and would gain defences against four failure modes they currently do not name. The safety posture goes
**up**, not down: R1 converts a false claim into a registered gap, and M1–M4 add bars where there are
none today.
