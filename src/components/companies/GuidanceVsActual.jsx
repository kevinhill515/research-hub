/* Guidance vs Actual diff table for a closed FY.
 *
 * Renders only when the supplied entry's reportDate falls within ~90
 * days after a closed FY-end period in the company's guidance.history
 * (i.e. this earnings entry is the FY-end report). For mid-FY
 * quarterly reports the FY-actuals don't yet exist, so this returns
 * null and the EarningsEntry tab keeps its existing form-only view.
 *
 * For each tracked metric in that closed FY:
 *   - low / high / mid of the FINAL guidance (latest row by date)
 *   - actual (from the row's Actual column when populated; FactSet
 *     backfills this once the period closes)
 *   - surprise % = actual / mid - 1 (color-coded)
 *
 * Read-only. Sourced entirely from c.guidance — no separate upload. */

import { isFiniteNum } from '../../utils/numbers.js';
import { parseDate } from '../../utils/index.js';
import { fmtMoney, fmtPct } from '../../utils/chart.js';

/* Window after FY-end during which the FY-end earnings call is
 * expected. 90 days covers all major reporting cadences (most names
 * report within 30-60 days; FY-end + earnings calls within 90 is safe). */
const FY_END_WINDOW_DAYS = 90;

function midOf(low, high) {
  if (isFiniteNum(low) && isFiniteNum(high)) return (low + high) / 2;
  if (isFiniteNum(low)) return low;
  if (isFiniteNum(high)) return high;
  return null;
}

/* "2026-03-31" → "FY26" */
function fyLabel(periodIso) {
  const m = /^(\d{4})-/.exec(periodIso || "");
  return m ? "FY" + m[1].slice(2) : (periodIso || "");
}

/* Find the closed FY whose end date is within FY_END_WINDOW_DAYS BEFORE
 * the entry's reportDate. Returns the period ISO or null. */
function findMatchingFy(entryDateStr, history) {
  if (!entryDateStr || !history || !history.length) return null;
  const entryD = parseDate(entryDateStr);
  if (!entryD || isNaN(entryD.getTime())) return null;
  const winMs = FY_END_WINDOW_DAYS * 24 * 3600 * 1000;
  let bestPeriod = null, bestDiff = Infinity;
  history.forEach(function (r) {
    if (!r.period) return;
    const p = parseDate(r.period);
    if (!p || isNaN(p.getTime())) return;
    const diff = entryD.getTime() - p.getTime();
    if (diff < 0 || diff > winMs) return; /* not within window after FY-end */
    if (diff < bestDiff) { bestDiff = diff; bestPeriod = r.period; }
  });
  return bestPeriod;
}

export default function GuidanceVsActual({ company, entry, currency }) {
  const guidance = company && company.guidance;
  const history = (guidance && guidance.history) || [];
  if (history.length === 0) return null;

  /* Match this entry to a closed FY end. Skip rendering when the
     entry's date doesn't fall within the FY-end reporting window. */
  const period = findMatchingFy(entry && entry.reportDate, history);
  if (!period) return null;

  /* Currency for absolute formatting — prefer the company's reporting
     currency from its ord ticker, fall back to the EarningsEntry's
     `currency` prop (which is valuation.currency). */
  const ord = ((company && company.tickers) || []).find(function (t) { return t.isOrdinary; });
  const ccy = (ord && ord.currency) || currency || "";

  /* Group by metric for the matched FY. For each metric, take the LAST
     guidance row by date (final guidance) and the row(s) with actuals
     populated. */
  const byMetric = {};
  history.forEach(function (r) {
    if (r.period !== period) return;
    (byMetric[r.item] = byMetric[r.item] || []).push(r);
  });

  const rows = Object.keys(byMetric).map(function (metric) {
    const arr = byMetric[metric].slice().sort(function (a, b) {
      return (a.date || "").localeCompare(b.date || "");
    });
    const finalRow = arr[arr.length - 1];
    const actualRow = arr.slice().reverse().find(function (r) { return isFiniteNum(r.actual); });
    if (!actualRow) return null; /* no FY-actual yet — skip metric */
    const finalLow  = finalRow ? finalRow.low  : null;
    const finalHigh = finalRow ? finalRow.high : null;
    const finalMid  = midOf(finalLow, finalHigh);
    const actual    = actualRow.actual;
    const surprise  = (isFiniteNum(actual) && isFiniteNum(finalMid) && finalMid !== 0)
      ? actual / finalMid - 1 : null;
    return {
      metric: metric,
      finalLow: finalLow,
      finalHigh: finalHigh,
      finalMid: finalMid,
      actual: actual,
      surprise: surprise,
    };
  }).filter(Boolean);

  if (rows.length === 0) return null;

  function colorForSurprise(s) {
    if (!isFiniteNum(s)) return "#94a3b8";
    if (s > 0.005) return "#16a34a";
    if (s < -0.005) return "#dc2626";
    return "#64748b";
  }

  return (
    <div className="mb-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
      <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
        <div className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">
          {fyLabel(period)} Guidance vs Actual
          <span className="text-gray-400 dark:text-slate-500 font-normal"> · period {period}</span>
        </div>
        <div className="text-[10px] text-gray-400 dark:text-slate-500 italic">
          from c.guidance — re-import to refresh
        </div>
      </div>
      <div className="grid grid-cols-[1fr_repeat(4,_minmax(70px,_auto))] gap-x-3 gap-y-1 text-[11px]">
        <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold">Metric</div>
        <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold text-right">Final guidance</div>
        <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold text-right">Mid</div>
        <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold text-right">Actual</div>
        <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold text-right">Surprise</div>
        {rows.map(function (r) {
          const showRange = isFiniteNum(r.finalLow) && isFiniteNum(r.finalHigh) && r.finalLow !== r.finalHigh;
          const guidText = showRange
            ? fmtMoney(r.finalLow, ccy) + " – " + fmtMoney(r.finalHigh, ccy)
            : (isFiniteNum(r.finalMid) ? fmtMoney(r.finalMid, ccy) : "—");
          return (
            <div key={r.metric} className="contents">
              <div className="text-gray-700 dark:text-slate-300 truncate" title={r.metric}>{r.metric}</div>
              <div className="text-right tabular-nums text-gray-600 dark:text-slate-400">{guidText}</div>
              <div className="text-right tabular-nums text-gray-600 dark:text-slate-400">{isFiniteNum(r.finalMid) ? fmtMoney(r.finalMid, ccy) : "—"}</div>
              <div className="text-right tabular-nums font-semibold text-gray-900 dark:text-slate-100">{isFiniteNum(r.actual) ? fmtMoney(r.actual, ccy) : "—"}</div>
              <div className="text-right tabular-nums font-semibold" style={{ color: colorForSurprise(r.surprise) }}>
                {isFiniteNum(r.surprise) ? fmtPct(r.surprise, 1, true) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
