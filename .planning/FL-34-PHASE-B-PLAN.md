# FL-34 · Phase B — `fl30-kb-km-package` (PLAN — awaiting Phase 2 approval)

> Mode: IDE Planner. **Revised 2026-07-15 at `main @ 17da525`** — supersedes the `e2b940e` draft,
> which was written before PRs #73–#75 landed the 11 clinician-signed AU doses. **Nothing here
> authorises code.**
> Register item: `fl30-kb-km-package` (UNBUILT, Medium, `blocks_patient_facing:false`, gap R-22).
>
> **What changed in this revision (read first):**
> - **F3 is rewritten.** Its first premise ("no signed dose knowledge to export") is now **false** —
>   `dose-guidance.json` holds 11 clinician-signed records. Its *conclusion* (no dose KM in Phase B)
>   **survives on the second premise**, which I re-verified line-by-line. The tracker's note that
>   "Phase B's dose-range KM source now exists" is true but **does not** imply a dose KM should be
>   built — see F3.
> - **F5 is new** — a latent jurisdiction hazard in the export filter as previously specified.
> - The Phase D dose-divergence expectation is corrected (the mock dose fallback is gone).
>
> Inputs read (this revision, live at `17da525`): `.claude/completeness-index.md`,
> completeness-register `fl30-kb-km-package` (L863–876) / `opencds-gateway-shim`,
> `mcp/servers/pharmacology/{engine.js,cds-adapter/{index.js,opencds-client.js,opencds-contract.js}}`,
> `mcp/servers/pharmacology/data/*.json` (25 files, counted + sign-off read),
> `verification/pipeline.js` L150–215, `scripts/pharm-author.mjs`, `test/contract-pharmacology-cds.js`,
> sibling repo `breath-ezy-cds-gateway @ 358ad68` (Phase A delivered).

## Phase 0 — Completeness scan (done, read-only)

Scoped to the FL-34 path. **No `BLIND_STUB` anywhere in the register; no `DEAD_END` on this path**
(the one open `DEAD_END`, `fhir-path-hooks-unwired`, is on the FHIR path — unrelated).
On-path states confirmed: `opencds-gateway-image` COMPLETE · `opencds-cds-adapter-client` COMPLETE ·
`cds-firewall-fold` COMPLETE · `fl30-kb-km-package` UNBUILT (this plan) · `opencds-gateway-shim`
UNBUILT (Phase C). The `cds-adapter` EMPTY→HARD_FAIL floor is intact — re-verified in
`cds-adapter/index.js`: `SYNTHETIC_SELF_DEVELOPED` is explicitly rejected as a provider, and even
`FILLED`/`AU_OSS_CDS` require a non-placeholder endpoint.

---

## Phase 1 — Research findings

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
example value, echoed in three contract tests). **Phase A actually delivered the CDS Hooks R4 example
service** (`/opencds/r4/hooks/cds-services`), and Phase C is specified as "locked JSON ↔ CDS Hooks R4".
The delivered architecture is authoritative; the comments are **stale**.
*Not a safety issue* — the locked JSON wire contract between client and gateway is unchanged and is
what the client validates. Fix is a comment/memo correction (Low), listed in B4.

### F3 — No dose KM in Phase B `[REWRITTEN — the conclusion holds, the reason changed]`

**The old first premise is dead.** `data/dose-guidance.json` is now `clinical_sign_off: true`,
reviewer *Kenneth Lee (MED0001857758)*, with **11 records** (verified live). The C3 change removed the
`mock-data.json` dose fallback entirely (`sources/pharm-data-source.js` L169 documents the removal).
So "there is nothing to export" is **no longer true**, and the tracker correctly notes the source now
exists. **This does not make a dose KM correct to build.**

**The second premise holds, and it is decisive.** I traced the dose path end-to-end at `17da525`:

