/**
 * pharm-dose-worksheet-xlsx — the AU dose attestation surface as .xlsx, TRANCHED (E2).
 *
 * WHY: E1 authored the full APF22 Section D adult set (451 records). The markdown worksheet renders
 * all of it — correctly, and at ~9,900 lines, which is not a surface a human attests 440 decisions on.
 * The clinician already attested 88 + 308 records through .xlsx worksheets; this returns to the format
 * that demonstrably works, in the column shape he has used (A–J, Decision dropdown "Attest/Amend/
 * Reject", amendment note beside it).
 *
 * THE TRANCHE (operator ruling 2026-07-15): "Tier A + indication-present first."
 *   Tranche 1 — Tier A (NTI / anticoagulant / cytotoxic: the highest-stakes drugs) UNION every record
 *               whose monograph states the indication its dose belongs to. These are the doses that
 *               carry the most context and the most risk, so they are read first.
 *   Tranche 2 — the remainder: indication-absent, non-Tier-A. NOT lesser evidence and NOT binned —
 *               APF simply prints a range with no indication attached. `indication_status: absent` is
 *               a stated fact about the SOURCE, never a quality judgement on the dose.
 *
 * R-47a IS ENFORCED HERE, BY THE SAME FUNCTION. `assertEvidenceRendered` — the identical bar the
 * markdown surface uses — runs over every cell value of every generated sheet, and THROWS if any
 * verbatim source, dose line, plausibility state, congruence status or comparator dose is recorded
 * but not displayed. Two surfaces, ONE implementation of the bar: a second hand-written copy is the
 * silent-divergence hazard R-47 exists to prevent.
 *
 * Usage:
 *   node scripts/pharm-dose-worksheet-xlsx.mjs --utc 2026-07-15 [--outdir <dir>]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeXlsx } from "./lib/xlsx-min.mjs";
import { assertEvidenceRendered } from "./pharm-dose-worksheet.mjs";
import { TIER_A } from "./pharm-dose-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

/** The xlsx delimiter for a state token — see assertEvidenceRendered's note on why this is not cosmetic. */
export const CODE = (s) => `[${s}]`;

const FLAG = {
  implausible: "⚠️ ORDER-OF-MAGNITUDE FLAG — read this line against the source before attesting. A misplaced zero looks exactly like this. It is NOT a judgement that your dose is wrong, and NOT a block.",
  unassessable: "no plausibility claim made — this is NOT an all-clear",
  plausible: "no order-of-magnitude discrepancy",
};

const COLS = [
  ["#", 5], ["Tier", 8], ["Ingredient", 18],
  ["Your APF22 text (VERBATIM — this is what the engine emits)", 62],
  ["Indication", 12],
  ["Dose lines (indication · route · basis)", 62],
  ["Plausibility", 30],
  ["US/EU label dose (VERBATIM) — evidence beside your dose, never a verdict on it", 62],
  ["Congruence", 26],
  ["Decision", 12],
  ["Amendment / rejection note", 30],
];

/** Tranche 1 = Tier A ∪ indication-present. */
export function tranche1(records) {
  return records.filter((r) => TIER_A.includes(r.ingredient) || r.indication_status === "present");
}
export function tranche2(records) {
  const t1 = new Set(tranche1(records).map((r) => r.ingredient));
  return records.filter((r) => !t1.has(r.ingredient));
}

