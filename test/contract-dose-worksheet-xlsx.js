/**
 * Contract test for the TRANCHED .xlsx attestation surface (E2).
 *
 * WHY THIS SUITE EXISTS. E1 authored the full 451-record APF22 adult set; the clinician attests it
 * through .xlsx worksheets (the format that demonstrably worked for the 88 + 308 passes), tranched
 * "Tier A + indication-present first". That makes the xlsx a SAFETY SURFACE — it is the artifact a
 * registered practitioner reads before signing a dose into a clinical-decision-support system. R-47a's
 * whole point is that a surface which silently drops a divergence passes every other test and READS as
 * done. So the surface gets asserted, not trusted.
 *
 * The three things this pins:
 *   1. TRANCHING IS LOSSLESS. A record in neither tranche is a clinician-transcribed dose that
 *      silently never reaches a clinician — the exact failure the subsystem is built against.
 *   2. THE R-47a BAR RUNS ON THIS SURFACE, and is the SAME function the markdown uses. A second
 *      hand-written copy of a safety assertion is the silent-divergence hazard R-47 names.
 *   3. THE DELIMITER IS LOad-BEARING, not cosmetic: a bare includes("plausible") is satisfied by the
 *      word inside "implausible", so a record whose only rendered state was "implausible" would pass
 *      a check for "plausible" — a false all-clear on the exact axis the bar guards.
 *
 * Run from repo root: node test/contract-dose-worksheet-xlsx.js
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assertEvidenceRendered } from "../scripts/pharm-dose-worksheet.mjs";
import { buildSheet, tranche1, tranche2, CODE } from "../scripts/pharm-dose-worksheet-xlsx.mjs";
import { writeXlsx, sheetXml, readXlsxSheet, colName, esc } from "../scripts/lib/xlsx-min.mjs";
import { TIER_A } from "../scripts/pharm-dose-author.mjs";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const DATA = "mcp/servers/pharmacology/data";
const SIGNOFF = "eval/pharmacology/signoff";
const all = JSON.parse(readFileSync(`${DATA}/dose-guidance.json`, "utf8")).records || [];
const intl = JSON.parse(readFileSync(`${DATA}/international-dose-guidance.json`, "utf8")).records || [];

// ---- 1. Tranching: lossless, disjoint, and the operator's stated rule -------------------------
const t1 = tranche1(all); const t2 = tranche2(all);
expect(t1.length + t2.length === all.length, `tranching must be lossless: ${t1.length}+${t2.length} != ${all.length}`);

const n1 = new Set(t1.map((r) => r.ingredient));
const n2 = new Set(t2.map((r) => r.ingredient));
expect([...n1].every((n) => !n2.has(n)), "tranches must be disjoint — a record attested twice is a record attested from two different surfaces");
expect(new Set([...n1, ...n2]).size === all.length, "every authored record must appear in exactly one tranche");

// The rule: Tier A ∪ indication-present.
expect(t1.every((r) => TIER_A.includes(r.ingredient) || r.indication_status === "present"),
  "tranche 1 must be exactly Tier A ∪ indication-present");
expect(t2.every((r) => !TIER_A.includes(r.ingredient) && r.indication_status !== "present"),
  "tranche 2 must hold no Tier A and no indication-present record");
expect(all.filter((r) => TIER_A.includes(r.ingredient)).every((r) => n1.has(r.ingredient)),
  "every Tier A record must be in tranche 1 — the highest-stakes doses are read first");

// ---- 2. The R-47a bar runs on the real xlsx cells ----------------------------------------------
for (const [n, recs] of [[1, t1], [2, t2]]) {
  const { verifyText } = buildSheet(recs, intl);
  let threw = null;
  try { assertEvidenceRendered(verifyText, recs, { code: CODE }); } catch (e) { threw = e.message; }
  expect(threw === null, `tranche ${n}: the real xlsx surface must pass the R-47a bar — ${threw}`);
}

// ---- 3. A dropped comparator dose THROWS (the failure R-47 names) ------------------------------
const withComparator = all.find((r) => r.au_congruence.comparators.length > 0);
expect(!!withComparator, "fixture: at least one record must carry a US/EU comparator");
if (withComparator) {
  const { verifyText } = buildSheet([withComparator], intl);
  const cmDose = withComparator.au_congruence.comparators[0].dose_statement;
  const censored = verifyText.split(cmDose).join("[comparator silently dropped]");
  expect(
    throws(() => assertEvidenceRendered(censored, [withComparator], { code: CODE })),
    "an xlsx that RECORDS a comparator dose but does not DISPLAY it must THROW — that is the AU-primacy precondition",
  );
  // And the verbatim source itself.
  const noSrc = verifyText.split(withComparator.source_statement).join("[source dropped]");
  expect(
    throws(() => assertEvidenceRendered(noSrc, [withComparator], { code: CODE })),
    "an xlsx that drops the clinician's verbatim source statement must THROW",
  );
}

// ---- 4. The delimiter is load-bearing ----------------------------------------------------------
// THE HAZARD, stated concretely: "implausible".includes("plausible") === true. Without a delimiter a
// record rendered ONLY as implausible would satisfy a check for plausible — a false all-clear.
expect("implausible".includes("plausible"), "premise: the substring hazard the delimiter exists to close");
expect(!CODE("implausible").includes(CODE("plausible")), "[implausible] must NOT contain [plausible] — the delimiter must separate the two states");

const fake = {
  ingredient: "fixture-drug", source_statement: "SRC", indication_status: "present",
  dose_lines: [{ indication: "i", route: null, statement: "SRC", basis: "flat_mg", plausibility: "plausible", plausibility_note: null }],
  au_congruence: { status: "no_comparator", appraised_utc: "2026-07-15", comparators: [], appraisal_note: "none" },
  provenance: { review_status: "draft" },
};
// A surface that shows ONLY "implausible" must NOT satisfy a record whose line is "plausible".
expect(
  throws(() => assertEvidenceRendered(`SRC ${CODE("implausible")} ${CODE("no_comparator")}`, [fake], { code: CODE })),
  "a surface displaying only [implausible] must NOT pass a record whose state is plausible — the false-all-clear the delimiter closes",
);
// The correct surface passes.
expect(
  !throws(() => assertEvidenceRendered(`SRC ${CODE("plausible")} ${CODE("no_comparator")}`, [fake], { code: CODE })),
  "a surface displaying the record's real state must pass",
);

// ---- 5. The writer emits a structurally valid workbook -----------------------------------------
const fixture = { name: "S", rows: [["h1", "h2"], [1, "v"]], widths: [10, 10], freeze: 1, validation: { sqref: "B2:B2", values: ["Attest", "Amend", "Reject"] } };
const buf = writeXlsx([fixture]);
expect(Buffer.isBuffer(buf) && buf.length > 500, "writeXlsx must return workbook bytes");
expect(buf.subarray(0, 2).toString() === "PK", "an .xlsx must be a ZIP (PK magic) — otherwise no reader opens it");
// Entry NAMES are stored uncompressed in the ZIP local headers, so this is a real check.
expect(buf.includes(Buffer.from("xl/worksheets/sheet1.xml")), "the workbook must contain a sheet part");

// The sheet BODY is deflated inside the zip — assert it at the source, not by grepping bytes.
const xml = sheetXml(fixture);
expect(xml.includes(`<formula1>"Attest,Amend,Reject"</formula1>`), "the Decision dropdown values must be emitted");
expect(xml.includes('sqref="B2:B2"'), "the dropdown must be anchored to the Decision column");
expect(xml.includes('state="frozen"'), "the header row must freeze — 451 rows is not scrollable otherwise");
expect(/<c r="A2"[^>]*><v>1<\/v><\/c>/.test(xml), "a numeric cell must emit as <v>, not an inline string");
expect(xml.includes('<c r="B2" s="2" t="inlineStr"><is><t xml:space="preserve">v</t></is></c>'), "a text cell must emit as an inline string at the right ref");
expect(colName(0) === "A" && colName(25) === "Z" && colName(26) === "AA", "column naming must carry past Z");
expect(esc("<a & b>") === "&lt;a &amp; b&gt;", "XML escaping — an unescaped & makes the file unopenable");
expect(!esc("bad\x07char").includes("\x07"), "control chars OOXML forbids must be stripped — one makes the file unopenable");
// Reproducible: same records + same timestamp → byte-identical. A worksheet is a medicolegal artifact;
// a diff should mean the content moved, not the clock.
const a = writeXlsx([{ name: "S", rows: [["x"]] }], { when: new Date(2026, 6, 15) });
const b = writeXlsx([{ name: "S", rows: [["x"]] }], { when: new Date(2026, 6, 15) });
expect(a.equals(b), "the writer must be deterministic for a fixed timestamp");

// ---- 6. The round trip: an EMPTY cell must read EMPTY, never its neighbour ---------------------
// A REAL BUG, found by the blank-decision guard and pinned here. An empty cell is written
// self-closing (`<c r="J2"/>`) by Excel and by us. A reader pattern requiring `</c>` does not merely
// miss it — it runs on and captures the NEXT cell's body as this cell's value. On the attestation
// worksheet that reads the clinician's amendment NOTE (K) as his DECISION (J): a mark we could not
// read silently becomes whatever sits beside it. The apply path turns a decision into an approved
// dose, so this is a fabricated-attestation hazard, not a parsing nicety.
{
  const wb = writeXlsx([{ name: "S", rows: [["A", "B", "C"], ["left", "", "right"]] }]);
  const back = readXlsxSheet(wb, 1);
  expect(back[1].A === "left", "round trip: a populated cell must read back");
  expect(!back[1].B, `an EMPTY cell must read empty — got "${back[1].B}" (it swallowed its neighbour)`);
  expect(back[1].C === "right", "the cell AFTER an empty one must still read correctly, not be consumed by it");
}
// Excel rewrites our inline strings into a sharedStrings table on save. The reader must handle BOTH
// forms, or the round trip reads nothing back from a completed worksheet — and "0 decisions found"
// is indistinguishable from "the clinician marked nothing".
expect(readXlsxSheet(writeXlsx([{ name: "S", rows: [["h"], ["v"]] }]), 1)[1].A === "v",
  "reader must handle the inline-string form we emit");

// Real coverage of the sharedStrings branch: the completed worksheets on disk were saved by a real
// spreadsheet application, so they carry Excel's structure rather than ours.
for (const f of readdirSync(SIGNOFF).filter((x) => x.startsWith("dose-guidance-worksheet") && x.endsWith(".xlsx"))) {
  const rows = readXlsxSheet(readFileSync(join(SIGNOFF, f)), 2);
  expect(rows[0]?.C === "Ingredient" && rows[0]?.J === "Decision",
    `${f}: the reader must recover the column layout from a spreadsheet-app-saved workbook (sharedStrings form)`);
  const marked = rows.slice(1).filter((r) => r.C);
  expect(marked.length > 0, `${f}: the reader must recover the record rows`);
  expect(marked.every((r) => !r.J || ["Attest", "Amend", "Reject"].includes(r.J.trim())),
    `${f}: every decision read back must be a real mark — anything else means the reader is misaligned`);
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-dose-worksheet-xlsx FAIL (${errors.length})`);
  process.exit(1);
}
console.log(`contract-dose-worksheet-xlsx: OK (tranching lossless ${t1.length}+${t2.length}=${all.length} · R-47a bar runs on xlsx cells · dropped comparator throws · delimiter closes the implausible/plausible false-pass)`);
