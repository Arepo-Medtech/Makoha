# M9–M14 Master Plan — the input-gated milestones · Breath-Ezy AI Doctor

> **⛳ STILL LIVE, partially overtaken (status reconciliation 2026-07-13).** The six milestones remain input-gated as written, with these corrections: the **M10 sanitiser-policy input is CLOSED** (operator ruling HIST-2, 2026-07-11 — string-preserving, implemented); **M13's "Portal UI remains / not started" is outdated** (review console + durable gate records built at LIVE_PLAN L1, PR #36 — M13 stays gated because WORM registration + identity federation remain); **M11 P1 terminology live adapter and the H1 fhir live backend are already built** against sandbox/pinned targets (AU-content/credential connect still input-gated); the `eval:cases` gate this plan assumed now exists (L10, PR #38); case count is 303 dirs / 301 attested. Current state: `docs/grounding/completeness-register.md`.

> **Bootstrap-mode master plan** (per `CLAUDE.md <bootstrap_mode>`). It covers the six ARCH_PLAN §3.7
> input-gated milestones — the ones that **cannot start until an operator/org supplies a named external
> input** (vendor contract, credential, clinical/regulatory sign-off, or a standards decision).
> **This is a plan to review, not code.** Each milestone below is itself subject to the Phase-2 approval
> gate **when its input lands** — do not begin any milestone's Phase 1 without the input AND a fresh go-ahead.
> **Authority:** `CLAUDE.md` (charter) > `.planning/ARCH_PLAN.md` > this file.
> Version 1.0.0 · Generated 2026-07-05 · Opens from the live register state scanned 2026-07-05.

---

## §0 — How to read this

M0–M8 (the pure-engineering block) are **done and merged to `main`**. What remains is orchestration-free:
every mock core is built, contract-tested, and wired; the delta for each item below is a **live adapter
behind an already-frozen contract**, plus the sign-offs and decisions that only your organisation can make.

Each milestone states: **Objective · Register state in · REQUIRED INPUTS (operator/org only) · Topology ·
Contracts · Phases (with files/tests/exit) · Verification · Invariant check · Register/gap impact ·
Release-blocker relationship.** Risk uses ARCH_PLAN `L×I` (Critical ≥16, High 9–15, Medium 4–8, Low ≤3).

**The agent cannot self-serve any input in this plan.** Credentials, mTLS certs, PRODA/NCTS licence
material, vendor tokens, DB passwords, and clinical/regulatory sign-offs are supplied by you at deploy time
from a secrets manager. Per `<security_and_secrets>`, the agent never enters, echoes, or commits them — it
stops and directs you. The env templates keep `example.invalid` placeholders.

---

## §1 — Cross-cutting live-connect discipline (applies to every milestone M9–M13)

These are the invariants and process controls every live connection honours. They are stated once here and
assumed by each milestone.

1. **Contract-frozen adapter pattern.** The live vendor/EHR/terminology adapter sits **behind the same JSON
   Schema + zod contract** the mock already satisfies (PharmCheck, TerminologyLookup, FHIR read/validate,
   kg.query). No schema churn on connect. The **mock remains the rollback** (`PHARM_VENDOR=stub`,
   `terminology-servers.json` mock endpoint, `HEYDOC_KG_DB_URL` unset, etc.).
2. **Staging-only first, synthetic patients only.** Every live connection is made in **staging**
   (`HEYDOC_MODE_DEFAULT=staging`), against **synthetic patients only — never real patient data**
   (`<release_and_environments>`). Promotion staging→production is a separate, plan-gated step.
3. **Validation gate before any production consideration.** Each live connection is validated against the
   **synthetic case set + the blocking `eval:cases` gate** (thresholds: case pass ≥0.70; case-set ≥80%
   passing; **zero** critical under-triage; ≥90% verification compliance). No live vendor is promoted toward
   production without validation evidence against the 301-case set.
4. **Mode discipline (M1 is the mechanical backstop).** The mode-normaliser already blocks mock receipts in
   staging/production/live and default-denies unknown modes. Live adapters MUST emit `mode:"live"` receipts;
   any mock receipt reaching a live-enforced context is dropped as proof by the verifier. This is the
   technical gate behind R-12 ("mock pharmacology data used in patient context").
