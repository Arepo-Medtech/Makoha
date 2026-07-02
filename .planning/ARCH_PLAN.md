# ARCH_PLAN.md — Breath-Ezy AI Doctor · Architectural Blueprint (Phase 1)

> **Read this first, every session, before writing any code.**
> Principal Architect blueprint for `kenleefreo/breath-ezy`. It inherits and honours `CLAUDE.md`
> mechanically; where this plan and the charter disagree, the charter wins and this file is the defect.
> **Authority order:** live repo > Input B (repo digest) > Input A (Complete Reference, = *intent*).
> **Model split (operator override 2026-07-02):** reasoning/hard-logic steps → Claude Fable 5; mechanical
> scaffolding steps → Claude Opus 4.8. Supersedes the charter Opus-plan/Sonnet-execute split.
> **Scope:** engineering only. Nothing patient-facing. The sealed scoring nodes `10`–`13` are inventoried by
> structure only and never read, reproduced, or reasoned from.
> Version: 1.0.1 · Generated 2026-07-02 · Amended 2026-07-03 (M0): FMEA §3.6 Owner column renumbered to §3.7
> milestones; model-split line updated per operator override. Supersedes nothing (first blueprint).

---

## §0 — How to use this document

This is an execution-ready plan, not a discussion. It has nine parts (3.1–3.9) matching the commissioning
brief. The **Retain/Refine/Replace register (3.2)** is the spine; the **FMEA (3.6)** predicts where the system
breaks; the **roadmap (3.7)** sequences the work by release-blocker impact; the **per-step directives (3.8)** are
what the executor runs. Every step names its exact files, its contract tests, and the Completeness-Audit exit
state it must reach. No step is "done" while an `UNBUILT`, `EMPTY`, `PARTIAL`, `BLIND_STUB`, or `DEAD_END`
sits on its path.

**Risk notation used throughout:** `L×I` where L = likelihood (1 rare … 5 near-certain) and I = impact
(1 cosmetic … 5 patient-harm / medicolegal). Band: **Critical ≥ 16**, **High 9–15**, **Medium 4–8**, **Low ≤ 3**.
Under-triage outranks over-triage; `BLIND_STUB`/`DEAD_END` outrank `SAFE_STUB` at equal feature impact.

---

## §1 — The invariant (restated, never traded off)

Reproduced from `CLAUDE.md` `<non_negotiable_invariants>` and Part D.9 — mechanical, not prompt-only.
**No proposal in this plan weakens any of these. If a desirable change conflicts with one, the change is invalid.**

- No autonomous diagnosis; no autonomous prescription (doses **only** from a PharmCheck receipt via `pharmacology`).
- No fabricated codes (SNOMED CT / ICD-10-AM / ICD-11 / LOINC / PBS / AMT only from a terminology receipt).
- No fabricated operational facts (IHI, labs, stock, ECG only from a live-data receipt).
- No invented service names outside the Allowed Service Registry.
- No `HARD_FAIL` override — a pharmacology `HARD_FAIL` blocks continuation unconditionally, no path around it.
- No raw lab numbers in LLM context — sanitised by the investigation parser before injection.
- Five-step spine (Route → Retrieve → Inject → Generate → Verify) wraps **every** trunk generation; no step bypassed.
- Every clinical claim traces `EvidenceNode → Receipt → MCP tool call`.
- Fail-safe default: missing proof → `BLOCKED_NO_PROOF`, never a fabricated substitute.
- `candidate_output_hash` (SHA-256) is the medicolegal record — never removed, weakened, or bypassed.
- Scoring-store firewall (`10`–`13`) absolute — a leak invalidates the entire evaluation.
- Clinician Verification Portal is the mandatory human-in-the-loop checkpoint and a **release blocker**;
  nothing may be wired to a patient-facing path until it exists.

**Self-verification hook (§3.9) confirms none of the above is weakened anywhere in this plan.**

---

## §2 — Agnostic-mandate summary

The repository is evidence of one path taken, not a specification to preserve. The verdict for every material
component is in **3.2**. Headline stance: the **deterministic safety core is genuinely good and is cemented as
RETAIN** (verifier, pharmacology engine, investigation parser, zod pipeline gates, hash-chained ledger). The
gaps are almost entirely **orchestration, live-connection, and drift**, not rotten foundations. Two structural
absences that Input A's diagrams imply exist but the code does not contain — the **cross-trunk sequencer** and
the **live context-injection allow-list** — are the highest-leverage *new* engineering, and one of them
(`context-injection-allowlist`) is a High patient-facing gap already in the register. Bias: retain what is
tested and working; every divergence below carries a written rationale and a risk rating.

---

# 3.1 — Reconciled system model (target vs. current)

## 3.1.1 Canonical topology (as-built, verified against code)

```
                         ┌───────────────────────── ACCESS PORTALS (CONCEPT — not in repo) ─────────────────────────┐
                         │  "Well-to-do" (patient)     "Be My Doc" (clinician/B2B)     Rx-Remedy (dispensing/retail)  │
                         └───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                                                     │  (D.12–D.16 — CONCEPT-STAGE, no code)
                                                                     ▼
   ╔═════════════════════════════════════════════ (AU)CARE — AI DOCTOR CORE ═══════════════════════════════════════════╗
   ║                                                                                                                    ║
   ║   Trunk sequence 1.0 → 9.0   (routing_plan.next_trunks PRODUCED by 1.0 …                                           ║
   ║   ┌─────────────────────────────────────────────────────────────┐   … but NO CODE CONSUMES IT — see DEAD_END-1)   ║
   ║   │  For EACH trunk, the FIVE-STEP GROUNDING PIPELINE nests:      │                                                ║
   ║   │                                                               │                                                ║
   ║   │   Step 1 Route ─ routing()          → GroundingPlan  [zod ✓]  │                                                ║
   ║   │   Step 2 Retrieve ─ retrievalStub() / retrieveViaMcp()        │───▶ 7 MCP SERVERS (all mock):                  ║
   ║   │        → Receipt(request_id,ts,upstream,mode)                 │      docs✓stub  identity-au✓stub              ║
   ║   │   Step 2b Firewall ─ runPharmCheck() in-process (Trunk 8.0)   │      terminology◑  knowledge◑                 ║
   ║   │        → PharmCheck; HARD_FAIL ⇒ continuation_blocked         │      fhir-broker◑  pharmacology◑              ║
   ║   │   Step 2c FHIR ─ retrieveFhirObservations() → parser          │      messaging-geo◑ (NOT pipeline-wired)      ║
   ║   │   Step 3 Inject ─ contextInjection()→ ContextPacket [zod ✓]   │      (raw labs → investigation-parser →        ║
   ║   │        (lab_result MUST be sanitised — superRefine gate)      │       sanitised fact; raw number never in packet)║
   ║   │   Step 4 Generate ─ (trunk LLM; EXTERNAL — stubbed here)      │                                                ║
   ║   │   Step 5 Verify ─ verify() → VerificationReport [zod ✓]       │───▶ hash FIRST → 5 hard checks →              ║
   ║   │        pass=false ⇒ reject · HARD_FAIL ⇒ block               │      append-only hash-chained AUDIT LEDGER ✓  ║
   ║   └─────────────────────────────────────────────────────────────┘      (+ synthetic-only content store)          ║
   ║                                                                                                                    ║
   ║   ░░░ MANDATORY HUMAN-IN-THE-LOOP GATE — Clinician Verification Portal ░░░  ◀── UNBUILT (Critical release blocker) ║
   ╚═════════════════════════════════════════════════════════════════════╤══════════════════════════════════════════════╝
                                                                          │  (no patient-facing path may open here)
                                                                          ▼
                                          DATA LAYER (synthetic only):
                                          Presentation store 00/01/02 (AI may read)
                                          Scoring store 10/11/12/13 (AI NEVER reads — FIREWALL)
                                          Digital Tablet omnibus · 52 cases · case-authoring/ingest kit
```

