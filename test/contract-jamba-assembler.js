/**
 * Contract test for MI-15 — Jamba long-context assembler (execution plan §2.2/§5).
 *
 * Asserts the bounding is safe: within budget with LOGGED drops; safety constraints
 * never dropped; a kept fact keeps its grounding receipt/evidence even over budget;
 * no fact is invented; deterministic; patient history folded in; and the packet-only
 * bar + firewall still hold (an unsafe input THROWS, never laundered).
 * Run from repo root: node test/contract-jamba-assembler.js
 */
import { assembleBoundedPacket, estimateTokens, jambaModelAvailable } from "../models/jamba/assembler.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const now = () => 1_700_000_000_000;

const fact = (fact_id, category, label, value, extra = {}) => ({ fact_id, category, label, value, ...extra });
const receipt = (request_id) => ({ request_id, timestamp_utc: "2026-07-13T00:00:00Z", upstream: "PubMed", mode: "mock" });
const evidenceNode = (id, ref) => ({ id, claim: "c", supports: [{ kind: "live_data_receipt", ref }], provenance: { created_at_utc: "2026-07-13T00:00:00Z", created_by: "broker", verification: { status: "verified" } } });
const CONSTRAINTS = ["no diagnosis", "no dosages"];

// A) Big budget — everything kept, nothing dropped, packet valid, constraints intact.
{
  const input = { facts: [fact("f-neg", "pertinent_negative", "no fever", "denies fever"), fact("f-sym", "symptom", "chest pain", "central 2h"), fact("f-demo", "demographic", "age", "54")], evidence: [], constraints: CONSTRAINTS, receipts: [] };
  const r = assembleBoundedPacket(input, { budgetTokens: 100000, now });
  expect(r.packet.facts.length === 3 && r.dropped.length === 0, "A: big budget keeps all facts, drops none");
  expect(r.within_budget === true, "A: within_budget true");
  expect(r.packet.constraints.length === 2, "A: constraints intact");
}

// B) Tight budget — lowest-priority facts dropped (logged); high-priority + constraints kept.
{
  const fNeg = fact("f-neg", "pertinent_negative", "no fever", "denies fever");
  const fSym = fact("f-sym", "symptom", "chest pain", "central 2h");
  const fSoc = fact("f-soc", "social_history", "smoker", "ex-smoker");
  const fDemo = fact("f-demo", "demographic", "age", "54");
  const floor = estimateTokens({ constraints: CONSTRAINTS });
  const budgetTokens = floor + estimateTokens(fNeg) + estimateTokens(fSym) + 1; // room for the two top-priority only
  const r = assembleBoundedPacket({ facts: [fDemo, fSoc, fSym, fNeg], constraints: CONSTRAINTS, evidence: [], receipts: [] }, { budgetTokens, now });
  const keptIds = r.packet.facts.map((f) => f.fact_id);
  expect(keptIds.includes("f-neg") && keptIds.includes("f-sym"), "B: high-priority facts kept");
  expect(!keptIds.includes("f-demo") && !keptIds.includes("f-soc"), "B: low-priority facts dropped");
  expect(r.dropped.length === 2 && r.dropped.every((d) => d.reason === "context_budget"), "B: drops logged with reason (no silent cap)");
  expect(r.packet.constraints.length === 2, "B: constraints NEVER dropped");
  expect(!r.dropped.some((d) => d.kind === "constraint"), "B: no constraint appears in dropped");
}

