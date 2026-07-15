/**
 * pharm-inn-reconcile — make the INN name the PRIMARY identity across every capability (E7).
 *
 * OPERATOR RULING 2026-07-15: *"re-author all listings so the INN name is the primary identity so
 * links to the capabilities or medication related content are never lost or not linked based on a
 * misnomer."*
 *
 * WHY: E6 proved the datastore carries TWO name-spaces. dose-guidance came from APF22 (Australian
 * Approved Names, some pre-harmonisation); every other capability uses the INN. The result was a dose
 * emitted while its safety checks were inert — `frusemide` PASSed with a dose while `furosemide`, the
 * same drug, HARD_FAILed on a severe interaction. One primary identity per drug ends that by
 * construction rather than by a guard.
 *
 * ══ THE TRAP IN THIS RULING, AND THE GUARD THAT DEFUSES IT ══
 *
 * **RxNorm's canonical name is the USAN, NOT the INN.** Taking `rxnorm_name` as "the INN" would have
 * renamed, across an AUSTRALIAN clinical system:
 *
 *     paracetamol → acetaminophen      salbutamol → albuterol      adrenaline → epinephrine
 *
 * (verified: RxNorm canonical for rxcui 161 is "acetaminophen", 435 is "albuterol", 3992 is
 * "epinephrine".) That is the jurisdiction inversion this repo exists to prevent — a US ontology
 * silently overwriting AU clinical vocabulary — and it would have been done in the name of
 * "standardising". It is also invisible in the collision report, because the US spelling never
 * appears in our data, so nothing would have flagged it.
 *
 * THE GUARD, and it is structural rather than a rule someone must remember:
 *   1. **The primary may only ever be a name the datastore ALREADY HOLDS.** No new string is ever
 *      introduced, so an RxNorm-only US name cannot enter. paracetamol stays paracetamol because
 *      "acetaminophen" is not ours to pick from.
 *   2. **PBS wins.** The Pharmaceutical Benefits Scheme is the Australian Government's own formulary
 *      — an AU-jurisdiction naming authority, not a US one. Verified against all 19 collision groups:
 *      where PBS holds a name, it IS the INN (beclometasone, chlortalidone, clomifene, dexamfetamine,
 *      hydroxycarbamide, indometacin, cefalexin, benzatropine, furosemide, formoterol, lidocaine…) —
 *      and in 9 of those it DISAGREES with RxNorm's canonical, which is exactly the trap.
 *   3. **Ambiguity REFUSES.** Two PBS names, or no PBS name and the capabilities disagree → no rename,
 *      flagged for the clinician. Ambiguity is not resolved by choosing.
 *
 * WHAT IS NOT RENAMED: `pbs-formulary.json` and `formulations.json` are MIRRORS of external sources.
 * Rewriting a mirror makes it a forgery of its upstream — PBS is the authority here, not a consumer,
 * and no engine accessor reads either file.
 *
 * THE CLINICIAN'S WORD IS NOT LOST. KL attested "frusemide"; the record becomes `furosemide` with
 * `also_known_as: ["frusemide"]` and `attested_as` preserved. The dose TEXT — the thing he actually
 * signed — is byte-unchanged, so his attestation stands on what he reviewed. The rename is a datastore
 * IDENTITY decision, recorded in `attestation.rename_history[]` with its RxCUI and its authority, not
 * a silent edit of his content.
 *
 * RE-SEAL IS MANDATORY (R-46): renaming mutates records, so every touched dataset is re-sealed in the
 * same pass that causes the drift.
 *
 * Usage: node scripts/pharm-inn-reconcile.mjs --utc 2026-07-15 [--write]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checksumRecords } from "./pharm-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

/** External mirrors — never rewritten. PBS is the naming AUTHORITY, not a consumer. */
export const MIRRORS = new Set(["pbs-formulary.json", "formulations.json"]);
/** Not ingredient namespaces. */
const NON_DATA = new Set(["data-sources.json", "capability-groups.json", "ingredient-identity.json"]);
/** The files the engine's eight accessors key on — a split across THESE is what inerts a check. */
const ENGINE = new Set(["dose-guidance.json", "drug-interactions.json", "renal-rules.json", "nti-register.json",
  "au-scheduling.json", "pregnancy-risk.json", "hepatic.json", "allergy-cross-reactivity.json"]);
/** Every field that names a drug. */
const NAME_KEYS = ["ingredient", "subject", "drug", "a", "b"];