5. **Secrets never touch the repo.** Vendor tokens / mTLS keys / PRODA & NCTS licence material / DB passwords
   are injected at deploy from a secrets manager. The agent stops and directs you when a step needs one.
6. **Receipt discipline unchanged.** Every live call produces a Receipt (`request_id`, `timestamp_utc`,
   `upstream`, `mode:"live"`); every claim stays traced `EvidenceNode → Receipt → MCP tool call`.
7. **No patient path opens** until the four release blockers are green (pharmacology vendor **M9**;
   Clinician Verification Portal built — gate done M5, **UI remains**; investigation parser range sign-off
   **M10**; session-bound persistence enforced — done **M4**). Nothing in M9–M13 opens a patient path by
   itself.
8. **Regulatory posture.** Treat as TGA-regulated SaMD. Preserve traceability, hash/retain audit artifacts,
   keep the registers current, and **flag any change that alters intended use, clinical risk profile, or
   device classification** — surface, do not decide (`<regulatory_posture>`).

---

## §2 — Dependency graph (sequencing when inputs arrive)

```
        C22 (AU Core version-target decision)        ← org/regulatory, blocks fhir/AUCDI conformance
                 │
     ┌───────────┴───────────┐
  M11a terminology live     M11b fhir-broker live ──┐
  (NCTS licence,            (FHIR base URL, mTLS,    │
   SNOMED-AU licence,        MHR consent, live NCTS  │ live lab Observations
   AU Core value-set)        value-set binding)      │
     │  live code re-validation                      ▼
     │  (flip 1580 mock_verified_* → live)      M10 investigation-parser range sign-off
     ▼                                          (clinical+regulatory ranges + a live lab source)
  (feeds Trunks 6/7/9)                                │  ← release blocker #3
                                                      │
  M9 pharmacology live vendor ──────────────────► release blocker #1
  (MIMS-AU/equiv + SafeScript WA)                     │
                                                      │
  M12 knowledge dataset sign-off (clinical)      ─────┤ (independent; feeds Trunks 5/7/9)
                                                      │
  Portal UI (completes M5) ─────────► release blocker #2 ─┐
                                                          ▼
  M13 messaging-geo live wiring  ── HARD DEPENDENCY: only AFTER the Portal is COMPLETE
                                                          │
  M14 Rx-Remedy / portals  ── new scope; re-assess Class-1 SaMD BEFORE any build (org/regulatory)
```

**Independent (can run in any order once their input lands):** M9, M12.
**Chained:** C22 → M11 → (live code re-validation; live lab source for M10). M10 also needs its clinical
range sign-off independent of M11. **Gated last:** M13 (needs Portal COMPLETE). **Deferred/decision-first:**
M14.

---

## M9 — Pharmacology live vendor (C2 · R-22/R-12/R-09 · FMEA F14) — **Release blocker #1**

**Objective.** Replace the mock pharmacology data source with a live vendor **behind the frozen PharmCheck
contract**, so HARD_FAIL / dose-guidance / S8-PDMP decisions run on real data. The deterministic engine is
**RETAINed verbatim** (it is exemplary); the only delta is the vendor adapter.

**Register state in.** `pharmacology-server-unbuilt` = **PARTIAL** (mock core + Trunk 8.0 firewall wired,
contract-tested; **only the live vendor is pending**), Critical, pf:true. Gap R-22 (mock built), R-12 (mock
in patient context — technical gate now = mode-normaliser), R-09 (S8 without PDMP).

**REQUIRED INPUTS (operator/org only):**
- **MIMS-AU (or equivalent) contract** with: NTI (drug database), allergy cross-reactivity, drug–drug
  interaction, renal dosing, and AU scheduling data.
- **SafeScript WA** access for S8 PDMP checks.
- **Vendor credentials via the secrets manager** (the agent never enters them).
- *AMT reference (for drug identity):* the Australian Medicines Terminology is on the NCTS SNOMED CT-AU
  release; `AuDigitalHealth/sctau-sample-scripts` (`AMTv3-/AMTv4-sample-scripts`) is useful **reference only**
  for AMT's structure. AMT is served via the terminology server (M11), not a repo-vendored SQL DB.
