/**
 * Contract tests for the pipeline-edge validators (verification/pipeline-schemas.js):
 * GroundingPlan, ContextPacket, EvidenceNode, Receipt. Asserts conformant data is
 * accepted and malformed data (missing required, extra key, bad nested shape) is
 * rejected — including a receipt carrying validated_codes, which must be stripped
 * before a receipt enters the packet.
 * Run from repo root: node test/contract-pipeline.js
 */
import { validateGroundingPlan, validateContextPacket } from "../verification/pipeline-schemas.js";

const errors = [];
const ok = (label, fn) => {
  try {
    fn();
  } catch (e) {
    errors.push(`${label}: expected accept, got reject — ${e.message.slice(0, 80)}`);
  }
};
const no = (label, fn) => {
  try {
    fn();
    errors.push(`${label}: expected reject, got accept`);
  } catch (_) {
    /* expected */
  }
};

const plan = () => ({ needs_static_docs: ["Choosing Wisely"], needs_live_calls: ["terminology"], needs_structured_kg: [] });
const receipt = () => ({ request_id: "id-mock-1", timestamp_utc: new Date().toISOString(), upstream: "terminology", mode: "mock" });
const node = () => ({
  id: "ev-1",
  claim: "Guideline citation",
  supports: [{ kind: "static_doc", ref: "cw-au:imaging-lbp:2024-01" }],
  provenance: { created_at_utc: new Date().toISOString(), created_by: "pipeline", verification: { status: "verified" } },
});
const packet = () => ({ facts: [], evidence: [node()], constraints: ["no diagnosis"], receipts: [receipt()] });

// GroundingPlan
ok("plan: conformant", () => validateGroundingPlan(plan()));
no("plan: missing required field", () => { const { needs_structured_kg, ...p } = plan(); validateGroundingPlan(p); });
no("plan: extra key (strict)", () => validateGroundingPlan({ ...plan(), bogus: 1 }));

// ContextPacket
ok("packet: conformant", () => validateContextPacket(packet()));
no("packet: missing required array", () => { const { receipts, ...p } = packet(); validateContextPacket(p); });
no("packet: receipt missing timestamp_utc", () => validateContextPacket({ ...packet(), receipts: [{ request_id: "id-mock-1", upstream: "terminology", mode: "mock" }] }));
no("packet: receipt with validated_codes (must be stripped)", () => validateContextPacket({ ...packet(), receipts: [{ ...receipt(), validated_codes: ["279039003"] }] }));
no("packet: evidence node missing provenance", () => { const n = node(); delete n.provenance; validateContextPacket({ ...packet(), evidence: [n] }); });
no("packet: evidence support missing ref", () => { const n = node(); n.supports = [{ kind: "static_doc" }]; validateContextPacket({ ...packet(), evidence: [n] }); });

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-pipeline: OK");
