# Standards-pin decision memo (A1.3) — stale conformance targets surfaced for sign-off

> **What this file is.** A decision record surfacing three standards pins that the
> Mechanical-Inventory verification (2026-07-23) found to be **stale** against the current
> published/applicable versions. Per CLAUDE.md `<standards_pins>` and the A1 plan, these are
> **surfaced for operator/clinician sign-off, never silently bumped** by the agent.
>
> **What this file is NOT.** It does not itself perform the re-pin. Actually adopting a new
> target is downstream, tested work: replacing the vendored AU Core StructureDefinitions,
> re-validating the existing case codes, and live NCTS conformance validation (FL-31). This
> memo records the **decision/direction**; the mechanical re-validation is a separate step
> and remains open until executed and tested.

**Source of the findings:** `.planning/MECHANICAL-INVENTORY-DOSSIER.md` §0 (corrections) + §2 L1,
each cited to a primary AU standards-body source.

---

## The three stale pins

| # | Pin | Repo pins today | Current / correct | Why it matters | Recommendation |
|---|---|---|---|---|---|
| 1 | **AU Core IG** | 0.3.0 (vendored SDs are a pre-release `2.0.1-ci-build`) | **2.0.0** published & current (FHIR R4) — hl7.org.au/fhir/core | Conformance target for `fhir-broker` structural validation + case FHIR mapping. CLAUDE.md flags this as "an unsettled org/regulatory conformance-target decision." | **Target AU Core 2.0.0 published.** Replace the vendored `2.0.1-ci-build` snapshot with the published 2.0.0 package. |
| 2 | **ICD-10-AM** | 12th Edition | **13th Edition** (applicable from 2025-07-01) — IHACPA | Any AU ICD-10-AM coding claim binds against the edition; 12th applied to separations 2022-07 → 2025-06 only. Licensed content (IHACPA/Lane Print). | **Adopt 13th Edition** as the target; licensed content bound at deploy on a licensed endpoint. Until licensed → `BLOCKED_NO_PROOF`, never fabricate. |
| 3 | **SNOMED CT-AU edition** | 20240301 | Current NCTS monthly release (SNOMED CT-AU with AMT) | Edition stamped into every terminology receipt `dataset_version`; drift matters for reproducibility (see PrimeKG-CL evidence that terminologies drift materially between releases). | **Track the current NCTS release**, loaded via Ontoserver syndication at deploy; pin the exact release into receipts. |

---

## Implications flagged (not decided by the agent)

- **AU Core 2.0.0 vs AUCDI:** AU Core 2.0.0 aligns to AUCDI Release 1. CLAUDE.md references AUCDI R3; whether AUCDI R3 **re-targets** or only **supplements** the AU Core conformance target is an org/regulatory confirmation that remains open even with the direction below settled (per `<standards_pins>`).
- **Re-validation cost (the real work, not done here):** bumping AU Core requires re-running structural conformance against the new SDs and re-validating the existing case codes; bumping ICD-10-AM to 13th requires the licensed 13th-Ed content and re-checking any bound AU codes. This is FL-31 scope and must be tested before it ships.
- **No behaviour changed by this memo:** the terminology client (A1.1/A1.2) and `fhir-broker` continue to validate against whatever is vendored/configured and to **report the `ig_version` they used** (`auCoreTarget().c22_open`, `AU_CORE_MANIFEST.ig_version`). Nothing is auto-bumped.

---

## Sign-off

**Operator sign-off — recorded as instructed (2026-07-23).**

- **Attested by:** Operator / founder (Ken), via chat, 2026-07-23.
- **What is attested (the DIRECTION):** the three target versions above are adopted as the intended
  conformance targets — **AU Core 2.0.0 (published)**, **ICD-10-AM 13th Edition**, and **SNOMED CT-AU
  tracking the current NCTS release**. The agent is authorised to plan and sequence the re-pin toward
  these targets.
- **Scope / limits of this sign-off (recorded faithfully):**
  1. This attests the **decision to target** these versions. It does **not** attest that the mechanical
     re-pin has been done or validated — replacing vendored SDs and re-validating case codes remains
     open, tested downstream work (FL-31), gated as usual.
  2. The **AUCDI R3 re-target-vs-supplement** question and live NCTS conformance validation remain
     org/regulatory confirmations still to be closed with the appropriate specialists, per
     `<standards_pins>` — this sign-off does not pre-empt them.
  3. ICD-10-AM 13th-Ed **content binding** depends on the IHACPA licence + a licensed endpoint (A1.OP);
     until then AU ICD-10-AM lookups stay `BLOCKED_NO_PROOF`.

**Residual sign-off still recommended:** clinical attestation (KL) of the ICD-10-AM 13th-Ed re-coding
once the licensed content is bound and existing case codes are re-validated — a clinical-coding-validity
check distinct from this operator direction sign-off.

---

## Cross-references

- CLAUDE.md `<standards_pins>` — the authoritative pin list (update it under a plan when the re-pin is
  executed, not by this memo).
- `.planning/FINISH-LINE.md` FL-31 (NCTS licence + AU Core conformance-target decision + live code
  re-validation) — the item that carries the mechanical re-pin work.
- `mcp/servers/fhir-broker/au-core/manifest.json` — the vendored SD snapshot to be replaced on execution.
- `mcp/servers/terminology/value-sets.json` `not_resolved_here.ICD_10_AM` — records the 13th-vs-12th flag.
