#!/usr/bin/env node
/**
 * generate-from-fixture.js — reproducible offline driver for the H4 shaper (FLOW_PLAN H4).
 *
 * Runs the two-phase generator over a committed fixture (no live Java) and writes a
 * `<CASE_ID>.casebundle.json` to an output dir, ready for `cases:ingest`. This is the
 * offline demonstration path; live generation swaps the fixture for real Synthea +
 * chatty-notes output via the (input-gated) wrappers, with the shaper unchanged.
 *
 * Usage:
 *   node case-factory/generate-from-fixture.js <fixture-basename> [--out <dir>]
 *   # e.g. node case-factory/generate-from-fixture.js complex-chf --out /tmp/bundles
 * Then: npm run cases:ingest -- <dir> --dry-run   (and, to admit: --reseq)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toCaseSeed } from "./to-casebundle.js";
import { completeBundle } from "./complete-scoring-nodes.js";
import { validateAuCoreBundle } from "./synthea-au/run-synthea-au.js";

const HERE = dirname(fileURLToPath(import.meta.url));

export function buildFromFixture(basename) {
  const fx = (suffix) => JSON.parse(readFileSync(join(HERE, "fixtures", `${basename}.${suffix}.json`), "utf8"));
  const fhir = fx("fhir");
  const narrative = fx("narrative");
  const profile = fx("profile");
  const au = validateAuCoreBundle(fhir);
  if (!au.ok) throw new Error(`AU Core validation failed for ${basename}: ${JSON.stringify(au.results)}`);
  const { caseseed } = toCaseSeed({ fhir, narrative, profile });
  const bundle = completeBundle(caseseed);
  return { bundle, caseseed, auCore: au };
}

function main() {
  const args = process.argv.slice(2);
  const basename = args.find((a) => !a.startsWith("--"));
  const outIdx = args.indexOf("--out");
  const outDir = outIdx >= 0 ? args[outIdx + 1] : join(HERE, "out");
  if (!basename) { console.error("usage: generate-from-fixture.js <fixture-basename> [--out dir]"); process.exit(1); }
  const { bundle, auCore } = buildFromFixture(basename);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${bundle._bundle.case_id}.casebundle.json`);
  writeFileSync(path, JSON.stringify(bundle, null, 2) + "\n");
  console.log(`wrote ${path}`);
  console.log(`  AU Core: ${auCore.results.map((r) => r.resourceType + ":" + r.status).join(", ")} (ig ${auCore.ig_version}, C22 open=${auCore.target.c22_open})`);
  console.log(`  synthetic:true clinician_reviewed:false difficulty=${bundle["00_case_envelope"].case_metadata.difficulty_tier}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
