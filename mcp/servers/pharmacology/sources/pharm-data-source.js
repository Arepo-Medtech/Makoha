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
