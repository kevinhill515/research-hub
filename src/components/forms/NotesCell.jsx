import { useState, useRef, useEffect } from "react";

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

  var hasLong = !!(company.takeawayLong && company.takeawayLong.trim());

  function save() {
    onUpdate(company.id, { takeaway: sv, takeawayLong: lv });
    setOpen(false);
  }

  function openEditor() {
    setOpen(true);
    setSv(company.takeaway || "");
    setLv(company.takeawayLong || "");
  }

  return (
    <div className="relative" onClick={function (e) { e.stopPropagation(); }}>
      <div className="flex items-center gap-1">
        <span
          onClick={openEditor}
          className={
            "text-xs block max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer border-b border-dashed border-slate-300 dark:border-slate-600 " +
            (company.takeaway
              ? "text-gray-500 dark:text-slate-400"
              : "text-slate-300 dark:text-slate-600 italic")
          }
        >
          {company.takeaway || "add note..."}
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
