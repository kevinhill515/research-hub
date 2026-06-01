/* PM Meeting Memo modal.
 *
 * Three tabs:
 *   - Agenda: read-only summary of what's pending across all
 *     portfolios. Derived live from each company's portWeightHistory
 *     where isAgenda:true (the same data the Portfolios page's sticky
 *     Lock-in bar reads). NO composer / no replies / no separate
 *     proposal records — all proposing happens in-place on the
 *     Portfolios page now. This tab is a pre-meeting checklist /
 *     "scan everything across portfolios" view. Plus the Recent
 *     Target Changes section (committed moves in last 6 days, with
 *     per-user ack via targetChangeReads).
 *   - Generate: auto-built compliance memo from portWeightHistory +
 *     tpHistory. Unchanged.
 *   - Log: history of every memo distributed via "Clear agenda".
 *
 * The Agenda tab used to host a modal-based proposal composer with
 * cards / replies / reactions / a separate meetingProposals meta blob.
 * That entire system was removed in the in-place pivot — proposing
 * now happens by clicking B/A/P/S or editing the Target % cell
 * directly on the row, and the visual treatment + Lock-in bar lives
 * on the Portfolios page itself.
 */
import { useState, useMemo } from "react";
import { useCompanyContext } from "../../context/CompanyContext.jsx";
import { buildMeetingMemo, clearAgendaFlags, MEETING_PROFILES } from "../../utils/meetingMemo.js";
import { TEAM_COLORS } from "../../constants/index.js";

const BTN_PRIMARY = "text-xs px-3 py-1.5 font-medium bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 transition-colors";
const BTN_GHOST = "text-xs px-3 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
const BTN_AMBER = "text-xs px-3 py-1.5 font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-md cursor-pointer transition-colors";

/* Action colors match PortfolioRow's B/A/P/S buttons so the visual
   language is consistent between the modal summary and the live row. */
const ACTION_COLORS = {
  Buy:  "#16a34a",
  Add:  "#0891b2",
  Pare: "#d97706",
  Sell: "#dc2626",
};

const RECENT_CHANGE_DAYS = 6;

function tabClass(active) {
  return "text-xs px-2.5 py-1 rounded-md cursor-pointer transition-colors " +
    (active
      ? "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200 font-medium"
      : "text-gray-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800");
}

function fmtPct(v) {
  if (v == null || v === "") return "—";
  var n = parseFloat(v);
  if (!isFinite(n)) return "—";
  return n.toFixed(2) + "%";
}

