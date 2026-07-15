/**
 * pharm-rxnorm-harvest — resolve every ingredient name we hold to an RxNorm concept id (E6/FL-06).
 *
 * THE PROBLEM, MEASURED (not inherited). The completeness register said the 29% APF/datastore
 * name-mismatch "gates coverage" and that a miss is "a SILENT no-dose". Both were checked against the
 * live repo and both are wrong:
 *   - Coverage was gated by a hardcoded array (E1 removed it: 11 → 451 doses, normaliser still unbuilt).
 *   - A miss is NOT silent: an unrecognised name fails `knownDrug()`, and the engine returns
 *     **BLOCKED_NO_PROOF** — fail-safe AND visible. Verified: "amoxycillin", "clomifene", "Amoxil"
 *     and "totally-made-up-drug" all block rather than quietly returning no dose.
 *   - Of the 123 dose ingredients absent from every other capability, **120 are genuine coverage gaps**
 *     (we hold a dose but no interaction/scheduling fact) and only **3** are orthographic variants —
 *     and those 3 differ only against `pbs-formulary`, which is unsigned bulk data no accessor reads.
 *
 * So this is NOT a safety fix. It is a REACH fix, and that is worth stating plainly: today the 451
 * clinician-signed doses are reachable only under the exact datastore string. A prescriber writing the
 * Australian spelling "amoxycillin" gets BLOCKED_NO_PROOF while a signed dose sits in the datastore.
 * The dose exists, is attested, and is unreachable — the same shape as the TIER_A array, one level down.
 *
 * WHY RxNORM, AND WHY THIS IS NOT FUZZY MATCHING. Fuzzy-matching drug names is how you dose the wrong
 * drug; the repo says so repeatedly and it is right. This does not fuzzy-match. It asks an
 * authoritative public-domain ontology (NLM RxNorm, registered as `rxnorm-nlm`,
 * `use_restriction: content_ingest`) for a name's concept id, using **search=0 — exact/registered
 * synonym only**. Two names are treated as the same ingredient ONLY when RxNorm returns the same
 * RxCUI. Verified before building:
 *   - Look-alike pairs stay DISTINCT — 0 collisions across amlodipine/amiodarone,
 *     hydralazine/hydroxyzine, clonidine/clonazepam, vinblastine/vincristine,
 *     chlorpromazine/chlorpropamide, carbamazepine/oxcarbazepine, methotrexate/metronidazole,
 *     dexamphetamine/dexamethasone.
 *   - Real variants UNIFY: amoxicillin/amoxycillin → 723 · clomiphene/clomifene → 2596 ·
 *     dexamphetamine/dexamfetamine → 3288 · cyclosporin/ciclosporin → 3008.
 *   - Typos REFUSE: "amoxicilin", "amoxycilin", "amlodipin" → no match under search=0.
 * `search=2` (normalized) was REJECTED: it resolved "amlodipin" to 104416 (amlodipine besylate) —
 * approximate matching, which is exactly the thing that must not be in this path.
 *
 * WHAT THIS PRODUCES IS DATA, NOT AUTHORITY. A name→ingredient map is a drug-IDENTITY assertion, and
 * this repo's own precedent (the APF_TO_DATASTORE header) is that identity assertions are REPORTED,
 * never silent, and are "data a clinician can read and correct". So the output is a `-dev`,
 * `clinical_sign_off:false` dataset like every other curated dataset here, and the resolver refuses to
 * act on an unsigned map unless explicitly asked (see domain/ingredient-identity.js). It is authored
 * for KL to review, not switched on behind him.
 *
 * NOTHING IS BINNED: unresolved names are RECORDED as unresolved with their reason, never dropped. A
 * name we could not resolve is a fact about our lookup, not about the drug.
 *
 * Usage:
 *   node scripts/pharm-rxnorm-harvest.mjs --utc 2026-07-15 [--write] [--limit N] [--concurrency 8]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checksumRecords } from "./pharm-author.mjs";

const execFileAsync = promisify(execFile);

/**
 * A curl-backed `fetch` shim, for environments where Node's outbound is blocked but curl is permitted
 * (this sandbox is one: `fetch` and `node:https` both fail while curl succeeds). EXPLICIT, never a
 * silent fallback — a harvest that quietly changed transport would be a harvest whose provenance you
 * could not reason about. Selected with --via-curl and REPORTED in the run header.
 *
 * Read-only GETs to a public-domain government ontology; no credentials, no secrets, nothing written.
 */
