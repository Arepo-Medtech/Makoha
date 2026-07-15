/**
 * pharm-vocabulary-worksheet — the drug-vocabulary attestation surface as .xlsx (V2).
 *
 * ══ WHAT THE CLINICIAN IS ACTUALLY BEING ASKED ══
 * The vocabulary holds 5,196 names across 1,455 drugs. Putting 5,196 rows in front of a human and
 * calling it review would be theatre — nobody reads row 4,000, and an attestation statement claiming
 * they did would be false. So this worksheet asks the question that is actually being decided:
 *
 *   Sheet 1 — AUTHORITY (2 decisions).   3,635 brand names come from PBS's own `brand_name` field, and
 *             every RxCUI from RxNorm. You are not adjudicating 3,635 claims; you are accepting (or
 *             rejecting) two SOURCES. Every brand is still listed on sheet 5 for inspection, and any
 *             individual one can be excepted there — so the ruling is a default, not a blindfold.
 *   Sheet 2 — FORMER NAMES (18 decisions). THE REAL WORK. Each one silently redirects a lookup:
 *             `frusemide` → `furosemide`. Get one wrong and a request for drug X is answered with
 *             drug Y's data. These are the rows to read slowly.
 *   Sheet 3 — ASK (73). Names dispositioned `confirm`: they present candidates and choose none, so a
 *             wrong entry here costs a question, never a wrong drug. Lower stakes by construction.
 *   Sheet 4 — REFUSE (16). Company names that leaked into PBS's brand field. They never resolve.
 *   Sheet 5 — BRANDS (3,635, listed). Covered by the sheet-1 ruling; markable individually.
 *
 * ══ THE EVIDENCE THAT MAKES SHEET 2 DECIDABLE: ATC SIBLINGS ══
 * The V1 defect (`erythropoietin` → `epoetin alfa`) was invisible to every mechanical test: RxNorm
 * groups them under ONE concept (RxCUI 105694), so the alias looked exactly as sound as
 * `frusemide → furosemide`, and the ambiguity detector could not fire because the name reaches only
 * one primary. What made it decidable was knowing FOUR erythropoiesis-stimulating agents exist.
 *
 * So each former-name row carries its primary's ATC 4th-level SIBLINGS — the other drugs in this
 * datastore in the same therapeutic class. That is the signal, and it separates the cases cleanly:
 *   epoetin alfa  → 3 siblings (darbepoetin alfa, epoetin lambda, methoxy PEG-epoetin beta) ← the flag
 *   levothyroxine → 1 sibling (liothyronine)  ← visible, and correctly judged harmless: thyroxine IS T4
 *   furosemide    → 0 siblings                ← clean
 *
 * ATC IS NOT AN IDENTITY, and this is not a contradiction of that rule. A classification cannot say
 * WHICH drug a name means — which is exactly why it is never used to resolve one. It can say "other
 * drugs live near this one", which is evidence a human weighs. Evidence beside the decision, never a
 * verdict on it — the same discipline as the comparator labels on the dose worksheet.
 *
 * ══ R-47a ══
 * `assertVocabularyRendered` runs over every cell of every generated sheet and THROWS if anything the
 * decision depends on is recorded but not displayed. A worksheet that carried the siblings in its
 * data and omitted them from the cells would look complete and quietly defeat the whole exercise.
 *
 * Usage:
 *   node scripts/pharm-vocabulary-worksheet.mjs --utc 2026-07-15 [--outdir <dir>] [--force]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeXlsx } from "./lib/xlsx-min.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

/** State tokens are delimited so a substring can never satisfy the rendering bar by accident. */
export const CODE = (s) => `[${s}]`;

/** ATC 4th level — the therapeutic class. B03XA01 → B03XA. */
const atcClass = (a) => String(a || "").slice(0, 5);

/**
 * Group the datastore's drugs by ATC 4th level, so a former-name row can show what else lives in its
 * primary's class. Evidence, not identity — see the header.
 */
