/* Pure functions for Dashboard → Characteristics.
 *
 * Given the per-company Rep MV breakdown for a portfolio (from
 * calcBreakdowns().byCompany) and the companies list, produce:
 *   - weighted averages of each metric across the portfolio
 *   - simple arithmetic mean + median of mktCap
 *
 * Kept pure / input-arg-only so they can be unit-tested in isolation and
 * reused without re-deriving weights inside render.
 *
 * Metric storage convention (matches MetricsTable.METRICS_COLS):
 *   company.metrics[key]        — LTM / current
 *   company.metrics[key + "1"]  — year+1 projection
 *   company.metrics[key + "2"]  — year+2 projection
 *   mktCap / intCov / ltEPS do not have +1/+2 variants and ignore `variant`.
 *
 * Percent-type metrics (FCF Yld, Div Yld, margins, returns, LT EPS,
 * payout, Net D/E) are stored as decimals — 0.072 represents 7.2%. The
 * formatter in the view multiplies by 100 at display time. This module
 * does no unit conversion; whatever's on the company is what's averaged.
 */

/* Metrics shown on the Characteristics page, in display order. Grouped by
 * category so the view can render section headers. Exported so the view
 * and tests share the same config. */
export const CHARACTERISTIC_METRICS = [
  { group: "Size",      key: "mktCap", label: "Mkt Cap", kind: "bn",    hasVariants: false },
  { group: "Valuation", key: "fpe",    label: "P/E",     kind: "x",     hasVariants: true  },
  { group: "Valuation", key: "fcfYld", label: "FCF Yld", kind: "pct",   hasVariants: true  },
  { group: "Valuation", key: "divYld", label: "Div Yld", kind: "pct",   hasVariants: true  },
  { group: "Balance",   key: "payout", label: "Payout",  kind: "pct",   hasVariants: true  },
  { group: "Balance",   key: "netDE",  label: "Net D/E", kind: "pct",   hasVariants: true  },
  { group: "Balance",   key: "intCov", label: "Int Cov", kind: "ratio", hasVariants: false },
  { group: "Growth",    key: "ltEPS",  label: "LT EPS",  kind: "pct",   hasVariants: false },
  { group: "Growth",    key: "grMgn",  label: "Gr Mgn",  kind: "pct",   hasVariants: true  },
  { group: "Growth",    key: "netMgn", label: "Net Mgn", kind: "pct",   hasVariants: true  },
  { group: "Returns",   key: "gpAss",  label: "GP/Ass",  kind: "pct",   hasVariants: true  },
  { group: "Returns",   key: "npAss",  label: "NP/Ass",  kind: "pct",   hasVariants: true  },
  { group: "Returns",   key: "opROE",  label: "Op ROE",  kind: "pct",   hasVariants: true  },
];

/* Resolve the actual metric field for a variant choice. Metrics with no
 * +1/+2 variant always return the base key regardless of `variant`. */
export function resolveField(key, variant, hasVariants) {
  if (!hasVariants) return key;
  if (variant === "1") return key + "1";
  if (variant === "2") return key + "2";
  return key; /* "0" = LTM / current */
}

/* Weighted average of metric `field` across the portfolio byCompany list.
 *
 * Weight is each company's Rep MV (c.mv). Companies with a non-finite
 * metric value are skipped — their weight is NOT redistributed explicitly
 * but because the divisor is only the sum of contributing weights the
 * average is correctly renormalized. This means "missing data does not
 * drag the average down to 0".
 *
 * Returns:
 *   {
 *     value: number | null,
 *     coverage: { used, total, weightUsed, weightTotal },
 *   }
 *
 * used / total : count of companies contributing vs. total companies in list
 * weightUsed / weightTotal : MV sums (same units — usually USD)
 */
export function weightedAvg(byCompany, companiesById, field) {
  let sumWV = 0, sumW = 0, used = 0, weightUsed = 0, weightTotal = 0;
  (byCompany || []).forEach(function (c) {
    weightTotal += c.mv || 0;
    const company = companiesById ? companiesById[c.id] : null;
    const m = company && company.metrics;
    if (!m) return;
    const raw = m[field];
    const v = (typeof raw === "number") ? raw : parseFloat(raw);
    if (!isFinite(v)) return;
    sumWV += (c.mv || 0) * v;
    sumW  += (c.mv || 0);
    weightUsed += (c.mv || 0);
    used++;
  });
  return {
    value: sumW > 0 ? sumWV / sumW : null,
    coverage: {
      used: used,
      total: (byCompany || []).length,
      weightUsed: weightUsed,
      weightTotal: weightTotal,
    },
  };
}

/* Simple arithmetic mean + median of mktCap across the portfolio.
 * Unlike weightedAvg these are unweighted — one vote per company with a
 * finite mktCap. Returns { avg, median, count }. */
