# PPP-TTT-PLAN.md — Graded-Triage Enhancement to the AI Doctor Consult

**Status:** Design (Phase 2 plan). No code in this phase.
**Author role:** Breath-Ezy principal architect.
**Scope class:** Additive, fail-closed safety layer over the existing five-step grounding pipeline.
**Frozen (RETAIN, byte-unchanged) core it must never edit:** `verification/verifier.js`, `portal/verification-gate.js`, `verification/audit-store.js`.
**Source-of-truth anchors read for this design:** `CLAUDE.md` (`<non_negotiable_invariants>`, `<architecture_rules>`), `.planning/ARCH_PLAN.md`, `.planning/FLOW_PLAN.md`, `.planning/M9-M14-MASTER-PLAN.md`, `docs/HANDOFF-STATE.md`, `docs/grounding/completeness-register.md`, `.claude/schema-index.md`, `Projects/Breath Ezy Documents/scope-registry.json` (v1.3.0), `data/digital_tablet_omnibus.json` (Digital Tablet v1.0), and the live modules `verification/pipeline.js`, `verification/integrity-detectors/{index,detectors}.js`, `integration/trunk-sequencer.js`, `verification/mode.js`.

> **Not legal, clinical, or regulatory advice.** This is an engineering design. Every clinical discriminator, tier assignment, and escalation threshold in `scope-registry.json` is clinician-attested (`attested_by:"KL"`); PPP-TTT consumes those attestations, it never invents them.

---

## 0. The one-paragraph summary

Today a raised safety concern is binary: a flag either fires (`escalate_now` / `continuation_blocked` → halt) or it does not exist. PPP-TTT inserts a **graded verdict** — **STOP / CAUTION / GO** — computed by a **new pure module** (`verification/ppp-ttt/`) that composes into the pipeline exactly the way the H2 integrity-detectors do: as a **monotone-AND** stage that can only **add** caution or escalation, never rescue or downgrade. **STOP** is the existing hard behaviour, made explicit and non-overridable. **GO** is the existing clean-pass behaviour. **CAUTION** is the only new runtime state: a flag was raised but structured interrogation did **not** establish the high-acuity stigmata, so the consult runs a light **ABCDE** protocol to characterise, caveat, safety-net, and — within bounds, subordinate to human sign-off — continue. Nothing PPP-TTT does can set `patient_eligible:true`, downgrade an emergency, authorise a diagnosis or a dose, or read the scoring store.

---

## 1. Overview & how it integrates

### 1.1 The pipeline as it exists (the spine PPP-TTT extends, never replaces)

The canonical spine (`CLAUDE.md` `<architecture_rules>`; `verification/pipeline.js`) is:

```
1 Route     → GroundingPlan            (verification/pipeline.js routing())
2 Retrieve  → Receipts                 (retrieval-mcp.js / retrievalStub)
2b Firewall → PharmCheck (Trunk 8.0)   (mcp/servers/pharmacology/engine.js runPharmCheck)
3 Inject    → ContextPacket            (contextInjection() + context-allowlist.js, DEFAULT-DENY)
4 Generate  → trunk output             (trunk/*-stub-agent.js; external LLM in prod)
5 Verify    → VerificationReport       (verifier.js) —then—> combineVerification(runDetectors())
```

The cross-trunk **outer loop** is `integration/trunk-sequencer.js` `runTrunkSequence()` (feature-flagged `HEYDOC_SEQUENCER`, default OFF). It halts unconditionally on: (1) Trunk 1.0 `safety_gate` = `escalate_now`/T5, (2) any `continuation_blocked` (pharmacology HARD_FAIL / BLOCKED_NO_PROOF), (3) any output that `detectEscalation()` reads as `escalate_now`/T5, (4) any `pass=false`. Its detection is deliberately **over-halting** ("under-triage outranks over-triage").

**Where concerns are raised today (the binary flag→dead-end PPP-TTT graduates):**
- Trunk 1.0 `safety_gate.status` ∈ `clear | escalate_now | blocked_incomplete` (`docs/grounding/trunk-constraints.md`).
- Trunk 6.0 `escalation_signal.requires_urgent_escalation`.
- Trunk 9.0 `risk_outcome` ∈ `escalate_now | urgent_review | routine_follow_up | blocked_incomplete`.
- Pharmacology firewall `PharmCheck.status` ∈ `PASS | WARN | HARD_FAIL | BLOCKED_NO_PROOF`.

Each of these is a place where a concern is *asserted*. PPP-TTT does not move these assertions; it adds a **graded interpretation** of a raised flag against the clinician-attested `scope-registry.json` discriminators, and returns STOP/CAUTION/GO.

### 1.2 Where the new module composes

PPP-TTT composes at **two seams**, both additive, neither touching a frozen file:

**Seam A — per-run composition in `verification/pipeline.js`.** Immediately after the existing line

```js
const verification = combineVerification(verify(candidate_output, evidence), runDetectors(candidate_output, evidence)); // pipeline.js ~L273
```

we add one import and one compose call:

```js
import { gradeConcern, composeTriage } from "./ppp-ttt/index.js";
// ...
const triage = gradeConcern({ flags, scope, evidence, patient_facts });   // Step 1 (+ ABCDE if CAUTION)
const verification2 = composeTriage(verification, triage);                 // monotone-AND (see §2.3)
```

