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
  CHARACTERISTIC_METRICS, weightedAvg, mktCapStats,
  resolveField, buildCompaniesById,
  RATIO_DEFS, aggregatePortfolioRatio, latestRatiosSnapshot, ratioDates,
} from '../../utils/characteristics.js';
import RatioHistoryChart from './RatioHistoryChart.jsx';

const TABST_ACTIVE   = "text-[13px] px-3 py-1.5 border-b-2 border-blue-600 text-gray-900 dark:text-slate-100 font-semibold cursor-pointer bg-transparent";
const TABST_INACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-transparent text-gray-500 dark:text-slate-400 cursor-pointer bg-transparent hover:text-gray-700 dark:hover:text-slate-300";
const CARD = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2";

function fmtMetric(v, kind) {
  if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return "--";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n)) return "--";
  switch (kind) {
    case "bn":    return "$" + n.toFixed(1) + "B";
    /* musd = millions USD with thousands separators (e.g. $412,350M) —
       used by the Ratios section where benchmark uploads are in M. */
    case "musd":  return "$" + Math.round(n).toLocaleString() + "M";
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
    case "x":     return sign + d.toFixed(1) + "x";
    case "pct":   return sign + (d * 100).toFixed(1) + "pp";
    case "ratio": return sign + d.toFixed(1);
    default:      return sign + String(d);
  }
}

function deltaColor(port, bench, kind) {
  if (port === null || port === undefined || bench === null || bench === undefined) return undefined;
  const d = port - bench;
  if (!isFinite(d)) return undefined;
  /* Tiny thresholds so visual noise is dampened. musd values are in
     millions of USD, where ±$500M is roughly within rounding/timing noise. */
  const eps = kind === "pct" ? 0.0025 /* 0.25pp */
            : (kind === "x" || kind === "ratio") ? 0.1
            : kind === "musd" ? 500
            : 0.5;
  if (d >  eps) return "#166534";
  if (d < -eps) return "#dc2626";
  return "#64748b";
}