export function curlFetch(url, { timeoutMs = 15000 } = {}) {
  return execFileAsync("curl", ["-sS", "--max-time", String(Math.ceil(timeoutMs / 1000)), "-w", "\\n%{http_code}", url], { maxBuffer: 8 << 20 })
    .then(({ stdout }) => {
      const i = stdout.lastIndexOf("\n");
      const status = Number(stdout.slice(i + 1).trim());
      const body = stdout.slice(0, i);
      return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body) };
    })
    .catch((e) => { throw new Error(`curl: ${String(e.message).slice(0, 100)}`); });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

const RXNAV = "https://rxnav.nlm.nih.gov/REST";

/** Files that are NOT an ingredient namespace the engine keys on. */
const SKIP = new Set(["capability-groups.json", "data-sources.json", "ingredient-identity.json"]);
/** Unsigned bulk open data — harvested for DETECTION (it is where the INN spellings live) but it is
 *  not a source of canonical names: no engine accessor reads it. */
const BULK = new Set(["pbs-formulary.json", "formulations.json"]);

function records(file) {
  try { return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")).records || []; }
  catch { return []; }
}

/** Every ingredient name the datastore holds, with where it came from. */
export function collectNames() {
  const names = new Map(); // lowercased name → Set(file)
  for (const f of readdirSync(DATA_DIR).filter((x) => x.endsWith(".json") && !SKIP.has(x))) {
    for (const r of records(f)) {
      for (const k of ["ingredient", "subject", "drug", "a", "b"]) {
        const v = r[k];
        if (typeof v === "string" && v.trim()) {
          const n = v.trim().toLowerCase();
          if (!names.has(n)) names.set(n, new Set());
          names.get(n).add(f);
        }
      }
    }
  }
  return names;
}

/** Resolve one name. search=0 — EXACT/registered-synonym only. Never normalized, never approximate. */
export async function resolveRxcui(name, fetchImpl = fetch) {
  const url = `${RXNAV}/rxcui.json?name=${encodeURIComponent(name)}&search=0`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`RxNav HTTP ${res.status}`);
  const body = await res.json();
  const ids = body?.idGroup?.rxnormId || [];
  if (!ids.length) return null;
  if (ids.length > 1) return { ambiguous: ids }; // >1 concept for one name → REFUSE, never pick
  return { rxcui: ids[0] };
}

