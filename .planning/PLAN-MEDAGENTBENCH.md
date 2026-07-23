# PLAN — MedAgentBench adoption (Phase B2, concomitant track)

> **Status:** PROPOSED — Phase 2 gate. No code until approved (CLAUDE.md, no exceptions).
> **Sibling track:** `.planning/PLAN-B2.md` (MedProbeBench pilot, APPROVED). These two run
> concomitantly; both follow the MIRAGE bolt-on pattern (`benchmark/mirage/`).
> **Dossier verdict:** MedAgentBench ⭐ **ADOPT (priority)** — "the only benchmark testing our
> trunk *topology* (multi-step API sequences); maps to fhir-broker + grounding" (§L7).

---

## Plain-language summary

MedAgentBench evaluates an agent on **300 physician tasks inside a FHIR-compliant virtual
EHR** — multi-step jobs like "find this patient's latest potassium, then place the right
order." It is the only external benchmark that tests what makes Makoha *Makoha*: not a single
answer, but a **correct multi-step sequence of grounded tool calls**. We already own the two
pieces it needs — a **FHIR sandbox** (`mcp/servers/fhir-broker/` mock + AU Core validator) and
an **agent that plans tool calls** (`integration/trunk-pipeline.js`, `runTrunkWithGrounding`).
So this is a **clean-room, reuse-heavy harness**, not a new engine: a benchmark-scoped FHIR
sandbox + a first-party task corpus + a driver that runs our pipeline over each task + a scorer
that grades **both** task success **and invariant adherence during the sequence** (no fabricated
codes/doses, grounding compliance, HARD_FAIL respected). Additive only; the pipeline and
fhir-broker are **instantiated, never modified**.

---

## Topology impact

- **New leaf subsystem** `benchmark/medagent/`, sibling of `benchmark/mirage/` and
  `benchmark/medprobe/`. Non-shippable path (harvest manifest).
- **The virtual EHR = the existing fhir-broker mock, benchmark-scoped.** We instantiate the
  mock core over an **isolated, in-memory, benchmark-only FHIR store** seeded per task. We
  **reuse `conformance.js`** so seeded/returned resources are AU-Core-validated. We do **not**
  modify fhir-broker, and the sandbox can never reach a live/real store (mock-by-default; no
  live backend marker touched).
- **The agent-under-test = our trunk pipeline.** The driver runs `runTrunkWithGrounding`
  (read-only reuse) over each task, with a **replay-wrapped generator** (reuse
  `verification/llm-replay.js` `createReplayer` + `integration/generation-backend.js`
  selection) so CI runs on fixtures and a live endpoint is input-gated (mock default).
- **Reads / does not touch:** reuses `EvalRunReport` schema-first discipline for the report;
  never touches the audit ledger, `candidate_output_hash`, the scoring store, or trunk prompts.
- **Blast radius:** one new CI job. Zero change to any pipeline edge, server contract, or schema
  already in use.

## Trust boundaries & firewall (unchanged, re-asserted)

- Benchmark **corpus is untrusted content** → strict fail-closed loader with the MIRAGE
  `SCORING_PROVENANCE_RE` firewall (reject any task citing `data/cases`/nodes `10–13`/
  `_node.json`/scoring keys); question-only; SHA-256 checksum over canonical corpus bytes.
- The virtual EHR is **synthetic + benchmark-scoped**, seeded only from the (synthetic) corpus;
  it is a sandbox, never a route into real patient data, and never persists.
- Invariants explicitly measured, not just preserved: **no fabricated codes** (terminology
  receipt required), **no dose outside pharmacology**, **grounding compliance**, **HARD_FAIL
  terminal**, 7-name service registry, mock-never-as-live.

## File paths (create)

- `benchmark/medagent/task-loader.js` — strict zod `.strict()` task loader; firewall regex; id regex `MAB-<n>-[QOC]-\d{5}` (Q=query, O=order/action, C=compute); checksum.
- `benchmark/medagent/virtual-ehr.js` — benchmark-scoped fhir-broker sandbox: seed an isolated in-memory store per task from the corpus, expose the existing `fhir_read/search/validate` mock contract, AU-Core-gate via `conformance.js`. No live path.
- `benchmark/medagent/run-medagent.js` — driver + scorer: run the pipeline over a task, capture the tool-call sequence + final action, score task success **and** per-step invariant adherence.
- `benchmark/medagent/index.js` — CLI runner + `writeScores()` → `benchmark/medagent/scores/latest.json` (never sets any patient-eligibility flag).
- `benchmark/medagent/corpora/*.corpus.json` + `manifest.json` — first-party clean-room seed task set, checksum-pinned, **clinician-attestation pending** (DEV/SYNTHETIC).
- `mcp/schemas/medagent-score.schema.json` + inline zod — score-artifact contract.
- `test/bench-medagent-gate.js` — blocking gate; scripted-fixture teeth prove RED on a fabricated-code action, a dose emitted outside pharmacology, a HARD_FAIL ignored, or a wrong-action task.

