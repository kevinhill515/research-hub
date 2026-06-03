/* Parser for the EPS Estimate Revisions paste.
 *
 * Expected layout (pasted from the user's analyst spreadsheet):
 *
 *   Row 1 — header. The relevant cells are:
 *     A1: (any label; column A holds the ticker on data rows)
 *     C1: (any label; column C holds the company name)
 *     E1..Q1:  13 dates representing month-by-month snapshots of the
 *              EPS0 (last completed FY) consensus.
 *     S1..AE1: 13 dates for EPS+1 monthly history.
 *     AG1..AS1: 13 dates for EPS+2 monthly history.
 *     AU1..BG1: 13 dates for EPS+3 monthly history.
 *     (We accept any dates across all four horizons but use E1..Q1 as
 *      the canonical x-axis since they're the same in practice.)
 *
 *   Rows 2..N — one data row per company:
 *     A: Ticker (optional but preferred for matching)
 *     C: Company name (used as fallback when ticker doesn't match)
 *     D: EPS0 anchor (actual reported EPS for last completed FY)
 *     E..Q: 13 monthly snapshots of EPS0 (oldest first)
 *     R: EPS+1 anchor (current consensus)
 *     S..AE: 13 monthly snapshots of EPS+1
 *     AF: EPS+2 anchor
 *     AG..AS: 13 monthly snapshots of EPS+2
 *     AT: EPS+3 anchor
 *     AU..BG: 13 monthly snapshots of EPS+3
 *
 * Layout per horizon = 1 anchor + 13 monthly = 14 columns.
 * 4 horizons × 14 = 56 columns. From column D (index 3) through
 * column BG (index 58). 56 columns total. ✓
 *
 * Output:
 *   {
 *     dates: [13 ISO date strings, oldest first],
 *     rows: [{
 *       ticker, name,
 *       series: [
 *         { horizon: 0, label: "EPS",       anchor, monthly[13] },
 *         { horizon: 1, label: "E[EPS] +1", anchor, monthly[13] },
 *         { horizon: 2, label: "E[EPS] +2", anchor, monthly[13] },
 *         { horizon: 3, label: "E[EPS] +3", anchor, monthly[13] },
 *       ],
 *     }, ...],
 *     dropped: number,    // rows we couldn't classify
 *   }
 *
 * Tolerant of:
 *   - missing values (#N/A, blanks, error tokens) → null
 *   - parens negatives (-5.20) or (5.20)
 *   - currency prefix (£, $, €)
 *   - comma thousands
 *   - tab- OR comma-delimited paste
 */

const ERR_TOKENS = new Set(["#N/A", "#NUM!", "#VALUE!", "#REF!", "#DIV/0!", "#NAME?", "--", "-", "—", "n/a", "N/A", ""]);
const HORIZON_LABELS = ["EPS", "E[EPS] +1", "E[EPS] +2", "E[EPS] +3"];

function splitRow(line) {
  if (line.indexOf("\t") >= 0) return line.split("\t").map(function (s) { return s; });
  return line.split(",").map(function (s) { return s; });
}

function parseValue(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || ERR_TOKENS.has(s)) return null;
  let t = s.replace(/[£$€¥,]/g, "");
  const paren = t.match(/^\((.+)\)$/);
  if (paren) t = "-" + paren[1];
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}

