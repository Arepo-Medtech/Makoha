# The show-evidence principle — and the C2 redesign it forces

> Mode: AI Architect. Produced 2026-07-15 at `main @ a8c83af`, read-only. **Nothing here authorises code.**
> Operator ruling 2026-07-15: *"Work through issues on principles of 'show evidence' having primacy over
> 'machine enforceable defaults' that blacklist, bin, emit etc."*
> Amends `.planning/DOSE-GUIDANCE-C2-PLAN.md` (D-C2-1, D-C2-3) and grows R-47.

## 0. The principle, and why it earned a document

Named by the operator after the same correction landed four times. Each time I built a machine-enforceable
bar; each time the honest answer was that the clinician decides and the system's job is to **show them**:

| # | What I built | What was wrong |
|---|---|---|
| 1 | `diverges` omitted from the enum → a differing AU dose **binned** | Inverted the jurisdiction rule: a US/EU label vetoing an AU dose |
| 2 | `non_congruent` **requires** an explanatory note | Made the AU dose justify itself to a foreign regulator |
| 3 | mg/kg → **`unassessable`**, evidence discarded | Hid a real, comparable flat-mg dose behind a bar |
| 4 | Multi-indication → **emit one blob**, no structure | Withheld structure the clinician needs to choose |

The pattern is one instinct: *when uncertain, make the machine decide and suppress the rest.* In a system
whose Guardrail 2 is **"the engine proposes, a registered practitioner disposes"** and whose
`required_human_review` is **always true**, suppression is the failure mode — not over-disclosure.

**The principle.** Where a choice exists between (a) a machine rule that bins, blocks, hides or auto-emits,
and (b) surfacing the evidence to the clinician, labelled for exactly what it is — **(b) wins.** The
clinician is the authority. The system's job is to make sure they are never deciding with less than we hold.

## 1. Where the principle does NOT apply — the limits, held

The principle governs **what we show when we show**, and every **routing/binning** decision. It does **not**
dissolve the firewall. Three limits, stated so "show evidence" is never quoted to erode them:

1. **HARD_FAIL still blocks the ACTION, unconditionally.** Dose guidance emits only on PASS/WARN —
   never on HARD_FAIL / BLOCKED_NO_PROOF / paediatric. It gates an **ACTION**, not evidence. "Show the
   clinician everything" never becomes "show a dose the firewall blocked".

   > **Amended 2026-07-15** (operator ruling, D-A-1..4). Not one clause is loosened. What changed is
   > that this section used to say *"no override, no exception"* over six clauses of which **two were
   > promises, not mechanisms** — and the trunk rewrite had just finished proving that an overclaiming
   > constraint is worse than an honest one, because people trust it. So: the honest count.

   **MECHANICAL — these throw or return null. You do not have to trust anyone:**
   - `PharmCheck.dose_guidance` emits only on PASS/WARN, never paediatric — `engine.js`.
   - An advisory dose can never occupy the AU dose field — `assertNoAdvisoryInDose()` throws.
   - A gateway `dose_candidate` is dropped unless the composed verdict is PASS/WARN — the client.
   - Held guidance is never rendered by the clinician portal — `assertQuarantineHeld()`, self-verified
     inside `renderBundle`.
   - **Held guidance never reaches the MODEL** — `assertHoldNotInjected()`, in the pipeline, between
     the packet being sealed and generation seeing it.
   - **The memo cannot quote what it withholds** — `assertMemoUnactionable()`.

   **CONVENTIONAL — on these, nobody is watching but you:**
   - **Any surface other than `renderBundle`.** An export, a PDF, a patient view or a future portal
     that assembles a page another way will not run the quarantine bar. The bundle carries the held
     text; only that one function refuses to print it. Registered: `dose-hold-surface-unenforced`.
   - **Anything downstream of the ReviewBundle.** `bundle_sha256` records the held text. It does not
     police who reads it.

   **THE HOLD IS NOT A LICENCE.** Blocked guidance is **retained** (`hold_class:
   cds_pre_load_hypothesis`, `released:false`) so it can be **delivered the moment the block clears** —
   retention is not permission to display. *"We are asking and identifying, as opposed to
   eradicating"* (operator, 2026-07-15): a hold says what it holds and why, so "withheld" is never
   mistaken for "we hold nothing" — nor for "we destroyed it".

   **AND IT NEVER TOUCHES THE MODEL.** `context_injection: "forbidden"`, declared on the hold and
   enforced by `assertHoldNotInjected`. This is a **different risk from everything above**, and the
   more dangerous one: a dose in a context packet is not a disclosure, it is an **anchor** — it does
   not inform the model, it *sets* it, and the output returns to the clinician wearing the authority of
   an independent read. That is the correlated-bias loop the trunk risk model exists to break. Every
   other clause here fails **visibly**; this one fails **invisibly**, because an anchored model does
   not look anchored. It looks confident.

   If you are adding a surface, the bar is yours to call. Nothing will remind you.
