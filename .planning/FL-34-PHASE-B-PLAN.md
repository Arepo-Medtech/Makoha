# FL-34 · Phase B — `fl30-kb-km-package` (PLAN — awaiting Phase 2 approval)

> Mode: IDE Planner. **Revised 2026-07-15 at `main @ 9b93eb5`** (PR #76 merged) — supersedes the
> `17da525` revision, which supersedes the `e2b940e` draft. **Nothing here authorises code.**
> Register item: `fl30-kb-km-package` (UNBUILT, Medium, `blocks_patient_facing:false`, gap R-22).
>
> **What changed since the last revision — read first:**
> - **F3 FLIPS. Build the dose KM.** Both legs of its objection are now dead: the source exists
>   (451 clinician-attested doses, E1/E2) *and* the consumer exists (the evidence plane, E3). The
>   previous revision predicted this in `.planning/EVIDENCE-PLANE-PLAN.md` §5.
> - **F6 is NEW and is a defect on this path** — the gateway is sent the RAW drug name while the KB
>   will be INN-keyed. Demonstrated, not theorised.
> - **F5 widens** — E8 added two identity capabilities that must never become executable knowledge.
> - Every KM-backing dataset re-counted at `9b93eb5` (the E7 renames moved records).
>
> Inputs read (this revision, live at `9b93eb5`): `mcp/servers/pharmacology/{engine.js,
> dose-evidence-plane.js,cds-adapter/{index.js,opencds-client.js,opencds-contract.js},
> sources/pharm-data-source.js,domain/model.js}`, `verification/pipeline.js`, `data/*.json` (27 files,
> counted + sign-off read), `scripts/pharm-author.mjs`, sibling repo `breath-ezy-cds-gateway @ 358ad68`.

## Phase 0 — Completeness scan (done, read-only)

Scoped to the FL-34 path. No `BLIND_STUB`; no `DEAD_END` on this path. On-path states:
`opencds-gateway-image` COMPLETE · `opencds-cds-adapter-client` COMPLETE · `cds-firewall-fold` COMPLETE
· `fl30-kb-km-package` UNBUILT (this plan) · `opencds-gateway-shim` UNBUILT (Phase C).
The `cds-adapter` EMPTY→HARD_FAIL floor is intact.

---

## Phase 1 — Research findings

### F1 — A KM is a Java **class**, not a Drools ruleset `[unchanged]`
`CdsHooksKnowledgeLoader` supports only `packageType == CLASSPATH`: `Class.forName(packageId)` cast to
`CdsHooksExecutionEngine` (`CdsResponse evaluate(CdsRequest, CdsHooksEvaluationContext)`). A KM = an
FQCN in `k-repo/knowledgeModules.xml`. No Drools, no CQL, no jar-as-KM. OpenCDS has **no** built-in
checksum/signing — "checksummed KM package" is a Breath-Ezy convention we add.

### F2 — Transport is **CDS Hooks R4**, not DSS/vMR `[unchanged; doc defect]`
Phase A delivered the CDS Hooks R4 example service; `cds-adapter/opencds-contract.js`'s header still
says DSS/vMR (and `engine: "opencds-dss"` is echoed in three contract tests). Not a safety issue — the
locked JSON wire contract is what the client validates. Comment/memo correction at B4.

### F3 — **BUILD the dose KM** `[FLIPPED — both objections are now dead]`

The previous revision refused the dose KM on two legs. **Both are gone:**

| Leg | Then (`17da525`) | Now (`9b93eb5`) |
|---|---|---|
| "nothing to export" | `dose-guidance.json` = 0 records | **451 clinician-attested records**, `clinical_sign_off:true`, **0 drafts** |
| "no consumer → DEAD_END" | `composeCdsVerdict` read `verdict`/`reason` only; the pipeline discarded `cds.dose_guidance` | **E3 built the consumer**: `composeCdsVerdict.evidence` → `pipeline.cdsEvidence` → `assembleDoseEvidence({cdsDoseCandidate})` → `cds_dose_candidate` in `ReviewBundle.dose_evidence[]` → rendered by `portal renderDoseEvidence()` |

I named the circularity when E3 landed and it is worth keeping in view: *the dose was discarded because
nothing consumed it, and nothing consumed it because it was discarded.* The evidence plane broke it.

**What the dose KM is FOR — and it is not "a second dose".** The gateway executes the same signed
records the engine does, so agreement is **corroboration** and divergence is a **defect signal in one
of the two executors**. That is precisely what Phase D's A/B parity exists to test, and it is the only
way to find out whether the gateway executes our knowledge faithfully. The output is `dose_candidate`
— **advisory**, rendered beside the AU dose as "a second independent executor's opinion", never
`PharmCheck.dose_guidance`. The engine's dose remains the only authoritative one; `assertNoAdvisoryInDose()`
throws if a `cds_dose_candidate` ever reaches the AU dose field.

⇒ **9 KMs** (8 checks + the dose in the KB). The safety properties hold by construction: the client
already drops a dose on HARD_FAIL/NOT_RUN, so no KM can surface a dose the firewall blocked.

### F4 — No route KM `[re-verified at 9b93eb5]`
`route_appropriateness_check` is in the frozen enums but `engine.js` implements it **zero** times
(grep count 0). The engine's complete accessor set is exactly eight: `getAllergyGroup · getDoseGuidance
· getHepatic · getInteractions · getNti · getPregnancyRisk · getRenalRule · getSchedule`. A route KM
would have nothing to mirror — OpenCDS *introducing* knowledge, which the gateway README forbids.
The register's `build_action` is corrected at B4.

### F5 — The export filter needs a capability allowlist `[holds; now WIDER]`
Three capabilities must never become executable knowledge, and sign-off is **not** what excludes them:

- `international-dose-guidance` (12 US/EU label doses) — engine-isolated **by construction** so a
  foreign label can never become an AU dose. It is excluded today only because it is unsigned — an
  incidental property. Its own attestation says clinical sign-off *"is NOT required"*, and the R-47a
  worksheet puts the clinician in front of exactly these records. **The day that flag flips, a
  sign-off-only filter admits 12 foreign doses into an executable KM.**
- `drug-vocabulary` (E8, 1455 drugs) and `ingredient-identity` (E6, 1473 names) — **identity, not
  clinical execution.** A vocabulary entry redirects a lookup; executing one inside OpenCDS would let
  the gateway resolve identity independently of the engine — a second, divergent canonicaliser, which
  is the E6 defect with extra steps.

⇒ **`EXPORTABLE_CAPABILITIES` allowlist, checked FIRST.** Sign-off becomes necessary, never sufficient.

### F6 — **NEW · the gateway is sent the RAW drug name, and the KB will be INN-keyed** `[DEFECT on this path]`

**Demonstrated at `9b93eb5`** with a recording fake gateway:

```
engine canonicalises to  : furosemide     (E7 — and the KB is exported from those records)
gateway actually receives: "frusemide"    ← the raw intent name
```

`verification/pipeline.js:198` calls `queryCds(options.pharm_intent, …)` — the **raw** intent —
and `opencds-client.js:76` does `extractDrug(intent)` → `di.drug_name` unchanged. Meanwhile
`engine.js:62` canonicalises **once at its own boundary** (E7), so the engine checks `furosemide`
while the gateway would look up `frusemide` in an INN-keyed KB and find nothing.

**This is the E6 defect rebuilt one layer out.** Consequences:
- *Safe, but useless:* a gateway miss folds to `BLOCKED_NO_PROOF` (the fold is monotone — it can only
  add severity), so nothing unsafe ships. But **every aliased name would block**, making the OSS CDS
  path unusable for exactly the names E7/E8 exist to handle.
- *Worse, it splits the A/B parity:* engine says PASS on `furosemide`, gateway says unknown on
  `frusemide`. Phase D would read a **naming artifact as a parity failure** and chase a ghost.

**Latent today** (no gateway is connected — the endpoint check fails first), **live the moment A4
stands one up**. It belongs to Phase B because Phase B decides the KB's keying.

⇒ **B0 (new, first): canonicalise once, before BOTH executors.** The pipeline resolves the drug's
identity and passes the same canonical name to `runPharmCheck` *and* `queryCds`. `runPharmCheck`'s own
canonicalise is idempotent, so it becomes a no-op rather than a second opinion. One identity, two
executors — the same principle E7 established, applied one level up. Alternatives rejected: having the
*client* canonicalise couples the CDS adapter to the datastore and creates a second canonicaliser
(the thing F5 refuses to let the gateway have).

### Buildable KM set — **9**, all backed by signed + approved records `[re-counted at 9b93eb5]`

| # | Tranche | `check_id` | Accessor | Dataset (records; all `clinical_sign_off:true`, **0 drafts**) |
|---|---|---|---|---|
| 1 | 1 (`DEFAULT_CHECKS`) | `allergy_check` | `getAllergyGroup` | `allergy-cross-reactivity.json` (4) |
| 2 | 1 | `interaction_check` | `getInteractions` | `drug-interactions.json` (872) |
| 3 | 1 | `renal_dosing_check` | `getRenalRule` | `renal-rules.json` (104) |
| 4 | 1 | `nti_check` | `getNti` | `nti-register.json` (53) |
| 5 | 1 | `age_appropriateness_check` | — (pure age logic) | none — no KB needed |
| 6 | 2 | `schedule_8_check` | `getSchedule` | `au-scheduling.json` (261) |
| 7 | 2 | `pregnancy_check` | `getPregnancyRisk` | `pregnancy-risk.json` (18) |
| 8 | 2 | `hepatic_check` | `getHepatic` | `hepatic.json` (13) |
| 9 | 3 | *(dose_candidate)* | `getDoseGuidance` | **`dose-guidance.json` (451)** — **F3 flipped** |
| — | ✂ | `route_appropriateness_check` | — | **not built (F4)** — zero engine implementations |

Excluded by the F5 allowlist: `international-dose-guidance` · `drug-vocabulary` · `ingredient-identity`
· `formulations` (725, unsigned) · `pbs-formulary` (14840, unsigned) · the 13 signed reference-only
capabilities (no accessor reads them, so no KM mirrors them).

---

## Phase 2 — Design

### Topology impact
**Trunks:** none (Trunk 8.0 gates on PASS/WARN/HARD_FAIL only).
**Servers:** `pharmacology` — read-only for B1–B3; **B0 touches `verification/pipeline.js`** (one call
site) and exports a canonicalise helper.
**Schemas:** none new. `opencds-contract.js` is the already-locked target and is **not edited**.
**Receipts:** unchanged — `mode` stays `mock` (`receiptMode()` gates on `_validated`, flipped by A4).
**Trust boundaries:** #3 (structured knowledge vs live APIs) — the KB is a *versioned dataset*, so it
carries `dataset_version` + checksums. #2 is implicated by F5.
**Blast radius:** B1–B3 live entirely in `breath-ezy-cds-gateway`, behind a slot that stays
EMPTY→HARD_FAIL until A4. **B0 is the only functional breath-ezy change**, and it is one call site plus
a helper; CI covers it.

### Contracts (gateway repo only — no breath-ezy schema moves)
`kb/manifest.json` — the checksummed KB descriptor: `km_set` (**must** be `fl30-kb:v1`, the client's
`DEFAULT_KM_SET`, cross-checked on every response), `exported_utc`, `source_repo`, `source_commit`
(the audit link back to the signed datastore), `capabilities[]` (each with `dataset_version`,
`records`, `records_checksum`, `file_sha256`), and `excluded[]` with a reason per exclusion.

**Two-layer integrity (deliberate):**
- *Provenance (Node, export-time):* re-compute `checksumRecords(records)` with the **existing**
  `scripts/pharm-author.mjs:62` function and assert it equals the stored `records_checksum`. Drift →
  **export aborts**. This proves the datastore has not moved since sign-off. *(R-46's lesson made
  load-bearing — a stale seal now reddens CI in breath-ezy, and here it aborts an export.)*
- *Transport (Java, load-time):* the KM verifies `file_sha256` over the exported bytes. Chosen so Java
  never re-implements the canonical-JSON form — a re-implementation is a silent-divergence hazard for
  a safety artifact. Mismatch → KM fails closed (all checks `NOT_RUN`).

**Export filter — allowlist-first, fail-closed, fixture-tested:**
1. **Allowlist gate (F5).** `EXPORTABLE_CAPABILITIES` = the 8 KB-backed capabilities. Anything else is
   excluded **regardless of attestation state**.
2. Drop a dataset unless `attestation.clinical_sign_off === true` (necessary, not sufficient).
3. Drop any record whose `provenance.review_status !== "approved"` — per-record is authoritative.
4. Record every exclusion in `manifest.excluded[]` — a silent drop is indistinguishable from a bug.

### KM semantics — the binding rule
Every KM **mirrors `engine.js` exactly**, including its fail-safes: missing input fact → `NOT_RUN`
(never a default PASS) · HARD_FAIL where the engine hard-fails · WARN where it warns · paediatric →
flag, **never** a dose · pregnancy X/contraindicated → HARD_FAIL, D → WARN, and the **age-gated
D-FL05-1 fail-safe** reproduced exactly. The engine is the specification; the KM is a second
implementation of it. That is the entire point of Phase D's A/B parity.

---

## Phases (dependency order)

### B0 — Canonicalise once, before both executors `[breath-ezy — FIRST, and it gates the rest]`
Resolve the drug's identity in the pipeline and pass the same canonical name to `runPharmCheck` and
`queryCds`. Without it the gateway executes an INN-keyed KB against a raw name (F6) and Phase D reads
a naming artifact as a parity failure.
**Verify:** a test asserting the gateway RECEIVES the canonical name for an aliased intent
(`frusemide` → gateway sees `furosemide`) — the F6 demo, inverted into a regression test; plus
`npm test` green (idempotence: `runPharmCheck` canonicalising an already-canonical name is a no-op).
**GATE.**

### B1 — Export script + KB bundle `[gateway repo]`
`export-fl30-kb.mjs` (+ `kb/`, `kb/manifest.json`). Reads a breath-ezy checkout **read-only**
(`--datastore <path>`), applies the filter, verifies the provenance layer, stamps `km_set` +
`source_commit`.
**Verify:** fixtures — (a) an unsigned dataset excluded + listed; (b) a draft record dropped, siblings
survive; (c) a tampered `records_checksum` **aborts**; (d) `km_set == "fl30-kb:v1"` pinned;
(e) **(F5)** `international_dose_guidance` absent **even when its fixture is forced to
`clinical_sign_off:true`**; (f) **(F5)** `drug_vocabulary` + `ingredient_identity` absent — identity is
not executable knowledge; (g) **(F3)** `dose_guidance` **present**, with all 451 records.

### B2 — Tranche 1 KMs (the 5 `DEFAULT_CHECKS`) `[gateway repo]`
One Java class per check implementing `CdsHooksExecutionEngine`; a shared `Fl30KnowledgeBase` loader
(reads `kb/*.json` from the classpath, verifies `file_sha256`, fails closed); `k-repo/knowledgeModules.xml`
registrations (`packageType=CLASSPATH`).
**Verify:** per-KM JUnit **mirroring `engine.js` case-for-case** — HARD_FAIL / WARN / PASS /
missing-fact→NOT_RUN / paediatric→flag-not-dose — plus a checksum-tamper test asserting fail-closed.

### B3 — Tranche 2 KMs (`schedule_8`, `pregnancy`, `hepatic`) `[gateway repo]`
`pregnancy_check` carries the D-FL05-1 age-gated fail-safe; `schedule_8_check` treats S8 as gated by
**either** the schedule map **or** the intent's declared schedule (mirroring engine.js's map-miss net).
**Verify:** per-KM JUnit + a dedicated D-FL05-1 table test (X/D/contraindicated × pregnant/not/unknown
× age in/out of 12–55).

### B4 — Tranche 3: the dose KM `[gateway repo]` `[NEW — F3 flipped]`
Emit `dose_candidate` from the 451 signed records. **Only on PASS/WARN, never paediatric** — mirroring
`engine.js:243`.
**Verify:** JUnit — a dose emitted on PASS matches the engine's byte-for-byte for the same drug;
**no dose on HARD_FAIL/BLOCKED/paediatric**; a drug with no signed dose yields none (never a
substitute). Plus a breath-ezy-side test that a gateway `dose_candidate` surfaces as
`cds_dose_candidate` **advisory** in `ReviewBundle.dose_evidence[]` and **never** as
`PharmCheck.dose_guidance` (`assertNoAdvisoryInDose` throws).

### B5 — Register + doc reconciliation `[breath-ezy]`
- `fl30-kb-km-package` → COMPLETE/resolved (or PARTIAL if tranches land separately).
- Correct the record's `build_action`: drop `route` (F4); **record that the dose KM IS built** and why
  the earlier refusal is superseded (F3).
- Fix the stale DSS/vMR comments (F2) + note the supersession in `.planning/TRACK-A-A1-RESEARCH.md`.
- Register F6's fix and the expected Phase D parity inputs.
- `CHANGELOG.md` + `.claude/completeness-index.md` synced in the same phase.
**Verify:** `npm test` + `npm run verification` + `npm run trunk:stub:all` green; frozen
`pharm-intent`/`pharm-check`/`verification-gate.js`/`verifier.js` byte-unchanged vs `9b93eb5`.

---

## Verification summary

| Milestone | Proof | Expected |
|---|---|---|
| B0 | gateway-receives-canonical-name test; `npm test` | green; `frusemide` → gateway sees `furosemide` |
| B1 | fixtures (a)–(g) | green; `excluded[]` carries allowlist + sign-off reasons |
| B2 | per-KM JUnit ×5 + tamper test | green; discovery lists 5 |
| B3 | per-KM JUnit ×3 + D-FL05-1 table | green; discovery lists 8 |
| B4 | dose JUnit + the breath-ezy advisory-containment test | green; discovery lists 9; no dose past a blocked firewall |
| B5 | `npm test`, `verification`, `trunk:stub:all`; frozen byte-diff vs `9b93eb5` | green; empty diff |

## Invariant check
**Preserved, mechanically.** *No autonomous prescription* — the KM emits an **advisory**
`dose_candidate` only; `PharmCheck.dose_guidance` stays the clinician-signed AU record, and
`assertNoAdvisoryInDose()` throws if that is ever violated. *No fabricated codes/facts* — KMs execute
only signed + approved records; unsigned content cannot enter (filter) and a tampered bundle fails
closed. *Australian context only* — the F5 allowlist excludes foreign labels structurally, tested
against a forced-sign-off fixture. *HARD_FAIL non-overridable* — untouched; `composeCdsVerdict` stays
monotone on status. *Mock never as live* — `receiptMode()` stays `mock`; A4, not B, could change that.
*Paediatric → flag never dose* — mirrored per-KM and JUnit-proven. *Scoring-store firewall* — not
touched. **Nothing becomes patient-facing in this phase.**

## Register impact
**Closes:** `fl30-kb-km-package` (UNBUILT → COMPLETE, or PARTIAL by tranche).
**Corrects:** its `build_action` (drop `route`; the dose KM is now built, F3 superseded).
**Opens:** an F6 record if B0 is deferred rather than done. **Unblocks:** Phase C.
**Gap-register:** R-22 **does not move** — FL-34 stays open, blocker #1 stays RED (A4 + FL-50 own it).

## New dependencies
**None in breath-ezy.** Gateway-side: only what the pinned build provides
(`opencds-hooks-engine-api`, `opencds-hooks-evaluation-r4`, JUnit/Spock). JSON parsing in the KM uses a
library already on the pinned classpath — **confirmed at B2 start; if it would need a new Maven
dependency I stop and bring it back rather than adding it mid-execution.**

---

## Decisions needed before Phase 3 (GATE)

- **D-B-1 — KB bundle: committed artifact, or exported at image-build time?** *Recommend **committed***
  — the gateway image must build reproducibly from its own repo (Phase A's ethos); the bundle is a
  versioned release artifact like `pinned-commits.env`; sync is enforced by `km_set` + checksums +
  `source_commit`, so a knowledge change requires a deliberate re-export to `fl30-kb:v2` rather than
  silently riding along. Cost: a synthetic-dev-data copy lives in a second repo (non-PHI).
- **D-B-2 — card encoding.** *Recommend* **one card per check** — `summary` = `check_id`, `indicator` =
  mapped severity, `detail` = reason, structured verdict in an extension; the Phase C shim maps cards →
  `check_verdicts` and turns anything it cannot map into `NOT_RUN` (never a drop, never a PASS).
- **D-B-3 — confirm F3's FLIP: build the dose KM.** The last revision refused it and you never ruled;
  the ground has since moved under both objections (451 signed doses; the evidence plane consumes a
  `dose_candidate`). Recommend **build it** — it is what makes Phase D's A/B parity cover dosing, which
  is the highest-stakes thing the gateway would execute. *Counter-case, fairly: it is more Java to
  maintain, and the gateway's dose is discarded on every HARD_FAIL anyway.*
- **D-B-4 — B0 now, or defer F6 to A4?** *Recommend **now***: it is one call site, it is the difference
  between Phase D measuring parity and measuring a spelling, and deferring it means A4 debugging a
  naming artifact under staging pressure.
- **D-B-5 — tranche split.** Land B2 (tranche 1 = `DEFAULT_CHECKS`, answerable end-to-end), B3, B4 as
  separate reviewable increments? *Recommend separate* — each is independently meaningful, and the dose
  KM (B4) is the one most worth reviewing alone.
