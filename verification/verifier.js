/**
 * Verification layer: mechanical checks on generation output.
 * Ensures no invented codes, guidelines, operations, or repo/API names; checks hard-stop enforcement.
 */
import { hashCandidateOutput } from "./hash.js";
import { normaliseMode } from "./mode.js";

/** Known MCP / allowed service names (from gap register and implemented servers). */
const ALLOWED_SERVICE_NAMES = new Set([
  "mcp-docs", "mcp-knowledge", "mcp-identity-au", "mcp-terminology", "mcp-fhir-broker",
  "mcp-pharmacology", "mcp-messaging-geo", "heydoc-mcp-docs", "heydoc-mcp-identity-au",
  "core-agent-orchestrator", "shell-matrix-agent", "deep-library-agent", "triage-state-machine",
  "diagnostic-gating-service", "hl7-fhir-broker", "identity-gateway", "clinical-knowledge-graph",
  "graph-db-manager", "deterministic-investigation-parser", "pharmacological-firewall",
  "deterministic-pharmacology-firewall", "medicolegal-audit-ledger", "patient-client-app",
  "clinician-verification-portal", "clinical-evals-suite", "mlops-weights-registry",
  "nlp-snomed-extractor", "nlp-clinical-extraction", "geolocation-pharmacy-api", "infrastructure-iac",
  "bayesian-inference-engine", "neuro-symbolic-bayesian-engine", "discharge-monitoring-loop",
]);

/**
 * Patterns that suggest clinical codes (require a terminology lookup receipt per
 * the no-fabricated-codes invariant). Each is tagged with the code system it
 * targets so failures name the offending system.
 *
 * Detection is deliberately conservative (favouring catching a real violation
 * over avoiding a false flag — under-triage outranks over-triage). "Strong" forms
 * (dotted ICD, LOINC dash-check, bare SNOMED concept ids, explicit "X code:"
 * labels) are always flagged; ambiguous bare forms (e.g. an ICD-10-AM 3-char code
 * like "A09", a PBS item) are context-gated to avoid false positives on ordinary
 * text such as "vitamin B12" or a YYYY-MM date.
 */
const CODE_PATTERNS = [
  // SNOMED CT — a long digit string is only treated as a concept id when it sits in
  // a code context (SNOMED / "code:" / "concept:"). A bare 6–18 digit integer is NOT
  // flagged: ordinary text (a phone/reference number, an epoch timestamp, a large
  // count) routinely contains long integers, and flagging those rejects grounded,
  // code-free output (false positive). Real trunk output that emits a SNOMED code
  // labels it, so the context forms below catch the genuine cases.
  { system: "SNOMED CT", re: /\bSNOMED(?:[\s_-]?CT)?\b[\s\S]{0,24}?\b\d{6,18}\b/i },
  // ICD-10-AM — dotted form is unambiguous; the bare 3-char form is context-gated.
  { system: "ICD-10-AM", re: /\b[A-Z]\d{2}\.\d{1,4}\b/ },
  { system: "ICD-10-AM", re: /\bICD(?:[\s-]?10(?:[\s-]?AM)?)\b[\s\S]{0,24}?\b[A-Z]\d{2}(?:\.\d{1,4})?\b/i },
  // ICD-11 — what the terminology server currently grounds; keep detecting it.
  { system: "ICD-11", re: /\bICD[\s_-]?11\b[\s\S]{0,24}?\b[A-Z0-9]{2,}(?:\.[A-Z0-9]+)?\b/i },
  // LOINC — digits + '-' + single check digit (trailing \b excludes YYYY-MM dates).
  { system: "LOINC", re: /\b\d{4,5}-\d\b/ },
  { system: "LOINC", re: /\bLOINC\b[\s\S]{0,24}?\b\d{1,5}-\d\b/i },
  // PBS — item codes are ambiguous bare, so require PBS context.
  { system: "PBS", re: /\bPBS\b[\s\S]{0,24}?\b\d{1,5}[A-Z]?\b/i },
  // Generic "code:/concept:" label followed by a numeric code.
  { system: "code label", re: /\b(?:code|concept)[:\s]+\d{4,}/i },
];

/** Return the distinct code systems detected in the output (deduplicated). */
function detectCodeSystems(output) {
  const systems = new Set();
  for (const { system, re } of CODE_PATTERNS) {
    if (re.test(output)) systems.add(system);
  }
  return [...systems];
}

/**
 * Extract the actual code TOKENS we can bind exactly to a receipt — SNOMED CT / AMT
 * (numeric, code-context), ICD-10-AM (dotted), LOINC (dash-check), and PBS
 * (context-gated item code). These shapes are unambiguous enough to compare against a
 * receipt's validated codes. ICD-11 is alphanumeric and fuzzy to extract, so it is
 * gated coarsely (receipt-presence) rather than bound token-by-token — see check 1.
 * @returns {Array<{ system: string, code: string }>} de-duplicated by code
 */
