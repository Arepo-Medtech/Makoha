#!/usr/bin/env node
/**
 * export-repo-digest.mjs — produce a single Markdown digest of the relevant codebase to
 * upload into a Claude Chat context window (one file the agent can read end to end).
 *
 * Includes: source (mcp, trunk, integration, verification, scripts, test), contracts
 * (data/schemas, mcp/schemas), docs, architecture, .claude quick-refs, CI + config, and the
 * ONE reference case (SPEC-CARD-04-00001) as the canonical example.
 * Excludes: node_modules, .git, the case-bundle bulk in data/cases, the vendored AU Core SDs
 * (listed but not inlined), the derived kit JSON, the lockfile, binaries, and sync cruft.
 *
 * Output: breath-ezy-repo-digest.md (repo root; gitignored). Run: node scripts/export-repo-digest.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = process.argv.includes("--core"); // fits one Chat context window
const OUT = join(ROOT, CORE ? "breath-ezy-repo-digest.core.md" : "breath-ezy-repo-digest.md");

// roots to walk (files or dirs). CORE drops the 120KB FHIR omnibus and the case answer-keys.
const INCLUDE = [
  "CLAUDE.md", "README.md", "package.json", ".gitignore",
  ".github", ".claude", ".planning", "architecture", "docs",
  "mcp", "trunk", "integration", "verification", "portal", "scripts", "test",
  "data/schemas",
  ...(CORE ? [] : ["data/digital_tablet_omnibus.json", "data/cases/SPEC-CARD-04-00001"]),
];
// path substrings to skip. CORE also drops the vendored AU Core SDs; FULL inlines them
// (there's ample room in a 1M-token window, and it makes fhir-broker self-contained).
const EXCLUDE_SUBSTR = [
  "node_modules", "/.git/", "package-lock.json",
  "breath-ezy-case-transformation-kit.json",   // 500KB derived bundle
  "breath-ezy-repo-digest",                    // this output (both variants)
  ".DS_Store",
  ...(CORE ? ["/au-core/"] : []),
];
const EXCLUDE_RE = [/ \d+\.(json|js|mjs|md)$/]; // "foo 2.json" sync duplicates
const TEXT_EXT = new Set([".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".txt", ".ts"]);
const LANG = { ".js": "js", ".mjs": "js", ".ts": "ts", ".json": "json", ".md": "markdown", ".yml": "yaml", ".yaml": "yaml" };

const skip = (p) => EXCLUDE_SUBSTR.some((s) => p.includes(s)) || EXCLUDE_RE.some((re) => re.test(p));

function walk(abs, acc) {
  let st; try { st = statSync(abs); } catch { return; }
  if (skip(abs)) return;
  if (st.isDirectory()) {
    for (const n of readdirSync(abs).sort()) walk(join(abs, n), acc);
  } else if (st.isFile() && TEXT_EXT.has(extname(abs))) {
    acc.push(abs);
  }
}

const files = [];
for (const inc of INCLUDE) walk(join(ROOT, inc), files);
files.sort();

let commit = "unknown", branch = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch {}
try { branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim(); } catch {}

// vendored SDs — list, don't inline
let auCore = [];
try {
  const dir = join(ROOT, "mcp/servers/fhir-broker/au-core");
  auCore = readdirSync(dir).map((n) => `mcp/servers/fhir-broker/au-core/${n} (${(statSync(join(dir, n)).size / 1024).toFixed(0)} KB)`);
} catch {}

// Count the case bundles under data/cases (dirs named SPEC-*), so the "excluded
// bulk" note is derived from the tree — never a hand-maintained number that
// silently goes stale as the case set grows. FULL inlines the one reference
// case; CORE inlines none.
let caseDirCount = 0;
try {
  const cd = join(ROOT, "data/cases");
  caseDirCount = readdirSync(cd).filter((n) => {
    if (!/^SPEC-/.test(n)) return false;
    try { return statSync(join(cd, n)).isDirectory(); } catch { return false; }
  }).length;
} catch {}
const excludedCases = CORE ? caseDirCount : Math.max(0, caseDirCount - 1);

const rel = (p) => relative(ROOT, p);
const tree = files.map((f) => `  ${rel(f)}`).join("\n");

const parts = [];
parts.push(`# Breath-Ezy AI Doctor — Repository Digest

Single-file export of the relevant codebase for a Claude Chat context window.

- Repo: \`kenleefreo/breath-ezy\` · branch \`${branch}\` @ \`${commit}\`
- Files inlined: ${files.length}
- **Source of truth is the live repo; this is a point-in-time snapshot.**

## ⚠️ Read before using
- **Scoring-store firewall.** This digest includes the reference case's sealed answer-key nodes (\`10_ground_truth_node\`, \`11_symptom_links_node\`, \`12_management_plan_node\`, \`13_safety_netting_node\`). That is fine for **engineering** work. Do **not** use this context to role-play the AI Doctor or generate patient-facing output — the AI Doctor must never see \`10–13\`.
- **Excluded (bulk/derived, not needed for engineering):** \`node_modules\`, \`.git\`, the ${excludedCases}-case bulk in \`data/cases/\`${CORE ? " (no case data at all in this CORE variant)" : " (only the reference case \\`SPEC-CARD-04-00001\\` is included)"}, the 500 KB derived transformation kit (its parts — protocol, schemas, reference case — are all inlined separately), \`package-lock.json\`, and sync-duplicate cruft.${CORE ? " CORE also drops the FHIR omnibus and the vendored AU Core SDs and minifies JSON, to fit a ~200k window." : " Sized for a large-context model (e.g. Fable 5, 1M tokens)."}
- **No secrets:** env templates use \`example.invalid\` placeholders by design.

### Vendored AU Core StructureDefinitions
${CORE
  ? "Listed here, not inlined in the CORE variant:\n" + (auCore.length ? auCore.map((s) => `- ${s}`).join("\n") : "- (none found)")
  : "Inlined below in full (in `mcp/servers/fhir-broker/au-core/`):\n" + (auCore.length ? auCore.map((s) => `- ${s}`).join("\n") : "- (none found)")}

## File tree (inlined below)
\`\`\`
${tree}
\`\`\`

---
`);

for (const f of files) {
  const r = rel(f);
  const lang = LANG[extname(f)] || "";
  let body = readFileSync(f, "utf8");
  // CORE: minify JSON (schemas etc.) to save tokens — still fully parseable by the agent.
  if (CORE && extname(f) === ".json") {
    try { body = JSON.stringify(JSON.parse(body)); } catch {}
  }
  // guard against a stray triple-backtick fence collision in markdown files
  const fence = body.includes("```") ? "````" : "```";
  parts.push(`\n## ${r}\n\n${fence}${lang}\n${body}\n${fence}\n`);
}

const outText = parts.join("\n");
writeFileSync(OUT, outText);
const kb = (Buffer.byteLength(outText, "utf8") / 1024).toFixed(0);
console.log(`Wrote ${OUT}`);
console.log(`  files inlined: ${files.length}`);
console.log(`  size: ${kb} KB  (~${Math.round(Buffer.byteLength(outText, "utf8") / 4 / 1000)}k tokens est.)`);
console.log(`  commit: ${branch} @ ${commit}`);
