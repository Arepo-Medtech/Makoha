// Contract test for scripts/ingest-case-bundles.mjs
// Builds a casebundle from the reference case, ingests it to a temp dir, and asserts the
// split + real SHA-256 hashing round-trips; then checks the firewall and case_id gates refuse.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts/ingest-case-bundles.mjs");
const REF = join(ROOT, "data/cases/SPEC-CARD-04-00001");
const NODES = ["00_case_envelope", "01_presentation_layer", "02_conversational_policy",
  "10_ground_truth_node", "11_symptom_links_node", "12_management_plan_node", "13_safety_netting_node"];
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function buildBundle() {
  const cid = "SPEC-CARD-04-00001";
  const bundle = {
    _bundle: {
      format: "breath-ezy-casebundle", bundle_version: "1.0.0",
      protocol_version: "case-transform-protocol:test", case_id: cid,
      split_map: Object.fromEntries([...NODES, "case_manifest"].map((k) => [k, `${k}.json`])),
      firewall_assertion: { ai_doctor_readable: NODES.slice(0, 3), scoring_store_sealed: NODES.slice(3) },
    },
  };
  for (const k of NODES) bundle[k] = JSON.parse(readFileSync(join(REF, `${k}.json`)));
  bundle.case_manifest = {
    case_id: cid, case_set_version: "test", schema_version: "1.0.0",
    source: { filename: "ref.txt", sha256: null },
    review: { clinician_reviewed: false, review_status: "pending_clinician_review", source_type: "llm_generated_unreviewed" },
    files: NODES.map((k) => ({ path: `${k}.json`, sha256: null })),
    codes_manifest: [{ code_system: "SNOMED_CT", code: "57054005", display: "AMI",
      used_in: ["10_ground_truth_node.json:primary_diagnosis"], verification_status: "unverified_pending_terminology_receipt" }],
  };
  return bundle;
}

function run(inDir, outDir) {
  try {
    const out = execFileSync("node", [SCRIPT, inDir, "--out", outDir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) { return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") }; }
}

const work = mkdtempSync(join(tmpdir(), "ingest-test-"));
try {
  // --- positive: clean bundle ingests + hashes round-trip ---
  const inDir = join(work, "in"); mkdirSync(inDir, { recursive: true });
  const outDir = join(work, "out");
  writeFileSync(join(inDir, "ref.casebundle.json"), JSON.stringify(buildBundle(), null, 2));
  const r = run(inDir, outDir);
  assert.strictEqual(r.code, 0, "clean bundle should ingest (exit 0)\n" + r.out);
  const caseDir = join(outDir, "SPEC-CARD-04-00001");
  for (const k of [...NODES, "case_manifest"]) assert.ok(existsSync(join(caseDir, `${k}.json`)), `${k}.json written`);
  const manifest = JSON.parse(readFileSync(join(caseDir, "case_manifest.json")));
  assert.ok(manifest.files.every((f) => typeof f.sha256 === "string" && f.sha256.length === 64), "manifest file hashes filled");
  // real hash matches the split file bytes
  const f0 = manifest.files.find((f) => f.path === "00_case_envelope.json");
  assert.strictEqual(f0.sha256, sha256(readFileSync(join(caseDir, "00_case_envelope.json"))), "sha256 matches split file bytes");
  assert.ok(manifest.ingest && manifest.ingest.bundle_sha256, "ingest provenance recorded");
  assert.strictEqual(manifest.review.clinician_reviewed, false, "review status preserved, not flipped");
  console.log("  [pass] clean bundle ingests; 8 files; real SHA-256 round-trips; review preserved");

  // --- negative: firewall leak (diagnosis name in an injectable field) ---
  const leakDir = join(work, "leak_in"), leakOut = join(work, "leak_out"); mkdirSync(leakDir, { recursive: true });
  const bad = buildBundle();
  const diag = bad["10_ground_truth_node"].primary_diagnosis.name;
  bad["01_presentation_layer"].opening_complaint.verbatim_patient_text = `I think I have ${diag}`;
  writeFileSync(join(leakDir, "bad.casebundle.json"), JSON.stringify(bad, null, 2));
  const lr = run(leakDir, leakOut);
  assert.strictEqual(lr.code, 1, "firewall leak should be refused (exit 1)");
  assert.ok(/FIREWALL/.test(lr.out), "reports FIREWALL leak");
  assert.ok(!existsSync(join(leakOut, "SPEC-CARD-04-00001")), "leaking case not written");
  console.log("  [pass] diagnosis-name leak into 01 is refused, not written");

  // --- negative: case_id mismatch across nodes ---
  const mmDir = join(work, "mm_in"), mmOut = join(work, "mm_out"); mkdirSync(mmDir, { recursive: true });
  const mm = buildBundle();
  mm["11_symptom_links_node"].case_id = "SPEC-CARD-04-09999";
  writeFileSync(join(mmDir, "mm.casebundle.json"), JSON.stringify(mm, null, 2));
  const mr = run(mmDir, mmOut);
  assert.strictEqual(mr.code, 1, "case_id mismatch should be refused (exit 1)");
  assert.ok(/!= _bundle/.test(mr.out), "reports case_id inconsistency");
  console.log("  [pass] case_id mismatch across nodes is refused");

  console.log("contract-case-ingest: OK");
} finally {
  rmSync(work, { recursive: true, force: true });
}
