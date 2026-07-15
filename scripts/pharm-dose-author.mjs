/**
 * pharm-dose-author — Channel B: build AU dose-guidance records from the clinician's own APF22
 * Section D transcription (FL dose-guidance C2b/C2d).
 *
 * THE AGENT NEVER ORIGINATES A DOSE. Every `safe_dose_range` here is the clinician's verbatim APF
 * text; this script segments and labels it for SHOWING, and the schema's substring bar proves
 * mechanically that it only ever cut, never wrote. `origin.entered_by` must be an AHPRA registration
 * id — an agent string cannot match it, so an agent-authored dose is unrepresentable.
 *
 * NOTHING IS BINNED. Under the show-evidence principle every readable adult dose is WRITTEN, carrying
 * its plausibility state (`plausible` | `implausible` | `unassessable`) and its `au_congruence`
 * appraisal. `implausible` is a WARN for the clinician, never a veto; `unassessable` states that no
 * plausibility claim is made rather than implying an all-clear. The clinician disposes (Guardrail 2).
 *
 * CONGRUENCE DEFAULTS TO `non_congruent` WHEN A COMPARATOR EXISTS — deliberately. "congruent" is the
 * STRONGER claim (these agree, look no further) and is a clinical judgement this script has no standing
 * to make. `non_congruent` is the conservative direction: it surfaces the AU dose AND the foreign label
 * side by side, which is what we want the clinician to see regardless. It ships freely and needs no
 * note (AU primacy). The clinician may upgrade it to `congruent` at attestation.
 *
 * Usage:
 *   node scripts/pharm-dose-author.mjs --md <path> --ahpra MED0001857758 --utc 2026-07-15 [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseApfMonographs, adultDose, byIngredient } from "./lib/apf-md.mjs";
import { segmentDoseLines, indicationStatus } from "../mcp/servers/pharmacology/domain/dose-lines.js";
import { assessPlausibility } from "../mcp/servers/pharmacology/domain/dose-plausibility.js";
import { validateDoseGuidance } from "../mcp/servers/pharmacology/domain/model.js";
import { checksumRecords } from "./pharm-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

/** Tier A — the NTI / anticoagulant / cytotoxic set: the highest-risk drugs, and the best-covered in
 *  the datastore (14–17 capabilities each).
 *
 *  E1 (2026-07-15): this is now a REPORTING marker only — it orders the worksheet so the clinician
 *  meets the highest-risk drugs first. It is NO LONGER A FILTER. Until E1 this list (plus amoxicillin)
 *  was the entire authoring scope: eleven drugs, because C2 was a deliberate risk-tiered first pass.
 *  That scoping outlived its purpose and became the handbrake — see the gate note in main(). */
export const TIER_A = ["methotrexate", "carbamazepine", "metformin", "sulfasalazine", "phenytoin",
  "alendronate", "apixaban", "dabigatran", "simvastatin", "rivaroxaban"];

/**
 * APF spelling → datastore spelling. EXPLICIT and TINY, never fuzzy — fuzzy-matching drug names is
 * how you dose the wrong drug.
 *
 * WHY THIS EXISTS: APF22 uses Australian/British orthography; the datastore uses the INN. Only 336 of
 * the clinician's 471 APF ingredients match the datastore exactly. Three are pure orthographic
 * variants of a drug that IS in both, and would otherwise be SILENT MISSES — a dose authored under
 * "amoxycillin" is invisible to an engine looking up "amoxicillin". A dose that exists but is never
 * shown is the same failure as no dose at all, arrived at more expensively.
 *
 * These are ORTHOGRAPHIC claims (same INN, different spelling), not clinical-identity judgements —
 * but they are still drug-identity assertions, so every application is REPORTED, never silent, and
 * the map is data a clinician can read and correct. See `pharm-ingredient-name-normalisation` in the
 * completeness register: the general 29% non-match needs a real normaliser (rxnorm-nlm is registered
 * as a source for exactly this and is not yet built), not a longer hand-list.
 */
export const APF_TO_DATASTORE = {
  amoxycillin: "amoxicillin",
  cyclosporin: "ciclosporin",
  pericyazine: "periciazine",
};

/** Build the au_congruence block from the engine-isolated international register. */
function appraise(ingredient, intl, utc) {
  const comparators = intl
    .filter((r) => r.ingredient.toLowerCase() === ingredient && r.dose_statement)
    .map((r) => ({ jurisdiction: r.jurisdiction, agency: r.agency, amass_id: r.amass_id, dose_statement: r.dose_statement }));
  if (!comparators.length) {
    return {
      status: "no_comparator",
      appraised_utc: utc,
      comparators: [],
      appraisal_note: `No US/EU label dose is available for ${ingredient} in the international register. This is a claim about the SEARCH, not about the AU dose.`,
    };
  }
  // Conservative by design — see the header. "congruent" is the stronger claim and is the clinician's
  // to make; "non_congruent" simply puts both doses in front of them, which is the desired outcome.
  return { status: "non_congruent", appraised_utc: utc, comparators };
}

