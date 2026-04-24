/* Generic time-series grid + inline chart tab used by both the Ratios
 * and Financials views on the Company Detail page. Identical layout and
 * behavior; the caller picks which company field to read from (e.g.
 * company.ratios or company.financials) and the labels/text shown.
 *
 * Data shape (produced by src/utils/ratioParser.js):
 *   data = {
 *     years:    [2016, ..., 2028],
 *     estimate: [false, ..., true, true, true],
 *     sections: [ { name, items: [ { name, values: [...] } ] } ],
 *     ratioNames: [...],
 *     values:   { [itemName]: [...] },
 *     updatedAt: ISO timestamp,
 *   }
 */

import { useState, useRef, useEffect } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { useConfirm } from '../ui/DialogProvider.jsx';
import RatioLineChart from '../ui/RatioLineChart.jsx';

const BTN_SM = "text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const LABEL_W    = 340;
const YEAR_W     = 64;
const COMMENT_W  = 320;  /* px — team comment column on the right */
const SPARK_W    = 48;
const SPARK_H    = 16;
const HIST_COLOR = "#2563eb";
const EST_COLOR  = "#ea580c";
const EST_BG     = "rgba(234,88,12,0.05)";

/* Tiny trend sparkline in the label column. */
function MiniSpark({ values, estimate }) {
  const n = values.length;
  if (!n) return null;
  const finite = values.filter(function (v) { return v !== null && isFinite(v); });
  if (finite.length < 2) return null;

  const vMin = Math.min.apply(null, finite);
  const vMax = Math.max.apply(null, finite);
  const span = (vMax - vMin) || Math.max(1, Math.abs(vMax));
  const yMin = vMin - span * 0.05;
  const yMax = vMax + span * 0.05;

  function xOf(i) { return (i / (n - 1)) * (SPARK_W - 2) + 1; }
  function yOf(v) { return (1 - (v - yMin) / (yMax - yMin)) * (SPARK_H - 2) + 1; }

  const segments = [];
  let current = null;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null || !isFinite(v)) {
      if (current) { segments.push(current); current = null; }
      continue;
    }
    if (!current) {
      current = { isEstimate: estimate[i], points: [[xOf(i), yOf(v)]] };
    } else if (current.isEstimate === estimate[i]) {
      current.points.push([xOf(i), yOf(v)]);
    } else {
      segments.push(current);
      const last = current.points[current.points.length - 1];
      const newPt = [xOf(i), yOf(v)];
      segments.push({ isBridge: true, points: [last, newPt] });
      current = { isEstimate: estimate[i], points: [newPt] };
    }
  }
  if (current) segments.push(current);

  function toD(pts) {
    return pts.map(function (p, i) { return (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
  }

  return (
    <svg width={SPARK_W} height={SPARK_H} aria-hidden="true" style={{ flexShrink: 0 }}>
      {segments.map(function (s, idx) {
        if (s.isBridge) return <path key={idx} d={toD(s.points)} fill="none" stroke={EST_COLOR} strokeWidth="1" strokeDasharray="2 2" strokeOpacity="0.6" />;
        return <path key={idx} d={toD(s.points)} fill="none" stroke={s.isEstimate ? EST_COLOR : HIST_COLOR} strokeWidth="1.25" />;
      })}
    </svg>
  );
}

function fmtCell(v) {
  if (v === null || v === undefined || !isFinite(v)) return "";
  const a = Math.abs(v);
  if (a >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (a >= 100)   return v.toFixed(1);
  if (a >= 10)    return v.toFixed(2);
  return v.toFixed(2);
}

/* Heuristic: sub-metrics are derived ratios/growth rows that FactSet
 * renders in red italic text beneath the parent line. Can't detect via
 * paste formatting; detect by name pattern. Only affects row style. */
function isSubMetric(name) {
  return /(growth|margin|\bper share\b|% of|% of|as %|ratio|yield|\byears to\b|\beps\b)/i.test(name);
}

/**
 * @param {object} props
 * @param {object} props.company — selected company
 * @param {string} props.dataKey — key on company where data lives ("ratios" | "financials")
 * @param {string} props.title — display title shown at top of tab
 * @param {string} props.dataHubLabel — name of the corresponding Data Hub tab, shown in empty state
 */
export default function TimeSeriesTab({ company, dataKey, title, dataHubLabel }) {
  const { setCompanies, currentUser } = useCompanyContext();
  const confirm = useConfirm();
  const [openItems, setOpenItems] = useState(function () { return new Set(); });
  const containerRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(800);

  const data = company && company[dataKey] ? company[dataKey] : null;
  const hasData = !!(data && data.years && data.years.length > 0);

  function toggle(name) {
    setOpenItems(function (prev) {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  useEffect(function () {
    function compute() {
      if (!containerRef.current) return;
      const yearCount = hasData ? data.years.length : 0;
      setChartWidth(Math.max(400, yearCount * YEAR_W));
    }
    compute();
    window.addEventListener("resize", compute);
    return function () { window.removeEventListener("resize", compute); };
  }, [hasData, data]);

  /* Save a comment for a single item (line item / ratio name). Pass "" to
     delete. Persists onto company[dataKey].comments and updates the
     timestamp + author. */
  function saveComment(itemName, text) {
    const trimmed = (text || "").trim();
    const nextData = Object.assign({}, data);
    const nextComments = Object.assign({}, data.comments || {});
    if (!trimmed) {
      delete nextComments[itemName];
    } else {
      nextComments[itemName] = {
        text: trimmed,
        author: currentUser || "Unknown",
        updatedAt: new Date().toISOString(),
      };
    }
    nextData.comments = nextComments;
    const updated = Object.assign({}, company, { [dataKey]: nextData });
    setCompanies(function (cs) {
      return cs.map(function (c) { return c.id === updated.id ? updated : c; });
    });
  }

  function clearData() {
    confirm("Clear all " + title.toLowerCase() + " data for " + (company.name || "this company") + "? You'll need to re-paste to restore it.").then(function (ok) {
      if (!ok) return;
      const updated = Object.assign({}, company);
      delete updated[dataKey];
      setCompanies(function (cs) {
        return cs.map(function (c) { return c.id === updated.id ? updated : c; });
      });
      setOpenItems(new Set());
    });
  }

  if (!hasData) {
    return (
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">{title}</div>
        <div className="text-sm text-gray-500 dark:text-slate-400 py-6 italic">
          No {title.toLowerCase()} data yet. Upload via <b>Data Hub → {dataHubLabel}</b> — paste one company's block (with the company name on row 1) and it auto-matches to this company by name.
        </div>
      </div>
    );
  }

  const gridCols = LABEL_W + "px repeat(" + data.years.length + ", " + YEAR_W + "px) " + COMMENT_W + "px";
  const nYears = data.years.length;
  const comments = data.comments || {};

  return (
    <div className="mb-6" ref={containerRef}>
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{title}</div>
        {data.updatedAt && (
          <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">
            Last updated {new Date(data.updatedAt).toLocaleDateString()}
          </span>
        )}
        <div className="ml-auto flex gap-2 items-center">
          <span className="text-[11px] text-gray-400 dark:text-slate-500 italic">
            Refresh via Data Hub → {dataHubLabel}
          </span>
          <button onClick={clearData} className={BTN_SM}>Clear</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <div style={{ display: "grid", gridTemplateColumns: gridCols, minWidth: "fit-content" }}>
          {/* Year header */}
          <div className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold sticky left-0 z-10" />
          {data.years.map(function (yr, i) {
            const est = data.estimate[i];
            return (
              <div key={"yr-" + i} className="px-1.5 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] text-center font-semibold"
                style={{ color: est ? "#ea580c" : "#64748b", background: est ? EST_BG : undefined }}
                title={est ? "Estimate" : "Final"}>
                {"Dec-" + String(yr).slice(2)}
              </div>
            );
          })}
          <div className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold">
            Comments
          </div>
          {/* Flag row */}
          <div className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500 sticky left-0 z-10" />
          {data.years.map(function (_, i) {
            const est = data.estimate[i];
            return (
              <div key={"est-" + i} className="px-1.5 py-1 border-b border-slate-200 dark:border-slate-700 text-[9px] text-center italic"
                style={{ color: est ? "#ea580c" : "#94a3b8", background: est ? EST_BG : undefined }}>
                {est ? "Estimate" : "Final"}
              </div>
            );
          })}
          <div className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[9px] italic text-gray-400 dark:text-slate-500">
            click any cell to add/edit
          </div>

          {data.sections.map(function (sec) {
            return (
              <SectionRows
                key={sec.name}
                section={sec}
                years={data.years}
                estimate={data.estimate}
                openItems={openItems}
                onToggle={toggle}
                chartWidth={chartWidth}
                nYears={nYears}
                comments={comments}
                onSaveComment={saveComment}
              />
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 mt-2 text-[10px] text-gray-500 dark:text-slate-400 flex-wrap items-center">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5" style={{ background: HIST_COLOR }} /> Historical
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5" style={{ background: EST_COLOR }} /> Estimate
        </span>
        <span className="italic">Click any row to open its chart; click again to close. Multiple charts can be open at once.</span>
      </div>
    </div>
  );
}

function SectionRows({ section, years, estimate, openItems, onToggle, chartWidth, nYears, comments, onSaveComment }) {
  return (
    <>
      <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-slate-200 bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700"
        style={{ gridColumn: "1 / -1" }}>
        {section.name}
      </div>
      {section.items.map(function (item) {
        const isOpen = openItems.has(item.name);
        return (
          <ItemRow
            key={item.name}
            item={item}
            years={years}
            estimate={estimate}
            isOpen={isOpen}
            onToggle={onToggle}
            chartWidth={chartWidth}
            nYears={nYears}
            comment={comments[item.name]}
            onSaveComment={onSaveComment}
          />
        );
      })}
    </>
  );
}

function ItemRow({ item, years, estimate, isOpen, onToggle, chartWidth, nYears, comment, onSaveComment }) {
  const sub = isSubMetric(item.name);
  const cellBase = "px-1.5 py-1 text-[11px] text-right tabular-nums border-b border-slate-100 dark:border-slate-800";
  const labelCls = "px-2 py-1 text-[11px] cursor-pointer border-b border-slate-100 dark:border-slate-800 sticky left-0 z-[1] bg-white dark:bg-slate-950 hover:bg-blue-50 dark:hover:bg-blue-950/30 "
    + (sub ? "italic text-blue-900 dark:text-blue-300 " : "font-medium text-gray-900 dark:text-slate-100 ")
    + (isOpen ? "bg-blue-50 dark:bg-blue-950/40" : "");

  return (
    <>
      <div className={labelCls} onClick={function () { onToggle(item.name); }} title="Click to toggle chart">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 text-gray-400 dark:text-slate-500 shrink-0">{isOpen ? "▾" : "▸"}</span>
          <MiniSpark values={item.values} estimate={estimate} />
          <span>{item.name}</span>
        </div>
      </div>
      {years.map(function (_, i) {
        const v = item.values[i];
        const est = estimate[i];
        return (
          <div key={i}
            className={cellBase + " cursor-pointer " + (sub ? "italic text-blue-900 dark:text-blue-300 " : "text-gray-900 dark:text-slate-100 ") + (isOpen ? "bg-blue-50/60 dark:bg-blue-950/30" : "")}
            style={{ background: !isOpen && est ? EST_BG : undefined, color: est && !sub ? "#9a3412" : undefined }}
            onClick={function () { onToggle(item.name); }}>
            {v === null || v === undefined || !isFinite(v) ? <span className="text-gray-300 dark:text-slate-600">–</span> : fmtCell(v)}
          </div>
        );
      })}
      <CommentCell itemName={item.name} comment={comment} onSave={onSaveComment} isOpen={isOpen} />

      {isOpen && (
        <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 overflow-x-auto"
          style={{ gridColumn: "1 / -1" }}>
          <div className="flex items-stretch gap-0">
            <div className="shrink-0 px-3 py-2 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              style={{ width: LABEL_W, minHeight: 180 }}>
              <div className="text-xs font-semibold text-gray-900 dark:text-slate-100 mb-0.5">{item.name}</div>
              <div className="text-[10px] text-gray-500 dark:text-slate-400">
                {item.values.filter(function (v) { return v !== null && isFinite(v); }).length} data points
              </div>
            </div>
            <div className="flex-1 px-2 py-2">
              <RatioLineChart years={years} values={item.values} estimate={estimate} width={nYears * YEAR_W - 20} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* Inline-editable comment cell. Starts as read-only view (or placeholder
 * if empty); clicking opens a textarea that saves on blur / Ctrl+Enter
 * and cancels on Esc. Author + relative timestamp rendered below the
 * comment text. */
function CommentCell({ itemName, comment, onSave, isOpen }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const hasComment = !!(comment && comment.text);

  function startEdit(e) {
    e.stopPropagation();
    setDraft(hasComment ? comment.text : "");
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    onSave(itemName, draft);
  }
  function cancel() {
    setEditing(false);
    setDraft("");
  }

  const bgCls = isOpen ? "bg-blue-50/60 dark:bg-blue-950/30" : "";

  if (editing) {
    return (
      <div className={"px-2 py-1 border-b border-slate-100 dark:border-slate-800 " + bgCls}
        onClick={function (e) { e.stopPropagation(); }}>
        <textarea
          autoFocus
          value={draft}
          onChange={function (e) { setDraft(e.target.value); }}
          onBlur={commit}
          onKeyDown={function (e) {
            if (e.key === "Escape") { e.preventDefault(); cancel(); }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
          }}
          placeholder="Comment on this line…"
          className="w-full text-[11px] px-1.5 py-1 rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ minHeight: 48 }}
        />
        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-gray-500 dark:text-slate-400">
          <span className="italic">Esc cancel · Ctrl+Enter save · blur saves</span>
          {hasComment && (
            <button type="button" onClick={function () { onSave(itemName, ""); setEditing(false); }}
              className="ml-auto text-red-600 dark:text-red-400 hover:underline">Delete</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={"px-2 py-1 text-[11px] cursor-text border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 " + bgCls}
      onClick={startEdit}
      title={hasComment ? "Click to edit — " + (comment.author || "") + (comment.updatedAt ? " • " + new Date(comment.updatedAt).toLocaleDateString() : "") : "Click to add a comment"}
    >
      {hasComment ? (
        <>
          <div className="text-gray-800 dark:text-slate-200 whitespace-pre-wrap leading-tight">{comment.text}</div>
          {(comment.author || comment.updatedAt) && (
            <div className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5 italic">
              {comment.author || ""}{comment.author && comment.updatedAt ? " · " : ""}{comment.updatedAt ? new Date(comment.updatedAt).toLocaleDateString() : ""}
            </div>
          )}
        </>
      ) : (
        <span className="text-gray-300 dark:text-slate-600 italic">+ comment</span>
      )}
    </div>
  );
}
