/**
 * Contract test for the AU dose attestation surface (R-47a).
 *
 * WHY THIS SUITE IS THE POINT OF R-47. The operator ruled that a `non_congruent` AU dose ships and
 * needs no explanatory note, because "as long as the non-congruent fact has been ALERTED to the
 * clinician, it is assumed the clinician has weighed it". Sound — and it rests on a precondition the
 * schema does NOT enforce: `DoseGuidanceSchema` guarantees the foreign label's dose is **RECORDED**;
 * nothing guarantees it is **DISPLAYED**. An appraisal recorded but never rendered passes every other
 * test, READS as done because the data sits in the record, and silently defeats Guardrail 2.
 *
 * So these tests assert the SURFACE, not the data: that dropping a comparator, a plausibility state,
 * or the verbatim source is a THROWN ERROR rather than a quietly incomplete worksheet. The bar binds
 * the MACHINE, never the clinician.
 *
 * Run from repo root: node test/contract-dose-worksheet.js
 */
import { readFileSync, existsSync } from "node:fs";
import { renderDoseWorksheet, assertEvidenceRendered } from "../scripts/pharm-dose-worksheet.mjs";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const throws = (fn, hint, msg) => {
  try { fn(); errors.push(`${msg} — expected a THROW, but it rendered`); }
  catch (e) { expect(new RegExp(hint, "i").test(e.message), `${msg} — threw, but not for the expected reason (wanted /${hint}/, got: ${e.message})`); }
};

const rec = (over = {}) => ({
  ingredient: "testazine",
  context: "adult — APF22 Section D common dosage range",
  source_statement: "Condition alpha: 100 mg twice daily. Maximum 400 mg daily.",
  indication_status: "present",
  dose_lines: [{ indication: "Condition alpha", route: null, statement: "100 mg twice daily. Maximum 400 mg daily.", basis: "flat_mg", plausibility: "plausible", plausibility_note: "within 10x" }],
  safe_dose_range: "Condition alpha: 100 mg twice daily. Maximum 400 mg daily.",
  origin: { channel: "clinician_apf_attestation", reference: "apf22", entered_by: "MED0001857758" },
  au_congruence: {
    status: "non_congruent",
    appraised_utc: "2026-07-15T00:00:00Z",
    comparators: [{ jurisdiction: "US", agency: "FDA", amass_id: "AMRC_x", dose_statement: "50 mg once daily" }],
  },
  provenance: { source: "APF22", source_ref: "apf22", authored_by: "t", reviewed_by: null, review_status: "draft", version: "v0.1.0", effective_date: "2026-07-15" },
  ...over,
});
const intl = [{ ingredient: "testazine", jurisdiction: "US", agency: "FDA", amass_id: "AMRC_x", authorization_status: "ACTIVE", dose_statement: "50 mg once daily" }];

// ---- 1. The evidence a clinician must SEE is actually rendered ------------------------------
const out = renderDoseWorksheet([rec()], intl, { utc: "2026-07-15" });
expect(out.includes("Condition alpha: 100 mg twice daily. Maximum 400 mg daily."), "the clinician's VERBATIM source statement must be rendered");
expect(out.includes("50 mg once daily"), "the foreign label's dose must be rendered VERBATIM — this is the whole R-47 obligation");
expect(out.includes("`non_congruent`"), "the congruence status must be rendered");
expect(out.includes("`plausible`"), "the plausibility state must be rendered");
expect(/AU has primacy/i.test(out), "the surface must state AU primacy — the foreign label is evidence beside the dose, not a verdict on it");
expect(/does not question your dose/i.test(out), "a non-congruence must be framed as evidence for judgement, not as a challenge the clinician must answer");
expect(out.includes("☐ Attest"), "a decision must be capturable per record");

// ---- 2. THE BAR: dropping evidence THROWS, it does not quietly ship --------------------------
// Tested on the verifier DIRECTLY, against deliberately incomplete surfaces. This is the R-47
// failure in the flesh: evidence RECORDED but NOT DISPLAYED — which passes every schema, reads as
// done because the data sits in the record, and silently defeats the AU-primacy ruling that assumes
// the clinician was alerted.
throws(() => assertEvidenceRendered("# a worksheet that renders nothing", [rec()]),
  "RECORDED but NOT DISPLAYED", "a surface rendering NO evidence must throw");
