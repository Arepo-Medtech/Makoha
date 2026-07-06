/**
 * to-casebundle.js — THE SHAPER (FLOW_PLAN H4; CONTRACT §11).
 *
 * Maps generated Synthea FHIR + a chatty-notes patient-voice narrative onto the
 * PRESENTATION side of a Breath-Ezy case, plus a diagnosis SEED — Phase A of the
 * two-phase design (CONTRACT §5). It produces a `<CASE_ID>.caseseed.json`
 * (00/01/02 + `_seed.primary_diagnosis_name`); `complete-scoring-nodes.js` then
 * authors schema-minimal draft 10–13 from that seed before ingest.
 *
 * This is the SINGLE new integration surface. It writes NOTHING to data/cases/ and
 * invents no path — the seed → completion → `.casebundle.json` flows THROUGH the
 * existing `scripts/ingest-case-bundles.mjs`.
 *
 * FIREWALL (CONTRACT §7): the injectable 01/02 text is de-anchored — it must NOT
 * contain the full `primary_diagnosis_name` (the answer) nor a `.txt` source name.
 * This module is FAIL-CLOSED: if the diagnosis label survives into patient voice it
 * THROWS rather than emit a leaky seed (ingest would refuse it anyway; we refuse first).
 *
 * TELEHEALTH (CONTRACT §6): only patient-OBTAINABLE objective data (home/wearable/
 * self-report/video) enters 01.objective_data_offered as strings. Clinician-only exam/
 * labs/ECG are NOT placed here — they belong on the sealed side and are authored (as
 * placeholders) by the completion step, never copied from an existing sealed node.
 */

const CASEID_RE = /^SPEC-[A-Z]{2,6}-0[1-7]-[0-9]{5}$/;

const DIFFICULTY_CODE = {
  straightforward: "01",
  atypical_presentation: "02",
  red_herring_laden: "03",
  atypical_presentation_high_risk: "04",
  rare_condition: "05",
  multi_morbidity_complex: "06",
  communication_barrier: "07",
};

function ageBandFor(age) {
  if (age == null) return undefined;
  if (age < 1) return "infant";
  if (age <= 12) return "child";
  if (age <= 17) return "adolescent";
  if (age <= 64) return "adult";
  return "older_adult";
}

/** Age in whole years from a FHIR birthDate (YYYY or YYYY-MM-DD) given an as-of date. */
function ageFromBirthDate(birthDate, asOfIso) {
  if (!birthDate) return undefined;
  const by = parseInt(String(birthDate).slice(0, 4), 10);
  const ay = parseInt(String(asOfIso).slice(0, 4), 10);
  if (Number.isNaN(by) || Number.isNaN(ay)) return undefined;
  return Math.max(0, ay - by);
}

/** Build the provisional SPEC id. Seq is a placeholder — ingest --reseq assigns the real one. */
export function buildProvisionalCaseId(specialty, difficultyTier, provisionalSeq = 0) {
  const dd = DIFFICULTY_CODE[difficultyTier];
  if (!dd) throw new Error(`unknown difficulty_tier: ${difficultyTier}`);
  const seq = String(provisionalSeq).padStart(5, "0");
  const id = `SPEC-${specialty}-${dd}-${seq}`;
  if (!CASEID_RE.test(id)) throw new Error(`built case_id fails SPEC pattern: ${id}`);
  return id;
}

/** Collect the resources of a bundle (accepts a Bundle or a bare resource array). */
function resourcesOf(fhir) {
  if (Array.isArray(fhir)) return fhir;
  if (fhir && Array.isArray(fhir.entry)) return fhir.entry.map((e) => e.resource).filter(Boolean);
  return [];
}

/**
 * Assert no answer leak in the injectable presentation text (mirrors the ingest firewall,
 * enforced HERE first so a leaky seed never leaves the shaper). Case-insensitive full-name
 * match + no `.txt`. Individual medical words are fine — only the full diagnosis label leaks.
 */
