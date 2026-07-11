/**
 * metrics — charter-required run metrics + alarm seam (LIVE_PLAN L2, R-37).
 *
 * <observability_and_audit> requires as monitored metrics: pipeline pass/fail
 * rate, HARD_FAIL count, BLOCKED_NO_PROOF rate, and — ALARMED — every critical
 * under-triage event. This module is the in-process counter + alarm seam; the
 * dashboard/alerting infrastructure rides the deploy decision (L2 remainder).
 *
 * Design rules:
 *  - counters only, derived from the pipeline RESULT — this module never
 *    changes a gate, a verdict, or a hash (observability is additive);
 *  - the alarm seam is synchronous callbacks + a structured stderr line, so a
 *    deploy can wire a pager without the repo knowing which one;
 *  - critical_under_triage is raised by the EVALUATION layer (a live consult
 *    cannot know the gold tier); the seam lives here so live and eval share
 *    one alarm channel;
 *  - PPP-TTT STOP is deliberately NOT an alarm: STOP/escalation is the system
 *    working (over-triage is the safe direction) — it is counted, not paged.
 */

function freshCounters() {
  return {
    runs_total: 0,
    pass_total: 0,
    fail_total: 0,
    hard_fail_total: 0,
    blocked_no_proof_total: 0,
    ppp_ttt_go: 0,
    ppp_ttt_caution: 0,
    ppp_ttt_stop: 0,
    alarms_total: 0,
  };
}

let counters = freshCounters();
const alarmSubscribers = new Set();

/** Subscribe to alarms (deploy wires the pager here). Returns unsubscribe. */
export function onAlarm(cb) {
  if (typeof cb !== "function") throw new Error("onAlarm requires a function");
  alarmSubscribers.add(cb);
  return () => alarmSubscribers.delete(cb);
}

/**
 * Raise an alarm: structured stderr line + every subscriber. Never throws
 * (a broken pager hook must not take down the pipeline).
 * @param {string} event - e.g. "critical_under_triage", "pharmacology_hard_fail"
 * @param {object} [detail] - PHI-free metadata only (ids/hashes/counts)
 */
export function raiseAlarm(event, detail = {}) {
  counters.alarms_total += 1;
  const line = JSON.stringify({ alarm: event, at_utc: new Date().toISOString(), ...detail });
  process.stderr?.write?.(line + "\n");
  for (const cb of alarmSubscribers) {
    try {
      cb(event, detail);
    } catch {
      /* a failing subscriber never breaks the run */
    }
  }
}

/**
 * Record one pipeline run's outcomes. Call from the report writers alongside
 * recordRun(). Reads the result; never mutates it.
 * @param {{ verification: {pass:boolean}, firewall_status?: string, ppp_ttt?: {tier?: string} }} result
 */
export function recordRunMetrics(result) {
  counters.runs_total += 1;
  if (result?.verification?.pass) counters.pass_total += 1;
  else counters.fail_total += 1;

  if (result?.firewall_status === "HARD_FAIL") {
    counters.hard_fail_total += 1;
    // A HARD_FAIL is a terminal safety block worth operator visibility (the
    // block itself is already enforced upstream — this is observability only).
    raiseAlarm("pharmacology_hard_fail", { run_id: result.run_id });
  }
  if (result?.firewall_status === "BLOCKED_NO_PROOF") counters.blocked_no_proof_total += 1;

  const tier = result?.ppp_ttt?.tier;
  if (tier === "GO") counters.ppp_ttt_go += 1;
  else if (tier === "CAUTION") counters.ppp_ttt_caution += 1;
  else if (tier === "STOP") counters.ppp_ttt_stop += 1;
}

/** Immutable snapshot with derived rates (for /metrics and tests). */
export function metricsSnapshot() {
  const c = { ...counters };
  return {
    ...c,
    pass_rate: c.runs_total ? c.pass_total / c.runs_total : null,
    blocked_no_proof_rate: c.runs_total ? c.blocked_no_proof_total / c.runs_total : null,
  };
}

/** Test helper: reset counters (subscribers persist). */
export function resetMetrics() {
  counters = freshCounters();
}
