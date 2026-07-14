#!/usr/bin/env node
/**
 * pharm-pbs-sync — cached ingest of the PBS Public API v3 formulary into the datastore
 * (FL-30 Step 3, M4; full-catalogue pull added when the public tier was confirmed usable).
 *
 * The PBS Schedule is Commonwealth OPEN DATA (CC BY, redistribute-OK / no-modify — the
 * copyright statement returned by the API is RETAINED in the dataset). The PUBLIC tier needs
 * no registration: a shared public subscription key (published openly in the PBS docs + the
 * MIT reference client) is passed via the `subscription-key` header. A registered key can be
 * supplied instead through the fail-closed secrets seam (HEYDOC_PBS_API_KEY_REF).
 *
 * WHY CACHED, NOT PER-CHECK LIVE: the API is designed for download-and-store and is hard
 * rate-limited (~1 req/20s, shared). It must never be called inside a real-time PharmCheck —
 * we sync a local copy monthly and read that.
 *
 * KEY DISCIPLINE: the key is NEVER hardcoded in this file and NEVER printed/logged. It comes
 * from the secrets seam OR the HEYDOC_PBS_PUBLIC_KEY env var (the public tier). Even the
 * public key is passed only as a request header.
 *
 * Zero repo dependency — Node 20 built-ins (global fetch).
 *
 * Usage: node scripts/pharm-pbs-sync.mjs [--dry-run] [--page-limit=N] [--max-pages=N]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSecret, hasSecret } from "../integration/secrets.js";
import { checksumRecords } from "./pharm-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "mcp", "servers", "pharmacology", "data", "pbs-formulary.json");

const KEY_REF = process.env.HEYDOC_PBS_API_KEY_REF || "aws-sm:heydoc/pbs-api-key";
const API_BASE = (process.env.HEYDOC_PBS_API_BASE || "https://data-api.health.gov.au/pbs/api/v3").replace(/\/$/, "");
const KEY_HEADER = process.env.HEYDOC_PBS_API_KEY_HEADER || "subscription-key";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve the subscription key. Prefers a registered key via the secrets seam; falls back to
 * the PUBLIC tier key (HEYDOC_PBS_PUBLIC_KEY). Returns {available, key?, tier?, reason?}.
 * The value is never returned to logs — callers pass it straight to a request header.
 */
export function resolveKey({ keyRef = KEY_REF, env = process.env } = {}) {
  if (hasSecret(keyRef)) return { available: true, key: getSecret(keyRef), tier: "registered" };
  const pub = (env.HEYDOC_PBS_PUBLIC_KEY || "").trim();
  if (pub && !pub.startsWith("<") && !pub.includes("example.invalid")) return { available: true, key: pub, tier: "public" };
  return { available: false, reason: `no PBS key: registered ref '${keyRef}' unresolvable and HEYDOC_PBS_PUBLIC_KEY unset (public tier)` };
}

/** Non-throwing availability probe (registered seam OR public env key). */
export function pbsSyncAvailable(keyRef = KEY_REF, env = process.env) {
  const r = resolveKey({ keyRef, env });
  return r.available ? { available: true, tier: r.tier } : { available: false, reason: r.reason };
}

/**
 * Extract the primary ATC (most specific / highest atc_priority_pct) from an item-overview
 * row's nested `item_atcs`. Returns {atc_code, atc_level, atc_description} or nulls.
 */
function extractAtc(row) {
  const atcs = Array.isArray(row.item_atcs) ? row.item_atcs : [];
  const primary = atcs
    .slice()
    .sort((a, b) => (b.atc_priority_pct || 0) - (a.atc_priority_pct || 0) || (b.atc?.atc_level || 0) - (a.atc?.atc_level || 0))
    .map((a) => a.atc)
    .find(Boolean);
  if (primary) return { atc_code: primary.atc_code ?? null, atc_level: primary.atc_level ?? null, atc_description: primary.atc_description ?? null };
  // Flat fallback (some endpoints/fixtures carry atc_code directly).
  const flat = row.atc_code ?? row.atc ?? null;
  return { atc_code: flat, atc_level: null, atc_description: null };
}

/**
 * The normalized PBS authority partition — mutually exclusive, exactly one per item, so a
 * count over items sums to the total. Ranked least→most restrictive.
 */
export const AUTHORITY_CATEGORIES = ["unrestricted", "restricted_benefit", "authority_streamlined", "authority_required"];
const AUTH_RANK = { unrestricted: 0, restricted_benefit: 1, authority_streamlined: 2, authority_required: 3 };

/** Normalize a raw PBS authority_method → an authority_category value. */
export function normalizeAuthorityCategory(method) {
  const s = String(method || "").toUpperCase();
  if (!s) return "unrestricted";
  if (s.includes("AUTHORITY_REQUIRED")) return "authority_required";
  if (s.includes("STREAMLINED")) return "authority_streamlined";
  if (s.includes("RESTRICTED")) return "restricted_benefit";
  return "restricted_benefit"; // any other restriction present → at least restricted
}

