/**
 * patient-simulator — the deterministic patient side of the multi-turn eval
 * consult (FL-40, Phase 2). It plays the patient/caregiver so the AI Doctor can
 * be driven through a real conversation, then records WHICH disclosure items
 * were elicited and WHEN (the raw material the Phase-3 history_taking coverage
 * grader reads).
 *
 * FIREWALL — this is load-bearing:
 *   - The simulator reads ONLY the presentation node (01) and the conversational
 *     policy (02). Node 02 is the simulator's dialogue material (channel
 *     "exchange" in context-allowlist.js) — it is the PATIENT's script, never the
 *     AI Doctor's packet. The AI Doctor sees the conversation the simulator
 *     produces, not the policy file.
 *   - It is a HARD STOP to hand this module any sealed scoring node (10_–13_):
 *     the patient does not know the diagnosis, the gold management, or the tier.
 *     assertNoSealed() throws on their presence, mirroring contextAllowList's
 *     firewall so the eval path is default-deny too. A leak of a sealed answer
 *     into the patient's mouth would invalidate the entire evaluation.
 *
 * DETERMINISM: no LLM. Reveal decisions are a pure function of (the AI's question
 * text, the item's disclosure_gate, the turn/rapport state) via the shared
 * eval-text-match matcher. A recorded consult replays identically — the point of
 * an evaluation gate that has to survive CI.
 *
 * The seven disclosure gates (02 schema) are handled explicitly; see GATES below.
 */

import { bestMatch, matchesAny } from "./eval-text-match.js";

/** Sealed scoring-store node prefixes — never legitimate simulator input. */
const SEALED_NODE_RE = /^1[0-3]_/;

/**
 * Matcher thresholds + rapport gate (eval-rubric §4/§6, v0.1 defaults).
 * Passed through `options` so a signed rubric can override them in one place.
 */
export const SIM_DEFAULTS = Object.freeze({
  generalThreshold: 0.4, // a broad/general history question matches loosely
  specificThreshold: 0.6, // a targeted question must match tightly
  rapportTurns: 2, // prior substantive AI turns before a rapport-gated item opens
  examKeywords: [
    "examine", "examination", "listen", "auscultate", "palpate", "stethoscope",
    "blood pressure", "measure", "ecg", "test", "bloods", "blood test",
    "investigation", "scan", "imaging", "x-ray", "swab", "temperature",
  ],
});

/** Throw if any sealed scoring node was handed in. Presence alone is a breach. */
function assertNoSealed(caseFields) {
  for (const key of Object.keys(caseFields || {})) {
    if (SEALED_NODE_RE.test(key)) {
      throw new Error(
        `SCORING-STORE FIREWALL: sealed node "${key}" was handed to the patient simulator — halted. ` +
          "The patient does not know the diagnosis/gold management/tier; feeding 10_–13_ here would leak the answer key (critical defect).",
      );
    }
  }
}

/** Is this AI turn an examination/investigation request? (gate 6). */
function isExamRequest(text, examKeywords) {
  const t = String(text || "").toLowerCase();
  return examKeywords.some((k) => t.includes(k));
}

/**
 * Decide whether a single disclosure item reveals on this AI turn.
 * @returns {"reveal"|"deflect"|"hold"} reveal = say patient_response_template;
 *   deflect = say patient_deflection_template (asked but guarded); hold = silent.
 */
function decideReveal(item, aiText, state, opts) {
  const triggers = Array.isArray(item.trigger_question_examples) ? item.trigger_question_examples : [];
  const general = matchesAny(aiText, triggers, opts.generalThreshold);
  const specific = matchesAny(aiText, triggers, opts.specificThreshold);

  switch (item.disclosure_gate) {
    case "volunteered_unprompted":
      // Handled at turn 0; if somehow still pending, it stays volunteered.
      return "hold";
    case "revealed_on_general_question":
      return general ? "reveal" : "hold";
    case "revealed_on_specific_targeted_question":
      return specific ? "reveal" : "hold";
    case "revealed_if_rapport_established_first":
      if (state.aiTurns < opts.rapportTurns) return general ? "deflect" : "hold";
      return general ? "reveal" : "hold";
    case "denied_unless_directly_and_sensitively_asked":
      // Opens only on a tight, targeted question; a loose brush-past is deflected.
      if (specific) return "reveal";
      return general ? "deflect" : "hold";
    case "revealed_only_on_examination_or_test_request":
      return isExamRequest(aiText, opts.examKeywords) || specific ? "reveal" : "hold";
    case "not_disclosable_in_this_encounter":
      // Sealed at the presentation boundary (clinician-only finding). Never said.
      return "hold";
    default:
      // Unknown gate → fail safe: withhold rather than volunteer.
      return "hold";
  }
}