## 3.1.2 Component inventory with Completeness-Audit state (as-built)

| Component | Layer | Target (Input A) | Current state (Input B / live) | Audit state |
|---|---|---|---|---|
| Five-step grounding pipeline | core wrapper | spine, nests per trunk | built as mock; per-trunk only | **COMPLETE (mock)** |
| Cross-trunk sequencer (1.0→9.0) | core orchestration | "nine trunks are the sequence" (Fig D.1a) | **absent** — `routing_plan.next_trunks` produced, unconsumed | **DEAD_END (new)** |
| Nine trunk prompts + stub agents | core reasoning | 9 narrow trunks | 9 prompts, 9 cheatsheets, 8 named stubs + 1 generic | **COMPLETE (mock)** |
| Verifier (5 hard checks) | Step 5 | 5 mechanical gates | built, tested, per-code binding, mock-flag | **COMPLETE** |
| `docs` server | retrieval | guideline citation source | stub | **COMPLETE (stub)** |
| `knowledge` server + 3 datasets | retrieval | KG + benign/AxisB/redflag | mock; datasets DEV-provisional; graphs empty | **PARTIAL** |
| `identity-au` server | retrieval | IHI isolation | stub | **COMPLETE (stub)** |
| `terminology` server (6 systems) | retrieval | SNOMED/ICD-10-AM/LOINC/PBS | mock multi-system; live NCTS pending | **PARTIAL** |
| `fhir-broker` (+ conformance) | retrieval | FHIR R4 read/search + validate | mock; structural conformance vs vendored SDs | **PARTIAL** |
| `pharmacology` engine + Trunk 8.0 firewall | retrieval/safety | only dose source; HARD_FAIL | mock core wired; live vendor pending | **PARTIAL (Critical, pf:true)** |
| `messaging-geo` server | retrieval | comms + geo | mock; never-sends; **not pipeline-wired** | **PARTIAL** |
| Investigation parser (sanitiser) | Step 3 | no raw labs to LLM | engine built; ranges DEV-provisional | **PARTIAL (Critical, pf:true)** |
| Live context-injection allow-list | Step 3 | mirror ingest firewall | **UNBUILT** in `pipeline.js` | **UNBUILT (High, pf:true)** |
| Session-bound persistence | state | no persistence beyond session | **UNBUILT** (policy only) | **UNBUILT (Critical, pf:true)** |
| Clinician Verification Portal | HITL gate | mandatory checkpoint | **UNBUILT** | **UNBUILT (Critical, pf:true)** |
| Hash-chained audit ledger | medicolegal | append-only, tamper-evident | built (JSONL); prod WORM pending | **PARTIAL (High)** |
| Two-store case schema | data | 7 files/case, firewall | 7 schemas; firewall enforced at ingest | **COMPLETE** |
| Synthetic case set | data | ≥45, 60/30/10 | **52 ingested** (register still says 1 — STALE) | **PARTIAL (distribution skew)** |
| 12 pipeline schemas / 7 data schemas | contracts | contracted edges | present; 4 pipeline edges zod-gated | **COMPLETE** |
| Rx-Remedy / Well-to-do / Be My Doc | portals | end-to-end journey | concept-stage; **no code** | **UNBUILT (out of engineering scope now)** |

## 3.1.3 Diagram-vs-code drift (vision cross-check of Input A figures against Input B topology)

Vision-checked Figure D.0 (canonical system map), D.1/D.1a (five-step + nesting), D.4 (MCP servers). Findings:

- **D.0 draws the human-in-the-loop "warm band" as an architectural element that exists.** In code it is
  **UNBUILT**. The diagram is target-state; the drift is a Critical release blocker, not a rendering error. **Flag, not fix.**
- **D.1a "the five-step pipeline nests inside every trunk" and the 1.0→9.0 arrow imply an orchestrated sequence.**
  Code runs the pipeline **per single trunk** (`runTrunkWithGrounding`); there is **no sequencer** that walks
  `routing_plan.next_trunks` and stops on `continuation_blocked`. **DEAD_END-1 (new finding).**
- **D.4 shows `messaging-geo` inside the server ring on equal footing.** Code ships it mock but **not wired into
  the pipeline** (gated by the Portal). Diagram over-states integration by one server. **Consistent with intent**
  (D.6 says "not yet wired"); no defect, but note for the topology reader.
- **D.1 five-step order (Route→Retrieve→Inject→Generate→Verify) matches code exactly.** Generation (Step 4) is
  external (the LLM) and stubbed in-repo — correct by design. **No drift.**

---

# 3.2 — Retain / Refine / Replace register

Lead rows are on the critical path to the four release blockers (pharmacology vendor, Verification Portal, live
FHIR/parser sign-off, session persistence). `risk` is the risk **of the change proposed**, not of the component.

