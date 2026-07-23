/**
 * intake-concern — the bridge from a Trunk 1.0 intake `safety_gate` to PPP-TTT
 * interrogation (escalation de-biasing, rubric-adjacent; Phase A of the coupled
 * A+B design). PURE + deterministic — no I/O, cannot throw on a well-typed call.
 *
 * WHY THIS EXISTS. Trunk 1.0 was sending ~72% of routine (advisory) presentations
 * to T5 at intake, unscrutinised — the model over-read subjective severity as a
 * present danger sign. The fix makes `escalate_now` a CLAIM that must be shown,
 * not a final disposition: the trunk names the specific danger sign(s) it is
 * escalating on and whether each is demonstrably `present`. This classifier reads
 * that articulation and decides how the escalation should be interrogated (Phase B
 * maps the classification to a PPP-TTT verdict; the frozen monotone-AND
 * composition is untouched).
 *
 * FAIL-SAFE — the single most important rule here:
 *   - An `escalate_now` we CANNOT interrogate (danger_signs absent or malformed)
 *     is HONOURED as an escalation (broken instrument → STOP downstream), NEVER
 *     silently downgraded. This is why replaying pre-contract fixtures (no
 *     danger_signs) keeps every intake escalation intact — a genuine emergency is
 *     never de-escalated just because the articulation is missing.
 *   - De-escalation happens ONLY on a CLEAN, EXPLICIT claim: the trunk emitted
 *     danger_signs and NONE is `present` (all `inferred`/`unknown`). That is the
 *     demonstrable "escalated, but nothing is actually present" case → CAUTION
 *     (look closer, route onward), not the ambulance.
 *   - A demonstrably `present` danger sign → the escalation is GROUNDED → STOP
 *     (escalate now, exactly as before). Genuine reds are never touched.
 */

const VALID_STATUS = new Set(["present", "inferred", "unknown"]);

/**
 * Classify a Trunk 1.0 `safety_gate` for interrogation.
 * @param {{status?:string, reasons?:string[], danger_signs?:Array}} safetyGate
 * @returns {null | { broken:boolean, grounded:boolean, present:Array, unresolved:Array, danger_signs:Array }}
 *   null  → not an `escalate_now`; there is nothing to interrogate here.
 *   broken=true   → danger_signs absent/malformed → HONOUR the escalation (STOP), fail-closed.
 *   grounded=true → ≥1 `present` demonstrable danger sign → HONOUR the escalation (STOP).
 *   grounded=false (and not broken) → 0 `present` → INTERROGATE/downgrade to CAUTION.
 */
export function buildIntakeConcern(safetyGate) {
  const sg = safetyGate || {};
  if (sg.status !== "escalate_now") return null; // clear / blocked_incomplete: nothing to interrogate

  const signs = sg.danger_signs;
  // Broken instrument: the contract REQUIRES a well-formed danger_signs[] on an
  // escalate_now. Absent or malformed = an escalation we cannot interrogate.
  // Honour it (STOP downstream) — never downgrade an un-interrogable emergency.
  const malformed =
    !Array.isArray(signs) ||
    signs.some((s) => !s || typeof s.sign !== "string" || !s.sign.trim() || !VALID_STATUS.has(s.status));
  if (malformed) {
    return { broken: true, grounded: false, present: [], unresolved: [], danger_signs: Array.isArray(signs) ? signs : [] };
  }

  const present = signs.filter((s) => s.status === "present");
  const unresolved = signs.filter((s) => s.status === "inferred" || s.status === "unknown");
  return {
    broken: false,
    grounded: present.length >= 1, // a demonstrable present danger sign grounds the escalation
    present,
    unresolved,
    danger_signs: signs,
  };
}
