# FL-34 · Phase D — A/B parity, engine vs gateway (PLAN — awaiting approval)

> Mode: IDE Planner. Researched at breath-ezy `8f7786b` / gateway `c9528f4`, both merged and green,
> **against a live container**. **Nothing here authorises code.**

## Phase 0 — Completeness scan

On-path: `fl30-kb-km-package` COMPLETE · `opencds-gateway-shim` PARTIAL (built, no endpoint) ·
`opencds-cds-adapter-client` COMPLETE · `cds-firewall-fold` COMPLETE. No `BLIND_STUB`, no `DEAD_END`.
**Phase D has no register item** — it is referenced only in the gateway README and inside
`fl30-kb-km-package`'s `build_action`. D5 opens one.

**Naming collision, worth settling first.** `pharm-cds-selfbuild`'s evidence already says *"A/B parity
✓"* — that was **FL-30 Step 5: the signed datastore vs the mock source**, both producing contract-valid
PharmChecks. It is **not** this. Phase D is **engine vs gateway** — two independent implementations of
the same specification. Two different claims, one phrase; the register will say which is which.

---

## Phase 1 — Research findings (measured live, not theorised)

### F-D1 — parity is ALREADY CLEAN. 38/38, three axes, adversarial facts.

| axis | result |
|---|---|
| overall status | **38/38** |
| per-check verdicts | **38/38** |
| flag types | **38/38** |
| dose text (18 PASS/WARN cases) | **18/18 byte-identical** |

