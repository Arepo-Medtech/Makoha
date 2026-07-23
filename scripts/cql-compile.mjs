#!/usr/bin/env node
/**
 * cql-compile.mjs (A2.1) — build-time CQL→ELM translation for the deterministic rule
 * layer (verification/rules/library/*.cql). THE JVM STAYS OUT OF THE RUNTIME: translation
 * runs against an external cqframework/cql-translation-service (Docker), and only the
 * compiled *.elm.json (checksummed) ships. cql-execution then executes that ELM in pure
 * Node at runtime.
 *
 * Modes:
 *   (default / "compile")  Recompile every library/*.cql via the translation service and
 *                          WRITE library/<name>.elm.json + refresh library/checksums.json.
 *                          Run this once (Docker up) to produce the committed ELM.
 *   "verify"               CI gate. If NO *.elm.json is committed yet → SKIP GREEN (exit 0),
 *                          the MIRAGE/staging-eval idiom (armed-and-inert until the artifact
 *                          exists). Otherwise recompile each committed library to a temp and
 *                          assert its sha256 matches the committed *.elm.json — catches ELM
 *                          drifting from its .cql source. Mismatch → exit 1.
 *
 * Translation service URL: HEYDOC_CQL_TX_URL (default http://localhost:8080/cql/translator).
 * No new runtime dependency — Node 20+ global fetch + node:crypto.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_DIR = join(__dirname, "..", "verification", "rules", "library");
const TX_URL = (process.env.HEYDOC_CQL_TX_URL || "http://localhost:8080/cql/translator").replace(/\/$/, "");
const mode = (process.argv[2] || "compile").trim();

const sha256 = (buf) => "sha256:" + createHash("sha256").update(buf).digest("hex");
// Canonical JSON so a re-serialisation with different key order still compares equal.
const canonical = (obj) => JSON.stringify(sortKeys(obj));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {});
  return v;
}

function cqlFiles() {
  if (!existsSync(LIB_DIR)) return [];
  return readdirSync(LIB_DIR).filter((f) => f.endsWith(".cql")).sort();
}

/** Translate one CQL body to ELM JSON via the cql-translation-service. Throws on any failure. */
async function translate(cql) {
  const res = await fetch(TX_URL, {
    method: "POST",
    headers: { "Content-Type": "application/cql", Accept: "application/elm+json" },
    body: cql,
  });
  if (!res.ok) throw new Error(`translation service HTTP ${res.status} at ${TX_URL} (is cqframework/cql-translation-service running?)`);
  const elm = await res.json();
  // A translator error surfaces as annotations with errorSeverity — fail loud, never
  // commit ELM that carries a translation error.
  const annos = elm?.library?.annotation || [];
  const errs = annos.filter((a) => (a.errorSeverity === "error") || (a.type === "CqlToElmError" && a.errorSeverity !== "warning"));
  if (errs.length) throw new Error(`CQL translation errors:\n${errs.map((e) => "  - " + (e.message || JSON.stringify(e))).join("\n")}`);
  return elm;
}

async function compile() {
  const files = cqlFiles();
  if (!files.length) { console.log("cql-compile: no .cql libraries found in", LIB_DIR); return; }
  const checksums = {};
  for (const f of files) {
    const name = basename(f, ".cql");
    const cql = readFileSync(join(LIB_DIR, f), "utf8");
    const elm = await translate(cql);
    const bytes = canonical(elm);
    writeFileSync(join(LIB_DIR, `${name}.elm.json`), bytes + "\n");
    checksums[`${name}.elm.json`] = sha256(bytes);
    console.log(`  compiled ${f} → ${name}.elm.json  ${checksums[`${name}.elm.json`]}`);
  }
  writeFileSync(join(LIB_DIR, "checksums.json"), JSON.stringify({ note: "sha256 of the canonical ELM for each library — the CI verify gate asserts recompilation matches these.", translator: "cqframework/cql-translation-service (Docker)", checksums }, null, 2) + "\n");
  console.log("cql-compile: wrote checksums.json");
}

async function verify() {
  const files = cqlFiles();
  const committed = files.filter((f) => existsSync(join(LIB_DIR, `${basename(f, ".cql")}.elm.json`)));
  if (!committed.length) {
    console.log("cql:verify: SKIP (no compiled *.elm.json committed yet — armed-and-inert). Run `npm run cql:compile` with the translation service up to produce the ELM.");
    process.exit(0);
  }
  const failures = [];
  for (const f of committed) {
    const name = basename(f, ".cql");
    const cql = readFileSync(join(LIB_DIR, f), "utf8");
    const fresh = sha256(canonical(await translate(cql)));
    const committedElm = readFileSync(join(LIB_DIR, `${name}.elm.json`), "utf8");
    const committedSha = sha256(canonical(JSON.parse(committedElm)));
    if (fresh !== committedSha) failures.push(`${name}: committed ${committedSha} != recompiled ${fresh} — ELM has drifted from ${f}; run \`npm run cql:compile\` and commit.`);
    else console.log(`  ok ${name}.elm.json matches ${f}`);
  }
  if (failures.length) { console.error("cql:verify FAILED:\n" + failures.map((x) => "  - " + x).join("\n")); process.exit(1); }
  console.log("cql:verify: OK — all committed ELM matches its .cql source");
}

(mode === "verify" ? verify() : compile()).catch((e) => { console.error("cql-compile ERROR:", e.message); process.exit(1); });