`composeTriage()` mirrors `combineVerification()` exactly: it returns the **same-shaped** object as `verification`, leaves `results[]` (the five verifier checks) **untouched** so `report-schema.js` `.strict()` stays valid, folds a STOP into `pass:false`, appends human-readable triage reasons to `missing_receipts[]`, and exposes structured triage on a **new in-memory field** `ppp_ttt` (never handed to `validateReport()`). The ABCDE record rides the **audit channel** on the pipeline *result* (next to `fact_provenance` / `history_summary`), **never** the `ContextPacket`.

**Seam B — halt integration, with zero sequencer edits (defense in depth).** A STOP verdict's rendered text carries the literal token `escalate_now`, so the **frozen-in-practice** `trunk-sequencer.js` `detectEscalation()` halts on it via its existing HALT RULE 3, and `pass:false` triggers HALT RULE 4 — **without editing the sequencer at all**. (An optional, additive sequencer hook is described in §3.4 for when `HEYDOC_SEQUENCER` graduates from default-OFF; it is not required for correctness.)

### 1.3 The design in one picture

```
 raised flag(s) ──▶ [ Step 1: Veracity Interrogation ]
                        │  (scope-registry discriminators)
                        ▼
             ┌──────────┴───────────┐
        STOP │        CAUTION        │ GO
   (IMMEDIATE)│  (new middle tier)    │(PROCEED_TO_SIGNOFF)
        │     │  [ Step 2: ABCDE ]    │     │
        │     │  A→B→C→D→E            │     │
        ▼     ▼                       ▼     ▼
   halt + escalate    continue-with-safety-net / refer / escalate     normal draft-for-sign-off
   (no override)      (all still → human sign-off; never autonomous)  (human sign-off)
        └───────────────── composeTriage(): monotone-AND ─────────────┘
                     (can only ADD escalation; never rescue/downgrade)
```

---

## 2. GO / CAUTION / STOP state machine

### 2.1 Tier ↔ existing vocabulary mapping

PPP-TTT does **not** invent a fourth vocabulary. It maps onto the clinician-attested `scope-registry.json` `triage_model.tiers`:

| PPP-TTT tier | scope-registry tier | Meaning | Consult effect |
|---|---|---|---|
| **STOP** | `IMMEDIATE` | `always_immediate` condition, OR a `universal_high_acuity_override` match, OR a confirmed `condition_specific.escalate_to_immediate_if` stigma | Mandatory escalation / synchronous-consult / ED routing. **No patient override. No continued passage.** |
| **CAUTION** | *(new middle state; resolves to `REFER`, `PROCEED_TO_SIGNOFF`-with-caveats, or upgrades to `IMMEDIATE`)* | Flag raised, but interrogation did **not** establish the stigmata (grey area / red herring / merely on the differential) | Run ABCDE: characterise, caveat, safety-net, and — bounded, subordinate to sign-off — continue toward a human professional's review |
| **GO** | `PROCEED_TO_SIGNOFF` | No flag, or the flag was interrogated away | Normal draft-for-sign-off flow (still human sign-off, still no autonomous dose/diagnosis) |

`safeguarding_always_report` (e.g. non-accidental injury, R19) is a **STOP-class** verdict with a mandatory-report action; it is acuity-independent and equally non-overridable.

### 2.2 States, transitions, the emergency lock

```mermaid
stateDiagram-v2
    [*] --> NO_FLAG
    NO_FLAG --> GO: no concern raised
    NO_FLAG --> INTERROGATE: flag raised

    INTERROGATE --> STOP: always_immediate OR override-match OR stigma-confirmed OR unresolved/ambiguous (fail-closed)
    INTERROGATE --> GO: flag interrogated away (all discriminators negative, not always_immediate)
    INTERROGATE --> CAUTION: flag persists but stigmata NOT established

    CAUTION --> ABCDE
    ABCDE --> STOP: E/A/B re-surfaces a stigma OR patient reports a red flag mid-ABCDE
    ABCDE --> REFER: B-PP selects refer
    ABCDE --> CONTINUE_SAFETY_NET: B-PP selects continue; E-PP records informed decision

    STOP --> [*]: halt + escalate (LOCKED — no transition out)
    GO --> [*]: draft-for-sign-off
    REFER --> [*]: route to GP/doctor escalation
    CONTINUE_SAFETY_NET --> [*]: draft-for-sign-off WITH caveats + safety-net
```

**The emergency lock (invariant, mechanised):**
- STOP is a **terminal, absorbing** state. Once a run is STOP, no later module — and no patient input — may transition it to CAUTION or GO. This is enforced structurally by the monotone-AND in §2.3, not by convention.
- STOP is entered on *any* of: (a) `tier_model:"always_immediate"`; (b) a `universal_high_acuity_override` string match; (c) a confirmed `condition_specific.escalate_to_immediate_if` discriminator; (d) `safeguarding_always_report`; (e) **fail-closed default** — any ambiguity about whether a concern is an emergency, any unresolved discriminator (`TBD_clinician`, unattested), any module error, or any missing scope entry.

### 2.3 The monotone-AND that makes the lock mechanical

Define a per-run **continue predicate** and a **severity ordinal** `GO(0) < CAUTION(1) < STOP(2)`.

