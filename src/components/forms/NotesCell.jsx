import { useState, useRef } from "react";
import { getLastReportedEntry } from '../../utils/index.js';
import { useClickOutside } from '../../hooks/useClickOutside.js';

function NotesCell({ company, onUpdate }) {
  var [open, setOpen] = useState(false);
  var [sv, setSv] = useState(company.takeaway || "");
  var [lv, setLv] = useState(company.takeawayLong || "");
  var ref = useRef();
  useClickOutside(ref, function () { setOpen(false); }, open);

  /* Fallback to the most recent earnings entry's takeaways when the
     company-level fields are empty. The same fallback also seeds the
     editor textboxes when openEditor runs, so opening the editor
     gives users an already-typed-out starting point from the latest
     earnings (they can edit, then Save to lift it onto the company-
     level fields). */
  var displayShort = company.takeaway || "";
  var displayLong = company.takeawayLong || "";
  var earningsShort = "", earningsLong = "";
  var last = getLastReportedEntry(company.earningsEntries);
  if (last) {
    earningsShort = last.shortTakeaway || "";
    earningsLong = last.extendedTakeaway || "";
  }
  /* Per-field fallback to the latest earnings takeaways. Earlier this
     only fell back when BOTH company-level fields were empty, which
     meant clearing only the Short takeaway (while Extended notes still
     had content) left the cell stuck at "add note…" instead of
     surfacing the fresh shortTakeaway from the most recent earnings
     entry. Falling back per-field handles partial-delete cleanly. */
  var derivedShort = false, derivedLong = false;
  if (!displayShort && earningsShort) { displayShort = earningsShort; derivedShort = true; }
  if (!displayLong  && earningsLong)  { displayLong  = earningsLong;  derivedLong  = true; }
  var derivedFromEarnings = derivedShort || derivedLong;
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
        {/* Extended-notes icon moved to the LEFT of the takeaway, inside
            the dashed-underline cell. The Notes column right-edge was
            getting pushed off-screen by the trailing 📝, but the space
            BEFORE the takeaway was empty — so the icon now lives there.
            Reserves a fixed slot (w-3) whether it renders or not so
            takeaways across rows line up vertically. */}
        <span
          title={hasLong ? "Extended notes — click to open" : ""}
          className="text-[9px] w-3 shrink-0 inline-flex justify-center cursor-pointer"
          onClick={openEditor}
        >
          {hasLong ? "📝" : ""}
        </span>
        <span
          onClick={openEditor}
          title={derivedFromEarnings ? "From most recent earnings — open to set a manual note" : undefined}
          className={
            /* Widened from 150 → 260 so a 6-word takeaway typically
               fits inline without ellipsis cutting it mid-sentence. */
            "text-xs block max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer border-b border-dashed border-slate-300 dark:border-slate-600 " +
            (displayShort
              ? "text-gray-500 dark:text-slate-400"
              : "text-slate-300 dark:text-slate-600 italic")
          }
        >
          {/* 📊 prefix removed — was visual noise when most notes are
              earnings-sourced anyway. The 'From most recent earnings…'
              tooltip is preserved so the provenance is still
              discoverable on hover. */}
          {displayShort || "add note..."}
        </span>
      </div>

      {open && (
        /* Widened from 300px → 640px and the extended textarea grew from
           5 → 14 rows + larger base font (sm vs xs) so extended notes
           are actually readable inline without opening the full company
           page. Anchored top-RIGHT (right-0) instead of top-left so the
           popup grows leftward from the cell — keeps it on-screen even
           when the Notes column is far to the right and the row would
           otherwise need horizontal scrolling to see the popup tail. */
        <div
          ref={ref}
          className="absolute top-full right-0 z-[300] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 w-[640px] max-w-[92vw] shadow-2xl"
        >
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">
            Short takeaway
          </div>
          <input
            value={sv}
            onChange={function (e) { setSv(e.target.value); }}
            className="w-full text-sm px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 mb-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">
            Extended notes
          </div>
          <textarea
            value={lv}
            onChange={function (e) { setLv(e.target.value); }}
            rows={14}
            className="w-full text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 resize-y font-[inherit] leading-relaxed mb-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
