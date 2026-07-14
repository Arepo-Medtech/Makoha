/**
 * Internal clinical domain model for the PharmCheck live core (FL-30 §2.2).
 *
 * This model sits BEHIND the frozen PharmCheck contract — it is the engine's internal
 * representation of clinical reference knowledge, never exposed on the wire. The wire
 * shape is and remains the frozen pharm-intent / pharm-check schemas (source of truth);
 * this file must never be treated as a substitute for them.
 *
 * SCOPE (Step 2 = contract lock): these are the zod TYPES + validators only. No clinical
 * content is authored here — populating provenanced records is Step 3 (authoring pipeline).
 * Defining the shapes first is the schema-first discipline: no data flows through the seam
 * without a validated contract.
 *
 * PROVENANCE OR IT DOESN'T SHIP (FL-30 Guardrail 5): every clinical entity carries a
 * ProvenanceSchema block. A record with no provenance cannot validate, so an anonymous
 * clinical fact is structurally unrepresentable.
 */
import { z } from "zod";

/**
 * Governance / provenance block — mandatory on every clinical entity (Guardrail 5).
 * source_ref cites the primary/open source (SUSMP instrument id, STOPP/START citation,
 * TDM reference, RxNorm/ATC id) or "self-authored"; reviewed_by is null until a
 * registered pharmacist attests; review_status walks draft → clinician_review → approved.
 */
export const ProvenanceSchema = z
  .object({
    source: z.string().min(2), // e.g. "SUSMP Poisons Standard", "STOPP/START v3", "TDM reference", "self-authored"
    source_ref: z.string().min(1), // instrument id / citation / concept id / URL id
    authored_by: z.string().min(2),
    reviewed_by: z.string().min(2).nullable(), // null until a clinician attests
    review_status: z.enum(["draft", "clinician_review", "approved"]),
    version: z.string().min(1),
    effective_date: z.string().min(4), // ISO date (YYYY-MM-DD)
  })
  .strict();

/** AU scheduling — the full SUSMP set (richer than the frozen intent's subset). S4D is
 * the AU "drugs of dependence" appendix, carried for parity with the frozen intent. */
export const AU_SCHEDULES = ["unscheduled", "S2", "S3", "S4", "S4D", "S5", "S6", "S7", "S8", "S9", "S10", "unknown"];

/** Drug / product entity — ingredient-level identity, agnostic to country where the drug
 * is (most generics are US/UK/AU-common). ARTG id / ATC are optional (nullable) so a
 * generic-level record needn't wait on an AU registration id. */
export const DrugProductSchema = z
  .object({
    ingredient: z.string().min(2),
    form: z.string().nullable().optional(),
    strength: z.string().nullable().optional(),
    route: z.string().nullable().optional(),
    artg_id: z.string().nullable().optional(), // AU Register of Therapeutic Goods id, if applicable
    synonyms: z.array(z.string()).default([]),
    atc_code: z.string().nullable().optional(), // WHO ATC classification (open)
    provenance: ProvenanceSchema,
  })
  .strict();

