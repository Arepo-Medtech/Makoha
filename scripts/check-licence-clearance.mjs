#!/usr/bin/env node
/**
 * licence:check — the harvest licence + identity gate (FLOW_PLAN milestone H0).
 *
 * Nothing gets harvested until the licence and identity gates exist as machine
 * checks. This is that gate. It reads the allow-list manifest
 * (integration/harvest-manifest.json — the source of truth) and enforces the
 * FLOW_PLAN 6.2 licence floor mechanically, BLOCKING (exit 1) on:
 *
 *   BLOCK 1  AGPL/GPL in a shippable module — a copyleft SPDX identifier or
 *            copyleft licence header found in any tracked file under a shippable
 *            path. open-health (#13, AGPL-3.0) and fasten-onprem (GPL-3.0) are
 *            reference-only; their code may NEVER enter a shippable path (G1).
 *   BLOCK 2  Off-manifest / dropped / deferred repo pulled in — a DROP or DEFER
 *            repo token appearing as a dependency in package.json / lockfile, or
 *            a harvested integration present at a DROP/DEFER target (G6).
 *   BLOCK 3  Unresolved-licence dep on a shippable path — a manifest row whose
 *            licence_status is "pending" with a harvested integration present at
 *            its SHIPPABLE target (wrapped before its licence was cleared) (G13).
 *   BLOCK 4  MedRAG conflation — gzxiong/MedRAG (MIRAGE harness, #20) and
 *            SNOWTEAM2023/MedRAG (reference) must both exist, carry distinct
 *            URLs, and cross-reference via do_not_conflate_with (G5).
 *   BLOCK 5  RCE-floor pin — a row that declares a security-patch floor
 *            (rce_floor) must be commit-pinned and carry a pinned_version at or
 *            above the floor (semver-gte), so a later bump can never silently
 *            drop below a security patch. ToolUniverse #28: floor v1.3.0, the
 *            release that patched the unauthenticated code-executor RCE (G2).
 *
 * Plus manifest self-validation (zod): every row has the required shape; an
 * ADOPT row must carry a resolvable URL; a shippable row must name a target.
 *
 * "Harvest present" at a target: for a genuinely new module, directory existence
 * is the signal; for an override-existing target (a first-party mock the harvest
 * wraps in place, e.g. fhir-broker/docs), the directory always exists, so the
 * signal is the live-backend MARKER file a real wrap creates (H1+). This keeps
 * BLOCK 2b/3 from firing on our own mock servers.
 *
 * H0 STATE: the gate is armed-and-green. No harvested code is in the tree yet
 * (H0 authorises none), so every BLOCK passes vacuously today — the point is the
 * gate exists BEFORE H1 harvests anything. WARN (non-blocking) flags ADOPT rows
 * still awaiting a commit-pin; pinning becomes mandatory when a repo is wrapped.
 *
 * SCORING-STORE FIREWALL: this script never reads data/cases content. It scans
 * source under shippable paths for licence headers only; case node bodies
 * (10-13) are not on any shippable path and are never opened.
 *
 * Usage: node scripts/check-licence-clearance.mjs
 * Exit:  0 = PASS (gate clear) · 1 = FAIL (a BLOCK fired, or manifest invalid)
 *
 * Testable: exports runCheck({ repoRoot, manifest }) so the contract test can
 * drive fixtures without touching the live tree.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// ── Manifest contract (zod; .strict mirrors additionalProperties:false) ────────
const ElementSchema = z
  .object({
    ref: z.string().min(1),
    repo: z.string().min(1),
    url: z.string().url().nullable(),
    pinned_commit: z.string().nullable(),
    pin_status: z.enum([
      "pinned",
      "unpinned_pending_adoption",
      "unverified_directory_listed",
      "na",
    ]),
    licence: z.string().min(1),
    licence_status: z.enum(["verified", "pending", "copyleft_reference_only", "first_party"]),
    verdict: z.enum(["ADOPT", "REFERENCE", "DEFER", "DROP"]),
    mode: z.enum(["WRAP", "FORK", "PATTERN-LIFT", "BENCHMARK", "INTEGRATE", "REFERENCE", "DEFER", "DROP"]),
    target_module: z.string().nullable(),
    shippable: z.boolean(),
    governance_gate: z.string().nullable(),
    adoption_step: z.union([z.number().int(), z.string()]).nullable(),
    do_not_conflate_with: z.string().optional(),
    // RCE-floor pin (FLOW_PLAN H5, G2): a row that adopts a package with a known
    // security-patch release floor declares rce_floor (the minimum safe version)
    // and pinned_version (the version its pinned_commit corresponds to). BLOCK 5
    // enforces pinned_version >= rce_floor so a later bump can never silently drop
    // below the patch. Optional — only rows with a security floor carry them.
    pinned_version: z.string().optional(),
    rce_floor: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict()
  .refine((e) => e.verdict !== "ADOPT" || e.url !== null, {
    message: "ADOPT row must carry a non-null url (identity pin)",
  })
  .refine((e) => !e.shippable || e.target_module !== null, {
    message: "shippable row must name a target_module",
  });

const ConfigSchema = z
  .object({
    shippable_paths: z.array(z.string()).min(1),
    non_shippable_paths: z.array(z.string()),
    blocked_spdx: z.array(z.string()).min(1),
    blocked_licence_phrases: z.array(z.string()),
    spdx_scan_exclude: z.array(z.string()),
    spdx_scan_extensions: z.array(z.string()).min(1),
    spdx_scan_filenames: z.array(z.string()),
    _override_existing_note: z.string().optional(),
    override_existing_targets: z.record(z.string(), z.string()).default({}),
  })
  .strict();

const ManifestSchema = z
  .object({
    _note: z.string(),
    version: z.string(),
    generated: z.string(),
    milestone: z.string(),
    source: z.string(),
    config: ConfigSchema,
    elements: z.array(ElementSchema).min(1),
  })
  .strict();

const repoToken = (repo) => repo.split("/").pop().toLowerCase();

/**
 * Parse a dotted version ("v1.3.1", "1.0.11.2") into a numeric segment array.
 * Strips a leading "v"; a non-numeric or empty segment yields NaN (→ invalid).
 * Returns null if the string has no numeric segments at all.
 */
