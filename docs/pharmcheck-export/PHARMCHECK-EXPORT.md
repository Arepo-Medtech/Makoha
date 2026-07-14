# PharmCheck — Export & Review Bundle (FL-30)

> **Purpose.** A self-contained snapshot of Breath-Ezy's PharmCheck pharmacology subsystem for review/assessment in a standalone Claude Chat (no repo access needed). Generated from the live repo by `scripts/pharm-export.mjs`. **Samples + counts only** — full datasets are not included.
> **Companion:** `DEVELOPMENT-INSTRUMENT.md` (how to propose changes) + `scripts/pharm-ingest.mjs` (how they come back in).

## 0. What PharmCheck is (and is NOT)

PharmCheck is a **deterministic safety-checking firewall** for medication decisions in an Australian telehealth CDS. It is **clinical decision support, not a prescriber**: it proposes, a registered practitioner disposes. It sits BEHIND a frozen wire contract (`pharm-intent` in, `pharm-check` out) and is the ONLY source of dose guidance in the system — the LLM never mints a dose.

**Non-negotiable invariants (assess against these):**
- **No dose from the LLM.** Dose guidance is emitted ONLY by the engine, ONLY on PASS/WARN, NEVER on HARD_FAIL/BLOCKED/paediatric.
- **HARD_FAIL is terminal** — it blocks pipeline continuation unconditionally, no override.
- **Paediatric (<18) → flag, never a dose** (no paediatric tables exist).
- **Provenance or it doesn't ship** — every clinical record carries a provenance block; an anonymous fact is structurally unrepresentable.
- **Fail-safe default** — absent proof → `BLOCKED_NO_PROOF`, never a fabricated code/dose/fact.
- **Copyright boundary** — AusDI/DrugBank/STOPP-START/TDM are used for STRUCTURE + facts + citation only, never bulk content ingest.
- **Nothing here is patient-facing.** All datasets are `-dev`/unsigned; receipts are `mode=mock` (never mock-as-live) until staging validation + clinician + regulatory (TGA) sign-off.

## 1. Architecture

```
pharm-intent (frozen wire in)
      │
      ▼
runPharmCheck(intent, resolved, {source})   ← engine.js (pure, deterministic)
      │   reads clinical reference knowledge through the PharmDataSource seam
      ▼
PharmDataSource  ──► SyntheticSelfDevelopedSource  → reads data/*.json (clinician-signed synthetic, -dev)
                 └─► LicensedFeedSource (stub, fail-closed) → a validated live vendor at Step 5
      │
      ▼
pharm-check (frozen wire out): status + checks[] + dose_guidance? + receipt
```

The seam keeps provenance honest: `receiptMode()` returns `mock` until Step-5 validation, `receiptUpstream()` is `heydoc-pharm-synthetic-dev:` — the reference content is clinician-signed *synthetic*, never presented as a licensed vendor feed.

## 2. The engine firewall — checks & status precedence

Each check appends `{check_id, status, severity?, reason?, missing_facts_required?}`. `check_id` values come from the FROZEN `pharm-check` enum (do not invent new ones without amending the contract).

| check_id | Fires | HARD_FAIL when |
|---|---|---|
| `allergy_check` | allergy status known/absent | drug shares a documented allergy cross-reactivity group |
| `interaction_check` | interactions present | a `critical` interaction (else WARN) |
| `renal_dosing_check` | renal rule + eGFR present | eGFR below a contraindication threshold (else WARN) |
| `schedule_8_check` | AU schedule S8 (SUSMP) | S8 drug needs a PDMP/SafeScript check not performed |
| `nti_check` | NTI drug | NTI drug with NO documented monitoring plan |
| `age_appropriateness_check` | age known/absent | known paediatric (<18) → flag, no dose |

**Status precedence:** `HARD_FAIL` (terminal) > `BLOCKED_NO_PROOF` (any NOT_RUN / unknown drug) > `WARN` > `PASS`. Dose guidance is attached ONLY on PASS/WARN and never for a paediatric case. An **unknown drug** (not in the signed datastore) → `BLOCKED_NO_PROOF` (escalate), unless already HARD_FAIL.

## 3. Frozen wire contracts (READ-ONLY — do not edit)

