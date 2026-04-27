/* Markets dashboard — Indices / Sectors / Countries / Commodities / Bonds.
 *
 * Reads the marketsSnapshot meta row populated by the daily FactSet pull
 * script (scripts/factset_pull.py). All values are decimals (e.g. 0.012
 * = +1.2%) and we format as percent on render.
 *
 * Color: positive green, negative red, deeper saturation for larger moves.
 * Layout: scrollable table per group; FX panel sits on the right. */

import { useEffect } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';

const PERIODS = ["1D", "5D", "MTD", "QTD", "YTD", "1Y", "3Y"];

const GROUPS = [
  { key: "indices",     title: "Major Indices" },
  { key: "sectors",     title: "ACWI Sectors" },
  { key: "countries",   title: "MSCI Countries" },
  { key: "commodities", title: "Commodities" },
  { key: "bonds",       title: "Bonds & Treasuries" },
];

/* Format a decimal return as +1.2% / -4.6%. Null/undefined -> em-dash. */
function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return "--";
  const n = v * 100;
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

/* The workbook labels the first FX row "USD" but it's actually the DXY
 * dollar-index (FactSet ticker DXY.Z). Remap for clarity. */
function fxLabel(raw) {
  return raw === "USD" ? "DXY" : raw;
}

/* Background color for a return cell. Saturation scales with magnitude
 * over a 0-15% range so 1Y/3Y columns (which can hit 20-30%) still show
 * meaningful differentiation against short-period moves. Above 15% we
 * clamp but the visible alpha (0.50) is strong enough that most users
 * perceive the scale as reasonable throughout. */
function returnStyle(v) {
  if (v === null || v === undefined || isNaN(v)) return null;
  const n = v * 100;
  if (Math.abs(n) < 0.05) return null; // ~flat, no tint
  const mag = Math.min(Math.abs(n) / 15, 1);
  const alpha = 0.06 + mag * 0.44;     // 0.06 (barely visible) .. 0.50 (strong)
  if (n >= 0) {
    return {
      background: `rgba(22,101,52,${alpha})`,
      color: mag > 0.5 ? "#14532d" : undefined,
    };
  }
  return {
    background: `rgba(220,38,38,${alpha})`,
    color: mag > 0.5 ? "#7f1d1d" : undefined,
  };
}

function ReturnCell({ value }) {
  const style = returnStyle(value);
  return (
    <td className="px-2 py-1 text-right text-xs font-mono whitespace-nowrap"
        style={style || undefined}>
      {fmtPct(value)}
    </td>
  );
}

function GroupTable({ title, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="mb-5">
      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1.5">{title}</div>
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-md">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Name</th>
              <th className="px-2 py-1.5 text-left font-medium">Ticker</th>
              {PERIODS.map(function (p) {
                return <th key={p} className="px-2 py-1.5 text-right font-medium">{p}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(function (r, i) {
              return (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-2 py-1 text-gray-900 dark:text-slate-100">{r.label}</td>
                  <td className="px-2 py-1 text-[10px] text-gray-500 dark:text-slate-400 font-mono">{r.ticker || ""}</td>
                  {PERIODS.map(function (p) {
                    return <ReturnCell key={p} value={r[p]} />;
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

function FxMatrix({ label, matrix }) {
  if (!matrix || !matrix.rows || matrix.rows.length === 0) return null;
  /* Cell semantics: row currency's return in terms of column currency.
     USD/USD is special — populated with the DXY dollar-index return
     as a proxy. Render by value: em-dash for null (e.g. EUR/EUR, etc.
     that are genuinely blank), percent for anything with data. */
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1">{label}</div>
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr>
            <th className="px-1 py-0.5"></th>
            {matrix.cols.map(function (c, i) {
              return <th key={i} className="px-1 py-0.5 text-right font-medium text-gray-500 dark:text-slate-400">{c}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map(function (row, i) {
            return (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-1 py-0.5 font-medium text-gray-700 dark:text-slate-300">{row.label}</td>
                {row.values.map(function (v, j) {
                  if (v === null || v === undefined) {
                    return <td key={j} className="px-1 py-0.5 text-right font-mono text-gray-400 dark:text-slate-600">—</td>;
                  }
                  const style = returnStyle(v);
                  /* Tooltip tags the USD/USD cell as DXY for clarity. */
                  const isDxy = (row.label || "").toUpperCase() === "USD" &&
                                (matrix.cols[j] || "").toUpperCase() === "USD";
                  return (
                    <td key={j}
                        className="px-1 py-0.5 text-right font-mono whitespace-nowrap"
                        style={style || undefined}
                        title={isDxy ? "DXY dollar-index return" : row.label + " vs " + matrix.cols[j]}>
                      {fmtPct(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FxPanel({ snap }) {
  const fx3 = snap.fx3M || [];
  const fx12 = snap.fx12M || [];
  const m3 = snap.fxMatrix3M;
  const m12 = snap.fxMatrix12M;
  const hasMatrix = m3 && m3.rows && m3.rows.length > 0;
  if (!hasMatrix && fx3.length === 0 && fx12.length === 0) return null;
  return (
    <div className="mb-5">
      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1.5">FX (cross-rates)</div>
      {hasMatrix ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FxMatrix label="3-Month %" matrix={m3} />
          <FxMatrix label="12-Month %" matrix={m12} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <FxBlock label="3-Month" rows={fx3} />
          <FxBlock label="12-Month" rows={fx12} />
        </div>
      )}
    </div>
  );
}

function FxBlock({ label, rows }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1">{label}</div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(function (r, i) {
            const style = returnStyle(r.value);
            return (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800 first:border-t-0">
                <td className="py-0.5 text-gray-900 dark:text-slate-100">{fxLabel(r.label)}</td>
                <td className="py-0.5 text-right text-xs font-mono whitespace-nowrap" style={style || undefined}>
                  {fmtPct(r.value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function MarketsDashboard() {
  /* marketsSnapshot is shared via CompanyContext — first reader triggers
     the supaGet, every subsequent tab/use gets the cached value. */
  const { marketsSnapshot: snap, marketsStatus, ensureMarketsSnapshot } = useCompanyContext();
  useEffect(function () {
    if (typeof ensureMarketsSnapshot === "function") ensureMarketsSnapshot();
  }, [ensureMarketsSnapshot]);

  if (marketsStatus === "loading") {
    return (
      <div className="text-sm text-gray-500 dark:text-slate-400 italic py-6">Loading markets data…</div>
    );
  }
  if (!snap) {
    return (
      <div className="text-sm text-gray-500 dark:text-slate-400 py-6">
        No markets snapshot yet. The daily FactSet job runs at 7:30 AM PT and populates this view.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <div className="text-base font-semibold text-gray-900 dark:text-slate-100">Markets</div>
          <div className="text-xs text-gray-500 dark:text-slate-400">
            Total returns in USD. Updated daily at 7:30 AM PT from FactSet.
          </div>
        </div>
        {snap.asOf && (
          <span className="text-[11px] text-gray-500 dark:text-slate-400 font-mono">
            As of {new Date(snap.asOf).toLocaleString()}
          </span>
        )}
      </div>

      {GROUPS.map(function (g) {
        return <GroupTable key={g.key} title={g.title} rows={snap[g.key]} />;
      })}
      <FxPanel snap={snap} />
    </div>
  );
}
