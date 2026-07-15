/**
 * PharmDataSource seam (FL-30 §2.4) — the interface through which the PharmCheck engine
 * reads clinical REFERENCE knowledge (allergy cross-reactivity groups, drug interactions,
 * renal rules, AU scheduling, NTI status, dose guidance). The engine and the frozen
 * contract are SOURCE-AGNOSTIC: they must not care whether the facts come from the
 * self-developed synthetic datastore or a future licensed commercial feed. Selection is
 * by config flag (PHARM_CDS), never hard-wired.
 *
 * Two implementations:
 *   - SyntheticSelfDevelopedSource — Breath-Ezy's own provenanced source. TODAY it is
 *     backed by mock-data.json (MOCK/SYNTHETIC-ONLY); Step 3 repoints it at the curated,
 *     clinician-attested versioned datastore. Its receipt hints are HONEST about the
 *     current backing — while mock-backed it stamps mode 'mock', never 'live' (no
 *     mock-as-live: Guardrail 4). The move to mode 'live' is gated on Step 3 (real data)
 *     + Step 5 (staging validation + sign-off), not on flipping a flag.
 *   - LicensedFeedSource — STUB placeholder for a future MIMS/AusDI/commercial or
 *     RxNorm/ATC-fed licensed source. Returns unavailable; every getter fails closed.
 *
 * SCOPE (Step 2): the seam is standalone and functional, but engine.js is NOT yet rewired
 * to read through it — that is Step 4, keeping current mock parity byte-intact now.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pharmCdsState } from "../../../../config/flags.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The interface. Subclasses implement each reader. Unimplemented methods throw, so a
 * half-built source fails loud rather than silently returning nothing.
 * @abstract
 */
export class PharmDataSource {
  /** Stable id for logs/receipts. */
  get id() { throw new Error("PharmDataSource.id not implemented"); }
  /** @returns {{ available: boolean, reason?: string }} */
  available() { throw new Error(`${this.id}.available() not implemented`); }
  /** Dataset version string for receipts/provenance. */
  datasetVersion() { throw new Error(`${this.id}.datasetVersion() not implemented`); }
  /** Honest receipt mode for facts from this source: 'mock' | 'dry_run' | 'live'. */
  receiptMode() { throw new Error(`${this.id}.receiptMode() not implemented`); }
  /** Honest receipt upstream identifier (never a commercial-vendor name unless it IS one). */
  receiptUpstream() { throw new Error(`${this.id}.receiptUpstream() not implemented`); }
  /** @returns {string|null} allergy cross-reactivity group for a drug, or null. */
  getAllergyGroup(_drug) { throw new Error(`${this.id}.getAllergyGroup() not implemented`); }
  /** @returns {Array<{a:string,b:string,severity:string,note:string}>} interaction rows involving a drug. */
  getInteractions(_drug) { throw new Error(`${this.id}.getInteractions() not implemented`); }
  /** @returns {{action:string,egfr_threshold_ml_min:number}|null} renal rule for a drug, or null. */
  getRenalRule(_drug) { throw new Error(`${this.id}.getRenalRule() not implemented`); }
  /** @returns {string} AU schedule for a drug ('unknown' if unmapped). */
  getSchedule(_drug) { throw new Error(`${this.id}.getSchedule() not implemented`); }
  /** @returns {object|null} dose guidance for a drug (present only for a mock/validated source). */
  getDoseGuidance(_drug) { throw new Error(`${this.id}.getDoseGuidance() not implemented`); }
  /** @returns {{tga_category:string,contraindicated:boolean,guidance?:string}|null} TGA pregnancy-category record for a drug, or null. */
  getPregnancyRisk(_drug) { throw new Error(`${this.id}.getPregnancyRisk() not implemented`); }
  /** @returns {{action:string,guidance?:string,monitoring?:string}|null} hepatic-impairment record for a drug, or null. */
  getHepatic(_drug) { throw new Error(`${this.id}.getHepatic() not implemented`); }
  /** @returns {boolean} is this drug present anywhere in the reference set? (unknown → escalate) */
  knownDrug(_drug) { throw new Error(`${this.id}.knownDrug() not implemented`); }
  /** Human-readable provenance summary for this source. */
  provenance() { throw new Error(`${this.id}.provenance() not implemented`); }
}