/**
 * Derive the authority enrichment for one item. A PBS item can carry several restrictions
 * (different indications) with different authority methods. The GOVERNING category is the
 * LEAST restrictive available pathway — of great beneficence to the patient who qualifies for
 * it: the easiest route to access must not be masked by a stricter listing that applies to a
 * different indication (clinician ruling KL). ALL distinct pathways are retained in
 * `authority_categories` so nothing is hidden. `authority_method` and `written` follow the
 * governing (least-restrictive) restriction. Falls back to a flat field for fixtures.
 */
function extractAuthority(row) {
  const restrictions = Array.isArray(row.item_restrictions) ? row.item_restrictions : [];
  if (restrictions.length) {
    const per = restrictions.map((r) => ({
      cat: normalizeAuthorityCategory(r.restriction_text?.authority_method),
      method: r.restriction_text?.authority_method ?? null,
      written: r.restriction_text?.written_authority_required === "Y",
    }));
    const governing = per.reduce((best, x) => (AUTH_RANK[x.cat] < AUTH_RANK[best.cat] ? x : best));
    const authority_categories = [...new Set(per.map((x) => x.cat))].sort((a, b) => AUTH_RANK[a] - AUTH_RANK[b]);
    return {
      authority_category: governing.cat, // least-restrictive (patient-beneficial pathway)
      authority_categories, // full register of every pathway the item has (least → most)
      written_authority_required: governing.written,
      authority_method: governing.method,
      restricted: governing.cat !== "unrestricted",
    };
  }
  // Flat fallback (fixtures): authority_method, else authority_required/authority/restriction_flag.
  const mk = (c, method) => ({ authority_category: c, authority_categories: [c], written_authority_required: false, authority_method: method, restricted: c !== "unrestricted" });
  if (row.authority_method) return mk(normalizeAuthorityCategory(row.authority_method), row.authority_method);
  const flat = row.authority_required ?? row.authority ?? row.restriction_flag;
  const c = flat === true || flat === "A" || flat === "authority_required" ? "authority_required" : flat ? "restricted_benefit" : "unrestricted";
  return mk(c, c === "unrestricted" ? null : c === "authority_required" ? "AUTHORITY_REQUIRED" : "RESTRICTED");
}

/**
 * Map one raw PBS row (item-overview or items shape) → a curated formulary record enriched
 * with ATC + authority. Tolerant of field-name variants and of nested-vs-flat ATC/authority.
 * Fail-closed: a row missing a PBS code or drug name THROWS (never a junk record). Governance
 * is DATASET-LEVEL for this bulk open-data listing (see buildPbsDataset), not per-record.
 */
export function mapPbsItem(row) {
  const pick = (...keys) => { for (const k of keys) if (row[k] != null && row[k] !== "") return row[k]; return undefined; };
  const pbs_item_code = pick("pbs_code", "li_item_id", "item_code", "pbsCode");
  const ingredient = pick("drug_name", "li_drug_name", "ingredient", "drug");
  if (!pbs_item_code || !ingredient) throw new Error(`pharm-pbs-sync: row missing pbs_item_code or ingredient (code=${pbs_item_code}, ingredient=${ingredient})`);
  return {
    pbs_item_code: String(pbs_item_code),
    ingredient: String(ingredient).toLowerCase(),
    form: pick("li_form", "schedule_form") ?? null,
    brand_name: pick("brand_name") ?? null,
    program_code: pick("program_code") ?? null,
    benefit_type_code: pick("benefit_type_code") ?? null,
    manner_of_administration: pick("manner_of_administration", "moa_preferred_term") ?? null,
    ...extractAtc(row),
    ...extractAuthority(row),
    // PBS 60-day dispensing eligibility (Increased Maximum Dispensed Quantity, IMDQ60).
    "60day_eligible": row.policy_applied_imdq60_flag === "Y" || row["60day_eligible"] === true,
  };
}

/**
 * Build the pbs-formulary dataset from raw rows (pure — no I/O). Governance is DATASET-LEVEL:
 * one attestation + source_pull + retained copyright cover the whole bulk open-data listing
 * (per-record provenance would triple the file for no traceability gain — this is authoritative
 * gov data, not clinician-authored clinical facts). mode is 'live' ONLY for a genuine live
 * pull; a fixture/dry-run build passes 'dry_run' so it can never masquerade as live.
 */
