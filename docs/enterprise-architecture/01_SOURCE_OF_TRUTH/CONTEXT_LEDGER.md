# Makoha Context Ledger

**Version:** 1.4  
**Last reconciled:** 21 July 2026  
**Engineering baseline:** `Arepo-Medtech/Makoha` `main` at `4920d0c2ca791d0ffd665cd1e33c4beb3b733237`

## Venture

Makoha is an Australia-first, AI-native health-technology venture. The product vision combines a patient-owned longitudinal health record with a health-professional-facing clinical reasoning engine. The governing clinical principle is augmented, not autonomous, medicine.

The name **Makoha** and the supplied meaning — tranquil, gentle, compassionate, considerate and kind-hearted — are founder-provided brand inputs. Linguistic, cultural, business-name and trade-mark clearance remain open.

## Founder and entity

- Founder: Dr Ken Lee.
- Entity of record: Arepo Medtech Pty Ltd, ACN 700 158 676, ABN 32 700 158 676.
- Historical record states 1,000,000 fully paid ordinary shares held by Dr Ken Lee.
- `[MISSING: current ASIC extract and current cap-table confirmation]`
- `[MISSING: legal status of Makoha as business name and trade mark]`
- Founder position (M-D018): founder-led, clinician-founded and independently governed. Ken owns mission, product thesis and executive leadership; profession-specific clinical, pharmacy, regulatory, quality, evidence and release authority requires verified appointments.
- Founder biography boundary: “Dr Ken Lee, clinician-founder and director” is supported by the controlled record. Qualifications, registration profession/status, specialty/scope, years, roles and the referenced night-shift origin story remain unverified under R-M018.

## Product assets

- **(AU)PAIR:** patient-owned longitudinal medical memory.
- **(AU)CARE:** health-professional-facing clinical reasoning and management-plan support.
- Defensibility thesis: longitudinal data, integrated reasoning, clinical workflow embedding and auditable governance.

The asset names remain imported from legacy work. The first wedge has now been revalidated and narrowed under decision M-D005.

## Current engineering state

The repository contains a materially more advanced build than the legacy project ledger described:

- Mock-by-default grounding, verification and evaluation infrastructure remains the safety baseline.
- A staging portal and an Australian-hosted CDS gateway are documented as deployed and wired.
- WORM-backed medicolegal record chains are documented as live-validated.
- MIRAGE v0.2.1 is documented as clinically attested and passing 98/98 items.
- The pharmacology self-build and OSS-CDS path are materially advanced, including signed datasets and staging parity evidence.
- Session-bound persistence is documented as enforced.
- No production or patient-facing release is authorised.

Open release-critical work documented by the repository includes:

- Live identity-provider connection.
- Live evaluation harness and blocking release thresholds.
- Staging soak and operational monitoring.
- Regulatory classification/release decision.
- Remaining pharmacology production inputs and live receipt posture.
- Authoritative investigation-source and regulatory completion.
- Operator release authorisation.

`[CONFIDENCE: HIGH]` A fresh local deterministic gate run was recorded during P2.1 on 21 July 2026. The hosted Node 20 CI result and authenticated staging proofs remain separate evidence requirements.

### P2.1 reconciliation — 21 July 2026

- Live repository HEAD advanced from the restart baseline `01c16db` to `4920d0c` through two FL-40 merges.
- FL-40 now includes a multi-turn clinical-evaluation harness for Claude and MedGemma, deterministic and receipt-gated graders/judge, positional-stability coverage, a blocking replay workflow and fail-closed clinician-signoff enforcement against signed `eval-rubric:v1.0`.
- Current local deterministic validation at `4920d0c`: contract suite PASS, verification PASS, licence gate PASS with zero blocks/two warnings, case-set gate PASS with 709 directories/707 attested conforming/zero failures, and MIRAGE PASS over 98/98 attested benchmark items.
- The clinical-evaluation replay gate is **SKIPPED, not passed**, because no authoritative Claude or MedGemma live fixtures exist. MedGemma staging reachability and credentials remain input-gated.
- Repository control-plane prose lags live HEAD: `docs/HANDOFF-STATE.md` names `a6f42f5` and `.planning/FINISH-LINE.md` headlines `01c16db`. Current code, registers and gate evidence take precedence.
- M-D022 orders the next three increments: authoritative two-backend clinical evaluation, verified clinician identity, then monitored staging soak. All remain synthetic/staging-only and cannot open patient eligibility.
- P2.1 preflight found two additional critical controls: R-M022 requires the live-labelled evaluation to prove each backend and judge actually ran live, and R-M023 requires a controlled representative case manifest. The current workflow omits explicit secret mappings and MedGemma live configuration, while its default first 45 sorted directories are all CARD cases. M-D023 therefore prohibits dispatch until mechanical remediation lands.
- A remediation patch against `4920d0c` is now prepared and locally verified: explicit protected workflow configuration, backend preflight, per-turn live provenance, atomic evidence writes, negative tests and a checksummed 707-case certification manifest. The patch is not merged to repository main, so R-M022/R-M023 remain open and M-D023 remains in force.

## Commercial and regulatory state

