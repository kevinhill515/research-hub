/* Pure parser for the Data Hub "Dashboard" manual upload.
 *
 * Accepts flat section rows and optional FX matrix blocks mixed in
 * one paste. Format documentation lives in the Data Hub UI + README;
 * see parseDashboardUpload below for exact parsing rules.
 *
 * This module is deliberately side-effect-free (no setState, no
 * network, no alerts) so it can be unit-tested with fixture strings. */

import { pctToDecimal } from "./format.js";

const SECTION_ALIASES = {
  indices: "indices",
  sectors: "sectors",
  countries: "countries",
  commodities: "commodities",
  bonds: "bonds",
  fx: "fx",
};
/* 11 trailing-return columns. "TODAY" is the FactSet column name; we
 * normalize it to "1D" in storage so existing UI surfaces keep working
 * (the Snapshot benchmark row reads "1D"). */
const PERIODS = ["1D", "5D", "MTD", "1M", "QTD", "3M", "6M", "YTD", "1Y", "2Y", "3Y"];
const PERIOD_HEADER_ALIASES = {
  today: "1D", "1d": "1D", "5d": "5D", mtd: "MTD", "1m": "1M",
  qtd: "QTD", "3m": "3M", "6m": "6M", ytd: "YTD",
  "1y": "1Y", "1yr": "1Y", "2y": "2Y", "2yr": "2Y", "3y": "3Y", "3yr": "3Y",
};
export const FX_PATTERN = /FX\s*[-_]?\s*(3M|12M)/i;

/* Split one line into cells, handling tab- OR comma-separated + stripping
 * wrapping quotes. Whitespace AROUND each cell is trimmed; whitespace
 * INSIDE a quoted value is preserved (standard CSV behavior). */
export function splitRow(line) {
  const delim = line.indexOf("\t") >= 0 ? "\t" : ",";
  return line.split(delim).map(function (s) {
    return s.trim().replace(/^"|"$/g, "");
  });
}

/* True when a line is empty OR contains only delimiters/whitespace —
 * Excel "copy empty row" often produces ",,,,," rather than "". */
export function isBlankLine(line) {
  if (!line.trim()) return true;
  return !line.replace(/[\s,\t]/g, "");
}

/* Parse a single FX matrix block. Given all lines and the index of the
 * "FX - 3M %" (or 12M) header row, returns {block, endIdx} where
 *   block = { cols: [string], rows: [{label, values: [decimal|null]}] }
 * and endIdx is the next line to resume scanning from.
 * Returns block=null when the block is malformed/empty. */
export function parseFxMatrixBlock(lines, startIdx) {
  /* Find the col-header row: next non-blank line after the block label.
   * isBlankLine treats ",,,,," as blank (xlsx export of a blank row). */
  let j = startIdx + 1;
  while (j < lines.length && isBlankLine(lines[j])) j++;
  if (j >= lines.length) return { block: null, endIdx: j };

  const headerCells = splitRow(lines[j]);
  /* Excel's leading ">" marker (or a blank cell) precedes the real
   * col-header currencies. Skip over it. */
  const colStart = (headerCells[0] === ">" || headerCells[0] === "") ? 1 : 0;
  const cols = headerCells.slice(colStart).filter(function (x) { return x; });
  if (cols.length === 0) return { block: null, endIdx: j + 1 };

  /* Read data rows until we hit: a blank line, another FX block, or a
   * flat section header (Indices/Sectors/etc.). */
  const rows = [];
  let k = j + 1;
  while (k < lines.length) {
    if (isBlankLine(lines[k])) break;
    const cells = splitRow(lines[k]);
    const firstCell = (cells[0] || "").trim();
    if (!firstCell) break;
    if (FX_PATTERN.test(firstCell)) break;
    if (SECTION_ALIASES[firstCell.toLowerCase()]) break;
    const values = [];
    for (let c = 0; c < cols.length; c++) {
      values.push(pctToDecimal(cells[colStart + c]));
    }
    rows.push({ label: firstCell, values: values });
    k++;
  }
  return { block: { cols: cols, rows: rows }, endIdx: k };
}

/* Parse the full Dashboard upload text. Returns:
 *   {
 *     bySection: { indices: [...], sectors: [...], ... },
 *     fxMatrices: { "3M": {cols, rows}, "12M": {...} },
 *     dropped: number,     // count of un-parseable flat rows
 *     headerSkipped: bool, // true if a "Section, Label, ..." header was skipped
 *   }
 *
 * Each item in bySection[x] = { label, ticker|null, 1D, 5D, MTD, QTD, YTD, 1Y, 3Y }
 * Percent fields stored as DECIMAL (via pctToDecimal). */
export function parseDashboardUpload(text) {
  const lines = (text || "").split("\n").map(function (l) { return l.replace("\r", ""); });
  const bySection = { indices: [], sectors: [], countries: [], commodities: [], bonds: [], fx: [] };
  const fxMatrices = {};
  let dropped = 0;
  let headerSkipped = false;

  /* Column→period mapping for the flat rows. Defaults to canonical 11-
     window order if no header was seen (Section / Label / Ticker / 1D /
     5D / MTD / 1M / QTD / 3M / 6M / YTD / 1Y / 2Y / 3Y). When a
     "Section / Label / Ticker / TODAY / 5D / ..." header is present,
     we infer the column-to-period mapping from it so older 7-window
     and newer 11-window pastes both work. */
  let periodCols = PERIODS.slice();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const firstCell = (splitRow(line)[0] || "").trim();

    /* FX matrix block? (legacy "FX - 3M %" / "FX - 12M %" cross-currency
       matrices, distinct from the new flat FX section.) */
    const fxMatch = FX_PATTERN.exec(firstCell);
    if (fxMatch) {
      const period = fxMatch[1].toUpperCase();
      const result = parseFxMatrixBlock(lines, i);
      if (result.block) fxMatrices[period] = result.block;
      i = result.endIdx;
      continue;
    }

    /* Flat section row? */
    const parts = splitRow(line);
    /* Skip a "Section, Label, Ticker, ..." header row. Use it to
       remap which column → which period for the data rows below. */
    if (/^section$|^name$|^label$/i.test(parts[0] || "")) {
      headerSkipped = true;
      const inferred = [];
      for (let c = 3; c < parts.length; c++) {
        const k = (parts[c] || "").toLowerCase().replace(/\s+/g, "");
        const mapped = PERIOD_HEADER_ALIASES[k] || (PERIODS.indexOf(k.toUpperCase()) >= 0 ? k.toUpperCase() : null);
        if (mapped) inferred.push(mapped);
      }
      if (inferred.length > 0) periodCols = inferred;
      i++;
      continue;
    }

    const secKey = SECTION_ALIASES[(parts[0] || "").toLowerCase()];
    if (!secKey || parts.length < 4) { dropped++; i++; continue; }

    const row = { label: parts[1] || "", ticker: parts[2] || null };
    for (let p = 0; p < periodCols.length; p++) {
      row[periodCols[p]] = pctToDecimal(parts[3 + p]);
    }
    bySection[secKey].push(row);
    i++;
  }

  return { bySection, fxMatrices, dropped, headerSkipped };
}
