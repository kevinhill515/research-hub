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
