/* Metrics view of the Companies list.
 *
 * Renders a wide table of FactSet-sourced metrics per company. Companies
 * arrive pre-sorted by the parent (matching Standard view's order); the
 * user can override with header clicks (3-state: default → desc → asc →
 * back to default).
 *
 * Columns beyond the default-visible set can be toggled via the Columns
 * button. By default all "+2" (year+2) projection columns are hidden so
 * the table fits on most screens without horizontal scroll.
 *
 * Row background tints follow the Tier-based coloring used in the
 * Standard view (light mode only, matching CoRow behavior). */

import { useMemo, useState } from 'react';
import { truncName, getTiers, tierBg, tierPillStyle } from '../../utils/index.js';
import FpeRangeMini from '../ui/FpeRangeMini.jsx';

export const METRICS_COLS = [
  /* key, label, kind, width, default-visible
     Current (LTM) columns are placed before their +1/+2 siblings but
     default-hidden so existing users don't see their view suddenly
     double in width. Toggle them on via the Columns picker. */
  { key: "__tier",     label: "Tier",       kind: "tier",     w: 72,  vis: true  },
  { key: "__name",     label: "Name",       kind: "name",     w: 170, vis: true  },
  { key: "mktCap",     label: "MktCap",     kind: "bn",       w: 70,  vis: true  },
  { key: "__fpeRange", label: "FPE Range",  kind: "fperange", w: 110, vis: true  },
  { key: "fpe",        label: "P/E",        kind: "x",        w: 70,  vis: false },
  { key: "fpe1",       label: "P/E +1",     kind: "x",        w: 70,  vis: true  },
  { key: "fpe2",       label: "P/E +2",     kind: "x",        w: 70,  vis: false },
  { key: "fcfYld",     label: "FCF Yld",    kind: "pct",      w: 80,  vis: false },
  { key: "fcfYld1",    label: "FCF Yld +1", kind: "pct",      w: 80,  vis: true  },
  { key: "fcfYld2",    label: "FCF Yld +2", kind: "pct",      w: 80,  vis: false },
  { key: "divYld",     label: "Div Yld",    kind: "pct",      w: 80,  vis: false },
  { key: "divYld1",    label: "Div Yld +1", kind: "pct",      w: 80,  vis: true  },
  { key: "divYld2",    label: "Div Yld +2", kind: "pct",      w: 80,  vis: false },
  { key: "payout",     label: "Payout",     kind: "pct",      w: 75,  vis: false },
  { key: "payout1",    label: "Payout +1",  kind: "pct",      w: 75,  vis: true  },
  { key: "payout2",    label: "Payout +2",  kind: "pct",      w: 75,  vis: false },
  { key: "netDE",      label: "Net D/E",    kind: "pct",      w: 80,  vis: false },
  { key: "netDE1",     label: "Net D/E +1", kind: "pct",      w: 80,  vis: true  },
  { key: "netDE2",     label: "Net D/E +2", kind: "pct",      w: 80,  vis: false },
  { key: "intCov",     label: "Int Cov",    kind: "ratio",    w: 70,  vis: true  },
  { key: "ltEPS",      label: "LT EPS",     kind: "pct",      w: 70,  vis: true  },
  { key: "grMgn",      label: "Gr Mgn",     kind: "pct",      w: 80,  vis: false },
  { key: "grMgn1",     label: "Gr Mgn +1",  kind: "pct",      w: 80,  vis: true  },
  { key: "grMgn2",     label: "Gr Mgn +2",  kind: "pct",      w: 80,  vis: false },
  { key: "netMgn",     label: "Net Mgn",    kind: "pct",      w: 80,  vis: false },
  { key: "netMgn1",    label: "Net Mgn +1", kind: "pct",      w: 80,  vis: true  },
  { key: "netMgn2",    label: "Net Mgn +2", kind: "pct",      w: 80,  vis: false },
  { key: "gpAss",      label: "GP/Ass",     kind: "pct",      w: 75,  vis: false },
  { key: "gpAss1",     label: "GP/Ass +1",  kind: "pct",      w: 75,  vis: true  },
  { key: "gpAss2",     label: "GP/Ass +2",  kind: "pct",      w: 75,  vis: false },
  { key: "npAss",      label: "NP/Ass",     kind: "pct",      w: 75,  vis: false },
  { key: "npAss1",     label: "NP/Ass +1",  kind: "pct",      w: 75,  vis: true  },
  { key: "npAss2",     label: "NP/Ass +2",  kind: "pct",      w: 75,  vis: false },
  { key: "opROE",      label: "Op ROE",     kind: "pct",      w: 75,  vis: false },
  { key: "opROE1",     label: "Op ROE +1",  kind: "pct",      w: 75,  vis: true  },
  { key: "opROE2",     label: "Op ROE +2",  kind: "pct",      w: 75,  vis: false },
  /* Performance — colored cells */
  { key: "perf.MTD",   label: "MTD",        kind: "perf",     w: 60,  vis: true  },
  { key: "perf.QTD",   label: "QTD",        kind: "perf",     w: 60,  vis: true  },
  { key: "perf.3M",    label: "3M",         kind: "perf",     w: 60,  vis: true  },
  { key: "perf.6M",    label: "6M",         kind: "perf",     w: 60,  vis: true  },
  { key: "perf.YTD",   label: "YTD",        kind: "perf",     w: 60,  vis: true  },
  { key: "perf.1Y",    label: "1Y",         kind: "perf",     w: 60,  vis: true  },
];

