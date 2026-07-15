/**
 * Contract test for the dose plausibility guard (FL dose-guidance C1).
 *
 * This guard recovers the ONE real thing the removed divergence gate was incidentally catching — a
 * transcription typo (5000 mg for 500 mg) — without resurrecting the veto. So the tests assert two
 * things with equal weight:
 *   1. it CATCHES an order-of-magnitude entry error;
 *   2. it NEVER claims an all-clear it cannot justify — anything unreadable, or on a different dosing
 *      basis (mg/kg, mg/m², units/IU), is `unassessable`, not `plausible`. A guard that guesses is
 *      worse than no guard, because it launders a non-check into reassurance.
 * And it must stay a WARN: `implausible` is a flag for a human, never a bin (a genuine >10x
 * jurisdictional difference is possible — loading vs maintenance dosing).
 *
 * Run from repo root: node test/contract-dose-plausibility.js
 */
import { parseMaxDoseMg, assessPlausibility } from "../mcp/servers/pharmacology/domain/dose-plausibility.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const eq = (actual, want, msg) => expect(actual === want, `${msg} — expected ${want}, got ${actual}`);

// ---- 1. parsing: units, ranges, and the max-not-first rule ----------------------------------
eq(parseMaxDoseMg("500 mg every 8 hours").mg, 500, "plain mg");
eq(parseMaxDoseMg("1 g PO every 6 hours, max 4 g/day").mg, 4000, "grams → mg, and the MAX is taken (the cap is where a misplaced zero lands)");
eq(parseMaxDoseMg("250 microgram once daily").mg, 0.25, "microgram → mg");
eq(parseMaxDoseMg("250 mcg once daily").mg, 0.25, "mcg → mg");
eq(parseMaxDoseMg("3.75–7.5 mg before bedtime").mg, 7.5, "a range takes its top");
// THOUSANDS SEPARATORS. This corpus is Australian: period decimal, comma thousands (verified —
// 41 comma-groups, all thousands; zero decimal commas before a unit). An earlier regex treated the
// comma as a DECIMAL point, so "1,000 mg" parsed as 1 mg: a silent 1000x UNDER-read on 41 real dose
// amounts. It was caught only because this guard flagged metformin at 166x and the flag was
// investigated instead of dismissed — the guard's first real catch was a bug in its own parser.
eq(parseMaxDoseMg("1,000 mg").mg, 1000, "1,000 mg is ONE THOUSAND mg, not 1 mg");
eq(parseMaxDoseMg("500\u20131,000 mg daily; maximum 3,000 mg daily").mg, 3000, "the real metformin string: max is 3000 mg, not 3 mg");
eq(parseMaxDoseMg("1,200 microgram").mg, 1.2, "1,200 microgram = 1.2 mg (thousands separator + unit conversion)");
eq(parseMaxDoseMg("3.75 mg").mg, 3.75, "period is the decimal separator");
eq(parseMaxDoseMg("50 mg daily, gradually increasing to 100 mg three times daily. Maximum daily dose 600 mg.").mg, 600,
  "an escalation statement takes the maximum mentioned, not the first");
// The unit alternation must be longest-first, or "microgram" partially matches as "g" (→ 1000x wrong).
expect(parseMaxDoseMg("400 microgram").mg === 0.4, "'microgram' must NOT be partially matched as 'g' — that would be a 1,000,000x error");

// ---- 2. fail-safe: unreadable or different-basis is UNASSESSABLE, never plausible ------------
const unassessable = [
  ["8 mg/kg twice daily", "mg/kg is a different dosing basis"],
  ["250 mg/m² IV 8-hourly", "mg/m² (BSA) is a different dosing basis"],
  ["5 mg per kg daily", "'per kg' spelled out"],
  ["100 units subcutaneously", "units are not a mass"],
  ["Refer to the approved product information for dosing schedules.", "a refer-out carries no dose"],
  ["", "empty"],
];
for (const [stmt, why] of unassessable) {
  eq(parseMaxDoseMg(stmt).mg, null, `must NOT parse a mass from "${stmt}" (${why})`);
  eq(assessPlausibility(stmt, [{ dose_statement: "500 mg" }]).status, "unassessable",
    `"${stmt}" must be unassessable, never plausible (${why})`);
}
// The reverse direction too: a fine AU dose against an unreadable comparator is still unassessable.
eq(assessPlausibility("500 mg every 8 hours", [{ dose_statement: "8 mg/kg twice daily" }]).status, "unassessable",
  "a weight-based COMPARATOR must not be compared against a flat AU mg dose (it would manufacture a false alarm)");
