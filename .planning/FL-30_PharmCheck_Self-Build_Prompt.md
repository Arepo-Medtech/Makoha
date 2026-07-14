# FL-30 · PharmCheck Self-Build — Multi-Step Execution Prompt

**For:** Claude (agentic build session, run inside the Breath-Ezy repo)
**Author/Owner:** Ken Lee — Senior Pharmacist (AU) + Senior Software Developer
**Scope:** Build Breath-Ezy's own **synthetic, self-developed pharmacology reference + decision engine** ("PharmCheck live core") — an *equivalent* of MIMS-AU / eTG / AMH / AusDI covering **NTI, drug–drug/drug–condition interactions, renal dosing, and AU scheduling** — behind the **frozen PharmCheck contract**, validated in staging.
**Release context:** FL-30 · checklist C1 · M9/L6 · **Release Blocker #1**. Mock core + Trunk 8.0 firewall already built/tested. This prompt builds the **live adapter behind the frozen contract**.
**Done when:** live PharmCheck validated in staging against the case set; `pharmacology-server-unbuilt` resolved.

---

## 0 · READ FIRST — hard guardrails (do not violate)

These are binding constraints on every step below.

1. **Copyright / IP boundary (non-negotiable).**
   - MIMS-AU, AusDI, eTG (Therapeutic Guidelines), and AMH are **proprietary, copyrighted commercial products.** You must **not** copy, scrape, ingest, paraphrase-at-scale, or republish their monograph text, curated interaction pairs, dosing tables, or any substantial portion of their content.
   - Where AusDI credentials are provided, they are used **for structural/UX scoping only** — to observe *the shape of the data model and field taxonomy* (what fields exist, their relationships, how a monograph is decomposed). Record **structure, not content.** Do not persist AusDI page text, tables, or record values into the repo or the datastore. Capture schema/field-name observations in a notes file and cite them as "structure reference only."
   - All **content** in the datastore must come from (a) **primary/open authoritative sources** (below) or (b) **original authoring by the clinical owner (Ken).** Every synthetic record must carry provenance.

2. **Not clinical advice by construction.** This is Class-1 SaMD scaffolding. Every output path must preserve the existing **human sign-off / verification-gate** requirements. Do not weaken, bypass, or auto-approve any gate. The engine *proposes*; a registered practitioner *disposes*.

3. **Frozen contract is law.** The PharmCheck contract is frozen. You **conform to it**; you do **not** edit it. If you believe the contract is wrong or insufficient, **stop and raise it** — do not work around it.

4. **Trunk 8.0 firewall + mock core stay intact.** The live core sits *behind* the same contract the mock satisfies. The firewall boundary and mock must remain runnable for fallback and A/B parity testing.

5. **Provenance or it doesn't ship.** Every clinical fact (interaction, NTI flag, renal threshold, schedule) must have `source`, `source_ref`, `authored_by`, `reviewed_by`, `review_status`, `version`, `effective_date`. No anonymous facts.

6. **Ask before assuming** on: the exact contract schema, the existing stack, the case-set location, and secrets handling. Detect first, then confirm, then build.

---

## 1 · Orient — detect the existing stack & contract (no code yet)

Do not write feature code in this step. Produce a short **Orientation Report**.

1. Inspect the repo and determine the **existing Breath-Ezy stack**: language(s), service framework, datastore(s), schema/validation library, test runner, migration tooling, secrets manager, CI. Match it — do **not** introduce a new stack.
2. Locate and read the **frozen PharmCheck contract** (interface definition / schema / OpenAPI / types). Extract: request shape, response shape, error taxonomy, versioning field, and every field the mock currently satisfies.
3. Locate the **mock core**, the **Trunk 8.0 firewall** boundary, and the **staging case set** referenced in the "done when" criteria.
4. Locate the **secrets manager** wiring (creds "via secrets manager" per C1). Confirm how a live-feed credential *would* be injected — but do not yet add real secrets.
5. Output the Orientation Report:
   - Stack summary (with file/path evidence).
   - The frozen contract, restated field-by-field.
   - Gaps/ambiguities you need resolved before Step 2.
   - Confirm the mock still runs green against the contract.

