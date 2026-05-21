/* TP Approvals Panel.
 *
 * Sibling to DiscussionsPanel — opens from the top-bar button and lists
 * suggested TP changes pending review across the entire firm. Mirrors
 * the Discussions UX so teammates have a single place to scan for
 * "things waiting on me" rather than hunting through Dashboard subtabs.
 *
 * Tabs:
 *   - Pending: every suggestion with status==="pending". Approve/Reject
 *     buttons appear only when currentUser ≠ suggestedBy (enforced again
 *     in the context helpers as a hard guard).
 *   - Decided: approved + rejected, last 90 days, for audit trail.
 *
 * Approving writes the new PE / EPS to the company's valuation, pushes
 * a new tpHistory entry (with both `by` and `approvedBy`), and auto-
 * rejects any sibling pending records on the same company. Rejecting
 * takes an optional reason — the suggester can edit + resubmit if needed.
 */
import { useState, useMemo, useEffect } from "react";
import { TEAM_COLORS } from "../../constants/index.js";
import { useCompanyContext } from "../../context/CompanyContext.jsx";
import { ccyPrefix, calcMOS } from "../../utils/index.js";

const BTN_PRIMARY = "text-xs px-3 py-1 font-medium bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 transition-colors";
const BTN_DANGER  = "text-xs px-3 py-1 font-medium bg-rose-600 text-white rounded-md cursor-pointer hover:bg-rose-700 transition-colors";
const BTN_GHOST   = "text-xs px-3 py-1 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";

function fmtNum(v, dp){
  if(v===null||v===undefined||v==="") return "—";
  var n=parseFloat(v);
  if(!isFinite(n)) return "—";
  return n.toFixed(dp===undefined?2:dp);
}

