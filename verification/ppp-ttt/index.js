/**
 * ppp-ttt — public entry: gradeConcern() + composeTriage().
 *
 * PPP-TTT graduates the binary flag→halt behaviour into a graded verdict —
 * STOP / CAUTION / GO — composed into the pipeline EXACTLY the way the H2
 * integrity detectors are: as a MONOTONE-AND stage that can only ADD caution
 * or escalation, never rescue or downgrade. STOP is the existing hard
 * behaviour made explicit and non-overridable; GO is the existing clean pass;
 * CAUTION is the only new runtime state (structured interrogation did not
 * establish the high-acuity stigmata → run the light ABCDE protocol,
 * subordinate to human sign-off).
 *
 * HARD PROPERTIES (proven by test/contract-ppp-ttt-monotone.js):
 *  - never rescues: composeTriage(base, t).pass ⇒ base.pass;
 *  - never downgrades: tier is an ordinal max (GO < CAUTION < STOP);
 *  - fail-closed: any ambiguity, unattested discriminator, off-registry
 *    condition, or module error yields STOP (gradeConcern cannot throw);
 *  - additive: with no raised flags the pipeline is byte-identical to today;
 *  - nothing here sets the patient-eligibility flag, reads scoring nodes
 *    10–13, emits a dose, or authorises a diagnosis. "Continue" always means: keep reasoning
 *    and hand to a human (script paths still route through the Trunk 8.0
 *    firewall + synchronous consult).
 */
import { GradeConcernInput, Step1Verdict, maxTier, TIER_ORDER } from "./verdict-schema.js";
import { ABCDE } from "./abcde-schema.js";
import { gradeFlag, failClosedVerdict } from "./interrogate.js";
import { PINNED_SCOPE_REGISTRY_VERSION } from "./discriminators.js";
import { assessPlausiblePassage } from "./abcde/a-plausible-passage.js";
import { balancePracticalities } from "./abcde/b-balance.js";
import { caveatsOnProvisionality } from "./abcde/c-caveats.js";
import { pitfallPathways } from "./abcde/d-pitfalls.js";
import { educationPotestative } from "./abcde/e-education.js";

export { buildAbcdeRecord } from "./record.js";
export { appendPppTttEntry, readPppTttLedger, verifyPppTttChain, ledgerCoreFromRecord } from "./ledger.js";

/** Blocking reason for a STOP — carries the literal token "escalate_now" so the
 *  UNTOUCHED sequencer's detectEscalation() halts on any surface rendering it
 *  (Seam B, defence in depth on top of the pass:false halt). */
function stopReason(reason) {
  return `PPP-TTT triage STOP — escalate_now: ${reason}`;
}

/** Assemble the aggregate Step-1 verdict from per-flag verdicts. */
function aggregate(concerns, evidenceConsidered) {
  let top = concerns[0];
  for (const c of concerns) if (TIER_ORDER[c.tier] > TIER_ORDER[top.tier]) top = c;
  const tier = concerns.reduce((t, c) => maxTier(t, c.tier), "GO");
  const verdict = {
    tier,
    tier_model: top.tier_model,
    entity_class: top.entity_class,
    concerns,
    discriminators_asked: concerns.flatMap((c) => c.discriminators_asked),
    evidence_considered: evidenceConsidered,
    scope_registry_version: PINNED_SCOPE_REGISTRY_VERSION,
    reason: concerns.map((c) => `[${c.condition}] ${c.tier}: ${c.reason}`).join(" | "),
    fail_closed: concerns.some((c) => c.fail_closed),
    reasons_if_blocking:
      tier === "STOP"
        ? concerns.filter((c) => c.tier === "STOP").map((c) => stopReason(`${c.condition} — ${c.reason}`))
        : [],
  };
  return Step1Verdict.parse(verdict);
}

/** Upgrade an aggregate verdict to STOP (ABCDE re-surfaced a stigma / red flag /
 *  escalate pathway). Tier only ever RISES — monotone lifetime. */
function upgradeToStop(verdict, why) {
  return Step1Verdict.parse({
    ...verdict,
    tier: "STOP",
    reason: `${verdict.reason} | ABCDE upgrade: ${why}`,
    reasons_if_blocking: [...verdict.reasons_if_blocking, stopReason(why)],
  });
}

/**
 * Step 1 (+ Step 2 ABCDE when CAUTION). PURE apart from reading the two pinned
 * datasets (scope registry, omnibus), and CANNOT THROW: any internal error is
 * converted into a fail-closed STOP verdict (edge case 10) — the frozen
 * pipeline then halts via pass:false.
 *
 * @param {{ flags: Array, patient_answers?: object, evidence?: object, abcde_input?: object }} rawInput
 * @returns {object} Step1Verdict, with `.abcde` attached when the tier is CAUTION
 */