| Hop | Code | Behaviour |
|---|---|---|
| Gateway → client | `OpenCdsResponseSchema.dose_candidate` (`opencds-contract.js:138`) | optional field exists |
| Client maps it | `opencds-client.js:130` — `canDose && data.dose_candidate ? … : null` | mapped to `dose_guidance`, dropped on HARD_FAIL/NOT_RUN |
| **Pipeline folds** | `pipeline.js:186-188` — `composeCdsVerdict(firewall_status, cds)` | **reads `cds.verdict` + `cds.reason` ONLY** |
| **Pipeline drops** | `cds` is referenced *nowhere else* in the block | **`cds.dose_guidance` is discarded** |

`composeCdsVerdict` (`cds-adapter/index.js:77-86`) returns `{status, blocks, cds_verdict,
blocking_reasons}` — no dose field exists in its return shape. The pipeline comment says it outright:
*"Nothing here emits a dose; it only tightens continuation."*

⇒ A gateway-emitted dose reaches the client, is mapped, and is then **thrown away**. It has no
consumer on the pipeline path. The dose that actually reaches `PharmCheck.dose_guidance` comes from
the **in-process engine** reading the 11 signed records (`engine.js:244`).

**Three reasons this stays out of Phase B, in order of weight:**
1. **It would build a second dose source with no reconciliation rule.** The gateway KM would
   re-implement the *same* 11 signed records in Java. Two executors, two dose outputs, one output
   silently discarded — and the moment anyone wires `folded.dose` through, there are two candidate
   doses and no specified precedence. That is a latent no-autonomous-prescription hazard, created by us.
2. **Un-consumed output is `DEAD_END` by construction** — the register's own taxonomy. Phase B must
   not add a node with out-degree 0 on the pipeline path.
3. **Dose congruence (R-47b) is unbuilt.** A dose surfaced to a clinician must show its US/EU
   comparators verbatim (the AU-primacy ruling presumes the clinician saw the divergence). A gateway
   dose path would need that surface too. R-47b is portal-blocker scope — **not** Phase B's, and
   Phase B must not quietly create a second dose channel that will owe it.

**Correcting the divergence description for Phase D.** The old plan said "the in-process engine keeps
emitting its mock dose on PASS/WARN". That is now wrong — the mock fallback is gone. The accurate
expected result, which must be a **named input to Phase D parity, not a discovery**:

> On PASS/WARN, non-paediatric: the **engine** emits a real clinician-signed AU dose for the 11
> covered ingredients and **no dose at all** for every other drug; the **gateway** emits no dose ever.
> Divergence is one-directional (gateway strictly more conservative) and therefore safe.

### F4 — The `route` KM in the register's `build_action` has no engine semantics `[re-verified]`
`route_appropriateness_check` appears **only** in the frozen `pharm-intent`/`pharm-check` schema enums
and their prose descriptions (plus the case-authoring kit). `engine.js` implements it **zero times** —
re-verified at `17da525`: the engine's complete accessor set is exactly
`getAllergyGroup · getDoseGuidance · getHepatic · getInteractions · getNti · getPregnancyRisk ·
getRenalRule · getSchedule`. A route KM would have nothing to mirror — it would be OpenCDS
*introducing new knowledge*, exactly what the gateway README forbids.
⇒ **No route KM.** The register's `build_action` is corrected at B4.

### F5 — **NEW · the sign-off-only export filter has a jurisdiction hole** `[SAFETY]`