```
composeTriage(verification, triage):
    tier      = max( priorTier(verification), triage.tier )      # ordinal max — can only rise
    may_pass  = verification.pass  AND  tier != STOP             # AND — can only tighten
    return {
      ...verification,
      results: verification.results,                # UNCHANGED (5 verifier checks)
      pass: may_pass,                               # monotone: STOP ⇒ false; never flips false→true
      missing_receipts: [...verification.missing_receipts, ...triage.reasons_if_blocking],
      ppp_ttt: triage,                              # new in-memory field only
    }
```

Properties, proven by contract test (§8):
- **Never rescues:** if `verification.pass === false`, `may_pass` stays false regardless of `triage`.
- **Never downgrades:** `tier` is an ordinal `max`; a STAND-ALONE STOP from the existing pipeline (an already-present `escalate_now`) can only be met or exceeded, never lowered.
- **Additive:** removing PPP-TTT (deleting `verification/ppp-ttt/` and the two added lines) returns the pipeline byte-for-byte to its current behaviour.

---

## 3. Precise file structure (additive only)

### 3.1 New files

```
verification/ppp-ttt/
  index.js                    # public entry: gradeConcern(), composeTriage() (pure)
  interrogate.js              # Step 1 veracity interrogation (pure)
  discriminators.js           # read-only loader + matcher over scope-registry.json
  abcde/
    a-plausible-passage.js    # A-PP  Assessment for Plausible Continued Passage
    b-balance.js              # B-PP  Balancing Practicalities with Precautions
    c-caveats.js              # C-PP  Caveats on Provisionality in Plain Language
    d-pitfalls.js             # D-PP  Descriptor-based Pitfall Pathways if proceeding
    e-education.js            # E-PP  Education/Explanations for a Patient Potestative Position
  record.js                   # builds the self-describing ABCDE record (Digital-Tablet-tagged)
  tablet-tags.js              # SNOMED/LOINC/AU tag helpers over digital_tablet_omnibus conventions
  ledger.js                   # parallel append-only hash-chained PPP-TTT audit trail (PHI-free)

mcp/schemas/
  ppp-ttt-verdict.schema.json         # Step-1 output (tier + evidence considered)
  ppp-ttt-abcde-record.schema.json    # the full A–E record (self-describing, codeable)
  ppp-ttt-ledger-entry.schema.json    # PHI-free hash-chained audit record

verification/ppp-ttt/
  verdict-schema.js           # zod mirror of ppp-ttt-verdict.schema.json
  abcde-schema.js             # zod mirror of ppp-ttt-abcde-record.schema.json
  ledger-schema.js            # zod mirror of ppp-ttt-ledger-entry.schema.json

test/
  contract-ppp-ttt.js             # Step 1 + ABCDE behaviour, edge cases
  contract-ppp-ttt-monotone.js    # PROVES additive-only: cannot downgrade a STOP, cannot rescue a fail
  contract-ppp-ttt-ledger.js      # PHI-free + hash-chain verify + cross-link to main ledger
```

### 3.2 Touch-points (additive edits to NON-frozen files only)

| File | Edit | Why it is safe |
|---|---|---|
| `verification/pipeline.js` | +1 import, +1 `composeTriage()` call after `combineVerification`; add `ppp_ttt` + `abcde_record` to the returned result object (audit channel) | Same pattern already used for `combineVerification` and `fact_provenance`; the `ContextPacket` is byte-identical whether this block runs or not |
| `package.json` | add `test/contract-ppp-ttt*.js` to the `test` script | Additive test wiring only |
| `.claude/schema-index.md` | add the three new schemas | Derived index; STALE-avoidance |
| `Projects/Breath Ezy Documents/scope-registry.json` | **data-only, clinician-gated:** optional `discriminator_status` field per `condition_specific` (see §6) | A clinician attestation, not code; PPP-TTT treats absence/unattested as fail-closed |

**Explicitly untouched (RETAIN, byte-unchanged — verified in §8):** `verification/verifier.js`, `portal/verification-gate.js`, `verification/audit-store.js`, `verification/mode.js`, `verification/context-allowlist.js`, `verification/session-store.js`, `integration/trunk-sequencer.js` (Seam B needs no edit), and every scoring-store path.

### 3.3 Why a *parallel* PPP-TTT ledger (not an edit to `audit-store.js`)

`audit-store.js` `appendEntry()` has a **fixed** entry shape gated by `validateLedgerEntry()`. The ABCDE record does not fit it, and audit-store is frozen. So PPP-TTT gets its **own** append-only hash-chained trail in `verification/ppp-ttt/ledger.js`, reusing the *pattern* (canonical-JSON + `entry_hash = sha256(canonical(entry) + prev_hash)` + `verifyChain()`), with its own schema, and **cross-linked to the main ledger by `{ run_id, candidate_output_hash, trunk_id }`**. Both chains are independently verifiable; the join key is the hash the main verifier already anchors. This preserves full traceability *and* the byte-unchanged core.

### 3.4 Optional additive sequencer hook (only when `HEYDOC_SEQUENCER` graduates)

If/when the sequencer is enabled by default, add (additively) a fifth halt rule that reads the structured `ppp_ttt.tier === "STOP"` field directly, rather than relying solely on the `escalate_now` text match. Until then, Seam B (§1.2) already halts via the existing rules with **no** sequencer edit.

