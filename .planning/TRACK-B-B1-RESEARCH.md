# Track B · Phase B1 — EHR-peer bake-off (research memo)

> B1 deliverable, read-only (no code). Produced 2026-07-14 at `main @ edb2c7a` /
> `track-a-oss-cds`. Picks the open-source EHR to connect as a live FHIR R4 network peer to
> the fhir-broker. Ends at a HALT for the operator decision. Nothing here authorises code.

## The integration surface (what actually constrains the choice)
Read from the repo — this is the lens the candidates must be judged against:

- **fhir-broker connects over FHIR R4.** `live-backend.js`: a live EHR is reached via the
  wso2 **fhir-mcp-server** process fronting a **FHIR R4 base URL** (`HEYDOC_FHIR_MCP_ENDPOINT`
  + `HEYDOC_FHIR_UPSTREAM_BASE`). Rollback-to-mock when unset; receipts carry mode `live`.
- **The conformance validator checks FHIR resources against AU Core.** `conformance.js`
  validates resources against 5 **vendored AU Core StructureDefinitions** (patient, condition,
  allergyintolerance, diagnosticresult, medicationrequest): profile/type match, required
  elements, cardinality, fixed/pattern code systems. ValueSet membership + FHIRPath invariants
  are deferred to live NCTS.
- **Auth is SMART App Launch 2.0.0.** `integration/record-sources/sources-client.js` builds
  the SMART authorize request; provider records carry `fhir_base_url` + `authorize_endpoint`.
- **No source is vendored.** The EHR is an external network peer over FHIR R4 → its licence
  governs *vendoring* (if ever bundled), not the runtime.

**Consequence:** the decisive axis is **native FHIR R4** (drops into the wso2/fhir-broker
surface with no translation layer), then **licence** (for any future bundling).

## Candidate assessment (verified 2026-07-14)

| EHR | Licence | FHIR posture (verified) | Fit against the surface |
|---|---|---|---|
| **OpenMRS** (FHIR2 module) | OpenMRS Public Licence / **MPL 2.0** (vendorable modules) | **Native FHIR R4** (HAPI-based; README: "initially using FHIR R4") | **Best structural fit** — native R4 base URL drops straight into the wso2/fhir-broker surface; resources validate against the AU Core SDs directly. Lowest integration risk. |
| **Bahmni** | OpenMRS Public Licence | Inherits OpenMRS FHIR2 (R4) | Same FHIR/licence as OpenMRS **plus** bundled lab/radiology/Odoo — more than a CDS-grounding peer needs. Choose only if the bundled modules are wanted. |
| **EHRbase** | **Apache-2.0** (cleanest) | **openEHR-native** (RM 1.1.0); openEHR REST + AQL; **no native FHIR** — needs a bridge | Cleanest licence, but FHIR is bridge-dependent → an extra translation layer and **AU-Core-R4 conformance risk** against a FHIR-native validator. Highest integration risk. |
| **OpenEMR** | **GPLv3** | FHIR R4 API exists | Copyleft blocks *vendoring* (H0); viable only as a pure network peer. Lowest preference. |

## Two findings that apply to ALL candidates (surface honestly)
1. **None is AU-Core-native.** OpenMRS/EHRbase/OpenEMR emit base-R4 (or US-oriented)
   resources by default — they do **not** carry AU Core `meta.profile` or AU extensions.
   So the conformance validator would report AU-Core non-conformance for vanilla output from
   *any* of them. **Achieving AU Core conformance is a separate AU-profiling/mapping step**,
   independent of the EHR choice (and the validator already defers the deepest AU checks to
   live NCTS). B3 connects the peer for FHIR R4 reads; AU Core localisation is a downstream
   task, not a connect-time gate.
2. **SMART App Launch on the peer needs confirmation.** The record-sources client uses SMART
   App Launch 2.0.0. OpenMRS 3.x has SMART-on-FHIR support in its reference stack, but the
   FHIR2 module README did not state it — **confirm the exact module/config at B3**. EHRbase
   auth is openEHR-native; SMART-on-FHIR would live in its FHIR bridge.

## Recommendation
**OpenMRS (FHIR2 module) as the peer.** It is the only candidate that is **FHIR-R4-native**,
so it connects to the existing wso2/fhir-broker surface with **zero new translation layer**
and its resources validate against the vendored AU Core SDs directly. MPL 2.0 permits
vendoring if ever needed, and as a network peer no licence infects the runtime. Bahmni is the
same engine with extra bundling (pick only if those modules are wanted).

**EHRbase is the licence-cleanest alternative** (Apache-2.0) and the strongest openEHR
standards backbone — but for a **FHIR-R4/AU-Core-pinned** repo it forces a FHIR bridge and
carries the highest conformance risk. Choose it only if Apache-2.0 licence purity outweighs
the integration risk — an org/architecture call, which is why this is a HALT.

## Decision (B1 HALT) — RESOLVED 2026-07-14
- **D-B1-1 — the EHR peer: BAHMNI** (operator decision). Bahmni is built on OpenMRS, so its
  FHIR surface is the **OpenMRS FHIR2 module (native FHIR R4)** — the same R4 base URL the
  fhir-broker already fronts — bundled with OpenELIS (lab), dcm4chee (imaging), and Odoo (ERP).
  Licence: OpenMRS Public Licence (MPL-based) for the core FHIR2 module; the bundled
  components carry their own licences but are not vendored (network peer). For Track B the
  peer endpoint is Bahmni's **OpenMRS FHIR2 R4 base URL**; the bundled modules are out of
  scope for the CDS-grounding read path (a later track may use OpenELIS lab as a live lab
  source for the investigation parser — flag, do not scope here).

## Carried into B2 (after the decision)
- B2 contract-lock: `fhir-broker` live-backend peer config for the chosen EHR; Receipt shape
  for peer reads; `example.invalid` env placeholders (`HEYDOC_FHIR_MCP_ENDPOINT` /
  `HEYDOC_FHIR_UPSTREAM_BASE`).
- Confirm SMART App Launch support on the chosen peer.
- Scope the AU-profiling step (or defer it explicitly) — separate from connect.

## Register / gap impact
Track B advances the live-`fhir-broker` gap — **distinct from blocker #1** (pharmacology).
No register move at B1 (research only).
