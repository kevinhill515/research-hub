import { useState, useRef } from "react";
import { MONTHS } from '../../constants/index.js';
import { parseDate, todayStr } from '../../utils/index.js';
import { useClickOutside } from '../../hooks/useClickOutside.js';

function DatePicker({ value, onChange }) {
  var [open, setOpen] = useState(false);
  var [viewYear, setViewYear] = useState(function () {
    var d = value ? new Date(value) : new Date();
    return isNaN(d) ? new Date().getFullYear() : d.getFullYear();
  });
  var [viewMonth, setViewMonth] = useState(function () {
    var d = value ? new Date(value) : new Date();
    return isNaN(d) ? new Date().getMonth() : d.getMonth();
  });
  var ref = useRef();
  useClickOutside(ref, function () { setOpen(false); }, open);

  var parsed = value ? parseDate(value) : null;

  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function firstDayOfMonth(y, m) { return new Date(y, m, 1).getDay(); }

  function selectDate(d) {
    var s = viewYear + "-" + String(viewMonth + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    onChange(s);
    setOpen(false);
  }

  var days = daysInMonth(viewYear, viewMonth);
  var firstDay = firstDayOfMonth(viewYear, viewMonth);
  var cells = [];
  for (var i = 0; i < firstDay; i++) cells.push(null);
  for (var j = 1; j <= days; j++) cells.push(j);

  var selectedDay = parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth
    ? parsed.getDate() : null;

  return (
    <div className="relative inline-block" ref={ref} onClick={function (e) { e.stopPropagation(); }}>
      <span
        onClick={function () {
          setOpen(function (o) { return !o; });
          if (!open && value) {
            var d = parseDate(value);
            if (d && !isNaN(d)) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
          }
        }}
        className={
          "text-[10px] font-semibold cursor-pointer border-b border-dashed border-slate-400 dark:border-slate-500 whitespace-nowrap " +
          (value ? "text-green-800 dark:text-green-400" : "text-red-600 dark:text-red-400 font-normal")
        }
      >
        {value || "--"}
      </span>

      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-[400] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-3 min-w-[220px]">
          {/* Nav header */}
          <div className="flex items-center justify-between mb-2">
            <span
              onClick={function () {
                if (viewMonth === 0) { setViewMonth(11); setViewYear(function (y) { return y - 1; }); }
                else setViewMonth(function (m) { return m - 1; });
              }}
              className="cursor-pointer px-2 py-0.5 rounded text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {"\u2039"}
            </span>

            <div className="flex gap-1.5 items-center">
              <select
                value={viewMonth}
                onChange={function (e) { setViewMonth(parseInt(e.target.value)); }}
                className="text-xs border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {MONTHS.map(function (m, i) { return <option key={i} value={i}>{m}</option>; })}
              </select>
              <input
                type="number"
                value={viewYear}
                onChange={function (e) {
                  var y = parseInt(e.target.value);
                  if (!isNaN(y) && y > 1900 && y < 2100) setViewYear(y);
                }}
                className="text-xs border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 w-[58px] text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <span
              onClick={function () {
                if (viewMonth === 11) { setViewMonth(0); setViewYear(function (y) { return y + 1; }); }
                else setViewMonth(function (m) { return m + 1; });
              }}
              className="cursor-pointer px-2 py-0.5 rounded text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {"\u203a"}
            </span>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(function (d) {
              return (
                <div key={d} className="text-[10px] text-center text-slate-400 dark:text-slate-500 font-semibold py-0.5">
                  {d}
                </div>
              );
            })}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(function (d, i) {
              var isSelected = d && d === selectedDay;
              return (
                <div
                  key={i}
                  onClick={d ? function () { selectDate(d); } : undefined}
                  className={
                    "text-xs text-center py-1 px-0.5 rounded transition-colors " +
                    (isSelected
                      ? "bg-blue-700 text-white font-semibold"
                      : d
                        ? "cursor-pointer text-gray-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                        : "text-transparent")
                  }
                >
                  {d || ""}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 flex justify-between">
            <span
              onClick={function () { onChange(todayStr()); setOpen(false); }}
              className="text-xs text-blue-700 dark:text-blue-400 cursor-pointer hover:underline"
            >
              Today
            </span>
            {value && (
              <span
                onClick={function () { onChange(""); setOpen(false); }}
                className="text-xs text-red-600 dark:text-red-400 cursor-pointer hover:underline"
              >
                Clear
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DatePicker;
