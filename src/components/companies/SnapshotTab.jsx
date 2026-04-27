/* Snapshot tab — replaces the old grid-of-numbers Metrics tab with a
 * charts-first quick-glance view of where the company stands today.
 *
 * Two tiles:
 *   1. Trailing Performance — horizontal bars for 5D / MTD / QTD / 3M
 *      / 6M / YTD / 1Y. Color + magnitude tell the story instantly.
 *   2. Snapshot vs 5Y History — for each key metric, where the current
 *      value sits in its 5Y range, with color signaling cheap/rich or
 *      strong/weak depending on the metric's "polarity".
 *
 * Plus an inline pointer to the dedicated E[EPS] Revisions tab when
 * estimate-revisions data exists.
 *
 * Data sources:
 *   - selCo.metrics.perf       — trailing returns
 *   - selCo.tickers[*].perf5d  — 5D return on the ordinary ticker
 *   - selCo.metrics            — current values for snapshot
 *   - selCo.ratios.values      — 5Y history for each metric
 *   - selCo.valuation          — peCurrent + peLow5/peHigh5 for P/E band
 */

import { useCompanyContext } from '../../context/CompanyContext.jsx';

const TILE = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3";
const GRID_COLOR = "rgba(100,116,139,0.15)";

function isFiniteV(v) { return v !== null && v !== undefined && isFinite(v); }

function lastFinite(arr) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (isFiniteV(arr[i])) return arr[i];
  }
  return null;
}

/* Take the last N finite entries from an array. Used to compute 5Y
 * range stats from a longer time series. */
function lastNFinite(arr, n) {
  if (!arr) return [];
  const out = [];
  for (let i = arr.length - 1; i >= 0 && out.length < n; i--) {
    if (isFiniteV(arr[i])) out.unshift(arr[i]);
  }
  return out;
}

function rangeStats(values) {
  if (!values || values.length === 0) return null;
  let mn = Infinity, mx = -Infinity, sum = 0;
  values.forEach(function (v) { if (v < mn) mn = v; if (v > mx) mx = v; sum += v; });
  return { min: mn, max: mx, avg: sum / values.length };
}

/* Heuristic: % of values are stored as raw percent (38.5) — divide
 * by 100 only if any value exceeds 1.5 in magnitude. Mirrors the
 * detection used in CompanyDashboard. */
function toDecimalPct(values) {
  if (!values) return [];
  const rawAsPct = values.some(function (v) { return isFiniteV(v) && Math.abs(v) > 1.5; });
  if (!rawAsPct) return values;
  return values.map(function (v) { return isFiniteV(v) ? v * 0.01 : null; });
}

/* Configuration for each metric we plot in the Snapshot vs 5Y tile. Each
 * entry: ratio name in company.ratios.values, fallback metric key on
 * company.metrics, polarity (which direction is "good"), and how to
 * format the value. */