## Contracts

- **Task item** (`.strict()`): `id`, `task_type∈{query,order,compute}`, `prompt`, `ehr_seed` (synthetic FHIR resources to seed the sandbox), `expected` (correct action/answer shape), `invariant_asserts[]` (e.g. "any code carries a terminology receipt"), `upstream`. Firewall + question-only enforced.
- **Score artifact:** `{benchmark, corpus_version, checksum, threshold, task_success_rate, invariant_adherence_rate, per_task[], counts, benchmark_passed}`.
- **Gate teeth:** `benchmark_passed = attested_tasks > 0 AND task_success_rate ≥ threshold AND invariant_adherence_rate == 1.00` (invariant adherence is a **hard** gate — a single fabricated code/dose or ignored HARD_FAIL during any task ⇒ RED, mirroring MIRAGE's `N=1.00`).

## Phases (dependency order; each stops at its boundary)

1. **MA.1 — task schema + virtual-EHR sandbox + loader + seed corpus** (SKIP-inert until fixtures + attestation). *Verify:* `bench:medagent:run` writes a score artifact; sandbox seeds + AU-Core-validates a synthetic resource; loader checksum round-trips; a contract test proves the firewall rejects a scoring-store-citing task.
2. **MA.2 — pipeline driver + scorer (mock/replay).** *Verify:* driver runs `runTrunkWithGrounding` over a seed task via the sandbox and records the tool-call sequence; scorer computes task-success + invariant-adherence; a fabricated-code / out-of-pharmacology-dose / ignored-HARD_FAIL task scores as an invariant breach.
3. **MA.3 — blocking gate + npm scripts + CI + register/docs.** *Verify:* `npm run bench:medagent` RED on the scripted breach fixtures, GREEN on clean; new CI job present; harvest licence gate stays green (non-shippable path); register + `.claude/` index + CHANGELOG updated.

## Invariant check

Additive-only. fhir-broker and the trunk pipeline are **instantiated, not modified**; the
sandbox is isolated + synthetic + non-persistent; the loader re-asserts the scoring-store
firewall; no change to `candidate_output_hash`, HARD_FAIL enforcement, dose-source, the 7-name
registry, or mock-never-live. Invariants are additionally **measured** by the scorer. **All
preserved.**

## Register / gap-register impact

- **Opens** completeness-register item `medagentbench-benchmark` — `PARTIAL` (seed corpus
  DEV/SYNTHETIC; clinician attestation + live-endpoint fixtures pending), risk **Medium**,
  `degrades_safe` (SKIP-inert), `blocks_patient_facing: false`.
- **Advances** dossier "missing mechanical solution (2) external-benchmark adoption" — this is
  the topology-testing member of the set.
- **Not gap-promoted** (Medium, degrades-safe). CHANGELOG notes it.

## New dependencies

**None.** Pure Node; reuse existing zod, fhir-broker mock, conformance.js, trunk-pipeline,
llm-replay, generation-backend. A live model endpoint at record time is input-gated (mock
default) — no new npm dep. (Any future lift of the *published* MedAgentBench dataset is a
separate harvest-manifest + licence-gate step — deferred; clean-room first.)

## Flagged inputs (not blocking the build)

- **Clinician attestation** of the seed task corpus (KL), like the MIRAGE corpus — seeded
  DEV/SYNTHETIC, gate armed-but-inert until attested.
- **Honest caveat (dossier risk #4):** FHIR benchmarks are ~1k-patient in-memory baselines —
  this measures **correctness + topology**, not scale. The report will say so; it is not a
  load test.
- **Live record run** needs a model endpoint (the operator's deploy choice, e.g. the existing
  Claude backend or MedGemma via its adapter) — input-gated; CI runs on committed fixtures.
