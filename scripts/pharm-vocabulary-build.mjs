/**
 * pharm-vocabulary-build — the unifying drug vocabulary (E8).
 *
 * OPERATOR TASK 2026-07-15: *"'Drug vocabulary (Using the PBS INN Australian name as Primary
 * authority)': catch and list all the names, synonyms, international variants and minor spelling
 * variants that eventually get used interchangeably on occasion — so they link to the unifying
 * identifier… unifying the prevalent use of variants by patients, doctors and systems."*
 *
 * WHY. E6 found that a misnomer could inert a safety check: `frusemide` emitted a dose with a PASSing
 * interaction check while `furosemide` — the same drug — HARD_FAILed on a severe interaction. E7 fixed
 * the six known splits by making the INN primary. This is the general case, built once: patients say
 * "Lasix", doctors write "frusemide", systems store "furosemide". One identity, or the next split is
 * already waiting.
 *
 * ══ SOURCES, AND WHY EACH IS ALLOWED HERE ══
 *   PBS (pbs-formulary.json) — the AUTHORITY. The Australian Government's own formulary: 1239
 *     ingredients, 3655 AU brand names, 957 ATC codes. AU brands come from an AU source, NOT from
 *     RxNorm's US brand table — which is what keeps a US brand from ever steering an AU lookup.
 *   ingredient-identity.json — the RxCUI, the international concept id that links our strings to
 *     something outside our own head.
 *   The datastore's own names + `also_known_as` — names WE already used for that drug (E7).
 *
 * ══ THE THING THIS MUST NOT DO ══
 * RxNorm's canonical name is the USAN, NOT the INN. `rxnorm_name` for paracetamol is "acetaminophen",
 * for salbutamol "albuterol", for adrenaline "epinephrine". A vocabulary that treated those as
 * primaries would Americanise an Australian clinical system, and it would look like standardisation.
 * So: RxNorm supplies the IDENTIFIER (RxCUI), never the AU name.
 *
 * ══ US GENERICS: RECORDED, AND THEY ASK ══
 * OPERATOR RULING 2026-07-15: *"Do not harvest RxNorm US Brands — but when a US Generic is only
 * spelling variant or near synonym based on the same INN-RXCUI this should be place in the
 * drug_vocabulary bucket — as the mix of the two still occurs frequently — if the system is ever in
 * doubt — a question should return to patient or doctor — to confirm the exact medication they
 * intended."*
 *
 * paracetamol/acetaminophen · salbutamol/albuterol · rifampicin/rifampin · aciclovir/acyclovir ·
 * mesalazine/mesalamine · leuprorelin/leuprolide: one ingredient, two names, genuinely mixed. So the
 * US generic is RECORDED (the name must not dead-end) and dispositioned **`confirm`** — never
 * `steer`. The schema enforces that: an `international_generic` that steers is unrepresentable. A US
 * name may become an Australian one only when a human says so.
 *
 * US BRANDS ARE NOT HARVESTED, and the line is drawn from RxNorm's own data rather than from a guess
 * about which strings look like brands: a generic is admitted only when TTY ∈ {IN, PIN, MIN}. A brand
 * (BN) never enters. Verified across all 987 resolved concepts: IN 933 · PIN 51 · MIN 2 · **BN 0**.
 *
 * ══ THREE STATES, BECAUSE "REFUSE" WAS THE WRONG DEFAULT ══
 * The first cut had a boolean: steer or refuse. That made "the system is in doubt" a reason to
 * dead-end a name the human could resolve in one answer — the same suppression instinct the
 * show-evidence principle exists to stop, applied to identity instead of evidence.
 *   steer   — resolve silently (AU, unambiguous, already ours).
 *   confirm — ASK. US generics, and ambiguous names (every candidate presented, none chosen).
 *   refuse  — only where asking is nonsense: a manufacturer's name is not a drug.
 * Nothing is binned: every name is kept, labelled, and either resolves, asks, or explains itself.
 *
 * SHIPS UNSIGNED. A vocabulary is a drug-IDENTITY assertion at scale. `canonicalise()` will not read
 * it until KL signs it; until then the E7 `also_known_as` path (names we already used) keeps working
 * and behaviour is unchanged. Authored for review, not switched on behind him.
 *
 * Usage: node scripts/pharm-vocabulary-build.mjs --utc 2026-07-15 [--write]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDrugVocabulary } from "../mcp/servers/pharmacology/domain/model.js";
import { checksumRecords } from "./pharm-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

const SKIP = new Set(["data-sources.json", "capability-groups.json", "ingredient-identity.json", "drug-vocabulary.json"]);
/** A sponsor's company name is not a brand. PBS's brand_name field carries 8 of them. */
const COMPANY = /(pty\s*ltd|pty\s*limited|\bltd\b|\blimited\b|\binc\b|pharmaceutical|pharmacare|healthcare|laboratories)/i;

