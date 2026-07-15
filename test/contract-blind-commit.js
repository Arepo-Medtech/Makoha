/**
 * Contract test — THE BLIND COMMIT (M1).
 *
 * OPERATOR, 2026-07-15: *"the two systems are most useful when their biases are UNCORRELATED, and most
 * dangerous when the design allows their biases to align. A human-in-the-loop system that lets the
 * clinician's anchor propagate into the model, and the model's sycophancy back into the clinician, has
 * engineered the correlation it should have been built to break."*
 *
 * THE PROPERTY. Trunks 1.0–5.0 must form an INDEPENDENT view. They may never see a clinician's leading
 * hypothesis, because anchoring + positional bias + sycophancy do not merely coexist in a language
 * model — they COMPOUND. A model shown the anchor first tends to confirm it, and a differential
 * produced after the human has spoken is worth close to nothing as a second opinion. It is not a second
 * opinion at all; it is an amplifier of whoever spoke first.
 *
 * 6.0–9.0 MAY see it. By then the independent view exists, and comparison is the entire point.
 *
 * WHY THIS SUITE EXISTS AT ALL — the property already held. Nothing in the pipeline produces a
 * `clinical_assessment` fact today (verified: the only reference is a CONSUMER's priority-ordering map
 * in models/jamba/assembler.js). `user_input` never reaches the packet — `routing(_userInput, trunk)`
 * ignores it — and the ContextPacket is `additionalProperties:false` with no hypothesis field.
 *
 * So the blind commit was true BY CONSTRUCTION, not by design. That is precisely how a property stops
 * holding in silence: `clinical_assessment` is a valid category in the packet's own enum, so the day
 * someone adds "the clinician's working dx" — plausible, since it is genuinely useful for 6.0–9.0 —
 * trunks 1.0–5.0 would inherit the anchor and nothing would say a word. **An accident is not a
 * guarantee.** This suite is what turns one into the other.
 *
 * Run from repo root: node test/contract-blind-commit.js
 */
import { readFileSync } from "node:fs";
import { runPipeline, contextInjection } from "../verification/pipeline.js";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const pipelineSrc = readFileSync("verification/pipeline.js", "utf8");

const ANCHOR = { fact_id: "f-anchor", category: "clinical_assessment", label: "clinician working diagnosis", value: "probably a PE" };

// ---- 1. The property TODAY: no trunk receives an anchor, because none is produced ---------------
for (const trunk of ["1.0", "5.0", "9.0"]) {
  const r = await runPipeline({ trunk });
  const anchors = (r.packet.facts || []).filter((f) => f.category === "clinical_assessment");
  expect(anchors.length === 0, `T${trunk}: no clinical_assessment fact should reach the packet today (found ${anchors.length})`);
}

// ---- 2. THE GUARD FIRES — driven through the REAL assembler, not by grepping its source ---------
// Nothing produces a clinical_assessment fact today, so the guard is unreachable via runPipeline().
// A guard that can only be checked by reading its own source is not tested. So the suite calls the
// packet assembler directly and hands it the anchor.
const plan = { needs_static_docs: [], needs_live_calls: [], needs_structured_kg: [], needs_fhir_reads: [], trunk_id: "5.0" };
const withAnchor = (trunk) => {
  // The raw-investigation seam builds facts; to inject a clinical_assessment we drive the assembler
  // with case_content the allow-list would map — but nothing maps to clinical_assessment, which is the
  // point. So the anchor is placed the only way a future caller could: as a produced fact.
  const injected = { ...plan, trunk_id: trunk };
  return () => contextInjection(injected, [], { trunk_id: trunk, run_id: "run-m1-0001", mode: "mock", _test_facts: [ANCHOR] });
};

for (const trunk of ["1.0", "2.0", "3.0", "4.0", "5.0"]) {
  expect(throws(withAnchor(trunk)),
    `T${trunk}: an anchor reaching a BLIND trunk must THROW — a differential produced after the human has spoken is not a second opinion, it is an amplifier of whoever spoke first`);
}
for (const trunk of ["6.0", "7.0", "8.0", "9.0"]) {
  expect(!throws(withAnchor(trunk)),
    `T${trunk}: must NOT be blind — by then the independent view exists and comparison is the entire point. Guarding here would block the useful half.`);
}
// The throw must EXPLAIN, and name where the anchor should go instead.
let msg = "";
try { withAnchor("5.0")(); } catch (e) { msg = e.message; }
expect(/independent/i.test(msg) && /6\.0/.test(msg),
  "the refusal must say WHY and where the assessment belongs instead — a bare throw teaches nothing");

// ---- 3. The category it guards is REAL and reachable — this is not a guard against nothing -------
const packetSchema = JSON.parse(readFileSync("mcp/schemas/context-packet.schema.json", "utf8"));
const categories = packetSchema.properties.facts.items.properties.category.enum;
expect(categories.includes("clinical_assessment"),
  "clinical_assessment must be a real category in the packet's enum — if it were not, this guard would be theatre");
expect(packetSchema.properties.facts.items.additionalProperties === false,
  "facts are closed — an anchor can only enter through a declared category, which is why guarding the category is sufficient");

// ---- 4. The OTHER doors are shut, and shut for structural reasons -------------------------------
// If any of these opens, the blind commit needs more than a category guard.
expect(packetSchema.additionalProperties === false,
  "the ContextPacket must stay closed — an open packet is an open door for an anchor");
expect(!("user_input" in packetSchema.properties) && !("hypothesis" in packetSchema.properties),
  "the packet must carry no free-text/hypothesis field");
expect(/function routing\(_userInput/.test(pipelineSrc),
  "routing must IGNORE user_input (the leading underscore is the contract) — free text reaching a trunk is an anchor by another name");

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-blind-commit FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-blind-commit: OK (M1 — 1.0–5.0 commit blind; the anchor firewall THROWS, is trunk-scoped, and guards a real category; the packet, user_input and routing doors are all structurally shut; 6.0–9.0 deliberately may see it)");
