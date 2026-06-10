/* Companies-list tab — extracted from App.jsx.
 *
 * Renders the all-companies view (the `tab==="companies"&&!selCo`
 * block). Includes the four data-health banner panels at the top
 * (duplicate tickers, duplicate names, missing FY-end month,
 * upcoming earnings + follow-ups), the filter/sort toolbar, and
 * the company grid itself.
 *
 * Receives `useCompaniesApi` (the whole useCompanies() return) as
 * one prop bundle rather than threading ~50 individual props. The
 * companies-list UI owns most of that state itself; bundling
 * matches the ImportPanel pattern.
 *
 * Reads context bits via useCompanyContext() — that's a context
 * read, not a state-owning hook, so multiple consumers share state.
 */
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { CoRow } from '../tables/index.js';
import { StatusPill } from '../ui/index.js';
import {
  PORTFOLIOS, TIER_ORDER, SECTOR_ORDER, COUNTRY_ORDER, SECTOR_COLORS,
  SECTOR_SHORT, STATUS_RANK, CO_SORTS, ALL_COLS, COMPACT_COLS,
  COMPANY_COLUMNS, FLAG_STYLES
} from '../../constants/index.js';
import { todayStr, daysSince, parseDate, printPage } from '../../utils/index.js';
import { getDataStatus, statusBadge, staleReason } from '../../utils/dataStatus.js';
import { supaUpsert } from '../../api/index.js';
import ThisWeekEarnings from '../dashboard/ThisWeekEarnings.jsx';
import { EarningsCalendar } from '../calendar/index.js';
import { ResearchBoard } from '../research/ResearchBoard.jsx';
import MetricsTable, { METRICS_COLS, DEFAULT_METRICS_VISIBLE } from '../tables/MetricsTable.jsx';

/* Tailwind class strings — duplicated from App.jsx so the component
   is self-contained. */
const INP = "text-sm px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none";
const CARD = "bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 mb-2";
const PILL_BASE = "text-[11px] px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800";
/* Unified subtab style — matches Portfolios / Performance / Dashboard
   for a consistent feel across top-level tabs. */
const TABST_ACTIVE = "px-3 py-1.5 text-xs font-semibold rounded-t border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400";
const TABST_INACTIVE = "px-3 py-1.5 text-xs font-medium rounded-t border-b-2 border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200";
const TABSM_BASE = "px-2.5 py-1 border rounded-md cursor-pointer text-xs whitespace-nowrap transition-colors";
const TABSM_ACTIVE = TABSM_BASE + " border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800 font-medium text-gray-900 dark:text-slate-100";
const TABSM_INACTIVE = TABSM_BASE + " border-slate-200 dark:border-slate-700 bg-transparent font-normal text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50";
const TAGBTN_BASE = "text-[11px] px-1.5 py-0.5 rounded-full border cursor-pointer bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100 transition-colors";
const TAGBTN_ACTIVE = TAGBTN_BASE + " border-slate-400 dark:border-slate-500 font-medium";
const TAGBTN_INACTIVE = TAGBTN_BASE + " border-slate-200 dark:border-slate-700 font-normal";
const TA_BASE = "w-full resize-y text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-[inherit] leading-relaxed focus:ring-2 focus:ring-blue-500 focus:outline-none";
const BTN = "text-xs px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
const BTN_PRIMARY = "text-sm px-5 py-2 font-semibold bg-blue-700 text-white border-none rounded-md cursor-pointer hover:bg-blue-800 transition-colors";
const BTN_SM = "text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
const LABEL = "text-[11px] text-gray-500 dark:text-slate-400 block mb-1";
const LNK = "text-xs text-gray-500 dark:text-slate-400 cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 transition-colors";