---

## 4. State-management rules and the ABCDE record schema

### 4.1 State-management rules

1. **Encounter-scoped, memory-only.** The PPP-TTT working state lives in the existing `verification/session-store.js` encounter scope (destroy-on-close, no demographic persistence). No PPP-TTT state outlives the encounter except the PHI-free ledger record.
2. **Read-only over scope-registry.** `discriminators.js` loads `scope-registry.json` read-only. It never writes it.
3. **Never reads scoring nodes 10–13.** Safety-net descriptors (D-PP) are sourced from the `redflags-*` knowledge dataset and `scope-registry`, **not** from `13_safety_netting_node` (scoring store, firewalled). The T0–T5 tier *vocabulary* may be referenced by name only, never by reading node 13 content.
4. **Audit channel only.** The ABCDE record and tier verdict never enter the `ContextPacket`. They ride the pipeline *result* (like `fact_provenance`), to the portal/ledger.
5. **PHI-free by construction.** The record stores discriminator IDs, tier codes, caveat codes, safety-net descriptor codes, a patient-decision enum, and SNOMED/LOINC/AU tags — never free-text patient narrative.
6. **Monotone lifetime.** Within a run, `tier` only rises. A STOP is immutable.

### 4.2 The ABCDE record (self-describing, Digital-Tablet-tagged)

Every artefact is tagged per `data/digital_tablet_omnibus.json` conventions: `meta.tag {system:"urn:au:digital-tablet", code:"ppp-ttt-v1"}`, `_snomed`/`loinc`/`unit` triples, AU system URIs (`ns.electronichealth.net.au`, `hl7.org.au`), and `Provenance.agent_types` ∈ `verifier`/`reviewer`/`attester`.

```jsonc
{
  "_pppTtt": {                       // self-describing header (Digital Tablet idiom)
    "schema": "ppp-ttt-abcde-record",
    "version": "1.0",
    "meta": { "tag": [{ "system": "urn:au:digital-tablet", "code": "ppp-ttt-v1",
                        "display": "PPP-TTT graded-triage record" }] }
  },
  "run_id": "run-…",                 // join key to main audit ledger
  "trunk_id": "9.0",
  "candidate_output_hash": "sha256:…", // anchors to the exact verified bytes
  "scope_registry_version": "1.3.0",

  "step1_verdict": {                 // Step 1 — Veracity Interrogation
    "tier": "CAUTION",               // GO | CAUTION | STOP
    "concern": { "area_id": "uti", "condition": "Pyelonephritis",
                 "tier_model": "acuity_dependent",
                 "_snomed": "45816000 | Pyelonephritis |" },
    "discriminators_asked": [
      { "id": "uhao-3", "source": "universal_high_acuity_override",
        "text": "Altered mental status …", "answer": "absent",
        "_snomed": "419284004 | Altered mental status |" },
      { "id": "pyelo-cs-1", "source": "condition_specific.escalate_to_immediate_if",
        "text": "Unstable vitals …", "answer": "absent" }
    ],
    "entity_class": "differential_only", // typifies_stigmata | differential_only
    "evidence_considered": [ "ev-…", "prov-…" ], // EvidenceNode ids from the packet audit channel
    "reason": "flag raised (pyelonephritis on differential); no override or condition-specific stigma confirmed → CAUTION"
  },

  "abcde": {                         // Step 2 — only present when step1_verdict.tier == CAUTION
    "A_plausible_passage": {
      "graded_verdict": "plausibly_safe",   // plausibly_safe | not_safe → forces STOP
      "residual_discriminators_open": [],
      "_loinc_section": "51848-0"           // Assessment
    },
    "B_balance": {
      "pathway": "continue_with_safety_net", // continue_with_safety_net | refer | escalate
      "residual_risk": "low",                // negligible|low|moderate|high  (RiskAssessment.prediction_qualitative)
      "practicality_benefit": "telehealth review adequate; no exam-dependent stigma outstanding"
    },
    "C_caveats": {
      "provisionality": "provisional, clinician-confirmed",
      "no_diagnosis": true,                  // surfaced to patient (suggestion-only)
      "no_decisions": true,
      "plain_language": "This is a suggestion for a clinician to review, not a diagnosis or a decision."
    },
    "D_pitfalls": {
      "safety_net": [
        { "id": "sn-pyelo-1",
          "descriptor": "Return / call 000 if fever ≥38.5, rigors, vomiting, confusion, or reduced urine output",
          "_snomed": "225928004 | Patient advised to return if symptoms worsen |",
          "watch_for": ["high fever", "rigors", "confusion", "oliguria"],
          "when_urgent": "any of the above, or feeling rapidly worse",
          "tier_ref": "T4-T5" },            // vocabulary name only; NOT read from node 13
        { "id": "pf-1", "coded_pitfall": "silent progression to sepsis",
          "_snomed": "91302008 | Sepsis |" }
      ]
    },
    "E_education": {
      "explanation_plain": "…",
      "bounded_choice_offered": true,        // proceed | decline — CAUTION only
      "patient_decision": "proceed",         // proceed | decline | undecided
      "decision_recorded_at_utc": "2026-07-11T…Z",
      "subordinate_to_signoff": true,        // ALWAYS true; never overrides a gate
      "potestative_scope": "continued_passage_only" // never authorises dx/rx
    }
  },

  "provenance": {
    "agent_types": ["verifier"],
    "created_at_utc": "2026-07-11T…Z",
    "created_by": "verification/ppp-ttt/record.js"
  }
}
```

