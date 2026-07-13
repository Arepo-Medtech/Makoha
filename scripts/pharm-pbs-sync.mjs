#!/usr/bin/env node
/**
 * pharm-pbs-sync — cached ingest of the PBS Public API v3 formulary into the datastore
 * (FL-30 Step 3, M4). The PBS Schedule is Commonwealth open data (CC BY); this pulls it,
 * maps rows to the PbsFormulary domain shape, and writes a provenance-stamped, cached
 * dataset (mcp/servers/pharmacology/data/pbs-formulary.json).
 *
 * WHY CACHED, NOT PER-CHECK LIVE: the API is designed for download-and-store and is hard
 * rate-limited (~1 req/20s shared, current + 12 months, monthly refresh). It must never be
 * called inside a real-time PharmCheck — we sync a local copy and read that.
 *
 * SECRETS: the subscription key is resolved through the fail-closed secrets seam
 * (getSecret) — it is NEVER read from the repo, NEVER logged, NEVER printed. Absent/
 * unresolvable key → the sync is UNAVAILABLE and writes nothing (input-gated, fail-safe;
 * the synthea / mostly-ai precedent). Only a REAL pull stamps source_pull.mode='live';
 * a fixture/dry-run build never claims live (no mock-as-live).
 *
 * Zero repo dependency — Node 20 built-ins (global fetch) + the secrets seam.
 *
 * Usage: node scripts/pharm-pbs-sync.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSecret, hasSecret } from "../integration/secrets.js";
import { validatePbsFormulary } from "../mcp/servers/pharmacology/domain/model.js";
import { checksumRecords } from "./pharm-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "mcp", "servers", "pharmacology", "data", "pbs-formulary.json");

const KEY_REF = process.env.HEYDOC_PBS_API_KEY_REF || "aws-sm:heydoc/pbs-api-key";
const API_BASE = (process.env.HEYDOC_PBS_API_BASE || "https://data-api-portal.health.gov.au/api/v3").replace(/\/$/, "");
const KEY_HEADER = process.env.HEYDOC_PBS_API_KEY_HEADER || "subscription-key";

/** Is a resolvable (non-placeholder) PBS subscription key available? Input-gated, fail-safe.
 * Never resolves the value here — hasSecret only probes. */
export function pbsSyncAvailable(keyRef = KEY_REF) {
  if (hasSecret(keyRef)) return { available: true };
  return { available: false, reason: `PBS subscription key not resolvable via secrets seam (ref '${keyRef}') — set it in the deploy secrets manager; unavailable in a bare dev process without the aws-sm backend registered` };
}

/**
 * Map one raw PBS API row → a validated PbsFormulary record. Tolerant of field-name
 * variants across PBS endpoints. Fail-closed: a row missing an item code or ingredient
 * THROWS (never writes a junk formulary record). Provenance is stamped to the PBS source.
 */
export function mapPbsItem(row, { version = "v0.1.0", effective_date = "2026-07-13" } = {}) {
  const pick = (...keys) => { for (const k of keys) if (row[k] != null && row[k] !== "") return row[k]; return undefined; };
  const pbs_item_code = pick("pbs_code", "li_item_id", "item_code", "pbsCode");
  const ingredient = pick("drug_name", "li_drug_name", "ingredient", "drug");
  if (!pbs_item_code || !ingredient) throw new Error(`pharm-pbs-sync: row missing pbs_item_code or ingredient (got code=${pbs_item_code}, ingredient=${ingredient})`);
  const authRaw = pick("authority_required", "authority", "restriction_flag");
  const pbs_authority_required = authRaw === true || authRaw === "A" || authRaw === "authority_required";
  const rec = {
    pbs_item_code: String(pbs_item_code),
    ingredient: String(ingredient).toLowerCase(),
    atc_code: pick("atc_code", "atc") ?? null,
    pbs_authority_required,
    prescriber_types: pick("prescriber_types") || [],
    provenance: {
      source: "PBS Public API v3",
      source_ref: "pbs-api-v3",
      authored_by: "PBS Public API v3 (Commonwealth open data, CC BY)",
      reviewed_by: null,
      review_status: "draft", // enters as draft like all store records — not clinician-attested
      version,
      effective_date,
    },
  };
  return validatePbsFormulary(rec); // throws if the mapped record is malformed
}