function parseVersion(v) {
  const segs = String(v == null ? "" : v).trim().replace(/^v/i, "").split(".");
  if (!segs.length || segs[0] === "") return null;
  const nums = segs.map((s) => Number(s));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return nums;
}

/**
 * Semver-style ordered compare of two parsed version arrays.
 * Missing trailing segments count as 0 (1.3 == 1.3.0). Returns -1|0|1.
 */
function compareVersions(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** True iff version `v` is >= floor `f`; false if either is unparseable. */
export function versionMeetsFloor(v, f) {
  const pv = parseVersion(v);
  const pf = parseVersion(f);
  if (!pv || !pf) return false;
  return compareVersions(pv, pf) >= 0;
}

/**
 * Run the gate against a manifest + a repo root. Pure (no process.exit, no
 * printing): returns { ok, failures, warnings, summary, schemaError }.
 */
export function runCheck({ repoRoot, manifest }) {
  const failures = [];
  const warnings = [];
  const fail = (m) => failures.push(m);
  const warn = (m) => warnings.push(m);

  const parsed = ManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    return {
      ok: false,
      failures: parsed.error.issues.map((i) => `[schema] ${i.path.join(".")}: ${i.message}`),
      warnings: [],
      schemaError: true,
      summary: null,
    };
  }
  const { config, elements } = parsed.data;
  const overrides = config.override_existing_targets;

  const walk = (relDir) => {
    const abs = join(repoRoot, relDir);
    if (!existsSync(abs)) return [];
    const out = [];
    for (const name of readdirSync(abs)) {
      if (name === "node_modules" || name === ".git") continue;
      const relPath = join(relDir, name);
      const st = statSync(join(repoRoot, relPath));
      if (st.isDirectory()) out.push(...walk(relPath));
      else out.push(relPath);
    }
    return out;
  };

  // Is a harvested integration actually present at this target? (see file header)
  const harvestPresent = (targetModule) => {
    const dir = targetModule.replace(/\/$/, "");
    const marker = overrides[dir];
    if (marker) return existsSync(join(repoRoot, marker));
    return existsSync(join(repoRoot, dir));
  };

  // ── BLOCK 1: AGPL/GPL SPDX / header in a shippable module ──────────────────
  const spdxRe = new RegExp(
    `SPDX-License-Identifier:\\s*(${config.blocked_spdx
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})`,
    "i"
  );
  const phraseRes = config.blocked_licence_phrases.map((p) => new RegExp(p, "i"));
  const scanExt = new Set(config.spdx_scan_extensions);
  const scanNames = new Set(config.spdx_scan_filenames.map((n) => n.toLowerCase()));

  for (const shipPath of config.shippable_paths) {
    for (const file of walk(shipPath)) {
      if (config.spdx_scan_exclude.includes(file)) continue;
      const nameNoExt = basename(file).replace(/\.[^.]+$/, "").toLowerCase();
      const scannable =
        scanExt.has(extname(file)) ||
        scanNames.has(basename(file).toLowerCase()) ||
        scanNames.has(nameNoExt);
      if (!scannable) continue;
      let text;
      try {
        text = readFileSync(join(repoRoot, file), "utf8");
      } catch {
        continue;
      }
      if (spdxRe.test(text)) {
        fail(`BLOCK 1 (copyleft in shippable): ${file} declares a blocked SPDX licence (AGPL/GPL). Copyleft code must not enter a shippable path (G1).`);
      } else {
        for (const re of phraseRes) {
          if (re.test(text)) {
            fail(`BLOCK 1 (copyleft in shippable): ${file} contains a copyleft licence header ("${re.source}"). Not permitted on a shippable path (G1).`);
            break;
          }
        }
      }
    }
  }

  // ── BLOCK 2: dropped/deferred/off-manifest repo pulled in ──────────────────
  const denyTokens = new Map();
  for (const e of elements) {
    if (e.verdict === "DROP" || e.verdict === "DEFER") denyTokens.set(repoToken(e.repo), e.repo);
  }
  for (const depFile of ["package.json", "package-lock.json"]) {
    const abs = join(repoRoot, depFile);
    if (!existsSync(abs)) continue;
    let deps = {};
    try {
      const j = JSON.parse(readFileSync(abs, "utf8"));
      deps = { ...(j.dependencies || {}), ...(j.devDependencies || {}), ...(j.packages || {}) };
    } catch {
      continue;
    }
    for (const depName of Object.keys(deps)) {
      const token = depName.split("/").pop().toLowerCase();
      if (denyTokens.has(token)) {
        fail(`BLOCK 2 (dropped/deferred repo pulled in): ${depFile} dependency "${depName}" matches DROP/DEFER manifest row ${denyTokens.get(token)} — must not be a dependency (G6).`);
      }
    }
  }
  for (const e of elements) {
    if (!e.target_module || !(e.target_module.endsWith("/") || !extname(e.target_module))) continue;
    if ((e.verdict === "DROP" || e.verdict === "DEFER") && harvestPresent(e.target_module)) {
      fail(`BLOCK 2 (dropped/deferred repo pulled in): a harvested integration is present at "${e.target_module}" but its manifest row ${e.repo} is ${e.verdict} — remove or re-verdict (G6).`);
    }
  }

  // ── BLOCK 3: unresolved-licence (pending) dep on a SHIPPABLE path ───────────
  for (const e of elements) {
    if (e.licence_status !== "pending" || !e.shippable || !e.target_module) continue;
    if (harvestPresent(e.target_module)) {
      fail(`BLOCK 3 (unresolved licence on shippable path): ${e.repo} (#${e.ref}) has licence_status=pending but a harvested integration is present at its shippable target "${e.target_module}" — clear the licence on-repo (flip to verified) before wrapping (G13).`);
    }
  }

  // ── BLOCK 4: MedRAG conflation guard ────────────────────────────────────────
  const medrag = elements.filter((e) => /(^|\/)MedRAG$/i.test(e.repo));
  if (medrag.length !== 2) {
    fail(`BLOCK 4 (MedRAG conflation): expected exactly 2 MedRAG rows (gzxiong + SNOWTEAM2023), found ${medrag.length} (G5).`);
  } else {
    const [a, b] = medrag;
    if (a.url && b.url && a.url === b.url) fail("BLOCK 4 (MedRAG conflation): the two MedRAG rows share a URL — they must be distinct repos (G5).");
    const cross = (x, y) => x.do_not_conflate_with && y.repo.endsWith(x.do_not_conflate_with.split("/").pop());
    if (!cross(a, b) || !cross(b, a)) {
      fail("BLOCK 4 (MedRAG conflation): the two MedRAG rows must cross-reference each other via do_not_conflate_with (G5).");
    }
  }

  // ── BLOCK 5: RCE-floor pin enforcement (FLOW_PLAN H5, G2) ───────────────────
  // A row that declares a security-patch floor (rce_floor) MUST be commit-pinned,
  // carry a parseable pinned_version, and satisfy pinned_version >= rce_floor.
  // This makes the floor mechanical: a later bump to a commit whose version drops
  // below the patched release fails CI. (ToolUniverse #28: floor v1.3.0, the
  // release that patched the unauthenticated python_code_executor RCE.)
  for (const e of elements) {
    if (e.rce_floor === undefined) continue;
    if (e.pin_status !== "pinned" || !e.pinned_commit) {
      fail(`BLOCK 5 (RCE-floor pin): ${e.repo} (#${e.ref}) declares rce_floor=${e.rce_floor} but is not commit-pinned — a security-floor row must pin an exact commit (G2).`);
      continue;
    }
    if (e.pinned_version === undefined || parseVersion(e.pinned_version) === null) {
      fail(`BLOCK 5 (RCE-floor pin): ${e.repo} (#${e.ref}) declares rce_floor=${e.rce_floor} but has no parseable pinned_version — cannot prove the pin is at/above the floor (G2).`);
      continue;
    }
    if (parseVersion(e.rce_floor) === null) {
      fail(`BLOCK 5 (RCE-floor pin): ${e.repo} (#${e.ref}) has an unparseable rce_floor "${e.rce_floor}" (G2).`);
      continue;
    }
    if (!versionMeetsFloor(e.pinned_version, e.rce_floor)) {
      fail(`BLOCK 5 (RCE-floor pin): ${e.repo} (#${e.ref}) pinned_version ${e.pinned_version} is BELOW the security floor ${e.rce_floor} — a pin below the patched release re-opens the RCE (G2). Bump the pin to a release at/above ${e.rce_floor}.`);
    }
  }

  // ── WARN: ADOPT rows not yet commit-pinned (mandatory at adoption, not H0) ──
  for (const e of elements) {
    if (e.verdict === "ADOPT" && e.pin_status === "unpinned_pending_adoption") {
      warn(`ADOPT ${e.repo} (#${e.ref}) is not commit-pinned yet — pin an exact commit before wrapping at H1+ (G5/G13).`);
    }
  }

  const summary = {
    version: parsed.data.version,
    elements: elements.length,
    adopt: elements.filter((e) => e.verdict === "ADOPT").length,
    reference: elements.filter((e) => e.verdict === "REFERENCE").length,
    defer: elements.filter((e) => e.verdict === "DEFER").length,
    drop: elements.filter((e) => e.verdict === "DROP").length,
    shippable: elements.filter((e) => e.shippable).length,
    pendingShippable: elements.filter((e) => e.shippable && e.licence_status === "pending").length,
    shippablePaths: config.shippable_paths,
    rceFloors: elements
      .filter((e) => e.rce_floor !== undefined)
      .map((e) => `${e.repo}@${e.pinned_version || "unpinned"} (floor ${e.rce_floor})`),
  };
  return { ok: failures.length === 0, failures, warnings, schemaError: false, summary };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoRoot = process.env.HEYDOC_HARVEST_ROOT || join(__dirname, "..");
  const manifestPath =
    process.env.HEYDOC_HARVEST_MANIFEST || join(repoRoot, "integration/harvest-manifest.json");

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.error(`licence:check: cannot read manifest at ${manifestPath}: ${err.message}`);
    process.exit(1);
  }

  const { ok, failures, warnings, schemaError, summary } = runCheck({ repoRoot, manifest });

  console.log("licence:check — harvest licence + identity gate (FLOW_PLAN H0)");
  if (schemaError) {
    console.error("  manifest FAILED contract validation:");
    for (const f of failures) console.error(`  ${f}`);
    console.log("licence:check: FAIL (blocking)");
    process.exit(1);
  }
  console.log(`  manifest:            ${manifestPath.replace(repoRoot + "/", "")} (v${summary.version})`);
  console.log(`  elements:            ${summary.elements} (${summary.adopt} ADOPT · ${summary.reference} REFERENCE · ${summary.defer} DEFER · ${summary.drop} DROP)`);
  console.log(`  shippable targets:   ${summary.shippable} (${summary.pendingShippable} still licence-pending — blocked from shipping until cleared)`);
  console.log(`  shippable paths:     ${summary.shippablePaths.join(", ")}`);
  if (summary.rceFloors.length) console.log(`  RCE-floor pins:      ${summary.rceFloors.join(" · ")}`);
  console.log(`  warnings:            ${warnings.length}`);
  for (const w of warnings) console.log(`  [warn] ${w}`);
  console.log(`  blocks:              ${failures.length}`);
  for (const f of failures) console.error(`  [BLOCK] ${f}`);
  console.log(ok ? "licence:check: PASS" : "licence:check: FAIL (blocking)");
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
