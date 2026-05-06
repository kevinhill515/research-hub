/* Per-company price chart.
 *
 * Pulls the ticker's daily series from prices_history (lazy-fetched via
 * usePriceHistory), filters to the selected period, and renders a small
 * SVG line chart. Two display modes:
 *
 *   - Price: raw closing price for the active ticker, with optional
 *     50/200-day MAs.
 *   - % Gain: normalized to 100 at the start of the visible window, with
 *     overlay lines for each benchmark mapped to a portfolio the company
 *     is in or being considered for. Each benchmark has a checkbox.
 *
 * Other features:
 *   - Toggle between the company's ord and US tickers (when both exist).
 *   - Period buttons: YTD, 1Y, 2Y, 3Y, 4Y, 5Y, MAX.
 *   - Click two points on the chart to measure the % change between
 *     them. First click sets A, second sets B, third resets to A.
 *   - Hover crosshair shows price (or % gain) + date for the nearest
 *     point on the active line; benchmark values shown alongside.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { usePriceHistory, usePriceHistories } from "../../hooks/usePriceHistory.js";
import { useCompanyContext } from "../../context/CompanyContext.jsx";

const PERIOD_OPTIONS = [
  { id: "YTD", label: "YTD" },
  { id: "1Y",  label: "1Y" },
  { id: "2Y",  label: "2Y" },
  { id: "3Y",  label: "3Y" },
  { id: "4Y",  label: "4Y" },
  { id: "5Y",  label: "5Y" },
  { id: "MAX", label: "MAX" },
];

/* Color palette for benchmark overlay lines. Picked to be distinct from
 * the primary blue stock line and from each other in both light and
 * dark mode. Wraps if there are more benchmarks than colors. */
const BENCH_COLORS = ["#dc2626", "#16a34a", "#7c3aed", "#0891b2", "#ea580c", "#db2777", "#65a30d", "#0369a1"];

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

function fmtPrice(v) {
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toFixed(2);
}

