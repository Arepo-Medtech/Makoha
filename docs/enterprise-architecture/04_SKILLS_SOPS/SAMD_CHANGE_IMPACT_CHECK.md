# S-M002 — SaMD Change-Impact Check

**Status:** DRAFT  
**Purpose:** Determine whether a proposed change affects intended purpose, classification, clinical evidence, risk controls, QMS records, conformity evidence or ARTG obligations.

## Triggers

- New model, prompt or clinical agent.
- New condition, age group, indication, contraindication or jurisdiction.
- Patient-facing output or changed user role.
- New data source, medical image, signal, device or pharmacology content.
- Changed recommendation, diagnosis, triage, treatment or monitoring behaviour.
- Changed deployment, supplier, cybersecurity or release architecture.

## Inputs

- Current intended purpose and product boundary.
- Proposed change and rationale.
- Affected requirements, hazards, users and clinical claims.
- Existing verification, clinical evidence and conformity records.
- Regulatory jurisdictions.

## Procedure

1. Identify the product boundary and released version.
2. Compare the change with the controlled intended purpose.
3. Map affected Australian classification rules, including Rules 4.5–4.8.
4. Identify new or changed hazards and benefit-risk conclusions.
5. Map affected requirements, architecture, SOUP, usability, cybersecurity and data/model controls.
6. Determine V&V, clinical-evidence and human-factors deltas.
7. Determine whether regulator, conformity body, sponsor, HREC/site or ARTG action is needed.
8. Set disposition: reject, clarify, implement under existing evidence, implement with remediation, or new regulatory submission.
9. Record approvals and update the traceability spine.

## Guardrails

- Highest applicable classification rule wins for an inseparable device.
- No change may weaken emergency escalation or human sign-off.
- No retrospective approval or silent evidence reuse.
- Unclear regulatory impact fails closed to specialist review.
- The check never substitutes for qualified regulatory advice.

## Output

- Change summary and product/version.
- Classification and intended-purpose impact.
- Risk/evidence/QMS impact matrix.
- Required approvals and tests.
- Release disposition and blocking conditions.

## Attestation

Promote to ACTIVE after regulatory review. Promote to ATTESTED after two real changes are processed and independently audited.