const lc = (s) => String(s || "").trim().toLowerCase();

function load(file) {
  try { return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")); } catch { return null; }
}

/**
 * Decide the primary name for each RxCUI group. Returns { renames, refused }.
 * `renames`: Map<oldName, { primary, rxcui, authority }>
 */
export function planRenames(identity) {
  const groups = new Map();
  for (const r of identity.records || []) {
    if (r.resolution !== "resolved" || !r.rxcui) continue;
    if (!groups.has(r.rxcui)) groups.set(r.rxcui, []);
    groups.get(r.rxcui).push(r);
  }

  const renames = new Map();
  const refused = [];
  for (const [rxcui, members] of groups) {
    if (members.length < 2) continue;

    // GUARD 1 — candidates are ONLY names we already hold. An RxNorm-canonical US name that is not
    // in our data can never be chosen, so paracetamol can never become acetaminophen.
    const pbs = members.filter((m) => (m.held_in || []).includes("pbs-formulary.json"));

    let primary = null; let authority = null;
    if (pbs.length === 1) {
      primary = pbs[0].name;                                   // GUARD 2 — PBS (AU) wins
      authority = "PBS (Australian Government formulary) — the AU naming authority";
    } else if (pbs.length === 0) {
      // No PBS entry: fall back to the name the ENGINE capabilities already use (INN-aligned).
      const scored = members
        .map((m) => ({ m, n: (m.held_in || []).filter((f) => ENGINE.has(f) && f !== "dose-guidance.json").length }))
        .sort((a, b) => b.n - a.n);
      if (scored[0].n > 0 && (scored.length < 2 || scored[0].n > scored[1].n)) {
        primary = scored[0].m.name;
        authority = "the engine capabilities' existing name (INN-aligned); no PBS entry for this concept";
      }
    }

    if (!primary) {
      // GUARD 3 — ambiguity REFUSES. Never resolved by choosing.
      refused.push({
        rxcui, names: members.map((m) => m.name).sort(),
        reason: pbs.length > 1
          ? `PBS holds ${pbs.length} of these names (${pbs.map((p) => p.name).join(", ")}) — the AU authority does not settle it`
          : "no PBS entry and the capabilities do not settle a primary",
      });
      continue;
    }

    for (const m of members) {
      if (lc(m.name) === lc(primary)) continue;
      renames.set(lc(m.name), { primary, rxcui, authority });
    }
  }
  return { renames, refused };
}

function main(argv) {
  const args = argv.slice(2);
  const utc = (() => { const i = args.indexOf("--utc"); return i >= 0 ? args[i + 1] : undefined; })();
  const write = args.includes("--write");
  if (!utc) { console.error("usage: node scripts/pharm-inn-reconcile.mjs --utc <YYYY-MM-DD> [--write]"); process.exit(2); }

  const identity = load("ingredient-identity.json");
  if (!identity) { console.error("ingredient-identity.json missing — run pharm-rxnorm-harvest first"); process.exit(2); }

  const { renames, refused } = planRenames(identity);

  console.log(`\npharm-inn-reconcile: INN-primary identity (operator ruling ${utc})\n`);
  console.log(`  GUARD: the primary may only be a name the datastore ALREADY HOLDS — no new string is`);
  console.log(`  ever introduced, so an RxNorm-canonical US name (acetaminophen, albuterol,`);
  console.log(`  epinephrine) cannot enter. PBS — the AU government formulary — is the authority.\n`);
  // Classify each rename by the KIND of claim it makes. Not all are equal, and pretending they are
  // would hide the two that actually want a clinician's eye:
  //   ORTHOGRAPHIC — the same word spelled differently (frusemide/furosemide). RxNorm agreeing is
  //     confirmation of a spelling, and the risk of being wrong is ~nil.
  //   SUBSTANTIVE  — different words RxNorm considers one concept (thyroxine/levothyroxine,
  //     erythropoietin/epoetin alfa: a hormone and its recombinant product). PBS authorises the drug
  //     name and the ruling is faithful — but this is a CLINICAL identity claim, not an orthographic
  //     one, and it is surfaced as such rather than buried in a list of spelling fixes.
  // Fold the known BrE/AmE ↔ INN orthographic rules, then measure edit distance on what remains. A
  // pure fold-equality test cries wolf — it called beclomethasone→beclometasone (th→t) a clinical
  // claim, and a flag that fires on 13 of 18 is a flag nobody reads.
  const fold = (s) => s.toLowerCase().replace(/[^a-z ]/g, "")
    .replace(/ph/g, "f").replace(/th/g, "t").replace(/ch/g, "c")
    .replace(/ae|oe/g, "e").replace(/y/g, "i").replace(/ll/g, "l");
  const lev = (a, b) => {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  };
  // ≤2 edits after folding = a spelling of the same word. More = different words.
  const kind = (a, b) => (lev(fold(a), fold(b)) <= 2 ? "orthographic" : "SUBSTANTIVE");

  const planned = [...renames].sort((a, b) => a[1].primary.localeCompare(b[1].primary));
  console.log(`  ${renames.size} rename(s) planned:\n`);
  for (const [old, r] of planned) {
    const k = kind(old, r.primary);
    console.log(`   ${old.padEnd(30)} → ${r.primary.padEnd(30)} rxcui ${String(r.rxcui).padEnd(8)} ${k === "SUBSTANTIVE" ? "⚠️  SUBSTANTIVE" : ""}`);
  }
  const subs = planned.filter(([o, r]) => kind(o, r.primary) === "SUBSTANTIVE");
  if (subs.length) {
    console.log(`\n  ⚠️  ${subs.length} are SUBSTANTIVE, not orthographic — different words RxNorm treats as one`);
    console.log(`      concept. PBS authorises each, and the ruling is faithful, but these are CLINICAL`);
    console.log(`      identity claims and want the clinician's eye rather than a spelling reviewer's:`);
    for (const [o, r] of subs) console.log(`        ${o}  →  ${r.primary}`);
  }
  if (refused.length) {
    console.log(`\n  ${refused.length} REFUSED (ambiguity is not resolved by choosing):`);
    for (const r of refused) console.log(`   rxcui ${r.rxcui}: ${r.names.join(" ≡ ")}\n      ${r.reason}`);
  }

  // Apply across every capability EXCEPT the external mirrors.
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json") && !NON_DATA.has(f) && !MIRRORS.has(f));
  const touched = [];
  for (const f of files) {
    const ds = load(f);
    if (!ds?.records) continue;
    let n = 0;
    for (const rec of ds.records) {
      for (const k of NAME_KEYS) {
        const v = rec[k];
        if (typeof v !== "string") continue;
        const hit = renames.get(lc(v));
        if (!hit) continue;
        // Preserve the clinician's word — never lose what he actually wrote.
        if (k === "ingredient" || k === "subject") {
          const aka = new Set(rec.also_known_as || []);
          aka.add(v);
          rec.also_known_as = [...aka].sort();
          if (rec.provenance?.review_status === "approved" && !rec.attested_as) rec.attested_as = v;
        }
        rec[k] = hit.primary;
        n++;
      }
    }
    if (n) touched.push({ file: f, count: n, ds });
  }

  console.log(`\n  ${touched.length} dataset(s) affected:`);
  for (const t of touched) console.log(`   ${t.file.padEnd(34)} ${String(t.count).padStart(4)} field(s)`);

  if (!write) { console.log("\n  --dry-run (default). Re-run with --write.\n"); return; }

  for (const t of touched) {
    const prior = t.ds.records_checksum;
    // R-46: the rename mutated the records, so re-seal in the SAME pass that caused the drift.
    t.ds.records_checksum = checksumRecords(t.ds.records);
    if (t.ds.attestation) {
      t.ds.attestation.rename_history = [
        ...(t.ds.attestation.rename_history || []),
        {
          renamed_utc: utc,
          prior_checksum: prior,
          new_checksum: t.ds.records_checksum,
          fields_renamed: t.count,
          basis:
            "E7 — operator ruling: the INN name is the PRIMARY identity so a link to a capability is never lost to a misnomer. " +
            "The primary was chosen ONLY from names the datastore already held (so no US/RxNorm-canonical name could enter — " +
            "paracetamol/salbutamol/adrenaline are untouched), with PBS (the Australian Government formulary) as the authority; " +
            "ambiguous concepts were REFUSED, not guessed. Clinical content is unchanged: only the drug's identity key moved, " +
            "and every prior name is preserved in also_known_as (and attested_as where a clinician had signed it), so the " +
            "clinician's own word is not lost. Re-sealed here because the rename mutates records (R-46).",
        },
      ];
    }
    writeFileSync(join(DATA_DIR, t.file), JSON.stringify(t.ds, null, 2) + "\n");
  }
  console.log(`\n  wrote ${touched.length} dataset(s); each re-sealed with its basis recorded (R-46).\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