export function mktCapStats(byCompany, companiesById) {
  const values = [];
  (byCompany || []).forEach(function (c) {
    const m = companiesById && companiesById[c.id] && companiesById[c.id].metrics;
    if (!m) return;
    const raw = m.mktCap;
    const v = (typeof raw === "number") ? raw : parseFloat(raw);
    if (isFinite(v)) values.push(v);
  });
  values.sort(function (a, b) { return a - b; });
  const n = values.length;
  const avg = n > 0 ? values.reduce(function (s, x) { return s + x; }, 0) / n : null;
  const median = n === 0 ? null
    : (n % 2 === 1) ? values[(n - 1) / 2]
    : (values[n / 2 - 1] + values[n / 2]) / 2;
  return { avg: avg, median: median, count: n };
}

/* Build a { [id]: company } map for fast per-id lookup in the helpers. */
export function buildCompaniesById(companies) {
  const out = {};
  (companies || []).forEach(function (c) { if (c && c.id != null) out[c.id] = c; });
  return out;
}

/* Definition of the 11 quarterly Ratios shown in the Characteristics ->
 * Ratios comparison section. Each entry knows:
 *   - key:           canonical key used both in benchmark uploads (Ratio
 *                    type) and in storage at breakdownHistory[name][date].ratios[key]
 *   - label:         display label
 *   - portMetric:    company.metrics field used for the portfolio side
 *   - aggregator:    "weighted" | "avg" | "median" — how to combine
 *                    per-holding values into a portfolio aggregate
 *   - kind:          "musd" (millions USD), "x" (multiple), "pct" (decimal x100)
 *
 * For "musd" mktCap rows, the portfolio side multiplies by 1000 because
 * company.metrics.mktCap is stored in $B; the comparison is in $M. */
/* `direction` controls the green/red coloring on the bench-cell delta:
 *   - "lower"   : lower portfolio than bench is BETTER for us (P/E, P/B,
 *                 Fwd P/E). Bench cell green when port < bench; red when
 *                 port > bench. (Standard deltaColor convention.)
 *   - "higher"  : higher portfolio than bench is BETTER for us (ROE, growth
 *                 rates, dividend yield). Bench cell green when port > bench;
 *                 red when port < bench. The view INVERTS the standard
 *                 deltaColor for these.
 *   - "neutral" : avg/median mkt cap, payout — neither direction is
 *                 strictly better, so no color is applied.
 */
/* Aggregator semantics on the portfolio side:
 *   weighted  - Rep MV-weighted average (heavy holdings dominate)
 *   avg       - simple unweighted mean
 *   median    - unweighted median
 *   max / min - largest/smallest finite value across holdings
 *   count     - number of holdings with a finite value (or all rep'd companies)
 *   null      - not computable from holdings; portfolio side falls back to
 *               an uploaded breakdownHistory[portKey].ratios value at the
 *               selected date. Used for portfolio-level metrics like
 *               Active Share that have no per-company source.
 */