/** Build the record rows for a tranche. Returns { rows, verifyText }. */
export function buildSheet(records, international) {
  const rows = [COLS.map(([h]) => h)];

  records.forEach((r, i) => {
    const lines = r.dose_lines
      .map((l, n) => `Line ${n + 1} (${l.indication ?? "indication absent"}${l.route ? " · " + l.route : ""} · ${l.basis === "mixed" ? "mixed: weight-based AND flat mg" : l.basis}):\n${l.statement}`)
      .join("\n\n");

    const plaus = r.dose_lines
      .map((l, n) => `Line ${n + 1}: ${CODE(l.plausibility)}\n${FLAG[l.plausibility] ?? ""}${l.plausibility !== "plausible" && l.plausibility_note ? "\n" + l.plausibility_note : ""}`)
      .join("\n\n");

    const c = r.au_congruence;
    let intlCell, congCell;
    if (c.status === "no_comparator") {
      intlCell = "None held.";
      congCell = `${CODE(c.status)}\n${c.appraisal_note}`;
    } else {
      intlCell = c.comparators
        .map((cm) => {
          const src = international.find((x) => x.amass_id === cm.amass_id);
          const st = src ? src.authorization_status : "unknown";
          return `${cm.jurisdiction} (${cm.agency}) — ${st}${st !== "ACTIVE" ? "  ⚠️ NOT A CURRENT LABEL" : ""}:\n${cm.dose_statement}`;
        })
        .join("\n\n");
      congCell = `${CODE(c.status)}\n` +
        (c.status === "non_congruent"
          ? "Your AU dose DIFFERS from the foreign label(s) shown. This is normal — jurisdictions differ by approved indication, population and regulatory history. AU has primacy: this needs no justification from you. Shown so the decision is yours with everything we hold in front of you."
          : "");
    }

    rows.push([
      i + 1,
      TIER_A.includes(r.ingredient) ? "Tier A" : "—",
      r.ingredient,
      r.source_statement,
      r.indication_status + (r.indication_status === "absent" ? " — the monograph prints no indication for this range. A fact about the source, not a mark against the dose." : ""),
      lines,
      plaus,
      intlCell,
      congCell,
      r.provenance?.review_status === "approved" ? "Attest" : "",
      r.provenance?.review_status === "approved" ? `Already attested ${r.provenance.reviewed_by ? "by " + r.provenance.reviewed_by : ""} — carried forward, no action needed.` : "",
    ]);
  });

  // Every cell value, joined — the text the R-47a bar verifies against.
  const verifyText = rows.flat().map((c) => (typeof c === "object" && c !== null ? c.v : c)).join("\n");
  return { rows, verifyText };
}

function readmeSheet(records, tranche, utc, total) {
  const approved = records.filter((r) => r.provenance?.review_status === "approved").length;
  const L = [
    ["AU dose-guidance — clinician attestation worksheet"],
    [`Tranche ${tranche} · ${utc} · ${records.length} records (of ${total} authored)`],
    [""],
    ["Reviewer", "Kenneth Lee (MED0001857758)"],
    [""],
    ["WHAT THIS IS"],
    ["Every AU dose here is YOUR OWN VERBATIM APF22 Section D text. The agent segmented and labelled it for display; it wrote no dose. The schema's substring bar proves that mechanically — it only ever cut."],
    [""],
    ["AU HAS PRIMACY"],
    ["The US/EU labels shown are evidence BESIDE your dose, never a verdict on it. A dose that differs from a foreign label is normal and needs no justification from you. They are shown so the decision is yours with everything we hold in front of you."],
    [""],
    ["HOW TO USE"],
    ["1. Read each row: your verbatim APF22 text, the segmented dose lines, the plausibility state, and any US/EU comparator."],
    ["2. Set Decision (column J) = Attest / Amend / Reject (dropdown)."],
    ["3. If Amend or Reject, write the correction or reason in column K."],
    ["4. Rows already marked 'Attest' are your C2d attestation carried forward (byte-identical source text). No action needed."],
    ["5. Hand back to the engineer: Attested rows get reviewed_by + review_status:approved, and the dataset is re-sealed in the same pass (R-46)."],
    [""],
    ["THE TRANCHE"],
    tranche === 1
      ? ["Tranche 1 — Tier A (NTI / anticoagulant / cytotoxic: highest stakes) plus every record whose monograph STATES the indication. The doses carrying the most context and the most risk, read first."]
      : ["Tranche 2 — the remainder: indication-absent, non-Tier-A. NOT lesser evidence and NOT binned. APF simply prints a range with no indication attached; 'absent' is a stated fact about the SOURCE, never a judgement on the dose."],
    [""],
    ["FLAGS YOU WILL SEE"],
    ["[implausible]", "An order-of-magnitude gap vs a foreign label. A flag for you, NOT a block and NOT a claim your dose is wrong. A misplaced zero looks exactly like this — confirm against the source."],
    ["[unassessable]", "No plausibility claim was made (e.g. no comparable mass amount). This is NOT an all-clear."],
    ["[plausible]", "No order-of-magnitude discrepancy found."],
    ["[non_congruent]", "Your AU dose differs from the foreign label. Ships freely — AU primacy. Shown for your judgement."],
    ["[no_comparator]", "No US/EU label held for this drug. A claim about our SEARCH, not about your dose."],
    [""],
    ["PROGRESS"],
    ["Records in this tranche", records.length],
    ["Already attested (carried forward)", approved],
    ["Awaiting your decision", records.length - approved],
    [""],
    ["SCOPE"],
    ["CLINICAL sign-off only. Regulatory (TGA) sign-off is NOT given here and is a separate gate (FL-50). The dataset stays -dev and NON-patient-facing regardless of what you attest."],
    ["Paediatric doses are deliberately absent: the paediatric hard limit is unchanged (under-18 is flagged for in-person review; no paediatric dosing tables exist)."],
  ];
  return { name: "Read me", rows: L.map((r) => r.map((c, i) => ({ v: c, s: i === 0 && typeof c === "string" && c === c.toUpperCase() && c.length > 3 ? 3 : 2 }))), widths: [42, 96], freeze: 0 };
}

