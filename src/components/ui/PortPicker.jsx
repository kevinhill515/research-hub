import { useState } from "react";
import { PORTFOLIOS } from '../../constants/index.js';
import PillEl from './PillEl.jsx';

function PortPicker({ active, onChange, pillBg, pillColor, plusColor, opts, pillStyleFn, dashedPills }) {
  var [open, setOpen] = useState(false);
  var al = active || [];
  var allOpts = opts || PORTFOLIOS;
  var avail = allOpts.filter(function (p) { return al.indexOf(p) < 0; });

  function gs(p) {
    return pillStyleFn ? pillStyleFn(p) : { bg: pillBg, color: pillColor };
  }

  return (
    <div
      onClick={function (e) { e.stopPropagation(); }}
      className="flex gap-1 items-center flex-nowrap"
    >
      {al.map(function (p) {
        var s = gs(p);
        return dashedPills ? (
          <span
            key={p}
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs px-2 py-0.5 rounded-full bg-transparent"
            style={{ border: "1.5px dashed " + s.color, color: s.color }}
          >
            {p}
            <span
              onClick={function () { onChange(al.filter(function (x) { return x !== p; })); }}
              className="cursor-pointer opacity-70 hover:opacity-100 text-[10px] transition-opacity"
            >
              x
            </span>
          </span>
        ) : (
          <PillEl
            key={p}
            label={p}
            bg={s.bg}
            color={s.color}
            border="none"
            onRemove={function () { onChange(al.filter(function (x) { return x !== p; })); }}
          />
        );
      })}

      {avail.length > 0 && (
        <div className="relative inline-block">
          <span
            onClick={function () { setOpen(function (o) { return !o; }); }}
            className="text-xs px-2 py-0.5 rounded-full cursor-pointer transition-colors"
            style={{ border: "1px dashed " + plusColor, color: plusColor }}
          >
            +
          </span>

          {open && (
            <div
              onClick={function (e) { e.stopPropagation(); }}
              className="absolute top-[calc(100%+2px)] left-0 z-[200] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-1 flex flex-col gap-0.5 min-w-[80px] shadow-lg"
            >
              {avail.map(function (p) {
                return (
                  <span
                    key={p}
                    onClick={function () { onChange(al.concat([p])); setOpen(false); }}
                    className="text-xs px-3 py-1.5 cursor-pointer rounded text-gray-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {p}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PortPicker;