**Gate:** Present the Orientation Report and wait for Ken's confirmation before proceeding. If the contract or case set can't be found, stop and ask.

---

## 2 · Contract lock — pin the live core to the frozen PharmCheck interface

1. Restate the frozen contract as the **single source of truth** for the live adapter's I/O. Generate (from the contract, not by hand) the types/validators the live core will implement, in the repo's existing validation library.
2. Define the **clinical domain model** *behind* the contract (internal, not exposed) covering the four mandated capabilities plus CDS:
   - **Drug / product entity** — ingredient, form, strength, route, ARTG ID (if applicable), synonyms, ATC code.
   - **AU scheduling** — Poisons Standard (SUSMP) schedule (S2–S9, unscheduled, S10), state/territory appendix flags, and the effective schedule date.
   - **NTI (narrow therapeutic index)** — boolean flag + rationale + monitoring hint, per agent.
   - **Interactions** — drug–drug, drug–condition, drug–renal-function; severity, mechanism (mechanistic class, not copied prose), management category, evidence tier.
   - **Renal dosing** — eGFR/CrCl bands, dose adjustment rule, contraindication threshold, monitoring.
   - **CDS envelope** — the decision output the contract expects (alert level, machine rationale, required-human-review flag).
3. Define the **provenance & governance fields** (from Guardrail 5) on every clinical entity.
4. Add a **feed-abstraction seam**: the live core reads clinical facts through a `PharmDataSource` interface with **two implementations** — `SyntheticSelfDevelopedSource` (built now) and `LicensedFeedSource` (**stubbed placeholder** for a future MIMS/AusDI/commercial licensed feed). The contract and engine must not care which is active; selection is config/flagged.

**Gate:** Types compile/validate against the frozen contract; mock parity unaffected. Present the domain model + the two-source seam for sign-off.

---

## 3 · Build the synthetic self-developed data model + authoring pipeline

Content comes **only** from primary/open sources + Ken's original authoring (Guardrail 1). Build the ingestion/authoring pipeline, then populate.

### 3a · Wire authoritative primary/open sources (as comprehensive as possible)
Ingest structured, permissively-usable/primary data; store provenance for each. Candidate sources (confirm licence terms per source before ingest; prefer official bulk/API over page scraping):
- **TGA Poisons Standard (SUSMP)** — statutory scheduling (S2–S10); this is law/public.
- **TGA ARTG** — registered goods, ingredients, sponsors, product identifiers.
- **PBS Schedule (data.gov.au / PBS API)** — items, restrictions, formulary structure.
- **TGA Product Information / CMI** where openly published — used for *structured attributes* (not verbatim monograph republication).
- **Open drug ontologies** — e.g. ATC/DDD classification, RxNorm/SNOMED-CT-AU concept IDs for mapping/interoperability (respect each licence; AMT/SNOMED CT-AU via NCTS terms).
- **Renal function reference** — standard eGFR/CrCl banding (Cockcroft-Gault / CKD-EPI) — formulae are public; author the dosing rules originally.
- **Peer-reviewed / open guidance** for interaction mechanisms and NTI status — cite primary literature; author original mechanistic summaries.

