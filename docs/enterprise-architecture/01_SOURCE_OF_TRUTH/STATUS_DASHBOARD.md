# Makoha Status Dashboard

**As at:** 21 July 2026

## Phase board

| Phase | Restart status | Evidence carried forward | Gate status |
|---|---|---|---|
| P1 | 7/7 planning outputs | Wedge, ICP, mixed model/moat, positioning/authority, Pharmacy 777 offer, regulated SaMD path and costed 12-month scenario plan | PLANNING PASS COMPLETE — EVIDENCE GATE NOT PASSED |
| P2 | 1/7 restart routines | P2.1 reconciled architecture at `4920d0c`; advanced staging, verification, evaluation and evidence infrastructure | IN PROGRESS — RELEASE BLOCKED |
| P3 | 0/11 | Legacy pilot and sales materials only | NOT STARTED |
| P4 | 0/8 | Some technical controls exist; enterprise operating controls not re-audited | NOT STARTED |
| P5 | 0/9 | Entity and legacy DD templates exist | NOT STARTED |

## Open hard gates

| Gate | Current state | Required evidence |
|---|---|---|
| Regulatory classification | DECIDED — ATTESTATION OPEN | Regulated SaMD base case; Triage provisional Class III, Professional Assurance provisional Class IIb; counsel memorandum required |
| Patient eligibility | BLOCKED | All release blockers, evaluation thresholds and operator authorisation green |
| Portal identity | INPUT-GATED | IdP protocol/vendor decision, credentials and verified integration |
| Live evaluation | IN PROGRESS/UNVERIFIED | Multi-turn run, semantic rubric and blocking threshold evidence |
| Pharmacology production path | PARTIAL | Remaining live AU data inputs, regulatory decision and live-receipt controls |
| Investigation authority | PARTIAL | Authoritative live source, coverage and regulatory completion |

## Top gaps

1. R-M001 — Regulatory counsel opinion and classification decision; inherited exemption thesis withdrawn.
2. R-M002 — Verified financial position and runway.
3. R-M003 — Signed design partner and evidence protocol.
4. R-M011 — Enterprise QMS and design-history uplift.
5. R-M013 — Direct ICP and customer-language validation.
6. R-M014 — Pharmacy 777 Toowoomba ownership/counterparty is TBC; not a discovery blocker, but a hard execution/data/site gate.
7. R-M015 — Commercial pricing, COGS, sales cycle and unit economics remain unvalidated.
8. R-M016 — No executed data-rights basis or demonstrated longitudinal learning effect.
9. R-M017 — Patient billing and doctor-capacity service model requires legal, clinical, financial and consumer validation before any live paid service.
10. R-M018 — Detailed founder biography requires verified credentials, clinical history and origin-story evidence.
11. R-M019 — Formal medical, pharmacy, safety, quality/regulatory and consumer authority appointments are absent.
12. R-M020 — P1.7 costs, hiring model, revenue and financing envelope remain unquoted/unapproved assumptions.
13. R-M021 — FL-40 evaluation gate is armed but inert; authoritative Claude and MedGemma fixtures are absent.
14. R-M022 — Live-backend provenance remediation is locally verified but not merged to repository main.
15. R-M023 — The 707-case certification manifest is locally verified but not merged to repository main.

## Next action

Apply and review `outputs/p2_1/FL40_authoritative_eval_hardening.patch` against current repository main, then pass hosted Node 20 CI. Do not dispatch the authoritative evaluation; protected environment and MedGemma connectivity verification follow after merge.