### 3.1 `pharm-intent.schema.json` (input)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://heydoc.local/schemas/pharm-intent.schema.json",
  "title": "PharmIntent",
  "description": "A structured pharmacology safety check request produced by Trunk 8.0 and submitted to the pharm.intent MCP tool. The intent captures WHAT is being considered (drug class, clinical indication, route, patient context) without specifying dosages — Trunk 8.0 is explicitly constrained from emitting doses. The firewall (pharm.check) determines whether the intent is safe, warns of risks, or issues a HARD_FAIL. The intent_id returned by pharm.intent is then passed to pharm.check. Both responses are captured in PharmCheck (File 7). The intent must be grounded: diagnosis_snomed_ref and patient_facts_ref must correspond to EvidenceNodes and facts in the ContextPacket, and every clinical claim must be backed by receipts.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "intent_id",
    "session_ref",
    "intent_type",
    "drug_intent",
    "patient_facts_ref",
    "mode"
  ],
  "properties": {
    "intent_id": {
      "type": "string",
      "minLength": 8,
      "description": "Unique identifier for this pharmacology intent. Generated by the pharm.intent MCP tool upon receipt of the request, returned to Trunk 8.0, and then passed as the key argument to pharm.check. Convention: 'pharm-<epoch-ms>-<random-7-chars>'. This ID links intent to check and to the Receipt in ContextPacket.pharm_check_receipt.",
      "examples": [
        "pharm-1719014400001-b4d8e1f",
        "pharm-1719014400002-c5e9f3a"
      ]
    },
    "session_ref": {
      "type": "string",
      "minLength": 6,
      "description": "The encounter/session ID this intent belongs to. Matches ContextGraph.encounter_id, ContextPacket.session_ref, and VerificationReport.session_ref. Essential for joining pharmacology events to the clinical session in audit logs.",
      "examples": [
        "enc-20260623-001",
        "enc-stub-008"
      ]
    },
    "intent_type": {
      "type": "string",
      "enum": [
        "new_prescription",
        "dose_continuation",
        "dose_review",
        "cessation",
        "drug_class_consideration",
        "analgesia_consideration",
        "antibiotic_consideration",
        "emergency_medication"
      ],
      "description": "The category of pharmacological action being considered. 'new_prescription': proposing a medication not currently on the patient's list. 'dose_continuation': checking safety of an existing medication continuing unchanged. 'dose_review': flagging an existing medication for a safety reassessment (e.g. renal function change). 'cessation': proposing to stop or taper a current medication. 'drug_class_consideration': evaluating a drug class without committing to a specific agent — the appropriate form when Trunk 8.0 cannot specify a drug without dosage context (enforces the no-dosage constraint). 'analgesia_consideration': pain management intent — triggers NTI, S8, and renal checks automatically. 'antibiotic_consideration': antimicrobial intent — triggers stewardship, allergy, and interaction checks automatically. 'emergency_medication': urgent safety-critical intent — processed with highest firewall priority."
    },
    "drug_intent": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "drug_name",
        "drug_class"
      ],
      "description": "The drug or drug class being considered. CRITICAL CONSTRAINT: specific dose amounts MUST NOT appear in this object — Trunk 8.0 is constrained from emitting dosages. Dose ranges are determined by the firewall as output, not provided as input by the trunk. The firewall requires drug identity (name/class/code) and route to run its checks; it does not need a proposed dose to determine PASS/WARN/HARD_FAIL.",
      "properties": {
        "drug_name": {
          "type": "string",
          "minLength": 2,
          "description": "Generic drug name (AMH preferred). Use the Australian Medicines Handbook generic name. If only the drug class is known, populate drug_class and leave drug_name as the class name. Do NOT use trade names as the primary value — they may be listed in description.",
          "examples": [
            "paracetamol",
            "ibuprofen",
            "amoxicillin",
            "metformin",
            "aspirin",
            "oxycodone",
            "warfarin",
            "methotrexate"
          ]
        },
        "drug_class": {
          "type": "string",
          "minLength": 2,
          "description": "Pharmacological class. Required even when drug_name is specific — the firewall uses class-level rules (e.g. all NSAIDs trigger renal check; all opioids trigger S8 check). Use standard ATC class names where possible.",
          "examples": [
            "analgesic_paracetamol",
            "NSAID",
            "penicillin_antibiotic",
            "biguanide_antidiabetic",
            "antiplatelet",
            "opioid_analgesic",
            "oral_anticoagulant_vitamin_k_antagonist",
            "antimetabolite_DMARD",
            "ACE_inhibitor",
            "statin"
          ]
        },
        "amt_snomed_code": {
          "type": "string",
          "description": "Optional. Australian Medicines Terminology (AMT) SNOMED CT code for the specific drug. Must correspond to an entry in the Digital Tablet's MedicationRequest.medicationCode.example_AMT_SNOMED. When populated, requires a matching terminology lookup receipt in the ContextPacket — if this code was produced by the LLM without a receipt, the verifier will reject it.",
          "examples": [
            "387517004",
            "387207008",
            "372687004",
            "109081006",
            "7947003",
            "55452001",
            "372756006"
          ]
        },
        "terminology_receipt_id": {
          "type": "string",
          "description": "Optional but required when amt_snomed_code is populated. The request_id of the terminology lookup Receipt that confirmed this AMT code. Must appear in ContextPacket.receipts[] and in an EvidenceNode.supports[] with kind='live_data_receipt'. This is the double-reference pattern established in evidence-node.schema.json.",
          "examples": [
            "term-1719014400000-a3f7b2c"
          ]
        },
        "route": {
          "type": "string",
          "enum": [
            "oral",
            "sublingual",
            "topical",
            "inhaled",
            "intranasal",
            "intravenous",
            "intramuscular",
            "subcutaneous",
            "rectal",
            "transdermal",
            "intrathecal",
            "intraarticular",
            "ophthalmic",
            "otic",
            "unknown"
          ],
          "description": "Optional. Intended route of administration. The firewall uses route for route-appropriateness checks — for example, IV medications are flagged as inappropriate for a telehealth-only consult; certain routes require S8 special consideration. 'unknown' when Trunk 8.0 cannot determine route from the context packet."
        },
        "pbs_code": {
          "type": "string",
          "description": "Optional. PBS (Pharmaceutical Benefits Scheme) item code if known. Enables the firewall to confirm PBS subsidy status and flag authority prescription requirements. Format: 4-5 digit PBS code.",
          "examples": [
            "8134B",
            "5550J",
            "2025L"
          ]
        },
        "schedule": {
          "type": "string",
          "enum": [
            "S2",
            "S3",
            "S4",
            "S4D",
            "S8",
            "unscheduled",
            "unknown"
          ],
          "description": "Optional. Australian scheduling classification. S8 triggers mandatory controlled-substance gating checks. S4D (drugs of dependence) triggers risk-benefit assessment. The firewall will independently confirm scheduling — this field is a hint to pre-trigger the appropriate checks.",
          "examples": [
            "S4",
            "S8",
            "S4D"
          ]
        },
        "is_nti_candidate": {
          "type": "boolean",
          "description": "Optional. True if Trunk 8.0 identifies this drug as a Narrow Therapeutic Index candidate requiring monitoring (e.g. warfarin, lithium, digoxin, phenytoin, cyclosporin, aminoglycosides, vancomycin). When true, the firewall must run the NTI check regardless of other inputs. The firewall maintains its own NTI list — this flag is an LLM-generated hint, not the authoritative NTI determination.",
          "examples": [
            true,
            false
          ]
        },
        "description": {
          "type": "string",
          "maxLength": 200,
          "description": "Optional. Free-text clarification. Use for: trade names, combination products, compounded preparations, or clinical context the structured fields cannot capture. Must not include specific dose amounts.",
          "examples": [
            "Patient requests Nurofen by name — generic ibuprofen",
            "Fixed-dose combination Seretide (fluticasone/salmeterol) — inhaled",
            "Patient currently on compounded topical diclofenac"
          ]
        }
      }
    },
    "indication": {
      "type": "object",
      "additionalProperties": false,
      "description": "Optional but strongly recommended. The clinical indication for this drug intent. Without this, the firewall cannot assess whether the drug is appropriate for the condition, flag contraindications by indication, or confirm PBS authority requirements.",
      "properties": {
        "diagnosis_snomed_code": {
          "type": "string",
          "description": "SNOMED CT code of the primary diagnosis driving this intent. Must correspond to a code in Digital Tablet's Condition.code.example_SNOMED and must have a matching terminology lookup receipt in the ContextPacket.",
          "examples": [
            "279039007",
            "44054006",
            "59621000",
            "195967001",
            "49436004"
          ]
        },
        "diagnosis_display": {
          "type": "string",
          "description": "Human-readable SNOMED display term for the diagnosis.",
          "examples": [
            "Low back pain",
            "Type 2 diabetes mellitus",
            "Essential hypertension",
            "Asthma",
            "Atrial fibrillation"
          ]
        },
        "terminology_receipt_id": {
          "type": "string",
          "description": "The request_id of the terminology lookup Receipt for the diagnosis code. Same double-reference pattern as drug_intent.terminology_receipt_id.",
          "examples": [
            "term-1719014400003-d6f0a3h"
          ]
        },
        "indication_narrative": {
          "type": "string",
          "maxLength": 300,
          "description": "Optional. Plain-language clinical rationale for why this drug is being considered for this patient and condition. Should mirror the indication_stated field in Digital Tablet's MedicationRequest._freetext_medication_tags.",
          "examples": [
            "Non-specific low back pain, no red flags, considering analgesia for pain management",
            "Type 2 diabetes mellitus inadequately controlled on lifestyle measures alone",
            "Atrial fibrillation with CHA2DS2-VASc score ≥2, anticoagulation indicated"
          ]
        }
      }
    },
    "patient_facts_ref": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "packet_session_ref"
      ],
      "description": "References to the patient facts in the ContextPacket that the firewall must use for its safety checks. The firewall pulls allergy, current medication, and renal/hepatic function data from the ContextPacket using these references — it does NOT have independent access to the patient record. If required facts are missing from the packet, the check result will be BLOCKED_NO_PROOF.",
      "properties": {
        "packet_session_ref": {
          "type": "string",
          "description": "The session_ref of the ContextPacket containing the patient facts. Matches ContextPacket.session_ref. The firewall uses this to locate the correct packet in the session store.",
          "examples": [
            "enc-20260623-001",
            "enc-stub-008"
          ]
        },
        "allergy_fact_ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Optional. The fact_id values of allergy facts (category='allergy') from the ContextPacket facts[]. If empty, the firewall must treat allergy status as unknown and return WARN for any drug with clinically significant allergy risk profile. Corresponds to Digital Tablet's AllergyIntolerance resource.",
          "examples": [
            [
              "fact-003",
              "fact-004"
            ],
            []
          ]
        },
        "current_medication_fact_ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Optional. The fact_id values of current medication facts (category='medication') from the ContextPacket. The firewall uses these for drug-drug interaction checks. If empty, interaction checks run with unknown status. Corresponds to Digital Tablet's MedicationRequest resources.",
          "examples": [
            [
              "fact-005",
              "fact-006",
              "fact-007"
            ],
            []
          ]
        },
        "renal_function_fact_ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Optional. The fact_id values of renal function facts (category='lab_result', fhir_path='Observation.pathology_map.eGFR') from the ContextPacket. Required for renal dosing adjustment checks. If empty, renal checks run with unknown status and return WARN for renally-dosed drugs. SNOMED 80274001, LOINC 69405-9.",
          "examples": [
            [
              "fact-011"
            ],
            []
          ]
        },
        "hepatic_function_fact_ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Optional. fact_id values for hepatic function facts (ALT/AST/Bilirubin/Albumin or Child-Pugh score). Required for hepatically-metabolised drugs with narrow therapeutic windows. SNOMED 250637003 (ALT/AST).",
          "examples": [
            [
              "fact-012",
              "fact-013"
            ],
            []
          ]
        },
        "pregnancy_status_fact_id": {
          "type": "string",
          "description": "Optional. fact_id of the pregnancy status fact (category='demographic', fhir_path='Patient.extensions' or SDOH). Required for teratogenicity and contraindication-in-pregnancy checks. If absent, pregnancy status is unknown — the firewall will WARN for any drug with Category D or X teratogenicity.",
          "examples": [
            "fact-002"
          ]
        }
      }
    },
    "checks_requested": {
      "type": "array",
      "description": "Optional. Explicit list of which firewall checks Trunk 8.0 is requesting. When omitted, the firewall runs all applicable checks based on intent_type, drug_class, and schedule. When populated, the firewall runs at minimum all requested checks — it may still run additional mandatory checks (e.g. NTI check always runs for known NTI drugs regardless of this list).",
      "items": {
        "type": "string",
        "enum": [
          "nti_check",
          "allergy_check",
          "interaction_check",
          "renal_dosing_check",
          "hepatic_check",
          "pregnancy_check",
          "schedule_8_check",
          "age_appropriateness_check",
          "route_appropriateness_check"
        ]
      },
      "examples": [
        [
          "allergy_check",
          "interaction_check",
          "renal_dosing_check"
        ],
        [
          "nti_check",
          "allergy_check"
        ],
        [
          "schedule_8_check",
          "allergy_check",
          "interaction_check"
        ]
      ]
    },
    "clinical_context": {
      "type": "object",
      "additionalProperties": false,
      "description": "Optional. Additional clinical context that affects firewall check logic but doesn't fit into structured fields. All values here are strings — the firewall interprets them for its rules engine.",
      "properties": {
        "patient_age_years": {
          "type": "integer",
          "minimum": 0,
          "maximum": 120,
          "description": "Patient age in years for age-appropriateness checks. Paediatric (<18) and geriatric (≥65) patients require different dose adjustment rules. Drawn from Digital Tablet's Patient.birthDate."
        },
        "patient_weight_kg": {
          "type": "number",
          "minimum": 0,
          "description": "Optional patient weight in kg for weight-based dosing checks. Drawn from ContextPacket facts (category='vital_sign', fhir_path='Observation.vital_signs_full_map.Weight')."
        },
        "encounter_setting": {
          "type": "string",
          "enum": [
            "telehealth_chat",
            "telehealth_video",
            "in_person",
            "emergency"
          ],
          "description": "Encounter context — affects route_appropriateness_check. IV and IM routes are flagged as inappropriate in telehealth_chat settings. Matches ContextPacket.grounding_plan_summary context."
        },
        "prescriber_type": {
          "type": "string",
          "enum": [
            "gp",
            "specialist",
            "nurse_practitioner",
            "pharmacist_prescriber",
            "ai_doctor_recommendation"
          ],
          "description": "Who will ultimately prescribe — affects S8 authority check and whether prescriber-specific restrictions apply. 'ai_doctor_recommendation' means the AI Doctor is flagging the drug for a human prescriber to action, not prescribing autonomously."
        },
        "antibiotic_stewardship_context": {
          "type": "string",
          "description": "Optional. For antibiotic_consideration intents: empirical vs culture-directed, duration intended, any prior antibiotic courses in this episode. Maps to Digital Tablet's MedicationRequest._freetext_medication_tags.antibiotic_stewardship.",
          "examples": [
            "Empirical choice pending MSU culture; 5-day course intended; no prior antibiotics this episode"
          ]
        },
        "s8_monitoring_context": {
          "type": "string",
          "description": "Optional. For S8 opioid intents: prior S8 exposure, PDMP checked status, urine drug screen status, risk assessment. Maps to Digital Tablet's MedicationRequest._freetext_medication_tags.S8_monitoring.",
          "examples": [
            "PDMP not checked — required before any S8 consideration; no prior opioid history documented"
          ]
        }
      }
    },
    "blocking_reasons_from_trunk": {
      "type": "array",
      "description": "Optional. Reasons Trunk 8.0 has already identified that make this intent likely to be blocked — included to pre-populate the firewall with known concerns before the check runs. These are LLM-generated observations, not authoritative firewall outcomes. The firewall's PharmCheck result is authoritative regardless of what is listed here.",
      "items": {
        "type": "string"
      },
      "examples": [
        [
          "Allergy status unknown — patient did not confirm NKDA",
          "Renal function facts absent from current ContextPacket"
        ],
        [
          "Current medication list includes warfarin — interaction check mandatory"
        ],
        []
      ]
    },
    "mode": {
      "type": "string",
      "enum": [
        "live",
        "dry_run",
        "mock"
      ],
      "description": "Operating mode passed to pharm.intent and pharm.check MCP tools. Must match the mode in the ContextPacket.receipts[]. 'mock' during all development and testing; 'live' only when a real pharmacology vendor API is connected (MIMS-AU or equivalent configured in mcpServers.template.json PHARM_ENDPOINT).",
      "default": "mock"
    },
    "created_at_utc": {
      "type": "string",
      "format": "date-time",
      "description": "Optional. ISO 8601 UTC timestamp of when Trunk 8.0 created this intent object. For audit trail — establishes when the clinical intent was first formalised in the pipeline turn."
    }
  },
  "_integration_notes": {
    "trunk_8_output_contract": "Trunk 8.0 system prompt specifies output includes: pharm_intent_payload, firewall_status, blocking_reasons, next_data_requests, evidence_refs. This schema formalises pharm_intent_payload as a structured JSON object. The other fields remain as free-text in the Trunk 8.0 output and are assessed by the verifier.",
    "no_dosage_constraint": "Trunk 8.0 is explicitly constrained to emit NO specific dosages. This schema enforces that constraint structurally — there is no dose field anywhere in PharmIntent. The drug_intent captures drug identity and route only. Dose ranges are output of PharmCheck, not input from the trunk.",
    "flow": [
      "1. Trunk 8.0 generates PharmIntent JSON from ContextPacket facts",
      "2. pharm.intent MCP tool receives PharmIntent, assigns intent_id, returns Receipt",
      "3. pharm.check MCP tool receives intent_id, runs safety checks, returns PharmCheck (File 7)",
      "4. PharmCheck result determines firewall_status in Trunk 8.0 output",
      "5. HARD_FAIL blocks pipeline continuation (triggers ContextPacket.blocked=true in next turn)",
      "6. PharmCheck receipt is stored in ContextPacket.pharm_check_receipt",
      "7. VerificationReport.hard_stops populated if HARD_FAIL detected in Trunk 8.0 output"
    ],
    "digital_tablet_refs": {
      "drug_codes": "MedicationRequest.medicationCode.example_AMT_SNOMED — 48 AMT SNOMED codes",
      "allergy": "AllergyIntolerance.substance_SNOMED_examples — 29 allergen codes",
      "current_meds": "MedicationRequest.status=active entries in patient record",
      "renal": "Observation.pathology_map.eGFR (SNOMED 80274001, LOINC 69405-9)",
      "hepatic": "Observation.pathology_map.ALT/AST/Bilirubin/Albumin",
      "schedule": "MedicationRequest.extensions.schedule_8_controlled (S4|S8|S4D)",
      "pbs": "MedicationRequest.extensions.PBS_item_code"
    },
    "schema_refs": {
      "consumed_by": "pharm-check.schema.json (File 7) — PharmCheck.intent_id matches PharmIntent.intent_id",
      "receipt_ref": "receipt.schema.json (File 1) — pharm.intent returns a Receipt; request_id stored in ContextPacket.pharm_check_receipt",
      "terminology_ref": "If drug or diagnosis codes populated, terminology-lookup.schema.json receipts required",
      "packet_ref": "context-packet.schema.json (File 4) — patient_facts_ref.packet_session_ref matches ContextPacket.session_ref; patient_facts_ref.*_fact_ids match ContextPacket.facts[].fact_id",
      "report_ref": "verification-report.schema.json (File 5) — HARD_FAIL from PharmCheck appears in VerificationReport.hard_stops"
    },
    "nti_drugs_examples": "warfarin (372756006), lithium (387512003), digoxin, phenytoin (387255006), carbamazepine (387222003), cyclosporin, tacrolimus, aminoglycosides (tobramycin, gentamicin), vancomycin, methotrexate — these always trigger is_nti_candidate=true",
    "s8_drugs_examples": "oxycodone (55452001), morphine (373529000), fentanyl, hydromorphone, buprenorphine, methadone — always trigger schedule_8_check"
  }
}
```

### 3.2 `pharm-check.schema.json` (output)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://heydoc.local/schemas/pharm-check.schema.json",
  "title": "PharmCheck",
  "description": "The response from the pharmacology firewall (pharm.check MCP tool). This is the authoritative safety determination for a clinical drug intent. It receives the intent_id from PharmIntent (File 6), runs deterministic checks against the patient facts in the ContextPacket, and returns a structured result. The 'status' field is the gate: HARD_FAIL must block pipeline continuation unconditionally. WARN allows continuation with documented caution. PASS allows continuation. BLOCKED_NO_PROOF means required patient facts were absent and no determination could be made. The Receipt in this object is stored in ContextPacket.pharm_check_receipt and backs the hard_stop_enforcement check in the VerificationReport. Dose guidance appears here as OUTPUT — this is the only schema in the HeyDoc set where specific dose information is permitted, because it comes from the deterministic firewall vendor, not from LLM generation.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "check_id",
    "intent_id",
    "session_ref",
    "status",
    "check_results",
    "flags",
    "receipt"
  ],
  "properties": {
    "check_id": {
      "type": "string",
      "minLength": 8,
      "description": "Unique identifier for this pharmacology check result. Generated by the pharm.check MCP tool. Convention: 'pharmchk-<epoch-ms>-<random-7-chars>'. Distinct from intent_id — one intent produces exactly one check result, but the check_id is the authoritative identifier for the check artifact.",
      "examples": [
        "pharmchk-1719014400005-e7a1b2c",
        "pharmchk-1719014400006-f8b2c3d"
      ]
    },
    "intent_id": {
      "type": "string",
      "minLength": 8,
      "description": "The intent_id from the corresponding PharmIntent (File 6) that triggered this check. This is the cross-reference key linking intent to result. Must match PharmIntent.intent_id exactly.",
      "examples": [
        "pharm-1719014400001-b4d8e1f"
      ]
    },
    "session_ref": {
      "type": "string",
      "minLength": 6,
      "description": "The encounter/session ID. Matches PharmIntent.session_ref, ContextPacket.session_ref, and VerificationReport.session_ref.",
      "examples": [
        "enc-20260623-001",
        "enc-stub-008"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "PASS",
        "WARN",
        "HARD_FAIL",
        "BLOCKED_NO_PROOF"
      ],
      "description": "The overall firewall determination. PASS: all checks passed — the drug intent is safe to proceed with standard clinical care. The LLM and orchestrator may continue. WARN: one or more checks raised a concern that requires documented caution but does not block continuation — the relevant flags must be surfaced to the clinician. HARD_FAIL: at least one check found a condition that makes the drug intent unsafe to proceed — pipeline continuation MUST be blocked. The specific reason must appear in flags[] with severity='critical' and in VerificationReport.hard_stops. BLOCKED_NO_PROOF: the firewall could not complete the required checks because essential patient facts (allergy status, current medications, renal function) were absent from the ContextPacket. This is not a PASS or a FAIL — it is an explicit statement that safety cannot be determined, which must also block clinical action. Trunk 8.0 must surface BLOCKED_NO_PROOF to the clinician with a list of the missing facts (next_data_requests in its output)."
    },
    "check_results": {
      "type": "array",
      "minItems": 1,
      "description": "Per-check outcomes — one item for each check that was run. The checks actually run depend on the intent_type, drug_class, and the checks_requested field in PharmIntent. Checks that could not run due to missing facts have status='NOT_RUN'. Checks not applicable to this intent/drug combination may be omitted entirely.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "check_id",
          "status"
        ],
        "properties": {
          "check_id": {
            "type": "string",
            "enum": [
              "nti_check",
              "allergy_check",
              "interaction_check",
              "renal_dosing_check",
              "hepatic_check",
              "pregnancy_check",
              "schedule_8_check",
              "age_appropriateness_check",
              "route_appropriateness_check"
            ],
            "description": "The check that was run. Enum matches PharmIntent.checks_requested exactly — the same nine checks, now producing a result."
          },
          "status": {
            "type": "string",
            "enum": [
              "PASS",
              "WARN",
              "HARD_FAIL",
              "NOT_RUN"
            ],
            "description": "Result of this specific check. NOT_RUN means the check was applicable but could not execute because required patient facts were absent from the ContextPacket. NOT_RUN on a mandatory check (allergy, NTI for known NTI drugs) contributes to BLOCKED_NO_PROOF at the overall status level."
          },
          "severity": {
            "type": "string",
            "enum": [
              "critical",
              "moderate",
              "low"
            ],
            "description": "Required when status is WARN or HARD_FAIL. Severity of the finding. 'critical': HARD_FAIL-level severity — must block continuation. 'moderate': WARN-level — proceed with documented caution and monitoring plan. 'low': advisory note — document but does not affect continuation. Severity mapping by check: allergy_check confirmed allergy=critical; allergy_check cross-reactivity=moderate. interaction_check severe interaction=critical; interaction_check moderate interaction=moderate. nti_check without monitoring plan=critical. renal_dosing_check eGFR<30=critical; eGFR 30-60=moderate. pregnancy_check Category X=critical; Category D=moderate. schedule_8_check no PDMP=critical. age_appropriateness_check Beers Criteria=moderate. route_appropriateness_check IV in telehealth=low."
          },
          "reason": {
            "type": "string",
            "minLength": 5,
            "description": "Required when status is WARN or HARD_FAIL. Human-readable explanation of the finding. Should be specific enough for a prescribing clinician to act on without needing to re-run the check. Reference the specific patient fact involved where possible.",
            "examples": [
              "Patient has documented allergy to ibuprofen (urticaria, confirmed) — NSAID class contraindicated",
              "Warfarin + aspirin combination: known severe interaction — INR unstable risk; requires specialist review and monitoring plan",
              "eGFR 35 mL/min/1.73m2: metformin requires dose reduction and increased monitoring; contraindicated below eGFR 30",
              "Oxycodone S8 intent: PDMP check not documented in current ContextPacket — required before S8 consideration",
              "Warfarin is NTI drug: INR monitoring plan must be documented before prescribing; no prior INR result in ContextPacket",
              "IV route flagged in telehealth_chat context: route not achievable without in-person attendance"
            ]
          },
          "missing_facts_required": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Populated when status='NOT_RUN'. Lists the specific fact_ids or fact types that were required to run this check but were absent from the ContextPacket. These are the inputs to Trunk 8.0's 'next_data_requests' output field.",
            "examples": [
              [
                "Allergy status facts absent (category='allergy') from ContextPacket"
              ],
              [
                "Renal function fact absent (category='lab_result', fhir_path='Observation.pathology_map.eGFR')"
              ],
              [
                "Current medication list absent (category='medication') — interaction check cannot run"
              ]
            ]
          },
          "sources_used": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Optional. The fact_ids from the ContextPacket that this check evaluated. Cross-references ContextPacket.facts[].fact_id values. Enables the audit trail to show exactly which patient facts drove each check result.",
            "examples": [
              [
                "fact-003",
                "fact-004"
              ],
              [
                "fact-011"
              ],
              [
                "fact-005",
                "fact-006",
                "fact-007"
              ]
            ]
          }
        }
      }
    },
    "flags": {
      "type": "array",
      "description": "Structured list of specific safety signals from the check run. Each flag represents one discrete finding — an allergy match, a drug interaction pair, an NTI drug without monitoring, etc. Empty array when status='PASS'. HARD_FAIL status requires at least one flag with severity='critical'.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "flag_id",
          "flag_type",
          "severity",
          "description"
        ],
        "properties": {
          "flag_id": {
            "type": "string",
            "description": "Unique identifier for this flag within the check result. Convention: 'flag-<check_id_abbrev>-<seq>', e.g. 'flag-allergy-001'.",
            "examples": [
              "flag-allergy-001",
              "flag-nti-001",
              "flag-interaction-001",
              "flag-renal-001"
            ]
          },
          "flag_type": {
            "type": "string",
            "enum": [
              "nti",
              "allergy_confirmed",
              "allergy_cross_reactivity",
              "interaction_severe",
              "interaction_moderate",
              "renal_adjustment_required",
              "renal_contraindicated",
              "hepatic_adjustment_required",
              "hepatic_contraindicated",
              "pregnancy_category_x",
              "pregnancy_category_d",
              "schedule_8_pdmp_required",
              "schedule_8_authority_required",
              "age_beers_criteria",
              "age_paediatric_weight_based",
              "route_not_achievable_in_setting",
              "stewardship_narrow_spectrum_preferred",
              "stewardship_culture_pending"
            ],
            "description": "The specific type of safety signal. Drives how Trunk 8.0 and the clinician portal present the finding. allergy_confirmed: documented allergy exists to this drug or class — always HARD_FAIL/critical. allergy_cross_reactivity: cross-reactivity risk between documented allergen and proposed drug (e.g. penicillin allergy + cephalosporin) — WARN/moderate. interaction_severe: known severe interaction with a current medication — HARD_FAIL/critical. interaction_moderate: moderate interaction requiring monitoring — WARN/moderate. renal_contraindicated: drug absolutely contraindicated at current eGFR — HARD_FAIL/critical. renal_adjustment_required: dose reduction needed but drug permissible — WARN/moderate. pregnancy_category_x: drug known teratogen, absolutely contraindicated — HARD_FAIL/critical. pregnancy_category_d: evidence of fetal risk, may be used if benefit justifies — WARN/moderate. schedule_8_pdmp_required: S8 opioid intent without documented PDMP check — HARD_FAIL/critical per Australian S8 requirements."
          },
          "severity": {
            "type": "string",
            "enum": [
              "critical",
              "moderate",
              "low"
            ],
            "description": "Flag-level severity. At least one critical flag → overall status must be HARD_FAIL. Any moderate flag with no critical flags → status must be WARN. All low flags → status may be PASS."
          },
          "description": {
            "type": "string",
            "minLength": 10,
            "description": "Human-readable description of this specific finding. Should be self-contained — a clinician reading only this field should understand what the risk is and why.",
            "examples": [
              "Documented allergy to aspirin (urticaria, confirmed high criticality, AllergyIntolerance ID fact-003) — this patient must not receive aspirin or other salicylates",
              "Warfarin (current) + ibuprofen (proposed NSAID): severe interaction — increased bleeding risk; warfarin effect potentiated. Requires haematology review before any NSAID consideration.",
              "eGFR 35 mL/min/1.73m2 (fact-011): metformin contraindicated below eGFR 30; close monitoring required at eGFR 30-45; dose reduction recommended; review at 3 months",
              "Oxycodone S8: Australian Schedule 8 requires PDMP (SafeScript WA) check before prescribing; no PDMP check documented in current ContextPacket"
            ]
          },
          "drug_a": {
            "type": "string",
            "description": "For interaction flags: the drug already on the patient's medication list (from Digital Tablet MedicationRequest). Use generic name.",
            "examples": [
              "warfarin",
              "metformin",
              "lithium"
            ]
          },
          "drug_b": {
            "type": "string",
            "description": "For interaction flags: the proposed drug from PharmIntent. Use generic name.",
            "examples": [
              "aspirin",
              "ibuprofen",
              "trimethoprim"
            ]
          },
          "allergen_snomed_code": {
            "type": "string",
            "description": "For allergy flags: the SNOMED CT code of the allergen from Digital Tablet's AllergyIntolerance.substance_SNOMED_examples. Must have a corresponding terminology receipt in the ContextPacket.",
            "examples": [
              "387458008",
              "372687004",
              "372632000"
            ]
          },
          "reaction_snomed_code": {
            "type": "string",
            "description": "For allergy flags: the SNOMED CT code of the documented reaction from Digital Tablet's AllergyIntolerance.reaction_manifestation_SNOMED.",
            "examples": [
              "39579001",
              "126485001",
              "41291007",
              "16402000"
            ]
          },
          "renal_threshold": {
            "type": "object",
            "additionalProperties": false,
            "description": "For renal flags: the eGFR thresholds that triggered this flag.",
            "properties": {
              "patient_egfr": {
                "type": "number",
                "description": "Patient's eGFR value from ContextPacket fact. Units: mL/min/1.73m2. LOINC 69405-9, SNOMED 80274001."
              },
              "contraindicated_below": {
                "type": "number",
                "description": "eGFR threshold below which this drug is absolutely contraindicated. Null if no absolute contraindication exists.",
                "examples": [
                  30,
                  15,
                  45
                ]
              },
              "dose_reduction_below": {
                "type": "number",
                "description": "eGFR threshold below which dose reduction is required.",
                "examples": [
                  60,
                  45,
                  30
                ]
              }
            }
          },
          "au_reference": {
            "type": "string",
            "description": "Optional. Australian regulatory or prescribing reference for this flag. Used by the clinician portal to display context and by the verifier as a grounding anchor.",
            "examples": [
              "AMH 2024 — metformin: contraindicated eGFR <30",
              "SafeScript WA — S8 opioid prescribing requirements",
              "MIMS AU — warfarin interactions module",
              "NPS MedicineWise — NSAID prescribing in CKD"
            ]
          }
        }
      }
    },
    "dose_guidance": {
      "type": "object",
      "additionalProperties": false,
      "description": "Dose guidance output from the firewall — the ONLY place in the HeyDoc schema set where specific dose information appears. This is deterministic firewall vendor output, not LLM-generated content. Only present when status is PASS or WARN (a safe or cautious dose exists). Absent when status is HARD_FAIL (no dose is safe) or BLOCKED_NO_PROOF (safety cannot be determined). Trunk 8.0 must not generate this — it receives it as part of the PharmCheck response and surfaces it to the clinician without modification.",
      "properties": {
        "safe_dose_range": {
          "type": "string",
          "description": "Human-readable dose range considered safe for this patient given their current clinical context. Format: '<dose> <frequency>, max <max_dose>/<period>'. Examples produced by the firewall vendor, not generated by LLM.",
          "examples": [
            "500mg–1g QID orally, max 4g/day (standard renal function)",
            "500mg BD orally, max 1g/day (eGFR 35 — dose reduction applied)",
            "400mg TID orally, max 1.2g/day (short-course analgesia only)",
            "2.5mg nocte orally initially (age ≥65, Beers Criteria — start low go slow)"
          ]
        },
        "adjustment_required": {
          "type": "boolean",
          "description": "True if dose adjustment from standard dosing was required due to patient-specific factors (renal impairment, age, weight, hepatic dysfunction, drug interaction)."
        },
        "adjustment_reason": {
          "type": "string",
          "description": "Present when adjustment_required=true. The specific patient factor that drove the dose adjustment.",
          "examples": [
            "eGFR 35 mL/min/1.73m2 — 50% dose reduction applied per AMH renal dosing guidelines",
            "Age 72 years — geriatric starting dose per Beers Criteria recommendation",
            "Weight 48kg — weight-based paediatric/low-body-weight adjustment applied"
          ]
        },
        "monitoring_required": {
          "type": "string",
          "description": "Monitoring plan required alongside this drug. Especially important for NTI drugs and renally-adjusted drugs. Should include frequency and target parameter.",
          "examples": [
            "INR weekly for 4 weeks, then monthly when stable (warfarin)",
            "eGFR and electrolytes at 2 weeks, then 3-monthly (metformin in CKD)",
            "Lithium level 5–7 days after initiation or dose change; target 0.6–0.8 mmol/L (maintenance)",
            "Renal function and LFT at 3 months (methotrexate)"
          ]
        },
        "duration_guidance": {
          "type": "string",
          "description": "Optional. Recommended treatment duration where evidence-based guidance exists. Particularly important for antibiotics (antibiotic stewardship) and short-course analgesics.",
          "examples": [
            "5–7 days (uncomplicated UTI)",
            "3 days (uncomplicated lower UTI in women, trimethoprim)",
            "Short course ≤5 days recommended (acute low back pain, NSAIDs)",
            "Ongoing — chronic disease management, review annually"
          ]
        },
        "pbs_authority_required": {
          "type": "boolean",
          "description": "Optional. True if PBS authority prescription is required for this drug at the indicated dose for this indication. Relevant to Australian script generation in the post-consult pathway.",
          "examples": [
            true,
            false
          ]
        },
        "pbs_item_code": {
          "type": "string",
          "description": "Optional. PBS item code for the specific drug/dose/indication combination. Matches Digital Tablet MedicationRequest.extensions.PBS_item_code.",
          "examples": [
            "8134B",
            "5550J",
            "2025L"
          ]
        }
      }
    },
    "next_data_requests": {
      "type": "array",
      "description": "Optional. Facts that were required for a complete safety check but absent from the ContextPacket. Populated when any check has status='NOT_RUN' or when overall status is 'BLOCKED_NO_PROOF'. Trunk 8.0 surfaces these as its 'next_data_requests' output field so the clinician or next turn can provide the missing information. Each item should be a specific, actionable fact request.",
      "items": {
        "type": "string"
      },
      "examples": [
        [
          "Allergy status required: confirm NKDA or document known allergies",
          "Renal function required: eGFR result needed for renal dosing check",
          "Current medication list required for interaction check"
        ],
        [
          "S8 opioid: PDMP (SafeScript WA) check required before prescribing",
          "Pregnancy status required: confirm not pregnant for this drug class"
        ],
        []
      ]
    },
    "receipt": {
      "type": "object",
      "description": "Receipt object. $ref receipt.schema.json. Required fields: request_id (convention 'pharmchk-<epoch-ms>-<random>'), timestamp_utc, upstream ('stub' in dev, 'MIMS-AU' or equivalent in live), mode.",
      "$ref": "receipt.schema.json"
    },
    "vendor_reference": {
      "type": "string",
      "description": "Optional. The pharmacology vendor's own reference ID for this check. Enables re-querying the vendor for audit trail or dispute resolution. Only populated when mode='live'.",
      "examples": [
        "MIMS-AU-TXN-20260623-00142",
        "LEXICOMP-CHK-987654"
      ]
    },
    "mode": {
      "type": "string",
      "enum": [
        "live",
        "dry_run",
        "mock"
      ],
      "description": "Operating mode. Must match PharmIntent.mode and the receipt.mode. 'mock' during development — check_results and dose_guidance are stub values, not real pharmacology determinations. 'live' only when PHARM_VENDOR and PHARM_ENDPOINT are configured with a real vendor API in mcpServers.template.json.",
      "default": "mock"
    },
    "checked_at_utc": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 UTC timestamp of when the firewall check was completed. Matches receipt.timestamp_utc for audit trail consistency."
    }
  },
  "_integration_notes": {
    "status_flow": {
      "PASS": "All check_results have status=PASS. dose_guidance may be present. Pipeline continues normally.",
      "WARN": "One or more check_results have status=WARN, none HARD_FAIL. dose_guidance present with adjustment. Trunk 8.0 must surface all WARN flags to clinician. Pipeline continues with documented caution.",
      "HARD_FAIL": "At least one check_result has status=HARD_FAIL with severity=critical. No dose_guidance. Pipeline MUST stop. ContextPacket.blocked=true for next turn. VerificationReport.hard_stops populated. Trunk 8.0 output must include HARD_FAIL and blocking_reasons.",
      "BLOCKED_NO_PROOF": "One or more mandatory checks could not run due to missing patient facts. No determination made. Treat as HARD_FAIL for pipeline gating purposes. Trunk 8.0 must output next_data_requests listing missing facts."
    },
    "hard_fail_triggers": [
      "allergy_check: confirmed allergy to drug or class (criticality=high in Digital Tablet AllergyIntolerance)",
      "interaction_check: known severe drug-drug interaction (e.g. warfarin + NSAID, warfarin + trimethoprim)",
      "nti_check: NTI drug with no monitoring plan documented in ContextPacket",
      "schedule_8_check: S8 opioid intent without documented PDMP check",
      "pregnancy_check: Category X drug in confirmed pregnancy",
      "renal_check: drug absolutely contraindicated at patient eGFR (e.g. metformin eGFR<30)"
    ],
    "dose_guidance_authority": "dose_guidance is the ONLY schema in the HeyDoc set where specific doses appear. They originate from the pharmacology vendor (MIMS-AU or equivalent), not from LLM generation. Trunk 8.0 must not generate dose values — it receives them from the PharmCheck and surfaces them verbatim without modification.",
    "digital_tablet_refs": {
      "allergy_substance_codes": "AllergyIntolerance.substance_SNOMED_examples — 29 allergen SNOMED codes",
      "allergy_reaction_codes": "AllergyIntolerance.reaction_manifestation_SNOMED — 17 reaction SNOMED codes (Anaphylaxis 39579001, SJS 16402000, etc.)",
      "renal_function": "Observation.pathology_map.eGFR (SNOMED 80274001, LOINC 69405-9, unit mL/min/1.73m2)",
      "hepatic_function": "Observation.pathology_map.ALT (SNOMED 250637003), AST, Bilirubin_total (SNOMED 61153008), Albumin (SNOMED 166817005)",
      "current_meds": "MedicationRequest.status=active entries; medicationCode.example_AMT_SNOMED for codes",
      "pbs_codes": "MedicationRequest.extensions.PBS_item_code",
      "schedule": "MedicationRequest.extensions.schedule_8_controlled (S4|S8|S4D)"
    },
    "schema_refs": {
      "depends_on_intent": "pharm-intent.schema.json (File 6) — intent_id cross-reference; checks_requested drives check_results[].check_id enum",
      "receipt_ref": "receipt.schema.json (File 1) — receipt field uses $ref; request_id stored in ContextPacket.pharm_check_receipt",
      "packet_ref": "context-packet.schema.json (File 4) — check_results[].sources_used references ContextPacket.facts[].fact_id; pharm_check_receipt field stores this receipt",
      "report_ref": "verification-report.schema.json (File 5) — HARD_FAIL status triggers VerificationReport.hard_stops; hard_stop_enforcement check in verifier.js looks for HARD_FAIL in Trunk 8.0 text output"
    },
    "au_context": {
      "s8_safescript": "Schedule 8 checks reference SafeScript WA (Western Australia's PDMP) — all S8 opioid intents require documented PDMP check before proceeding",
      "pbs_authority": "Some PBS items require authority prescriptions — dose_guidance.pbs_authority_required flags these",
      "amh_reference": "Australian Medicines Handbook is the dose guidance source for standard dosing; MIMS-AU for interactions and NTI monitoring"
    }
  }
}
```

