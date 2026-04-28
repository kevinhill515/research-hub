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
import { evaluateAlerts, WARN_RULE_LABELS, DEFAULT_RULES } from '../../utils/alerts.js';
import { supaUpsert } from '../../api/index.js';

/* Short, scannable labels for the rule filter pills. Keep these tight
 * so the filter row reads in one line. The full descriptions remain in
 * the panel footer (sourced from WARN_RULE_LABELS). */
const RULE_PILL_LABEL = {
  "price-1d":            "Price",
  "guidance-revised":    "Guidance",
  "eps-revisions-trend": "EPS rev",
  "mos-divergence":      "MOS",
};

/* Editor schema: defines each rule's friendly name + inputs. The
 * editor uses this to render the form; values flow through draft state
 * and only persist on Save. Decimal-pct inputs (e.g. 0.08 for 8%) are
 * shown as percent strings so the user types '8' and we store 0.08. */
const RULE_EDITOR_SCHEMA = [
  {
    id: "price-1d",
    title: "Price moved on the day",
    fields: [
      { key: "threshold", label: "Threshold", kind: "pct", help: "Fires when |1D return| ≥ this." },
      { key: "direction", label: "Direction", kind: "select", options: [["down","Down only"],["up","Up only"],["any","Any direction"]], help: "Which way the move must go." },
    ],
  },
  {
    id: "guidance-revised",
    title: "Guidance revised",
    fields: [
      { key: "directions", label: "Directions", kind: "directions", help: "Which revisions to flag (down / up)." },
      { key: "withinDays", label: "Within days", kind: "int", help: "Latest announcement must be no older than this." },
    ],
  },
  {
    id: "eps-revisions-trend",
    title: "EPS revisions trend",
    fields: [
      { key: "consecutive", label: "Consecutive months", kind: "int", help: "How many consecutive monthly revisions in one direction." },
      { key: "threshold", label: "Cumulative drop", kind: "pct", help: "Total magnitude across the consecutive window." },
    ],
  },
  {
    id: "mos-divergence",
    title: "MOS vs MOS Fixed divergence",
    fields: [
      { key: "thresholdPp", label: "Threshold (pp)", kind: "int", help: "Percentage-points gap between live MOS and frozen MOS Fixed." },
    ],
  },
  {
    id: "earnings-imminent",
    title: "Earnings imminent (info)",
    fields: [
      { key: "withinDays", label: "Within days", kind: "int", help: "Days to next report. Info-severity — not shown in the warn-only panel." },
    ],
  },
  {
    id: "stale-data",
    title: "Data source stale",
    description: "Fires when any of Financials / Ratios / EPS Revisions / Guidance is one or more FYs behind the calendar (with a 30-day reporting-lag grace period). Off by default because the same condition is already badged ⚠ on each per-tab heading; turn on if you want the Flags pill to also serve as a 're-import this week' triage list.",
    fields: [],
  },
];

