/**
 * consult-tagger — deterministic FreeText_Taxonomy tagging of patient-offered
 * facts (register item `freetext-taxonomy-unconsumed`).
 *
 * Tags consult content with the Digital Tablet's FreeText_Taxonomy vocabulary
 * (HPC sub-tags, temporal tags, negative-findings) so intake facts carry the
 * richer metadata the omnibus defines. Three properties are load-bearing:
 *
 *  1. DETERMINISTIC, NOT LLM. Tags come from keyword/pattern matches against
 *     vocabulary read from the pinned omnibus (verification/omnibus.js) —
 *     the same input always yields the same tags, and no model can mint one.
 *
 *  2. AUDIT-SIDE ONLY, ADVISORY ONLY. Tags attach to audit-channel evidence
 *     (fact provenance, ledger, evidence_tree), never to the LLM-visible
 *     ContextPacket (operator ruling 2026-07-11), and they never gate the
 *     pipeline — a missing or wrong tag can cost audit richness, never
 *     safety. Over-tagging is therefore acceptable; leaking is not.
 *
 *  3. SENSITIVE-TIER DEFAULT-DENY ON THIS NEW PATH. The omnibus's
 *     sensitive_field_tiers classify mental-health / substance / sexual-
 *     health / DV / legal content (tiers 2–4). Operator ruling 2026-07-11:
 *     the NEW tagging path blocks — a fact classified tier ≥2 gets NO
 *     taxonomy tags, only a withheld marker naming the tier (minimisation:
 *     do not enrich metadata around the most sensitive disclosures).
 *     EXISTING pipeline paths get warn-only observability
 *     (sensitivityWarnings) — a counter and log line, never a gate change —
 *     with promotion to blocking left to a later gated step.
 */
import { omnibusSubtree, sensitiveFieldTiers } from "./omnibus.js";

/** Pull the character-quality vocabulary from the omnibus itself (e.g.
 *  "Sharp|dull|burning|…") so the tagger consumes the pinned dataset rather
 *  than carrying its own copy that could drift. */
function characterQualityTerms() {
  const cq = omnibusSubtree("FreeText_Taxonomy.HPC_sub_tags")?.character_quality;
  const values = typeof cq?.values === "string" ? cq.values : "";
  return values.split("|").map((v) => v.trim().toLowerCase()).filter(Boolean);
}

/** Deterministic tag rules. Each rule: taxonomy group + tag key (must exist in
 *  the omnibus vocabulary) + the pattern that fires it. Patterns are simple by
 *  design — reviewable by a clinician-engineer at a glance. */
function buildRules() {
  const cqTerms = characterQualityTerms();
  return [
    {
      group: "HPC_sub_tags",
      tag: "character_quality",
      match: (t) => cqTerms.find((term) => new RegExp(`\\b${term}\\b`, "i").test(t)),
    },
    {
      group: "HPC_sub_tags",
      tag: "severity_NRS_0_10",
      match: (t) => (t.match(/\b(?:10|[0-9])\s*(?:\/|out of)\s*10\b/i) || [])[0],
    },
    {
      group: "HPC_sub_tags",
      tag: "radiation",
      match: (t) => (t.match(/\b(?:radiat\w*|spread(?:s|ing)? to|goes to|moves to)\b/i) || [])[0],
    },
    {
      group: "Temporal_tags",
      tag: "symptom_duration",
      match: (t) => (t.match(/\b\d+\s*(?:hour|day|week|month|year)s?\b|\bago\b/i) || [])[0],
    },
    {
      group: "Temporal_tags",
      tag: "onset_date",
      match: (t) => (t.match(/\b(?:started|began|since (?:yesterday|last|this)\b|onset)\b/i) || [])[0],
    },
    {
      group: "Negative_findings_NLP",
      tag: "denied_symptoms",
      match: (t) => (t.match(/\b(?:denies|denied|no history of|no known|nil)\b/i) || [])[0],
    },
  ];
}

