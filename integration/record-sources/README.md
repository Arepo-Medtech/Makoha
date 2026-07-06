# record-sources — patient-record ingestion spine (FLOW_PLAN H1)

The boundary every external provider record crosses **before any trunk sees it**.

## Why this is first-party (not the Fasten wrap FLOW_PLAN named)

FLOW_PLAN H1 named `fastenhealth/fasten-sources` as the SMART-on-FHIR client library to wrap
(Apache-2.0 in the register). At H1 that upstream was found **private/404**, and `pkg.go.dev`
detects **no licence for any retained version** (including `v0.6.25`, the one `fasten-onprem` pins).
No licence = all-rights-reserved: the code may not be wrapped, forked, or read for implementation.
The manifest row was downgraded `ADOPT → REFERENCE` (`integration/harvest-manifest.json`,
`dir-fasten-sources`), and this module is a **clean-room implementation of the public
[SMART App Launch 2.0.0](https://hl7.org/fhir/smart-app-launch/) standard** — no third-party code
read or copied, so it carries no external licence obligation and passes `npm run licence:check`.

## What it enforces

```
provider record (FHIR R4, via fhir-broker: mock OR wso2 live #16)
     │  ingestBundle() / ingestResource()
     ├─ Observation with a numeric value ─▶ investigation-parser (C3) ─▶ qualitative fact ─▶ session-store (C8)
     │                                        (raw number is stripped; never stored, never emitted)
     └─ any other resource ──────────────▶ bare {resourceType, id} reference ─▶ session-store (C8)
                                              (demographics dropped; session-store guard is the backstop)
```

- **No raw lab numbers leave this module** — only the parser's qualitative `lab_result` fact is stored.
- **No demographics persist** — non-lab resources are reduced to a bare reference; the session-store
  demographic guard throws on anything demographic-shaped that slips through (Trust Boundary 4).
- **Encounter-scoped** — state lives only between `openEncounter()` and `closeEncounter()`; closing
  destroys it.

## Live connection is input-gated

`au-providers/au-providers.json` is **metadata only**: SMART App Launch endpoints and a `client_id_ref`
that *points at* a secrets-manager key — never a secret. Every AU provider ships `status: "input_gated"`
until an operator supplies conformance registration + credentials. `buildAuthorizeRequest()` refuses a
provider that is not `available`. The only `available` entry is the public **HAPI R4 synthetic sandbox**,
the H1 smoke target — which `fhir-broker/live-backend.js` **refuses in production**.

## Rollback

The network fetch is delegated to the `fhir-broker` contract. With `HEYDOC_FHIR_MCP_ENDPOINT` unset,
`fhir-broker` stays on the mock path — a complete rollback with no code change.
