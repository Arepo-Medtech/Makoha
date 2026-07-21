# Breath-Ezy AI Doctor — Engineering Handoff Brief

**To:** Head of Engineering
**From:** Engineering agent (Claude Code)
**Date:** 2026-07-07
**Repo:** `Arepo-Medtech/Makoha` · default branch `main` @ `a6f42f5` (PRs #1–#32)
**Status of this work:** Mock/development build + governed external-capability harvest, all green. **Nothing is wired to a patient-facing path.**

---

## TL;DR

Since the last brief (2026-07-05, PRs #1–#17) the team completed the **entire FLOW_PLAN harvest block (H0–H7)**, all merged to `main`. This block brought **external open-source capability into the system under mechanical governance**: a licence-clearance gate that blocks CI, a pinned-commit harvest manifest, wrapped evidence and record-access servers, a **blocking retrieval trust benchmark (MIRAGE)**, a synthetic case factory, a locked-down ToolUniverse gateway, and — the capstone — **governance wiring that forces every harvested path through the existing clinician verification gate, fail-closed**. Where a licence did not clear, the code was **not** used: two components (MedRAG benchmark, conflict-optimizer) were rebuilt clean-room as first-party code with the originals demoted to methodology references.

Two things did **not** change, deliberately: the safety core (`verifier.js`, `audit-store.js`, `portal/verification-gate.js`) is **byte-unchanged** — confirmed by adversarial full-codebase review — and **nothing flipped `patient_eligible:true`**. All new capability is mock-gated, input-gated, or attestation-gated.

Treat everything here as **certifiable scaffolding, not a clinical product**. All clinical data in the repo (drug rules, lab ranges, datasets, case answer keys, benchmark corpus) is **synthetic and explicitly marked "not clinically authoritative."**

---

## What was built since the last brief (plain language)

- **Licence governance before code (H0).** A 41-row harvest manifest is now the source of truth for every external component, and a **blocking CI gate** (`licence:check`) refuses any harvested code without licence clearance and a pinned commit. Currently 0 blocks, 12 warnings on not-yet-adopted rows.
- **Patient-record spine (H1).** The FHIR broker gained a live backend adapting a pinned Apache-2.0 upstream (wso2 fhir-mcp-server), plus a **first-party clean-room SMART-on-FHIR client** with an AU provider registry. Every non-mock provider is `available:false` with secrets-manager references only — live connection is input-gated.
- **Evidence taps with a structural no-dose bar (H2).** Two MIT-licensed evidence servers were wrapped (FDA/PubMed; drug-guideline). The drug-guideline server is **advisory-only by construction**: a strict schema plus an `assertNoDose()` check plus a dedicated detector mean a dose cannot pass through it — preserving the invariant that doses come only from the pharmacology firewall. Four new **integrity detectors** (dose-leak, fabricated citation, unsupported statistic, overconfident diagnosis) compose with the verifier via a monotone AND — they can only add failures, never rescue an output — and the verifier itself was not touched.
- **A trust benchmark as a release gate, not a report (H3).** A first-party MIRAGE-style retrieval benchmark now runs as a **blocking CI job**. Hard gates: positive-retrieval rate ≥0.60, abstain-on-no-evidence = 1.00, dose-invariance = 1.00 — scored **only over clinician-attested corpus items**. The current corpus is a 23-item synthetic DRAFT (unattested), so no path can pass it yet — which is the correct fail-closed posture. An honest finding from its first run: the docs server initially failed the abstain partition; fixed at source (mock now abstains on no-match, PR #29).
- **Synthetic case factory (H4).** Synthea (plus an AU-localised fork targeting AU Core 0.3.0) and a narrative generator were wrapped behind a **two-phase shaper**: Phase A builds the presentation store with the answer-key firewall fail-closed (no diagnosis-name leaks); Phase B drafts scoring nodes that are always `clinician_reviewed:false`. Machine-generated cases cannot enter the attested set without a human clinician.
- **ToolUniverse gateway, locked down (H5).** A gateway to a 2,600-tool biomedical toolkit was built **DEFAULT-DENY**: an adversarial review found that a name-based deny-list was bypassable (auto-loader/compose/agentic tools), so the design was reworked — hard-deny executor families first, then auth, then an explicit allow-list, then enforced egress. The code executor is disabled **and proven unreachable by contract test**, and the licence gate now enforces an **RCE-fix version floor** (a downgrade fails CI). Live execution is input-gated on runtime, keys, and a deploy egress policy.
- **Conflict audit — a trust signal, not a gate (H6).** A first-party, deterministic mechanism surfaces agreement/conflict across parallel expert opinions. It is **additive-only by construction**: verdicts and the output hash pass through verbatim, and it cannot touch firewall fields — so it can never flip a pass/fail in either direction. Wiring its signal into any release decision is future, plan-gated work. The owner also ruled (D-1): **keep the existing trunk spine and verifier; no new orchestrator.**
- **Governance capstone (H7).** One fail-closed seam (`portal/harvested-release.js`) now stands between **every harvested path (H1–H5)** and any release: a frozen five-entry path allow-list, the exact output hash, and a required clinician gate record. No record → refused. Dev mode → refused even with a record. Five new governance contract suites prove it per path; the audit ledger records metadata only (PHI-free).
- **Hygiene (PRs #20–#22):** 236 cloud-sync duplicate case files removed with gitignore guards; the ingest now warns on stray non-canonical files.

## How safety is enforced (for assurance)

The non-negotiable invariants remain enforced **in code**, not prompts — and the harvest block strengthened the posture without touching the core: no fabricated codes/doses/facts; HARD_FAIL terminal and sequence-wide; no raw lab numbers to the model; mock proof blocked in live-enforced contexts; the scoring-store firewall clean at ingest, runtime, **and now the case-factory shaper**; every output hashed; and **no harvested capability can release anything without an attested clinician decision on that exact hash**. External code enters only pinned, licence-cleared, and wrapped; unclear licences are rebuilt clean-room. A retrieval path becomes patient-eligible only when **four** conditions hold — MIRAGE passed, governance-gated, corpus clinically attested, Portal UI + durable record storage built. H0–H7 delivered the first two mechanisms; the last two remain open, so **nothing is eligible today, by design**.

---

## Release-blocker status (the charter's four)

| Blocker | State |
|---|---|
| Pharmacology vendor live + validated | Engine + firewall **built (mock)**; **needs a contracted vendor (MIMS-AU/equiv) + SafeScript + credentials** (M9, input-gated). Unchanged since last brief |
| Clinician Verification Portal | Gate contract built (M5); **H7: every harvested path now wired through it, fail-closed**; **UI/review workflow + durable WORM gate-record storage remain** |
| Deterministic investigation parser | Engine **built**; reference ranges **provisional, need clinical sign-off**; needs a live EHR/FHIR source (M10, input-gated). Unchanged since last brief |
| Session-bound persistence enforced | ✅ **Enforced (M4)** — encounter-scoped, memory-only, demographic guard |

The evaluation gate remains a **blocking CI job**: 303 case directories, **301 clinician-attested and conforming** (one unreviewed factory demo case and one exempt pre-ingest reference are excluded from the attested count), 7 difficulty tiers, 3 diagnosis categories, 19 specialties. Distribution is 48/45/7 vs the 60/30/10 design target (non-blocking warning; needs source material). CI now runs **eight blocking steps**: install → audit → licence:check → 34 contract suites → verification → trunk stubs → eval:cases → bench:mirage.

---

## Decisions made since last brief — and why

- **Clean-room over convenience when a licence is unclear** — MedRAG (#20) and conflict-optimizer (#5) code was never wrapped, read-for-copying, or vendored; both were flipped to REFERENCE·methodology-only in the manifest and the capability rebuilt first-party. The licence gate mechanically refuses regressions.
- **DEFAULT-DENY after adversarial review (H5)** — a three-name deny-list was proven insufficient against a 2,620-tool catalogue containing loader/compose/agentic tools that could resurrect the executor. The gateway was reworked so denial is the default and the executor is unreachable by contract test, and the RCE-fix floor became a CI block (BLOCK 5).
- **Advisory servers get structural bars, not policy bars (H2)** — the drug-guideline tap cannot emit a dose because its schema and assertions make it impossible, keeping "doses only from the pharmacology firewall" mechanical.
- **Detectors extend the verifier without touching it (H2)** — monotone-AND composition preserves the frozen safety core while adding four fabrication/overconfidence checks.
- **The benchmark gates only attested truth (H3)** — MIRAGE scores over clinician-attested corpus items only, and never sets eligibility itself; a DRAFT corpus therefore gates nothing, which fails closed rather than open.
- **Keep the trunk spine; no new orchestrator (D-1, H6)** — the owner ruled to retain the existing trunk/verifier topology; the conflict-audit is a signal on top, additive-only by construction.
- **One governance seam rather than per-path logic (H7)** — a single fail-closed release function with a frozen path allow-list, so a future harvested path cannot ship without being added to the allow-list and its governance suite.

---

## What needs leadership / specialist input (not engineering)

1. **Vendor contracts + credentials:** MIMS-AU (or equivalent) + SafeScript (pharmacology, M9); **NCTS OAuth credentials** *or* a self-hosted Ontoserver for licensed AU terminology (M11); an EHR/MHR FHIR connection + AU provider onboarding for the record spine (M11/H1). The agent never handles credentials.
2. **Clinical + regulatory sign-off** on: lab reference ranges (M10), the benign/Axis-B/red-flag datasets (M12), the FHIR/AUCDI conformance target — and now the **MIRAGE benchmark corpus** (23 draft items need clinician attestation before the trust gate can pass anything).
3. **Licence confirmations:** the evidence-graded server (#18) stays unbuilt until its licence clears (the gate refuses it); the conflict-optimizer (#5) licence is pending (reference-only today).
4. **ToolUniverse runtime decision:** Python runtime, API keys, and a deploy egress policy before any live tool execution.
5. **The Portal UI/workflow build** and **durable WORM audit storage + a retention period** (deploy/regulatory).
6. **The C22 AU Core version-target decision** and the `objective_data_offered` sanitiser policy (both unchanged, still open).
7. **Regulatory posture:** likely TGA-regulated SaMD; classification/certification remain organisational decisions with qualified specialists (M14 deferred, decision-first).

## Still buildable now (engineering-only)

The M0–M8 and H0–H7 engineering backlogs are complete. What's left without external inputs: the **Portal UI/workflow** (the large one, part of release blocker #2), case-set distribution top-up (needs operator source material), and verifier fuzz-corpus hardening (unscheduled). Everything else on the critical path (M9–M14) is input-gated — see `.planning/M9-M14-MASTER-PLAN.md` for the exact input each milestone awaits.

---

## How to verify

```
npm ci
npm test                 # 34 contract suites — all pass (29 + 5 governance)
npm run licence:check    # harvest-licence gate — 0 blocks (12 warns, expected)
npm run eval:cases       # BLOCKING case-set gate — PASS (301 attested / 303 dirs)
npm run bench:mirage     # BLOCKING MIRAGE trust gate — green (corpus DRAFT → non-gating, fail-closed)
npm run verification     # five-step harness — Pass
npm run trunk:stub:all   # trunks 1.0–9.0 — 9/9 (also green with HEYDOC_USE_MCP=1)
npm run verify:rehash -- --integrity   # ledger chain VALID, 0 drift
npm audit --audit-level=high           # 0 High/Critical
```
CI runs all of the above blocking on Node 20 on every push/PR; all merged PRs (#1–#32) passed.

## Where the detail lives

- `.planning/ARCH_PLAN.md` — the architectural blueprint (M0–M8, FMEA, retain/refine/replace register).
- `.planning/FLOW_PLAN.md` — the harvest block (H0–H7), per-component licence/adoption decisions, deferred items.
- `.planning/M9-M14-MASTER-PLAN.md` — the input-gated milestones and the exact operator input each awaits.
- `integration/harvest-manifest.json` + `scripts/check-licence-clearance.mjs` — the 41-row harvest register and its CI gate.
- `docs/grounding/completeness-register.md` / `gap-register.md` / `CHANGELOG.md` — exhaustive backlog, curated risk rows, task-by-task log (M0–M11, H0–H7).
- `CLAUDE.md` — the engineering charter (invariants, workflow, safety rules).
- `docs/case-authoring/` + `case-factory/` — the SOAP→case-set protocol and the synthetic generation pipeline; the **303 case dirs** live in `data/cases/`.

**Bottom line:** the safety scaffolding built in M0–M8 has now been **extended with governed external capability (H0–H7)** — every harvested component licence-gated, pinned, wrapped, adversarially reviewed, and forced through the clinician verification gate fail-closed — while the safety core stayed byte-unchanged and the evaluation and trust gates block CI. The path to patient-facing remains gated on vendor contracts, clinical/regulatory sign-off (now including benchmark-corpus attestation), the Portal UI, and named decisions — by design.
