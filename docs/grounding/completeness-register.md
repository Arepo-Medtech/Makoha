# Breath-Ezy Completeness Register

**Document ID:** `heydoc-grounding:completeness-register:2026-06`
**Version:** 1.0.0
**Generated:** 2026-06-30 (Phase 0 full scan)
**Scope:** entire tree excluding `node_modules/`, `.git/`. Read-only discovery per `<completeness_audit>`.

This is the exhaustive inventory of every artifact that is unbuilt, empty, partial, stubbed, dead-end, orphaned, missing a contract, or stale. It is a **superset** of `gap-register.md`; the gap-register stays authoritative for curated build order. High/Critical findings here promote one-way into the gap-register (see "Promotion" at end). Remediation of any item is normal plan-gated work — this register is not authorisation to write code.

**Method.** Tree enumeration with byte sizes; placeholder-marker grep (`TODO/FIXME/XXX/STUB/z.any()/.passthrough()/return {}/throw new Error('not`); schema-integrity reads; producer→consumer wiring from `mcpServers.template.json`, the pipeline, and `.claude/schema-index.md`; hashing/zod/firewall greps. Evidence is recorded per item, not inferred.

**Scan summary:** _(updated 2026-06-30)_ — **all 7 MCP servers now have a mock implementation**: `docs`/`identity-au`/`terminology` (stubs), and `pharmacology` (+ Trunk 8.0 firewall), `knowledge` (+ datasets), `fhir-broker` (+ Observation→parser), `messaging-geo` (never-sends) as mock cores. Remaining: live vendors/EHR + conformance, clinical sign-off on provisional datasets/ranges, Clinician Verification Portal, session persistence, terminology contract (ICD-10-AM/LOINC/PBS). _(Original Phase-0 line: 3 built / 4 unbuilt.)_ 9 trunk prompts + 9 stub agents + 9 cheat-sheets present. Verifier present; the hash/report path is now tested, the 5 checks themselves still untested (`verifier-untested`). ~~No code computes `candidate_output_hash`.~~ **Resolved 2026-06-30** — `candidate_output_hash` (SHA-256) computed in `verify()`, required in the report schema, gated by zod, and tested (`hashing-unimplemented` → COMPLETE). The VerificationReport edge is now zod-validated; GroundingPlan/ContextPacket/EvidenceNode edges remain ungated. Scoring-store firewall **not breached in code today** — no JS reads `data/cases` at all (case ingestion unbuilt).

**H2 scoped re-scan** _(2026-07-06, FLOW_PLAN milestone H2 — Evidence taps, licence-clear subset)_ — Wrapped the three licence-clear evidence taps behind a common `evidence_search`→EvidenceNode contract (NO schema churn): #14→`evidence-fda-pubmed-server`, #15→`evidence-drug-guideline-server` (advisory, structural no-dose bar), #1→`docs-override-live` (contract-docs.js green unchanged). Pattern-lifted #8 detectors into `integrity-detectors` (COMPLETE — wired into pipeline.js via a monotone-AND that keeps `results[]` = the 5 verifier checks; verifier.js untouched). #9 → `guardrail-spec-written` (spec only, no code). #18 → `evidence-graded-deferred` (UNBUILT, deferred-on-licence; licence gate BLOCK 3 refuses it, contract-tested); `evidence-cms-deferred` (US, not built). All evidence paths are **mock-gated / `patient_eligible:false` pending H3/MIRAGE** (H3 blocked on #20's licence). Manifest pinned #14/#15/#1 to verified on-repo SHAs. **No BLIND_STUB or DEAD_END opened**: detectors are wired (real consumer); evidence servers are producers with a contract-test consumer + a future gated retrieval-wiring step (session-store precedent); mock never presented as live (blocked route). 26 suites + licence:check + verification + trunk:stub:all + eval:cases green.

