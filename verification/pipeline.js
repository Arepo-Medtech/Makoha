/**
 * 5-step grounding pipeline runner (stub or live MCP retrieval).
 * When HEYDOC_USE_MCP=1, spawns docs and identity-au MCP servers and collects real receipts.
 * Otherwise uses stub retrieval. Produces context packet and runs verifier.
 */
import { verify } from "./verifier.js";
import { runDetectors, combineVerification } from "./integrity-detectors/index.js";
import { retrieveViaMcp, retrieveFhirObservations } from "./retrieval-mcp.js";
import { validateGroundingPlan, validateContextPacket } from "./pipeline-schemas.js";
import { sanitiseInvestigation } from "./investigation-parser.js";
import { normaliseMode } from "./mode.js";
import { contextAllowList, injectableFacts, factProvenance } from "./context-allowlist.js";
import { EvidenceNodeSchema } from "./pipeline-schemas.js";
import { omnibusDatasetReceipt } from "./omnibus.js";
import { tagConsultFacts, sensitivityWarnings } from "./consult-tagger.js";
import { buildEncounterHistorySummary } from "./history-summary.js";
import { runPharmCheck } from "../mcp/servers/pharmacology/engine.js";
import { gradeConcern, composeTriage, buildAbcdeRecord } from "./ppp-ttt/index.js";

/**
 * Stub routing: return a GroundingPlan.
 */
function routing(_userInput, trunk) {
  // Curated knowledge datasets each trunk needs (knowledge server kg_query).
  const kgByTrunk = { "5.0": ["axis-b-templates"], "7.0": ["benign-registry"], "9.0": ["redflags-bank"] };
  return {
    needs_static_docs: ["Choosing Wisely", "red-flag questions"],
    needs_live_calls: ["IHI", "terminology"],
    needs_structured_kg: kgByTrunk[trunk] || [],
    needs_fhir_reads: trunk === "6.0" ? ["Observation"] : [],
    trunk_id: trunk,
  };
}

/**
 * Stub retrieval: return mock receipts for contract testing.
 */
function retrievalStub(plan) {
  const receipts = [];
  if (plan.needs_static_docs?.length) {
    receipts.push({ kind: "static_doc", ref: "cw-au:imaging-lbp:2024-01", citation_id: "cw-au:imaging-lbp:2024-01" });
  }
  if (plan.needs_live_calls?.length) {
    receipts.push({ kind: "live_data", request_id: "id-mock-ihi-1", upstream: "heydoc-mcp-identity-au" });
    // Mock terminology receipt declares the code it validated (matches the mock
    // terminology server's SNOMED concept), so legitimately-looked-up codes bind.
    receipts.push({ kind: "live_data", request_id: "term-mock-1", upstream: "terminology", mode: "mock", validated_codes: ["279039003"] });
  }
  for (const name of plan.needs_structured_kg || []) {
    // Curated dataset proof (structured_dataset) — not a live Receipt; flows into
    // evidence as a structured_dataset support, not into packet.receipts.
    receipts.push({ kind: "structured_dataset", ref: `${name}:v0.1.0-dev`, request_id: `kg-mock-${name}`, upstream: "knowledge", mode: "mock" });
  }
  return receipts;
}

/**
 * Build a schema-conformant ContextPacket from the plan and raw retrieval receipts.
 *
 * Contract distinctions enforced here (context-packet.schema.json):
 *   - receipts[] holds ONLY true Receipts (live tool calls), cleaned to the
 *     receipt.schema shape (request_id/timestamp_utc/upstream/mode) — the binding
 *     aid `validated_codes` and the internal `kind` tag are dropped.
 *   - static_doc citations are NOT receipts; they are represented as EvidenceNode
 *     supports (kind "static_doc", ref = citation_id).
 */
