/**
 * ppp-ttt discriminators — READ-ONLY loader + matcher over the clinician-
 * attested scope registry (data/scope-registry.json — the tracked, pinned
 * v1.3.0 snapshot of the operator's source document, vendored the same way
 * data/digital_tablet_omnibus.json is; the operator's original lives outside
 * version control under Projects/, which is gitignored as sensitive business
 * material and therefore absent in CI. A registry update is a clinician
 * attestation event: re-vendor the snapshot AND bump the pin below under an
 * approved plan — until then a drifted file fails closed).
 *
 * Trust boundary 3 (structured knowledge): the registry is a versioned,
 * attested dataset. This module is PPP-TTT's ONLY read path into it — it loads
 * the document once, pins its version + sha256 (receipt discipline), and hands
 * out discriminators with deterministic IDs. It NEVER writes the registry and
 * NEVER invents a discriminator: every tier assignment and escalation
 * threshold it returns is clinician-attested (attested_by "KL"); PPP-TTT
 * consumes attestations, it does not create them.
 *
 * FAIL-CLOSED RULES (each returns { evaluable:false } → the caller STOPs):
 *  - registry version ≠ the pinned 1.3.0 (a drifted registry is not a valid
 *    grading basis);
 *  - registry-level attestation missing, or the severity model's
 *    per_condition_discriminators_attested flag not true;
 *  - the exclusion carries attested:false, or an optional per-condition
 *    discriminator_status present and not "attested" (§3.2 data-only field —
 *    filled by clinician attestation, never by code);
 *  - any discriminator text carrying a TBD marker (an unresolved discriminator
 *    cannot be evaluated).
 * Ambiguous attestation is treated as unattested — unsafe until confirmed,
 * consistent with the BLIND_STUB classification rule.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Prefixed } from "../hash.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(__dirname, "..", "..", "data", "scope-registry.json");

/** The only registry version this module will grade against. Bumping it is a
 *  plan-gated change that re-verifies every discriminator assumption. */
export const PINNED_SCOPE_REGISTRY_VERSION = "1.3.0";

let cache = null;

/** Load + pin the registry exactly once per process. Throws on unreadable /
 *  unparseable file — the caller's fail-closed wrapper converts that to STOP. */
export function loadScopeRegistry() {
  if (cache) return cache;
  const raw = readFileSync(REGISTRY_PATH, "utf8");
  const doc = JSON.parse(raw);
  cache = { doc, version: String(doc.version || ""), sha256: sha256Prefixed(raw) };
  return cache;
}

/** Structured-dataset proof for the registry read (receipt discipline). */
export function scopeRegistryReceipt() {
  const { version, sha256 } = loadScopeRegistry();
  return { kind: "structured_dataset", ref: `scope-registry:v${version}`, dataset_version: version, sha256 };
}

/** slug("Pyelonephritis") -> "pyelonephritis" — deterministic discriminator id stems. */
export function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const TBD_RE = /\bTBD\b|TBD_clinician/i;

/**
 * Registry-level attestation gate. All three must hold before ANY grading:
 * pinned version, named attestor, and the attested per-condition discriminator
 * model (severity.per_condition_discriminators_attested).
 * @returns {{ ok: boolean, reason?: string }}
 */
export function registryAttestationGate() {
  const { doc, version } = loadScopeRegistry();
  if (version !== PINNED_SCOPE_REGISTRY_VERSION) {
    return { ok: false, reason: `scope-registry version "${version}" != pinned "${PINNED_SCOPE_REGISTRY_VERSION}"` };
  }
  if (!doc.attestation || !doc.attestation.attested_by) {
    return { ok: false, reason: "scope-registry carries no clinician attestation" };
  }
  if (doc.severity?.per_condition_discriminators_attested !== true) {
    return { ok: false, reason: "per-condition discriminators are not attested (severity.per_condition_discriminators_attested !== true)" };
  }
  return { ok: true };
}