Non-trivial and detection-proven, because a 38/38 nobody can explain is not evidence: warfarin yields
**6 checks and 3 flags on both sides** (including C1's two per-hit `interaction_severe` flags), so this
is agreement rather than two blanks matching; and pointing the client at a dead gateway diverges
immediately (`HARD_FAIL` vs `BLOCKED_NO_PROOF`), so the harness can see a divergence when there is one.

**This changes what Phase D is for.** It is not a bug hunt — the bugs were found in B/C, by building.
It is a **regression harness**: the thing that notices when the two implementations drift apart later.
That is worth saying plainly rather than dressing 38/38 up as a discovery.

### F-D2 — the gateway only runs what is REQUESTED, and the default is 5 of 8

Engine, warfarin: `allergy · interaction · renal_dosing · **pregnancy** · nti · age` — six.
`DEFAULT_CHECKS`: five. `pregnancy_check` is absent from the gateway's answer **because nobody asked**.

⇒ **Phase D requests all 8.** Otherwise the first "divergence" it reports is the request, and a parity
harness that cries wolf on its own configuration gets switched off — after which the real drift ships.

### F-D3 — three differences are LEGITIMATE and must be encoded, not "fixed"

The locked wire is deliberately narrower than the frozen `pharm-check`. Comparing raw objects would
report all three as failures on every case:

| difference | why it is correct |
|---|---|
| engine flags carry `flag_id`, `renal_threshold`, `au_reference` | `OpenCdsFlagSchema` is `.strict()` and has none of them. The contract is locked; a forbidden field would fail the **whole** response. |
| engine dose may carry `pbs_authority_required` / `pbs_item_code` | `OpenCdsDoseCandidateSchema` is `.strict()` and has neither (F-C1). The engine's copy is authoritative; the gateway's is advisory and narrower **by design**. |
| engine emits checks the gateway was not asked for | F-D2 — the request, not a defect. |

⇒ Compare **status**, **per-check `check_id`+`status`**, **flag `flag_type`+`severity`+`drug_a`/`drug_b`**,
and **dose `safe_dose_range`**. Everything else is contract shape, not knowledge.

### F-D4 — the comparison must run BOTH executors over the SAME identity

B0/B0b/E7 exist for this: the pipeline canonicalises once, before both. A harness that fed `frusemide`
to one and `furosemide` to the other would measure a spelling. That is now closed — and Phase D is
where it would have shown up as a phantom divergence, so the harness pins it rather than assuming it.

---

## Phase 2 — Design

### Topology
**Trunks:** none. **Schemas:** none. **Servers:** `pharmacology` read-only. **Receipts:** unchanged,
`mode` stays `mock`. **Blast radius:** one env-gated test file + a register entry. The `cds-adapter`
slot stays EMPTY→HARD_FAIL. **Nothing patient-facing.**

### What a failure means — the point of the whole exercise
Both executors run the **same clinician-signed records**. So a divergence is never "the knowledge is
wrong" — it is **one of the two implementations reading it wrong**, and the harness cannot say which.
It reports the disagreement and the inputs; a human adjudicates. Claiming to know which side is wrong
would be the fabrication this system exists to prevent.

### Sampling — and its honest limit
A deterministic spread over `dose-guidance.json` (every Nth ingredient), plus a **fixed adversarial
set** naming the drugs whose behaviour we already care about (warfarin/amiodarone, amoxicillin +
penicillin, metformin at low eGFR, morphine without a PDMP, a category-X drug in pregnancy, a
paediatric case). Two fact profiles: **adversarial** (forces checks to fire) and **clean** (yields
PASS + a dose to compare).

**A spread is not a proof of the whole set**, and the harness will `log()` exactly what it covered —
a silent sample reads as exhaustive.

---

## Phases

### D1 — the parity harness `[breath-ezy]`
`test/parity-opencds-gateway.js`, env-gated on `HEYDOC_PHARM_CDS_ENDPOINT` (skips green in CI — the
C4 precedent, and the same honest hole: a green CI run means nobody asked).
**Verify:** against a live container — status/check/flag/dose parity over the sample; the run prints
its coverage; **and it must FAIL on an induced divergence** (a dead gateway; a KM disabled), because a
parity harness that has never seen a divergence is decoration. **GATE.**

### D2 — the comparison rules, as code
`compareExecutors(pharmCheck, clientResult)` — pure, unit-tested without a container, so every
legitimate-difference rule (F-D3) is provable at the desk and the container run is only the data.
**Verify:** fixtures — a `flag_id`-only difference is NOT a divergence; a `flag_type` difference IS; a
missing `pbs_item_code` is NOT; a different `safe_dose_range` IS; a check absent from the request is
NOT; a check absent from the ANSWER is. **GATE.**

### D3 — register + docs `[breath-ezy]`
Open `opencds-ab-parity`. Record F-D1 (parity is clean; the harness is a regression net, not a
discovery), and disambiguate the FL-30 "A/B parity" phrase in `pharm-cds-selfbuild`. Gateway README
D → done. CHANGELOG + `.claude/completeness-index.md`.
**Verify:** `npm test` + `verification` + `trunk:stub:all`; frozen contracts byte-unchanged.

---

## Invariant check
**Preserved — Phase D writes no production code.** It reads both executors and compares. *No
autonomous prescription* — untouched; the harness never emits a dose, it compares two. *HARD_FAIL* —
untouched. *Mock never as live* — `receiptMode()` stays `mock`. *Scoring-store firewall* — not touched.
**Nothing becomes patient-facing.**

## Register impact
**Opens:** `opencds-ab-parity` (Medium; PARTIAL until it runs somewhere other than a laptop).
**Clarifies:** `pharm-cds-selfbuild`'s "A/B parity" phrase. **Gap-register:** R-22 does not move;
blocker #1 stays RED.

## New dependencies
**None.**

---

## Decisions (GATE)

- **D-D-1 — request all 8 checks?** *Recommend yes* (F-D2). Otherwise the harness's first finding is
  its own configuration.
- **D-D-2 — is a divergence a FAILURE or a REPORT?** *Recommend **failure*** — exit non-zero. A parity
  harness that reports and passes is a log file, and nobody reads log files. It cannot say which side
  is wrong, but it can refuse to be green.
- **D-D-3 — sample, or sweep all 451?** *Recommend **sample** (~40) by default with `--all` available.*
  451 drugs × 8 checks = 3,608 HTTP calls per run; a harness too slow to run is a harness nobody runs.
  The coverage is printed either way.
- **D-D-4 — env-gated like C4, or require a container?** *Recommend **env-gated***, consistent with C4
  and smoke-llm — and the same hole, named the same way.
