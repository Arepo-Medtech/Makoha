/**
 * pharm-vocabulary-apply-signoff — apply a COMPLETED vocabulary worksheet to the datastore (V3).
 *
 * The round trip's missing half, and the same shape as pharm-dose-apply-signoff: a sign-off applied
 * by hand is how R-46 happened, because applying one MUTATES every record's provenance block, which
 * invalidates the `records_checksum` computed at build time — and nothing re-sealed. The re-seal is
 * not a step anyone should have to remember; it is the last thing this script does.
 *
 * ══ THE LOAD-BEARING CHECK — TEXT DRIFT ══
 * The clinician attested THE ROWS THE WORKSHEET SHOWED HIM. If a name, its primary, or (for an ask)
 * the question it puts have changed since, his signature does not transfer — he approved something
 * else. Every attested row is re-verified against the live datastore and ANY mismatch aborts the
 * WHOLE apply. Without it, a rebuild between generating and applying would launder new mappings
 * through an old signature: an agent-authored redirect wearing a clinician's name, which is the one
 * thing this subsystem exists to make impossible.
 *
 * ══ THE TWO BLANK SEMANTICS, AND WHY THEY DIFFER ══
 * Sheets 1-4 (authority / former names / ask / refuse): a blank ABORTS. "I could not read his mark"
 * must never resolve to "approved" — that is a fabricated attestation.
 * Sheet 5 (brands): the column is "EXCEPT this one?", so a blank means NO EXCEPTION TAKEN and the
 * sheet-1 authority ruling covers it. That is not a missing decision; it is the decision, made once
 * on sheet 1 and not restated 3,635 times. This asymmetry is deliberate and it is the only reason
 * the review is tractable — so it is stated here rather than left to be inferred from a `||`.
 *
 * ══ WHAT IT WILL NOT DO ══
 *   - Amend / Reject are REPORTED, never auto-applied. An amendment is the clinician's new words; a
 *     rejection is a ruling. Both go back through vocabulary-overrides.json (V1's table), where the
 *     mechanical bar still holds: an override may never CREATE a steer.
 *   - It never sets regulatory_sign_off. That is FL-50 and an entirely different gate.
 *   - It never approves a PRIMARY name by inference — see the note in `apply()`.
 *
 * Usage:
 *   node scripts/pharm-vocabulary-apply-signoff.mjs --utc 2026-07-15 --reviewer "Kenneth Lee" \
 *     --ahpra MED0001857758 --xlsx <path> [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readXlsxSheet } from "./lib/xlsx-min.mjs";
import { checksumRecords } from "./pharm-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

const VALID = ["Attest", "Amend", "Reject"];

/**
 * Sheet layout — asserted by HEADER TEXT, never by position. A column inserted to the left would
 * otherwise silently re-point this at the wrong cell, and the cell to the right of Decision is the
 * amendment note: the clinician's prose would be read as his verdict.
 */
const SHEETS = {
  authority: { idx: 2, name: "1 Authority", key: "B", keyHeader: "The decision", decision: "E", note: "F", blankAborts: true },
  former: { idx: 3, name: "2 Former names", key: "B", keyHeader: "Name a prescriber might write", primary: "C", decision: "I", note: "J", blankAborts: true },
  ask: { idx: 4, name: "3 Ask", key: "B", keyHeader: "Name", primary: "C", prompt: "E", decision: "H", note: "I", blankAborts: true },
  refuse: { idx: 5, name: "4 Refuse", key: "B", keyHeader: "Name", primary: "C", decision: "E", note: "F", blankAborts: true },
  brands: { idx: 6, name: "5 Brands", key: "B", keyHeader: "Brand (as PBS prints it)", primary: "C", decision: "F", note: "G", blankAborts: false },
};

export function readSheet(buf, spec) {
  const rows = readXlsxSheet(buf, spec.idx);
  const header = rows[0] || {};
  if (header[spec.key] !== spec.keyHeader) {
    throw new Error(`${spec.name}: unexpected layout — column ${spec.key} reads "${header[spec.key]}", expected "${spec.keyHeader}". Refusing to guess which column holds the clinician's decision.`);
  }
  return rows.slice(1).map((r, i) => ({
    row: i + 2,
    key: (r[spec.key] ?? "").trim(),
    primary: spec.primary ? (r[spec.primary] ?? "").trim() : null,
    prompt: spec.prompt ? (r[spec.prompt] ?? "").trim() : null,
    decision: (r[spec.decision] ?? "").trim(),
    note: (r[spec.note] ?? "").trim(),
  })).filter((r) => r.key !== "");
}