## 4. Provenance block (mandatory on every clinical record)

```
{ source, source_ref, authored_by, reviewed_by:null, review_status:'draft'|'clinician_review'|'approved', version, effective_date }
```
The authoring pipeline FORCES `reviewed_by:null` + `review_status:'draft'` — nothing self-attests. `reviewed_by` is set only when a registered pharmacist signs off.

## 5. Capability organisation — heading overlay (APF22 taxonomy)

Capabilities are organised under **heading capabilities** by a NON-DESTRUCTIVE overlay (`capability-groups.json`) — grouping is metadata; no dataset is migrated or merged. NTI-as-bucket: `nti` and `tdm_parameters` both sit under Therapeutic drug monitoring; the frozen `nti_check` is unchanged.

- **Indications** `(indications)` → `clinical_uses`
- **Clinical pharmacology** `(clinical_pharmacology)` → `pharmacodynamics`, `pharmacokinetics`
- **Counselling** `(counselling)` → `warning_labels`, `counselling_points`, `precautions`
- **Dispensing considerations** `(dispensing_considerations)` → `administration_handling`, `formulations`
- **Safety & contraindications** `(safety_contraindications)` → `interactions`, `serious_adverse_effects`, `strong_contraindications`, `allergy`
- **Special populations** `(special_populations)` → `renal`
- **Therapeutic drug monitoring** `(therapeutic_drug_monitoring)` → `nti`, `tdm_parameters`
- **Dosing** `(dosing)` → `dose_guidance`, `dose_evidence`
- **Regulatory / reference** `(regulatory_reference)` → `scheduling`, `pbs`

