/* E[EPS] Revisions tab on the Company Detail page.
 *
 * Shows two charts side by side:
 *   1. Line chart of monthly EPS estimates over the past ~13 months,
 *      one line per fiscal-year horizon (FY0 actual + FY+1 / +2 / +3
 *      forwards). Lets you see the directional trend in consensus.
 *   2. Bar chart of % change for each forward horizon (FY+1, +2, +3)
 *      across four lookback windows: 1mo, 3mo, 6mo, 1Y. Quickly
 *      surfaces upward or downward revisions of consensus.
 *
 * Data shape on the company:
 *   selCo.epsRevisions = {
 *     asOf, dates: [13 ISO dates oldest first],
 *     series: [{ horizon, label, anchor, monthly[13] }, ...]
 *   }
 */

import { useState } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { useConfirm } from '../ui/DialogProvider.jsx';

const TILE = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3";
const GRID_COLOR = "rgba(100,116,139,0.12)";
const TICK_COLOR = "rgba(100,116,139,0.18)";

/* Color per horizon (FY0, FY+1, FY+2, FY+3). FY0 is darker/black-ish,
 * forwards in distinct primary colors so the user can match line and bar
 * legends easily. */
const HORIZON_COLORS = ["#0f172a", "#2563eb", "#dc2626", "#64748b"];

function niceTicks(min, max, target) {
  if (!isFinite(min) || !isFinite(max) || max <= min) return [];
  const t = target || 5;
  const range = max - min;
  const rawStep = range / t;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 4) step = 2.5;
  else if (norm < 7) step = 5;
  else step = 10;
  step *= mag;
  const start = Math.ceil(min / step) * step;
  const out = [];
  for (let v = start; v <= max + 1e-9; v += step) {
    out.push(Math.abs(v) < step / 1e6 ? 0 : v);
  }
  return out;
}

function fmtVal(v, dp) {
  if (v === null || v === undefined || !isFinite(v)) return "--";
  return v.toFixed(dp == null ? 2 : dp);
}

function fmtPct(v, dp) {
  if (v === null || v === undefined || !isFinite(v)) return "--";
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(dp == null ? 1 : dp) + "%";
}

function fmtDateShort(iso) {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return m[2] + "/" + m[3].slice(0) + "/" + m[1].slice(2);  /* MM/DD/YY */
}

export default function EpsRevisionsTab({ company }) {
  const { setCompanies } = useCompanyContext();
  const confirm = useConfirm();
  const data = company && company.epsRevisions;
  const hasData = !!(data && data.dates && data.dates.length > 0 && data.series && data.series.length > 0);

  function clearData() {
    confirm("Clear EPS revisions data for " + (company.name || "this company") + "?").then(function (ok) {
      if (!ok) return;
      const updated = Object.assign({}, company);
      delete updated.epsRevisions;
      setCompanies(function (cs) { return cs.map(function (c) { return c.id === updated.id ? updated : c; }); });
    });
  }

  if (!hasData) {
    return (
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">EPS Estimate Revisions</div>
        <div className="text-sm text-gray-500 dark:text-slate-400 py-6 italic">
          No EPS revisions data yet. Upload via <b>Data Hub → E[EPS]</b> — paste your monthly-revision spreadsheet (one row per company, 56 data columns covering 4 fiscal horizons × 13 months each).
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">EPS Estimate Revisions</div>
        {data.asOf && (
          <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">
            Last updated {new Date(data.asOf).toLocaleDateString()}
          </span>
        )}
        <div className="ml-auto flex gap-2 items-center">
          <span className="text-[11px] text-gray-400 dark:text-slate-500 italic">
            Refresh via Data Hub → E[EPS]
          </span>
          <button onClick={clearData} className="text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Clear</button>
        </div>
      </div>

      {/* Compute fiscal-year-end labels (e.g. "12/25", "3/26") so the
          horizon series get real dates instead of "+0/+1/+2/+3". Uses
          the company's segments.fiscalYearEndMonth if uploaded;
          defaults to December otherwise. */}
      {(function () {
        const fyMonth = (company && company.segments && company.segments.fiscalYearEndMonth)
          ? company.segments.fiscalYearEndMonth
          : 12;
        const lastDate = data.dates[data.dates.length - 1];
        const labeled = data.series.map(function (s) {
          return Object.assign({}, s, { label: fyLabel(lastDate, fyMonth, s.horizon) });
        });
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <RevisionsLineChart dates={data.dates} series={labeled} />
            <RevisionsBarChart series={labeled} />
          </div>
        );
      })()}
    </div>
  );
}

/* Compute the fiscal-year end label for a horizon. EPS0 = most recently
 * completed FY at lastDate; +1/+2/+3 are forwards. Returns "M/YY". */
