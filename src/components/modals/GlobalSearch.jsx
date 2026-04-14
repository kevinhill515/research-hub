import { useState, useRef, useEffect } from "react";
import { sectorStyle, shortSector, getCore } from '../../utils/index.js';
import StatusPill from '../ui/StatusPill.jsx';

function GlobalSearch({ companies, saved, onSelectCompany, onSelectEntry, onClose }) {
  var [q, setQ] = useState("");
  var inp = useRef();

  useEffect(function () { if (inp.current) inp.current.focus(); }, []);

  var results = [];
  if (q.trim().length >= 2) {
    var ql = q.toLowerCase();
    companies.forEach(function (c) {
      var score = 0;
      if (c.name && c.name.toLowerCase().includes(ql)) score += 3;
      if (c.ticker && c.ticker.toLowerCase().includes(ql)) score += 3;
      if (c.sector && c.sector.toLowerCase().includes(ql)) score += 1;
      if (c.country && c.country.toLowerCase().includes(ql)) score += 1;
      if (c.takeaway && c.takeaway.toLowerCase().includes(ql)) score += 1;
      if (Object.values(c.sections || {}).some(function (v) { return v && v.toLowerCase().includes(ql); })) score += 2;
      if ((c.earningsEntries || []).some(function (e) { return (e.shortTakeaway || "").toLowerCase().includes(ql) || (e.extendedTakeaway || "").toLowerCase().includes(ql); })) score += 1;
      if (score > 0) results.push({ type: "company", item: c, score });
    });
    saved.forEach(function (s) {
      var score = 0;
      if (s.title && s.title.toLowerCase().includes(ql)) score += 3;
      if (s.result && s.result.toLowerCase().includes(ql)) score += 1;
      if ((s.tags || []).some(function (t) { return t.toLowerCase().includes(ql); })) score += 2;
      if (score > 0) results.push({ type: "library", item: s, score });
    });
    results.sort(function (a, b) { return b.score - a.score; });
    results = results.slice(0, 20);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16"
      onClick={onClose}
    >
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 w-[580px] max-h-[75vh] flex flex-col shadow-2xl"
      >
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2.5">
          Global Search
        </div>

        <input
          ref={inp}
          value={q}
          onChange={function (e) { setQ(e.target.value); }}
          placeholder="Search companies, tickers, library entries, earnings..."
          className="text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 mb-2.5 focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
        />

        <div className="overflow-y-auto flex-1">
          {q.trim().length < 2 ? (
            <div className="text-xs text-gray-500 dark:text-slate-400">Type at least 2 characters to search across everything.</div>
          ) : results.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-slate-400">No results found.</div>
          ) : (
            results.map(function (r, i) {
              if (r.type === "company") {
                var c = r.item;
                var ss = c.sector ? sectorStyle(c.sector) : null;
                return (
                  <div
                    key={i}
                    onClick={function () { onSelectCompany(c); onClose(); }}
                    className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 mb-1.5 cursor-pointer bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex gap-1.5 items-center mb-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-medium">Co</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{c.name}</span>
                      {c.ticker && <span className="text-xs text-gray-500 dark:text-slate-400">{c.ticker}</span>}
                      {ss && (
                        <span
                          className="text-xs px-1.5 rounded-full"
                          style={{ background: ss.bg, color: ss.color }}
                        >
                          {shortSector(c.sector)}
                        </span>
                      )}
                      {c.status && <StatusPill status={c.status} />}
                    </div>
                    {c.takeaway && (
                      <div className="text-xs text-gray-500 dark:text-slate-400 italic truncate">"{c.takeaway}"</div>
                    )}
                  </div>
                );
              }

              if (r.type === "library") {
                var s = r.item;
                return (
                  <div
                    key={i}
                    onClick={function () { onSelectEntry(s); onClose(); }}
                    className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 mb-1.5 cursor-pointer bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex gap-1.5 items-center mb-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 font-medium">Lib</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{s.title}</span>
                      <span className="text-xs text-gray-500 dark:text-slate-400">{s.date}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400 truncate">{getCore(s.result)}</div>
                  </div>
                );
              }

              return null;
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

export default GlobalSearch;
