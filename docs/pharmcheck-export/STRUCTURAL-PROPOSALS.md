# PharmCheck — Structural Proposals (APF22 Section D reorganisation)

> **STATUS (2026-07-14): Priority-1 BUILT** — the `capability-groups.json` heading overlay + `administration_handling`, `tdm_parameters` (with NTI-as-bucket), `warning_labels`, `counselling_points` are scaffolded, seeded (APF22-cited / RASML), and contract-tested (`-dev`/draft, unsigned). See `CHANGELOG.md`. Priority-2/3 (§4.6–4.8) remain proposals below.
>
> **Mode: AI Architect · plan-gated proposals, NOT implemented.** This document maps PharmCheck's current flat capabilities onto the Australian Pharmaceutical Formulary & Handbook (**APF22**) clinical-monograph taxonomy (Section D), and proposes a **heading-capability** reorganisation plus new capabilities. It is the "structural proposal" step of `DEVELOPMENT-INSTRUMENT.md`, done here rather than in a chat. Nothing here is built — each item is a proposal for a subsequent plan-gated build.
>
> **Copyright boundary (honoured).** APF22 is © Pharmaceutical Society of Australia. This document uses APF22 **only for its organisational STRUCTURE** (the monograph heading/subheading taxonomy) and cites it — it does **not** ingest monograph content. Every proposed capability's *records* would be authored from **primary/public sources** (RASML/TGA for advisory labels, TGA Prescribing Medicines in Pregnancy for pregnancy categories, AMH/Therapeutic Guidelines for clinical content), never copied from APF.

---

## 1. The APF22 Section D monograph taxonomy (the structure we're mapping to)

Each APF22 clinical monograph (Section D, pp. 240–434) is organised as a fixed two-level structure — **heading → subheadings** — which is exactly the "heading capability" shape requested:

| APF heading | APF subheadings |
|---|---|
| **Counselling** | Cautionary advisory labels (CALs); Consumer information |
| **Dispensing considerations** | Modification of oral formulation; Elderly; Hepatic impairment; Renal impairment; Changes to urinary system; Changes to faeces; Monitoring; Pregnancy; Breastfeeding |
| **Common dosage range** | Adult dose; Paediatric dose |
| **Additional information** (section-level) | Pregnancy categories (A/B1/B2/B3/C/D/X); Breastfeeding; Paediatric doses; Missed doses; Adverse drug reactions |

Supporting sections used: **Section A** — "Counselling and cautionary advisory labels" (CALs) and "Modification of oral formulations"; **Section B** — "Therapeutic drug monitoring" (Table B.2 data model).

## 2. Current capability → APF heading map (where we sit, where the gaps are)

| APF heading | Current PharmCheck capability | Gap → proposed new capability |
|---|---|---|
| Counselling · CALs | — | **`warning_labels`** (NEW) |
| Counselling · Consumer information | — | **`counselling_points`** (NEW) |
| Counselling · (mild cautions) | `precautions` ✓ | (incorporate under Counselling heading) |
| Dispensing · Modification of oral formulation | — | **`administration_handling`** (NEW — "should not be crushed") |
| Dispensing · (general) | — | **`dispensing_considerations`** (NEW) |
| Dispensing · Renal impairment | `renal` ✓ | — |
| Dispensing · Hepatic impairment | — | **`hepatic`** (NEW) |
| Dispensing · Elderly | — | **`elderly`** (NEW) |
| Dispensing · Changes to urine/faeces | — | **`discolouration`** (NEW) |
| Dispensing · Monitoring | `nti` ✓ (partial) | **`tdm_parameters`** (NEW) — NTI becomes a bucket under a TDM heading |
| Dispensing · Pregnancy | — | **`pregnancy`** (NEW) |
| Dispensing · Breastfeeding | — | **`breastfeeding`** (NEW) |
| Common dosage range | `dose_guidance` (held), `dose_evidence` ✓, `formulations` ✓ | (doses stay firewall/vendor — unchanged) |
| (cross-cutting safety) | `interactions`, `serious_adverse_effects`, `strong_contraindications`, `allergy` ✓ | — |
| (clinical pharmacology) | `pharmacodynamics`, `pharmacokinetics` ✓ | — |
| (regulatory/reference) | `scheduling`, `pbs` ✓ | — |

