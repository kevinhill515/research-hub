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
export function fmtMUSD(n) {
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

  /* Build the metric rows. One row per metric; the three horizon variants
     (LTM, +1, +2) are exposed as separate columns inside each row, each
     carrying its own port / core / value tuple. Non-variant metrics
     (mktCap, intCov, ltEPS) only populate the LTM column; the +1 and +2
     columns render "—" for those. */
  const metricRows = useMemo(function () {
    return CHARACTERISTIC_METRICS.map(function (m) {
      function buildHorizon(variant) {
        const field = resolveField(m.key, variant, m.hasVariants);
        const wa = weightedAvg(breakdown.byCompany, companiesById, field);
        const core  = coreMetrics  && field in coreMetrics  ? coreMetrics[field]  : null;
        const value = valueMetrics && field in valueMetrics ? valueMetrics[field] : null;
        return { portfolio: wa.value, coverage: wa.coverage, core: core, value: value };
      }
      const ltm = buildHorizon("0");
      /* Skip +1/+2 for non-variant metrics — same value would just repeat. */
      const plus1 = m.hasVariants ? buildHorizon("1") : null;
      const plus2 = m.hasVariants ? buildHorizon("2") : null;
      return {
        key: m.key,
        group: m.group,
        label: m.label,
        kind: m.kind,
        hasVariants: m.hasVariants,
        ltm: ltm,
        plus1: plus1,
        plus2: plus2,
      };
    });
  }, [breakdown, companiesById, coreMetrics, valueMetrics]);

  /* Insert the two unweighted mkt-cap rows (Avg and Median) at the
     top of the Size group, alongside the existing weighted Mkt Cap row.
     New shape: one row per metric, with .ltm / .plus1 / .plus2 horizon
     tuples. Avg/Median are non-variant so they only have ltm. */
  const augmentedMetricRows = useMemo(function () {
    const out = [];
    metricRows.forEach(function (r, idx) {
      if (idx === 0 && r.group === "Size") {
        out.push(r);
        const cov = { used: mcStats.count, total: breakdown.byCompany.length };
        out.push({
          key: "_avgMktCap", group: "Size", label: "Avg Mkt Cap", kind: "bn", hasVariants: false,
          ltm: { portfolio: mcStats.avg,    coverage: cov, core: null, value: null },
          plus1: null, plus2: null,
        });
        out.push({
          key: "_medMktCap", group: "Size", label: "Median Mkt Cap", kind: "bn", hasVariants: false,
          ltm: { portfolio: mcStats.median, coverage: cov, core: null, value: null },
          plus1: null, plus2: null,
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
      let port = aggregatePortfolioRatio(breakdown.byCompany, companiesById, def);
      /* Fallback to uploaded portfolio history when there's no per-company
         source for this ratio (e.g. Active Share, P/S, P/CF). Reads at the
         same date the user picked for the benchmarks so periods match. */
      if (port.value === null) {
        const uploaded = uploadedPortfolioRatio(breakdownHistory, portKey, ratioDate, def.key);
        if (uploaded !== null && uploaded !== undefined) {
          port = { value: uploaded, coverage: { used: 1, total: 1, weightUsed: 0, weightTotal: 0 } };
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
                            style={{ color: ratioBenchColor(r.portfolio, r.core, r.kind, r.direction) }}
                            title={"Δ port − bench: " + (fmtDelta(r.portfolio, r.core, r.kind) || "--")}
                          >
                            {r.core === null || r.core === undefined ? "--" : fmtMetric(r.core, r.kind)}
                          </div>
                        )}
                        {hasRatios && (
                          <div
                            className="text-right tabular-nums"
                            style={{ color: ratioBenchColor(r.portfolio, r.value, r.kind, r.direction) }}
                            title={"Δ port − bench: " + (fmtDelta(r.portfolio, r.value, r.kind) || "--")}
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

            {/* Metrics — grouped by category. Three horizon columns
                (LTM, +1, +2) shown for every metric; non-variant metrics
                (Mkt Cap, Int Cov, LT EPS) populate only the LTM column.
                Each horizon cell stacks Port (top, bold) over Core and
                Value bench numbers (smaller, gray) so the user gets the
                full Port/Core/Value picture without 9 separate columns.
                Bench numbers colored green = bench above port, red = below. */}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold mb-1">
                Metrics
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="grid gap-1 px-2 py-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 grid-cols-[1fr_70px_70px_70px_45px]">
                  <div>Metric</div>
                  <div className="text-right">LTM</div>
                  <div className="text-right">+1</div>
                  <div className="text-right">+2</div>
                  <div className="text-right">Cov.</div>
                </div>

                {grouped.map(function (g) {
                  return (
                    <div key={g.group}>
                      <div className="px-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                        {g.group}
                      </div>
                      {g.rows.map(function (r) {
                        function HorizonCell({ h, fieldKey }) {
                          if (!h) {
                            return <div className="text-right text-gray-300 dark:text-slate-600 text-[10px]">—</div>;
                          }
                          return (
                            <div className="text-right text-[11px] leading-tight">
                              <div className="font-medium text-gray-900 dark:text-slate-100 tabular-nums">
                                {fmtMetric(h.portfolio, r.kind)}
                              </div>
                              {hasBenchmark && (
                                <>
                                  <div
                                    className="text-[10px] tabular-nums"
                                    style={{ color: deltaColor(h.portfolio, h.core, r.kind, fieldKey) || "#94a3b8" }}
                                    title={"Core: Δ port − bench " + (fmtDelta(h.portfolio, h.core, r.kind) || "--")}
                                  >
                                    {h.core === null || h.core === undefined ? "--" : fmtMetric(h.core, r.kind)}
                                  </div>
                                  <div
                                    className="text-[10px] tabular-nums"
                                    style={{ color: deltaColor(h.portfolio, h.value, r.kind, fieldKey) || "#94a3b8" }}
                                    title={"Value: Δ port − bench " + (fmtDelta(h.portfolio, h.value, r.kind) || "--")}
                                  >
                                    {h.value === null || h.value === undefined ? "--" : fmtMetric(h.value, r.kind)}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        }
                        const ltmCov = r.ltm && r.ltm.coverage;
                        return (
                          <div
                            key={r.key}
                            className="grid gap-1 px-2 py-1.5 text-xs items-start border-b border-slate-100 dark:border-slate-800 grid-cols-[1fr_70px_70px_70px_45px]"
                          >
                            <div className="text-gray-900 dark:text-slate-100 truncate pt-0.5" title={r.label}>{r.label}</div>
                            <HorizonCell h={r.ltm}   fieldKey={r.hasVariants ? r.key      : r.key} />
                            <HorizonCell h={r.plus1} fieldKey={r.hasVariants ? r.key + "1" : r.key} />
                            <HorizonCell h={r.plus2} fieldKey={r.hasVariants ? r.key + "2" : r.key} />
                            <div className="text-right text-[10px] text-gray-400 dark:text-slate-500 tabular-nums pt-0.5">
                              {ltmCov ? (ltmCov.used + "/" + ltmCov.total) : "--"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {hasBenchmark && (
                <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-1">
                  Each cell stacks Port (bold) / Core / Value. Hover for exact deltas.
                </div>
              )}
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
