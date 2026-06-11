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
import { useState, useMemo, useEffect } from "react";
import { useCompanyContext } from "../../context/CompanyContext.jsx";
import { buildMeetingMemo, clearAgendaFlags, MEETING_PROFILES, pickHeldTicker } from "../../utils/meetingMemo.js";
import { TEAM_COLORS } from "../../constants/index.js";
import { fmtDateUS } from "../../utils/index.js";
import { buildTickerOwners, calcCompanyRepMV, calcTotalMV } from "../../utils/portfolioMath.js";

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
    companies, setCompanies, repData, fxRates, currentUser,
    memoLog, addMemoLog, deleteMemoLog, revertMemoLog, editAgendaEntryNewWeight,
    wednesdayNotes, setWednesdayNotes,
    targetChangeReads, markTargetChangeRead, commitProposedWeights,
    discardAgendaEntries, refreshCompaniesFromSupabase, commentOnAgendaEntry,
    editAgendaComment, deleteAgendaComment,
  } = useCompanyContext();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");

  /* All hooks above the early-return so the hook count stays stable
     across open/closed renders (avoids React error #310). */
  const [tab, setTab] = useState("agenda");
  const [profile, setProfile] = useState("tuesday");
  const [copied, setCopied] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);
  /* Memo snapshot per profile — captured at Lock-in time so the memo
     text the user is about to copy/paste doesn't evaporate the moment
     the lock commits (which flips isAgenda → false on every entry and
     leaves the live builder with nothing to show). The snapshot only
     clears on "Mark executed + log" or "Discard" — i.e. when the user
     has explicitly finished with this meeting. Local-only state so a
     hard reload re-derives from live data; that's fine — the snapshot
     is a session convenience, not a record-of-truth. */
  const [lockedSnapshot, setLockedSnapshot] = useState({});
  /* Wednesday notes — shared text persisted to Supabase via the
     wednesdayNotes meta blob in CompanyContext. Anyone with the
     app open + the modal on the Wed tab sees edits propagate
     within ~500ms (same-machine via BroadcastChannel; cross-
     machine on next refresh). "Save to log" still archives a
     snapshot in memoLog and clears the working text. */

  const liveMemo = profile ? buildMeetingMemo(companies, profile, repData) : "";
  const memo = (lockedSnapshot[profile] != null && lockedSnapshot[profile] !== "") ? lockedSnapshot[profile] : liveMemo;
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
        /* Use the portfolio-correct held ticker rather than the
           primary/ord ticker so the Recent Target Changes feed reads
           the same way as the rest of the meeting memo / agenda. */
        var heldTicker = pickHeldTicker(c, h.portfolio, repData) || c.ticker || "";
        out.push({
          key: key,
          companyName: c.name || c.ticker || "?",
          ticker: heldTicker,
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
  }, [companies, profilePortsKey, repData]);

  const unseenChangeCount = recentChanges.filter(function (rc) {
    return !((targetChangeReads || {})[rc.key] || []).includes(currentUser);
  }).length;

  /* Per-port rep-weight context. Lets the Agenda summary show
     "current rep %" alongside the proposed target. Built ONCE per
     profile per render — calcTotalMV walks all companies-in-port and
     would be expensive to repeat per row. */
  const repWeightCtx = useMemo(function () {
    var byPort = {};
    profilePorts.forEach(function (port) {
      var pRep = (repData || {})[port] || {};
      var inPort = (companies || []).filter(function (c) { return (c.portfolios || []).indexOf(port) >= 0; });
      var others = (companies || []).filter(function (c) { return (c.portfolios || []).indexOf(port) < 0; });
      var owners = buildTickerOwners(inPort, others);
      var total = calcTotalMV(inPort, pRep, fxRates, owners);
      byPort[port] = { pRep: pRep, owners: owners, total: total };
    });
    return byPort;
  }, [companies, repData, fxRates, profilePortsKey]);

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

  function clearSnapshot() {
    setLockedSnapshot(function (s) { var n = Object.assign({}, s); delete n[profile]; return n; });
  }
  /* Combined commit + log path. Replaces the old two-button workflow
     (Lock in all → Mark executed + log) per user request: there's no
     scenario where the team wants to lock weights without also logging
     the memo. This single button does everything end-of-meeting:
       1. Snapshot the live memo (so the log records what users saw).
       2. Commit every pending target proposal on the profile's ports
          (writes portWeights, flips isAgenda:false). Also flips any
          B/A/P/S agenda stamps to executed.
       3. Save the snapshot to memoLog.
       4. Flip any remaining isAgenda:true flags (defense in depth —
          shouldn't be any after step 2, but cheap to be sure).
       5. Clear the locked snapshot since the meeting is now logged.
       6. Switch the user to the Log tab. */
  function commitAndLog() {
    if (!profile) return;
    const ports = MEETING_PROFILES[profile].ports;
    var snapshot = liveMemo;
    ports.forEach(function (p) { commitProposedWeights(p); });
    addMemoLog({ profile: profile, memo: snapshot });
    setCompanies(function (cs) { return clearAgendaFlags(cs, ports); });
    clearSnapshot();
    setTab("log");
  }
  /* Kept under old name as an alias so any other call sites continue
     to work without an audit pass — semantics are now "commit + log". */
  var clearAgenda = commitAndLog;

  function lockInPortfolio(port) {
    /* Kept for the Portfolios-page sticky bar (per-port commit
       outside the meeting flow). Still snapshots so re-opening the
       Memo modal afterwards shows what was committed. */
    if (typeof window !== "undefined" && window.confirm && !window.confirm("Lock in all pending changes for " + port + "?")) return;
    setLockedSnapshot(function (s) { return Object.assign({}, s, profile && liveMemo ? { [profile]: liveMemo } : {}); });
    commitProposedWeights(port);
  }
  function discardProfileAgenda() {
    var n = profilePorts.reduce(function (acc, p) { return acc + (pendingByPort[p] || []).length; }, 0);
    if (n === 0) return;
    if (typeof window !== "undefined" && window.confirm &&
        !window.confirm("DISCARD all " + n + " pending agenda items in " + profilePorts.join(" / ") +
                       "?\n\nThis deletes the proposals without committing them. CASH will be restored for target-% proposals. " +
                       "Cannot be undone.")) return;
    discardAgendaEntries(profilePorts);
    clearSnapshot();
  }
  async function doRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg("");
    var n = await refreshCompaniesFromSupabase();
    setRefreshing(false);
    if (n === -1) setRefreshMsg("Refresh failed");
    else setRefreshMsg("✓ Refreshed " + n + " companies");
    setTimeout(function () { setRefreshMsg(""); }, 3000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[1500] flex items-start justify-center p-4 overflow-y-auto" onClick={close}>
      <div onClick={function (e) { e.stopPropagation(); }} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl my-8 max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 flex-wrap">
          <div className="text-base font-semibold text-gray-900 dark:text-slate-100">IC Meeting</div>
          <div className="flex items-center gap-1">
            <button onClick={function () { setTab("agenda"); }} className={tabClass(tab === "agenda")}>
              Agenda{totalPendingCount > 0 ? " (" + totalPendingCount + ")" : ""}
            </button>
            <button onClick={function () { setTab("generate"); }} className={tabClass(tab === "generate")}>Memo</button>
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
              onClick={function () { setProfile("wednesday"); setTab("generate"); }}
              className={"text-[11px] px-2 py-0.5 rounded-md cursor-pointer " + (profile === "wednesday" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-slate-200")}
              title="Wednesday free-form notes — open textarea, not auto-built from portfolios"
            >Wed (Notes)</button>
            <button
              onClick={function () { setProfile("thursday"); }}
              className={"text-[11px] px-2 py-0.5 rounded-md cursor-pointer " + (profile === "thursday" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-slate-200")}
              title="EM ADR + International Small Cap — EM / SC"
            >Thu (EM+SC)</button>
          </div>
          {/* Refresh Portfolios — pulls just the companies table from
              Supabase so meeting attendees see proposals other teammates
              just submitted, without paying the full reload cost. */}
          <button
            onClick={doRefresh}
            disabled={refreshing}
            className={"ml-auto text-xs px-2.5 py-1 rounded-md cursor-pointer transition-colors " + (refreshing ? "bg-slate-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500" : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800")}
            title="Re-fetch portfolio data + meeting-traffic meta blobs (TP approvals, discussions, memo log, Wednesday notes) from Supabase. Use this during meetings to see teammates' just-submitted edits without a full app reload."
          >
            {refreshing ? "Refreshing…" : "↻ Refresh Portfolios"}
          </button>
          {refreshMsg && (
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">{refreshMsg}</span>
          )}
          {/* Pop out — separate browser window so the meeting modal
              stays visible alongside the Portfolios page during the
              IC meeting. Hidden inside the popout itself. */}
          {(typeof window === "undefined" || !window.opener) && (
            <button
              onClick={function(){
                try {
                  window.open(window.location.pathname + "?popout=icMeeting", "icmeeting-popout", "width=1100,height=900");
                  close();
                } catch(_e){}
              }}
              className="text-[11px] px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
              title="Open this modal in a separate window — useful during the IC meeting so the agenda stays visible while you navigate the rest of the app"
            >↗ Pop out</button>
          )}
          <button onClick={close} className="text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 cursor-pointer">Close ✕</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          {tab === "agenda" ? (
            <AgendaSummary
              profilePorts={profilePorts}
              pendingByPort={pendingByPort}
              recentChanges={recentChanges}
              targetChangeReads={targetChangeReads || {}}
              currentUser={currentUser}
              repData={repData}
              fxRates={fxRates}
              repWeightCtx={repWeightCtx}
              onMarkTargetRead={markTargetChangeRead}
              onComment={commentOnAgendaEntry}
              onEditComment={editAgendaComment}
              onDeleteComment={deleteAgendaComment}
              onEditNewWeight={editAgendaEntryNewWeight}
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
              onRevert={function (id) {
                if (typeof window !== "undefined" && window.confirm && !window.confirm(
                  "Revert this lock-in?\n\n" +
                  "All target-weight commits and B/A/P/S agenda stamps flipped during this log will return to pending (isAgenda:true), and portWeights will be restored to their pre-commit values. The log entry itself is deleted.\n\n" +
                  "Use this when the meeting was logged too early — undoes the commit so the IC can finish editing."
                )) return;
                revertMemoLog(id);
                if (expandedLogId === id) setExpandedLogId(null);
              }}
            />
          ) : profile === "wednesday" ? (
            /* Wednesday Notes — free-form composer instead of the
               auto-generated portfolio memo. Just an editable
               textarea + "Save to log" button. Saved entries land
               in memoLog with profile:"wednesday", visible from the
               Log tab same as Tuesday / Thursday memos. */
            <WednesdayNotesView
              copied={copied}
              onCopy={function(){
                if (!wednesdayNotes) return;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(wednesdayNotes).then(function(){setCopied(true);setTimeout(function(){setCopied(false);},2000);});
                }
              }}
              text={wednesdayNotes || ""}
              setText={setWednesdayNotes}
              onSaveToLog={function(){
                if (!(wednesdayNotes||"").trim()) return;
                addMemoLog({ profile: "wednesday", memo: wednesdayNotes });
                setWednesdayNotes("");
                setTab("log");
              }}
            />
          ) : (
            <GenerateView
              memo={memo}
              copied={copied}
              onCopy={copyMemo}
              onClear={clearAgenda}
              onDiscard={discardProfileAgenda}
              hasPending={totalPendingCount > 0}
              profilePorts={profilePorts}
              profile={profile}
              snapshotActive={lockedSnapshot[profile] != null && lockedSnapshot[profile] !== ""}
              onRegenerate={clearSnapshot}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== AGENDA TAB (read-only summary) ===== */

function AgendaSummary({ profilePorts, pendingByPort, recentChanges, targetChangeReads, currentUser, repData, fxRates, repWeightCtx, onMarkTargetRead, onComment, onEditComment, onDeleteComment, onEditNewWeight }) {
  /* Compute current rep weight (actual holding as % of port AUM) for a
     given (company, port). Uses the precomputed per-port context so
     totalMV isn't recomputed per row. Returns null when port has zero
     AUM or no holding. */
  function repWeightFor(company, port) {
    var ctx = repWeightCtx && repWeightCtx[port];
    if (!ctx || !ctx.total) return null;
    var mv = calcCompanyRepMV(company, ctx.pRep, fxRates, ctx.owners);
    if (!isFinite(mv) || mv <= 0) return 0;
    return (mv / ctx.total) * 100;
  }
  var totalPending = profilePorts.reduce(function (acc, p) { return acc + (pendingByPort[p] || []).length; }, 0);
  return (
    <div className="space-y-5">
      {/* Section A: pending agenda per portfolio */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Current Proposals</div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400">
              Everything sitting in the proposed (uncommitted) state. To add or amend a proposal,
              go to the Portfolios page — click B/A/P/S or edit the Target % directly on the row.
            </div>
          </div>
          {/* "Lock in ALL" button removed — locking and logging are now
              one step. Generate the memo on the Memo tab and hit
              "Commit & log" there to commit weights + save the memo
              in a single click. */}
        </div>
        {profilePorts.map(function (port) {
          var items = pendingByPort[port] || [];
          /* Merge per (company, port) — a row can have BOTH a B/A/P/S
             stamp AND a target-% proposal. Display them as one combined
             line: "<Action> · TICKER (Name) · oldW → newW". */
          var merged = {};
          items.forEach(function (it) {
            var key = it.co.id;
            if (!merged[key]) merged[key] = { co: it.co, action: null, target: null, authors: [], date: "" };
            var h = it.entry;
            if (h.action) {
              merged[key].action = h;
              if (h.author && merged[key].authors.indexOf(h.author) < 0) merged[key].authors.push(h.author);
              if (!merged[key].date || (h.date || "") > merged[key].date) merged[key].date = h.date;
            } else if (h.newWeight !== undefined && h.newWeight !== null) {
              merged[key].target = h;
              if (h.author && merged[key].authors.indexOf(h.author) < 0) merged[key].authors.push(h.author);
              if (!merged[key].date || (h.date || "") > merged[key].date) merged[key].date = h.date;
            }
          });
          var rows = Object.keys(merged).map(function (k) { return merged[k]; });
          /* Sort: trades (rows with a B/A/P/S action) first, then
             target-only allocation changes at the bottom. Within each
             group, action ordering matches the memo generator
             (Buy < Add < Pare < Sell) and target-only by date desc. */
          var actionRank = { Buy: 0, Add: 1, Pare: 2, Sell: 3 };
          rows.sort(function (a, b) {
            var aHasAct = !!a.action;
            var bHasAct = !!b.action;
            if (aHasAct !== bHasAct) return aHasAct ? -1 : 1;
            if (aHasAct) {
              var ra = actionRank[a.action.action] != null ? actionRank[a.action.action] : 99;
              var rb = actionRank[b.action.action] != null ? actionRank[b.action.action] : 99;
              if (ra !== rb) return ra - rb;
            }
            return (b.date || "").localeCompare(a.date || "");
          });
          return (
            <div key={port} className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-gray-700 dark:text-slate-200">{port}</span>
                <span className="text-[11px] text-gray-500 dark:text-slate-400">
                  {rows.length === 0 ? "no pending changes" : rows.length + (rows.length === 1 ? " company pending" : " companies pending")}
                </span>
              </div>
              {rows.length > 0 && (() => {
                var trades = rows.filter(function (r) { return !!r.action; });
                /* Allocation Changes mirrors the memo's logic: include
                   target-only rows AND action rows whose effective new
                   weight differs from the committed portWeights value
                   by more than 0.05 ppt. Without this, a Pare/Sell
                   stamp tied to a target reduction (rus-ca, jen-de,
                   6323-jp, brav-se in INSC) showed under Trades but
                   was missing from the Allocation Changes block where
                   the user expected to see the weight transition. */
                var allocChanges = rows.filter(function (r) {
                  if (!r.action) return !!r.target;
                  var newW = r.target
                    ? parseFloat(r.target.newWeight)
                    : parseFloat(r.action.newWeight);
                  if (!isFinite(newW)) return false;
                  var committedRaw = (r.co.portWeights || {})[port];
                  var committed = parseFloat(committedRaw);
                  if (!isFinite(committed)) committed = 0;
                  return Math.abs(newW - committed) > 0.05;
                });
                /* Build a single render function for either group so the
                   trades block and the allocation-changes block share all
                   the badge / weight / comment logic. */
                function renderRow(row, ri, isAlloc) {
                  var c = row.co;
                  var heldTicker = pickHeldTicker(c, port, repData) || c.ticker || c.name || "?";
                  var actionEntry = row.action;
                  var targetEntry = row.target;
                  var actionColor = actionEntry ? ACTION_COLORS[actionEntry.action] : null;
                  var primaryAuthor = row.authors[0] || "";
                  var authorColor = primaryAuthor ? (TEAM_COLORS[primaryAuthor] || "#94a3b8") : null;
                  var repPct = repWeightFor(c, port);
                  var repStr = repPct == null ? null : repPct.toFixed(2) + "%";
                  /* For target-change entries, apply the same oldWeight
                     fallback the memo generator uses — committed portWeights
                     when isAgenda:true and the stored oldWeight is missing. */
                  var targetOldW = null, targetNewW = null;
                  if (targetEntry) {
                    targetOldW = targetEntry.oldWeight;
                    if (targetEntry.isAgenda && (targetOldW == null || targetOldW === "")) {
                      var committed = (c.portWeights || {})[port];
                      var committedNum = parseFloat(committed);
                      targetOldW = isFinite(committedNum) ? committedNum : 0;
                    }
                    targetNewW = targetEntry.newWeight;
                  }
                  /* weightStr — action-aware, with different framing
                     depending on which block this row is rendered in.
                     For the Allocation Changes block (isAlloc=true)
                     the "from" side is the COMMITTED TARGET weight —
                     the row reads as a target-to-target transition.
                     For the Trades block (isAlloc=false), the "from"
                     side is the rep-account weight so the trader can
                     see how much they're moving from current holdings. */
                  var weightStr = null;
                  if (isAlloc) {
                    /* Target-from-target framing. */
                    var committedAlloc = parseFloat((c.portWeights || {})[port]);
                    var fromAlloc = targetEntry
                      ? fmtPct(targetOldW)
                      : (isFinite(committedAlloc) ? fmtPct(committedAlloc) : "?");
                    var toAlloc;
                    if (targetEntry) {
                      toAlloc = fmtPct(targetNewW);
                    } else if (actionEntry && actionEntry.action === "Sell") {
                      toAlloc = "0.00%";
                    } else if (actionEntry) {
                      toAlloc = isFinite(committedAlloc) ? fmtPct(committedAlloc) : "?";
                    } else {
                      toAlloc = "?";
                    }
                    weightStr = fromAlloc + " → " + toAlloc;
                  } else if (actionEntry && actionEntry.action === "Sell") {
                    weightStr = (repStr || "?") + " → 0.00%";
                  } else if (actionEntry && targetEntry) {
                    weightStr = (repStr || "?") + " → " + fmtPct(targetNewW);
                  } else if (actionEntry && actionEntry.action === "Buy") {
                    var committedB = parseFloat((c.portWeights || {})[port]);
                    weightStr = (repStr || "0.00%") + (isFinite(committedB) && committedB > 0 ? " → " + fmtPct(committedB) : "");
                  } else if (actionEntry && (actionEntry.action === "Add" || actionEntry.action === "Pare")) {
                    var committedAP = parseFloat((c.portWeights || {})[port]);
                    weightStr = (repStr || "?") + (isFinite(committedAP) && committedAP > 0 ? " → " + fmtPct(committedAP) : "");
                  } else if (targetEntry) {
                    /* Pure target change — no B/A/P/S stamp. */
                    weightStr = fmtPct(targetOldW) + " → " + fmtPct(targetNewW);
                  }
                  /* Target-only badge: up arrow green for increase, down
                     arrow red for decrease. Neutral gray when equal or
                     undeterminable. Mirrors the B/A/P/S badge geometry so
                     the row layout is consistent. */
                  var tgtBadge = null;
                  if (isAlloc && targetEntry) {
                    var oldN = parseFloat(targetOldW);
                    var newN = parseFloat(targetNewW);
                    var goingUp = isFinite(oldN) && isFinite(newN) && newN > oldN + 0.005;
                    var goingDn = isFinite(oldN) && isFinite(newN) && newN < oldN - 0.005;
                    tgtBadge = {
                      glyph: goingUp ? "▲" : goingDn ? "▼" : "▬",
                      color: goingUp ? "#16a34a" : goingDn ? "#dc2626" : "#64748b",
                      title: goingUp ? "Target weight increase" : goingDn ? "Target weight decrease" : "Target weight unchanged",
                    };
                  }
                  var comments = ((actionEntry && actionEntry.comments) || [])
                    .concat((targetEntry && targetEntry.comments) || []);
                  return (
                    <ProposalRow
                      key={(c.id || ri) + "-" + port + (isAlloc ? "-alloc" : "-trade")}
                      company={c}
                      port={port}
                      heldTicker={heldTicker}
                      actionEntry={actionEntry}
                      targetEntry={targetEntry}
                      actionColor={actionColor}
                      authorColor={authorColor}
                      authors={row.authors}
                      date={row.date /* render-formatted inside renderRow body */}
                      weightStr={weightStr}
                      tgtBadge={tgtBadge}
                      comments={comments}
                      currentUser={currentUser}
                      onComment={onComment}
                      onEditComment={onEditComment}
                      onDeleteComment={onDeleteComment}
                      onEditNewWeight={onEditNewWeight}
                      isAlloc={isAlloc}
                    />
                  );
                }
                return (
                  <div className="space-y-1 border border-amber-200 dark:border-amber-800 rounded-md bg-amber-50/30 dark:bg-amber-950/20 p-2">
                    {trades.map(function (row, ri) { return renderRow(row, ri, false); })}
                    {allocChanges.length > 0 && trades.length > 0 && (
                      <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400 font-semibold pt-1.5 mt-1 border-t border-amber-200 dark:border-amber-800">
                        Allocation Changes
                      </div>
                    )}
                    {allocChanges.map(function (row, ri) { return renderRow(row, ri, true); })}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* "Recent Target Changes" section removed — once the meeting is
          locked and logged the entries belong in the memo's Allocation
          Changes section + memoLog, not as a separate Agenda-tab feed.
          Cross-meeting catch-up between Tuesday and Thursday meetings
          is now served by the memoLog tab itself. */}
    </div>
  );
}

/* ===== PROPOSAL ROW (with comments) ===== */

function ProposalRow({ company, port, heldTicker, actionEntry, targetEntry, actionColor, authorColor, authors, date, weightStr, tgtBadge, comments, currentUser, onComment, onEditComment, onDeleteComment, onEditNewWeight, isAlloc }) {
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingText, setEditingText] = useState("");
  /* Editable "to" weight for Pare/Add action stamps. Lets us show e.g.
     "Pare to 2.5%" while leaving the committed target at 2.0% — an
     intermediate trade vs. the final committed target. */
  const editableTo = !isAlloc && actionEntry && (actionEntry.action === "Add" || actionEntry.action === "Pare") && !!onEditNewWeight;
  const committedW = parseFloat((company.portWeights || {})[port]);
  const stampedNew = parseFloat(actionEntry && actionEntry.newWeight);
  const initialTo = isFinite(stampedNew) && stampedNew > 0 ? stampedNew : (isFinite(committedW) ? committedW : 0);
  const [toDraft, setToDraft] = useState(editableTo ? initialTo.toFixed(2) : "");
  useEffect(function(){ if (editableTo) setToDraft(initialTo.toFixed(2)); /* eslint-disable-next-line */ }, [stampedNew, committedW]);
  function commitTo(){
    if (!editableTo) return;
    var v = parseFloat(toDraft);
    if (!isFinite(v) || v < 0) { setToDraft(initialTo.toFixed(2)); return; }
    /* Always call the mutator on blur — even when v equals the current
       stored value — so the agendaEditedNewWeight flag gets stamped.
       Without this, re-blurring an already-edited cell with no actual
       change is a no-op and the alloc-shadow skip never engages. */
    onEditNewWeight(company.id, actionEntry.id, v);
  }
  /* For Pare/Add editable case, split the existing weightStr on " → "
     to keep the "from" side (rep / oldNum text) identical to the
     non-editable rendering. */
  const fromStr = editableTo && weightStr ? (weightStr.indexOf(" → ") >= 0 ? weightStr.split(" → ")[0] : weightStr) : null;
  /* Which entry to attach NEW comments to — prefer the target entry
     if present, else the action stamp. Existing comments may live on
     either; we look them up below by walking both entries. */
  const commentTargetId = (targetEntry && targetEntry.id) || (actionEntry && actionEntry.id);
  function postComment() {
    if (!commentText.trim() || !commentTargetId) return;
    onComment(company.id, commentTargetId, commentText);
    setCommentText("");
    setShowComment(false);
  }
  function findEntryIdForComment(commentId) {
    /* Comments can live on either the action entry or the target entry.
       Find which one owns this comment so edit/delete target the right
       portWeightHistory row. */
    if (actionEntry && (actionEntry.comments || []).some(function (cm) { return cm.id === commentId; })) return actionEntry.id;
    if (targetEntry && (targetEntry.comments || []).some(function (cm) { return cm.id === commentId; })) return targetEntry.id;
    return null;
  }
  function startEdit(cm) {
    setEditingCommentId(cm.id);
    setEditingText(cm.text);
  }
  function saveEdit() {
    if (!editingCommentId || !editingText.trim()) return;
    var eid = findEntryIdForComment(editingCommentId);
    if (eid) onEditComment(company.id, eid, editingCommentId, editingText);
    setEditingCommentId(null);
    setEditingText("");
  }
  function deleteComment(cm) {
    if (typeof window !== "undefined" && window.confirm && !window.confirm("Delete this comment? This cannot be undone.")) return;
    var eid = findEntryIdForComment(cm.id);
    if (eid) onDeleteComment(company.id, eid, cm.id);
  }
  return (
    <div className="py-1 border-b border-amber-100 dark:border-amber-900/40 last:border-b-0">
      <div className="flex items-start gap-2 text-xs">
        {authorColor && (
          <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: authorColor }} title={authors.join(", ")} />
        )}
        {actionEntry && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white shrink-0 mt-0.5"
            style={{ background: actionColor || "#64748b" }}
            title={"Proposed " + actionEntry.action}
          >{actionEntry.action}</span>
        )}
        {!actionEntry && tgtBadge && (
          /* Allocation-change badge: ▲ green for increase, ▼ red for
             decrease, ▬ gray for unchanged. Same geometry as the
             B/A/P/S pill so the row layout stays uniform across the
             two groups. */
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white shrink-0 mt-0.5"
            style={{ background: tgtBadge.color }}
            title={tgtBadge.title}
          >{tgtBadge.glyph} TGT</span>
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-medium text-gray-900 dark:text-slate-100">
            {heldTicker}
            <span className="text-gray-500 dark:text-slate-400 font-normal ml-1.5">{company.name || ""}</span>
          </span>
          {weightStr && !editableTo && (
            <span className="font-mono text-amber-800 dark:text-amber-300 text-[11px]">{weightStr}</span>
          )}
          {editableTo && (
            <span className="font-mono text-amber-800 dark:text-amber-300 text-[11px]">
              {fromStr}
              {" → "}
              <input
                type="number"
                step="0.01"
                min="0"
                value={toDraft}
                onChange={function(e){ setToDraft(e.target.value); }}
                onBlur={commitTo}
                onKeyDown={function(e){ if (e.key === "Enter") { e.currentTarget.blur(); } else if (e.key === "Escape") { setToDraft(initialTo.toFixed(2)); e.currentTarget.blur(); } }}
                className="font-mono text-amber-800 dark:text-amber-300 text-[11px] bg-transparent border-b border-dashed border-amber-400 dark:border-amber-600 focus:border-solid focus:border-amber-600 dark:focus:border-amber-400 focus:outline-none w-12 text-right px-0.5"
                title="Edit the displayed 'to' weight for this Pare/Add. Does not change the committed target."
              />
              %
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-400 dark:text-slate-500 shrink-0 mt-0.5 text-right">
          <div>
            {authors.length > 0 && <span className="mr-2">{authors.join(", ")}</span>}
            {fmtDateUS(date)}
          </div>
          <button
            onClick={function () { setShowComment(!showComment); }}
            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer text-[10px] mt-0.5"
            title="Add a comment to this proposal"
          >
            💬 {comments.length > 0 ? "Comment (" + comments.length + ")" : "Comment"}
          </button>
        </div>
      </div>
      {/* Existing comments — always visible when present. Each
          comment shows author + date + body. The comment's own author
          gets inline Edit / Delete controls; others see read-only. */}
      {comments.length > 0 && (
        <div className="ml-6 mt-1 space-y-0.5 pl-2 border-l-2 border-amber-200 dark:border-amber-800">
          {comments.map(function (cm) {
            var cmColor = TEAM_COLORS[cm.author] || "#94a3b8";
            var isMine = cm.author === currentUser;
            var isEditing = editingCommentId === cm.id;
            return (
              <div key={cm.id} className="text-[11px] group/cm">
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: cmColor }} />
                <span className="font-semibold text-gray-700 dark:text-slate-300">{cm.author}</span>
                <span className="text-gray-400 dark:text-slate-500 text-[9px] ml-1.5">{fmtDateUS(cm.date)}</span>
                {cm.editedAt && (
                  <span className="text-gray-400 dark:text-slate-500 text-[9px] ml-1 italic" title={"Edited " + cm.editedAt}>(edited)</span>
                )}
                {isMine && !isEditing && (
                  <span className="ml-2 text-[9px] opacity-0 group-hover/cm:opacity-100 transition-opacity">
                    <button
                      onClick={function () { startEdit(cm); }}
                      className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer mr-1.5"
                      title="Edit this comment"
                    >Edit</button>
                    <button
                      onClick={function () { deleteComment(cm); }}
                      className="text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                      title="Delete this comment"
                    >Delete</button>
                  </span>
                )}
                {isEditing ? (
                  <div className="ml-3 mt-1 flex gap-1 items-start">
                    <textarea
                      value={editingText}
                      onChange={function (e) { setEditingText(e.target.value); }}
                      onKeyDown={function (e) {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
                        if (e.key === "Escape") { setEditingCommentId(null); setEditingText(""); }
                      }}
                      autoFocus
                      rows={2}
                      className="flex-1 text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y leading-snug"
                    />
                    <div className="flex flex-col gap-1">
                      <button onClick={saveEdit} className="text-[10px] px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer">Save</button>
                      <button onClick={function () { setEditingCommentId(null); setEditingText(""); }} className="text-[10px] px-2 py-0.5 border border-slate-200 dark:border-slate-700 rounded cursor-pointer">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="ml-3 text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{cm.text}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Comment composer — toggled by the 💬 button. Posts to the
          targetEntry's id if present, else the actionEntry's id. */}
      {showComment && commentTargetId && (
        <div className="ml-6 mt-1 flex gap-1 items-start">
          {/* textarea so long comments wrap to multiple lines rather
              than scrolling sideways in a one-line input. Cmd/Ctrl+Enter
              posts; bare Enter inserts a newline (standard textarea
              behavior). Esc cancels. */}
          <textarea
            value={commentText}
            onChange={function (e) { setCommentText(e.target.value); }}
            onKeyDown={function (e) {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); postComment(); }
              if (e.key === "Escape") { setShowComment(false); setCommentText(""); }
            }}
            placeholder="Your comment (visible to all teammates)… Cmd/Ctrl+Enter to post."
            autoFocus
            rows={2}
            className="flex-1 text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y leading-snug"
          />
          <div className="flex flex-col gap-1">
            <button onClick={postComment} className="text-[11px] px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer">Post</button>
            <button onClick={function () { setShowComment(false); setCommentText(""); }} className="text-[11px] px-2 py-0.5 border border-slate-200 dark:border-slate-700 rounded cursor-pointer">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== GENERATE TAB ===== */

function GenerateView({ memo, copied, onCopy, onClear, onDiscard, hasPending, profilePorts, profile, snapshotActive, onRegenerate }) {
  /* Button labels include the active profile's ports so it's always
     unambiguous what gets cleared — Tue clears FIN/IN/FGL/GL, Thu
     clears EM/SC. Same buttons on either tab; only the scope label
     changes. Discard button is ALWAYS rendered (just disabled when
     nothing's pending) so it's discoverable on both profiles even
     when one happens to have an empty agenda. */
  var portsLabel = (profilePorts || []).join(" / ") || (profile === "thursday" ? "EM / SC" : "FIN / IN / FGL / GL");
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={onCopy} className={BTN_PRIMARY}>{copied ? "✓ Copied" : "Copy to clipboard"}</button>
        <button onClick={onClear} className="text-xs px-3 py-1.5 font-medium bg-emerald-600 text-white rounded-md cursor-pointer hover:bg-emerald-700 transition-colors" title={"Commit every pending target % proposal on " + portsLabel + " to the live portfolio, flip B/A/P/S trades to executed, AND save this memo to the Log tab — all in one click. Replaces the old two-step (Lock in → Mark executed + log) workflow."}>
          ✓ Commit &amp; log ({portsLabel})
        </button>
        {/* Discard-only path — always rendered, disabled state when
            no pending entries on this profile. Removes pending agenda
            items without committing or saving a memo. */}
        <button
          onClick={hasPending ? onDiscard : undefined}
          disabled={!hasPending}
          className={"text-xs px-3 py-1.5 font-medium rounded-md border transition-colors " + (hasPending
            ? "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/40"
            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed")}
          title={hasPending
            ? "DELETE all pending agenda entries (target % proposals + B/A/P/S trades) on " + portsLabel + ". Does NOT save a memo, does NOT commit. CASH is restored."
            : "No pending entries on " + portsLabel + " to clear."}
        >
          Clear agenda ({portsLabel})
        </button>
      </div>
      <textarea
        value={memo}
        readOnly
        rows={20}
        onClick={function (e) { e.target.select(); }}
        className="w-full text-xs font-mono px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 leading-relaxed resize-y"
      />
      {snapshotActive && (
        <div className="mt-2 px-2.5 py-1.5 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-amber-800 dark:text-amber-300">📸 Showing snapshot captured at lock-in — protected from being wiped by the commit.</span>
          <button onClick={onRegenerate} className="text-[10px] px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer ml-auto">Regenerate from live</button>
        </div>
      )}
      <div className="text-[11px] text-gray-400 dark:text-slate-500 italic mt-2">
        <b>Commit &amp; log</b> commits every pending target % proposal + B/A/P/S trade on this meeting's ports AND saves this memo to the Log tab. <b>Clear agenda</b> discards pending entries without committing or logging. The memo is captured as a snapshot before commit so the text doesn't evaporate the moment isAgenda flips.
      </div>
    </div>
  );
}

/* ===== WEDNESDAY NOTES (free-form composer) ===== */

function WednesdayNotesView({ text, setText, copied, onCopy, onSaveToLog }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">📝 Wednesday Notes</span>
        <span className="text-[11px] text-gray-500 dark:text-slate-400">
          Free-form agenda + notes. No auto-build from portfolios. Click "Save to log" to archive in the Log tab.
        </span>
      </div>
      <textarea
        value={text}
        onChange={function (e) { setText(e.target.value); }}
        rows={22}
        placeholder="Agenda items, meeting notes, action items, follow-ups, anything..."
        className="w-full text-xs font-mono px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 leading-relaxed resize-y focus:ring-2 focus:ring-blue-500 focus:outline-none"
      />
      <div className="flex gap-2 items-center mt-2 flex-wrap">
        <button
          onClick={onCopy}
          disabled={!text || !text.trim()}
          className={"text-xs px-3 py-1.5 font-medium rounded-md transition-colors " + (text && text.trim()
            ? "bg-blue-600 text-white border-none cursor-pointer hover:bg-blue-700"
            : "bg-slate-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 border-none cursor-not-allowed")}
        >{copied ? "✓ Copied" : "Copy to clipboard"}</button>
        <button
          onClick={onSaveToLog}
          disabled={!text || !text.trim()}
          className={"text-xs px-3 py-1.5 font-semibold rounded-md transition-colors " + (text && text.trim()
            ? "bg-emerald-600 text-white border-none cursor-pointer hover:bg-emerald-700"
            : "bg-slate-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 border-none cursor-not-allowed")}
          title="Append these notes to the Log tab and clear the composer for the next meeting"
        >💾 Save to log</button>
        <span className="text-[10px] text-gray-400 dark:text-slate-500 italic ml-2">
          Auto-saved to Supabase as you type (~500ms debounce) — everyone sees the same notes. Hit Save to log when finalized to archive a snapshot in the Log tab and clear the working area for the next meeting.
        </span>
      </div>
    </div>
  );
}

/* ===== LOG TAB ===== */

function LogTab({ entries, expandedId, onToggle, onDelete, onRevert }) {
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
          : e.profile === "wednesday"
          ? "Wednesday (Notes)"
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
              {/* Revert lock-in — flips committed entries back to
                  pending so the IC can finish editing if the meeting
                  was logged too early. Only meaningful for Tuesday /
                  Thursday (Wednesday has no associated weight
                  commits). */}
              {e.profile !== "wednesday" && onRevert && (
                <button
                  onClick={function () { onRevert(e.id); }}
                  className="text-xs px-2 py-0.5 rounded text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 cursor-pointer"
                  title="Undo this lock-in — restores agenda items and deletes the log"
                >
                  ↶ Revert
                </button>
              )}
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
