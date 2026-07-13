/**
 * Contract test for the PBS sync adapter (FL-30 Step 3, M4).
 *
 * Runs fully OFFLINE against a committed fixture (the synthea/mostly-ai precedent) — no
 * live pull, no subscription key needed. Asserts:
 *  - mapPbsItem tolerates PBS field-name variants and maps to a valid PbsFormulary record
 *    with PBS provenance;
 *  - a row missing an item code or ingredient is REJECTED (fail-closed, no junk record);
 *  - a fixture/dry-run build NEVER claims source_pull.mode='live' (no mock-as-live);
 *  - the dataset stays '-dev'-tagged and unsigned;
 *  - the sync is UNAVAILABLE (writes nothing) when the key ref cannot resolve (input-gated).
 * Run from repo root: node test/contract-pharm-pbs-sync.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mapPbsItem, buildPbsDataset, pbsSyncAvailable } from "../scripts/pharm-pbs-sync.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, "..", "authoring", "pharm", "fixtures", "pbs-sample.json"), "utf8"));

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// --- mapper handles field-name variants ---
const amox = mapPbsItem(fixture.rows[0]);
expect(amox.pbs_item_code === "8134B" && amox.ingredient === "amoxicillin", "maps pbs_code + drug_name");
expect(amox.atc_code === "J01CA04" && amox.pbs_authority_required === false, "maps atc + authority=false");
expect(amox.provenance.source_ref === "pbs-api-v3" && amox.provenance.review_status === "draft", "PBS provenance stamped, enters as draft");

const oxy = mapPbsItem(fixture.rows[2]);
expect(oxy.pbs_authority_required === true, "authority flag (restriction_flag 'A') → authority_required true");

const warf = mapPbsItem(fixture.rows[3]);
expect(warf.pbs_item_code === "1234K" && warf.ingredient === "warfarin", "maps li_item_id + li_drug_name variants");

// --- fail-closed on a junk row ---
expect(throws(() => mapPbsItem({ atc_code: "X" })), "row with no item code / ingredient is rejected");

// --- build: no mock-as-live; -dev + unsigned ---
const { dataset, records, rejected } = buildPbsDataset(fixture.rows, { mode: "dry_run", scheduleMonth: "2026-07" });
expect(records.length === 4 && rejected.length === 0, "all fixture rows map");
expect(dataset.source_pull.mode === "dry_run", "fixture build does NOT claim mode='live' (no mock-as-live)");
expect(dataset.dataset_version.endsWith("-dev"), "PBS dataset stays -dev-tagged");
expect(dataset.capability === "pbs" && dataset.attestation.clinical_sign_off === false, "PBS dataset is capability:pbs and unsigned");
expect(typeof dataset.records_checksum === "string" && dataset.records_checksum.length === 64, "records_checksum is a sha256 hex");

// --- input-gated: unresolvable key → unavailable (fail-safe) ---
const avail = pbsSyncAvailable("aws-sm:heydoc/definitely-not-set-" + "x".repeat(4));
expect(avail.available === false, "unresolvable key ref → sync unavailable (input-gated)");

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-pharm-pbs-sync FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-pharm-pbs-sync: OK");