### 3b · AusDI structure-only scoping (if creds supplied)
- Portal: <https://subscriptions.hcn.com.au/> 
https://ausdi.hcn.com.au/
Username: <thefreodr@gmail.com>
Password: <Shrimp0-Grudging6!>
- Use the supplied credential **once**, read-only, to observe the **field taxonomy and record decomposition** (what a monograph's structure looks like). Write findings to `docs/structure-notes/ausdi-structure-observations.md` as **schema shape only** — field names, cardinality, relationships. **No content values, no tables, no prose** copied. Mark every note "structure reference — not content."
- If no creds are supplied, skip; derive structure from the primary sources + open ontologies above.

### 3c · Authoring + review workflow
- Build a pipeline where ingested primary data + Ken's original clinical authoring produce **reviewed, versioned records**. Each record: `draft → clinician_review → approved`, stamped with `authored_by` / `reviewed_by`.
- Seed the four capabilities with an **initial curated set sized to the staging case set** (enough to pass validation), each fact provenanced and marked `review_status`.
- Provide a **bulk authoring format** (e.g. versioned YAML/CSV → validated import) so Ken can expand coverage without code changes.

**Gate:** Show (a) source-by-source provenance coverage, (b) the AusDI structure-notes file proving no content was captured, (c) a sample of authored records with full governance stamps. Wait for clinical sign-off on the seed set.

---

## 4 · Implement the live adapter behind the frozen contract (M9)

1. Implement `SyntheticSelfDevelopedSource` against the `PharmDataSource` interface, backed by the datastore.
2. Implement the **live PharmCheck core**: given a contract-shaped request, resolve drugs → evaluate **scheduling, NTI, interactions, renal dosing** → emit the contract-shaped CDS response, **always** setting the required-human-review flag per the governance rules (never auto-clear a gate).
3. Place it **behind the frozen contract and the Trunk 8.0 firewall**, swappable with the mock by config flag. Keep the `LicensedFeedSource` stub in place and switchable for the future licensed feed.
4. Determinism & safety: identical input → identical output; unknown drug / missing data → **explicit "insufficient data, escalate to human"**, never a silent pass. No fabricated facts at runtime — the engine only surfaces provenanced records.
5. Logging/audit: every evaluation writes an auditable trace (inputs, records used with versions, decision, gate state) for the clinical safety case.

**Gate:** Live core answers the full contract surface; firewall + mock swap both still work.

---

## 5 · Staging validation against the case set

1. Run the **staging case set** against the live core. For each case compare against expected: scheduling, NTI flag, interaction severity/management category, renal dose rule, and CDS gate state.
2. **A/B parity:** run mock vs live vs (stubbed) licensed-source path; confirm contract-shape parity across all three.
3. **Clinical-safety verification gate:** produce a validation report Ken signs off — pass/fail per case, any clinical discrepancies, coverage of the four capabilities, and confirmation that **no human-review gate was bypassed**.
4. **Adversarial / edge tests:** unknown drug, polypharmacy stack, dialysis/anuric renal state, S8/S9 handling, NTI + interaction co-occurrence, contradictory inputs → all must fail safe to human escalation.
5. Resolve the `pharmacology-server-unbuilt` flag **only** when: live PharmCheck validated green in staging, provenance/governance complete, gates intact, and Ken has signed the clinical validation report.

**Gate (final):** Present the signed staging validation report + the resolved-flag summary. Do not mark FL-30 done without Ken's explicit clinical sign-off.

---

## 6 · Deliverables checklist

- [ ] Orientation Report (stack + restated frozen contract).
- [ ] Contract-locked types/validators (generated from frozen contract).
- [ ] Internal clinical domain model (scheduling / NTI / interactions / renal / CDS) + provenance fields.
- [ ] `PharmDataSource` seam with `SyntheticSelfDevelopedSource` + stubbed `LicensedFeedSource`.
- [ ] Authoring/ingestion pipeline + bulk authoring format.
- [ ] Provenance coverage report + AusDI **structure-only** notes file (proof of no content capture).
- [ ] Live PharmCheck core behind frozen contract + Trunk 8.0 firewall, mock-swappable.
- [ ] Audit/trace logging for the safety case.
- [ ] Signed staging validation report; `pharmacology-server-unbuilt` resolved.

---

## 7 · Operating rules for this build session

- Work **step by step**; stop at each **Gate** for Ken's confirmation. Do not run ahead.
- **Detect, don't assume** the stack, contract, and paths.
- Never print, commit, or hardcode real credentials; use the secrets manager seam only.
- If any step would require copying commercial-DB content to succeed, **stop and flag it** rather than proceeding.
- Keep the mock + firewall green throughout so fallback is always available.
- Surface every clinical judgement call to Ken; the engine never self-approves.

> **Reminder for the human owner:** This scaffolds a decision-support tool; it is not a licensed drug information source and is not clinical advice. Coverage, currency, and correctness of every clinical fact require registered-pharmacist review before any patient-facing use, and a licensed data feed should replace or corroborate the synthetic set before production reliance.
