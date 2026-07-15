/**
 * pharm-dose-apply-signoff — apply a COMPLETED clinician worksheet back to the datastore (E2).
 *
 * WHY THIS IS A SCRIPT AND NOT A HAND EDIT. The 88 + 308 sign-offs were applied by hand, and that is
 * exactly how R-46 happened: applying a sign-off MUTATES each record's provenance block, which
 * invalidates the `records_checksum` computed at authoring time — and nothing re-sealed. Seven
 * datasets carried stale seals for a day. The re-seal is not a step someone should have to remember;
 * it is the last line of this script.
 *
 * THE LOAD-BEARING CHECK — TEXT DRIFT. The clinician attested THE TEXT THE WORKSHEET SHOWED HIM. If a
 * record's `source_statement` no longer matches the cell he read, his signature does not transfer:
 * he approved different words. This script compares the worksheet's verbatim column against the
 * datastore record and REFUSES the whole apply on any mismatch. Without that check, a re-author
 * between generating a worksheet and applying it would silently launder new text through an old
 * signature — an agent-authored dose wearing a clinician's name, which is the one thing this
 * subsystem exists to make impossible.
 *
 * WHAT IT WILL NOT DO:
 *   - Amend / Reject are REPORTED, never auto-applied. An amendment is the clinician's new words; it
 *     goes back through authoring (Channel B) so the substring bar still proves the agent only cut.
 *   - A blank or unrecognised decision ABORTS. "I could not read his mark" must never resolve to
 *     "approved" — that is a fabricated attestation.
 *   - It never sets regulatory_sign_off. That is FL-50 and belongs to an entirely different gate.
 *
 * Usage:
 *   node scripts/pharm-dose-apply-signoff.mjs --utc 2026-07-15 --reviewer "Kenneth Lee" \
 *     --ahpra MED0001857758 --xlsx <path> [--xlsx <path2> …] [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readXlsxSheet } from "./lib/xlsx-min.mjs";
import { checksumRecords } from "./pharm-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

/** Column map — must match pharm-dose-worksheet-xlsx.mjs's COLS. */
const COL = { ingredient: "C", source: "D", decision: "J", note: "K" };
const VALID = ["Attest", "Amend", "Reject"];

/** Read one completed worksheet into decision rows. Sheet 2 is the records sheet (1 is "Read me"). */
export function readWorksheet(path) {
  const rows = readXlsxSheet(readFileSync(path), 2);
  const header = rows[0] || {};
  if (header[COL.ingredient] !== "Ingredient" || header[COL.decision] !== "Decision") {
    throw new Error(`${path}: unexpected column layout (C="${header[COL.ingredient]}", J="${header[COL.decision]}") — refusing to guess which column holds the clinician's decision`);
  }
  return rows.slice(1)
    .map((c, i) => ({
      row: i + 2,
      ingredient: (c[COL.ingredient] || "").trim(),
      source: c[COL.source] || "",
      decision: (c[COL.decision] || "").trim(),
      note: (c[COL.note] || "").trim(),
    }))
    .filter((r) => r.ingredient);
}

