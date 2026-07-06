/**
 * Contract tests for the harvest licence + identity gate — FLOW_PLAN milestone H0
 * (scripts/check-licence-clearance.mjs + integration/harvest-manifest.json).
 * <test_and_evaluation_gates>: deterministic safety code must be tested.
 *
 * Proves every BLOCK class fails CLOSED, and that the honest guards hold:
 *   BLOCK 1  AGPL/GPL SPDX / header in a shippable module (G1)
 *   BLOCK 2  a DROP/DEFER repo pulled in as a dependency, or a harvested
 *            integration present at a DROP/DEFER target (G6)
 *   BLOCK 3  a licence-pending repo wrapped on a shippable path (G13)
 *   BLOCK 4  MedRAG conflation — missing row / shared URL / no cross-ref (G5)
 *   schema   ADOPT row without a url; shippable row without a target
 *   regression — an override-existing target dir (our own mock) present WITHOUT
 *            its live-backend marker must NOT trip BLOCK 3 (the fhir-broker case)
 * Finally: the REAL committed manifest passes against the REAL tree (0 blocks).
 *
 * Fixtures use throwaway temp repo roots; the real .heydoc-data / data/cases are
 * never touched, and no case node body (10-13) is ever read.
 * Run from repo root: node test/contract-harvest-manifest.js
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "../scripts/check-licence-clearance.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const errors = [];
const check = (label, cond) => {
  if (!cond) errors.push(label);
};
const hasBlock = (res, n) => res.failures.some((f) => f.startsWith(`BLOCK ${n}`));

// ── fixtures ──────────────────────────────────────────────────────────────────
const newRoot = () => mkdtempSync(join(tmpdir(), "harvest-gate-"));
const plant = (root, rel, content = "") => {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
};

const el = (over = {}) => ({
  ref: "x",
  repo: "acme/thing",
  url: "https://github.com/acme/thing",
  pinned_commit: "0000000000000000000000000000000000000000",
  pin_status: "pinned",
  licence: "MIT",
  licence_status: "verified",
  verdict: "REFERENCE",
  mode: "REFERENCE",
  target_module: null,
  shippable: false,
  governance_gate: null,
  adoption_step: 2,
  ...over,
});

const medragPair = () => [
  el({ ref: "20", repo: "gzxiong/MedRAG", url: "https://github.com/gzxiong/MedRAG", verdict: "ADOPT", mode: "BENCHMARK", target_module: "benchmark/mirage/", shippable: false, do_not_conflate_with: "SNOWTEAM2023/MedRAG" }),
  el({ ref: "comp", repo: "SNOWTEAM2023/MedRAG", url: "https://github.com/SNOWTEAM2023/MedRAG", do_not_conflate_with: "gzxiong/MedRAG" }),
];

const baseManifest = (elements) => ({
  _note: "fixture",
  version: "test",
  generated: "2026-07-06",
  milestone: "H0-test",
  source: "fixture",
  config: {
    shippable_paths: ["mcp/servers"],
    non_shippable_paths: ["benchmark", "test"],
    blocked_spdx: ["AGPL-3.0", "GPL-3.0"],
    blocked_licence_phrases: ["GNU AFFERO GENERAL PUBLIC LICENSE"],
    spdx_scan_exclude: [],
    spdx_scan_extensions: [".js", ".json"],
    spdx_scan_filenames: ["LICENSE"],
    override_existing_targets: { "mcp/servers/fhir-broker": "mcp/servers/fhir-broker/live-backend.js" },
  },
  elements: [...elements, ...medragPair()],
});

// 0. Baseline: a valid manifest against an empty tree passes (armed-and-green).
{
  const root = newRoot();
  const res = runCheck({ repoRoot: root, manifest: baseManifest([el({ verdict: "ADOPT", mode: "WRAP", target_module: "mcp/servers/evidence-x/", shippable: true })]) });
  check("baseline: ok", res.ok === true);
  check("baseline: no blocks", res.failures.length === 0);
}

// 1. BLOCK 1 — AGPL SPDX in a shippable module.
{
  const root = newRoot();
  plant(root, "mcp/servers/evil/mod.js", "// SPDX-License-Identifier: AGPL-3.0\nexport const x = 1;\n");
  const res = runCheck({ repoRoot: root, manifest: baseManifest([]) });
  check("BLOCK 1: fires on AGPL SPDX", hasBlock(res, 1));
  check("BLOCK 1: not ok", res.ok === false);
}
// 1b. GPL header phrase in a shippable module.
{
  const root = newRoot();
  plant(root, "mcp/servers/evil/LICENSE", "GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3\n");
  const res = runCheck({ repoRoot: root, manifest: baseManifest([]) });
  check("BLOCK 1: fires on copyleft header phrase", hasBlock(res, 1));
}
// 1c. AGPL SPDX in a NON-shippable path is ignored (benchmark/case-factory are offline).
{
  const root = newRoot();
  plant(root, "benchmark/mirage/note.js", "// SPDX-License-Identifier: AGPL-3.0\n");
  const res = runCheck({ repoRoot: root, manifest: baseManifest([]) });
  check("BLOCK 1: does NOT fire outside shippable paths", !hasBlock(res, 1));
}

// 2. BLOCK 2 — a DROP repo named as a dependency.
{
  const root = newRoot();
  plant(root, "package.json", JSON.stringify({ dependencies: { taskade: "1.0.0" } }));
  const res = runCheck({ repoRoot: root, manifest: baseManifest([el({ repo: "taskade/taskade", verdict: "DROP", mode: "DROP", url: "https://github.com/taskade/taskade", licence_status: "pending", pin_status: "na" })]) });
  check("BLOCK 2: fires on dropped repo as dependency", hasBlock(res, 2));
}
// 2b. A DEFER repo with a harvested integration present at its target.
{
  const root = newRoot();
  plant(root, "mcp/servers/deferred/index.js", "export const x = 1;\n");
  const res = runCheck({ repoRoot: root, manifest: baseManifest([el({ repo: "org/deferred", verdict: "DEFER", mode: "DEFER", url: "https://github.com/org/deferred", target_module: "mcp/servers/deferred/", licence_status: "pending", pin_status: "na" })]) });
  check("BLOCK 2: fires on deferred target present in tree", hasBlock(res, 2));
}

// 3. BLOCK 3 — a licence-pending repo wrapped on a shippable NEW-module path.
{
  const root = newRoot();
  plant(root, "mcp/servers/evidence-graded/index.js", "export const x = 1;\n");
  const res = runCheck({ repoRoot: root, manifest: baseManifest([el({ repo: "connerlambden/bgpt-mcp", verdict: "ADOPT", mode: "WRAP", url: "https://github.com/connerlambden/bgpt-mcp", target_module: "mcp/servers/evidence-graded/", shippable: true, licence_status: "pending" })]) });
  check("BLOCK 3: fires on pending licence wrapped on shippable path", hasBlock(res, 3));
}
// 3b. Same but override-existing target: BLOCK 3 fires only when the MARKER exists.
{
  const pendingOverride = el({ repo: "wso2/fhir-mcp-server", verdict: "ADOPT", mode: "WRAP", url: "https://github.com/wso2/fhir-mcp-server", target_module: "mcp/servers/fhir-broker/", shippable: true, licence_status: "pending" });
  // dir exists (our mock) but NO marker → must NOT fire (the false-positive guard).
  const rootA = newRoot();
  plant(rootA, "mcp/servers/fhir-broker/index.js", "export const mock = 1;\n");
  const resA = runCheck({ repoRoot: rootA, manifest: baseManifest([pendingOverride]) });
  check("BLOCK 3: override target dir alone does NOT fire (regression guard)", !hasBlock(resA, 3));
  // marker present → real wrap → fires.
  const rootB = newRoot();
  plant(rootB, "mcp/servers/fhir-broker/index.js", "export const mock = 1;\n");
  plant(rootB, "mcp/servers/fhir-broker/live-backend.js", "export const live = 1;\n");
  const resB = runCheck({ repoRoot: rootB, manifest: baseManifest([pendingOverride]) });
  check("BLOCK 3: override target with marker DOES fire", hasBlock(resB, 3));
}

// 4. BLOCK 4 — MedRAG conflation guards.
{
  // only one MedRAG row.
  const one = runCheck({ repoRoot: newRoot(), manifest: { ...baseManifest([]), elements: [el({ ref: "20", repo: "gzxiong/MedRAG", url: "https://github.com/gzxiong/MedRAG", verdict: "ADOPT", mode: "BENCHMARK", target_module: "benchmark/mirage/", do_not_conflate_with: "SNOWTEAM2023/MedRAG" })] } });
  check("BLOCK 4: fires when a MedRAG row is missing", hasBlock(one, 4));
  // two rows sharing a URL.
  const sameUrl = runCheck({ repoRoot: newRoot(), manifest: { ...baseManifest([]), elements: [
    el({ repo: "gzxiong/MedRAG", url: "https://github.com/x/MedRAG", verdict: "ADOPT", mode: "BENCHMARK", do_not_conflate_with: "SNOWTEAM2023/MedRAG" }),
    el({ repo: "SNOWTEAM2023/MedRAG", url: "https://github.com/x/MedRAG", do_not_conflate_with: "gzxiong/MedRAG" }),
  ] } });
  check("BLOCK 4: fires when the two MedRAG rows share a URL", hasBlock(sameUrl, 4));
  // two rows, no cross-reference.
  const noCross = runCheck({ repoRoot: newRoot(), manifest: { ...baseManifest([]), elements: [
    el({ repo: "gzxiong/MedRAG", url: "https://github.com/gzxiong/MedRAG", verdict: "ADOPT", mode: "BENCHMARK" }),
    el({ repo: "SNOWTEAM2023/MedRAG", url: "https://github.com/SNOWTEAM2023/MedRAG" }),
  ] } });
  check("BLOCK 4: fires when the rows do not cross-reference", hasBlock(noCross, 4));
}

// 5. Schema — an ADOPT row without a url, and a shippable row without a target.
{
  const noUrl = runCheck({ repoRoot: newRoot(), manifest: baseManifest([el({ verdict: "ADOPT", mode: "WRAP", url: null, target_module: "mcp/servers/y/", shippable: true })]) });
  check("schema: ADOPT without url rejected", noUrl.schemaError === true && noUrl.ok === false);
  const noTarget = runCheck({ repoRoot: newRoot(), manifest: baseManifest([el({ verdict: "ADOPT", mode: "WRAP", shippable: true, target_module: null })]) });
  check("schema: shippable without target rejected", noTarget.schemaError === true);
}

// 6. The REAL committed manifest passes against the REAL tree (0 blocks).
{
  const realManifest = JSON.parse(readFileSync(join(REPO_ROOT, "integration/harvest-manifest.json"), "utf8"));
  const res = runCheck({ repoRoot: REPO_ROOT, manifest: realManifest });
  check("real manifest: valid + PASS", res.ok === true && !res.schemaError);
  check("real manifest: 40+ elements", res.summary && res.summary.elements >= 40);
  check("real manifest: exactly 2 pending shippable (wso2 #16, bgpt #18)", res.summary && res.summary.pendingShippable === 2);
}

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-harvest-manifest: OK");
