/**
 * Document ingestion pipeline (MI-10; execution plan §2.3, §4.3).
 *
 * Runs the five stages IN ORDER — OCR → de-id → structure → terminology coding →
 * FHIR mapping — and enforces the ONE non-negotiable ordering rule (E4): de-id
 * (Stage 2) is ON by default and CANNOT be skipped, and it is FAIL-CLOSED. If de-id
 * blocks (no engine, or an analyzer error), the WHOLE document is blocked before any
 * structuring/coding/FHIR runs — raw PHI never reaches a downstream stage or the store.
 *
 * Every external stage is injectable so the pipeline is testable end-to-end without
 * the external engines; the real adapters (OCR/de-id) are input-gated and fail-safe.
 * Coding reuses the MI-06/07 gate (code only on validate-pass, else free-text
 * quarantine); mapping reuses MI-13 (AU Core resources; non-conformant blocked).
 */
import { runOcr } from "./ocr/index.js";
import { deidentify } from "./deid/presidio.js";
import { codeOrQuarantine } from "../mcp/servers/terminology/coding-gate.js";
import { structuredDocToFhir, submitToFhir } from "./structuring/json-to-fhir.js";

/** Stage 4: validate each entity's candidate code; coded on validate-pass, else quarantined. */
async function codeEntities(doc, validateCode) {
  let coded = 0;
  let quarantined = 0;
  const run = async (entities) => {
    const out = [];
    for (const e of entities || []) {
      let validation = null;
      if (validateCode && e.candidate_code) {
        try { validation = await validateCode({ system: e.candidate_code.system, code: e.candidate_code.code, text: e.text }); } catch { validation = null; }
      }
      const g = codeOrQuarantine({ text: e.text, system: e.candidate_code && e.candidate_code.system, code: e.candidate_code && e.candidate_code.code }, validation);
      if (g.coded) { coded++; out.push({ ...e, coding: { system: g.coded.system, code: g.coded.code, display: g.coded.display } }); }
      else { quarantined++; out.push({ ...e }); } // uncoded → mapped to free-text, never a fabricated code
    }
    return out;
  };
  return {
    subject_ref: doc.subject_ref,
    problems: await run(doc.problems),
    observations: await run(doc.observations),
    medications: await run(doc.medications),
    reports: doc.reports || [], // reports are narrative text, not coded
    _coded: coded,
    _quarantined: quarantined,
  };
}

/**
 * Ingest one document. Returns a per-stage result; a blocked stage stops the pipeline.
 * @param {{ artifact?: any, mime?: string, consent_scope?: string, subject_ref?: string }} input
 * @param {{ env?: object, runOcr?: Function, ocrImpl?: Function, deidAnalyze?: Function,
 *           structure?: Function, validateCode?: Function, fhirWrite?: Function, now?: () => number }} [deps]
 */
export async function ingestDocument({ artifact, mime, consent_scope, subject_ref } = {}, deps = {}) {
  const { env = process.env, runOcr: runOcrImpl, ocrImpl, deidAnalyze, structure, validateCode, fhirWrite, now = () => Date.now() } = deps;
  const stages = {};

  // Stage 1 — OCR.
  const ocr = runOcrImpl ? await runOcrImpl(artifact, { env, ocrImpl }) : await runOcr(artifact, { env, ocrImpl });
  if (!ocr.ok) return { ok: false, blocked_stage: "ocr", reason: ocr.reason, engine: ocr.engine, stages, resources_landed: [] };
  stages.ocr = { engine: ocr.engine, chars: String(ocr.extraction.text || "").length };

  // Stage 2 — De-id. ON by default, NON-SKIPPABLE, FAIL-CLOSED (E4). A block here stops
  // the pipeline before any structuring/coding/FHIR — raw PHI never flows downstream.
  const deid = await deidentify(ocr.extraction.text, { analyze: deidAnalyze, env });
  if (!deid.ok) return { ok: false, blocked_stage: "deid", reason: deid.reason, deid_blocked: true, stages, resources_landed: [] };
  stages.deid = { phi_removed: deid.phi_removed };

  // Stage 3 — Structure (injected; default empty — never fabricated).
  const structured = structure ? await structure(deid.text, { mime }) : { observations: [], problems: [], medications: [], reports: [] };
  structured.subject_ref = structured.subject_ref || subject_ref;
  stages.structure = { problems: (structured.problems || []).length, observations: (structured.observations || []).length, medications: (structured.medications || []).length, reports: (structured.reports || []).length };

  // Stage 4 — Terminology coding (MI-06/07).
  const codedDoc = await codeEntities(structured, validateCode);
  stages.coding = { coded: codedDoc._coded, quarantined: codedDoc._quarantined };

  // Stage 5 — FHIR map + submit to the store (MI-13). Non-conformant resources blocked.
  const { resources, quarantined } = structuredDocToFhir(codedDoc, { now });
  const submit = await submitToFhir(resources, { write: fhirWrite });
  stages.fhir = { landed: submit.landed.length, blocked: submit.blocked.length };

  return { ok: true, stages, resources_landed: submit.landed, blocked_resources: submit.blocked, quarantined, deid_text: deid.text };
}
