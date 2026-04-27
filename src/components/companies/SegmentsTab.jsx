/* Company Segments tab — rich, chart-first view of business segments
 * and geography, replacing the legacy template "Segments" section.
 *
 * Layout (top-to-bottom):
 *   1. Revenue Mix   — stacked bar chart of Sales by segment over time
 *                      (toggle: absolute $ ↔ % of total)
 *   2. Margin Ladder — multi-line of operating margin per segment
 *   3. Per-segment cards (grid of clickable tiles with sparklines)
 *   4. Geography     — stacked area (mix evolution) + ranked bar (current)
 *
 * Data shape on the company:
 *   company.segments = {
 *     currency, years[], segments[], geography{revenue[], regions[]},
 *     parsedTotal{?}, updatedAt
 *   }
 *
 * Currency: pulled from the company's reporting currency (getCurrency()),
 * rendered as "M{CCY}" alongside Sales/EBIT figures.
 */

import { useState } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { useConfirm } from '../ui/DialogProvider.jsx';
import { getCurrency } from '../../utils/index.js';
import { isFiniteNum } from '../../utils/numbers.js';
import {
  niceTicks, fmtMoney, fmtMoneyShort, fmtPct, lastFinite, lastFiniteIndex,
  paletteColor as colorFor,
  HIST_COLOR, EST_COLOR, GRID_COLOR, TICK_COLOR,
} from '../../utils/chart.js';

const TILE = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function monthName(m) {
  return MONTH_NAMES[m] || "";
}

/* Sum a given key (e.g. "sales") across an array of segments at every
 * year index. Returns an array of length nYears with totals or null if
 * no segment had a value for that year. */
function perYearSum(segments, key, n) {
  const out = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    let s = 0, any = false;
    for (let j = 0; j < segments.length; j++) {
      const v = segments[j][key][i];
      if (v !== null && v !== undefined && isFinite(v)) { s += v; any = true; }
    }
    out[i] = any ? s : null;
  }
  return out;
}

/* ======================================================================== */

