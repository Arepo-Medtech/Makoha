/**
 * Contract test for FL-30 Step 2 (C2 + C3): the internal clinical domain model and the
 * PharmDataSource seam.
 *
 * Asserts:
 *  - every domain entity requires a full provenance block (Guardrail 5) — an anonymous
 *    clinical fact cannot validate;
 *  - CdsEnvelope.required_human_review cannot be false (no auto-cleared gate, Guardrail 2);
 *  - the seam selects the right source per PHARM_CDS flag;
 *  - the synthetic source is functional (reads the reference knowledge) and HONEST — while
 *    mock-backed it reports mode 'mock' and a self-developed-mock upstream, never 'live'
 *    and never a commercial-vendor name (no mock-as-live, Guardrail 4);
 *  - the LicensedFeedSource stub is unavailable and fails closed on every getter.
 * Run from repo root: node test/contract-pharm-data-source.js
 */
import {
  validateProvenance,
  validateDrugProduct,
  validateNti,
  validateInteraction,
  validateRenalDosing,
  validateCdsEnvelope,
} from "../mcp/servers/pharmacology/domain/model.js";
import {
  PharmDataSource,
  SyntheticSelfDevelopedSource,
  LicensedFeedSource,
  selectPharmDataSource,
} from "../mcp/servers/pharmacology/sources/pharm-data-source.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const goodProv = {
  source: "SUSMP Poisons Standard",
  source_ref: "F2024L00000",
  authored_by: "Ken Lee",
  reviewed_by: null,
  review_status: "draft",
  version: "v0.1.0",
  effective_date: "2026-07-13",
};

// --- Domain model: provenance mandatory ---
expect(!!validateProvenance(goodProv), "valid provenance validates");
expect(throws(() => validateProvenance({ ...goodProv, source: undefined })), "provenance without source is rejected");
expect(throws(() => validateProvenance({ ...goodProv, review_status: "approved-ish" })), "provenance with a bad review_status is rejected");

expect(!!validateDrugProduct({ ingredient: "warfarin", synonyms: ["Coumadin"], provenance: goodProv }), "drug product with provenance validates");
expect(throws(() => validateDrugProduct({ ingredient: "warfarin" })), "drug product WITHOUT provenance is rejected (Guardrail 5)");

expect(!!validateNti({ ingredient: "lithium", is_nti: true, rationale: "narrow index; toxicity risk", therapeutic_interval: "0.4-0.8 mmol/L", provenance: goodProv }), "NTI record validates");
expect(throws(() => validateNti({ ingredient: "lithium", is_nti: true, rationale: "x", provenance: goodProv })), "NTI rationale too short is rejected");

expect(!!validateInteraction({ interaction_kind: "drug_drug", mechanism_category: "drug_drug", subject: "warfarin", object: "ibuprofen", severity: "critical", mechanism_class: "additive bleeding risk", management_category: "avoid", evidence_tier: "guideline", provenance: goodProv }), "interaction validates");
expect(!!validateRenalDosing({ ingredient: "metformin", action: "renal_contraindicated", contraindicated_below_egfr: 30, provenance: goodProv }), "renal dosing validates");

// --- CDS envelope: no auto-cleared gate ---
expect(!!validateCdsEnvelope({ alert_level: "WARN", machine_rationale: "renal adjustment advised", required_human_review: true, provenance_refs: ["F2024L00000"] }), "CDS envelope with required_human_review:true validates");
expect(throws(() => validateCdsEnvelope({ alert_level: "PASS", machine_rationale: "ok", required_human_review: false })), "CDS envelope with required_human_review:false is rejected (Guardrail 2)");

// --- Seam: interface is abstract ---
expect(throws(() => new PharmDataSource().available()), "base PharmDataSource methods throw (abstract interface)");

// --- Seam: selection by flag ---
expect(selectPharmDataSource({}) instanceof SyntheticSelfDevelopedSource, "default (EMPTY) selects the synthetic source");
expect(selectPharmDataSource({ HEYDOC_PHARM_CDS: "SYNTHETIC_SELF_DEVELOPED" }) instanceof SyntheticSelfDevelopedSource, "SYNTHETIC_SELF_DEVELOPED selects the synthetic source");
expect(selectPharmDataSource({ HEYDOC_PHARM_CDS: "FILLED" }) instanceof LicensedFeedSource, "FILLED selects the licensed-feed source");

// --- Synthetic source: functional + honest ---
const syn = new SyntheticSelfDevelopedSource({ selfDeveloped: true });
expect(syn.available().available === true, "synthetic source is available");
expect(syn.getAllergyGroup("amoxicillin") === "beta_lactam", "synthetic source resolves allergy group");
expect(syn.getAllergyGroup("paracetamol") === null, "synthetic source returns null for a drug with no group");
expect(syn.getInteractions("warfarin").length > 0, "synthetic source returns warfarin interactions");
expect(syn.getRenalRule("metformin") && syn.getRenalRule("metformin").action === "renal_contraindicated", "synthetic source returns the metformin renal rule");
expect(syn.getSchedule("oxycodone") === "S8", "synthetic source resolves S8 schedule");
expect(syn.getSchedule("unlisted-drug") === "unknown", "synthetic source returns 'unknown' for an unmapped drug");
// M5 repoint: now reads the curated clinician-signed datastore (NTI is store-only).
expect(syn.datastoreBacked === true, "synthetic source now reads the curated signed datastore");
expect(syn.getNti("lithium") && syn.getNti("lithium").is_nti === true, "synthetic source resolves NTI status from the signed store");
expect(syn.getNti("paracetamol") === null, "synthetic source returns null NTI for a non-NTI drug");
// HONEST receipts — signed but NOT yet Step-5-validated, so never 'live', never a vendor name (Guardrail 4).
expect(syn.backingIsMock === true, "synthetic source is not yet Step-5-validated (backingIsMock true)");
expect(syn.receiptMode() === "mock", "unvalidated synthetic source stamps mode 'mock', never 'live'");
expect(/^heydoc-pharm-synthetic-dev:/.test(syn.receiptUpstream()), "datastore-backed upstream is self-developed + dev-marked, not 'live' and not a commercial-vendor name");

// --- Licensed feed stub: unavailable + fails closed ---
const lic = new LicensedFeedSource();
expect(lic.available().available === false, "licensed feed stub is unavailable");
expect(throws(() => lic.getInteractions("warfarin")), "licensed feed getter fails closed until built");

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-pharm-data-source FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-pharm-data-source: OK");
