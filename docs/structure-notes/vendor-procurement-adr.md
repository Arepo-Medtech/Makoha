# ADR — pharmacology / identity / eRx vendor procurement (Mechanical Inventory Phase D)

**Status:** ACCEPTED direction (operator, 2026-07-24). **Docs-only** decision record + vendor scaffolds.
The vendor pick, contracts, credentials, licence clearance, and dispensing-law position are
**operator + legal-counsel** decisions this ADR frames — it does not make them.
**Not legal or regulatory advice.**

---

## 1. Context

The pharmacology **core** is built and clinician-signed (FL-30, KL): the engine reads a curated,
signed datastore through the `PharmDataSource` seam; Trunk 8.0 firewall wired; `pregnancy_check`/
`hepatic_check` engine-wired. But the **patient-facing arm is RED** — the `cds-adapter` slot (the
*only* authoritative dose/interaction/contraindication source for a patient path) is
**EMPTY→HARD_FAIL** by default, and the `LicensedFeedSource` (the home for a commercial drug feed) is
a **SAFE_STUB** (fails closed, licence-uncleared). Connecting a live pharmacology vendor is
**build-order #1** — the highest-priority patient-facing gap (R-22, Critical).

**The seams are already built and safe — no engineering is blocked.** What Phase D needs are things
the agent cannot do: contract a vendor, hold credentials/licences, and take a dispensing-law
position. So Phase D is **procurement framing + registration**, not code.

**Why a drug-data buy is the floor:** AMT is *identity, not decision support* (blueprint L1 FLAG) — it
will never yield interactions/dosing. The self-developed datastore is DEV/synthetic and cannot be the
authoritative patient-facing source. The **OpenCDS gateway (Track A, already built + tested)** is a
rules *engine*, not a drug *database* — it still needs a DB feed. So a commercial drug-data feed
(MIMS-AU or equivalent) is unavoidable for the patient path, whichever CDS route.

## 2. Decision

1. **Parchment (parchment.health) is the PRIMARY make-or-buy evaluation target** (blueprint C-4): an
   ADHA-approved AU integration API **claiming** to bundle **MIMS medicine database + eRx conformance +
   HI Services (identity) + SafeScript/QScript + all state RTPM** (subscription covered), which would
   collapse `pharmacology` + `identity-au` + `messaging-geo` into **one contract**. **This claim is
   UNVERIFIED** — a vendor claim, not a fact — and the operator must verify it independently against
   Parchment's actual contract/API terms before relying on it.
2. **MIMS-direct is the documented fallback** — MIMS Web Services as the drug-data/CDS feed, with HI
   Service (PRODA/HPOS + NASH cert) self-integrated for `identity-au` and eRx contracted separately.
3. **The OpenCDS gateway (Track A) is retained as the rules layer** regardless of the data-feed choice
   (it is built + tested; it consumes a drug-DB feed, it does not replace one).
4. **Registered as data-source scaffolds** (`data-sources.json`): `mims-au` and `parchment`,
   `licence_status: pending`, `use_restriction: structure_only` (live-queried under licence, never
   copied into the repo), **not connected**, no fact cites them. **Parchment's MCP server is kept OUT
   of the harvest-manifest** — evaluation only, not wrapped (operator decision).

## 3. Where each vendor plugs in (seams, all built)

| Need | Seam (built) | Fill route |
|---|---|---|
| Drug data + patient-facing CDS | `pharmacology/cds-adapter` (EMPTY→HARD_FAIL) + `LicensedFeedSource` (SAFE_STUB) | `PHARM_CDS=FILLED` + `HEYDOC_PHARM_CDS_ENDPOINT` → commercial vendor (MIMS via Parchment or direct); OR `PHARM_CDS=AU_OSS_CDS` → OpenCDS gateway (rules) **+ a drug-DB feed** |
| Identity (IHI / HPI-O) | `identity-au` (stub) | Parchment HI Services (bundled) OR self-integrated PRODA/HPOS + NASH cert |
| eScript / messaging | `messaging-geo` (mock, never-sends) | Parchment eRx (bundled) OR a separate eRx vendor |

## 4. Constraints (counsel-owned — surfaced, not decided)

- **C-6 (HIGH):** Rx-Remedy is **decision-support + logistics, never a dispenser**; **mandatory
  pharmacist "Click to Confirm and Dispense"**; **no revenue-share on script value** (state ownership
  law); asynchronous prescribing restricted (a triage loop ending in a script routes to a synchronous
  consult with an AU-registered practitioner).
- **eRx / ADHA conformance** is a hard gate (EP Conformance Profile); **HI Service** needs PRODA/HPOS +
  a **NASH certificate**.
- A live pharmacology vendor must not reach a patient path until it is connected **and
  staging-validated against the synthetic case set** (FL-34 A4/B4), and the other blockers (TGA
  sign-off, live PBS pull, Clinician Verification Portal) are green.

## 5. What Phase D shipped (D.1, docs-only)

- This ADR.
- `data-sources.json` v1.4.0: `mims-au` + `parchment` scaffolds (pending/structure_only/not-connected).
- Register / gap-register / CHANGELOG / server-status updates (R-22 vendor-arm framing: Parchment-first
  eval as plan-of-record, MIMS fallback, OpenCDS rules layer).

**No code.** Frozen `pharm-intent`/`pharm-check` schemas, the engine, the `PharmDataSource` seam
(`LicensedFeedSource` stays the safe stub), the `cds-adapter` (stays EMPTY→HARD_FAIL), and the OpenCDS
client are all untouched. `contract-pharm-datastore/-data-source/-schema-conformance` green.

## 6. Deferred (build-order #1 / FL-34 A4/B4 — operator + counsel)

Verify Parchment's bundle claim → contract; obtain credentials/licence via the secrets manager;
implement the `LicensedFeedSource` / `cds-adapter` commercial adapter **against the real contracted API
spec** (not buildable now — guessing a commercial API violates the make-or-buy discipline);
staging-validate against the synthetic case set; **legal sign-off** on dispensing lawfulness +
no-revenue-share. Until then the `cds-adapter` stays EMPTY→HARD_FAIL and nothing is patient-facing.
