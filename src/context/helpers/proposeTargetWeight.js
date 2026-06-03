/* Pure helper for proposeTargetWeight.
 *
 * Encapsulates the tricky propose/clear/sell-restore decision tree so
 * it can be tested without React. Returns:
 *   {
 *     company,        // new company object (or same ref if nothing changed)
 *     deltaForCash,   // amount to shift via _shiftCash (positive means CASH shrinks)
 *   }
 *
 * Edge cases preserved verbatim from CompanyContext.jsx:
 *  - Sell-stamp override: if the port has an agenda Sell stamp, treat
 *    its oldWeight as the baseline so "Sell All → change mind →
 *    new target" produces the right allocation-change row.
 *  - In-place replace of an existing pending entry (by id) so multiple
 *    keystrokes don't accumulate noise in portWeightHistory.
 *  - If the new proposal equals committed, drop the pending entry
 *    entirely (no zero-delta entry).
 *  - When a Sell stamp is removed, restore portWeights to its
 *    pre-Sell value (the Sell originally mutated portWeights to "0";
 *    the proposal that's replacing it rides on the proper baseline).
 */
export function findPendingTargetEntry(c, portfolio) {
  const hist = c.portWeightHistory || [];
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    /* Pending target = isAgenda:true with a newWeight and NO action
       (B/A/P/S stamps also use isAgenda:true but have an action). */
    if (h && h.isAgenda && h.portfolio === portfolio && !h.action
        && h.newWeight !== undefined && h.newWeight !== null) {
      return { entry: h, index: i };
    }
  }
  return null;
}

export function applyProposeTargetWeight(c, portfolio, rawNewValue, today, author, newId) {
  /* Find any existing Sell agenda stamp on this port. */
  let sellIdx = -1;
  const hist0 = c.portWeightHistory || [];
  for (let si = 0; si < hist0.length; si++) {
    const sh = hist0[si];
    if (sh && sh.isAgenda && sh.portfolio === portfolio && sh.action === "Sell") {
      sellIdx = si;
      break;
    }
  }
  const sellEntry = sellIdx >= 0 ? hist0[sellIdx] : null;
  const committedRaw = (c.portWeights || {})[portfolio];
  let committedNum = parseFloat(committedRaw);
  if (isNaN(committedNum)) committedNum = 0;
  /* Override baseline if Sell pre-zeroed portWeights. */
  if (sellEntry) {
    const sellOld = parseFloat(sellEntry.oldWeight);
    if (isFinite(sellOld) && sellOld > committedNum) committedNum = sellOld;
  }
  let newNum = parseFloat(rawNewValue);
  if (isNaN(newNum)) newNum = 0;
  const pending = findPendingTargetEntry(c, portfolio);
  let prevProposed = pending ? parseFloat(pending.entry.newWeight) : (sellEntry ? 0 : committedNum);
  if (isNaN(prevProposed)) prevProposed = committedNum;
  const deltaForCash = newNum - prevProposed;
  /* If proposed === committed, there's nothing pending — clear any
     existing proposal entry on this port. */
  const nowMatchesCommitted = Math.abs(newNum - committedNum) < 0.01;
  /* Build the working history with the Sell stamp removed first
     (whether or not we keep a target proposal — see below). */
  const histNoSell = sellIdx >= 0
    ? hist0.filter(function (h, i) { return i !== sellIdx; })
    : hist0;
  let newHist;
  if (nowMatchesCommitted) {
    newHist = histNoSell.filter(function (h) {
      /* Match by id to survive the index shift caused by filtering
         out a Sell entry. */
      return !(pending && pending.entry.id && h.id === pending.entry.id);
    });
  } else {
    const entry = {
      id: pending ? pending.entry.id : newId(),
      date: today,
      portfolio: portfolio,
      oldWeight: committedNum,
      newWeight: newNum,
      author: author,
      isAgenda: true,
    };
    if (pending) {
      newHist = histNoSell.map(function (h) {
        return (h && pending.entry.id && h.id === pending.entry.id) ? entry : h;
      });
    } else {
      newHist = [entry].concat(histNoSell);
    }
  }
  /* If a Sell stamp was just removed, restore portWeights to the
     pre-Sell committed value. */
  let newPortWeights = c.portWeights;
  if (sellEntry) {
    const restored = parseFloat(sellEntry.oldWeight);
    if (isFinite(restored)) {
      newPortWeights = Object.assign({}, c.portWeights || {}, { [portfolio]: String(restored) });
    }
  }
  return {
    company: Object.assign({}, c, { portWeightHistory: newHist, portWeights: newPortWeights }),
    deltaForCash: deltaForCash,
  };
}
