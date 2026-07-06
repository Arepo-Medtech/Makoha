/**
 * run-chatty-notes — out-of-process wrapper for synthetichealth/chatty-notes
 * (#sib, Apache-2.0). FLOW_PLAN H4.
 *
 * chatty-notes turns a Synthea patient bundle into a patient-voice clinical narrative.
 * It runs OUT-OF-PROCESS behind a CLI boundary (no vendored code). This wrapper only
 * invokes an external, commit-pinned chatty-notes distribution over a Synthea bundle
 * and returns the narrative text.
 *
 * FAIL-SAFE: when the external tool is not configured, narrate() returns
 * { available:false, reason } — it NEVER fabricates a narrative. The shaper's firewall
 * de-anchoring (to-casebundle.js) still applies to whatever narrative is produced, so
 * the diagnosis label can never leak into patient voice regardless of the source.
 *
 * Synthetic-only: the input is always a SYNTHETIC Synthea bundle; no real record.
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The commit this wrapper targets, from the harvest manifest. */
export function chattyNotesPin() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "integration/harvest-manifest.json"), "utf8"));
  const el = manifest.elements.find((e) => e.ref === "sib-chatty-notes");
  return el ? { repo: el.repo, url: el.url, commit: el.pinned_commit, licence: el.licence } : null;
}

/**
 * Locate a runnable chatty-notes distribution. Configured by env (no secrets):
 *   HEYDOC_CHATTY_NOTES_CMD — path to an executable/script that reads a Synthea bundle
 *                             path as argv[1] and writes narrative text to stdout.
 */
export function locateChattyNotes() {
  const cmd = process.env.HEYDOC_CHATTY_NOTES_CMD;
  return cmd && existsSync(cmd) ? { cmd } : null;
}

/**
 * Produce a patient-voice narrative from a Synthea bundle file.
 * @param {string} bundlePath Path to a synthetic Synthea FHIR bundle.
 * @returns {{ available:boolean, reason?:string, narrative?:string, pin?:object }}
 */
export function narrate(bundlePath) {
  const pin = chattyNotesPin();
  const tool = locateChattyNotes();
  if (!tool) {
    return {
      available: false,
      pin,
      reason:
        "chatty-notes is input-gated: set HEYDOC_CHATTY_NOTES_CMD to an executable that " +
        `emits a patient-voice narrative for a Synthea bundle. Target pin: ${pin ? pin.repo + "@" + pin.commit : "(manifest missing)"}.`,
    };
  }
  const res = spawnSync(tool.cmd, [bundlePath], { encoding: "utf8" });
  if (res.status !== 0) {
    return { available: false, pin, reason: `chatty-notes exited ${res.status}: ${(res.stderr || "").slice(0, 200)}` };
  }
  return { available: true, pin, narrative: (res.stdout || "").trim() };
}
