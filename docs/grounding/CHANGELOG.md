# Grounding execution log

Records what was committed to `kenleefreo/heydoc` for the grounding/MCP design and execution phases.

---

## Chore — write-time hygiene warning on case ingest (2026-07-06)

**Status:** Branch `chore/ingest-hygiene-warning` (off `main` @ `e5e33f7`). PR open; operator-gated merge. `npm test` 21/21 green. The optional residual hardening logged with the 2026-07-05 sync-dupe cleanup.

### Change
- **`scripts/ingest-case-bundles.mjs`:** after splitting a bundle into its case dir, `cases:ingest` now scans that dir (filename-only, `readdirSync`) and emits a **non-fatal `[HYGIENE]` warning** naming any file that is not one of the 8 canonical split files (`00`/`01`/`02`/`10`/`11`/`12`/`13` + `case_manifest.json`). Cloud-sync copies matching `/ \d+\.[A-Za-z]+$/` ("<node> 2.json") are called out as likely cruft to delete. Catches sync dupes at write time instead of at commit time (the 236-dupe incident entered via a broad `git add`, not the ingest glob).
- **`test/contract-case-ingest.js`:** new assertion block — a clean case dir produces no warning; a stray `"00_case_envelope 2.json"` (author-placed placeholder, no sealed body read) triggers the warning naming the file and flagging it as cruft, while ingest still exits `0`.

### Safety / firewall
Warning-only — never blocks ingest, never changes the exit code, never overwrites. Scan is **filename-only**; sealed `10`–`13` node bodies are never opened, so the scoring-store firewall is preserved by construction. No new dependency (Node 20 ESM; ajv/zod untouched).

### Register impact
- `case-dir-duplicate-files` stays **COMPLETE/resolved** (Low); its `build_action` optional-hardening note moved from "nice-to-have" to **DONE (2026-07-06)**, `last_scanned` → 2026-07-06. No gap-register move (below promotion threshold); no new register item opened.

---

## Chore — sync-dupe cruft cleanup + guards (2026-07-05)

**Status:** Merged. PR #20 (`chore/cruft-guards-and-cleanup`), `main` @ `ccefabd`. CI `test` green; `eval:cases` PASS. Operator-approved merge.

### Change
- **Removed 236 committed `" 2.json"` cloud-sync duplicate case nodes** under `data/cases/` across 30 dirs / 11 series (ID, MSK, NEURO, OBS, OPHTH, RENAL, RESP, SURG, URO, VASC). Each removed file's clean-named tracked twin remains — **twin-verified for all 236**; removed **by path only** (sealed `10`–`13` nodes never opened). Also cleared ~1,998 *untracked* sync-dupes from the working tree.
- **`.gitignore` guards:** `* [0-9].*` (the sync-dupe pattern) and `Projects/` (local business/strategy binary docs — operator reference, never version-controlled).

### Safety / firewall
Every removal ends in `" 2.json"` (asserted — no clean-named node deleted); new ignore pattern shadows **0** tracked files; `eval:cases` unchanged pre/post (302 dirs / 301 attested / 0 failures — the dupes were never counted as cases). Scoring-store firewall intact.

### Register impact
- `case-dir-duplicate-files` **PARTIAL/Medium → COMPLETE/resolved** (re-rated Low: redundant copies of tracked twins, no consumer, firewall never at risk). Root cause corrected in the record: a broad `git add` of the output tree while cloud-sync dupes were present, **not** a loose ingest glob — the ingest input filter is tight (`.endsWith(".casebundle.json")`). Optional residual hardening logged (nice-to-have): `cases:ingest` warn on stray non-canonical files in a target case dir. `.claude/completeness-index.md` updated. No gap-register move (below promotion threshold).

---

## ARCH_PLAN Milestone M11 P1 — terminology live adapter (CSIRO sandbox target) (2026-07-05)

