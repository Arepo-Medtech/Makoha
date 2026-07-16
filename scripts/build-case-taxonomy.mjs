#!/usr/bin/env node
/**
 * build-case-taxonomy — generate data/taxonomy/case-taxonomy.json (Case Corpus v2, Phase 1).
 *
 * WHY A VERSIONED DATASET AND NOT A SCHEMA ENUM OR AN ID SEGMENT:
 *
 * 1. The operator's corpus carries TWO INCOMPATIBLE TAXONOMIES. Tranche 1 = 30 MIXED-AXIS
 *    categories (Cardiovascular is a specialty, Geriatric & Frailty is a cohort,
 *    Undifferentiated Subclinical Clusters is a presentation, DEI is an equity axis).
 *    Tranche 2 = 60 CLEAN specialties. Two tranches, two shapes, a third plausible — so the
 *    taxonomy is DATA that versions, not structure that migrates.
 *
 * 2. THE CASE_ID CANNOT REPRESENT IT, and the corpus already proves this: `OPHTHAL` is 7
 *    characters and the id regex allows [A-Z]{2,6}, so six live cases carry id prefix
 *    `SPEC-OPHTH-…` while their metadata says `specialty_tags:["OPHTHAL"]`. They have
 *    disagreed since ingest and NOTHING BROKE — because nothing reads the id.
 *    `eval-case-gate.mjs` has always read `case_metadata.difficulty_tier` (line ~150),
 *    never the id. This file makes that de-facto rule explicit and machine-checkable:
 *
 *      THE CASE_ID IS AN OPAQUE PARTITION KEY assigned at ingest. `case_metadata` is
 *      AUTHORITATIVE. Where they disagree, the id is JUST A NAME.
 *
 *    (`id_prefixes` below records the mapping for the two that diverge. It exists so a
 *    reader who greps `SPEC-OPHTH` lands somewhere that explains why — not so anyone may
 *    start deriving meaning from an id again.)
 *
 * 3. Ids are not opened (operator decision 2026-07-16). Rewriting them would rewrite every
 *    node file, break every sha256, and leave 303 CLINICIAN ATTESTATIONS no longer covering
 *    the bytes they signed. That is a trust-chain operation, not a volume one — the cost
 *    does not shrink at 14,000 cases, it grows.
 *
 * The checksum is computed with the repo's OWN checksumRecords (imported from
 * scripts/pharm-author.mjs, never re-implemented — the FL-34 export precedent: a second
 * implementation is a second answer).
 *
 * Run: node scripts/build-case-taxonomy.mjs [--check]
 *   --check  recompute and DIFF against the committed file; exit 1 on drift. Never writes.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checksumRecords } from "./pharm-author.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data/taxonomy/case-taxonomy.json");

const TAXONOMY_VERSION = "1.0.0";

/**
 * SPECIALTY — tranche 2's 60, with the 20 pre-existing codes preserved EXACTLY as they are.
 * `legacy: true` marks a code already in the 00_case_envelope enum; changing one would
 * invalidate attested cases, so they are load-bearing, not editorial.
 * `id_prefixes` is present ONLY where the id segment cannot equal the code (length limit).
 */