## 6. Authorable enum vocabularies (exact `.strict()` values)

Author these fields to THESE values verbatim — `.strict()` rejects anything else, and a wrong value is HELD on ingest. Fields NOT listed (e.g. `mechanism_class`, `management_category`, `guidance`, `rationale`, `notes`) are free text. Introspected directly from the domain schemas, so this can never drift from the contract.

```
administration_handling.can_crush: [do_not_crush, crush_with_caution, crushable]
administration_handling.can_split: [splittable, do_not_split, scored_only, unknown]
administration_handling.can_disperse: [dispersible, not_dispersible, unknown]
tdm_parameters.sample_timing: [trough, peak, either, auc]
tdm_parameters.biological_fluid: [serum, plasma, whole_blood]
warning_labels.source_scheme: [RASML, PSA_CAL, other]
counselling_points.category: [administration, storage, missed_dose, side_effect_advice, duration, lifestyle, safety_netting]
counselling_points.priority: [essential, recommended]
interactions.interaction_kind: [drug_drug, drug_condition, drug_renal]
interactions.mechanism_category: [drug_drug, qt_prolongation, reduced_clearance, cyp_inducer, cyp_inhibitor]
interactions.severity: [critical, moderate, low]
interactions.evidence_tier: [guideline, trial, mechanistic, consensus]
serious_adverse_effects.system: [cardiac, pulmonary, hepatic, renal, haematological, neurological, dermatological, metabolic, endocrine, gastrointestinal, musculoskeletal, immunological, multi_system, other]
serious_adverse_effects.severity: [life_threatening, serious, significant]
serious_adverse_effects.onset: [acute, subacute, chronic, idiosyncratic, dose_dependent, cumulative]
strong_contraindications.subject_kind: [drug, drug_class]
strong_contraindications.severity: [absolute, strong_relative]
precautions.category: [common_side_effect, general_warning, monitoring, administration, counselling]
precautions.frequency: [common, uncommon, rare, unknown]
clinical_uses.indication_type: [approved, off_label, emergency]
renal.action: [renal_contraindicated, renal_adjustment_required]
scheduling.schedule: [unscheduled, S2, S3, S4, S4D, S5, S6, S7, S8, S9, S10, unknown]
```