function fyLabel(lastIso, fyEndMonth, horizon) {
  const m = String(lastIso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "FY+" + horizon;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  /* FY0 = most recently completed fiscal year at lastIso */
  let fy0Year;
  if (mo > fyEndMonth) fy0Year = y;
  else if (mo === fyEndMonth) fy0Year = day >= 28 ? y : y - 1;
  else fy0Year = y - 1;
  const target = fy0Year + horizon;
  return fyEndMonth + "/" + String(target).slice(2);
}

/* =========================================================================
 * Tile 1 — line chart of monthly EPS estimate progression
 * ======================================================================= */
function RevisionsLineChart({ dates, series }) {
  const W = 600, H = 280, PAD_T = 16, PAD_B = 28, PAD_L = 50, PAD_R = 16;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = dates.length;

  /* Y-range across all series' monthly values. */
  const allVals = [];
  series.forEach(function (s) {
    (s.monthly || []).forEach(function (v) {
      if (v !== null && v !== undefined && isFinite(v)) allVals.push(v);
    });
  });
  if (allVals.length === 0) {
    return (
      <div className={TILE}>
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Monthly Estimate Trend</div>
        <div className="text-xs text-gray-400 dark:text-slate-500 italic py-6 text-center">No estimate data</div>
      </div>
    );
  }
  const vMin = Math.min.apply(null, allVals);
  const vMax = Math.max.apply(null, allVals);
  const pad = (vMax - vMin) * 0.1 || Math.max(0.5, Math.abs(vMax) * 0.1);
  const yMin = vMin - pad;
  const yMax = vMax + pad;

  function xOf(i) { return n <= 1 ? PAD_L + innerW / 2 : PAD_L + (i / (n - 1)) * innerW; }
  function yOf(v) { return PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH; }

  const ticks = niceTicks(yMin, yMax, 5);

  return (
    <div className={TILE}>
      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Monthly Estimate Trend</div>
      <div className="flex items-stretch gap-3">
        <svg className="flex-1" width="100%" height={H} viewBox={"0 0 " + W + " " + H} preserveAspectRatio="xMidYMid meet" role="img" aria-label="EPS estimate revisions">
          <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="none" stroke={GRID_COLOR} />
          {ticks.map(function (t, i) {
            const y = yOf(t);
            return (
              <g key={"t-" + i}>
                <line x1={PAD_L} y1={y} x2={PAD_L + innerW} y2={y} stroke={TICK_COLOR} />
                <text x={PAD_L - 6} y={y + 3} fontSize="9" textAnchor="end" fill="#64748b">{fmtVal(t)}</text>
              </g>
            );
          })}
          {/* Series lines */}
          {series.map(function (s, si) {
            const segs = [];
            let cur = null;
            for (let i = 0; i < n; i++) {
              const v = s.monthly[i];
              if (v === null || v === undefined || !isFinite(v)) {
                if (cur) { segs.push(cur); cur = null; }
                continue;
              }
              const pt = [xOf(i), yOf(v)];
              if (!cur) cur = { pts: [pt] };
              else cur.pts.push(pt);
            }
            if (cur) segs.push(cur);
            const color = HORIZON_COLORS[s.horizon] || "#64748b";
            return segs.map(function (sg, idx) {
              const d = sg.pts.map(function (p, j) { return (j === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
              return <path key={si + "-" + idx} d={d} fill="none" stroke={color} strokeWidth="2" />;
            });
          })}
          {/* X labels — every other date to avoid crowding */}
          {dates.map(function (d, i) {
            const step = n > 7 ? 2 : 1;
            if (i % step !== 0 && i !== n - 1) return null;
            return <text key={i} x={xOf(i)} y={H - 10} fontSize="9" textAnchor="middle" fill="#64748b">{fmtDateShort(d)}</text>;
          })}
        </svg>
        {/* Latest values panel — vertical list to the right of the chart */}
        <div className="shrink-0 flex flex-col justify-center gap-1.5 pl-2 pr-1 border-l border-slate-100 dark:border-slate-800" style={{ minWidth: 100 }}>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500">Latest</div>
          {series.map(function (s) {
            const last = s.monthly[s.monthly.length - 1];
            const color = HORIZON_COLORS[s.horizon] || "#64748b";
            return (
              <div key={s.horizon} className="flex items-baseline gap-1.5 text-[11px]">
                <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
                <span className="text-gray-600 dark:text-slate-400">{s.label}</span>
                <span className="tabular-nums font-semibold ml-auto" style={{ color: color }}>{fmtVal(last, 2)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
 * Tile 2 — bar chart of % revision change over 1mo / 3mo / 6mo / 1Y
 * ======================================================================= */
function RevisionsBarChart({ series }) {
  /* Skip FY0 (last completed — % change vs estimate isn't actionable
     since the actual is now fixed). Show only forward horizons. */
  const fwdSeries = series.filter(function (s) { return s.horizon > 0; });

  /* Lookback windows: index offset back from the most-recent monthly point. */
  const WINDOWS = [
    { label: "1 Mo Change",  back: 1 },
    { label: "3 Mo Change",  back: 3 },
    { label: "6 Mo Change",  back: 6 },
    { label: "1 Yr Change",  back: 12 },
  ];

  /* Compute % changes per (window × series). */
  function pctChange(s, back) {
    if (!s.monthly || s.monthly.length === 0) return null;
    const last = s.monthly[s.monthly.length - 1];
    const earlierIdx = s.monthly.length - 1 - back;
    if (earlierIdx < 0) return null;
    const earlier = s.monthly[earlierIdx];
    if (last === null || !isFinite(last) || earlier === null || !isFinite(earlier) || earlier === 0) return null;
    return (last - earlier) / Math.abs(earlier);
  }

  const cells = WINDOWS.map(function (w) {
    return {
      label: w.label,
      values: fwdSeries.map(function (s) { return { horizon: s.horizon, pct: pctChange(s, w.back) }; }),
    };
  });

  /* Y-range across all bar values, padded for visual breathing room. */
  const allVals = [];
  cells.forEach(function (c) { c.values.forEach(function (v) { if (v.pct !== null && isFinite(v.pct)) allVals.push(v.pct); }); });
  if (allVals.length === 0) {
    return (
      <div className={TILE}>
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Revision % Change</div>
        <div className="text-xs text-gray-400 dark:text-slate-500 italic py-6 text-center">Not enough history to compute revisions</div>
      </div>
    );
  }
  const vMin = Math.min.apply(null, allVals.concat([0]));
  const vMax = Math.max.apply(null, allVals.concat([0]));
  const pad = (vMax - vMin) * 0.15 || 0.02;
  const yMin = vMin - pad;
  const yMax = vMax + pad;

  const W = 600, H = 280, PAD_T = 16, PAD_B = 38, PAD_L = 50, PAD_R = 16;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const groupW = innerW / cells.length;
  const barW = (groupW * 0.7) / Math.max(1, fwdSeries.length);

  function yOf(v) { return PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH; }
  function xOfGroup(i) { return PAD_L + i * groupW + groupW / 2; }

  const ticks = niceTicks(yMin, yMax, 5);

  return (
    <div className={TILE}>
      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Revision % Change</div>
      <svg width="100%" height={H} viewBox={"0 0 " + W + " " + H} role="img" aria-label="EPS revision % changes">
        <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="none" stroke={GRID_COLOR} />
        {ticks.map(function (t, i) {
          const y = yOf(t);
          return (
            <g key={"t-" + i}>
              <line x1={PAD_L} y1={y} x2={PAD_L + innerW} y2={y} stroke={TICK_COLOR} />
              <text x={PAD_L - 6} y={y + 3} fontSize="9" textAnchor="end" fill="#64748b">{(t * 100).toFixed(0) + "%"}</text>
            </g>
          );
        })}
        {/* Zero baseline (heavier than gridlines) */}
        {yMin < 0 && yMax > 0 && (
          <line x1={PAD_L} y1={yOf(0)} x2={PAD_L + innerW} y2={yOf(0)} stroke="#64748b" strokeWidth="1" />
        )}
        {/* Grouped bars + value labels above each bar */}
        {cells.map(function (cell, ci) {
          const cx = xOfGroup(ci);
          const totalGroupW = barW * fwdSeries.length;
          return (
            <g key={ci}>
              {cell.values.map(function (v, si) {
                if (v.pct === null || !isFinite(v.pct)) return null;
                const x = cx - totalGroupW / 2 + si * barW;
                const y0 = yOf(0);
                const yv = yOf(v.pct);
                const top = Math.min(y0, yv);
                const h = Math.abs(y0 - yv);
                const color = HORIZON_COLORS[v.horizon] || "#64748b";
                /* Label sits ABOVE positive bars, BELOW negative bars,
                   so it's always on the "outside" of the bar end. */
                const labelY = v.pct >= 0 ? yv - 3 : yv + 9;
                return (
                  <g key={si}>
                    <rect x={x} y={top} width={barW * 0.9} height={Math.max(1, h)} fill={color} opacity="0.85">
                      <title>{cell.label + ": " + fmtPct(v.pct)}</title>
                    </rect>
                    <text
                      x={x + (barW * 0.9) / 2}
                      y={labelY}
                      fontSize="9"
                      textAnchor="middle"
                      fill={color}
                      fontWeight="600"
                    >
                      {fmtPct(v.pct, 1)}
                    </text>
                  </g>
                );
              })}
              <text x={cx} y={H - 18} fontSize="10" textAnchor="middle" fill="#64748b">{cell.label}</text>
            </g>
          );
        })}
      </svg>
      {/* Legend (forward series only) */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-gray-600 dark:text-slate-300">
        {fwdSeries.map(function (s) {
          const color = HORIZON_COLORS[s.horizon] || "#64748b";
          return (
            <span key={s.horizon} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />
              {s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
