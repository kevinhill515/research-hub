/* Snapshot tab — replaces the old grid-of-numbers Metrics tab with a
 * charts-first quick-glance view of where the company stands today.
 *
 * Two tiles:
 *   1. Trailing Performance — horizontal bars for 5D / MTD / QTD / 3M
 *      / 6M / YTD / 1Y for the stock, plus rows for each Core/Value
 *      benchmark applicable to the portfolios this company is in.
 *      Order of windows is computed each render so YTD slots into the
 *      right position based on calendar date.
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
 *   - meta.marketsSnapshot.indices — benchmark trailing returns
 */

import { useEffect, useState } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { BENCHMARKS } from '../../constants/index.js';
import { printPage } from '../../utils/index.js';
import { isFiniteNum } from '../../utils/numbers.js';

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
 * range stats from a longer time series. If `estimate` is supplied,
 * forward-estimate years are excluded — the 5Y range should reflect
 * actual reported history, not consensus forecasts. */
function lastNFinite(arr, n, estimate) {
  if (!arr) return [];
  const out = [];
  for (let i = arr.length - 1; i >= 0 && out.length < n; i--) {
    if (estimate && estimate[i]) continue;
    if (isFiniteV(arr[i])) out.unshift(arr[i]);
  }
  return out;
}

/* Last finite value in an array, optionally skipping forward-estimate
 * positions. */
function lastHistorical(arr, estimate) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (estimate && estimate[i]) continue;
    if (isFiniteV(arr[i])) return arr[i];
  }
  return null;
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

/* Trailing-window ordering. YTD's effective lookback is "days since
 * Jan 1", which varies through the year. In April YTD ≈ 115 days
 * (between 3M and 6M); in July ≈ 200 days (between 6M and 1Y). Sort
 * windows by their actual lookback days so YTD lands correctly. */
function buildPerfWindows(now) {
  const today = now || new Date();
  const start = new Date(today.getFullYear(), 0, 1);
  const ytdDays = Math.floor((today - start) / 86400000);
  /* MTD/QTD lookbacks vary with month; we use rough day-counts that
     are close enough for sort ordering. */
  const dom = today.getDate();
  const monthInQ = today.getMonth() % 3;
  const qtdDays = monthInQ * 30 + dom;
  return [
    { key: "1D",  label: "1D",  days: 1 },
    { key: "5D",  label: "5D",  days: 5 },
    { key: "MTD", label: "MTD", days: dom },
    { key: "1M",  label: "1M",  days: 30 },
    { key: "QTD", label: "QTD", days: qtdDays },
    { key: "3M",  label: "3M",  days: 90 },
    { key: "6M",  label: "6M",  days: 180 },
    { key: "YTD", label: "YTD", days: ytdDays },
    { key: "1Y",  label: "1Y",  days: 365 },
    { key: "2Y",  label: "2Y",  days: 730 },
    { key: "3Y",  label: "3Y",  days: 1095 },
  ].sort(function (a, b) { return a.days - b.days; });
}

/* Benchmark label resolution. For each benchmark name in BENCHMARKS
 * (e.g. "ACWI"), we search the marketsSnapshot Indices section for
 * the first ETF-ticker match (intraday), falling back to the first
 * non-ETF match (prior close). ETF tickers follow the AAA-XX format
 * (e.g. ACWI-US, IWVU-GB); index codes (digits, MS-prefix) and blanks
 * resolve to non-ETF. Aliases handle the "MSCI " prefix and
 * "(Index)" suffix conventions in the user's upload. */
function isEtfTicker(t) {
  if (!t) return false;
  return /^[A-Za-z][A-Za-z0-9]+[-/][A-Za-z]{2}$/.test(String(t).trim());
}

