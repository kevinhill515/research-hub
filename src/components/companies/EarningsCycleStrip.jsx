/* Quarterly cycle strip — horizontal timeline of all earnings entries
 * for one company, sorted oldest → newest, with each entry color-coded
 * by its thesis status (green = On track, amber = Watch, red = Broken,
 * gray = no status set). Click a pill to scroll to the matching entry
 * card in the list below.
 *
 * Helps the user see thesis trajectory across cycles at a glance —
 * e.g. "On track for 6 quarters then Watch" — before drilling into
 * any one entry. */

import { parseDate } from '../../utils/index.js';

const STATUS_STYLE = {
  "On track": { bg: "#dcfce7", color: "#166534", border: "#86efac" },
  "Watch":    { bg: "#fef9c3", color: "#854d0e", border: "#fde047" },
  "Broken":   { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
  "":         { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" },
};

function fmtDateShort(s) {
  const d = parseDate(s);
  if (!d || isNaN(d.getTime())) return s || "";
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short" });
}

export default function EarningsCycleStrip({ entries }) {
  if (!entries || entries.length === 0) return null;
  /* Sort oldest first for the visual timeline (left = old). */
  const sorted = entries
    .slice()
    .sort(function (a, b) { return (a.reportDate || "").localeCompare(b.reportDate || ""); });

  function onPillClick(id) {
    const el = document.getElementById("earnings-entry-" + id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      /* Brief highlight so the user can tell which entry was targeted. */
      el.classList.add("ring-2", "ring-blue-400", "ring-offset-2", "dark:ring-offset-slate-900");
      setTimeout(function () {
        el.classList.remove("ring-2", "ring-blue-400", "ring-offset-2", "dark:ring-offset-slate-900");
      }, 1500);
    }
  }

  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1.5">
        Thesis trajectory · {sorted.length} cycle{sorted.length === 1 ? "" : "s"}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {sorted.map(function (e) {
          const status = e.thesisStatus || "";
          const style = STATUS_STYLE[status] || STATUS_STYLE[""];
          const label = e.quarter || fmtDateShort(e.reportDate) || "—";
          const tooltip = [
            label,
            e.reportDate ? "Reported " + fmtDateShort(e.reportDate) : null,
            status ? "Thesis: " + status : null,
            e.shortTakeaway ? "“" + e.shortTakeaway + "”" : null,
            e.tpChange && e.tpChange !== "Unchanged"
              ? "TP " + e.tpChange.toLowerCase() + (e.newTP ? " → " + e.newTP : "")
              : null,
          ].filter(Boolean).join("\n");
          return (
            <button
              key={e.id}
              type="button"
              onClick={function () { onPillClick(e.id); }}
              title={tooltip}
              className="text-[11px] px-2 py-1 rounded-full font-medium border cursor-pointer hover:opacity-90 transition-opacity"
              style={{ background: style.bg, color: style.color, borderColor: style.border }}
            >
              {label}
              {e.tpChange === "Increased" && <span className="ml-1">↑</span>}
              {e.tpChange === "Decreased" && <span className="ml-1">↓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