`data/international-dose-guidance.json` holds **12 verbatim US/EU approved-label doses** (FDA SPL /
EMA SmPC via AMASS RegulatoryCore). It is **deliberately engine-isolated** — no engine accessor reads
it (confirmed by F4's accessor list); only `pharm-dose-worksheet.mjs` and `pharm-dose-author.mjs` read
it, both authoring-time tools. Its own status field states the design intent plainly: *"Structurally
ISOLATED from the PharmCheck engine … so a foreign label can never become an AU dose — the 'Australian
healthcare context only' hard limit is preserved by construction, not by wording."*

**The hole:** under the previously-specified filter, this dataset is excluded **only because
`clinical_sign_off:false`** — an incidental property, not the real reason. And its attestation block
says clinical sign-off *"is NOT required"* for it. Nothing stops a future pass from signing it — and
that is not hypothetical: the R-47a worksheet round-trip puts the clinician in front of exactly these
comparator records, and "the clinician attested these transcriptions are accurate" is a natural thing
for a later tranche to record. **The day that flag flips, a sign-off-only filter silently admits 12
foreign-jurisdiction doses into an executable KM.** That breaches the *Australian healthcare context
only* population-scope limit and the no-autonomous-prescription invariant, via a filter that was
working exactly as written.

⇒ **The export filter gains an explicit capability allowlist** (below). Sign-off becomes a *necessary*
condition, never a sufficient one. Fail-safe direction: a capability not on the allowlist is excluded
regardless of any attestation state, and the bundle is asserted never to contain
`international_dose_guidance` — as a test, not a convention.

### Buildable KM set — **8 KMs**, all backed by signed + approved records

| # | Tranche | `check_id` | Accessor | Dataset (records; all `clinical_sign_off:true`, 0 drafts — verified `17da525`) |
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
| — | ✂ | (dose guidance) | `getDoseGuidance` | **not built (F3)** — source now exists; consumer does not |

Tranche 1 is exactly the client's `DEFAULT_CHECKS` (verified `opencds-client.js:28`), so tranche 1
alone makes a default request answerable end-to-end. Excluded datasets and why:
`dose-guidance` (11, signed — **excluded by allowlist**, F3) · `international-dose-guidance` (12 —
**excluded by allowlist**, F5) · `formulations` (725, unsigned) · `pbs-formulary` (14840, unsigned) ·
the 13 signed reference-only capabilities (`clinical-uses`, `precautions`, `pharmacokinetics`, … —
excluded by allowlist; no engine accessor reads them, so no KM mirrors them).

---

## Phase 2 — Design

### Topology impact
**Trunks:** none (Trunk 8.0 unchanged — it gates on PASS/WARN/HARD_FAIL only).
**Servers:** `pharmacology` — **read-only**; no engine, schema, or client change in this phase.
**Schemas:** none new; `opencds-contract.js` is the already-locked target shape and is **not edited**.
**Receipts:** unchanged — `mode` stays `mock` (`receiptMode()` gates on `_validated`, flipped by A4, not B).
**Trust boundaries:** #1 (LLM vs deterministic truth) untouched; **#3 (structured knowledge vs live
APIs)** is the one in play — the KB bundle is a *versioned dataset*, so it carries `dataset_version` +
checksums. **#2** is implicated by F5: a foreign label is *reference* knowledge and must never cross
into the executable-operational layer.
**Blast radius:** **zero on the running pipeline.** Everything B1–B3 builds lives in the sibling repo
`breath-ezy-cds-gateway @ 358ad68`, behind a `cds-adapter` slot that stays EMPTY→HARD_FAIL until A4.
The only breath-ezy change is a doc/comment/register correction (B4). CI cannot redden from B1–B3.

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
  "excluded": [
    { "file": "dose-guidance.json", "reason": "not on EXPORTABLE_CAPABILITIES allowlist (F3 — no consumer for a gateway dose)" },
    { "file": "international-dose-guidance.json", "reason": "not on EXPORTABLE_CAPABILITIES allowlist (F5 — foreign jurisdiction, engine-isolated by design)" }
  ]
}
```
`km_set` **must** be exactly `fl30-kb:v1` — the client's KM-set constant, cross-checked on every
response (`opencds-client.js:122` → `data.knowledge_module_set !== knowledgeModuleSet` →
`BLOCKED_NO_PROOF`). `source_commit` is the audit link back to the signed datastore, mirroring
`pinned-commits.env`'s ethos.

**Two-layer integrity (deliberate):**
- *Provenance layer (Node, export-time):* re-compute `checksumRecords(records)` using the **existing**
  `scripts/pharm-author.mjs:62` function (sorted-key canonical JSON → SHA-256) and assert it equals the
  dataset's stored `records_checksum`. Drift → **export aborts**. This proves the datastore has not
  been edited since clinician sign-off. *(This is the R-46 lesson made load-bearing: a stale seal is
  now a CI-red in breath-ezy — `npm run pharm:seals` reports 23/23 — and here it aborts an export.)*
- *Transport layer (Java, load-time):* the KM verifies `file_sha256` over the **exported file's bytes**.
  Chosen so Java never re-implements the canonical-JSON form — a re-implementation is a
  silent-divergence hazard for a safety artifact. Mismatch → KM fails closed (all checks `NOT_RUN`).

**Export filter — mechanical, fail-closed, allowlist-first (F5), tested with fixtures:**
1. **Allowlist gate (new, first).** `EXPORTABLE_CAPABILITIES` = exactly the 7 KB-backed capabilities in
   the table above. A capability not on it is **excluded regardless of attestation state**. Rationale
   in-code: an executable KM is the operational layer; only knowledge the engine itself executes may
   enter it.
2. Drop a whole dataset unless `attestation.clinical_sign_off === true` (necessary, not sufficient).
3. Drop any record whose `provenance.review_status !== "approved"` — per-record is authoritative; this
   is what makes `has_unsigned_additions` safe by construction.
4. Record every exclusion in `manifest.excluded[]` — a silent drop is indistinguishable from a bug.

Rules 2–3 exclude nothing among the 7 today; they exist so that stays true by mechanism, not by luck.

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
(`--datastore <path>`), applies the export filter, verifies the provenance layer, stamps `km_set` +
`source_commit`, writes the bundle.
**Verify:** fixture tests —
(a) an unsigned dataset is excluded and listed in `excluded[]`;
(b) a single draft record inside a signed dataset is dropped while its siblings survive;
(c) a tampered `records_checksum` **aborts** the export;
(d) a golden-file test pins `km_set == "fl30-kb:v1"`;
(e) **(F5) `international_dose_guidance` is absent from the bundle even when its fixture is forced to
`clinical_sign_off:true`** — the allowlist, not the sign-off flag, is what excludes it;
(f) **(F3) `dose_guidance` is absent even though it is genuinely signed** — asserts the deliberate
omission, so a later reader cannot mistake it for an oversight.
Expected: all green; `kb/` contains 7 capability files (age needs none); `excluded[]` lists
`dose-guidance` / `international-dose-guidance` / `formulations` / `pbs-formulary` + the 13 signed
reference-only capabilities, each with its allowlist/sign-off reason.

### B2 — Tranche 1 KMs (the 5 `DEFAULT_CHECKS`) `[gateway repo]`
One Java class per check implementing `CdsHooksExecutionEngine`, a shared `Fl30KnowledgeBase` loader
(reads `kb/*.json` from the classpath, verifies `file_sha256`, fails closed), and
`k-repo/knowledgeModules.xml` registrations (`packageType=CLASSPATH`, one `packageId` FQCN each).
**Verify:** per-KM JUnit **mirroring `engine.js` case-for-case** — HARD_FAIL / WARN / PASS /
missing-fact→NOT_RUN / paediatric→flag-not-dose, plus a checksum-tamper test asserting fail-closed,
plus **a test asserting no KM populates `dose_candidate`** (F3 held mechanically, not by convention).
Expected: green under `mvn test`; discovery lists the 5 new services.

### B3 — Tranche 2 KMs (`schedule_8`, `pregnancy`, `hepatic`) `[gateway repo]`
Same shape. `pregnancy_check` carries the D-FL05-1 age-gated fail-safe; `schedule_8_check` treats S8
as gated by **either** the schedule map **or** the intent's declared schedule (mirroring engine.js's
map-miss safety net).
**Verify:** per-KM JUnit as B2, with a dedicated D-FL05-1 table test (X/D/contraindicated ×
pregnant/not/unknown × age in/out of 12–55). Expected: green; discovery lists all 8.

### B4 — Register + doc reconciliation `[breath-ezy repo — the only breath-ezy change]`
- `fl30-kb-km-package` → **COMPLETE/resolved** (or PARTIAL if only tranche 1 lands).
- Correct the record's `build_action` (L873): drop `route` (F4); state the dose KM is **deliberately
  absent with the source present** (F3) — the record must not read as "not yet done".
- Fix the stale DSS/vMR comments in `cds-adapter/opencds-contract.js` + note the supersession in
  `.planning/TRACK-A-A1-RESEARCH.md` (F2). **Comment-only — no logic touched.**
- Register the expected engine-vs-gateway dose divergence (F3, corrected form) as a named Phase D input.
- **Consider (F5): promote the jurisdiction-allowlist rationale into the register** as a note on
  `international-dose-guidance`, so the next author of an export/ingest path inherits the reasoning
  rather than re-deriving it. *(Flagged for your ruling — D-B-5.)*
- `CHANGELOG.md` + `.claude/completeness-index.md` synced in the same phase.
**Verify:** `npm test` + `npm run verification` + `npm run trunk:stub:all` green (they must be
*unaffected*); frozen `pharm-intent`/`pharm-check`/`verification-gate.js` byte-unchanged vs `17da525`.

---

## Verification summary

| Milestone | Proof | Expected |
|---|---|---|
| B1 | gateway fixture tests (a)–(f) | green; `excluded[]` carries the allowlist + sign-off reasons |
| B2 | per-KM JUnit ×5 mirroring `engine.js` + tamper test + no-`dose_candidate` test | green; discovery lists 5 |
| B3 | per-KM JUnit ×3 + D-FL05-1 table test | green; discovery lists 8 |
| B4 | `npm test`, `npm run verification`, `npm run trunk:stub:all`; frozen-file byte diff vs `17da525` | green; empty diff |

## Invariant check
**Preserved, mechanically.** *No autonomous prescription* — no KM emits a dose (F3), enforced by a B2
test, and the fold stays status-only. *No fabricated codes/facts* — KMs execute only signed + approved
records; unsigned content cannot enter the bundle (filter rules 2–3) and a tampered bundle fails closed.
*Australian healthcare context only* — the F5 allowlist makes foreign-label exclusion structural rather
than incidental, tested against a forced-sign-off fixture. *HARD_FAIL non-overridable* — untouched;
`composeCdsVerdict` stays monotone. *Mock-never-as-live* — `receiptMode()` stays `mock`; A4, not B, is
what could ever change that. *Paediatric → flag never dose* — mirrored per-KM and JUnit-proven.
*Scoring-store firewall* — not touched (no `10`–`13` path). *`cds-adapter` EMPTY→HARD_FAIL floor* —
holds throughout B; **nothing becomes patient-facing in this phase.**

## Register impact
**Closes:** `fl30-kb-km-package` (UNBUILT → COMPLETE, or PARTIAL if tranche 1 only).
**Re-classifies:** none. **Opens:** none expected; a scoped re-scan runs at B4.
**Corrects:** the `fl30-kb-km-package` `build_action` (drop `route`; record the deliberate dose-KM
omission). **Possibly annotates** `international-dose-guidance` with the F5 rationale (D-B-5).
**Unblocks:** Phase C (`opencds-gateway-shim`) — the card convention D-B-2 is its input contract.
**Gap-register:** R-22 **does not move** — FL-34 stays open, blocker #1 stays RED (A4 + FL-50 own that).
**Does not touch R-47b** — no dose channel is created, so no congruence surface is owed by Phase B.

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
- **D-B-3 — confirm F3 (no dose KM) and F4 (no route KM).** **F3 now needs a fresh ruling**: the old
  draft's "nothing to export" reason is gone, so you are ruling on the *architectural* argument
  (no consumer + second-source hazard + R-47b), not on data availability. The counter-case, stated
  fairly: building it now would make Phase D parity cover dosing too, and would front-load work that a
  future `folded.dose` wiring would need. My recommendation stays **no dose KM** — but this is the
  decision most changed by PRs #73–#75, so it should be explicit.
- **D-B-4 — tranche split.** Land B2 (tranche 1 = `DEFAULT_CHECKS`, answerable end-to-end) as its own
  reviewable increment, or B2+B3 together? *Recommend separate* — tranche 1 is independently meaningful.
- **D-B-5 — F5 scope.** The allowlist is in-scope for B1 either way (it is a filter rule). The question
  is whether B4 also **annotates the register/gap-register** with the jurisdiction rationale, or whether
  that is a separate register-maintenance item. *Recommend annotate in B4* — it is two lines, and the
  reasoning is exactly what a future ingest/export author would otherwise re-derive from scratch.