/** Keyword sets per omnibus sensitivity tier (tier_1_standard is the default
 *  and carries no keywords). Highest matching tier wins. */
const TIER_KEYWORDS = {
  tier_4_legal: [/\badvance care directive\b/i, /\bDNAR\b/, /\bDNR\b/, /\bcapacity assessment\b/i, /\bmental health act\b/i],
  tier_3_highly_sensitive: [/\bdomestic violence\b/i, /\babus(?:e|ive|ed)\b/i, /\bchild protection\b/i, /\bforensic\b/i, /\bgenetic test/i],
  tier_2_sensitive: [
    /\bdepress/i, /\banxiet/i, /\bsuicid/i, /\bself[- ]harm\b/i, /\bpsychiatr/i,
    /\balcohol\b/i, /\bdrug use\b/i, /\bheroin\b/i, /\bmethamphetamine\b/i, /\bcannabis\b/i,
    /\bsexual health\b/i, /\bSTI\b/, /\bHIV\b/,
  ],
};
const TIER_RANK = { tier_1_standard: 1, tier_2_sensitive: 2, tier_3_highly_sensitive: 3, tier_4_legal: 4 };

/**
 * Classify text against the omnibus sensitive-field tiers.
 * @returns {{ tier: string, rank: number, matches: string[] }}
 */
export function classifySensitivity(text) {
  const t = String(text ?? "");
  // Validate the tier vocabulary still exists in the pinned omnibus — if the
  // dataset lost it, refuse rather than silently classify everything tier 1.
  sensitiveFieldTiers();
  for (const tier of ["tier_4_legal", "tier_3_highly_sensitive", "tier_2_sensitive"]) {
    const matches = TIER_KEYWORDS[tier].map((re) => (t.match(re) || [])[0]).filter(Boolean);
    if (matches.length) return { tier, rank: TIER_RANK[tier], matches };
  }
  return { tier: "tier_1_standard", rank: 1, matches: [] };
}

/**
 * Tag case-derived packet facts (the NEW omnibus path — sensitive tiers block).
 *
 * @param {Array<{fact_id: string, value: unknown, label?: string}>} facts
 * @returns {Array<{fact_id: string, taxonomy_tags: Array<{group,tag,matched}>} |
 *                 {fact_id: string, withheld: true, tier: string, reason: string}>}
 */
export function tagConsultFacts(facts = []) {
  const rules = buildRules();
  return facts.map((f) => {
    const text = typeof f.value === "string" ? f.value : JSON.stringify(f.value ?? "");
    const sensitivity = classifySensitivity(text);
    if (sensitivity.rank >= 2) {
      // Default-deny on the new path: no metadata enrichment around
      // sensitive disclosures. The marker names the tier so the withholding
      // is auditable — surfaced, not silent.
      return {
        fact_id: f.fact_id,
        withheld: true,
        tier: sensitivity.tier,
        reason: `sensitive_field_tier default-deny: content classified ${sensitivity.tier} — taxonomy tagging withheld on the omnibus path (operator ruling 2026-07-11)`,
      };
    }
    const taxonomy_tags = [];
    for (const rule of rules) {
      const matched = rule.match(text);
      if (matched) taxonomy_tags.push({ group: rule.group, tag: rule.tag, matched: String(matched) });
    }
    return { fact_id: f.fact_id, taxonomy_tags };
  });
}

/**
 * Warn-only sensitivity observability for EXISTING pipeline paths: returns
 * tier ≥2 hits without altering anything. Callers log/count these; promotion
 * to a blocking gate is a later, separately-gated step.
 */
export function sensitivityWarnings(facts = []) {
  return facts
    .map((f) => {
      const text = typeof f.value === "string" ? f.value : JSON.stringify(f.value ?? "");
      const s = classifySensitivity(text);
      return s.rank >= 2 ? { fact_id: f.fact_id, tier: s.tier, matches: s.matches } : null;
    })
    .filter(Boolean);
}
