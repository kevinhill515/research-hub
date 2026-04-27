/* Parses a FactSet "Guidance History" paste block.
 *
 * Expected format (B2:M58 from a typical sheet — row indices are flexible
 * since the parser auto-locates the header row):
 *   Row 1+: free-form metadata; one line contains "...Company Name (TICKER-XX)"
 *   Then a blank or comments line (ignored)
 *   Header row: "Date Issued | Period | Item | Guidance L | Guidance Low Comment | Guidance H | Guidance High Comment | Mean | Mean Surp (%) | Actual | Actual Surp (%) | Price Impact (%)"
 *   Data rows: tab-separated, M/D/YY dates, comma-formatted numbers,
 *     "%" on the surprise / impact columns. Empty cells appear as "-".
 *
 * Output:
 *   {
 *     ticker: "6758-JP" | null,
 *     companyName: "Sony Group Corporation" | null,
 *     rows: [{ date, period, item, low, high, mean, actual, meanSurp, actualSurp, priceImpact }, ...],
 *     error: null | string,
 *   }
 *
 * Dates are normalized to ISO "YYYY-MM-DD". Surprise / impact values are
 * stored as decimals (8.7% → 0.087). Absolute monetary / share values are
 * stored as plain numbers (commas stripped, parens converted to negative).
 *
 * The parser is tolerant of:
 *   - extra metadata rows above the title (date last refreshed, price/ccy)
 *   - "Guidance L" header that sits adjacent to "Guidance Low Comment" — we
 *     match exact column names rather than substrings to avoid colliding
 *   - point estimates (low == high) and ranges (low < high)
 *   - "-" / blank / "n.a." / "#N/A" values, all parsed as null
 */

const TICKER_RE = /\(([A-Za-z0-9]{1,8}(?:[-\/][A-Za-z]{1,3})?)\)/;
const NAME_RE   = /Guidance\s*History\s*[-–—]\s*(.+?)\s*\(/i;

/* Parse a date string in M/D/YY, M/D/YYYY, MM/DD/YY, or YYYY-MM-DD form.
 * Returns ISO "YYYY-MM-DD" or null if unparseable. Two-digit years
 * < 50 are interpreted as 2000s, ≥ 50 as 1900s. */
export function parseGuidanceDate(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  if (!t || t === "-" || t === "—" || /^n\.?a\.?$/i.test(t)) return null;
  // ISO already
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    return m[1] + "-" + String(parseInt(m[2], 10)).padStart(2, "0") + "-" + String(parseInt(m[3], 10)).padStart(2, "0");
  }
  // M/D/YY or M/D/YYYY
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    return y + "-" + String(parseInt(m[1], 10)).padStart(2, "0") + "-" + String(parseInt(m[2], 10)).padStart(2, "0");
  }
  return null;
}

/* Parse a numeric cell that may include commas, parens (negative),
 * trailing "%", or sentinel placeholders. Returns null if blank/unparseable.
 * Note: this does NOT divide percent values by 100 — see parseGuidancePct. */
