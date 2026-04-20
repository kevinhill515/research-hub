/* Pure functions for portfolio Rep MV / weight calculations.
 *
 * These are extracted from PortfoliosTable / App so they can be unit-tested
 * in isolation and reused without re-deriving the same numbers inside render.
 *
 * Conventions (inherited from the codebase):
 *   - fxRates[ccy] is stored as LOCAL-per-USD (e.g. fxRates.JPY ≈ 152 means
 *     1 USD = 152 JPY). To convert a local-currency market value to USD,
 *     divide by fxRates[ccy]. USD is implicit fx=1.
 *   - repData[portfolio][TICKER] is a rep entry; repShares() reads .shares.
 *   - tickerOwners maps an upper-case ticker -> company.id, resolving the
 *     case where the same ticker is listed under multiple companies (each
 *     ticker contributes MV to exactly one company).
 */

import { repShares } from "./index.js";

/* Convert a local-currency amount to USD using the fxRates table.
 * Returns 0 for missing/zero/invalid rates so callers don't propagate NaN. */
export function toUSD(amountLocal, currency, fxRates) {
  const ccy = (currency || "USD").toUpperCase();
  if (ccy === "USD") return amountLocal;
  const fx = fxRates ? parseFloat(fxRates[ccy]) : NaN;
  if (!isFinite(fx) || fx <= 0) return 0;
  return amountLocal / fx;
}

/* Build a map of { TICKER: company.id } giving each ticker a single
 * owning company. Companies in `portCos` claim first; `otherCos` fill in
 * any tickers not yet claimed. Both arguments should be arrays of
 * company objects with a `tickers: [{ticker, ...}]` shape. */
export function buildTickerOwners(portCos, otherCos) {
  const owners = {};
  function claim(list) {
    (list || []).forEach(function (c) {
      (c.tickers || []).forEach(function (t) {
        const tk = (t.ticker || "").toUpperCase();
        if (tk && !owners[tk]) owners[tk] = c.id;
      });
    });
  }
  claim(portCos);
  claim(otherCos);
  return owners;
}

/* Rep MV (in USD) contributed by a single company to a given portfolio.
 *
 * Rules:
 *   - Only tickers owned by this company (per tickerOwners) count. If
 *     tickerOwners is not passed, every ticker on the company counts.
 *   - Each unique ticker contributes at most once (dedupe within company).
 *   - Requires both rep shares > 0 and a parseable price.
 *   - Currency conversion uses toUSD(). A missing fx rate drops the
 *     position to 0 (not NaN) so one bad rate can't poison the total. */
export function calcCompanyRepMV(company, portRep, fxRates, tickerOwners) {
  if (!company || !portRep) return 0;
  let mv = 0;
  const seen = {};
  (company.tickers || []).forEach(function (t) {
    const tk = (t.ticker || "").toUpperCase();
    if (!tk || seen[tk]) return;
    if (tickerOwners && tickerOwners[tk] !== company.id) return;
    seen[tk] = true;
    const shares = repShares(portRep[tk]);
    const price = parseFloat(t.price);
    if (!shares || !isFinite(price)) return;
    mv += toUSD(shares * price, t.currency, fxRates);
  });
  return mv;
}

/* Total USD Rep MV for a portfolio: sum of per-company MVs plus CASH
 * and DIVACC lines (which are already USD, stored as share counts). */
export function calcTotalMV(portCos, portRep, fxRates, tickerOwners) {
  let total = 0;
  (portCos || []).forEach(function (c) {
    total += calcCompanyRepMV(c, portRep, fxRates, tickerOwners);
  });
  total += repShares((portRep || {}).CASH);
  total += repShares((portRep || {}).DIVACC);
  return total;
}

/* Rep weight (%) of a company in the portfolio, rounded to 1 decimal.
 * Returns null when either input is non-positive so the UI can show "--". */
export function calcRepWeight(repMV, totalMV) {
  if (!(totalMV > 0) || !(repMV > 0)) return null;
  return Math.round((repMV / totalMV) * 1000) / 10;
}

/* Diff = rep weight minus target, rounded to 1 decimal. Null when either
 * side is missing — matches existing table convention. */
export function calcDiff(repWeight, target) {
  if (repWeight === null || repWeight === undefined) return null;
  const t = parseFloat(target);
  if (!(t > 0)) return null;
  return Math.round((repWeight - t) * 10) / 10;
}

/* Earliest future earnings date from a company's earningsEntries.
 * `today` should be a Date at local midnight. Returns a Date or null. */
export function getNextReport(company, today) {
  let next = null;
  ((company && company.earningsEntries) || []).forEach(function (e) {
    if (!e.reportDate) return;
    const d = new Date(e.reportDate);
    if (isNaN(d.getTime())) return;
    if (d >= today && (!next || d < next)) next = d;
  });
  return next;
}

/* 5-day perf from the company's ordinary ticker, or null. */
export function getPerf5d(company) {
  const ord = ((company && company.tickers) || []).find(function (t) { return t.isOrdinary; });
  const p = ord && ord.perf5d;
  if (!p || p === "#N/A") return null;
  const n = parseFloat(p);
  return isNaN(n) ? null : n;
}
