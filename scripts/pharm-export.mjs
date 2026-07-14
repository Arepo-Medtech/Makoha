/**
 * PharmCheck export generator (FL-30 review bundle).
 *
 * Assembles a SELF-CONTAINED markdown export of the PharmCheck subsystem — faithful to the
 * live repo (contracts + schemas + engine firewall + capability inventory with real sample
 * records) — so it can be taken into a standalone Claude Chat for review/assessment WITHOUT
 * repo access. It emits SAMPLES + counts, never full datasets (14,840 PBS rows etc. do not
 * belong in a chat context). Run from repo root: node scripts/pharm-export.mjs
 *
 * This is a read-only reporter: it reads, it does not mutate the subsystem.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as MODEL from "../mcp/servers/pharmacology/domain/model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "mcp", "servers", "pharmacology", "data");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(read(p));
const dataJson = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

const SAMPLES = 2; // sample records per capability
const trim = (recs, n = SAMPLES) => (Array.isArray(recs) ? recs.slice(0, n) : []);
const fence = (obj, lang = "json") => "```" + lang + "\n" + (typeof obj === "string" ? obj : JSON.stringify(obj, null, 2)) + "\n```";

// Capability → dataset file. Ordered for the reviewer (clinical-judgement first, then reference).
const CAPS = [
  ["clinical_uses", "clinical-uses.json", "Indications a drug is used for."],
  ["pharmacodynamics", "pharmacodynamics.json", "Mechanism of action / drug class / target / effect."],
  ["pharmacokinetics", "pharmacokinetics.json", "ADME — bioavailability, metabolism, elimination, half-life."],
  ["precautions", "precautions.json", "LOW-TIER cautions — mild/common side effects, general warnings (NOT toxicity/contraindications)."],
  ["warning_labels", "warning-labels.json", "Cautionary/advisory labels (source_scheme RASML/TGA primary). Reference-only."],
  ["counselling_points", "counselling-points.json", "Consumer counselling messages (APF22 Consumer information structure). Reference-only."],
  ["interactions", "drug-interactions.json", "Drug-drug interactions, tagged with mechanism_category (exact enum: drug_drug / qt_prolongation / reduced_clearance / cyp_inducer / cyp_inhibitor)."],
  ["nti", "nti-register.json", "Narrow-therapeutic-index drugs requiring level monitoring. The NTI bucket under the TDM heading."],
  ["tdm_parameters", "tdm-parameters.json", "Therapeutic drug monitoring ranges/timing (APF22 Table B.2 facts). Concentration targets, NOT doses. Reference-only, engine-isolated."],
  ["renal", "renal-rules.json", "Renal dose-adjustment / contraindication thresholds by eGFR."],
  ["scheduling", "au-scheduling.json", "AU Poisons Standard (SUSMP) schedule."],
  ["allergy", "allergy-cross-reactivity.json", "Cross-reactivity allergy groups."],
  ["serious_adverse_effects", "serious-adverse-effects.json", "Established SERIOUS/life-threatening toxicity."],
  ["strong_contraindications", "strong-contraindications.json", "Absolute / strong-relative drug(-class)-in-condition contraindications."],
  ["formulations", "formulations.json", "PBS public form/strength — dose-ADJACENT reference, NOT a dose source."],
  ["administration_handling", "administration-handling.json", "Whether a solid oral form may be crushed/split/dispersed ('should not be crushed', APF22). Carries NO dose. Reference-only."],
  ["dose_evidence", "dose-evidence.json", "Citation register of dosing FINDINGS in the primary literature (real PMID/DOI). NOT prescribing, engine-isolated."],
  ["dose_guidance", "dose-guidance.json", "HELD at 0 records — doses cannot be LLM-authored; reserved for AMH/live vendor."],
  ["pbs", "pbs-formulary.json", "PBS Public API v3 formulary (open data): item code, ATC, authority_category, 60day_eligible."],
];

const out = [];
const P = (s = "") => out.push(s);

P("# PharmCheck — Export & Review Bundle (FL-30)");
P("");
P("> **Purpose.** A self-contained snapshot of Breath-Ezy's PharmCheck pharmacology subsystem for review/assessment in a standalone Claude Chat (no repo access needed). Generated from the live repo by `scripts/pharm-export.mjs`. **Samples + counts only** — full datasets are not included.");
P("> **Companion:** `DEVELOPMENT-INSTRUMENT.md` (how to propose changes) + `scripts/pharm-ingest.mjs` (how they come back in).");
P("");
P("## 0. What PharmCheck is (and is NOT)");
P("");
P("PharmCheck is a **deterministic safety-checking firewall** for medication decisions in an Australian telehealth CDS. It is **clinical decision support, not a prescriber**: it proposes, a registered practitioner disposes. It sits BEHIND a frozen wire contract (`pharm-intent` in, `pharm-check` out) and is the ONLY source of dose guidance in the system — the LLM never mints a dose.");
P("");
P("**Non-negotiable invariants (assess against these):**");
P("- **No dose from the LLM.** Dose guidance is emitted ONLY by the engine, ONLY on PASS/WARN, NEVER on HARD_FAIL/BLOCKED/paediatric.");
P("- **HARD_FAIL is terminal** — it blocks pipeline continuation unconditionally, no override.");
P("- **Paediatric (<18) → flag, never a dose** (no paediatric tables exist).");
P("- **Provenance or it doesn't ship** — every clinical record carries a provenance block; an anonymous fact is structurally unrepresentable.");
P("- **Fail-safe default** — absent proof → `BLOCKED_NO_PROOF`, never a fabricated code/dose/fact.");
P("- **Copyright boundary** — AusDI/DrugBank/STOPP-START/TDM are used for STRUCTURE + facts + citation only, never bulk content ingest.");
P("- **Nothing here is patient-facing.** All datasets are `-dev`/unsigned; receipts are `mode=mock` (never mock-as-live) until staging validation + clinician + regulatory (TGA) sign-off.");
P("");

// --- Architecture ---
P("## 1. Architecture");
P("");
P("```");
P("pharm-intent (frozen wire in)");
P("      │");
P("      ▼");
P("runPharmCheck(intent, resolved, {source})   ← engine.js (pure, deterministic)");
P("      │   reads clinical reference knowledge through the PharmDataSource seam");
P("      ▼");
P("PharmDataSource  ──► SyntheticSelfDevelopedSource  → reads data/*.json (clinician-signed synthetic, -dev)");
P("                 └─► LicensedFeedSource (stub, fail-closed) → a validated live vendor at Step 5");
P("      │");
P("      ▼");
P("pharm-check (frozen wire out): status + checks[] + dose_guidance? + receipt");
P("```");
P("");
P("The seam keeps provenance honest: `receiptMode()` returns `mock` until Step-5 validation, `receiptUpstream()` is `heydoc-pharm-synthetic-dev:` — the reference content is clinician-signed *synthetic*, never presented as a licensed vendor feed.");
P("");

// --- Firewall checks ---
P("## 2. The engine firewall — checks & status precedence");
P("");
P("Each check appends `{check_id, status, severity?, reason?, missing_facts_required?}`. `check_id` values come from the FROZEN `pharm-check` enum (do not invent new ones without amending the contract).");
P("");
P("| check_id | Fires | HARD_FAIL when |");
P("|---|---|---|");
P("| `allergy_check` | allergy status known/absent | drug shares a documented allergy cross-reactivity group |");
P("| `interaction_check` | interactions present | a `critical` interaction (else WARN) |");
P("| `renal_dosing_check` | renal rule + eGFR present | eGFR below a contraindication threshold (else WARN) |");
P("| `schedule_8_check` | AU schedule S8 (SUSMP) | S8 drug needs a PDMP/SafeScript check not performed |");
P("| `nti_check` | NTI drug | NTI drug with NO documented monitoring plan |");
P("| `age_appropriateness_check` | age known/absent | known paediatric (<18) → flag, no dose |");
P("");
P("**Status precedence:** `HARD_FAIL` (terminal) > `BLOCKED_NO_PROOF` (any NOT_RUN / unknown drug) > `WARN` > `PASS`. Dose guidance is attached ONLY on PASS/WARN and never for a paediatric case. An **unknown drug** (not in the signed datastore) → `BLOCKED_NO_PROOF` (escalate), unless already HARD_FAIL.");
P("");

// --- Frozen contracts ---
P("## 3. Frozen wire contracts (READ-ONLY — do not edit)");
P("");
P("### 3.1 `pharm-intent.schema.json` (input)");
P(fence(readJson("mcp/schemas/pharm-intent.schema.json")));
P("");
P("### 3.2 `pharm-check.schema.json` (output)");
P(fence(readJson("mcp/schemas/pharm-check.schema.json")));
P("");

// --- Provenance shape ---
P("## 4. Provenance block (mandatory on every clinical record)");
P("");
P("```");
P("{ source, source_ref, authored_by, reviewed_by:null, review_status:'draft'|'clinician_review'|'approved', version, effective_date }");
P("```");
P("The authoring pipeline FORCES `reviewed_by:null` + `review_status:'draft'` — nothing self-attests. `reviewed_by` is set only when a registered pharmacist signs off.");
P("");

// --- Heading-capability overlay ---
P("## 5. Capability organisation — heading overlay (APF22 taxonomy)");
P("");
P("Capabilities are organised under **heading capabilities** by a NON-DESTRUCTIVE overlay (`capability-groups.json`) — grouping is metadata; no dataset is migrated or merged. NTI-as-bucket: `nti` and `tdm_parameters` both sit under Therapeutic drug monitoring; the frozen `nti_check` is unchanged.");
P("");
try {
  const groups = dataJson("capability-groups.json");
  for (const g of groups.groups) P(`- **${g.title}** \`(${g.group_key})\` → ${g.member_capabilities.map((c) => "`" + c + "`").join(", ")}`);
} catch { P("_(capability-groups.json not present)_"); }
P("");

// --- Authorable enum vocabularies (introspected from the live .strict() schemas) ---
P("## 6. Authorable enum vocabularies (exact `.strict()` values)");
P("");
P("Author these fields to THESE values verbatim — `.strict()` rejects anything else, and a wrong value is HELD on ingest. Fields NOT listed (e.g. `mechanism_class`, `management_category`, `guidance`, `rationale`, `notes`) are free text. Introspected directly from the domain schemas, so this can never drift from the contract.");
P("");
const getShape = (schema) => { let s = schema; while (s && s._def && s._def.schema) s = s._def.schema; const d = s && s._def; return d && d.shape ? (typeof d.shape === "function" ? d.shape() : d.shape) : (s && s.shape) || {}; };
const enumVals = (f) => { let d = f && f._def; while (d && !d.values && d.innerType) d = d.innerType._def; return d && d.values ? d.values : null; };
const ENUM_CAPS = [
  ["administration_handling", MODEL.AdministrationHandlingSchema],
  ["tdm_parameters", MODEL.TdmParametersSchema],
  ["warning_labels", MODEL.WarningLabelSchema],
  ["counselling_points", MODEL.CounsellingPointSchema],
  ["interactions", MODEL.InteractionSchema],
  ["serious_adverse_effects", MODEL.SeriousAdverseEffectSchema],
  ["strong_contraindications", MODEL.StrongContraindicationSchema],
  ["precautions", MODEL.PrecautionSchema],
  ["clinical_uses", MODEL.ClinicalUseSchema],
  ["renal", MODEL.RenalDosingSchema],
  ["scheduling", MODEL.AuScheduleSchema],
];
P("```");
for (const [cap, schema] of ENUM_CAPS) {
  if (!schema) continue;
  const shape = getShape(schema);
  for (const [k, v] of Object.entries(shape)) { const vals = enumVals(v); if (vals) P(`${cap}.${k}: [${vals.join(", ")}]`); }
}
P("```");
P("");

// --- Capability inventory ---
P(`## 7. Leaf capability inventory (${CAPS.length} capabilities incl. PBS) — counts & samples`);
P("");
let total = 0;
for (const [cap, file, desc] of CAPS) {
  let ds;
  try { ds = dataJson(file); } catch { P(`### \`${cap}\` — (unreadable ${file})`); continue; }
  const n = Array.isArray(ds.records) ? ds.records.length : 0;
  total += n;
  P(`### \`${cap}\` — ${n} records`);
  P(`*${desc}*`);
  P(`Dataset: \`${file}\` · version \`${ds.dataset_version || "—"}\` · signed: **${ds.attestation ? ds.attestation.clinical_sign_off : "?"}**`);
  if (n > 0) P(fence(trim(ds.records)));
  else P("_(held — no records)_");
  P("");
}
P(`**Total curated records across capabilities:** ${total.toLocaleString()} (excludes the data-source registry).`);
P("");

// --- data source registry ---
P("## 8. Data-source / provenance registry");
P("");
const reg = dataJson("data-sources.json");
P(`\`data-sources.json\` v${reg.registry_version} — ${reg.sources.length} sources. \`structure_only\` = copyright-restricted (facts/structure/citation only).`);
P(fence(reg.sources.map((s) => ({ id: s.id, licence_status: s.licence_status, use_restriction: s.use_restriction }))));
P("");

// --- Known state / gaps ---
P("## 9. Known state, gaps & what a reviewer should probe");
P("");
P("- **Built & validated (Steps 2–5, signed KL 2026-07-13):** contract-lock, domain model, PharmDataSource seam, fail-closed authoring pipeline, engine wired through the seam (6-check firewall), staging validation (20/20 cases, 8/8 adversarial fail-safe).");
P("- **`dose_evidence` (2026-07-14):** 259 retrieval-grounded records / 129 drugs, real PubMed PMID/DOI, engine-ISOLATED (no accessor; not a dose source). Verify pass confirmed each citation resolves + supports its statement.");
P("- **APF22 reorg Priority-1 (2026-07-14):** heading overlay (`capability-groups.json`) + 4 reference-only capabilities — `administration_handling` ('should not be crushed'), `tdm_parameters` (NTI is the bucket under the TDM heading), `warning_labels` (RASML primary), `counselling_points`. All `-dev`/draft, seeded with APF22-cited facts, contract-tested. Frozen `nti_check` unchanged.");
P("- **`dose_guidance` HELD** at 0 records — doses cannot be LLM-authored (invariant). Reserved for AMH / live vendor.");
P("- **All datasets `-dev`/unsigned** — patient-facing is BLOCKED on: live CDS vendor, TGA/regulatory sign-off, live PBS pull, AusDI 3b, Clinician Verification Portal.");
P("- **Reviewer probes worth running:** Is any check bypassable? Can a dose ever originate outside the engine? Are the clinical records accurate against AMH/TGA? Is the copyright boundary respected? Are severities/mechanism_categories correct? Any capability with thin/incorrect coverage?");
P("");
P("---");
P("_Generated by `scripts/pharm-export.mjs` from the live repo. Bring changes back via the `DEVELOPMENT-INSTRUMENT.md` dev-package format → `scripts/pharm-ingest.mjs`._");

const destDir = join(ROOT, "docs", "pharmcheck-export");
mkdirSync(destDir, { recursive: true });
const dest = join(destDir, "PHARMCHECK-EXPORT.md");
writeFileSync(dest, out.join("\n") + "\n");
console.log(`wrote ${dest} (${out.join("\n").length.toLocaleString()} chars; ${total.toLocaleString()} records inventoried)`);