eq(assessPlausibility("500 mg every 8 hours", []).status, "unassessable", "no comparator → unassessable");
expect(/NOT an all-clear/.test(assessPlausibility("500 mg", []).note),
  "an unassessable result must SAY it is not an all-clear — silence reads as reassurance");

// ---- 3. THE TYPO CATCH (the whole reason this module exists) ---------------------------------
const typo = assessPlausibility("5000 mg every 8 hours", [{ jurisdiction: "US", agency: "FDA", dose_statement: "500 mg every 8 hours" }]);
eq(typo.status, "implausible", "a misplaced zero (5000 vs 500 mg) MUST be caught");
expect(typo.worst.ratio === 10, `ratio should be exactly 10, got ${typo.worst && typo.worst.ratio}`);
expect(/NOT a block/.test(typo.note) && /human/.test(typo.note),
  "an implausible result must state it is a WARN for a human, not a bin — it must not read as a veto");

// ---- 4. legitimate jurisdictional difference is PLAUSIBLE (the anti-veto assertion) ----------
// 500 mg q8h (AU) vs 875 mg BD (US) — a real, common, entirely legitimate difference. The removed
// gate would have BINNED this record. The guard must wave it through.
const legit = assessPlausibility("500 mg every 8 hours", [{ jurisdiction: "US", agency: "FDA", dose_statement: "875 mg twice daily" }]);
eq(legit.status, "plausible", "a legitimate AU/US difference (500 vs 875 mg) must NOT be flagged — the old gate binned exactly this");
expect(/NOTHING about clinical congruence/.test(legit.note),
  "a plausible result must NOT be mistaken for a congruence blessing — that conflation is what produced the bad gate");

// ---- 5. multiple comparators: the WORST ratio wins -------------------------------------------
const multi = assessPlausibility("500 mg", [
  { jurisdiction: "US", agency: "FDA", dose_statement: "600 mg" },
  { jurisdiction: "EU", agency: "EMA", dose_statement: "5 mg" },
]);
eq(multi.status, "implausible", "the WORST comparator ratio decides — a single close match must not mask a 100x outlier");
eq(multi.worst.jurisdiction, "EU", "the worst comparator must be named so a human knows which one to look at");
// A partially-unreadable comparator set still assesses against the readable ones.
eq(assessPlausibility("500 mg", [{ dose_statement: "8 mg/kg" }, { jurisdiction: "US", dose_statement: "5000 mg" }]).status, "implausible",
  "an unreadable comparator must not suppress a readable one");

// ---- 6. threshold boundary --------------------------------------------------------------------
eq(assessPlausibility("500 mg", [{ dose_statement: "5000 mg" }]).status, "implausible", "exactly 10x is implausible (>= threshold)");
eq(assessPlausibility("500 mg", [{ dose_statement: "4000 mg" }]).status, "plausible", "8x is under the threshold");
eq(assessPlausibility("500 mg", [{ dose_statement: "50 mg" }], { threshold: 5 }).status, "implausible", "threshold is configurable");
// Symmetry: it must not matter which side is bigger.
eq(assessPlausibility("50 mg", [{ dose_statement: "500 mg" }]).status, "implausible", "an AU dose 10x SMALLER is equally implausible");

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-dose-plausibility FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-dose-plausibility: OK (typo caught · legitimate difference passed · unreadable → unassessable, never all-clear)");
