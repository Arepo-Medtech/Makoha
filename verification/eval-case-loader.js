/**
 * eval-case-loader — read a case's seven nodes for the eval harness.
 *
 * SCORER-SIDE read: this returns the sealed scoring nodes (10–13) too, because
 * the eval harness IS the grader. It is the harness's responsibility never to
 * route the sealed nodes into case_content / the conversation / the packet — the
 * pipeline's contextAllowList throws if they ever reach packet assembly (defence
 * in depth). This loader does not touch the pipeline; it just hands the nodes to
 * the graders.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const NODE_FILES = {
  envelope: "00_case_envelope.json",
  presentation: "01_presentation_layer.json",
  policy: "02_conversational_policy.json",
  ground_truth: "10_ground_truth_node.json",
  symptom_links: "11_symptom_links_node.json",
  management: "12_management_plan_node.json",
  safety_netting: "13_safety_netting_node.json",
};

/** Load the seven nodes from a case directory. Missing nodes → null. */
export function loadCaseNodes(caseDir) {
  const out = {};
  for (const [key, file] of Object.entries(NODE_FILES)) {
    const p = join(caseDir, file);
    out[key] = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  }
  return out;
}