## 7. Leaf capability inventory (19 capabilities incl. PBS) — counts & samples

### `clinical_uses` — 980 records
*Indications a drug is used for.*
Dataset: `clinical-uses.json` · version `pharm-clinical_uses:v0.1.0-dev` · signed: **true**
```json
[
  {
    "ingredient": "warfarin",
    "indication": "atrial fibrillation — stroke prevention",
    "indication_type": "approved",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  },
  {
    "ingredient": "warfarin",
    "indication": "venous thromboembolism — treatment and secondary prevention",
    "indication_type": "approved",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  }
]
```

### `pharmacodynamics` — 303 records
*Mechanism of action / drug class / target / effect.*
Dataset: `pharmacodynamics.json` · version `pharm-pharmacodynamics:v0.1.0-dev` · signed: **true**
```json
[
  {
    "ingredient": "warfarin",
    "drug_class": "vitamin K antagonist anticoagulant",
    "mechanism_of_action": "inhibits vitamin K epoxide reductase (VKORC1) -> reduced synthesis of clotting factors II, VII, IX, X and proteins C and S",
    "target": "VKORC1",
    "effect": "anticoagulation",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  },
  {
    "ingredient": "digoxin",
    "drug_class": "cardiac glycoside",
    "mechanism_of_action": "inhibits Na/K-ATPase -> raised intracellular Na then Ca (via Na/Ca exchange); vagotonic autonomic effects",
    "target": "Na/K-ATPase",
    "effect": "positive inotropy; AV nodal slowing",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  }
]
```

