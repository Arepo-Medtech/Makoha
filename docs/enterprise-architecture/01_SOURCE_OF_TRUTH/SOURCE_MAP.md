# Makoha Source Map

## Engineering authority

- Live repository: `https://github.com/Arepo-Medtech/Makoha`
- Baseline used for restart: `main @ 01c16db8a3738a441c9f4db123f79295326cf639`
- P2.1 reconciliation baseline: `main @ 4920d0c2ca791d0ffd665cd1e33c4beb3b733237`, observed 21 July 2026
- Highest-value current tracker: `.planning/FINISH-LINE.md`
- Canonical engineering registers: `docs/grounding/completeness-register.md` and `docs/grounding/gap-register.md`
- Build plans: `.planning/ARCH_PLAN.md`, `.planning/FLOW_PLAN.md`, `.planning/M9-M14-MASTER-PLAN.md`

## Business and governance authority

- Active documents: this folder.
- Historical evidence: `../sources/`.
- Historical evidence is read-only and may contain superseded names, assumptions and regulatory framing.
- Founder-supplied Australian Pharmacy Landscape Research Programme, dated 19 June 2026: secondary market evidence reviewed for M-D011; original external DOCX retained unchanged.
- Founder-supplied CSV export of the WA Pharmacy Premises Register: public regulatory evidence generated 19 July 2026; source retained unchanged and analysed under M-D012.

## P1.3 market and pricing comparators

- Qiri product and software terms: direct pharmacy clinical-reasoning, dispensing-integration, audit and custom per-site pricing comparator; vendor benefit claims are not treated as independently verified.
  - `https://qiri.ai/au/product`
  - `https://qiri.ai/au/software-user-terms-and-agreement`
- Lyrebird Australian pricing: practice-wide documentation/workflow subscription benchmark.
  - `https://www.lyrebirdhealth.com/au/lyrebird-pricing`
- Heidi pricing: free/paid documentation and enterprise-plan benchmark; not used as an Australian regulated-assurance price.
  - `https://www.heidihealth.com/en-us/pricing`
- Eucalyptus: vertically integrated consumer digital-health delivery comparator, not a direct pharmacy SaaS price benchmark.
  - `https://www.eucalyptus.health/`

Public prices and product descriptions are point-in-time comparator evidence reviewed on 21 July 2026. They do not validate Makoha's willingness-to-pay assumptions.

## P1.4 professional and product-claim sources

- Ahpra, meeting professional obligations when using AI: practitioner accountability, human judgement, understanding, transparency and fit-for-purpose review.
  - `https://www.ahpra.gov.au/Resources/Artificial-Intelligence-in-healthcare.aspx`
- TGA, software-based medical devices for health professionals: current product-purpose and professional-use framing for software and AI medical devices.
  - `https://www.tga.gov.au/resources/health-professional-information-and-resources/software-based-medical-devices-health-professionals`

Reviewed 21 July 2026. These sources support claims boundaries; they do not verify any founder credential, product approval or clinical performance.

## P1.7 planning model

- Formula-driven scenario workbook: `outputs/p1_7/Makoha_P1.7_12_Month_Budget_and_Funding_Model.xlsx`.
- Model inputs are internal assumptions linked to controlled P1.3, P1.4, P1.5 and P1.6 records; all assumptions are documented in the workbook Sources and Assumptions sheets.
- No external cost quote, signed revenue, verified cash, verified liability or approved financing is used. The founder input source remains `03_ARTEFACTS/P1.7_FOUNDER_FINANCE_INPUT_SHEET.md`.

## P2.1 engineering reconciliation

- Live repository HEAD and commit history were retrieved directly from `https://github.com/Arepo-Medtech/Makoha` on 21 July 2026.
- Primary repository evidence: `.planning/FINISH-LINE.md`, `docs/HANDOFF-STATE.md`, current engineering registers, FL-40 source/tests and `.github/workflows/staging-eval.yml`.
- Local deterministic checks at `4920d0c`: contract suite PASS, verification PASS, licence gate PASS, case-set gate PASS and MIRAGE PASS. Evaluation replay SKIPPED because both backend fixtures are absent.
- Local checks used the available bundled Node 24 runtime; hosted Node 20 CI remains authoritative.
- GitHub Actions secret-handling authority reviewed 21 July 2026: `https://docs.github.com/en/actions/concepts/security/secrets` states that a workflow must explicitly include a secret and pass it as an input or environment variable. This supports P2.1 preflight finding R-M022.
- Remediation evidence: `outputs/p2_1/FL40_authoritative_eval_hardening.patch`, generated against `4920d0c`, clean-apply checked against that commit and locally verified through the full deterministic gate set. It is not evidence of a repository merge or hosted CI pass.

## Known source conflicts

1. Repository URL and branding in older handoff/README content lag the live GitHub repository.
2. The older project ledger materially understates subsequent staging, pharmacology, WORM and MIRAGE progress.
3. Some finish-line prose contains internally stale counters or earlier-pass notes. Registers and current code must win.
4. The founder-supplied pharmacy landscape programme dates Pharmacy 777's Friendlies master-franchise acquisition to 2022; HBF primary reporting records the sale in August 2019. New Makoha records use 2019 pending legal diligence.

These conflicts remain visible; they are not silently corrected in historical files.