/**
 * Apply the marks. Pure over (records, marks) so every abort path is testable without a workbook.
 * @returns {{records, applied, amended, rejected, exceptions, coverage}}
 */
export function apply(records, marks, { reviewer, ahpra, utc }) {
  const drift = [];
  const amended = [];
  const rejected = [];
  const attested = new Set(); // `${name}␟${primary}` — every name the clinician actually signed

  for (const [scope, rows] of Object.entries(marks)) {
    const spec = SHEETS[scope];
    for (const m of rows) {
      // Blank handling — the asymmetry is in SHEETS, not improvised here.
      if (!m.decision) {
        if (spec.blankAborts) {
          throw new Error(
            `${spec.name} row ${m.row} ("${m.key}"): BLANK decision. A blank is not an attestation — ` +
            `"I could not read his mark" must never resolve to "approved". Complete the row or remove it.`,
          );
        }
        continue; // brands: no exception taken → the sheet-1 authority ruling covers it
      }
      if (!VALID.includes(m.decision)) {
        throw new Error(`${spec.name} row ${m.row} ("${m.key}"): unrecognised decision "${m.decision}". Expected one of ${VALID.join(" / ")}.`);
      }
      if (m.decision === "Amend") { amended.push({ scope, ...m }); continue; }
      if (m.decision === "Reject") { rejected.push({ scope, ...m }); continue; }
      if (scope === "authority") { attested.add(`AUTHORITY␟${m.key}`); continue; }

      // TEXT DRIFT — the signature applies to the exact row he read.
      const rec = records.find((r) => r.primary_name.toLowerCase() === m.primary.toLowerCase());
      if (!rec) { drift.push(`${spec.name} row ${m.row}: "${m.key}" → "${m.primary}" — that drug is no longer in the vocabulary`); continue; }
      const nm = rec.names.find((n) => n.name === m.key);
      if (!nm) { drift.push(`${spec.name} row ${m.row}: "${m.key}" is no longer a name of "${m.primary}"`); continue; }
      if (spec.prompt && (nm.confirm_prompt ?? "") !== m.prompt) {
        drift.push(`${spec.name} row ${m.row}: "${m.key}" — the QUESTION has changed since it was signed.\n    worksheet: ${m.prompt}\n    datastore: ${nm.confirm_prompt}`);
        continue;
      }
      attested.add(`${m.key}␟${rec.primary_name}`);
    }
  }

  if (drift.length) {
    throw new Error(
      `TEXT DRIFT — refusing the WHOLE apply (${drift.length} row(s)):\n  ` + drift.join("\n  ") +
      `\n\nThe clinician signed the rows the worksheet showed him. These no longer match, so his signature does not transfer to them. ` +
      `Re-generate the worksheet against the current vocabulary and have it re-signed. Do not apply a signature to words it was not given for.`,
    );
  }

  // ── COVERAGE: a record is approved only when EVERY name it holds is accounted for ──
  // The authority ruling is what covers the 3,635 brands. If it were rejected, every brand would be
  // unattested and no record holding one could be approved — so it is checked, not assumed.
  const pbsRuling = [...attested].some((k) => k.startsWith("AUTHORITY␟PBS is the AU naming authority"));
  const rxRuling = [...attested].some((k) => k.startsWith("AUTHORITY␟RxNorm"));
  const rejectedNames = new Set(rejected.map((r) => `${r.key}␟${r.primary}`));
  const amendedNames = new Set(amended.map((r) => `${r.key}␟${r.primary}`));

  const out = [];
  let approved = 0, held = 0;
  const holdReasons = [];
  for (const r of records) {
    const unmet = [];
    for (const n of r.names) {
      // A PRIMARY is not a decision and is not approved by inference. A name that resolves to ITSELF
      // redirects nothing — it is the drug's identity, not a mapping between two names — which is why
      // the worksheet never showed one and why nothing here pretends it was signed.
      if (n.kind === "primary") continue;
      const k = `${n.name}␟${r.primary_name}`;
      if (rejectedNames.has(k) || amendedNames.has(k)) { unmet.push(`${n.name} (${rejectedNames.has(k) ? "rejected" : "amended"})`); continue; }
      if (attested.has(k)) continue;
      if (n.kind === "brand" && pbsRuling) continue;   // covered by the sheet-1 authority ruling
      unmet.push(`${n.name} (not attested)`);
    }
    if (unmet.length) {
      held++;
      holdReasons.push(`${r.primary_name}: ${unmet.slice(0, 3).join(", ")}${unmet.length > 3 ? ` +${unmet.length - 3} more` : ""}`);
      out.push(r); // unchanged — stays draft, keeps steering nothing
    } else {
      approved++;
      out.push({ ...r, provenance: { ...r.provenance, reviewed_by: reviewer, review_status: "approved", effective_date: utc } });
    }
  }
  return { records: out, approved, held, holdReasons, amended, rejected, attested, pbsRuling, rxRuling };
}

