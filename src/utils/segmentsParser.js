/* Parser for the Company Segments + Geography paste.
 *
 * Input: a 2D table copied from the FactSet (or analyst) segment template:
 *
 *   Schneider Electric SE
 *                          FY 2015    FY 2016    ...   FY 2025
 *                          12/31/2015 12/31/2016 ...   12/31/2025
 *
 *   Energy Management
 *     Sales                                              19,520 ...
 *     EBIT                                                4,103 ...
 *     Margin                                              21.0% ...
 *     ROA
 *
 *   Industrial Automation
 *     Sales                  5,696   5,485   ...
 *     EBIT                   1,081     ...
 *     Margin                 19.0%
 *     ROA
 *   ...
 *   Total
 *     Sales                 26,640   24,459   ...
 *     EBIT                   3,317    3,312
 *     Margin                12.5%   13.5%
 *     ROA                    3.4     4.2
 *
 *   Revenue by Geography
 *     Revenue              26,640   24,459   ...
 *     France                 6.4%     6.8%   ...
 *     United States         22.8%   23.5%   ...
 *     ...
 *
 * Output:
 *   {
 *     companyName: "Schneider Electric SE",
 *     years: [2015, ..., 2025],
 *     segments: [
 *       { name, isCostCenter, sales: [...], ebit: [...], margin: [...], roa: [...] },
 *       ...
 *     ],
 *     geography: {
 *       revenue: [...],         // raw revenue $$ per year
 *       regions: [              // sorted in paste order; the view sorts
 *         { name, values: [...] },  // each value is decimal share (0.228 = 22.8%)
 *       ],
 *     },
 *     dropped: number,
 *   }
 *
 * Key conventions:
 *   - Negatives in parens (e.g. (670.9)) → -670.9
 *   - Percent strings (21.0%) → 0.21 (decimal). Bare numbers in margin/ROA
 *     rows are heuristically treated as raw percent (>1.5) or decimal.
 *   - A "Total" segment in the paste is parsed but flagged so the view
 *     can derive totals from the parts (or display the parsed total).
 *   - A "Revenue by Geography" section header switches the parser into
 *     geography mode; the next row whose name is "Revenue" is the
 *     absolute revenue, and subsequent rows are regional shares.
 */

const ERR_TOKENS = new Set(["#N/A", "#NUM!", "#VALUE!", "#REF!", "#DIV/0!", "#NAME?", "--", "-", "—", "n/a", "N/A", ""]);

function splitRow(line) {
  if (line.indexOf("\t") >= 0) return line.split("\t").map(function (s) { return s.trim(); });
  return line.split(/ {2,}/).map(function (s) { return s.trim(); });
}

function extractYear(s) {
  const t = (s || "").trim();
  if (!t) return null;
  let m = t.match(/^FY[\s-]?(\d{4})$/i);                /* "FY 2015" */
  if (m) return parseInt(m[1], 10);
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);          /* ISO */
  if (m) return parseInt(m[1], 10);
  m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);  /* US */
  if (m) return parseInt(m[3], 10);
  m = t.match(/^[A-Za-z]{3}[- ](\d{4})$/);               /* Mon-YYYY */
  if (m) return parseInt(m[1], 10);
  m = t.match(/^(\d{4})$/);                               /* YYYY */
  if (m) return parseInt(m[1], 10);
  return null;
}

function looksLikeYearHeader(cells) {
  let hits = 0;
  cells.forEach(function (c) { if (extractYear(c) !== null) hits++; });
  return hits >= 3;
}

/* Parse a numeric cell. Detects:
 *   - parenthesized negatives "(670.9)" → -670.9
 *   - comma thousands "26,640"
 *   - percent suffix "22.8%" → 0.228 (decimal)
 *   - error tokens / blank → null
 * Returns { value, hadPercent } so callers can know whether to apply
 * raw-percent heuristics later. */
function parseValue(raw) {
  if (raw === null || raw === undefined) return { value: null, hadPercent: false };
  const s = String(raw).trim();
  if (!s || ERR_TOKENS.has(s)) return { value: null, hadPercent: false };
  const hadPercent = s.indexOf("%") >= 0;
  let t = s.replace(/,/g, "").replace(/%/g, "");
  const paren = t.match(/^\((.+)\)$/);
  if (paren) t = "-" + paren[1];
  const n = parseFloat(t);
  if (!isFinite(n)) return { value: null, hadPercent: hadPercent };
  return { value: hadPercent ? n / 100 : n, hadPercent: hadPercent };
}

function rowName(cells, yearStartCol) {
  const limit = Math.max(1, yearStartCol);
  for (let c = 0; c < limit; c++) {
    const cv = ((cells[c] || "") + "").trim();
    if (cv) return cv;
  }
  return "";
}

