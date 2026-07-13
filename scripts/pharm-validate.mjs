#!/usr/bin/env node
/**
 * pharm-validate — FL-30 Step 5 staging validation harness.
 *
 * Runs the pharmacology validation case set through the (now datastore-driven) firewall and
 * checks four things the clinical-safety case requires:
 *   1. Correctness — each representative case matches its clinically-expected PharmCheck
 *      outcome (status + required flags + dose-gate).
 *   2. Fail-safe — every adversarial case blocks/escalates to a human (HARD_FAIL or
 *      BLOCKED_NO_PROOF) and carries NO dose guidance. Never a silent pass.
 *   3. A/B parity — the datastore source and a mock-only source both produce CONTRACT-VALID
 *      PharmChecks (validated against the frozen pharm-check schema). Verdicts may differ by
 *      coverage; the contract shape must not.
 *   4. Gate integrity — dose guidance appears ONLY on PASS/WARN; the human-review gate is
 *      never bypassed (a dose never rides a HARD_FAIL/BLOCKED result).
 *
 * Pure runValidation() is exported for the contract test; the CLI also writes a signable
 * report (eval/pharmacology/validation-report.{json,md}).
 * Run from repo root: node scripts/pharm-validate.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import { runPharmCheck } from "../mcp/servers/pharmacology/engine.js";
import { SyntheticSelfDevelopedSource, LicensedFeedSource } from "../mcp/servers/pharmacology/sources/pharm-data-source.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const schemaDir = join(repoRoot, "mcp", "schemas");
const casesPath = join(repoRoot, "eval", "pharmacology", "validation-cases.json");

const ajv = new Ajv({ allErrors: true, strict: false, logger: false });
ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, "receipt.schema.json"), "utf8")));
const validateSchema = ajv.compile(JSON.parse(readFileSync(join(schemaDir, "pharm-check.schema.json"), "utf8")));

/** Build a full, frozen-contract PharmIntent from a case's shorthand. */
export function buildIntent(c) {
  const s = `enc-val-${c.id}`;
  return {
    intent_id: `pharm-val-${c.id}`,
    session_ref: s,
    intent_type: "new_prescription",
    drug_intent: { drug_name: c.intent.drug_name, drug_class: c.intent.drug_class, ...(c.intent.schedule ? { schedule: c.intent.schedule } : {}), ...(c.intent.is_nti_candidate ? { is_nti_candidate: true } : {}) },
    patient_facts_ref: { packet_session_ref: s },
    ...(typeof c.age === "number" ? { clinical_context: { patient_age_years: c.age } } : { clinical_context: {} }),
    mode: "mock",
  };
}

const flagTypes = (pc) => pc.flags.map((f) => f.flag_type);
const hasDose = (pc) => !!pc.dose_guidance;

/** Validate one case; returns a structured result (never throws). */
function runCase(c, datastoreSrc, mockSrc) {
  const intent = buildIntent(c);
  const ds = runPharmCheck(intent, c.resolved || {}, { source: datastoreSrc });
  const mk = runPharmCheck(intent, c.resolved || {}, { source: mockSrc });
  const problems = [];

  // A/B parity — both must be contract-valid against the frozen schema.
  if (!validateSchema(ds)) problems.push(`datastore output not contract-valid: ${(validateSchema.errors || []).map((e) => e.instancePath + " " + e.message).join("; ")}`);
  if (!validateSchema(mk)) problems.push(`mock output not contract-valid: ${(validateSchema.errors || []).map((e) => e.instancePath + " " + e.message).join("; ")}`);

  // Gate integrity — a dose may ride ONLY a PASS/WARN.
  if (hasDose(ds) && !(ds.status === "PASS" || ds.status === "WARN")) problems.push(`gate breach: dose_guidance present on status ${ds.status}`);

  if (c.adversarial) {
    // Fail-safe: must block/escalate + carry no dose.
    if (!(ds.status === "HARD_FAIL" || ds.status === "BLOCKED_NO_PROOF")) problems.push(`adversarial case did not fail safe (status ${ds.status})`);
    if (hasDose(ds)) problems.push("adversarial case carried dose_guidance");
  } else {
    // Correctness vs clinically-expected outcome.
    if (ds.status !== c.expect.status) problems.push(`expected status ${c.expect.status}, got ${ds.status}`);
  }
  for (const ft of c.expect.flags_include || []) {
    if (!flagTypes(ds).includes(ft)) problems.push(`expected flag '${ft}' not present (flags: ${flagTypes(ds).join(",") || "none"})`);
  }
  if (c.expect.no_dose && hasDose(ds)) problems.push("expected no dose_guidance but one was present");

  return {
    id: c.id, category: c.category, adversarial: !!c.adversarial, description: c.description,
    expected_status: c.expect.status, datastore_status: ds.status, mock_status: mk.status,
    flags: flagTypes(ds), pass: problems.length === 0, problems,
  };
}

