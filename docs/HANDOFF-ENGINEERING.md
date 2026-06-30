# Breath-Ezy AI Doctor — Engineering Handoff Brief

**To:** Head of Engineering
**From:** Engineering agent (Claude Code)
**Date:** 2026-06-30
**Repo:** `kenleefreo/breath-ezy` · default branch `main` @ merge `0e77b9b` (PR #1)
**Status of this work:** Mock/development build, all green. **Nothing is wired to a patient-facing path.**

---

## TL;DR

We now have a **complete, working mock of the grounding-and-verification system** that sits around the AI Doctor's language model. The clinical-safety scaffolding is in place and mechanically enforced; the five-step pipeline runs end to end; all seven internal services exist as deterministic mocks. **What remains before any patient could ever be affected is, deliberately, not engineering-only** — it needs vendor contracts, clinical sign-off, and two as-yet-unstarted subsystems.

Treat everything here as **certifiable scaffolding, not a clinical product**. All clinical data in the repo (drug rules, lab reference ranges, benign/red-flag/Axis-B datasets) is **synthetic and explicitly marked "not clinically authoritative."**

---

## What was built (plain language)

- **The safety "spine."** Every model output is now hashed (SHA-256) for a tamper-evident medicolegal record, written to an **append-only, hash-chained audit ledger**, and re-checkable with a `verify:rehash` tool.
- **A grounding verifier** that mechanically blocks the model from inventing clinical codes, guideline claims, lab results, identities, or internal service names — with per-code checking against terminology proof.
- **A pharmacology firewall** (Trunk 8.0): the only source of dose guidance; a `HARD_FAIL` blocks continuation with **no override path**; under-18 and unknown-age cases are refused a dose; Schedule-8 drugs require a PDMP check.
- **A lab "sanitiser"** so the model never sees a raw lab number — values are converted to qualitative interpretations before it reads them.
- **All seven MCP services** as deterministic mocks: docs, identity, terminology, pharmacology, knowledge (+ curated datasets), FHIR broker (with a mock lab → sanitiser path), and messaging/geo (which **never actually sends**).
- **Supply-chain & CI hygiene:** dependency advisories cleared; CI fails the build on High/Critical advisories; 13 automated contract tests gate every change.

## How safety is enforced (for assurance)

The non-negotiable invariants are enforced **in code**, not just in prompts: no fabricated codes/doses/facts, HARD_FAIL is terminal, no raw lab numbers reach the model, and the **scoring-store firewall is clean** (no code path can read the evaluation answer-key nodes). The audit ledger carries **no patient-identifiable information**; the only store that can hold output text is mechanically restricted to synthetic data.

---

## Release-blocker status

The charter defines four patient-facing release blockers. Current state:

| Blocker | State |
|---|---|
| Pharmacology vendor live + validated | Engine + firewall **built (mock)**; **needs a contracted vendor (MIMS-AU/equiv) + SafeScript + credentials** |
| Clinician Verification Portal | **Not started** — a whole UI/review app; required before any output is patient-facing |
| Deterministic investigation parser | Engine **built**; reference ranges are **provisional, need clinical sign-off**; needs a live EHR/FHIR source |
| Session-bound persistence enforced | **Not enforced** — needs an infra/retention decision |

Additionally, the synthetic-case **evaluation gate** is not yet live (only 1 of the required ≥45 cases exists).

---

## Decisions made — and why

- **Bumped the MCP SDK** to clear all High/Critical advisories; added a CI audit gate (security policy).
- **Two-store audit design:** a durable, no-PHI ledger vs a separately-governed, **synthetic-only** content store — to satisfy the "keep an immutable audit trail" requirement without violating patient-data-minimisation.
- **Provisional-data-with-sign-off pattern:** all curated clinical data is shipped as clearly-labelled dev data; a tracked register item requires clinical + regulatory sign-off before it can go live.
- **Pinned AUCDI Release 3** (supplements AU Core 0.3.0) at your direction — but flagged that *whether it re-targets or only supplements* the conformance target is an **organisational/regulatory decision**, not settled here.

---

## What needs leadership / specialist input (not engineering)

1. **Vendor contracts + credentials:** MIMS-AU (or equivalent) + SafeScript (pharmacology), NCTS/Ontoserver (terminology), an EHR/MHR FHIR connection. The agent never handles credentials.
2. **Clinical + regulatory sign-off** on: lab reference ranges, the benign/Axis-B/red-flag datasets, and the FHIR/AUCDI conformance target.
3. **Build decisions** for the two unstarted blockers: the **Clinician Verification Portal** and **session-bound persistence** (storage backend + retention policy).
4. **Regulatory posture:** the system is likely TGA-regulated Software as a Medical Device; classification/certification are organisational decisions with qualified specialists.

## Still buildable now (engineering-only, no external inputs)

- Extend the terminology layer to ICD-10-AM / LOINC / PBS (currently SNOMED + ICD-11 only).
- FHIR R4 / AUCDI R3 conformance validator + value-set binding tables.
- Expand the synthetic case set toward the 45-case evaluation minimum.

---

## How to verify

```
npm ci
npm test                 # 13 contract suites — all pass
npm run verification     # five-step harness — Pass
npm run trunk:stub:all   # trunks 1.0–9.0 — 9/9 (also green with HEYDOC_USE_MCP=1)
npm audit --audit-level=high   # 0 High/Critical
```
CI runs the first three on Node 20 on every push/PR; PR #1's check passed.

## Where the detail lives

- `docs/grounding/completeness-register.md` — the exhaustive build backlog (every open/resolved item, risk-rated).
- `docs/grounding/gap-register.md` — the curated, prioritised gap view (risk rows R-01…R-22).
- `docs/grounding/CHANGELOG.md` — what changed, task by task.
- `CLAUDE.md` — the engineering charter (invariants, workflow, safety rules).

**Bottom line:** the safety-critical engineering scaffolding is built and tested in mock; the path to patient-facing is gated on vendors, clinical/regulatory sign-off, and two named subsystems — by design.