function contextInjection(plan, receipts, meta = {}) {
  const now = new Date().toISOString();
  const mode = meta.mode || "mock";

  const supportKind = (r) => (r.kind === "static_doc" ? "static_doc" : r.kind === "structured_dataset" ? "structured_dataset" : "live_data_receipt");
  const claimFor = (r) => (r.kind === "static_doc" ? "Guideline citation" : r.kind === "structured_dataset" ? "Curated dataset" : "Operational fact");
  const evidence = receipts.map((r, i) => ({
    id: `ev-${i + 1}`,
    claim: claimFor(r),
    supports: [{ kind: supportKind(r), ref: r.citation_id || r.ref || r.request_id }],
    provenance: { created_at_utc: now, created_by: "pipeline-stub", verification: { status: "verified" } },
  }));

  const receiptsClean = receipts
    .filter((r) => r.kind === "live_data")
    .map((r) => {
      const src = r.receipt || r;
      return {
        request_id: src.request_id || r.request_id,
        timestamp_utc: src.timestamp_utc || now,
        upstream: src.upstream || r.upstream || "stub",
        mode: src.mode || r.mode || mode,
      };
    });

  // Raw investigation results are NEVER placed in the packet directly — each is
  // run through the deterministic parser first, so only the sanitised (no-raw-
  // number) lab_result fact reaches the trunk. There is no live lab source yet
  // (fhir-broker unbuilt); callers/tests supply raw_investigations.
  const facts = (meta.raw_investigations || []).map((raw) => sanitiseInvestigation(raw).fact);

  // Case content is DEFAULT-DENY firewalled (C7/F9): any case-derived content a
  // caller supplies goes through the field-scoped allow-list mirroring the
  // cases:ingest firewall. Sealed scoring nodes (10–13) make it THROW — packet
  // assembly halts. Only packet-channel allow-listed fields become facts;
  // sim/scorer metadata and simulator dialogue material never enter the packet.
  if (meta.case_content) {
    facts.push(...injectableFacts(contextAllowList(meta.case_content)));
  }

  return {
    facts,
    evidence,
    constraints: ["no diagnosis", "no dosages"],
    receipts: receiptsClean,
    run_id: meta.run_id,
    trunk_id: meta.trunk_id,
    assembled_at_utc: now,
    mode,
  };
}

/**
 * Run the full pipeline and verification.
 * @param {{ user_input?: string, trunk?: string, candidate_output?: string, use_mcp?: boolean, raw_investigations?: Array<{loinc?: string, analyte?: string, value: number, unit?: string}> }} options
 * @returns {Promise<{{ plan, packet, output, verification, run_id, timestamp_utc }}>}
 */
