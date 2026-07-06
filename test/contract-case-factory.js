/**
 * Contract tests for the H4 case factory (case-factory/*) — FLOW_PLAN H4.
 * <test_and_evaluation_gates> requires deterministic safety code to be tested; the
 * shaper is the single new integration surface and carries the scoring-store firewall.
 *
 * Asserts, against the committed synthetic fixture (no live Java, no real patient):
 *   - the generated FHIR passes AU Core conformance (vendored SDs; C22 flagged);
 *   - shaper (Phase A) + completion (Phase B) produce a bundle that passes the REAL
 *     `cases:ingest --dry-run` — 0 problems, 0 leaks;
 *   - synthetic:true and clinician_reviewed:false are asserted (augmented-not-autonomous;
 *     generated cases move the RAW distribution only, never the trusted set);
 *   - the honesty gate holds — every code unverified, every file sha256 null, and the
 *     manifest uses files[].path (the live tool's key, not the contract's stale `node`);
 *   - the firewall is FAIL-CLOSED — a narrative that leaks the full diagnosis name into
 *     patient voice makes the shaper THROW, never emit a leaky seed;
 *   - the generator writes NOTHING to data/cases/ and its source never reads a sealed
 *     node (10..13) — placeholder scoring nodes are authored from the seed only.
 *
 * Run from repo root: node test/contract-case-factory.js
 */
import { readFileSync, readdirSync } from "node:fs";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { toCaseSeed } from "../case-factory/to-casebundle.js";
import { completeBundle } from "../case-factory/complete-scoring-nodes.js";
import { validateAuCoreBundle } from "../case-factory/synthea-au/run-synthea-au.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

const fx = (n) => JSON.parse(readFileSync(join(ROOT, "case-factory/fixtures", n), "utf8"));
const fhir = fx("complex-chf.fhir.json");
const narrative = fx("complex-chf.narrative.json");
const profile = fx("complex-chf.profile.json");

// 1. AU Core conformance of the generated FHIR (structural, vendored SDs).
const au = validateAuCoreBundle(fhir);
check("AU-Core: generated FHIR conforms (no non-conformant resource)", au.ok);
check("AU-Core: at least one resource validated conformant", au.results.some((r) => r.status === "conformant"));
check("AU-Core: C22 divergence surfaced (target 0.3.0 vs vendored)", au.target.c22_open === true && au.target.pinned === "0.3.0");

// 2. Shaper -> completion produce a well-formed bundle.
const { caseseed } = toCaseSeed({ fhir, narrative, profile });
const bundle = completeBundle(caseseed);
const NODE_KEYS = ["00_case_envelope", "01_presentation_layer", "02_conversational_policy",
  "10_ground_truth_node", "11_symptom_links_node", "12_management_plan_node", "13_safety_netting_node"];
check("bundle: _bundle.format is breath-ezy-casebundle", bundle._bundle.format === "breath-ezy-casebundle");
check("bundle: id is a complex-tier SPEC id (DD=06)", /^SPEC-[A-Z]{2,6}-06-[0-9]{5}$/.test(bundle._bundle.case_id));
check("bundle: every node + manifest case_id equals _bundle.case_id",
  [...NODE_KEYS, "case_manifest"].every((k) => bundle[k].case_id === bundle._bundle.case_id));

// 3. Synthetic-only + not-attested invariants.
check("synthetic:true asserted in manifest", bundle.case_manifest.synthetic === true);
check("clinician_reviewed:false (00 provenance)", bundle["00_case_envelope"].case_metadata.provenance.clinician_reviewed === false);
check("review not attested in manifest", bundle.case_manifest.review.clinician_reviewed === false);
check("source_type is deliberately_constructed_edge_case (Synthea = synthetic construct)",
  bundle["00_case_envelope"].case_metadata.provenance.source_type === "deliberately_constructed_edge_case");

// 4. Honesty gate + the corrected §6 drift (files[].path, not node).
check("manifest: files use `path` key (live tool key, corrected §6 drift)",
  bundle.case_manifest.files.every((f) => "path" in f && !("node" in f)));
check("manifest: every file sha256 is null (ingest owns hashing)",
  bundle.case_manifest.files.every((f) => f.sha256 === null));
check("manifest: every code unverified_pending_terminology_receipt",
  bundle.case_manifest.codes_manifest.every((c) => c.verification_status === "unverified_pending_terminology_receipt"));
check("10.primary_diagnosis.name is the seed (drives firewall, sealed answer)",
  bundle["10_ground_truth_node"].primary_diagnosis.name === profile.primary_diagnosis_name);

// 5. End-to-end through the REAL cases:ingest --dry-run: 0 problems, 0 leaks.
// Ingest into an ISOLATED --out dir (never the live data/cases), so the assertion is
// about the bundle's own validity/firewall, not whether the provisional id happens to
// collide with an already-admitted case.
const dir = mkdtempSync(join(tmpdir(), "h4-cf-"));
const outDir = mkdtempSync(join(tmpdir(), "h4-cf-out-"));
writeFileSync(join(dir, bundle._bundle.case_id + ".casebundle.json"), JSON.stringify(bundle, null, 2) + "\n");
const run = spawnSync("node", [join(ROOT, "scripts/ingest-case-bundles.mjs"), dir, "--out", outDir, "--dry-run"], { encoding: "utf8" });
check("ingest --dry-run exits 0", run.status === 0);
check("ingest --dry-run reports OK_DRY_RUN", /OK_DRY_RUN: 1/.test(run.stdout || ""));
check("ingest --dry-run reports no FIREWALL leak", !/FIREWALL/.test(run.stdout || ""));
check("ingest --dry-run reports no REFUSED/COLLISION problem", !/\[(REFUSED|FIREWALL_LEAK|INVALID_JSON)\]/.test(run.stdout || ""));

// 6. Firewall is FAIL-CLOSED — a diagnosis-name leak in patient voice throws in the shaper.
let leakThrew = false;
try {
  const poisoned = JSON.parse(JSON.stringify(narrative));
  poisoned.opening_complaint_text = "I think I have " + profile.primary_diagnosis_name + " and need help.";
  toCaseSeed({ fhir, narrative: poisoned, profile });
} catch (e) { leakThrew = /FIREWALL/.test(e.message); }
check("firewall fail-closed: diagnosis name in patient voice throws in the shaper", leakThrew);

// 7. Generator writes NOTHING to data/cases/ and never reads a sealed node.
const before = readdirSync(join(ROOT, "data/cases")).length;
toCaseSeed({ fhir, narrative, profile });
completeBundle(caseseed);
const after = readdirSync(join(ROOT, "data/cases")).length;
check("shaper/completion write nothing to data/cases/ directly", before === after);
const srcShaper = readFileSync(join(ROOT, "case-factory/to-casebundle.js"), "utf8");
const srcComplete = readFileSync(join(ROOT, "case-factory/complete-scoring-nodes.js"), "utf8");
const readsSealed = (s) => /readFileSync\([^)]*data\/cases[^)]*1[0-3]_/.test(s) || /data\/cases\/[^"'`) ]*1[0-3]_/.test(s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""));
check("shaper source never reads a sealed node (10..13)", !readsSealed(srcShaper));
check("completion source never reads a sealed node (10..13)", !readsSealed(srcComplete));

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-case-factory: OK");
