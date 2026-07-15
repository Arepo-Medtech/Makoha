/**
 * SMOKE — the AU_OSS_CDS gateway, end to end, against a REAL container (FL-34 Phase C / C4).
 *
 * ══ WHY THIS FILE EXISTS ══
 * Everything else in the FL-34 suite tests one side of a seam: the shim against fixtures I wrote, the
 * KMs against fixtures I wrote. Both were green while the route could not return PASS for ANY drug
 * (F-C8), while OpenCDS rejected every hook for want of a patientId (F-C7), and while the container
 * exited before Tomcat started (`wait -n` is bash; /bin/sh is dash). **Every one of those passed 96
 * unit tests first.** This is the only test that runs the real client against a real container.
 *
 * ══ ENV-GATED, AND IT SKIPS *GREEN* ══
 * CI has no container, so with `HEYDOC_PHARM_CDS_ENDPOINT` unset this SKIPS and exits 0 (the
 * smoke-llm precedent). That is a deliberate hole and worth naming: a skipped smoke proves nothing,
 * and a green CI run does NOT mean this passed. It means nobody asked.
 *
 *   docker build -t breath-ezy-cds-gateway .            # in the gateway repo
 *   docker run -d -p 18080:8080 -p 18081:8081 breath-ezy-cds-gateway
 *   HEYDOC_PHARM_CDS=AU_OSS_CDS \
 *   HEYDOC_PHARM_CDS_ENDPOINT=http://localhost:18081 \
 *     node test/smoke-opencds-gateway.js
 *
 * ══ WHAT IT DOES NOT DO ══
 * It does not make anything patient-facing. The `cds-adapter` slot stays EMPTY→HARD_FAIL until an
 * endpoint is wired AND staging-validated (A4), and receipts stay `mode=mock` until FL-50. Pointing
 * this at a container is a test, not a deployment.
 */
import { queryOpenCds, DEFAULT_KM_SET } from "../mcp/servers/pharmacology/cds-adapter/opencds-client.js";

const EP = (process.env.HEYDOC_PHARM_CDS_ENDPOINT || "").trim();
if (!EP) {
  console.log("smoke-opencds-gateway: SKIPPED — HEYDOC_PHARM_CDS_ENDPOINT unset (no container). This proves NOTHING; it means nobody asked.");
  process.exit(0);
}

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };

const intent = (drug, checks) => ({
  intent_id: "i-000001", session_ref: "enc-000001", intent_type: "new_prescription",
  drug_intent: { drug_name: drug, drug_class: "x" }, patient_facts_ref: {},
  clinical_context: { patient_age_years: 60 }, mode: "mock",
  ...(checks ? { checks_requested: checks } : {}),
});
const ADULT = { allergens: [], current_medications: [], egfr_ml_min: 90, patient_age_years: 60 };

// ---- 1. DISCOVERY: the 9 KMs are actually loaded ------------------------------------------------
// OPTIONAL, because the shim's port is not Tomcat's and the mapping cannot be guessed: my first cut
// derived it (`:18081` → `:8080`) and probed a port nothing was listening on. The probe failed, said
// so quietly — and the final line still announced "9 KMs discovered". A success message that claims
// what it did not check is the exact overclaiming defect this whole phase has been correcting, and I
// wrote it into my own output. So: the base is given explicitly, or the claim is NOT made.
let discovered = null;
{
  const base = (process.env.HEYDOC_PHARM_CDS_OPENCDS_BASE || "").trim().replace(/\/+$/, "");
  if (!base) {
    console.log("  (discovery not checked: set HEYDOC_PHARM_CDS_OPENCDS_BASE=http://localhost:18080/opencds to include it)");
  } else {
    try {
      const res = await fetch(`${base}/r4/hooks/cds-services`);
      const body = await res.json();
      const ids = (body.services || []).map((s) => s.id).filter((i) => String(i).startsWith("fl30-"));
      discovered = ids.length;
      expect(ids.length === 9, `discovery must list all 9 FL-30 knowledge modules — found ${ids.length}: ${ids.join(", ")}. A KM that failed to register is silently absent, and its check would report NOT_RUN forever.`);
    } catch (e) {
      errors.push(`discovery probe FAILED against ${base}: ${e.message}. A probe that cannot reach the gateway is a failure, not a skip — the previous version swallowed this and claimed the result anyway.`);
    }
  }
}

