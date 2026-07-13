/**
 * Contract test for MI-10 / MI-11 — ingestion pipeline + OCR licensing fork.
 *
 * End-to-end (injected stages): OCR → de-id → structure → coding → FHIR store. Asserts
 * the E4 ordering safety (de-id non-skippable + fail-closed; a block stops the
 * pipeline before structuring/coding — no raw PHI downstream), the OSS default engine
 * selection with a licence-gated fork, no-fabricated-codes quarantine, and honest
 * fail-safe on an unavailable engine.
 * Run from repo root: node test/contract-ingestion-pipeline.js
 */
import { ingestDocument } from "../ingestion/pipeline.js";
import { selectOcrEngine, runOcr } from "../ingestion/ocr/index.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const now = () => 1_700_000_000_000;

// Injected stages.
const ocrText = "Patient Jane Doe. Dx Type 2 diabetes. Potassium normal.";
const okOcr = async () => ({ ok: true, extraction: { text: ocrText }, engine: "paddle" });
const deidJane = async (t) => [{ start: t.indexOf("Jane Doe"), end: t.indexOf("Jane Doe") + 8, type: "PERSON" }];
const structure = async () => ({
  subject_ref: "Patient/enc-1",
  problems: [{ text: "Type 2 diabetes", candidate_code: { system: "http://snomed.info/sct", code: "44054006" } }, { text: "uncoded ache" }],
  observations: [{ text: "Potassium", candidate_code: { system: "http://loinc.org", code: "2823-3" }, value: "within normal range" }],
  medications: [],
  reports: [{ text: "CXR: normal." }],
});
const validateOk = async ({ code }) => ({ validated: true, display: `display for ${code}`, version: "v" });
const store = () => { const w = []; return { write: async (r) => { w.push(r.resourceType); return { status: "created", id: r.resourceType }; }, w }; };

async function main() {
  // A) Happy path end-to-end.
  {
    const s = store();
    const r = await ingestDocument({ artifact: "img", subject_ref: "Patient/enc-1" }, { runOcr: okOcr, deidAnalyze: deidJane, structure, validateCode: validateOk, fhirWrite: s.write, now });
    expect(r.ok === true, "A: pipeline ok");
    expect(r.stages.deid.phi_removed === true && !r.deid_text.includes("Jane Doe"), "A: PHI removed before downstream");
    expect(r.stages.coding.coded === 2 && r.stages.coding.quarantined === 1, "A: 2 coded, 1 quarantined (uncoded ache)");
    expect(r.resources_landed.some((x) => x.resourceType === "Condition") && r.resources_landed.some((x) => x.resourceType === "Observation"), "A: resources landed in store");
    expect(s.w.length === r.resources_landed.length, "A: store write called per landed resource");
  }

  // B) E4 — de-id fail-closed BLOCKS before structure/coding run (no raw PHI downstream).
  {
    let structureCalled = false, validateCalled = false;
    const r = await ingestDocument({ artifact: "img" }, {
      runOcr: okOcr, env: {}, // no presidio + no injected analyzer → de-id blocks
      structure: async () => { structureCalled = true; return {}; },
      validateCode: async () => { validateCalled = true; return { validated: true }; },
    });
    expect(r.ok === false && r.blocked_stage === "deid" && r.deid_blocked === true, "B: de-id blocks the pipeline (E4)");
    expect(r.resources_landed.length === 0, "B: nothing lands when de-id blocks");
    expect(structureCalled === false && validateCalled === false, "B: NO structuring/coding after a de-id block — raw PHI never flows downstream");
  }

  // C) OCR unavailable → blocked at OCR (default engine, no endpoint, no impl).
  {
    const r = await ingestDocument({ artifact: "img" }, { env: {} });
    expect(r.ok === false && r.blocked_stage === "ocr", "C: unavailable OCR blocks at stage 1 (fail-safe)");
  }

  // D) Engine fork (MI-11) — OSS default; flag switches engine; JSL gated on licence.
  {
    expect(selectOcrEngine({}).engine === "paddle", "D: default engine is paddle (OSS)");
    expect(selectOcrEngine({ HEYDOC_OCR_ENGINE: "jsl" }).engine === "jsl", "D: flag switches engine to jsl");
    const jslNoLicence = await runOcr("img", { env: { HEYDOC_OCR_ENGINE: "jsl" } });
    expect(jslNoLicence.ok === false && /licence/i.test(jslNoLicence.reason), "D: jsl selected but unlicensed → blocked (no silent fallback)");
    // paddle with an injected impl works without touching a real service.
    const paddle = await runOcr("img", { env: {}, ocrImpl: async () => ({ text: "x" }) });
    expect(paddle.ok === true && paddle.engine === "paddle", "D: paddle runs via injected impl");
  }

  // E) Uncoded entity never gets a fabricated code (quarantined as free-text through to FHIR).
  {
    const s = store();
    const onlyUncoded = async () => ({ subject_ref: "Patient/e", problems: [{ text: "vague symptom" }], observations: [], medications: [], reports: [] });
    const r = await ingestDocument({ artifact: "img" }, { runOcr: okOcr, deidAnalyze: deidJane, structure: onlyUncoded, validateCode: validateOk, fhirWrite: s.write, now });
    const cond = r.resources_landed.find((x) => x.resourceType === "Condition");
    expect(r.stages.coding.quarantined === 1 && cond, "E: uncoded entity quarantined but still stored as free-text (no fabricated code)");
  }

  if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-10/MI-11 ingestion FAIL (${errors.length})`); process.exit(1); }
  console.log("MI-10/MI-11 ingestion-pipeline PASS");
  process.exit(0);
}

main().catch((e) => { console.error("MI-10/MI-11 ingestion ERROR:", e); process.exit(1); });
