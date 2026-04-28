/* Pre-Earnings Brief panel — sits at the top of the Earnings & Thesis
 * Check tab. Aggregates everything we already know about the company
 * into a compact one-glance review block:
 *
 *   - Days until next report (from c.guidance.nextReportDate, falling
 *     back to the soonest future c.earningsEntries.reportDate)
 *   - Last reported quarter (most recent past c.earningsEntries entry)
 *     with its short takeaway and thesis status
 *   - Latest guidance summary for the upcoming FY: 3-4 most-tracked
 *     metrics with their latest mid-guidance Y/Y and last-revision
 *     direction (▲/▼/—)
 *   - EPS revisions trend: 3-month direction across forward FYs
 *   - Stock perf vs first benchmark over 1M and 3M
 *
 * The panel is read-only; it doesn't write to the company. All data
 * sources are best-effort — when a section's source is missing the
 * section just renders a small "no data" hint instead of disappearing,
 * so the user can see what's still needed for full context. */

import { BENCHMARKS } from '../../constants/index.js';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { isFiniteNum } from '../../utils/numbers.js';
import { parseDate } from '../../utils/index.js';
import { fmtMoney } from '../../utils/chart.js';

const TILE = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3";
const SECTION = "mb-2 last:mb-0";
const SECTION_LABEL = "text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1";

function fmtPct(v, dp) {
  if (!isFiniteNum(v)) return "—";
  const d = dp == null ? 1 : dp;
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(d) + "%";
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* "2026-03-31" → "FY26" */
function fyLabel(periodIso) {
  const m = /^(\d{4})-/.exec(periodIso || "");
  if (!m) return periodIso || "";
  return "FY" + m[1].slice(2);
}

/* Days from today to a date string (any parseDate-acceptable format).
 * Negative = in the past. */
function daysUntil(iso) {
  if (!iso) return null;
  const d = parseDate(iso);
  if (!d || isNaN(d.getTime())) return null;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t0.getTime()) / (24 * 3600 * 1000));
}

function findBenchmark(benchmarkNames, marketsSnap) {
  const indices = (marketsSnap && marketsSnap.indices) || [];
  for (let i = 0; i < benchmarkNames.length; i++) {
    const name = benchmarkNames[i];
    const candidates = [name, "MSCI " + name, name + " (Index)", "MSCI " + name + " (Index)"]
      .map(function (s) { return s.toLowerCase().trim(); });
    const hit = indices.find(function (r) {
      const lbl = ((r.label || r.name || "") + "").toLowerCase().trim();
      return candidates.indexOf(lbl) >= 0;
    });
    if (hit) return { row: hit, name: name };
  }
  return null;
}