const lc = (s) => String(s || "").trim().toLowerCase();
const load = (f) => { try { return JSON.parse(readFileSync(join(DATA_DIR, f), "utf8")); } catch { return null; } };

/** Build the vocabulary. Pure over its inputs so it can be tested without the datastore. */
export function buildVocabulary({ pbs, identity, datastoreNames, utc }) {
  // 1. PBS → the AU authority. ingredient = primary; brand_name = an AU brand.
  const byPrimary = new Map(); // primary(lc) → { primary_name, atc:Set, brands:Set }
  for (const r of pbs) {
    const ing = r.ingredient;
    if (!ing) continue;
    const k = lc(ing);
    if (!byPrimary.has(k)) byPrimary.set(k, { primary_name: ing, atc: new Set(), brands: new Set() });
    const e = byPrimary.get(k);
    if (r.atc_code) e.atc.add(r.atc_code);
    if (r.brand_name) e.brands.add(r.brand_name);
  }

  // 2. Drugs we hold that PBS does not list (private/OTC/hospital) — the datastore is their authority.
  for (const [name] of datastoreNames) {
    if (!byPrimary.has(name)) byPrimary.set(name, { primary_name: name, atc: new Set(), brands: new Set(), fromDatastore: true });
  }

  // 3. RxCUI + the names RxNorm groups with it.
  const rxByName = new Map(); const namesByRxcui = new Map(); const canonByRxcui = new Map(); const ttyByRxcui = new Map();
  for (const r of identity) {
    if (r.resolution !== "resolved" || !r.rxcui) continue;
    rxByName.set(lc(r.name), r.rxcui);
    if (r.rxnorm_tty) ttyByRxcui.set(r.rxcui, r.rxnorm_tty);
    if (!namesByRxcui.has(r.rxcui)) namesByRxcui.set(r.rxcui, []);
    namesByRxcui.get(r.rxcui).push(lc(r.name));
    if (r.rxnorm_name) canonByRxcui.set(r.rxcui, r.rxnorm_name);
  }

  // 4. Assemble the candidate name set per primary.
  const draft = [];
  for (const [k, e] of byPrimary) {
    const rxcui = rxByName.get(k) ?? null;
    const names = new Map(); // lc → {name, kind, jurisdiction, source}
    const add = (name, kind, jurisdiction, source, rxnorm_tty) => {
      const n = lc(name);
      if (!n || names.has(n)) return;
      names.set(n, { name, kind, jurisdiction, source, ...(rxnorm_tty ? { rxnorm_tty } : {}) });
    };

    add(e.primary_name, "primary", "AU",
      e.fromDatastore ? "breath-ezy datastore (not PBS-listed: private/OTC/hospital)" : "PBS ingredient (Australian Government formulary)");

    // Names our datastore already used for this drug (E7 aliases) — ours already, not a new claim.
    for (const aka of datastoreNames.get(k)?.aliases || []) add(aka, "former_name", "AU", "breath-ezy datastore (also_known_as, E7 reconcile)");

    // Every other name RxNorm groups under the same concept and we hold somewhere.
    for (const sib of namesByRxcui.get(rxcui) || []) {
      if (sib === k || names.has(sib)) continue;
      add(sib, "spelling_variant", "AU", `breath-ezy datastore, unified by RxNorm concept ${rxcui}`);
    }

    // AU brands — from PBS, an AU source. Never RxNorm's US brand table.
    for (const b of e.brands) {
      if (COMPANY.test(b)) { add(b, "company_artifact", "AU", "PBS brand_name field (sponsor company name — NOT a drug)"); continue; }
      add(b, "brand", "AU", "PBS brand_name (Australian Government formulary)");
    }

    // The US GENERIC sharing this INN-RxCUI — operator ruling 2026-07-15: *"when a US Generic is only
    // spelling variant or near synonym based on the same INN-RXCUI this should be place in the
    // drug_vocabulary bucket — as the mix of the two still occurs frequently"*. paracetamol/
    // acetaminophen, salbutamol/albuterol, rifampicin/rifampin: one ingredient, two names, genuinely
    // mixed by patients, doctors and imported systems. Recorded so the name is not a dead end — and
    // dispositioned `confirm`, never `steer`, so a US name never silently becomes an Australian one.
    //
    // TTY-GATED: admitted ONLY when RxNorm says the concept is a GENERIC (IN/PIN/MIN). A brand (BN)
    // is not harvested — the operator's line, enforced from RxNorm's own data rather than from a
    // guess about which strings look like brands. Verified across all 987 resolved concepts:
    // IN 933 · PIN 51 · MIN 2 · BN 0.
    const canon = canonByRxcui.get(rxcui);
    const tty = ttyByRxcui.get(rxcui);
    if (canon && lc(canon) !== k && !names.has(lc(canon))) {
      if (tty && ["IN", "PIN", "MIN"].includes(tty)) {
        add(canon, "international_generic", "US", `RxNorm generic concept ${rxcui} (TTY ${tty}) — the USAN for this INN`, tty);
      }
      // else: not a generic ingredient concept → not admitted at all (never a US brand).
    }

    draft.push({ key: k, primary_name: e.primary_name, rxcui, atc: [...e.atc].sort(), names: [...names.values()] });
  }

  // 5. THE AMBIGUITY PASS — the safety-critical step. A name that reaches two primaries may never
  //    steer: choosing wrong doses the wrong drug. Refused, never picked; recorded, never binned.
  const reach = new Map(); // name(lc) → Set(primary key)
  for (const d of draft) for (const n of d.names) {
    const a = lc(n.name);
    if (!reach.has(a)) reach.set(a, new Set());
    reach.get(a).add(d.key);
  }

  const records = [];
  let confirmForeign = 0, confirmAmbiguous = 0, refusedArtifact = 0, steer = 0;
  for (const d of draft) {
    const names = d.names.map((n) => {
      const targets = reach.get(lc(n.name)) || new Set();
      const others = [...targets].filter((t) => t !== d.key).sort();

      // A manufacturer's name is not a drug. Asking "did you mean Pfizer?" is nonsense, so this is
      // the one case that REFUSES rather than asks.
      if (n.kind === "company_artifact") {
        refusedArtifact++;
        return { ...n, lookup_disposition: "refuse", disposition_reason: "a sponsor's company name that leaked into PBS's brand_name field — it names a manufacturer, not a drug, so there is nothing to confirm" };
      }

      // AMBIGUOUS → ASK. Operator: "if the system is ever in doubt — a question should return to
      // patient or doctor — to confirm the exact medication they intended". A flat refusal was my
      // earlier design and it is worse: it dead-ends a name the human could resolve in one answer.
      // The system still never PICKS — it presents every candidate.
      if (others.length && n.kind !== "primary") {
        confirmAmbiguous++;
        return {
          ...n,
          lookup_disposition: "confirm",
          disposition_reason: `ambiguous — this name also reaches ${others.join(", ")}. The system does not choose between medications.`,
          confirm_prompt: `You entered "${n.name}". That name is listed for more than one medication: ${[d.primary_name, ...others].join(", ")}. Which one do you mean?`,
          confirm_candidates: [d.primary_name, ...others],
        };
      }

      // A US GENERIC → ASK. It is the same ingredient by RxCUI and the mix is frequent, so it must
      // not dead-end; but a foreign name may never silently become an Australian one, so it can only
      // ever be `confirm`. The schema enforces that it can never be `steer`.
      if (n.kind === "international_generic") {
        confirmForeign++;
        return {
          ...n,
          lookup_disposition: "confirm",
          disposition_reason: `${n.jurisdiction} generic name for the same ingredient (RxNorm ${d.rxcui}). Recorded because the two are frequently mixed; it may never resolve an Australian lookup without a human confirming.`,
          confirm_prompt: `You entered "${n.name}", which is the ${n.jurisdiction} name for the medicine known in Australia as "${d.primary_name}" (the same ingredient, RxNorm ${d.rxcui}). Is "${d.primary_name}" the medication you intend?`,
          confirm_candidates: [d.primary_name],
        };
      }

      steer++;
      return { ...n, lookup_disposition: "steer" };
    });

    records.push(validateDrugVocabulary({
      primary_name: d.primary_name,
      authority: byPrimary.get(d.key).fromDatastore ? "datastore" : "pbs",
      identity: { rxcui: d.rxcui, atc_codes: d.atc },
      names,
      provenance: {
        source: "PBS (AU formulary) primary + AU brands · RxNorm/NLM concept id · breath-ezy datastore names",
        source_ref: "pbs-formulary,rxnorm-nlm",
        authored_by: "pharm-vocabulary-build (deterministic; no clinical or identity judgement of its own)",
        reviewed_by: null,
        review_status: "draft",
        version: "v0.1.0",
        effective_date: utc,
      },
    }));
  }

  return { records, stats: { steer, confirmForeign, confirmAmbiguous, refusedArtifact } };
}