- *FHIR Medication reference (drug identity, FHIR-native pattern):* `AuDigitalHealth/medserve` — an
  experimental FHIR server exposing AMT + PBS as FHIR `Medication`/`Substance` resources. Useful **reference
  only** for the FHIR-native medicines pattern; **ARCHIVED (read-only since 2021-04-30) — do NOT deploy or
  depend on it.** Live medication/AMT grounding comes via the live terminology server (M11 NCTS/self-host),
  not this prototype.

**Topology.** `mcp/servers/pharmacology/` (+ new `vendor-adapter.js`), Trunk 8.0 firewall in
`verification/pipeline.js`, verifier check 5 (HARD_FAIL enforcement). Blast radius: any run reaching Trunk 8.0.

**Contracts.** No change — `pharm-intent.schema.json` / `pharm-check.schema.json` and the engine's 5-check
output are frozen. The adapter maps the vendor's data shape onto the existing PharmCheck result.

**Phases (Phase-2 gated when the contract + credentials land):**
- **P0 Completeness scan** over `mcp/servers/pharmacology/`, Trunk 8.0, verifier check 5; confirm no
  `BLIND_STUB` on the firewall path already emits a dose.
- **P1 Vendor contract-lock.** Gap-check the vendor's data shape vs `pharm-check.schema.json`; propose schema
  deltas ONLY if unavoidable (prefer adapter mapping). **GATE.**
- **P2 Deterministic adapter (staging).** Build `vendor-adapter.js` behind the PharmCheck contract; keep the
  pure engine verbatim. Enforce mechanically: dose only on PASS/WARN & non-paediatric; HARD_FAIL terminal;
  unknown-age → NOT_RUN → BLOCKED_NO_PROOF; S8 → PDMP-or-HARD_FAIL. `PHARM_VENDOR=stub` = rollback. **GATE.**
- **P3 Firewall re-validation.** Contract test asserts a **live** HARD_FAIL halts with no override and that no
  dose originates outside this server; verifier check 5 unchanged; re-classify the server COMPLETE (staging).
- **P4 Case-set validation (staging).** Validate against the 301-case set + `eval:cases`; the firewall must
  pass the eval gate before any production consideration. **GATE.**

**Verification.** `contract-pharmacology` + `contract-firewall` extended for the live path (mocked vendor in
CI, real vendor in staging); `eval:cases` PASS in staging; zero critical under-triage on pharmacology cases.

**Invariant check.** No-autonomous-prescription preserved (dose only via PharmCheck); no HARD_FAIL override;
mode-normaliser blocks any stray mock receipt. **Nothing patient-facing until P4 validation + the other three
blockers are green.**

**Register/gap impact.** R-22 → resolved (live) on P4; R-12 → controlled-in-code (mode gate) + vendor
validated; R-09 → controlled (live PDMP). `pharmacology-server-unbuilt` → COMPLETE.

---

## M10 — Investigation-parser range sign-off (C3 · R-21/R-05 · FMEA F7) — **Release blocker #3**

**Objective.** Move the deterministic sanitiser from DEV/provisional reference ranges to **clinically- and
regulatory-signed-off ranges**, backed by a **live lab source**. The parser engine is **RETAINed** (it never
emits a raw number; unknown/non-numeric → "U" fail-safe); the delta is the ranges dataset + a live source.

**Register state in.** `investigation-parser-unbuilt` = **PARTIAL** (engine built mock/dev), Critical, pf:true;
`lab-reference-ranges-provisional` = PARTIAL (dev-only), High, pf:true. Gap R-21 (mock/dev built), R-05 (raw
lab in LLM context — schema+parser enforced). Related: `objective-data-offered-sanitiser-policy` (patient-
reported vitals quarantined at the packet boundary until the policy is confirmed).

**REQUIRED INPUTS (operator/org only):**
- **Authoritative reference-range sign-off** — clinical + regulatory approval of the analyte reference
  intervals (currently `lab-reference-ranges:v0.1.0-dev`).
