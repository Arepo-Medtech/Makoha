/**
 * Contract test for MI-03 — source-ranking engine (execution plan §5).
 *
 * Reproduces the §5 ranking table from code and asserts the two safety exclusions
 * are enforced mechanically: preprints (E9) and openFDA (E10) are never patient
 * receipts; ranks 1-3 are; an unrecognised source fails safe to ineligible.
 * Run from repo root: node test/contract-source-ranker.js
 */
import { rankSource, isPatientReceiptEligible, applyRanking, SOURCE_POLICY } from "../mcp/servers/knowledge/source-ranker.js";
import { CONFIDENCE_BANDS } from "../verification/pipeline-schemas.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

// §5 table, expressed as the expected truth for each source.
const TABLE = [
  { source: "pubmed",             rank: 1, eligible: true,  provisional: false, context_only: false },
  { source: "guideline",          rank: 1, eligible: true,  provisional: false, context_only: false },
  { source: "clinicaltrials_gov", rank: 2, eligible: true,  provisional: false, context_only: false },
  { source: "open_targets",       rank: 3, eligible: true,  provisional: false, context_only: false },
  { source: "chembl",             rank: 3, eligible: true,  provisional: false, context_only: false },
  { source: "biorxiv_medrxiv",    rank: 4, eligible: false, provisional: true,  context_only: false }, // E9
  { source: "openfda",            rank: 5, eligible: false, provisional: false, context_only: true },  // E10
];

for (const row of TABLE) {
  const r = rankSource(row.source);
  expect(r.source_rank === row.rank, `${row.source}: rank expected ${row.rank}, got ${r.source_rank}`);
  expect(r.patient_receipt_eligible === row.eligible, `${row.source}: eligible expected ${row.eligible}, got ${r.patient_receipt_eligible}`);
  expect(r.provisional === row.provisional, `${row.source}: provisional expected ${row.provisional}, got ${r.provisional}`);
  expect(r.context_only === row.context_only, `${row.source}: context_only expected ${row.context_only}, got ${r.context_only}`);
  expect(isPatientReceiptEligible(row.source) === row.eligible, `${row.source}: isPatientReceiptEligible mismatch`);
  expect(CONFIDENCE_BANDS.includes(r.confidence), `${row.source}: confidence '${r.confidence}' not a legal band`);
}

// Ranks strictly increase down the tiers; no eligible source above rank 3, none below rank 4 eligible.
for (const [src, p] of Object.entries(SOURCE_POLICY)) {
  if (p.patient_receipt_eligible) expect(p.source_rank <= 3, `${src}: eligible but rank ${p.source_rank} > 3`);
  else expect(p.source_rank >= 4, `${src}: ineligible but rank ${p.source_rank} < 4`);
  if (p.provisional || p.context_only) expect(p.patient_receipt_eligible === false, `${src}: provisional/context_only must be ineligible`);
}

// E9/E10 hard checks on applyRanking stamping.
const preprint = applyRanking({ source: "biorxiv_medrxiv", claim: "x", id: "10.1101/xyz" });
expect(preprint.patient_receipt_eligible === false && preprint.provisional === true, "applyRanking: preprint must be provisional + ineligible (E9)");
const fda = applyRanking({ source: "openfda", claim: "y", id: "abc" });
expect(fda.patient_receipt_eligible === false && fda.context_only === true, "applyRanking: openFDA must be context_only + ineligible (E10)");
const pm = applyRanking({ source: "pubmed", claim: "z", id: "PMID:123" });
expect(pm.patient_receipt_eligible === true && pm.source_rank === 1 && pm.confidence === "high", "applyRanking: pubmed must be rank1 high eligible");

// Fail-safe: an unrecognised source is never admitted.
const unk = rankSource("some_random_source");
expect(unk.patient_receipt_eligible === false && unk.source_rank === null && unk.unknown_source === true, "unknown source must fail safe to ineligible/unranked");
expect(isPatientReceiptEligible("some_random_source") === false, "unknown source must not be patient-eligible");

// applyRanking rejects a malformed candidate rather than guessing.
let threw = false;
try { applyRanking({ claim: "no source" }); } catch { threw = true; }
expect(threw, "applyRanking must throw on a candidate with no string source");

if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-03 source-ranker FAIL (${errors.length})`); process.exit(1); }
console.log("MI-03 source-ranker PASS");
process.exit(0);