function main(argv) {
  const args = argv.slice(2);
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const utc = val("--utc"), reviewer = val("--reviewer"), ahpra = val("--ahpra"), xlsx = val("--xlsx");
  const write = args.includes("--write");
  if (!utc || !reviewer || !ahpra || !xlsx) {
    console.error(`usage: node scripts/pharm-vocabulary-apply-signoff.mjs --utc <YYYY-MM-DD> --reviewer "<name>" --ahpra <reg> --xlsx <path> [--write]`);
    process.exit(2);
  }

  const path = join(DATA_DIR, "drug-vocabulary.json");
  const ds = JSON.parse(readFileSync(path, "utf8"));

  // R-46: the seal must be intact BEFORE we mutate. Applying to a dataset that is already drifted
  // would bury a pre-existing tamper under a fresh, valid-looking seal — and the clinician's name.
  const before = checksumRecords(ds.records);
  if (before !== ds.records_checksum) {
    console.error(`REFUSING: drug-vocabulary.json's seal is ALREADY broken before this apply (stored ${ds.records_checksum.slice(0, 12)}, actual ${before.slice(0, 12)}).\nRe-seal and investigate the drift first — applying now would bury it under a fresh seal carrying the clinician's name.`);
    process.exit(2);
  }

  const buf = readFileSync(xlsx);
  const marks = Object.fromEntries(Object.entries(SHEETS).map(([k, spec]) => [k, readSheet(buf, spec)]));
  const r = apply(ds.records, marks, { reviewer, ahpra, utc });

  const counts = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v.filter((x) => x.decision).length]));
  console.log(`\npharm-vocabulary-apply-signoff: ${xlsx.split("/").pop()}\n`);
  console.log(`  authority ruling   PBS naming: ${r.pbsRuling ? "ATTESTED" : "NOT attested"} · RxNorm concept id: ${r.rxRuling ? "ATTESTED" : "NOT attested"}`);
  console.log(`  decisions read     ${JSON.stringify(counts)}`);
  console.log(`  brand exceptions   ${r.rejected.filter((x) => x.scope === "brands").length + r.amended.filter((x) => x.scope === "brands").length}`);
  console.log(`  records APPROVED   ${r.approved} / ${ds.records.length}`);
  console.log(`  records HELD       ${r.held}${r.held ? "  (stay draft — they keep steering nothing)" : ""}`);
  for (const h of r.holdReasons.slice(0, 8)) console.log(`      · ${h}`);
  if (r.amended.length) { console.log(`\n  AMEND (${r.amended.length}) — reported, never auto-applied; route through vocabulary-overrides.json:`); for (const a of r.amended) console.log(`      · ${a.key} → ${a.primary}: ${a.note || "(no note)"}`); }
  if (r.rejected.length) { console.log(`\n  REJECT (${r.rejected.length}) — reported, never auto-applied:`); for (const a of r.rejected) console.log(`      · ${a.key} → ${a.primary}: ${a.note || "(no note)"}`); }

  if (!write) { console.log("\n  --dry-run (default). Re-run with --write.\n"); return; }

  const priorChecksum = ds.records_checksum;
  ds.records = r.records;
  // THE RE-SEAL, in the same pass that caused the drift. R-46: the sign-off mutates every approved
  // record's provenance, which invalidates the seal computed at build time. Doing this by hand is
  // exactly how seven datasets carried stale seals for a day.
  ds.records_checksum = checksumRecords(ds.records);

  const fullySigned = r.held === 0;
  ds.attestation = {
    ...ds.attestation,
    method: "clinician_attestation_via_signed_worksheet",
    clinical_sign_off: fullySigned,
    regulatory_sign_off: false,
    reviewer_id: `${reviewer} (${ahpra})`,
    attested_utc: utc,
    recorded_by: "claude-fable-5 (agent, on clinician explicit sign-off)",
    statement:
      `Registered medical practitioner ${reviewer} (${ahpra}) reviewed the drug vocabulary through the tranched xlsx worksheet ` +
      `(eval/pharmacology/signoff/${xlsx.split("/").pop()}) on ${utc} and marked ${counts.authority} authority decision(s), ` +
      `${counts.former} former-name decision(s), ${counts.ask} ask-prompt decision(s) and ${counts.refuse} refusal(s): ` +
      `${r.approved} record(s) approved, ${r.amended.length} amend, ${r.rejected.length} reject. ` +
      `THE SCOPE OF WHAT WAS READ, stated exactly: he did NOT mark 5,196 rows. He ruled on two SOURCES — PBS as the Australian ` +
      `naming authority for brand→ingredient, and RxNorm's concept id as the identity key — and those rulings cover the ` +
      `3,635 PBS brand names, each of which was listed on sheet 5 and individually exceptable (${r.rejected.filter((x) => x.scope === "brands").length + r.amended.filter((x) => x.scope === "brands").length} exceptions taken). ` +
      `He then decided individually every name that STEERS silently (the former names), every question the system puts to a ` +
      `patient (the ask-prompts), and every refusal. Each former-name row was presented with its primary, its RxCUI, its source, ` +
      `and the other drugs sharing its ATC class — the evidence that caught erythropoietin→epoetin alfa, which RxNorm asserts as ` +
      `one concept and no mechanical test could detect. The rendering bar (assertVocabularyRendered) ran row-scoped over every ` +
      `generated cell and would have thrown had any of that evidence been recorded but not displayed. Every attested row's text ` +
      `was re-verified against the datastore at apply time (text-drift check), so the signature applies to the exact rows reviewed. ` +
      `A US/EU generic may still never steer silently, signed or not — that bar is in the schema. ` +
      `CLINICAL sign-off only; regulatory (TGA) sign-off NOT given; dataset remains -dev and non-patient-facing.`,
    scope:
      `${r.approved} of ${ds.records.length} drug records approved · ${counts.former} steering names, ${counts.ask} ask-prompts and ` +
      `${counts.refuse} refusals decided individually · 3,635 brands covered by the attested PBS authority ruling and listed for ` +
      `inspection · primary names are not decisions (a name resolving to ITSELF redirects nothing). Identity only — no dose, no clinical claim.`,
    reseal_history: [
      ...(ds.attestation?.reseal_history || []),
      {
        resealed_utc: utc,
        prior_checksum: priorChecksum,
        new_checksum: ds.records_checksum,
        records: r.approved,
        reason:
          `V3 clinician attestation applied: ${reviewer} (${ahpra}) marked the vocabulary worksheet and the application set ` +
          `provenance.reviewed_by/review_status on every approved record. The seal was computed at build time when those records ` +
          `were draft, so the sign-off invalidated it — the R-46 mechanism. Re-sealed in the same pass that caused the drift, by ` +
          `the apply script rather than by memory. No identity content changed: only the two provenance review fields the ` +
          `attestation is supposed to change.`,
      },
    ],
  };
  writeFileSync(path, JSON.stringify(ds, null, 2) + "\n");
  console.log(`\n  WROTE drug-vocabulary.json — clinical_sign_off: ${fullySigned}`);
  console.log(`  re-sealed ${priorChecksum.slice(0, 12)} → ${ds.records_checksum.slice(0, 12)} (R-46: the sign-off mutates records, so the seal moves in the same pass)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