/** Run the whole set. Returns { results, summary }. Pure — no I/O. */
export function runValidation(cases) {
  const datastoreSrc = new SyntheticSelfDevelopedSource();
  const mockSrc = new SyntheticSelfDevelopedSource({ forceMock: true });
  const results = cases.map((c) => runCase(c, datastoreSrc, mockSrc));

  const licensed = new LicensedFeedSource();
  const licensedUnavailable = licensed.available().available === false;

  const byCat = {};
  for (const r of results) byCat[r.category] = (byCat[r.category] || 0) + 1;

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    adversarial_total: results.filter((r) => r.adversarial).length,
    adversarial_fail_safe: results.filter((r) => r.adversarial && r.pass).length,
    ab_parity_all_contract_valid: results.every((r) => !r.problems.some((p) => /not contract-valid/.test(p))),
    gate_integrity_no_bypass: results.every((r) => !r.problems.some((p) => /gate breach|carried dose/.test(p))),
    licensed_stub_unavailable: licensedUnavailable,
    datastore_backed: datastoreSrc.datastoreBacked,
    receipt_mode: datastoreSrc.receiptMode(),
    coverage_by_category: byCat,
  };
  return { results, summary };
}

// ---- CLI: write the signable report ----
function toMarkdown(results, summary, casesVersion) {
  const line = (r) => `| ${r.id} | ${r.category} | ${r.expected_status || (r.adversarial ? "fail-safe" : "")} | ${r.datastore_status} | ${r.mock_status} | ${r.pass ? "✅" : "❌ " + r.problems.join("; ")} |`;
  return [
    `# FL-30 Step 5 — Pharmacology Staging Validation Report`,
    ``,
    `- Case set: \`eval/pharmacology/validation-cases.json\` (${casesVersion}) — ${summary.total} cases`,
    `- Result: **${summary.passed}/${summary.total} passed**, ${summary.failed} failed`,
    `- Adversarial fail-safe: **${summary.adversarial_fail_safe}/${summary.adversarial_total}**`,
    `- A/B parity (all contract-valid): **${summary.ab_parity_all_contract_valid}**`,
    `- Gate integrity (no human-review-gate bypass): **${summary.gate_integrity_no_bypass}**`,
    `- Licensed-feed stub unavailable (fail-closed): **${summary.licensed_stub_unavailable}**`,
    `- Source: datastore_backed=${summary.datastore_backed}, receipt mode=${summary.receipt_mode} (dev/unvalidated — never 'live' until this report is signed)`,
    `- Coverage by category: ${JSON.stringify(summary.coverage_by_category)}`,
    ``,
    `| Case | Category | Expected | Datastore | Mock (A/B) | Result |`,
    `|---|---|---|---|---|---|`,
    ...results.map(line),
    ``,
    `## Clinical sign-off`,
    ``,
    `- [ ] Reviewed by registered pharmacist (KL): the outcomes above are clinically correct and every adversarial scenario fails safe to human escalation.`,
    `- [ ] Confirmed no human-review gate is bypassed (dose guidance only on PASS/WARN).`,
    `- Note: patient-facing use remains BLOCKED pending regulatory (TGA) sign-off, live PBS pull, live CDS vendor (B4), and the Clinician Verification Portal.`,
    ``,
    `_Signed: ______________________  Date: ___________`,
    ``,
  ].join("\n");
}

function main() {
  const { cases, version } = JSON.parse(readFileSync(casesPath, "utf8"));
  const { results, summary } = runValidation(cases);
  const jsonPath = join(repoRoot, "eval", "pharmacology", "validation-report.json");
  const mdPath = join(repoRoot, "eval", "pharmacology", "validation-report.md");
  writeFileSync(jsonPath, JSON.stringify({ case_set_version: version, summary, results }, null, 2) + "\n");
  writeFileSync(mdPath, toMarkdown(results, summary, version));
  console.log(`pharm-validate: ${summary.passed}/${summary.total} passed, ${summary.failed} failed; adversarial fail-safe ${summary.adversarial_fail_safe}/${summary.adversarial_total}`);
  console.log(`  wrote validation-report.json + validation-report.md`);
  if (summary.failed > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