function assertFirewallClean(node01, node02, diagnosisName) {
  const parts = [];
  for (const k of ["demographics", "opening_complaint", "history_as_reported", "objective_data_offered"]) {
    if (node01[k] !== undefined) parts.push(JSON.stringify(node01[k]));
  }
  for (const d of node02.disclosure_items || []) {
    for (const k of ["clinical_fact", "patient_response_template", "patient_deflection_template"]) {
      if (typeof d[k] === "string") parts.push(d[k]);
    }
  }
  for (const e of node02.patient_initiated_exchanges || []) if (typeof e.patient_text === "string") parts.push(e.patient_text);
  for (const b of node02.deflection_behaviours || []) if (typeof b.deflection_text_template === "string") parts.push(b.deflection_text_template);
  const text = parts.join(" ␟ ").toLowerCase();
  const name = String(diagnosisName || "").toLowerCase();
  if (name.length > 3 && text.includes(name)) {
    throw new Error(`FIREWALL: full diagnosis name "${diagnosisName}" leaked into injectable 01/02 text — de-anchor the narrative`);
  }
  if (text.includes(".txt")) throw new Error("FIREWALL: a .txt source filename leaked into injectable text");
}

/**
 * Shape a case SEED (Phase A).
 *
 * @param {object} input
 * @param {object|Array} input.fhir       Synthea FHIR R4 bundle (Patient [+ Observations/…]).
 * @param {object} input.narrative        Patient-voice, answer-free content (from chatty-notes):
 *   { opening_complaint_text, stated_reason?, symptom_narrative{…}, past_medical_history?[],
 *     current_medications?[], allergies?[], family_history?[], social_history?{},
 *     objective_data_offered?[], disclosure_items?[] }
 * @param {object} input.profile          Generation SEED intent (the known generation input):
 *   { specialty, difficulty_tier, diagnosis_category, primary_diagnosis_name,
 *     candidate_codes[], correct_baseline_tier, age?, sex_at_birth?, provisional_seq?,
 *     intentional_test_features?[], generated_at_utc }
 * @returns {{ caseseed }} the seed artifact object.
 */