| # | Component · path | Current state | Verdict | Rationale | Risk (L×I) | Blast radius | Migration / rollback |
|---|---|---|---|---|---|---|---|
| C1 | Verifier `verification/verifier.js` | COMPLETE, tested | **RETAIN** | 5 checks mechanical; hash-first; per-code binding (SNOMED/ICD-10-AM/LOINC/PBS) + coarse ICD-11; mock-flagging; fail-safe favours over-flag. Correct by construction. Do not rewrite. | 1×5=5 (of touching it) | all trunks | n/a — freeze; changes only via 3.6 FMEA rows F1/F4 |
| C2 | Pharmacology engine `mcp/servers/pharmacology/engine.js` | PARTIAL (mock) | **RETAIN** engine · **REFINE** at live-connect | Deterministic 5-check core is exemplary: dose only on PASS/WARN, HARD_FAIL terminal, unknown-age→NOT_RUN→BLOCKED (no silent dose), S8→PDMP-or-HARD_FAIL. Keep the pure engine verbatim; the *only* delta is the live vendor adapter behind the same contract. | 2×5=10 | Trunk 8.0, verifier check 5 | vendor adapter is additive; `PHARM_VENDOR=stub` remains the rollback |
| C3 | Investigation parser `verification/investigation-parser.js` | PARTIAL | **RETAIN** engine · **REFINE** ranges | Sanitiser never emits a raw number; unknown/non-numeric → "U" fail-safe; dataset receipt with checksum. Engine is right. Delta is clinical sign-off on ranges + a live FHIR source. | 2×4=8 | Trunk 6.0, ContextPacket gate | ranges are versioned+checksummed; swap dataset, keep engine |
| C4 | ContextPacket zod gate `verification/pipeline-schemas.js` | COMPLETE | **RETAIN** | `superRefine` blocks any `lab_result` fact lacking `sanitised_by` or carrying a leading numeric — enforces the no-raw-lab invariant at the packet boundary, defence-in-depth behind the parser. | 1×5=5 | Step 3 every trunk | freeze |
| C5 | Audit ledger `verification/audit-store.js` + `ledger-schema.js` | PARTIAL | **RETAIN** logic · **REFINE** substrate | Append-only, hash-chained, PHI-free by `.strict()` + refine (`content_persisted=false` for live). Correct. Delta is production WORM + retention (a `regulatory_posture` decision), not code shape. | 2×4=8 | medicolegal record | JSONL → WORM adapter; keep chain algorithm |
| C6 | Cross-trunk sequencer (absent) | DEAD_END-1 | **REPLACE** (build new) | `routing_plan.next_trunks` is produced and consumed by nothing; the "nine-trunk sequence" of Input A does not exist as code. Build a deterministic sequencer that walks the plan and halts on `continuation_blocked`/`escalate_now`. | 3×4=12 | integration layer, all trunks | new module `integration/trunk-sequencer.js`; feature-flag `HEYDOC_SEQUENCER=off` default → rollback is off |
| C7 | Live context-injection allow-list (absent in `pipeline.js`) | UNBUILT (High, pf:true) | **REPLACE** (build new) | `cases:ingest` enforces the sub-field firewall allow-list; the live path in `contextInjection()` does **not**. Any future case-injection path could leak sim/scorer metadata into a trunk. Mirror the ingest allow-list at the packet boundary. | 3×5=15 | Step 3, scoring-store firewall | additive guard; default-deny; rollback = guard rejects → BLOCKED_NO_PROOF |
| C8 | Session-bound persistence (absent) | UNBUILT (Critical, pf:true) | **REPLACE** (build new) | Policy exists, enforcement does not. Encounter-scoped lifetime, no demographic persistence, must gate before any patient path. | 3×5=15 | state layer, identity boundary | new; behind `staging` gate only; never auto-persists |
| C9 | Clinician Verification Portal (absent) | UNBUILT (Critical, pf:true) | **REPLACE** (build new) | Named release blocker; the mandatory HITL checkpoint. Largest remaining build item. Engineering scope = the *contract and server-side gate*, not patient-facing UI. | 4×5=20 | release gating, messaging-geo wiring | new; until built, all patient paths remain closed (status quo) |
| C10 | Pipeline routing/retrieval stubs `verification/pipeline.js` | PARTIAL | **REFINE** | `routing()` returns hardcoded needs; `retrievalStub()` fixed receipts. Correct for mock; must become receipt-driven once servers are live, **keeping the same zod gates**. | 2×3=6 | Steps 1–3 | replace internals, contracts unchanged; stub is rollback |
| C11 | Terminology server `mcp/servers/terminology/` | PARTIAL | **REFINE** | Six-system mock is right; delta is live NCTS/Ontoserver + AU Core value-set binding (input-gated on licence). No shape change. | 2×4=8 | Trunks 6/7/9, verifier check 1 | live endpoint behind `terminology-servers.json`; mock is rollback |
| C12 | `fhir-broker` + conformance `mcp/servers/fhir-broker/` | PARTIAL | **REFINE** | Structural conformance vs vendored AU Core SDs is sound; delta is live EHR + ValueSet-binding (needs live NCTS) + AU Core version-target decision. | 2×3=6 | Trunk 6.0 | live base URL additive; vendored SDs remain |
| C13 | `knowledge` server + datasets `mcp/servers/knowledge/` | PARTIAL | **REFINE** | Mock kg_query over 3 seeded datasets is right; delta is clinical sign-off (input-gated) + live Postgres graph store. | 2×3=6 | Trunks 5/7/9 | dataset swap; empty-graph is fail-safe |
| C14 | `messaging-geo` server | PARTIAL | **RETAIN** (mock) · defer wiring | Never-sends SAFE_STUB is correct; must **not** be pipeline-wired until the Portal exists. Deferring wiring is the safe call. | 1×3=3 | none (unwired) | leave unwired; wiring is a post-Portal step |
| C15 | Verifier `no_repo_invention` severity | drift | **REFINE** | Input A D.3-A + code = hard fail (pass=false); trunk-constraints + gap-register say `warning`. Reconcile to a **surfaced-but-gating** semantic (fail, tagged severity=warning in the report) and fix the docs. | 2×3=6 | reporting only | doc-only + report field; no logic change to gate |
| C16 | Mode taxonomy: env names (mock/staging/production) vs receipt MODE enum (live/dry_run/mock) | drift/gap | **REFINE** | Verifier `enforceLive` fires only on `context_mode==="live"`; `staging`/`production` strings would not block mock receipts. Define the mapping so any non-dev context blocks mock proof. | 3×5=15 | verifier check gating, all modes | add mode-normaliser; default-deny non-mock; test-gated |
| C17 | Gap-register §1b Allowed Service Registry prose | STALE | **REFINE** (doc) | Lists `medicolegal-audit-ledger`, `deterministic-investigation-parser`, `pharmacological-firewall` as "Not yet created"; they are **built**. Verifier's `ALLOWED_SERVICE_NAMES` already includes them. Reconcile prose to code. | 1×2=2 | doc trust | doc edit; note in CHANGELOG |
| C18 | Completeness-register case-set row | STALE | **REFINE** (doc) | Register says `case-set-underpopulated` (1 case); 52 ingested per HANDOFF-STATE 2026-07-02. Re-scan and update the register + index in the same step as any case work. | 1×2=2 | doc trust | re-run Phase-0 scan |
| C19 | 12 pipeline schemas + 7 data schemas | COMPLETE | **RETAIN** | Contracts are the backbone; edges gated. Do not churn. | 1×4=4 | everything | freeze; version-bump only under plan |
| C20 | Trunk system prompts + cheatsheets | COMPLETE | **RETAIN** | Narrow, single-purpose, verifier-aligned. Do not widen remits. | 1×3=3 | generation | freeze |
| C21 | `data/digital_tablet_omnibus.json` | COMPLETE | **RETAIN** | Resolves the standards capsule + terminology_servers; public refs, no secrets. | 1×2=2 | terminology/FHIR | freeze; refresh deliberately |
| C22 | AU Core version target (0.3.0 pin vs vendored 2.0.1-ci) | unsettled (A vs B) | **REFINE (decision, not code)** | Input A D.8 pins 0.3.0; code vendors 2.0.1-ci per operator decision. Charter flags it unsettled. Escalate for an org/regulatory ruling; do not silently pick. | 2×3=6 | conformance target | reconcile pin once decided; refresh SDs |
| C23 | Rx-Remedy / Well-to-do / Be My Doc | CONCEPT | **DEFER** | New scope, no code, changes the SaMD classification (D.16/D.17). Out of current engineering scope; re-assess against Class 1 before any build. | n/a | n/a | not scheduled here |

**A↔B *intent* disagreements surfaced (not silently resolved):** C15 (repo-invention severity), C16 (mode taxonomy),
C22 (AU Core version). Recommended resolutions are stated per row; each requires operator/regulatory confirmation
before the doc/logic delta lands.

---

# 3.3 — Target file and directory structure

