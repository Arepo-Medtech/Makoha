# Case-Factory Enablement Runbook (Phase B1)

> **What this is.** A short operator runbook for *turning on* the case-factory. The
> factory is already **built and contract-tested** (FLOW_PLAN H4) — every generator is a
> thin, fail-safe Node seam over an **external, commit-pinned** tool that runs
> **out-of-process** (no Java, no model, no vendored code in this repo). "Enabling" it is
> not a build task; it is an **operator/toolchain input step**: install a JDK, obtain the
> pinned generator distributions, set three env vars. Until you do, every generator
> correctly reports `{ available:false, reason }` and **never fabricates a case** — that
> is by design, not a bug.
>
> **Agent boundary.** The engineering agent cannot do the gated steps for you: it does not
> install a JDK, build or download third-party jars, run untrusted external binaries, or
> clinically attest cases. Those are yours. This runbook is the exact sequence.
>
> **Not clinical/regulatory advice.** The C22 AU Core target (§6) is an org/regulatory
> decision this runbook surfaces; it does not make it.

---

## 0. The one-screen version

```bash
# 1. Install a JDK (per Synthea's README at the pinned commit; Java 11+).
# 2. Build the two Synthea distributions at their PINNED commits (§2), producing
#    a synthea-with-dependencies.jar for each; obtain a chatty-notes executable (§3).
# 3. Point the factory at them (paths are NOT secrets):
export HEYDOC_SYNTHEA_JAR=/abs/path/to/synthea-with-dependencies.jar
export HEYDOC_CHATTY_NOTES_CMD=/abs/path/to/chatty-notes            # optional (narratives)
export HEYDOC_MOSTLY_AI_OUTPUT=/abs/path/to/mostly-ai/output        # optional (DP synthesis)
# 4. Prove the seam offline first (no Java needed), then a live smoke:
npm test -- # contract-case-factory.js must stay green
node case-factory/synthea/run-synthea.js   # should now report available (or a clear reason)
# 5. Generate → shape → complete → ingest (§5), then a CLINICIAN attests (§7).
```

The factory **authors nothing into `data/cases/` directly** — everything goes through the
contract-tested ingest (`cases:ingest`), which re-runs the firewall, honesty gate, hashing,
and resequencing. A generated case is `synthetic:true` + `clinician_reviewed:false` and is
**inert** (cannot gate or count toward a release) until a clinician attests it (§7).

---

## 1. Prerequisites (operator-supplied)

| Need | Why | Notes |
|---|---|---|
| A JDK (Java 11+) on `PATH` | Synthea + the AU fork are Java generators | Version per each repo's README at its pinned commit. `java -version` must succeed — the wrapper probes it. |
| Built Synthea jar(s) | The generator the wrapper invokes | `HEYDOC_SYNTHEA_JAR` → an absolute path to a built `synthea-with-dependencies.jar`. |
| chatty-notes executable *(optional)* | Patient-voice narratives from a bundle | `HEYDOC_CHATTY_NOTES_CMD` → an executable that reads a Synthea bundle path as `argv[1]` and writes narrative text to **stdout**. |
| MOSTLY AI SDK output *(optional)* | Second synthetic generator (DP synthesis) | `HEYDOC_MOSTLY_AI_OUTPUT` → the SDK's synthesised-output dir/endpoint. Self-hosted, external. |

None of these are secrets — they are filesystem paths + a runtime. Do **not** put anything
into `.env` that a `.gitignore` rule wouldn't already cover; a jar path is fine in your shell.

---

## 2. Build Synthea at the pinned commits

Pins are the **single source of truth** in `integration/harvest-manifest.json` (each wrapper
reads its own pin from there). Check out **exactly** these commits — a different commit is a
different generator and invalidates reproducibility:

| Manifest `ref` | Repo | Pinned commit | Licence | Used by |
|---|---|---|---|---|
| `dir-synthea` | `synthetichealth/synthea` | `2b0a55bab0ab9ae22204320c80f5880ceb8925aa` | Apache-2.0 | base generator (`case-factory/synthea/`) |
| `fork-synthea-at` | `FHOOEAIST/synthea` | `4647221fae7810649fe470ba419c44326e309c0d` | Apache-2.0 | **AU-localised** generator (`case-factory/synthea-au/`) — see §6 |
| `sib-chatty-notes` | `synthetichealth/chatty-notes` | `a767a57985450be667aa7b938eaca2416e86aeff` | Apache-2.0 | narratives (`case-factory/narratives/`) |

```bash
git clone https://github.com/synthetichealth/synthea.git && cd synthea
git checkout 2b0a55bab0ab9ae22204320c80f5880ceb8925aa
./gradlew build -x test        # produces build/libs/synthea-with-dependencies.jar
```

Do the same for `FHOOEAIST/synthea` @ `4647221…` to get the **AU** jar. (The exact Gradle
target may differ per commit — follow that repo's README at the pinned commit; the artifact
you want is the fat/shadow `*-with-dependencies.jar`.)

> **`FHOOEAIST/synthea` is an Austrian (AT) localisation *template*, not an AU repo.** The AU
> guarantee is **not** the fork — it is mechanical: every generated resource is gated through
> the existing `mcp/servers/fhir-broker/conformance.js` **AU Core conformance validator**
> (`case-factory/synthea-au/run-synthea-au.js`). The README's "AU-localised fork" phrasing is
> a known doc nit; the code labels it AT-template correctly.

---

## 3. Set the environment

```bash
export HEYDOC_SYNTHEA_JAR="/abs/path/to/synthea-with-dependencies.jar"
export HEYDOC_CHATTY_NOTES_CMD="/abs/path/to/chatty-notes"     # optional
export HEYDOC_MOSTLY_AI_OUTPUT="/abs/path/to/mostly-ai/output" # optional
```

