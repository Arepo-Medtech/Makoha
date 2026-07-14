/**
 * Contract test for the PBS sync adapter (FL-30 Step 3, M4).
 *
 * Runs fully OFFLINE against a committed fixture (the synthea/mostly-ai precedent) — no live
 * pull, no key needed. Asserts:
 *  - mapPbsItem tolerates PBS field-name variants → a curated formulary record;
 *  - a row missing a code/ingredient is REJECTED (fail-closed, no junk record);
 *  - buildPbsDataset carries DATASET-LEVEL governance (attestation + source_pull + retained
 *    copyright) and never claims mode='live' on a fixture/dry-run build (no mock-as-live);
 *  - the dataset stays '-dev'-tagged and unsigned;
 *  - the sync is UNAVAILABLE when no key resolves, and AVAILABLE via the public-tier env key.
 * Run from repo root: node test/contract-pharm-pbs-sync.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mapPbsItem, buildPbsDataset, pbsSyncAvailable, AUTHORITY_CATEGORIES } from "../scripts/pharm-pbs-sync.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, "..", "authoring", "pharm", "fixtures", "pbs-sample.json"), "utf8"));

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// --- mapper handles field-name variants → curated record ---
const amox = mapPbsItem(fixture.rows[0]);
expect(amox.pbs_item_code === "8134B" && amox.ingredient === "amoxicillin", "maps pbs_code + drug_name");
expect("form" in amox && "brand_name" in amox && "benefit_type_code" in amox, "curated record carries formulary fields");
// 60-day dispensing (IMDQ60) eligibility
expect(amox["60day_eligible"] === false, "policy_applied_imdq60_flag=N -> 60day_eligible false");
expect(mapPbsItem(fixture.rows[4])["60day_eligible"] === true, "policy_applied_imdq60_flag=Y -> 60day_eligible true");
const warf = mapPbsItem(fixture.rows[3]);
expect(warf.pbs_item_code === "1234K" && warf.ingredient === "warfarin", "maps li_item_id + li_drug_name variants");

// --- ATC enrichment (nested item_atcs + flat fallback) ---
expect(amox.atc_code === "J01CA04" && amox.atc_level === 5, "extracts nested ATC (item_atcs)");
expect(mapPbsItem(fixture.rows[2]).atc_code === "A10BA02", "extracts flat atc_code fallback");
expect(warf.atc_code === "B01AA03", "extracts flat atc fallback");

// --- authority enrichment: normalized authority_category partition (+ written flag) ---
const oxy = mapPbsItem(fixture.rows[1]);
expect(oxy.authority_category === "authority_required" && oxy.written_authority_required === true && oxy.restricted === true, "nested AUTHORITY_REQUIRED → authority_category + written flag");
expect(oxy.authority_method === "AUTHORITY_REQUIRED", "captures the governing authority_method");
expect(amox.authority_category === "unrestricted" && amox.restricted === false, "no restriction → unrestricted");
expect(mapPbsItem(fixture.rows[2]).authority_category === "unrestricted", "flat authority_required:false → unrestricted");
// The category is one of the mutually-exclusive partition values (so counts sum to the total).
expect(AUTHORITY_CATEGORIES.includes(oxy.authority_category), "authority_category is a valid partition value");
expect(Array.isArray(oxy.authority_categories) && oxy.authority_categories.length === 1, "single-restriction item lists one pathway");

// --- multi-restriction item: governing = LEAST restrictive (patient-beneficial), full set retained ---
const multi = mapPbsItem(fixture.rows[4]);
expect(multi.authority_category === "restricted_benefit", "multi-restriction item governs by the LEAST-restrictive pathway (RESTRICTED over AUTHORITY_REQUIRED)");
expect(JSON.stringify(multi.authority_categories) === JSON.stringify(["restricted_benefit", "authority_required"]), "all pathways retained, least → most restrictive");
expect(multi.written_authority_required === false, "written follows the governing (least-restrictive) pathway, which needs none");
expect(multi.authority_method === "RESTRICTED", "authority_method follows the governing pathway");

// --- fail-closed on a junk row ---
expect(throws(() => mapPbsItem({ atc_code: "X" })), "row with no code/ingredient is rejected");

// --- build: dataset-level governance; no mock-as-live; -dev + unsigned ---
const { dataset, records, rejected } = buildPbsDataset(fixture.rows, { mode: "dry_run", scheduleMonth: "2026-07", total: 5 });
expect(records.length === 5 && rejected.length === 0, "all fixture rows map");
expect(dataset.source_pull.mode === "dry_run", "fixture build does NOT claim mode='live' (no mock-as-live)");
expect(Array.isArray(dataset.copyright) && dataset.copyright.length > 0, "dataset retains a copyright statement (CC BY)");
expect(dataset.dataset_version.endsWith("-dev"), "PBS dataset stays -dev-tagged");
expect(dataset.capability === "pbs" && dataset.attestation.clinical_sign_off === false, "PBS dataset is capability:pbs and unsigned");
expect(!("provenance" in records[0]), "bulk PBS records use dataset-level provenance, not per-record");
expect(typeof dataset.records_checksum === "string" && dataset.records_checksum.length === 64, "records_checksum is a sha256 hex");

// --- key resolution: unavailable with no key; available via public-tier env ---
expect(pbsSyncAvailable("aws-sm:heydoc/definitely-not-set", {}).available === false, "no key → unavailable (input-gated)");
expect(pbsSyncAvailable("aws-sm:heydoc/definitely-not-set", { HEYDOC_PBS_PUBLIC_KEY: "public-tier-key" }).available === true, "public-tier env key → available");

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-pharm-pbs-sync FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-pharm-pbs-sync: OK");
