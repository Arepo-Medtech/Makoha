/**
 * MedAgentBench agents-under-test (Mechanical Inventory MA.2).
 *
 * The MIRAGE realPath-vs-scriptedPath pattern:
 *   - referenceAgent   — a deterministic solver that EXECUTES each task's action_spec against
 *                        the sandbox (genuine reads/compute), holding every invariant. It is
 *                        the "realPath" analogue: proves the driver + scorer + invariant gate
 *                        end-to-end with NO model.
 *   - scripted breach agents — each produces the CORRECT action but breaches exactly one
 *                        invariant, to prove the invariant-adherence HARD gate bites.
 *   - pipelineAgent    — the LIVE agent: drives the real trunk pipeline
 *                        (runTrunkWithGrounding) with an injected generator, writeArtifacts
 *                        OFF (the audit ledger is NEVER touched by a benchmark). Input-gated
 *                        on a model/fixtures — the armed run is deferred, like MIRAGE's live
 *                        backends and the FL-40 recorded run.
 *
 * An agent is `{ name, async act(task, ehr, ctx) -> output }` where output is the object the
 * invariant checker + scorer read: { action, text?, codes?, terminology_receipt?, dose?,
 * hard_fail_seen?, proceeded_after_hard_fail? }.
 */
import { runTrunkWithGrounding } from "../../integration/trunk-pipeline.js";

/** Whole years between an ISO birthDate and a reference ISO date (no wall-clock in the corpus). */
function ageYears(birthDate, refIso) {
  const b = new Date(birthDate);
  const r = new Date(refIso);
  let age = r.getUTCFullYear() - b.getUTCFullYear();
  const m = r.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && r.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/** The deterministic reference solver — executes action_spec against the sandbox. */
export function referenceAgent() {
  return {
    name: "reference",
    act(task, ehr, ctx = {}) {
      const spec = task.action_spec || {};
      if (spec.op === "read_field") {
        const r = ehr.read({ resourceType: spec.resourceType, id: spec.id });
        return { action: { field: spec.field, value: r ? r[spec.field] : null } };
      }
      if (spec.op === "age_at_least") {
        const r = ehr.read({ resourceType: spec.resourceType, id: spec.id });
        const refIso = ctx.nowIso || "1970-01-01T00:00:00.000Z";
        const ok = r && r.birthDate ? ageYears(r.birthDate, refIso) >= spec.years : false;
        return { action: { answer: ok ? "16_or_over" : "under_16" } };
      }
      if (spec.op === "emit_order") {
        return { action: { ...(spec.fields || {}) } };
      }
      return { action: {} };
    },
  };
}

/** Scripted breach agents — correct action, one deliberate invariant breach each. */
export function fabricatedCodeAgent() {
  const ref = referenceAgent();
  return {
    name: "fabricated-code",
    act(task, ehr, ctx) {
      return { ...ref.act(task, ehr, ctx), codes: [{ system: "snomed", code: "12345678" }], terminology_receipt: false };
    },
  };
}
export function doseEmittingAgent() {
  const ref = referenceAgent();
  return {
    name: "dose-emitting",
    act(task, ehr, ctx) {
      return { ...ref.act(task, ehr, ctx), dose: "amoxicillin 500 mg tds" };
    },
  };
}
export function hardFailIgnoringAgent() {
  const ref = referenceAgent();
  return {
    name: "hard-fail-ignoring",
    act(task, ehr, ctx) {
      return { ...ref.act(task, ehr, ctx), hard_fail_seen: true, proceeded_after_hard_fail: true };
    },
  };
}

/**
 * LIVE agent: drive the real trunk pipeline over the task prompt. writeArtifacts:false so the
 * benchmark NEVER writes verification/report.json or appends to the medicolegal ledger. The
 * agentic multi-tool loop + task-success mapping is input-gated on a real model/fixtures; this
 * seam proves the driver genuinely invokes the pipeline and lets the invariant checker read a
 * real pipeline output (text + firewall/verification state).
 * @param {{ generateCandidate: Function, trunkId?: string }} cfg
 */
export function pipelineAgent({ generateCandidate, trunkId = "9.0" } = {}) {
  return {
    name: "pipeline",
    async act(task) {
      const res = await runTrunkWithGrounding(trunkId, task.prompt, { generateCandidate, writeArtifacts: false });
      const hard = res.firewall_status === "HARD_FAIL";
      return {
        action: {},
        text: res.output,
        hard_fail_seen: hard,
        proceeded_after_hard_fail: hard && !res.continuation_blocked,
        verification: res.verification,
        pipeline_pass: res.pass,
      };
    },
  };
}