### `pharmacokinetics` — 303 records
*ADME — bioavailability, metabolism, elimination, half-life.*
Dataset: `pharmacokinetics.json` · version `pharm-pharmacokinetics:v0.1.0-dev` · signed: **true**
```json
[
  {
    "ingredient": "warfarin",
    "bioavailability": "~100% oral",
    "protein_binding": "~99%",
    "metabolism": "hepatic CYP2C9 (S-enantiomer)",
    "elimination": "hepatic",
    "half_life": "~36 h",
    "notes": "narrow therapeutic index; numerous CYP2C9 and dietary vitamin K interactions",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  },
  {
    "ingredient": "digoxin",
    "bioavailability": "65-80%",
    "protein_binding": "~25%",
    "volume_of_distribution": "large",
    "metabolism": "minimal",
    "elimination": "renal (excreted largely unchanged)",
    "half_life": "36-40 h (normal renal function)",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  }
]
```

### `precautions` — 1162 records
*LOW-TIER cautions — mild/common side effects, general warnings (NOT toxicity/contraindications).*
Dataset: `precautions.json` · version `pharm-precautions:v0.1.0-dev` · signed: **true**
```json
[
  {
    "ingredient": "warfarin",
    "precaution": "easy bruising and minor bleeding",
    "category": "common_side_effect",
    "frequency": "common",
    "advice": "counsel on bleeding signs; maintain regular INR monitoring and consistent vitamin K intake",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  },
  {
    "ingredient": "digoxin",
    "precaution": "nausea and anorexia (may be early toxicity)",
    "category": "common_side_effect",
    "frequency": "uncommon",
    "advice": "report GI symptoms or visual changes; check level and potassium",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  }
]
```

### `warning_labels` — 6 records
*Cautionary/advisory labels (source_scheme RASML/TGA primary). Reference-only.*
Dataset: `warning-labels.json` · version `pharm-warning-labels:v0.1.0-dev` · signed: **false**
```json
[
  {
    "ingredient": "doxycycline",
    "label_code": "RASML-swallow-whole-upright",
    "label_text": "Swallow whole with a full glass of water while sitting or standing",
    "source_scheme": "RASML",
    "mandatory": true,
    "reference": "rasml-tga",
    "provenance": {
      "source": "RASML (TGA) — Required Advisory Statements for Medicine Labels",
      "source_ref": "rasml-tga",
      "authored_by": "claude (agent) — RASML primary",
      "reviewed_by": null,
      "review_status": "draft",
      "version": "v0.1.0",
      "effective_date": "2026-07-14"
    }
  },
  {
    "ingredient": "doxycycline",
    "label_code": "RASML-avoid-dairy-antacid-iron",
    "label_text": "Do not take with dairy, antacids or iron preparations",
    "source_scheme": "RASML",
    "mandatory": true,
    "reference": "rasml-tga",
    "provenance": {
      "source": "RASML (TGA) — Required Advisory Statements for Medicine Labels",
      "source_ref": "rasml-tga",
      "authored_by": "claude (agent) — RASML primary",
      "reviewed_by": null,
      "review_status": "draft",
      "version": "v0.1.0",
      "effective_date": "2026-07-14"
    }
  }
]
```

### `counselling_points` — 9 records
*Consumer counselling messages (APF22 Consumer information structure). Reference-only.*
Dataset: `counselling-points.json` · version `pharm-counselling-points:v0.1.0-dev` · signed: **false**
```json
[
  {
    "ingredient": "amoxicillin",
    "point": "Complete the full course even if you feel better",
    "category": "duration",
    "priority": "essential",
    "provenance": {
      "source": "APF22 (facts, cited) — Consumer information",
      "source_ref": "apf22",
      "authored_by": "claude (agent) — APF22-cited facts",
      "reviewed_by": null,
      "review_status": "draft",
      "version": "v0.1.0",
      "effective_date": "2026-07-14"
    }
  },
  {
    "ingredient": "alendronate",
    "point": "Take on an empty stomach with a full glass of water and stay upright for at least 30 minutes",
    "category": "administration",
    "priority": "essential",
    "provenance": {
      "source": "APF22 (facts, cited) — Consumer information",
      "source_ref": "apf22",
      "authored_by": "claude (agent) — APF22-cited facts",
      "reviewed_by": null,
      "review_status": "draft",
      "version": "v0.1.0",
      "effective_date": "2026-07-14"
    }
  }
]
```

### `interactions` — 872 records
*Drug-drug interactions, tagged with mechanism_category (exact enum: drug_drug / qt_prolongation / reduced_clearance / cyp_inducer / cyp_inhibitor).*
Dataset: `drug-interactions.json` · version `pharm-interactions:v0.1.0-dev` · signed: **true**
```json
[
  {
    "interaction_kind": "drug_drug",
    "subject": "warfarin",
    "object": "ibuprofen",
    "severity": "critical",
    "mechanism_class": "additive bleeding risk (anticoagulant + NSAID gastric erosion/antiplatelet)",
    "management_category": "avoid",
    "evidence_tier": "guideline",
    "provenance": {
      "source": "STOPP/START v3 + primary literature (mechanism-class only)",
      "source_ref": "stopp-start-v3",
      "authored_by": "claude-fable-5 (agent, draft transcription of cited source)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    },
    "mechanism_category": "drug_drug"
  },
  {
    "interaction_kind": "drug_drug",
    "subject": "warfarin",
    "object": "trimethoprim-sulfamethoxazole",
    "severity": "critical",
    "mechanism_class": "CYP2C9 inhibition potentiates warfarin -> INR elevation",
    "management_category": "avoid",
    "evidence_tier": "guideline",
    "provenance": {
      "source": "STOPP/START v3 + primary literature (mechanism-class only)",
      "source_ref": "stopp-start-v3",
      "authored_by": "claude-fable-5 (agent, draft transcription of cited source)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    },
    "mechanism_category": "cyp_inhibitor"
  }
]
```

