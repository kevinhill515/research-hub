/* Metrics view of the Companies list.
 *
 * Reads company.metrics (populated by the daily factset_pull.py or via
 * the Data Hub manual upload) and renders one wide table. Horizontal
 * scroll because there are 29 columns. Click a row to open the company
 * detail, same as the standard view.
 *
 * Formatting:
 *  - MktCap -> $12.3B
 *  - P/E -> 18.5x
 *  - Percent fields (yields, margins, ROE, returns) -> 3.2%
 *  - Ratios (Net D/E, Int Cov) -> 0.45 / 12.3
 *
 * Color-coded performance cells (green/red with magnitude shading) for
 * the MTD/QTD/3M/6M/YTD/1Y columns.
 */

import { useMemo, useState } from 'react';
import { truncName } from '../../utils/index.js';

const COLS = [
  /* label, key, kind, right-aligned? (all numeric are right) */
  { label: "Name",       key: "__name",   kind: "name",  w: 160, sticky: true },
  { label: "Ticker",     key: "__ticker", kind: "text",  w: 80 },
  { label: "MktCap",     key: "mktCap",   kind: "bn",    w: 70 },
  { label: "F P/E +1",   key: "fpe1",     kind: "x",     w: 70 },
  { label: "F P/E +2",   key: "fpe2",     kind: "x",     w: 70 },
  { label: "FCF Yld +1", key: "fcfYld1",  kind: "pct",   w: 80 },
  { label: "FCF Yld +2", key: "fcfYld2",  kind: "pct",   w: 80 },
  { label: "Div Yld +1", key: "divYld1",  kind: "pct",   w: 80 },
  { label: "Div Yld +2", key: "divYld2",  kind: "pct",   w: 80 },
  { label: "Payout +1",  key: "payout1",  kind: "pct",   w: 75 },
  { label: "Payout +2",  key: "payout2",  kind: "pct",   w: 75 },
  { label: "Net D/E +1", key: "netDE1",   kind: "ratio", w: 80 },
  { label: "Net D/E +2", key: "netDE2",   kind: "ratio", w: 80 },
  { label: "Int Cov",    key: "intCov",   kind: "ratio", w: 70 },
  { label: "LT EPS",     key: "ltEPS",    kind: "pct",   w: 70 },
  { label: "Gr Mgn +1",  key: "grMgn1",   kind: "pct",   w: 80 },
  { label: "Gr Mgn +2",  key: "grMgn2",   kind: "pct",   w: 80 },
  { label: "Net Mgn +1", key: "netMgn1",  kind: "pct",   w: 80 },
  { label: "Net Mgn +2", key: "netMgn2",  kind: "pct",   w: 80 },
  { label: "GP/Ass +1",  key: "gpAss1",   kind: "pct",   w: 75 },
  { label: "GP/Ass +2",  key: "gpAss2",   kind: "pct",   w: 75 },
  { label: "NP/Ass +1",  key: "npAss1",   kind: "pct",   w: 75 },
  { label: "NP/Ass +2",  key: "npAss2",   kind: "pct",   w: 75 },
  { label: "Op ROE +1",  key: "opROE1",   kind: "pct",   w: 75 },
  { label: "Op ROE +2",  key: "opROE2",   kind: "pct",   w: 75 },
  /* Performance — colored cells */
  { label: "MTD", key: "perf.MTD", kind: "perf", w: 60 },
  { label: "QTD", key: "perf.QTD", kind: "perf", w: 60 },
  { label: "3M",  key: "perf.3M",  kind: "perf", w: 60 },
  { label: "6M",  key: "perf.6M",  kind: "perf", w: 60 },
  { label: "YTD", key: "perf.YTD", kind: "perf", w: 60 },
  { label: "1Y",  key: "perf.1Y",  kind: "perf", w: 60 },
];

function getCellValue(company, key) {
  const m = company.metrics || {};
  if (key === "__name") return company.name;
  if (key === "__ticker") {
    const ord = (company.tickers || []).find(function (t) { return t.isOrdinary; });
    return (ord && ord.ticker) || company.ticker || "";
  }
  if (key.startsWith("perf.")) {
    return m.perf ? m.perf[key.slice(5)] : null;
  }
  return m[key];
}