export default function CompaniesListTab(props) {
  /* Note: soonIso/todayIso/thisWeekCount are defined inside the IIFEs
     below, so they don't appear in this destructure. */
  const { useCompaniesApi, calFilter, calPortFilter, coAlertsByCoId, companiesView, handleCoDelete, handleCoQuickUpload, handleCoSelect, metricsVisibleCols, openDiscussions, pendingTpByCoId, rejectedTpForLatestByCoId, setCalFilter, setCalPortFilter, setCompaniesView, setMetricsVisibleCols, setSelCoOrigin, setShowFollowUps, setShowFyMonthMissing, setShowThisWeek, setTab, showFollowUps, showFyMonthMissing, showThisWeek } = props;
  const { annotations, companies, dark, setCompanies, updateCo } = useCompanyContext();
  const { addCompany, applyBulkEdit, applyDedupe, applyPriceImport, bulkLoading, bulkPreview, bulkStatus, bulkText, bulkTier, clearSelected, coFilter, coFilterCountry, coFilterSector, coSearch, coSort, coSortDir, coStatusFilter, coStatusSubFilter, compact, confirmBulk, confirmClear, displayedCos, dupeGroups, dupeKeep, exportCSV, findDupes, handleSortClick, newFields, newName, newNameUS, newTicker, newTickerUS, parseBulk, priceImportText, restoreText, searchRef, selCo, selectAll, selectedIds, setBulkPreview, setBulkStatus, setBulkText, setBulkTier, setCoFilter, setCoFilterCountry, setCoFilterSector, setCoSearch, setCoSort, setCoSortDir, setCoStatusFilter, setCoStatusSubFilter, setCoView, setCompact, setConfirmClear, setDupeKeep, setNewFields, setNewName, setNewNameUS, setNewTicker, setNewTickerUS, setPriceImportText, setRestoreText, setSelCo, setShowBulk, setShowColPicker, setShowDedupe, setShowNew, setShowPriceImport, setShowRestore, setVisibleCols, showBulk, showColPicker, showDedupe, showNew, showPriceImport, showRestore, toggleSelect, usedCountries, usedSectors, visibleCols } = useCompaniesApi;
  /* Header row derived from the single column schema in companyColumns.js,
     filtered by which columns the user has toggled visible. Mirrors the
     same derivation in App.jsx (which still uses it for the company-
     detail view header). */
  const HEADER_COLS = COMPANY_COLUMNS.filter(function(c){return visibleCols.has(c.id);}).map(function(c){return{label:c.label,sort:c.sort};});
  return (
    <div>
        {(function(){var owners={};var dupes={};companies.forEach(function(c){(c.tickers||[]).forEach(function(t){var tk=(t.ticker||"").toUpperCase();if(!tk)return;if(owners[tk]&&owners[tk]!==c.id){if(!dupes[tk])dupes[tk]=[owners[tk]];if(dupes[tk].indexOf(c.id)<0)dupes[tk].push(c.id);}else if(!owners[tk]){owners[tk]=c.id;}});});var dupeList=Object.keys(dupes);if(dupeList.length===0)return null;return(<div className="mb-2 px-3.5 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg"><div className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠ Duplicate tickers detected ({dupeList.length})</div><div className="text-[11px] text-amber-700 dark:text-amber-400 mb-1">Each ticker should belong to only one company. The same ticker on multiple companies can cause incorrect rep weight attribution. Click a name to fix.</div><div className="flex flex-col gap-1">{dupeList.map(function(tk){var ids=dupes[tk];var names=ids.map(function(id){var c=companies.find(function(x){return x.id===id;});return c?c.name:"?";});return(<div key={tk} className="text-[11px]"><span className="font-mono font-semibold text-amber-900 dark:text-amber-200">{tk}</span><span className="text-amber-700 dark:text-amber-400"> on: </span>{names.map(function(n,i){var co=companies.find(function(x){return x.name===n;});return <span key={i}>{i>0&&", "}<span onClick={function(){if(co){setSelCo(co);setCoView("section:Overview");}}} className="underline cursor-pointer hover:text-amber-900 dark:hover:text-amber-200">{n}</span></span>;})}</div>);})}</div></div>);})()}
        {(function(){var byName={};companies.forEach(function(c){var key=(c.name||"").trim().toLowerCase();if(!key)return;if(!byName[key])byName[key]=[];byName[key].push(c);});var nameDupes=Object.keys(byName).filter(function(k){return byName[k].length>1;});if(nameDupes.length===0)return null;return(<div className="mb-2 px-3.5 py-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 rounded-lg"><div className="flex items-center justify-between mb-1"><div className="text-xs font-semibold text-rose-800 dark:text-rose-300">⚠ Duplicate company names ({nameDupes.length})</div><button onClick={function(){var firstDupes=nameDupes.map(function(k){return byName[k][0].name;});if(window.confirm("Auto-merge duplicates?\n\nFor each set of duplicate names, the most recently updated copy will be kept (preferring entries with sections/portfolios populated). Older duplicates will be deleted.\n\nAffected: "+firstDupes.slice(0,5).join(", ")+(firstDupes.length>5?" +"+(firstDupes.length-5)+" more":""))){setCompanies(function(prev){var byNameLocal={};prev.forEach(function(c){var k=(c.name||"").trim().toLowerCase();if(!k)return;if(!byNameLocal[k])byNameLocal[k]=[];byNameLocal[k].push(c);});var keepIds=new Set();Object.keys(byNameLocal).forEach(function(k){var group=byNameLocal[k];if(group.length===1){keepIds.add(group[0].id);return;}var best=group.reduce(function(a,b){var sa=Object.keys(a.sections||{}).length+(a.updateLog||[]).length+(a.portfolios||[]).length+(a.tickers||[]).length;var sb=Object.keys(b.sections||{}).length+(b.updateLog||[]).length+(b.portfolios||[]).length+(b.tickers||[]).length;return sb>sa?b:a;});keepIds.add(best.id);});return prev.filter(function(c){return keepIds.has(c.id);});});}}} className="text-[11px] px-2 py-0.5 rounded-md bg-rose-600 dark:bg-rose-700 text-white hover:bg-rose-700 dark:hover:bg-rose-600 transition-colors">Auto-merge duplicates</button></div><div className="text-[11px] text-rose-700 dark:text-rose-400 mb-1">Multiple company entries share the same name. This can cause double-counting in rep weights and confused price imports. Click a name to open it.</div><div className="flex flex-col gap-1 max-h-48 overflow-y-auto">{nameDupes.map(function(k){var group=byName[k];return(<div key={k} className="text-[11px]"><span className="font-medium text-rose-900 dark:text-rose-200">{group[0].name}</span><span className="text-rose-700 dark:text-rose-400"> \u00d7 {group.length} entries: </span>{group.map(function(c,i){return <span key={c.id}>{i>0&&", "}<span onClick={function(){setSelCo(c);setCoView("section:Overview");}} className="underline cursor-pointer hover:text-rose-900 dark:hover:text-rose-200">[{(c.tier||"no tier")}{c.status?" \u00b7 "+c.status:""}]</span></span>;})}</div>);})}</div></div>);})()}
        {/* Data-health: companies missing valuation.fyMonth. Collapsed
            by default — open via the small chevron header. Persisted
            state lives in localStorage so the user's preference survives
            tab switches and page reloads. */}
        {(function(){
          /* Skip Sold names — we don't review those each cycle, so a
             missing fyMonth there isn't actionable. */
          var missing = companies.filter(function(c){
            if (c && c.status === "Sold") return false;
            return !(c && c.valuation && c.valuation.fyMonth);
          });
          if(missing.length === 0) return null;
          return (
            <div className="mb-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
              <div onClick={function(){setShowFyMonthMissing(function(v){var nv=!v;try{localStorage.setItem("ccd:showFyMonthMissing",nv?"1":"0");}catch(e){}return nv;});}} className="px-3.5 py-2 cursor-pointer flex items-center gap-2">
                <span className="text-[11px] text-amber-700 dark:text-amber-400">{showFyMonthMissing?"▼":"▶"}</span>
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">⚠ {missing.length} compan{missing.length===1?"y":"ies"} missing FY-end month</span>
                <span className="text-[10px] text-amber-700 dark:text-amber-400 italic ml-auto">{showFyMonthMissing?"click to collapse":"click to expand"}</span>
              </div>
              {showFyMonthMissing&&(
                <div className="px-3.5 pb-2">
                  <div className="text-[11px] text-amber-700 dark:text-amber-400 mb-1">Set <code>valuation.fyMonth</code> (e.g. <code>Mar</code>, <code>Sep</code>, defaults to <code>Dec</code>) on each. Stale-data badges, the Q1-Q4 grid, and Pre-Earnings Brief math all depend on this. Click a name to fix.</div>
                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                    {missing.slice(0, 100).map(function(c){
                      return (
                        <span key={c.id} onClick={function(){setSelCo(c);setCoView("section:Valuation");}} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/60">{c.name}</span>
                      );
                    })}
                    {missing.length > 100 && <span className="text-[11px] text-amber-700 dark:text-amber-400 italic self-center">+ {missing.length - 100} more</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        {/* Discussion follow-ups due — collapsible. Surfaces any
            annotation whose followUpDate is today or in the next 7
            days. Click a chip to open the Discussions panel filtered
            to that annotation's context. Defaults to OPEN so a fresh
            morning page-load can't miss them. */}
        {(function(){
          var todayIso = new Date().toISOString().slice(0, 10);
          var soonIso = (function(){ var d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
          var due = (annotations || []).filter(function(a){
            return a.followUpDate && a.followUpDate <= soonIso;
          });
          if (due.length === 0) return null;
          due.sort(function(a, b){ return (a.followUpDate || "").localeCompare(b.followUpDate || ""); });
          var overdueCount = due.filter(function(a){ return a.followUpDate < todayIso; }).length;
          function nameFor(a){
            if (a.companyId){
              var c = companies.find(function(x){ return x.id === a.companyId; });
              if (c) return c.name;
            }
            if (a.scope === "portfolio") return (a.portfolio || "Portfolio");
            return "Discussion";
          }
          return (
            <div className="mb-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-800">
              <div onClick={function(){setShowFollowUps(function(v){var nv=!v;try{localStorage.setItem("ccd:showFollowUps",nv?"1":"0");}catch(e){}return nv;});}} className="px-3.5 py-2 cursor-pointer flex items-center gap-2">
                <span className="text-[11px] text-blue-700 dark:text-blue-400">{showFollowUps?"▼":"▶"}</span>
                <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">📅 Follow-ups: {due.length} discussion{due.length===1?"":"s"} {overdueCount>0?"("+overdueCount+" overdue)":"due this week"}</span>
                <span className="text-[10px] text-blue-700 dark:text-blue-400 italic ml-auto">{showFollowUps?"click to collapse":"click to expand"}</span>
              </div>
              {showFollowUps&&(
                <div className="px-3.5 pb-2">
                  <div className="text-[11px] text-blue-700 dark:text-blue-400 mb-1">Click a chip to open the discussion. Adjust the follow-up date or resolve & clear it on the card.</div>
                  <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                    {due.map(function(a){
                      var overdue = a.followUpDate < todayIso;
                      var nm = nameFor(a);
                      var preview = (a.text || "").replace(/\s+/g, " ").slice(0, 60);
                      return (
                        <span
                          key={a.id}
                          title={preview}
                          onClick={function(){
                            if (a.companyId) {
                              var co = companies.find(function(x){ return x.id === a.companyId; });
                              if (co) { setSelCo(co); setTab("companies"); }
                            }
                            openDiscussions();
                          }}
                          className={"text-[11px] px-2 py-0.5 rounded-full border cursor-pointer " + (overdue
                            ? "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-900/60"
                            : "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-900/60")}
                        >
                          {nm}
                          <span className="ml-1 text-[10px] opacity-80">{a.followUpDate}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        {/* This-week earnings — collapsible. Header summarizes count
            even when collapsed. Sold names excluded — we don't track
            their next reports. */}
        {(function(){
          var t0=new Date();t0.setHours(0,0,0,0);
          function dayOf(iso){
            if(!iso)return null;
            var d=parseDate(iso);
            if(!d)return null;
            return Math.round((d.getTime()-t0.getTime())/(24*3600*1000));
          }
          var activeCos=displayedCos.filter(function(c){return c.status!=="Sold";});
          var thisWeekCount=activeCos.filter(function(c){
            var iso=(c.guidance&&c.guidance.nextReportDate)||null;
            if(!iso){
              ((c.earningsEntries)||[]).forEach(function(e){
                if(!e.reportDate)return;
                var d=parseDate(e.reportDate);
                if(!d||d<t0)return;
                if(!iso||d<parseDate(iso))iso=e.reportDate;
              });
            }
            var n=dayOf(iso);
            return n!=null&&n>=0&&n<=7;
          }).length;
          if(thisWeekCount===0)return null;
          return (
            <div className="mb-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <div onClick={function(){setShowThisWeek(function(v){var nv=!v;try{localStorage.setItem("ccd:showThisWeek",nv?"1":"0");}catch(e){}return nv;});}} className="px-3 py-2 cursor-pointer flex items-center gap-2">
                <span className="text-[11px] text-gray-500 dark:text-slate-400">{showThisWeek?"▼":"▶"}</span>
                <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold">This week</span>
                <span className="text-[11px] text-gray-700 dark:text-slate-300 font-medium">{thisWeekCount} report{thisWeekCount===1?"":"s"}</span>
                <span className="text-[10px] text-gray-400 dark:text-slate-500 italic ml-auto">{showThisWeek?"click to collapse":"click to expand"}</span>
              </div>
              {showThisWeek&&(
                <div className="px-3 pb-2 -mt-1">
                  <ThisWeekEarnings companies={activeCos} onSelectCompany={function(c){setSelCo(c);setCoView("dashboard");}}/>
                </div>
              )}
            </div>
          );
        })()}
        <div className="flex gap-2 flex-wrap mb-1.5 items-center">
          <input ref={searchRef} value={coSearch} onChange={function(e){setCoSearch(e.target.value);}} placeholder="Search... (/ to focus)" className={INP + " flex-1 min-w-[120px] !text-xs !px-2 !py-1"}/>
          <select value={coSort} onChange={function(e){var v=e.target.value;setCoSort(v);var descByDefault=v==="Last Reviewed"||v==="Last Updated"||v==="5D%"||v==="MOS";setCoSortDir(descByDefault?"desc":"asc");}} className={INP + " !text-xs !px-2 !py-1"}>{CO_SORTS.map(function(s){return <option key={s}>{s}</option>;})}</select>
          <select value={coFilter} onChange={function(e){setCoFilter(e.target.value);}} className={INP + " !text-xs !px-2 !py-1"}><option value="All">All portfolios</option>{PORTFOLIOS.map(function(p){return <option key={p} value={p}>{p}</option>;})}</select>
          <select value={coFilterCountry} onChange={function(e){setCoFilterCountry(e.target.value);}} className={INP + " !text-xs !px-2 !py-1"}><option value="All">All countries</option>{usedCountries.map(function(c){return <option key={c} value={c}>{c}</option>;})}</select>
          <select value={coFilterSector} onChange={function(e){setCoFilterSector(e.target.value);}} className={INP + " !text-xs !px-2 !py-1"}><option value="All">All sectors</option>{usedSectors.map(function(s){return <option key={s} value={s}>{s}</option>;})}</select>
          <span className="text-xs text-gray-500 dark:text-slate-400">{displayedCos.length}/{companies.length}</span>
        </div>
        <div className="flex gap-1.5 mb-2 items-center flex-wrap">
          <span className="text-[11px] text-gray-500 dark:text-slate-400">Status:</span>
          {["All","Own","Focus","Watch","Sold"].map(function(s){var active=coStatusFilter===s;var cfg={All:{bg:undefined,color:undefined},Own:{bg:"#dcfce7",color:"#166534"},Focus:{bg:"#dbeafe",color:"#1e40af"},Watch:{bg:"#fef9c3",color:"#854d0e"},Sold:{bg:"#fee2e2",color:"#991b1b"}}[s];return <span key={s} onClick={function(){setCoStatusFilter(s);setCoStatusSubFilter("All");}} className={"text-[11px] px-2.5 py-0.5 rounded-full cursor-pointer transition-colors " + (active?"font-semibold":"font-normal")} style={{border:"1px solid "+(active&&cfg.color?cfg.color:undefined),background:active?cfg.bg:undefined,color:active?cfg.color:undefined}}>{s}</span>;})}
          {(function(){
            if(coStatusFilter==="All")return null;
            var subOpts=coStatusFilter==="Own"?["FIN","IN","FGL","GL","EM","SC"]:coStatusFilter==="Focus"?["MC","EM","SC"]:coStatusFilter==="Watch"?["MC","EM","SC"]:["Hit TP","Gave Up"];
            var cfg=({Own:{bg:"#dcfce7",color:"#166534"},Focus:{bg:"#dbeafe",color:"#1e40af"},Watch:{bg:"#fef9c3",color:"#854d0e"},Sold:{bg:"#fee2e2",color:"#991b1b"}})[coStatusFilter];
            return <span className="inline-flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200 dark:border-slate-700">
              {["All"].concat(subOpts).map(function(so){var a=coStatusSubFilter===so;return <span key={so} onClick={function(){setCoStatusSubFilter(so);}} className={"text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors "+(a?"font-semibold":"font-normal")} style={{border:"1px solid "+(a&&cfg?cfg.color:"transparent"),background:a&&cfg?cfg.bg:"transparent",color:a&&cfg?cfg.color:undefined}}>{so}</span>;})}
            </span>;
          })()}
          {/* Compact/Default toggle removed \u2014 List view is always
              compact for cross-tab density consistency with Metrics.
              `compact=true` is the hardcoded default in useCompanies. */}
          <div className={(companiesView==="standard"?"":"ml-auto ")+"relative"}><button onClick={function(){setShowColPicker(function(s){return !s;});}} className={BTN}>Columns {"\u25BE"}</button>{showColPicker&&(companiesView==="metrics"?(
  /* Metrics picker — full list from MetricsTable's column schema. */
  <div className="absolute right-0 top-[calc(100%+4px)] z-[100] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 shadow-lg min-w-[200px] max-h-[65vh] overflow-y-auto">
    <div className="flex justify-between mb-1.5 pb-1.5 border-b border-slate-200 dark:border-slate-700">
      <button type="button" onClick={function(){setMetricsVisibleCols(DEFAULT_METRICS_VISIBLE);}} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline">Defaults</button>
      <button type="button" onClick={function(){setMetricsVisibleCols(new Set(METRICS_COLS.map(function(c){return c.key;})));}} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline">All</button>
    </div>
    {METRICS_COLS.map(function(col){var on=metricsVisibleCols.has(col.key);return(<div key={col.key} onClick={function(){setMetricsVisibleCols(function(prev){var n=new Set(prev);on?n.delete(col.key):n.add(col.key);return n;});}} className="flex items-center gap-2 py-1 cursor-pointer text-xs text-gray-900 dark:text-slate-100"><div className="w-3.5 h-3.5 rounded-[3px] shrink-0" style={{border:"1px solid "+(on?"#3b82f6":"#cbd5e1"),background:on?"#dbeafe":"transparent"}}/>{col.label}</div>);})}
  </div>
):(
  /* Standard picker. */
  <div className="absolute right-0 top-[calc(100%+4px)] z-[100] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 shadow-lg min-w-[180px] max-h-[65vh] overflow-y-auto">
    {/* Preset row — moved here from the top toolbar where a "Compact"
        toggle used to live (which was confusing because it only
        applied to this Standard view). Default = full ALL_COLS set,
        Compact = the smaller COMPACT_COLS set. Either preset can
        then be fine-tuned by toggling individual columns below. */}
    <div className="flex justify-between mb-1.5 pb-1.5 border-b border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={function(){setCompact(false);setVisibleCols(new Set(ALL_COLS));}}
        className={"text-[11px] hover:underline " + (!compact ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-500 dark:text-slate-400")}
        title="Show all columns"
      >Default</button>
      <button
        type="button"
        onClick={function(){setCompact(true);setVisibleCols(COMPACT_COLS);}}
        className={"text-[11px] hover:underline " + (compact ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-500 dark:text-slate-400")}
        title="Show only the compact column set"
      >Compact</button>
    </div>
    {ALL_COLS.map(function(col){var on=visibleCols.has(col);return(<div key={col} onClick={function(){setVisibleCols(function(prev){var n=new Set(prev);on?n.delete(col):n.add(col);return n;});}} className="flex items-center gap-2 py-1 cursor-pointer text-xs text-gray-900 dark:text-slate-100"><div className="w-3.5 h-3.5 rounded-[3px] shrink-0" style={{border:"1px solid "+(on?"#3b82f6":"#cbd5e1"),background:on?"#dbeafe":"transparent"}}/>{col}</div>);})}
  </div>
))}</div>
        </div>
        {selectedIds.size>0&&(<div className="rounded-lg mb-2 flex gap-2 items-center flex-wrap px-3.5 py-3" style={{background:"#dbeafe",border:"1px solid #93c5fd"}}><span className="text-xs font-medium" style={{color:"#1e40af"}}>{selectedIds.size} selected</span><select value={bulkStatus} onChange={function(e){setBulkStatus(e.target.value);}} className={INP + " !text-xs !px-2 !py-0.5"}><option value="">Set status{"\u2026"}</option><option>Own</option><option>Focus</option><option>Watch</option><option>Sold</option><option>Removed</option></select><select value={bulkTier} onChange={function(e){setBulkTier(e.target.value);}} className={INP + " !text-xs !px-2 !py-0.5"}><option value="">Set tier{"\u2026"}</option>{TIER_ORDER.map(function(t){return <option key={t}>{t}</option>;})}</select><button onClick={applyBulkEdit} disabled={!bulkStatus&&!bulkTier} className={BTN_SM}>Apply</button><span onClick={clearSelected} className="text-xs cursor-pointer" style={{color:"#1e40af"}}>Clear</span><span onClick={selectAll} className="text-xs cursor-pointer" style={{color:"#1e40af"}}>Select all ({displayedCos.length})</span></div>)}
        <div className="flex gap-1.5 flex-wrap mb-2.5 justify-end items-center">
          {confirmClear?(<div className="flex items-center gap-2"><span className="text-xs text-red-600 dark:text-red-400">Delete all {companies.length}?</span><button onClick={async function(){setCompanies([]);try{await supaUpsert("companies",{id:"shared",data:"[]"});}catch(e){}setConfirmClear(false);}} className="text-xs px-2.5 py-1 text-red-600 dark:text-red-400">Yes</button><span onClick={function(){setConfirmClear(false);}} className={LNK}>Cancel</span></div>):<button onClick={function(){setConfirmClear(true);}} className="text-xs px-2.5 py-1.5 text-red-600 dark:text-red-400">Clear all</button>}
          <button onClick={exportCSV} className={BTN}>{"\u2B07"} CSV</button>
          <button onClick={findDupes} className={BTN}>Dedupe</button>
          <button onClick={function(){setShowBulk(function(s){return !s;});setShowNew(false);setShowPriceImport(false);}} className={BTN}>Bulk import</button>
          <button onClick={function(){setShowNew(function(s){return !s;});setShowBulk(false);setShowPriceImport(false);}} className={BTN}>+ New</button>
        </div>
        {showPriceImport&&(<div className={CARD + " mb-2.5"}><div className="text-sm font-medium mb-1 text-gray-900 dark:text-slate-100">Bulk price update</div><div className="text-xs text-gray-500 dark:text-slate-400 mb-2">27 columns: Company, Ord Ticker, Ord Price, 11 trailing returns (TODAY, 5D, MTD, 1M, QTD, 3M, 6M, YTD, 1YR, 2YR, 3YR), US Ticker, US Price, 11 trailing returns. Old 7-col format still accepted.</div><textarea value={priceImportText} onChange={function(e){setPriceImportText(e.target.value);}} placeholder={"AAPL\t182.50\n..."} className={TA_BASE + " font-mono mb-2"} style={{minHeight:100}}/><div className="flex gap-2"><button onClick={applyPriceImport} disabled={!priceImportText.trim()} className={BTN_SM}>Apply</button><span onClick={function(){setShowPriceImport(false);setPriceImportText("");}} className={LNK}>Cancel</span></div></div>)}
        {showDedupe&&(<div className={CARD + " mb-2.5"}>{dupeGroups.length===0?<div className="text-sm text-green-600 dark:text-green-400">{"\u2713"} No duplicates found.</div>:(<><div className="flex justify-between mb-2"><div className="text-sm font-medium text-gray-900 dark:text-slate-100">Found {dupeGroups.length} dupe group(s)</div><span onClick={function(){setShowDedupe(false);}} className={LNK}>Cancel</span></div><div className="max-h-[280px] overflow-y-auto mb-2.5 flex flex-col gap-2">{dupeGroups.map(function(g){var gKey=(g[0].ticker||g[0].name||"").toUpperCase();return(<div key={gKey} className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden"><div className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 text-[11px] font-medium text-gray-500 dark:text-slate-400 uppercase">{gKey}</div>{g.map(function(c){var isKeep=dupeKeep[gKey]===c.id;return(<div key={c.id} onClick={function(){setDupeKeep(function(k){return Object.assign({},k,{[gKey]:c.id});});}} className={"px-3 py-1.5 flex gap-2.5 items-center cursor-pointer border-t border-slate-200 dark:border-slate-700 " + (isKeep?"bg-green-50 dark:bg-green-950/30":"bg-transparent")}><div className="w-3.5 h-3.5 rounded-full shrink-0" style={{border:"2px solid "+(isKeep?"#16a34a":"#cbd5e1"),background:isKeep?"#16a34a":"transparent"}}/><span className="text-sm font-medium text-gray-900 dark:text-slate-100 flex-1">{c.name}</span><span className={PILL_BASE}>{c.tier||"no tier"}</span>{c.status&&<span className={PILL_BASE}>{c.status}</span>}</div>);})}</div>);})}</div><button onClick={applyDedupe} className="text-xs px-3.5 py-1.5 text-red-600 dark:text-red-400">Remove duplicates</button></>)}</div>)}
        {showRestore&&(<div className={CARD + " mb-2.5"}><textarea value={restoreText} onChange={function(e){setRestoreText(e.target.value);}} placeholder="Paste JSON backup..." className={TA_BASE + " font-mono mb-2"} style={{minHeight:80}}/><div className="flex gap-2"><button onClick={function(){try{var d=JSON.parse(restoreText);if(Array.isArray(d)){setCompanies(d);setShowRestore(false);setRestoreText("");}else alert("Invalid.");}catch(e){alert("Bad JSON.");}}} disabled={!restoreText.trim()} className={BTN_SM}>Restore</button><span onClick={function(){setShowRestore(false);}} className={LNK}>Cancel</span></div></div>)}
        {showBulk&&(<div className={CARD + " mb-2.5"}><div className="text-sm font-medium mb-1 text-gray-900 dark:text-slate-100">Bulk import</div><div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Paste CSV/TSV from Excel.</div><textarea value={bulkText} onChange={function(e){setBulkText(e.target.value);setBulkPreview(null);}} onPaste={function(){setTimeout(function(){var b=document.getElementById("parse-btn");if(b)b.click();},100);}} placeholder="Paste CSV here..." className={TA_BASE + " font-mono mb-2"} style={{minHeight:120}}/>{!bulkPreview&&<button id="parse-btn" onClick={parseBulk} disabled={bulkLoading||!bulkText.trim()} className={BTN_SM + " mb-2"}>{bulkLoading?"Parsing...":"Parse"}</button>}{bulkPreview&&(<div><div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Parsed {bulkPreview.length} companies</div><div className="max-h-[200px] overflow-y-auto mb-2.5 flex flex-col gap-0.5">{bulkPreview.map(function(c,i){
              /* Detect if this row's tickers conflict with a different existing company */
              var conflicts=[];
              [c.ordTicker,c.usTicker].filter(Boolean).forEach(function(tk){
                tk=tk.toUpperCase();
                companies.forEach(function(ec){
                  if(ec.name.toLowerCase()===(c.name||"").toLowerCase())return;
                  var hasIt=(ec.tickers||[]).some(function(t){return(t.ticker||"").toUpperCase()===tk;})||(ec.ticker||"").toUpperCase()===tk;
                  if(hasIt&&conflicts.indexOf(tk+":"+ec.name)<0)conflicts.push(tk+":"+ec.name);
                });
              });
              return(<div key={i} className={"px-2.5 py-1 rounded-md border text-xs flex gap-1.5 items-center flex-wrap "+(conflicts.length>0?"bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800":"bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700")}>{conflicts.length>0&&<span title={"Ticker conflict with: "+conflicts.join(", ")} className="text-amber-700 dark:text-amber-400 font-bold">⚠</span>}<span className="font-medium min-w-[100px] text-gray-900 dark:text-slate-100">{c.name}</span><span className={PILL_BASE}>{c.ticker}</span>{c.tier&&<span className={PILL_BASE}>{c.tier}</span>}{(c.portfolios||[]).map(function(p){return <span key={p} className="text-[11px] px-1.5 py-0.5 rounded-full text-white border-none" style={{background:"#1a5c2a"}}>{p}</span>;})}{c.status&&<span className={PILL_BASE}>{c.status}</span>}</div>);})}</div><div className="flex gap-2"><button onClick={function(){confirmBulk("merge");}} className={BTN_SM}>Merge</button><button onClick={function(){confirmBulk("replace");}} className={BTN}>Replace all</button><span onClick={function(){setBulkPreview(null);setBulkText("");}} className={LNK}>Clear</span><span onClick={function(){setShowBulk(false);}} className={LNK}>Cancel</span></div></div>)}</div>)}
        {showNew&&(<div className={CARD + " mb-2.5"}><div className="flex gap-2 mb-2.5"><div className="flex-[2]"><label className={LABEL}>Company name</label><input value={newName} onChange={function(e){setNewName(e.target.value);}} className={INP + " w-full box-border"}/></div><div className="flex-[2]"><label className={LABEL}>US Ticker Name <span className="text-gray-400 dark:text-slate-500">(optional)</span></label><input value={newNameUS} onChange={function(e){setNewNameUS(e.target.value);}} placeholder="e.g. Shell plc ADR" className={INP + " w-full box-border"}/></div><div className="flex-1"><label className={LABEL}>Ord Ticker</label><input value={newTicker} onChange={function(e){setNewTicker(e.target.value.toUpperCase());}} placeholder="e.g. SHEL-GB" className={INP + " w-full box-border"}/></div><div className="flex-1"><label className={LABEL}>US Ticker</label><input value={newTickerUS} onChange={function(e){setNewTickerUS(e.target.value.toUpperCase());}} placeholder="e.g. SHEL" className={INP + " w-full box-border"}/></div></div><div className="grid grid-cols-2 gap-2.5 mb-2.5"><div><label className={LABEL}>Tier</label><select value={newFields.tier||""} onChange={function(e){setNewFields(function(p){return{...p,tier:e.target.value};});}} className={INP + " w-full"}><option value="">--</option>{TIER_ORDER.map(function(t){return <option key={t}>{t}</option>;})}</select></div><div><label className={LABEL}>Status</label><select value={newFields.status||"Watch"} onChange={function(e){setNewFields(function(p){return{...p,status:e.target.value};});}} className={INP + " w-full"}><option>Own</option><option>Focus</option><option>Watch</option><option>Sold</option><option>Removed</option></select></div><div><label className={LABEL}>Sector</label><select value={newFields.sector||""} onChange={function(e){setNewFields(function(p){return{...p,sector:e.target.value};});}} className={INP + " w-full"}><option value="">--</option>{SECTOR_ORDER.map(function(s){return <option key={s}>{s}</option>;})}</select></div><div><label className={LABEL}>Country</label><select value={newFields.country||""} onChange={function(e){setNewFields(function(p){return{...p,country:e.target.value};});}} className={INP + " w-full"}><option value="">--</option>{COUNTRY_ORDER.map(function(c){return <option key={c}>{c}</option>;})}</select></div></div><div className="mb-2.5"><label className={LABEL + " mb-1"}>Portfolio(s)</label><div className="flex gap-1.5 flex-wrap">{PORTFOLIOS.map(function(p){var sel=(newFields.portfolios||[]).indexOf(p)>=0;return <span key={p} onClick={function(){setNewFields(function(ps){return{...ps,portfolios:sel?(ps.portfolios||[]).filter(function(x){return x!==p;}):(ps.portfolios||[]).concat([p])};});}} className={sel?TAGBTN_ACTIVE:TAGBTN_INACTIVE}>{p}</span>;})}</div></div><div><label className={LABEL + " mb-1"}>Port? (considering for)</label><div className="flex gap-1.5 flex-wrap">{PORTFOLIOS.filter(function(p){return(newFields.portfolios||[]).indexOf(p)<0;}).map(function(p){var note=(newFields.portNote||"").split(/[,\s]+/).filter(Boolean);var sel=note.indexOf(p)>=0;return <span key={p} onClick={function(){setNewFields(function(ps){var cur=(ps.portNote||"").split(/[,\s]+/).filter(Boolean);var nxt=sel?cur.filter(function(x){return x!==p;}):cur.concat([p]);return{...ps,portNote:nxt.join(", ")};});}} className={"text-[11px] px-1.5 py-0.5 rounded-full cursor-pointer transition-colors "+(sel?"font-medium":"font-normal")} style={{border:"1.5px dashed "+(dark?"#93c5fd":"#1a3a6b"),background:"transparent",color:dark?"#93c5fd":"#1a3a6b"}}>{p}</span>;})}</div></div><div className="flex gap-2 mt-3"><button onClick={addCompany} className={BTN_SM}>Create</button><span onClick={function(){setShowNew(false);}} className={LNK}>Cancel</span></div></div>)}

        {companies.length>0&&(<div className="flex gap-1.5 mb-4 flex-wrap border-b border-slate-200 dark:border-slate-700 pb-2.5 items-center no-print">
          {/* Companies subnav. All four sub-views (List / Metrics /
              Assignments / Earnings Calendar) flip companiesView; the
              parent tab stays "companies" throughout. Internal key
              "standard" is kept for backwards compat with persisted
              localStorage values. Render block below switches on
              companiesView. Subtab style matches Portfolios /
              Performance / Dashboard for cross-tab consistency. */}
          {[["standard","List"],["metrics","Metrics"],["research","Assignments"],["calendar","Earnings Calendar"]].map(function(v){var active=companiesView===v[0];return <button key={v[0]} onClick={function(){setCompaniesView(v[0]);}} className={active?TABST_ACTIVE:TABST_INACTIVE}>{v[1]}</button>;})}
          <button onClick={function(){ printPage("table"); }}
            className="ml-auto text-xs px-3 py-1 rounded-md cursor-pointer bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title={"Print the " + (companiesView==="metrics"?"Metrics":"List") + " table (landscape, dense)"}>🖨 Print</button>
        </div>)}
        {/* Research subview — was a top-level "research" tab; now a
            subtab of Companies sharing the same toolbar / filters / dupe
            warnings above. */}
        {companiesView==="research"&&(
          <ResearchBoard setSelCo={setSelCo} setTab={setTab} setCoView={setCoView} setSelCoOrigin={setSelCoOrigin}/>
        )}
        {/* Calendar subview — was a top-level "calendar" tab. Bulk
            import section at the bottom removed (the dedicated
            Earnings Dates import in Import already covers the same
            paste). */}
        {companiesView==="calendar"&&(
          <div><div className="flex items-center gap-2.5 mb-3 flex-wrap"><div className="text-sm font-medium text-gray-900 dark:text-slate-100">Earnings This Quarter</div><div className="flex gap-1.5">{["All","Own","Focus","Watch","Sold"].map(function(s){var active=calFilter===s;var cfg={All:{bg:undefined,color:undefined},Own:{bg:"#dcfce7",color:"#166534"},Focus:{bg:"#dbeafe",color:"#1e40af"},Watch:{bg:"#fef9c3",color:"#854d0e"},Sold:{bg:"#fee2e2",color:"#991b1b"}}[s];return <span key={s} onClick={function(){setCalFilter(s);}} className={"text-[11px] px-2.5 py-0.5 rounded-full cursor-pointer transition-colors " + (active ? "font-semibold" : "font-normal")} style={{border:"1px solid "+(active&&cfg.color?cfg.color:undefined),background:active?cfg.bg:undefined,color:active?cfg.color:undefined}}>{s}</span>;})}</div><div className="flex gap-1 ml-2">{["All","FIN","IN","FGL","GL","EM","SC"].map(function(p){var active=calPortFilter===p;return <span key={p} onClick={function(){setCalPortFilter(p);}} className={"text-[11px] px-2 py-0.5 rounded-full cursor-pointer border transition-colors "+(active?"border-gray-900 dark:border-slate-200 bg-gray-900 dark:bg-slate-200 text-white dark:text-slate-900 font-semibold":"border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700")}>{p}</span>;})}</div></div><EarningsCalendar companies={companies.filter(function(c){if(calFilter!=="All"&&c.status!==calFilter)return false;if(calPortFilter!=="All"&&(c.portfolios||[]).indexOf(calPortFilter)<0)return false;return true;})} onSelectCompany={function(c){setSelCo(c);setTab("companies");setCoView("dashboard");}}/></div>
        )}
        {(companiesView==="standard"||companiesView==="metrics")&&(
        companies.length===0?<p className="text-sm text-gray-500 dark:text-slate-400">No companies yet.</p>:(<div className="print-target">{companiesView==="metrics"?(
          <MetricsTable companies={displayedCos} search={coSearch} dark={dark} visible={metricsVisibleCols} onSelectCompany={function(c){setSelCo(c);setCoView("dashboard");}}/>
        ):(
          <div>
          <div style={{display:"table",width:"100%",borderCollapse:"separate",borderSpacing:"0 2px"}}>
            <div style={{display:"table-row"}} className="print-thead">
              <div style={{display:"table-cell",paddingBottom:4,paddingRight:6,position:"sticky",top:0,background:"var(--tw-prose-body,#fff)",zIndex:10}} className="bg-white dark:bg-slate-950"><span onClick={function(e){e.stopPropagation();if(selectedIds.size>0){clearSelected();}else{selectAll();}}} className="cursor-pointer inline-flex items-center justify-center w-4 h-4 rounded border border-slate-300 dark:border-slate-600 text-[10px] leading-none select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" style={{background:selectedIds.size===displayedCos.length&&displayedCos.length>0?"#2563eb":selectedIds.size>0?"#93c5fd":undefined,color:selectedIds.size>0?"#fff":undefined}}>{selectedIds.size===displayedCos.length&&displayedCos.length>0?"\u2713":selectedIds.size>0?"\u2013":""}</span></div>
              {/* HEADER_COLS is already filtered by visibleCols.has(c.id)
                  upstream; the extra label-based filter that used to live
                  here was a no-op when label === id but silently dropped
                  the column when those diverged (e.g. id 'MOS' relabeled
                  to 'MOS Live'). Removed entirely. */}
              {HEADER_COLS.map(function(col,i){var cs=col.sort;var active=cs&&coSort===cs;var arrow=active?(coSortDir==="asc"?" \u2191":" \u2193"):"";var isName=col.label==="Name";return(<div key={i} onClick={cs?function(){handleSortClick(cs);}:undefined} className={"text-[10px] uppercase tracking-wide pb-1 pr-2.5 whitespace-nowrap select-none sticky top-0 bg-white dark:bg-slate-950 " + (isName?"left-0 z-20 ":"z-10 ") + (active?"font-semibold text-gray-900 dark:text-slate-100":"font-normal text-gray-500 dark:text-slate-400") + (cs?" cursor-pointer":" cursor-default")} style={{display:"table-cell"}}>{col.label}{arrow}</div>);})}
            </div>
            {displayedCos.map(function(c,i){return <CoRow key={c.id+"-"+i} company={c} compact={compact} visibleCols={visibleCols} selected={selectedIds.has(c.id)} onToggleSelect={toggleSelect} onSelect={handleCoSelect} onDelete={handleCoDelete} onUpdate={updateCo} onQuickUpload={handleCoQuickUpload} dark={dark} rowAlerts={coAlertsByCoId[c.id]} pendingTpCount={pendingTpByCoId[c.id] || 0} latestTpRejected={!!rejectedTpForLatestByCoId[c.id]}/>;  })}
          </div>
          </div>
        )}</div>)
        )}
    </div>
  );
}
