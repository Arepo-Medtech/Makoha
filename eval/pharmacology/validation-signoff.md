# FL-30 Step 5 — Pharmacology Staging Validation: SIGNED

**Signed off by:** KL (registered pharmacist, clinical sign-off authority)
**Date:** 2026-07-13
**Recorded by:** claude-fable-5 (agent), on the clinician's explicit written instruction in-session ("Add warfarin/DOACs to NTI first, then sign off").

## What was attested
The self-developed PharmCheck core is validated in staging against the pharmacology
validation case set (`eval/pharmacology/validation-cases.json`, v0.1.0):

- **20/20 cases pass** — representative outcomes clinically correct across all four mandated
  capabilities (NTI, interactions, renal dosing, AU scheduling) plus the CDS gate.
- **8/8 adversarial cases fail safe** — unknown drug, missing facts, dialysis/anuric,
  polypharmacy, NTI+interaction co-occurrence, contradictory schedule, paediatric, unknown age
  all block or escalate to a human; never a silent pass with a dose.
- **A/B parity** — datastore and mock-only sources both produce contract-valid PharmChecks.
- **Gate integrity** — dose guidance appears only on PASS/WARN; the human-review gate is never
  bypassed.
- **NTI coverage** — warfarin + DOACs (dabigatran, rivaroxaban, apixaban, edoxaban) added to the
  NTI register on the clinician's direction; warfarin now HARD_FAILs without a documented INR
  monitoring plan.

Full result: `eval/pharmacology/validation-report.md` / `.json`.

## Scope and limits of this sign-off
This attests the **self-developed synthetic core is clinically validated in staging**. It does
**NOT** authorise patient-facing use. Patient-facing remains BLOCKED pending, as separate gates:
regulatory (TGA) sign-off; a live CDS vendor (B4, the cds-adapter is EMPTY→HARD_FAIL); the live
PBS pull in deploy; AusDI 3b structure notes; and the Clinician Verification Portal. Datasets
remain `-dev`-tagged and receipts remain `mode=mock` until regulatory sign-off flips them.
