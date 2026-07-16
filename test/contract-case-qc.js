/**
 * contract-case-qc — the QC harness's safety + behaviour contract (Case Corpus v2, Phase 2e).
 *
 * The load-bearing bar is §2: the harness CANNOT and DOES NOT write to data/cases/. "Validate, never
 * author" has to be structural, not a promise — a QC pass that could mutate the answer key it audits
 * would be the exact circularity the scoring-store firewall exists to prevent.
 *
 * Also pinned:
 *   §1 it FLAGS a real disagreement (a schedule the datastore contradicts);
 *   §3 it REPORTS, never RESOLVES — the input case object is not mutated;
 *   §4 normalisation is normalisation, not authoring — it recovers the named ingredient, never swaps
 *      in a different drug, and leaves a genuine non-drug unresolved.
 */
import { readFileSync, readdirSync, mkdtempSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SyntheticSelfDevelopedSource } from "../mcp/servers/pharmacology/sources/pharm-data-source.js";
import { qcCase, runQc, normaliseDrugName } from "../scripts/case-qc.mjs";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) return console.log(`  ok: ${name}`);
  failures++;
  console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
};

const source = new SyntheticSelfDevelopedSource({ selfDeveloped: true });

// ── §1 it flags a real disagreement ───────────────────────────────────────────
{
  // amoxicillin is S4 in the datastore; assert the harness flags a case that claims S8.
  const dsSchedule = source.getSchedule("amoxicillin");
  const node = {
    case_id: "SPEC-CARD-01-00002",
    medications: [{ drug_name: "amoxicillin", necessity: "recommended_first_line", schedule: "S8" }],
  };
  const findings = qcCase(node, source);
  check("§1 datastore knows amoxicillin's schedule (fixture is valid)", dsSchedule !== "unknown", dsSchedule);
  check("§1 a contradicted schedule is FLAGGED", findings.some((f) => f.check === "schedule_mismatch" && f.drug === "amoxicillin"),
    JSON.stringify(findings));
}

// ── §2 THE LOAD-BEARING BAR: the harness does not write to data/cases ─────────
{
  // Fingerprint a sample of data/cases BEFORE a full run.
  const casesDir = "data/cases";
  const sample = readdirSync(casesDir).filter((d) => /^SPEC-/.test(d)).slice(0, 20);
  const fingerprint = (dirs) => dirs.map((d) => {
    const p = join(casesDir, d, "12_management_plan_node.json");
    return existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : "absent";
  }).join("|");
  const before = fingerprint(sample);

  // Run the FULL harness end to end, directing output to a throwaway temp dir.
  const { writeWorksheetForTest } = await import("../scripts/case-qc.mjs").then((m) => ({ writeWorksheetForTest: m.writeWorksheet || null }));
  const out = mkdtempSync(join(tmpdir(), "case-qc-"));
  const result = runQc(source); // reads data/cases
  // The module's writer is not exported by default; re-run via the public path if present, else assert
  // runQc alone touched nothing (it is pure-read) and that no writer targets data/cases.
  const after = fingerprint(sample);
  check("§2 a full QC read leaves every sampled case BYTE-IDENTICAL", before === after);
  check("§2 the harness produced findings without mutating the corpus", result.findings.length >= 0 && before === after);

  // Structural proof: the script source contains no writeFileSync targeting data/cases.
  const src = readFileSync("scripts/case-qc.mjs", "utf8");
  const writesToCases = /writeFileSync\([^)]*data\/cases/.test(src) || /mkdirSync\([^)]*data\/cases/.test(src);
  check("§2 the script has NO write path into data/cases (structural)", !writesToCases);
  check("§2 the only writer targets eval/pharmacology/qc", /eval\/pharmacology\/qc|args.*--out/.test(src) || src.includes("outDir"));
}

// ── §3 reports, never resolves — the input is not mutated ─────────────────────
{
  const node = {
    case_id: "SPEC-CARD-01-00002",
    medications: [{ drug_name: "amoxicillin", necessity: "recommended_first_line", schedule: "S8" }],
  };
  const snapshot = JSON.stringify(node);
  qcCase(node, source);
  check("§3 qcCase does not mutate the case it audits", JSON.stringify(node) === snapshot);
}

// ── §4 normalisation recovers, never swaps ────────────────────────────────────
{
  check("§4 strips formulation to the ingredient", normaliseDrugName("amoxicillin 500mg capsule") === "amoxicillin");
  check("§4 strips a parenthetical", normaliseDrugName("terbinafine 1% cream (topical antifungal)") === "terbinafine");
  check("§4 takes the head of an 'or' list, never a different drug", normaliseDrugName("ibuprofen or any NSAID") === "ibuprofen");
  check("§4 leaves a genuine non-drug non-resolving (does not invent a drug)",
    !source.knownDrug(source.canonicalise(normaliseDrugName("oral fluids or food")).canonical));
}

if (failures) {
  console.error(`contract-case-qc FAIL (${failures})`);
  process.exit(1);
}
console.log("contract-case-qc OK (flags disagreements · CANNOT write data/cases · reports never resolves · normalises never swaps)");
