/**
 * context-allowlist — the LIVE field-scoped scoring-store firewall
 * (ARCH_PLAN C7 / FMEA F9; gap `context-injection-allowlist`, R-26).
 *
 * `cases:ingest` (scripts/ingest-case-bundles.mjs) enforces a field-scoped
 * allow-list at INGEST time: only named sub-fields of 00/01/02 are ever part of
 * the AI-Doctor / patient-simulator exchange; everything else is sim/scorer
 * metadata. This module mirrors that exact contract at the PACKET boundary, so
 * any case-injection path is default-deny even if a future caller hands
 * contextInjection() raw case content.
 *
 * DEFAULT-DENY: a field is injectable ONLY if it appears below. Unknown nodes,
 * unknown fields, 00_case_envelope (orchestration metadata that legitimately
 * references the diagnosis), psychosocial_profile / digital_tablet_field_map
 * (simulator-direction metadata), and 02 scoring/gate fields are all rejected.
 *
 * SEALED NODES ARE A HARD STOP: content keyed 10_/11_/12_/13_ (the scoring
 * store) anywhere in the input makes this module THROW — a firewall-breach
 * attempt must halt packet assembly loudly, never degrade to a dropped field.
 *
 * CHANNELS: 01 fields are patient presentation the AI Doctor may see — channel
 * "packet" (they may become ContextPacket facts). 02 text fields are the
 * patient-SIMULATOR's dialogue material — injectable into the exchange
 * (channel "exchange") per the ingest contract, but NEVER packet facts: the AI
 * Doctor sees the conversation the simulator generates, not the policy file.
 *
 * QUARANTINE LIFTED (operator ruling 2026-07-11, HIST-2): the charter's open
 * follow-up on 01.objective_data_offered is resolved with the STRING-PRESERVING
 * sanitiser policy — each offered datum flows as a vital_sign fact whose value
 * is exactly the patient-stated string the 01 schema mandates ("150/95 mmHg",
 * "96%"), stamped with the item's declared source channel and verified:false.
 * Values are NEVER parsed into structured numbers here, and a patient-
 * provenance fact can never be category lab_result (mechanical bar in
 * pipeline-schemas.js) — so no patient-offered number can reach the lab path
 * or bypass the investigation-parser boundary. An item missing its source
 * channel is REJECTED (fail-safe: patient data with undeclared provenance is
 * withheld, not defaulted).
 *
 * GRANULAR HISTORY (HIST-2, operator-approved): history_as_reported splits
 * into per-item packet facts (each disclosed condition, medication, allergy,
 * family-history item its own fact with the correct category), every one
 * stamped provenance:patient_reported / verified:false. Values are composed
 * ONLY from the item's own as-stated string fields — patient voice, never
 * interpretation. Unknown sub-fields inside the history object are rejected
 * by name (default-deny inside the object, same as everywhere else).
 */

import { provenPath } from "./omnibus.js";

/** Sealed scoring-store node prefixes — content behind these keys must never
 *  reach this layer at all. */
const SEALED_NODE_RE = /^1[0-3]_/;

/** channel "packet": may become ContextPacket facts (with the category below).
 *  channel "exchange": simulator dialogue material — never packet facts.
 *  omnibus_path: the Digital Tablet anchor for AUDIT-SIDE fact provenance
 *  (factProvenance below) — schema-const structural paths only, mirroring the
 *  01 schema's digital_tablet_field_map consts. These are NEVER placed on the
 *  packet facts themselves: provenance is scorer/ledger metadata (operator
 *  ruling 2026-07-11 — the LLM-visible packet stays byte-identical). */
const ALLOWLIST = {
  "01_presentation_layer": {
    demographics: { channel: "packet", category: "demographic", omnibus_path: "Patient" },
    opening_complaint: { channel: "packet", category: "symptom", omnibus_path: "Condition._freetext_HPC_tags" },
    history_as_reported: { channel: "packet", split: "history", category: "past_history", omnibus_path: "Condition" },
    objective_data_offered: { channel: "packet", split: "vitals", category: "vital_sign", omnibus_path: "Observation" },
  },
  "02_conversational_policy": {
    // (02 rules unchanged — simulator dialogue material, never packet facts.)
    // Array-of-object fields: only the named sub-fields of each element.
    disclosure_items: { channel: "exchange", subfields: ["clinical_fact", "patient_response_template", "patient_deflection_template"] },
    patient_initiated_exchanges: { channel: "exchange", subfields: ["patient_text"] },
    deflection_behaviours: { channel: "exchange", subfields: ["deflection_text_template"] },
  },
};

/** Per-sub-field split rules for history_as_reported (mirrors the 01 schema's
 *  history sub-fields). `compose` names the as-stated string fields joined —
 *  in schema order, patient voice only — into each item's fact value.
 *  `single: true` = the sub-field is one object → one fact. Anything not
 *  listed here is rejected by name. */
