/* Company Dashboard — "story at a glance" overview tab.
 *
 * Four tiles in a 2×2 responsive grid:
 *   1. Growth Engine      — revenue bars + YoY growth line
 *   2. Margin Ladder      — Gross / Operating / Net margins over time
 *   3. Returns on Capital — ROE / ROA / ROIC over time
 *   4. Valuation Context  — P/E line with 5Y low/high/avg/med bands
 *
 * All four read from company.financials and/or company.ratios (and
 * company.valuation for the 5Y P/E band). Tiles render their own empty
 * state when their source series is missing, so the dashboard is still
 * useful when only some data has been uploaded.
 */

import { pickSeries, yoyGrowth, cagr, minMaxAcross, fmtPct } from './overviewCharts.js';

const TILE = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3";
const HIST_COLOR = "#2563eb"; /* blue-600 */
const EST_COLOR  = "#ea580c"; /* orange-600 */
const GRID_COLOR = "rgba(100,116,139,0.12)"; /* slate-500 @ 12% */

export default function CompanyDashboard({ company }) {
  const hasFin  = !!(company && company.financials && company.financials.years && company.financials.years.length > 0);
  const hasRat  = !!(company && company.ratios && company.ratios.years && company.ratios.years.length > 0);

  if (!hasFin && !hasRat) {
    return (
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Overview Dashboard</div>
        <div className="text-sm text-gray-500 dark:text-slate-400 py-6 italic">
          No financials or ratio data yet. Upload via <b>Data Hub → Financials</b> and <b>Data Hub → Ratio Analysis</b> to populate this view.
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-3">Overview Dashboard</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <GrowthEngine       company={company} />
        <MarginLadder       company={company} />
        <ReturnsOnCapital   company={company} />
        <ValuationContext   company={company} />
      </div>
    </div>
  );
}

/* ========================================================================
 * TILE 1 — Growth Engine
 * Bars for revenue (historical blue, estimate orange) + YoY growth line.
 * ====================================================================== */
function GrowthEngine({ company }) {
  const sales = pickSeries(company, "Sales") || pickSeries(company, "Revenue");
  if (!sales) return <Tile title="Growth Engine" empty="No Sales / Revenue series" />;

  const growth = yoyGrowth(sales.values);
  const histOnly = sales.values.map(function (v, i) { return sales.estimate[i] ? null : v; });
  const estOnly  = sales.values.map(function (v, i) { return sales.estimate[i] ? v    : null; });
  const histGrowth = cagr(histOnly);
  const fwdGrowth  = cagr(estOnly);

  const W = 520, H = 220, PAD_T = 10, PAD_B = 30, PAD_L = 36, PAD_R = 40;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = sales.years.length;
  const [vMin, vMax] = minMaxAcross([sales.values]);
  const yBase = Math.min(0, vMin);
  const yTop = vMax * 1.05;
  const bw = (innerW / n) * 0.7;
  const bgap = (innerW / n) * 0.3;

  function xOf(i) { return PAD_L + (i + 0.5) * (innerW / n); }
  function yOf(v) { return PAD_T + (1 - (v - yBase) / (yTop - yBase)) * innerH; }

  /* Right-axis for growth (percent) */
  const gVals = growth.filter(function (v) { return v !== null && isFinite(v); });
  const gMin = gVals.length ? Math.min.apply(null, gVals.concat([0])) : 0;
  const gMax = gVals.length ? Math.max.apply(null, gVals.concat([0])) : 1;
  const gSpan = Math.max(0.1, gMax - gMin) * 1.2;
  const gYBase = gMin - (gSpan - (gMax - gMin)) / 2;
  function yOfGrowth(g) {
    if (g === null || !isFinite(g)) return null;
    return PAD_T + (1 - (g - gYBase) / gSpan) * innerH;
  }

  /* Split growth line into (historical, estimate) segments so we can
     style the estimate portion with a dashed stroke. Includes a dashed
     bridge across the historical→estimate boundary. */
  function buildGrowthSegments() {
    const segs = [];
    let cur = null;
    for (let i = 0; i < growth.length; i++) {
      const g = growth[i];
      const y = yOfGrowth(g);
      if (y === null) { if (cur) { segs.push(cur); cur = null; } continue; }
      const est = !!sales.estimate[i];
      if (!cur) { cur = { est: est, pts: [[xOf(i), y]] }; }
      else if (cur.est === est) { cur.pts.push([xOf(i), y]); }
      else {
        segs.push(cur);
        const last = cur.pts[cur.pts.length - 1];
        const newPt = [xOf(i), y];
        segs.push({ isBridge: true, pts: [last, newPt] });
        cur = { est: est, pts: [newPt] };
      }
    }
    if (cur) segs.push(cur);
    return segs;
  }
  const growthSegs = buildGrowthSegments();

  return (
    <Tile title="Growth Engine" subtitle="Revenue + YoY growth">
      <svg width="100%" height={H} viewBox={"0 0 " + W + " " + H} role="img" aria-label="Revenue and growth">
        <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="none" stroke={GRID_COLOR} />
        {/* Zero line if y range includes 0 */}
        {yBase < 0 && yTop > 0 && (
          <line x1={PAD_L} y1={yOf(0)} x2={PAD_L + innerW} y2={yOf(0)} stroke={GRID_COLOR} />
        )}
        {/* Bars */}
        {sales.values.map(function (v, i) {
          if (v === null || !isFinite(v)) return null;
          const x = xOf(i) - bw / 2;
          const y = yOf(Math.max(v, 0));
          const h = Math.abs(yOf(v) - yOf(0));
          const color = sales.estimate[i] ? EST_COLOR : HIST_COLOR;
          return <rect key={i} x={x} y={y} width={bw} height={h} fill={color} opacity="0.75" />;
        })}
        {/* Growth line — solid for historical, dashed for estimate, dashed bridge between */}
        {growthSegs.map(function (s, i) {
          const d = s.pts.map(function (p, j) { return (j === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
          const dash = (s.est || s.isBridge) ? "4 3" : undefined;
          return <path key={i} d={d} fill="none" stroke="#16a34a" strokeWidth="1.75" strokeDasharray={dash} />;
        })}
        {growthSegs.filter(function (s) { return !s.isBridge; }).map(function (s, i) {
          return s.pts.map(function (p, j) { return <circle key={i + "-" + j} cx={p[0]} cy={p[1]} r="2" fill="#16a34a" />; });
        })}
        {/* X labels — every other year to avoid crowding */}
        {sales.years.map(function (yr, i) {
          const step = n > 10 ? 2 : 1;
          if (i % step !== 0 && i !== n - 1) return null;
          return <text key={i} x={xOf(i)} y={H - 12} fontSize="9" textAnchor="middle" fill="#64748b">{String(yr).slice(2)}</text>;
        })}
        {/* Left axis: sales scale */}
        <text x={PAD_L - 4} y={PAD_T + 10} fontSize="9" textAnchor="end" fill="#64748b">{fmtBn(yTop)}</text>
        <text x={PAD_L - 4} y={PAD_T + innerH} fontSize="9" textAnchor="end" fill="#64748b">{fmtBn(yBase)}</text>
        {/* Right axis: growth scale */}
        <text x={PAD_L + innerW + 4} y={PAD_T + 10} fontSize="9" textAnchor="start" fill="#16a34a">{(gYBase * 100 + gSpan * 100).toFixed(0)}%</text>
        <text x={PAD_L + innerW + 4} y={PAD_T + innerH} fontSize="9" textAnchor="start" fill="#16a34a">{(gYBase * 100).toFixed(0)}%</text>
      </svg>
      <Callouts
        items={[
          { label: "Hist CAGR", value: fmtPct(histGrowth), color: HIST_COLOR },
          { label: "Fwd CAGR",  value: fmtPct(fwdGrowth),  color: EST_COLOR },
        ]}
      />
    </Tile>
  );
}

/* ========================================================================
 * TILE 2 — Margin Ladder
 * 3 lines: Gross / Operating / Net margins.
 * ====================================================================== */
function MarginLadder({ company }) {
  const gm = pickSeries(company, "Gross Margin");
  const om = pickSeries(company, "Operating Margin");
  const nm = pickSeries(company, "Net Margin");
  if (!gm && !om && !nm) return <Tile title="Margin Ladder" empty="No margin series" />;

  const base = gm || om || nm;
  const series = [
    { name: "Gross",     s: gm, color: "#059669" },
    { name: "Operating", s: om, color: "#2563eb" },
    { name: "Net",       s: nm, color: "#7c3aed" },
  ].filter(function (x) { return x.s; });

  return (
    <Tile title="Margin Ladder" subtitle="Gross / Operating / Net margins">
      <MultiLineChart
        years={base.years}
        estimate={base.estimate}
        series={series.map(function (x) {
          return { label: x.name, values: toDecimalPct(alignToYears(x.s, base.years)), color: x.color };
        })}
        formatY={function (v) { return (v * 100).toFixed(0) + "%"; }}
      />
      <div className="flex flex-wrap gap-3 text-[10px] text-gray-500 dark:text-slate-400 mt-1">
        {series.map(function (x) {
          const last = lastFinite(toDecimalPct(x.s.values));
          return (
            <span key={x.name} className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ background: x.color }} />
              {x.name}: <span className="tabular-nums font-medium text-gray-900 dark:text-slate-100">{last !== null ? (last * 100).toFixed(1) + "%" : "--"}</span>
            </span>
          );
        })}
      </div>
    </Tile>
  );
}

/* ========================================================================
 * TILE 3 — Returns on Capital
 * 3 lines: ROE / ROA / ROIC.
 * ====================================================================== */
function ReturnsOnCapital({ company }) {
  const roe  = pickSeries(company, "Return on Equity", "ratios");
  const roa  = pickSeries(company, "Return on Assets", "ratios");
  const roic = pickSeries(company, "Return on Invested Capital", "ratios");
  if (!roe && !roa && !roic) return <Tile title="Returns on Capital" empty="No ROE / ROA / ROIC series" />;

  const base = roe || roa || roic;
  const series = [
    { name: "ROIC", s: roic, color: "#0891b2" },
    { name: "ROE",  s: roe,  color: "#2563eb" },
    { name: "ROA",  s: roa,  color: "#64748b" },
  ].filter(function (x) { return x.s; });

  return (
    <Tile title="Returns on Capital" subtitle="ROIC / ROE / ROA — capital efficiency">
      <MultiLineChart
        years={base.years}
        estimate={base.estimate}
        series={series.map(function (x) {
          return { label: x.name, values: toDecimalPct(alignToYears(x.s, base.years)), color: x.color };
        })}
        formatY={function (v) { return (v * 100).toFixed(0) + "%"; }}
        hlines={[{ v: 0.10, label: "10% CoC", color: "#ef4444" }]}
      />
      <div className="flex flex-wrap gap-3 text-[10px] text-gray-500 dark:text-slate-400 mt-1">
        {series.map(function (x) {
          const last = lastFinite(toDecimalPct(x.s.values));
          return (
            <span key={x.name} className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ background: x.color }} />
              {x.name}: <span className="tabular-nums font-medium text-gray-900 dark:text-slate-100">{last !== null ? (last * 100).toFixed(1) + "%" : "--"}</span>
            </span>
          );
        })}
      </div>
    </Tile>
  );
}