For the **AU** generator, point `HEYDOC_SYNTHEA_JAR` at the AU jar (the AU wrapper composes
the base wrapper). If you want both base and AU available in one session, run them in
separate shells with the env pointed at the respective jar.

---

## 4. Verify BEFORE generating (offline, then live)

**Offline (no Java required)** — the committed fixture proves the whole shape end-to-end:

```bash
npm test        # includes test/contract-case-factory.js — must stay green
```

That test asserts (against `case-factory/fixtures/complex-chf.*`, no live Java): generated
FHIR passes AU-Core conformance **and surfaces the C22 divergence**; the shaper+completion
produce a bundle that passes the **real** `cases:ingest --dry-run` (0 problems, 0 leaks);
provenance is `synthetic:true` + `clinician_reviewed:false`; the honesty gate holds (null
hashes, unverified codes, node-10 name == seed); and the **firewall fail-closed** (a
diagnosis name in patient voice makes the shaper throw). If this is green, the seam is sound
and the only variable left is your toolchain.

**Live smoke** — once env is set:

```bash
node case-factory/synthea/run-synthea.js      # base — expect available, or a precise reason
node case-factory/synthea-au/run-synthea-au.js # AU — same, plus the AU-Core target report
```

If a wrapper still says `available:false`, the `reason` tells you exactly what is missing
(unset var, jar not found, `java -version` failed). It will never silently pretend.

---

## 5. Generate → shape → complete → ingest

The factory pipeline (each stage already built + tested):

```
Synthea (Java, out-of-process)          →  FHIR R4 bundle
  + chatty-notes (optional)             →  patient narrative
  → case-factory/to-casebundle.js       →  caseseed (nodes 00/01/02 + node-10 name seed)
  → case-factory/complete-scoring-nodes →  <CASE_ID>.casebundle.json (draft 10 + minimal 11–13)
  → npm run cases:ingest -- --dry-run   →  firewall + honesty gate + leak check (writes nothing)
  → npm run cases:ingest -- --reseq     →  hashes + resequence → data/cases/<id>/
```

Run the dry-run **first** and only `--reseq` when it reports `0` problems / `0` leaks. The
factory never writes to `data/cases/` itself; ingest is the only door in, and it re-applies
every gate.

Post-ingest QC (all already wired):

```bash
npm run cases:qc            # quality checks
npm run cases:verify-codes  # terminology-receipt posture (codes stay unverified until a receipt)
npm run cases:taxonomy      # difficulty/axis taxonomy (a GUIDE, not a quota)
```

---

## 6. The one open engineering decision: C22 (AU Core target)

`case-factory/synthea-au/run-synthea-au.js` targets **AU Core 0.3.0** (per the shaping
contract), but the only StructureDefinitions vendored in this repo are the
**`2.0.1-ci-build`** snapshot (operator decision, per `standards_pins`). `auCoreTarget()`
**surfaces this divergence** (`c22_open: true`) rather than silently picking one — and the
contract test asserts the divergence stays visible.

This is an **org/regulatory intended-use decision**, not one the agent or this runbook
resolves: whether AU Core **0.3.0** or **2.0.0/2.0.1** is the conformance target is
intended-use-adjacent and needs your (clinician/operator) sign-off, with specialist input.
Until you settle it, generation still works — every resource is validated against the
vendored SDs and the `ig_version` used is reported on every result. To retarget 0.3.0, refresh
the vendored SDs; that is its own plan-gated change (tracked as **FL-31 / C22**).

---

## 7. Clinician attestation (the gate that makes a case count)

Every factory case emits `clinician_reviewed:false` and is **inert**: the release gate
(`scripts/eval-case-gate.mjs`) counts **only** `clinician_reviewed === true` cases, so an
unattested synthetic case can neither gate nor admit a release (MI-19). The factory has **no
authority to attest** — that is a clinician judgment (you, KL). After ingest, review each
case for clinical plausibility and flip its review flag per the attestation process before it
is used in `npm run eval:cases`.

---

## 8. Fail-safe & security recap

- **Input-gated, never fabricating.** No jar / no `java` / no cmd ⇒ `{ available:false, reason }`. A fabricated "generated" record would violate the synthetic-only + no-fabricated-facts floor as surely as a live fabrication.
- **Synthetic-only.** Inputs are generation profiles (module/count/seed) or synthetic bundles — never a real patient record.
- **No secrets in the repo.** Env values here are paths + a runtime, not credentials. Keep `.env` / cert paths under the existing `.gitignore` rules; never commit a jar.
- **`case-factory/` is a non-shippable path** in the harvest manifest — it is tooling, not shipped product code.

---

## 9. Quick reference — env vars & pins

| Env var | Points at | Consumed by |
|---|---|---|
| `HEYDOC_SYNTHEA_JAR` | built `synthea-with-dependencies.jar` | `run-synthea.js`, `run-synthea-au.js` |
| `HEYDOC_CHATTY_NOTES_CMD` | executable: bundle path `argv[1]` → narrative on stdout | `run-chatty-notes.js` |
| `HEYDOC_MOSTLY_AI_OUTPUT` | MOSTLY AI SDK synthesised-output dir/endpoint | `eval/synthetic/mostly-ai/run-mostly-ai.js` |

Pins (checkout targets): `synthetichealth/synthea@2b0a55ba` · `FHOOEAIST/synthea@4647221f` ·
`synthetichealth/chatty-notes@a767a579` — all Apache-2.0, all in
`integration/harvest-manifest.json` (the source of truth).