export default function AlertsPanel({ onJumpToCompany }) {
  const { companies, alertRules, setAlertRules } = useCompanyContext();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("alerts"); /* "alerts" | "rules" */
  const [activeRuleFilter, setActiveRuleFilter] = useState("all"); /* "all" or a ruleId */
  /* Draft rule state — buffered so the user can tweak fields without
     causing every keystroke to recompute alerts + write to supabase.
     Saved on click. */
  const [draft, setDraft] = useState(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const ref = useRef(null);

  /* Seed the draft when entering rules view, or when the persisted
     alertRules change underneath us. */
  useEffect(function(){
    if (view !== "rules") return;
    /* Merge defaults so every rule has a complete params block, then
       overlay the user's saved overrides. Defensive copy. */
    const next = {};
    Object.keys(DEFAULT_RULES).forEach(function(k){
      next[k] = {
        enabled: DEFAULT_RULES[k].enabled,
        params:  Object.assign({}, DEFAULT_RULES[k].params || {}),
      };
    });
    Object.keys(alertRules || {}).forEach(function(k){
      const u = alertRules[k] || {};
      next[k] = {
        enabled: u.enabled !== undefined ? u.enabled : (next[k] && next[k].enabled),
        params:  Object.assign({}, (next[k] && next[k].params) || {}, u.params || {}),
      };
    });
    setDraft(next);
    setDraftDirty(false);
  }, [view, alertRules]);

  function patchRule(ruleId, patch) {
    setDraft(function(prev){
      if (!prev) return prev;
      const cur = prev[ruleId] || { enabled: true, params: {} };
      const next = Object.assign({}, prev);
      next[ruleId] = {
        enabled: patch.enabled !== undefined ? patch.enabled : cur.enabled,
        params:  Object.assign({}, cur.params || {}, patch.params || {}),
      };
      return next;
    });
    setDraftDirty(true);
  }

  function saveDraft() {
    if (!draft) return;
    /* Persist + update context. supaUpsert is fire-and-forget; the
       context state is the source of truth for live alert evaluation. */
    setAlertRules(draft);
    try { supaUpsert("meta", { key: "alertRules", value: JSON.stringify(draft) }); } catch (e) {}
    setDraftDirty(false);
  }

  function resetToDefaults() {
    const fresh = {};
    Object.keys(DEFAULT_RULES).forEach(function(k){
      fresh[k] = {
        enabled: DEFAULT_RULES[k].enabled,
        params:  Object.assign({}, DEFAULT_RULES[k].params || {}),
      };
    });
    setDraft(fresh);
    setDraftDirty(true);
  }

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
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {view === "rules" ? "Alert Rules" : "Active Flags"}
            </div>
            <div className="flex items-center gap-2">
              {view === "alerts" && (
                <div className="text-[10px] text-gray-400 dark:text-slate-500">
                  {count}{activeRuleFilter !== "all" ? " of " + totalCount : ""} warning{count === 1 ? "" : "s"} · sorted by magnitude
                </div>
              )}
              <button
                onClick={function(){ setView(function(v){ return v === "rules" ? "alerts" : "rules"; }); }}
                className="text-xs px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                title={view === "rules" ? "Back to flags" : "Edit alert rule thresholds"}
              >
                {view === "rules" ? "← Back" : "⚙ Rules"}
              </button>
            </div>
          </div>
          {view === "alerts" && (
            <>
              {/* Rule filter pills — All + one per rule that's currently
                  firing. Click a pill to scope the list to that rule. */}
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
                  if (c === 0 && activeRuleFilter !== rid) return null;
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
              {/* Footer at the bottom — lists what each warn rule looks for. */}
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
            </>
          )}

          {view === "rules" && draft && (
            <div>
              {/* Save bar at the top — sticky-feeling so the user can save
                  without scrolling back to the header. */}
              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                <button onClick={saveDraft} disabled={!draftDirty} className={"text-xs px-2.5 py-1 font-medium rounded-md border transition-colors " + (draftDirty ? "bg-blue-600 dark:bg-blue-700 text-white border-blue-600 dark:border-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 cursor-pointer" : "bg-slate-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed")}>
                  {draftDirty ? "Save changes" : "Saved"}
                </button>
                <button onClick={resetToDefaults} className="text-[11px] px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors" title="Restore all rules to factory defaults (does not save until you click Save)">Reset to defaults</button>
                <span className="text-[10px] text-gray-400 dark:text-slate-500 italic ml-auto">Persists to all teammates</span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {RULE_EDITOR_SCHEMA.map(function(rule){
                  const r = draft[rule.id] || { enabled: true, params: {} };
                  return (
                    <div key={rule.id} className="px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={!!r.enabled} onChange={function(e){patchRule(rule.id, { enabled: e.target.checked });}} className="cursor-pointer"/>
                          <span className="text-xs font-semibold text-gray-900 dark:text-slate-100">{rule.title}</span>
                        </label>
                      </div>
                      {rule.description && (
                        <div className="text-[10px] text-gray-500 dark:text-slate-400 italic mb-1 leading-snug">{rule.description}</div>
                      )}
                      {r.enabled && rule.fields.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mt-1.5">
                          {rule.fields.map(function(f){
                            const val = r.params ? r.params[f.key] : undefined;
                            if (f.kind === "pct") {
                              const pctVal = val == null || isNaN(val) ? "" : (val * 100).toString();
                              return (
                                <div key={f.key}>
                                  <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 block mb-0.5">{f.label}</label>
                                  <div className="flex items-center gap-1">
                                    <input type="number" step="0.1" value={pctVal} onChange={function(e){
                                      const n = parseFloat(e.target.value);
                                      const decimal = isNaN(n) ? null : n / 100;
                                      patchRule(rule.id, { params: { [f.key]: decimal } });
                                    }} className="text-xs px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 w-20"/>
                                    <span className="text-[10px] text-gray-400 dark:text-slate-500">%</span>
                                  </div>
                                  {f.help && <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-0.5">{f.help}</div>}
                                </div>
                              );
                            }
                            if (f.kind === "int") {
                              return (
                                <div key={f.key}>
                                  <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 block mb-0.5">{f.label}</label>
                                  <input type="number" step="1" value={val == null ? "" : val} onChange={function(e){
                                    const n = parseInt(e.target.value, 10);
                                    patchRule(rule.id, { params: { [f.key]: isNaN(n) ? null : n } });
                                  }} className="text-xs px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 w-20"/>
                                  {f.help && <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-0.5">{f.help}</div>}
                                </div>
                              );
                            }
                            if (f.kind === "select") {
                              return (
                                <div key={f.key}>
                                  <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 block mb-0.5">{f.label}</label>
                                  <select value={val == null ? "" : val} onChange={function(e){ patchRule(rule.id, { params: { [f.key]: e.target.value } }); }} className="text-xs px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100">
                                    {f.options.map(function(o){ return <option key={o[0]} value={o[0]}>{o[1]}</option>; })}
                                  </select>
                                  {f.help && <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-0.5">{f.help}</div>}
                                </div>
                              );
                            }
                            if (f.kind === "directions") {
                              const dirs = Array.isArray(val) ? val : ["down"];
                              function toggleDir(d){
                                const next = dirs.indexOf(d) >= 0 ? dirs.filter(function(x){return x !== d;}) : dirs.concat([d]);
                                patchRule(rule.id, { params: { [f.key]: next } });
                              }
                              return (
                                <div key={f.key} className="col-span-2">
                                  <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 block mb-0.5">{f.label}</label>
                                  <div className="flex gap-1.5">
                                    {[["down","Down"],["up","Up"]].map(function(d){
                                      const on = dirs.indexOf(d[0]) >= 0;
                                      return (
                                        <span key={d[0]} onClick={function(){ toggleDir(d[0]); }} className={"text-[11px] px-2 py-0.5 rounded-full cursor-pointer border " + (on ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400")}>{d[1]}</span>
                                      );
                                    })}
                                  </div>
                                  {f.help && <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-0.5">{f.help}</div>}
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}
                      {r.enabled && rule.fields.length === 0 && (
                        <div className="text-[10px] text-gray-400 dark:text-slate-500 italic">No parameters — toggle on/off only.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