- **A live lab source** — i.e. **fhir-broker live** (see M11b) delivering real Observations.
- **Patient-reported-vitals sanitiser-policy decision** (`<data_handling>` open follow-up): pass-as-string
  (telehealth carve-out), band via the parser, or keep withheld — closes
  `objective-data-offered-sanitiser-policy`.

**Topology.** `verification/investigation-parser.js` (engine frozen), `verification/data/lab-reference-ranges.json`
(REFINE → signed-off, versioned + checksummed), the ContextPacket lab gate (frozen), Trunk 6.0,
`verification/context-allowlist.js` (the quarantine rule for objective_data_offered).

**Contracts.** No change — `dataset_version` + checksum on the ranges; the sanitised `lab_result` fact shape
and the `superRefine` no-raw-lab gate are frozen.

**Phases (gated on the sign-off + live source):**
- **P1 Range dataset lock.** Replace the DEV ranges with the signed-off dataset; bump `dataset_version`;
  re-checksum; keep the engine. **GATE.**
- **P2 Live lab source.** Consume real Observations from fhir-broker live (M11b) → parser → sanitised fact;
  raw number never in the packet (the packet gate is the defence-in-depth backstop).
- **P3 objective_data_offered policy.** Implement the confirmed sanitiser policy in `context-allowlist.js`
  (flip the quarantine rule) + extend `contract-context-allowlist`. **GATE.**
- **P4 Case-set validation (staging).** `eval:cases` + `contract-investigation-parser` on the live path.

**Verification.** `contract-investigation-parser` extended for signed-off ranges + live Observations; the
raw-lab superRefine gate still rejects any leading-numeric `lab_result`.

**Invariant check.** No raw lab numbers in LLM context (parser + packet gate); telehealth carve-outs (no
physical exam / no bloods without fhir-broker) preserved. Release blocker #3 clears on P4 sign-off.

**Register/gap impact.** R-21 → resolved (live + signed-off); `lab-reference-ranges-provisional` → COMPLETE;
`objective-data-offered-sanitiser-policy` → resolved; `investigation-parser-unbuilt` → COMPLETE.

---

## M11 — Terminology live NCTS (C11 · R-20 · F5) & FHIR live (C12 · F6) — plus the C22 decision

**Objective.** Connect the terminology server to **live NCTS/Ontoserver** (real code validation + AU Core
value-set binding) and fhir-broker to a **live EHR** (real read/search + ValueSet-binding validation). Both
sit behind their frozen contracts. **On live terminology connect, the 1580 `mock_verified_pending_live_ncts`
case codes are batch-REvalidated against live NCTS and BLOCK on mismatch** (FMEA F5).

**Register state in.** `terminology-contract-incomplete` = PARTIAL (mock multi-system built; live NCTS + AU
Core binding pending), High, pf:true (R-20). `fhir-r4-aucdi-conformance-unbuilt` = PARTIAL (structural
validator vs vendored AU Core 2.0.1-ci; binding/invariants + live NCTS pending), Medium.
`aucdi-r3-valueset-binding-unbuilt` = UNBUILT, Medium. `pipeline-routing-retrieval-stub` = PARTIAL (routing
becomes receipt-driven once servers are live — same zod gates).

**REQUIRED INPUTS (operator/org only):**
- **NCTS/Ontoserver licence** + **SNOMED CT-AU licence** (terminology); live **PBS API**; **AMT** subset
  validation.
- **fhir-broker:** live **FHIR base URL**, **SMART-on-FHIR / mTLS**, **MHR consent**, **live NCTS** for
  ValueSet-binding validation.
- **C22 — AU Core version-target DECISION (org/regulatory):** the structural validator runs against a
  **vendored 2.0.1-ci snapshot**, which diverges from the **0.3.0 pin**; and whether **AUCDI R3** re-targets
  or only supplements AU Core 0.3.0 is unsettled. **This decision is a prerequisite for the binding work** —
  the agent surfaces it, does not pick it.

