#!/usr/bin/env node
/**
 * ingest-case-bundles.mjs — admit <CASE_ID>.casebundle.json files into data/cases/.
 *
 * For each bundle it: validates the 7 nodes against data/schemas/*.schema.json (ajv),
 * checks case_id consistency, runs a FIELD-SCOPED firewall check (only the sub-fields
 * that reach the AI Doctor are scanned for answer-key leaks), verifies the honesty gate
 * (bundle hashes null, codes unverified), then SPLITS the bundle into
 * data/cases/<CASE_ID>/{00..13}.json + case_manifest.json, computing the real SHA-256
 * per file (filling the manifest nulls). It carries the clinician attestation through and
 * NEVER re-flips review status. A bundle that fails any gate is refused (not written).
 *
 * Usage:
 *   node scripts/ingest-case-bundles.mjs <folder-or-bundle> [--out data/cases] [--dry-run] [--force] [--reseq]
 *
 * --dry-run : validate + report only, write nothing.
 * --force   : overwrite an existing data/cases/<CASE_ID>/ (default: refuse, report collision).
 * --reseq   : on a case_id collision, assign the next free GLOBALLY-UNIQUE seq (same
 *             specialty+difficulty) instead of refusing — the id-scheme decision of
 *             2026-07-05 that ends cross-series collisions. NEVER overwrites; the
 *             original→assigned mapping is recorded in the manifest (ingest.reseq).
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js"; // schemas declare draft 2020-12

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const canonical = (obj) => JSON.stringify(obj, null, 2) + "\n"; // matches protocol §7.9

const NODE_KEYS = [
  "00_case_envelope", "01_presentation_layer", "02_conversational_policy",
  "10_ground_truth_node", "11_symptom_links_node", "12_management_plan_node", "13_safety_netting_node",
];
const SCHEMA_OF = Object.fromEntries(NODE_KEYS.map((k) => [k, `${k}.schema.json`]));
const CASEID_RE = /^SPEC-[A-Z]{2,6}-0[1-7]-[0-9]{5}$/;

// The exact set of files the splitter writes into a case dir: the 7 nodes + the manifest.
// Anything else in a written case dir is non-canonical (a hygiene warning, below).
const CANONICAL_FILES = new Set([...NODE_KEYS.map((k) => `${k}.json`), "case_manifest.json"]);
// Cloud-sync copy pattern — "<node> 2.json", "case_manifest 3.json", etc. This is the exact
// shape of the 236-file sync-dupe incident (2026-07-05); flag it explicitly as likely cruft.
const SYNC_DUPE_RE = / \d+\.[A-Za-z]+$/;

// --- ajv (draft-07; formats not enforced, matching the authoring-side validation) -----
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validators = {};
for (const [k, f] of Object.entries(SCHEMA_OF)) {
  validators[k] = ajv.compile(JSON.parse(readFileSync(join(ROOT, "data/schemas", f))));
}

/**
 * FIELD-SCOPED firewall allow-list (approved contract). Returns the concatenated text of
 * ONLY the sub-fields that are injected into the AI-Doctor / patient-simulator exchange.
 * Answer-key content appearing anywhere in here is a real leak; the same content in
 * metadata (00, or 02 scoring fields) is legitimate and NOT scanned.
 */
function injectableText(bundle) {
  const parts = [];
  // 01: patient-facing content only. psychosocial_profile (hidden_agenda, communication_style)
  // and digital_tablet_field_map are simulator-direction / mapping metadata, NOT shown to the
  // AI Doctor — they legitimately reference the condition, so they are not scanned.
  const pl = bundle["01_presentation_layer"] || {};
  for (const k of ["demographics", "opening_complaint", "history_as_reported", "objective_data_offered"]) {
    if (pl[k] !== undefined) parts.push(JSON.stringify(pl[k]));
  }
  const pol = bundle["02_conversational_policy"] || {};
  for (const d of pol.disclosure_items || []) {
    for (const k of ["clinical_fact", "patient_response_template", "patient_deflection_template"]) {
      if (typeof d[k] === "string") parts.push(d[k]);
    }
  }
  for (const e of pol.patient_initiated_exchanges || []) {
    if (typeof e.patient_text === "string") parts.push(e.patient_text);
  }
  for (const b of pol.deflection_behaviours || []) {
    if (typeof b.deflection_text_template === "string") parts.push(b.deflection_text_template);
  }
  return parts.join(" ␟ ").toLowerCase();
}