export default function SegmentsTab({ company }) {
  const { setCompanies } = useCompanyContext();
  const confirm = useConfirm();
  const data = company && company.segments;
  const hasData = !!(data && data.years && data.years.length > 0);

  function clearSegments() {
    confirm("Clear all segment data for " + (company.name || "this company") + "?").then(function (ok) {
      if (!ok) return;
      const updated = Object.assign({}, company);
      delete updated.segments;
      setCompanies(function (cs) { return cs.map(function (c) { return c.id === updated.id ? updated : c; }); });
    });
  }

  if (!hasData) {
    return (
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Segments</div>
        <div className="text-sm text-gray-500 dark:text-slate-400 py-6 italic">
          No segment data yet. Upload via <b>Data Hub → Segments</b> — paste the segments + geography block (with the company name on row 1) and it auto-matches to this company by name.
        </div>
      </div>
    );
  }

  /* Reporting currency derives from the company's country, not the
     company object directly — getCurrency() takes a country string. */
  const ccy = getCurrency(company && company.country) || "USD";
  /* "Active" segments only — those with reported data in the most-recent
     historical year. Drops discontinued / divested segments whose data
     trails off years before the latest reported year (e.g. Vinci's
     former segments that were spun out — they shouldn't render as tiles
     since there's no current contribution to track). */
  const lastIdx = (data.years || []).length - 1;
  function isActive(s) {
    if (lastIdx < 0) return true;
    const v1 = s && s.sales ? s.sales[lastIdx] : null;
    const v2 = s && s.ebit  ? s.ebit[lastIdx]  : null;
    const has1 = v1 !== null && v1 !== undefined && v1 !== "" && isFinite(parseFloat(v1));
    const has2 = v2 !== null && v2 !== undefined && v2 !== "" && isFinite(parseFloat(v2));
    return has1 || has2;
  }
  /* opSegs        = ALL operating segments — used by the historical
                       Revenue Mix / Margin Ladder charts so discontinued
                       segments still show up in the time-series view
                       (their contribution in earlier years is real and
                       relevant context).
     activeOpSegs   = only those reporting in the latest FY — used for
                       the per-segment tiles below. Discontinued segments
                       have no current data to track at the tile level.
     inactiveOps    = the difference, surfaced as a small "N hidden" hint. */
  const opSegs       = data.segments.filter(function (s) { return !s.isCostCenter; });
  const activeOpSegs = opSegs.filter(isActive);
  const inactiveOps  = opSegs.filter(function (s) { return !isActive(s); });
  const costCenters  = data.segments.filter(function (s) { return s.isCostCenter; });

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">Segments</div>
        {data.updatedAt && (
          <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">
            Last updated {new Date(data.updatedAt).toLocaleDateString()}
          </span>
        )}
        <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">Reporting currency: {ccy || "—"}</span>
        {inactiveOps.length > 0 && (
          <span className="text-[10px] text-gray-400 dark:text-slate-500 italic" title={"Hidden (no data in latest FY): " + inactiveOps.map(function(s){return s.name;}).join(", ")}>
            {inactiveOps.length} discontinued segment{inactiveOps.length === 1 ? "" : "s"} hidden
          </span>
        )}
        {data.fiscalYearEndMonth && data.fiscalYearEndMonth !== 12 && (
          <span className="text-[10px] text-amber-700 dark:text-amber-400 italic font-medium">
            Fiscal year ends {monthName(data.fiscalYearEndMonth)}
            {data.endDates && data.endDates.length > 0 && data.endDates[data.endDates.length - 1] && (
              " — latest FY ends " + data.endDates[data.endDates.length - 1]
            )}
          </span>
        )}
        <div className="ml-auto flex gap-2 items-center">
          <span className="text-[11px] text-gray-400 dark:text-slate-500 italic">
            Refresh via Data Hub → Segments
          </span>
          <button onClick={clearSegments} className="text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Clear</button>
        </div>
      </div>

      {/* SECTIONS 1 + 2 — Revenue Mix and Profitability Ladder side by side */}
      {(function () {
        /* Operating segments only sum into the total (cost centers
           subtract from EBIT but contribute no Sales). For margin we
           prefer parsedTotal.margin when the paste includes a Total
           row; otherwise we derive it from totalEbit / totalSales. */
        const allSegs = opSegs.concat(costCenters);
        const totalSales = perYearSum(opSegs, "sales", data.years.length);
        const totalEbit  = perYearSum(allSegs, "ebit", data.years.length);
        const derivedMargin = data.years.map(function (_, i) {
          const s = totalSales[i], e = totalEbit[i];
          return (s !== null && e !== null && isFinite(s) && isFinite(e) && s > 0) ? e / s : null;
        });
        const totalMargin = (data.parsedTotal && data.parsedTotal.margin && data.parsedTotal.margin.some(function (v) { return v !== null && isFinite(v); }))
          ? data.parsedTotal.margin
          : derivedMargin;
        /* ROA isn't derivable from segment Sales/EBIT, so we only have
           a Total line when the paste included a Total row with ROA. */
        const totalRoa = (data.parsedTotal && data.parsedTotal.roa && data.parsedTotal.roa.some(function (v) { return v !== null && isFinite(v); }))
          ? data.parsedTotal.roa
          : null;

        return (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <RevenueMix years={data.years} segments={opSegs} ccy={ccy} endDates={data.endDates} />
              <MarginLadder years={data.years} segments={opSegs} totalMargin={totalMargin} totalRoa={totalRoa} />
            </div>

            {/* SECTION 3 — Per-segment cards (with Total card first).
                Active segments only — discontinued segments have no
                current contribution and clutter the tile grid. They
                still appear in the historical Revenue Mix / Margin
                charts above, where their past contribution is relevant. */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(activeOpSegs.length > 0 || costCenters.length > 0) && (
                <TotalCard
                  years={data.years}
                  totalSales={totalSales}
                  totalEbit={totalEbit}
                  totalMargin={totalMargin}
                  ccy={ccy}
                  parsedTotal={data.parsedTotal}
                />
              )}
              {activeOpSegs.map(function (s, i) {
                return <SegmentCard key={s.name} segment={s} years={data.years} color={colorFor(i)} ccy={ccy}
                  totalSales={totalSales} totalEbit={totalEbit} />;
              })}
              {costCenters.map(function (s) {
                return <SegmentCard key={s.name} segment={s} years={data.years} color="#64748b" ccy={ccy}
                  totalSales={totalSales} totalEbit={totalEbit} />;
              })}
            </div>
          </>
        );
      })()}

      {/* SECTION 4 — Geography. Stacked area shows ALL reported buckets
          (per ASC 280 / IFRS 8 they're mutually exclusive — France is a
          peer of Western Europe, not a subset). HQ country still gets
          its own callout tile so the home market is easy to find. */}
      {data.geography && data.geography.regions && data.geography.regions.length > 0 && (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <GeographyMix years={data.years} geography={data.geography} endDates={data.endDates} />
          </div>
          <div className="flex flex-col gap-3">
            <HomeMarketTile years={data.years} geography={data.geography} endDates={data.endDates} hqCountry={company && company.country} />
            <GeographySnapshot years={data.years} geography={data.geography} endDates={data.endDates} />
          </div>
        </div>
      )}

      {/* SECTION 5 — Standardized Geography. Canonical 4-region rollup
          (Americas / Europe / Asia-Pac / Africa-ME) with sub-country
          detail. Same buckets across companies → enables portfolio-
          weighted regional aggregation. */}
      {data.geography && data.geography.standardized && data.geography.standardized.regions && data.geography.standardized.regions.length > 0 && (function(){
        /* Display-time dedupe of standardized regions: in older parses
           (before the parser-side guard) a stray reported-geo row with
           a canonical region name (e.g. FLEX's "Americas 0.3%") could
           land in standardized as a duplicate. Render the LARGER one
           per canonical name without requiring a re-import. */
        const seen = {};
        const cleaned = [];
        (data.geography.standardized.regions || []).forEach(function (r) {
          const key = (r.name || "").toLowerCase().trim();
          const last = (function(){ for (let i = (r.values||[]).length - 1; i >= 0; i--) { const v = r.values[i]; if (v !== null && v !== undefined && isFinite(v)) return v; } return null; })();
          const mag = last !== null ? Math.abs(last) : 0;
          if (seen[key] === undefined) { seen[key] = cleaned.length; cleaned.push(r); }
          else {
            const idx = seen[key];
            const cur = cleaned[idx];
            const curLast = (function(){ for (let i = (cur.values||[]).length - 1; i >= 0; i--) { const v = cur.values[i]; if (v !== null && v !== undefined && isFinite(v)) return v; } return null; })();
            const curMag = curLast !== null ? Math.abs(curLast) : 0;
            if (mag > curMag) cleaned[idx] = r;
          }
        });
        const cleanedStdGeo = Object.assign({}, data.geography.standardized, { regions: cleaned });
        return (
          <div className="mt-3">
            <StandardizedGeography years={data.years} stdGeo={cleanedStdGeo} endDates={data.endDates} />
          </div>
        );
      })()}
    </div>
  );
}

/* ============================ Section 1 ================================ */

