/**
 * Jamba long-context assembler (MI-15; execution plan §2.2/§5, acceptance: "packet
 * assembled within context budget").
 *
 * The pipeline's Step-3 contextInjection() already assembles AND gates the
 * ContextPacket (the packet-only bar + the mechanical firewall). This module is the
 * BOUNDING layer that sits over that: it folds the patient history into the grounded
 * material and fits the result within a context budget before generation, so a long
 * record + history + many receipts cannot blow the reasoner's window.
 *
 * SAFETY — it compresses by SELECTION, never by invention:
 *   - It NEVER adds a fact that was not in the input (Jamba-the-model, if ever wired,
 *     may only compress free-text; it cannot mint a fact — see jambaModelAvailable).
 *   - Safety CONSTRAINTS are never dropped.
 *   - A grounding receipt / evidence node referenced by a KEPT fact is never dropped
 *     (a kept fact keeps its proof), even if that pushes the packet over budget —
 *     grounding integrity beats budget, and the overflow is reported honestly.
 *   - Everything dropped is LOGGED (no silent cap).
 *   - The bounded packet is re-validated through validateContextPacket, so the
 *     packet-only bar + firewall (lab_result sanitised; patient-provenance ≠
 *     lab_result; sealed scoring nodes) still hold — an unsafe input THROWS here
 *     rather than being laundered into a smaller packet.
 * Pure module — `now` injectable for deterministic tests.
 */
import { validateContextPacket } from "../../verification/pipeline-schemas.js";

/** Clinical priority: lower = kept first when the budget forces drops. Safety-load-bearing
 *  categories (pertinent negatives, symptoms, assessments) survive; demographics go first. */
const PRIORITY = {
  pertinent_negative: 0, symptom: 1, clinical_assessment: 2, vital_sign: 3, risk_score: 4,
  investigation: 5, lab_result: 6, medication: 7, allergy: 8, past_history: 9,
  immunisation: 10, procedure: 11, care_plan: 12, family_history: 13, social_history: 14,
  demographic: 15, routing_signal: 16,
};

/** Deterministic, transport-free token estimate (~4 chars/token). */
export function estimateTokens(x) {
  return Math.ceil(JSON.stringify(x ?? "").length / 4);
}

/** The ContextPacket metadata fields the assembler carries through verbatim. */
const PACKET_META = ["trunk_id", "session_ref", "run_id", "mode", "grounding_plan_summary", "pharm_check_receipt", "blocked", "block_reasons"];

/**
 * Input-gated seam for the Jamba 1.5 Mini long-context model. Default UNAVAILABLE:
 * the deterministic assembler above is the wired path. When a Jamba endpoint is
 * configured at deploy it may only compress free-text narrative — it can never add a
 * structured fact to the packet (that would breach the packet-only bar).
 * @param {Record<string,string|undefined>} [env]
 */
export function jambaModelAvailable(env = process.env) {
  const raw = (env.HEYDOC_JAMBA_ENDPOINT || "").trim();
  if (!raw) return { available: false, reason: "HEYDOC_JAMBA_ENDPOINT unset — deterministic assembler is the wired path (Jamba model is a deploy-gated compression aid)" };
  if (raw.startsWith("<") || raw.includes("example.invalid")) return { available: false, reason: "HEYDOC_JAMBA_ENDPOINT is a placeholder" };
  return { available: true, endpoint: raw };
}

/**
 * Assemble a bounded ContextPacket from grounded material + patient history.
 * @param {{ facts?: object[], evidence?: object[], constraints?: string[], receipts?: object[],
 *           history?: object[], [meta: string]: any }} input
 * @param {{ budgetTokens?: number, now?: () => number }} [opts]
 * @returns {{ packet: object, dropped: object[], within_budget: boolean, estimated_tokens: number, budget_tokens: number }}
 */
export function assembleBoundedPacket(input, { budgetTokens = 4000, now = () => Date.now() } = {}) {
  const constraints = [...(input.constraints || [])];      // ALWAYS kept — safety
  const evidenceIn = [...(input.evidence || [])];
  const receiptsIn = [...(input.receipts || [])];
  const factsIn = [...(input.facts || []), ...(input.history || [])]; // history folded in

  // Stable priority order: lower PRIORITY first, input order preserved within a tier.
  const ordered = factsIn
    .map((f, i) => ({ f, i }))
    .sort((a, b) => ((PRIORITY[a.f.category] ?? 99) - (PRIORITY[b.f.category] ?? 99)) || (a.i - b.i))
    .map((x) => x.f);

  const dropped = [];
  // The mandatory floor is the constraints + metadata; facts fill the remaining budget.
  let cost = estimateTokens({ constraints });
  const base_over_budget = cost > budgetTokens; // even the safety floor doesn't fit

  const keptFacts = [];
  for (const f of ordered) {
    const c = estimateTokens(f);
    if (cost + c <= budgetTokens) { keptFacts.push(f); cost += c; }
    else dropped.push({ kind: "fact", fact_id: f.fact_id, category: f.category, reason: "context_budget" });
  }

  // Grounding integrity: keep every receipt/evidence node a KEPT fact references, even
  // over budget; then fill any remaining budget with the rest; log the drops.
  const neededReceiptIds = new Set(keptFacts.map((f) => f.receipt_id).filter(Boolean));
  const neededEvidenceIds = new Set(keptFacts.map((f) => f.evidence_node_id).filter(Boolean));

  const keptReceipts = [];
  for (const r of receiptsIn) {
    const c = estimateTokens(r);
    const referenced = neededReceiptIds.has(r.request_id);
    if (referenced || cost + c <= budgetTokens) { keptReceipts.push(r); cost += c; }
    else dropped.push({ kind: "receipt", request_id: r.request_id, reason: "context_budget" });
  }
  const keptEvidence = [];
  for (const e of evidenceIn) {
    const c = estimateTokens(e);
    const referenced = neededEvidenceIds.has(e.id);
    if (referenced || cost + c <= budgetTokens) { keptEvidence.push(e); cost += c; }
    else dropped.push({ kind: "evidence", id: e.id, reason: "context_budget" });
  }

  // Build the packet EXPLICITLY (never spread `input` — `history` and any stray key
  // must not leak into the strict ContextPacket).
  const packet = { facts: keptFacts, evidence: keptEvidence, constraints, receipts: keptReceipts, assembled_at_utc: new Date(now()).toISOString() };
  for (const k of PACKET_META) if (input[k] !== undefined) packet[k] = input[k];

  // Packet-only bar + firewall — throws on an unsafe packet (never laundered).
  const validated = validateContextPacket(packet);
  const estimated_tokens = estimateTokens(validated);
  return { packet: validated, dropped, within_budget: estimated_tokens <= budgetTokens && !base_over_budget, estimated_tokens, budget_tokens: budgetTokens };
}
