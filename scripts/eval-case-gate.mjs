#!/usr/bin/env node
/**
 * eval:cases — the deterministic case-set evaluation gate (ARCH_PLAN M6;
 * <test_and_evaluation_gates>: the synthetic-case evaluation is a RELEASE
 * GATE, not a report; wired as a BLOCKING CI job now that ≥45 cases exist).
 *
 * WHAT BLOCKS (exit 1):
 *   1. fewer than 45 clinician-attested, conforming cases;
 *   2. a case whose on-disk node files do not sha256-match its manifest —
 *      integrity is the transitive re-assertion of every ingest-time check
 *      (schema validity of all 7 nodes AND the field-scoped firewall leak
 *      scan) without this gate ever parsing a sealed node;
 *   3. an AI-readable node (00/01/02) that fails its JSON schema;
 *   4. a candidate code left `unverified_pending_terminology_receipt`
 *      (receipt discipline: no receipt, no claim — see cases:verify-codes);
 *   5. a case without clinician attestation counting toward the minimum —
 *      `llm_generated_unreviewed` cases are reported but NEVER counted.
 *
 * WHAT WARNS (reported, non-blocking until the M6 difficulty top-up lands):
 *   - difficulty distribution vs the 60/30/10 design
 *     (straightforward 01 / atypical 02–04 / complex 05–07);
 *   - coverage matrix vs the evaluation-guide minimum
 *     (3 difficulty tiers × 3 diagnosis categories × 5 specialty groups).
 *
 * WHAT THIS GATE IS NOT: the clinical evaluation itself (AI-Doctor runs scored
 * against the sealed answer keys) requires live Step-4 generation and the
 * scoring harness — that stays downstream. This gate guarantees the EVAL SET
 * is complete, intact, attested, and receipted, so a clinical run can trust it.
 *
 * SCORING-STORE FIREWALL: sealed nodes (10–13) are only ever STREAMED through
 * sha256 for integrity (exactly as cases:ingest does) — never parsed, never
 * printed, never placed in any context. Readable parsing is limited to
 * 00/01/02 + case_manifest.
 *
 * No named exemptions: every case dir now carries a case_manifest.json. The
 * former pre-ingest reference case SPEC-CARD-04-00001 was manifest-retrofitted
 * (FL-03, scripts/retrofit-reference-manifest.mjs) and is now a normal
 * manifested-but-unattested case (excluded from the attested count via the
 * clinician_reviewed check, not via a special case). A missing manifest is now
 * a hard failure, as it should be.
 *
 * Usage: node scripts/eval-case-gate.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CASES_DIR = join(REPO_ROOT, "data/cases");
const MIN_ATTESTED_CASES = 45;
const PENDING = "unverified_pending_terminology_receipt";
const READABLE = ["00_case_envelope.json", "01_presentation_layer.json", "02_conversational_policy.json"];
const SEALED = ["10_ground_truth_node.json", "11_symptom_links_node.json", "12_management_plan_node.json", "13_safety_netting_node.json"];

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validators = {};
for (const f of READABLE) {
  const schemaFile = f.replace(".json", ".schema.json");
  validators[f] = ajv.compile(JSON.parse(readFileSync(join(REPO_ROOT, "data/schemas", schemaFile), "utf8")));
}

const sha256 = (path) => "" + createHash("sha256").update(readFileSync(path)).digest("hex");

// Difficulty bands for the 60/30/10 design, from the envelope schema's tier→code map.
const BAND_OF = {
  straightforward: "straightforward",
  atypical_presentation: "atypical",
  red_herring_laden: "atypical",
  atypical_presentation_high_risk: "atypical",
  rare_condition: "complex",
  multi_morbidity_complex: "complex",
  communication_barrier: "complex",
};

const failures = [], warnings = [], exemptions = [];
let attested = 0, unreviewed = 0;
const tiers = new Map(), bands = { straightforward: 0, atypical: 0, complex: 0 };
const categories = new Set(), specialties = new Set();

const caseDirs = readdirSync(CASES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

for (const caseId of caseDirs) {
  const dir = join(CASES_DIR, caseId);

  const manifestPath = join(dir, "case_manifest.json");
  if (!existsSync(manifestPath)) {
    failures.push(`${caseId}: case_manifest.json missing`);
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  let caseOk = true;

  // 2. Integrity: every manifest-listed node file hashes exactly (sealed files
  // are streamed through sha256 only — never parsed).
  for (const f of manifest.files || []) {
    const p = join(dir, f.path);
    if (!existsSync(p)) {
      failures.push(`${caseId}: ${f.path} missing`);
      caseOk = false;
      continue;
    }
    if (sha256(p) !== f.sha256) {
      failures.push(`${caseId}: ${f.path} sha256 mismatch — file changed since ingest (ingest-time schema + firewall verdicts no longer attach)`);
      caseOk = false;
    }
  }
  const listed = new Set((manifest.files || []).map((f) => f.path));
  for (const f of [...READABLE, ...SEALED]) {
    if (!listed.has(f)) {
      failures.push(`${caseId}: manifest does not list ${f}`);
      caseOk = false;
    }
  }

  // 3. Readable nodes validate against their schemas (00/01/02 only).
  for (const f of READABLE) {
    const p = join(dir, f);
    if (!existsSync(p)) continue; // already failed above
    if (!validators[f](JSON.parse(readFileSync(p, "utf8")))) {
      const e = validators[f].errors[0];
      failures.push(`${caseId}: [${f}] schema: ${e.instancePath || "(root)"} ${e.message}`);
      caseOk = false;
    }
  }

  // 4. Receipt discipline: no candidate code may remain unreceipted.
  for (const c of manifest.codes_manifest || []) {
    if (c.verification_status === PENDING) {
      failures.push(`${caseId}: ${c.code_system} ${c.code} still ${PENDING} — run cases:verify-codes`);
      caseOk = false;
    }
  }

  // 5. Attestation: only clinician-attested cases count toward the minimum.
  const review = manifest.review || {};
  const isAttested = review.clinician_reviewed === true;
  if (!isAttested) {
    unreviewed++;
    warnings.push(`${caseId}: not clinician-attested (${review.review_status || "unknown"}) — excluded from the attested count`);
  }

  // Distribution/coverage from the readable envelope.
  const envPath = join(dir, "00_case_envelope.json");
  if (existsSync(envPath)) {
    const env = JSON.parse(readFileSync(envPath, "utf8"));
    const meta = env.case_metadata || {};
    const tier = meta.difficulty_tier;
    if (tier) {
      tiers.set(tier, (tiers.get(tier) || 0) + 1);
      if (BAND_OF[tier]) bands[BAND_OF[tier]]++;
    }
    if (meta.diagnosis_category) categories.add(meta.diagnosis_category);
    for (const s of meta.specialty_tags || []) specialties.add(s);
  }

  if (caseOk && isAttested) attested++;
}

// 1. The blocking minimum.
if (attested < MIN_ATTESTED_CASES) {
  failures.push(`attested conforming cases: ${attested} < required ${MIN_ATTESTED_CASES}`);
}

// Distribution vs 60/30/10 (warn-only until the M6 top-up lands).
const scored = bands.straightforward + bands.atypical + bands.complex;
const pct = (n) => (scored ? Math.round((n / scored) * 100) : 0);
const distLine = `straightforward ${bands.straightforward} (${pct(bands.straightforward)}%) / atypical ${bands.atypical} (${pct(bands.atypical)}%) / complex ${bands.complex} (${pct(bands.complex)}%) vs 60/30/10 design`;
if (pct(bands.atypical) < 30 || pct(bands.complex) < 10) {
  warnings.push(`difficulty distribution skew: ${distLine} — author atypical/complex cases (M6 top-up)`);
}
if (tiers.size < 3) warnings.push(`coverage: only ${tiers.size} difficulty tiers present (evaluation-guide minimum: 3)`);
if (categories.size < 3) warnings.push(`coverage: only ${categories.size} diagnosis categories present (minimum: 3)`);
if (specialties.size < 5) warnings.push(`coverage: only ${specialties.size} specialty groups present (minimum: 5)`);

console.log("eval:cases — deterministic case-set gate");
console.log(`  case directories:    ${caseDirs.length}`);
console.log(`  attested conforming: ${attested} (required ≥ ${MIN_ATTESTED_CASES})`);
console.log(`  unreviewed:          ${unreviewed}`);
console.log(`  named exemptions:    ${exemptions.length}`);
for (const x of exemptions) console.log(`  [exempt] ${x}`);
console.log(`  distribution:        ${distLine}`);
console.log(`  coverage:            ${tiers.size} tiers · ${categories.size} diagnosis categories · ${specialties.size} specialties`);
console.log(`  warnings:            ${warnings.length}`);
for (const w of warnings) console.warn(`  [warn] ${w}`);
console.log(`  failures:            ${failures.length}`);
for (const f of failures) console.error(`  [FAIL] ${f}`);
console.log(failures.length ? "eval:cases: FAIL (blocking)" : "eval:cases: PASS");
process.exit(failures.length ? 1 : 0);
