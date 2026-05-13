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
import { BENCHMARKS, PORTFOLIOS, getBenchSlot } from '../../constants/index.js';
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

/* Combined-portfolio button definitions. FIN and IN share the
   ACWI ex US (Core/Value) benchmarks, FGL and GL share ACWI
   (Core/Value), so the user wants them merged into single buttons.
   EM and SC remain solo. `ports[0]` is the "primary" used for
   benchmark + uploaded-history lookups; calcBreakdowns pools both. */
const PORT_BUTTONS = [
  { id: "intl",   label: "Int'l",  ports: ["FIN", "IN"] },
  { id: "global", label: "Global", ports: ["FGL", "GL"] },
  { id: "EM",     label: "EM",     ports: ["EM"] },
  { id: "SC",     label: "SC",     ports: ["SC"] },
];

export default function CharacteristicsView() {
  const { companies, repData, fxRates, benchmarkWeights, breakdownHistory } = useCompanyContext();
  const [portKey, setPortKey] = useState("intl");
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

  /* Resolve the selected button to its constituent portfolio codes
     and a "primary" used for benchmark / uploaded-history lookups. */
  const activeBtn = PORT_BUTTONS.find(function (b) { return b.id === portKey; }) || PORT_BUTTONS[0];
  const activePorts = activeBtn.ports;
  const primaryPort = activePorts[0];

  /* Only show buttons whose constituent portfolios have any rep
     holdings. (A new firm without an IN rep account, say, shouldn't
     see an "Int'l" tab that just shows FIN.) */
  const availableButtons = useMemo(function () {
    return PORT_BUTTONS.filter(function (b) {
      return b.ports.some(function (p) {
        const pRep = (repData || {})[p] || {};
        return Object.keys(pRep).length > 0;
      });
    });
  }, [repData]);

  /* Per-port breakdown — one call per constituent so each port's
     weighted-avg metric can be shown as its own column rather than
     pooled. The breakdown.totalMV used for the header AUM is the sum
     across all active ports. */
  const breakdownByPort = useMemo(function () {
    const out = {};
    activePorts.forEach(function (p) {
      out[p] = calcBreakdowns(companies, repData, fxRates, p);
    });
    return out;
  }, [companies, repData, fxRates, activePorts]);
  const breakdown = useMemo(function () {
    /* Aggregate AUM + flat byCompany list for any code path that still
       expects a single combined view (header AUM, empty-state check). */
    let totalMV = 0;
    let byCompany = [];
    activePorts.forEach(function (p) {
      const b = breakdownByPort[p];
      if (!b) return;
      totalMV += b.totalMV || 0;
      byCompany = byCompany.concat(b.byCompany || []);
    });
    return { totalMV: totalMV, byCompany: byCompany };
  }, [breakdownByPort, activePorts]);

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
  /* Buttons that combine portfolios always combine ones with
     identical benchmarks (Int'l = FIN+IN both use ACWI ex US;
     Global = FGL+GL both use ACWI). So benchmark lookup against
     the primary port is correct for the whole group. */
  const coreBench  = (BENCHMARKS[primaryPort] || {}).core  || null;
  const valueBench = (BENCHMARKS[primaryPort] || {}).value || null;
  const coreData   = coreBench  && benchmarkWeights ? benchmarkWeights[coreBench]  : null;
  const valueData  = valueBench && benchmarkWeights ? benchmarkWeights[valueBench] : null;
  function latestMetrics(name) {
    if (!name) return null;
    /* Resolve through getBenchSlot so a benchmark uploaded under its
       FactSet ID ("106039") still finds the data when we ask for the
       canonical name ("ACWI Value"). */
    const byDate = getBenchSlot(breakdownHistory, name);
    if (!byDate) return null;
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
  /* Use getBenchSlot so a benchmark uploaded under its FactSet ID
     ("106039") is still found when looking up by canonical name
     ("ACWI Value"). Without this, data uploaded by ID never surfaces
     on this view. */
  const coreRatios  = useMemo(function () {
    if (!coreBench || !ratioDate) return null;
    const byDate = getBenchSlot(breakdownHistory, coreBench) || {};
    const slot = byDate[ratioDate];
    return (slot && slot.ratios) || null;
  }, [breakdownHistory, coreBench, ratioDate]);
  const valueRatios = useMemo(function () {
    if (!valueBench || !ratioDate) return null;
    const byDate = getBenchSlot(breakdownHistory, valueBench) || {};
    const slot = byDate[ratioDate];
    return (slot && slot.ratios) || null;
  }, [breakdownHistory, valueBench, ratioDate]);
  const hasCoreRatios  = !!(coreRatios  && Object.keys(coreRatios).length  > 0);
  const hasValueRatios = !!(valueRatios && Object.keys(valueRatios).length > 0);
  const hasRatios = hasCoreRatios || hasValueRatios;
  /* User-requested section grouping. Keys not listed here fall under
     "Other" at the bottom so nothing disappears silently. */
  const RATIO_GROUPS = [
    { label: "Size",          keys: ["mcWtdAvg","avgMktCap","medMktCap","mcLargest","mcSmallest","nHoldings","activeShare"] },
    { label: "Valuation",     keys: ["fwdPe","pe","peExcl","pb","pbLtm","ps","pcf","fcfYld","divYld","payout"] },
    { label: "Profitability", keys: ["roe","roe5y","intGr","grMgn","netMgn","gpAss","npAss","opROE","epsGrFwd1","epsGrFwd35","epsGrHist3","adpsGr5","adpsGr1"] },
    { label: "Balance Sheet", keys: ["netDE","debtCap","intCov"] },
  ];

  const ratioRows = useMemo(function () {
    return RATIO_DEFS.map(function (def) {
      /* One value per active port — live aggregate from holdings, with
         the quarterly upload as fallback. */
      const ports = {}; /* port code → { value, source } */
      activePorts.forEach(function (p) {
        const b = breakdownByPort[p];
        const live = b ? aggregatePortfolioRatio(b.byCompany, companiesById, def) : { value: null };
        if (live.value !== null) {
          ports[p] = { value: live.value, source: "live" };
        } else {
          const uploaded = uploadedPortfolioRatio(breakdownHistory, p, ratioDate, def.key);
          if (uploaded !== null && uploaded !== undefined) {
            ports[p] = { value: uploaded, source: "quarter" };
          } else {
            ports[p] = { value: null, source: "none" };
          }
        }
      });
      const cv = coreRatios  && (def.key in coreRatios)  ? coreRatios[def.key]  : null;
      const vv = valueRatios && (def.key in valueRatios) ? valueRatios[def.key] : null;
      return {
        key: def.key,
        label: def.label,
        kind: def.kind,
        direction: def.direction,
        ports: ports,
        core: cv,
        value: vv,
      };
    });
  }, [breakdownByPort, companiesById, coreRatios, valueRatios, breakdownHistory, activePorts, ratioDate]);

  const empty = breakdown.byCompany.length === 0;

  /* Single ratio row — extracted so the grouped/flat call sites both
     use the same markup. Grid columns are fixed-width so the label
     stays adjacent to its values (1fr was pushing values to the far
     right of the available space — felt detached on wide screens). */
  /* Grid template: 220px label + 90px per port + 90px Core + 90px Value.
     Computed once and reused by header + body rows so they stay aligned. */
  const gridCols = "220px " + activePorts.map(function () { return "90px"; }).join(" ") + " 90px 90px";
  function renderRatioRow(r) {
    const isOpen = openRatios.has(r.key);
    /* Source badge uses the FIRST port's source as the row-level
       indicator (live vs Q-end). Per-port badges would clutter the
       UI; the first port is "primary" and represents the row. */
    const firstSource = (r.ports[activePorts[0]] || {}).source;
    const sourceBadge = firstSource === "live" ? (
      <span className="text-[8px] uppercase tracking-wide font-semibold px-1 py-0 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shrink-0" title="Live: rolled up from current holdings">live</span>
    ) : firstSource === "quarter" && ratioDate ? (
      <span className="text-[8px] uppercase tracking-wide font-semibold px-1 py-0 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shrink-0" title={"Q-end snapshot from uploaded portfolio history (" + ratioDate + ")"}>{quarterShort(ratioDate)}</span>
    ) : null;
    /* Bench delta color: when multiple ports, compare against the
       first port (any port works since they share benchmarks). */
    const primaryVal = (r.ports[activePorts[0]] || {}).value;
    return (
      <div key={r.key}>
        <div
          onClick={function () { toggleRatio(r.key); }}
          className="grid gap-1 px-2 py-1.5 text-xs items-center border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
          style={{ gridTemplateColumns: gridCols }}
          title="Click to toggle history chart"
        >
          <div className="text-gray-900 dark:text-slate-100 truncate flex items-center gap-1.5">
            <span className="text-gray-400 dark:text-slate-500 text-[9px]">{isOpen ? "▼" : "▶"}</span>
            <span className="truncate" title={r.label}>{r.label}</span>
            {sourceBadge}
          </div>
          {activePorts.map(function (p) {
            const pv = (r.ports[p] || {}).value;
            return (
              <div key={p} className="text-right font-medium text-gray-900 dark:text-slate-100 tabular-nums">
                {fmtMetric(pv, r.kind)}
              </div>
            );
          })}
          <div
            className="text-right tabular-nums"
            style={{ color: ratioBenchColor(primaryVal, r.core, r.kind, r.direction) }}
            title={"Δ port − bench: " + (fmtDelta(primaryVal, r.core, r.kind) || "--")}
          >
            {r.core === null || r.core === undefined ? "--" : fmtMetric(r.core, r.kind)}
          </div>
          <div
            className="text-right tabular-nums"
            style={{ color: ratioBenchColor(primaryVal, r.value, r.kind, r.direction) }}
            title={"Δ port − bench: " + (fmtDelta(primaryVal, r.value, r.kind) || "--")}
          >
            {r.value === null || r.value === undefined ? "--" : fmtMetric(r.value, r.kind)}
          </div>
        </div>
        {isOpen && (
          <div className="px-2 py-1 border-b border-slate-100 dark:border-slate-800">
            <RatioHistoryChart
              history={breakdownHistory}
              portKey={primaryPort}
              coreBench={coreBench}
              valueBench={valueBench}
              ratioKey={r.key}
              kind={r.kind}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Portfolio tabs — combined buttons (Int'l = FIN+IN, Global =
          FGL+GL) plus the solo EM and SC. Constituents shown in a
          sub-label so the pooling is obvious. */}
      <div className="flex gap-1 mb-3 border-b border-slate-200 dark:border-slate-700 pb-2 flex-wrap">
        {(availableButtons.length > 0 ? availableButtons : PORT_BUTTONS).map(function (b) {
          return (
            <button
              key={b.id}
              type="button"
              onClick={function () { setPortKey(b.id); }}
              className={portKey === b.id ? TABST_ACTIVE : TABST_INACTIVE}
              title={b.ports.length > 1 ? "Combined " + b.ports.join(" + ") : b.ports[0]}
            >
              {b.label}{b.ports.length > 1 && <span className="ml-1 text-[10px] text-gray-400 dark:text-slate-500 font-normal">({b.ports.join("+")})</span>}
            </button>
          );
        })}
      </div>

      {/* Header row: AUM + benchmarks shown. Core/Value toggle and
          LTM/+1/+2 horizon toggle are both gone — every variant renders
          as its own row so all values are visible at once. */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="text-sm text-gray-700 dark:text-slate-300">
          <span className="font-semibold">{activeBtn.label}</span>
          {activePorts.length > 1 && <span className="text-xs text-gray-500 dark:text-slate-400 ml-1.5">({activePorts.join(" + ")})</span>}
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
                <div
                  className="grid gap-1 px-2 py-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <div>Metric</div>
                  {activePorts.map(function (p) {
                    return <div key={p} className="text-right" title={"Portfolio " + p}>{p}</div>;
                  })}
                  <div className="text-right" title={coreBench  || "Core benchmark"}>Core</div>
                  <div className="text-right" title={valueBench || "Value benchmark"}>Value</div>
                </div>
                {(function () {
                  /* Bucket ratio rows by group, plus an "Other" bucket
                     for keys not in any group so nothing is lost. */
                  const byKey = {};
                  ratioRows.forEach(function (r) { byKey[r.key] = r; });
                  const claimed = new Set();
                  const groupBlocks = RATIO_GROUPS.map(function (g) {
                    const rows = g.keys.map(function (k) { claimed.add(k); return byKey[k]; }).filter(Boolean);
                    return { label: g.label, rows: rows };
                  });
                  const leftover = ratioRows.filter(function (r) { return !claimed.has(r.key); });
                  if (leftover.length > 0) groupBlocks.push({ label: "Other", rows: leftover });
                  return groupBlocks.filter(function (g) { return g.rows.length > 0; }).map(function (g) {
                    return [
                      <div key={"hdr-" + g.label} className="px-2 py-1 text-[10px] uppercase tracking-wide font-semibold text-gray-600 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                        {g.label}
                      </div>,
                      ...g.rows.map(function (r) { return renderRatioRow(r); }),
                    ];
                  });
                })()}
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