function findBenchmarkRow(indices, benchName) {
  if (!indices || !Array.isArray(indices) || !benchName) return null;
  const candidates = [
    benchName,
    "MSCI " + benchName,
    benchName + " (Index)",
    "MSCI " + benchName + " (Index)",
  ].map(function (s) { return s.toLowerCase().trim(); });
  const matches = indices.filter(function (r) {
    const lbl = ((r.label || r.name || "") + "").toLowerCase().trim();
    return candidates.indexOf(lbl) >= 0;
  });
  if (matches.length === 0) return null;
  const etfMatch = matches.find(function (r) { return isEtfTicker(r.ticker); });
  if (etfMatch) return { row: etfMatch, isPriorClose: false };
  return { row: matches[0], isPriorClose: true };
}

function benchmarkValue(row, key) {
  if (!row) return null;
  const v = row[key.toLowerCase()] !== undefined ? row[key.toLowerCase()]
          : row[key] !== undefined ? row[key] : null;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  /* String form like "0.74%" — strip and parse */
  const s = String(v).replace(/%/g, "").trim();
  if (!s) return null;
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  /* If the source is %-form (e.g. "8.66"), we want decimal 0.0866 */
  return Math.abs(n) > 1.5 ? n / 100 : n;
}

/* ======================================================================== */

