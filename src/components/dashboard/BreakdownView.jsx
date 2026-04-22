/* Weighted sector / country breakdown with benchmark comparison.
 *
 * Shows the currently-selected portfolio's rep weights, and next to each
 * row either:
 *   - The benchmark weight (Core or Value), if benchmark data has been
 *     uploaded for that portfolio's benchmark
 *   - Plus the delta (portfolio - benchmark) — green when overweight,
 *     red when underweight
 *
 * If no benchmark data is loaded, hides the benchmark column and shows
 * a note pointing to the Data Hub upload.
 */

import { useMemo, useState } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { BENCHMARKS, PORTFOLIOS, SECTOR_COLORS, SECTOR_ORDER, COUNTRY_GROUPS, COUNTRY_COLORS, REGION_GROUPS, REGION_COLORS } from '../../constants/index.js';
import { calcBreakdowns } from '../../utils/portfolioMath.js';

const TABST_ACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-blue-600 text-gray-900 dark:text-slate-100 font-semibold cursor-pointer bg-transparent";
const TABST_INACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-transparent text-gray-500 dark:text-slate-400 cursor-pointer bg-transparent hover:text-gray-700 dark:hover:text-slate-300";

/* Single row for one sector/country — two side-by-side horizontal bars
 * for portfolio vs benchmark, plus a numeric delta on the right. Bars
 * share the same scale (max = bigger of the two in the row). */