const SPECIALTY = [
  { code: "GP", display: "General Practice" },
  { code: "FAMMED", display: "Family Medicine" },
  { code: "ADOL", display: "Adolescent Medicine" },
  { code: "PAEDS", display: "Paediatrics", legacy: true },
  { code: "NEONAT", display: "Neonatology" },
  { code: "GERI", display: "Geriatrics" },
  { code: "INTMED", display: "Internal Medicine" },
  { code: "CARD", display: "Cardiology", legacy: true },
  { code: "EPHYS", display: "Electrophysiology" },
  { code: "HFTX", display: "Heart Failure & Transplant Cardiology" },
  { code: "INTCAR", display: "Interventional Cardiology" },
  { code: "RESP", display: "Respiratory & Pulmonology", legacy: true },
  { code: "GI", display: "Gastroenterology", legacy: true },
  { code: "HEPAT", display: "Hepatology & Transplant Medicine" },
  { code: "RENAL", display: "Nephrology", legacy: true },
  { code: "ENDO", display: "Endocrinology & Metabolism", legacy: true },
  { code: "HAEMAT", display: "Haematology", legacy: true },
  { code: "ONCO", display: "Oncology", legacy: true },
  { code: "ID", display: "Infectious Disease", legacy: true },
  { code: "RHEUM", display: "Rheumatology & Immunology", legacy: true },
  { code: "NEURO", display: "Neurology", legacy: true },
  { code: "NEURDV", display: "Neurodevelopmental & Rehabilitation" },
  { code: "SLEEP", display: "Sleep Medicine" },
  { code: "MH", display: "Psychiatry & Mental Health", legacy: true },
  { code: "ADDICT", display: "Addiction Medicine" },
  { code: "DERM", display: "Dermatology", legacy: true },
  // OPHTHAL is 7 chars; the id regex allows [A-Z]{2,6}. The id slot CANNOT hold the code —
  // which is why six live cases read SPEC-OPHTH-… while their metadata reads OPHTHAL.
  // The code is authoritative; the prefix is recorded, not honoured.
  { code: "OPHTHAL", display: "Ophthalmology", legacy: true, id_prefixes: ["OPHTH"] },
  { code: "ENT", display: "Otolaryngology (ENT)" },
  { code: "OBS", display: "Obstetrics & Gynaecology", legacy: true },
  { code: "REPRO", display: "Reproductive Medicine & Infertility" },
  { code: "MFM", display: "Maternal-Foetal Medicine" },
  { code: "URO", display: "Urology", legacy: true },
  { code: "SURG", display: "General Surgery", legacy: true },
  { code: "COLREC", display: "Colorectal Surgery" },
  { code: "VASC", display: "Vascular Surgery", legacy: true },
  { code: "THORAC", display: "Thoracic Surgery" },
  { code: "CTSURG", display: "Cardiac Surgery" },
  { code: "NSURG", display: "Neurosurgery" },
  { code: "ORTHO", display: "Orthopaedic Surgery" },
  { code: "SPINE", display: "Spinal Surgery" },
  { code: "PLAST", display: "Plastic & Reconstructive Surgery" },
  { code: "OMFS", display: "Oral & Maxillofacial Surgery" },
  { code: "PSURG", display: "Paediatric Surgery" },
  { code: "ANAES", display: "Anaesthetics" },
  { code: "ICU", display: "Critical Care & Intensive Care Medicine" },
  { code: "EMG", display: "Emergency Medicine", legacy: true },
  { code: "PAIN", display: "Pain Medicine" },
  { code: "PALL", display: "Palliative & End-of-Life Care" },
  { code: "REHAB", display: "Physical Medicine & Rehabilitation" },
  { code: "SPORTS", display: "Sports Medicine" },
  { code: "OCCMED", display: "Occupational & Preventive Medicine" },
  { code: "RAD", display: "Radiology & Diagnostic Imaging" },
  { code: "INTRAD", display: "Interventional Radiology" },
  { code: "NUCMED", display: "Nuclear Medicine" },
  { code: "RADONC", display: "Radiation Oncology" },
  { code: "PATH", display: "Pathology" },
  { code: "GENET", display: "Medical Genetics & Genomics" },
  { code: "SEXHTH", display: "Sexual Health" },
  { code: "SOCENV", display: "Social & Environmental Medicine" },
  { code: "INTEG", display: "Integrative & Functional Medicine" },

  // ── LEGACY-ONLY: in the live 00_case_envelope enum, carried by attested cases, with NO
  //    tranche-2 equivalent. Tranche 2 splits musculoskeletal medicine across ORTHO / SPORTS
  //    / RHEUM / PAIN / REHAB, so no single code maps. MSK stays because 29 CLINICIAN-ATTESTED
  //    cases carry it — removing it to tidy the taxonomy would fail them at validation, which
  //    is the regression bar catching a real mistake (this one was mine, found by the bar).
  //    The taxonomy is a SUPERSET: tranche 2's 60 ∪ legacy codes still in use.
  //
  //    PROVEN TO BITE 2026-07-16: deleting this line reddens contract-case-taxonomy §2 and §3,
  //    naming MSK and the attested cases that carry it. The bar is not decorative.
  { code: "MSK", display: "Musculoskeletal (legacy — tranche 2 splits this across ORTHO/SPORTS/RHEUM/PAIN/REHAB)", legacy: true, legacy_only: true },
];

