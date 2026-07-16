#!/usr/bin/env node
/**
 * case-qc — quality-control the case corpus against the clinician-signed pharmacology datastore
 * (Case Corpus v2, Phase 2e). `npm run cases:qc`.
 *
 * VALIDATE, NEVER AUTHOR (operator ruling 2026-07-16). This harness reads every node-12 medication
 * and checks it against the SAME signed datastore PharmCheck reads, then FLAGS disagreements to a
 * worksheet. It never fills a field, never edits a case, and never resolves a disagreement — a human
 * clinician rules on each. Every finding is one of three things, and the harness cannot tell which:
 *   (a) a case-authoring error, (b) a DATASTORE error/gap, or (c) a clinical nuance the datastore lacks.
 * That ambiguity is the point: the flow runs BACKWARDS into the knowledge base as a quality signal.
 *
 * STRUCTURE (shim discipline): the checks are PURE functions with no I/O — every finding is provable
 * in the contract test without touching the filesystem. Only `writeWorksheet` writes, and it writes
 * to eval/pharmacology/qc/ ONLY. There is no code path from this script to a write in data/cases/;
 * the contract test proves it.
 *
 * READ-ONLY over the corpus; exit 0 always (a REPORT, not a gate — findings are for a human, and a
 * corpus with findings is not a broken build).
 *
 * Usage: node scripts/case-qc.mjs [--cases data/cases] [--out eval/pharmacology/qc]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SyntheticSelfDevelopedSource } from "../mcp/servers/pharmacology/sources/pharm-data-source.js";
import { derivedFieldNames } from "../verification/case-warrant.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Medications whose necessity means they are ACTUALLY recommended (so an interaction between two of
// them is a real safety question). not_indicated_here / should_NOT_recommend are negative teaching
// items — they are not co-prescribed, so pairwise interaction QC does not apply.
const RECOMMENDED = new Set(["must_recommend", "recommended_first_line", "acceptable_alternative", "second_line_if_first_fails"]);

// Drug-CLASS words — a case that names a class ("consider a benzodiazepine") rather than an agent.
// Legitimate clinical shorthand, but not resolvable to a datastore ingredient. Kept small + explicit;
// this is a heuristic for CLASSIFYING a finding, never for resolving one.
const CLASS_WORDS = /\b(antibiotics?|benzodiazepines?|opioids?|corticosteroids?|steroids?|antihistamines?|nsaids?|beta.?blockers?|antifungals?|antivirals?|laxatives?|antiemetics?|analgesi(a|cs?)|antidepressants?|statins?|diuretics?|emollients?)\b/i;

/**
 * Normalise a drug_name toward the ingredient the schema asks for ("generic drug name using AMH
 * preferred names"). Strips the parenthetical, formulation/route words, and strength tokens, then
 * takes the leading ingredient token. This is NORMALISATION (recovering what the schema wanted), not
 * authoring — it never chooses a different drug, only reads the one already named more forgivingly.
 */
export function normaliseDrugName(name) {
  let n = String(name || "").toLowerCase();
  n = n.replace(/\([^)]*\)/g, " "); // drop parentheticals: "(potent topical corticosteroid)"
  n = n.replace(/\b\d+(\.\d+)?\s*(%|mg|mcg|g|ml|units?|spf\s*\d+\+?)(?![a-z])/gi, " "); // strengths ("1%", "500mg", "SPF 50+")
  n = n.replace(/\b(cream|ointment|gel|spray|wafer|tablet|capsule|drops?|lotion|patch|inhaler|suppository|solution|topical|oral|intramuscular|intravenous|iv|im|po|nasal|eye|ear|autoinjector)\b/gi, " ");
  n = n.replace(/\bor\b.*$/i, " ").replace(/,.*$/, " "); // "ibuprofen or any NSAID" → "ibuprofen"
  return n.replace(/\s+/g, " ").trim();
}

/**
 * QC one medication entry against the datastore. PURE — no I/O. Returns an array of findings.
 * @param {object} med - a node-12 medications[] entry
 * @param {object} source - a PharmDataSource (the signed datastore)
 */
