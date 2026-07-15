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

/** Tier A — the risk-tiered first pass: the NTI / anticoagulant / cytotoxic set, already the
 *  best-covered drugs in the datastore (14–17 capabilities each). NOT the 886 PBS rows. */
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

  // Tier A + amoxicillin. Amoxicillin is not Tier A by risk, but it is the ONLY drug in the datastore
  // that reaches a clean safe-PASS (no renal rule, no hepatic record, no NTI), which is why
  // contract-pharmacology.js uses it to prove "a safe PASS carries a dose". Today it proves that with
  // a MOCK dose; C3 removes that fallback, so authoring the real APF dose is what keeps the assertion
  // meaningful — and makes it stronger, since it then proves a CLINICIAN-SIGNED dose flows.
  const wanted = [...TIER_A, "amoxicillin"];
  const out = []; const notes = [];
  for (const name of wanted) {
    // try the datastore name, then the explicit APF-spelling map (reported, never silent)
    let mono = ix.get(name);
    if (!mono) {
      const apfName = Object.keys(APF_TO_DATASTORE).find((k) => APF_TO_DATASTORE[k] === name);
      if (apfName && ix.get(apfName)) { mono = ix.get(apfName); notes.push(`  ↔ normalised APF "${apfName}" → datastore "${name}" (explicit map)`); }
    }
    if (!mono) { notes.push(`  ✗ ${name}: NOT FOUND in the transcription — not written`); continue; }
    const rec = buildRecord(mono, name, intl, { ahpra, utc });
    if (!rec) { notes.push(`  ✗ ${name}: no adult dose in the monograph — not written`); continue; }
    out.push(rec);
  }

  console.log(`\npharm-dose-author: ${out.length} record(s) built from ${md}\n`);
  notes.forEach((n) => console.log(n));
  for (const r of out) {
    const p = r.dose_lines.map((l) => l.plausibility);
    console.log(`  • ${r.ingredient.padEnd(15)} ${r.indication_status.padEnd(8)} ${r.dose_lines.length} line(s)  congruence=${r.au_congruence.status.padEnd(14)} plausibility=${[...new Set(p)].join(",")}`);
  }

  if (!write) { console.log("\npharm-dose-author: --dry-run (default). Re-run with --write.\n"); return; }

  const path = join(DATA_DIR, "dose-guidance.json");
  const ds = JSON.parse(readFileSync(path, "utf8"));
  ds.records = out;
  ds.records_checksum = checksumRecords(out); // sealed AFTER the records are final (R-46's rule)
  ds.last_authored_utc = null; // stamped by the operator at commit, per repo convention
  writeFileSync(path, JSON.stringify(ds, null, 2) + "\n");
  console.log(`\npharm-dose-author: wrote ${out.length} record(s) → dose-guidance.json (all review_status:draft — clinician attestation still required)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