**Topology.** `mcp/servers/terminology/` (+ live NCTS adapter behind `terminology-servers.json`),
`mcp/servers/fhir-broker/` (+ live base URL + binding; vendored SDs remain the structural baseline),
Trunks 6/7/9, verifier check 1 (per-code binding), the 301 case manifests' code receipts.

**Contracts.** No change — `terminology-lookup.schema.json` (6-system enum) and fhir read/validate envelopes
are frozen; live endpoints are additive behind config.

**Three terminology deployment models (choose per environment; recorded in `terminology-servers.json`):**
1. **Dev sandbox** — CSIRO public Ontoserver `https://r4.ontoserver.csiro.au/fhir` (self-describes as
   "Ontoserver Sandbox (R4)"; open/Basic, no OAuth; reference/international content, **NOT** the licensed AU
   edition). Use to **build and test the adapter without credentials** — never production/clinical.
2. **NCTS live API** — `https://api.healthterminologies.gov.au/integration/R4/fhir` (ADHA; SMART-on-FHIR
   OAuth2; SNOMED CT-AU + AMT + PBS + AU Core value sets). Needs an NCTS account + issued OAuth credentials.
   `/integration/` is staging; production is a separate endpoint.
3. **Self-hosted** — deploy your own **Ontoserver** (or equivalent FHIR terminology server) and **load the
   SNOMED CT-AU RF2 into IT** (Ontoserver ingests RF2 natively), then point the adapter's `self_hosted`
   endpoint at that server's FHIR base URL. This reuses the M11 P1 FHIR `$validate-code` adapter with **zero
   changes** and preserves AU Core value-set binding (inherently FHIR). Production-grade; operator controls
   availability/SLA; licence-clean if hosted per NCTS terms.
   **NOT this:** loading the RF2 into a plain SQL database (e.g. ADHA's `AuDigitalHealth/sctau-sample-scripts`,
   which loads RF2 → MySQL for *illustration* — ADHA's own README recommends a FHIR terminology server
   instead). A SQL store exposes no `$validate-code` and would require a different, non-FHIR adapter — an
   architecture change, not this path. Those SQL scripts are useful **reference only** (RF2 structure, AMT).
   **INPUT ON HAND (2026-07-05):** the SNOMED CT-AU RF2 distribution (module 32506021000036107, release
   2026-06-30) is available to the operator — its possession evidences the NCTS account + affiliate licence.
   It is **licensed material: NEVER committed** (gitignored); loaded into infrastructure at deploy. This
   makes the self-hosted path viable and decouples the adapter engineering from live-API credentials.

**Phases (gated on the licences + the C22 decision):**
- **P0 C22 decision recorded.** Reconcile the AU Core version target + AUCDI R3 relationship in the standards
  pins + register (this is doc/decision, not code) — **prerequisite GATE.**
- **P1 Terminology live adapter.** Behind `terminology-servers.json`; live NCTS validate/lookup; AU Core
  value-set binding; PBS/AMT. Mock is the rollback. **GATE.**
- **P2 Live code re-validation.** Batch-revalidate **all 301 cases' candidate codes** against live NCTS;
  flip `mock_verified_pending_live_ncts` → `live_verified` **or BLOCK on mismatch** (F5). This is the moment
  the mock receipts become real proof.
- **P3 fhir-broker live.** Live base URL + SMART-on-FHIR/mTLS; ValueSet-binding validation via live NCTS;
  AU Core version per the C22 decision; AUCDI R3 binding tables if in scope. `fhir_write` stays SAFE_STUB. **GATE.**
- **P4 Case-set validation (staging).** `eval:cases` + conformance suite on the live path.

**Verification.** `contract-terminology` + `contract-fhir-broker` + `contract-fhir-conformance` extended;
`eval:cases` PASS with live-verified codes; conformance = structural + ValueSet-binding (was `not_evaluated`).

**Invariant check.** No fabricated codes (now live-receipt-bound); the six-system contract unchanged;
`enforceLive` drops any residual mock receipt.

