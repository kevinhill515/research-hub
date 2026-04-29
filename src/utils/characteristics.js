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
export const RATIO_DEFS = [
  { key: "avgMktCap", label: "Average Mkt Cap",        portMetric: "mktCap", aggregator: "avg",      kind: "musd", direction: "neutral" },
  { key: "medMktCap", label: "Median Mkt Cap",         portMetric: "mktCap", aggregator: "median",   kind: "musd", direction: "neutral" },
  /* Fwd P/E above P/E by request — easier to read forward-looking first. */
  { key: "fwdPe",     label: "Fwd P/E",                portMetric: "fpe1",   aggregator: "weighted", kind: "x",    direction: "lower"   },
  { key: "pe",        label: "P/E",                    portMetric: "fpe",    aggregator: "weighted", kind: "x",    direction: "lower"   },
  { key: "pb",        label: "P/B",                    portMetric: "pb",     aggregator: "weighted", kind: "x",    direction: "lower"   },
  { key: "roe",       label: "ROE",                    portMetric: "roe",    aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "intGr",     label: "Internal Growth Rate",   portMetric: "intGr",  aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "adpsGr5",   label: "ADPS Growth (5Y)",       portMetric: "adpsGr5",aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "adpsGr1",   label: "ADPS Growth (1Y)",       portMetric: "adpsGr1",aggregator: "weighted", kind: "pct",  direction: "higher"  },
  { key: "payout",    label: "Payout Ratio",           portMetric: "payout", aggregator: "weighted", kind: "pct",  direction: "neutral" },
  { key: "divYld",    label: "Dividend Yield",         portMetric: "divYld", aggregator: "weighted", kind: "pct",  direction: "higher"  },
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
  if (def.aggregator === "weighted") {
    const wa = weightedAvg(byCompany, companiesById, def.portMetric);
    return wa;
  }
  /* avg / median — unweighted simple stats. */
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
  } else {
    /* median */
    values.sort(function (a, b) { return a - b; });
    const n = values.length;
    value = (n % 2 === 1) ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
  }
  /* No unit adjustment: portfolio mktCap and benchmark mktCap are
     uploaded in compatible units already. */
  return {
    value: value,
    coverage: { used: values.length, total: total, weightUsed: 0, weightTotal: 0 },
  };
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