export default function PreEarningsBrief({ company }) {
  const { marketsSnapshot, ensureMarketsSnapshot } = useCompanyContext();
  if (typeof ensureMarketsSnapshot === "function") ensureMarketsSnapshot();

  if (!company) return null;

  /* ---- Section 1: next-report countdown ----
   * Source priority:
   *   1. c.guidance.nextReportDate (FactSet Guidance History metadata)
   *   2. soonest future c.earningsEntries.reportDate (Earnings Dates
   *      upload populates this)
   *   3. c.lastReportDate sanity check — if it's in the future, use it
   *      (rare; happens when the calendar import landed a date that
   *      hasn't passed yet but didn't create an entry)
   * Uses parseDate so it tolerates "YYYY-MM-DD", "M/D/YYYY", etc. */
  let nextRepIso = (company.guidance && company.guidance.nextReportDate) || null;
  if (!nextRepIso) {
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    ((company.earningsEntries) || []).forEach(function (e) {
      if (!e.reportDate) return;
      const d = parseDate(e.reportDate);
      if (!d || isNaN(d.getTime()) || d < t0) return;
      const cur = nextRepIso ? parseDate(nextRepIso) : null;
      if (!cur || d < cur) nextRepIso = e.reportDate;
    });
  }
  if (!nextRepIso && company.lastReportDate) {
    const lr = parseDate(company.lastReportDate);
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    if (lr && !isNaN(lr.getTime()) && lr >= t0) nextRepIso = company.lastReportDate;
  }
  const daysToNext = daysUntil(nextRepIso);

  /* ---- Section 2: last reported quarter ---- */
  const sortedEntries = ((company.earningsEntries) || [])
    .filter(function (e) { return e.reportDate; })
    .slice()
    .sort(function (a, b) { return (b.reportDate || "").localeCompare(a.reportDate || ""); });
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastReported = sortedEntries.find(function (e) { return (e.reportDate || "") <= todayStr; });

  /* ---- Section 3: latest guidance per metric ----
   * Pick the most relevant FY:
   *   - Prefer the smallest period >= today (the next FY guidance is
   *     being given for; e.g. FY27 once Hitachi has issued FY27 ranges).
   *   - Else fall back to the most recent CLOSED FY (period < today),
   *     so for a name like Hitachi that JUST reported FY26 actuals and
   *     hasn't yet issued FY27 guidance, FY26 still surfaces here.
   *   - Periods more than 365 days in the past are treated as stale
   *     and don't qualify for the fallback. */
  const guidance = company.guidance && company.guidance.history ? company.guidance : null;
  const upcomingFyRows = (function () {
    if (!guidance) return null;
    let upcomingPeriod = null, recentClosedPeriod = null;
    const stalenessCutoffMs = Date.now() - 365 * 24 * 3600 * 1000;
    guidance.history.forEach(function (r) {
      if (!r.period) return;
      if (r.period >= todayStr) {
        if (!upcomingPeriod || r.period < upcomingPeriod) upcomingPeriod = r.period;
      } else {
        const pd = parseDate(r.period);
        if (!pd || pd.getTime() < stalenessCutoffMs) return;
        if (!recentClosedPeriod || r.period > recentClosedPeriod) recentClosedPeriod = r.period;
      }
    });
    const upcomingPeriodOrClosed = upcomingPeriod || recentClosedPeriod;
    if (!upcomingPeriodOrClosed) return null;
    const isClosed = upcomingPeriodOrClosed === recentClosedPeriod && !upcomingPeriod;
    /* Reuse a single name from here on. */
    const period = upcomingPeriodOrClosed;
    /* Group by metric. */
    const byMetric = {};
    guidance.history.forEach(function (r) {
      if (r.period !== period) return;
      (byMetric[r.item] = byMetric[r.item] || []).push(r);
    });
    /* Resolve prior FY actual per metric for Y/Y baseline. */
    function priorFyEnd(p) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p || "");
      if (!m) return null;
      return (parseInt(m[1], 10) - 1) + "-" + m[2] + "-" + m[3];
    }
    const prior = priorFyEnd(period);
    const rows = Object.keys(byMetric).map(function (metric) {
      const entries = byMetric[metric].slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });
      const last = entries[entries.length - 1];
      const prev = entries.length > 1 ? entries[entries.length - 2] : null;
      const priorActualRow = guidance.history.find(function (r) {
        return r.period === prior && r.item === metric && isFiniteNum(r.actual);
      });
      const baseline = priorActualRow ? priorActualRow.actual : null;
      function midOf(r) {
        if (!r) return null;
        if (isFiniteNum(r.low) && isFiniteNum(r.high)) return (r.low + r.high) / 2;
        return isFiniteNum(r.low) ? r.low : (isFiniteNum(r.high) ? r.high : null);
      }
      const lastMid = midOf(last);
      const prevMid = midOf(prev);
      const yoy = (isFiniteNum(lastMid) && isFiniteNum(baseline) && baseline > 0)
        ? (lastMid / baseline - 1) : null;
      let arrow = "·";
      if (isFiniteNum(prevMid) && isFiniteNum(lastMid)) {
        if (lastMid > prevMid * 1.001) arrow = "▲";
        else if (lastMid < prevMid * 0.999) arrow = "▼";
        else arrow = "—";
      }
      return {
        metric: metric, yoy: yoy, arrow: arrow,
        count: entries.length, lastDate: last && last.date,
        lastLow: last && last.low, lastHigh: last && last.high,
        lastMid: lastMid, baseline: baseline,
      };
    }).sort(function (a, b) { return b.count - a.count; }).slice(0, 4);
    return { period: period, rows: rows, isClosed: isClosed };
  })();

  /* ---- Section 4: EPS revisions trend ----
   * For each forward horizon (FY+1, FY+2), compare the latest monthly
   * value vs the value 3 months prior. Direction = arrow. */
  const epsRev = company.epsRevisions;
  const epsTrend = (function () {
    if (!epsRev || !epsRev.dates || !epsRev.dates.length || !epsRev.series) return null;
    const horizons = epsRev.series.filter(function (s) { return s.horizon > 0 && s.monthly && s.monthly.length > 0; });
    return horizons.slice(0, 3).map(function (s) {
      const last = s.monthly[s.monthly.length - 1];
      const back = s.monthly[s.monthly.length - 4];
      if (!isFiniteNum(last) || !isFiniteNum(back) || back === 0) return { horizon: s.horizon, pct: null, arrow: "·" };
      const pct = (last - back) / Math.abs(back);
      const arrow = pct > 0.005 ? "▲" : pct < -0.005 ? "▼" : "—";
      return { horizon: s.horizon, pct: pct, arrow: arrow };
    });
  })();

  /* ---- Section 5: stock vs benchmark ----
   * 1M and 3M perf for the company's primary perf row vs the first
   * benchmark resolved against marketsSnapshot. */
  const tickers = company.tickers || [];
  const ordT = tickers.find(function (t) { return t.isOrdinary; }) || null;
  const usT = tickers.find(function (t) { return (t.currency || "").toUpperCase() === "USD" && !t.isOrdinary; })
           || (ordT && (ordT.currency || "").toUpperCase() === "USD" ? ordT : null);
  const perfTicker = usT || ordT;
  const perfMap = (perfTicker && perfTicker.perf) || {};
  function perfFor(key) { return isFiniteNum(perfMap[key]) ? perfMap[key] : null; }

  const portCodes = (company.portfolios || []).slice();
  ((company.portNote || "").split(/[,\s]+/)).forEach(function (p) {
    const code = (p || "").toUpperCase().trim();
    if (code && BENCHMARKS[code] && portCodes.indexOf(code) < 0) portCodes.push(code);
  });
  const benchmarkNames = [];
  portCodes.forEach(function (p) {
    const b = BENCHMARKS[p];
    if (!b) return;
    if (b.core && benchmarkNames.indexOf(b.core) < 0) benchmarkNames.push(b.core);
    if (b.value && benchmarkNames.indexOf(b.value) < 0) benchmarkNames.push(b.value);
  });
  const bench = findBenchmark(benchmarkNames, marketsSnapshot);
  function benchVal(key) {
    if (!bench) return null;
    const v = bench.row[key.toLowerCase()] !== undefined ? bench.row[key.toLowerCase()] : bench.row[key];
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    const n = parseFloat(String(v).replace(/%/g, "").trim());
    if (!isFinite(n)) return null;
    return Math.abs(n) > 1.5 ? n / 100 : n;
  }

  /* ---- Render ---- */
  function statusPill(status) {
    if (!status) return null;
    const bg = status === "On track" ? "#dcfce7" : status === "Watch" ? "#fef9c3" : "#fee2e2";
    const fg = status === "On track" ? "#166534" : status === "Watch" ? "#854d0e" : "#991b1b";
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: bg, color: fg }}>{status}</span>;
  }
  function arrowColor(arrow) {
    if (arrow === "▲") return "#16a34a";
    if (arrow === "▼") return "#dc2626";
    return "#94a3b8";
  }

  /* Headline: countdown chip — color escalates as date approaches. */
  let chipText = "no upcoming report date";
  let chipClass = "text-gray-400 dark:text-slate-500 italic";
  if (daysToNext != null) {
    if (daysToNext === 0)      { chipText = "Reports today";                                           chipClass = "text-amber-700 dark:text-amber-400 font-bold"; }
    else if (daysToNext > 0 && daysToNext <= 7)  { chipText = "Reports in " + daysToNext + " day" + (daysToNext === 1 ? "" : "s") + " · " + fmtDate(nextRepIso); chipClass = "text-amber-700 dark:text-amber-400 font-semibold"; }
    else if (daysToNext > 0 && daysToNext <= 30) { chipText = "Reports in " + daysToNext + " days · " + fmtDate(nextRepIso); chipClass = "text-amber-700 dark:text-amber-400"; }
    else if (daysToNext > 0)                     { chipText = "Reports in " + daysToNext + " days · " + fmtDate(nextRepIso); chipClass = "text-gray-600 dark:text-slate-300"; }
    else                                         { chipText = "Reported " + Math.abs(daysToNext) + " day" + (Math.abs(daysToNext) === 1 ? "" : "s") + " ago · " + fmtDate(nextRepIso); chipClass = "text-gray-400 dark:text-slate-500"; }
  }

  return (
    <div className={TILE + " mb-3 bg-blue-50/30 dark:bg-blue-950/15 border-blue-200 dark:border-blue-800"}>
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Pre-Earnings Brief</div>
        <span className={"text-xs " + chipClass}>{chipText}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left col: last reported + EPS revisions trend */}
        <div>
          <div className={SECTION}>
            <div className={SECTION_LABEL}>Last reported</div>
            {lastReported ? (
              <div className="text-[12px] text-gray-700 dark:text-slate-300">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-semibold">{lastReported.quarter || fmtDate(lastReported.reportDate)}</span>
                  <span className="text-gray-500 dark:text-slate-400">{fmtDate(lastReported.reportDate)}</span>
                  {statusPill(lastReported.thesisStatus)}
                </div>
                {lastReported.shortTakeaway && (
                  <div className="text-[11px] italic text-gray-600 dark:text-slate-400">&ldquo;{lastReported.shortTakeaway}&rdquo;</div>
                )}
                {lastReported.tpChange && lastReported.tpChange !== "Unchanged" && (
                  <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">
                    TP {lastReported.tpChange.toLowerCase()}{lastReported.newTP ? " → " + lastReported.newTP : ""}
                    {lastReported.tpRationale && " · " + lastReported.tpRationale}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-gray-400 dark:text-slate-500 italic">no entries yet — start a new one below</div>
            )}
          </div>

          <div className={SECTION}>
            <div className={SECTION_LABEL}>EPS revisions (last 3M)</div>
            {epsTrend && epsTrend.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-[11px]">
                {epsTrend.map(function (t) {
                  return (
                    <div key={t.horizon} className="flex items-center gap-1">
                      <span className="text-gray-500 dark:text-slate-400">FY+{t.horizon}</span>
                      <span style={{ color: arrowColor(t.arrow) }} className="font-semibold">{t.arrow}</span>
                      <span className="tabular-nums">{t.pct != null ? fmtPct(t.pct) : "—"}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-gray-400 dark:text-slate-500 italic">no revisions data — upload from E[EPS] Revisions</div>
            )}
          </div>

          <div className={SECTION}>
            <div className={SECTION_LABEL}>Stock vs {bench ? bench.name : "benchmark"}</div>
            {perfTicker ? (
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                {[ ["1M","1M"], ["3M","3M"], ["YTD","YTD"] ].map(function (pair) {
                  const k = pair[0];
                  const sp = perfFor(k);
                  const bp = benchVal(k);
                  const diff = (isFiniteNum(sp) && isFiniteNum(bp)) ? sp - bp : null;
                  return (
                    <div key={k} className="border-l-2 border-slate-200 dark:border-slate-700 pl-2">
                      <div className="text-[9px] uppercase text-gray-400 dark:text-slate-500">{pair[1]}</div>
                      <div className="tabular-nums" style={{ color: arrowColor(isFiniteNum(sp) ? (sp >= 0 ? "▲" : "▼") : "·") }}>
                        {fmtPct(sp)}
                      </div>
                      {isFiniteNum(diff) && (
                        <div className="text-[10px] text-gray-500 dark:text-slate-400">vs {fmtPct(bp)} <span className={diff >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>({diff >= 0 ? "+" : ""}{(diff * 100).toFixed(1)}pp)</span></div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-gray-400 dark:text-slate-500 italic">no perf data — re-run Prices import</div>
            )}
          </div>
        </div>

        {/* Right col: guidance summary for upcoming FY */}
        <div>
          <div className={SECTION_LABEL}>
            Latest guidance {upcomingFyRows ? "· " + fyLabel(upcomingFyRows.period) + (upcomingFyRows.isClosed ? " (closed)" : "") + " · period " + upcomingFyRows.period : ""}
          </div>
          {upcomingFyRows && upcomingFyRows.rows.length > 0 ? (
            <div className="space-y-1">
              {(function(){
                /* Reporting currency for absolute tooltip — use the ord
                   ticker's currency so JPY/EUR/etc. labels are right.  */
                const reportingCcy = (function(){
                  const ord = (company.tickers || []).find(function(t){return t.isOrdinary;});
                  if (ord && ord.currency) return ord.currency.toUpperCase();
                  if (company.valuation && company.valuation.currency) return company.valuation.currency.toUpperCase();
                  return "";
                })();
                return upcomingFyRows.rows.map(function (r) {
                  /* Absolute tooltip: show low–high range or single mid,
                     plus the prior FY actual baseline used for the Y/Y. */
                  const lowAbs  = isFiniteNum(r.lastLow)  ? fmtMoney(r.lastLow,  reportingCcy) : null;
                  const highAbs = isFiniteNum(r.lastHigh) ? fmtMoney(r.lastHigh, reportingCcy) : null;
                  const midAbs  = isFiniteNum(r.lastMid)  ? fmtMoney(r.lastMid,  reportingCcy) : null;
                  let absText = "";
                  if (r.lastLow !== r.lastHigh && lowAbs && highAbs) absText = lowAbs + " – " + highAbs;
                  else if (midAbs) absText = midAbs;
                  let title = r.metric;
                  if (absText) title += "\nLatest mid-guidance: " + absText;
                  if (isFiniteNum(r.baseline)) title += "\nPrior FY actual: " + fmtMoney(r.baseline, reportingCcy);
                  return (
                    <div key={r.metric} className="flex items-center gap-2 text-[12px]" title={title}>
                      <span className="flex-1 text-gray-700 dark:text-slate-300 truncate">{r.metric}</span>
                      <span style={{ color: arrowColor(r.arrow) }} className="text-[11px] font-semibold w-4 text-center">{r.arrow}</span>
                      <span className={"tabular-nums font-semibold w-16 text-right " + (isFiniteNum(r.yoy) ? (r.yoy >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400") : "text-gray-400 dark:text-slate-500")}>
                        {isFiniteNum(r.yoy) ? fmtPct(r.yoy) : "—"}
                      </span>
                    </div>
                  );
                });
              })()}
              <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-1">
                Y/Y vs prior FY actual · ▲ revised up since last announcement · ▼ revised down · open the Guidance tab for the full timeline
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 dark:text-slate-500 italic">no guidance data — upload from Guidance tab</div>
          )}
        </div>
      </div>
    </div>
  );
}