const SNAPSHOT_METRICS = [
  /* Valuation — lower is generally better */
  { label: "P/E",         ratio: "Price/Earnings",                  metric: "fpe",     fmt: "x",    polarity: "lower", group: "Valuation" },
  { label: "P/Sales",     ratio: "Price/Sales",                     metric: null,      fmt: "x",    polarity: "lower", group: "Valuation" },
  { label: "P/Book",      ratio: "Price/Book Value",                metric: null,      fmt: "x",    polarity: "lower", group: "Valuation" },
  { label: "EV/EBITDA",   ratio: "Enterprise Value/EBITDA",         metric: null,      fmt: "x",    polarity: "lower", group: "Valuation" },
  { label: "FCF Yld",     ratio: null,                              metric: "fcfYld",  fmt: "pct",  polarity: "higher", group: "Valuation" },
  { label: "Div Yld",     ratio: "Dividend Yield (%)",              metric: "divYld",  fmt: "pct",  polarity: "higher", group: "Valuation" },
  /* Margins — higher is better */
  { label: "Gross Margin",ratio: "Gross Margin",                    metric: "grMgn",   fmt: "pct",  polarity: "higher", group: "Margins" },
  { label: "Op Margin",   ratio: "Operating Margin",                metric: null,      fmt: "pct",  polarity: "higher", group: "Margins" },
  { label: "Net Margin",  ratio: "Net Margin",                      metric: "netMgn",  fmt: "pct",  polarity: "higher", group: "Margins" },
  /* Returns — higher is better */
  { label: "ROIC",        ratio: "Return on Invested Capital",      metric: null,      fmt: "pct",  polarity: "higher", group: "Returns" },
  { label: "ROE",         ratio: "Return on Equity",                metric: null,      fmt: "pct",  polarity: "higher", group: "Returns" },
  { label: "ROA",         ratio: "Return on Assets",                metric: null,      fmt: "pct",  polarity: "higher", group: "Returns" },
  /* Balance — neutral / lower is generally better for leverage */
  { label: "Net Debt/EBITDA", ratio: "Net Debt/EBITDA",             metric: null,      fmt: "x",    polarity: "lower", group: "Balance" },
  { label: "Int Coverage",ratio: "EBIT/Interest Expense (Int. Coverage)", metric: "intCov", fmt: "x", polarity: "higher", group: "Balance" },
];

const PERF_WINDOWS = [
  { key: "5D",  label: "5D"  },
  { key: "MTD", label: "MTD" },
  { key: "QTD", label: "QTD" },
  { key: "3M",  label: "3M"  },
  { key: "6M",  label: "6M"  },
  { key: "YTD", label: "YTD" },
  { key: "1Y",  label: "1Y"  },
];

/* ======================================================================== */

export default function SnapshotTab({ company }) {
  const { } = useCompanyContext();

  const m = (company && company.metrics) || {};
  const hasMetrics = Object.keys(m).length > 0;
  const ratios = company && company.ratios;
  const hasRatios = !!(ratios && ratios.values);
  const valuation = (company && company.valuation) || {};

  if (!hasMetrics && !hasRatios) {
    return (
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Snapshot</div>
        <div className="text-sm text-gray-500 dark:text-slate-400 italic py-6">
          No metrics or ratio history yet. The daily FactSet job populates trailing performance and current metrics; the Ratios tab is what feeds the 5Y history view.
        </div>
      </div>
    );
  }

  /* ---- Trailing performance values ---- */
  const ordT = (company.tickers || []).find(function (t) { return t.isOrdinary; }) || {};
  const perf5dRaw = ordT.perf5d;
  let perf5d = null;
  if (perf5dRaw && perf5dRaw !== "#N/A") {
    const n = parseFloat(perf5dRaw);
    if (!isNaN(n)) perf5d = n / 100;
  }
  const perf = m.perf || {};
  const perfValues = {
    "5D":  perf5d,
    "MTD": parseFloat(perf.MTD),
    "QTD": parseFloat(perf.QTD),
    "3M":  parseFloat(perf["3M"]),
    "6M":  parseFloat(perf["6M"]),
    "YTD": parseFloat(perf.YTD),
    "1Y":  parseFloat(perf["1Y"]),
  };

  /* ---- 5Y snapshot rows ---- */
  const snapshotRows = SNAPSHOT_METRICS.map(function (cfg) {
    let history = null;
    /* Prefer ratios history (longer time series). Fall back to metric
       current value alone (no range bar then). */
    if (ratios && ratios.values && cfg.ratio && ratios.values[cfg.ratio]) {
      history = toDecimalPct(ratios.values[cfg.ratio].slice());
    }
    let current = null;
    if (history && history.length > 0) current = lastFinite(history);
    if (current === null && cfg.metric != null) {
      const v = parseFloat(m[cfg.metric]);
      if (isFinite(v)) current = v;
    }
    /* Special case P/E: prefer valuation.peCurrent + valuation 5Y range
       (used elsewhere for FpeRange) when peCurrent is available. */
    if (cfg.label === "P/E" && isFinite(parseFloat(valuation.peCurrent))) {
      current = parseFloat(valuation.peCurrent);
    }

    /* 5Y range = last 5 finite values from history */
    let stats = null;
    if (history) {
      const last5 = lastNFinite(history, 5);
      if (last5.length >= 2) stats = rangeStats(last5);
    }
    /* Special-case P/E: use valuation 5Y stats if available */
    if (cfg.label === "P/E") {
      const lo = parseFloat(valuation.peLow5);
      const hi = parseFloat(valuation.peHigh5);
      const avg = parseFloat(valuation.peAvg5);
      if (isFinite(lo) && isFinite(hi) && hi > lo) {
        stats = { min: lo, max: hi, avg: isFinite(avg) ? avg : (lo + hi) / 2 };
      }
    }

    return Object.assign({}, cfg, { current: current, stats: stats });
  });

  /* Group rows for display */
  const grouped = {};
  const groupOrder = [];
  snapshotRows.forEach(function (r) {
    if (!grouped[r.group]) { grouped[r.group] = []; groupOrder.push(r.group); }
    grouped[r.group].push(r);
  });

  const hasEpsRev = !!(company.epsRevisions && company.epsRevisions.dates && company.epsRevisions.dates.length > 0);

  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3 mb-3">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">Snapshot</div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400">
          Trailing performance + current values vs 5Y range. Auto-updated daily from FactSet.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TrailingPerformance values={perfValues} />
        <SnapshotHeatmap groupOrder={groupOrder} grouped={grouped} />
      </div>

      {hasEpsRev && (
        <div className="mt-3 text-[11px] text-gray-500 dark:text-slate-400 italic px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
          EPS estimate revisions data available — open the <b>E[EPS] Revisions</b> tab to see how consensus has evolved month-over-month for each fiscal year.
        </div>
      )}
    </div>
  );
}

