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
  const { companies, repData, fxRates, benchmarkWeights, breakdownHistory } = useCompanyContext();
  const [portKey, setPortKey] = useState(PORTFOLIOS[0] || "GL");
  const [variant, setVariant] = useState("1"); /* default +1 */
  const [bmType, setBmType] = useState("core"); /* "core" | "value" */
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

  /* Benchmark lookup. benchmarkWeights[name].metrics is optional — if the
     user hasn't uploaded metric rows we simply hide the comparison column. */
  const benchName = (BENCHMARKS[portKey] || {})[bmType];
  const benchData = benchmarkWeights && benchName ? benchmarkWeights[benchName] : null;
  const benchMetrics = (benchData && benchData.metrics) || null;
  const hasBenchmark = !!(benchMetrics && Object.keys(benchMetrics).length > 0);

  /* Compute all weighted averages in one pass. */
  const metricRows = useMemo(function () {
    return CHARACTERISTIC_METRICS.map(function (m) {
      const field = resolveField(m.key, variant, m.hasVariants);
      const wa = weightedAvg(breakdown.byCompany, companiesById, field);
      const bm = benchMetrics && field in benchMetrics ? benchMetrics[field] : null;
      return {
        key: m.key,
        group: m.group,
        label: m.label + (m.hasVariants && variant !== "0" ? " +" + variant : (m.hasVariants && variant === "0" ? " (LTM)" : "")),
        kind: m.kind,
        portfolio: wa.value,
        coverage: wa.coverage,
        benchmark: bm,
      };
    });
  }, [breakdown, companiesById, variant, benchMetrics]);

  /* Group rows by category for rendering section headers. */
  const grouped = useMemo(function () {
    const map = {};
    const order = [];
    metricRows.forEach(function (r) {
      if (!map[r.group]) { map[r.group] = []; order.push(r.group); }
      map[r.group].push(r);
    });
    return order.map(function (g) { return { group: g, rows: map[g] }; });
  }, [metricRows]);

  /* Ratios section. Pulls a benchmark snapshot from breakdownHistory[
     benchName] (Type=Ratio quarterly history) and pairs each with the
     portfolio aggregate computed from current holdings.

     The user can switch between any uploaded date via the date selector;
     defaulting to the most-recent quarter on first render or when the
     benchmark changes. */
  const benchDates = useMemo(function () {
    return ratioDates(breakdownHistory, benchName);
  }, [breakdownHistory, benchName]);
  /* Auto-select the latest date when no explicit selection or when the
     selection doesn't exist for the current benchmark. */
  useEffect(function () {
    if (benchDates.length === 0) {
      if (ratioDate !== null) setRatioDate(null);
      return;
    }
    const latest = benchDates[benchDates.length - 1];
    if (!ratioDate || benchDates.indexOf(ratioDate) === -1) {
      setRatioDate(latest);
    }
  }, [benchDates, ratioDate]);
  const ratioSnapshot = useMemo(function () {
    if (!benchName || !ratioDate || !breakdownHistory || !breakdownHistory[benchName]) {
      return latestRatiosSnapshot(breakdownHistory, benchName);
    }
    const slot = breakdownHistory[benchName][ratioDate];
    if (!slot || !slot.ratios) return latestRatiosSnapshot(breakdownHistory, benchName);
    return { date: ratioDate, ratios: slot.ratios };
  }, [breakdownHistory, benchName, ratioDate]);
  const hasRatios = !!(ratioSnapshot && Object.keys(ratioSnapshot.ratios).length > 0);
  const ratioRows = useMemo(function () {
    return RATIO_DEFS.map(function (def) {
      const port = aggregatePortfolioRatio(breakdown.byCompany, companiesById, def);
      const bm = ratioSnapshot && (def.key in ratioSnapshot.ratios) ? ratioSnapshot.ratios[def.key] : null;
      return {
        key: def.key,
        label: def.label,
        kind: def.kind,
        portfolio: port.value,
        coverage: port.coverage,
        benchmark: bm,
      };
    });
  }, [breakdown, companiesById, ratioSnapshot]);

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

      {/* Header row: AUM + horizon toggle + benchmark toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="text-sm text-gray-700 dark:text-slate-300">
          <span className="font-semibold">{portKey}</span>
          {breakdown.totalMV > 0 && (
            <span className="text-xs text-gray-500 dark:text-slate-400 ml-2">
              Rep AUM: ${breakdown.totalMV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <VariantToggle variant={variant} setVariant={setVariant} />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 dark:text-slate-400">Benchmark:</span>
            {["core", "value"].map(function (t) {
              const bn = (BENCHMARKS[portKey] || {})[t];
              const active = bmType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={function () { setBmType(t); }}
                  className={"px-2 py-0.5 rounded-full border transition-colors " +
                    (active
                      ? "bg-blue-700 text-white border-blue-700"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")}
                  title={bn || ""}
                >
                  {t === "core" ? "Core" : "Value"}{bn ? " — " + bn : ""}
                </button>
              );
            })}
            {benchData && benchData.asOf && (
              <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">as of {benchData.asOf}</span>
            )}
          </div>
        </div>
      </div>

      {empty && (
        <div className="text-sm text-gray-500 dark:text-slate-400 italic py-4">
          No rep holdings for this portfolio yet.
        </div>
      )}

      {!empty && (
        <>
          {/* Mkt Cap tiles */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <Tile
              label="Wtd Avg Mkt Cap"
              value={fmtMetric(mcWeighted.value, "bn")}
              sub={mcWeighted.coverage.used + "/" + mcWeighted.coverage.total + " cos"}
            />
            <Tile
              label="Avg Mkt Cap"
              value={fmtMetric(mcStats.avg, "bn")}
              sub={mcStats.count + " cos"}
            />
            <Tile
              label="Median Mkt Cap"
              value={fmtMetric(mcStats.median, "bn")}
              sub={mcStats.count + " cos"}
            />
          </div>

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
                {benchDates.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-slate-400">
                    <span>as of</span>
                    <select
                      value={ratioDate || ""}
                      onChange={function (e) { setRatioDate(e.target.value); }}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300"
                      title={"All quarters with benchmark ratio data for " + (benchName || "—") + ". Currently " + benchDates.length + " uploaded."}
                    >
                      {benchDates.slice().reverse().map(function (d) {
                        return <option key={d} value={d}>{d}</option>;
                      })}
                    </select>
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className={"grid gap-1 px-2 py-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 " +
                  (hasRatios ? "grid-cols-[1fr_70px_70px_60px]" : "grid-cols-[1fr_90px]")}>
                  <div>Ratio</div>
                  <div className="text-right">Port.</div>
                  {hasRatios && <div className="text-right">Bench.</div>}
                  {hasRatios && <div className="text-right">+/−</div>}
                </div>
                {ratioRows.map(function (r) {
                  const dc = hasRatios ? deltaColor(r.portfolio, r.benchmark, r.kind) : undefined;
                  const dtxt = hasRatios ? fmtDelta(r.portfolio, r.benchmark, r.kind) : null;
                  const isOpen = openRatios.has(r.key);
                  return (
                    <div key={r.key}>
                      <div
                        onClick={function () { toggleRatio(r.key); }}
                        className={"grid gap-1 px-2 py-1.5 text-xs items-center border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 " +
                          (hasRatios ? "grid-cols-[1fr_70px_70px_60px]" : "grid-cols-[1fr_90px]")}
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
                          <div className="text-right text-gray-500 dark:text-slate-400 tabular-nums">
                            {r.benchmark === null || r.benchmark === undefined ? "--" : fmtMetric(r.benchmark, r.kind)}
                          </div>
                        )}
                        {hasRatios && (
                          <div className="text-right font-medium tabular-nums" style={{ color: dc }}>
                            {dtxt || "--"}
                          </div>
                        )}
                      </div>
                      {isOpen && (
                        <div className="px-2 py-1 border-b border-slate-100 dark:border-slate-800">
                          <RatioHistoryChart
                            history={breakdownHistory}
                            portKey={portKey}
                            benchName={benchName}
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
                  No benchmark ratio data uploaded for "{benchName || "—"}" yet. Paste rows into Data Hub → Benchmarks with the dated 5-col format and Type = Ratio
                  (e.g. <span className="font-mono">3/31/2026{"\t"}{benchName || "ACWI"}{"\t"}Ratio{"\t"}PRICE TO BOOK VALUE{"\t"}3.4</span>).
                </div>
              )}
              <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-1">
                Click a ratio to open its history chart. Portfolio history requires uploading rows with Name = portfolio code (e.g. {portKey}).
              </div>
            </div>

            {/* Metrics — grouped by category. Tightened from the previous
                full-width layout; values are now adjacent to their labels
                instead of separated by a wide 1fr column. */}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold mb-1">
                Metrics
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className={"grid gap-1 px-2 py-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 " +
                  (hasBenchmark ? "grid-cols-[1fr_60px_60px_55px_45px]" : "grid-cols-[1fr_75px_50px]")}>
                  <div>Metric</div>
                  <div className="text-right">Port.</div>
                  {hasBenchmark && <div className="text-right">Bench.</div>}
                  {hasBenchmark && <div className="text-right">+/−</div>}
                  <div className="text-right">Cov.</div>
                </div>

                {grouped.map(function (g) {
                  return (
                    <div key={g.group}>
                      <div className="px-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                        {g.group}
                      </div>
                      {g.rows.map(function (r) {
                        const dc = hasBenchmark ? deltaColor(r.portfolio, r.benchmark, r.kind) : undefined;
                        const dtxt = hasBenchmark ? fmtDelta(r.portfolio, r.benchmark, r.kind) : null;
                        return (
                          <div
                            key={r.key}
                            className={"grid gap-1 px-2 py-1.5 text-xs items-center border-b border-slate-100 dark:border-slate-800 " +
                              (hasBenchmark ? "grid-cols-[1fr_60px_60px_55px_45px]" : "grid-cols-[1fr_75px_50px]")}
                          >
                            <div className="text-gray-900 dark:text-slate-100 truncate" title={r.label}>{r.label}</div>
                            <div className="text-right font-medium text-gray-900 dark:text-slate-100 tabular-nums">
                              {fmtMetric(r.portfolio, r.kind)}
                            </div>
                            {hasBenchmark && (
                              <div className="text-right text-gray-500 dark:text-slate-400 tabular-nums">
                                {r.benchmark === null || r.benchmark === undefined ? "--" : fmtMetric(r.benchmark, r.kind)}
                              </div>
                            )}
                            {hasBenchmark && (
                              <div className="text-right font-medium tabular-nums" style={{ color: dc }}>
                                {dtxt || "--"}
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
                  No benchmark metric data uploaded for "{benchName || "—"}". Upload via Data Hub → Benchmarks with Type = Metric.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
