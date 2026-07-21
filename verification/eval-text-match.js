/**
 * eval-text-match — the deterministic text matcher shared by the patient
 * simulator (trigger matching) and the Phase-3 coverage graders (item coverage).
 *
 * WHY deterministic, no LLM: the eval gate must be replay-stable and
 * CI-reproducible (FL-40). The ONLY model in scoring is the communication judge
 * (weight 0.05); every other match/miss decision is a pure function of the text,
 * so a recorded run replays byte-identically. This is the mechanism behind
 * eval-rubric §4.
 *
 * Matching is normalised token containment: lowercase, strip punctuation,
 * tokenise, drop stop-words, then measure how much of the SHORTER token set is
 * present in the other (containment, not symmetric Jaccard — a short targeted
 * question should match a longer answer it is contained in). Synonym expansion
 * is a rubric-configurable table passed in by the caller (default: none), kept
 * out of this module so the clinician-signed synonym set lives in one place.
 */

/** Minimal clinical-safe stop-word list. Deliberately small — over-stripping
 *  loses signal. No medical terms here. */
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "do",
  "does", "did", "have", "has", "had", "you", "your", "yours", "i", "we", "he",
  "she", "it", "they", "them", "him", "her", "his", "my", "me", "of", "to", "in",
  "on", "at", "for", "with", "and", "or", "but", "if", "any", "some", "that",
  "this", "these", "those", "there", "here", "how", "what", "when", "where",
  "why", "which", "who", "can", "could", "would", "should", "will", "shall",
  "may", "might", "about", "from", "as", "so", "than", "then", "now", "just",
  "get", "got", "feel", "feeling", "like", "up", "down", "out", "off",
]);

/** Lowercase, strip non-alphanumerics to spaces, split, drop stop-words and
 *  1-char tokens. Optional synonym map folds tokens onto a canonical form. */
export function tokenize(text, synonyms = null) {
  const raw = String(text == null ? "" : text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  const out = new Set();
  for (const t of raw) {
    const canon = synonyms && Object.prototype.hasOwnProperty.call(synonyms, t) ? synonyms[t] : t;
    if (canon) out.add(canon);
  }
  return out;
}

/**
 * Containment score in [0,1]: fraction of the SMALLER token set whose members
 * appear in the larger set. Empty either side → 0 (nothing to match on).
 */
export function containment(aTokens, bTokens) {
  const [small, big] = aTokens.size <= bTokens.size ? [aTokens, bTokens] : [bTokens, aTokens];
  if (small.size === 0 || big.size === 0) return 0;
  let hit = 0;
  for (const t of small) if (big.has(t)) hit += 1;
  return hit / small.size;
}

/**
 * Best containment score of `query` against any of `references`.
 * @returns {{ score: number, index: number }} best score and the matching
 *   reference index (-1 when there are no references).
 */
export function bestMatch(query, references = [], synonyms = null) {
  const q = tokenize(query, synonyms);
  let best = { score: 0, index: -1 };
  references.forEach((ref, i) => {
    const s = containment(q, tokenize(ref, synonyms));
    if (s > best.score) best = { score: s, index: i };
  });
  return best;
}

/**
 * True when `query` matches any reference at/above `threshold`.
 * @param {string} query
 * @param {string[]} references
 * @param {number} threshold - containment cutoff (rubric §4; default 0.6)
 * @param {object|null} synonyms - optional canonicalisation map
 */
export function matchesAny(query, references, threshold = 0.6, synonyms = null) {
  return bestMatch(query, references, synonyms).score >= threshold;
}
