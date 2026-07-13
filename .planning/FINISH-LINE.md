# FINISH-LINE.md — the single sequenced path to a complete, workable model

**Status:** LIVE tracker (consolidates the 2026-07-13 six-agent planning-doc review + both registers into one path).
**Owner agent:** `.claude/agents/finish-line-review.md` — the ONLY process that updates this file. Run it to re-verify and advance.
**Baseline:** `main @ 138c21c` (PRs #1–#53 merged). Last verified: 2026-07-13.
**Authority order:** live repo > `docs/grounding/completeness-register.md` + `gap-register.md` > this file. If this file disagrees with the registers, the registers win and this file is the defect.
**Checkbox rule:** an item is `[x]` only with repo-verifiable evidence (file/test/register state/attestation record) — never on recall, never on a plan.

> **Not legal, clinical, or regulatory advice.** Items tagged `[CLINICIAN]`/`[ORG]` are operator/specialist decisions this tracker sequences; it never makes them.

---

## 0. Definition of "finish line"

Production promotion (LIVE_PLAN L14 GO/NO-GO) requires, mechanically:

1. **Four patient-facing release blockers green** (charter `<release_and_environments>`):
   - Pharmacology vendor live + validated → FL-30
   - Clinician Verification Portal complete → built (L1) + FL-11 (WORM registration) + FL-42 (identity federation)
   - Investigation parser authoritative → FL-23 (range sign-off) + FL-32 (live lab source)
   - Session-bound persistence enforced → ✅ done (M4, 2026-07-03) — consent capture for any *future* persistence is FL-01
2. **Four-part patient-eligibility precondition:** MIRAGE-passed on an attested corpus (FL-21) · governance-gated (✅ H7) · corpus attested (FL-21) · real portal gate records (✅ L1, durable substrate via FL-11)
3. **Evaluation gates green as blocking** (FL-40): case pass ≥0.70 · ≥80% cases passing · ZERO critical under-triage · ≥90% verification compliance
4. **Operator release authorisation** (FL-52) after the TGA classification decision (FL-50)

---

## 1. Scoreboard

| Wave | Theme | Items | Done |
|---|---|---|---|
| W0 | Engineering, no external input | 4 | 3/4 |
| W1 | Light operator handbacks → staging exists | 5 | 0/5 |
| W2 | Clinical attestations | 4 | 0/4 |
| W3 | Vendor / licence connects (long lead — initiate NOW) | 4 | 0/4 |
| W4 | Live validation + gates armed | 3 | 0/3 |
| W5 | Regulatory + release | 4 | 0/4 |

**Next action (ENG):** FL-42 clinician identity federation (portal remainder — replaces the shared bearer token with federated identity + signature-bound gate records; advances the Clinician Verification Portal release blocker). FL-04 is `[CLINICIAN]`-gated (park unless triggered), so FL-42 is the highest-leverage ENG item now that W0 engineering is drained. **Next action (CLINICIAN):** FL-21 MIRAGE corpus attestation is now fully unblocked (98-item v0.2.0 tranche ready) — attesting it flips the bench to GATING and unlocks `patient_eligible` consideration. **Next action (OPERATOR):** FL-30/FL-31 vendor+licence outreach (longest lead) + the W1 quick wins (FL-10/11/12/13).

---

## W0 — Engineering, no external input (start immediately)

- [x] **FL-01 · Consent capture (LIVE_PLAN L12)** `[ENG · plan-gated]` — R-40 / `consent-capture-unbuilt` (UNBUILT, High, pf:true). Build: consent record schema (omnibus Consent conventions) + capture flow + Privacy Act 1988 / APP mapping doc. Until built nothing persists (safe direction).
  *Done when:* schema + zod + flow + contract test in `npm test`; register item resolved.
  *Done 2026-07-13 (PR #49, `main @ 141b215`).* Evidence: `mcp/schemas/consent-record.schema.json` + `verification/consent-schema.js` (zod `.strict()`) exist; flow in `verification/consent.js` (capture/revoke/status + fail-closed `requireActiveConsent()` seam) + `verification/consent-store.js` (fourth append-only chain, day-one substrate seam) + bounded consult-intake step (`patient/consult-flow.js`); `test/contract-consent.js` wired into `npm test` and run green this verification; `consent-capture-unbuilt` → COMPLETE/`status: resolved` (last_scanned 2026-07-13); R-40 capture half resolved; `.claude/completeness-index.md` synced; APP mapping at `docs/grounding/privacy-app-mapping.md`. Built as RECORDING-not-unlocking — `content-store-production-gated` deliberately stays open; L12 org/security siblings tracked at FL-13/FL-51.
- [x] **FL-02 · MIRAGE corpus expansion (LIVE_PLAN L9, authoring half)** `[ENG]` — corpus v0.1.0 is ~23 items, DRAFT/unattested → nothing gates. Author the full tranche to `MIRAGE-CORPUS-SPEC` (synthetic, question-only, checksummed). Attestation itself is FL-21.
  *Done when:* corpus vNEXT committed, loader-valid, `bench:mirage` green over it.
  *Done 2026-07-13 (PR #51, `main @ 3519a00`).* Evidence: `benchmark/mirage/corpora/manifest.json` `corpus_version: 0.2.0`, `totals.items: 98` (file lengths 18+34+31+15 = 98); the corpus loads through the STRICT loader `loadAllCorpora` (`benchmark/mirage/corpus-loader.js` — firewall/question-only/version/item validation, throws on violation), exercised by `test/bench-mirage-gate.js:87` plus a checksum-format assertion; `npm run bench:mirage` run green this verification (EXIT=0, "bench-mirage-gate: OK"). Registers already synced: completeness-register FL-02 scoped re-scan (23 → 98, v0.2.0) + gap-register R-29 updated; `mirage-benchmark-gate` (R-29) stays COMPLETE (FL-02 grows the corpus; resolves neither attestation nor live-backend P-volume). AUTHORING half only — corpus stays `attested_by:null`, all three paths `benchmark_passed=false`/`patient_eligible=false` (correct: nothing gates until FL-21 attestation + H7 governance).
- [x] **FL-03 · Low-risk hygiene batch** `[ENG]` — reference-case manifest retrofit (`SPEC-CARD-04-00001` via ingest round-trip); repo-digest default-deny fixture in the M3 allow-list test; optional F1 verifier fuzz suite.
  *Done when:* eval:cases shows 0 named exemptions; fixture test green.
  *Done 2026-07-13 (PR #53, `main @ 138c21c`).* Evidence: `npm run eval:cases` run green this verification — **named exemptions: 0**, 301 attested (UNCHANGED — the retrofit set `clinician_reviewed:false` fail-safe so the ref case stays out of the trusted set), PASS, failures: 0; the `LEGACY_EXEMPT` set + exemption branch removed from `scripts/eval-case-gate.mjs` (missing manifest is now a hard failure). `node test/contract-context-allowlist.js` green (`contract-context-allowlist: OK`, EXIT=0) — the M3 digest-shaped default-deny fixture (synthetic content, no `data/cases` read) proves the allow-list rejects every realistic digest-injection shape with zero sealed leakage. Both register items `status: resolved`/COMPLETE (last_scanned 2026-07-13): `reference-case-manifest-missing` (retrofit manifest is byte-hash only — sealed 10_–13_ streamed through sha256, never parsed/routed; firewall NOT breached) and `repo-digest-sealed-node-carveout`. Optional F1 verifier fuzz suite explicitly DEFERRED (not in the done-when) — FL-03 closes on the two resolved items.
- [ ] **FL-04 · PPP-TTT Step 4 (conditional — park unless triggered)** `[CLINICIAN]` — `discriminator_status` attestation field; only opens if a clinician adopts graded discriminator attestations. Absence fails closed to STOP (correct today).
  *Done when:* clinician adopts + attests the field, or item is formally closed as not-pursued.

## W1 — Light operator handbacks → a running staging environment

- [ ] **FL-10 · Portal token (checklist A3)** `[OPERATOR·CRED]` — `HEYDOC_PORTAL_TOKEN` into the secrets manager for staging.
  *Done when:* handback "token set at `<ref>`"; live-enforced portal starts.
- [ ] **FL-11 · WORM bucket + IAM (checklist B1 operator half; R-39)** `[OPERATOR·CRED]` → then `[ENG]` validate `verify:rehash --integrity` in staging across ALL THREE chains (adapter + seams all built, PRs #45/#46).
  *Done when:* R-39 resolved; integrity check green against the live bucket.
- [ ] **FL-12 · Staging deploy (checklist B2 operator half; R-35)** `[OPERATOR·CRED]` — run `deploy/build-and-push.sh` + `apprunner-create.sh` (scaffolding built, PR #42) → then `[ENG]` add the staging deploy CI job.
  *Done when:* staging service up at a URL; CI deploy job green.
- [ ] **FL-13 · SAST choice (checklist B4; R-38)** `[OPERATOR·DECIDE]` — CodeQL vs semgrep → then `[ENG]` wire blocking CI job beside the first-party secret-scan.
  *Done when:* SAST blocking in CI; R-38 resolved.
- [ ] **FL-14 · Observability deploy half (R-37)** `[OPERATOR+ENG]` — dashboards + pager on the charter metrics (pass/fail, HARD_FAIL, BLOCKED_NO_PROOF, alarmed under-triage); seams/counters already built.
  *Done when:* alarms fire from staging runs; R-37 resolved.

## W2 — Clinical attestations (no vendor dependency; can run parallel to W1)

- [ ] **FL-20 · Knowledge dataset sign-off (checklist C4; M12)** `[CLINICIAN]` — benign registry, Axis B templates, red-flag bank are DEV/SYNTHETIC-ONLY (`knowledge-datasets-provisional`, High, pf:true).
  *Done when:* attestation recorded per dataset; register item resolved.
- [ ] **FL-21 · MIRAGE corpus attestation (checklist C5; LIVE_PLAN L9)** `[CLINICIAN]` — attest the FL-02 tranche; flips the bench from diagnostic to GATING and unlocks `patient_eligible` consideration for the three evidence paths. **Readiness ↑ (2026-07-13):** FL-02 landed the full v0.2.0 corpus (98 items, all `attested_by:null`) — a clinician now has the complete tranche to attest, and the diagnostic run shows all three paths would_pass_if_attested=true.
  *Done when:* `attested_by` recorded; bench gates over attested items.
- [ ] **FL-22 · Case-set distribution polish (checklist C6; optional)** `[OPERATOR+CLINICIAN]` — 49/45/7 → 60/30/10 via the H4 case factory (input-gated on a Java runtime); generated candidates need attestation before entering the trusted set. ≥45 minimum already met (301 attested).
  *Done when:* attested distribution within design tolerance, or formally waived.
- [ ] **FL-23 · Lab reference-range sign-off (M10 remainder; blocker #3 half)** `[CLINICIAN/ORG]` — `lab-reference-ranges-provisional` (High, pf:true); sanitiser policy already CONFIRMED (HIST-2).
  *Done when:* authoritative range set attested + swapped in; register item resolved.

## W3 — Vendor / licence connects (longest lead — initiate outreach NOW, lands after W1/W2)

- [ ] **FL-30 · Pharmacology vendor (checklist C1; M9/L6) — RELEASE BLOCKER #1** `[OPERATOR·CRED+DECIDE]` — MIMS-AU or equivalent (NTI, interactions, renal dosing, AU scheduling) + SafeScript WA; creds via secrets manager → then `[ENG]` M9 phases: contract lock → live adapter behind the frozen PharmCheck contract → staging validation against the case set. Mock core + Trunk 8.0 firewall already built/tested.
  *Done when:* live PharmCheck validated in staging; `pharmacology-server-unbuilt` resolved.
- [ ] **FL-31 · NCTS licence + C22 decision (checklist C2; M11)** `[OPERATOR·CRED+ORG]` — NCTS OAuth/RF2 + settle the AU Core conformance target (0.3.0 pin vs vendored 2.0.1-ci) → then `[ENG]`: AU-content validation (SNOMED CT-AU/ICD-10-AM/PBS/AMT), live-revalidate the 1580 case codes, LOINC/PBS binding, AUCDI R3 valuesets. Live `$validate-code` adapter already built (M11 P1).
  *Done when:* AU codes validate live; `terminology-contract-incomplete` + `aucdi-r3-valueset-binding-unbuilt` resolved; C22 recorded.
- [ ] **FL-32 · FHIR live endpoint (checklist C3; R-28; blocker #3 other half)** `[OPERATOR·CRED]` — live EHR/wso2 endpoint + creds → then `[ENG]` connect `fhir-broker/live-backend.js` + record-sources ingest; parser gets its live lab source.
  *Done when:* live Observation→parser path green in staging on synthetic patients.
- [ ] **FL-33 · MedGemma endpoint (checklist A2; optional backend)** `[OPERATOR·CRED]` — endpoint + key + serving shape → then `[ENG]` live smoke + eval validation. Not on the critical path (Claude backend already live-validated).
  *Done when:* `smoke:llm` green with `HEYDOC_LLM_BACKEND=medgemma`, or item waived.

## W4 — Live validation + gates armed (needs W1 staging + W3 connects)

- [ ] **FL-40 · Live clinical eval harness + threshold arming (R-42 remainder)** `[ENG + CLINICIAN]` — live multi-turn harness over the attested case set; clinician sign-off on the semantic rubric; then wire `enforceReleaseThresholds()` as a BLOCKING staging gate. Scorer/thresholds/alarm already built (L10).
  *Done when:* full live eval run recorded; gate blocking in staging CI; zero critical under-triage.
- [ ] **FL-41 · Full staging soak (LIVE_PLAN L14 prep)** `[ENG]` — all live smokes green on the *deployed* staging (LLM ✅ validated 2026-07-12 host-side; re-prove on staging), WORM integrity green, metrics/alarms live, synthetic patients only.
  *Done when:* soak window completed with 0 unexplained HARD_FAIL/alarm events.
- [ ] **FL-42 · Clinician identity federation (portal remainder)** `[ENG · plan-gated]` — replace the shared bearer token with federated clinician identity + signature binding on gate records.
  *Done when:* `clinician-verification-portal-unbuilt` fully resolved.

## W5 — Regulatory + release

- [ ] **FL-50 · TGA SaMD classification (checklist D1; R-34; LIVE_PLAN L13)** `[ORG]` — Critical, pf:true; a `scope_activation_gate` condition. Surfaced, never decided by the agent.
  *Done when:* documented ruling (classification or exempt-CDSS) recorded in the register.
- [ ] **FL-51 · Privacy/APP review + pen-test** `[OPERATOR+ORG]` — Privacy Act 1988 / APP mapping (builds on FL-01), My Health Records Act touchpoints, external pen-test on the staging surface.
  *Done when:* findings triaged to zero High/Critical.
- [ ] **FL-52 · GO/NO-GO → production promotion (LIVE_PLAN L14)** `[ORG]` — all four blockers green + four-part eligibility precondition + eval gates blocking-green + explicit operator release authorisation. One-way promotion.
  *Done when:* production promotion recorded; nothing patient-facing before this line.
- [ ] **FL-53 · messaging-geo live (LIVE_PLAN L15 — deliberately LAST)** `[OPERATOR·CRED + ENG]` — SMS/email vendor + geo API behind the never-sends mock.
  *Done when:* live providers connected post-release per plan.

---

## 2. Progress log (append-only; newest first)

- **2026-07-13** — FL-03 checked off (PR #53 `main @ 138c21c`, low-risk hygiene batch — reference-case manifest retrofit + repo-digest firewall fixture). Verified against live repo, not the claim: `npm run eval:cases` run green (named exemptions: **0**, 301 attested — UNCHANGED, PASS, failures 0; the retrofit's fail-safe `clinician_reviewed:false` keeps `SPEC-CARD-04-00001` out of the trusted count, and the `LEGACY_EXEMPT` exemption branch is gone so a missing manifest is now a hard failure); `node test/contract-context-allowlist.js` green (OK, EXIT=0) — M3 digest default-deny fixture proves zero sealed-node leakage via the allow-list. Both register items resolved/COMPLETE (last_scanned 2026-07-13): `reference-case-manifest-missing` (manifest is byte-hash only — sealed 10_–13_ hashed via sha256, never parsed/routed; scoring-store firewall NOT breached) + `repo-digest-sealed-node-carveout`. Optional F1 verifier fuzz suite explicitly deferred (not in the done-when). W0 engineering is now drained (FL-04 is `[CLINICIAN]`-gated/parked). Scoreboard W0 → 3/4 (3/24 overall). Next ENG action re-pointed to FL-42 (portal identity federation). No regression on merge-touched pre-completed items (eval:cases still PASS at 301; M3 allow-list test still green). No discrepancies found.
- **2026-07-13** — FL-02 checked off (PR #51 `main @ 3519a00`, MIRAGE corpus expansion, LIVE_PLAN L9 authoring half). Verified against live repo, not the claim: `benchmark/mirage/corpora/manifest.json` shows `corpus_version: 0.2.0` + `totals.items: 98` (corpus-file lengths 18+34+31+15 = 98); the STRICT loader `loadAllCorpora` (firewall/question-only/version/item validation) is exercised by `test/bench-mirage-gate.js:87` and `npm run bench:mirage` run green directly (EXIT=0, "bench-mirage-gate: OK"). Registers already in sync — completeness-register FL-02 scoped re-scan (23 → 98, v0.2.0) + gap-register R-29 updated; `mirage-benchmark-gate` (R-29) correctly stays COMPLETE. AUTHORING half only: corpus stays fully unattested (`attested_by:null`), all three paths `patient_eligible=false` — nothing gates until FL-21 attestation + H7 governance (correct, safe direction). FL-21 readiness re-annotated (now has the full 98-item tranche to attest; would_pass_if_attested=true on all three paths). No regression on merge-touched pre-completed items. Scoreboard W0 → 2/4 (2/24 overall). Next ENG action re-pointed to FL-03. No discrepancies found.
- **2026-07-13** — FL-01 checked off (PR #49 `main @ 141b215`, L12 consent capture). Verified against live repo, not the claim: schema + zod files present, `requireActiveConsent()` seam present, `test/contract-consent.js` last in the `npm test` chain and run green directly; `consent-capture-unbuilt` COMPLETE/resolved in the completeness-register (last_scanned 2026-07-13), R-40 capture half resolved in the gap-register, `.claude/completeness-index.md` synced. Regression spot-checks on merge-touched pre-completed items green: `contract-session-store` OK (M4 close-hook addition is additive), `contract-audit-worm-s3` OK (WORM test extended to the fourth chain). Scoreboard W0 → 1/4 (1/24 overall). Next ENG action re-pointed to FL-02. No discrepancies found; no other item evidenced by this merge (FL-51 gains the APP-mapping foundation but its done-when is untouched).
- **2026-07-13** — First verification pass (finish-line-review agent) at `main @ 5d2d3a7`, no merges since baseline. Verified all 24 open items against live repo + both registers: all 9 register-id links resolve and match claimed state (consent-capture-unbuilt UNBUILT; pharmacology-server-unbuilt PARTIAL/Critical; clinician-verification-portal-unbuilt PARTIAL/Critical; worm-substrate-adapter-unbuilt PARTIAL; knowledge-datasets-provisional/lab-reference-ranges-provisional/terminology-contract-incomplete PARTIAL; aucdi-r3-valueset-binding-unbuilt UNBUILT; mirage-benchmark-gate COMPLETE/resolved). R-rows R-28/34/35/37/38/39/42 confirmed present. Pre-completed context spot-checked: M4 `verification/session-store.js` (+contract test in npm test), L1 `portal/` present, R-43 resolved (PR #46), MIRAGE corpus = exactly 23 items unattested, 301 attested case manifests. Scoreboard (24 items, 0 done) accurate. No checkbox change; no discrepancies found.
- **2026-07-13** — Tracker created from the six-agent planning-doc review consolidation (PR #47) + registers at `main @ 5d2d3a7`. 24 items, 0 checked. Pre-completed context: M0–M8, H0–H7, PPP-TTT 1–3, L1–L4/L10/L11, §9 A1/B1(eng)/B2(eng)/B3, WORM all-three-seams (#45/#46), R-43 registered-and-resolved.
