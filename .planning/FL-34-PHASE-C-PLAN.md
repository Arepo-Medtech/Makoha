# FL-34 · Phase C — `opencds-gateway-shim` (PLAN — awaiting Phase 2 approval)

> Mode: IDE Planner. Researched at breath-ezy `8819f2f` / gateway `c2ca5bf` (both merged, both green).
> **Nothing here authorises code.** Register item: `opencds-gateway-shim` (UNBUILT, Medium,
> `blocks_patient_facing:false`, gap R-22).
>
> Inputs read live: `cds-adapter/{opencds-contract.js,opencds-client.js,index.js}`,
> `engine.js`, gateway `km/src/main/java/au/breathezy/cds/km/*.java`, `km/k-repo/knowledgeModules.xml`,
> `kb/manifest.json`, `tools/export-fl30-kb.mjs`, the register + gateway README.

## Phase 0 — Completeness scan (done, read-only)

On-path states: `opencds-gateway-image` COMPLETE · `opencds-cds-adapter-client` COMPLETE ·
`cds-firewall-fold` COMPLETE · `fl30-kb-km-package` **PARTIAL** (built + tested, not wired — this
phase is what wires it) · `opencds-gateway-shim` **UNBUILT** (this plan).
No `BLIND_STUB` on the path. The `cds-adapter` EMPTY→HARD_FAIL floor is intact and stays intact.

---

## Phase 1 — Research findings

### F-C1 — the dose KM emits two keys the LOCKED response REJECTS `[latent, safe-but-useless]`

`DoseCandidateKm.DOSE_KEYS` includes `pbs_authority_required` and `pbs_item_code`.
`OpenCdsDoseCandidateSchema` is `.strict()` and has **neither**. Demonstrated:

```
KM emits   : safe_dose_range · adjustment_required · adjustment_reason · monitoring_required
             · duration_guidance · pbs_authority_required · pbs_item_code
wire allows: safe_dose_range · adjustment_required · adjustment_reason · monitoring_required
             · duration_guidance                    ← .strict()
```

A dose record carrying either would fail `validateOpenCdsResponse` — **the whole response, not just the
dose** → `BLOCKED_NO_PROOF`. Fail-safe, and useless: one PBS field would black out every check on that
request. **Latent today** (0 of 451 records carry them) and live the moment PBS authority data is
authored — which `pbs-formulary.json` (14,840 unsigned records) exists to enable.

⇒ Align `DOSE_KEYS` to the wire contract. The engine's own `DOSE_KEYS` legitimately keeps both (the
frozen `pharm-check` allows them); it is the *gateway's advisory* copy that must narrow.

### F-C2 — a KM card cannot reconstruct a flag's `drug_a` / `drug_b` `[information loss]`

The wire flag needs `flag_type` + `severity` + `description` (all satisfiable from the card) and
carries optional `drug_a` / `drug_b`. `engine.js` populates those on 8 flags; **no KM emits them**, so
the shim cannot invent them.

Not a validation failure (both optional). But the review bundle's interaction display loses *which
drugs*, and — worse — **Phase D would read a KM gap as a knowledge divergence**, which is the F6 class
of defect exactly: a parity harness chasing an artifact of our own making.

⇒ KMs emit `drug_a`/`drug_b` in the card extension. Cheap, and it is what the engine does.

### F-C3 — **an ECHOING shim silently defeats the KB-version cross-check** `[SPEC DEFECT — the register prescribes it]`

The register's `build_action` says: *"Echoes km_set=fl30-kb:v1"*. **Demonstrated against the real
client:**

```
client asked for  : fl30-kb:v2
gateway REALLY ran: fl30-kb:v1   (stale deploy)
echoing shim says : fl30-kb:v2   (it echoed the request)
→ verdict: PASS                  ← the cross-check PASSED on a lie
```

The client's guard is `if (data.knowledge_module_set !== knowledgeModuleSet) → BLOCKED_NO_PROOF`. If
the shim sources that value **from the request**, the comparison is tautological and can never fail.
This is the safety property verified end-to-end at the v2 bump, reduced to decoration by the component
that sits in the middle of it — and the register tells the next engineer to build it that way.