/** AU scheduling record (source: SUSMP / Poisons Standard). */
export const AuScheduleSchema = z
  .object({
    ingredient: z.string().min(2),
    schedule: z.enum(AU_SCHEDULES),
    state_appendix_flags: z.array(z.string()).default([]),
    effective_date: z.string().min(4),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Narrow Therapeutic Index record (source: TDM reference + primary literature; the
 * DrugBank NTI category is a STRUCTURE-ONLY pointer, never content — Guardrail 1).
 * therapeutic_interval / monitoring capture the TDM pathway (e.g. lithium 0.4–0.8 mmol/L). */
export const NtiSchema = z
  .object({
    ingredient: z.string().min(2),
    is_nti: z.boolean(),
    rationale: z.string().min(5),
    monitoring_hint: z.string().nullable().optional(),
    therapeutic_interval: z.string().nullable().optional(), // e.g. "0.4–0.8 mmol/L (prophylaxis)"
    time_to_steady_state_days: z.number().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Interaction record — drug–drug, drug–condition, or drug–renal. Mechanism is a
 * MECHANISTIC CLASS (e.g. "CYP3A4 inhibition"), never copied monograph prose (Guardrail 1). */
/** The mechanism bucket an interaction falls into (patient-safety triage view):
 *  drug_drug = general/pharmacodynamic (additive effect, not a PK/QT bucket below);
 *  qt_prolongation = additive QT → torsades; reduced_clearance = one drug lowers another's
 *  renal/transporter clearance; cyp_inducer / cyp_inhibitor = metabolic (CYP) induction/inhibition. */
export const INTERACTION_MECHANISM_CATEGORIES = ["drug_drug", "qt_prolongation", "reduced_clearance", "cyp_inducer", "cyp_inhibitor"];

export const InteractionSchema = z
  .object({
    interaction_kind: z.enum(["drug_drug", "drug_condition", "drug_renal"]),
    mechanism_category: z.enum(INTERACTION_MECHANISM_CATEGORIES),
    subject: z.string().min(2), // the drug in question
    object: z.string().min(2), // the interacting drug, condition, or renal state
    severity: z.enum(["critical", "moderate", "low"]),
    mechanism_class: z.string().min(3), // mechanistic class, not prose
    management_category: z.string().min(3), // e.g. "avoid", "monitor", "dose-adjust"
    evidence_tier: z.enum(["guideline", "trial", "mechanistic", "consensus"]),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Strong Contraindication — a drug OR whole drug-class that is strongly/absolutely
 * contraindicated in a patient condition or state (distinct from drug-drug interactions).
 * e.g. dopamine antagonists in Parkinson's disease; carbamazepine with neutropenia. */
export const StrongContraindicationSchema = z
  .object({
    subject: z.string().min(2), // drug or drug-class name
    subject_kind: z.enum(["drug", "drug_class"]),
    condition: z.string().min(2), // the contraindicating condition/state
    severity: z.enum(["absolute", "strong_relative"]),
    rationale: z.string().min(5),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Renal dosing rule (source: STOPP/START v3 renal criteria corroborated against AMH/TGA).
 * Mirrors the frozen pharm-check renal_threshold object semantics. */
export const RenalDosingSchema = z
  .object({
    ingredient: z.string().min(2),
    action: z.enum(["renal_contraindicated", "renal_adjustment_required"]),
    contraindicated_below_egfr: z.number().nullable().optional(),
    dose_reduction_below_egfr: z.number().nullable().optional(),
    monitoring: z.string().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Allergy cross-reactivity group (self-authored + primary literature). Members are
 * generic drug names that share a cross-reactivity class (e.g. beta-lactams). */
export const AllergyGroupSchema = z
  .object({
    group: z.string().min(2),
    members: z.array(z.string().min(1)).min(1),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Serious Adverse Effect record — a medication's established serious toxicity profile
 * (distinct from drug–drug interactions). A knowledge/reference register: the frozen
 * pharm-check contract has no SAE check_id, so this is NOT an engine gate — it is surfaced
 * as clinical context, never a HARD_FAIL check_result. Captures the effect, organ system,
 * severity, onset, and the monitoring/management (incl. antidote) that mitigate it. */
export const SeriousAdverseEffectSchema = z
  .object({
    ingredient: z.string().min(2),
    effect: z.string().min(3),
    system: z.enum(["cardiac", "pulmonary", "hepatic", "renal", "haematological", "neurological", "dermatological", "metabolic", "endocrine", "gastrointestinal", "musculoskeletal", "immunological", "multi_system", "other"]),
    severity: z.enum(["life_threatening", "serious", "significant"]),
    onset: z.enum(["acute", "subacute", "chronic", "idiosyncratic", "dose_dependent", "cumulative"]).nullable().optional(),
    mechanism_class: z.string().nullable().optional(),
    monitoring: z.string().nullable().optional(),
    management: z.string().nullable().optional(), // includes antidote where one exists
    provenance: ProvenanceSchema,
  })
  .strict();

/** Precaution / general warning — LOW-level capture: mild/common side effects and general
 * cautions of treatment, distinct from (and below) serious_adverse_effects and
 * strong_contraindications. Reference register (context), not an engine gate. */
export const PrecautionSchema = z
  .object({
    ingredient: z.string().min(2),
    precaution: z.string().min(3),
    category: z.enum(["common_side_effect", "general_warning", "monitoring", "administration", "counselling"]),
    frequency: z.enum(["common", "uncommon", "rare", "unknown"]).nullable().optional(),
    advice: z.string().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Pharmacokinetics profile — absorption/distribution/metabolism/elimination facts (the
 * pharmacology, NOT a renal-dose warning). Reference register. One record per drug. */
export const PharmacokineticsSchema = z
  .object({
    ingredient: z.string().min(2),
    bioavailability: z.string().nullable().optional(),
    protein_binding: z.string().nullable().optional(),
    volume_of_distribution: z.string().nullable().optional(),
    metabolism: z.string().nullable().optional(),
    elimination: z.string().nullable().optional(),
    half_life: z.string().nullable().optional(),
    active_metabolites: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict()
  .refine((o) => [o.bioavailability, o.protein_binding, o.volume_of_distribution, o.metabolism, o.elimination, o.half_life, o.active_metabolites, o.notes].some((v) => v != null && v !== ""), { message: "at least one pharmacokinetic field must be present" });

/** Pharmacodynamics — mechanism of action. Reference register. One record per drug. */
export const PharmacodynamicsSchema = z
  .object({
    ingredient: z.string().min(2),
    drug_class: z.string().nullable().optional(),
    mechanism_of_action: z.string().min(5),
    target: z.string().nullable().optional(),
    effect: z.string().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Clinical use — an indication. Reference register. A drug may have several (one record each). */
export const ClinicalUseSchema = z
  .object({
    ingredient: z.string().min(2),
    indication: z.string().min(3),
    indication_type: z.enum(["approved", "off_label", "emergency"]).nullable().optional(),
    notes: z.string().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Formulation record — a medicine's available form/strength/route from the PBS (public
 * open-data register). Dose-ADJACENT reference (what strengths exist), NOT prescribing/dose
 * guidance and NOT a dose source — the no-dosages-from-LLM invariant is untouched because
 * this is a factual formulary fact, not an authored dose. Bulk open data → dataset-level
 * governance (no per-record provenance). */
export const FormulationSchema = z
  .object({
    ingredient: z.string().min(2),
    form: z.string().min(1), // li_form incl. strength, e.g. "Tablet 80 mg (as calcium)"
    route: z.string().nullable().optional(),
    pbs_item_code: z.string().nullable().optional(),
  })
  .strict();

/**
 * Dose-evidence record — a dosing FINDING reported in the primary research literature, tied
 * to a REAL, retrieval-verified citation (PubMed PMID or DOI). This is a citation reference
 * register, NOT prescribing guidance and NOT a dose source: it is structurally isolated from
 * the PharmCheck engine (no getDoseEvidence accessor exists on any PharmDataSource, and the
 * engine never reads dose-evidence.json), so it CANNOT feed a dose into a clinical decision.
 * The no-dosages-from-the-LLM invariant is untouched — the engine's only dose source remains
 * the firewall/vendor PharmCheck path. Every field here is a literature observation a
 * clinician must independently verify before any clinical use.
 *
 * INTEGRITY BAR: a record only ships if citation.identifier resolves to a real article (the
 * verify pass confirms it via get_article_metadata) — a hallucinated PMID/DOI is worse than
 * an empty register, so unverifiable records are dropped, never kept. The .refine below
 * mechanically forces provenance.source_ref to equal citation.identifier, so the record's
 * provenance is anchored to the exact source it claims.
 */
export const DoseEvidenceSchema = z
  .object({
    ingredient: z.string().min(2),
    context: z.string().min(3), // the clinical setting the finding applies to (indication / population / scenario)
    population: z.string().nullable().optional(), // e.g. "elderly", "renal impairment", "atrial fibrillation"
    dose_statement: z.string().min(3), // the literature-reported dosing observation — a FINDING, never a prescription
    citation: z
      .object({
        identifier: z.string().min(3), // the PMID or DOI — MUST equal provenance.source_ref
        id_type: z.enum(["pmid", "doi"]),
        title: z.string().min(3),
        journal: z.string().nullable().optional(),
        year: z.number().int(),
        verified: z.boolean(), // true only once get_article_metadata confirmed the id resolves
      })
      .strict(),
    evidence_note: z.string().nullable().optional(), // caveat / study type / why this is not a directive
    not_prescribing_guidance: z.literal(true), // structural label — evidence reference, never a dose to give
    provenance: ProvenanceSchema,
  })
  .strict()
  .refine((r) => r.provenance.source_ref === r.citation.identifier, {
    message: "provenance.source_ref must equal citation.identifier — the record must be anchored to its real source",
    path: ["provenance", "source_ref"],
  });

/**
 * Administration handling — whether a solid oral dose form may be crushed / split / dispersed
 * ("should not be crushed"). APF22 'Modification of oral formulation' structure; FACTS cited to
 * APF22 (source_ref:"apf22") or product information. Reference-only, NOT a dose source, NOT
 * engine-wired — carries no dose, cannot emit one (a future crush-safety firewall check would
 * be a separate frozen-contract change). */
export const AdministrationHandlingSchema = z
  .object({
    ingredient: z.string().min(2),
    formulation: z.string().nullable().optional(), // e.g. "modified-release tablet", "enteric-coated tablet"
    can_crush: z.enum(["do_not_crush", "crush_with_caution", "crushable"]),
    can_split: z.enum(["splittable", "do_not_split", "scored_only", "unknown"]).nullable().optional(),
    can_disperse: z.enum(["dispersible", "not_dispersible", "unknown"]).nullable().optional(),
    rationale: z.string().nullable().optional(),
    alternative: z.string().nullable().optional(),
    reference: z.string().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/**
 * TDM parameters — therapeutic drug monitoring reference (APF22 Section B, Table B.2 structure;
 * range/threshold FACTS cited to APF22 or AMH). NTI is the narrow-index BUCKET under the same
 * "therapeutic drug monitoring" heading (see capability-groups.json); this leaf carries the
 * monitoring parameters. NOT a dose source — therapeutic_range_* are plasma/serum CONCENTRATION
 * targets for lab monitoring, never dosing instructions, so the no-dosages-from-the-LLM invariant
 * is untouched. Reference-only, engine-isolated; the frozen nti_check is unchanged. */
export const TdmParametersSchema = z
  .object({
    ingredient: z.string().min(2),
    monitored: z.boolean(),
    therapeutic_range_low: z.number().nullable().optional(),
    therapeutic_range_high: z.number().nullable().optional(),
    range_unit: z.string().nullable().optional(), // e.g. "mg/L", "micromol/L"
    toxic_threshold: z.number().nullable().optional(),
    toxic_unit: z.string().nullable().optional(),
    sample_timing: z.enum(["trough", "peak", "either", "auc"]).nullable().optional(),
    biological_fluid: z.enum(["serum", "plasma", "whole_blood"]).nullable().optional(),
    time_to_steady_state: z.string().nullable().optional(),
    monitoring_indication: z.string().nullable().optional(),
    active_metabolite_note: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/**
 * Warning label — cautionary/advisory label assignment (APF22 'Cautionary advisory labels'
 * structure). COPYRIGHT: author from RASML (Required Advisory Statements for Medicine Labels —
 * TGA legal instrument, public); source_scheme:"RASML" is the primary path. Reference-only. */
export const WarningLabelSchema = z
  .object({
    ingredient: z.string().min(2),
    label_code: z.string().min(1),
    label_text: z.string().nullable().optional(),
    source_scheme: z.enum(["RASML", "PSA_CAL", "other"]),
    mandatory: z.boolean().nullable().optional(),
    reference: z.string().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Counselling point — a consumer counselling message (APF22 'Consumer information' structure).
 * Sits under the Counselling heading alongside (not merged with) precautions. Reference-only. */
export const CounsellingPointSchema = z
  .object({
    ingredient: z.string().min(2),
    point: z.string().min(3),
    category: z.enum(["administration", "storage", "missed_dose", "side_effect_advice", "duration", "lifestyle", "safety_netting"]).nullable().optional(),
    priority: z.enum(["essential", "recommended"]).nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/**
 * Capability-groups registry — the NON-DESTRUCTIVE heading overlay (APF22 monograph headings).
 * Groups the flat leaf capabilities under heading capabilities as metadata; migrates/merges NO
 * dataset ("the capabilities must not be crushed"). Every member_capabilities entry must resolve
 * to a real capability (enforced by contract-pharm-capability-groups.js). NTI-as-bucket is
 * expressed here: the "therapeutic drug monitoring" group lists nti alongside tdm_parameters. */
export const CapabilityGroupSchema = z
  .object({
    group_key: z.string().min(2),
    title: z.string().min(2),
    description: z.string().nullable().optional(),
    member_capabilities: z.array(z.string().min(2)).min(1),
    source_ref: z.string().nullable().optional(),
  })
  .strict();
export const CapabilityGroupsRegistrySchema = z
  .object({
    _note: z.string().optional(),
    registry_version: z.string().min(1),
    generated: z.string().optional(),
    groups: z.array(CapabilityGroupSchema).min(1),
  })
  .strict();

/** Pregnancy risk — Australian TGA pregnancy category per drug/class (APF22 reorg Priority-2).
 * Reference-only, NOT engine-wired (the frozen pharm-check reserves pregnancy_check but the
 * engine does not implement it — wiring is a separate gate). Carries NO dose. TGA categories
 * are public facts, cited. */
export const PregnancyRiskSchema = z
  .object({
    subject: z.string().min(2),
    subject_kind: z.enum(["drug", "drug_class"]),
    tga_category: z.enum(["A", "B1", "B2", "B3", "C", "D", "X"]),
    trimester_flags: z.array(z.enum(["first", "second", "third"])).nullable().optional(),
    guidance: z.string().nullable().optional(),
    contraindicated: z.boolean().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Hepatic impairment — dose caution/contraindication by Child-Pugh class (APF22 reorg
 * Priority-2). Parallels renal; reference-only, NOT engine-wired (pharm-check reserves
 * hepatic_check but the engine does not implement it). Carries NO dose. */
export const HepaticSchema = z
  .object({
    ingredient: z.string().min(2),
    action: z.enum(["hepatic_contraindicated", "hepatic_caution"]),
    child_pugh_class: z.enum(["A", "B", "C"]).nullable().optional(),
    guidance: z.string().nullable().optional(),
    monitoring: z.string().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/**
 * Dose-evidence review queue — the §4.3b holding area for APF22 Section D "Common Dosage Range"
 * facts that FAILED PubMed verification. HELD, engine-ISOLATED (no accessor, stricter than
 * dose_evidence — it has no citation yet), NOT prescribing. apf_fact is the ONLY place an
 * uncited APF dose range may sit; it awaits elevation (path 1 re-verification → dose_evidence,
 * or path 2 clinician direct-APF attestation). not_prescribing_guidance is a structural literal;
 * apf_reference is pinned to "apf22". Strengthens the no-LLM-dose invariant — gives misses a
 * controlled home instead of tempting a forced dose_evidence entry. */
export const DoseEvidenceReviewQueueSchema = z
  .object({
    ingredient: z.string().min(2),
    context: z.string().min(3),
    apf_fact: z.string().min(3),
    apf_reference: z.literal("apf22"),
    reason_unverified: z.string().min(3),
    queue_status: z.enum(["awaiting_reverification", "awaiting_clinician_attestation", "elevated", "rejected"]),
    nominated_elevation_path: z.enum(["path1_reverification", "path2_clinician_apf_attestation"]).nullable().optional(),
    not_prescribing_guidance: z.literal(true),
    provenance: ProvenanceSchema,
  })
  .strict();

/** PBS formulary record (source: PBS Public API v3 — Commonwealth open data). Factual
 * formulary/subsidy data, distinct from the clinical-judgement capabilities; populated by
 * the cached sync (scripts/pharm-pbs-sync.mjs), not the clinician authoring pipeline. */
export const PbsFormularySchema = z
  .object({
    pbs_item_code: z.string().min(1),
    ingredient: z.string().min(1),
    form: z.string().nullable().optional(),
    brand_name: z.string().nullable().optional(),
    program_code: z.string().nullable().optional(),
    benefit_type_code: z.string().nullable().optional(),
    manner_of_administration: z.string().nullable().optional(),
    atc_code: z.string().nullable().optional(),
    atc_level: z.number().nullable().optional(),
    atc_description: z.string().nullable().optional(),
    // Governing authority partition = the LEAST-restrictive pathway (best patient access);
    // authority_categories lists every pathway the item has (least → most restrictive).
    authority_category: z.enum(["unrestricted", "restricted_benefit", "authority_streamlined", "authority_required"]),
    authority_categories: z.array(z.enum(["unrestricted", "restricted_benefit", "authority_streamlined", "authority_required"])).min(1),
    written_authority_required: z.boolean(),
    authority_method: z.string().nullable().optional(),
    restricted: z.boolean(),
    // PBS 60-day dispensing eligibility (IMDQ60). Optional so pre-enrichment records still validate.
    "60day_eligible": z.boolean().optional(),
  })
  .strict(); // bulk open-data record — governance is DATASET-LEVEL, so no per-record provenance

/** CDS envelope — the internal decision object (FL-30 §2.2). required_human_review must
 * ALWAYS be true: the engine proposes, a registered practitioner disposes (Guardrail 2).
 * This maps to the frozen PharmCheck.status; it never replaces it. */
export const CdsEnvelopeSchema = z
  .object({
    alert_level: z.enum(["PASS", "WARN", "HARD_FAIL", "BLOCKED_NO_PROOF"]),
    machine_rationale: z.string().min(3),
    required_human_review: z.literal(true), // structurally cannot be false — no auto-cleared gate
    provenance_refs: z.array(z.string()).default([]), // source_refs backing the decision
  })
  .strict();

const validator = (schema, label) => (v) => {
  const r = schema.safeParse(v);
  if (!r.success) throw new Error(`Invalid ${label}: ` + r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
};

export const validateProvenance = validator(ProvenanceSchema, "Provenance");
export const validateDrugProduct = validator(DrugProductSchema, "DrugProduct");
export const validateAuSchedule = validator(AuScheduleSchema, "AuSchedule");
export const validateNti = validator(NtiSchema, "Nti");
export const validateInteraction = validator(InteractionSchema, "Interaction");
export const validateRenalDosing = validator(RenalDosingSchema, "RenalDosing");
export const validateAllergyGroup = validator(AllergyGroupSchema, "AllergyGroup");
export const validateSeriousAdverseEffect = validator(SeriousAdverseEffectSchema, "SeriousAdverseEffect");
export const validateStrongContraindication = validator(StrongContraindicationSchema, "StrongContraindication");
export const validatePrecaution = validator(PrecautionSchema, "Precaution");
export const validatePharmacokinetics = validator(PharmacokineticsSchema, "Pharmacokinetics");
export const validatePharmacodynamics = validator(PharmacodynamicsSchema, "Pharmacodynamics");
export const validateClinicalUse = validator(ClinicalUseSchema, "ClinicalUse");
export const validateFormulation = validator(FormulationSchema, "Formulation");
export const validateDoseEvidence = validator(DoseEvidenceSchema, "DoseEvidence");
export const validateAdministrationHandling = validator(AdministrationHandlingSchema, "AdministrationHandling");
export const validateTdmParameters = validator(TdmParametersSchema, "TdmParameters");
export const validateWarningLabel = validator(WarningLabelSchema, "WarningLabel");
export const validateCounsellingPoint = validator(CounsellingPointSchema, "CounsellingPoint");
export const validateCapabilityGroups = validator(CapabilityGroupsRegistrySchema, "CapabilityGroups");
export const validatePregnancyRisk = validator(PregnancyRiskSchema, "PregnancyRisk");
export const validateHepatic = validator(HepaticSchema, "Hepatic");
export const validateDoseEvidenceReviewQueue = validator(DoseEvidenceReviewQueueSchema, "DoseEvidenceReviewQueue");
export const validatePbsFormulary = validator(PbsFormularySchema, "PbsFormulary");
export const validateCdsEnvelope = validator(CdsEnvelopeSchema, "CdsEnvelope");

/** Map a capability key → its record validator, for the authoring pipeline. Capabilities
 * with a bespoke path (dose_guidance, pbs) are intentionally absent here. dose_evidence
 * validates through the authoring pipeline (fail-closed → draft) but is NEVER wired to the
 * engine — it is a citation reference register, not a dose source. */
export const CAPABILITY_VALIDATORS = {
  dose_evidence: validateDoseEvidence,
  administration_handling: validateAdministrationHandling,
  tdm_parameters: validateTdmParameters,
  warning_labels: validateWarningLabel,
  counselling_points: validateCounsellingPoint,
  pregnancy_risk: validatePregnancyRisk,
  hepatic: validateHepatic,
  dose_evidence_review_queue: validateDoseEvidenceReviewQueue,
  nti: validateNti,
  interactions: validateInteraction,
  renal: validateRenalDosing,
  scheduling: validateAuSchedule,
  allergy: validateAllergyGroup,
  serious_adverse_effects: validateSeriousAdverseEffect,
  strong_contraindications: validateStrongContraindication,
  precautions: validatePrecaution,
  pharmacokinetics: validatePharmacokinetics,
  pharmacodynamics: validatePharmacodynamics,
  clinical_uses: validateClinicalUse,
};