export function parseSegmentsPaste(text) {
  const lines = (text || "").split(/\r?\n/).map(function (l) { return l.replace(/\s+$/, ""); });

  /* 1. Year header row. */
  let yearRowIdx = -1, yearCells = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (looksLikeYearHeader(cells)) { yearRowIdx = i; yearCells = cells; break; }
  }
  if (yearRowIdx < 0) {
    return { error: "Couldn't find a year header row (expected cells like FY 2015 / 12/31/2015 / 2015)." };
  }

  /* 2. Year columns + indices. */
  let yearStartCol = -1;
  const years = [];
  yearCells.forEach(function (c, idx) {
    const y = extractYear(c);
    if (y !== null) { if (yearStartCol < 0) yearStartCol = idx; years.push(y); }
  });
  if (years.length === 0) return { error: "Year header had no parseable years." };

  /* 3. Company name — first non-empty row above the year header that
        isn't itself a year-header label. */
  let companyName = null;
  for (let i = 0; i < yearRowIdx; i++) {
    const line = (lines[i] || "").trim();
    if (!line) continue;
    const cells = splitRow(line);
    const first = (cells[0] || "").trim();
    if (!first) continue;
    /* Avoid mistaking a sub-header (a date row right above the year row,
       which is also a year-header by our definition) for the company name. */
    if (looksLikeYearHeader(cells)) continue;
    companyName = first;
    break;
  }

  /* 4. Find where the data starts (first row after all year-header /
        date rows). FactSet typically has 2 header rows: FY YYYY then
        12/31/YYYY. We skip any consecutive year-like rows. */
  let dataStartRow = yearRowIdx + 1;
  while (dataStartRow < lines.length) {
    const cells = splitRow(lines[dataStartRow]);
    if (!looksLikeYearHeader(cells)) break;
    dataStartRow++;
  }

  /* 5. Walk rows. State machine:
        - "segments" mode (default): collect segment blocks until we see a
          "Revenue by Geography" header, after which we switch to "geo" mode.
        - "geo" mode: first "Revenue" row = total revenue; everything else
          is a region with values stored as decimal share. */
  const segments = [];
  let currentSeg = null;
  const geography = { revenue: null, regions: [] };
  let mode = "segments";
  let dropped = 0;

  function readValues(cells) {
    const out = years.map(function () { return null; });
    let anyPct = false;
    for (let i = 0; i < years.length; i++) {
      const r = parseValue(cells[yearStartCol + i]);
      out[i] = r.value;
      if (r.hadPercent) anyPct = true;
    }
    return { values: out, anyPct: anyPct };
  }

  function endCurrentSegment() {
    if (currentSeg && (currentSeg.sales.some(isFiniteV) || currentSeg.ebit.some(isFiniteV))) {
      segments.push(currentSeg);
    }
    currentSeg = null;
  }

  for (let i = dataStartRow; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const cells = splitRow(raw);
    const name = rowName(cells, yearStartCol);
    if (!name) continue;

    /* Geography section header — switch mode. */
    if (/^revenue\s+by\s+geography$/i.test(name)) {
      endCurrentSegment();
      mode = "geo";
      continue;
    }

    /* Detect end-of-segments — a "Total" segment header (we still capture
       its rows so the user can sanity-check, but mark isCostCenter=false
       and let the view decide whether to render). */

    const { values: vals, anyPct } = readValues(cells);
    const hasNumber = vals.some(isFiniteV);

    if (mode === "segments") {
      /* Recognized sub-rows under the current segment. */
      const sub = subRowKind(name);
      if (sub && currentSeg) {
        currentSeg[sub] = vals;
        if (sub === "margin" || sub === "roa") {
          /* Normalize to decimal: if any cell had % suffix it's already
             decimal, but bare numbers may be raw percent (e.g. 21.0). */
          currentSeg[sub] = normalizePctSeries(vals, anyPct);
        }
        continue;
      }
      /* Otherwise this row is a new segment header (whether or not it has
         numbers — the FactSet template puts the segment name as a label
         row with empty value cells). */
      endCurrentSegment();
      currentSeg = makeSegment(name, years.length);
      /* Skip if it's clearly a section divider (e.g. "Total" — we keep
         it as a segment for now and the view can recognize/skip it). */
      currentSeg.isTotal = /^total$/i.test(name);
      continue;
    }

    /* mode === "geo" */
    if (/^revenue$/i.test(name)) {
      geography.revenue = vals;
      continue;
    }
    if (!hasNumber) {
      /* Section sub-header inside geography, e.g. "by Geography" — skip. */
      continue;
    }
    geography.regions.push({
      name: name,
      values: normalizePctSeries(vals, anyPct),
    });
  }
  endCurrentSegment();

  /* 6. Tag cost centers — segments with no Sales but EBIT data
        (e.g. "Central Functions & Digital Costs"). */
  segments.forEach(function (s) {
    if (s.isTotal) return;
    s.isCostCenter = !s.sales.some(isFiniteV) && s.ebit.some(isFiniteV);
  });

  return {
    companyName: companyName,
    years: years,
    segments: segments.filter(function (s) { return !s.isTotal; }),
    geography: geography,
    /* Keep the parsed total separately so the view can compare against the
       sum of segments (sanity check) without rendering it as a segment. */
    parsedTotal: segments.find(function (s) { return s.isTotal; }) || null,
    dropped: dropped,
  };
}

function makeSegment(name, n) {
  return {
    name: name,
    isCostCenter: false,
    sales:  new Array(n).fill(null),
    ebit:   new Array(n).fill(null),
    margin: new Array(n).fill(null),
    roa:    new Array(n).fill(null),
  };
}

function subRowKind(name) {
  const t = (name || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (t === "sales" || t === "revenue") return "sales";
  if (t === "ebit" || t === "operating income" || t === "op income") return "ebit";
  if (t === "margin" || t === "operating margin" || t === "ebit margin") return "margin";
  if (t === "roa" || t === "return on assets") return "roa";
  return null;
}

function isFiniteV(v) { return v !== null && v !== undefined && isFinite(v); }

/* Normalize a margin/ROA series so the stored values are always decimal
 * (0.21 = 21%). If the paste row had a % suffix anywhere it's already
 * decimal (parseValue divided by 100); otherwise we apply the
 * "any value > 1.5 → raw percent" rule. */
function normalizePctSeries(values, hadPercentInRow) {
  if (hadPercentInRow) return values; /* already decimal */
  const rawAsPct = values.some(function (v) { return isFiniteV(v) && Math.abs(v) > 1.5; });
  if (!rawAsPct) return values;
  return values.map(function (v) { return isFiniteV(v) ? v * 0.01 : null; });
}
