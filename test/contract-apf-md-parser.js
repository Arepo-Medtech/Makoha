/**
 * Contract test for the APF22 Section D transcription parser (FL dose-guidance C2a).
 *
 * This parser is the mouth of the AU dose pipeline: every dose the engine will ever emit passes
 * through it first. A parser bug here is a wrong dose everywhere downstream, so the assertions are
 * about FAITHFULNESS — verbatim in, verbatim out, nothing silently dropped or moved.
 *
 * TWO LAYERS, deliberately:
 *  1. A synthetic fixture that ALWAYS runs. It cannot embed the clinician's real transcription: that
 *     is APF22 (© PSA) content, and whether the 471-row verbatim extract may live in the repo at all
 *     is an unresolved org/legal question riding the same PSA ruling as
 *     `warning-labels-cal-verbatim-pending`. The fixture uses invented drugs and invented doses in
 *     the REAL structure — it tests the parser, not the content, which is the correct thing to pin.
 *  2. Env-gated assertions against the clinician's actual file (HEYDOC_APF_MD=/path/to/dose_evidence.md),
 *     which SKIP GREEN in CI (the contract-smoke-llm.js precedent). These are what prove the parser
 *     survives the real thing — including the column-shift failure that destroyed the CSV route.
 *
 * Run: node test/contract-apf-md-parser.js
 *      HEYDOC_APF_MD=~/Downloads/files/dose_evidence.md node test/contract-apf-md-parser.js
 */
