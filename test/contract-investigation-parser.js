/**
 * Contract tests for the deterministic-investigation-parser (the sanitiser).
 * Asserts: correct HL7 banding per analyte; lookup by LOINC and by name; unknown /
 * non-numeric inputs fail safe (interpretation U, no pass-through); THE RAW NUMBER
 * NEVER APPEARS in the sanitised fact; dataset receipt carries version + checksum;
 * and the produced fact conforms to the ContextPacket fact contract.
 * Run from repo root: node test/contract-investigation-parser.js
 */
import { sanitiseInvestigation } from "../verification/investigation-parser.js";
import { validateContextPacket } from "../verification/pipeline-schemas.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

// Banding by LOINC (potassium 2823-3: LL<2.5, L<3.5, N..5.5, H..6.5, HH>6.5)
check("K 4.0 -> N", sanitiseInvestigation({ loinc: "2823-3", value: 4.0 }).interpretation === "N");
check("K 6.0 -> H", sanitiseInvestigation({ loinc: "2823-3", value: 6.0 }).interpretation === "H");
check("K 6.8 -> HH", sanitiseInvestigation({ loinc: "2823-3", value: 6.8 }).interpretation === "HH");
check("K 3.0 -> L", sanitiseInvestigation({ loinc: "2823-3", value: 3.0 }).interpretation === "L");
check("K 2.0 -> LL", sanitiseInvestigation({ loinc: "2823-3", value: 2.0 }).interpretation === "LL");
// Troponin (no low band): 5 -> N, 100 -> HH
check("Troponin 5 -> N", sanitiseInvestigation({ loinc: "10839-9", value: 5 }).interpretation === "N");
check("Troponin 100 -> HH", sanitiseInvestigation({ loinc: "10839-9", value: 100 }).interpretation === "HH");
// Lookup by analyte name (case-insensitive)
check("by-name potassium 6.8 -> HH", sanitiseInvestigation({ analyte: "potassium", value: 6.8 }).interpretation === "HH");

// THE RAW NUMBER MUST NEVER APPEAR in the sanitised fact value.
for (const v of [6.8, 100, 2.0, 250.5]) {
  const f = sanitiseInvestigation({ loinc: "2823-3", value: v }).fact;
  check(`no raw digit leaked for ${v}`, !/[0-9]/.test(f.value));
  check(`sanitised_by set for ${v}`, typeof f.sanitised_by === "string" && f.sanitised_by.includes("deterministic-investigation-parser"));
}

// Fail-safe: unknown analyte / non-numeric → U, recognised false, no number.
const unknown = sanitiseInvestigation({ analyte: "unobtanium", value: 42 });
check("unknown analyte -> U", unknown.interpretation === "U" && unknown.recognised === false);
check("unknown analyte leaks no number", !/[0-9]/.test(unknown.fact.value));
const nonNumeric = sanitiseInvestigation({ loinc: "2823-3", value: "high" });
check("non-numeric -> U", nonNumeric.interpretation === "U" && nonNumeric.recognised === false);

// Dataset receipt: version + sha256 checksum + recognised flag.
const rec = sanitiseInvestigation({ loinc: "2823-3", value: 4.0 }).receipt;
check("receipt has dataset_version", typeof rec.dataset_version === "string" && rec.dataset_version.includes("lab-reference-ranges"));
check("receipt has sha256 checksum", /^sha256:[a-f0-9]{64}$/.test(rec.checksum));
check("receipt recognised=true", rec.recognised === true);

// Produced fact conforms to the ContextPacket fact contract.
{
  const f = sanitiseInvestigation({ loinc: "2823-3", value: 6.8 }).fact;
  try {
    validateContextPacket({ facts: [f], evidence: [], constraints: [], receipts: [] });
  } catch (e) {
    errors.push("sanitised fact not packet-conformant: " + e.message.slice(0, 80));
  }
}

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-investigation-parser: OK");