Tree annotated with the 3.2 verdict. `[+]` create · `[~]` change · `[=]` retain/freeze · `[-]` retire.
Stack unchanged (Node 20 ESM, `@modelcontextprotocol/sdk ^1.29`, `zod ^3`, `ajv ^8`, no build step).

```
kenleefreo/breath-ezy/
├─ CLAUDE.md                                   [=] charter — authoritative; inherit, do not edit except C17-style doc reconciliation
├─ .planning/
│  └─ ARCH_PLAN.md                             [+] THIS FILE — executor reads first, every session
├─ .claude/
│  ├─ completeness-index.md                    [~] re-sync (C18) — add DEAD_END-1, C7/C8/C16 rows
│  ├─ schema-index.md                          [=] verified accurate
│  ├─ server-status.md                         [~] add mode-normaliser note (C16)
│  └─ trunk-cheatsheets/trunk-{1..9}.0.md      [=] freeze
├─ integration/
│  ├─ trunk-pipeline.js                        [~] call sequencer; honour continuation_blocked across trunks (C6)
│  └─ trunk-sequencer.js                       [+] NEW (C6) — walks routing_plan.next_trunks; halts on block/escalate
├─ verification/
│  ├─ verifier.js                              [=] RETAIN (C1) — freeze; only F1/F4 mitigations
│  ├─ pipeline.js                              [~] context-injection allow-list (C7); mode-normaliser (C16); un-stub routing when servers live (C10)
│  ├─ pipeline-schemas.js                      [=] RETAIN (C4)
│  ├─ context-allowlist.js                     [+] NEW (C7) — field-scoped allow-list mirroring cases:ingest; default-deny
│  ├─ mode.js                                  [+] NEW (C16) — normalise env(mock/staging/production)→enforcement(mock/live)
│  ├─ investigation-parser.js                  [=] RETAIN engine (C3)
│  ├─ data/lab-reference-ranges.json           [~] REFINE (C3) — replace with signed-off ranges (input-gated)
│  ├─ audit-store.js                           [~] REFINE (C5) — WORM adapter seam (prod); logic frozen
│  ├─ ledger-schema.js                         [=] RETAIN (C5)
│  ├─ hash.js / report-schema.js / rehash.js   [=] RETAIN
│  └─ session-store.js                         [+] NEW (C8) — encounter-scoped lifetime; no demographic persistence
├─ mcp/
│  ├─ schemas/*.json (12)                      [=] RETAIN (C19); +verification-portal-decision.schema.json [+] (C9)
│  ├─ servers/pharmacology/                    [=] engine RETAIN (C2); +vendor-adapter.js [+] behind PharmCheck contract
│  ├─ servers/terminology/                     [~] REFINE (C11) — live NCTS adapter (input-gated)
│  ├─ servers/fhir-broker/                     [~] REFINE (C12) — live base URL + binding (input-gated)
│  ├─ servers/knowledge/                       [~] REFINE (C13) — signed-off datasets (input-gated); live graph store
│  └─ servers/messaging-geo/                   [=] RETAIN mock (C14) — DO NOT wire until Portal
├─ portal/                                     [+] NEW (C9) — Clinician Verification Portal (server-side gate + contract ONLY; no patient UI)
│  ├─ verification-gate.js                     [+] the release-blocking HITL checkpoint contract
│  └─ README.md                               [+]
├─ data/
│  ├─ cases/<52 dirs>                          [=] RETAIN; [~] batch-verify candidate codes → receipts (flip unverified_*)
│  ├─ schemas/*.json (7)                       [=] RETAIN (C19); 10–13 SEALED
│  └─ digital_tablet_omnibus.json             [=] RETAIN (C21)
├─ docs/grounding/
│  ├─ gap-register.md                          [~] REFINE §1b prose (C17); promote pending items; add DEAD_END-1
│  ├─ completeness-register.md                 [~] re-scan (C18); add C6/C7/C8/C16 findings
│  ├─ trunk-constraints.md                     [~] reconcile no_repo_invention severity wording (C15)
│  ├─ mcp-server-map.md / evaluation-guide.md  [=]
│  └─ CHANGELOG.md                             [~] every moved item, same step
├─ test/
│  ├─ contract-*.js (15)                       [=] RETAIN
│  ├─ contract-sequencer.js                    [+] (C6) — sequence halts on HARD_FAIL/escalate; next_trunks consumed
│  ├─ contract-context-allowlist.js            [+] (C7) — sim/scorer field never enters packet; default-deny
│  ├─ contract-mode-normaliser.js              [+] (C16) — mock blocked in staging/production/live
│  ├─ contract-session-store.js                [+] (C8) — no persistence past encounter; no demographics
│  └─ contract-verification-gate.js            [+] (C9) — patient path closed without an attested gate record
├─ .github/workflows/ci.yml                    [~] add new suites; add eval-gate job (blocking once ≥45, met at 52)
└─ package.json                                [~] add npm scripts for new modules; no new runtime deps without Phase-2
```

No stack swap. No new runtime dependency is introduced by any RETAIN/REFINE row; the REPLACE rows (C6–C9) are
plain ESM + zod, consistent with the charter.

---

# 3.4 — State-management rules

**What persists, for how long, what must never persist.**

- **Session-bound persistence (C8 — release blocker).** Encounter-scoped lifetime only. On encounter close,
  all working state is destroyed. No demographic data persists anywhere outside the identity boundary; downstream
  trunks hold encounter-scoped references + receipts, never demographics (Trust Boundary 4). Until `session-store.js`
  enforces this technically, **no patient path may open** — the policy-only status is a Critical gap, not a solved one.
- **`HEYDOC_MODE_DEFAULT` semantics (C16).** Three environments (mock/staging/production) map onto the receipt
  `MODE` enum (`live`/`dry_run`/`mock`) via `verification/mode.js`:
  `mock → mock` (dev; mock proof flagged, not blocked); `staging → live` and `production → live`
  (mock proof **blocked** — `enforceLive=true`). `dry_run` stays dev (query validated, upstream not called).
  Rationale: today `enforceLive` fires only on the exact string `"live"`, so a `staging` context would silently
  accept mock receipts — the mode-flag-leakage FMEA row F4. The normaliser closes it; default is deny (unknown
  mode ⇒ treat as live ⇒ block mock).
- **Receipt lifecycle.** Produced at Step 2 per tool call (`request_id`, `timestamp_utc`, `upstream`, `mode`).
  Live receipts flow into `ContextPacket.receipts[]` (cleaned to receipt shape; `validated_codes`/`kind` dropped).
  Static-doc citations are **not** receipts — they become `EvidenceNode.supports[]` (`kind:"static_doc"`).
  Structured-dataset proofs become `EvidenceNode` supports (`kind:"structured_dataset"`), not `receipts[]`.
  Receipt metadata (never payload) is recorded in the ledger for `verify:rehash --reissue` re-binding.
- **EvidenceNode lifecycle.** Assembled at Step 3; every critical claim links to a receipt or citation; consumed
  by the trunk (Step 4) and by `evidence_tree.md` (Step 5). Verification status transitions
  `unverified → verified | rejected` and is recorded in provenance.