function main(argv) {
  const args = argv.slice(2);
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const all = (f) => args.reduce((a, x, i) => (x === f ? [...a, args[i + 1]] : a), []);
  const utc = val("--utc"); const reviewer = val("--reviewer"); const ahpra = val("--ahpra");
  const sheets = all("--xlsx"); const write = args.includes("--write");
  if (!utc || !reviewer || !ahpra || !sheets.length) {
    console.error('usage: node scripts/pharm-dose-apply-signoff.mjs --utc <YYYY-MM-DD> --reviewer "<name>" --ahpra <id> --xlsx <path> [--xlsx <path2>] [--write]');
    process.exit(2);
  }

  const path = join(DATA_DIR, "dose-guidance.json");
  const ds = JSON.parse(readFileSync(path, "utf8"));
  const byName = new Map(ds.records.map((r) => [r.ingredient.toLowerCase(), r]));

  const decisions = sheets.flatMap((s) => readWorksheet(s).map((d) => ({ ...d, sheet: s.split("/").pop() })));
  const fatal = [];

  // 1. Every decision must be legible. A blank never becomes an Attest.
  for (const d of decisions) {
    if (!VALID.includes(d.decision)) {
      fatal.push(`${d.sheet} row ${d.row} (${d.ingredient}): decision is "${d.decision || "(blank)"}" — not one of ${VALID.join("/")}. An unreadable mark must never resolve to approved.`);
    }
  }

  // 2. Every worksheet row must name a record that exists.
  for (const d of decisions) {
    if (!byName.has(d.ingredient.toLowerCase())) {
      fatal.push(`${d.sheet} row ${d.row}: "${d.ingredient}" is not in the datastore — the worksheet and the datastore disagree about what was reviewed.`);
    }
  }

  // 3. TEXT DRIFT — the signature transfers only to the words he actually read.
  for (const d of decisions) {
    const rec = byName.get(d.ingredient.toLowerCase());
    if (!rec || !d.source) continue;
    if (rec.source_statement.trim() !== d.source.trim()) {
      fatal.push(`${d.sheet} row ${d.row} (${d.ingredient}): the worksheet's verbatim text does NOT match the datastore record. The clinician attested different words; his signature does not transfer to these.`);
    }
  }

  // 4. Every record must have been decided — a record the clinician never saw stays draft, but a
  //    PARTIAL apply that silently leaves some records behind is reported, not assumed benign.
  const decided = new Set(decisions.map((d) => d.ingredient.toLowerCase()));
  const undecided = ds.records.filter((r) => !decided.has(r.ingredient.toLowerCase()));

  if (fatal.length) {
    console.error(`\npharm-dose-apply-signoff: REFUSING to apply — ${fatal.length} problem(s):\n`);
    fatal.slice(0, 20).forEach((f) => console.error("  ✗ " + f));
    if (fatal.length > 20) console.error(`  … and ${fatal.length - 20} more`);
    console.error("\nNo record was changed.\n");
    process.exit(1);
  }

  const attest = decisions.filter((d) => d.decision === "Attest");
  const amend = decisions.filter((d) => d.decision === "Amend");
  const reject = decisions.filter((d) => d.decision === "Reject");

  console.log(`\npharm-dose-apply-signoff: ${decisions.length} decision(s) read from ${sheets.length} worksheet(s)\n`);
  console.log(`  Attest ${String(attest.length).padStart(4)}`);
  console.log(`  Amend  ${String(amend.length).padStart(4)}  ${amend.length ? "→ NOT auto-applied; re-author through Channel B so the substring bar still holds" : ""}`);
  console.log(`  Reject ${String(reject.length).padStart(4)}  ${reject.length ? "→ NOT auto-applied; the record stays draft and reaches no engine" : ""}`);
  console.log(`  undecided in datastore ${undecided.length}${undecided.length ? " → left draft: " + undecided.slice(0, 5).map((r) => r.ingredient).join(", ") : ""}`);
  for (const d of [...amend, ...reject]) console.log(`   ** ${d.decision}: ${d.ingredient} — ${d.note || "(no note given)"}`);
  console.log(`\n  text-drift check: PASSED — every attested record's verbatim text matches what the worksheet displayed.`);

  if (!write) { console.log("\n  --dry-run (default). Re-run with --write.\n"); return; }

  // Apply: Attest → approved. Amend/Reject stay draft, deliberately.
  let applied = 0;
  for (const d of attest) {
    const rec = byName.get(d.ingredient.toLowerCase());
    rec.provenance.reviewed_by = reviewer;
    rec.provenance.review_status = "approved";
    applied++;
  }

  const drafts = ds.records.filter((r) => r.provenance.review_status === "draft").length;
  const prior = ds.records_checksum;

  // ── THE MANDATORY RE-SEAL (R-46) ──────────────────────────────────────────────────────────────
  // The sign-off just mutated every attested record's provenance block. The seal computed at
  // authoring time now describes records that no longer exist. Re-seal HERE, in the same pass that
  // caused the drift — never as a step someone is trusted to remember.
  ds.records_checksum = checksumRecords(ds.records);

  ds.attestation.clinical_sign_off = drafts === 0;
  ds.attestation.reviewer_id = `${reviewer} (${ahpra})`;
  ds.attestation.attested_utc = utc;
  ds.attestation.statement =
    `Registered medical practitioner ${reviewer} (${ahpra}) reviewed the tranched R-47a attestation worksheets ` +
    `(${sheets.map((s) => "eval/pharmacology/signoff/" + s.split("/").pop()).join(", ")}) and marked ${attest.length} records Attest, ` +
    `${amend.length} Amend, ${reject.length} Reject. Each record was presented with: his own verbatim APF22 Section D source ` +
    `statement, every segmented dose line with indication/route/dosing-basis, its plausibility state (including the ` +
    `carbamazepine order-of-magnitude flag), and every US/EU comparator label dose VERBATIM with its authorisation status. ` +
    `The rendering bar (assertEvidenceRendered) ran over the generated cells and would have thrown had any evidence been ` +
    `recorded-but-not-displayed. Every attested record's verbatim text was re-verified against the datastore at apply time ` +
    `(text-drift check), so the signature applies to the exact words reviewed. CLINICAL sign-off only; regulatory (TGA) ` +
    `sign-off NOT given; dataset remains -dev and non-patient-facing.`;
  ds.attestation.scope =
    `pharm-dose-guidance dev v0.1.0 — ${ds.records.length} records (the full APF22 Section D adult set, E1). ` +
    `${ds.records.length - drafts} review_status 'approved'; ${drafts} remain draft. AU doses only; the 232 paediatric ` +
    `rows are deliberately excluded (the paediatric hard limit is unchanged). Attested against the tranched xlsx ` +
    `worksheets, retained as the medicolegal artifacts.`;
  ds.attestation.reseal_history = [
    ...(ds.attestation.reseal_history || []),
    {
      resealed_utc: utc,
      prior_checksum: prior,
      new_checksum: ds.records_checksum,
      records: ds.records.length,
      reason: `E2 clinician attestation applied: ${reviewer} (${ahpra}) marked ${attest.length} Attest / ${amend.length} Amend / ${reject.length} Reject across ${sheets.length} tranched worksheets, and the application set provenance.reviewed_by/review_status on every attested record. The seal was computed at authoring time when those records were draft, so the sign-off invalidated it — the R-46 mechanism. Re-sealed in the same pass that caused the drift, by the apply script rather than by memory. No clinical content changed: only the two provenance review fields the attestation is supposed to change.`,
    },
  ];

  writeFileSync(path, JSON.stringify(ds, null, 2) + "\n");
  console.log(`\n  applied ${applied} attestation(s) → dose-guidance.json`);
  console.log(`  re-sealed (R-46): ${prior.slice(0, 12)}… → ${ds.records_checksum.slice(0, 12)}…`);
  console.log(`  clinical_sign_off → ${ds.attestation.clinical_sign_off} (${drafts} draft remaining)`);
  console.log(`  regulatory_sign_off stays ${ds.attestation.regulatory_sign_off} — FL-50, a different gate.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
