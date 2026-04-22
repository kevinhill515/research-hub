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
};
const PERIODS = ["1D", "5D", "MTD", "QTD", "YTD", "1Y", "3Y"];
export const FX_PATTERN = /FX\s*[-_]?\s*(3M|12M)/i;

/* Split one line into cells, handling tab- OR comma-separated + stripping
 * wrapping quotes. Whitespace around each cell is trimmed. */
export function splitRow(line) {
  const delim = line.indexOf("\t") >= 0 ? "\t" : ",";
  return line.split(delim).map(function (s) {
    return s.trim().replace(/^"|"$/g, "");
  });
}

/* Parse a single FX matrix block. Given all lines and the index of the
 * "FX - 3M %" (or 12M) header row, returns {block, endIdx} where
 *   block = { cols: [string], rows: [{label, values: [decimal|null]}] }
 * and endIdx is the next line to resume scanning from.
 * Returns block=null when the block is malformed/empty. */
export function parseFxMatrixBlock(lines, startIdx) {
  /* Find the col-header row: next non-blank line after the block label. */
  let j = startIdx + 1;
  while (j < lines.length && !lines[j].trim()) j++;
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
    if (!lines[k].trim()) break;
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
  const bySection = { indices: [], sectors: [], countries: [], commodities: [], bonds: [] };
  const fxMatrices = {};
  let dropped = 0;
  let headerSkipped = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const firstCell = (splitRow(line)[0] || "").trim();

    /* FX matrix block? */
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
    /* Skip a "Section, Label, Ticker, ..." header row */
    if (/^section$|^name$|^label$/i.test(parts[0] || "")) {
      headerSkipped = true;
      i++;
      continue;
    }

    const secKey = SECTION_ALIASES[(parts[0] || "").toLowerCase()];
    if (!secKey || parts.length < 4) { dropped++; i++; continue; }

    const row = { label: parts[1] || "", ticker: parts[2] || null };
    for (let p = 0; p < PERIODS.length; p++) {
      row[PERIODS[p]] = pctToDecimal(parts[3 + p]);
    }
    bySection[secKey].push(row);
    i++;
  }

  return { bySection, fxMatrices, dropped, headerSkipped };
}
