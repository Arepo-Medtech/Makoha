/**
 * PharmCheck ingest adapter (FL-30 round-trip).
 *
 * Reads a "dev-package" produced in a standalone Claude Chat (per DEVELOPMENT-INSTRUMENT.md)
 * and brings its records back INTO the repo — but NEVER on trust, and NEVER destructively.
 * Every record is routed through the SAME fail-closed authoring pipeline the local pipeline
 * uses (authorDataset → buildRecord): schema-validated, FORCED to review_status:'draft' /
 * reviewed_by:null (no self-attestation, whatever the package claims).
 *
 * INTEGRATE, DON'T OVERWRITE (content-preservation contract):
 *   Each incoming record is classified against the existing dataset by a per-capability
 *   NATURAL KEY (its logical identity — e.g. interactions = the {subject,object} pair +
 *   mechanism_category):
 *     - new             → append (net-new content);
 *     - exact_duplicate → skip (byte-identical entity already present);
 *     - update          → same logical record, DIFFERENT content. NOT written by default —
 *                         reported for a human decision. Only --accept-updates applies it,
 *                         and even then the prior record is ARCHIVED into the dataset's
 *                         `superseded[]` array (with reason + which record replaced it),
 *                         never deleted. So valuable content is never lost — expansion and
 *                         correction are additive/auditable, not a clobber.
 * Structural proposals (new capability / schema change / new check) are surfaced for engineer
 * review, never auto-applied. Frozen wire contracts (pharm-intent/pharm-check) are untouched.
 *
 * DRY-RUN by default (reports only). Flags:
 *   --write           persist net-new records (leaves updates for review)
 *   --accept-updates  additionally apply updates (archives the superseded record first)
 *
 * Usage:  node scripts/pharm-ingest.mjs <dev-package.json> [--write] [--accept-updates]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authorDataset, CAPABILITY_FILE, checksumRecords } from "./pharm-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

const PACKAGE_VERSION = "v1";
const lc = (s) => String(s ?? "").trim().toLowerCase();

/**
 * Natural key = a record's LOGICAL identity within a capability (the fields that make it "the
 * same record"), used to tell a genuine new record from a correction/update of an existing
 * one. `__pair` = the unordered {subject,object} drug pair (interactions are direction-free).
 * Dotted paths (citation.identifier) read nested fields.
 */
const NATURAL_KEYS = {
  clinical_uses: ["ingredient", "indication"],
  pharmacodynamics: ["ingredient"],
  pharmacokinetics: ["ingredient"],
  precautions: ["ingredient", "precaution"],
  interactions: ["__pair", "mechanism_category"],
  nti: ["ingredient"],
  renal: ["ingredient"],
  scheduling: ["ingredient"],
  allergy: ["group"],
  serious_adverse_effects: ["ingredient", "effect"],
  strong_contraindications: ["subject", "condition"],
  dose_evidence: ["ingredient", "citation.identifier"],
  administration_handling: ["ingredient", "formulation"],
  tdm_parameters: ["ingredient"],
  warning_labels: ["ingredient", "label_code"],
  counselling_points: ["ingredient", "point"],
  pregnancy_risk: ["subject"],
  hepatic: ["ingredient"],
  dose_evidence_review_queue: ["ingredient", "context"],
};

const fieldVal = (rec, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), rec);

/** Logical identity of a record for a capability (null if the capability has no natural key). */
export function naturalKey(capability, rec) {
  const spec = NATURAL_KEYS[capability];
  if (!spec || !rec) return null;
  const parts = spec.map((f) => {
    if (f === "__pair") return [lc(rec.subject), lc(rec.object)].sort().join("~");
    return lc(String(fieldVal(rec, f) ?? ""));
  });
  return `${capability}::${parts.join("|")}`;
}

/** Stable identity of a record ignoring provenance (so a re-authored provenance doesn't dupe). */
export function entityKey(rec) {
  const { provenance, ...entity } = rec || {};
  const stable = JSON.stringify(entity, (k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((kk) => [kk, v[kk]])) : v
  );
  return createHash("sha256").update(stable).digest("hex");
}

/**
 * Ingest a parsed dev-package. Pure planning step — computes what WOULD change; the CLI
 * decides whether to persist. Never throws on a bad record (fail-closed collects rejections),
 * never writes.
 * @returns {{ results: object[], proposals: object[], errors: string[] }}
 */
