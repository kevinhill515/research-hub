/* PM Meeting Memo modal.
 *
 * Three tabs:
 *   - Agenda: pre-meeting collaboration surface. Users propose trades
 *     (ticker + portfolio + B/A/P/S action + optional target weight +
 *     rationale), other users reply / react, and one teammate
 *     "Promotes to agenda" — which calls markTradeAgenda +
 *     updateTargetWeight under the hood so the existing B/A/P/S
 *     highlight on PortfolioRow and the Generate tab's memo pick the
 *     change up automatically. Also surfaces Recent Target Changes
 *     (portWeightHistory entries from the last 6 days) with a per-user
 *     "Seen" acknowledgment.
 *   - Generate: auto-built compliance memo from portWeightHistory +
 *     tpHistory. Unchanged from before.
 *   - Log: history of every memo distributed via "Clear agenda".
 *
 * Memo content is built by utils/meetingMemo.js — the new Agenda tab
 * sits ABOVE that path; promotions just call the same functions the
 * old B/A/P/S buttons did, so the memo generator needs no changes.
 */
import { useState, useMemo } from "react";
import { useCompanyContext } from "../../context/CompanyContext.jsx";
import { buildMeetingMemo, clearAgendaFlags, MEETING_PROFILES } from "../../utils/meetingMemo.js";
import { TEAM_COLORS } from "../../constants/index.js";

const BTN_PRIMARY = "text-xs px-3 py-1.5 font-medium bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 transition-colors";
const BTN_GHOST = "text-xs px-3 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
const BTN_GREEN = "text-xs px-3 py-1.5 font-medium bg-emerald-600 text-white rounded-md cursor-pointer hover:bg-emerald-700 transition-colors";
const INP = "text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none";

/* Action → color, matching the B/A/P/S button colors on PortfolioRow
   so the same proposed action reads the same way across surfaces. */
const ACTION_COLORS = {
  Buy:  { bg: "#16a34a", text: "#ffffff", label: "B" },
  Add:  { bg: "#0891b2", text: "#ffffff", label: "A" },
  Pare: { bg: "#d97706", text: "#ffffff", label: "P" },
  Sell: { bg: "#dc2626", text: "#ffffff", label: "S" },
};

const RECENT_CHANGE_DAYS = 6; /* matches RECENT_DAYS in meetingMemo.js */

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
  var ms = Date.now() - d.getTime();
  return Math.floor(ms / 86400000);
}