2. **International doses NEVER enter `PharmCheck.dose_guidance`.** Showing a US/EU label to a clinician,
   labelled non-AU, is evidence. Putting it in the AU dose field is the jurisdiction inversion wearing a
   new hat. Engine isolation on `international_dose_guidance` is absolute and stays.
3. **Show ≠ author.** The agent may segment, label and surface KL's text. It may never write a dose. §3's
   substring bar makes that mechanical rather than a promise.

## 2. Applying it — the four cases

### Case 1 — Two dosing methods in one statement → show both `[fixes my bar #3]`
**phenytoin, adult, verbatim:** *"Anticonvulsant: Oral, initially **4–5 mg/kg** daily in two or three doses.
Adjust dosage according to plasma levels; usual maintenance dose **200–500 mg** daily. Maximum daily dose
**600 mg**. Status epilepticus: IV, **15–20 mg/kg**."*

Today `assessPlausibility` matches `/kg` anywhere → `unassessable` → **the 200–500 mg maintenance and 600 mg
max are discarded**. They are flat mg. They are comparable. They are the numbers most likely to carry a
misplaced zero. I hid them to protect a bar.
**Fix:** report **both bases**, per dose line — `flat_mg`, `weight_based`, or `mixed`. Run plausibility on
the flat-mg component; state plainly that a weight-based method also exists and is not machine-comparable.
`unassessable` then means *"nothing here could be read"*, not *"something here was unreadable so I dropped
the rest"*.

### Case 2 — No indication → show it, labelled `[dose indication absent]`
The `.md` already carries this: **3 bare `Dose:`** entries (vs 451 `Adult dose:`) — an APF monograph that
prints a dose with no indication. Absence of an indication is a **fact to state**, not a reason to withhold
a dose. `indication_status: "absent"`.

### Case 3 — Multi-indication → show lines, emit none `[replaces D-C2-1]`
**sulfasalazine, adult, verbatim:** *"Ulcerative colitis: 2–4 g daily in three or four divided doses.
Rheumatoid arthritis: Initially 500 mg daily, increasing by 500 mg each week to 2–3 g daily in divided doses."*

My C2 plan said: one record, one verbatim blob, no structure — because splitting is "the agent parsing
clinical prose". **That objection dissolves once the lines are SHOWN rather than EMITTED.** If the engine
*picks* a line, a parsing error is invisible and acted upon. If the clinician *sees* every line **beside the
verbatim source**, a parsing error is visible and recoverable. **Structure for showing is safe in a way that
structure for emitting is not** — that is the whole distinction, and it is what I missed.
So: `dose_lines[]`, each with its indication / route / basis, `indication_status: "present"`. The engine
still never selects among them (§3), so F2's wrong-indication emit (apixaban 2.5 mg post-surgical to an AF
patient) stays impossible.