// ---- 2. THE CLEAN PASS — the thing the route could not do until F-C8 ---------------------------
{
  const r = await queryOpenCds(intent("paracetamol"), ADULT, { endpoint: EP });
  expect(r.verdict === "PASS",
    `a clean adult case must PASS — got ${r.verdict} (${r.reason}). Until F-C8 the wire STRIPPED allergens, so allergy_check (a DEFAULT_CHECK) returned NOT_RUN and the route could not return PASS for ANY drug, ever. Safe, and useless. If this regresses, that is what regressed.`);
  expect(r.receipt_mode === "mock", "receipts stay mock until A4 staging-validates — never mock-as-live");
  expect(r.knowledge_module_set === DEFAULT_KM_SET, `the gateway must be serving ${DEFAULT_KM_SET}`);
}

// ---- 3. THE FOUR CHECKS THAT WERE DEAD ---------------------------------------------------------
{
  const cases = [
    ["allergy", intent("amoxicillin", ["allergy_check"]), { ...ADULT, allergens: ["penicillin"] }, "HARD_FAIL"],
    ["pregnancy", intent("warfarin", ["pregnancy_check"]), { ...ADULT, pregnancy_status: "pregnant", patient_age_years: 30 }, "WARN"],
    ["hepatic", intent("methotrexate", ["hepatic_check"]), { ...ADULT, hepatic_impairment: true }, "WARN"],
    ["schedule_8", intent("morphine", ["schedule_8_check"]), { ...ADULT, s8_pdmp_checked: false }, "HARD_FAIL"],
  ];
  for (const [name, i, facts, want] of cases) {
    const r = await queryOpenCds(i, facts, { endpoint: EP });
    expect(r.verdict === want,
      `${name}: expected ${want}, got ${r.verdict}. These four checks read facts the wire silently STRIPPED until F-C8 — if one returns NOT_RUN again, a fact has stopped crossing.`);
  }
}

// ---- 4. F-C3: the version comes from the CARDS, so a stale gateway BLOCKS ----------------------
{
  for (const ask of ["fl30-kb:v1", "fl30-kb:v3"]) {
    const r = await queryOpenCds(intent("paracetamol"), ADULT, { endpoint: EP, knowledgeModuleSet: ask });
    expect(r.verdict === "BLOCKED_NO_PROOF" && /KB version mismatch/.test(r.reason || ""),
      `asking for ${ask} against a ${DEFAULT_KM_SET} gateway MUST block — got ${r.verdict}. If this passes, the shim has started ECHOING the requested version instead of reading it from the cards, and the cross-check has become decoration: a gateway running stale knowledge would answer PASS on a lie.`);
  }
}

// ---- 5. THE ADVISORY DOSE IS OFFERED, AND DROPPED ----------------------------------------------
{
  const r = await queryOpenCds(intent("warfarin"), { ...ADULT, current_medications: ["amiodarone"], nti_monitoring_documented: true }, { endpoint: EP });
  expect(r.verdict === "HARD_FAIL", `warfarin + amiodarone must HARD_FAIL — got ${r.verdict}`);
  expect(r.dose_guidance === null,
    "the gateway OFFERS a dose_candidate and the CLIENT must drop it on HARD_FAIL. This is the advisory containment end to end: the KM has a signed dose, the firewall blocked, and no dose crosses. If this ever carries a value, §1.1 has failed on the live path.");
  expect((r.flags || []).length >= 1, "the interaction must reach the clinician as a flag — a HARD_FAIL with no finding is unactionable");
  expect((r.flags || []).every((f) => f.drug_a), "each interaction flag must name its drugs (C1) — 'something interacts' is not something a clinician can act on");
}

// ---- 6. THE PAEDIATRIC HARD LIMIT, ON THE LIVE PATH -------------------------------------------
{
  const r = await queryOpenCds(intent("amoxicillin", ["age_appropriateness_check"]), { ...ADULT, patient_age_years: 7 }, { endpoint: EP });
  expect(r.verdict === "HARD_FAIL", `a 7-year-old must HARD_FAIL the age check — got ${r.verdict}`);
  expect(r.dose_guidance === null, "and NO dose may reach a child — there are no paediatric dosing tables in this system at all");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`smoke-opencds-gateway FAIL (${errors.length})`);
  process.exit(1);
}
console.log(`smoke-opencds-gateway: OK (live @ ${EP} — ${discovered === null ? "discovery NOT checked" : `${discovered} KMs discovered`} · a clean case PASSes · the 4 once-dead checks fire · a stale km_set BLOCKS · the advisory dose is offered and DROPPED on HARD_FAIL · no dose for a child · receipts stay mock)`);