⇒ **The shim reads `km_set` from the KM's own card extension**, which every card already carries
(`ext.km_set = Fl30KnowledgeBase.EXPECTED_KM_SET`, stamped in B2). That is the gateway's own claim
about what it loaded, and it is a *true* claim: `Fl30KnowledgeBase` refuses to load a bundle whose
`km_set` ≠ `EXPECTED_KM_SET`, and a failed-closed KM emits only `NOT_RUN` — which blocks anyway. The
value must never be sourced from the request. **Cards disagreeing on `km_set` → `NOT_RUN` for all.**

### F-C4 — "no card" is AMBIGUOUS, and conflating it with "not applicable" would DROP a check

`engine.js` emits **no check at all** for a non-applicable one (a non-NTI drug has no `nti_check`), and
the KMs mirror that by returning no card. But a KM that returned zero cards *because of a bug* looks
identical — and the shim would report "not applicable", silently dropping a check the client asked for.
D-B-2 is explicit: *never a drop, never a PASS*.

The split is decidable from `engine.js`, exactly:

| Always emits a verdict | Conditional (no card = legitimately not applicable) |
|---|---|
| `allergy_check` · `interaction_check` · `renal_dosing_check` · `age_appropriateness_check` | `nti_check` (only if NTI) · `schedule_8_check` (only if S8) · `pregnancy_check` (only if a record) · `hepatic_check` (only if a record) |

⇒ For the four **always** checks, zero cards is a **bug → `NOT_RUN`**. For the four **conditional**
ones, zero cards is not-applicable → no verdict, mirroring the engine. Anything else (non-200, timeout,
unmappable extension, off-enum value) → `NOT_RUN`.

### F-C5 — the fan-out: one locked request → N CDS Hooks calls `[design core]`

The client sends **one** `OpenCdsRequest` with `checks_requested[]` (default: the 5 `DEFAULT_CHECKS`).
Each KM is a **separate CDS service** (9 registered, one card each — D-B-2). So the shim must map
`check_id → service id`, POST to each, and merge. `check_verdicts` has `.min(1)`, so a total wipeout
still yields N × `NOT_RUN` rather than an empty array that would fail validation for the wrong reason.

The dose KM is not a `check_id` and has no entry in `checks_requested`. It is called unconditionally
and its output rides as `dose_candidate`; **the client gates it** (PASS/WARN only). The shim does not
compose and does not decide — composition is the client's, behind the frozen contract.

---

## Phase 2 — Design

### Topology impact
**Trunks:** none. **Schemas:** none new; `opencds-contract.js` is the locked target and is **not
edited**. **Servers:** `pharmacology` cds-adapter — **read-only**; the shim lives entirely in the
gateway repo. **Receipts:** unchanged, `mode` stays `mock` (`receiptMode()` gates on `_validated`,
which only A4 flips). **Trust boundary #3** (structured knowledge vs live APIs) is the one in play.
**Blast radius:** breath-ezy gains ONE env-gated smoke test that skips green in CI. The `cds-adapter`
slot stays EMPTY→HARD_FAIL. **Nothing becomes patient-facing.**

### The mapping, stated exactly

```
POST /pharm-check   (the locked JSON the client already speaks)
  → for each check_id in checks_requested:  POST /opencds/r4/hooks/cds-services/<service-id>
        body: {hook:"order-sign", hookInstance:<request_id>,
               context:{drug:<request.drug>, resolved_facts:<request.resolved_facts>}}
  → + always: POST .../fl30-dose-candidate
  → merge cards → {request_id, engine, knowledge_module_set, check_verdicts[], flags[], dose_candidate?}
```

`knowledge_module_set` ← **the cards' `ext.km_set`** (F-C3), never the request.
`engine` ← a fixed literal naming what actually ran (`"opencds-cds-hooks-r4"`), correcting F2's
DSS/vMR misnomer at the only place that emits it.

### Fail-safes (each one a test)
- non-200 / timeout / unreachable KM → that check's verdict = `NOT_RUN`. Never dropped, never PASS.
- card extension missing / unparseable / off-enum `check_id` or `status` → `NOT_RUN`.
- zero cards from an **always** check → `NOT_RUN` (F-C4).
- cards disagreeing on `km_set` → all `NOT_RUN`.
- the shim NEVER composes an overall verdict, and NEVER emits a dose the KM did not.

