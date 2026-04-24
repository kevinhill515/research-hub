/* Small chart + math helpers used by CompanyDashboard's four overview
 * tiles. Kept as plain .js (no JSX) so the data-shaping is testable in
 * isolation. Rendering primitives are JSX-only and live in
 * overviewChartElements.jsx.
 *
 * Data source shapes (from ratioParser output, stored on the company):
 *   company.financials.values[name]  — array aligned with .years / .estimate
 *   company.ratios.values[name]      — same
 */

/* Pull a named series from either company.financials or company.ratios,
 * preferring financials when both are populated. Returns:
 *   { values, years, estimate, source } | null
 */
export function pickSeries(company, name, preferredKind) {
  const kinds = preferredKind === "ratios"
    ? ["ratios", "financials"]
    : ["financials", "ratios"];
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const d = company && company[kind];
    if (!d || !d.values || !d.years) continue;
    const vals = d.values[name];
    if (vals && vals.length === d.years.length) {
      return { values: vals, years: d.years, estimate: d.estimate, source: kind };
    }
  }
  return null;
}

/* YoY growth rates from a values array. Returns an array of the same
 * length with null at index 0 (nothing to compare to). */
export function yoyGrowth(values) {
  const out = new Array(values.length);
  out[0] = null;
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1], b = values[i];
    if (a === null || a === undefined || !isFinite(a) || a === 0 ||
        b === null || b === undefined || !isFinite(b)) {
      out[i] = null;
    } else {
      out[i] = (b - a) / Math.abs(a);
    }
  }
  return out;
}

/* Compound annual growth rate between first and last finite values in a
 * series. Returns a decimal (0.08 = 8%) or null. */
export function cagr(values) {
  let first = null, firstIdx = -1, last = null, lastIdx = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined && isFinite(v) && v > 0) {
      if (first === null) { first = v; firstIdx = i; }
      last = v; lastIdx = i;
    }
  }
  if (first === null || last === null || firstIdx === lastIdx || first <= 0) return null;
  const years = lastIdx - firstIdx;
  return Math.pow(last / first, 1 / years) - 1;
}

/* Split an aligned values/estimate pair into (historical, forward) parts
 * so a chart can render them in different colors without blending. */
export function splitByEstimate(values, estimate) {
  const hist = values.map(function (v, i) { return estimate[i] ? null : v; });
  const est  = values.map(function (v, i) { return estimate[i] ? v    : null; });
  return { hist: hist, est: est };
}

/* min/max across one or more arrays, skipping nulls. Falls back to
 * [0, 1] if no finite values exist. */
export function minMaxAcross(arrays) {
  let mn = Infinity, mx = -Infinity;
  arrays.forEach(function (arr) {
    arr.forEach(function (v) {
      if (v === null || v === undefined || !isFinite(v)) return;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    });
  });
  if (!isFinite(mn) || !isFinite(mx)) return [0, 1];
  if (mn === mx) { mn -= 0.5; mx += 0.5; }
  return [mn, mx];
}

/* Format a decimal as a percent string with sign. */
export function fmtPct(v, dp) {
  if (v === null || v === undefined || !isFinite(v)) return "--";
  const d = dp == null ? 1 : dp;
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(d) + "%";
}