/**
 * CATEGORY_TAGS — tranche 1's 30, each carrying the AXIS it classifies on. The axis field is
 * the whole point: these are NOT one taxonomy. Without it, "Cardiovascular" (an organ system)
 * and "Diversity Equity and Inclusion" (an axis of inequity) would sit in one list pretending
 * to be the same kind of thing, and coverage across either would be meaningless.
 *
 * `ingested` marks the five batches already in data/cases/ (their codes are the operator's,
 * recorded in the case-set-underpopulated batch history — they are load-bearing, not chosen here).
 */
const CATEGORY_TAGS = [
  // NOTE: AUC's expansion is INFERRED from the source corpus name ("AUC Clinical Case Files
  // SOAP Format Long Form") + its content (burns, laryngitis). Flagged for operator
  // confirmation rather than asserted — see the register item.
  { code: "AUC", display: "Acute Urgent Care", axis: "context", ingested: true, expansion_unconfirmed: true },
  { code: "AMS", display: "Autoimmune Mild Severity", axis: "presentation", ingested: true },
  { code: "CVD", display: "Cardiovascular", axis: "specialty", ingested: true },
  { code: "CIA", display: "Common Infections & Afflictions", axis: "presentation", ingested: true },
  { code: "CFE", display: "Complex Fatigue Entities", axis: "presentation", ingested: true },
  { code: "DST", display: "Dermatology & Soft Tissue", axis: "specialty", ingested: true },
  { code: "DCD", display: "Disabilities & Congenital Disorders", axis: "cohort" },
  { code: "DEI", display: "Diversity Equity and Inclusion", axis: "equity" },
  { code: "EMD", display: "Endocrine & Metabolic Disorders", axis: "specialty" },
  { code: "GEH", display: "Gastroenterology & Hepatology", axis: "specialty" },
  { code: "GPO", display: "General Practice Other", axis: "context" },
  { code: "GMH", display: "Genitourinary & Mens Health", axis: "specialty" },
  { code: "GAF", display: "Geriatric & Frailty", axis: "cohort" },
  { code: "HAO", display: "Haematology & Oncology", axis: "specialty" },
  { code: "HFV", display: "Hydration, Fluid and Volume abnormalities", axis: "presentation" },
  { code: "IBE", display: "Idiopathic or Benign entities", axis: "presentation" },
  { code: "IDSH", display: "Infectious Disease & Sexual Health", axis: "specialty" },
  { code: "IFM", display: "Integrative & Functional Medicine", axis: "context" },
  { code: "MHSU", display: "Mental Health & Substance Use", axis: "specialty" },
  { code: "MSP", display: "Musculoskeletal & Pain", axis: "specialty" },
  { code: "NND", display: "Neurological & Neurodegenerative", axis: "specialty" },
  { code: "OGW", display: "Obstetrics & Gynaecology & Womens health", axis: "specialty" },
  { code: "OPE", display: "Opthalmology & ENT", axis: "specialty" },
  { code: "PAN", display: "Paediatric & Neonatal", axis: "cohort" },
  { code: "PEL", display: "Palliative & End of Life", axis: "context" },
  { code: "RSP", display: "Respiratory System", axis: "specialty" },
  { code: "RHI", display: "Rheumatology & Immunology", axis: "specialty" },
  { code: "SEN", display: "Social & Environmental", axis: "equity" },
  { code: "USC", display: "Undifferentiated Subclinical Clusters", axis: "presentation" },
  { code: "YAA", display: "Young Adult & Adolescence", axis: "cohort" },
];