export function ingestPackage(pkg, { dataDir = DATA_DIR } = {}) {
  const errors = [];
  if (!pkg || typeof pkg !== "object") return { results: [], proposals: [], errors: ["package is not an object"] };
  if (pkg.pharmcheck_dev_package !== PACKAGE_VERSION) errors.push(`unexpected package version '${pkg.pharmcheck_dev_package}' (expected '${PACKAGE_VERSION}')`);

  const proposals = Array.isArray(pkg.structural_proposals) ? pkg.structural_proposals : [];
  const caps = pkg.capabilities && typeof pkg.capabilities === "object" ? pkg.capabilities : {};
  const results = [];

  for (const [capability, block] of Object.entries(caps)) {
    const target = CAPABILITY_FILE[capability];
    if (!target) {
      results.push({ capability, known: false, accepted: 0, rejected: [], skipped_duplicates: 0, conflicts: [], note: `unknown/authorable capability — route via a structural_proposal (needs a schema here). Authorable: ${Object.keys(CAPABILITY_FILE).join(", ")}` });
      continue;
    }
    const records = Array.isArray(block?.records) ? block.records : [];
    // Validate + force-draft through the SAME pipeline as local authoring.
    const { accepted, rejected } = authorDataset({ capability, provenance_defaults: block?.provenance_defaults, records });

    // Existing dataset: index by exact entity + by natural key.
    const path = join(dataDir, target);
    const existing = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")).records || []) : [];
    const haveExact = new Set(existing.map(entityKey));
    const byNatural = new Map();
    for (const rec of existing) {
      const nk = naturalKey(capability, rec);
      if (!nk) continue;
      if (!byNatural.has(nk)) byNatural.set(nk, []);
      byNatural.get(nk).push(rec);
    }

    // Classify each accepted record: exact-dup → skip; natural-key match (diff content) →
    // update; else → net-new. Dedup within the batch too.
    const seenExact = new Set(haveExact);
    const fresh = [];
    const conflicts = [];
    let dupes = 0;
    for (const rec of accepted) {
      const ek = entityKey(rec);
      if (seenExact.has(ek)) { dupes++; continue; }
      seenExact.add(ek);
      const nk = naturalKey(capability, rec);
      const matches = nk ? (byNatural.get(nk) || []) : [];
      if (matches.length) conflicts.push({ incoming: rec, existing: matches, naturalKey: nk });
      else fresh.push(rec);
    }

    results.push({ capability, known: true, target, accepted: fresh.length, rejected, skipped_duplicates: dupes, conflicts, fresh, existingCount: existing.length });
  }
  return { results, proposals, errors };
}

/**
 * Persist changes (only under --write). Adds net-new records always; applies updates ONLY if
 * acceptUpdates — and then archives each superseded record into ds.superseded[] first (never
 * deletes). Returns a per-capability summary.
 */
/** A record is SIGNED once a clinician has attested it (review_status 'approved' or a named
 * reviewer). An ingest MUST NOT silently archive/replace a signed record with a draft. */
export function isSignedRecord(rec) {
  return !!(rec && rec.provenance && (rec.provenance.review_status === "approved" || rec.provenance.reviewed_by != null));
}

export function writeResults(results, { acceptUpdates = false, supersedeSigned = false, dataDir = DATA_DIR } = {}) {
  const written = [];
  const blockedSigned = []; // updates refused because they would supersede a SIGNED record
  for (const r of results) {
    if (!r.known) continue;
    const path = join(dataDir, r.target);
    const ds = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { records: [] };
    let records = ds.records || [];
    const toAdd = [...(r.fresh || [])];
    let supersededCount = 0;

    if (acceptUpdates && r.conflicts && r.conflicts.length) {
      ds.superseded = Array.isArray(ds.superseded) ? ds.superseded : [];
      for (const c of r.conflicts) {
        // GUARD: never archive a SIGNED record for a draft update unless --supersede-signed is
        // explicit. Superseding a clinician-attested record downgrades signed→draft and must be
        // a deliberate act (a signed fact is only re-opened by the clinician, not by an ingest).
        const matching = records.filter((rec) => naturalKey(r.capability, rec) === c.naturalKey);
        if (!supersedeSigned && matching.some(isSignedRecord)) {
          blockedSigned.push({ capability: r.capability, naturalKey: c.naturalKey });
          continue; // leave the signed record intact; do NOT apply this update
        }
        // Archive every existing record sharing this natural key, THEN add the update.
        // Content is preserved in superseded[] — this is a version, not a deletion.
        const keep = [];
        for (const rec of records) {
          if (naturalKey(r.capability, rec) === c.naturalKey) {
            ds.superseded.push({ record: rec, superseded_by: entityKey(c.incoming), superseded_utc: null, reason: isSignedRecord(rec) ? "replaced by ingested update via --supersede-signed (was clinician-signed)" : "replaced by ingested update (dev-package)" });
            supersededCount++;
          } else keep.push(rec);
        }
        records = keep;
        toAdd.push(c.incoming);
      }
    }

    if (toAdd.length === 0 && supersededCount === 0) continue;
    const merged = [...records, ...toAdd];
    ds.records = merged;
    ds.records_checksum = checksumRecords(merged);
    ds.last_authored_utc = null; // stamped by the operator at commit, not here
    // Governance: authored records are FORCED to draft. If we append drafts into a dataset
    // that already carries a clinical sign-off, the dataset-level clinical_sign_off flag would
    // over-claim (it would read as "all records signed"). Stamp a non-destructive marker so the
    // coarse flag stays honest — the original sign-off is preserved; the additions are declared
    // NOT covered by it. Per-record review_status remains the authoritative gate.
    if (ds.attestation && ds.attestation.clinical_sign_off === true && toAdd.some((r) => r.provenance && r.provenance.review_status !== "approved")) {
      ds.attestation.has_unsigned_additions = true;
      ds.attestation.unsigned_additions_note = "Draft records were added via ingest AFTER the clinical sign-off. Those additions are NOT covered by clinical_sign_off and require separate clinician attestation; per-record provenance.review_status is authoritative.";
    }
    writeFileSync(path, JSON.stringify(ds, null, 2) + "\n");
    written.push({ capability: r.capability, target: r.target, added: toAdd.length, superseded: supersededCount, total: merged.length });
  }
  return { written, blockedSigned };
}

