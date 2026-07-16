/**
 * case-warrant — the single source of truth for which case fields may SCORE the AI Doctor
 * and which are REFERENCE only (Case Corpus v2, Phase 2b).
 *
 * Every descent field carries two orthogonal annotations in its JSON Schema:
 *   x-warrant   : "clinician" | "derived"   — WHO makes the field trustworthy.
 *   x-fhir-tier : 1 | 2 | 3                  — HOW it is represented (R4 home / composition / bespoke).
 *
 * The load-bearing rule this module exists to enforce mechanically, not by intention:
 *
 *     A field with x-warrant:"derived" MAY NOT SCORE THE AI DOCTOR.
 *
 * A derived field (AMT code, PBS item, schedule, interactions-present-reference) is a lookup from the
 * same knowledge base the AI Doctor reads. Scoring the AI against it would grade PharmCheck against
 * PharmCheck — the "instrument calibrated against itself" circularity the scoring-store firewall
 * exists to prevent. Derived fields are captured AGGRESSIVELY (uncaptured metadata is value welded to
 * an attested seal, recoverable later only at re-attestation cost) and excluded from scoring BY
 * CONSTRUCTION. The scorer (Phase 2c) and the QC harness (Phase 2e) both import `derivedFieldNames`
 * from here so there is exactly one list, not two that can drift.
 *
 * Pure + deterministic. No I/O beyond the schema object passed in.
 */
import { z } from "zod";

export const WARRANTS = Object.freeze(["clinician", "derived"]);
export const FHIR_TIERS = Object.freeze([1, 2, 3]);

/** The annotation contract, validated with zod (schema-first: the markers are themselves a contract). */
export const WarrantAnnotation = z.object({
  warrant: z.enum(["clinician", "derived"]),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  deprecated: z.boolean().optional(),
});

/**
 * Walk a JSON Schema and collect every property carrying an x-warrant, with its field name and
 * annotation. Recurses through `properties` and array `items` so nested medication fields are found.
 * @returns {Array<{ name: string, path: string, warrant: string, tier?: number, deprecated?: boolean }>}
 */
export function extractWarrantMap(schema, path = "") {
  const out = [];
  const visit = (node, p) => {
    if (!node || typeof node !== "object") return;
    if (Object.prototype.hasOwnProperty.call(node, "x-warrant")) {
      const ann = { warrant: node["x-warrant"], tier: node["x-fhir-tier"], deprecated: node["x-deprecated"] };
      // Validate the annotation itself — a malformed marker is a defect, not silently ignored.
      WarrantAnnotation.parse({ warrant: ann.warrant, tier: ann.tier, deprecated: ann.deprecated });
      out.push({ name: p.split(".").pop(), path: p, ...ann });
    }
    if (node.properties) for (const [k, v] of Object.entries(node.properties)) visit(v, p ? `${p}.${k}` : k);
    if (node.items) visit(node.items, `${p}[]`);
  };
  visit(schema, path);
  return out;
}

/**
 * The set of field NAMES that must never reach the scorer. This is THE list the scorer-firewall
 * (2c) and the QC harness (2e) consume — one source, so they cannot drift.
 * @returns {Set<string>}
 */
export function derivedFieldNames(schema) {
  return new Set(extractWarrantMap(schema).filter((f) => f.warrant === "derived").map((f) => f.name));
}

/** Field names a scorer MAY read (clinician-warranted, not deprecated). */
export function scoreableFieldNames(schema) {
  return new Set(
    extractWarrantMap(schema)
      .filter((f) => f.warrant === "clinician" && !f.deprecated)
      .map((f) => f.name)
  );
}

/**
 * Assert the annotations are internally consistent. Throws on the contradictions that would make the
 * warrant machinery a lie. Called by the contract test and safe to call at scorer boot.
 */
export function assertWarrantConsistency(schema) {
  const map = extractWarrantMap(schema);
  const problems = [];
  const derived = new Set(map.filter((f) => f.warrant === "derived").map((f) => f.name));
  const scoreable = new Set(map.filter((f) => f.warrant === "clinician" && !f.deprecated).map((f) => f.name));

  // A field cannot be both derived (never-score) and clinician-scoreable.
  for (const n of derived) if (scoreable.has(n)) problems.push(`field "${n}" is both derived and scoreable`);

  // A derived field must declare its FHIR tier — how a lookup is represented is not optional.
  for (const f of map) if (f.warrant === "derived" && !FHIR_TIERS.includes(f.tier)) {
    problems.push(`derived field "${f.name}" has no valid x-fhir-tier (got ${f.tier})`);
  }

  if (problems.length) throw new Error(`case-warrant: inconsistent annotations —\n  ${problems.join("\n  ")}`);
  return { derived: [...derived], scoreable: [...scoreable], total: map.length };
}
