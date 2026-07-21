# Breath-Ezy Harvest Integration Register

**Document ID:** `heydoc-grounding:integration-register:2026-07`
**Version:** 1.0.0
**Generated:** 2026-07-06 (FLOW_PLAN milestone H0)
**Source of truth:** [`integration/harvest-manifest.json`](../../integration/harvest-manifest.json) — this Markdown is the **human-readable mirror**; when the two disagree, the JSON manifest wins and this file is the defect (same rule as the `.claude/` derived docs). The gate that enforces the manifest is [`scripts/check-licence-clearance.mjs`](../../scripts/check-licence-clearance.mjs) (`npm run licence:check`).

This register is the plug-in artifact of FLOW_PLAN §6.2 — the allow-list of external build-elements considered for harvest into `Arepo-Medtech/Makoha`, keyed by the Build-Elements Register `Ref`. **Being on this list is a prerequisite for harvesting a repo, not authorisation to harvest it** — every wrap/fork/pattern-lift is separately plan-gated per `CLAUDE.md`.

> **H0 authorises NO integration code.** This milestone builds the licence + identity gate so that H1+ harvest has something to pass. Nothing here is wired yet.

---

## Licence floor (enforced mechanically by `licence:check`)

The gate BLOCKS (fails CI) on any of:

1. **Copyleft in a shippable module** — an AGPL/GPL SPDX identifier or licence header under a shippable path (`mcp/servers`, `integration/record-sources`, `portal`, `verification`). AGPL/GPL elements are **reference-only** and their code may never enter a shippable path.
2. **Dropped/deferred repo pulled in** — a DROP or DEFER repo named as a dependency, or a harvested integration present at a DROP/DEFER target.
3. **Unresolved licence on a shippable path** — a `pending`-licence repo wrapped into a shippable target before its licence is cleared on-repo.
4. **MedRAG conflation** — `gzxiong/MedRAG` (the MIRAGE harness, #20) must stay distinct from `SNOWTEAM2023/MedRAG` (reference only).

Non-blocking **WARN**: an ADOPT repo not yet commit-pinned. Pinning an exact commit is mandatory when a repo is actually wrapped (H1+); at H0 the ADOPT rows are intentionally unpinned (`pin_status: unpinned_pending_adoption`) — no commit SHA is fabricated.

**Licence-clearance status legend:** `verified` (licence confirmed) · `pending` (Confirm on-repo before wrapping) · `copyleft_reference_only` (AGPL/GPL — pattern-lift only, owner ruling required) · `first_party`.

---

## Step 1 — Patient-record spine

| Ref | Repo | Verdict · Mode | Licence (status) | Target | Shippable |
|---|---|---|---|---|---|
| 16 | wso2/fhir-mcp-server | ADOPT · WRAP | Apache-2.0 (**verified 2026-07-06**, pinned `6307fe7`) | `mcp/servers/fhir-broker/` (override) | yes |
| dir | fastenhealth/fasten-sources | **REFERENCE · PATTERN-LIFT** ⇩ | none-detected (**pending — upstream private**) | — (concept only) | no |
| dir | fastenhealth/fasten-onprem | REFERENCE | GPL-3.0 (**copyleft ref-only**) | — | no |

> **H1 finding (2026-07-06, G13/G14) — fasten-sources downgraded ADOPT→REFERENCE.** The
> `fastenhealth/fasten-sources` GitHub repo is now private/404, and pkg.go.dev detects **no licence for any
> retained version** (including v0.6.25, which `fasten-onprem` pins). The earlier "Apache-2.0 (verified)"
> status was a register defect: it was never verifiable on-repo. No licence = all-rights-reserved — the code
> may never be wrapped, forked, or read for implementation. `integration/record-sources/` is therefore a
> **first-party clean-room build** on the public SMART App Launch standard, not a harvest target. The wso2
> wrap (#16) is unaffected and licence-cleared.
| 13 | open-health | REFERENCE · PATTERN-LIFT | AGPL-3.0 (**copyleft ref-only**) | `portal/patient-ingest/` (pattern) | no |
| 6 | StanfordBDHG/HealthGPT | REFERENCE · PATTERN-LIFT | MIT? (pending) | `portal/` | no |

## Step 2 — Evidence taps + trust gate

| Ref | Repo | Verdict · Mode | Licence (status) | Target | Shippable |
|---|---|---|---|---|---|
| 1 | anthropics/healthcare | ADOPT · WRAP | first-party (**verified, pinned `dff06a1b`**) | `mcp/servers/docs/` (override) · `evidence-cms/` NOT built (US, low priority) | yes |
| 14 | Cicatriiz/healthcare-mcp-public | ADOPT · WRAP | MIT (**verified, pinned `1c4c40c3`**) | `mcp/servers/evidence-fda-pubmed/` | yes |
| 15 | JamesANZ/medical-mcp | ADOPT · WRAP | MIT (**verified, pinned `13d2fddd`**) | `mcp/servers/evidence-drug-guideline/` | yes — **ADVISORY, never a dose** |
| 18 | connerlambden/bgpt-mcp | ADOPT · WRAP | ? (**pending — DEFERRED-ON-LICENCE, gate refuses**) | `mcp/servers/evidence-graded/` (**UNBUILT**) | yes |
| 8 | Aperivue/medsci-skills | ADOPT · PATTERN-LIFT | MIT (verified) | `verification/integrity-detectors/` (**built + wired**) | yes (our code; no runtime dep) |
| 9 | 2023Anita/clinical-ai-agent-skills | REFERENCE · PATTERN-LIFT | ? (pending) | `docs/grounding/guardrail-spec.md` (**written, spec-only**) | no |

> **H2 (2026-07-06) — evidence taps wrapped (licence-clear subset).** #14/#15/#1 cleared on-repo and
> commit-pinned, wrapped as EXTERNAL pinned processes (no vendored code) behind a common
> `evidence_search`→EvidenceNode contract; all mock-gated, `patient_eligible:false` until the H3 MIRAGE gate.
> #15 output is ADVISORY and structurally barred from any dose (`.strict()` schema + `assertNoDose` +
> `advisory_dose_leak` detector; pharmacology firewall C2 is the sole dose source). #8 detectors lifted into
> `verification/integrity-detectors/` and wired into `pipeline.js` (monotone-AND; `verifier.js` untouched).
> #9 written as `guardrail-spec.md` (spec only). **#18 DEFERRED-ON-LICENCE** — NOT wrapped, `evidence-graded/`
> left unbuilt, `licence_status` kept `pending` so the gate's BLOCK 3 refuses any premature wrap
> (contract-tested); a preliminary GitHub check showed MIT but that is not on-repo LICENSE clearance and #18
> is out of H2 scope. `evidence-cms/` (US CMS/NPI) deprioritised — not built.

## Step 3 — Prove it (benchmark)

| Ref | Repo | Verdict · Mode | Licence (status) | Target | Shippable |
|---|---|---|---|---|---|
| 20 | **gzxiong/MedRAG** (MIRAGE) | **REFERENCE · methodology-only** | ? (pending, **not adopted**) | — (first-party `benchmark/mirage/`; **no #20 code**) | no (offline eval) |
| comp | **SNOWTEAM2023/MedRAG** | REFERENCE | ? (pending) | — (reading only) | no |
| 21 | asanmateu/medgraph-ai | REFERENCE · PATTERN-LIFT | ? (pending) | `mcp/servers/knowledge/graph/` (pattern) | no (DEFERRED — licence-pending) |
| org | mims-harvard/PrimeKG | ADOPT · INTEGRATE | MIT (verified) | `mcp/servers/knowledge/primekg/` | yes (DEFERRED at H3 — licence clear but not built this milestone) |

> **G5 disambiguation pin:** the two MedRAG rows carry distinct URLs and cross-reference each other via `do_not_conflate_with`. The gate fails if they are ever collapsed.
>
> **H3 (2026-07-06) — MIRAGE trust gate built, FIRST-PARTY.** Per the H3 scope change (#20's licence is
> PENDING/unshippable, so its code is refused exactly like #18), `benchmark/mirage/` is a **clean-room**
> MIRAGE-*style* harness — **no #20 code wrapped/vendored/forked** (#20 flipped ADOPT·BENCHMARK →
> **REFERENCE·methodology-only** in the manifest). `runMirage()` scores the three built H2 paths (#14/#15/#1)
> by the partition rubric (P grounded-support rate ≥ **0.60**; N abstain-correct = 1.00 and A invariant-hold
> = 1.00 as hard gates; L diagnostic), tagging each path by its Receipt `upstream`. `test/bench-mirage-gate.js`
> is wired **BLOCKING** in CI (`npm run bench:mirage`). Corpus v0.1.0 is a first-tranche **DRAFT** authored to
> `MIRAGE-CORPUS-SPEC` (§5 strict loader, firewall-clean, question-only), sized to the mock retrievers and
> **fully unattested** — so **no path is `patient_eligible`** (attestation §7 + H7 governance still pending;
> MIRAGE-pass is necessary, not sufficient). **Measured (diagnostic, mock):** #14 and #15 *would pass if
> attested* (P 1.00, abstain ✓, no-dose ✓); **#1 docs would not** — its mock echoes 2 canned citations for
> any query, so it fails the abstain hard gate (honest finding). Scores → `benchmark/mirage/scores/latest.json`
> (+ registers); the **audit ledger (C5) is not touched** (`.strict()`, no metadata slot). PrimeKG #org /
> medgraph-ai #21 relational substrate DEFERRED (both licence-pending / not this milestone). #18 not scored
> (UNBUILT/deferred).

## Step 4 — Case factory (synthetic-only, offline) — WRAPPED at H4 (2026-07-06)

| Ref | Repo | Verdict · Mode | Licence (status) | Pin | Target | Shippable |
|---|---|---|---|---|---|---|
| dir | synthetichealth/synthea | ADOPT · WRAP | Apache-2.0 (verified) | `2b0a55ba` | `case-factory/synthea/` | no |
| fork | FHOOEAIST/synthea | ADOPT · FORK | Apache-2.0 (verified) | `4647221f` | `case-factory/synthea-au/` | no |
| sib | synthetichealth/chatty-notes | ADOPT · WRAP | Apache-2.0 (verified) | `a767a579` | `case-factory/narratives/` | no |

**H4 status.** All three re-verified Apache-2.0 on-repo and pinned to HEAD SHAs. Each is a
thin **out-of-process CLI wrapper** (`case-factory/{synthea,synthea-au,narratives}/`) — **no
Java vendored**; fail-safe `{available:false}` (input-gated on a Java runtime + the external
distributions, the H1 fhir-live precedent). The **shaper** `case-factory/to-casebundle.js` +
**completion** `complete-scoring-nodes.js` (two-phase, CONTRACT §5: 00/01/02 + a
`10.primary_diagnosis.name` seed → schema-minimal draft 10–13) emit a contract-valid
`.casebundle.json` that flows **through** the existing `cases:ingest` (firewall + `--reseq` +
honesty gate intact). Proven offline by `test/contract-case-factory.js` against a committed
synthetic fixture (0 problems / 0 leaks; AU Core conformant; `synthetic:true`;
`clinician_reviewed:false`). **C22:** target AU Core 0.3.0, vendored SDs are 2.0.1-ci —
`auCoreTarget()` flags the divergence, never silently picks. Live volume generation is
input-gated on Java; the *trusted* distribution moves only after clinician attestation.

## Step 5 — Capability expansion

| Ref | Repo | Verdict · Mode | Licence (status) | Target | Shippable |
|---|---|---|---|---|---|
| 28 | mims-harvard/ToolUniverse | ADOPT · WRAP | Apache-2.0 (verified) | `mcp/servers/tooluniverse-gateway/` | **WRAPPED H5** — pinned **v1.3.1 `9b7ff91d`** (RCE floor v1.3.0, enforced by licence:check BLOCK 5); compact-mode; code-executor + agentic/loader/compose families DISABLED + proven UNREACHABLE (default-deny allow-list); own auth; egress bounded; runtime input-gated |
| comp | mims-harvard/TxAgent | DEFER | ? (pending) | — | no |
| org | mims-harvard/MedLog | REFERENCE · PATTERN-LIFT | ? (pending) | `verification/audit-store.js` (pattern) | no — STUDIED at H5 (audit pattern only; ledger untouched) |

## Step 6 — Reasoning topology (pick ONE; owner-gated, D-1)

| Ref | Repo | Verdict · Mode | Licence (status) | Target | Shippable |
|---|---|---|---|---|---|
| 5 | ahmadvh/octochains | **REFERENCE · methodology-only** ⇩ | ? (pending) | — (first-party build at `verification/conflict-audit.js`) | no |
| 3 | souvikmajumder26/Multi-Agent-Medical-Assistant | REFERENCE | ? (pending) | (design ref — read at H6, prose only) | no |
| 2 | Azure-Samples/healthcare-agent-orchestrator | REFERENCE | MIT? (pending) | (design ref — read at H6, prose only) | no |
| 4 | The-Swarm-Corporation/MedicalCoderSwarm | REFERENCE | ? (pending) | (shape ref — not read at H6) | no |

> **H6 (2026-07-07) — D-1 ruled; conflict-audit built first-party.** The operator's D-1 ruling: KEEP the
> tested trunk spine + verifier (ARCH_PLAN RETAIN); LIFT octochains' parallel-expert conflict-audit
> PATTERN as a trust mechanism; do NOT fork or adopt a new orchestrator. #5's licence is pending, so —
> same as #20 (MIRAGE) and the fasten-sources precedent — its **code was not wrapped, vendored, forked,
> copied, or even read**. `verification/conflict-audit.js` is a **FIRST-PARTY clean-room build** from the
> published parallel-expert-consensus methodology; #5's `target_module` is nulled in the manifest so the
> first-party file can never read as a harvest target. The mechanism is **additive-only**: it surfaces
> agreement/disagreement between independent expert opinions as a structured ConflictRecord, never gates,
> never routes, and can never override a HARD_FAIL or BLOCKED_NO_PROOF (proven by
> `test/contract-conflict-audit.js`). #3/#2 were read as design references (README prose, no code); #4
> was not read (demo-grade shape reference only).

## Step 7 — Governance (cross-cutting; builder-owned)

Governance is not harvested — it is ARCH_PLAN C9/M5 (`portal/verification-gate.js`, already built) + C5 audit ledger. Every harvested path routes through the portal gate before any patient-adjacent wiring (H7). MedLog (#org) informs the audit pattern only.

**H7 wiring — per harvested path → the portal gate (fail-closed):**

| Path | Milestone | Adapter seam (`governedRelease`) | Governance test | Fail-closed status |
|---|---|---|---|---|
| record-spine | H1 | `integration/record-sources/sources-client.js` | `test/contract-governance-record-spine.js` | REFUSED without an attested gate record on the exact hash |
| evidence (#14/#15/#1) | H2 | `mcp/servers/_shared/evidence-map.js` | `test/contract-governance-evidence.js` | REFUSED; native `PATIENT_ELIGIBLE=false` unchanged |
| retrieval (MIRAGE-gated) | H3 | `benchmark/mirage/index.js` | `test/contract-governance-retrieval-mirage.js` | REFUSED; harness never sets `patient_eligible` |
| case factory | H4 | `case-factory/to-casebundle.js` | `test/contract-governance-case-factory.js` | REFUSED; synthetic-only (`synthetic:true`) |
| tooluniverse-gateway | H5 | `mcp/servers/tooluniverse-gateway/tool-gateway.js` | `test/contract-governance-tooluniverse.js` | REFUSED; native `PATIENT_ELIGIBLE=false`; executor disabled |

All five route through the shared seam `portal/harvested-release.js` → `releaseToPatient()` (RETAIN C9). The gate is fail-closed: it refuses without a clinician-attested `VerificationGateRecord` on the exact `candidate_output_hash`, refuses outside a live-enforced context, and re-derives the hash it trusts. **Nothing is `patient_eligible:true`; no patient path is opened.**

> **H7 (2026-07-07) — governance wired across every harvested path; RETAIN gate untouched.** H7 WIRES, it does not
> rewrite: `portal/verification-gate.js` and `verification/audit-store.js` are **byte-unchanged**. Each harvested
> adapter gained one thin `governedRelease(output)` export that defers to the shared fail-closed seam
> (`portal/harvested-release.js` → `releaseToPatient()`). Every path is REFUSED without a `VerificationGateRecord`
> bound to the exact `candidate_output_hash`; opens ONLY with a **synthetic** attested record on the exact hash
> (tested — no real clinician sign-off, no Portal UI exists); and **no path flips `patient_eligible:true`**. The
> audit ledger (C5) is confirmed to record every harvested-path run metadata-only / PHI-free (asserted, internals
> unmodified). H6's `conflict_flagged` was **NOT** wired into any release decision (future plan-gated). **The
> four-part patient-eligibility precondition:** MIRAGE-passed (H3) AND governance-gated (H7) AND corpus attested
> (§7) AND a real Portal UI gate record exists (M5 remainder) — H7 delivers exactly **one** (governance). The gate
> stays fail-closed; nothing patient-facing is opened. H7 is the last FLOW milestone.

## Future / optional / dropped

| Ref | Repo | Verdict | Note |
|---|---|---|---|
| 23 | sunlabuiuc/PyHealth | DEFER | Predictive modelling; MIT. Post-spine + governance. |
| 22 | Project-MONAI/MONAI | DEFER | Imaging DL; Apache-2.0. Only if imaging becomes a pillar. |
| 19 | fulcradynamics/fulcra-context-mcp | DEFER | Commercial backend = lock-in; prefer open ingest. |
| 11 | ajhcs/healthcare-agents | REFERENCE | US 42 CFR/CMS; revenue-cycle structure only. |
| comp | ajhcs/healthcare-data-mcp | REFERENCE | Market analytics, not clinical. |
| dir | apache/ctakes | REFERENCE | Clinical NLP; **re-verify live** before reliance. |
| dir | wardle/hermes | REFERENCE | SNOMED server; **re-verify live** before reliance. |
| dir | tidepool-org | DEFER | Diabetes/CGM vertical only; **re-verify live**. |
| 25 | kakoni/awesome-healthcare | REFERENCE | Reading map (CC0). |
| 26 | medtorch/awesome-healthcare-ai | REFERENCE | Reading map (CC0). |
| 17 | sunanhe/awesome-medical-mcp-servers | REFERENCE | MCP-server discovery. |
| 10 | Rajathbharadwaj/voice-agent | **DROP** | Unverified — use ElevenLabs / Web Speech API. |
| 7 | tmc/DoctorGPT | **DROP** | Inactive fork. |
| 12 | cittaverse | **DROP** | Early-stage; parked. |
| 24 | taskade/taskade | **DROP** | No clinical utility. |
| 27 | nowork-studio/awesome-ai-startups | **DROP** | No clinical value. |

---

*Kept in sync with `integration/harvest-manifest.json` as elements land. Any divergence is a defect in this file, not the manifest.*
