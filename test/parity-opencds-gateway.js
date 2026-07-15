/**
 * A/B PARITY — the in-process engine vs the OpenCDS gateway, over real drugs (FL-34 Phase D / D1).
 *
 * ══ WHAT THIS IS FOR — and it is NOT a bug hunt ══
 * When it was first run, parity was already CLEAN: 38/38 on status, per-check verdicts and flag sets,
 * and 18/18 byte-identical doses. The bugs were found in Phases B and C, by BUILDING — the gateway
 * could not return PASS for any drug (F-C8), OpenCDS rejected every hook (F-C7), a KM collapsed N
 * interaction findings into one (C1). None of them would have been found by comparing outputs; they
 * were found by making the thing run.
 *
 * So this is a REGRESSION NET: the thing that notices when the two implementations drift APART later.
 * Saying that plainly is better than dressing 38/38 up as a discovery.
 *
 * ══ WHAT A FAILURE MEANS ══
 * Both executors run the SAME clinician-signed records. A divergence is never "the knowledge is
 * wrong" — it is one of the two implementations reading it wrong, and this harness CANNOT SAY WHICH.
 * It prints both readings and the inputs. A human adjudicates.
 *
 * It EXITS NON-ZERO on any divergence (operator ruling D-D-2). A parity harness that reports and
 * passes is a log file, and nobody reads log files.
 *
 * ══ ENV-GATED, AND IT SKIPS *GREEN* ══
 * CI has no container. With `HEYDOC_PHARM_CDS_ENDPOINT` unset this skips and exits 0 — the C4 /
 * smoke-llm precedent, and the same honest hole: **a green CI run does not mean parity holds. It
 * means nobody asked.**
 *
 *   docker run -d -p 18080:8080 -p 18081:8081 breath-ezy-cds-gateway
 *   HEYDOC_PHARM_CDS_ENDPOINT=http://localhost:18081 node test/parity-opencds-gateway.js
 *   HEYDOC_PHARM_CDS_ENDPOINT=http://localhost:18081 node test/parity-opencds-gateway.js --all
 */
import { readFileSync } from "node:fs";
import { runPharmCheck } from "../mcp/servers/pharmacology/engine.js";
import { queryOpenCds } from "../mcp/servers/pharmacology/cds-adapter/opencds-client.js";
import { compareExecutors, formatDivergence, ALL_CHECKS } from "../verification/executor-parity.js";

const EP = (process.env.HEYDOC_PHARM_CDS_ENDPOINT || "").trim();
if (!EP) {
  console.log("parity-opencds-gateway: SKIPPED — HEYDOC_PHARM_CDS_ENDPOINT unset (no container). This proves NOTHING about parity; it means nobody asked.");
  process.exit(0);
}
const ALL = process.argv.includes("--all");

const DATA = "mcp/servers/pharmacology/data/dose-guidance.json";
const ingredients = JSON.parse(readFileSync(DATA, "utf8")).records.map((r) => r.ingredient);

/**
 * The drugs whose behaviour we already care about — pinned by NAME, not left to a sample.
 * A spread might miss every one of them, and these are the cases where a divergence would matter most.
 */
const ADVERSARIAL = ["warfarin", "amoxicillin", "metformin", "morphine", "methotrexate", "digoxin", "lithium", "levothyroxine"];

/** Deterministic (no Math.random): the same run twice gives the same coverage, so a failure is re-runnable. */
const sample = ALL ? ingredients : [...new Set([...ADVERSARIAL.filter((d) => ingredients.includes(d)), ...ingredients.filter((_, i) => i % 12 === 0)])];

/** Two profiles: one that FORCES checks to fire, one that lets a dose through to be compared. */
const PROFILES = {
  adversarial: { allergens: ["penicillin"], current_medications: ["amiodarone", "aspirin"], egfr_ml_min: 25, patient_age_years: 60, nti_monitoring_documented: false, s8_pdmp_checked: false, pregnancy_status: "not_pregnant", hepatic_impairment: true },
  clean: { allergens: [], current_medications: [], egfr_ml_min: 95, patient_age_years: 60, nti_monitoring_documented: true, s8_pdmp_checked: true, pregnancy_status: "not_pregnant", hepatic_impairment: false },
};

const intentFor = (drug) => ({
  intent_id: "i-000001", session_ref: "enc-000001", intent_type: "new_prescription",
  drug_intent: { drug_name: drug, drug_class: "x" }, patient_facts_ref: {},
  clinical_context: { patient_age_years: 60 }, mode: "mock",
  checks_requested: ALL_CHECKS,   // D-D-1: all 8, or the first "divergence" is the ask (F-D2)
});

const divergences = [];
let compared = 0, agreed = 0, doseCompared = 0;
const failures = [];

for (const [profile, facts] of Object.entries(PROFILES)) {
  for (const drug of sample) {
    const intent = intentFor(drug);
    let pc, gw;
    try {
      // Both executors get the SAME intent and the SAME facts. B0/B0b/E7 mean the identity is settled
      // ONCE, upstream, before either runs — without that, this would be measuring a spelling (F6).
      pc = runPharmCheck(intent, facts);
      gw = await queryOpenCds(intent, facts, { endpoint: EP });
    } catch (e) {
      failures.push(`${drug} [${profile}]: harness error — ${e.message}`);
      continue;
    }
    compared++;
    if (pc.dose_guidance || gw.dose_guidance) doseCompared++;
    const r = compareExecutors(pc, gw, { checksRequested: ALL_CHECKS });
    if (r.agree) agreed++;
    else for (const d of r.divergences) divergences.push(formatDivergence(`${drug} [${profile}]`, d));
  }
}

// COVERAGE IS PRINTED, ALWAYS. A silent sample reads as exhaustive, and this one is not: `--all` is
// 451 ingredients × 2 profiles × 8 checks, which is why it is not the default — but the default's
// limits must be visible rather than implied.
console.log(`\nparity-opencds-gateway @ ${EP}`);
console.log(`  coverage    : ${sample.length} of ${ingredients.length} ingredients${ALL ? " (--all)" : " (sample — re-run with --all for the full set)"} × ${Object.keys(PROFILES).length} fact profiles = ${compared} comparisons`);
console.log(`  checks asked: all ${ALL_CHECKS.length} (never the 5 DEFAULT_CHECKS — a 5-check answer would make the ASK look like a divergence)`);
console.log(`  agreement   : ${agreed}/${compared}`);
console.log(`  dose        : compared on ${doseCompared} case(s) where either executor emitted one`);

if (failures.length) {
  console.error(`\n  HARNESS FAILURES (${failures.length}) — these are not parity results, the run did not complete:`);
  failures.slice(0, 10).forEach((f) => console.error(`   - ${f}`));
}
if (divergences.length) {
  console.error(`\n  DIVERGENCES (${divergences.length}) — the two executors read the SAME signed records and disagreed.`);
  console.error(`  This harness CANNOT say which side is wrong. Both readings are below; a human adjudicates.\n`);
  divergences.slice(0, 20).forEach((d) => console.error(d + "\n"));
  if (divergences.length > 20) console.error(`  …and ${divergences.length - 20} more.`);
}
if (divergences.length || failures.length) {
  console.error(`parity-opencds-gateway FAIL (${divergences.length} divergence(s), ${failures.length} harness failure(s))`);
  process.exit(1);
}
console.log(`parity-opencds-gateway: OK — ${agreed}/${compared} agree on status, per-check verdicts, findings and dose text. Agreement is CORROBORATION: two independent implementations of the same specification, reading the same clinician-signed records, landing in the same place.\n`);