/** Build one DoseGuidanceSchema record from a monograph. Returns null when there is no adult dose. */
export function buildRecord(mono, datastoreName, intl, { ahpra, utc }) {
  const src = adultDose(mono);
  if (!src) return null;
  const lines = segmentDoseLines(src);
  if (!lines.length) return null;

  const au_congruence = appraise(datastoreName, intl, utc);
  const dose_lines = lines.map((l) => {
    const p = assessPlausibility(l.statement, au_congruence.comparators);
    return { indication: l.indication, route: l.route, statement: l.statement, basis: l.basis, plausibility: p.status, plausibility_note: p.note };
  });

  return validateDoseGuidance({
    ingredient: datastoreName,
    context: "adult — APF22 Section D common dosage range",
    source_statement: src,
    indication_status: indicationStatus(lines),
    dose_lines,
    safe_dose_range: src, // the engine emits the WHOLE range and selects nothing — it cannot: getDoseGuidance is indication-blind
    origin: { channel: "clinician_apf_attestation", reference: "apf22", entered_by: ahpra },
    au_congruence,
    provenance: {
      source: "APF22 Section D 'Common dosage range' (facts, cited) — clinician transcription",
      source_ref: "apf22",
      authored_by: "pharm-dose-author (segmentation only; the dose is the clinician's verbatim text)",
      reviewed_by: null,
      review_status: "draft", // C2d attestation flips this; never presumed here
      version: "v0.1.0",
      effective_date: utc,
    },
  });
}

