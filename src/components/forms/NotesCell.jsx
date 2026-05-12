import { useState, useRef, useEffect } from "react";
import { getLastReportedEntry } from '../../utils/index.js';

function NotesCell({ company, onUpdate }) {
  var [open, setOpen] = useState(false);
  var [sv, setSv] = useState(company.takeaway || "");
  var [lv, setLv] = useState(company.takeawayLong || "");
  var ref = useRef();

  useEffect(function () {
    if (!open) return;
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return function () { document.removeEventListener("mousedown", h); };
  }, [open]);

  /* Fallback to the most recent earnings entry's takeaways when the
     company-level fields are empty. The same fallback also seeds the
     editor textboxes when openEditor runs, so opening the editor
     gives users an already-typed-out starting point from the latest
     earnings (they can edit, then Save to lift it onto the company-
     level fields). */
  var derivedFromEarnings = false;
  var displayShort = company.takeaway || "";
  var displayLong = company.takeawayLong || "";
  var earningsShort = "", earningsLong = "";
  var last = getLastReportedEntry(company.earningsEntries);
  if (last) {
    earningsShort = last.shortTakeaway || "";
    earningsLong = last.extendedTakeaway || "";
  }
  if (!displayShort && !displayLong && (earningsShort || earningsLong)) {
    displayShort = earningsShort;
    displayLong = earningsLong;
    derivedFromEarnings = true;
  }
  var hasLong = !!(displayLong && displayLong.trim());

  function save() {
    onUpdate(company.id, { takeaway: sv, takeawayLong: lv });
    setOpen(false);
  }

  function openEditor() {
    setOpen(true);
    /* Pre-fill from the company-level fields if set, else from the
       latest earnings takeaways. That way users editing a stale
       earnings-sourced note start with the earnings text already
       loaded — no copy-paste needed. */
    setSv(company.takeaway || earningsShort || "");
    setLv(company.takeawayLong || earningsLong || "");
  }

  return (
    <div className="relative" onClick={function (e) { e.stopPropagation(); }}>
      <div className="flex items-center gap-1">
        <span
          onClick={openEditor}
          title={derivedFromEarnings ? "From most recent earnings — open to set a manual note" : undefined}
          className={
            "text-xs block max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer border-b border-dashed border-slate-300 dark:border-slate-600 " +
            (displayShort
              ? "text-gray-500 dark:text-slate-400"
              : "text-slate-300 dark:text-slate-600 italic")
          }
        >
          {displayShort ? (derivedFromEarnings ? "📊 " : "") + displayShort : "add note..."}
        </span>
        {hasLong && (
          <span
            title="Extended notes"
            className="text-[9px] cursor-pointer"
            onClick={openEditor}
          >
            {"📝"}
          </span>
        )}
      </div>

      {open && (
        <div
          ref={ref}
          className="absolute top-full left-0 z-[300] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 w-[300px] shadow-xl"
        >
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">
            Short takeaway
          </div>
          <input
            value={sv}
            onChange={function (e) { setSv(e.target.value); }}
            className="w-full text-xs px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 mb-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">
            Extended notes
          </div>
          <textarea
            value={lv}
            onChange={function (e) { setLv(e.target.value); }}
            rows={5}
            className="w-full text-xs px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 resize-y font-[inherit] leading-relaxed mb-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          <div className="flex gap-2 justify-end">
            <span
              onClick={function () { setOpen(false); }}
              className="text-xs text-gray-500 dark:text-slate-400 cursor-pointer px-2 py-1 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
            >
              Cancel
            </span>
            <button
              onClick={save}
              className="text-xs px-3 py-1 font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotesCell;
