/* Cross-company guidance comparison.
 *
 * Pick a metric (typeahead populated from every distinct Item across
 * all companies' c.guidance.history). For each company that tracks
 * that metric, renders a sortable row showing — for the company's
 * most-relevant FY (upcoming or just-closed) — the latest
 * mid-guidance Y/Y, direction vs prior announcement, latest issue
 * date, and a sparkline of the Y/Y mid evolution.
 *
 * Defaults from the v1 spec:
 *   - Single metric (typeahead)
 *   - Most-recent-FY per company (mixes calendar dates across rows;
 *     honest data, not normalized)
 *   - Portfolio filter reuses the existing portfolio code list
 *
 * Click a row → opens that company's Guidance tab.
 */

import { useState, useMemo } from "react";
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { isFiniteNum } from '../../utils/numbers.js';
import { parseDate } from '../../utils/index.js';
import { fmtMoney } from '../../utils/chart.js';
import { PORTFOLIOS } from '../../constants/index.js';

const ARROW_COLOR = { up: "#16a34a", down: "#dc2626", flat: "#94a3b8", none: "#94a3b8" };
const ARROW_GLYPH = { up: "▲", down: "▼", flat: "—", none: "·" };

function fyLabel(periodIso) {
  const m = /^(\d{4})-/.exec(periodIso || "");
  return m ? "FY" + m[1].slice(2) : (periodIso || "");
}

function fmtPct(v, dp) {
  if (!isFiniteNum(v)) return "—";
  const d = dp == null ? 1 : dp;
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(d) + "%";
}

function fmtDateShort(iso) {
  const d = parseDate(iso);
  if (!d || isNaN(d.getTime())) return iso || "";
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short" });
}

function priorFyEnd(period) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period || "");
  if (!m) return null;
  return (parseInt(m[1], 10) - 1) + "-" + m[2] + "-" + m[3];
}

function midOf(r) {
  if (!r) return null;
  if (isFiniteNum(r.low) && isFiniteNum(r.high)) return (r.low + r.high) / 2;
  return isFiniteNum(r.low) ? r.low : (isFiniteNum(r.high) ? r.high : null);
}

/* For one company, find the most relevant FY for `metric`:
 *   1. Smallest period >= today that has data for the metric
 *   2. Else most recent closed period (within 365 days) with data
 * Returns the period ISO or null. */
function chooseRelevantFy(history, metric) {
  if (!history || history.length === 0) return null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const staleMs = Date.now() - 365 * 24 * 3600 * 1000;
  let upcoming = null, closed = null;
  history.forEach(function (r) {
    if (r.item !== metric || !r.period) return;
    if (r.period >= todayStr) {
      if (!upcoming || r.period < upcoming) upcoming = r.period;
    } else {
      const d = parseDate(r.period);
      if (!d || d.getTime() < staleMs) return;
      if (!closed || r.period > closed) closed = r.period;
    }
  });
  return upcoming || closed;
}

/* Build a per-company row for the chosen metric, or null if the
 * company doesn't track it (or no usable Y/Y baseline). */
function buildRow(company, metric) {
  const history = (company && company.guidance && company.guidance.history) || [];
  if (history.length === 0) return null;
  const period = chooseRelevantFy(history, metric);
  if (!period) return null;

  const rs = history
    .filter(function (r) { return r.item === metric && r.period === period; })
    .sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });
  if (rs.length === 0) return null;

  /* Y/Y baseline = prior FY's actual for this metric, falling back to
     null when not yet realized. */
  const prior = priorFyEnd(period);
  const priorRow = prior ? history.find(function (r) {
    return r.period === prior && r.item === metric && isFiniteNum(r.actual);
  }) : null;
  const baseline = priorRow ? priorRow.actual : null;

  /* Y/Y for each row's midpoint. */
  const yoyValues = rs.map(function (r) {
    const m = midOf(r);
    return (isFiniteNum(m) && isFiniteNum(baseline) && baseline > 0)
      ? m / baseline - 1
      : null;
  });
  const last = rs[rs.length - 1];
  const lastYoy = yoyValues[yoyValues.length - 1];
  const prevYoy = yoyValues.length > 1 ? yoyValues[yoyValues.length - 2] : null;
  let arrow = "none";
  if (isFiniteNum(prevYoy) && isFiniteNum(lastYoy)) {
    if (lastYoy > prevYoy + 0.001) arrow = "up";
    else if (lastYoy < prevYoy - 0.001) arrow = "down";
    else arrow = "flat";
  }

  return {
    companyId: company.id,
    companyName: company.name,
    period: period,
    isClosed: period < new Date().toISOString().slice(0, 10),
    rows: rs,           /* full guidance row history for sparkline */
    yoyValues: yoyValues,
    lastYoy: lastYoy,
    arrow: arrow,
    lastDate: last && last.date,
    lastLow: last && last.low,
    lastHigh: last && last.high,
    lastMid: last && midOf(last),
    baseline: baseline,
    currency: (function () {
      const ord = (company.tickers || []).find(function (t) { return t.isOrdinary; });
      return (ord && ord.currency) || "";
    })(),
  };
}