function extractBindableCodes(output) {
  const found = [];
  const scan = (system, re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(output)) !== null) found.push({ system, code: m[1] });
  };
  // SNOMED/AMT: a code-context digit string (AMT codes are SNOMED-form) — not a bare
  // long integer (see CODE_PATTERNS).
  scan("SNOMED CT", /(?:SNOMED(?:[\s_-]?CT)?|\bAMT|\bcode|\bconcept)[^\d\n]{0,24}?\b(\d{6,18})\b/gi);
  scan("ICD-10-AM", /\b([A-Z]\d{2}\.\d{1,4})\b/g);
  scan("LOINC", /\b(\d{4,5}-\d)\b/g);
  // PBS: item codes are ambiguous bare, so context-gated ("PBS item 2622B").
  scan("PBS", /\bPBS\b[^\d\n]{0,24}?\b(\d{1,5}[A-Z]?)\b/gi);
  const seen = new Set();
  return found.filter((c) => (seen.has(c.code) ? false : seen.add(c.code)));
}

/** Patterns that suggest guideline claims (require docs.cite). */
const GUIDELINE_PATTERNS = [
  /Choosing\s+Wisely\s+(?:says|recommends|states|suggests)/i,
  /eTG\s+(?:says|recommends|states|suggests)/i,
  /(?:guideline|recommendation)\s+(?:says|states)\s+[^.]+/i,
];

/** Patterns that suggest live operational claims (require live-data receipt). */
const LIVE_CLAIM_PATTERNS = [
  /\bIHI\s+(?:is|was|=\s*)[\d\s]+/i,
  /\blab\s+result[s]?\s+(?:show|indicate|is)/i,
  /\b(?:pharmacy|pharmacies)\s+(?:open|available)/i,
  /\b(?:SMS|email)\s+(?:sent|delivered)/i,
];

/** Invented repo name: backtick-quoted identifier that looks like a service. */
const REPO_NAME_PATTERN = /`([a-z0-9-]+(?:-[a-z0-9]+)*)`/g;

/**
 * Per-check severity label (C15/M7 reconciliation). This LABELS the report; it
 * does NOT change the gate — `pass` is still `results.every(r => r.passed)`, so a
 * failed check of ANY severity still rejects the output. Severities map to the
 * gap-register Risk Register: fabricated codes (R-01), operational facts/IHI
 * (R-04) and HARD_FAIL enforcement (R-03) are `critical`; a guideline claim
 * without a citation (R-02, High) is `fail`; an unregistered service name
 * (R-11, Moderate) is `warning` — surfaced-but-gating: it still fails, but is
 * flagged as the lowest severity, resolving the docs↔code drift where the docs
 * promised a `severity=warning` the verifier never emitted.
 */
const CHECK_SEVERITY = {
  no_invented_codes: "critical",
  no_invented_guidelines: "fail",
  no_invented_operations: "critical",
  no_repo_invention: "warning",
  hard_stop_enforcement: "critical",
};

/**
 * Run all verification checks on output.
 * @param {string} output - Generation output text to verify
 * @param {{ citations: string[], terminology_receipts: string[], terminology?: Array<{request_id: string, codes: string[], mode: string}>, live_receipts: string[], hard_stop_receipt?: string, context_mode?: string, receipt_modes?: Array<{id: string, mode: string}> }} evidence - Collected proof refs
 * @returns {{ pass: boolean, results: Array<{ check: string, passed: boolean, reason?: string, severity: "critical"|"fail"|"warning" }>, missing_receipts: string[], candidate_output_hash: string, mock_receipt_flags: string[] }}
 */
