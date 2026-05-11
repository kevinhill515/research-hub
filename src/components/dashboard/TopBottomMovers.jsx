/* Top / Bottom Movers — ranks all companies by trailing-return window
 * (1D, 5D, QTD, YTD) and shows the best and worst N% in side-by-side
 * tables. Filterable by company status (Own / Focus / Watch / Sold) so
 * you can scope to "what we own" vs "the whole universe."
 *
 * Source: each company's USD-preferred ticker perf object (perf["1D"],
 * perf["5D"], etc.). Same field the price-1d alert reads.
 *
 * Each row is clickable — opens that company. */

import { useMemo, useState } from "react";
import { useCompanyContext } from "../../context/CompanyContext.jsx";

const WINDOWS = [
  { id: "1D",  label: "1 Day" },
  { id: "5D",  label: "5 Day" },
  { id: "QTD", label: "QTD" },
  { id: "YTD", label: "YTD" },
];

const STATUSES = ["All", "Own", "Focus", "Watch", "Sold"];

/* USD-preferred ticker pick — mirror of the alerts/PricesTab logic so
 * the numbers shown here match what's used elsewhere. */
function pickTicker(c) {
  const tks = (c && c.tickers) || [];
  const ord = tks.find(function (t) { return t.isOrdinary; });
  const us = tks.find(function (t) { return (t.currency || "").toUpperCase() === "USD" && !t.isOrdinary; })
          || (ord && (ord.currency || "").toUpperCase() === "USD" ? ord : null);
  return us || ord || null;
}

function readPerf(c, key) {
  const t = pickTicker(c);
  if (!t) return null;
  const p = t.perf || {};
  if (typeof p[key] === "number" && isFinite(p[key])) return p[key];
  if (key === "1D" && typeof p.TODAY === "number" && isFinite(p.TODAY)) return p.TODAY;
  return null;
}

