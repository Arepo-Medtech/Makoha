/**
 * Contract test for dose-line segmentation (FL dose-guidance C2b).
 *
 * These lines exist to be SHOWN to a clinician, never selected by the engine. That is what makes
 * segmenting a clinician's clinical text safe here — and these tests pin the two properties the
 * safety argument rests on:
 *   1. THE SUBSTRING BAR — every statement and indication is a VERBATIM slice of the input. The
 *      segmenter may CUT, never WRITE. (Re-enforced at the schema, so it cannot be bypassed.)
 *   2. UNDER-SEGMENTING IS SAFE, OVER-SEGMENTING IS NOT — failing to split shows the clinician the
 *      whole statement; splitting wrongly could attach a dose to the wrong indication. When in
 *      doubt, don't split.
 *
 * Fixture content is invented (real APF text is © PSA and stays out of the repo — see
 * contract-apf-md-parser.js), but the SHAPES are taken from the real transcription. Env-gated
 * assertions sweep the clinician's actual 451 adult statements when HEYDOC_APF_MD is set.
 *
 * Run: node test/contract-dose-lines.js
 *      HEYDOC_APF_MD=~/Downloads/files/dose_evidence.md node test/contract-dose-lines.js
 */
import { readFileSync } from "node:fs";
import { segmentDoseLines, indicationStatus } from "../mcp/servers/pharmacology/domain/dose-lines.js";
import { parseDoseAmounts } from "../mcp/servers/pharmacology/domain/dose-plausibility.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const eq = (a, b, msg) => expect(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

/** The bar, applied to every line. */
const substringBarHolds = (src, lines) =>
  lines.every((l) => src.includes(l.statement) && (l.indication === null || src.includes(l.indication)));

// ---- 1. No indication → ONE line, stated as absent (never withheld) --------------------------
const flat = "100 mg twice daily, or 200 mg once daily.";
let L = segmentDoseLines(flat);
eq(L.length, 1, "an indication-less statement yields exactly one line");
eq(L[0].indication, null, "…with a null indication");
eq(L[0].statement, flat, "…carrying the whole statement verbatim");
eq(indicationStatus(L), "absent", "indication_status is 'absent' — a fact stated, not a dose withheld");
eq(L[0].basis, "flat_mg", "basis classified");

// ---- 2. Multi-indication → one line each ----------------------------------------------------
const multi = "Condition alpha: 2–4 g daily in divided doses. Condition beta: Initially 500 mg daily, increasing weekly.";
L = segmentDoseLines(multi);
eq(L.length, 2, "two indications yield two lines");
eq(L[0].indication, "Condition alpha", "first indication");
eq(L[1].indication, "Condition beta", "second indication");
eq(L[1].statement, "Initially 500 mg daily, increasing weekly.", "a statement with an embedded comma survives intact");
eq(indicationStatus(L), "present", "indication_status is 'present'");
expect(substringBarHolds(multi, L), "substring bar holds on a multi-indication statement");

// ---- 3. Dual basis + route: BOTH methods shown, neither hidden -------------------------------
// The case that exposed the old bar: a statement carrying mg/kg AND flat mg. The flat mg is real,
// comparable evidence and is exactly where a misplaced zero lands.
const dual = "Condition alpha: Oral, initially 4–5 mg/kg daily. Usual maintenance dose 200–500 mg daily. Maximum daily dose 600 mg. Condition beta: IV, 15–20 mg/kg.";
L = segmentDoseLines(dual);
eq(L.length, 2, "dual-basis multi-indication yields two lines");
eq(L[0].route, "Oral", "route extracted as metadata");
eq(L[1].route, "IV", "second route extracted");
eq(L[0].basis, "mixed", "a line carrying BOTH mg/kg and flat mg is 'mixed' — both methods reported");
eq(L[1].basis, "weight_based", "a weight-only line is 'weight_based'");
const amounts = parseDoseAmounts(L[0].statement);
eq(amounts.max_flat_mg, 600, "the FLAT component survives on a mixed line — the old whole-string rule discarded it");
expect(amounts.weight_based.length > 0, "…and the weight-based component is reported alongside, not instead");
expect(substringBarHolds(dual, L), "substring bar holds on a dual-basis statement");
// The route is metadata only — it must NOT be stripped out of the statement.
expect(L[0].statement.startsWith("Oral,"), "the route stays IN the statement — statement is maximally faithful");

