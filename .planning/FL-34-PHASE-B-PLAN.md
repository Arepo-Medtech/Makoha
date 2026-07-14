# FL-34 · Phase B — `fl30-kb-km-package` (PLAN — awaiting Phase 2 approval)

> Mode: IDE Planner. Produced 2026-07-15 at `main @ e2b940e`. **Nothing here authorises code.**
> Register item: `fl30-kb-km-package` (UNBUILT, Medium, `blocks_patient_facing:false`, gap R-22).
> Inputs read: `.claude/completeness-index.md`, completeness-register `fl30-kb-km-package` /
> `opencds-gateway-shim` / `opencds-gateway-image`, `.planning/TRACK-A-A1-RESEARCH.md`,
> `mcp/servers/pharmacology/{engine.js,sources/pharm-data-source.js,cds-adapter/*}`,
> `mcp/servers/pharmacology/data/*.json`, `scripts/pharm-author.mjs`, `test/contract-pharm-datastore.js`,
> sibling repo `breath-ezy-cds-gateway` (Phase A) + `opencds-build` (pinned upstream source).

## Phase 0 — Completeness scan (done, read-only)

Scoped to the FL-34 path. **No `BLIND_STUB` exists anywhere in the register; no `DEAD_END` on this
path** (the one open `DEAD_END`, `fhir-path-hooks-unwired`, is on the FHIR path — unrelated).
On-path states confirmed: `opencds-gateway-image` COMPLETE · `opencds-cds-adapter-client` COMPLETE ·
`cds-firewall-fold` COMPLETE · `fl30-kb-km-package` UNBUILT (this plan) · `opencds-gateway-shim`
UNBUILT (Phase C). The `cds-adapter` EMPTY→HARD_FAIL floor is intact (`cds-adapter/index.js`).

---

## Phase 1 — Research findings (four, three of which change the build)

### F1 — A KM is a Java **class**, not a Drools ruleset `[corrects A1 Deliverable 3]`
In the pinned build (`OPENCDS_HOOKS=9c48f24…`), `CdsHooksKnowledgeLoader` supports **only**
`packageType == CLASSPATH`: it does `Class.forName(packageId).getDeclaredConstructor().newInstance()`
and casts to `org.opencds.hooks.engine.api.CdsHooksExecutionEngine` (single method
`CdsResponse evaluate(CdsRequest, CdsHooksEvaluationContext)`). Any other package type throws.
So **a KM = an FQCN registered in `k-repo/knowledgeModules.xml`** — no Drools, no CQL, no jar-as-KM.
The A1 memo's "Drools rulesets" is superseded by the delivered build. There is **no built-in
checksum/signing mechanism** in OpenCDS — "checksummed KM package" is a Breath-Ezy convention we add.

### F2 — Transport is **CDS Hooks R4**, not DSS/vMR `[supersedes A1 D-A2-2; doc defect]`
A1 recommended "gateway speaks native DSS/vMR to OpenCDS internally", and
`cds-adapter/opencds-contract.js` still says so in its header (plus `engine: "opencds-dss"` as the
example value). **Phase A actually delivered the CDS Hooks R4 example service**
(`/opencds/r4/hooks/cds-services`), and Phase C is specified as "locked JSON ↔ **CDS Hooks R4**".
The delivered architecture is authoritative; the two comments are now **stale**.
*Not a safety issue* — the locked JSON wire contract between client and gateway is unchanged and is
what the client validates. Fix is a comment/memo correction (Low), listed in Phase B4 below.

### F3 — There is **no signed dose knowledge to export** `[SAFETY — drops the dose KM]`
`data/dose-guidance.json` is `clinical_sign_off:false` with **0 records**; `getDoseGuidance()` falls
back to `mock-data.json.dose_guidance_mock`. Two consequences:
1. A fail-closed export (exclude unsigned) has **nothing to put in a dose-range KM**. Exporting the
   mock doses instead would present mock as live — a Guardrail 4 breach.
2. The firewall fold is **status-only**: `composeCdsVerdict()` reads `cds.verdict` and never the
   slot's dose. A gateway-emitted dose would have **no consumer** → a `DEAD_END` by construction.

⇒ **Recommendation: build no dose-range KM in Phase B.** This contradicts A1 Deliverable 3's
"dose-range KM" row, so it is surfaced rather than silently followed. The in-process engine keeps
emitting its mock dose on PASS/WARN; the gateway emits none. That divergence is **safe and
one-directional** (the gateway is strictly more conservative) but **must be a named expected result
in Phase D parity**, not discovered there as a failure.

