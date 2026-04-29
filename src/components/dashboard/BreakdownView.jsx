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
import BreakdownHistoryChart from './BreakdownHistoryChart.jsx';

const TABST_ACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-blue-600 text-gray-900 dark:text-slate-100 font-semibold cursor-pointer bg-transparent";
const TABST_INACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-transparent text-gray-500 dark:text-slate-400 cursor-pointer bg-transparent hover:text-gray-700 dark:hover:text-slate-300";

/* Single row for one sector/country — two side-by-side horizontal bars
 * for portfolio vs benchmark, plus a numeric delta on the right. Bars
 * share the same scale (max = bigger of the two in the row). */
function WeightRow({ label, color, portfolio, benchmark, hasBenchmark, maxForScale, contributors }) {
  const portPct = Math.max(0, portfolio || 0);
  const bmPct = Math.max(0, benchmark || 0);
  const diff = (hasBenchmark && portfolio !== null && benchmark !== null)
    ? portPct - bmPct : null;
  const scale = maxForScale > 0 ? maxForScale : 1;

  const diffColor = diff === null ? undefined
    : diff >= 0.25 ? "#166534"
    : diff <= -0.25 ? "#dc2626"
    : "#64748b";

  /* Total bar width as % of the row's scale slot. We then split the
     SAME width amount across the contributing holdings — so the bar
     length still represents the aggregate portfolio weight, but with
     vertical hairlines marking each company's contribution. */
  const totalBarPct = Math.min(100, (portPct / scale) * 100);
  const usable = contributors && contributors.length > 0
    ? contributors.reduce(function (s, c) { return s + (c.weight || 0); }, 0)
    : 0;

  return (
    <div className="grid grid-cols-[140px_1fr_70px] items-center gap-2 py-1 text-xs border-b border-slate-100 dark:border-slate-800">
      <div className="truncate font-medium" style={{ color }} title={label}>{label}</div>
      <div>
        {/* Portfolio bar — segmented by holding when contributors are passed */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <div className="flex-1 h-2.5 rounded-sm bg-slate-100 dark:bg-slate-800 overflow-hidden">
            {contributors && contributors.length > 0 && usable > 0 ? (
              <div className="flex h-full" style={{ width: totalBarPct + "%" }}>
                {contributors.map(function (co, i) {
                  /* Each segment's share of the parent bar = its weight as
                     a fraction of the row's total weight. */
                  const seg = (co.weight / usable) * 100;
                  return (
                    <div
                      key={co.id || co.name || i}
                      style={{
                        width: seg + "%",
                        background: color,
                        borderRight: i < contributors.length - 1
                          ? "1px solid rgba(255,255,255,0.55)"
                          : undefined,
                      }}
                      title={co.name + " — " + co.weight.toFixed(2) + "%"}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="h-full" style={{ width: totalBarPct + "%", background: color }} />
            )}
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

/* For a sector/country/region row, return the list of holdings whose
 * combined weight makes up the row total. Sorted by weight desc.
 *
 * `byCompany` comes from calcBreakdowns; each entry has {id, name,
 * sector, country, mv, portfolio}. `totalMV` is the portfolio's
 * aggregate USD MV (so weight = mv/totalMV*100).  */
function contributorsFor(byCompany, totalMV, kind, label, regionByGroup) {
  if (!byCompany || !byCompany.length || !(totalMV > 0)) return [];
  let filtered;
  if (kind === "sectors") {
    filtered = byCompany.filter(function (c) { return c.sector === label; });
  } else if (kind === "countries") {
    filtered = byCompany.filter(function (c) { return c.country === label; });
  } else if (kind === "region") {
    filtered = byCompany.filter(function (c) {
      const g = COUNTRY_GROUPS[c.country];
      return g && regionByGroup[g] === label;
    });
  } else {
    return [];
  }
  return filtered.map(function (c) {
    return { id: c.id, name: c.name, weight: (c.mv / totalMV) * 100 };
  }).sort(function (a, b) { return b.weight - a.weight; });
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
  const { companies, repData, fxRates, benchmarkWeights, breakdownHistory } = useCompanyContext();
  const [portKey, setPortKey] = useState(PORTFOLIOS[0] || "GL");
  const [bmType, setBmType] = useState("core"); /* "core" | "value" */
  /* Column sort: null = default (portfolio weight desc). Otherwise
     {col:"diff", dir:"desc"|"asc"}. Click cycle: default -> desc -> asc
     -> default. Tracked separately for the main country/sector table
     and (on country view) the region table above it. */
  const [sort, setSort] = useState(null);
  const [regionSort, setRegionSort] = useState(null);
  /* History view mode. "current" shows the existing single-snapshot
     comparison bars. "history" reveals the three quarterly-history charts
     (portfolio sand chart, benchmark sand chart, diff lines). */
  const [viewMode, setViewMode] = useState("current");

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
          <span className="text-gray-300 dark:text-slate-600 mx-1">|</span>
          {/* Current vs. history toggle. Disabled if no history exists for
              either side, with a note pointing at the upload format. */}
          {["current", "history"].map(function (m) {
            const active = viewMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={function () { setViewMode(m); }}
                className={"px-2 py-0.5 rounded-full border transition-colors " +
                  (active
                    ? "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-700 dark:border-slate-200"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")}
              >
                {m === "current" ? "Current" : "History"}
              </button>
            );
          })}
        </div>
      </div>

      {!hasBenchmark && viewMode === "current" && (
        <div className="text-[11px] text-gray-500 dark:text-slate-400 italic mb-2 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          No {kind} weights uploaded for "{benchName || "—"}" yet. Upload via Data Hub → Benchmarks to see the comparison.
        </div>
      )}

      {viewMode === "history" ? (
        <HistoryBlock
          kind={kind}
          portKey={portKey}
          benchName={benchName}
          history={breakdownHistory}
          colorFor={colorFor}
        />
      ) : rows.length === 0 ? (
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
                /* Pre-compute country-group → region map once for the
                   region contributor lookups. */
                const regionByGroup = {};
                Object.keys(REGION_GROUPS).forEach(function (region) {
                  REGION_GROUPS[region].forEach(function (g) { regionByGroup[g] = region; });
                });
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
                      contributors={contributorsFor(breakdown.byCompany, breakdown.totalMV, "region", r.label, regionByGroup)}
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
                contributors={contributorsFor(breakdown.byCompany, breakdown.totalMV, kind, r.label)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* History view — three stacked sections:
 *   1. Portfolio sand chart (history[portKey])
 *   2. Benchmark sand chart (history[benchName])
 *   3. Diff line chart (portKey - benchName, only renders if both exist)
 *
 * Each section has its own empty-state pointer so it's obvious which data
 * is missing. We use ranked sort/legend internally; the X axis is quarters. */
function HistoryBlock({ kind, portKey, benchName, history, colorFor }) {
  const bucket = kind === "sectors" ? "sectors" : "countries";
  const portHistory = history && history[portKey];
  const benchHistory = benchName && history && history[benchName];
  const portCount = portHistory ? Object.keys(portHistory).length : 0;
  const benchCount = benchHistory ? Object.keys(benchHistory).length : 0;
  const overlapCount = portHistory && benchHistory
    ? Object.keys(portHistory).filter(function (d) { return benchHistory[d]; }).length : 0;

  const HEADER_CLS = "text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold mb-1 mt-3 flex items-center gap-2";
  const COUNT_CLS  = "text-[10px] font-normal text-gray-400 dark:text-slate-500";

  return (
    <div>
      <div className={HEADER_CLS}>
        Portfolio: {portKey} — {kind === "sectors" ? "Sector" : "Country"} weights through time
        <span className={COUNT_CLS}>{portCount} quarter(s)</span>
      </div>
      {portCount > 0 ? (
        <BreakdownHistoryChart
          history={history}
          primaryName={portKey}
          benchName={benchName}
          bucket={bucket}
          view="stacked-port"
          colorFor={colorFor}
        />
      ) : (
        <div className="text-xs italic text-gray-500 dark:text-slate-400 py-3">
          No history uploaded for portfolio "{portKey}" yet.
        </div>
      )}

      <div className={HEADER_CLS}>
        Benchmark: {benchName || "—"} — {kind === "sectors" ? "Sector" : "Country"} weights through time
        <span className={COUNT_CLS}>{benchCount} quarter(s)</span>
      </div>
      {benchCount > 0 ? (
        <BreakdownHistoryChart
          history={history}
          primaryName={benchName}
          benchName={benchName}
          bucket={bucket}
          view="stacked-bench"
          colorFor={colorFor}
        />
      ) : (
        <div className="text-xs italic text-gray-500 dark:text-slate-400 py-3">
          No history uploaded for benchmark "{benchName || "—"}" yet.
        </div>
      )}

      <div className={HEADER_CLS}>
        Over/Under-weight vs {benchName || "benchmark"} — {kind === "sectors" ? "by sector" : "by country"}
        <span className={COUNT_CLS}>{overlapCount} matching quarter(s)</span>
      </div>
      {overlapCount > 0 ? (
        <BreakdownHistoryChart
          history={history}
          primaryName={portKey}
          benchName={benchName}
          bucket={bucket}
          view="diff"
          colorFor={colorFor}
        />
      ) : (
        <div className="text-xs italic text-gray-500 dark:text-slate-400 py-3">
          Need history for both {portKey} and {benchName || "—"} on the same date(s) to draw the diff.
        </div>
      )}
    </div>
  );
}
