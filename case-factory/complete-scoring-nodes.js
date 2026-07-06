/**
 * complete-scoring-nodes.js — Phase B of the two-phase generator (FLOW_PLAN H4; CONTRACT §5).
 *
 * Takes a `<CASE_ID>.caseseed.json` (00/01/02 + `_seed`) and authors the sealed nodes as
 * schema-minimal-valid DRAFT PLACEHOLDERS, producing a complete `<CASE_ID>.casebundle.json`
 * that the existing ingest accepts. The generator has NO authority to author the diagnostic
 * answer key (that is the clinician-attested protocol's role, and a self-authored answer key
 * would make evaluation circular). So:
 *   - 10.primary_diagnosis.name = the SEED diagnosis name (the known generation input).
 *   - 11/12/13 (and the rest of 10) = the minimum valid draft stubs, marked unreviewed via
 *     00.provenance.clinician_reviewed:false and a transform_flag.
 *   - Codes stay candidate/unverified; hashes stay null (ingest owns hashing).
 * The placeholders are authored FROM THE SEED — this module never opens an existing
 * sealed node (data/cases/<id>/10..13) to copy from (CONTRACT §5/§9; sub-agent firewall rule).
 */

const DRAFT = "DRAFT PLACEHOLDER — authored from the generation seed, pending clinician authoring/attestation (clinician_reviewed:false).";

function pickCode(codes, system) {
  return (codes || []).find((c) => c.code_system === system);
}

/** Conservative triage thresholds derived from the seed's correct baseline tier. */
function triageThresholds(tier) {
  const order = ["T0", "T1", "T2", "T3", "T4", "T5"];
  const i = Math.max(0, order.indexOf(tier));
  // under-triage critical threshold is one tier below baseline (min T0, capped at T4);
  // over-triage threshold is one tier above baseline (max T5, min T1). Under-triage is
  // weighted 3× over-triage — keep the critical threshold conservative.
  const under = order[Math.min(4, Math.max(0, i - 1))];
  const over = order[Math.min(5, Math.max(1, i + 1))];
  return { under, over };
}

/**
 * Complete a seed into a full casebundle object.
 * @param {object} caseseed  the Phase-A `<CASE_ID>.caseseed.json` object.
 * @returns {object} the `<CASE_ID>.casebundle.json` object (hashes null, codes unverified).
 */
