/**
 * A/B PARITY — the in-process engine vs the OpenCDS gateway (FL-34 Phase D).
 *
 * ══ WHAT A DIVERGENCE MEANS, AND WHAT IT DOES NOT ══
 * Both executors run the SAME clinician-signed records. The engine is the specification; each KM is a
 * second implementation of it. So a divergence is never "the knowledge is wrong" — it is **one of the
 * two implementations reading it wrong**, and this module CANNOT SAY WHICH. It reports the
 * disagreement and the inputs; a human adjudicates. Claiming to know which side is at fault would be
 * exactly the fabrication this system exists to prevent.
 *
 * Agreement is CORROBORATION — two independent readings of the same signed record landing in the same
 * place. That is the only thing a second executor buys, and it is worth having.
 *
 * ══ THE COMPARISON IS NARROWER THAN THE OBJECTS, ON PURPOSE ══
 * The locked wire contract is deliberately narrower than the frozen `pharm-check`. Comparing raw
 * objects would report the CONTRACT SHAPE as a knowledge divergence on every single case — and a
 * harness that cries wolf on its own configuration gets switched off, after which the real drift
 * ships. Three differences are legitimate and are encoded here rather than "fixed":
 *
 *   1. The engine's flags carry `flag_id`, `renal_threshold`, `au_reference`. `OpenCdsFlagSchema` is
 *      `.strict()` and has none of them — a forbidden field would fail the WHOLE response.
 *   2. The engine's dose may carry `pbs_authority_required` / `pbs_item_code`.
 *      `OpenCdsDoseCandidateSchema` has neither (F-C1): the engine's dose is AUTHORITATIVE, the
 *      gateway's is ADVISORY and narrower by design.
 *   3. The engine emits every APPLICABLE check; the gateway emits only what was REQUESTED. A check
 *      the gateway was never asked for is not a missing verdict (F-D2).
 *
 * So: status, per-check verdicts, flag findings, and the dose TEXT. Everything else is contract shape,
 * not knowledge.
 */

/** The eight checks a gateway can answer. Ask for all of them, or the first "divergence" is the ask. */
export const ALL_CHECKS = Object.freeze([
  "allergy_check", "interaction_check", "renal_dosing_check", "nti_check",
  "age_appropriateness_check", "schedule_8_check", "pregnancy_check", "hepatic_check",
]);

/** A flag reduced to what BOTH contracts can express — the finding, not its packaging. */
const flagKey = (f) => [f.flag_type, f.severity, f.drug_a ?? "", f.drug_b ?? "", f.description ?? ""].join("␟");

const byCheck = (list) => Object.fromEntries((list || []).map((c) => [c.check_id, c.status]));

/**
 * Compare one engine PharmCheck against one gateway result.
 *
 * @param pharmCheck   the engine's output (the specification)
 * @param clientResult the cds-adapter client's composed result (the gateway, re-validated fail-closed)
 * @param checksRequested which checks the gateway was actually asked for
 * @returns {{agree: boolean, divergences: Array<{axis, detail, engine, gateway}>}}
 */
export function compareExecutors(pharmCheck, clientResult, { checksRequested = ALL_CHECKS } = {}) {
  const divergences = [];
  const add = (axis, detail, engine, gateway) => divergences.push({ axis, detail, engine, gateway });

  // ── 1. The composed status. The headline: would these two block the same prescription? ──
  if (pharmCheck.status !== clientResult.verdict) {
    add("status", "the two executors reached different overall verdicts on the same signed records", pharmCheck.status, clientResult.verdict);
  }

  // ── 2. Per-check, over the REQUESTED set only ──
  // A check the gateway was not asked for is not a missing verdict (F-D2). But a check that WAS asked
  // for and answered by only one side IS a divergence: either the engine found it applicable and the
  // KM did not, or the reverse — and that is a disagreement about the knowledge, not the request.
  const e = byCheck(pharmCheck.check_results);
  const g = byCheck(clientResult.check_results);
  for (const id of checksRequested) {
    const ev = e[id];
    const gv = g[id];
    if (ev === gv) continue;                       // includes both-absent: "not applicable" on both sides
    if (ev === undefined) add("check", `${id}: the gateway produced a verdict the engine did not — the KM thinks this check applies and the engine does not`, "(not applicable)", gv);
    else if (gv === undefined) add("check", `${id}: the engine produced a verdict the gateway did not — the KM did not run, or thinks it does not apply`, ev, "(absent)");
    else add("check", `${id}: the two executors disagree on this check`, ev, gv);
  }

  // ── 3. Flags — the FINDINGS a clinician reads ──
  // Compared as a multiset on (type · severity · drugs · description): the engine emits a flag PER
  // interaction hit, so warfarin+amiodarone+aspirin is TWO findings, and losing one is a real loss of
  // what the clinician sees (C1). flag_id / renal_threshold / au_reference are excluded — the wire
  // cannot carry them and the contract is locked.
  const ef = (pharmCheck.flags || []).map(flagKey).sort();
  const gf = (clientResult.flags || []).map(flagKey).sort();
  if (ef.length !== gf.length || ef.some((k, i) => k !== gf[i])) {
    const onlyE = ef.filter((k) => !gf.includes(k));
    const onlyG = gf.filter((k) => !ef.includes(k));
    add("flags",
      `the findings differ — ${onlyE.length} only the engine reported, ${onlyG.length} only the gateway did. The client filters flags[] to build the list the clinician READS, so a lost finding is a lost interaction on their screen.`,
      onlyE.map((k) => k.split("␟")[0]), onlyG.map((k) => k.split("␟")[0]));
  }

  // ── 4. The dose TEXT ──
  // Only when BOTH may emit one. The gateway's is advisory and its key set is narrower (F-C1), so only
  // `safe_dose_range` is comparable — and it is the only part a clinician reads anyway. Both executors
  // read the SAME signed record, so a difference here means one is reading it wrong.
  const ed = pharmCheck.dose_guidance?.safe_dose_range ?? null;
  const gd = clientResult.dose_guidance?.safe_dose_range ?? null;
  if (ed !== gd) {
    add("dose", "the two executors produced different dose text from the same clinician-signed record — one of them is reading it wrong", ed, gd);
  }

  return { agree: divergences.length === 0, divergences };
}

/** Render a divergence for a human who has to adjudicate it. */
export function formatDivergence(drug, d) {
  return `  ${drug} · ${d.axis.toUpperCase()}\n      ${d.detail}\n      engine : ${JSON.stringify(d.engine)}\n      gateway: ${JSON.stringify(d.gateway)}`;
}
