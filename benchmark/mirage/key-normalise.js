/**
 * MIRAGE evidence-key normaliser (FLOW_PLAN H3, MIRAGE-CORPUS-SPEC §4/§9).
 *
 * The harness scores a retrieval "hit" by comparing a NORMALISED evidence key
 * extracted from a returned EvidenceNode/snippet against the author-designated
 * `relevant_evidence` keys in the corpus. The three H2 paths surface their stable
 * key in slightly different shapes:
 *   - #14 evidence-fda-pubmed: supports[0].excerpt, e.g. "PMID:31234567",
 *     "FDA:ANDA-040455", "NCT01234567", "ICD-10:M54.5"
 *   - #15 evidence-drug-guideline: evidence_node.supports[0].excerpt, e.g.
 *     "interaction:warfarin+nsaid", "paediatric:aspirin-reye"
 *   - #1 docs override: snippet.citation_id, e.g. "cw-au:imaging-lbp:2024-01"
 *
 * §4 FINDING (confirmed at H3 Phase 1): the key rides in the excerpt/citation
 * locator (a "hint" per evidence-node.schema.json), NOT in supports[].ref (which
 * is the receipt request_id). That is the stable, deterministic key for BENCHMARK
 * scoring — no server change is required. This normaliser folds both the returned
 * locator and the corpus key into one canonical form so the match is deterministic
 * (MIRAGE-CORPUS-SPEC §2.6).
 */

/**
 * Fold an evidence locator / citation id into a canonical, comparable key.
 * Lower-cases, strips whitespace, and unifies the FDA/PMID/NCT/ICD-10-AM prefix
 * families so "NCT01234567" and "nct:01234567", or "ICD-10:M54.5" and
 * "icd10:m54.5", compare equal. Domain keys (interaction:/guideline:/paediatric:/
 * cw-au:/etg:/fhir-dev:) are already stable and are only lower-cased.
 *
 * @param {unknown} raw
 * @returns {string|null} canonical key, or null for empty input
 */
export function normaliseKey(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  // Unify the coded-identifier prefixes the mock corpora use.
  s = s
    .replace(/^icd-?10(?:-am)?[:\-]/, "icd10:")
    .replace(/^pmid[:\-]/, "pmid:")
    .replace(/^fda[:\-]/, "fda:");
  // NCT locators often lack a separator ("NCT01234567").
  const nct = s.match(/^nct[:\-]?(\d{6,})$/);
  if (nct) s = "nct:" + nct[1];
  return s;
}