### `nti` — 53 records
*Narrow-therapeutic-index drugs requiring level monitoring. The NTI bucket under the TDM heading.*
Dataset: `nti-register.json` · version `pharm-nti-register:v0.1.0-dev` · signed: **true**
```json
[
  {
    "ingredient": "carbamazepine",
    "is_nti": true,
    "rationale": "NTI anticonvulsant; autoinduction and dose-dependent toxicity; TDM guides dosing",
    "monitoring_hint": "pre-dose (trough) level",
    "therapeutic_interval": "4-10 mg/L",
    "time_to_steady_state_days": 5,
    "provenance": {
      "source": "TDM reference (NHS Tayside/Ninewells), intervals corroborated against AMH",
      "source_ref": "tdm-reference",
      "authored_by": "claude-fable-5 (agent, draft transcription of cited source)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  },
  {
    "ingredient": "ciclosporin",
    "is_nti": true,
    "rationale": "NTI calcineurin inhibitor; nephrotoxicity vs rejection; transplant-specific targets",
    "monitoring_hint": "pre-dose trough (EDTA)",
    "therapeutic_interval": "transplant-specific (e.g. renal 125-200 first 6 months, 75-150 after)",
    "time_to_steady_state_days": 5,
    "provenance": {
      "source": "TDM reference (NHS Tayside/Ninewells), intervals corroborated against AMH",
      "source_ref": "tdm-reference",
      "authored_by": "claude-fable-5 (agent, draft transcription of cited source)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  }
]
```

### `tdm_parameters` — 11 records
*Therapeutic drug monitoring ranges/timing (APF22 Table B.2 facts). Concentration targets, NOT doses. Reference-only, engine-isolated.*
Dataset: `tdm-parameters.json` · version `pharm-tdm-parameters:v0.1.0-dev` · signed: **false**
```json
[
  {
    "ingredient": "vancomycin",
    "monitored": true,
    "therapeutic_range_low": 15,
    "therapeutic_range_high": 20,
    "range_unit": "mg/L",
    "sample_timing": "trough",
    "biological_fluid": "serum",
    "monitoring_indication": "efficacy and nephrotoxicity avoidance in serious infection",
    "notes": "AUC-guided dosing increasingly preferred over trough alone",
    "provenance": {
      "source": "APF22 (facts, cited) — Section B Table B.2",
      "source_ref": "apf22",
      "authored_by": "claude (agent) — APF22-cited facts",
      "reviewed_by": null,
      "review_status": "draft",
      "version": "v0.1.0",
      "effective_date": "2026-07-14"
    }
  },
  {
    "ingredient": "phenytoin",
    "monitored": true,
    "therapeutic_range_low": 10,
    "therapeutic_range_high": 20,
    "range_unit": "mg/L",
    "toxic_threshold": 20,
    "toxic_unit": "mg/L",
    "sample_timing": "trough",
    "biological_fluid": "serum",
    "active_metabolite_note": "highly protein bound (~90%); interpret against albumin — free level may be needed if albumin low",
    "provenance": {
      "source": "APF22 (facts, cited) — Section B Table B.2",
      "source_ref": "apf22",
      "authored_by": "claude (agent) — APF22-cited facts",
      "reviewed_by": null,
      "review_status": "draft",
      "version": "v0.1.0",
      "effective_date": "2026-07-14"
    }
  }
]
```

### `renal` — 104 records
*Renal dose-adjustment / contraindication thresholds by eGFR.*
Dataset: `renal-rules.json` · version `pharm-renal-rules:v0.1.0-dev` · signed: **true**
```json
[
  {
    "ingredient": "metformin",
    "action": "renal_contraindicated",
    "contraindicated_below_egfr": 30,
    "monitoring": "eGFR before and during; withhold in acute illness/dehydration (lactic acidosis risk)",
    "provenance": {
      "source": "STOPP/START v3 Section E (renal), corroborated against AMH",
      "source_ref": "stopp-start-v3",
      "authored_by": "claude-fable-5 (agent, draft transcription of cited source)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  },
  {
    "ingredient": "dabigatran",
    "action": "renal_contraindicated",
    "contraindicated_below_egfr": 30,
    "monitoring": "renal function at least annually; more often if eGFR<50 or intercurrent illness",
    "provenance": {
      "source": "STOPP/START v3 Section E (renal), corroborated against AMH",
      "source_ref": "stopp-start-v3",
      "authored_by": "claude-fable-5 (agent, draft transcription of cited source)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  }
]
```

### `scheduling` — 261 records
*AU Poisons Standard (SUSMP) schedule.*
Dataset: `au-scheduling.json` · version `pharm-au-scheduling:v0.1.0-dev` · signed: **true**
```json
[
  {
    "ingredient": "oxycodone",
    "schedule": "S8",
    "state_appendix_flags": [],
    "effective_date": "2026-07-13",
    "provenance": {
      "source": "SUSMP / Poisons Standard (TGA, Federal Register of Legislation)",
      "source_ref": "susmp-poisons-standard",
      "authored_by": "claude-fable-5 (agent, draft transcription of cited source)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  },
  {
    "ingredient": "morphine",
    "schedule": "S8",
    "state_appendix_flags": [],
    "effective_date": "2026-07-13",
    "provenance": {
      "source": "SUSMP / Poisons Standard (TGA, Federal Register of Legislation)",
      "source_ref": "susmp-poisons-standard",
      "authored_by": "claude-fable-5 (agent, draft transcription of cited source)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  }
]
```

### `allergy` — 3 records
*Cross-reactivity allergy groups.*
Dataset: `allergy-cross-reactivity.json` · version `pharm-allergy-xr:v0.1.0-dev` · signed: **true**
```json
[
  {
    "group": "beta_lactam",
    "members": [
      "penicillin",
      "amoxicillin",
      "amoxicillin-clavulanate",
      "flucloxacillin",
      "cephalexin",
      "cefalexin",
      "ceftriaxone"
    ],
    "provenance": {
      "source": "self-authored (cross-reactivity classes; primary literature)",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft; clinician authoring to confirm)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  },
  {
    "group": "sulfonamide",
    "members": [
      "sulfamethoxazole",
      "trimethoprim-sulfamethoxazole",
      "sulfasalazine"
    ],
    "provenance": {
      "source": "self-authored (cross-reactivity classes; primary literature)",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft; clinician authoring to confirm)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  }
]
```

### `serious_adverse_effects` — 713 records
*Established SERIOUS/life-threatening toxicity.*
Dataset: `serious-adverse-effects.json` · version `pharm-serious-adverse-effects:v0.1.0-dev` · signed: **true**
```json
[
  {
    "ingredient": "amiodarone",
    "effect": "pulmonary fibrosis / interstitial pneumonitis",
    "system": "pulmonary",
    "severity": "serious",
    "onset": "chronic",
    "mechanism_class": "phospholipidosis / cumulative lung toxicity",
    "monitoring": "baseline + annual CXR and lung function; dyspnoea/cough",
    "management": "cease; corticosteroids",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  },
  {
    "ingredient": "amiodarone",
    "effect": "thyroid dysfunction (hypo- or hyper-thyroidism)",
    "system": "endocrine",
    "severity": "serious",
    "onset": "chronic",
    "mechanism_class": "iodine load; type I/II thyrotoxicosis",
    "monitoring": "TFTs baseline then 6-monthly",
    "management": "thyroxine or antithyroid therapy; consider cessation",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  }
]
```

### `strong_contraindications` — 523 records
*Absolute / strong-relative drug(-class)-in-condition contraindications.*
Dataset: `strong-contraindications.json` · version `pharm-strong-contraindications:v0.1.0-dev` · signed: **true**
```json
[
  {
    "subject": "dopamine antagonists",
    "subject_kind": "drug_class",
    "condition": "Parkinson's disease",
    "severity": "absolute",
    "rationale": "dopamine-receptor blockade worsens parkinsonian motor function",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  },
  {
    "subject": "metoclopramide",
    "subject_kind": "drug",
    "condition": "Parkinson's disease",
    "severity": "absolute",
    "rationale": "dopamine antagonist — worsens parkinsonism and causes extrapyramidal effects (use domperidone if antiemetic needed)",
    "provenance": {
      "source": "self-authored (general clinical pharmacology knowledge; corroborate against AMH/TGA at review). NOT derived from LITFL notes.",
      "source_ref": "self-authored",
      "authored_by": "claude-fable-5 (agent, draft — KL to attest)",
      "reviewed_by": "KL",
      "review_status": "approved",
      "version": "v0.1.0",
      "effective_date": "2026-07-13"
    }
  }
]
```

### `formulations` — 725 records
*PBS public form/strength — dose-ADJACENT reference, NOT a dose source.*
Dataset: `formulations.json` · version `pharm-formulations:v0.1.0-dev` · signed: **false**
```json
[
  {
    "ingredient": "acarbose",
    "form": "Tablet 100 mg",
    "route": "ORAL",
    "pbs_item_code": "13869Y"
  },
  {
    "ingredient": "acarbose",
    "form": "Tablet 50 mg",
    "route": "ORAL",
    "pbs_item_code": "13955L"
  }
]
```