## 3. The core design decision — a NON-DESTRUCTIVE heading overlay ("do not crush the capabilities")

You flagged two meanings of *"should not be crushed"* and both are honoured:

1. **The literal capability** — a do-not-crush/modify list (`administration_handling`, §4.1).
2. **The principle** — the reorganisation must **not crush or collapse** the existing 14 capabilities or migrate/lose their content (consistent with the content-preservation work already done on the ingest adapter).

**Recommendation: implement "heading capabilities" as a grouping OVERLAY, not a nested restructure.**

- Every existing leaf capability keeps its own dataset and schema — **zero data migration, nothing merged, nothing lost.**
- A new registry `mcp/servers/pharmacology/data/capability-groups.json` defines the **heading capabilities** and which leaf capabilities belong to each. Grouping becomes metadata the API/engine can present by; the leaves are untouched.
- A leaf can sit under a heading without changing a single record. Reversible.

**Rejected alternative:** nesting leaves inside parent schemas — breaking, risky, discards the clean per-capability datastore, and literally "crushes" content. Not proposed.

### Proposed heading capabilities (the target organisation)

```
Indications              → clinical_uses
Clinical pharmacology     → pharmacodynamics, pharmacokinetics
Counselling               → warning_labels*, counselling_points*, precautions
Dispensing considerations → administration_handling*, dispensing_considerations*, formulations
Safety & contraindications→ interactions, serious_adverse_effects, strong_contraindications, allergy
Special populations       → renal, hepatic*, elderly*, pregnancy*, breastfeeding*
Therapeutic drug monitoring → nti (the bucket), tdm_parameters*
Dosing                    → dose_guidance (held), dose_evidence
Regulatory / reference    → scheduling, pbs, discolouration*
        (* = new capability proposed below)
```

**NTI becomes a bucket inside TDM** exactly as requested: under the `therapeutic_drug_monitoring` heading, the existing `nti` dataset is the *narrow-therapeutic-index bucket* and the new `tdm_parameters` leaf carries the ranges/timing. The frozen `pharm-check` `nti_check` is **unchanged** — it keeps reading the `nti` bucket. No firewall contract change.

### Frozen-contract safety

**None of the proposals below require touching the frozen `pharm-intent`/`pharm-check` contracts.** Every new capability is a **reference register** (like `dose_evidence`) — provenanced, engine-*isolated*, not a dose source, not wired to a `check_id`. Any *future* firewall check built on this data (e.g. a crush-safety gate, a TDM-target gate) is a **separate, plan-gated proposal that WOULD touch the frozen enum** — flagged in §5, not bundled here.

## 4. New capability proposals (build-ready — full field specs in `structural-proposals.json`)

Priority 1 = explicitly requested; Priority 2 = rounds out the Counselling + Dispensing headings; Priority 3 = special populations + reference.

### 4.1 `administration_handling` — "should not be crushed" (Priority 1)
Formulation-integrity handling: whether a solid oral dose form may be crushed / split / dispersed, and the alternative if not. Source: APF "Modification of oral formulations" structure; content authored from AMH + product information.
- **Fields (.strict):** `ingredient`:str(req); `formulation`:str(opt, e.g. "modified-release tablet"); `can_crush`:enum[`do_not_crush`,`crush_with_caution`,`crushable`](req); `can_split`:enum[`splittable`,`do_not_split`,`scored_only`,`unknown`](opt); `can_disperse`:enum[`dispersible`,`not_dispersible`,`unknown`](opt); `rationale`:str(opt); `alternative`:str(opt); `reference`:str(opt).
- **Reference-only**, per-record provenance. **Invariant impact: none** — carries no dose, cannot emit a dose. A future `crush_safety_check` firewall gate would be a separate frozen-contract proposal.

