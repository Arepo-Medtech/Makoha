/**
 * packet-to-fhir (A2.2) — adapts a sealed ContextPacket into rule-engine inputs: scalar
 * PARAMETERS (for parameter-based rules like the paediatric pilot) and a minimal FHIR R4
 * bundle (for future rules that read resources via cql-exec-fhir).
 *
 * PURE — no cql/cql-exec-fhir dependency, no I/O. It reads ONLY the already-firewalled
 * packet.facts (the packet was assembled + validated + firewalled upstream in
 * verification/pipeline.js). It NEVER touches case scoring nodes (10–13) — it cannot; it
 * only sees the packet, which is default-deny filtered before this point.
 */

/** Find the first packet fact matching a category + a label/id pattern. */
function findFact(packet, category, pattern) {
  const facts = (packet && packet.facts) || [];
  return facts.find((f) => f && f.category === category && (pattern.test(f.label || "") || pattern.test(f.fact_id || ""))) || null;
}

/**
 * Extract the patient's age in whole years from the packet's demographic facts.
 * The value is stored as the patient stated it (a string, per the data-minimisation /
 * string-preserving policy), so we parse the leading integer. Returns null when no age
 * fact is present or it is unparseable — the rule then treats null conservatively
 * (fail-safe → in-person review), never guessing an age.
 * @returns {number|null}
 */
export function extractAgeYears(packet) {
  const f = findFact(packet, "demographic", /\bage\b/i);
  if (!f) return null;
  const m = String(f.value ?? "").match(/\d{1,3}/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Build a minimal FHIR R4 collection Bundle from the packet — the input for a future
 * rule that reads FHIR resources through cql-exec-fhir's PatientSource. Deliberately
 * minimal today (a Patient shell, id "rule-eval"); the paediatric pilot does NOT use it
 * (it is parameter-based, so its result is wall-clock independent and its ELM reproducible).
 * A DOB-based rule would add birthDate here — but note that computing age from birthDate +
 * "today" reintroduces wall-clock dependence, so prefer passing age as a parameter.
 */
export function packetToFhirBundle(packet) {
  const patient = { resourceType: "Patient", id: "rule-eval" };
  const sex = findFact(packet, "demographic", /\b(sex|gender)\b/i);
  if (sex && typeof sex.value === "string") {
    const v = sex.value.trim().toLowerCase();
    if (v === "male" || v === "female" || v === "other" || v === "unknown") patient.gender = v;
  }
  return { resourceType: "Bundle", type: "collection", entry: [{ resource: patient }] };
}
