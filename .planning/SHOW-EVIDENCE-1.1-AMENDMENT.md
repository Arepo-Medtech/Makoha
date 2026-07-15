# §1.1 — a proposed amendment (ANALYSIS + PLAN, hypothetical, awaiting ruling)

> Mode: AI Architect → IDE Planner. Operator query 2026-07-15: *"Plan a potential or hypothetical
> amendment to §1.1 … using the same principle as the revisions used to trunks earlier today"* and
> *"Does an amendment to §1.1 then have a blast radius…?"*
>
> **Nothing here authorises code.** Researched live at breath-ezy `6f032d3`.

---

## 0. The finding that reframes both questions

**§1.1 already claims more than it enforces.** Counted at `6f032d3`:

| §1.1's promise | Status |
|---|---|
| `PharmCheck.dose_guidance` only on PASS/WARN, never paediatric | **MECHANICAL** — `engine.js:337` |
| an advisory dose can never be the AU dose | **MECHANICAL** — `assertNoAdvisoryInDose()` throws |
| the gateway's dose dropped unless PASS/WARN | **MECHANICAL** — the client's `canDose` |
| held text never rendered | **MECHANICAL — but only inside `renderBundle`** |
| *"no dose is **shown** past a blocked firewall"* on **any other surface** | **CONVENTIONAL — nobody is watching** |
| the held text never entering a **context packet** | **NOT ENFORCED — true by construction, guaranteed by nobody** |

`contextInjection(plan, receipts, meta)` never receives `dose_evidence`, so the model plane and the
clinician plane are separate — **by accident of the call signature**. Zero tests assert it. That is
precisely the M1 shape: *"the property holds TODAY, BY CONSTRUCTION — and nothing asserts it."*

**So the amendment's first job is not to loosen §1.1. It is to make an honest count** — exactly what
the trunk rewrite did when it found `(enforced by verification)` was false for `no diagnosis`. §1.1
says *"no override, no exception"* and, on two of its six clauses, that is a promise rather than a
mechanism. Your second query has already found the more dangerous of the two.

---

## 1. Query 1 — the amendment, in the trunks' own method

The trunk method was four moves: **separate MECHANICAL from CONVENTIONAL · name the precise risk
instead of a blanket "no" · say plainly where nobody is watching · register the honest gap.**

### Proposed §1.1, rewritten

> **1. HARD_FAIL still blocks the ACTION, unconditionally.**
>
> **MECHANICAL — these will throw or return null; you do not have to trust anyone:**
> - `PharmCheck.dose_guidance` is emitted only on PASS/WARN and never paediatric (`engine.js`).
> - An advisory dose can never occupy the AU dose field (`assertNoAdvisoryInDose()` throws).
> - A gateway `dose_candidate` is dropped unless the composed verdict is PASS/WARN (the client).
> - Guidance held past a blocked firewall is never rendered by the clinician portal
>   (`assertQuarantineHeld()`, self-verified inside `renderBundle`).
>
> **CONVENTIONAL — on these, nobody is watching but you:**
> - **Any surface other than `renderBundle`.** An export, a PDF, a patient view or a future portal
>   that assembles a page another way will not run the quarantine bar. The bundle carries the held
>   text; only that one function refuses to print it.
> - **Anything downstream of the ReviewBundle.** `bundle_sha256` covers the held text as a record. It
>   does not police who reads it.
>
> **THE HOLD IS NOT A LICENCE.** Guidance blocked by the firewall is **retained** so it can be
> delivered the moment the block clears — retention is not permission to display. If you are adding a
> surface, the bar is yours to call. Nothing will remind you.

That is the trunk pattern verbatim: the honest split, and the line that says *on this constraint,
nobody is watching but you*.

### What it changes, and what it does not

- **It does not permit a dose past a blocked firewall.** Not one clause loosens.
- **It stops §1.1 claiming an enforcement it does not have** on two clauses.
- **It creates a register item** — `dose-hold-surface-unenforced` — the way
  `trunk-constraint-claims-unenforced` stays open at High rather than being papered over.

---

## 2. Query 2 — the blast radius, and it is bigger than the wording

**Yes — and your instinct is the load-bearing part.** Two distinct leak paths, and today §1.1 only
speaks to one:

```
the held payload
    ├── → the CLINICIAN plane (a page)      ← §1.1 addresses this. Guarded (renderBundle only).
    └── → the MODEL plane (a context packet) ← §1.1 SAYS NOTHING. Guarded by NOTHING.
```

**The second is the one that would hurt.** A dose in a packet is not a disclosure — it is an
**anchor**. M1 exists because a clinician's anchor propagating into the model is a correlated-bias
failure; M3 exists because a model's ranking shifts on input position. `"a dose of 5–10 mg was
withheld"` in a packet does not inform the model, it *sets* it — and then the model's output flows
back to the clinician wearing the authority of an independent read. That is the exact loop the
Everest brief named: *"a system that lets the clinician's anchor propagate into the model, and the
model's sycophancy back into the clinician, has engineered the correlation it should have been built
to break."*