/**
 * Find the attested exclusion entry a raised flag refers to.
 * Managed conditions are NOT gradeable: a safety flag raised against a managed
 * condition has no attested discriminator set, so it fails closed upstream.
 *
 * @param {string} areaId - scope-registry areas[].id
 * @param {string} condition - exclusions[].condition (case-insensitive match)
 * @returns {{ found: boolean, area?: object, exclusion?: object, managed_only?: boolean, reason?: string }}
 */
export function findExclusion(areaId, condition) {
  const { doc } = loadScopeRegistry();
  const area = (doc.areas || []).find((a) => a.id === areaId);
  if (!area) return { found: false, reason: `area "${areaId}" is not in the scope registry` };
  const want = String(condition).trim().toLowerCase();
  const exclusion = (area.exclusions || []).find((e) => String(e.condition).trim().toLowerCase() === want);
  if (exclusion) return { found: true, area, exclusion };
  const managed = (area.managed || []).some((m) => String(m).trim().toLowerCase() === want);
  if (managed) {
    return { found: false, managed_only: true, reason: `"${condition}" is a managed condition in area "${areaId}" — no attested discriminator set exists to grade a raised safety flag against` };
  }
  return { found: false, reason: `condition "${condition}" is not in the scope registry for area "${areaId}"` };
}

/**
 * Per-exclusion evaluability gate (composes with registryAttestationGate).
 * @returns {{ evaluable: boolean, reason?: string }}
 */
export function exclusionAttestationGate(exclusion) {
  if (exclusion.attested === false) return { evaluable: false, reason: `discriminators for "${exclusion.condition}" carry attested:false` };
  const status = exclusion.condition_specific?.discriminator_status;
  if (status !== undefined && status !== "attested") {
    return { evaluable: false, reason: `discriminator_status "${status}" for "${exclusion.condition}" is not "attested"` };
  }
  const texts = [
    ...(Array.isArray(exclusion.condition_specific?.escalate_to_immediate_if) ? exclusion.condition_specific.escalate_to_immediate_if : []),
    ...(typeof exclusion.condition_specific?.refer_if === "string" ? [exclusion.condition_specific.refer_if] : []),
  ];
  const tbd = texts.find((t) => TBD_RE.test(String(t)));
  if (tbd) return { evaluable: false, reason: `discriminator for "${exclusion.condition}" is unresolved (TBD): "${tbd}"` };
  return { evaluable: true };
}

/**
 * The discriminator set for an acuity_dependent exclusion, with deterministic
 * IDs (stable across runs, so patient_answers and ledger discriminator_ids
 * always refer to the same attested criterion):
 *   uhao-<n>                 universal_high_acuity_override[n-1]
 *   <condition-slug>-cs-<n>  condition_specific.escalate_to_immediate_if[n-1]
 *   <condition-slug>-refer-1 condition_specific.refer_if
 *
 * @returns {{ uhao: Array<{id,source,text}>, cs_eti: Array<{id,source,text}>, refer: Array<{id,source,text}> }}
 */
export function discriminatorsFor(exclusion) {
  const { doc } = loadScopeRegistry();
  const stem = slug(exclusion.condition);
  const uhao = (doc.triage_model?.universal_high_acuity_override || []).map((text, i) => ({
    id: `uhao-${i + 1}`,
    source: "universal_high_acuity_override",
    text: String(text),
  }));
  const csList = Array.isArray(exclusion.condition_specific?.escalate_to_immediate_if)
    ? exclusion.condition_specific.escalate_to_immediate_if
    : [];
  const cs_eti = csList.map((text, i) => ({
    id: `${stem}-cs-${i + 1}`,
    source: "condition_specific.escalate_to_immediate_if",
    text: String(text),
  }));
  const refer = typeof exclusion.condition_specific?.refer_if === "string"
    ? [{ id: `${stem}-refer-1`, source: "condition_specific.refer_if", text: exclusion.condition_specific.refer_if }]
    : [];
  return { uhao, cs_eti, refer };
}
