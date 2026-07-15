/**
 * xlsx-min — a minimal, DEPENDENCY-FREE .xlsx writer (OOXML SpreadsheetML).
 *
 * WHY THIS EXISTS RATHER THAN A LIBRARY. CLAUDE.md is explicit: no dependency is introduced
 * mid-execution, and every addition needs Phase 2 justification + a provenance check. An .xlsx is a
 * ZIP of XML, and Node ships `zlib` — so the clinician gets the format they asked for with no new
 * supply-chain surface on a clinical-safety repo. This is a DEV TOOL (scripts/), never runtime code.
 *
 * SCOPE, deliberately tiny: inline strings (no sharedStrings table), one style for the header row and
 * one for wrapped body text, frozen panes, column widths, and a list dataValidation for the Decision
 * dropdown. That is exactly what the sign-off worksheet needs — matching the shape of the worksheets
 * KL already used (`PharmCheck-signoff-worksheet-KL-2026-07-14.xlsx`: columns A–J, Decision dropdown
 * "Attest,Amend,Reject"). Nothing more, so there is less to be wrong.
 *
 * DETERMINISTIC BY CONSTRUCTION: the ZIP timestamp is caller-supplied, so re-running over unchanged
 * records produces byte-identical output. A worksheet is a medicolegal artifact; a diff on it should
 * mean the content changed, not that the clock moved.
 */
import { deflateRawSync, inflateRawSync } from "node:zlib";

/* ── CRC-32 (ZIP requires it; ~15 lines beats a dependency) ─────────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** XML text escape. Also strips control chars OOXML forbids — a stray one makes the file unopenable. */
export function esc(s) {
  return String(s ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** 0-based column index → A, B, … Z, AA, AB … */
export function colName(i) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/* ── ZIP ────────────────────────────────────────────────────────────────────────────────────────── */
function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

/**
 * Build a ZIP from [{ name, data:Buffer }]. Deflated, no directory entries, no zip64 (a worksheet is
 * kilobytes — the 4GB/65535-entry limits are not reachable here).
 */
function zip(entries, when) {
  const { time, date } = dosTime(when);
  const locals = []; const central = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const comp = deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10); cd.writeUInt16LE(time, 12); cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);

    offset += lh.length + name.length + comp.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, cdBuf, eocd]);
}

/**
 * Read every cell's text out of an .xlsx, joined.
 *
 * WHY A READER LIVES IN A WRITER MODULE. The .xlsx is now an attestation SURFACE — the artifact a
 * registered practitioner reads before signing a dose. R-47a's bar ("nothing recorded-but-not-
 * displayed") must therefore be checkable against the file ON DISK, not merely against the strings we
 * intended to write: a bar that only inspects the generator's own variables cannot catch a generator
 * that drops a cell. The workbook body is deflated inside the ZIP, so a test grepping the bytes finds
 * nothing and proves nothing.
 *
 * Deliberately text-only and structure-blind — it answers "does this string appear anywhere in this
 * workbook", which is exactly the question the bar asks and nothing more.
 *
 * @param {Buffer} buf - .xlsx bytes
 * @returns {string} every <t> run in every sheet part, newline-joined
 */
export function readXlsxText(buf) {
  const parts = unzip(buf);
  const text = Object.entries(parts)
    .filter(([n]) => n.startsWith("xl/worksheets/") || n === "xl/sharedStrings.xml")
    .map(([, b]) => b.toString("utf8"))
    .join("\n");
  return [...text.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join("\n");
}

/** Unzip to { name: Buffer } — shared by the text and row readers. */
function unzip(buf) {
  const out = {};
  let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const csize = buf.readUInt32LE(i + 18);
    const nlen = buf.readUInt16LE(i + 26);
    const elen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nlen).toString("utf8");
    const start = i + 30 + nlen + elen;
    const raw = buf.subarray(start, start + csize);
    try { out[name] = method === 8 ? inflateRawSync(raw) : raw; } catch { /* skip unreadable part */ }
    i = start + csize;
  }
  return out;
}

/** Reverse esc(). &amp; LAST, or "&amp;lt;" decodes to "<". */
const unesc = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&");

