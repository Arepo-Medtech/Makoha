/**
 * ppp-ttt Step 1 — Veracity Interrogation (pure).
 *
 * Grades ONE raised flag against the clinician-attested scope-registry
 * discriminators and returns a ConcernVerdict (GO | CAUTION | STOP).
 *
 * THE GRADING RULE (fail-closed at every branch):
 *   tier_model always_immediate        → STOP, no interrogation, none can clear it.
 *   tier_model safeguarding_always_report → STOP + mandatory_report (acuity-
 *                                        independent; no reassuring-refer branch).
 *   tier_model acuity_dependent — interrogate:
 *     any universal-override or condition-specific stigma "present"  → STOP
 *     any discriminator "unknown" / unanswered                       → STOP (fail-closed:
 *                                        ambiguity about an emergency IS an emergency)
 *     all stigmata "absent", refer_if pattern "present"              → CAUTION (the flag
 *                                        persists in its attested stable form — the ONLY
 *                                        branch that reaches the new middle tier)
 *     all stigmata "absent", refer_if pattern "absent"               → GO (red herring —
 *                                        the flag was interrogated away; the negative
 *                                        discriminators are recorded so the audit shows why)
 *   anything else (off-registry, managed-only, unattested, TBD, drifted
 *   registry, unknown tier_model) → STOP with fail_closed:true.
 *
 * The refer_if criterion is itself an attested discriminator (the condition's
 * stable-form pattern): it separates "flag persists without stigmata" (CAUTION)
 * from "flag dispelled" (GO), and an unknown refer_if answer fails closed like
 * every other unresolved discriminator.
 */
import {
  findExclusion,
  discriminatorsFor,
  registryAttestationGate,
  exclusionAttestationGate,
} from "./discriminators.js";
import { ConcernVerdict } from "./verdict-schema.js";

/** Build a fail-closed STOP verdict (the default-deny branch). */
export function failClosedVerdict(flag, reason) {
  return ConcernVerdict.parse({
    area_id: String(flag?.area_id || "(unknown)") || "(unknown)",
    condition: String(flag?.condition || "(unknown)") || "(unknown)",
    tier: "STOP",
    tier_model: "unresolved",
    entity_class: "indeterminate",
    discriminators_asked: [],
    reason: `fail-closed: ${reason}`,
    fail_closed: true,
    mandatory_report: false,
  });
}

/**
 * Grade one raised flag. Pure — reads only the attested registry (via
 * discriminators.js) and the supplied answers.
 *
 * @param {{source:string, area_id:string, condition:string}} flag
 * @param {Record<string, "present"|"absent"|"unknown">} patientAnswers - discriminatorId → answer
 * @returns {object} ConcernVerdict (schema-gated)
 */
export function gradeFlag(flag, patientAnswers = {}) {
  const gate = registryAttestationGate();
  if (!gate.ok) return failClosedVerdict(flag, gate.reason);

  const lookup = findExclusion(flag.area_id, flag.condition);
  if (!lookup.found) return failClosedVerdict(flag, lookup.reason);
  const { exclusion } = lookup;

  // always_immediate: an emergency by attested definition. No question can
  // clear it and none is asked.
  if (exclusion.tier_model === "always_immediate") {
    return ConcernVerdict.parse({
      area_id: flag.area_id,
      condition: exclusion.condition,
      tier: "STOP",
      tier_model: "always_immediate",
      entity_class: "typifies_stigmata",
      discriminators_asked: [],
      reason: `"${exclusion.condition}" is an always_immediate condition — mandatory escalation, no interrogation can clear it`,
      fail_closed: false,
      mandatory_report: false,
    });
  }

  // safeguarding_always_report: acuity-independent STOP-class with a
  // mandatory-report action (e.g. non-accidental injury, R19).
  if (exclusion.tier_model === "safeguarding_always_report") {
    return ConcernVerdict.parse({
      area_id: flag.area_id,
      condition: exclusion.condition,
      tier: "STOP",
      tier_model: "safeguarding_always_report",
      entity_class: "typifies_stigmata",
      discriminators_asked: [],
      reason: `"${exclusion.condition}" is a safeguarding_always_report condition — mandatory report + escalation regardless of clinical acuity; no patient override`,
      fail_closed: false,
      mandatory_report: true,
    });
  }

  if (exclusion.tier_model !== "acuity_dependent") {
    return failClosedVerdict(flag, `unrecognised tier_model "${exclusion.tier_model}" for "${exclusion.condition}"`);
  }

  const attestation = exclusionAttestationGate(exclusion);
  if (!attestation.evaluable) return failClosedVerdict(flag, attestation.reason);

  const { uhao, cs_eti, refer } = discriminatorsFor(exclusion);
  const answerFor = (d) => {
    const a = patientAnswers[d.id];
    return a === "present" || a === "absent" ? a : "unknown"; // missing = unknown = fail-closed
  };
  const asked = [...uhao, ...cs_eti, ...refer].map((d) => ({ ...d, answer: answerFor(d) }));

  const stigmata = asked.filter((d) => d.source !== "condition_specific.refer_if");
  const referAsked = asked.filter((d) => d.source === "condition_specific.refer_if");

  const presentStigma = stigmata.find((d) => d.answer === "present");
  if (presentStigma) {
    return ConcernVerdict.parse({
      area_id: flag.area_id,
      condition: exclusion.condition,
      tier: "STOP",
      tier_model: "acuity_dependent",
      entity_class: "typifies_stigmata",
      discriminators_asked: asked,
      reason: `high-acuity stigma confirmed for "${exclusion.condition}": [${presentStigma.id}] ${presentStigma.text}`,
      fail_closed: false,
      mandatory_report: false,
    });
  }

  const unresolved = asked.find((d) => d.answer === "unknown");
  if (unresolved) {
    return ConcernVerdict.parse({
      area_id: flag.area_id,
      condition: exclusion.condition,
      tier: "STOP",
      tier_model: "acuity_dependent",
      entity_class: "indeterminate",
      discriminators_asked: asked,
      reason: `fail-closed: discriminator [${unresolved.id}] "${unresolved.text}" is unresolved (unknown/unanswered) — ambiguous acuity escalates, never defaults to CAUTION`,
      fail_closed: true,
      mandatory_report: false,
    });
  }

  // All stigmata attested-absent. The refer_if pattern decides persistence.
  const referPresent = referAsked.some((d) => d.answer === "present");
  if (referPresent) {
    return ConcernVerdict.parse({
      area_id: flag.area_id,
      condition: exclusion.condition,
      tier: "CAUTION",
      tier_model: "acuity_dependent",
      entity_class: "differential_only",
      discriminators_asked: asked,
      reason: `flag persists for "${exclusion.condition}" in its attested stable form (refer_if pattern present); no universal-override or condition-specific stigma confirmed → CAUTION`,
      fail_closed: false,
      mandatory_report: false,
    });
  }

  return ConcernVerdict.parse({
    area_id: flag.area_id,
    condition: exclusion.condition,
    tier: "GO",
    tier_model: "acuity_dependent",
    entity_class: "differential_only",
    discriminators_asked: asked,
    reason: `flag for "${exclusion.condition}" interrogated away — every attested discriminator (universal override, condition-specific stigmata, stable-form pattern) answered absent`,
    fail_closed: false,
    mandatory_report: false,
  });
}
