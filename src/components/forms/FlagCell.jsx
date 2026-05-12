import { useState, useRef } from "react";
import { FLAG_STYLES } from '../../constants/index.js';
import { useClickOutside } from '../../hooks/useClickOutside.js';

function FlagCell({ value, onUpdate }) {
  var [open, setOpen] = useState(false);
  var ref = useRef();
  useClickOutside(ref, function () { setOpen(false); }, open);

  var fs = value ? FLAG_STYLES[value] : null;

  return (
    <div className="relative" ref={ref} onClick={function (e) { e.stopPropagation(); }}>
      <div
        onClick={function () { setOpen(function (o) { return !o; }); }}
        className="cursor-pointer min-w-[20px]"
      >
        {fs ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: fs.bg, color: fs.color }}
          >
            {fs.icon} {value}
          </span>
        ) : (
          <span className="text-xs text-slate-300 dark:text-slate-600">{"\u2014"}</span>
        )}
      </div>

      {open && (
        <div className="absolute top-[calc(100%+2px)] left-0 z-[200] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-1 shadow-lg min-w-[150px]">
          <div
            onClick={function () { onUpdate(""); setOpen(false); }}
            className="text-xs px-3 py-1.5 cursor-pointer rounded text-gray-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {"\u2014"} Clear flag
          </div>
          {Object.keys(FLAG_STYLES).map(function (f) {
            var fs2 = FLAG_STYLES[f];
            return (
              <div
                key={f}
                onClick={function () { onUpdate(f); setOpen(false); }}
                className="text-xs px-3 py-1.5 cursor-pointer rounded font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                style={{ color: fs2.color }}
              >
                {fs2.icon} {f}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FlagCell;