- **Hash-chained audit ledger (C5).** `entry_hash = sha256(canonical(entry−entry_hash) + prev_hash)`; genesis =
  `sha256:` + 64 zeros. Append-only; `verifyChain()` / `verify:rehash` detect any edit/insert/reorder (0 drift
  today). Ledger holds **NO PHI** (`.strict()` + field set + refine). Exact output text persists **only** in the
  synthetic-only content store (`persistContent` refuses non-synthetic; live entries forced `content_persisted=false`).
- **Never persists (identity-au hard rule).** No plaintext demographics beyond `identity_lookup_ihi`; only
  `receipt.request_id` + minimal attributes. No raw lab number ever persists in packet or ledger (parser + gate).
  No real-patient output persists until C8 + consent are green (`content-store-production-gated`).

---

# 3.5 — Interface and schema contracts

Stated as contracts, not prose. JSON Schemas remain source of truth; zod mirrors them (`.strict()` = `additionalProperties:false`).

## 3.5.1 MCP servers — tool envelopes, receipt shape, stub-vs-live

**Common receipt (all live/mock calls):**
```
Receipt := { request_id:str(≥8), timestamp_utc:ISO8601, upstream:str(≥1), mode:'live'|'dry_run'|'mock',
             tool?:str, server?:enum(7), latency_ms?:int, correlation_id?:str, error?:{code,message,retryable?} }
```
**Per server (receipt prefix · tools · stub → live):**

| Server | Prefix | Tools | Stub behaviour | Live requires |
|---|---|---|---|---|
| `docs` | `doc-` | `docs_search`,`docs_cite`,`docs_get` | canned citations (`cw-au:…`) | populated+indexed corpus (`HEYDOC_DOCS_DIR`/`_INDEX_DIR`) |
| `knowledge` | `kg-` | `kg.query`,`kg.provenance` (built); `kg.upsert`,`kg.export` (SAFE_STUB) | 3 DEV datasets; graphs empty | Postgres (`HEYDOC_KG_DB_URL`); signed-off datasets; graph write |
| `identity-au` | `id-` | `identity_verify`,`identity_lookup_ihi`,`identity_log_consent` | mock IHI; no demographics persist | mTLS + AU HI Service via PRODA; legal basis |
| `terminology` | `term-` | `terminology_lookup`,`terminology_validate`,`terminology_map` | grounds 6 systems; echoes codes | live NCTS/Ontoserver; SNOMED-AU licence; AU Core binding |
| `fhir-broker` | `fhir-` | `fhir_read`,`fhir_search`,`fhir_validate` (built); `fhir_write` (SAFE_STUB) | templated AU Core; Observation→parser; structural validate vs vendored SDs | FHIR base URL; SMART-on-FHIR/mTLS; live NCTS binding; MHR consent |
| `pharmacology` | `pharmchk-` | `pharm_intent`,`pharm_check` | 5-check engine on mock; HARD_FAIL terminal; dose only PASS/WARN | MIMS-AU/equiv (NTI, x-react, DDI, renal, scheduling); SafeScript WA S8 |
| `messaging-geo` | `msg-`/`geo-` | `geo_locate`,`pharmacy_search`,`msg_send` (SAFE_STUB never sends) | mock geo; msg redacted, not sent | SMS/email + geocoding + AU pharmacy directory; **wire only behind Portal** |

**PharmIntent (Trunk 8.0 → pharmacology):** `{ intent_id, session_ref, drug_intent:{drug_name, class?, route?, schedule?}, clinical_context:{patient_age_years?}, patient_facts_ref }` — **no dose values** permitted.
**PharmCheck (pharmacology → firewall):** `{ check_id, intent_id, status:'PASS'|'WARN'|'HARD_FAIL'|'BLOCKED_NO_PROOF', check_results[], flags[], dose_guidance?(only PASS/WARN & non-paediatric), next_data_requests[], receipt, mode:'mock' }`.
**TerminologyLookup:** `{ request:{system:enum(SNOMED_CT|ICD_10_AM|ICD_11|LOINC|PBS|AMT), query}, response:{concept?, candidates[]}, receipt(+validated_codes) }`.

## 3.5.2 Trunk contracts (1.0–9.0) — input ContextPacket + output

**Input to every trunk (the ONLY thing the LLM sees):**
```
ContextPacket := { facts:[Fact], evidence:[EvidenceNode], constraints:[str], receipts:[Receipt],
                   trunk_id?, session_ref?, run_id?, assembled_at_utc?, mode?, blocked?, block_reasons?[] }
  Fact := { fact_id, category:enum(17), label, value, sanitised_by?(REQUIRED when category=lab_result),
            interpretation?, snomed_code?, receipt_id?, evidence_node_id?, … }
  HARD GATE: lab_result ⇒ sanitised_by present AND value non-leading-numeric (superRefine).
```
**Output contracts (verifier-enforced; forbidden output in brackets):**

| Trunk | Output keys | Fail-safe status | Forbidden |
|---|---|---|---|
| 1.0 | `intake_summary`, `safety_gate{status,reasons}`, `routing_plan{next_trunks,why}`, `missing_inputs`, `evidence_refs` | `blocked_incomplete` | diagnose; defer urgent red flag; route before safety_gate |
| 2.0 | triage/routing payload + inline citation IDs | escalate on red flag | diagnose; name a dose; guideline without citation |
| 3.0 | `follow_up_questions`, `structured_history(+unknown)`, `evidence_refs` | mark `unknown` | invent symptoms; fill unknowns; reveal differential in questions |
| 4.0 | `problem_representation`, `risk_frame{immediate,routine}`, `data_gaps`, `evidence_refs` | list `data_gaps` | differential; management; inferential language without citation |
| 5.0 | `axis_b_ruleout_matrix{neg,conf,evidence}`, `blocking_gaps`, `next_data_requests`, `evidence_refs` | `blocked_no_templates` (no AxisB dataset) | mark confirmed without evidence; infer a negative |
| 6.0 | `finding_summary{critical,abnormal,normal,insufficient}`, `escalation_signal`, `next_data_requests` | `insufficient_data` | reproduce raw numbers; fabricate absent result; code without LOINC receipt |
| 7.0 | `candidate_codes(+refs)`, `code_lock_status`, `blocking_reasons`, `benign_registry_gate`, `evidence_refs` | `blocked` | emit code without terminology receipt; bypass benign gate |
| 8.0 | `pharm_intent_payload`, `firewall_status`, `blocking_reasons`, `next_data_requests`, `evidence_refs` | `BLOCKED_NO_PROOF` | dose values in intent; pass a HARD_FAIL; invent pharm facts; S8 without PDMP |
| 9.0 | `red_flag_questionnaire`, `risk_outcome`, `blocking_items`, `next_actions`, `evidence_refs` | `blocked_incomplete` / `blocked_no_questionnaire_data` | downgrade escalation without clearing gates; routine advice alongside `escalate_now` |

## 3.5.3 Pipeline schemas (edges)