/* ====================== Tile 1: Trailing Performance ===================== */

function TrailingPerformance({ values }) {
  const finite = PERF_WINDOWS.map(function (w) { return values[w.key]; }).filter(isFiniteV);
  if (finite.length === 0) {
    return (
      <div className={TILE}>
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Trailing Performance</div>
        <div className="text-xs text-gray-400 dark:text-slate-500 italic py-6 text-center">No performance data — needs a daily FactSet pull.</div>
      </div>
    );
  }

  const absMax = Math.max.apply(null, finite.map(function (v) { return Math.abs(v); })) || 0.05;
  const W = 600, H = 240, PAD_T = 12, PAD_B = 12, PAD_L = 56, PAD_R = 56;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const rowH = innerH / PERF_WINDOWS.length;
  const cx = PAD_L + innerW / 2; /* center: 0% */

  function widthFor(v) {
    if (!isFiniteV(v)) return 0;
    return (Math.abs(v) / absMax) * (innerW / 2 - 4);
  }

  return (
    <div className={TILE}>
      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Trailing Performance</div>
      <svg width="100%" height={H} viewBox={"0 0 " + W + " " + H} role="img">
        {/* Center "0%" axis */}
        <line x1={cx} y1={PAD_T} x2={cx} y2={H - PAD_B} stroke="#94a3b8" strokeWidth="1" />
        {/* Bars + labels */}
        {PERF_WINDOWS.map(function (w, i) {
          const v = values[w.key];
          const yMid = PAD_T + i * rowH + rowH / 2;
          const barH = rowH * 0.6;
          const yTop = yMid - barH / 2;
          if (!isFiniteV(v)) {
            return (
              <g key={w.key}>
                <text x={PAD_L - 6} y={yMid + 4} fontSize="11" textAnchor="end" fill="#64748b">{w.label}</text>
                <text x={cx + 8} y={yMid + 4} fontSize="11" fill="#cbd5e1">--</text>
              </g>
            );
          }
          const positive = v >= 0;
          const color = positive ? "#16a34a" : "#dc2626";
          const w2 = widthFor(v);
          return (
            <g key={w.key}>
              <text x={PAD_L - 6} y={yMid + 4} fontSize="11" textAnchor="end" fill="#64748b">{w.label}</text>
              <rect
                x={positive ? cx : cx - w2}
                y={yTop}
                width={Math.max(1, w2)}
                height={barH}
                fill={color}
                opacity="0.85"
                rx="2"
              />
              <text
                x={positive ? cx + w2 + 4 : cx - w2 - 4}
                y={yMid + 4}
                fontSize="11"
                textAnchor={positive ? "start" : "end"}
                fill={color}
                fontWeight="600"
              >
                {(v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ====================== Tile 2: Snapshot vs 5Y History ==================== */

function SnapshotHeatmap({ groupOrder, grouped }) {
  return (
    <div className={TILE}>
      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Snapshot vs 5Y History</div>
      <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-2">
        Where each metric sits in its 5-year range. Color = is the current value attractive for this metric type?
      </div>
      {groupOrder.map(function (g) {
        return (
          <div key={g} className="mb-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold mb-1">{g}</div>
            <div className="space-y-0.5">
              {grouped[g].map(function (r) {
                return <SnapshotRow key={r.label} row={r} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SnapshotRow({ row }) {
  const { label, current, stats, polarity, fmt } = row;
  const fmtCur = fmtValue(current, fmt);

  /* If we have a 5Y range, render a position bar with color signaling
     whether the current value is "good" given the metric's polarity. */
  let body;
  if (stats && isFiniteV(current) && stats.max > stats.min) {
    const pos = (current - stats.min) / (stats.max - stats.min);
    /* Color: position 0..1, polarity says whether low or high is good */
    const color = scoreColor(pos, polarity);
    const left = Math.max(0, Math.min(100, pos * 100));
    body = (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded relative overflow-hidden">
          {/* avg marker */}
          {isFiniteV(stats.avg) && stats.max > stats.min && (
            <div className="absolute top-0 bottom-0 w-px bg-slate-400 dark:bg-slate-500" style={{ left: ((stats.avg - stats.min) / (stats.max - stats.min)) * 100 + "%" }} />
          )}
          {/* current dot */}
          <div className="absolute top-1/2 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900"
               style={{ left: left + "%", transform: "translate(-50%, -50%)", background: color }} />
        </div>
        <div className="flex items-baseline gap-1.5 w-32 justify-end">
          <span className="text-[9px] text-gray-400 dark:text-slate-500 tabular-nums">{fmtValue(stats.min, fmt)}</span>
          <span className="text-[10px] text-gray-300 dark:text-slate-600">–</span>
          <span className="text-[9px] text-gray-400 dark:text-slate-500 tabular-nums">{fmtValue(stats.max, fmt)}</span>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="text-[10px] text-gray-300 dark:text-slate-600 italic">No 5Y range</div>
    );
  }

  return (
    <div className="grid items-center gap-2 py-0.5" style={{ gridTemplateColumns: "100px 65px 1fr" }}>
      <span className="text-[11px] text-gray-700 dark:text-slate-300">{label}</span>
      <span className="text-[12px] tabular-nums font-semibold text-gray-900 dark:text-slate-100">{fmtCur}</span>
      <div>{body}</div>
    </div>
  );
}

function scoreColor(pos, polarity) {
  /* pos in [0,1]. Higher polarity = high pos = good. Lower polarity = low pos = good. */
  if (polarity === "lower") {
    /* low pos (cheap) = green, high pos (expensive) = red */
    if (pos < 0.33) return "#16a34a";
    if (pos < 0.67) return "#ca8a04";
    return "#dc2626";
  }
  /* "higher": high pos = green */
  if (pos > 0.67) return "#16a34a";
  if (pos > 0.33) return "#ca8a04";
  return "#dc2626";
}

function fmtValue(v, kind) {
  if (!isFiniteV(v)) return "--";
  if (kind === "x") return v.toFixed(1) + "x";
  if (kind === "pct") return (v * 100).toFixed(1) + "%";
  return v.toFixed(2);
}
