/* Dashboard → Characteristics.
 *
 * For the selected portfolio (or All), show:
 *   - Weighted-avg mkt cap tile
 *   - Simple-avg and median mkt cap tiles
 *   - Grouped table of weighted-average metrics (P/E, FCF Yld, ...) with
 *     a +1 / 0 / +2 variant toggle (default +1)
 *   - Core/Value benchmark comparison column where benchmark metric data
 *     has been uploaded (Data Hub → Benchmarks, Type = Metric)
 *
 * Math is in utils/characteristics.js; this component is wiring + render.
 */

import { useMemo, useState, useEffect } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { BENCHMARKS, PORTFOLIOS } from '../../constants/index.js';
import { calcBreakdowns } from '../../utils/portfolioMath.js';
import {
  buildCompaniesById,
  RATIO_DEFS, aggregatePortfolioRatio, latestRatiosSnapshot, ratioDates,
  uploadedPortfolioRatio,
} from '../../utils/characteristics.js';
import RatioHistoryChart from './RatioHistoryChart.jsx';

const TABST_ACTIVE   = "text-[13px] px-3 py-1.5 border-b-2 border-blue-600 text-gray-900 dark:text-slate-100 font-semibold cursor-pointer bg-transparent";
const TABST_INACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-transparent text-gray-500 dark:text-slate-400 cursor-pointer bg-transparent hover:text-gray-700 dark:hover:text-slate-300";
const CARD = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2";

/* Auto-scale dollars stored in millions to the most readable unit.
 *   < 1,000    → "$nnnM"          (under $1B, show in M)
 *   < 1,000,000 → "$n.nB"          ($1B–$999B)
 *   ≥ 1,000,000 → "$n.nT"          ($1T+)
 * Used by both Characteristics and the inline ratio history chart so
 * a $1.2T cap doesn't display as "$1,200,000M". */
export /* Compact "Q1 '26"-style label for an ISO YYYY-MM-DD date — used by
   the per-row source badge to show which quarter a Q-end value came
   from. */
function quarterShort(iso) {
  if (!iso || iso.length < 10) return "Q?";
  const y = iso.slice(2, 4);
  const m = parseInt(iso.slice(5, 7), 10);
  const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
  return "Q" + q + " '" + y;
}

function fmtMUSD(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "T";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "B";
  return sign + "$" + Math.round(abs).toLocaleString() + "M";
}

function fmtMetric(v, kind) {
  if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return "--";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n)) return "--";
  switch (kind) {
    case "bn":    return "$" + n.toFixed(1) + "B";
    case "musd":  return fmtMUSD(n);
    /* int = whole-number count (Number of Holdings, etc.) */
    case "int":   return Math.round(n).toLocaleString();
    case "x":     return n.toFixed(1) + "x";
    case "pct":   return (n * 100).toFixed(1) + "%";
    case "ratio": return n.toFixed(1);
    default:      return String(v);
  }
}

/* Raw-value delta (portfolio - benchmark), formatted in the metric's
 * native units with a sign. Returns null when either side is missing. */
function fmtDelta(port, bench, kind) {
  if (port === null || port === undefined || bench === null || bench === undefined) return null;
  const d = port - bench;
  if (!isFinite(d)) return null;
  const sign = d >= 0 ? "+" : "";
  switch (kind) {
    case "bn":    return sign + d.toFixed(1) + "B";
    case "musd":  return sign + Math.round(d).toLocaleString() + "M";
    case "int":   return sign + Math.round(d).toLocaleString();
    case "x":     return sign + d.toFixed(1) + "x";
    case "pct":   return sign + (d * 100).toFixed(1) + "pp";
    case "ratio": return sign + d.toFixed(1);
    default:      return sign + String(d);
  }
}

/* Sign-only color: any positive delta → green, any negative → red.
 * No gray band — even small differences get colored, since the user
 * was seeing legitimate but small diffs (e.g. div yield 2.0 vs 2.1)
 * fall into a gray no-man's-land. */
function signColor(d) {
  if (!isFinite(d)) return undefined;
  if (d > 0) return "#166534"; /* green */
  if (d < 0) return "#dc2626"; /* red */
  return undefined; /* exactly equal — leave default */
}

/* Metric keys where LOWER is better (cheaper). For these the bench cell
 * coloring inverts: green when bench < port (bench is cheaper). All
 * other metrics use higher-is-better coloring (green when bench > port). */
const LOWER_IS_BETTER_METRICS = new Set([
  "fpe",  "fpe1",  "fpe2",   /* P/E */
  "pb",   "pb1",   "pb2",    /* P/B */
  "netDE","netDE1","netDE2", /* Net D/E (less leverage = better) */
]);

/* Bench-cell color for the Metrics table.
 * Default: GREEN when bench > port (bench is "above" portfolio).
 * For lower-is-better metrics: GREEN when bench < port (bench is cheaper). */