/**
 * Reliable, low-false-positive firewall check: the FULL primary_diagnosis name (and its SNOMED
 * display) appearing verbatim in injectable text is a genuine answer leak. Individual medical
 * words are NOT flagged — they are legitimate patient vocabulary (a patient says "spreading",
 * "infection", "I fractured it", or even "could it be meningitis?"). The clinician review is the
 * backstop for subtler phrasing; this gate blocks the unambiguous leaks.
 */
function firewallLeaks(bundle) {
  const text = injectableText(bundle);
  const leaks = [];
  // Only the full primary_diagnosis.name is specific enough to signal a real leak. snomed_display
  // is a short generic SNOMED term (e.g. "Laceration", "Anaphylaxis") that legitimately appears as
  // a presenting complaint or a known-history mention, so it is NOT used here.
  const pd = ((bundle["10_ground_truth_node"] || {}).primary_diagnosis) || {};
  if (typeof pd.name === "string" && pd.name.length > 3 && text.includes(pd.name.toLowerCase())) {
    leaks.push(`full diagnosis name "${pd.name}"`);
  }
  if (text.includes(".txt")) leaks.push("source filename (.txt)");
  return [...new Set(leaks)];
}

function checkBundle(bundle) {
  const problems = [], leaks = [];
  const b = bundle._bundle || {};
  if (b.format !== "breath-ezy-casebundle") problems.push("missing/invalid _bundle.format");
  const bcid = b.case_id;
  if (!bcid || !CASEID_RE.test(bcid)) problems.push(`case_id '${bcid}' fails SPEC pattern`);
  for (const k of [...NODE_KEYS, "case_manifest"]) {
    if (!(k in bundle)) { problems.push(`missing key: ${k}`); continue; }
    if (bundle[k].case_id !== bcid) problems.push(`${k}.case_id (${bundle[k].case_id}) != _bundle (${bcid})`);
  }
  for (const k of NODE_KEYS) {
    if (bundle[k] && !validators[k](bundle[k])) {
      const e = validators[k].errors[0];
      problems.push(`[${k}] schema: ${e.instancePath || "(root)"} ${e.message}`);
    }
  }
  const cm = bundle.case_manifest || {};
  if (!(cm.files || []).every((f) => f.sha256 === null)) problems.push("bundle file sha256 not null (must be ingest-computed)");
  if (!(cm.codes_manifest || []).every((c) => c.verification_status === "unverified_pending_terminology_receipt"))
    problems.push("a code is not marked unverified");
  leaks.push(...firewallLeaks(bundle));
  return { case_id: bcid, problems, leaks, ok: problems.length === 0 && leaks.length === 0 };
}

/**
 * Assign the next free GLOBALLY-UNIQUE case_id in the same specialty+difficulty
 * bucket (id-scheme decision 2026-07-05: globally-assigned seq). The seq is set
 * ABOVE the maximum 5-digit seq used by ANY existing case dir, so the full
 * case_id cannot collide with anything already ingested — this replaces the
 * source-derived seq that caused cross-series collisions (AUC-005 & CDV-005 both
 * → SPEC-CARD-01-00005). Specialty+difficulty are preserved from the original id.
 */