/** Every name the datastore already uses, with the aliases E7 recorded. */
function collectDatastoreNames() {
  const out = new Map(); // primary(lc) → { aliases: Set }
  for (const f of readdirSync(DATA_DIR).filter((x) => x.endsWith(".json") && !SKIP.has(x) && x !== "pbs-formulary.json")) {
    for (const r of load(f)?.records || []) {
      const primary = r.ingredient ?? r.subject;
      if (typeof primary !== "string") continue;
      const k = lc(primary);
      if (!out.has(k)) out.set(k, { aliases: new Set() });
      for (const a of r.also_known_as || []) out.get(k).aliases.add(a);
    }
  }
  return out;
}

function main(argv) {
  const args = argv.slice(2);
  const utc = (() => { const i = args.indexOf("--utc"); return i >= 0 ? args[i + 1] : undefined; })();
  const write = args.includes("--write");
  if (!utc) { console.error("usage: node scripts/pharm-vocabulary-build.mjs --utc <YYYY-MM-DD> [--write]"); process.exit(2); }

  const pbs = load("pbs-formulary.json")?.records || [];
  const identity = load("ingredient-identity.json")?.records || [];
  if (!pbs.length) { console.error("pbs-formulary.json missing/empty — PBS is the AU naming authority for this build"); process.exit(2); }

  const { records, stats } = buildVocabulary({ pbs, identity, datastoreNames: collectDatastoreNames(), utc });

  const totalNames = records.reduce((n, r) => n + r.names.length, 0);
  const disp = { steer: 0, confirm: 0, refuse: 0 };
  for (const r of records) for (const n of r.names) disp[n.lookup_disposition]++;
  const byKind = {};
  for (const r of records) for (const n of r.names) byKind[n.kind] = (byKind[n.kind] || 0) + 1;

  console.log(`\npharm-vocabulary-build: drug vocabulary — PBS INN (AU) as primary authority\n`);
  console.log(`  drugs            ${String(records.length).padStart(6)}   (${records.filter((r) => r.authority === "pbs").length} PBS-listed · ${records.filter((r) => r.authority === "datastore").length} not PBS-listed)`);
  console.log(`  names            ${String(totalNames).padStart(6)}`);
  console.log(`  with RxCUI       ${String(records.filter((r) => r.identity.rxcui).length).padStart(6)}`);
  console.log(`  with ATC         ${String(records.filter((r) => r.identity.atc_codes.length).length).padStart(6)}`);
  console.log(`\n  by kind:`);
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(24)} ${String(v).padStart(5)}`);
  console.log(`\n  lookup disposition:`);
  console.log(`    steer    ${String(disp.steer).padStart(5)}  resolve silently (AU, unambiguous, already ours)`);
  console.log(`    confirm  ${String(disp.confirm).padStart(5)}  ASK the patient/doctor — the system is in doubt and does not guess`);
  console.log(`               ${String(stats.confirmForeign).padStart(5)}  US generic sharing the INN-RxCUI (the mix is frequent; never silently AU)`);
  console.log(`               ${String(stats.confirmAmbiguous).padStart(5)}  ambiguous — every candidate presented, none chosen`);
  console.log(`    refuse   ${String(disp.refuse).padStart(5)}  a manufacturer's name is not a drug — nothing to confirm`);

  if (!write) { console.log("\n  --dry-run (default). Re-run with --write.\n"); return; }

  const ds = {
    dataset_version: "pharm-drug-vocabulary:v0.1.0-dev",
    capability: "drug_vocabulary",
    status:
      "DEV — NOT patient-facing; NOT clinical guidance. The unifying drug vocabulary: every name, synonym, brand, " +
      "international and spelling variant that gets used interchangeably, linked to ONE identity. PRIMARY AUTHORITY " +
      "is the PBS ingredient name (the Australian Government's own formulary) — NOT RxNorm's canonical, which is the " +
      "USAN and would rename paracetamol to acetaminophen. RxNorm supplies the CONCEPT ID (RxCUI) only; WHO ATC codes " +
      "come from PBS. Recording is not resolving: `usable_for_lookup` is false for anything ambiguous (a name reaching " +
      "two drugs), for international variants (a US name must never steer an AU lookup) and for company-name artifacts. " +
      "Nothing is binned — every name is kept and labelled, and the clinician decides what may steer. Records author to " +
      "review_status 'draft'; canonicalise() will not read this until it is signed.",
    generated: utc,
    attestation: {
      method: "not_yet_attested",
      clinical_sign_off: false,
      regulatory_sign_off: false,
      reviewer_id: null,
      attested_utc: null,
      recorded_by: "claude-fable-5 (agent)",
      statement:
        "Drug vocabulary built deterministically from PBS (AU authority: primary names, AU brands, ATC), RxNorm " +
        "(concept id only), and the datastore's own names. The agent made no identity judgement of its own: every " +
        "mapping is PBS's, RxNorm's or one this datastore already asserted, each recorded with its source so it can be " +
        "checked. Requires clinician review before it may steer a lookup — a wrong vocabulary entry redirects a dose " +
        "lookup to the wrong drug, which is why ambiguity is refused rather than guessed and why this is not " +
        "self-approving.",
      scope: `${records.length} drugs · ${totalNames} names (${disp.steer} steer · ${disp.confirm} ask-the-human · ${disp.refuse} refuse). Identity only — no dose, no clinical claim.`,
    },
    records,
    records_checksum: checksumRecords(records),
    last_authored_utc: null,
  };
  writeFileSync(join(DATA_DIR, "drug-vocabulary.json"), JSON.stringify(ds, null, 2) + "\n");
  console.log(`\n  wrote ${records.length} drug(s) → drug-vocabulary.json (all review_status:draft — clinician review required)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
