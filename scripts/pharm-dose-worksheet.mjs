/**
 * pharm-dose-worksheet — R-47a: the CLINICIAN ATTESTATION SURFACE for AU dose guidance.
 *
 * WHY THIS EXISTS, AND WHY IT IS LOAD-BEARING (gap R-47).
 * The operator ruled AU primacy: a `non_congruent` AU dose SHIPS and needs no explanatory note,
 * because "as long as the non-congruent fact has been ALERTED to the clinician, it is assumed the
 * clinician has weighed it in their decision". That reasoning is sound — and it has a precondition
 * nothing else enforces. `DoseGuidanceSchema` guarantees the foreign label's dose is **RECORDED**
 * (`au_congruence.comparators[].dose_statement` is required). **Nothing guarantees it is DISPLAYED.**
 * An appraisal recorded but never rendered satisfies every schema and every test, READS as done
 * because the data is right there in the record, and quietly defeats Guardrail 2 — because "the
 * clinician weighed it" presumes the clinician SAW it.
 *
 * This module is the half of R-47 that C2d needs: without it KL attests 11 dose records blind.
 * The other half — the runtime surface a consulting clinician sees — rides with the Clinician
 * Verification Portal (blocker #2) and is NOT closed by this file.
 *
 * THE MECHANICAL BAR (the point of the whole module): `renderDoseWorksheet` SELF-VERIFIES that every
 * comparator dose, every plausibility state, and the verbatim source statement actually appear in the
 * output it returns, and THROWS if any is missing. A renderer that silently drops a divergence is the
 * exact failure R-47 names, so it is made unrepresentable rather than left to review. This binds the
 * MACHINE, never the clinician — the inverse of the bars this subsystem keeps removing.
 *
 * Usage: node scripts/pharm-dose-worksheet.mjs --utc 2026-07-15 [--out <path>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

const FLAG = {
  implausible: "⚠️ ORDER-OF-MAGNITUDE FLAG — read this line against the source before attesting",
  unassessable: "— no plausibility claim made (NOT an all-clear)",
  plausible: "no order-of-magnitude discrepancy",
};

/**
 * Render the attestation worksheet.
 *
 * @param {Array} records - dose-guidance records (AU)
 * @param {Array} international - international_dose_guidance records (US/EU, engine-isolated)
 * @param {{ utc: string }} opts
 * @returns {string} markdown
 * @throws if any required evidence is missing from the rendered output (see header).
 */
export function renderDoseWorksheet(records, international = [], { utc } = {}) {
  const L = [];
  L.push(`# AU dose-guidance — clinician attestation worksheet (${utc})`);
  L.push("");
  L.push("**Reviewer:** Kenneth Lee (MED0001857758) · **Records:** " + records.length + " · all `review_status: draft`");
  L.push("");
  L.push("Every AU dose below is **your own verbatim APF22 Section D text**. The agent segmented and labelled it for display; it did not write any dose (the schema's substring bar enforces this mechanically).");
  L.push("");
  L.push("**AU has primacy.** The US/EU labels shown are *evidence beside* your dose, never a verdict on it. A dose differing from a foreign label is normal — jurisdictions differ by approved indication, population and regulatory history — and needs no justification from you. They are shown so the decision is yours with everything we hold in front of you.");
  L.push("");
  L.push("Mark each record **Attest** / **Amend** / **Reject**.");
  L.push("");
  L.push("---");
  L.push("");

  for (const r of records) {
    L.push(`## ${r.ingredient}`);
    L.push("");
    L.push(`**Your APF22 text (verbatim — this is what the engine emits):**`);
    L.push("");
    L.push("> " + r.source_statement);
    L.push("");
    L.push(`Indication status: \`${r.indication_status}\`` + (r.indication_status === "absent" ? " — the monograph carries no indication for this range. Stated, not withheld." : ""));
    L.push("");
    L.push("| # | Indication | Route | Dosing basis | Plausibility |");
    L.push("|---|---|---|---|---|");
    r.dose_lines.forEach((l, i) => {
      const basis = l.basis === "mixed" ? "**mixed** (weight-based AND flat mg — both shown)" : l.basis;
      L.push(`| ${i + 1} | ${l.indication ?? "*(indication absent)*"} | ${l.route ?? "—"} | ${basis} | \`${l.plausibility}\` ${FLAG[l.plausibility] ?? ""} |`);
    });
    L.push("");
    for (const l of r.dose_lines) {
      L.push(`- **Line ${r.dose_lines.indexOf(l) + 1}** (${l.indication ?? "indication absent"}): ${l.statement}`);
      if (l.plausibility !== "plausible" && l.plausibility_note) L.push(`  - ${l.plausibility_note}`);
    }
    L.push("");

    const c = r.au_congruence;
    if (c.status === "no_comparator") {
      L.push(`**International labels:** none. \`no_comparator\` — ${c.appraisal_note}`);
    } else {
      L.push(`**International labels — \`${c.status}\`**` + (c.status === "non_congruent" ? " — **the AU dose differs from the foreign label(s) below.** This is shown for your judgement; it does not question your dose." : ""));
      L.push("");
      L.push("| Jurisdiction | Agency | Authorisation status | Label dose (verbatim) | Amass id |");
      L.push("|---|---|---|---|---|");
      for (const cm of c.comparators) {
        const intl = international.find((x) => x.amass_id === cm.amass_id);
        const status = intl ? intl.authorization_status : "unknown";
        const warn = status !== "ACTIVE" ? ` **⚠️ ${status} — not a current label**` : "";
        L.push(`| ${cm.jurisdiction} | ${cm.agency} | ${status}${warn} | ${cm.dose_statement} | \`${cm.amass_id}\` |`);
      }
    }
    L.push("");
    L.push(`**Decision:** ☐ Attest ☐ Amend ☐ Reject — _______________`);
    L.push("");
    L.push("---");
    L.push("");
  }

  // Case 4 — international evidence for a drug with NO AU dose. Showing nothing is not neutrality.
  const auNames = new Set(records.map((r) => r.ingredient.toLowerCase()));
  const orphan = [...new Set(international.map((r) => r.ingredient.toLowerCase()))].filter((n) => !auNames.has(n));
  L.push("## International-only evidence (no AU dose authored)");
  L.push("");
  if (!orphan.length) {
    L.push("*None — every drug with an international label also has an AU dose in this worksheet.*");
  } else {
    for (const n of orphan) {
      const rows = international.filter((x) => x.ingredient.toLowerCase() === n && x.dose_statement);
      const both = new Set(rows.map((x) => x.jurisdiction));
      const rung = both.has("US") && both.has("EU") ? "**international_corroborated** (US *and* EU)" : "**single foreign label — a bare fact, NOT a common range**";
      L.push(`### ${n} — no AU source. ${rung}`);
      for (const x of rows) L.push(`- ${x.jurisdiction} (${x.agency}, ${x.authorization_status}): ${x.dose_statement}`);
      L.push("");
      L.push("**Not an AU dose** — AU indications, scheduling and PI may differ. Shown because withholding what we hold is not neutrality.");
      L.push("");
    }
  }
  L.push("");

  const out = L.join("\n");

  assertEvidenceRendered(out, records);
  return out;
}