export function qcMedication(med, source) {
  const findings = [];
  const named = String(med.drug_name || "").trim();
  if (!named) return findings;
  let { canonical } = source.canonicalise(named);
  const from = source.canonicalise(named).from;

  // Resolve forgivingly: exact first, then normalised (strip formulation/parenthetical/strength).
  if (!source.knownDrug(canonical)) {
    const norm = normaliseDrugName(named);
    const normCanon = source.canonicalise(norm).canonical;
    if (norm && source.knownDrug(normCanon)) {
      // Resolves once normalised → the DRUG is fine; the drug_name field carries formulation/prose the
      // schema does not want. Advisory (Low): the ingredient belongs in drug_name, formulation in
      // dose_route_frequency. Protocol v2 tightens this going forward.
      findings.push({
        check: "drug_name_not_normalised", drug: named, canonical: normCanon,
        detail: `"${named}" only resolves after stripping formulation/prose to "${normCanon}". drug_name should be the AMH ingredient; put formulation in dose_route_frequency.`,
        warrant_touched: "clinician (drug_name)", severity: "advisory",
      });
      canonical = normCanon; // run the downstream checks on the recovered ingredient
    } else {
      // Genuinely unresolved. Classify so a clinician sees the KIND of gap, not one undifferentiated pile.
      const isClass = CLASS_WORDS.test(named) && !/\b\w+ol\b|cillin|azole|statin|pril|sartan/i.test(norm || named);
      findings.push({
        check: isClass ? "class_not_specific" : "unresolved_drug",
        drug: named, canonical: null,
        detail: isClass
          ? `"${named}" names a drug CLASS, not an agent — legitimate shorthand, but the answer key cannot be scored on a specific drug. Consider naming an exemplar.`
          : `"${named}" (normalised "${norm}") is absent from the signed datastore. Case-authoring error, a non-drug in drug_name, or a real datastore gap — a clinician rules.`,
        warrant_touched: "clinician (drug_name)",
      });
      return findings; // downstream checks need a known drug
    }
  }

  // F2 — the case's authored schedule disagrees with the datastore's. schedule is x-warrant:derived,
  // so this is a high-value backward signal: which of the two is right is a clinician/datastore call.
  if (med.schedule) {
    const dsSchedule = source.getSchedule(canonical);
    if (dsSchedule !== "unknown" && String(dsSchedule).toUpperCase() !== String(med.schedule).toUpperCase()) {
      findings.push({
        check: "schedule_mismatch",
        drug: named,
        detail: `case says schedule ${med.schedule}; datastore says ${dsSchedule}${from ? ` (via alias ${from})` : ""}.`,
        warrant_touched: "derived (schedule)",
      });
    }
  }
  return findings;
}

/**
 * QC one case's node-12: per-medication checks + pairwise interaction check across recommended meds.
 * PURE. `node12` is the parsed management-plan node.
 */
export function qcCase(node12, source) {
  const findings = [];
  const meds = Array.isArray(node12.medications) ? node12.medications : [];
  for (const med of meds) for (const f of qcMedication(med, source)) findings.push({ case_id: node12.case_id, ...f });

  // F3 — a datastore interaction between two RECOMMENDED meds that the case did not flag. Candidate:
  // could be a genuine omission, or a clinical nuance the clinician judged not relevant here.
  const recommended = meds.filter((m) => RECOMMENDED.has(m.necessity));
  if (recommended.length >= 2) {
    // Everything the case DID flag (both the v2 successor and the deprecated field), lowercased.
    const flaggedText = [
      ...(recommended.flatMap((m) => m.interactions_flagged_for_this_patient || [])),
      ...(recommended.flatMap((m) => m.interactions_to_check || [])),
    ].join(" | ").toLowerCase();
    const canon = recommended.map((m) => ({ named: m.drug_name, c: source.canonicalise(String(m.drug_name || "")).canonical }));
    for (let i = 0; i < canon.length; i++) {
      for (const ix of source.getInteractions(canon[i].c)) {
        const other = canon.find((x, j) => j !== i && (x.c === ix.a || x.c === ix.b));
        if (!other) continue;
        // Only flag the more serious tiers, and only if neither drug name appears in what was flagged.
        const serious = /major|contraindicated|severe|high/i.test(String(ix.severity || ""));
        const mentioned = flaggedText.includes(canon[i].c) || flaggedText.includes(other.c);
        if (serious && !mentioned) {
          findings.push({
            case_id: node12.case_id,
            check: "interaction_unflagged",
            drug: canon[i].named,
            detail: `datastore: ${ix.severity} interaction ${canon[i].c} ↔ ${other.c} (${ix.note || "mechanism recorded"}); not in interactions_flagged_for_this_patient. Candidate — may be a real omission OR a nuance judged not relevant here.`,
            warrant_touched: "clinician (interactions_flagged_for_this_patient)",
          });
        }
      }
    }
  }
  return findings;
}

