/**
 * Contract test — the DRUG VOCABULARY attestation worksheet (V2).
 *
 * WHAT THIS DEFENDS. This worksheet is the surface a clinician signs 5,196 identity assertions
 * through. Two ways it can fail, and both are silent:
 *
 *   1. IT SHOWS TOO LITTLE. Evidence carried in the data and omitted from the cells — R-47's shape.
 *      The worksheet looks complete, the clinician signs, and they never saw the thing that would
 *      have changed their answer. The ATC-sibling column is the case in point: `erythropoietin →
 *      epoetin alfa` was invisible to RxNorm (one concept) and to the ambiguity detector (one
 *      primary), and was caught ONLY by seeing that three other agents share its class.
 *   2. IT SCOPES TOO LITTLE. A name in no sheet is one that silently never reaches the clinician,
 *      and then rides into a signed dataset on an attestation that never covered it.
 *
 * Run from repo root: node test/contract-vocabulary-worksheet.js
 */
import { readFileSync } from "node:fs";
import { buildWorkbook, scopes, atcSiblings, assertVocabularyRendered, CODE } from "../scripts/pharm-vocabulary-worksheet.mjs";
import { readXlsxSheet, writeXlsx } from "../scripts/lib/xlsx-min.mjs";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const ds = JSON.parse(readFileSync("mcp/servers/pharmacology/data/drug-vocabulary.json", "utf8"));
const { sheets, counts, scopes: sc } = buildWorkbook(ds.records, "2026-07-15");
const text = sheets.map((s) => s.rows.map((r) => r.map((c) => (c && typeof c === "object" ? c.v : c)).join(" ")).join("\n")).join("\n");

// ---- 1. NOTHING IS LOST — every non-primary name reaches exactly one sheet ----------------------
{
  const nonPrimary = ds.records.reduce((n, r) => n + r.names.filter((x) => x.kind !== "primary").length, 0);
  expect(sc.former.length + sc.ask.length + sc.refuse.length + sc.brands.length === nonPrimary,
    `scoping must lose nothing: ${sc.former.length + sc.ask.length + sc.refuse.length + sc.brands.length} scoped vs ${nonPrimary} non-primary names. A name in no sheet is one that silently never reaches the clinician and then rides into a signed dataset on an attestation that never covered it.`);

  // Every name appears in the rendered text — the strongest form of "nothing lost".
  const missing = [];
  for (const r of ds.records) for (const n of r.names) {
    if (n.kind === "primary") continue;
    if (!text.includes(n.name)) missing.push(`${n.name} (${r.primary_name})`);
  }
  expect(missing.length === 0, `${missing.length} name(s) are in the vocabulary but on no sheet: ${missing.slice(0, 5).join(", ")}`);
}

// ---- 2. THE ATC SIBLING EVIDENCE — the reason sheet 2 is decidable at all -----------------------
{
  const siblingsOf = atcSiblings(ds.records);
  // Calibration against the three real cases. If these drift, the column has stopped meaning anything.
  expect(siblingsOf("epoetin alfa", ["B03XA01"]).length === 3,
    "epoetin alfa must show 3 ATC siblings — that is the signal that caught the V1 defect, and the only evidence a clinician had to catch it with");
  expect(siblingsOf("levothyroxine", ["H03AA01"]).includes("liothyronine"),
    "levothyroxine must show liothyronine — the clinician sees a near neighbour and correctly judges it harmless (thyroxine IS T4). Evidence, not a verdict.");
  expect(siblingsOf("furosemide", ["C03CA01"]).length === 0, "furosemide has no ATC-class neighbour — a clean row must read clean");

  // The bar bites: a surface that hides a sibling must THROW.
  const naked = text.replace(/darbepoetin alfa/g, "");
  expect(throws(() => assertVocabularyRendered(naked, sc, siblingsOf)),
    "omitting an ATC sibling from the cells must THROW. The siblings are the ONLY evidence that makes a former-name row decidable; carrying them in the data and hiding them from the page is exactly the R-47 failure, aimed at the one column that matters.");
}

