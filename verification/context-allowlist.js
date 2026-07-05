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
 * QUARANTINE (surfaced, not silently resolved): 01.objective_data_offered is
 * allow-listed at ingest, but CLAUDE.md <data_handling> flags an OPEN follow-up
 * — "confirm the sanitiser policy for patient-reported vitals before that path
 * ships". Until the operator confirms that policy, this module REJECTS the
 * field with an explicit pending-policy reason (fail-safe: the safe direction
 * is to withhold, and the rejection reason names exactly what to confirm).
 */

/** Sealed scoring-store node prefixes — content behind these keys must never
 *  reach this layer at all. */
const SEALED_NODE_RE = /^1[0-3]_/;

/** channel "packet": may become ContextPacket facts (with the category below).
 *  channel "exchange": simulator dialogue material — never packet facts. */
const ALLOWLIST = {
  "01_presentation_layer": {
    demographics: { channel: "packet", category: "demographic" },
    opening_complaint: { channel: "packet", category: "symptom" },
    history_as_reported: { channel: "packet", category: "past_history" },
    objective_data_offered: {
      channel: "packet",
      category: "vital_sign",
      quarantined:
        "pending sanitiser-policy confirmation for patient-reported vitals (CLAUDE.md <data_handling> open follow-up) — operator must confirm before this field ships to trunk context",
    },
  },
  "02_conversational_policy": {
    // Array-of-object fields: only the named sub-fields of each element.
    disclosure_items: { channel: "exchange", subfields: ["clinical_fact", "patient_response_template", "patient_deflection_template"] },
    patient_initiated_exchanges: { channel: "exchange", subfields: ["patient_text"] },
    deflection_behaviours: { channel: "exchange", subfields: ["deflection_text_template"] },
  },
};

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
      if (rule.quarantined) {
        rejected_fields.push({ node: nodeKey, path: `${nodeKey}.${field}`, reason: `quarantined: ${rule.quarantined}` });
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
      injectable_fields.push({ node: nodeKey, path: `${nodeKey}.${field}`, channel: rule.channel, category: rule.category, value });
    }
  }

  return { injectable_fields, rejected_fields };
}

/**
 * Convert the PACKET-channel injectable fields into ContextPacket facts.
 * Values are serialised to strings (a case field is patient-stated content,
 * never a structured raw measurement — the parser path owns those).
 * Exchange-channel fields are intentionally NOT converted: simulator dialogue
 * material is not packet material.
 */
export function injectableFacts(classification) {
  return classification.injectable_fields
    .filter((f) => f.channel === "packet")
    .map((f, i) => ({
      fact_id: `case-${i + 1}`,
      category: f.category,
      label: f.path,
      value: typeof f.value === "string" ? f.value : JSON.stringify(f.value),
    }));
}
