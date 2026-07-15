/**
 * dose-evidence-plane — everything we hold about a dose, assembled FOR THE CLINICIAN (E3, R-47b).
 *
 * THE DISTINCTION THIS MODULE EXISTS TO MAKE. "No autonomous prescription" means the AI must not MINT
 * a dose. It does not mean a registered practitioner may not be SHOWN one, with its provenance.
 * Showing a clinician the signed AU dose, the US/EU labels beside it, and what the literature reports
 * IS the human-in-the-loop — it is the thing Guardrail 2 ("the engine proposes, a registered
 * practitioner disposes") presumes is happening. Withholding it is not neutrality.
 *
 * TWO PLANES, ALREADY SEPARATE IN THIS ARCHITECTURE:
 *   AUTHORITATIVE — `PharmCheck.dose_guidance` (pharm-check.schema.json, FROZEN,
 *     additionalProperties:false, seven fixed DOSE_KEYS). The clinician-signed AU dose ONLY.
 *     Patient-promotable, through the gate. **This module does not touch it.**
 *   EVIDENCE — the ReviewBundle (portal/review-bundle.js), "what the clinician reviewer is SHOWN, as
 *     a hashed contract". Advisory, provenance-tagged, never patient-facing without a gate record.
 *     **This module feeds that.**
 * The bar between them already exists and is not weakened here: `releaseToPatient()`.
 *
 * WHY THIS IS NOT A `PharmDataSource` ACCESSOR — the load-bearing structural point. The isolation of
 * `international_dose_guidance` is not a convention or a comment; it holds because **no engine
 * accessor exists**. Its own status field states the design: "Structurally ISOLATED from the
 * PharmCheck engine (no accessor reads it) so a foreign label can never become an AU dose — the
 * 'Australian healthcare context only' hard limit is preserved by construction, not by wording."
 * Adding `getInternationalDose()` to PharmDataSource would hand `engine.js` a path to a foreign label
 * and dissolve that guarantee. So this module reads the isolated registers DIRECTLY and is imported
 * by the pipeline's portal channel only — never by engine.js. The engine's accessor set stays exactly
 * eight, none of them foreign.
 *
 * WHAT RIDES HERE. Same channel as `history_summary` / `ppp_ttt` / `abcde_record`: portal + audit
 * material, assembled off the trunk path, NEVER merged into the ContextPacket. The trunk LLM does not
 * see this. The clinician does.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");

/** Every item is one of these. `authority` is the whole point: only ONE kind is authoritative. */
export const EVIDENCE_KINDS = [
  "au_dose_signed",      // the clinician-signed AU dose — the ONLY authoritative kind
  "international_label", // US/EU approved-label dose — evidence beside it, never a verdict on it
  "cds_dose_candidate",  // a second independent executor's dose over the same signed records
  "literature",          // what the primary literature REPORTS — not prescribing guidance
  "congruence",          // the AU-vs-foreign appraisal
  "plausibility",        // the order-of-magnitude read
  "held",                // knowledge we hold but have not elevated — shown as held, with its reason
];