**H3 scoped re-scan** _(2026-07-06, FLOW_PLAN milestone H3 — MIRAGE trust gate)_ — Built a **FIRST-PARTY** MIRAGE-*style* benchmark (`benchmark/mirage/**`, non-shippable): `runMirage(path, corpus)` scores the three built H2 paths (#14/#15/#1) by the `MIRAGE-CORPUS-SPEC` partition rubric — P grounded-support rate ≥ **0.60**; **N abstain-correct = 1.00** + **A invariant-hold = 1.00** as HARD gates (A reuses the `assertNoDose` bar); L diagnostic — tagging each path by its Receipt `upstream`. `test/bench-mirage-gate.js` is wired **BLOCKING** in CI (`npm run bench:mirage`). **NO gzxiong/MedRAG #20 code** (its licence is pending → flipped to REFERENCE·methodology-only in the manifest; the licence gate does not walk `benchmark/`, `licence:check` still 0 blocks). NEW: `mirage-benchmark-gate` (COMPLETE). The three evidence items stay **PARTIAL / `patient_eligible:false`** — H3 gives them a measurable score but the v0.1.0 corpus is a first-tranche **DRAFT, fully unattested**, so **nothing gates** (attestation §7 + H7 governance still pending; MIRAGE-pass is necessary, not sufficient). Measured (mock diagnostic): #14/#15 *would pass if attested*; #1 docs would not (mock echoes citations → fails abstain — honest finding). Scores → `benchmark/mirage/scores/latest.json` (**audit ledger C5 untouched** — `.strict()`, no metadata slot). **No BLIND_STUB / DEAD_END opened**: the harness reads real Receipt/EvidenceNode output over stdio; corpora are independent synthetic QA (scoring nodes 10–13 never opened). 26 suites + licence:check + verification + eval:cases + **bench:mirage** green.

**H4 scoped re-scan** _(2026-07-06, FLOW_PLAN milestone H4 — Case factory)_ — **Case-count reconciled: the M0 line below ("52 cases") is STALE.** The live tree now holds **303 case dirs** (302 before H4 + 1 admitted this milestone): 301 ingested-with-manifest + the manifest-less reference `SPEC-CARD-04-00001`. Raw difficulty bands 01=148 / (02+03+04)=134 / (05+06+07)=21 ≈ **49 / 44 / 7**; ~~only ~52 are clinician-attested (the *trusted* set), the rest `clinician_reviewed:false`~~ _(CORRECTED 2026-07-13: that figure counted the envelope's `clinician_reviewed` field, which stays `false` by design — attestation is recorded in `case_manifest.json`. The trusted set was already **301/301 attested** at this scan date per gap-register R-23; re-verified 2026-07-13 by `eval:cases` PASS: 301 attested / 1 named-exempt reference / 1 unreviewed factory demo.)_ Built the case factory: three generators (synthea #dir, synthea-au #fork, chatty-notes #sib) **re-verified Apache-2.0 + pinned**, wrapped as **out-of-process CLI seams** (`case-factory/{synthea,synthea-au,narratives}/`, no Java vendored, fail-safe input-gated); the **shaper** `case-factory/to-casebundle.js` + **completion** `complete-scoring-nodes.js` (two-phase, CONTRACT §5) emit a contract-valid `.casebundle.json` that flows **through** the existing `cases:ingest` (firewall + `--reseq` + honesty gate untouched). Proven by `test/contract-case-factory.js` (0 problems/0 leaks; AU Core conformant; `synthetic:true`; `clinician_reviewed:false`; firewall fail-closed; never writes `data/cases/` directly; never reads a sealed 10–13 node). CONTRACT §6 drift corrected (`files[].node`→`path`, the tool's key). Demo case admitted (`SPEC-CARD-06-00000`, unreviewed) lifting complex band 20→21 (raw only — excluded from the trusted set until attested). New findings: `case-factory-shaper` (PARTIAL), `synthea-generators-input-gated` (input-gated, Medium). C22 unsettled (target 0.3.0 vs vendored 2.0.1-ci — flagged, not picked). **No BLIND_STUB/DEAD_END opened**: generators are producers with a fixture+contract-test consumer; bundles route only through ingest; scoring nodes 10–13 never opened. 27 suites + verification + trunk:stub:all + licence:check + eval:cases + bench:mirage green.

**H5 scoped re-scan** _(2026-07-07, FLOW_PLAN milestone H5 — Capability expansion: ToolUniverse)_ — Wrapped #28 mims-harvard/ToolUniverse (Apache-2.0, re-verified on-repo at v1.3.1) as `mcp/servers/tooluniverse-gateway/` in COMPACT-MODE (≤5 core tools; `execute_tool(name,args)→{result,receipt}`), the highest security surface in the harvest. **Executor DISABLED + proven UNREACHABLE, not just flagged.** An adversarial full-codebase security sub-agent (one at a time, per the rule) confirmed a 3-name deny-list is INSUFFICIENT — ToolUniverse v1.3.1 ships **2620 tools** including `MCPAutoLoaderTool` (spawns other MCP servers), `AgenticTool`/`SmolAgentTool`/`CallAgent`, `ComposeTool`/`*Pipeline`/`ToolGraph*`, `Replicate_run_prediction`, and the meta `ExecuteTool` that execute code indirectly or run autonomous loops and bypass a name blocklist (verified against the pinned source). Reworked to **DEFAULT-DENY**: `executeTool` forwards ONLY vetted retrieval tools; executors + the agentic/loader/compose families (`isHardDeniedTool`) + any un-vetted/unknown name are refused BEFORE any subprocess forward — the injected `forward` spy is asserted never-called even with valid auth on a live context AND the name force-added to the allow-list. Config layer: `compact_mode`+`exclude_tools` (launch-spec, pure, asserted to always carry the full executor+family exclude set). Own auth (no unauthenticated path; token = secrets-manager ref). **Egress allow-list now ENFORCED on the forward path** (review F2: it was previously imported by nothing but its test) — bounded to declared upstream hosts, default-deny. dev/mock **never** forwards to a real subprocess (review F3: no live-as-mock mislabel). Mode default normalised (review F4). Pinned **v1.3.1 `9b7ff91d`** ≥ RCE floor v1.3.0, enforced by `licence:check` **BLOCK 5** (semver-gte). MedLog #org **STUDIED** for the audit pattern only — NO WORM built, `verification/audit-store.js` UNTOUCHED (ARCH M8 seam already exists). NEW: `tooluniverse-gateway` (PARTIAL — mock/fixture built + contract-tested; live input-gated), `tooluniverse-runtime-input-gated` (PARTIAL, Medium). **No BLIND_STUB/DEAD_END opened**: the gateway is a producer with a contract-test consumer; retrieval tools MIRAGE-gated (`patient_eligible:false`); runtime absent → fail-safe `{available:false}` (never fabricated); no case node (10–13) ever opened. 28 suites + licence:check (BLOCK 5 armed) + verification + eval:cases + bench:mirage + trunk:stub:all green.

**H6 scoped re-scan** _(2026-07-07, FLOW_PLAN milestone H6 — Reasoning topology, D-1 owner-ruled)_ — **D-1 RULED by the operator 2026-07-07: KEEP the tested trunk spine + verifier (ARCH_PLAN RETAIN); LIFT octochains' parallel-expert conflict-audit PATTERN as a trust mechanism; NO new/forked orchestrator.** Built `verification/conflict-audit.js` as a **FIRST-PARTY clean-room** implementation of the published parallel-expert-consensus methodology — #5 ahmadvh/octochains' licence is PENDING, so its code was **not wrapped/vendored/forked/copied — or read** (H3 #20 + H1 fasten-sources precedents); #5 flipped to REFERENCE·methodology-only in the manifest with `target_module` nulled so the first-party file can never read as a harvest target (licence gate BLOCK 2/3 no longer walk the row; `licence:check` 0 blocks). The mechanism: `runConflictAudit(opinions)` (pure, deterministic, zod-`.strict()` in/out, sha256 input-derived `audit_id`) surfaces per-topic agreement/conflict/single-source across N independent expert opinions, over-flagging on any residual difference after conservative normalisation; `attachConflictAudit()` is **ADDITIVE-ONLY, NOT A GATE** — `pass`/`results[]`(=the 5 checks)/`candidate_output_hash` pass through VERBATIM (cannot flip fail→pass OR pass→fail), `missing_receipts` is append-only surfacing, the structured record rides the in-memory `conflict_audit` field (integrity-detectors channel), and firewall fields are never touched — **HARD_FAIL/BLOCKED_NO_PROOF override impossible by construction** (proven against real Trunk 8.0 pipeline runs). **verifier.js, trunk-sequencer.js halt logic, and pipeline.js UNTOUCHED** (verify() asserted bit-identical). #3/#2 read as design references (README prose only, no code — both licence-pending); #4 not read (demo-grade). NEW: `conflict-audit-trust-signal` (COMPLETE). **No BLIND_STUB/DEAD_END opened**: the module is a trust artifact with a contract-test consumer (session-store precedent); wiring a real multi-expert producer + any gate/halt semantics on the signal is future plan-gated work. 29 suites + licence:check + verification + trunk:stub:all + eval:cases + bench:mirage green.

**H7 scoped re-scan** _(2026-07-07, FLOW_PLAN milestone H7 — Governance wiring; LAST FLOW milestone)_ — Wired every harvested path (H1 record-spine, H2 evidence #14/#15/#1, H3 MIRAGE-gated retrieval, H4 case-factory, H5 tooluniverse-gateway) to the EXISTING M5 portal gate. NEW `portal/harvested-release.js` — one fail-closed seam `releaseHarvestedOutput(pathId, output)` (default-deny unknown path; computes `hashCandidateOutput`; defers wholly to `releaseToPatient()`; never sets `patient_eligible`). Each adapter gained one thin `governedRelease(output)` export. Five `test/contract-governance-*.js` (via a shared `governance-path-contract.js` runner) prove per path: CLOSED without an attested `VerificationGateRecord`; dev-mode refuses even WITH a record; opens ONLY with a **synthetic** attested record on the EXACT `candidate_output_hash`; altered output refuses; **no `patient_eligible:true` flip**; and the audit ledger (C5) records a harvested-path run **metadata-only / PHI-free** (isolated temp ledger; unknown/PHI fields dropped; `.strict()` refuses PHI; `verifyChain()` intact). **RETAIN core BYTE-UNCHANGED** (`portal/verification-gate.js`, `verification/audit-store.js`, `verifier.js` — `git diff --stat` empty; confirmed by an adversarial full-codebase release-gating review — no bypass, all six claims CONFIRMED-SAFE). H6's `conflict_flagged` NOT wired into any release decision (future plan-gated). NEW: `governance-wiring-harvested-paths` (COMPLETE). **NO patient path opened; nothing flipped `patient_eligible:true`; gate stays fail-closed by design.** Four-part patient-eligibility precondition (MIRAGE-passed H3 + governance-gated H7 + corpus attested §7 + real Portal UI record M5-remainder) — H7 delivers exactly one (governance). 34 suites (29 + 5 governance) + licence:check + verification + trunk:stub:all + eval:cases + bench:mirage green.

**PPP-TTT scoped re-scan** _(2026-07-11, PPP-TTT Step 1 — graded triage GO/CAUTION/STOP; plan `.planning/PPP-TTT-PLAN.md`)_ — Built `verification/ppp-ttt/` as a **pure, additive, monotone-AND** layer over the existing pipeline (H2 detector lineage): Step-1 veracity interrogation grades raised flags against the clinician-attested `scope-registry.json` v1.3.0 discriminators (deterministic IDs `uhao-N` / `<condition>-cs-N` / `<condition>-refer-1`; read-only, sha256-pinned dataset receipt); CAUTION (the only new runtime state — stigmata attested-absent + stable refer_if form present) runs the fixed ABCDE protocol; **every default-deny branch (unknown/unanswered discriminator, off-registry, managed-only, unattested/TBD, registry drift, module error, malformed input) fails closed to STOP** — gradeConcern cannot throw. `composeTriage()` mirrors `combineVerification()` exactly: `results[]` = the 5 verifier checks untouched, `pass` = AND (STOP ⇒ false, never rescues), tier = ordinal max (never downgrades), STOP reasons carry the literal `escalate_now` token so the UNTOUCHED sequencer halts via its existing rules (Seam B). ABCDE record is self-describing (`_pppTtt` header, `urn:au:digital-tablet`/`ppp-ttt-v1` tag, LOINC sections PROVEN from the pinned omnibus, never minted) and rides the AUDIT CHANNEL only — the ContextPacket is contract-tested byte-identical with/without flags. Parallel PHI-free hash-chained ledger (`ppp-ttt-ledger.jsonl`, own strict schema, cross-linked to the main ledger by `{run_id, candidate_output_hash}`; audit-store.js untouched). **RETAIN core BYTE-UNCHANGED and now PINNED in CI**: `test/contract-ppp-ttt-monotone.js` asserts the sha256 of `verifier.js` / `portal/verification-gate.js` / `audit-store.js` — the first mechanical byte-unchanged gate. Nothing sets the patient-eligibility flag (statically asserted); no scoring-node (10–13) read path (statically asserted); E-PP potestative choice bounded to CAUTION, `subordinate_to_signoff` schema-literal true; decline → refer (no autonomous continuation). NEW: `ppp-ttt-graded-triage` (COMPLETE, Medium). **No BLIND_STUB/DEAD_END opened**: the module has a real producer seam (pipeline `raised_flags`) + contract-test and audit consumers; the Step-3 patient-facing surface stays behind the mock/portal gates (plan §10). 40 suites (37 + 3 PPP-TTT) + licence:check + verification + trunk:stub:all + eval:cases + bench:mirage + npm audit green.

**LIVE readiness scan** _(2026-07-11, `.planning/LIVE_PLAN.md` Phase 0 — operator APPROVED the master plan + commencement of L1/L2 the same day)_ — Scanned the tree for what public release / live execution requires beyond the open register items. The safety core (pipeline, verifier, detectors, PPP-TTT, firewalls, both ledgers, portal gate) is built and fail-closed; what is ABSENT is the product around it: **no deployment/runtime story** (CI is test-only; no entrypoint/Dockerfile/IaC), **no live LLM Step-4 adapter** (generation is stub agents by design — the model has never been in the loop), **no patient/pharmacist product surface**, **no secrets-manager integration**, **no metrics/alarms**, **no production WORM adapter** (M8 seam only), **no consent capture**, **SAST/secret-scanning absent from CI**, sequencer default-OFF, PPP-TTT ledger unwired from the report writers, and the TGA SaMD classification unresolved (org decision — `regulatory_confirmation_exempt_cdss` is a scope-activation-gate condition). Eleven new items registered below (LIVE-PLAN §0.1); the nine High/Critical promoted one-way into the gap-register (R-32…R-40). Build order for remaining work now follows LIVE_PLAN §2 (extends Part D.11). **No BLIND_STUB or DEAD_END on the L1/L2 path** — every named absence degrades to refusal/BLOCKED, none presents mock as live.

**Docs-reconciliation scoped re-scan** _(2026-07-13, planning-doc review remediation — read-only review + register/doc reconciliation, operator-approved)_ — All seven `.planning/` docs verified against the live tree: **zero UNFULFILLED claims** (nothing any plan presents as built is missing); the uniform defect was staleness (repo ahead of the docs). Each plan now carries a dated status-reconciliation banner; the handback checklist's wrong default-model claim (`claude-opus-4-8` → `claude-sonnet-5`, PR #41) and missing plaintext-secret note (PR #44 lesson) corrected; the H4 line's "~52 attested" figure corrected in place (it counted the envelope field; manifests showed 301/301 attested — re-verified via `eval:cases` PASS). One stale code comment fixed (`integration/trunk-pipeline.js` sequencer default). **NEW: `ppp-ttt-ledger-substrate-seam-missing`** (High, pf:true → promoted R-43) — formalised the B1 follow-up: at scan time the PPP-TTT ledger was the only medicolegal chain without a substrate seam. **Registered-and-resolved in the same window:** PR #46 (§9 B1 follow-on) landed independently and built the seam (`registerPppTttLedgerSubstrate()` + `registerWormAudit()` on all three chains, contract-tested) — item recorded COMPLETE/resolved; R-43 closed on arrival. No BLIND_STUB/DEAD_END opened; no code paths changed by this scan beyond the one comment.

**FL-20 + FL-23 scoped re-scan** _(2026-07-13, clinical sign-off on the knowledge datasets + lab reference ranges)_ — The clinician (reviewer KL) attested, in-session, the CLINICAL correctness of the four provisional datasets; recorded faithfully. Each file (`mcp/servers/knowledge/data/{benign-registry,axis-b-templates,redflags-bank}.json` + `verification/data/lab-reference-ranges.json`) gained an `attestation` block (`clinical_sign_off:true`, `regulatory_sign_off:false`, reviewer KL, statement + scope) + updated status. Content assessed substantive before attesting (SNOMED-coded benign criteria; must-not-miss differentials w/ discriminators; tier-appropriate red-flags; standard adult sex-agnostic reference ranges incl. critical thresholds) — not hollow placeholders. **Checksums UNCHANGED** (computed over `records`/`analytes` only; attestation is top-level metadata → `contract-knowledge` + `contract-investigation-parser` green unchanged; no version bump → no `pipeline.js:53` drift). Both register items NARROW: **clinical sign-off DONE** (FL-20 `knowledge-datasets-provisional`, FL-23 `lab-reference-ranges-provisional`); REMAINING = **regulatory (TGA) sign-off (FL-50)** + coverage expansion + live source (knowledge store / FL-32 lab) — so the datasets stay NON-patient-facing (blocked on regulatory + coverage + live, not clinical validity). No version promoted out of `-dev` (would over-claim while regulatory pending). **No BLIND_STUB/DEAD_END opened.** 53 suites + all gates green.

**FL-21 scoped re-scan** _(2026-07-13, MIRAGE corpus CLINICIAN ATTESTATION — LIVE_PLAN L9 attestation half)_ — The clinician (reviewer KL) attested all 98 items of the MIRAGE corpus in-session; recorded faithfully (v0.2.0 draft → **v0.2.1 attested**): every item `attested_by: "KL"`, manifest attestation record + recomputed checksum + all-attested counts. **The corpus now GATES** — the BLOCKING `bench:mirage` (`test/bench-mirage-gate.js`) flipped from asserting-draft (`0 attested / not eligible`) to asserting-**gating** (`98/98 attested`; each evidence path must PASS over attested items — the gate now reddens on any path regression below threshold / attested-N fabrication / attested-A dose-leak). Measured: **all three paths benchmark_passed=true** (P-rate=1.00, abstain=1.00, invariant=1.00; #15's 15 attested dose-elicitation A items all hold the no-dose bar). Item CONTENT unchanged — only attestation metadata + version. **`patient_eligible` STILL false on all three paths** — MIRAGE-pass is necessary, not sufficient: H7 governance (per-release) + the other release blockers remain. Two of the four-part eligibility precondition arms now met (MIRAGE-passed-on-attested + corpus-attested); scores/latest.json corpus_pass=true. R-29 + the three evidence-server items updated. **No BLIND_STUB/DEAD_END opened.** 53 suites + verification + eval:cases + bench:mirage + licence:check + security:secrets green.

**FL-42 scoped re-scan** _(2026-07-13, clinician identity federation — portal remainder, ENG half of the release blocker)_ — Built the **fail-closed clinician-identity-federation seam** + signature binding, narrowing `clinician-verification-portal-unbuilt` (stays Critical/PARTIAL — WORM registration FL-11 + live IdP connect remain). NEW `portal/identity-federation.js`: pluggable `registerIdentityProvider` (built-in `dev` provider NEVER accepted on a live path — `resolveClinicianIdentity` refuses a dev/unregistered provider in enforce-live, same posture as the WORM/secrets seams); `bindSignature` ties the signature to WHO signed + WHAT exact bytes (replaces free-text). The verified-identity block rides the **durable gate-record ENTRY envelope** (`gate-record-store.js` — NOT the frozen `GateRecordSchema`; same layering as `bundle_sha256`), hash-chained + tamper-evident, with a **fail-closed binding** (`record.clinician_id` MUST equal the verified subject). `server.js` `/decision` derives clinician_id + signature from the verified identity (403 on unverified/mismatch); the free-text clinician_id/signature form fields removed. **RETAIN core byte-unchanged** (`verification-gate.js`/`verifier.js`/`audit-store.js` — CI pin holds); `test/contract-portal-identity.js` (in npm test) + updated `contract-portal-review.js`. **No BLIND_STUB/DEAD_END opened.** 53 suites + verification + trunk:stub:all + licence:check + security:secrets green. LIVE IdP connect input-gated (operator protocol/vendor + creds).

**FL-03 scoped re-scan** _(2026-07-13, low-risk hygiene batch)_ — Two Low-risk items resolved. (1) `reference-case-manifest-missing`: `scripts/retrofit-reference-manifest.mjs` generated the missing `case_manifest.json` for the pre-ingest reference case `SPEC-CARD-04-00001` (byte-hash only — sealed 10_–13_ streamed through sha256, never parsed/routed; empty codes_manifest; FAIL-SAFE `clinician_reviewed:false` so the attested count stays 301, with the envelope's KL/2026-06-23 review recorded as a note). The `LEGACY_EXEMPT` set + exemption branch removed from `eval-case-gate.mjs` (missing manifest is now a hard failure). `eval:cases` → **named exemptions: 0** (301 attested, PASS); verify-codes legacy-skipped 0. (2) `repo-digest-sealed-node-carveout`: added a digest-shaped default-deny fixture block to `test/contract-context-allowlist.js` (synthetic content; no data/cases read) proving the M3 allow-list rejects every realistic digest-injection shape with zero sealed leakage. Deferred (explicitly optional, not in the done-when): F1 verifier fuzz suite. **No BLIND_STUB/DEAD_END opened.** `npm test` + verification + eval:cases + bench:mirage + licence:check + security:secrets green.

**FL-02 scoped re-scan** _(2026-07-13, MIRAGE corpus expansion — LIVE_PLAN L9 authoring half, mock-bounded per operator decision)_ — Grew `benchmark/mirage/corpora/*` from 23 → **98 items** (v0.1.0 → v0.2.0). Corpus-only + manifest; **no server/harness/loader/gate code touched**. Phase-1 finding: P (positive-retrievable) is hard-bounded by the canned mock retrievers (**11 distinct keys total** — #14=5, #15=4, #1=1 clinical), so P was maxed to that ceiling with terse claim-substring questions while the safety-critical **N (abstain) + A (adversarial) + diagnostic L** partitions (not key-bounded) were grown to spec strength. All items `synthetic:true`, `attested_by:null` (still non-gating until FL-21), firewall-clean (loader `SCORING_PROVENANCE_RE`; `data/cases/10–13` never opened), question-only (loader-asserted), no dose as an answer key. Diagnostic: all three paths **P-rate=1.00 / abstain=1.00 / invariant=1.00 / would_pass_if_attested=true**. Manifest carries the recomputed checksum + a `mock_bound_note` (natural-language P at ~50/path deferred to live backends, §6). No register item state change: `mirage-benchmark-gate` (R-29) stays COMPLETE (FL-02 grows the corpus, resolves neither the attestation nor the live-backend P-volume). **No BLIND_STUB/DEAD_END opened.** `npm test` + `bench:mirage` + verification + licence:check green.

**FL-30 expansion + round-trip + full clinician sign-off scoped re-scan** _(2026-07-14, FL-30 continuation — APF22 capability reorg, chat↔repo round-trip toolkit, per-record worksheet sign-off; PR #66)_ — Built on the resolved `pharmacology-server-unbuilt`. **(a) APF22 (© PSA) reorganisation.** A NON-DESTRUCTIVE heading overlay (`capability-groups.json`, 9 groups, `contract-pharm-capability-groups.js`) + **8 new reference-only capabilities** — all engine-ISOLATED, per-record provenanced, NOT dose sources, NOT wired to any frozen `check_id`: `dose_evidence` (259 retrieval-grounded records, real PubMed PMID/DOI, retrieve→adversarial-verify workflow, independently re-checked), `administration_handling` ("should not be crushed"), `tdm_parameters` (NTI is its bucket under the TDM heading; frozen `nti_check` untouched), `warning_labels` (RASML/PSA_CAL), `counselling_points`, `pregnancy_risk` (TGA categories), `hepatic` (Child-Pugh), `dose_evidence_review_queue` (§4.3b holding area for APF dose facts that fail PubMed verification). NEW COMPLETE: `pharm-capability-groups-overlay`, `pharm-dose-evidence-register`, `pharm-administration-handling`, `pharm-tdm-parameters`, `pharm-warning-labels`, `pharm-counselling-points`, `pharm-pregnancy-risk`, `pharm-hepatic`, `pharm-dose-evidence-review-queue`. **(b) Chat↔repo round-trip toolkit** (`docs/pharmcheck-export/{PHARMCHECK-EXPORT,DEVELOPMENT-INSTRUMENT,STRUCTURAL-PROPOSALS}.md` + `structural-proposals.json` + `dev-package.schema.json`; `scripts/pharm-ingest.mjs`/`pharm-export.mjs`): the ingest adapter is schema-gated, FORCES `review_status:draft`, integrate-not-overwrite by per-capability NATURAL KEY (`superseded[]` archive, never deletes), a **`--supersede-signed` guard** (refuses to downgrade a clinician-signed record for a draft update without explicit override — added after a caught real error), and a **`has_unsigned_additions`** governance flag (a `contract-pharm-datastore` guard makes a signed dataset with draft additions declare it, so `clinical_sign_off` can't silently over-claim). Export publishes the `.strict()` enum vocabularies (introspected, self-syncing). NEW COMPLETE: `pharm-ingest-adapter`, `pharm-export-generator`. **(c) First per-record clinician sign-off.** Registered pharmacist **Kenneth Lee (MED0001857758)** attested the datastore across two signed worksheets (88 + 308 = every per-record clinical fact); **ZERO per-record drafts remain** — each clinical-judgement dataset is now `clinical_sign_off:true` (regulatory_sign_off:false; `-dev` retained; non-patient-facing). Artifacts retained at `eval/pharmacology/signoff/`. First worksheet caught + refused an inconsistent sheet (empty Decision column vs signed summary) before re-supply — the sign-off is genuine per-row. **Sources:** APF22 registered facts+citation ONLY (clinician-attested authoritative, no content licence held), RASML/TGA primary for labels/pregnancy (`data-sources.json` apf22/rasml-tga/tga-pregnancy, all `structure_only`/verified). **DEFERRED (open):** `dose-evidence-apf-attestation-variant-deferred` (Medium — a clinician-only direct-APF citation variant of `dose_evidence`; touches the dose invariant, schema-only, un-seeded, fail-closed against agents; NOT built), `pregnancy-hepatic-check-unwired` (Medium — the reserved frozen `pregnancy_check`/`hepatic_check` are NOT engine-implemented; wiring needs engine logic only, **NO frozen change** since the enum slots already exist), `pregnancy-risk-bulk-sync-pending` (Medium — the 18 seeds are a confident safety-critical subset; the long tail should BULK-sync from the TGA Prescribing-Medicines-in-Pregnancy DB like `pbs`), `warning-labels-cal-verbatim-pending` (Low — exact CAL/RASML numbers + verbatim wording to confirm before ship). **Frozen `pharm-intent`/`pharm-check` byte-unchanged** (`git diff` 0). **No BLIND_STUB/DEAD_END opened** — every new capability is a producer (authoring pipeline) with a consumer (heading overlay + contract tests); reference-only registers never reach a dose-surfacing path (engine isolation asserted, no accessor reads them). All 8 `contract-pharm-*` suites green.

**Register-maintenance pass** _(2026-07-14, FL-34 Phase 0 — reconcile 4 accumulated tracker↔register discrepancies; report-only, no code)_ — Housekeeping ahead of the FL-34 OpenCDS-gateway build. Four items reconciled: **(1)** `pregnancy-hepatic-check-unwired` — CHANGELOG recorded it closed (FL-05/PR #69) but this register's line-42 prose still listed it DEFERRED(open); now carries a full `- id:` record in MEDIUM marked **COMPLETE/resolved** (engine-wired `pregnancy_check`/`hepatic_check`, contract-tested, frozen schemas byte-unchanged). **(2)** Track A OpenCDS OSS-route artifacts (PR #67) had no register records: added `opencds-cds-adapter-client` + `cds-firewall-fold` (both COMPLETE — the AU_OSS_CDS client + monotone firewall fold, contract-tested) and the three FL-34 gateway build items (`opencds-gateway-image`, `fl30-kb-km-package`, `opencds-gateway-shim`) as UNBUILT/input_gated on the sibling repo `kenleefreo/breath-ezy-cds-gateway`. **(3)** Track B (PR #68) had no record: added `au-provider-bahmni` (PARTIAL/input_gated). **(4)** The three remaining PR #66 DEFERRED ids (`pregnancy-risk-bulk-sync-pending`, `warning-labels-cal-verbatim-pending`, `dose-evidence-apf-attestation-variant-deferred`) now have full `- id:` records. The gap-register R-22 row + §pharmacology status block were reframed from "live vendor pending / do not use" to **FL-30-resolved core + FL-34 patient-facing arm (commercial vendor OR the AU_OSS_CDS OpenCDS gateway)**. No BLIND_STUB/DEAD_END touched; nothing patient-facing; the `cds-adapter` EMPTY→HARD_FAIL floor holds throughout.

**L12 scoped re-scan** _(2026-07-13, LIVE_PLAN L12 consent capture — FL-01, operator-approved plan `.planning/CONSENT-PLAN.md`)_ — Built consent capture as a **recording mechanism, not a permission unlock** (contract-proven both ways: the no-unlock assertion on `persistContent()`, and a zero-consent-reference static scan over the packet path). NEW: `consent-record` schema + zod `.strict()` (PHI-free by construction), `verification/consent.js` (capture/revoke/status + the fail-closed `requireActiveConsent()` seam future persistence MUST call), `verification/consent-store.js` (FOURTH append-only hash chain, substrate seam built day one — R-43 lesson — and `registerWormAudit()` now covers all four chains), session-store close-hook registry (session-bound expiry mechanical; destruction survives a throwing hook), bounded consult-intake consent step (silence records nothing; decline pre-selected + never affects care; SUPPRESSED on STOP/T5), `docs/grounding/privacy-app-mapping.md` (APP 1–13 + data-flow register; org items flagged not decided). `consent-capture-unbuilt` → **COMPLETE/resolved** (R-40 capture half). **No BLIND_STUB/DEAD_END opened**: the store has real producers (consult intake, close hook) and consumers (seam, chain verify, WORM test); `content-store-production-gated` deliberately stays open. 52 suites + verification + trunk:stub:all + licence:check + security:secrets green; RETAIN core byte-unchanged (CI pin).

**M0 scoped re-scan** _(2026-07-03, ARCH_PLAN milestone M0)_ — _(case count SUPERSEDED by the H4 line above — 303 as of 2026-07-06.)_ Case set is now **52 cases** (47 difficulty-01 / 5 difficulty-04 incl. reference `SPEC-CARD-04-00001`; 51 clinician-attested AUC bundles, bulk attestation reviewer KL 2026-07-02) — `case-set-underpopulated` row updated (C18/F15 closed). New findings registered: `routing-plan-next-trunks-dead-end` (DEAD_END-1, High), `mode-leakage-enforcelive` (C16/F4, High), `context-injection-allowlist` (recorded in-register — previously index-only — High), `case-dir-duplicate-files` (Medium), `repo-digest-sealed-node-carveout` (Low). Firewall line superseded: JS now reads `data/cases` via `scripts/ingest-case-bundles.mjs` (field-scoped firewall, contract-tested), `scripts/export-repo-digest.mjs` (documented engineering carve-out), `scripts/build-case-transformation-kit.mjs` (schemas only) and `test/contract-case-ingest.js` — **none routes `10`–`13` content into any trunk/packet path; firewall NOT breached.**

---

## CRITICAL

```md
- id: live-llm-generation-adapter-unbuilt
  path: integration/llm-adapter.js · verification/pipeline.js (Step-4 hook, additive) · test/contract-llm-adapter.js
  component_type: other (generation adapter)
  state: PARTIAL
  evidence: L3 BUILD 2026-07-11 — the gated Step-4 client exists and is contract-proven. PACKET-ONLY BAR is mechanical and default-deny: generateCandidate() re-gates through the strict validateContextPacket zod contract and serialises exactly the parsed object; a smuggled extra field REFUSES generation before any transport call (proven with a spy transport). FAIL-CLOSED: invalid packet, missing trunk prompt, live-without-key, API error/timeout, safety refusal (stop_reason "refusal"), empty output, and max_tokens truncation all → BLOCKED_NO_PROOF; the pipeline turns that into continuation_blocked + an explicit blocked candidate (never fabricated). MOCK BY DEFAULT: HEYDOC_LLM_LIVE AND a secrets-seam key (placeholders refuse) both required for live; mock is audited mode:"mock" (never presented as live). AUDIT: model id (pinned default **claude-sonnet-5** — operator selection 2026-07-11; adaptive thinking, same request surface; override via HEYDOC_LLM_MODEL) + prompt_sha256 (the exact bytes shown to the model) + latency ride result.generation. E2E: a clean grounded fake-live output passes the full composed gate; a dose-leaking generated output is blocked by the detectors; no-hook runs are byte-identical status quo. Dependency @anthropic-ai/sdk ^0.111.0 (MIT) adopted at its LIVE_PLAN §7 gate; npm audit 0.
  blocks: L14 staging soak — REMAINING: real live smoke in STAGING (operator supplies ANTHROPIC_API_KEY via the secrets manager; synthetic packets only) + trunk-prompt tuning against real generations
  safety_class: degrades_safe
  invariant_exposure: LLM-vs-deterministic-truth boundary — now enforced mechanically (strict packet re-gate + frozen verifier downstream)
  risk: Critical
  blocks_patient_facing: true
  build_action: REMAINING — staging live smoke (HEYDOC_LLM_LIVE=1) + prompt tuning; then validate through eval:cases per L14.
  gap_register_link: R-32
  status: open (adapter built + contract-proven; live smoke input-gated)
  last_scanned: 2026-07-11
```

```md
- id: product-surface-unbuilt
  path: patient/consult-flow.js · patient/consult-server.js · test/contract-patient-consult.js · portal/server.js (pharmacist console, L1) · npm run consult
  component_type: other (product surface)
  state: PARTIAL
  evidence: L11 BUILD 2026-07-11 — both surfaces now exist as MOCK-GATED, non-patient-facing demonstrations. Pharmacist console = the L1 portal (built). Patient side (patient/): consult-flow.js is the PURE decision logic + consult-server.js the dependency-free (node:http, server-rendered, XSS-escaped) renderer. THE LOAD-BEARING INVARIANT — no patient-visible CLINICAL DRAFT escapes the release gate — is contract-proven: every clinical draft routes through the FROZEN releaseToPatient() FIRST, and mock/dev release NOTHING, so a dev consult shows "pending clinician sign-off," NOT a draft (a draft appears ONLY when a gate returns released:true, contract-tested). Safety-screen precedence proven: EMERGENCY (PPP-TTT STOP / escalate_now / T5 / hard-stop) → NON-OVERRIDABLE 000 screen, no draft, wins over paediatric/interpreter; under-18 → in-person referral (paediatric hard limit — no dose/draft); interpreter_required → human escalation; CAUTION → PPP-TTT Step-3 E-PP bounded choice (proceed/decline, subordinate to sign-off) + "No diagnosis / No decisions" caveats + safety-net descriptors, draft still gated. Fail-safe: any flow error routes to the emergency screen, never a draft. Nothing sets the patient-eligibility flag; no scoring-store path (statically asserted over patient/).
  blocks: public release, L14 — REMAINING: nothing OPENS a patient path (correct — the four patient-facing blockers + the four-part eligibility precondition are still not green); real intake→Trunk-1.0 flag mapping (plan-gated); clinician identity/session UX; the surface stays mock-gated until L5–L9 content + L13 regulatory clear
  safety_class: degrades_safe (mock/dev releases nothing; emergencies non-overridable)
  invariant_exposure: every patient-visible output flows through releaseToPatient() — now mechanically enforced + contract-proven (no side channel)
  risk: Critical
  blocks_patient_facing: true
  build_action: REMAINING — keep mock-gated; a real patient path opens only when the four blockers + four-part eligibility precondition are green (owned elsewhere). PPP-TTT Step 3 (E-PP screen) is DONE here.
  gap_register_link: R-33
  status: open (both surfaces built mock-gated + contract-proven; no patient path opened, by design)
  last_scanned: 2026-07-11
```

```md
- id: regulatory-classification-undecided
  path: (organisational) TGA SaMD classification / regulatory_confirmation_exempt_cdss
  component_type: other (regulatory decision)
  state: UNBUILT
  evidence: LIVE scan 2026-07-11 — no classification ruling or documented CDSS exemption exists; it is a scope_activation_gate condition in the attested registry and a hard precondition of PUBLIC release.
  blocks: public release (L13/L14); scope activation of every area
  safety_class: none
  invariant_exposure: regulatory_posture — surface, do not decide
  risk: Critical
  blocks_patient_facing: true
  build_action: LIVE_PLAN L13 — operator + qualified specialists rule; the agent prepares the traceability/evidence pack (62304/14971 artifacts from this register chain).
  gap_register_link: R-34
  status: open
  last_scanned: 2026-07-11
```

```md
- id: hashing-unimplemented
  path: verification/{hash.js,verifier.js,report-schema.js,run.js}, integration/trunk-pipeline.js, mcp/schemas/verification-report.schema.json, test/contract-verification-report.js
  component_type: verifier
  state: COMPLETE
  evidence: RESOLVED 2026-06-30 — hashCandidateOutput() (node:crypto, exact UTF-8 bytes) computed first in verify(); candidate_output_hash written by both report writers and now REQUIRED in verification-report.schema.json; validateReport() (zod) gates every write; covered by test/contract-verification-report.js (known vector, determinism, end-to-end hash==output, gate rejects missing/malformed). npm test 4/4 green.
  blocks: (cleared)
  safety_class: none
  invariant_exposure: prime_directive hashing — now enforced mechanically
  risk: Critical
  blocks_patient_facing: true
  build_action: DONE — see evidence.
  gap_register_link: R-16
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: pharmacology-server-unbuilt
  path: mcp/servers/pharmacology/{index.js,schemas.js,engine.js,domain/model.js,sources/pharm-data-source.js,data/*.json}, scripts/pharm-{author,pbs-sync,validate}.mjs, eval/pharmacology/, test/contract-pharm-*.js
  component_type: mcp-server
  state: COMPLETE
  evidence: SELF-BUILD VALIDATED — FL-30 Steps 2–5 (2026-07-13). Engine output conforms to the frozen pharm-check schema (ajv-gated, contract-pharm-schema-conformance); internal domain model + PharmDataSource seam (SyntheticSelfDevelopedSource + LicensedFeedSource stub); PHARM_CDS third state SYNTHETIC_SELF_DEVELOPED (does NOT unlock the cds-adapter E7 floor). Curated CLINICIAN-SIGNED (KL 2026-07-13) datastore — 16 NTI (incl. warfarin+DOACs, KL-directed), 16 renal, 6 interactions, 3 allergy groups, 13 AU scheduling; fail-closed authoring pipeline; PBS Public API v3 cached-sync adapter (live pull input-gated on the deploy secrets backend). Engine WIRED through the seam (Step 4) — the signed datastore drives PharmCheck (proven: dabigatran/methadone signed-only HARD_FAIL). nti_check + unknown-drug escalation added (FL-30 §4.4). STAGING VALIDATION (Step 5): 20/20 cases pass, 8/8 adversarial fail-safe, A/B parity + gate integrity ✓ (**NB — "A/B parity" HERE means the signed datastore vs the mock source, both producing contract-valid PharmChecks. It is NOT FL-34 Phase D's engine-vs-gateway parity (`opencds-ab-parity`), which compares two independent IMPLEMENTATIONS of the same specification. Two different claims, one phrase; disambiguated 2026-07-15 so neither is read as the other.**) (eval/pharmacology/validation-report + validation-signoff.md, signed KL 2026-07-13). Receipts stay mode=mock / heydoc-pharm-synthetic-dev: (no mock-as-live) until regulatory sign-off flips them.
  blocks: (self-build complete + staging-validated) — patient-facing readiness now tracked by SEPARATE items below, not this one
  safety_class: degrades_safe
  invariant_exposure: no-autonomous-prescription (doses only here) + no-HARD_FAIL-override — enforced mechanically and validated
  risk: Medium
  blocks_patient_facing: false
  build_action: RESOLVED for the self-developed core (FL-30). PATIENT-FACING still requires (separate gates, NOT this item): live CDS vendor B4 (cds-adapter EMPTY→HARD_FAIL), regulatory/TGA sign-off, live PBS pull in deploy, AusDI 3b structure notes, and the Clinician Verification Portal. Datasets stay -dev until regulatory sign-off.
  gap_register_link: R-22
  status: resolved
  last_scanned: 2026-07-13
```

```md
- id: investigation-parser-unbuilt
  path: verification/investigation-parser.js, verification/data/lab-reference-ranges.json, verification/pipeline.js, verification/pipeline-schemas.js, test/contract-investigation-parser.js
  component_type: parser
  state: PARTIAL
  evidence: RESOLVED FOR MOCK/DEV 2026-06-30 — deterministic sanitiseInvestigation() maps (analyte/LOINC, numeric) → HL7 band + qualitative value with NO raw number; unknown/non-numeric fail safe to "U"; emits a dataset_version+checksum receipt; wired into contextInjection (runPipeline raw_investigations → sanitised facts); ContextPacket gate enforces sanitised_by + non-numeric value for lab_result. Tested (test/contract-investigation-parser.js). PARTIAL: reference ranges are provisional/dev (lab-reference-ranges-provisional) and there is no live lab source until fhir-broker.
  blocks: (engine cleared) — live use awaits authoritative ranges + fhir-broker
  safety_class: degrades_safe
  invariant_exposure: no-raw-lab-numbers-to-LLM-context — now enforced at parser source AND packet gate
  risk: Critical
  blocks_patient_facing: true
  build_action: DONE for mock/dev (engine met). A MOCK fhir-broker lab source is now wired (Trunk 6.0 Observations → parser). Before patient-facing: authoritative ranges sign-off (lab-reference-ranges-provisional) + a LIVE fhir-broker/EHR source.
  gap_register_link: R-21
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: lab-reference-ranges-provisional
  path: verification/data/lab-reference-ranges.json
  component_type: dataset
  state: PARTIAL
  evidence: OPENED 2026-06-30 — 8 analytes, adult sex-agnostic, explicitly DEV/SYNTHETIC-ONLY. **FL-23 2026-07-13: CLINICAL sign-off OBTAINED (reviewer KL, in-session, recorded faithfully).** The file carries an `attestation` block (clinical_sign_off:true, regulatory_sign_off:false) + updated status: the clinician attests the 8 adult sex-agnostic ranges (troponin I, creatinine, potassium, sodium, haemoglobin, WCC, CRP, glucose) incl. critical thresholds as clinically valid for adult sex-agnostic use by the investigation parser. (No separate "authoritative set" to swap in — the attestation makes the current set the clinically-signed-off set for that scope; sanitiser policy already CONFIRMED at HIST-2.) Checksum UNCHANGED (computed over `analytes` only; the attestation block is top-level). REMAINING before patient-facing: **regulatory (TGA) sign-off (FL-50/L13)** + **sex/age-specific + broader analyte coverage** + a **live FHIR lab source (FL-32)**. Version stays dev-tagged until the full sign-off clears.
  blocks: patient-facing use of the investigation parser — now blocked on regulatory + coverage + live lab source, NOT clinical validity
  safety_class: degrades_safe (marked non-authoritative for patient use; mock/dev only)
  invariant_exposure: clinical-safety (ranges clinically validated 2026-07-13; regulatory validation + live source still required before live)
  risk: High
  blocks_patient_facing: true
  build_action: REMAINING — regulatory (TGA) sign-off (FL-50); sex/age-specific + broader analyte coverage; connect a live lab source (FL-32); then finalise version + checksum. Clinical sign-off DONE (FL-23).
  gap_register_link: R-21
  status: open (clinical sign-off obtained FL-23; regulatory + coverage + live source remain)
  last_scanned: 2026-07-13
```

```md
- id: clinician-verification-portal-unbuilt
  path: portal/{verification-gate.js (frozen), server.js, review-bundle.js, gate-record-store.js} + mcp/schemas/{verification-portal-decision,portal-review-bundle}.schema.json
  component_type: other
  state: PARTIAL
  evidence: GATE BUILT 2026-07-03 (M5); **UI/WORKFLOW + DURABLE RECORDS BUILT 2026-07-11 (LIVE_PLAN L1)** — portal/server.js is the dependency-free (node:http, server-rendered) clinician review console: queue (live submitForReview + ledger/content-store items), review workspace rendering the schema-gated ReviewBundle (exact output bytes, five checks + surfaced detector/triage findings, receipts, evidence claims, firewall status, PPP-TTT verdict + ABCDE record, safety-net), and the decision form (approve/reject/amend + signature_ref). ReviewBundle (portal/review-bundle.js + portal-review-bundle.schema.json) hashes WHAT THE REVIEWER WAS SHOWN (bundle_sha256, tamper-evident). portal/gate-record-store.js persists decisions DURABLE-FIRST to an append-only hash-chained trail (gate-records.jsonl; substrate seam mirrors M8 — non-local unregistered REFUSES) recording bundle_sha256 per decision, then hydrates the FROZEN gate's in-memory registry (idempotent replay across restarts). Auth fail-closed: a live-enforced portal refuses to start without HEYDOC_PORTAL_TOKEN (via the L2 secrets seam); bearer required on every console route. verification-gate.js BYTE-UNCHANGED (CI-pinned). Proven end-to-end by test/contract-portal-review.js: decision→durable chain→hydrate→releaseToPatient round-trip (mock refuses even approved; live releases ONLY exact attested bytes; amend switches to amended text; reject kills; tamper breaks chain; XSS escaped; 401 without token; no patient_eligible reference).
  blocks: patient-facing readiness — REMAINING: WORM substrate registration for gate records (R-39, operator backend choice), the LIVE clinician-identity provider connect (operator [DECIDE] protocol/vendor — OIDC/SAML/AHPRA — + credentials, input-gated), and the patient path itself (none exists, correctly)
  safety_class: degrades_safe (fail-closed; dev modes never release; portal never sends — it permits the gate to permit; identity federation refuses a dev identity on a live path)
  invariant_exposure: prime_directive human-in-the-loop — now mechanically enforceable AND operable at the release boundary, AND the attesting clinician is federation-VERIFIED (not self-asserted)
  risk: Critical
  blocks_patient_facing: true
  build_action: register the WORM adapter for gate records at deploy (R-39); connect a LIVE identity provider (register via registerIdentityProvider + set HEYDOC_PORTAL_IDP — operator protocol/vendor choice + creds); keep every future patient path calling releaseToPatient() (adoption rule, portal/README.md).
  gap_register_link: gap-verification-portal
  status: open (gate + UI/workflow + durable chained storage + **identity-federation seam & signature binding (FL-42)** resolved; WORM registration + LIVE IdP connect remain)
  last_scanned: 2026-07-13
  fl42_note: BUILT 2026-07-13 (FL-42, plan .planning/IDENTITY-FEDERATION-PLAN.md). NEW portal/identity-federation.js — a fail-closed federation seam (registerIdentityProvider pluggable IdP; built-in `dev` provider NEVER accepted on a live path; resolveClinicianIdentity refuses a dev/unregistered provider in enforce-live; bindSignature ties the signature to WHO signed + WHAT exact bytes, replacing free-text). The verified-identity block rides the durable gate-record ENTRY envelope (portal/gate-record-store.js — NOT the frozen GateRecordSchema; same layering as bundle_sha256), hash-chained + tamper-evident, with a fail-closed BINDING assertion (record.clinician_id MUST equal the verified subject). portal/server.js /decision derives clinician_id + signature_ref from the verified identity (403 on unverified / mismatch); decision form drops the free-text clinician_id/signature fields. verification-gate.js + verifier.js + audit-store.js BYTE-UNCHANGED (CI pin holds). Proven by test/contract-portal-identity.js + updated contract-portal-review.js. LIVE IdP connect input-gated on operator protocol/vendor + creds.
```

```md
- id: session-persistence-unenforced
  path: verification/session-store.js (enforcement built)
  component_type: repository-store
  state: COMPLETE
  evidence: RESOLVED 2026-07-03 (M4, enforcement) — verification/session-store.js built: MEMORY-ONLY working-state store (no disk path, no serialisation API — contract test asserts no persistence-shaped export and an untouched data dir); encounter-scoped lifetime (openEncounter → putWorkingState/getWorkingState → closeEncounter DESTROYS all state; closed refs never reopen; reads/writes after close throw; no implicit state creation); mechanical demographic guard per Trust Boundary 4 (demographic-looking keys anywhere in a value, and IHI-shaped values, are REFUSED with a thrown error — conservative over-blocking; identity data stays inside identity-au). The medicolegal ledger is documented exempt (append-only, PHI-free by .strict()). Tested by test/contract-session-store.js (npm test + CI). ADOPTION CONTRACT documented in-module: any future stateful session path MUST hold working state here — holding it elsewhere reintroduces this gap (re-check at every session-flow change). No production session flow exists yet to wire (trunk runs are stateless); the store is the gate artifact, current consumer = contract test.
  blocks: (cleared — enforcement) 
  safety_class: degrades_safe (refuses demographics; destroys on close)
  invariant_exposure: closed at the enforcement layer — no-persistence-beyond-session is now mechanical, not policy
  risk: Critical
  blocks_patient_facing: true
  build_action: DONE (enforcement). Remaining, tracked separately: real-patient content persistence stays gated on consent + content-store-production-gated; adoption re-checked whenever a stateful session flow is built (portal/M5 onward).
  gap_register_link: gap-persistence (R-10)
  status: resolved
  last_scanned: 2026-07-03
```

---

## HIGH

```md
- id: deployment-runtime-unbuilt
  path: Dockerfile (+ INSTALL_AWS_SM build arg) · .dockerignore · docker-compose.yml · deploy/{README.md, bootstrap.mjs, build-and-push.sh, apprunner-create.sh, register-substrates.example.mjs} · portal/server.js startPortal() · npm run portal
  component_type: other (runtime/deploy)
  state: PARTIAL
  evidence: L2 BUILD 2026-07-11 — runtime image (node:20-alpine, npm ci lockfile-only, mock default, HEYDOC_DATA_DIR volume), compose (portal; staging must supply HEYDOC_PORTAL_TOKEN — fail-closed startup). **B2 App Runner scaffolding BUILT 2026-07-11 (operator on AWS/ap-southeast-2):** deploy/bootstrap.mjs (the AWS StartCommand — registers the aws-sm key backend at boot, then starts portal|consult per HEYDOC_SERVICE); Dockerfile INSTALL_AWS_SM build arg adds @aws-sdk/client-secrets-manager to the IMAGE only (core stays cloud-agnostic; not a repo dep); deploy/build-and-push.sh (ECR ensure + build-with-SDK + push); deploy/apprunner-create.sh (App Runner service: ECR image, port 8787, StartCommand bootstrap, instance role [HeydocSecretsRead] + access role [ECR pull], portal token via RuntimeEnvironmentSecrets, /healthz check); deploy/README B2 runbook. Shell + node syntax-checked. Was: nothing could run as a deployed service. **FL-12 FIRST LIVE RUN 2026-07-16 found two defects "syntax-checked" missed:** (1) the instance-role runbook granted GetSecretValue on anthropic.key only — App Runner fetches the RuntimeEnvironmentSecrets portal token with the SAME instance role, so create failed AccessDenied (fix: HeydocSecretsRead widened to both `aws.sm/heydoc/*` secrets — operator applied, README updated); (2) bootstrap.mjs bare-imported the server modules, but both carry a main-module guard (`import.meta.url === file://argv[1]`) added after B2 — an import from the bootstrap starts NOTHING, the process exited with no listener and every instance failed health check (fix: bootstrap now calls the exported startPortal()/startConsult() explicitly; verified locally — bootstrap boot prints portal_started/patient_consult_started and /healthz answers).
  blocks: L14 — REMAINING: operator runs the B2 scripts (create ECR + roles + portal-token secret + service); staging App Runner storage is EPHEMERAL so the local audit ledger isn't durable — B1 (WORM) required before production; a CI-driven deploy (GH Actions→App Runner via OIDC) is a later step (operator OIDC role)
  safety_class: none
  invariant_exposure: none — three-environment one-way promotion config-enforced (mode.js); staging fail-closed (portal token required; non-local audit substrate without a WORM adapter refuses)
  risk: High
  blocks_patient_facing: false
  build_action: **OPERATOR HALF DONE 2026-07-16 (FL-12):** service `breath-ezy-portal` RUNNING (ap-southeast-2), `/healthz` → `{"ok":true,"mode":"live"}`; full prerequisite set live (two roles, portal-token secret, Object-Lock WORM bucket `heydoc-medicolegal-audit`, ECR). The fail-closed boot makes the serving live portal mechanical proof of token + WORM substrate registration. REMAINING: B1 WORM live integrity validation (`verify:rehash --integrity` against the bucket — FL-11's ENG half); optional CI deploy job (OIDC, operator infra) — schedule or waive.
  gap_register_link: R-35
  status: open (deployed and live-enforced in staging; open pending WORM live validation + the optional CI job decision)
  last_scanned: 2026-07-16
```

```md
- id: secrets-manager-integration-unbuilt
  path: integration/secrets.js · integration/secrets-backends/aws-secrets-manager.js · deploy/register-substrates.example.mjs · test/contract-secrets-aws.js
  component_type: other (secrets)
  state: PARTIAL
  evidence: L2 BUILD 2026-07-11 — fail-closed resolver seam (refs "<scheme>:<name>"; env default; UNREGISTERED scheme/missing/empty/`example.invalid` all REFUSE; values never logged; contract-live-ops.js). **AWS Secrets Manager backend BUILT 2026-07-11 (§9 B3; operator chose AWS SM, region ap-southeast-2, secret aws.sm/heydoc/anthropic.key):** `registerAwsSecretsManager({region, secretNames})` fetches each secret ONCE at boot (async) into an in-memory cache, then registers a SYNCHRONOUS `aws-sm` backend (the seam is sync — the Claude client reads getSecret() inline). AWS SDK is DEPLOY-TIME dynamic-import (NOT a repo dependency — core stays cloud-agnostic; absent SDK → actionable install error). Fail-closed at boot (empty/missing SecretString throws — never registers a blank credential); un-preloaded name refuses; value never logged. Contract-tested with an injected fetcher (no SDK, no AWS call) incl. the real absent-SDK branch. Concrete bootstrap in deploy/register-substrates.example.mjs.
  blocks: live credentialed connects — REMAINING: deploy host installs @aws-sdk/client-secrets-manager + IAM secretsmanager:GetSecretValue; other managers (Vault/GCP) = a same-seam resolver when named; rotation = restart (TTL refresh a later option)
  safety_class: none
  invariant_exposure: security_and_secrets — enforced mechanically at the seam; secret value never handled by the agent
  risk: High
  blocks_patient_facing: false
  build_action: REMAINING — deploy host installs the AWS SDK + IAM grant; then A1 live smoke. Vault/GCP resolver on request.
  gap_register_link: R-36
  status: open (seam + AWS SM backend built; deploy-host SDK install + IAM input-gated)
  last_scanned: 2026-07-11
```

```md
- id: observability-metrics-unbuilt
  path: verification/metrics.js · portal /metrics endpoint · both report writers
  component_type: other (observability)
  state: PARTIAL
  evidence: L2 BUILD 2026-07-11 — charter metrics built + contract-tested: counters (runs/pass/fail, HARD_FAIL, BLOCKED_NO_PROOF, PPP-TTT GO/CAUTION/STOP) with derived rates, recorded by BOTH report writers (observability only — never a gate change); alarm seam (onAlarm subscribers + structured stderr line, never throws) — HARD_FAIL raises pharmacology_hard_fail; critical_under_triage channel exposed for the evaluation layer; /metrics JSON on the portal (auth-gated). PPP-TTT STOP deliberately counted, not paged (over-triage is the system working).
  blocks: L14 alarm drills — REMAINING: dashboards/pager wiring (deploy infra)
  safety_class: none
  invariant_exposure: observability_and_audit
  risk: High
  blocks_patient_facing: false
  build_action: REMAINING — deploy wires onAlarm to the pager. The under-triage alarm CALL SITE is now BUILT (L10, 2026-07-11): verification/eval-scoring.js scoreCaseTriage() fires raiseAlarm("critical_under_triage", {case_id,...}) on any critical under-triage (contract-tested).
  gap_register_link: R-37
  status: open (counters + alarm seam + under-triage call-site built; pager/dashboards deploy-gated)
  last_scanned: 2026-07-11
```

```md
- id: ci-secret-scanning-sast-missing
  path: .github/workflows/ci.yml · scripts/check-secrets.mjs
  component_type: ci
  state: PARTIAL
  evidence: L2 BUILD 2026-07-11 — first-party deterministic secret scan built and BLOCKING in CI (`npm run security:secrets`, after npm audit): high-confidence credential shapes only (private-key blocks, AWS/GitHub/Anthropic/Slack/Google tokens, signed JWTs) over TRACKED files; never echoes a matched value; pattern teeth self-tested in contract-live-ops.js; PASS on the tree (2669 files, 0 findings). Was: npm audit only.
  blocks: production path — REMAINING: org-grade SAST tool selection (CodeQL requires GHAS on private repos; semgrep licence/noise trade-off) = operator infra decision
  safety_class: none
  invariant_exposure: security_and_secrets
  risk: High
  blocks_patient_facing: false
  build_action: REMAINING — operator picks the SAST tool; wire it blocking; keep the first-party scan as the deterministic floor.
  gap_register_link: R-38
  status: open (secret-scan blocking; SAST choice operator-gated)
  last_scanned: 2026-07-11
```

```md
- id: worm-substrate-adapter-unbuilt
  path: integration/audit-substrates/s3-object-lock.js · verification/audit-store.js registerAuditSubstrate() seam · portal/gate-record-store.js registerGateRecordSubstrate() seam · verification/ppp-ttt/ledger.js registerPppTttLedgerSubstrate() seam · test/contract-audit-worm-s3.js
  component_type: repository-store
  state: COMPLETE
  evidence: B1 built 2026-07-12 (operator chose S3 Object Lock, COMPLIANCE, 7y), then extended to the third seam (§9 B1 follow-on, same day). `integration/audit-substrates/s3-object-lock.js` registers `s3-object-lock` on ALL THREE medicolegal seams (audit four-op + gate two-op + PPP-TTT triage-ledger two-op) — one immutable S3 object per chain line keyed by the entry's own `seq` (extractSeq), every write `put-object --object-lock-mode COMPLIANCE --object-lock-retain-until-date now+7y --if-none-match "*"`; boot-seeded sync read caches so only writes spawn a subprocess. The PPP-TTT ledger previously wrote fs directly (no seam) — added `registerPppTttLedgerSubstrate()` (two-op, built-in `local`, fail-closed refusal via HEYDOC_PPP_TTT_SUBSTRATE), pure I/O indirection with the chain algorithm unchanged. AWS CLI + execFileSync (NOT the SDK) because the seams are SYNCHRONOUS and the SDK is async — a blocking CLI call is the only synchronous-durable write; AWS CLI is a deploy-time dependency (Dockerfile INSTALL_AWS_S3), not a repo one. Contract-tested through the real frozen stores (appendEntry/readLedger/verifyChain + recordDecisionDurable/verifyGateRecordChain + appendPppTttEntry/verifyPppTttChain round-trip + verify; COMPLIANCE/retain-until/write-once args asserted on all three; collision + missing-arg + absent-CLI fail-closed). 50 suites green; RETAIN core byte-unchanged (ppp-ttt/ledger.js not byte-pinned — seam add is pure I/O indirection). REMAINING (operator/live): provision the Object-Lock bucket + IAM (s3:PutObject/PutObjectRetention/GetObject/ListBucket) and validate live in staging.
  blocks: (resolved 2026-07-16) — the live bucket connect this named is done and validated; production medicolegal storage is no longer gated by this item (the four patient-facing release blockers gate it, as they gate everything)
  safety_class: none (seam fail-closed; write-once + COMPLIANCE lock)
  invariant_exposure: observability_and_audit (append-only, tamper-evident, retention) — enforced at the S3 layer
  risk: High
  blocks_patient_facing: true
  build_action: **RESOLVED 2026-07-16 (FL-11) — live-validated against the real bucket, and the run found a defect no fake could.** Operator half done: Object-Lock bucket `heydoc-medicolegal-audit` (lock enabled at creation, no bucket default retention — the adapter stamps per object), `HeydocWormAudit` on the instance role, `HEYDOC_WORM_*` set by apprunner-create.sh. ENG half: `scripts/worm-integrity.mjs` (`npm run verify:worm`) verifies ALL FOUR chains (audit + content-hash recompute, gate records, PPP-TTT, consent — note the register/tracker previously said THREE; consent joined at L12) against the registered substrate; `test/contract-worm-integrity.js` proves its logic on a fake bucket (13 bars: empty=valid-and-said-so · append verifies · content drift caught · a bucket edit is LOUD). **LIVE EVIDENCE:** integrity over the real bucket → four chains VALID; one synthetic record written through the designed seam (`recordRun`) → read back → audit chain 0→1 entries, VALID, zero drift; both objects present in S3 (`heydoc-audit/ledger/000000000000.json` + its content blob), written with `--object-lock-mode COMPLIANCE --object-lock-retain-until-date 2033-07-16` (S3 accepts those flags only on a lock-enabled bucket, so the accepted write IS the retention proof; reading retention metadata back needs `s3:GetObjectRetention`, which the least-privilege deploy user deliberately lacks). **THE DEFECT (see `worm-write-path-fake-tested-only` below):** the write path had never met a real AWS CLI and was broken — fixed in the same pass, then re-proven live.
  gap_register_link: R-39
  status: resolved
  last_scanned: 2026-07-16
```

```md
- id: worm-write-path-fake-tested-only
  path: integration/audit-substrates/s3-object-lock.js (defaultExec) · test/smoke-worm-live.js
  component_type: other (audit substrate)
  state: COMPLETE
  evidence: **FOUND AND FIXED 2026-07-16 by FL-11's live run — opened and closed in the same pass.** The adapter passed every record body as `--body /dev/stdin` (piping via execFileSync's `input`). **AWS CLI v2 refuses a pipe for a blob parameter** — `Error parsing parameter '--body': Blob values must be a path to a file` — so EVERY WORM WRITE FAILED, in every environment: reproduced on the Mac (v2.35.21) and inside the deploy image (v2.32.7, alpine). Proof the diagnosis was the mechanism, not a guess: the same call with `--body <tempfile>` against a nonexistent bucket returns `NoSuchBucket` (parsing OK, nothing written) while `/dev/stdin` returns `ParamValidation`. **Live at the moment of discovery:** `breath-ezy-portal` was RUNNING with `HEYDOC_AUDIT_SUBSTRATE=s3-object-lock` — reads worked (which is why it booted and why the first integrity run passed), and the first audit WRITE would have thrown. **Fail-closed held:** the CLI failure throws synchronously into the caller (the seam is sync by design), so the pipeline refuses rather than proceeding un-audited — an availability defect on the audit path, never an integrity one; nothing was lost, nothing was silently written elsewhere. **FIX:** `defaultExec` writes the body to a 0600 temp file, substitutes its path for the `--body` argument, and unlinks in `finally`. `aws s3 cp -` accepts stdin but carries no Object-Lock flags, so `s3api put-object` + a path is the only synchronous route to a WORM write. Re-proven live: `test/smoke-worm-live.js` OK (baseline verified · one synthetic record written through the real CLI · read back · four chains valid · zero drift).
  root_cause_class: **the missing TEST CLASS, not the missing test.** `contract-audit-worm-s3` and `contract-worm-integrity` both inject a fake `exec`: they prove the adapter's LOGIC (keys, retention args, chain order, refusals) and are structurally incapable of proving the CLI's PARAMETER GRAMMAR. The broken shape passed every one of them for four days. This is the THIRD defect of this exact family on 2026-07-16 alone — `deploy/bootstrap.mjs` bare-importing servers that no longer self-start (PR #84), the instance-role policy that covered one secret of two, and this. Each was built, fake-tested, and never executed live. The lesson is now mechanical, not cultural: `test/smoke-worm-live.js` is env-gated (skips green with `HEYDOC_WORM_BUCKET` unset — the smoke-opencds-gateway precedent) and is the only test that can catch this class, because only a real CLI can prove a real CLI. **A green CI run does not mean it passed; it means nobody asked.**
  blocks: (resolved) — FL-11's live validation; would have blocked FL-40's first live eval run and any real staging consult
  safety_class: degrades_safe
  invariant_exposure: auditability (trust boundary 5) — the medicolegal ledger could not be written. Threatened availability, never integrity: hashing untouched, append-only untouched, no path to a silent write or a non-WORM fallback (a non-local substrate with no registered adapter still REFUSES).
  risk: High
  blocks_patient_facing: false
  build_action: RESOLVED — temp-file body + the env-gated live smoke. **Standing rule this establishes:** any adapter that shells out to a real binary needs one env-gated live test; a fake-exec suite is necessary and never sufficient. Transient-disk note (accepted, surfaced to the operator before implementation): the temp file holds the exact record bytes for one CLI call at 0600, unlinked in `finally` — the same bytes are already in process memory, and no smaller-footprint synchronous Object-Lock write exists.
  gap_register_link: R-39
  status: resolved
  last_scanned: 2026-07-16
```

```md
- id: ppp-ttt-ledger-substrate-seam-missing
  path: verification/ppp-ttt/ledger.js registerPppTttLedgerSubstrate() seam
  component_type: repository-store
  state: COMPLETE
  evidence: Registered 2026-07-13 (planning-doc review remediation; opened by the B1 2026-07-12 CHANGELOG follow-up note) — and RESOLVED in the same window by PR #46 (§9 B1 follow-on, merged 2026-07-13), which landed independently: the PPP-TTT ledger gained `registerPppTttLedgerSubstrate()` (two-op {appendLine,readLines}, built-in `local`, fail-closed refusal via HEYDOC_PPP_TTT_SUBSTRATE; chain algorithm unchanged, pure I/O indirection) and `registerWormAudit()` now registers `s3-object-lock` on ALL THREE medicolegal seams; contract-tested end-to-end in `test/contract-audit-worm-s3.js` (appendPppTttEntry→verifyPppTttChain through the WORM substrate; COMPLIANCE/write-once/seq-collision asserted). The gap this item named — the triage chain being the only one WORM-unbackable — no longer exists; the remaining operator/live work rides `worm-substrate-adapter-unbuilt` (R-39).
  blocks: nothing — the L14 all-ledgers-WORM condition now depends only on R-39's operator half (bucket + IAM + env selection)
  safety_class: none
  invariant_exposure: none (observability_and_audit seam parity restored across all three chains)
  risk: High (historical rating at registration; resolved)
  blocks_patient_facing: false
  build_action: RESOLVED — built by PR #46 exactly per the M8 seam pattern this item specified (register THROUGH the seam, store logic untouched). No further work; live validation is R-39's staging step.
  gap_register_link: R-43
  status: resolved
  last_scanned: 2026-07-13
```

```md
- id: medgemma-generation-backend
  path: integration/llm-adapter-medgemma.js · integration/generation-backend.js · integration/harvest-manifest.json (REFERENCE row #medgemma) · test/contract-llm-adapter-medgemma.js · test/contract-generation-backend.js
  component_type: other (generation adapter)
  state: PARTIAL
  evidence: BUILD 2026-07-11 (MEDGEMMA-ADAPTER-PLAN, operator-approved: Decision A3 selectable-only backend, Decision B clinician-attested cleared for use). MedGemma is a second Step-4 backend under the IDENTICAL bars to the Claude adapter (L3): strict-packet re-gate (a smuggled field REFUSES before any fetch call, spy-proven), fail-closed to BLOCKED_NO_PROOF on invalid packet / missing endpoint or key / HTTP non-2xx / timeout / safety finish_reason / empty / truncation; mock by default (live requires HEYDOC_MEDGEMMA_LIVE + endpoint + secrets-seam key, all three); audit backend:"medgemma" + model + prompt_sha256 + mode; output → the frozen verifier + detectors + PPP-TTT (dose-leaking generated draft blocked, contract-proven). FIRST-PARTY clean-room HTTPS (OpenAI-compatible chat-completions; endpoint-agnostic for Vertex/HAI-DEF/self-host vLLM/HF) — NO Google code, NO weights in-repo (harvest manifest REFERENCE row #medgemma; weights gitignored/deploy-injected). generation-backend.js selects claude|medgemma from HEYDOC_LLM_BACKEND (default claude; unknown throws); Decision A3 = SELECTABLE ONLY, no failover — a safety refusal stays BLOCKED and is NEVER rerouted to the other model (the-other-transport-never-touched, contract-proven). Imaging/DICOM explicitly OUT (packet carries no images). Frozen core + pipeline + L3 adapter byte-unchanged.
  blocks: nothing — REMAINING: staging live smoke against a real MedGemma endpoint (operator supplies HEYDOC_MEDGEMMA_ENDPOINT + key via the secrets manager; synthetic packets only) + confirm the served endpoint's exact request/response shape (OpenAI-compatible default; Vertex-native shape is a deploy adapter concern)
  safety_class: degrades_safe
  invariant_exposure: LLM-vs-deterministic-truth boundary — enforced mechanically (strict packet re-gate + frozen verifier); no autonomous dx/rx (same bars as any candidate)
  risk: High
  blocks_patient_facing: false
  build_action: REMAINING — staging live smoke + endpoint-shape confirmation; then validate through eval:cases per L14. Licence/regulatory clearance = RESOLVED by clinician attestation (Decision B, attested_by KL 2026-07-11; manifest #medgemma notes).
  gap_register_link: R-41
  status: open (adapter + selector built + contract-proven; live smoke input-gated)
  last_scanned: 2026-07-11
```

```md
- id: consent-capture-unbuilt
  path: verification/consent.js · verification/consent-store.js · verification/consent-schema.js · mcp/schemas/consent-record.schema.json · docs/grounding/privacy-app-mapping.md
  component_type: other (consent)
  state: COMPLETE
  evidence: BUILT 2026-07-13 (LIVE_PLAN L12 / FL-01; operator-approved plan .planning/CONSENT-PLAN.md). Consent capture is a RECORDING mechanism, NOT a permission unlock — contract-proven: persistContent() still refuses non-synthetic content with an ACTIVE consent (no-unlock assertion), and the packet path carries zero consent references (static scan of pipeline/context-allowlist/trunk files). NEW consent-record schema + zod .strict() (PHI-free by construction: session_ref + enums + proven omnibus bindings + hashes; free text unrepresentable); verification/consent.js captureConsent/revokeConsent/consentStatus + requireActiveConsent() — the FAIL-CLOSED seam every future persistence path MUST call (BLOCKED_NO_CONSENT on every branch: no record / declined / revoked / session-ended / unknown type / malformed / store failure); consent types NEVER minted (omnibus types carry provenPath() + pinned dataset receipt; session_persistence explicitly heydoc-first-party); FOURTH append-only hash chain (consent-records.jsonl) with its substrate seam built DAY ONE (registerConsentStoreSubstrate, fail-closed non-local refusal — the R-43 lesson) and registerWormAudit() extended to all four chains; session-bound expiry MECHANICAL (session-store close-hook registry inactivates active consents on closeEncounter; destruction survives a throwing hook); consult intake gains BOUNDED consent choices (silence records nothing; decline is the pre-selected safe default and never affects care; capture SUPPRESSED on STOP/T5 emergency). test/contract-consent.js in npm test + CI (52 suites). RETAIN core byte-unchanged (CI pin holds). v1 scope: session_persistence + RECORD-ONLY mhr_data_sharing/telehealth_consent.
  blocks: nothing — consented persistence IMPLEMENTATION remains deliberately unbuilt (content-store-production-gated open; any future path must call the seam + clear the release blockers)
  safety_class: degrades_safe (default-deny seam; declining/failing to record leaves nothing-persists in force)
  invariant_exposure: none (data_handling "no persistence without explicit consent" now has both halves — negative enforcement + capture/require mechanism)
  risk: High
  blocks_patient_facing: true
  build_action: RESOLVED — capture + record + seam + APP mapping built. Remaining L12 siblings tracked separately: SAST (R-38/FL-13), pen-test + formal privacy review (FL-51), org APP documents (privacy-app-mapping.md §4).
  gap_register_link: R-40
  status: resolved
  last_scanned: 2026-07-13
```

```md
- id: governance-wiring-harvested-paths
  path: portal/harvested-release.js, integration/record-sources/sources-client.js, mcp/servers/_shared/evidence-map.js, benchmark/mirage/index.js, case-factory/to-casebundle.js, mcp/servers/tooluniverse-gateway/tool-gateway.js, test/governance-path-contract.js, test/contract-governance-{record-spine,evidence,retrieval-mirage,case-factory,tooluniverse}.js, package.json, .github/workflows/ci.yml
  component_type: other
  state: COMPLETE
  evidence: BUILT 2026-07-07 (FLOW_PLAN H7, LAST FLOW milestone). Every harvested path (H1–H5) routes patient-directed output through the EXISTING M5 portal gate (ARCH_PLAN C9) via the shared fail-closed seam portal/harvested-release.js: releaseHarvestedOutput(pathId, output) validates pathId against a frozen 5-entry allow-list (default-deny unknown), computes hashCandidateOutput(output) (never accepts a caller-supplied hash), and defers the ENTIRE decision to releaseToPatient(); returns the gate verdict + path/milestone attribution; NEVER sets patient_eligible. Each adapter got one thin governedRelease(output) export (no logic change to existing exports). Proven per path by test/contract-governance-*.js (shared governance-path-contract.js runner): CLOSED without an attested VerificationGateRecord (reason names mandatory clinician review); dev-mode (mock) refuses even WITH a record; opens ONLY with a SYNTHETIC attested record on the EXACT candidate_output_hash (no real clinician sign-off, no Portal UI); altered output refuses (hash recomputed); no patient_eligible:true flip (verdict + native PATIENT_ELIGIBLE/synthetic checks); audit ledger (C5) records a harvested-path run metadata-only/PHI-free (isolated temp ledger, unknown/PHI fields dropped, .strict() refuses PHI, verifyChain intact). RETAIN core BYTE-UNCHANGED (verification-gate.js, audit-store.js, verifier.js — confirmed by an adversarial full-codebase release-gating review: no bypass, all six claims CONFIRMED-SAFE). H6 conflict_flagged NOT wired into any release decision. NO patient path opened; gate stays fail-closed by design. 34 suites + licence:check + verification + trunk:stub:all + eval:cases + bench:mirage green.
  blocks: (cleared) — governance is now enforced across every harvested path
  safety_class: degrades_safe (fail-closed; refuses without an attested record; dev modes never release; never sets patient_eligible)
  invariant_exposure: governance-is-a-release-blocker (FLOW_PLAN §1) / prime_directive human-in-the-loop — now mechanically enforced at every harvested path's release boundary; FMEA G7 (governance-gate bypass) mitigation wired + contract-proven
  risk: High
  blocks_patient_facing: false
  build_action: DONE — see evidence. Patient-eligibility additionally requires (still open, NOT H7): MIRAGE-pass over an ATTESTED corpus (§7), the Clinician Verification Portal UI/workflow + durable WORM gate-record storage (ARCH M5 remainder + M8), and the M9/M10/live-runtime input gates. Every future patient-facing path MUST call a governedRelease seam (adoption rule).
  gap_register_link: R-31
  status: resolved
  last_scanned: 2026-07-07
```

```md
- id: harvest-licence-clearance-gate
  path: integration/harvest-manifest.json, scripts/check-licence-clearance.mjs, test/contract-harvest-manifest.js, docs/grounding/integration-register.md, .github/workflows/ci.yml, package.json
  component_type: ci
  state: COMPLETE
  evidence: BUILT 2026-07-06 (FLOW_PLAN H0). Machine-readable harvest allow-list (41 rows = FLOW_PLAN 6.2's 40 + split-out GPL fasten-onprem) is the source of truth; check-licence-clearance.mjs (zod-validated; exported runCheck for tests) BLOCKS on (1) AGPL/GPL SPDX/header in a shippable module, (2) a DROP/DEFER repo pulled in as a dependency or present at a target, (3) a licence-pending repo wrapped on a shippable path, (4) MedRAG conflation (gzxiong #20 vs SNOWTEAM2023). Override-existing targets (fhir-broker/docs) key off a live-backend marker, not directory existence, so our own mock servers do not false-positive. Wired BLOCKING into CI (licence:check step after npm audit) + npm test (contract-harvest-manifest → 22/22). Armed-and-green: 0 blocks today (no harvested code in tree — H0 authorises none), 12 warn (unpinned ADOPT rows — pin at H1+). SCORING-STORE FIREWALL: scans source under shippable paths for licence headers only; never opens case node bodies (10-13).
  blocks: (cleared) — H1+ harvest may now be licence-gated
  safety_class: none
  invariant_exposure: licence floor (FLOW_PLAN §1) — now enforced mechanically; AGPL/GPL reference-only
  risk: High
  blocks_patient_facing: false
  build_action: DONE — see evidence. Pin exact commits + flip Confirm licences to verified as each repo is wrapped (H1+).
  gap_register_link: none (COMPLETE — the gate, not a gap)
  status: resolved
  last_scanned: 2026-07-06
```

```md
- id: harvest-confirm-licences-pending
  path: integration/harvest-manifest.json (licence_status:pending rows)
  component_type: dependency
  state: PARTIAL
  evidence: OPENED 2026-07-06 (FLOW_PLAN H0); NARROWED 2026-07-06 (FLOW_PLAN H1); NARROWED AGAIN 2026-07-06 (FLOW_PLAN H2). H1 CLEARED wso2/fhir-mcp-server (#16): Apache-2.0 verified on-repo (v0.10.0), pinned 6307fe71, wrapped behind fhir-broker/live-backend.js; BLOCK 3 stays green. H2 CLEARED + PINNED the three licence-clear evidence taps: #14 Cicatriiz/healthcare-mcp-public (MIT re-verified on-repo, pinned 1c4c40c3 -> evidence-fda-pubmed), #15 JamesANZ/medical-mcp (MIT, pinned 13d2fddd -> evidence-drug-guideline), #1 anthropics/healthcare (first_party, pinned dff06a1b -> docs override marker) — all wrapped as external pinned processes (no vendored code), pin_status pinned, gate green. REMAINING shippable pending = ONLY connerlambden/bgpt-mcp (#18 -> evidence-graded): DEFERRED-ON-LICENCE at H2 (NOT wrapped, evidence-graded/ left unbuilt, licence_status kept 'pending' DELIBERATELY so licence gate BLOCK 3 refuses any premature wrap). A preliminary GitHub check 2026-07-06 reported SPDX MIT for #18 but that is NOT on-repo LICENSE clearance and #18 is out of H2 scope — adoption is its own plan-gated milestone. Non-shippable advisory-pending: 2023Anita #9 (guardrail-spec written H2, still spec-only), asanmateu/medgraph-ai #21 (pattern), gzxiong/MedRAG #20 (benchmark, H3). H1 register-defect (fasten-sources mislabel) stands resolved.
  blocks: adoption of #18 evidence-graded (deferred-on-licence; H3-adjacent, own plan-gate)
  safety_class: none (gate holds them back)
  invariant_exposure: licence floor — no unresolved-licence dependency in a shippable path
  risk: High
  blocks_patient_facing: true
  build_action: For bgpt-mcp #18 — verify the on-repo LICENSE file, record it + pin an exact commit, flip pending->verified BEFORE wrapping evidence-graded (its own milestone; NOT H2). Non-shippable rows are advisory until adoption.
  gap_register_link: R-27
  status: open
  last_scanned: 2026-07-06
```

```md
- id: evidence-fda-pubmed-server
  path: mcp/servers/evidence-fda-pubmed/{index.js,live-backend.js}, mcp/servers/_shared/evidence-map.js, test/contract-evidence-fda-pubmed.js
  component_type: mcp-server
  state: PARTIAL
  evidence: BUILT 2026-07-06 (FLOW_PLAN H2, #14 Cicatriiz/healthcare-mcp-public, MIT, pinned 1c4c40c3). Mock-core MCP server exposing evidence_search(query, filters?) -> { results[], receipt } over FDA/PubMed/ClinicalTrials/ICD-10 canned literature; each result maps onto the EXISTING evidence-node.schema.json (NO churn) via _shared/evidence-map.js toEvidenceNode (supports[].kind="live_data_receipt", ref=receipt.request_id). Common Receipt emitted; the receipt.schema.json `server` enum (7 servers only) is deliberately OMITTED, self-id via upstream. live-backend.js is an input-gated adapter seam to the external pinned #14 process (no vendored code); mock is default+rollback; a live context with no endpoint BLOCKS (mock-never-as-live, C16). Contract-tested (Receipt shape, EvidenceNode conformance via ajv, ref==request_id grounding, filter, patient_eligible:false). PARTIAL: live external process + API keys (input-gated) and the H3 MIRAGE gate before any patient use. **FL-21 2026-07-13: MIRAGE now GATES over the clinician-attested corpus (v0.2.1) and this path is benchmark_passed=true (rate 1.00, N/A hard gates 1.00) — `patient_eligible` STILL false (H7 governance per-release + live backend pending; MIRAGE-pass necessary, not sufficient).**
  blocks: nothing on the H2 path; patient use blocked by H3 MIRAGE + governance (by design)
  safety_class: degrades_safe (mock default; blocks in live w/o endpoint; never presents mock as live)
  invariant_exposure: evidence-verified-trust (patient_eligible:false until MIRAGE); no-fabricated-facts (verifier applies unchanged)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — connect the external pinned #14 process + keys via secrets manager + egress allow-list; then H3 MIRAGE-gate before patient_eligible. Optional: wire evidence_search into the pipeline retrieval path (a future gated step) — today the consumer is the contract test.
  gap_register_link: R-27
  status: in-progress
  last_scanned: 2026-07-13
```

```md
- id: evidence-drug-guideline-server
  path: mcp/servers/evidence-drug-guideline/{index.js,live-backend.js}, mcp/servers/_shared/evidence-map.js, test/contract-evidence-drug-guideline.js
  component_type: mcp-server
  state: PARTIAL
  evidence: BUILT 2026-07-06 (FLOW_PLAN H2, #15 JamesANZ/medical-mcp, MIT, pinned 13d2fddd) — ADVISORY ONLY. Mock-core evidence_search over drug-interaction/paediatric/guideline advisory evidence; each result maps to a conformant EvidenceNode. THE NO-DOSE STRUCTURAL BAR (G9 / §1 dose-source-singular), three fail-closed layers: (1) AdvisoryResultSchema is z.strict() with advisory:true REQUIRED and NO dose/dosage/strength/frequency field EXPRESSIBLE; (2) assertNoDose() throws on any dose-shaped key anywhere in a result OR its EvidenceNode before serialisation; (3) claims are advisory-framed, no dose value placed in a readable field. The pharmacology firewall (Trunk 8.0 PharmCheck) + verifier check 5 remain the ONLY dose source. Contract-tested ADVERSARIALLY (every result advisory:true; whole-payload has no dose-shaped key; assertNoDose throws on {dose},{dosage_mg},{max_dose},{frequency}; EvidenceNode conformant; patient_eligible:false). live-backend.js input-gated seam (any future live path MUST pass buildAdvisoryResponse -> schema + assertNoDose). Mock default+rollback; blocks in live w/o endpoint. **FL-21 2026-07-13: MIRAGE now GATES over the clinician-attested corpus (v0.2.1) and this path is benchmark_passed=true — incl. the 15 attested A dose-elicitation items all holding the no-dose invariant. `patient_eligible` STILL false (H7 + live vendor pending).**
  blocks: nothing on the H2 path; patient use blocked by H3 MIRAGE + governance
  safety_class: degrades_safe (advisory; structurally barred from a dose; mock default)
  invariant_exposure: dose-source-singular (G9) — enforced structurally; no-fabricated-facts; evidence-verified-trust
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — connect external pinned #15 process + keys; H3 MIRAGE-gate before patient_eligible. The no-dose bar holds on mock and any future live path.
  gap_register_link: R-27
  status: in-progress
  last_scanned: 2026-07-13
```

```md
- id: docs-override-live
  path: mcp/servers/docs/{index.js,live-backend.js}, test/contract-docs.js
  component_type: mcp-server
  state: PARTIAL
  evidence: BUILT 2026-07-06 (FLOW_PLAN H2, #1 anthropics/healthcare, first_party, pinned dff06a1b). OVERRIDE not rebuild: docs/live-backend.js is the input-gated adapter seam to the #1 PubMed/FHIR-dev backend AND the harvest MARKER the licence gate keys off (override_existing_targets "mcp/servers/docs" -> live-backend.js). index.js gained a shared docsLiveGuard() that diverts ONLY when the context normalises to live (blocked w/o endpoint, fail-safe live otherwise); the mock/dry_run docs_search/docs_get/docs_cite behaviour + receipt shape are preserved VERBATIM — contract-docs.js stays green unchanged. patient_eligible:false pending H3. H3 CARRY-FORWARD 2026-07-06: the docs_search MOCK branch is now a deterministic keyword retriever (matchSnippets — exact content-token overlap >= 2 over title/excerpt/source_id) that ABSTAINS (results: []) on a no-match query instead of echoing canned citations; docs_get/docs_cite/dry_run/live-guard untouched, contract-docs.js still green. MIRAGE #1 now passes the N (abstain) partition on mock (diagnostic: P 2/2, N 2/2, A 1/1, would_pass_if_attested:true); still patient_eligible:false (unattested corpus §7 + H7). **FL-21 2026-07-13: corpus now clinician-attested (v0.2.1) → this path is benchmark_passed=true (rate 1.00, abstain/invariant 1.00); `patient_eligible` STILL false (H7 + live docs backend pending).**
  blocks: nothing; live docs retrieval input-gated + MIRAGE-gated
  safety_class: degrades_safe (mock default preserved; blocks in live w/o endpoint)
  invariant_exposure: mock-never-as-live (C16); evidence-verified-trust
  risk: Low
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — connect the #1 backend + creds; H3 MIRAGE-gate. evidence-cms/ (US CMS/NPI) deliberately NOT built at H2 (low AU priority) — see evidence-cms-deferred.
  gap_register_link: R-27
  status: in-progress
  last_scanned: 2026-07-13
```

```md
- id: integrity-detectors
  path: verification/integrity-detectors/{index.js,detectors.js}, verification/pipeline.js (composed), test/contract-integrity-detectors.js
  component_type: verifier
  state: COMPLETE
  evidence: BUILT + WIRED 2026-07-06 (FLOW_PLAN H2, #8 Aperivue/medsci-skills PATTERN-LIFT, MIT, NO copied code / NO runtime dep). Four pure deterministic detectors (advisory_dose_leak [critical, reinforces the #15 no-dose boundary at the verification layer], fabricated_citation_marker [fail], unsupported_statistic [fail], overconfident_diagnosis [warning]) STRENGTHEN the frozen verifier.js (C1) via combineVerification() — a MONOTONE AND: it folds the detectors' verdict into `pass`, records detector failures in missing_receipts, and KEEPS results[] = the five verifier checks so the VerificationReport contract (report-schema.js, validateReport in run.js AND trunk-pipeline.js) is unchanged (no schema churn). Wired at the single verify() call site in pipeline.js — verifier.js UNTOUCHED. Contract-tested: per-detector fixtures, MONOTONICITY (detector fail fails a passing base; passing detectors never rescue a failing base; results stays 5 checks; hash preserved), composed report validates, clean stub passes, a dose-leaking advisory output is blocked. npm test + verification harness green.
  blocks: (cleared)
  safety_class: none — strengthens C1; monotone (can only add a failure)
  invariant_exposure: no-fabricated-facts / dose-source-singular — strengthened, never loosened
  risk: High
  blocks_patient_facing: false
  build_action: DONE — see evidence. Future: lift more of #8's ~30 patterns as additional pure detectors (each must stay monotone + low-false-positive).
  gap_register_link: none (COMPLETE — the strengthening, not a gap)
  status: resolved
  last_scanned: 2026-07-06
```

```md
- id: mirage-benchmark-gate
  path: benchmark/mirage/{run-mirage.js,paths.js,mcp-client.js,key-normalise.js,corpus-loader.js,index.js,README.md}, benchmark/mirage/corpora/*.corpus.json + manifest.json, benchmark/mirage/scores/latest.json, test/bench-mirage-gate.js, .github/workflows/ci.yml, package.json, integration/harvest-manifest.json (#20)
  component_type: test
  state: COMPLETE
  evidence: BUILT 2026-07-06 (FLOW_PLAN H3). FIRST-PARTY MIRAGE-style trust gate — NO gzxiong/MedRAG #20 code (licence pending; #20 flipped ADOPT·BENCHMARK → REFERENCE·methodology-only in the manifest; benchmark/ is non-shippable so the licence gate does not walk it; licence:check still 0 blocks, still exactly 1 pending-shippable #18). runMirage(retrievalPath, corpus) -> {path, score, per_question[], passed, diagnostic, …} scores the three built H2 paths (#14/#15/#1) driven as external stdio processes (mock default), TAGGED BY Receipt `upstream` (evidence key extracted from supports[].excerpt / citation_id — §4 finding: no server change needed). Rubric (MIRAGE-CORPUS-SPEC §9): P grounded-support rate ≥ 0.60 (operator-set at the Phase-2 gate); N abstain-correct = 1.00 + A invariant-hold = 1.00 as HARD safety gates (A reuses _shared/evidence-map.js assertNoDose — the same no-dose bar as #15); L diagnostic. Gates over ATTESTED items only (§7); the harness NEVER sets patient_eligible (H7-gated). test/bench-mirage-gate.js wired BLOCKING in CI (npm run bench:mirage, step after eval:cases); RED on corpus-acceptance failure / attested N-fabrication / attested A-dose-leak / silent pass with 0 attested / upstream-tag mismatch; teeth proved by in-memory fixtures (above-threshold pass, sub-threshold blocked, N-fabrication fail, A dose-leak fail, unattested excluded, question-only rejection). Corpus v0.1.0 (23 items) is a first-tranche DRAFT (strict §5 loader; firewall-clean — never opens data/cases; question-only §2.5/§11; SHA-256 checksummed §8) authored to MIRAGE-CORPUS-SPEC, synthetic:true, attested_by:null → NON-GATING. Scores → benchmark/mirage/scores/latest.json; audit ledger C5 UNTOUCHED (.strict(), no metadata slot — MIRAGE scores are benchmark metadata, not verification-run records). Measured (mock diagnostic): #14/#15 would_pass_if_attested=true; #1 docs=false (mock echoes 2 canned citations for any query → fails abstain hard gate, recorded honestly). 26 suites + licence:check + verification + eval:cases + bench:mirage green.
  blocks: (cleared) — evidence-retrieval trust is now measurable + CI-gated
  safety_class: none — strengthens evidence-verified-trust; no path made patient-facing
  invariant_exposure: evidence-verified-trust (benchmarked-before-trusted) — now enforced mechanically; dose-source-singular reused as the A hard gate; licence floor held (#20 not wrapped)
  risk: High
  blocks_patient_facing: false
  build_action: DONE — see evidence. REMAINING (input-gated, NOT this milestone): clinician attestation of the corpus (§7) + §6 volume top-up once live backends connect (the mock retrievers are canned stubs) → then a path can become benchmark-eligible; patient_eligible still additionally requires H7 governance.
  gap_register_link: R-29
  status: resolved
  last_scanned: 2026-07-06
```

```md
- id: tooluniverse-gateway
  path: mcp/servers/tooluniverse-gateway/{index.js,tool-gateway.js,launch-spec.js,egress-allowlist.js,fixtures/tool-catalogue.json,README.md}, test/contract-tooluniverse-gateway.js, scripts/check-licence-clearance.mjs (BLOCK 5), integration/harvest-manifest.json (#28), mcp/mcpServers.template.json
  component_type: mcp-server
  state: PARTIAL
  evidence: BUILT 2026-07-07 (FLOW_PLAN H5, #28 mims-harvard/ToolUniverse, Apache-2.0 re-verified on-repo at v1.3.1, pinned 9b7ff91d, RCE floor v1.3.0). Compact-mode MCP gateway exposing ≤5 core tools (execute_tool/list_tools/find_tools/get_tool_info); the full 600-1000+ library is reached ONLY via execute_tool(name,args)→{result,receipt}. **Executor DISABLED + PROVEN UNREACHABLE.** Adversarial full-codebase security review (single sub-agent) found a 3-name deny-list insufficient — v1.3.1 ships 2620 tools incl. MCPAutoLoaderTool/AgenticTool/ComposeTool/Replicate_run/meta ExecuteTool that execute code indirectly or run autonomous loops (confirmed against pinned source). Reworked to DEFAULT-DENY (tool-gateway.js executeTool gate order: hard-deny executors+families → auth → allow-list → route → egress): only vetted retrieval tools forward; everything else refused before any subprocess forward — the injected forward spy is asserted NEVER called even with valid auth + live context + the name force-allow-listed. Config layer: buildLaunchSpec() compact_mode + exclude_tools (pure, asserted full executor+family exclude). Auth: no unauthenticated path (token=secrets-manager ref). Egress: ENFORCED on the forward path (review F2 fix — was a dead control), bounded to declared upstream hosts, default-deny. F3 fix: dev/mock NEVER forwards to a real subprocess (no live-as-mock). F4 fix: MODE normalised through mode.js. Pin floor enforced by licence:check BLOCK 5 (semver-gte; a sub-floor bump fails CI). Fail-safe absence: runtime absent → {available:false, input-gated}, never fabricated (H4). MedLog #org STUDIED (audit pattern only; audit-store.js UNTOUCHED). Contract-tested adversarially (test/contract-tooluniverse-gateway.js: executor+family unreachable incl. evasion variants; default-deny; egress through executeTool; auth; no live-as-mock; Receipt; patient_eligible:false; fail-safe absence). 28 suites + licence:check + verification + eval:cases + bench:mirage green.
  blocks: nothing on the H5 path; live tool execution input-gated + MIRAGE/governance-gated
  safety_class: degrades_safe (executor unreachable; default-deny; runtime absent → fail-safe; never mock-as-live)
  invariant_exposure: augmented-not-autonomous + no-autonomous-execution (executor + agentic/loader/compose disabled + proven unreachable); licence floor (Apache-2.0 + RCE floor enforced); evidence-verified-trust (patient_eligible:false); no-fabricated-facts (verifier applies unchanged) — all held
  risk: High
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — a Python runtime + runnable SMCP entrypoint (HEYDOC_TOOLUNIVERSE_CMD) + API keys via secrets manager + the deploy-time egress netns policy; then MIRAGE-gate retrieval tools (H3) + governance (H7) before any patient path. When the pin is bumped, re-reconcile the deny-list/allow-list against the new tool-surface diff (structural weakness noted by the review — BLOCK 5 enforces the version floor, not the tool-surface diff).
  gap_register_link: R-30
  status: in-progress
  last_scanned: 2026-07-07
```

```md
- id: tooluniverse-runtime-input-gated
  path: mcp/servers/tooluniverse-gateway/launch-spec.js (locateToolUniverse), index.js
  component_type: mcp-server
  state: PARTIAL
  evidence: OPENED 2026-07-07 (FLOW_PLAN H5). No ToolUniverse Python runtime is present in the environment (ModuleNotFoundError; no pip). Per the H4/H1 precedent the gateway is built + contract-tested against a committed FIXTURE catalogue and FAIL-SAFES to {available:false, reason:"input-gated: ToolUniverse runtime absent"} — never fabricates a tool result, never half-initialises. Live execution is input-gated exactly like a live vendor connection: HEYDOC_TOOLUNIVERSE_CMD (a runnable SMCP entrypoint) + a Python runtime + API keys via the secrets manager + the deploy-time egress policy.
  blocks: live scientific-tool execution at volume
  safety_class: degrades_safe (fail-safe absence; synthetic fixture for discovery only; never presents absence as a result)
  invariant_exposure: none while input-gated
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — provide a Python runtime + SMCP entrypoint + keys; wire the subprocess transport `forward` seam (currently omitted → live path fail-safes); then MIRAGE + governance before any patient use.
  gap_register_link: none (Medium, non-blocking — mirrored via tooluniverse-gateway R-30)
  status: in-progress
  last_scanned: 2026-07-07
```

```md
- id: evidence-graded-deferred
  path: mcp/servers/evidence-graded/ (INTENTIONALLY UNBUILT), integration/harvest-manifest.json (#18), scripts/check-licence-clearance.mjs
  component_type: mcp-server
  state: UNBUILT
  evidence: DEFERRED-ON-LICENCE 2026-07-06 (FLOW_PLAN H2). #18 connerlambden/bgpt-mcp (graded full-text evidence) is OUT OF H2 SCOPE per operator directive and its on-repo licence is unconfirmed — mcp/servers/evidence-graded/ is deliberately LEFT UNBUILT and #18's licence_status kept 'pending' so the licence gate BLOCK 3 REFUSES any wrap of the shippable target (proven by test/contract-harvest-manifest.js: planting evidence-graded/index.js + a pending #18 row fires BLOCK 3). A preliminary GitHub check 2026-07-06 reported SPDX MIT for #18, but that is not on-repo LICENSE clearance; adoption is a separate plan-gated milestone (H3-adjacent). No fabricated dependency, no directory, no pin.
  blocks: graded-evidence retrieval (deferred by design); nothing on the H2 path
  safety_class: none (gate refuses it; nothing built)
  invariant_exposure: licence floor — held (deferred until on-repo clearance)
  risk: High
  blocks_patient_facing: true
  build_action: DEFERRED — its own plan-gated + licence-gated milestone: verify the on-repo LICENSE, pin an exact commit, flip pending->verified, wrap evidence-graded/ with fallback to #14/#15 (degrade to BLOCKED_NO_PROOF on outage, never fabricate), then H3 MIRAGE-gate. Do NOT build until then.
  gap_register_link: R-27
  status: open (deferred-on-licence)
  last_scanned: 2026-07-06
```

```md
- id: evidence-cms-deferred
  path: mcp/servers/evidence-cms/ (NOT built at H2)
  component_type: mcp-server
  state: UNBUILT
  evidence: DEPRIORITISED 2026-07-06 (FLOW_PLAN H2). #1 anthropics/healthcare's CMS/NPI capability would target evidence-cms/ (FLOW_PLAN 6.3), but CMS/NPI are US-centric and low AU priority; the H2 directive says include only if trivial and do not build evidence-cms/ as a priority. Only the docs override (PubMed/FHIR-dev) was taken from #1. evidence-cms/ is intentionally absent.
  blocks: nothing (US capability, out of AU scope now)
  safety_class: none
  invariant_exposure: AU-context (US assets are localisation templates, not connectors to ship)
  risk: Low
  blocks_patient_facing: false
  build_action: build only if/when a US CMS/NPI capability is scoped; not scheduled. Would still be MIRAGE-gated + governance-gated like every retrieval path.
  gap_register_link: none (Low — below promotion threshold)
  status: open (deferred)
  last_scanned: 2026-07-06
```

```md
- id: guardrail-spec-written
  path: docs/grounding/guardrail-spec.md
  component_type: derived-doc
  state: COMPLETE
  evidence: WRITTEN 2026-07-06 (FLOW_PLAN H2, #9 2023Anita/clinical-ai-agent-skills PATTERN-LIFT, SPEC ONLY). Evidence-first rulebook (G-1..G-11) codifying the rules the grounding stack already enforces, each mapped to its mechanical enforcement point. NO code lifted/read/forked/vendored from #9 (licence pending, non-shippable). Subordinate to CLAUDE.md / ARCH_PLAN §1 / FLOW_PLAN §1.
  blocks: (cleared)
  safety_class: none (documentation)
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — see evidence. Keep in sync if an enforcement point moves.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-06
```

```md
- id: fhir-live-adapter
  path: mcp/servers/fhir-broker/live-backend.js, mcp/servers/fhir-broker/index.js, test/contract-fhir-live.js
  component_type: mcp-server
  state: PARTIAL
  evidence: BUILT 2026-07-06 (FLOW_PLAN H1, #16). Node adapter to an EXTERNAL commit-pinned wso2/fhir-mcp-server (Apache-2.0, 6307fe71, v0.10.0) over MCP streamable-HTTP; maps onto the EXISTING fhir_read/fhir_search contract ({resource}/{bundle}); receipts mode=live; FAIL-SAFE to null on any transport/tool error (never a fabricated resource); PUBLIC_SANDBOX_HOSTS refused in production (mirrors the M11 terminology dev_sandbox rule). Live path taken only when HEYDOC_FHIR_MCP_ENDPOINT configured AND mode normalises to live (C16); mock stays default + full rollback. Contract-tested offline (mocked MCP transport) + wired into npm test; opt-in HAPI-sandbox smoke (HEYDOC_FHIR_LIVE_SMOKE=1). No Python vendored, no new runtime dep. PARTIAL: a real EHR/SMART-on-FHIR connection needs a running wso2 process + OAuth2 credentials via the secrets manager (input-gated) + AU Core ValueSet binding (needs live NCTS).
  blocks: live FHIR reads for Trunk 6.0 (still mock until a live upstream + creds)
  safety_class: degrades_safe
  invariant_exposure: no fabricated operational facts (fail-safe null); mock-never-as-live (C16); no-raw-lab (Observations routed via record-sources -> parser)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — operator supplies a running wso2 fhir-mcp-server + SMART-on-FHIR/OAuth2 creds via secrets manager; then live-smoke against a real AU EHR in staging (synthetic patients) before any prod consideration. Live AU Core binding tracked by fhir-r4-aucdi-conformance-unbuilt.
  gap_register_link: R-28
  status: open
  last_scanned: 2026-07-06
```

```md
- id: au-record-sources-ingest
  path: integration/record-sources/ (sources-client.js, au-providers/au-providers.json, README.md)
  component_type: other
  state: PARTIAL
  evidence: BUILT 2026-07-06 (FLOW_PLAN H1). FIRST-PARTY clean-room SMART-on-FHIR ingestion spine (Fasten upstream private/unlicensed — see harvest-confirm-licences-pending). Enforces the record boundary: every FHIR Observation with a numeric value crosses the investigation parser (C3) to a qualitative lab_result fact (raw number stripped, sanitised_by set) then session-store (C8); non-lab resources reduced to bare {resourceType,id,status} references (name/DOB/etc dropped); demographics never persist (session-store guard is the backstop); all state destroyed on encounter close. buildAuthorizeRequest() builds a SMART App Launch authorize-request shape and REFUSES any provider not status:available. au-providers.json is metadata only — client_id_ref points at a secrets-manager key, NEVER a secret; only the public HAPI synthetic sandbox is 'available' (smoke target, refused in production). Contract-tested (contract-fhir-live.js). PARTIAL: au-mhr provider is status:input_gated — live MHR connection needs ADHA conformance registration + OAuth2 client + credentials (none in repo).
  blocks: live patient-record ingest (My Health Record) — input-gated on ADHA registration + creds
  safety_class: degrades_safe
  invariant_exposure: no-raw-lab (parser-gated); patient-data minimisation / no-demographic-persistence (Trust Boundary 4); no secrets in repo
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — operator supplies ADHA/MHR conformance registration + a registered OAuth2 client + credentials via secrets manager; flip au-mhr status input_gated->available; live-connect in staging (synthetic) behind the portal gate (C9) before any patient path.
  gap_register_link: R-28
  status: open
  last_scanned: 2026-07-06
```

```md
- id: verifier-untested
  path: verification/verifier.js, verification/pipeline.js, test/contract-verifier.js
  component_type: test
  state: COMPLETE
  evidence: RESOLVED 2026-06-30 — test/contract-verifier.js covers all 5 checks (clean PASS + violation FAIL + receipt/citation flip), the candidate_output_hash return, overall-pass logic, and a runPipeline() integration (5 results). Wired into npm test (6/6) + CI.
  blocks: (cleared)
  safety_class: none
  invariant_exposure: all 5 verifier checks — now under test
  risk: High
  blocks_patient_facing: true
  build_action: DONE — see evidence. (Check coverage will be extended alongside verifier-weak-code-detection.)
  gap_register_link: R-18
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: verifier-weak-code-detection
  path: verification/{verifier.js,pipeline.js,retrieval-mcp.js}, test/contract-verifier.js
  component_type: verifier
  state: COMPLETE
  evidence: RESOLVED 2026-06-30 — CODE_PATTERNS now span SNOMED/ICD-10-AM/ICD-11/LOINC/PBS with false-positive guards; true per-code binding for SNOMED/ICD-10-AM/LOINC (each token must appear in a terminology receipt's validated_codes; ICD-11/PBS coarse, documented); mock-mode flagging (flag in mock, block in non-mock context). Fixed a pre-existing terminology-receipt upstream-naming bug on the MCP path. Covered by test/contract-verifier.js; trunk:stub:all 9/9 on stub + live MCP.
  blocks: (cleared)
  safety_class: degrades_safe (ungroundable codes now blocked)
  invariant_exposure: no-fabricated-codes — now bound per code
  risk: High
  blocks_patient_facing: true
  build_action: DONE — see evidence. Exact ICD-11/PBS token binding remains future work, bounded by terminology-contract-incomplete + aucdi-r3-valueset-binding-unbuilt.
  gap_register_link: R-19
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: terminology-live-adapter
  path: mcp/servers/terminology/live-adapter.js + index.js (live branch); terminology-servers.json; test/contract-terminology-live.js
  component_type: mcp-server
  state: PARTIAL
  evidence: BUILT 2026-07-05 (ARCH_PLAN M11 P1, operator-approved). The terminology server gained a LIVE path behind the frozen TerminologyLookup contract: a *code* lookup/validate is checked against a FHIR terminology server via CodeSystem $validate-code (live-adapter.js, Node 20 global fetch, no new dep). Endpoint selected by HEYDOC_TERMINOLOGY_ENDPOINT (mock default = rollback; dev_sandbox | ncts_live_api | self_hosted from terminology-servers.json). SAFETY: dev_sandbox (CSIRO reference server, unlicensed intl content) is REFUSED in production (server exits 1 — verified); receipts carry the actual endpoint + mode:"live"; fail-safe on any error/timeout/miss/AU-unmapped-system → validated:false, never a fabricated concept (verifier then blocks the unbound code). Contract-tested: mocked-fetch unit tests (request shape, mapping, all fail-safe paths, production-refuse guard) + an OPT-IN live smoke (HEYDOC_TX_LIVE_SMOKE=1) that validated a real SNOMED code against the CSIRO sandbox (22298006 → "Myocardial infarction"). Mock contract test unchanged (npm test 21/21). REMAINING (input-gated): AU-content validation (SNOMED CT-AU/ICD-10-AM/PBS/AMT) needs NCTS or self-host (sandbox validates only SNOMED-intl/LOINC/ICD-11); live text lookup ($expand) + $translate are P1-out-of-scope; the 301-case code re-validation happens at the NCTS/self-host connect.
  blocks: nothing new — adapter mechanics proven; AU grounding is the next (input-gated) step
  safety_class: none — mock is the default rollback; live path is opt-in and refuses unlicensed content in production; fail-safe never fabricates
  invariant_exposure: no-fabricated-codes — strengthened (live validation or fail-safe miss; sandbox refused in production)
  risk: Medium
  blocks_patient_facing: false
  build_action: NCTS/self-host connect (M11 onward, input-gated on the licence/RF2 deploy or NCTS OAuth creds): resolve the AU code systems, live-revalidate the 301 case codes, add live text/$translate.
  gap_register_link: R-20
  status: open (adapter built; AU-content connect input-gated)
  last_scanned: 2026-07-05
```

```md
- id: terminology-contract-incomplete
  path: mcp/schemas/terminology-lookup.schema.json, mcp/servers/terminology/{index.js,terminology-servers.json}, verification/{verifier,retrieval-mcp}.js, data/digital_tablet_omnibus.json
  component_type: schema
  state: PARTIAL
  evidence: MOCK MULTI-SYSTEM BUILT 2026-06-30 — terminology `system` enum now SNOMED_CT/ICD_10_AM/ICD_11/LOINC/PBS/AMT (the Digital Tablet's systems); server grounds each (mock, echoes looked-up codes); terminology-servers.json records the live NCTS/Ontoserver endpoints (from the Digital Tablet) used ONLY in live mode. Verifier now binds SNOMED/AMT/ICD-10-AM/LOINC/PBS per-code (ICD-11 stays coarse). retrieveTerminology grounds multiple systems; end-to-end ICD-10-AM binding verified on the MCP path. Contract-tested.
  blocks: (mock cleared) — live NCTS + AU Core value-set binding remain
  safety_class: degrades_safe
  invariant_exposure: no-fabricated-codes — all 4 mandated systems now groundable + bound (mock)
  risk: High
  blocks_patient_facing: true
  build_action: REMAINING (input-gated) — live NCTS/Ontoserver connection (NCTS licence) + AU Core value-set binding (fhir-r4-aucdi-conformance-unbuilt / aucdi-r3-valueset-binding-unbuilt); no live PBS API; AMT subset not validated.
  gap_register_link: R-20
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: digital-tablet-omnibus
  path: data/digital_tablet_omnibus.json
  component_type: dataset
  state: COMPLETE
  evidence: IMPORTED 2026-06-30 — the "Digital Tablet" AU Core R4 schema capsule (previously referenced by evidence-node/context-packet schemas but ABSENT). Declares the code systems (SNOMED CT-AU 20240301, ICD-10-AM 12th, LOINC 2.77, PBS, AMT), AU Core conformance profiles, and terminology_servers (NCTS Ontoserver). No secrets (public reference URLs). Resolves the dangling fhir_path reference.
  blocks: (was) terminology grounding design + fhir_path reference resolution
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — imported. Its terminology_servers + AU Core structure feed the (input-gated) live-terminology + AU Core value-set-binding work.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: receipt-store-append-only-unbuilt
  path: verification/audit-store.js, verification/ledger-schema.js, mcp/schemas/audit-ledger-entry.schema.json, verification/rehash.js, test/contract-audit-store.js
  component_type: repository-store
  state: COMPLETE
  evidence: DEV-COMPLETE 2026-07-05 (M8/C5). Append-only, hash-chained ledger built (2026-06-30). M8 added the PRODUCTION SUBSTRATE SEAM + retention hook with the chain algorithm FROZEN: the four raw I/O ops (appendLedgerLine/readLedgerLines/writeContentOnce/readContentByHex) are behind a pluggable substrate; built-in `local` = dev JSONL (byte-identical to before — verifyChain + all prior assertions unchanged); production registers a WORM adapter via registerAuditSubstrate() at deploy; FAIL-SAFE: a non-`local` HEYDOC_AUDIT_SUBSTRATE with no adapter REFUSES (never a non-WORM ledger). auditRetentionPolicy() surfaces HEYDOC_AUDIT_RETENTION as a minimum-keep regulatory_posture decision — NO period encoded, NEVER auto-deletes. Contract-tested (custom in-memory substrate proves the seam; WORM-refuse; retention surfaced). Architecture doc (trust-boundaries.md Boundary 5) updated. REMAINING is deploy/regulatory ONLY (register a live WORM store + set retention) — not an engineering gap. Content-text store stays synthetic-only (`content-store-production-gated`) until R-10 + consent.
  blocks: (cleared for engineering; live WORM + retention are deploy/regulatory)
  safety_class: none — seam is stricter (refuses on misconfig); chain frozen
  invariant_exposure: auditability — enforced; production path now has a fail-safe seam
  risk: High
  blocks_patient_facing: true
  build_action: DONE (engineering). Deploy/regulatory: register a live WORM adapter (S3 Object Lock/immudb) via registerAuditSubstrate() + set HEYDOC_AUDIT_RETENTION per the org's minimum-keep decision. Do not encode a retention period in code.
  gap_register_link: R-17
  status: resolved
  last_scanned: 2026-07-05
```

```md
- id: content-store-production-gated
  path: verification/audit-store.js (persistContent / content store)
  component_type: repository-store
  state: PARTIAL
  evidence: OPENED 2026-06-30 — exact-output content store + verify:rehash --reissue are built but mechanically restricted to synthetic data (persistContent refuses non-synthetic; live entries forced content_persisted=false). Real-patient output persistence is deliberately deferred.
  blocks: batch rehash over real-patient outputs
  safety_class: degrades_safe (refuses non-synthetic)
  invariant_exposure: patient-data minimisation; no-persistence-beyond-session
  risk: Medium
  blocks_patient_facing: false
  build_action: enable governed (consented, encrypted, retention-bound) content persistence ONLY after session-persistence-unenforced (Critical) + consent are green; keep the synthetic-only guard until then. Milestone link: gated on ARCH_PLAN C8/M4 (session-store enforcement) + consent — not independently schedulable.
  gap_register_link: none
  status: open
  last_scanned: 2026-07-03
```

```md
- id: routing-plan-next-trunks-dead-end
  path: integration/trunk-sequencer.js (consumer built) ← trunk 1.0 routing_plan.next_trunks
  component_type: other (pipeline orchestration edge)
  state: COMPLETE
  evidence: RESOLVED 2026-07-03 (M2) — integration/trunk-sequencer.js built: consumes the PARSED Trunk 1.0 routing_plan.next_trunks (zod-gated; a malformed plan throws and never part-runs) and walks each routed trunk through the full five-step pipeline via runTrunkWithGrounding. Halts UNCONDITIONALLY on: (1) Trunk 1.0 safety_gate escalate_now/T5 BEFORE any routed trunk runs; (2) continuation_blocked — HARD_FAIL/BLOCKED_NO_PROOF now propagate ACROSS trunks with no override path (F2 closed); (3) escalate_now/T5 in any trunk output (conservative over-halt detection — over-triage-safe); (4) verification pass=false (a rejected output never grounds the next trunk). Ordered execution record per ARCH_PLAN §3.5.5. Gated behind HEYDOC_SEQUENCER (DEFAULT OFF = rollback; off runs nothing); re-exported from trunk-pipeline.js as the single integration surface. Tested end-to-end by test/contract-sequencer.js (in npm test + CI). RESIDUAL (by design): flag defaults off until an operator turns it on; manual multi-trunk chaining outside the sequencer must still honour continuation_blocked (documented in trunk-pipeline.js).
  blocks: (cleared)
  safety_class: none — halt logic is unconditional; escalation detection over-halts on ambiguity
  invariant_exposure: closed — no-HARD_FAIL-override now holds across the whole sequence, not just within one trunk
  risk: High
  blocks_patient_facing: true
  build_action: DONE — see evidence.
  gap_register_link: R-24
  status: resolved
  last_scanned: 2026-07-03
```

```md
- id: mode-leakage-enforcelive
  path: verification/mode.js (normaliser), verification/{verifier.js,pipeline.js,audit-store.js} (wired seams)
  component_type: verifier
  state: COMPLETE
  evidence: RESOLVED 2026-07-03 (M1) — verification/mode.js built: env(mock/dry_run/staging/production/live)→enforcement(mock/dry_run/live); staging/production→live⇒mock proof BLOCKED; UNKNOWN mode default-denies to live; absence keeps the documented dev default (mock). Wired into all three consumers of the seam: pipeline.js context_mode derivation, verifier.js enforceLive, and audit-store.js recordRun (staging is no longer classified synthetic — content NOT persisted, content_persisted=false, ledger mode enum-valid; this second F4 site was found during M1 research and fixed in the same step). Tested end-to-end by test/contract-mode-normaliser.js (mapping, default-deny, verifier blocking/flagging, pipeline packet mode, ledger classification) — wired into npm test + CI. RESIDUAL (tracked, not a defect here): MCP servers stamp receipt.mode from their own HEYDOC_MODE_DEFAULT read and only ever run mock today; server-side mode stamping is normalised at live-connect (M9/M11).
  blocks: (cleared)
  safety_class: none — enforcement is now monotone-stricter (staging/production/unknown block; mock/dry_run unchanged)
  invariant_exposure: closed — mock proof can no longer stand as grounding evidence on a non-dev path
  risk: High
  blocks_patient_facing: true
  build_action: DONE — see evidence.
  gap_register_link: R-25
  status: resolved
  last_scanned: 2026-07-03
```

```md
- id: context-injection-allowlist
  path: verification/context-allowlist.js (built), enforced in verification/pipeline.js contextInjection()
  component_type: sanitiser
  state: COMPLETE
  evidence: RESOLVED 2026-07-03 (M3) — verification/context-allowlist.js mirrors the cases:ingest field-scoped firewall at the packet boundary, DEFAULT-DENY. 01 allows only demographics/opening_complaint/history_as_reported (→ packet facts, category-mapped); 02 allows only the dialogue text sub-fields (classified exchange-channel and NEVER converted to packet facts — simulator material is not packet material); 00, psychosocial_profile, digital_tablet_field_map, unknown nodes/fields, and 02 scoring/gate sub-fields all reject. A sealed scoring node (10_–13_) ANYWHERE in the input THROWS ("SCORING-STORE FIREWALL") and halts packet assembly — never a silent drop. Enforced in contextInjection() via the new case_content path; end-to-end tested through the ContextPacket zod gate (test/contract-context-allowlist.js, in npm test + CI; all fixtures synthetic, no case file read). Firewall re-check at M3 close: only the known engineering set references sealed nodes; NOT breached. QUARANTINE (see objective-data-offered-sanitiser-policy): objective_data_offered rejects with a named pending-policy reason until the operator confirms the patient-reported-vitals sanitiser policy.
  blocks: (cleared)
  safety_class: none — default-deny; sealed content is a hard stop
  invariant_exposure: closed — the live boundary now mirrors the ingest guard
  risk: High
  blocks_patient_facing: true
  build_action: DONE — see evidence.
  gap_register_link: R-26
  status: resolved
  last_scanned: 2026-07-03
```

```md
- id: objective-data-offered-sanitiser-policy
  path: verification/context-allowlist.js (quarantine rule on 01.objective_data_offered)
  component_type: sanitiser
  state: PARTIAL
  evidence: OPENED 2026-07-03 (M3) — CLAUDE.md <data_handling> flags an open follow-up: confirm the sanitiser policy for patient-reported vitals before the live pipeline injects objective_data_offered into trunk context. M3 built that injection path, so the field is QUARANTINED (rejected with a reason naming this item) rather than shipped unconfirmed. Values are schema-stored as strings (no structured raw number), but a leading-numeric patient-reported reading (e.g. "160 over 95") would enter LLM context under a non-lab category the packet gate does not guard — policy decision needed: pass as-is (telehealth carve-out), band via the investigation parser, or keep withheld.
  blocks: patient-reported home/wearable observations reaching trunk context
  safety_class: degrades_safe (withheld until confirmed)
  invariant_exposure: none while quarantined; no-raw-lab-numbers adjacency is the question to settle
  risk: Medium
  blocks_patient_facing: true
  build_action: DONE (HIST-2, 2026-07-11) — operator CONFIRMED the STRING-PRESERVING policy: objective_data_offered flows per item as a vital_sign fact, value = the patient-stated string verbatim ("<type>: <value>"), provenance = the item's DECLARED source channel (no source → withheld, never defaulted), verified:false; values never parsed to structured numbers on this path; the no-raw-lab-numbers adjacency settled by a NEW MECHANICAL BAR in pipeline-schemas.js (a patient-provenance fact may never carry category lab_result). Charter <data_handling> reconciled in CLAUDE.md; contract-tested (contract-context-allowlist + contract-history-summary, in npm test).
  gap_register_link: none (Medium — below promotion threshold; charter follow-up now register-tracked)
  status: resolved
  last_scanned: 2026-07-11
```

---


```md
- id: dose-hold-surface-unenforced
  path: portal/server.js (assertQuarantineHeld — the only surface that enforces it) · .planning/SHOW-EVIDENCE-PRINCIPLE.md §1.1
  component_type: other (safety bar)
  state: PARTIAL
  evidence: **Opened 2026-07-15 by the §1.1 amendment (D-A-1), which exists to make this gap VISIBLE rather than to create it.** W2 retained blocked dose text in the ReviewBundle (operator ruling: *"keep all guidance in an on-hold quarantine pathway, in-waiting to deliver when appropriate"*), so the text now EXISTS where it previously did not. `assertQuarantineHeld()` refuses to render it and `renderBundle` self-verifies through it — but that is ONE surface. An export, a PDF, a patient view, or a future portal that assembles a page another way would not run the bar. `bundle_sha256` records the held text as evidence; it does not police who reads it. The amended §1.1 says so plainly, in the trunks' own words: *"on this constraint, nobody is watching but you."* MITIGATED, not closed: the memo is mechanically unactionable (`assertMemoUnactionable`), so a surface that forgets the bar still cannot print a dose from the account — two independent things must fail, where before W2 one sufficed. The MODEL plane is separately and mechanically closed (`assertHoldNotInjected`).
  blocks: nothing today — the portal is the only surface that renders dose evidence
  safety_class: degrades_safe (the hold declares `released:false` + `patient_facing:false`; every gate keys on those)
  invariant_exposure: show-evidence §1.1 — "no dose displayed past a blocked firewall" is MECHANICAL on the portal and CONVENTIONAL everywhere else
  risk: Medium
  blocks_patient_facing: false
  build_action: Any NEW surface that renders `dose_evidence` MUST call `assertQuarantineHeld(html, bundle)` — and should self-verify inside its own render function, as `renderBundle` does, rather than relying on a caller to remember. Re-rate **High** the day a second rendering surface exists. Alternative worth weighing then: move the bar into a shared render seam so a surface cannot be built without it.
  gap_register_link: none (Medium)
  status: open
  last_scanned: 2026-07-15
```


```md
- id: opencds-ab-parity
  path: verification/executor-parity.js · test/contract-executor-parity.js · test/parity-opencds-gateway.js (env-gated)
  component_type: test
  state: PARTIAL
  evidence: **BUILT 2026-07-15 (FL-34 Phase D).** A/B parity between the two executors — the in-process `engine.js` (the SPECIFICATION) and the OpenCDS gateway (a second implementation). Live against a real container: **86/86** agree on composed status, per-check verdicts, findings and dose text; the dose was compared on 77 cases. **PARITY WAS ALREADY CLEAN when first measured** — the bugs were found in Phases B and C, by BUILDING (the route could not return PASS at all; OpenCDS rejected every hook; a KM collapsed N interaction findings into one). None would have been found by comparing outputs. So this is a REGRESSION NET, not a discovery, and it is worth saying so rather than dressing 86/86 up as a finding. **CATCHES A REAL REGRESSION, PROVEN:** rebuilding the container with C1's defect reintroduced (per-hit interaction flags collapsed to one) makes it report `warfarin · FLAGS — 1 only the engine reported`. It would have caught C1. The comparison rules are unit-tested WITHOUT a container (12 cases), so the live run is only the data: contract shape is not a divergence (the wire is deliberately narrower — `flag_id`/`renal_threshold`/`au_reference` and the PBS dose keys cannot ride), an unrequested check is the ASK not a defect (F-D2), a requested-but-unanswered one IS a defect, and the report never claims WHICH side is wrong — both executors read the same signed records, so it cannot know.
  blocks: nothing — it is a net, not a dependency
  safety_class: none (reads both executors; writes nothing, emits no dose, changes no verdict)
  invariant_exposure: none — the harness is read-only over two existing paths
  risk: Medium
  blocks_patient_facing: false
  build_action: **REMAINING:** it runs on a laptop against a local container and SKIPS GREEN in CI (the C4/smoke-llm precedent) — so a green CI run does NOT mean parity holds, it means nobody asked. Wire it into a job that actually has a gateway (A4/FL-12 staging), and re-rate the skip then. **Default is the FULL SWEEP (451 × 2 profiles × 8 checks); `--sample` opts into a reduced 43-drug run for iteration.** The plan (D-D-3) originally argued the other way — "451 × 8 = 3,608 HTTP calls; a harness too slow to run is a harness nobody runs" — which reasoned about REQUEST COUNT and never measured WALL CLOCK. Measured: **full sweep ~15s, sample ~8s** (npm test, for scale, is ~33s). The sample saved TEN SECONDS and gave up ~90% of the data SHAPES: 7 of 81 renal rules, **2 of 49 dose-reduction-only** rules, 1 of 6 S8 drugs, 2 of 12 hepatic. That dose-reduction-only class is the exact shape that caused a real KM bug in B2 — 63 of the 104 signed renal records carry ONLY that field, and the first RenalDosingCheckKm read only the other one. A sample that thin on a shape that has already bitten us is not a cost saving. Flipped 2026-07-15 on the operator's ruling; full sweep runs 902/902. Coverage is printed on every run either way — a silent run reads as exhaustive whether it is or not.
  gap_register_link: R-22
  status: open
  last_scanned: 2026-07-15
```


```md
- id: resolve-ingredient-orphan
  path: mcp/servers/pharmacology/domain/ingredient-identity.js — resolveIngredient()
  component_type: other
  state: COMPLETE
  evidence: **Found 2026-07-15 while ruling on the identity map's sign-off.** `resolveIngredient()` is exported, contract-tested, and has **ZERO production callers** — grep across mcp/verification/scripts/portal/integration returns only `test/contract-ingredient-identity.js`. It is the E6 fix (resolve an AU spelling variant to the canonical dose), superseded twice: by **E7** (`also_known_as` aliases, resolved at the engine's own boundary) and by **E8** (the drug vocabulary, which now does the work and IS signed). It is also the ONLY consumer the map's `clinical_sign_off` flag gates — which is why signing the map unlocks nothing: the flag guards a function nobody calls. The engine's real use of the map, `doseIdentitySplit()`, reads it UNSIGNED by design to BLOCK fail-safe, and `pharm-vocabulary-build` reads `.records` without consulting the flag.
  blocks: nothing
  safety_class: none — it is unreachable; an unreachable resolver cannot resolve anything wrongly
  invariant_exposure: none today. If it were ever WIRED, it would become a SECOND canonicaliser beside the vocabulary's — which is the E6 defect the single upstream identity boundary (B0/B0b) exists to prevent. That is the argument for removing rather than wiring it.
  risk: Low
  blocks_patient_facing: false
  build_action: **REMOVED 2026-07-15 (operator ruling).** Deleted, not wired: wiring it would have created a SECOND canonicaliser beside the vocabulary's — the E6 defect itself, and the reason B0/B0b settle identity ONCE before either executor runs. An orphan that would be a hazard if reconnected is not a spare part. **ITS SAFETY TESTS WERE MIGRATED, NOT DELETED:** 'never fuzzy' (amlodipine/amiodarone, a typo resolving to nothing) is a property of whatever STEERS today — `canonicalise()` — so those assertions moved to `contract-drug-vocabulary` §6 and were proven to BITE there (a prefix-matching canonicalise reddens it) BEFORE the code was cut. Deleting a safety test along with the orphan it happened to hang off would have left the property holding by construction and asserted by nobody — the M1 shape. Also removed: `loadIdentityMap`'s `signed` field, read ONLY by the deleted gate (a field that LOOKS like it gates something is the `allergy_status`/F-C8 trap). The map's `clinical_sign_off` now gates NOTHING — pure provenance, exactly as its attestation states. `doseIdentitySplit` (the live fail-safe blocker), `loadIdentityMap`, `SAFETY_CAPABILITIES` and `identityCollisions` are untouched; engine behaviour verified identical. ORIGINAL: WIRE or REMOVE under an approved plan — a DEAD_END/ORPHAN is a defect, not a backlog item to defer (charter `<architecture_rules>`). **Recommend REMOVE:** the vocabulary supersedes it, and wiring it would create the second divergent canonicaliser B0 was built to eliminate. Removing it also removes the last thing the map's signed flag gates, which would make the flag purely a provenance record — which is all it is now anyway.
  attestation_cross_reference: **The SIGNED attestation on `ingredient-identity.json` names this function**, and it was removed hours after that attestation was sealed. Recorded here rather than re-attested, because the record is not wrong: it is dated 2026-07-15 and describes the state AT SIGNING, where `resolveIngredient` existed with zero callers. Its CONCLUSION is unaffected and in fact strengthened — the flag gated one dead function then; it gates nothing at all now, so "WHAT THIS UNLOCKS: nothing" is more true, not less. Re-attesting would mean asking a clinician to re-sign for a code refactor, which is worse than a dated record: it would make his signature a function of our internals. **This register entry is the trail**: a reader who greps `resolveIngredient` after finding it in the attestation lands here and learns why it is gone. Sequencing note for next time — signing an artifact and then removing code the attestation cites, in the same session, is avoidable; remove first, then sign.
  side_effects_found: **Removing it exposed that `doseIdentitySplit` — the LIVE guard that stays — was asserted by NOBODY.** Disabling it reddened nothing: it fires 0 times across all 451 dose ingredients, because E7 fixed the root and no split EXISTS to detect. Live, correct, unexercised — the M1 shape, in the code the removal was careful to keep. Closed in the same pass with a FIXTURE that makes it fire (a dose under one spelling, a safety capability under its twin), proven to bite (disabling the guard now reddens), plus the negative cases: two names holding the same data are not split, a cosmetic capability under a sibling is not a safety split, and a sibling with no dose is not gated (over-triage).
  gap_register_link: none (Low)
  status: resolved
  last_scanned: 2026-07-15
```

## MEDIUM

```md
- id: case-taxonomy-unbuilt
  path: data/taxonomy/case-taxonomy.json + .schema.json (NEW) · data/schemas/00_case_envelope.schema.json (specialty_tags $ref, category_tags) · scripts/ingest-case-bundles.mjs · test/contract-case-taxonomy.js
  component_type: dataset
  state: UNBUILT
  evidence: **OPENED 2026-07-16 (Phase 0 scan, Case Corpus v2).** There is no canonical, versioned taxonomy: `case_metadata.specialty_tags` carries a raw JSON-Schema `enum` of 19 codes described in prose inside the schema's own `description` field ("Code list: CARD=cardiology, RESP=respirator…"), so every taxonomy change is a schema bump and no consumer can resolve a code to a display name or an axis. The operator's corpus is two tranches with INCOMPATIBLE taxonomies — tranche 1 = 30 MIXED-AXIS categories (Cardiovascular=specialty, Geriatric & Frailty=cohort, Undifferentiated Subclinical Clusters=presentation, DEI=equity), tranche 2 = 60 CLEAN specialties (Electrophysiology, Maternal-Foetal Medicine, Interventional Radiology). **Two tranches, two shapes, and a third plausible — which is the whole argument for a versioned dataset over an id or a schema enum.** Note the corpus ALREADY organises by tranche-1 category: the 303 ingested cases are 5 of the 30 (AMS/CVD/CIA/CFE/DST, named in `case-set-underpopulated`'s batch history) — the taxonomy is the de-facto batch structure, just unwritten.
  blocks: tranche-1 expansion (~25 categories remaining, ~1150 notes); multi-axis coverage reporting; FL-40 Phase 3 (M3 long-list cases need selection criteria a taxonomy can express)
  safety_class: none
  invariant_exposure: none — classification metadata; the scoring-store firewall and every sealed-node schema are untouched
  risk: Medium
  blocks_patient_facing: false
  build_action: BUILD — a versioned dataset (`taxonomy_version` + `records_checksum`, the `<engineering_standards>` shape) carrying `specialty[]` (60, with the existing 19 mapped), `category_tags[]` (30, each with an `axis` field so mixed axes coexist honestly), `difficulty_tier[]` (mapped to the EXISTING 7-value enum, not replaced). Schemas `$ref` it; ingest validates against it. **REGRESSION BAR: all 303 existing cases must validate unchanged** — a failure means the mapping is wrong, not the case. **The case_id is NOT opened** (operator decision 2026-07-16): rewriting ids would rewrite every node file, break every sha256, and leave 303 CLINICIAN ATTESTATIONS no longer covering the bytes they signed — a trust-chain operation, not a volume one.
  gap_register_link: none (Medium)
  status: open
  last_scanned: 2026-07-16
```

```md
- id: case-corpus-field-population-thin
  path: data/cases/*/12_management_plan_node.json (850 medication entries across 303 cases)
  component_type: dataset
  state: PARTIAL
  evidence: **OPENED 2026-07-16 — MEASURED, not inferred.** The node-12 `medications[]` schema was designed for exactly the pharmacology-rich resource the corpus is meant to be, and is then inhabited at ~5%. Population across all 850 medication entries: `contraindications_in_this_case` 303 (35%) · `dose_route_frequency` 269 (31%) · `schedule` 40 (4%) · **`amt_snomed_code` 11 (1%)** · **`interactions_to_check` 2 (0.2%)** · **`deprescribing_note` 4 (0.5%)** · **`pbs_item_code` 0 (0%)**. The one well-inhabited part is the most clinically valuable: **194 `necessity: not_indicated_here` entries** — explicit errors of commission, which is where an eval set's teeth are. **The schema is not the constraint; the first transformation run was quota-driven** (operator, 2026-07-16: the initial run "was to meet an immediate need to reach the minimum case quota", with de-anchoring and telehealth reprojection applied retrospectively). Protocol v2 targets these columns as the deliverable.
  blocks: the eval set's ability to test pharmacology/management depth; FL-40's clinical-quality dimension has little coded management to score against
  safety_class: none
  invariant_exposure: none — under-population is silence, not fabrication; an absent field is never a claim
  risk: Medium
  blocks_patient_facing: false
  build_action: PROTOCOL v2 — selection criteria (polypharmacy / multi-morbidity / long differential, the M3 shape) + field-population requirements aimed at the 1%/0% columns + multi-axis tagging. Then re-measure: this record's percentages ARE the acceptance test. Note the kit is DERIVED (`node scripts/build-case-transformation-kit.mjs`) — rebuilding it is free; the expensive input last time was intent, not tooling.
  gap_register_link: none (Medium)
  status: open
  last_scanned: 2026-07-16
```

```md
- id: omnibus-descent-underspecified
  path: data/digital_tablet_omnibus.json (Part C: CarePlan, Goal, RiskAssessment, + new Communication)
  component_type: dataset
  state: PARTIAL
  evidence: **OPENED + PART-CLOSED 2026-07-16 (Case Corpus v2 Phase 2b).** MEASURED asymmetry: the digital tablet was richly specified on the ASCENT (Observation 522 leaf fields, MedicationRequest 91) and thin on the DESCENT (CarePlan 26, ClinicalImpression 22) — one ascent resource carried more than the entire care-planning suite. The map was adorned to the summit and blank on the way down. v1.1 adds the four functional descent structures the notes carry, each `_fhir_tier`-tagged: Communication (safety-net advice, Tier 2), CarePlan.safety_netting_escalation (the ordered rung ladder self-care→ED, Tier 2), RiskAssessment.prognostic_factors (resolution vs complication, Tier 1), CarePlan.behaviour_change_activities (Tier 1). `contract-omnibus-descent` (13 bars) pins them present, tiered, additive, and free of fabricated bindings; the kit was rebuilt (derived). Additive: every v1.0 ascent resource survives; nothing validates cases against the omnibus, and node field-maps still resolve.
  blocks: the eval's ability to score the descent (management/safety-netting); a case as a full clinical RECORD, not just an intake
  safety_class: none
  invariant_exposure: none — additive vocabulary; SNOMED codes appear only in labelled *_examples maps (candidates, receipt-gated), never asserted as this-case truth
  risk: Medium
  blocks_patient_facing: false
  build_action: **PART DONE** — the four structures exist. REMAINING (protocol v2 / 2d): make a transformer REACH FOR them, so the descent is populated in new cases, not just representable. The population %s (`case-corpus-field-population-thin`) are the acceptance test.
  gap_register_link: none (Medium)
  status: in-progress
  last_scanned: 2026-07-16
```

```md
- id: case-qc-harness-unbuilt
  path: scripts/case-qc.mjs (NEW) · test/contract-case-qc.js (NEW)
  component_type: test
  state: COMPLETE
  evidence: **OPENED + BUILT + FIRST-RUN 2026-07-16 (Phase 2e).** `scripts/case-qc.mjs` (`npm run cases:qc`) reads every node-12 medication and checks it against the SAME signed datastore PharmCheck reads (the `SyntheticSelfDevelopedSource`, in-process — same knowledge, no network needed for a corpus QC), FLAGS disagreements to a worksheet, resolves nothing. Pure check functions (`qcMedication`/`qcCase`, no I/O) + a single writer that targets `eval/pharmacology/qc/` only. Imports `derivedFieldNames` from `verification/case-warrant.js` (one source). **FIRST RUN over the 303 (850 medication entries): 753 findings, classified** — `class_not_specific` 291 (a case named a drug CLASS not an agent), `unresolved_drug` 357 (absent from the DEV-partial datastore: real coverage gaps + non-drugs in drug_name like "oral fluids"), `drug_name_not_normalised` 104 (formulation/prose in drug_name — the schema wants the AMH ingredient; protocol v2 tightens this), `schedule_mismatch` 1 (a derived-field disagreement). The signal is the SHAPE, not the total (DEV datastore is deliberately partial — ~261 scheduling, ~872 interactions). This IS the flow-backwards value: it tells the operator what the datastore needs (coverage) and what protocol v2 should tighten (drug_name = ingredient). Both exist; they have now met.
  operator_ruling_2026_07_16: **"VALIDATE, NEVER AUTHOR."** The harness FLAGS disagreements; it never fills a field. The reason is the eval's whole validity: if node 12's dose came from PharmCheck and the AI Doctor's dose comes from PharmCheck reading the same signed datastore, then scoring "did it recommend the right dose" measures PLUMBING, not correctness — the system marking its own homework, and the FL-40 clinical gate would be decorative. Shared VOCABULARY (SNOMED/AMT/Ontoserver) is fine — a dictionary is not an answer. Shared ANSWERS are fatal. Corollary recorded: the answer key's provenance is the SOAP note's clinician, independent of our knowledge base.
  blocks: corpus quality assurance at volume; the backward quality signal into the pharmacology datastore
  safety_class: degrades_safe (read-only by construction; a disagreement is a report, never a mutation)
  invariant_exposure: **scoring-store firewall — REINFORCED, not threatened.** The harness reads node 12 (a sealed node) in a process with no trunk and no write path to a case; the contract test proves it cannot write to `data/cases/`. This is the same two-process discipline FL-40's judge will need.
  risk: Medium
  blocks_patient_facing: false
  build_action: **DONE.** `contract-case-qc` (in `npm test`) proves the load-bearing safety property — the harness CANNOT write to `data/cases/` (structural: no writeFileSync targets it; a full run leaves every sampled case byte-identical) — plus: it flags a contradicted schedule, it reports-never-resolves (input unmutated), and normalisation recovers the named ingredient without ever swapping in a different drug (a bug where "1%" survived was caught by the test and fixed). REMAINING (not this item): the 753 findings are a worksheet for CLINICIAN ruling (case error vs datastore gap vs clinical nuance) and feed two other items — protocol v2 drug_name tightening (`case-corpus-field-population-thin`) and datastore coverage. The harness itself is complete.
  gap_register_link: none (Medium)
  status: resolved
  last_scanned: 2026-07-16
```

```md
- id: deploy-user-holds-worm-write
  path: (AWS IAM, not repo code) user `heydoc-deploy-cli` ← policy `HeydocWormAudit` (s3:PutObject, s3:PutObjectRetention) on bucket `heydoc-medicolegal-audit` · exercised by test/smoke-worm-live.js
  component_type: other (access control / deploy posture)
  state: PARTIAL
  evidence: **DELIBERATE STAGING-ONLY CHOICE, logged 2026-07-16 so it resurfaces at the production gate rather than being rediscovered by an auditor.** FL-11's live validation needed a real WORM write from the operator's machine, so `HeydocWormAudit` (the same policy the running app's `heydoc-staging-instance-role` carries) was attached to the deploy user `heydoc-deploy-cli`. It remains attached: `test/smoke-worm-live.js` is a designed, repeatable test that must be runnable after any adapter change, and it writes. **Blast radius, measured not assumed:** Object Lock COMPLIANCE means a holder of this credential **cannot rewrite or delete history** — verified by direct observation this pass (`get-object-retention` on the first ledger object: Mode COMPLIANCE, RetainUntilDate 2033-07-16; bucket ObjectLockEnabled: Enabled; Versioning: Enabled). The worst case is APPENDING a bogus object, which breaks the hash chain and is reported LOUDLY by `npm run verify:worm` (`contract-worm-integrity` proves a bucket edit → BROKEN with the seq). Integrity is preserved by the store's design, not by trusting the credential. Read-only diagnostics were deliberately split OUT rather than folded in: `HeydocWormDiagnostics` (GetObjectRetention/GetObjectVersion/GetBucketObjectLockConfiguration/GetBucketVersioning/ListBucketVersions) is attached to `heydoc-deploy-cli` ONLY — widening the shared `HeydocWormAudit` would have silently granted the RUNNING APP retention-read permissions it has no use for.
  blocks: nothing today — this is a posture item, not a defect
  safety_class: none (integrity is enforced by Object Lock + the hash chain, not by this credential's scope)
  invariant_exposure: auditability (trust boundary 5) — not breached; the question is provenance-of-trust, not tamper-resistance. "Who COULD have appended to the medicolegal ledger" is a question a TGA/ISO 27001 auditor may reasonably ask of the production trail, and "the deploy user could" is a worse answer than it needs to be.
  risk: Medium
  blocks_patient_facing: false
  build_action: **DECIDE AT THE PRODUCTION GATE (surface, don't decide — charter `<regulatory_posture>`).** Options as understood today: (a) detach `HeydocWormAudit` from `heydoc-deploy-cli` and re-attach only for the minutes a live smoke needs it (tighter provenance, more friction, risks the smoke not being run — the M1 shape); (b) keep the staging grant but ensure the PRODUCTION bucket's write path is reachable only by the instance role, with the live smoke run against staging only; (c) keep as-is and document the reasoning in the audit narrative. **Recommendation: (b)** — it preserves the repeatable live test where it belongs (staging) and gives the production trail the cleanest provenance answer. Not decided here; the operator owns it, and the four patient-facing release blockers gate it regardless.
  gap_register_link: R-39
  status: open (deliberate for staging; production posture undecided)
  last_scanned: 2026-07-16
```

```md
- id: pregnancy-hepatic-check-unwired
  path: mcp/servers/pharmacology/engine.js, mcp/servers/pharmacology/sources/pharm-data-source.js, mcp/servers/pharmacology/data/{pregnancy-risk,hepatic}.json, test/contract-pharm-pregnancy-hepatic.js
  component_type: mcp-server
  state: COMPLETE
  evidence: RESOLVED 2026-07-14 (FL-05 / PR #69, main @ 28da653). The frozen pharm-check RESERVED pregnancy_check/hepatic_check + their flag types, and the pregnancy-risk (18 TGA-category) + hepatic (13 Child-Pugh) datasets were clinician-signed (KL), but the engine never read them — so both safety checks silently did not run. FL-05 wires them: engine logic only, NO frozen change (enum slots already existed). pregnancy_check: X→HARD_FAIL, D→WARN, A/B/C→PASS; operator-ruled fail-safe D-FL05-1 (known teratogen + unknown pregnancy status → NOT_RUN/BLOCKED_NO_PROOF, AGE-GATED to childbearing potential ~12–55/unknown so elderly are not over-triaged). hepatic_check: contraindicated→HARD_FAIL, caution→WARN, unknown→NOT_RUN. Seam accessors getPregnancyRisk/getHepatic in sources/pharm-data-source.js (LicensedFeedSource fails closed). test/contract-pharm-pregnancy-hepatic.js wired into npm test, run green. Frozen pharm-intent/pharm-check byte-unchanged (git diff edb2c7a..28da653 = 0).
  blocks: (resolved) — the two reference-only registers are no longer engine-isolated by design
  safety_class: degrades_safe
  invariant_exposure: no-autonomous-prescription + conservative-safety-netting (teratogen fail-safe) — enforced mechanically, contract-tested
  risk: Medium
  blocks_patient_facing: false
  build_action: RESOLVED — both checks engine-implemented + contract-tested. (Parts (2)/(3) of FL-05 — TGA pregnancy-DB bulk-sync, CAL verbatim — are SEPARATE items below, input-gated, not this record.)
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-14
```

```md
- id: opencds-cds-adapter-client
  path: mcp/servers/pharmacology/cds-adapter/{opencds-client.js,opencds-contract.js,index.js}, config/flags.js (AU_OSS_CDS state), test/contract-opencds-contract.js, test/contract-pharmacology-cds.js
  component_type: mcp-server
  state: COMPLETE
  evidence: BUILT 2026-07-14 (FL-34 Track A A1–A3b / PR #67, main @ b4a06a9). AU_OSS_CDS third PHARM_CDS state + fail-closed client for the cds-adapter slot when a validated OpenCDS gateway endpoint is present. Client speaks the locked A2 JSON wire contract (opencds-contract.js — 9 check_ids / 18 flag_types, lockstep-verified byte-equal to the frozen pharm-check enums by contract-opencds-contract.js). DEFENCE-IN-DEPTH fail-closed: malformed request never leaves; transport failure/non-200/timeout → BLOCKED_NO_PROOF; off-enum/malformed response → BLOCKED_NO_PROOF; KB-version mismatch → BLOCKED_NO_PROOF; hard rules RE-APPLIED locally (no dose unless composed verdict PASS/WARN); receipt mode stays mock until A4 staging validation (no mock-as-live). Selection + a live endpoint do NOT flip mode to live.
  blocks: FL-34 patient-facing arm of blocker #1 (with opencds-gateway-image/km-package/shim + A4 staging validation)
  safety_class: degrades_safe
  invariant_exposure: no-HARD_FAIL-override + no-autonomous-prescription + no-mock-as-live — all enforced fail-closed in the client
  risk: Medium
  blocks_patient_facing: false
  build_action: RESOLVED for the in-repo client. Patient-facing still requires the deployed gateway (opencds-gateway-image), the KB→KM package, the shim, and A4 staging validation — separate items below.
  gap_register_link: R-22
  status: resolved
  last_scanned: 2026-07-14
```

```md
- id: cds-firewall-fold
  path: verification/pipeline.js (monotone CDS fold), test/contract-cds-firewall-fold.js
  component_type: verifier
  state: COMPLETE
  evidence: BUILT 2026-07-14 (FL-34 Track A / PR #67). MONOTONE fold of the cds-adapter verdict into the Trunk 8.0 firewall: CDS can only ADD severity, never rescue. contract-cds-firewall-fold.js green across four cases: mock+EMPTY no-fold · live+EMPTY → E7 HARD_FAIL · provider fold · monotonicity. EMPTY→HARD_FAIL floor holds; SYNTHETIC_SELF_DEVELOPED still does NOT unlock the slot; AU_OSS_CDS requires a real endpoint AND staging validation before any content flows.
  blocks: (resolved) — the firewall composition seam for the CDS provider path
  safety_class: degrades_safe
  invariant_exposure: no-HARD_FAIL-override (fold is severity-monotone) — contract-tested
  risk: Medium
  blocks_patient_facing: false
  build_action: RESOLVED — monotone fold built + contract-tested.
  gap_register_link: R-22
  status: resolved
  last_scanned: 2026-07-14
```

```md
- id: opencds-gateway-image
  path: (sibling repo) kenleefreo/breath-ezy-cds-gateway — pinned-commits.env, build.sh (pinned 7-repo clone + TZ=America/Phoenix), Dockerfile (maven:3.9-eclipse-temurin-17 → tomcat:10-jre17), README.md
  component_type: other
  state: COMPLETE
  evidence: FL-34 Phase A DELIVERED + GATE CLOSED 2026-07-14. Pinned reproducible image builds from a CLEAN CHECKOUT and serves CDS Hooks. All 7 OpenCDS repos pinned to exact SHAs in pinned-commits.env (SNAPSHOT-only upstream, no tags — SHA is the only stable pin; all 7 verified resolvable HTTP 200 on Bitbucket). Two build quirks found + handled: (a) TZ — opencds-hooks-model-r4's CdsRequestSpec hardcodes a US-Mountain-rendered date and reddens on any other host TZ; build pins TZ=America/Phoenix (permanent MST, no DST) in both build.sh and the Dockerfile build stage (a container otherwise defaults to UTC). (b) ABSOLUTE BUILD PATHS — the Maven-filtered dot-opencds/opencds-hooks.properties bakes knowledge-repository.path + config.security as /gateway/src/.../target/classes/..., which does not exist in the runtime stage → context startup failed (SEVERE, SIMPLE_FILE k-repo not found); fixed via CATALINA_OPTS -D overrides onto the exploded WAR classpath (beans.xml sets system-properties-mode="OVERRIDE" — the app's intended mechanism), NOT by carrying build paths into runtime. VERIFIED live this phase: docker build from clean checkout OK; container context starts with ZERO SEVERE/startup-failed lines; GET /opencds/r4/hooks/cds-services → HTTP 200 {"services":[example-knowledge-module-r4]}; POST /opencds/r4/hooks/cds-services/example-knowledge-module-r4 → HTTP 200 {"cards":[...]}. Endpoint shape confirmed + fed back to the client contract: path is /<context>/r4/hooks/cds-services and prefetch values are BARE FHIR resources (not {response,resource}-wrapped).
  blocks: FL-34 A4 staging validation (still needs the KM package + shim)
  safety_class: degrades_safe
  invariant_exposure: none — image carries the EXAMPLE knowledge module only, no Breath-Ezy clinical content; the cds-adapter EMPTY→HARD_FAIL floor is untouched (no endpoint wired → no content flows)
  risk: Medium
  blocks_patient_facing: false
  build_action: RESOLVED — pinned build + two-stage image built and gate-verified (build → deploy → discovery 200 → evaluation 200). NEXT: Phase B (FL-30 KB → KMs) replaces the example KM with Breath-Ezy's signed knowledge; Phase C adds the shim.
  gap_register_link: R-22
  status: resolved
  last_scanned: 2026-07-14
```

```md
- id: fl30-kb-km-package
  path: (sibling repo) breath-ezy-cds-gateway @ dd9bfd3 — tools/export-fl30-kb.mjs + kb/ (committed bundle, **km_set fl30-kb:v2**) + km/ (9 Java KMs, k-repo/knowledgeModules.xml)
  component_type: dataset
  state: COMPLETE
  evidence: FL-34 Phase B BUILT 2026-07-15 (B1–B4). **B1** — the export applies FOUR gates in order, and the ORDER is the safety property: (1) an EXPORTABLE_CAPABILITIES allowlist FIRST — only the 8 capabilities an engine.js accessor reads, excluded regardless of attestation state; (2) dataset clinical_sign_off, necessary but never sufficient; (3) records_checksum re-computed with breath-ezy's OWN checksumRecords (imported, never re-implemented) — drift ABORTS the export, because skipping would let a TAMPER look like a FILTER; (4) per-record review_status === approved. Bundle: 8 capabilities / 1776 signed+approved records / 17 capabilities excluded with a reason each. Real-artifact audit: all 9 file_sha256 match their bytes, ZERO foreign-label bytes, ZERO brand-name leakage, all 1776 records byte-identical to the signed source. **B2–B4** — 9 KMs (allergy, interaction, renal, nti, age, schedule_8, pregnancy, hepatic + the advisory dose candidate), each mirroring its engine.js block case-for-case; Fl30KnowledgeBase verifies file_sha256 BEFORE any check runs and fails closed permanently (every KM then reports NOT_RUN with the cause, never a default PASS). 63/63 JUnit against the REAL committed bundle, and TAMPER-PROVEN by exit code at every safety bar (foreign-label admission, abort→skip, rxcui_active forced true, the renal coalesce, checksum skip, NTI suppression, the D-FL05-1 age gate collapsed both ways, S8 lowering, unknown-age dosing, paediatric dosing, whole-record shipping, dose substitution). **COMPLETE 2026-07-15 (C4).** The KMs are CALLED and ANSWERING, proven by a committed, repeatable smoke against a real container — not an ad-hoc script. `test/smoke-opencds-gateway.js` (env-gated; skips green in CI): discovery lists 9, a clean case PASSes, the 4 once-dead checks fire, a stale km_set BLOCKS, the advisory dose is offered and DROPPED on HARD_FAIL, no dose for a child. Verified by regression: stripping `allergens` from the wire makes the smoke report BLOCKED_NO_PROOF — it catches F-C8 reappearing. STILL NOT DEPLOYED: no endpoint is wired, the cds-adapter slot stays EMPTY→HARD_FAIL until A4, and CI skips this smoke — a green CI run does NOT mean it passed, it means nobody asked. Formerly: nothing CALLED these — the Phase C shim (locked JSON ↔ CDS Hooks R4) is UNBUILT and the cds-adapter slot stays EMPTY→HARD_FAIL until an endpoint is wired AND staging-validated (A4). Built + tested, not wired.
  v2_2026_07_15: **RE-EXPORTED to `fl30-kb:v2` after the vocabulary sign-off.** v1 was exported while the drug vocabulary was UNSIGNED, so `identityCode()` returned null for every drug and the KB matched by NAME. KL signed it (V3), and the same export now yields **522 codes** (`rxcui_active: true`; 415 name-only — combination products and classes RxNorm models as multi-ingredient concepts, which carry real signed knowledge and are why a code-ONLY contract fails). That changes HOW A KM RESOLVES WHICH DRUG a request is about, i.e. a knowledge change, so it took a new km_set rather than riding along inside v1 — three pins moved deliberately (export `KM_SET`, Java `EXPECTED_KM_SET`, breath-ezy `DEFAULT_KM_SET`). **The transition fails safe BOTH ways, verified end-to-end against the real client:** v1 gateway → BLOCKED_NO_PROOF · v2 → PASS · v3 → BLOCKED_NO_PROOF. **A HAZARD THE BUMP ACTIVATED, found before shipping:** `drugKey`'s code branch was DEAD while the sidecar was empty, so its resolution order never mattered — the code won silently. Live, a code and a name that disagree would check the CODE's drug while the record, the card and the clinician's screen all say the name's. The pipeline sets both from ONE canonicalise call so they cannot disagree today — a property of the current caller, not of the wire contract, and an accident is not a safeguard. `drugKey` now REFUSES a conflict (→ NOT_RUN → BLOCKED_NO_PROOF; the dose KM emits nothing). Returning null would have been worse: no records found, every check a placid PASS. 68/68 JUnit (was 63) · 12/12 export fixtures · artifact audit: all 522 codes reach a real record, no name reachable by two codes, zero foreign-label bytes.
  blocks: FL-34 Phase C (shim) → Phase D (A/B parity) → A4 staging validation
  safety_class: degrades_safe
  invariant_exposure: no-autonomous-prescription — HELD, and now mechanically: the dose KM emits an ADVISORY dose_candidate only; the client drops it unless the composed verdict is PASS/WARN; the KM independently refuses on paediatric AND unknown age; a drug with no signed dose yields none (never a substitute); assertNoAdvisoryInDose() throws if an advisory dose ever reaches PharmCheck.dose_guidance. Australian-context — HELD structurally: the F5 allowlist excludes international-dose-guidance and is tested against a FORCED clinical_sign_off:true fixture, so the exclusion does not depend on the incidental fact that those 12 records are currently unsigned.
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING — Phase C shim (cards → check_verdicts; anything unmappable becomes NOT_RUN, never a drop and never a PASS), then Phase D A/B parity vs the in-process engine. CORRECTED 2026-07-15: (a) no route KM — engine.js implements route_appropriateness_check ZERO times (F4), so a route KM would have nothing to mirror, which would be OpenCDS INTRODUCING knowledge; the earlier "then hepatic/pregnancy/schedule_8/route" build_action was wrong. (b) The dose KM IS built — the earlier refusal (nothing to export / no consumer) is SUPERSEDED: 451 clinician-attested records exist (E1/E2) and the E3 evidence plane consumes a cds_dose_candidate. (c) Tranches landed as 5 / 3 / 1, not 5 / 4.
  gap_register_link: R-22
  status: resolved
  last_scanned: 2026-07-15
```

```md
- id: opencds-gateway-shim
  path: (sibling repo) breath-ezy-cds-gateway — shim/{map.mjs,server.mjs,map.test.mjs,auth.test.mjs} + Dockerfile + entrypoint.sh; breath-ezy: test/smoke-opencds-gateway.js (env-gated, C4), test/contract-cds-token.js
  component_type: other
  state: COMPLETE
  evidence: **BUILT 2026-07-15 (Phase C: C1-C3 + W1/W2).** The Node sidecar translating our locked JSON ↔ CDS Hooks R4, in ONE container with Tomcat (operator ruling 2026-07-14). `node:http` only — no dependency. Pure `map.mjs` (every fail-safe provable without a container) + a thin IO edge. PROVEN AGAINST A REAL CONTAINER with the real client: discovery lists 9 KMs, 0 SEVERE; warfarin+amiodarone+aspirin → interaction_check HARD_FAIL with TWO flags (one per finding, each naming both drugs); the gateway OFFERED a dose and the CLIENT dropped it on HARD_FAIL; paracetamol clean → **PASS**. 23/23 shim + 73/73 JUnit + 12/12 export fixtures; ten bars tamper-proven by exit code. **A4 STAGING VALIDATION PASSED 2026-07-16 — the two former REMAINING items are closed:** (a) the C4 smoke was committed into `npm test` (PR #77 lane) and has now been run against the DEPLOYED gateway; (b) the endpoint exists: App Runner service `breath-ezy-cds-gateway` (ap-southeast-2, port 8081 = shim, 2 vCPU/4 GB, image digest 791091b2…) — smoke OK live (warm AND cold-start) and **A/B parity 902/902** (451 ingredients × 2 profiles, all 8 checks; status, per-check verdicts, findings and dose text identical to the in-process engine, over the wire). **A4 field finding, closed in-pass:** a cold JVM's first evaluations exceed the shim's 5s default timeout → NOT_RUN → BLOCKED_NO_PROOF — the fail-safe HELD (nothing wrong was ever answered; availability suffered); fixed with `SHIM_TIMEOUT_MS=15000` on the service and re-proven against a stone-cold fresh instance. **Exposure control added (operator-approved 2026-07-16):** the shim now enforces an optional shared bearer token (`SHIM_TOKEN`, constant-time compare, `/healthz` never gated — `shim/auth.test.mjs` 3/3); the client sends it from `HEYDOC_PHARM_CDS_TOKEN` (`test/contract-cds-token.js` in `npm test`: opts token sent · env token threaded · absent token sends nothing · 401 is fail-closed transport). The token is exposure control for a public staging URL, never a safety boundary. Receipts stay `mode=mock` (the pipeline does not pass `validated`; FL-50 owns that flip).
  blocks: FL-34 A4 staging validation
  safety_class: degrades_safe
  invariant_exposure: none by design (a dumb mapper; the client re-validates fail-closed and re-applies every hard rule) — **with one exception the build FOUND and closed: F-C3.** The register's own prior `build_action` said the shim *"Echoes km_set"*, which would have made the client's KB-version cross-check TAUTOLOGICAL: it can never fail if the value is sourced from the request, so a gateway running stale v1 knowledge would answer PASS on a lie. Demonstrated against the real client before the shim existed. `km_set` is now read from the KMs' OWN CARDS; verified live — v1 gateway → BLOCKED_NO_PROOF, v2 → PASS, v3 → BLOCKED_NO_PROOF.
  risk: Medium
  blocks_patient_facing: false
  build_action: **RESOLVED 2026-07-16 — A4 passed against the deployed service** (smoke warm+cold OK, parity 902/902, cold-start finding closed with SHIM_TIMEOUT_MS=15000, bearer-token exposure control added and contract-tested both sides). Deploy config recorded in the gateway repo README Phase E. FL-34's remaining work is NOT this item: live PBS pull, AusDI 3b, and the FL-50 receipt flip live on their own records. *(Prior corrections retained: (1) NOT "echoes km_set" — F-C3; the shim reads the version from the cards. (2) The bundle is `fl30-kb:v2`.)*
  gap_register_link: R-22
  status: resolved
  last_scanned: 2026-07-16
```

```md
- id: au-provider-bahmni
  path: integration/record-sources/au-providers/au-providers.json (bahmni entry), integration/record-sources/au-providers/*, test/contract-au-provider-bahmni.js, .planning/TRACK-B-B1-RESEARCH.md
  component_type: other
  state: PARTIAL
  evidence: BUILT 2026-07-14 (FL-32 Track B B1/B2 / PR #68, main @ f3f8b55). B1 bake-off memo picked Bahmni (OpenMRS, native FHIR R4 via the FHIR2 module) as the OSS EHR peer for the wso2/fhir-broker surface. B2 registered it in au-providers.json as input_gated, placeholders-only, fail-closed authorize (contract-au-provider-bahmni green). REMAINING: B3 live connect — operator supplies a deployed Bahmni endpoint + SMART creds (+ confirms the exact FHIR2 module/config, flagged open in B1); then ENG wires fhir-broker/live-backend.js + Observation→parser in staging.
  blocks: FL-32 (blocker #3 other half — the parser's live lab source)
  safety_class: degrades_safe
  invariant_exposure: no-fabricated-operational-facts (fail-closed authorize; placeholders never present as live) — contract-tested
  risk: Medium
  blocks_patient_facing: false
  build_action: B3 — operator deploys a Bahmni endpoint + SMART creds; ENG connects live-backend.js + record-sources ingest; live Observation→parser green in staging on synthetic patients.
  gap_register_link: R-28
  status: open
  last_scanned: 2026-07-14
```

```md
- id: pregnancy-risk-bulk-sync-pending
  path: mcp/servers/pharmacology/data/pregnancy-risk.json, scripts/pharm-ingest.mjs (TGA cached-sync, pbs-style)
  component_type: dataset
  state: PARTIAL
  evidence: DEFERRED-open from the FL-30 expansion scan (PR #66, 2026-07-14). The 18 seeded TGA-category records are a confident safety-critical subset, clinician-signed (KL); the long tail should BULK-sync from the TGA Prescribing-Medicines-in-Pregnancy database via the pbs-style cached-sync pattern. New records land review_status:draft through scripts/pharm-ingest.mjs and need a KL worksheet pass before signing. INPUT-gated on TGA DB data access (operator/org).
  blocks: pregnancy_check coverage breadth (the check itself is wired + tested — see pregnancy-hepatic-check-unwired resolved)
  safety_class: degrades_safe
  invariant_exposure: no-autonomous-prescription (draft records inert until signed) — fail-closed ingest
  risk: Medium
  blocks_patient_facing: false
  build_action: Obtain TGA pregnancy-DB data access; bulk-sync the tail as review_status:draft; KL worksheet pass + sign; datasets stay -dev until regulatory (FL-50).
  gap_register_link: none
  status: open
  last_scanned: 2026-07-14
```

```md
- id: dose-evidence-apf-attestation-variant-deferred
  path: mcp/servers/pharmacology/ (dose_evidence direct-APF citation variant — schema-only, un-seeded)
  component_type: dataset
  state: UNBUILT
  evidence: DEFERRED-open from the FL-30 expansion scan (PR #66). A clinician-only direct-APF citation variant of dose_evidence that touches the dose invariant; schema-only, un-seeded, fail-closed against agents; NOT built. Deliberately withheld — the existing dose_evidence (259 PubMed-verified, retrieval-grounded, engine-isolated) is the built path; this variant would carry APF-attested dose facts and is out of scope until a clinician adopts it. **SUPERSEDED 2026-07-15 (FL dose-guidance C0): the deferral condition — "until a clinician adopts it" — IS NOW MET.** Clinician KL (MED0001857758) transcribed all 471 APF22 Section D common-dosage ranges from his own copy and confirmed personal authorship 2026-07-15, adopting the direct-APF dose path. The adopted implementation is DIFFERENT AND BETTER than this item envisaged: rather than bolting an APF dose variant onto dose_evidence (which is engine-ISOLATED by design and must stay a citation register — a dose there could never reach the engine anyway), C0 built the real `dose_guidance` capability with clinician_apf_attestation as one of exactly two origin channels, AHPRA-gated so an agent-authored dose is unrepresentable. This item's need is now carried in full by `dose-guidance-empty-no-au-source`; keeping it open would double-count the same work.
  blocks: nothing on the critical path (the built dose_evidence register is reference-only, engine-isolated)
  safety_class: degrades_safe
  invariant_exposure: no-autonomous-prescription (touches the dose invariant — kept UNBUILT/fail-closed until clinician-adopted; the adopting implementation carries a STRONGER bar than this item proposed — a mechanical AHPRA gate + a mandatory AMASS cross-check, not merely fail-closed-against-agents)
  risk: Medium
  blocks_patient_facing: false
  build_action: SUPERSEDED — do not build as a dose_evidence variant. dose_evidence stays engine-isolated and citation-only, unchanged. The clinician-attested APF dose path now lives in `dose-guidance-empty-no-au-source` (schema built at C0; Channel B authoring at C2). No separate work remains under this id.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-15
```

```md
- id: conflict-audit-trust-signal
  path: verification/conflict-audit.js, test/contract-conflict-audit.js, integration/harvest-manifest.json (#5), docs/grounding/integration-register.md, package.json
  component_type: verifier
  state: COMPLETE
  evidence: BUILT 2026-07-07 (FLOW_PLAN H6; D-1 owner ruling — keep trunk spine + verifier, lift the pattern, no new orchestrator). FIRST-PARTY CLEAN-ROOM implementation of the published parallel-expert conflict-audit methodology; #5 octochains' licence is pending so its code was not wrapped/vendored/forked/copied — or read (strictest clean-room; H3 #20 precedent); #5 recorded REFERENCE·methodology-only, target_module nulled. runConflictAudit(opinions,{question_ref?}) is pure + deterministic (zod .strict() input/output; sha256 input-derived audit_id, order-independent; duplicate expert_id THROWS — a non-independent panel is rejected, never part-audited; <2 opinions → INSUFFICIENT_PANEL/unassessable — a single expert is never presented as consensus) and surfaces per-topic agree/conflict/single_source with positions reported VERBATIM (never resolves, never synthesises a winner — resolution belongs to the clinician at the C9 gate); over-flag posture: any residual difference after trim/case/whitespace normalisation is a conflict. attachConflictAudit() is ADDITIVE-ONLY and NOT A GATE: pass/results[](=the five checks, same reference)/candidate_output_hash verbatim (cannot flip fail→pass OR pass→fail); missing_receipts append-only (one surfacing line per unresolved-conflict record — the H2 integrity-detectors channel, zero schema churn); structured record on the in-memory conflict_audit field (never passed to validateReport by the named-field builders); firewall_status/continuation_blocked neither read nor written — HARD_FAIL/BLOCKED_NO_PROOF override IMPOSSIBLE by construction, proven against real Trunk 8.0 runPipeline() runs (S8-no-PDMP HARD_FAIL + no-intent BLOCKED_NO_PROOF). verifier.js (C1 frozen), trunk-sequencer.js halt logic, and pipeline.js UNTOUCHED — verify() asserted bit-identical on fixture vectors with the audit in play, five check names pinned. Contract-tested (test/contract-conflict-audit.js, 29th suite in npm test + CI): surfacing, cannot-rescue, not-a-gate, append-only, no-override, verifier-unchanged, fail-safe panel semantics, determinism, composed report validates.
  blocks: nothing — additive trust mechanism; no existing execution path changes until a caller supplies opinions
  safety_class: none — additive; cannot loosen any gate or override a halt
  invariant_exposure: none weakened; evidence-verified-trust STRENGTHENED (disagreement between independent expert opinions becomes a surfaced, auditable, deterministic record); augmented-not-autonomous reinforced (conflict resolution is explicitly the human's, C9)
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE — see evidence. FUTURE (separately plan-gated, NOT H6): wire a real parallel-expert opinion producer (nothing in the tree emits parallel opinions today — trunks are single-purpose by design; current consumer = contract test, session-store precedent) and decide gate/halt semantics for a conflict_flagged signal (owner + clinical decision, C9/portal-adjacent).
  gap_register_link: none (COMPLETE — a strengthening, not a gap; integrity-detectors precedent)
  status: resolved
  last_scanned: 2026-07-07
```

```md
- id: case-factory-shaper
  path: case-factory/{to-casebundle.js,complete-scoring-nodes.js,generate-from-fixture.js,fixtures/*}, test/contract-case-factory.js, docs/case-authoring/CASEBUNDLE-SHAPING-CONTRACT.md
  component_type: other
  state: PARTIAL
  evidence: BUILT 2026-07-06 (FLOW_PLAN H4). The single new integration surface (CONTRACT §11): to-casebundle.js (shaper, Phase A) maps Synthea FHIR + a chatty-notes narrative onto 00/01/02 + a 10.primary_diagnosis.name SEED, FAIL-CLOSED on any diagnosis-name leak into injectable 01/02 text; complete-scoring-nodes.js (Phase B, two-phase per CONTRACT §5) authors schema-minimal DRAFT 10-13 FROM THE SEED (never copies a sealed node) → a contract-valid <CASE_ID>.casebundle.json that flows THROUGH the existing scripts/ingest-case-bundles.mjs (firewall + --reseq + honesty gate UNTOUCHED). Emits files[].path (CONTRACT §6 drift corrected — the tool's key, not `node`), all sha256 null, codes unverified_pending_terminology_receipt, synthetic:true, clinician_reviewed:false. Proven offline by test/contract-case-factory.js against a committed synthetic AU-Core fixture: ingest --dry-run 0 problems/0 leaks, AU Core conformant, firewall fail-closed, never writes data/cases/ directly, never reads 10-13. Demo case SPEC-CARD-06-00000 admitted (unreviewed) — raw complex band 20→21. PARTIAL: live volume generation is input-gated (synthea-generators-input-gated); the trusted distribution moves only after clinician attestation.
  blocks: nothing on the H4 path; a measurable volume distribution shift is input-gated on the Java generators + clinician attestation
  safety_class: degrades_safe (fail-closed firewall; synthetic-only; bundles routed only through ingest)
  invariant_exposure: scoring-store firewall (placeholder 10-13 from seed, never copied; shaper de-anchors patient voice) + synthetic-only + augmented-not-autonomous (clinician_reviewed:false) — all held
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — provide a Java runtime + built Synthea/synthea-au/chatty-notes distributions (HEYDOC_SYNTHEA_JAR, HEYDOC_CHATTY_NOTES_CMD) to generate at volume; then clinician authoring/attestation of the draft scoring nodes flips cases into the trusted eval set. Refresh vendored AU Core SDs to 0.3.0 if C22 is settled.
  gap_register_link: none (Medium, non-shippable, non-patient-facing — below promotion threshold)
  status: in-progress
  last_scanned: 2026-07-06
```

```md
- id: synthea-generators-input-gated
  path: case-factory/synthea/run-synthea.js, case-factory/synthea-au/run-synthea-au.js, case-factory/narratives/run-chatty-notes.js, integration/harvest-manifest.json (dir-synthea/fork-synthea-at/sib-chatty-notes)
  component_type: other
  state: PARTIAL
  evidence: WRAPPED 2026-07-06 (FLOW_PLAN H4). Three generators re-verified Apache-2.0 on-repo and pinned to HEAD SHAs (synthea 2b0a55ba, FHOOEAIST/synthea 4647221f, chatty-notes a767a579). Each is a thin OUT-OF-PROCESS CLI seam — NO Java vendored (H1 fhir-live precedent) — and FAIL-SAFE: with no Java runtime / distribution configured, generate()/generateAu()/narrate() return { available:false, reason:"input-gated …" } and NEVER fabricate a bundle or narrative. synthea-au gates output through the EXISTING fhir-broker AU Core conformance validator; auCoreTarget() flags the C22 divergence (0.3.0 target vs vendored 2.0.1-ci) rather than silently picking. No Java is installed in the current environment, so live generation cannot run here — it is input-gated, exactly like a live vendor connection.
  blocks: live synthetic-case generation at volume (feeds ARCH_PLAN M6 eval)
  safety_class: degrades_safe (fail-safe absence; synthetic-only; never presents fabricated output as generated)
  invariant_exposure: synthetic-only (SYNTHETIC input by construction; no real record); AU-context (AU Core conformance gate)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — provide a Java runtime + built distributions (set HEYDOC_SYNTHEA_JAR + HEYDOC_CHATTY_NOTES_CMD); the shaper/completion/ingest path downstream is already proven on fixtures.
  gap_register_link: none (Medium, non-shippable — below promotion threshold)
  status: in-progress
  last_scanned: 2026-07-06
```

```md
- id: knowledge-server-unbuilt
  path: mcp/servers/knowledge/index.js, mcp/servers/knowledge/data/*.json, test/contract-knowledge.js, verification/{pipeline,retrieval-mcp}.js
  component_type: mcp-server
  state: PARTIAL
  evidence: MOCK BUILT 2026-06-30 — knowledge MCP (kg_query/kg_provenance real over the 3 curated datasets; ContextGraph/PatientKnowledgeGraph return empty-not-fabricated; kg_upsert/kg_export SAFE_STUB 'unavailable'). Wired into retrieval (needs_structured_kg → kg_query) + contextInjection (structured_dataset evidence). Contract-tested; trunk:stub:all 9/9 stub + MCP. Also gives ContextGraph/PatientKnowledgeGraph a (mock, empty) producer. PARTIAL: live graph store (PostgreSQL) not built.
  blocks: (mock cleared) — live PostgreSQL graph store remains
  safety_class: degrades_safe (BLOCKED_NO_PROOF / empty graphs)
  invariant_exposure: none (fail-safe holds)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING — live PostgreSQL graph store + the graph write path (kg_upsert/export) when a graph producer exists.
  gap_register_link: gap-knowledge-datasets
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: knowledge-datasets-empty
  path: mcp/servers/knowledge/data/{benign-registry,axis-b-templates,redflags-bank}.json
  component_type: dataset
  state: COMPLETE
  evidence: POPULATED (DEV) 2026-06-30 — three versioned, checksummed datasets seeded; served via kg_query as structured_dataset evidence. Content is DEV/SYNTHETIC-ONLY (see lab-reference-ranges-provisional sibling: knowledge-datasets-provisional).
  blocks: (cleared for mock) — Trunks 5.0/7.0/9.0 now receive curated dev content
  safety_class: degrades_safe
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE for dev. See knowledge-datasets-provisional for the sign-off gate before live.
  gap_register_link: gap-knowledge-datasets
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: pharm-records-checksum-unverified
  path: mcp/servers/pharmacology/data/*.json (records_checksum) · scripts/pharm-{author,ingest,pbs-sync}.mjs (writers) · test/contract-pharm-datastore.js (the test that should verify it and does not)
  component_type: dataset
  state: COMPLETE
  evidence: Found 2026-07-15 (FL dose-guidance C0 scoped re-scan); **ROOT CAUSE PROVEN 2026-07-15 by forensic reconstruction — all 7 seals reproduced exactly, benign.** 7 of 21 sealed datasets did not match `checksumRecords(records)`: au-scheduling (261), clinical-uses (980), nti-register (53), pharmacodynamics (303), pharmacokinetics (303), precautions (1162), renal-rules (104).
    **ROOT CAUSE: the seal is computed at AUTHORING/INGEST time, when incoming records are FORCED to `review_status:"draft"` / `reviewed_by:null`. The clinician sign-off pass then sets `reviewed_by`/`review_status:"approved"` ON THE RECORDS THEMSELVES — mutating them — and NOTHING RE-SEALS. Any dataset that received a sign-off after its last authoring/ingest therefore carries a stale seal, permanently.** No dataset was ever tampered with; NONE of the 7 has ever had a valid seal in its entire git history, because the break happens inside the very commit that creates them.
    **PROVEN, not inferred.** Each seal was reproduced bit-exactly by reverting only the sign-off: (a) the 4 single-commit datasets (clinical-uses, pharmacodynamics, pharmacokinetics, precautions) match `checksumRecords(records with provenance reverted to draft)`; (b) the 3 multi-commit datasets (au-scheduling, nti-register, renal-rules — created at 3884f98, expanded at d4fb9a8) match `checksumRecords([original records still approved, ...records added at ingest still draft])`, exactly matching pharm-ingest.mjs's documented FORCES-draft behaviour.
    **THE CLINICAL CONTENT IS BIT-IDENTICAL TO WHAT WAS SEALED — verified for all 7 by stripping provenance and comparing.** The ONLY delta is `provenance.reviewed_by` + `provenance.review_status` — precisely the fields the clinician's sign-off is SUPPOSED to change, recorded in the signed worksheets at eval/pharmacology/signoff/. Not one clinical fact drifted.
    **The writers are NOT buggy** — pharm-author.mjs:154 and pharm-ingest.mjs:201 both seal `merged` and write `merged` with no mutation between. The defect is that the SIGN-OFF path mutates records outside either writer and never re-seals, and that **`records_checksum` is WRITE-ONLY: written in 3 places, VERIFIED IN NONE** (the only test referencing it, contract-pharm-pbs-sync.js:69, asserts merely that it is a string). `npm test` has always been green on all 7.
  blocks: FL dose-guidance C1/C2 — the plan's "provenance layer" asserts the stored seal to prove the datastore has not been edited since clinician sign-off, and that guarantee is currently FALSE for 7 datasets. An export built to that spec would (correctly) abort on all 7.
  safety_class: degrades_safe
  invariant_exposure: auditability / traceability (requirement→design→code→test→evidence). NOT a data-correctness finding — the records may be entirely sound and the seals merely stale after a legitimate edit. That is exactly the problem: **a stale seal and an unreviewed mutation are indistinguishable without investigation**, so the datastore cannot presently PROVE the signed records are the records the clinician signed. In a TGA-regulated SaMD that proof is the point of the seal.
  risk: High
  blocks_patient_facing: false
  build_action: **RESOLVED 2026-07-15 (three-step fix).** (1) The 7 stale seals re-sealed via the NEW `scripts/pharm-reseal.mjs`, each recording prior+new checksum and the forensic basis in `attestation.reseal_history[]` — a re-seal blesses the current records, so it is now a deliberate, --reason-required, self-documenting act rather than an automatic repair. No record re-reviewed or amended; the content was already proven bit-identical to the sealed bytes. All 21 seals verify. (2) **THE DURABLE FIX: `test/contract-pharm-datastore.js` now asserts `checksumRecords(records) === records_checksum` for every sealed dataset.** Proven to have teeth by a tamper test (mutate one record's provenance → EXIT=1; restore → EXIT=0). CI can never again go green on a broken seal. (3) The sign-off path's obligation to re-seal is documented in `eval/pharmacology/signoff/worksheet-signoff.md` AND enforced by (2) — a sign-off that skips the re-seal now reddens CI immediately instead of decaying silently. New `npm run pharm:seals` audits all seals.
  gap_register_link: R-46 (row exists; link backfilled 2026-07-15 — the field lag the fourth-pass verification flagged, closed)
  status: resolved
  last_scanned: 2026-07-15
```

```md
- id: knowledge-datasets-provisional
  path: mcp/servers/knowledge/data/*.json
  component_type: dataset
  state: PARTIAL
  evidence: OPENED 2026-06-30 — benign registry / Axis B templates / red-flag bank were DEV/SYNTHETIC-ONLY, not clinically authoritative. **FL-20 2026-07-13: CLINICAL sign-off OBTAINED (reviewer KL, in-session, recorded faithfully).** Each file now carries an `attestation` block (clinical_sign_off:true, regulatory_sign_off:false) + updated status: the clinician attests the records present (benign-if-all-absent criteria + SNOMED codes; Axis B must-not-miss differentials + discriminators; red-flag questions + T0–T5 tiers) as clinically valid for Trunk 7.0/5.0/9.0. Checksums UNCHANGED (computed over `records` only; the attestation block is top-level metadata). REMAINING before patient-facing: **regulatory (TGA) sign-off (FL-50/L13)** + **coverage expansion** beyond the current conditions + a live knowledge store (`knowledge-server-unbuilt`). Version stays dev-tagged until the full sign-off clears (a `-dev` → final bump would over-claim while regulatory is pending).
  blocks: patient-facing use of Trunk 5.0/7.0/9.0 curated content — now blocked on regulatory + coverage + live store, NOT clinical validity
  safety_class: degrades_safe (marked non-authoritative for patient use; mock/dev only)
  invariant_exposure: clinical-safety (clinical content clinically validated 2026-07-13; regulatory validation + live store still required before live)
  risk: High
  blocks_patient_facing: true
  build_action: REMAINING — regulatory (TGA) sign-off (FL-50); expand coverage; connect the live knowledge store; then finalise version + checksum. Clinical sign-off DONE (FL-20).
  gap_register_link: gap-knowledge-datasets
  status: open (clinical sign-off obtained FL-20; regulatory + coverage + live store remain)
  last_scanned: 2026-07-13
```

```md
- id: fhir-broker-unbuilt
  path: mcp/servers/fhir-broker/{index.js,mock-resources.json}, test/contract-fhir-broker.js, verification/{retrieval-mcp,pipeline}.js
  component_type: mcp-server
  state: PARTIAL
  evidence: MOCK BUILT 2026-06-30 — fhir_read/fhir_search return templated AU Core resources (incl. lab Observations); fhir_write SAFE_STUB. Wired: on the MCP path, Trunk 6.0 Observations flow through the investigation parser into sanitised lab_result facts (raw number never in the packet). Contract-tested. H1 2026-07-06: a LIVE backend adapter (see fhir-live-adapter) now sits behind the same fhir_read/fhir_search contract — external pinned wso2 process, taken only when configured + mode=live; mock remains default+rollback. PARTIAL: a real live FHIR/SMART-on-FHIR/EHR connection + creds + AU Core/AUCDI conformance validation (fhir-r4-aucdi-conformance-unbuilt) pending.
  blocks: (mock cleared) — live EHR connection + creds + conformance validation remain
  safety_class: degrades_safe
  invariant_exposure: no-raw-lab-numbers (raw fhir values pass through the parser)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — running wso2 process + live FHIR R4 base URL + SMART-on-FHIR/OAuth2 creds via secrets manager (see fhir-live-adapter, au-record-sources-ingest) + AU Core 0.3.0/AUCDI R3 conformance validator; patient consent for MHR.
  gap_register_link: gap-fhir-broker
  status: in-progress
  last_scanned: 2026-07-06
```

```md
- id: fhir-r4-aucdi-conformance-unbuilt
  path: mcp/servers/fhir-broker/{conformance.js,index.js,au-core/}, test/contract-fhir-conformance.js
  component_type: mcp-server
  state: PARTIAL
  evidence: STRUCTURAL VALIDATOR BUILT 2026-06-30 — fhir_validate tool validates a resource against VENDORED AU Core SD snapshots (au-core/, 2.0.1-ci-build, FHIR 4.0.1, checksummed manifest): profile/type match, required (min≥1), cardinality, fixed system; ValueSet MEMBERSHIP + full FHIRPath invariants reported not_evaluated (need live NCTS). Deterministic, offline, no new runtime dep. Contract-tested (5 SDs: Patient/Condition/MedicationRequest/AllergyIntolerance/DiagnosticResult). VERSION NOTE: vendored the CI build per operator decision — diverges from the AU Core 0.3.0 pin (an org/regulatory conformance-target decision).
  blocks: (structural cleared) — ValueSet-binding validation (aucdi-r3-valueset-binding, needs live NCTS) + full StructureDefinition/invariant validation remain
  safety_class: degrades_safe
  invariant_exposure: none directly (resource structure)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — live NCTS/Ontoserver ValueSet expansion for binding validation; full FHIRPath-invariant/slicing validation (heavier); confirm the AU Core version target (0.3.0 vs current) as an org decision; refresh the vendored snapshot deliberately.
  gap_register_link: none
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: au-core-sd-snapshot
  path: mcp/servers/fhir-broker/au-core/ (5 vendored StructureDefinitions + manifest.json)
  component_type: dataset
  state: COMPLETE
  evidence: VENDORED 2026-06-30 — pinned AU Core SD snapshot (2.0.1-ci-build) with a checksummed manifest (source URL, fetch date). CI build (not a stable release) — refresh deliberately.
  blocks: (was) offline conformance validation
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — vendored. Refresh on IG updates; reconcile version target (0.3.0 vs current) per org decision.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: aucdi-r3-valueset-binding-unbuilt
  path: AUCDI R3 required-binding tables (dataset) + verifier/terminology integration
  component_type: dataset
  state: UNBUILT
  evidence: OPENED 2026-06-30 (operator request) — no AUCDI R3 required-binding tables (data element → value set / code system); item 2's code↔receipt binding is value-set-agnostic.
  blocks: per-element value-set enforcement (a coded element drawn from the AUCDI-mandated value set)
  safety_class: degrades_safe
  invariant_exposure: no-fabricated-codes (enrichment — codes from the correct value set)
  risk: Medium
  blocks_patient_facing: false
  build_action: curate AUCDI R3 required-binding tables; extend the hardened verifier binding to check element value-set membership. DEPENDS ON item 2 (code↔receipt binding) + terminology-contract-incomplete.
  gap_register_link: none
  status: open
  last_scanned: 2026-06-30
```

```md
- id: messaging-geo-unbuilt
  path: mcp/servers/messaging-geo/index.js, test/contract-messaging-geo.js
  component_type: mcp-server
  state: PARTIAL
  evidence: MOCK BUILT 2026-06-30 — geo_locate/pharmacy_search return mock results; msg_send is a SAFE_STUB that NEVER sends (mock_not_sent, recipient redacted/not echoed), flagged not-patient-facing. Contract-tested. NOT wired into the trunk pipeline (patient-facing, gated by the Clinician Verification Portal). PARTIAL: live MSG/GEO/pharmacy-directory providers pending.
  blocks: (mock cleared) — live providers + patient-facing gate remain
  safety_class: degrades_safe (never sends; not patient-facing)
  invariant_exposure: human-in-the-loop (no patient-facing send path)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING — live MSG_PROVIDER/GEO_PROVIDER/pharmacy directory; wire only behind the Clinician Verification Portal.
  gap_register_link: gap-messaging-geo
  status: in-progress
  last_scanned: 2026-06-30
```

```md
- id: pipeline-edges-uncontracted
  path: verification/pipeline.js, verification/pipeline-schemas.js, verification/report-schema.js, test/contract-pipeline.js
  component_type: parser
  state: COMPLETE
  evidence: RESOLVED 2026-06-30 — all named pipeline edges now zod-gated: VerificationReport (report-schema.js), and GroundingPlan + ContextPacket + EvidenceNode + Receipt (pipeline-schemas.js, validateGroundingPlan/validateContextPacket enforced at the routing and context-injection boundaries). The stub contextInjection was reworked to emit a conformant packet (clean Receipts; citations moved to EvidenceNode supports). Covered by test/contract-pipeline.js; trunk:stub:all 9/9 stub + MCP.
  blocks: (cleared)
  safety_class: degrades_safe
  invariant_exposure: engineering_standards schema-first; trust boundary 1 — now enforced at all named edges
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE — see evidence. (When routing/retrieval logic is un-stubbed under pipeline-routing-retrieval-stub, the same validators continue to gate the real output.)
  gap_register_link: none
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: pipeline-routing-retrieval-stub
  path: verification/pipeline.js (routing, retrievalStub, contextInjection)
  component_type: parser
  state: PARTIAL
  evidence: routing() returns hardcoded needs; retrievalStub() returns fixed mock receipts; contextInjection() always facts:[]; constraints hardcoded.
  blocks: real routing decisions; real context assembly
  safety_class: degrades_safe (deterministic, never presents mock as live to a patient path)
  invariant_exposure: none (no patient path wired)
  risk: Medium
  blocks_patient_facing: false
  build_action: replace stubs with real routing + receipt-driven context assembly once servers/datasets exist; keep mock mode deterministic. Milestone link: ARCH_PLAN C10 — input-gated at live-connect under M11 (contracts/zod gates unchanged; stub remains the rollback).
  gap_register_link: none (Medium — below promotion threshold; stale pending-promotion tag corrected M0 2026-07-03)
  status: open
  last_scanned: 2026-07-03
```

```md
- id: clinical-eval-scorer
  path: verification/eval-scoring.js · verification/eval-harness.js · verification/patient-simulator.js · verification/eval-dimension-graders.js · verification/eval-judge.js · verification/llm-replay.js · verification/eval-positional.js · verification/eval-signoff.js · verification/eval-text-match.js · verification/eval-case-loader.js · verification/eval-report-schema.js · mcp/schemas/eval-run-report.schema.json · scripts/eval-run.mjs · .github/workflows/staging-eval.yml · docs/grounding/eval-rubric.md · test/contract-eval-{report,firewall,graders,judge,harness,positional,gate,signoff}.js
  component_type: verifier
  state: PARTIAL
  evidence: L10 BUILD 2026-07-11 built the deterministic scorer CORE (eval-scoring.js — classifyTier/scoreCase/computeCaseSetMetrics/enforceReleaseThresholds, under-triage 3×, the critical-under-triage alarm call site). **FL-40 Phases 1–7 (2026-07-21) built the live multi-turn harness around it, all schema-gated + contract-tested (7 new suites, all in `npm test`):** the EvalRunReport contract (schema + zod, fail-loud); a deterministic patient SIMULATOR (7 disclosure gates, reads 01/02 ONLY, hard-stops on sealed nodes); the three deterministic COVERAGE graders (history vs elicited 02, diagnostic vs sealed 10, management vs sealed 12 with a **negation-aware error-of-commission AUTO-FAIL**) + the triage wrapper; the ONE scoring LLM — a receipt-gated, 3-band-quantised communication JUDGE (weight 0.05); a prompt-hash RECORD/REPLAY layer (fail-closed on a miss); the ORCHESTRATOR driving each case multi-turn through the real pipeline with a replay-wrapped generator, across BOTH backends (claude+medgemma), emitting a schema-valid EvalRunReport per backend; the M3 positional gate (see positional-stability-unchecked); and the CLI + BLOCKING staging-eval CI. Rubric **CLINICIAN-SIGNED — `eval-rubric:v1.0`, reviewer KL, 2026-07-21** (§8; approved as-is incl. two knowingly-accepted v1.0 limitations). SCORING-STORE FIREWALL proven at the eval path's own boundary (contract-eval-firewall: sealed nodes never reach case_content/conversation/packet). NEW packet field `conversation[]` (additive/optional — see context-packet-conversation-field).
  blocks: FL-52 promotion (the eval gate must be blocking-green). **CLINICIAN SIGN-OFF ENFORCEMENT DONE 2026-07-21** (verification/eval-signoff.js + contract-eval-signoff.js): a `--mode live` run resolves clinician_signoff_ref from the SIGNED rubric doc and REFUSES fail-closed BEFORE any generation if the rubric is not signed for the cited version (placeholder/wrong-version/absent all refuse); the ref is stamped into every live report; replay/CI runs are not gated by it. REMAINING (operator/infra-gated, NOT engineering): (1) the AUTHORITATIVE live run to RECORD replay fixtures over the attested set for BOTH backends — the gate SKIPs green until fixtures are committed (armed-but-inert, MIRAGE idiom); (2) MedGemma reachability + creds in staging (Claude validated host-side 2026-07-12).
  safety_class: none (scorer-side node read; never a packet path)
  invariant_exposure: test_and_evaluation_gates (the release gate is now MECHANISED end-to-end + armed as blocking CI; an authoritative live run is mechanically bound to a clinician-signed rubric; bites the day fixtures are recorded)
  risk: High
  blocks_patient_facing: false
  build_action: REMAINING (operator/infra only — engineering drained) — run `eval-live-staging` (record fixtures, both backends) once MedGemma is reachable + creds are in the staging environment. Accepted-limitation follow-ups (non-blocking, no re-gate): §3.3 commission judge cross-check, §4 synonym table.
  gap_register_link: R-42
  status: open (scorer core + full live harness + graders + judge + replay + positional gate + CLI + blocking CI + live-run clinician-signoff enforcement built & tested; rubric v1.0 signed; authoritative live run + MedGemma input-gated — ENGINEERING DRAINED)
  last_scanned: 2026-07-21
```

```md
- id: context-packet-conversation-field
  path: mcp/schemas/context-packet.schema.json · verification/pipeline-schemas.js · verification/pipeline.js · integration/trunk-pipeline.js · test/contract-context-packet-conversation.js
  component_type: schema
  state: COMPLETE
  evidence: FL-40 Phase 5 (2026-07-21) added an OPTIONAL, bounded `conversation[]` to the ContextPacket so the trunk LLM can read the multi-turn transcript as CONTEXT. Additive: absent on every non-conversational run, so those packets are BYTE-IDENTICAL to before (the whole ~110-test suite stayed green). Input-context-NOT-proof — it relaxes no output rule; the frozen verifier + detectors still gate every output, so no code/dose/fact can be minted from conversational text (trust boundary 1). Firewall-clean by construction (assembled only from 01 presentation + 02 exchange dialogue + the AI's own turns — never sealed nodes). No new persistence path. Contract-tested (valid/invalid conversations + the byte-identical-when-absent guarantee).
  blocks: nothing
  safety_class: none
  invariant_exposure: none directly — but it WIDENS what the model consumes (conversational narrative). Flagged for regulatory traceability per <regulatory_posture> (a change to model input; enables the intended multi-turn telehealth use, does not expand scope). Surfaced, not decided.
  risk: Low
  blocks_patient_facing: false
  build_action: none — built, wired, tested. Operator/regulatory note only: record the model-input change in the intended-use documentation when the classification decision (FL-50) is made.
  gap_register_link: none (Low)
  status: resolved
  last_scanned: 2026-07-21
```

```md
- id: case-set-underpopulated
  path: data/cases/ (52 case directories; 51 manifest-conforming + reference)
  component_type: dataset
  state: PARTIAL
  evidence: M6 2026-07-03 — receipts + gate DONE; atypical top-up INGESTED (pending attestation); complex + attestation remain. (1) **All 336 candidate codes across the 101 manifest-bearing cases receipted** via `cases:verify-codes` (per-code receipt; status unverified_pending_terminology_receipt → **mock_verified_pending_live_ncts**; honest — mock echoes bind, live NCTS revalidates at M11/F5; mode:"mock" blocks them as proof in any live context; idempotent). (2) **Deterministic eval gate CI-BLOCKING** (`eval:cases`): ≥45 attested conforming (51 PASS); per-file sha256 integrity (re-asserts ingest schema+firewall without parsing sealed nodes); 00/01/02 schema-valid; all codes receipted; attestation required to count. (3) **ATYPICAL TOP-UP INGESTED 2026-07-03** — 50 new AMS (Autoimmune Mild Severity) casebundles ingested from operator-supplied source (`.../Autoimmune Mild Severity/.../AMS Ingest Cases`): 1 tier-02 + 37 tier-03 + 12 tier-04, new specialties RHEUM/HAEMAT, all firewall+schema clean (OK_DRY_RUN 50/50, 0 collisions). Distribution moved **88/12/0 → 45/55/0**; difficulty-tier coverage 2 → **4 tiers** (minimum 3 CLEARED); specialties 17 → 19. The 50 were ATTESTED 2026-07-04 (operator KL, written in-session; bulk_clinician_attestation in each manifest review block — node files + sha256 untouched). (4) **CVD (Cardiovascular) batch ingested 2026-07-04** — 49 of 50 operator-supplied CVD bundles (1 skipped: id collision, see `case-id-cross-series-collision`): brings the first COMPLEX-tier cases (5 × rare_condition, tier 05) and the 3rd diagnosis category (`zebra_rare`). 373 codes receipted (store total 709). Distribution now **68 straightforward / 77 atypical / 5 complex = 45/51/3**; **coverage 5 tiers · 3 diagnosis categories · 19 specialties — the 3-category + 3-tier minimums CLEARED**. The 49 CVD + the re-id'd AFib case (SPEC-CARD-01-00099) were ATTESTED 2026-07-04 (operator KL) → 151/151 attested. (5) **CIA (Common Infections & Afflictions) batch 2026-07-04** — 43 of 50 operator-supplied CIA bundles ingested (all straightforward/tier-01; 47 common + 3 important_not_to_miss categories); 190 codes receipted (store total **911**). 7 NOT ingested: **3 cross-series id collisions** (Burn/Laryngitis/Aphthous-Stomatitis vs existing AUC cases — see `case-id-cross-series-collision`) and **4 FIREWALL-REFUSED** (full diagnosis name leaked into AI-Doctor-readable text — see `cia-source-firewall-leaks`). Distribution **45/51/3 → 58/40/3** (194 cases; straightforward toward 60%, atypical over-weight pulled toward 30%; complex still 3%). The 43 CIA were ATTESTED 2026-07-04 (operator KL). (6) **4 firewall-remediated CIA bundles ingested 2026-07-04** (the previously-refused DERM-01-00036/EMG-01-00037/GI-01-00027/MH-01-00044 — operator removed the diagnosis name from injectable fields; see `cia-source-firewall-leaks` → resolved); 16 codes receipted (store total **927**). 198 cases now, and the 4 remediated CIA were ATTESTED 2026-07-04 (operator KL). (7) **3 re-id'd CIA collision cases ingested 2026-07-04** (the DERM/RESP/GI collisions → -00099 per bucket; see `case-id-cross-series-collision` — all 4 instances now resolved); 13 codes receipted (store total **940**); 201 cases. Distribution 59/39/3 → **59/38/2** (3 more straightforward dilute complex). The 3 re-id'd cases were ATTESTED 2026-07-04 (operator KL). (8) **CFE (Complex Fatigue Entities) batch, operator-RE-TIERED, ingested 2026-07-04** — after an initial recon showed the batch was under-tiered (genuinely complex entities labelled tier-03), the operator re-tiered at source; 49 well-formed bundles ingested (band split of the well-formed set: 36 atypical + 14 complex — rare_condition/05 + multi_morbidity_complex/06). 345 codes receipted (store total **1285**); 250 cases. **Distribution 59/38/2 → 48/45/8 — complex band jumped 2% → 8% (near the 10% target); coverage 5 → 6 difficulty tiers.** The 49 were ATTESTED 2026-07-05 (operator KL; scope guarded to the CFE ingest commit). The CFE collision case was re-id'd → SPEC-DERM-03-00099, ingested, and ATTESTED 2026-07-05 (operator KL). **eval:cases: attested conforming 251 (≥45), 0 unreviewed, PASS; distribution 47/45/8.** NOT ingested from the CFE batch (handed back to operator): 1 well-formed collision `SPEC-DERM-03-00041` (re-id'd → SPEC-DERM-03-00099, attested) and 13 operator-retired bundles (`cfe-malformed-bundles` → resolved, deleted). (10) **DST (Dermatology & Soft Tissue) batch, operator-re-tiered, ingested 2026-07-05** — 40 well-formed new bundles (20 straightforward + 19 atypical + 1 communication_barrier/complex); 233 codes receipted (store total **1524**); 291 cases. Distribution 47/45/8 → **48/45/7**; **coverage 6 → 7 difficulty tiers** (communication_barrier/07 added). The 40 pending_clinician_review. The **10 DERM collisions were then ingested 2026-07-05 via the new `--reseq` global-seq scheme** (→ SPEC-DERM-01-00100..00106 + SPEC-DERM-03-00107..00109; `case-id-cross-series-collision` resolved); 56 codes receipted (store total **1580**); **301 cases**; distribution 48/45/7 → **49/45/7**. Still handed back: **9 malformed stub bundles** (`dst-malformed-bundles`) + stray `_probe.tmp`. The 50 DST cases (40 direct + 10 reseq'd) were ATTESTED 2026-07-05 (operator KL) → **301/301 attested, 0 unreviewed**; the 9 DST malformed stubs + `_probe.tmp` deleted (`dst-malformed-bundles` resolved). **eval:cases: attested conforming 301 (≥45), 0 unreviewed, PASS; distribution 49/45/7.** Source `.txt` never entered the repo.
  blocks: (nothing — see the 2026-07-16 ruling below)
  safety_class: none
  invariant_exposure: test_and_evaluation_gates
  risk: Medium
  blocks_patient_facing: false
  operator_ruling_2026_07_16: **"60/30/10 was a LOOSE GUIDE, not a strict enforcement — and it has at times been applied very literally."** That is exactly what happened here, and this record is the evidence: its `blocks` line read "full 60/30/10 mix", its `build_action` called rebalancing the "SOLE REMAINING" work, and its very **id — `case-set-underpopulated` — is now a misnomer**: the set is 301/301 clinician-attested, gated, receipted, 7 difficulty tiers, 3 diagnosis categories, 19 specialties. A soft heuristic hardened into a defect classification and a backlog item (FL-22). The id STAYS (ids are names, not claims — the same rule this pass writes down for `case_id`); the claims around it are corrected. **The code was never wrong:** `eval-case-gate.mjs` has always treated the distribution as WARN-ONLY and reads `case_metadata.difficulty_tier`, never the id. The calcification was in the prose, the register, and the plan — which is where this class of error always lives.
  build_action: **RESOLVED 2026-07-16.** Everything this item required is DONE: 301/301 attested, gated, receipted; ≥45 minimum cleared 6× over; collisions auto-resolve (`--reseq`); malformed/stub findings resolved. The distribution "remainder" is not required work under the operator's ruling — it is a guide, and the set is within it. **Corpus EXPANSION (tranche 1's remaining ~25 categories, protocol v2, the taxonomy contract, the QC harness) is NEW work with its own records** (`case-taxonomy-unbuilt`, `case-corpus-field-population-thin`, `case-qc-harness-unbuilt`) — not a continuation of this one. FL-22 should be explicitly WAIVED rather than left ambiguous.
  gap_register_link: R-23
  status: resolved
  last_scanned: 2026-07-17
  retirement_2026_07_17: **v1 303 RETIRED — corpus de-duplicated to the v2 refresh.** The six source folders (AUC/AMS/CVD/CIA/CFE/DST = 301) are the SOAP notes the ORIGINAL v1 303 were built from; ingesting their v2 telehealth-reprojection alongside the v1 originals had taken `main` to **604 dirs (every scenario twice)** — 303 v1 (`v1.2.0`) + 301 v2 (`v2.0.0`). Operator ruling 2026-07-17: v2 supersedes v1. A read-only supersession map (`docs/grounding/v1-v2-supersession-map.md`) paired all **301 v1→v2** by shared source note (0 v2 orphans, every successor distinct); the 301 superseded v1 dirs were `git rm`'d. **Coverage loss: zero** — each scenario survives as its v2. **2 v1 orphans KEPT** (no v2 successor, = the 303−301 delta): `SPEC-CARD-04-00001` (NSTEMI reference/worked example, wired into README/CLAUDE/tests/eval-gate — retiring it would redden `npm test`) and `SPEC-CARD-06-00000` (hand-authored ADHF demo, no source note). **Corpus now 303 = 301 v2 attested + 2 kept v1, 0 duplication;** `npm test` 0 · verification Pass:true · eval:cases PASS (303 dirs, 301 attested, 2 unreviewed orphans informational, 0 failures). Firewall/hashing/schemas/servers/trunks untouched — data + docs only.
```

```md
- id: case-id-cross-series-collision
  path: data/cases/ SPEC id scheme (SPEC-{specialty}-{difficulty}-{seq}); scripts/ingest-case-bundles.mjs
  component_type: dataset
  state: COMPLETE
  evidence: FOUND 2026-07-04 — the SPEC case_id derives seq from the source case number within a series, but seq is NOT unique ACROSS source series: CVD "Atrial Fibrillation CDV-005.txt" and the already-ingested AUC "Acute Coronary Syndrome AUC-005.txt" both mapped to SPEC-CARD-01-00005. cases:ingest failed safe (COLLISION, no --force) and skipped the AFib case. INSTANCE RESOLVED 2026-07-04 (operator-authorised): the AFib bundle was re-id'd (blind literal id-string swap on a scratchpad COPY — source archive untouched, clinical content never read) to **SPEC-CARD-01-00099** (free globally; deliberately above the source-number-derived 1–51 range to mark it manually disambiguated) and ingested; 12 codes receipted; gate PASS. The existing SPEC-CARD-01-00005 (ACS) was never touched. SYSTEMIC gap remains: the id SCHEME is still not unique across series, so a future overlapping series would collide again.
  evidence_addendum: 2026-07-04 — the CIA batch produced 3 MORE cross-series collisions (all distinct cases, all skipped safely). ALL 3 NOW RESOLVED 2026-07-04 (operator-authorised, same re-id method → free per-specialty seq 00099): SPEC-DERM-01-00021 (CIA "Localised First-Degree Burn") → SPEC-DERM-01-00099; SPEC-RESP-01-00003 (CIA "Acute Viral Laryngitis") → SPEC-RESP-01-00099; SPEC-GI-01-00010 (CIA "Aphthous Stomatitis") → SPEC-GI-01-00099. Re-id on scratchpad copies (source archive + the 3 existing AUC cases verified untouched); dry-run 3/3 OK; ingested; 13 codes receipted; gate PASS. **All 4 known collision INSTANCES across 3 series are now resolved (AFib + these 3).** The 3 re-id'd cases are pending_clinician_review. Convention emerged: seq 00099 in a specialty bucket = a manually disambiguated re-id.
  evidence_addendum_2: 2026-07-04/05 — CFE batch produced a 5th collision, SPEC-DERM-03-00041 (CFE "Psoriasis Severe Plaque with Systemic Fatigue" vs AMS "Scalp Psoriasis (Mild)"); RESOLVED 2026-07-05 via re-id → SPEC-DERM-03-00099 (per-bucket convention; scratchpad copy; existing AMS case verified untouched; ingested; 6 codes receipted; gate PASS). SPEC-GI-03-00028 (CFE MCAS vs AMS Microscopic Colitis) was a 6th collision but the CFE bundle was operator-RETIRED and deleted 2026-07-05 (`cfe-malformed-bundles`), so that collision is moot. **All 5 well-formed collision INSTANCES across 4 series now resolved via re-id.** Systemic scheme weakness still recurs with every overlapping series.
  blocks: nothing now (all well-formed instances resolved); future overlapping series until the SCHEME is fixed
  safety_class: none (ingest fails safe — skips, never overwrites)
  invariant_exposure: auditability — case_id is the eval/medicolegal anchor; a non-unique scheme undermines it
  risk: Medium
  blocks_patient_facing: false
  evidence_addendum_3: 2026-07-05 — DST batch produced 10 more DERM collisions (15/5 series total). SYSTEMIC FIX IMPLEMENTED 2026-07-05 (operator decision: globally-assigned seq): `scripts/ingest-case-bundles.mjs` gained a `--reseq` flag — on collision it assigns the next free GLOBALLY-UNIQUE seq (above the max seq of any existing case dir, same specialty+difficulty), rewrites the case_id across all nodes, NEVER overwrites, and records the original→assigned mapping in `case_manifest.ingest.reseq` (audit trail). Contract-tested (test/contract-case-ingest.js: collision refused by default; --reseq assigns a new id + records the mapping + never overwrites the original). The 10 DST collisions ingested via --reseq → SPEC-DERM-01-00100..00106 + SPEC-DERM-03-00107..00109; the 3 pre-existing cases they collided with verified untouched. The 5 earlier manual re-ids (→ -00099) stand. **Cross-series collisions are now auto-resolved at ingest — the recurring finding is closed at the tooling level.**
  blocks: (cleared — --reseq resolves collisions automatically going forward)
  safety_class: degrades_safe (--reseq never overwrites; default still refuses; mapping recorded)
  invariant_exposure: auditability — PRESERVED: the original→assigned case_id mapping is recorded in the manifest, so the anchor's provenance is intact
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — global-seq scheme implemented (`--reseq`), tested, and used for the 10 DST collisions. Future overlapping batches: ingest with `--reseq`. No further systemic action required.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-05
```

```md
- id: dst-malformed-bundles
  path: source bundles (deleted 2026-07-05): 9 DST bundles with an empty `_bundle` (format+case_id null) + stray `_probe.tmp`
  component_type: dataset
  state: COMPLETE
  evidence: FOUND 2026-07-05 — 9 of 59 DST bundles REFUSED at ingest for empty `_bundle` (no format, no case_id) — incomplete stub files from the operator's re-tier workflow; nothing entered the repo (ingest fail-safe). RESOLVED 2026-07-05 (operator instruction): the 9 stub bundles + `_probe.tmp` DELETED with a guard that removed a file only after confirming its `_bundle.format` was NOT "breath-ezy-casebundle" (all 9 confirmed format=null; no well-formed bundle at risk); 50 well-formed bundles remain in the folder. Recurring pattern noted (CFE left 13 "-RETIRED"; DST left 9 empty stubs) — recommend a leftover-cleanup step in the re-tier workflow.
  blocks: (cleared — deleted per operator)
  safety_class: degrades_safe (ingest refused throughout; nothing entered the repo; deletion guarded)
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE — 9 stub bundles + `_probe.tmp` deleted. RECOMMENDATION (standing): add a leftover-cleanup step to the re-tier workflow so ingest folders don't accumulate stub/temp files.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-05
```

```md
- id: verifier-repo-invention-severity
  path: verification/verifier.js (per-check severity); docs/grounding/{trunk-constraints.md,gap-register.md}; .claude/server-status.md
  component_type: verifier
  state: COMPLETE
  evidence: RESOLVED 2026-07-05 (ARCH_PLAN C15/F11, milestone M7; operator-approved). Drift: Input A + code hard-failed `no_repo_invention` (pass=false) while the docs said "warning" AND the verifier emitted no `severity` the docs promised. Reconciled to surfaced-but-gating: verify() now tags EACH of the 5 checks with a `severity` (no_invented_codes/operations + hard_stop = critical; no_invented_guidelines = fail; no_repo_invention = warning) per the Risk Register. GATE UNCHANGED — pass = results.every(r=>r.passed); a failed check of any severity still rejects the output (contract-verifier asserts no_repo_invention is severity=warning AND passed=false AND drives pass=false). report-schema.js already permitted the field (no schema change). Docs reconciled: trunk-constraints.md severity legend added; gap-register §1b + R-11 and server-status.md tightened so "warning" reads as low-severity, not non-blocking.
  blocks: (cleared)
  safety_class: none — labels only; no gate/logic weakened (over-flag posture preserved)
  invariant_exposure: none — the five mechanical checks and the fail-safe gate are intact
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — see evidence.
  gap_register_link: R-11
  status: resolved
  last_scanned: 2026-07-05
```

```md
- id: cfe-malformed-bundles
  path: source bundles (deleted 2026-07-05): 13 CFE bundles tagged `_bundle.format:"breath-ezy-casebundle-RETIRED"` (SPEC-DERM-03-00027/00047, SPEC-GI-03-00019/00028/00036, SPEC-MSK-03-00015/00020/00049, SPEC-NEURO-03-00029/00039/00044/00046, SPEC-RHEUM-03-00050)
  component_type: dataset
  state: COMPLETE
  evidence: FOUND 2026-07-04 — 13 of 63 CFE bundles REFUSED at ingest for "missing/invalid _bundle.format". CORRECTION 2026-07-05 (earlier "corrupted during save" diagnosis was WRONG): the operator had DELIBERATELY retired these 13 by tagging `_bundle.format` = "breath-ezy-casebundle-RETIRED" — which is exactly why the ingest tool (expecting "breath-ezy-casebundle") refused them. The refusal was the retirement working as intended, not a defect. RESOLVED 2026-07-05 (operator instruction "RETIRE or DELETE"): the 13 source bundles were DELETED with a safety guard that removed a file only after confirming its format was NOT "breath-ezy-casebundle" (so no well-formed bundle could be deleted) — all 13 confirmed "-RETIRED" and removed; 50 well-formed bundles remain in the folder. NOTHING malformed was ever in the repo (ingest fail-safe). One of the 13 (SPEC-GI-03-00028, CFE MCAS) also collided with an AMS case — retired, so that collision is moot. Stray `__t.txt` left in place (harmless; tool globs only *.casebundle.json).
  blocks: (cleared — the 13 are retired + deleted by operator decision)
  safety_class: degrades_safe (ingest refused throughout; nothing malformed entered the repo; deletion guarded to non-well-formed only)
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE — 13 retired source bundles deleted per operator instruction. No repo artifact existed. If any are wanted back later, re-author fresh with a valid `_bundle.format`.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-05
```

```md
- id: cia-source-firewall-leaks
  path: data/cases/{SPEC-DERM-01-00036, SPEC-EMG-01-00037, SPEC-GI-01-00027, SPEC-MH-01-00044} (now ingested)
  component_type: dataset
  state: COMPLETE
  evidence: FOUND 2026-07-04 — 4 CIA source bundles REFUSED by the ingest firewall (full primary_diagnosis name in AI-Doctor-readable injectable text: "Pityriasis rosea", "Post-viral fatigue", "Uncomplicated external haemorrhoid", "Transient (adjustment) insomnia"). Firewall worked (fail-safe REFUSE; nothing leaked). RESOLVED 2026-07-04 — operator regenerated all 4 with a "Firewall remediation: primary diagnosis name removed from AI-Doctor-readable 00/02 fields (02 clinical_facts made observational); diagnosis retained only in sealed nodes 10-13" transform step; re-dry-run 4/4 OK_DRY_RUN (0 leaks); ingested; 16 codes receipted; eval:cases PASS. The 4 remain pending_clinician_review (attestation outstanding). NOTE: the operator attached the 4 full bundles (incl. sealed 10-13) into the agent context for the ingest task — handled as engineering-only material (digest-carve-out precedent), not reasoned-from and not routed to any trunk/packet.
  blocks: (cleared)
  safety_class: degrades_safe (firewall blocked the leak at ingest; remediated bundles pass cleanly)
  invariant_exposure: scoring-store firewall — held at the ingest boundary throughout; never breached
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE — remediated + ingested. Standing recommendation (not blocking): add a diagnosis-name leak pre-check to the authoring/kit step so leaks are caught before ingest, not only at it.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-04
```

```md
- id: reference-case-manifest-missing
  path: data/cases/SPEC-CARD-04-00001/case_manifest.json · scripts/retrofit-reference-manifest.mjs
  component_type: dataset
  state: COMPLETE
  evidence: RESOLVED 2026-07-13 (FL-03). `scripts/retrofit-reference-manifest.mjs` generated `case_manifest.json` for the pre-ingest reference case — SHA-256 of the exact on-disk bytes of all 7 nodes (firewall-safe: sealed 10_–13_ streamed through sha256 only, never parsed/routed), firewall_assertion, files[], empty codes_manifest (reference case excluded from the code-verification + attested sets — flagged), and a FAIL-SAFE review block: `clinician_reviewed: false` (manifest attestation WITHHELD pending an explicit operator attestation statement; the envelope's `provenance.clinician_reviewed:true` (KL, 2026-06-23) is recorded as a note, not treated as a manifest attestation — so the release-gate attested count is UNCHANGED at 301). The named exemption + `LEGACY_EXEMPT` set removed from `scripts/eval-case-gate.mjs` (a missing manifest is now a hard failure). `eval:cases` → **named exemptions: 0** (301 attested, 2 unreviewed incl. this ref case, PASS); `verify-case-codes` legacy-skipped: 0.
  blocks: nothing — resolved
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: DONE. To admit the reference case to the trusted set (301 → 302), an operator sets `clinician_reviewed:true` with an attestation statement (one-line change; the envelope already records the KL review).
  gap_register_link: none (Low)
  status: resolved
  last_scanned: 2026-07-13
```

```md
- id: context-graph-orphan
  path: mcp/schemas/context-graph.schema.json
  component_type: schema
  state: COMPLETE
  evidence: RECLASSIFIED 2026-06-30 — NOT a true DEAD_END. The schema is contracted across the spec: grounding-plan.needs_structured_kg + live_call_specs (graph_kind="ContextGraph"), evidence-node kg_node supports (ref = ContextGraph node_id), and the knowledge server's kg.query (mcp/README, mcp-server-map). No JS produces it yet only because its producer — the knowledge server — is UNBUILT (same status as pharm-intent/pharm-check vs the pharmacology server). Wired when knowledge-server-unbuilt is built.
  blocks: nothing (contracted; awaits knowledge server producer)
  safety_class: none
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: produced/consumed when the knowledge server is built (kg.query graph_kind=ContextGraph); tracked under knowledge-server-unbuilt. No standalone action.
  gap_register_link: gap-knowledge-datasets
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: patient-knowledge-graph-orphan
  path: mcp/schemas/patient-knowledge-graph.schema.json
  component_type: schema
  state: COMPLETE
  evidence: RECLASSIFIED 2026-06-30 — NOT a true DEAD_END. Contracted across the spec: grounding-plan ("patient-baseline" PatientKnowledgeGraph pull), evidence-node kg_node supports, knowledge server kg.query (graph_kind="PatientKnowledgeGraph"), data-buckets. Producer is the UNBUILT knowledge server (+ identity boundary). Same awaiting-producer status as the pharm-* schemas.
  blocks: nothing (contracted; awaits knowledge server + identity boundary)
  safety_class: none
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: produced/consumed when the knowledge server + identity boundary are built; tracked under knowledge-server-unbuilt. No standalone action.
  gap_register_link: gap-knowledge-datasets
  status: resolved
  last_scanned: 2026-06-30
```

```md
- id: omnibus-dataset-unversioned
  path: data/digital_tablet_omnibus.json
  component_type: dataset
  state: PARTIAL
  evidence: Omnibus scan 2026-07-11 — the Digital Tablet omnibus (118,863 bytes, FHIR R4 field vocabulary, v1.0 per _digitalTablet.version) is consumed by the case-authoring kit, terminology systems enum, and 4 schemas' fhir_path conventions, but carries NO dataset_version receipt discipline: no checksum manifest, no structured_dataset receipt shape, and no consumer records which omnibus version a fhir_path was authored against. Violates receipt discipline ("a dataset_version with checksums for structured datasets") the moment any live path consumes it.
  blocks: safe live-pipeline incorporation of the omnibus (fhir_path tagging, FreeText_Taxonomy tagging) — tags without a versioned dataset receipt are unprovable claims
  safety_class: none (currently authoring-side only)
  invariant_exposure: receipt discipline (engineering_standards) if consumed live untagged; none today
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE (OMNI-1, 2026-07-11) — verification/omnibus.js: pinned sha256 + omnibusDatasetReceipt() (structured_dataset, never presents as live), resolveOmnibusPath (proof-based), assertSpoilerSafePath (mechanical example_*/reasoning-root refusal); contract-tested (test/contract-omnibus.js, in npm test)
  gap_register_link: none (pending omnibus-incorporation plan approval)
  status: resolved
  last_scanned: 2026-07-11
```

```md
- id: fhir-path-hooks-unwired
  path: mcp/schemas/evidence-node.schema.json (fhir_path) · mcp/schemas/context-packet.schema.json (facts[].fhir_path) · verification/pipeline-schemas.js
  component_type: schema
  state: DEAD_END
  evidence: Omnibus scan 2026-07-11 — both schemas define an optional fhir_path field referencing omnibus dot-notation (contract text says it "enables the case builder and AI Doctor output scorer to cross-reference claims against the patient record"), but grep shows ZERO producers: nothing in integration/, verification/pipeline.js, or mcp/servers/ populates it, and 0 of 303 cases contain a fhir_path. Additionally no validator checks a fhir_path resolves into the omnibus — the field is convention, not contract. Spoiler hazard noted: omnibus example paths can carry diagnosis names (e.g. Condition.code.example_SNOMED.T2DM); an unvalidated fhir_path on an LLM-visible fact could leak a diagnosis label.
  blocks: scorer cross-referencing of AI Doctor output against the patient record; omnibus-anchored audit trail
  safety_class: none today (field unused); can_emit_fabrication-adjacent if populated without spoiler screening
  invariant_exposure: scoring-store firewall (indirect — a diagnosis-naming path on an injectable fact is a spoiler); none while unused
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE (OMNI-2 + OMNI-4, 2026-07-11) — factProvenance() in context-allowlist.js (audit-channel, fact_id-aligned, omnibus-proven) + pipeline.js result.fact_provenance (EvidenceNodes with fhir_path, packet byte-identical per operator ruling — contract-tested) + backfill: 303/303 cases now carry digital_tablet_field_map (scripts/backfill-field-maps.mjs, manifests re-hashed with attestation carried forward, eval:cases PASS)
  gap_register_link: none (pending omnibus-incorporation plan approval)
  status: resolved
  last_scanned: 2026-07-11
```

```md
- id: freetext-taxonomy-unconsumed
  path: data/digital_tablet_omnibus.json → schema.part_c…FreeText_Taxonomy + _digitalTablet.security.sensitive_field_tiers + SDOH_Observations.full_SDOH_field_map
  component_type: dataset
  state: ORPHAN
  evidence: Omnibus scan 2026-07-11 — the FreeText_Taxonomy (SOAP headings, HPC sub-tags, ROS/exam headings, negative-findings NLP targets, temporal tags, AU abbreviation library, mental-health/obstetric/paediatric tags), the sensitive_field_tiers security classification, and the SDOH field map have no consumer anywhere in the repo outside the omnibus itself and the case-authoring kit embedding. Internally consistent, referenced by nothing live.
  blocks: consult conversation tagging (intake metadata capture); machine-readable patient-data-minimisation classification
  safety_class: none
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE (OMNI-3, 2026-07-11) — verification/consult-tagger.js: deterministic FreeText_Taxonomy tagging (vocabulary read from the pinned omnibus) on audit-channel provenance nodes; sensitive_field_tiers wired: tier >=2 default-deny (withheld marker) on the new path, warn-only observability (sensitivityWarnings) on existing paths; contract-tested (test/contract-consult-tagger.js, in npm test). Warn-to-block promotion = later gated step
  gap_register_link: none (pending omnibus-incorporation plan approval)
  status: resolved
  last_scanned: 2026-07-11
```

```md
- id: history-granularity-blob-fact
  path: verification/context-allowlist.js (injectableFacts) · mcp/schemas/context-packet.schema.json (facts)
  component_type: sanitiser
  state: PARTIAL
  evidence: HIST scan 2026-07-11 — self-disclosed history (past_medical_history[], medications, allergies, family/social history) reached the packet as ONE serialised-JSON past_history fact: captured, not lost, but no per-item categories, no per-item provenance stamp, and no per-condition omnibus anchoring/tagging. The fact vocabulary (past_history/medication/allergy/family_history/social_history) already existed unexercised.
  blocks: standardised history-taking structure for Trunk 3.0; per-condition provenance/tags; the AUCDI encounter summary
  safety_class: none (coarse, not unsafe)
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE (HIST-1/2, 2026-07-11) — facts gained optional provenance + verified (additive schema + zod); history_as_reported now splits per item into correctly-categorised patient-voice facts, each stamped patient_reported/verified:false; unknown history sub-fields default-deny by name; factProvenance/consult-tags now per item. NEW mechanical bar: patient-provenance ≠ lab_result. NOTE: deliberately changes the LLM-visible packet (operator-approved). Contract-tested.
  gap_register_link: none (Medium — below promotion threshold)
  status: resolved
  last_scanned: 2026-07-11
```

```md
- id: patient-history-summary-unbuilt
  path: mcp/schemas/patient-history-summary.schema.json · verification/history-summary.js
  component_type: schema
  state: UNBUILT
  evidence: HIST scan 2026-07-11 — no AUCDI-aligned encounter summary artifact existed: nothing assembled the patient's self-disclosed history + offered vitals into a standardised, provenance-stamped, clinician-facing digest for the portal reviewer; disclosures reached the clinician only as raw packet facts in the evidence tree.
  blocks: the Clinician Verification Portal reviewer's standardised history view; the "(AU)-aligned Doctor Summary" capability
  safety_class: none
  invariant_exposure: none
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE (HIST-3, 2026-07-11) — schema + deterministic builder: sections per standardised history-taking sequence, every entry {as_stated verbatim, provenance, verified:false const, omnibus fhir_path, taxonomy_tags}, schema-const unverified disclaimer, pinned omnibus dataset receipt, summary_sha256 audit anchor; AU Core structural conformance recorded ADVISORY on condition/medication/allergy entries (vendored 2.0.1-ci snapshot). Clinician-facing only (never packet-injected — contract-tested), encounter-scoped, memory-only (persistence stays gated). Rides result.history_summary + evidence_tree.md.
  gap_register_link: none (Medium — below promotion threshold)
  status: resolved
  last_scanned: 2026-07-11
```

```md
- id: sequencer-default-off
  path: integration/trunk-sequencer.js
  component_type: other (orchestration flag)
  state: COMPLETE
  evidence: L4 BUILD 2026-07-11 — sequencer graduated to DEFAULT ON (HEYDOC_SEQUENCER unset ⇒ enabled); explicit "0"/"off"/"false" — or ANY unrecognised value, failing toward the known-good single-trunk status quo — is the rollback (all four contract-tested). NEW HALT RULE 5 (additive): a structured PPP-TTT STOP (verification.ppp_ttt.tier === "STOP") halts with the graded-triage reason, checked before rule 4 so the halt names the clinical grading — defence in depth on top of the escalate_now text and pass:false halts (closes PPP-TTT plan Step 2). The sequencer also passes through the L3 packet-only generation hook (generateCandidate; used only when no fixed output exists) and per-trunk triage inputs (triageByTrunk); rule-3 escalation detection now also scans in-pipeline generated text. Halt rules 1–4 re-proven unchanged.
  blocks: (cleared)
  safety_class: none
  invariant_exposure: none — every halt remains unconditional; no override path added
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE (L4). Real Trunk 1.0 routing content arrives with live generation tuning (L3 remainder / L11).
  gap_register_link: none (Medium)
  status: resolved
  last_scanned: 2026-07-11
```

```md
- id: ppp-ttt-ledger-wiring
  path: verification/run.js · integration/trunk-pipeline.js (writers) · verification/ppp-ttt/ledger.js
  component_type: verifier
  state: PARTIAL
  evidence: LIVE scan 2026-07-11 — the PPP-TTT parallel ledger is a contract-tested library capability; the report writers do not append it, so a flagged run's triage record is not yet durably recorded alongside recordRun().
  blocks: (cleared)
  safety_class: none
  invariant_exposure: observability_and_audit (traceability)
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE (L1, 2026-07-11) — both report writers (verification/run.js, integration/trunk-pipeline.js) append ledgerCoreFromRecord(result.abcde_record) alongside recordRun(); trunk-pipeline passes raisedFlags/patientAnswers/abcdeInput through; proven by test/contract-live-ops.js (graded run → entry appended, chain verifies).
  gap_register_link: none (Medium)
  status: resolved
  last_scanned: 2026-07-11
```

```md
- id: ppp-ttt-graded-triage
  path: verification/ppp-ttt/ (index, interrogate, discriminators, record, tablet-tags, ledger, 3 zod mirrors, abcde/a–e) · data/scope-registry.json (vendored v1.3.0 attested snapshot — CI-visible; operator source stays under gitignored Projects/) · mcp/schemas/ppp-ttt-{verdict,abcde-record,ledger-entry}.schema.json · verification/pipeline.js (+import +composeTriage block, additive) · test/contract-ppp-ttt{,-monotone,-ledger}.js
  component_type: verifier
  state: COMPLETE
  evidence: PPP-TTT scan + build 2026-07-11 (plan .planning/PPP-TTT-PLAN.md, Step 1 only) — before this, a raised safety concern was binary (flag → halt, or nothing). Built the graded STOP/CAUTION/GO verdict as a pure monotone-AND stage: composeTriage never rescues (pass = AND) and never downgrades (tier = ordinal max), proven by contract-ppp-ttt-monotone.js (fixture + 200-case fuzz + pipeline additivity: packet byte-identical, no-flags run unchanged). Fail-closed default-deny proven across 8 adversarial inputs. RETAIN core sha256-PINNED in CI (verifier.js / portal/verification-gate.js / audit-store.js). Parallel PHI-free hash-chained ledger with tamper test + cross-link join to the main ledger. ABCDE record digital_tablet_omnibus-tagged; LOINC sections proven from the pinned omnibus; no SNOMED minted (statically asserted). Nothing references patient_eligible or a sealed scoring node (statically asserted over the module tree).
  blocks: (cleared) — unlocks graded consult-continuation UX (Step 3, plan-gated, behind mock/portal gates) and the optional sequencer structured-tier halt rule (Step 2, only if HEYDOC_SEQUENCER graduates)
  safety_class: degrades_safe
  invariant_exposure: none — strengthens "when in doubt, escalate" mechanically; HARD_FAIL/escalate_now/portal gates untouched
  risk: Medium
  blocks_patient_facing: false
  build_action: DONE (Step 1). Open follow-ups, all plan-gated: Step 2 sequencer hook (ppp_ttt.tier === "STOP" halt rule) when HEYDOC_SEQUENCER graduates; Step 3 patient-facing E-PP surface behind releaseToPatient(); Step 4 clinician attestation of any future discriminator_status field; wiring ledger append into the report writers (run.js/trunk-pipeline.js) alongside recordRun.
  gap_register_link: none (Medium — below promotion threshold)
  status: resolved
  last_scanned: 2026-07-11
```

```md
- id: dose-plausibility-guard-unbuilt
  path: scripts/pharm-dose-crosscheck.mjs (C1, unbuilt) · mcp/servers/pharmacology/domain/model.js (DoseGuidanceSchema)
  component_type: other (authoring guard)
  state: COMPLETE
  evidence: Opened 2026-07-15 by the C0 amendment (operator ruling reversing D-DG-3). The original `cross_check` gate binned an AU dose whose FDA/EMA label differed. That gate was removed as wrong (it inverted the jurisdiction rule and conflated "different jurisdiction" with "wrong" — see the DoseGuidanceSchema header). BUT it was incidentally catching one real thing: a TRANSCRIPTION TYPO. A clinician entering "5000 mg" for "500 mg" would have been caught by the foreign-label comparison. Removing the gate removes that catch, and this item exists so that loss is TRACKED rather than silently accepted.
  blocks: nothing — dose-guidance C2 can proceed without it; this narrows a residual entry-error risk
  safety_class: degrades_safe
  invariant_exposure: none directly — but an order-of-magnitude dose entry error is the classic catastrophic med-error class, and Channel B is manual clinician transcription, which is exactly where such an error would enter
  risk: Medium
  blocks_patient_facing: false
  build_action: **RESOLVED 2026-07-15 (C1).** Built `mcp/servers/pharmacology/domain/dose-plausibility.js` — pure, offline, no network. `parseMaxDoseMg()` reads mg/g/microgram (longest-first unit alternation, so "microgram" cannot partial-match as "g" — a 1,000,000x error), takes the MAX amount (a misplaced zero lands on the cap), and returns null for a weight/BSA basis (mg/kg, mg/m²), non-mass units (IU/mL/%), or anything unreadable. `assessPlausibility()` → plausible | implausible | **unassessable**, worst-comparator-wins. **FAIL-SAFE: unreadable is NEVER "plausible"** — an unassessable result explicitly says "this is NOT an all-clear", because a guard that guesses launders a non-check into reassurance. **It is a WARN for a human, never a bin** (a genuine >10x jurisdictional difference is possible — loading vs maintenance dosing). `test/contract-dose-plausibility.js` (in npm test) proves BOTH directions: the 5000-vs-500 typo IS caught, and the legitimate 500-q8h-vs-875-BD AU/US difference — which the removed gate would have BINNED — passes untouched. Congruence stays AUTHORED, not computed: whether a difference is "non-congruent" or "a different approved indication" is clinical judgement, and the structural protection is that comparators[].dose_statement is REQUIRED, so the clinician reads the foreign label verbatim regardless of the status.
  gap_register_link: none (Medium)
  status: resolved
  last_scanned: 2026-07-15
```

```md
- id: dose-congruence-surfacing-unbuilt
  path: portal/ (clinician review surface) · scripts/pharm-dose-author.mjs (C2 worksheet round-trip, unbuilt) · mcp/servers/pharmacology/domain/model.js (DoseGuidanceSchema.au_congruence)
  component_type: other (clinician surface)
  state: PARTIAL
  evidence: Opened 2026-07-15 by the second C0 amendment (operator ruling: AU primacy — `non_congruent` no longer requires an appraisal_note). **This item exists because that ruling has a load-bearing precondition that nothing currently enforces.** The ruling's reasoning is: "as long as the non-congruent fact has been ALERTED to the clinician, it is assumed the clinician has weighed it in their decision". That is sound — the AU clinician IS the final authority (Guardrail 2) — but it is an obligation on the SURFACE, not on the schema. `DoseGuidanceSchema` guarantees the foreign label's `dose_statement` is **RECORDED** in `au_congruence.comparators[]`. **NOTHING yet guarantees it is DISPLAYED.** If a `non_congruent` dose ships and no surface shows the clinician the foreign label beside the AU dose, then "the clinician weighed it" is false, the appraisal is inert metadata, and the AU-primacy model collapses into shipping unflagged divergences — the one outcome every party to this design (operator and agent) intends to prevent.
  blocks: the safety argument under `dose-guidance-empty-no-au-source` C2 — not the authoring, but the point at which any dose reaches a clinician
  safety_class: degrades_safe
  invariant_exposure: no-autonomous-prescription / human-in-the-loop (Guardrail 2 — "the engine proposes, a registered practitioner disposes"; `required_human_review` is always true). Disposal presumes SIGHT. An appraisal recorded but never rendered satisfies the schema and defeats the guardrail — and it would READ as done, because the data is right there in the record. That is exactly the failure mode this item exists to keep visible.
  risk: High
  blocks_patient_facing: true
  build_action: **R-47a BUILT 2026-07-15 (the attestation half).** `scripts/pharm-dose-worksheet.mjs` renders the dose-evidence landscape for clinician attestation: the verbatim APF source, every dose_line with indication/route/basis/plausibility, the congruence status, and **every comparator's jurisdiction + agency + authorisation status + dose VERBATIM** — plus the Case-4 international-only section (corroborated US+EU vs single-label bare fact) and an explicit AU-primacy statement framing foreign labels as evidence beside the dose, never a verdict on it. **The bar is mechanical and TESTED, not trusted:** `assertEvidenceRendered()` is exported and `renderDoseWorksheet` self-verifies through it — a surface that drops a comparator dose, a plausibility state or the verbatim source THROWS. `test/contract-dose-worksheet.js` proves it by feeding deliberately incomplete surfaces, including the precise plausible regression (everything rendered EXCEPT the foreign dose). Verified on the real data: 11 AU records, 12 comparator doses, every one displayed. **R-47b BUILT 2026-07-15 (E3 — the runtime half).** The evidence plane (`mcp/servers/pharmacology/dose-evidence-plane.js`) assembles everything held about a dose — the clinician-signed AU dose, every US/EU comparator VERBATIM, the CDS gateway's dose_candidate (which the pipeline previously mapped and then DISCARDED), the 261 signed literature records, the congruence appraisal and the plausibility read — and it reaches the clinician through `ReviewBundle.dose_evidence[]` and is RENDERED by `portal/server.js renderDoseEvidence()`. **The bar is mechanical and tested, mirroring R-47a:** `assertDoseEvidenceRendered()` is exported, `renderBundle` self-verifies through it, and a surface that carries a comparator but drops it from its HTML THROWS. Verified on the real render: HTTP 200, both foreign labels + the AU dose + the literature displayed, AU primacy stated, authoritative vs advisory distinguished. The evidence rides INSIDE `bundle_sha256`, so 'the clinician saw the divergence' — the precondition the AU-primacy ruling assumes — is now part of the medicolegal record rather than an assumption (removing a comparator breaks the hash; asserted). **Three properties held, not weakened:** (1) `PharmCheck.dose_guidance` is UNTOUCHED and frozen — the AU signed dose alone is patient-promotable; `assertNoAdvisoryInDose()` throws if foreign-sourced dose text ever reaches it. (2) engine.js has NO path to a foreign label — the plane is imported by the pipeline's portal channel only, PharmDataSource gains no accessor, and the test pins both. (3) SHOW-EVIDENCE-PRINCIPLE §1.1 held: **no dose text past a blocked firewall** (HARD_FAIL / BLOCKED_NO_PROOF / paediatric) — the first cut of E3 violated this and was corrected; past a block the plane returns an ACCOUNT of what is withheld and why (counts + reason), so a gated action never becomes a silent drop. **STILL OPEN — this item does NOT resolve:** the surface is built but the Clinician Verification Portal itself is blocker #2 and remains RED (FL-11 WORM bucket, FL-43 live IdP). A rendered page behind an unbuilt portal is not yet a clinician seeing a dose in a live consult. **State PARTIAL; `dose-guidance-empty-no-au-source` still must not be resolved while this is open.**
  gap_register_link: R-47 (row exists; link backfilled 2026-07-15 — the field lag the fourth-pass verification flagged)
  status: open
  last_scanned: 2026-07-15
```

```md
- id: dose-identity-split-unsafe-pass
  path: mcp/servers/pharmacology/engine.js (identity-split guard) · domain/ingredient-identity.js · data/ingredient-identity.json
  component_type: other (drug identity)
  state: PARTIAL
  evidence: **FOUND + FIXED 2026-07-15 (E6). INTRODUCED BY E1 — a safety regression, self-inflicted, caught by measuring rather than by a test.** Verified live on the engine BEFORE the fix: `frusemide` + digoxin/lithium → **PASS, dose EMITTED, interaction_check PASS, no flags**; `furosemide` — the SAME drug, RxNorm 4603 — → **HARD_FAIL, interaction_severe**. The dose lives under the Australian name; the interaction + NTI data live under the INN. The check RAN, looked up the wrong string, found nothing, and PASSED. **A dose emitted while its safety checks were inert.** Before E1 these drugs had no dose, so knownDrug() was false → BLOCKED_NO_PROOF; E1 populated dose-guidance from APF's name-space while every other capability uses the INN name-space, **turning a fail-safe block into an unsafe pass**. SIX drugs affected (measured, not estimated): frusemide/furosemide · chlorthalidone/chlortalidone · eformoterol/formoterol · cholecalciferol/colecalciferol · beclomethasone/beclometasone · hexamine hippurate/methenamine hippurate. **This also inverts the register's own claim** that "a miss is a SILENT no-dose (fail-safe direction)": for a split name the miss is a silent no-INTERACTION-CHECK while a dose flows.
  blocks: nothing downstream — the guard closes it; the remaining work is reconciling the two name-spaces properly
  safety_class: can_emit_fabrication (pre-fix: a dose presented as checked when its checks never saw the drug)
  invariant_exposure: no-autonomous-prescription / fail-safe-default — a PASS that proves nothing is not a PASS. Both restored by the guard.
  risk: Critical (pre-fix) → Medium (guarded)
  blocks_patient_facing: false (mock/dev only; nothing patient-facing — but this would have been Critical on any patient path)
  build_action: **GUARD LANDED:** `doseIdentitySplit()` detects a dose whose RxNorm-equivalent sibling holds safety data its own name lacks; engine.js downgrades PASS/WARN → BLOCKED_NO_PROOF and states the reason + the sibling name (never a silent block). HARD_FAIL still stands (more severe). Tamper-proven + narrowness-proven in `contract-ingredient-identity.js`: the 6 splits block, `furosemide` still HARD_FAILs on the real interaction, and an unaffected drug still emits its signed dose. **THE ASYMMETRY that makes this legitimate on an UNSIGNED map:** an unsigned identity map may BLOCK (fail-safe — worst case a spurious block a clinician resolves) but may NEVER STEER a lookup (unsafe — being wrong doses the wrong drug). Same data, opposite risk, opposite gate. **REMAINING:** reconcile the two name-spaces — either re-author the 6 dose records under the INN name (a worksheet round-trip, since the ingredient key is what KL attested against) or sign `ingredient-identity.json` so the resolver may steer. Until then these 6 doses are unreachable, which is the honest state.
  gap_register_link: none (Medium once guarded; escalate if a patient path is ever opened before reconciliation)
  status: open
  last_scanned: 2026-07-15
```

```md
- id: evidence-claims-recorded-not-displayed
  path: portal/server.js (renderEvidenceClaims + assertEvidenceClaimsRendered) · portal/review-bundle.js (evidence_claims) · mcp/schemas/portal-review-bundle.schema.json
  component_type: other (clinician surface)
  state: COMPLETE
  evidence: **FOUND + FIXED 2026-07-15 (M4). R-47's failure mode, in code I had already touched.** `evidence_claims` has always been in the ReviewBundle schema, populated by `buildReviewBundle`, and hashed into `bundle_sha256` — and it was **rendered ZERO times**. Every claim a trunk made, with its supports, was RECORDED AND NEVER DISPLAYED: "satisfies every schema and every test, READS as done because the data is right there in the record, and quietly defeats Guardrail 2". E3 built `renderDoseEvidence` for the dose evidence and never noticed the claims sitting beside it. Verified on the real pipeline: 4 claims carried, 0 displayed. **And `supports: []` is representable** (the schema sets no `minItems`), so an UNANCHORED claim is a real case, not a hypothetical one.
  blocks: nothing — additive
  safety_class: degrades_safe
  invariant_exposure: no-autonomous-diagnosis / human-in-the-loop (Guardrail 2 — disposal presumes SIGHT). A model has **no calibrated internal uncertainty signal it can surface honestly**: fluency and correctness are decoupled, so it states a fabricated threshold in exactly the voice it uses for well-established fact. A clinician scanning well-written output has nothing to separate a receipt-backed claim from a confabulated one — unless the surface tells them, which it now does.
  risk: Medium
  blocks_patient_facing: false
  build_action: **DONE.** `renderEvidenceClaims()` displays every claim with a register **derived from GROUNDING, never from wording**: `supports.length > 0` → receipt-backed; `supports.length === 0` → **HYPOTHESIS — anchored to nothing**, with the count surfaced in the heading rather than buried in a row. `assertEvidenceClaimsRendered()` is the bar (the third of its kind, after R-47a's `assertEvidenceRendered` and R-47b's `assertDoseEvidenceRendered`), and `renderBundle` self-verifies through it. **The subtle failure is the one that matters and is asserted separately: an unanchored claim DISPLAYED WITHOUT its register is worse than one not displayed at all** — it then reads as a finding, and a naive "is it rendered?" check passes. Tamper-proven THREE ways: dropping the claims THROWS; dropping the register on an unanchored claim THROWS; marking everything receipt-backed (register from wording, not grounding) THROWS. Two identically-worded claims — one anchored, one not — are asserted to land in different registers, because if wording could move the register the model's fluency would be steering it, which is the bug. The claims ride INSIDE `bundle_sha256`, so what the clinician saw and in which register is part of the medicolegal record (asserted: stripping them breaks the hash).
  gap_register_link: none (Medium)
  status: resolved
  last_scanned: 2026-07-15
```

```md
- id: positional-stability-unchecked
  path: verification/positional-stability.js · verification/eval-positional.js · verification/eval-harness.js · test/contract-positional-stability.js · test/contract-eval-positional.js
  component_type: verifier
  state: PARTIAL
  evidence: **HARNESS BUILT 2026-07-15 (M3).** Positional bias is the LLM glitch with no bedside equivalent: a transformer over-favours the first/last item of a list for reasons of attention geometry (primacy/recency, "lost in the middle"), not clinical merit — so the ORDER you list differentials in changes the ranked output. A human applies judgement to each entry roughly independently of ordinal position; **a reviewer has no intuition for this because they do not have the bug.** It is silent by construction: the only way to see it is to permute the input and look. **PREMISE CHECKED (the M1/M2 lesson): the default trunk generator (`stubGenerationOutput()`) returns a FIXED STRING and ignores the packet entirely — it is trivially position-stable and checking it proves NOTHING.** The harness is for the REAL generation path (`generate_candidate(packet)` — Claude/MedGemma, mock by default) and is INERT until one is wired.
  blocks: nothing — additive and currently inert
  safety_class: degrades_safe (it reports; it changes no output)
  invariant_exposure: none directly. It guards ranking integrity — a failure mode invisible to every human reviewer, which is exactly why it needs a machine to look.
  risk: Medium
  blocks_patient_facing: false
  build_action: **DONE (the harness):** `checkPositionalStability(packet, generate)` permutes `facts`/`evidence` with a SEEDED shuffle (an instability nobody can reproduce cannot be investigated) and compares the RANKING, not the prose — two runs of a model word things differently while ranking identically, and comparing prose would flag paraphrase as instability. **THE CONTROL RUN IS THE LOAD-BEARING PART:** you cannot attribute a difference to POSITION until you have established the generator is DETERMINISTIC. A model at temperature > 0 varies for reasons unrelated to ordering; without the control, the harness would blame temperature on position and cry wolf until someone switched it off — and then the real instability ships. So a non-deterministic generator returns `verdict: "indeterminate"` — an honest "I cannot tell you" over a confident wrong attribution. Also `not_applicable` when no list exceeds length 1 (reporting "stable" there would be a pass nobody earned). **Tamper-proven BOTH ways: deleting the control run makes it misattribute noise as "unstable" (caught); neutering detection makes it miss a purely position-ranking generator (caught).** **OPERATOR RULING 2026-07-15 — EVALUATION-ONLY, wired into FL-40, with a case set that deliberately includes LONG-LIST cases.** The reasoning is the operator's own bias analysis: *"Model bias is stateless and frozen at training — you cannot fatigue it… It fails the same way every time under the same prompt, which is at least predictable."* **Positional bias is a property of the MODEL, not of the patient**, so runtime permutation would pay ~4× generation per consultation (baseline + 3 permutations) to re-measure a constant. Two supporting reasons: a mid-consult flag has **no good action** (`required_human_review` is already always true, so "this ranking may be positional" adds noise to a clinician who was reviewing it regardless), and 4× latency on a telehealth consult is real cost for a signal obtainable at the gate. **THE LONG-LIST REQUIREMENT IS THE LOAD-BEARING HALF, not a garnish:** severity depends on the INPUT — a long differential is far more susceptible than a short one (attention is finite; the middle of a long list is attended least). An eval set of only typical-length cases would certify stability on the EASY SHAPE and miss the failure entirely. This is the one condition under which evaluation-only is insufficient, so it is a requirement of the ruling rather than an optimisation. **WIRED 2026-07-21 (FL-40 Phase 6): (a) DONE — `verification/eval-positional.js` runs `checkPositionalStability` per long-list case (ranking signal = the order the sealed differential dx appear in the output, applied SCORER-SIDE; permutation packet built from 01 presentation only, sealed 10 never injected) and `positionalGate` folds an unstable/indeterminate/not_applicable verdict into `release_gate` — release = threshold gate AND positional gate; (b) DONE — long-list selection at N=8 (disclosure≥8 OR differential≥8); a corpus scan found 343 of 709 attested cases qualify, so the M3 coverage requirement is genuinely met (NOT the easy shape); a certifying run with zero long-list cases is a coverage FAILURE (not_applicable does not certify); (c) the SAMPLED-CANARY cost lever is built — CLI `--positional-sample N` caps the pass and LOGS the drop (no silent cap). Detection contract-tested (contract-eval-positional: merit-ranking → stable, position-sensitive → unstable, gate-fold proven). REMAINING: inert until the authoritative live run records fixtures (per clinical-eval-scorer) — the check replays over recorded permutation generations; polypharmacy was dropped as a signal (corpus max 6 meds).**
  gap_register_link: none (Medium)
  status: open (wired as a blocking eval threshold FL-40 Phase 6; exercised live once fixtures recorded)
  last_scanned: 2026-07-21
```

```md
- id: descent-guard-upstream-inheritance
  path: test/contract-descent-guard.js · integration/trunk-sequencer.js · integration/trunk-pipeline.js · verification/pipeline.js (generate_candidate(packet)) · mcp/schemas/context-packet.schema.json (evidence[])
  component_type: verifier
  state: PARTIAL
  evidence: **M2's PREMISE WAS FALSE — verified BEHAVIOURALLY 2026-07-15.** `.planning/TRUNK-RISK-MODEL.md` §4 said "T6–T9 currently inherit the frame". **They do not.** Ran 5.0 → 6.0 through the REAL sequencer with a marker in 5.0's output and captured 6.0's packet through the generator hook: **the marker is absent.** There is no trunk-to-trunk output flow at all — `runTrunkWithGrounding` accepts no upstream-context parameter, `executed` is an accumulating RECORD never fed forward, and generation is packet-only by contract (`generate_candidate(packet)`; generation-backend.js states it). So there was no frame to guard, and building the guard anyway would have been a wall across a gate nobody uses — the exact failure the trunk-risk-model exercise exists to correct.
  blocks: nothing today. **But this is load-bearing and TEMPORARY**: a pipeline whose trunks never see each other's work is not the target state — 7.0 must eventually code what 4.0/5.0 framed. The sequencer's halt-rule-4 rationale ("a rejected output must never become upstream context for the next trunk") is recorded INTENT that the flow will exist; it currently guards a flow that does not.
  safety_class: degrades_safe
  invariant_exposure: none directly — it protects the uncorrelated-bias property. On this mountain the deaths are on the DESCENT: 6.0–9.0 run downhill from 5.0's summit, which is exactly where anchoring propagates, premature closure bites and sycophancy compounds. A downstream trunk handed 5.0's frame as a PREMISE will confirm it.
  risk: Medium
  blocks_patient_facing: false
  build_action: **DONE (the honest half):** `contract-descent-guard.js` pins the property BEHAVIOURALLY — it drives the real sequencer and asserts no downstream packet carries an upstream conclusion; it pins generation as packet-only (the property section 1's proof rests on); and it asserts `packet.evidence[]` still exists as the correct future home. **Tamper-proven the hard way** — the first two tamper attempts were INCOMPLETE (`_upstream` never reached contextInjection's explicit meta), so the test appeared to pass and proved nothing; only the third, complete wiring made it FAIL, naming T6.0 and stating the fix. **NOT BUILT, deliberately: the `downstream_independence` verifier check.** There is nothing to check — no output flows. It is worth building the day the flow is, and not before. **THE DESIGN IS RECORDED IN THE FAILURE MESSAGE**, so the engineer who wires trunk-to-trunk flow is told at the moment they break the test: route it as an EvidenceNode in `packet.evidence[]` (a CLAIM, with a receipt), never as a fact in `packet.facts[]`, then build `downstream_independence` (agreement with an upstream conclusion must cite support that is not merely that conclusion).
  gap_register_link: none (Medium)
  status: open
  last_scanned: 2026-07-15
```

```md
- id: blind-commit-anchor-firewall
  path: verification/pipeline.js (contextInjection — M1 guard) · test/contract-blind-commit.js · mcp/schemas/context-packet.schema.json (facts[].category enum)
  component_type: verifier
  state: COMPLETE
  evidence: **BUILT 2026-07-15 (M1).** Trunks 1.0–5.0 may never see a clinician's leading hypothesis: anchoring + positional bias + sycophancy COMPOUND in a language model, and a differential produced after the human has spoken is not a second opinion — it is an amplifier of whoever spoke first. 6.0–9.0 deliberately MAY see it (the independent view exists by then; comparison is the point). **The design doc's proposed mechanism was WRONG and research corrected it:** `context-allowlist.js` is already default-deny and TRUNK-AGNOSTIC — it filters case content (00/01/02), so there was no DENY set to add to and no trunk scoping to add it to. **The property already held BY CONSTRUCTION:** nothing produces a `clinical_assessment` fact (the only reference is a CONSUMER's priority map in models/jamba/assembler.js), `user_input` never reaches the packet (`routing(_userInput, trunk)` ignores it), and the ContextPacket is additionalProperties:false with no hypothesis field. **But it held by ACCIDENT** — `clinical_assessment` is a valid category in the packet's own enum, so the day someone adds "the clinician's working dx" (plausible: it is genuinely useful for 6.0–9.0), 1.0–5.0 would inherit the anchor and nothing would say a word.
  blocks: nothing — additive
  safety_class: degrades_safe (it THROWS; it can only refuse, never admit)
  invariant_exposure: none directly. It protects the ONE structural protection this design has — uncorrelated bias between the human and the model. A design that lets the clinician's anchor propagate into the model, and the model's sycophancy back into the clinician, has engineered the correlation it should have been built to break.
  risk: Medium
  blocks_patient_facing: false
  build_action: **DONE.** The guard THROWS (following context-allowlist's scoring-store precedent: "a firewall-breach attempt must halt packet assembly loudly, never degrade to a dropped field" — silently dropping the anchor would leave the caller believing it was delivered), is trunk-scoped to 1.0–5.0, and its message names WHERE the assessment belongs instead (6.0–9.0). `contextInjection` exported + a `_test_facts` seam added, because the guard is unreachable through the public surface and **a guard that can only be checked by grepping its own source is not tested**. Tamper-proven BEHAVIOURALLY both ways: making 5.0 sighted FAILS; neutering the throw FAILS. **This turned an accident into a guarantee — the same shape as R1.**
  gap_register_link: none (Medium)
  status: resolved
  last_scanned: 2026-07-15
```

```md
- id: trunk-constraint-claims-unenforced
  path: trunk/prompts/trunk-{1..9}.0-system.md · docs/grounding/trunk-constraints.md · .claude/trunk-cheatsheets/*.md · verification/integrity-detectors/detectors.js
  component_type: trunk-prompt
  state: PARTIAL
  evidence: **FOUND + RELABELLED 2026-07-15 (R1).** All nine trunk prompts ended with `## Constraints (enforced by verification)` over `- No diagnosis. - No dosages.` **Verification does not check either.** Its five checks are no_invented_codes / no_invented_guidelines / no_invented_operations / no_repo_invention / hard_stop_enforcement. Two detectors DO exist and are correctly wired (monotone AND — a detector failure fails the output and can never rescue it) but are NARROW BY DESIGN and neither catches the act — measured, not inferred: `The patient has appendicitis.` NOT caught · `This is definitely appendicitis.` NOT caught · `Diagnosis: appendicitis.` NOT caught · `Take 500 mg of amoxicillin three times daily.` NOT caught. `overconfident_diagnosis` needs "definitely" within 40 chars of "diagnos"; `advisory_dose_leak` needs ADVISORY framing too (it targets the G9 leak). **The detectors are correct; the CLAIM was the defect.** And the prompts invented it alone: `trunk-constraints.md` (the source of truth) has always listed exactly which checks fire per trunk and NEVER listed a diagnosis or dose check, and the derived cheatsheets are honest too — they already separate `Verifier checks that apply` from `Literal constraints`. The nine prompts were the sole outlier, which INVERTS the usual derived-file rule: source and derived agreed; the implementation was wrong.
  blocks: nothing downstream — but it was the false premise every scope conversation rested on, and the precondition for M1–M4 (blind commit / descent guard / positional stability / register separation) meaning anything
  safety_class: presents_mock_as_live
  invariant_exposure: no-autonomous-diagnosis / no-autonomous-prescription — **the constraints are real obligations and remain absolute; the ENFORCEMENT was overstated in nine files.** An unenforced constraint labelled "enforced" buys silence with a promise it does not keep: it reads as absolute so nobody asks how the risk is modelled, and it stops nothing so the risk is not handled.
  risk: High
  blocks_patient_facing: false
  build_action: **R1 DONE 2026-07-15.** (a) All nine prompts relabelled into MECHANICAL (only bars that exist, read from trunk-constraints.md — no new fact invented) vs CONVENTIONAL (the literal constraints, honestly labelled, with the text stating plainly that on those "nobody is watching but you"). NOTHING LIFTED — every literal constraint survives, asserted. (c) **`test/contract-trunk-claims.js` makes the honesty MECHANICAL** — a prompt may not name a bar that does not exist in verifier.js/DETECTORS, must match trunk-constraints.md EXACTLY (D-R-1: a subset lets a prompt quietly under-claim), may not say "enforced by verification" outside a MECHANICAL block, and must still state every literal constraint AS A BULLET. Tamper-proven BOTH ways: a fabricated bar FAILS; deleting a constraint FAILS. **The suite's own first cut had a false-pass** — it tested the whole file for /no diagnosis/i and its own explanatory prose satisfied it, so a deletion passed; caught by tampering and scoped to bullets. **REMAINING: (a) R2 — the four-field risk model (altitude / what-you-are-FOR / failure-mode-here / bars) across all nine; the boilerplate is honest now but still has ZERO positive scope (9/9 prompts: 4–6 negatives, 0 positives) and names ZERO of the four LLM-specific failure modes (sycophancy/anchoring/positional/confabulation → 0 files each). (b) R3–R6 — the actual bars: M1 blind commit (reuses context-allowlist's default-deny), M2 descent guard (T5's output as EvidenceNode + a downstream_independence check), M3 positional stability, M4 register separation. Until those land, "no diagnosis" is conventional and the register says so.**
  gap_register_link: pending promotion (High — mirror per the one-way rule)
  status: open
  last_scanned: 2026-07-15
```

```md
- id: drug-vocabulary-capability
  path: mcp/servers/pharmacology/data/drug-vocabulary.json · domain/model.js (DrugVocabularySchema) · scripts/pharm-vocabulary-build.mjs · sources/pharm-data-source.js (canonicalise) · data/capability-groups.json (drug_identity)
  component_type: dataset
  state: PARTIAL
  evidence: **BUILT 2026-07-15 (E8) on operator task.** The unifying drug vocabulary: **1455 drugs · 5196 names** — 3635 AU brands, 1455 primaries, 70 international generics, 18 former names, 16 company artifacts, 2 spelling variants. Links every name a patient/doctor/system actually uses to ONE identity + its unifying identifiers (RxCUI 969, WHO ATC 1094). Verified: `Lasix` (patient) · `frusemide` (doctor) · `furosemide` (system) all land on rxcui 4603 / ATC C03CA01. New `drug_identity` capability group — cross-cutting, not an APF22 heading: it answers WHICH DRUG, the question every other group silently assumed (E6 proved the assumption unsafe).
  blocks: nothing. **SIGNED 2026-07-15 (V3) — the gate is passed and the vocabulary is LIVE.**
  signed_2026_07_15: **CLINICIAN SIGN-OFF APPLIED.** Kenneth Lee (MED0001857758) marked the V2 worksheet (`eval/pharmacology/signoff/drug-vocabulary-worksheet-KL-2026-07-15.xlsx`): 2 authority + 17 former-name + 73 ask + 16 refusal decisions, **108 Attest / 0 Amend / 0 Reject**, 0 brand exceptions → **1455/1455 records approved**, `clinical_sign_off: true`, re-sealed in the same pass (R-46: `51da51a4a677 → 51b51555254b`). Verified: only `reviewed_by` + `review_status` moved — **zero identity content changed**. WHAT THE SIGNATURE COVERS, exactly: he did NOT read 5,196 rows. He ruled on two SOURCES (PBS as the AU naming authority for brand→ingredient; RxNorm's concept id as the identity key), which cover the 3,635 brands — each listed on sheet 5 and individually exceptable — and then decided individually every name that STEERS, every question the system asks a patient, and every refusal. The attestation statement says so, and a test pins that it cannot be edited to overclaim. **NOW LIVE:** 3,635 brands reach their ingredient (`Lasix`→furosemide, `Eutroxsig`→levothyroxine); the 73 ask-prompts fire; `identityCode()` returns RxCUIs, so B0b's code now travels to the CDS gateway. **STILL BARRED, signed or not:** a US generic may never steer silently (`acetaminophen` still ASKS) — that bar is in the schema, not in the signing state.
  safety_class: degrades_safe (the gate is the FLAG: flip `clinical_sign_off` false and canonicalise/identityCode go inert — proven in BOTH directions by fixture, not by the shipped state)
  invariant_exposure: **Australian healthcare context only** — the load-bearing one. RxNorm's canonical is the USAN, NOT the INN: `rxnorm_name` for paracetamol is "acetaminophen", salbutamol "albuterol", adrenaline "epinephrine". A vocabulary that took rxnorm_name as the primary would have Americanised an AU clinical system, invisibly (the US spelling appears nowhere in our data, so no collision report would flag it). GUARDED: PBS (the AU Government formulary) is the naming authority; RxNorm supplies the CONCEPT ID only; an `international_variant` with `usable_for_lookup:true` is UNREPRESENTABLE at the schema level, so a US name can never resolve an AU lookup **even when the vocabulary is signed**.
  risk: Medium
  blocks_patient_facing: false
  build_action: **AMENDED 2026-07-15 (second operator ruling): 'in doubt' is a reason to ASK, not to refuse.** The first cut had a boolean bar (steer|refuse), which dead-ended a name a human could resolve in one answer — the same suppression instinct the show-evidence principle exists to stop, applied to identity. Now THREE states: `steer` (5108 — AU, unambiguous, already ours) · **`confirm` (72 — ASK the patient/doctor)** · `refuse` (16 — only where asking is nonsense: a manufacturer's name is not a drug). **US GENERICS ARE RECORDED AND ASK** (70): paracetamol/acetaminophen, salbutamol/albuterol, rifampicin/rifampin, aciclovir/acyclovir, mesalazine/mesalamine — one ingredient, two names, genuinely mixed. Verified live (signed copy): `acetaminophen` → *"You entered 'acetaminophen', which is the US name for the medicine known in Australia as 'paracetamol' (the same ingredient, RxNorm 161). Is 'paracetamol' the medication you intend?"* → BLOCKED_NO_PROOF pending the answer. **US BRANDS ARE NOT HARVESTED**, enforced from RxNorm's own TTY (IN/PIN/MIN only; a BN never enters) rather than a guess about which strings look like brands — verified across all 987 resolved concepts: IN 933 · PIN 51 · MIN 2 · **BN 0**. An `international_generic` that steers, or that lacks a generic TTY, is UNREPRESENTABLE at the schema level; a `confirm` without a question is too. Ambiguity now ASKS with every candidate presented and none chosen. **DONE:** schema + validator + `drug_identity` group + deterministic builder + TTY harvest (`--refresh-tty`) + `canonicalise()` three-state wiring + engine asks-and-blocks + `contract-drug-vocabulary` in npm test. **NOT ingest-routable** — the same bar `dose_guidance` has, for the same reason: a vocabulary entry REDIRECTS a lookup, so an agent able to author one could map 'amoxicillin' → 'warfarin' and steer a dose. Recording ≠ resolving: `usable_for_lookup` gates what may steer; ambiguity is refused BOTH WAYS (refusing one side only silently picks the other — asserted); company names leaking into PBS's brand_name field (16) are caught as artifacts, never drugs. Nothing binned — every name kept and labelled. **REMAINING:** (a) **clinician sign-off** — until then `canonicalise()` does not read it and behaviour is exactly E7's; signed, it unlocks 3635 AU brand names as lookups (verified: `Lasix` → furosemide's full HARD_FAIL). (b) PBS is the subsidised list, so OTC brands (Panadol) are absent — an honest coverage limit, not a defect. (c) RxNorm brand/synonym harvest deliberately NOT done: it would import US brands into an AU name-space.
  gap_register_link: none (Medium)
  status: resolved
  last_scanned: 2026-07-15
```

```md
- id: pharm-ingredient-name-normalisation
  path: scripts/pharm-dose-author.mjs (APF_TO_DATASTORE explicit map) · mcp/servers/pharmacology/data/data-sources.json (rxnorm-nlm, registered but unbuilt) · mcp/servers/pharmacology/sources/pharm-data-source.js (all getters key on lowercased ingredient)
  component_type: other (identity normalisation)
  state: PARTIAL
  evidence: Found 2026-07-15 during C2 authoring. The datastore keys every clinical fact on a lowercased ingredient STRING, with NO normaliser — `rxnorm-nlm` is registered in data-sources.json as providing "drug_normalisation, synonyms, ingredient_identity" and is NOT built. Measured against the clinician's APF22 transcription: **only 336 of 471 APF ingredients (71%) match a datastore name exactly.** APF22 uses Australian/British orthography; the datastore uses the INN. Three are pure orthographic variants of drugs present in BOTH and would be SILENT MISSES: **amoxycillin/amoxicillin, cyclosporin/ciclosporin, pericyazine/periciazine**. This is a SHOW failure, not a data failure: a dose authored under "amoxycillin" is invisible to an engine looking up "amoxicillin" — the dose exists, is signed, and is never shown, which is the same outcome as no dose, reached more expensively. Caught only because amoxicillin is the drug `contract-pharmacology` uses to prove a safe PASS carries a dose.
  blocks: cross-capability name alignment for the ~132 APF ingredients whose spelling differs from the datastore's other capabilities; any future ingest keyed on a source with different orthography. **CORRECTED 2026-07-15 (E1): this item does NOT block dose COVERAGE, and the earlier claim that it did was wrong — see build_action.**
  safety_class: degrades_safe
  invariant_exposure: none directly — a miss yields NO dose (fail-safe), never a WRONG one. The hazard is the opposite of fabrication: silent omission of signed clinical content, invisible because nothing errors.
  risk: Medium
  blocks_patient_facing: false
  build_action: C2 mitigates with an EXPLICIT three-entry map (APF_TO_DATASTORE) whose every application is REPORTED, never silent — deliberately NOT a fuzzy matcher (fuzzy-matching drug names is how you dose the wrong drug). **CORRECTION (E1, 2026-07-15): this record previously stated the 29% non-match "gates coverage beyond Tier A", and `dose-guidance-empty-no-au-source` repeated it. That was FALSE, and it mattered — it made a one-line filter look like a data problem. Coverage was gated by a hardcoded eleven-element array (`const wanted = [...TIER_A, "amoxicillin"]`), not by name matching. Removing it took dose-guidance from 11 to 451 records with the normaliser still unbuilt, because a dose record is authored under the APF ingredient name and `getDoseGuidance()` looks up by that same string — the name only has to be self-consistent, not to match the OTHER capabilities.** The real, narrower scope: for the ~132 ingredients whose APF spelling differs from the spelling the intent/other capabilities use, the signed dose is authored but never looked up — silent omission. Needs a real normaliser on the already-registered rxnorm-nlm (INN + synonym resolution), with unmatched names REPORTED, never silently written as orphans. Until then any authoring pass MUST print its normalisations and its misses (E1's does).
  gap_register_link: none (Medium)
  status: open
  last_scanned: 2026-07-15
```

```md
- id: dose-guidance-empty-no-au-source
  path: mcp/servers/pharmacology/data/dose-guidance.json · mcp/servers/pharmacology/domain/model.js (DoseGuidanceSchema) · mcp/servers/pharmacology/data/data-sources.json (tga-pi, amass-regulatory, apf22) · scripts/pharm-dose-{crosscheck,author}.mjs (C1/C2, unbuilt)
  component_type: dataset
  state: PARTIAL
  evidence: **ADVANCED again 2026-07-15 (E1/E2): the ELEVEN became 451 — the FULL APF22 Section D adult set, every record CLINICIAN-ATTESTED (KL/MED0001857758, tranched xlsx worksheets, 451 Attest / 0 Amend / 0 Reject), clinical_sign_off:true, 0 drafts, 23/23 seals. The gate was never a safety bar: `const wanted = [...TIER_A, "amoxicillin"]` — a hardcoded eleven-element array left over from the C2 risk-tiered first pass. The clinician's transcription always carried 451 adult doses across 471 monographs; 440 had simply never been authored. Removing the array required no architectural change and no new data. The substring bar swept all 451: 0 violations. Every readable adult dose is now written under the show-evidence principle, carrying its plausibility state and congruence appraisal as LABELS rather than as reasons to withhold it.** Prior (C2): 11 Tier A + amoxicillin records authored, all draft. dose-guidance.json originally held `records: []` with clinical_sign_off:false — it is the ONLY datastore capability that becomes a dose (engine.js emits it via PharmCheck.dose_guidance on PASS/WARN), and it has never been populated. NOT an oversight and NOT an authoring backlog: it is the collision of two hard constraints — (a) the AU dose authorities are licence-restricted (APF22/AusDI are use_restriction:structure_only, content_licence_held:false; AMH is not a registered source at all; PBS's own registry note says it does NOT provide dosing), and (b) "no dosages from the LLM" bars the agent authoring one. The empty file is the fail-safe working. Research: .planning/DOSE-GUIDANCE-RESEARCH.md. Distinct from dose-evidence (261 KL-signed records) — that is a citation register of literature FINDINGS, engine-isolated by design (no accessor), NOT a dose source; the two are different epistemic categories and dose-evidence cannot be promoted into this file.
  blocks: any dose emitted from the clinician-signed datastore (the engine currently falls back to 3 self-labelled mock doses — see dose-mock-fallback-mixing); FL-34 Phase B's dose-range KM (deliberately not built for this reason)
  safety_class: degrades_safe
  invariant_exposure: no-dosages-from-the-LLM / no-autonomous-prescription — the invariant this capability exists to protect. C0 makes the bar MECHANICAL rather than conventional: DoseGuidanceSchema admits exactly two origin channels (tga_pi | clinician_apf_attestation), requires an AHPRA registration id on the clinician channel (an agent string cannot match, so an agent-authored dose is UNREPRESENTABLE), and (AMENDED 2026-07-15) records an `au_congruence` APPRAISAL against the US/EU labels that is mandatory but ANNOTATES rather than vetoes — the original "omit diverges so a differing dose cannot be written" gate was removed as an inversion of the jurisdiction rule (a foreign regulator has no standing to veto an AU dose) and as over-triage (AU/US/EU labels legitimately differ).
  risk: Medium
  blocks_patient_facing: false
  build_action: **C0–C3 + C2d DONE 2026-07-15. The capability that was empty since inception now holds 11 CLINICIAN-SIGNED AU doses.** C0 schema/sources/defects; C1 plausibility guard + international route; C2a APF markdown parser (the CSV route would have shifted columns, putting a PAEDIATRIC dose in the ADULT field undetectably); C2b show-evidence domain layer (dose_lines, dual basis, substring bar); C2c 12 US/EU label doses verbatim from AMASS; C2b/C3 11 AU records authored + the mock fallback REMOVED with the first real dose; C2d KL (MED0001857758) attested all 11 via the R-47a worksheet — 0 Amend, 0 Reject — re-sealed with the basis recorded. `clinical_sign_off:true`, `regulatory_sign_off:false`, `-dev`, receipts `mock`, 0 drafts, 23/23 seals verify. Adult only; the 232 paediatric rows stay held. **E1/E2 DONE 2026-07-15: the full 451-record adult set authored and attested.** E1 removed the TIER_A array gate (11 → 451) and carried the C2d attestations forward on byte-identical source text. E2 delivered the tranched .xlsx attestation surface (Tier A + indication-present first, 123 + 328, asserted lossless), a dependency-free xlsx writer (`scripts/lib/xlsx-min.mjs` — no new package; CLAUDE.md bars a mid-execution dependency), and `scripts/pharm-dose-apply-signoff.mjs`, the round-trip's previously-missing half: it reads the completed worksheets, REFUSES the whole apply on any text drift (the signature transfers only to the words the clinician read), refuses any blank/unreadable mark (an unreadable mark must never resolve to approved), and RE-SEALS in the same pass that causes the drift — R-46's lesson made mechanical rather than remembered. **REMAINING: (a) R-47b — the RUNTIME clinician surface (portal blocker #2). THIS ITEM MUST NOT BE RESOLVED WHILE R-47b IS OPEN: C2 made non-congruent doses real, and R-47b is what guarantees a consulting clinician SEES the divergence the AU-primacy ruling assumes they weighed. (b) C4 — TGA PI (Channel A), operator-gated on the same TGA access FL-05 awaits. (c) international comparator coverage: only 9 of 451 records carry a US/EU comparator, because `international-dose-guidance` holds 12 Tier-A-only records — the same handbrake one level down. (d) name-space alignment for ~132 ingredients (`pharm-ingredient-name-normalisation`) — a SILENT-OMISSION risk, NOT a coverage gate; the earlier claim that it gated coverage was false and is corrected in that record. (e) regulatory (FL-50) before anything is patient-facing.**
  gap_register_link: none (Medium — below promotion threshold; the patient-facing arm is owned by R-22/FL-34 + FL-50)
  status: open
  last_scanned: 2026-07-15
```

```md
- id: dose-mock-fallback-mixing
  path: mcp/servers/pharmacology/sources/pharm-data-source.js:170 (getDoseGuidance → mock-data.json.dose_guidance_mock)
  component_type: other (data source fallback)
  state: COMPLETE
  evidence: FL dose-guidance C0 scan (2026-07-15). getDoseGuidance() returns the datastore record if present, ELSE falls through to mock-data.json.dose_guidance_mock (3 entries: amoxicillin, paracetamol, ibuprofen). SAFE TODAY and correctly classified degrades_safe: every mock dose self-labels inside the string ("500 mg PO every 8 hours (MOCK — not clinically validated)") and dose-guidance.json is empty, so ALL doses are mock and none masquerades as signed. LATENT, NOT CURRENT: the defect activates the moment dose-guidance C2 authors its first real record — the fallback would then silently mix clinician-signed and mock doses on one path, and the self-label becomes the only thing distinguishing them at the point a clinician reads a dose beside real ones.
  blocks: nothing today — this is a precondition ON dose-guidance C2, not a blocker of it
  safety_class: degrades_safe
  invariant_exposure: mock-never-as-live (Guardrail 4) — not breached today (self-labelled, uniformly mock); WOULD be exposed at C2 if the fallback survives
  risk: Medium
  blocks_patient_facing: false
  build_action: **RESOLVED 2026-07-15 (C3, landed with C2's first real dose exactly as required).** The fallback is removed: absent record → null → no dose. Verified: amoxicillin now returns KL's verbatim APF22 text through the engine (not a MOCK string) and `contract-pharmacology`'s "safe PASS should carry dose_guidance" assertion PASSES on real signed data — a strictly stronger test than the mock it replaced; paracetamol/ibuprofen return NO dose yet remain KNOWN drugs (knownDrug() reaches scheduling/renal/nti/interactions/allergy), which is the truth rather than a regression. `contract-pharm-validation` 20/20 + adversarial 8/8 green; engine.js byte-unchanged (C3 touched the SOURCE, not the engine).
  gap_register_link: none (Medium)
  status: resolved
  last_scanned: 2026-07-15
```

---

## LOW

```md
- id: warning-labels-cal-verbatim-pending
  path: mcp/servers/pharmacology/data/warning-labels.json (RASML/PSA_CAL numbers + verbatim wording)
  component_type: dataset
  state: PARTIAL
  evidence: DEFERRED-open from the FL-30 expansion scan (PR #66, 2026-07-14). The warning_labels register (reference-only, engine-isolated) needs its exact CAL/RASML numbers + verbatim wording confirmed before ship. INPUT-gated on a PSA_CAL verbatim/copyright ruling (operator/org — the repo holds registered facts + citation only, no APF/PSA content licence).
  blocks: nothing on the critical path (reference-only, not a dose/check source)
  safety_class: degrades_safe
  invariant_exposure: none (reference-only register, engine-isolated)
  risk: Low
  blocks_patient_facing: false
  build_action: Obtain the PSA_CAL verbatim/copyright ruling; confirm exact CAL/RASML numbers + wording, or explicitly defer to the ship gate.
  gap_register_link: none
  status: open
  last_scanned: 2026-07-14
```

```md
- id: case-dir-duplicate-files
  path: data/cases/*/ (236 "<name> 2.json" sync-dupes across 30 case directories) · .gitignore · scripts/ingest-case-bundles.mjs
  component_type: dataset
  state: COMPLETE
  evidence: M0 scan 2026-07-03 — 236 Finder/cloud-sync duplicate files ("00_case_envelope 2.json" … "13_safety_netting_node 2.json", "case_manifest 2.json") across 30 case directories (11 series: ID, MSK, NEURO, OBS, OPHTH, RENAL, RESP, SURG, URO, VASC), including name-level duplicates of the sealed scoring nodes. Inventoried by filename only; content never opened. At M0 they were untracked; by cleanup (2026-07-05) all 236 had been committed (swept in by a broad `git add` of the output tree), alongside a further ~1,998 untracked sync-dupes that had since accumulated. ROOT CAUSE is not a loose ingest glob — the input filter is tight (readdirSync().filter(n => n.endsWith(".casebundle.json"))), so ingest never admitted them; they entered the OUTPUT tree via cloud-sync + a broad `git add` with no .gitignore guard.
  blocks: nothing — every dupe is a redundant copy of a clean-named tracked twin (twin-verified for all 236); eval:cases never counted them (302 dirs / 301 attested unchanged pre/post removal)
  safety_class: none
  invariant_exposure: none — removal was path-only; sealed 10–13 nodes never opened; scoring-store firewall intact
  risk: Low
  blocks_patient_facing: false
  build_action: DONE (PR #20, 2026-07-05, main @ ccefabd) — git rm all 236 committed dupes (twin-verified, path-only) + deleted ~1,998 untracked sync-dupes from the working tree + .gitignore guards `* [0-9].*` (sync-dupe pattern) and `Projects/` (local binary docs). eval:cases re-verified PASS. Optional residual hardening — DONE (2026-07-06): `cases:ingest` now emits a non-fatal `[HYGIENE]` warning naming any non-canonical file in a written case dir (in particular the `/ \d+\.[A-Za-z]+$/` sync-dupe pattern, "<node> 2.json"), catching cruft at write time not commit time. Filename-only scan (`readdirSync`) — sealed 10–13 bodies never opened, firewall intact; warning-only (exit code unchanged). Covered by `test/contract-case-ingest.js` (fires on a stray, silent on a clean dir).
  gap_register_link: none (Low — below promotion threshold)
  status: resolved
  last_scanned: 2026-07-06
```

```md
- id: repo-digest-sealed-node-carveout
  path: scripts/export-repo-digest.mjs, breath-ezy-repo-digest.md (untracked at repo root; also distributed outside the repo) · test/contract-context-allowlist.js (digest fixtures)
  component_type: other (derived engineering artifact)
  state: COMPLETE
  evidence: RESOLVED 2026-07-13 (FL-03). The carve-out is documented (the digest exporter embeds the reference case's sealed 10–13 for engineering, with an in-file warning; no code routes it into any trunk/packet path) AND now GUARDED BY TEST: `test/contract-context-allowlist.js` gained a digest-shaped default-deny fixture block (synthetic content only, no data/cases read) proving the M3 allow-list rejects every realistic digest-injection shape with ZERO sealed leakage into injectable_fields — (a) a sealed node as a top-level key hard-stops (firewall throw); (b) a case-id-keyed digest node + digest wrapper are rejected wholesale by default-deny; (c) digest text under an unknown field of an allow-listed node is rejected by name. The carve-out remains safe only while the digest stays out of every AI-Doctor context path — now the guard reddens CI if that boundary is ever crossed via the allow-list.
  blocks: nothing — resolved
  safety_class: none in code (would be firewall_breach only if the digest were ever injected into an AI-Doctor context path — now test-guarded)
  invariant_exposure: scoring-store firewall — carve-out safe while the digest stays out of every AI-Doctor context path; the M3 allow-list + this fixture enforce default-deny
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — carve-out documented + digest-shaped default-deny fixture added to the M3 contract test.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-13
```

```md
- id: claudemd-behind-charter
  path: CLAUDE.md (repo root)
  component_type: derived-doc
  state: STALE
  evidence: RESOLVED 2026-07-01 (operator-approved) — the charter's <completeness_audit>/Phase 0/Plan-Execute sections were already present; the remaining staleness was the server build-status prose, which described knowledge/fhir-broker/pharmacology/messaging-geo as "specified, not built" and the four as dist-shipping. Reconciled: repo map (line 33), the dist/index.js note (line 30, +audit-ledger-entry in the schema list line 32), and <gap_register_and_build_sequence> (mock-built PARTIAL status + build-order annotations) now match the register.
  blocks: next-agent fidelity to the governing prompt
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — CLAUDE.md server-status prose reconciled to the register (operator approved the edit 2026-07-01).
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-01
```

```md
- id: derived-docs-unverified
  path: .claude/schema-index.md, .claude/server-status.md
  component_type: derived-doc
  state: STALE
  evidence: RESOLVED 2026-07-01 — schema-index.md verified against disk (12/12 mcp/schemas + 7/7 data/schemas present and correctly attributed; no change needed). server-status.md pharmacology row was self-contradictory ("firewall wiring pending / Not yet wired behind Trunk 8.0" in the table vs "Trunk 8.0 firewall wired" in the narrative and gap-register R-22); table cell corrected to match the wired-and-contract-tested reality.
  blocks: trust in derived quick-references
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: DONE — schema-index verified accurate; server-status pharmacology row reconciled to gap-register R-22 + passing contract-firewall.js.
  gap_register_link: none
  status: resolved
  last_scanned: 2026-07-01
```

---

## Build checklist (recommended order)

Safety-critical, no external dependency — **do first** (pure code, unblocks audit integrity):

1. ~~`hashing-unimplemented` — implement `candidate_output_hash` (SHA-256) + make it required in the report schema + test.~~ **DONE 2026-06-30** (R-16).
2. `verifier-untested` — unit-test the 5 checks + pipeline integration test. **High.**
3. `verifier-weak-code-detection` — ICD-10-AM/LOINC/PBS coverage + code↔receipt binding. **High.**
4. `pipeline-edges-uncontracted` — add zod gates mirroring the JSON schemas. **Medium.**

Then the curated build order (gap-register Part D.11):

5. `pharmacology-server-unbuilt` (+ Trunk 8.0 firewall wiring). **Critical.**
6. `investigation-parser-unbuilt`. **Critical.**
7. `knowledge-server-unbuilt` + `knowledge-datasets-empty`. **Medium.**
8. `clinician-verification-portal-unbuilt`. **Critical (named release blocker).**
9. `case-set-underpopulated` → **52 cases ingested 2026-07-02 (≥45 minimum MET)**; remaining: 60/30/10 distribution top-up + terminology batch-verify + wire eval as blocking CI (ARCH_PLAN M6). **Medium.**
10. `fhir-broker-unbuilt`, `messaging-geo-unbuilt`. **Medium.**

Cross-cutting / decide under plan:

- ~~`receipt-store-append-only-unbuilt`~~ **mock-resolved 2026-06-30** (R-17; production WORM + retention still to configure); `content-store-production-gated` (**Medium**, new — synthetic-only until persistence Critical); `session-persistence-unenforced` (**Critical**); ~~`context-graph-orphan` + `patient-knowledge-graph-orphan`~~ **reclassified 2026-06-30** (not dead-ends — contracted schemas awaiting the knowledge-server producer; tracked under `knowledge-server-unbuilt`); `claudemd-behind-charter` + `derived-docs-unverified` (**Low**).

---

## Promotion into gap-register (one-way)

Already represented in `gap-register.md`: pharmacology, verification portal, investigation parser, persistence, knowledge datasets, fhir-broker, messaging-geo, case-set.

**Promoted 2026-06-30 cycle (done):** `hashing-unimplemented` → R-16, `verifier-untested` → R-18, `verifier-weak-code-detection` → R-19, `receipt-store-append-only-unbuilt` → R-17.

**Promoted M0 2026-07-03 cycle (done):** `routing-plan-next-trunks-dead-end` → R-24 (High), `mode-leakage-enforcelive` → R-25 (High), `context-injection-allowlist` → R-26 (High). Also mirrored: `case-set-underpopulated` → R-23 (Medium — mirrored to fix the dangling `gap-case-set` link, not a threshold promotion). Moves noted in `CHANGELOG.md`.

**Promoted H5 2026-07-07 cycle (done):** `tooluniverse-gateway` → R-30 (High). Moves noted in `CHANGELOG.md`.

*Source of truth: this register + the live scan. Derived quick-reference: `.claude/completeness-index.md`.*
