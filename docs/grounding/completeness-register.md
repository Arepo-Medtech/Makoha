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

**H4 scoped re-scan** _(2026-07-06, FLOW_PLAN milestone H4 — Case factory)_ — **Case-count reconciled: the M0 line below ("52 cases") is STALE.** The live tree now holds **303 case dirs** (302 before H4 + 1 admitted this milestone): 301 ingested-with-manifest + the manifest-less reference `SPEC-CARD-04-00001`. Raw difficulty bands 01=148 / (02+03+04)=134 / (05+06+07)=21 ≈ **49 / 44 / 7**; only ~52 are clinician-attested (the *trusted* set), the rest `clinician_reviewed:false`. Built the case factory: three generators (synthea #dir, synthea-au #fork, chatty-notes #sib) **re-verified Apache-2.0 + pinned**, wrapped as **out-of-process CLI seams** (`case-factory/{synthea,synthea-au,narratives}/`, no Java vendored, fail-safe input-gated); the **shaper** `case-factory/to-casebundle.js` + **completion** `complete-scoring-nodes.js` (two-phase, CONTRACT §5) emit a contract-valid `.casebundle.json` that flows **through** the existing `cases:ingest` (firewall + `--reseq` + honesty gate untouched). Proven by `test/contract-case-factory.js` (0 problems/0 leaks; AU Core conformant; `synthetic:true`; `clinician_reviewed:false`; firewall fail-closed; never writes `data/cases/` directly; never reads a sealed 10–13 node). CONTRACT §6 drift corrected (`files[].node`→`path`, the tool's key). Demo case admitted (`SPEC-CARD-06-00000`, unreviewed) lifting complex band 20→21 (raw only — excluded from the trusted set until attested). New findings: `case-factory-shaper` (PARTIAL), `synthea-generators-input-gated` (input-gated, Medium). C22 unsettled (target 0.3.0 vs vendored 2.0.1-ci — flagged, not picked). **No BLIND_STUB/DEAD_END opened**: generators are producers with a fixture+contract-test consumer; bundles route only through ingest; scoring nodes 10–13 never opened. 27 suites + verification + trunk:stub:all + licence:check + eval:cases + bench:mirage green.

**H5 scoped re-scan** _(2026-07-07, FLOW_PLAN milestone H5 — Capability expansion: ToolUniverse)_ — Wrapped #28 mims-harvard/ToolUniverse (Apache-2.0, re-verified on-repo at v1.3.1) as `mcp/servers/tooluniverse-gateway/` in COMPACT-MODE (≤5 core tools; `execute_tool(name,args)→{result,receipt}`), the highest security surface in the harvest. **Executor DISABLED + proven UNREACHABLE, not just flagged.** An adversarial full-codebase security sub-agent (one at a time, per the rule) confirmed a 3-name deny-list is INSUFFICIENT — ToolUniverse v1.3.1 ships **2620 tools** including `MCPAutoLoaderTool` (spawns other MCP servers), `AgenticTool`/`SmolAgentTool`/`CallAgent`, `ComposeTool`/`*Pipeline`/`ToolGraph*`, `Replicate_run_prediction`, and the meta `ExecuteTool` that execute code indirectly or run autonomous loops and bypass a name blocklist (verified against the pinned source). Reworked to **DEFAULT-DENY**: `executeTool` forwards ONLY vetted retrieval tools; executors + the agentic/loader/compose families (`isHardDeniedTool`) + any un-vetted/unknown name are refused BEFORE any subprocess forward — the injected `forward` spy is asserted never-called even with valid auth on a live context AND the name force-added to the allow-list. Config layer: `compact_mode`+`exclude_tools` (launch-spec, pure, asserted to always carry the full executor+family exclude set). Own auth (no unauthenticated path; token = secrets-manager ref). **Egress allow-list now ENFORCED on the forward path** (review F2: it was previously imported by nothing but its test) — bounded to declared upstream hosts, default-deny. dev/mock **never** forwards to a real subprocess (review F3: no live-as-mock mislabel). Mode default normalised (review F4). Pinned **v1.3.1 `9b7ff91d`** ≥ RCE floor v1.3.0, enforced by `licence:check` **BLOCK 5** (semver-gte). MedLog #org **STUDIED** for the audit pattern only — NO WORM built, `verification/audit-store.js` UNTOUCHED (ARCH M8 seam already exists). NEW: `tooluniverse-gateway` (PARTIAL — mock/fixture built + contract-tested; live input-gated), `tooluniverse-runtime-input-gated` (PARTIAL, Medium). **No BLIND_STUB/DEAD_END opened**: the gateway is a producer with a contract-test consumer; retrieval tools MIRAGE-gated (`patient_eligible:false`); runtime absent → fail-safe `{available:false}` (never fabricated); no case node (10–13) ever opened. 28 suites + licence:check (BLOCK 5 armed) + verification + eval:cases + bench:mirage + trunk:stub:all green.

**H6 scoped re-scan** _(2026-07-07, FLOW_PLAN milestone H6 — Reasoning topology, D-1 owner-ruled)_ — **D-1 RULED by the operator 2026-07-07: KEEP the tested trunk spine + verifier (ARCH_PLAN RETAIN); LIFT octochains' parallel-expert conflict-audit PATTERN as a trust mechanism; NO new/forked orchestrator.** Built `verification/conflict-audit.js` as a **FIRST-PARTY clean-room** implementation of the published parallel-expert-consensus methodology — #5 ahmadvh/octochains' licence is PENDING, so its code was **not wrapped/vendored/forked/copied — or read** (H3 #20 + H1 fasten-sources precedents); #5 flipped to REFERENCE·methodology-only in the manifest with `target_module` nulled so the first-party file can never read as a harvest target (licence gate BLOCK 2/3 no longer walk the row; `licence:check` 0 blocks). The mechanism: `runConflictAudit(opinions)` (pure, deterministic, zod-`.strict()` in/out, sha256 input-derived `audit_id`) surfaces per-topic agreement/conflict/single-source across N independent expert opinions, over-flagging on any residual difference after conservative normalisation; `attachConflictAudit()` is **ADDITIVE-ONLY, NOT A GATE** — `pass`/`results[]`(=the 5 checks)/`candidate_output_hash` pass through VERBATIM (cannot flip fail→pass OR pass→fail), `missing_receipts` is append-only surfacing, the structured record rides the in-memory `conflict_audit` field (integrity-detectors channel), and firewall fields are never touched — **HARD_FAIL/BLOCKED_NO_PROOF override impossible by construction** (proven against real Trunk 8.0 pipeline runs). **verifier.js, trunk-sequencer.js halt logic, and pipeline.js UNTOUCHED** (verify() asserted bit-identical). #3/#2 read as design references (README prose only, no code — both licence-pending); #4 not read (demo-grade). NEW: `conflict-audit-trust-signal` (COMPLETE). **No BLIND_STUB/DEAD_END opened**: the module is a trust artifact with a contract-test consumer (session-store precedent); wiring a real multi-expert producer + any gate/halt semantics on the signal is future plan-gated work. 29 suites + licence:check + verification + trunk:stub:all + eval:cases + bench:mirage green.

**H7 scoped re-scan** _(2026-07-07, FLOW_PLAN milestone H7 — Governance wiring; LAST FLOW milestone)_ — Wired every harvested path (H1 record-spine, H2 evidence #14/#15/#1, H3 MIRAGE-gated retrieval, H4 case-factory, H5 tooluniverse-gateway) to the EXISTING M5 portal gate. NEW `portal/harvested-release.js` — one fail-closed seam `releaseHarvestedOutput(pathId, output)` (default-deny unknown path; computes `hashCandidateOutput`; defers wholly to `releaseToPatient()`; never sets `patient_eligible`). Each adapter gained one thin `governedRelease(output)` export. Five `test/contract-governance-*.js` (via a shared `governance-path-contract.js` runner) prove per path: CLOSED without an attested `VerificationGateRecord`; dev-mode refuses even WITH a record; opens ONLY with a **synthetic** attested record on the EXACT `candidate_output_hash`; altered output refuses; **no `patient_eligible:true` flip**; and the audit ledger (C5) records a harvested-path run **metadata-only / PHI-free** (isolated temp ledger; unknown/PHI fields dropped; `.strict()` refuses PHI; `verifyChain()` intact). **RETAIN core BYTE-UNCHANGED** (`portal/verification-gate.js`, `verification/audit-store.js`, `verifier.js` — `git diff --stat` empty; confirmed by an adversarial full-codebase release-gating review — no bypass, all six claims CONFIRMED-SAFE). H6's `conflict_flagged` NOT wired into any release decision (future plan-gated). NEW: `governance-wiring-harvested-paths` (COMPLETE). **NO patient path opened; nothing flipped `patient_eligible:true`; gate stays fail-closed by design.** Four-part patient-eligibility precondition (MIRAGE-passed H3 + governance-gated H7 + corpus attested §7 + real Portal UI record M5-remainder) — H7 delivers exactly one (governance). 34 suites (29 + 5 governance) + licence:check + verification + trunk:stub:all + eval:cases + bench:mirage green.

**PPP-TTT scoped re-scan** _(2026-07-11, PPP-TTT Step 1 — graded triage GO/CAUTION/STOP; plan `.planning/PPP-TTT-PLAN.md`)_ — Built `verification/ppp-ttt/` as a **pure, additive, monotone-AND** layer over the existing pipeline (H2 detector lineage): Step-1 veracity interrogation grades raised flags against the clinician-attested `scope-registry.json` v1.3.0 discriminators (deterministic IDs `uhao-N` / `<condition>-cs-N` / `<condition>-refer-1`; read-only, sha256-pinned dataset receipt); CAUTION (the only new runtime state — stigmata attested-absent + stable refer_if form present) runs the fixed ABCDE protocol; **every default-deny branch (unknown/unanswered discriminator, off-registry, managed-only, unattested/TBD, registry drift, module error, malformed input) fails closed to STOP** — gradeConcern cannot throw. `composeTriage()` mirrors `combineVerification()` exactly: `results[]` = the 5 verifier checks untouched, `pass` = AND (STOP ⇒ false, never rescues), tier = ordinal max (never downgrades), STOP reasons carry the literal `escalate_now` token so the UNTOUCHED sequencer halts via its existing rules (Seam B). ABCDE record is self-describing (`_pppTtt` header, `urn:au:digital-tablet`/`ppp-ttt-v1` tag, LOINC sections PROVEN from the pinned omnibus, never minted) and rides the AUDIT CHANNEL only — the ContextPacket is contract-tested byte-identical with/without flags. Parallel PHI-free hash-chained ledger (`ppp-ttt-ledger.jsonl`, own strict schema, cross-linked to the main ledger by `{run_id, candidate_output_hash}`; audit-store.js untouched). **RETAIN core BYTE-UNCHANGED and now PINNED in CI**: `test/contract-ppp-ttt-monotone.js` asserts the sha256 of `verifier.js` / `portal/verification-gate.js` / `audit-store.js` — the first mechanical byte-unchanged gate. Nothing sets the patient-eligibility flag (statically asserted); no scoring-node (10–13) read path (statically asserted); E-PP potestative choice bounded to CAUTION, `subordinate_to_signoff` schema-literal true; decline → refer (no autonomous continuation). NEW: `ppp-ttt-graded-triage` (COMPLETE, Medium). **No BLIND_STUB/DEAD_END opened**: the module has a real producer seam (pipeline `raised_flags`) + contract-test and audit consumers; the Step-3 patient-facing surface stays behind the mock/portal gates (plan §10). 40 suites (37 + 3 PPP-TTT) + licence:check + verification + trunk:stub:all + eval:cases + bench:mirage + npm audit green.

**LIVE readiness scan** _(2026-07-11, `.planning/LIVE_PLAN.md` Phase 0 — operator APPROVED the master plan + commencement of L1/L2 the same day)_ — Scanned the tree for what public release / live execution requires beyond the open register items. The safety core (pipeline, verifier, detectors, PPP-TTT, firewalls, both ledgers, portal gate) is built and fail-closed; what is ABSENT is the product around it: **no deployment/runtime story** (CI is test-only; no entrypoint/Dockerfile/IaC), **no live LLM Step-4 adapter** (generation is stub agents by design — the model has never been in the loop), **no patient/pharmacist product surface**, **no secrets-manager integration**, **no metrics/alarms**, **no production WORM adapter** (M8 seam only), **no consent capture**, **SAST/secret-scanning absent from CI**, sequencer default-OFF, PPP-TTT ledger unwired from the report writers, and the TGA SaMD classification unresolved (org decision — `regulatory_confirmation_exempt_cdss` is a scope-activation-gate condition). Eleven new items registered below (LIVE-PLAN §0.1); the nine High/Critical promoted one-way into the gap-register (R-32…R-40). Build order for remaining work now follows LIVE_PLAN §2 (extends Part D.11). **No BLIND_STUB or DEAD_END on the L1/L2 path** — every named absence degrades to refusal/BLOCKED, none presents mock as live.

**M0 scoped re-scan** _(2026-07-03, ARCH_PLAN milestone M0)_ — _(case count SUPERSEDED by the H4 line above — 303 as of 2026-07-06.)_ Case set is now **52 cases** (47 difficulty-01 / 5 difficulty-04 incl. reference `SPEC-CARD-04-00001`; 51 clinician-attested AUC bundles, bulk attestation reviewer KL 2026-07-02) — `case-set-underpopulated` row updated (C18/F15 closed). New findings registered: `routing-plan-next-trunks-dead-end` (DEAD_END-1, High), `mode-leakage-enforcelive` (C16/F4, High), `context-injection-allowlist` (recorded in-register — previously index-only — High), `case-dir-duplicate-files` (Medium), `repo-digest-sealed-node-carveout` (Low). Firewall line superseded: JS now reads `data/cases` via `scripts/ingest-case-bundles.mjs` (field-scoped firewall, contract-tested), `scripts/export-repo-digest.mjs` (documented engineering carve-out), `scripts/build-case-transformation-kit.mjs` (schemas only) and `test/contract-case-ingest.js` — **none routes `10`–`13` content into any trunk/packet path; firewall NOT breached.**

---

## CRITICAL

```md
- id: live-llm-generation-adapter-unbuilt
  path: integration/llm-adapter.js · verification/pipeline.js (Step-4 hook, additive) · test/contract-llm-adapter.js
  component_type: other (generation adapter)
  state: PARTIAL
  evidence: L3 BUILD 2026-07-11 — the gated Step-4 client exists and is contract-proven. PACKET-ONLY BAR is mechanical and default-deny: generateCandidate() re-gates through the strict validateContextPacket zod contract and serialises exactly the parsed object; a smuggled extra field REFUSES generation before any transport call (proven with a spy transport). FAIL-CLOSED: invalid packet, missing trunk prompt, live-without-key, API error/timeout, safety refusal (stop_reason "refusal"), empty output, and max_tokens truncation all → BLOCKED_NO_PROOF; the pipeline turns that into continuation_blocked + an explicit blocked candidate (never fabricated). MOCK BY DEFAULT: HEYDOC_LLM_LIVE AND a secrets-seam key (placeholders refuse) both required for live; mock is audited mode:"mock" (never presented as live). AUDIT: model id (pinned default claude-opus-4-8, adaptive thinking) + prompt_sha256 (the exact bytes shown to the model) + latency ride result.generation. E2E: a clean grounded fake-live output passes the full composed gate; a dose-leaking generated output is blocked by the detectors; no-hook runs are byte-identical status quo. Dependency @anthropic-ai/sdk ^0.111.0 (MIT) adopted at its LIVE_PLAN §7 gate; npm audit 0.
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
  path: (absent) patient consult app + pharmacist console/API layer
  component_type: other (product surface)
  state: UNBUILT
  evidence: LIVE scan 2026-07-11 — no frontend/API anywhere in the tree; the consult loop exists only as stub agents + the pipeline harness. L1 portal server is the first surface (pharmacist console); the patient side (incl. PPP-TTT Step-3 E-PP screen) is unbuilt.
  blocks: public release; PPP-TTT Step 3; L14
  safety_class: none
  invariant_exposure: every patient-visible output MUST flow through releaseToPatient() — no side channel
  risk: Critical
  blocks_patient_facing: true
  build_action: LIVE_PLAN L11 (needs L1–L4; content gated by L5–L9).
  gap_register_link: R-33
  status: open
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
  path: mcp/servers/pharmacology/{index.js,schemas.js,mock-data.json}, test/contract-pharmacology.js, mcp/mcpServers.template.json
  component_type: mcp-server
  state: PARTIAL
  evidence: MOCK CORE + FIREWALL WIRED 2026-06-30 — deterministic engine (engine.js, all 5 checks) shared by the MCP server and the in-process firewall; dose_guidance ONLY here and ONLY on PASS/WARN, never on HARD_FAIL/BLOCKED/paediatric; HARD_FAIL terminal; paediatric→flag, no dose; facts-absent→BLOCKED_NO_PROOF; receipt mode=mock. Wired behind Trunk 8.0 (verification/pipeline.js): firewall_status gates continuation, HARD_FAIL blocks continuation with NO override path and is receipt-backed (verifier check 5 distinguishes legitimate vs invented hard-stops); grounding-pass kept separate. Contract-tested (contract-pharmacology + contract-firewall). PARTIAL: live vendor only.
  blocks: (mock core + firewall cleared) — only live vendor connection remains
  safety_class: can_emit_fabrication
  invariant_exposure: no-autonomous-prescription (doses only here) + no-HARD_FAIL-override — both now enforced mechanically
  risk: Critical
  blocks_patient_facing: true
  build_action: REMAINING — connect live vendor (MIMS-AU/SafeScript) in staging (Appendix A Phase 4) with synthetic-case validation before any patient-facing use. Mock data must never reach patient-facing.
  gap_register_link: R-22
  status: in-progress
  last_scanned: 2026-06-30
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
  evidence: OPENED 2026-06-30 — 8 analytes, adult sex-agnostic, explicitly DEV/SYNTHETIC-ONLY and NOT clinically authoritative. Banner in the dataset; sign-off not obtained.
  blocks: patient-facing use of the investigation parser
  safety_class: degrades_safe (marked non-authoritative; mock/dev only)
  invariant_exposure: clinical-safety (ranges must be clinically validated before live)
  risk: High
  blocks_patient_facing: true
  build_action: obtain clinical + regulatory sign-off on authoritative AU reference ranges (sex/age-specific); expand analyte coverage; version + checksum. Until then, parser is dev/synthetic-only.
  gap_register_link: R-21
  status: open
  last_scanned: 2026-06-30
```

```md
- id: clinician-verification-portal-unbuilt
  path: portal/{verification-gate.js (frozen), server.js, review-bundle.js, gate-record-store.js} + mcp/schemas/{verification-portal-decision,portal-review-bundle}.schema.json
  component_type: other
  state: PARTIAL
  evidence: GATE BUILT 2026-07-03 (M5); **UI/WORKFLOW + DURABLE RECORDS BUILT 2026-07-11 (LIVE_PLAN L1)** — portal/server.js is the dependency-free (node:http, server-rendered) clinician review console: queue (live submitForReview + ledger/content-store items), review workspace rendering the schema-gated ReviewBundle (exact output bytes, five checks + surfaced detector/triage findings, receipts, evidence claims, firewall status, PPP-TTT verdict + ABCDE record, safety-net), and the decision form (approve/reject/amend + signature_ref). ReviewBundle (portal/review-bundle.js + portal-review-bundle.schema.json) hashes WHAT THE REVIEWER WAS SHOWN (bundle_sha256, tamper-evident). portal/gate-record-store.js persists decisions DURABLE-FIRST to an append-only hash-chained trail (gate-records.jsonl; substrate seam mirrors M8 — non-local unregistered REFUSES) recording bundle_sha256 per decision, then hydrates the FROZEN gate's in-memory registry (idempotent replay across restarts). Auth fail-closed: a live-enforced portal refuses to start without HEYDOC_PORTAL_TOKEN (via the L2 secrets seam); bearer required on every console route. verification-gate.js BYTE-UNCHANGED (CI-pinned). Proven end-to-end by test/contract-portal-review.js: decision→durable chain→hydrate→releaseToPatient round-trip (mock refuses even approved; live releases ONLY exact attested bytes; amend switches to amended text; reject kills; tamper breaks chain; XSS escaped; 401 without token; no patient_eligible reference).
  blocks: patient-facing readiness — REMAINING: WORM substrate registration for gate records (R-39, operator backend choice), authenticated clinician identity federation (deploy/L11), and the patient path itself (none exists, correctly)
  safety_class: degrades_safe (fail-closed; dev modes never release; portal never sends — it permits the gate to permit)
  invariant_exposure: prime_directive human-in-the-loop — now mechanically enforceable AND operable at the release boundary
  risk: Critical
  blocks_patient_facing: true
  build_action: register the WORM adapter for gate records at deploy (R-39); wire real clinician identity/signature federation; keep every future patient path calling releaseToPatient() (adoption rule, portal/README.md).
  gap_register_link: gap-verification-portal
  status: open (gate + UI/workflow + durable chained storage resolved; WORM registration + identity federation remain)
  last_scanned: 2026-07-11
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
  path: Dockerfile · .dockerignore · docker-compose.yml · deploy/{README.md,register-substrates.example.mjs} · portal/server.js startPortal() (entrypoint) · npm run portal
  component_type: other (runtime/deploy)
  state: PARTIAL
  evidence: L2 BUILD 2026-07-11 — runtime image (node:20-alpine, npm ci lockfile-only, mock default, HEYDOC_DATA_DIR volume so ledgers outlive containers), compose (portal role; staging must supply HEYDOC_PORTAL_TOKEN — fail-closed startup), deploy bootstrap example (registers WORM + gate-record + secrets backends BEFORE server start; example.invalid placeholders that the secrets seam refuses). Was: nothing in the tree could run as a deployed service.
  blocks: L14 — REMAINING: cloud account/target + staging deploy CI job (operator input); production infra
  safety_class: none
  invariant_exposure: none — three-environment one-way promotion is config-enforced (mode.js mapping + compose defaults)
  risk: High
  blocks_patient_facing: false
  build_action: REMAINING — operator supplies cloud target; add the staging deploy job; wire the deploy bootstrap against real backends.
  gap_register_link: R-35
  status: open (runtime + config built; cloud deploy input-gated)
  last_scanned: 2026-07-11
```

```md
- id: secrets-manager-integration-unbuilt
  path: integration/secrets.js
  component_type: other (secrets)
  state: PARTIAL
  evidence: L2 BUILD 2026-07-11 — fail-closed resolver seam built + contract-tested (test/contract-live-ops.js): refs are "<scheme>:<name>"; env backend is the dev/CI default; an UNREGISTERED scheme REFUSES (no silent fallback); missing/empty values REFUSE; `example.invalid` placeholder values REFUSE (a template placeholder is never a credential); values never logged. Portal auth resolves through it.
  blocks: live credentialed connects (L3, L5–L8) — REMAINING: the real secrets-manager backend registered at deploy (operator infra) + rotation policy
  safety_class: none
  invariant_exposure: security_and_secrets — enforced mechanically at the seam
  risk: High
  blocks_patient_facing: false
  build_action: REMAINING — deploy registers the real backend (deploy/register-substrates.example.mjs shape); rotation policy = operator infra.
  gap_register_link: R-36
  status: open (seam built; real backend deploy-gated)
  last_scanned: 2026-07-11
```

```md
- id: observability-metrics-unbuilt
  path: verification/metrics.js · portal /metrics endpoint · both report writers
  component_type: other (observability)
  state: PARTIAL
  evidence: L2 BUILD 2026-07-11 — charter metrics built + contract-tested: counters (runs/pass/fail, HARD_FAIL, BLOCKED_NO_PROOF, PPP-TTT GO/CAUTION/STOP) with derived rates, recorded by BOTH report writers (observability only — never a gate change); alarm seam (onAlarm subscribers + structured stderr line, never throws) — HARD_FAIL raises pharmacology_hard_fail; critical_under_triage channel exposed for the evaluation layer; /metrics JSON on the portal (auth-gated). PPP-TTT STOP deliberately counted, not paged (over-triage is the system working).
  blocks: L14 alarm drills — REMAINING: dashboards/pager wiring (deploy infra); under-triage alarm CALL SITE in the eval gate (L10)
  safety_class: none
  invariant_exposure: observability_and_audit
  risk: High
  blocks_patient_facing: false
  build_action: REMAINING — deploy wires onAlarm to the pager; L10 calls raiseAlarm("critical_under_triage") from eval-case-gate on any critical under-triage.
  gap_register_link: R-37
  status: open (counters + alarm seam built; pager/dashboards deploy-gated)
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
  path: verification/audit-store.js registerAuditSubstrate() (seam only) · portal gate records · ppp-ttt ledger
  component_type: repository-store
  state: UNBUILT
  evidence: LIVE scan 2026-07-11 — the M8 seam exists and refuses unregistered non-local substrates; no production WORM adapter (S3 Object Lock / immudb / operator choice) implemented for the main ledger, the PPP-TTT ledger, or gate records; retention unset. L1 (same day) added the matching two-op seam for gate records (registerGateRecordSubstrate, same refuse-if-unregistered semantics) and deploy/register-substrates.example.mjs documents the boot wiring — the seams are ready; only the adapter (backend choice) is missing.
  blocks: production medicolegal storage; L14
  safety_class: none (seam fail-closed)
  invariant_exposure: observability_and_audit (append-only, tamper-evident, retention)
  risk: High
  blocks_patient_facing: true
  build_action: LIVE_PLAN L2 — adapter for the operator-chosen backend + HEYDOC_AUDIT_RETENTION (minimum-keep) + verify:rehash --integrity against it in staging. Backend choice + retention period = operator input.
  gap_register_link: R-39
  status: open
  last_scanned: 2026-07-11
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
  path: (absent) consent capture/record mechanism
  component_type: other (consent)
  state: UNBUILT
  evidence: LIVE scan 2026-07-11 — "no persistence beyond session without explicit consent" is enforced negatively (session-store destroys; content store synthetic-only) but no mechanism exists to CAPTURE and RECORD a consent (omnibus Consent conventions unused at runtime).
  blocks: any consented persistence; L11 product flows; L12
  safety_class: none (absence = nothing persists, the safe direction)
  invariant_exposure: data_handling / Privacy Act APP
  risk: High
  blocks_patient_facing: true
  build_action: LIVE_PLAN L12 — consent record schema + capture flow + APP mapping doc.
  gap_register_link: R-40
  status: open
  last_scanned: 2026-07-11
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
  evidence: BUILT 2026-07-06 (FLOW_PLAN H2, #14 Cicatriiz/healthcare-mcp-public, MIT, pinned 1c4c40c3). Mock-core MCP server exposing evidence_search(query, filters?) -> { results[], receipt } over FDA/PubMed/ClinicalTrials/ICD-10 canned literature; each result maps onto the EXISTING evidence-node.schema.json (NO churn) via _shared/evidence-map.js toEvidenceNode (supports[].kind="live_data_receipt", ref=receipt.request_id). Common Receipt emitted; the receipt.schema.json `server` enum (7 servers only) is deliberately OMITTED, self-id via upstream. live-backend.js is an input-gated adapter seam to the external pinned #14 process (no vendored code); mock is default+rollback; a live context with no endpoint BLOCKS (mock-never-as-live, C16). Contract-tested (Receipt shape, EvidenceNode conformance via ajv, ref==request_id grounding, filter, patient_eligible:false). PARTIAL: live external process + API keys (input-gated) and the H3 MIRAGE gate before any patient use.
  blocks: nothing on the H2 path; patient use blocked by H3 MIRAGE + governance (by design)
  safety_class: degrades_safe (mock default; blocks in live w/o endpoint; never presents mock as live)
  invariant_exposure: evidence-verified-trust (patient_eligible:false until MIRAGE); no-fabricated-facts (verifier applies unchanged)
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — connect the external pinned #14 process + keys via secrets manager + egress allow-list; then H3 MIRAGE-gate before patient_eligible. Optional: wire evidence_search into the pipeline retrieval path (a future gated step) — today the consumer is the contract test.
  gap_register_link: R-27
  status: in-progress
  last_scanned: 2026-07-06
```

```md
- id: evidence-drug-guideline-server
  path: mcp/servers/evidence-drug-guideline/{index.js,live-backend.js}, mcp/servers/_shared/evidence-map.js, test/contract-evidence-drug-guideline.js
  component_type: mcp-server
  state: PARTIAL
  evidence: BUILT 2026-07-06 (FLOW_PLAN H2, #15 JamesANZ/medical-mcp, MIT, pinned 13d2fddd) — ADVISORY ONLY. Mock-core evidence_search over drug-interaction/paediatric/guideline advisory evidence; each result maps to a conformant EvidenceNode. THE NO-DOSE STRUCTURAL BAR (G9 / §1 dose-source-singular), three fail-closed layers: (1) AdvisoryResultSchema is z.strict() with advisory:true REQUIRED and NO dose/dosage/strength/frequency field EXPRESSIBLE; (2) assertNoDose() throws on any dose-shaped key anywhere in a result OR its EvidenceNode before serialisation; (3) claims are advisory-framed, no dose value placed in a readable field. The pharmacology firewall (Trunk 8.0 PharmCheck) + verifier check 5 remain the ONLY dose source. Contract-tested ADVERSARIALLY (every result advisory:true; whole-payload has no dose-shaped key; assertNoDose throws on {dose},{dosage_mg},{max_dose},{frequency}; EvidenceNode conformant; patient_eligible:false). live-backend.js input-gated seam (any future live path MUST pass buildAdvisoryResponse -> schema + assertNoDose). Mock default+rollback; blocks in live w/o endpoint.
  blocks: nothing on the H2 path; patient use blocked by H3 MIRAGE + governance
  safety_class: degrades_safe (advisory; structurally barred from a dose; mock default)
  invariant_exposure: dose-source-singular (G9) — enforced structurally; no-fabricated-facts; evidence-verified-trust
  risk: Medium
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — connect external pinned #15 process + keys; H3 MIRAGE-gate before patient_eligible. The no-dose bar holds on mock and any future live path.
  gap_register_link: R-27
  status: in-progress
  last_scanned: 2026-07-06
```

```md
- id: docs-override-live
  path: mcp/servers/docs/{index.js,live-backend.js}, test/contract-docs.js
  component_type: mcp-server
  state: PARTIAL
  evidence: BUILT 2026-07-06 (FLOW_PLAN H2, #1 anthropics/healthcare, first_party, pinned dff06a1b). OVERRIDE not rebuild: docs/live-backend.js is the input-gated adapter seam to the #1 PubMed/FHIR-dev backend AND the harvest MARKER the licence gate keys off (override_existing_targets "mcp/servers/docs" -> live-backend.js). index.js gained a shared docsLiveGuard() that diverts ONLY when the context normalises to live (blocked w/o endpoint, fail-safe live otherwise); the mock/dry_run docs_search/docs_get/docs_cite behaviour + receipt shape are preserved VERBATIM — contract-docs.js stays green unchanged. patient_eligible:false pending H3. H3 CARRY-FORWARD 2026-07-06: the docs_search MOCK branch is now a deterministic keyword retriever (matchSnippets — exact content-token overlap >= 2 over title/excerpt/source_id) that ABSTAINS (results: []) on a no-match query instead of echoing canned citations; docs_get/docs_cite/dry_run/live-guard untouched, contract-docs.js still green. MIRAGE #1 now passes the N (abstain) partition on mock (diagnostic: P 2/2, N 2/2, A 1/1, would_pass_if_attested:true); still patient_eligible:false (unattested corpus §7 + H7).
  blocks: nothing; live docs retrieval input-gated + MIRAGE-gated
  safety_class: degrades_safe (mock default preserved; blocks in live w/o endpoint)
  invariant_exposure: mock-never-as-live (C16); evidence-verified-trust
  risk: Low
  blocks_patient_facing: false
  build_action: REMAINING (input-gated) — connect the #1 backend + creds; H3 MIRAGE-gate. evidence-cms/ (US CMS/NPI) deliberately NOT built at H2 (low AU priority) — see evidence-cms-deferred.
  gap_register_link: R-27
  status: in-progress
  last_scanned: 2026-07-06
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

## MEDIUM

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
- id: knowledge-datasets-provisional
  path: mcp/servers/knowledge/data/*.json
  component_type: dataset
  state: PARTIAL
  evidence: OPENED 2026-06-30 — benign registry / Axis B templates / red-flag bank are DEV/SYNTHETIC-ONLY, not clinically authoritative (banners in each file). Sign-off not obtained.
  blocks: patient-facing use of Trunk 5.0/7.0/9.0 curated content
  safety_class: degrades_safe (marked non-authoritative; mock/dev only)
  invariant_exposure: clinical-safety (curated clinical content must be validated before live)
  risk: High
  blocks_patient_facing: true
  build_action: clinical + regulatory sign-off on authoritative content (benign criteria, must-not-miss differentials, red-flag tiers); expand coverage; version + checksum.
  gap_register_link: gap-knowledge-datasets
  status: open
  last_scanned: 2026-06-30
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
- id: case-set-underpopulated
  path: data/cases/ (52 case directories; 51 manifest-conforming + reference)
  component_type: dataset
  state: PARTIAL
  evidence: M6 2026-07-03 — receipts + gate DONE; atypical top-up INGESTED (pending attestation); complex + attestation remain. (1) **All 336 candidate codes across the 101 manifest-bearing cases receipted** via `cases:verify-codes` (per-code receipt; status unverified_pending_terminology_receipt → **mock_verified_pending_live_ncts**; honest — mock echoes bind, live NCTS revalidates at M11/F5; mode:"mock" blocks them as proof in any live context; idempotent). (2) **Deterministic eval gate CI-BLOCKING** (`eval:cases`): ≥45 attested conforming (51 PASS); per-file sha256 integrity (re-asserts ingest schema+firewall without parsing sealed nodes); 00/01/02 schema-valid; all codes receipted; attestation required to count. (3) **ATYPICAL TOP-UP INGESTED 2026-07-03** — 50 new AMS (Autoimmune Mild Severity) casebundles ingested from operator-supplied source (`.../Autoimmune Mild Severity/.../AMS Ingest Cases`): 1 tier-02 + 37 tier-03 + 12 tier-04, new specialties RHEUM/HAEMAT, all firewall+schema clean (OK_DRY_RUN 50/50, 0 collisions). Distribution moved **88/12/0 → 45/55/0**; difficulty-tier coverage 2 → **4 tiers** (minimum 3 CLEARED); specialties 17 → 19. The 50 were ATTESTED 2026-07-04 (operator KL, written in-session; bulk_clinician_attestation in each manifest review block — node files + sha256 untouched). (4) **CVD (Cardiovascular) batch ingested 2026-07-04** — 49 of 50 operator-supplied CVD bundles (1 skipped: id collision, see `case-id-cross-series-collision`): brings the first COMPLEX-tier cases (5 × rare_condition, tier 05) and the 3rd diagnosis category (`zebra_rare`). 373 codes receipted (store total 709). Distribution now **68 straightforward / 77 atypical / 5 complex = 45/51/3**; **coverage 5 tiers · 3 diagnosis categories · 19 specialties — the 3-category + 3-tier minimums CLEARED**. The 49 CVD + the re-id'd AFib case (SPEC-CARD-01-00099) were ATTESTED 2026-07-04 (operator KL) → 151/151 attested. (5) **CIA (Common Infections & Afflictions) batch 2026-07-04** — 43 of 50 operator-supplied CIA bundles ingested (all straightforward/tier-01; 47 common + 3 important_not_to_miss categories); 190 codes receipted (store total **911**). 7 NOT ingested: **3 cross-series id collisions** (Burn/Laryngitis/Aphthous-Stomatitis vs existing AUC cases — see `case-id-cross-series-collision`) and **4 FIREWALL-REFUSED** (full diagnosis name leaked into AI-Doctor-readable text — see `cia-source-firewall-leaks`). Distribution **45/51/3 → 58/40/3** (194 cases; straightforward toward 60%, atypical over-weight pulled toward 30%; complex still 3%). The 43 CIA were ATTESTED 2026-07-04 (operator KL). (6) **4 firewall-remediated CIA bundles ingested 2026-07-04** (the previously-refused DERM-01-00036/EMG-01-00037/GI-01-00027/MH-01-00044 — operator removed the diagnosis name from injectable fields; see `cia-source-firewall-leaks` → resolved); 16 codes receipted (store total **927**). 198 cases now, and the 4 remediated CIA were ATTESTED 2026-07-04 (operator KL). (7) **3 re-id'd CIA collision cases ingested 2026-07-04** (the DERM/RESP/GI collisions → -00099 per bucket; see `case-id-cross-series-collision` — all 4 instances now resolved); 13 codes receipted (store total **940**); 201 cases. Distribution 59/39/3 → **59/38/2** (3 more straightforward dilute complex). The 3 re-id'd cases were ATTESTED 2026-07-04 (operator KL). (8) **CFE (Complex Fatigue Entities) batch, operator-RE-TIERED, ingested 2026-07-04** — after an initial recon showed the batch was under-tiered (genuinely complex entities labelled tier-03), the operator re-tiered at source; 49 well-formed bundles ingested (band split of the well-formed set: 36 atypical + 14 complex — rare_condition/05 + multi_morbidity_complex/06). 345 codes receipted (store total **1285**); 250 cases. **Distribution 59/38/2 → 48/45/8 — complex band jumped 2% → 8% (near the 10% target); coverage 5 → 6 difficulty tiers.** The 49 were ATTESTED 2026-07-05 (operator KL; scope guarded to the CFE ingest commit). The CFE collision case was re-id'd → SPEC-DERM-03-00099, ingested, and ATTESTED 2026-07-05 (operator KL). **eval:cases: attested conforming 251 (≥45), 0 unreviewed, PASS; distribution 47/45/8.** NOT ingested from the CFE batch (handed back to operator): 1 well-formed collision `SPEC-DERM-03-00041` (re-id'd → SPEC-DERM-03-00099, attested) and 13 operator-retired bundles (`cfe-malformed-bundles` → resolved, deleted). (10) **DST (Dermatology & Soft Tissue) batch, operator-re-tiered, ingested 2026-07-05** — 40 well-formed new bundles (20 straightforward + 19 atypical + 1 communication_barrier/complex); 233 codes receipted (store total **1524**); 291 cases. Distribution 47/45/8 → **48/45/7**; **coverage 6 → 7 difficulty tiers** (communication_barrier/07 added). The 40 pending_clinician_review. The **10 DERM collisions were then ingested 2026-07-05 via the new `--reseq` global-seq scheme** (→ SPEC-DERM-01-00100..00106 + SPEC-DERM-03-00107..00109; `case-id-cross-series-collision` resolved); 56 codes receipted (store total **1580**); **301 cases**; distribution 48/45/7 → **49/45/7**. Still handed back: **9 malformed stub bundles** (`dst-malformed-bundles`) + stray `_probe.tmp`. The 50 DST cases (40 direct + 10 reseq'd) were ATTESTED 2026-07-05 (operator KL) → **301/301 attested, 0 unreviewed**; the 9 DST malformed stubs + `_probe.tmp` deleted (`dst-malformed-bundles` resolved). **eval:cases: attested conforming 301 (≥45), 0 unreviewed, PASS; distribution 49/45/7.** Source `.txt` never entered the repo.
  blocks: full 60/30/10 mix (complex now 8% vs 10% — nearly closed; straightforward under- / atypical over-weight remain)
  safety_class: none
  invariant_exposure: test_and_evaluation_gates
  risk: Medium
  blocks_patient_facing: false
  build_action: SOLE REMAINING (input-gated, optional/polish): further rebalance toward 60/30/10 (straightforward under-weight at 49%, complex 7%). Everything required for a usable, gated, fully-attested eval set is DONE — 301/301 cases attested, gated, receipted; collisions auto-resolve (`--reseq`); malformed/stub findings resolved.
  gap_register_link: R-23
  status: open (301/301 attested; ONLY optional distribution polish remains — no blocking work)
  last_scanned: 2026-07-05
```

```md
- id: case-id-cross-series-collision
  path: data/cases/ SPEC id scheme (SPEC-{specialty}-{difficulty}-{seq}); scripts/ingest-case-bundles.mjs
  component_type: dataset
  state: PARTIAL
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
  path: data/cases/SPEC-CARD-04-00001/ (7 node files, no case_manifest.json)
  component_type: dataset
  state: PARTIAL
  evidence: FOUND M6 2026-07-03 — the hand-built reference/worked case predates the cases:ingest manifest discipline: no case_manifest.json, so no file hashes, no codes_manifest, no attestation record in manifest form. Named-exempt in both cases:verify-codes (skip) and the eval gate (excluded from the attested count — the gate passes at 51 without it).
  blocks: nothing today (gate exempts it by name); reference-case parity with the ingest discipline
  safety_class: none
  invariant_exposure: none
  risk: Low
  blocks_patient_facing: false
  build_action: retrofit under a gated step — round-trip the reference case through the casebundle → cases:ingest path (or hand-author its manifest to the same contract: file sha256s, codes_manifest, review/attestation, firewall_assertion), then remove the named exemption from scripts/eval-case-gate.mjs.
  gap_register_link: none (Low)
  status: open
  last_scanned: 2026-07-03
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

---

## LOW

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
  path: scripts/export-repo-digest.mjs, breath-ezy-repo-digest.md (untracked at repo root; also distributed outside the repo)
  component_type: other (derived engineering artifact)
  state: PARTIAL
  evidence: M0 scan 2026-07-03 — the digest exporter deliberately embeds the reference case's sealed 10–13 nodes for engineering use, with an in-file warning (export-repo-digest.mjs ~line 84: "Do not use this context to role-play the AI Doctor"). The digest is LLM-readable context handed to planning agents. No code routes the digest into any trunk/packet path.
  blocks: nothing (documented carve-out); recorded for guard visibility
  safety_class: none in code (would be firewall_breach only if the digest were ever injected into an AI-Doctor context path)
  invariant_exposure: scoring-store firewall — carve-out is safe only while the digest stays out of every AI-Doctor context path
  risk: Low
  blocks_patient_facing: false
  build_action: keep the carve-out documented; the digest MUST never be routed into an AI-Doctor context path; add a digest-shaped fixture to the M3 context-allowlist contract test (assert default-deny rejects it).
  gap_register_link: none
  status: open
  last_scanned: 2026-07-03
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
