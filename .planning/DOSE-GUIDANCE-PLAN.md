# Dose-guidance pipeline — PLAN (awaiting Phase 2 approval)

> Mode: IDE Planner. Produced 2026-07-15 at `main @ e2b940e`. **Nothing here authorises code.**
> Operator ruling 2026-07-15: park FL-34 Phase B; plan this properly (TGA PI + AMASS verification,
> authoring-time only, Tier A first). Research basis: `.planning/DOSE-GUIDANCE-RESEARCH.md`.
> Register items: `dose-guidance` (no item yet — D2 below opens one), gap R-22.

## The central design constraint (everything else follows from this)

**The agent must never originate a dose number.** Not from parametric memory, not from an AMASS
FDA/EMA label, not from "APF22 says". The `no-dosages-from-the-LLM` hard limit does not have a
carve-out for a well-cited guess.

The research pass found the existing `dose-evidence-review-queue` records demonstrate this discipline
already, and it is worth being explicit about why they look the way they do. Both records state that
*"APF22 Section D carries an adult common-dosage range for amoxicillin…"* — a statement **about the
monograph**, never the range itself. **No dose number was transcribed, because the agent has no
licensed APF22 copy to read.** That was correct behaviour and this plan preserves it mechanically.

⇒ A dose number may enter the datastore through exactly **two authorised channels**, and the pipeline
must make a third impossible:

| | Channel | Who supplies the number | New access needed |
|---|---|---|---|
| **B** | Clinician entry from APF22 (`path2_clinician_apf_attestation` — **already designed**) | KL, who holds the book | **none** |
| **A** | TGA PI retrieval (public AU primary) | the fetched PI document itself | TGA DB access (operator; **same input FL-05 already waits on**) |

The agent builds the pipeline, fetches and verifies citations, runs the divergence check, and refuses
anything that fails. It never authors the value.

## Correcting my own research memo

`DOSE-GUIDANCE-RESEARCH.md` §2 said the licence wall bars *everything*. **That was too strong.**
`data-sources.json`'s `apf22` entry says `use_basis: "facts_and_citation"`, `content_licence_held: false`,
`attested_by: "KL"` (2026-07-14), and its notes explicitly sanction **"dosing-range facts"** — facts, cited,
never prose or compiled tables. So an APF22-sourced dose *fact* is already clinician-attested as usable.
The wall is real but narrower than I wrote: it bars *copying APF tables* and *the agent inventing numbers*
— it does not bar the clinician entering an attested fact. That is Channel B, and it needs nothing new.

**Source hierarchy** (from the `apf22` note: *"Where a public primary source is the better origin… prefer
it and cite APF22 only corroboratively"*):
`TGA PI` (public AU primary) **>** `APF22` (attested facts, clinician-entered) **>** `AMASS FDA/EMA`
(non-AU — divergence check only, **never** an origin).

## Topology impact

**Runtime blast radius: zero.** Every new moving part lives in `scripts/` authoring tooling, run
offline by a human. The runtime engine keeps reading only the signed datastore. No new runtime
dependency, no receipt-mode change, no trunk change, no MCP-server change, no pipeline edge touched.
This is exactly the dose-evidence precedent (`get_article_metadata` live at authoring time, integrity
bar, unverifiable records dropped).
**Trust boundary in play:** #3 (structured knowledge vs live APIs) — the AMASS/TGA calls are live, so
their outputs are receipt-recorded *in the record's provenance*, not in a pipeline receipt.
**One runtime change, and it is a removal** — see C3.

## Contracts

**`DoseGuidanceSchema` — new, and it does not exist today by design.** `domain/model.js:495` says
capabilities "with a bespoke path (dose_guidance, pbs) are intentionally absent here". Schema-first,
`.strict()`, keyed to the frozen `DOSE_KEYS` the engine already picks (`engine.js:249`):

```js
// The AU dose FACT + its origin. Mirrors DoseEvidenceSchema's integrity discipline: the .refine
// anchors provenance.source_ref to the origin id, so a record can never claim an origin it lacks.
{
  ingredient, context,                       // context = indication/population the range applies to
  safe_dose_range,                           // THE NUMBER — clinician- or PI-supplied, never agent-authored
  adjustment_required?, adjustment_reason?, monitoring_required?, duration_guidance?,
  pbs_authority_required?, pbs_item_code?,   // from pbs-formulary (already ingested)
  origin: {
    channel: "tga_pi" | "clinician_apf_attestation",   // the ONLY two — no third value parses
    reference,                               // PI document id + version/date, or "apf22"
    entered_by,                              // clinician id for channel B; the fetch job for channel A
    retrieved_utc?,
  },
  cross_check: {                             // the AMASS divergence gate — REQUIRED, never optional
    status: "agrees" | "diverges" | "not_available",
    amass_id?, agency?, fda_ema_statement?, divergence_note?, checked_utc,
  },
  corroborating_evidence?: [ { pmid_or_doi } ],   // links into the 261 signed dose-evidence records
  provenance: ProvenanceSchema,
}
```
Refinements (mechanical, not conventions): `origin.channel:"clinician_apf_attestation"` ⇒
`origin.reference === "apf22"` **and** `origin.entered_by` is a clinician id (never an agent string —
this is what makes agent-authoring unrepresentable). `cross_check.status:"diverges"` ⇒ **record cannot
be written to `dose-guidance.json` at all**; it is written to the review queue.

## Phases

### C0 — Schema + source registration + the three defects `[ENG, un-gated, no doses yet]`
- Author `DoseGuidanceSchema` + `validateDoseGuidance`; register in the capability validator map.
- `data-sources.json`: add **`tga-pi`** (`content_ingest`, `verified`, AU primary) and **`amass-regulatory`**
  (`structure_only`, **flagged non-AU / verification-only / never primary for an AU dose**; facts +
  citation only — EMA SmPC prose is © EMA, FDA SPL is US public domain; the strict rule covers both).
- **D3 fix:** `apf22.provides[]` has no dose-range entry while its notes sanction "dosing-range facts".
  Add `dose_range_facts`. Without this, an APF-sourced dose record fails source-capability validation
  — the machine-readable list and the prose currently disagree.
- **D1 fix:** `dose-evidence.json`'s attestation `scope` still reads *"skeleton — no records authored
  yet"* while holding KL's 261 signed records. Correct it to cite the worksheet. (This is what misled
  FL-34 Phase B Finding 3.)
