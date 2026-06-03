import { useState, useRef, memo } from "react";
import { useClickOutside } from '../../hooks/useClickOutside.js';
import { PORTFOLIOS, TIER_ORDER, COUNTRY_ORDER, SECTOR_ORDER } from '../../constants/index.js';
import { shortSector, sectorStyle, countryStyle, getTiers, tierPillStyle, tierBg, reviewedColor, daysSince, todayStr, calcNormEPS, calcTP, calcMOS, fmtMOS, fmtMOS0, mosBg, getTpFixed, tierToStatus, truncName, getLastReportedEntry, parseDate, fmtDateUS } from '../../utils/index.js';
import StatusPill from '../ui/StatusPill.jsx';
import NotesCell from '../forms/NotesCell.jsx';
import ActionCell from '../forms/ActionCell.jsx';
import FlagCell from '../forms/FlagCell.jsx';
import DatePicker from '../forms/DatePicker.jsx';
import PortPicker from '../ui/PortPicker.jsx';
import PillEl from '../ui/PillEl.jsx';
import FpeRangeMini from '../ui/FpeRangeMini.jsx';

function CoRow({ company, onSelect, onDelete, onUpdate, compact, visibleCols, selected, onToggleSelect, onQuickUpload, dark, rowAlerts, pendingTpCount, latestTpRejected }) {
  /* `rowAlerts` and `dark` are now lifted to props so this component
     doesn't subscribe to the global context. Combined with React.memo
     below, that means a context update unrelated to this row (e.g. a
     tab switch, an unrelated company edit) doesn't re-render every
     CoRow in the table — significant on the 325-company list. */
  rowAlerts = rowAlerts || [];
  var [editName, setEditName] = useState(false);
  var [nameVal, setNameVal] = useState(company.name);
  var [editCountry, setEditCountry] = useState(false);
  var [editSector, setEditSector] = useState(false);
  var [hovered, setHovered] = useState(false);
  var [showMenu, setShowMenu] = useState(false);
  var menuRef = useRef();
  /* Port add menu — opened by clicking anywhere in the Portfolio cell.
     Click on the cell shouldn't navigate to the company page, so the
     handler stops propagation. Menu lets the user pick whether to add
     a Portfolio (committed) or Port? (considering) without first
     having to hit a tiny + button. */
  var [portMenuOpen, setPortMenuOpen] = useState(false);
  var portMenuRef = useRef();

  useClickOutside(menuRef, function () { setShowMenu(false); }, showMenu);
  useClickOutside(portMenuRef, function () { setPortMenuOpen(false); }, portMenuOpen);

  var missing = [];
  if (!company.country) missing.push("country");
  if (!company.sector) missing.push("sector");
  if (!company.tier) missing.push("tier");

  var tiers = getTiers(company.tier);

  /* Data-driven row background kept as inline style */
  var rowBg = selected
    ? (dark ? "#1e293b" : "#1e3a5f")
    : hovered
      ? undefined   /* handled via className */
      : dark ? undefined : tierBg(company.tier);

  var portfolios = company.portfolios || [];
  var portNote = (company.portNote || "").split(/[,\s]+/).filter(Boolean);
  var cs = company.country ? countryStyle(company.country) : null;
  var ss = company.sector ? sectorStyle(company.sector) : null;
  var availPortNote = PORTFOLIOS.filter(function (p) { return portfolios.indexOf(p) < 0; });
  var show = function (col) { return visibleCols.has(col); };

  /* Q-chip next to the name. Shows the QUARTER REPORTED ON (the period
     the earnings entry covered, not the calendar quarter it was filed
     in). Color still keys off the calendar-quarter freshness check so
     "did they file this quarter?" is the visual signal:
       - Green = latest entry's reportDate is on/after the start of the
         current calendar quarter (they've filed during this window).
       - Amber = latest entry predates the current calendar quarter
         (haven't filed yet this cycle).
     Label = the FY-period quarter from the earnings entry, e.g. a
     company that reports Q1 FY26 results in April 2026 shows 'Q1'
     (not the calendar-Q2 in which it was filed). Prefer the entry's
     `quarter` string ("Q1 FY26") when set, since that's what the user
     typed; otherwise derive a sensible default by subtracting ~60
     days from reportDate (typical reporting lag) and taking that
     calendar quarter as the period. */
  var latestEntry = getLastReportedEntry(company.earningsEntries || []);
  var qBadge = null;
  if (latestEntry && latestEntry.reportDate) {
    var rd = parseDate(latestEntry.reportDate);
    if (rd) {
      var now = new Date();
      var curQ = Math.floor(now.getMonth() / 3);
      var qStart = new Date(now.getFullYear(), curQ * 3, 1);
      var reportedThisQ = rd >= qStart;
      /* Quarter LABEL — what period the report covered. */
      var label;
      var m = (latestEntry.quarter || "").match(/^Q([1-4])/i);
      if (m) {
        label = "Q" + m[1];
      } else {
        /* Fallback: lag the reportDate by 60 days to estimate the
           reported-period end, then take that calendar quarter. */
        var periodEnd = new Date(rd.getTime() - 60 * 86400000);
        label = "Q" + (Math.floor(periodEnd.getMonth() / 3) + 1);
      }
      qBadge = reportedThisQ
        ? { label: label + " ✓", cls: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800", title: "Reported " + (latestEntry.quarter || label) + " on " + fmtDateUS(latestEntry.reportDate) }
        : { label: label,         cls: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",        title: "Last reported " + (latestEntry.quarter || label) + " on " + fmtDateUS(latestEntry.reportDate) + " — hasn't filed this quarter yet" };
    }
  }
  var hasTemplate = Object.keys(company.sections || {}).length > 0;
  var rColor = reviewedColor(company.lastReviewed);
  var rBold = daysSince(company.lastReviewed) > 60;

  var sCfg = {
    "Own":   { bg: "#dcfce7", color: "#166534" },
    "Focus": { bg: "#dbeafe", color: "#1e40af" },
    "Watch": { bg: "#fef9c3", color: "#854d0e" },
    "Sold":  { bg: "#fee2e2", color: "#991b1b" }
  }[company.status] || { bg: undefined, color: undefined };

  var val = company.valuation || {};
  var normEPS = calcNormEPS(val) || parseFloat(val.eps);
  var tp = calcTP(val.pe, normEPS);
  var mos = calcMOS(tp, val.price);
  var mosStyle = mosBg(mos);
  /* Fixed (user-frozen) TP/MOS — uses val.tpFixed if set, or falls back
     to legacy normEPSFixed × pe. Null when neither is set. */
  var tpFixedVal = getTpFixed(val);
  var mosFixed = tpFixedVal !== null ? calcMOS(tpFixedVal, val.price) : null;
  var mosFixedStyle = mosBg(mosFixed);
  /* Divergence flag: MOS vs MOS Fixed differ by > 10pp. Surfaced as a
     small amber dot next to MOS Fixed and a hover tooltip explaining
     the gap. Mirrors the "mos-divergence" alerts rule. */
  var mosGap = (mos !== null && mosFixed !== null) ? Math.abs(mos - mosFixed) : null;
  var mosDiverges = mosGap !== null && mosGap > 10;

  var tdBase = compact
    ? "table-cell align-middle pr-1.5 py-0.5 whitespace-nowrap cursor-pointer transition-colors text-xs"
    : "table-cell align-middle pr-2.5 py-1.5 whitespace-nowrap cursor-pointer transition-colors text-sm";

  var inputCls = "text-xs px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div
      onClick={function () { onSelect(company); }}
      onMouseEnter={function () { setHovered(true); }}
      onMouseLeave={function () { setHovered(false); }}
      className={"table-row group hover:bg-slate-50 dark:hover:bg-slate-800" + (selected ? " bg-blue-950/30" : "")}
      /* contentVisibility: "auto" lets the browser skip rendering off-screen
         rows entirely. "auto 48px" tells the browser: remember the actual
         size after first layout, with 48px as the initial placeholder height.
         Single-value form was incorrect (applies to both width AND height,
         making rows 48×48 squares which broke mobile layout). */
      style={Object.assign(
        { contentVisibility: "auto", containIntrinsicSize: "auto 48px" },
        rowBg ? { background: rowBg } : null,
      )}
    >
      {/* Checkbox */}
      <div
        className={tdBase + " !pr-1.5 !cursor-default"}
        style={rowBg ? { background: rowBg } : undefined}
        onClick={function (e) { e.stopPropagation(); onToggleSelect(company.id); }}
      >
        <input type="checkbox" checked={selected} onChange={function () {}} className="cursor-pointer accent-blue-600" />
      </div>

      {/* Tier(s) — stack=true lets pills wrap to a 2nd row inside the
          cell (max-w bounds the column so multi-tier names don't blow
          out the row width). Matches the Metrics TierCell layout. */}
      {show("Tier(s)") && (
        <div className={tdBase + " !whitespace-normal"} style={Object.assign({ maxWidth: 96 }, rowBg ? { background: rowBg } : {})}>
          <PortPicker compact stack active={tiers} onChange={function (v) { var nt=v.join(", "); var ch={tier:nt}; var s=tierToStatus(nt); if(s)ch.status=s; onUpdate(company.id, ch); }} plusColor="#334155" opts={TIER_ORDER} pillStyleFn={tierPillStyle} />
        </div>
      )}

      {/* Name — sticky-left so the company name stays visible while
          horizontal scrolling. Cell needs an opaque bg (tier-tint in
          light mode, slate-950 in dark, white fallback) since stuff
          scrolls behind it. zIndex below the sticky-top header. */}
      {show("Name") && (
        <div className={tdBase + " sticky left-0 z-[5]"} style={{ background: rowBg || (dark ? "#020617" : "#ffffff") }}>
          <div className="flex items-center gap-1">
            <span
              onClick={function (e) { e.stopPropagation(); onSelect(company); }}
              title="Open"
              className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              &#x2197;
            </span>

            {editName ? (
              <input
                value={nameVal}
                autoFocus
                onChange={function (e) { setNameVal(e.target.value); }}
                onBlur={function () { if (nameVal.trim()) onUpdate(company.id, { name: nameVal.trim() }); setEditName(false); }}
                onKeyDown={function (e) {
                  if (e.key === "Enter") { if (nameVal.trim()) onUpdate(company.id, { name: nameVal.trim() }); setEditName(false); }
                  if (e.key === "Escape") setEditName(false);
                }}
                onClick={function (e) { e.stopPropagation(); }}
                className={inputCls + " font-medium min-w-[100px]" + (compact ? " text-xs" : " text-sm")}
              />
            ) : (
              <span
                onClick={function (e) { e.stopPropagation(); setEditName(true); setNameVal(company.name); }}
                title={company.name}
                className={"font-medium text-gray-900 dark:text-slate-100 border-b border-dashed border-slate-300 dark:border-slate-600 cursor-text" + (compact ? " text-xs" : " text-sm")}
              >
                {truncName(company.name, 15)}
              </span>
            )}

            {qBadge && (
              <span
                title={qBadge.title}
                className={"text-[9px] font-semibold px-1 py-px rounded border shrink-0 leading-none " + qBadge.cls}
              >{qBadge.label}</span>
            )}

            {rowAlerts.length > 0 && (
              <span
                title={rowAlerts.map(function(a){return "• " + a.message;}).join("\n")}
                className="text-[11px] text-red-600 dark:text-red-400 shrink-0 font-bold"
              >🚩</span>
            )}
            {hasTemplate && (
              <span title="Template loaded" className="text-[8px] text-emerald-500 dark:text-emerald-400 shrink-0">&#x25CF;</span>
            )}

            {hovered && (
              <div className="relative inline-block" onClick={function (e) { e.stopPropagation(); }} ref={menuRef}>
                <span
                  onClick={function () { setShowMenu(function (s) { return !s; }); }}
                  className="text-[10px] text-gray-500 dark:text-slate-400 cursor-pointer px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 ml-0.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  &#x22EF;
                </span>
                {showMenu && (
                  <div className="absolute top-full left-0 mt-0.5 z-[200] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-1 shadow-lg min-w-[160px]">
                    <div
                      onClick={function () { setShowMenu(false); onQuickUpload(company); }}
                      className="text-xs px-2.5 py-1.5 cursor-pointer rounded text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      &#x2191; Upload research
                    </div>
                    <div
                      onClick={function () { var today = todayStr(); onUpdate(company.id, { lastReviewed: today }); setShowMenu(false); }}
                      className="text-xs px-2.5 py-1.5 cursor-pointer rounded text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      &#x2713; Mark reviewed today
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FPE Range — clicks to Valuation (where the FPE Low/Med/High
         5y inputs live). Sits between Name and 5D% so valuation
         context reads left-to-right with the identity. */}
      {show("FPE Range") && (
        <div
          className={tdBase + " cursor-pointer"}
          style={rowBg ? { background: rowBg } : undefined}
          onClick={function (e) { e.stopPropagation(); onSelect(company, "section:Valuation"); }}
          title="Open Valuation"
        >
          {(function () {
            var el = <FpeRangeMini valuation={val} width={compact ? 80 : 100} />;
            return el || <span className="text-xs text-gray-400 dark:text-slate-500">--</span>;
          })()}
        </div>
      )}

      {/* 5D% — clicks to Snapshot (where the trailing-period perf bars
         and tables live). */}
      {show("5D%") && (
        <div
          className={tdBase + " cursor-pointer"}
          style={rowBg ? { background: rowBg } : undefined}
          onClick={function (e) { e.stopPropagation(); onSelect(company, "metrics"); }}
          title="Open Snapshot"
        >
          {(function () {
            var ord = (company.tickers || []).find(function (t) { return t.isOrdinary; });
            if (!ord) return <span className="text-xs text-gray-400 dark:text-slate-500">--</span>;
            /* Prefer ord.perf["5D"] (decimal, new format). Fall back to
               legacy ord.perf5d (string "1.2"). */
            var n;
            if (ord.perf && typeof ord.perf["5D"] === "number" && isFinite(ord.perf["5D"])) {
              n = ord.perf["5D"] * 100;
            } else {
              var raw = ord.perf5d;
              if (!raw || raw === "#N/A") return <span className="text-xs text-gray-400 dark:text-slate-500">--</span>;
              n = parseFloat(raw);
              if (isNaN(n)) return <span className="text-xs text-gray-400 dark:text-slate-500">--</span>;
            }
            var cls = n >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400";
            return <span className={"text-xs font-semibold " + cls}>{n >= 0 ? "+" : ""}{n.toFixed(1)}%</span>;
          })()}
        </div>
      )}

      {/* MOS Live / MOS Fixed — both click to the Valuation section
         (where PE / EPS / TP inputs that drive these live). */}
      {show("MOS") && (
        <div
          className={tdBase + " cursor-pointer"}
          style={rowBg ? { background: rowBg } : undefined}
          onClick={function (e) { e.stopPropagation(); onSelect(company, "section:Valuation"); }}
          title="Open Valuation"
        >
          {mosStyle ? (
            <span title="Margin of Safety" className="text-[10px] px-1.5 rounded-full font-bold whitespace-nowrap" style={{ background: mosStyle.bg, color: mosStyle.color }}>
              {fmtMOS0(mos)}
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-slate-500">--</span>
          )}
        </div>
      )}

      {/* MOS Fixed */}
      {show("MOS Fixed") && (
        <div
          className={tdBase + " cursor-pointer"}
          style={rowBg ? { background: rowBg } : undefined}
          onClick={function (e) { e.stopPropagation(); onSelect(company, "section:Valuation"); }}
          title="Open Valuation"
        >
          {mosFixedStyle ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span title={mosDiverges ? "MOS using fixed TP — diverges from current MOS by " + mosGap.toFixed(1) + "pp; review fixed TP" : "MOS using fixed TP"} className="text-[10px] px-1.5 rounded-full font-bold whitespace-nowrap" style={{ background: mosFixedStyle.bg, color: mosFixedStyle.color }}>
                {fmtMOS0(mosFixed)}
              </span>
              {mosDiverges && (
                <span title={"MOS Fixed diverges from MOS by " + mosGap.toFixed(1) + "pp — fixed TP may be stale"} className="inline-block w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0"/>
              )}
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-slate-500">--</span>
          )}
        </div>
      )}

      {/* Country */}
      {show("Country") && (
        <div
          className={tdBase}
          style={rowBg ? { background: rowBg } : undefined}
          onClick={function (e) { e.stopPropagation(); setEditCountry(true); }}
        >
          {editCountry ? (
            <select
              autoFocus
              value={company.country || ""}
              onChange={function (e) { onUpdate(company.id, { country: e.target.value }); setEditCountry(false); }}
              onBlur={function () { setEditCountry(false); }}
              onClick={function (e) { e.stopPropagation(); }}
              className={inputCls + " text-xs"}
            >
              <option value="">--</option>
              {COUNTRY_ORDER.map(function (c) { return <option key={c}>{c}</option>; })}
            </select>
          ) : cs ? (
            <span
              className={(compact ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5") + " rounded-full font-medium"}
              style={{ background: cs.bg, color: cs.color }}
            >
              {company.country}
            </span>
          ) : (
            <span className="text-xs text-red-500 dark:text-red-400">--</span>
          )}
        </div>
      )}

      {/* Sector */}
      {show("Sector") && (
        <div
          className={tdBase}
          style={rowBg ? { background: rowBg } : undefined}
          onClick={function (e) { e.stopPropagation(); setEditSector(true); }}
        >
          {editSector ? (
            <select
              autoFocus
              value={company.sector || ""}
              onChange={function (e) { onUpdate(company.id, { sector: e.target.value }); setEditSector(false); }}
              onBlur={function () { setEditSector(false); }}
              onClick={function (e) { e.stopPropagation(); }}
              className={inputCls + " text-xs"}
            >
              <option value="">--</option>
              {SECTOR_ORDER.map(function (s) { return <option key={s}>{s}</option>; })}
            </select>
          ) : ss ? (
            <span
              className={(compact ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5") + " rounded-full font-medium"}
              style={{ background: ss.bg, color: ss.color }}
            >
              {shortSector(company.sector)}
            </span>
          ) : (
            <span className="text-xs text-red-500 dark:text-red-400">--</span>
          )}
        </div>
      )}

      {/* Portfolio — clicking anywhere in the cell opens an add menu
          (Portfolio vs Port?) instead of navigating to the company
          page. Pills themselves are noAdd; the menu is the canonical
          way to add. Removing a pill still works via its inline ×. */}
      {show("Portfolio") && (
        <div
          ref={portMenuRef}
          className={tdBase + " !whitespace-normal !cursor-pointer relative"}
          style={Object.assign({ maxWidth: 160 }, rowBg ? { background: rowBg } : {})}
          onClick={function (e) {
            e.stopPropagation();
            setPortMenuOpen(function (o) { return !o; });
          }}
        >
          <div className="flex gap-1 items-center flex-wrap">
            <PortPicker compact stack noAdd active={portfolios} onChange={function (v) { onUpdate(company.id, { portfolios: v }); }} pillBg="#166534" pillColor="#fff" plusColor="#4ade80" />
            <PortPicker
              compact
              stack
              noAdd
              active={portNote}
              onChange={function (v) { onUpdate(company.id, { portNote: v.join(", ") }); }}
              plusColor="#1a3a6b"
              opts={availPortNote}
              dashedPills
              pillStyleFn={function () { return { bg: "transparent", color: "#1a3a6b" }; }}
            />
          </div>
          {portMenuOpen && (
            <div
              onClick={function (e) { e.stopPropagation(); }}
              className="absolute top-[calc(100%+2px)] left-0 z-[200] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-1.5 shadow-lg min-w-[140px]"
            >
              {/* Add to Portfolio (committed) */}
              <div className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 px-1 pb-0.5">Add to Portfolio</div>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {PORTFOLIOS.filter(function (p) { return portfolios.indexOf(p) < 0; }).map(function (p) {
                  return (
                    <span
                      key={p}
                      onClick={function (e) {
                        e.stopPropagation();
                        var next = portfolios.concat([p]).sort(function (a, b) { return PORTFOLIOS.indexOf(a) - PORTFOLIOS.indexOf(b); });
                        onUpdate(company.id, { portfolios: next });
                        setPortMenuOpen(false);
                      }}
                      className="text-[10px] px-1.5 py-0 rounded-full cursor-pointer font-medium"
                      style={{ background: "#166534", color: "#fff" }}
                    >{p}</span>
                  );
                })}
                {PORTFOLIOS.filter(function (p) { return portfolios.indexOf(p) < 0; }).length === 0 && (
                  <span className="text-[10px] text-gray-400 dark:text-slate-500 italic px-1">all assigned</span>
                )}
              </div>
              {/* Add to Port? (considering) */}
              <div className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 px-1 pb-0.5 border-t border-slate-200 dark:border-slate-700 pt-1">Add to Port?</div>
              <div className="flex flex-wrap gap-1">
                {availPortNote.filter(function (p) { return portNote.indexOf(p) < 0; }).map(function (p) {
                  return (
                    <span
                      key={p}
                      onClick={function (e) {
                        e.stopPropagation();
                        var next = portNote.concat([p]);
                        onUpdate(company.id, { portNote: next.join(", ") });
                        setPortMenuOpen(false);
                      }}
                      className="text-[10px] px-1.5 py-0 rounded-full cursor-pointer font-medium bg-transparent"
                      style={{ border: "1px dashed #1a3a6b", color: "#1a3a6b" }}
                    >{p}</span>
                  );
                })}
                {availPortNote.filter(function (p) { return portNote.indexOf(p) < 0; }).length === 0 && (
                  <span className="text-[10px] text-gray-400 dark:text-slate-500 italic px-1">none available</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Most recent EARNINGS entry — used to back-fill Action, Notes
         and Thesis when those manual fields are empty. The 📊 badge in
         each cell signals "sourced from latest earnings, not manually
         entered" so the user can tell at a glance. */}
      {(function(){ return null; })()}

      {/* Action / Updated / Thesis are all backed by the most recent
         earnings entry, so clicking any of these cells jumps the user
         straight to the Earnings & Thesis Check tab where the source
         lives. ActionCell's old inline dropdown is preserved (you can
         still edit company.action manually inside it via the chevron),
         but clicking the pill itself or any empty cell area navigates. */}
      {show("Action") && (
        <div
          className={tdBase + " cursor-pointer"}
          style={rowBg ? { background: rowBg } : undefined}
          onClick={function (e) { e.stopPropagation(); onSelect(company, "earnings"); }}
          title="Open Earnings & Thesis Check"
        >
          {(function(){
            /* Inline render of the TP-change pill. Previously used
               ActionCell which exposed an inline edit dropdown, but the
               cell now navigates to the earnings tab on click (where
               the value's actually sourced), so the inline editor is
               redundant — any manual override should happen at the
               source. Logic mirrors ActionCell: map the most recent
               earnings entry's tpChange (Increased/Decreased/Unchanged)
               into the imperative (Increase TP / Decrease TP /
               No Action), falling back to company.action only when
               there are no entries yet. */
            var TP_CHANGE_TO_ACTION = {Increased:"Increase TP", Decreased:"Decrease TP", Unchanged:"No Action"};
            var derivedFromEarnings = false;
            var displayValue = company.action || "";
            var last = getLastReportedEntry(company.earningsEntries);
            if (last && last.tpChange && TP_CHANGE_TO_ACTION[last.tpChange]) {
              displayValue = TP_CHANGE_TO_ACTION[last.tpChange];
              derivedFromEarnings = true;
            }
            if (!displayValue && !(pendingTpCount > 0)) return <span className="text-xs text-slate-300 dark:text-slate-600">--</span>;
            var aColor = displayValue === "Increase TP" ? "#166534" : displayValue === "Decrease TP" ? "#dc2626" : displayValue === "No Action" ? "#854d0e" : "#6b7280";
            var aBg    = displayValue === "Increase TP" ? "#dcfce7" : displayValue === "Decrease TP" ? "#fee2e2" : displayValue === "No Action" ? "#fef9c3" : "#f1f5f9";
            return (
              <span className="inline-flex items-center gap-1">
                {displayValue && (
                  <span className="text-[10px] px-1.5 py-px rounded-full whitespace-nowrap" style={{ background: aBg, color: aColor }}>
                    {displayValue}
                  </span>
                )}
                {/* Pending-TP-approval indicator: surfaces when a teammate
                    submitted a TP change suggestion that hasn't been
                    approved/rejected yet. Amber clock chip so it visually
                    parallels the earnings-derived pill but signals
                    "in-flight, not yet committed". */}
                {pendingTpCount > 0 && (
                  <span
                    className="text-[11px] leading-none"
                    title={pendingTpCount + " TP change" + (pendingTpCount === 1 ? "" : "s") + " awaiting approval"}
                  >
                    ⏳
                  </span>
                )}
                {/* Rejection indicator — surfaces when the latest
                    earnings entry's tpChange has a linked TP
                    suggestion that was voted down. The pill itself
                    still reflects the analyst's tpChange (Decrease/
                    Increase) since that's the proposal they made;
                    the ✗ tag makes it visually obvious the TP
                    didn't actually move. */}
                {latestTpRejected && (
                  <span
                    className="text-[9px] px-1 py-px rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-semibold leading-none"
                    title="A TP change suggestion tied to this earnings entry was rejected — TP Fixed did not move"
                  >✗</span>
                )}
              </span>
            );
          })()}
        </div>
      )}

      {/* Notes — widened from 170 → 280 so a full 6-word takeaway
         (typically ~30-40 chars at the small font size) fits without
         eliding mid-sentence. */}
      {show("Notes") && (
        <div className={tdBase + " max-w-[280px]"} style={rowBg ? { background: rowBg } : undefined}>
          <NotesCell company={company} onUpdate={onUpdate} />
        </div>
      )}

      {/* Updated */}
      {show("Updated") && (
        <div
          className={tdBase + " cursor-pointer"}
          style={rowBg ? { background: rowBg } : undefined}
          onClick={function (e) { e.stopPropagation(); onSelect(company, "earnings"); }}
          title="Open Earnings & Thesis Check"
        >
          <span className={"text-[10px] whitespace-nowrap " + (company.lastUpdated ? "text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600")}>
            {company.lastUpdated ? fmtDateUS(company.lastUpdated) : "--"}
          </span>
        </div>
      )}

      {/* Status */}
      {/* Thesis — derived from most recent earnings entry's thesisStatus
         (On track / Watch / Broken). Read-only cell; users update it
         from the Earnings & Thesis Check tab. Renders BEFORE Status
         (matching companyColumns.js order) so it sits visually next to
         the other most-recent-earnings columns (Action / Notes /
         Updated). */}
      {show("Thesis") && (
        <div
          className={tdBase + " cursor-pointer"}
          style={rowBg ? { background: rowBg } : undefined}
          onClick={function (e) { e.stopPropagation(); onSelect(company, "earnings"); }}
          title="Open Earnings & Thesis Check"
        >
          {(function(){
            var last = getLastReportedEntry(company.earningsEntries);
            var ts = last && last.thesisStatus;
            if (!ts) return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>;
            var cfg = { "On track": { bg: "#dcfce7", color: "#166534" }, "Watch": { bg: "#fef9c3", color: "#854d0e" }, "Broken": { bg: "#fee2e2", color: "#991b1b" } }[ts] || { bg: "#f1f5f9", color: "#475569" };
            return (
              <span title={"From earnings " + (fmtDateUS(last.reportDate) || "?")} className="text-[10px] px-1.5 py-px rounded-full font-medium whitespace-nowrap" style={{ background: cfg.bg, color: cfg.color }}>
                {ts}
              </span>
            );
          })()}
        </div>
      )}

      {show("Status") && (
        <div className={tdBase} style={rowBg ? { background: rowBg } : undefined} onClick={function (e) { e.stopPropagation(); }}>
          {missing.length > 0 && (
            <span title={"Missing: " + missing.join(", ")} className="text-[10px] mr-1 text-amber-500 dark:text-amber-400">&#x26A0;</span>
          )}
          <select
            value={company.status || ""}
            onChange={function (e) { onUpdate(company.id, { status: e.target.value }); }}
            className="text-[10px] px-1 py-px rounded-full border-none cursor-pointer font-medium appearance-none"
            style={{ background: sCfg.bg, color: sCfg.color }}
          >
            <option value="">--</option>
            <option>Own</option>
            <option>Focus</option>
            <option>Watch</option>
            <option>Sold</option>
          </select>
        </div>
      )}

    </div>
  );
}

export default memo(CoRow);