/**
 * Build the pbs-formulary dataset object from raw rows (pure — no I/O). mode is 'live' ONLY
 * for a genuine live pull; a fixture/dry-run build passes 'dry_run' or 'mock' so it can
 * never masquerade as live. Invalid rows are collected in `rejected`, not written.
 */
export function buildPbsDataset(rows, { scheduleMonth = null, effective_date = "2026-07-13", mode = "dry_run" } = {}) {
  const version = scheduleMonth || "v0.1.0";
  const records = [];
  const rejected = [];
  rows.forEach((row, i) => {
    try { records.push(mapPbsItem(row, { version, effective_date })); }
    catch (e) { rejected.push({ index: i, reason: e.message }); }
  });
  const dataset = {
    dataset_version: `pharm-pbs-formulary:${version}-dev`,
    capability: "pbs",
    status: "PBS Public API v3 cached pull (Commonwealth open data, CC BY). Factual formulary/subsidy data — NOT a clinical-judgement dataset and NOT patient-facing; -dev until FL-30 Step 5.",
    generated: null, // stamped at commit time by the operator (Date.now avoided in-repo)
    source_pull: { upstream: "pbs-api-v3", mode, schedule_month: scheduleMonth, item_count: records.length, pulled_utc: null },
    attestation: {
      method: "source_authoritative_open_data",
      clinical_sign_off: false,
      regulatory_sign_off: false,
      reviewer_id: null,
      attested_utc: null,
      recorded_by: "scripts/pharm-pbs-sync.mjs",
      statement: "Authoritative Commonwealth open data (PBS Public API v3, CC BY). Formulary facts do not require clinician attestation, but the dataset is not patient-facing until FL-30 Step 5.",
      scope: `${records.length} PBS items`,
    },
    records,
    records_checksum: checksumRecords(records),
  };
  return { dataset, records, rejected };
}

/** Fetch raw PBS item rows from the live API. Sequential + minimal (rate-limit respect).
 * Key resolved through the seam at call time and passed only as a header — never returned. */
async function fetchPbsItems({ fetchImpl = fetch, key, base = API_BASE, limit = 500 }) {
  const url = `${base}/items?limit=${limit}`;
  const res = await fetchImpl(url, { headers: { [KEY_HEADER]: key, accept: "application/json" } });
  if (!res.ok) throw new Error(`pharm-pbs-sync: PBS API responded ${res.status} ${res.statusText}`);
  const body = await res.json();
  const rows = Array.isArray(body) ? body : body.data || body.items || body._embedded?.items || [];
  if (!Array.isArray(rows)) throw new Error("pharm-pbs-sync: could not locate an items array in the PBS API response");
  return rows;
}

// ---- CLI ----
async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const avail = pbsSyncAvailable();
  if (!avail.available) {
    console.log(`pharm-pbs-sync: UNAVAILABLE — ${avail.reason}`);
    console.log("  (input-gated, fail-safe: nothing written, no data fabricated. The live pull runs where the deploy secrets backend is registered.)");
    return;
  }
  // Real pull. getSecret resolves the key inside the seam; we hold it only to pass as a header.
  const key = getSecret(KEY_REF);
  let rows;
  try {
    rows = await fetchPbsItems({ key });
  } catch (e) {
    console.error(`pharm-pbs-sync: live pull failed — ${e.message}`);
    console.error("  fail-closed: nothing written (no partial/fabricated formulary).");
    process.exit(1);
  }
  const { dataset, records, rejected } = buildPbsDataset(rows, { mode: "live" });
  console.log(`pharm-pbs-sync: pulled ${rows.length} rows → ${records.length} records (${rejected.length} rejected)`);
  if (dryRun) { console.log("pharm-pbs-sync: --dry-run, not writing"); return; }
  writeFileSync(OUT_PATH, JSON.stringify(dataset, null, 2) + "\n");
  console.log(`pharm-pbs-sync: wrote ${records.length} PBS items to pbs-formulary.json (mode=live)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv).catch((e) => { console.error(e); process.exit(1); });