// ---- CLI ----
function main(argv) {
  const args = argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const write = args.includes("--write");
  const acceptUpdates = args.includes("--accept-updates");
  const supersedeSigned = args.includes("--supersede-signed");
  if (!file) { console.error("usage: node scripts/pharm-ingest.mjs <dev-package.json> [--write] [--accept-updates] [--supersede-signed]"); process.exit(2); }

  let pkg;
  try { pkg = JSON.parse(readFileSync(file, "utf8")); } catch (e) { console.error(`pharm-ingest: cannot read/parse ${file}: ${e.message}`); process.exit(2); }

  const { results, proposals, errors } = ingestPackage(pkg);
  if (errors.length) errors.forEach((e) => console.error("pharm-ingest: envelope warning —", e));

  console.log(`\npharm-ingest: dev-package "${pkg.author_note || "(no note)"}"\n`);
  let anyRejected = false;
  let anyConflict = false;
  for (const r of results) {
    if (!r.known) { console.log(`  ✗ ${r.capability}: NOT authorable — ${r.note}`); anyRejected = true; continue; }
    const c = r.conflicts.length;
    if (c) anyConflict = true;
    console.log(`  • ${r.capability}: ${r.accepted} new, ${c} update${c === 1 ? "" : "s"}, ${r.skipped_duplicates} dup, ${r.rejected.length} rejected (dataset has ${r.existingCount})`);
    r.rejected.forEach((rej) => { anyRejected = true; console.log(`      ✗ record[${rej.index}]: ${rej.reason}`); });
    r.conflicts.forEach((cf) => console.log(`      ↻ update to existing "${cf.naturalKey}" — held ${acceptUpdates ? "(will archive old + apply)" : "(need --accept-updates; not written)"}`));
  }
  if (proposals.length) {
    console.log(`\n  ${proposals.length} structural proposal(s) — for ENGINEER review (not auto-applied):`);
    proposals.forEach((p, i) => console.log(`      ${i + 1}. [${p.kind || "?"}] ${p.title || "(untitled)"} — ${p.rationale || ""}`));
  }

  if (!write) {
    console.log(`\npharm-ingest: --dry-run (default). Re-run with --write to add net-new records${anyConflict ? ", and --accept-updates to apply the held updates (old records archived, not deleted)" : ""}.\n`);
    return;
  }
  if (anyRejected) console.log("\npharm-ingest: NOTE — some records were rejected (fail-closed); only accepted records will be written.");
  if (anyConflict && !acceptUpdates) console.log("pharm-ingest: NOTE — updates to existing records were HELD (content preserved). Re-run with --accept-updates to apply them (each old record is archived into superseded[]).");
  const { written, blockedSigned } = writeResults(results, { acceptUpdates, supersedeSigned });
  written.forEach((w) => console.log(`  wrote +${w.added} new${w.superseded ? `, archived ${w.superseded} superseded` : ""} → ${w.target} (now ${w.total})`));
  if (blockedSigned.length) {
    console.log(`\npharm-ingest: ⚠ BLOCKED ${blockedSigned.length} update(s) that would supersede a CLINICIAN-SIGNED record (signed→draft is refused):`);
    blockedSigned.forEach((b) => console.log(`      ⚠ ${b.naturalKey} — left signed record intact, update NOT applied`));
    console.log("      A signed fact is only re-opened by the clinician. To override deliberately, re-run with --supersede-signed (the signed record is archived into superseded[], not deleted).");
  }
  console.log(`\npharm-ingest: wrote ${written.reduce((a, w) => a + w.added, 0)} record(s), archived ${written.reduce((a, w) => a + w.superseded, 0)}. All entered review_status:draft — clinician sign-off still required.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