export function toCaseSeed({ fhir, narrative, profile }) {
  if (!profile || !profile.specialty || !profile.difficulty_tier || !profile.primary_diagnosis_name) {
    throw new Error("profile requires specialty, difficulty_tier, primary_diagnosis_name (the generation seed)");
  }
  const nowIso = profile.generated_at_utc || "2026-07-06T00:00:00Z";
  const resources = resourcesOf(fhir);
  const patient = resources.find((r) => r && r.resourceType === "Patient") || {};
  const age = profile.age ?? ageFromBirthDate(patient.birthDate, nowIso);
  const sex = profile.sex_at_birth || patient.gender;
  if (!sex) throw new Error("sex_at_birth is required (from profile or Patient.gender)");
  const caseId = buildProvisionalCaseId(profile.specialty, profile.difficulty_tier, profile.provisional_seq ?? 0);

  // --- 00 case envelope (metadata; never shown to the AI Doctor) ---
  const node00 = {
    case_id: caseId,
    schema_version: "1.0.0",
    case_metadata: {
      difficulty_tier: profile.difficulty_tier,
      diagnosis_category: profile.diagnosis_category || "important_not_to_miss",
      specialty_tags: [profile.specialty],
      ...(ageBandFor(age) ? { age_band: ageBandFor(age) } : {}),
      encounter_setting: "telehealth_chat",
      provenance: {
        // Synthea output is a synthetic construct, not a de-identified real pattern (CONTRACT §4.1).
        source_type: "deliberately_constructed_edge_case",
        clinician_reviewed: false, // generator has no authority to attest (CONTRACT §6)
        ...(profile.intentional_test_features ? { intentional_test_features: profile.intentional_test_features } : {}),
      },
    },
    digital_tablet_anchoring: {
      digital_tablet_version: "1.0",
      fhir_version: "R4 (4.0.1)",
      snomed_edition: "SNOMED CT Australian Edition 20240301",
      au_core_version: "0.3.0",
    },
    node_refs: {
      presentation_layer_ref: "01_presentation_layer.json",
      conversational_policy_ref: "02_conversational_policy.json",
      ground_truth_node_ref: "10_ground_truth_node.json",
      symptom_links_node_ref: "11_symptom_links_node.json",
      management_plan_node_ref: "12_management_plan_node.json",
      safety_netting_node_ref: "13_safety_netting_node.json",
    },
    created_at_utc: nowIso,
  };

  // --- 01 presentation layer (AI-Doctor-readable; firewall-scanned) ---
  const node01 = {
    case_id: caseId,
    demographics: {
      ...(age != null ? { age } : {}),
      sex_at_birth: sex,
      ...(patient._occupation ? { occupation: patient._occupation } : {}),
    },
    opening_complaint: {
      verbatim_patient_text: narrative.opening_complaint_text,
      ...(narrative.stated_reason ? { stated_reason_for_presenting_today: narrative.stated_reason } : {}),
    },
    history_as_reported: {
      ...(narrative.symptom_narrative ? { symptom_narrative: narrative.symptom_narrative } : {}),
      ...(narrative.past_medical_history ? { past_medical_history: narrative.past_medical_history } : {}),
      ...(narrative.current_medications ? { current_medications_as_reported: narrative.current_medications } : {}),
      ...(narrative.allergies ? { allergies_as_reported: narrative.allergies } : {}),
      ...(narrative.family_history ? { family_history_as_reported: narrative.family_history } : {}),
      ...(narrative.social_history ? { social_history_volunteered: narrative.social_history } : {}),
    },
    ...(narrative.objective_data_offered ? { objective_data_offered: narrative.objective_data_offered } : {}),
  };

  // --- 02 conversational policy (behaviour; scoring fields are simulator-only) ---
  const node02 = {
    case_id: caseId,
    disclosure_items: (narrative.disclosure_items || []).map((d, i) => ({
      item_id: d.item_id || `DI-${String(i + 1).padStart(3, "0")}`,
      clinical_fact: d.clinical_fact,
      disclosure_gate: d.disclosure_gate || "revealed_on_specific_targeted_question",
      trigger_question_examples: d.trigger_question_examples,
      patient_response_template: d.patient_response_template,
      ...(d.patient_deflection_template ? { patient_deflection_template: d.patient_deflection_template } : {}),
      ...(d.ros_category ? { ros_category: d.ros_category } : {}),
      ...(d.is_red_flag !== undefined ? { is_red_flag: d.is_red_flag } : {}),
    })),
  };

  // FAIL-CLOSED firewall check before the seed leaves the shaper.
  assertFirewallClean(node01, node02, profile.primary_diagnosis_name);

  const caseseed = {
    _seed: {
      format: "breath-ezy-caseseed",
      case_id: caseId,
      specialty: profile.specialty,
      difficulty_tier: profile.difficulty_tier,
      diagnosis_category: node00.case_metadata.diagnosis_category,
      // The primary diagnosis NAME is the generation INPUT (known), not an inference. It
      // drives the firewall and seeds the sealed 10 node — it is not injected into 01/02.
      primary_diagnosis_name: profile.primary_diagnosis_name,
      candidate_codes: profile.candidate_codes || [],
      correct_baseline_tier: profile.correct_baseline_tier || "T3",
      au_core: { target: "0.3.0" },
      synthetic: true,
      generated_at_utc: nowIso,
      source: {
        generator: "case-factory (Synthea + chatty-notes, input-gated on Java runtime)",
        note: "Synthetic construct; no real patient record. Scoring truth is a placeholder authored from this seed, never copied from an existing sealed node.",
      },
    },
    "00_case_envelope": node00,
    "01_presentation_layer": node01,
    "02_conversational_policy": node02,
  };
  return { caseseed };
}
