/**
 * Contract test for DoseGuidanceSchema (FL dose-guidance C0).
 *
 * dose_guidance is THE sensitive capability: it is the only datastore content that becomes a
 * dose, so the "no dosages from the LLM" / "no autonomous prescription" hard limits are only as
 * strong as this schema. These tests assert the bars are MECHANICAL — that a bad record fails to
 * PARSE — rather than relying on a convention an authoring pass could forget.
 *
 * The four things proven here:
 *  1. an agent cannot author a dose (entered_by must be an AHPRA id on the clinician channel);
 *  2. a channel cannot be laundered (APF attestation must cite apf22; PI must cite a PI doc + when);
 *  3. a diverging AMASS cross-check is UNREPRESENTABLE (not in the enum) — it cannot be written;
 *  4. the cross-check gate cannot be skipped silently ("not_available" must say why, and may not
 *     carry a comparator it claims not to have found).
 *
 * Run from repo root: node test/contract-dose-guidance-schema.js
 */
import { DoseGuidanceSchema, validateDoseGuidance, CAPABILITY_VALIDATORS } from "../mcp/servers/pharmacology/domain/model.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

/** Assert a record PARSES. */
const ok = (rec, msg) => {
  const r = DoseGuidanceSchema.safeParse(rec);
  expect(r.success, `${msg} — expected parse OK, got: ${r.success ? "" : r.error.issues.map((i) => i.message).join("; ")}`);
};
/** Assert a record is REJECTED, and that the rejection mentions `hint` (so a record can't fail
 *  for an unrelated reason and let us believe the intended bar is holding). */
const rejects = (rec, hint, msg) => {
  const r = DoseGuidanceSchema.safeParse(rec);
  if (r.success) { errors.push(`${msg} — expected REJECT, but it parsed`); return; }
  const all = r.error.issues.map((i) => i.message).join("; ");
  expect(all.toLowerCase().includes(hint.toLowerCase()), `${msg} — rejected, but not for the expected reason (wanted /${hint}/, got: ${all})`);
};

const provenance = {
  source: "APF22 Section D (facts, cited)",
  source_ref: "apf22",
  authored_by: "clinician worksheet entry",
  reviewed_by: "Kenneth Lee",
  review_status: "approved",
  version: "v0.1.0",
  effective_date: "2026-07-15",
};

/** A minimal VALID record: clinician-entered APF22 fact, AMASS-agreed. */
const base = () => ({
  ingredient: "amoxicillin",
  context: "adult, respiratory tract infection",
  safe_dose_range: "500 mg every 8 hours",
  origin: {
    channel: "clinician_apf_attestation",
    reference: "apf22",
    entered_by: "MED0001857758",
  },
  cross_check: {
    status: "agrees",
    checked_utc: "2026-07-15T00:00:00Z",
    amass_id: "AMRC_example",
    agency: "FDA",
    fda_ema_statement: "500 mg every 8 hours",
  },
  provenance,
});

// ---- 0. the happy paths parse -------------------------------------------------------------
ok(base(), "valid clinician_apf_attestation record");
ok({ ...base(), origin: { channel: "tga_pi", reference: "PI-AUST-R-12345-v3", entered_by: "tga-pi-fetch-job", retrieved_utc: "2026-07-15T00:00:00Z" } },
  "valid tga_pi record");
ok({ ...base(), cross_check: { status: "not_available", checked_utc: "2026-07-15T00:00:00Z", not_available_reason: "AU-only product; no FDA/EMA authorisation exists" } },
  "valid record where no FDA/EMA comparator exists");
ok({ ...base(), corroborating_evidence: [{ identifier: "37712551", id_type: "pmid" }] },
  "valid record linking the signed dose-evidence register");

// ---- 1. AN AGENT CANNOT AUTHOR A DOSE -----------------------------------------------------
// The core bar. entered_by must be an AHPRA registration id; no agent string can match it.
for (const impostor of ["claude-fable-5 (agent)", "claude-fable-5", "agent", "Kenneth Lee", "KL", "med0001857758", "MED123"]) {
  rejects({ ...base(), origin: { ...base().origin, entered_by: impostor } }, "AHPRA",
    `agent/non-AHPRA entered_by "${impostor}" must be rejected`);
}
ok({ ...base(), origin: { ...base().origin, entered_by: "PHA0001234567" } },
  "a different valid AHPRA prefix (pharmacist) is accepted");