**Status:** Adapter built + smoke-verified against the real sandbox; AU-content connect stays input-gated. Operator-approved (plan + the sandbox-refused-in-production guard). Branch `feat/terminology-live-adapter` (off `main` after PR #16 merged). npm test 21/21, verification pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change (contract frozen — data source only)
- **`mcp/servers/terminology/live-adapter.js` (new):** `validateCodeLive()` — CodeSystem `$validate-code` against a live FHIR terminology server (Node 20 global `fetch`, **no new dependency**); `resolveTxEndpoint()` — endpoint selection + the safety guard. `SYSTEM_URI` maps SNOMED/LOINC/ICD-11; AU-specific systems (ICD-10-AM/PBS/AMT) are `null` (validated only on NCTS/self-host).
- **`mcp/servers/terminology/index.js`:** live branch in `terminology_lookup`/`terminology_validate` (code path) behind `HEYDOC_TERMINOLOGY_ENDPOINT` (`mock` default = rollback; `dev_sandbox`|`ncts_live_api`|`self_hosted`). Endpoint resolved once at startup; **`dev_sandbox` in production → server exits 1** (fail-safe, verified). Live receipts carry the actual endpoint + `mode:"live"`. `$translate` and live text lookup are P1-out-of-scope (fail-safe miss, never fabricated). **The `TerminologyLookup` contract + mock path are unchanged.**
- **`test/contract-terminology-live.js` (new, in `npm test` → CI):** mocked-`fetch` unit tests — request shape (`$validate-code?url=…&code=…`), result-true mapping, every fail-safe path (result:false, HTTP 500, timeout/abort, AU-unmapped system with no network call), plus the production-refuse guard. An **opt-in live smoke** (`HEYDOC_TX_LIVE_SMOKE=1`, skipped in CI) validated a real SNOMED code against the CSIRO sandbox (`22298006` → "Myocardial infarction").

### Invariants
No-fabricated-codes strengthened: a code is live-validated or fail-safe-missed, never invented; the sandbox's unlicensed content is refused in production. Mock is the default rollback. Nothing patient-facing.

### Register impact
- **NEW** `terminology-live-adapter` → PARTIAL (adapter mechanics built; AU-content connect input-gated); gap-register **R-20** annotated; `.claude/server-status.md` + index updated. `terminology-contract-incomplete`/R-20 stays PARTIAL until AU-content validation (NCTS licence or self-host RF2 deploy).

### Remaining (input-gated, M11 onward)
AU-content validation (SNOMED CT-AU / ICD-10-AM / PBS / AMT) via NCTS OAuth or a self-hosted Ontoserver loaded with the SNOMED CT-AU RF2; AU Core value-set binding; live text lookup ($expand) + $translate; the 301-case code re-validation (flip `mock_verified_pending_live_ncts` → live-verified or block on mismatch).

### Verification
`npm test` 21/21 (mock terminology path unchanged); `npm run verification` pass; `trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift; live smoke (opt-in) validated a real sandbox code.

---

## ARCH_PLAN Milestone M8 — production audit substrate seam + retention hook (C5/F3) (2026-07-05)

**Status:** Complete (engineering); live WORM + retention are deploy/regulatory. Operator-approved (never auto-deletes; retention left as a surfaced unset hook). Branch `step-8-audit-worm-substrate`. npm test 20/20, verification pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change (chain algorithm FROZEN — substrate only)
- **`verification/audit-store.js`** — the four raw storage ops (`appendLedgerLine` / `readLedgerLines` / `writeContentOnce` / `readContentByHex`) are now behind a pluggable **substrate**. Built-in **`local`** substrate = the dev JSONL/filesystem backend, **byte-identical** to before (verifyChain + every prior contract assertion unchanged). Production registers a **WORM adapter** (S3 Object Lock, immudb, …) via **`registerAuditSubstrate(name, adapter)`** at deploy — same interface; `computeEntryHash`/`verifyChain`/entry shape/synthetic-only `persistContent` guard all untouched.
- **Fail-safe:** `HEYDOC_AUDIT_SUBSTRATE` (default `local`). A non-`local` value with no adapter registered → **refuses to write** (never a non-WORM medicolegal ledger silently).
- **Retention hook:** `auditRetentionPolicy()` reads `HEYDOC_AUDIT_RETENTION` and surfaces it; unset ⇒ `{configured:false, auto_delete:false, note:"regulatory_posture decision required…"}`. **No period encoded in code; the ledger is never auto-deleted** — retention is a minimum-keep org/regulatory decision, and append-only/WORM forbids early deletion.
- **`test/contract-audit-store.js`** — new case: a custom **in-memory substrate** proves the frozen chain works end-to-end through a non-filesystem backend (append + verifyChain valid + content round-trip); an unconfigured **WORM name refuses**; the **retention hook** surfaces unset/configured with `auto_delete:false`. Env save/restore so the rehash subprocesses are unaffected.
- **`architecture/trust-boundaries.md`** (Boundary 5) — documents the substrate seam, the WORM adapter path, the fail-safe, and retention-as-regulatory-decision.

### Invariants
Append-only + hash-chain + tamper-evidence preserved (frozen); PHI-free entries unchanged; synthetic-only content guard untouched; the WORM guard is strictly stricter (refuses on misconfig). Nothing patient-facing.

### Register impact
- `receipt-store-append-only-unbuilt` (PARTIAL/in-progress) → **COMPLETE/resolved** (engineering); gap-register **R-17 → Dev-COMPLETE 2026-07-05**; index synced. Live WORM + retention explicitly a deploy/regulatory step, not an engineering gap.

### Verification
`npm test` 20/20; `npm run verification` pass; `trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift (chain byte-identical through the local substrate).

---

## ARCH_PLAN Milestone M7 — no_repo_invention severity reconciliation (C15/F11) (2026-07-05)

**Status:** Complete. Operator-approved (gating + severity labels). Branch `step-7-noninvention-severity`. npm test 20/20, verification pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change
- **Drift (C15):** the verifier hard-failed `no_repo_invention` (pass=false), the docs said "warning", and the verifier emitted no `severity` the docs promised. Reconciled to **surfaced-but-gating**.
- **`verification/verifier.js`:** each of the 5 checks now carries a `severity` (Risk-Register mapping): `no_invented_codes`, `no_invented_operations`, `hard_stop_enforcement` → **critical**; `no_invented_guidelines` → **fail**; `no_repo_invention` → **warning**. **Gate unchanged** — `pass = results.every(r => r.passed)`; a failed check of ANY severity still rejects the output. No logic touched beyond adding the label.
- **`verification/report-schema.js`:** no change — it already permitted `severity` (optional). Confirmed it validates.
- **`test/contract-verifier.js`:** asserts each check's severity, and specifically that `no_repo_invention` is `severity=warning` AND `passed=false` AND still drives overall `pass=false` (proves surfaced-but-gating).
- **Docs reconciled:** trunk-constraints.md gains a severity legend; gap-register.md §1b rule + R-11 and .claude/server-status.md tightened so "warning" reads as low-severity, **not** non-blocking.

### Invariants
No verifier check weakened; the fail-safe gate is byte-identical (all existing fixtures keep their pass/fail outcome). Over-flag posture preserved (`no_repo_invention` still blocks). Nothing patient-facing.

### Register impact
- **NEW** `verifier-repo-invention-severity` → **resolved** (completeness-register); gap-register **R-11** annotated; `.claude/*` updated. C15/F11 closed.

### Verification
`npm test` 20/20 (contract-verifier extended); `npm run verification` pass; `trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift; emitted `report.json` now carries per-check severity.

---

## ARCH_PLAN Milestone M6 (cont.) — 50 DST cases attested → 301/301; DST stubs retired (2026-07-05)

**Status:** All 301 ingested cases now clinician-attested; DST housekeeping done. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL written in-session attestation** of the 50 DST cases (40 direct + 10 `--reseq`'d collisions). Recorded as `bulk_clinician_attestation` in each manifest `review` block; scope-guarded to the two DST ingest commits (`6a31499` + `02a1d22`; verified pending == that set). Review block only — node files + sha256 untouched; git diff = 50 manifests.
- **`dst-malformed-bundles` retired** — the 9 empty-stub source bundles + stray `_probe.tmp` deleted with a guard removing only non-well-formed files (all 9 format=null; 50 well-formed bundles remain). Nothing was ever in the repo.
- **`eval:cases`: attested conforming 251 → 301; unreviewed 50 → 0; PASS.** Distribution 49/45/7, coverage 7 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): distribution vs 60/30/10.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 301 cases attested**; only optional distribution polish remains — no blocking work.
- **`dst-malformed-bundles` → resolved.**

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (301 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — id-scheme: globally-assigned seq (`--reseq`); 10 DST collisions auto-resolved (2026-07-05)

**Status:** Cross-series id collisions resolved systemically at the tooling level. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change (operator id-scheme decision: globally-assigned seq)
- **`scripts/ingest-case-bundles.mjs` — new `--reseq` flag.** On a case_id collision, instead of refusing, it assigns the next free **globally-unique** seq (above the max 5-digit seq of any existing case dir, same specialty+difficulty), rewrites the case_id across all 7 nodes + `_bundle` + manifest, and records the **original→assigned mapping** in `case_manifest.ingest.reseq` (the case_id is the medicolegal anchor — provenance preserved). **Never overwrites** (the default still refuses on collision; `--force` unchanged). Ends the cross-series collision problem (AUC-005 & CDV-005 → same id) for all future overlapping batches.
- **`test/contract-case-ingest.js`** — new case: collision refused by default; `--reseq` assigns a new global id, records the mapping, rewrites the sealed-node case_id, and **never overwrites the original** case dir.
- **The 10 DST collisions ingested via `--reseq`** → `SPEC-DERM-01-00100..00106` + `SPEC-DERM-03-00107..00109` (distinct global seqs). The 3 pre-existing cases they collided with (CIA Herpes Labialis, AUC Burns, AMS Dermatitis Herpetiformis) verified untouched (still attested). 56 codes receipted (store total **1580**); 301 cases; distribution 48/45/7 → **49/45/7**. The 10 pending attestation (50 DST total pending).

### Register impact
- **`case-id-cross-series-collision` → resolved** (Medium→Low→resolved): the global-seq scheme is implemented, tested, and used; future collisions auto-resolve with the mapping recorded. The 5 earlier manual `-00099` re-ids stand.
- `case-set-underpopulated` / **R-23**: 301 cases; remaining input-gated = attest the 50 DST cases, retire the 9 DST malformed stubs, optional rebalance.

### Note (batch caveat)
`--reseq` on a whole folder re-seqs EVERY colliding bundle — including already-ingested ones — so it was applied only to the 10 genuinely-uningested collision bundles (targeted by filename), not the folder. Within a real run, sequential writes give distinct seqs; dry-run shows all as the same next-seq (writes nothing) — cosmetic.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — DST batch (operator-re-tiered) ingested; 7th difficulty tier added (2026-07-05)

**Status:** 40 re-tiered DST cases ingested; distribution rebalance (modest) + a 7th difficulty tier. 2 findings handed back. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **DST (Dermatology & Soft Tissue) batch.** Initial recon flagged the batch was 82% atypical despite being requested for a *straightforward* rebalance (folder theme vs difficulty_tier mismatch — same as CFE); **operator re-tiered at source** (straightforward 8 → 27 among well-formed). **40 well-formed new bundles ingested** (20 straightforward + 19 atypical + 1 communication_barrier); 233 codes receipted (store total **1524**); 291 cases.
- **Distribution 47/45/8 → 48/45/7; coverage 6 → 7 difficulty tiers** (communication_barrier/07 now present — all 7 tiers represented). The 40 are `pending_clinician_review`. `eval:cases` PASS.
- **Handed back (not ingested), all fail-safe:**
  - **10 DERM collisions** (SPEC-DERM-01-00016/00021/00031/00036/00042/00043/00046, SPEC-DERM-03-00012/00024/00039) → `case-id-cross-series-collision` (now 15 collisions/5 series; the per-bucket -00099 convention is exhausted in DERM buckets — a systemic seq scheme is overdue).
  - **9 malformed stub bundles** (empty `_bundle`, format+case_id null) + stray `_probe.tmp` → **NEW register item `dst-malformed-bundles`** (Medium). Recurring pattern: the re-tier workflow leaves malformed/temp leftovers each run (CFE: 13 "-RETIRED"; DST: 9 empty stubs) — recommended a leftover-cleanup step in the re-tier workflow.

### Safety
- Only well-formed, non-colliding bundles ingested; sealed nodes split/hashed, never reasoned from. No `--force`; existing 251 untouched (git: 40 new dirs, 0 modified). Source `.txt` never entered the repo.

### Register impact
- `case-set-underpopulated` / **R-23**: 291 cases; 7 tiers; remaining input-gated = attest 40 DST, 10 collisions, 9 malformed stubs, optional rebalance.
- `case-id-cross-series-collision`: +10 (15/5 series; systemic fix overdue). **NEW** `dst-malformed-bundles` (Medium).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — 13 retired CFE bundles deleted; cfe-malformed-bundles resolved (2026-07-05)

**Status:** The 13 operator-retired CFE source bundles deleted; finding closed. Docs-only commit (nothing was in the repo). Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Correction of an earlier diagnosis:** the 13 CFE bundles that ingest REFUSED for "missing/invalid _bundle.format" were **not corrupted** — the operator had deliberately retired them by tagging `_bundle.format` = `"breath-ezy-casebundle-RETIRED"`. The refusal was that retirement working as intended.
- **Per operator instruction ("RETIRE or DELETE"), the 13 source bundles were DELETED** from the CFE Ingest Cases folder, with a safety guard that removed a file only after confirming its `_bundle.format` was NOT `"breath-ezy-casebundle"` — so no well-formed bundle could be deleted. All 13 confirmed `-RETIRED` and removed; 50 well-formed bundles remain in the folder. **Nothing malformed was ever in the repo** (ingest fail-safe), so there is no repo case-file change — only register/docs updates.
- One of the 13 (`SPEC-GI-03-00028`, CFE MCAS) had also been a 6th collision (vs AMS Microscopic Colitis); retired, so that collision is moot.

### Register impact
- **`cfe-malformed-bundles` → resolved** (retired + deleted; earlier "corrupted" evidence corrected).
- `case-id-cross-series-collision`: the MCAS collision noted moot (retired).
- `case-set-underpopulated` / **R-23**: no blocking work remains — only optional distribution polish (47/45/8 → 60/30/10).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (251 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift. No repo case files changed (source-folder deletion only).

---

## ARCH_PLAN Milestone M6 (cont.) — re-id'd CFE case attested → 251/251 attested (2026-07-05)

**Status:** All 251 ingested cases now clinician-attested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL written in-session attestation** of the re-id'd CFE case `SPEC-DERM-03-00099` (the sole pending case; scope-guarded to that one id before writing). Recorded as `single_case_clinician_attestation` in the manifest `review` block — node files + sha256 untouched; git diff = 1 manifest.
- **`eval:cases`: attested conforming 250 → 251; unreviewed 1 → 0; PASS.** Distribution 47/45/8, coverage 6 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 8% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 251 ingested cases attested**; remaining input-gated = the 13 malformed CFE bundles (operator repair → complex past 10%) and optional rebalance.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (251 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — CFE collision re-id'd → SPEC-DERM-03-00099 and ingested (2026-07-05)

**Status:** The CFE id collision resolved; all 5 well-formed collision instances now resolved. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Re-id (operator-authorised), same method** — `SPEC-DERM-03-00041` (CFE *Psoriasis Severe Plaque with Systemic Fatigue*, collided with AMS *Scalp Psoriasis*) → **`SPEC-DERM-03-00099`** (blind 9-id swap on a scratchpad copy; source archive untouched; well-formed source verified). Ingested; 6 codes receipted (store total **1291**); 251 cases. Existing AMS `SPEC-DERM-03-00041` verified untouched (still Scalp Psoriasis, attested).
- **`eval:cases` PASS** — attested 250 (the re-id'd case is `pending_clinician_review`, unreviewed 1); distribution 48/45/8 → **47/45/8**; coverage unchanged.

### Register impact
- `case-id-cross-series-collision`: **all 5 instances resolved** via re-id; only the systemic seq-uniqueness decision remains (Medium, recurs each overlapping batch).
- `case-set-underpopulated` / **R-23**: 251 cases; remaining input-gated = attest the re-id'd CFE case, the 13 malformed CFE bundles, optional rebalance.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift; git scope = 1 new case dir, existing untouched.

---

## ARCH_PLAN Milestone M6 (cont.) — 49 CFE cases attested → 250/250 attested (2026-07-05)

**Status:** All 250 ingested cases now clinician-attested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL written in-session attestation** of the 49 CFE cases. Recorded as `bulk_clinician_attestation` in each manifest `review` block; scope-guarded to the CFE ingest commit `6b329a1` (verified: all 49 pending == that commit set). Review block only — node files + sha256 untouched; git diff = 49 manifests.
- **`eval:cases`: attested conforming 201 → 250; unreviewed 49 → 0; PASS.** Distribution 48/45/8, coverage 6 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 8% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 250 ingested cases attested**; remaining input-gated = the 13 malformed CFE bundles + 1 CFE collision (would push complex past 10%), and optional straightforward rebalance.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (250 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — CFE batch (operator-re-tiered) ingested; complex band 2% → 8% (2026-07-04)

**Status:** 49 re-tiered CFE cases ingested; complex band near target. 2 findings handed back to operator. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **CFE (Complex Fatigue Entities) batch.** Initial recon flagged that the batch was under-tiered (genuinely complex entities — MCAS, autoimmune dysautonomia — labelled tier-03/atypical); **operator re-tiered at source**. Re-recon of the well-formed set: 36 atypical + 14 complex (rare_condition/05 + multi_morbidity_complex/06). **49 well-formed bundles ingested**; 345 codes receipted (store total **1285**); 250 cases.
- **Distribution 59/38/2 → 48/45/8 — complex band jumped 2% → 8% (near the 10% target); coverage 5 → 6 difficulty tiers.** The 49 are `pending_clinician_review`. `eval:cases` PASS.
- **Handed back to operator (not ingested), both fail-safe:**
  - **1 well-formed collision** `SPEC-DERM-03-00041` (CFE Psoriasis-with-fatigue vs AMS Scalp Psoriasis) → `case-id-cross-series-collision` 5th instance (Low→Medium; recurs every overlapping series); re-id pending.
  - **13 malformed bundles** REFUSED for `missing/invalid _bundle.format` — the casebundle wrapper is structurally broken (NOT a firewall issue), likely corrupted during the source re-tier/save. 12 new case_ids + 1 (SPEC-GI-03-00028) also colliding. **NEW register item `cfe-malformed-bundles`** (Medium) — operator must repair the bundle format at source; not agent-fixable (reconstructing bundle internals is case-authoring over sealed content). Stray `__t.txt` in the folder is harmless (tool globs only `*.casebundle.json`).

### Safety
- Only well-formed, non-colliding bundles ingested; sealed nodes split/hashed by the tool, never reasoned from. No `--force`; existing 201 untouched (git: 49 new dirs, 0 modified). Source `.txt` never entered the repo.

### Register impact
- `case-set-underpopulated` / **R-23**: 250 cases; complex band 8%; remaining input-gated = attest 49 CFE, fix 13 malformed bundles, optional rebalance.
- `case-id-cross-series-collision`: 5th instance (Medium). **NEW** `cfe-malformed-bundles` (Medium).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — 3 re-id'd CIA cases attested → 201/201 attested (2026-07-04)

**Status:** All 201 ingested cases now clinician-attested; complex-tier volume is the sole remaining M6 item. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL written in-session attestation** of the 3 re-id'd CIA collision cases (`SPEC-DERM-01-00099`, `SPEC-GI-01-00099`, `SPEC-RESP-01-00099`). Recorded as `bulk_clinician_attestation` in each manifest `review` block; Python scope-guard asserted the pending set == exactly those 3 ids before writing. Review block only — node files + sha256 untouched; git diff = 3 manifests.
- **`eval:cases`: attested conforming 198 → 201; unreviewed 3 → 0; PASS.** Distribution 59/38/2, coverage 5 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 2% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 201 cases attested**; SOLE remaining input-gated item is complex-tier volume.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (201 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — 3 CIA id collisions re-id'd + ingested; all collision instances resolved (2026-07-04)

**Status:** The 3 CIA cross-series id collisions re-id'd and ingested; all 4 known collision instances now resolved. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Re-id (operator-authorised), same method as the AFib case** — blind literal id-string swap (9 ids each) on scratchpad copies; source archive untouched; clinical content not reasoned from:
  - `SPEC-DERM-01-00021` (CIA *Localised First-Degree Burn*) → **`SPEC-DERM-01-00099`**
  - `SPEC-RESP-01-00003` (CIA *Acute Viral Laryngitis*) → **`SPEC-RESP-01-00099`**
  - `SPEC-GI-01-00010` (CIA *Aphthous Stomatitis*) → **`SPEC-GI-01-00099`**
  - Convention: seq `00099` in a specialty bucket = a manually disambiguated re-id (consistent with the AFib case → `SPEC-CARD-01-00099`).
- **Ingested** (dry-run 3/3 OK, no collision, no firewall leak). The 3 existing colliding AUC cases (Burns / Acute Asthma / Acute Pancreatitis) verified **untouched** (still their AUC sources). 13 codes receipted (store total **940**). 201 cases now.
- **`eval:cases` PASS** — attested 198 (the 3 re-id'd are `pending_clinician_review`, unreviewed 3); distribution 59/39/3 → **59/38/2** (3 more straightforward dilute complex); coverage 5 tiers · 3 categories · 19 specialties unchanged.

### Register impact
- `case-id-cross-series-collision`: **all 4 instances resolved** (AFib + these 3) → risk Medium→Low; only the systemic id-scheme decision remains for future series.
- `case-set-underpopulated` / **R-23**: 201 cases; remaining input-gated = attest the 3 re-id'd CIA, complex-tier volume.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift; git scope = 3 new case dirs, existing untouched.

---

## ARCH_PLAN Milestone M6 (cont.) — 4 remediated CIA cases attested → 198/198 attested (2026-07-04)

**Status:** All 198 ingested cases now clinician-attested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL written in-session attestation** of the 4 firewall-remediated CIA cases (DERM-01-00036, EMG-01-00037, GI-01-00027, MH-01-00044). Recorded as `bulk_clinician_attestation` in each manifest `review` block (scope: *CIA firewall-remediated batch (n=4)*); Python scope-guard asserted the pending set == exactly those 4 by id before writing. Review block only — node files + sha256 untouched; git diff = 4 manifests.
- **`eval:cases`: attested conforming 194 → 198; unreviewed 4 → 0; PASS.** Distribution 59/39/3, coverage 5 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 3% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 198 cases attested**; remaining input-gated = complex-tier volume and the 3 CIA id collisions.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (198 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — 4 firewall-remediated CIA bundles ingested; leak finding resolved (2026-07-04)

**Status:** The 4 previously firewall-refused CIA bundles were remediated by the operator and ingested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- The 4 CIA bundles refused earlier for a diagnosis-name leak (DERM-01-00036 "Pityriasis rosea", EMG-01-00037 "Post-viral fatigue", GI-01-00027 "Uncomplicated external haemorrhoid", MH-01-00044 "Transient (adjustment) insomnia") were **regenerated by the operator** with a `transform_flags` step: *"primary diagnosis name removed from AI-Doctor-readable 00/02 fields; diagnosis retained only in sealed nodes 10-13."*
- **Re-verified via the ingest firewall (authoritative, not assumed): dry-run 4/4 `OK_DRY_RUN`, 0 leaks.** Then ingested. 16 codes receipted (store total **927**). 198 cases now (194 attested + 4 remediated CIA `pending_clinician_review`). Distribution 58/40/3 → **59/39/3**. `eval:cases` PASS.
- **Firewall / agent-context note:** the operator attached the 4 full bundles (including sealed 10–13) into the agent context to drive the ingest. Handled strictly as engineering material under the sanctioned digest-carve-out precedent — the sealed answer keys were not reasoned from, reproduced, or routed into any trunk/packet path. The repo-side scoring-store firewall was never breached; ingest split/hashed the sealed nodes mechanically as always.

### Register impact
- **`cia-source-firewall-leaks` → resolved** (remediated + ingested; firewall held throughout). Standing non-blocking recommendation: add a diagnosis-leak pre-check to the authoring/kit step.
- `case-set-underpopulated` / **R-23**: 198 cases; remaining input-gated = attest the 4 remediated CIA, complex-tier volume, the 3 CIA id collisions.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift; git scope = 4 new case dirs, existing untouched.

---

## ARCH_PLAN Milestone M6 (cont.) — 43 CIA cases attested → 194/194 attested (2026-07-04)

**Status:** CIA batch attested; all 194 ingested cases now clinician-reviewed. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL provided written in-session attestation** of the 43 CIA cases. Recorded as `bulk_clinician_attestation` in each manifest `review` block (scope: *CIA Common Infections & Afflictions batch ingested 2026-07-04 (n=43)*, reviewer KL); scope guarded to the CIA ingest commit `488d83c` (verified: all 43 pending == that commit set). Edit scope: review block only — node files + sha256 untouched; git diff = 43 manifests.
- **`eval:cases`: attested conforming 151 → 194; unreviewed 43 → 0; PASS.** Distribution 58/40/3, coverage 5 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 3% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: all 194 ingested cases attested; remaining input-gated = complex-tier volume, the 3 CIA id collisions (re-id), the 4 firewall-refused source bundles (regenerate).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (194 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — CIA batch: 43 ingested; 3 id collisions + 4 firewall-refused surfaced (2026-07-04)

**Status:** CIA common-infections batch partially ingested; 2 new findings registered. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **43 of 50 operator-supplied CIA (Common Infections & Afflictions) casebundles ingested** from `…/Common Infections & Afflictions/… /CIA Ingest Cases` — all `straightforward`/tier-01 (47 common + 3 important_not_to_miss). 190 codes receipted (store total **911**). 194 cases now (151 attested + 43 CIA `pending_clinician_review`).
- **`eval:cases` PASS** — attested 151 (CIA excluded, pending); distribution **45/51/3 → 58/40/3** (the straightforward batch pulls straightforward toward the 60% target and the over-weight atypical toward 30%; complex unchanged at 3%). Coverage 5 tiers · 3 categories · 19 specialties.
- **7 bundles NOT ingested — both handled fail-safe:**
  - **3 cross-series id collisions** (distinct cases, skipped, no `--force`): SPEC-DERM-01-00021 (CIA *Localised First-Degree Burn* vs AUC *Burns*), SPEC-RESP-01-00003 (CIA *Acute Viral Laryngitis* vs AUC *Acute Asthma Exacerbation*), SPEC-GI-01-00010 (CIA *Aphthous Stomatitis* vs AUC *Acute Pancreatitis*). Added to `case-id-cross-series-collision` (now 4 collisions/3 series → risk Low→Medium, recurring).
  - **4 FIREWALL-REFUSED** — the full primary_diagnosis name leaked into AI-Doctor-readable (00/01/02 injectable) text: SPEC-DERM-01-00036 "Pityriasis rosea", SPEC-EMG-01-00037 "Post-viral fatigue", SPEC-GI-01-00027 "Uncomplicated external haemorrhoid", SPEC-MH-01-00044 "Transient (adjustment) insomnia". The ingest firewall REFUSED them (fail-safe; nothing leaked to the repo). **NEW register item `cia-source-firewall-leaks`** (Medium) — source authoring must be regenerated with the diagnosis removed from patient-facing fields; NOT agent-fixable (would require reasoning over answer-key content). Evidence the authoring pipeline can emit leaks that only the ingest firewall catches.

### Safety
- Only clean bundles ingested; sealed nodes split/hashed by the tool, never read into agent reasoning (metadata-only recon; firewall-leak diagnosis names are tool-reported, not agent-read). No `--force`; existing 151 untouched (git: 43 new dirs, 0 modified). Source SOAP `.txt` never entered the repo.

### Register impact
- `case-set-underpopulated` / **R-23**: 194 cases; remaining input-gated = attest 43 CIA, complex volume, 3 CIA collisions, 4 source leaks.
- `case-id-cross-series-collision`: +3 instances (recurring, Medium).
- **NEW** `cia-source-firewall-leaks` (Medium).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — AFib case attested → 151/151 attested, full case set clinician-reviewed (2026-07-04)

**Status:** Whole 151-case set now clinician-attested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL provided written in-session attestation** of the re-id'd AFib case `SPEC-CARD-01-00099` (the only pending case; scope verified as exactly that CVD Atrial Fibrillation case before writing). Recorded as `single_case_clinician_attestation` in its manifest `review` block. Edit scope: review block only — node files + sha256 untouched; git diff = 1 manifest.
- **`eval:cases`: attested conforming 150 → 151; unreviewed 1 → 0; PASS.** Distribution 46/51/3, coverage 5 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 3% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: **all 151 cases attested**; SOLE remaining input-gated item is complex-tier VOLUME (~15 needed vs 5 present).
- `case-id-cross-series-collision`: instance fully closed (re-id'd + ingested + attested); systemic id-scheme decision (Low) stands for future series.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (151 attested, 0 unreviewed); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — id-collision resolved: AFib case re-id'd → SPEC-CARD-01-00099 and ingested (2026-07-04)

**Status:** The skipped CVD Atrial Fibrillation case is re-id'd and ingested; id-collision instance closed. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Re-id (operator-authorised):** the CVD `SPEC-CARD-01-00005` bundle (*Atrial Fibrillation*, source `CDV-005.txt`) — which had collided with the existing attested AUC `SPEC-CARD-01-00005` (*Acute Coronary Syndrome*) — was re-assigned **`SPEC-CARD-01-00099`** (free globally; max prior seq was 00051; chosen above the source-number-derived 1–51 range to mark it a manual disambiguation). Done as a **blind literal id-string swap (9 occurrences) on a scratchpad COPY** — the operator's source archive under `PATIENT INFORMATION` was never modified, and no clinical (sealed-node) content was read. Specialty/difficulty/source preserved.
- **Ingested** `SPEC-CARD-01-00099` (dry-run OK, then real; 151 case dirs now). **12 codes receipted** (`cases:verify-codes`; store total **721**). The existing `SPEC-CARD-01-00005` (ACS) verified untouched.
- **`eval:cases` PASS** — attested 150 (the new AFib case is `pending_clinician_review`, unreviewed 1); distribution 45/51/3 → **46/51/3**; coverage 5 tiers · 3 categories · 19 specialties unchanged.
- **Attestation NOT auto-applied:** the AFib case was the 50th CVD case, but the recorded CVD attestation is scoped `n=49` and did not include it — so it stays pending pending explicit operator confirmation that their CVD review covered it.

### Register impact
- `case-id-cross-series-collision`: **instance resolved** (AFib → -00099, ingested) → risk Medium→Low; the **systemic** id-scheme (seq not unique across series) decision remains open for future large multi-series ingest.
- `case-set-underpopulated` / **R-23**: 151 cases (150 attested + 1 pending AFib); remaining input-gated = attest the AFib case, complex-tier volume to ~10%.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift; git scope = 1 new case dir added, existing untouched.

---

## ARCH_PLAN Milestone M6 (cont.) — 49 CVD cases clinician-attested → 150 attested, gate PASS (2026-07-04)

**Status:** CVD batch attested; entire 150-case set now clinician-attested. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **Operator KL provided written in-session attestation** of the 49 CVD cases. Recorded as `bulk_clinician_attestation` in each of the 49 `case_manifest.json` `review` blocks (scope: *CVD Cardiovascular batch ingested 2026-07-04 (n=49)*, reviewer KL), mirroring the AMS/original batches.
- **Attestation-scope safety:** the operator's message initially carried the previous "50 AMS cases" wording; since AMS was already attested and the 49 pending were the CVD batch, the mismatch was surfaced and the operator confirmed "attest the 49 CVD cases" before anything was written. The flip script's scope guard binds to the **CVD ingest commit `2baad80`** (not source filenames — one CVD case, a vasculitis/GCA case `SPEC-VASC-04-00046`, lacks a `CDV` filename tag; an earlier filename-based guard correctly ABORTED on it before the commit-based scoping was verified).
- **Edit scope: the manifest `review` block ONLY** — no node file (00–13) or recorded `files[].sha256` touched; integrity intact. git diff = exactly 49 `case_manifest.json`.
- **`eval:cases`: attested conforming 101 → 150 (≥45); unreviewed 49 → 0**; PASS. Distribution 45/51/3, coverage 5 tiers · 3 categories · 19 specialties. Sole remaining warning (non-blocking): complex 3% vs 10%.

### Register impact
- `case-set-underpopulated` / **R-23**: full 150-case attestation DONE; remaining input-gated work narrows to **complex-tier VOLUME (~15 needed vs 5 present)** and the **id collision** (`case-id-cross-series-collision`).

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (attested 150); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — CVD batch ingested (49 cases; complex tier + 3rd category seeded; coverage minimums cleared) (2026-07-04)

**Status:** CVD cardiovascular batch ingested; complex tier + `zebra_rare` category now present. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **49 of 50 operator-supplied CVD (Cardiovascular) casebundles ingested** from `…/Cardiovascular/… /CVD Ingest Cases`. Brings the case set's **first complex-tier cases (5 × `rare_condition`, tier 05)** and its **3rd diagnosis category (`zebra_rare`)**, plus atypical (7×02, 2×03, 12×04) and 23 straightforward. All firewall+schema clean.
- **1 bundle skipped — genuine id collision, NOT a duplicate:** CVD `SPEC-CARD-01-00005` = *Atrial Fibrillation* (`CDV-005.txt`) collides with the existing attested `SPEC-CARD-01-00005` = *Acute Coronary Syndrome* (`AUC-005.txt`). The `SPEC-{specialty}-{difficulty}-{seq}` scheme isn't unique across source series (AUC-005 & CDV-005 both → seq 00005). `cases:ingest` (no `--force`) correctly refused to overwrite — the existing attested/receipted case was preserved, the CVD case skipped. **Verified untouched:** existing SPEC-CARD-01-00005 still ACS, still `clinician_reviewed:true`, codes still receipted. New register item **`case-id-cross-series-collision`** (Medium) — operator id-scheme decision needed.
- **373 new codes receipted** (`cases:verify-codes`; store total **709**).
- **`eval:cases` PASS** — attested 101 (≥45; the 49 CVD are `pending_clinician_review`, excluded); distribution **45/55/0 → 45/51/3** (complex now nonzero); **coverage 4→5 tiers, 2→3 diagnosis categories — the 3-tier and 3-category minimums are now CLEARED**. Remaining warnings (non-blocking): complex 3% vs 10%; 49 pending attestation.

### Safety
- Only bundles ingested; sealed `10–13` split/hashed by the tool, never read into agent reasoning (recon metadata-only). No `--force`; existing 101 + reference untouched (git: 49 new dirs, 0 modified existing). Source SOAP `.txt` (under PATIENT INFORMATION) never entered the repo.

### Register impact
- `case-set-underpopulated` / **R-23**: complex tier + 3rd category seeded; coverage minimums met. Remaining input-gated: attest the 49 CVD, more complex to reach ~10%, resolve the id collision.
- **NEW** `case-id-cross-series-collision` (Medium) — id-scheme uniqueness across series.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — 50 AMS cases clinician-attested → 101 attested, gate PASS (2026-07-04)

**Status:** Attestation recorded; 50 AMS cases now count toward the eval gate. Branch `step-6-case-eval-gate`. npm test 20/20, `verify:rehash --integrity` 0 drift, `eval:cases` PASS (attested 101, 0 unreviewed).

### Change
- **Operator KL provided written in-session attestation** having clinically reviewed all 50 AMS answer keys. Recorded as `bulk_clinician_attestation` in each of the 50 `case_manifest.json` `review` blocks: `clinician_reviewed:true`, `review_status:"clinician_reviewed"`, `source_type:"llm_generated_reviewed"`, `reviewer_id:"KL"`, `attested_utc`, `recorded_by:"claude-opus-4-8 (agent, on clinician's explicit written confirmation in-session)"`, `scope:"AMS batch ingested 2026-07-03 (n=50)"` — mirroring the original 51-case batch attestation. Verbatim statement recorded: *"Clinician confirmed in writing having clinically reviewed all 50 AMS (Autoimmune Mild Severity) answer keys in this batch and attests them clinically correct."*
- **Edit scope: the manifest `review` block ONLY.** No node file (00–13) and no recorded `files[].sha256` was touched, so the eval gate's per-file integrity check remains valid. git diff = exactly 50 `case_manifest.json`.
- **`eval:cases` re-run: attested conforming 51 → 101 (≥45); unreviewed 50 → 0**; all 50 attestation warnings cleared; distribution unchanged 45/55/0 (computed over all envelopes). Remaining warnings (non-blocking): complex tier 0% and diagnosis-category coverage 2 of 3.

### Register impact
- `case-set-underpopulated` / **R-23**: attestation DONE; remaining input-gated work narrows to **complex-tier (05–07) cases (none exist yet) + a 3rd diagnosis_category**.

### Verification
`npm test` 20/20; `npm run eval:cases` PASS (attested 101); `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M6 (cont.) — atypical top-up ingested (50 AMS cases; distribution 88/12/0 → 45/55/0) (2026-07-03)

**Status:** Atypical top-up ingested from operator-supplied source; complex tier + attestation remain input-gated. Branch `step-6-case-eval-gate`. npm test 20/20, verification pass, stubs 9/9, `verify:rehash --integrity` 0 drift, `eval:cases` PASS.

### Change
- **50 new AMS (Autoimmune Mild Severity) casebundles ingested** via `cases:ingest` from operator-supplied source `…/PATIENT INFORMATION/…/Autoimmune Mild Severity/… /AMS Ingest Cases`: 1 tier-02 (atypical_presentation) + 37 tier-03 (red_herring_laden) + 12 tier-04 (atypical_presentation_high_risk); new specialties RHEUM + HAEMAT. All 50 NEW (0 collisions), firewall + schema clean (dry-run OK_DRY_RUN 50/50). 400 files written (50 × 7 nodes + manifest).
- **227 new candidate codes receipted** via `cases:verify-codes` (→ mock_verified_pending_live_ncts); total receipted across the store now **336** (109 + 227); idempotent for the prior 109.
- **`eval:cases` re-run: PASS** — attested conforming 51 (≥45); distribution **88/12/0 → 45/55/0**; difficulty-tier coverage **2 → 4 tiers** (3-tier minimum cleared); specialties 17 → 19. The 50 are `llm_generated_unreviewed` / `pending_clinician_review`: they shift the reported distribution but are **excluded from the attested count** by design (50 attestation warnings, non-blocking).

### Safety / privacy
- **Scoring-store firewall intact.** Only bundles were ingested; the ingest tool split/hashed/firewall-scanned all 7 nodes per case (its job). No agent reasoning read sealed `10–13` content — recon was metadata-only (difficulty/category/id/review/code-counts). Post-ingest grep confirms no runtime JS in verification/integration/mcp/portal references sealed nodes.
- **Source SOAP `.txt` never entered the repo.** The source notes live under `PATIENT INFORMATION`; the "AMS Ingest Cases" subfolder holds only the de-identified `.casebundle.json` outputs. Hash-only source discipline preserved (manifests carry `source.sha256`, not content). No `.txt` read into context.
- **No `--force`, no overwrite.** All 50 new; the prior 51 manifests (and their M6 receipts) untouched.

### Register impact
- `case-set-underpopulated` / **R-23**: atypical top-up ingested; distribution + tier coverage advanced; **REMAINING (input-gated): clinician attestation of the 50, ~8 COMPLEX cases (tiers 05–07, none exist yet), a 3rd diagnosis_category.** Index + gap-register updated.

### Verification
`npm test` 20/20; `npm run verification` pass; `trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift; `eval:cases` PASS (warnings as designed).

---

## ARCH_PLAN Milestone M6 — case-set terminology batch-verify + CI-blocking eval gate (2026-07-03)

**Status:** Receipts + gate complete; difficulty top-up surfaced as INPUT-GATED. Branch `step-6-case-eval-gate`. npm test 20/20, `npm run verification` pass, trunk stubs 9/9, `eval:cases` PASS, `cases:verify-codes` idempotent (re-run: 109 already done).

### Change
- `scripts/verify-case-codes.mjs` + `npm run cases:verify-codes` (new): batch-verifies every codes_manifest entry against the terminology MCP server (terminology_lookup, query.kind="code"; one server spawn for the whole run). **All 109 candidate codes across the 51 manifest-bearing cases receipted**; per-code receipt (request_id/timestamp_utc/upstream/mode/validated_code/system_version) written into the entry; status flipped `unverified_pending_terminology_receipt` → **`mock_verified_pending_live_ncts`** — deliberately honest: the mock server echoes codes (binding, not clinical validation); live NCTS batch-REvalidation happens at M11 (FMEA F5), and receipt `mode:"mock"` means the M1 mode-normaliser blocks these as proof in any live-enforced context. Fail-safe: a lookup that does not echo the exact code leaves the entry unverified and exits non-zero.
- `scripts/eval-case-gate.mjs` + `npm run eval:cases` (new) + `.github/workflows/ci.yml` step **"Case-set evaluation gate (blocking)"**: the deterministic release gate over the eval set. BLOCKS on: <45 attested conforming cases; any manifest-listed file whose on-disk sha256 differs (integrity transitively re-asserts ingest-time schema validity + the firewall leak verdict **without ever parsing a sealed node** — sealed files are only streamed through sha256, exactly as ingest does); a 00/01/02 file failing its schema; any code left unreceipted; unattested cases counting toward the minimum. WARNS (non-blocking until top-up): distribution vs 60/30/10 and the 3-tier/3-category/5-specialty coverage minimum. **Current: PASS — 51 attested ≥ 45; distribution 45/6/0 (88/12/0); coverage 2 tiers · 2 diagnosis categories · 17 specialties.**
- Named exception, register-tracked: `SPEC-CARD-04-00001` (hand-built reference case, pre-ingest) has no case_manifest — skipped by name in verify-codes, excluded from the attested count in the gate; **NEW register item `reference-case-manifest-missing`** (Low) with a retrofit build_action.

### Difficulty top-up — surfaced as INPUT-GATED (not silently skipped)
The M6 authoring component ("author atypical/complex cases toward 60/30/10") cannot be completed by this agent alone: the eval gate counts **only clinician-attested** cases, so machine-generated `llm_generated_unreviewed` bundles cannot move the attested distribution by design. Reaching 60/30/10 while keeping the 45 straightforward cases needs ≈17 atypical (tiers 02/03/04) + ≈8 complex (05/06/07) **attested** cases — i.e. clinical source material (SOAP notes) for the kit pipeline and/or clinician attestation, which only the operator can supply. Register updated accordingly; the gate's distribution warning flips to blocking once the mix reaches design.

### Register impact
- `case-set-underpopulated` / **R-23**: receipts + CI gate → done; distribution top-up → input-gated (evidence updated with the true envelope-derived distribution).
- **NEW** `reference-case-manifest-missing` (Low, pf:false).
- Firewall unchanged: the new scripts parse only case_manifest + 00/01/02; sealed nodes are hashed (streamed), never parsed — same boundary as `cases:ingest`.

### Verification
`npm test` 20/20; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `npm run eval:cases` PASS (warnings as designed); `cases:verify-codes --dry-run` re-run shows 109 already done (idempotent); changed tracked files = exactly the 51 case manifests + package.json + ci.yml + registers.

---

## ARCH_PLAN Milestone M5 — Clinician Verification Portal release gate (HITL checkpoint contract built) (2026-07-03)

**Status:** Complete (gate + contract; portal UI/workflow out of engineering scope). Branch `step-5-portal-gate`. npm test 20/20 (new suite added; 3 consecutive full-suite greens), `npm run verification` pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change
- `mcp/schemas/verification-portal-decision.schema.json` (new — the one plan-sanctioned schema addition, C9/§3.5.5): **VerificationGateRecord** `{ run_id, candidate_output_hash, clinician_id, decision: approved|rejected|amended, decided_at_utc, signature_ref, amended_output_hash?(required when amended), notes? }`, additionalProperties:false. An amendment is a NEW medicolegal artifact with its own hash; the original candidate_output_hash remains the record of what was generated.
- `portal/verification-gate.js` (new): zod mirror (lockstep-tested against the JSON schema via ajv-2020) + the mechanical checkpoint. `recordGateDecision()` validates and APPENDS (records never mutate; latest decision is effective — re-review supported). `releaseToPatient({candidate_output_hash, output})` is **fail-closed**: refuses in mock/dry_run (mode-normaliser guard — dev contexts have no patients), refuses without a gate record, refuses `rejected`, and releases ONLY text that **re-hashes** to the attested hash (approved→candidate; amended→amended_output_hash) — the gate computes the hash itself, never trusts one it is handed. Refusals return named reasons (a patient path escalates to a clinician, never retries around the gate).
- `portal/README.md` (new): scope (gate only, no UI), the adoption rule — **every future patient-facing path MUST call releaseToPatient()**; a path that does not is a Critical defect (F13) — and what remains before "portal built".
- `test/contract-verification-gate.js` (new, wired into `npm test` → CI): zod↔JSON-schema lockstep (accept + reject fixtures), patient path closed without a record, exact-hash binding (altered text refused), rejected never releases, amended releases only the amended text, latest-decision-wins, mock/dry_run never release, malformed requests fail closed, contract violations throw at record time.
- `package.json`: suite appended to the `test` chain (CI gate). `.claude/schema-index.md` updated (new schema row) in the same step per <context_loading>.
- messaging-geo remains **UNWIRED** (M13, post-Portal-complete) per the M5 directive.

### Invariants
Human-in-the-loop is now mechanically enforceable at the release boundary (was policy-only). Hash discipline strengthened: release binds to recomputed SHA-256 of the exact bytes. Nothing patient-facing opened — the gate existing closes paths, it does not open them; the other release blockers stand.

### Register impact
- `clinician-verification-portal-unbuilt` (Critical, pf:true) → **PARTIAL** (gate contract built; clinician UI/workflow, authenticated identity/signature capture, and WORM gate-record storage (M8) remain); gap-register §1b portal row updated; index re-synced; schema-index gained the 13th pipeline contract. FMEA F13 residual 4×5 → 1×5 per plan.
- Flake note (honest record): one unreproducible mid-chain `npm test` abort was observed once during the M5 gate run (suite stopped after 6 with no error captured by the grep filter); four consecutive full-suite runs pass 20/20 — if it recurs, investigate contract-pipeline spawn timing first.

### Verification
`npm test` (20 suites) green ×3 consecutive; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M4 — session-bound persistence enforced (release blocker cleared at the enforcement layer) (2026-07-03)

**Status:** Complete. Branch `step-4-session-store`. npm test 19/19 (new suite added), `npm run verification` pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change
- `verification/session-store.js` (new): technical enforcement of "no persistence beyond session" (<data_handling>) and Trust Boundary 4. **Memory-only** — no disk path, no serialisation API (contract test asserts no persistence-shaped export and an untouched data dir). **Encounter-scoped lifetime** — `openEncounter` → working state → `closeEncounter` destroys everything; closed refs never reopen (no zombie sessions); reads/writes after close throw; writing to a never-opened encounter throws (no implicit/untracked state). **Mechanical demographic guard** — demographic-looking keys anywhere in a nested value (name/dob/address/medicare/ihi/phone/email/…) and IHI-shaped values (16 digits, 800360-prefixed) are REFUSED with a thrown error; conservative over-blocking by design. Medicolegal ledger explicitly documented as exempt (append-only, PHI-free by `.strict()` — it must survive the encounter).
- **Adoption contract** (documented in-module + register): any future stateful session path (portal flows, patient conversations, cross-trunk working memory) MUST hold its working state in this store; holding it anywhere else reintroduces the gap. No production session flow exists today (trunk runs are stateless) — the store is the gate artifact.
- `test/contract-session-store.js` (new, wired into `npm test` → CI): round-trip while open; close destroys (count-verified); no resurrection; no implicit creation; encounter isolation; demographic guard refusals (top-level, nested, array-buried, IHI-in-string) + legitimate clinical state passes; no persistence surface; filesystem untouched; destroy-all sweep.
- `package.json`: suite appended to the `test` chain (CI gate).

### Release blockers (restated per the M4 directive)
1. **Pharmacology vendor live + validated** — open (M9, input-gated on contract/credentials).
2. **Clinician Verification Portal** — open (M5, next engineering step).
3. **Deterministic investigation parser** — built mock/dev; range sign-off + live source open (M10, input-gated).
4. **Session-bound persistence** — **enforcement CLEARED this step** (adoption re-checked per future session flow; real-patient content persistence additionally consent-gated).
No patient path opens until all four are green; nothing in this step is patient-facing.

### Register impact
- `session-persistence-unenforced` (Critical, pf:true) → **COMPLETE / resolved (enforcement)**; gap-register **R-10 → "Enforcement built 2026-07-03 (M4)"**; index re-synced. FMEA F12 residual 3×5 → 1×5 per plan.
- `content-store-production-gated` unchanged (real-patient content persistence still consent-gated by design).

### Verification
`npm test` (19 suites) green; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift.

---

## ARCH_PLAN Milestone M3 — live context-injection allow-list (scoring-store firewall at the packet boundary) (2026-07-03)

**Status:** Complete. Branch `step-3-context-allowlist`. npm test 18/18 (new suite added), `npm run verification` pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift, scoring-store firewall re-checked — NOT breached.

### Change
- `verification/context-allowlist.js` (new): DEFAULT-DENY mirror of the `cases:ingest` field-scoped firewall at the packet boundary (§3.5.5 `contextAllowList(caseFields) → { injectable_fields, rejected_fields }`). `01` allows only `demographics` / `opening_complaint` / `history_as_reported` (channel **packet**, category-mapped to the Fact enum); `02` allows only `disclosure_items[].{clinical_fact,patient_response_template,patient_deflection_template}`, `patient_initiated_exchanges[].patient_text`, `deflection_behaviours[].deflection_text_template` — classified channel **exchange** (simulator dialogue material) and **never converted to packet facts**. All of `00`, `psychosocial_profile`, `digital_tablet_field_map`, unknown nodes/fields, and `02` scoring/gate sub-fields reject. **A sealed scoring node (`10_`–`13_`) anywhere in the input THROWS** ("SCORING-STORE FIREWALL") and halts packet assembly — a breach attempt never degrades to a dropped field.
- `verification/pipeline.js`: `contextInjection()` enforces the allow-list on the new `case_content` path; `runPipeline({ case_content })` threads it. No case content supplied → behaviour unchanged (regression-tested).
- **Quarantine (surfaced, not silently resolved):** `objective_data_offered` is ingest-allow-listed, but CLAUDE.md `<data_handling>` requires the patient-reported-vitals sanitiser policy be confirmed **before** this path ships it. The field rejects with a reason naming the policy; tracked as new register item `objective-data-offered-sanitiser-policy` (Medium, pf:true, input-gated on operator/clinical confirmation). Flip is one line + a test once confirmed.
- `test/contract-context-allowlist.js` (new, wired into `npm test` → CI): default-deny sweep (no SIM-ONLY/SCORER-ONLY marker injectable), all four sealed nodes throw (dummy keys, synthetic fixtures — **no case file read**), exchange material never becomes facts, quarantine reason asserted, end-to-end through the ContextPacket zod gate, pipeline halts on sealed content, no-case-content regression.
- `package.json`: suite appended to the `test` chain (CI gate).

### Invariants
Scoring-store firewall strengthened from ingest-only to ingest + live packet boundary; sealed content is now a hard stop on the live path. Raw-lab invariant untouched (parser path unchanged; the one adjacent open question is quarantined, not shipped). Spine, hashing, verifier checks untouched. Nothing patient-facing.

### Register impact
- `context-injection-allowlist` → **COMPLETE / resolved**; gap-register **R-26 → Resolved 2026-07-03 (M3)**; index + firewall-status paragraph re-synced.
- **NEW** `objective-data-offered-sanitiser-policy` (Medium, pf:true, input-gated) — the charter's open follow-up is now register-tracked with the decision options stated (pass as-is / band via parser / keep withheld).
- FMEA F9 mitigation in place (residual 2×5 → 1×5 per plan).

### Verification
`npm test` (18 suites) green; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `verify:rehash --integrity` 0 drift; sealed-node reference grep = known engineering set only.

---

## ARCH_PLAN Milestone M2 — cross-trunk sequencer (DEAD_END-1 fix; HARD_FAIL propagates across trunks) (2026-07-03)

**Status:** Complete. Branch `step-2-trunk-sequencer`. npm test 17/17 (new suite added), `npm run verification` pass, trunk stubs 9/9, `verify:rehash --integrity` 0 drift.

### Change
- `integration/trunk-sequencer.js` (new): the missing outer loop. Consumes the PARSED Trunk 1.0 `routing_plan.next_trunks` (zod-gated — a malformed plan throws and never part-runs; unknown trunk ids rejected) and walks each routed trunk through the full five-step pipeline via `runTrunkWithGrounding` (no step bypassed). **Halts unconditionally, no override path**, on: Trunk 1.0 `safety_gate` escalate_now/T5 (before any routed trunk — routing never outruns the safety gate); `continuation_blocked` from any trunk (a pharmacology HARD_FAIL or BLOCKED_NO_PROOF now blocks the WHOLE sequence — FMEA F2 closed); escalate_now/T5 signalled in any trunk output (conservative over-halt: over-triage-safe); and verification `pass=false` (a rejected output is never upstream context for the next trunk). Emits the ordered execution record of ARCH_PLAN §3.5.5 (`executed[]`, `halted_at?`, `halt_reason?`), zod-validated.
- Feature flag `HEYDOC_SEQUENCER` (**default OFF** = rollback): when off, `runTrunkSequence` runs nothing and returns a disabled record — the single-trunk status quo.
- `integration/trunk-pipeline.js`: re-exports `runTrunkSequence`/`isSequencerEnabled` as the one integration surface; header documents that manual multi-trunk chaining must honour `continuation_blocked` until the flag is on.
- `test/contract-sequencer.js` (new, wired into `npm test` → CI): default-off runs nothing; `next_trunks` consumed in order; HARD_FAIL halts (later trunks never run, blocking entry recorded); BLOCKED_NO_PROOF halts; Trunk 1.0 escalate gate halts before anything runs; mid-sequence escalate_now and structured T5 short-circuit; verification failure halts; malformed plan throws; empty plan is a valid no-op; re-export identity.
- `package.json`: suite appended to the `test` chain (CI gate).

### Invariants
No-HARD_FAIL-override now holds **across the sequence**, not only within one trunk. Five-step spine untouched (the sequencer adds the outer loop only). Hashing, verifier checks, sanitiser untouched. Escalation detection over-halts on ambiguity (under-triage outranks over-triage). Nothing patient-facing; flag off by default.

### Register impact
- `routing-plan-next-trunks-dead-end` (DEAD_END-1) → **COMPLETE / resolved**; gap-register **R-24 → Resolved 2026-07-03 (M2)**; index re-synced. FMEA F2/F8/F10 mitigations in place (F2 residual 4×5→2×5 per plan).
- Residual (by design, documented): sequencer engages only with `HEYDOC_SEQUENCER` on; callers chaining trunks manually must honour `continuation_blocked` themselves.

### Verification
`npm test` (17 suites) green; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `npm run verify:rehash -- --integrity` 0 drift.

---

## ARCH_PLAN Milestone M1 — mode-normaliser (C16/F4 mode-flag leakage closed) (2026-07-03)

**Status:** Complete. Branch `step-1-mode-normaliser`. npm test 16/16 (new suite added), `npm run verification` pass, trunk stubs 9/9, `verify:rehash --integrity` 349/349 zero drift.

### Change
- `verification/mode.js` (new): the single mapping between the env vocabulary (`HEYDOC_MODE_DEFAULT`: mock/staging/production/dry_run) and the receipt/packet/ledger enforcement enum (mock/dry_run/live). `staging`/`production` → `live` (mock proof **blocked**); `mock`/`dry_run` stay dev (mock proof flagged, not blocked); **unrecognised mode → default-deny to `live`**; absence keeps the documented dev default (mock).
- `verification/verifier.js`: `enforceLive` now derives via `normaliseMode(evidence.context_mode).enforce_live` instead of `=== "live"` (the F4 hole). Monotone-stricter only; the five checks untouched; hash-first untouched.
- `verification/pipeline.js`: `context_mode` derived via the normaliser — always enum-valid for the ContextPacket/verifier/ledger contracts (a raw `staging` string previously crashed packet validation).
- `verification/audit-store.js` `recordRun`: **second F4 site found during M1 research and closed in the same step** — `synthetic = mode !== "live"` on the raw env meant a `staging` run would have persisted output content as synthetic AND handed the ledger an enum-invalid mode. Now normalised: staging/production runs are non-synthetic (content NOT persisted, `content_persisted=false`).
- `test/contract-mode-normaliser.js` (new, wired into `npm test` → CI): mapping table, case/trim tolerance, absence default, default-deny; verifier blocks mock proof in staging/production/live/unknown and flags-not-blocks in mock/dry_run; live receipt still grounds in staging; pipeline end-to-end (packet mode enum-valid, mock-grounded code blocked in staging, binds in mock); ledger classification (staging → mode "live", no content persisted; mock → synthetic persisted). Throwaway `HEYDOC_DATA_DIR`.
- `package.json`: new suite appended to the `test` chain (CI gate).

### Invariants
No check weakened; enforcement strictly strengthened (old: only `"live"` blocked; new: staging/production/unknown also block; mock/dry_run behaviour unchanged; absent context_mode unchanged). Hashing, HARD_FAIL handling, sanitiser, and the five-step spine untouched. Nothing patient-facing.

### Register impact
- `mode-leakage-enforcelive` → **COMPLETE / resolved** (completeness-register + index); gap-register **R-25 → Resolved 2026-07-03 (M1)**; `.claude/server-status.md` C16 caveat replaced with the resolved semantics.
- Residual tracked, not a defect: MCP servers stamp `receipt.mode` from their own env read and only ever run mock today — server-side stamping is normalised at live-connect (M9/M11, noted in R-25 + register evidence).

### Verification
`npm test` (16 suites) green; `npm run verification` pass; `npm run trunk:stub:all` 9/9; `npm run verify:rehash -- --integrity` 349 content checked, 0 drift.

---

## ARCH_PLAN Milestone M0 — reconciliation & re-scan (docs only) (2026-07-03)

**Status:** Complete. No code, no new tests. Baseline + post-change `npm test` both 15/15 green (identical).

**Operator override (recorded):** *Model routing amended by operator 2026-07-02 — Fable 5 for reasoning/hard-logic steps, Opus 4.8 for scaffolding; supersedes charter Opus-plan/Sonnet-execute split.* Applied to the `.planning/ARCH_PLAN.md` header.

### Blueprint
- `.planning/ARCH_PLAN.md` **created in-repo** (operator-approved copy of the Desktop blueprint), v1.0.0 → v1.0.1: (a) FMEA §3.6 Owner column renumbered to §3.7 milestones (F2/F8/F10→M2, F3→M8, F5/F6→M11, F7→M10, F9→M3, F11→M7, F12→M4, F13→M5, F14→M9, F15→M0; F1 annotated *unscheduled — verifier fuzz hardening, propose alongside M6*); (b) model-split header line per the operator override above.

### Register moves (completeness-register ↔ gap-register, one-way promotion)
- **C18/F15 closed** — `case-set-underpopulated`: row said 1 case; live count is **52 directories** in `data/cases/` (47 difficulty-01 / 5 difficulty-04 incl. reference; 51 clinician-attested, bulk attestation KL 2026-07-02). ≥45 minimum MET; distribution skew + terminology receipts remain (→ M6). Dangling `gap_register_link: gap-case-set` fixed → mirrored as **R-23** (Medium).
- **C17 closed** — gap-register §1b prose reconciled to built reality: `deterministic-investigation-parser` (built, `verification/investigation-parser.js`, provisional ranges), `pharmacological-firewall` (mock core + Trunk 8.0 wired, contract-tested, live vendor pending), `medicolegal-audit-ledger` (built, `verification/audit-store.js`, prod WORM pending). C15 `severity=warning` wording deliberately **untouched** (M7, operator-gated).
- **NEW `routing-plan-next-trunks-dead-end`** (DEAD_END-1, High, pf:true) → promoted **R-24**. Verified: zero JS references to `next_trunks`/`routing_plan`; fix = M2 sequencer; do not build on this edge.
- **NEW `mode-leakage-enforcelive`** (C16/F4, High, pf:true) → promoted **R-25**. Verified: `enforceLive = contextMode === "live"` (exact string); staging/production would accept mock receipts; fix = M1 mode-normaliser. Caveat added to `.claude/server-status.md`.
- **`context-injection-allowlist` recorded in-register** (was index/HANDOFF-only despite the register being the index's source of truth) → promoted **R-26** (High, pf:true); fix = M3.
- **NEW `case-dir-duplicate-files`** (Medium) — 236 untracked `* 2.json` Finder duplicates across 30 case dirs, incl. sealed-node name duplicates (inventoried by filename only, never opened); delete under a gated cleanup step.
- **NEW `repo-digest-sealed-node-carveout`** (Low) — digest deliberately embeds the reference case's sealed 10–13 for engineering; must never enter an AI-Doctor context path; M3 allow-list test to carry a digest-shaped default-deny fixture.
- Milestone links added: `pipeline-routing-retrieval-stub` → C10, input-gated at live-connect under M11 (stale `pending-promotion` tag corrected — Medium, below threshold); `content-store-production-gated` → gated on C8/M4 + consent.
- Promotion section updated: 2026-06-30 pending list marked done (R-16–R-19); M0 promotions listed.
- Firewall re-check (M0): four scripts/tests read `data/cases`; **none routes 10–13 content into any trunk/packet path — NOT breached.** Index firewall paragraph updated.

### Derived docs (same step, per <context_loading>)
- `.claude/completeness-index.md` re-synced (case count, three new High rows, Medium + Low rows, firewall paragraph).
- `.claude/server-status.md` — C16 mode-enforcement caveat section added.

### Sequencing impact
None found that alters M1–M5 order: DEAD_END-1 exposure is contained (no multi-trunk caller exists; HARD_FAIL is terminal within a single `runTrunkWithGrounding` run, contract-tested), so M1 (mode) before M2 (sequencer) remains safe.

---

## `cases:ingest` — bundle → data/cases with field-scoped firewall (2026-07-01)

**Status:** Complete (tool). Branch `feat/cases-ingest`. Plan-gated build (approved). New dependency `ajv` (approved).

### Change
Adds the deterministic ingestion tool that admits `*.casebundle.json` files into `data/cases/`.

- `scripts/ingest-case-bundles.mjs` + `npm run cases:ingest`: per bundle → ajv-validate all 7 nodes (schemas are draft 2020-12) → `case_id` consistency → **field-scoped firewall check** → honesty gate (bundle hashes null, codes unverified) → split into `data/cases/<CASE_ID>/` → compute real **SHA-256** per file (fill manifest nulls) + `source.sha256` (if the `.txt` is alongside) + `ingest.bundle_sha256` → carry the clinician attestation through. Refuses (exit 1, writes nothing) on any gate failure; `--dry-run`, `--out`, `--force`.
- `test/contract-case-ingest.js` (wired into `npm test`, now 15 suites): round-trips the reference case (8 files + real SHA-256), and asserts a diagnosis-name leak into `01` and a `case_id` mismatch are both refused.

### Firewall allow-list (the finding, now enforced in code)
The firewall is **finer than file-level**. Only sub-fields injected into the AI-Doctor/patient-simulator exchange are scanned: all of `01` **except** `psychosocial_profile` + `digital_tablet_field_map` (simulator-direction/mapping metadata), and in `02` only `disclosure_items[].{clinical_fact,patient_response_template,patient_deflection_template}`, `patient_initiated_exchanges[].patient_text`, `deflection_behaviours[].deflection_text_template`. `00` and `02` scoring fields are metadata and legitimately reference the diagnosis. Leak = the **full** `primary_diagnosis.name` (not generic SNOMED-display words) or a source `.txt` filename appearing in injectable text. Validated: 51/51 real bundles pass with 0 true leaks.

### Reference-case fix
`data/cases/SPEC-CARD-04-00001/11_symptom_links_node.json` had 3 × `unlocks_symptom_id: null` — a pre-existing non-conformance (predates the schema hardening; schema forbids null). Removed (omit = "unlocks nothing"). Gold standard is now schema-clean.

### Register impact
- **NEW `context-injection-allowlist`** (High): the sub-field firewall is enforced at ingest, but the *live* context-injection layer (unbuilt) must apply the same allow-list before injecting `00/01/02` into a trunk. Registered.
- `case-set-underpopulated`: intake path now built (tool). Actual population (ingest the 51) is the next step.
- Firewall status: JS now **writes** `data/cases` (ingest) — it does not route sealed `10–13` content into a trunk; re-affirmed.

### Verification
`npm test` 15/15; `npm run cases:ingest -- "<folder>" --dry-run` → 51/51 OK, 0 leaks.

---

## Case transformation — bundled "kit" (single-file package) (2026-07-01)

**Status:** Complete. New derived artifact + build script.

### Change
Adds a **single self-contained package** so a Claude Chat / Cowork session can run the SOAP→case-set transformation from **one attachment** instead of 16 (protocol + omnibus + 7 schemas + 7 reference-case files).

- `scripts/build-case-transformation-kit.mjs` (new): assembles the kit from the repo's source files (Node ESM, no new dependency). Records a sha256 per embedded source in `_kit.contents` for version traceability, and parses the protocol version from the `.md` header.
- `docs/case-authoring/breath-ezy-case-transformation-kit.json` (new, generated, ~497 KB): `{_kit, protocol_markdown, digital_tablet_omnibus, node_schemas (7), reference_case (7)}`. `_kit.runner_prompt` is the Cowork sequential-ledger prompt adapted to read from the embedded kit; `_kit.how_to_use` covers Chat and Cowork.
- `package.json`: `npm run kit:build` to regenerate.

### Staleness note
The kit is **derived** — repo files are the source of truth. Re-run `npm run kit:build` after any change to the protocol, schemas, omnibus, or reference case. (Currently pinned to protocol `v1.2.0`.)

### Verification
Kit parses; 16 embedded sources (protocol + omnibus + 7 schemas + 7 reference files); protocol markdown includes §7.9; `npm test` unaffected.

### Register impact
None (docs/tooling). Supports the `case-set-underpopulated` intake path.

---

## Case transformation protocol — hardening from first real-case validation (2026-07-01)

**Status:** Complete. Docs-only. Protocol bumped to `case-transform-protocol:v1.2.0`. Triggered by hand-validating the first Chat-produced bundle (`AUC-021` cardiac arrest), which was clinically excellent but had **103 schema-conformance errors** + one firewall leak.

### Root causes fixed
- **Protocol defects (led Chat into invalid output):** skeletons used `null` for unknown optionals (schemas forbid null → omit); invented `source_note_reference` in `00` (both an invalid field **and** a firewall leak — the source filename contains the diagnosis); abbreviated `symptom_narrative` key names; §7 gave prose, not exact contracts.
- **Chat drift the protocol should have prevented:** `differentials`→`differential`, `snomed_ref` string→object, non-enum values, prose where tier-enums/objects required, added fields (`channel`/`reporter`/`bystander_state`), arrays where single strings required.

### Changes to `docs/case-authoring/case-transformation-protocol.md`
- **New §7.0 Hard conformance rules:** `additionalProperties:false` (no invented fields); `null` forbidden → omit; objects/arrays never rendered as strings; enums verbatim; reference-case key names exact; self-validate before emitting.
- **New §9.1 Case-ID mapping:** assign canonical `SPEC-{SPECIALTY}-{DD}-{SEQ}` (DD = difficulty-tier ordinal 01–07); source ID → `case_manifest.source.original_case_id`; provisional SEQ flagged for maintainer. Decoded from the schema's own documented convention (`AUC-021` → `SPEC-CARD-01-00021`).
- Fixed §7.1 (removed `source_note_reference` + null review fields), §7.2 (exact `symptom_narrative` keys, object shapes), §7.3–§7.7 (exact object/enum/single-string shapes for every field Chat got wrong), §7.8 (`original_case_id`), §12/§13 (no-null flagging, conformance + case-id checklist items).
- **§1 now mandates attaching the 7 node schema files + reference case** to the Chat session — the schema is the authoritative contract.

### Verification
All fenced JSON skeletons parse; version bumped consistently (3 spots); `differentials`/`null` references are all corrective. Case-ID convention verified against the schema's `case_id` pattern + description and the reference case (`SPEC-CARD-04` ↔ difficulty ordinal 4).

### Register impact
None (docs). User decision recorded: **map to canonical SPEC IDs** (schemas unchanged) rather than relax the pattern.

---

## Case transformation protocol — Bundle Output Mode (2026-07-01)

**Status:** Complete. Docs-only. Protocol bumped to `case-transform-protocol:v1.1.0`.

### Change
Adds **Bundle Output Mode** (§7.9) to `docs/case-authoring/case-transformation-protocol.md`: each case is emitted as **one `<CASE_ID>.casebundle.json`** — a single JSON envelope whose top-level keys are the 8 files, plus a `_bundle` header (`format`, `split_map`, `firewall_assertion`) telling repo ingestion how to split it. Now the default output (separate-block output still valid).
- One `JSON.parse` + write-each-key split (no fragile banner-regex); every sub-object is canonical JSON ready to hash + zod-validate.
- Firewall preserved: the bundle is an authoring/transport artifact, split *before* the pipeline; the AI Doctor never sees a bundle. Recommend gitignoring `*.casebundle.json`.
- Hashes stay `null`, codes stay `unverified` — unchanged from §7.8.
- Cross-refs updated (§1, §10, §11, §13); the planned `cases:ingest` tool now splits the bundle first.

### Verification
Bundle example parses as valid JSON (9 top keys: `_bundle` + 8); no lingering "8 blocks" references; `npm test` unaffected (docs-only).

### Register impact
None (docs). Supports the `case-set-underpopulated` intake path.

---

## Presentation-layer patient-obtainable objective data (2026-07-01)

**Status:** Complete. Branch `feat/presentation-objective-data`. Plan-gated schema change (approved).

### Change
Amends the telehealth reprojection rule so **patient-obtainable objective data may enter the AI-Doctor-readable presentation layer** — bounded and provenance-tagged. Clinician-only findings stay sealed.

- `data/schemas/01_presentation_layer.schema.json` (new optional `objective_data_offered[]`): home/wearable device readings, self-reported measurements, video-visible findings. Each item `{type, value (string+units), source (enum: patient_home_device|patient_wearable|patient_reported|video_observable|caregiver_reported), verified (default false), device_validated?, timing?, fhir_path?, reliability_caveat?}`. Top-level `additionalProperties:false` preserved; item objects closed. Enum **excludes** any clinician-measured source.
- `docs/case-authoring/case-transformation-protocol.md`: §6 rewritten (patient-obtainable → `01` tagged; clinician-only → sealed `10`/`11`), §4 routing rows split, §7.2 contract + example, §13 checklist.
- `CLAUDE.md <data_handling>`: added the telehealth carve-out note.

### Invariant posture
No hard limit weakened. `verified` = established encounter input, not gold-standard; clinician exam/labs/ECG remain sealed + receipt-gated; values stored as patient-stated strings (no structured raw-number bypass of the sanitiser). **Open follow-up flagged in CLAUDE.md:** confirm sanitiser policy for patient-reported vitals if the live pipeline injects `objective_data_offered` into trunk context.

### Verification
JSON Schema valid; reference case `SPEC-CARD-04-00001/01` still conforms; positive `objective_data_offered` example validates; unknown item field, missing `source`, and `clinician_measured` source all correctly rejected. `npm test` unaffected (case schemas not yet zod-wired in code).

### Register impact
No new `UNBUILT`/`DEAD_END`/`BLIND_STUB`. Refines the `01` contract in support of `case-set-underpopulated`.

---

## Doc reconciliation: charter + derived docs vs register (2026-07-01)

**Status:** Docs only — no code, schema, or contract touched; all three CI suites remain green (13/13 tests, verification pass, 9/9 trunk stubs). Closes two `Low`/`STALE` Completeness Register items. Operator-approved the CLAUDE.md edit before execution.

### Why
The registers and most derived docs were rebuilt 2026-06-30 and already reflected reality (all 7 servers mock-built, `PARTIAL`), but three prose artifacts lagged: CLAUDE.md still described the four mock-built servers as "specified, not built," and `.claude/server-status.md` contradicted itself on whether the pharmacology firewall was wired behind Trunk 8.0 (it is — R-22, `contract-firewall.js` passes).

### Changes
- `CLAUDE.md`: `<project_context>` repo map (line 33) now lists all seven servers as mock-built/`PARTIAL`; the no-build-step note (line 30) corrected (plain `.js`, not `dist/`); `audit-ledger-entry` added to the schema list (line 32); `<gap_register_and_build_sequence>` status lines + build-order annotated to reflect mock-complete items and the real remaining work (live vendors/EHR, sign-off, Clinician Portal, persistence, terminology contract).
- `.claude/server-status.md`: pharmacology row corrected — "live vendor + firewall wiring pending / Not yet wired behind Trunk 8.0" → "mock core + Trunk 8.0 firewall wired; live vendor pending," with the receipt-backed HARD_FAIL + contract-test note.
- `.claude/schema-index.md`: verified against disk (12/12 `mcp/schemas` + 7/7 `data/schemas`) — accurate, no change needed.
- Register: `claudemd-behind-charter` and `derived-docs-unverified` → `status: resolved` (both `Low`); `.claude/completeness-index.md` synced.

### Register / gap-register impact
- Completeness Register: 2 `STALE` (Low) → `resolved`. No items opened. Gap-register: unchanged (neither item was ever promoted — both `Low`, `gap_register_link: none`).

---

## fhir-broker + messaging-geo (mock) + FHIR→parser path (2026-06-30)

**Status:** Mock complete. Branch `chore/import-and-remediate`. Advances `fhir-broker-unbuilt` + `messaging-geo-unbuilt` to PARTIAL — the last two servers now have mock implementations, so **all 7 MCP servers are built (mock)**.

### Changes
- `mcp/servers/fhir-broker/` (index.js + mock-resources.json): `fhir_read`/`fhir_search` return templated AU Core resources (incl. lab Observations with raw values); `fhir_write` SAFE_STUB. **FHIR→parser path:** on the MCP path, Trunk 6.0 Observations → `retrieveFhirObservations` → `raw_investigations` → the deterministic parser → sanitised `lab_result` facts (raw number never in the packet).
- `mcp/servers/messaging-geo/index.js`: `geo_locate`/`pharmacy_search` mock; `msg_send` SAFE_STUB that NEVER sends (recipient redacted/not echoed, flagged not-patient-facing). Not wired into the trunk pipeline (patient-facing, gated by the Clinician Verification Portal).
- `verification/{retrieval-mcp,pipeline}.js`: `retrieveFhirObservations`; `routing()` sets `needs_fhir_reads:["Observation"]` for Trunk 6.0; fhir labs merge into `raw_investigations`.
- `test/contract-fhir-broker.js` + `test/contract-messaging-geo.js` wired into `npm test` (13/13).
- `mcpServers.template.json` both paths `dist/index.js` → `index.js`; server-status / mcp-server-map / registers updated.

### Register movement
- `fhir-broker-unbuilt` → **PARTIAL** (mock read/search + Observation→parser; live EHR + AU Core/AUCDI conformance pending). `messaging-geo-unbuilt` → **PARTIAL** (mock; never-sends; live providers pending). `investigation-parser-unbuilt` now has a mock fhir lab source.

### Verification
- `npm test` 13/13; `trunk:stub:all` 9/9 stub + live MCP; Trunk 6.0 (MCP) → 2 sanitised HH lab facts from fhir, raw values absent from the packet.

---

## Knowledge server (mock) + curated datasets (2026-06-30)

**Status:** Mock complete. Branch `chore/import-and-remediate`. Mock-resolves `knowledge-datasets-empty` + gap-register **R-13**; advances `knowledge-server-unbuilt`; opens `knowledge-datasets-provisional` (High).

### Changes
- `mcp/servers/knowledge/data/{benign-registry,axis-b-templates,redflags-bank}.json` (new): versioned, checksummed, **DEV/SYNTHETIC-ONLY — not clinically authoritative** datasets for Trunks 7.0/5.0/9.0.
- `mcp/servers/knowledge/index.js` (new): McpServer; `kg_query`/`kg_provenance` real over the datasets; ContextGraph/PatientKnowledgeGraph return empty (no graph store — never fabricated); `kg_upsert`/`kg_export` SAFE_STUB (`unavailable`, no fake revision/artifact).
- `verification/pipeline.js`: `routing()` sets `needs_structured_kg` per trunk (7.0→benign-registry, 5.0→axis-b-templates, 9.0→redflags-bank); `retrievalStub` emits a mock `structured_dataset` receipt; `contextInjection` maps `structured_dataset` → EvidenceNode support (ref = dataset_version).
- `verification/retrieval-mcp.js`: `retrieveKnowledge()` (kg_query per dataset) on the MCP path.
- `test/contract-knowledge.js` (new) wired into `npm test` (11/11).
- `mcpServers.template.json` knowledge path `dist/index.js` → `index.js`; server-status / mcp-server-map / registers updated.

### Register movement
- `knowledge-datasets-empty` → **COMPLETE (dev)**; `knowledge-server-unbuilt` → **PARTIAL** (live PostgreSQL graph store pending); **opened** `knowledge-datasets-provisional` (High — clinical sign-off). R-13 mock-resolved. ContextGraph/PatientKnowledgeGraph now have a (mock, empty) producer.

### Verification
- `npm test` 11/11; `trunk:stub:all` 9/9 stub + live MCP; structured_dataset evidence reaches the packet (trunk 7.0 → benign-registry:v0.1.0-dev) and the packet validates.

---

## Trunk 8.0 pharmacology firewall — wired + HARD_FAIL enforced (2026-06-30)

**Status:** Complete (mock). Branch `chore/import-and-remediate`. Advances `pharmacology-server-unbuilt` / gap-register **R-22** — only the live vendor remains.

Turns the pharmacology mock core into an enforced firewall behind Trunk 8.0.

### Changes
- `mcp/servers/pharmacology/engine.js` (new): pure `runPharmCheck()` extracted from `index.js` (refactor — same logic), so the MCP server and the in-process firewall share one engine.
- `verification/pipeline.js`: when a Trunk 8.0 turn carries `pharm_intent`, runs the firewall in-process — `firewall_status` gates continuation; **HARD_FAIL → `continuation_blocked` with no override path** + `hard_stops` + receipt-backed `hard_stop_receipt`; the PharmCheck receipt flows into the packet + ledger. No-intent on Trunk 8.0 → BLOCKED_NO_PROOF + blocked. Grounding-pass kept separate (the honest BLOCKED_NO_PROOF stub stays green).
- `integration/trunk-pipeline.js`: accepts `{ pharmIntent, resolvedFacts }`; surfaces `firewall_status`/`continuation_blocked` and report `hard_stops`/`overall_severity`.
- `test/contract-firewall.js` (new) wired into `npm test` (10/10): HARD_FAIL blocks (no override) + receipt-backed check 5; an invented HARD_FAIL (no receipt) fails check 5; PASS doesn't block; no-intent → BLOCKED_NO_PROOF + blocked + grounding-passes.
- `architecture/trust-boundaries.md`, server-status, registers updated.

### Register movement
- `pharmacology-server-unbuilt`: remaining gap narrowed to **live vendor only** (firewall + HARD_FAIL enforcement done). Enforces no-autonomous-prescription + no-HARD_FAIL-override hard limits.

### Verification
- `npm test` 10/10; `trunk:stub:all` 9/9 (stub unaffected); HARD_FAIL blocks with no override, invented hard-stop rejected by check 5.

---

## Pharmacology server — deterministic mock core (2026-06-30)

**Status:** Mock core complete (not wired). Branch `chore/import-and-remediate`. Advances `pharmacology-server-unbuilt` (#1 gap) / gap-register **R-22**.

The highest-leverage Critical: the only permitted source of dose guidance and the Trunk 8.0 firewall.

### Changes
- `mcp/servers/pharmacology/mock-data.json` (new): versioned, **MOCK/SYNTHETIC-ONLY — not a clinical source**; allergy cross-reactivity groups, DDI pairs, renal rules, AU schedule map, mock dose guidance.
- `mcp/servers/pharmacology/schemas.js` (new): zod PharmIntent (lenient input) + PharmCheck (strict output) + validators.
- `mcp/servers/pharmacology/index.js` (new): McpServer (SDK ^1, stdio) with `pharm_check` + `pharm_intent`. Deterministic engine — allergy x-react, DDI, renal dosing, AU scheduling, S8 PDMP. Invariants: dose_guidance ONLY on PASS/WARN and NEVER on HARD_FAIL/BLOCKED/paediatric; HARD_FAIL terminal; paediatric (<18) → flag, no dose; absent facts → NOT_RUN → BLOCKED_NO_PROOF; every result mode=mock, MOCK vendor_reference.
- `test/contract-pharmacology.js` (new), wired into `npm test` (9/9): PASS+dose, BLOCKED_NO_PROOF, allergy HARD_FAIL no-dose, S8 HARD_FAIL, paediatric HARD_FAIL no-dose, receipt mode=mock.
- `mcpServers.template.json`: pharmacology path `dist/index.js` → `index.js` (no build step). `.claude/server-status.md` updated.

### Register movement
- `pharmacology-server-unbuilt`: Critical, UNBUILT → **PARTIAL / in-progress** (mock core; firewall wiring = next task, live vendor = standing gap).

### Next / not done
- Wire intent→PharmCheck→firewall_status behind Trunk 8.0 + verifier HARD_FAIL-blocks-continuation (next task). Live vendor (MIMS-AU/SafeScript) in staging before patient-facing. Mock data is not a clinical source.

### Verification
- `npm test` 9/9; engine smoke across all scenarios correct; dose never present on HARD_FAIL/BLOCKED/paediatric.

---

## Deterministic investigation parser (sanitiser) — built for mock/dev (2026-06-30)

**Status:** Complete (mock/dev). Branch `chore/import-and-remediate`. Resolves `investigation-parser-unbuilt` engine / gap-register **R-21** (named release blocker); opens `lab-reference-ranges-provisional` (High).

Enforces the hard limit "no raw lab numbers to LLM context": a raw numeric result is converted to an HL7 interpretation + qualitative string before it can enter a packet — the raw number never reaches the trunk.

### Changes
- `verification/data/lab-reference-ranges.json` (new): 8 LOINC-keyed analytes, dataset_version, **DEV/SYNTHETIC-ONLY — not clinically authoritative** banner, adult sex-agnostic bands.
- `verification/investigation-parser.js` (new): `sanitiseInvestigation()` → conformant `lab_result` fact (HL7 N/H/L/HH/LL + qualitative value, no raw number, `sanitised_by`) + dataset_version/checksum receipt; unknown/non-numeric fail safe to `U`.
- `verification/pipeline-schemas.js`: ContextPacket refinement — `lab_result` facts must carry `sanitised_by` and a non-numeric value.
- `verification/pipeline.js`: `contextInjection` runs `options.raw_investigations` through the parser into sanitised facts (parser now has a real consumer).
- `test/contract-investigation-parser.js` (new) + pipeline integration test (raw 6.8 → `HH` fact; raw number absent from the whole packet). `npm test` 8/8.
- `architecture/trust-boundaries.md`: documented the no-raw-lab enforcement.

### Register movement
- `investigation-parser-unbuilt`: Critical, UNBUILT → **PARTIAL / in-progress** (engine built mock/dev; named-blocker engine criterion met).
- **Opened** `lab-reference-ranges-provisional` (High): dev ranges need clinical + regulatory sign-off before patient-facing; live lab source (fhir-broker) also pending.

### Verification
- `npm test` 8/8; `verification` + `trunk:stub:all` 9/9 stub + live MCP; integration confirms the raw value never reaches the packet.

---

## Register correction — ContextGraph / PatientKnowledgeGraph are not dead-ends (2026-06-30)

**Status:** Reclassification (no code). Register/doc-only.

Phase 0 over-flagged `context-graph` and `patient-knowledge-graph` as DEAD_END. Investigation shows both are contracted across the spec — `grounding-plan` (`needs_structured_kg`, `live_call_specs` graph_kind), `evidence-node` (`kg_node` supports), the knowledge server's `kg.query` (mcp/README, mcp-server-map), architecture and data-buckets docs. They have no JS producer only because the **knowledge server is UNBUILT** — the same awaiting-producer status as `pharm-intent`/`pharm-check` vs the pharmacology server. Removing them would break those references; the correct resolution is to keep and track them under `knowledge-server-unbuilt`.

- Completeness Register: both reclassified DEAD_END → COMPLETE (contracted schema awaiting registered producer), `gap_register_link` → knowledge datasets; dropped from the dead-end build-checklist line.
- `.claude/completeness-index.md`: removed (no longer open findings).

No schema files changed.

---

## Pipeline edges contracted — GroundingPlan + ContextPacket gated (2026-06-30)

**Status:** Complete. Branch `chore/import-and-remediate`. Resolves `pipeline-edges-uncontracted` (Medium).

The routing→retrieval and context-injection step boundaries passed data with no schema gate. Added zod validators mirroring the JSON contracts and enforced them; reworked the stub so the packet actually conforms.

### Changes
- `verification/pipeline-schemas.js` (new): zod `GroundingPlanSchema`, `ContextPacketSchema`, `EvidenceNodeSchema`, `ReceiptSchema` + `validateGroundingPlan()`/`validateContextPacket()` (throw).
- `verification/pipeline.js`: validate the GroundingPlan after routing and the ContextPacket after injection. Reworked `contextInjection()` to emit a conformant packet — `receipts[]` holds only clean Receipts (request_id/timestamp_utc/upstream/mode; `validated_codes`/`kind` dropped), and `static_doc` citations move into `evidence[].supports[]`.
- `test/contract-pipeline.js` (new), wired into `npm test` (now 7/7): validators accept conformant data; reject missing-required, extra-key, receipt-missing-timestamp, receipt-with-validated_codes, and malformed EvidenceNodes.
- `.claude/schema-index.md`: noted the zod gate on grounding-plan / context-packet.

### Notes
- The VerificationReport edge was already gated (report-schema.js); with this, all four named pipeline contracts are enforced. EvidenceNode and Receipt are validated as part of the ContextPacket.
- `recordRun()`/ledger and the evidence_tree builder remain compatible with the conformant packet; citations are now represented in evidence rather than as pseudo-receipts in the ledger.

### Verification
- `npm test` 7/7; `npm run verification` + `trunk:stub:all` green on stub and live (HEYDOC_USE_MCP=1); produced GroundingPlan + ContextPacket validate; ledger chain VALID.

---

## Verifier hardening — code detection + binding + mock-mode (2026-06-30)

**Status:** Complete. Branch `chore/import-and-remediate`. Resolves `verifier-weak-code-detection` / gap-register **R-19**; opens `terminology-contract-incomplete` / **R-20** (High).

The `no_invented_codes` check was weak: it matched ICD-11 only (not the pinned ICD-10-AM), let any terminology receipt clear all codes, and never flagged mock receipts.

### Changes
- `verification/verifier.js`: detection across SNOMED CT / ICD-10-AM / ICD-11 / LOINC / PBS with false-positive guards (dotted/dash-check/labelled forms always flagged; bare ICD/PBS context-gated so "vitamin B12", vitals, and YYYY-MM dates don't trip). **True per-code↔receipt binding** for SNOMED/ICD-10-AM/LOINC (each token must be in a receipt's validated_codes; ICD-11/PBS coarse, documented). **Mock-mode flagging**: mock receipts listed in `mock_receipt_flags`; in a non-mock `context_mode` they no longer ground (block).
- `verification/pipeline.js`: threads validated codes + per-receipt modes + context_mode into evidence; mock terminology receipt declares its validated code.
- `verification/retrieval-mcp.js`: captures `validated_codes` from the live lookup; **fixes a pre-existing bug** where the terminology receipt's outer `upstream` was the vendor name, so the pipeline never recognised it (binding silently failed on the MCP path).
- `mcp/schemas/verification-report.schema.json` + `report-schema.js` + both writers: optional `mock_receipt_flags`.
- `test/contract-verifier.js`: per-system detection, FP guards, binding (match/mismatch), mock flag + non-mock block.

### Register movement
- `verifier-weak-code-detection`: High, PARTIAL → **COMPLETE/resolved** (R-19).
- **Opened** `terminology-contract-incomplete` (High, R-20): terminology grounds only SNOMED + ICD-11; ICD-10-AM/LOINC/PBS ungroundable → hardened verifier blocks them (fail-safe). Feeds the AUCDI R3 value-set binding item.

### Verification
- `npm test` 6/6; `trunk:stub:all` 9/9 on both stub and live (HEYDOC_USE_MCP=1) paths.

---

## AU Core structural conformance validator (vendored SDs) (2026-06-30)

**Status:** Structural validator complete (mock). Branch `feat/aucore-conformance` (stacked on `feat/terminology-r20`). Advances `fhir-r4-aucdi-conformance-unbuilt`.

### Changes
- `mcp/servers/fhir-broker/au-core/` (new): VENDORED AU Core StructureDefinition snapshot — 5 SDs (Patient/Condition/MedicationRequest/AllergyIntolerance/DiagnosticResult) at **2.0.1-ci-build** (FHIR 4.0.1), with a checksummed `manifest.json` (source URL + fetch date). CI build (not a stable release).
- `mcp/servers/fhir-broker/conformance.js` (new) + `fhir_validate` tool: deterministic structural validation over the snapshot — profile/type match, required (min≥1), cardinality, fixed code-system; **ValueSet membership + FHIRPath invariants reported `not_evaluated`** (need live NCTS). No new runtime dependency; offline.
- `test/contract-fhir-conformance.js` (new) wired into `npm test` (14/14).
- `CLAUDE.md <standards_pins>`, server-status, registers updated.

### Version-target flag (regulatory)
Per operator decision, the validator runs against the **current CI build (2.0.1-ci)** — this **diverges from the pinned AU Core 0.3.0**. The authoritative AU Core version is an unsettled org/regulatory conformance-target decision.

### Register movement
- `fhir-r4-aucdi-conformance-unbuilt`: Medium, UNBUILT → **PARTIAL** (structural done; ValueSet-binding + full invariant validation need live NCTS). **Resolved** `au-core-sd-snapshot` (vendored).

### Verification
- `npm test` 14/14; `trunk:stub:all` 9/9; conformant→conformant, missing-required→non_conformant, binding→not_evaluated.

---

## Terminology multi-system grounding + Digital Tablet import (2026-06-30)

**Status:** Mock complete. Branch `feat/terminology-r20`. Advances `terminology-contract-incomplete` / gap-register **R-20**; imports the Digital Tablet.

The terminology layer grounded only SNOMED + ICD-11, so the invariant's ICD-10-AM/LOINC/PBS codes were un-groundable and blocked by the hardened verifier.

### Changes
- `data/digital_tablet_omnibus.json` (new): the "Digital Tablet" AU Core R4 schema capsule (was referenced by the schemas but absent). Declares SNOMED CT-AU / ICD-10-AM 12th / LOINC 2.77 / PBS / AMT and the terminology_servers (NCTS Ontoserver). No secrets.
- `mcp/schemas/terminology-lookup.schema.json`: `system` enum → SNOMED_CT/ICD_10_AM/ICD_11/LOINC/PBS/AMT.
- `mcp/servers/terminology/index.js` + `terminology-servers.json` (new): all 3 tools accept the extended enum; per-system mock concepts (echo a looked-up code so any code validates); live NCTS/Ontoserver endpoints recorded from the Digital Tablet, **used only in live mode — mock never calls them**.
- `verification/verifier.js`: per-code binding extended to PBS (context-gated) and AMT (SNOMED-form); ICD-11 stays coarse.
- `verification/retrieval-mcp.js`: `retrieveTerminology` grounds multiple systems (SNOMED + ICD-10-AM + LOINC).
- Tests: `contract-terminology.js` validates each system; `contract-verifier.js` adds PBS bind/unbind. `npm test` 13/13.

### Register movement
- `terminology-contract-incomplete` (R-20): High, PARTIAL → **advanced** (mock multi-system + per-code binding; live NCTS + AU Core value-set binding remain input-gated).
- **Imported/resolved** `digital-tablet-omnibus` (resolves a dangling schema reference).

### Verification
- `npm test` 13/13; `trunk:stub:all` 9/9 stub + live MCP; end-to-end ICD-10-AM `M54.5` binds on the MCP terminology path.

---

## Standards registration — FHIR R4 / AUCDI R3 grounding scoped (2026-06-30)

**Status:** Registered (not built). Operator request to ground HL7 FHIR R4 + AUCDI Release 3.

Placed in topology: FHIR R4 and AUCDI R3 are structure/data-model standards (trust boundary 3), not terminology code systems — distinct from the SNOMED/ICD/LOINC/PBS terminology layer. AUCDI R3 supplies required terminology bindings that can later enrich the verifier's code↔receipt binding.

- `<standards_pins>` (CLAUDE.md): **AUCDI Release 3** added, supplementing AU Core 0.3.0. Whether AUCDI R3 re-targets or only supplements the AU Core conformance target is flagged as an unsettled org/regulatory decision.
- gap-register §3: AUCDI R3 row added.
- Completeness Register: opened `fhir-r4-aucdi-conformance-unbuilt` (Medium — deterministic FHIR R4 + AU Core + AUCDI R3 conformance validator in fhir-broker) and `aucdi-r3-valueset-binding-unbuilt` (Medium — AUCDI required-binding tables + verifier value-set enforcement).
- Sequencing: registered now; to be scoped (Phase 1) after `verifier-weak-code-detection` (item 2), which it depends on.

---

## Verifier test coverage — 5 hard checks under test (2026-06-30)

**Status:** Complete. Branch `chore/import-and-remediate`. Resolves `verifier-untested` / gap-register **R-18**.

`<test_and_evaluation_gates>` forbids untested deterministic safety code; the five verifier checks had no tests. Added `test/contract-verifier.js` covering, per check, a clean PASS, a violation FAIL, and the receipt/citation that flips FAIL→PASS — for `no_invented_codes`, `no_invented_guidelines`, `no_invented_operations`, `no_repo_invention`, `hard_stop_enforcement` — plus the `candidate_output_hash` return, overall-pass logic, and a `runPipeline()` integration (5 results). Wired into `npm test` (now 6/6). No verifier behaviour change; the tests assert the current contract and will be extended alongside `verifier-weak-code-detection`.

---

## Append-only audit ledger + synthetic content store + rehash (2026-06-30)

**Status:** Complete (mock/staging scope). Branch `chore/import-and-remediate`.

Mock-resolves Completeness Register `receipt-store-append-only-unbuilt` / gap-register **R-17**, and opens `content-store-production-gated` (Medium). Builds the durable, tamper-evident audit trail required by `<observability_and_audit>` while respecting `<data_handling>` patient-data minimisation via a two-store split.

### Design
- **Append-only hash-chained ledger** (`medicolegal-audit-ledger`) — non-PHI: hash anchor + run/trunk metadata + pass gate + per-check booleans + receipt metadata. Each entry's `entry_hash` chains over its canonical content + the previous entry's hash, so any edit/insert/reorder breaks the chain.
- **Synthetic-only content store** — exact output text, content-addressed by hash; `persistContent()` mechanically refuses non-synthetic data; live entries are forced `content_persisted=false`. Real-patient persistence is deferred to the session-persistence Critical + consent.

### Changes
- `mcp/schemas/audit-ledger-entry.schema.json` + `verification/ledger-schema.js` (new): ledger record contract + zod `validateLedgerEntry()` (throws; rejects PHI keys and live+persisted).
- `verification/audit-store.js` (new): `appendEntry` (hash-chain), `verifyChain`, `persistContent` (synthetic guard), `readContent`, `recordRun`; `HEYDOC_DATA_DIR` override.
- `verification/run.js` + `integration/trunk-pipeline.js`: call `recordRun()` after `validateReport()`.
- `verification/rehash.js` (new) + `verify:rehash` script: `--integrity` (recompute vs ledger + verify chain), `--reissue` (re-verify stored outputs → fresh hashed reports + ledger entries), `<path>` ingest.
- `test/contract-audit-store.js` (new), wired into `npm test`.
- `.heydoc-data/` stays gitignored — the store is runtime data, never committed.
- Docs: `architecture/trust-boundaries.md` (Boundary 5 + the patient-data split), `.claude/schema-index.md`.

### Register movement
- `receipt-store-append-only-unbuilt`: High, UNBUILT → **PARTIAL / in-progress** (mock-resolved; prod WORM + retention pending) — R-17.
- **Opened** `content-store-production-gated`: Medium, PARTIAL (synthetic-only until session-persistence Critical + consent).
- `session-persistence-unenforced` (Critical): unchanged — explicitly not claimed.

### Verification
- `npm test` → 5/5 (adds `contract-audit-store: OK`).
- `verify:rehash --integrity` → chain VALID, hashes match; `--reissue` → outputs re-verified, hashes reproduce; planted content drift → exit 1.

---

## Medicolegal hashing — candidate_output_hash implemented (2026-06-30)

**Status:** Complete. Branch `chore/import-and-remediate`.

Closes Completeness Register `hashing-unimplemented` (Critical) and gap-register **R-16**. Before this change, the SHA-256 medicolegal anchor mandated by the prime directive was computed nowhere; the VerificationReport schema defined the field but left it optional, and neither report writer populated it.

### Changes
- `verification/hash.js` (new): `hashCandidateOutput()` — SHA-256 (`node:crypto`) over the exact, unmodified UTF-8 bytes of the candidate output; throws on non-string. No normalisation — the hash reflects exactly what was generated.
- `verification/verifier.js`: `verify()` computes `candidate_output_hash` first (before any output processing) and returns it.
- `verification/report-schema.js` (new): zod `VerificationReportSchema` mirroring the JSON schema; `validateReport()` throws on a malformed audit record.
- `verification/run.js`, `integration/trunk-pipeline.js`: both writers include `candidate_output_hash` and call `validateReport()` before persisting.
- `mcp/schemas/verification-report.schema.json`: `candidate_output_hash` added to `required` (now 6); description + `_integration_notes` updated.
- `test/contract-verification-report.js` (new), wired into `npm test`: known SHA-256 vector, determinism, end-to-end hash==output, gate rejects missing/malformed/unknown-key.

### Register movement
- `hashing-unimplemented`: Critical, PARTIAL → **COMPLETE / resolved** (gap_register_link R-16).
- `pipeline-edges-uncontracted`: Medium → **partially addressed** (VerificationReport edge now zod-gated; GroundingPlan/ContextPacket/EvidenceNode edges remain open).

### Verification
- `npm test` → 4/4 (`contract-docs/identity-au/terminology/verification-report`: OK).
- `npm run verification` and `npm run trunk:stub:all` → reports carry a valid `sha256:…` hash and pass `validateReport()`; `Pass: true`, trunks 9/9.

---

## Maintenance — Supply-chain advisory remediation (2026-06-30)

**Status:** Complete (mock environment). Branch `chore/bump-mcp-sdk-1.29`.

Cleared all 3 High + 4 moderate `npm audit` advisories, all transitive via
`@modelcontextprotocol/sdk`. None lay on an exercised code path — every server
and the verifier client use stdio transport, not the vulnerable HTTP/SSE stack —
but `<security_and_secrets>` makes High/Critical advisories build-blocking, so
they were cleared regardless.

### Changes
- `package.json`: `@modelcontextprotocol/sdk` floor `^1.0.0` → `^1.29.0`.
- `package-lock.json`: re-locked. Patched transitive deps now pinned:
  `hono 4.12.27`, `fast-uri 3.1.3`, `path-to-regexp 8.4.2`, `ip-address 10.2.0`,
  `qs 6.15.3`, `express-rate-limit 8.5.2`. No `overrides` needed; no major bumps;
  `zod` unchanged at 3.x. Stays within MCP SDK `^1` — no stack swap.
- `.github/workflows/ci.yml`: added a blocking `npm audit --audit-level=high`
  step after `npm ci`.
- `gap-register.md`: added risk **R-14** (dependency advisory reaching build —
  Controlled) and **R-15** (no SAST/secret-scanning in CI — Open gap, still to be
  added before any patient-facing release).

### Verification
- `npm audit --audit-level=high` → 0 High/Critical.
- Clean `npm ci` from the new lockfile → `found 0 vulnerabilities` (reproducible).
- `npm test`, `npm run verification`, `npm run trunk:stub:all` all green.

---

## Checkpoint E — Design artifacts committed (2025-03-19)

**Status:** Complete.

All design-phase outputs were added to the repo and pushed to `origin/master`.

### Artifacts added

| Path | Purpose |
|------|--------|
| `grounding/gap-register.md` | Hallucination/grounding gap register (repos, APIs, standards, vendors). |
| `grounding/entity-inventory.json` | Machine-readable entity inventory keyed by plan. |
| `grounding/data-buckets.md` | Classification: Static Docs, Live Data, Structured Knowledge. |
| `mcp/README.md` | MCP server set, tool lists, verification hooks. |
| `mcp/mcpServers.template.json` | Server config template (command, args, env). |
| `mcp/schemas/*.json` | JSON schemas for tool I/O, evidence, context, terminology. |
| `docs/grounding/README.md` | Pinned source-of-truth notes (placeholders). |
| `docs/grounding/CHANGELOG.md` | This execution log. |
| `architecture/grounding-pipeline.md` | 5-step pipeline + verification rules. |
| `architecture/trust-boundaries.md` | Trust boundaries for MCP servers. |
| `architecture/sequence-diagrams.md` | Sequence diagrams for pipeline/MCP. |

### Execution phases

- **E** ✅ Design artifacts in repo (this checkpoint).
- **Step 2** ✅ First MCP servers implemented (2025-03-19):
  - `mcp/servers/docs/index.js`: `docs_search`, `docs_get`, `docs_cite` (mock/dry_run).
  - `mcp/servers/identity-au/index.js`: `identity_verify`, `identity_lookup_ihi`, `identity_log_consent` (stub/mock/dry_run).
  - Contract tests: `test/contract-docs.js`, `test/contract-identity-au.js`. Run with `npm test` (requires `npm install`).
- **Step 3** ✅ Verification harness (2025-03-19):
  - `verification/pipeline.js`: 5-step runner (stub routing/retrieval/generation).
  - `verification/verifier.js`: checks for invented codes, guidelines, operations, repo names, hard-stop.
  - `verification/run.js`: CLI; writes `verification/report.json` and `verification/evidence_tree.md`. Run: `npm run verification` or `node verification/run.js [candidate_output.txt]`.
- **Step 4** ✅ Wire Trunk agents to pipeline and verification layer (2025-03-19):
  - `integration/trunk-pipeline.js`: `runTrunkWithGrounding(trunkId, userInput, options)` — runs pipeline + verification, optional write of report.json and evidence_tree.md.
  - `integration/README.md`: how Trunk agents call the integration.
  - `trunk/stub-agent.js`: first Trunk stub; one turn through pipeline and verification. Run: `npm run trunk:stub`.
- **Live MCP retrieval** (pipeline wired to real servers):
  - `verification/retrieval-mcp.js`: spawns docs and identity-au MCP servers via StdioClientTransport, calls `docs_search` and `identity_lookup_ihi`, collects receipts.
  - Pipeline uses live retrieval when `HEYDOC_USE_MCP=1` (or `options.use_mcp`); falls back to stub on failure or when unset.
  - `runPipeline` is async; `verification/run.js`, `integration/trunk-pipeline.js`, and `trunk/stub-agent.js` updated to await it.
- **Terminology MCP server** (code lock-in / no invented codes):
  - `mcp/servers/terminology/index.js`: tools `terminology_lookup`, `terminology_validate`, `terminology_map` (mock/dry_run); returns TerminologyLookup-shaped response with receipt.
  - `test/contract-terminology.js`: contract test; `npm test` now runs docs + identity-au + terminology.
  - `verification/retrieval-mcp.js`: when HEYDOC_USE_MCP=1, calls terminology server for plans that need terminology and collects receipt so verifier can satisfy "no invented codes" when output references SNOMED/ICD.
- **Trunk 2.0 system prompt**:
  - `trunk/prompts/trunk-2.0-system.md`: system prompt for Trunk 2.0 (triage only; no diagnosis, no dosages; grounding rules and citation discipline).
  - `integration/trunk-pipeline.js`: `getTrunkSystemPrompt(trunkId)` loads `trunk/prompts/trunk-{id}-system.md` for use as LLM system message.
  - `integration/README.md`: documents system prompt loading and pipeline usage.
- **CI (GitHub Actions)**:
  - `.github/workflows/ci.yml`: on push/PR to master or main, runs `npm ci`, `npm test`, `npm run verification`, `npm run trunk:stub:all` (Trunk 2.0 + 3.0 stubs).
- **Trunk 3.0 system prompt and stub**:
  - `trunk/prompts/trunk-3.0-system.md`: system prompt for Trunk 3.0 (structured history enrichment; no diagnosis, no dosages; output contract: follow_up_questions, structured_history, evidence_refs).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["3.0"]` = ["no diagnosis", "no dosages", "history enrichment only"].
  - `trunk/trunk-3.0-stub-agent.js`: stub agent for Trunk 3.0; `npm run trunk:stub:3`. `npm run trunk:stub:all` runs both 2.0 and 3.0 stubs.
- **Trunk 7.0 system prompt and stub**:
  - `trunk/prompts/trunk-7.0-system.md`: code lock-in prompt (no diagnosis, no dosages, terminology receipt required for coded output).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["7.0"]` includes no diagnosis/no dosages and terminology-receipt lock-in constraints.
  - `trunk/trunk-7.0-stub-agent.js`: stub agent for Trunk 7.0; `npm run trunk:stub:7`.
  - `package.json` aggregate run updated: `trunk:stub:all` now runs 2.0 through 7.0 stubs.
- **Trunk 8.0 system prompt and stub**:
  - `trunk/prompts/trunk-8.0-system.md`: pharmacology firewall intent-check prompt (no diagnosis, no dosages, blocked/HARD_FAIL handling explicit).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["8.0"]` includes no diagnosis/no dosages and pharmacology firewall blocking constraints.
  - `trunk/trunk-8.0-stub-agent.js`: stub agent for Trunk 8.0; `npm run trunk:stub:8`.
  - `package.json` aggregate run updated: `trunk:stub:all` now runs 2.0 through 8.0 stubs.
- **Trunk 9.0 system prompt and stub**:
  - `trunk/prompts/trunk-9.0-system.md`: red-flag questionnaire and escalation-gate prompt (no diagnosis, no dosages, unknown/blocked states explicit).
  - `integration/trunk-pipeline.js`: `TRUNK_CONSTRAINTS["9.0"]` includes no diagnosis/no dosages plus red-flag questionnaire gating.
  - `trunk/trunk-9.0-stub-agent.js`: stub agent for Trunk 9.0; `npm run trunk:stub:9`.
  - `package.json` aggregate run updated: `trunk:stub:all` now runs 2.0 through 9.0 stubs.
- **Trunk 1.0 (originating/master) system prompt and stub**:
  - `trunk/prompts/trunk-1.0-system.md`: master/originating intake-routing and safety-gate prompt (no diagnosis, no dosages, evidence-bound escalation logic).
  - `trunk/trunk-1.0-stub-agent.js`: stub agent for Trunk 1.0; `npm run trunk:stub:1`.
  - `package.json` scripts updated: `trunk:stub` now aliases Trunk 1.0; added explicit `trunk:stub:2` for Trunk 2.0; `trunk:stub:all` now runs 1.0 through 9.0 stubs.
  - `integration/README.md` and `trunk/prompts/README.md` updated to include Trunk 1.0 as the originating step.
