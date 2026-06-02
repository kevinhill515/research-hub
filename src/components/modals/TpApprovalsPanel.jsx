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

/* Two-column Previous / Proposed comparison table. Replaces the old
   "PE 21.0 (unchanged) · EPS1 64.41 → 98.83 · ..." single-line text
   so the change is scannable in one glance. Unchanged rows are dimmed.
   Decimal places per row: PE → 1dp, EPS → 2dp, Weights → 0dp, TP → 2dp.
   Legacy records (pre-breakdown) collapse EPS1/EPS2/Weights into a
   single blended EPS row. */
/* Fiscal-year-end month abbreviation for display alongside non-December
   FY labels. Returns "" for December (the default / no-op) so most US
   companies don't get a noisy "(Dec)" tag they didn't ask for. Returns
   "" when the month isn't a valid 1..12 either, so unset companies fall
   back to a clean label. */
function fyMonthSuffix(fyEndMonth){
  var n = parseInt(fyEndMonth, 10);
  if(!isFinite(n) || n < 1 || n > 12 || n === 12) return "";
  var NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return " (" + NAMES[n - 1] + ")";
}

function ChangeTable({ rec, pfx, fy1, fy2, currentPrice, fyEndMonth }){
  var fyMonthTag = fyMonthSuffix(fyEndMonth);
  var isLegacy = rec.fromEPS1 == null && rec.toEPS1 == null && rec.fromEPS2 == null && rec.toEPS2 == null;
  /* Build the row list with formatted strings + a "changed" flag for
     dimming unchanged rows. Tolerance: same as the form's submission
     check (2% for TP, half a unit for weights, half a tick at the
     row's decimal-place precision for the rest). */
  function changed(a, b, eps){
    if(a == null && b == null) return false;
    if(a == null || b == null) return true;
    return Math.abs(parseFloat(a) - parseFloat(b)) > (eps == null ? 0.005 : eps);
  }
  /* Build each named row into a local first, then assemble the
     final `rows` array in display order at the bottom. Display order
     (per user spec):
       1. TP Fixed   — the headline number the team is voting on.
       2. MOS @ Current — what that TP implies for room-to-run today.
       3. PE         — the multiple used.
       4. EPS FY1
       5. EPS FY2
       6. Normalized EPS
       7. Weights
     Legacy records collapse EPS1/EPS2/Weights/NormEPS into a single
     "EPS (blended)" row that sits in the same slot as Normalized EPS. */
  var peRow = {
    label: "PE",
    from: fmtNum(rec.fromPE, 1),
    to:   fmtNum(rec.toPE,   1),
    fromRaw: rec.fromPE,
    toRaw:   rec.toPE,
    changed: changed(rec.fromPE, rec.toPE, 0.05),
  };
  var legacyEpsRow = null, eps1Row = null, eps2Row = null, weightsRow = null, normEpsRow = null;
  if(isLegacy){
    legacyEpsRow = {
      label: "EPS (blended)",
      from: fmtNum(rec.fromEPS, 2),
      to:   fmtNum(rec.toEPS,   2),
      fromRaw: rec.fromEPS,
      toRaw:   rec.toEPS,
      changed: changed(rec.fromEPS, rec.toEPS, 0.005),
    };
  } else {
    eps1Row = {
      label: "EPS " + (fy1 || "FY1") + fyMonthTag,
      from: fmtNum(rec.fromEPS1, 2),
      to:   fmtNum(rec.toEPS1,   2),
      fromRaw: rec.fromEPS1,
      toRaw:   rec.toEPS1,
      changed: changed(rec.fromEPS1, rec.toEPS1, 0.005),
    };
    eps2Row = {
      label: "EPS " + (fy2 || "FY2") + fyMonthTag,
      from: fmtNum(rec.fromEPS2, 2),
      to:   fmtNum(rec.toEPS2,   2),
      fromRaw: rec.fromEPS2,
      toRaw:   rec.toEPS2,
      changed: changed(rec.fromEPS2, rec.toEPS2, 0.005),
    };
    /* Weights collapsed into one row — W1/W2 always move together,
       "100/0 → 50/50" reads better than two rows. noPctChange flag
       suppresses the % column since weights are reallocation, not
       a magnitude change. */
    var w1Same = !changed(rec.fromW1, rec.toW1, 0.5);
    var w2Same = !changed(rec.fromW2, rec.toW2, 0.5);
    weightsRow = {
      label: "Weights " + (fy1 || "FY1") + "/" + (fy2 || "FY2"),
      from: (rec.fromW1 == null && rec.fromW2 == null) ? "—" : (fmtNum(rec.fromW1, 0) + "/" + fmtNum(rec.fromW2, 0)),
      to:   (rec.toW1   == null && rec.toW2   == null) ? "—" : (fmtNum(rec.toW1,   0) + "/" + fmtNum(rec.toW2,   0)),
      changed: !(w1Same && w2Same),
      noPctChange: true,
    };
    /* Normalized EPS = (EPS1 × W1 + EPS2 × W2) / 100. Prefer the
       stored blend on rec.fromEPS / rec.toEPS (computed at submit
       time); fall back to re-deriving from the components when the
       stored blend is missing (legacy or partial records). */
    function _blend(e1, e2, w1, w2){
      var e1n = parseFloat(e1), e2n = parseFloat(e2);
      var w1n = parseFloat(w1), w2n = parseFloat(w2);
      if(isFinite(e1n) && isFinite(e2n) && isFinite(w1n) && isFinite(w2n)){
        return (e1n*w1n + e2n*w2n) / 100;
      }
      if(isFinite(e1n) && !isFinite(e2n)) return e1n;
      if(isFinite(e2n) && !isFinite(e1n)) return e2n;
      return null;
    }
    var fromNormEPS = (rec.fromEPS != null && isFinite(parseFloat(rec.fromEPS)))
      ? parseFloat(rec.fromEPS)
      : _blend(rec.fromEPS1, rec.fromEPS2, rec.fromW1, rec.fromW2);
    var toNormEPS = (rec.toEPS != null && isFinite(parseFloat(rec.toEPS)))
      ? parseFloat(rec.toEPS)
      : _blend(rec.toEPS1, rec.toEPS2, rec.toW1, rec.toW2);
    normEpsRow = {
      label: "Normalized EPS",
      from: fromNormEPS != null ? fmtNum(fromNormEPS, 2) : "—",
      to:   toNormEPS   != null ? fmtNum(toNormEPS,   2) : "—",
      fromRaw: fromNormEPS,
      toRaw:   toNormEPS,
      changed: changed(fromNormEPS, toNormEPS, 0.005),
    };
  }
  /* TP Fixed cell renders the clean amount; the computed-vs-proposed
     sanity gap was removed per earlier user request as rounding noise.
     The form's prev-side / new-side 2% checks already protect against
     meaningful divergence. */
  var tpFrom = (rec.fromTP != null && isFinite(rec.fromTP)) ? (pfx + fmtNum(rec.fromTP, 2)) : "—";
  var tpTo   = (rec.toTP   != null && isFinite(rec.toTP))   ? (pfx + fmtNum(rec.toTP,   2)) : "—";
  var tpRow = {
    label: "TP Fixed",
    from: tpFrom,
    to:   tpTo,
    fromRaw: rec.fromTP,
    toRaw:   rec.toTP,
    changed: changed(rec.fromTP, rec.toTP, 0.005),
    isTP: true,
  };
  /* MOS row — Prev MOS and New MOS both measured against today's
     stock price, so the reader sees whether the proposed TP change
     moves room-to-run meaningfully. Null when no current price
     (deleted company, legacy record without ticker). */
  var mosRow = null;
  if(isFinite(currentPrice) && currentPrice > 0){
    var prevMOS = (rec.fromTP != null && isFinite(rec.fromTP) && rec.fromTP > 0)
      ? calcMOS(rec.fromTP, currentPrice) : null;
    var newMOS  = (rec.toTP   != null && isFinite(rec.toTP)   && rec.toTP   > 0)
      ? calcMOS(rec.toTP,   currentPrice) : null;
    function fmtMOS(v){
      if(v == null || !isFinite(v)) return "—";
      var sign = v >= 0 ? "+" : "";
      return sign + v.toFixed(1) + "%";
    }
    mosRow = {
      label: "MOS @ Current " + pfx + fmtNum(currentPrice, 2),
      labelJSX: (<span>MOS @ <em className="italic">Current</em> {pfx}{fmtNum(currentPrice, 2)}</span>),
      from:  fmtMOS(prevMOS),
      to:    fmtMOS(newMOS),
      fromRaw: prevMOS,
      toRaw:   newMOS,
      /* MOS changes iff TP changed (within rounding). Reuse the same
         "changed" check rather than comparing percent values, which can
         drift due to current-price moves between proposal and view. */
      changed: changed(rec.fromTP, rec.toTP, 0.005),
      isMOS: true,
      /* % change of a percentage is misleading; show ppt instead. */
      isPptChange: true,
      newMOSValue: newMOS,
    };
  }
  /* Assemble in display order: TP, MOS, PE, EPS1, EPS2, NormEPS, Weights. */
  var rows = [tpRow];
  if(mosRow) rows.push(mosRow);
  rows.push(peRow);
  if(isLegacy){
    rows.push(legacyEpsRow);
  } else {
    rows.push(eps1Row, eps2Row, normEpsRow, weightsRow);
  }
  return (
    <div className="mb-2 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>
            <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Field</th>
            <th className="text-right px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Previous</th>
            <th className="text-right px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Proposed</th>
            <th className="text-right px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">% Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(function(r, i){
            var rowText = r.changed
              ? "text-gray-900 dark:text-slate-100"
              : "text-gray-400 dark:text-slate-500";
            /* Proposed-cell emphasis. MOS gets green/red based on
               whether the NEW MOS is positive or negative — green =
               room to run from today's price, red = trading above the
               new TP already. TP gets a blue tint when it changed.
               Everything else just bolds when changed. */
            var toEmphasis;
            if(r.isMOS && r.newMOSValue != null && isFinite(r.newMOSValue)){
              toEmphasis = "font-semibold " + (r.newMOSValue >= 0
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-rose-700 dark:text-rose-300");
            } else if(r.changed){
              toEmphasis = "font-semibold " + (r.isTP ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-slate-100");
            } else {
              toEmphasis = "";
            }
            /* Build the % Change cell. Weights and any row flagged
               noPctChange show N/A. MOS uses absolute ppt change (a
               %-of-% is misleading). Everything else uses standard
               % change (to - from) / |from| × 100. Color matches sign:
               green for positive, red for negative. Skips when either
               side is null or fromRaw is zero. */
            var pctCell;
            if(r.noPctChange){
              pctCell = <span className="text-gray-400 dark:text-slate-500">N/A</span>;
            } else {
              var fromNum = (r.fromRaw == null || r.fromRaw === "") ? null : parseFloat(r.fromRaw);
              var toNum   = (r.toRaw   == null || r.toRaw   === "") ? null : parseFloat(r.toRaw);
              if(fromNum == null || toNum == null || !isFinite(fromNum) || !isFinite(toNum)){
                pctCell = <span className="text-gray-400 dark:text-slate-500">—</span>;
              } else if(r.isPptChange){
                /* MOS: absolute percentage-point change (-25.1% → +3.1%
                   = +28.2 ppt). Already-percentage values so we don't
                   divide by from. */
                var ppt = toNum - fromNum;
                var pptSign = ppt >= 0 ? "+" : "";
                var pptColor = Math.abs(ppt) < 0.05 ? "text-gray-400 dark:text-slate-500"
                              : ppt > 0 ? "text-emerald-700 dark:text-emerald-300"
                                        : "text-rose-700 dark:text-rose-300";
                pctCell = <span className={"font-semibold " + pctColor}>{pptSign}{ppt.toFixed(1)} ppt</span>;
              } else if(Math.abs(fromNum) < 1e-9){
                /* Avoid div-by-zero. If from is 0 and to is non-zero
                   the change is technically infinite; show a clear "—". */
                pctCell = <span className="text-gray-400 dark:text-slate-500">—</span>;
              } else {
                var pct = (toNum - fromNum) / Math.abs(fromNum) * 100;
                var pctSign = pct >= 0 ? "+" : "";
                var pctColor = Math.abs(pct) < 0.05 ? "text-gray-400 dark:text-slate-500"
                              : pct > 0 ? "text-emerald-700 dark:text-emerald-300"
                                        : "text-rose-700 dark:text-rose-300";
                pctCell = <span className={"font-semibold " + pctColor}>{pctSign}{pct.toFixed(1)}%</span>;
              }
            }
            return (
              <tr key={i} className={"border-t border-slate-100 dark:border-slate-700 " + (i % 2 === 1 ? "bg-slate-50/40 dark:bg-slate-800/30" : "")}>
                <td className={"px-2 py-1 " + rowText}>{r.labelJSX || r.label}{!r.changed && <span className="text-[9px] italic ml-1">unchanged</span>}</td>
                <td className={"px-2 py-1 text-right tabular-nums font-mono " + rowText}>{r.from}</td>
                <td className={"px-2 py-1 text-right tabular-nums font-mono " + toEmphasis}>{r.to}</td>
                <td className="px-2 py-1 text-right tabular-nums font-mono">{pctCell}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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

  /* Currency prefix + current ord-ticker price are still used by the
     table (for TP formatting) and by the MOS line beneath it. Change
     rendering moved into <ChangeTable/> below. */
  var v = (company && company.valuation) || {};
  var ord = ((company && company.tickers) || []).find(function(t){return t.isOrdinary;}) || ((company && company.tickers) || [])[0] || null;
  var currentPrice = ord && ord.price !== undefined && ord.price !== "" ? parseFloat(ord.price) : parseFloat(v.price);
  var ccy = (ord && ord.currency) || v.currency || "USD";
  var pfx = ccyPrefix(ccy);

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
      <ChangeTable
        rec={rec}
        pfx={pfx}
        fy1={rec.fy1}
        fy2={rec.fy2}
        currentPrice={currentPrice}
        fyEndMonth={(company && company.segments && company.segments.fiscalYearEndMonth) || null}
      />
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
  var [view, setView] = useState("pending"); /* "pending" | "approved" | "rejected" */

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
  var approved = sorted.filter(function(r){return r.status === "approved";});
  /* Rejected list excludes self-withdrawals. New withdraws delete the
     record outright, but records from before that change persist as
     rejected with reason 'Withdrawn by suggester' — filter those out
     so the Rejected tab stays focused on genuine peer-rejection. */
  var rejected = sorted.filter(function(r){
    if(r.status !== "rejected") return false;
    if(r.rejectReason === "Withdrawn by suggester") return false;
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
          <button onClick={function(){setView("approved");}} className={"text-[11px] px-2.5 py-1 rounded-full border cursor-pointer " + (view==="approved"?"bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 font-semibold":"border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>
            Approved {approved.length>0 && <span className="ml-1">({approved.length})</span>}
          </button>
          <button onClick={function(){setView("rejected");}} className={"text-[11px] px-2.5 py-1 rounded-full border cursor-pointer " + (view==="rejected"?"bg-rose-100 dark:bg-rose-900/40 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 font-semibold":"border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>
            Rejected {rejected.length>0 && <span className="ml-1">({rejected.length})</span>}
          </button>
          {/* Pop out — separate browser window so the panel stays
              visible alongside the main app. Hidden inside the popout
              itself (no window.opener means we ARE the popout). */}
          {(typeof window === "undefined" || !window.opener) && (
            <button
              onClick={function(){
                try {
                  window.open(window.location.pathname + "?popout=tpApprovals", "tpapprovals-popout", "width=900,height=850");
                  onClose();
                } catch(_e){}
              }}
              className="ml-auto text-[11px] px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
              title="Open this panel in a separate window"
            >↗ Pop out</button>
          )}
          <button onClick={onClose} className={"text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 cursor-pointer " + ((typeof window === "undefined" || !window.opener) ? "" : "ml-auto")}>Close ✕</button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {(function(){
            var list = view === "pending" ? pending : view === "approved" ? approved : rejected;
            var emptyMsg = view === "pending" ? "No TP changes pending approval."
                         : view === "approved" ? "No approved TP changes yet."
                         : "No rejected TP changes yet.";
            if (list.length === 0) {
              return <div className="text-sm text-gray-500 dark:text-slate-400 italic text-center py-8">{emptyMsg}</div>;
            }
            return list.map(function(rec){
              var co = coById[rec.companyId];
              return <ApprovalCard key={rec.id} rec={rec} company={co} companyName={(co && co.name) || "(unknown)"} onApprove={approveTpApproval} onReject={rejectTpApproval} onWithdraw={withdrawTpApproval} onNavigate={onNavigate}/>;
            });
          })()}
        </div>
      </div>
    </div>
  );
}
