/**
 * Dose-line segmentation — pure, no I/O. Splits a clinician's APF22 Section D statement into the
 * indication-scoped lines a clinician needs to CHOOSE between.
 *
 * WHY SEGMENTING IS SAFE HERE, WHEN "the agent parsing clinical prose" IS NORMALLY THE HAZARD
 * (show-evidence principle, Case 3). The C2 plan first refused to split, reasoning that segmenting a
 * clinician's clinical text is exactly what the AHPRA gate exists to prevent. That objection
 * dissolves once the lines are SHOWN rather than EMITTED:
 *   - if the ENGINE PICKS a line, a segmentation error is invisible and gets acted on;
 *   - if the CLINICIAN SEES every line BESIDE the verbatim source, an error is visible and recoverable.
 * Structure for showing is safe in a way that structure for emitting is not. So: the engine still
 * selects nothing (`safe_dose_range` stays the whole verbatim statement), and these lines exist
 * purely to be rendered.
 *
 * TWO MECHANICAL GUARANTEES, both aimed at the MACHINE rather than the clinician:
 *  1. EVERY returned `statement` and `indication` is a VERBATIM SUBSTRING of the input. This module
 *     can CUT, never WRITE. A fabricated or paraphrased dose line is unrepresentable — enforced again
 *     at the schema (DoseGuidanceSchema's substring refinement) so it cannot be bypassed upstream.
 *  2. UNDER-SEGMENTING IS SAFE; OVER-SEGMENTING IS NOT. Failing to split yields one line carrying the
 *     whole statement — the clinician still sees everything. Splitting wrongly could attach a dose to
 *     the wrong indication. So the marker is deliberately conservative, and when in doubt it does not
 *     split.
 */
import { parseDoseAmounts } from "./dose-plausibility.js";

/**
 * An indication marker: a capitalised phrase, then ": ", at the start of the statement or straight
 * after a sentence boundary. `[^:.]` bars a period (an indication never spans a sentence) but ALLOWS
 * commas — real APF indications carry them ("Chronic open-angle glaucoma, epilepsy: Oral, 250 mg…").
 * The 60-char cap stops a whole clause being mistaken for a label.
 */
const MARKER_RE = /(^|(?<=\.)\s+)([A-Z][^:.]{2,60}?):\s+/g;

/**
 * Labels that are pure DOSING QUALIFIERS, never indications. A marker matching this is not a split
 * point: its text stays attached to the dose it qualifies, which is where it belongs.
 *
 * Derived from the real transcription, not guessed: sweeping all 451 adult statements produced 170
 * distinct labels, overwhelmingly real indications (Hypertension ×10, Parkinson's disease ×5,
 * Rheumatoid arthritis ×4). Exactly three were qualifiers — "Note", "Maximum", "Maximum weekly doses".
 *
 * DELIBERATELY NARROW. "Maintenance, predominantly negative symptoms" also starts with a qualifier
 * word but IS a clinically meaningful dosing-phase label, so a broader stop-list would destroy real
 * information to tidy up three rows. Under-correcting is the safe direction here, exactly as
 * under-segmenting is: a mislabelled line still SHOWS its text verbatim.
 */
const QUALIFIER_LABEL_RE = /^(note|maximum|minimum)(\s+(weekly|daily|monthly|single)?\s*doses?)?$/i;

/** Route tokens APF prints immediately after an indication. Metadata only — never removed from the
 *  statement, so `statement` stays maximally faithful to what the clinician wrote. */
const ROUTE_RE = /^(Oral\/IV|IV\/IM|Oral|IV|IM|SC|Subcutaneous|Intravenous|Intramuscular|Topical|Rectal|Inhaled|Intranasal|Nasal|Sublingual|Transdermal|Vaginal|Ophthalmic|Otic)\b/i;

/**
 * Segment a statement into dose lines.
 *
 * @param {string} sourceStatement - the clinician's verbatim APF text
 * @returns {Array<{ indication: string|null, route: string|null, statement: string,
 *                   basis: "flat_mg"|"weight_based"|"mixed"|"none" }>}
 *   Always at least one line. `indication: null` means the statement carries no indication — an
 *   "indication absent" fact to state, never a reason to withhold the dose.
 */
export function segmentDoseLines(sourceStatement) {
  const s = String(sourceStatement || "").trim();
  if (!s) return [];

  const marks = [];
  MARKER_RE.lastIndex = 0;
  for (const m of s.matchAll(MARKER_RE)) {
    const indication = m[2].trim();
    if (QUALIFIER_LABEL_RE.test(indication)) continue; // a qualifier stays with the dose it qualifies
    marks.push({ indication, start: m.index + m[0].length, labelStart: m.index + (m[1] ? m[1].length : 0) });
  }

  const line = (indication, text) => {
    const statement = text.trim();
    const r = ROUTE_RE.exec(statement);
    return { indication, route: r ? r[1] : null, statement, basis: parseDoseAmounts(statement).basis };
  };

  // No marker → ONE line carrying the whole statement. Under-segmenting is the safe direction.
  if (!marks.length) return [line(null, s)];

  // A marker that is not at position 0 means the statement opens with unlabelled text before the
  // first indication. Keep that text as its own indication-less line rather than discarding it —
  // dropping a fragment would silently lose dose content.
  const out = [];
  if (marks[0].labelStart > 0) {
    const lead = s.slice(0, marks[0].labelStart).trim();
    if (lead) out.push(line(null, lead));
  }
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].labelStart : s.length;
    out.push(line(mk.indication, s.slice(mk.start, end)));
  });
  return out.filter((l) => l.statement.length > 0);
}

/** "present" iff any line names an indication. The clinician's own `Dose:` label (vs `Adult dose:`)
 *  already marks an APF monograph that prints a dose with no indication; this derives the same fact
 *  from the statement itself. Absence is stated, never hidden. */
export function indicationStatus(lines) {
  return lines.some((l) => l.indication) ? "present" : "absent";
}
