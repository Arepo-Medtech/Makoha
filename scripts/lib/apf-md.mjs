/**
 * APF22 Section D transcription parser (FL dose-guidance C2a) — pure, no I/O, no dependency.
 *
 * Reads the clinician's own markdown transcription of APF22 Section D "Common dosage range" into
 * structured monographs. It EXTRACTS AND LABELS; it never rewrites, summarises, or infers. Every
 * statement it returns is a verbatim slice of the source — that is asserted by the contract test.
 *
 * WHY MARKDOWN AND NOT THE CSV (D-SE-3). The clinician supplied both. The .md is the richer artifact
 * and already carries HIS label vocabulary (`Adult dose:` / `Paediatric dose:` / `Adult and paediatric
 * dose:` / `Dose:` / `Note:`), so segmentation follows the clinician's structure instead of one the
 * agent invents. It also sidesteps a live hazard: `pharm-author.mjs`'s `csvToRecords()` does
 * `line.split(",")` and is documented "no embedded commas/quotes" — the real CSV is quoted RFC-4180
 * with commas in nearly every field, so it SHIFTS COLUMNS: abacavir's adult dose becomes the string
 * "antiretroviral" and its PAEDIATRIC dose lands in the ADULT field. The second failure is the
 * dangerous one — "300 mg twice daily" is a perfectly plausible adult dose, so no downstream guard
 * catches it. See the deprecation note on csvToRecords(). This parser exists partly so nobody needs it.
 *
 * FAIL-LOUD ON THE UNEXPECTED. An unrecognised bullet label THROWS rather than being skipped. If the
 * clinician adds a label, that must surface as an error, not silently drop a dose off the end of the
 * pipeline — a dropped dose is invisible, and invisible is the one thing this subsystem cannot afford.
 */

/** The clinician's label vocabulary, exactly as it appears in the transcription. Counts as of the
 *  2026-07-15 file: Adult dose 451 · Paediatric dose 232 · Adult and paediatric dose 14 · Note 14 ·
 *  Dose 3. `Dose` is an APF monograph that prints a dose with NO indication — "indication absent",
 *  which is a fact to state, not a reason to withhold. `Note` is a referral instruction. */
export const APF_LABELS = ["Adult dose", "Paediatric dose", "Adult and paediatric dose", "Dose", "Note"];

const HEADING_RE = /^### (.+)$/;
const ITALIC_RE = /^\*([^*].*)\*$/;                       // *drug class*
const SECTION_RE = /^\*\*Common dosage range\*\*\s*$/;    // the normal form: header + bullets
const SECTION_INLINE_RE = /^\*\*Common dosage range:\*\*\s*(.+)$/; // the absence form (1 monograph)
const BULLET_RE = /^- \*\*([^:]+):\*\*\s*(.*)$/;

/**
 * Parse the transcription into monographs.
 *
 * @param {string} md
 * @returns {Array<{ ingredient: string, drug_class: string|null,
 *                   lines: Array<{ label: string, statement: string }>,
 *                   section_note: string|null }>}
 *   `section_note` is set ONLY where the monograph declares an ABSENCE (e.g. interferon beta-1b:
 *   "Not listed in Section D for this monograph"). An absent dose is surfaced as a stated fact, never
 *   as an empty record indistinguishable from a parse failure.
 * @throws on an unrecognised bullet label, or a bullet outside a monograph.
 */
export function parseApfMonographs(md) {
  const out = [];
  let cur = null;
  const push = () => { if (cur) out.push(cur); };

  for (const raw of String(md ?? "").split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, "").trimEnd();

    const h = HEADING_RE.exec(line);
    if (h) { push(); cur = { ingredient: h[1].trim(), drug_class: null, lines: [], section_note: null }; continue; }
    if (!cur) continue; // preamble before the first monograph

    const inline = SECTION_INLINE_RE.exec(line);
    if (inline) { cur.section_note = inline[1].trim(); continue; }
    if (SECTION_RE.test(line)) continue;

    const b = BULLET_RE.exec(line);
    if (b) {
      const label = b[1].trim();
      if (!APF_LABELS.includes(label)) {
        throw new Error(`apf-md: unrecognised label "${label}" for ${cur.ingredient} — refusing to silently drop a dose. Add it to APF_LABELS deliberately.`);
      }
      cur.lines.push({ label, statement: b[2].trim() });
      continue;
    }

    // The italic class line sits directly under the heading, before any bullet. Guarded so an
    // emphasised word inside a later statement cannot be mistaken for the drug class.
    const it = ITALIC_RE.exec(line);
    if (it && cur.drug_class === null && cur.lines.length === 0) cur.drug_class = it[1].trim();
  }
  push();
  return out;
}

/** The clinician-stated ADULT dose for a monograph, or null.
 *  "Adult and paediatric dose" is DELIBERATELY not returned here: it is a combined statement, and
 *  silently treating it as adult-only would put paediatric content on the adult path — the exact
 *  failure the CSV column-shift would have caused. Callers that want it must ask for it by label. */
export function adultDose(mono) {
  const l = (mono.lines || []).find((x) => x.label === "Adult dose");
  return l ? l.statement : null;
}

/** Index monographs by lowercased ingredient. */
export function byIngredient(monos) {
  const m = new Map();
  for (const x of monos) m.set(x.ingredient.toLowerCase(), x);
  return m;
}