/**
 * Breath-Ezy's self-developed synthetic source. Backed by mock-data.json TODAY; the
 * `selfDeveloped` flag records whether it was selected as the explicit self-developed
 * path (PHARM_CDS=SYNTHETIC_SELF_DEVELOPED) vs the default mock path (EMPTY). Either way,
 * while `backingIsMock` is true the receipt mode is 'mock' — the curated, validated
 * datastore that would justify mode 'live' is Step 3/Step 5 work.
 */
export class SyntheticSelfDevelopedSource extends PharmDataSource {
  constructor({ selfDeveloped = false, forceMock = false } = {}) {
    super();
    this._selfDeveloped = selfDeveloped;
    const read = (rel) => { try { return JSON.parse(readFileSync(join(__dirname, "..", rel), "utf8")); } catch { return null; } };
    // M5 repoint: read the curated, CLINICIAN-SIGNED datastore (FL-30 Step 3). mock-data.json
    // remains a fallback for any capability not yet populated (e.g. dose-guidance).
    // forceMock (A/B validation only) ignores the datastore so getters use the mock fallback —
    // lets Step 5 compare the mock path vs the datastore path through the same engine.
    this._store = forceMock ? {} : {
      allergy: read("data/allergy-cross-reactivity.json"),
      interactions: read("data/drug-interactions.json"),
      renal: read("data/renal-rules.json"),
      scheduling: read("data/au-scheduling.json"),
      nti: read("data/nti-register.json"),
      dose: read("data/dose-guidance.json"),
      // FL-05: clinician-signed special-population registers, now engine-wired (were
      // reference-only). They carry NO dose fields — they only add HARD_FAIL/WARN checks.
      pregnancy: read("data/pregnancy-risk.json"),
      hepatic: read("data/hepatic.json"),
      // E8 — the drug vocabulary. NOT a clinical capability and NOT read by any accessor: it is read
      // ONLY by canonicalise(), to resolve a name to the primary identity BEFORE any accessor runs.
      // Gated on clinical_sign_off inside _buildVocabIndex(); an unsigned vocabulary steers nothing.
      vocabulary: read("data/drug-vocabulary.json"),
    };
    this._mock = JSON.parse(readFileSync(join(__dirname, "..", "mock-data.json"), "utf8"));
    // Datastore-backed iff the four core SAFETY capabilities each carry >=1 signed record.
    this._datastoreBacked = ["allergy", "interactions", "renal", "scheduling"].every((k) => this._records(k).length > 0);
    // NOT YET validated end-to-end (FL-30 Step 5). Until then receipts stay 'mock'-moded —
    // real, clinician-signed data, but not validated, so it must NOT claim 'live'
    // (mock-as-live discipline, Guardrail 4). Step 5 validation + sign-off flips this.
    this._validated = false;
  }
  get id() { return "pharm-source-synthetic-self-developed"; }
  get datastoreBacked() { return this._datastoreBacked; }
  /** True == not yet Step-5-validated (drives receiptMode 'mock'). */
  get backingIsMock() { return !this._validated; }
  available() { return { available: true }; }
  datasetVersion() { return this._datastoreBacked ? "pharm-datastore:v0.1.0-dev" : this._mock.dataset_version; }
  receiptMode() { return this._validated ? "live" : "mock"; }
  receiptUpstream() {
    // Non-conflatable + honest: distinguish the signed dev datastore from the mock-file
    // fallback, and never claim a commercial-vendor name. 'live' only after validation.
    if (this._validated) return `heydoc-pharm-synthetic:${this.datasetVersion()}`;
    return this._datastoreBacked
      ? `heydoc-pharm-synthetic-dev:${this.datasetVersion()}`
      : `heydoc-pharm-synthetic-mock:${this._mock.dataset_version}`;
  }
  _records(key) { const d = this._store[key]; return d && Array.isArray(d.records) ? d.records : []; }

