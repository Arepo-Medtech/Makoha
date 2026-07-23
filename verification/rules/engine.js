/**
 * Rule engine (A2.2) — executes the compiled CQL rule libraries (library/*.elm.json) in
 * PURE NODE via cql-execution, feeds each its packet-derived parameters, and returns a
 * validated, deterministic RuleVerdict per rule.
 *
 * This is a NEW deterministic clinical source, so it lives behind the same discipline as
 * the rest of the pipeline: it reads ONLY the sealed ContextPacket (never scoring nodes
 * 10–13), it NEVER emits a dose, and its verdict is folded into verification additively +
 * monotone by compose.js — it can add a review flag or a caveat, never rescue or downgrade.
 *
 * The ELM is produced at build time (scripts/cql-compile.mjs, JVM translator in a Docker
 * container) and checksum-gated in CI (cql:verify). Here we only EXECUTE it — zero JVM.
 */
import cql from "cql-execution";
import cqlfhir from "cql-exec-fhir";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAgeYears } from "./packet-to-fhir.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_DIR = join(__dirname, "library");

/**
 * RuleVerdict contract (mirrors mcp/schemas/rule-verdict.schema.json). `.strict()` so the
 * engine can never emit a malformed verdict — the same posture as the pharmacology
 * PharmCheck validator.
 */
export const RuleVerdictSchema = z
  .object({
    rule_id: z.string().min(1),
    version: z.string().min(1),
    // proceed = no action; review = route to in-person review (a caution, NOT a failure);
    // blocked_incomplete = a required input was missing to decide.
    outcome: z.enum(["proceed", "review", "blocked_incomplete"]),
    flags: z.array(z.string()).default([]),
    caveats: z.array(z.string()).default([]),
    evidence: z
      .object({ library: z.string(), parameters: z.record(z.unknown()) })
      .strict()
      .optional(),
  })
  .strict();

export function validateRuleVerdict(v) {
  return RuleVerdictSchema.parse(v);
}

const _cache = new Map();
/** Load + cache a compiled ELM library. Returns { lib, version, identifier }. */
export function loadElm(name, dir = LIB_DIR) {
  const key = join(dir, name);
  if (_cache.has(key)) return _cache.get(key);
  const elm = JSON.parse(readFileSync(join(dir, `${name}.elm.json`), "utf8"));
  const identifier = elm?.library?.identifier || {};
  const entry = { lib: new cql.Library(elm), version: identifier.version || "0.0.0", identifier: identifier.id || name };
  _cache.set(key, entry);
  return entry;
}

/** A bare single-patient source so an Unfiltered library can execute. Carries NO PHI. */
function patientSourceFrom(bundle) {
  const ps = cqlfhir.PatientSource.FHIRv401();
  ps.loadBundles([bundle || { resourceType: "Bundle", type: "collection", entry: [{ resource: { resourceType: "Patient", id: "rule-eval" } }] }]);
  return ps;
}

/**
 * Execute one compiled library with parameters; return its Unfiltered expression results.
 * exec() is async in cql-execution v3 (it awaits the patient source), hence the await.
 * @returns {Promise<Record<string, any>>} expression-name → value
 */
export async function evaluateElm(libName, parameters = {}, { dir = LIB_DIR, bundle } = {}) {
  const { lib } = loadElm(libName, dir);
  const exec = new cql.Executor(lib, null, parameters);
  const res = await exec.exec(patientSourceFrom(bundle));
  return res.unfilteredResults || {};
}

/**
 * The rule registry. Each rule: which compiled library to run, how to derive its
 * parameters from the packet, and how to read its expression results into a verdict.
 * Versions are read from the ELM (loadElm) so a verdict can never claim a version the
 * compiled artifact does not carry.
 */
export const RULES = [
  {
    id: "paediatric-review",
    library: "paediatric-review",
    params: (packet) => ({ PatientAgeYears: extractAgeYears(packet) }),
    verdict: (results, params, version) => {
      const review = results.InPersonReviewFlag === true;
      const caveat = results.GillickCompetenceCaveat === true;
      return {
        rule_id: "paediatric-review",
        version,
        outcome: review ? "review" : "proceed",
        flags: review ? ["in_person_review_required"] : [],
        caveats: caveat ? ["plausible_gillick_competence_expected"] : [],
        evidence: { library: "PaediatricReview", parameters: params },
      };
    },
  },
];

/**
 * Evaluate every rule against a packet; return validated verdicts. Deterministic and
 * side-effect free — safe to call more than once with the same packet for the same result.
 * @returns {Promise<Array<import('zod').infer<typeof RuleVerdictSchema>>>}
 */
export async function evaluateRules(packet, { rules = RULES, dir = LIB_DIR } = {}) {
  const out = [];
  for (const rule of rules) {
    const { version } = loadElm(rule.library, dir);
    const params = rule.params(packet);
    const results = await evaluateElm(rule.library, params, { dir });
    out.push(validateRuleVerdict(rule.verdict(results, params, version)));
  }
  return out;
}
