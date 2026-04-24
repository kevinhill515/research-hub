/* Ratio Analysis tab on the Company Detail page.
 *
 * Displays a wide grid of ratios × years from FactSet's Ratio Analysis
 * output. Users upload one company at a time via a paste box (replaces
 * the company's stored ratios entirely on re-upload). Click any ratio
 * row to expand an inline line chart beneath it; click again to
 * collapse; click a different ratio to switch.
 *
 * Estimate columns (from the "Estimate" tokens in the paste) get a
 * subtle tinted background. The chart colors historical vs estimate
 * segments differently too.
 *
 * Data shape on the company (see ratioParser.js for the full schema):
 *   selCo.ratios = {
 *     years: [2016, ..., 2028],
 *     estimate: [false, ..., true, true, true],
 *     sections: [ { name, items: [ { name, values: [...] } ] } ],
 *     ratioNames: [...],  // flat ordered list
 *     values: { [ratioName]: [...] },
 *   }
 */

import { useState, useRef, useEffect } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { useConfirm } from '../ui/DialogProvider.jsx';
import RatioLineChart from '../ui/RatioLineChart.jsx';

const BTN_SM = "text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const LABEL_W    = 210;  /* px — ratio name column */
const YEAR_W     = 64;   /* px — each year column */
const EST_BG     = "rgba(234,88,12,0.05)";   /* orange-600 @ 5% */
const EST_BG_DK  = "rgba(234,88,12,0.12)";