  /**
   * Resolve a drug name to the datastore's PRIMARY (INN) identity, via the `also_known_as` aliases
   * the E7 reconcile recorded on the records themselves.
   *
   * OPERATOR RULING 2026-07-15: *"re-author all listings so the INN name is the primary identity so
   * links to the capabilities or medication related content are never lost or not linked based on a
   * misnomer."* E7 made the INN primary; this is the second half — the old name must still LINK.
   * `frusemide` is still what a great many Australian prescribers write, and it must not fall off a
   * cliff because the datastore harmonised to `furosemide`.
   *
   * ══ WHY THIS LIVES AT THE BOUNDARY AND NOT IN THE ACCESSORS ══
   * Resolving aliases inside `getDoseGuidance()` alone would RECREATE the exact defect E6 found: the
   * dose lookup would resolve `frusemide` → the furosemide record and emit a dose, while
   * `getInteractions("frusemide")` still missed and its check silently passed. A dose with inert
   * checks — the same unsafe pass, rebuilt by a well-meaning convenience. So the engine canonicalises
   * ONCE, at entry, and every one of the eight accessors then sees the same identity. Consistency is
   * the safety property here; a partial resolution is worse than none.
   *
   * ══ WHY THIS IS SAFE WHERE STEERING ON THE RxNORM MAP IS NOT ══
   * The aliases are NOT an outside claim. They are names THIS DATASTORE ALREADY USED for that drug —
   * we held a dose under `frusemide`, so treating `frusemide` as furosemide preserves an identity we
   * already asserted rather than importing a new one. The RxNorm map is what let us SEE the two names
   * were one concept; PBS (the AU authority) chose which is primary; and the choice is recorded, with
   * its RxCUI and basis, in each dataset's `attestation.rename_history` and each record's
   * `attested_as`. Nothing here consults the unsigned map at runtime.
   *
   * Exact match only, never fuzzy. An unknown name resolves to itself and the caller's fail-safe
   * (BLOCKED_NO_PROOF) stands.
   *
   * @returns {{ canonical: string, from: string|null }} `from` is non-null ONLY when an alias was
   *   applied, so the caller can REPORT it. A silent identity change is exactly what this subsystem
   *   must never do.
   */
  canonicalise(drug) {
    const n = String(drug || "").trim().toLowerCase();
    if (!n) return { canonical: n, from: null };
    if (!this._aliasIndex) {
      // Built once from the datastore's own records. Later capabilities win nothing: an alias that
      // pointed at two different primaries would be ambiguous, so it is DROPPED rather than guessed.
      const idx = new Map(); const ambiguous = new Set();
      for (const key of Object.keys(this._store || {})) {
        for (const r of this._records(key)) {
          const primary = r.ingredient ?? r.subject;
          if (typeof primary !== "string") continue;
          for (const aka of r.also_known_as || []) {
            const a = String(aka).toLowerCase();
            const p = primary.toLowerCase();
            if (a === p) continue;
            if (idx.has(a) && idx.get(a) !== p) ambiguous.add(a);
            idx.set(a, p);
          }
        }
      }
      for (const a of ambiguous) idx.delete(a); // ambiguity is refused, never resolved by choosing
      this._aliasIndex = idx;
    }
    const hit = this._aliasIndex.get(n);
    if (hit) return { canonical: hit, from: n, via: "datastore alias (also_known_as)", rxcui: this.identityCode(hit) };

    // THE VOCABULARY (E8) — the general case: brands, former names, spelling and international
    // variants, all linked to one identity. It is a drug-IDENTITY assertion at scale, so it is GATED
    // ON CLINICAL SIGN-OFF: until KL signs it, this returns nothing and behaviour is exactly the E7
    // behaviour. A wrong vocabulary entry redirects a dose lookup to the wrong drug, so it does not
    // get to switch itself on.
    //
    // Only `usable_for_lookup` names steer. Ambiguous names (reaching two drugs), international
    // variants (a US name must never resolve an AU lookup) and company-name artifacts are recorded in
    // the vocabulary but excluded here — recording is not resolving.
    const vocab = this._vocabIndex ?? (this._vocabIndex = this._buildVocabIndex());
    const v = vocab.get(n);
    if (!v) return { canonical: n, from: null, rxcui: this.identityCode(n) };

    // `confirm` — the system is in doubt, so it ASKS rather than guessing or dead-ending (operator
    // ruling: "if the system is ever in doubt — a question should return to patient or doctor — to
    // confirm the exact medication they intended"). It does NOT resolve: the caller gets the question
    // and the candidates, and a human answers. A US generic lives here (paracetamol/acetaminophen are
    // one ingredient and the mix is frequent — but a US name never silently becomes an Australian
    // one), as does an ambiguous name (every candidate presented, none chosen).
    if (v.disposition === "confirm") {
      return { canonical: n, from: null, confirm: { prompt: v.prompt, candidates: v.candidates, via: v.via } };
    }
    return { canonical: v.primary, from: n, via: v.via, rxcui: this.identityCode(v.primary) };
  }

