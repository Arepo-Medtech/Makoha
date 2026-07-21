/**
 * Contract tests for the authoritative-live-run clinician sign-off gate
 * (FL-40 — the last engineering item). Asserts:
 *   - resolveClinicianSignoff reads the REAL signed rubric (v1.0) → returns the ref;
 *   - an unsigned/draft rubric → null; a rubric signed for a DIFFERENT version → null;
 *   - an explicit override is validated the same way (placeholder → null);
 *   - the CLI REFUSES a --mode live run against an unsigned rubric, BEFORE any
 *     generation (fail-closed, no creds needed);
 *   - replay mode is NOT gated by the sign-off (it never certifies a release).
 * Run from repo root: node test/contract-eval-signoff.js
 */
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolveClinicianSignoff } from "../verification/eval-signoff.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CLI = join(ROOT, "scripts", "eval-run.mjs");
const REAL_RUBRIC = join(ROOT, "docs", "grounding", "eval-rubric.md");
const V1 = "eval-rubric:v1.0";

const UNSIGNED_DOC = "## 8. Sign-off block\n\n| Field | Value |\n|---|---|\n| Rubric version | `eval-rubric:v1.0` |\n| `clinician_signoff_ref` | _(recorded reference, e.g. `signoff:eval-rubric:v1.0:<initials>`)_ |\n";
const WRONGVER_DOC = "## 8. Sign-off block\n\n| Field | Value |\n|---|---|\n| `clinician_signoff_ref` | `signoff:eval-rubric:v0.9:KL:2026-01-01` |\n";

function runCli(args) {
  return spawnSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
}

function run() {
  const errors = [];
  const dirs = [];
  const mkdoc = (name, body) => {
    const d = mkdtempSync(join(tmpdir(), name));
    dirs.push(d);
    const p = join(d, "eval-rubric.md");
    writeFileSync(p, body);
    return { dir: d, path: p };
  };

  try {
    // 1. Real signed rubric → returns the v1.0 ref.
    const real = resolveClinicianSignoff({ rubricVersion: V1, rubricPath: REAL_RUBRIC });
    if (!real.ref || !real.ref.startsWith("signoff:eval-rubric:v1.0")) errors.push(`real rubric did not resolve a v1.0 signoff ref (got ${JSON.stringify(real)})`);

    // 2. Unsigned/draft → null.
    const unsigned = resolveClinicianSignoff({ rubricVersion: V1, rubricPath: mkdoc("signoff-unsigned-", UNSIGNED_DOC).path });
    if (unsigned.ref !== null) errors.push("unsigned rubric wrongly resolved a signoff ref");

    // 3. Signed for a different version → null (version mismatch).
    const wrongVer = resolveClinicianSignoff({ rubricVersion: V1, rubricPath: mkdoc("signoff-wrongver-", WRONGVER_DOC).path });
    if (wrongVer.ref !== null) errors.push("rubric signed for a different version wrongly accepted");

    // 4. Override validation.
    const goodOverride = resolveClinicianSignoff({ rubricVersion: V1, override: "signoff:eval-rubric:v1.0:KL:2026-07-21" });
    if (goodOverride.ref !== "signoff:eval-rubric:v1.0:KL:2026-07-21") errors.push("valid override rejected");
    const badOverride = resolveClinicianSignoff({ rubricVersion: V1, override: "signoff:eval-rubric:v1.0:<initials>" });
    if (badOverride.ref !== null) errors.push("placeholder override wrongly accepted");
    const staleOverride = resolveClinicianSignoff({ rubricVersion: V1, override: "signoff:eval-rubric:v0.1:KL" });
    if (staleOverride.ref !== null) errors.push("override for the wrong version wrongly accepted");

    // 5. CLI REFUSES a live run against an unsigned rubric — before any generation.
    const unsignedDoc = mkdoc("signoff-cli-", UNSIGNED_DOC);
    const emptyFix = mkdtempSync(join(tmpdir(), "signoff-fix-"));
    dirs.push(emptyFix);
    const refuse = runCli(["--mode", "live", "--gate", "--rubric-doc", unsignedDoc.path, "--cases", "SPEC-CARD-01-00023", "--backends", "claude", "--fixtures", emptyFix]);
    if (refuse.status !== 1) errors.push(`live+unsigned exit ${refuse.status}, expected 1 (REFUSE). stderr: ${refuse.stderr}`);
    if (!/REFUSING an authoritative live run/i.test(refuse.stderr + refuse.stdout)) errors.push("live+unsigned did not print the refusal");

    // 6. Replay mode is NOT gated by the sign-off (unsigned rubric, no fixtures → SKIP green).
    const replay = runCli(["--mode", "replay", "--gate", "--rubric-doc", unsignedDoc.path, "--cases", "SPEC-CARD-01-00023", "--backends", "claude", "--fixtures", emptyFix]);
    if (replay.status !== 0) errors.push(`replay+unsigned exit ${replay.status}, expected 0 (SKIP — replay not gated by signoff). stderr: ${replay.stderr}`);
    if (/REFUSING an authoritative live run/i.test(replay.stderr + replay.stdout)) errors.push("replay run wrongly triggered the live signoff refusal");
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-eval-signoff: OK");
}

run();
