/* Guidance tab — shows the company's guidance history grouped by metric.
 *
 * For each metric (Sales, EBIT, etc.) we render a tile. Inside each tile,
 * one row per (period, date) — i.e. each FY's guidance evolution across
 * earnings announcements, oldest at top. Each row shows:
 *   - the issuance date
 *   - a horizontal bar spanning low%-high% Y/Y vs the prior FY's actual
 *   - a tick at the midpoint
 *   - the absolute low/high (or single point if low===high)
 *   - the price impact % from the announcement (small chip)
 *   - color-coded vs the prior row's midpoint (green = revised up, red = down, gray = unchanged)
 *
 * After all guidance rows for a closed FY (where Actual is populated),
 * a small "Closed: actual = X, beat/missed midpoint by Y%" footer.
 *
 * Y/Y baseline resolution per FY:
 *   1. Look in this metric's history for a row with period = FY-prior and
 *      a non-null Actual. (FactSet path — "ran 15 months to capture last
 *      year's actuals".)
 *   2. Fall back to the company's financials (ratios / financials line
 *      items) for the prior FY.
 *   3. Else show absolute values only with a "no Y/Y baseline" note.
 */

import { fmtMoney, fmtPct, lastFinite } from '../../utils/chart.js';
import { isFiniteNum } from '../../utils/numbers.js';

/* "2026-03-31" → "FY26". Uses the year from the period date.
 * (Some companies have non-Dec FYs where this matters: Sony's "FY26"
 * = year ending 3/31/26, calendar-year-2026.) */
function fyLabel(periodIso) {
  const m = /^(\d{4})-/.exec(periodIso || "");
  if (!m) return periodIso || "";
  const yy = m[1].slice(2);
  return "FY" + yy;
}

/* Sort priority for guidance metrics, following standard income-statement
 * order. Lower index = displayed first. Items not matched by any pattern
 * fall to the end; a secondary alphabetical sort tiebreaks within the
 * same priority (so "Sales" comes before "Sales - Consolidated"). */
const METRIC_ORDER_RX = [
  /* Income statement, top-down */
  /^sales\b/i,
  /^organic\s+growth/i,
  /^gross\s+(income|profit|margin)/i,
  /^selling.*marketing|^s_m_exp/i,
  /^selling.*(general|admin)|^sga\b/i,
  /^general.*admin|^g_a_exp/i,
  /^research.*development|^r&d|^rd_exp/i,
  /^stock\s*option/i,
  /^ebitdar\b/i,
  /^ebitda\b/i,
  /^ebita\b/i,
  /^ebit\b/i,
  /^depreciation.*amortization|^d&a\b|^depr/i,
  /^interest\s+expense/i,
  /^pretax/i,
  /^tax\s+expense/i,
  /^net\s+income/i,
  /^recurring\s+profit/i,           /* Japan-specific, sits with NI */
  /^long.?term\s+growth|^eps_ltg/i,
  /^earning?s\s+per\s+share|^eps\b/i,
  /^dividends?\s+per\s+share|^dps\b/i,
  /^free\s+cash\s+flow\s+per\s+share|^fcfps\b/i,
  /^free\s+cash\s+flow|^fcf\b/i,
  /^cash\s+flow.*operations?/i,
  /^cash\s+flow.*investing/i,
  /^cash\s+flow.*financing/i,
  /^maintenance\s+cap/i,
  /^capital\s+expenditures?|^capex\b/i,
  /* Balance sheet / per-share book metrics */
  /^net\s+assets?\s+value\s+per\s+share|^navps\b/i,
  /^book\s+value\s+per\s+share.*tangible|^bps_tang\b/i,
  /^book\s+value\s+per\s+share|^bps\b/i,
  /^current\s+assets/i,
  /^total\s+assets/i,
  /^current\s+liabilit/i,
  /^total\s+liabilit/i,
  /^shareholders.*equity/i,
  /^total\s+debt/i,
  /^net\s+debt|^ndt\b/i,
  /^goodwill/i,
  /^target\s+price|^price.?tgt/i,
];
function metricOrder(name) {
  for (let i = 0; i < METRIC_ORDER_RX.length; i++) {
    if (METRIC_ORDER_RX[i].test(name)) return i;
  }
  return METRIC_ORDER_RX.length;
}