- **D2 fix:** open a register item for `dose-guidance` naming the real blocker (no licensed AU dose
  source on the agent's side; Channel B unblocked, Channel A operator-gated).
**Verify:** `npm test` green; `contract-pharm-datastore` green; new schema unit tests — a record with
`entered_by` an agent string **fails**; `channel:"clinician_apf_attestation"` + `reference:"tga-pi"` **fails**.

### C1 — The AMASS divergence checker `[ENG, un-gated, LIVE NOW, still no doses]`
`scripts/pharm-dose-crosscheck.mjs` — takes an ingredient + a candidate AU range, queries AMASS
RegulatoryCore, returns `agrees | diverges | not_available` + the FDA/EMA statement and `amassId`.
Live-probed and working (2026-07-15). Fully testable before a single dose exists: fixtures for agree,
diverge, and no-record.
**Verify:** fixture tests green; one live smoke against methotrexate (env-gated, skips in CI — the
`smoke-llm.mjs` precedent).

### C2 — Channel B: clinician entry `[ENG tooling un-gated; the DATA needs KL]`
`scripts/pharm-dose-author.mjs` — reads a clinician-completed worksheet (the established
`eval/pharmacology/signoff/*.xlsx` pattern), validates each row against `DoseGuidanceSchema`, runs the
C1 cross-check on every row, and **writes only rows whose cross-check is `agrees`**; `diverges` and
`not_available` go to the review queue with the divergence recorded for KL's adjudication. Elevates the
2 existing queue records via their nominated paths. Stamps `records_checksum` + attestation exactly as
the other datasets do.
**Verify:** fixture tests — a diverging row is provably **not** in `dose-guidance.json` and **is** in the
queue; checksum matches `checksumRecords`; `clinical_sign_off` stays `false` until KL attests.
**Output:** Tier A first (~10 drugs — methotrexate, carbamazepine, phenytoin, the anticoagulants; the
NTI/cytotoxic set already at 14–17 axes). **Not** the 886 PBS rows.

### C3 — Remove the mock dose fallback `[ENG — MUST land with the first real dose]`
`pharm-data-source.js:170` falls through to `mock-data.json.dose_guidance_mock` (3 entries —
amoxicillin, paracetamol, ibuprofen — each self-labelled "(MOCK — not clinically validated)").
The self-labelling is honest **today, when every dose is mock**. The moment `dose-guidance.json` holds
real records, that fallback silently mixes signed and mock doses on one path, and the label becomes the
only thing standing between a clinician and a mock dose presented beside real ones. Absent record →
`null` → no dose. **This is a strict safety improvement and the one runtime change in the plan.**
**Verify:** `contract-pharm-validation` (20/20 + 8/8 adversarial) re-run green; a new test asserts an
unknown drug yields no dose; frozen `pharm-intent`/`pharm-check`/`verification-gate.js` byte-unchanged.

### C4 — Channel A: TGA PI `[OPERATOR-GATED — TGA DB access]`
Only after operator TGA access lands. Fetch the PI document, extract the dose fact, cite document +
version + date, run the same C1 cross-check, same review queue. Rides **the same operator input FL-05's
`pregnancy-risk-bulk-sync-pending` already waits on** — one action serves both.
**Verify:** as C2, plus PI-citation resolution proven per record.

## Verification summary

| Milestone | Proof | Expected |
|---|---|---|
| C0 | schema unit tests; `npm test`; `contract-pharm-datastore` | green; agent-authored + wrong-channel records rejected |
| C1 | cross-check fixtures + env-gated live smoke | green; CI skips the live call |
| C2 | authoring fixtures; checksum; queue routing | green; diverging rows provably excluded |
| C3 | `contract-pharm-validation`; no-dose-for-unknown test; frozen byte diff | green; empty diff |
| C4 | as C2 + PI citation resolution | green (operator-gated) |

## Invariant check
**Preserved, mechanically — not by convention.** *No dosages from the LLM:* the agent cannot author a
number; `origin.channel` has only two values and `entered_by` must be a clinician id for Channel B —
an agent-authored dose is **unrepresentable in the schema**. *No autonomous prescription:* doses still
emit only via `PharmCheck.dose_guidance` on PASS/WARN, never from the LLM; C3 makes this stricter.
*Australian-jurisdiction-only:* AMASS is registered verification-only and can never be an origin;
`cross_check` cannot promote to `safe_dose_range`. *No fabricated facts:* divergence → review queue,
never ship. *Fail-safe default:* absent record → no dose (C3). *Mock-never-as-live:* C3 removes the
mixing path. *Scoring-store firewall:* untouched. *`cds-adapter` EMPTY→HARD_FAIL floor:* untouched —
**nothing in this plan is patient-facing**; datasets stay `-dev`, receipts stay `mock`.

## Register / gap impact
**Opens:** a `dose-guidance` register item (D2). **Closes:** none yet — the item resolves at C4 + FL-50.
**Corrects:** D1 (`dose-evidence` scope), D3 (`apf22.provides[]`).
**Gap-register:** R-22 does not move; blocker #1 stays RED (A4 + FL-50 own that).
**FL-34 Phase B:** parked, not cancelled — its conclusion (no dose KM) is unchanged and now rests on the
licence/authoring reason rather than "nothing is signed". Phase B and this plan are independent.

## New dependencies
**None.** AMASS is an already-connected MCP connector reached at authoring time (dose-evidence
precedent). No npm package. No runtime dependency.

## Regulatory flag (operator's, not mine)
Populating `dose-guidance` moves the device from **withholding** doses to **emitting** them. Per
`<regulatory_posture>` that plausibly alters intended use and clinical risk profile → bears on TGA
classification (FL-50). Flagged, not decided. It does not block authoring into a `-dev`,
non-patient-facing dataset — but it belongs on the record before C2 writes its first row.

## Decisions needed before Phase 3 (GATE)

- **D-DG-1 — Approve the two-channel model** (agent never originates a number; Channel B = you entering
  APF22 facts; Channel A = TGA PI). This is the plan's spine.
- **D-DG-2 — Start at C0–C2 (un-gated) without waiting for TGA access?** *Recommend yes* — Channel B
  needs nothing new, and C4 slots in later without rework.
- **D-DG-3 — Divergence policy: hard-block or clinician-override?** *Recommend hard-block* (a diverging
  row cannot enter `dose-guidance.json`; it goes to the queue). You can still elevate it from the queue
  after adjudication — but the default must be refusal, not a prompt.
- **D-DG-4 — Tier A scope (~10 drugs) for the first pass.** **Now a licence question, not an effort one
  — see "Compilation right" below.** Recommend Tier A.
- ~~**D-DG-5 — Your APF22 access.**~~ **ANSWERED 2026-07-15: KL transcribed all 471 Section D adult +
  paediatric common-dosage ranges personally from his own APF22.** Channel B's provenance question is
  closed — the numbers are clinician-sourced from the book, not agent-generated, so the confabulation
  risk that would have made them unusable does not exist. The per-drug clinician time Channel B assumed
  is already spent. Source artifact: `~/Downloads/files/dose_evidence.{csv,md}` (**operator's local file
  — NOT committed, see below**).

## Compilation right — why scope is now the live question

KL's confirmation removes the *authorship* risk and leaves exactly one constraint, and the answer to it
changed shape. Individual dose facts are not copyrightable — `data-sources.json` says so
(*"Facts are not copyrightable and are cited to APF22 as their source"*), and KL's 2026-07-14 attestation
covers "dosing-range facts". **But a copyrighted compilation is protected in its selection and
arrangement even where each element is a bare fact.** So:

- Extracting **~10 Tier A ingredients'** ranges as facts, restructured into `DoseGuidanceSchema`, cited
  `apf22` → **facts use. Inside the existing attestation. Defensible.**
- Ingesting **all 471, "exactly as printed", in Section D's own alphabetical arrangement** →
  that is no longer facts-use; it reproduces the substance of APF22 Section D. It is the artifact
  `apf22.notes` names — *"reproducing APF expression/tables (beyond facts) would require [a PSA content
  licence] and is an org/legal decision, not covered by this attestation."*

⇒ **The 471-row verbatim file is never committed, in any form.** It stays the operator's local working
copy. What enters the repo is a Tier A fact subset, re-expressed in our schema. This is the same ruling
`warning-labels-cal-verbatim-pending` is already waiting on (PSA_CAL verbatim/copyright, 3 records) —
**bulk ingestion of the full 471 must not proceed ahead of that ruling.** Tier A does not need it.

**Paediatric rows (232 of 471) are dropped regardless of any licence ruling** — the hard limit
(*"no paediatric dosing tables exist… paediatric cases are flagged for in-person review"*) is what
`engine.js`'s under-18 HARD_FAIL cites as its reason. Ingesting paediatric dose tables would make that
stated reason false while the code still returns it. Adult-only, full stop.