export async function runPipeline(options = {}) {
  const user_input = options.user_input ?? "Patient reports lower back pain.";
  const trunk = options.trunk ?? "5.0";
  // Step-4 candidate: caller-supplied text, else the generation hook (below,
  // AFTER the packet is sealed — generation may only ever see the packet),
  // else the deterministic stub (status quo).
  let candidate_output = options.candidate_output;
  const useMcp = options.use_mcp ?? (process.env.HEYDOC_USE_MCP === "1" || process.env.HEYDOC_USE_MCP === "true");

  const run_id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const timestamp_utc = new Date().toISOString();
  // Effective run mode, normalised from HEYDOC_MODE_DEFAULT (C16/F4): env names
  // staging/production map to "live" so mock proof is BLOCKED outside dev, and an
  // unrecognised mode default-denies to "live". Keeps context_mode enum-valid for
  // the packet, verifier, and ledger contracts.
  const context_mode = normaliseMode(process.env.HEYDOC_MODE_DEFAULT).context_mode;

  // Step 1 — Routing. Gate the GroundingPlan before retrieval acts on it.
  const plan = validateGroundingPlan(routing(user_input, trunk));
  let receipts;
  try {
    if (useMcp) {
      receipts = await retrieveViaMcp(plan);
      if (!receipts.length) receipts = retrievalStub(plan);
    } else {
      receipts = retrievalStub(plan);
    }
  } catch (err) {
    if (useMcp) process.stderr?.write?.("MCP retrieval failed, using stub: " + err.message + "\n");
    receipts = retrievalStub(plan);
  }
  // Pharmacology firewall (Trunk 8.0). Runs the deterministic check in-process and
  // gates continuation. A HARD_FAIL blocks continuation UNCONDITIONALLY (no override
  // path) and is receipt-backed; BLOCKED_NO_PROOF also blocks (cannot prescribe
  // without proof). The PharmCheck receipt is added to receipts so it flows to the
  // packet + ledger, and is the hard_stop_receipt that lets the verifier tell a
  // legitimate (receipt-backed) HARD_FAIL from an invented one.
  let firewall_status;
  let continuation_blocked = false;
  let hard_stops = [];
  let hardStopReceipt;
  if (options.pharm_intent) {
    const pc = runPharmCheck(options.pharm_intent, options.resolved_facts || {});
    firewall_status = pc.status;
    receipts.push({ kind: "live_data", request_id: pc.receipt.request_id, upstream: pc.receipt.upstream, mode: pc.receipt.mode, receipt: pc.receipt });
    if (firewall_status === "HARD_FAIL") {
      hardStopReceipt = pc.receipt.request_id;
      hard_stops = [`HARD_FAIL: pharmacology firewall (${pc.check_id}) blocked continuation — ${pc.flags.map((f) => f.flag_type).join(", ") || "unsafe"}`];
    }
    continuation_blocked = firewall_status === "HARD_FAIL" || firewall_status === "BLOCKED_NO_PROOF";
  } else if (trunk === "8.0") {
    // Firewall trunk with no intent supplied -> cannot run the check -> blocked.
    firewall_status = "BLOCKED_NO_PROOF";
    continuation_blocked = true;
  }

  // Live(-ish) lab source: on the MCP path, fetch fhir Observations and feed their
  // RAW values into the investigation parser (via raw_investigations) — the raw
  // number is never placed in the packet directly.
  let rawInvestigations = options.raw_investigations || [];
  if (useMcp && (plan.needs_fhir_reads || []).includes("Observation")) {
    try {
      rawInvestigations = [...rawInvestigations, ...(await retrieveFhirObservations(plan))];
    } catch (err) {
      process.stderr?.write?.("fhir observation retrieval failed: " + err.message + "\n");
    }
  }

  // Step 3 — Context injection. Gate the ContextPacket before generation sees it.
  const packet = validateContextPacket(contextInjection(plan, receipts, { run_id, trunk_id: trunk, mode: context_mode, raw_investigations: rawInvestigations, case_content: options.case_content }));

  // Step 4 — Generation (LIVE_PLAN L3). The hook receives ONLY the sealed
  // packet — the packet-only bar is the calling convention here AND the
  // adapter's own re-gate. A failed/refused generation FAILS CLOSED: the
  // candidate becomes an explicit blocked notice and continuation is blocked
  // (a missing draft is a blocked status, never a fabricated one). With no
  // hook and no caller text, the deterministic stub runs (status quo).
  let generation = null;
  if (candidate_output === undefined && options.generate_candidate) {
    const gen = await options.generate_candidate(packet);
    generation = { ok: gen.ok, ...(gen.audit || {}), ...(gen.ok ? {} : { status: gen.status, reason: gen.reason }) };
    if (gen.ok) {
      candidate_output = gen.candidate_output;
    } else {
      candidate_output = `Generation blocked (BLOCKED_NO_PROOF): ${gen.reason || "no candidate produced"}. This encounter requires clinician escalation. No diagnosis or dosages are given.`;
      continuation_blocked = true;
    }
  }
  if (candidate_output === undefined) candidate_output = stubGenerationOutput();

  // AUDIT CHANNEL — omnibus fact provenance + consult tagging. Everything in
  // this block rides on the RESULT (ledger / scorer / evidence_tree), never on
  // the packet: the LLM-visible ContextPacket above is byte-identical whether
  // this block runs or not (operator ruling 2026-07-11). Paths are proven
  // against the pinned omnibus (spoiler paths throw, unresolvable withhold);
  // taxonomy tags are deterministic and advisory; sensitive-tier facts get a
  // withheld marker instead of tags (default-deny on this new path).
  let fact_provenance = null;
  if (options.case_content) {
    const cls = contextAllowList(options.case_content);
    const provenance = factProvenance(cls);
    const caseFacts = injectableFacts(cls);
    const tags = tagConsultFacts(caseFacts);
    const now = new Date().toISOString();
    const receipt = omnibusDatasetReceipt();
    const evidence = provenance.map((p, i) => {
      const tagged = tags[i];
      return EvidenceNodeSchema.parse({
        id: `prov-${p.fact_id}`,
        claim: `Case fact provenance: ${p.label}${p.fhir_path ? ` ← ${p.fhir_path}` : " (no proven omnibus anchor — withheld)"}`,
        supports: [{ kind: "structured_dataset", ref: receipt.ref }],
        provenance: { created_at_utc: now, created_by: "context-allowlist/factProvenance", verification: { status: "verified" } },
        ...(p.fhir_path ? { fhir_path: p.fhir_path } : {}),
        ...(tagged.taxonomy_tags?.length ? { taxonomy_tags: tagged.taxonomy_tags } : {}),
      });
    });
    fact_provenance = {
      dataset_receipt: receipt,
      evidence,
      tag_withheld: tags.filter((t) => t.withheld),
    };
  }

  // Encounter history summary (HIST-3): the clinician-facing digest of the
  // patient's self-disclosed history + offered vitals, assembled from the
  // patient-provenance packet facts + the audit-channel provenance above.
  // Encounter-scoped, memory-only, schema-gated, hashed. NEVER injected into
  // the packet — it is portal/audit material, not trunk context.
  const history_summary = fact_provenance
    ? buildEncounterHistorySummary({ packet, fact_provenance, run_id })
    : null;

  // Warn-only sensitivity observability over ALL packet facts (existing paths
  // included): structured log + counter, never a gate change. Promotion to
  // blocking is a later, separately-gated step.
  const sensitivity_warnings = sensitivityWarnings(packet.facts);
  if (sensitivity_warnings.length) {
    process.stderr?.write?.(JSON.stringify({ event: "sensitive_field_tier_warning", run_id, trunk_id: trunk, warnings: sensitivity_warnings }) + "\n");
  }

  const citations = receipts.filter((r) => r.kind === "static_doc").map((r) => r.citation_id);
  const terminologyRaw = receipts.filter((r) => r.kind === "live_data" && (r.upstream === "terminology" || r.upstream?.includes("terminology")));
  const terminologyReceipts = terminologyRaw.map((r) => r.request_id);
  // Per-code binding evidence: each terminology receipt's validated codes + mode.
  const terminology = terminologyRaw.map((r) => ({
    request_id: r.request_id,
    codes: r.validated_codes || (r.receipt && r.receipt.validated_codes) || [],
    mode: (r.receipt && r.receipt.mode) || r.mode || "mock",
  }));
  const liveReceipts = receipts.filter((r) => r.kind === "live_data").map((r) => r.request_id);

  // Per-receipt modes, so the verifier can flag mock receipts (and block them in a
  // non-mock context). context_mode computed above.
  const receipt_modes = receipts.map((r) => ({
    id: r.request_id || r.citation_id || r.ref,
    mode: (r.receipt && r.receipt.mode) || r.mode || context_mode,
  }));

  const evidence = {
    citations,
    terminology_receipts: terminologyReceipts,
    terminology,
    live_receipts: liveReceipts,
    hard_stop_receipt: hardStopReceipt,
    context_mode,
    receipt_modes,
  };
  // Step 5: the frozen verifier (C1) runs its five mechanical checks, then the
  // #8-pattern integrity detectors STRENGTHEN the gate via a monotone AND
  // (combineVerification). verifier.js is untouched; detectors can only add a
  // failure, never rescue one. `results` stays the five checks so the
  // VerificationReport contract is unchanged.
  let verification = combineVerification(
    verify(candidate_output, evidence),
    runDetectors(candidate_output, evidence)
  );

  // PPP-TTT graded triage (STOP/CAUTION/GO) — ADDITIVE, MONOTONE-AND, same
  // composition pattern as the detectors above: it can only ADD caution or
  // escalation (a STOP folds into pass:false and carries the escalate_now
  // token), never rescue or downgrade. Runs ONLY when a caller raises flags;
  // with no flags this block is a no-op and the pipeline is byte-identical to
  // its pre-PPP-TTT behaviour. The ABCDE record rides the AUDIT CHANNEL on the
  // result (like fact_provenance) — never the ContextPacket, which was sealed
  // above before this block runs. gradeConcern cannot throw (fail-closed STOP).
  let ppp_ttt = null;
  let abcde_record = null;
  if (options.raised_flags && options.raised_flags.length) {
    const triage = gradeConcern({
      flags: options.raised_flags,
      patient_answers: options.patient_answers,
      evidence: { citations, terminology_receipts: terminologyReceipts },
      abcde_input: options.abcde_input,
    });
    verification = composeTriage(verification, triage);
    ppp_ttt = verification.ppp_ttt;
    abcde_record = buildAbcdeRecord({
      run_id,
      trunk_id: trunk,
      candidate_output_hash: verification.candidate_output_hash,
      triage,
    });
  }

  return {
    run_id,
    timestamp_utc,
    plan,
    packet,
    output: candidate_output,
    verification,
    firewall_status,
    continuation_blocked,
    hard_stops,
    // Audit-channel omnibus enrichment (null when no case content): dataset
    // receipt + provenance EvidenceNodes (fhir_path, taxonomy_tags) + withheld
    // markers. Rides to the ledger/scorer; NEVER merged into the packet.
    fact_provenance,
    sensitivity_warnings,
    // Clinician-facing encounter history summary (null when no case content).
    // Portal/audit material only — never trunk context.
    history_summary,
    // PPP-TTT graded triage (null when no raised_flags): the composed verdict
    // (also on verification.ppp_ttt) + the self-describing, Digital-Tablet-
    // tagged ABCDE record. Audit channel only — never merged into the packet.
    ppp_ttt,
    abcde_record,
    // Step-4 generation audit (null when no generation hook ran): mode
    // (mock/live — never conflated), model id, prompt_sha256 (what the model
    // was shown), latency; on failure also status/reason. Medicolegal
    // reproducibility rides the audit channel, like everything else here.
    generation,
    // Terminology receipts WITH their validated codes — recorded in the ledger so a
    // later verify:rehash --reissue can faithfully re-bind codes (otherwise a
    // previously-passing coded output would be re-recorded as FAIL).
    terminology,
  };
}

function stubGenerationOutput() {
  return `Based on the provided context (citation: cw-au:imaging-lbp:2024-01), we do not recommend imaging for non-specific low back pain without red flags. No diagnosis or dosages are given.`;
}
