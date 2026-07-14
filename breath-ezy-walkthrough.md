# breath-ezy — Codebase Walkthrough

> A pair-programming-style walkthrough of the `kenleefreo/breath-ezy` repository for
> junior/beginner developers. Regenerated 2026-07-14, grounded in the code at `main @ edb2c7a`
> (PRs #1–#66). Supersedes the 2026-07-07 snapshot.
> Note: in-code identifiers carry the legacy `heydoc` / `HEYDOC_*` prefix — that is
> intentional and must not be renamed.

---

## 1. High-Level Overview

**What it is:** breath-ezy (internally "HeyDoc") is the *safety infrastructure* around an AI Doctor — a telehealth chat agent for the Australian healthcare context. The key mental model: **this repo contains everything *around* the LLM.** The LLM is treated as an untrusted text generator; this repo is the cage around it that makes sure it can never invent a medical code, a drug dose, a lab value, or an identity.

Think of it like a bank: the LLM is a charming teller who's great at talking to customers, but the vault, the ledgers, and the security cameras (this repo) make sure the teller can never hand out money that isn't backed by a real account.

One thing has changed since earlier snapshots: the "teller's chair" is no longer empty. There is now a **gated live LLM path** (`integration/llm-adapter.js`, default `claude-sonnet-5`, smoke-validated on AWS staging). But it's **mock-by-default and fail-closed** — turned off unless explicitly enabled with a real key, and whatever it says still has to survive every check downstream.

**Tech stack** (from `package.json`):

- **Node.js 20, plain ESM JavaScript** — no TypeScript, no build step. Every file runs directly with `node`.
- **`@modelcontextprotocol/sdk`** — the MCP servers (tool servers the pipeline calls).
- **`@anthropic-ai/sdk`** — the client for the gated live Step-4 generation path (new).
- **`zod`** (runtime validation) + **`ajv`** (JSON Schema validation) — contracts are enforced twice: JSON Schemas define them, zod validates them at every boundary.
- Default mode is **`mock`** (`HEYDOC_MODE_DEFAULT=mock`) — everything runs deterministically with fake-but-honest data, no vendor credentials.

**The core idea in one sentence:** *No receipt, no claim.* Every fact the LLM is allowed to state must be traceable to a proof artifact from a deterministic tool call.

---

## 2. Execution Flow

The entry points are the stub agents (`npm run trunk:stub:5` etc.), the verification runner (`npm run verification`), or now the two servers (`npm run portal`, `npm run consult`). One full trunk turn:

```
trunk/trunk-5.0-stub-agent.js          ← entry point
    └─ runTrunkWithGrounding("5.0", input, opts)     integration/trunk-pipeline.js
         └─ runPipeline(opts)                         verification/pipeline.js:125
              ├─ Step 1  routing()        → GroundingPlan
              ├─ Step 2  retrieval        → Receipts (mock stub or live MCP)
              ├─ Step 3  contextInjection() → ContextPacket
              ├─ Step 4  generate_candidate(packet)   pipeline.js:203  (gated live LLM,
              │    │                                    or stubGenerationOutput() @ :379)
              │    └─ runPharmCheck() if Trunk 8.0    ← the firewall
              └─ Step 5  verify() + runDetectors()   verification/verifier.js:133
         └─ build VerificationReport, write report.json + evidence_tree.md
         └─ recordRun() → append-only audit ledger
```

Step by step:

1. **Stub agent** (`trunk/trunk-5.0-stub-agent.js`) loads its system prompt via `getTrunkSystemPrompt("5.0")`, supplies a hard-coded `STUB_LLM_OUTPUT` (simulating what a real LLM would say), and calls the orchestrator. Exit code = pass/fail — that's how CI consumes it.

2. **`runTrunkWithGrounding()`** loads the trunk's constraints (e.g. Trunk 5.0: *no diagnosis, no dosages*), delegates to `runPipeline()`, merges constraints into the packet, builds the report, validates it against the report schema (a malformed report **throws** — it never gets written), writes the artifacts, and appends to the ledger.

3. **`runPipeline()`** executes the five steps. Step 4 (generation) is where the LLM sits. In default/CI runs the candidate output is passed in from outside (`stubGenerationOutput()`), so the safety core can be tested without an API call. When a real generator is supplied (`options.generate_candidate`, line 203), the gated LLM adapter runs — but it only ever sees the sealed `ContextPacket`, and any failure or refusal returns `BLOCKED_NO_PROOF`. The repo is the scaffolding on both sides of the LLM: everything *before* it (what it's allowed to see) and everything *after* it (whether its output is allowed to survive).

---

## 3. Core Sections & Logic

| Module | What it is | The one thing to remember |
|---|---|---|
| `mcp/servers/` | 10 tool servers (docs, terminology, identity-au, knowledge, fhir-broker, pharmacology, messaging-geo, two evidence servers, tooluniverse gateway) | Every tool call returns a **Receipt**. Mock mode is honest — it labels itself `mode: "mock"`. |
| `mcp/schemas/` + `verification/pipeline-schemas.js` | The contracts: receipt, evidence-node, grounding-plan, context-packet, verification-report, pharm-intent/check… | JSON Schemas define the shape; zod validators enforce it at runtime. Data can't cross a pipeline step without passing one. |
| `verification/` | The five-step pipeline, the five-check verifier, integrity detectors, hashing, audit store, consent stack, PPP-TTT triage, session store | The deterministic safety core. Frozen-ish: detectors and arbiters extend it without touching it. |
| `integration/` | Glue + the gated LLM: `trunk-pipeline.js`, `llm-adapter.js`, `generation-backend.js`, `evidence-arbiter.js`, `audit-substrates/` (WORM) | `runTrunkWithGrounding()` is the only sanctioned way to run a trunk. The LLM adapter is mock-by-default. |
| `trunk/` | Nine narrow "trunk" agents (1.0 intake → 9.0 red-flag questionnaire), each with a system prompt + stub agent | Each trunk has a single job and a fixed output contract. Trunk 2.0 never diagnoses; Trunk 8.0 only gates on the pharmacology firewall. |
| `portal/` | The Clinician Verification Portal: `server.js` (review console) + the fail-closed release gate | A clinician reviews the exact output and approves/rejects/amends. Approving only permits the gate to permit — it never releases to a patient itself. |
| `patient/` | `consult-server.js` — the patient-facing demo surface | In mock it releases **nothing** and shows "pending clinician sign-off". Never sets a patient-eligibility flag. |
| `ingestion/` | Document intake: OCR → **de-id** → structure → terminology → FHIR | De-id (`deid/presidio.js`) is ON by default and fail-closed — if it can't de-identify, it blocks the whole document. No bypass flag. |
| `data/` | 303 synthetic patient cases (~2,400 JSON files) for evaluation | **Two-store firewall**: files `00–02` (what the AI sees) vs `10–13` (ground truth the *scorer* sees). The AI reading `10–13` is like a student reading the answer key — it invalidates the whole exam. |
| `test/` | 78 contract test suites, all wired into `npm test` and CI | Tests assert *contracts*, not implementations — e.g. "a HARD_FAIL with no receipt must be rejected." |

**Why "trunks" instead of one big agent?** A single do-everything medical agent is impossible to verify. Nine narrow agents, each with an explicit list of things it's forbidden to do, means each output can be checked against a small, fixed contract.

---

## 4. State & Data Flow

The system is deliberately **almost stateless**. Data flows in one direction through immutable-ish artifacts:

```
user input
   → GroundingPlan        "what proofs do we need before the LLM speaks?"
   → Receipt[]            proofs from tool calls
   → ContextPacket        THE ONLY THING THE LLM EVER SEES
   → candidate output     (untrusted text — from the gated LLM or a stub)
   → VerificationResult   pass/fail + which checks failed
   → VerificationReport   report.json + evidence_tree.md + ledger entry
```

Key state rules:

- **The ContextPacket is a one-way valve.** Raw patient data never reaches the LLM. Two sanitisation gates run during context injection:
  - Raw lab numbers go through `sanitiseInvestigation()` — `{loinc: "2823-3", value: 6.8}` becomes the *text* `"critically elevated"`, and the packet schema **rejects** any `lab_result` fact missing a `sanitised_by` field. The raw number `6.8` structurally cannot appear.
  - Case content goes through a **default-deny allowlist** — anything from the scoring store *throws*, it isn't just filtered.
- **Receipts get stripped on the way in.** Internal fields like `validated_codes` are removed before a receipt enters the packet; the LLM sees only `request_id`, `timestamp_utc`, `upstream`, `mode`.
- **Session state is memory-only** (an in-process `Map` in `session-store.js`), destroyed at encounter close — this is the technical enforcement of release blocker #4. The **audit trail is the opposite**: append-only, hash-chained JSONL that is never mutated. There are now **four** such chained ledgers (audit, portal gate-records, PPP-TTT triage, consent), and a **WORM seam** (`integration/audit-substrates/s3-object-lock.js`) can pin them to AWS S3 Object Lock (COMPLIANCE mode, 7-year retention) at deploy time.
- **Consent is a recording mechanism, not a permission unlock.** `requireActiveConsent()` (`verification/consent.js`) is a fail-closed seam every future persistence path must call. Recording consent does not by itself open any patient-data path.
- **The medicolegal anchor:** `candidate_output_hash` — a SHA-256 of the *exact* UTF-8 bytes of the LLM output, no trimming or normalisation (`verification/hash.js:26`). It's computed *first* in `verify()`, so even a rejected output is permanently recorded. That hash is the legal record of exactly what was generated, and it's what the portal clinician's approve/reject decision is bound to.
- **Blocking state:** `continuation_blocked: true` propagates up and halts the trunk sequence. It's set by a pharmacology `HARD_FAIL` (no override exists, by design) or `BLOCKED_NO_PROOF` (Trunk 8.0 ran without a pharm intent, or the gated LLM failed/refused).

---

## 5. Key Functions

**`runTrunkWithGrounding(trunkId, userInput, options)`** — `integration/trunk-pipeline.js`
The public API. Inputs: trunk id (`"1.0"`–`"9.0"`), user text, and options (`candidateOutput`, `generate_candidate`, `sessionRef`, `useMcp`, `pharmIntent`, `writeArtifacts`). Returns `{ pass, firewall_status?, continuation_blocked, report, packet, verification }`. Side effects: writes `verification/report.json` + `evidence_tree.md`, appends a ledger entry.

**`runPipeline(options)`** — `verification/pipeline.js:125`
The five-step engine. Notable inputs: `raw_investigations[]` (labs that must be sanitised), `case_content` (must survive the allowlist), and `generate_candidate` (the gated Step-4 hook, invoked at line 203 only after the packet is sealed). Returns the plan, packet, verification result, and `hard_stops[]`.

**`generateCandidate(packet)`** — `integration/llm-adapter.js`
The gated live Step-4 client. **Packet-only bar:** it re-validates the `ContextPacket` and serialises exactly that object — nothing else reaches the model. **Fail-closed:** invalid packet, live-without-key, API error/timeout, a safety refusal (`stop_reason:"refusal"`), or empty output all return `{ok:false, status:"BLOCKED_NO_PROOF"}`. **Mock by default:** live only when `HEYDOC_LLM_LIVE` is set *and* a key resolves via the secrets seam. Default model `claude-sonnet-5`. A sibling `generation-backend.js` selects `{claude, medgemma}` with **no failover** — a refusal stays blocked, never rerouted.

**`verify(output, evidence)`** — `verification/verifier.js:133`
The five hard checks, in order:

| # | Check | How it works | Severity |
|---|---|---|---|
| 1 | `no_invented_codes` | Regex-extracts SNOMED/ICD-10-AM/LOINC/PBS codes from the output, then requires each one to appear in a terminology receipt's `validated_codes`. Unbound code → fail. | critical |
| 2 | `no_invented_guidelines` | Guideline-shaped claims ("Choosing Wisely", "eTG"…) require a static-doc citation receipt. | fail |
| 3 | `no_invented_operations` | Operational claims (IHI, lab results, SMS sent, pharmacy stock) require a *live-data* receipt. | critical |
| 4 | `no_repo_invention` | Backtick-quoted service names must be on the 19-name allowlist. | warning |
| 5 | `hard_stop_enforcement` | If the output *mentions* a HARD_FAIL, there must be a real firewall receipt behind it — the LLM can't role-play a safety event. | critical |

Returns `{ pass, results[], missing_receipts[], candidate_output_hash, mock_receipt_flags[] }`. Note the philosophy: failures come with `missing_receipts` — "here's the proof that would make this legitimate" — not just "no".

**`runDetectors()` + `combineVerification()`** — `verification/integrity-detectors/index.js`
Extra machine checks composed with a **monotone AND**: `pass = base.pass && detectors.passed`. Detectors can only add failures, never rescue an output. The Evidence Broker arbiter (`integration/evidence-arbiter.js`) folds in the same monotone way — it can mark a model claim `unknown` and drag `pass` down, never up. This is how the verifier gets extended without modifying the frozen core — a pattern worth stealing for any safety-critical system.

**`runPharmCheck(intent, facts)`** — the pharmacology firewall behind Trunk 8.0. Returns `PASS` / `WARN` / `HARD_FAIL` / `BLOCKED_NO_PROOF` plus a receipt. Doses exist *only* in its `pharm-check` output schema — the `pharm-intent` schema structurally has no dose fields, so the LLM can't even *ask* with a dose attached. The engine reads a clinician-signed reference datastore through a `PharmDataSource` seam; a real vendor CDS slot (`cds-adapter/`) sits explicit-but-empty and HARD_FAILs until a contracted vendor fills it.

**An MCP server, e.g. `terminology_lookup`** (`mcp/servers/terminology/index.js`): `McpServer` + zod input schema + `registerTool()`, stdio transport. Three modes: `mock` (deterministic placeholder concept), `dry_run` (validate only), `live` (real FHIR `$validate-code` via the NCTS Ontoserver adapter; any error returns *unvalidated*, never a fabricated concept).

---

## 6. Edge Cases & Error Handling

The design philosophy is **fail-closed**: when anything is uncertain, the answer is `BLOCKED_NO_PROOF`, never a plausible guess. Concrete examples, each locked in by a contract test:

- **LLM invents a safety event** — output claims "HARD_FAIL" with no firewall receipt → check 5 rejects it (`test/contract-firewall.js`). The LLM can't fake compliance *or* fake alarms.
- **Trunk 8.0 runs with no pharm intent** → `BLOCKED_NO_PROOF`, continuation blocked. Missing input ≠ implicit pass.
- **Raw lab number tries to enter context** → schema rejection; only sanitised text with a `sanitised_by` tag passes (`test/contract-pipeline.js`).
- **Scoring-store data (files 10–13) reaches the packet path** → the allowlist **throws**. Loud failure, not silent filtering.
- **Malformed report** → validation throws before the file is written; no corrupt medicolegal record can exist.
- **Live terminology endpoint errors** → returns "unvalidated", never a made-up concept. The terminology server even refuses to *start* if its live endpoint config is unsafe for the environment.
- **Mock receipts in production mode** → mode normaliser treats them as missing proofs and blocks; in dev they're flagged (`mock_receipt_flags`) but allowed. The self-built pharmacology datastore stays `mode:'mock'` for this reason — clinician-signed is not the same as live.
- **The gated LLM refuses or errors** → `generateCandidate()` returns `BLOCKED_NO_PROOF`; the selectable backend never fails over to a second model to "get an answer".
- **A document can't be de-identified** → the ingestion pipeline blocks the whole document; raw PHI never flows downstream.
- **Paediatric dosing** → no under-18 tables exist, so the firewall returns "flag for in-person review", never a dose.

The known **weak spot**: checks 1–3 are regex-based. Regexes catch well-formed codes, but a creatively formatted fabrication could slip past pattern extraction. That's exactly why the integrity detectors and the evidence arbiter exist as additive layers, and why the synthetic case evaluation (60/30/10 difficulty mix, under-triage weighted 3× over-triage, zero critical under-triage tolerated) is a *release gate*, not a report.

---

## 7. Performance Considerations

Honest framing first: **this system optimises for auditability, not throughput** — the right trade-off for clinical decision support, where a wrong answer costs far more than a slow one. Still, know where the costs live:

- **Blocking I/O everywhere.** `readFileSync` / `appendFileSync` dominate. Fine for one pipeline run; a bottleneck if you ever run many encounters in one Node process. The four append-only JSONL ledgers grow unboundedly — retention/rotation (and the WORM lifecycle) is a known open item, partly addressed by the S3 Object Lock seam.
- **MCP servers are spawned per retrieval** over stdio with no pooling. Live mode adds process spawn + network round-trips *serially* for every plan entry. First obvious optimisation when latency matters: keep server processes warm and parallelise independent retrievals — but that's a plan-gated change.
- **The gated LLM adds a real network round-trip** to Step 4 when live. It's off by default; when on, it's a single call over the sealed packet, and it's fail-closed on timeout.
- **No caching, by design.** Every run re-fetches and re-receipts. Tempting to cache terminology lookups — but a cached receipt is a *stale proof*, so any caching layer would need receipt-freshness semantics. (A `knowledge-cache` contract exists precisely to bound this.) Don't bolt it on casually.
- **The knowledge and pharmacology servers reload their datasets on query.** Cheap now (small dev datasets; 24 pharmacology JSON files), linear-scan cost as they grow.
- **The verifier itself is cheap** — regex passes over one output string. It won't be the bottleneck.
- **The case suite** (303 cases, ~2,400 files) is loaded eagerly in evaluation runs — fine at this scale, worth streaming past ~thousands of cases.
- **`npm test` chains 78 suites sequentially** with `&&`. Correct and simple; as the suite grows, a parallel runner is the easy win.

---

## Where to start reading, in order

1. `README.md` — the 30-second architecture diagram.
2. `verification/pipeline.js` — the five steps, in one file (`runPipeline` @ line 125).
3. `verification/verifier.js` — the five checks (`verify` @ line 133).
4. `test/contract-firewall.js` — the safety philosophy expressed as tests (short, very readable).
5. `mcp/servers/terminology/index.js` — the canonical MCP server pattern.
6. `integration/llm-adapter.js` — how the gated live LLM is bolted on *without* loosening any check.
7. `portal/server.js` — the human-in-the-loop review console that gates everything patient-facing.
