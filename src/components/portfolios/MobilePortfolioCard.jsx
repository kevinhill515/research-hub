/* Mobile-only card view of one company in one portfolio.
 *
 * Replaces the wide PortfolioRow (15+ columns of dense data) with a
 * stacked card layout that fits comfortably on a 375px phone. Same
 * data, different shape. Tap the card to open the company detail.
 *
 * Renders only at <sm; PortfoliosTable hides this layout on desktop
 * and shows the existing grid table instead. */

import { fmtPrice, fmtMOS0, sectorStyle, countryStyle } from '../../utils/index.js';
import { isFiniteNum } from '../../utils/numbers.js';

const STATUS_STYLE = {
  Own:   { bg: "#dcfce7", color: "#166534" },
  Focus: { bg: "#dbeafe", color: "#1e40af" },
  Watch: { bg: "#fef9c3", color: "#854d0e" },
  Sold:  { bg: "#fee2e2", color: "#991b1b" },
};

function fmtMOSPct(v) {
  return isFiniteNum(v) ? (v >= 0 ? "+" : "") + fmtMOS0(v) : "--";
}
function fmtPctOrDash(v) {
  if (!isFiniteNum(v)) return "--";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
function fmtDateShort(d) {
  if (!d) return "--";
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return "--";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d;
}

export default function MobilePortfolioCard(props) {
  const { company, rowData, alertsForCompany, dark, onOpenCompany, onOpenTransactions } = props;
  const c = company;
  const {
    val, mos, mosStyle, mosFixed, mosFixedStyle,
    priceVal, target, repWeight, diff,
    lastTx, monthsHeld, perf5d, nextReport, today,
  } = rowData;

  /* Background tint by diff bucket — same logic as PortfolioRow.
     Subtle on cards (mobile) so the tint doesn't dominate. */
  const tintBg =
    diff === null ? null
    : diff <= -0.3 ? (dark ? "rgba(220,38,38,0.25)" : "rgba(220,38,38,0.10)")
    : diff >=  0.5 ? (dark ? "rgba(22,101,52,0.30)" : "rgba(22,101,52,0.10)")
    : null;

  const statusCfg = STATUS_STYLE[c.status] || null;
  const sectorCfg = c.sector ? sectorStyle(c.sector) : null;
  const countryCfg = c.country ? countryStyle(c.country) : null;

  const mosGap = (mos !== null && mosFixed !== null) ? Math.abs(mos - mosFixed) : null;
  const mosDiverges = mosGap !== null && mosGap > 10;

  const daysToNext = nextReport && today
    ? Math.round((nextReport.getTime() - today.getTime()) / (24 * 3600 * 1000))
    : null;

  return (
    <div
      onClick={function(){ onOpenCompany && onOpenCompany(c); }}
      className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 mb-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      style={tintBg ? { background: tintBg } : undefined}
    >
      {/* Header row: name + alerts + status */}
      <div className="flex items-center gap-2 mb-1.5 min-w-0">
        <span className="font-semibold text-sm text-gray-900 dark:text-slate-100 flex-1 truncate" title={c.name}>{c.name}</span>
        {(alertsForCompany || []).length > 0 && (
          <span title={alertsForCompany.map(function(a){return "• " + a.message;}).join("\n")} className="text-[12px] text-red-600 dark:text-red-400 shrink-0 font-bold">🚩</span>
        )}
        {statusCfg && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0" style={{ background: statusCfg.bg, color: statusCfg.color }}>{c.status}</span>
        )}
      </div>

      {/* Tag row: tier, sector, country */}
      <div className="flex flex-wrap gap-1 mb-2">
        {c.tier && <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300">{c.tier}</span>}
        {sectorCfg && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: sectorCfg.bg, color: sectorCfg.color }}>{c.sector}</span>}
        {countryCfg && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: countryCfg.bg, color: countryCfg.color }}>{c.country}</span>}
      </div>

      {/* Highlight: Target / Rep / Diff trio — the rebalancing read */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="rounded bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Target</div>
          <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">{isFiniteNum(target) ? target.toFixed(1) + "%" : "--"}</div>
        </div>
        <div className="rounded bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Rep</div>
          <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">{isFiniteNum(repWeight) ? repWeight.toFixed(1) + "%" : "--"}</div>
        </div>
        <div className="rounded bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Diff</div>
          <div className={"text-sm font-semibold tabular-nums " + (
            !isFiniteNum(diff) ? "text-gray-400 dark:text-slate-500"
            : diff <= -0.3 ? "text-red-700 dark:text-red-400"
            : diff >=  0.5 ? "text-green-700 dark:text-green-400"
            : "text-gray-700 dark:text-slate-200"
          )}>{isFiniteNum(diff) ? (diff >= 0 ? "+" : "") + diff.toFixed(1) + "%" : "--"}</div>
        </div>
      </div>

      {/* Valuation row: MOS / MOS Fixed (with divergence dot) / 5D */}
      <div className="grid grid-cols-3 gap-1.5 mb-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-wide text-gray-500 dark:text-slate-400">MOS</span>
          {mosStyle ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: mosStyle.bg, color: mosStyle.color }}>{fmtMOS0(mos)}</span>
          ) : <span className="text-gray-400 dark:text-slate-500">--</span>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Fixed</span>
          {mosFixedStyle ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: mosFixedStyle.bg, color: mosFixedStyle.color }}>{fmtMOS0(mosFixed)}</span>
              {mosDiverges && <span title={"Diverges from MOS by " + mosGap.toFixed(1) + "pp"} className="inline-block w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400"/>}
            </span>
          ) : <span className="text-gray-400 dark:text-slate-500">--</span>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-wide text-gray-500 dark:text-slate-400">5D</span>
          <span className={"tabular-nums font-medium " + (
            !isFiniteNum(perf5d) ? "text-gray-400 dark:text-slate-500"
            : perf5d >= 0 ? "text-green-700 dark:text-green-400"
            : "text-red-700 dark:text-red-400"
          )}>{fmtPctOrDash(perf5d)}</span>
        </div>
      </div>

      {/* Footer: price · next report · last tx · months held */}
      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 dark:text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800">
        <span>{isFiniteNum(priceVal) ? "$" + fmtPrice(priceVal) : ""}</span>
        <span>{daysToNext != null ? (
          daysToNext === 0 ? "Reports today" :
          daysToNext > 0 ? "Reports in " + daysToNext + "d" :
          "Reported " + Math.abs(daysToNext) + "d ago"
        ) : ""}</span>
        <span>{isFiniteNum(monthsHeld) ? "Held " + Math.round(monthsHeld) + "mo" : ""}</span>
        {onOpenTransactions && (
          <span onClick={function(e){ e.stopPropagation(); onOpenTransactions(c); }} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">Tx →</span>
        )}
      </div>
    </div>
  );
}