function main(argv) {
  const args = argv.slice(2);
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const utc = val("--utc");
  if (!utc) { console.error("usage: node scripts/pharm-dose-worksheet-xlsx.mjs --utc <YYYY-MM-DD> [--outdir <dir>]"); process.exit(2); }
  const outdir = val("--outdir") || join(__dirname, "..", "eval", "pharmacology", "signoff");

  const all = JSON.parse(readFileSync(join(DATA_DIR, "dose-guidance.json"), "utf8")).records || [];
  const intl = JSON.parse(readFileSync(join(DATA_DIR, "international-dose-guidance.json"), "utf8")).records || [];

  const tranches = [
    { n: 1, records: tranche1(all) },
    { n: 2, records: tranche2(all) },
  ];

  // Nothing may be lost between the tranches — a record in neither is a dose that silently
  // never reaches a clinician, which is the failure this whole subsystem is built against.
  const covered = new Set([...tranches[0].records, ...tranches[1].records].map((r) => r.ingredient));
  const lost = all.filter((r) => !covered.has(r.ingredient));
  if (lost.length) throw new Error(`tranching LOST ${lost.length} record(s): ${lost.map((r) => r.ingredient).join(", ")}`);

  for (const t of tranches) {
    const { rows, verifyText } = buildSheet(t.records, intl);

    // THE R-47a BAR — the same function the markdown surface uses, over every cell of this sheet.
    assertEvidenceRendered(verifyText, t.records, { code: CODE });

    const last = String.fromCharCode(64 + COLS.length); // K
    const sheets = [
      readmeSheet(t.records, t.n, utc, all.length),
      {
        name: `Tranche ${t.n}`,
        rows,
        widths: COLS.map(([, w]) => w),
        freeze: 1,
        autofilter: `A1:${last}1`,
        validation: { sqref: `J2:J${rows.length}`, values: ["Attest", "Amend", "Reject"] },
      },
    ];

    const out = join(outdir, `dose-guidance-worksheet-KL-${utc}-tranche${t.n}.xlsx`);
    if (existsSync(out) && !args.includes("--force")) {
      console.error(`REFUSING to overwrite ${out} — it may carry the clinician's marks. Use --force only if you are certain it is unsigned.`);
      process.exit(2);
    }
    writeFileSync(out, writeXlsx(sheets, { when: new Date(`${utc}T00:00:00Z`) }));

    const approved = t.records.filter((r) => r.provenance?.review_status === "approved").length;
    const flagged = t.records.filter((r) => r.dose_lines.some((l) => l.plausibility === "implausible")).length;
    const comp = t.records.filter((r) => r.au_congruence.status !== "no_comparator").length;
    console.log(`tranche ${t.n}: ${String(t.records.length).padStart(3)} records → ${out.split("/").pop()}`);
    console.log(`            ${approved} carried forward · ${t.records.length - approved} awaiting · ${comp} with US/EU comparator · ${flagged} order-of-magnitude flag`);
  }
  console.log(`\n  R-47a self-verification PASSED on every tranche — no verbatim source, dose line,`);
  console.log(`  plausibility state, congruence status or comparator dose is recorded-but-not-displayed.`);
  console.log(`  Tranching verified lossless: ${all.length} authored = ${tranches[0].records.length} + ${tranches[1].records.length}.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
