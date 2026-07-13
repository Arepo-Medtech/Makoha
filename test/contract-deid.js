/**
 * Contract test for MI-12 — de-id edge (§2.3, §4.3 Stage 2, E4).
 *
 * Asserts the fail-closed PHI de-id: redaction removes the PHI spans; with an engine
 * the text is de-identified; WITHOUT an engine ingestion is BLOCKED and raw text is
 * NEVER returned; the analyzer throwing also blocks. There is no bypass path.
 * Run from repo root: node test/contract-deid.js
 */
import { deidentify, redact, presidioAvailable } from "../ingestion/deid/presidio.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

async function main() {
  const text = "Patient Jane Doe, email jane@x.com, seen today.";
  // Presidio-style spans for the name and the email.
  const spans = [
    { start: text.indexOf("Jane Doe"), end: text.indexOf("Jane Doe") + "Jane Doe".length, type: "PERSON" },
    { start: text.indexOf("jane@x.com"), end: text.indexOf("jane@x.com") + "jane@x.com".length, type: "EMAIL_ADDRESS" },
  ];

  // redact(): deterministic, right-to-left, spans replaced.
  const red = redact(text, spans);
  expect(red.includes("<REDACTED:PERSON>") && red.includes("<REDACTED:EMAIL_ADDRESS>"), "redact: spans replaced with typed markers");
  expect(!red.includes("Jane Doe") && !red.includes("jane@x.com"), "redact: original PHI substrings gone");

  // deidentify with an injected analyzer → de-identified, phi_removed.
  const analyze = async () => spans;
  const ok = await deidentify(text, { analyze });
  expect(ok.ok === true && ok.phi_removed === true && ok.blocked === false, "deidentify: engine present → de-identified");
  expect(ok.text && !ok.text.includes("Jane Doe") && !ok.text.includes("jane@x.com"), "deidentify: output carries no PHI");
  expect(Array.isArray(ok.entities) && ok.entities.length === 2, "deidentify: entities reported");

  // FAIL-CLOSED: no engine → blocked, raw text NEVER returned.
  const blocked = await deidentify(text, { env: {} });
  expect(blocked.ok === false && blocked.blocked === true && blocked.phi_removed === false, "no engine → BLOCKED (E4)");
  expect(blocked.text === null, "no engine → raw text is NEVER returned (text:null)");
  expect(/BLOCKED|fail-closed/i.test(blocked.reason), "block reason states fail-closed");

  // Analyzer error → also blocked, no passthrough.
  const errBlock = await deidentify(text, { analyze: async () => { throw new Error("presidio down"); } });
  expect(errBlock.ok === false && errBlock.blocked === true && errBlock.text === null, "analyzer error → BLOCKED, no raw passthrough");

  // presidioAvailable input-gated (default unavailable → ingestion blocks).
  expect(presidioAvailable({}).available === false, "presidio input-gated (default unavailable)");
  expect(presidioAvailable({ HEYDOC_PRESIDIO_ENDPOINT: "https://presidio/" }).available === true, "configured endpoint → available");

  if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-12 deid FAIL (${errors.length})`); process.exit(1); }
  console.log("MI-12 deid PASS");
  process.exit(0);
}

main().catch((e) => { console.error("MI-12 deid ERROR:", e); process.exit(1); });