function parseDate(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  /* Accept YYYY-MM-DD, M/D/YYYY, or M/D/YY */
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    return iso(y, mo, d);
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const mo = parseInt(m[1], 10);
    const d = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return iso(y, mo, d);
  }
  /* Excel serial number (rare via paste, but handle just in case) */
  const n = parseFloat(s);
  if (isFinite(n) && n > 25000 && n < 100000) {
    /* Excel epoch is 1899-12-30 */
    const ms = (n - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

function iso(y, mo, d) {
  return String(y).padStart(4, "0") + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

/* Generate 13 last-of-month dates ending in the current month.
   Used when the paste has no header row — the absolute dates don't
   really matter (the chart just plots monthly snapshots), but having
   plausible recent dates keeps the axis labels useful. */
function defaultDates(count) {
  const out = [];
  const t = new Date();
  for (let i = count - 1; i >= 0; i--) {
    /* End-of-month for (currentMonth - i): day=0 of next month. */
    const d = new Date(t.getFullYear(), t.getMonth() - i + 1, 0);
    out.push(iso(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }
  return out;
}

/* Detect a "name-led" alternate layout commonly pasted from Excel:
 *   Col A: company name (no ticker)
 *   Col B: FY end date (12/31/2025)
 *   Col C: anchor or first monthly value
 *   Cols D..(D+12): 13 monthly values
 *   Col (D+13): next FY end date
 *   ... and so on for 4 horizons.
 *
 * Detection: row's first cell is a non-ticker string (contains
 * spaces / lowercase / commas — anything that doesn't look like
 * a stock ticker) AND the second cell parses as a date.
 *
 * Reshape: rewrite the row into the canonical layout the parser
 * expects (ticker_col=0 empty, B=empty, C=name, D=anchor, E..Q=13
 * monthly, R=anchor+1, ...) by stripping the 4 FY-end date cells
 * and inserting an empty ticker + an empty B placeholder + the name
 * at the start, then a null anchor before each block of 13 monthly
 * values (the user's format doesn't carry a separate anchor — all
 * 13 cells per horizon are monthly snapshots). */
const TICKER_LIKE_RE = /^[A-Z0-9]+(-[A-Z]{2,4})?$/;
const SLASH_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const ISO_DATE_RE  = /^\d{4}-\d{1,2}-\d{1,2}$/;
function looksLikeNameLed(cells) {
  if (!cells || cells.length < 16) return false;
  const a = (cells[0] || "").trim();
  const b = (cells[1] || "").trim();
  if (!a || !b) return false;
  if (TICKER_LIKE_RE.test(a)) return false; /* looks like a ticker, not a name */
  if (!(SLASH_DATE_RE.test(b) || ISO_DATE_RE.test(b))) return false;
  return true;
}
function reshapeNameLed(cells) {
  /* Build the canonical-layout array. Each horizon block = 1 anchor
     (null in this layout) + 13 monthly values. The user's data has
     each horizon at positions [1 + h*14] (date) + 13 values
     immediately after. */
  const out = ["", "", (cells[0] || "").trim()]; /* ticker, B placeholder, name */
  for (let h = 0; h < 4; h++) {
    const base = 1 + h * 14; /* date position in source */
    out.push(null); /* anchor = null — user's format has no separate anchor */
    for (let i = 0; i < 13; i++) {
      out.push(cells[base + 1 + i] !== undefined ? cells[base + 1 + i] : null);
    }
  }
  return out;
}

export function parseEpsRevisionsPaste(text) {
  const lines = (text || "").split(/\r?\n/).filter(function (l) { return l.trim(); });
  if (lines.length < 1) {
    return { error: "Empty paste — need at least one data row." };
  }

  /* Header is now optional. We try to parse the first row's
     columns E..Q (indices 4..16) as dates; if 6+ parse, treat it as
     the header (and skip when reading data rows). Otherwise the
     first row IS a data row and we auto-generate 13 last-of-month
     dates ending in the current month. This matches the lenient
     behavior of every other manual upload. */
  let firstDataRow = 0;
  let dates = [];
  const firstRow = splitRow(lines[0]);
  const headerDates = [];
  for (let i = 4; i <= 16; i++) {
    const d = parseDate(firstRow[i]);
    if (d) headerDates.push(d);
  }
  if (headerDates.length >= 6) {
    dates = headerDates;
    firstDataRow = 1;
  } else {
    dates = defaultDates(13);
    firstDataRow = 0;
  }

  const N = dates.length;

  /* Each horizon block = 1 anchor + N monthly values. Layout assumes:
       D (3)            anchor EPS0
       E..(D+N) (4..)   monthly EPS0
       (D+N+1)          anchor EPS+1
       ...
     Block size = 1 + N. Four horizons total. */
  const BLOCK = 1 + N;
  const rows = [];
  let dropped = 0;

  for (let r = firstDataRow; r < lines.length; r++) {
    let cells = splitRow(lines[r]);
    /* Auto-reshape: if this row uses the name-led + date-separated
       layout (col A = name, col B = FY date), rewrite into the
       canonical ticker-led shape so the rest of the loop works
       unchanged. */
    if (looksLikeNameLed(cells)) {
      cells = reshapeNameLed(cells);
    }
    const ticker = (cells[0] || "").trim();
    const name = (cells[2] || "").trim();
    if (!ticker && !name) { dropped++; continue; }
    const series = [];
    let anyValue = false;
    for (let h = 0; h < 4; h++) {
      const startCol = 3 + h * BLOCK;
      const anchor = parseValue(cells[startCol]);
      const monthly = [];
      for (let i = 0; i < N; i++) {
        monthly.push(parseValue(cells[startCol + 1 + i]));
      }
      if (anchor !== null || monthly.some(function (v) { return v !== null; })) anyValue = true;
      series.push({
        horizon: h,
        label: HORIZON_LABELS[h],
        anchor: anchor,
        monthly: monthly,
      });
    }
    if (!anyValue) { dropped++; continue; }
    rows.push({ ticker: ticker, name: name, series: series });
  }

  return {
    dates: dates,
    rows: rows,
    dropped: dropped,
  };
}