### F4 — The `route` KM in the register's `build_action` has no engine semantics `[scope correction]`
`route_appropriateness_check` is in the frozen `check_id` enum but **`engine.js` implements it zero
times** (verified by grep). A route KM would have nothing to mirror — it would be OpenCDS
*introducing new knowledge*, exactly what the gateway README forbids.
⇒ **Recommendation: no route KM.** The register's `build_action` ("…hepatic/pregnancy/schedule_8/route")
is corrected to drop `route` at Phase B4.

### Buildable KM set — **8 KMs**, all backed by signed+approved records

| # | Tranche | `check_id` | Accessor | Dataset (records, all `clinical_sign_off:true`, 0 drafts) |
|---|---|---|---|---|
| 1 | 1 (`DEFAULT_CHECKS`) | `allergy_check` | `getAllergyGroup` | `allergy-cross-reactivity.json` (4) |
| 2 | 1 | `interaction_check` | `getInteractions` | `drug-interactions.json` (872) |
| 3 | 1 | `renal_dosing_check` | `getRenalRule` | `renal-rules.json` (104) |
| 4 | 1 | `nti_check` | `getNti` | `nti-register.json` (53) |
| 5 | 1 | `age_appropriateness_check` | — (pure age logic) | none — no KB needed |
| 6 | 2 | `schedule_8_check` | `getSchedule` | `au-scheduling.json` (261) |
| 7 | 2 | `pregnancy_check` | `getPregnancyRisk` | `pregnancy-risk.json` (18) |
| 8 | 2 | `hepatic_check` | `getHepatic` | `hepatic.json` (13) |
| — | ✂ | `route_appropriateness_check` | — | **not built (F4)** |
| — | ✂ | (dose guidance) | `getDoseGuidance` | **not built (F3)** |

Tranche 1 is exactly the client's `DEFAULT_CHECKS`, so tranche 1 alone makes a default request
answerable end-to-end. Unsigned datasets (`formulations` 725, `pbs-formulary` 14840, `dose-guidance` 0)
are excluded and are read by none of the 8 accessors.

---

## Phase 2 — Design

### Topology impact
**Trunks:** none (Trunk 8.0 unchanged — it gates on PASS/WARN/HARD_FAIL only).
**Servers:** `pharmacology` — **read-only**; no engine, schema, or client change in this phase.
**Schemas:** none new; `opencds-contract.js` is the already-locked target shape and is **not edited**.
**Receipts:** unchanged — `mode` stays `mock` (`receiptMode()` gates on `_validated`, flipped by A4, not B).
**Trust boundaries:** #1 (LLM vs deterministic truth) untouched; #3 (structured knowledge vs live APIs)
is the one in play — the KB bundle is a *versioned dataset*, so it carries `dataset_version` + checksums.
**Blast radius:** **zero on the running pipeline.** Everything Phase B builds lives in the sibling repo
`breath-ezy-cds-gateway`, behind a `cds-adapter` slot that stays EMPTY→HARD_FAIL until A4. The only
breath-ezy change is a doc/comment/register correction (B4). CI cannot redden from B1–B3.

### Key decisions (need your ruling — see "Decisions" at the end)
- **D-B-1 — KB bundle: committed artifact vs build-time export.** Recommend **committed**.
- **D-B-2 — card-encoding convention** for typed verdicts over CDS Hooks. Recommend one card per check.
- **D-B-3 — confirm F3 (no dose KM) and F4 (no route KM).**

### Contracts introduced (gateway repo only — no breath-ezy schema moves)
`kb/manifest.json` — the checksummed KB package descriptor:
```json
{
  "km_set": "fl30-kb:v1",
  "exported_utc": "<iso>",
  "source_repo": "kenleefreo/breath-ezy",
  "source_commit": "<breath-ezy git SHA the export read>",
  "capabilities": [
    { "capability": "allergy", "file": "kb/allergy.json", "dataset_version": "pharm-allergy-xr:v0.1.0-dev",
      "records": 4, "records_checksum": "<sha256 canonical — matches source>", "file_sha256": "<sha256 of bytes>" }
  ],
  "excluded": [ { "file": "dose-guidance.json", "reason": "clinical_sign_off:false" } ]
}
```
`km_set` **must** be exactly `fl30-kb:v1` — the client's `DEFAULT_KM_SET`, cross-checked on every
response (`data.knowledge_module_set !== knowledgeModuleSet` → `BLOCKED_NO_PROOF`).
`source_commit` is the audit link back to the signed datastore, mirroring `pinned-commits.env`'s ethos.