export function atcSiblings(records) {
  const cls = new Map();
  for (const r of records) for (const a of r.identity?.atc_codes || []) {
    const k = atcClass(a);
    if (!k) continue;
    if (!cls.has(k)) cls.set(k, new Set());
    cls.get(k).add(r.primary_name);
  }
  return (primaryName, atcCodes) => {
    const out = new Set();
    for (const a of atcCodes || []) for (const s of cls.get(atcClass(a)) || []) {
      if (s.toLowerCase() !== String(primaryName).toLowerCase()) out.add(s);
    }
    return [...out].sort();
  };
}

/** The four scopes, derived from the vocabulary itself so nothing can be silently dropped. */
export function scopes(records) {
  const former = [], ask = [], refuse = [], brands = [];
  for (const r of records) for (const n of r.names) {
    if (n.kind === "primary") continue;
    const row = { drug: r, name: n };
    if (n.lookup_disposition === "refuse") refuse.push(row);
    else if (n.lookup_disposition === "confirm") ask.push(row);
    else if (n.kind === "brand") brands.push(row);
    else former.push(row); // former_name / spelling_variant that STEERS — the real decisions
  }
  return { former, ask, refuse, brands };
}

/**
 * THE R-47a BAR. Everything the decision rests on must be ON THE PAGE — in THE RIGHT ROW.
 *
 * ══ WHY THIS IS ROW-SCOPED, AND NOT A SEARCH OVER THE WORKBOOK ══
 * My first cut of this bar checked `wholeWorkbookText.includes(sibling)`. It passed while the sibling
 * COLUMN WAS EMPTY — because the readme's own explanatory prose names darbepoetin alfa and the other
 * ESAs, and sheet 5 lists half the datastore. The bar was satisfied by my own commentary.
 *
 * That is not a near miss. A worksheet with an empty evidence column would have shipped, looking
 * complete and carrying a green test, and the clinician would have signed 17 redirects without the
 * one signal that makes them decidable. A bar whose scope is wider than the thing it guards will
 * always find the string somewhere and always pass.
 *
 * So each check is scoped to the CELL RANGE it is about: a sibling must appear in ITS OWN ROW's
 * evidence cell, an ask-prompt in ITS OWN row, a brand in ITS OWN row. Found elsewhere is not found.
 *
 * @param sheets the built sheets — needed because "displayed" means "in this row", not "in this file"
 */