/* ========================================================================
 * TILE 4 — Valuation Context
 * Line: P/E over time. Horizontal bands: 5Y low/high + avg/med markers.
 * ====================================================================== */
function ValuationContext({ company }) {
  const pe = pickSeries(company, "Price/Earnings", "ratios");
  const val = company && company.valuation;
  const peLow5  = val ? parseFloat(val.peLow5)  : NaN;
  const peHigh5 = val ? parseFloat(val.peHigh5) : NaN;
  const peAvg5  = val ? parseFloat(val.peAvg5)  : NaN;
  const peMed5  = val ? parseFloat(val.peMed5)  : NaN;
  const peCur   = val ? parseFloat(val.peCurrent) : NaN;
  const rangeValid = isFinite(peLow5) && isFinite(peHigh5);

  if (!pe && !rangeValid) return <Tile title="Valuation Context" empty="No P/E history or 5Y range" />;

  const years = pe ? pe.years : [];
  const vals = pe ? pe.values : [];
  const W = 520, H = 220, PAD_T = 10, PAD_B = 30, PAD_L = 36, PAD_R = 12;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = years.length;

  /* Y-scale includes 5Y range so the bands are visible. */
  const rangeVals = [peLow5, peHigh5, peAvg5, peMed5, peCur].filter(function (v) { return isFinite(v); });
  const [vMin, vMax] = minMaxAcross([vals, rangeVals]);
  const yPad = (vMax - vMin) * 0.08 || 1;
  const yMin = vMin - yPad, yMax = vMax + yPad;

  function xOf(i) { return n <= 1 ? PAD_L + innerW / 2 : PAD_L + (i / (n - 1)) * innerW; }
  function yOf(v) { return PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH; }

  /* Segmented P/E line (historical blue, estimate orange). */
  function segmentedPath() {
    if (!pe) return [];
    const segs = [];
    let cur = null;
    for (let i = 0; i < n; i++) {
      const v = vals[i];
      if (v === null || !isFinite(v)) { if (cur) { segs.push(cur); cur = null; } continue; }
      const e = pe.estimate[i];
      if (!cur) { cur = { e: e, pts: [[xOf(i), yOf(v)]] }; }
      else if (cur.e === e) cur.pts.push([xOf(i), yOf(v)]);
      else { segs.push(cur); cur = { e: e, pts: [[xOf(i), yOf(v)]] }; }
    }
    if (cur) segs.push(cur);
    return segs;
  }
  const segs = segmentedPath();

  /* Current P/E status vs 5Y range — green if bottom third, red if top third. */
  let curColor = "#64748b";
  if (isFinite(peCur) && rangeValid) {
    const pos = (peCur - peLow5) / (peHigh5 - peLow5);
    curColor = pos < 0.33 ? "#16a34a" : pos < 0.67 ? "#ca8a04" : "#dc2626";
  }

  return (
    <Tile title="Valuation Context" subtitle="Current P/E vs. 5Y low / high / avg / median">
      <svg width="100%" height={H} viewBox={"0 0 " + W + " " + H} role="img">
        <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="none" stroke={GRID_COLOR} />
        {/* 5Y band */}
        {rangeValid && (
          <>
            <rect x={PAD_L} y={yOf(peHigh5)} width={innerW} height={yOf(peLow5) - yOf(peHigh5)}
              fill="#e2e8f0" fillOpacity="0.55" />
            {isFinite(peAvg5) && (
              <line x1={PAD_L} y1={yOf(peAvg5)} x2={PAD_L + innerW} y2={yOf(peAvg5)} stroke="#94a3b8" strokeDasharray="3 3" />
            )}
            {isFinite(peMed5) && (
              <line x1={PAD_L} y1={yOf(peMed5)} x2={PAD_L + innerW} y2={yOf(peMed5)} stroke="#64748b" strokeDasharray="2 4" />
            )}
            <text x={PAD_L + 4} y={yOf(peHigh5) + 11} fontSize="9" fill="#64748b">High {peHigh5.toFixed(1)}</text>
            <text x={PAD_L + 4} y={yOf(peLow5)  -  4} fontSize="9" fill="#64748b">Low  {peLow5.toFixed(1)}</text>
          </>
        )}
        {/* P/E line */}
        {segs.map(function (s, i) {
          const d = s.pts.map(function (p, j) { return (j === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
          return <path key={i} d={d} fill="none" stroke={s.e ? EST_COLOR : HIST_COLOR} strokeWidth="1.75" />;
        })}
        {/* Current P/E marker — positioned at the historical/estimate boundary
           on the x-axis, so it sits "between" the solid historical line and
           the dashed forward estimate line. */}
        {isFinite(peCur) && rangeValid && (function () {
          let transX = PAD_L + innerW;
          /* Find the last historical year and first estimate year;
             center the dot between them. */
          let lastHistIdx = -1, firstEstIdx = -1;
          for (let i = 0; i < n; i++) {
            if (pe && pe.estimate[i]) { firstEstIdx = i; break; }
            lastHistIdx = i;
          }
          if (lastHistIdx >= 0 && firstEstIdx >= 0) {
            transX = (xOf(lastHistIdx) + xOf(firstEstIdx)) / 2;
          } else if (lastHistIdx >= 0) {
            transX = xOf(lastHistIdx);
          } else if (firstEstIdx >= 0) {
            transX = xOf(firstEstIdx);
          }
          return (
            <g>
              <line x1={PAD_L} y1={yOf(peCur)} x2={PAD_L + innerW} y2={yOf(peCur)} stroke={curColor} strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
              <circle cx={transX} cy={yOf(peCur)} r="4.5" fill={curColor} stroke="white" strokeWidth="1.5" />
              <text x={transX + 8} y={yOf(peCur) + 3} fontSize="10" fill={curColor} fontWeight="600">Now {peCur.toFixed(1)}x</text>
            </g>
          );
        })()}
        {/* X labels */}
        {years.map(function (yr, i) {
          const step = n > 10 ? 2 : 1;
          if (i % step !== 0 && i !== n - 1) return null;
          return <text key={i} x={xOf(i)} y={H - 12} fontSize="9" textAnchor="middle" fill="#64748b">{String(yr).slice(2)}</text>;
        })}
        {/* Y labels */}
        <text x={PAD_L - 4} y={PAD_T + 10} fontSize="9" textAnchor="end" fill="#64748b">{yMax.toFixed(0)}x</text>
        <text x={PAD_L - 4} y={PAD_T + innerH} fontSize="9" textAnchor="end" fill="#64748b">{yMin.toFixed(0)}x</text>
      </svg>
      <Callouts
        items={[
          { label: "Current", value: isFinite(peCur) ? peCur.toFixed(1) + "x" : "--", color: curColor },
          { label: "5Y Avg",  value: isFinite(peAvg5) ? peAvg5.toFixed(1) + "x" : "--" },
          { label: "5Y Med",  value: isFinite(peMed5) ? peMed5.toFixed(1) + "x" : "--" },
        ]}
      />
    </Tile>
  );
}

/* ========================================================================
 * Small reusable bits
 * ====================================================================== */

function Tile({ title, subtitle, empty, children }) {
  if (empty) {
    return (
      <div className={TILE}>
        <div className="flex items-baseline gap-2 mb-2">
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</div>
        </div>
        <div className="text-xs text-gray-400 dark:text-slate-500 italic py-8 text-center">{empty}</div>
      </div>
    );
  }
  return (
    <div className={TILE}>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</div>
        {subtitle && <div className="text-[10px] text-gray-500 dark:text-slate-400">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Callouts({ items }) {
  return (
    <div className="flex gap-4 mt-1 text-[10px] text-gray-500 dark:text-slate-400">
      {items.map(function (it, i) {
        return (
          <div key={i} className="flex items-baseline gap-1">
            <span className="uppercase tracking-wide">{it.label}:</span>
            <span className="tabular-nums font-semibold" style={{ color: it.color || undefined }}>{it.value}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Multi-series line chart. Series format: [{ label, values, color }].
 * Values must already be normalized (decimal for percents: 0.385 = 38.5%).
 * Null values break lines. hlines: [{ v, label, color }] with v in same
 * units as series values. estimate[] drives dashing — segments crossing
 * the historical/estimate boundary render dashed. */
function MultiLineChart({ years, estimate, series, formatY, hlines }) {
  const W = 520, H = 220, PAD_T = 10, PAD_B = 30, PAD_L = 42, PAD_R = 10;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = years.length;

  const allVals = series.map(function (s) { return s.values; });
  const hlineVals = (hlines || []).map(function (h) { return [h.v]; });
  const [vMin, vMax] = minMaxAcross(allVals.concat(hlineVals));
  const yPad = (vMax - vMin) * 0.1 || 0.01;
  const yMin = vMin - yPad, yMax = vMax + yPad;

  function xOf(i) { return n <= 1 ? PAD_L + innerW / 2 : PAD_L + (i / (n - 1)) * innerW; }
  function yOf(v) { return PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH; }

  /* Walk a values array and emit segments labeled by estimate flag.
     Bridge segments between historical and estimate are also emitted
     so the line is continuous across the boundary (rendered dashed). */
  function segmentsFor(values) {
    const segs = [];
    let cur = null;
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (v === null || !isFinite(v)) { if (cur) { segs.push(cur); cur = null; } continue; }
      const est = !!estimate[i];
      if (!cur) { cur = { est: est, pts: [[xOf(i), yOf(v)]] }; }
      else if (cur.est === est) { cur.pts.push([xOf(i), yOf(v)]); }
      else {
        segs.push(cur);
        const last = cur.pts[cur.pts.length - 1];
        const newPt = [xOf(i), yOf(v)];
        segs.push({ isBridge: true, pts: [last, newPt] });
        cur = { est: est, pts: [newPt] };
      }
    }
    if (cur) segs.push(cur);
    return segs;
  }

  function fmtLabel(v) { return formatY ? formatY(v) : v.toFixed(2); }

  return (
    <svg width="100%" height={H} viewBox={"0 0 " + W + " " + H} role="img">
      <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="none" stroke={GRID_COLOR} />
      {/* Horizontal reference lines */}
      {(hlines || []).map(function (h, i) {
        if (!isFinite(h.v) || h.v < yMin || h.v > yMax) return null;
        const y = yOf(h.v);
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={PAD_L + innerW} y2={y} stroke={h.color || "#64748b"} strokeDasharray="3 3" opacity="0.7" />
            {h.label && <text x={PAD_L + innerW - 4} y={y - 3} fontSize="9" textAnchor="end" fill={h.color || "#64748b"}>{h.label}</text>}
          </g>
        );
      })}
      {/* Series lines — solid for historical, dashed for estimate + bridge */}
      {series.map(function (s, si) {
        return segmentsFor(s.values).map(function (seg, i) {
          const d = seg.pts.map(function (p, j) { return (j === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
          const dash = (seg.est || seg.isBridge) ? "4 3" : undefined;
          const opacity = seg.isBridge ? 0.6 : 1;
          return <path key={si + "-" + i} d={d} fill="none" stroke={s.color} strokeWidth="1.75" strokeDasharray={dash} opacity={opacity} />;
        });
      })}
      {/* X labels */}
      {years.map(function (yr, i) {
        const step = n > 10 ? 2 : 1;
        if (i % step !== 0 && i !== n - 1) return null;
        const est = estimate[i];
        return <text key={i} x={xOf(i)} y={H - 12} fontSize="9" textAnchor="middle" fill={est ? EST_COLOR : "#64748b"}>{String(yr).slice(2)}</text>;
      })}
      {/* Y labels */}
      <text x={PAD_L - 4} y={PAD_T + 10} fontSize="9" textAnchor="end" fill="#64748b">{fmtLabel(yMax)}</text>
      <text x={PAD_L - 4} y={PAD_T + innerH} fontSize="9" textAnchor="end" fill="#64748b">{fmtLabel(yMin)}</text>
    </svg>
  );
}

/* ------------------------------------------------------------------------
 * helpers local to this file
 * ---------------------------------------------------------------------- */

/* Normalize a percent-valued series to decimal form. FactSet pastes
 * margins/returns as raw percent (e.g. 38.59 for 38.59%). If the first
 * finite sample has |v| > 1.5 we assume raw percent and divide by 100.
 * Otherwise we leave the array alone (already decimal). Null/NaN pass
 * through untouched. */
function toDecimalPct(values) {
  if (!values) return [];
  const sample = values.find(function (v) { return v !== null && v !== undefined && isFinite(v); });
  if (sample === undefined) return values;
  const rawAsPct = Math.abs(sample) > 1.5;
  if (!rawAsPct) return values;
  return values.map(function (v) { return v === null || !isFinite(v) ? null : v * 0.01; });
}

function lastFinite(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== null && v !== undefined && isFinite(v)) return v;
  }
  return null;
}

function alignToYears(series, years) {
  /* If series.years matches `years`, return as-is. Otherwise map values
     by year. */
  if (series.years.length === years.length && series.years.every(function (y, i) { return y === years[i]; })) {
    return series.values;
  }
  const byYear = {};
  series.years.forEach(function (y, i) { byYear[y] = series.values[i]; });
  return years.map(function (y) { return byYear[y] === undefined ? null : byYear[y]; });
}

function fmtBn(v) {
  if (v === null || v === undefined || !isFinite(v)) return "";
  const a = Math.abs(v);
  if (a >= 1000) return (v / 1000).toFixed(1) + "B";
  return v.toFixed(0);
}