- **GroundingPlan (Step 1):** `{ needs_static_docs[], needs_live_calls[], needs_structured_kg[], needs_fhir_reads?[], needs_pharmacology_check?, trunk_id?, live_call_specs?[], priority? }` — zod-gated at routing boundary.
- **ContextPacket (Step 3):** as 3.5.2 — zod-gated + `superRefine` lab guard at injection boundary.
- **EvidenceNode:** `{ id, claim, supports[≥1]{kind,ref,excerpt?}, provenance{created_at_utc,created_by,verification{status}}, fhir_path?, snomed_ref? }`.
- **Receipt:** as 3.5.1.
- **VerificationReport (Step 5):** `{ run_id, timestamp_utc, trunk_id, pass, results[{check,passed,reason?}], missing_receipts[], candidate_output_hash (sha256:64hex, REQUIRED), mock_receipt_flags[], hard_stops?[], overall_severity? }` — zod-gated before any write/append.
- **AuditLedgerEntry:** `{ seq, entry_id, recorded_at_utc, prev_hash, entry_hash, run_id, trunk_id?, session_ref?, candidate_output_hash, pass, check_results[], receipts[meta-only], mode, content_persisted }` — `.strict()`, PHI-free, `refine`: `content_persisted=false` when `mode=live`.

## 3.5.4 Data schemas (case store)

**Presentation (AI may read):** `00_case_envelope` (ID `SPEC-{SPECIALTY}-{DIFFICULTY}-{seq}`), `01_presentation_layer`
(patient voice; `objective_data_offered[]` provenance-tagged, `verified=false` default, stored as strings so no raw
number bypasses the parser), `02_conversational_policy` (7-level disclosure-gate taxonomy).
**Scoring (AI NEVER reads — FIREWALL):** `10`/`11`/`12`/`13`. **Contracted by structure only in this plan; their
content is sealed and is not read, reproduced, or reasoned from.** Any code path that lets a trunk see `10`–`13`
is a Critical defect (stop and report).

## 3.5.5 New contracts introduced by REPLACE rows

- **Sequencer (C6):** input = Trunk 1.0 `routing_plan` + per-trunk results; output = ordered execution record
  `{ executed:[{trunk_id, pass, firewall_status, continuation_blocked}], halted_at?, halt_reason }`; **must halt
  on any `continuation_blocked` or `escalate_now`/T5.**
- **Context allow-list (C7):** `contextAllowList(caseFields) → { injectable_fields[], rejected_fields[] }`;
  default-deny; must reject every sim/scorer field; mirrors `cases:ingest` firewall.
- **Verification gate (C9):** `VerificationGateRecord := { run_id, candidate_output_hash, clinician_id,
  decision:'approved'|'rejected'|'amended', decided_at_utc, signature_ref }`; **no patient path opens without a
  valid gate record referencing the exact `candidate_output_hash`.**

---

# 3.6 — Edge cases and failure-mode register (FMEA)

One row per mode. `Owner` = the build step that must close it. Covers every mode the brief names, plus the new
structural gaps this audit found.

| # | Failure mode | Trigger | Detection | Proactive mitigation | Owner step | Residual risk (L×I) |
|---|---|---|---|---|---|---|
| F1 | **Verifier false-negative** (a fabricated code slips the pattern) | novel code shape / obfuscated token not in `CODE_PATTERNS` | contract-verifier fuzz corpus; per-code binding requires every extractable token in a receipt | keep detection conservative (over-flag); expand `extractBindableCodes` with adversarial fixtures; ICD-11 stays coarse-blocked when no receipt | unscheduled — verifier fuzz hardening; schedule alongside M6 eval gate | detection is bounded by pattern coverage; ICD-11 exact binding deferred | 3×4=12 |
| F2 | **HARD_FAIL fails to propagate** across trunks | sequencer runs next trunk after Trunk 8.0 HARD_FAIL | `continuation_blocked` returned but no consumer today (DEAD_END-1) | build sequencer (C6) that **halts unconditionally** on `continuation_blocked`; contract-sequencer asserts halt | M2 (sequencer) | none once built; until built, callers must honour the flag manually | 4×5=20 → 2×5 after C6 |
| F3 | **Receipt loss / replay** | ledger append fails mid-run; a stale receipt re-used | `verifyChain()` breaks on any edit/reorder; report zod-gated before append | append is atomic-per-entry; prod WORM substrate (C5); reject reports missing required hash | M8 (audit) | JSONL not multi-process safe until WORM | 3×4=12 → 2×4 after WORM |
| F4 | **Mode-flag leakage** (mock data on a live path) | `HEYDOC_MODE_DEFAULT=staging/production`; verifier only enforces on `"live"` | mock receipts flagged in `mock_receipt_flags`; but not **blocked** unless context is exactly `"live"` | mode-normaliser (C16): staging/production→live→block mock; default-deny unknown modes | M1 (mode.js) | none once normaliser lands + tested | 3×5=15 → 1×5 after C16 |
| F5 | **Terminology drift** vs live Ontoserver | mock codes not re-validated against live NCTS; SNOMED-AU edition bump | live binding will fail unbound codes → BLOCKED; version pinned in Digital Tablet | on live-connect, batch-revalidate all case candidate codes; block on mismatch | M11 (terminology live) | input-gated on NCTS licence | 2×3=6 |
| F6 | **FHIR conformance failure** | resource fails AU Core structural / ValueSet binding | `fhir_validate` reports profile/type/cardinality/fixed-system; binding = `not_evaluated` until live NCTS | keep vendored SD snapshot checksummed; ValueSet binding on live NCTS; version-target decision (C22) | M11 (fhir live) | binding deferred to live; version target unsettled | 2×3=6 |
| F7 | **Raw-lab leakage past the parser** | a lab value reaches the packet without sanitisation | ContextPacket `superRefine` rejects `lab_result` without `sanitised_by` or with leading numeric | parser is the only lab path; packet gate is defence-in-depth; `objective_data_offered` stored as strings | M10 (parser sign-off; packet gate already live) | patient-reported vitals sanitiser policy is an open follow-up before live | 2×5=10 → 1×5 after policy |
| F8 | **Paediatric / emergency escalation edge** | unknown age; T5 red flag mid-sequence | engine: unknown age → NOT_RUN → BLOCKED_NO_PROOF (no dose); Trunk 1.0/9.0 `escalate_now` | sequencer halts on `escalate_now`; paediatric → flag, never a dose; no resuscitation guidance | M2 (sequencer + firewall) | none in code; depends on sequencer honouring escalate | 2×5=10 → 1×5 after C6 |
| F9 | **Scoring-store firewall breach** | a case-injection path reads `10`–`13` into a packet | no JS reads `data/cases` today; ingest enforces field-scoped firewall | live context-injection allow-list (C7) default-deny; contract test asserts no sim/scorer field injectable | M3 (allow-list) | Critical until C7 lands; today unreached (no reader) | 2×5=10 → 1×5 after C7 |
| F10 | **DEAD_END-1: routing_plan unconsumed** | Trunk 1.0 emits `next_trunks`; nothing sequences them | topology scan: producer with no consumer | build sequencer (C6); register DEAD_END-1; do not build on it | M2 | resolved by C6 | 3×4=12 → 0 after C6 |
| F11 | **no_repo_invention severity ambiguity** | docs say `warning`, code fails the gate | report shows `passed:false` for a "warning" | reconcile (C15): fail-and-surface with `severity` field; fix docs | M7 (doc+report) | cosmetic once reconciled | 2×3=6 |
| F12 | **Session persistence leak** | working state survives encounter close | no enforcement today (policy only) | `session-store.js` (C8) encounter-scoped destroy; contract test asserts no persistence | M4 (session) | Critical until C8; blocks patient path | 3×5=15 → 1×5 after C8 |
| F13 | **Portal bypass** | output reaches a patient path without an attested gate record | no gate exists today | Verification gate (C9): patient path refuses without a `VerificationGateRecord` on the exact hash | M5 (portal) | Critical until C9 — the top release blocker | 4×5=20 → 1×5 after C9 |
| F14 | **Pharmacology mock as live** | live vendor connected without validation | receipt `mode`; mode-normaliser blocks mock in live | vendor adapter behind same contract; validate against case set before staging→prod | M9 (vendor) | input-gated on contract + validation | 2×5=10 |
| F15 | **Stale register misleads next agent** | register says 1 case / §1b "not created" while built | Phase-0 re-scan diverges from doc | re-scan + reconcile (C17/C18) in the same step as any touch | M0 (doc) | Low once reconciled | 1×2=2 |

