# PBS Public API v3 — field taxonomy (structure reference)

> Structure/field-taxonomy note for the **open** PBS Public API v3
> (`data-api-portal.health.gov.au`). The PBS Schedule is Commonwealth **open data (CC BY)**,
> so unlike AusDI this is not a copyright-restricted source — but this file still records
> *shape*, not bulk data. The cached data itself lives (provenance-stamped) in
> `mcp/servers/pharmacology/data/pbs-formulary.json`, built by `scripts/pharm-pbs-sync.mjs`.
>
> **Source id:** `pbs-api-v3` (see `mcp/servers/pharmacology/data/data-sources.json`).

## Shape (from the public API v3 documentation)

- Relational model: **one endpoint per table** in the PBS Schedule database.
- Update cadence: **monthly** (first of the month). Access limited to current + past 12 months.
- Rate limit: **~1 request / 20s, shared** — designed for bulk download-and-store, **not**
  real-time per-request lookup. → we cache, we do not call it inside a PharmCheck.
- Auth: subscription key from the PBS Developer Portal (via the secrets seam).

## Tables / concepts exposed (field taxonomy only)

- **Items** — item overview / basic item information (→ `pbs_item_code`).
- **Prescribers** — prescriber details and types.
- **Schedules / ATC** — PBS *listing* schedule codes and ATC classifications
  (**note:** PBS "schedule" ≠ SUSMP poisons schedule — different concept).
- **Restrictions / Copayments / Fees** — subsidy conditions (→ `pbs_authority_required`).
- **Organisations / Criteria / Programs** — programme + restriction criteria structure.
- **Markup bands / Summary of changes** — pricing bands, monthly change log.

## Mapping to the domain model

| PBS concept | Domain-model target |
|---|---|
| Item code | `DrugProduct` (pbs_item_code) / `PharmIntent.drug_intent.pbs_code` |
| ATC classification | `DrugProduct.atc_code` / `drug_class` |
| Authority requirement | `CdsEnvelope` / `PharmCheck.dose_guidance.pbs_authority_required` |

## What PBS does NOT provide (must come from elsewhere)

Drug–drug interactions, NTI status, renal dosing rules, allergy/cross-reactivity, SUSMP
poisons scheduling (S2–S10 / S8 gate), and SafeScript PDMP — none are in PBS data.
