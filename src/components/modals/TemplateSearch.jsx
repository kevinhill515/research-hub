import { useState, useRef, useEffect } from "react";
import { TEMPLATE_SECTIONS } from '../../constants/index.js';
import { sectorStyle, shortSector } from '../../utils/index.js';

function TemplateSearch({ companies, onSelect, onClose }) {
  var [q, setQ] = useState("");
  var inp = useRef();

  useEffect(function () { if (inp.current) inp.current.focus(); }, []);

  var allSections = [...TEMPLATE_SECTIONS, "Earnings & Thesis Check"];
  var results = q.trim().length < 2
    ? []
    : companies.filter(function (c) {
        return allSections.map(function (s) { return (c.sections && c.sections[s]) || ""; }).join(" ").toLowerCase().indexOf(q.toLowerCase()) >= 0;
      });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20"
      onClick={onClose}
    >
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 w-[520px] max-h-[70vh] flex flex-col shadow-2xl"
      >
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2.5">
          Search across all templates
        </div>

        <input
          ref={inp}
          value={q}
          onChange={function (e) { setQ(e.target.value); }}
          placeholder="Type at least 2 characters..."
          className="text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 mb-2.5 focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
        />

        <div className="overflow-y-auto flex-1">
          {q.trim().length < 2 ? (
            <div className="text-xs text-gray-500 dark:text-slate-400">Type at least 2 characters.</div>
          ) : results.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-slate-400">No matches.</div>
          ) : (
            results.map(function (c) {
              var matching = allSections.filter(function (s) {
                return (c.sections && c.sections[s] || "").toLowerCase().indexOf(q.toLowerCase()) >= 0;
              });
              return (
                <div
                  key={c.id}
                  onClick={function () { onSelect(c, q); onClose(); }}
                  className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 mb-1.5 cursor-pointer bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex gap-2 items-center mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{c.name}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-400">{c.ticker}</span>
                    {c.sector && (function () {
                      var ss = sectorStyle(c.sector);
                      return (
                        <span
                          className="text-xs px-1.5 rounded-full"
                          style={{ background: ss.bg, color: ss.color }}
                        >
                          {shortSector(c.sector)}
                        </span>
                      );
                    }())}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    Found in: {matching.join(", ")}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div
          className="mt-2.5 text-xs text-gray-500 dark:text-slate-400 text-right cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
          onClick={onClose}
        >
          Close (Esc)
        </div>
      </div>
    </div>
  );
}

export default TemplateSearch;