**Register/gap impact.** R-20 → resolved (live NCTS + binding); `terminology-contract-incomplete` → COMPLETE;
`fhir-r4-aucdi-conformance-unbuilt` → COMPLETE (or PARTIAL if AUCDI R3 deferred); `aucdi-r3-valueset-binding-unbuilt`
→ resolved or explicitly deferred per C22; C22 → resolved (decision recorded);
`pipeline-routing-retrieval-stub` → receipt-driven.

---

## M12 — Knowledge dataset clinical sign-off (C13 · R-13)

**Objective.** Replace the DEV/synthetic-only curated datasets (benign registry, Axis B templates, red-flag
bank) with **clinically-signed-off** content, and stand up the **live graph store** (Postgres). The mock
`kg.query` over seeded datasets is right; the delta is sign-off + a live store.

**Register state in.** `knowledge-datasets-provisional` = PARTIAL (dev seeded; clinical sign-off), High,
pf:true (R-13); `knowledge-server-unbuilt` = PARTIAL (mock built; live PostgreSQL graph store pending),
Medium. ContextGraph / PatientKnowledgeGraph schemas are contracted, awaiting this producer.

**REQUIRED INPUTS (operator/org only):**
- **Clinical + regulatory sign-off** on the three datasets (currently `knowledge-datasets-provisional`).
- **PostgreSQL** at `HEYDOC_KG_DB_URL` (graph store) + credentials via the secrets manager.

**Topology.** `mcp/servers/knowledge/` (+ signed-off datasets, live graph store, `kg.upsert`/`kg.export`
from SAFE_STUB → live), Trunks 5/7/9. Blast radius: benign-registry gate (Trunk 7.0), Axis B (Trunk 5.0),
red-flag bank (Trunk 9.0).

**Contracts.** No change — `kg.query`/`kg.provenance` envelopes + `dataset_version`/checksum frozen; the
ContextGraph / PatientKnowledgeGraph schemas already exist (awaiting this producer — resolves their
"awaiting-producer" note).

**Phases (gated on sign-off + DB):**
- **P1 Dataset sign-off swap.** Replace DEV datasets with signed-off content; bump `dataset_version`;
  re-checksum; empty-graph stays fail-safe. **GATE.**
- **P2 Live graph store.** Wire Postgres; `kg.upsert`/`kg.export` live; ContextGraph/PatientKnowledgeGraph
  populated. **GATE.**
- **P3 Case-set validation (staging).** `contract-knowledge` + `eval:cases` on the live path.

**Verification.** `contract-knowledge` extended (signed-off datasets + live graph); Trunk 7.0 benign-registry
gate operates on real content.

**Invariant check.** No invented service names; structured-dataset proofs stay `EvidenceNode` supports (not
receipts); the empty-graph fail-safe preserved.

**Register/gap impact.** R-13 → resolved (signed-off); `knowledge-datasets-provisional` → COMPLETE;
`knowledge-server-unbuilt` → COMPLETE; ContextGraph/PatientKG orphan-notes cleared.

---

## M13 — messaging-geo live wiring (C14) — **HARD-GATED on the Portal being COMPLETE**

**Objective.** Wire the never-sends mock (`msg_send` SAFE_STUB, geo/pharmacy mock) to live SMS/email +
geocoding + a licensed AU pharmacy directory — **but only after the Clinician Verification Portal is COMPLETE
(gate + UI + workflow), never before.** Today the mock is correctly RETAINed and unwired.

**Register state in.** `messaging-geo-unbuilt` = PARTIAL (mock; never-sends; live providers pending), Medium,
pf:false. Depends on `clinician-verification-portal-unbuilt` (gate built M5; **UI + workflow remain**).

**REQUIRED INPUTS (operator/org only):**
- **The Clinician Verification Portal COMPLETE** — the mandatory HITL checkpoint (gate contract exists;
  clinician UI/workflow + authenticated identity/signature + durable WORM gate-record storage remain). **This
  is the gating prerequisite: no send path may open before it.**
- **SMS/email vendor**, **geocoding API**, **licensed AU pharmacy directory** + credentials via secrets manager.

**Topology.** `mcp/servers/messaging-geo/`, the `releaseToPatient()` gate in `portal/verification-gate.js`
(every send must pass it), the pipeline (messaging-geo becomes pipeline-wired). Blast radius: the first
patient-facing send path.

