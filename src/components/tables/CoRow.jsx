import { useState, useRef, useEffect, memo } from "react";
import { PORTFOLIOS, TIER_ORDER, COUNTRY_ORDER, SECTOR_ORDER } from '../../constants/index.js';
import { shortSector, sectorStyle, countryStyle, getTiers, tierPillStyle, tierBg, reviewedColor, daysSince, todayStr, calcNormEPS, calcTP, calcMOS, fmtMOS, fmtMOS0, mosBg, getTpFixed, tierToStatus, truncName } from '../../utils/index.js';
import StatusPill from '../ui/StatusPill.jsx';
import NotesCell from '../forms/NotesCell.jsx';
import ActionCell from '../forms/ActionCell.jsx';
import FlagCell from '../forms/FlagCell.jsx';
import DatePicker from '../forms/DatePicker.jsx';
import PortPicker from '../ui/PortPicker.jsx';
import PillEl from '../ui/PillEl.jsx';
import FpeRangeMini from '../ui/FpeRangeMini.jsx';

function CoRow({ company, onSelect, onDelete, onUpdate, compact, visibleCols, selected, onToggleSelect, onQuickUpload, dark, rowAlerts }) {
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

  useEffect(function () {
    if (!showMenu) return;
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); }
    document.addEventListener("mousedown", h);
    return function () { document.removeEventListener("mousedown", h); };
  }, [showMenu]);

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

      {/* Tier(s) */}
      {show("Tier(s)") && (
        <div className={tdBase + " !whitespace-normal"} style={rowBg ? { background: rowBg } : undefined}>
          <PortPicker active={tiers} onChange={function (v) { var nt=v.join(", "); var ch={tier:nt}; var s=tierToStatus(nt); if(s)ch.status=s; onUpdate(company.id, ch); }} plusColor="#334155" opts={TIER_ORDER} pillStyleFn={tierPillStyle} />
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

      {/* 5D% */}
      {show("5D%") && (
        <div className={tdBase} style={rowBg ? { background: rowBg } : undefined}>
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

      {/* MOS */}
      {show("MOS") && (
        <div className={tdBase} style={rowBg ? { background: rowBg } : undefined}>
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
        <div className={tdBase} style={rowBg ? { background: rowBg } : undefined}>
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

      {/* FPE Range */}
      {show("FPE Range") && (
        <div className={tdBase} style={rowBg ? { background: rowBg } : undefined}>
          {(function () {
            var el = <FpeRangeMini valuation={val} width={compact ? 80 : 100} />;
            return el || <span className="text-xs text-gray-400 dark:text-slate-500">--</span>;
          })()}
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
              className="text-xs px-2 py-0.5 rounded-full font-medium"
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
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: ss.bg, color: ss.color }}
            >
              {shortSector(company.sector)}
            </span>
          ) : (
            <span className="text-xs text-red-500 dark:text-red-400">--</span>
          )}
        </div>
      )}

      {/* Portfolio */}
      {show("Portfolio") && (
        <div className={tdBase + " !whitespace-nowrap"} style={rowBg ? { background: rowBg } : undefined}>
          <div className="flex gap-1 items-center flex-nowrap">
            <PortPicker active={portfolios} onChange={function (v) { onUpdate(company.id, { portfolios: v }); }} pillBg="#166534" pillColor="#fff" plusColor="#4ade80" />
            <PortPicker
              active={portNote}
              onChange={function (v) { onUpdate(company.id, { portNote: v.join(", ") }); }}
              plusColor="#1a3a6b"
              opts={availPortNote}
              dashedPills
              pillStyleFn={function () { return { bg: "transparent", color: "#1a3a6b" }; }}
            />
          </div>
        </div>
      )}

      {/* Action */}
      {show("Action") && (
        <div className={tdBase} style={rowBg ? { background: rowBg } : undefined} onClick={function (e) { e.stopPropagation(); }}>
          <ActionCell value={company.action || ""} onUpdate={function (v) { onUpdate(company.id, { action: v }); }} />
        </div>
      )}

      {/* Notes */}
      {show("Notes") && (
        <div className={tdBase + " max-w-[170px]"} style={rowBg ? { background: rowBg } : undefined}>
          <NotesCell company={company} onUpdate={onUpdate} />
        </div>
      )}

      {/* Reviewed */}
      {show("Reviewed") && (
        <div className={tdBase} style={rowBg ? { background: rowBg } : undefined} onClick={function (e) { e.stopPropagation(); }}>
          <DatePicker value={company.lastReviewed || ""} onChange={function (v) { onUpdate(company.id, { lastReviewed: v }); }} />
        </div>
      )}

      {/* Updated */}
      {show("Updated") && (
        <div className={tdBase} style={rowBg ? { background: rowBg } : undefined}>
          <span className={"text-[10px] " + (company.lastUpdated ? "text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600")}>
            {company.lastUpdated || "--"}
          </span>
        </div>
      )}

      {/* Status */}
      {show("Status") && (
        <div className={tdBase} style={rowBg ? { background: rowBg } : undefined} onClick={function (e) { e.stopPropagation(); }}>
          {missing.length > 0 && (
            <span title={"Missing: " + missing.join(", ")} className="text-[10px] mr-1 text-amber-500 dark:text-amber-400">&#x26A0;</span>
          )}
          <select
            value={company.status || ""}
            onChange={function (e) { onUpdate(company.id, { status: e.target.value }); }}
            className="text-xs px-1.5 py-0.5 rounded-full border-none cursor-pointer font-medium appearance-none"
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

      {/* Flag */}
      {show("Flag") && (
        <div className={tdBase} style={rowBg ? { background: rowBg } : undefined} onClick={function (e) { e.stopPropagation(); }}>
          <FlagCell value={company.flag || ""} onUpdate={function (v) { onUpdate(company.id, { flag: v }); }} />
        </div>
      )}

      {/* Delete */}
      {show("Del") && (
        <div className={tdBase + " !pr-0"} style={rowBg ? { background: rowBg } : undefined}>
          <span
            onClick={function (e) { e.stopPropagation(); onDelete(company.id); }}
            className="text-xs text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700 dark:hover:text-red-300 transition-colors"
          >
            Del
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(CoRow);