/* Stale-FY filter: drop fiscal periods whose end date is more than 6
 * months in the past — those FYs are closed long enough that their
 * guidance evolution isn't actionable. The just-closed FY (within 6
 * months) stays so we can see how the final guidance landed. */
const STALE_FY_THRESHOLD_DAYS = 180;
function isStalePeriod(periodIso) {
  if (!periodIso) return true;
  const p = new Date(periodIso + "T00:00:00").getTime();
  if (isNaN(p)) return true;
  const cutoff = Date.now() - STALE_FY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  return p < cutoff;
}

/* "2025-02-14" → "Feb '25". */
function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-/.exec(iso || "");
  if (!m) return iso || "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[parseInt(m[2],10)-1] + " '" + m[1].slice(2);
}

/* Subtract one fiscal year from an ISO period. "2026-03-31" → "2025-03-31". */
function priorFyEnd(periodIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodIso || "");
  if (!m) return null;
  return (parseInt(m[1],10) - 1) + "-" + m[2] + "-" + m[3];
}

/* Currency for display labels — use the ord ticker's currency, fall back
 * to the company-level valuation currency. Returns "" if unknown. */
function getCurrencyForCompany(c) {
  const t = (c && c.tickers || []).find(function (t) { return t.isOrdinary; });
  if (t && t.currency) return t.currency.toUpperCase();
  if (c && c.valuation && c.valuation.currency) return c.valuation.currency.toUpperCase();
  return "";
}

/* Pull the prior-FY actual for `metric` from this company's financials.
 * Looks in c.financials.values (line items) using a case-insensitive name
 * match. Returns the value at the most recent historical (non-estimate)
 * year, or null. */
function lookupFinancialsActual(c, metric) {
  if (!c || !c.financials || !c.financials.values) return null;
  const values = c.financials.values;
  const estimate = c.financials.estimate || [];
  const wanted = metric.trim().toLowerCase();
  let series = null;
  Object.keys(values).forEach(function (k) {
    if (series) return;
    if (k.trim().toLowerCase() === wanted) series = values[k];
  });
  if (!series) return null;
  /* Walk backwards from most recent, skipping forward estimates. */
  for (let i = series.length - 1; i >= 0; i--) {
    if (estimate[i]) continue;
    if (isFiniteNum(series[i])) return series[i];
  }
  return lastFinite(series);
}

/* Find the prior-FY actual for one metric/period combo. Returns
 * { value, source } or { value: null, source: null } if unknown. */
function resolveYoyBaseline(historyForMetric, period, company, metric) {
  const priorPeriod = priorFyEnd(period);
  if (priorPeriod) {
    const hit = historyForMetric.find(function (r) { return r.period === priorPeriod && isFiniteNum(r.actual); });
    if (hit) return { value: hit.actual, source: "FactSet actual" };
  }
  const fin = lookupFinancialsActual(company, metric);
  if (isFiniteNum(fin)) return { value: fin, source: "Financials" };
  return { value: null, source: null };
}

/* Compute Y/Y % vs baseline. base must be > 0. */
function yoy(value, base) {
  if (!isFiniteNum(value) || !isFiniteNum(base) || base <= 0) return null;
  return value / base - 1;
}

/* Column sort: newer date last. */
function byDateAsc(a, b) { return (a.date || "").localeCompare(b.date || ""); }

/* ============================ Bar primitive ============================ */

/* Renders a horizontal range bar (low%-high% Y/Y) with a midpoint tick.
 * lowPct / highPct are decimals (e.g. -0.05 for -5%). globalMin/Max set
 * the visible range so all bars in a tile share the same axis. */