export const RATIO_DEFS = [
  /* Size — uses mktCap from per-company metrics; weighted by Rep MV
     when applicable. Largest/Smallest are unweighted extremes. */
  { key: "mcWtdAvg",   label: "Mkt Cap (Wtd Avg)",     portMetric: "mktCap", aggregator: "weighted", kind: "musd", direction: "neutral" },
  { key: "avgMktCap",  label: "Average Mkt Cap",       portMetric: "mktCap", aggregator: "avg",      kind: "musd", direction: "neutral" },
  { key: "medMktCap",  label: "Median Mkt Cap",        portMetric: "mktCap", aggregator: "median",   kind: "musd", direction: "neutral" },
  { key: "mcLargest",  label: "Mkt Cap (Largest)",     portMetric: "mktCap", aggregator: "max",      kind: "musd", direction: "neutral" },
  { key: "mcSmallest", label: "Mkt Cap (Smallest)",    portMetric: "mktCap", aggregator: "min",      kind: "musd", direction: "neutral" },
  { key: "nHoldings",  label: "Number of Holdings",    portMetric: "mktCap", aggregator: "count",    kind: "int",  direction: "neutral" },
  /* Concentration — only available on the portfolio upload, not derivable
     from per-holding metrics. */
  { key: "activeShare",label: "Active Share",          portMetric: null,     aggregator: null,       kind: "pct",  direction: "neutral" },
  /* Valuation — lower is better. Fwd P/E first (forward-looking). */
  { key: "fwdPe",      label: "Fwd P/E",               portMetric: "fpe1",   aggregator: "weighted", kind: "x",    direction: "lower"   },
  { key: "pe",         label: "P/E",                   portMetric: "fpe",    aggregator: "weighted", kind: "x",    direction: "lower"   },
  { key: "peExcl",     label: "P/E (Excl. Neg.)",      portMetric: null,     aggregator: null,       kind: "x",    direction: "lower"   },
  { key: "pb",         label: "P/B",                   portMetric: "pb",     aggregator: "weighted", kind: "x",    direction: "lower"   },
  { key: "pbLtm",      label: "P/B (LTM)",             portMetric: null,     aggregator: null,       kind: "x",    direction: "lower"   },
  { key: "ps",         label: "P/S",                   portMetric: null,     aggregator: null,       kind: "x",    direction: "lower"   },
  { key: "pcf",        label: "P/CF",                  portMetric: null,     aggregator: null,       kind: "x",    direction: "lower"   },
  /* Returns — higher is better. */
  { key: "roe",        label: "ROE",                   portMetric: "roe",    aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "roe5y",      label: "ROE (5Y)",              portMetric: null,     aggregator: null,       kind: "pct",  direction: "higher"  },
  /* Growth — higher is better. */
  { key: "epsGrFwd1",  label: "EPS Growth (1Y Fwd)",   portMetric: null,     aggregator: null,       kind: "pct",  direction: "higher"  },
  { key: "epsGrFwd35", label: "EPS Growth (3-5Y Fwd)", portMetric: "ltEPS",  aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "epsGrHist3", label: "EPS Growth (3Y Hist)",  portMetric: null,     aggregator: null,       kind: "pct",  direction: "higher"  },
  { key: "adpsGr5",    label: "ADPS Growth (5Y Hist)", portMetric: "adpsGr5",aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "adpsGr1",    label: "ADPS Growth (1Y Hist)", portMetric: "adpsGr1",aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "intGr",      label: "Internal Growth Rate",  portMetric: "intGr",  aggregator: "weighted", kind: "pct",  direction: "higher"  },
  /* Yield / payout — yield higher is better; payout neutral. */
  { key: "divYld",     label: "Dividend Yield",        portMetric: "divYld", aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "payout",     label: "Payout Ratio",          portMetric: "payout", aggregator: "weighted", kind: "pct",  direction: "neutral" },
  /* Leverage — lower is better. */
  { key: "debtCap",    label: "Debt to Capital",       portMetric: null,     aggregator: null,       kind: "pct",  direction: "lower"   },
  /* Metrics-only ratios (no benchmark equivalent in the Ratio upload).
     Portfolio side computed live from holdings via the per-company
     Metrics upload. Benchmark column stays empty unless someone
     uploads matching Type=Ratio rows for these keys.
     Group order matches their CHARACTERISTIC_METRICS group so they
     cluster sensibly with the existing comparison ratios. */
  { key: "fcfYld",     label: "FCF Yield",             portMetric: "fcfYld", aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "intCov",     label: "Interest Coverage",     portMetric: "intCov", aggregator: "weighted", kind: "ratio",direction: "higher"  },
  { key: "grMgn",      label: "Gross Margin",          portMetric: "grMgn",  aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "netMgn",     label: "Net Margin",            portMetric: "netMgn", aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "gpAss",      label: "GP / Assets",           portMetric: "gpAss",  aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "npAss",      label: "NP / Assets",           portMetric: "npAss",  aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "opROE",      label: "Operating ROE",         portMetric: "opROE",  aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "netDE",      label: "Net D / E",             portMetric: "netDE",  aggregator: "weighted", kind: "pct",  direction: "lower"   },
];

/* Aggregate the portfolio side for a single ratio definition.
 *   weighted -> Rep MV-weighted average (uses weightedAvg above)
 *   avg      -> simple unweighted mean (one vote per company with a finite val)
 *   median   -> unweighted median (same)
 *
 * Returns the same shape as weightedAvg() so the caller treats both
 * aggregator types uniformly. For musd-kind ratios with mktCap source,
 * the value is multiplied by 1000 to convert from stored $B to $M.
 */