function fmtPct(v) {
  if (v == null || !isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* Convert a {d, p} series cropped to the visible window into a parallel
 * array of percent-gain values, normalized so the first point reads 0%.
 * Returns null entries for points where the base wasn't > 0. */
function toPctGain(visible) {
  if (!visible.length) return [];
  const base = visible[0].p;
  if (!(base > 0)) return visible.map(function () { return null; });
  return visible.map(function (e) {
    return e.p > 0 ? ((e.p - base) / base) * 100 : null;
  });
}

/* Resample a benchmark series so its values align with the company
 * series' visible date axis. For each company date, we take the most
 * recent benchmark close ≤ that date (forward-fill on holidays where
 * markets diverge). Returns null for dates before the benchmark's
 * earliest observation. */
function alignToDates(benchSeries, dates) {
  const out = new Array(dates.length).fill(null);
  if (!benchSeries || !benchSeries.length) return out;
  let bi = 0;
  let lastP = null;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    while (bi < benchSeries.length && benchSeries[bi].d <= d) {
      lastP = benchSeries[bi].p;
      bi++;
    }
    out[i] = lastP;
  }
  return out;
}

/* Take a parallel array of prices (with possible nulls) aligned to a
 * date axis and convert to % gain from the first non-null entry. */
function pricesToPctGain(prices) {
  let baseIdx = -1;
  for (let i = 0; i < prices.length; i++) {
    if (prices[i] != null && isFinite(prices[i]) && prices[i] > 0) { baseIdx = i; break; }
  }
  if (baseIdx < 0) return prices.map(function () { return null; });
  const base = prices[baseIdx];
  return prices.map(function (p, i) {
    if (i < baseIdx) return null;
    if (p == null || !isFinite(p) || p <= 0) return null;
    return ((p - base) / base) * 100;
  });
}

export default function PricesTab({ company }) {
  const { perfData } = useCompanyContext();

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
  const [mode, setMode] = useState("price"); /* "price" | "pct" */
  const [show50, setShow50] = useState(false);
  const [show200, setShow200] = useState(false);
  /* Custom date range. When either is set, it overrides the matching
     end of the period preset. Both empty = period preset is in effect. */
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const customActive = !!(customStart || customEnd);

  const [pickA, setPickA] = useState(null);
  const [pickB, setPickB] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  /* Active stock series. */
  const ph = usePriceHistory(active && active.ticker);
  const fullSeries = ph.series || [];

  /* Build the benchmark candidate list:
     - Every portfolio the company is currently in (`portfolios`)
     - Plus every portfolio that has a target weight set (`portWeights`)
       — interpreted as "being considered for"
     For each portfolio, find role==="benchmark" series in perfData and
     pull their tickers. Dedupe across portfolios (a benchmark used in
     multiple portfolios shows up once). */
  const benchmarkOptions = useMemo(function () {
    const inPorts = new Set((company && company.portfolios) || []);
    const considered = new Set();
    const pw = (company && company.portWeights) || {};
    Object.keys(pw).forEach(function (k) {
      const v = parseFloat(pw[k]);
      if (isFinite(v) && v > 0) considered.add(k);
    });
    const portKeys = Array.from(new Set([].concat(Array.from(inPorts), Array.from(considered))));
    /* Order: in-portfolio first, then considered. */
    portKeys.sort(function (a, b) {
      const ai = inPorts.has(a) ? 0 : 1;
      const bi = inPorts.has(b) ? 0 : 1;
      return ai - bi;
    });
    const seenTickers = {};
    const out = [];
    portKeys.forEach(function (pk) {
      const series = ((perfData || {})[pk] || {}).series || [];
      series.forEach(function (s) {
        if (s.role !== "benchmark") return;
        const tk = (s.ticker || "").toUpperCase().trim();
        if (!tk) return;
        if (seenTickers[tk]) {
          /* Already counted from another portfolio — append the portfolio
             code to the existing entry's note for context. */
          seenTickers[tk].portfolios.push(pk);
          return;
        }
        const entry = {
          ticker: tk,
          name: s.name || tk,
          portfolios: [pk],
          inPort: inPorts.has(pk), /* whether the FIRST portfolio that introduced this benchmark is currently held */
        };
        seenTickers[tk] = entry;
        out.push(entry);
      });
    });
    return out;
  }, [company, perfData]);

  /* Selected benchmarks (default: all on, but only when in % gain mode). */
  const [selectedBenchTickers, setSelectedBenchTickers] = useState(null);
  /* Initialize / reset selection when the option set changes. We key off
     the ticker list so adding a portfolio doesn't drop existing picks. */
  useEffect(function () {
    setSelectedBenchTickers(function (prev) {
      const allOpts = benchmarkOptions.map(function (b) { return b.ticker; });
      if (prev === null) return allOpts; /* first run: select all */
      /* Keep currently-selected that still exist. */
      return prev.filter(function (tk) { return allOpts.indexOf(tk) >= 0; });
    });
  }, [benchmarkOptions.map(function (b) { return b.ticker; }).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeBenchTickers = (mode === "pct" && selectedBenchTickers) ? selectedBenchTickers : [];
  const benchHistories = usePriceHistories(activeBenchTickers);

  /* Crop active stock to visible window.
     Window = [lower, upper] where:
       lower = customStart if set, else periodCutoff(period)
       upper = customEnd   if set, else +∞
     We compute the start/end indices into the FULL series, then slice.
     Moving averages are computed against the full series and sliced
     identically so the start of the visible window has correct MAs. */
  const { visible, ma50Vis, ma200Vis } = useMemo(function () {
    if (!fullSeries.length) return { visible: [], ma50Vis: [], ma200Vis: [] };
    const lower = customStart || periodCutoff(period, new Date());
    const start = indexAtOrAfter(fullSeries, lower);
    let end = fullSeries.length;
    if (customEnd) {
      /* customEnd is inclusive; find first index > customEnd. */
      let lo = start, hi = fullSeries.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (fullSeries[mid].d <= customEnd) lo = mid + 1;
        else hi = mid;
      }
      end = lo;
    }
    if (end <= start) return { visible: [], ma50Vis: [], ma200Vis: [] };
    const v = fullSeries.slice(start, end);
    const m50 = show50  ? movingAvg(fullSeries, 50).slice(start, end)  : [];
    const m200 = show200 ? movingAvg(fullSeries, 200).slice(start, end) : [];
    return { visible: v, ma50Vis: m50, ma200Vis: m200 };
  }, [fullSeries, period, customStart, customEnd, show50, show200]);

  /* In % gain mode, build aligned benchmark % gain series. */
  const benchSeriesRendered = useMemo(function () {
    if (mode !== "pct" || !visible.length) return [];
    const dates = visible.map(function (e) { return e.d; });
    return benchmarkOptions
      .filter(function (b) { return (selectedBenchTickers || []).indexOf(b.ticker) >= 0; })
      .map(function (b, idx) {
        const r = benchHistories[b.ticker] || {};
        const aligned = alignToDates(r.series || [], dates);
        const gains = pricesToPctGain(aligned);
        return {
          ticker: b.ticker,
          name: b.name,
          portfolios: b.portfolios,
          color: BENCH_COLORS[idx % BENCH_COLORS.length],
          values: gains,
          loading: !!r.loading,
          missing: !r.series || !r.series.length,
        };
      });
  }, [mode, visible, benchmarkOptions, selectedBenchTickers, benchHistories]);

  /* Reset picks when ticker / period / mode / custom range changes. */
  useEffect(function () { setPickA(null); setPickB(null); }, [activeKey, period, mode, customStart, customEnd, fullSeries.length]);

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

  /* ---- y-scale / axis values ---- */
  /* Stock series in display units (price or % gain). */
  const stockValues = mode === "pct" ? toPctGain(visible) : visible.map(function (e) { return e.p; });

  /* Collect all non-null y values (stock + visible MAs in price mode +
     selected benchmarks in pct mode) for axis scaling. */
  const yPoints = stockValues.filter(function (v) { return v != null && isFinite(v); });
  if (mode === "price") {
    (ma50Vis  || []).forEach(function (v) { if (v != null && isFinite(v)) yPoints.push(v); });
    (ma200Vis || []).forEach(function (v) { if (v != null && isFinite(v)) yPoints.push(v); });
  } else {
    benchSeriesRendered.forEach(function (b) {
      b.values.forEach(function (v) { if (v != null && isFinite(v)) yPoints.push(v); });
    });
  }

  let vMin = yPoints.length ? Math.min.apply(null, yPoints) : 0;
  let vMax = yPoints.length ? Math.max.apply(null, yPoints) : 1;
  if (mode === "pct") {
    /* Always include 0% so the baseline is visible. */
    vMin = Math.min(vMin, 0);
    vMax = Math.max(vMax, 0);
  }
  const span = vMax - vMin || Math.max(1, Math.abs(vMax) || 1);
  const yMin = vMin - span * 0.06;
  const yMax = vMax + span * 0.06;

  function xOf(i) {
    if (visible.length === 1) return PAD_L + INNER_W / 2;
    return PAD_L + (i / (visible.length - 1)) * INNER_W;
  }
  function yOf(v) {
    return PAD_T + (1 - (v - yMin) / (yMax - yMin)) * INNER_H;
  }

  function pathFor(arr) {
    let d = "";
    let started = false;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v === null || v === undefined || !isFinite(v)) { started = false; continue; }
      d += (started ? "L" : "M") + xOf(i).toFixed(1) + "," + yOf(v).toFixed(1);
      started = true;
    }
    return d;
  }
  const stockPath = pathFor(stockValues);
  const ma50Path  = (mode === "price" && show50)  ? pathFor(ma50Vis)  : null;
  const ma200Path = (mode === "price" && show200) ? pathFor(ma200Vis) : null;

  /* y-axis ticks: 5 evenly spaced. */
  const ticks = [];
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * (i / 4);
    ticks.push({ v: v, y: yOf(v) });
  }

  /* x-axis ticks. */
  const xTickCount = Math.min(6, visible.length);
  const xTicks = [];
  for (let i = 0; i < xTickCount; i++) {
    const idx = Math.round((visible.length - 1) * (i / (xTickCount - 1 || 1)));
    xTicks.push({ idx: idx, label: visible[idx].d });
  }

  function formatY(v) {
    if (mode === "pct") {
      const sign = v >= 0 ? "+" : "";
      return sign + v.toFixed(1) + "%";
    }
    return fmtPrice(v);
  }

  function eventToIndex(e) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (visible.length <= 1) return 0;
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
      if (i === pickA) return;
      if (i < pickA) { setPickB(pickA); setPickA(i); }
      else setPickB(i);
    } else {
      setPickA(i); setPickB(null);
    }
  }

  /* Pick stats. In price mode, % is just stock A → stock B. In pct mode,
     since both A and B are already % gains from period start, the
     measurement is "delta in cumulative % from A to B" — most useful
     interpreted as the stock's return over that sub-window, computed
     from the underlying prices. */
  let pickStats = null;
  if (pickA !== null && pickB !== null && visible[pickA] && visible[pickB]) {
    const a = visible[pickA], b = visible[pickB];
    const pct = a.p > 0 ? ((b.p - a.p) / a.p) * 100 : null;
    pickStats = { a: a, b: b, pct: pct };
  }
  const singlePick = pickA !== null && pickB === null && visible[pickA] ? visible[pickA] : null;

  return (
    <div className="space-y-3 print-target">
      <div className="flex flex-wrap items-center gap-2 gap-y-2">
        <TickerToggle choices={choices} activeKey={activeKey} setActiveKey={setActiveKey} />
        <span className="text-gray-300 dark:text-slate-600">|</span>
        <ModeToggle mode={mode} setMode={setMode} />
        <span className="text-gray-300 dark:text-slate-600">|</span>
        <PeriodPicker period={period} setPeriod={function (p) { setPeriod(p); setCustomStart(""); setCustomEnd(""); }} disabled={customActive} />
        <span className="text-[11px] text-gray-500 dark:text-slate-400 ml-1">From</span>
        <input
          type="date"
          value={customStart}
          min={fullSeries.length ? fullSeries[0].d : undefined}
          max={customEnd || (fullSeries.length ? fullSeries[fullSeries.length - 1].d : undefined)}
          onChange={function (e) { setCustomStart(e.target.value); }}
          className="text-xs px-1.5 py-0.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
        />
        <span className="text-[11px] text-gray-500 dark:text-slate-400">to</span>
        <input
          type="date"
          value={customEnd}
          min={customStart || (fullSeries.length ? fullSeries[0].d : undefined)}
          max={fullSeries.length ? fullSeries[fullSeries.length - 1].d : undefined}
          onChange={function (e) { setCustomEnd(e.target.value); }}
          className="text-xs px-1.5 py-0.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
        />
        {customActive && (
          <button
            onClick={function () { setCustomStart(""); setCustomEnd(""); }}
            className="text-[11px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700"
            title="Clear custom range — go back to the period preset"
          >×</button>
        )}
        {mode === "price" && (
          <>
            <span className="text-gray-300 dark:text-slate-600">|</span>
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={show50} onChange={function (e) { setShow50(e.target.checked); }} className="cursor-pointer" />
              <span className="font-medium text-amber-600 dark:text-amber-400">50d MA</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={show200} onChange={function (e) { setShow200(e.target.checked); }} className="cursor-pointer" />
              <span className="font-medium text-purple-600 dark:text-purple-400">200d MA</span>
            </label>
          </>
        )}
        {(pickA !== null || pickB !== null) && (
          <button
            onClick={function () { setPickA(null); setPickB(null); }}
            className="ml-auto text-xs px-2 py-1 rounded border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
          >Clear marks</button>
        )}
      </div>

      {/* Benchmark checkbox row — only in % gain mode, only when there are options. */}
      {mode === "pct" && benchmarkOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 gap-y-1 text-xs">
          <span className="text-gray-500 dark:text-slate-400 mr-1">Benchmarks:</span>
          {benchmarkOptions.map(function (b, idx) {
            const checked = (selectedBenchTickers || []).indexOf(b.ticker) >= 0;
            const color = BENCH_COLORS[idx % BENCH_COLORS.length];
            const r = benchHistories[b.ticker] || {};
            const noData = checked && !r.loading && (!r.series || !r.series.length);
            const portsLbl = b.portfolios.join(", ");
            return (
              <label key={b.ticker} title={b.ticker + " — " + portsLbl} className="inline-flex items-center gap-1.5 cursor-pointer select-none px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={function () {
                    setSelectedBenchTickers(function (prev) {
                      const cur = prev || [];
                      return checked ? cur.filter(function (t) { return t !== b.ticker; }) : cur.concat([b.ticker]);
                    });
                  }}
                  className="cursor-pointer"
                />
                <span className="inline-block w-3 h-0.5" style={{ backgroundColor: color }} />
                <span className="font-medium" style={{ color: color }}>{b.name}</span>
                <span className="text-gray-400 dark:text-slate-500">({portsLbl})</span>
                {noData && <span className="text-red-500 dark:text-red-400 italic">no data</span>}
                {r.loading && <span className="text-gray-400 italic">…</span>}
              </label>
            );
          })}
        </div>
      )}
      {mode === "pct" && benchmarkOptions.length === 0 && (
        <div className="text-xs text-gray-500 dark:text-slate-400 italic">
          No benchmarks resolved. Make sure the company is in (or has a target weight for) a portfolio whose Performance series include a benchmark with a ticker set.
        </div>
      )}

      {/* Headline */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <div>
          <span className="text-gray-500 dark:text-slate-400">{active.ticker} {mode === "pct" ? "since " + fmtDate(visible[0].d) : "latest"}:</span>{" "}
          <span className={"text-base font-semibold tabular-nums " + (mode === "pct"
            ? (stockValues[stockValues.length - 1] >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
            : "text-gray-900 dark:text-slate-100")}>
            {mode === "pct"
              ? fmtPct(stockValues[stockValues.length - 1])
              : (ccy === "USD" ? "$" : ccy + " ") + fmtPrice(visible[visible.length - 1].p)}
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
                  {formatY(t.v)}
                </text>
              </g>
            );
          })}

          {/* zero baseline in pct mode */}
          {mode === "pct" && yMin <= 0 && yMax >= 0 && (
            <line x1={PAD_L} y1={yOf(0)} x2={PAD_L + INNER_W} y2={yOf(0)} stroke="currentColor" strokeOpacity="0.3" strokeDasharray="3 3" />
          )}

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

          {/* MA lines drawn under the price (price mode only). */}
          {ma200Path && <path d={ma200Path} fill="none" stroke="#9333ea" strokeWidth="1.5" strokeOpacity="0.7" />}
          {ma50Path  && <path d={ma50Path}  fill="none" stroke="#d97706" strokeWidth="1.5" strokeOpacity="0.7" />}

          {/* Benchmark lines (pct mode only). Drawn under the stock so the
              stock stays prominent. */}
          {benchSeriesRendered.map(function (b) {
            if (b.missing) return null;
            return <path key={b.ticker} d={pathFor(b.values)} fill="none" stroke={b.color} strokeWidth="1.75" strokeOpacity="0.85" />;
          })}

          {/* Stock line */}
          <path d={stockPath} fill="none" stroke="#2563eb" strokeWidth="2.25" />

          {/* measure-tool marks */}
          {pickA !== null && visible[pickA] && (
            <g>
              <line x1={xOf(pickA)} y1={PAD_T} x2={xOf(pickA)} y2={PAD_T + INNER_H} stroke="#0f766e" strokeWidth="1.5" strokeDasharray="4 3" />
              <circle cx={xOf(pickA)} cy={yOf(stockValues[pickA])} r="4" fill="#0f766e" stroke="white" strokeWidth="1.5" />
            </g>
          )}
          {pickB !== null && visible[pickB] && (
            <g>
              <line x1={xOf(pickB)} y1={PAD_T} x2={xOf(pickB)} y2={PAD_T + INNER_H} stroke="#0f766e" strokeWidth="1.5" strokeDasharray="4 3" />
              <circle cx={xOf(pickB)} cy={yOf(stockValues[pickB])} r="4" fill="#0f766e" stroke="white" strokeWidth="1.5" />
            </g>
          )}

          {/* hover crosshair + tooltip */}
          {hoverIdx !== null && visible[hoverIdx] && (
            <g pointerEvents="none">
              <line x1={xOf(hoverIdx)} y1={PAD_T} x2={xOf(hoverIdx)} y2={PAD_T + INNER_H} stroke="currentColor" strokeOpacity="0.25" />
              <circle cx={xOf(hoverIdx)} cy={yOf(stockValues[hoverIdx])} r="3.5" fill="#2563eb" stroke="white" strokeWidth="1.5" />
              <HoverTip
                x={xOf(hoverIdx)}
                y={yOf(stockValues[hoverIdx])}
                date={visible[hoverIdx].d}
                mode={mode}
                stockValue={stockValues[hoverIdx]}
                stockPrice={visible[hoverIdx].p}
                ma50={mode === "price" && show50  ? ma50Vis[hoverIdx]  : null}
                ma200={mode === "price" && show200 ? ma200Vis[hoverIdx] : null}
                benches={mode === "pct" ? benchSeriesRendered.map(function (b) {
                  return { name: b.name, color: b.color, value: b.values[hoverIdx] };
                }) : []}
                ccy={ccy}
                stockLabel={active.ticker}
              />
            </g>
          )}
        </svg>
      </div>

      {/* legend / footnote */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
        <LegendDot color="#2563eb" label={active.ticker} />
        {mode === "price" && show50  && <LegendDot color="#d97706" label="50d MA" />}
        {mode === "price" && show200 && <LegendDot color="#9333ea" label="200d MA" />}
        {mode === "pct" && benchSeriesRendered.filter(function (b) { return !b.missing; }).map(function (b) {
          return <LegendDot key={b.ticker} color={b.color} label={b.name} />;
        })}
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

function ModeToggle({ mode, setMode }) {
  const opts = [{ id: "price", label: "Price" }, { id: "pct", label: "% Gain" }];
  return (
    <div className="inline-flex rounded border border-gray-300 dark:border-slate-600 overflow-hidden">
      {opts.map(function (o) {
        const active = o.id === mode;
        return (
          <button
            key={o.id}
            onClick={function () { setMode(o.id); }}
            className={"px-2.5 py-1 text-xs font-medium transition " + (active
              ? "bg-emerald-600 text-white"
              : "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700")}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

function PeriodPicker({ period, setPeriod, disabled }) {
  /* When `disabled` is true, the custom date range is in effect and
     none of the presets are visually highlighted. Buttons are still
     clickable — clicking one switches back to that preset. */
  return (
    <div className={"inline-flex rounded border overflow-hidden " + (disabled ? "border-gray-200 dark:border-slate-700 opacity-70" : "border-gray-300 dark:border-slate-600")}>
      {PERIOD_OPTIONS.map(function (p) {
        const active = !disabled && p.id === period;
        return (
          <button
            key={p.id}
            onClick={function () { setPeriod(p.id); }}
            className={"px-2 py-1 text-xs font-medium transition " + (active
              ? "bg-gray-900 text-white dark:bg-slate-200 dark:text-slate-900"
              : "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700")}
          >{p.label}</button>
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
 * past the right half of the chart. */
function HoverTip({ x, y, date, mode, stockValue, stockPrice, ma50, ma200, benches, ccy, stockLabel }) {
  const onRight = x > PAD_L + INNER_W * 0.6;
  /* Compute height from row count. */
  const rows = 1 /* date */ + 1 /* stock */ +
    (mode === "price" && ma50 != null ? 1 : 0) +
    (mode === "price" && ma200 != null ? 1 : 0) +
    (mode === "pct" ? (benches || []).filter(function (b) { return b.value != null; }).length : 0);
  const tipW = 200, tipH = 12 + rows * 14;
  const tx = onRight ? x - tipW - 8 : x + 8;
  const ty = Math.min(Math.max(y - tipH / 2, PAD_T + 4), PAD_T + INNER_H - tipH - 4);
  const ccyPrefix = ccy === "USD" ? "$" : ccy + " ";
  let row = 0;
  function nextY() { row += 1; return ty + 4 + row * 14; }
  return (
    <g>
      <rect x={tx} y={ty} width={tipW} height={tipH} rx="4" fill="white" stroke="#cbd5e1" strokeWidth="1" opacity="0.95" />
      <text x={tx + 8} y={nextY()} fontSize="10" fill="#475569">{fmtDate(date)}</text>
      <text x={tx + 8} y={nextY()} fontSize="11" fontWeight="600" fill="#1e3a8a">
        {stockLabel}: {mode === "pct" ? fmtPct(stockValue) : ccyPrefix + fmtPrice(stockPrice)}
      </text>
      {mode === "price" && ma50 != null && (
        <text x={tx + 8} y={nextY()} fontSize="10" fill="#d97706">50d: {ccyPrefix}{fmtPrice(ma50)}</text>
      )}
      {mode === "price" && ma200 != null && (
        <text x={tx + 8} y={nextY()} fontSize="10" fill="#9333ea">200d: {ccyPrefix}{fmtPrice(ma200)}</text>
      )}
      {mode === "pct" && (benches || []).filter(function (b) { return b.value != null; }).map(function (b, i) {
        return (
          <text key={i} x={tx + 8} y={nextY()} fontSize="10" fill={b.color}>
            {b.name}: {fmtPct(b.value)}
          </text>
        );
      })}
    </g>
  );
}
