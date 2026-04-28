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
import { evaluateAlerts, WARN_RULE_LABELS } from '../../utils/alerts.js';

/* Short, scannable labels for the rule filter pills. Keep these tight
 * so the filter row reads in one line. The full descriptions remain in
 * the panel footer (sourced from WARN_RULE_LABELS). */
const RULE_PILL_LABEL = {
  "price-1d":            "Price",
  "guidance-revised":    "Guidance",
  "eps-revisions-trend": "EPS rev",
  "mos-divergence":      "MOS",
};

export default function AlertsPanel({ onJumpToCompany }) {
  const { companies, alertRules } = useCompanyContext();
  const [open, setOpen] = useState(false);
  const [activeRuleFilter, setActiveRuleFilter] = useState("all"); /* "all" or a ruleId */
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

  /* Warn-severity alerts only. Apply the rule filter when set, then
     sort by magnitude (largest first) so the most-actionable items
     bubble up regardless of company name. */
  const allWarns = useMemo(function () {
    return evaluateAlerts(companies || [], alertRules || {})
      .filter(function (a) { return a.severity === "warn"; });
  }, [companies, alertRules]);

  /* Per-rule counts power the filter pills (so the user can see at a
     glance which rules currently have alerts firing). */
  const countsByRule = useMemo(function () {
    const out = {};
    allWarns.forEach(function (a) { out[a.ruleId] = (out[a.ruleId] || 0) + 1; });
    return out;
  }, [allWarns]);

  const alerts = useMemo(function () {
    const filtered = activeRuleFilter === "all"
      ? allWarns
      : allWarns.filter(function (a) { return a.ruleId === activeRuleFilter; });
    return filtered.slice().sort(function (a, b) {
      return (b.magnitude || 0) - (a.magnitude || 0)
          || (a.companyName || "").localeCompare(b.companyName || "");
    });
  }, [allWarns, activeRuleFilter]);

  const count = alerts.length;
  const totalCount = allWarns.length;

  /* Pill turns amber when there's any active alert, regardless of the
     current rule filter — the filter is a panel-internal lens, not a
     reason to hide the global "stuff to look at" signal. */
  const pillClass = totalCount > 0
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
        title={totalCount === 0 ? "No active flags" : totalCount + " active flag" + (totalCount === 1 ? "" : "s")}
      >
        🚩 Flags{totalCount > 0 ? " (" + totalCount + ")" : ""}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[480px] max-h-[600px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-50">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Active Flags</div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500">
              {count}{activeRuleFilter !== "all" ? " of " + totalCount : ""} warning{count === 1 ? "" : "s"} · sorted by magnitude
            </div>
          </div>
          {/* Rule filter pills — All + one per rule that's currently
              firing. Click a pill to scope the list to that rule;
              click "All" to clear. Counts shown so the user can pick
              the rule with the most active items first. */}
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-1.5 items-center">
            {(function(){
              const allActive = activeRuleFilter === "all";
              const allClass = allActive
                ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold"
                : "bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800";
              return (
                <button onClick={function(){setActiveRuleFilter("all");}} className={"text-[10px] px-2 py-0.5 rounded-full border cursor-pointer " + allClass}>
                  All ({totalCount})
                </button>
              );
            })()}
            {Object.keys(RULE_PILL_LABEL).map(function (rid) {
              const c = countsByRule[rid] || 0;
              if (c === 0 && activeRuleFilter !== rid) return null; /* hide rules with no active alerts */
              const isActive = activeRuleFilter === rid;
              const cls = isActive
                ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold"
                : "bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800";
              return (
                <button key={rid} onClick={function(){setActiveRuleFilter(rid);}} className={"text-[10px] px-2 py-0.5 rounded-full border cursor-pointer " + cls} title={WARN_RULE_LABELS[rid]}>
                  {RULE_PILL_LABEL[rid]} ({c})
                </button>
              );
            })}
          </div>
          {count === 0 && (
            <div className="px-3 py-4 text-xs text-gray-400 dark:text-slate-500 italic text-center">
              No flags active.
            </div>
          )}
          {/* Always-visible footer: lists the warn rules so the user
              knows what triggers a flag without leaving the panel. */}
          <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold mb-1">Active rules</div>
            <ul className="space-y-0.5">
              {Object.keys(WARN_RULE_LABELS).map(function (k) {
                return (
                  <li key={k} className="text-[10px] text-gray-500 dark:text-slate-400 leading-tight">· {WARN_RULE_LABELS[k]}</li>
                );
              })}
            </ul>
          </div>
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