export default function SnapshotTab({ company }) {
  /* marketsSnapshot is loaded once into the shared CompanyContext.
     ensureMarketsSnapshot() kicks off the supaGet on first call;
     subsequent calls (or other tabs) get the cached value. */
  const { marketsSnapshot: marketsSnap, ensureMarketsSnapshot } = useCompanyContext();
  useEffect(function () {
    if (typeof ensureMarketsSnapshot === "function") ensureMarketsSnapshot();
  }, [ensureMarketsSnapshot]);

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

  /* ---- Trailing performance values ----
   * The Snapshot tile renders TWO stock rows now: the US-ticker row in
   * USD, and the ord-ticker row with a USD/Local toggle. When toggled
   * to USD, ord local returns are converted using the matching FX
   * series from marketsSnapshot.fx. */
  const tickers = company.tickers || [];
  const ordT = tickers.find(function (t) { return t.isOrdinary; }) || null;
  const usT  = tickers.find(function (t) { return (t.currency || "").toUpperCase() === "USD" && !t.isOrdinary; })
            || (ordT && ((ordT.currency || "").toUpperCase() === "USD") ? ordT : null);

  const PERIOD_KEYS = ["1D","5D","MTD","1M","QTD","3M","6M","YTD","1Y","2Y","3Y"];
  /* Read a single perf window for a given ticker. Falls back through
     the legacy storage shapes:
        ticker.perf[key]        — new per-ticker perf object
        ticker.perf["TODAY"]    — back-compat for the brief window when
                                  "TODAY" was the storage key for "1D"
        ticker.perf5d           — legacy 5D-only string field
        company.metrics.perf    — even older import
  */
  function readWindow(t, key) {
    if (!t) return null;
    const p = t.perf || {};
    if (isFiniteNum(p[key])) return p[key];
    if (key === "1D" && isFiniteNum(p["TODAY"])) return p["TODAY"];
    if (key === "5D" && t.perf5d && t.perf5d !== "#N/A") {
      const n = parseFloat(t.perf5d);
      if (isFiniteNum(n)) return n / 100;
    }
    return null;
  }
  function buildPerfFor(ticker) {
    const out = {};
    PERIOD_KEYS.forEach(function (k) { out[k] = readWindow(ticker, k); });
    return out;
  }
  const usPerf  = usT  ? buildPerfFor(usT)  : null;
  const ordPerf = ordT ? buildPerfFor(ordT) : null;
  /* Legacy fallback when neither ticker has any perf data: read from
     company.metrics.perf (the previous storage location). Treated as
     the US row since metrics.perf was generally USD. */
  let legacyPerf = null;
  if (!usPerf && !ordPerf) {
    const legacy = m.perf || {};
    if (Object.keys(legacy).length > 0) {
      legacyPerf = {};
      PERIOD_KEYS.forEach(function (k) {
        const raw = legacy[k];
        legacyPerf[k] = (raw !== null && raw !== undefined && isFiniteNum(parseFloat(raw))) ? parseFloat(raw) : null;
      });
    }
  }

  /* ---- Benchmarks applicable to this company's portfolios ----
   * For each portfolio the company is in (company.portfolios) OR being
   * considered for (company.portNote, comma/space delimited list of
   * portfolio codes from the "Port? (considering for)" picker), take
   * Core + Value benchmarks from the BENCHMARKS map; dedupe; resolve
   * to marketsSnapshot rows. */
  const portCodes = (company.portfolios || []).slice();
  ((company.portNote || "").split(/[,\s]+/)).forEach(function (p) {
    const code = (p || "").trim().toUpperCase();
    if (code && BENCHMARKS[code] && portCodes.indexOf(code) < 0) portCodes.push(code);
  });
  const benchmarkNames = [];
  portCodes.forEach(function (p) {
    const b = BENCHMARKS[p];
    if (!b) return;
    if (b.core && benchmarkNames.indexOf(b.core) < 0) benchmarkNames.push(b.core);
    if (b.value && benchmarkNames.indexOf(b.value) < 0) benchmarkNames.push(b.value);
  });
  const indicesData = (marketsSnap && marketsSnap.indices) || null;
  const benchmarkRows = benchmarkNames.map(function (name) {
    const found = findBenchmarkRow(indicesData, name);
    return {
      name: name,
      row: found ? found.row : null,
      isPriorClose: found ? found.isPriorClose : false,
    };
  });

  /* ---- 5Y snapshot rows ---- */
  const ratiosEstimate = (ratios && ratios.estimate) || null;
  const snapshotRows = SNAPSHOT_METRICS.map(function (cfg) {
    let history = null;
    /* Prefer ratios history (longer time series). Fall back to metric
       current value alone (no range bar then). Only apply the
       raw-percent → decimal normalization to actual percent metrics —
       multiplier ratios like P/E or Net Debt/EBITDA stay as-is
       (otherwise a P/Sales of 3.5 would get divided to 0.035). */
    if (ratios && ratios.values && cfg.ratio && ratios.values[cfg.ratio]) {
      const raw = ratios.values[cfg.ratio].slice();
      history = cfg.fmt === "pct" ? toDecimalPct(raw) : raw;
    }
    let current = null;
    /* Current = latest HISTORICAL value (skip forward estimates). */
    if (history && history.length > 0) current = lastHistorical(history, ratiosEstimate);
    if (current === null && cfg.metric != null) {
      const v = parseFloat(m[cfg.metric]);
      if (isFinite(v)) current = v;
    }
    /* Special case P/E: prefer valuation.peCurrent + valuation 5Y range
       (used elsewhere for FpeRange) when peCurrent is available. */
    if (cfg.label === "P/E" && isFinite(parseFloat(valuation.peCurrent))) {
      current = parseFloat(valuation.peCurrent);
    }

    /* 5Y range = last 5 HISTORICAL values from history (no estimates) */
    let stats = null;
    if (history) {
      const last5 = lastNFinite(history, 5, ratiosEstimate);
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
    <div className="mb-6 print-target">
      <div className="flex items-baseline gap-3 mb-3">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">Snapshot — {company.name}</div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400">
          Trailing performance + current values vs 5Y range. Auto-updated daily from FactSet.
        </div>
        <button
          onClick={function () { printPage("charts"); }}
          className="ml-auto text-xs px-2.5 py-1 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors no-print"
          title="Print this view (portrait, multi-page)"
        >
          🖨 Print
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TrailingPerformance
          companyName={company && company.name}
          benchmarkRows={benchmarkRows}
          usTicker={usT ? usT.ticker : null}
          usPerf={usPerf}
          ordTicker={ordT ? ordT.ticker : null}
          ordPerf={ordPerf}
          ordCurrency={ordT ? ((ordT.currency || "").toUpperCase()) : ""}
          legacyPerf={legacyPerf}
          fxRows={(marketsSnap && marketsSnap.fx) || []}
        />
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

function TrailingPerformance({ companyName, benchmarkRows, usTicker, usPerf, ordTicker, ordPerf, ordCurrency, legacyPerf, fxRows }) {
  const PERF_WINDOWS = buildPerfWindows();
  /* USD ↔ Local toggle for the ord-ticker row. The US-ticker row is
     always USD (it's the listed-USD security), no toggle needed. */
  const [ordMode, setOrdMode] = useState("usd"); // "usd" | "local"

  /* Look up the FX series for this company's ord currency, if any.
     The Markets Dashboard upload's FX section stores rows like
     { label: "USDEUR", "1D": ..., "5D": ..., ... }. The series tells
     us how many local currency units per USD changed over each window.
     To convert a local-currency return to USD:
        USD_return = (1 + local_return) / (1 + fx_return) - 1
     because LOCAL/USD * USD = local-asset value; rearranging.  */
  const fxLabel = ordCurrency && ordCurrency !== "USD" ? "USD" + ordCurrency : null;
  const fxRow = fxLabel ? (fxRows || []).find(function (r) {
    return ((r.label || "") + "").toUpperCase().trim() === fxLabel;
  }) : null;
  function ordToUsd(localRet, key) {
    if (!isFiniteV(localRet)) return null;
    if (!fxRow) return null;
    const fxRet = fxRow[key];
    if (!isFiniteV(fxRet)) return null;
    return (1 + localRet) / (1 + fxRet) - 1;
  }

  /* Build the company rows. We have up to two: US (USD) and Ord (toggle). */
  const stockRows = [];
  if (usPerf) {
    stockRows.push({
      label: (companyName || "Stock") + " · " + (usTicker || "US") + " (USD)",
      isStock: true, isPriorClose: false, values: usPerf, currencyTag: "USD",
    });
  }
  if (ordPerf && ordTicker && ordTicker !== usTicker) {
    let ordValues = ordPerf;
    let tag = ordCurrency || "LCL";
    if (ordMode === "usd" && fxRow) {
      const conv = {};
      Object.keys(ordPerf).forEach(function (k) { conv[k] = ordToUsd(ordPerf[k], k); });
      ordValues = conv;
      tag = "USD";
    }
    stockRows.push({
      label: (companyName || "Stock") + " · " + ordTicker + " (" + tag + ")",
      isStock: true, isPriorClose: false, values: ordValues, currencyTag: tag,
      isOrdRow: true, // flagged so we render the toggle next to its label
    });
  }
  if (stockRows.length === 0 && legacyPerf) {
    stockRows.push({
      label: (companyName || "Stock") + " (legacy)",
      isStock: true, isPriorClose: false, values: legacyPerf, currencyTag: "?",
    });
  }

  const benchRows = (benchmarkRows || []).map(function (b) {
    const vals = {};
    PERF_WINDOWS.forEach(function (w) {
      vals[w.key] = benchmarkValue(b.row, w.key);
    });
    return {
      label: b.name,
      isStock: false,
      isPriorClose: b.isPriorClose,
      values: vals,
      missing: !b.row,
    };
  });
  const rows = stockRows.concat(benchRows);

  /* Empty state — no perf data anywhere */
  const anyData = rows.some(function (r) {
    return PERF_WINDOWS.some(function (w) { return isFiniteV(r.values[w.key]); });
  });
  if (!anyData) {
    return (
      <div className={TILE}>
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Trailing Performance</div>
        <div className="text-xs text-gray-400 dark:text-slate-500 italic py-6 text-center">
          No performance data — needs a daily FactSet pull (and benchmark rows in the Markets Dashboard upload).
        </div>
      </div>
    );
  }

  /* Hide adjacent windows whose value is identical for the FIRST stock
     row (within rounding). e.g. when MTD == QTD (start of a quarter) or
     QTD == YTD (start of a year), the redundant column collapses out
     so the table doesn't waste horizontal space on duplicates. */
  const dedupeRef = stockRows[0] && stockRows[0].values;
  const visibleWindows = (function () {
    if (!dedupeRef) return PERF_WINDOWS;
    const out = [];
    let prevVal = null;
    PERF_WINDOWS.forEach(function (w) {
      const v = dedupeRef[w.key];
      if (isFiniteV(v) && isFiniteV(prevVal) && Math.abs(v - prevVal) < 1e-5) {
        return; /* drop this window — same as previous visible */
      }
      out.push(w);
      if (isFiniteV(v)) prevVal = v;
    });
    return out;
  })();

  function fmt(v) {
    if (!isFiniteV(v)) return "--";
    return (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";
  }
  function color(v) {
    if (!isFiniteV(v)) return "#94a3b8";
    if (v >= 0.0005) return "#16a34a";
    if (v <= -0.0005) return "#dc2626";
    return "#64748b";
  }

  /* Toggle button (USD ↔ Local) for the ord row, sized to fit inline
     with the row label. Only enabled when an FX series is available. */
  function OrdToggle() {
    const canToggle = !!fxRow;
    return (
      <button
        type="button"
        disabled={!canToggle}
        onClick={function () { setOrdMode(function (m) { return m === "usd" ? "local" : "usd"; }); }}
        className={"ml-1 text-[9px] px-1.5 py-0.5 rounded border " + (canToggle ? "border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" : "border-slate-200 dark:border-slate-700 text-gray-400 dark:text-slate-600 cursor-not-allowed")}
        title={canToggle ? ("Switch to " + (ordMode === "usd" ? ordCurrency : "USD")) : ("Upload FX returns for " + (fxLabel || "this currency") + " in the Markets Dashboard to enable USD conversion.")}
      >
        {ordMode === "usd" ? "→ " + (ordCurrency || "LCL") : "→ USD"}
      </button>
    );
  }

  return (
    <div className={TILE}>
      <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Trailing Performance</div>
        <div className="text-[10px] text-gray-400 dark:text-slate-500 italic">
          {usTicker || ordTicker ? ((usTicker ? usTicker + " · " : "") + (ordTicker && ordTicker !== usTicker ? ordTicker : "")).trim() : ""}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1.6fr) repeat(" + visibleWindows.length + ", minmax(56px, 1fr))" }}>
          {/* Header row */}
          <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-700 py-1"></div>
          {visibleWindows.map(function (w) {
            return (
              <div key={"h-" + w.key} className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-700 py-1 text-right">{w.label}</div>
            );
          })}

          {/* Data rows */}
          {rows.map(function (r, ri) {
            const isStockRow = r.isStock;
            const rowBg = isStockRow ? "bg-blue-50/40 dark:bg-blue-950/20" : "";
            return (
              <div key={"row-" + ri} style={{ display: "contents" }}>
                <div className={"py-1 px-1 text-[11px] font-medium text-gray-900 dark:text-slate-100 truncate " + rowBg}>
                  {r.label}
                  {r.isOrdRow && <OrdToggle/>}
                  {r.isPriorClose && (
                    <span className="text-[9px] text-amber-600 dark:text-amber-400 italic ml-1">(prior close)</span>
                  )}
                  {r.missing && (
                    <span className="text-[9px] text-gray-400 dark:text-slate-500 italic ml-1">(no data)</span>
                  )}
                </div>
                {visibleWindows.map(function (w) {
                  const v = r.values[w.key];
                  return (
                    <div key={w.key} className={"py-1 px-1 text-[11px] tabular-nums text-right " + rowBg}
                         style={{ color: color(v) }}>
                      {fmt(v)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
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
