/* Single-company row inside PortfoliosTable.
 *
 * All per-row math is done in the parent's useMemo and handed in via the
 * `rowData` prop. This component is a pure render: no computation, no
 * hooks, no context reads — easy to reason about, cheap to re-render.
 *
 * Wrapped in React.memo so unrelated parent re-renders (e.g. a different
 * row's edit, a tab toggle elsewhere in App) don't re-render every row.
 * Only re-renders when one of the props' shallow identity changes. */

import { memo } from "react";
import {
  fmtPrice, fmtMOS, fmtMOS0, shortSector, sectorStyle, countryStyle, truncName,
} from "../../utils/index.js";
import FpeRangeMini from "../ui/FpeRangeMini.jsx";
import { TEAM_COLORS } from "../../constants/index.js";
import { useCompanyContext } from "../../context/CompanyContext.jsx";

const RECENT_TARGET_CHANGE_DAYS = 6;
/* Build the same stable key the Meeting Memo modal uses for target-change
   acknowledgments. Both surfaces have to agree on the key or "mark as
   seen" in one place won't quiet the pill in the other. */
function targetChangeKey(co, h) {
  if (h && h.id) return h.id;
  return (co.id || "") + "|" + (h.portfolio || "") + "|" + (h.date || "") + "|" +
    (h.newWeight != null ? h.newWeight : h.weight);
}
function _daysAgo(iso) {
  if (!iso) return Infinity;
  var d = new Date(iso);
  if (isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

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

function PortfolioRow(props) {
  const {
    company, portTab, rowIdx, rowData, annotations, alertsForCompany, dark,
    editingTarget, setEditingTarget, updateTargetWeight, markTradeAgenda,
    proposeTargetWeight, clearProposedWeight,
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

  /* Currently-stamped agenda action for THIS (company, portfolio).
     History is prepended, so the first matching entry is the most
     recent stamp. Used to highlight the corresponding B/A/P/S button
     so the PM sees what's already on the agenda during the meeting. */
  const rowAgendaAction = (function () {
    const hist = company.portWeightHistory || [];
    for (let i = 0; i < hist.length; i++) {
      const h = hist[i];
      if (h.isAgenda && h.portfolio === portTab && h.action) return h.action;
    }
    return null;
  })();
  /* Author of the active B/A/P/S stamp — used to render a small
     TEAM_COLORS dot on the active button so teammates can see WHO
     proposed it at a glance. Data was already in portWeightHistory
     but wasn't surfaced before. */
  const rowAgendaAuthor = (function () {
    const hist = company.portWeightHistory || [];
    for (let i = 0; i < hist.length; i++) {
      const h = hist[i];
      if (h.isAgenda && h.portfolio === portTab && h.action) return h.author || h.user || null;
    }
    return null;
  })();
  /* Pending target-weight PROPOSAL on this row's portfolio. Distinct
     from the unread-change pill below: this one says "the target sitting
     here isn't committed yet — someone proposed it, waiting for lock-in."
     A pending entry is portWeightHistory[i] with isAgenda:true and a
     newWeight and NO action (B/A/P/S stamps also use isAgenda:true but
     carry an action). When this exists, the Target % cell renders the
     proposed value with the amber-dashed treatment instead of the
     committed portWeights value. */
  const pendingTargetProposal = (function () {
    const hist = company.portWeightHistory || [];
    for (let i = 0; i < hist.length; i++) {
      const h = hist[i];
      if (h && h.isAgenda && h.portfolio === portTab && !h.action
          && h.newWeight !== undefined && h.newWeight !== null) {
        return h;
      }
    }
    return null;
  })();
  /* Recent committed (non-agenda) target-weight change on this row's
     portfolio that the current user hasn't acknowledged yet. Surfaces
     as an amber ⏳ pill next to the Target % cell so a teammate's
     overnight change jumps out — without forcing the user to dig
     through the Meeting Memo modal. */
  const { targetChangeReads, currentUser, markTargetChangeRead } = useCompanyContext();
  const unreadTargetChange = (function () {
    const hist = company.portWeightHistory || [];
    const reads = targetChangeReads || {};
    for (let i = 0; i < hist.length; i++) {
      const h = hist[i];
      if (!h || h.isAgenda) continue;
      if (h.portfolio !== portTab) continue;
      if (_daysAgo(h.date) > RECENT_TARGET_CHANGE_DAYS) continue;
      const key = targetChangeKey(company, h);
      const seenBy = reads[key] || [];
      if (seenBy.indexOf(currentUser) >= 0) continue;
      /* Don't surface a "change" if the user themselves made it. They
         already know. */
      if ((h.author || h.user) === currentUser) continue;
      return { key: key, h: h };
    }
    return null;
  })();
  const TRADE_BTNS = [
    ["B", "Buy",  "#16a34a"],
    ["A", "Add",  "#0891b2"],
    ["P", "Pare", "#d97706"],
    ["S", "Sell", "#dc2626"],
  ];

  return (
    <div
      onClick={function () { onOpenCompany(c); }}
      className="group hover:brightness-110 transition-all"
      /* contentVisibility skips off-screen row painting. "auto 44px" =
         remember actual size; 44px placeholder height for first paint.
         Two-value syntax avoids accidentally setting width to 44px too. */
      style={{ display: "table-row", cursor: "pointer", contentVisibility: "auto", containIntrinsicSize: "auto 44px" }}
    >
      {/* Company — sticky-left so the name stays visible while
          horizontal scrolling. Cell needs an OPAQUE background since
          other cells scroll behind it, but it also has to show the
          row's tier/diff tint (otherwise the highlight stops at the
          Next-Report column). Trick: layer the (translucent) tint as
          a linear-gradient image on top of the opaque base color. */}
      <Cell
        className="text-sm font-medium text-gray-900 dark:text-slate-100 sticky left-0 z-[5]"
        style={{
          backgroundColor: dark ? "#020617" : "#ffffff",
          backgroundImage: zebraBg ? "linear-gradient(" + zebraBg + ", " + zebraBg + ")" : undefined,
        }}
      >
        <span className="inline-flex items-center gap-1.5" title={c.name}>
          {truncName(c.name, 15)}
          {/* B/A/P/S trade-agenda buttons — per (company, portfolio).
              Click during the IC meeting to stamp the planned trade;
              the PM Meeting Memo's Trading Agenda section reads these
              entries. Highlighted when one's already stamped for this
              row. */}
          {markTradeAgenda && (
            /* Compact mode: when no button is active, the whole strip
               stays hidden until the row is hovered so the Company
               column doesn't gain ~104px of permanent width (which
               was forcing the Last Tx date to wrap to two lines).
               When a button IS active, the active one stays visible
               (so you can still see what's stamped on each row at a
               glance) and the inactive siblings reveal on hover. */
            <span
              className={"inline-flex gap-0.5 ml-0.5 shrink-0 " + (rowAgendaAction ? "" : "hidden group-hover:inline-flex")}
              onClick={function (e) { e.stopPropagation(); }}
            >
              {TRADE_BTNS.map(function (b) {
                const active = rowAgendaAction === b[1];
                /* Author dot — TEAM_COLORS pip in the top-right corner
                   of the active button. Surfaces who stamped this
                   B/A/P/S without making the user dig through the
                   PM Meeting modal. Data was already in
                   portWeightHistory[].author; previously unused in UI. */
                const dotColor = active && rowAgendaAuthor ? (TEAM_COLORS[rowAgendaAuthor] || null) : null;
                return (
                  <button
                    key={b[0]}
                    type="button"
                    onClick={function (e) { e.stopPropagation(); markTradeAgenda(c.id, portTab, b[1]); }}
                    title={active && rowAgendaAuthor ? "Proposed " + b[1] + " by " + rowAgendaAuthor + " — click to clear" : ("Propose " + b[1] + " for " + portTab)}
                    className={"relative text-[10px] font-bold w-5 h-5 rounded-sm leading-none border transition-colors " + (active ? "text-white shadow" : "text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-400 hidden group-hover:inline-block")}
                    /* Dashed amber outline on the active button signals
                       PROPOSED (not yet locked in). After lock-in,
                       isAgenda flips false → the button is no longer
                       "active" → no outline. Matches the dashed amber
                       treatment on the Target % cell so both signals
                       read as one visual language. */
                    style={active ? { background: b[2], borderColor: b[2], outline: "2px dashed #f59e0b", outlineOffset: "1px" } : undefined}
                  >
                    {b[0]}
                    {dotColor && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-white dark:ring-slate-900"
                        style={{ background: dotColor }}
                      />
                    )}
                  </button>
                );
              })}
            </span>
          )}
          {(alertsForCompany || []).length > 0 && (
            <span
              title={alertsForCompany.map(function(a){return "• " + a.message;}).join("\n")}
              className="text-[11px] text-red-600 dark:text-red-400 shrink-0 font-bold"
            >🚩</span>
          )}
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

      {/* Next Report — clicks to Earnings & Thesis Check (where the
         next-report date is set and prior reports are listed). */}
      <Cell
        className="text-xs cursor-pointer"
        style={Object.assign({}, cellStyle, { color: nextReportColor })}
        onClick={function (e) { e.stopPropagation(); onOpenCompany(c, "earnings"); }}
      >
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

      {/* Held (months) — always opens Transactions (the page where
         the months-held is derived from). Companies with no recorded
         transactions still benefit from landing there to see the
         empty state. */}
      <Cell
        className="text-xs text-gray-700 dark:text-slate-300 font-mono cursor-pointer"
        style={cellStyle}
        onClick={function (e) { e.stopPropagation(); onOpenTransactions(c); }}
      >
        {monthsHeld === null
          ? <Dash />
          : <span className="hover:underline">{monthsHeld.toFixed(1)}</span>}
      </Cell>

      {/* Last Trade — clicks open Transactions history; the "+" button
          opens the Add Transaction form pre-filled with this portfolio
          + today's date. Whole cell is clickable so "--" (no trades)
          rows can also navigate to the empty Transactions view. */}
      <Cell
        className="text-xs cursor-pointer"
        style={cellStyle}
        onClick={function (e) { e.stopPropagation(); onOpenTransactions(c); }}
      >
        <span className="inline-flex items-center gap-1">
          {lastTx === null
            ? <Dash />
            : (function () {
                const isBuy = (parseFloat(lastTx.shares) || 0) >= 0;
                return (
                  <span className="inline-flex items-center gap-1 font-mono hover:underline">
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

      {/* Unreal — derived from avg cost vs current price, both of
         which live on the Transactions page. Clicks there. */}
      <Cell
        className="text-sm font-medium cursor-pointer"
        style={cellStyle}
        onClick={function (e) { e.stopPropagation(); onOpenTransactions(c); }}
      >
        {unrealVal === null
          ? <Dash />
          : <span style={{ color: unrealVal >= 0 ? "#166534" : "#dc2626" }}>
              {unrealVal >= 0 ? "+" : ""}{unrealVal.toFixed(1)}%
            </span>}
      </Cell>

      {/* 5D% — clicks to Snapshot. */}
      <Cell className="text-sm text-gray-900 dark:text-slate-100 cursor-pointer" style={cellStyle} onClick={function(e){e.stopPropagation();onOpenCompany(c,"metrics");}}>
        {perf5d === null
          ? "--"
          : <span style={{ color: perf5d >= 0 ? "#166534" : "#dc2626" }} className="font-medium">
              {perf5d >= 0 ? "+" : ""}{perf5d.toFixed(1)}%
            </span>}
      </Cell>

      {/* MOS Live — clicks to Valuation section. */}
      <Cell className="text-sm text-gray-900 dark:text-slate-100 cursor-pointer" style={cellStyle} onClick={function(e){e.stopPropagation();onOpenCompany(c,"section:Valuation");}}>
        {mosStyle
          ? <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: mosStyle.bg, color: mosStyle.color }}>
              {fmtMOS0(mos)}
            </span>
          : "--"}
      </Cell>

      {/* MOS Fixed — clicks to Valuation section. Amber dot when
          |mos - mosFixed| > 10pp (matches the mos-divergence alert
          rule). */}
      <Cell className="text-sm text-gray-900 dark:text-slate-100 cursor-pointer" style={cellStyle} onClick={function(e){e.stopPropagation();onOpenCompany(c,"section:Valuation");}}>
        {mosFixedStyle
          ? (function(){
              var gap = (mos !== null && mosFixed !== null) ? Math.abs(mos - mosFixed) : null;
              var diverges = gap !== null && gap > 10;
              return (
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span title={diverges ? "MOS Fixed diverges from MOS by " + gap.toFixed(1) + "pp — fixed TP may be stale" : "MOS using fixed TP"} className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: mosFixedStyle.bg, color: mosFixedStyle.color }}>
                    {fmtMOS0(mosFixed)}
                  </span>
                  {diverges && <span title={"Diverges from MOS by " + gap.toFixed(1) + "pp"} className="inline-block w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0"/>}
                </span>
              );
            })()
          : "--"}
      </Cell>

      {/* FPE Range — clicks to Valuation. */}
      <Cell style={cellStyle} className="cursor-pointer" onClick={function(e){e.stopPropagation();onOpenCompany(c,"section:Valuation");}}>
        {(function () {
          const el = <FpeRangeMini valuation={val} width={100} />;
          return el || <Dash />;
        })()}
      </Cell>

      {/* Target % — proposal-aware. When pendingTargetProposal exists,
          the cell displays the PROPOSED value with an amber wash + left
          border (signaling "uncommitted") and an author pip in the
          corner. Editing the cell calls proposeTargetWeight (not the
          legacy updateTargetWeight) — so the value sits in the
          proposed state until "Lock in" fires at the top of the page.
          When no proposal exists, behavior is identical to before. */}
      {(function () {
        const proposedNum = pendingTargetProposal ? parseFloat(pendingTargetProposal.newWeight) : null;
        const showProposed = pendingTargetProposal && isFinite(proposedNum);
        const proposalAuthor = showProposed ? (pendingTargetProposal.author || pendingTargetProposal.user || "") : "";
        const proposalDotColor = proposalAuthor ? (TEAM_COLORS[proposalAuthor] || null) : null;
        /* Composite style: keep the row's diff tint as the base, layer
           a subtle amber wash on top when proposed. */
        /* Use box-shadow inset for the amber stripe instead of
           border-left: a real border adds 2px to the cell's width,
           which shifts every cell to its right and makes the whole
           row jiggle on hover. Inset box-shadow lives entirely inside
           the cell's box and never affects layout. */
        const proposedCellStyle = showProposed
          ? Object.assign({}, cellStyle, {
              backgroundImage: "linear-gradient(rgba(251,191,36,0.18), rgba(251,191,36,0.18))",
              boxShadow: "inset 3px 0 0 #f59e0b",
            })
          : cellStyle;
        return (
          <Cell
            className="text-sm text-gray-900 dark:text-slate-100"
            style={proposedCellStyle}
            onClick={function (e) { e.stopPropagation(); setEditingTarget(c.id + "-" + portTab); }}
          >
            {editingThis ? (
              <input
                type="number" step="0.1" min="0" max="100"
                /* Edit defaults to the CURRENTLY-displayed value
                   (proposed if pending, else committed) so typing
                   amends instead of starting from scratch. */
                defaultValue={showProposed ? proposedNum : (target > 0 ? target : "")}
                autoFocus
                aria-label={"Target weight for " + c.name}
                onBlur={function (e) {
                  if (proposeTargetWeight) proposeTargetWeight(c.id, portTab, e.target.value);
                  else updateTargetWeight(c.id, portTab, e.target.value);
                  setEditingTarget(null);
                }}
                onKeyDown={function (e) {
                  if (e.key === "Enter") e.target.blur();
                  if (e.key === "Escape") setEditingTarget(null);
                }}
                placeholder="0.0"
                className="w-14 px-1 py-0 text-sm rounded border border-amber-400 dark:border-amber-500 bg-white dark:bg-slate-900 focus:outline-none"
              />
            ) : (
              <span className="inline-flex items-center gap-1">
                <span
                  className={"cursor-text hover:bg-slate-100 dark:hover:bg-slate-800 px-1 rounded " +
                    (showProposed ? "italic font-semibold text-amber-800 dark:text-amber-300" : "")}
                  title={showProposed
                    ? ("Proposed " + proposedNum.toFixed(1) + "% by " + (proposalAuthor || "?") +
                       " · committed " + (target > 0 ? parseFloat(target).toFixed(1) + "%" : "—") +
                       " · click to edit, or Lock in at top of page to commit")
                    : undefined}
                >
                  {showProposed ? (
                    /* "Y → X" pattern — shows the committed (was) value
                       struck-through next to the proposed new value, so
                       the reader sees at a glance what the change IS. */
                    <>
                      <span className="text-gray-400 dark:text-slate-500 line-through text-[11px] mr-0.5 not-italic font-normal">
                        {target > 0 ? parseFloat(target).toFixed(1) : "0"}
                      </span>
                      {proposedNum.toFixed(1) + "%"}
                    </>
                  ) : (target > 0 ? parseFloat(target).toFixed(1) + "%" : "--")}
                </span>
                {showProposed && proposalDotColor && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: proposalDotColor }}
                    title={"Proposed by " + (proposalAuthor || "?")}
                  />
                )}
                {showProposed && clearProposedWeight && (
                  <span
                    onClick={function (e) { e.stopPropagation(); clearProposedWeight(c.id, portTab); }}
                    title="Clear this proposal — restores CASH and the committed target"
                    className="text-amber-700 dark:text-amber-400 hover:text-amber-900 cursor-pointer text-[11px] leading-none font-bold"
                  >✕</span>
                )}
                {unreadTargetChange && !showProposed && (
                  <span
                    onClick={function (e) { e.stopPropagation(); markTargetChangeRead(unreadTargetChange.key); }}
                    title={"Target changed " + unreadTargetChange.h.date +
                      (unreadTargetChange.h.author ? " by " + unreadTargetChange.h.author : "") +
                      " — click to mark seen"}
                    className="text-amber-600 dark:text-amber-400 hover:text-amber-800 cursor-pointer text-[11px] leading-none"
                  >⏳</span>
                )}
              </span>
            )}
          </Cell>
        );
      })()}

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

export default memo(PortfolioRow);
