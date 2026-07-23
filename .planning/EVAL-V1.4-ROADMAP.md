# EVAL-V1.4-ROADMAP.md — atomized, skills-based clinical scoring

**Status:** APPROVED ordering (operator, 2026-07-23) — all-five-dimension atomization. Execution not yet started; each milestone is individually plan-gated at execution per the CLAUDE.md workflow.
**Owner:** eval-scoring subsystem (`verification/eval-scoring.js`, `eval-judge.js`, `eval-harness.js`, `eval-report-schema.js`; `docs/grounding/eval-rubric.md`).
**Supersedes at completion:** `eval-rubric:v1.3:2026-07-22` → `eval-rubric:v1.4` (fresh clinician sign-off).
**Authority order:** live repo > `completeness-register.md` + `gap-register.md` > `.planning/FINISH-LINE.md` > this file. If this file disagrees with a register, the register wins and this file is the defect.

> **Not legal, clinical, or regulatory advice.** Items tagged `[CLINICIAN]` are operator/specialist decisions this file sequences; it never makes them.

---

## 0. Why this exists

Two findings drove this roadmap:

1. **The 25/25/30/15/5 dimension split is ad hoc** (operator confirmation, 2026-07-23). It was carried forward from v1.0 and never derived; the v1.2/v1.3 sign-offs attested the tier-class split, the ±1 tolerance, the medal bands and the derm recalibration — **never the weights themselves**. So the correct move is bottom-up: derive every dimension's weight as the sum of its atomic skill-components' clinical severity, and let the top-level percentages be a *consequence*, not a pre-committed allocation.
2. **`management_quality` (the product's actual deliverable) is graded as a single flat containment fraction** (`12.scoring_rubric.must_include_items` matched/total). It carries no internal shape, so a medal on it is a recolour, not a diagnosis. Yet the node-12 schema already holds rich, necessity-graded, per-domain data (`medications[].necessity`, `allied_health_referrals[].necessity`, `behavioural_change_actions[].necessity`, `patient_education_points[].necessity`) that the scorer currently ignores. Atomization is mostly a wiring change against data that already exists across the ~707-attested corpus — **not** a re-authoring burden.

**Research basis** (2026-07-23 web research; see chat transcript for full citations):
- **HealthBench** (OpenAI, `openai/simple-evals/healthbench_eval.py`) — physician rubrics, atomic criteria, weights −10..+10, score = `clip(Σ(met·weight)/Σ(positive weights), 0, 1)`, with theme/axis sub-scores computed as the same formula over a criterion subset. Closest prior art; adopt the **formula**, keep our **engine**.
- **Autorubric** (arXiv 2603.00077) — analytic-rubric decomposition, weighted-sum with negative-penalty criteria, explicit anti-halo / criterion-conflation controls.
- **OSCE** literature — shorter, well-chosen checklists beat exhaustive ones on reliability.
- **Modified-Angoff** standard-setting — the defensible method for turning clinician judgment of a borderline case into numeric weights/cut-points; serves the TGA/IEC-62304 traceability posture.
- **Semigran-45** (BMJ 2015) + **JMIR ED-CDSS** (2023) — external grounding for the T0–T5 tiering and the 3× under-triage asymmetry.

**Guardrails that never move in this roadmap:** the scoring-store firewall (nodes 10–13 scorer-side only), `candidate_output_hash` SHA-256 hashing, the HARD_FAIL / commission auto-fail as a hard override independent of any weight, and the release gate as a **separate instrument** (≥80% silver-or-better + zero critical under-triage + ≥90% grounding). Medals and sub-scores are **reporting-only**.

---

## Dependency spine

```
Phase 0  Stabilize measurement ──┐ (unblocks a readable canary + belatedly validates the committed de-biasing)
                                 ▼
Phase 1  Design skill decomposition (structure only, no numbers) ──┐
                                                                   ▼
Phase 2  R2 Angoff — derive weights + band cut-points (KL session) ──┐
                                                                     ▼
Phase 3  Implement atomized scoring (R1 formula · R3 bands · R4 boundaries)
Phase 4  Authoring alignment (R5)   ← may overlap Phase 3 once Phase 1 lands
                                 ▼
Phase 5  Validate live + v1.4 sign-off
```

R6 (decline heavyweight frameworks) and R7 (Semigran/JMIR citations) are not milestones — R6 is a documented decision recorded in the Phase 1 design note; R7 is two citations added in the Phase 5 rubric doc.

**Cost discipline:** exactly two metered live canaries in the whole roadmap (GATE 0 and M5.1). Everything else is deterministic / replay / CI or clinician-desk work — deliberately, given the Phase-D dead-canary lesson (2026-07-23): a full metered live run whose clinical signal was buried under an output-format regression.

---

## Phase 0 — Stabilize measurement (no new scoring semantics)

*Goal: a canary whose numbers are real. Cheapest, highest urgency — every later phase is validated by canaries.*

Root cause established from the 2026-07-23 Phase-D canary (`eval-1784769581673-ssybhnc-claude.json`): the reworked Trunk 1.0 prompt made the model emit **Markdown prose instead of the JSON output contract** on ~15+ cases, which (a) failed verification → grounding 94.3% → 85.4%, and (b) broke tier extraction → the parser defaulted no-disposition to T0 ("conservative") → **5 false critical-under-triage events**. Proven: the RESP T5 case output was `escalate_now` with four `present` danger signs, yet scored T0. **Zero of the 5 criticals were genuine "sick patient sent home" failures.**

- **M0.1 — Re-assert the Trunk 1.0 JSON output contract** (canary fix #1).
  - Files: `trunk/prompts/trunk-1.0-system.md` (show the `danger_signs` example *in JSON*; mark the "show the harm" narrative unmistakably as guidance, not an output template), `.claude/trunk-cheatsheets/trunk-1.0.md`, `docs/grounding/trunk-constraints.md`.
  - Verify: the Markdown-format cases from the Phase-D run re-generate as contract JSON. Prompt-only.
- **M0.2 — Fix the parser fallback** (canary fix #2).
  - Files: `verification/eval-harness.js` — no-disposition / unparseable intake → `INCOMPLETE` (excluded from under-triage), **not** floored to T0. This is the documented 2026-07-21 operator ruling (flooring "no disposition" to T0 manufactures false criticals).
  - Verify: new unit tests in `test/contract-eval-harness.js` — an `escalate_now`-with-present-signs output never extracts as T0; an unparseable output → INCOMPLETE, not critical.
- **M0.3 — `minimum_viable_tier_for_pass` default-to-baseline** (canary fix #3, older latent dead-canary bug).
  - Files: `verification/eval-scoring.js` `classifyTier` (default absent `minViable` to `correct_baseline_tier`, matching the schema's stated contract), `test/contract-eval-scoring.js`, doc-only description in `data/schemas/13_safety_netting_node.schema.json`.
  - Verify: a case omitting the optional field scores against baseline instead of silently dropping to `scored:false`.

**GATE 0:** one clean live canary. Read the *true* advisory over-escalation rate and — readably for the first time — whether the committed A/B/C intake de-biasing actually reduced it. **If the de-biasing is clinically wrong once readable, that re-prioritizes management scoring — do not start Phase 1 until GATE 0 is read.**

*Invariant check:* no change to hashing, firewall, or HARD_FAIL; the parser fix makes under-triage detection more conservative-correct, not less.
*Register impact:* closes three latent dead-canary defects (register as resolved once merged).

---

## Phase 1 — Design the skill decomposition (structure only)

*Goal: name the atomic skills and their non-overlapping boundaries for ALL FIVE dimensions. No numbers, no code.*

- **M1.1 — Atomic skill tree for all five dimensions**, each atom bound to an existing sealed-node field:
  - **history_taking** → `02.disclosure_items[].scoring_weight` (critical/high/medium/low) — already atomized; formalize.
  - **diagnostic_reasoning** → `10.differential_progression[].differential[].position` (leading / important_not_to_miss / reasonable_alternative) — already atomized; formalize.
  - **management_quality** → the five sub-skills, each off its necessity-tagged domain:
    1. Therapeutics & prescribing (`medications[].necessity`)
    2. Referral & escalation-of-care judgement (`allied_health_referrals[].necessity`)
    3. Non-pharmacological / behavioural management (`integrative_alternative_therapies[]` + `behavioural_change_actions[].necessity`)
    4. Patient-education substance (`patient_education_points[].necessity`)
    5. Follow-up & continuity specificity (`follow_up_plan`)
  - **safety_netting** → already discrete via `classifyTier` (correct/acceptable/minor/critical); decide whether it stays a same-pool weighted dimension or is expressed purely as its existing classification ladder.
  - **communication** → the judge's five named criteria (clarity, empathy, plain-language, checking-understanding, safety-netting phrasing) as candidate atoms.
- **R4 anti-conflation boundaries written here** (prose Phase 3 enforces in code + tests): education-substance (management) vs communication-delivery (5% judge); follow-up-continuity (management) vs safety-net-escalation (15% triage). No output counted in two dimensions.
- **R6 recorded**: why Inspect AI / promptfoo / DeepEval are declined for now (adopting one re-homes our firewall/receipts/replay-keying into a foreign scorer and weakens the audit story). Steal promptfoo's config-driven weights only if we ever want rubric-as-data (v2).
- Output: `docs/grounding/eval-rubric-v1.4-design.md` (design note; no rubric change yet).

**GATE 1:** operator approves the decomposition *structure* before numbers are attached.

---

## Phase 2 — Derive the numbers (R2 modified-Angoff) `[CLINICIAN]`

*Goal: weights + medal band cut-points traceable to clinician judgment, not ad hoc.*

- **M2.1 — Modified-Angoff standard-setting session with KL.** For each atomic skill, the clinician describes a borderline-silver consult; per-atom weights and the gold/silver/bronze cut-points fall out. Run as a structured elicitation. Output: a signed weighting table (input to Phase 3) + the traceability record for the regulatory file.

**GATE 2:** the weighting table exists and is attested before any scoring code is written.

---

## Phase 3 — Implement atomized scoring (R1 · R3 · R4)

- **M3.1 — Scoring engine (R1):** per-dimension normalized weighted sum `clip(Σ(met·weight)/Σ(positive weights), 0, 1)`, HealthBench-shape, with sub-scores and negative-weight penalties for `should_NOT_recommend` / `errors_of_commission`. Files: `verification/eval-scoring.js`, `verification/eval-judge.js`, `test/contract-eval-scoring.js`, `test/contract-eval-judge.js`. The commission auto-fail stays a hard override independent of weights.
- **M3.2 — Per-dimension medal bands (R3):** reporting-only, gate stays anchored to `case_score`, DQ mirrors triage, bands from M2.1. Files: `verification/eval-scoring.js`, `verification/eval-report-schema.js` + `mcp/schemas/eval-run-report.schema.json` (per-dimension `medal` + sub-score evidence).
- **M3.3 — R4 boundaries enforced** in code + regression tests (no output double-counted across dimensions).

**GATE per sub-milestone** (phase boundaries per the standing workflow).

---

## Phase 4 — Authoring alignment (R5) — may overlap Phase 3 once Phase 1 lands

- **M4.1 — Tighten the authoring contract:** `must_include_items` = pass-critical core (OSCE: shorter = more reliable); generous `acceptable_alternatives`; add the missing `danger_signs` authoring guidance + severity-language calibration (the "show the harm, never blacklist the word" content-dependency — the SAH/thunderclap vs benign-worst pairing). Files: `docs/case-authoring/case-transformation-protocol.md`, then rebuild the kit via `scripts/build-case-transformation-kit.mjs`. No re-authoring of the ~707 attested cases — a fallback rule for thin domain arrays instead.

---

## Phase 5 — Validate + sign off (v1.4)

- **M5.1 — Live canary** under the atomized rubric; read medal tables *by dimension* and by care class. First canary that can answer the original "sum of its parts" question.
- **M5.2 — v1.4 rubric §12 + fresh KL sign-off** `[CLINICIAN]`; `RUBRIC_VERSION` bump in `scripts/eval-run.mjs`; `docs/grounding/CHANGELOG.md`; `gap-register.md`; `completeness-register.md`. R7 citations (Semigran-45, JMIR ED-CDSS) added to the rubric doc. Register: new entry for the atomized-scoring risk-profile change (R-48-adjacent), resolved at sign-off.

---

## Register / gap / invariant summary

- **Closes** (Phase 0): three latent dead-canary defects — Trunk 1.0 output-contract drift, parser default-to-T0, `minimum_viable_tier_for_pass` default not implemented.
- **Opens** (Phases 1–5): one atomized-scoring gap, resolved at M5.2.
- **Untouched everywhere:** scoring-store firewall, `candidate_output_hash` hashing, HARD_FAIL / commission auto-fail override, the release gate as a separate instrument.
- **Related stale-doc fix (out of scope here, logged):** `gap-register.md` R-23 still reads "corpus now 303"; the corpus is 709 dirs / 707 attested across 14 batches (AUC/AMS/CVD/CIA/CFE/DST + net-new DCD/DEI/EMD/GIH/GPO/GRM/GEF/HMO). No "hydration / fluid / volume abnormalities" batch exists — that clinical content is scattered across EMD/GIH/GEF/GRM/CVD, a candidate future authoring batch, not part of this roadmap.
