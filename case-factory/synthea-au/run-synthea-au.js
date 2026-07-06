/**
 * run-synthea-au — AU-localised Synthea (FORK of FHOOEAIST/synthea, #fork, Apache-2.0).
 *
 * FLOW_PLAN H4. FHOOEAIST/synthea is the Austrian (AT) localisation of Synthea; this
 * wrapper composes the base Synthea wrapper with AU-Core localisation and gates every
 * generated resource through the EXISTING fhir-broker AU Core conformance validator.
 * The Java fork itself runs OUT-OF-PROCESS (like the base generator) — no Java vendored
 * here. US/AT profiles are localisation TEMPLATES only; the conformance gate is the
 * mechanical guard that a bundle is actually AU Core before it can become a case.
 *
 * C22 (UNSETTLED — do not silently pick): the target is AU Core 0.3.0 per FLOW_PLAN/
 * the shaping contract, but the only vendored StructureDefinitions in this repo are the
 * 2.0.1-ci-build snapshot (operator decision, per standards_pins / fhir-broker manifest).
 * validateAuCore() therefore validates against whatever is vendored and REPORTS the
 * ig_version it used, and auCoreTarget() surfaces the divergence so it is visible, never
 * assumed resolved. Refresh the vendored SDs to 0.3.0 if/when C22 is settled.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateResource, AU_CORE_MANIFEST } from "../../mcp/servers/fhir-broker/conformance.js";
import { generate as generateBase } from "../synthea/run-synthea.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The AU fork commit this wrapper targets, from the harvest manifest. */
export function syntheaAuPin() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "integration/harvest-manifest.json"), "utf8"));
  const el = manifest.elements.find((e) => e.ref === "fork-synthea-at");
  return el ? { repo: el.repo, url: el.url, commit: el.pinned_commit, licence: el.licence } : null;
}

/**
 * The AU Core conformance target. FLOW_PLAN/contract pin 0.3.0; the repo vendors
 * `vendored`. When they differ, `c22_open` is true — the divergence is unsettled and
 * must be flagged, not silently resolved.
 */
export function auCoreTarget() {
  const pinned = "0.3.0";
  const vendored = AU_CORE_MANIFEST.ig_version;
  return { pinned, vendored, c22_open: pinned !== vendored };
}

/**
 * Validate one FHIR resource against the vendored AU Core snapshot.
 * @returns {{ conformance: { profile, ig_version, status, checks } }}
 */
export function validateAuCore(resource, profileUrl) {
  return validateResource(resource, profileUrl);
}

/**
 * Validate a whole FHIR bundle (array of resources, or a Bundle.entry[].resource set).
 * @returns {{ ok:boolean, ig_version:string, target:object, results:Array }}
 */
export function validateAuCoreBundle(resources) {
  const list = Array.isArray(resources)
    ? resources
    : (resources && resources.entry ? resources.entry.map((e) => e.resource) : []);
  const results = list.map((r) => ({ resourceType: r && r.resourceType, ...validateAuCore(r).conformance }));
  // conformance.js returns status ∈ {conformant, non_conformant, error(no vendored SD)}.
  // The gate FAILS on any non_conformant resource. A resource whose type has no vendored
  // SD (status:error) is reported and skipped — we neither fabricate a pass nor fail a
  // resource we cannot validate; at least one resource must actually validate conformant.
  const anyNonConformant = results.some((r) => r.status === "non_conformant");
  const anyConformant = results.some((r) => r.status === "conformant");
  return { ok: !anyNonConformant && anyConformant, ig_version: AU_CORE_MANIFEST.ig_version, target: auCoreTarget(), results };
}

/**
 * Generate AU-localised synthetic FHIR (delegates to the base Synthea wrapper).
 * Same fail-safe contract: input-gated (no fabrication) when the Java toolchain is absent.
 */
export function generateAu(opts) {
  const base = generateBase(opts);
  return { ...base, pin: syntheaAuPin(), au_core_target: auCoreTarget() };
}
