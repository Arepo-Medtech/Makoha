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
const V11 = "eval-rubric:v1.1";

const UNSIGNED_DOC = "## 8. Sign-off block\n\n| Field | Value |\n|---|---|\n| Rubric version | `eval-rubric:v1.0` |\n| `clinician_signoff_ref` | _(recorded reference, e.g. `signoff:eval-rubric:v1.0:<initials>`)_ |\n";
const WRONGVER_DOC = "## 8. Sign-off block\n\n| Field | Value |\n|---|---|\n| `clinician_signoff_ref` | `signoff:eval-rubric:v0.9:KL:2026-01-01` |\n";
// A doc carrying TWO signed refs — v1.0 in §8 (first) then v1.1 in §9 (later).
// The resolver must select BY VERSION, never by document order, so v1.0 in §8
// cannot shadow a newer v1.1 sign-off in §9 (and vice-versa).
const MULTIVER_DOC =
  "## 8. Sign-off block\n\n| Field | Value |\n|---|---|\n| `clinician_signoff_ref` | `signoff:eval-rubric:v1.0:KL:2026-07-21` |\n\n" +
  "## 9. v1.1\n\n| Field | Value |\n|---|---|\n| `clinician_signoff_ref` | `signoff:eval-rubric:v1.1:KL:2026-07-22` |\n";

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
    // 1. Real signed rubric → returns the v1.0 ref when v1.0 is requested…
    const real = resolveClinicianSignoff({ rubricVersion: V1, rubricPath: REAL_RUBRIC });
    if (!real.ref || !real.ref.startsWith("signoff:eval-rubric:v1.0")) errors.push(`real rubric did not resolve a v1.0 signoff ref (got ${JSON.stringify(real)})`);

    // 1b. …and the v1.1 ref when v1.1 is requested (the real rubric now carries
    //     BOTH — §8 v1.0 and §9 v1.1 — so this proves version-selection, not order).
    const real11 = resolveClinicianSignoff({ rubricVersion: V11, rubricPath: REAL_RUBRIC });
    if (!real11.ref || !real11.ref.startsWith("signoff:eval-rubric:v1.1")) errors.push(`real rubric did not resolve a v1.1 signoff ref (got ${JSON.stringify(real11)})`);

    // 1c. Multi-version doc: v1.0 appears FIRST, v1.1 later. Requesting v1.1 must
    //     select the v1.1 ref (not the first-in-document v1.0) — the fail-open guard.
    const multi = mkdoc("signoff-multi-", MULTIVER_DOC).path;
    const pick11 = resolveClinicianSignoff({ rubricVersion: V11, rubricPath: multi });
    if (pick11.ref !== "signoff:eval-rubric:v1.1:KL:2026-07-22") errors.push(`multi-version doc did not select v1.1 (got ${JSON.stringify(pick11)})`);
    const pick10 = resolveClinicianSignoff({ rubricVersion: V1, rubricPath: multi });
    if (pick10.ref !== "signoff:eval-rubric:v1.0:KL:2026-07-21") errors.push(`multi-version doc did not select v1.0 (got ${JSON.stringify(pick10)})`);
    // A version signed in NEITHER section → null (fail-closed), with both refs named.
    const pickMissing = resolveClinicianSignoff({ rubricVersion: "eval-rubric:v2.0", rubricPath: multi });
    if (pickMissing.ref !== null) errors.push("multi-version doc wrongly resolved a ref for an unsigned version");

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