function main(argv) {
  const args = argv.slice(2);
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const md = val("--md"); const ahpra = val("--ahpra"); const utc = val("--utc"); const write = args.includes("--write");
  if (!md || !ahpra || !utc) { console.error("usage: node scripts/pharm-dose-author.mjs --md <path> --ahpra <AHPRA id> --utc <YYYY-MM-DD> [--write]"); process.exit(2); }

  const ix = byIngredient(parseApfMonographs(readFileSync(md, "utf8")));
  const intl = JSON.parse(readFileSync(join(DATA_DIR, "international-dose-guidance.json"), "utf8")).records || [];

  // ── E1 (2026-07-15): THE TIER_A GATE IS GONE ────────────────────────────────────────────────────
  // This loop used to run over `[...TIER_A, "amoxicillin"]` — ELEVEN drugs — because C2 was a
  // deliberate risk-tiered first pass. That scoping outlived its purpose and became the handbrake:
  // the clinician transcribed 471 monographs carrying 451 adult doses, and 440 of them were never
  // authored. Not because any safety bar rejected them — because a filter literal was never widened.
  // A dose the clinician wrote that the engine never sees is the same failure as no dose at all
  // (see the APF_TO_DATASTORE header), arrived at more expensively.
  //
  // Under the show-evidence principle EVERY readable adult dose is authored. Nothing is binned. The
  // plausibility state, congruence appraisal and indication status ride WITH each record: they LABEL
  // it for the clinician, they never withhold it. Authoring is not attesting — every new record is
  // `review_status:"draft"` and reaches nobody until KL's worksheet round-trip approves it.
  //
  // A monograph with no "Adult dose" label is skipped and reported (paediatric-only, referral Note,
  // or a declared Section D absence). That is the paediatric hard limit holding by construction:
  // `adultDose()` deliberately does not return the combined "Adult and paediatric dose" label.
  const out = []; const notes = []; const skipped = [];
  for (const [apfName, mono] of ix) {
    // APF orthography → datastore spelling, via the explicit map. Reported, never silent.
    const datastoreName = APF_TO_DATASTORE[apfName] || apfName;
    if (APF_TO_DATASTORE[apfName]) notes.push(`  ↔ normalised APF "${apfName}" → datastore "${datastoreName}" (explicit map)`);

    const rec = buildRecord(mono, datastoreName, intl, { ahpra, utc });
    if (!rec) { skipped.push(datastoreName); continue; } // no adult dose in this monograph
    out.push(rec);
  }

  // Highest-risk first, then alphabetical — the order the clinician reads them in.
  out.sort((a, b) => {
    const ta = TIER_A.includes(a.ingredient) ? 0 : 1;
    const tb = TIER_A.includes(b.ingredient) ? 0 : 1;
    return ta - tb || a.ingredient.localeCompare(b.ingredient);
  });

  // ── Carry forward prior attestations ────────────────────────────────────────────────────────────
  // A re-author must NEVER silently discard a clinician's signature. Where a record's source_statement
  // is BYTE-IDENTICAL to one KL already approved, his attestation stands — it is the same text, from
  // the same transcription, and re-running a deterministic segmentation does not un-review it. Where
  // the text DRIFTED, the record returns to draft: he attested the old words, not the new ones.
  const prior = new Map(
    (JSON.parse(readFileSync(join(DATA_DIR, "dose-guidance.json"), "utf8")).records || [])
      .map((r) => [String(r.ingredient).toLowerCase(), r]),
  );
  let carried = 0; const drifted = [];
  for (const r of out) {
    const p = prior.get(r.ingredient.toLowerCase());
    if (!p || p.provenance?.review_status !== "approved") continue;
    if (p.source_statement === r.source_statement) {
      r.provenance.reviewed_by = p.provenance.reviewed_by;
      r.provenance.review_status = "approved";
      carried++;
    } else {
      drifted.push(r.ingredient); // stays draft — deliberately
    }
  }

  const drafts = out.filter((r) => r.provenance.review_status === "draft").length;
  const withComparator = out.filter((r) => r.au_congruence.status !== "no_comparator").length;
  const implausible = out.filter((r) => r.dose_lines.some((l) => l.plausibility === "implausible"));

  console.log(`\npharm-dose-author: ${out.length} record(s) built from ${md}\n`);
  notes.forEach((n) => console.log(n));
  console.log(`  monographs read        ${ix.size}`);
  console.log(`  authored (adult dose)  ${out.length}`);
  console.log(`  skipped (no adult dose)${String(skipped.length).padStart(4)}  — paediatric-only / referral Note / declared Section D absence`);
  console.log(`  attestation carried    ${String(carried).padStart(4)}  — byte-identical source, KL's signature stands`);
  console.log(`  source text drifted    ${String(drifted.length).padStart(4)}  ${drifted.length ? "→ returned to draft: " + drifted.join(", ") : "— none"}`);
  console.log(`  awaiting attestation   ${String(drafts).padStart(4)}  review_status:draft`);
  console.log(`  with US/EU comparator  ${String(withComparator).padStart(4)}`);
  console.log(`  order-of-magnitude ⚠   ${String(implausible.length).padStart(4)}  ${implausible.length ? "→ " + implausible.map((r) => r.ingredient).join(", ") : ""}`);
  console.log(`\n  NOTHING BINNED — every readable adult dose above is written, labelled with its`);
  console.log(`  plausibility and congruence state. The clinician disposes (Guardrail 2).`);

  if (!write) { console.log("\npharm-dose-author: --dry-run (default). Re-run with --write.\n"); return; }

  const path = join(DATA_DIR, "dose-guidance.json");
  const ds = JSON.parse(readFileSync(path, "utf8"));
  ds.records = out;
  ds.records_checksum = checksumRecords(out); // sealed AFTER the records are final (R-46's rule)
  ds.last_authored_utc = null; // stamped by the operator at commit, per repo convention

  // The dataset-level flag must not outrun the records. With drafts present it is FALSE — per-record
  // `review_status` stays authoritative, exactly the precedent the reference datasets set in the
  // 88/308 worksheets. Leaving it `true` over 440 drafts would be the R-46 failure wearing a new hat:
  // a signature field that no longer describes what it seals.
  if (drafts > 0) {
    ds.attestation.clinical_sign_off = false;
    ds.attestation.scope =
      `pharm-dose-guidance dev v0.1.0 — ${out.length} records (E1: the full APF22 Section D adult set). ` +
      `${carried} carry KL's ${ds.attestation.attested_utc} attestation forward (byte-identical source_statement); ` +
      `${drafts} are review_status 'draft' and AWAIT attestation. Dataset-level clinical_sign_off is FALSE while any ` +
      `draft remains — per-record review_status is authoritative. AU doses only; paediatric rows deliberately ` +
      `excluded (the paediatric hard limit is unchanged).`;
  }

  writeFileSync(path, JSON.stringify(ds, null, 2) + "\n");
  console.log(`\npharm-dose-author: wrote ${out.length} record(s) → dose-guidance.json`);
  console.log(`  ${carried} attested (carried forward) · ${drafts} draft — clinician attestation required`);
  console.log(`  dataset clinical_sign_off → ${ds.attestation.clinical_sign_off} (drafts present)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
