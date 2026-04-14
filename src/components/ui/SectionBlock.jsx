import { useState, useRef, useEffect } from "react";
import { toHTML } from '../../utils/index.js';

function SectionBlock({ title, content, highlight, flashKey }) {
  var [open, setOpen] = useState(true);
  var [flash, setFlash] = useState(false);
  var prevKey = useRef(null);

  useEffect(function () {
    if (flashKey && flashKey !== prevKey.current) {
      prevKey.current = flashKey;
      setFlash(true);
      setTimeout(function () { setFlash(false); }, 2000);
    }
  }, [flashKey]);

  var html = toHTML(content || "--");
  if (highlight) {
    var esc = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(
      new RegExp("(" + esc + ")", "gi"),
      "<mark class='bg-yellow-200 dark:bg-yellow-900 text-gray-900 dark:text-slate-100'>$1</mark>"
    );
  }

  return (
    <div
      className={
        "mb-2 rounded-md overflow-hidden transition-colors duration-500 border " +
        (flash
          ? "border-amber-400 dark:border-amber-500"
          : "border-slate-200 dark:border-slate-700")
      }
    >
      <div
        onClick={function () { setOpen(function (o) { return !o; }); }}
        className={
          "px-3 py-2 cursor-pointer flex justify-between items-center transition-colors duration-500 " +
          (flash
            ? "bg-yellow-100 dark:bg-yellow-900/40"
            : "bg-slate-50 dark:bg-slate-800")
        }
      >
        <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
          {title}
        </span>
        <span className="text-xs text-gray-500 dark:text-slate-400">
          {open ? "\u25b2" : "\u25bc"}
        </span>
      </div>

      {open && (
        <div
          className="px-3 py-2.5 text-sm leading-[1.8] text-gray-900 dark:text-slate-100 whitespace-pre-wrap bg-white dark:bg-slate-900"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

export default SectionBlock;