  /**
   * The drug's RxNorm concept id — the CODE that travels to the CDS gateway (B0b).
   *
   * OPERATOR, 2026-07-15: *"is it more pragmatic to use a code … and just maintain strict canonical
   * names for all internal functions?"* Yes. A code is unambiguous by construction; a name makes
   * correctness depend on two systems agreeing on a spelling, which is the class of defect F6 was.
   * The wire contract (`OpenCdsDrugSchema`) already carries `rxnorm_code` — nothing populated it.
   *
   * GATED ON SIGN-OFF, deliberately. The RxCUI comes from the drug vocabulary, which is a
   * drug-IDENTITY assertion and is UNSIGNED. Sending a code that the gateway answers with a DOSE keyed
   * on it IS steering — the same act `canonicalise()` refuses on an unsigned map. So this returns null
   * until a clinician signs, the gateway falls back to the canonical name (which B0 made correct), and
   * B0b changes no behaviour today. It wires the precision that sign-off unlocks.
   *
   * @returns {string|null} RxCUI, or null when unsigned/absent. 437 of the 451 dose ingredients have
   *   one; the 14 without are combination products and classes, which is why the NAME must still ride.
   */
  identityCode(drug) {
    const ds = this._store?.vocabulary;
    if (!ds || ds.attestation?.clinical_sign_off !== true) return null; // unsigned → no code steers
    if (!this._codeIndex) {
      this._codeIndex = new Map();
      for (const r of ds.records || []) {
        if (r.identity?.rxcui) this._codeIndex.set(String(r.primary_name).toLowerCase(), r.identity.rxcui);
      }
    }
    return this._codeIndex.get(String(drug || "").toLowerCase()) ?? null;
  }

  /** Reverse index over the SIGNED vocabulary: usable name → primary. Empty when unsigned/absent. */
  _buildVocabIndex() {
    const ds = this._store?.vocabulary;
    const idx = new Map();
    if (!ds || ds.attestation?.clinical_sign_off !== true) return idx; // unsigned → steers nothing, asks nothing
    for (const r of ds.records || []) {
      for (const n of r.names || []) {
        const a = String(n.name).toLowerCase();
        if (a === String(r.primary_name).toLowerCase()) continue;
        if (n.lookup_disposition === "refuse") continue; // a manufacturer's name is not a drug
        const entry = n.lookup_disposition === "confirm"
          ? { disposition: "confirm", prompt: n.confirm_prompt, candidates: n.confirm_candidates || [r.primary_name], via: `drug vocabulary (${n.kind}, ${n.jurisdiction})` }
          : { disposition: "steer", primary: r.primary_name.toLowerCase(), via: `drug vocabulary (${n.kind}, ${n.jurisdiction}; ${n.source})` };
        // Belt-and-braces: the build already dispositions a name reaching two drugs as `confirm`, but
        // a name that arrived here twice with different primaries would be a build defect. Downgrade
        // to a question rather than pick — never silently choose one.
        const prev = idx.get(a);
        if (prev && prev.disposition === "steer" && entry.disposition === "steer" && prev.primary !== entry.primary) {
          idx.set(a, { disposition: "confirm", prompt: `You entered "${n.name}". That name is listed for more than one medication (${prev.primary}, ${entry.primary}). Which one do you mean?`, candidates: [prev.primary, entry.primary], via: "drug vocabulary (conflicting entries — never resolved by choosing)" });
          continue;
        }
        if (!prev) idx.set(a, entry);
      }
    }
    return idx;
  }