function fmtCell(v) {
  if (v === null || v === undefined || !isFinite(v)) return "";
  const a = Math.abs(v);
  if (a >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (a >= 100)   return v.toFixed(1);
  if (a >= 10)    return v.toFixed(2);
  return v.toFixed(2);
}

export default function RatiosTab({ company }) {
  const { setCompanies } = useCompanyContext();
  const confirm = useConfirm();
  const [openRatio, setOpenRatio] = useState(null);
  const containerRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(800);

  const ratios = company && company.ratios ? company.ratios : null;
  const hasData = !!(ratios && ratios.years && ratios.years.length > 0);

  /* Toggle a ratio open/closed. */
  function toggleRatio(name) {
    setOpenRatio(function (prev) { return prev === name ? null : name; });
  }

  /* Width of the data (year) columns combined — chart aligns to that.
     Recomputed on mount, window resize, and data change. */
  useEffect(function () {
    function compute() {
      if (!containerRef.current) return;
      const yearCount = hasData ? ratios.years.length : 0;
      /* Chart sits below the ratio row, spanning only the year columns. */
      setChartWidth(Math.max(400, yearCount * YEAR_W));
    }
    compute();
    window.addEventListener("resize", compute);
    return function () { window.removeEventListener("resize", compute); };
  }, [hasData, ratios]);

  function clearRatios() {
    confirm("Clear all ratio data for " + (company.name || "this company") + "? You'll need to re-paste to restore it.").then(function (ok) {
      if (!ok) return;
      const updated = Object.assign({}, company);
      delete updated.ratios;
      setCompanies(function (cs) {
        return cs.map(function (c) { return c.id === updated.id ? updated : c; });
      });
      setOpenRatio(null);
    });
  }

  /* ---- Empty state: point user to Data Hub ---- */
  if (!hasData) {
    return (
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Ratio Analysis</div>
        <div className="text-sm text-gray-500 dark:text-slate-400 py-6 italic">
          No ratio data yet. Upload via <b>Data Hub → Ratio Analysis</b> — paste one company's FactSet Ratio Analysis block (with the company name on row 1) and it auto-matches to this company by name.
        </div>
      </div>
    );
  }

  /* ---- Data view ---- */
  const gridCols = LABEL_W + "px repeat(" + ratios.years.length + ", " + YEAR_W + "px)";
  const nYears = ratios.years.length;

  return (
    <div className="mb-6" ref={containerRef}>
      {/* Header + actions */}
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">Ratio Analysis</div>
        {ratios.updatedAt && (
          <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">
            Last updated {new Date(ratios.updatedAt).toLocaleDateString()}
          </span>
        )}
        <div className="ml-auto flex gap-2 items-center">
          <span className="text-[11px] text-gray-400 dark:text-slate-500 italic">
            Refresh via Data Hub → Ratio Analysis
          </span>
          <button onClick={clearRatios} className={BTN_SM}>Clear</button>
        </div>
      </div>

      {/* Scroll container — grid is wide; let horizontal scroll handle overflow */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <div style={{ display: "grid", gridTemplateColumns: gridCols, minWidth: "fit-content" }}>
          {/* Year header row */}
          <div className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold sticky left-0 z-10">
            {/* empty corner */}
          </div>
          {ratios.years.map(function (yr, i) {
            const est = ratios.estimate[i];
            return (
              <div
                key={"yr-" + i}
                className="px-1.5 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] text-center font-semibold"
                style={{ color: est ? "#ea580c" : "#64748b", background: est ? EST_BG : undefined }}
                title={est ? "Estimate" : "Final"}
              >
                {"Dec-" + String(yr).slice(2)}
              </div>
            );
          })}
          {/* Estimate-flag row */}
          <div className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 sticky left-0 z-10">
            {/* empty corner */}
          </div>
          {ratios.years.map(function (_, i) {
            const est = ratios.estimate[i];
            return (
              <div
                key={"est-" + i}
                className="px-1.5 py-1 border-b border-slate-200 dark:border-slate-700 text-[9px] text-center italic"
                style={{
                  color: est ? "#ea580c" : "#94a3b8",
                  background: est ? EST_BG : undefined,
                }}
              >
                {est ? "Estimate" : "Final"}
              </div>
            );
          })}

          {/* Sections + ratios */}
          {ratios.sections.map(function (sec) {
            return (
              <SectionRows
                key={sec.name}
                section={sec}
                years={ratios.years}
                estimate={ratios.estimate}
                openRatio={openRatio}
                onToggle={toggleRatio}
                chartWidth={chartWidth}
                nYears={nYears}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-2 text-[10px] text-gray-500 dark:text-slate-400 flex-wrap items-center">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5" style={{ background: "#2563eb" }} />
          Historical
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5" style={{ background: "#ea580c" }} />
          Estimate
        </span>
        <span className="italic">Click any ratio to open its chart; click again to close.</span>
      </div>
    </div>
  );
}

/* Renders one section: a full-width header row, then one row per ratio.
 * When a ratio is selected, its chart row is injected directly beneath it. */
function SectionRows({ section, years, estimate, openRatio, onToggle, chartWidth, nYears }) {
  return (
    <>
      {/* Section header — spans all columns */}
      <div
        className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-slate-200 bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700"
        style={{ gridColumn: "1 / -1" }}
      >
        {section.name}
      </div>

      {section.items.map(function (item) {
        const isOpen = openRatio === item.name;
        return (
          <RatioRow
            key={item.name}
            item={item}
            years={years}
            estimate={estimate}
            isOpen={isOpen}
            onToggle={onToggle}
            chartWidth={chartWidth}
            nYears={nYears}
          />
        );
      })}
    </>
  );
}

function RatioRow({ item, years, estimate, isOpen, onToggle, chartWidth, nYears }) {
  const cellBase = "px-1.5 py-1 text-[11px] text-right tabular-nums border-b border-slate-100 dark:border-slate-800";
  const labelCls = "px-2 py-1 text-[11px] font-medium text-gray-900 dark:text-slate-100 cursor-pointer border-b border-slate-100 dark:border-slate-800 sticky left-0 z-[1] bg-white dark:bg-slate-950 hover:bg-blue-50 dark:hover:bg-blue-950/30 " + (isOpen ? "bg-blue-50 dark:bg-blue-950/40" : "");

  return (
    <>
      <div className={labelCls} onClick={function () { onToggle(item.name); }} title="Click to toggle chart">
        <span className="inline-block w-3 text-gray-400 dark:text-slate-500">{isOpen ? "▾" : "▸"}</span> {item.name}
      </div>
      {years.map(function (_, i) {
        const v = item.values[i];
        const est = estimate[i];
        return (
          <div
            key={i}
            className={cellBase + " text-gray-900 dark:text-slate-100 cursor-pointer " + (isOpen ? "bg-blue-50/60 dark:bg-blue-950/30" : "")}
            style={{ background: !isOpen && est ? EST_BG : undefined, color: est ? "#9a3412" : undefined }}
            onClick={function () { onToggle(item.name); }}
          >
            {v === null || v === undefined || !isFinite(v) ? <span className="text-gray-300 dark:text-slate-600">–</span> : fmtCell(v)}
          </div>
        );
      })}

      {/* Expanded chart row — full width, lives directly under the ratio it belongs to */}
      {isOpen && (
        <div
          className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 overflow-x-auto"
          style={{ gridColumn: "1 / -1" }}
        >
          <div className="flex items-stretch gap-0">
            <div
              className="shrink-0 px-3 py-2 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              style={{ width: LABEL_W, minHeight: 180 }}
            >
              <div className="text-xs font-semibold text-gray-900 dark:text-slate-100 mb-0.5">{item.name}</div>
              <div className="text-[10px] text-gray-500 dark:text-slate-400">
                {item.values.filter(function (v) { return v !== null && isFinite(v); }).length} data points
              </div>
            </div>
            <div className="flex-1 px-2 py-2">
              <RatioLineChart
                years={years}
                values={item.values}
                estimate={estimate}
                width={nYears * YEAR_W - 20}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
