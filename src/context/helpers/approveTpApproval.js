/* Pure helpers for approveTpApproval.
 *
 * Two transformations, separated so each can be tested in isolation:
 *
 *  1. applyApprovalToApprovals(prev, id, rec, currentUser, approvedAt)
 *       — produces the new tpApprovals array. Approves the target
 *       record, and auto-rejects any sibling pending records on the
 *       same company (so a stale change can't sneak in later).
 *
 *  2. applyApprovalToCompany(c, rec, currentUser, today, inferQuarter)
 *       — produces the new company object: updates valuation working +
 *       fixed slots from the approved breakdown, snapshots tpFixed,
 *       and prepends a tpHistory entry. `inferQuarter` is injected so
 *       we don't have to import the utils module from the helper —
 *       keeps the helper trivially mockable.
 *
 * Both preserve the race-fix contract from the original (read rec from
 * the closure-captured tpApprovals snapshot up front; the caller's
 * setTpApprovals updater calls applyApprovalToApprovals to re-validate
 * status==="pending" against the freshest state).
 */
export function applyApprovalToApprovals(prev, id, rec, currentUser, approvedAt) {
  /* Re-find inside the updater so multi-user races still see the
     freshest state — but if it's already been decided by another
     user, leave it. */
  const live = prev.find(function (a) { return a.id === id; });
  if (!live || live.status !== "pending") return prev;
  return prev.map(function (a) {
    /* Approve the target. Sibling pending records on the SAME company
       get auto-rejected so a stale change can't sneak in later. */
    if (a.id === id) {
      return Object.assign({}, a, {
        status: "approved",
        approvedBy: currentUser,
        approvedAt: approvedAt,
      });
    }
    if (a.status === "pending" && a.companyId === rec.companyId) {
      return Object.assign({}, a, {
        status: "rejected",
        rejectedBy: currentUser,
        rejectedAt: approvedAt,
        rejectReason: "Superseded by another approval",
      });
    }
    return a;
  });
}

export function applyApprovalToCompany(c, rec, currentUser, today, inferQuarter) {
  const v = Object.assign({}, c.valuation || {});
  const ccy = (c.valuation && c.valuation.currency) || "USD";
  /* Write every breakdown field the suggestion specifies. PE / EPS1 /
     EPS2 / W1 / W2 become the working valuation — these drive TP
     Live, which keeps recomputing as EPS estimates update over time.
     Older records that predate the breakdown only carry toPE/toEPS —
     handle both for back-compat. */
  if (rec.toPE !== null && rec.toPE !== undefined && rec.toPE !== "") v.pe = rec.toPE;
  if (rec.toEPS1 !== null && rec.toEPS1 !== undefined && rec.toEPS1 !== "") v.eps1 = rec.toEPS1;
  else if (rec.toEPS !== null && rec.toEPS !== undefined && rec.toEPS !== "") v.eps1 = rec.toEPS;
  if (rec.toEPS2 !== null && rec.toEPS2 !== undefined && rec.toEPS2 !== "") v.eps2 = rec.toEPS2;
  if (rec.toW1 !== null && rec.toW1 !== undefined && rec.toW1 !== "") v.w1 = rec.toW1;
  if (rec.toW2 !== null && rec.toW2 !== undefined && rec.toW2 !== "") v.w2 = rec.toW2;
  /* Also snapshot the approved values into *Fixed slots. These are
     the locked-at-approval values that the Valuation tab surfaces
     alongside the daily-updated Live values, and they're what the
     next TP proposal pulls into its "Previous (last approved)" row. */
  if (rec.toPE   !== null && rec.toPE   !== undefined && rec.toPE   !== "") v.peFixed   = rec.toPE;
  if (rec.toEPS1 !== null && rec.toEPS1 !== undefined && rec.toEPS1 !== "") v.eps1Fixed = rec.toEPS1;
  if (rec.toEPS2 !== null && rec.toEPS2 !== undefined && rec.toEPS2 !== "") v.eps2Fixed = rec.toEPS2;
  if (rec.toW1   !== null && rec.toW1   !== undefined && rec.toW1   !== "") v.w1Fixed   = rec.toW1;
  if (rec.toW2   !== null && rec.toW2   !== undefined && rec.toW2   !== "") v.w2Fixed   = rec.toW2;
  if (rec.fy1) v.fy1Fixed = rec.fy1;
  if (rec.fy2) v.fy2Fixed = rec.fy2;
  /* TP Fixed snapshot at the approval moment. Uses the computed toTP
     (PE × normEPS) — the moment-in-time target the team is agreeing
     to. */
  if (rec.toTP !== null && rec.toTP !== undefined && isFinite(rec.toTP)) {
    v.tpFixed = String(rec.toTP);
    v.tpFixedDate = today;
  }
  /* Find the earnings entry the suggestion was attached to and derive
     its fiscal-quarter label. */
  let qLabel = "";
  const srcEntry = (c.earningsEntries || []).find(function (eEnt) {
    return eEnt.id === rec.earningsEntryId;
  });
  if (srcEntry) {
    if (srcEntry.quarter) {
      qLabel = String(srcEntry.quarter);
    } else if (srcEntry.reportDate) {
      const inferred = inferQuarter(srcEntry.reportDate, (c.valuation || {}).fyMonth || "Dec");
      if (inferred && inferred.label) qLabel = inferred.label;
    }
  }
  const tpEntry = {
    date: today,
    tp: rec.toTP,
    pe: rec.toPE,
    eps: rec.toEPS,
    eps1: rec.toEPS1,
    eps2: rec.toEPS2,
    w1: rec.toW1,
    w2: rec.toW2,
    fy1: rec.fy1 || "",
    fy2: rec.fy2 || "",
    earningsEntryId: rec.earningsEntryId || "",
    quarter: qLabel,
    currency: ccy,
    source: "approval",
    by: rec.suggestedBy,
    approvedBy: currentUser,
    rationale: rec.rationale || "",
  };
  return Object.assign({}, c, {
    valuation: v,
    tpHistory: [tpEntry].concat(c.tpHistory || []),
    lastUpdated: today,
  });
}
