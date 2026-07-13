/**
 * Contract test for MI-06 / MI-07 — validate-code + quarantine (PRESERVE).
 *
 * Confirms the preserved invariant end-to-end, with the MI-05 Ontoserver client as
 * the validation source: a code writes ONLY on a $validate-code pass, and an
 * unresolved term is quarantined as free-text (flag set) and never coded. The final
 * gate is the existing verifier — a validated code BINDS (pass), a quarantined one
 * is UNBOUND (fail), proving the quarantine actually keeps an unresolved code out of
 * a passing coded output.
 * Run from repo root: node test/contract-terminology-quarantine.js
 */
import { codeOrQuarantine, validatedCodesFrom } from "../mcp/servers/terminology/coding-gate.js";
import { validateCode } from "../mcp/servers/terminology/ontoserver-client.js";
import { verify } from "../verification/verifier.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };
const vcParams = (result, display, version) => ({ ok: true, json: async () => ({ resourceType: "Parameters", parameter: [
  { name: "result", valueBoolean: result }, ...(display ? [{ name: "display", valueString: display }] : []), ...(version ? [{ name: "version", valueString: version }] : []),
] }) });
// A verifier check passes iff its result entry is passed.
const checkPassed = (output, evidence, name) => (verify(output, evidence).results.find((r) => r.check === name) || {}).passed === true;

async function main() {
  // --- MI-06: a validate-pass produces a coded fact. ---
  const okValidation = await validateCode({ baseUrl: "https://tx/fhir", system: "SNOMED_CT", code: "22298006", fetchImpl: async () => vcParams(true, "Myocardial infarction", "20240301") });
  const gatedOk = codeOrQuarantine({ text: "MI", system: "SNOMED_CT", code: "22298006" }, okValidation);
  check("MI-06: validate-pass → coded", gatedOk.coded && gatedOk.coded.code === "22298006" && gatedOk.quarantined === null);
  check("MI-06: coded display comes from the validation", gatedOk.coded.display === "Myocardial infarction");

  // --- MI-07: an unresolved term is quarantined as free-text, never coded. ---
  const missValidation = await validateCode({ baseUrl: "https://tx/fhir", system: "SNOMED_CT", code: "22298006", fetchImpl: async () => vcParams(false) });
  const gatedMiss = codeOrQuarantine({ text: "chest pain, atypical", system: "SNOMED_CT", code: "22298006" }, missValidation);
  check("MI-07: unresolved → quarantined, not coded", gatedMiss.coded === null && gatedMiss.quarantined);
  check("MI-07: quarantine sets the free_text flag", gatedMiss.quarantined.free_text === true);
  check("MI-07: quarantine preserves the text", gatedMiss.quarantined.text === "chest pain, atypical");

  // --- The gate feeds the verifier: validated binds, quarantined stays unbound. ---
  const codesOk = validatedCodesFrom([gatedOk]);         // ["22298006"]
  const codesMiss = validatedCodesFrom([gatedMiss]);     // []
  check("gate: validatedCodesFrom keeps only coded", codesOk.length === 1 && codesMiss.length === 0);

  const evOk = { terminology: [{ request_id: "t1", codes: codesOk, mode: "mock" }] };
  const evMiss = { terminology: [{ request_id: "t1", codes: codesMiss, mode: "mock" }] };
  check("MI-06: validated code BINDS in the verifier (pass)", checkPassed("SNOMED CT code: 22298006 assigned.", evOk, "no_invented_codes"));
  check("MI-07: quarantined code is UNBOUND in the verifier (fail)", checkPassed("SNOMED CT code: 22298006 assigned.", evMiss, "no_invented_codes") === false);

  if (errors.length) { console.error("Contract failures:", errors); process.exit(1); }
  console.log("MI-06/MI-07 terminology-quarantine: OK");
  process.exit(0);
}

main().catch((e) => { console.error("MI-06/MI-07 terminology-quarantine ERROR:", e); process.exit(1); });
