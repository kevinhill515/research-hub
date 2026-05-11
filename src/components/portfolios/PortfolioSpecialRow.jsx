/* CASH / DIVACC row inside PortfoliosTable. Most columns are dashes; only
 * the label, target, rep and diff cells carry data. */

import { PORTFOLIO_COLUMNS } from "./portfolioColumns.js";

const CELL_CLS   = "align-middle pr-3 py-1.5 text-sm text-gray-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800";
const LABEL_CLS  = CELL_CLS + " font-medium";
const DIFF_CLS_BASE = "align-middle pr-3 py-1.5 text-sm font-semibold bg-slate-50 dark:bg-slate-800";

export default function PortfolioSpecialRow({ label, repShares, totalMV, target }) {
  const repWeight = totalMV > 0 ? Math.round(repShares / totalMV * 1000) / 10 : null;
  const t = parseFloat(target) || 0;
  const diff = (repWeight !== null && t > 0) ? Math.round((repWeight - t) * 10) / 10 : null;
  const diffColor = diff === null ? undefined
    : diff <= -0.3 ? "#dc2626"
    : diff >=  0.5 ? "#166534"
    : undefined;

  /* Build cells keyed by column id so the ordering can never drift from
     the header. Only the cells with data are populated; everything else
     renders "--". */
  const content = {
    name:   label,
    target: t > 0 ? t.toFixed(1) + "%" : "--",
    rep:    repWeight !== null ? repWeight.toFixed(1) + "%" : "--",
    diff:   (repWeight !== null && t > 0) ? (diff > 0 ? "+" : "") + diff + "%" : "--",
  };

  return (
    <div style={{ display: "table-row" }}>
      {PORTFOLIO_COLUMNS.map(function (col) {
        const isLabel = col.id === "name";
        const isDiff = col.id === "diff";
        const cls = (isLabel ? LABEL_CLS + " sticky left-0 z-[5]"
                  : isDiff  ? DIFF_CLS_BASE
                  : CELL_CLS);
        const style = { display: "table-cell" };
        if (isDiff) style.color = diffColor;
        return (
          <div key={col.id} className={cls} style={style}>
            {content[col.id] !== undefined ? content[col.id] : "--"}
          </div>
        );
      })}
    </div>
  );
}
