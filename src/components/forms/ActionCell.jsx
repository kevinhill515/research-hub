import { useState, useRef } from "react";
import { ACTIONS } from '../../constants/index.js';
import { getLastReportedEntry } from '../../utils/index.js';
import { useClickOutside } from '../../hooks/useClickOutside.js';

function ActionCell({ value, earningsEntries, onUpdate }) {
  var [open, setOpen] = useState(false);
  var ref = useRef();
  useClickOutside(ref, function () { setOpen(false); }, open);

  /* When the manual action isn't set, fall back to the most recent
     earnings entry's tpChange (Increase TP / No Action / Decrease TP).
     The 📊 prefix signals the value came from earnings rather than a
     manual entry, so the user knows it'll auto-update when the next
     earnings entry is logged. */
  /* Earnings-driven: when the latest earnings entry has a usable
     tpChange, map it to the matching ACTIONS value and let it win
     over any manual company.action. The earnings form uses the verbs
     'Increased / Decreased / Unchanged' (past-tense, describing what
     happened) while the Action column uses the imperatives 'Increase
     TP / Decrease TP / No Action' (the resulting recommendation).
     Without this mapping the strings never matched and the fallback
     was effectively dead code — Action stayed stuck on stale manual
     values forever even after the earnings entry said otherwise. */
  var TP_CHANGE_TO_ACTION = {
    "Increased":  "Increase TP",
    "Decreased":  "Decrease TP",
    "Unchanged":  "No Action",
  };
  var derivedFromEarnings = false;
  var displayValue = value;
  if (earningsEntries && earningsEntries.length > 0) {
    var last = getLastReportedEntry(earningsEntries);
    if (last && last.tpChange && TP_CHANGE_TO_ACTION[last.tpChange]) {
      displayValue = TP_CHANGE_TO_ACTION[last.tpChange];
      derivedFromEarnings = true;
    }
  }
  /* Pill palette matches the earnings tile: green = Increase TP,
     red = Decrease TP, amber = No Action. 'No Action' was grey, but
     grey reads as "no info" — amber signals "actively reviewed, no
     change called for" which is what the earnings entry meant. */
  var aColor = displayValue === "Increase TP" ? "#166534" : displayValue === "Decrease TP" ? "#dc2626" : displayValue === "No Action" ? "#854d0e" : "#6b7280";
  var aBg    = displayValue === "Increase TP" ? "#dcfce7" : displayValue === "Decrease TP" ? "#fee2e2" : displayValue === "No Action" ? "#fef9c3" : displayValue ? "#f1f5f9" : "transparent";

  return (
    <div className="relative" ref={ref} onClick={function (e) { e.stopPropagation(); }}>
      <div
        onClick={function () { setOpen(function (o) { return !o; }); }}
        className="cursor-pointer min-w-[24px]"
      >
        {displayValue ? (
          <span
            title={derivedFromEarnings ? "From most recent earnings — clear to set manually" : undefined}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: aBg, color: aColor }}
          >
            {derivedFromEarnings ? "📊 " : ""}{displayValue}
          </span>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500 border-b border-dashed border-slate-200 dark:border-slate-700">
            --
          </span>
        )}
      </div>

      {open && (
        <div className="absolute top-[calc(100%+2px)] left-0 z-[200] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-1 shadow-lg min-w-[130px]">
          <div
            onClick={function () { onUpdate(""); setOpen(false); }}
            className="text-xs px-3 py-1.5 cursor-pointer rounded text-gray-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            -- None
          </div>
          {ACTIONS.map(function (a) {
            var ac = a === "Increase TP" ? "#166534" : a === "Decrease TP" ? "#dc2626" : "#6b7280";
            return (
              <div
                key={a}
                onClick={function () { onUpdate(a); setOpen(false); }}
                className="text-xs px-3 py-1.5 cursor-pointer rounded font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                style={{ color: ac }}
              >
                {a}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ActionCell;