---

# 3.7 — Sequenced execution roadmap

Dependency-ordered, prioritised by release-blocker impact. Each milestone has a **task budget** (max sub-agent
turns). No step is "done" while its path carries an open `UNBUILT`/`EMPTY`/`PARTIAL`/`BLIND_STUB`/`DEAD_END`.
Every gap-register open item is scheduled or explicitly deferred.

**Milestone M0 — Reconciliation & re-scan (budget: 6).** Phase-0 full completeness scan. Reconcile C17 (§1b prose),
C18 (case count), register the new findings DEAD_END-1 (C6), context-allowlist (C7 — already open), mode-leakage
(C16). Update `completeness-register.md`, `.claude/completeness-index.md`, `gap-register.md`, `CHANGELOG.md`.
*No code.* **Exit:** registers match live tree; new findings recorded. **Model: Opus 4.8.**

**Milestone M1 — Mode-normaliser (C16, F4) (budget: 8).** Build `verification/mode.js`; wire into `pipeline.js`
`context_mode` derivation and `verifier.js` `enforceLive`. **Exit:** `contract-mode-normaliser.js` green — mock
receipts blocked in staging/production/live, flagged (not blocked) in mock/dry_run; unknown mode → block.
Register `mode-leakage` → COMPLETE. **Model: Sonnet 4.6.**

**Milestone M2 — Cross-trunk sequencer (C6, F2/F8/F10) (budget: 12).** Build `integration/trunk-sequencer.js`;
consume `routing_plan.next_trunks`; **halt unconditionally on `continuation_blocked` or `escalate_now`/T5.** Wire
into `trunk-pipeline.js` behind `HEYDOC_SEQUENCER` (default off → rollback). **Exit:** `contract-sequencer.js`
green — HARD_FAIL halts the sequence; escalate short-circuits; `next_trunks` consumed. DEAD_END-1 → resolved.
**Model: Opus 4.8 (plan) → Sonnet 4.6 (execute).**

**Milestone M3 — Live context-injection allow-list (C7, F9) (budget: 10).** Build `verification/context-allowlist.js`
(default-deny, mirrors `cases:ingest` firewall); enforce in `contextInjection()`. **Exit:**
`contract-context-allowlist.js` green — no sim/scorer field injectable; scoring-store firewall re-checked, still
not breached. `context-injection-allowlist` → COMPLETE. **Model: Opus 4.8 (plan) → Sonnet 4.6.**

**Milestone M4 — Session-bound persistence (C8, F12) (budget: 10).** Build `verification/session-store.js`;
encounter-scoped lifetime; no demographic persistence; destroy on close. **Exit:** `contract-session-store.js`
green. `session-persistence-unenforced` → COMPLETE (enforcement); **one release blocker cleared.**
**Model: Opus 4.8 (plan) → Sonnet 4.6.**

**Milestone M5 — Clinician Verification Portal gate (C9, F13) (budget: 14).** Build `portal/verification-gate.js`
+ `mcp/schemas/verification-portal-decision.schema.json` (server-side contract + release gate ONLY; **no patient
UI**). Patient paths refuse without a `VerificationGateRecord` on the exact `candidate_output_hash`. **Exit:**
`contract-verification-gate.js` green. `clinician-verification-portal-unbuilt` → PARTIAL (gate contract built; UI
out of engineering scope). **Model: Opus 4.8 (plan) → Sonnet 4.6.** *This is the highest-leverage blocker.*

**Milestone M6 — Case-set terminology batch-verify + difficulty top-up (budget: 10).** Batch-verify the 52 cases'
candidate codes against the mock terminology server (produce receipts; flip `unverified_pending_terminology_receipt`);
author more atypical/complex cases toward 60/30/10; wire the eval as a **blocking** CI job (≥45 met at 52). **Exit:**
`case-set-*` distribution improved; eval gate CI-blocking. **Model: Sonnet 4.6 (verify) + Opus 4.8 (authoring plan).**

**Milestone M7 — Doc & severity reconciliation (C15, F11) (budget: 4).** Reconcile `no_repo_invention` to
fail-and-surface with a `severity` field; fix `trunk-constraints.md` + `gap-register.md` wording. **Exit:** report
carries severity; docs match code. **Model: Sonnet 4.6.**

**Milestone M8 — Production audit substrate (C5, F3) (budget: 8).** WORM adapter seam + retention policy hooks
(policy is a `regulatory_posture` decision — surface, do not decide). Logic frozen. **Exit:** `receipt-store-append-only`
→ path to COMPLETE; prod substrate documented. **Model: Opus 4.8 (plan) → Sonnet 4.6.**

**— Input-gated milestones (require operator/vendor/regulatory inputs; scheduled but external-blocked) —**

**M9 — Pharmacology live vendor (C2, F14).** Vendor adapter behind PharmCheck; validate against case set in
**staging** only. *Gated on:* MIMS-AU/equiv contract + SafeScript WA + credentials via secrets manager. **Deferred
reason:** external contract. **M10 — Investigation-parser range sign-off (C3, F7).** *Gated on:* clinical +
regulatory sign-off + live FHIR source. **M11 — Terminology live NCTS (C11, F5) / FHIR live (C12, F6).** *Gated
on:* NCTS licence + AU Core version-target decision (C22). **M12 — Knowledge dataset sign-off (C13).** *Gated on:*
clinical sign-off. **M13 — messaging-geo live wiring (C14).** *Deferred until M5 Portal exists* — never before.
**M14 — Rx-Remedy / portals (C23).** *Deferred:* new scope; re-assess Class 1 SaMD before any build.

**Ordering rationale:** M1–M5 are pure engineering, no external inputs, and clear the two code-side release
blockers (persistence, portal gate) plus the two structural safety gaps (sequencer halt, allow-list). M9–M14 are
input-gated and cannot start until an operator supplies a contract, credential, sign-off, or decision.

---

# 3.8 — Per-step Claude Code execution directives

Each directive is what the executor runs. Common preamble applies to **all** steps.

