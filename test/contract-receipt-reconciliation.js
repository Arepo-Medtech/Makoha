/**
 * Contract test for MI-02 — receipt reconciliation (execution plan §4.1, option A).
 *
 * Proves the three added trust-qualifier fields (jurisdiction_tag, confidence,
 * source_rank) are ADDITIVE-MONOTONE on receipt.schema.json and its zod mirror:
 *   - every legacy MCP-call receipt still validates unchanged (backward compat);
 *   - a receipt carrying the new fields validates under both ajv + zod;
 *   - out-of-vocabulary / out-of-range values are REJECTED by both;
 *   - no previously-required field was dropped and additionalProperties stays false.
 *
 * The JSON schema is the source of truth; ReceiptSchema (verification/pipeline-schemas.js)
 * must mirror it. This test fails loudly if the two drift.
 * Run from repo root: node test/contract-receipt-reconciliation.js
 */
import Ajv from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ReceiptSchema } from "../verification/pipeline-schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const receiptSchema = JSON.parse(readFileSync(join(repoRoot, "mcp/schemas/receipt.schema.json"), "utf8"));

// strict:false → the date-time format is ignored (ajv-formats is not a declared
// dependency); structure/required/enums/ranges still validate. Matches the house
// pattern in test/contract-evidence-fda-pubmed.js.
const ajv = new Ajv({ strict: false });
const validateJson = ajv.compile(receiptSchema);

const errors = [];
const okJson = (obj, label) => { if (!validateJson(obj)) errors.push(`ajv should ACCEPT ${label}: ${ajv.errorsText(validateJson.errors)}`); };
const badJson = (obj, label) => { if (validateJson(obj)) errors.push(`ajv should REJECT ${label} but accepted it`); };
const okZod = (obj, label) => { const r = ReceiptSchema.safeParse(obj); if (!r.success) errors.push(`zod should ACCEPT ${label}: ${r.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`); };
const badZod = (obj, label) => { if (ReceiptSchema.safeParse(obj).success) errors.push(`zod should REJECT ${label} but accepted it`); };

// A legacy receipt exactly as the MCP servers emit today (no new fields).
const legacy = { request_id: "kg-1783035512204-eu4m98g", timestamp_utc: "2026-07-02T23:38:32.204Z", upstream: "stub", mode: "mock", server: "knowledge", tool: "kg_query" };
okJson(legacy, "legacy MCP-call receipt");
okZod(legacy, "legacy MCP-call receipt");

// The absolute minimum (only the four required fields).
const minimal = { request_id: "doc-1719014400000-a3f7b2c", timestamp_utc: "2026-06-23T00:00:00Z", upstream: "docs-local", mode: "live" };
okJson(minimal, "minimal required-only receipt");
okZod(minimal, "minimal required-only receipt");

// An Evidence-Broker receipt carrying all three new qualifiers.
const enriched = { ...minimal, upstream: "NCTS-AU", jurisdiction_tag: "AU_endorsed", confidence: "high", source_rank: 1 };
okJson(enriched, "enriched broker receipt (all new fields)");
okZod(enriched, "enriched broker receipt (all new fields)");

// Rank-5 context-only source (openFDA) tagged US_context — schema-valid; the
// ranker/guard enforce that it never becomes a patient receipt (MI-03/MI-20).
const contextOnly = { ...minimal, upstream: "openFDA", jurisdiction_tag: "US_context", confidence: "provisional", source_rank: 5 };
okJson(contextOnly, "context-only US_context receipt");
okZod(contextOnly, "context-only US_context receipt");

// Rejections — out-of-vocabulary enum and out-of-range / non-integer rank.
badJson({ ...enriched, jurisdiction_tag: "XX" }, "bad jurisdiction_tag");
badZod({ ...enriched, jurisdiction_tag: "XX" }, "bad jurisdiction_tag");
badJson({ ...enriched, confidence: "medium" }, "bad confidence band");
badZod({ ...enriched, confidence: "medium" }, "bad confidence band");
badJson({ ...enriched, source_rank: 9 }, "source_rank out of range");
badZod({ ...enriched, source_rank: 9 }, "source_rank out of range");
badJson({ ...enriched, source_rank: 2.5 }, "non-integer source_rank");
badZod({ ...enriched, source_rank: 2.5 }, "non-integer source_rank");
badJson({ ...enriched, unknown_field: true }, "unknown extra field (additionalProperties:false)");
badZod({ ...enriched, unknown_field: true }, "unknown extra field (strict)");

// Additive-monotone structural invariants on the JSON schema itself.
const REQUIRED_BEFORE = ["request_id", "timestamp_utc", "upstream", "mode"];
if (JSON.stringify(receiptSchema.required) !== JSON.stringify(REQUIRED_BEFORE)) errors.push(`required[] changed — expected ${JSON.stringify(REQUIRED_BEFORE)}, got ${JSON.stringify(receiptSchema.required)}`);
if (receiptSchema.additionalProperties !== false) errors.push("additionalProperties must stay false");
for (const p of ["request_id", "timestamp_utc", "upstream", "mode", "tool", "server", "latency_ms", "correlation_id", "error"]) {
  if (!(p in receiptSchema.properties)) errors.push(`original property removed: ${p}`);
}
for (const p of ["jurisdiction_tag", "confidence", "source_rank"]) {
  if (!(p in receiptSchema.properties)) errors.push(`new property missing: ${p}`);
  if (receiptSchema.required.includes(p)) errors.push(`new property ${p} must NOT be required (additive-monotone)`);
}

if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-02 receipt reconciliation FAIL (${errors.length})`); process.exit(1); }
console.log("MI-02 receipt reconciliation PASS");
process.exit(0);
