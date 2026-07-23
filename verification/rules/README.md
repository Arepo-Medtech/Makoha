# verification/rules/ — deterministic CQL rule layer (A2)

Standards-based (HL7 CQL) deterministic clinical rules, executed in **pure Node** by
`cql-execution` — the mechanism for moving deterministic logic **out of trunk prompts**
(which drift) and into testable, regulator-legible rules. Plan: `.planning/PLAN-A1-A2.md`.

## How it fits (additive, monotone, never overrides)

A rule's verdict composes into `verification` **exactly** like the existing detector /
evidence-arbiter / PPP-TTT layers (`verification/pipeline.js` `combineVerification` /
`composeArbitration` / `composeTriage`): it can only **ADD** a flag/caution, never rescue
or downgrade, and it rides the **audit channel** on the pipeline result — it is not merged
into the ContextPacket and never reaches the patient without the Clinician Portal. A rule
is a **new deterministic clinical source**, so it sits behind the same receipt/EvidenceNode
+ portal discipline; it **never emits a dose** (dose stays pharmacology-only).

## The compile/execute split (why there is a build step)

There is **no pure-JS CQL→ELM compiler** — the translator is JVM-only. So:

- **Author** rules as `library/*.cql`.
- **Compile at build time** via `cqframework/cql-translation-service` (Docker) →
  `library/*.elm.json` (checksummed). The **JVM never enters the runtime**.
- **Execute at runtime** in pure Node with `cql-execution` (+ `cql-exec-fhir` for
  FHIR-reading rules). Matches our Node 20 / ESM / FHIR R4 pins.

### Producing the compiled ELM (the one machine step)

`library/*.elm.json` is **machine-generated and committed** — it is NOT hand-authored
(hand-written ELM would not match the translator and would fail the CI checksum gate).
Run once, with Docker up:

```bash
docker run -d -p 8080:8080 cqframework/cql-translation-service   # note the tag it resolves
npm run cql:compile                                              # writes *.elm.json + checksums.json
```

Record the resolved translator tag (it lands in `library/checksums.json`) and **pin the CI
service image** (`.github/workflows/ci.yml` → `services.cql-tx.image`) to that same tag, so
the checksum gate is reproducible.

### The CI gate

`npm run cql:verify` recompiles each `*.cql` and asserts the committed `*.elm.json` matches
(sha256 of canonical ELM) — it catches ELM drifting from its `.cql` source. Until the first
`*.elm.json` is committed it **SKIPs green** (armed-and-inert, the MIRAGE / staging-eval
idiom). The CI job runs the translator as a Docker service container.

## Status: A2 COMPLETE (pilot)

A2.1 infra + ELM · A2.2 engine (`engine.js` / `packet-to-fhir.js` / `compose.js` + `rule-verdict.schema.json`
+ `test/contract-cql-rules.js`) · A2.3 pipeline wiring (`verification/pipeline.js`: `composeRules(verification,
await evaluateRules(packet))` gated on `options.ruleset`, byte-identical no-op otherwise, fail-closed to review
on a rule-layer error). Verdicts ride the audit channel (`result.rule_verdicts`) and fold additively/monotone
into `verification` (`rules` / `requires_in_person_review` / `rule_flags` / `rule_caveats`); `pass` and
`candidate_output_hash` are never touched. Full `npm test` green. Next: migrate further rules (any *calibration*
rule needs KL clinical sign-off).

## Current contents

- `library/paediatric-review.cql` (v0.2.0) — the A2 **pilot** rule, minor-consent-capacity bands:
  **`< 16` → in-person review**; **`16–18` → care proceeds** with a NON-BLOCKING plausible-Gillick-
  competence caveat (the competence judgment stays with the human — the rule does not compute it);
  **age unknown → review** (fail-safe). Clinical decision (clinician/operator Ken, 2026-07-24) —
  corrects v0.1.0's `< 18`: 16–18-year-olds are adult-dosed for these low-acuity medicines, so a
  blanket under-18 review is a barrier to care, not a safeguard. Age is a parameter (from the packet
  `patient_age_years` fact) so the result is wall-clock independent and the ELM is reproducible.
- `engine.js` / `packet-to-fhir.js` / `compose.js` — **A2.2/A2.3** (not built yet).

## Status

A2.1 built the deps (`cql-execution` ^3.3.2, `cql-exec-fhir` ^2.1.6), the compile/verify
tooling (`scripts/cql-compile.mjs`), the CI gate, and the pilot `.cql`. **ELM compiled +
committed** — `library/paediatric-review.elm.json` v0.2.0 (defines `InPersonReviewFlag` +
`GillickCompetenceCaveat`, 0 error annotations); `cql:verify` round-trips green; the CI `cql-tx`
service is **pinned by digest** (`@sha256:11b1b14c…`, in `.github/workflows/ci.yml`) to the
translator that produced it. A2.2 (engine + tests that execute the ELM) is unblocked.