export function parseGuidanceNum(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).trim();
  if (!t || t === "-" || t === "—") return null;
  if (/^(n\.?a\.?|#n\/a|#num!|#value!)$/i.test(t)) return null;
  const neg = /^\((.*)\)$/.exec(t);
  if (neg) t = "-" + neg[1];
  t = t.replace(/,/g, "").replace(/%$/, "").trim();
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}

/* Parse a percent cell. "8.7%" → 0.087, "8.7" → 0.087 (always treats raw
 * value as percent-form since these columns are always %-typed). */
export function parseGuidancePct(s) {
  const n = parseGuidanceNum(s);
  return n === null ? null : n / 100;
}

/* Find the column index whose header EXACTLY equals one of the given
 * labels (case-insensitive). Returns -1 if none match. */
function findColExact(headerCells, labels) {
  const lows = labels.map(function (l) { return l.toLowerCase(); });
  for (let i = 0; i < headerCells.length; i++) {
    const h = (headerCells[i] || "").trim().toLowerCase();
    if (lows.indexOf(h) >= 0) return i;
  }
  return -1;
}

/* Find the column index whose header CONTAINS the given substring. */
function findColContains(headerCells, sub) {
  const s = sub.toLowerCase();
  for (let i = 0; i < headerCells.length; i++) {
    if ((headerCells[i] || "").trim().toLowerCase().indexOf(s) >= 0) return i;
  }
  return -1;
}

export function parseGuidancePaste(text) {
  const lines = String(text || "").split(/\r?\n/);
  let ticker = null, companyName = null, headerIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) continue;
    if (ticker === null) {
      const tm = TICKER_RE.exec(ln);
      if (tm) {
        ticker = tm[1].toUpperCase();
        const nm = NAME_RE.exec(ln);
        if (nm) companyName = nm[1].trim();
      }
    }
    if (/\bdate issued\b/i.test(ln)) { headerIdx = i; break; }
  }

  if (headerIdx < 0) {
    return { ticker: ticker, companyName: companyName, rows: [], error: "Could not find a 'Date Issued' header row." };
  }

  const headerCells = lines[headerIdx].split("\t").map(function (s) { return (s || "").trim(); });
  const idx = {
    date:        findColExact(headerCells, ["Date Issued"]),
    period:      findColExact(headerCells, ["Period"]),
    item:        findColExact(headerCells, ["Item"]),
    low:         findColExact(headerCells, ["Guidance L", "Guidance Low"]),
    high:        findColExact(headerCells, ["Guidance H", "Guidance High"]),
    mean:        findColExact(headerCells, ["Mean"]),
    actual:      findColExact(headerCells, ["Actual"]),
    meanSurp:    findColContains(headerCells, "mean surp"),
    actualSurp:  findColContains(headerCells, "actual surp"),
    priceImpact: findColContains(headerCells, "price impact"),
  };

  if (idx.date < 0 || idx.period < 0 || idx.item < 0) {
    return { ticker: ticker, companyName: companyName, rows: [], error: "Header row is missing Date Issued / Period / Item columns." };
  }

  const rows = [];
  let dropped = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) continue;
    const cells = ln.split("\t");
    const date = parseGuidanceDate(cells[idx.date]);
    const period = parseGuidanceDate(cells[idx.period]);
    const item = (cells[idx.item] || "").trim();
    if (!date || !period || !item) { dropped++; continue; }

    const low    = idx.low    >= 0 ? parseGuidanceNum(cells[idx.low])    : null;
    const high   = idx.high   >= 0 ? parseGuidanceNum(cells[idx.high])   : null;
    const mean   = idx.mean   >= 0 ? parseGuidanceNum(cells[idx.mean])   : null;
    const actual = idx.actual >= 0 ? parseGuidanceNum(cells[idx.actual]) : null;
    const meanSurp    = idx.meanSurp    >= 0 ? parseGuidancePct(cells[idx.meanSurp])    : null;
    const actualSurp  = idx.actualSurp  >= 0 ? parseGuidancePct(cells[idx.actualSurp])  : null;
    const priceImpact = idx.priceImpact >= 0 ? parseGuidancePct(cells[idx.priceImpact]) : null;

    /* Skip rows with no useful content — at least one of low/high/actual
       must be a real number. (Mean alone isn't enough — Mean is the
       consensus estimate, not company guidance.) */
    if (low === null && high === null && actual === null) { dropped++; continue; }

    rows.push({
      date: date, period: period, item: item,
      low: low, high: high, mean: mean, actual: actual,
      meanSurp: meanSurp, actualSurp: actualSurp, priceImpact: priceImpact,
    });
  }

  return { ticker: ticker, companyName: companyName, rows: rows, dropped: dropped, error: null };
}