export function assertVocabularyRendered(sheets, { former, ask, refuse, brands }, siblingsOf) {
  const sheet = (n) => sheets.find((s) => s.name === n);
  const rowText = (s, i) => (s.rows[i] || []).map((c) => (c && typeof c === "object" ? c.v : c)).join(" ␟ ");

  const fs_ = sheet("2 Former names");
  if (!fs_) throw new Error("R-47: the former-names sheet is missing entirely");
  former.forEach(({ drug, name }, i) => {
    const row = rowText(fs_, i + 1); // +1 for the header
    if (!row.includes(name.name)) throw new Error(`R-47: former name "${name.name}" is RECORDED but NOT DISPLAYED in its row`);
    if (!row.includes(drug.primary_name)) throw new Error(`R-47: "${name.name}" → "${drug.primary_name}" — the primary it steers to is NOT DISPLAYED in its row`);
    if (!row.includes(name.source)) throw new Error(`R-47: "${name.name}" — its source is RECORDED but NOT DISPLAYED. A name whose provenance the clinician cannot see is one they cannot weigh.`);
    for (const s of siblingsOf(drug.primary_name, drug.identity?.atc_codes)) {
      if (!row.includes(s)) {
        throw new Error(
          `R-47: "${name.name}" → "${drug.primary_name}" — the ATC sibling "${s}" is RECORDED but NOT DISPLAYED IN ITS OWN ROW. ` +
          `The siblings are the ONLY evidence that makes this row decidable: erythropoietin→epoetin alfa was invisible ` +
          `to RxNorm (one concept) and to the ambiguity detector (one primary), and was caught solely by seeing that ` +
          `three other agents share its class. Naming it on some other sheet does not help the clinician reading THIS row.`,
        );
      }
    }
  });

  const as_ = sheet("3 Ask");
  if (!as_) throw new Error("R-47: the ask sheet is missing entirely");
  ask.forEach(({ name }, i) => {
    const row = rowText(as_, i + 1);
    if (!row.includes(name.name)) throw new Error(`R-47: 'confirm' name "${name.name}" is RECORDED but NOT DISPLAYED in its row`);
    if (!row.includes(name.confirm_prompt)) throw new Error(`R-47: "${name.name}" — the question put to the patient/doctor is RECORDED but NOT DISPLAYED. That question IS the artifact being attested.`);
    for (const c of name.confirm_candidates || []) {
      if (!row.includes(c)) throw new Error(`R-47: "${name.name}" — candidate "${c}" is RECORDED but NOT DISPLAYED in its row. A candidate the clinician cannot see is one they cannot rule out.`);
    }
  });

  const rs_ = sheet("4 Refuse");
  if (!rs_) throw new Error("R-47: the refuse sheet is missing entirely");
  refuse.forEach(({ name }, i) => {
    const row = rowText(rs_, i + 1);
    if (!row.includes(name.name)) throw new Error(`R-47: refused name "${name.name}" is RECORDED but NOT DISPLAYED in its row`);
    if (!row.includes(name.disposition_reason)) throw new Error(`R-47: "${name.name}" — the reason it is refused is RECORDED but NOT DISPLAYED in its row`);
  });

  const bs_ = sheet("5 Brands");
  if (!bs_) throw new Error("R-47: the brands sheet is missing entirely. The authority ruling is a DEFAULT, not a blindfold — it only holds if every brand it covers is inspectable.");
  brands.forEach(({ drug, name }, i) => {
    const row = rowText(bs_, i + 1);
    if (!row.includes(name.name)) throw new Error(`R-47: brand "${name.name}" (${drug.primary_name}) is RECORDED but NOT DISPLAYED in its row`);
    if (!row.includes(drug.primary_name)) throw new Error(`R-47: brand "${name.name}" — what it REACHES is not displayed. A brand whose target the clinician cannot see is one they cannot check.`);
  });
}

// ── sheets ────────────────────────────────────────────────────────────────────────────────────────

const H = (s) => ({ v: s, s: 1 });
const B = (s) => ({ v: s, s: 3 });
const T = (s) => ({ v: s, s: 2 });

