/**
 * Contract test for the A2 CQL rule layer (verification/rules/*).
 *
 * Executes the REAL compiled ELM (library/paediatric-review.elm.json) via cql-execution —
 * no mocks — and asserts the deterministic behaviour of the pilot rule, the verdict
 * contract (zod .strict() + the JSON schema), packet age extraction, determinism, and that
 * composeRules is additive + monotone (never flips pass, no-op when empty).
 *
 * Run from repo root: node test/contract-cql-rules.js
 */
import Ajv from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { evaluateRules, validateRuleVerdict, RuleVerdictSchema } from "../verification/rules/engine.js";
import { extractAgeYears } from "../verification/rules/packet-to-fhir.js";
import { composeRules } from "../verification/rules/compose.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

/** A minimal packet carrying a demographic Age fact (value stored as the patient stated it). */
const packet = (age) => ({ facts: age == null ? [] : [{ fact_id: "fact-age", category: "demographic", label: "Age", value: String(age) }] });
const paed = (verdicts) => verdicts.find((v) => v.rule_id === "paediatric-review");

async function main() {
  // ── Age extraction ────────────────────────────────────────────────────────────────
  check("extractAgeYears: '16' → 16", extractAgeYears(packet(16)) === 16);
  check("extractAgeYears: '16 years' → 16", extractAgeYears({ facts: [{ fact_id: "f", category: "demographic", label: "Age (years)", value: "16 years" }] }) === 16);
  check("extractAgeYears: no age fact → null", extractAgeYears(packet(null)) === null);
  check("extractAgeYears: ignores non-demographic", extractAgeYears({ facts: [{ fact_id: "f", category: "symptom", label: "Age of onset", value: "16" }] }) === null);

  // ── The pilot rule executed over REAL ELM ─────────────────────────────────────────
  // < 16 → in-person review, no caveat.
  const v15 = paed(await evaluateRules(packet(15)));
  check("15yo → outcome review", v15.outcome === "review");
  check("15yo → in_person_review_required flag", v15.flags.includes("in_person_review_required"));
  check("15yo → no Gillick caveat", v15.caveats.length === 0);

  // 16–18 → proceeds, WITH the non-blocking Gillick caveat, NOT flagged for review.
  for (const age of [16, 17]) {
    const v = paed(await evaluateRules(packet(age)));
    check(`${age}yo → outcome proceed`, v.outcome === "proceed");
    check(`${age}yo → no review flag`, v.flags.length === 0);
    check(`${age}yo → plausible_gillick_competence_expected caveat`, v.caveats.includes("plausible_gillick_competence_expected"));
  }

  // Adult → proceed, no flags, no caveat.
  const v45 = paed(await evaluateRules(packet(45)));
  check("45yo → proceed, clean", v45.outcome === "proceed" && v45.flags.length === 0 && v45.caveats.length === 0);

  // Unknown age → fail-safe review (cannot confirm ≥16).
  const vUnknown = paed(await evaluateRules(packet(null)));
  check("unknown age → fail-safe review", vUnknown.outcome === "review" && vUnknown.flags.includes("in_person_review_required"));

  // Version is read FROM the ELM (not hardcoded in the verdict).
  check("verdict carries the ELM version", /^\d+\.\d+\.\d+$/.test(v45.version));
  check("verdict records evidence (library + parameters)", v45.evidence?.library === "PaediatricReview" && "PatientAgeYears" in v45.evidence.parameters);

  // ── Determinism ────────────────────────────────────────────────────────────────────
  const a = paed(await evaluateRules(packet(16)));
  const b = paed(await evaluateRules(packet(16)));
  check("deterministic: same packet → identical verdict", JSON.stringify(a) === JSON.stringify(b));

  // ── Verdict contract: zod .strict() ─────────────────────────────────────────────────
  let rejectedExtra = false;
  try { RuleVerdictSchema.parse({ ...v45, sneaky: true }); } catch { rejectedExtra = true; }
  check("zod: rejects an unknown field (.strict)", rejectedExtra);
  let rejectedEnum = false;
  try { RuleVerdictSchema.parse({ rule_id: "x", version: "1", outcome: "definitely" }); } catch { rejectedEnum = true; }
  check("zod: rejects an out-of-enum outcome", rejectedEnum);
  check("validateRuleVerdict returns the parsed verdict", validateRuleVerdict(v45).rule_id === "paediatric-review");

  // ── JSON schema conformance (ajv 2020) ──────────────────────────────────────────────
  const schema = JSON.parse(readFileSync(new URL("../mcp/schemas/rule-verdict.schema.json", import.meta.url)));
  const ajv = new Ajv({ allErrors: true, strict: false, logger: false });
  const validate = ajv.compile(schema);
  check("ajv: a produced verdict conforms to rule-verdict.schema.json", validate(v15) === true);
  check("ajv: a bad outcome is rejected by the JSON schema", validate({ rule_id: "x", version: "1", outcome: "definitely" }) === false);

  // ── composeRules: additive + monotone ────────────────────────────────────────────────
  const baseFail = { pass: false, results: [{ id: "x", passed: false }], candidate_output_hash: "sha256:deadbeef" };
  check("composeRules: empty verdicts → byte-identical no-op (same ref)", composeRules(baseFail, []) === baseFail);

  const reviewFold = composeRules(baseFail, [v15]);
  check("composeRules: pass UNCHANGED under a review verdict (monotone)", reviewFold.pass === false);
  check("composeRules: candidate_output_hash untouched", reviewFold.candidate_output_hash === baseFail.candidate_output_hash);
  check("composeRules: surfaces requires_in_person_review", reviewFold.requires_in_person_review === true);
  check("composeRules: attaches rules to the audit channel", Array.isArray(reviewFold.rules) && reviewFold.rules[0].rule_id === "paediatric-review");
  check("composeRules: rule_flags surfaced", (reviewFold.rule_flags || []).includes("in_person_review_required"));

  const basePass = { pass: true, results: [], candidate_output_hash: "sha256:abc" };
  const caveatFold = composeRules(basePass, [v45.outcome === "proceed" ? paed(await evaluateRules(packet(17))) : v45]);
  check("composeRules: a proceed+caveat verdict does NOT set requires_in_person_review", caveatFold.requires_in_person_review === undefined);
  check("composeRules: caveat surfaced, pass still true", caveatFold.pass === true && (caveatFold.rule_caveats || []).includes("plausible_gillick_competence_expected"));

  // ── Pipeline wiring (A2.3): opt-in ruleset threads evaluateRules→composeRules into the result ──
  const withRules = await runPipeline({ trunk: "3.0", ruleset: true });
  check("pipeline: ruleset:true → rule_verdicts present", Array.isArray(withRules.rule_verdicts) && withRules.rule_verdicts.some((v) => v.rule_id === "paediatric-review"));
  check("pipeline: unknown age → verification.requires_in_person_review", withRules.verification.requires_in_person_review === true);
  check("pipeline: verification.rules attached (audit channel)", Array.isArray(withRules.verification.rules));

  const noRules = await runPipeline({ trunk: "3.0" });
  check("pipeline: no ruleset → rule_verdicts null (no-op)", noRules.rule_verdicts === null);
  check("pipeline: no ruleset → verification carries no rules keys", noRules.verification.rules === undefined && noRules.verification.requires_in_person_review === undefined);
  check("pipeline: no ruleset → pass unchanged by rule layer", typeof noRules.verification.pass === "boolean");

  // Fail-closed: a rule-layer error (bad library dir) → review annotation, NOT a crash, NOT a silent pass.
  const badRules = await runPipeline({ trunk: "3.0", ruleset: { dir: "/no/such/rules/dir" } });
  check("pipeline: rule-layer error → fail-closed review (no crash)", badRules.rule_verdicts?.[0]?.flags?.includes("rule_layer_error") && badRules.verification.requires_in_person_review === true);

  if (errors.length) { console.error("Contract failures:", errors); process.exit(1); }
  console.log("A2 cql-rules: OK");
  process.exit(0);
}

main().catch((e) => { console.error("A2 cql-rules ERROR:", e); process.exit(1); });
