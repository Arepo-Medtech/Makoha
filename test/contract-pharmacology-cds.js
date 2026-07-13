/**
 * Contract test for MI-08 / MI-09 — pharmacology AMT underlay + empty CDS slot.
 *
 * MI-09 (E7 hard STOP): the empty CDS slot returns HARD_FAIL, never any
 * dosing/interaction/contraindication content, and folds monotonically so it can only
 * ADD a HARD_FAIL — an empty slot blocks even a PASS engine. MI-08: an AMT code is
 * validated via Terminology and coded only on a validate-pass (never fabricated).
 * Run from repo root: node test/contract-pharmacology-cds.js
 */
import { queryCds, cdsVendorAvailable, composeCdsVerdict } from "../mcp/servers/pharmacology/cds-adapter/index.js";
import { validateDrugAmt } from "../mcp/servers/pharmacology/amt-underlay.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

async function main() {
  // MI-09 — empty CDS slot (B4 uncontracted).
  expect(cdsVendorAvailable({}).available === false, "CDS vendor unavailable by default (B4)");
  expect(cdsVendorAvailable({ HEYDOC_PHARM_CDS: "FILLED" }).available === false, "PHARM_CDS=FILLED alone does NOT unlock content (endpoint required)");

  const cds = await queryCds({ drug: "oxycodone" }, { env: {} });
  expect(cds.verdict === "HARD_FAIL", "empty slot → HARD_FAIL");
  expect(cds.dose_guidance === null && cds.interactions === null && cds.contraindications === null, "empty slot emits NO dosing/interaction/contraindication content");
  expect(/not contracted \(B4\)/.test(cds.reason), "reason cites B4");

  // E7 — the empty slot blocks even a PASS engine; can only strengthen, never rescue.
  const onPass = composeCdsVerdict("PASS", cds);
  expect(onPass.status === "HARD_FAIL" && onPass.blocks === true, "E7: empty slot forces HARD_FAIL over a PASS engine (blocks)");
  const onWarn = composeCdsVerdict("WARN", cds);
  expect(onWarn.status === "HARD_FAIL", "E7: empty slot forces HARD_FAIL over a WARN engine");
  // A hypothetically-available PASS CDS never downgrades an engine HARD_FAIL.
  const engineHardFail = composeCdsVerdict("HARD_FAIL", { verdict: "PASS" });
  expect(engineHardFail.status === "HARD_FAIL", "monotone: CDS never rescues an engine HARD_FAIL");

  // PHARM_CDS=FILLED + endpoint but no validated client → fail-closed (still blocks).
  const filledNoClient = await queryCds({}, { env: { HEYDOC_PHARM_CDS: "FILLED", HEYDOC_PHARM_CDS_ENDPOINT: "https://cds/v1" } });
  expect(filledNoClient.verdict === "BLOCKED_NO_PROOF" && filledNoClient.dose_guidance === null, "configured-but-unbuilt CDS → BLOCKED_NO_PROOF, no content");

  // MI-08 — AMT underlay validates via Terminology; coded only on validate-pass.
  const validated = await validateDrugAmt({ drug_name: "paracetamol", amt_snomed_code: "23628011000036104" }, { validate: async () => ({ validated: true, display: "paracetamol 500 mg tablet", version: "AMT" }) });
  expect(validated.validated === true && validated.coding.code === "23628011000036104" && validated.terminology_receipt_id, "MI-08: AMT code validates → coding + receipt");

  const noCode = await validateDrugAmt({ drug_name: "paracetamol" }, { validate: async () => ({ validated: true }) });
  expect(noCode.validated === false && noCode.coding === null, "MI-08: no AMT code → not asserted (no fabrication)");

  const notValidated = await validateDrugAmt({ drug_name: "x", amt_snomed_code: "999" }, { validate: async () => ({ validated: false, reason: "unknown" }) });
  expect(notValidated.validated === false && notValidated.coding === null, "MI-08: unvalidated AMT code → NOT coded (no fabrication)");

  if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-08/MI-09 pharmacology-cds FAIL (${errors.length})`); process.exit(1); }
  console.log("MI-08/MI-09 pharmacology-cds PASS");
  process.exit(0);
}

main().catch((e) => { console.error("MI-08/MI-09 pharmacology-cds ERROR:", e); process.exit(1); });
