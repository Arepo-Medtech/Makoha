/**
 * conflict-audit — parallel-expert conflict-audit trust mechanism (FLOW_PLAN H6,
 * D-1 owner ruling 2026-07-07).
 *
 * FIRST-PARTY CLEAN-ROOM BUILD. The pattern (N independent expert opinions on
 * the same question → surface agreement/disagreement → flag unresolved conflict
 * as a trust signal) is the published parallel-expert-consensus methodology
 * referenced by octochains (#5). #5's licence is pending, so — per the licence
 * floor and the H3 #20 / H1 fasten-sources precedents — NO octochains code was
 * wrapped, vendored, forked, copied, or read. This module implements the
 * methodology from its published description only.
 *
 * WHAT THIS IS NOT (integration discipline, H6):
 *   - NOT an orchestrator. The trunk spine + sequencer remain the only routing;
 *     this module never decides what runs next.
 *   - NOT a gate. attachConflictAudit() NEVER writes `pass`, `results`,
 *     `candidate_output_hash`, `firewall_status`, or `continuation_blocked` —
 *     so it cannot flip a fail to a pass, cannot fail a passing output, and can
 *     never override a HARD_FAIL or BLOCKED_NO_PROOF. The five mechanical
 *     verifier checks (C1, frozen) and the pharmacology firewall stay the only
 *     gates. Acting on the conflict signal (e.g. a sequencer halt-on-conflict,
 *     a portal-gate annotation) is future, separately plan-gated work.
 *   - NOT a resolver. Positions are reported VERBATIM; the audit never picks a
 *     winner or synthesises a consensus answer (the #2 design lesson: assemble,
 *     don't interpret). Resolution belongs to the human at the C9 portal gate
 *     (the #3 design lesson: unresolved conflict escalates to a person).
 *
 * FAIL-SAFE POSTURE (over-flag; under-triage outranks over-triage):
 *   - Positions are compared only after CONSERVATIVE normalisation (trim,
 *     lowercase, collapse whitespace). Any residual difference on the same
 *     topic is a CONFLICT — the audit never judges two different positions
 *     "close enough".
 *   - A panel of fewer than two opinions is INSUFFICIENT_PANEL / unassessable:
 *     a single expert is never presented as consensus.
 *   - A duplicate expert_id throws up front (a panel that is not independent is
 *     rejected, never part-audited — the sequencer's malformed-plan rule).
 *   - A topic asserted by only one expert is 'single_source': surfaced as
 *     uncorroborated, neither consensus nor conflict.
 *
 * Deterministic: same input → same record (audit_id is derived from a SHA-256
 * of the canonicalised input, so a past audit can be re-derived and checked;
 * only generated_at_utc varies between runs). Pure: no network, no filesystem,
 * no LLM — this sits entirely on the deterministic side of Trust Boundary 1.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

// ── Input contract ─────────────────────────────────────────────────────────────
const ClaimSchema = z
  .object({
    topic: z.string().min(1),
    position: z.string().min(1),
    confidence: z.enum(["low", "moderate", "high"]).optional(),
  })
  .strict();

export const ExpertOpinionSchema = z
  .object({
    expert_id: z.string().min(1),
    source: z.string().optional(),
    claims: z.array(ClaimSchema),
  })
  .strict();

const OpinionPanelSchema = z.array(ExpertOpinionSchema);

// ── Output contract (the structured conflict record) ──────────────────────────
const PositionEntrySchema = z
  .object({ expert_id: z.string().min(1), position: z.string().min(1) })
  .strict();

const TopicResultSchema = z
  .object({
    topic: z.string().min(1),
    coverage: z.number().int().min(1),
    status: z.enum(["agree", "conflict", "single_source"]),
    positions: z.array(PositionEntrySchema).min(1),
    distinct_positions: z.number().int().min(1),
  })
  .strict();

export const ConflictRecordSchema = z
  .object({
    audit_id: z.string().regex(/^conflict-[0-9a-f]{64}$/),
    question_ref: z.string().optional(),
    panel_size: z.number().int().min(0),
    experts: z.array(z.string().min(1)),
    topics: z.array(TopicResultSchema),
    conflicts_unresolved: z.number().int().min(0),
    unanimous: z.boolean(),
    status: z.enum(["CONSENSUS", "CONFLICT", "INSUFFICIENT_PANEL"]),
    trust_signal: z.enum(["consensus", "conflict_flagged", "unassessable"]),
    generated_at_utc: z.string(),
  })
  .strict();

/** Conservative position/topic normalisation — the ONLY equivalence the audit
 *  applies. Anything that still differs after this is a conflict. */
