/**
 * contract-case-warrant — the warrant/tier machinery + the additive-change regression bar
 * (Case Corpus v2, Phase 2b).
 *
 * §4 IS THE LOAD-BEARING BAR: all 303 attested cases must validate against the EDITED node-12 and
 * node-13 schemas UNCHANGED. The whole change is worthless — worse, dangerous — if it invalidates a
 * clinician-attested seal. Proven additive: 606 node files, 0 failures.
 *
 * Also pinned:
 *   §1 the warrant annotations are well-formed and self-consistent (no field both derived and scoreable);
 *   §2 the interactions_to_check SPLIT — old field deprecated + retained, two successors with the right
 *      warrants (flagged=clinician/scoreable, present_reference=derived/never-scored);
 *   §3 node 13 is a documented Tier-3 local extension (FHIR has no safety-netting resource) with a rationale;
 *   §5 derived fields are EXCLUDED from the scoring rubric's must_include — the circularity bar, at schema level.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import { extractWarrantMap, derivedFieldNames, scoreableFieldNames, assertWarrantConsistency } from "../verification/case-warrant.js";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) return console.log(`  ok: ${name}`);
  failures++;
  console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
};

const s12 = JSON.parse(readFileSync("data/schemas/12_management_plan_node.schema.json", "utf8"));
const s13 = JSON.parse(readFileSync("data/schemas/13_safety_netting_node.schema.json", "utf8"));

// ── §1 annotations well-formed + self-consistent ──────────────────────────────
{
  let consistent = true;
  let info = "";
  try {
    const r = assertWarrantConsistency(s12);
    info = `${r.total} annotated · ${r.derived.length} derived · ${r.scoreable.length} scoreable`;
  } catch (e) {
    consistent = false;
    info = String(e.message);
  }
  check("§1 node 12 warrant annotations are self-consistent", consistent, info);
  console.log(`     (${info})`);
}

// ── §2 the interactions split ─────────────────────────────────────────────────
{
  const map = extractWarrantMap(s12);
  const by = (n) => map.find((f) => f.name === n);
  const derived = derivedFieldNames(s12);
  const scoreable = scoreableFieldNames(s12);

  check("§2 interactions_to_check is deprecated (retained, so pre-v2 cases still validate)",
    by("interactions_to_check")?.deprecated === true);
  check("§2 …and it is NOT scoreable (deprecated fields are excluded)", !scoreable.has("interactions_to_check"));
  check("§2 interactions_flagged_for_this_patient exists and is clinician-warranted + scoreable",
    scoreable.has("interactions_flagged_for_this_patient"));
  check("§2 interactions_present_reference exists and is DERIVED + never-scored",
    derived.has("interactions_present_reference") && !scoreable.has("interactions_present_reference"));
}

// ── §3 node 13 is a documented Tier-3 local extension ─────────────────────────
{
  check("§3 node 13 is marked x-local-extension", s13["x-local-extension"] === true);
  check("§3 node 13 declares FHIR tier 3", s13["x-fhir-tier"] === 3);
  check("§3 node 13 carries a written rationale naming the FHIR gap",
    typeof s13["x-extension-rationale"] === "string" && /no native safety-netting|devoid|FHIR R4 has NO/i.test(s13["x-extension-rationale"]));
}

// ── §4 THE REGRESSION BAR: 303 validate unchanged against the EDITED schemas ───
{
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
  const v12 = ajv.compile(s12);
  const v13 = ajv.compile(s13);
  const dirs = readdirSync("data/cases").filter((d) => /^SPEC-/.test(d));
  let n = 0;
  const bad = [];
  for (const d of dirs) {
    for (const [node, val] of [["12_management_plan_node", v12], ["13_safety_netting_node", v13]]) {
      const p = `data/cases/${d}/${node}.json`;
      if (!existsSync(p)) continue;
      n++;
      if (!val(JSON.parse(readFileSync(p, "utf8")))) bad.push(`${d}/${node}: ${JSON.stringify(val.errors?.[0])}`);
    }
  }
  check(`§4 REGRESSION BAR — all ${n} node files validate against the edited schemas`, bad.length === 0,
    bad.slice(0, 3).join(" | "));
  check("§4 the bar actually ran (node files found, not silently zero)", n >= 600, `found ${n}`);
}

// ── §5 the circularity bar at schema level: no derived field in must_include ──
{
  // The scoring rubric names what the AI MUST produce. A derived field appearing there would be the
  // system grading itself. This asserts the schema does not even offer that footgun by example.
  const derived = derivedFieldNames(s12);
  const rubricText = JSON.stringify(s12.properties.scoring_rubric);
  const leaked = [...derived].filter((n) => rubricText.includes(`"${n}"`));
  check("§5 no derived field name appears in the scoring_rubric schema", leaked.length === 0, leaked.join(", "));
  check("§5 there ARE derived fields to protect (the bar is not vacuous)", derived.size >= 3, `${derived.size} derived`);
}

if (failures) {
  console.error(`contract-case-warrant FAIL (${failures})`);
  process.exit(1);
}
console.log("contract-case-warrant OK (annotations consistent · interactions split · node 13 Tier-3 documented · 303 validate unchanged · derived never scores)");
