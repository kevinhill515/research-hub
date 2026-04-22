/* Shared primitives used across the Data Hub upload parsers in
 * useImport.js. Pure (no React, no async, no side effects) — safe to
 * import from anywhere and easy to unit-test.
 *
 * Most of the upload functions had ~10 lines of identical boilerplate
 * around tab-vs-comma detection, header-row skip, and quote stripping.
 * Hoisted here. */

/* True when a line is empty OR contains only delimiters/whitespace —
 * Excel "copy empty row" often produces ",,,,," rather than "". */
export function isBlankLine(line) {
  if (!line || !line.trim()) return true;
  return !line.replace(/[\s,\t]/g, "");
}

/* Split one line into cells, handling tab- OR comma-separated. Strips
 * outer whitespace + wrapping quotes (preserves whitespace INSIDE
 * quoted values, per CSV semantics). */
export function splitRow(line, delim) {
  if (delim === undefined) delim = line.indexOf("\t") >= 0 ? "\t" : ",";
  return line.split(delim).map(function (s) {
    return s.trim().replace(/^"|"$/g, "");
  });
}

/* Split text into trimmed non-blank lines (carriage returns stripped). */
export function nonBlankLines(text) {
  return (text || "").split("\n")
    .map(function (l) { return l.replace("\r", ""); })
    .filter(function (l) { return l.trim(); });
}

/* If the first row of `lines` looks like a column header (first cell
 * matches one of the provided header keywords case-insensitively),
 * return a copy of `lines` with that row removed. Otherwise return the
 * input unchanged. */
export function skipHeaderRow(lines, headerKeywords) {
  if (!lines || lines.length === 0) return lines;
  const first = lines[0];
  const cells = splitRow(first);
  const cell0 = (cells[0] || "").toLowerCase().trim();
  const re = new RegExp("^(" + headerKeywords.map(function (k) {
    return k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("|") + ")$", "i");
  if (re.test(cell0)) return lines.slice(1);
  return lines;
}

/* Find the first company in `companies` matching a row's identifying
 * cells. Tries case-insensitive name match (col 0) first, then optional
 * ord-ticker match (col 1 for layouts that include ticker as col 2). */
export function matchCompany(companies, parts, opts) {
  const nameCell = (parts[0] || "").toLowerCase().trim();
  const tickerCell = opts && opts.tickerCol !== undefined
    ? (parts[opts.tickerCol] || "").toLowerCase().trim()
    : null;
  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    const cname = (c.name || "").toLowerCase().trim();
    if (cname && cname === nameCell) return c;
    if (tickerCell) {
      const tickers = (c.tickers || []).map(function (t) {
        return (t.ticker || "").toLowerCase();
      });
      if (tickers.indexOf(tickerCell) >= 0) return c;
    }
  }
  return null;
}

/* Show an alert via the provided alertFn, after a tiny setTimeout to let
 * the calling setCompanies() write commit to React state first.
 * Pattern repeated in nearly every applyXImport. */
export function notifyAfterImport(alertFn, msg, clearFn) {
  setTimeout(function () {
    if (alertFn) alertFn(msg);
    if (clearFn) clearFn();
  }, 100);
}
