/* Per-portfolio table (FIN / IN / FGL / GL / EM / SC).
 *
 * Pipeline:
 *   1. Build a ticker-ownership map so each ticker contributes MV to at
 *      most one company (companies in this portfolio claim first).
 *   2. Compute per-company Rep MV (USD), then totalMV including CASH/DIVACC.
 *   3. Derive rep weight and diff for each company.
 *   4. Sort companies per portSort/portSortDir.
 *   5. Render header row, company rows, CASH/DIVACC special rows, TOTAL row.
 *
 * Pure math lives in ../../utils/portfolioMath.js so it can be unit-tested
 * in isolation. This file is responsible only for wiring and rendering.
 */

import { useMemo, useEffect } from "react";
import { useCompanyContext } from "../../context/CompanyContext.jsx";
import { PORT_NAMES } from "../../constants/index.js";
import {
  calcNormEPS, calcTP, calcMOS, mosBg, repShares, repAvgCost,
  getInitiatedDate, monthsSince, printPage, getTpFixed,
} from "../../utils/index.js";
import {
  buildTickerOwners, calcCompanyRepMV, calcTotalMV,
  calcRepWeight, calcDiff, getNextReport, getPerf5d,
} from "../../utils/portfolioMath.js";
import { PORTFOLIO_COLUMNS, ASC_SORTS } from "./portfolioColumns.js";
import PortfolioRow from "./PortfolioRow.jsx";
import PortfolioSpecialRow from "./PortfolioSpecialRow.jsx";
import PortfolioTotalRow from "./PortfolioTotalRow.jsx";

const BTN_SM = "text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";

/* Sort chips shown above the table (curated subset of columns). */
const SORT_CHIPS = [
  ["rep",     "Rep %"],
  ["target",  "Target %"],
  ["name",    "Name"],
  ["mos",     "MOS"],
  ["sector",  "Sector"],
  ["country", "Country"],
];

function getMosForCompany(c) {
  const v = c.valuation || {};
  const eps = calcNormEPS(v) || parseFloat(v.eps);
  const tp = calcTP(v.pe, eps);
  const ord = (c.tickers || []).find(function (t) { return t.isOrdinary; });
  const price = (ord && parseFloat(ord.price)) || parseFloat(v.price);
  return calcMOS(tp, price);
}

function getMosFixedForCompany(c) {
  const v = c.valuation || {};
  const tp = getTpFixed(v);
  if (tp === null) return null;
  const ord = (c.tickers || []).find(function (t) { return t.isOrdinary; });
  const price = (ord && parseFloat(ord.price)) || parseFloat(v.price);
  return calcMOS(tp, price);
}

/* Build a sort comparator for a given (key, direction). Keeps nulls at
 * the bottom regardless of direction — matches existing behavior. */
function makeComparator(sortKey, sortDir, ctx) {
  const mult = sortDir === "asc" ? 1 : -1;
  const { portTab, repData, fxRates, tickerOwners, companies } = ctx;

  function nullCmp(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return mult * (a - b);
  }

  const getters = {
    name:       function (c) { return c.name || ""; },
    sector:     function (c) { return c.sector || ""; },
    country:    function (c) { return c.country || ""; },
    target:     function (c) { return parseFloat((c.portWeights || {})[portTab]) || 0; },
    mos:        getMosForCompany,
    mosFixed:   getMosFixedForCompany,
    perf:       getPerf5d,
    nextReport: function (c) {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const d = getNextReport(c, today);
                  return d ? d.getTime() : null;
                },
    diff:       function (c) {
                  const t = parseFloat((c.portWeights || {})[portTab]) || 0;
                  const mv = calcCompanyRepMV(c, repData[portTab] || {}, fxRates, tickerOwners);
                  let total = 0;
                  companies.filter(function (x) { return (x.portfolios || []).indexOf(portTab) >= 0; })
                           .forEach(function (x) {
                             total += calcCompanyRepMV(x, repData[portTab] || {}, fxRates, tickerOwners);
                           });
                  const rw = calcRepWeight(mv, total);
                  return (rw !== null && t > 0) ? rw - t : null;
                },
    rep:        function (c) { return calcCompanyRepMV(c, repData[portTab] || {}, fxRates, tickerOwners); },
  };

  return function (a, b) {
    /* Unknown sort keys fall back to rep MV desc — matches legacy behavior
       where headers like "Held" / "Last Trade" / "Unreal" had no dedicated
       comparator and the default tiebreaker was rep MV. */
    const key = getters[sortKey] ? sortKey : "rep";
    if (key === "name" || key === "sector" || key === "country") {
      return mult * getters[key](a).localeCompare(getters[key](b));
    }
    return nullCmp(getters[key](a), getters[key](b));
  };
}