**Digital-Tablet field-mapping used (all pre-existing conventions):** `red_flags_assessed` / `safety_netting_documented` (`ClinicalImpression._freetext_reasoning_tags`), `shared_decision_making` + `Consent` (patient decision), `RiskAssessment.prediction_qualitative` (residual risk), `_composition_section_LOINC` (`51848-0` Assessment, `18776-5` Plan), and `meta.tag urn:au:digital-tablet`. Codes are **bound** through `terminology-lookup.schema.json` (systems `SNOMED_CT/ICD_10_AM/LOINC/PBS/AMT`) — PPP-TTT never mints a code (see §7).

---

## 5. API / data-contract schemas (zod) for each module's I/O

All schemas are `.strict()` (default-deny on unknown keys), mirroring the repo's zod convention. Sketches (this is design; implementation is Step-1 execution work in §10).

### 5.1 Step 1 — `gradeConcern()` I/O (`verdict-schema.js`)

```js
const Answer = z.enum(["present", "absent", "unknown"]);

export const RaisedFlag = z.object({
  source: z.enum(["trunk_1.0", "trunk_6.0", "trunk_9.0", "pharmacology_firewall", "other"]),
  area_id: z.string().min(1),           // scope-registry areas[].id
  condition: z.string().min(1),         // exclusions[].condition or managed[]
}).strict();

export const GradeConcernInput = z.object({
  flags: z.array(RaisedFlag).min(1),
  scope_registry_version: z.literal("1.3.0"),
  evidence: z.object({                  // read-only; the pipeline's existing evidence bundle
    citations: z.array(z.string()).default([]),
    terminology_receipts: z.array(z.string()).default([]),
  }).partial().strict(),
  patient_answers: z.record(z.string(), Answer).default({}), // discriminatorId → answer
}).strict();

export const DiscriminatorAsked = z.object({
  id: z.string(),
  source: z.enum(["universal_high_acuity_override", "condition_specific.escalate_to_immediate_if",
                  "condition_specific.refer_if", "always_immediate"]),
  text: z.string(),
  answer: Answer,
  snomed: z.string().optional(),
}).strict();

export const Step1Verdict = z.object({
  tier: z.enum(["GO", "CAUTION", "STOP"]),
  tier_model: z.enum(["always_immediate", "acuity_dependent", "safeguarding_always_report"]),
  entity_class: z.enum(["typifies_stigmata", "differential_only", "indeterminate"]),
  discriminators_asked: z.array(DiscriminatorAsked),
  evidence_considered: z.array(z.string()),
  reason: z.string(),
  fail_closed: z.boolean(),             // true when STOP was reached by the default-deny branch
}).strict();
```

### 5.2 ABCDE module I/O (`abcde-schema.js`)

```js
export const APP = z.object({           // A — Plausible Continued Passage
  graded_verdict: z.enum(["plausibly_safe", "not_safe"]),
  residual_discriminators_open: z.array(z.string()),
}).strict();

export const BPP = z.object({           // B — Balancing Practicalities with Precautions
  pathway: z.enum(["continue_with_safety_net", "refer", "escalate"]),
  residual_risk: z.enum(["negligible", "low", "moderate", "high"]),
  practicality_benefit: z.string(),
}).strict();

export const CPP = z.object({           // C — Caveats on Provisionality
  provisionality: z.string(),
  no_diagnosis: z.literal(true),        // MUST be true — suggestion-only
  no_decisions: z.literal(true),
  plain_language: z.string().min(1),
}).strict();

export const SafetyNetDescriptor = z.object({
  id: z.string(),
  descriptor: z.string().min(1),
  watch_for: z.array(z.string()).min(1),
  when_urgent: z.string().min(1),
  snomed: z.string().optional(),
  tier_ref: z.string().optional(),      // vocabulary name only; never read from node 13
}).strict();

export const DPP = z.object({           // D — Descriptor-based Pitfall Pathways
  safety_net: z.array(SafetyNetDescriptor).min(1),
  coded_pitfalls: z.array(z.object({ label: z.string(), snomed: z.string().optional() })),
}).strict();

export const EPP = z.object({           // E — Education / Potestative Position
  explanation_plain: z.string().min(1),
  bounded_choice_offered: z.literal(true),
  patient_decision: z.enum(["proceed", "decline", "undecided"]),
  decision_recorded_at_utc: z.string().datetime(),
  subordinate_to_signoff: z.literal(true),
  potestative_scope: z.literal("continued_passage_only"),
}).strict();

export const ABCDE = z.object({ A_plausible_passage: APP, B_balance: BPP, C_caveats: CPP,
                                D_pitfalls: DPP, E_education: EPP }).strict();
```

### 5.3 Composition + ledger contracts

