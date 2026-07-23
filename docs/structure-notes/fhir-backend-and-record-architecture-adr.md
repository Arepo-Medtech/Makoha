# ADR — FHIR backend & record architecture (Mechanical Inventory Phase C)

**Status:** ACCEPTED (operator decision, 2026-07-24). Supersedes nothing; records a decision the
repo did not previously hold.
**Deciders:** operator/clinician (Ken). Classification + PHI-residency implications flagged for
**legal counsel** (see §6) — this ADR records an engineering decision, it does not decide device
classification.
**Scope:** the `fhir-broker` backend and where the venture's patient record / system-of-record lives.
**Not legal or regulatory advice.**

---

## 1. Context

`fhir-broker` (`mcp/servers/fhir-broker/`) resolves `fhir_read`/`fhir_search` → `{resource|bundle,
receipt}`. It has shipped mock-by-default with a **wso2** live adapter (`live-backend.js`, H1) — a
Python MCP↔FHIR adapter that *fronts* a separate FHIR server, off the Node/TS stack. The Mechanical
Inventory dossier (§L2) and the venture blueprint (`CDSS_MEGA_PROMPT_2026_v1.2` L2 / STEP 2) both
call for choosing a real FHIR **server** backend, recommending **Medplum** for stack-fit.

Separately, the venture needs a durable **patient record / EHR** — somewhere consult notes are
written and scripts/treatments are ledgered — and an operational spine for the pharmacy/clinic layers
(Rx-Remedy). The repo already registers `au-bahmni` as an AU record **source** (OpenMRS FHIR2 R4),
currently a metadata scaffold.

The venture blueprint gives a hard directive for the patient record (Step 9 / L10, verbatim):
> "(AU)PAIR persists to the **same AU-Core-profiled FHIR spine** as the clinician side. One record,
> two views. … the patient record is **not a new datastore** … **Do not build a parallel record.**"

## 2. Decision

1. **Medplum is the `fhir-broker` FHIR backend AND the system-of-record — the single FHIR spine.**
   Chosen because it is a headless, developer-centric, FHIR-native EHR on the Node/TS stack: it lets us
   build custom application logic directly against a standards FHIR store, which is what makes the
   blueprint's "one record, two views" actionable in code — `(AU)CARE` (clinician) and `(AU)PAIR`
   (patient-owned) as **AccessPolicy-scoped views over one Medplum record**. Consult notes are FHIR
   `DocumentReference`/`Composition`/`Encounter`; scripts are `MedicationRequest`; treatments are
   `CarePlan`. Apache-2.0; self-hosted (see §6).

2. **Bahmni is a deliberately "semi-siloed" operational / traditional all-in-one clinical EHR** — a
   registered role, **not** the CDSS's live spine. Its roles:
   - partner-clinic **ingest source** (existing `au-bahmni`, SMART-on-FHIR);
   - **Rx-Remedy / clinic-operations** layer (dispense queue, POS, supplier ordering — Bahmni's Odoo ERP);
   - **clinical-audit** running + tracking;
   - operational **patient-record retrieval**;
   - **order-management engine** for blood/imaging requests (Bahmni's OpenELIS / dcm4chee);
   - **results-ingest repository** for returning results.

3. **wso2** (`live-backend.js`) is **retained as a rollback / REFERENCE** live backend, not deleted.

## 3. The deliberate deviation (recorded honestly)

Decision (2) **knowingly deviates** from the blueprint's "do not build a parallel record" directive,
by the operator's explicit call. The rationale: Medplum-as-headless-spine is the right *live clinical*
record, but the venture also needs a *traditional, operational* all-in-one EHR for the inward
pharmacy/clinic plumbing that a headless FHIR store is not meant to be — and Bahmni fits that role
well. This is logged as an operator decision with its rationale, per the CLAUDE.md regulatory posture
(surface + record; do not silently override a documented directive).

Per the blueprint's own rule ("where this document and the repository disagree, the repository wins"),
**this ADR is now the authoritative in-repo position**; the mega-prompt may be updated to a v1.3 to
reflect it (operator's document — not edited here).

## 4. The guardrail that keeps this from becoming "record drift"

The drift the directive guards against is prevented by a strict **demarcation + one grounding
contract**:

| Concern | Store | Rule |
|---|---|---|
| Live CDSS FHIR spine + grounding source-of-truth ((AU)CARE) | **Medplum** | everything the regulated reasoning pipeline reads/writes for a live consult |
| Patient-owned longitudinal **view** ((AU)PAIR) | **Medplum** (AccessPolicy view) | a view on the spine — **not** a new store |
| Operational / backend clinic EHR (audit, orders, results-ingest, Rx-Remedy, partner interop) | **Bahmni** | operational; **not** a grounding source-of-truth |
| A Bahmni datum entering the (AU)CARE reasoning pipeline | Bahmni → **record-sources ingest** | SMART-on-FHIR → Observation→parser→session-store; **provenance-tagged, receipt-gated, no auto-promotion to a clinical fact without clinician confirm** |

**The discipline is not diluted:** because any Bahmni fact that touches (AU)CARE reasoning crosses the
*existing* record-sources ingest boundary, it is governed identically to any external source — the
no-raw-lab, receipt, and no-auto-promote invariants hold regardless of the fuller store behind it.

## 5. The (AU)CARE / (AU)PAIR regulatory fence — registered, not built (C-5)

The venture's patient-facing arm `(AU)PAIR` must stay **health-literacy, non-diagnostic**, or it
crosses TGA Rule 4.5(1) into patient-facing CDSS *one class higher*, with no clinician gate to buy the
tier back (blueprint C-5, HIGH risk). This ADR **registers that boundary as a first-class, tracked
architectural fence**, to be **enforced by the verifier** (the FORBIDDEN/ALLOWED list) and kept under
change control (K9) — earmarked for the patient-layer build (blueprint Steps 9–14), which is
**sequenced after** the clinician-facing verification gate + the C-5 boundary test exist. **No
patient-facing layer is built in Phase C.** It is registered so future work targets the fence
correctly and cannot drift across it silently.

## 6. Deferred + counsel-owned

- **C.3 (deferred, operator + build-order #6):** live self-hosted Medplum in AWS `ap-southeast-2`
  (AU residency), full OAuth2 client-credentials via the secrets seam; Bahmni operational deployment;
  validation against the synthetic case set in staging.
- **Counsel-owned (surface, not decide):** the dual-store choice; PHI residency across two stores
  (both must be AU-resident and inside the audit perimeter); the (AU)PAIR classification reading
  (blueprint C-5 says decide "in writing, with counsel"). Model-retraining on patient data stays a
  separate, explicit, default-OFF, per-patient consent switch.

## 7. What Phase C actually shipped (C.1 + C.2)

- `mcp/servers/fhir-broker/medplum-backend.js` — first-party clean-room Medplum FHIR R4 REST adapter
  (Node `fetch`, no `@medplum/*` dep), behind the existing contract; fail-safe; mode `live`; residency
  guard (hosted SaaS refused in production); optional bearer via the secrets seam.
- `index.js` — `HEYDOC_FHIR_BACKEND = wso2 (default) | medplum` selector; **mock behaviour
  byte-identical** (the choice only affects the live branch).
- `test/contract-fhir-medplum.js` — full mocked-transport contract (in `npm test`); `contract-fhir-live`
  / `-broker` / `-conformance` unchanged and green.
- Registration: this ADR + harvest-manifest `medplum` row + `au-bahmni` role note + register/gap/
  server-map/CHANGELOG entries.

**Live connect is NOT done** (deferred, §6). Nothing patient-facing. All hard limits preserved.