export function aggregatePortfolioRatio(byCompany, companiesById, def) {
  /* Ratios with no per-company source — Active Share, Number of Holdings'
     true upload, P/S, P/CF, etc. Caller is expected to fall back to an
     uploaded breakdownHistory[portKey].ratios value. */
  if (!def.portMetric || def.aggregator === null) {
    return { value: null, coverage: { used: 0, total: (byCompany || []).length, weightUsed: 0, weightTotal: 0 } };
  }
  if (def.aggregator === "weighted") {
    const wa = weightedAvg(byCompany, companiesById, def.portMetric);
    /* Convert stored $B to $M so portfolio matches benchmark display unit;
       fmtMUSD auto-scales M/B/T from there. */
    if (wa.value !== null && def.kind === "musd") {
      return { value: wa.value * 1000, coverage: wa.coverage };
    }
    return wa;
  }
  /* Collect finite values from each holding's metrics field. Used by every
     non-weighted aggregator below. */
  const values = [];
  let total = 0;
  (byCompany || []).forEach(function (c) {
    total++;
    const m = companiesById && companiesById[c.id] && companiesById[c.id].metrics;
    if (!m) return;
    const raw = m[def.portMetric];
    const v = (typeof raw === "number") ? raw : parseFloat(raw);
    if (isFinite(v)) values.push(v);
  });
  let value;
  if (values.length === 0) {
    value = null;
  } else if (def.aggregator === "avg") {
    value = values.reduce(function (s, x) { return s + x; }, 0) / values.length;
  } else if (def.aggregator === "max") {
    value = values.reduce(function (m, x) { return x > m ? x : m; }, values[0]);
  } else if (def.aggregator === "min") {
    value = values.reduce(function (m, x) { return x < m ? x : m; }, values[0]);
  } else if (def.aggregator === "count") {
    /* Count of holdings with a finite value for the source metric.
       Approximates "Number of Holdings" — uses mktCap availability as
       the proxy for "is this a real position". */
    value = values.length;
  } else {
    /* median */
    values.sort(function (a, b) { return a - b; });
    const n = values.length;
    value = (n % 2 === 1) ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
  }
  /* Same $B → $M conversion for non-weighted aggregators (avg/median/
     max/min). count is a unit-less integer, leave alone. */
  if (value !== null && def.kind === "musd" && def.aggregator !== "count") {
    value = value * 1000;
  }
  return {
    value: value,
    coverage: { used: values.length, total: total, weightUsed: 0, weightTotal: 0 },
  };
}

/* Look up a portfolio-side ratio value from breakdownHistory. Used as
 * a fallback when aggregatePortfolioRatio returns null because the ratio
 * has no portMetric (e.g. Active Share). */
export function uploadedPortfolioRatio(breakdownHistory, portKey, dateIso, key) {
  if (!breakdownHistory || !portKey || !dateIso) return null;
  const slot = breakdownHistory[portKey] && breakdownHistory[portKey][dateIso];
  if (!slot || !slot.ratios) return null;
  return key in slot.ratios ? slot.ratios[key] : null;
}

/* Pick the most-recent uploaded ratios snapshot for a benchmark from
 * breakdownHistory. Returns { date, ratios } or null when no history exists. */
export function latestRatiosSnapshot(breakdownHistory, benchName) {
  if (!breakdownHistory || !benchName) return null;
  const byDate = breakdownHistory[benchName];
  if (!byDate) return null;
  const dates = Object.keys(byDate).filter(function (d) {
    return byDate[d] && byDate[d].ratios && Object.keys(byDate[d].ratios).length > 0;
  }).sort();
  if (dates.length === 0) return null;
  const latest = dates[dates.length - 1];
  return { date: latest, ratios: byDate[latest].ratios };
}

/* All dates with at least one ratio uploaded for `name` (benchmark or
 * portfolio code), sorted ascending. Empty array when nothing exists. */
export function ratioDates(breakdownHistory, name) {
  if (!breakdownHistory || !name) return [];
  const byDate = breakdownHistory[name];
  if (!byDate) return [];
  return Object.keys(byDate)
    .filter(function (d) {
      return byDate[d] && byDate[d].ratios && Object.keys(byDate[d].ratios).length > 0;
    })
    .sort();
}

/* Build a 2-line history series for a single ratio key, drawing from
 * breakdownHistory for both the portfolio code (e.g. "FGL") and the
 * benchmark name (e.g. "MSCI ACWI"). Each row is { date, portfolio,
 * benchmark } where either side is null when absent. Returned ascending
 * by date — recharts plots cleanly without further sorting. */
export function ratioHistorySeries(breakdownHistory, portKey, benchName, ratioKey) {
  const portByDate = (breakdownHistory && breakdownHistory[portKey]) || {};
  const benchByDate = (breakdownHistory && breakdownHistory[benchName]) || {};
  const dateSet = new Set([
    ...Object.keys(portByDate),
    ...Object.keys(benchByDate),
  ]);
  return Array.from(dateSet).sort().map(function (d) {
    const p = portByDate[d] && portByDate[d].ratios && (ratioKey in portByDate[d].ratios)
      ? portByDate[d].ratios[ratioKey] : null;
    const b = benchByDate[d] && benchByDate[d].ratios && (ratioKey in benchByDate[d].ratios)
      ? benchByDate[d].ratios[ratioKey] : null;
    return { date: d, portfolio: p, benchmark: b };
  }).filter(function (row) { return row.portfolio !== null || row.benchmark !== null; });
}
