# Track A · Phase A1 — Research memo (AU_OSS_CDS)

> Status: A1 deliverable, read-only (no code). Produced 2026-07-14 at `main @ 0ebc644`.
> Resolves the "live CDS pharmacology" blocker path via an open-source, vendor-agnostic
> stack. This memo is the input to the A2 contract-lock GATE. Nothing here authorises code.

## Scope recap
Fill the `mcp/servers/pharmacology/cds-adapter/` client with a real, standards-based,
externally-executed CDS provider — **OpenCDS engine executing the clinician-signed FL-30
knowledge base** — behind a new honest `PHARM_CDS` state `AU_OSS_CDS`. Connect + validate
in **staging only**. Green flip stays regulatory-gated (FL-50 → FL-52).

---

## Deliverable 1 — OpenCDS transport recommendation

**What OpenCDS speaks natively.** OpenCDS implements the HL7 **DSS** (Decision Support
Service) standard: a SOAP `evaluate()` operation taking a **vMR** (virtual Medical Record)
payload and returning structured vMR output (observations / DSS results). Knowledge is
packaged as **Knowledge Modules (KMs)** — Drools rulesets + concept mappings — each
addressed by an **SSID** (scoping-entity + business-id + version). Drug/condition concepts
are resolved through OpenCDS "concept determination methods" (code-system mappings).

**The alternative — CDS Hooks.** REST/JSON, FHIR-R4-native, hook types
(`order-sign`/`order-select`/legacy `medication-prescribe`), returns advisory **cards**.
Cleaner transport for a Node/FHIR repo, but cards are *loosely structured advisory content*
— a poor fit for the firewall, which needs **typed per-check verdicts** (HARD_FAIL vs WARN
per `check_id`, with `severity` and typed `flags`).

> **SUPERSEDED 2026-07-15 (FL-34 Phase B, F2) — the internal transport recommendation below did
> not survive contact with the build.** This section recommends the gateway speak **native DSS/vMR**
> to OpenCDS internally. Phase A settled it the other way: the deployed gateway is the **CDS Hooks
> R4** service (`/<context>/r4/hooks/cds-services`), and Phase B's 9 knowledge modules implement
> `CdsHooksExecutionEngine`. **There is no DSS/vMR path.**
>
> The reasoning below — that vMR is structured and "unlike CDS Hooks cards" maps cleanly to typed
> verdicts — was sound as far as it went, and Phase B answers it rather than ignores it: each KM
> emits ONE card carrying the **structured verdict in an extension** (D-B-2), so the shim maps
> `cards → check_verdicts` without ever parsing prose. The typed, monotone-foldable property the
> firewall depends on is preserved; it just rides in an extension instead of a vMR document.
>
> The EXTERNAL recommendation (JSON over HTTPS, mirroring the frozen shapes) stands and is built.

**Recommendation (finalise at A2): a thin JSON gateway in front of OpenCDS.**
- **External wire (our `opencds-client.js` ↔ gateway): JSON over HTTPS**, a request/response
  contract mirroring the frozen `pharm-intent` → `pharm-check` shapes. Keeps our Node/ESM
  adapter in JSON/FHIR — no SOAP/XML/vMR impedance inside this repo.
- **Internal (gateway ↔ OpenCDS): native DSS `evaluate` with vMR**, because vMR output is
  *structured* and maps cleanly to typed `check_results`/`flags` (unlike CDS Hooks cards).
- The gateway is where the FL-30 KMs are loaded and where vMR output is mapped to our
  verdict JSON. It is a **deployed staging service**, not repo code.

Rationale: the firewall's value is typed, monotone-foldable verdicts. DSS/vMR gives that;
JSON-at-our-boundary keeps the impedance out of the safety core. **Tradeoff to note:** one
extra service to stand up in staging (the gateway). A2 confirms transport before any build.

---

## Deliverable 2 — Licence-clearance note (Apache-2.0)

- **OpenCDS licence: Apache-2.0** — verified on opencds.org (2026-07-14): the project states
  OpenCDS is "licensed under the Apache 2 license." Permissive; **no copyleft concern**;
  clears the H0 `licence:check` gate.
- **Integration model: external network peer — NOT vendored.** Our repo calls OpenCDS (via
  the gateway) over HTTPS. We do **not** fork, wrap, bundle, or read OpenCDS source for
  implementation. Consequences:
  - The `licence:check` / `harvest-manifest.json` gate governs *harvested CODE that enters
    the shippable module*. A service invoked over a network boundary is **not** vendored code
    and does not enter the module — so even a copyleft peer would not infect us (arm's-length
    service call ≠ derivative work). Apache-2.0 makes this doubly clean.
- **Register action (A-phase, not A1):** add OpenCDS to `integration/harvest-manifest.json`
  as a **network-peer / reference** entry (`licence: Apache-2.0`, `licence_status: verified`,
  a `network_peer` note that no source is vendored) — for traceability, per the "register a
  source before wrapping it" convention. This is bookkeeping, not a wrap authorisation.
- **On-repo confirmation still owed:** the bitbucket `LICENSE` file could not be read (JS-
  rendered page). Before A3 closes, confirm the Apache-2.0 header on the actual repo tag we
  deploy, to move the manifest entry from documented → on-repo-verified.
- **Secrets boundary (hard):** OpenCDS/gateway endpoint + creds are injected from the secrets
  manager at deploy; `HEYDOC_PHARM_CDS_ENDPOINT` carries an `example.invalid` placeholder in
  `mcpServers.template.json`. No key is ever entered here or committed.

