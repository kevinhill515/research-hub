/* Per-company price chart.
 *
 * Pulls the ticker's daily series from prices_history (lazy-fetched via
 * usePriceHistory), filters to the selected period, and renders a small
 * SVG line chart. Features:
 *
 *   - Toggle between the company's ord and US tickers (when both exist).
 *   - Period buttons: YTD, 1Y, 2Y, 3Y, 4Y, 5Y, MAX.
 *   - 50- and 200-day moving averages as togglable overlays. MAs are
 *     computed against the full series (not the cropped window) so
 *     they're correct from day 1 of the visible range.
 *   - Click two points on the chart to measure the % change between
 *     them. First click sets A, second sets B, third resets to A.
 *   - Hover crosshair shows price + date for the nearest point.
 */

import { useState, useMemo, useRef } from "react";
import { usePriceHistory } from "../../hooks/usePriceHistory.js";

const PERIOD_OPTIONS = [
  { id: "YTD", label: "YTD" },
  { id: "1Y",  label: "1Y" },
  { id: "2Y",  label: "2Y" },
  { id: "3Y",  label: "3Y" },
  { id: "4Y",  label: "4Y" },
  { id: "5Y",  label: "5Y" },
  { id: "MAX", label: "MAX" },
];

/* Compute the cutoff ISO date for a period selection given today's date.
 * MAX returns null (no cutoff). YTD returns Jan 1 of the current year. */
function periodCutoff(period, today) {
  const t = today || new Date();
  if (period === "MAX") return null;
  if (period === "YTD") {
    const y = t.getFullYear();
    return y + "-01-01";
  }
  const yrs = parseInt(period, 10);
  if (!isFinite(yrs)) return null;
  const d = new Date(t);
  d.setFullYear(d.getFullYear() - yrs);
  return d.toISOString().slice(0, 10);
}

/* N-period simple moving average over a series of {d, p} points. Returns
 * an array the same length as the input where index i is the average of
 * points [i-N+1 .. i], or null if there aren't yet N points to average.
 *
 * We compute against the full series and slice to the visible window so
 * the MA at the start of the window uses the correct prior data. */
function movingAvg(series, n) {
  const out = new Array(series.length).fill(null);
  if (n <= 0) return out;
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i].p;
    if (i >= n) sum -= series[i - n].p;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/* Find the index of the series point with date >= cutoff. Returns 0 if
 * cutoff is before everything, series.length if after everything. */
function indexAtOrAfter(series, cutoff) {
  if (!cutoff) return 0;
  let lo = 0, hi = series.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].d < cutoff) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const W = 1000;
const H = 320;
const PAD_T = 16, PAD_B = 28, PAD_L = 56, PAD_R = 16;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;

/* Format a number for axis / tooltip display. Adapts decimals to
 * magnitude so JPY (¥3,234) and USD (75.09) both look right. */
