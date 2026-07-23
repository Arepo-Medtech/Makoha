# Approved build plan — A1 (Terminology→Ontoserver) + A2 (CQL rule-layer pilot)

> APPROVED 2026-07-23 (operator: build both, A1 then A2, phase-gated). Derived from the
> Mechanical Inventory reconciliation (`.planning/MECHANICAL-INVENTORY-DOSSIER.md`, §1b).
> Phase 3 execution; stop + report at every phase boundary. No commit without explicit ask.
> Guardrails (unchanged, all plans): scoring-store firewall (nodes 10–13 sealed), SHA-256
> `candidate_output_hash`, HARD_FAIL terminal, dose only from pharmacology, 7-name service
> registry, mock-never-as-live.

## A1 — finish the Ontoserver live path (reuse the built client; extend, don't rebuild)
Files: `mcp/servers/terminology/{ontoserver-client.js,index.js,value-sets.json}` + `test/contract-terminology-ontoserver.js`; pin memo in `docs/structure-notes/`.
- **A1.0** scan terminology subtree (read-only).
- **A1.1** add `$expand` (text lookup) + `$translate` (map) to `ontoserver-client.js`, same fail-safe posture; wire into `index.js` text-lookup + `terminology_map` live paths (replace P1 fail-safe misses). Verify: extend the injected-fetch contract test.
- **A1.2** ECL-authored AMT value sets in `value-sets.json` (ADHA ecl-examples patterns); extend `resolveSystem` to LOINC; route ICD-10-AM/PBS (fail-safe until licensed). Verify: contract test — ECL VS resolves via `$expand`.
- **A1.3** stale-pin decision memo — AU Core 0.3.0→2.0.0, ICD-10-AM 12th→13th, SNOMED edition — **surfaced for KL/operator sign-off, never auto-bumped**.
- **A1.OP** (operator, input-gated): free ADHA Ontoserver licence + NCTS account; set `HEYDOC_TERMINOLOGY_ENDPOINT` + OAuth via secrets manager; bind canonical AMT ValueSet URL; live smoke.
Contracts: no schema change (`terminology-lookup.schema.json` unchanged). New deps: **none**.
Invariant: no-fabricated-codes (all paths fail-safe → verifier blocks unbound codes); mock-never-as-live; RF2 never in repo.
Register: advances `terminology-value-sets-provisional`; partially closes `terminology-contract-incomplete` (LOINC).

## A2 — CQL rule-layer pilot (pure Node; deterministic rules out of the prompt)
New deps (Phase-2 flagged): `cql-execution` + `cql-exec-fhir` (Apache-2.0, R4, zero-JVM runtime); build-time only `cqframework/cql-translation-service` Docker (CI, compiles `.cql`→`.elm.json`, no runtime JVM).
New files: `verification/rules/{packet-to-fhir.js,engine.js,compose.js,library/paediatric-review.cql(+.elm.json)}`, `mcp/schemas/rule-verdict.schema.json`, `test/contract-cql-rules.js`.
- **A2.0** scan `verification/` + insertion point (read-only).
- **A2.1** deps + CI build-time translation with checksum-match assertion.
- **A2.2** packet→FHIR + engine (pure, injected). Verify: ELM executes; paediatric→flag, adult→clean.
- **A2.3** `composeRules(verification, …)` after `composeTriage` (`pipeline.js:472`), gated on optional `options.ruleset` → **no-op/byte-identical** otherwise. Verify: monotone, fail-closed, full `npm test` + `npm run verification` green.
- **A2.4** docs + register.
Pilot rule = **paediatric (<18) → in-person-review flag** — an EXISTING hard limit, deterministic, **no clinical-calibration change**. Migrating any *calibration* rule (e.g. positional/orthostatic) is later + needs **KL sign-off**.
Composition pattern reused: `combineVerification`/`composeArbitration`/`composeTriage` (`pipeline.js:439–472`), monotone fold from `composeCdsVerdict`.
Contracts: new `rule-verdict.schema.json`; verification-report unchanged (rides audit channel like `ppp_ttt`).
Invariant: dose stays pharmacology-only; HARD_FAIL never bypassed (add-only); firewall untouched (reads sealed-clean packet); hash untouched.
Register: opens `cql-rule-layer` (PARTIAL) + gap `deterministic-rule-layer` (Medium, off release-blocker path); partially addresses `trunk-constraint-claims-unenforced`.
