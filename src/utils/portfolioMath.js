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

/* Sector & country weight breakdowns for a portfolio (or aggregate of
 * portfolios). Returns { sectors, countries, totalMV, byCompany } where
 * sectors/countries are maps of name -> weight percent (0-100). */
export function calcBreakdowns(companies, repData, fxRates, portKey) {
  const ports = portKey === "All" ? null : (Array.isArray(portKey) ? portKey : [portKey]);
  /* Pool rep data across selected portfolios. If "All", include every
   * portfolio in repData. */
  const portKeys = ports || Object.keys(repData || {});
  let totalMV = 0;
  const sectors = {};
  const countries = {};
  const byCompany = [];

  portKeys.forEach(function (pk) {
    const pRep = (repData || {})[pk] || {};
    const inPort = companies.filter(function (c) {
      if (portKey === "All") return true;
      return (c.portfolios || []).indexOf(pk) >= 0;
    });
    const others = companies.filter(function (c) {
      if (portKey === "All") return false;
      return (c.portfolios || []).indexOf(pk) < 0;
    });
    const owners = buildTickerOwners(inPort, others);
    const portTotal = calcTotalMV(inPort, pRep, fxRates, owners);
    totalMV += portTotal;

    inPort.forEach(function (c) {
      const mv = calcCompanyRepMV(c, pRep, fxRates, owners);
      if (!mv) return;
      if (c.country) countries[c.country] = (countries[c.country] || 0) + mv;

      /* ETF sector split: when c.sectorWeights has positive entries that
         sum to > 0, distribute MV across sectors proportionally and emit
         one byCompany entry per slice (same id/name). The special key
         "Cash" is included in the denominator but NOT distributed to any
         sector — it represents the ETF's cash sleeve, which shouldn't be
         counted as sector exposure. Otherwise fall back to the
         single-sector behavior using c.sector. */
      const sw = c.sectorWeights || null;
      const allKeys = sw ? Object.keys(sw).filter(function (k) { return parseFloat(sw[k]) > 0; }) : [];
      const swSum   = allKeys.reduce(function (s, k) { return s + parseFloat(sw[k]); }, 0);
      const swKeys  = allKeys.filter(function (k) { return k !== "Cash"; });
      if (allKeys.length > 0 && swSum > 0) {
        swKeys.forEach(function (k) {
          const slice = mv * (parseFloat(sw[k]) / swSum);
          sectors[k] = (sectors[k] || 0) + slice;
          byCompany.push({ id: c.id, name: c.name, sector: k, country: c.country, mv: slice, portfolio: pk });
        });
      } else {
        if (c.sector) sectors[c.sector] = (sectors[c.sector] || 0) + mv;
        byCompany.push({ id: c.id, name: c.name, sector: c.sector, country: c.country, mv, portfolio: pk });
      }
    });
  });

  function toPct(map) {
    const out = {};
    if (totalMV > 0) {
      Object.keys(map).forEach(function (k) { out[k] = (map[k] / totalMV) * 100; });
    }
    return out;
  }
  return { sectors: toPct(sectors), countries: toPct(countries), totalMV: totalMV, byCompany: byCompany };
}

/* 5-day perf from the company's ordinary ticker, or null. */
export function getPerf5d(company) {
  const ord = ((company && company.tickers) || []).find(function (t) { return t.isOrdinary; });
  const p = ord && ord.perf5d;
  if (!p || p === "#N/A") return null;
  const n = parseFloat(p);
  return isNaN(n) ? null : n;
}