export function gradeConcern(rawInput) {
  let input;
  try {
    input = GradeConcernInput.parse(rawInput);
  } catch (err) {
    const v = failClosedVerdict(
      (rawInput && Array.isArray(rawInput.flags) && rawInput.flags[0]) || {},
      `malformed gradeConcern input: ${err && err.message ? err.message.slice(0, 200) : "parse failure"}`
    );
    return aggregate([v], []);
  }

  const evidenceConsidered = [
    ...(input.evidence.citations || []),
    ...(input.evidence.terminology_receipts || []),
  ];

  let verdict;
  try {
    const concerns = input.flags.map((flag) => {
      try {
        return gradeFlag(flag, input.patient_answers);
      } catch (err) {
        // Per-flag module error → that flag fails closed (STOP) — never skipped.
        return failClosedVerdict(flag, `module error while grading: ${err && err.message ? err.message.slice(0, 200) : "unknown"}`);
      }
    });
    verdict = aggregate(concerns, evidenceConsidered);
  } catch (err) {
    const v = failClosedVerdict(input.flags[0], `module error: ${err && err.message ? err.message.slice(0, 200) : "unknown"}`);
    return aggregate([v], evidenceConsidered);
  }

  // Step 2 — ABCDE, only for a CAUTION run. A co-present STOP has already
  // absorbed any CAUTION flags (ordinal max), so ABCDE never runs under STOP.
  if (verdict.tier !== "CAUTION") return verdict;

  try {
    const cautionConcerns = verdict.concerns.filter((c) => c.tier === "CAUTION");

    // A patient-reported red flag mid-ABCDE upgrades immediately (state machine).
    if (input.abcde_input.red_flag_reported) {
      return upgradeToStop(verdict, "patient reported a red flag during ABCDE — escalate");
    }

    const A = assessPlausiblePassage(cautionConcerns);
    if (A.graded_verdict === "not_safe") {
      return upgradeToStop(verdict, `A-PP found residual open discriminators [${A.residual_discriminators_open.join(", ")}] — continued passage not plausibly safe`);
    }
    const B = balancePracticalities(A, input.abcde_input);
    if (B.pathway === "escalate") {
      return upgradeToStop(verdict, "B-PP selected escalate");
    }
    const abcde = ABCDE.parse({
      A_plausible_passage: A,
      B_balance: B,
      C_caveats: caveatsOnProvisionality(),
      D_pitfalls: pitfallPathways(cautionConcerns),
      E_education: educationPotestative(cautionConcerns, input.abcde_input),
    });
    // The ABCDE payload rides NEXT TO the strict verdict (record.js splits it
    // back out); the verdict fields themselves stay schema-frozen.
    return { ...verdict, abcde };
  } catch (err) {
    // ABCDE module error → fail closed, same as every other ambiguity.
    return upgradeToStop(verdict, `ABCDE module error: ${err && err.message ? err.message.slice(0, 200) : "unknown"}`);
  }
}

/**
 * MONOTONE-AND composition with the existing verification object — mirrors
 * combineVerification() exactly:
 *   - results[] (the five verifier checks) is UNTOUCHED, so report-schema.js
 *     .strict() stays valid;
 *   - pass can only TIGHTEN: base.pass AND tier !== STOP (a STOP fails the
 *     run; nothing here can flip false → true);
 *   - tier is an ordinal MAX against the base (a base that already failed is
 *     treated as STOP-tier, so PPP-TTT can never report a lower tier than the
 *     pipeline already reached);
 *   - human-readable STOP reasons are appended to missing_receipts (surfaced
 *     in the report + evidence_tree with no schema change);
 *   - the structured triage rides a NEW in-memory field `ppp_ttt` (never
 *     handed to validateReport by the named-field report builders).
 *
 * @param {{pass:boolean, results:Array, missing_receipts:string[], candidate_output_hash:string}} verification
 *        the object returned by combineVerification()
 * @param {object} triage - gradeConcern() output
 * @returns {object} same shape as `verification`, plus `ppp_ttt`
 */
export function composeTriage(verification, triage) {
  const priorTier = verification.pass === false ? "STOP" : "GO";
  const tier = maxTier(priorTier, triage.tier);
  return {
    ...verification,
    // results stays EXACTLY the five verifier checks — report schema unchanged.
    results: verification.results,
    // Monotone: STOP ⇒ false; never flips false → true.
    pass: verification.pass && triage.tier !== "STOP",
    missing_receipts: [...(verification.missing_receipts || []), ...(triage.reasons_if_blocking || [])],
    // Structured triage for callers/portal/ledger; run_tier is the composed
    // ordinal max (can only meet or exceed the run's pre-existing severity).
    ppp_ttt: { ...triage, run_tier: tier },
  };
}