const HISTORY_SPLIT = {
  symptom_narrative: { category: "symptom", omnibus_path: "Condition._freetext_HPC_tags", single: true },
  past_medical_history: { category: "past_history", omnibus_path: "Condition", compose: ["condition_as_patient_states", "when_diagnosed", "how_managed"] },
  current_medications_as_reported: { category: "medication", omnibus_path: "MedicationRequest", compose: ["name_as_patient_states", "dose_as_patient_reports", "adherence_as_reported", "otc_or_herbal"] },
  allergies_as_reported: { category: "allergy", omnibus_path: "AllergyIntolerance", compose: ["substance", "reaction_described", "reaction_severity_patient_report"] },
  family_history_as_reported: { category: "family_history", omnibus_path: "FamilyMemberHistory._freetext_family_history_tags", compose: ["narrative"] },
  social_history_volunteered: { category: "social_history", omnibus_path: "SDOH_Observations.full_SDOH_field_map", single: true },
};

/** Patient-provided source channels a vitals item may declare (mirror of the
 *  01 schema enum). An undeclared/unknown source → the item is withheld. */
const VITALS_SOURCES = new Set(["patient_home_device", "patient_wearable", "patient_reported", "video_observable", "caregiver_reported"]);

/** Compose an item's fact value from its as-stated string fields only —
 *  patient voice verbatim, joined with "; ". Booleans render as "field: true"
 *  (e.g. otc_or_herbal); everything else is skipped, never interpreted. */
const composeValue = (item, fields) =>
  fields
    .map((f) => {
      const v = item?.[f];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "boolean") return `${f}: ${v}`;
      return null;
    })
    .filter(Boolean)
    .join("; ");

/** Split history_as_reported into per-item packet entries (all
 *  provenance:patient_reported). A plain-string history (legacy/test shape)
 *  stays one past_history fact. */
function splitHistory(nodeKey, field, value, out) {
  const base = `${nodeKey}.${field}`;
  if (typeof value === "string") {
    out.injectable.push({ node: nodeKey, path: base, channel: "packet", category: "past_history", omnibus_path: "Condition", provenance: "patient_reported", value });
    return;
  }
  for (const [sub, subVal] of Object.entries(value || {})) {
    const rule = HISTORY_SPLIT[sub];
    if (!rule) {
      out.rejected.push({ node: nodeKey, path: `${base}.${sub}`, reason: "history sub-field not on the injection allow-list (default-deny)" });
      continue;
    }
    if (rule.single) {
      out.injectable.push({ node: nodeKey, path: `${base}.${sub}`, channel: "packet", category: rule.category, omnibus_path: rule.omnibus_path, provenance: "patient_reported", value: typeof subVal === "string" ? subVal : JSON.stringify(subVal ?? "") });
      continue;
    }
    (Array.isArray(subVal) ? subVal : []).forEach((item, i) => {
      const composed = typeof item === "string" ? item : composeValue(item, rule.compose);
      if (!composed) {
        out.rejected.push({ node: nodeKey, path: `${base}.${sub}[${i}]`, reason: "item has no as-stated content to inject (withheld, not defaulted)" });
        return;
      }
      out.injectable.push({ node: nodeKey, path: `${base}.${sub}[${i}]`, channel: "packet", category: rule.category, omnibus_path: rule.omnibus_path, provenance: "patient_reported", value: composed });
    });
  }
}

/** Split objective_data_offered into per-item vital_sign entries under the
 *  string-preserving sanitiser policy (operator ruling 2026-07-11): value is
 *  the patient-stated string verbatim (prefixed with the offered type),
 *  provenance is the item's DECLARED source — no source, no injection. */
function splitVitals(nodeKey, field, value, out) {
  const base = `${nodeKey}.${field}`;
  (Array.isArray(value) ? value : []).forEach((item, i) => {
    const path = `${base}[${i}]`;
    if (!item || typeof item.value !== "string" || !item.value.trim()) {
      out.rejected.push({ node: nodeKey, path, reason: "offered datum has no patient-stated string value (structured/raw values are not accepted on this path)" });
      return;
    }
    if (!VITALS_SOURCES.has(item.source)) {
      out.rejected.push({ node: nodeKey, path, reason: "offered datum has no declared patient-source channel — withheld (patient data with undeclared provenance is never defaulted)" });
      return;
    }
    const label = typeof item.type === "string" && item.type.trim() ? `${item.type.trim()}: ` : "";
    out.injectable.push({ node: nodeKey, path, channel: "packet", category: "vital_sign", omnibus_path: "Observation", provenance: item.source, value: `${label}${item.value.trim()}` });
  });
}

/**
 * Classify case content against the mirrored ingest firewall (§3.5.5 contract).
 *
 * @param {Record<string, object>} caseFields - case content keyed by node name
 *   (e.g. { "01_presentation_layer": {...}, "02_conversational_policy": {...} }).
 * @returns {{ injectable_fields: Array<{node: string, path: string, channel: "packet"|"exchange", category?: string, value: unknown}>,
 *             rejected_fields: Array<{node: string, path: string, reason: string}> }}
 * @throws {Error} if any sealed scoring-store node (10_–13_) is present.
 */
