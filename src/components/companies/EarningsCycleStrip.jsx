/* Earnings cycle grid — FY × Quarter visualization of every earnings
 * entry for one company. Rows are fiscal years (newest at top),
 * columns are Q1 / Q2 / Q3 / Q4. Each cell is a pill colored by the
 * thesis status of the matching entry; click to scroll to the entry
 * card in the list below.
 *
 * Quarter binding for an entry:
 *   1. Parse entry.quarter when set (e.g. "Q2 FY26", "Q2 2026").
 *   2. Else derive from entry.reportDate plus the company's
 *      valuation.fyMonth (default Dec): assume the period being
 *      reported is ~60 days BEFORE reportDate, then bucket into
 *      Q1-Q4 by distance from fiscal year-end.
 *   3. If neither yields coordinates, the entry shows up in a
 *      separate "Ungrouped" row at the bottom so it's still
 *      reachable.
 *
 * Visual replacement for the older flat strip — the grid makes
 * year-over-year thesis trajectory legible at a glance: a column of
 * green pills for Q1 across multiple FYs vs a column of red pills
 * tells a different story than time-series across cycles. */

import { parseDate } from '../../utils/index.js';

const STATUS_STYLE = {
  "On track": { bg: "#dcfce7", color: "#166534", border: "#86efac" },
  "Watch":    { bg: "#fef9c3", color: "#854d0e", border: "#fde047" },
  "Broken":   { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
  "":         { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" },
};

const MONTH_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function fmtDateShort(s) {
  const d = parseDate(s);
  if (!d || isNaN(d.getTime())) return s || "";
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short" });
}

/* Pull (fy, q) out of the entry.quarter free-text string. Accepts:
 *   "Q2 2026" / "Q2 FY26" / "FY26 Q2" / "2026 Q2" / "Q2/FY 26"
 * `fy` is normalized to a 4-digit calendar year (the year the FY ends in). */
function parseQuarterStr(s) {
  if (!s) return null;
  const t = String(s).trim();
  const qMatch = /Q\s*([1-4])/i.exec(t);
  const yMatch = /(?:FY\s*)?(\d{2,4})/.exec(t);
  if (!qMatch || !yMatch) return null;
  const q = parseInt(qMatch[1], 10);
  let y = parseInt(yMatch[1], 10);
  if (y < 100) y += y < 50 ? 2000 : 1900;
  return { q: q, fy: y };
}

/* Derive (fy, q) from the entry's reportDate using the company's FY-end
 * month. Uses a 60-day rollback so a Q reported in early August (period
 * ended Jun 30) bucket­s into Q1 of the right FY. */
function deriveCoords(reportDateStr, fyMonthNum) {
  const d = parseDate(reportDateStr);
  if (!d || isNaN(d.getTime())) return null;
  const periodDate = new Date(d.getTime() - 60 * 86400000);
  const py = periodDate.getFullYear();
  const pm = periodDate.getMonth() + 1;
  const dist = (fyMonthNum - pm + 12) % 12;
  /* dist 0-2 = Q4, 3-5 = Q3, 6-8 = Q2, 9-11 = Q1 (period furthest from year-end). */
  const q = dist <= 2 ? 4 : dist <= 5 ? 3 : dist <= 8 ? 2 : 1;
  /* FY = year that fyEnd falls in. If period month is past fyMonth in the
     calendar year, fyEnd is in the next calendar year. */
  const fy = pm > fyMonthNum ? py + 1 : py;
  return { q: q, fy: fy };
}

function fyMonthFromCompany(company) {
  const raw = company && company.valuation && company.valuation.fyMonth;
  if (!raw) return 12; /* default Dec */
  const k = String(raw).toLowerCase().slice(0, 3);
  return MONTH_MAP[k] || 12;
}

export default function EarningsCycleStrip({ entries, company }) {
  if (!entries || entries.length === 0) return null;

  const fyMonth = fyMonthFromCompany(company);

  /* Bucket entries into a {fy: {q1, q2, q3, q4}} structure. Entries
     that can't be coord-mapped land in `unGrouped`. When multiple
     entries share a (fy, q) coord, the one with the latest reportDate
     wins (typical case: a quarter has just one entry, but if a user
     amended an entry without overwriting the original, prefer the
     newer one). */
  const byFy = {};
  const unGrouped = [];
  entries.forEach(function (e) {
    const fromStr = parseQuarterStr(e.quarter);
    const coords = fromStr || deriveCoords(e.reportDate, fyMonth);
    if (!coords) { unGrouped.push(e); return; }
    const fy = coords.fy, q = coords.q;
    if (!byFy[fy]) byFy[fy] = {};
    const cur = byFy[fy][q];
    if (!cur || (e.reportDate || "").localeCompare(cur.reportDate || "") > 0) {
      byFy[fy][q] = e;
    }
  });

  const fyKeys = Object.keys(byFy).map(Number).sort(function (a, b) { return b - a; });
  if (fyKeys.length === 0 && unGrouped.length === 0) return null;

  function onPillClick(id) {
    if (!id) return;
    const el = document.getElementById("earnings-entry-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-blue-400", "ring-offset-2", "dark:ring-offset-slate-900");
    setTimeout(function () {
      el.classList.remove("ring-2", "ring-blue-400", "ring-offset-2", "dark:ring-offset-slate-900");
    }, 1500);
  }

  function pillFor(e) {
    if (!e) return null;
    const status = e.thesisStatus || "";
    const style = STATUS_STYLE[status] || STATUS_STYLE[""];
    const tooltip = [
      e.quarter || fmtDateShort(e.reportDate) || "—",
      e.reportDate ? "Reported " + fmtDateShort(e.reportDate) : null,
      status ? "Thesis: " + status : null,
      e.shortTakeaway ? "“" + e.shortTakeaway + "”" : null,
      e.tpChange && e.tpChange !== "Unchanged"
        ? "TP " + e.tpChange.toLowerCase() + (e.newTP ? " → " + e.newTP : "")
        : null,
    ].filter(Boolean).join("\n");
    return (
      <button
        type="button"
        onClick={function () { onPillClick(e.id); }}
        title={tooltip}
        className="w-full text-[11px] px-1.5 py-1 rounded font-medium border cursor-pointer hover:opacity-90 transition-opacity truncate"
        style={{ background: style.bg, color: style.color, borderColor: style.border }}
      >
        {fmtDateShort(e.reportDate) || "—"}
        {e.tpChange === "Increased" && <span className="ml-1">↑</span>}
        {e.tpChange === "Decreased" && <span className="ml-1">↓</span>}
      </button>
    );
  }

  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1.5">
        Thesis trajectory · {entries.length} cycle{entries.length === 1 ? "" : "s"}
      </div>
      <div className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: "44px repeat(4, minmax(0, 1fr))" }}>
        {/* Header row */}
        <div/>
        <div className="text-center uppercase tracking-wide text-gray-400 dark:text-slate-500 pb-0.5">Q1</div>
        <div className="text-center uppercase tracking-wide text-gray-400 dark:text-slate-500 pb-0.5">Q2</div>
        <div className="text-center uppercase tracking-wide text-gray-400 dark:text-slate-500 pb-0.5">Q3</div>
        <div className="text-center uppercase tracking-wide text-gray-400 dark:text-slate-500 pb-0.5">Q4</div>

        {/* FY rows, newest at top */}
        {fyKeys.map(function (fy) {
          return (
            <div key={fy} className="contents">
              <div className="text-[11px] font-semibold text-gray-700 dark:text-slate-300 pr-1 self-center">FY{String(fy).slice(2)}</div>
              {[1, 2, 3, 4].map(function (q) {
                const e = byFy[fy][q];
                return (
                  <div key={q} className="min-w-0">
                    {e ? pillFor(e) : (
                      <div className="w-full h-[22px] rounded border border-dashed border-slate-200 dark:border-slate-700"/>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {unGrouped.length > 0 && (
        <div className="mt-1.5">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1">Ungrouped <span className="text-gray-300 dark:text-slate-600 normal-case lowercase">(no parseable quarter / report date)</span></div>
          <div className="flex flex-wrap gap-1.5">
            {unGrouped.map(function (e) {
              return <div key={e.id} className="inline-block">{pillFor(e)}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