/**
 * Create a patient simulator for one case.
 *
 * @param {{ presentation: object, policy: object }} caseNodes - the parsed
 *   01_presentation_layer and 02_conversational_policy objects (ONLY these).
 * @param {object} [options] - threshold/rapport overrides (rubric-governed).
 * @returns a simulator with openingTurn(), respondTo(), and inspection getters.
 * @throws if handed a sealed node, or if the required nodes are absent.
 */
export function createPatientSimulator({ presentation, policy } = {}, options = {}) {
  // Firewall: refuse sealed content defensively even though callers should never
  // pass it (the arguments are named 01/02, but guard the whole object anyway).
  assertNoSealed({ presentation, policy, ...(arguments[0] || {}) });
  if (!presentation || !policy) {
    throw new Error("patient simulator requires both presentation (01) and policy (02) nodes");
  }

  const opts = { ...SIM_DEFAULTS, ...options };
  const items = Array.isArray(policy.disclosure_items) ? policy.disclosure_items : [];
  const endConditions = policy.consultation_end_conditions || {};
  const maxTurns = Number.isInteger(endConditions.max_turns) ? endConditions.max_turns : 20;

  // elicited: item_id -> { turn, gate, scoring_weight, is_red_flag, is_diagnosis_critical }
  const elicited = new Map();
  const deflected = new Map(); // item_id -> turn last deflected
  const state = { aiTurns: 0, turn: 0, ended: false };

  const record = (item, turn) => {
    if (!elicited.has(item.item_id)) {
      elicited.set(item.item_id, {
        turn,
        gate: item.disclosure_gate,
        scoring_weight: item.scoring_weight,
        is_red_flag: !!item.is_red_flag,
        is_diagnosis_critical: !!item.is_diagnosis_critical,
      });
    }
  };

  return {
    /** Turn 0: the presenting complaint + every volunteered_unprompted item. */
    openingTurn() {
      const oc = presentation.opening_complaint || {};
      const parts = [];
      if (oc.verbatim_patient_text) parts.push(oc.verbatim_patient_text);
      if (oc.stated_reason_for_presenting_today) parts.push(oc.stated_reason_for_presenting_today);
      const revealed = [];
      for (const item of items) {
        if (item.disclosure_gate === "volunteered_unprompted") {
          record(item, 0);
          revealed.push(item.item_id);
          if (item.patient_response_template) parts.push(item.patient_response_template);
        }
      }
      state.turn = 0;
      return { turn: 0, speaker: "patient", patient_text: parts.join(" "), revealed, deflected: [] };
    },

    /**
     * Advance one turn in response to the AI Doctor's message.
     * @param {string} aiText - the AI Doctor's turn text (its question/statement).
     */
    respondTo(aiText) {
      if (state.ended) throw new Error("consult already ended");
      state.aiTurns += 1;
      state.turn += 1;
      const revealed = [];
      const deflectedNow = [];
      const parts = [];
      for (const item of items) {
        if (elicited.has(item.item_id)) continue; // already said; don't repeat
        const decision = decideReveal(item, aiText, state, opts);
        if (decision === "reveal") {
          record(item, state.turn);
          revealed.push(item.item_id);
          if (item.patient_response_template) parts.push(item.patient_response_template);
        } else if (decision === "deflect") {
          deflected.set(item.item_id, state.turn);
          deflectedNow.push(item.item_id);
          if (item.patient_deflection_template) parts.push(item.patient_deflection_template);
        }
      }
      // A turn that reveals nothing still needs a plausible patient utterance so
      // the AI has something to react to; keep it content-free (no leak).
      const patient_text = parts.length ? parts.join(" ") : "I'm not sure — can you tell me more about what you mean?";
      return { turn: state.turn, speaker: "patient", patient_text, revealed, deflected: deflectedNow };
    },

    /** Mark the consult ended (the harness calls this on terminal AI output). */
    end() {
      state.ended = true;
    },

    /** True once the AI has elicited every item in minimum_items_before_management. */
    minimumItemsMet() {
      const min = Array.isArray(endConditions.minimum_items_before_management)
        ? endConditions.minimum_items_before_management
        : [];
      return min.every((id) => elicited.has(id));
    },

    /** Snapshot for the Phase-3 history_taking grader: what was elicited, when. */
    elicitationReport() {
      return {
        elicited: Array.from(elicited.entries()).map(([item_id, meta]) => ({ item_id, ...meta })),
        deflected: Array.from(deflected.entries()).map(([item_id, turn]) => ({ item_id, turn })),
        minimum_items_met: this.minimumItemsMet(),
        total_disclosure_items: items.length,
      };
    },

    get maxTurns() {
      return maxTurns;
    },
    get turn() {
      return state.turn;
    },
    get ended() {
      return state.ended;
    },
  };
}
