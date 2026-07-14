/**
 * Contract test for the capability-groups heading OVERLAY (FL-30 Priority-1, APF22 reorg).
 *
 * The overlay is non-destructive: it groups leaf capabilities under heading capabilities as
 * metadata. This test guards that discipline:
 *  - the registry validates against CapabilityGroupsRegistrySchema;
 *  - group_keys are unique;
 *  - EVERY member_capabilities entry resolves to a REAL capability (no DEAD_END pointer) —
 *    the resolvable set is CAPABILITY_VALIDATORS ∪ {dose_guidance, formulations, pbs};
 *  - COVERAGE: every resolvable capability appears in at least one group (nothing unclassified);
 *  - no capability is double-counted across groups (a leaf belongs to exactly one heading);
 *  - NTI-as-bucket: the therapeutic_drug_monitoring group contains BOTH nti and tdm_parameters;
 *  - the frozen pharm-check nti_check enum value still exists (the bucket's firewall check is
 *    intact — the reorg did not touch the frozen contract).
 * Run from repo root: node test/contract-pharm-capability-groups.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCapabilityGroups, CAPABILITY_VALIDATORS } from "../mcp/servers/pharmacology/domain/model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const load = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

// --- registry validates ---
let reg;
try { reg = validateCapabilityGroups(load("mcp/servers/pharmacology/data/capability-groups.json")); }
catch (e) { console.error("FAIL: capability-groups.json invalid:", e.message); process.exit(1); }

// Bespoke capabilities that have a dataset/handling but no CAPABILITY_VALIDATORS entry.
const BESPOKE = ["dose_guidance", "formulations", "pbs"];
const resolvable = new Set([...Object.keys(CAPABILITY_VALIDATORS), ...BESPOKE]);

const groupKeys = new Set();
const seenMembers = new Map(); // capability → group_key (double-count guard)
for (const g of reg.groups) {
  expect(!groupKeys.has(g.group_key), `duplicate group_key '${g.group_key}'`);
  groupKeys.add(g.group_key);
  for (const cap of g.member_capabilities) {
    expect(resolvable.has(cap), `group '${g.group_key}' member '${cap}' does not resolve to a real capability (DEAD_END)`);
    if (seenMembers.has(cap)) errors.push(`capability '${cap}' is in two groups ('${seenMembers.get(cap)}' and '${g.group_key}') — a leaf belongs to exactly one heading`);
    else seenMembers.set(cap, g.group_key);
  }
}

// --- coverage: every resolvable capability is classified into some group ---
for (const cap of resolvable) {
  expect(seenMembers.has(cap), `capability '${cap}' is not a member of any heading group (unclassified)`);
}

// --- NTI-as-bucket ---
const tdm = reg.groups.find((g) => g.group_key === "therapeutic_drug_monitoring");
expect(tdm && tdm.member_capabilities.includes("nti") && tdm.member_capabilities.includes("tdm_parameters"),
  "therapeutic_drug_monitoring group must contain BOTH nti (the bucket) and tdm_parameters");

// --- frozen nti_check intact (reorg did not touch the frozen contract) ---
const pharmCheck = load("mcp/schemas/pharm-check.schema.json");
const raw = JSON.stringify(pharmCheck);
expect(raw.includes("nti_check"), "frozen pharm-check must still carry the nti_check enum value (the NTI bucket's firewall check)");

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-pharm-capability-groups FAIL (${errors.length})`);
  process.exit(1);
}
console.log(`contract-pharm-capability-groups: OK (${reg.groups.length} groups, ${resolvable.size} capabilities classified)`);