// ---- 3. THE ASK SHEET — the QUESTION is the artifact being attested -----------------------------
{
  const siblingsOf = atcSiblings(ds.records);
  expect(sc.ask.every((a) => text.includes(a.name.confirm_prompt)),
    "every ask-prompt must be displayed — the question put to a patient IS what is being signed here, not a summary of it");
  const dropped = text.replace(sc.ask[0].name.confirm_prompt, "");
  expect(throws(() => assertVocabularyRendered(dropped, sc, siblingsOf)), "dropping a confirm_prompt must THROW");

  // Candidates: a candidate the clinician cannot see is one they cannot rule out.
  const ery = sc.ask.find((a) => a.name.name.toLowerCase() === "erythropoietin");
  expect(!!ery, "V1's ruling must place erythropoietin on the ASK sheet — sheet 2 lists what still STEERS, and it no longer does");
  expect((ery.name.confirm_candidates || []).length === 4, "erythropoietin must offer all four ESAs");
  for (const c of ery.name.confirm_candidates) expect(text.includes(c), `candidate "${c}" must be on the page`);
}

// ---- 4. A US GENERIC MAY NEVER STEER — even here, even signed -----------------------------------
{
  expect(sc.former.every((f) => f.name.kind !== "international_generic"),
    "no US/EU generic may appear on the STEER sheet. Signing says 'these names are right' — never 'a US name is now an Australian one'.");
}

// ---- 5. THE ROUND TRIP — a worksheet that reads back wrong is worse than none -------------------
// E2's lesson, and it was nearly catastrophic: a self-closing empty cell made a BLANK decision read
// as its neighbour's value. A blank mark could have become an approved dose. The same reader parses
// this worksheet, so the same failure is in scope.
{
  const buf = writeXlsx(sheets);
  const FORMER_SHEET = sheets.findIndex((s) => s.name === "2 Former names") + 1; // readXlsxSheet is 1-based by index
  expect(FORMER_SHEET > 0, "fixture: the former-names sheet must exist");
  const back = readXlsxSheet(buf, FORMER_SHEET);
  expect(back.length === sc.former.length + 1, `the former-names sheet must read back with all ${sc.former.length} rows + header, got ${back.length - 1}`);

  // Rows come back keyed by column letter. Find the Decision column by its HEADER, never by a
  // hardcoded letter — a column inserted to the left would otherwise silently re-point the reader
  // at the wrong cell, which is how an amendment note gets read as a decision.
  const hdr = back[0];
  const dcol = Object.keys(hdr).find((k) => hdr[k] === "Decision");
  const ncol = Object.keys(hdr).find((k) => hdr[k] === "Name a prescriber might write");
  expect(!!dcol && !!ncol, "the Decision and Name columns must be findable by header text, not by position");

  const marked = back.slice(1).filter((r) => (r[dcol] ?? "") !== "");
  expect(marked.length === 0,
    `every Decision cell must read back EMPTY on a fresh worksheet — ${marked.length} did not. This is E2's self-closing-cell bug: an empty cell is written <c r="I2"/>, and a reader that requires </c> runs on and captures the NEXT cell's body. A blank mark then becomes whatever sits to its right, turning an unmarked row into a signed one.`);

  // The names must survive the round trip intact — an apply pass keys on this text, and a mangled
  // name would silently attest the wrong record.
  const names = back.slice(1).map((r) => r[ncol]);
  expect(names.length === sc.former.length && names.every((n, i) => n === sc.former[i].name.name),
    "every former name must round-trip byte-identical — an apply pass keys on this text, and a mangled name attests the wrong record");
}

// ---- 6. The sibling warning is delimited, not prose-matched -------------------------------------
{
  expect(text.includes(CODE("steer")), "the current disposition must be rendered as a delimited token, so a substring cannot satisfy the bar by accident");
}

// ---- 7. Counts are DERIVED, never asserted ------------------------------------------------------
// The readme states the size of the job. If it hardcoded numbers it would go stale the moment a
// ruling moved a row between sheets — which V1 did (erythropoietin: sheet 2 → sheet 3).
{
  const readme = sheets[0].rows.map((r) => r.map((c) => c.v).join(" ")).join("\n");
  expect(readme.includes(String(counts.former)) && readme.includes(String(counts.brands)),
    "the readme must state the REAL counts — a stale number in the first thing the clinician reads is a false claim about the size of what they are signing");
  expect(!/18 real ones/.test(readme),
    "the readme must not carry the pre-V1 count of 18 former names: V1's ruling moved erythropoietin to the ask sheet, leaving 17 that steer");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-vocabulary-worksheet FAIL (${errors.length})`);
  process.exit(1);
}
console.log(`contract-vocabulary-worksheet: OK (${counts.drugs} drugs · ${counts.names} names → 2 authority + ${counts.former} steer + ${counts.ask} ask + ${counts.refuse} refuse decisions, ${counts.brands} brands listed · ATC siblings rendered and bar-enforced · blanks read back blank · nothing lost)`);