export const DEFAULT_METRICS_VISIBLE = new Set(METRICS_COLS.filter(function (c) { return c.vis; }).map(function (c) { return c.key; }));

function getCellValue(company, key) {
  const m = company.metrics || {};
  if (key === "__name")     return company.name;
  if (key === "__tier")     return company.tier;
  if (key === "__fpeRange") return null; /* not sortable */
  if (key.startsWith("perf.")) return m.perf ? m.perf[key.slice(5)] : null;
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
    case "ratio": return n.toFixed(1);
    default:      return String(v);
  }
}

function perfStyle(v) {
  if (v === null || v === undefined || isNaN(v)) return null;
  const n = v * 100;
  if (Math.abs(n) < 0.05) return null;
  const mag = Math.min(Math.abs(n) / 15, 1);
  const alpha = 0.06 + mag * 0.44;
  if (n >= 0) return { background: `rgba(22,101,52,${alpha})`, color: mag > 0.5 ? "#14532d" : undefined };
  return { background: `rgba(220,38,38,${alpha})`, color: mag > 0.5 ? "#7f1d1d" : undefined };
}

function TierCell({ tier }) {
  const tiers = getTiers(tier);
  if (tiers.length === 0) return <span className="text-gray-400 dark:text-slate-500">--</span>;
  return (
    <div className="flex gap-0.5 flex-wrap">
      {tiers.map(function (t) {
        const ps = tierPillStyle(t);
        return (
          <span key={t} className="text-[9px] px-1 py-0 rounded-full font-medium"
                style={{ background: ps.bg, color: ps.color }}>
            {t}
          </span>
        );
      })}
    </div>
  );
}

