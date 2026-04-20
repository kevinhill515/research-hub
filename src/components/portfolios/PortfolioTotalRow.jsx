/* TOTAL row at the bottom of PortfoliosTable. Takes already-computed
 * aggregate values and renders them in the target/rep/diff columns. */

import { PORTFOLIO_COLUMNS } from "./portfolioColumns.js";

const CELL_CLS = "align-middle pr-3 pt-2 pb-2 text-sm font-semibold text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-950 border-t-2 border-slate-200 dark:border-slate-700";
const DIFF_CLS = "align-middle pr-3 pt-2 pb-2 text-sm font-semibold bg-white dark:bg-slate-950 border-t-2 border-slate-200 dark:border-slate-700";

export default function PortfolioTotalRow({ totalTarget, totalRep }) {
  const diff = totalRep - totalTarget;
  /* Flag totals that don't match target sum by more than 1% — likely a
     data-entry issue (under-allocated targets or missing rep data). */
  const diffColor = Math.abs(diff) > 1 ? "#dc2626" : undefined;

  const content = {
    name:   "TOTAL",
    target: totalTarget > 0 ? totalTarget.toFixed(1) + "%" : "--",
    rep:    totalRep > 0 ? totalRep.toFixed(1) + "%" : "--",
    diff:   totalTarget > 0 ? (diff > 0 ? "+" : "") + Math.round(diff * 10) / 10 + "%" : "--",
  };

  return (
    <div style={{ display: "table-row" }}>
      {PORTFOLIO_COLUMNS.map(function (col) {
        const isDiff = col.id === "diff";
        const style = { display: "table-cell" };
        if (isDiff) style.color = diffColor;
        return (
          <div key={col.id} className={isDiff ? DIFF_CLS : CELL_CLS} style={style}>
            {content[col.id] !== undefined ? content[col.id] : "--"}
          </div>
        );
      })}
    </div>
  );
}