import { readFileSync } from "node:fs";
import { parseApfMonographs, adultDose, byIngredient, APF_LABELS } from "../scripts/lib/apf-md.mjs";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const eq = (a, b, msg) => expect(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// ---- 1. Synthetic fixture: the real STRUCTURE, invented CONTENT -----------------------------
// Exercises every label, the absence form, a multi-indication statement, a dual-basis statement,
// and — critically — commas inside statements, which is what shredded the CSV route.
const FIXTURE = `## Common Dosage Range (Adult and Paediatric doses) for every listed medicine

**Medicines listed: 5** (alphabetical A–Z).

---

### fictamol
*invented analgesic, for testing*

**Common dosage range**

- **Adult dose:** 100 mg twice daily, or 200 mg once daily.
- **Paediatric dose:** 2 to 12 years, 4 mg/kg twice daily. Maximum daily dose 200 mg.

---

### testazine
*invented antiepileptic*

**Common dosage range**

- **Adult dose:** Condition alpha: Oral, initially 3–4 mg/kg daily in two doses. Usual maintenance dose 150–400 mg daily. Maximum daily dose 500 mg. Condition beta: IV, 10–15 mg/kg.

---

### mockapril
*invented antihypertensive*

**Common dosage range**

- **Dose:** 5 mg once daily at bedtime; increasing after 2 weeks to 10 mg once daily.

---

### notalisted
*invented agent*

**Common dosage range:** Not listed in Section D for this monograph.

---

### referoutan
*invented cytotoxic*

**Common dosage range**

- **Note:** See approved product information and specialist protocols.
- **Adult and paediatric dose:** 1 mg/kg once weekly, all ages.

---
`;

const monos = parseApfMonographs(FIXTURE);
eq(monos.length, 5, "every ### heading yields a monograph");
eq(monos.map((m) => m.ingredient).join(","), "fictamol,testazine,mockapril,notalisted,referoutan", "ingredients in file order");
eq(monos[0].drug_class, "invented analgesic, for testing", "drug class parsed (and its embedded comma survives)");

// THE assertion the CSV route failed: a comma inside a statement must not truncate or shift it.
eq(adultDose(monos[0]), "100 mg twice daily, or 200 mg once daily.",
  "an adult dose containing a comma survives INTACT — this is precisely what csvToRecords() destroys");

// THE dangerous CSV failure: paediatric content must never land on the adult path.
eq(monos[0].lines.find((l) => l.label === "Paediatric dose").statement,
  "2 to 12 years, 4 mg/kg twice daily. Maximum daily dose 200 mg.", "paediatric statement intact");
expect(!/mg\/kg/.test(adultDose(monos[0]) || ""),
  "NO COLUMN SHIFT: the paediatric mg/kg dose must not appear in the adult field (the CSV route shifted it there)");

// Multi-indication + dual-basis: preserved verbatim, NOT split or normalised by the parser.
// Segmentation into dose_lines is C2b's job, under the substring bar — the parser only extracts.
const t = adultDose(monos[1]);
expect(/Condition alpha/.test(t) && /Condition beta/.test(t), "a multi-indication statement is kept whole");
expect(/mg\/kg/.test(t) && /150–400 mg/.test(t),
  "a dual-basis statement keeps BOTH the weight-based and the flat-mg components — the flat mg is real, comparable evidence and must not be discarded");

// "Dose" = an APF monograph that prints a dose with NO indication. A fact to state, not to withhold.
eq(monos[2].lines[0].label, "Dose", "the bare 'Dose' label (indication absent) is preserved as itself");
eq(adultDose(monos[2]), null, "'Dose' is NOT silently promoted to 'Adult dose' — the label is the clinician's, not ours");

// Absence is DECLARED, never an empty record indistinguishable from a parse failure.
eq(monos[3].lines.length, 0, "the absence form yields no dose lines");
eq(monos[3].section_note, "Not listed in Section D for this monograph.", "…and states WHY, verbatim");

// "Adult and paediatric dose" must not be silently treated as adult-only.
eq(adultDose(monos[4]), null,
  "'Adult and paediatric dose' is NOT returned as an adult dose — treating a combined statement as adult-only would put paediatric content on the adult path");
eq(monos[4].lines.map((l) => l.label).join("|"), "Note|Adult and paediatric dose", "multiple labelled lines preserved in order");

// ---- 2. Fail-loud, never fail-silent ---------------------------------------------------------
try {
  parseApfMonographs("### x\n*c*\n\n**Common dosage range**\n\n- **Geriatric dose:** 5 mg daily.\n");
  errors.push("an unrecognised label must THROW — silently skipping it drops a dose invisibly");
} catch (e) {
  expect(/unrecognised label "Geriatric dose"/.test(e.message), `throw should name the label, got: ${e.message}`);
}
eq(parseApfMonographs("").length, 0, "empty input yields no monographs (no throw)");
eq(parseApfMonographs("no headings here\n- **Adult dose:** 5 mg\n").length, 0, "a bullet outside any monograph is ignored, not attributed to a phantom drug");

// Every statement must be a verbatim slice of the source — the parser extracts, never rewrites.
for (const m of monos) {
  for (const l of m.lines) {
    expect(FIXTURE.includes(l.statement), `statement for ${m.ingredient}/${l.label} must appear verbatim in the source`);
  }
}
eq(byIngredient(monos).get("fictamol").ingredient, "fictamol", "byIngredient indexes case-insensitively");
eq(APF_LABELS.length, 5, "the label vocabulary is closed and explicit");

// ---- 3. The clinician's REAL file (env-gated; skips green in CI) ------------------------------
const real = process.env.HEYDOC_APF_MD;
if (!real) {
  console.log("contract-apf-md-parser: OK (fixture) — real-file checks SKIPPED (set HEYDOC_APF_MD to run)");
} else {
  const monosR = parseApfMonographs(readFileSync(real, "utf8"));
  const ix = byIngredient(monosR);
  eq(monosR.length, 471, "the real transcription yields 471 monographs");

  // The exact row the CSV route destroyed.
  eq(adultDose(ix.get("abacavir")), "300 mg twice daily, or 600 mg once daily.",
    "abacavir's adult dose is INTACT (csvToRecords produced the string 'antiretroviral' here)");

  // Label counts, from the clinician's own file. A drift means the transcription changed.
  const counts = {};
  for (const m of monosR) for (const l of m.lines) counts[l.label] = (counts[l.label] || 0) + 1;
  eq(counts["Adult dose"], 451, "451 Adult dose lines");
  eq(counts["Paediatric dose"], 232, "232 Paediatric dose lines");
  eq(counts["Adult and paediatric dose"], 14, "14 combined lines");
  eq(counts["Note"], 14, "14 Note lines");
  eq(counts["Dose"], 3, "3 bare Dose lines (indication absent)");

  eq(ix.get("interferon beta-1b").section_note, "Not listed in Section D for this monograph.",
    "the one no-dosing-block monograph declares its absence");

  // Tier A: all ten must carry an adult dose, and none may have paediatric content shifted into it.
  const TIER_A = ["methotrexate", "carbamazepine", "metformin", "sulfasalazine", "phenytoin",
    "alendronate", "apixaban", "dabigatran", "simvastatin", "rivaroxaban"];
  for (const d of TIER_A) {
    const m = ix.get(d);
    expect(!!m, `Tier A drug ${d} present`);
    if (!m) continue;
    const a = adultDose(m);
    expect(!!a && a.length > 3, `${d} carries an adult dose`);
    const paed = (m.lines.find((l) => l.label === "Paediatric dose") || {}).statement;
    if (paed) expect(a !== paed, `${d}: the adult and paediatric statements must be distinct (a shift would make them equal)`);
  }
  // No statement anywhere may leak a stray quote — the signature of CSV shredding.
  for (const m of monosR) for (const l of m.lines) {
    expect(!/^"|"$/.test(l.statement), `${m.ingredient}/${l.label}: stray quote — a sign of CSV-style corruption`);
  }
  console.log(`contract-apf-md-parser: OK (fixture + REAL file: ${monosR.length} monographs, ${counts["Adult dose"]} adult doses)`);
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-apf-md-parser FAIL (${errors.length})`);
  process.exit(1);
}
if (!real) console.log("contract-apf-md-parser: fixture assertions passed");
