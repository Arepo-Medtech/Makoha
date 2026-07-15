/**
 * pharm-reseal — verify and (deliberately) re-seal a pharmacology dataset's records_checksum.
 *
 * WHY THIS EXISTS (R-46, 2026-07-15). `records_checksum` is the integrity seal over each dataset's
 * clinician-attested records. It was WRITE-ONLY: written by pharm-author.mjs, pharm-ingest.mjs and
 * pharm-pbs-sync.mjs, and verified by nothing — so `npm test` ran green for months with 7 of 21 seals
 * broken. The seals broke because the seal is computed at AUTHORING/INGEST time, when incoming records
 * are FORCED to review_status:"draft"; the clinician sign-off then sets reviewed_by/review_status ON
 * the records and nothing re-sealed. The writers are not at fault — the sign-off mutates records
 * outside them.
 *
 * The durable fix is the assertion now in test/contract-pharm-datastore.js: a broken seal reddens CI.
 * This tool is the other half — the sanctioned way to CLOSE that red, and the only thing that should
 * ever write a seal outside the authoring writers.
 *
 * A re-seal BLESSES whatever the records currently are. That is exactly why it is a deliberate,
 * argument-hungry, self-documenting act rather than an automatic repair:
 *   - --reason is REQUIRED. An unexplained re-seal is indistinguishable from covering up a mutation.
 *   - every re-seal appends to attestation.reseal_history[] with the prior + new checksum, so the
 *     chain of custody survives in the artifact, not just in git.
 *   - --check makes no changes and is what CI-adjacent callers should use.
 * NEVER run this to "make the test pass". If a seal breaks unexpectedly, find out WHY first — the
 * whole point of the seal is that you cannot tell a stale seal from an unreviewed edit without looking.
 *
 * Date.now() is deliberately avoided (repo convention, see pharm-author.mjs): pass --utc so the
 * stamped date is the operator's deliberate value, not the machine's clock.
 *
 * Usage:
 *   node scripts/pharm-reseal.mjs --check
 *   node scripts/pharm-reseal.mjs <file.json> [...] --reason "..." --utc 2026-07-15 [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checksumRecords } from "./pharm-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

/** Every dataset carrying a seal, with its stored vs recomputed value. */
export function auditSeals(dir = DATA_DIR) {
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    let ds;
    try { ds = JSON.parse(readFileSync(join(dir, file), "utf8")); } catch { continue; }
    if (typeof ds.records_checksum !== "string" || !Array.isArray(ds.records)) continue;
    const actual = checksumRecords(ds.records);
    out.push({ file, records: ds.records.length, stored: ds.records_checksum, actual, ok: actual === ds.records_checksum });
  }
  return out;
}

function main(argv) {
  const args = argv.slice(2);
  const check = args.includes("--check");
  const dryRun = args.includes("--dry-run");
  const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const reason = val("--reason");
  const utc = val("--utc");
  const files = args.filter((a) => !a.startsWith("--") && a !== reason && a !== utc);

  if (check || files.length === 0) {
    const audit = auditSeals();
    const bad = audit.filter((a) => !a.ok);
    audit.forEach((a) => console.log(`  ${a.ok ? "OK   " : "BROKEN"} ${a.file.padEnd(34)} ${String(a.records).padStart(5)} records`));
    console.log(`\npharm-reseal --check: ${audit.length} sealed dataset(s), ${bad.length} BROKEN`);
    if (bad.length) { console.error("A broken seal means the records differ from what was sealed. Find out WHY before re-sealing."); process.exit(1); }
    return;
  }

  // A re-seal without a reason is the thing this tool exists to prevent.
  if (!reason) { console.error("pharm-reseal: --reason is REQUIRED — a re-seal blesses the current records; say why on the record"); process.exit(2); }
  if (!utc) { console.error("pharm-reseal: --utc <YYYY-MM-DD> is REQUIRED (Date.now() is avoided by repo convention)"); process.exit(2); }

  for (const f of files) {
    const path = join(DATA_DIR, f);
    const ds = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(ds.records)) { console.error(`pharm-reseal: ${f} has no records array`); process.exit(1); }
    const prior = ds.records_checksum ?? null;
    const next = checksumRecords(ds.records);
    if (prior === next) { console.log(`pharm-reseal: ${f} — seal already correct, nothing to do`); continue; }

    ds.records_checksum = next;
    // Chain of custody lives in the artifact, not only in git history.
    ds.attestation = ds.attestation || {};
    ds.attestation.reseal_history = ds.attestation.reseal_history || [];
    ds.attestation.reseal_history.push({ resealed_utc: utc, prior_checksum: prior, new_checksum: next, records: ds.records.length, reason });

    console.log(`pharm-reseal: ${f} — ${ds.records.length} records; ${String(prior).slice(0, 12)}… → ${next.slice(0, 12)}…`);
    if (dryRun) { console.log("  (--dry-run, not written)"); continue; }
    writeFileSync(path, JSON.stringify(ds, null, 2) + "\n");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
