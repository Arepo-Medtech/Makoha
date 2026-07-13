/**
 * Contract test for MI-16 — imaging multimodal path, shipped dark (§6, E8).
 *
 * Asserts the pixel-interpretation branch is BUILT but cannot reach output:
 *   - flag OFF (default) or mis-set → `unknown` (E8 fail-safe);
 *   - flag ON but no endpoint → `unknown`;
 *   - flag ON + endpoint → a PROVISIONAL candidate (never a finding);
 *   - even a lit provisional candidate, routed through the Evidence Broker arbiter
 *     (MI-14), resolves to `unknown` — a pixel claim carries no literature receipt.
 * Run from repo root: node test/contract-imaging-dark.js
 */
import { interpretImage, multimodalEndpointAvailable, pixelDerivedClaim } from "../models/imaging/multimodal.js";
import { createEvidenceBroker } from "../mcp/servers/knowledge/broker.js";
import { arbitrateModelClaims } from "../integration/evidence-arbiter.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const FLAG = "HEYDOC_IMAGING_PIXEL_INTERPRETATION";
const EP = "HEYDOC_IMAGING_MULTIMODAL_ENDPOINT";

async function main() {
  // Default dark.
  const off = interpretImage({ request: { claim: "fracture visible" } }, { env: {} });
  expect(off.result === "unknown" && off.pixel_interpreted === false && off.flag === "OFF", "default OFF → unknown, no pixel interpretation (E8)");

  // Mis-set flag fails safe to OFF.
  for (const v of ["true", "1", "yes", "garbage", ""]) {
    const r = interpretImage({ request: { claim: "x" } }, { env: { [FLAG]: v } });
    expect(r.result === "unknown" && r.pixel_interpreted === false, `mis-set flag ${JSON.stringify(v)} → unknown (E8 fail-safe)`);
  }

  // Flag ON but no endpoint → unknown (fail-safe).
  const onNoEp = interpretImage({ request: { claim: "x" } }, { env: { [FLAG]: "ON" } });
  expect(onNoEp.result === "unknown" && onNoEp.flag === "ON", "ON but no endpoint → unknown");
  expect(multimodalEndpointAvailable({}).available === false, "endpoint input-gated (default unavailable)");

  // Flag ON + endpoint → provisional candidate (built path), never a finding.
  const lit = interpretImage({ request: { claim: "possible nodule", query_intent: "chest imaging" } }, { env: { [FLAG]: "ON", [EP]: "https://mm/v1" } });
  expect(lit.result === "provisional_candidate" && lit.pixel_interpreted === true && lit.requires_grounding === true, "ON + endpoint → provisional candidate, requires grounding");
  expect(lit.result !== "finding" && lit.claim === "possible nodule", "lit branch yields a candidate, not a direct finding");

  // The strongest E8 guarantee: even lit, a pixel claim routed through the arbiter → unknown.
  const broker = createEvidenceBroker();
  const arb = await arbitrateModelClaims({ claims: [pixelDerivedClaim(lit)], broker });
  expect(arb.grounded.length === 0 && arb.unknown.length === 1, "lit pixel claim through the arbiter → stripped to unknown (no literature receipt)");

  if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-16 imaging-dark FAIL (${errors.length})`); process.exit(1); }
  console.log("MI-16 imaging-dark PASS");
  process.exit(0);
}

main().catch((e) => { console.error("MI-16 imaging-dark ERROR:", e); process.exit(1); });