  getAllergyGroup(drug) {
    const n = String(drug || "").toLowerCase();
    const store = this._records("allergy");
    if (store.length) {
      const g = store.find((grp) => Array.isArray(grp.members) && grp.members.map((m) => String(m).toLowerCase()).includes(n));
      return g ? g.group : null; // datastore is authoritative when populated
    }
    const g = this._mock.allergy_cross_reactivity_groups.find((grp) => grp.members.includes(n));
    return g ? g.group : null;
  }
  getInteractions(drug) {
    const n = String(drug || "").toLowerCase();
    const store = this._records("interactions");
    if (store.length) {
      // Map the domain shape → the {a,b,severity,note} shape the engine consumes.
      return store
        .filter((ix) => String(ix.subject).toLowerCase() === n || String(ix.object).toLowerCase() === n)
        .map((ix) => ({ a: String(ix.subject).toLowerCase(), b: String(ix.object).toLowerCase(), severity: ix.severity, note: ix.mechanism_class }));
    }
    return this._mock.drug_interactions.filter((ix) => ix.a === n || ix.b === n);
  }
  getRenalRule(drug) {
    const n = String(drug || "").toLowerCase();
    const store = this._records("renal");
    if (store.length) {
      const r = store.find((x) => String(x.ingredient).toLowerCase() === n);
      if (!r) return null;
      return { action: r.action, egfr_threshold_ml_min: r.contraindicated_below_egfr ?? r.dose_reduction_below_egfr };
    }
    return this._mock.renal_rules.find((r) => r.drug === n) || null;
  }
  getSchedule(drug) {
    const n = String(drug || "").toLowerCase();
    const store = this._records("scheduling");
    if (store.length) {
      const r = store.find((x) => String(x.ingredient).toLowerCase() === n);
      return r ? r.schedule : "unknown";
    }
    return this._mock.schedule_map[n] || "unknown";
  }
  getNti(drug) {
    const n = String(drug || "").toLowerCase();
    return this._records("nti").find((x) => String(x.ingredient).toLowerCase() === n) || null;
  }
  knownDrug(drug) {
    const n = String(drug || "").toLowerCase();
    // Present anywhere in the reference set? An unrecognised drug must escalate, not pass.
    return this.getSchedule(n) !== "unknown" || !!this.getRenalRule(n) || !!this.getNti(n) || this.getInteractions(n).length > 0 || !!this.getDoseGuidance(n) || !!this.getAllergyGroup(n);
  }
  /**
   * The AU dose for a drug, or null.
   *
   * C3 (2026-07-15) REMOVED the mock-data.json fallback that used to sit here. That fallback was
   * honest while EVERY dose was mock: its three entries (amoxicillin, paracetamol, ibuprofen) each
   * self-labelled "(MOCK — not clinically validated)" inside the dose string, so nothing could be
   * mistaken for signed content. C2 authored the first CLINICIAN-SIGNED doses, and at that moment the
   * fallback became a defect: it would have silently MIXED signed and mock doses on one path, leaving
   * a string label as the only thing distinguishing them at the point a clinician reads a dose beside
   * real ones. Absent record → null → no dose. That is the fail-safe default (missing proof → nothing,
   * never a substitute) and it is strictly safer than what it replaces.
   *
   * NOTE this does not make a drug "unknown": knownDrug() reaches scheduling/renal/nti/interactions/
   * allergy too, so amoxicillin/paracetamol/ibuprofen remain known drugs that simply carry no AU dose
   * until one is authored — which is the truth.
   */
  getDoseGuidance(drug) {
    const n = String(drug || "").toLowerCase();
    return this._records("dose").find((x) => String(x.ingredient).toLowerCase() === n) || null;
  }
  /** TGA pregnancy-category record (subject-keyed). No mock fallback — absent → null (check omitted). */
  getPregnancyRisk(drug) {
    const n = String(drug || "").toLowerCase();
    const r = this._records("pregnancy").find((x) => String(x.subject).toLowerCase() === n);
    return r ? { tga_category: r.tga_category, contraindicated: r.contraindicated === true, guidance: r.guidance } : null;
  }
  /** Hepatic-impairment record (ingredient-keyed). No mock fallback — absent → null (check omitted). */
  getHepatic(drug) {
    const n = String(drug || "").toLowerCase();
    const r = this._records("hepatic").find((x) => String(x.ingredient).toLowerCase() === n);
    return r ? { action: r.action, guidance: r.guidance, monitoring: r.monitoring } : null;
  }
  provenance() {
    return {
      source: this.id,
      backing: this._datastoreBacked ? "curated clinician-signed datastore (data/*.json, dev-tagged, unvalidated)" : "mock-data.json (MOCK/SYNTHETIC-ONLY)",
      self_developed: this._selfDeveloped,
      datastore_backed: this._datastoreBacked,
      validated: this._validated,
      dataset_version: this.datasetVersion(),
    };
  }
}

