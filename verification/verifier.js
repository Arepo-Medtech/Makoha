/**
 * Verification layer: mechanical checks on generation output.
 * Ensures no invented codes, guidelines, operations, or repo/API names; checks hard-stop enforcement.
 */

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

/** Patterns that suggest SNOMED/ICD codes (require terminology receipt). */
const CODE_PATTERNS = [
  /\bSNOMED[_\s]?CT[_\s]?[Cc]ode[:\s]*[\d]+/i,
  /\bICD[_\s]?11[_\s]?[Cc]ode[:\s]*[A-Z0-9\.]+/i,
  /\b(?:code|concept)[:\s]+[\d]{6,}/,
];

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
 * Run all verification checks on output.
 * @param {string} output - Generation output text to verify
 * @param {{ citations: string[], terminology_receipts: string[], live_receipts: string[], hard_stop_receipt?: string }} evidence - Collected proof refs
 * @returns {{ pass: boolean, results: Array<{ check: string, passed: boolean, reason?: string }>, missing_receipts: string[] }}
 */
export function verify(output, evidence = {}) {
  const citations = new Set(evidence.citations || []);
  const terminologyReceipts = new Set(evidence.terminology_receipts || []);
  const liveReceipts = new Set(evidence.live_receipts || []);
  const results = [];
  const missing_receipts = [];

  // 1. No invented codes
  let codeViolations = 0;
  for (const re of CODE_PATTERNS) {
    if (re.test(output)) codeViolations++;
  }
  const codePass = codeViolations === 0 || terminologyReceipts.size > 0;
  if (!codePass) missing_receipts.push("terminology.lookup receipt required for any SNOMED/ICD code");
  results.push({ check: "no_invented_codes", passed: codePass, reason: codeViolations ? "output contains code-like references; terminology receipt required" : undefined });

  // 2. No invented guidelines
  let guidelineViolations = 0;
  for (const re of GUIDELINE_PATTERNS) {
    if (re.test(output)) guidelineViolations++;
  }
  const guidelinePass = guidelineViolations === 0 || citations.size > 0;
  if (!guidelinePass) missing_receipts.push("docs.cite ID required for guideline claims");
  results.push({ check: "no_invented_guidelines", passed: guidelinePass, reason: guidelineViolations ? "output contains guideline claims; docs.cite required" : undefined });

  // 3. No invented operations
  let liveViolations = 0;
  for (const re of LIVE_CLAIM_PATTERNS) {
    if (re.test(output)) liveViolations++;
  }
  const livePass = liveViolations === 0 || liveReceipts.size > 0;
  if (!livePass) missing_receipts.push("live-data receipt required for IHI/lab/pharmacy/delivery claims");
  results.push({ check: "no_invented_operations", passed: livePass, reason: liveViolations ? "output contains operational claims; live receipt required" : undefined });

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
  results.push({ check: "no_repo_invention", passed: repoPass, reason: repoPass ? undefined : "invented repo/service names: " + mentionedRepos.join(", ") });

  // 5. Hard-stop enforcement (if output mentions HARD_FAIL, we need a receipt)
  const hasHardFail = /\bHARD_FAIL\b|critical\s+acuity\s+override/i.test(output);
  const hardStopPass = !hasHardFail || !!evidence.hard_stop_receipt;
  if (!hardStopPass) missing_receipts.push("HARD_FAIL or critical acuity override requires pharmacology/investigation receipt");
  results.push({ check: "hard_stop_enforcement", passed: hardStopPass, reason: hasHardFail && !evidence.hard_stop_receipt ? "hard-stop mentioned without receipt" : undefined });

  const pass = results.every((r) => r.passed);
  return { pass, results, missing_receipts };
}