```js
// composeTriage() output = the SAME shape as combineVerification()'s output, plus `ppp_ttt`.
export const TriageComposite = z.object({
  pass: z.boolean(),
  results: z.array(z.any()),            // the five verifier checks, UNCHANGED
  missing_receipts: z.array(z.string()),
  candidate_output_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  ppp_ttt: Step1Verdict.extend({ abcde: ABCDE.optional() }),
}).passthrough(); // passthrough so it never strips fields the frozen verifier set

// PHI-free hash-chained audit entry (ppp-ttt-ledger-entry.schema.json)
export const PppTttLedgerEntry = z.object({
  seq: z.number().int().nonnegative(),
  entry_id: z.string(),
  recorded_at_utc: z.string().datetime(),
  prev_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  run_id: z.string(),
  trunk_id: z.string().optional(),
  candidate_output_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/), // cross-link to main ledger
  tier: z.enum(["GO", "CAUTION", "STOP"]),
  fail_closed: z.boolean(),
  discriminator_ids: z.array(z.string()),   // IDs only — no narrative
  caveat_codes: z.array(z.string()),
  safety_net_ids: z.array(z.string()),
  patient_decision: z.enum(["proceed", "decline", "undecided", "n/a"]),
  entry_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();
```

A PHI-leakage contract test (§8) asserts the ledger entry contains **no** free-text patient fields.

---

## 6. Explicit edge cases

| # | Case | PPP-TTT behaviour |
|---|---|---|
| 1 | **Red-herring flag** (raised, all discriminators negative, not `always_immediate`) | Interrogated away → **GO**. Recorded with `entity_class:"differential_only"` and the negative discriminators, so the audit shows *why* it cleared. |
| 2 | **Multiple simultaneous flags** | Grade each independently; the run's tier is the **ordinal max** across flags. Any single STOP ⇒ run STOP. ABCDE runs only for the CAUTION flags, but a co-present STOP absorbs them. |
| 3 | **Mixed tier** (one GO, one CAUTION) | Run tier = CAUTION; ABCDE runs for the CAUTION flag; the GO flag is recorded as cleared. Never averages tiers — max only. |
| 4 | **Patient declines** (E-PP `patient_decision:"decline"`) | No autonomous continuation. Route to human review / refer; record the decision. Decline never *lowers* a tier (cannot turn STOP into GO); it only stops continued passage. |
| 5 | **Ambiguous acuity** (discriminator answer `unknown`, or stigma neither confirmed nor excluded) | **Fail-closed → STOP** (`fail_closed:true`). "When in doubt, escalate" (`CLAUDE.md`). Never CAUTION-by-default on ambiguity. |
| 6 | **Discriminator = `TBD_clinician`** (unattested / `discriminator_status` not `attested`) | Treated as an **open** discriminator that cannot be evaluated → **fail-closed STOP**. The registry today has no `TBD_clinician` field; PPP-TTT treats a missing/`attested:false` discriminator identically. Resolving it is a clinician attestation, not a code change. |
| 7 | **Condition not in scope-registry** | No attested basis to grade a raised flag → **fail-closed STOP** (default-deny; mirrors `context-allowlist.js`). |
| 8 | **`always_immediate` condition** | **STOP**, immediately, no interrogation needed and none can clear it. Emits `escalate_now`. |
| 9 | **`safeguarding_always_report` (NAI)** | **STOP-class** with mandatory-report action; acuity-independent; no patient override. |
| 10 | **Module error / malformed scope entry / schema parse fail** | **Fail-closed STOP**; the error is logged; the frozen pipeline still halts via `pass:false`. |
| 11 | **STOP already set by the existing pipeline** (pre-existing `escalate_now` / HARD_FAIL) | `composeTriage` `max()` keeps STOP; PPP-TTT can add reasons but cannot lower it. |
| 12 | **Script-adjacent CAUTION continue** | "Continue" never means autonomous prescribing: any script-generating path routes to Trunk 8.0 firewall + **synchronous** consult + human sign-off (see §7). |

---

## 7. Predicted failure modes + proactive mitigations