function readmeSheet(utc, counts) {
  const L = [
    ["DRUG VOCABULARY — CLINICIAN ATTESTATION", `Kenneth Lee (MED0001857758) · prepared ${utc}`],
    ["", ""],
    ["WHAT THIS IS", "The vocabulary links every name a medicine is known by — brands, former names, international and spelling variants — to ONE identity, with the PBS Australian ingredient name as primary."],
    ["WHY IT IS GATED", "A vocabulary entry REDIRECTS A LOOKUP. Get one wrong and a request for drug X is answered with drug Y's data. That is why it does not switch itself on: it steers nothing until you sign."],
    ["WHAT IS UNSIGNED TODAY", `All ${counts.drugs} drugs / ${counts.names} names. Nothing in here is steering, asking or refusing right now — the whole file is inert until this worksheet is applied.`],
    ["", ""],
    ["YOU ARE NOT MARKING 5,196 ROWS", `You are making 2 authority decisions + ${counts.former} real ones + ${counts.ask + counts.refuse} lower-stakes ones = ${2 + counts.former + counts.ask + counts.refuse} in total. The ${counts.brands} brands are covered by the sheet-1 ruling and listed on sheet 5, where you can except any individual one.`],
    ["", ""],
    ["SHEET 1 — AUTHORITY", "2 decisions. Do you accept PBS as the AU naming authority (brand → ingredient), and RxNorm's concept id as the identity key? Everything on sheet 5 rests on the first."],
    ["SHEET 2 — FORMER NAMES", `${counts.former} decisions. THE REAL WORK. Each of these SILENTLY REDIRECTS a lookup. Read these slowly.`],
    ["SHEET 3 — ASK", `${counts.ask} decisions. These names present candidates and choose none. A wrong entry here costs a question, never a wrong drug.`],
    ["SHEET 4 — REFUSE", `${counts.refuse} decisions. Company names that leaked into PBS's brand field. They never resolve.`],
    ["SHEET 5 — BRANDS", `${counts.brands} listed, covered by the sheet-1 ruling. Mark only the ones you want to EXCEPT.`],
    ["", ""],
    ["THE ATC SIBLING COLUMN (sheet 2)", "This is the evidence that makes sheet 2 decidable, and it is why this review is not a formality."],
    ["", "One entry was already found wrong before you saw this worksheet: 'erythropoietin' was steering to 'epoetin alfa'. NO MECHANICAL TEST COULD CATCH IT — RxNorm files both under one concept (RxCUI 105694), so it looked exactly as sound as frusemide→furosemide, and the ambiguity detector could not fire because the name reaches only one primary."],
    ["", "What made it visible was that THREE other erythropoiesis-stimulating agents share its ATC class. So every former-name row now shows its class siblings. Where the count is 0, the name is almost certainly a clean INN spelling change. Where it is >0, ask yourself: could this name mean one of those instead?"],
    ["", "ATC IS NOT AN IDENTITY — it cannot say which drug a name means, which is why it is never used to resolve one. It can say what lives nearby. Evidence beside your decision, never a verdict on it."],
    ["", ""],
    ["ALREADY RULED", "'erythropoietin' is NOT on sheet 2. Your ruling of 2026-07-15 already moved it to 'confirm', so it now sits on SHEET 3 with the other names that ask — which is the point: sheet 2 lists what still steers. You are attesting your own ruling, not the agent's guess at it."],
    ["", ""],
    ["DECISION COLUMN", "Attest = correct as shown. Amend = wrong as shown; write what it should be in the note column. Reject = this name must not be in the vocabulary at all."],
    ["A BLANK IS NOT AN ATTESTATION", "The apply script REFUSES a blank decision rather than assuming one. If you do not reach a row, it stays unsigned and keeps steering nothing."],
    ["AMEND / REJECT ARE CHEAP", "Nothing here is load-bearing yet. An entry you reject simply keeps behaving the way it behaves today: the name resolves to itself and the drug escalates to BLOCKED_NO_PROOF. The safe default is already in force."],
    ["", ""],
    ["WHAT SIGNING UNLOCKS", "Brand lookups (a patient saying 'Eutroxsig' reaches levothyroxine), the ask-prompts, and code-first matching in the OpenCDS gateway KB (937 name-only subjects → ~437 code-keyed, after a re-export to fl30-kb:v2)."],
    ["WHAT SIGNING DOES NOT DO", "It does not make anything patient-facing, does not grant regulatory sign-off, and does not let a US name become an Australian one — a US generic can only ever ASK, even when signed. That bar is in the schema, not in a habit."],
  ];
  return { name: "Read me", rows: L.map((r) => r.map((c, i) => ({ v: c, s: i === 0 && c === c.toUpperCase() && c.length > 3 ? 3 : 2 }))), widths: [34, 104], freeze: 0 };
}

function authoritySheet(counts) {
  const cols = [["#", 5], ["The decision", 44], ["What rests on it", 66], ["Evidence", 62], ["Decision", 12], ["Note", 30]];
  const rows = [cols.map(([h]) => H(h))];
  rows.push([
    T(1),
    B("PBS is the AU naming authority for brand → ingredient"),
    T(`All ${counts.brands} brand names (sheet 5). Accepting this means a patient saying "Eutroxsig" reaches levothyroxine.`),
    T("Every one comes from the PBS `brand_name` field on the same PBS row as the ingredient — the Australian Government's own formulary asserting its own link. The agent made no judgement: it copied a government dataset. RxNorm's US brand table was NOT harvested (TTY-gated: IN/PIN/MIN only, 0 BN across 987 concepts)."),
    T(""), T(""),
  ]);
  rows.push([
    T(2),
    B("RxNorm's concept id (RxCUI) is the identity key"),
    T("Which names count as ONE drug, and (after a re-export) the code sent to the OpenCDS gateway instead of a name."),
    T("RxNorm is used for the CONCEPT ID ONLY — never for canonical naming, because RxNorm's canonical is the USAN, not the INN (it calls paracetamol 'acetaminophen'). Note V1: RxNorm's grouping is not infallible — it files 'erythropoietin' under epoetin alfa's concept, which is US usage, not AU practice. Accepting RxNorm as an identity KEY does not accept its naming."),
    T(""), T(""),
  ]);
  return { name: "1 Authority", rows, widths: cols.map(([, w]) => w), freeze: 1, validation: { sqref: `E2:E${rows.length}`, values: ["Attest", "Amend", "Reject"] } };
}