// ---- 4. Qualifiers are NOT indications ------------------------------------------------------
// Derived from the real sweep: of 170 distinct labels, exactly three were qualifiers.
const qual = "40–320 mg daily. Maximum: 320 mg daily. Note: use divided doses above 160 mg.";
L = segmentDoseLines(qual);
eq(L.length, 1, "'Maximum:' and 'Note:' are qualifiers, not indications — they must not split the statement");
eq(L[0].indication, null, "…so the line stays indication-less");
eq(indicationStatus(L), "absent", "…and the status reflects that");
// But a qualifier-PREFIXED clinical label IS meaningful and must survive.
const maint = "Maintenance, predominantly negative symptoms: 50 mg twice daily.";
L = segmentDoseLines(maint);
eq(L[0].indication, "Maintenance, predominantly negative symptoms",
  "a qualifier-prefixed CLINICAL label is kept — the stop-list is deliberately narrow, because over-correcting destroys real information");

// ---- 5. Leading unlabelled text is kept, never dropped ---------------------------------------
const lead = "500 mg once daily initially. Condition alpha: 1 g twice daily.";
L = segmentDoseLines(lead);
eq(L.length, 2, "text before the first indication becomes its own line");
eq(L[0].indication, null, "…indication-less");
eq(L[0].statement, "500 mg once daily initially.", "…and is NOT discarded (dropping a fragment loses dose content silently)");
expect(substringBarHolds(lead, L), "substring bar holds with leading text");

// ---- 6. Degenerate input --------------------------------------------------------------------
eq(segmentDoseLines("").length, 0, "empty input yields no lines");
eq(segmentDoseLines("   ").length, 0, "whitespace-only yields no lines");
L = segmentDoseLines("See approved product information and specialist protocols.");
eq(L.length, 1, "a refer-out is still SHOWN as a line");
eq(L[0].basis, "none", "…with basis 'none' (no mass amount) — shown, not hidden");

// ---- 7. The clinician's REAL statements (env-gated; skips green in CI) -----------------------
const real = process.env.HEYDOC_APF_MD;
if (!real) {
  console.log("contract-dose-lines: OK (fixture) — real-file sweep SKIPPED (set HEYDOC_APF_MD to run)");
} else {
  const md = readFileSync(real, "utf8");
  const blocks = md.split(/^### /m).slice(1);
  let n = 0, violations = 0, absent = 0, present = 0, qualifiers = 0;
  for (const b of blocks) {
    const m = /^- \*\*Adult dose:\*\*\s*(.+)$/m.exec(b);
    if (!m) continue;
    n++;
    const src = m[1].trim();
    const lines = segmentDoseLines(src);
    if (!substringBarHolds(src, lines)) violations++;
    indicationStatus(lines) === "absent" ? absent++ : present++;
    for (const l of lines) if (l.indication && /^(note|maximum|minimum)\b/i.test(l.indication)) qualifiers++;
    expect(lines.length >= 1, `every adult statement yields at least one line (failed near: ${src.slice(0, 40)})`);
  }
  eq(n, 451, "swept all 451 real adult statements");
  eq(violations, 0, "SUBSTRING BAR HOLDS ON EVERY REAL STATEMENT — 0 violations required");
  eq(qualifiers, 0, "no qualifier is mislabelled as an indication across the real corpus");
  eq(absent + present, 451, "every statement classified");
  console.log(`contract-dose-lines: OK (fixture + REAL sweep: 451 statements, 0 substring violations, ${absent} indication-absent / ${present} present)`);
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-dose-lines FAIL (${errors.length})`);
  process.exit(1);
}
if (!real) console.log("contract-dose-lines: fixture assertions passed");
