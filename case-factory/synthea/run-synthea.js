/**
 * run-synthea — out-of-process wrapper for synthetichealth/synthea (#dir, Apache-2.0).
 *
 * FLOW_PLAN H4. Synthea is a Java generator; per the integration discipline it runs
 * OUT-OF-PROCESS behind a CLI boundary — NO Java is vendored into this Node repo and
 * NO in-process contamination occurs (the H1 fhir-live precedent: an external, commit-
 * pinned process behind a thin Node seam). This module only *invokes* an external
 * Synthea distribution; it never reimplements it.
 *
 * FAIL-SAFE: if no Java runtime / Synthea jar is configured, generate() returns a
 * structured { available:false, reason } — it NEVER fabricates a patient bundle. A
 * fabricated "generated" record would violate the synthetic-only + no-fabricated-facts
 * floor as surely as a live fabrication would. Absence is reported, not papered over.
 *
 * Synthetic-only invariant: Synthea emits SYNTHETIC patients by construction. This
 * wrapper never accepts, reads, or forwards a real patient record — its only input is
 * a generation profile (module + count + seed).
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The commit this wrapper targets, read from the harvest manifest (single source of truth). */
export function syntheaPin() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "integration/harvest-manifest.json"), "utf8"));
  const el = manifest.elements.find((e) => e.ref === "dir-synthea");
  return el ? { repo: el.repo, url: el.url, commit: el.pinned_commit, licence: el.licence } : null;
}

/**
 * Locate a runnable Synthea distribution. Configured by env (no secrets — a jar path):
 *   HEYDOC_SYNTHEA_JAR  — absolute path to a built synthea-with-dependencies.jar
 * plus a `java` on PATH. Returns { java, jar } or null when the toolchain is absent.
 */
export function locateSynthea() {
  const jar = process.env.HEYDOC_SYNTHEA_JAR;
  if (!jar || !existsSync(jar)) return null;
  const probe = spawnSync("java", ["-version"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) return null;
  return { java: "java", jar };
}

/**
 * Generate synthetic FHIR R4 bundles with Synthea.
 *
 * @param {object} opts
 * @param {string} opts.module   Synthea module to run (e.g. a condition module).
 * @param {number} opts.count    Population size to generate.
 * @param {number} [opts.seed]   Deterministic seed (reproducible generation).
 * @param {string} opts.outDir   Directory Synthea writes FHIR output into.
 * @returns {{ available:boolean, reason?:string, fhirDir?:string, files?:string[], pin?:object }}
 */
export function generate({ module, count = 1, seed, outDir }) {
  const pin = syntheaPin();
  const tools = locateSynthea();
  if (!tools) {
    // INPUT-GATED, not a failure to hide. A Java runtime + a built Synthea jar
    // (HEYDOC_SYNTHEA_JAR) are an operator/toolchain input, like live vendor creds at H1.
    return {
      available: false,
      pin,
      reason:
        "Synthea is input-gated: set HEYDOC_SYNTHEA_JAR to a built synthea-with-dependencies.jar " +
        `and provide a Java runtime on PATH. Target pin: ${pin ? pin.repo + "@" + pin.commit : "(manifest missing)"}.`,
    };
  }
  const args = ["-jar", tools.jar, "-p", String(count)];
  if (seed !== undefined) args.push("-s", String(seed));
  if (outDir) args.push("--exporter.baseDirectory", outDir);
  if (module) args.push("-m", module);
  const res = spawnSync(tools.java, args, { encoding: "utf8" });
  if (res.status !== 0) {
    return { available: false, pin, reason: `Synthea exited ${res.status}: ${(res.stderr || "").slice(0, 200)}` };
  }
  const fhirDir = outDir ? join(outDir, "fhir") : null;
  const files = fhirDir && existsSync(fhirDir) ? readdirSync(fhirDir).filter((n) => n.endsWith(".json")) : [];
  return { available: true, pin, fhirDir, files };
}