/**
 * Licensed commercial / external-feed source — STUB. The home for a future MIMS-AU /
 * AusDI commercial feed, or RxNorm/ATC/openFDA-fed licensed data. Not built: fails closed
 * so nothing can depend on it before it exists and its licence is cleared (Guardrail 6).
 */
export class LicensedFeedSource extends PharmDataSource {
  get id() { return "pharm-source-licensed-feed"; }
  available() { return { available: false, reason: "LicensedFeedSource is a stub — no commercial/licensed feed connected or licence-cleared (FL-30 Guardrail 6)" }; }
  datasetVersion() { return "unbuilt"; }
  receiptMode() { return "dry_run"; }
  receiptUpstream() { return "licensed-feed-unbuilt"; }
  _fail() { throw new Error(`${this.id}: not built — connect and licence-clear a feed before reading (returns unavailable via available())`); }
  getAllergyGroup() { this._fail(); }
  getInteractions() { this._fail(); }
  getRenalRule() { this._fail(); }
  getSchedule() { this._fail(); }
  getDoseGuidance() { this._fail(); }
  getPregnancyRisk() { this._fail(); }
  getHepatic() { this._fail(); }
  knownDrug() { return false; } // fail-safe: an unbuilt feed knows no drug → escalate
  provenance() { return { source: this.id, backing: "unbuilt", available: false }; }
}

/**
 * Select the active data source from config (PHARM_CDS). The engine/contract stay
 * source-agnostic — only this factory reads the flag.
 *   - FILLED                    → LicensedFeedSource (commercial vendor path; stub today)
 *   - SYNTHETIC_SELF_DEVELOPED  → SyntheticSelfDevelopedSource (explicit self-developed)
 *   - EMPTY (default) / other   → SyntheticSelfDevelopedSource (default mock path)
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {PharmDataSource}
 */
export function selectPharmDataSource(env = process.env) {
  const state = pharmCdsState(env);
  if (state === "FILLED") return new LicensedFeedSource();
  return new SyntheticSelfDevelopedSource({ selfDeveloped: state === "SYNTHETIC_SELF_DEVELOPED" });
}