/**
 * THE R-47 BAR, as a function so it can be TESTED rather than trusted.
 *
 * Asserts that a rendered surface actually DISPLAYS every piece of evidence the records carry: the
 * clinician's verbatim source, every dose line, every plausibility state, the congruence status, and
 * — the one that matters most — every comparator's dose. A surface that drops a divergence is the
 * exact failure R-47 names: recorded, never displayed, passing every schema, reading as done.
 *
 * This is the inverse of the bars this subsystem keeps removing. It does not bin a clinician's dose
 * or demand they justify it; it constrains the MACHINE, guaranteeing the clinician is never asked to
 * weigh something they were not shown.
 *
 * @throws Error naming the record and the missing evidence.
 */
export function assertEvidenceRendered(out, records) {
  for (const r of records) {
    if (!out.includes(r.source_statement)) throw new Error(`R-47: ${r.ingredient} — the verbatim source statement is RECORDED but NOT DISPLAYED`);
    for (const l of r.dose_lines) {
      if (!out.includes(l.statement)) throw new Error(`R-47: ${r.ingredient} — a dose line is RECORDED but NOT DISPLAYED`);
      if (!out.includes(`\`${l.plausibility}\``)) throw new Error(`R-47: ${r.ingredient} — plausibility state "${l.plausibility}" is RECORDED but NOT DISPLAYED`);
    }
    for (const cm of r.au_congruence.comparators) {
      if (!out.includes(cm.dose_statement)) {
        throw new Error(`R-47: ${r.ingredient} — a ${cm.jurisdiction} comparator dose is RECORDED but NOT DISPLAYED. A non-congruence the clinician cannot see defeats the entire AU-primacy ruling, which assumes they were alerted to it.`);
      }
    }
    if (r.au_congruence.status !== "no_comparator" && !out.includes(`\`${r.au_congruence.status}\``)) {
      throw new Error(`R-47: ${r.ingredient} — the congruence status is RECORDED but NOT DISPLAYED`);
    }
  }
}


function main(argv) {
  const args = argv.slice(2);
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const utc = val("--utc");
  if (!utc) { console.error("usage: node scripts/pharm-dose-worksheet.mjs --utc <YYYY-MM-DD> [--out <path>]"); process.exit(2); }
  const records = JSON.parse(readFileSync(join(DATA_DIR, "dose-guidance.json"), "utf8")).records || [];
  const intl = JSON.parse(readFileSync(join(DATA_DIR, "international-dose-guidance.json"), "utf8")).records || [];
  const md = renderDoseWorksheet(records, intl, { utc });
  const out = val("--out") || join(__dirname, "..", "eval", "pharmacology", "signoff", `dose-guidance-worksheet-KL-${utc}.md`);
  writeFileSync(out, md);
  console.log(`pharm-dose-worksheet: ${records.length} record(s) → ${out}`);
  console.log("  R-47 self-verification PASSED — every comparator dose, plausibility state and verbatim source is rendered.");
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