| Failure mode | Where it could bite | Design mitigation |
|---|---|---|
| **Over-permissive drift** — CAUTION quietly becomes the default and lets marginal cases through | Step 1 grading; ABCDE B-PP pathway selection | CAUTION is only reachable when a flag persists **and** stigmata are *not* established **and** the case is scope-attested; every other branch (ambiguity, unattested, off-registry, error) is **STOP**. A monotone-AND means CAUTION can never *lower* an existing STOP. Contract test asserts the default-deny branches all yield STOP. |
| **Silent downgrade of a STOP** | `composeTriage`, sequencer, portal | `tier` is an ordinal `max`; `pass` is an `AND`. `contract-ppp-ttt-monotone.js` fuzzes: for every input where the base is STOP/`pass:false`, output is STOP/`pass:false`. STOP also emits `escalate_now` text so the untouched sequencer halts independently (defense in depth). Byte-unchanged verifier/gate/audit re-asserted in CI. |
| **Caveat fatigue** — so many caveats the patient stops reading | C-PP, E-PP, patient UI | Simplicity is the retention filter (§9). C-PP emits **one** provisionality statement + the two fixed declarations ("No diagnosis", "No decisions"); D-PP emits a **short** ranked safety-net list, not an exhaustive dump. UI work is a later, gated step. |
| **Patient-coercion risk** — the "bounded choice" nudges the patient to proceed | E-PP potestative position | The choice is offered **only in CAUTION**, is **subordinate_to_signoff:true** always, `potestative_scope:"continued_passage_only"`, and can never authorise dx/rx or override a gate. Decline is always a first-class, non-penalised option; declining never changes the clinical tier. |
| **PHI leakage** into the audit trail | `ledger.js`, ABCDE record | Ledger entry stores IDs/codes/enums only; a PHI-leakage contract test rejects free-text patient fields. Content persistence remains synthetic-only (the existing `persistContent` guard is untouched). Record rides the audit channel, never the packet. |
| **Scoring-store leak** via safety-net descriptors | D-PP | D-PP sources descriptors from `redflags-*` + `scope-registry` only; the T0–T5 vocabulary is referenced by **name**, never by reading `13_safety_netting_node`. Contract test asserts no read path to nodes 10–13 (mirrors F9). |
| **Autonomous prescribing through "continue"** | CAUTION continue pathway | "Continue the consult" = keep reasoning + hand to a human. Any dose/script path still routes through the Trunk 8.0 pharmacology firewall (only dose source; HARD_FAIL terminal) and a **synchronous** consult. PPP-TTT never emits a dose; the `advisory_dose_leak` detector still guards the output. |
| **Fabricated codes** in tablet tags | `tablet-tags.js`, `record.js` | PPP-TTT binds codes only through `terminology-lookup.schema.json` receipts; the frozen `verifier.js` `no_invented_codes` check still runs on any surfaced text. No code is minted in-module. |
| **Mock-as-live** for the PPP-TTT record | `ledger.js` | Reuses `mode.js` `normaliseMode`: staging/production/unknown enforce live; the parallel ledger records `mode` the same way; no new mock-as-live seam. |

---

## 8. Test plan mapping to the blocking gates

The six blocking gates (from `package.json` scripts) plus new PPP-TTT contract tests:

| Gate | Command | What PPP-TTT must prove |
|---|---|---|
| **licence:check** | `node scripts/check-licence-clearance.mjs` | PPP-TTT is 100% first-party (no harvested dependency); no new manifest row needed, or a first-party row that clears. Gate stays green (0 blocks). |
| **npm test** | the full contract-suite set (39 `contract-*` suites today) + **3 new** (`contract-ppp-ttt`, `contract-ppp-ttt-monotone`, `contract-ppp-ttt-ledger`) | Step-1 grading correctness across all edge cases (§6); ABCDE schema conformance; monotone/additive proof; PHI-free + hash-chain ledger. |
| **verification** | `node verification/run.js` | End-to-end pipeline still passes with PPP-TTT composed in; `results[]` unchanged (report-schema `.strict()` still valid); a clean stub still passes (GO). |
| **trunk:stub:all** | 9 trunk stubs | Each trunk stub run composes PPP-TTT without regressions; a stub that emits a red-flag condition drives STOP; a benign stub drives GO. |
| **eval:cases** | `node scripts/eval-case-gate.mjs` | Attested cases keep their expected disposition; PPP-TTT never flips a case scored IMMEDIATE to a lower tier; CAUTION cases produce a safety-net + caveat set. No scoring-node read. |
| **bench:mirage** | `node test/bench-mirage-gate.js` | Retrieval-trust gate unaffected; PPP-TTT touches no retrieval path and sets no `patient_eligible`. Corpus attestation status unchanged. |

**New contract tests (the additive-only proof):**
- `contract-ppp-ttt-monotone.js` — **the load-bearing test.** Property/fuzz: (a) for all inputs, `composeTriage(base, t).pass ⇒ base.pass` (never rescues); (b) if any `always_immediate` / override-match / ambiguity / off-registry / error, output tier = STOP; (c) `ppp_ttt` never appears in `results[]`; (d) removing the two added lines from `pipeline.js` reproduces current behaviour (snapshot).
- `contract-ppp-ttt.js` — Step 1 + ABCDE across §6 edge cases; asserts CAUTION only from the one legitimate branch.
- `contract-ppp-ttt-ledger.js` — hash-chain `verifyChain()` end-to-end; PHI-free assertion; cross-link `{run_id, candidate_output_hash}` resolves to the main ledger entry.
- **Byte-unchanged CI assertion** — a checksum test (extend the existing adversarial-review check) that fails if `verifier.js`, `portal/verification-gate.js`, or `audit-store.js` change.

---

## 9. What NOT to build (the simplicity boundary)

Simplicity is the **primary** objective — ease and timely use is the retention filter. Out of scope for PPP-TTT:

