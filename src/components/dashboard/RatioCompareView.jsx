/* Dashboard → Ratio Compare.
 *
 * Cross-portfolio view of a single ratio. The user picks a ratio (e.g.
 * "P/E", "Active Share") and a date, and sees one row per portfolio
 * with: portfolio aggregate value, Core benchmark value, Value benchmark
 * value, plus deltas — so you can answer questions like "which portfolio
 * is most overweight on Fwd P/E vs its benchmark right now" at a glance.
 *
 * Portfolio side is computed from current holdings when a portMetric
 * exists for the ratio; otherwise falls back to uploaded breakdownHistory
 * [portfolio][date].ratios[key] — same logic CharacteristicsView uses.
 *
 * Benchmark side reads breakdownHistory[BENCHMARKS[portfolio][type]].ratios
 * at the selected date.
 */

import { useMemo, useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { BENCHMARKS, PORTFOLIOS, PORT_NAMES } from '../../constants/index.js';
import { calcBreakdowns } from '../../utils/portfolioMath.js';
import {
  RATIO_DEFS, aggregatePortfolioRatio, uploadedPortfolioRatio,
  buildCompaniesById,
} from '../../utils/characteristics.js';

/* Distinct colors for the 6 portfolios on the history chart. Same color
   gets used in the row pill in the table for consistency. */
const PORT_COLORS = {
  FIN: "#1d4ed8",   /* blue */
  IN:  "#7c3aed",   /* purple */
  FGL: "#059669",   /* green */
  GL:  "#16a34a",   /* light green */
  EM:  "#d97706",   /* amber */
  SC:  "#dc2626",   /* red */
};

/* Format ISO YYYY-MM-DD as "Q1 '26" for X-axis ticks. */
function quarterLabel(iso) {
  if (!iso || iso.length < 7) return iso || "";
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
    case "int":   return Math.round(n).toLocaleString();
    case "x":     return n.toFixed(1) + "x";
    case "pct":   return (n * 100).toFixed(1) + "%";
    case "ratio": return n.toFixed(1);
    default:      return String(v);
  }
}

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

/* Sign-only color (no gray middle band). Direction-aware:
 *   neutral -> no color
 *   lower   -> green when bench < port (bench is cheaper / better)
 *   higher  -> green when bench > port (bench is ahead on the metric) */
function ratioBenchColor(port, bench, direction) {
  if (direction === "neutral") return undefined;
  if (port === null || port === undefined || bench === null || bench === undefined) return undefined;
  const d = direction === "lower" ? (port - bench) : (bench - port);
  if (!isFinite(d)) return undefined;
  if (d > 0) return "#166534";
  if (d < 0) return "#dc2626";
  return undefined;
}