### Case 4 — No AU dose, but US and EU corroborate → show the corroboration `[extends R-47]`
Today: no AU record → `getDoseGuidance` → `null` → **the clinician sees nothing**, and goes and looks it up
themselves. We hold FDA and EMA labels that agree. Showing nothing is not neutrality; it is withholding.
**Fix — a surface behaviour, not an engine one:** where `dose_guidance` has no AU record and
`international_dose_guidance` holds **corroborated** entries (US **and** EU, plausibility-congruent), the
clinician surface shows them, labelled unmistakably:
> **No AU source.** US (FDA) and EU (EMA) labels corroborate: *500 mg every 8 hours*. **Not an AU dose** —
> AU indications, scheduling and PI may differ. `international_corroborated · indication affirmed`
Labels: `indication_agnostic` (the foreign labels carry no indication for this range) vs `indication_affirmed`
(they agree on a range **for the same indication** — materially stronger, and worth distinguishing).
**Single-jurisdiction is NOT corroboration** — one label is shown as a bare fact, never as a "common range".
This stays out of `PharmCheck.dose_guidance` (limit #2) and lives in R-47's surface.

## 3. The mechanical bar worth keeping — because it SHOWS

One bar earns its place, and it is the inverse of the ones I removed: **every `dose_lines[].statement` must
appear VERBATIM as a substring of `source_statement`.**

`source_statement` (required) is KL's text, unaltered, and is the authority. `dose_lines[]` are a
**segmentation** of it. The substring rule means the agent can **cut, never write** — a fabricated or
paraphrased dose line **fails to parse**. This is not a bar that hides evidence or overrides a clinician:
it constrains *the machine*, guaranteeing that everything shown traces to something KL actually wrote.
That is the right target for mechanical enforcement — **bind the agent, not the clinician.**

## 4. Concrete schema delta (`DoseGuidanceSchema`)

```js
source_statement: z.string().min(3),          // KL's verbatim APF text — THE AUTHORITY, always carried
indication_status: z.enum(["present", "absent"]),
dose_lines: z.array(z.object({
  indication: z.string().nullable(),          // null iff indication_status === "absent"
  route: z.string().nullable().optional(),    // "Oral" / "IV" where the monograph states it
  statement: z.string().min(1),               // MUST be a verbatim substring of source_statement
  basis: z.enum(["flat_mg", "weight_based", "mixed"]),
  plausibility: z.enum(["plausible", "implausible", "unassessable"]),
  plausibility_note: z.string().optional(),
}).strict()).min(1),
```
`safe_dose_range` (the frozen emit key) stays = `source_statement` verbatim — the engine emits the whole
common range and selects nothing. `dose_lines[]` never reach frozen `pharm-check` (the engine picks
`DOSE_KEYS` and drops the rest); they ride in the datastore for R-47's surface to render.
Refinements: every `dose_lines[].statement` is a substring of `source_statement`; `indication_status:"absent"`
⇒ exactly one line with `indication: null`; `"present"` ⇒ every line names an indication.

## 5. R-47 grows
R-47 was "show the divergence". It becomes **"show the dose evidence landscape"**: the AU dose + its
`au_congruence` + every comparator verbatim + `dose_lines[]` with basis and plausibility per line + the
Case-4 international fallback when no AU dose exists. **The whole show-evidence principle is inert without
R-47** — every case above is a *surface* obligation, and a surface that does not render them turns all of
this into well-structured data nobody sees. **R-47 remains the gate on C2's completion.**

## 6. Decisions (supersede D-C2-1 / D-C2-3)
- **D-SE-1 — Adopt the principle** as stated in §0, with the §1 limits held (HARD_FAIL blocks; international
  never in `dose_guidance`; show ≠ author).
- **D-SE-2 — `dose_lines[]` + verbatim `source_statement` + the substring bar** (§3, §4). Supersedes D-C2-1's
  "one verbatim blob, no structure".
- **D-SE-3 — Parse the `.md`, not the CSV.** It is the richer artifact and already carries your label
  vocabulary (`Adult dose:` / `Dose:` / `Note:` / `Adult and paediatric dose:`), so the segmentation follows
  *your* structure instead of one I invent. It also sidesteps the RFC-4180 column-shift hazard entirely —
  though C2a's parser test stays as the guard if CSV is ever used. Supersedes D-C2-4.
- **D-SE-4 — Case 4 requires US **and** EU** to show as "corroborated". A single foreign label shows as a
  bare labelled fact, never a "common range". *Recommend as stated.*
- **D-SE-5 — phenytoin ships** (supersedes D-C2-3): two lines shown (Anticonvulsant/Oral, Status
  epilepticus/IV), each with its basis, plausibility run on the flat-mg component. No longer a hold.
