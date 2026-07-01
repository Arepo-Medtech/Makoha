/**
 * Deterministic AU Core structural conformance validator (mock).
 *
 * Validates a FHIR resource against a VENDORED, pinned AU Core StructureDefinition
 * snapshot (mcp/servers/fhir-broker/au-core/ + manifest.json). Deterministic and
 * offline — no live fetch per validate.
 *
 * Scope (what it checks): profile/resourceType match, required elements (min≥1),
 * top-level cardinality (max), fixed/pattern code systems, and reports must-support.
 * NOT done here (reported 'not_evaluated'): ValueSet MEMBERSHIP for bound coded
 * elements — that needs live terminology expansion against NCTS/Ontoserver (gated),
 * as do full FHIRPath invariants and deep slicing. Vendored IG is a CI build
 * (see manifest) — refresh deliberately; it diverges from the AU Core 0.3.0 pin.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AU_DIR = join(__dirname, "au-core");
export const AU_CORE_MANIFEST = JSON.parse(readFileSync(join(AU_DIR, "manifest.json"), "utf8"));

/** Vendored SDs indexed by canonical url. */
const SDS = {};
for (const f of readdirSync(AU_DIR).filter((f) => f.startsWith("StructureDefinition-"))) {
  const sd = JSON.parse(readFileSync(join(AU_DIR, f), "utf8"));
  SDS[sd.url] = sd;
}

function pickSD(resource, profileUrl) {
  if (profileUrl && SDS[profileUrl]) return SDS[profileUrl];
  const fromMeta = ((resource.meta && resource.meta.profile) || []).find((p) => SDS[p]);
  if (fromMeta) return SDS[fromMeta];
  return Object.values(SDS).find((sd) => sd.type === resource.resourceType) || null;
}

/** Is a top-level field present (handles choice [x] and empty arrays)? */
function isPresent(resource, field, isChoice) {
  if (isChoice) {
    return Object.keys(resource).some((k) => k.startsWith(field) && k.length > field.length && resource[k] != null);
  }
  const v = resource[field];
  return v != null && !(Array.isArray(v) && v.length === 0);
}

/**
 * Validate a FHIR resource against its AU Core profile snapshot.
 * @param {object} resource - a FHIR resource
 * @param {string} [profileUrl] - canonical profile to validate against (else inferred)
 * @returns {{ conformance: { profile: string|null, ig_version: string, status: string, checks: Array } }}
 */
export function validateResource(resource, profileUrl) {
  const sd = pickSD(resource, profileUrl);
  const checks = [];
  const add = (path, requirement, pass, detail) => checks.push({ path, requirement, ...(pass === "not_evaluated" ? { result: "not_evaluated" } : { pass }), ...(detail ? { detail } : {}) });

  if (!sd) {
    return { conformance: { profile: null, ig_version: AU_CORE_MANIFEST.ig_version, status: "error", checks: [{ requirement: "profile_known", pass: false, detail: `no vendored AU Core SD for ${resource && resource.resourceType}` }] } };
  }

  const typeOk = resource.resourceType === sd.type;
  add(sd.type, "resourceType_matches_profile", typeOk, typeOk ? undefined : `expected ${sd.type}`);
  const declared = ((resource.meta && resource.meta.profile) || []).includes(sd.url);
  add(sd.type, "meta_profile_declared", declared, declared ? undefined : `meta.profile should include ${sd.url}`);

  for (const e of sd.snapshot.element) {
    const parts = e.path.split(".");
    if (parts.length !== 2) continue; // top-level <Type>.<field> only
    let field = parts[1];
    const isChoice = field.endsWith("[x]");
    if (isChoice) field = field.slice(0, -3);
    const present = isPresent(resource, field, isChoice);

    if (e.min >= 1) add(e.path, `required(min=${e.min})`, present, present ? undefined : "missing required element");
    if (e.max && e.max !== "*" && Array.isArray(resource[field]) && resource[field].length > Number(e.max)) {
      add(e.path, `cardinality(max=${e.max})`, false, `${resource[field].length} > ${e.max}`);
    }
    if (e.mustSupport && !present) add(e.path, "mustSupport", "not_evaluated", "must-support element absent (not a conformance failure)");

    const fixedSys = e.patternCodeableConcept && e.patternCodeableConcept.coding && e.patternCodeableConcept.coding[0] && e.patternCodeableConcept.coding[0].system;
    if (fixedSys && present) {
      const sys = resource[field] && resource[field].coding && resource[field].coding[0] && resource[field].coding[0].system;
      add(e.path, `fixed_system(${fixedSys})`, sys === fixedSys, sys === fixedSys ? undefined : `got ${sys}`);
    }

    const isCoded = (e.type || []).some((t) => /CodeableConcept|Coding|code/.test(t.code));
    if (e.binding && (e.binding.strength === "required" || e.binding.strength === "extensible") && present && isCoded) {
      add(e.path, `valueset_binding(${e.binding.strength})`, "not_evaluated", `ValueSet ${e.binding.valueSet || ""} — membership needs live NCTS expansion`);
    }
  }

  const status = checks.some((c) => c.pass === false) ? "non_conformant" : "conformant";
  return { conformance: { profile: sd.url, ig_version: AU_CORE_MANIFEST.ig_version, status, checks } };
}
