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

import { useMemo, useEffect, useState } from "react";
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
import MobilePortfolioCard from "./MobilePortfolioCard.jsx";
import { evaluateAlertsForCompany } from "../../utils/alerts.js";

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
  const { portTab, repData, fxRates, tickerOwners, portTotal } = ctx;

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
                  /* Use the pre-computed portfolio total instead of
                     re-summing every comparison — was O(n²) inside sort. */
                  const t = parseFloat((c.portWeights || {})[portTab]) || 0;
                  const mv = calcCompanyRepMV(c, repData[portTab] || {}, fxRates, tickerOwners);
                  const rw = calcRepWeight(mv, portTotal);
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
    setTxFilter, setSelCoOrigin, setSelCo, setTab, setCoView,
    openDiscussions, onAddTransaction,
  } = props;
  /* editingTarget is local to this table — was previously hoisted to
     App.jsx and triggered a top-level re-render on every cell click. */
  const [editingTarget, setEditingTarget] = useState(null);
  const {
    companies, repData, fxRates, specialWeights, annotations, dark,
    updateTargetWeight, alertRules, lastPriceUpdate,
  } = useCompanyContext();

  /* ---- Per-company alerts, memoized so evaluateAlertsForCompany doesn't
     run twice per row on every parent re-render (mobile + desktop both
     consume it). Keyed by company id; only the warn-severity ones are
     surfaced as 🚩 indicators. */
  const perRowAlerts = useMemo(function () {
    const out = {};
    const ctx = { lastPriceUpdate: lastPriceUpdate };
    (companies || []).forEach(function (c) {
      out[c.id] = evaluateAlertsForCompany(c, alertRules || {}, ctx)
        .filter(function (a) { return a.severity === "warn"; });
    });
    return out;
  }, [companies, alertRules, lastPriceUpdate]);

  /* ---- Derive portfolio data ---- */
  const { portCos, portRep, tickerOwners, totalMV, perRowData } = useMemo(function () {
    const pRep = repData[portTab] || {};
    const inPort = companies.filter(function (c) { return (c.portfolios || []).indexOf(portTab) >= 0; });
    const others = companies.filter(function (c) { return (c.portfolios || []).indexOf(portTab)  < 0; });
    const owners = buildTickerOwners(inPort, others);
    const total = calcTotalMV(inPort, pRep, fxRates, owners);

    /* Sort the companies. Pass `total` (already computed above) so the
       diff-getter doesn't re-sum the whole portfolio per pair-comparison. */
    const cmp = makeComparator(portSort, portSortDir, {
      portTab, repData, fxRates, tickerOwners: owners, portTotal: total,
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

  /* ---- Totals for the TOTAL row ----
   *
   * Rep % aggregates CASH/DIVACC too (raw MVs summed, rounded once).
   *
   * The per-column weighted averages (held, unreal, perf, MOS, MOS Fixed,
   * and the 5 FPE-range fields) weight each company by its rep MV, and
   * renormalize over companies that have a finite value for that column.
   * A missing MOS on one holding doesn't drag the portfolio MOS toward
   * zero — it just drops that holding out of the denominator.
   *
   * CASH/DIVACC are intentionally excluded from these column-level avgs
   * (they have no held/MOS/etc.) but they ARE counted in totalRep. */
  const { totalTarget, totalRep, wHeld, wUnreal, wPerf, wMos, wMosFixed, wFpeVal } = useMemo(function () {
    let tgt = 0;
    let rawRep = 0;

    /* Column accumulators: { sumWV, sumW } per field. */
    function mkAcc() { return { sumWV: 0, sumW: 0 }; }
    const acc = {
      held: mkAcc(), unreal: mkAcc(), perf: mkAcc(),
      mos: mkAcc(), mosFixed: mkAcc(),
      peLow5: mkAcc(), peHigh5: mkAcc(), peMed5: mkAcc(),
      peAvg5: mkAcc(), peCurrent: mkAcc(),
    };
    function add(accKey, v, w) {
      if (!isFinite(v) || !(w > 0)) return;
      acc[accKey].sumWV += w * v;
      acc[accKey].sumW  += w;
    }

    portCos.forEach(function (c) {
      tgt += parseFloat((c.portWeights || {})[portTab]) || 0;
      const r = perRowData[c.id];
      rawRep += r.repMV;
      const w = r.repMV;
      if (!(w > 0)) return; /* 0-MV companies don't vote */
      add("held",     r.monthsHeld, w);
      add("unreal",   r.unrealVal,  w);
      add("perf",     r.perf5d,     w);
      add("mos",      r.mos,        w);
      add("mosFixed", r.mosFixed,   w);
      const val = c.valuation || {};
      add("peLow5",    parseFloat(val.peLow5),    w);
      add("peHigh5",   parseFloat(val.peHigh5),   w);
      add("peMed5",    parseFloat(val.peMed5),    w);
      add("peAvg5",    parseFloat(val.peAvg5),    w);
      add("peCurrent", parseFloat(val.peCurrent), w);
    });

    const cashShares = repShares(portRep.CASH);
    const divShares  = repShares(portRep.DIVACC);
    const divTgt  = parseFloat((specialWeights.DIVACC || {})[portTab]) || 0;
    /* CASH target is DERIVED so the portfolio total always sums to 100%.
       Earlier we stored CASH as independent state and auto-shifted it on
       each edit, but the stored value could drift (e.g. after adding a
       new holding through a path that bypasses updateTargetWeight). By
       computing it as (100 - company targets - DIVACC), clamped to 0,
       the sum is correct by construction. */
    const cashTgt = Math.max(0, Math.round((100 - tgt - divTgt) * 10) / 10);
    tgt += cashTgt + divTgt;
    rawRep += cashShares + divShares;
    const rep = totalMV > 0 ? Math.round(rawRep / totalMV * 1000) / 10 : 0;

    function avg(a) { return a.sumW > 0 ? a.sumWV / a.sumW : null; }

    return {
      totalTarget: tgt,
      totalRep:    rep,
      wHeld:       avg(acc.held),
      wUnreal:     avg(acc.unreal),
      wPerf:       avg(acc.perf),
      wMos:        avg(acc.mos),
      wMosFixed:   avg(acc.mosFixed),
      wFpeVal: {
        peLow5:    avg(acc.peLow5),
        peHigh5:   avg(acc.peHigh5),
        peMed5:    avg(acc.peMed5),
        peAvg5:    avg(acc.peAvg5),
        peCurrent: avg(acc.peCurrent),
      },
    };
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

  /* ---- CASH / DIVACC special rows (only render when there's data) ----
     CASH target is derived (100 - sum of company targets - DIVACC target),
     so it's always consistent with the portfolio sum. */
  const cashShares = repShares(portRep.CASH);
  const divShares  = repShares(portRep.DIVACC);
  const divTgt  = parseFloat((specialWeights.DIVACC || {})[portTab]) || 0;
  const sumCoTargets = portCos.reduce(function (s, c) {
    return s + (parseFloat((c.portWeights || {})[portTab]) || 0);
  }, 0);
  const cashTgt = Math.max(0, Math.round((100 - sumCoTargets - divTgt) * 10) / 10);
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
    /* Land on the company Dashboard rather than the Valuation section.
       Dashboard gives a fuller at-a-glance read; users wanting to edit
       valuation can still click the Valuation subtab from there. */
    setCoView("dashboard");
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

      {/* Mobile: stacked card layout (one card per company). Hidden on
          sm+ so the existing desktop grid table renders unchanged. */}
      <div className="sm:hidden">
        {portCos.map(function (c) {
          var rowAlerts = perRowAlerts[c.id] || [];
          return (
            <MobilePortfolioCard
              key={c.id}
              company={c}
              rowData={perRowData[c.id]}
              alertsForCompany={rowAlerts}
              dark={dark}
              onOpenCompany={onOpenCompany}
              onOpenTransactions={onOpenTransactions}
            />
          );
        })}
        {/* Mobile TOTAL summary — compact: target/rep/diff trio + AUM */}
        {totalMV > 0 && (
          <div className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/70 px-3 py-2.5 mt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-bold text-gray-900 dark:text-slate-100">TOTAL</span>
              <span className="text-[10px] text-gray-500 dark:text-slate-400">
                ${totalMV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded bg-white/60 dark:bg-slate-900/40 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Target</div>
                <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">{totalTarget.toFixed(1)}%</div>
              </div>
              <div className="rounded bg-white/60 dark:bg-slate-900/40 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Rep</div>
                <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">{totalRep.toFixed(1)}%</div>
              </div>
              <div className="rounded bg-white/60 dark:bg-slate-900/40 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-gray-500 dark:text-slate-400">MOS</div>
                <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">
                  {wMos !== null && isFinite(wMos) ? wMos.toFixed(0) : "--"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: full grid table — unchanged from before. Wrapper carries
          the responsive hide; inner div keeps its display:table for the grid.
          overflow-x:auto + overflow-y:visible lets the Name column stick to
          the left edge on horizontal scroll while the header row still
          sticks to the top of the page on vertical scroll. */}
      <div className="hidden sm:block" style={{ overflowX: "auto", overflowY: "visible" }}>
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
                  (col.id === "name" ? "left-0 z-20 " : "z-10 ") +
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
          var rowAlerts = perRowAlerts[c.id] || [];
          return (
            <PortfolioRow
              key={c.id}
              company={c}
              portTab={portTab}
              rowIdx={rowIdx}
              rowData={perRowData[c.id]}
              annotations={annotations}
              alertsForCompany={rowAlerts}
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
          <PortfolioTotalRow
            totalTarget={totalTarget}
            totalRep={totalRep}
            wHeld={wHeld}
            wUnreal={wUnreal}
            wPerf={wPerf}
            wMos={wMos}
            wMosFixed={wMosFixed}
            wFpeVal={wFpeVal}
          />
        )}
      </div>
      </div>
    </div>
  );
}