function RevenueMix({ years, segments, ccy, endDates }) {
  const [mode, setMode] = useState("abs"); /* "abs" | "pct" */
  const W = 600, H = 340, PAD_T = 16, PAD_B = 30, PAD_L = 60, PAD_R = 16;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = years.length;

  /* Per-year totals across operating segments (cost centers already
     excluded by caller). */
  const yearTotals = years.map(function (_, i) {
    return segments.reduce(function (sum, s) {
      const v = s.sales[i];
      return sum + (v !== null && isFinite(v) && v > 0 ? v : 0);
    }, 0);
  });

  const yMax = mode === "pct" ? 1.0 : Math.max.apply(null, yearTotals.concat([1])) * 1.05;
  const yMin = 0;

  function xOf(i) { return PAD_L + (i + 0.5) * (innerW / n); }
  function yOf(v) { return PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH; }
  const bw = (innerW / n) * 0.72;

  /* Latest year with non-zero total, used for legend percent shares. */
  const latestIdx = (function () {
    for (let i = years.length - 1; i >= 0; i--) {
      if (yearTotals[i] > 0) return i;
    }
    return -1;
  })();
  const latestTotal = latestIdx >= 0 ? yearTotals[latestIdx] : 0;

  return (
    <div className={TILE}>
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Revenue Mix</div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400">
          Sales by segment over time {ccy ? "(M " + ccy + ")" : ""}
        </div>
        <div className="ml-auto flex gap-1 text-[11px]">
          <button
            onClick={function () { setMode("abs"); }}
            className={"px-2 py-0.5 rounded-full border " + (mode === "abs" ? "bg-blue-700 text-white border-blue-700" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-700 dark:text-slate-300")}
          >Absolute</button>
          <button
            onClick={function () { setMode("pct"); }}
            className={"px-2 py-0.5 rounded-full border " + (mode === "pct" ? "bg-blue-700 text-white border-blue-700" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-700 dark:text-slate-300")}
          >% of total</button>
        </div>
      </div>

      <svg width="100%" height={H} viewBox={"0 0 " + W + " " + H} role="img" aria-label="Revenue mix">
        <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="none" stroke={GRID_COLOR} />
        {niceTicks(yMin, yMax, 5).map(function (t, i) {
          const y = yOf(t);
          const lbl = mode === "pct" ? (t * 100).toFixed(0) + "%" : fmtMoneyShort(t);
          return (
            <g key={"t-" + i}>
              <line x1={PAD_L} y1={y} x2={PAD_L + innerW} y2={y} stroke={TICK_COLOR} />
              <text x={PAD_L - 6} y={y + 3} fontSize="9" textAnchor="end" fill="#64748b">{lbl}</text>
            </g>
          );
        })}
        {/* Stacked bars */}
        {years.map(function (yr, i) {
          const total = yearTotals[i] || 0;
          if (total === 0) return null;
          let runningTop = yOf(mode === "pct" ? 1 : total); /* top of stack at this year */
          return (
            <g key={i}>
              {segments.map(function (s, si) {
                const v = s.sales[i];
                if (!isFinite(v) || v <= 0) return null;
                const display = mode === "pct" ? v / total : v;
                const segH = (display / yMax) * innerH;
                const x = xOf(i) - bw / 2;
                const y = runningTop;
                runningTop += segH;
                return (
                  <rect key={si} x={x} y={y} width={bw} height={segH}
                    fill={colorFor(si)} opacity="0.85">
                    <title>{s.name + ": " + fmtMoney(v, ccy) + "  (" + ((v / total) * 100).toFixed(1) + "%)"}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
        {/* X labels */}
        {years.map(function (yr, i) {
          const step = n > 10 ? 2 : 1;
          if (i % step !== 0 && i !== n - 1) return null;
          return <text key={i} x={xOf(i)} y={H - 12} fontSize="9" textAnchor="middle" fill="#64748b">{String(yr).slice(2)}</text>;
        })}
      </svg>

      {/* Horizontal wrapping legend — color · name · abs · (% of total). */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-gray-600 dark:text-slate-300">
        {segments.map(function (s, si) {
          const v = latestIdx >= 0 ? s.sales[latestIdx] : null;
          const abs = v !== null && isFinite(v) ? fmtMoney(v, ccy) : "--";
          const pct = (v !== null && isFinite(v) && latestTotal > 0) ? ((v / latestTotal) * 100).toFixed(1) + "%" : "--";
          return (
            <span key={s.name} className="flex items-baseline gap-1">
              <span className="inline-block w-3 h-3 rounded-sm shrink-0 self-center" style={{ background: colorFor(si) }} />
              <span className="text-gray-700 dark:text-slate-200">{s.name}:</span>
              <span className="tabular-nums font-semibold text-gray-900 dark:text-slate-100">{abs}</span>
              <span className="tabular-nums text-gray-500 dark:text-slate-400">({pct})</span>
            </span>
          );
        })}
      </div>
      {latestIdx >= 0 && (
        <div className="text-[9px] text-gray-400 dark:text-slate-500 italic mt-1">
          Latest: {endDates && endDates[latestIdx] ? "FY " + years[latestIdx] + " (" + endDates[latestIdx] + ")" : years[latestIdx]} · Total {fmtMoney(latestTotal, ccy)}
        </div>
      )}
    </div>
  );
}

/* ============================ Section 2 ================================ */

function MarginLadder({ years, segments, totalMargin, totalRoa }) {
  /* Toggle which return metric to plot. EBIT margin = profitability per
     dollar of sales; ROA = profit per dollar of assets. They tell
     different stories so the user can flip between them. */
  const [metric, setMetric] = useState("margin"); /* "margin" | "roa" */
  const seriesKey = metric === "margin" ? "margin" : "roa";
  const totalSeries = metric === "margin" ? totalMargin : totalRoa;
  const W = 600, H = 340, PAD_T = 16, PAD_B = 30, PAD_L = 50, PAD_R = 16;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = years.length;

  /* Y-range covers all segment values for the selected metric (and the
     total if given). Note: `isFinite(null) === true` in JS
     (Number(null) === 0), so we explicitly null-check first. */
  const allVals = [];
  segments.forEach(function (s) { s[seriesKey].forEach(function (v) { if (v !== null && v !== undefined && isFinite(v)) allVals.push(v); }); });
  (totalSeries || []).forEach(function (v) { if (v !== null && v !== undefined && isFinite(v)) allVals.push(v); });
  if (allVals.length === 0) {
    return (
      <div className={TILE}>
        <div className="flex items-baseline gap-2 mb-1">
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Profitability Ladder</div>
        </div>
        <div className="text-xs text-gray-400 dark:text-slate-500 italic py-6 text-center">
          No {metric === "margin" ? "margin" : "ROA"} data
        </div>
      </div>
    );
  }
  const vMax = Math.max.apply(null, allVals);
  const vMin = Math.min.apply(null, allVals);
  const pad = (vMax - vMin) * 0.1 || 0.01;
  const yMin = vMin - pad;
  const yMax = vMax + pad;

  function xOf(i) { return n <= 1 ? PAD_L + innerW / 2 : PAD_L + (i / (n - 1)) * innerW; }
  function yOf(v) { return PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH; }

  return (
    <div className={TILE}>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Profitability Ladder</div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400">
          {metric === "margin" ? "Operating margin per segment" : "Return on Assets per segment"}
        </div>
        <div className="ml-auto flex gap-1 text-[11px]">
          <button
            onClick={function () { setMetric("margin"); }}
            className={"px-2 py-0.5 rounded-full border " + (metric === "margin" ? "bg-blue-700 text-white border-blue-700" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-700 dark:text-slate-300")}
          >Margin</button>
          <button
            onClick={function () { setMetric("roa"); }}
            className={"px-2 py-0.5 rounded-full border " + (metric === "roa" ? "bg-blue-700 text-white border-blue-700" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-700 dark:text-slate-300")}
          >ROA</button>
        </div>
      </div>
      <svg width="100%" height={H} viewBox={"0 0 " + W + " " + H} role="img" aria-label="Segment margins">
        <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="none" stroke={GRID_COLOR} />
        {niceTicks(yMin, yMax, 5).map(function (t, i) {
          const y = yOf(t);
          return (
            <g key={"t-" + i}>
              <line x1={PAD_L} y1={y} x2={PAD_L + innerW} y2={y} stroke={TICK_COLOR} />
              <text x={PAD_L - 6} y={y + 3} fontSize="9" textAnchor="end" fill="#64748b">{(t * 100).toFixed(0) + "%"}</text>
            </g>
          );
        })}
        {/* Lines per segment. Strict null check — isFinite(null) === true
           because Number(null) === 0, which would draw the line down to 0%
           when a segment is discontinued instead of just stopping it. */}
        {segments.map(function (s, si) {
          const segs = [];
          let cur = null;
          const arr = s[seriesKey];
          for (let i = 0; i < n; i++) {
            const v = arr[i];
            if (v === null || v === undefined || !isFinite(v)) {
              if (cur) { segs.push(cur); cur = null; }
              continue;
            }
            const pt = [xOf(i), yOf(v)];
            if (!cur) cur = { pts: [pt] };
            else cur.pts.push(pt);
          }
          if (cur) segs.push(cur);
          return segs.map(function (sg, idx) {
            const d = sg.pts.map(function (p, j) { return (j === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
            return <path key={si + "-" + idx} d={d} fill="none" stroke={colorFor(si)} strokeWidth="1.75" />;
          });
        })}
        {/* Total line — drawn last so it sits on top, thicker + black so
           it's clearly distinguished from individual segment lines. */}
        {totalSeries && (function () {
          const segs = [];
          let cur = null;
          for (let i = 0; i < n; i++) {
            const v = totalSeries[i];
            if (v === null || v === undefined || !isFinite(v)) {
              if (cur) { segs.push(cur); cur = null; }
              continue;
            }
            const pt = [xOf(i), yOf(v)];
            if (!cur) cur = { pts: [pt] };
            else cur.pts.push(pt);
          }
          if (cur) segs.push(cur);
          return segs.map(function (sg, idx) {
            const d = sg.pts.map(function (p, j) { return (j === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
            return <path key={"total-" + idx} d={d} fill="none" stroke="#0f172a" strokeWidth="2.25" />;
          });
        })()}
        {/* X labels */}
        {years.map(function (yr, i) {
          const step = n > 10 ? 2 : 1;
          if (i % step !== 0 && i !== n - 1) return null;
          return <text key={i} x={xOf(i)} y={H - 12} fontSize="9" textAnchor="middle" fill="#64748b">{String(yr).slice(2)}</text>;
        })}
      </svg>
      {/* Legend with last value per segment + total — values reflect
          whichever metric (Margin or ROA) is currently selected. */}
      <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-gray-600 dark:text-slate-300">
        {segments.map(function (s, si) {
          const last = lastFinite(s[seriesKey]);
          return (
            <span key={s.name} className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ background: colorFor(si) }} />
              {s.name}: <span className="tabular-nums font-semibold" style={{ color: colorFor(si) }}>{last !== null ? fmtPct(last, 1) : "--"}</span>
            </span>
          );
        })}
        {totalSeries && (function () {
          const last = lastFinite(totalSeries);
          if (last === null) return null;
          return (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3" style={{ height: "2px", background: "#0f172a" }} />
              <span className="font-semibold">Total:</span> <span className="tabular-nums font-bold" style={{ color: "#0f172a" }}>{fmtPct(last, 1)}</span>
            </span>
          );
        })()}
      </div>
    </div>
  );
}

/* ============================ Section 3 ================================ */

/* Aggregate "Total" card — same layout as a SegmentCard but pulls
 * its values from per-year totals (sales / ebit / margin) computed by
 * the parent. Always shown first in the segment grid. */
function TotalCard({ years, totalSales, totalEbit, totalMargin, ccy, parsedTotal }) {
  const [chartOpen, setChartOpen] = useState(null);
  const lastSales = lastFinite(totalSales);
  const lastEbit  = lastFinite(totalEbit);
  const lastMgn   = lastFinite(totalMargin);
  const lastRoa   = parsedTotal ? lastFinite(parsedTotal.roa) : null;

  function chartFor(kind) {
    if (kind === "sales")  return { values: totalSales,  fmt: function (v) { return fmtMoney(v, ccy); } };
    if (kind === "ebit")   return { values: totalEbit,   fmt: function (v) { return fmtMoney(v, ccy); } };
    if (kind === "margin") return { values: totalMargin, fmt: function (v) { return fmtPct(v, 1); } };
    if (kind === "roa")    return { values: parsedTotal && parsedTotal.roa, fmt: function (v) { return fmtPct(v, 1); } };
    return null;
  }
  function toggle(kind) { setChartOpen(function (prev) { return prev === kind ? null : kind; }); }

  return (
    <div className={TILE + " border-2 border-slate-900 dark:border-slate-100"}>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#0f172a" }} />
        <span className="text-sm font-bold text-gray-900 dark:text-slate-100">Total</span>
        <span className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 ml-1">all segments</span>
      </div>
      <div className="grid grid-cols-2 gap-1 text-[11px]">
        <KpiRow label="Sales"  value={fmtMoney(lastSales, ccy)} sub="100%"
          active={chartOpen === "sales"}  onClick={function () { toggle("sales"); }} />
        <KpiRow label="EBIT"   value={fmtMoney(lastEbit, ccy)} sub="100%"
          active={chartOpen === "ebit"}   onClick={function () { toggle("ebit"); }} />
        <KpiRow label="Margin" value={lastMgn !== null ? fmtPct(lastMgn, 1) : "--"}
          active={chartOpen === "margin"} onClick={function () { toggle("margin"); }} />
        <KpiRow label="ROA" value={lastRoa !== null ? fmtPct(lastRoa, 1) : "--"}
          active={chartOpen === "roa"}  onClick={function () { toggle("roa"); }} />
      </div>
      {chartOpen && chartFor(chartOpen) && chartFor(chartOpen).values && (
        <div className="mt-2 border-t border-slate-100 dark:border-slate-800 pt-2">
          <SegmentMiniChart
            years={years}
            values={chartFor(chartOpen).values}
            color="#0f172a"
            formatY={chartFor(chartOpen).fmt}
            kind={chartOpen}
          />
        </div>
      )}
    </div>
  );
}

function SegmentCard({ segment, years, color, ccy, totalSales, totalEbit }) {
  const [chartOpen, setChartOpen] = useState(null); /* null | "sales" | "ebit" | "margin" | "roa" */
  const lastSalesIdx = lastFiniteIndex(segment.sales);
  const lastEbitIdx  = lastFiniteIndex(segment.ebit);
  const lastSales = lastFinite(segment.sales);
  const lastEbit  = lastFinite(segment.ebit);
  const lastMgn   = lastFinite(segment.margin);
  const lastRoa   = lastFinite(segment.roa);

  /* % of total per KPI — total comes from the sum across operating
     segments at the same year index, computed by the parent. */
  function pctOf(value, idx, totals) {
    if (value === null || !isFinite(value) || !totals || idx < 0) return null;
    const t = totals[idx];
    return (t && isFinite(t) && t !== 0) ? value / t : null;
  }
  const salesPct = pctOf(lastSales, lastSalesIdx, totalSales);
  const ebitPct  = pctOf(lastEbit,  lastEbitIdx,  totalEbit);

  function chartFor(kind) {
    if (kind === "sales")  return { values: segment.sales,  fmt: function (v) { return fmtMoney(v, ccy); } };
    if (kind === "ebit")   return { values: segment.ebit,   fmt: function (v) { return fmtMoney(v, ccy); } };
    if (kind === "margin") return { values: segment.margin, fmt: function (v) { return fmtPct(v, 1); } };
    if (kind === "roa")    return { values: segment.roa,    fmt: function (v) { return fmtPct(v, 1); } };
    return null;
  }

  function toggle(kind) { setChartOpen(function (prev) { return prev === kind ? null : kind; }); }

  return (
    <div className={TILE}>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{segment.name}</span>
        {segment.isCostCenter && (
          <span className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 ml-1">cost center</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1 text-[11px]">
        {!segment.isCostCenter && (
          <KpiRow label="Sales" value={fmtMoney(lastSales, ccy)} sub={salesPct !== null ? fmtPct(salesPct, 1) + " of total" : null}
            active={chartOpen === "sales"}  onClick={function () { toggle("sales"); }} />
        )}
        <KpiRow label="EBIT" value={fmtMoney(lastEbit, ccy)} sub={ebitPct !== null ? fmtPct(ebitPct, 1) + " of total" : null}
          active={chartOpen === "ebit"} onClick={function () { toggle("ebit"); }} />
        {!segment.isCostCenter && (
          <KpiRow label="Margin" value={lastMgn !== null ? fmtPct(lastMgn, 1) : "--"} active={chartOpen === "margin"} onClick={function () { toggle("margin"); }} />
        )}
        {!segment.isCostCenter && (
          <KpiRow label="ROA"    value={lastRoa !== null ? fmtPct(lastRoa, 1) : "--"} active={chartOpen === "roa"}    onClick={function () { toggle("roa"); }} />
        )}
      </div>

      {chartOpen && chartFor(chartOpen) && (
        <div className="mt-2 border-t border-slate-100 dark:border-slate-800 pt-2">
          <SegmentMiniChart
            years={years}
            values={chartFor(chartOpen).values}
            color={color}
            formatY={chartFor(chartOpen).fmt}
            kind={chartOpen}
          />
        </div>
      )}
    </div>
  );
}

function KpiRow({ label, value, sub, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={"flex flex-col px-2 py-1 rounded text-left transition-colors " +
        (active ? "bg-blue-50 dark:bg-blue-950/40 text-gray-900 dark:text-slate-100" : "hover:bg-slate-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300")}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</span>
        <span className="tabular-nums font-semibold">{value}</span>
      </div>
      {sub && (
        <div className="text-[9px] text-gray-500 dark:text-slate-400 text-right">{sub}</div>
      )}
    </button>
  );
}

function SegmentMiniChart({ years, values, color, formatY, kind }) {
  const finite = values.filter(function (v) { return v !== null && isFinite(v); });
  if (finite.length < 2) {
    return <div className="text-[10px] text-gray-400 dark:text-slate-500 italic py-2 text-center">Not enough data</div>;
  }
  const W = 320, H = 90, PAD_T = 8, PAD_B = 18, PAD_L = 36, PAD_R = 8;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = years.length;
  const vMin = Math.min.apply(null, finite);
  const vMax = Math.max.apply(null, finite);
  const pad = (vMax - vMin) * 0.1 || Math.max(0.01, Math.abs(vMax) * 0.1);
  const yMin = vMin - pad;
  const yMax = vMax + pad;

  function xOf(i) { return n <= 1 ? PAD_L + innerW / 2 : PAD_L + (i / (n - 1)) * innerW; }
  function yOf(v) { return PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH; }

  const segs = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null || v === undefined || !isFinite(v)) { if (cur) { segs.push(cur); cur = null; } continue; }
    const pt = [xOf(i), yOf(v)];
    if (!cur) cur = { pts: [pt] };
    else cur.pts.push(pt);
  }
  if (cur) segs.push(cur);

  const ticks = niceTicks(yMin, yMax, 3);

  return (
    <svg width="100%" height={H} viewBox={"0 0 " + W + " " + H} role="img">
      <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="none" stroke={GRID_COLOR} />
      {ticks.map(function (t, i) {
        const y = yOf(t);
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={PAD_L + innerW} y2={y} stroke={TICK_COLOR} />
            <text x={PAD_L - 4} y={y + 3} fontSize="8" textAnchor="end" fill="#64748b">{formatY(t)}</text>
          </g>
        );
      })}
      {segs.map(function (s, idx) {
        const d = s.pts.map(function (p, j) { return (j === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
        return (
          <g key={idx}>
            <path d={d} fill="none" stroke={color} strokeWidth="1.75" />
            {s.pts.map(function (p, j) { return <circle key={j} cx={p[0]} cy={p[1]} r="2" fill={color} />; })}
          </g>
        );
      })}
      {years.map(function (yr, i) {
        const step = n > 8 ? 3 : (n > 5 ? 2 : 1);
        if (i % step !== 0 && i !== n - 1) return null;
        return <text key={i} x={xOf(i)} y={H - 6} fontSize="8" textAnchor="middle" fill="#64748b">{String(yr).slice(2)}</text>;
      })}
    </svg>
  );
}

/* ============================ Section 4 ================================ */

function GeographyMix({ years, geography }) {
  const W = 760, H = 240, PAD_T = 10, PAD_B = 28, PAD_L = 36, PAD_R = 10;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = years.length;

  /* Companies report mutually-exclusive geographic buckets per ASC 280 /
     IFRS 8. So the HQ country (e.g. France for Schneider) is a peer of
     the other regions, not a subset — keep it in the stack so the
     bands sum to ~100%. */
  const ranked = geography.regions.slice().sort(function (a, b) {
    return (lastFinite(b.values) || 0) - (lastFinite(a.values) || 0);
  });

  function xOf(i) { return n <= 1 ? PAD_L + innerW / 2 : PAD_L + (i / (n - 1)) * innerW; }
  function yOf(v) { return PAD_T + (1 - v) * innerH; }

  /* Build cumulative areas. For each year, we sum regions in rank order
     to get the y stacking. */
  const cumByYear = years.map(function () { return new Array(ranked.length + 1).fill(0); });
  ranked.forEach(function (r, ri) {
    for (let i = 0; i < n; i++) {
      const v = r.values[i];
      cumByYear[i][ri + 1] = cumByYear[i][ri] + (isFinite(v) ? v : 0);
    }
  });

  function areaPath(ri) {
    const top = [];
    const bot = [];
    for (let i = 0; i < n; i++) {
      top.push([xOf(i), yOf(cumByYear[i][ri + 1])]);
      bot.push([xOf(i), yOf(cumByYear[i][ri])]);
    }
    const d = "M" + top.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" L")
            + " L" + bot.reverse().map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" L")
            + " Z";
    return d;
  }

  return (
    <div className={TILE}>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Geographic Mix</div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400">Revenue share by region over time</div>
      </div>
      <svg width="100%" height={H} viewBox={"0 0 " + W + " " + H} role="img">
        <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="none" stroke={GRID_COLOR} />
        {[0, 0.25, 0.5, 0.75, 1].map(function (t, i) {
          const y = yOf(t);
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={PAD_L + innerW} y2={y} stroke={TICK_COLOR} />
              <text x={PAD_L - 4} y={y + 3} fontSize="9" textAnchor="end" fill="#64748b">{(t * 100).toFixed(0) + "%"}</text>
            </g>
          );
        })}
        {ranked.map(function (r, ri) {
          return <path key={r.name} d={areaPath(ri)} fill={colorFor(ri)} fillOpacity="0.85"><title>{r.name}</title></path>;
        })}
        {years.map(function (yr, i) {
          const step = n > 10 ? 2 : 1;
          if (i % step !== 0 && i !== n - 1) return null;
          return <text key={i} x={xOf(i)} y={H - 10} fontSize="9" textAnchor="middle" fill="#64748b">{String(yr).slice(2)}</text>;
        })}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-gray-600 dark:text-slate-300">
        {ranked.map(function (r, ri) {
          return (
            <span key={r.name} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: colorFor(ri) }} />
              {r.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* Compact tile showing the company's home country share — both the
 * latest value and a sparkline of how it has trended. Pulled out from
 * the stacked area chart since it's typically a subset of its parent
 * region (e.g. France inside Western Europe) and double-counts there. */
/* Standardized geography tile — region rows with click-to-expand
 * country detail. Same buckets across companies, so this is the view
 * to use for portfolio-weighted regional aggregation. Bars at left;
 * latest value + 5Y delta at right. Region rows are bold; expanded
 * country rows are indented and lighter. */
function StandardizedGeography({ years, stdGeo, endDates }) {
  const [expanded, setExpanded] = useState(function () { return new Set(); });

  /* Latest year across regions (may differ from FactSet revenue's last
     year if user's standardized section was added later than the
     FactSet section). */
  let lastIdx = -1;
  stdGeo.regions.forEach(function (r) {
    const i = lastFiniteIndex(r.values || []);
    if (i > lastIdx) lastIdx = i;
  });
  const refIdx = lastIdx > 0 ? Math.max(0, lastIdx - 5) : 0;

  /* Sum of region shares for latest year — useful sanity check (should
     be ~100% for clean reporting; some companies have incomplete data). */
  let sum = 0;
  stdGeo.regions.forEach(function (r) {
    const v = lastIdx >= 0 ? r.values[lastIdx] : null;
    if (v !== null && v !== undefined && isFinite(v)) sum += v;
  });

  function toggle(name) {
    setExpanded(function (prev) {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className={TILE}>
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Standardized Geography</div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400">
          Canonical regions for portfolio-weighted comparison · {yearLabel(years, endDates, lastIdx)}
        </div>
        {sum > 0 && (
          <div className="ml-auto text-[10px] text-gray-400 dark:text-slate-500 italic">
            Σ regions = <span className="tabular-nums font-semibold text-gray-700 dark:text-slate-300">{(sum * 100).toFixed(1) + "%"}</span>
            {sum < 0.99 && <span className="ml-1 text-amber-600 dark:text-amber-400">(incomplete)</span>}
          </div>
        )}
      </div>

      {/* Header for the rows */}
      <div className="grid gap-2 px-1 pb-1 border-b border-slate-200 dark:border-slate-700 text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500"
        style={{ gridTemplateColumns: "minmax(140px, 1.5fr) 2fr 70px 60px" }}>
        <div>Region</div>
        <div></div>
        <div className="text-right">{yearLabel(years, endDates, lastIdx)}</div>
        <div className="text-right">vs {yearLabel(years, endDates, refIdx)}</div>
      </div>

      {/* Region rows + expandable countries. Bar widths scale to 100%
         (the conceptual whole) so visual size compares directly across
         regions. */}
      <div className="space-y-0.5 mt-1">
        {stdGeo.regions.map(function (r, ri) {
          const cur = lastIdx >= 0 ? r.values[lastIdx] : null;
          const ref = refIdx >= 0 ? r.values[refIdx] : null;
          const curOk = cur !== null && cur !== undefined && isFinite(cur);
          const refOk = ref !== null && ref !== undefined && isFinite(ref);
          const delta = curOk && refOk ? cur - ref : null;
          const dColor = delta === null ? "#94a3b8" : delta >= 0.005 ? "#16a34a" : delta <= -0.005 ? "#dc2626" : "#94a3b8";
          const isOpen = expanded.has(r.name);
          const hasCountries = r.countries && r.countries.length > 0;
          const w = curOk ? cur * 100 : 0;
          return (
            <div key={r.name}>
              <div className={"grid gap-2 px-1 py-1 text-[11px] items-center rounded " +
                  (hasCountries ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800" : "")}
                style={{ gridTemplateColumns: "minmax(140px, 1.5fr) 2fr 70px 60px" }}
                onClick={hasCountries ? function () { toggle(r.name); } : undefined}>
                <span className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-1">
                  {hasCountries && (
                    <span className="inline-block w-3 text-gray-400 dark:text-slate-500">{isOpen ? "▾" : "▸"}</span>
                  )}
                  {!hasCountries && <span className="inline-block w-3" />}
                  <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: colorFor(ri) }} />
                  {r.name}
                </span>
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 rounded" style={{ width: w + "%", background: colorFor(ri), opacity: 0.85 }} />
                </div>
                <span className="tabular-nums font-semibold text-right text-gray-900 dark:text-slate-100">
                  {curOk ? (cur * 100).toFixed(1) + "%" : "--"}
                </span>
                <span className="tabular-nums text-right text-[10px]" style={{ color: dColor }}>
                  {delta !== null ? (delta >= 0 ? "+" : "") + (delta * 100).toFixed(1) + "pp" : ""}
                </span>
              </div>
              {isOpen && hasCountries && (
                <div className="ml-6 space-y-0.5 mb-1">
                  {r.countries.map(function (c) {
                    const ccur = lastIdx >= 0 ? c.values[lastIdx] : null;
                    const cref = refIdx >= 0 ? c.values[refIdx] : null;
                    const ccurOk = ccur !== null && ccur !== undefined && isFinite(ccur);
                    const crefOk = cref !== null && cref !== undefined && isFinite(cref);
                    const cdelta = ccurOk && crefOk ? ccur - cref : null;
                    const cdColor = cdelta === null ? "#94a3b8" : cdelta >= 0.0025 ? "#16a34a" : cdelta <= -0.0025 ? "#dc2626" : "#94a3b8";
                    /* Country bars use the region's color at lower opacity */
                    const cw = ccurOk ? ccur * 100 : 0;
                    return (
                      <div key={c.name} className="grid gap-2 px-1 py-0.5 text-[10px] items-center"
                        style={{ gridTemplateColumns: "minmax(140px, 1.5fr) 2fr 70px 60px" }}>
                        <span className="text-gray-600 dark:text-slate-400 pl-3">{c.name}</span>
                        <div className="h-2 bg-slate-50 dark:bg-slate-900 rounded relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 rounded" style={{ width: cw + "%", background: colorFor(ri), opacity: 0.5 }} />
                        </div>
                        <span className="tabular-nums text-right text-gray-700 dark:text-slate-300">
                          {ccurOk ? (ccur * 100).toFixed(1) + "%" : "--"}
                        </span>
                        <span className="tabular-nums text-right" style={{ color: cdColor }}>
                          {cdelta !== null ? (cdelta >= 0 ? "+" : "") + (cdelta * 100).toFixed(1) + "pp" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Pick the best year-label for column index `i`: the actual end date
 * (e.g. "Mar 2025") if endDates is populated, else the bare year. */
function yearLabel(years, endDates, i) {
  if (i < 0 || i >= years.length) return "";
  if (endDates && endDates[i]) return endDates[i];
  return String(years[i]);
}

function HomeMarketTile({ years, geography, endDates, hqCountry }) {
  const hqLower = (hqCountry || "").toLowerCase().trim();
  const region = hqLower ? geography.regions.find(function (r) { return (r.name || "").toLowerCase().trim() === hqLower; }) : null;
  if (!region) {
    return (
      <div className={TILE}>
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Home Market</div>
        <div className="text-[11px] text-gray-400 dark:text-slate-500 italic">
          {hqCountry ? "No '" + hqCountry + "' line in geography paste." : "Country not set on company."}
        </div>
      </div>
    );
  }
  const lastIdx = lastFiniteIndex(region.values);
  const refIdx = lastIdx > 0 ? Math.max(0, lastIdx - 5) : 0;
  const cur = lastIdx >= 0 ? region.values[lastIdx] : null;
  const ref = refIdx >= 0 ? region.values[refIdx] : null;
  const delta = (cur !== null && ref !== null && isFinite(cur) && isFinite(ref)) ? cur - ref : null;
  const dColor = delta === null ? "#94a3b8" : delta >= 0.005 ? "#16a34a" : delta <= -0.005 ? "#dc2626" : "#94a3b8";

  return (
    <div className={TILE}>
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Home Market</div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400">{region.name}</div>
      </div>
      <div className="flex items-baseline gap-3">
        <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-slate-100">
          {cur !== null ? (cur * 100).toFixed(1) + "%" : "--"}
        </div>
        {delta !== null && (
          <div className="text-[11px] tabular-nums" style={{ color: dColor }}>
            {(delta >= 0 ? "+" : "") + (delta * 100).toFixed(1) + "pp"}
            <span className="text-[9px] text-gray-400 dark:text-slate-500 ml-1 italic">
              vs {yearLabel(years, endDates, refIdx)}
            </span>
          </div>
        )}
      </div>
      <div className="text-[9px] text-gray-400 dark:text-slate-500 italic mt-0.5">
        of total revenue · {yearLabel(years, endDates, lastIdx)}
      </div>
    </div>
  );
}

function GeographySnapshot({ years, geography, endDates }) {
  /* Latest year, sorted by size desc, with 5Y delta. We use the latest
     year for which ANY region has a value (not just the revenue total)
     so a region that started reporting recently (e.g. Hitachi's
     "Other Regions" appearing in 2022+) still shows up at its current
     share, even if the revenue total is computed from earlier years. */
  let lastIdx = lastFiniteIndex(geography.revenue || []);
  /* Fallback / extension: walk forward across all regions to find the
     true latest year any region has data. */
  geography.regions.forEach(function (r) {
    const idx = lastFiniteIndex(r.values || []);
    if (idx > lastIdx) lastIdx = idx;
  });
  const refIdx = lastIdx > 0 ? Math.max(0, lastIdx - 5) : 0;

  /* Show every parsed region (don't filter on null cur) — if a region
     was reported but doesn't have a value for the latest year, render
     it with "--" so the user can still see it was parsed. Sort by cur
     desc, with null cur regions last. */
  const ranked = geography.regions.slice().map(function (r) {
    const cur = lastIdx >= 0 ? r.values[lastIdx] : null;
    const ref = refIdx >= 0 ? r.values[refIdx] : null;
    const curIsFinite = cur !== null && cur !== undefined && isFinite(cur);
    return {
      name: r.name,
      cur: curIsFinite ? cur : null,
      ref: ref,
      delta: (curIsFinite && ref !== null && ref !== undefined && isFinite(ref)) ? cur - ref : null,
    };
  });
  ranked.sort(function (a, b) {
    const av = a.cur === null ? -Infinity : a.cur;
    const bv = b.cur === null ? -Infinity : b.cur;
    return bv - av;
  });

  const finiteMax = ranked.reduce(function (m, r) { return r.cur !== null && r.cur > m ? r.cur : m; }, 0);
  const max = finiteMax > 0 ? finiteMax : 1;

  return (
    <div className={TILE}>
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Latest Snapshot</div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400">{yearLabel(years, endDates, lastIdx)}</div>
        {ranked.length > 0 && refIdx >= 0 && (
          <div className="ml-auto text-[10px] text-gray-400 dark:text-slate-500 italic">
            Δ vs {yearLabel(years, endDates, refIdx)}
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {ranked.map(function (r, ri) {
          const w = r.cur !== null ? (r.cur / max) * 100 : 0;
          const dColor = r.delta === null ? "#94a3b8" : r.delta >= 0.005 ? "#16a34a" : r.delta <= -0.005 ? "#dc2626" : "#94a3b8";
          return (
            <div key={r.name} className="flex items-center gap-2 text-[11px]">
              <span className="w-32 truncate text-gray-700 dark:text-slate-300">{r.name}</span>
              <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 rounded" style={{ width: w + "%", background: colorFor(ri), opacity: 0.85 }} />
              </div>
              <span className="tabular-nums font-semibold w-14 text-right text-gray-900 dark:text-slate-100">
                {r.cur !== null ? (r.cur * 100).toFixed(1) + "%" : "--"}
              </span>
              <span className="tabular-nums w-12 text-right text-[10px]" style={{ color: dColor }}>
                {r.delta !== null ? (r.delta >= 0 ? "+" : "") + (r.delta * 100).toFixed(1) + "pp" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