**Two-layer integrity (deliberate):**
- *Provenance layer (Node, export-time):* re-compute `checksumRecords(records)` using the **existing**
  `scripts/pharm-author.mjs` function and assert it equals the dataset's stored `records_checksum`.
  Drift → **export aborts**. This proves the datastore has not been edited since clinician sign-off.
- *Transport layer (Java, load-time):* the KM verifies `file_sha256` over the **exported file's bytes**.
  Chosen so Java never re-implements the canonical-JSON form (sorted-key replacer) — a re-implementation
  is a silent-divergence hazard for a safety artifact. Mismatch → KM fails closed (all checks `NOT_RUN`).

**Export filter (mechanical, fail-closed, tested with fixtures — never assumed):**
1. Drop a whole dataset unless `attestation.clinical_sign_off === true`.
2. Drop any record whose `provenance.review_status !== "approved"` (per-record is authoritative —
   this is what makes `has_unsigned_additions` safe by construction).
3. Record every exclusion in `manifest.excluded[]` — a silent drop is indistinguishable from a bug.
Today rules 1–2 exclude nothing among the 8 KMs' datasets; the rules exist so that stays true by
mechanism, not by luck.

### KM semantics — the binding rule
Every KM **mirrors `engine.js` exactly**, including its fail-safes:
`missing input fact → NOT_RUN` (never a default PASS) · `HARD_FAIL` where the engine hard-fails ·
`WARN` where it warns · paediatric → flag, **never** a dose · pregnancy `X`/contraindicated → HARD_FAIL,
`D` → WARN, and the **age-gated D-FL05-1 fail-safe** (unknown pregnancy status + known teratogen +
childbearing potential (age 12–55 or unknown) → NOT_RUN) reproduced exactly.
The engine is the specification; the KM is a second implementation of it. That is the whole point of
Phase D's A/B parity — two executors, same signed facts, either may HARD_FAIL, neither may rescue.

---

## Phases (dependency order)

### B1 — Export script + KB bundle `[gateway repo]`
`export-fl30-kb.mjs` (+ `kb/` output, + `kb/manifest.json`). Reads a breath-ezy checkout **read-only**
(`--datastore <path>`), applies the export filter, verifies the provenance layer, stamps `km_set`
+ `source_commit`, writes the bundle.
**Verify:** fixture tests — (a) an unsigned dataset is excluded and listed in `excluded[]`; (b) a
single draft record inside a signed dataset is dropped while its siblings survive; (c) a tampered
`records_checksum` **aborts** the export; (d) a golden-file test pins `km_set == "fl30-kb:v1"`.
Expected: all green; `kb/` contains 7 capability files (age needs none); `excluded[]` lists exactly
`dose-guidance` / `formulations` / `pbs-formulary`.

### B2 — Tranche 1 KMs (the 5 `DEFAULT_CHECKS`) `[gateway repo]`
One Java class per check implementing `CdsHooksExecutionEngine`, a shared `Fl30KnowledgeBase` loader
(reads `kb/*.json` from the classpath, verifies `file_sha256`, fails closed), and
`k-repo/knowledgeModules.xml` registrations (`packageType=CLASSPATH`, one `packageId` FQCN each).
**Verify:** per-KM JUnit **mirroring `engine.js` case-for-case** — HARD_FAIL / WARN / PASS /
missing-fact→NOT_RUN / paediatric→flag-not-dose, plus a checksum-tamper test asserting fail-closed.
Expected: green under `mvn test`; discovery lists the 5 new services.

### B3 — Tranche 2 KMs (`schedule_8`, `pregnancy`, `hepatic`) `[gateway repo]`
Same shape. `pregnancy_check` carries the D-FL05-1 age-gated fail-safe; `schedule_8_check` treats S8
as gated by **either** the schedule map **or** the intent's declared schedule (mirroring engine.js's
map-miss safety net).
**Verify:** per-KM JUnit as B2, with a dedicated D-FL05-1 table test (X/D/contraindicated ×
pregnant/not/unknown × age in/out of 12–55). Expected: green; discovery lists all 8.

