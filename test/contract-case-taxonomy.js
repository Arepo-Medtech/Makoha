/**
 * contract-case-taxonomy — the versioned classification vocabulary (Case Corpus v2, Phase 1).
 *
 * THE LOAD-BEARING BAR IS §3: all clinician-attested cases must validate against the
 * taxonomy UNCHANGED. A failure there means the mapping is wrong, not the case. It already
 * earned its keep: the first build dropped MSK (29 attested cases, no tranche-2 equivalent)
 * and this bar is what would have caught it.
 *
 * Also pinned:
 *   §1 the dataset is schema-valid and its checksum is honest (drift ABORTS — a broken seal
 *      means the version no longer covers the bytes);
 *   §2 every legacy code survives — removing one to tidy the taxonomy invalidates attested cases;
 *   §4 the ID DEMOTION RULE, proven against live data: SPEC-OPHTH-* cases carry
 *      specialty_tags:["OPHTHAL"] and the taxonomy must explain that rather than "fix" it;
 *   §5 axes are declared, so mixed-axis categories cannot silently collapse into one list;
 *   §6 the builder is the source — a hand-edited taxonomy is a defect, caught by --check.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import { checksumRecords } from "../scripts/pharm-author.mjs";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) return console.log(`  ok: ${name}`);
  failures++;
  console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
};

const tax = JSON.parse(readFileSync("data/taxonomy/case-taxonomy.json", "utf8"));
const schema = JSON.parse(readFileSync("data/taxonomy/case-taxonomy.schema.json", "utf8"));
const envelopeSchema = JSON.parse(readFileSync("data/schemas/00_case_envelope.schema.json", "utf8"));

// ── §1 schema validity + checksum honesty ─────────────────────────────────────
{
  const ajv = new Ajv({ strict: false, allErrors: true });
  const valid = ajv.validate(schema, tax);
  check("§1 taxonomy validates against its schema", valid, JSON.stringify(ajv.errors?.slice(0, 2)));

  const recomputed = checksumRecords([
    { specialty: tax.specialty, category_tags: tax.category_tags, difficulty_tier: tax.difficulty_tier },
  ]);
  check("§1 records_checksum matches the records (no drift)", recomputed === tax.records_checksum,
    `stored ${tax.records_checksum.slice(0, 12)}… recomputed ${recomputed.slice(0, 12)}…`);
}

// ── §2 every legacy code survives ─────────────────────────────────────────────
const liveEnum = envelopeSchema.properties.case_metadata.properties.specialty_tags.items.enum;
const taxCodes = new Set(tax.specialty.map((s) => s.code));
{
  const missing = liveEnum.filter((c) => !taxCodes.has(c));
  check("§2 every code in the live envelope enum exists in the taxonomy", missing.length === 0,
    `missing: ${missing.join(", ")}`);
  const legacyMarked = new Set(tax.specialty.filter((s) => s.legacy).map((s) => s.code));
  const unmarked = liveEnum.filter((c) => !legacyMarked.has(c));
  check("§2 every pre-existing code is MARKED legacy (so nobody 'tidies' it away)", unmarked.length === 0,
    `unmarked: ${unmarked.join(", ")}`);
}

// ── §3 THE REGRESSION BAR: all attested cases validate unchanged ──────────────
{
  const dirs = readdirSync("data/cases").filter((d) => /^SPEC-/.test(d));
  const offenders = [];
  let cases = 0;
  let tagsSeen = 0;
  for (const d of dirs) {
    let env;
    try {
      env = JSON.parse(readFileSync(`data/cases/${d}/00_case_envelope.json`, "utf8"));
    } catch {
      continue;
    }
    cases++;
    const meta = env.case_metadata || {};
    for (const t of meta.specialty_tags || []) {
      tagsSeen++;
      if (!taxCodes.has(t)) offenders.push(`${env.case_id}: specialty_tag "${t}" not in taxonomy`);
    }
    const tier = meta.difficulty_tier;
    if (tier && !tax.difficulty_tier.some((x) => x.code === tier)) {
      offenders.push(`${env.case_id}: difficulty_tier "${tier}" not in taxonomy`);
    }
  }
  check(`§3 REGRESSION BAR — all ${cases} attested cases validate against the taxonomy (${tagsSeen} tags)`,
    offenders.length === 0, offenders.slice(0, 4).join(" | "));
  check("§3 the bar actually ran (cases were found, not silently zero)", cases >= 300, `found ${cases}`);
}

// ── §4 the ID demotion rule, proven against live data ─────────────────────────
{
  check("§4 the taxonomy carries the id_rule as DATA (travels with the dataset, not just prose)",
    typeof tax.id_rule === "string" && /opaque|authoritative/i.test(tax.id_rule));

  const ophthal = tax.specialty.find((s) => s.code === "OPHTHAL");
  check("§4 OPHTHAL's code is 7 chars — LONGER than the id regex allows ([A-Z]{2,6})",
    ophthal && ophthal.code.length === 7);
  check("§4 …and the taxonomy records the divergent id prefix rather than 'fixing' it",
    ophthal && Array.isArray(ophthal.id_prefixes) && ophthal.id_prefixes.includes("OPHTH"));

  // The live corpus proves the rule: these cases have disagreed with their own ids since
  // ingest, and nothing broke — because nothing reads the id.
  const dirs = readdirSync("data/cases").filter((d) => /^SPEC-OPHTH-/.test(d));
  let diverged = 0;
  for (const d of dirs) {
    const env = JSON.parse(readFileSync(`data/cases/${d}/00_case_envelope.json`, "utf8"));
    const prefix = env.case_id.split("-")[1];
    const primary = (env.case_metadata.specialty_tags || [])[0];
    if (primary && primary !== prefix) diverged++;
  }
  check("§4 live cases DO diverge (id prefix != metadata code) and are still valid — the rule is empirical, not aspirational",
    diverged > 0, `diverged: ${diverged}`);
}

// ── §5 axes are declared and honoured ─────────────────────────────────────────
{
  const axes = new Set(tax.axes);
  const bad = tax.category_tags.filter((c) => !axes.has(c.axis));
  check("§5 every category_tag declares a known axis", bad.length === 0, bad.map((b) => b.code).join(", "));
  const used = new Set(tax.category_tags.map((c) => c.axis));
  check("§5 the corpus categories genuinely span multiple axes (not one taxonomy wearing a hat)",
    used.size >= 4, `axes used: ${[...used].join(", ")}`);
  const ingested = tax.category_tags.filter((c) => c.ingested).map((c) => c.code).sort();
  check("§5 the five ingested batches are marked (their codes are the operator's, not ours)",
    ["AMS", "AUC", "CFE", "CIA", "CVD", "DST"].every((c) => ingested.includes(c)), ingested.join(","));
}

// ── §6 the builder is the source of truth ─────────────────────────────────────
{
  let ok = true;
  let out = "";
  try {
    out = execFileSync("node", ["scripts/build-case-taxonomy.mjs", "--check"], { encoding: "utf8" });
  } catch (e) {
    ok = false;
    out = String(e.stdout || e.message);
  }
  check("§6 the committed taxonomy matches its builder (a hand-edit is a defect)", ok, out.trim().slice(0, 160));
}

if (failures) {
  console.error(`contract-case-taxonomy FAIL (${failures})`);
  process.exit(1);
}
console.log(
  `contract-case-taxonomy OK (${tax.specialty.length} specialties · ${tax.category_tags.length} categories across ${tax.axes.length} axes · ${tax.difficulty_tier.length} tiers · all attested cases validate unchanged · the id stays a name)`
);