### `administration_handling` — 27 records
*Whether a solid oral form may be crushed/split/dispersed ('should not be crushed', APF22). Carries NO dose. Reference-only.*
Dataset: `administration-handling.json` · version `pharm-administration-handling:v0.1.0-dev` · signed: **false**
```json
[
  {
    "ingredient": "morphine",
    "formulation": "modified-release tablet",
    "can_crush": "do_not_crush",
    "can_disperse": "not_dispersible",
    "rationale": "crushing destroys the modified-release matrix, causing dose dumping and overdose risk",
    "alternative": "use an immediate-release liquid under prescriber direction",
    "reference": "apf22",
    "provenance": {
      "source": "APF22 (facts, cited) — Modification of oral formulation",
      "source_ref": "apf22",
      "authored_by": "claude (agent) — APF22-cited facts",
      "reviewed_by": null,
      "review_status": "draft",
      "version": "v0.1.0",
      "effective_date": "2026-07-14"
    }
  },
  {
    "ingredient": "oxycodone",
    "formulation": "modified-release tablet",
    "can_crush": "do_not_crush",
    "can_disperse": "not_dispersible",
    "rationale": "modified-release matrix; crushing causes dose dumping",
    "reference": "apf22",
    "provenance": {
      "source": "APF22 (facts, cited) — Modification of oral formulation",
      "source_ref": "apf22",
      "authored_by": "claude (agent) — APF22-cited facts",
      "reviewed_by": null,
      "review_status": "draft",
      "version": "v0.1.0",
      "effective_date": "2026-07-14"
    }
  }
]
```

### `dose_evidence` — 261 records
*Citation register of dosing FINDINGS in the primary literature (real PMID/DOI). NOT prescribing, engine-isolated.*
Dataset: `dose-evidence.json` · version `pharm-dose-evidence:v0.1.0-dev` · signed: **false**
```json
[
  {
    "ingredient": "apixaban",
    "context": "Stroke prevention in nonvalvular atrial fibrillation; empiric off-label reduced dosing in older adults",
    "population": "Adults aged 65 and older with nonvalvular AF (n=1172; 147 off-label 'underdosed' matched to 139 standard-dose)",
    "dose_statement": "In a multicentre retrospective cohort, patients given off-label reduced-dose apixaban (i.e. underdosed outside FDA package-insert dose-reduction criteria) versus standard 5 mg twice daily showed no significant difference in stroke (2.7% vs 2.2%), major bleeding (0% vs 0.7%) or clinically relevant non-major bleeding (2.7% vs 1.4%), while all-cause mortality was higher in the off-label reduced-dose group (10.9% vs 1.4%).",
    "citation": {
      "identifier": "37712551",
      "id_type": "pmid",
      "title": "Off-Label Reduced Dose Apixaban in Older Adults With Atrial Fibrillation and Associated Outcomes.",
      "journal": "The Annals of pharmacotherapy",
      "year": 2023,
      "verified": true
    },
    "evidence_note": "Retrospective observational cohort across 3 academic centres; association only, susceptible to confounding by indication (sicker patients underdosed).",
    "not_prescribing_guidance": true,
    "provenance": {
      "source": "primary research literature (PubMed)",
      "source_ref": "37712551",
      "authored_by": "claude-fable-5 dose-evidence retrieval workflow (retrieve + adversarial-verify agents; draft — KL to attest)",
      "reviewed_by": null,
      "review_status": "draft",
      "version": "v0.1.0",
      "effective_date": "2026-07-14"
    }
  },
  {
    "ingredient": "apixaban",
    "context": "Distinguishing dose-adjusted (full-intensity) DOAC therapy for stroke prevention in AF from low-intensity dose-reduced regimens",
    "population": "Patients across 35 RCTs of dose-adjusted DOACs (29 in AF) plus registry data",
    "dose_statement": "A review reports that for apixaban, dabigatran, rivaroxaban and edoxaban the efficacy and safety of dose-adjusted regimens in large AF RCTs were similar to those of full-dose DOACs, and that dose adjustment for AF should follow the approved reduction criteria rather than be applied to acute VTE treatment; registry data showed dose-reduced DOACs were sometimes used at doses or scenarios differing from RCT/label criteria.",
    "citation": {
      "identifier": "35648414",
      "id_type": "pmid",
      "title": "Efficacy and Safety Considerations With Dose-Reduced Direct Oral Anticoagulants: A Review.",
      "journal": "JAMA cardiology",
      "year": 2022,
      "verified": true
    },
    "evidence_note": "Narrative review of RCTs and registries; distinguishes dose-adjustment from low-intensity treatment, not a primary outcome study.",
    "not_prescribing_guidance": true,
    "provenance": {
      "source": "primary research literature (PubMed)",
      "source_ref": "35648414",
      "authored_by": "claude-fable-5 dose-evidence retrieval workflow (retrieve + adversarial-verify agents; draft — KL to attest)",
      "reviewed_by": null,
      "review_status": "draft",
      "version": "v0.1.0",
      "effective_date": "2026-07-14"
    }
  }
]
```

### `dose_guidance` — 0 records
*HELD at 0 records — doses cannot be LLM-authored; reserved for AMH/live vendor.*
Dataset: `dose-guidance.json` · version `pharm-dose-guidance:v0.1.0-dev` · signed: **false**
_(held — no records)_

### `pbs` — 14840 records
*PBS Public API v3 formulary (open data): item code, ATC, authority_category, 60day_eligible.*
Dataset: `pbs-formulary.json` · version `pharm-pbs-formulary:v0.1.0-dev` · signed: **false**
```json
[
  {
    "pbs_item_code": "10001J",
    "ingredient": "rifaximin",
    "form": "Tablet 550 mg",
    "brand_name": "Xifaxan",
    "program_code": "GE",
    "benefit_type_code": "A",
    "manner_of_administration": "ORAL",
    "atc_code": "A07AA11",
    "atc_level": 5,
    "atc_description": "rifaximin",
    "authority_category": "authority_required",
    "authority_categories": [
      "authority_required"
    ],
    "written_authority_required": false,
    "authority_method": "AUTHORITY_REQUIRED",
    "restricted": true,
    "60day_eligible": false
  },
  {
    "pbs_item_code": "10003L",
    "ingredient": "dabrafenib",
    "form": "Capsule 75 mg (as mesilate)",
    "brand_name": "Tafinlar",
    "program_code": "GE",
    "benefit_type_code": "S",
    "manner_of_administration": "ORAL",
    "atc_code": "L01EC02",
    "atc_level": 5,
    "atc_description": "dabrafenib",
    "authority_category": "authority_streamlined",
    "authority_categories": [
      "authority_streamlined"
    ],
    "written_authority_required": false,
    "authority_method": "STREAMLINED",
    "restricted": true,
    "60day_eligible": false
  }
]
```

**Total curated records across capabilities:** 21,156 (excludes the data-source registry).

## 8. Data-source / provenance registry

`data-sources.json` v1.1.0 — 10 sources. `structure_only` = copyright-restricted (facts/structure/citation only).
```json
[
  {
    "id": "pbs-api-v3",
    "licence_status": "verified",
    "use_restriction": "content_ingest"
  },
  {
    "id": "susmp-poisons-standard",
    "licence_status": "verified",
    "use_restriction": "content_ingest"
  },
  {
    "id": "rxnorm-nlm",
    "licence_status": "verified",
    "use_restriction": "content_ingest"
  },
  {
    "id": "who-atc-ddd",
    "licence_status": "verified",
    "use_restriction": "content_ingest"
  },
  {
    "id": "stopp-start-v3",
    "licence_status": "copyleft_reference_only",
    "use_restriction": "structure_only"
  },
  {
    "id": "tdm-reference",
    "licence_status": "copyleft_reference_only",
    "use_restriction": "structure_only"
  },
  {
    "id": "drugbank-nti-category",
    "licence_status": "copyleft_reference_only",
    "use_restriction": "structure_only"
  },
  {
    "id": "ausdi-structure",
    "licence_status": "copyleft_reference_only",
    "use_restriction": "structure_only"
  },
  {
    "id": "apf22",
    "licence_status": "copyleft_reference_only",
    "use_restriction": "structure_only"
  },
  {
    "id": "rasml-tga",
    "licence_status": "verified",
    "use_restriction": "content_ingest"
  }
]
```

## 9. Known state, gaps & what a reviewer should probe

- **Built & validated (Steps 2–5, signed KL 2026-07-13):** contract-lock, domain model, PharmDataSource seam, fail-closed authoring pipeline, engine wired through the seam (6-check firewall), staging validation (20/20 cases, 8/8 adversarial fail-safe).
- **`dose_evidence` (2026-07-14):** 259 retrieval-grounded records / 129 drugs, real PubMed PMID/DOI, engine-ISOLATED (no accessor; not a dose source). Verify pass confirmed each citation resolves + supports its statement.
- **APF22 reorg Priority-1 (2026-07-14):** heading overlay (`capability-groups.json`) + 4 reference-only capabilities — `administration_handling` ('should not be crushed'), `tdm_parameters` (NTI is the bucket under the TDM heading), `warning_labels` (RASML primary), `counselling_points`. All `-dev`/draft, seeded with APF22-cited facts, contract-tested. Frozen `nti_check` unchanged.
- **`dose_guidance` HELD** at 0 records — doses cannot be LLM-authored (invariant). Reserved for AMH / live vendor.
- **All datasets `-dev`/unsigned** — patient-facing is BLOCKED on: live CDS vendor, TGA/regulatory sign-off, live PBS pull, AusDI 3b, Clinician Verification Portal.
- **Reviewer probes worth running:** Is any check bypassable? Can a dose ever originate outside the engine? Are the clinical records accurate against AMH/TGA? Is the copyright boundary respected? Are severities/mechanism_categories correct? Any capability with thin/incorrect coverage?

---
_Generated by `scripts/pharm-export.mjs` from the live repo. Bring changes back via the `DEVELOPMENT-INSTRUMENT.md` dev-package format → `scripts/pharm-ingest.mjs`._