---

## Phases (dependency order)

### C1 — KM completeness for the wire `[gateway]`
Narrow `DoseCandidateKm.DOSE_KEYS` to the five the locked contract allows (F-C1); emit
`drug_a`/`drug_b` in the card extension (F-C2).
**Verify:** JUnit — a dose record carrying `pbs_item_code` does NOT put it on the wire; an interaction
flag carries both drugs; existing 68 stay green. **GATE.**

### C2 — the shim core `[gateway]`
`shim/server.mjs` (+ `shim/*.test.mjs`). Node `node:http` only — **no dependency**. Pure
`mapCards→verdicts` / `buildHookRequest` functions so every fail-safe is testable without a container.
**Verify:** unit tests for every F-C4 branch + the F-C3 rule (a shim fed cards stamped v1 while the
request says v2 reports **v1**, and the client then blocks — proven against the real client, not a
mock). **GATE.**

### C3 — one container `[gateway]`
Dockerfile: Tomcat + the Node sidecar, per the operator's 2026-07-14 ruling (single container).
**Verify:** `docker build` clean; `docker run` → discovery lists **9** services; a real `POST
/pharm-check` returns a valid `OpenCdsResponse`.

### C4 — the breath-ezy smoke `[breath-ezy]`
`test/smoke-opencds-gateway.js`, env-gated (skips green in CI — the LLM-smoke precedent).
**Verify:** skips green with no endpoint; against a local `docker run`, a full pipeline reaches PASS —
**the first time the 9 KMs are called by anything.**

### C5 — register + docs `[breath-ezy]`
`opencds-gateway-shim` → COMPLETE/PARTIAL. **Correct the `build_action`'s "Echoes km_set" (F-C3) and
its stale `fl30-kb:v1`.** `fl30-kb-km-package` PARTIAL → COMPLETE *only if* C4 proves the KMs are
actually called. CHANGELOG + `.claude/completeness-index.md` in the same phase.
**Verify:** `npm test` + `verification` + `trunk:stub:all` green; frozen contracts byte-unchanged.

---

## Invariant check
**Preserved.** *No autonomous prescription* — the shim emits only what the dose KM produced; the client
still drops it unless PASS/WARN; `assertNoAdvisoryInDose()` unchanged. *No fabricated codes/facts* — the
shim invents no content; anything unmappable becomes `NOT_RUN`. *HARD_FAIL non-overridable* —
untouched; the shim does not compose. *Australian context* — the F5 allowlist already kept foreign
labels out of the bundle. *Mock never as live* — `receiptMode()` stays `mock`; only A4 changes that.
*Scoring-store firewall* — not touched. **Nothing becomes patient-facing in this phase.**

## Register impact
**Closes:** `opencds-gateway-shim`. **Corrects:** its `build_action` (F-C3 echo defect; stale v1).
**May close:** `fl30-kb-km-package` → COMPLETE, but only on C4's evidence. **Opens:** nothing.
**Gap-register:** R-22 does not move; blocker #1 stays RED (A4 + FL-50 own it).

## New dependencies
**None**, either repo. The shim uses `node:http` only. If a real need appears mid-build I stop and
bring it back rather than adding it.

---

## Decisions needed before Phase 3 (GATE)

- **D-C-1 — `km_set` from the CARDS, not echoed.** The register says echo; I have shown echo makes the
  cross-check pass on a lie. *Recommend cards.* This one I would argue against overruling.
- **D-C-2 — the F-C4 split** (four checks always emit; four may legitimately be silent). *Recommend it* —
  it is the only rule that distinguishes "not applicable" from "a KM broke", and it is read straight
  off `engine.js`.
- **D-C-3 — fan-out concurrency.** *Recommend parallel* with a per-call timeout; the checks are
  independent and 9 sequential round-trips would dominate latency. Sequential is simpler to debug.
- **D-C-4 — call the dose KM unconditionally?** *Recommend yes* — the client gates it, and a shim that
  decided when a dose is allowed would be composing, which is precisely what it must not do.