### B4 — Register + doc reconciliation `[breath-ezy repo — the only breath-ezy change]`
- `fl30-kb-km-package` → **COMPLETE/resolved** (or PARTIAL if only tranche 1 lands).
- Correct the record's `build_action`: drop `route` (F4); state the dose KM is deliberately absent (F3).
- Fix the stale DSS/vMR comments in `cds-adapter/opencds-contract.js` + note the supersession in
  `.planning/TRACK-A-A1-RESEARCH.md` (F2). **Comment-only — no logic touched.**
- Register the expected engine-vs-gateway dose divergence (F3) as a named Phase D input.
- `CHANGELOG.md` + `.claude/completeness-index.md` synced in the same phase.
**Verify:** `npm test` + `npm run verification` + `npm run trunk:stub:all` green (they must be
*unaffected*); frozen `pharm-intent`/`pharm-check`/`verification-gate.js` byte-unchanged vs `e2b940e`.

---

## Verification summary

| Milestone | Proof | Expected |
|---|---|---|
| B1 | gateway fixture tests (4 above) | green; `excluded[]` = the 3 unsigned datasets |
| B2 | per-KM JUnit ×5 mirroring `engine.js` + tamper test | green; discovery lists 5 |
| B3 | per-KM JUnit ×3 + D-FL05-1 table test | green; discovery lists 8 |
| B4 | `npm test`, `npm run verification`, `npm run trunk:stub:all`; frozen-file byte diff | green; empty diff |

## Invariant check
**Preserved, mechanically.** No autonomous prescription — no KM emits a dose (F3), and the fold is
status-only. No fabricated codes/facts — KMs execute only signed+approved records; unsigned content
cannot enter the bundle (export filter) and a tampered bundle fails closed. HARD_FAIL non-overridable —
untouched; `composeCdsVerdict` stays monotone. Mock-never-as-live — `receiptMode()` stays `mock`; A4,
not B, is what could ever change that. Paediatric → flag never dose — mirrored per-KM and JUnit-proven.
Scoring-store firewall — not touched (no `10`–`13` path). `cds-adapter` EMPTY→HARD_FAIL floor — holds
throughout B; **nothing becomes patient-facing in this phase.**

## Register impact
**Closes:** `fl30-kb-km-package` (UNBUILT → COMPLETE, or PARTIAL if tranche 1 only).
**Re-classifies:** none. **Opens:** none expected; a scoped re-scan runs at B4.
**Corrects:** the `fl30-kb-km-package` `build_action` (drop `route`; state no dose KM).
**Unblocks:** Phase C (`opencds-gateway-shim`) — the card convention D-B-2 is its input contract.
**Gap-register:** R-22 **does not move** — FL-34 stays open, blocker #1 stays RED (A4 + FL-50 own that).

## New dependencies
**None in breath-ezy** — no npm package, no schema, no runtime code. Gateway-side: only what the pinned
build already provides (`opencds-hooks-engine-api`, `opencds-hooks-evaluation-r4`, JUnit/Spock). JSON
parsing in the KM uses a library already on the pinned classpath — **confirmed at B2 start; if it would
need a new Maven dependency, I stop and bring it back to you rather than adding it mid-execution.**

---

## Decisions needed before Phase 3 (GATE)

- **D-B-1 — KB bundle: committed artifact, or exported at image-build time?**
  *Recommend **committed***: the gateway image must build reproducibly from its own repo (Phase A's
  ethos); the bundle is a versioned release artifact like `pinned-commits.env`; and sync is enforced by
  `km_set` + checksums + `source_commit`, so a knowledge change requires a deliberate re-export to
  `fl30-kb:v2` rather than silently riding along — which is what you want for clinical knowledge.
  Cost: a synthetic-dev-data copy lives in a second repo (non-PHI).
- **D-B-2 — card encoding.** CDS Hooks cards are loosely structured; A1 rejected them for exactly that.
  *Recommend*: **one card per check** — `summary` = `check_id`, `indicator` = mapped severity,
  `detail` = reason, structured verdict in an extension; the Phase C shim maps cards → `check_verdicts`
  and turns anything it cannot map into `NOT_RUN` (never a drop, never a PASS). Locked here, honoured in C.
- **D-B-3 — confirm F3 (no dose KM) and F4 (no route KM).** Both contradict prior planning docs
  (A1 Deliverable 3; the register `build_action`), so I want them ruled on explicitly, not assumed.
- **D-B-4 — tranche split.** Land B2 (tranche 1 = `DEFAULT_CHECKS`, answerable end-to-end) as its own
  reviewable increment, or B2+B3 together? *Recommend separate* — tranche 1 is independently meaningful.
