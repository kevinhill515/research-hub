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
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { BENCHMARKS, PORTFOLIOS, PORT_NAMES } from '../../constants/index.js';
import { calcBreakdowns } from '../../utils/portfolioMath.js';
import {
  RATIO_DEFS, aggregatePortfolioRatio, uploadedPortfolioRatio,
  buildCompaniesById,
} from '../../utils/characteristics.js';

function fmtMetric(v, kind) {
  if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return "--";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n)) return "--";
  switch (kind) {
    case "bn":    return "$" + n.toFixed(1) + "B";
    case "musd":  return "$" + Math.round(n).toLocaleString() + "M";
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
    </div>
  );
}
