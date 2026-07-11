/**
 * D-PP — Descriptor-based Pitfall Pathways if proceeding (pure).
 *
 * Builds ONE safety-net descriptor per CAUTION concern from the ATTESTED
 * scope-registry discriminators the interrogation already asked: the
 * condition-specific stigmata become the watch-for list ("return / seek urgent
 * care if any of these appears"). SOURCES: scope-registry (+ the redflags-*
 * knowledge dataset when wired) ONLY — the safety-tier vocabulary is
 * referenced by NAME (tier_ref "T4-T5"), never by reading the sealed
 * safety-netting scoring node (node 13; scoring-store firewall, absolute).
 *
 * No SNOMED code is minted here: the optional `snomed` binding is left absent
 * in Step 1 and may only ever be filled from a terminology lookup receipt.
 * The list is short and ranked (the concern's own stigmata first) — no
 * exhaustive dump (anti-caveat-fatigue).
 */
import { DPP } from "../abcde-schema.js";
import { slug } from "../discriminators.js";

/**
 * @param {Array<object>} concerns - CAUTION-tier ConcernVerdicts
 * @returns {{safety_net:Array, coded_pitfalls:Array}}
 */
export function pitfallPathways(concerns) {
  const safety_net = concerns.map((c) => {
    const stigmata = c.discriminators_asked
      .filter((d) => d.source === "condition_specific.escalate_to_immediate_if")
      .map((d) => d.text);
    const watch = stigmata.length ? stigmata : ["any new or rapidly worsening symptom"];
    return {
      id: `sn-${slug(c.condition)}-1`,
      descriptor: `Return / call 000 or seek urgent care if any of: ${watch.join("; ")}`,
      watch_for: watch,
      when_urgent: "any of the above, or feeling rapidly worse",
      tier_ref: "T4-T5", // vocabulary name only — NEVER read from scoring node 13
    };
  });
  const coded_pitfalls = concerns.map((c) => ({
    label: `silent progression of ${c.condition} despite currently absent high-acuity stigmata`,
  }));
  return DPP.parse({ safety_net, coded_pitfalls });
}
