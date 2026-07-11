/**
 * omnibus — structured-dataset discipline for the Digital Tablet omnibus
 * (data/digital_tablet_omnibus.json; register item `omnibus-dataset-unversioned`).
 *
 * The omnibus is trust-boundary-3 STRUCTURED KNOWLEDGE: a versioned dataset,
 * not a live API and not LLM parametric memory. Per <engineering_standards>
 * receipt discipline, any pipeline component that reads it must be able to
 * prove WHICH version it read — so this module is the single reader: it loads
 * the document once, pins its sha256, and hands out a structured_dataset
 * proof (`omnibusDatasetReceipt`) alongside every resolution.
 *
 * Two safety properties live here, both mechanical:
 *
 *  1. resolveOmnibusPath — a dot-notation fhir_path is only usable if it
 *     actually resolves into the loaded document. An unresolvable path is
 *     rejected (resolved:false), NEVER guessed or passed through: a tag that
 *     cannot be proven against the dataset is a fabrication risk, and the
 *     fail-safe default is to withhold it (<non_negotiable_invariants>).
 *
 *  2. assertSpoilerSafePath — the omnibus carries worked EXAMPLE codes whose
 *     path segments name diagnoses (e.g. Condition.code.example_SNOMED.T2DM).
 *     Even though all omnibus tagging is audit/scorer-side (operator ruling
 *     2026-07-11: the LLM-visible packet stays byte-identical), a diagnosis-
 *     naming path on a case-derived artifact is a scoring-store-adjacent
 *     spoiler and a fabricated-code vector, so it is refused mechanically:
 *     any `example_*` segment, and any path rooted in the clinician-reasoning
 *     resources (ClinicalImpression, RiskAssessment), is forbidden on
 *     anything derived from case facts. Defence-in-depth, not prompt text.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const OMNIBUS_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "digital_tablet_omnibus.json");

/** Path segments that name clinician-reasoning resources — never valid roots
 *  for patient-presentation fact provenance (they are the "answer" side of
 *  the record, analogous to the sealed scoring nodes). */
const FORBIDDEN_ROOTS = new Set(["ClinicalImpression", "RiskAssessment"]);

const ReceiptShape = z
  .object({
    kind: z.literal("structured_dataset"),
    ref: z.string().min(1),
    dataset_version: z.string().min(1),
    sha256: z.string().length(64),
    request_id: z.string().min(8),
    upstream: z.literal("digital-tablet-omnibus"),
    mode: z.literal("mock"),
  })
  .strict();

let cache = null;

/** Load + pin the omnibus exactly once per process. */
function load() {
  if (cache) return cache;
  const raw = readFileSync(OMNIBUS_PATH);
  const doc = JSON.parse(raw.toString("utf8"));
  const version = doc?._digitalTablet?.version;
  if (!version) {
    // A document without a version cannot satisfy receipt discipline — refuse
    // to serve it rather than emit an unversioned proof.
    throw new Error("omnibus: data/digital_tablet_omnibus.json has no _digitalTablet.version — cannot emit a dataset receipt (fail-safe: refuse)");
  }
  cache = { doc, version: String(version), sha256: createHash("sha256").update(raw).digest("hex") };
  return cache;
}

/**
 * The structured_dataset proof every omnibus consumer must carry.
 * mode is always "mock": the omnibus is a repo-local dataset — there is no
 * live upstream to present, and presenting one would be mock-as-live.
 */
export function omnibusDatasetReceipt() {
  const { version, sha256 } = load();
  return ReceiptShape.parse({
    kind: "structured_dataset",
    ref: `digital-tablet-omnibus:v${version}`,
    dataset_version: version,
    sha256,
    request_id: `omnibus-${sha256.slice(0, 12)}`,
    upstream: "digital-tablet-omnibus",
    mode: "mock",
  });
}

/**
 * Resolve a dot-notation fhir_path against the loaded document.
 * The first segment is a resource root looked up across the three schema
 * parts (plus the `_digitalTablet` governance block); remaining segments walk
 * plain object keys. No wildcards, no bracket syntax — the conventions the
 * repo's schemas use are plain dotted keys, and anything fancier should fail
 * loudly here rather than resolve by accident.
 *
 * @returns {{ resolved: boolean, path: string, reason?: string }}
 */
export function resolveOmnibusPath(path) {
  if (typeof path !== "string" || !path.length) {
    return { resolved: false, path: String(path), reason: "empty or non-string path" };
  }
  const segs = path.split(".");
  const { doc } = load();
  const roots = [...Object.values(doc.schema || {}), { _digitalTablet: doc._digitalTablet }];
  let cur;
  for (const part of roots) {
    if (part && typeof part === "object" && segs[0] in part) {
      cur = part[segs[0]];
      break;
    }
  }
  if (cur === undefined) {
    return { resolved: false, path, reason: `root segment "${segs[0]}" is not a resource in the omnibus` };
  }
  for (const seg of segs.slice(1)) {
    if (cur !== null && typeof cur === "object" && seg in cur) {
      cur = cur[seg];
    } else {
      return { resolved: false, path, reason: `segment "${seg}" does not resolve in the omnibus` };
    }
  }
  return { resolved: true, path };
}

/**
 * Mechanical spoiler gate for case-derived provenance paths.
 * Throws — a spoiler path reaching this layer is a defect to surface, not a
 * field to silently drop (same posture as the context-allowlist sealed-node
 * hard stop).
 */
export function assertSpoilerSafePath(path) {
  const segs = String(path).split(".");
  if (FORBIDDEN_ROOTS.has(segs[0])) {
    throw new Error(`omnibus spoiler gate: path "${path}" is rooted in clinician-reasoning resource "${segs[0]}" — forbidden for case-fact provenance`);
  }
  for (const seg of segs) {
    if (seg.startsWith("example_")) {
      throw new Error(`omnibus spoiler gate: path "${path}" traverses worked-example segment "${seg}" — example codes/diagnosis names must never ride on case-derived artifacts`);
    }
  }
  return path;
}

/**
 * Validate-and-tag helper: returns the path if it both resolves and passes
 * the spoiler gate; returns null (withhold, fail-safe) if it does not
 * resolve. Spoiler violations still throw — they are defects, not gaps.
 */
export function provenPath(path) {
  assertSpoilerSafePath(path);
  return resolveOmnibusPath(path).resolved ? path : null;
}

/** Read-only accessor for omnibus subtrees (e.g. FreeText_Taxonomy) so other
 *  deterministic consumers never re-read the file and drift from the pinned
 *  version. Returns undefined when the path does not resolve. */
export function omnibusSubtree(path) {
  if (!resolveOmnibusPath(path).resolved) return undefined;
  const segs = path.split(".");
  const { doc } = load();
  const roots = [...Object.values(doc.schema || {}), { _digitalTablet: doc._digitalTablet }];
  let cur;
  for (const part of roots) {
    if (part && typeof part === "object" && segs[0] in part) {
      cur = part[segs[0]];
      break;
    }
  }
  for (const seg of segs.slice(1)) cur = cur[seg];
  return cur;
}

/** The omnibus security tier vocabulary (tier_1_standard … tier_4_legal). */
export function sensitiveFieldTiers() {
  const tiers = load().doc?._digitalTablet?.security?.sensitive_field_tiers;
  if (!tiers || typeof tiers !== "object") {
    throw new Error("omnibus: _digitalTablet.security.sensitive_field_tiers missing — tier classification unavailable (fail-safe: refuse, do not default to tier 1)");
  }
  return tiers;
}