function RangeBar({ lowPct, highPct, midPct, globalMin, globalMax, color }) {
  const span = globalMax - globalMin;
  if (!(span > 0)) return null;
  const lp = Math.max(0, Math.min(100, ((lowPct  - globalMin) / span) * 100));
  const hp = Math.max(0, Math.min(100, ((highPct - globalMin) / span) * 100));
  const mp = Math.max(0, Math.min(100, ((midPct  - globalMin) / span) * 100));
  const w = Math.max(1, hp - lp); /* min visible width so point estimates don't disappear */
  const c = color || "#3b82f6";
  return (
    <div className="relative h-4 bg-slate-100 dark:bg-slate-800 rounded">
      {/* zero line — always rendered when the axis crosses zero */}
      {globalMin < 0 && globalMax > 0 && (
        <div className="absolute top-0 bottom-0" style={{ left: ((0 - globalMin) / span) * 100 + "%", width: 1, background: "rgba(100,116,139,0.55)" }}/>
      )}
      <div className="absolute top-[3px] bottom-[3px] rounded-sm opacity-85" style={{ left: lp + "%", width: w + "%", background: c }}/>
      <div className="absolute top-[-1px] bottom-[-1px] w-[2.5px] rounded-sm" style={{ left: mp + "%", background: c, transform: "translateX(-1px)" }}/>
    </div>
  );
}

/* Tiny per-FY axis ticks rendered above the first row of bars. Marks
 * min, 0 (if visible), and max as small label strings. */
function AxisTicks({ axisMin, axisMax }) {
  const span = axisMax - axisMin;
  if (!(span > 0)) return null;
  const ticks = [{ v: axisMin }, { v: axisMax }];
  if (axisMin < 0 && axisMax > 0) ticks.push({ v: 0 });
  ticks.sort(function (a, b) { return a.v - b.v; });
  return (
    <div className="relative h-3 mb-0.5 text-[9px] text-gray-400 dark:text-slate-500">
      {ticks.map(function (t) {
        const pct = ((t.v - axisMin) / span) * 100;
        const align = pct < 5 ? "left" : pct > 95 ? "right" : "center";
        return (
          <span key={t.v} className="absolute tabular-nums" style={{ left: pct + "%", transform: align === "right" ? "translateX(-100%)" : align === "center" ? "translateX(-50%)" : "none" }}>
            {fmtPct(t.v, 0, true)}
          </span>
        );
      })}
    </div>
  );
}

/* ============================ Tile ============================ */

