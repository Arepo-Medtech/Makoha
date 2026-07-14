# PBS Public API v3 — field taxonomy (structure reference)

> Structure/field-taxonomy note for the **open** PBS Public API v3
> (`data-api-portal.health.gov.au`). The PBS Schedule is Commonwealth **open data (CC BY)**,
> so unlike AusDI this is not a copyright-restricted source — but this file still records
> *shape*, not bulk data. The cached data itself lives (provenance-stamped) in
> `mcp/servers/pharmacology/data/pbs-formulary.json`, built by `scripts/pharm-pbs-sync.mjs`.
>
> **Source id:** `pbs-api-v3` (see `mcp/servers/pharmacology/data/data-sources.json`).

## Confirmed request contract (verified live 2026-07-13)

- **Gateway base URL:** `https://data-api.health.gov.au/pbs/api/v3` (NOT the dev-portal host).
- **Auth header:** `subscription-key`. The **public tier** needs no registration — it uses a
  shared PUBLIC key openly published in the PBS docs and the MIT reference client
  (`matthewdcage/pbs-mcp-server`): `2384af7c667342ceb5a736fe29f1dc6b`. This is **public access
  config, not a secret** — but the sync still reads it from `HEYDOC_PBS_PUBLIC_KEY` (or a
  registered key via the secrets seam), never hardcoded.
- **Items listing:** `GET /items?get_latest_schedule_only=true&limit=<n>&page=<p>`.
  Response `{ _meta: { total_records, page, limit, count, info.messages[copyright] }, _links, data:[…] }`.
  Full current schedule = **14,840 items** (limit honoured up to 10,000/page).
- **Rate limit:** ~1 req/20s shared → the sync sleeps ~21s between pages and backs off on 429.
- **Copyright:** the API returns a copyright statement (redistribute-OK, no-modify) that the
  sync RETAINS in `pbs-formulary.json`.

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

## Enrichment source (the sync pulls `/item-overview`, not `/items`)

`/item-overview` returns everything inline — no joins:
- **ATC:** nested `item_atcs[].atc` (code + description + level + full parent hierarchy). The
  sync keeps the primary (highest `atc_priority_pct`) as `atc_code` / `atc_level` / `atc_description`.
- **Authority:** nested `item_restrictions[].restriction_text.authority_method` +
  `written_authority_required`. The sync normalizes to a single **`authority_category`**
  partition (most-restrictive across the item's restrictions):
  `unrestricted | restricted_benefit | authority_streamlined | authority_required`
  (mutually exclusive → counts over items sum to the total), plus `written_authority_required`
  and the raw governing `authority_method`, and a `restricted` convenience boolean.
- **Page-size cap:** `/item-overview` caps `limit` at **1000** (vs 10,000 for `/items`).

## Mapping to the domain model

| PBS concept | Domain-model target |
|---|---|
| Item code | `DrugProduct` (pbs_item_code) / `PharmIntent.drug_intent.pbs_code` |
| ATC classification | `DrugProduct.atc_code` / `drug_class` |
| Authority requirement | `authority_category` / `PharmCheck.dose_guidance.pbs_authority_required` |

## What PBS does NOT provide (must come from elsewhere)

Drug–drug interactions, NTI status, renal dosing rules, allergy/cross-reactivity, SUSMP
poisons scheduling (S2–S10 / S8 gate), and SafeScript PDMP — none are in PBS data.
