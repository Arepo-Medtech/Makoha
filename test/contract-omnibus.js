/**
 * Contract tests for the omnibus dataset-discipline module
 * (verification/omnibus.js) — register item `omnibus-dataset-unversioned`.
 * <test_and_evaluation_gates> requires deterministic safety code to be tested.
 *
 * Asserts:
 *   - the dataset receipt is well-formed: structured_dataset kind, version
 *     pinned from the document itself, a real sha256, mock mode (a repo-local
 *     dataset must never present as live);
 *   - path resolution is proof-based: real paths (the schema-const field-map
 *     anchors) resolve; invented paths are rejected with a reason, never
 *     passed through;
 *   - the spoiler gate is mechanical: any `example_*` segment throws, and a
 *     path rooted in a clinician-reasoning resource (ClinicalImpression /
 *     RiskAssessment) throws — even though such paths RESOLVE in the document;
 *   - provenPath composes the two: spoiler → throw, unresolvable → null
 *     (withhold, fail-safe), good path → returned verbatim;
 *   - omnibusSubtree serves the FreeText_Taxonomy vocabulary and
 *     sensitiveFieldTiers serves the 4-tier security vocabulary, so
 *     downstream consumers read the pinned document, not their own copy.
 *
 * Run from repo root: node test/contract-omnibus.js
 */
import {
  omnibusDatasetReceipt,
  resolveOmnibusPath,
  assertSpoilerSafePath,
  provenPath,
  omnibusSubtree,
  sensitiveFieldTiers,
} from "../verification/omnibus.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// 1. Dataset receipt — receipt discipline for a structured dataset.
const receipt = omnibusDatasetReceipt();
check("receipt: kind structured_dataset", receipt.kind === "structured_dataset");
check("receipt: ref carries pinned version", /^digital-tablet-omnibus:v.+/.test(receipt.ref));
check("receipt: sha256 is 64 hex chars", /^[0-9a-f]{64}$/.test(receipt.sha256));
check("receipt: request_id derived from hash", receipt.request_id === `omnibus-${receipt.sha256.slice(0, 12)}`);
check("receipt: upstream fixed", receipt.upstream === "digital-tablet-omnibus");
check("receipt: mode mock — never presents as live", receipt.mode === "mock");
check("receipt: stable across calls", omnibusDatasetReceipt().sha256 === receipt.sha256);

// 2. Path resolution — the schema-const anchors must resolve; inventions must not.
const GOOD_PATHS = [
  "Patient",
  "Condition",
  "Condition._freetext_HPC_tags",
  "Observation",
  "MedicationRequest",
  "AllergyIntolerance",
  "SDOH_Observations.full_SDOH_field_map",
  "FamilyMemberHistory._freetext_family_history_tags",
  "FreeText_Taxonomy.HPC_sub_tags",
  "FreeText_Taxonomy.Temporal_tags",
  "FreeText_Taxonomy.Negative_findings_NLP",
];
for (const p of GOOD_PATHS) check(`resolve: ${p}`, resolveOmnibusPath(p).resolved === true);

check("resolve: invented root rejected", resolveOmnibusPath("MadeUpResource.foo").resolved === false);
check("resolve: invented leaf rejected", resolveOmnibusPath("Patient.not_a_real_field_xyz").resolved === false);
check("resolve: rejection carries a reason", typeof resolveOmnibusPath("MadeUpResource.foo").reason === "string");
check("resolve: empty path rejected", resolveOmnibusPath("").resolved === false);
check("resolve: non-string rejected", resolveOmnibusPath(undefined).resolved === false);

// 3. Spoiler gate — mechanical, throws, catches paths that DO resolve.
const SPOILER = "Condition.code.example_SNOMED.T2DM";
check("spoiler fixture actually resolves (the hazard is real)", resolveOmnibusPath(SPOILER).resolved === true);
check("spoiler: example_* segment throws", throws(() => assertSpoilerSafePath(SPOILER)));
check("spoiler: ClinicalImpression root throws", throws(() => assertSpoilerSafePath("ClinicalImpression._freetext_reasoning_tags")));
check("spoiler: RiskAssessment root throws", throws(() => assertSpoilerSafePath("RiskAssessment.prediction")));
check("spoiler: clean path passes through", assertSpoilerSafePath("Patient") === "Patient");

// 4. provenPath — compose: spoiler throws, unresolvable withholds (null), good returns.
check("provenPath: spoiler throws", throws(() => provenPath(SPOILER)));
check("provenPath: unresolvable → null (withhold, never guess)", provenPath("Patient.not_a_real_field_xyz") === null);
check("provenPath: good path returned verbatim", provenPath("Condition._freetext_HPC_tags") === "Condition._freetext_HPC_tags");

// 5. Vocabulary accessors.
const hpc = omnibusSubtree("FreeText_Taxonomy.HPC_sub_tags");
check("subtree: HPC_sub_tags served", hpc && typeof hpc === "object" && "character_quality" in hpc);
check("subtree: unresolvable → undefined", omnibusSubtree("FreeText_Taxonomy.not_real") === undefined);
const tiers = sensitiveFieldTiers();
check("tiers: all four tiers present", ["tier_1_standard", "tier_2_sensitive", "tier_3_highly_sensitive", "tier_4_legal"].every((t) => t in tiers));

if (errors.length) {
  console.error("contract-omnibus FAILED:\n - " + errors.join("\n - "));
  process.exit(1);
}
console.log("contract-omnibus: all checks passed");