function MetricTile({ company, metric, rowsByMetric, currency }) {
  const rows = rowsByMetric[metric] || [];
  if (rows.length === 0) return null;

  /* Group by period (FY end). Each group sorted oldest-first by date.
     Closed FYs older than the stale threshold are dropped — closed
     actuals are still used as Y/Y baselines for newer FYs (resolveYoyBaseline
     reads from the full history regardless), but their tile rows would
     be visual clutter. */
  const byPeriod = {};
  rows.forEach(function (r) { (byPeriod[r.period] = byPeriod[r.period] || []).push(r); });
  const periods = Object.keys(byPeriod).filter(function (p) { return !isStalePeriod(p); }).sort();
  if (periods.length === 0) return null;
  periods.forEach(function (p) { byPeriod[p].sort(byDateAsc); });

  const today = new Date().toISOString().slice(0, 10);

  /* Pre-compute Y/Y + per-FY axis range. Each FY scales locally so a
     wide-range FY doesn't squash a tight-range FY (and vice-versa). */
  const decorated = periods.map(function (period) {
    const rs = byPeriod[period];
    const baseline = resolveYoyBaseline(rows, period, company, metric);
    const items = rs.map(function (r) {
      const lowYoy  = yoy(r.low,  baseline.value);
      const highYoy = yoy(r.high, baseline.value);
      const midYoy  = (isFiniteNum(lowYoy) && isFiniteNum(highYoy))
        ? (lowYoy + highYoy) / 2
        : (lowYoy != null ? lowYoy : highYoy);
      return { row: r, lowYoy: lowYoy, highYoy: highYoy, midYoy: midYoy };
    });
    /* Trailing actual + final-guidance midpoint, for closed FYs. */
    const closedRow = rs.find(function (r) { return isFiniteNum(r.actual); });
    const lastGuidance = rs.slice().reverse().find(function (r) { return isFiniteNum(r.low) || isFiniteNum(r.high); });
    let closedSummary = null;
    if (closedRow && lastGuidance && period < today && isFiniteNum(closedRow.actual)) {
      const lowG = isFiniteNum(lastGuidance.low) ? lastGuidance.low : lastGuidance.high;
      const highG = isFiniteNum(lastGuidance.high) ? lastGuidance.high : lastGuidance.low;
      const midG = (lowG + highG) / 2;
      const beat = midG > 0 ? (closedRow.actual / midG - 1) : null;
      closedSummary = { actual: closedRow.actual, beat: beat };
    }
    /* Per-FY axis range with padding and zero pinned visible. */
    let lMin = Infinity, lMax = -Infinity;
    items.forEach(function (it) {
      [it.lowYoy, it.highYoy].forEach(function (v) {
        if (isFiniteNum(v)) { if (v < lMin) lMin = v; if (v > lMax) lMax = v; }
      });
    });
    const localHasYoy = isFinite(lMin) && isFinite(lMax);
    if (localHasYoy) {
      const pad = Math.max(0.02, (lMax - lMin) * 0.15);
      lMin = Math.min(lMin, 0) - pad;
      lMax = Math.max(lMax, 0) + pad;
    }
    return { period: period, baseline: baseline, items: items, closedSummary: closedSummary, hasYoy: localHasYoy, axisMin: lMin, axisMax: lMax };
  });

  /* Tile-level "any FY has Y/Y" flag for the subtitle. */
  const tileHasYoy = decorated.some(function (g) { return g.hasYoy; });

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 mb-3">
      <div className="flex justify-between items-baseline mb-2">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{metric}</div>
        <div className="text-[11px] text-gray-500 dark:text-slate-400">
          {tileHasYoy ? "Y/Y vs prior FY actual" : "absolute values only — no Y/Y baseline"}
        </div>
      </div>
      {decorated.map(function (g) {
        return (
          <div key={g.period} className="mb-3 last:mb-0">
            <div className="flex justify-between items-center mb-1">
              <div className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">{fyLabel(g.period)} <span className="text-gray-400 dark:text-slate-500 font-normal">(period {g.period})</span></div>
              {g.baseline.value != null && (
                <div className="text-[10px] text-gray-400 dark:text-slate-500">baseline: {fmtMoney(g.baseline.value, currency)} <span className="italic">({g.baseline.source})</span></div>
              )}
            </div>
            {g.hasYoy && (
              <div className="grid grid-cols-[88px_1fr_220px_60px] gap-2 mb-0.5">
                <div/>
                <AxisTicks axisMin={g.axisMin} axisMax={g.axisMax}/>
                <div/>
                <div/>
              </div>
            )}
            <div className="grid grid-cols-[88px_1fr_220px_60px] gap-2 items-center text-[11px]">
              {g.items.map(function (it, idx) {
                const r = it.row;
                const prevMid = idx > 0 ? g.items[idx-1].midYoy : null;
                let color = "#94a3b8"; /* gray (no prior to compare) */
                if (prevMid != null && isFiniteNum(it.midYoy)) {
                  if (it.midYoy > prevMid + 0.001) color = "#16a34a"; /* up — green */
                  else if (it.midYoy < prevMid - 0.001) color = "#dc2626"; /* down — red */
                }
                const lowAbs  = isFiniteNum(r.low)  ? fmtMoney(r.low,  currency) : "";
                const highAbs = isFiniteNum(r.high) ? fmtMoney(r.high, currency) : "";
                const showRange = (r.low !== r.high) && lowAbs && highAbs;
                return (
                  <div key={r.date + ":" + idx} className="contents">
                    <div className="text-gray-700 dark:text-slate-300 tabular-nums">{dateLabel(r.date)}</div>
                    <div className="min-w-0">
                      {g.hasYoy ? <RangeBar lowPct={it.lowYoy} highPct={it.highYoy} midPct={it.midYoy} globalMin={g.axisMin} globalMax={g.axisMax} color={color}/> : <div className="h-3 bg-slate-50 dark:bg-slate-800 rounded-sm"/>}
                    </div>
                    <div className="text-gray-500 dark:text-slate-400 tabular-nums text-[10px] truncate">
                      {g.hasYoy && isFiniteNum(it.midYoy) && (
                        <span className="font-semibold text-gray-700 dark:text-slate-200">{fmtPct(it.midYoy, 1, true)}</span>
                      )}
                      {g.hasYoy && (r.low !== r.high) && isFiniteNum(it.lowYoy) && isFiniteNum(it.highYoy) && (
                        <span> [{fmtPct(it.lowYoy, 1, true)} … {fmtPct(it.highYoy, 1, true)}]</span>
                      )}
                      <span className="text-gray-400 dark:text-slate-500"> {showRange ? lowAbs + " – " + highAbs : lowAbs || highAbs}</span>
                    </div>
                    <div className="text-right">
                      {isFiniteNum(r.priceImpact) && (
                        <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-semibold " + (r.priceImpact >= 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
                          {fmtPct(r.priceImpact, 1, true)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {g.closedSummary && (
              <div className="mt-1 text-[10px] text-gray-500 dark:text-slate-400 italic">
                Closed: actual {fmtMoney(g.closedSummary.actual, currency)}
                {g.closedSummary.beat != null && (
                  <span> — {g.closedSummary.beat >= 0 ? "beat" : "missed"} final mid-guidance by {fmtPct(Math.abs(g.closedSummary.beat), 1, false)}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================ Tab root ============================ */

export default function GuidanceTab({ company }) {
  const guidance = company && company.guidance;
  const history = (guidance && guidance.history) || [];

  if (history.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-slate-400 italic py-8 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
        No guidance imported yet. Upload a FactSet "Guidance History" block from Data Hub → Guidance.
      </div>
    );
  }

  /* Group rows by item — one tile per metric. Metrics are sorted in
     income-statement order (Sales → Gross → SG&A/R&D → EBITDA → EBIT →
     Net Income → EPS → DPS → CFO/FCF → CapEx → BS items) so the tab
     reads top-down like a P&L. Anything not in the IS-order regex list
     falls to the bottom, alphabetical. */
  const rowsByMetric = {};
  history.forEach(function (r) {
    (rowsByMetric[r.item] = rowsByMetric[r.item] || []).push(r);
  });
  const metrics = Object.keys(rowsByMetric).sort(function (a, b) {
    const oa = metricOrder(a), ob = metricOrder(b);
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });

  const currency = getCurrencyForCompany(company);
  const stamp = guidance.updatedAt ? new Date(guidance.updatedAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="text-xs text-gray-500 dark:text-slate-400">
          {history.length} rows · {metrics.length} metrics · {Array.from(new Set(history.map(function (r) { return r.period; }))).length} fiscal periods
          {currency && <span className="ml-1">· values in {currency}</span>}
        </div>
        <div className="text-[11px] text-gray-400 dark:text-slate-500">
          {guidance.updatedBy ? "Last imported by " + guidance.updatedBy : "Last imported"} · {stamp}
        </div>
      </div>
      {metrics.map(function (m) {
        return <MetricTile key={m} company={company} metric={m} rowsByMetric={rowsByMetric} currency={currency}/>;
      })}
    </div>
  );
}