- Current wedge (M-D005): governance-first expanded-scope pharmacist consultation assurance, with pharmacist review/sign-off and escalation for red flags or out-of-scope care.
- Provisional ICP (M-D010): regional multi-site community pharmacy groups preparing for or operating expanded-scope services. The economic buyer is the group owner/operations/clinical-governance lead; the primary user is the trained and authorised pharmacist prescriber; the patient is the clinical beneficiary. WA is the preferred pre-2027 design window and Queensland the preferred current-workflow validation market. Direct interview and willingness-to-pay evidence remain open.
- Preferred design-partner candidate (M-D011): Pharmacy 777. The founder-directed sequence is WA/Perth leadership engagement, proposed workflow evidence through the current Queensland prescribing-service footprint, then controlled WA expansion. Every arrangement is non-exclusive. No Pharmacy 777 interest, authority, agreement or clinical-use permission is yet evidenced.
- Pharmacy 777 agreement architecture (M-D012): a non-exclusive group/franchisor framework cannot be treated as blanket site authority. The WA register evidences distributed ownership and premises responsibility, so every participating site requires owner-authorised participation plus responsible-pharmacist and data/security controls.
- Toowoomba sequencing (M-D013): exact ownership/counterparty structure is `TBC`; a split group/franchisor/local-owner structure is a low-confidence assumption. Discovery and offer development may proceed, but contract execution, data access, site participation and clinical evaluation remain gated on confirmation.
- P1.5 approved offer (M-D014): six-week, AUD $0 Makoha fee, synthetic-only discovery; no patient data, clinical use, exclusivity, rollout commitment or automatic conversion. Any later evidence phase is separately gated, scoped and priced. External issue was authorised on 21 July 2026; verified founder email and telephone remain required for submission.
- Commercial model (M-D017, superseding M-D015): non-exclusive mixed funding. Enterprise base, site and optional clinician/user fees support governance and platform costs; a transparent patient per-consult component helps fund access and doctor capacity; B2B/payer per-consult or minimum-capacity service agreements may subsidise or fully offset patient charges. Implementation, integration, evidence projects and later platform licensing remain separate arms. Provider-of-record, billing, fee allocation, doctor service levels and all prices remain unvalidated. Prescription revenue share, prescription-contingent and outcome-linked fees remain excluded.
- Moat thesis (M-D016): permissioned longitudinal consultation-assurance events combined with safety/effectiveness evidence, regulated operating capability and reusable workflow integrations. Makoha does not claim ownership of patient data or defensibility from model weights alone; executable data rights and demonstrated cross-site improvement remain open.
- Positioning (M-D019): “accountable continuity infrastructure for pharmacist-led care.” “AI doctor” is not an unqualified product or clinical claim; software is not presented as a registered practitioner or autonomous care provider.
- Regulatory posture (M-D006/M-D007): OPEN. The inherited exempt-CDSS hypothesis is no longer the base case. Makoha will build the shared safety-critical platform to a Class III-capable enterprise assurance target. The direct patient triage function is a provisional Class III candidate; the health-professional recommendation function may instead be Class IIb. Legal classification remains dependent on intended purpose and qualified application of Rules 4.5–4.8.
- Product family (M-D008/M-D009): Makoha Triage — provisional Class III; Makoha Professional Assurance — provisional Class IIb; Makoha Record and Workflow Services — separate assessment. The regulated SaMD/ARTG pathway is now the planning base case.
- Prior pilot target: 7 Day Pharmacy Group — superseded as the preferred candidate by M-D011; retained as a comparator/fallback only.

The amended P1.3 mixed business model is selected but commercially and legally unvalidated. No external regulatory opinion, counterparty commitment, signed pilot agreement, executed data-rights basis, doctor-capacity agreement or current pricing validation is evidenced.

## Fields to confirm

- `[MISSING: current cash, committed liabilities, monthly burn and runway]`
- `[MISSING: target raise, instrument, valuation parameters and use of funds]`
- `[MISSING: signed first clinical design partner]`
- `[MISSING: qualified regulatory opinion and current TGA classification decision]`
- `[MISSING: target commercial launch and ASX-readiness windows]`
- `[MISSING: current adviser bench — regulatory, legal, accounting, audit and corporate]`
- `[MISSING: Makoha business-name, domain, trade-mark and cultural-linguistic clearance]`

## P1.7 operating and capital position

- Selected planning case (M-D020): Base enterprise evidence. **[ASSUMPTION — LOW CONFIDENCE]** $1,271,200 gross 12-month spend, $50,000 potential evidence revenue, $254,240 reserve and $1,475,440 indicative financing before verified opening cash and liabilities.
- Funding thesis (M-D021): milestone-linked pre-seed capital; a control-stage bridge only if verified runway requires it; grants and partner evidence fees are offsets rather than safety-critical dependencies. Instrument and amount remain TBC after finance, cap-table, legal and tax review.
- The costed workbook is structurally verified and contains no formula errors. Its model status is `PROVISIONAL — VERIFY INPUTS` because opening cash, liabilities and founder capacity are zero placeholders.
- No production, patient-fee or uncontracted doctor-service revenue is included in the 12-month plan.
- All seven Phase 1 routines have planning outputs. The Phase 1 evidence gate is not passed: direct market validation, regulatory attestation and finance verification remain open.

## Hard constraint

No document may describe Makoha as patient-ready, production-ready, clinically validated for use, regulator-approved or investment-ready unless the corresponding gate has current evidence in the registers.