- **No multi-screen interrogation.** Step 1 asks only the discriminating questions the raised flag actually needs (the `universal_high_acuity_override` + that condition's `condition_specific` list) — not a generic questionnaire. If a flag needs zero questions to resolve (`always_immediate` → STOP; no flag → GO), it asks none.
- **No new orchestrator / no new state machine engine.** Reuse the sequencer's halt model and the session-store scope. (Mirrors FLOW_PLAN D-1: "no new orchestrator.")
- **No fourth tier, no sub-tiers.** GO/CAUTION/STOP map onto the existing `triage_model.tiers`. No "CAUTION-low / CAUTION-high" proliferation.
- **No editing the frozen core**, no touching the scoring store, no new retrieval path, nothing that sets `patient_eligible`.
- **No patient-facing UI in Step 1.** The potestative choice (E-PP) is *modelled and recorded* now; the actual patient screen is a later step behind the mock/portal gates (§10).
- **No autonomous clinical content.** No diagnosis, no dose, no guideline minting, no autonomous script. Every output is a suggestion for a health professional.
- **No caveat inflation.** One provisionality statement + two fixed declarations + a short ranked safety-net list. If a caveat doesn't add clear value at minimal friction, it is out of scope.
- **No live WORM / retention decisions** for the PPP-TTT ledger — it rides the same deploy/regulatory decision as the M8 substrate (surface, don't decide).

---

## 10. Sequenced execution steps

Follows the repo's plan-gated workflow (Phase 0 scan → 1 research → 2 plan GATE → 3 execute per-phase GATE → 4 review). PPP-TTT slots as a new internal milestone (no external input required), composing on the H2 detector lineage.

**Step 1 — Core modules + tests (no UI, no patient-facing surface).**
1. `mcp/schemas/ppp-ttt-*.schema.json` + zod mirrors (`verdict-schema.js`, `abcde-schema.js`, `ledger-schema.js`).
2. `discriminators.js` (read-only scope-registry loader + matcher) and `interrogate.js` (Step 1).
3. `abcde/*` (A–E as discrete pure modules) + `record.js` + `tablet-tags.js`.
4. `index.js` (`gradeConcern`, `composeTriage`) and `ledger.js` (parallel hash-chain).
5. Wire the two additive lines in `verification/pipeline.js`; add tests to `package.json`.
6. `test/contract-ppp-ttt*.js` — including the load-bearing monotone/additive proof and the byte-unchanged CI assertion.
7. Green all six blocking gates + the three new suites. **GATE.**

**Step 2 — Sequencer hook (optional, additive).** Add the structured `ppp_ttt.tier === "STOP"` halt rule to `trunk-sequencer.js` — only if/when `HEYDOC_SEQUENCER` graduates from default-OFF. Until then Seam B suffices.

**Step 3 — Patient-facing surface (later; stays behind mock/portal gates).** The E-PP bounded-choice screen and the plain-language caveat/safety-net presentation. Built behind the mode-normaliser (mock/dry_run refuse patient release) and routed through `portal/verification-gate.js` `releaseToPatient()`. Nothing here sets `patient_eligible:true`; that remains the four-part precondition (MIRAGE-passed, governance-gated, corpus-attested, Portal-UI + durable gate-record) owned elsewhere.

**Step 4 — Clinician attestation of any new discriminator status.** If the optional `discriminator_status` field is adopted in `scope-registry.json`, it is filled by clinician attestation (like the existing `attested:true`), not by code. Until attested, PPP-TTT fails those discriminators closed (STOP).

---

## Appendix A — Invariant preservation checklist (all must hold)

- [x] `verifier.js`, `portal/verification-gate.js`, `audit-store.js` **byte-unchanged** (CI checksum test).
- [x] New logic is a **pure module** composed via **monotone-AND** (H2 pattern); can only add caution/escalation.
- [x] `always_immediate` + confirmed high-acuity stigmata **never downgradable**; no patient override; STOP + escalate stands.
- [x] **No autonomous diagnosis or prescribing**; every output is a draft/suggestion; "No diagnosis / No decisions" surfaced (C-PP).
- [x] Human sign-off + the **four-part patient-eligibility precondition** unchanged; nothing sets `patient_eligible:true`.
- [x] Scoring-store firewall (nodes 10–13) **never read**; context-allowlist, session-store, mode-normaliser intact.
- [x] **Async-prescribing rule intact**: "continue" = reason + hand to human; script paths → synchronous consult + Trunk 8.0 firewall.
- [x] **Fail-closed default**: any uncertainty → STOP/escalate.
- [x] **Full traceability**: every flag, discriminator, verdict, caveat, pitfall, and patient decision logged to a PHI-free hash-chained trail, cross-linked to the main ledger, tagged in `digital_tablet_omnibus`.

## Appendix B — Key repo anchors (for the implementer)

- Composition seam: `verification/pipeline.js` ~L273 (`combineVerification(verify(), runDetectors())`).
- Monotone-AND reference implementation: `verification/integrity-detectors/index.js` `combineVerification()`.
- Detector purity contract: `verification/integrity-detectors/detectors.js` (`detect(output, evidence) -> {detector, passed, severity, reason?}`).
- Halt model: `integration/trunk-sequencer.js` `detectEscalation()` + HALT RULES 1–4.
- Release gate: `portal/verification-gate.js` `releaseToPatient()` (fail-closed, hash-bound, mode-guarded).
- Audit chain pattern to mirror: `verification/audit-store.js` (`computeEntryHash`, `verifyChain`, substrate seam).
- Mode enforcement: `verification/mode.js` `normaliseMode()`.
- Firewall (scoring store): `verification/context-allowlist.js` (DEFAULT-DENY).
- Tiers + discriminators: `Projects/Breath Ezy Documents/scope-registry.json` v1.3.0 — `triage_model.tiers`, `triage_model.universal_high_acuity_override`, `areas[].exclusions[].{tier_model, condition_specific.escalate_to_immediate_if[], refer_if}`.
- Self-describing tags: `data/digital_tablet_omnibus.json` — `meta.tag urn:au:digital-tablet`, `_snomed`/`loinc`, AU extensions.