function load(file) {
  try { return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")).records || []; }
  catch { return []; } // an absent register yields no evidence — never a fabricated one
}

const lc = (s) => String(s || "").toLowerCase();

/**
 * What a clinician is shown when the firewall has blocked: NO dose text, and an honest account of
 * what is being withheld and why.
 *
 * This is the difference between a gated ACTION and a silent drop. The hard limit says no dose text
 * past a blocked firewall — fine, that is the firewall doing its job. But saying nothing at all would
 * make "we hold a clinician-signed AU dose for this drug" indistinguishable from "we hold nothing",
 * and that IS the failure the show-evidence principle names. So the counts and the reason are stated;
 * the text is not. The clinician can see the block, see its reason (hard_stops), and see that
 * evidence exists behind it.
 */
function withheld(n, reason) {
  const counts = {
    au_dose: load("dose-guidance.json").filter((r) => lc(r.ingredient) === n && r.provenance?.review_status === "approved").length,
    international: load("international-dose-guidance.json").filter((r) => lc(r.ingredient) === n && r.dose_statement).length,
    literature: load("dose-evidence.json").filter((r) => lc(r.ingredient) === n && r.dose_statement).length,
  };
  const held = counts.au_dose + counts.international + counts.literature;
  if (!held) return []; // nothing held → nothing to declare withheld

  const why = reason === "paediatric"
    ? "the patient is under 18 and no paediatric dosing tables exist — this is flagged for in-person review (paediatric hard limit, unchanged)"
    : `the pharmacology firewall returned ${reason}`;

  return [{
    kind: "held",
    authority: "advisory",
    ingredient: n,
    status: `dose_text_withheld:${reason}`,
    source: "dose-evidence-plane (firewall gate)",
    note:
      `DOSE TEXT WITHHELD — ${why}. No dose is shown past a blocked firewall: that limit is absolute and ` +
      `has no override. You are told what exists so that "withheld" is never mistaken for "we hold nothing": ` +
      `${counts.au_dose} clinician-signed AU dose, ${counts.international} US/EU comparator label(s), ` +
      `${counts.literature} literature record(s). Resolve the block (see hard_stops) and the evidence is shown in full.`,
    patient_facing: false,
  }];
}

/** Statuses at which NO dose text may be surfaced — the operator's §1 limit, held. */
const DOSE_BLOCKED = ["HARD_FAIL", "BLOCKED_NO_PROOF"];

/**
 * Assemble the dose evidence for one drug.
 *
 * THE LIMIT THAT GOVERNS THIS FUNCTION — and it is the operator's, not an invention.
 * `.planning/SHOW-EVIDENCE-PRINCIPLE.md` §1.1, written in the section titled "Where the principle
 * does NOT apply — the limits, held":
 *
 *   "HARD_FAIL still blocks, unconditionally. Dose guidance emits only on PASS/WARN — never on
 *    HARD_FAIL / BLOCKED_NO_PROOF / paediatric. That is a frozen contract + a hard limit. It gates
 *    an ACTION, not evidence. 'Show the clinician everything' never becomes 'show a dose the
 *    firewall blocked'. No override, no exception."
 *
 * So the show-evidence principle does NOT license surfacing dose text past a blocked firewall, and
 * the first cut of this module did exactly that — it assembled the AU dose, the foreign labels and
 * the literature doses on a HARD_FAIL. The principle governs what we show WHEN WE SHOW, and every
 * routing/binning decision; it does not dissolve the firewall.
 *
 * The synthesis, which is what keeps this from becoming the suppression the principle exists to
 * stop: when the firewall blocks, dose TEXT is withheld — and the withholding is STATED, with what
 * exists, how much of it, and why it is not being shown. A clinician is told "we hold an AU dose and
 * 2 foreign labels for this drug; they are withheld because the firewall returned HARD_FAIL". That is
 * a gated action with an honest account of the gate. It is not a silent drop, which is the failure
 * mode the principle actually names — evidence that vanishes with no trace that it existed.
 *
 * Paediatric is the same shape and the same reason: no paediatric dosing tables exist, under-18 is
 * flagged for in-person review, and the hard limit is unchanged.
 *
 * @param {string} drug
 * @param {{ firewallStatus?: string, ageYears?: number|null, cdsDoseCandidate?: object|null,
 *           cdsProvider?: string, cdsKmSet?: string }} opts
 *   `firewallStatus` GATES dose text (see above). Omitted → treated as ungated, for direct callers
 *   that have already established a non-blocked context; the pipeline always passes it.
 *   `cdsDoseCandidate` is the gateway's dose, which the pipeline used to DISCARD after folding the
 *   status. It has a consumer now: it rides here as a second opinion for the clinician to weigh.
 * @returns {Array<object>} advisory items (+ at most one authoritative AU dose). Empty when we hold
 *   nothing — which is the truth, and is said rather than papered over.
 */
export function assembleDoseEvidence(drug, { firewallStatus = null, ageYears = null, cdsDoseCandidate = null, cdsProvider = null, cdsKmSet = null } = {}) {
  const n = lc(drug);
  if (!n) return [];

  const blockedBy = DOSE_BLOCKED.includes(firewallStatus) ? firewallStatus
    : (typeof ageYears === "number" && ageYears < 18) ? "paediatric"
      : null;
  if (blockedBy) return withheld(n, blockedBy);

  const out = [];

  // 1. The AU dose — the only AUTHORITATIVE item. Shown with who signed it.
  const au = load("dose-guidance.json").find((r) => lc(r.ingredient) === n);
  if (au) {
    const approved = au.provenance?.review_status === "approved";
    out.push({
      kind: "au_dose_signed",
      authority: approved ? "authoritative" : "advisory", // an unattested draft is NOT authoritative
      ingredient: au.ingredient,
      jurisdiction: "AU",
      text: au.source_statement,
      source: "APF22 Section D — the clinician's own verbatim transcription",
      attested_by: approved ? au.provenance.reviewed_by : null,
      entered_by: au.origin?.entered_by ?? null,
      note: approved
        ? "Clinician-attested AU dose. This is the dose the engine emits."
        : "AUTHORED BUT NOT YET ATTESTED (review_status: draft) — shown so you know it exists; it is not yet a signed dose.",
      patient_facing: false,
    });

    // 2. Plausibility, per dose line — a FLAG for the clinician, never a veto.
    for (const [i, l] of (au.dose_lines || []).entries()) {
      if (l.plausibility === "plausible") continue; // no flag to raise
      out.push({
        kind: "plausibility",
        authority: "advisory",
        ingredient: au.ingredient,
        text: l.statement,
        status: l.plausibility,
        source: "dose-plausibility guard (order-of-magnitude read against the foreign label)",
        note: l.plausibility_note
          || (l.plausibility === "implausible"
            ? `Line ${i + 1}: an order-of-magnitude gap vs the foreign label. A misplaced zero looks exactly like this. NOT a judgement that the AU dose is wrong, and NOT a block.`
            : `Line ${i + 1}: no plausibility claim is made — this is NOT an all-clear.`),
        patient_facing: false,
      });
    }

    // 3. Congruence — the appraisal, stated in the AU-primacy framing the operator ruled.
    const c = au.au_congruence;
    if (c) {
      out.push({
        kind: "congruence",
        authority: "advisory",
        ingredient: au.ingredient,
        status: c.status,
        text: c.status === "no_comparator"
          ? c.appraisal_note
          : "The AU dose differs from the foreign label(s) shown. Normal — jurisdictions differ by approved indication, population and regulatory history. AU has primacy: this needs no justification. Shown so the decision is yours with everything we hold in front of you.",
        source: "au_congruence appraisal",
        patient_facing: false,
      });
    }
  }

  // 4. US/EU approved-label doses — VERBATIM, labelled as foreign. This is R-47b's substance: the
  //    AU-primacy ruling assumes the clinician SAW the divergence, and until now nothing showed it
  //    at runtime. A foreign label is evidence beside the AU dose; it is never an AU dose, and it
  //    never enters PharmCheck.dose_guidance.
  for (const r of load("international-dose-guidance.json")) {
    if (lc(r.ingredient) !== n || !r.dose_statement) continue;
    const current = r.authorization_status === "ACTIVE";
    out.push({
      kind: "international_label",
      authority: "advisory",
      ingredient: r.ingredient,
      jurisdiction: r.jurisdiction,
      agency: r.agency,
      text: r.dose_statement,
      status: r.authorization_status,
      amass_id: r.amass_id,
      source: `${r.agency} approved label (via AMASS RegulatoryCore)`,
      note: current
        ? "Foreign approved label. NOT an AU dose — AU indications, scheduling and PI may differ."
        : `⚠️ ${r.authorization_status} — NOT a current label. Shown because withholding what we hold is not neutrality; weigh it accordingly.`,
      patient_facing: false,
    });
  }

  // 5. The CDS gateway's dose candidate — a SECOND independent executor over the same signed records.
  //    Agreement is corroboration; divergence is exactly what a clinician should see. The pipeline
  //    folds the gateway's STATUS monotonically and has always thrown this away.
  if (cdsDoseCandidate && (cdsDoseCandidate.safe_dose_range || cdsDoseCandidate.text)) {
    out.push({
      kind: "cds_dose_candidate",
      authority: "advisory",
      ingredient: drug,
      text: cdsDoseCandidate.safe_dose_range || cdsDoseCandidate.text,
      source: `${cdsProvider || "cds"} gateway${cdsKmSet ? ` (knowledge set ${cdsKmSet})` : ""}`,
      note: "A second independent executor's dose over the same clinician-signed records. Agreement corroborates; divergence is for your judgement. Never an AU dose by itself.",
      patient_facing: false,
    });
  }

  // 6. What the literature REPORTS. 261 clinician-signed, citation-verified records that have
  //    reached nobody: engine-isolated by design (correctly — a study finding is not a dose), but
  //    engine-isolated was silently doing the work of clinician-isolated. It is not prescribing
  //    guidance and says so; it is context a practitioner is entitled to have.
  for (const r of load("dose-evidence.json")) {
    if (lc(r.ingredient) !== n || !r.dose_statement) continue;
    out.push({
      kind: "literature",
      authority: "advisory",
      ingredient: r.ingredient,
      text: r.dose_statement,
      context: r.context,
      population: r.population,
      citation: r.citation,
      evidence_note: r.evidence_note,
      source: r.citation?.id_type === "pmid" ? `PubMed ${r.citation.identifier}` : (r.citation?.identifier ?? "literature"),
      note: "REPORTED IN THE PRIMARY LITERATURE — not prescribing guidance, not an AU dose. Study population and design may not match this patient.",
      patient_facing: false,
    });
  }

  // 7. Held knowledge — shown AS held, with its reason. A holding area the clinician cannot see is
  //    indistinguishable from knowledge we never had.
  for (const r of load("dose-evidence-review-queue.json")) {
    if (lc(r.ingredient) !== n) continue;
    out.push({
      kind: "held",
      authority: "advisory",
      ingredient: r.ingredient,
      text: r.apf_fact || r.context || "(held record)",
      status: r.queue_status,
      source: "dose-evidence review queue",
      note: `HELD, not elevated — ${r.reason_unverified || "awaiting verification"}. Shown so you know it exists and why it is not being relied on.`,
      patient_facing: false,
    });
  }

  return out;
}

/**
 * Kinds whose content ORIGINATES OUTSIDE the clinician-signed AU record. These, and only these, are
 * the ones that must never appear as the AU dose.
 *
 * `plausibility` and `congruence` are deliberately NOT here: they are appraisals OF the AU dose and
 * quote it by design (a plausibility item's text IS the dose line it assesses — for a single-line
 * monograph that string is identical to `safe_dose_range`). An earlier version of this bar compared
 * every advisory item's text against the dose and fired on exactly that, breaking `contract-firewall`
 * on a legitimate PASS. A safety bar with false positives does not fail safe: it gets loosened under
 * pressure, and then it is not there when the real inversion arrives. So it targets the actual
 * hazard — foreign-sourced dose text reaching the AU dose field — and nothing else.
 */
const FOREIGN_SOURCED = ["international_label", "cds_dose_candidate", "literature"];

/**
 * THE MECHANICAL BAR — foreign-sourced dose text may never become the authoritative AU dose.
 *
 * The hazard, concretely: a US/EU approved label, a CDS gateway's candidate, or a dose reported in a
 * study appearing in `PharmCheck.dose_guidance`. That is the jurisdiction inversion the engine
 * isolation exists to prevent (a foreign regulator's label has no standing as an AU dose) and the
 * second-source hazard (a gateway dose silently substituting for a clinician-signed one).
 *
 * Structurally this is already true: `pharm-check.schema.json` is frozen with
 * additionalProperties:false and `dose_guidance` admits exactly seven DOSE_KEYS, and no accessor lets
 * the engine reach a foreign label at all. But "cannot be represented today" is a property of files
 * someone can edit. This asserts the invariant at the seam, so a future change that widens PharmCheck
 * or adds a convenience accessor trips here rather than silently shipping a US label as an AU dose.
 *
 * @throws if foreign-sourced dose text is being emitted as the authoritative dose.
 */
export function assertNoAdvisoryInDose(pharmCheck, evidence) {
  const dose = pharmCheck?.dose_guidance?.safe_dose_range;
  if (!dose) return;
  for (const e of evidence) {
    if (!FOREIGN_SOURCED.includes(e.kind)) continue;
    if (e.text && e.text === dose) {
      throw new Error(
        `dose-evidence-plane: a ${e.kind} item (${e.jurisdiction ?? e.source}) is being emitted as PharmCheck.dose_guidance. ` +
        `Foreign-sourced dose text is evidence for the clinician to weigh; it is NEVER the AU dose. ` +
        `This is the jurisdiction inversion the engine isolation exists to prevent.`,
      );
    }
  }
}