export function PortfoliosTable(props) {
  const {
    portTab, portSort, portSortDir, setPortSort, setPortSortDir,
    editingTarget, setEditingTarget,
    setTxFilter, setSelCoOrigin, setSelCo, setTab, setCoView,
    openDiscussions, onAddTransaction,
  } = props;
  const {
    companies, repData, fxRates, specialWeights, annotations, dark,
    updateTargetWeight,
  } = useCompanyContext();

  /* ---- Derive portfolio data ---- */
  const { portCos, portRep, tickerOwners, totalMV, perRowData } = useMemo(function () {
    const pRep = repData[portTab] || {};
    const inPort = companies.filter(function (c) { return (c.portfolios || []).indexOf(portTab) >= 0; });
    const others = companies.filter(function (c) { return (c.portfolios || []).indexOf(portTab)  < 0; });
    const owners = buildTickerOwners(inPort, others);
    const total = calcTotalMV(inPort, pRep, fxRates, owners);

    /* Sort the companies */
    const cmp = makeComparator(portSort, portSortDir, {
      portTab, repData, fxRates, tickerOwners: owners, companies,
    });
    const sorted = inPort.slice().sort(cmp);

    /* Precompute per-row derived values so the row renderer is a pure read. */
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rowData = {};
    sorted.forEach(function (c) {
      const val = c.valuation || {};
      const normEps = calcNormEPS(val) || parseFloat(val.eps);
      const tp = calcTP(val.pe, normEps);
      const ordTicker = (c.tickers || []).find(function (t) { return t.isOrdinary; });
      const ordPrice = ordTicker ? parseFloat(ordTicker.price) : parseFloat(val.price);
      const mos = calcMOS(tp, ordPrice);
      const tpFixed = getTpFixed(val);
      const mosFixedVal = tpFixed !== null ? calcMOS(tpFixed, ordPrice) : null;

      /* Price / avg cost / unrealized use the rep-held ticker if any,
         else fall back to the ordinary. */
      const repTicker = (c.tickers || []).find(function (t) {
        return repShares(pRep[(t.ticker || "").toUpperCase()]) > 0;
      });
      const priceTicker = repTicker || ordTicker;
      const priceVal = priceTicker ? parseFloat(priceTicker.price) : NaN;
      const avgCostVal = repTicker
        ? repAvgCost(pRep[(repTicker.ticker || "").toUpperCase()])
        : 0;
      const unrealVal = (avgCostVal > 0 && !isNaN(priceVal))
        ? (priceVal - avgCostVal) / avgCostVal * 100
        : null;

      const mv = calcCompanyRepMV(c, pRep, fxRates, owners);
      const rw = calcRepWeight(mv, total);
      const tgt = parseFloat((c.portWeights || {})[portTab]) || 0;

      /* Latest discretionary transaction in this portfolio (for Last
         Trade cell). Excludes cashFlow-marked trades since those are
         forced by client deposits/withdrawals, not investment decisions. */
      const txs = (c.transactions || []).filter(function (t) {
        return t.portfolio === portTab && !t.cashFlow;
      });
      const lastTx = txs.length === 0 ? null
        : txs.slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); })[0];

      /* Initiated date / months held for this portfolio. */
      const initDate = getInitiatedDate(c, portTab);
      const monthsHeld = monthsSince(initDate);

      /* 5D perf from ordinary ticker. */
      const perfRaw = ordTicker && ordTicker.perf5d;
      const perfNum = (!perfRaw || perfRaw === "#N/A") ? null
        : (function () { const n = parseFloat(perfRaw); return isNaN(n) ? null : n; })();

      rowData[c.id] = {
        /* Valuation */
        val: val,
        mos: mos,
        mosStyle: mosBg(mos),
        mosFixed: mosFixedVal,
        mosFixedStyle: mosBg(mosFixedVal),
        /* Rep holdings */
        priceVal: priceVal,
        avgCostVal: avgCostVal,
        unrealVal: unrealVal,
        /* Weights / diff */
        target: tgt,
        repMV: mv,
        repWeight: rw,
        diff: calcDiff(rw, tgt),
        /* Transactions */
        lastTx: lastTx,
        monthsHeld: monthsHeld,
        /* Misc */
        perf5d: perfNum,
        nextReport: getNextReport(c, today),
        today: today,
      };
    });

    return {
      portCos: sorted,
      portRep: pRep,
      tickerOwners: owners,
      totalMV: total,
      perRowData: rowData,
    };
  }, [companies, repData, fxRates, portTab, portSort, portSortDir]);

  /* ---- Totals for the TOTAL row ---- */
  const { totalTarget, totalRep } = useMemo(function () {
    let tgt = 0;
    let rawRep = 0;
    portCos.forEach(function (c) {
      tgt += parseFloat((c.portWeights || {})[portTab]) || 0;
      rawRep += perRowData[c.id].repMV;
    });
    const cashShares = repShares(portRep.CASH);
    const divShares  = repShares(portRep.DIVACC);
    const cashTgt = parseFloat((specialWeights.CASH   || {})[portTab]) || 0;
    const divTgt  = parseFloat((specialWeights.DIVACC || {})[portTab]) || 0;
    tgt += cashTgt + divTgt;
    rawRep += cashShares + divShares;
    const rep = totalMV > 0 ? Math.round(rawRep / totalMV * 1000) / 10 : 0;
    return { totalTarget: tgt, totalRep: rep };
  }, [portCos, perRowData, portRep, specialWeights, portTab, totalMV]);

  /* ---- Diagnostic: warn if computed total doesn't match AUM ---- */
  useEffect(function () {
    if (totalMV > 0 && Math.abs(totalRep - 100) > 0.05) {
      const companyMVs = portCos
        .filter(function (c) { return perRowData[c.id].repMV > 0; })
        .map(function (c) {
          return {
            name: c.name,
            mv: perRowData[c.id].repMV,
            tickers: (c.tickers || [])
              .filter(function (t) { return tickerOwners[(t.ticker || "").toUpperCase()] === c.id; })
              .map(function (t) { return t.ticker + "(" + (t.currency || "USD") + ")"; })
              .join(","),
          };
        });
      /* eslint-disable no-console */
      console.warn("[Portfolio Total mismatch " + portTab + "]", {
        portTab, totalMV, totalRep, diffPct: totalRep - 100, companyMVs,
      });
      /* eslint-enable no-console */
    }
  }, [portTab, totalMV, totalRep, portCos, perRowData, tickerOwners]);

  /* ---- Portfolio-level discussions button ---- */
  const portAnnotations = annotations.filter(function (a) {
    return !a.resolved && a.scope === "portfolio" && a.portfolio === portTab;
  });

  /* ---- CASH / DIVACC special rows (only render when there's data) ---- */
  const cashShares = repShares(portRep.CASH);
  const divShares  = repShares(portRep.DIVACC);
  const cashTgt = parseFloat((specialWeights.CASH   || {})[portTab]) || 0;
  const divTgt  = parseFloat((specialWeights.DIVACC || {})[portTab]) || 0;
  const specialRows = [];
  if (cashShares > 0 || cashTgt > 0) specialRows.push({ label: "CASH",   shares: cashShares, target: cashTgt });
  if (divShares  > 0 || divTgt  > 0) specialRows.push({ label: "DIVACC", shares: divShares,  target: divTgt  });

  /* ---- Header click handler: toggle direction or switch sort ---- */
  function handleHeaderClick(sortKey) {
    if (!sortKey) return;
    if (portSort === sortKey) {
      setPortSortDir(function (d) { return d === "asc" ? "desc" : "asc"; });
    } else {
      setPortSort(sortKey);
      setPortSortDir(ASC_SORTS.has(sortKey) ? "asc" : "desc");
    }
  }

  /* ---- Row-click handlers passed to PortfolioRow ---- */
  function onOpenCompany(c) {
    setSelCoOrigin("portfolios");
    setSelCo(c);
    setTab("companies");
    setCoView("section:Valuation");
  }
  function onOpenTransactions(c) {
    setSelCoOrigin("portfolios");
    setSelCo(c);
    setTab("companies");
    setCoView("transactions");
    setTxFilter(portTab);
  }

  return (
    <div className="print-target">
      <div className="flex gap-2 mb-2 items-center flex-wrap">
        <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
          {PORT_NAMES[portTab]} — {portCos.length} companies
        </span>
        {totalMV > 0 && (
          <span className="text-xs text-gray-500 dark:text-slate-400">
            Rep AUM: ${totalMV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        )}
        <button
          onClick={function () { openDiscussions({ scope: "portfolio", portfolio: portTab }); }}
          className={BTN_SM + " ml-auto no-print"}
        >
          💬 Discuss
          {portAnnotations.length > 0 && (
            <span className="ml-1 text-[10px] px-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold">
              {portAnnotations.length}
            </span>
          )}
        </button>
        <button onClick={printPage} className={BTN_SM + " no-print"} title="Print this view (landscape)">
          🖨 Print
        </button>
      </div>

      {/* Sort chips */}
      <div className="flex gap-1.5 mb-2 flex-wrap" role="toolbar" aria-label="Sort by">
        <span className="text-[11px] text-gray-500 dark:text-slate-400">Sort:</span>
        {SORT_CHIPS.map(function (s) {
          const active = portSort === s[0];
          const arrow = active ? (portSortDir === "asc" ? " ↑" : " ↓") : "";
          return (
            <button
              key={s[0]}
              type="button"
              onClick={function () { handleHeaderClick(s[0]); }}
              aria-pressed={active}
              aria-label={"Sort by " + s[1] + (active ? " (" + (portSortDir === "asc" ? "ascending" : "descending") + ")" : "")}
              className={"text-[11px] px-2 py-0.5 rounded-full cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 " +
                (active
                  ? "bg-slate-100 dark:bg-slate-800 border border-slate-400 dark:border-slate-500 text-gray-900 dark:text-slate-100"
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400")}
            >
              {s[1]}{arrow}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ display: "table", width: "100%", borderCollapse: "separate", borderSpacing: "0 2px" }}>
        {/* Header row */}
        <div
          style={{ display: "table-row", position: "sticky", top: 0, zIndex: 10 }}
          className="bg-white dark:bg-slate-950 print-thead"
        >
          {PORTFOLIO_COLUMNS.map(function (col) {
            const active = col.sort && portSort === col.sort;
            const arrow = active ? (portSortDir === "asc" ? " ↑" : " ↓") : "";
            const clickable = !!col.sort;
            const ariaSort = !active ? "none" : portSortDir === "asc" ? "ascending" : "descending";
            return (
              <div
                key={col.id}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-sort={clickable ? ariaSort : undefined}
                onClick={clickable ? function () { handleHeaderClick(col.sort); } : undefined}
                onKeyDown={clickable ? function (e) {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleHeaderClick(col.sort); }
                } : undefined}
                className={
                  "text-[10px] uppercase tracking-wide pb-1.5 pr-3 sticky top-0 bg-white dark:bg-slate-950 select-none " +
                  (clickable ? "cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded " : "") +
                  (active
                    ? "text-gray-900 dark:text-slate-100 font-semibold"
                    : "text-gray-500 dark:text-slate-400")
                }
                style={{ display: "table-cell" }}
              >
                {col.label}{arrow}
              </div>
            );
          })}
        </div>

        {/* Company rows */}
        {portCos.map(function (c, rowIdx) {
          return (
            <PortfolioRow
              key={c.id}
              company={c}
              portTab={portTab}
              rowIdx={rowIdx}
              rowData={perRowData[c.id]}
              annotations={annotations}
              dark={dark}
              editingTarget={editingTarget}
              setEditingTarget={setEditingTarget}
              updateTargetWeight={updateTargetWeight}
              openDiscussions={openDiscussions}
              onOpenCompany={onOpenCompany}
              onOpenTransactions={onOpenTransactions}
              onAddTransaction={onAddTransaction}
            />
          );
        })}

        {/* CASH / DIVACC */}
        {specialRows.map(function (r) {
          return (
            <PortfolioSpecialRow
              key={r.label}
              label={r.label}
              repShares={r.shares}
              totalMV={totalMV}
              target={r.target}
            />
          );
        })}

        {/* TOTAL */}
        {totalMV > 0 && (
          <PortfolioTotalRow totalTarget={totalTarget} totalRep={totalRep} />
        )}
      </div>
    </div>
  );
}
