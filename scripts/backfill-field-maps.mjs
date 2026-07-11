#!/usr/bin/env node
/**
 * backfill-field-maps.mjs — add the schema-const digital_tablet_field_map to
 * ingested cases that lack it (register item `fhir-path-hooks-unwired`
 * remediation, OMNI-4; operator ruling 2026-07-11: backfill + re-hash with
 * the original clinician attestation carried forward).
 *
 * WHY THIS IS SAFE TO DO ON ATTESTED CASES: every value written is a
 * schema-CONST structural path (data/schemas/01_presentation_layer.schema.json
 * fixes each digital_tablet_field_map property to a single allowed value) —
 * no clinical content is added, changed, or interpreted. The map is
 * sim/scorer metadata and is default-denied by the context-injection
 * allow-list, so nothing the AI Doctor sees changes either.
 *
 * WHAT IT TOUCHES (and only this):
 *   - 01_presentation_layer.json — parsed, field map added, re-serialised in
 *     the ingest-canonical form (JSON.stringify(obj, null, 2) + "\n").
 *   - case_manifest.json — the 01 files[] sha256 recomputed (the eval gate
 *     verifies hashes; a silent edit would fail integrity — hashing is the
 *     record, so the record is updated WITH a reason), plus a
 *     field_map_backfill block recording prior/new sha256 and that the
 *     original attestation is carried forward.
 *
 * SCORING-STORE FIREWALL: sealed nodes (10–13) are never opened, read, or
 * re-hashed — their manifest entries are untouched.
 *
 * Which map keys are written: chief_complaint_path + demographics_path always
 * (both source fields are schema-required); the other four only when the
 * corresponding history_as_reported sub-field is present and non-empty — a
 * path claiming content the case does not have would be a false anchor.
 *
 * Every path is proven against the pinned omnibus (verification/omnibus.js)
 * before writing, and the updated 01 is re-validated against its JSON schema.
 *
 * Run:  node scripts/backfill-field-maps.mjs --dry-run   (report only)
 *       node scripts/backfill-field-maps.mjs             (write)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js"; // schemas declare draft 2020-12 (matches ingest)
import { provenPath, omnibusDatasetReceipt } from "../verification/omnibus.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CASES_DIR = join(ROOT, "data", "cases");
const DRY_RUN = process.argv.includes("--dry-run");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const canonical = (obj) => JSON.stringify(obj, null, 2) + "\n"; // matches ingest / protocol §7.9

const schema = JSON.parse(readFileSync(join(ROOT, "data", "schemas", "01_presentation_layer.schema.json"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validate01 = ajv.compile(schema);

// The six schema-const anchors, read from the schema itself so this script
// can never drift from the contract.
const CONSTS = Object.fromEntries(
  Object.entries(schema.properties.digital_tablet_field_map.properties).map(([k, v]) => [k, v.const])
);
// Prove every const anchor against the pinned omnibus before touching a file.
for (const [key, path] of Object.entries(CONSTS)) {
  if (provenPath(path) === null) {
    console.error(`ABORT: schema-const ${key} = "${path}" does not resolve in the omnibus — fix the dataset/schema first`);
    process.exit(1);
  }
}

const nonEmpty = (v) =>
  v !== undefined && v !== null &&
  (typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : typeof v === "object" ? Object.keys(v).length > 0 : true);

function buildMap(pl) {
  const h = pl.history_as_reported || {};
  const map = {
    chief_complaint_path: CONSTS.chief_complaint_path,
    demographics_path: CONSTS.demographics_path,
  };
  if (nonEmpty(h.current_medications_as_reported)) map.medications_path = CONSTS.medications_path;
  if (nonEmpty(h.allergies_as_reported)) map.allergies_path = CONSTS.allergies_path;
  if (nonEmpty(h.social_history_volunteered)) map.social_history_path = CONSTS.social_history_path;
  if (nonEmpty(h.family_history_as_reported)) map.family_history_path = CONSTS.family_history_path;
  return map;
}

const receipt = omnibusDatasetReceipt();
const nowIso = new Date().toISOString();
let updated = 0, skippedMapped = 0, skippedNoManifest = 0;
const problems = [];

for (const caseId of readdirSync(CASES_DIR).sort()) {
  const dir = join(CASES_DIR, caseId);
  if (!statSync(dir).isDirectory()) continue;
  const plPath = join(dir, "01_presentation_layer.json");
  const manifestPath = join(dir, "case_manifest.json");
  if (!existsSync(plPath)) continue;

  const plRaw = readFileSync(plPath, "utf8");
  const pl = JSON.parse(plRaw);
  if (pl.digital_tablet_field_map) { skippedMapped++; continue; }
  if (!existsSync(manifestPath)) {
    // Pre-ingest legacy (reference case): no manifest to keep honest — skip,
    // tracked separately under reference-case-manifest-missing.
    skippedNoManifest++;
    continue;
  }

  const priorSha = sha256(Buffer.from(plRaw, "utf8"));
  pl.digital_tablet_field_map = buildMap(pl);
  if (!validate01(pl)) {
    problems.push(`${caseId}: updated 01 fails schema — ${JSON.stringify(validate01.errors[0])}`);
    continue;
  }
  const newBytes = canonical(pl);
  const newSha = sha256(Buffer.from(newBytes, "utf8"));

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entry = (manifest.files || []).find((f) => f.path === "01_presentation_layer.json");
  if (!entry) { problems.push(`${caseId}: manifest lists no 01 entry`); continue; }
  if (entry.sha256 !== priorSha) {
    problems.push(`${caseId}: on-disk 01 does not match its manifest hash BEFORE backfill — integrity issue, not touching it`);
    continue;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] ${caseId}: would add ${Object.keys(pl.digital_tablet_field_map).length}-key field map; 01 sha256 ${priorSha.slice(0, 10)}… → ${newSha.slice(0, 10)}…`);
    updated++;
    continue;
  }

  entry.sha256 = newSha;
  manifest.field_map_backfill = {
    backfilled_utc: nowIso,
    reason: "digital_tablet_field_map added — schema-const structural paths only, no clinical content changed (OMNI-4, operator-approved 2026-07-11)",
    omnibus_dataset: { ref: receipt.ref, sha256: receipt.sha256 },
    file: "01_presentation_layer.json",
    sha256_before: priorSha,
    sha256_after: newSha,
    attestation: "original clinician attestation carried forward (see review block) — backfill is non-clinical metadata",
  };
  writeFileSync(plPath, newBytes);
  writeFileSync(manifestPath, canonical(manifest));
  updated++;
}

console.log(`${DRY_RUN ? "[dry-run] " : ""}backfill-field-maps: ${updated} case(s) ${DRY_RUN ? "would be " : ""}updated, ${skippedMapped} already mapped, ${skippedNoManifest} pre-ingest legacy skipped.`);
if (problems.length) {
  console.error("PROBLEMS (untouched):\n - " + problems.join("\n - "));
  process.exit(1);
}
