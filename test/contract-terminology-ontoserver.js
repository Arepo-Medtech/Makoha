/**
 * Contract test for MI-05 — Ontoserver client (execution plan §2.1/§4.2).
 *
 * PARTIAL: the AU-content resolution is deploy-gated, so this is a UNIT test with an
 * INJECTED fetch (no network, CI-safe) — the same posture as contract-terminology-live.
 * Asserts: SNOMED CT-AU and AMT codes resolve via $validate-code (the MI-05 gate);
 * a bound ValueSet routes to ValueSet/$validate-code; $lookup parses display +
 * designations + properties; every error path fails safe (never fabricates); a
 * non-AU system misses without a network call. An OPT-IN live smoke is skipped in CI.
 * Run from repo root: node test/contract-terminology-ontoserver.js
 */
import { validateCode, lookupConcept, resolveSystem, loadValueSets } from "../mcp/servers/terminology/ontoserver-client.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

// FHIR Parameters helpers.
const vcParams = (result, display, version) => ({ ok: true, json: async () => ({ resourceType: "Parameters", parameter: [
  { name: "result", valueBoolean: result },
  ...(display ? [{ name: "display", valueString: display }] : []),
  ...(version ? [{ name: "version", valueString: version }] : []),
] }) });
const lookupParams = () => ({ ok: true, json: async () => ({ resourceType: "Parameters", parameter: [
  { name: "name", valueString: "SNOMED CT-AU" },
  { name: "display", valueString: "Paracetamol 500 mg tablet" },
  { name: "version", valueString: "http://snomed.info/sct/32506021000036107/version/20240301" },
  { name: "designation", part: [{ name: "language", valueCode: "en" }, { name: "value", valueString: "Paracetamol 500 mg tablet, 1 tablet" }] },
  { name: "property", part: [{ name: "code", valueCode: "parent" }, { name: "value", valueCode: "763158003" }] },
] }) });

