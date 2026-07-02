# Breath-Ezy AI Doctor — Engineering Handoff Brief

**To:** Head of Engineering
**From:** Engineering agent (Claude Code)
**Date:** 2026-07-02
**Repo:** `kenleefreo/breath-ezy` · default branch `main` @ `9d376c1` (PRs #1–#12)
**Status of this work:** Mock/development build, all green. **Nothing is wired to a patient-facing path.**

---

## TL;DR

We now have a **complete, working mock of the grounding-and-verification system** that sits around the AI Doctor's language model, plus a **case-authoring pipeline and a populated evaluation set (52 cases)**. The clinical-safety scaffolding is in place and mechanically enforced; the five-step pipeline runs end to end; all seven internal services exist as deterministic mocks. **What remains before any patient could ever be affected is, deliberately, not engineering-only** — it needs vendor contracts, clinical sign-off, and two as-yet-unstarted subsystems.

Treat everything here as **certifiable scaffolding, not a clinical product**. All clinical data in the repo (drug rules, lab reference ranges, benign/red-flag/Axis-B datasets) is **synthetic and explicitly marked "not clinically authoritative."**

---

## What was built (plain language)

- **The safety "spine."** Every model output is now hashed (SHA-256) for a tamper-evident medicolegal record, written to an **append-only, hash-chained audit ledger**, and re-checkable with a `verify:rehash` tool.
- **A grounding verifier** that mechanically blocks the model from inventing clinical codes, guideline claims, lab results, identities, or internal service names — with per-code checking against terminology proof.
- **A pharmacology firewall** (Trunk 8.0): the only source of dose guidance; a `HARD_FAIL` blocks continuation with **no override path**; under-18 and unknown-age cases are refused a dose; Schedule-8 drugs require a PDMP check.
- **A lab "sanitiser"** so the model never sees a raw lab number — values are converted to qualitative interpretations before it reads them.
- **All seven MCP services** as deterministic mocks: docs, identity, **terminology (now multi-system: SNOMED/ICD-10-AM/ICD-11/LOINC/PBS/AMT)**, pharmacology, knowledge (+ curated datasets), **FHIR broker (mock lab → sanitiser, plus a deterministic AU Core structural conformance validator against vendored StructureDefinitions)**, and messaging/geo (which **never actually sends**).
- **A case-authoring pipeline.** A documented protocol (v1.2.0) + a single-file "kit" turns semi-structured SOAP `.txt` notes into evaluation cases in Chat or Cowork; `cases:ingest` then validates, splits, and hashes each bundle into the case-set. The **scoring-store firewall is enforced at the sub-field level** (only patient-facing fields are checked/injectable; answer-key metadata is excluded).
- **A populated evaluation set: 52 cases.** 51 synthetic Acute Urgent Care cases were ingested with a recorded **clinician attestation** (bulk sign-off), real SHA-256 integrity hashes, and candidate codes held `unverified` pending terminology receipts.
- **Supply-chain & CI hygiene:** dependency advisories cleared; CI fails the build on High/Critical advisories; **15** automated contract tests gate every change.

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

Additionally, the synthetic-case **evaluation gate**: the case-set now holds **52 cases** (clears the ≥45 count), each clinician-attested. Still open before the gate can run as a blocking job: the **difficulty distribution** is skewed (47 straightforward / 4 atypical-high-risk vs the 60/30/10 target), candidate **terminology codes are unverified** (pending receipts), and the **live context-injection layer** must enforce the same sub-field firewall the ingest tool applies.

---

## Decisions made — and why

- **Bumped the MCP SDK** to clear all High/Critical advisories; added a CI audit gate (security policy).
- **Two-store audit design:** a durable, no-PHI ledger vs a separately-governed, **synthetic-only** content store — to satisfy the "keep an immutable audit trail" requirement without violating patient-data-minimisation.
- **Provisional-data-with-sign-off pattern:** all curated clinical data is shipped as clearly-labelled dev data; a tracked register item requires clinical + regulatory sign-off before it can go live.
- **Pinned AUCDI Release 3** (supplements AU Core 0.3.0) at your direction — but flagged that *whether it re-targets or only supplements* the conformance target is an **organisational/regulatory decision**, not settled here.
- **Vendored the AU Core StructureDefinitions at the current CI build (`2.0.1-ci-build`)** at your direction for the conformance validator — flagged as a **divergence from the pinned AU Core `0.3.0`**; which version is authoritative is an org/regulatory decision.
- **Telehealth objective-data carve-out:** patient-obtainable readings (home/wearable devices, self-report, video-visible) may enter the presentation layer if provenance-tagged and `verified:false` — never as clinician gold-standard; clinician-only exam/labs/ECG stay sealed. (No hard limit weakened.)
- **Case-ID convention:** machine-transformed cases are assigned canonical `SPEC-{SPECIALTY}-{DD}-{SEQ}` IDs (DD = difficulty ordinal); the source note's own ID is preserved in the manifest. Chosen over relaxing the schema pattern.
- **Firewall is sub-field, not file-level:** validating the first real case showed the green files (`00/01/02`) mix patient-facing content with sim/scorer metadata — so both the ingest gate and (pending) the live context-injection layer must apply an allow-list, not a whole-file rule.

---

## What needs leadership / specialist input (not engineering)

1. **Vendor contracts + credentials:** MIMS-AU (or equivalent) + SafeScript (pharmacology), NCTS/Ontoserver (terminology), an EHR/MHR FHIR connection. The agent never handles credentials.
2. **Clinical + regulatory sign-off** on: lab reference ranges, the benign/Axis-B/red-flag datasets, and the FHIR/AUCDI conformance target.
3. **Build decisions** for the two unstarted blockers: the **Clinician Verification Portal** and **session-bound persistence** (storage backend + retention policy).
4. **Regulatory posture:** the system is likely TGA-regulated Software as a Medical Device; classification/certification are organisational decisions with qualified specialists.

## Still buildable now (engineering-only, no external inputs)

- **Enforce the sub-field firewall allow-list in the live context-injection layer** (the ingest tool already does; the runtime pipeline must match) — the new High register item.
- **Batch-verify** the 52 cases' candidate terminology codes against the mock terminology server (produce receipts; flip `unverified`).
- **Top up case-set difficulty** toward the 60/30/10 distribution (count minimum already met).
- AUCDI R3 / AU Core **value-set (binding) validation** — structural conformance is done; membership needs live NCTS.

---

## How to verify

```
npm ci
npm test                 # 15 contract suites — all pass
npm run verification     # five-step harness — Pass
npm run trunk:stub:all   # trunks 1.0–9.0 — 9/9 (also green with HEYDOC_USE_MCP=1)
npm run cases:ingest -- "<bundle-folder>" --dry-run   # case-set validation (no write)
npm audit --audit-level=high   # 0 High/Critical
```
CI runs `npm test` on Node 20 on every push/PR; all merged PRs (#1–#12) passed.

## Where the detail lives

- `docs/grounding/completeness-register.md` — the exhaustive build backlog (every open/resolved item, risk-rated).
- `docs/grounding/gap-register.md` — the curated, prioritised gap view (risk rows R-01…R-22).
- `docs/grounding/CHANGELOG.md` — what changed, task by task.
- `CLAUDE.md` — the engineering charter (invariants, workflow, safety rules).
- `docs/case-authoring/` — the SOAP→case-set transformation protocol (v1.2.0), the single-file kit, and how to run it in Chat/Cowork; `scripts/{ingest-case-bundles,build-case-transformation-kit}.mjs`; the 52 cases live in `data/cases/`.

**Bottom line:** the safety-critical engineering scaffolding is built and tested in mock, and the evaluation case-set is now populated (52 clinician-attested cases) via an auditable authoring→ingest pipeline; the path to patient-facing remains gated on vendors, clinical/regulatory sign-off, and two named subsystems — by design.