function normalise(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

/** Canonicalise the audit input for the deterministic audit_id: opinions and
 *  claims sorted, so caller ordering never changes the id. */
function canonicalInput(opinions, questionRef) {
  const canon = opinions
    .map((o) => ({
      expert_id: o.expert_id,
      claims: [...o.claims]
        .map((c) => ({ topic: normalise(c.topic), position: normalise(c.position) }))
        .sort((a, b) => a.topic.localeCompare(b.topic) || a.position.localeCompare(b.position)),
    }))
    .sort((a, b) => a.expert_id.localeCompare(b.expert_id));
  return JSON.stringify({ question_ref: questionRef ?? null, opinions: canon });
}

/**
 * Run the parallel-expert conflict audit over N independent opinions.
 * Pure and deterministic (only generated_at_utc varies between runs).
 *
 * @param {Array<{expert_id: string, source?: string, claims: Array<{topic: string, position: string, confidence?: string}>}>} opinions
 * @param {{ question_ref?: string }} [options]
 * @returns {import("zod").infer<typeof ConflictRecordSchema>} zod-validated ConflictRecord
 * @throws on a malformed panel or a duplicate expert_id (never part-audits)
 */
export function runConflictAudit(opinions, options = {}) {
  const panel = OpinionPanelSchema.parse(opinions ?? []);

  // Independence gate: the same expert twice is not a panel — reject up front.
  const ids = new Set();
  for (const o of panel) {
    if (ids.has(o.expert_id)) {
      throw new Error(`conflict-audit: duplicate expert_id "${o.expert_id}" — a panel must be independent opinions; rejected (fail-safe)`);
    }
    ids.add(o.expert_id);
  }

  const experts = [...ids].sort((a, b) => a.localeCompare(b));

  // Group stated positions by normalised topic. Within one expert, multiple
  // claims on the same topic are all counted (an expert who contradicts
  // themselves creates distinct positions — a conflict, the safe reading).
  const byTopic = new Map();
  for (const o of panel) {
    for (const c of o.claims) {
      const key = normalise(c.topic);
      if (!byTopic.has(key)) byTopic.set(key, []);
      byTopic.get(key).push({ expert_id: o.expert_id, position: c.position });
    }
  }

  const topics = [...byTopic.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([topic, positions]) => {
      const sorted = [...positions].sort(
        (a, b) => a.expert_id.localeCompare(b.expert_id) || a.position.localeCompare(b.position)
      );
      const distinct = new Set(sorted.map((p) => normalise(p.position)));
      const coverage = new Set(sorted.map((p) => p.expert_id)).size;
      // Over-flag: any residual difference = conflict, regardless of coverage.
      const status = distinct.size > 1 ? "conflict" : coverage === 1 ? "single_source" : "agree";
      return { topic, coverage, status, positions: sorted, distinct_positions: distinct.size };
    });

  const conflicts = topics.filter((t) => t.status === "conflict").length;
  const insufficient = panel.length < 2;
  const status = insufficient ? "INSUFFICIENT_PANEL" : conflicts > 0 ? "CONFLICT" : "CONSENSUS";
  const trust_signal = insufficient ? "unassessable" : conflicts > 0 ? "conflict_flagged" : "consensus";
  // Unanimous = every topic agreed with the FULL panel behind it (no partial
  // coverage, no single-source assertions) — the strongest consensus claim.
  const unanimous =
    !insufficient && topics.length > 0 && topics.every((t) => t.status === "agree" && t.coverage === panel.length);

  const audit_id = "conflict-" + createHash("sha256").update(canonicalInput(panel, options.question_ref), "utf8").digest("hex");

  return ConflictRecordSchema.parse({
    audit_id,
    ...(options.question_ref !== undefined ? { question_ref: options.question_ref } : {}),
    panel_size: panel.length,
    experts,
    topics,
    conflicts_unresolved: conflicts,
    unanimous,
    status,
    trust_signal,
    generated_at_utc: new Date().toISOString(),
  });
}

/**
 * ADDITIVE composition — attach a conflict record to a verification result so
 * the verifier/sequencer (and the report/evidence tree) can READ the signal.
 *
 * NOT a gate, by construction (the H6 monotonicity proof):
 *   - `pass`, `results`, `candidate_output_hash` are copied VERBATIM — this
 *     function cannot flip fail→pass OR pass→fail; the five frozen verifier
 *     checks stay the only mechanical gate (plus the monotone detectors).
 *   - firewall fields (`firewall_status`, `continuation_blocked`) are neither
 *     read nor written — a HARD_FAIL / BLOCKED_NO_PROOF cannot be overridden.
 *   - `missing_receipts` is APPEND-ONLY: an unresolved conflict adds one
 *     surfacing line so the disagreement reaches the report + evidence tree
 *     with zero schema churn (the H2 integrity-detectors channel).
 *   - the structured record rides the in-memory `conflict_audit` field, which
 *     the named-field report builders (run.js / trunk-pipeline.js) never pass
 *     to validateReport() — it cannot break the .strict() report gate (same
 *     mechanism as `integrity_detectors`).
 *
 * @param {{pass:boolean, results:Array, missing_receipts:string[], candidate_output_hash:string}} verification
 *        a verify()/combineVerification()-shaped result (extra fields preserved)
 * @param {object} conflictRecord  a ConflictRecord from runConflictAudit()
 * @returns {object} same shape as `verification`, plus `conflict_audit`; the
 *          only mutation is an appended missing_receipts line on CONFLICT.
 */
export function attachConflictAudit(verification, conflictRecord) {
  const record = ConflictRecordSchema.parse(conflictRecord);

  const surfaced = [];
  if (record.status === "CONFLICT") {
    const topicsInConflict = record.topics
      .filter((t) => t.status === "conflict")
      .map((t) => t.topic)
      .join(", ");
    surfaced.push(
      `conflict-audit [${record.audit_id}]: ${record.conflicts_unresolved} unresolved expert conflict(s) on: ${topicsInConflict} — flagged for clinician review (trust signal only; gate unchanged)`
    );
  }

  return {
    ...verification,
    // Verbatim gate fields — the audit is a signal, never a gate.
    pass: verification.pass,
    results: verification.results,
    candidate_output_hash: verification.candidate_output_hash,
    // Append-only surfacing into the medicolegal record (no schema churn).
    missing_receipts: [...(verification.missing_receipts || []), ...surfaced],
    // Structured signal for callers (in-memory; never written to the report by
    // the named-field builders).
    conflict_audit: record,
  };
}