export default function MetricsTable({ companies, search, onSelectCompany, dark, visible }) {
  /* null sortKey = use parent-supplied order (Standard sort). */
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null);
  /* Visibility is controlled by the parent (unified Columns picker in
     App.jsx). Fall back to the default set if not provided. */
  const effectiveVisible = visible || DEFAULT_METRICS_VISIBLE;

  const filtered = useMemo(function () {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(function (c) {
      if ((c.name || "").toLowerCase().indexOf(q) >= 0) return true;
      return (c.tickers || []).some(function (t) { return (t.ticker || "").toLowerCase().indexOf(q) >= 0; });
    });
  }, [companies, search]);

  const rendered = useMemo(function () {
    if (sortKey === null) return filtered; /* parent order */
    const mult = sortDir === "asc" ? 1 : -1;
    return filtered.slice().sort(function (a, b) {
      const va = getCellValue(a, sortKey);
      const vb = getCellValue(b, sortKey);
      if (sortKey === "__name" || sortKey === "__tier") {
        return mult * String(va || "").localeCompare(String(vb || ""));
      }
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
    const col = METRICS_COLS.find(function (c) { return c.key === key; });
    if (!col) return;
    if (col.kind === "fperange" || col.key === "__tier") return; /* not sortable */
    /* First click: default direction. Numeric cols -> desc, text -> asc. */
    const firstDir = (col.kind === "name") ? "asc" : "desc";
    if (sortKey !== key) {
      setSortKey(key); setSortDir(firstDir);
    } else if (sortDir === firstDir) {
      setSortDir(firstDir === "asc" ? "desc" : "asc");
    } else {
      /* Third click — clear sort, fall back to parent order */
      setSortKey(null); setSortDir(null);
    }
  }

  const visibleCols = METRICS_COLS.filter(function (c) { return effectiveVisible.has(c.key); });
  const hasMetrics = rendered.filter(function (c) { return c.metrics; }).length;

  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">
        {hasMetrics} of {rendered.length} companies have metrics data.
      </div>

      {/* On mobile the metrics table is much wider than the viewport
          and previously got clipped by overflow-hidden. Allow horizontal
          scrolling within the bordered container; keep overflow-y visible
          so the sticky thead still attaches to the page viewport (rather
          than to this container, which would chop off the head when the
          page scrolls vertically). */}
      <div
        className="border border-slate-200 dark:border-slate-700 rounded-md"
        style={{ overflowX: "auto", overflowY: "visible" }}
      >
        <table className="text-xs w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {visibleCols.map(function (col) {
                const active = sortKey === col.key;
                const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
                const sortable = col.kind !== "fperange" && col.key !== "__tier";
                return (
                  <th
                    key={col.key}
                    onClick={sortable ? function () { handleHeaderClick(col.key); } : undefined}
                    className={"sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-[10px] uppercase tracking-wide text-left font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap border-b border-slate-200 dark:border-slate-700 " +
                      (sortable ? "cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 select-none" : "")}
                    style={{ minWidth: col.w }}
                  >
                    {col.label}{arrow}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rendered.map(function (c) {
              const rowBgLight = tierBg(c.tier);
              const rowStyle = dark ? undefined : { background: rowBgLight };
              return (
                <tr
                  key={c.id}
                  onClick={function () { onSelectCompany(c); }}
                  style={rowStyle}
                  className="border-t border-slate-100 dark:border-slate-800 hover:brightness-95 dark:hover:bg-slate-800/40 cursor-pointer transition-all"
                >
                  {visibleCols.map(function (col) {
                    if (col.kind === "tier") {
                      return (
                        <td key={col.key} className="px-2 py-1 align-middle" style={{ minWidth: col.w }}>
                          <TierCell tier={c.tier} />
                        </td>
                      );
                    }
                    if (col.kind === "name") {
                      return (
                        <td key={col.key}
                            className="px-2 py-1 text-gray-900 dark:text-slate-100 font-medium whitespace-nowrap"
                            style={{ minWidth: col.w }}
                            title={c.name}>
                          {truncName(c.name, 22)}
                        </td>
                      );
                    }
                    if (col.kind === "fperange") {
                      return (
                        <td key={col.key} className="px-2 py-1 align-middle" style={{ minWidth: col.w }}>
                          {(function () {
                            const el = <FpeRangeMini valuation={c.valuation} width={100} />;
                            return el || <span className="text-gray-400 dark:text-slate-500">--</span>;
                          })()}
                        </td>
                      );
                    }
                    const v = getCellValue(c, col.key);
                    const text = fmt(v, col.kind);
                    const style = col.kind === "perf" ? perfStyle(v) : null;
                    return (
                      <td
                        key={col.key}
                        className="px-2 py-1 text-right font-mono text-gray-700 dark:text-slate-300 whitespace-nowrap"
                        style={Object.assign({ minWidth: col.w }, style || {})}
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
