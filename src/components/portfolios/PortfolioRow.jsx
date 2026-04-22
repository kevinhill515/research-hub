/* Single-company row inside PortfoliosTable.
 *
 * All per-row math is done in the parent's useMemo and handed in via the
 * `rowData` prop. This component is a pure render: no computation, no
 * hooks, no context reads — easy to reason about, cheap to re-render. */

import {
  fmtPrice, fmtMOS, fmtMOS0, shortSector, sectorStyle, countryStyle, truncName,
} from "../../utils/index.js";
import FpeRangeMini from "../ui/FpeRangeMini.jsx";

const CELL_BASE = "align-middle pr-3 py-1.5";

function Cell({ children, className, style, onClick }) {
  return (
    <div
      className={CELL_BASE + (className ? " " + className : "")}
      style={Object.assign({ display: "table-cell" }, style || {})}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function Dash() {
  return <span className="text-gray-400 dark:text-slate-500">--</span>;
}

export default function PortfolioRow(props) {
  const {
    company, portTab, rowIdx, rowData, annotations, dark,
    editingTarget, setEditingTarget, updateTargetWeight,
    openDiscussions, onOpenCompany, onOpenTransactions, onAddTransaction,
  } = props;

  const c = company;
  const {
    val, mos, mosStyle, mosFixed, mosFixedStyle,
    priceVal, avgCostVal, unrealVal,
    target, repWeight, diff,
    lastTx, monthsHeld, perf5d, nextReport, today,
  } = rowData;

  /* Row background: red if significantly underweight, green if over. Zebra otherwise. */
  const rowTint = diff === null ? null
    : diff <= -0.3 ? (dark ? "rgba(220,38,38,0.25)" : "rgba(220,38,38,0.15)")
    : diff >=  0.5 ? (dark ? "rgba(22,101,52,0.30)" : "rgba(22,101,52,0.15)")
    : null;
  const zebraBg = rowTint || (rowIdx % 2 === 0
    ? (dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)")
    : undefined);
  const cellStyle = { background: zebraBg };

  const rowAnnotations = (annotations || []).filter(function (a) {
    return !a.resolved && (
      (a.scope === "row" && a.portfolio === portTab && a.companyId === c.id) ||
      (a.scope === "company" && a.companyId === c.id)
    );
  });

  const daysToReport = nextReport
    ? Math.round((nextReport - today) / (1000 * 60 * 60 * 24))
    : null;
  const nextReportColor = daysToReport === null ? undefined
    : daysToReport <= 7 ? "#dc2626"
    : daysToReport <= 14 ? "#d97706"
    : undefined;

  const editingThis = editingTarget === c.id + "-" + portTab;

  return (
    <div
      onClick={function () { onOpenCompany(c); }}
      className="hover:brightness-110 transition-all"
      style={{ display: "table-row", cursor: "pointer" }}
    >
      {/* Company */}
      <Cell className="text-sm font-medium text-gray-900 dark:text-slate-100" style={cellStyle}>
        <span className="inline-flex items-center gap-1.5" title={c.name}>
          {truncName(c.name, 15)}
          {rowAnnotations.length > 0 && (
            <span
              onClick={function (e) {
                e.stopPropagation();
                openDiscussions({ scope: "row", portfolio: portTab, companyId: c.id });
              }}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold ml-0.5 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/60"
              title="View discussions"
            >
              💬 {rowAnnotations.length}
            </span>
          )}
        </span>
      </Cell>

      {/* Next Report */}
      <Cell className="text-xs" style={Object.assign({}, cellStyle, { color: nextReportColor })}>
        {nextReport ? nextReport.toISOString().slice(0, 10) : "--"}
      </Cell>

      {/* Country */}
      <Cell style={cellStyle}>
        {c.country
          ? (function () {
              const cs = countryStyle(c.country);
              return (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: cs.bg, color: cs.color }}>
                  {c.country}
                </span>
              );
            })()
          : <Dash />}
      </Cell>

      {/* Sector */}
      <Cell style={cellStyle}>
        {c.sector
          ? (function () {
              const ss = sectorStyle(c.sector);
              return (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: ss.bg, color: ss.color }}>
                  {shortSector(c.sector)}
                </span>
              );
            })()
          : <Dash />}
      </Cell>

      {/* Portfolios */}
      <Cell style={cellStyle}>
        <div className="flex gap-1 flex-wrap">
          {(c.portfolios || []).map(function (p) {
            const isCurrent = p === portTab;
            return (
              <span
                key={p}
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: isCurrent ? "#1e40af" : "#1a5c2a", color: "#fff" }}
              >
                {p}
              </span>
            );
          })}
        </div>
      </Cell>

      {/* Held (months) */}
      <Cell
        className="text-xs text-gray-700 dark:text-slate-300 font-mono"
        style={cellStyle}
        onClick={function (e) {
          if ((c.transactions || []).length > 0) {
            e.stopPropagation();
            onOpenTransactions(c);
          }
        }}
      >
        {monthsHeld === null
          ? <Dash />
          : <span className="cursor-pointer hover:underline">{monthsHeld.toFixed(1)}</span>}
      </Cell>

      {/* Last Trade — clicking the date opens Transactions history; the
          "+" button opens the Add Transaction form pre-filled with this
          portfolio + today's date. */}
      <Cell className="text-xs" style={cellStyle}>
        <span className="inline-flex items-center gap-1">
          {lastTx === null
            ? <Dash />
            : (function () {
                const isBuy = (parseFloat(lastTx.shares) || 0) >= 0;
                return (
                  <span
                    className="inline-flex items-center gap-1 font-mono cursor-pointer hover:underline"
                    onClick={function (e) {
                      e.stopPropagation();
                      if ((c.transactions || []).length > 0) onOpenTransactions(c);
                    }}
                  >
                    <span style={{ color: isBuy ? "#166534" : "#dc2626", fontWeight: 700 }}>
                      {isBuy ? "▲" : "▼"}
                    </span>
                    <span className="text-gray-700 dark:text-slate-300">{lastTx.date}</span>
                  </span>
                );
              })()}
          {onAddTransaction && (
            <button
              type="button"
              title="Log a new buy or sell for this company"
              onClick={function (e) { e.stopPropagation(); onAddTransaction(c); }}
              className="ml-0.5 text-[10px] leading-none text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded px-1 py-0.5 border border-blue-200 dark:border-blue-800 bg-transparent cursor-pointer"
            >+</button>
          )}
        </span>
      </Cell>

      {/* Price */}
      <Cell className="text-sm text-gray-900 dark:text-slate-100" style={cellStyle}>
        {!isNaN(priceVal) ? fmtPrice(priceVal) : "--"}
      </Cell>

      {/* Avg Cost */}
      <Cell className="text-sm text-gray-900 dark:text-slate-100" style={cellStyle}>
        {avgCostVal > 0 ? fmtPrice(avgCostVal) : "--"}
      </Cell>

      {/* Unreal */}
      <Cell className="text-sm font-medium" style={cellStyle}>
        {unrealVal === null
          ? <Dash />
          : <span style={{ color: unrealVal >= 0 ? "#166534" : "#dc2626" }}>
              {unrealVal >= 0 ? "+" : ""}{unrealVal.toFixed(1)}%
            </span>}
      </Cell>

      {/* 5D% */}
      <Cell className="text-sm text-gray-900 dark:text-slate-100" style={cellStyle}>
        {perf5d === null
          ? "--"
          : <span style={{ color: perf5d >= 0 ? "#166534" : "#dc2626" }} className="font-medium">
              {perf5d >= 0 ? "+" : ""}{perf5d.toFixed(1)}%
            </span>}
      </Cell>

      {/* MOS */}
      <Cell className="text-sm text-gray-900 dark:text-slate-100" style={cellStyle}>
        {mosStyle
          ? <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: mosStyle.bg, color: mosStyle.color }}>
              {fmtMOS0(mos)}
            </span>
          : "--"}
      </Cell>

      {/* MOS Fixed */}
      <Cell className="text-sm text-gray-900 dark:text-slate-100" style={cellStyle}>
        {mosFixedStyle
          ? <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: mosFixedStyle.bg, color: mosFixedStyle.color }}>
              {fmtMOS0(mosFixed)}
            </span>
          : "--"}
      </Cell>

      {/* FPE Range */}
      <Cell style={cellStyle}>
        {(function () {
          const el = <FpeRangeMini valuation={val} width={100} />;
          return el || <Dash />;
        })()}
      </Cell>

      {/* Target % */}
      <Cell
        className="text-sm text-gray-900 dark:text-slate-100"
        style={cellStyle}
        onClick={function (e) { e.stopPropagation(); setEditingTarget(c.id + "-" + portTab); }}
      >
        {editingThis ? (
          <input
            type="number" step="0.1" min="0" max="100"
            defaultValue={target > 0 ? target : ""}
            autoFocus
            aria-label={"Target weight for " + c.name}
            onBlur={function (e) { updateTargetWeight(c.id, portTab, e.target.value); setEditingTarget(null); }}
            onKeyDown={function (e) {
              if (e.key === "Enter") e.target.blur();
              if (e.key === "Escape") setEditingTarget(null);
            }}
            placeholder="0.0"
            className="w-14 px-1 py-0 text-sm rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-slate-900 focus:outline-none"
          />
        ) : (
          <span className="cursor-text hover:bg-slate-100 dark:hover:bg-slate-800 px-1 rounded">
            {target > 0 ? parseFloat(target).toFixed(1) + "%" : "--"}
          </span>
        )}
      </Cell>

      {/* Rep % */}
      <Cell className="text-sm text-gray-900 dark:text-slate-100" style={cellStyle}>
        {repWeight !== null ? repWeight.toFixed(1) + "%" : "--"}
      </Cell>

      {/* Diff */}
      <Cell
        className="text-sm font-semibold"
        style={Object.assign({}, cellStyle, {
          color: diff === null ? undefined
               : diff <= -0.3 ? "#dc2626"
               : diff >=  0.5 ? "#166534"
               : undefined,
        })}
      >
        {diff !== null ? (diff > 0 ? "+" : "") + diff + "%" : "--"}
      </Cell>
    </div>
  );
}
