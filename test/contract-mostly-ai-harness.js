/**
 * Contract test for MI-18 / MI-19 — MOSTLY AI eval harness + plausibility gate.
 *
 * Asserts the two §9.2 hard rules and the input-gated fail-safe boundary:
 *   - unconfigured → available:false with a reason, NEVER fabricates a case;
 *   - every emitted case is labelled synthetic:true (rule 1);
 *   - every emitted case is clinician_reviewed:false → INERT until a clinician
 *     attests (rule 2 / MI-19), matching eval-case-gate.mjs's attestation predicate;
 *   - the generator never self-attests.
 * Run from repo root: node test/contract-mostly-ai-harness.js
 */
import { mostlyAiAvailable, labelMostlyAiSynthetic, isEvalGateAttested } from "../eval/synthetic/mostly-ai/run-mostly-ai.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

// Input-gated fail-safe.
const unset = mostlyAiAvailable({});
check("unset env → unavailable with a reason (no fabrication)", unset.available === false && /unset|not configured/.test(unset.reason));
check("placeholder env → unavailable", mostlyAiAvailable({ HEYDOC_MOSTLY_AI_OUTPUT: "<set-me>" }).available === false);
const configured = mostlyAiAvailable({ HEYDOC_MOSTLY_AI_OUTPUT: "/data/mostly-ai/out" });
check("configured env → available with source", configured.available === true && configured.source === "/data/mostly-ai/out");

// Rule 1 — synthetic labelling.
const labelled = labelMostlyAiSynthetic({ patient: { age: 54 }, note: "chatty note" });
check("rule 1: synthetic:true", labelled.synthetic === true);
check("rule 1: generator tagged mostly-ai + DP", labelled.provenance.generator === "mostly-ai" && labelled.provenance.differential_privacy === true);
check("labelling preserves the record", labelled.note === "chatty note" && labelled.patient.age === 54);

// Rule 2 / MI-19 — inert until clinician-attested.
check("rule 2: emitted clinician_reviewed:false", labelled.provenance.clinician_reviewed === false);
check("MI-19: an unsigned synthetic case is NOT eval-gate attested (inert)", isEvalGateAttested(labelled.provenance) === false);
check("MI-19: only a clinician attestation makes it eligible", isEvalGateAttested({ clinician_reviewed: true }) === true);
check("MI-19: missing/false review → not attested", isEvalGateAttested(undefined) === false && isEvalGateAttested({}) === false);

// The generator must never self-attest — re-labelling a would-be-attested record forces it back to false.
const tampered = labelMostlyAiSynthetic({ provenance: { clinician_reviewed: true } });
check("generator cannot self-attest (forces clinician_reviewed:false)", tampered.provenance.clinician_reviewed === false);

if (errors.length) { console.error("Contract failures:", errors); process.exit(1); }
console.log("MI-18/MI-19 mostly-ai-harness: OK");
process.exit(0);
