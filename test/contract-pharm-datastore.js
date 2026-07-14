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
  { file: "serious-adverse-effects.json", capability: "serious_adverse_effects" },
  { file: "strong-contraindications.json", capability: "strong_contraindications" },
  { file: "precautions.json", capability: "precautions" },
  { file: "pharmacokinetics.json", capability: "pharmacokinetics" },
  { file: "pharmacodynamics.json", capability: "pharmacodynamics" },
  { file: "clinical-uses.json", capability: "clinical_uses" },
  { file: "formulations.json", capability: "formulations" },
  { file: "dose-guidance.json", capability: "dose_guidance" },
  { file: "dose-evidence.json", capability: "dose_evidence" },
  { file: "administration-handling.json", capability: "administration_handling" },
  { file: "tdm-parameters.json", capability: "tdm_parameters" },
  { file: "warning-labels.json", capability: "warning_labels" },
  { file: "counselling-points.json", capability: "counselling_points" },
  { file: "pregnancy-risk.json", capability: "pregnancy_risk" },
  { file: "hepatic.json", capability: "hepatic" },
  { file: "dose-evidence-review-queue.json", capability: "dose_evidence_review_queue" },
  { file: "pbs-formulary.json", capability: "pbs" },
];

// Capabilities that are bulk PBS open data with DATASET-LEVEL governance (no per-record provenance).
const BULK_OPEN_DATA = new Set(["pbs", "formulations"]);

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
    // Signed-dataset honesty: a clinically-signed dataset that has since had DRAFT records
    // appended (e.g. via ingest) MUST flag has_unsigned_additions, so the coarse
    // clinical_sign_off flag can never silently over-claim (per-record review_status is the
    // authoritative gate; this keeps the dataset-level signal truthful).
    if (att.clinical_sign_off === true && !BULK_OPEN_DATA.has(capability)) {
      const hasUnsigned = (ds.records || []).some((r) => r && r.provenance && r.provenance.review_status !== "approved");
      if (hasUnsigned) expect(att.has_unsigned_additions === true, `${file}: clinical_sign_off:true but contains draft records — must set attestation.has_unsigned_additions:true`);
    }
  }
  expect(Array.isArray(ds.records), `${file}: records must be an array`);
  // Clinical-judgement datasets: every record carries provenance (Guardrail 5). The PBS
  // formulary is bulk open-data with DATASET-LEVEL governance (attestation + source_pull +
  // retained copyright), so its records are exempt from the per-record provenance rule.
  if (BULK_OPEN_DATA.has(capability)) {
    if ((ds.records || []).length > 0) {
      expect(ds.source_pull && typeof ds.source_pull === "object", `${file}: populated bulk-open-data dataset must carry a source_pull block`);
      expect(Array.isArray(ds.copyright) && ds.copyright.length > 0, `${file}: populated bulk-open-data dataset must retain a copyright statement`);
    }
  } else {
    for (const [i, rec] of (ds.records || []).entries()) {
      if (!rec || typeof rec !== "object" || !rec.provenance) { errors.push(`${file}: record[${i}] has no provenance block`); continue; }
      try { validateProvenance(rec.provenance); } catch (e) { errors.push(`${file}: record[${i}] provenance invalid: ${e.message}`); }
    }
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
  const mustBeStructureOnly = ["stopp-start-v3", "tdm-reference", "drugbank-nti-category", "ausdi-structure", "apf22"];
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
