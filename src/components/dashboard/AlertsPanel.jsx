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
import { evaluateAlerts, groupAlertsByCompany } from '../../utils/alerts.js';

const SEVERITY_STYLE = {
  warn: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
  info: { bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" },
};

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

  const alerts = useMemo(function () {
    return evaluateAlerts(companies || [], alertRules || {});
  }, [companies, alertRules]);

  const grouped = useMemo(function () {
    return groupAlertsByCompany(alerts);
  }, [alerts]);

  const count = alerts.length;
  const groupCount = Object.keys(grouped).length;

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
        title={count === 0 ? "No active flags" : count + " active flag" + (count === 1 ? "" : "s") + " across " + groupCount + " companies"}
      >
        🚩 Flags{count > 0 ? " (" + count + ")" : ""}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[460px] max-h-[560px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-50">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Active Flags</div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500">
              {count} flag{count === 1 ? "" : "s"} · {groupCount} compan{groupCount === 1 ? "y" : "ies"}
            </div>
          </div>
          {count === 0 && (
            <div className="px-3 py-6 text-xs text-gray-400 dark:text-slate-500 italic text-center">
              No flags active. Adjust thresholds in your alert-rule settings if you want a tighter watch.
            </div>
          )}
          {count > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {Object.keys(grouped).map(function (cid) {
                const g = grouped[cid];
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={function () { jumpTo(cid); }}
                    className="block w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="text-[12px] font-semibold text-gray-900 dark:text-slate-100 mb-1">{g.companyName}</div>
                    <div className="space-y-0.5">
                      {g.items.map(function (a, i) {
                        const s = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.info;
                        return (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0 mt-0.5"
                                  style={{ background: s.bg, color: s.color, border: "1px solid " + s.border }}>
                              {a.severity}
                            </span>
                            <div className="flex-1">
                              <div className="text-[11px] text-gray-700 dark:text-slate-300">{a.message}</div>
                              {a.context && <div className="text-[10px] text-gray-500 dark:text-slate-400">{a.context}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-gray-400 dark:text-slate-500 italic">
            Edit thresholds via Data Hub → Alert Rules (coming soon).
          </div>
        </div>
      )}
    </div>
  );
}