**Common preamble (prepend to every step):**
> Read `.planning/ARCH_PLAN.md` and `.claude/completeness-index.md` first. Confirm no `DEAD_END`/`BLIND_STUB` sits
> on this step's path; if one does, surface it before planning. **Run one sub-agent at a time — do not spawn
> parallel sub-agents (token multiplication is not worth it here).** Give the sub-agent the **whole relevant
> codebase** when reviewing a change, hunting a vulnerability, or debugging a multi-file interaction — the gnarly
> bugs live in verifier↔pipeline↔server interactions; reason across files, not within one. Follow the charter
> workflow: Phase 0 scan → Phase 1 research (**halt for answers**) → Phase 2 plan (**GATE — no code until
> approved**) → Phase 3 execute one phase at a time → Phase 4 review. For pipeline/case work:
> **analyse → decide → act → evaluate the result against the contract and the §1 invariants → self-correct
> mid-workflow; do not assume success.** After every change: re-run contract tests + verifier, keep CI green, and
> update `gap-register.md` + `completeness-register.md` + `.claude/*` **in the same step**. Do not weaken any §1
> invariant, bypass the five-step spine, or defeat the verifier's mechanical checks.

| Step | Directive (executor runs) | Model | Sub-agent constraint |
|---|---|---|---|
| M0 | "Run a full Phase-0 completeness scan. Reconcile gap-register §1b prose to the built services (audit-ledger, investigation-parser, pharmacology-firewall). Update the case-set row to 52. Register DEAD_END-1 (routing_plan unconsumed) and confirm the context-allowlist + mode-leakage findings. Write both registers, the index, and CHANGELOG. No code." | Opus 4.8 | single agent; read-only scan |
| M1 | "Plan then build `verification/mode.js`: normalise env(mock/staging/production/dry_run)→enforcement. Wire into `pipeline.js` context_mode and `verifier.js` enforceLive. Default-deny unknown modes. Add `contract-mode-normaliser.js` asserting mock blocked in staging/production/live, flagged in mock/dry_run. Gate CI." | Sonnet 4.6 | single agent; full verification/ in context |
| M2 | "Plan (Opus) then build (Sonnet) `integration/trunk-sequencer.js` consuming Trunk 1.0 routing_plan.next_trunks; halt UNCONDITIONALLY on continuation_blocked or escalate_now/T5. Wire into trunk-pipeline.js behind HEYDOC_SEQUENCER (default off). Add `contract-sequencer.js`: HARD_FAIL halts; escalate short-circuits; next_trunks consumed. This is the DEAD_END-1 fix — do not build other work on top of it first." | Opus 4.8 → Sonnet 4.6 | one agent at a time; whole integration/ + verification/ in context (cross-file bug risk) |
| M3 | "Plan (Opus) then build (Sonnet) `verification/context-allowlist.js` mirroring the cases:ingest field-scoped firewall; default-deny; enforce in contextInjection(). Add `contract-context-allowlist.js`: no sim/scorer field injectable; re-run the scoring-store firewall check. Stop and report if any path reads data/cases/10-13." | Opus 4.8 → Sonnet 4.6 | single agent; do NOT read scoring-node content |
| M4 | "Plan (Opus) then build (Sonnet) `verification/session-store.js`: encounter-scoped lifetime; destroy on close; no demographic persistence. Add `contract-session-store.js` asserting no persistence past encounter and no demographics. Clears a release blocker — restate all four blockers in the plan." | Opus 4.8 → Sonnet 4.6 | single agent |
| M5 | "Plan (Opus) then build (Sonnet) `portal/verification-gate.js` + `verification-portal-decision.schema.json` — the server-side HITL release gate ONLY (no patient UI). Patient paths must refuse without a VerificationGateRecord bound to the exact candidate_output_hash. Add `contract-verification-gate.js`. Do NOT wire messaging-geo yet." | Opus 4.8 → Sonnet 4.6 | single agent; full-codebase for release-gating review |
| M6 | "Batch-verify the 52 cases' candidate codes against the mock terminology server; write receipts; flip unverified_pending_terminology_receipt. Author additional atypical/complex cases toward 60/30/10 via the case kit. Wire the eval as a blocking CI job. Machine-generated cases stay llm_generated_unreviewed until clinician-attested." | Sonnet 4.6 (+Opus for authoring plan) | single agent; never read scoring nodes into context |
| M7 | "Reconcile no_repo_invention: keep the gate failing but add a `severity` field to the report result; fix trunk-constraints.md + gap-register.md wording to match code. Update CHANGELOG." | Sonnet 4.6 | single agent |
| M8 | "Plan (Opus) then build (Sonnet) a WORM adapter seam + retention hooks for the audit ledger; freeze the chain algorithm. Surface the retention policy as a regulatory_posture decision — do not set it." | Opus 4.8 → Sonnet 4.6 | single agent |
| M9–M14 | "Input-gated. Do not start until the operator supplies the named external input (vendor contract / credentials / clinical sign-off / NCTS licence / AU Core version decision). Each is a separate Bootstrap-mode master plan, itself Phase-2 gated." | Opus 4.8 (plan) → Sonnet 4.6 (execute) | one agent at a time; live-connect in staging only, synthetic patients |

---

# 3.9 — Self-verification

Re-read Input A (Part D + invariants) and Input B (`CLAUDE.md`, both registers, verifier, pipeline, engine, gates).
Confirmations:

- **§1 invariants — none weakened.** Every RETAIN freezes a mechanical safeguard; every REFINE keeps the contract
  and strengthens enforcement (mode-normaliser F4, allow-list F9, session-store F12, portal gate F13); no REPLACE
  removes a check. Doses remain pharmacology-only; codes remain receipt-bound; raw labs remain parser-only; hash
  remains required; HARD_FAIL remains unoverridable (and now *propagates* via the sequencer instead of being a
  returned-but-unconsumed flag).
- **Five-step spine intact.** Route→Retrieve→Inject→Generate→Verify unchanged; the sequencer wraps it per trunk
  exactly as Figure D.1a intends — it adds the missing *outer loop*, it does not bypass a step.
- **Verifier mechanical checks intact.** All five preserved; the only verifier-adjacent change (C16 mode-normaliser,
  C15 severity surfacing) tightens or clarifies, never loosens.
- **Every gap-register open item is scheduled or explicitly deferred:** pharmacology vendor → M9 (input-gated);
  portal → M5; investigation-parser sign-off → M10 (input-gated); persistence → M4; knowledge datasets → M12
  (input-gated); terminology live / FHIR live → M11 (input-gated); case-set → M6; receipt-store WORM → M8;
  context-injection allow-list → M3; messaging-geo wiring → M13 (deferred, post-Portal); AUCDI binding → M11;
  Rx-Remedy/portals → M14 (deferred, re-assess Class 1). New findings DEAD_END-1 → M2, mode-leakage → M1,
  doc drift (C17/C18) → M0.
- **Scoring-store firewall respected.** No step reads `10`–`13`; M3/M6 explicitly forbid it; this plan reasons from
  structure only.
- **A↔B intent disagreements surfaced, not silently resolved:** C15 (severity), C16 (mode taxonomy), C22 (AU Core
  version) — each carries a recommended resolution requiring operator/regulatory confirmation.

**Result: PASS.** No invariant weakened; spine and verifier intact; every open item scheduled or deferred with
reason; two new structural gaps (sequencer, mode-leakage) and three doc drifts caught and scheduled. Ready to
save to `.planning/ARCH_PLAN.md` and begin M0.

*End of blueprint.*
