# case-factory/ — synthetic case generation (FLOW_PLAN H4)

Offline, **synthetic-only** generation of AU-Core candidate cases that feed the existing
`data/cases/` evaluation corpus **through** `scripts/ingest-case-bundles.mjs`. This module
authors nothing into `data/cases/` directly and invents no second path — it produces a
`<CASE_ID>.casebundle.json` and the existing, contract-tested ingest does the rest
(schema validation, the field-scoped firewall, `--reseq` id assignment, hashing).

## Pipeline (two-phase — CONTRACT §5)

```
external generators (Java, OUT-OF-PROCESS)          this Node module
──────────────────────────────────────────         ──────────────────────────────────
synthea / synthea-au  →  FHIR R4 bundle  ┐
chatty-notes          →  patient voice   ┴─▶  to-casebundle.js      (Phase A: seed)
                                              → <CASE_ID>.caseseed.json
                                                (00/01/02 + 10.primary_diagnosis.name seed)
                                              complete-scoring-nodes.js (Phase B)
                                              → <CASE_ID>.casebundle.json
                                                (draft 10 from seed + schema-minimal 11–13,
                                                 clinician_reviewed:false)
                                              ▼
                          scripts/ingest-case-bundles.mjs --dry-run → --reseq
                          (firewall + honesty gate + split + hash + reseq)  →  data/cases/
```

The **shaper (`to-casebundle.js`) is the single new integration surface** (CONTRACT §11);
everything downstream of the `.casebundle.json` is the existing ingest, untouched.

## Process boundary & input-gated status

The generators are Java/JVM tools and run **out-of-process behind a CLI boundary** — no
Java is vendored into this Node repo (the H1 fhir-live precedent). Each wrapper is
**fail-safe**: with no toolchain configured it returns `{ available:false, reason }` and
**never fabricates** a bundle or narrative.

| Wrapper | External repo (pinned, Apache-2.0) | Env to enable |
|---|---|---|
| `synthea/run-synthea.js` | `synthetichealth/synthea` | `HEYDOC_SYNTHEA_JAR` + `java` on PATH |
| `synthea-au/run-synthea-au.js` | `FHOOEAIST/synthea` (AU-localised fork) | as above + AU Core conformance gate |
| `narratives/run-chatty-notes.js` | `synthetichealth/chatty-notes` | `HEYDOC_CHATTY_NOTES_CMD` |

Actual volume generation is **input-gated** on a Java runtime + the external distributions.
The shaper + completion + ingest path is proven **offline** against a committed synthetic
fixture (`fixtures/`) by `test/contract-case-factory.js`.

## AU Core target — C22 is unsettled

Target is **AU Core 0.3.0** per FLOW_PLAN / the shaping contract. The only vendored
StructureDefinitions in-repo are the **`2.0.1-ci-build`** snapshot
(`mcp/servers/fhir-broker/au-core/`, operator decision per `standards_pins`).
`synthea-au/run-synthea-au.js#auCoreTarget()` surfaces this divergence (`c22_open:true`);
validation runs against the vendored SDs and reports the `ig_version` it used. Refresh the
vendored SDs to 0.3.0 if/when C22 is settled — do not silently pick.

## Invariant floor (never weakened)

- **Synthetic only** — fixtures/synthetic input only; `synthetic:true` always; a real
  record never enters the factory.
- **Firewall** — bundles flow **through** ingest; the generator authors PLACEHOLDER 10–13
  **from its own seed** (`clinician_reviewed:false`), and **never opens** any existing
  `data/cases/*/10–13`.
- **Augmented, not autonomous** — generated cases are `clinician_reviewed:false`; they move
  the *raw* distribution only. The *trusted* eval distribution moves only after a clinician
  attests them (the same bar the 301 cleared).