### 4.2 `tdm_parameters` + NTI-as-bucket — Therapeutic Drug Monitoring (Priority 1)
The monitoring data model from APF Table B.2, with `nti` retained as the narrow-index bucket under the TDM heading (grouping overlay). New leaf carries the ranges/timing; `nti` and `nti_check` unchanged.
- **Fields (.strict):** `ingredient`:str(req); `monitored`:bool(req); `therapeutic_range_low`:num(opt); `therapeutic_range_high`:num(opt); `range_unit`:str(opt, e.g. "mg/L","micromol/L"); `toxic_threshold`:num(opt); `toxic_unit`:str(opt); `sample_timing`:enum[`trough`,`peak`,`either`,`auc`](opt); `biological_fluid`:enum[`serum`,`plasma`,`whole_blood`](opt); `time_to_steady_state`:str(opt); `monitoring_indication`:str(opt); `active_metabolite_note`:str(opt); `notes`:str(opt).
- **Reference-only**, per-record provenance. **Not a dose source** — target *concentration* ranges are lab-monitoring targets, not dosing instructions (no-LLM-doses invariant untouched). Content authored from AMH/Therapeutic Guidelines, not APF. Cross-links to `nti` by `ingredient`.

### 4.3 `warning_labels` — Cautionary Advisory Labels (Priority 1, under Counselling)
Advisory/cautionary label assignments per medicine.
- **Fields (.strict):** `ingredient`:str(req); `label_code`:str(req); `label_text`:str(opt); `source_scheme`:enum[`RASML`,`PSA_CAL`,`other`](req); `mandatory`:bool(opt); `reference`:str(opt).
- **Copyright note:** author from **RASML** (Required Advisory Statements for Medicine Labels — TGA legal instrument, public), NOT from APF's monograph CAL assignments. `source_scheme:RASML` is the primary path. **Reference-only**, per-record provenance. Invariant impact: none.

### 4.4 `counselling_points` (Priority 1, under Counselling)
Consumer counselling messages per medicine.
- **Fields (.strict):** `ingredient`:str(req); `point`:str(req); `category`:enum[`administration`,`storage`,`missed_dose`,`side_effect_advice`,`duration`,`lifestyle`,`safety_netting`](opt); `priority`:enum[`essential`,`recommended`](opt).
- **Reference-only.** Author from AMH/CMI-style knowledge, not APF text. `precautions` stays a separate leaf under the same Counselling heading (not merged).

### 4.5 `dispensing_considerations` (Priority 2, under Dispensing)
Point-of-dispensing alerts not covered by the specific leaves.
- **Fields (.strict):** `ingredient`:str(req); `consideration`:str(req); `category`:enum[`supply_restriction`,`monitoring_alert`,`adherence`,`brand_substitution`,`storage`,`quantity`,`safety`](opt).
- **Reference-only.**

### 4.6 `hepatic` (Priority 2, Special populations) — parallels `renal`
- **Fields (.strict):** `ingredient`:str(req); `action`:enum[`hepatic_contraindicated`,`hepatic_caution`,`dose_adjustment`](req); `child_pugh_class`:enum[`A`,`B`,`C`](opt); `guidance`:str(opt); `monitoring`:str(opt).
- **Reference-only** (unlike `renal`, no frozen `hepatic_check` exists — a `hepatic_dosing_check` would be a separate frozen-contract proposal).

### 4.7 `pregnancy` + `breastfeeding` (Priority 2, Special populations)
- **`pregnancy` fields:** `ingredient`:str(req); `au_category`:enum[`A`,`B1`,`B2`,`B3`,`C`,`D`,`X`](req); `guidance`:str(opt). Author from **TGA Prescribing Medicines in Pregnancy database** (public), not APF.
- **`breastfeeding` fields:** `ingredient`:str(req); `compatibility`:enum[`compatible`,`caution`,`avoid`,`insufficient_data`](req); `guidance`:str(opt).
- Both reference-only. (Note: a paediatric/age gate already exists via `age_appropriateness_check`; these do not touch it.)

