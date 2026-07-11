#!/usr/bin/env node
/**
 * check-secrets — first-party blocking secret scan (LIVE_PLAN L2, R-38).
 *
 * Charter <security_and_secrets>: add secret-scanning to CI before any
 * production path. This scanner is deliberately FIRST-PARTY and deterministic
 * (no third-party action, no network, locally runnable — same posture as
 * licence:check) and targets HIGH-CONFIDENCE credential shapes, so a hit is a
 * build-blocking defect, not noise:
 *
 *   - private key blocks (PEM)                       -----BEGIN ... PRIVATE KEY-----
 *   - AWS access key ids                             AKIA[0-9A-Z]{16}
 *   - GitHub tokens                                  gh[pousr]_[A-Za-z0-9]{36,}
 *   - Anthropic API keys                             sk-ant-[A-Za-z0-9-]{20,}
 *   - Slack tokens                                   xox[baprs]-[A-Za-z0-9-]{10,}
 *   - Google API keys                                AIza[0-9A-Za-z_-]{35}
 *   - JWTs with a signature                          eyJ...\.eyJ...\.<sig>
 *
 * Scans TRACKED files only (git ls-files) — .gitignore'd local material
 * (Projects/, .heydoc-data, certs) is out of scope by definition; committing
 * it is what this gate exists to catch. `example.invalid` placeholders are
 * fine (they are not credential-shaped). Org-grade SAST remains an operator
 * tool choice (R-38 remainder).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  { name: "private-key-block", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "aws-access-key-id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "anthropic-api-key", re: /\bsk-ant-[A-Za-z0-9-]{20,}\b/ },
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "signed-jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

// Binary-ish extensions we skip (content scan is for text).
const SKIP_EXT = /\.(png|jpg|jpeg|gif|pdf|zip|gz|tgz|woff2?|ttf|ico|docx|xlsx|pptx)$/i;

const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter((f) => f && !SKIP_EXT.test(f));

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // unreadable/binary — skip
  }
  for (const { name, re } of PATTERNS) {
    const m = text.match(re);
    if (m) {
      const line = text.slice(0, m.index).split("\n").length;
      // Never echo the matched value — name the shape and the location only.
      findings.push({ file, line, pattern: name });
    }
  }
}

if (findings.length) {
  console.error("check-secrets: BLOCKING — credential-shaped content in tracked files:");
  for (const f of findings) console.error(`  [${f.pattern}] ${f.file}:${f.line}`);
  console.error("Remove the secret, rotate it (it is burned), and inject at deploy via the secrets manager.");
  process.exit(1);
}
console.log(`check-secrets: PASS (${files.length} tracked files, 0 findings)`);
