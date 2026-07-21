# Pharmacy 777 — WA Premises Register Analysis

**Status:** COMPLETE — PUBLIC-REGISTER ANALYSIS; TOOWOOMBA STRUCTURE TBC  
**Date:** 20 July 2026  
**Supports:** M-D011 and M-D012  
**Source register generated:** 19 July 2026, 8:31 am

## Purpose

Determine whether the Pharmacy 777 WA footprint can be authorised through one group counterparty or requires site-level participation and clinical-accountability instruments.

## Source and method

The founder supplied a CSV export of the Pharmacy Registration Board of Western Australia's public Premises Register. The register contains pharmacy name/address, pharmacist with overall responsibility, ownership, proprietary interests and conditions.

The source contained 706 premises records. Records were selected where the pharmacy-name field contained `Pharmacy 777` or `Pharmacy Help`, case-insensitive. Telephone-number matches were excluded by using brand phrases rather than the digits `777` alone.

No source row was altered. The analysis deliberately reports aggregate governance findings rather than reproducing individual pharmacists' names.

## Results

| Measure | Result | Meaning |
|---|---:|---|
| Total WA premises records | 706 | Full supplied public register |
| Pharmacy 777 / Pharmacy Help branded records | 73 | Material WA brand footprint |
| Unique pharmacists with overall responsibility | 68 | Operational/clinical responsibility is substantially distributed |
| Distinct exact ownership-field entries | 73 | Every matched premises record has a distinct recorded ownership string |
| Responsible pharmacists appearing on more than one matched premises | 5 | Limited operational overlap; not central control |
| Matched records with a non-blank public `Conditions` field | 0 | No condition is shown in this export; this is not proof that no contractual or regulatory constraints exist |

Leadership-related names or entities recur within some ownership/proprietary-interest fields, but not across the full branded footprint. The register therefore supports a network/franchise interpretation rather than a single-owner chain interpretation.

## Decision consequence

A single agreement with a group or franchisor entity should not be assumed to authorise participation by every Pharmacy 777 site. Makoha will use a two-level, entirely non-exclusive architecture:

1. **Group framework agreement:** brand/network cooperation, common evaluation protocol, permitted communications, security expectations, group support and central project governance.
2. **Site participation schedule:** signed or otherwise lawfully authorised by the relevant registered owner/operator for each participating premises; identifies data roles, local systems, users, permitted evaluation mode and stop authority.
3. **Responsible-pharmacist acknowledgement:** confirms workflow, training, escalation, incident and professional-accountability boundaries without transferring clinical judgement to Makoha.
4. **Data and security schedule:** identifies controller/holder roles, approved data classes, hosting, access, retention, deletion, incident handling and prohibition on unapproved secondary model training.

Qualified counsel must determine the precise parties and whether the group, franchisor, site owner, employing entity or another entity signs each instrument.

## Development-sequence implications

- The Toowoomba evidence phase is outside this WA register and requires separate Queensland entity, pharmacy-business and service-authority diligence.
- Founder direction permits discovery and offer development to proceed while that structure is `TBC`. `[ASSUMPTION — LOW CONFIDENCE]` A split group/franchisor/local-owner structure is likely, but must not be represented as confirmed.
- WA expansion should begin with two or three sites whose owners voluntarily opt in and whose leadership, clinical-governance and technology pathways are demonstrably aligned.
- A founding/metro site and a regional site may provide a useful contrast, but no site is selected solely because a group leader appears in its public ownership record.
- Each additional site is a controlled change: readiness, intended use, systems, authorised pharmacists, privacy/data flow and evidence protocol must be rechecked.
- Network rollout must be evidence-gated and separately ordered; a group framework is not blanket deployment permission.

## Limitations

- The match is brand-name based. It may exclude network members trading under another name or include recently changed names.
- Distinct ownership-field text does not prove 73 completely unrelated economic interests; some people or entities recur within different structures.
- The `Pharmacist with Overall Responsibility` field indicates statutory premises responsibility, not procurement or contract authority.
- The register does not disclose franchise agreements, technology contracts, AI/CDSS vendors, data permissions or prescribing-service readiness.
- The analysis covers WA only and does not validate the Queensland counterparty.

## NEXT

Proceed with the non-exclusive discovery and offer-development work. Confirm the Toowoomba owner/operator, authorised group sponsor and contract/data parties before execution, data access or site activity.

## Sources

- Founder-supplied WA Premises Register CSV, downloaded 20 July 2026 and retained unchanged.
- [Pharmacy Registration Board of Western Australia — Premises Register](https://pharmacyboardwa.com.au/premises-register/)
- [Pharmacy Registration Board of Western Australia — ownership guidelines](https://pharmacyboardwa.com.au/service/guidelines-for-ownership-of-pharmacy-business/)

*Not legal, clinical or regulatory advice.*