function fmt(v, kind) {
  if (v === null || v === undefined || (typeof v === "number" && isNaN(v))) return "--";
  if (typeof v === "string" && v.trim() === "") return "--";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (isNaN(n)) return typeof v === "string" ? v : "--";
  switch (kind) {
    case "bn":    return "$" + n.toFixed(1) + "B";
    case "x":     return n.toFixed(1) + "x";
    case "pct":   return (n * 100).toFixed(1) + "%";
    case "perf":  return (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
    case "ratio": return n.toFixed(2);
    default:      return String(v);
  }
}

/* Color-graded cell bg for perf columns — reused from MarketsDashboard. */
function perfStyle(v) {
  if (v === null || v === undefined || isNaN(v)) return null;
  const n = v * 100;
  if (Math.abs(n) < 0.05) return null;
  const mag = Math.min(Math.abs(n) / 15, 1);
  const alpha = 0.06 + mag * 0.44;
  if (n >= 0) return { background: `rgba(22,101,52,${alpha})`, color: mag > 0.5 ? "#14532d" : undefined };
  return { background: `rgba(220,38,38,${alpha})`, color: mag > 0.5 ? "#7f1d1d" : undefined };
}

export default function MetricsTable({ companies, onSelectCompany, search }) {
  const [sortKey, setSortKey] = useState("__name");
  const [sortDir, setSortDir] = useState("asc");

  const filtered = useMemo(function () {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(function (c) {
      if ((c.name || "").toLowerCase().indexOf(q) >= 0) return true;
      return (c.tickers || []).some(function (t) { return (t.ticker || "").toLowerCase().indexOf(q) >= 0; });
    });
  }, [companies, search]);

  const sorted = useMemo(function () {
    const mult = sortDir === "asc" ? 1 : -1;
    return filtered.slice().sort(function (a, b) {
      const va = getCellValue(a, sortKey);
      const vb = getCellValue(b, sortKey);
      if (sortKey === "__name" || sortKey === "__ticker") {
        return mult * String(va || "").localeCompare(String(vb || ""));
      }
      /* Nulls always sink to the bottom regardless of direction. */
      const na = typeof va === "number" ? va : parseFloat(va);
      const nb = typeof vb === "number" ? vb : parseFloat(vb);
      const aBad = va === null || va === undefined || isNaN(na);
      const bBad = vb === null || vb === undefined || isNaN(nb);
      if (aBad && bBad) return 0;
      if (aBad) return 1;
      if (bBad) return -1;
      return mult * (na - nb);
    });
  }, [filtered, sortKey, sortDir]);

  function handleHeaderClick(key) {
    if (sortKey === key) {
      setSortDir(function (d) { return d === "asc" ? "desc" : "asc"; });
    } else {
      setSortKey(key);
      /* Numeric columns default to desc (biggest first) */
      setSortDir(key === "__name" || key === "__ticker" ? "asc" : "desc");
    }
  }

  const hasMetrics = sorted.filter(function (c) { return c.metrics; }).length;

  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">
        {hasMetrics} of {sorted.length} companies have metrics data.
        {hasMetrics === 0 && " Run the daily FactSet pull or paste data into the Data Hub Metrics tab."}
      </div>
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-md">
        <table className="text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 sticky top-0 z-10">
            <tr>
              {COLS.map(function (col) {
                const active = sortKey === col.key;
                const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
                const sticky = col.sticky ? { position: "sticky", left: 0, zIndex: 11, background: "inherit" } : {};
                return (
                  <th
                    key={col.key}
                    onClick={function () { handleHeaderClick(col.key); }}
                    className="px-2 py-1.5 text-left font-medium cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 select-none whitespace-nowrap"
                    style={Object.assign({ minWidth: col.w, width: col.w }, sticky)}
                  >
                    {col.label}{arrow}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(function (c) {
              return (
                <tr
                  key={c.id}
                  onClick={function () { onSelectCompany(c); }}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  {COLS.map(function (col) {
                    const v = getCellValue(c, col.key);
                    let text = "";
                    let style = null;
                    if (col.kind === "name") text = truncName(c.name, 24);
                    else if (col.kind === "text") text = v || "--";
                    else text = fmt(v, col.kind);
                    if (col.kind === "perf") style = perfStyle(v);
                    const sticky = col.sticky ? {
                      position: "sticky", left: 0, background: "inherit", zIndex: 1,
                    } : {};
                    const align = (col.kind === "name" || col.kind === "text") ? "text-left" : "text-right font-mono";
                    return (
                      <td
                        key={col.key}
                        className={"px-2 py-1 whitespace-nowrap " + align + " " + (col.kind === "name" ? "text-gray-900 dark:text-slate-100 font-medium" : "text-gray-700 dark:text-slate-300")}
                        style={Object.assign({ minWidth: col.w }, style || {}, sticky)}
                        title={col.kind === "name" ? c.name : undefined}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
