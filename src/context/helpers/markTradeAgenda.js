/* Pure helper for markTradeAgenda.
 *
 * Given a single company, a portfolio code, and a B/A/P/S action, return
 * the new company object (or the same object unchanged when nothing
 * should change — e.g. invalid action). The toggle-off case (same action
 * stamped twice) returns a company with the stamp removed and any
 * Sell-zeroed weight restored.
 *
 * Pulling this out of CompanyContext.jsx lets the messy stamp/toggle/
 * Sell-restore logic be unit tested without React state. The context
 * keeps the setCompanies wrapper.
 */
const VALID_ACTIONS = ["Buy", "Add", "Pare", "Sell"];

export function applyTradeAgenda(c, portfolio, action, today, author, newId) {
  if (!VALID_ACTIONS.includes(action)) return c;
  if (!portfolio) return c;
  const hist = c.portWeightHistory || [];
  /* Find the most recent agenda stamp for this portfolio. */
  let existingStamp = null;
  for (let i = 0; i < hist.length; i++) {
    if (hist[i].isAgenda && hist[i].portfolio === portfolio && hist[i].action) {
      existingStamp = hist[i];
      break;
    }
  }
  /* Wipe ALL prior agenda stamps for this portfolio (clean slate for
     the new state) — keeps history compact and avoids confusing the
     memo generator with multiple actions per port. */
  const cleaned = hist.filter(function (h) {
    return !(h.isAgenda && h.portfolio === portfolio && h.action);
  });
  const nw = Object.assign({}, c.portWeights || {});
  /* If the previous stamp was Sell, it zeroed the target; in any
     transition (toggle-off or switch) we restore the pre-Sell target
     from the entry's oldWeight. */
  if (existingStamp && existingStamp.action === "Sell") {
    nw[portfolio] = String(existingStamp.oldWeight);
  }
  if (existingStamp && existingStamp.action === action) {
    /* Toggle OFF — same button clicked twice. No new entry. */
    return Object.assign({}, c, { portWeights: nw, portWeightHistory: cleaned });
  }
  /* Stamp the new action — either first stamp or switching verbs. */
  const oldRaw = nw[portfolio]; /* after potential Sell-restore */
  let oldNum = parseFloat(oldRaw);
  if (isNaN(oldNum)) oldNum = 0;
  const newNum = action === "Sell" ? 0 : oldNum;
  const entry = {
    id: newId(),
    date: today,
    portfolio: portfolio,
    oldWeight: oldNum,
    newWeight: newNum,
    author: author,
    isAgenda: true,
    action: action,
  };
  if (action === "Sell") nw[portfolio] = "0";
  return Object.assign({}, c, {
    portWeights: nw,
    portWeightHistory: [entry].concat(cleaned),
  });
}