function fmtPrice(v) {
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (a >= 10)   return v.toFixed(2);
  return v.toFixed(2);
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function PricesTab({ company }) {
  /* Resolve ord vs US tickers. Both are optional; if only one exists,
     the toggle still renders (single-button) so the layout is stable. */
  const tickers = (company && company.tickers) || [];
  const ord = tickers.find(function (t) { return t.isOrdinary; }) || tickers[0] || null;
  const us  = tickers.find(function (t) { return !t.isOrdinary && (t.currency || "USD").toUpperCase() === "USD"; })
            || tickers.find(function (t) { return t && t !== ord; })
            || null;
  const choices = [];
  if (ord && ord.ticker) choices.push({ key: "ord", label: ord.ticker, t: ord });
  if (us && us.ticker && (!ord || us.ticker !== ord.ticker)) choices.push({ key: "us", label: us.ticker, t: us });

  const [activeKey, setActiveKey] = useState(choices[0] ? choices[0].key : "ord");
  const active = (choices.find(function (c) { return c.key === activeKey; }) || choices[0] || { t: ord }).t;

  const [period, setPeriod] = useState("1Y");
  const [show50, setShow50] = useState(false);
  const [show200, setShow200] = useState(false);

  /* Two click points for the %-change measure tool. Each is a series
     index into the cropped (visible) array. null = unset. */
  const [pickA, setPickA] = useState(null);
  const [pickB, setPickB] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  const ph = usePriceHistory(active && active.ticker);
  const fullSeries = ph.series || [];

  /* Crop to visible period. moving averages computed against the FULL
     series, then sliced to align with the cropped indices. */
  const { visible, ma50Vis, ma200Vis } = useMemo(function () {
    if (!fullSeries.length) return { visible: [], ma50Vis: [], ma200Vis: [] };
    const cutoff = periodCutoff(period, new Date());
    const start = indexAtOrAfter(fullSeries, cutoff);
    const v = fullSeries.slice(start);
    const m50 = show50  ? movingAvg(fullSeries, 50).slice(start)  : [];
    const m200 = show200 ? movingAvg(fullSeries, 200).slice(start) : [];
    return { visible: v, ma50Vis: m50, ma200Vis: m200 };
  }, [fullSeries, period, show50, show200]);

  /* Reset picks when ticker / period changes — the indices wouldn't
     refer to the same dates anymore. */
  useMemo(function () { setPickA(null); setPickB(null); /* eslint-disable-next-line */ }, [activeKey, period, fullSeries.length]);

  const ccy = (active && active.currency) || "USD";

  if (!active || !active.ticker) {
    return (
      <div className="text-sm text-gray-500 dark:text-slate-400 italic p-4">
        No ticker on this company yet — add one on the Snapshot tab.
      </div>
    );
  }
  if (ph.loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-slate-400 italic p-4">
        Loading {active.ticker}…
      </div>
    );
  }
  if (ph.error) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400 p-4">
        Failed to load price history for {active.ticker}: {ph.error}
      </div>
    );
  }
  if (!fullSeries.length) {
    return (
      <div className="space-y-3">
        <TickerToggle choices={choices} activeKey={activeKey} setActiveKey={setActiveKey} />
        <div className="text-sm text-gray-500 dark:text-slate-400 italic">
          No price history for {active.ticker} yet. Upload via Data Hub → Price History, or wait for the daily script to populate.
        </div>
      </div>
    );
  }
  if (!visible.length) {
    return (
      <div className="space-y-3">
        <TickerToggle choices={choices} activeKey={activeKey} setActiveKey={setActiveKey} />
        <PeriodPicker period={period} setPeriod={setPeriod} />
        <div className="text-sm text-gray-500 dark:text-slate-400 italic">
          No data in the selected window. Try a longer period.
        </div>
      </div>
    );
  }

  /* Y-scale across the visible price line + any visible MA points. */
  const yPoints = visible.map(function (e) { return e.p; })
    .concat((ma50Vis  || []).filter(function (v) { return v !== null && isFinite(v); }))
    .concat((ma200Vis || []).filter(function (v) { return v !== null && isFinite(v); }));
  const vMin = Math.min.apply(null, yPoints);
  const vMax = Math.max.apply(null, yPoints);
  const span = vMax - vMin || Math.max(1, Math.abs(vMax));
  const yMin = vMin - span * 0.06;
  const yMax = vMax + span * 0.06;

  function xOf(i) {
    if (visible.length === 1) return PAD_L + INNER_W / 2;
    return PAD_L + (i / (visible.length - 1)) * INNER_W;
  }
  function yOf(v) {
    return PAD_T + (1 - (v - yMin) / (yMax - yMin)) * INNER_H;
  }

  /* Build the price polyline path. */
  function pathFor(arr) {
    let d = "";
    let started = false;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v === null || !isFinite(v)) { started = false; continue; }
      d += (started ? "L" : "M") + xOf(i).toFixed(1) + "," + yOf(v).toFixed(1);
      started = true;
    }
    return d;
  }
  const pricePath = pathFor(visible.map(function (e) { return e.p; }));
  const ma50Path  = show50  ? pathFor(ma50Vis)  : null;
  const ma200Path = show200 ? pathFor(ma200Vis) : null;

  /* Y-axis ticks: 5 evenly spaced. */
  const ticks = [];
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * (i / 4);
    ticks.push({ v: v, y: yOf(v) });
  }

  /* X-axis ticks: pick ~6 dates spread across the window. */
  const xTickCount = Math.min(6, visible.length);
  const xTicks = [];
  for (let i = 0; i < xTickCount; i++) {
    const idx = Math.round((visible.length - 1) * (i / (xTickCount - 1 || 1)));
    xTicks.push({ idx: idx, label: visible[idx].d });
  }

  /* Map a client-pixel x-coordinate (from a mouse event) to the nearest
     index in `visible`. Uses the SVG's bounding rect to scale into
     viewBox coords. */
  function eventToIndex(e) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (visible.length <= 1) return 0;
    /* Inverse of xOf: i = (px - PAD_L) / INNER_W * (n - 1) */
    let i = Math.round(((px - PAD_L) / INNER_W) * (visible.length - 1));
    if (i < 0) i = 0;
    if (i > visible.length - 1) i = visible.length - 1;
    return i;
  }

  function onMove(e) { setHoverIdx(eventToIndex(e)); }
  function onLeave() { setHoverIdx(null); }
  function onClick(e) {
    const i = eventToIndex(e);
    if (i === null) return;
    if (pickA === null) { setPickA(i); setPickB(null); }
    else if (pickB === null) {
      /* Order picks chronologically so the % is "later vs earlier". */
      if (i === pickA) return;
      if (i < pickA) { setPickB(pickA); setPickA(i); }
      else setPickB(i);
    } else {
      setPickA(i); setPickB(null);
    }
  }

  /* Compute pick stats. */
  let pickStats = null;
  if (pickA !== null && pickB !== null && visible[pickA] && visible[pickB]) {
    const a = visible[pickA], b = visible[pickB];
    const pct = a.p > 0 ? ((b.p - a.p) / a.p) * 100 : null;
    pickStats = { a: a, b: b, pct: pct };
  }

  /* Single-pick stats (when user has clicked once and we're waiting for B).
     Show the price + date for orientation while they pick the second point. */
  const singlePick = pickA !== null && pickB === null && visible[pickA] ? visible[pickA] : null;

  return (
    <div className="space-y-3 print-target">
      <div className="flex flex-wrap items-center gap-2 gap-y-2">
        <TickerToggle choices={choices} activeKey={activeKey} setActiveKey={setActiveKey} />
        <span className="text-gray-300 dark:text-slate-600">|</span>
        <PeriodPicker period={period} setPeriod={setPeriod} />
        <span className="text-gray-300 dark:text-slate-600">|</span>
        <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input type="checkbox" checked={show50} onChange={function (e) { setShow50(e.target.checked); }} className="cursor-pointer" />
          <span className="font-medium text-amber-600 dark:text-amber-400">50d MA</span>
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input type="checkbox" checked={show200} onChange={function (e) { setShow200(e.target.checked); }} className="cursor-pointer" />
          <span className="font-medium text-purple-600 dark:text-purple-400">200d MA</span>
        </label>
        {(pickA !== null || pickB !== null) && (
          <button
            onClick={function () { setPickA(null); setPickB(null); }}
            className="ml-auto text-xs px-2 py-1 rounded border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
          >Clear marks</button>
        )}
      </div>

      {/* Headline: latest price + measure-tool result. */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <div>
          <span className="text-gray-500 dark:text-slate-400">{active.ticker} latest:</span>{" "}
          <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-slate-100">
            {ccy === "USD" ? "$" : ccy + " "}{fmtPrice(visible[visible.length - 1].p)}
          </span>{" "}
          <span className="text-xs text-gray-500 dark:text-slate-400">{fmtDate(visible[visible.length - 1].d)}</span>
        </div>
        {pickStats && (
          <div>
            <span className="text-gray-500 dark:text-slate-400">{fmtDate(pickStats.a.d)} → {fmtDate(pickStats.b.d)}:</span>{" "}
            <span className={"text-base font-semibold tabular-nums " + (pickStats.pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {pickStats.pct >= 0 ? "+" : ""}{pickStats.pct.toFixed(2)}%
            </span>
            <span className="text-xs text-gray-500 dark:text-slate-400 ml-2">
              ({fmtPrice(pickStats.a.p)} → {fmtPrice(pickStats.b.p)})
            </span>
          </div>
        )}
        {!pickStats && singlePick && (
          <div className="text-xs text-gray-500 dark:text-slate-400 italic">
            Marked {fmtDate(singlePick.d)} ({fmtPrice(singlePick.p)}) — click another point to measure %.
          </div>
        )}
        {!pickStats && !singlePick && (
          <div className="text-xs text-gray-500 dark:text-slate-400 italic">
            Click two points on the chart to measure % change.
          </div>
        )}
      </div>

      <div className="w-full overflow-hidden rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <svg
          ref={svgRef}
          viewBox={"0 0 " + W + " " + H}
          width="100%"
          style={{ display: "block", cursor: "crosshair" }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={onClick}
          role="img"
          aria-label={active.ticker + " price history"}
        >
          {/* y-axis grid + tick labels */}
          {ticks.map(function (t, i) {
            return (
              <g key={"yt" + i}>
                <line x1={PAD_L} y1={t.y} x2={PAD_L + INNER_W} y2={t.y} stroke="currentColor" strokeOpacity="0.08" />
                <text x={PAD_L - 6} y={t.y + 3} fontSize="10" textAnchor="end" fill="currentColor" opacity="0.6">
                  {fmtPrice(t.v)}
                </text>
              </g>
            );
          })}

          {/* x-axis tick labels */}
          {xTicks.map(function (t, i) {
            return (
              <text key={"xt" + i} x={xOf(t.idx)} y={PAD_T + INNER_H + 16} fontSize="10" textAnchor="middle" fill="currentColor" opacity="0.6">
                {fmtDate(t.label)}
              </text>
            );
          })}

          {/* frame */}
          <rect x={PAD_L} y={PAD_T} width={INNER_W} height={INNER_H} fill="none" stroke="currentColor" strokeOpacity="0.15" />

          {/* MA lines drawn under the price so it stays prominent. */}
          {ma200Path && <path d={ma200Path} fill="none" stroke="#9333ea" strokeWidth="1.5" strokeOpacity="0.7" />}
          {ma50Path  && <path d={ma50Path}  fill="none" stroke="#d97706" strokeWidth="1.5" strokeOpacity="0.7" />}

          {/* price line */}
          <path d={pricePath} fill="none" stroke="#2563eb" strokeWidth="2" />

          {/* measure-tool: dashed verticals at A and B, plus dots */}
          {pickA !== null && visible[pickA] && (
            <g>
              <line x1={xOf(pickA)} y1={PAD_T} x2={xOf(pickA)} y2={PAD_T + INNER_H} stroke="#0f766e" strokeWidth="1.5" strokeDasharray="4 3" />
              <circle cx={xOf(pickA)} cy={yOf(visible[pickA].p)} r="4" fill="#0f766e" stroke="white" strokeWidth="1.5" />
            </g>
          )}
          {pickB !== null && visible[pickB] && (
            <g>
              <line x1={xOf(pickB)} y1={PAD_T} x2={xOf(pickB)} y2={PAD_T + INNER_H} stroke="#0f766e" strokeWidth="1.5" strokeDasharray="4 3" />
              <circle cx={xOf(pickB)} cy={yOf(visible[pickB].p)} r="4" fill="#0f766e" stroke="white" strokeWidth="1.5" />
            </g>
          )}

          {/* hover crosshair + tooltip */}
          {hoverIdx !== null && visible[hoverIdx] && (
            <g pointerEvents="none">
              <line x1={xOf(hoverIdx)} y1={PAD_T} x2={xOf(hoverIdx)} y2={PAD_T + INNER_H} stroke="currentColor" strokeOpacity="0.25" />
              <circle cx={xOf(hoverIdx)} cy={yOf(visible[hoverIdx].p)} r="3.5" fill="#2563eb" stroke="white" strokeWidth="1.5" />
              <HoverTip
                x={xOf(hoverIdx)}
                y={yOf(visible[hoverIdx].p)}
                date={visible[hoverIdx].d}
                price={visible[hoverIdx].p}
                ma50={show50  ? ma50Vis[hoverIdx]  : null}
                ma200={show200 ? ma200Vis[hoverIdx] : null}
                ccy={ccy}
              />
            </g>
          )}
        </svg>
      </div>

      {/* legend / footnote */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
        <LegendDot color="#2563eb" label="Price" />
        {show50  && <LegendDot color="#d97706" label="50d MA" />}
        {show200 && <LegendDot color="#9333ea" label="200d MA" />}
        <div className="ml-auto">{visible.length} trading days · series ends {fmtDate(visible[visible.length - 1].d)}</div>
      </div>
    </div>
  );
}

function TickerToggle({ choices, activeKey, setActiveKey }) {
  if (!choices.length) return null;
  return (
    <div className="inline-flex rounded border border-gray-300 dark:border-slate-600 overflow-hidden">
      {choices.map(function (c) {
        const active = c.key === activeKey;
        return (
          <button
            key={c.key}
            onClick={function () { setActiveKey(c.key); }}
            className={"px-2.5 py-1 text-xs font-medium transition " + (active
              ? "bg-blue-600 text-white"
              : "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700")}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function PeriodPicker({ period, setPeriod }) {
  return (
    <div className="inline-flex rounded border border-gray-300 dark:border-slate-600 overflow-hidden">
      {PERIOD_OPTIONS.map(function (p) {
        const active = p.id === period;
        return (
          <button
            key={p.id}
            onClick={function () { setPeriod(p.id); }}
            className={"px-2 py-1 text-xs font-medium transition " + (active
              ? "bg-gray-900 text-white dark:bg-slate-200 dark:text-slate-900"
              : "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700")}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-3 h-0.5" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/* Tooltip box that flips to the left of the crosshair if the cursor is
 * past the right half of the chart, so it never gets cut off. */
function HoverTip({ x, y, date, price, ma50, ma200, ccy }) {
  const onRight = x > PAD_L + INNER_W * 0.6;
  const tipW = 160, tipH = (ma50 != null && ma200 != null) ? 64 : (ma50 != null || ma200 != null) ? 52 : 40;
  const tx = onRight ? x - tipW - 8 : x + 8;
  const ty = Math.min(Math.max(y - tipH / 2, PAD_T + 4), PAD_T + INNER_H - tipH - 4);
  const ccyPrefix = ccy === "USD" ? "$" : ccy + " ";
  return (
    <g>
      <rect x={tx} y={ty} width={tipW} height={tipH} rx="4" fill="white" stroke="#cbd5e1" strokeWidth="1" opacity="0.95" />
      <text x={tx + 8} y={ty + 14} fontSize="10" fill="#475569">{fmtDate(date)}</text>
      <text x={tx + 8} y={ty + 30} fontSize="11" fontWeight="600" fill="#1e3a8a">{ccyPrefix}{fmtPrice(price)}</text>
      {ma50 != null && (
        <text x={tx + 8} y={ty + 44} fontSize="10" fill="#d97706">50d: {ccyPrefix}{fmtPrice(ma50)}</text>
      )}
      {ma200 != null && (
        <text x={tx + 8} y={ty + (ma50 != null ? 58 : 44)} fontSize="10" fill="#9333ea">200d: {ccyPrefix}{fmtPrice(ma200)}</text>
      )}
    </g>
  );
}