/* Tiny SVG sparkline for the Y/Y midpoint trajectory across
 * announcements within the chosen FY. Always draws over the same
 * vertical range (min/max of the row's own Y/Y values, padded). */
function Sparkline({ values, width, height }) {
  const finite = values.filter(isFiniteNum);
  if (finite.length === 0) {
    return <svg width={width} height={height}/>;
  }
  if (finite.length === 1) {
    return (
      <svg width={width} height={height}>
        <circle cx={width / 2} cy={height / 2} r={2} fill="#64748b"/>
      </svg>
    );
  }
  const min = Math.min.apply(null, finite);
  const max = Math.max.apply(null, finite);
  const span = (max - min) || 0.01;
  const yOf = function (v) { return height - 4 - ((v - min) / span) * (height - 8); };
  const xOf = function (i) { return 2 + (i / (values.length - 1)) * (width - 4); };
  const last = finite[finite.length - 1];
  const stroke = last >= 0 ? "#16a34a" : "#dc2626";
  /* Build path with finite points only; non-finite breaks the line. */
  let pathD = "";
  let pen = false;
  values.forEach(function (v, i) {
    if (!isFiniteNum(v)) { pen = false; return; }
    const x = xOf(i), y = yOf(v);
    pathD += (pen ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    pen = true;
  });
  return (
    <svg width={width} height={height}>
      <path d={pathD} fill="none" stroke={stroke} strokeWidth="1.25"/>
      {(function () {
        for (let i = values.length - 1; i >= 0; i--) {
          if (isFiniteNum(values[i])) {
            return <circle cx={xOf(i)} cy={yOf(values[i])} r={1.6} fill={stroke}/>;
          }
        }
        return null;
      })()}
    </svg>
  );
}

const SORT_OPTIONS = [
  { key: "lastYoy_asc",  label: "Y/Y ascending"  },
  { key: "lastYoy_desc", label: "Y/Y descending" },
  { key: "arrow_down",   label: "Recently revised down first" },
  { key: "arrow_up",     label: "Recently revised up first" },
  { key: "name_asc",     label: "Company A→Z" },
  { key: "lastDate_desc",label: "Latest announcement first" },
];

function compareRows(a, b, sortKey) {
  function numOrInf(v, dir) {
    return isFiniteNum(v) ? v : (dir === "asc" ? Infinity : -Infinity);
  }
  switch (sortKey) {
    case "lastYoy_asc":  return numOrInf(a.lastYoy, "asc")  - numOrInf(b.lastYoy, "asc");
    case "lastYoy_desc": return numOrInf(b.lastYoy, "desc") - numOrInf(a.lastYoy, "desc");
    case "arrow_down":   return (a.arrow === "down" ? 0 : 1) - (b.arrow === "down" ? 0 : 1);
    case "arrow_up":     return (a.arrow === "up"   ? 0 : 1) - (b.arrow === "up"   ? 0 : 1);
    case "name_asc":     return (a.companyName || "").localeCompare(b.companyName || "");
    case "lastDate_desc":return (b.lastDate || "").localeCompare(a.lastDate || "");
    default:             return 0;
  }
}

export default function GuidanceCompareView({ onSelectCompany }) {
  const { companies } = useCompanyContext();
  const [metric, setMetric] = useState("Sales");
  const [portFilter, setPortFilter] = useState("All");
  const [sortKey, setSortKey] = useState("lastYoy_asc");
  const [search, setSearch] = useState("");

  /* All distinct metric names across all companies' guidance history.
     Sorted with most-tracked first so the typeahead's default ordering
     matches what users would pick most often. */
  const allMetrics = useMemo(function () {
    const counts = {};
    (companies || []).forEach(function (c) {
      ((c.guidance && c.guidance.history) || []).forEach(function (r) {
        if (r.item) counts[r.item] = (counts[r.item] || 0) + 1;
      });
    });
    return Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b);
    });
  }, [companies]);

  /* Auto-default to the first (most-tracked) metric if "Sales" doesn't
     exist. Effect-free — recomputed on every render is fine since the
     list is small. */
  const effectiveMetric = (allMetrics.indexOf(metric) >= 0)
    ? metric
    : (allMetrics[0] || "");

  const rows = useMemo(function () {
    if (!effectiveMetric) return [];
    let pool = companies || [];
    if (portFilter !== "All") {
      pool = pool.filter(function (c) {
        return ((c.portfolios || []).indexOf(portFilter) >= 0)
            || ((c.portNote || "").toUpperCase().indexOf(portFilter) >= 0);
      });
    }
    if (search) {
      const ql = search.toLowerCase();
      pool = pool.filter(function (c) { return (c.name || "").toLowerCase().indexOf(ql) >= 0; });
    }
    const out = [];
    pool.forEach(function (c) {
      const r = buildRow(c, effectiveMetric);
      if (r) out.push(r);
    });
    out.sort(function (a, b) { return compareRows(a, b, sortKey); });
    return out;
  }, [companies, effectiveMetric, portFilter, sortKey, search]);

  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">Guidance Comparison</div>
        <div className="text-[11px] text-gray-500 dark:text-slate-400">{rows.length} compan{rows.length === 1 ? "y" : "ies"} tracking <code>{effectiveMetric || "—"}</code></div>
      </div>

      <div className="flex gap-2 flex-wrap mb-3 items-center">
        <label className="text-[11px] text-gray-500 dark:text-slate-400">Metric:</label>
        <input
          list="guidance-metrics-list"
          value={metric}
          onChange={function (e) { setMetric(e.target.value); }}
          placeholder="Type a metric..."
          className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none w-48"
        />
        <datalist id="guidance-metrics-list">
          {allMetrics.map(function (m) { return <option key={m} value={m}/>; })}
        </datalist>

        <label className="text-[11px] text-gray-500 dark:text-slate-400 ml-2">Portfolio:</label>
        <select value={portFilter} onChange={function (e) { setPortFilter(e.target.value); }} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100">
          <option value="All">All</option>
          {PORTFOLIOS.map(function (p) { return <option key={p} value={p}>{p}</option>; })}
        </select>

        <label className="text-[11px] text-gray-500 dark:text-slate-400 ml-2">Sort:</label>
        <select value={sortKey} onChange={function (e) { setSortKey(e.target.value); }} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100">
          {SORT_OPTIONS.map(function (o) { return <option key={o.key} value={o.key}>{o.label}</option>; })}
        </select>

        <input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Filter by name..." className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 w-40 ml-2"/>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-slate-500 italic py-6 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
          {allMetrics.length === 0
            ? "No guidance data imported yet. Upload via Data Hub → Guidance for one or more companies."
            : "No companies tracking " + effectiveMetric + " in the current filter."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 2fr) 60px 80px 100px 120px 90px 130px" }}>
            {/* Header */}
            {["Company", "FY", "Y/Y", "Range (Y/Y)", "Mid (abs)", "Last", "Trajectory"].map(function (h, i) {
              return (
                <div key={h} className={"text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-700 px-2 py-1.5 " + (i >= 2 ? "text-right" : "")}>
                  {h}
                </div>
              );
            })}

            {/* Rows */}
            {rows.map(function (r) {
              const yoyClass = !isFiniteNum(r.lastYoy) ? "text-gray-400 dark:text-slate-500"
                            : r.lastYoy >= 0 ? "text-green-700 dark:text-green-400"
                            : "text-red-700 dark:text-red-400";
              const lowYoy  = isFiniteNum(r.baseline) && isFiniteNum(r.lastLow)  && r.baseline > 0 ? r.lastLow  / r.baseline - 1 : null;
              const highYoy = isFiniteNum(r.baseline) && isFiniteNum(r.lastHigh) && r.baseline > 0 ? r.lastHigh / r.baseline - 1 : null;
              const showRange = isFiniteNum(lowYoy) && isFiniteNum(highYoy) && r.lastLow !== r.lastHigh;
              const midAbs   = isFiniteNum(r.lastMid)  ? fmtMoney(r.lastMid, r.currency) : "—";
              return (
                <div key={r.companyId} onClick={function () { if (onSelectCompany) onSelectCompany(r.companyId); }}
                     className="contents cursor-pointer"
                     >
                  <div className="px-2 py-1.5 text-[12px] text-gray-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 truncate hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span className="font-medium">{r.companyName}</span>
                  </div>
                  <div className="px-2 py-1.5 text-[11px] text-gray-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50" title={"Period " + r.period + (r.isClosed ? " (just closed)" : "")}>
                    {fyLabel(r.period)}{r.isClosed && <span className="text-[9px] text-gray-400 dark:text-slate-500"> ✓</span>}
                  </div>
                  <div className={"px-2 py-1.5 text-[12px] tabular-nums font-semibold text-right border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 " + yoyClass}>
                    <span style={{ color: ARROW_COLOR[r.arrow] }} className="text-[10px] mr-1">{ARROW_GLYPH[r.arrow]}</span>
                    {fmtPct(r.lastYoy)}
                  </div>
                  <div className="px-2 py-1.5 text-[11px] tabular-nums text-gray-500 dark:text-slate-400 text-right border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {showRange ? fmtPct(lowYoy) + " – " + fmtPct(highYoy) : "—"}
                  </div>
                  <div className="px-2 py-1.5 text-[11px] tabular-nums text-gray-500 dark:text-slate-400 text-right border-b border-slate-100 dark:border-slate-800 truncate hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {midAbs}
                  </div>
                  <div className="px-2 py-1.5 text-[11px] tabular-nums text-gray-500 dark:text-slate-400 text-right border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {fmtDateShort(r.lastDate)}
                  </div>
                  <div className="px-2 py-1.5 text-[11px] text-right border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-end">
                    <Sparkline values={r.yoyValues} width={120} height={22}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