function ApprovalCard({ rec, company, companyName, onApprove, onReject, onWithdraw, onNavigate }){
  var { currentUser, markTpApprovalRead } = useCompanyContext();
  var [showReject, setShowReject] = useState(false);
  var [rejectReason, setRejectReason] = useState("");
  var isOwnSuggestion = rec.suggestedBy === currentUser;
  var isUnread = !(rec.readBy || []).includes(currentUser);

  useEffect(function(){
    if(isUnread && currentUser) markTpApprovalRead(rec.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.id]);

  var authorColor = TEAM_COLORS[rec.suggestedBy] || "#6b7280";

  /* Compute a tidy change-summary line. Show only the fields that
     actually changed (e.g. an EPS-only revision shouldn't print "PE
     12.0 → 12.0"). Newer records carry the full breakdown
     (EPS1/EPS2/W1/W2) — older records only have a single EPS field. */
  function diff(a,b){return a!==b&&!(a==null&&b==null);}
  var changes = [];
  if(diff(rec.fromPE, rec.toPE)) changes.push("PE " + fmtNum(rec.fromPE,1) + " → " + fmtNum(rec.toPE,1));
  if(diff(rec.fromEPS1, rec.toEPS1)) changes.push("EPS1 " + fmtNum(rec.fromEPS1,2) + " → " + fmtNum(rec.toEPS1,2));
  if(diff(rec.fromEPS2, rec.toEPS2)) changes.push("EPS2 " + fmtNum(rec.fromEPS2,2) + " → " + fmtNum(rec.toEPS2,2));
  if(diff(rec.fromW1, rec.toW1) || diff(rec.fromW2, rec.toW2)){
    /* Include the FY labels (snapshotted on submission, e.g. "FY26/FY27")
       so the reader doesn't have to remember which weight is which. */
    var fyTag = (rec.fy1 || rec.fy2) ? " (" + (rec.fy1 || "FY1") + "/" + (rec.fy2 || "FY2") + ")" : "";
    changes.push("Weights" + fyTag + " " + fmtNum(rec.fromW1,0) + "/" + fmtNum(rec.fromW2,0) + " → " + fmtNum(rec.toW1,0) + "/" + fmtNum(rec.toW2,0));
  }
  /* Fallback for legacy records (pre-breakdown), which only had a
     blended EPS field. */
  if(rec.fromEPS1==null && rec.toEPS1==null && diff(rec.fromEPS, rec.toEPS)){
    changes.push("EPS " + fmtNum(rec.fromEPS,2) + " → " + fmtNum(rec.toEPS,2));
  }
  /* Pull currency + most-recent ord-ticker price from the live company.
     Lets us prefix TPs with the currency symbol and show what the
     proposed TP implies for MOS at today's price. Falls back gracefully
     when company isn't found (legacy records, deleted companies). */
  var v = (company && company.valuation) || {};
  var ord = ((company && company.tickers) || []).find(function(t){return t.isOrdinary;}) || ((company && company.tickers) || [])[0] || null;
  var currentPrice = ord && ord.price !== undefined && ord.price !== "" ? parseFloat(ord.price) : parseFloat(v.price);
  var ccy = (ord && ord.currency) || v.currency || "USD";
  var pfx = ccyPrefix(ccy);
  /* TP Fixed row. rec.toTP is what gets written to
     company.valuation.tpFixed on approve — for new records that's the
     suggester's PROPOSED value (clean round number), and PE × normEPS
     is saved separately as rec.computedTP for sanity. Old records
     stored the computed value as rec.toTP and the proposed value as
     rec.proposedTP — we handle both shapes here so the card reads
     correctly regardless of when the record was submitted. */
  var tpLabel = "TP Fixed " + pfx + fmtNum(rec.fromTP,2) + " → " + pfx + fmtNum(rec.toTP,2);
  if(rec.computedTP != null && isFinite(rec.computedTP) && rec.toTP != null
      && Math.abs(rec.computedTP - rec.toTP) > 0.01){
    /* New format: toTP is the proposed/official value; computedTP is the
       PE × normEPS math, surfaced when it diverges from the proposed. */
    tpLabel += " (PE × EPS = " + pfx + fmtNum(rec.computedTP,2) + ")";
  } else if(rec.proposedTP != null && isFinite(rec.proposedTP) && rec.toTP != null
      && Math.abs(rec.proposedTP - rec.toTP) > 0.01){
    /* Old format: toTP is the computed value; proposedTP is the suggester's
       typed New TP. Kept so existing pending records still render meaningfully. */
    tpLabel += " (computed; proposed " + pfx + fmtNum(rec.proposedTP,2) + ")";
  }
  /* New MOS at today's price using the proposed TP — answers the
     approver's natural question "if I approve, what's the new MOS?"
     We use calcMOS the same way the Valuation card does. Only show
     when we have both a price and a toTP. */
  if(isFinite(currentPrice) && currentPrice > 0 && rec.toTP != null && isFinite(rec.toTP) && rec.toTP > 0){
    var newMOS = calcMOS(rec.toTP, currentPrice);
    if(newMOS !== null){
      var sign = newMOS >= 0 ? "+" : "";
      /* Explicitly label "price" so this isn't mistaken for an old TP
         value — the @-clause is the current stock price used to compute
         the new MOS, not a TP reference. */
      tpLabel += "  ·  New MOS " + sign + newMOS.toFixed(1) + "% at price " + pfx + fmtNum(currentPrice,2);
    }
  }
  changes.push(tpLabel);

  var statusBadge;
  if(rec.status === "approved"){
    statusBadge = <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">✓ Approved by {rec.approvedBy}</span>;
  } else if(rec.status === "rejected"){
    statusBadge = <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-semibold">✗ Rejected by {rec.rejectedBy}</span>;
  } else {
    statusBadge = <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold">Pending</span>;
  }

  /* TP direction → tile border color. Green for an increase, red for a
     decrease — gives a glance-level read of whether each suggestion is
     a TP raise or cut without parsing the From/To numbers. Falls back
     to the previous neutral border colors when both TPs aren't parseable
     or are equal (within a penny). */
  var fromTPNum = parseFloat(rec.fromTP);
  var toTPNum = parseFloat(rec.toTP);
  var tpDirection = null; /* "up" | "down" | null */
  if(isFinite(fromTPNum) && isFinite(toTPNum) && Math.abs(toTPNum - fromTPNum) > 0.005){
    tpDirection = toTPNum > fromTPNum ? "up" : "down";
  }
  var tileBorder;
  if(tpDirection === "up"){
    tileBorder = "border-2 border-emerald-500 dark:border-emerald-500";
  } else if(tpDirection === "down"){
    tileBorder = "border-2 border-rose-500 dark:border-rose-500";
  } else if(rec.status === "pending"){
    tileBorder = "border border-amber-200 dark:border-amber-800";
  } else {
    tileBorder = "border border-slate-200 dark:border-slate-700";
  }
  var tileBg = rec.status === "pending"
    ? "bg-white dark:bg-slate-900"
    : "bg-slate-50 dark:bg-slate-800/50 opacity-80";

  return (
    <div className={"rounded-lg p-3 mb-2 " + tileBorder + " " + tileBg}>
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="w-2 h-2 rounded-full" style={{background: authorColor}}/>
        <span className="text-xs font-semibold text-gray-900 dark:text-slate-100">{rec.suggestedBy}</span>
        <span className="text-[10px] text-gray-500 dark:text-slate-400">{rec.suggestedAt}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">· {companyName}</span>
        <span className="ml-auto">{statusBadge}</span>
        {/* Withdraw button — only on your OWN pending records. Distinct
            from Reject (which is for peers); withdrawing leaves a clear
            audit reason rather than looking like a peer turn-down. */}
        {rec.status === "pending" && isOwnSuggestion && (
          <button
            onClick={function(){onWithdraw(rec.id);}}
            title="Withdraw this suggestion"
            aria-label="Withdraw suggestion"
            className="text-xs text-gray-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer px-1 leading-none"
          >✕</button>
        )}
      </div>
      <div className="text-xs font-mono text-gray-700 dark:text-slate-300 mb-1.5">{changes.join("  ·  ")}</div>
      {rec.rationale && (
        <div className="text-xs text-gray-600 dark:text-slate-400 mb-2 whitespace-pre-wrap leading-relaxed">{rec.rationale}</div>
      )}
      {rec.earningsEntryId && onNavigate && (
        <div className="mb-2">
          <button
            onClick={function(){onNavigate(rec.companyId, rec.earningsEntryId);}}
            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer bg-transparent border-none p-0"
          >
            → View source earnings entry
          </button>
        </div>
      )}
      {rec.status === "rejected" && rec.rejectReason && (
        <div className="text-[11px] italic text-rose-700 dark:text-rose-300 mb-2">Rejection note: {rec.rejectReason}</div>
      )}
      {rec.status === "pending" && (
        isOwnSuggestion ? (
          <div className="text-[11px] italic text-gray-500 dark:text-slate-400">Waiting for another teammate to review.</div>
        ) : (
          <div className="flex gap-2 items-center flex-wrap">
            {!showReject ? (
              <>
                <button onClick={function(){onApprove(rec.id);}} className={BTN_PRIMARY}>Approve</button>
                <button onClick={function(){setShowReject(true);}} className={BTN_DANGER}>Reject…</button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={function(e){setRejectReason(e.target.value);}}
                  placeholder="Reason (optional)"
                  className="flex-1 min-w-[160px] text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
                <button onClick={function(){onReject(rec.id, rejectReason); setShowReject(false); setRejectReason("");}} className={BTN_DANGER}>Reject</button>
                <button onClick={function(){setShowReject(false); setRejectReason("");}} className={BTN_GHOST}>Cancel</button>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}

export function TpApprovalsPanel({ open, onClose, onNavigate }){
  var { tpApprovals, companies, approveTpApproval, rejectTpApproval, withdrawTpApproval } = useCompanyContext();
  var [view, setView] = useState("pending"); /* "pending" | "decided" */

  /* Lookup the full company by id. Used by ApprovalCard to display the
     name, derive the current ord-ticker price, and pick the currency
     for the TP prefix. Done once per render. */
  var coById = useMemo(function(){
    var m={};
    (companies||[]).forEach(function(c){m[c.id]=c;});
    return m;
  }, [companies]);

  var sorted = useMemo(function(){
    var list = (tpApprovals||[]).slice();
    list.sort(function(a,b){return (b.suggestedAt||"").localeCompare(a.suggestedAt||"");});
    return list;
  }, [tpApprovals]);

  var pending = sorted.filter(function(r){return r.status === "pending";});
  /* Decided excludes self-withdrawals. New withdraws delete the record
     outright, but records from before that change persist as rejected
     with reason 'Withdrawn by suggester' — filter those out here so the
     Decided list stays focused on genuine peer-rejection / approval audit. */
  var decided = sorted.filter(function(r){
    if(r.status === "pending") return false;
    if(r.status === "rejected" && r.rejectReason === "Withdrawn by suggester") return false;
    return true;
  });

  if(!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[1500] flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={function(e){e.stopPropagation();}} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl my-8 max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <div className="text-base font-semibold text-gray-900 dark:text-slate-100">TP Approvals</div>
          <button onClick={function(){setView("pending");}} className={"text-[11px] px-2.5 py-1 rounded-full border cursor-pointer " + (view==="pending"?"bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 font-semibold":"border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>
            Pending {pending.length>0 && <span className="ml-1">({pending.length})</span>}
          </button>
          <button onClick={function(){setView("decided");}} className={"text-[11px] px-2.5 py-1 rounded-full border cursor-pointer " + (view==="decided"?"bg-slate-200 dark:bg-slate-700 border-slate-400 dark:border-slate-500 text-gray-900 dark:text-slate-100 font-semibold":"border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>
            Decided
          </button>
          <button onClick={onClose} className="ml-auto text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 cursor-pointer">Close ✕</button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {view === "pending" ? (
            pending.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-slate-400 italic text-center py-8">No TP changes pending approval.</div>
            ) : (
              pending.map(function(rec){
                var co = coById[rec.companyId];
                return <ApprovalCard key={rec.id} rec={rec} company={co} companyName={(co && co.name) || "(unknown)"} onApprove={approveTpApproval} onReject={rejectTpApproval} onWithdraw={withdrawTpApproval} onNavigate={onNavigate}/>;
              })
            )
          ) : (
            decided.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-slate-400 italic text-center py-8">No decided TP changes yet.</div>
            ) : (
              decided.map(function(rec){
                var co = coById[rec.companyId];
                return <ApprovalCard key={rec.id} rec={rec} company={co} companyName={(co && co.name) || "(unknown)"} onApprove={approveTpApproval} onReject={rejectTpApproval} onWithdraw={withdrawTpApproval} onNavigate={onNavigate}/>;
              })
            )
          )}
        </div>
      </div>
    </div>
  );
}