async function main() {
  // Config loads with the two AU systems + a provisional banner.
  const vs = loadValueSets();
  check("value-sets: has SNOMED_CT + AMT", !!vs.systems?.SNOMED_CT && !!vs.systems?.AMT);
  check("value-sets: carries a provisional/DEV status banner", /PROVISIONAL|DEV/.test(vs.status || ""));
  check("value-sets: AMT valueset_url is null until deploy-bound", vs.systems.AMT.valueset_url === null);
  check("resolveSystem: SNOMED_CT → snomed URI", resolveSystem("SNOMED_CT")?.system_uri === "http://snomed.info/sct");
  check("resolveSystem: non-AU system (PBS) → null", resolveSystem("PBS") === null);

  // MI-05 gate: a known SNOMED CT-AU code resolves.
  {
    let seenUrl;
    const fetchImpl = async (url) => { seenUrl = url; return vcParams(true, "Type 2 diabetes mellitus", "http://snomed.info/sct/32506021000036107/version/20240301"); };
    const v = await validateCode({ baseUrl: "https://tx.self-host/fhir", system: "SNOMED_CT", code: "44054006", fetchImpl });
    check("SNOMED CT-AU: validated + display", v.validated === true && v.display === "Type 2 diabetes mellitus");
    check("SNOMED CT-AU: no ValueSet bound → CodeSystem/$validate-code", /\/CodeSystem\/\$validate-code\?/.test(seenUrl) && seenUrl.includes(encodeURIComponent("http://snomed.info/sct")));
    check("SNOMED CT-AU: carries version", /32506021000036107/.test(v.version || ""));
  }

  // MI-05 gate: a known AMT code resolves (by SNOMED CT-AU membership, valueset unbound).
  {
    const v = await validateCode({ baseUrl: "https://tx.self-host/fhir", system: "AMT", code: "23628011000036104", fetchImpl: async () => vcParams(true, "paracetamol 500 mg tablet", "AMT-20240301") });
    check("AMT: validated + display", v.validated === true && v.display === "paracetamol 500 mg tablet");
    check("AMT: valueset_url null (provisional)", v.valueset_url === null);
  }

  // An explicitly bound ValueSet routes to ValueSet/$validate-code.
  {
    let seenUrl;
    const v = await validateCode({ baseUrl: "https://tx/fhir", system: "AMT", code: "1234", valueSetUrl: "https://healthterminologies.gov.au/fhir/ValueSet/amt-x", fetchImpl: async (url) => { seenUrl = url; return vcParams(true, "d"); } });
    check("bound ValueSet → ValueSet/$validate-code", /\/ValueSet\/\$validate-code\?/.test(seenUrl) && seenUrl.includes(encodeURIComponent("https://healthterminologies.gov.au/fhir/ValueSet/amt-x")));
    check("bound ValueSet → validated", v.validated === true);
  }

  // $lookup parses display + designation + property.
  {
    const r = await lookupConcept({ baseUrl: "https://tx/fhir", system: "AMT", code: "23628011000036104", fetchImpl: async () => lookupParams() });
    check("lookup: found + display", r.found === true && r.display === "Paracetamol 500 mg tablet");
    check("lookup: designation parsed", r.designations?.length === 1 && r.designations[0].value.includes("1 tablet"));
    check("lookup: property parsed", r.properties?.length === 1 && r.properties[0].code === "parent" && r.properties[0].value === "763158003");
  }

  // Fail-safe paths — never fabricate.
  {
    const miss = await validateCode({ baseUrl: "https://tx/fhir", system: "SNOMED_CT", code: "000", fetchImpl: async () => vcParams(false) });
    check("validate: result:false → not validated, no display", miss.validated === false && miss.display === undefined);
    const http404 = await validateCode({ baseUrl: "https://tx/fhir", system: "SNOMED_CT", code: "x", fetchImpl: async () => ({ ok: false, status: 404 }) });
    check("validate: HTTP 404 → fail-safe miss", http404.validated === false && /HTTP 404/.test(http404.reason));
    const thrown = await validateCode({ baseUrl: "https://tx/fhir", system: "SNOMED_CT", code: "x", fetchImpl: async () => { throw new Error("network down"); } });
    check("validate: transport throw → fail-safe miss", thrown.validated === false && /network down/.test(thrown.reason));
    let called = false;
    const nonAu = await validateCode({ baseUrl: "https://tx/fhir", system: "PBS", code: "2622B", fetchImpl: async () => { called = true; return vcParams(true); } });
    check("validate: non-AU system → miss without a network call", nonAu.validated === false && called === false && /not an AU system/.test(nonAu.reason));
    const lookupMiss = await lookupConcept({ baseUrl: "https://tx/fhir", system: "AMT", code: "x", fetchImpl: async () => ({ ok: false, status: 500 }) });
    check("lookup: HTTP 500 → found:false", lookupMiss.found === false);
  }

  // OPT-IN live smoke (real self-hosted/NCTS Ontoserver; needs an endpoint + credentials → skipped in CI).
  if (process.env.HEYDOC_TX_ONTOSERVER_SMOKE && process.env.HEYDOC_TX_ONTOSERVER_SMOKE !== "0") {
    const v = await validateCode({ baseUrl: process.env.HEYDOC_TX_ONTOSERVER_SMOKE, system: "AMT", code: "23628011000036104", timeoutMs: 15000 });
    check("live smoke: Ontoserver validates a known AMT code", v.validated === true);
    console.log("  [smoke] AMT 23628011000036104 →", v.validated, v.display || v.reason);
  } else {
    console.log("  [skip] Ontoserver live smoke (set HEYDOC_TX_ONTOSERVER_SMOKE=<fhir-base-url> to run a real call)");
  }

  if (errors.length) { console.error("Contract failures:", errors); process.exit(1); }
  console.log("MI-05 terminology-ontoserver: OK");
  process.exit(0);
}

main().catch((e) => { console.error("MI-05 terminology-ontoserver ERROR:", e); process.exit(1); });
