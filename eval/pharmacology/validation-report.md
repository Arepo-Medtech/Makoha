# FL-30 Step 5 — Pharmacology Staging Validation Report

- Case set: `eval/pharmacology/validation-cases.json` (v0.1.0) — 20 cases
- Result: **20/20 passed**, 0 failed
- Adversarial fail-safe: **8/8**
- A/B parity (all contract-valid): **true**
- Gate integrity (no human-review-gate bypass): **true**
- Licensed-feed stub unavailable (fail-closed): **true**
- Source: datastore_backed=true, receipt mode=mock (dev/unvalidated — never 'live' until this report is signed)
- Coverage by category: {"pass":1,"allergy":1,"interaction":2,"renal":2,"scheduling":2,"nti":4,"adversarial":8}

| Case | Category | Expected | Datastore | Mock (A/B) | Result |
|---|---|---|---|---|---|
| rep-clean-pass | pass | PASS | PASS | PASS | ✅ |
| rep-allergy-xreact | allergy | HARD_FAIL | HARD_FAIL | HARD_FAIL | ✅ |
| rep-interaction-critical | interaction | HARD_FAIL | HARD_FAIL | HARD_FAIL | ✅ |
| rep-interaction-moderate | interaction | WARN | WARN | WARN | ✅ |
| rep-renal-contra | renal | HARD_FAIL | HARD_FAIL | HARD_FAIL | ✅ |
| rep-renal-adjust | renal | WARN | WARN | WARN | ✅ |
| rep-s8-no-pdmp | scheduling | HARD_FAIL | HARD_FAIL | BLOCKED_NO_PROOF | ✅ |
| rep-s8-pdmp-ok | scheduling | PASS | PASS | PASS | ✅ |
| rep-nti-no-monitoring | nti | HARD_FAIL | HARD_FAIL | BLOCKED_NO_PROOF | ✅ |
| rep-nti-monitoring-ok | nti | PASS | PASS | BLOCKED_NO_PROOF | ✅ |
| rep-nti-warfarin-no-monitoring | nti | HARD_FAIL | HARD_FAIL | PASS | ✅ |
| rep-nti-warfarin-monitoring-ok | nti | PASS | PASS | PASS | ✅ |
| adv-unknown-drug | adversarial | BLOCKED_NO_PROOF | BLOCKED_NO_PROOF | BLOCKED_NO_PROOF | ✅ |
| adv-missing-facts | adversarial | BLOCKED_NO_PROOF | BLOCKED_NO_PROOF | BLOCKED_NO_PROOF | ✅ |
| adv-dialysis-anuric | adversarial | HARD_FAIL | HARD_FAIL | HARD_FAIL | ✅ |
| adv-polypharmacy | adversarial | HARD_FAIL | HARD_FAIL | HARD_FAIL | ✅ |
| adv-nti-plus-interaction | adversarial | HARD_FAIL | HARD_FAIL | HARD_FAIL | ✅ |
| adv-contradictory-schedule | adversarial | HARD_FAIL | HARD_FAIL | HARD_FAIL | ✅ |
| adv-paediatric | adversarial | HARD_FAIL | HARD_FAIL | HARD_FAIL | ✅ |
| adv-unknown-age | adversarial | BLOCKED_NO_PROOF | BLOCKED_NO_PROOF | BLOCKED_NO_PROOF | ✅ |

## Clinical sign-off

- [ ] Reviewed by registered pharmacist (KL): the outcomes above are clinically correct and every adversarial scenario fails safe to human escalation.
- [ ] Confirmed no human-review gate is bypassed (dose guidance only on PASS/WARN).
- Note: patient-facing use remains BLOCKED pending regulatory (TGA) sign-off, live PBS pull, live CDS vendor (B4), and the Clinician Verification Portal.

_Signed: ______________________  Date: ___________
