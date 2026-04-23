/* Parser for the FactSet "Ratio Analysis" paste.
 *
 * Input format — a 2D table copied from the FactSet Excel add-in block:
 *
 *   <company name>
 *   Ratio Analysis   Dec-2016  Dec-2017  ...  Dec-2028
 *                    Final/    Final/    ...  Estimate
 *   Profitability
 *   Gross Margin     38.59     38.85     ...  41.54
 *   SG&A to Sales    25.05     24.73     ...  18.61
 *   ...
 *   Valuation
 *   Price/Sales      1.53      1.62      ...  3.12
 *   ...
 *
 * Cells are tab- or whitespace-delimited. Section headers (e.g.
 * "Profitability") are rows that have a name but no numeric values
 * alongside it. Estimate columns are detected from the "Estimate"
 * tokens in the metadata row (row just below the year header).
 *
 * Values may be:
 *   - plain numbers (42.35)
 *   - negative (-19.67)
 *   - parenthesized for negative ((19.67))
 *   - comma thousands (174,246.48)
 *   - percent form (3.09 — stored as-is; the display layer knows how
 *     to render based on the ratio name)
 *   - Excel errors (#N/A, #NUM!, #VALUE!, "--", "-") → null
 *
 * Output:
 *   {
 *     years:    [2016, 2017, ..., 2028],
 *     estimate: [false, ..., true, true, true],
 *     sections: [
 *       { name: "Profitability",
 *         items: [
 *           { name: "Gross Margin", values: [38.59, 38.85, ..., 41.54] },
 *           ...
 *         ]
 *       },
 *       ...
 *     ],
 *     // flat helpers for rendering + lookup
 *     ratioNames: ["Gross Margin", ...],
 *     values: { "Gross Margin": [...], ... },
 *     dropped: N,  // rows we couldn't classify (for diagnostics)
 *   }
 *
 * The parser is lenient by design: extra blank lines, stray commas,
 * error tokens — none of these should fail the import. Anything we
 * couldn't place is counted in `dropped` so the UI can surface it.
 */

const DEC_YEAR = /^(?:[A-Za-z]{3}[- ])?(\d{4})$/; /* "Dec-2016" or "2016" */
const ERR_TOKENS = new Set(["#N/A", "#NUM!", "#VALUE!", "#REF!", "#DIV/0!", "#NAME?", "--", "-", "—", "n/a", "N/A", ""]);

function splitRow(line) {
  /* Prefer tab if present (Excel copy), else collapse runs of 2+ spaces
     to a tab. Single spaces inside a ratio name (e.g. "Net Debt/EBITDA")
     must survive, which is why we only split on tabs or 2+ spaces. */
  if (line.indexOf("\t") >= 0) return line.split("\t").map(function (s) { return s.trim(); });
  return line.split(/ {2,}/).map(function (s) { return s.trim(); });
}

function parseValue(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || ERR_TOKENS.has(s)) return null;
  /* Parenthesized negative: (1.23) → -1.23 */
  let t = s.replace(/,/g, "");
  const parenMatch = t.match(/^\((.+)\)$/);
  if (parenMatch) t = "-" + parenMatch[1];
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}

function looksLikeYearHeader(cells) {
  /* Count cells that match the Dec-YYYY / YYYY pattern. If 3+ do,
     treat this as the year header row. The first cell is usually
     a label ("Ratio Analysis") so we skip it when counting. */
  let hits = 0;
  cells.forEach(function (c) {
    if (DEC_YEAR.test(c)) hits++;
  });
  return hits >= 3;
}

export function parseRatioPaste(text) {
  const lines = (text || "").split(/\r?\n/).map(function (l) { return l.replace(/\s+$/, ""); });

  /* 1. Find year header. */
  let yearRowIdx = -1;
  let yearCells = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (looksLikeYearHeader(cells)) {
      yearRowIdx = i;
      yearCells = cells;
      break;
    }
  }
  if (yearRowIdx < 0) {
    return { error: "Couldn't find a year header row (expected cells like Dec-2016 Dec-2017 ...)." };
  }

  /* Year columns start at whichever column index yields the first
     Dec-YYYY match — usually index 1 (index 0 is "Ratio Analysis"). */
  let yearStartCol = -1;
  const years = [];
  yearCells.forEach(function (c, idx) {
    const m = c.match(DEC_YEAR);
    if (m) {
      if (yearStartCol < 0) yearStartCol = idx;
      years.push(parseInt(m[1], 10));
    }
  });
  if (years.length === 0) {
    return { error: "Year header row had no parseable years." };
  }

  /* 2. Estimate-flag row (immediately below year header). Column i
        is an "Estimate" column if cell at yearStartCol+i says "Estimate"
        (case-insensitive). All-final is the default. */
  const estimate = years.map(function () { return false; });
  let dataStartRow = yearRowIdx + 1;
  if (yearRowIdx + 1 < lines.length) {
    const metaCells = splitRow(lines[yearRowIdx + 1]);
    const metaHasFinalOrEst = metaCells.some(function (c) {
      return /^(final|estimate)/i.test(c);
    });
    if (metaHasFinalOrEst) {
      years.forEach(function (_, i) {
        const v = metaCells[yearStartCol + i] || "";
        if (/^estimate/i.test(v)) estimate[i] = true;
      });
      dataStartRow = yearRowIdx + 2;
    }
  }

  /* 3. Walk remaining rows: classify as section header, ratio row, or
        skip. Section header = non-empty name, no numeric values in the
        year columns. Ratio row = name + at least one parsed number. */
  const sections = [];
  let currentSection = { name: "Uncategorized", items: [] };
  sections.push(currentSection);
  const ratioNames = [];
  const values = {};
  let dropped = 0;

  for (let i = dataStartRow; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const cells = splitRow(raw);
    const name = cells[0];
    if (!name) continue;

    /* Skip obvious non-data rows — the "Ratio Analysis" label row
       sometimes repeats, and empty section separators. */
    if (/^ratio analysis$/i.test(name)) continue;

    const rowValues = years.map(function (_, j) {
      return parseValue(cells[yearStartCol + j]);
    });
    const anyValue = rowValues.some(function (v) { return v !== null; });

    if (!anyValue) {
      /* Section header: any row with a name but no numeric cells. */
      currentSection = { name: name, items: [] };
      sections.push(currentSection);
      continue;
    }

    /* Ratio row */
    if (values[name]) {
      /* Duplicate ratio name (rare — e.g. paste includes two tables).
         Last one wins but count as dropped. */
      dropped++;
    }
    currentSection.items.push({ name: name, values: rowValues });
    ratioNames.push(name);
    values[name] = rowValues;
  }

  /* Drop the leading "Uncategorized" bucket if it's empty. */
  const cleanSections = sections.filter(function (s, idx) {
    return !(idx === 0 && s.name === "Uncategorized" && s.items.length === 0);
  });

  return {
    years: years,
    estimate: estimate,
    sections: cleanSections,
    ratioNames: ratioNames,
    values: values,
    dropped: dropped,
  };
}