function WeightRow({ label, color, portfolio, benchmark, hasBenchmark, maxForScale }) {
  const portPct = Math.max(0, portfolio || 0);
  const bmPct = Math.max(0, benchmark || 0);
  const diff = (hasBenchmark && portfolio !== null && benchmark !== null)
    ? portPct - bmPct : null;
  const scale = maxForScale > 0 ? maxForScale : 1;

  const diffColor = diff === null ? undefined
    : diff >= 0.25 ? "#166534"
    : diff <= -0.25 ? "#dc2626"
    : "#64748b";

  return (
    <div className="grid grid-cols-[140px_1fr_70px] items-center gap-2 py-1 text-xs border-b border-slate-100 dark:border-slate-800">
      <div className="truncate font-medium" style={{ color }} title={label}>{label}</div>
      <div>
        {/* Portfolio bar */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <div className="flex-1 h-2.5 rounded-sm bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full" style={{ width: Math.min(100, (portPct / scale) * 100) + "%", background: color }} />
          </div>
          <div className="w-12 text-right font-mono text-[10px] text-gray-700 dark:text-slate-300">
            {portPct.toFixed(1)}%
          </div>
        </div>
        {/* Benchmark bar */}
        {hasBenchmark && (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-2 rounded-sm bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full bg-slate-400 dark:bg-slate-500"
                   style={{ width: Math.min(100, (bmPct / scale) * 100) + "%" }} />
            </div>
            <div className="w-12 text-right font-mono text-[10px] text-gray-500 dark:text-slate-400">
              {bmPct.toFixed(1)}%
            </div>
          </div>
        )}
      </div>
      <div className="text-right font-mono text-[11px] font-semibold" style={{ color: diffColor }}>
        {diff === null ? "" : (diff >= 0 ? "+" : "") + diff.toFixed(1)}
      </div>
    </div>
  );
}

/* Aggregate a country-weight map into region weights. Uses COUNTRY_GROUPS
 * (country -> group key) and REGION_GROUPS (region -> [group keys]). */
function aggregateToRegions(countryMap) {
  if (!countryMap) return {};
  const regionByGroup = {};
  Object.keys(REGION_GROUPS).forEach(function (region) {
    REGION_GROUPS[region].forEach(function (grp) { regionByGroup[grp] = region; });
  });
  const out = {};
  Object.keys(REGION_GROUPS).forEach(function (r) { out[r] = 0; });
  Object.keys(countryMap).forEach(function (country) {
    const grp = COUNTRY_GROUPS[country];
    if (!grp) return;
    const region = regionByGroup[grp];
    if (!region) return;
    out[region] += countryMap[country] || 0;
  });
  return out;
}

export default function BreakdownView({ kind }) {
  /* kind = "sectors" | "countries" */
  const { companies, repData, fxRates, benchmarkWeights } = useCompanyContext();
  const [portKey, setPortKey] = useState(PORTFOLIOS[0] || "GL");
  const [bmType, setBmType] = useState("core"); /* "core" | "value" */
  /* Column sort: null = default (portfolio weight desc). Otherwise
     {col:"diff", dir:"desc"|"asc"}. Click cycle: default -> desc -> asc
     -> default. Tracked separately for the main country/sector table
     and (on country view) the region table above it. */
  const [sort, setSort] = useState(null);
  const [regionSort, setRegionSort] = useState(null);

  /* Figure out which portfolios exist with any rep data (to avoid showing
   * empty tabs). */
  const availablePorts = useMemo(function () {
    return PORTFOLIOS.filter(function (p) {
      const pRep = (repData || {})[p] || {};
      return Object.keys(pRep).length > 0;
    });
  }, [repData]);

  const breakdown = useMemo(function () {
    return calcBreakdowns(companies, repData, fxRates, portKey);
  }, [companies, repData, fxRates, portKey]);

  const benchName = (BENCHMARKS[portKey] || {})[bmType];
  const benchData = benchmarkWeights && benchName ? benchmarkWeights[benchName] : null;
  const hasBenchmark = !!(benchData && ((kind === "sectors" ? benchData.sectors : benchData.countries)));

  /* Rows: union of portfolio keys + benchmark keys. Sort depends on
   * `sort` state (default = portfolio weight desc; diff = sort by
   * delta ascending or descending). Rows with no benchmark delta
   * always sink when diff-sorting. */
  const rows = useMemo(function () {
    const portMap = kind === "sectors" ? (breakdown.sectors || {}) : (breakdown.countries || {});
    const bmMap = hasBenchmark ? (kind === "sectors" ? benchData.sectors : benchData.countries) : {};
    const allKeys = new Set([...Object.keys(portMap), ...Object.keys(bmMap)]);
    const list = Array.from(allKeys).map(function (k) {
      const p = portMap[k] !== undefined ? portMap[k] : 0;
      const b = bmMap[k] !== undefined ? bmMap[k] : null;
      return { label: k, portfolio: p, benchmark: b, diff: (b !== null ? p - b : null) };
    });
    if (sort && sort.col === "diff" && hasBenchmark) {
      const mult = sort.dir === "asc" ? 1 : -1;
      list.sort(function (a, b) {
        if (a.diff === null && b.diff === null) return 0;
        if (a.diff === null) return 1;
        if (b.diff === null) return -1;
        return mult * (a.diff - b.diff);
      });
    } else {
      /* Default: portfolio weight desc, benchmark as tiebreak. */
      list.sort(function (a, b) {
        const pa = a.portfolio || 0, pb = b.portfolio || 0;
        if (Math.abs(pa - pb) > 0.01) return pb - pa;
        return (b.benchmark || 0) - (a.benchmark || 0);
      });
    }
    return list;
  }, [breakdown, hasBenchmark, benchData, kind, sort]);

  /* Region aggregation (Country Breakdown only). Default sort is by
     portfolio weight desc; regionSort overrides with diff asc/desc. */
  const regionRows = useMemo(function () {
    if (kind !== "countries") return null;
    const portRegion = aggregateToRegions(breakdown.countries || {});
    const bmRegion = hasBenchmark ? aggregateToRegions(benchData.countries) : {};
    const order = Object.keys(REGION_GROUPS);
    const list = order.map(function (r) {
      const p = portRegion[r] || 0;
      const b = hasBenchmark ? (bmRegion[r] || 0) : null;
      return { label: r, portfolio: p, benchmark: b, diff: (b !== null ? p - b : null) };
    });
    if (regionSort && regionSort.col === "diff" && hasBenchmark) {
      const mult = regionSort.dir === "asc" ? 1 : -1;
      list.sort(function (a, b) {
        if (a.diff === null && b.diff === null) return 0;
        if (a.diff === null) return 1;
        if (b.diff === null) return -1;
        return mult * (a.diff - b.diff);
      });
    } else {
      list.sort(function (a, b) {
        const pa = a.portfolio || 0, pb = b.portfolio || 0;
        if (Math.abs(pa - pb) > 0.01) return pb - pa;
        return (b.benchmark || 0) - (a.benchmark || 0);
      });
    }
    return list;
  }, [breakdown, hasBenchmark, benchData, kind, regionSort]);

  function cycleDiffSort(setter) {
    if (!hasBenchmark) return;
    setter(function (prev) {
      if (!prev || prev.col !== "diff") return { col: "diff", dir: "desc" };
      if (prev.dir === "desc") return { col: "diff", dir: "asc" };
      return null; /* third click — back to default */
    });
  }
  function handleDiffHeaderClick() { cycleDiffSort(setSort); }
  function handleRegionDiffHeaderClick() { cycleDiffSort(setRegionSort); }

  const maxForScale = rows.reduce(function (m, r) {
    return Math.max(m, r.portfolio || 0, r.benchmark || 0);
  }, 1);

  function colorFor(label) {
    if (kind === "sectors") {
      const sc = SECTOR_COLORS[label];
      return sc ? sc.color : "#334155";
    }
    const g = COUNTRY_GROUPS[label];
    return g ? COUNTRY_COLORS[g].color : "#334155";
  }

  return (
    <div>
      {/* Portfolio tabs */}
      <div className="flex gap-1 mb-3 border-b border-slate-200 dark:border-slate-700 pb-2 flex-wrap">
        {(availablePorts.length > 0 ? availablePorts : PORTFOLIOS).map(function (p) {
          return (
            <button key={p} type="button" onClick={function () { setPortKey(p); }}
                    className={portKey === p ? TABST_ACTIVE : TABST_INACTIVE}>
              {p}
            </button>
          );
        })}
      </div>

      {/* Benchmark toggle + summary header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="text-sm text-gray-700 dark:text-slate-300">
          <span className="font-semibold">{portKey}</span>
          {breakdown.totalMV > 0 && (
            <span className="text-xs text-gray-500 dark:text-slate-400 ml-2">
              Rep AUM: ${breakdown.totalMV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          )}
        </div>
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

      {!hasBenchmark && (
        <div className="text-[11px] text-gray-500 dark:text-slate-400 italic mb-2 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          No {kind} weights uploaded for "{benchName || "—"}" yet. Upload via Data Hub → Benchmarks to see the comparison.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-slate-400 italic py-4">
          No rep holdings for this portfolio yet.
        </div>
      ) : (
        <div>
          {/* Region Breakdown — country tab only */}
          {kind === "countries" && regionRows && (
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold mb-1">Region Breakdown</div>
              <div className="grid grid-cols-[140px_1fr_70px] gap-2 pb-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700 mb-1">
                <div>Region</div>
                <div>{hasBenchmark ? "Portfolio / Benchmark" : "Portfolio weight"}</div>
                <div
                  onClick={hasBenchmark ? handleRegionDiffHeaderClick : undefined}
                  className={"text-right " + (hasBenchmark ? "cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 select-none" : "")}
                  title={hasBenchmark ? "Click to sort by over/under-weight (3 states: desc / asc / default)" : undefined}
                >
                  {hasBenchmark
                    ? "+/−" + (regionSort && regionSort.col === "diff" ? (regionSort.dir === "asc" ? " ↑" : " ↓") : "")
                    : ""}
                </div>
              </div>
              {(function () {
                const regionMax = regionRows.reduce(function (m, r) {
                  return Math.max(m, r.portfolio || 0, r.benchmark || 0);
                }, 1);
                return regionRows.map(function (r) {
                  return (
                    <WeightRow
                      key={r.label}
                      label={r.label}
                      color={REGION_COLORS[r.label] || "#334155"}
                      portfolio={r.portfolio}
                      benchmark={r.benchmark}
                      hasBenchmark={hasBenchmark}
                      maxForScale={regionMax}
                    />
                  );
                });
              })()}
            </div>
          )}

          {/* Main rows (sectors or countries) */}
          {kind === "countries" && (
            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold mb-1">Country Breakdown</div>
          )}
          <div className="grid grid-cols-[140px_1fr_70px] gap-2 pb-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700 mb-1">
            <div>{kind === "sectors" ? "Sector" : "Country"}</div>
            <div>{hasBenchmark ? "Portfolio / Benchmark" : "Portfolio weight"}</div>
            <div
              onClick={hasBenchmark ? handleDiffHeaderClick : undefined}
              className={"text-right " + (hasBenchmark ? "cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 select-none" : "")}
              title={hasBenchmark ? "Click to sort by over/under-weight (3 states: desc / asc / default)" : undefined}
            >
              {hasBenchmark
                ? "+/−" + (sort && sort.col === "diff" ? (sort.dir === "asc" ? " ↑" : " ↓") : "")
                : ""}
            </div>
          </div>
          {rows.map(function (r) {
            return (
              <WeightRow
                key={r.label}
                label={r.label}
                color={colorFor(r.label)}
                portfolio={r.portfolio}
                benchmark={r.benchmark}
                hasBenchmark={hasBenchmark}
                maxForScale={maxForScale}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
