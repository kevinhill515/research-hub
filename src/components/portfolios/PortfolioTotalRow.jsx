/* TOTAL row at the bottom of PortfoliosTable.
 *
 * Shows:
 *   - totalTarget / totalRep / diff (unchanged)
 *   - weighted-avg values for columns where a portfolio-level aggregate
 *     is meaningful: Held (Mo), Unreal, 5D%, MOS, MOS Fixed, FPE Range
 *
 * Weighted averages are computed upstream (weight = each company's rep
 * MV, renormalized over finite values) — this component only formats. */

import { PORTFOLIO_COLUMNS } from "./portfolioColumns.js";
import { mosBg, fmtMOS0 } from "../../utils/index.js";
import FpeRangeMini from "../ui/FpeRangeMini.jsx";

const CELL_CLS = "align-middle pr-3 pt-2 pb-2 text-sm font-semibold text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-950 border-t-2 border-slate-200 dark:border-slate-700";
const DIFF_CLS = "align-middle pr-3 pt-2 pb-2 text-sm font-semibold bg-white dark:bg-slate-950 border-t-2 border-slate-200 dark:border-slate-700";

function fmtSignedPct1(n) {
  if (n === null || n === undefined || !isFinite(n)) return null;
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}
function fmtMonths(n) {
  if (n === null || n === undefined || !isFinite(n)) return null;
  return Math.round(n) + "";
}

export default function PortfolioTotalRow({
  totalTarget, totalRep,
  wHeld, wUnreal, wPerf, wMos, wMosFixed, wFpeVal,
}) {
  const diff = totalRep - totalTarget;
  /* Flag totals that don't match target sum by more than 1% — likely a
     data-entry issue (under-allocated targets or missing rep data). */
  const diffColor = Math.abs(diff) > 1 ? "#dc2626" : undefined;

  const mosStyle      = mosBg(wMos);
  const mosFixedStyle = mosBg(wMosFixed);

  const heldTxt    = fmtMonths(wHeld);
  const unrealTxt  = fmtSignedPct1(wUnreal);
  const perfTxt    = fmtSignedPct1(wPerf);
  const mosTxt     = wMos      !== null && wMos      !== undefined ? fmtMOS0(wMos)      : null;
  const mosFixTxt  = wMosFixed !== null && wMosFixed !== undefined ? fmtMOS0(wMosFixed) : null;

  /* FpeRangeMini uses v.peLow5/peHigh5/peMed5/peAvg5/peCurrent. Build a
   * synthetic valuation from the weighted averages. If all five are null
   * (no data), the component returns null and we render a dash. */
  const synthVal = wFpeVal || {};
  const hasAnyFpe = ["peLow5", "peHigh5", "peMed5", "peAvg5", "peCurrent"]
    .some(function (k) { return synthVal[k] !== null && synthVal[k] !== undefined && isFinite(synthVal[k]); });

  /* Map column id -> rendered cell content. Columns not in this map show
     a dash (matches the existing behavior). */
  const content = {
    name:      "TOTAL",
    target:    totalTarget > 0 ? totalTarget.toFixed(1) + "%" : "--",
    rep:       totalRep > 0 ? totalRep.toFixed(1) + "%" : "--",
    diff:      totalTarget > 0 ? (diff > 0 ? "+" : "") + Math.round(diff * 10) / 10 + "%" : "--",
    held:      heldTxt || "--",
    unreal:    unrealTxt
                 ? <span style={{ color: wUnreal >= 0 ? "#166534" : "#dc2626" }}>{unrealTxt}</span>
                 : "--",
    perf:      perfTxt
                 ? <span style={{ color: wPerf >= 0 ? "#166534" : "#dc2626" }}>{perfTxt}</span>
                 : "--",
    mos:       mosTxt && mosStyle
                 ? <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
                         style={{ background: mosStyle.bg, color: mosStyle.color }}>
                     {mosTxt}
                   </span>
                 : "--",
    mosFixed:  mosFixTxt && mosFixedStyle
                 ? <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
                         style={{ background: mosFixedStyle.bg, color: mosFixedStyle.color }}>
                     {mosFixTxt}
                   </span>
                 : "--",
    fpeRange:  hasAnyFpe
                 ? <FpeRangeMini valuation={synthVal} width={100} />
                 : "--",
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