function formerSheet(former, siblingsOf) {
  const cols = [
    ["#", 5], ["Name a prescriber might write", 28], ["…silently becomes", 26], ["Kind", 17], ["RxCUI", 9],
    ["OTHER DRUGS IN THE SAME ATC CLASS (the evidence — could the name mean one of these?)", 60],
    ["Where this name came from", 66], ["Now", 10], ["Decision", 12], ["Amendment / rejection note", 30],
  ];
  const rows = [cols.map(([h]) => H(h))];
  former.forEach(({ drug, name }, i) => {
    const sibs = siblingsOf(drug.primary_name, drug.identity?.atc_codes);
    rows.push([
      T(i + 1),
      B(name.name),
      B(drug.primary_name),
      T(name.kind),
      T(drug.identity?.rxcui || "—"),
      T(sibs.length
        ? `⚠️ ${sibs.length} sibling(s) share ATC ${(drug.identity?.atc_codes || []).map(atcClass).join("/")}: ${sibs.join(" · ")}\nCould "${name.name}" mean one of those rather than "${drug.primary_name}"? If it could, this must ASK, not steer.`
        : "0 siblings in this datastore's ATC class — no near neighbour this name could be confused with."),
      T(name.source),
      T(CODE(name.lookup_disposition)),
      T(""), T(""),
    ]);
  });
  return { name: "2 Former names", rows, widths: cols.map(([, w]) => w), freeze: 1, autofilter: `A1:J1`, validation: { sqref: `I2:I${rows.length}`, values: ["Attest", "Amend", "Reject"] } };
}

function askSheet(ask) {
  const cols = [
    ["#", 5], ["Name", 24], ["Recorded under", 24], ["Kind", 20],
    ["The question this puts to the patient/doctor (THIS is what you are attesting)", 78],
    ["Candidates offered (the system never picks)", 44], ["Why it asks", 56], ["Decision", 12], ["Note", 28],
  ];
  const rows = [cols.map(([h]) => H(h))];
  ask.forEach(({ drug, name }, i) => {
    rows.push([
      T(i + 1), B(name.name), T(drug.primary_name), T(name.kind),
      T(name.confirm_prompt),
      T((name.confirm_candidates || []).join(" · ")),
      T(name.disposition_reason),
      T(""), T(""),
    ]);
  });
  return { name: "3 Ask", rows, widths: cols.map(([, w]) => w), freeze: 1, autofilter: `A1:I1`, validation: { sqref: `H2:H${rows.length}`, values: ["Attest", "Amend", "Reject"] } };
}

function refuseSheet(refuse) {
  const cols = [["#", 5], ["Name", 34], ["Recorded under", 26], ["Why it never resolves", 80], ["Decision", 12], ["Note", 28]];
  const rows = [cols.map(([h]) => H(h))];
  refuse.forEach(({ drug, name }, i) => {
    rows.push([T(i + 1), B(name.name), T(drug.primary_name), T(name.disposition_reason), T(""), T("")]);
  });
  return { name: "4 Refuse", rows, widths: cols.map(([, w]) => w), freeze: 1, validation: { sqref: `E2:E${rows.length}`, values: ["Attest", "Amend", "Reject"] } };
}

