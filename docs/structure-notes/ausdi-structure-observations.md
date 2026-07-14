# AusDI — structure observations (STRUCTURE REFERENCE — NOT CONTENT)

> **Guardrail 1 (FL-30 §0.1).** AusDI is a proprietary, copyrighted commercial product.
> This file records **only** the shape of the data model — field names, cardinality, and
> relationships — observed in a single read-only session. **No monograph text, tables, or
> record values are captured here.** Every note below is a *structure reference, not
> content*. If a note would reproduce a value, it does not belong in this file.

**Status:** SKELETON — to be filled in FL-30 Step 3b. The portal sign-in is
**clinician-driven** (Ken); the agent cannot enter credentials or authenticate. The agent
records field-taxonomy observations dictated/confirmed by the clinician during that session.

**Source id:** `ausdi-structure` (see `mcp/servers/pharmacology/data/data-sources.json`).

---

## How to fill this (Step 3b protocol)

1. Ken opens the AusDI portal (read-only), one session.
2. For each monograph section, record **field names + relationships only**, e.g.:
   - `Monograph → { indications[], contraindications[], precautions[], interactions[], dosing{}, pregnancy_category, scheduling } ` — *names/shape only*.
3. Mark every note **"structure reference — not content."**
4. Do **not** transcribe any indication text, interaction pair, dose value, or table cell.

## Observed field taxonomy

_(empty — populated in Step 3b)_

## Relationship / cardinality notes

_(empty — populated in Step 3b)_

## Explicit non-capture attestation

- [ ] No monograph prose captured.
- [ ] No interaction pairs, dose values, or tables captured.
- [ ] Every observation is field-name/shape only.
