/**
 * 5-step grounding pipeline runner (stub or live MCP retrieval).
 * When HEYDOC_USE_MCP=1, spawns docs and identity-au MCP servers and collects real receipts.
 * Otherwise uses stub retrieval. Produces context packet and runs verifier.
 */
import { verify } from "./verifier.js";
import { retrieveViaMcp } from "./retrieval-mcp.js";

/**
 * Stub routing: return a GroundingPlan.
 */
function routing(_userInput, _trunk) {
  return {
    needs_static_docs: ["Choosing Wisely", "red-flag questions"],
    needs_live_calls: ["IHI", "terminology"],
    needs_structured_kg: [],
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
    receipts.push({ kind: "live_data", request_id: "term-mock-1", upstream: "terminology" });
  }
  return receipts;
}

/**
 * Build context packet from plan and receipts.
 */
function contextInjection(plan, receipts) {
  const evidence = receipts.map((r, i) => ({
    id: `ev-${i + 1}`,
    claim: r.kind === "static_doc" ? "Guideline citation" : "Operational fact",
    supports: [{ kind: r.kind === "static_doc" ? "static_doc" : "live_data_receipt", ref: r.citation_id || r.request_id }],
    provenance: { created_at_utc: new Date().toISOString(), created_by: "pipeline-stub", verification: { status: "verified" } },
  }));
  return {
    facts: [],
    evidence,
    constraints: ["no diagnosis", "no dosages"],
    receipts,
  };
}

/**
 * Run the full pipeline and verification.
 * @param {{ user_input?: string, trunk?: string, candidate_output?: string, use_mcp?: boolean }} options
 * @returns {Promise<{{ plan, packet, output, verification, run_id, timestamp_utc }}>}
 */
export async function runPipeline(options = {}) {
  const user_input = options.user_input ?? "Patient reports lower back pain.";
  const trunk = options.trunk ?? "5.0";
  const candidate_output = options.candidate_output ?? stubGenerationOutput();
  const useMcp = options.use_mcp ?? (process.env.HEYDOC_USE_MCP === "1" || process.env.HEYDOC_USE_MCP === "true");

  const run_id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const timestamp_utc = new Date().toISOString();

  const plan = routing(user_input, trunk);
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
  const packet = contextInjection(plan, receipts);

  const citations = receipts.filter((r) => r.kind === "static_doc").map((r) => r.citation_id);
  const terminologyReceipts = receipts.filter((r) => r.kind === "live_data" && (r.upstream === "terminology" || r.upstream?.includes("terminology"))).map((r) => r.request_id);
  const liveReceipts = receipts.filter((r) => r.kind === "live_data").map((r) => r.request_id);

  const verification = verify(candidate_output, {
    citations,
    terminology_receipts: terminologyReceipts,
    live_receipts: liveReceipts,
    hard_stop_receipt: undefined,
  });

  return {
    run_id,
    timestamp_utc,
    plan,
    packet,
    output: candidate_output,
    verification,
  };
}

function stubGenerationOutput() {
  return `Based on the provided context (citation: cw-au:imaging-lbp:2024-01), we do not recommend imaging for non-specific low back pain without red flags. No diagnosis or dosages are given.`;
}