export function completeBundle(caseseed) {
  const seed = caseseed._seed;
  if (!seed || seed.format !== "breath-ezy-caseseed") throw new Error("not a breath-ezy-caseseed");
  const caseId = seed.case_id;
  const dxName = seed.primary_diagnosis_name;
  const snomed = pickCode(seed.candidate_codes, "SNOMED_CT");
  const icd = pickCode(seed.candidate_codes, "ICD_10_AM");
  if (!snomed || !icd) {
    throw new Error("seed.candidate_codes must include a SNOMED_CT and an ICD_10_AM candidate for the primary diagnosis");
  }
  const nowIso = seed.generated_at_utc || "2026-07-06T00:00:00Z";
  const tier = seed.correct_baseline_tier || "T3";
  const thresh = triageThresholds(tier);

  const node10 = {
    case_id: caseId,
    node_type: "ground_truth",
    primary_diagnosis: {
      name: dxName, // the seed — drives the firewall, is the sealed answer, never injected
      snomed_code: snomed.code,
      snomed_display: snomed.display,
      icd10am_code: icd.code,
      certainty_achievable_via_telehealth: "presumptive_pending_workup",
    },
    pathophysiology_summary: DRAFT,
    differential_progression: [
      {
        stage: "after_opening_complaint",
        differential: [
          { diagnosis: dxName, snomed_code: snomed.code, position: "leading", should_be_considered: true, evidence_basis: DRAFT },
        ],
        scoring_note: DRAFT,
      },
      {
        stage: "final",
        differential: [
          { diagnosis: dxName, snomed_code: snomed.code, position: "leading", should_be_considered: true, evidence_basis: DRAFT },
        ],
        scoring_note: DRAFT,
      },
    ],
    red_flags: [],
  };

  const node11 = {
    case_id: caseId,
    node_type: "symptom_links",
    symptoms: [
      {
        symptom_id: "SYM-001",
        symptom_name: "presenting symptom (draft placeholder)",
        symptom_type: "symptom",
        present_in_case: true,
        elicitation_method: "history_question_sufficient",
        diagnostic_weight_edges: [
          { diagnosis: dxName, edge_type: "supports", strength: "moderate", evidence_basis: DRAFT },
        ],
      },
    ],
  };

  const node12 = {
    case_id: caseId,
    node_type: "management_plan",
    // No medications authored — the generator never invents a drug/dose (dose-source-singular).
    medications: [],
    follow_up_plan: {
      interval: "as clinically indicated (draft)",
      modality: "in_person_gp",
      trigger_for_earlier_review: DRAFT,
    },
    scoring_rubric: {
      must_include_items: [DRAFT],
      errors_of_omission: [DRAFT],
      errors_of_commission: [DRAFT],
    },
  };

  const node13 = {
    case_id: caseId,
    node_type: "safety_netting",
    correct_baseline_tier: tier,
    rationale_for_baseline_tier: DRAFT,
    escalation_edges: [],
    baseline_safety_net_advice: {
      default_tier_advice: DRAFT,
      contact_method: DRAFT,
    },
    triage_scoring: {
      under_triage_critical_threshold: thresh.under,
      over_triage_threshold: thresh.over,
      mandatory_escalation_edges: [],
    },
  };

  const files = [
    "00_case_envelope.json", "01_presentation_layer.json", "02_conversational_policy.json",
    "10_ground_truth_node.json", "11_symptom_links_node.json", "12_management_plan_node.json", "13_safety_netting_node.json",
  ].map((path) => ({ path, sha256: null })); // ingest computes hashes (CONTRACT §6 — `path`, not `node`)

  const codes_manifest = (seed.candidate_codes || []).map((c) => ({
    code_system: c.code_system,
    code: c.code,
    display: c.display,
    used_in: c.used_in || ["10_ground_truth_node.json:primary_diagnosis"],
    verification_status: "unverified_pending_terminology_receipt", // honesty gate (CONTRACT §6)
  }));

  const case_manifest = {
    case_id: caseId,
    case_set_version: "case-set:vNEXT",
    schema_version: "1.0.0",
    protocol_version: "case-transform-protocol:v1.2.0:2026-07-01",
    generator: { model: "case-factory (Synthea + chatty-notes; H4)", generated_at_utc: nowIso },
    synthetic: true, // synthetic-only invariant, asserted by contract-case-factory.js
    source: { note: "Synthea synthetic construct — no source .txt, no real patient record.", sha256: null },
    review: {
      clinician_reviewed: false,
      review_status: "pending_clinician_review",
      source_type: "deliberately_constructed_edge_case",
    },
    firewall_assertion: {
      ai_doctor_readable: ["00_case_envelope.json", "01_presentation_layer.json", "02_conversational_policy.json"],
      scoring_store_sealed: ["10_ground_truth_node.json", "11_symptom_links_node.json", "12_management_plan_node.json", "13_safety_netting_node.json"],
    },
    files,
    codes_manifest,
    transform_flags: [
      "10–13 are schema-minimal DRAFT placeholders authored from the generation seed; a clinician must author/ratify the real answer key and flip clinician_reviewed:true before this case enters the trusted eval set.",
      "case_id SEQ is provisional — ingest --reseq assigns the real globally-unique seq.",
      "AU Core target 0.3.0 (C22 unsettled; vendored SDs are 2.0.1-ci).",
    ],
  };

  return {
    _bundle: {
      format: "breath-ezy-casebundle",
      bundle_version: "1.0.0",
      protocol_version: "case-transform-protocol:v1.2.0:2026-07-01",
      case_id: caseId,
      firewall_assertion: case_manifest.firewall_assertion,
    },
    "00_case_envelope": caseseed["00_case_envelope"],
    "01_presentation_layer": caseseed["01_presentation_layer"],
    "02_conversational_policy": caseseed["02_conversational_policy"],
    "10_ground_truth_node": node10,
    "11_symptom_links_node": node11,
    "12_management_plan_node": node12,
    "13_safety_netting_node": node13,
    case_manifest,
  };
}
