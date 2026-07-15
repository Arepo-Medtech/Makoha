# FL-34 · Phase C — W1 (contract widening) + W2 (retain the advisory dose) — PLAN

> Mode: IDE Planner. Researched at breath-ezy `8819f2f` / gateway `27a8e0c`.
> **Nothing here authorises code.** Operator instruction 2026-07-15: *"plan the contract widening —
> retain the advisory dose — dont drop it."*
>
> Inputs read live: `cds-adapter/{opencds-contract.js,opencds-client.js,index.js}`, `engine.js`,
> `dose-evidence-plane.js`, `verification/pipeline.js`, `.planning/SHOW-EVIDENCE-PRINCIPLE.md` §1,
> the 9 KMs, `test/contract-opencds-contract.js`.

---

## W1 — the contract widening (F-C8)

### The defect, measured

The KMs read **7** facts. The locked wire carries **5**, and only **3** of them overlap:

```
client sends : allergens · current_medications · egfr_ml_min · patient_age_years
               · pregnancy_status · hepatic_impairment · s8_pdmp_checked
survives     : current_medications · egfr_ml_min · patient_age_years
STRIPPED     : allergens · pregnancy_status · hepatic_impairment · s8_pdmp_checked
```

zod's `z.object()` silently strips unknown keys, so four facts never leave the client.

**Consequence, mechanically:** `allergy_check` is one of the five `DEFAULT_CHECKS` → no `allergens` →
`NOT_RUN` → `foldOssStatuses` → **`BLOCKED_NO_PROOF`**. **The OSS CDS route cannot return PASS for any
drug, ever.** Safe (it blocks) and useless (it always blocks) — the F6 class at the top level. It hid
behind a HARD_FAIL in the happy-path test; it took asking for a clean PASS to see it.

### Why `allergy_status` is on the wire at all — it is UNFINISHED, not wrong-by-design

`engine.js:113` reports the missing fact as `missing_facts_required: ["allergy_status"]` — that string
is a **label for what is absent**. The fact itself is `resolved.allergens`. The wire was written from
the label, and `opencds-client.js:128` dutifully maps `allergy_status: resolvedFacts.allergy_status`,
which nothing has ever populated. No test caught it because no test ran a real KM until C3.

### The change

`OpenCdsResolvedFactsSchema` — **additive except for one deliberate removal:**

```js
const OpenCdsResolvedFactsSchema = z.object({
  allergens: z.array(z.string()).optional(),        // + the fact the checks actually read
  current_medications: z.array(z.string()).optional(),
  egfr_ml_min: z.number().optional(),
  nti_monitoring_documented: z.boolean().optional(),
  patient_age_years: z.number().optional(),
  pregnancy_status: z.enum(["pregnant", "not_pregnant"]).optional(),  // +
  hepatic_impairment: z.boolean().optional(),                          // +
  s8_pdmp_checked: z.boolean().optional(),                             // +
  // − allergy_status REMOVED (see below)
});
```

Plus the matching `resolved_facts` build in `opencds-client.js`.

**Removing `allergy_status` rather than leaving it.** It costs nothing to leave and that is exactly the
trap: a field named `allergy_status` sitting on the wire is what makes the next engineer believe
allergy data flows. Leaving it beside `allergens` would preserve the ambiguity that caused F-C8. One
allergy field, and it is the one the checks read. *(It is `z.unknown().optional()` and unpopulated, so
nothing can break; one test fixture uses it and is updated in the same phase.)*

**`pregnancy_status` as an enum, not a string.** `engine.js` compares against exactly `"pregnant"` /
`"not_pregnant"`; anything else falls to the D-FL05-1 unknown branch. An enum makes a typo a
validation failure at the client rather than a silent "unknown" that quietly relaxes a teratogen gate.

### Safety analysis — what crosses that did not before

Four clinical facts, **all already resolved and sanitised** by the time the client sees them, and all
the same class as `patient_age_years`, which already rides. **No new PHI class crosses trust boundary
#4:** no IHI, no demographics, no name, no DOB — `pregnancy_status` and `hepatic_impairment` are
booleans/enums about a condition, not identifiers. The gateway already receives age and the full
medication list; these add nothing re-identifying.

**Direction of risk:** today four checks can only ever say `NOT_RUN`, which blocks. After the widening
they can also say PASS/WARN/HARD_FAIL — i.e. the change makes the gateway *able to be wrong* where it
was previously only able to be silent. That is the point of having a second executor, and it is why
Phase D's parity exists. The client still re-validates fail-closed and re-applies every hard rule.

**Frozen contracts:** `pharm-intent`, `pharm-check`, `verification-gate.js`, `verifier.js` — **untouched.**
`opencds-contract.js` is the A2-locked *wire* contract, not one of the four frozen artifacts; widening
it is a contract change requiring approval (this plan), not a frozen-contract breach.

---

## W2 — retain the advisory dose

### Where it is dropped today — TWICE

1. **`opencds-client.js:154`** — `dose_guidance = canDose && data.dose_candidate ? data.dose_candidate : null`.
   On a blocked verdict the candidate is **nulled**: the text is gone and so is the *fact that it existed*.
2. **`composeCdsVerdict`** — `evidence: cds.dose_guidance ? {...} : null`. Reading an already-nulled
   field, so `evidence` is null and nothing reaches the evidence plane.
3. **`assembleDoseEvidence`** — on a blocked firewall returns `withheld(n, reason)`, which counts
   `au_dose` / `international` / `literature` **from the datastore files** and does not count the CDS
   candidate at all — it is a runtime value, not a file.

So the second executor's dose is destroyed at step 1 and is unaccounted for at step 3.

### The conflict, surfaced rather than resolved