function daysAgo(iso) {
  if (!iso) return Infinity;
  var d = new Date(iso);
  if (isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function MeetingMemoModal({ open, onClose }) {
  const {
    companies, setCompanies, repData, currentUser,
    memoLog, addMemoLog, deleteMemoLog,
    targetChangeReads, markTargetChangeRead, commitProposedWeights,
  } = useCompanyContext();

  /* All hooks above the early-return so the hook count stays stable
     across open/closed renders (avoids React error #310). */
  const [tab, setTab] = useState("agenda");
  const [profile, setProfile] = useState("tuesday");
  const [copied, setCopied] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);

  const memo = profile ? buildMeetingMemo(companies, profile, repData) : "";
  const logEntries = memoLog || [];
  const profilePorts = (MEETING_PROFILES[profile] && MEETING_PROFILES[profile].ports) || [];
  const profilePortsKey = profilePorts.join(",");

  /* Pending agenda items derived from each company's portWeightHistory
     where isAgenda:true. Bucketed by portfolio for the summary view.
     Both target-% proposals and B/A/P/S stamps included. */
  const pendingByPort = useMemo(function () {
    var out = {};
    profilePorts.forEach(function (p) { out[p] = []; });
    (companies || []).forEach(function (c) {
      var hist = c.portWeightHistory || [];
      hist.forEach(function (h) {
        if (!h || !h.isAgenda) return;
        if (profilePorts.indexOf(h.portfolio) < 0) return;
        out[h.portfolio].push({ co: c, entry: h });
      });
    });
    return out;
  }, [companies, profilePortsKey]);

  const totalPendingCount = profilePorts.reduce(function (acc, p) {
    return acc + (pendingByPort[p] || []).length;
  }, 0);

  /* Recent committed (non-agenda) target-weight changes, scoped to the
     current meeting's ports, from the last RECENT_CHANGE_DAYS. */
  const recentChanges = useMemo(function () {
    var out = [];
    (companies || []).forEach(function (c) {
      var hist = c.portWeightHistory || [];
      hist.forEach(function (h) {
        if (!h || h.isAgenda) return;
        if (profilePorts.indexOf(h.portfolio) < 0) return;
        if (daysAgo(h.date) > RECENT_CHANGE_DAYS) return;
        var key = h.id || (c.id + "|" + h.portfolio + "|" + h.date + "|" + (h.newWeight != null ? h.newWeight : h.weight));
        out.push({
          key: key,
          companyName: c.name || c.ticker || "?",
          ticker: c.ticker || "",
          portfolio: h.portfolio,
          date: h.date,
          oldWeight: h.oldWeight != null ? h.oldWeight : (h.prevWeight != null ? h.prevWeight : null),
          newWeight: h.newWeight != null ? h.newWeight : h.weight,
          author: h.author || h.user || "",
        });
      });
    });
    out.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    return out;
  }, [companies, profilePortsKey]);

  const unseenChangeCount = recentChanges.filter(function (rc) {
    return !((targetChangeReads || {})[rc.key] || []).includes(currentUser);
  }).length;

  if (!open) return null;

  function close() { setCopied(false); setExpandedLogId(null); onClose(); }

  function copyMemo() {
    if (!memo) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(memo).then(function () { setCopied(true); setTimeout(function () { setCopied(false); }, 2000); });
    } else {
      var ta = document.createElement("textarea");
      ta.value = memo;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(function () { setCopied(false); }, 2000); } catch (_e) {}
      document.body.removeChild(ta);
    }
  }

  function clearAgenda() {
    if (!profile) return;
    const ports = MEETING_PROFILES[profile].ports;
    addMemoLog({ profile: profile, memo: memo });
    setCompanies(function (cs) { return clearAgendaFlags(cs, ports); });
    setTab("log");
  }

  function lockInPortfolio(port) {
    if (typeof window !== "undefined" && window.confirm && !window.confirm("Lock in all pending changes for " + port + "?")) return;
    commitProposedWeights(port);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[1500] flex items-start justify-center p-4 overflow-y-auto" onClick={close}>
      <div onClick={function (e) { e.stopPropagation(); }} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl my-8 max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 flex-wrap">
          <div className="text-base font-semibold text-gray-900 dark:text-slate-100">PM Meeting Memo</div>
          <div className="flex items-center gap-1">
            <button onClick={function () { setTab("agenda"); }} className={tabClass(tab === "agenda")}>
              Agenda{(totalPendingCount + unseenChangeCount) > 0 ? " (" + (totalPendingCount + unseenChangeCount) + ")" : ""}
            </button>
            <button onClick={function () { setTab("generate"); }} className={tabClass(tab === "generate")}>Generate</button>
            <button onClick={function () { setTab("log"); }} className={tabClass(tab === "log")}>
              Log{logEntries.length ? " (" + logEntries.length + ")" : ""}
            </button>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={function () { setProfile("tuesday"); }}
              className={"text-[11px] px-2 py-0.5 rounded-md cursor-pointer " + (profile === "tuesday" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-slate-200")}
              title="Multi Cap Strategies — FIN / IN / FGL / GL"
            >Tue (MultiCap)</button>
            <button
              onClick={function () { setProfile("thursday"); }}
              className={"text-[11px] px-2 py-0.5 rounded-md cursor-pointer " + (profile === "thursday" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-slate-200")}
              title="EM ADR + International Small Cap — EM / SC"
            >Thu (EM+SC)</button>
          </div>
          <button onClick={close} className="ml-auto text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 cursor-pointer">Close ✕</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          {tab === "agenda" ? (
            <AgendaSummary
              profilePorts={profilePorts}
              pendingByPort={pendingByPort}
              recentChanges={recentChanges}
              targetChangeReads={targetChangeReads || {}}
              currentUser={currentUser}
              onLockIn={lockInPortfolio}
              onMarkTargetRead={markTargetChangeRead}
            />
          ) : tab === "log" ? (
            <LogTab
              entries={logEntries}
              expandedId={expandedLogId}
              onToggle={function (id) { setExpandedLogId(expandedLogId === id ? null : id); }}
              onDelete={function (id) {
                if (typeof window !== "undefined" && window.confirm && !window.confirm("Delete this memo log entry? This cannot be undone.")) return;
                deleteMemoLog(id);
                if (expandedLogId === id) setExpandedLogId(null);
              }}
            />
          ) : (
            <GenerateView
              memo={memo}
              copied={copied}
              onCopy={copyMemo}
              onClear={clearAgenda}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== AGENDA TAB (read-only summary) ===== */

function AgendaSummary({ profilePorts, pendingByPort, recentChanges, targetChangeReads, currentUser, onLockIn, onMarkTargetRead }) {
  return (
    <div className="space-y-5">
      {/* Section A: pending agenda per portfolio */}
      <div>
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Current Proposals</div>
        <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">
          Everything sitting in the proposed (uncommitted) state. To add or amend a proposal,
          go to the Portfolios page — click B/A/P/S or edit the Target % directly on the row.
          Lock in here or from the sticky bar on each portfolio.
        </div>
        {profilePorts.map(function (port) {
          var items = pendingByPort[port] || [];
          return (
            <div key={port} className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-gray-700 dark:text-slate-200">{port}</span>
                <span className="text-[11px] text-gray-500 dark:text-slate-400">
                  {items.length === 0 ? "no pending changes" : items.length + " pending"}
                </span>
                {items.length > 0 && (
                  <button onClick={function () { onLockIn(port); }} className={BTN_AMBER + " ml-auto"}>
                    Lock in {port}
                  </button>
                )}
              </div>
              {items.length > 0 && (
                <div className="space-y-1 border border-amber-200 dark:border-amber-800 rounded-md bg-amber-50/30 dark:bg-amber-950/20 p-2">
                  {items.map(function (it, i) {
                    var h = it.entry;
                    var c = it.co;
                    var isTarget = !h.action;
                    var actionColor = h.action ? ACTION_COLORS[h.action] : null;
                    var authorColor = h.author ? (TEAM_COLORS[h.author] || "#94a3b8") : null;
                    return (
                      <div key={(h.id || i) + "-" + port} className="flex items-center gap-2 text-xs">
                        {authorColor && (
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: authorColor }} title={h.author || ""} />
                        )}
                        <span className="font-medium text-gray-900 dark:text-slate-100 min-w-[120px]">{c.ticker || c.name || "?"}</span>
                        {isTarget ? (
                          <span className="font-mono text-amber-800 dark:text-amber-300">
                            target {fmtPct(h.oldWeight)} → <span className="font-semibold">{fmtPct(h.newWeight)}</span>
                          </span>
                        ) : (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white"
                            style={{ background: actionColor || "#64748b" }}
                          >{h.action}</span>
                        )}
                        <span className="ml-auto text-[10px] text-gray-400 dark:text-slate-500">
                          {h.author && <span className="mr-2">{h.author}</span>}
                          {h.date}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Section B: recent committed target changes */}
      <div>
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Recent Target Changes (last {RECENT_CHANGE_DAYS} days)</div>
        <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">
          Already-committed target-weight moves on these portfolios. Click ⏳ to mark seen — once everyone has acknowledged, the row goes quiet.
        </div>
        {recentChanges.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-slate-400 italic py-3 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-md">
            No target changes in the window.
          </div>
        ) : (
          <div className="space-y-1">
            {recentChanges.map(function (rc) {
              var seenBy = targetChangeReads[rc.key] || [];
              var seen = seenBy.indexOf(currentUser) >= 0;
              return (
                <div
                  key={rc.key}
                  className={"flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs " + (seen
                    ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    : "border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30")}
                >
                  {!seen && (
                    <button
                      onClick={function () { onMarkTargetRead(rc.key); }}
                      title="Mark as seen"
                      className="text-amber-600 dark:text-amber-400 hover:text-amber-800 cursor-pointer text-base leading-none"
                    >⏳</button>
                  )}
                  {seen && <span className="text-emerald-600 dark:text-emerald-400 text-xs">✓</span>}
                  <span className="font-medium text-gray-900 dark:text-slate-100 min-w-[100px]">{rc.ticker || rc.companyName}</span>
                  <span className="text-gray-500 dark:text-slate-400">{rc.portfolio}</span>
                  <span className="text-gray-500 dark:text-slate-400">·</span>
                  <span className="font-mono text-gray-700 dark:text-slate-200">
                    {rc.oldWeight != null ? fmtPct(rc.oldWeight) : "—"} → {fmtPct(rc.newWeight)}
                  </span>
                  <span className="ml-auto text-[10px] text-gray-400 dark:text-slate-500">
                    {rc.author && (
                      <span className="inline-flex items-center gap-1 mr-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: TEAM_COLORS[rc.author] || "#94a3b8" }} />
                        {rc.author}
                      </span>
                    )}
                    {rc.date}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== GENERATE TAB ===== */

function GenerateView({ memo, copied, onCopy, onClear }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={onCopy} className={BTN_PRIMARY}>{copied ? "✓ Copied" : "Copy to clipboard"}</button>
        <button onClick={onClear} className={BTN_GHOST} title="Save this memo to the Log tab and mark every Trading Agenda entry for this meeting's portfolios as executed. After this, those entries surface in the 'Allocation Changes' section on future memos instead of 'Trading Agenda'.">
          Clear agenda (mark executed)
        </button>
      </div>
      <textarea
        value={memo}
        readOnly
        rows={20}
        onClick={function (e) { e.target.select(); }}
        className="w-full text-xs font-mono px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 leading-relaxed resize-y"
      />
      <div className="text-[11px] text-gray-400 dark:text-slate-500 italic mt-2">
        Edit the memo above before pasting into the compliance email if any line needs tweaking. After distributing, click "Clear agenda" so this session's decisions move to Allocation Changes on the next memo. A snapshot is saved to the Log tab.
      </div>
    </div>
  );
}

/* ===== LOG TAB ===== */

function LogTab({ entries, expandedId, onToggle, onDelete }) {
  if (!entries.length) {
    return (
      <div className="text-sm text-gray-500 dark:text-slate-400">
        No memos logged yet. After generating a memo and clicking "Clear agenda (mark executed)" on the Generate tab, a snapshot of the memo lands here so you can refer back to what was distributed.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map(function (e) {
        const expanded = expandedId === e.id;
        const profLabel = e.profile === "tuesday"
          ? "Tuesday (MultiCap)"
          : e.profile === "thursday"
          ? "Thursday (EM+SC)"
          : (e.profile || "?");
        return (
          <div key={e.id} className="border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                onClick={function () { onToggle(e.id); }}
                className="text-xs flex-1 text-left cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
              >
                <span className="font-medium">{e.date || "?"}</span>
                <span className="text-gray-500 dark:text-slate-400 ml-2">· {profLabel}</span>
                {e.author ? <span className="text-gray-500 dark:text-slate-400 ml-2">· {e.author}</span> : null}
                <span className="text-gray-400 dark:text-slate-500 ml-2">{expanded ? "▾" : "▸"}</span>
              </button>
              <button
                onClick={function () { onDelete(e.id); }}
                className="text-xs px-2 py-0.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                title="Delete this log entry"
              >
                Delete
              </button>
            </div>
            {expanded ? (
              <pre className="text-xs font-mono px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 whitespace-pre-wrap overflow-x-auto leading-relaxed">{e.memo}</pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