// ---- 2. A CHANNEL CANNOT BE LAUNDERED -----------------------------------------------------
rejects({ ...base(), origin: { ...base().origin, reference: "tga-pi" } }, "apf22",
  "APF attestation citing a non-apf22 reference must be rejected (would launder a non-APF number through the APF attestation)");
rejects({ ...base(), origin: { channel: "tga_pi", reference: "apf22", entered_by: "job", retrieved_utc: "2026-07-15T00:00:00Z" } }, "not \"apf22\"",
  "tga_pi citing apf22 must be rejected");
rejects({ ...base(), origin: { channel: "tga_pi", reference: "PI-AUST-R-12345-v3", entered_by: "tga-pi-fetch-job" } }, "retrieved_utc",
  "tga_pi without retrieved_utc must be rejected (a versioned document needs a retrieval time to be re-verifiable)");
rejects({ ...base(), origin: { ...base().origin, retrieved_utc: "2026-07-15T00:00:00Z" } }, "not a retrieval",
  "a clinician attestation carrying retrieved_utc must be rejected");
rejects({ ...base(), origin: { channel: "amass", reference: "apf22", entered_by: "MED0001857758" } }, "invalid",
  "a third origin channel must not exist — AMASS can never be an origin");

// ---- 3. A DIVERGING CROSS-CHECK IS UNREPRESENTABLE -----------------------------------------
// D-DG-3: divergence hard-blocks. "diverges" is absent from the enum, so a diverging candidate
// cannot be expressed as a dose-guidance record at all — it belongs in the review queue.
rejects({ ...base(), cross_check: { status: "diverges", checked_utc: "2026-07-15T00:00:00Z", divergence_note: "FDA says 875 mg BD" } }, "invalid",
  "a diverging cross_check must be unrepresentable (hard-block, not a prompt)");

// ---- 4. THE CROSS-CHECK GATE CANNOT BE SKIPPED SILENTLY ------------------------------------
rejects({ ...base(), cross_check: undefined }, "required",
  "cross_check is mandatory — a dose may not be written without the AMASS gate having run");
rejects({ ...base(), cross_check: { status: "agrees", checked_utc: "2026-07-15T00:00:00Z" } }, "comparator",
  '"agrees" without naming its comparator must be rejected (an unfalsifiable claim)');
rejects({ ...base(), cross_check: { status: "not_available", checked_utc: "2026-07-15T00:00:00Z" } }, "must state why",
  '"not_available" without a reason must be rejected (an unexplained skip reads identically to an unrun check)');
rejects({ ...base(), cross_check: { status: "not_available", checked_utc: "2026-07-15T00:00:00Z", not_available_reason: "none", amass_id: "AMRC_x" } }, "cannot carry an amass_id",
  '"not_available" carrying a comparator must be rejected');

// ---- 5. envelope discipline ----------------------------------------------------------------
rejects({ ...base(), safe_dose_range: undefined }, "required", "a record without a dose is not a dose record");
rejects({ ...base(), provenance: undefined }, "required", "Guardrail 5 — an anonymous dose fact cannot sit in the store");
rejects({ ...base(), amass_says: "500 mg" }, "Unrecognized", "strict(): an unknown key must not ride along");

// ---- 6. wiring ------------------------------------------------------------------------------
expect(CAPABILITY_VALIDATORS.dose_guidance === validateDoseGuidance,
  "dose_guidance must be registered in CAPABILITY_VALIDATORS so the authoring pipeline gates it");
try {
  validateDoseGuidance({ ...base(), origin: { ...base().origin, entered_by: "claude-fable-5 (agent)" } });
  errors.push("validateDoseGuidance must THROW on an agent-authored dose");
} catch (e) {
  expect(/AHPRA/.test(e.message), `validateDoseGuidance threw, but not for the AHPRA bar: ${e.message}`);
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-dose-guidance-schema FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-dose-guidance-schema: OK");