/** Read the corpus and run QC. Returns { findings, cases_scanned, meds_scanned }. Read-only. */
export function runQc(source, casesDir = join(ROOT, "data/cases")) {
  const dirs = readdirSync(casesDir).filter((d) => /^SPEC-/.test(d));
  const findings = [];
  let meds = 0;
  for (const d of dirs) {
    const p = join(casesDir, d, "12_management_plan_node.json");
    if (!existsSync(p)) continue;
    const node12 = JSON.parse(readFileSync(p, "utf8"));
    meds += Array.isArray(node12.medications) ? node12.medications.length : 0;
    for (const f of qcCase(node12, source)) findings.push(f);
  }
  return { findings, cases_scanned: dirs.length, meds_scanned: meds };
}

/** The ONLY writer. Writes to eval/pharmacology/qc/ — never data/cases/. */
function writeWorksheet(result, outDir) {
  mkdirSync(outDir, { recursive: true });
  const byCheck = result.findings.reduce((m, f) => ((m[f.check] = (m[f.check] || 0) + 1), m), {});
  const json = { generated_by: "scripts/case-qc.mjs", ...result, summary_by_check: byCheck, derived_fields: [...derivedFieldNames(JSON.parse(readFileSync(join(ROOT, "data/schemas/12_management_plan_node.schema.json"), "utf8")))] };
  writeFileSync(join(outDir, "case-qc-findings.json"), JSON.stringify(json, null, 2) + "\n");

  const lines = [
    "# Case QC worksheet — corpus vs the signed pharmacology datastore",
    "",
    "**VALIDATE, NEVER AUTHOR.** Every row is a DISAGREEMENT, not a verdict. Each is one of: a case-authoring error, a datastore error/gap, or a clinical nuance the datastore lacks. A clinician rules; nothing here edits a case.",
    "",
    "**Read the counts in DEV context.** The datastore is deliberately partial (DEV/synthetic — ~261 scheduling records, ~872 interactions), so `unresolved_drug` is expected to be coverage-heavy: many are real drugs simply not yet in the DEV datastore, plus non-drugs sitting in `drug_name` (\"oral fluids\", \"no medication indicated\"). The signal is the SHAPE, not the total: `drug_name_not_normalised` → protocol v2 tightens drug_name to the ingredient; `class_not_specific` → a modelling question; `schedule_mismatch` → a derived-field disagreement to reconcile; `unresolved_drug` → datastore coverage + non-drug usage.",
    "",
    `- cases scanned: **${result.cases_scanned}**`,
    `- medication entries scanned: **${result.meds_scanned}**`,
    `- findings: **${result.findings.length}** (${Object.entries(byCheck).map(([k, v]) => `${k}: ${v}`).join(" · ") || "none"})`,
    "",
    "| case_id | check | drug | detail | warrant | ruling |",
    "|---|---|---|---|---|---|",
    ...result.findings.map((f) => `| ${f.case_id} | ${f.check} | ${f.drug} | ${f.detail.replace(/\|/g, "\\|")} | ${f.warrant_touched} | _(pending)_ |`),
  ];
  writeFileSync(join(outDir, "case-qc-worksheet.md"), lines.join("\n") + "\n");
}

function main() {
  const args = process.argv.slice(2);
  const casesDir = args.includes("--cases") ? args[args.indexOf("--cases") + 1] : join(ROOT, "data/cases");
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(ROOT, "eval/pharmacology/qc");
  // The signed datastore, self-developed source (mock-moded — same knowledge PharmCheck reads).
  const source = new SyntheticSelfDevelopedSource({ selfDeveloped: true });
  const result = runQc(source, casesDir);
  writeWorksheet(result, outDir);
  const byCheck = result.findings.reduce((m, f) => ((m[f.check] = (m[f.check] || 0) + 1), m), {});
  console.log(`case-qc: ${result.cases_scanned} cases · ${result.meds_scanned} medication entries · ${result.findings.length} findings`);
  for (const [k, v] of Object.entries(byCheck)) console.log(`  ${k}: ${v}`);
  console.log(`  worksheet → ${outDir.replace(ROOT + "/", "")}/case-qc-worksheet.md (FLAGS only — a clinician rules)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