Your phrase **"not to affect posture stability"** is the right name for it, and it is a *different*
risk from the one §1.1 currently governs. §1.1 protects the **clinician** from acting on a blocked
dose. Nothing protects the **model** from being anchored by one.

### The field design — `cds_pre_load_hypothesis`

Your suggestion formalises three things that are currently conventions dressed as mechanisms:

| Today | Proposed | Why it matters |
|---|---|---|
| a field *name* (`quarantined_text` vs `text`) | `hold_class: "cds_pre_load_hypothesis"` — an **enum** | a validator can reason about an enum; it cannot reason about a naming habit |
| a comment saying it must not be injected | `context_injection: "forbidden"` — a **declared bar** | a test can enforce a declaration; it cannot enforce a comment |
| prose in `note` | `memo` — the abbreviated, **unactionable** account | a memo that carries no dose is harmless *even if it leaks* |

**`hypothesis` is not a new register — the system already has it.** M4 established exactly this
vocabulary: *"treat any claim the model cannot anchor to a retrievable reference as a hypothesis, not
a finding."* `pre_load_hypothesis` slots into a distinction the codebase already draws, which is why
it reads as the right word rather than a new one.

**And `pre-load` is the honest description of its state:** staged, not delivered. It names *when*,
not just *what* — which is what makes "in-waiting to deliver when appropriate" a property of the data
instead of a promise in a comment.

### The defence-in-depth this unlocks

The memo/payload split means **two independent things must both fail** before a dose reaches anyone:

1. the memo must be *unactionable* — mechanically: no dose text may appear in it (substring bar against
   the held payload, the same shape as `assertNoAdvisoryInDose`);
2. the payload must be *unrenderable and uninjectable* — mechanically: `assertQuarantineHeld` on every
   surface, and a new context-injection bar.

Today a single rendering bug is sufficient. That is the honest argument for your amendment: **it makes
§1.1 stronger, not weaker.**

---

## 3. What would become mechanical

| Bar | Enforces | Shape |
|---|---|---|
| **`assertHoldNotInjected(packet, result)`** | the held payload never reaches a context packet | the M1 pattern: assert the property that currently holds by accident |
| **`assertMemoUnactionable(evidence)`** | the memo carries no dose text from the payload it describes | substring, like `assertNoAdvisoryInDose` |
| **schema: `hold_class` enum + `context_injection: "forbidden"`** | a hold that does not declare its class is unrepresentable | zod `.strict()` + `.refine()` |
| **`released:false` ⇒ `patient_facing:false`** | a held item can never be patient-facing | `.refine()` — already true, currently by hand |

## 4. What stays conventional — and gets registered, not hidden

- **Surfaces other than `renderBundle`.** A new renderer must call the bar; nothing forces it. Register
  `dose-hold-surface-unenforced` (Medium → High if a second surface is ever built).
- **The bundle's readers.** `bundle_sha256` records the held text; it does not police who reads it.

Both go in the register **open**, with the honest sentence, exactly as
`trunk-constraint-claims-unenforced` did.

---

## 5. My honest read

Your amendment is not a relaxation and I would not plan it as one. §1.1's *"no override, no
exception"* is currently **four mechanisms and two promises**, and W2 quietly added a seventh clause
(the hold) whose only guard is one function. The amendment's value is that it forces the count.

The part I would not have found: **the context-injection path.** I built the quarantine, wrote the
bar, swept it six ways — and never asked whether the held text could reach the *model*. It cannot,
today, because `contextInjection` does not take `dose_evidence` as a parameter. That is an argument's
worth of safety resting on a function signature.

**Cost, stated plainly:** four new bars, a schema change, a register item, and a doc rewrite — against
zero change in what a clinician may see today. Everything here is prophylactic. The case for doing it
now rather than later is that the hold already exists, so the exposure already exists.

---

## Decisions (GATE)

- **D-A-1 — amend §1.1 at all?** *Recommend yes* — it currently overclaims on two clauses, and the
  trunk exercise showed that an overclaiming constraint is worse than an honest one.
- **D-A-2 — `hold_class: "cds_pre_load_hypothesis"` as the enum?** *Recommend yes.* It reuses M4's
  hypothesis register rather than inventing a vocabulary, and `pre-load` names the state, not just the
  content.
- **D-A-3 — build the context-injection bar?** *Recommend yes, and first.* It is the only clause where
  the risk is currently unguarded **and** the failure would be invisible — an anchored model does not
  look anchored.
- **D-A-4 — abbreviate the memo mechanically (no dose text), or leave it prose?** *Recommend
  mechanical.* A memo that cannot carry a dose is safe even when a surface forgets the bar; a prose
  memo is one careless template away from quoting what it describes.