/**
 * DIFFICULTY_TIER — the EXISTING 7-value enum, mapped, not replaced. `id_digit` records the
 * historical id correspondence; it is DESCRIPTIVE. `case_metadata.difficulty_tier` is
 * authoritative, and a re-rated case does NOT get renamed.
 */
const DIFFICULTY_TIER = [
  { code: "straightforward", id_digit: "01", display: "Straightforward" },
  { code: "atypical_presentation", id_digit: "02", display: "Atypical presentation" },
  { code: "red_herring_laden", id_digit: "03", display: "Red-herring laden" },
  { code: "atypical_presentation_high_risk", id_digit: "04", display: "Atypical presentation, high risk" },
  { code: "rare_condition", id_digit: "05", display: "Rare condition" },
  { code: "multi_morbidity_complex", id_digit: "06", display: "Multi-morbidity complex" },
  { code: "communication_barrier", id_digit: "07", display: "Communication barrier" },
];

const AXES = ["specialty", "cohort", "presentation", "context", "equity"];

function build() {
  const records = { specialty: SPECIALTY, category_tags: CATEGORY_TAGS, difficulty_tier: DIFFICULTY_TIER };
  return {
    taxonomy_version: TAXONOMY_VERSION,
    id_rule:
      "The case_id is an OPAQUE PARTITION KEY assigned at ingest. case_metadata is AUTHORITATIVE. " +
      "Where they disagree, the id is just a name — do not derive specialty or difficulty from it. " +
      "Live proof: six SPEC-OPHTH-* cases carry specialty_tags:['OPHTHAL'] because the code (7 chars) " +
      "does not fit the id regex ([A-Z]{2,6}); they have disagreed since ingest and nothing broke, " +
      "because nothing reads the id.",
    distribution_rule:
      "The 60/30/10 difficulty mix and the coverage matrix are GUIDES, not gates (operator ruling " +
      "2026-07-16). eval-case-gate.mjs warns; it must never block on them. Do not re-derive a strict " +
      "reading from planning artifacts — that reading is what turned a guide into a defect class.",
    axes: AXES,
    ...records,
    records_checksum: checksumRecords([records]),
  };
}

const doc = build();
const json = JSON.stringify(doc, null, 2) + "\n";

if (process.argv.includes("--check")) {
  if (!existsSync(OUT)) {
    console.error("case-taxonomy --check: committed file missing — run without --check to build it");
    process.exit(1);
  }
  const on_disk = readFileSync(OUT, "utf8");
  if (on_disk !== json) {
    console.error("case-taxonomy --check: DRIFT — the committed taxonomy does not match this builder.\n  The builder is the source; regenerate with: node scripts/build-case-taxonomy.mjs");
    process.exit(1);
  }
  console.log(`case-taxonomy --check: OK (v${doc.taxonomy_version}, checksum ${doc.records_checksum.slice(0, 12)}…)`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, json);
console.log(`case-taxonomy v${doc.taxonomy_version} → ${OUT.replace(ROOT + "/", "")}`);
console.log(`  specialty:      ${SPECIALTY.length} (${SPECIALTY.filter((s) => s.legacy).length} pre-existing, preserved exactly)`);
console.log(`  category_tags:  ${CATEGORY_TAGS.length} across ${AXES.length} axes (${CATEGORY_TAGS.filter((c) => c.ingested).length} already ingested)`);
console.log(`  difficulty:     ${DIFFICULTY_TIER.length} (the existing enum, mapped not replaced)`);
console.log(`  checksum:       ${doc.records_checksum}`);