export function contextAllowList(caseFields = {}) {
  const injectable_fields = [];
  const rejected_fields = [];

  // HARD STOP first — sealed content never gets classified, dropped, or logged
  // by value; its presence alone is a Critical firewall event.
  for (const nodeKey of Object.keys(caseFields)) {
    if (SEALED_NODE_RE.test(nodeKey)) {
      throw new Error(
        `SCORING-STORE FIREWALL: sealed node "${nodeKey}" reached the context-injection layer — packet assembly halted. ` +
          "The AI Doctor must never read 10_/11_/12_/13_ content (critical defect; stop and report)."
      );
    }
  }

  for (const [nodeKey, node] of Object.entries(caseFields)) {
    const nodeAllow = ALLOWLIST[nodeKey];
    if (!nodeAllow) {
      // Default-deny whole unknown/metadata nodes (incl. 00_case_envelope).
      rejected_fields.push({ node: nodeKey, path: nodeKey, reason: "node not on the injection allow-list (default-deny)" });
      continue;
    }
    for (const [field, value] of Object.entries(node || {})) {
      const rule = nodeAllow[field];
      if (!rule) {
        rejected_fields.push({ node: nodeKey, path: `${nodeKey}.${field}`, reason: "field not on the injection allow-list (default-deny; sim/scorer metadata stays out of the exchange)" });
        continue;
      }
      if (rule.split === "history") {
        splitHistory(nodeKey, field, value, { injectable: injectable_fields, rejected: rejected_fields });
        continue;
      }
      if (rule.split === "vitals") {
        splitVitals(nodeKey, field, value, { injectable: injectable_fields, rejected: rejected_fields });
        continue;
      }
      if (rule.subfields) {
        // Element-scoped: only the named sub-fields of each array element pass;
        // every other sub-field is rejected by name (default-deny inside the
        // element, exactly like the ingest scan).
        const elements = Array.isArray(value) ? value : [];
        elements.forEach((el, i) => {
          for (const [sub, subVal] of Object.entries(el || {})) {
            if (rule.subfields.includes(sub) && typeof subVal === "string") {
              injectable_fields.push({ node: nodeKey, path: `${nodeKey}.${field}[${i}].${sub}`, channel: rule.channel, value: subVal });
            } else {
              rejected_fields.push({ node: nodeKey, path: `${nodeKey}.${field}[${i}].${sub}`, reason: "sub-field not on the injection allow-list (default-deny)" });
            }
          }
        });
        continue;
      }
      // Direct 01 fields (demographics, opening_complaint) are the patient's
      // own account too — stamped patient_reported like everything case-derived.
      injectable_fields.push({ node: nodeKey, path: `${nodeKey}.${field}`, channel: rule.channel, category: rule.category, omnibus_path: rule.omnibus_path, provenance: "patient_reported", value });
    }
  }

  return { injectable_fields, rejected_fields };
}

/** Shared packet-channel selection so injectableFacts and factProvenance can
 *  never disagree on which fields become facts or how they are numbered. */
function packetFields(classification) {
  return classification.injectable_fields.filter((f) => f.channel === "packet");
}

/**
 * Convert the PACKET-channel injectable fields into ContextPacket facts.
 * Values are serialised to strings (a case field is patient-stated content,
 * never a structured raw measurement — the parser path owns those).
 * Exchange-channel fields are intentionally NOT converted: simulator dialogue
 * material is not packet material.
 */
export function injectableFacts(classification) {
  return packetFields(classification).map((f, i) => ({
    fact_id: `case-${i + 1}`,
    category: f.category,
    label: f.path,
    value: typeof f.value === "string" ? f.value : JSON.stringify(f.value),
    // Patient-provided stamps (HIST-2): every case-derived fact is the
    // patient's account — channel declared, verified always false on entry.
    ...(f.provenance ? { provenance: f.provenance, verified: false } : {}),
  }));
}

/**
 * AUDIT-CHANNEL companion to injectableFacts: for each packet fact (same
 * fact_id numbering, same field order), the Digital Tablet anchor it maps to.
 *
 * This is provenance metadata for the scorer, ledger, and evidence_tree — it
 * is deliberately NOT part of the fact objects injectableFacts returns, so
 * the ContextPacket the trunk LLM sees stays byte-identical (operator ruling
 * 2026-07-11). Every path is proven against the loaded omnibus (provenPath):
 * spoiler paths throw, an unresolvable path yields fhir_path null (withheld,
 * fail-safe) — a tag that cannot be proven is never emitted as if it were.
 */
export function factProvenance(classification) {
  return packetFields(classification).map((f, i) => ({
    fact_id: `case-${i + 1}`,
    label: f.path,
    fhir_path: f.omnibus_path ? provenPath(f.omnibus_path) : null,
  }));
}