**Contracts.** No change — `geo_locate`/`pharmacy_search`/`msg_send` envelopes frozen; `msg_send` moves from
SAFE_STUB (never sends) to live **only behind the portal gate**.

**Phases (gated on Portal COMPLETE + provider contracts):**
- **P0 Portal-complete precondition.** Confirm the Portal is COMPLETE and `releaseToPatient()` is the
  mandatory checkpoint; a send path that bypasses it is a Critical F13 defect. **GATE.**
- **P1 Live providers (staging).** Wire SMS/email/geocoding/pharmacy behind the frozen tools; every
  `msg_send` requires a valid `VerificationGateRecord` on the exact `candidate_output_hash`.
- **P2 Contract test + case-set validation.** `contract-messaging-geo` asserts no send occurs without an
  attested gate record; staging-only, synthetic recipients.

**Verification.** `contract-messaging-geo` extended (send refused without gate record); staging validation.

**Invariant check.** Human-in-the-loop mandatory (portal gate); no send without an attested hash-bound
decision; nothing sends in mock/dry_run.

**Register/gap impact.** `messaging-geo-unbuilt` → COMPLETE (post-Portal); depends on
`clinician-verification-portal-unbuilt` → COMPLETE.

---

## M14 — Rx-Remedy / Well-to-do / Be My Doc portals (C23) — **DECISION-FIRST, deferred**

**Objective.** The concept-stage access portals (patient, clinician/B2B, dispensing). **New scope with no
code today.** Building them **changes the SaMD classification** — so the first action is not engineering, it
is an **org/regulatory re-assessment against Class-1 SaMD** before any build.

**Register state in.** `Rx-Remedy / Well-to-do / Be My Doc` = **UNBUILT (out of current engineering scope);
CONCEPT** (ARCH_PLAN C23). Not on the current critical path.

**REQUIRED INPUTS (operator/org only):**
- **Class-1 SaMD re-assessment** (regulatory/classification decision — the portals influence intended use).
- Product scope, and only then a **separate Bootstrap-mode master plan per portal**, each Phase-2 gated.

**Recommendation.** Do **not** scope engineering here until the classification decision is made and the four
patient-facing release blockers are green. Surface the classification implication; do not decide it.

**Register/gap impact.** Remains UNBUILT/deferred with reason until the org decision; then a fresh master plan.

---

## §3 — What this plan does NOT change (guardrails)

- **No code is written by this document.** Each milestone re-enters the charter workflow (Phase 0 scan →
  Phase 1 research → **Phase 2 plan GATE** → Phase 3 execute → Phase 4 review) **when its input lands**.
- **No invariant is weakened** by any live connection — doses stay pharmacology-only, codes stay
  receipt-bound, raw labs stay parser-only, hashing stays required, HARD_FAIL stays unoverridable, the
  scoring-store firewall stays absolute, and no patient path opens before the four blockers + Portal UI.
- **The mock is always the rollback.** Every live adapter is additive behind a frozen contract; unsetting its
  config returns to the validated mock.
- **Register discipline.** When a milestone executes, it updates `gap-register.md`, `completeness-register.md`,
  the `.claude/*` derived files, and `CHANGELOG.md` in the same step, and moves the resolved item.

## §4 — Recommended order when inputs arrive

1. **C22 decision** (unblocks M11 binding) — costs nothing to decide, unblocks the most.
2. **M9 pharmacology vendor** + **M12 knowledge sign-off** (independent; each clears a High/Critical gap).
3. **M11 terminology+FHIR live** (flips the 301 case codes to live-verified; enables M10's live lab source).
4. **M10 parser range sign-off** (release blocker #3; needs M11b's live Observations).
5. **Portal UI** (completes M5 — release blocker #2) → then **M13 messaging-geo**.
6. **M14 portals** — only after the Class-1 SaMD decision and all blockers green.

Patient-facing production remains closed until **M9 + M10 + Portal-UI + (M4 done)** are all green and validated
against the synthetic case set.

*End of M9–M14 master plan. Each milestone is Phase-2 gated at execution time; supply the named input and a
go-ahead to begin.*