// C) Grounding integrity — a kept fact keeps its receipt + evidence even over budget.
{
  const grounded = fact("f-g", "symptom", "finding", "y", { receipt_id: "eb-000001-aaaaaaa", evidence_node_id: "en-1" });
  // Budget fits the constraints floor + the fact, but NOT the receipt/evidence — which
  // must still be force-kept (grounding integrity beats budget).
  const budgetTokens = estimateTokens({ constraints: CONSTRAINTS }) + estimateTokens(grounded);
  const r = assembleBoundedPacket({ facts: [grounded], receipts: [receipt("eb-000001-aaaaaaa")], evidence: [evidenceNode("en-1", "eb-000001-aaaaaaa")], constraints: CONSTRAINTS }, { budgetTokens, now });
  expect(r.packet.facts.some((f) => f.fact_id === "f-g"), "C: high-priority grounded fact kept");
  expect(r.packet.receipts.some((x) => x.request_id === "eb-000001-aaaaaaa"), "C: referenced receipt kept even over budget");
  expect(r.packet.evidence.some((e) => e.id === "en-1"), "C: referenced evidence kept even over budget");
  expect(r.within_budget === false, "C: honest — over budget reported when grounding forces it");
}

// D) Never invents a fact — every kept fact_id came from the input.
{
  const inIds = new Set(["a", "b", "c"]);
  const r = assembleBoundedPacket({ facts: [fact("a", "symptom", "s", "1"), fact("b", "vital_sign", "v", "2"), fact("c", "demographic", "d", "3")], constraints: CONSTRAINTS, evidence: [], receipts: [] }, { budgetTokens: 100000, now });
  expect(r.packet.facts.every((f) => inIds.has(f.fact_id)), "D: no invented facts");
}

// E) Firewall preserved — unsafe inputs THROW, are never laundered into a smaller packet.
{
  let threwProvenance = false;
  try { assembleBoundedPacket({ facts: [fact("l", "lab_result", "K", "5.2", { provenance: "patient_reported" })], constraints: CONSTRAINTS, evidence: [], receipts: [] }, { budgetTokens: 100000, now }); } catch { threwProvenance = true; }
  expect(threwProvenance, "E: patient-provenance lab_result THROWS (firewall)");

  let threwRawNum = false;
  try { assembleBoundedPacket({ facts: [fact("l", "lab_result", "K", "5.2")], constraints: CONSTRAINTS, evidence: [], receipts: [] }, { budgetTokens: 100000, now }); } catch { threwRawNum = true; }
  expect(threwRawNum, "E: unsanitised numeric lab_result THROWS (firewall)");

  // A properly sanitised lab_result is allowed through.
  const okLab = assembleBoundedPacket({ facts: [fact("l", "lab_result", "K", "within normal range", { sanitised_by: "investigation-parser" })], constraints: CONSTRAINTS, evidence: [], receipts: [] }, { budgetTokens: 100000, now });
  expect(okLab.packet.facts.length === 1, "E: sanitised lab_result passes");
}

// F) Deterministic — same input twice yields the same kept order.
{
  const mk = () => ({ facts: [fact("a", "demographic", "d", "1"), fact("b", "symptom", "s", "2"), fact("c", "pertinent_negative", "n", "3")], constraints: CONSTRAINTS, evidence: [], receipts: [] });
  const r1 = assembleBoundedPacket(mk(), { budgetTokens: 100000, now });
  const r2 = assembleBoundedPacket(mk(), { budgetTokens: 100000, now });
  expect(JSON.stringify(r1.packet.facts.map((f) => f.fact_id)) === JSON.stringify(r2.packet.facts.map((f) => f.fact_id)), "F: deterministic kept order");
}

// G) Patient history folded into the packet facts.
{
  const r = assembleBoundedPacket({ facts: [fact("s", "symptom", "s", "1")], history: [fact("h1", "past_history", "HTN", "hypertension")], constraints: CONSTRAINTS, evidence: [], receipts: [] }, { budgetTokens: 100000, now });
  expect(r.packet.facts.some((f) => f.fact_id === "h1"), "G: history folded into packet");
}

// H) Jamba model seam is input-gated (deterministic assembler is the wired path).
expect(jambaModelAvailable({}).available === false, "H: Jamba model unavailable by default");
expect(jambaModelAvailable({ HEYDOC_JAMBA_ENDPOINT: "https://jamba/v1" }).available === true, "H: configured endpoint → available");

if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-15 jamba-assembler FAIL (${errors.length})`); process.exit(1); }
console.log("MI-15 jamba-assembler PASS");
process.exit(0);