export default function RatioCompareView() {
  const { companies, repData, fxRates, breakdownHistory } = useCompanyContext();
  const [ratioKey, setRatioKey] = useState("fwdPe");
  const [ratioDate, setRatioDate] = useState(null);
  /* Which portfolios are visible on the chart. Defaults to all checked.
     Toggling adds/removes a key. Lines for unchecked portfolios are
     skipped at render. */
  const [visiblePorts, setVisiblePorts] = useState(function () {
    return new Set(PORTFOLIOS);
  });
  function togglePort(p) {
    setVisiblePorts(function (prev) {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }

  const def = useMemo(function () {
    return RATIO_DEFS.find(function (d) { return d.key === ratioKey; }) || RATIO_DEFS[0];
  }, [ratioKey]);

  /* All dates with at least one ratio entry across any name in
     breakdownHistory. Sorted ascending; default selection is latest. */
  const allDates = useMemo(function () {
    const set = new Set();
    Object.keys(breakdownHistory || {}).forEach(function (name) {
      const byDate = breakdownHistory[name] || {};
      Object.keys(byDate).forEach(function (d) {
        const slot = byDate[d];
        if (slot && slot.ratios && Object.keys(slot.ratios).length > 0) set.add(d);
      });
    });
    return Array.from(set).sort();
  }, [breakdownHistory]);

  useEffect(function () {
    if (allDates.length === 0) {
      if (ratioDate !== null) setRatioDate(null);
      return;
    }
    const latest = allDates[allDates.length - 1];
    if (!ratioDate || allDates.indexOf(ratioDate) === -1) setRatioDate(latest);
  }, [allDates, ratioDate]);

  const companiesById = useMemo(function () {
    return buildCompaniesById(companies);
  }, [companies]);

  /* One row per portfolio. */
  const rows = useMemo(function () {
    return PORTFOLIOS.map(function (port) {
      const breakdown = calcBreakdowns(companies, repData, fxRates, port);
      let portVal = aggregatePortfolioRatio(breakdown.byCompany, companiesById, def);
      let portValue = portVal.value;
      if (portValue === null) {
        const uploaded = uploadedPortfolioRatio(breakdownHistory, port, ratioDate, def.key);
        if (uploaded !== null && uploaded !== undefined) portValue = uploaded;
      }
      const coreBench  = (BENCHMARKS[port] || {}).core  || null;
      const valueBench = (BENCHMARKS[port] || {}).value || null;
      function lookupBench(name) {
        if (!name || !ratioDate) return null;
        const slot = breakdownHistory && breakdownHistory[name] && breakdownHistory[name][ratioDate];
        if (!slot || !slot.ratios) return null;
        return def.key in slot.ratios ? slot.ratios[def.key] : null;
      }
      return {
        port: port,
        name: PORT_NAMES[port] || port,
        portfolio: portValue,
        coreBench: coreBench,
        valueBench: valueBench,
        core: lookupBench(coreBench),
        value: lookupBench(valueBench),
      };
    });
  }, [companies, repData, fxRates, def, breakdownHistory, ratioDate, companiesById]);

  /* History series for the chart. One column per portfolio, plus
     optionally one column per unique benchmark (toggle below). Each row
     is { date, FGL, GL, FIN, IN, EM, SC, [bench keys] }. */
  const [includeBench, setIncludeBench] = useState(false);
  const chartData = useMemo(function () {
    const dateSet = new Set();
    /* Union of all dates from portfolios + (optionally) benchmarks. */
    PORTFOLIOS.forEach(function (p) {
      const byDate = (breakdownHistory && breakdownHistory[p]) || {};
      Object.keys(byDate).forEach(function (d) {
        if (byDate[d] && byDate[d].ratios && (def.key in byDate[d].ratios)) dateSet.add(d);
      });
    });
    const benchNames = [];
    if (includeBench) {
      PORTFOLIOS.forEach(function (p) {
        const cb = (BENCHMARKS[p] || {}).core;
        const vb = (BENCHMARKS[p] || {}).value;
        if (cb && benchNames.indexOf(cb) < 0) benchNames.push(cb);
        if (vb && benchNames.indexOf(vb) < 0) benchNames.push(vb);
      });
      benchNames.forEach(function (b) {
        const byDate = (breakdownHistory && breakdownHistory[b]) || {};
        Object.keys(byDate).forEach(function (d) {
          if (byDate[d] && byDate[d].ratios && (def.key in byDate[d].ratios)) dateSet.add(d);
        });
      });
    }
    const dates = Array.from(dateSet).sort();
    return {
      benchNames: benchNames,
      rows: dates.map(function (d) {
        const row = { date: d };
        PORTFOLIOS.forEach(function (p) {
          const slot = breakdownHistory && breakdownHistory[p] && breakdownHistory[p][d];
          row[p] = (slot && slot.ratios && def.key in slot.ratios) ? slot.ratios[def.key] : null;
        });
        if (includeBench) {
          benchNames.forEach(function (b) {
            const slot = breakdownHistory && breakdownHistory[b] && breakdownHistory[b][d];
            row[b] = (slot && slot.ratios && def.key in slot.ratios) ? slot.ratios[def.key] : null;
          });
        }
        return row;
      }),
    };
  }, [breakdownHistory, def, includeBench]);

  /* Y-axis formatter — auto-scale musd, percent-aware pct, etc. */
  function chartYFmt(v) {
    if (v === null || v === undefined) return "";
    if (def.kind === "pct") return (v * 100).toFixed(1) + "%";
    if (def.kind === "musd") return fmtMUSD(v);
    if (def.kind === "x") return v.toFixed(1) + "x";
    if (def.kind === "int") return Math.round(v).toLocaleString();
    return String(v);
  }
  function chartTipFmt(v, name) {
    if (v === null || v === undefined) return ["--", name];
    if (def.kind === "pct") return [(v * 100).toFixed(2) + "%", name];
    if (def.kind === "musd") return [fmtMUSD(v), name];
    if (def.kind === "x") return [v.toFixed(2) + "x", name];
    if (def.kind === "int") return [Math.round(v).toLocaleString(), name];
    return [String(v), name];
  }

  /* Group RATIO_DEFS by direction-bucketed category so the picker dropdown
     reads as Size / Valuation / Returns / Growth / Yield / Leverage /
     Concentration. Gives the user a faster scan than a flat 25-item list. */
  const groupedDefs = useMemo(function () {
    const groups = [
      { label: "Size",          keys: ["mcWtdAvg","avgMktCap","medMktCap","mcLargest","mcSmallest","nHoldings"] },
      { label: "Concentration", keys: ["activeShare"] },
      { label: "Valuation",     keys: ["fwdPe","pe","peExcl","pb","pbLtm","ps","pcf"] },
      { label: "Returns",       keys: ["roe","roe5y"] },
      { label: "Growth",        keys: ["epsGrFwd1","epsGrFwd35","epsGrHist3","adpsGr5","adpsGr1","intGr"] },
      { label: "Yield / Payout",keys: ["divYld","payout"] },
      { label: "Leverage",      keys: ["debtCap"] },
    ];
    return groups.map(function (g) {
      return {
        label: g.label,
        defs: g.keys.map(function (k) {
          return RATIO_DEFS.find(function (d) { return d.key === k; });
        }).filter(Boolean),
      };
    });
  }, []);

  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap mb-3">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">
          Ratio Compare — across portfolios
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-500 dark:text-slate-400">Ratio:</span>
          <select
            value={ratioKey}
            onChange={function (e) { setRatioKey(e.target.value); }}
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100"
          >
            {groupedDefs.map(function (g) {
              return (
                <optgroup key={g.label} label={g.label}>
                  {g.defs.map(function (d) {
                    return <option key={d.key} value={d.key}>{d.label}</option>;
                  })}
                </optgroup>
              );
            })}
          </select>
        </div>
        {allDates.length > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500 dark:text-slate-400">As of:</span>
            <select
              value={ratioDate || ""}
              onChange={function (e) { setRatioDate(e.target.value); }}
              className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100"
            >
              {allDates.slice().reverse().map(function (d) {
                return <option key={d} value={d}>{d}</option>;
              })}
            </select>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="grid gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 grid-cols-[1fr_90px_120px_120px_70px_70px]">
          <div>Portfolio</div>
          <div className="text-right">Port.</div>
          <div className="text-right">Core</div>
          <div className="text-right">Value</div>
          <div className="text-right">Δ Core</div>
          <div className="text-right">Δ Value</div>
        </div>
        {rows.map(function (r) {
          return (
            <div
              key={r.port}
              className="grid gap-2 px-3 py-2 text-xs items-center border-b border-slate-100 dark:border-slate-800 grid-cols-[1fr_90px_120px_120px_70px_70px]"
            >
              <div>
                <div className="font-semibold text-gray-900 dark:text-slate-100">{r.port}</div>
                <div className="text-[10px] text-gray-400 dark:text-slate-500 italic truncate" title={r.name + " · Core: " + (r.coreBench || "—") + " · Value: " + (r.valueBench || "—")}>
                  {r.coreBench || "—"} · {r.valueBench || "—"}
                </div>
              </div>
              <div className="text-right font-medium text-gray-900 dark:text-slate-100 tabular-nums">
                {fmtMetric(r.portfolio, def.kind)}
              </div>
              <div
                className="text-right tabular-nums"
                style={{ color: ratioBenchColor(r.portfolio, r.core, def.direction) }}
                title={"Δ port − bench: " + (fmtDelta(r.portfolio, r.core, def.kind) || "--")}
              >
                {fmtMetric(r.core, def.kind)}
              </div>
              <div
                className="text-right tabular-nums"
                style={{ color: ratioBenchColor(r.portfolio, r.value, def.direction) }}
                title={"Δ port − bench: " + (fmtDelta(r.portfolio, r.value, def.kind) || "--")}
              >
                {fmtMetric(r.value, def.kind)}
              </div>
              <div
                className="text-right tabular-nums"
                style={{ color: ratioBenchColor(r.portfolio, r.core, def.direction) }}
              >
                {fmtDelta(r.portfolio, r.core, def.kind) || "--"}
              </div>
              <div
                className="text-right tabular-nums"
                style={{ color: ratioBenchColor(r.portfolio, r.value, def.direction) }}
              >
                {fmtDelta(r.portfolio, r.value, def.kind) || "--"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-1">
        {def.direction === "neutral"
          ? "Neutral metric — no green/red coloring."
          : (def.direction === "lower"
              ? "Lower is better — bench cell green when bench < portfolio."
              : "Higher is better — bench cell green when bench > portfolio.")}
        {" "}Portfolio aggregate is {def.aggregator || "from upload"} when computable from holdings; otherwise reads from breakdownHistory at the selected date.
      </div>

      {/* Cross-portfolio history chart for the selected ratio. One line
          per portfolio; optional benchmark overlay via toggle. Plots only
          quarters where at least one portfolio has uploaded data for
          this ratio key. */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold">
            History — {def.label}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Per-portfolio show/hide checkboxes — colored swatch
                matches the line color so the user can map quickly. */}
            <div className="flex items-center gap-2 flex-wrap text-[10px] text-gray-700 dark:text-slate-300">
              {PORTFOLIOS.map(function (p) {
                const on = visiblePorts.has(p);
                return (
                  <label key={p} className="flex items-center gap-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={function () { togglePort(p); }}
                      className="cursor-pointer"
                    />
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{ background: on ? (PORT_COLORS[p] || "#334155") : "transparent",
                               border: "1px solid " + (PORT_COLORS[p] || "#334155") }}
                    />
                    <span style={{ color: on ? undefined : "#94a3b8" }}>{p}</span>
                  </label>
                );
              })}
            </div>
            <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBench}
                onChange={function (e) { setIncludeBench(e.target.checked); }}
                className="cursor-pointer"
              />
              Include benchmarks
            </label>
          </div>
        </div>
        {chartData.rows.length === 0 ? (
          <div className="text-xs italic text-gray-500 dark:text-slate-400 py-6 text-center bg-slate-50 dark:bg-slate-800/40 rounded">
            No portfolio history uploaded for this ratio yet. Paste rows with Type=Ratio and Name=portfolio code (FGL, GL, FIN, IN, EM, SC) in Data Hub → Benchmarks.
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded p-2">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData.rows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.3} />
                <XAxis dataKey="date" tickFormatter={quarterLabel} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={chartYFmt} tick={{ fontSize: 11 }} width={70} />
                <Tooltip
                  formatter={chartTipFmt}
                  labelFormatter={function (l) { return quarterLabel(l) + " (" + l + ")"; }}
                  contentStyle={{ fontSize: 12 }}
                  itemSorter={function (item) { return -(item.value || 0); }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {PORTFOLIOS.filter(function (p) { return visiblePorts.has(p); }).map(function (p) {
                  return (
                    <Line
                      key={p}
                      type="monotone"
                      dataKey={p}
                      name={p}
                      stroke={PORT_COLORS[p] || "#334155"}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                      connectNulls
                    />
                  );
                })}
                {includeBench && chartData.benchNames.map(function (b) {
                  return (
                    <Line
                      key={b}
                      type="monotone"
                      dataKey={b}
                      name={b}
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={{ r: 2 }}
                      isAnimationActive={false}
                      connectNulls
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