function deltaColor(port, bench, kind, key) {
  if (port === null || port === undefined || bench === null || bench === undefined) return undefined;
  const flip = LOWER_IS_BETTER_METRICS.has(key);
  const d = flip ? (port - bench) : (bench - port);
  return signColor(d);
}

/* Bench-cell color for one Ratios row.
 *   - neutral : no color.
 *   - lower   : green when bench < port (bench is cheaper) — applies to
 *               P/E, P/B, Fwd P/E.
 *   - higher  : green when bench > port (bench is ahead on the metric's
 *               positive direction) — ROE, growth rates, div yield.
 */
function ratioBenchColor(port, bench, kind, direction) {
  if (direction === "neutral") return undefined;
  if (port === null || port === undefined || bench === null || bench === undefined) return undefined;
  const d = direction === "lower" ? (port - bench) : (bench - port);
  return signColor(d);
}

export default function CharacteristicsView() {
  const { companies, repData, fxRates, benchmarkWeights, breakdownHistory } = useCompanyContext();
  const [portKey, setPortKey] = useState(PORTFOLIOS[0] || "GL");
  /* Ratios — selected date for the benchmark "as of" snapshot, and the
     set of expanded rows showing inline history charts (multi-open like
     the Companies → Financials tab). */
  const [ratioDate, setRatioDate] = useState(null);
  const [openRatios, setOpenRatios] = useState(function () { return new Set(); });
  function toggleRatio(key) {
    setOpenRatios(function (prev) {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const availablePorts = useMemo(function () {
    return PORTFOLIOS.filter(function (p) {
      const pRep = (repData || {})[p] || {};
      return Object.keys(pRep).length > 0;
    });
  }, [repData]);

  const breakdown = useMemo(function () {
    return calcBreakdowns(companies, repData, fxRates, portKey);
  }, [companies, repData, fxRates, portKey]);

  const companiesById = useMemo(function () {
    return buildCompaniesById(companies);
  }, [companies]);

  /* Both Core and Value benchmarks are shown side-by-side rather than
     toggled. Each has its own metric snapshot (current) and ratio
     history. The Has-* flags drive whether each column renders so an
     empty side simply collapses out.

     Metrics resolve in this order:
       1. benchmarkWeights[name].metrics — the legacy 4-col current
          snapshot upload.
       2. breakdownHistory[name][latestDate].metrics — when the user
          uploads via the dated 5-col format with Type=Metric.
     #2 fallback was the missing piece — uploads in the dated format
     populated breakdownHistory but not benchmarkWeights, so this
     panel showed blank "--" cells everywhere. */
  const coreBench  = (BENCHMARKS[portKey] || {}).core  || null;
  const valueBench = (BENCHMARKS[portKey] || {}).value || null;
  const coreData   = coreBench  && benchmarkWeights ? benchmarkWeights[coreBench]  : null;
  const valueData  = valueBench && benchmarkWeights ? benchmarkWeights[valueBench] : null;
  function latestMetrics(name) {
    if (!name || !breakdownHistory || !breakdownHistory[name]) return null;
    const byDate = breakdownHistory[name];
    const dates = Object.keys(byDate)
      .filter(function (d) { return byDate[d] && byDate[d].metrics && Object.keys(byDate[d].metrics).length > 0; })
      .sort();
    if (dates.length === 0) return null;
    return byDate[dates[dates.length - 1]].metrics;
  }
  /* coreMetrics / valueMetrics are no longer used since the standalone
     Metrics panel was merged into Ratios. The latestMetrics helper
     is left in case we need it again (it's harmless dead code). */

  /* The previous Metrics-panel-specific rollups (metricRows /
     augmentedMetricRows / grouped) were removed when the panel was
     merged into Ratios. Avg/Median Mkt Cap are now handled directly
     by RATIO_DEFS via aggregator: "avg" / "median" on mktCap. */

  /* Ratios section. Pulls Core AND Value benchmark snapshots from
     breakdownHistory[*] (Type=Ratio quarterly history) and pairs each
     with the portfolio aggregate from current holdings. The user picks a
     single "as of" date via the dropdown; both benchmarks are looked up
     at that date (so an alignment mismatch shows as an empty cell). */
  const allBenchDates = useMemo(function () {
    /* Union of dates available for either benchmark, sorted ascending. */
    const set = new Set([
      ...ratioDates(breakdownHistory, coreBench),
      ...ratioDates(breakdownHistory, valueBench),
    ]);
    return Array.from(set).sort();
  }, [breakdownHistory, coreBench, valueBench]);
  /* Auto-select the latest date when no explicit selection or when the
     selection doesn't exist for the current portfolio's benchmarks. */
  useEffect(function () {
    if (allBenchDates.length === 0) {
      if (ratioDate !== null) setRatioDate(null);
      return;
    }
    const latest = allBenchDates[allBenchDates.length - 1];
    if (!ratioDate || allBenchDates.indexOf(ratioDate) === -1) {
      setRatioDate(latest);
    }
  }, [allBenchDates, ratioDate]);
  const coreRatios  = useMemo(function () {
    if (!coreBench || !ratioDate) return null;
    const slot = breakdownHistory && breakdownHistory[coreBench] && breakdownHistory[coreBench][ratioDate];
    return (slot && slot.ratios) || null;
  }, [breakdownHistory, coreBench, ratioDate]);
  const valueRatios = useMemo(function () {
    if (!valueBench || !ratioDate) return null;
    const slot = breakdownHistory && breakdownHistory[valueBench] && breakdownHistory[valueBench][ratioDate];
    return (slot && slot.ratios) || null;
  }, [breakdownHistory, valueBench, ratioDate]);
  const hasCoreRatios  = !!(coreRatios  && Object.keys(coreRatios).length  > 0);
  const hasValueRatios = !!(valueRatios && Object.keys(valueRatios).length > 0);
  const hasRatios = hasCoreRatios || hasValueRatios;
  const ratioRows = useMemo(function () {
    return RATIO_DEFS.map(function (def) {
      let port = aggregatePortfolioRatio(breakdown.byCompany, companiesById, def);
      /* `source` tags the portfolio value's origin so the row can show
         a "live" or "Q-end" badge. live = rolled up from current holdings
         via the Metrics upload; quarter = uploaded portfolio snapshot at
         the selected date.

         Resolution order:
           1. Live computation if the def has a portMetric AND we got a
              real value from holdings. Most ratios fall here.
           2. Uploaded portfolio history at the selected date as fallback
              when live failed (no per-holding metric for this ratio
              — e.g. Active Share, P/S, P/CF). */
      let source = "live";
      if (port.value === null) {
        const uploaded = uploadedPortfolioRatio(breakdownHistory, portKey, ratioDate, def.key);
        if (uploaded !== null && uploaded !== undefined) {
          port = { value: uploaded, coverage: { used: 1, total: 1, weightUsed: 0, weightTotal: 0 } };
          source = "quarter";
        } else {
          source = "none";
        }
      }
      const cv = coreRatios  && (def.key in coreRatios)  ? coreRatios[def.key]  : null;
      const vv = valueRatios && (def.key in valueRatios) ? valueRatios[def.key] : null;
      return {
        key: def.key,
        label: def.label,
        kind: def.kind,
        direction: def.direction,
        portfolio: port.value,
        coverage: port.coverage,
        core: cv,
        value: vv,
        source: source,
      };
    });
  }, [breakdown, companiesById, coreRatios, valueRatios, breakdownHistory, portKey, ratioDate]);

  const empty = breakdown.byCompany.length === 0;

  return (
    <div>
      {/* Portfolio tabs */}
      <div className="flex gap-1 mb-3 border-b border-slate-200 dark:border-slate-700 pb-2 flex-wrap">
        {(availablePorts.length > 0 ? availablePorts : PORTFOLIOS).map(function (p) {
          return (
            <button
              key={p}
              type="button"
              onClick={function () { setPortKey(p); }}
              className={portKey === p ? TABST_ACTIVE : TABST_INACTIVE}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* Header row: AUM + benchmarks shown. Core/Value toggle and
          LTM/+1/+2 horizon toggle are both gone — every variant renders
          as its own row so all values are visible at once. */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="text-sm text-gray-700 dark:text-slate-300">
          <span className="font-semibold">{portKey}</span>
          {breakdown.totalMV > 0 && (
            <span className="text-xs text-gray-500 dark:text-slate-400 ml-2">
              Rep AUM: ${breakdown.totalMV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          )}
          <span className="text-[10px] text-gray-400 dark:text-slate-500 italic ml-2">
            Core: {coreBench || "—"} · Value: {valueBench || "—"}
          </span>
        </div>
      </div>

      {empty && (
        <div className="text-sm text-gray-500 dark:text-slate-400 italic py-4">
          No rep holdings for this portfolio yet.
        </div>
      )}

      {!empty && (
        <>
          {/* Single full-width Ratios table. Replaces the old Ratios+Metrics
              two-column layout, since most metrics had benchmark counterparts
              in the Ratios upload anyway and the two panels disagreed in
              confusing ways (one rolled up live, the other was quarter-end).
              Now: every row in one table, with a per-row "live" / quarter-
              date badge so the user can see where the portfolio side came
              from at a glance. Metrics-only rows (FCF Yld, Int Cov,
              Margins, GP/NP per asset, Op ROE, Net D/E) appear with
              their live portfolio value and "--" benchmark cells. */}
          <div>
            {/* Ratios — quarterly-history comparison. The benchmark column
                reads the date-selected snapshot from breakdownHistory[benchName]
                .ratios (Type=Ratio quarterly history). The portfolio column
                is freshly computed from current holdings using the aggregator
                specified in RATIO_DEFS (weighted/avg/median). Click a row to
                expand an inline history chart underneath. */}
            <div>
              <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold">
                  Ratios
                </div>
                {allBenchDates.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-slate-400">
                    <span>as of</span>
                    <select
                      value={ratioDate || ""}
                      onChange={function (e) { setRatioDate(e.target.value); }}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300"
                      title={"All quarters with benchmark ratio data for either Core (" + (coreBench || "—") + ") or Value (" + (valueBench || "—") + "). Currently " + allBenchDates.length + " uploaded."}
                    >
                      {allBenchDates.slice().reverse().map(function (d) {
                        return <option key={d} value={d}>{d}</option>;
                      })}
                    </select>
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="grid gap-1 px-2 py-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 grid-cols-[1fr_90px_90px_90px]">
                  <div>Metric</div>
                  <div className="text-right">Port.</div>
                  <div className="text-right" title={coreBench  || "Core benchmark"}>Core</div>
                  <div className="text-right" title={valueBench || "Value benchmark"}>Value</div>
                </div>
                {ratioRows.map(function (r) {
                  const isOpen = openRatios.has(r.key);
                  /* Source pill: "live" = rolled up from current holdings;
                     date string = quarter-end snapshot from upload. "none"
                     = no data either way (rare; renders no badge so dashes
                     speak for themselves). */
                  const sourceBadge = r.source === "live" ? (
                    <span className="text-[8px] uppercase tracking-wide font-semibold px-1 py-0 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shrink-0" title="Live: rolled up from current holdings">live</span>
                  ) : r.source === "quarter" && ratioDate ? (
                    <span className="text-[8px] uppercase tracking-wide font-semibold px-1 py-0 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shrink-0" title={"Q-end snapshot from uploaded portfolio history (" + ratioDate + ")"}>{quarterShort(ratioDate)}</span>
                  ) : null;
                  return (
                    <div key={r.key}>
                      <div
                        onClick={function () { toggleRatio(r.key); }}
                        className="grid gap-1 px-2 py-1.5 text-xs items-center border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 grid-cols-[1fr_90px_90px_90px]"
                        title="Click to toggle history chart"
                      >
                        <div className="text-gray-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                          <span className="text-gray-400 dark:text-slate-500 text-[9px]">{isOpen ? "▼" : "▶"}</span>
                          <span className="truncate" title={r.label}>{r.label}</span>
                          {sourceBadge}
                        </div>
                        <div className="text-right font-medium text-gray-900 dark:text-slate-100 tabular-nums">
                          {fmtMetric(r.portfolio, r.kind)}
                        </div>
                        <div
                          className="text-right tabular-nums"
                          style={{ color: ratioBenchColor(r.portfolio, r.core, r.kind, r.direction) }}
                          title={"Δ port − bench: " + (fmtDelta(r.portfolio, r.core, r.kind) || "--")}
                        >
                          {r.core === null || r.core === undefined ? "--" : fmtMetric(r.core, r.kind)}
                        </div>
                        <div
                          className="text-right tabular-nums"
                          style={{ color: ratioBenchColor(r.portfolio, r.value, r.kind, r.direction) }}
                          title={"Δ port − bench: " + (fmtDelta(r.portfolio, r.value, r.kind) || "--")}
                        >
                          {r.value === null || r.value === undefined ? "--" : fmtMetric(r.value, r.kind)}
                        </div>
                      </div>
                      {isOpen && (
                        <div className="px-2 py-1 border-b border-slate-100 dark:border-slate-800">
                          <RatioHistoryChart
                            history={breakdownHistory}
                            portKey={portKey}
                            coreBench={coreBench}
                            valueBench={valueBench}
                            ratioKey={r.key}
                            kind={r.kind}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {!hasRatios && (
                <div className="text-[11px] text-gray-500 dark:text-slate-400 italic mt-2 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  No benchmark ratio data uploaded yet. Paste rows into Data Hub → Benchmarks with the dated 5-col format and Type = Ratio
                  (e.g. <span className="font-mono">3/31/2026{"\t"}{coreBench || "ACWI"}{"\t"}Ratio{"\t"}PRICE TO BOOK VALUE{"\t"}3.4</span>).
                </div>
              )}
              <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-1">
                Click a row for its history chart. Cell color = Δ vs portfolio (green = bench higher, red = lower).
                <span className="ml-2"><span className="text-[8px] uppercase font-semibold px-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">live</span> = rolled up from current holdings · </span>
                <span><span className="text-[8px] uppercase font-semibold px-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">Q1 '26</span> = quarter-end snapshot from upload</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