/**
 * Read a sheet's cells as [{ A: "…", B: "…" }, …] (index 0 = row 1).
 *
 * WHY: the attestation worksheet is a ROUND TRIP — we write it, the clinician marks it in Excel, we
 * read his decisions back and apply them. Reading back is the medicolegal half: it decides which
 * doses become approved. Excel rewrites the workbook on save (inline strings → a sharedStrings table,
 * its own styles/theme parts), so the reader must handle BOTH what we emit and what Excel emits, or
 * the round trip silently reads nothing and "0 decisions found" looks like "no decisions made".
 *
 * @param {Buffer} buf
 * @param {number} sheetIndex - 1-based, matching xl/worksheets/sheetN.xml
 * @returns {Array<Record<string,string>>}
 */
export function readXlsxSheet(buf, sheetIndex = 1) {
  const parts = unzip(buf);
  const ssXml = parts["xl/sharedStrings.xml"]?.toString("utf8") ?? "";
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const xml = parts[`xl/worksheets/sheet${sheetIndex}.xml`]?.toString("utf8");
  if (!xml) return [];

  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const n = Number(rm[1]);
    const cells = {};
    // An EMPTY cell is written self-closing (`<c r="J2"/>`) by Excel, and by us. A pattern that
    // requires `</c>` does not merely miss it — it runs on and captures the NEXT cell's body as this
    // cell's value. On this worksheet that silently reads the clinician's amendment note as his
    // DECISION: a blank mark becomes whatever sits to its right. Match the self-closing form first.
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs] = cm;
      const body = cm[3] ?? "";
      const t = /t="(\w+)"/.exec(attrs)?.[1] ?? "n";
      if (t === "s") {
        const v = /<v>(\d+)<\/v>/.exec(body);
        cells[ref] = v ? (shared[Number(v[1])] ?? "") : "";
      } else if (t === "inlineStr") {
        cells[ref] = unesc([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      } else {
        cells[ref] = unesc(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      }
    }
    rows[n - 1] = cells;
  }
  return [...rows].map((r) => r ?? {});
}

/* ── SpreadsheetML ──────────────────────────────────────────────────────────────────────────────── */
const XLMAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/** styles: 0 = default · 1 = header (bold, fill, wrap, top) · 2 = body (wrap, top) · 3 = bold */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${XLMAIN}">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5496"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Exported so the sheet body can be asserted directly — the workbook bytes are DEFLATED, so a test
 *  grepping them for a dropdown or a cell value silently finds nothing and proves nothing. */
export function sheetXml(sheet) {
  const rows = sheet.rows.map((cells, r) => {
    const cs = cells.map((cell, c) => {
      if (cell === null || cell === undefined || cell === "") return "";
      const v = typeof cell === "object" ? cell.v : cell;
      const s = typeof cell === "object" && cell.s !== undefined ? cell.s : (r === 0 ? 1 : 2);
      const ref = `${colName(c)}${r + 1}`;
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cs}</row>`;
  }).join("");

  const lastCol = colName(Math.max(0, ...sheet.rows.map((r) => r.length)) - 1);
  const dim = `<dimension ref="A1:${lastCol}${Math.max(1, sheet.rows.length)}"/>`;
  const pane = sheet.freeze
    ? `<sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView>`
    : `<sheetView workbookViewId="0"/>`;
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const dv = sheet.validation
    ? `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${sheet.validation.sqref}"><formula1>"${sheet.validation.values.join(",")}"</formula1></dataValidation></dataValidations>`
    : "";
  const af = sheet.autofilter ? `<autoFilter ref="${sheet.autofilter}"/>` : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${XLMAIN}">${dim}<sheetViews>${pane}</sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${af}${dv}</worksheet>`;
}

/**
 * Write a workbook.
 * @param {Array<{name:string, rows:Array<Array<string|number|{v:any,s:number}>>, widths?:number[],
 *                freeze?:number, validation?:{sqref:string, values:string[]}, autofilter?:string}>} sheets
 * @param {{ when?: Date }} opts - `when` fixes the ZIP timestamp so output is reproducible.
 * @returns {Buffer} .xlsx bytes
 */
export function writeXlsx(sheets, { when = new Date(2026, 0, 1, 0, 0, 0) } = {}) {
  const B = (s) => Buffer.from(s, "utf8");
  const files = [
    { name: "[Content_Types].xml", data: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${XLMAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: B(STYLES) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: B(sheetXml(s)) })),
  ];
  return zip(files, when);
}