---

## Deliverable 3 — FL-30 KB → OpenCDS knowledge-module mapping

**The KB's real interface.** The FL-30 datastore is exposed to the engine through the
`PharmDataSource` seam (`sources/pharm-data-source.js`), six accessors:
`getAllergyGroup`, `getInteractions`, `getRenalRule`, `getSchedule`, `getNti`,
`getDoseGuidance` (+ `receiptMode()` → `'mock'` until Step-5 validation). Each OpenCDS KM is
authored to reproduce one accessor's verdict from the same clinician-signed datastore
capability — OpenCDS supplies *execution + standards packaging*, **never new knowledge**.

| Frozen `check_id` | PharmDataSource accessor | FL-30 datastore capability | OpenCDS KM | Verdict semantics (must match engine) |
|---|---|---|---|---|
| `allergy_check` | `getAllergyGroup` | allergy-cross-reactivity | allergy-cross-reactivity ruleset | HARD_FAIL on shared allergy group |
| `interaction_check` | `getInteractions` | drug-interactions | DDI ruleset | HARD_FAIL critical / WARN moderate |
| `renal_dosing_check` | `getRenalRule` | renal-rules | renal eGFR-threshold ruleset | HARD_FAIL contraindicated / WARN adjust |
| `nti_check` | `getNti` | nti-register (+ tdm) | NTI monitoring ruleset | HARD_FAIL if no documented monitoring |
| `schedule_8_check` | `getSchedule` | au-scheduling / SUSMP | SUSMP schedule + S8 gate | S8 → PDMP/authority flag |
| (dose guidance) | `getDoseGuidance` | dose-guidance / dose-evidence | dose-range KM | dose emitted **only** on PASS/WARN |
| (contraindication content) | via interactions | strong-contraindications, serious-adverse-effects | contraindication ruleset | HARD_FAIL |
| `hepatic_check` / `pregnancy_check` | reserved (FL-05) | hepatic, pregnancy-risk (reference-only) | KM reserved — **not wired this increment** | — |

**Concept-mapping layer.** OpenCDS KMs must fire on coded concepts. Our datastore keys on
lowercased drug name + optional AMT SNOMED / ATC. Reuse the existing `amt-underlay.js` +
WHO-ATC + RxNorm normalisation (already registered in `data/data-sources.json`) as the
OpenCDS concept-determination input, so KMs match on ATC/RxNorm-normalised ingredients.

**Invariants preserved by the mapping (defence-in-depth):**
1. `opencds-client.js` maps KM output back into the **frozen** `pharm-check` shape; anything
   outside the frozen `check_id` / `flag_type` enums is **dropped** by the strict zod schema,
   never passed through.
2. The client **re-applies** the hard rules locally — it never trusts OpenCDS to emit a dose
   on a HARD_FAIL, paediatric, or BLOCKED result. Dose only on PASS/WARN; HARD_FAIL terminal;
   under-18 → flag-for-review, never a dose.
3. `receiptMode()` stays `mock`/AU_OSS_CDS until staging validation passes — clinician-signed
   knowledge executed by a standards engine is **still not regulator-signed**. OpenCDS does
   not upgrade the provenance tier.
4. E7 floor unchanged: `composeCdsVerdict` folds monotone — the OpenCDS verdict can only ADD
   severity, never rescue an engine HARD_FAIL.

**Recommended wiring (confirm at A2 — decision D-A2-1).** Keep the in-process engine
(`SyntheticSelfDevelopedSource`) as the deterministic monotone floor, and add the
OpenCDS-executed verdict as the authoritative `cds-adapter` slot folded on top. This is
**defence-in-depth**: the same FL-30 facts are executed twice (in-process + external
standards engine) and both must agree; either can HARD_FAIL. Tradeoff: redundant execution
of one KB. Alternative: make OpenCDS the sole executor and demote the engine to a cross-check
— larger blast radius on the frozen firewall path; not recommended for this increment.

---

## Honest gap (surface to operator — does NOT change on approval)
OpenCDS + FL-30 gives a **standards-executed, externally-served, receipted** CDS provider —
a real, strong footing. It does **not** add authoritative interaction/contraindication
knowledge beyond the clinician-signed FL-30 set, and PBS supplies formulary/subsidy only
(`data-sources.json`: PBS "does NOT provide interactions / NTI / renal dosing / allergy /
SUSMP scheduling / PDMP"). Therefore AU_OSS_CDS validated-in-staging is **not** blocker-green;
green requires FL-50 (TGA classification) + FL-52 (operator authorisation).

## Open decisions carried into A2
- **D-A2-1** — wiring model: engine-floor + OpenCDS-slot (recommended, defence-in-depth) vs
  OpenCDS-sole-executor.
- **D-A2-2** — transport confirm: JSON gateway ↔ DSS/vMR (recommended) vs direct DSS SOAP vs
  CDS Hooks facade.
- **D-A2-3** — gateway ownership: first-party thin gateway (we author the vMR↔JSON mapping)
  vs configure an existing OpenCDS web endpoint. Recommend first-party thin gateway (keeps
  the mapping auditable and in-repo-testable against a fixture).

## Register / gap impact (no change yet — A5 moves them)
`R-22` / `FL-34` remain Critical, `blocks_patient_facing:true`, open. A1 produced only this
memo. First register movement is at A5 (PARTIAL → validated-in-staging).