function fmtPct(v) {
  if (v == null || !isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return sign + (v * 100).toFixed(2) + "%";
}

export default function TopBottomMovers({ onSelectCompany }) {
  const { companies } = useCompanyContext();
  const [windowKey, setWindowKey] = useState("1D");
  /* Multi-select status filter via Set so users can include any combo
     of Own + Focus + Watch + Sold. "All" toggles all on/off. */
  const [statusFilter, setStatusFilter] = useState(new Set(["Own", "Focus", "Watch"]));
  /* Top/bottom slice size — default 10% of the filtered universe,
     bounded by [3, 25] so it's always actionable on small or huge
     universes. */
  const [pctSlice, setPctSlice] = useState(10);

  function toggleStatus(s) {
    setStatusFilter(function (prev) {
      const next = new Set(prev);
      if (s === "All") {
        if (next.has("Own") && next.has("Focus") && next.has("Watch") && next.has("Sold")) {
          return new Set();
        }
        return new Set(["Own", "Focus", "Watch", "Sold"]);
      }
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const allOn = statusFilter.has("Own") && statusFilter.has("Focus") && statusFilter.has("Watch") && statusFilter.has("Sold");

  /* Filter to selected statuses + companies that have a parseable perf
     value for the selected window. Sorted desc; top = first N, bottom
     = last N (reversed for display so worst is at the top of bottom).

     Pre-market detection: when the script runs before market close,
     FactSet's TODAY/1D returns 0 for every name (no moves yet). If
     more than half the universe is exactly 0, the data is almost
     certainly stale — flag it and skip those zero rows so the
     remaining (genuinely moved) names rank cleanly. A truly 0.00%
     move on a real trading day is statistically negligible. */
  const { ranked, premarket, totalConsidered } = useMemo(function () {
    const arr = [];
    let zeros = 0;
    (companies || []).forEach(function (c) {
      if (!statusFilter.has(c.status || "")) return;
      const v = readPerf(c, windowKey);
      if (v == null) return;
      if (v === 0) zeros++;
      arr.push({ id: c.id, name: c.name, status: c.status, ticker: (pickTicker(c) || {}).ticker || c.ticker, v: v });
    });
    const premarket = arr.length > 0 && (zeros / arr.length) > 0.5;
    const cleaned = premarket ? arr.filter(function (r) { return r.v !== 0; }) : arr;
    cleaned.sort(function (a, b) { return b.v - a.v; });
    return { ranked: cleaned, premarket: premarket, totalConsidered: arr.length };
  }, [companies, statusFilter, windowKey]);

  const sliceN = Math.max(3, Math.min(25, Math.round((pctSlice / 100) * ranked.length)));
  const top = ranked.slice(0, sliceN);
  const bot = ranked.slice(Math.max(0, ranked.length - sliceN)).slice().reverse();

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-gray-900 dark:text-slate-100">Top / Bottom Movers</div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 gap-y-2">
        {/* Window picker */}
        <div className="inline-flex rounded border border-gray-300 dark:border-slate-600 overflow-hidden">
          {WINDOWS.map(function (w) {
            const active = w.id === windowKey;
            return (
              <button
                key={w.id}
                onClick={function () { setWindowKey(w.id); }}
                className={"px-2.5 py-1 text-xs font-medium transition " + (active
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700")}
              >{w.label}</button>
            );
          })}
        </div>

        <span className="text-gray-300 dark:text-slate-600">|</span>

        {/* Status pills — multi-select */}
        <span className="text-[11px] text-gray-500 dark:text-slate-400">Include:</span>
        {STATUSES.map(function (s) {
          const active = s === "All" ? allOn : statusFilter.has(s);
          return (
            <button
              key={s}
              onClick={function () { toggleStatus(s); }}
              className={"text-[11px] px-2.5 py-0.5 rounded-full border transition " + (active
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-semibold"
                : "border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700")}
            >{s}</button>
          );
        })}

        <span className="text-gray-300 dark:text-slate-600">|</span>

        {/* Slice size */}
        <span className="text-[11px] text-gray-500 dark:text-slate-400">Show top/bottom</span>
        <div className="inline-flex rounded border border-gray-300 dark:border-slate-600 overflow-hidden">
          {[5, 10, 20].map(function (n) {
            const active = n === pctSlice;
            return (
              <button
                key={n}
                onClick={function () { setPctSlice(n); }}
                className={"px-2 py-0.5 text-[11px] font-medium transition " + (active
                  ? "bg-gray-900 text-white dark:bg-slate-200 dark:text-slate-900"
                  : "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700")}
              >{n}%</button>
            );
          })}
        </div>

        <span className="text-[11px] text-gray-500 dark:text-slate-400 ml-auto">
          Universe: <span className="font-semibold text-gray-700 dark:text-slate-300">{ranked.length}</span> · slice: <span className="font-semibold text-gray-700 dark:text-slate-300">{sliceN}</span>
        </span>
      </div>

      {premarket && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-[12px] text-amber-800 dark:text-amber-300">
          <span className="font-semibold">Heads up:</span> most {windowKey} values came back as 0.00%, likely because the daily script ran before market close. Showing only the {ranked.length} of {totalConsidered} names with non-zero returns. Re-run the Prices upload after the close for a clean view.
        </div>
      )}
      {ranked.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-slate-400 italic p-3">
          No companies with {windowKey} performance data in the selected statuses. Re-run the daily Prices upload.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MoversTable
            title={"Top " + sliceN + " — " + windowKey}
            rows={top}
            color="emerald"
            onSelectCompany={onSelectCompany}
          />
          <MoversTable
            title={"Bottom " + sliceN + " — " + windowKey}
            rows={bot}
            color="red"
            onSelectCompany={onSelectCompany}
          />
        </div>
      )}
    </div>
  );
}

function MoversTable({ title, rows, color, onSelectCompany }) {
  const headerColor = color === "emerald"
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-red-700 dark:text-red-400";
  return (
    <div>
      <div className={"text-xs font-semibold uppercase tracking-wide mb-1.5 " + headerColor}>{title}</div>
      <div className="rounded border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase text-gray-500 dark:text-slate-400">
            <tr>
              <th className="text-left px-2 py-1 font-medium">#</th>
              <th className="text-left px-2 py-1 font-medium">Name</th>
              <th className="text-left px-2 py-1 font-medium">Ticker</th>
              <th className="text-left px-2 py-1 font-medium">Status</th>
              <th className="text-right px-2 py-1 font-medium">Return</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (r, i) {
              const valColor = r.v >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400";
              return (
                <tr
                  key={r.id}
                  onClick={onSelectCompany ? function () { onSelectCompany(r.id); } : undefined}
                  className={(onSelectCompany ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 " : "") + "border-t border-gray-100 dark:border-slate-700"}
                >
                  <td className="px-2 py-1 text-gray-400 dark:text-slate-500 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1 text-gray-900 dark:text-slate-100">{r.name}</td>
                  <td className="px-2 py-1 text-gray-500 dark:text-slate-400 font-mono text-xs">{r.ticker || "—"}</td>
                  <td className="px-2 py-1 text-gray-500 dark:text-slate-400 text-xs">{r.status || "—"}</td>
                  <td className={"px-2 py-1 text-right font-semibold tabular-nums " + valColor}>{fmtPct(r.v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
