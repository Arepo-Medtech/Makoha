#!/usr/bin/env node
/**
 * pharm-author — the bulk authoring pipeline for the pharmacology datastore (FL-30 Step 3, M2).
 *
 * Turns a versioned authoring file (JSON envelope; CSV convertible via csvToRecords) into
 * validated, provenance-stamped, DRAFT records in a capability dataset. The point is that
 * clinical coverage can be expanded by editing an authoring file — no code change — while
 * two things are enforced MECHANICALLY, not by convention:
 *
 *   1. Provenance or it doesn't ship (Guardrail 5): every record gets a full provenance
 *      block built from the file's provenance_defaults; a record whose provenance cannot
 *      validate is REJECTED. An anonymous clinical fact cannot enter the store.
 *   2. No self-attestation via authoring (Guardrail 2): reviewed_by is FORCED to null and
 *      review_status FORCED to "draft" on every record, regardless of what the input says.
 *      Promotion to clinician_review / approved is a separate, clinician-only act.
 *
 * Fail-closed: if ANY record is rejected, the CLI writes NOTHING (unless --allow-partial).
 *
 * Zero dependency — Node 20 built-ins only. Pure functions are exported for the contract
 * test; the CLI main() reads a file and merges accepted records into the capability dataset.
 *
 * Usage: node scripts/pharm-author.mjs <authoring-file.json> [--allow-partial] [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITY_VALIDATORS } from "../mcp/servers/pharmacology/domain/model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

const CAPABILITY_FILE = {
  nti: "nti-register.json",
  interactions: "drug-interactions.json",
  renal: "renal-rules.json",
  scheduling: "au-scheduling.json",
  allergy: "allergy-cross-reactivity.json",
};

/** Deterministic sha256 over a records array (stable key order via JSON of sorted keys). */
export function checksumRecords(records) {
  const stable = JSON.stringify(records, (k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((kk) => [kk, v[kk]]))
      : v
  );
  return createHash("sha256").update(stable).digest("hex");
}

/**
 * Build a validated record: attach a provenance block (defaults + FORCED reviewed_by:null,
 * review_status:"draft") to a pure entity object, then validate against the capability's
 * domain schema. Throws with a clear reason if the record is invalid or unprovenanced.
 */
export function buildRecord(capability, entity, provenanceDefaults) {
  const validate = CAPABILITY_VALIDATORS[capability];
  if (!validate) throw new Error(`pharm-author: no validator for capability '${capability}' (authoring supports: ${Object.keys(CAPABILITY_VALIDATORS).join(", ")})`);
  const provenance = {
    ...(provenanceDefaults || {}),
    reviewed_by: null, // FORCED — authoring never self-attests (Guardrail 2)
    review_status: "draft", // FORCED — always enters as draft
  };
  return validate({ ...entity, provenance }); // throws on invalid entity OR invalid provenance
}

/**
 * Author a dataset fragment from an authoring envelope. Never throws on a bad record —
 * collects it in `rejected` so the caller decides (fail-closed by default).
 * @returns {{ capability:string, accepted:object[], rejected:Array<{index:number,reason:string}>, checksum:string }}
 */
export function authorDataset({ capability, provenance_defaults, records }) {
  if (!Array.isArray(records)) throw new Error("pharm-author: authoring input needs a 'records' array");
  const accepted = [];
  const rejected = [];
  records.forEach((entity, index) => {
    try {
      accepted.push(buildRecord(capability, entity, provenance_defaults));
    } catch (e) {
      rejected.push({ index, reason: e.message });
    }
  });
  return { capability, accepted, rejected, checksum: checksumRecords(accepted) };
}

/** Parse an authoring file: JSON envelope, or CSV (wrapped by the caller). */
export function parseAuthoring(text) {
  const t = String(text).trim();
  if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t);
  throw new Error("pharm-author: expected a JSON authoring envelope { capability, provenance_defaults, records }");
}

/** Minimal CSV → flat-record array (controlled authoring files only: no embedded commas/quotes).
 * Booleans/numbers are coerced; everything else stays a string. Caller wraps in an envelope. */
export function csvToRecords(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const rec = {};
    headers.forEach((h, i) => {
      const v = cells[i];
      rec[h] = v === "true" ? true : v === "false" ? false : v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v;
    });
    return rec;
  });
}

// ---- CLI ----
function main(argv) {
  const args = argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const allowPartial = args.includes("--allow-partial");
  const dryRun = args.includes("--dry-run");
  if (!file) { console.error("usage: node scripts/pharm-author.mjs <authoring-file.json> [--allow-partial] [--dry-run]"); process.exit(2); }

  const envelope = parseAuthoring(readFileSync(file, "utf8"));
  const { capability, accepted, rejected, checksum } = authorDataset(envelope);
  const target = CAPABILITY_FILE[capability];
  if (!target) { console.error(`pharm-author: capability '${capability}' has no authoring target (dose_guidance/pbs use bespoke paths)`); process.exit(2); }

  if (rejected.length) {
    console.error(`pharm-author: ${rejected.length} record(s) REJECTED:`);
    rejected.forEach((r) => console.error(`  record[${r.index}]: ${r.reason}`));
    if (!allowPartial) { console.error("pharm-author: fail-closed — nothing written (use --allow-partial to write accepted records only)"); process.exit(1); }
  }

  const path = join(DATA_DIR, target);
  const ds = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { records: [] };
  const merged = [...(ds.records || []), ...accepted];
  ds.records = merged;
  ds.records_checksum = checksumRecords(merged);
  ds.last_authored_utc = null; // stamped at commit time by the operator, not here (Date.now avoided)

  console.log(`pharm-author: ${capability} — ${accepted.length} accepted, ${rejected.length} rejected; fragment checksum ${checksum.slice(0, 12)}`);
  if (dryRun) { console.log("pharm-author: --dry-run, not writing"); return; }
  writeFileSync(path, JSON.stringify(ds, null, 2) + "\n");
  console.log(`pharm-author: wrote ${merged.length} record(s) to ${target}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
