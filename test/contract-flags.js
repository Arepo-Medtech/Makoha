/**
 * Contract test for MI-17 — feature-flag registry (execution plan §6/§8 E8).
 *
 * Asserts the fail-safe rule: unset, invalid, or mis-typed env values resolve
 * to each flag's SAFE value, never the permissive one. Covers all four flags,
 * readFlag's throw on an unknown name, and allFlags' snapshot shape.
 * Run from repo root: node test/contract-flags.js
 */
import {
  FLAGS,
  readFlag,
  isImagingPixelInterpretationEnabled,
  isStructuredOcrEnabled,
  ocrEngine,
  pharmCdsState,
  allFlags,
} from "../config/flags.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

// Unset env: everything must resolve to its safe default.
expect(isImagingPixelInterpretationEnabled({}) === false, "unset: imaging must be disabled");
expect(ocrEngine({}) === "paddle", "unset: ocrEngine must be paddle");
expect(pharmCdsState({}) === "EMPTY", "unset: pharmCds must be EMPTY");
expect(isStructuredOcrEnabled({}) === false, "unset: structuredOcr must be disabled");

// Imaging flag: only an exact "ON" (case-insensitive, trimmed) enables it.
expect(isImagingPixelInterpretationEnabled({ HEYDOC_IMAGING_PIXEL_INTERPRETATION: "ON" }) === true, '"ON" must enable imaging');
expect(isImagingPixelInterpretationEnabled({ HEYDOC_IMAGING_PIXEL_INTERPRETATION: "on" }) === true, '"on" must enable imaging (case-insensitive)');
expect(isImagingPixelInterpretationEnabled({ HEYDOC_IMAGING_PIXEL_INTERPRETATION: " ON " }) === true, '" ON " must enable imaging (trimmed)');
for (const bad of ["true", "1", "yes", "garbage", ""]) {
  expect(isImagingPixelInterpretationEnabled({ HEYDOC_IMAGING_PIXEL_INTERPRETATION: bad }) === false, `imaging must fail safe to OFF for ${JSON.stringify(bad)}`);
}

// ocrEngine: enum with fail-safe fallback to paddle.
expect(ocrEngine({ HEYDOC_OCR_ENGINE: "jsl" }) === "jsl", '"jsl" must select jsl');
expect(ocrEngine({ HEYDOC_OCR_ENGINE: "surya" }) === "surya", '"surya" must select surya');
expect(ocrEngine({ HEYDOC_OCR_ENGINE: "paddle" }) === "paddle", '"paddle" must select paddle');
expect(ocrEngine({ HEYDOC_OCR_ENGINE: "bogus" }) === "paddle", 'unknown engine must fail safe to paddle');
expect(ocrEngine({}) === "paddle", "unset engine must fail safe to paddle");

// pharmCdsState: enum with fail-safe fallback to EMPTY.
expect(pharmCdsState({ HEYDOC_PHARM_CDS: "FILLED" }) === "FILLED", '"FILLED" must resolve to FILLED');
expect(pharmCdsState({ HEYDOC_PHARM_CDS: "bogus" }) === "EMPTY", 'unknown pharmCds value must fail safe to EMPTY');
expect(pharmCdsState({}) === "EMPTY", "unset pharmCds must fail safe to EMPTY");

// structuredOcr: only exact "ON" enables it.
expect(isStructuredOcrEnabled({ HEYDOC_STRUCTURED_OCR: "ON" }) === true, '"ON" must enable structuredOcr');
for (const bad of ["off", "garbage", undefined]) {
  const env = bad === undefined ? {} : { HEYDOC_STRUCTURED_OCR: bad };
  expect(isStructuredOcrEnabled(env) === false, `structuredOcr must fail safe to OFF for ${JSON.stringify(bad)}`);
}

// readFlag throws on an unknown flag name (caller misuse must fail loud).
let threw = false;
try { readFlag("NOT_A_REAL_FLAG", {}); } catch { threw = true; }
expect(threw, "readFlag must throw on an unknown flag name");

// allFlags: snapshot resolves all four flags to their safe values on empty env.
const snapshot = allFlags({});
expect(Object.keys(FLAGS).every((name) => name in snapshot), "allFlags must include every registered flag");
expect(snapshot.IMAGING_PIXEL_INTERPRETATION === "OFF", "allFlags: imaging safe value must be OFF");
expect(snapshot.OCR_ENGINE === "paddle", "allFlags: ocrEngine safe value must be paddle");
expect(snapshot.PHARM_CDS === "EMPTY", "allFlags: pharmCds safe value must be EMPTY");
expect(snapshot.STRUCTURED_OCR === "OFF", "allFlags: structuredOcr safe value must be OFF");

if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-17 flags FAIL (${errors.length})`); process.exit(1); }
console.log("MI-17 flags PASS");
process.exit(0);
