/* Canonicalize a ticker. Uppercases, and strips a leading "MS" prefix
   when the remainder is purely numeric — FactSet emits both forms
   ("MS655052" and "655052") for the same MSCI index series. Real
   tickers like MS-US, MSFT are unaffected (non-digit chars after MS). */
function canonical(t) {
  if (!t) return "";
  const u = String(t).toUpperCase().trim();
  if (/^MS\d+$/.test(u)) return u.slice(2);
  return u;
}

/* Parser for the daily-prices upload.
 *
 * Accepts two layouts (auto-detected by the header):
 *
 * (1) Simple wide — first col is a shared date, each remaining col is a
 *     ticker. Best for one-market pastes.
 *
 *       Date         ANCTF   ATD-CA   AAPL
 *       2020-01-02   35.40   46.20    75.09
 *       …
 *
 * (2) Paired (Date, Ticker) columns — every other column is a Date and
 *     each ticker has its own date axis. Best for cross-market pastes
 *     where calendars differ (e.g. NYSE vs TSE holidays).
 *
 *       Date         AAPL    Date         7203-TKY
 *       2020-01-02   75.09   2020-01-06   1395
 *       2020-01-03   74.36   2020-01-07   1409
 *       …
 *
 * Detection rule: 2+ columns whose header looks like a date label
 * ("Date", "Trade Date", "asof") triggers paired mode.
 *
 * Tab- or comma-delimited.
 *
 * Returns a map of { TICKER: [{ d: "YYYY-MM-DD", p: number }] } for each
 * ticker column found. Dates are normalized to ISO YYYY-MM-DD (accepts
 * MM/DD/YYYY, M/D/YY, YYYY-MM-DD on input). Missing / non-numeric /
 * "#N/A" / "--" cells are silently skipped — no row is emitted for that
 * ticker on that date. Empty header columns are ignored.
 *
 * The first row is REQUIRED to be a header (with the date label in col 0
 * and ticker symbols across). The parser also rejects any data row whose
 * first cell doesn't parse as a date — that catches accidental non-date
 * leading rows.
 */

/* MM/DD/YYYY or M/D/YY or YYYY-MM-DD → ISO YYYY-MM-DD. Returns null
   when the input doesn't match a known shape. */
function toIsoDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  // YYYY-MM-DD or YYYY/MM/DD
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const yy = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const dd = parseInt(m[3], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return yy + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd;
    }
  }
  // MM/DD/YYYY or M/D/YY (US format from Excel)
  m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (m) {
    const mm = parseInt(m[1], 10);
    const dd = parseInt(m[2], 10);
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy += yy >= 50 ? 1900 : 2000;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return yy + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd;
    }
  }
  return null;
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Common missing-data sentinels
  if (/^(--|—|n\/?a|#n\/?a|null|#ref!?|#value!?)$/i.test(s)) return null;
  // Strip thousands commas (e.g. "1,234.56")
  const cleaned = s.replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

export function parsePriceHistory(text) {
  if (!text || !text.trim()) {
    return { byTicker: {}, dates: 0, tickers: 0, dropped: 0, errors: [] };
  }
  const lines = text.split("\n").map(function (l) { return l.replace("\r", ""); }).filter(function (l) { return l.trim(); });
  if (lines.length < 2) {
    return { byTicker: {}, dates: 0, tickers: 0, dropped: 0, errors: ["Need at least a header row + one data row."] };
  }
  /* Detect delimiter from the header line. Fall back to tab. */
  const delim = lines[0].indexOf("\t") >= 0 ? "\t" : ",";
  const split = function (l) {
    return l.split(delim).map(function (s) { return s.trim().replace(/^"|"$/g, ""); });
  };
  const header = split(lines[0]);
  if (header.length < 2) {
    return { byTicker: {}, dates: 0, tickers: 0, dropped: 0, errors: ["Header row needs a date column followed by ticker columns."] };
  }
  /* Detect paired (Date, Ticker, Date, Ticker, …) layout vs simple
     wide (Date, T1, T2, …). Paired layout is preferred for cross-market
     pastes because each ticker has its own date column — markets with
     different trading calendars (e.g. NYSE vs TSE) line up cleanly
     without forcing a unified date axis. We treat the input as paired
     when there are 2+ columns whose header looks like a "Date" label
     ("Date", "Trade Date", "asof", anything starting with "date"
     case-insensitively). */
  function isDateHeader(s) {
    if (!s) return false;
    const t = String(s).trim().toLowerCase();
    return t === "date" || t.startsWith("date") || t === "asof" || t === "trade date";
  }
  const dateColCount = header.reduce(function (n, h) { return n + (isDateHeader(h) ? 1 : 0); }, 0);
  const paired = dateColCount >= 2;

  const byTicker = {};
  let dates = 0;
  let dropped = 0;

  if (paired) {
    /* Walk header in (date, ticker) pairs. Each pair is independent —
       we only read its two columns from each data row, so unrelated
       markets with different trading days don't pollute each other. */
    const pairs = []; /* { dateIdx, priceIdx, ticker } */
    for (let i = 0; i < header.length; i++) {
      if (!isDateHeader(header[i])) continue;
      /* Find the next non-blank column after this date — that's the price/ticker. */
      let j = i + 1;
      while (j < header.length && !(header[j] || "").trim()) j++;
      if (j >= header.length) continue;
      const tk = canonical(header[j]);
      if (!tk || isDateHeader(header[j])) continue;
      pairs.push({ dateIdx: i, priceIdx: j, ticker: tk });
      if (!byTicker[tk]) byTicker[tk] = [];
    }
    if (pairs.length === 0) {
      return { byTicker: {}, dates: 0, tickers: 0, dropped: 0, errors: ["Paired header detected but no Date/Ticker pairs could be matched."] };
    }
    /* Track unique dates seen across all tickers for the dates count. */
    const dateSeen = {};
    for (let r = 1; r < lines.length; r++) {
      const cells = split(lines[r]);
      let anyOk = false;
      let anyTried = false;
      pairs.forEach(function (pr) {
        const rawDate = cells[pr.dateIdx];
        const rawPrice = cells[pr.priceIdx];
        if (!rawDate && !rawPrice) return; /* blank pair — skip silently */
        anyTried = true;
        const iso = toIsoDate(rawDate);
        if (!iso) return;
        const p = toNumber(rawPrice);
        if (p === null || !(p > 0)) return;
        byTicker[pr.ticker].push({ d: iso, p: p });
        dateSeen[iso] = true;
        anyOk = true;
      });
      if (anyTried && !anyOk) dropped++;
    }
    dates = Object.keys(dateSeen).length;
    var tickerCount = pairs.length;
  } else {
    /* Simple wide: col 0 is the shared date, cols 1..n are tickers. */
    const tickerCols = []; /* { idx, ticker } */
    for (let i = 1; i < header.length; i++) {
      const tk = canonical(header[i]);
      if (!tk) continue; /* skip blank header columns */
      tickerCols.push({ idx: i, ticker: tk });
      byTicker[tk] = [];
    }
    if (tickerCols.length === 0) {
      return { byTicker: {}, dates: 0, tickers: 0, dropped: 0, errors: ["No ticker columns found in header."] };
    }
    for (let r = 1; r < lines.length; r++) {
      const cells = split(lines[r]);
      const iso = toIsoDate(cells[0]);
      if (!iso) {
        dropped++;
        continue;
      }
      dates++;
      tickerCols.forEach(function (tc) {
        const p = toNumber(cells[tc.idx]);
        if (p !== null && p > 0) {
          byTicker[tc.ticker].push({ d: iso, p: p });
        }
      });
    }
    var tickerCount = tickerCols.length;
  }
  /* Sort each ticker's series ascending by date — small but important
     for downstream chart code that assumes left-to-right time order. */
  Object.keys(byTicker).forEach(function (tk) {
    byTicker[tk].sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  });
  return { byTicker: byTicker, dates: dates, tickers: tickerCount, dropped: dropped, errors: [] };
}

/* Merge new entries into an existing series, deduping by date. Returns
 * a fresh array sorted ascending. Used by both the upload (preserves
 * existing history when a partial paste comes in) and the daily script
 * (appends yesterday's close without losing history). */
export function mergePriceSeries(existing, incoming) {
  const byDate = {};
  (existing || []).forEach(function (e) { if (e && e.d) byDate[e.d] = e; });
  (incoming || []).forEach(function (e) { if (e && e.d) byDate[e.d] = e; });
  const dates = Object.keys(byDate).sort();
  return dates.map(function (d) { return byDate[d]; });
}
