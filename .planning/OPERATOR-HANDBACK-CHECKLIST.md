# OPERATOR HANDBACK CHECKLIST — LIVE_PLAN §9

**Purpose:** every remaining item that cannot be closed from inside the repo — what it is, what YOU do on your side, what you hand back, and what I do with it. As of `main @ de99ab8` (PRs #35–#39 merged; LIVE_PLAN Track A complete through the product surface).

> **Reconciled 2026-07-13 to `main @ b940d94` (PRs #40–#55 merged).** Since the original baseline: B3 aws-sm backend built + JSON-tolerant (#40/#44), default model → `claude-sonnet-5` (#41), B2 App Runner deploy scaffolding built (#42), `smoke:llm` aws-sm opt-in (#43), B1 S3 Object Lock WORM adapter built (#45) + extended to the PPP-TTT ledger seam so all three medicolegal chains are WORM-coverable (#46), and the finish-line engineering wave (FL-01 consent capture #49, FL-02 MIRAGE corpus #51, FL-03 hygiene #53, **FL-42 clinician identity-federation seam #55** — see new **B5**). Remaining engineering is the ENG-half of the operator handbacks below; pure un-gated ENG work is drained. The A1 Sonnet-5 live path was validated green end-to-end on AWS (2026-07-12). Items below are amended in place; the registers remain the current-state source of truth.

---

## 0. The three handback channels (read first)

Everything below returns to me through exactly one of these. This keeps the safety boundary intact.

1. **Credential / endpoint** → you place it in the **deploy secrets manager** (or a gitignored `.env` on the deploy host). **You never paste a secret value into chat or the repo — that is a hard boundary I will not cross.** Your handback is a *confirmation + the reference name*, e.g. *"`aws.sm/heydoc/anthropic.key` is set in AWS Secrets Manager, region ap-southeast-2."* I flip the mode/flags and (if needed) wire the resolver — I never handle the value.
   - **Ready today:** the `env:` backend (`env:ANTHROPIC_API_KEY`) resolves out of the box, and **AWS Secrets Manager (`aws-sm:<SecretId>`) is now wired** (region ap-southeast-2 bootstrap in `deploy/register-substrates.example.mjs`; deploy host installs `@aws-sdk/client-secrets-manager`). Other managers (Vault, GCP) are a ~20-line resolver I add on the same seam when you name one.
   - **Not yet:** a *deployed* staging environment (item B2) — until then, exercise live smokes on a host you control with these refs set.

2. **Attestation** (a clinical / licence / regulatory sign-off) → a short written statement I record verbatim in the harvest manifest or the register, exactly like the existing scope-registry attestation (`attested_by: "KL"`). Copy-paste template:
   ```
   attested_by:  <initials>
   attestor_name: <full name>
   role:         <clinician-founder / GP / pharmacist / regulatory specialist>
   date:         <YYYY-MM-DD>
   scope:        <exactly what is cleared — the dataset / vendor / corpus / model>
   statement:    "<plain-language statement of what you are attesting>"
   ```

3. **Decision** (a pick between options) → just tell me the choice in a sentence. I wire the config/adapter/CI and, where it's a stack change, bring you a Phase-2 plan first.

For each item I mark the channel(s): **[CRED] / [ATTEST] / [DECIDE]**.

---

## A. Staging live smokes — arm code that is already built + tested

These flip already-merged, contract-tested adapters from mock to live. All run in **staging, synthetic patients only**.

### A1 — Claude live generation (R-32) · **[CRED]**
- **Blocks:** the L14 staging soak; a real end-to-end consult.
- **You do:** put `ANTHROPIC_API_KEY` in the secrets manager; set `HEYDOC_MODE_DEFAULT=staging` and `HEYDOC_LLM_LIVE=1` on the staging deploy. (Backend defaults to Claude; `HEYDOC_LLM_MODEL` overrides the pinned `claude-sonnet-5` — operator selection 2026-07-11, PR #41.)
- **Hand back:** "key set at `<ref>`, staging up."
- **Then I:** run the live smoke on synthetic packets, confirm the packet-only bar + fail-closed behaviour hold against the real API, and validate through `eval:cases`.

### A2 — MedGemma live generation (R-41) · **[CRED] + [DECIDE]**
- **Blocks:** the MedGemma backend option going live.
- **You do:** stand up a MedGemma endpoint (Vertex AI / HAI-DEF hosted / self-host vLLM/TGI / HF inference); put its key in the secrets manager; set `HEYDOC_MEDGEMMA_ENDPOINT`, `HEYDOC_MEDGEMMA_KEY`, `HEYDOC_MEDGEMMA_LIVE=1` (and `HEYDOC_LLM_BACKEND=medgemma` to select it).
- **Hand back:** the endpoint URL + key ref + **which serving shape** it exposes (OpenAI-compatible chat-completions is the built-in default; Vertex-native differs).
- **Then I:** confirm/tune the request/response shape to your endpoint, run the live smoke, validate through `eval:cases`.

### A3 — Portal authentication (part of R-33 / M5) · **[CRED]**
- **Blocks:** running the Clinician Verification Portal in a live-enforced context (it refuses to start without a token — by design).
- **You do:** put `HEYDOC_PORTAL_TOKEN` in the secrets manager for staging/production.
- **Hand back:** "token set at `<ref>`."
- **Then I:** nothing to build — the portal consumes it. (The shared token is now the coarse *transport* gate only; the attesting clinician's *identity* is separately federation-verified as of FL-42 — see **B5** for the live provider connect.)

---

## B. Infrastructure decisions + the wiring they unblock

### B1 — Production WORM substrate + retention (R-39) · **[DECIDE] + [CRED]** — ✅ **adapter BUILT (2026-07-12, PR #45); operator provisioning remains**
- **Blocks:** production medicolegal storage for both ledgers + the gate records; L14.
- **Done:** operator chose **S3 Object Lock, COMPLIANCE mode, 7-year retention**. Built `integration/audit-substrates/s3-object-lock.js` (`registerWormAudit()`) against the existing four-op / two-op seams; contract-tested (`contract-audit-worm-s3.js`); deploy-wired (Dockerfile `INSTALL_AWS_S3`, `apprunner-create.sh` `HEYDOC_WORM_*`). The PPP-TTT ledger seam follow-up is closed (PR #46): `registerPppTttLedgerSubstrate()` built and `registerWormAudit()` now covers **all three** medicolegal chains.
- **You still do:** create the Object-Lock + versioning bucket; grant the instance role `s3:PutObject/PutObjectRetention/GetObject/ListBucket`; confirm the retention period stands.
- **Hand back:** bucket name + region + "role granted."
- **Then I:** prove `verify:rehash --integrity` against it in staging.

### B2 — Cloud target + staging deploy job (R-35) · **[DECIDE] + [CRED]** — ✅ **scaffolding BUILT (2026-07-11, PR #42); operator deploy remains**
- **Blocks:** an actual, running staging environment.
- **Done:** operator chose **AWS App Runner / ap-southeast-2**. Built `deploy/bootstrap.mjs` (StartCommand: registers the aws-sm backend at boot, then starts portal|consult), `deploy/build-and-push.sh` (ECR ensure+build+push), `deploy/apprunner-create.sh`, and the B2 runbook in `deploy/README.md`.
- **You still do:** run the B2 scripts against your account (registry + service creation); confirm the service is up.
- **Hand back:** "staging service up at `<url>`."
- **Then I:** add the staging deploy CI job. (Note: App Runner storage is ephemeral — fine for synthetic staging only; B1 WORM must be registered before anything production-grade.)

### B3 — Secrets-manager backend (R-36) · **[DECIDE]** — ✅ **AWS Secrets Manager DONE (2026-07-11)**
- **Blocks:** resolving credentials from a non-env backend at deploy.
- **Done:** operator chose **AWS Secrets Manager** (region `ap-southeast-2`) and created `aws.sm/heydoc/anthropic.key`. Built `integration/secrets-backends/aws-secrets-manager.js` — fetch-at-boot → synchronous cache read on the fail-closed seam; AWS SDK dynamic-imported at deploy (NOT a repo dependency); contract-tested (`contract-secrets-aws.js`) with an injected fetcher (no SDK, no AWS call). Concrete bootstrap in `deploy/register-substrates.example.mjs` (region + `aws.sm/heydoc/anthropic.key`).
- **You still do (deploy host):** `npm install @aws-sdk/client-secrets-manager`; give the runtime role `secretsmanager:GetSecretValue` on the secret ARN; set `HEYDOC_LLM_KEY_REF=aws-sm:aws.sm/heydoc/anthropic.key` + `HEYDOC_LLM_LIVE=1` + `HEYDOC_MODE_DEFAULT=staging`.
- **⚠️ Secret format (lesson from the 2026-07-12 live smoke, PR #44):** store the API key as a **plaintext** secret, not the console-default JSON key/value object. A plaintext secret resolves verbatim; a JSON blob without a field selector is **REFUSED fail-closed** (never guessed). If you must use JSON, name the field in the ref: `aws-sm:<SecretId>#<field>`.
- **Then I:** run the live smoke (A1) — I never handle the value; the resolver fetches it on your host at boot.
- **Other managers (Vault / GCP):** name one and I add its resolver on the same seam (~20 lines).

### B4 — SAST tool (R-38) · **[DECIDE]**
- **Blocks:** the charter's "SAST in CI before any production path" (the first-party secret-scan is already blocking).
- **You do:** choose (**CodeQL** needs GitHub Advanced Security on a private repo; **semgrep** is licence/repo-flexible).
- **Hand back:** which + any licence/token in the secrets manager.
- **Then I:** wire it as a blocking CI job alongside the existing secret-scan.

### B5 — Live clinician-identity provider (FL-43; part of the Portal release blocker) · **[DECIDE] + [CRED]** — ⏳ **seam BUILT (2026-07-13, PR #55); live provider connect is yours to choose**
- **Blocks:** a live-enforced portal recording a *verified*-clinician sign-off. This is one of the two remaining pieces of the Clinician Verification Portal release blocker (the other is B1's WORM registration). **Why it matters:** without a real provider the portal refuses every decision on a live path by design — the built-in `dev` identity provider is fail-closed OUT of any live-enforced context, so a shared token alone can no longer establish *who* attested.
- **Done (mine):** `portal/identity-federation.js` — a fail-closed federation seam. `registerIdentityProvider(name, adapter)` plugs a provider in behind one contract; `resolveClinicianIdentity()` refuses a `dev`/unregistered provider under `enforce_live`; `bindSignature()` ties each signature to the verified identity + the exact output hash (no free-text signature). The verified identity is hash-chained onto the durable gate record and bound to it (`record.clinician_id` must equal the verified subject, or the append is refused). The verified identity never enters the LLM context packet. Contract-tested (`contract-portal-identity.js`). `HEYDOC_PORTAL_IDP` selects the active provider (default `dev`).
- **You DECIDE:** the **protocol + provider**:
  - **OIDC** (recommended — e.g. Okta / Entra ID / Auth0 / an AHPRA-federated broker): hand back the **issuer URL**, **client ID**, **JWKS/discovery URL**, and the **claim name that carries the AHPRA registration number** (so it lands in the medicolegal record). Client secret → secrets manager.
  - **SAML**: hand back the **IdP metadata URL/XML** + the **assertion attribute** that carries the AHPRA registration.
  - **Direct AHPRA / other**: name it and I confirm the adapter shape.
- **You DO (deploy host):** create the app/client registration with your IdP; put the client secret (and any signing cert) in the secrets manager; set `HEYDOC_PORTAL_IDP=<provider-name>` on the staging/production deploy.
- **Hand back:** the protocol + the config above (issuer/client-id/JWKS **or** SAML metadata) + the **AHPRA claim/attribute name** + "secret set at `<ref>`."
- **Then I:** write the ~1-file provider adapter behind the seam — it validates the IdP token/assertion itself and maps its verified claims to `{ subject, ahpra_registration, display_name }` — register it at deploy via `registerIdentityProvider()`, and prove end-to-end in staging that a live-enforced `/decision` records a verified, signature-bound clinician (and still refuses an unverified one). I never handle the secret value; the resolver fetches it on your host at boot, same discipline as B3.
- **⚠️ Note:** the AHPRA registration number is the medicolegal proof of *who* signed off — decide up front which IdP claim carries it, or the gate record's `ahpra_registration` will be null. No dev/mock identity is ever accepted on a live path (fail-closed), so there is no "temporary shared-login" shortcut to production.

---

## C. Track B — clinical / vendor sign-offs (the substance of "certifiable")

### C1 — Pharmacology vendor (R-22 / M9) · **[CRED] + [ATTEST]** — *release blocker #1*
- **Blocks:** patient-facing readiness for Trunk 8.0 (today HARD_FAIL runs on mock data only).
- **You do:** contract **MIMS-AU or equivalent** (NTI database, allergy cross-reactivity, drug-drug interactions, renal dosing, AU scheduling) + **SafeScript WA** for S8 PDMP; put vendor creds in the secrets manager.
- **Hand back:** vendor name + the data shape/API doc + creds ref + an **[ATTEST]** that the vendor dataset is the one cleared for clinical use.
- **Then I:** connect the vendor behind the existing pharmacology engine contract in staging (synthetic patients), re-prove HARD_FAIL is terminal on **live** data, keep paediatric flag-for-review (no tables), and validate against the case set. (Plan-gated — Appendix-A worked plan.)

### C2 — Terminology AU content + the C22 ruling (R-20 / M11) · **[CRED] + [DECIDE] + [ATTEST]**
- **Blocks:** ICD-10-AM / LOINC / PBS-AMT binding; AU Core value-set validation; live code verification.
- **You do:** choose the deployment model — **NCTS live API** (OAuth licence) **or** self-hosted **Ontoserver + SNOMED CT-AU RF2** (the RF2 is deploy-injected and **never enters the repo**); provision it; set `HEYDOC_TERMINOLOGY_ENDPOINT` + creds. Separately, **rule on C22**: the AU Core conformance target — keep the 0.3.0 pin, adopt the vendored 2.0.1-ci content, or re-target to AUCDI R3 (an org/regulatory call).
- **Hand back:** the deployment-model choice + endpoint/creds ref + confirmation the RF2 is in infra + **the C22 decision** + an **[ATTEST]** if the datasets need clinical sign-off.
- **Then I:** bind the remaining code systems, wire AU Core value-set + FHIRPath validation against live NCTS, execute whichever C22 target you rule, and re-run `cases:verify-codes` against live terminology.

### C3 — FHIR live + investigation-parser range sign-off (R-28 / R-21 / M10) · **[CRED] + [ATTEST]** — *release blocker #3*
- **Blocks:** a live lab/record source; provisional reference ranges.
- **You do:** stand up the live FHIR endpoint (`HEYDOC_FHIR_MCP_ENDPOINT`, the pinned wso2 adapter) + AU provider onboarding / SMART-on-FHIR OAuth (creds via secrets manager); obtain **authoritative reference-range sign-off** from a clinical source.
- **Hand back:** endpoint + provider/creds ref + the **[ATTEST]** reference-range sign-off (the ranges + attestor).
- **Then I:** connect the live backend in staging (synthetic patients), replace the provisional ranges with the signed-off set, re-validate the Observation→parser path (raw numbers still never reach a packet).

### C4 — Knowledge datasets sign-off (M12) · **[ATTEST]**
- **Blocks:** the benign-registry / Axis-B templates / red-flag bank going from DEV to patient-facing.
- **You do:** clinically review + sign off the three datasets.
- **Hand back:** an **[ATTEST]** per dataset (or bulk) — attestor + date + scope.
- **Then I:** flip them from DEV/provisional to signed-off, stamp the dataset version + checksums, update the register.

### C5 — MIRAGE corpus attestation (§7) · **[ATTEST]**
- **Blocks:** the retrieval-trust gate from *measuring* to *gating* — precondition #3 of the four-part patient-eligibility test.
- **You do:** clinically attest the MIRAGE corpus items (the v0.1.0 corpus is DRAFT, `attested_by:null`). I can first grow it to full partition coverage across the ACTIVE areas — say the word.
- **Hand back:** an **[ATTEST]** (bulk or per-item) for the corpus.
- **Then I:** flip the corpus from DRAFT to attested so the `bench:mirage` gate can pass a retrieval path (still necessary-not-sufficient — governance + Portal record also required).

### C6 — Case-set 60/30/10 top-up (R-23, **optional polish**) · **[CRED-ish] + [ATTEST]**
- **Blocks:** nothing (301/301 cases already attested + gated); only the difficulty distribution (currently ~49/45/7 vs 60/30/10).
- **You do:** supply more **straightforward** + **complex** source material (SOAP `.txt` via the transformation kit) + attest the new cases.
- **Hand back:** the case bundles (or source) + an **[ATTEST]**.
- **Then I:** ingest via `cases:ingest` (firewall + `--reseq`), receipt codes, and re-run `eval:cases`.

---

## D. Regulatory (organisational — with qualified specialists)

### D1 — TGA SaMD classification / CDSS-exemption ruling (R-34 / L13) · **[DECIDE]** — hard precondition of PUBLIC release
- **Blocks:** public release; the scope-activation gate for every area.
- **You do:** with qualified regulatory specialists, determine the TGA SaMD classification **or** document the clinical-decision-support exemption (`regulatory_confirmation_exempt_cdss`), plus the jurisdictional-authority + pharmacist-training confirmations named in the scope registry's activation gate.
- **Hand back:** the ruling + what evidence the submission needs (IEC 62304 lifecycle depth, ISO 14971 risk file scope).
- **Then I:** maintain the traceability spine and assemble the evidence pack — export register→62304 (requirement→design→code→test→evidence), formalise the FMEA rows into an ISO 14971 risk file, and pull the clinical-evaluation evidence from L10/L14. I surface implications; I do not decide classification.

---

## E. The finish line — what actually flips the switch

**The four patient-facing release blockers** (all must be green):
1. Pharmacology vendor live + validated — **C1** (open, needs vendor).
2. Clinician Verification Portal COMPLETE — gate + console built; remaining = **WORM gate-record storage (B1)** + clinician identity federation.
3. Investigation parser range sign-off — **C3** (open, needs sign-off + live lab).
4. Session-bound persistence — **✅ done** (enforced).

**The four-part patient-eligibility precondition** (per retrieval path — all four):
- MIRAGE gate passed (mechanism ✅) · governance-gated (✅) · **MIRAGE corpus attested — C5** · **Portal UI + durable gate-record storage — B1** + M5 remainder.

**Then L14 — the one-way promotion (plan-gated, operator-authorised):** full-stack staging soak on synthetic patients → the evaluation gates (L10 thresholds) + MIRAGE gates + WORM `verify:rehash` + alarm drills all green → a written **GO/NO-GO checklist you sign** → production. Nothing opens a patient path before that signature.

---

## F. Quick triage — smallest unblocks, biggest leverage

- **Fastest to arm (minutes, [CRED]):** A1 Claude key + A3 portal token → a live end-to-end consult rehearsal in staging.
- **Biggest single unlock ([CRED]+[ATTEST]):** C1 pharmacology vendor — it's release blocker #1 and gates all prescription-adjacent work.
- **The gate to *public* release ([DECIDE]):** D1 TGA classification — start the specialist conversation early; everything else can be green and this still holds the door.
- **No input needed from you — I can start now:** B2 staging deploy scaffolding, the verifier fuzz corpus, and (with your go-ahead) growing the MIRAGE corpus ahead of your C5 attestation.
