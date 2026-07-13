/**
 * Contract test for the pharmacology datastore (FL-30 Step 3, M1).
 *
 * Asserts the envelope + governance discipline of every capability dataset and the
 * clinical data-source registry — BEFORE any clinical content is authored:
 *  - each dataset carries dataset_version, capability, and a full attestation block;
 *  - an UNSIGNED dataset (clinical_sign_off:false) MUST stay '-dev'-tagged — it cannot
 *    silently read as a promoted/live source (mock-tagging discipline);
 *  - records is always an array, and any record present carries a provenance block
 *    (Guardrail 5 — an anonymous clinical fact cannot sit in the store);
 *  - data-sources.json: every source has a valid licence_status + use_restriction, and
 *    ids are unique. structure_only sources are the copyright-restricted ones.
 * Run from repo root: node test/contract-pharm-datastore.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProvenance } from "../mcp/servers/pharmacology/domain/model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");
const load = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

const DATASETS = [
  { file: "nti-register.json", capability: "nti" },
  { file: "drug-interactions.json", capability: "interactions" },
  { file: "renal-rules.json", capability: "renal" },
  { file: "allergy-cross-reactivity.json", capability: "allergy" },
  { file: "au-scheduling.json", capability: "scheduling" },
  { file: "dose-guidance.json", capability: "dose_guidance" },
  { file: "pbs-formulary.json", capability: "pbs" },
];

for (const { file, capability } of DATASETS) {
  let ds;
  try { ds = load(file); } catch (e) { errors.push(`${file}: unreadable/invalid JSON: ${e.message}`); continue; }
  expect(typeof ds.dataset_version === "string" && ds.dataset_version.length > 0, `${file}: dataset_version missing`);
  expect(ds.capability === capability, `${file}: capability should be '${capability}', got '${ds.capability}'`);
  const att = ds.attestation;
  expect(att && typeof att === "object", `${file}: attestation block missing`);
  if (att) {
    expect(typeof att.clinical_sign_off === "boolean", `${file}: attestation.clinical_sign_off must be boolean`);
    expect(typeof att.regulatory_sign_off === "boolean", `${file}: attestation.regulatory_sign_off must be boolean`);
    expect(typeof att.scope === "string", `${file}: attestation.scope missing`);
    // Mock-tagging discipline: unsigned → must be -dev-tagged (never reads as promoted/live).
    if (att.clinical_sign_off === false) {
      expect(/-dev(\b|$|:)/.test(ds.dataset_version) || ds.dataset_version.endsWith("-dev"), `${file}: unsigned dataset must be '-dev'-tagged (got ${ds.dataset_version})`);
    }
  }
  expect(Array.isArray(ds.records), `${file}: records must be an array`);
  // Any record present must carry provenance (Guardrail 5). Empty in M1 skeletons.
  for (const [i, rec] of (ds.records || []).entries()) {
    if (!rec || typeof rec !== "object" || !rec.provenance) { errors.push(`${file}: record[${i}] has no provenance block`); continue; }
    try { validateProvenance(rec.provenance); } catch (e) { errors.push(`${file}: record[${i}] provenance invalid: ${e.message}`); }
  }
}

// --- data-source registry ---
let reg;
try { reg = load("data-sources.json"); } catch (e) { errors.push(`data-sources.json: unreadable: ${e.message}`); }
if (reg) {
  expect(typeof reg.registry_version === "string", "data-sources.json: registry_version missing");
  expect(Array.isArray(reg.sources) && reg.sources.length > 0, "data-sources.json: sources[] must be non-empty");
  const LICENCE_STATUS = ["verified", "pending", "copyleft_reference_only", "first_party"];
  const USE = ["content_ingest", "structure_only"];
  const ids = new Set();
  for (const s of reg.sources || []) {
    expect(typeof s.id === "string" && s.id.length > 0, `data-source has no id`);
    expect(!ids.has(s.id), `data-source id '${s.id}' is duplicated`);
    ids.add(s.id);
    expect(typeof s.licence === "string" && s.licence.length > 0, `data-source '${s.id}' has no licence`);
    expect(LICENCE_STATUS.includes(s.licence_status), `data-source '${s.id}' has invalid licence_status '${s.licence_status}'`);
    expect(USE.includes(s.use_restriction), `data-source '${s.id}' has invalid use_restriction '${s.use_restriction}'`);
  }
  // The copyright-restricted sources must be structure_only (FL-30 Guardrail 1).
  const mustBeStructureOnly = ["stopp-start-v3", "tdm-reference", "drugbank-nti-category", "ausdi-structure"];
  for (const id of mustBeStructureOnly) {
    const s = (reg.sources || []).find((x) => x.id === id);
    expect(s && s.use_restriction === "structure_only", `copyright-restricted source '${id}' must be use_restriction:'structure_only'`);
  }
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-pharm-datastore FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-pharm-datastore: OK");
