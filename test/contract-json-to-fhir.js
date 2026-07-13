/**
 * Contract test for MI-13 — Structured JSON → FHIR mapping (§4.3 Stage 5).
 *
 * Asserts: coded entities → AU Core-conformant resources with their validated coding;
 * uncoded entities → free-text only (NO fabricated code) and quarantined; conformant
 * resources land in the store via the write seam; a NON-conformant resource is BLOCKED
 * (never written); the mock write path is honest ('unavailable').
 * Run from repo root: node test/contract-json-to-fhir.js
 */
import { structuredDocToFhir, submitToFhir, PROFILE } from "../ingestion/structuring/json-to-fhir.js";
import { validateResource } from "../mcp/servers/fhir-broker/conformance.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const now = () => 1_700_000_000_000;

async function main() {
  const doc = {
    subject_ref: "Patient/enc-abc",
    problems: [
      { text: "Type 2 diabetes", coding: { system: "http://snomed.info/sct", code: "44054006", display: "T2DM" } },
      { text: "vague ache (uncoded)" }, // no validated code → quarantine
    ],
    observations: [{ text: "Potassium", coding: { system: "http://loinc.org", code: "2823-3" }, value: "within normal range" }],
    medications: [{ text: "paracetamol 500mg", coding: { system: "http://snomed.info/sct", code: "23628011000036104" } }],
    reports: [{ text: "CXR: no acute findings." }],
  };

  const { resources, quarantined } = structuredDocToFhir(doc, { now });

  // Coded problem carries its coding; uncoded problem is text-only with NO coding.
  const conditions = resources.filter((r) => r.resourceType === "Condition");
  const coded = conditions.find((c) => c.code.coding);
  const uncoded = conditions.find((c) => !c.code.coding);
  expect(coded && coded.code.coding[0].code === "44054006", "coded problem → Condition.code.coding with the validated code");
  expect(uncoded && uncoded.code.text && !uncoded.code.coding, "uncoded problem → free-text code, NO fabricated coding");
  expect(quarantined.length === 1 && quarantined[0].text === "vague ache (uncoded)", "uncoded entity is quarantined");

  // Never invents a code: every coding.code came from the input.
  const inputCodes = new Set(["44054006", "2823-3", "23628011000036104"]);
  const emitted = resources.flatMap((r) => {
    const cc = r.code || r.medicationCodeableConcept;
    return (cc && cc.coding) ? cc.coding.map((x) => x.code) : [];
  });
  expect(emitted.every((c) => inputCodes.has(c)), "no invented codes — every emitted coding came from the input");

  // AU Core conformance for the profiled resources.
  for (const [type, prof] of Object.entries(PROFILE)) {
    const r = resources.find((x) => x.resourceType === type);
    expect(r && validateResource(r, prof).conformance.status === "conformant", `${type} is AU Core conformant`);
  }

  // Submit with an injected (live-like) store → conformant resources land.
  const writes = [];
  const write = async (r) => { writes.push(r.resourceType); return { status: "created", id: `${r.resourceType}-1` }; };
  const sub = await submitToFhir(resources, { write });
  expect(sub.blocked.length === 0 && sub.landed.length === resources.length, "all conformant/base resources land");
  expect(writes.length === resources.length, "write seam called for every landed resource");

  // A NON-conformant resource (Condition missing required subject) is BLOCKED, not written.
  const bad = { resourceType: "Condition", meta: { profile: [PROFILE.Condition] }, category: [{ coding: [{ system: "s", code: "c" }] }], code: { text: "x" } }; // no subject
  const writes2 = [];
  const sub2 = await submitToFhir([bad], { write: async (r) => { writes2.push(r.resourceType); return { status: "created" }; } });
  expect(sub2.blocked.length === 1 && sub2.landed.length === 0, "non-conformant resource BLOCKED from the store");
  expect(writes2.length === 0, "non-conformant resource is NEVER written");

  // The default (mock) write path is honest: unavailable, never fabricated.
  const mock = await submitToFhir([resources[0]]);
  expect(mock.landed[0].write_result.status === "unavailable", "mock write path returns 'unavailable' (SAFE_STUB, honest)");

  // Requires an encounter-scoped subject.
  let threw = false;
  try { structuredDocToFhir({ problems: [] }); } catch { threw = true; }
  expect(threw, "throws without subject_ref");

  if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-13 json-to-fhir FAIL (${errors.length})`); process.exit(1); }
  console.log("MI-13 json-to-fhir PASS");
  process.exit(0);
}

main().catch((e) => { console.error("MI-13 json-to-fhir ERROR:", e); process.exit(1); });