export function verify(output, evidence = {}) {
  // Medicolegal anchor FIRST — hash the exact, unmodified output before any
  // processing, so the hash proves precisely what was generated (prime directive).
  const candidate_output_hash = hashCandidateOutput(output);

  const citations = new Set(evidence.citations || []);
  const terminologyReceipts = new Set(evidence.terminology_receipts || []);
  const liveReceipts = new Set(evidence.live_receipts || []);
  const terminologyEntries = evidence.terminology || [];

  // Mock-mode handling (receipt.schema.json): mock receipts MUST be flagged, and
  // MUST be blocked in a non-mock (production/staging-live) context. We collect
  // the ids of every mock receipt for the report, and — only when the context is
  // not mock — treat mock proof as absent so anything grounded solely on mock
  // data fails. In mock/dev (the default) we flag but do not block.
  // Mode-normaliser (C16/F4): staging/production/live — and any UNRECOGNISED mode
  // string (default-deny) — enforce; mock/dry_run are dev modes (query validated,
  // upstream not called) and flag rather than block, since treating them as
  // production would fail every legitimately mock-grounded output during dev.
  // Absent context_mode keeps the documented dev default (mock).
  const enforceLive = normaliseMode(evidence.context_mode).enforce_live;
  const receiptModes = evidence.receipt_modes || [];
  const mockIds = new Set(receiptModes.filter((m) => m.mode === "mock").map((m) => m.id));
  for (const e of terminologyEntries) if (e.mode === "mock" && e.request_id) mockIds.add(e.request_id);
  const mock_receipt_flags = [...mockIds];

  // Effective (grounding) evidence — mock proof drops out in a non-mock context.
  const effCitations = enforceLive ? new Set([...citations].filter((c) => !mockIds.has(c))) : citations;
  const effLiveReceipts = enforceLive ? new Set([...liveReceipts].filter((r) => !mockIds.has(r))) : liveReceipts;
  const effTerminologyReceipts = enforceLive ? new Set([...terminologyReceipts].filter((r) => !mockIds.has(r))) : terminologyReceipts;
  const effTerminologyEntries = enforceLive ? terminologyEntries.filter((e) => e.mode !== "mock") : terminologyEntries;
  const validatedCodes = new Set(effTerminologyEntries.flatMap((e) => e.codes || []));

  const results = [];
  const missing_receipts = [];

  // 1. No invented codes. True per-code binding for the cleanly-extractable
  // systems (SNOMED/ICD-10-AM/LOINC): every code token must appear in a
  // terminology receipt's validated codes. ICD-11/PBS are detected but gated
  // coarsely (a terminology receipt must be present) because their tokens cannot
  // be extracted reliably — exact binding for them is future work tied to
  // terminology-contract-incomplete. A code we cannot bind blocks the output
  // (fail-safe: an ungrounded code is never emitted).
  const detectedSystems = detectCodeSystems(output);
  const bindable = extractBindableCodes(output);
  const unbound = bindable.filter((c) => !validatedCodes.has(c.code));
  // ICD-11 stays coarse (alphanumeric, fuzzy to extract). PBS is now bound per-code.
  const coarseSystems = [...new Set(detectedSystems.filter((s) => s === "ICD-11"))];
  const coarseUnsatisfied = coarseSystems.length > 0 && effTerminologyReceipts.size === 0;
  const codePass = unbound.length === 0 && !coarseUnsatisfied;
  let codeReason;
  if (!codePass) {
    const parts = [];
    if (unbound.length) parts.push("unbound codes (no terminology receipt validated them): " + unbound.map((c) => `${c.code} [${c.system}]`).join(", "));
    if (coarseUnsatisfied) parts.push("terminology receipt required for: " + coarseSystems.join(", "));
    codeReason = parts.join("; ");
    missing_receipts.push("terminology.lookup receipt required to bind codes: " + (unbound.map((c) => c.code).concat(coarseSystems).join(", ")));
  }
  results.push({ check: "no_invented_codes", passed: codePass, reason: codeReason, severity: CHECK_SEVERITY.no_invented_codes });

  // 2. No invented guidelines
  let guidelineViolations = 0;
  for (const re of GUIDELINE_PATTERNS) {
    if (re.test(output)) guidelineViolations++;
  }
  const guidelinePass = guidelineViolations === 0 || effCitations.size > 0;
  if (!guidelinePass) missing_receipts.push("docs.cite ID required for guideline claims");
  results.push({ check: "no_invented_guidelines", passed: guidelinePass, reason: guidelineViolations ? "output contains guideline claims; docs.cite required" : undefined, severity: CHECK_SEVERITY.no_invented_guidelines });

  // 3. No invented operations
  let liveViolations = 0;
  for (const re of LIVE_CLAIM_PATTERNS) {
    if (re.test(output)) liveViolations++;
  }
  const livePass = liveViolations === 0 || effLiveReceipts.size > 0;
  if (!livePass) missing_receipts.push("live-data receipt required for IHI/lab/pharmacy/delivery claims");
  results.push({ check: "no_invented_operations", passed: livePass, reason: liveViolations ? "output contains operational claims; live receipt required" : undefined, severity: CHECK_SEVERITY.no_invented_operations });

  // 4. No repo/API invention
  const mentionedRepos = [];
  let m;
  REPO_NAME_PATTERN.lastIndex = 0;
  while ((m = REPO_NAME_PATTERN.exec(output)) !== null) {
    const name = m[1];
    if (!ALLOWED_SERVICE_NAMES.has(name)) mentionedRepos.push(name);
  }
  const repoPass = mentionedRepos.length === 0;
  if (!repoPass) missing_receipts.push("output must not introduce repo names outside gap register: " + mentionedRepos.join(", "));
  results.push({ check: "no_repo_invention", passed: repoPass, reason: repoPass ? undefined : "invented repo/service names: " + mentionedRepos.join(", "), severity: CHECK_SEVERITY.no_repo_invention });

  // 5. Hard-stop enforcement (if output mentions HARD_FAIL, we need a receipt)
  const hasHardFail = /\bHARD_FAIL\b|critical\s+acuity\s+override/i.test(output);
  const hardStopPass = !hasHardFail || !!evidence.hard_stop_receipt;
  if (!hardStopPass) missing_receipts.push("HARD_FAIL or critical acuity override requires pharmacology/investigation receipt");
  results.push({ check: "hard_stop_enforcement", passed: hardStopPass, reason: hasHardFail && !evidence.hard_stop_receipt ? "hard-stop mentioned without receipt" : undefined, severity: CHECK_SEVERITY.hard_stop_enforcement });

  const pass = results.every((r) => r.passed);
  return { pass, results, missing_receipts, candidate_output_hash, mock_receipt_flags };
}
