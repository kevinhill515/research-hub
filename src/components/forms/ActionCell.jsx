import { useState, useRef, useEffect } from "react";
import { ACTIONS } from '../../constants/index.js';

function ActionCell({ value, onUpdate }) {
  var [open, setOpen] = useState(false);
  var ref = useRef();

  useEffect(function () {
    if (!open) return;
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return function () { document.removeEventListener("mousedown", h); };
  }, [open]);

  var aColor = value === "Increase TP" ? "#166534" : value === "Decrease TP" ? "#dc2626" : "#6b7280";
  var aBg = value === "Increase TP" ? "#dcfce7" : value === "Decrease TP" ? "#fee2e2" : value ? "#f1f5f9" : "transparent";

  return (
    <div className="relative" ref={ref} onClick={function (e) { e.stopPropagation(); }}>
      <div
        onClick={function () { setOpen(function (o) { return !o; }); }}
        className="cursor-pointer min-w-[24px]"
      >
        {value ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: aBg, color: aColor }}
          >
            {value}
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