function brandsSheet(brands) {
  const cols = [["#", 6], ["Brand (as PBS prints it)", 34], ["Reaches", 30], ["RxCUI", 9], ["Source", 54], ["EXCEPT this one?", 16], ["Note", 28]];
  const rows = [cols.map(([h]) => H(h))];
  brands.forEach(({ drug, name }, i) => {
    rows.push([T(i + 1), T(name.name), T(drug.primary_name), T(drug.identity?.rxcui || "—"), T(name.source), T(""), T("")]);
  });
  return { name: "5 Brands", rows, widths: cols.map(([, w]) => w), freeze: 1, autofilter: `A1:G1`, validation: { sqref: `F2:F${rows.length}`, values: ["Amend", "Reject"] } };
}

export function buildWorkbook(records, utc) {
  const sc = scopes(records);
  const siblingsOf = atcSiblings(records);
  const counts = {
    drugs: records.length,
    names: records.reduce((n, r) => n + r.names.length, 0),
    former: sc.former.length, ask: sc.ask.length, refuse: sc.refuse.length, brands: sc.brands.length,
  };
  const sheets = [
    readmeSheet(utc, counts),
    authoritySheet(counts),
    formerSheet(sc.former, siblingsOf),
    askSheet(sc.ask),
    refuseSheet(sc.refuse),
    brandsSheet(sc.brands),
  ];
  // Nothing may be lost between the scopes — a name in none of them is one that silently never
  // reaches the clinician, which is the failure this whole surface is built against.
  const seen = sc.former.length + sc.ask.length + sc.refuse.length + sc.brands.length;
  const expected = counts.names - records.length; // every drug's own primary is not a decision
  if (seen !== expected) throw new Error(`scoping LOST ${expected - seen} name(s): ${seen} scoped vs ${expected} non-primary names`);

  // THE R-47a BAR — ROW-SCOPED. A workbook-wide search PASSES on an EMPTY evidence column, because
  // the readme's own prose names the siblings. See the note on assertVocabularyRendered.
  assertVocabularyRendered(sheets, sc, siblingsOf);
  return { sheets, counts, scopes: sc };
}

function main(argv) {
  const args = argv.slice(2);
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const utc = val("--utc");
  if (!utc) { console.error("usage: node scripts/pharm-vocabulary-worksheet.mjs --utc <YYYY-MM-DD> [--outdir <dir>] [--force]"); process.exit(2); }
  const outdir = val("--outdir") || join(__dirname, "..", "eval", "pharmacology", "signoff");

  const ds = JSON.parse(readFileSync(join(DATA_DIR, "drug-vocabulary.json"), "utf8"));
  const { sheets, counts } = buildWorkbook(ds.records, utc);

  const out = join(outdir, `drug-vocabulary-worksheet-KL-${utc}.xlsx`);
  // THE OVERWRITE GUARD. I destroyed a signed worksheet once by regenerating over its date-keyed
  // default path; the marks were only recoverable because git had them. A worksheet on disk may
  // carry a clinician's decisions, and those are the medicolegal artifact — not a build output.
  if (existsSync(out) && !args.includes("--force")) {
    console.error(`REFUSING to overwrite ${out} — it may carry the clinician's marks. Use --force only if you are certain it is unsigned.`);
    process.exit(2);
  }
  writeFileSync(out, writeXlsx(sheets));

  console.log(`\npharm-vocabulary-worksheet: ${counts.drugs} drugs · ${counts.names} names\n`);
  console.log(`  sheet 1  Authority       ${String(2).padStart(5)}  decisions — PBS (naming) + RxNorm (concept id)`);
  console.log(`  sheet 2  Former names    ${String(counts.former).padStart(5)}  decisions — THE REAL WORK: each silently redirects a lookup`);
  console.log(`  sheet 3  Ask             ${String(counts.ask).padStart(5)}  decisions — presents candidates, picks none`);
  console.log(`  sheet 4  Refuse          ${String(counts.refuse).padStart(5)}  decisions — a company name is not a drug`);
  console.log(`  sheet 5  Brands          ${String(counts.brands).padStart(5)}  listed, covered by the sheet-1 ruling; except individually`);
  console.log(`\n  → ${out}`);
  console.log(`\n  R-47a bar PASSED over every cell: every name, primary, source, ATC sibling, ask-prompt and candidate is displayed.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
