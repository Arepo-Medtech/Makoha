/**
 * ppp-ttt Step 1 — Veracity Interrogation (pure).
 *
 * Grades ONE raised flag against the clinician-attested scope-registry
 * discriminators and returns a ConcernVerdict (GO | CAUTION | STOP).
 *
 * THE GRADING RULE (recalibrated — operator ruling KL 2026-07-22, mākoha):
 * A genuine red STOPs. A thing we simply cannot resolve from a telehealth channel
 * is ORANGE, not red — it defaults to CAUTION (look closer, run the light ABCDE,
 * hand to a human), never to a reflexive STOP. Unknown ≠ emergency in a low-acuity
 * everyday tool where the patient has a clinician present and every other avenue
 * open. A broken INSTRUMENT (a drifted/untrustworthy registry, malformed input,
 * a module error) is different from a clinical unknown and still STOPs loudly.
 *
 *   tier_model always_immediate        → STOP, no interrogation, none can clear it.
 *   tier_model safeguarding_always_report → STOP + mandatory_report (acuity-
 *                                        independent; no reassuring-refer branch).
 *   tier_model acuity_dependent — interrogate:
 *     any universal-override or condition-specific stigma "present"  → STOP (a red
 *                                        that is actually PRESENT — go now).
 *     any discriminator "unknown" / unanswered                       → CAUTION (fail-SAFE:
 *                                        "I can't rule it out from here" is orange, not
 *                                        red — the telehealth-normal absence of bedside
 *                                        data is not itself a danger sign; ABCDE + human).
 *     all stigmata "absent", refer_if pattern "present"              → CAUTION (the flag
 *                                        persists in its attested stable form).
 *     all stigmata "absent", refer_if pattern "absent"               → GO (red herring —
 *                                        the flag was interrogated away; the negative
 *                                        discriminators are recorded so the audit shows why)
 *   off-registry / managed-only / unattested condition → CAUTION with fail_closed:true
 *     (a clinical unknown we have no attested basis to scrutinise — orange + human,
 *      not a reflexive siren).
 *   BROKEN INSTRUMENT (drifted/unattested REGISTRY, unrecognised tier_model,
 *   malformed input, module error) → STOP with fail_closed:true. A tool that
 *   cannot trust its own attested data must halt loudly, never quietly proceed.
 *
 * fail_closed:true now marks a SAFE-DEFAULT verdict (defaulted, not positively
 * interrogated) — its TIER is CAUTION for a clinical unknown and STOP for a broken
 * instrument. It no longer implies STOP.
 *
 * The refer_if criterion is itself an attested discriminator (the condition's
 * stable-form pattern): it separates "flag persists without stigmata" (CAUTION)
 * from "flag dispelled" (GO). An unknown refer_if answer defaults to CAUTION like
 * every other unresolved discriminator.
 */
import {
  findExclusion,
  discriminatorsFor,
  registryAttestationGate,
  exclusionAttestationGate,
} from "./discriminators.js";
import { ConcernVerdict } from "./verdict-schema.js";

/** Build a fail-closed STOP verdict — the BROKEN-INSTRUMENT default. Reserved for
 *  faults where the tool cannot trust its own attested data (drifted/unattested
 *  registry, unrecognised tier_model, malformed input, module error): halt loudly.
 *  A clinical unknown is NOT a broken instrument — use failSafeCautionVerdict. */
export function failClosedVerdict(flag, reason) {
  return ConcernVerdict.parse({
    area_id: String(flag?.area_id || "(unknown)") || "(unknown)",
    condition: String(flag?.condition || "(unknown)") || "(unknown)",
    tier: "STOP",
    tier_model: "unresolved",
    entity_class: "indeterminate",
    discriminators_asked: [],
    reason: `fail-closed (broken instrument): ${reason}`,
    fail_closed: true,
    mandatory_report: false,
  });
}

/** Build a fail-SAFE CAUTION verdict — the recalibrated default for a CLINICAL
 *  UNKNOWN (operator ruling KL 2026-07-22, mākoha). "I can't rule it out from
 *  here" is orange, not red: we do NOT slam the emergency brake. CAUTION runs the
 *  light ABCDE and hands to a human — it is never an unsupervised pass. Used for
 *  an off-registry / managed-only / unattested condition (no attested basis to
 *  scrutinise) and, inline below, for an unresolved discriminator on a known
 *  condition. fail_closed:true still marks it a safe-DEFAULT (not interrogated). */
export function failSafeCautionVerdict(flag, reason, opts = {}) {
  return ConcernVerdict.parse({
    area_id: String(flag?.area_id || "(unknown)") || "(unknown)",
    condition: String(opts.condition || flag?.condition || "(unknown)") || "(unknown)",
    tier: "CAUTION",
    tier_model: opts.tier_model || "unresolved",
    entity_class: "indeterminate",
    discriminators_asked: opts.discriminators_asked || [],
    reason: `fail-safe CAUTION (unresolved — clinician review): ${reason}`,
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
  // Off-registry / managed-only condition: a CLINICAL unknown, not a broken
  // instrument (the registry itself passed the attestation gate above). We have
  // no attested basis to scrutinise it → CAUTION + human, not a reflexive STOP.
  if (!lookup.found) return failSafeCautionVerdict(flag, lookup.reason);
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

  // An exclusion condition that is present but NOT clinician-attested: a clinical
  // unknown (we lack an attested discriminator set for it), not a corrupt registry
  // → CAUTION + human. (The registry-wide attestation/version gate above is the
  // broken-instrument STOP; this is a single unattested condition within a valid
  // registry.)
  const attestation = exclusionAttestationGate(exclusion);
  if (!attestation.evaluable) return failSafeCautionVerdict(flag, attestation.reason, { condition: exclusion.condition });

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

  // An unresolved (unknown/unanswered) discriminator on a KNOWN, attested
  // condition: the telehealth-normal state — no bedside data — is not a danger
  // sign in itself (operator ruling KL 2026-07-22, mākoha). No stigma is PRESENT;
  // we simply cannot exclude one remotely. That is ORANGE: default to CAUTION,
  // run the light ABCDE, and hand to a human — do NOT reflexively STOP. A stigma
  // that is actually PRESENT was already caught above and STOPs.
  const unresolved = asked.find((d) => d.answer === "unknown");
  if (unresolved) {
    return ConcernVerdict.parse({
      area_id: flag.area_id,
      condition: exclusion.condition,
      tier: "CAUTION",
      tier_model: "acuity_dependent",
      entity_class: "indeterminate",
      discriminators_asked: asked,
      reason: `fail-safe CAUTION: discriminator [${unresolved.id}] "${unresolved.text}" cannot be resolved remotely (unknown/unanswered) — no stigma is present, so this is watch-with-caution + clinician review, not a reflexive escalation`,
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