function VariantToggle({ variant, setVariant }) {
  const opts = [["1", "+1"], ["0", "LTM"], ["2", "+2"]];
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-500 dark:text-slate-400">Horizon:</span>
      {opts.map(function (o) {
        const active = variant === o[0];
        return (
          <button
            key={o[0]}
            type="button"
            onClick={function () { setVariant(o[0]); }}
            className={"px-2 py-0.5 rounded-full border transition-colors " +
              (active
                ? "bg-blue-700 text-white border-blue-700"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")}
          >
            {o[1]}
          </button>
        );
      })}
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className={CARD + " min-w-[150px]"}>
      <div className="text-[11px] text-gray-500 dark:text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold text-gray-900 dark:text-slate-100">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 dark:text-slate-500">{sub}</div>}
    </div>
  );
}

export default function CharacteristicsView() {
  const { companies, repData, fxRates, benchmarkWeights, breakdownHistory, setBreakdownHistory } = useCompanyContext();
  const [portKey, setPortKey] = useState(PORTFOLIOS[0] || "GL");
  const [variant, setVariant] = useState("1"); /* default +1 */
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

  const mcStats = useMemo(function () {
    return mktCapStats(breakdown.byCompany, companiesById);
  }, [breakdown, companiesById]);

  const mcWeighted = useMemo(function () {
    return weightedAvg(breakdown.byCompany, companiesById, "mktCap");
  }, [breakdown, companiesById]);

  /* Both Core and Value benchmarks are shown side-by-side rather than
     toggled. Each has its own metric snapshot (current) and ratio
     history. The Has-* flags drive whether each column renders so an
     empty side simply collapses out. */
  const coreBench  = (BENCHMARKS[portKey] || {}).core  || null;
  const valueBench = (BENCHMARKS[portKey] || {}).value || null;
  const coreData   = coreBench  && benchmarkWeights ? benchmarkWeights[coreBench]  : null;
  const valueData  = valueBench && benchmarkWeights ? benchmarkWeights[valueBench] : null;
  const coreMetrics  = (coreData  && coreData.metrics)  || null;
  const valueMetrics = (valueData && valueData.metrics) || null;
  const hasCoreMetrics  = !!(coreMetrics  && Object.keys(coreMetrics).length  > 0);
  const hasValueMetrics = !!(valueMetrics && Object.keys(valueMetrics).length > 0);
  const hasBenchmark    = hasCoreMetrics || hasValueMetrics;

  /* Compute all weighted averages in one pass. */
  const metricRows = useMemo(function () {
    return CHARACTERISTIC_METRICS.map(function (m) {
      const field = resolveField(m.key, variant, m.hasVariants);
      const wa = weightedAvg(breakdown.byCompany, companiesById, field);
      const core  = coreMetrics  && field in coreMetrics  ? coreMetrics[field]  : null;
      const value = valueMetrics && field in valueMetrics ? valueMetrics[field] : null;
      return {
        key: m.key,
        group: m.group,
        label: m.label + (m.hasVariants && variant !== "0" ? " +" + variant : (m.hasVariants && variant === "0" ? " (LTM)" : "")),
        kind: m.kind,
        portfolio: wa.value,
        coverage: wa.coverage,
        core: core,
        value: value,
      };
    });
  }, [breakdown, companiesById, variant, coreMetrics, valueMetrics]);

  /* Insert the two unweighted mkt-cap rows (Avg and Median) at the
     top of the Size group, alongside the existing weighted Mkt Cap row.
     User explicitly asked to retire the standalone tiles in favor of
     these inline rows. */
  const augmentedMetricRows = useMemo(function () {
    const out = [];
    metricRows.forEach(function (r, idx) {
      if (idx === 0 && r.group === "Size") {
        /* The first row is "Mkt Cap" (weighted). Add unweighted siblings
           AFTER it so the order is Wtd / Avg / Median. */
        out.push(r);
        out.push({
          key: "_avgMktCap", group: "Size", label: "Avg Mkt Cap", kind: "bn",
          portfolio: mcStats.avg,
          coverage: { used: mcStats.count, total: breakdown.byCompany.length },
          core: null, value: null,
        });
        out.push({
          key: "_medMktCap", group: "Size", label: "Median Mkt Cap", kind: "bn",
          portfolio: mcStats.median,
          coverage: { used: mcStats.count, total: breakdown.byCompany.length },
          core: null, value: null,
        });
      } else {
        out.push(r);
      }
    });
    return out;
  }, [metricRows, mcStats, breakdown]);

  /* Group rows by category for rendering section headers. */
  const grouped = useMemo(function () {
    const map = {};
    const order = [];
    augmentedMetricRows.forEach(function (r) {
      if (!map[r.group]) { map[r.group] = []; order.push(r.group); }
      map[r.group].push(r);
    });
    return order.map(function (g) { return { group: g, rows: map[g] }; });
  }, [augmentedMetricRows]);

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
      const port = aggregatePortfolioRatio(breakdown.byCompany, companiesById, def);
      const cv = coreRatios  && (def.key in coreRatios)  ? coreRatios[def.key]  : null;
      const vv = valueRatios && (def.key in valueRatios) ? valueRatios[def.key] : null;
      return {
        key: def.key,
        label: def.label,
        kind: def.kind,
        portfolio: port.value,
        coverage: port.coverage,
        core: cv,
        value: vv,
      };
    });
  }, [breakdown, companiesById, coreRatios, valueRatios]);

  /* Delete a single uploaded date from breakdownHistory for one of the
     two benchmarks. Used to clean up stray uploads (e.g. a 6/30/26 row
     pasted by mistake) without going to the database directly. */
  function deleteRatioDate(name, date) {
    if (!name || !date) return;
    if (!confirm("Delete all ratios for " + name + " on " + date + "?")) return;
    setBreakdownHistory(function (prev) {
      const next = Object.assign({}, prev || {});
      const byDate = Object.assign({}, next[name] || {});
      delete byDate[date];
      next[name] = byDate;
      return next;
    });
  }

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

      {/* Header row: AUM + horizon toggle. The Core/Value toggle is gone
          — both benchmarks now render side-by-side in the tables and on
          the inline history chart. */}
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
        <VariantToggle variant={variant} setVariant={setVariant} />
      </div>

      {empty && (
        <div className="text-sm text-gray-500 dark:text-slate-400 italic py-4">
          No rep holdings for this portfolio yet.
        </div>
      )}

      {!empty && (
        <>
          {/* Side-by-side: Ratios on the left, Metrics on the right. Both
              tables tightened so the label column doesn't waste horizontal
              space — that's what the user was complaining about with the
              old single-column layout. Stacks vertically on narrow widths. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                    {/* Tiny "x" deletes the currently-selected date from
                        BOTH benchmarks. Useful for cleaning up a stray
                        upload (e.g. a wrong date typed in). Confirms before
                        wiping. */}
                    {ratioDate && (
                      <button
                        type="button"
                        onClick={function () {
                          if (!confirm("Delete all ratios for " + ratioDate + " across Core (" + (coreBench || "—") + ") and Value (" + (valueBench || "—") + ")?")) return;
                          if (coreBench)  setBreakdownHistory(function (prev) { const n = Object.assign({}, prev || {}); const bd = Object.assign({}, n[coreBench]  || {}); delete bd[ratioDate]; n[coreBench]  = bd; return n; });
                          if (valueBench) setBreakdownHistory(function (prev) { const n = Object.assign({}, prev || {}); const bd = Object.assign({}, n[valueBench] || {}); delete bd[ratioDate]; n[valueBench] = bd; return n; });
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Delete this date from breakdownHistory (both Core and Value benchmarks)"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className={"grid gap-1 px-2 py-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 " +
                  (hasRatios ? "grid-cols-[1fr_70px_70px_70px]" : "grid-cols-[1fr_90px]")}>
                  <div>Ratio</div>
                  <div className="text-right">Port.</div>
                  {hasRatios && <div className="text-right" title={coreBench  || "Core"}>Core</div>}
                  {hasRatios && <div className="text-right" title={valueBench || "Value"}>Value</div>}
                </div>
                {ratioRows.map(function (r) {
                  const isOpen = openRatios.has(r.key);
                  return (
                    <div key={r.key}>
                      <div
                        onClick={function () { toggleRatio(r.key); }}
                        className={"grid gap-1 px-2 py-1.5 text-xs items-center border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 " +
                          (hasRatios ? "grid-cols-[1fr_70px_70px_70px]" : "grid-cols-[1fr_90px]")}
                        title="Click to toggle history chart"
                      >
                        <div className="text-gray-900 dark:text-slate-100 truncate flex items-center gap-1">
                          <span className="text-gray-400 dark:text-slate-500 text-[9px]">{isOpen ? "▼" : "▶"}</span>
                          <span className="truncate" title={r.label}>{r.label}</span>
                        </div>
                        <div className="text-right font-medium text-gray-900 dark:text-slate-100 tabular-nums">
                          {fmtMetric(r.portfolio, r.kind)}
                        </div>
                        {hasRatios && (
                          <div
                            className="text-right tabular-nums"
                            style={{ color: deltaColor(r.portfolio, r.core, r.kind) }}
                            title={"Δ vs portfolio: " + (fmtDelta(r.portfolio, r.core, r.kind) || "--")}
                          >
                            {r.core === null || r.core === undefined ? "--" : fmtMetric(r.core, r.kind)}
                          </div>
                        )}
                        {hasRatios && (
                          <div
                            className="text-right tabular-nums"
                            style={{ color: deltaColor(r.portfolio, r.value, r.kind) }}
                            title={"Δ vs portfolio: " + (fmtDelta(r.portfolio, r.value, r.kind) || "--")}
                          >
                            {r.value === null || r.value === undefined ? "--" : fmtMetric(r.value, r.kind)}
                          </div>
                        )}
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
                Click a ratio for its history chart. Cell color = Δ vs portfolio (green = bench higher, red = lower).
              </div>
            </div>

            {/* Metrics — grouped by category. Both Core and Value benchmark
                columns render side-by-side; cells colored by Δ vs portfolio
                (green = bench above portfolio, red = bench below). The
                Avg/Median Mkt Cap rows in the Size group replace the old
                standalone tiles. */}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold mb-1">
                Metrics
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className={"grid gap-1 px-2 py-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 " +
                  (hasBenchmark ? "grid-cols-[1fr_55px_55px_55px_45px]" : "grid-cols-[1fr_75px_50px]")}>
                  <div>Metric</div>
                  <div className="text-right">Port.</div>
                  {hasBenchmark && <div className="text-right" title={coreBench  || "Core"}>Core</div>}
                  {hasBenchmark && <div className="text-right" title={valueBench || "Value"}>Value</div>}
                  <div className="text-right">Cov.</div>
                </div>

                {grouped.map(function (g) {
                  return (
                    <div key={g.group}>
                      <div className="px-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                        {g.group}
                      </div>
                      {g.rows.map(function (r) {
                        return (
                          <div
                            key={r.key}
                            className={"grid gap-1 px-2 py-1.5 text-xs items-center border-b border-slate-100 dark:border-slate-800 " +
                              (hasBenchmark ? "grid-cols-[1fr_55px_55px_55px_45px]" : "grid-cols-[1fr_75px_50px]")}
                          >
                            <div className="text-gray-900 dark:text-slate-100 truncate" title={r.label}>{r.label}</div>
                            <div className="text-right font-medium text-gray-900 dark:text-slate-100 tabular-nums">
                              {fmtMetric(r.portfolio, r.kind)}
                            </div>
                            {hasBenchmark && (
                              <div
                                className="text-right tabular-nums"
                                style={{ color: deltaColor(r.portfolio, r.core, r.kind) }}
                                title={"Δ vs portfolio: " + (fmtDelta(r.portfolio, r.core, r.kind) || "--")}
                              >
                                {r.core === null || r.core === undefined ? "--" : fmtMetric(r.core, r.kind)}
                              </div>
                            )}
                            {hasBenchmark && (
                              <div
                                className="text-right tabular-nums"
                                style={{ color: deltaColor(r.portfolio, r.value, r.kind) }}
                                title={"Δ vs portfolio: " + (fmtDelta(r.portfolio, r.value, r.kind) || "--")}
                              >
                                {r.value === null || r.value === undefined ? "--" : fmtMetric(r.value, r.kind)}
                              </div>
                            )}
                            <div className="text-right text-[10px] text-gray-400 dark:text-slate-500 tabular-nums">
                              {r.coverage.used}/{r.coverage.total}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {!hasBenchmark && (
                <div className="text-[11px] text-gray-500 dark:text-slate-400 italic mt-2 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  No benchmark metric data uploaded yet. Upload via Data Hub → Benchmarks with Type = Metric for either {coreBench || "Core"} or {valueBench || "Value"}.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