export function MeetingMemoModal({ open, onClose }) {
  const {
    companies, setCompanies, repData, currentUser,
    memoLog, addMemoLog, deleteMemoLog,
    meetingProposals,
    addMeetingProposal, replyToMeetingProposal, reactToMeetingProposal,
    withdrawMeetingProposal, promoteMeetingProposal, deleteMeetingProposal,
    markMeetingProposalRead,
    targetChangeReads, markTargetChangeRead,
  } = useCompanyContext();
  const [tab, setTab] = useState("agenda"); /* "agenda" | "generate" | "log" */
  const [profile, setProfile] = useState("tuesday"); /* "tuesday" | "thursday" */
  const [copied, setCopied] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);

  if (!open) return null;

  function close() { setCopied(false); setExpandedLogId(null); onClose(); }

  const memo = profile ? buildMeetingMemo(companies, profile, repData) : "";

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

  const logEntries = memoLog || [];
  const allProposals = meetingProposals || [];

  /* Pending proposals scoped to the current meeting profile's ports.
     Withdrawn / promoted entries are pushed to the bottom — useful for
     reference but visually de-emphasized. */
  const profilePorts = (MEETING_PROFILES[profile] && MEETING_PROFILES[profile].ports) || [];
  const scopedProposals = useMemo(function () {
    var inScope = allProposals.filter(function (p) {
      return profilePorts.indexOf(p.portfolio) >= 0;
    });
    /* Sort: pending first (newest first within), then promoted, then withdrawn. */
    inScope.sort(function (a, b) {
      var rank = { pending: 0, promoted: 1, withdrawn: 2 };
      var ra = rank[a.status] != null ? rank[a.status] : 3;
      var rb = rank[b.status] != null ? rank[b.status] : 3;
      if (ra !== rb) return ra - rb;
      return (b.suggestedAt || "").localeCompare(a.suggestedAt || "");
    });
    return inScope;
  }, [allProposals, profilePorts.join(",")]);

  /* Pending count across all profiles — used for the Agenda tab badge. */
  const totalPendingCount = allProposals.filter(function (p) { return p.status === "pending"; }).length;

  /* Recent target weight changes, scoped to the current meeting's
     ports, from the last RECENT_CHANGE_DAYS. Reads each company's
     portWeightHistory; only NON-agenda entries (the executed /
     committed target moves, not pending B/A/P/S stamps). */
  const recentChanges = useMemo(function () {
    var out = [];
    (companies || []).forEach(function (c) {
      var hist = c.portWeightHistory || [];
      hist.forEach(function (h, idx) {
        if (!h || h.isAgenda) return;
        if (profilePorts.indexOf(h.portfolio) < 0) return;
        if (daysAgo(h.date) > RECENT_CHANGE_DAYS) return;
        /* Synthetic stable key per (company, portfolio, date, value) tuple.
           Used as the readBy bucket — works even when history entries lack
           explicit ids. */
        var key = h.id || (c.id + "|" + h.portfolio + "|" + h.date + "|" + (h.newWeight != null ? h.newWeight : h.weight));
        out.push({
          key: key,
          companyId: c.id,
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
  }, [companies, profilePorts.join(",")]);

  const unseenChangeCount = recentChanges.filter(function (rc) {
    return !((targetChangeReads || {})[rc.key] || []).includes(currentUser);
  }).length;

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
          {/* Profile picker — global to the modal so switching tabs keeps
              the same scope. Always visible. */}
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
            <AgendaTab
              profile={profile}
              scopedProposals={scopedProposals}
              recentChanges={recentChanges}
              targetChangeReads={targetChangeReads || {}}
              currentUser={currentUser}
              companies={companies}
              onAdd={addMeetingProposal}
              onReply={replyToMeetingProposal}
              onReact={reactToMeetingProposal}
              onWithdraw={withdrawMeetingProposal}
              onPromote={promoteMeetingProposal}
              onDelete={deleteMeetingProposal}
              onMarkRead={markMeetingProposalRead}
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

/* ===== AGENDA TAB ===== */

function AgendaTab({ profile, scopedProposals, recentChanges, targetChangeReads, currentUser, companies, onAdd, onReply, onReact, onWithdraw, onPromote, onDelete, onMarkRead, onMarkTargetRead }) {
  const [showComposer, setShowComposer] = useState(false);
  const ports = (MEETING_PROFILES[profile] && MEETING_PROFILES[profile].ports) || [];

  return (
    <div className="space-y-5">
      {/* Section A — Proposed Trades */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Proposed Trades</div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400">
              Pre-meeting ideas for {ports.join(" / ")}. Promote one to drop it into the live B/A/P/S agenda.
            </div>
          </div>
          <button onClick={function () { setShowComposer(!showComposer); }} className={BTN_PRIMARY}>
            {showComposer ? "Cancel" : "+ Propose trade"}
          </button>
        </div>
        {showComposer && (
          <ProposalComposer
            ports={ports}
            companies={companies || []}
            onSubmit={function (payload) {
              onAdd(payload);
              setShowComposer(false);
            }}
            onCancel={function () { setShowComposer(false); }}
          />
        )}
        {scopedProposals.length === 0 && !showComposer && (
          <div className="text-sm text-gray-500 dark:text-slate-400 italic py-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-md">
            No proposals yet for this meeting. Click <b>+ Propose trade</b> to add the first one.
          </div>
        )}
        <div className="space-y-2 mt-2">
          {scopedProposals.map(function (p) {
            return (
              <ProposalCard
                key={p.id}
                proposal={p}
                currentUser={currentUser}
                onReply={onReply}
                onReact={onReact}
                onWithdraw={onWithdraw}
                onPromote={onPromote}
                onDelete={onDelete}
                onMarkRead={onMarkRead}
              />
            );
          })}
        </div>
      </div>

      {/* Section B — Recent Target Changes */}
      <div>
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Recent Target Changes (last {RECENT_CHANGE_DAYS} days)</div>
        <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">
          Committed target-weight moves on {ports.join(" / ")}. Click ⏳ to mark as seen — once everyone has acknowledged, the row goes quiet.
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

/* ===== PROPOSAL COMPOSER ===== */

function ProposalComposer({ ports, companies, onSubmit, onCancel }) {
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [ticker, setTicker] = useState("");
  const [portfolio, setPortfolio] = useState(ports[0] || "");
  const [action, setAction] = useState("Buy");
  const [proposedWeight, setProposedWeight] = useState("");
  const [rationale, setRationale] = useState("");

  /* Company autocomplete — match on name or ticker substring. Capped at
     8 results to keep the dropdown light. */
  const matches = companyQuery.trim()
    ? companies.filter(function (c) {
        var q = companyQuery.toLowerCase();
        return (c.name || "").toLowerCase().includes(q) || (c.ticker || "").toLowerCase().includes(q);
      }).slice(0, 8)
    : [];

  function pickCompany(c) {
    setCompanyId(c.id);
    setTicker(c.ticker || "");
    setCompanyQuery(c.name || c.ticker || "");
  }

  function submit() {
    if (!companyId || !portfolio || !action) return;
    var weight = proposedWeight.trim();
    onSubmit({
      companyId: companyId,
      ticker: ticker,
      portfolio: portfolio,
      action: action,
      proposedWeight: weight !== "" && isFinite(parseFloat(weight)) ? parseFloat(weight) : null,
      rationale: rationale.trim(),
    });
  }

  const canSubmit = !!companyId && !!portfolio && !!action;

  return (
    <div className="mb-3 p-3 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20">
      <div className="text-[11px] font-semibold text-blue-800 dark:text-blue-200 mb-2">New proposal</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
        <div className="relative">
          <label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5">Company</label>
          <input
            value={companyQuery}
            onChange={function (e) { setCompanyQuery(e.target.value); setCompanyId(""); }}
            placeholder="Search by name or ticker"
            className={INP + " w-full box-border"}
          />
          {matches.length > 0 && !companyId && (
            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg">
              {matches.map(function (c) {
                return (
                  <div
                    key={c.id}
                    onClick={function () { pickCompany(c); }}
                    className="px-2 py-1 text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/40"
                  >
                    <span className="font-medium text-gray-900 dark:text-slate-100">{c.name || "?"}</span>
                    <span className="text-gray-500 dark:text-slate-400 ml-2 text-[10px]">{c.ticker || ""}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5">Portfolio</label>
          <select value={portfolio} onChange={function (e) { setPortfolio(e.target.value); }} className={INP + " w-full"}>
            {ports.map(function (p) { return <option key={p} value={p}>{p}</option>; })}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5">Action</label>
          <div className="flex gap-1">
            {["Buy", "Add", "Pare", "Sell"].map(function (a) {
              var c = ACTION_COLORS[a];
              var active = action === a;
              return (
                <button
                  key={a}
                  onClick={function () { setAction(a); }}
                  className={"text-[11px] px-2 py-1 rounded-md font-bold cursor-pointer transition " + (active ? "" : "opacity-50 hover:opacity-100")}
                  style={{ background: c.bg, color: c.text }}
                >{a}</button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5">Proposed target % (optional)</label>
          <input
            type="number"
            step="0.01"
            value={proposedWeight}
            onChange={function (e) { setProposedWeight(e.target.value); }}
            placeholder="e.g. 2.5"
            className={INP + " w-full box-border"}
          />
        </div>
      </div>
      <div className="mb-2">
        <label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5">Rationale</label>
        <textarea
          value={rationale}
          onChange={function (e) { setRationale(e.target.value); }}
          rows={3}
          placeholder="Why this trade? (optional)"
          className={INP + " w-full box-border resize-y"}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={!canSubmit} className={canSubmit ? BTN_PRIMARY : (BTN_PRIMARY + " opacity-50 cursor-not-allowed")}>Submit proposal</button>
        <button onClick={onCancel} className={BTN_GHOST}>Cancel</button>
      </div>
    </div>
  );
}

/* ===== PROPOSAL CARD ===== */

function ProposalCard({ proposal, currentUser, onReply, onReact, onWithdraw, onPromote, onDelete, onMarkRead }) {
  const [replyText, setReplyText] = useState("");
  const [showReplyBox, setShowReplyBox] = useState(false);
  const isOwn = proposal.suggestedBy === currentUser;
  const isUnread = !(proposal.readBy || []).includes(currentUser);
  const action = ACTION_COLORS[proposal.action] || ACTION_COLORS.Buy;

  /* Mark this proposal read on first interaction (open / click). Cheap
     and matches the tpApprovals pattern. */
  function maybeMarkRead() {
    if (isUnread && currentUser) onMarkRead(proposal.id);
  }

  const authorColor = TEAM_COLORS[proposal.suggestedBy] || "#6b7280";

  /* Reactions bucketed by emoji for compact display. */
  const reactions = proposal.reactions || {};
  const reactionBuckets = {};
  Object.keys(reactions).forEach(function (user) {
    var e = reactions[user];
    if (!reactionBuckets[e]) reactionBuckets[e] = [];
    reactionBuckets[e].push(user);
  });

  const statusBadge = proposal.status === "promoted" ? (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">
      ✓ On agenda{proposal.promotedBy ? " · " + proposal.promotedBy : ""}
    </span>
  ) : proposal.status === "withdrawn" ? (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">Withdrawn</span>
  ) : (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold">⏳ Pending</span>
  );

  const tileBorder = proposal.status === "pending"
    ? (isUnread ? "border-2 border-amber-400 dark:border-amber-600" : "border border-amber-200 dark:border-amber-800")
    : "border border-slate-200 dark:border-slate-700 opacity-80";

  /* No-engagement nudge — the "let someone else weigh in" social signal.
     Surfaces inline next to the Promote button when nobody has replied
     or reacted to a pending proposal. */
  const totalReactions = Object.keys(reactions).length;
  const totalReplies = (proposal.replies || []).length;
  const noEngagement = proposal.status === "pending" && totalReactions === 0 && totalReplies === 0;

  return (
    <div className={"rounded-lg p-3 " + tileBorder + " bg-white dark:bg-slate-900"} onClick={maybeMarkRead}>
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="w-2 h-2 rounded-full" style={{ background: authorColor }} />
        <span className="text-xs font-semibold text-gray-900 dark:text-slate-100">{proposal.suggestedBy || "?"}</span>
        <span className="text-[10px] text-gray-500 dark:text-slate-400">{proposal.suggestedAt || ""}</span>
        <span className="text-[10px] text-gray-300 dark:text-slate-600">·</span>
        <span
          className="text-[10px] px-2 py-0.5 rounded font-bold"
          style={{ background: action.bg, color: action.text }}
          title={proposal.action}
        >{action.label} {proposal.action}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{proposal.ticker || "?"}</span>
        <span className="text-xs text-gray-500 dark:text-slate-400">· {proposal.portfolio}</span>
        {proposal.proposedWeight != null && (
          <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">→ target {fmtPct(proposal.proposedWeight)}</span>
        )}
        <span className="ml-auto">{statusBadge}</span>
      </div>
      {proposal.rationale && (
        <div className="text-xs text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed mb-2 px-1">
          {proposal.rationale}
        </div>
      )}
      {/* Replies */}
      {(proposal.replies || []).length > 0 && (
        <div className="space-y-1 mb-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700">
          {proposal.replies.map(function (r) {
            return (
              <div key={r.id} className="text-xs">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-1.5 align-middle" style={{ background: TEAM_COLORS[r.author] || "#94a3b8" }} />
                <span className="font-semibold text-gray-900 dark:text-slate-100">{r.author}</span>
                <span className="text-gray-400 dark:text-slate-500 text-[10px] ml-1.5">{r.date}</span>
                <div className="text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed ml-3.5">{r.text}</div>
              </div>
            );
          })}
        </div>
      )}
      {/* Reactions */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {["👍", "👎", "🤔"].map(function (emoji) {
          var users = reactionBuckets[emoji] || [];
          var mine = users.indexOf(currentUser) >= 0;
          return (
            <button
              key={emoji}
              onClick={function (e) { e.stopPropagation(); onReact(proposal.id, emoji); }}
              className={"text-xs px-2 py-0.5 rounded-full border cursor-pointer transition " + (mine
                ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800")}
              title={users.join(", ") || "React"}
            >
              {emoji}{users.length > 0 ? " " + users.length : ""}
            </button>
          );
        })}
      </div>
      {/* Action row */}
      {proposal.status === "pending" && (
        <div className="flex items-center gap-2 flex-wrap">
          {!showReplyBox ? (
            <button onClick={function (e) { e.stopPropagation(); setShowReplyBox(true); }} className={BTN_GHOST}>Reply</button>
          ) : (
            <div className="flex-1 flex gap-1">
              <input
                value={replyText}
                onChange={function (e) { setReplyText(e.target.value); }}
                placeholder="Your reply…"
                className={INP + " flex-1 min-w-[160px]"}
                onClick={function (e) { e.stopPropagation(); }}
              />
              <button
                onClick={function (e) {
                  e.stopPropagation();
                  if (!replyText.trim()) return;
                  onReply(proposal.id, replyText, []);
                  setReplyText("");
                  setShowReplyBox(false);
                }}
                className={BTN_PRIMARY}
              >Post</button>
              <button onClick={function (e) { e.stopPropagation(); setShowReplyBox(false); setReplyText(""); }} className={BTN_GHOST}>Cancel</button>
            </div>
          )}
          <button
            onClick={function (e) { e.stopPropagation(); onPromote(proposal.id); }}
            className={BTN_GREEN}
            title={noEngagement
              ? "No one has replied or reacted yet — consider waiting for input"
              : "Promote to live B/A/P/S agenda — applies markTradeAgenda and (if a target weight was proposed) updateTargetWeight"}
          >
            Promote to agenda{noEngagement ? " (no input yet)" : ""}
          </button>
          {isOwn && (
            <button onClick={function (e) { e.stopPropagation(); onWithdraw(proposal.id); }} className={BTN_GHOST}>Withdraw</button>
          )}
        </div>
      )}
      {/* Cleanup button for decided records */}
      {proposal.status !== "pending" && isOwn && (
        <div className="flex items-center gap-2">
          <button
            onClick={function (e) {
              e.stopPropagation();
              if (typeof window !== "undefined" && window.confirm && !window.confirm("Delete this proposal? This cannot be undone.")) return;
              onDelete(proposal.id);
            }}
            className="text-[11px] text-red-600 dark:text-red-400 hover:underline cursor-pointer"
          >Delete</button>
        </div>
      )}
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
