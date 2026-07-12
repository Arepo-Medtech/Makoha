# LIVE_PLAN.md — Final Push: Public Release / Live Execution Master Plan

**Status:** ⛳ **APPROVED 2026-07-11; Track-A engineering largely EXECUTED** (reconciled 2026-07-13): L1+L2 (PR #36), L3+L4 (PR #37), L10 (PR #38), L11 (PR #39), plus §9-checklist engineering (aws-sm secrets #40/#44, Sonnet-5 default #41, App Runner scaffolding #42, `smoke:llm` #43, S3 Object Lock WORM #45). Genuinely open: L5–L9 + L13 (operator inputs), L12 consent capture (UNBUILT), L14 soak/promotion, L15 messaging-geo. ⚠️ The "§9 A1/B1/B2/B3" tags in commits #40–#45 refer to `.planning/OPERATOR-HANDBACK-CHECKLIST.md` (the operator-facing expansion of this plan's §9), not to this file's §9 numbering. Current state: the registers. Original status line for the record: Phase-2 master plan (bootstrap-mode). **No code until per-workstream approval.**
**Author role:** Breath-Ezy AI Architect.
**Baseline:** `main @ c5f889a` (PRs #1–#35 merged; PPP-TTT Step 1 landed 2026-07-11).
**Source anchors:** `CLAUDE.md` (prime directive, invariants, release blockers, regulatory posture), `docs/grounding/completeness-register.md` (15 open items + this plan's new findings), `docs/grounding/gap-register.md`, `.planning/{ARCH_PLAN,FLOW_PLAN,M9-M14-MASTER-PLAN,PPP-TTT-PLAN}.md`, `docs/HANDOFF-STATE.md`, `data/scope-registry.json` v1.3.0 (`scope_activation_gate`, `service_types`, tiers).

> **Not legal, clinical, or regulatory advice.** This plan sequences engineering work and *surfaces* the clinical/regulatory decisions public release entails. Classification, attestation, and go-live authority remain the operator's and qualified specialists'.

---

## 0. The honest one-paragraph summary

"Public release" is not one build — it is **four release blockers, ten live connections/attestations, and a product layer that does not exist yet**. The grounding/verification core (pipeline, verifier, detectors, PPP-TTT, firewalls, ledgers, gates) is built, tested, and fail-closed; what is missing is everything *around* it: the Clinician Verification Portal UI + WORM storage (the last big pure-engineering blocker), a live LLM generation adapter (Step 4 is deliberately stubbed), a patient/pharmacist product surface, a deployment/runtime/secrets/observability story, and the operator-supplied inputs no agent can self-serve — pharmacology vendor contract, NCTS/RF2 terminology licence, clinical sign-offs (knowledge datasets, lab ranges, MIRAGE corpus, case set), and the TGA SaMD classification decision. This plan sequences all of it in dependency order, each workstream individually plan-gated, with mock→staging→production promotion and the evaluation gates as the final arbiter. **Nothing goes patient-facing until all four blockers are green and the operator explicitly authorises the release.**

## 0.1 Phase-0 reconciliation (scan of 2026-07-11, this session)

Open register items this plan must close or explicitly defer (risk-ordered):
`pharmacology-server-unbuilt` (PARTIAL, Critical, pf:true — vendor pending) · `investigation-parser-unbuilt` (PARTIAL, Critical, pf:true — ranges/live source) · `clinician-verification-portal-unbuilt` (PARTIAL, Critical, pf:true — UI/workflow + WORM record storage) · `terminology-contract-incomplete` (High, pf:true) · `knowledge-datasets-provisional` (High, pf:true) · `lab-reference-ranges-provisional` (High) · `harvest-confirm-licences-pending` (#18, #5) · `fhir-live-adapter` + `au-record-sources-ingest` (R-28) · `terminology-live-adapter` (AU content) · `content-store-production-gated` · `aucdi-r3-valueset-binding-unbuilt` · `pipeline-routing-retrieval-stub` · `case-set-underpopulated` (distribution) · `reference-case-manifest-missing` · `repo-digest-sealed-node-carveout` · `tooluniverse-runtime-input-gated` · `synthea-generators-input-gated` · MIRAGE corpus attestation (§7) · C22 AU Core target decision.

**NEW findings this scan opens (to be registered in the same phase as approval of this plan):**

| id | state | risk | what |
|---|---|---|---|
| `live-llm-generation-adapter-unbuilt` | UNBUILT | Critical (pf:true) | Step 4 generation is stub agents only; no gated live-LLM client (context-packet-only input, output→verifier, no parametric leakage) exists |
| `product-surface-unbuilt` | UNBUILT | Critical (pf:true) | No patient/pharmacist-facing app or API layer anywhere in the tree |
| `deployment-runtime-unbuilt` | UNBUILT | High | No Dockerfile/IaC/deploy pipeline/process entrypoint; CI is test-only |
| `secrets-manager-integration-unbuilt` | UNBUILT | High | Env templates assume deploy-time injection; no adapter, no rotation story |
| `observability-metrics-unbuilt` | PARTIAL | High | Structured logs partial; charter-required metrics (pass/fail rate, HARD_FAIL count, BLOCKED_NO_PROOF rate, **alarmed under-triage**) unbuilt |
| `ci-secret-scanning-sast-missing` | PARTIAL | High | Charter requires secret-scanning + SAST in CI **before any production path** |
| `worm-substrate-adapter-unbuilt` | UNBUILT | High | M8 seam exists (`registerAuditSubstrate`); no production WORM adapter (both ledgers + gate records) |
| `consent-capture-unbuilt` | UNBUILT | High | "No persistence beyond session without explicit consent" — no consent capture/record mechanism |
| `sequencer-default-off` | PARTIAL | Medium | `HEYDOC_SEQUENCER` default OFF; live multi-trunk consults need graduation + PPP-TTT Step-2 hook |
| `ppp-ttt-ledger-wiring` | PARTIAL | Medium | PPP-TTT ledger is library-only; not appended by report writers |
| `regulatory-classification-undecided` | UNBUILT | Critical (org) | TGA SaMD classification / `regulatory_confirmation_exempt_cdss` unresolved — a **hard precondition of public release**, owned by the operator + specialists |

**No DEAD_END or BLIND_STUB sits on the plan's path** (verified: every stub named above degrades to BLOCKED_NO_PROOF / refuses; nothing presents mock as live).

---

## 1. What "live" means here (product definition, from the attested registry)

The releasable product is the **Phase-0 pharmacist-scoped telehealth consult assistant**: the nine-trunk grounded consult loop drafting **suggestions for pharmacist review & sign-off** across the 21 ACTIVE scope areas (`service_types`: TREAT_PRESCRIBE, VACCINATE, SUPPLY, SCREEN_REFER, CESSATION_AOD, NALOXONE_SUPPLY), with PPP-TTT graded triage, mandatory human sign-off through the Clinician Verification Portal, and emergencies escalated (never managed). OFF_FUTURE areas stay off until their per-condition `scope_activation_gate` passes (jurisdictional authority + pharmacist training + regulatory confirmation + MIRAGE corpus attestation for that condition).

**Immutable posture (re-stated, enforced mechanically, never weakened by this plan):** clinical decision support, not a practitioner; human-in-the-loop mandatory; the four patient-facing blockers must be green; the four-part patient-eligibility precondition holds per retrieval path; hashing is the record; fail-closed everywhere; scoring-store firewall absolute; mock never presented as live; under-triage outranks over-triage; no autonomous diagnosis/prescription ever.

---

## 2. Dependency topology (what unblocks what)

```
                         ┌──────────────────────────────────────────────┐
   L1 Portal UI + WORM ──┤ blocker #2 — pure engineering, START NOW     │
                         └──────────────┬───────────────────────────────┘
   L2 Runtime/Deploy/Secrets/Obs ───────┤ (parallel with L1)
   L3 Live-LLM Step-4 adapter ──────────┤ (parallel; mock rollback)
   L4 Sequencer graduation + wiring ────┤ (after L3)
                                        ▼
   L5 Terminology AU content ◄─ OPERATOR: NCTS licence / RF2 self-host + C22 decision
   L6 Pharmacology vendor    ◄─ OPERATOR: vendor contract + credentials (M9)
   L7 FHIR live + parser sign-off ◄─ OPERATOR: endpoint + range attestation (M10/R-28)
   L8 Knowledge sign-off     ◄─ OPERATOR: clinical attestation (M12)
   L9 MIRAGE corpus build→attest ◄─ OPERATOR: clinical attestation (§7)
   L10 Case set 60/30/10 + eval hard-gate
                                        ▼
   L11 Product surface (patient + pharmacist apps) ─ needs L1–L4; content gated by L5–L9
   L12 Consent + privacy + security hardening (pen-test, SAST, APP mapping)
   L13 Regulatory package ◄─ OPERATOR + specialists: TGA classification, 62304/14971 artifacts
                                        ▼
   L14 Staging soak → evaluation gates → GO/NO-GO → production (one-way, operator-authorised)
   (L15 messaging-geo live — LAST, after Portal COMPLETE, per M13)
```

Parallel tracks: **A (engineering, no external input): L1–L4, L9-corpus-authoring, L10, L12-engineering.** **B (operator-input-gated): L5–L8, L9-attestation, L13.** Track A proceeds immediately upon per-workstream approval; Track B items each start the day their input lands.

---

## 3. Workstreams (each = its own Phase 1→4 cycle with its own Phase-2 GATE)

### L1 — Clinician Verification Portal: UI/workflow + durable WORM gate records *(Critical, blocker #2 — largest pure-engineering build)*
**Objective.** A pharmacist/clinician reviews the exact hashed candidate output + evidence tree + history summary + PPP-TTT record, then approves/rejects/amends; the decision becomes a durable, tamper-evident `VerificationGateRecord` bound to `candidate_output_hash`; `releaseToPatient()` (frozen) consumes it unchanged.
**Builds.** `portal/server/` (thin Node HTTP app — stack addition flagged: no framework beyond `node:http` or a minimal, licence-cleared one, Phase-2 justified); reviewer UI (server-rendered, no SPA build step — matches "no build step" stack rule); review workspace assembling: report.json fields, evidence_tree, `history_summary`, `ppp_ttt`/`abcde_record`, receipts, conflict-audit signal (display-only). Durable gate-record store on the **same substrate seam as L2-WORM** (append-only; dev=local JSONL, prod=WORM adapter). Wire `ppp-ttt-ledger` appends into the report writers here (closes `ppp-ttt-ledger-wiring`).
**Contracts.** `verification-portal-decision.schema.json` (existing, unchanged) + new `portal-review-bundle.schema.json` (what the reviewer is shown — so what was reviewed is itself hashed and auditable).
**Frozen.** `portal/verification-gate.js`, `verifier.js`, `audit-store.js` stay byte-unchanged (CI pin from PPP-TTT already enforces).
**Verification.** Contract tests: decision→record→release round-trip on exact hash; amended-output re-hash; dev-mode refuses; record store chain-verifies; UI smoke via HTTP contract test. All existing 40 suites green.
**Closes:** `clinician-verification-portal-unbuilt` (→ COMPLETE once WORM adapter from L2 is configured), `ppp-ttt-ledger-wiring`. **Operator input:** none to build; sign-off workflow policy review before live.

### L2 — Runtime, deployment, secrets, observability, WORM *(High — makes "live" physically possible)*
**Builds.** (a) Process entrypoints + Dockerfile(s) + compose for the server set; (b) three-environment config (mock/staging/production) driven ONLY by deploy-injected env (`HEYDOC_MODE_DEFAULT` mapping already enforced by `mode.js`); (c) secrets-manager adapter (interface + one concrete backend, operator-chosen; `example.invalid` placeholders stay in-repo; agent never handles real values); (d) **WORM substrate adapter** implementing the four-op `registerAuditSubstrate` interface (e.g. S3 Object Lock — backend is an operator/regulatory choice this plan surfaces, not decides) for BOTH ledgers + portal gate records + `HEYDOC_AUDIT_RETENTION` set (minimum-keep); (e) observability: one correlation ID threaded through all five steps + receipts (exists in-run; add cross-service propagation), metrics endpoints/counters for pipeline pass/fail, HARD_FAIL count, BLOCKED_NO_PROOF rate, **alarmed critical under-triage**; (f) CI additions: secret-scanning + SAST + `npm audit` already blocking; deploy job to staging only.
**Verification.** `verify:rehash --integrity` against the WORM adapter (dev-mode fake + staging real); mode-normaliser contract already blocks mock-proof outside dev; alarm fire-drill test.
**Closes:** `deployment-runtime-unbuilt`, `secrets-manager-integration-unbuilt`, `worm-substrate-adapter-unbuilt`, `observability-metrics-unbuilt`, `ci-secret-scanning-sast-missing`, `content-store-production-gated` (live runs never persist content — already enforced; production config asserts it). **Operator input:** cloud account + WORM backend choice + retention period.

### L3 — Live LLM generation adapter (Step 4) *(Critical — the model finally enters the loop)*
**Objective.** Replace stub generation with a gated LLM client: input = the validated ContextPacket ONLY (never raw case/patient data, never scoring content — mechanically asserted); output = candidate text handed straight to hash+verify; retries/timeouts fail closed to BLOCKED_NO_PROOF; the adapter records model id/version + prompt hash in the audit channel (medicolegal reproducibility).
**Builds.** `integration/llm-adapter.js` + per-trunk invocation using the nine trunk prompts; provider = Claude API (new dependency: `@anthropic-ai/sdk` — Phase-2 justified, licence-cleared, lockfile-pinned); key via L2 secrets manager; **mock remains default + rollback** (`HEYDOC_LLM_LIVE` input-gated).
**Verification.** Contract test with a fake transport: packet-only input assertion (spy: no other data reachable), output→verifier round-trip, fail-closed on timeout/refusal/malformed; live smoke behind env flag in staging only. Trunk contract keys still validated per `trunk-constraints.md`.
**Closes:** `live-llm-generation-adapter-unbuilt`; narrows `pipeline-routing-retrieval-stub` (real routing from Trunk 1.0 output replaces the fixed map — same workstream).

### L4 — Sequencer graduation + PPP-TTT Step 2 *(Medium — the outer loop goes default-ON)*
**Builds.** Flip `HEYDOC_SEQUENCER` default ON behind a staged rollout (env still overrides); ADD (additively) HALT RULE 5 reading `ppp_ttt.tier === "STOP"` structurally (PPP-TTT plan §3.4/Step 2); real Trunk 1.0 routing_plan drives the walk (with L3).
**Verification.** `contract-sequencer.js` extended: rule-5 halt; full 9-trunk sequenced run on stubs AND on the L3 mock adapter; all halts still unconditional.
**Closes:** `sequencer-default-off`; PPP-TTT Step 2.

### L5 — Terminology AU content + C22 decision *(High, pf:true — OPERATOR: NCTS licence or self-hosted Ontoserver + RF2)*
RF2 is deploy-injected, NEVER committed (gitignore already guards). Bind ICD-10-AM / LOINC / PBS-AMT (closes R-20 `terminology-contract-incomplete`); AU Core value-set membership + FHIRPath invariants via live NCTS (closes `aucdi-r3-valueset-binding-unbuilt`); **C22**: operator/regulatory picks the AU Core conformance target (0.3.0 pin vs current) — plan executes whichever is ruled. Staging validation: `cases:verify-codes` against live terminology; mock remains rollback.

### L6 — Pharmacology live vendor (M9) *(Critical, pf:true — OPERATOR: vendor contract + credentials)*
Per the standing Appendix-A worked plan: connect MIMS-AU-or-equivalent behind the existing engine contract in **staging, synthetic patients only**; NTI/interaction/renal/scheduling/PDMP datasets validated against the case set; HARD_FAIL semantics re-proven on live data; paediatric still flags-for-review, never doses. Closes `pharmacology-server-unbuilt` → COMPLETE.

### L7 — FHIR live + investigation-parser sign-off (M10/R-28) *(Critical+High — OPERATOR: EHR/lab endpoint + range attestation)*
Live fhir-broker endpoint (`HEYDOC_FHIR_MCP_ENDPOINT`) + AU provider onboarding for record-sources; authoritative reference-range sign-off replaces `lab-reference-ranges-provisional`; Observation→parser path re-validated (raw numbers still never reach a packet). Closes `investigation-parser-unbuilt`, `fhir-live-adapter`, `au-record-sources-ingest`.

### L8 — Knowledge dataset clinical sign-off (M12) *(High, pf:true — OPERATOR: attestation)*
Benign registry / Axis-B templates / red-flag bank reviewed + attested (versioned, checksummed). Closes `knowledge-datasets-provisional`.

### L9 — MIRAGE corpus: build out + attest (§7) *(High — authoring is engineering; attestation is OPERATOR)*
Grow corpus v0.1.0 (23 items) to full partition coverage per `MIRAGE-CORPUS-SPEC` across the ACTIVE areas; then clinical attestation flips the gate from measuring to GATING. With H3+H7 already built, this is precondition #3 of the four-part patient-eligibility test; per-condition attestation also feeds each `scope_activation_gate`.

### L10 — Case set to design distribution + eval as hard release gate *(Medium)*
Top-up straightforward/complex cases toward 60/30/10 (now 48/45/7; ≥45 minimum already met), all clinician-attested via the existing kit/ingest path; keep `eval:cases` blocking; add the release-gate assertion of the evaluation framework thresholds: **case pass ≥0.70; ≥80% of cases passing; ZERO critical under-triage; ≥90% verification compliance** (under-triage weighted 3×). Closes `case-set-underpopulated`, `reference-case-manifest-missing` (backfill manifest or record exemption).

### L11 — Product surface: patient app + pharmacist console *(Critical, pf:true — the actual product)*
**Patient side:** consult intake/chat UI over the sequenced pipeline; PPP-TTT **Step 3** E-PP bounded-choice screen + plain-language caveats/safety-netting ("No diagnosis / No decisions" surfaced verbatim); `interpreter_required` → escalation; under-18 → in-person review routing; emergency (STOP/T5) → 000-escalation screen, non-overridable. **Pharmacist side:** the L1 portal IS the console (queue, review, sign-off). **Every patient-visible output flows through `releaseToPatient()` — no side channel.** Stack decision (minimal server-rendered vs framework) is Phase-2-gated inside this workstream. Nothing here weakens a gate: the app is a *view* over the gated pipeline.
**Closes:** `product-surface-unbuilt`; PPP-TTT Step 3.

### L12 — Consent, privacy, security hardening *(High)*
Consent capture + record (session-persistence consent, MHR/data-sharing consents per omnibus Consent conventions) — closes `consent-capture-unbuilt`; Privacy Act 1988 / APP mapping doc; data-flow register; penetration test (external, operator-procured); dependency/licence final sweep (`licence:check` stays blocking; resolve or permanently REFERENCE #18/#5 — closes `harvest-confirm-licences-pending`); ToolUniverse runtime decision: enable per H5 egress policy or explicitly defer at release (default: **deferred OFF** — closes/defers `tooluniverse-runtime-input-gated`); `repo-digest-sealed-node-carveout` re-verified + digest-shaped fixture added to the allow-list test.

### L13 — Regulatory package *(Critical precondition of PUBLIC release — OPERATOR + specialists)*
TGA SaMD classification ruling (or documented CDSS exemption — the registry's `regulatory_confirmation_exempt_cdss` gate condition); IEC 62304 lifecycle artifacts (this register/gap/CHANGELOG chain is the traceability spine — export it); ISO 14971 risk file (FMEA F-rows formalised); clinical evaluation report from L10/L14 evidence; jurisdiction + pharmacist-training confirmations per `scope_activation_gate`. **The agent prepares the evidence pack; it does not decide classification.** Closes `regulatory-classification-undecided`.

### L14 — Staging soak → GO/NO-GO → production *(the one-way promotion)*
Full-stack staging (L1–L12 assembled, live vendors from L5–L8, synthetic patients only) runs the complete case set through the REAL stack (live LLM, live terminology, live pharmacology, sequencer ON); evaluation gates (L10 thresholds) + MIRAGE gates + `verify:rehash --integrity` on WORM + alarm drills must all pass; a written GO/NO-GO checklist (every blocker, every gate, every attestation, signed by the operator) is the release record. Production promotion is a **plan-gated, operator-executed** step; rollback = mock/staging config, contract-frozen. **L15** messaging-geo live connect happens only after Portal COMPLETE (M13), and last.

---

## 4. Default-settings matrix at release

| Setting | dev | staging | production |
|---|---|---|---|
| `HEYDOC_MODE_DEFAULT` | mock | staging→live (mock proof BLOCKED) | production→live |
| `HEYDOC_SEQUENCER` | on (post-L4) | on | on |
| `HEYDOC_LLM_LIVE` | off (stub) | on (staging keys) | on |
| Audit substrate | local | WORM | WORM (retention set) |
| Content store | synthetic-only | synthetic-only | **never persists** (enforced) |
| Patients | synthetic | synthetic ONLY | real, consented, pharmacist-signed |
| Patient-eligibility | false | false | per-path, only after four-part precondition + L14 GO |

## 5. Verification per milestone (summary)
Every workstream ships contract tests wired into `npm test` + keeps all seven existing gates green; L1/L2 add rehash-on-WORM + alarm drills; L3/L4 add packet-only + rule-5 halt proofs; L5–L8 validate against the synthetic case set before any production consideration; L10/L14 enforce the evaluation thresholds as blocking. The PPP-TTT byte-unchanged pin (verifier/gate/audit-store) holds through every workstream — any plan needing to touch those three files must come back to you explicitly and re-pin under approval.

## 6. Invariant check
Every workstream above preserves all hard limits by construction: no autonomous diagnosis/prescription (portal sign-off is the product's spine; L3 output goes only to the verifier); no fabricated codes/facts (L5 strengthens binding); no HARD_FAIL override (L6 re-proves on live data); no raw labs (L7 keeps the parser in line); scoring-store firewall untouched (no workstream reads nodes 10–13; L12 re-verifies the carve-out); hashing preserved and extended (review-bundle hash, model/prompt hash); fail-safe defaults everywhere; mock never presented as live (mode matrix above). **No workstream weakens a gate to meet a date — where a conflict appears, the safety rule wins and is surfaced.**

## 7. New dependencies (named now, adopted only at their workstream's gate)
`@anthropic-ai/sdk` (L3); a WORM storage SDK (L2, backend per operator choice); optionally one minimal HTTP/UI helper (L1/L11, only if node:http proves insufficient — justified then, not now); an SAST + secret-scanning CI action (L2). Everything else stays Node 20 / ESM / MCP SDK ^1 / zod ^3 / ajv ^8.

## 8. Register & gap-register impact
On approval of this plan: open the 11 new items (§0.1 table) in the completeness register; promote the High/Critical ones (`live-llm-generation-adapter-unbuilt`, `product-surface-unbuilt`, `deployment-runtime-unbuilt`, `secrets-manager-integration-unbuilt`, `worm-substrate-adapter-unbuilt`, `observability-metrics-unbuilt`, `ci-secret-scanning-sast-missing`, `consent-capture-unbuilt`, `regulatory-classification-undecided`) one-way into the gap-register; each workstream's Phase 4 moves its items to resolved. The gap-register build order is superseded by §2 of this plan for the remaining work (it extends, not contradicts, Part D.11).

## 9. Operator input checklist (the critical path YOU own — everything else can start now)
1. **Approve this LIVE_PLAN** (workstream-by-workstream approval also works — L1 and L2 are the ones to unblock first).
2. Pharmacology vendor contract + credentials → L6.
3. NCTS licence (or self-host RF2 + Ontoserver decision) + **C22 AU Core target ruling** → L5.
4. FHIR/lab endpoint + provider onboarding → L7.
5. Clinical attestations: knowledge datasets (L8), lab ranges (L7), MIRAGE corpus (L9), new cases (L10).
6. Cloud account + WORM backend + retention period → L2.
7. TGA classification / CDSS-exemption ruling + jurisdiction & pharmacist-training confirmations → L13.
8. Final GO/NO-GO signature → L14.

## 10. What this plan explicitly does NOT do
No gate weakened, no invariant relaxed, no scoring-store access, no real patient data before production GO, no paediatric dosing, no autonomous anything. If any workstream discovers a conflict between speed and a safety rule, the workstream stops and the conflict comes to you.
