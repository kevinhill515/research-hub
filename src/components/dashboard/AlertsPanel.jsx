/* Alerts pill + dropdown panel.
 *
 * Renders a small "Flags (N)" button. When N > 0 the pill is amber.
 * Clicking opens a dropdown listing every active alert grouped by
 * company, with a click-to-jump action that routes to the company
 * detail view.
 *
 * Reads the rule set from c.context's `alertRules` (loaded from
 * Supabase meta.alertRules); evaluates pure-functionally via
 * utils/alerts.evaluateAlerts. */

import { useState, useMemo, useRef, useEffect } from "react";
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { evaluateAlerts } from '../../utils/alerts.js';

export default function AlertsPanel({ onJumpToCompany }) {
  const { companies, alertRules } = useCompanyContext();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  /* Close on click-outside. */
  useEffect(function () {
    function onDoc(e) {
      if (!open) return;
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return function () { document.removeEventListener("mousedown", onDoc); };
  }, [open]);

  /* Warn-severity alerts only — info-level (e.g. earnings imminent) is
     useful context but doesn't need a flagged eyeball. Flat list, sorted
     by company name then alert message for stable order. */
  const alerts = useMemo(function () {
    return evaluateAlerts(companies || [], alertRules || {})
      .filter(function (a) { return a.severity === "warn"; })
      .sort(function (a, b) {
        return (a.companyName || "").localeCompare(b.companyName || "")
            || (a.message || "").localeCompare(b.message || "");
      });
  }, [companies, alertRules]);

  const count = alerts.length;

  const pillClass = count > 0
    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/50"
    : "bg-slate-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700";

  function jumpTo(companyId) {
    if (typeof onJumpToCompany === "function") onJumpToCompany(companyId);
    setOpen(false);
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={function () { setOpen(function (o) { return !o; }); }}
        className={"text-xs px-2.5 py-1 font-medium rounded-md border cursor-pointer transition-colors " + pillClass}
        title={count === 0 ? "No active flags" : count + " active flag" + (count === 1 ? "" : "s")}
      >
        🚩 Flags{count > 0 ? " (" + count + ")" : ""}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[440px] max-h-[560px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-50">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Active Flags</div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500">
              {count} warning{count === 1 ? "" : "s"}
            </div>
          </div>
          {count === 0 && (
            <div className="px-3 py-6 text-xs text-gray-400 dark:text-slate-500 italic text-center">
              No flags active.
            </div>
          )}
          {count > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {alerts.map(function (a, i) {
                return (
                  <button
                    key={a.companyId + ":" + a.ruleId + ":" + i}
                    type="button"
                    onClick={function () { jumpTo(a.companyId); }}
                    className="block w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="font-semibold text-gray-900 dark:text-slate-100 truncate flex-1" title={a.companyName}>{a.companyName}</span>
                      <span className="text-amber-700 dark:text-amber-400 tabular-nums shrink-0">{a.message}</span>
                    </div>
                    {a.context && (
                      <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">{a.context}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