function nextFreeGlobalId(outDir, specialty, difficulty) {
  let maxSeq = 0;
  for (const name of readdirSync(outDir)) {
    const m = /^SPEC-[A-Z]{2,6}-0[1-7]-(\d{5})$/.exec(name);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  let seq = maxSeq + 1, id;
  do { id = `SPEC-${specialty}-${difficulty}-${String(seq).padStart(5, "0")}`; seq++; }
  while (existsSync(join(outDir, id)));
  return id;
}

/**
 * Filename-only hygiene scan of a written case dir. Flags every entry that is NOT one of the 8
 * canonical split files — in particular cloud-sync copies ("<node> 2.json"), the known offender
 * (236-dupe incident, 2026-07-05). This is a non-fatal WARNING: it never blocks ingest, never
 * changes the exit code, and NEVER opens a file body — readdirSync only — so the scoring-store
 * firewall over the sealed 10–13 nodes is preserved by construction. Catches sync cruft at
 * write time (here) instead of at commit time (a broad `git add`).
 */
function hygieneStrays(caseDir) {
  return readdirSync(caseDir)
    .filter((n) => !CANONICAL_FILES.has(n))
    .map((n) => ({ name: n, syncDupe: SYNC_DUPE_RE.test(n) }));
}

/** Rewrite every case_id field in the bundle (all nodes + _bundle + manifest) to newId. */
function reseqBundle(bundle, newId) {
  bundle._bundle.case_id = newId;
  for (const k of NODE_KEYS) if (bundle[k]) bundle[k].case_id = newId;
  if (bundle.case_manifest) bundle.case_manifest.case_id = newId;
}

function ingestOne(path, outDir, { dryRun, force, reseq }, nowIso) {
  const raw = readFileSync(path);
  let bundle;
  try { bundle = JSON.parse(raw); }
  catch (e) { return { file: basename(path), status: "INVALID_JSON", detail: String(e).slice(0, 140) }; }

  const chk = checkBundle(bundle);
  if (!chk.ok) {
    return { file: basename(path), case_id: chk.case_id,
      status: chk.leaks.length ? "FIREWALL_LEAK" : "REFUSED", leaks: chk.leaks, problems: chk.problems.slice(0, 8) };
  }

  // Collision handling. Default: refuse (never overwrite). With --reseq: assign the
  // next free globally-unique id in the same specialty+difficulty bucket, rewrite the
  // bundle's case_id everywhere, and record the original→assigned mapping for the
  // medicolegal audit trail (case_id is the anchor). --force still overwrites (unchanged).
  let effectiveId = chk.case_id;
  let reseqInfo = null;
  if (existsSync(join(outDir, effectiveId)) && !force) {
    if (!reseq) {
      return { file: basename(path), case_id: chk.case_id, status: "COLLISION", detail: `${join(outDir, effectiveId)} exists (use --reseq to auto-assign a new id, or --force)` };
    }
    const m = /^SPEC-([A-Z]{2,6})-(0[1-7])-\d{5}$/.exec(chk.case_id);
    effectiveId = nextFreeGlobalId(outDir, m[1], m[2]);
    reseqInfo = { original_case_id: chk.case_id, assigned_case_id: effectiveId, reason: "globally-assigned seq — original collided" };
    reseqBundle(bundle, effectiveId);
  }
  const caseDir = join(outDir, effectiveId);
  if (dryRun) return { file: basename(path), case_id: effectiveId, status: "OK_DRY_RUN", reseq: reseqInfo };

  // split + hash
  mkdirSync(caseDir, { recursive: true });
  const fileHashes = {};
  for (const k of NODE_KEYS) {
    const bytes = canonical(bundle[k]);
    writeFileSync(join(caseDir, `${k}.json`), bytes);
    fileHashes[`${k}.json`] = sha256(Buffer.from(bytes, "utf8"));
  }
  // finalise the manifest: fill file hashes, source.sha256 (if the .txt is alongside), provenance
  const cm = JSON.parse(JSON.stringify(bundle.case_manifest));
  cm.files = (cm.files || []).map((f) => ({ ...f, sha256: fileHashes[f.path] ?? f.sha256 }));
  cm.source = cm.source || {};
  const srcName = cm.source.filename;
  if (srcName) {
    const srcPath = join(dirname(path), srcName);
    if (existsSync(srcPath)) cm.source.sha256 = sha256(readFileSync(srcPath));
  }
  cm.ingest = { ingested_utc: nowIso, ingested_by: "cases:ingest", bundle_sha256: sha256(raw),
    hashing: "SHA-256 over canonical (JSON 2-space + trailing newline) bytes of each split node" };
  if (reseqInfo) cm.ingest.reseq = reseqInfo; // audit trail: original source id → assigned id
  writeFileSync(join(caseDir, "case_manifest.json"), canonical(cm));

  return { file: basename(path), case_id: effectiveId, status: "INGESTED", reseq: reseqInfo,
    reviewed: (cm.review || {}).clinician_reviewed === true, files: NODE_KEYS.length + 1,
    warnings: hygieneStrays(caseDir) };
}

function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const pos = args.filter((a) => !a.startsWith("--"));
  const outIdx = args.indexOf("--out");
  const input = pos[0];
  const outDir = outIdx >= 0 ? args[outIdx + 1] : join(ROOT, "data/cases");
  if (!input) { console.error("usage: ingest-case-bundles.mjs <folder-or-bundle> [--out dir] [--dry-run] [--force] [--reseq]"); process.exit(1); }
  const opts = { dryRun: flags.has("--dry-run"), force: flags.has("--force"), reseq: flags.has("--reseq") };
  const nowIso = new Date().toISOString();

  const abs = input.startsWith("/") ? input : join(ROOT, input);
  const bundles = statSync(abs).isDirectory()
    ? readdirSync(abs).filter((n) => n.endsWith(".casebundle.json")).sort().map((n) => join(abs, n))
    : [abs];

  const results = bundles.map((p) => ingestOne(p, outDir, opts, nowIso));
  const byStatus = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.log(`\n${"=".repeat(64)}\ncases:ingest ${opts.dryRun ? "(DRY RUN) " : ""}— ${results.length} bundle(s) -> ${outDir}\n${"=".repeat(64)}`);
  for (const [s, n] of Object.entries(byStatus)) console.log(`  ${s}: ${n}`);
  const bad = results.filter((r) => !["INGESTED", "OK_DRY_RUN"].includes(r.status));
  for (const r of bad) {
    console.log(`\n[${r.status}] ${r.file} (${r.case_id || "?"})`);
    (r.leaks || []).forEach((l) => console.log(`    !! FIREWALL: ${l}`));
    (r.problems || []).forEach((p) => console.log(`     - ${p}`));
    if (r.detail) console.log(`     - ${r.detail}`);
  }
  const ingested = results.filter((r) => r.status === "INGESTED");
  const reseqd = results.filter((r) => r.reseq);
  for (const r of reseqd) console.log(`  [reseq] ${r.reseq.original_case_id} -> ${r.reseq.assigned_case_id} (${opts.dryRun ? "would assign" : "assigned"}; original collided)`);
  // Write-time hygiene warnings — non-fatal, do NOT affect the exit code. A stray file in a
  // written case dir is almost always cloud-sync cruft ("<node> 2.json") that a broad `git add`
  // would otherwise sweep into the repo (the 236-dupe incident, 2026-07-05).
  const warned = results.filter((r) => (r.warnings || []).length);
  for (const r of warned) {
    console.log(`\n[HYGIENE] ${r.case_id}: ${r.warnings.length} non-canonical file(s) in the case dir —`);
    for (const w of r.warnings) console.log(`    !! "${w.name}"${w.syncDupe ? " — likely cloud-sync cruft, delete it" : " — not a canonical case file"}`);
  }
  if (ingested.length) console.log(`\n${ingested.length} case(s) written; ${ingested.filter((r) => r.reviewed).length} carry a clinician attestation.`);
  // non-zero exit if anything failed (so CI/callers notice)
  process.exit(bad.length ? 1 : 0);
}

main();
