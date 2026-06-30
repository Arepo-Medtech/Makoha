/**
 * 5-step grounding pipeline runner (stub or live MCP retrieval).
 * When HEYDOC_USE_MCP=1, spawns docs and identity-au MCP servers and collects real receipts.
 * Otherwise uses stub retrieval. Produces context packet and runs verifier.
 */
import { verify } from "./verifier.js";
import { retrieveViaMcp } from "./retrieval-mcp.js";
import { validateGroundingPlan, validateContextPacket } from "./pipeline-schemas.js";
import { sanitiseInvestigation } from "./investigation-parser.js";
import { runPharmCheck } from "../mcp/servers/pharmacology/engine.js";

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
  const candidate_output = options.candidate_output ?? stubGenerationOutput();
  const useMcp = options.use_mcp ?? (process.env.HEYDOC_USE_MCP === "1" || process.env.HEYDOC_USE_MCP === "true");

  const run_id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const timestamp_utc = new Date().toISOString();
  // Effective run mode (mock by default per HEYDOC_MODE_DEFAULT).
  const context_mode = process.env.HEYDOC_MODE_DEFAULT || "mock";

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

  // Step 3 — Context injection. Gate the ContextPacket before generation sees it.
  const packet = validateContextPacket(contextInjection(plan, receipts, { run_id, trunk_id: trunk, mode: context_mode, raw_investigations: options.raw_investigations }));

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

  const verification = verify(candidate_output, {
    citations,
    terminology_receipts: terminologyReceipts,
    terminology,
    live_receipts: liveReceipts,
    hard_stop_receipt: hardStopReceipt,
    context_mode,
    receipt_modes,
  });

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
  };
}

function stubGenerationOutput() {
  return `Based on the provided context (citation: cw-au:imaging-lbp:2024-01), we do not recommend imaging for non-specific low back pain without red flags. No diagnosis or dosages are given.`;
}