export function buildPbsDataset(rows, { scheduleMonth = null, mode = "dry_run", copyright = null, total = null } = {}) {
  const version = scheduleMonth || "v0.1.0";
  const records = [];
  const rejected = [];
  rows.forEach((row, i) => { try { records.push(mapPbsItem(row)); } catch (e) { rejected.push({ index: i, reason: e.message }); } });
  const dataset = {
    dataset_version: `pharm-pbs-formulary:${version}-dev`,
    capability: "pbs",
    status: "PBS Public API v3 cached pull (Commonwealth OPEN DATA, CC BY — copyright retained below). Bulk formulary listing, NOT a clinical-judgement dataset and NOT patient-facing; -dev until FL-30 Step 5.",
    generated: null,
    copyright: copyright || ["Copyright (c) Department of Health, Commonwealth of Australia. Redistributed under the PBS open-data terms; content unmodified."],
    source_pull: { upstream: "pbs-api-v3", endpoint: "/item-overview?get_latest_schedule_only=true", enrichment: "ATC (item_atcs) + authority flags (item_restrictions)", mode, schedule_month: scheduleMonth, item_count: records.length, total_records: total, rejected: rejected.length, pulled_utc: null },
    attestation: {
      method: "source_authoritative_open_data",
      clinical_sign_off: false,
      regulatory_sign_off: false,
      reviewer_id: null,
      attested_utc: null,
      recorded_by: "scripts/pharm-pbs-sync.mjs",
      statement: "Authoritative Commonwealth open data (PBS Public API v3). Formulary facts need no clinician attestation; dataset-level provenance covers the bulk listing. Not patient-facing until FL-30 Step 5.",
      scope: `${records.length} PBS items (current schedule)`,
    },
    records,
    records_checksum: checksumRecords(records),
  };
  return { dataset, records, rejected };
}

/**
 * Fetch EVERY PBS item across the current schedule, paginated + rate-limit-aware. Discovers
 * the effective page size and total from _meta; sleeps ~21s between pages (1 req/20s) and
 * backs off on 429 using x-rate-limit-reset. Returns { rows, copyright, total }.
 */
export async function fetchAllPbsItems({ fetchImpl = fetch, key, base = API_BASE, endpoint = "item-overview", pageLimit = 1000, maxPages = 300, sleepMs = 21000, log = () => {} }) {
  const rows = [];
  let copyright = null, total = null, effectiveLimit = pageLimit;
  for (let page = 1; page <= maxPages; page++) {
    const url = `${base}/${endpoint}?get_latest_schedule_only=true&limit=${pageLimit}&page=${page}`;
    let res, attempts = 0;
    while (true) {
      res = await fetchImpl(url, { headers: { [KEY_HEADER]: key, accept: "application/json" } });
      if (res.status !== 429) break;
      if (++attempts > 6) throw new Error("PBS API rate-limited repeatedly (429)");
      const reset = Number(res.headers.get("x-rate-limit-reset")) || 21;
      log(`  page ${page}: 429 — waiting ${reset + 1}s`); await sleep((reset + 1) * 1000);
    }
    if (!res.ok) throw new Error(`PBS API ${res.status} ${res.statusText} on page ${page}`);
    const body = await res.json();
    if (!copyright && body._meta?.info?.messages) copyright = body._meta.info.messages.filter((m) => m.type === "copyright").flatMap((m) => m.content);
    if (total == null) total = body._meta?.total_records ?? null;
    if (body._meta?.limit) effectiveLimit = body._meta.limit;
    const data = body.data || body.items || [];
    rows.push(...data);
    log(`  page ${page}: +${data.length} (total so far ${rows.length}${total ? "/" + total : ""}); effective limit ${effectiveLimit}; rate-remaining ${res.headers.get("x-rate-limit-remaining")}`);
    if (data.length < effectiveLimit) break;      // last (short) page
    if (total != null && rows.length >= total) break;
    await sleep(sleepMs);                          // respect ~1 req/20s
  }
  return { rows, copyright, total };
}

// ---- CLI ----
async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const pageLimit = Number((argv.find((a) => a.startsWith("--page-limit=")) || "").split("=")[1]) || 1000;
  const maxPages = Number((argv.find((a) => a.startsWith("--max-pages=")) || "").split("=")[1]) || 300;
  const avail = pbsSyncAvailable();
  if (!avail.available) {
    console.log(`pharm-pbs-sync: UNAVAILABLE — ${avail.reason}`);
    console.log("  (input-gated, fail-safe: nothing written, no data fabricated.)");
    return;
  }
  const { key, tier } = resolveKey();
  console.log(`pharm-pbs-sync: pulling full PBS /items catalogue via the ${tier} tier (rate-limited ~1 req/20s)…`);
  let rows, copyright, total;
  try { ({ rows, copyright, total } = await fetchAllPbsItems({ key, pageLimit, maxPages, log: (m) => console.log(m) })); }
  catch (e) { console.error(`pharm-pbs-sync: live pull failed — ${e.message}`); console.error("  fail-closed: nothing written."); process.exit(1); }
  const { dataset, records, rejected } = buildPbsDataset(rows, { mode: "live", copyright, total });
  console.log(`pharm-pbs-sync: pulled ${rows.length} rows → ${records.length} records (${rejected.length} rejected; total_records ${total})`);
  if (dryRun) { console.log("pharm-pbs-sync: --dry-run, not writing"); return; }
  writeFileSync(OUT_PATH, JSON.stringify(dataset, null, 2) + "\n");
  console.log(`pharm-pbs-sync: wrote ${records.length} PBS items to pbs-formulary.json (mode=live, ${tier} tier)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv).catch((e) => { console.error(e); process.exit(1); });
