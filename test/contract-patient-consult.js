/**
 * Contract test: the patient-facing consult surface (LIVE_PLAN L11).
 *
 * THE LOAD-BEARING INVARIANT: no patient-visible CLINICAL DRAFT escapes the
 * release gate. Proves:
 *  - EMERGENCY (PPP-TTT STOP) → non-overridable 000 screen, NO draft; wins over
 *    under-18 / interpreter (highest precedence);
 *  - PAEDIATRIC (age<18) → in-person referral, no draft/dose;
 *  - INTERPRETER → human escalation, no autonomous draft;
 *  - CAUTION → E-PP bounded choice + "No diagnosis/No decisions" caveats +
 *    safety-net, and the draft is gated (dev → pending, never shown);
 *  - GO → draft gated through releaseToPatient(): dev refuses → DRAFT_PENDING
 *    with NO draft text; only a released:true gate yields the draft;
 *  - the flow ALWAYS calls releaseToPatient before showing any clinical text;
 *  - fail-safe: a flow error routes to the emergency screen, never a draft;
 *  - the HTTP server: healthz open, intake renders, a consult run renders a
 *    screen with no leaked draft, output HTML-escaped;
 *  - nothing in patient/ references patient_eligible.
 *
 * Run from repo root: node test/contract-patient-consult.js
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { decidePatientScreen, SCREENS } from "../patient/consult-flow.js";
import { createConsultServer } from "../patient/consult-server.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

// A release spy: records calls; releases only when told to (never by default —
// mirrors the frozen gate's dev behaviour).
function releaseSpy(releaseWhen) {
  const calls = [];
  const fn = (req) => { calls.push(req); return releaseWhen ? { released: true, released_hash: req.candidate_output_hash, reasons: [] } : { released: false, reasons: ["patient release refused in a non-live context (mock)"] }; };
  fn.calls = calls;
  return fn;
}

const DRAFT = "Based on the provided context, a provisional draft for clinician review. No diagnosis or dosages are given.";
const HASH = "sha256:" + "a".repeat(64);
const baseResult = (over = {}) => ({ output: DRAFT, verification: { pass: true, candidate_output_hash: HASH }, ...over });

try {
  const PYELO = { source: "trunk_9.0", area_id: "uti", condition: "Pyelonephritis" };
  const answers = {};
  for (let i = 1; i <= 9; i++) answers[`uhao-${i}`] = "absent";
  for (let i = 1; i <= 5; i++) answers[`pyelonephritis-cs-${i}`] = "absent";
  answers["pyelonephritis-refer-1"] = "present";

  // Real pipeline results for GO / CAUTION / STOP.
  const goResult = await runPipeline({});
  const cautionResult = await runPipeline({ raised_flags: [PYELO], patient_answers: answers, abcde_input: { patient_decision: "proceed" } });
  const stopResult = await runPipeline({ raised_flags: [{ source: "trunk_1.0", area_id: "uti", condition: "Ectopic pregnancy" }] });
  check(cautionResult.ppp_ttt?.tier === "CAUTION" && stopResult.ppp_ttt?.tier === "STOP", "fixture pipeline runs produced CAUTION and STOP tiers");

  // ── EMERGENCY (STOP) — non-overridable, no draft, highest precedence ────────
  const relNever = releaseSpy(false);
  const emerg = decidePatientScreen({ result: stopResult, patient_context: { age: 40 } }, { release: relNever });
  check(emerg.screen === SCREENS.EMERGENCY && emerg.overridable === false, "STOP → non-overridable emergency screen");
  check(!("draft" in emerg) && !JSON.stringify(emerg).includes(stopResult.output || "x-none"), "emergency screen carries NO clinical draft");
  // Emergency in a minor still shows emergency (precedence over paediatric).
  const emergMinor = decidePatientScreen({ result: stopResult, patient_context: { age: 8 } }, { release: relNever });
  check(emergMinor.screen === SCREENS.EMERGENCY, "an emergency in a minor still routes to 000 (emergency wins over paediatric)");

  // ── PAEDIATRIC — in-person referral, no draft ───────────────────────────────
  const paed = decidePatientScreen({ result: goResult, patient_context: { age: 15 } }, { release: relNever });
  check(paed.screen === SCREENS.PAEDIATRIC && !("draft" in paed), "under-18 → in-person referral, no draft");

  // ── INTERPRETER — human escalation, no draft ────────────────────────────────
  const interp = decidePatientScreen({ result: goResult, patient_context: { interpreter_required: true } }, { release: relNever });
  check(interp.screen === SCREENS.INTERPRETER && !("draft" in interp), "interpreter_required → human escalation, no draft");

  // ── CAUTION — E-PP bounded choice + caveats + safety-net; draft gated ───────
  const relSpy = releaseSpy(false);
  const caution = decidePatientScreen({ result: cautionResult, patient_context: {} }, { release: relSpy });
  check(caution.screen === SCREENS.CAUTION, "CAUTION → bounded-choice screen");
  check(JSON.stringify(caution.bounded_choice) === JSON.stringify(["proceed", "decline"]), "CAUTION offers proceed/decline");
  check(caution.caveats && caution.caveats.no_diagnosis === true && caution.caveats.no_decisions === true, "CAUTION surfaces the No diagnosis / No decisions caveats");
  check(Array.isArray(caution.safety_net) && caution.safety_net.length >= 1, "CAUTION carries safety-net descriptors");
  check(caution.subordinate_to_signoff === true, "CAUTION is subordinate to sign-off");
  check(relSpy.calls.length === 1, "CAUTION routed the draft through releaseToPatient()");
  check(!("draft" in caution) && caution.released === false, "CAUTION draft is gated: dev release refused → no draft shown");

  // ── GO — gated: dev refuses → pending, no draft ─────────────────────────────
  const relGo = releaseSpy(false);
  const go = decidePatientScreen({ result: goResult, patient_context: {} }, { release: relGo });
  check(go.screen === SCREENS.DRAFT_PENDING && go.released === false && !("draft" in go), "GO in dev → DRAFT_PENDING, no draft text (release refused)");
  check(relGo.calls.length === 1 && relGo.calls[0].candidate_output_hash === goResult.verification.candidate_output_hash,
    "GO routed the exact candidate hash through releaseToPatient()");

  // Only a released:true gate yields the draft.
  const relYes = releaseSpy(true);
  const released = decidePatientScreen({ result: baseResult(), patient_context: {} }, { release: relYes });
  check(released.screen === SCREENS.DRAFT_RELEASED && released.released === true && released.draft === DRAFT,
    "ONLY a released:true gate yields the draft text");

  // ── Fail-safe: a flow error routes to emergency, never a draft ──────────────
  const relThrow = () => { throw new Error("gate exploded"); };
  const failsafe = decidePatientScreen({ result: baseResult(), patient_context: {} }, { release: relThrow });
  check(failsafe.screen === SCREENS.EMERGENCY && !("draft" in failsafe), "a flow error routes to the emergency screen, never a draft");

  // ── The invariant, exhaustively: no draft unless released:true ──────────────
  for (const [name, s] of [["emergency", emerg], ["paediatric", paed], ["interpreter", interp], ["caution", caution], ["go", go], ["failsafe", failsafe]]) {
    check(s.released === true || !("draft" in s), `INVARIANT: "${name}" screen must carry no draft unless released:true`);
  }

  // ── HTTP server ─────────────────────────────────────────────────────────────
  const server = createConsultServer();
  await new Promise((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  check((await fetch(`${baseUrl}/healthz`)).status === 200, "/healthz open");
  const intake = await (await fetch(`${baseUrl}/`)).text();
  check(intake.includes("Start a consult") || intake.includes("what's going on") || intake.includes("main problem"), "intake page renders");
  check(intake.includes("not a doctor") && intake.includes("No diagnosis"), "every page carries the safety banner");
  const consult = await fetch(`${baseUrl}/consult`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ symptoms: "sore throat <script>alert(1)</script>", age: "40" }).toString() });
  const consultHtml = await consult.text();
  check(consult.status === 200, "POST /consult renders a screen");
  check(!consultHtml.includes("<script>alert(1)</script>"), "consult rendering HTML-escapes user input (XSS)");
  // The dev consult (GO, mock) must show pending sign-off, not a released draft.
  check(/awaiting|pending|sign-off/i.test(consultHtml), "a dev consult shows pending clinician sign-off, not a released draft");
  server.close();

  // ── No patient_eligible anywhere in patient/ ────────────────────────────────
  for (const f of readdirSync(join(process.cwd(), "patient"))) {
    if (!f.endsWith(".js")) continue;
    const src = readFileSync(join(process.cwd(), "patient", f), "utf8");
    check(!/patient_eligible/.test(src), `patient/${f} must not reference the patient-eligibility flag`);
    check(!/10_ground_truth|11_symptom_links|12_management_plan|13_safety_netting|data[\/\\]cases/.test(src), `patient/${f} must have no scoring-store read path`);
  }
} catch (e) {
  errors.push("unexpected throw: " + (e && e.stack ? e.stack : e));
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-patient-consult: OK");