/** Concept detail for an RxCUI (canonical name + term type). */
export async function conceptDetail(rxcui, fetchImpl = fetch) {
  const res = await fetchImpl(`${RXNAV}/rxcui/${rxcui}/allProperties.json?prop=names+codes`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return {};
  const body = await res.json();
  const props = body?.propConceptGroup?.propConcept || [];
  const pick = (n) => props.find((p) => p.propName === n)?.propValue;
  return { rxnorm_name: pick("RxNorm Name") ?? null };
}

/**
 * The concept's TERM TYPE — the operator's generic-vs-brand line, and it must come from RxNorm rather
 * than from an assumption about which names "look like" brands. IN/PIN/MIN = a generic ingredient
 * concept (admissible: "when a US Generic is only spelling variant or near synonym based on the same
 * INN-RXCUI this should be place in the drug_vocabulary bucket"); BN = a brand name (operator ruling:
 * US brands are NOT harvested).
 *
 * A SEPARATE CALL because `allProperties?prop=names+codes` does NOT carry TTY — it returned empty for
 * all 987 concepts on the first attempt, which would have left every international generic
 * unverifiable and (correctly) refused by the schema. Verified against the property endpoint instead.
 */
export async function conceptTty(rxcui, fetchImpl = fetch) {
  const res = await fetchImpl(`${RXNAV}/rxcui/${rxcui}/property.json?propName=TTY`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.propConceptGroup?.propConcept?.[0]?.propValue ?? null;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/**
 * Recompute `held_in` for an existing map WITHOUT re-querying RxNorm.
 *
 * A name→RxCUI resolution is a fact about RxNorm and does not change when we rename our own records.
 * `held_in` is a fact about OUR datastore and changes the moment anything is re-authored — and a map
 * whose held_in is stale is worse than no map: `doseIdentitySplit()` reads it, so a stale entry can
 * block a drug whose split was just reconciled, or miss one just created. Refresh is therefore part
 * of any re-authoring pass, not an optional tidy-up. A name we no longer hold anywhere is marked
 * `held_in: []` rather than deleted — it is still a true statement about RxNorm, and dropping it
 * would lose the record that the old spelling ever existed.
 */
export function refreshHeldIn(ds) {
  const live = collectNames();
  let moved = 0, orphaned = 0;
  for (const r of ds.records || []) {
    const now = [...(live.get(r.name.toLowerCase()) || [])].sort();
    const before = (r.held_in || []).join("|");
    if (now.join("|") !== before) { moved++; if (!now.length) orphaned++; }
    r.held_in = now;
  }
  return { moved, orphaned };
}

async function main(argv) {
  const args = argv.slice(2);
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const utc = val("--utc"); const write = args.includes("--write");
  const limit = Number(val("--limit") || 0);
  const conc = Number(val("--concurrency") || 8);
  const viaCurl = args.includes("--via-curl");
  const http = viaCurl ? curlFetch : fetch;
  if (!utc) { console.error("usage: node scripts/pharm-rxnorm-harvest.mjs --utc <YYYY-MM-DD> [--write] [--limit N] [--concurrency 8] [--via-curl]"); process.exit(2); }

  if (args.includes("--refresh-tty")) {
    const path = join(DATA_DIR, "ingredient-identity.json");
    const ds = JSON.parse(readFileSync(path, "utf8"));
    const need = ds.records.filter((r) => r.resolution === "resolved" && r.rxcui && !r.rxnorm_tty);
    const seen = new Map();
    console.log(`\npharm-rxnorm-harvest --refresh-tty: ${need.length} record(s) need a term type`);
    await pool(need, conc, async (r) => {
      if (!seen.has(r.rxcui)) {
        seen.set(r.rxcui, await conceptTty(r.rxcui, http).catch(() => null));
      }
      r.rxnorm_tty = seen.get(r.rxcui);
    });
    const byTty = {};
    for (const r of ds.records) if (r.rxnorm_tty) byTty[r.rxnorm_tty] = (byTty[r.rxnorm_tty] || 0) + 1;
    ds.records_checksum = checksumRecords(ds.records); // R-46
    if (write) writeFileSync(path, JSON.stringify(ds, null, 2) + "\n");
    console.log(`  term types: ${JSON.stringify(byTty)}`);
    console.log(`  (IN/PIN/MIN = generic — admissible per the operator ruling; BN = brand — NOT harvested)`);
    console.log(write ? "  written + re-sealed.\n" : "  --dry-run. Re-run with --write.\n");
    return;
  }

  if (args.includes("--refresh-held-in")) {
    const path = join(DATA_DIR, "ingredient-identity.json");
    const ds = JSON.parse(readFileSync(path, "utf8"));
    const { moved, orphaned } = refreshHeldIn(ds);
    ds.records_checksum = checksumRecords(ds.records); // R-46: the refresh mutated records
    if (write) writeFileSync(path, JSON.stringify(ds, null, 2) + "\n");
    console.log(`\npharm-rxnorm-harvest --refresh-held-in: ${moved} record(s) moved, ${orphaned} name(s) no longer held anywhere`);
    console.log(`  (no RxNorm call — a name→RxCUI resolution does not change when we rename our own records)`);
    console.log(write ? "  written + re-sealed.\n" : "  --dry-run. Re-run with --write.\n");
    return;
  }

  const all = collectNames();
  let names = [...all.keys()].sort();
  if (limit) names = names.slice(0, limit);
  console.log(`\npharm-rxnorm-harvest: ${names.length} distinct ingredient name(s) across the datastore`);
  console.log(`  RxNav search=0 (exact / registered synonym ONLY — never normalized, never approximate)`);
  console.log(`  transport: ${viaCurl ? "curl (--via-curl: Node outbound blocked in this environment)" : "node fetch"}`);
  console.log(`  concurrency ${conc}\n`);

  let done = 0;
  const out = await pool(names, conc, async (name) => {
    let rec;
    try {
      const r = await resolveRxcui(name, http);
      if (!r) rec = { name, rxcui: null, resolution: "unresolved", reason: "no exact/synonym match in RxNorm — recorded, not dropped" };
      else if (r.ambiguous) rec = { name, rxcui: null, resolution: "ambiguous", reason: `RxNorm returned ${r.ambiguous.length} concepts (${r.ambiguous.join(", ")}) — REFUSED; a name that resolves to more than one ingredient must never be auto-picked` };
      else {
        const d = await conceptDetail(r.rxcui, http);
        rec = { name, rxcui: r.rxcui, rxnorm_name: d.rxnorm_name ?? null, rxnorm_tty: d.rxnorm_tty ?? null, resolution: "resolved" };
      }
    } catch (e) {
      rec = { name, rxcui: null, resolution: "error", reason: String(e.message).slice(0, 120) };
    }
    rec.held_in = [...all.get(name)].sort();
    rec.provenance = {
      source: "RxNorm (NLM) via RxNav REST — exact/synonym search (search=0)",
      source_ref: "rxnorm-nlm",
      authored_by: "pharm-rxnorm-harvest (identity lookup only; no clinical judgement)",
      reviewed_by: null,
      review_status: "draft",
      version: "v0.1.0",
      effective_date: utc,
    };
    if (++done % 200 === 0) console.log(`  … ${done}/${names.length}`);
    return rec;
  });

  const resolved = out.filter((r) => r.resolution === "resolved");
  const unresolved = out.filter((r) => r.resolution === "unresolved");
  const ambiguous = out.filter((r) => r.resolution === "ambiguous");
  const errored = out.filter((r) => r.resolution === "error");

  // THE AUDIT VALUE — distinct names that RxNorm says are the SAME ingredient. Each is a place where
  // one spelling can find a fact and another cannot. This is the thing worth knowing, and it is
  // measured rather than assumed.
  const byRxcui = new Map();
  for (const r of resolved) {
    if (!byRxcui.has(r.rxcui)) byRxcui.set(r.rxcui, []);
    byRxcui.get(r.rxcui).push(r);
  }
  const collisions = [...byRxcui.entries()].filter(([, rs]) => rs.length > 1);

  console.log(`\n  resolved   ${String(resolved.length).padStart(5)}`);
  console.log(`  unresolved ${String(unresolved.length).padStart(5)}  (recorded with reason — never dropped)`);
  console.log(`  ambiguous  ${String(ambiguous.length).padStart(5)}  (REFUSED — never auto-picked)`);
  console.log(`  errors     ${String(errored.length).padStart(5)}`);
  console.log(`\n  DISTINCT NAMES RxNorm SAYS ARE THE SAME INGREDIENT: ${collisions.length}`);
  for (const [rxcui, rs] of collisions.slice(0, 25)) {
    const files = new Set(rs.flatMap((r) => r.held_in));
    console.log(`   rxcui ${String(rxcui).padEnd(8)} ${rs.map((r) => r.name).join("  ≡  ")}`);
    console.log(`      held in: ${[...files].join(", ")}`);
  }
  if (collisions.length > 25) console.log(`   … and ${collisions.length - 25} more`);

  if (!write) { console.log("\n  --dry-run (default). Re-run with --write.\n"); return; }

  const path = join(DATA_DIR, "ingredient-identity.json");
  const ds = {
    dataset_version: "pharm-ingredient-identity:v0.1.0-dev",
    capability: "ingredient_identity",
    status:
      "DEV — NOT patient-facing; NOT clinical guidance. Name→RxNorm-concept identity for every ingredient name the " +
      "datastore holds, resolved by EXACT/registered-synonym lookup (RxNav search=0) against RxNorm (NLM, public " +
      "domain, registered as rxnorm-nlm with use_restriction:content_ingest). NEVER fuzzy: normalized search " +
      "(search=2) was rejected because it resolved the typo 'amlodipin' to a different concept. Two names are the " +
      "same ingredient ONLY when RxNorm returns the same RxCUI; look-alike pairs were verified distinct (0/8 " +
      "collisions) and typos verified to refuse. A name→ingredient map is a drug-IDENTITY assertion, so this is " +
      "data a clinician reads and corrects: records author to review_status 'draft' and the resolver will not act " +
      "on an unsigned map by default.",
    generated: utc,
    attestation: {
      method: "not_yet_attested",
      clinical_sign_off: false,
      regulatory_sign_off: false,
      reviewer_id: null,
      attested_utc: null,
      recorded_by: "claude-fable-5 (agent)",
      statement:
        "Ingredient-identity map harvested from RxNorm by exact/synonym lookup. The agent made no clinical or " +
        "identity judgement of its own: every mapping is RxNorm's, recorded with its RxCUI so it can be checked. " +
        "Requires clinician review before the resolver may be trusted to redirect a dose lookup — a wrong identity " +
        "mapping doses the wrong drug, which is why nothing here is fuzzy and why this is not self-approving.",
      scope: `${out.length} names (${resolved.length} resolved, ${unresolved.length} unresolved, ${ambiguous.length} ambiguous/refused). Identity only — no dose, no clinical claim.`,
    },
    records: out,
    records_checksum: checksumRecords(out),
    last_authored_utc: null,
  };
  writeFileSync(path, JSON.stringify(ds, null, 2) + "\n");
  console.log(`\n  wrote ${out.length} record(s) → ingredient-identity.json (all review_status:draft — clinician review required)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