Your instruction: *"retain the advisory dose — dont drop it."*
Your `SHOW-EVIDENCE-PRINCIPLE` §1.1: *"HARD_FAIL still blocks, unconditionally… never becomes 'show a
dose the firewall blocked'. **No override, no exception.**"*

**These are compatible under one reading and contradictory under the other**, and §1.1 draws the line
itself: *"It gates an **ACTION**, not evidence."*

- **Reading A — RETAIN = account for it (§1-compatible).** `PharmCheck.dose_guidance` stays null past a
  blocked firewall — the ACTION gate, absolute, unchanged. But the clinician is **told** a second
  independent executor also produced a dose candidate, and why it is withheld. Nothing is destroyed;
  no blocked dose text is shown.
- **Reading B — RETAIN = show the text past a blocked firewall.** This requires **you to amend §1.1**.
  I will not do it under a "retain" instruction: I violated §1.1 once already this project by
  surfacing dose text on a HARD_FAIL, and I am not going to re-do it on an inference.

**Recommendation: A.** It is what `withheld()` was built for — its own comment says the failure it
exists to prevent is making *"we hold a clinician-signed AU dose"* indistinguishable from *"we hold
nothing"*. The CDS candidate is simply missing from that account. A closes the gap without touching
the firewall.

### The change (Reading A)

**The text never travels past a blocked firewall.** This is stronger than gating it downstream: if the
dose text does not leave the client on a blocked path, it *cannot* leak, and no later refactor can
re-expose it. What travels is the **fact**:

```
opencds-client.js   → dose_guidance     : unchanged (null unless PASS/WARN)   ← the ACTION gate
                    + dose_candidate_held: true|false                          ← the FACT it existed
composeCdsVerdict   → evidence.dose_candidate_held  (rides even when dose_candidate is null)
dose-evidence-plane → withheld() gains a 4th count: "+ 1 second-executor dose candidate"
```

`withheld()`'s note then reads, e.g.: *"…you are told what exists so that 'withheld' is never mistaken
for 'we hold nothing': 1 clinician-signed AU dose, 2 US/EU comparator label(s), 0 literature record(s),
**and a second independent executor (AU_OSS_CDS, fl30-kb:v2) also produced a dose candidate**. Resolve
the block (see hard_stops) and the evidence is shown in full."*

**Unchanged, and asserted:** on PASS/WARN the candidate already reaches the evidence plane as
`cds_dose_candidate` (E3, working). `assertNoAdvisoryInDose()` still throws if an advisory dose ever
reaches `PharmCheck.dose_guidance`.

---

## Phases

### W1a — the wire + the client
`opencds-contract.js` (schema), `opencds-client.js` (the `resolved_facts` build + the JSDoc that names
the old field).
**Verify:** a fact-round-trip test — every fact the KMs read survives `validateOpenCdsRequest`, asserted
against the KMs' *actual* reads rather than a hand-list, so the two cannot drift again; the
`allergy_status`→`allergens` rename is pinned; `contract-opencds-contract` green. **GATE.**

### W1b — the container proves it
Rebuild, run, and get a **PASS** out of the OSS route for a clean case — the thing that has never once
happened. Then the four previously-dead checks proven live: an allergy HARD_FAIL, a pregnancy
category-X HARD_FAIL, a hepatic WARN, an S8 HARD_FAIL.
**Verify:** real container, real client, real verdicts.

### W2 — retain the advisory dose
`opencds-client.js`, `cds-adapter/index.js`, `dose-evidence-plane.js` (`withheld()`).
**Verify:** on HARD_FAIL — `PharmCheck.dose_guidance` **null** (unchanged), no dose text anywhere in
the bundle (asserted by substring against the actual candidate text), and the withheld account **names
the second executor**. On PASS — the `cds_dose_candidate` still renders. `assertNoAdvisoryInDose` still
throws. Tamper: deleting the count reddens. **GATE.**

### W3 — register + docs
`opencds-gateway-shim` → COMPLETE. `fl30-kb-km-package` PARTIAL → COMPLETE **only on W1b's evidence**.
Record F-C7 (focal person id), F-C8 (the widening), and correct the register's "Echoes km_set" defect.
CHANGELOG + `.claude/completeness-index.md`.
**Verify:** `npm test` + `verification` + `trunk:stub:all`; frozen contracts byte-unchanged.

---

## Invariant check
*No autonomous prescription* — **held, and W2 does not touch it**: `PharmCheck.dose_guidance` stays
null past a blocked firewall, no dose text travels on a blocked path, `assertNoAdvisoryInDose()`
unchanged. *HARD_FAIL non-overridable* — untouched; the fold stays monotone. *Australian context* — the
F5 allowlist is unaffected. *Patient-data minimisation* — no new PHI class; the four facts are clinical
and already sanitised. *Mock never as live* — `receiptMode()` stays `mock`. *Scoring-store firewall* —
not touched. **Nothing becomes patient-facing.**

## Register impact
**Closes:** `opencds-gateway-shim`. **May close:** `fl30-kb-km-package` (on W1b evidence).
**Opens:** nothing. **Gap-register:** R-22 does not move; blocker #1 stays RED.

## New dependencies
**None.**

---

## Decisions needed (GATE)

- **D-W-1 — the dose: Reading A or B?** *Recommend **A*** (account for it; the text never travels past a
  blocked firewall). **B requires you to amend §1.1 explicitly** — I will not infer it.
- **D-W-2 — remove `allergy_status`, or leave it beside `allergens`?** *Recommend **remove***: leaving a
  field that looks like the allergy fact but is never populated is precisely what caused F-C8.
- **D-W-3 — `pregnancy_status` as an enum?** *Recommend **enum***: a typo becomes a validation failure
  at the client instead of silently relaxing a teratogen gate to "unknown".