### 4.8 `elderly` + `discolouration` (Priority 3)
- **`elderly` fields:** `ingredient`:str(req); `consideration`:str(req); `category`:enum[`increased_sensitivity`,`avoid`,`dose_reduction`,`deprescribing`,`anticholinergic_burden`](opt); `guidance`:str(opt).
- **`discolouration` fields:** `ingredient`:str(req); `fluid`:enum[`urine`,`faeces`,`other`](req); `colour`:str(opt); `clinically_harmless`:bool(opt); `note`:str(opt).
- Both reference-only.

### 4.9 APF dosage review queue + clinician-attested elevation (dose-invariant-adjacent — plan-gated)
The downstream layer for APF22 "Common Dosage Range" facts that **fail** PubMed verification (`DEVELOPMENT-INSTRUMENT.md` §4.3a/§4.3b): don't drop them, queue them, elevate later. Two build-ready proposals in `structural-proposals.json`:
- **`dose_evidence_pending`** (new reference register) — a HELD, engine-isolated review queue: `ingredient`, `context`, `apf_dosage_range` (APF-cited), `reason_unverified`, `status`∈{pending,elevated_pubmed,elevated_clinician_apf,declined}. Optional companion: a `dose_evidence_review_queue` dev-package section that `pharm-ingest.mjs` **surfaces** (report-only, like `structural_proposals` — never writes into `dose_evidence`).
- **`dose_evidence` direct-APF-citation variant (LAST RESORT)** — `citation.id_type` gains `apf22`; a stable unique per-record identifier (`apf22:<ingredient>:<context>`) to protect the natural key; the elevation is a **clinician-only attestation** (sets `reviewed_by`/`approved`, bypasses the fail-closed authoring pipeline), NOT chat/agent-authorable. This is the ONE path a dose enters `dose_evidence` without a PubMed citation — permitted only because it is engine-isolated (never surfaces a dose), APF-sourced (not LLM-invented), and personally clinician-attested. **Touches the dose invariant → requires Ken's explicit approval before building.**

## 5. Schema-change & new-infrastructure proposals

- **`capability-groups.json` registry (new infra, non-destructive):** defines the heading capabilities in §3 and their member leaves. Fields per group: `group_key`, `title`, `description`, `member_capabilities[]`, `source_ref`. The API/engine can then present capabilities grouped. No dataset migration. **This is the mechanism that makes the whole reorg additive.**
- **Optional `group` back-reference on dataset metadata (schema_change, minor):** each dataset's top-level metadata may carry `group: <group_key>` for quick lookup. Non-breaking (metadata only; contract tests read `records`, not this).
- **Flagged separately (NOT bundled — each touches the frozen `pharm-check` enum, so each is its own plan-gated proposal):** `crush_safety_check` (gate on `administration_handling`), `hepatic_dosing_check` (gate on `hepatic`), `tdm_target_check` (gate on `tdm_parameters`). These convert reference data into firewall checks and must go through the frozen-contract change process.

## 6. Recommended build sequence

1. **`capability-groups.json` overlay** — establishes the heading structure with zero risk (the "don't crush" scaffold first).
2. **Priority 1 capabilities** — `administration_handling`, `tdm_parameters` (+ NTI-as-bucket grouping), `warning_labels`, `counselling_points`.
3. **Priority 2** — `dispensing_considerations`, `hepatic`, `pregnancy`, `breastfeeding`.
4. **Priority 3** — `elderly`, `discolouration`.
5. **(Later, separate gates)** — the optional firewall checks in §5 that touch the frozen contract.

Each capability scaffold = zod schema + validator + `CAPABILITY_VALIDATORS`/`CAPABILITY_FILE` registration + dataset skeleton + `contract-pharm-datastore` registration + (for the round-trip) `CAPABILITY_FILE`/`NATURAL_KEYS` entries in the ingest adapter. All reference-only, all `-dev`/unsigned, all requiring clinician sign-off before any use.

---

*Machine-readable companion: `structural-proposals.json` (a dev-package carrying these as `structural_proposals[]`, ready to flow through `scripts/pharm-ingest.mjs`). Source structure: APF22 (PSA), Sections A, B, D — structure cited, content not ingested.*