throws(() => {
  // everything rendered EXCEPT the foreign label's dose — the precise, plausible regression
  const partial = [rec().source_statement, rec().dose_lines[0].statement, "`plausible`", "`non_congruent`"].join("\n");
  assertEvidenceRendered(partial, [rec()]);
}, "comparator dose is RECORDED but NOT DISPLAYED", "a surface that drops ONLY the comparator dose must throw — this is the exact R-47 failure");
throws(() => {
  const noPlaus = [rec().source_statement, rec().dose_lines[0].statement, "`non_congruent`", "50 mg once daily"].join("\n");
  assertEvidenceRendered(noPlaus, [rec()]);
}, "plausibility state", "a surface that drops the plausibility state must throw");
throws(() => {
  const noSrc = [rec().dose_lines[0].statement, "`plausible`", "`non_congruent`", "50 mg once daily"].join("\n");
  assertEvidenceRendered(noSrc, [rec()]);
}, "verbatim source statement", "a surface that drops the clinician's verbatim text must throw");
// And the real renderer satisfies its own bar.
assertEvidenceRendered(out, [rec()]);

// ---- 3. A withdrawn comparator is SHOWN as withdrawn, never laundered as current -------------
const wOut = renderDoseWorksheet([rec()], [{ ...intl[0], authorization_status: "WITHDRAWN_VOLUNTARY" }], { utc: "2026-07-15" });
expect(/WITHDRAWN_VOLUNTARY/.test(wOut), "a withdrawn authorisation's status must be rendered");
expect(/not a current label/i.test(wOut), "a withdrawn label must be marked as not current — metformin's only citable US label is withdrawn, and a dose read as current when its label was withdrawn is exactly the quiet staleness this surfaces");

// ---- 4. Flags are unmissable, and unassessable never reads as an all-clear -------------------
const iOut = renderDoseWorksheet([rec({ dose_lines: [{ ...rec().dose_lines[0], plausibility: "implausible", plausibility_note: "10x apart" }] })], intl, { utc: "2026-07-15" });
expect(/ORDER-OF-MAGNITUDE FLAG/.test(iOut), "an implausible line must carry an unmissable flag");
expect(/NOT a block|not a judgement|before attesting/i.test(iOut), "…framed as a WARN for a human, never a veto");
const uOut = renderDoseWorksheet([rec({ dose_lines: [{ ...rec().dose_lines[0], plausibility: "unassessable" }] })], intl, { utc: "2026-07-15" });
expect(/NOT an all-clear/i.test(uOut), "an unassessable line must SAY it is not an all-clear — silence reads as reassurance");

// ---- 5. Indication-absent is stated, not withheld --------------------------------------------
const aOut = renderDoseWorksheet([rec({ indication_status: "absent", dose_lines: [{ ...rec().dose_lines[0], indication: null }] })], intl, { utc: "2026-07-15" });
expect(/indication absent/i.test(aOut), "an indication-less dose is SHOWN and labelled, never withheld");
expect(/Stated, not withheld/i.test(aOut), "…and the surface says so explicitly");

// ---- 6. Case 4: international-only evidence is shown, with the corroboration rung named -------
const c4 = renderDoseWorksheet([], [
  { ingredient: "orphanol", jurisdiction: "US", agency: "FDA", amass_id: "A1", authorization_status: "ACTIVE", dose_statement: "10 mg daily" },
  { ingredient: "orphanol", jurisdiction: "EU", agency: "EMA", amass_id: "A2", authorization_status: "ACTIVE", dose_statement: "10 mg daily" },
], { utc: "2026-07-15" });
expect(/international_corroborated/.test(c4), "US AND EU present → the corroborated rung is named (D-SE-4)");
expect(/Not an AU dose/i.test(c4), "…and it is unmistakably marked as NOT an AU dose");
expect(/withholding what we hold is not neutrality/i.test(c4), "…with the reason it is shown at all");
const c4single = renderDoseWorksheet([], [{ ingredient: "orphanol", jurisdiction: "US", agency: "FDA", amass_id: "A1", authorization_status: "ACTIVE", dose_statement: "10 mg daily" }], { utc: "2026-07-15" });
expect(/bare fact, NOT a common range/i.test(c4single), "a SINGLE foreign label is a bare fact, never a 'common range' (D-SE-4)");

// ---- 7. The real generated worksheet, if present ----------------------------------------------
const real = "eval/pharmacology/signoff/dose-guidance-worksheet-KL-2026-07-15.md";
if (existsSync(real)) {
  const md = readFileSync(real, "utf8");
  const recs = JSON.parse(readFileSync("mcp/servers/pharmacology/data/dose-guidance.json", "utf8")).records || [];
  for (const r of recs) {
    expect(md.includes(r.source_statement), `real worksheet: ${r.ingredient}'s verbatim APF text must be rendered`);
    for (const cm of r.au_congruence.comparators) {
      expect(md.includes(cm.dose_statement), `real worksheet: ${r.ingredient}'s ${cm.jurisdiction} comparator dose must be DISPLAYED, not merely recorded`);
    }
  }
  expect(recs.length > 0, "the real worksheet covers the authored records");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-dose-worksheet FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-dose-worksheet: OK (R-47a — recorded-but-not-displayed throws; withdrawn labels marked; flags unmissable; AU primacy stated)");
