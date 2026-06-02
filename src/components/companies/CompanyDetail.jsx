import { useState } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { ANTHROPIC_KEY } from '../../api/index.js';
import {
  PORTFOLIOS, SECTOR_ORDER, COUNTRY_ORDER, TEMPLATE_SECTIONS, SECTION_SUBHEADINGS,
  TP_CHANGES, THESIS_STATUSES, UPLOAD_TYPES, MONTHS, ALL_CURRENCIES, CURRENCY_MAP,
  FLAG_STYLES, SECTOR_COLORS, COUNTRY_COLORS, CONF_BG, CONF_COLOR,
} from '../../constants/index.js';
import {
  calcNormEPS, calcTP, calcMOS, mosBg, fmtPrice, fmtTP, fmtMOS, fmtTime, ccyPrefix,
  getCurrency, countryStyle, sectorStyle, impliedFYLabel,
  todayStr, reviewedColor, daysSince, parseDate, fmtDateUS,
  getTiers, tierToStatus, tierBg, tierPillStyle,
  isInitiationTx, getInitiatedDate, monthsSince, blankEarnings,
  escHTML, getCore, getConf, toHTML, toMD,
  repShares, repAvgCost, printPage, getLastReportedEntry, inferQuarter,
} from '../../utils/index.js';
import { StatusPill, PortPicker, SectionBlock, DiffView, BarRow, PillEl, PriceAgeIndicator } from '../ui/index.js';
import { ErrorBoundary } from '../ErrorBoundary.jsx';
import { useConfirm, useAlert } from '../ui/DialogProvider.jsx';
import { SectionEditTab, EarningsEntry, NotesCell, ActionCell, FlagCell, DatePicker } from '../forms/index.js';
import RatiosTab from './RatiosTab.jsx';
import FinancialsTab from './FinancialsTab.jsx';
import CompanyDashboard from './CompanyDashboard.jsx';
import SegmentsTab from './SegmentsTab.jsx';
import EpsRevisionsTab from './EpsRevisionsTab.jsx';
import GuidanceTab from './GuidanceTab.jsx';
import TpSuggestPanel from './TpSuggestPanel.jsx';
import PreEarningsBrief from './PreEarningsBrief.jsx';
import SnapshotTab from './SnapshotTab.jsx';
import PricesTab from './PricesTab.jsx';

const INP = "text-sm px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none";
const CARD = "bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 mb-2";
const LNK = "text-xs text-gray-500 dark:text-slate-400 cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 transition-colors";
const PILL_BASE = "text-[11px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center";
const TABST_ACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-blue-600 text-gray-900 dark:text-slate-100 font-semibold cursor-pointer bg-transparent";
const TABST_INACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-transparent text-gray-500 dark:text-slate-400 cursor-pointer bg-transparent hover:text-gray-700 dark:hover:text-slate-300";
const TABSM_ACTIVE = "text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-semibold cursor-pointer border border-slate-300 dark:border-slate-600";
const TABSM_INACTIVE = "text-xs px-2.5 py-1 rounded-md bg-transparent text-gray-500 dark:text-slate-400 cursor-pointer border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800";
const TAGBTN_BASE = "text-xs px-1.5 py-0.5 rounded-full cursor-pointer transition-colors border";
const TAGBTN_ACTIVE = TAGBTN_BASE + " border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold";
const TAGBTN_INACTIVE = TAGBTN_BASE + " border-slate-200 dark:border-slate-700 font-normal";
const TA_BASE = "w-full resize-y text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-[inherit] leading-relaxed focus:ring-2 focus:ring-blue-500 focus:outline-none";
const BTN = "text-xs px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
const BTN_PRIMARY = "text-sm px-5 py-2 font-semibold bg-blue-700 text-white border-none rounded-md cursor-pointer hover:bg-blue-800 transition-colors";
const BTN_SM = "text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
const LABEL = "text-[11px] text-gray-500 dark:text-slate-400 block mb-1";
const SECTION_LABEL = "text-xs font-medium text-gray-500 dark:text-slate-400 mb-2 uppercase tracking-wide";

/* CompanyDetail — the company-specific view with all subtabs.
   Rendered when tab === "companies" && selCo. Extracted from App.jsx verbatim;
   original was an inline IIFE capturing dozens of parent-scope variables. */
export function CompanyDetail(props){
  const {
    selCo, setSelCo, coView, setCoView, coTabs, pendingVal, setPendingVal,
    tmplRaw, setTmplRaw, tmplLoading, tmplSearch, setTmplSearch, tmplHighlight, setTmplHighlight, flashSections,
    upText, setUpText, upType, setUpType, upLoading, pendingDiff, setPendingDiff, pendingMeta, setPendingMeta,
    commitValuation, saveEarningsEntry, deleteEarningsEntry, acceptDiff, importTemplate, processUpload, exportCompanyPDF,
    linkLibOpen, setLinkLibOpen,
    setTab, selCoOrigin, setSelCoOrigin,
    showAddTargetHist, setShowAddTargetHist, newTargetHist, setNewTargetHist,
    showAddTx, setShowAddTx, newTx, setNewTx,
    weightsFilter, setWeightsFilter, txFilter, setTxFilter,
    openDiscussions, saved,
    linkedEntries, setExpanded, setSaved, updEntry,
  } = props;
  const {
    companies, setCompanies, repData, fxRates, specialWeights, annotations, dark, currentUser,
    addComment, deleteComment, entryComments, newCommentText, setNewCommentText,
    addTransaction, deleteTransaction, setTxInitOverride, setTxCashFlow,
    updateTargetWeight, addTargetHistoryEntry, deleteTargetHistoryEntry, updateInitiatedDate,
    updateCo, cp, copied, setCopied, tpApprovals,
  } = useCompanyContext();
  const [showDiag,setShowDiag]=useState(false);
  const confirm = useConfirm();
  const alertFn = useAlert();


        var currency=getCurrency(selCo.country);var pv=pendingVal||selCo.valuation||{};var activeCurrency=pv.currency||currency;
        var normEPS=calcNormEPS(pv);var eps=normEPS!==null?normEPS:parseFloat(pv.eps);
        var tp=calcTP(pv.pe,eps);var mos=calcMOS(tp,pv.price);var mosStyle=mosBg(mos);
        /* Fixed TP — user enters the target price directly (via the
           Valuation upload's last column or the input below). Stays put
           as FactSet updates eps1/eps2, so it reflects the last portfolio-
           decision TP. NormEPS Fixed is implied = TP Fixed / Target PE,
           displayed for context only.
           Legacy fallback: if only normEPSFixed is present (older data),
           derive tpFixed from it. */
        var tpFixedNum=parseFloat(pv.tpFixed);
        if(isNaN(tpFixedNum)&&pv.normEPSFixed){
          var legacyEps=parseFloat(pv.normEPSFixed);
          var legacyPe=parseFloat(pv.pe);
          if(!isNaN(legacyEps)&&!isNaN(legacyPe))tpFixedNum=Math.round(legacyPe*legacyEps*100)/100;
        }
        var tpFixed=isNaN(tpFixedNum)?null:tpFixedNum;
        var peNum=parseFloat(pv.pe);
        var impliedNormEPSFixed=(tpFixed!==null&&!isNaN(peNum)&&peNum>0)?tpFixed/peNum:null;
        var mosFixed=calcMOS(tpFixed,pv.price);
        var mosFixedStyle=mosBg(mosFixed);
        /* Pending TP approval (if any) for THIS company. Surfaces an
           hourglass + the suggested-new TP on the TP Fixed card and the
           suggested-new MOS on the MOS Fixed card, so the user knows
           the current TP Fixed is about to move and what it'll move to
           without clicking into the Approvals modal. Just the first
           pending record — if multiple exist, the Approvals panel is
           the right surface for picking which one wins. */
        var pendingApproval = (tpApprovals||[]).find(function(a){
          return a.companyId === selCo.id && a.status === "pending";
        }) || null;
        var pendingTP = pendingApproval && pendingApproval.toTP != null && isFinite(pendingApproval.toTP)
          ? parseFloat(pendingApproval.toTP) : null;
        var pendingMOSFixed = (pendingTP !== null && pv.price) ? calcMOS(pendingTP, pv.price) : null;
        var hist=selCo.tpHistory||[];var portfolios=selCo.portfolios||[];var portWeights=selCo.portWeights||{};
        var earningsEntries=selCo.earningsEntries||[];
        return(<div>
          {/* Header */}
          <div className="flex items-center gap-2 mb-3.5 flex-wrap">
            <button onClick={function(){setSelCo(null);setPendingVal(null);if(selCoOrigin){setTab(selCoOrigin);setSelCoOrigin(null);}}} className={BTN}>{"\u2190"} Back</button>
            <span className="text-[15px] font-medium text-gray-900 dark:text-slate-100">{selCo.name}</span>
            <input defaultValue={selCo.usTickerName||""} key={selCo.id+"-usname-"+(selCo.usTickerName||"")} onBlur={function(e){updateCo(selCo.id,{usTickerName:e.target.value.trim()});}} placeholder="US ticker name (alt)" className="text-[11px] px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-blue-400 dark:focus:border-blue-500 bg-transparent focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-500 dark:text-slate-400 italic w-[160px]"/>
            {(selCo.tickers||[]).filter(function(t){return t.price;}).map(function(t){return <span key={t.ticker} className="text-xs px-2.5 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-gray-900 dark:text-slate-100">{t.ticker}: {t.currency||""} {fmtPrice(t.price)}</span>;})}
            {/* ADR premium/discount vs the implied ADR-converted TP.
                Read-only pill comparing the live US-listed ADR price
                to the ADR-converted TP that's shown on the Overview
                subtab. Positive (emerald) = ADR is trading ABOVE its
                target (rich); negative (rose) = trading BELOW (cheap).
                Implied ADR TP (USD) = (ord_TP / fxRates[ord_ccy]) × ratio.
                Premium = (US_price - implied_ADR_TP) / implied × 100. */}
            {(function(){
              var ratioNum = parseFloat(selCo.adrRatio);
              if (!(isFinite(ratioNum) && ratioNum > 0)) return null;
              var usTicker = (selCo.tickers||[]).find(function(t){
                return t.ticker && (t.currency||"USD").toUpperCase()==="USD" && !t.isOrdinary;
              });
              if (!usTicker) return null;
              var adrPrice = parseFloat(usTicker.price);
              var ordCcy = (activeCurrency || "USD").toUpperCase();
              var fx = ordCcy === "USD" ? 1 : parseFloat((fxRates||{})[ordCcy]);
              var ordTpRaw = (tpFixed !== null && isFinite(tpFixed)) ? tpFixed : NaN;
              if (!isFinite(adrPrice) || !isFinite(ordTpRaw) || !isFinite(fx) || fx<=0) return null;
              var impliedAdrTp = (ordTpRaw / fx) * ratioNum;
              if (!(impliedAdrTp > 0)) return null;
              var prem = (adrPrice - impliedAdrTp) / impliedAdrTp * 100;
              return (
                <span
                  className={"text-[11px] px-2 py-0.5 rounded-full font-semibold " + (prem >= 0
                    ? "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300"
                    : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300")}
                  title={"ADR @ $" + adrPrice.toFixed(2) + " vs implied ADR TP $" + impliedAdrTp.toFixed(2) + " (ord " + ordCcy + " " + ordTpRaw.toFixed(2) + " ÷ " + fx.toFixed(4) + " × " + ratioNum + ")"}
                >
                  ADR {prem >= 0 ? "premium +" : "discount "}{prem.toFixed(1)}%
                </span>
              );
            })()}
            {selCo.country&&(function(){var cs=countryStyle(selCo.country);return <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{background:cs.bg,color:cs.color}}>{selCo.country}</span>;}())}
            {selCo.sector&&(function(){var ss=sectorStyle(selCo.sector);return <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{background:ss.bg,color:ss.color}}>{selCo.sector}</span>;}())}
            {portfolios.map(function(p){return <span key={p} className="text-[11px] px-1.5 py-0.5 rounded-full font-medium text-white border-none" style={{background:"#1a5c2a"}}>{p}</span>;})}
            {selCo.status&&<StatusPill status={selCo.status}/>}
            {/* TP pill was redundant with the larger TP Live / TP Fixed
                tiles in the Snapshot section below. Removed. The two
                MOS pills are the at-a-glance signal — live (driven by
                PE × normEPS, drifts with estimate revisions) and fixed
                (the firm's committed-vote target, stable). */}
            {mosStyle && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: mosStyle.bg, color: mosStyle.color }}>
                MOS Live: {fmtMOS(mos)}
              </span>
            )}
            {mosFixedStyle && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: mosFixedStyle.bg, color: mosFixedStyle.color }}>
                MOS Fixed: {fmtMOS(mosFixed)}
              </span>
            )}
            {(function(){var coAnnotations=annotations.filter(function(a){return !a.resolved&&((a.scope==="company"&&a.companyId===selCo.id)||(a.scope==="row"&&a.companyId===selCo.id));});return <button onClick={function(){openDiscussions({scope:"company",companyId:selCo.id});}} className={BTN+" ml-auto"}>💬 Discuss{coAnnotations.length>0&&<span className="ml-1 text-[10px] px-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold">{coAnnotations.length}</span>}</button>;})()}
            <button onClick={function(){setShowDiag(function(v){return !v;});}} className={BTN} title="Toggle diagnostic panel — what the app thinks it knows about this company">🔍 Debug</button>
          </div>
          {/* Diagnostic panel — read-only dump of what the app thinks it knows about this company */}
          {showDiag&&(function(){
            var tks=selCo.tickers||[];
            var txs=(selCo.transactions||[]).slice().sort(function(a,b){return(a.date||"").localeCompare(b.date||"");});
            /* Walk running position per portfolio */
            var running={};var initRows=[];
            txs.forEach(function(t){var p=t.portfolio||"?";var prev=running[p]||0;running[p]=prev+(parseFloat(t.shares)||0);var isInit=t.initOverride===true||(t.initOverride!==false&&prev<=0&&running[p]>0);initRows.push({tx:t,prev:prev,after:running[p],isInit:isInit});});
            return(<div className={CARD + " mb-3 !border-blue-300 dark:!border-blue-700 bg-blue-50/40 dark:bg-blue-900/10"}>
              <div className="flex justify-between items-center mb-2">
                <div className={SECTION_LABEL + " mb-0"}>Diagnostics</div>
                <button onClick={function(){setShowDiag(false);}} className={BTN_SM}>Close</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <div className="font-semibold mb-1 text-gray-900 dark:text-slate-100 font-sans">Tickers ({tks.length})</div>
                  {tks.length===0?<div className="text-gray-500 dark:text-slate-400">(none)</div>:tks.map(function(t){
                    var tk=(t.ticker||"").toUpperCase();
                    var repHits=Object.keys(repData||{}).map(function(port){var e=(repData[port]||{})[tk];if(!e)return null;return port+":"+repShares(e)+"sh@"+(repAvgCost(e)||"-");}).filter(Boolean);
                    return(<div key={tk} className="mb-0.5">
                      <span className="text-gray-900 dark:text-slate-100">{t.ticker}</span>
                      {t.isOrdinary&&<span className="text-green-700 dark:text-green-400"> (ord)</span>}
                      <span className="text-gray-500 dark:text-slate-400"> · {t.currency||"USD"} · {t.price||"(no price)"}</span>
                      {repHits.length>0&&<span className="text-blue-700 dark:text-blue-300"> · rep: {repHits.join(", ")}</span>}
                    </div>);
                  })}
                </div>
                <div>
                  <div className="font-semibold mb-1 text-gray-900 dark:text-slate-100 font-sans">Per-portfolio state</div>
                  {(selCo.portfolios||[]).length===0?<div className="text-gray-500 dark:text-slate-400">(not in any portfolio)</div>:(selCo.portfolios||[]).map(function(p){
                    var init=getInitiatedDate(selCo,p);
                    var initManual=((selCo.initiatedDates||{})[p])||null;
                    var tgt=(selCo.portWeights||{})[p]||"-";
                    var histCount=((selCo.portWeightHistory||[]).filter(function(h){return h.portfolio===p;})).length;
                    var txCount=txs.filter(function(t){return t.portfolio===p;}).length;
                    return(<div key={p} className="mb-0.5">
                      <span className="text-gray-900 dark:text-slate-100">{p}</span>
                      <span className="text-gray-500 dark:text-slate-400"> · target {tgt}%</span>
                      <span className="text-gray-500 dark:text-slate-400"> · init {init||"—"}{initManual?" (manual)":init?" (auto)":""}</span>
                      <span className="text-gray-500 dark:text-slate-400"> · {txCount} tx · {histCount} hist</span>
                    </div>);
                  })}
                </div>
                <div className="md:col-span-2">
                  <div className="font-semibold mb-1 text-gray-900 dark:text-slate-100 font-sans">Transactions + running position ({txs.length})</div>
                  {txs.length===0?<div className="text-gray-500 dark:text-slate-400">(none)</div>:(<div className="max-h-60 overflow-y-auto">
                    {initRows.map(function(r,i){return(<div key={r.tx.id||i} className="mb-0.5">
                      <span className="text-gray-500 dark:text-slate-400">{fmtDateUS(r.tx.date)}</span>
                      <span className="text-gray-500 dark:text-slate-400"> · {r.tx.portfolio||"?"}</span>
                      <span className={(parseFloat(r.tx.shares)||0)>=0?"text-green-700 dark:text-green-400":"text-red-700 dark:text-red-400"}> · {(parseFloat(r.tx.shares)||0)>=0?"+":""}{r.tx.shares}</span>
                      <span className="text-gray-500 dark:text-slate-400"> @ {r.tx.price||"-"}</span>
                      <span className="text-gray-700 dark:text-slate-300"> · running {r.prev} → {r.after}</span>
                      {r.isInit&&<span className="text-blue-700 dark:text-blue-300"> ★ INIT</span>}
                      {r.tx.initOverride===true&&<span className="text-blue-700 dark:text-blue-300"> (manual)</span>}
                      {r.tx.initOverride===false&&<span className="text-red-700 dark:text-red-400"> (muted)</span>}
                      {r.tx.cashFlow&&<span className="text-amber-700 dark:text-amber-400"> ⟳ CF</span>}
                    </div>);})}
                  </div>)}
                </div>
              </div>
              {/* ETF sector mix — for the rare case (e.g. iShares EWY) where a
                  single holding spans multiple sectors and we want the dashboard
                  Sector breakdown to reflect that split. Hidden inside Debug
                  panel so non-ETF companies see no extra UI. When set, the
                  Sector breakdown distributes this company's MV by these % and
                  shows a slice of the company in each contributing sector. */}
              <div className="mt-4 pt-3 border-t border-blue-200 dark:border-blue-800">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold text-xs text-gray-900 dark:text-slate-100 font-sans">ETF Sector Mix <span className="text-gray-500 dark:text-slate-400 font-normal">(optional — splits Sector breakdown across GICS sectors; Cash isn't counted as sector exposure)</span></div>
                  {selCo.sectorWeights ? (
                    <button onClick={function(){ var u=Object.assign({},selCo); delete u.sectorWeights; delete u.sectorWeightsUpdatedAt; setSelCo(u); setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});}); }} className={BTN_SM}>Remove</button>
                  ) : (
                    <button onClick={function(){ var u=Object.assign({},selCo,{sectorWeights:{},sectorWeightsUpdatedAt:new Date().toISOString()}); setSelCo(u); setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});}); }} className={BTN_SM}>Add</button>
                  )}
                </div>
                {selCo.sectorWeights && (function(){
                  var sw = selCo.sectorWeights || {};
                  /* Local helper — bind once per render. Updates a single key,
                     stamps the updatedAt, persists to companies state. */
                  function updateWeight(key, raw){
                    var clean=String(raw||"").replace(/[^0-9.\-]/g,"");
                    var nw=Object.assign({},sw);
                    if(clean==="") delete nw[key]; else nw[key]=clean;
                    var u=Object.assign({},selCo,{sectorWeights:nw,sectorWeightsUpdatedAt:new Date().toISOString()});
                    setSelCo(u);
                    setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});
                  }
                  var sectorSum = SECTOR_ORDER.reduce(function(s,k){var v=parseFloat(sw[k]); return s + (isFinite(v)?v:0);}, 0);
                  var cashVal = parseFloat(sw["Cash"]);
                  var cashSum = isFinite(cashVal) ? cashVal : 0;
                  var totalSum = sectorSum + cashSum;
                  var stamp = selCo.sectorWeightsUpdatedAt;
                  /* Show date + time in user's locale, abbreviated. */
                  var stampLabel = stamp ? new Date(stamp).toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "(never)";
                  return (<div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1 text-xs font-sans">
                      {SECTOR_ORDER.map(function(s){
                        var v = sw[s] != null ? String(sw[s]) : "";
                        return (<label key={s} className="flex items-center gap-1.5">
                          <span className="text-gray-700 dark:text-slate-300 flex-1 truncate" title={s}>{s}</span>
                          <input value={v} onChange={function(e){updateWeight(s, e.target.value);}}
                            placeholder="0"
                            className={INP + " !text-xs !px-1.5 !py-0.5 w-[55px] text-right"}/>
                          <span className="text-gray-400 dark:text-slate-500">%</span>
                        </label>);
                      })}
                      {/* Cash row — visually offset from the GICS sectors. */}
                      <label className="flex items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-700 md:border-t-0 md:pt-0">
                        <span className="text-gray-700 dark:text-slate-300 flex-1 italic">Cash</span>
                        <input value={sw["Cash"] != null ? String(sw["Cash"]) : ""}
                          onChange={function(e){updateWeight("Cash", e.target.value);}}
                          placeholder="0"
                          className={INP + " !text-xs !px-1.5 !py-0.5 w-[55px] text-right"}/>
                        <span className="text-gray-400 dark:text-slate-500">%</span>
                      </label>
                    </div>
                    <div className="mt-2 flex justify-between items-center text-[11px] gap-3 flex-wrap">
                      <span className={Math.abs(totalSum-100)<0.5 ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>
                        Total: {totalSum.toFixed(1)}% (sectors {sectorSum.toFixed(1)}% + cash {cashSum.toFixed(1)}%) {Math.abs(totalSum-100)<0.5 ? "✓" : "(should sum to 100% — values are normalized at display time)"}
                      </span>
                      <span className="text-gray-500 dark:text-slate-400">Last updated: {stampLabel}</span>
                    </div>
                  </div>);
                })()}
              </div>
            </div>);
          })()}
          {/* Tabs wrap onto multiple rows on every viewport (was
              previously horizontal-scroll on portrait, but the user
              prefers seeing all tabs at once even if they take 3-4
              rows on a phone). */}
          <div className="flex gap-1 mb-3.5 flex-wrap">
            {coTabs.map(function(t){return <button key={t.id} title={t.title||undefined} className={(coView===t.id?TABSM_ACTIVE:TABSM_INACTIVE)+" whitespace-nowrap"} onClick={function(){setCoView(t.id);}}>{t.label}</button>;})}
          </div>

          {/* Per-subtab ErrorBoundary so a render crash in one tab
              (e.g. Thesis hitting bad data) shows a localized error
              without nuking the whole company view. resetKey={coView}
              clears the error when the user switches tabs. */}
          <ErrorBoundary resetKey={coView}>

          {/* TEMPLATE TAB */}
          {/* Portfolio weights / History / Transactions — visible on every tab */}
                      {coView==="weights"&&(<div>
{/* Portfolio weights card at top */}
            {portfolios.length>0&&(<div className={CARD + " mb-3"}>
              <div className={SECTION_LABEL}>Target Weights</div>
              <div className="flex gap-3 flex-wrap">
                {portfolios.map(function(p){return(<div key={p} className="flex items-center gap-1.5"><span className="text-xs font-medium text-gray-900 dark:text-slate-100 min-w-[28px]">{p}</span><input type="number" step="0.1" min="0" max="100" defaultValue={portWeights[p]||""} key={selCo.id+"-"+p+"-"+(portWeights[p]||"")} onBlur={function(e){updateTargetWeight(selCo.id,p,e.target.value);setSelCo(function(prev){if(!prev||prev.id!==selCo.id)return prev;var nw=Object.assign({},prev.portWeights||{});nw[p]=e.target.value;return Object.assign({},prev,{portWeights:nw});});}} onKeyDown={function(e){if(e.key==="Enter")e.target.blur();}} placeholder="0.0" className={INP + " w-[65px] !text-xs"}/><span className="text-[11px] text-gray-500 dark:text-slate-400">%</span></div>);})}
              </div>
            </div>)}
            {/* Initiated Dates — blank = auto-derived from earliest BUY transaction */}
            {portfolios.length>0&&(<div className={CARD + " mb-3"}>
              <div className={SECTION_LABEL}>Initiated Date (per portfolio)</div>
              <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">Leave blank to auto-use the earliest BUY transaction in that portfolio.</div>
              <div className="flex gap-3 flex-wrap">
                {portfolios.map(function(p){var manual=((selCo.initiatedDates||{})[p])||"";var auto=getInitiatedDate(selCo,p);var showsAuto=!manual&&auto;return(<div key={p} className="flex items-center gap-1.5"><span className="text-xs font-medium text-gray-900 dark:text-slate-100 min-w-[28px]">{p}</span><input type="date" defaultValue={manual} key={selCo.id+"-init-"+p+"-"+manual} onBlur={function(e){updateInitiatedDate(selCo.id,p,e.target.value);setSelCo(function(prev){if(!prev||prev.id!==selCo.id)return prev;var nd=Object.assign({},prev.initiatedDates||{});if(e.target.value)nd[p]=e.target.value;else delete nd[p];return Object.assign({},prev,{initiatedDates:nd});});}} className={INP + " !text-xs"}/>{showsAuto&&<span className="text-[10px] text-gray-500 dark:text-slate-400">(auto: {auto})</span>}</div>);})}
              </div>
            </div>)}
                          <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] text-gray-500 dark:text-slate-400 uppercase tracking-wide">Filter:</span>
                {["All"].concat(portfolios).map(function(p){var active=weightsFilter===p;return <span key={p} onClick={function(){setWeightsFilter(p);}} className={"text-[11px] px-2 py-0.5 rounded-full cursor-pointer transition-colors " + (active ? "bg-slate-100 dark:bg-slate-800 border border-slate-400 dark:border-slate-500 text-gray-900 dark:text-slate-100 font-semibold" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{p}</span>;})}
              </div>
{/* Target Weight History */}
            {portfolios.length>0&&(<div className={CARD + " mb-3"}>
              <div className="flex items-center justify-between mb-2">
                <div className={SECTION_LABEL + " mb-0"}>Target Weight History</div>
                <button onClick={function(){setShowAddTargetHist(function(v){return !v;});}} className={BTN_SM}>{showAddTargetHist?"Cancel":"+ Add historical change"}</button>
              </div>
              {showAddTargetHist&&(<div className="mb-3 p-2 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 flex gap-2 flex-wrap items-end">
                <div><label className={LABEL}>Date</label><input type="date" value={newTargetHist.date} onChange={function(e){setNewTargetHist(Object.assign({},newTargetHist,{date:e.target.value}));}} className={INP + " !text-xs"}/></div>
                <div><label className={LABEL}>Portfolio</label><select value={newTargetHist.portfolio} onChange={function(e){setNewTargetHist(Object.assign({},newTargetHist,{portfolio:e.target.value}));}} className={INP + " !text-xs"}><option value="">--</option>{PORTFOLIOS.map(function(p){return <option key={p} value={p}>{p}</option>;})}</select></div>
                <div><label className={LABEL}>Old %</label><input type="number" step="0.1" min="0" max="100" value={newTargetHist.oldWeight} onChange={function(e){setNewTargetHist(Object.assign({},newTargetHist,{oldWeight:e.target.value}));}} placeholder="0.0" className={INP + " !text-xs w-20"}/></div>
                <div><label className={LABEL}>New %</label><input type="number" step="0.1" min="0" max="100" value={newTargetHist.newWeight} onChange={function(e){setNewTargetHist(Object.assign({},newTargetHist,{newWeight:e.target.value}));}} placeholder="0.0" className={INP + " !text-xs w-20"}/></div>
                <button onClick={function(){if(!newTargetHist.date||!newTargetHist.portfolio)return;addTargetHistoryEntry(selCo.id,{date:newTargetHist.date,portfolio:newTargetHist.portfolio,oldWeight:parseFloat(newTargetHist.oldWeight)||0,newWeight:parseFloat(newTargetHist.newWeight)||0});setNewTargetHist({date:"",portfolio:"",oldWeight:"",newWeight:""});setShowAddTargetHist(false);}} disabled={!newTargetHist.date||!newTargetHist.portfolio} className={BTN_SM}>Add</button>
              </div>)}
              {selCo.portWeightHistory&&selCo.portWeightHistory.length>0&&(<div className="space-y-1">
                {selCo.portWeightHistory.slice().filter(function(h){return weightsFilter==="All"||h.portfolio===weightsFilter;}).sort(function(a,b){return(b.date||"").localeCompare(a.date||"");}).map(function(h){var delta=(parseFloat(h.newWeight)||0)-(parseFloat(h.oldWeight)||0);var color=delta>0?"#166534":delta<0?"#dc2626":"#6b7280";return(<div key={h.id} className="flex items-center gap-2 text-xs py-0.5"><span className="text-gray-500 dark:text-slate-400 font-mono">{fmtDateUS(h.date)}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-medium">{h.portfolio}</span><span className="text-gray-700 dark:text-slate-300">{(parseFloat(h.oldWeight)||0).toFixed(1)}% → <span style={{color:color,fontWeight:600}}>{(parseFloat(h.newWeight)||0).toFixed(1)}%</span></span>{h.author&&<span className="text-[10px] text-gray-400 dark:text-slate-500">({h.author})</span>}<span onClick={function(){deleteTargetHistoryEntry(selCo.id,h.id);}} className="ml-auto text-[11px] text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700">{"\u00D7"}</span></div>);})}
              </div>)}
            </div>)}
                      </div>)}
          {coView==="transactions"&&(<div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] text-gray-500 dark:text-slate-400 uppercase tracking-wide">Filter:</span>
                {["All"].concat(portfolios).map(function(p){var active=txFilter===p;return <span key={p} onClick={function(){setTxFilter(p);}} className={"text-[11px] px-2 py-0.5 rounded-full cursor-pointer transition-colors " + (active ? "bg-slate-100 dark:bg-slate-800 border border-slate-400 dark:border-slate-500 text-gray-900 dark:text-slate-100 font-semibold" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{p}</span>;})}
              </div>
{/* Transactions */}
            {portfolios.length>0&&(<div className={CARD + " mb-3"}>
              <div className="flex items-center justify-between mb-2">
                <div className={SECTION_LABEL + " mb-0"}>Transactions{(function(){var n=(selCo.transactions||[]).filter(function(t){return txFilter==="All"||t.portfolio===txFilter;}).length;return n>0?" ("+n+")":"";})()}</div>
                <button onClick={function(){setShowAddTx(function(v){return !v;});}} className={BTN_SM}>{showAddTx?"Cancel":"+ Add transaction"}</button>
              </div>
              {showAddTx&&(<div className="mb-3 p-2 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 flex gap-2 flex-wrap items-end">
                <div><label className={LABEL}>Date</label><input type="date" value={newTx.date} onChange={function(e){setNewTx(Object.assign({},newTx,{date:e.target.value}));}} className={INP + " !text-xs"}/></div>
                <div><label className={LABEL}>Portfolio</label><select value={newTx.portfolio} onChange={function(e){setNewTx(Object.assign({},newTx,{portfolio:e.target.value}));}} className={INP + " !text-xs"}><option value="">--</option>{PORTFOLIOS.map(function(p){return <option key={p} value={p}>{p}</option>;})}</select></div>
                <div><label className={LABEL}>Shares (- = sell)</label><input type="number" step="1" value={newTx.shares} onChange={function(e){setNewTx(Object.assign({},newTx,{shares:e.target.value}));}} placeholder="1000" className={INP + " !text-xs w-24"}/></div>
                <div><label className={LABEL}>Unit Price</label><input type="number" step="0.01" value={newTx.price} onChange={function(e){setNewTx(Object.assign({},newTx,{price:e.target.value}));}} placeholder="0.00" className={INP + " !text-xs w-24"}/></div>
                <div><label className={LABEL}>Amount</label><input type="number" step="0.01" value={newTx.amount} onChange={function(e){setNewTx(Object.assign({},newTx,{amount:e.target.value}));}} placeholder="0.00" className={INP + " !text-xs w-28"}/></div>
                <label className="flex items-center gap-1.5 cursor-pointer pb-1 text-[11px] text-gray-700 dark:text-slate-300" title="Tick if this trade was triggered by a portfolio cash inflow or outflow (not a discretionary decision)">
                  <input type="checkbox" checked={!!newTx.cashFlow} onChange={function(e){setNewTx(Object.assign({},newTx,{cashFlow:e.target.checked}));}} className="accent-amber-500"/>
                  Cash flow
                </label>
                <button onClick={function(){if(!newTx.date||!newTx.portfolio||newTx.shares===""||isNaN(parseFloat(newTx.shares)))return;var shares=parseFloat(newTx.shares);var txId=(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+"-"+Math.random().toString(36).slice(2));var txRec={id:txId,date:newTx.date,portfolio:newTx.portfolio,shares:shares,price:parseFloat(newTx.price)||0,amount:parseFloat(newTx.amount)||0,type:shares>=0?"BUY":"SELL"};if(newTx.cashFlow)txRec.cashFlow=true;addTransaction(selCo.id,txRec);setSelCo(function(prev){if(!prev||prev.id!==selCo.id)return prev;var all=(prev.transactions||[]).concat([txRec]);all.sort(function(a,b){return(b.date||"").localeCompare(a.date||"");});return Object.assign({},prev,{transactions:all});});setNewTx({date:"",portfolio:"",shares:"",price:"",amount:"",cashFlow:false});setShowAddTx(false);}} disabled={!newTx.date||!newTx.portfolio||newTx.shares===""} className={BTN_SM}>Add</button>
              </div>)}
              {selCo.transactions&&selCo.transactions.length>0?(function(){
                /* Current price for the % G/L column needs to match the
                   ticker the trade was actually executed in \u2014 a position
                   held as ANCTF (USD ADR) shouldn't be compared against
                   ATD-CA (CAD ord). For each row, find which of the
                   company's tickers has rep shares in that transaction's
                   portfolio and use that ticker's price. Falls back to
                   the ord ticker, then valuation.price.

                   getCurrentPriceForTx(t) is closed over the company so
                   the rendering loop below can call it once per row. */
                function getTickerForTx(t){
                  /* Prefer the transaction's own stored ticker/currency
                     (set by the import when the row included Ticker /
                     Currency columns). Lets historical trades on
                     superseded tickers (ANCUFOLD \u2192 ANCTF \u2192 BL56KN2)
                     display with their actual ticker + currency,
                     instead of being remapped to the current rep
                     holding. */
                  if (t.ticker) {
                    return { ticker: t.ticker, currency: t.currency || "USD", price: undefined };
                  }
                  var pRep=(repData||{})[t.portfolio]||{};
                  var pickedTk=(selCo.tickers||[]).find(function(tk){
                    var k=(tk.ticker||"").toUpperCase();
                    return k && pRep[k]!==undefined;
                  });
                  if(pickedTk) return pickedTk;
                  /* No rep holding for this portfolio's ticker \u2014 fall
                     back to the ord ticker so the row still shows
                     something useful. */
                  return (selCo.tickers||[]).find(function(tk){return tk.isOrdinary;}) || null;
                }
                function getCurrentPriceForTx(t){
                  /* When the row stores its own ticker and that ticker
                     no longer exists on the company (superseded — e.g.
                     ANCUFOLD), we can't sensibly mark-to-market the
                     trade. Skip the % G/L for those rows. */
                  if (t.ticker) {
                    var stillHeld = (selCo.tickers||[]).some(function(tk){
                      return (tk.ticker||"").toUpperCase() === t.ticker.toUpperCase();
                    });
                    if (!stillHeld) return null;
                  }
                  var tk=getTickerForTx(t);
                  if(tk){
                    var p=parseFloat(tk.price);
                    if(isFinite(p)) return p;
                  }
                  var vp=parseFloat((selCo.valuation||{}).price);
                  return isFinite(vp)?vp:null;
                }
                /* Running balance per portfolio. Walk every transaction
                   in chronological order, accumulating shares per
                   portfolio. After the loop, runningByTxId[id] is the
                   portfolio's share total AFTER that trade. Display
                   table is sorted newest-first so the column reads as
                   "balance after this trade." Compare the most-recent
                   running (per portfolio) against the company's rep
                   shares in that portfolio — mismatches surface as red
                   so missing trades are obvious. */
                var runningByTxId = {};
                var lastRunByPort = {};
                selCo.transactions.slice().sort(function(a,b){
                  var da=a.date||"", db=b.date||"";
                  if(da!==db) return da.localeCompare(db);
                  return (a.id||"").localeCompare(b.id||"");
                }).forEach(function(t){
                  var p = t.portfolio||"?";
                  var sh = parseFloat(t.shares)||0;
                  var prev = lastRunByPort[p] || 0;
                  var next = prev + sh;
                  lastRunByPort[p] = next;
                  runningByTxId[t.id] = next;
                });
                /* For mismatch detection, compare the final per-portfolio
                   running against rep shares of that portfolio's ticker
                   on this company. We use the same ticker-pick logic as
                   getTickerForTx. */
                function repSharesForPort(port){
                  var pRep = (repData||{})[port] || {};
                  var pickedTk = (selCo.tickers||[]).find(function(tk){
                    var k = (tk.ticker||"").toUpperCase();
                    return k && pRep[k] !== undefined;
                  });
                  if(!pickedTk) return null;
                  var v = pRep[(pickedTk.ticker||"").toUpperCase()];
                  if(!v) return null;
                  var sh = (typeof v === "object") ? v.shares : v;
                  return isFinite(parseFloat(sh)) ? parseFloat(sh) : null;
                }
                var mismatchByPort = {};
                Object.keys(lastRunByPort).forEach(function(p){
                  var actual = repSharesForPort(p);
                  if (actual !== null && Math.abs(actual - lastRunByPort[p]) > 0.0001) {
                    mismatchByPort[p] = { running: lastRunByPort[p], actual: actual };
                  }
                });

                return(<div style={{display:"table",width:"100%",borderCollapse:"separate",borderSpacing:"0 2px"}}>
                <div style={{display:"table-row"}}>
                  {[["Date"],["Portfolio"],["Ticker"],["Type"],["Shares"],["Running"],["Unit Price"],["% G/L"],["Amount"],[""]].map(function(h,i){return <div key={i} className="text-[10px] uppercase tracking-wide pb-1.5 pr-2 text-gray-500 dark:text-slate-400 font-semibold" style={{display:"table-cell"}} title={h[0]==="Running"?"Cumulative shares in this portfolio after this trade":undefined}>{h[0]}</div>;})}
                </div>
                {selCo.transactions.slice().filter(function(t){return txFilter==="All"||t.portfolio===txFilter;}).sort(function(a,b){return(b.date||"").localeCompare(a.date||"");}).map(function(t){var isBuy=(parseFloat(t.shares)||0)>=0;
                  /* Per-row gain/loss: (current price / unit price) - 1.
                     curPrice is the price of whichever of the company's
                     tickers is held in this transaction's portfolio
                     (e.g. ANCTF for a portfolio holding the USD ADR,
                     ATD-CA for a portfolio holding the Canadian ord). */
                  var curPrice=getCurrentPriceForTx(t);
                  var rowTk=getTickerForTx(t);
                  var rowTkLabel=rowTk?(rowTk.ticker||"").toUpperCase():"";
                  var unitPrice=parseFloat(t.price);
                  var gainPct=(curPrice&&isFinite(unitPrice)&&unitPrice>0)?(curPrice/unitPrice-1)*100:null;
                  var glColor=gainPct===null?undefined:gainPct>0?"#166534":gainPct<0?"#991b1b":"#64748b";
                  var glText=gainPct===null?"--":(gainPct>=0?"+":"")+gainPct.toFixed(1)+"%";
                  return(<div key={t.id} style={{display:"table-row"}}>
                  <div className="align-middle pr-2 py-1 text-xs text-gray-700 dark:text-slate-300 font-mono" style={{display:"table-cell"}}>{t.date||"--"}</div>
                  <div className="align-middle pr-2 py-1" style={{display:"table-cell"}}>{t.portfolio?<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-medium">{t.portfolio}</span>:<span className="text-xs text-gray-400 dark:text-slate-500">--</span>}</div>
                  <div className="align-middle pr-2 py-1" style={{display:"table-cell"}} title="Ticker inferred from this portfolio's rep holdings">{rowTkLabel?<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 font-mono font-semibold">{rowTkLabel}</span>:<span className="text-xs text-gray-400 dark:text-slate-500">--</span>}</div>
                  <div className="align-middle pr-2 py-1" style={{display:"table-cell"}}><span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{background:isBuy?"rgba(22,101,52,0.15)":"rgba(220,38,38,0.15)",color:isBuy?"#166534":"#991b1b"}}>{isBuy?"BUY":"SELL"}</span>{isBuy&&(function(){var active=isInitiationTx(selCo,t);return <span onClick={function(){var nv=active?false:true;setTxInitOverride(selCo.id,t.id,nv);setSelCo(function(prev){if(!prev||prev.id!==selCo.id)return prev;return Object.assign({},prev,{transactions:(prev.transactions||[]).map(function(x){if(x.id!==t.id)return x;return Object.assign({},x,{initOverride:nv});})});});}} className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold ml-1 cursor-pointer transition-colors" style={active?{background:"rgba(37,99,235,0.15)",color:"#1e40af"}:{background:"transparent",color:"#9ca3af",border:"1px dashed #9ca3af"}} title={active?"Click to unmark as initiation":"Click to mark as initiation"}>{active?"\u2605 INIT":"\u2606"}</span>;})()}{(function(){var active=!!t.cashFlow;return <span onClick={function(){var nv=!active;setTxCashFlow(selCo.id,t.id,nv);setSelCo(function(prev){if(!prev||prev.id!==selCo.id)return prev;return Object.assign({},prev,{transactions:(prev.transactions||[]).map(function(x){if(x.id!==t.id)return x;var n=Object.assign({},x);if(nv)n.cashFlow=true;else delete n.cashFlow;return n;})});});}} className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold ml-1 cursor-pointer transition-colors" style={active?{background:"rgba(217,119,6,0.18)",color:"#92400e"}:{background:"transparent",color:"#9ca3af",border:"1px dashed #9ca3af"}} title={active?"Click to unmark as a cash-flow-driven trade":"Click to mark this trade as due to a portfolio cash inflow or outflow"}>{active?"\u27F3 CF":"\u27F3"}</span>;})()}</div>
                  <div className="align-middle pr-2 py-1 text-xs text-gray-700 dark:text-slate-300" style={{display:"table-cell"}}>{Math.abs(parseFloat(t.shares)||0).toLocaleString()}</div>
                  {(function(){
                    var run = runningByTxId[t.id];
                    var mm = mismatchByPort[t.portfolio];
                    var isLastForPort = run !== undefined && lastRunByPort[t.portfolio] === run;
                    /* Negative running = sold more than held (a missing
                       earlier buy). Mismatch on the LAST row for a
                       portfolio = total doesn't reconcile to rep
                       shares. Both flagged red. */
                    var bad = run < 0 || (isLastForPort && mm);
                    var color = bad ? "#dc2626" : (run < 0 ? "#dc2626" : "#374151");
                    var tip = bad
                      ? (run < 0
                          ? "Running goes negative — earlier buy(s) missing"
                          : "Final total (" + lastRunByPort[t.portfolio].toLocaleString() + ") doesn't match rep shares (" + mm.actual.toLocaleString() + ") — trades missing or stale")
                      : "Cumulative shares in " + (t.portfolio||"?") + " after this trade";
                    return (
                      <div className="align-middle pr-2 py-1 text-xs tabular-nums" style={{display:"table-cell",color:color,fontWeight:bad?700:400}} title={tip}>
                        {run === undefined ? "--" : run.toLocaleString()}
                        {bad && <span className="ml-1">⚠</span>}
                      </div>
                    );
                  })()}
                  <div className="align-middle pr-2 py-1 text-xs text-gray-700 dark:text-slate-300" style={{display:"table-cell"}}>{t.price?ccyPrefix(rowTk&&rowTk.currency)+fmtPrice(t.price):"--"}</div>
                  <div className="align-middle pr-2 py-1 text-xs font-semibold tabular-nums" style={{display:"table-cell",color:glColor}} title={curPrice?"Current price "+fmtPrice(curPrice)+" / unit "+(t.price?fmtPrice(t.price):"--"):"No current price available"}>{glText}</div>
                  <div className="align-middle pr-2 py-1 text-xs text-gray-700 dark:text-slate-300" style={{display:"table-cell"}}>{t.amount?ccyPrefix(rowTk&&rowTk.currency)+parseFloat(t.amount).toLocaleString(undefined,{maximumFractionDigits:2}):"--"}</div>
                  <div className="align-middle pr-2 py-1" style={{display:"table-cell"}}><span onClick={function(){deleteTransaction(selCo.id,t.id);setSelCo(function(prev){if(!prev||prev.id!==selCo.id)return prev;return Object.assign({},prev,{transactions:(prev.transactions||[]).filter(function(x){return x.id!==t.id;})});});}} className="text-[11px] text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700">{"\u00D7"}</span></div>
                </div>);})}
              </div>);})()
              :(<div className="text-xs text-gray-400 dark:text-slate-500 italic">No transactions logged.</div>)}
            </div>)}
          </div>)}
          {coView==="template"&&(<div>
            {Object.keys(selCo.sections||{}).length===0?(
              <div className={CARD} style={{borderStyle:"dashed"}}>
                <div className="text-sm text-gray-500 dark:text-slate-400 mb-2">No template yet.</div>
                <textarea value={tmplRaw} onChange={function(e){setTmplRaw(e.target.value);}} placeholder="Paste company template here..." className={TA_BASE + " mb-2"} style={{minHeight:120}}/>
                <button onClick={importTemplate} disabled={tmplLoading||!tmplRaw.trim()} className={BTN_SM}>{tmplLoading?"Importing...":"Import template"}</button>
              </div>
            ):(
              <div>
                <div className="flex gap-2 items-center mb-2.5 flex-wrap">
                  <input value={tmplSearch} onChange={function(e){setTmplSearch(e.target.value);setTmplHighlight(e.target.value);}} placeholder="Search within template..." className={INP + " flex-1 !text-xs !px-2 !py-1"}/>
                  {tmplSearch&&<span onClick={function(){setTmplSearch("");setTmplHighlight("");}} className={LNK}>Clear</span>}
                  <span className="text-xs text-gray-500 dark:text-slate-400">{selCo.lastUpdated?"Updated: "+selCo.lastUpdated:""}</span> <button onClick={function(){exportCompanyPDF(selCo);}} className={BTN}>{"\u2B07"} PDF</button>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={async function(){
                      if(await confirm("Clear all sections and re-import? This will remove all template content.",{danger:true,okLabel:"Clear"})){
                        var u=Object.assign({},selCo,{sections:{},lastUpdated:null});
                        setSelCo(u);
                        setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});
                        setTmplRaw("");
                        setCoView("section:Valuation");
                      }
                    }}
                    onKeyDown={function(e){ if(e.key==="Enter"||e.key===" "){e.preventDefault();e.currentTarget.click();} }}
                    className={LNK + " text-red-600 dark:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-400 rounded"}
                  >{"\u21BA"} Clear &amp; re-import</span>
                  <span onClick={function(){downloadMD(selCo.name,TEMPLATE_SECTIONS.map(function(s){return"## "+s+"\n"+((selCo.sections&&selCo.sections[s])||"");}).join("\n\n"));}} className={LNK}>{"\u2B07"} .md</span>
                </div>
                <details className="mb-3">
                  <summary className="text-xs text-gray-500 dark:text-slate-400 cursor-pointer mb-1.5">{"\u2191"} Paste more content to fill missing sections</summary>
                  <textarea value={tmplRaw} onChange={function(e){setTmplRaw(e.target.value);}} placeholder="Paste additional content — only fills empty sections..." className={TA_BASE + " mb-2"} style={{minHeight:80}}/>
                  <button onClick={importTemplate} disabled={tmplLoading||!tmplRaw.trim()} className={BTN_SM}>{tmplLoading?"Importing...":"Import"}</button>
                </details>
                {TEMPLATE_SECTIONS.map(function(s){return <SectionBlock key={s} title={s} content={selCo.sections&&selCo.sections[s]} highlight={tmplHighlight} flashKey={flashSections[s]}/>;  })}
                {/* Most-recent earnings entry as a read-only block at
                    the bottom of the Template view. The PDF export
                    already includes the six-word takeaway here; the
                    on-screen Template view was missing the full
                    context (thesis status, TP change, extended
                    takeaway, bullets) — useful when reviewing a
                    company since the rest of the template doesn't
                    auto-update with quarterly results. */}
                {(function(){
                  var last = getLastReportedEntry(selCo.earningsEntries);
                  if (!last) return null;
                  var bullets = (last.bullets || []).filter(function(b){return b && b.trim();});
                  var tsCfg = last.thesisStatus
                    ? ({ "On track": { bg: "#dcfce7", color: "#166534" },
                         "Watch":    { bg: "#fef9c3", color: "#854d0e" },
                         "Broken":   { bg: "#fee2e2", color: "#991b1b" } })[last.thesisStatus]
                      || { bg: "#f1f5f9", color: "#475569" }
                    : null;
                  var tpCfg = last.tpChange === "Increased"
                    ? { bg: "#dcfce7", color: "#166534", txt: "TP Increased" + (last.newTP ? " → " + activeCurrency + " " + last.newTP : "") }
                    : last.tpChange === "Decreased"
                    ? { bg: "#fee2e2", color: "#991b1b", txt: "TP Decreased" + (last.newTP ? " → " + activeCurrency + " " + last.newTP : "") }
                    : last.tpChange === "Unchanged"
                    ? { bg: "#fef9c3", color: "#854d0e", txt: "TP Unchanged" + (last.newTP ? " → " + activeCurrency + " " + last.newTP : "") }
                    : null;
                  return (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 mt-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Most Recent Earnings</span>
                        {last.quarter && <span className="text-xs text-gray-500 dark:text-slate-400">{last.quarter}</span>}
                        {last.reportDate && <span className="text-xs text-gray-500 dark:text-slate-400">{fmtDateUS(last.reportDate)}</span>}
                        {tpCfg && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: tpCfg.bg, color: tpCfg.color }}>{tpCfg.txt}</span>
                        )}
                        {tsCfg && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: tsCfg.bg, color: tsCfg.color }}>{last.thesisStatus}</span>
                        )}
                      </div>
                      {last.shortTakeaway && (
                        <div className="text-sm italic text-gray-700 dark:text-slate-300 mb-2">"{last.shortTakeaway}"</div>
                      )}
                      {last.tpRationale && (
                        <div className="text-xs mb-2"><span className="text-gray-500 dark:text-slate-400">TP rationale: </span><span className="text-gray-700 dark:text-slate-200">{last.tpRationale}</span></div>
                      )}
                      {last.thesisNote && (
                        <div className="text-xs mb-2"><span className="text-gray-500 dark:text-slate-400">Thesis note: </span><span className="text-gray-700 dark:text-slate-200">{last.thesisNote}</span></div>
                      )}
                      {bullets.length > 0 && (
                        <ul className="text-xs text-gray-700 dark:text-slate-200 mb-2 pl-4 list-disc space-y-0.5">
                          {bullets.map(function(b, i){ return <li key={i}>{b}</li>; })}
                        </ul>
                      )}
                      {last.extendedTakeaway && (
                        <div className="text-xs text-gray-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">{last.extendedTakeaway}</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>)}

          {/* SECTION TABS */}
          {coView.startsWith("section:")&&(function(){
            var sectionName=coView.replace("section:","");var isValuation=sectionName==="Valuation";var isOverview=sectionName==="Overview";
            return(<div>
              {isOverview&&(<div className="mb-4"><div className={SECTION_LABEL}>Tickers & Prices</div><div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">Add all tickers for this security. Mark the ordinary share used for TP/MOS.</div>{(function(){var co=companies.find(function(c){return c.id===selCo.id;})||selCo;var tickers=co.tickers||(co.ticker?[{ticker:co.ticker,price:(co.valuation&&co.valuation.price)||"",currency:(co.valuation&&co.valuation.currency)||getCurrency(co.country),isOrdinary:true}]:[{ticker:"",price:"",currency:"",isOrdinary:true}]);return tickers.map(function(t,i){function updTicker(patch){var nt=tickers.slice();nt[i]=Object.assign({},nt[i],patch);var u=Object.assign({},selCo,{tickers:nt});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}return(<div key={i} className="flex gap-1.5 mb-1.5 items-center"><input value={t.ticker||""} onChange={function(e){updTicker({ticker:e.target.value.toUpperCase()});}} placeholder="Ticker" className={INP + " w-[90px] !text-xs !px-2 !py-1"}/><input value={t.price||""} onChange={function(e){updTicker({price:e.target.value.replace(/,/g,"")});}} placeholder="Price" className={INP + " w-[90px] !text-xs !px-2 !py-1"}/><select value={t.currency||""} onChange={function(e){updTicker({currency:e.target.value});}} className={INP + " !text-xs !px-2 !py-1"}><option value="">CCY</option>{ALL_CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}</select><label className="text-[11px] text-gray-500 dark:text-slate-400 flex items-center gap-1 cursor-pointer"><input type="radio" checked={!!t.isOrdinary} onChange={function(){var nt=tickers.map(function(x,j){return Object.assign({},x,{isOrdinary:j===i});});var newOrd=nt[i];var newVal=Object.assign({},selCo.valuation||{},{price:newOrd.price,currency:newOrd.currency||getCurrency(selCo.country)});var u=Object.assign({},selCo,{tickers:nt,valuation:newVal});setSelCo(u);setPendingVal(Object.assign({},newVal));setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}}/>Ordinary</label>{tickers.length>1&&<span onClick={function(){var nt=tickers.filter(function(_,j){return j!==i;});var u=Object.assign({},selCo,{tickers:nt});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} className="text-[11px] text-red-600 dark:text-red-400 cursor-pointer">{"\u00D7"}</span>}</div>);});})()}<button onClick={function(){var nt=(selCo.tickers||[]).concat([{ticker:"",price:"",currency:"",isOrdinary:false}]);var u=Object.assign({},selCo,{tickers:nt});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} className={BTN + " mt-1"}>+ Add ticker</button>
              {/* ADR ratio + implied ADR-converted TP.
                  Lives here on the Overview subtab — same place the
                  team manages tickers / prices. Entering the ratio
                  (e.g. 0.25 for Vinci, meaning 1 ADR = 0.25 ord
                  shares) automatically derives the ADR-side TP in USD
                  from the ord-side TP Fixed:
                    ADR TP USD = (ord_TP / fxRates[ord_ccy]) × ratio
                  Used both here (for review) and on the Portfolios
                  table TP column (which picks ADR TP for ADR-held
                  rows). The current-price ADR premium/discount pill
                  in the page header reads the same ratio. */}
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1">ADR conversion</div>
                {(function(){
                  var ratioStr = selCo.adrRatio != null ? String(selCo.adrRatio) : "";
                  var ordTpRaw = (tpFixed !== null && isFinite(tpFixed)) ? tpFixed : NaN;
                  var ratioNum = parseFloat(ratioStr);
                  var ordCcy = (activeCurrency || "USD").toUpperCase();
                  var fx = ordCcy === "USD" ? 1 : parseFloat((fxRates||{})[ordCcy]);
                  var adrTp = (isFinite(ordTpRaw) && isFinite(ratioNum) && ratioNum>0 && isFinite(fx) && fx>0)
                    ? (ordTpRaw / fx) * ratioNum : null;
                  return (
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <label className="text-gray-500 dark:text-slate-400">ADR ratio (ords per ADR):</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={ratioStr}
                        key={selCo.id + "-adr-ratio-" + ratioStr}
                        placeholder="e.g. 0.25"
                        onBlur={function(e){
                          var v = e.target.value.trim();
                          if (v === "") { updateCo(selCo.id, { adrRatio: null }); return; }
                          var n = parseFloat(v);
                          if (isFinite(n) && n > 0) updateCo(selCo.id, { adrRatio: n });
                        }}
                        className={INP + " w-24 !text-xs !px-2 !py-1"}
                        title="ords per ADR — e.g. 0.25 means 1 ADR represents 0.25 ord shares (Vinci VCISY)"
                      />
                      {isFinite(ratioNum) && ratioNum > 0 && (
                        <span className="text-gray-500 dark:text-slate-400">
                          · Implied ADR TP:&nbsp;
                          {adrTp !== null ? (
                            <span className="font-semibold text-gray-900 dark:text-slate-100" title={"= " + ordCcy + " " + (isFinite(ordTpRaw) ? ordTpRaw.toFixed(2) : "—") + " ÷ " + fx.toFixed(4) + " × " + ratioNum}>
                              ${adrTp.toFixed(2)}
                            </span>
                          ) : (
                            <span className="italic text-gray-400 dark:text-slate-500">
                              {!isFinite(ordTpRaw) ? "(set TP Fixed first)" : "(missing FX rate for " + ordCcy + ")"}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
              </div>)} {isValuation&&(<div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Target Price</div>
                  {selCo.sections&&selCo.sections["Valuation"]&&(!pv.pe||!pv.eps1)&&(
                    <button onClick={async function(){
                      try{var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,system:"Extract valuation data. Return ONLY valid JSON with keys: pe (number), eps1 (number), eps2 (number), fy1 (string), fy2 (string), fyMonth (string like Dec). If not found use null. No markdown.",messages:[{role:"user",content:[{type:"text",text:selCo.sections["Valuation"]}]}]})});var data=await res.json();if(data.error){alertFn("API error: "+(data.error.message||"Unknown"));return;}var raw=(data.content||[]).map(function(b){return b.text||"";}).join("").replace(/```json|```/g,"").trim();var parsed=JSON.parse(raw);var patch={};if(parsed.pe!=null)patch.pe=String(parsed.pe);if(parsed.eps1!=null)patch.eps1=String(parsed.eps1);if(parsed.eps2!=null)patch.eps2=String(parsed.eps2);if(parsed.fy1)patch.fy1=parsed.fy1;if(parsed.fy2)patch.fy2=parsed.fy2;if(parsed.fyMonth)patch.fyMonth=parsed.fyMonth;if(!pv.w1)patch.w1="50";if(!pv.w2)patch.w2="50";setPendingVal(function(prev){return Object.assign({},prev,patch);});}catch(e){alertFn("Failed: "+e.message);}
                    }} className={BTN}>{"\u2728"} Auto-fill from text</button>
                  )}
                </div>

                {/* 1. TP and MOS display — 2x2 grid: live (FactSet-driven) on
                      top row, fixed (snapshot EPS) on bottom row. */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="px-3 py-2 rounded-lg" style={{background:tp!==null?"#dcfce7":undefined,border:"1px solid "+(tp!==null?"#86efac":"#e2e8f0")}}>
                    <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">TP Live{impliedFYLabel(pv)?" ("+impliedFYLabel(pv)+")":""}</div>
                    <div className="text-[16px] font-bold leading-tight" style={{color:tp!==null?"#166534":undefined}}>{fmtTP(tp,activeCurrency)}</div>
                    {tp!==null&&<div className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">{pv.pe}\u00D7 \u00D7 {activeCurrency} {eps&&eps.toFixed?eps.toFixed(2):eps}</div>}
                    {/* EPS breakdown \u2014 what's blended into normEPS. Shows
                        the team where each Live FactSet number is
                        landing, no need to dig through the EPS Inputs
                        section below. Only renders when we have at
                        least one EPS leg and weights to attribute. */}
                    {(function(){
                      var e1 = parseFloat(pv.eps1), e2 = parseFloat(pv.eps2);
                      var w1 = parseFloat(pv.w1), w2 = parseFloat(pv.w2);
                      var parts = [];
                      if (isFinite(e1)) parts.push((pv.fy1 || "FY1") + ": " + activeCurrency + " " + e1.toFixed(2) + (isFinite(w1) ? " \u00D7 " + w1 + "%" : ""));
                      if (isFinite(e2)) parts.push((pv.fy2 || "FY2") + ": " + activeCurrency + " " + e2.toFixed(2) + (isFinite(w2) ? " \u00D7 " + w2 + "%" : ""));
                      if (!parts.length) return null;
                      return <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">{parts.join(" + ")}</div>;
                    })()}
                  </div>
                  <div className="px-3 py-2 rounded-lg" style={{background:mosStyle?mosStyle.bg:undefined,border:"1px solid "+(mosStyle?"transparent":"#e2e8f0")}}>
                    <div className="text-[10px] mb-0.5" style={{color:mosStyle?mosStyle.color:undefined}}>MOS Live</div>
                    <div className="text-[16px] font-bold leading-tight" style={{color:mosStyle?mosStyle.color:undefined}}>{mos!==null?fmtMOS(mos):"--"}</div>
                    {mos!==null&&pv.price&&<div className="text-[10px] mt-0.5" style={{color:mosStyle?mosStyle.color:undefined}}>Price: {activeCurrency} {fmtPrice(pv.price)}</div>}
                  </div>
                  {/* TP Fixed card. When a TP approval is pending we
                      surface ⏳ + the suggested-new TP under the current
                      TP Fixed value, so the reader sees both at a glance
                      without opening the Approvals modal. */}
                  <div className="px-3 py-2 rounded-lg" style={{background:tpFixed!==null?"#ecfdf5":undefined,border:"1px solid "+(tpFixed!==null?"#a7f3d0":"#e2e8f0")}}>
                    <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">TP Fixed {pv.tpFixedDate?"("+fmtDateUS(pv.tpFixedDate)+")":(pv.normEPSFixedDate?"("+fmtDateUS(pv.normEPSFixedDate)+")":"")}</div>
                    <div className="text-[16px] font-bold leading-tight" style={{color:tpFixed!==null?"#047857":undefined}}>{tpFixed!==null?fmtTP(tpFixed,activeCurrency):"--"}</div>
                    {/* Fixed PE × Fixed normEPS = TP Fixed. Same shape as
                        the TP Live tile so the eye reads "this is what
                        was locked in at the last approval." If the
                        per-leg Fixed EPS values aren't stored
                        (pre-approval-flow legacy rows), fall back to
                        the implied-EPS calc with an "implied" tag. */}
                    {(function(){
                      if (tpFixed === null) return null;
                      var peF = parseFloat(pv.peFixed);
                      var pe = isFinite(peF) && peF > 0 ? peF : parseFloat(pv.pe);
                      var e1F = parseFloat(pv.eps1Fixed), e2F = parseFloat(pv.eps2Fixed);
                      var w1F = parseFloat(pv.w1Fixed),   w2F = parseFloat(pv.w2Fixed);
                      var hasLeg = isFinite(e1F) || isFinite(e2F);
                      if (hasLeg) {
                        var parts = [];
                        if (isFinite(e1F)) parts.push((pv.fy1Fixed || pv.fy1 || "FY1") + ": " + activeCurrency + " " + e1F.toFixed(2) + (isFinite(w1F) ? " × " + w1F + "%" : ""));
                        if (isFinite(e2F)) parts.push((pv.fy2Fixed || pv.fy2 || "FY2") + ": " + activeCurrency + " " + e2F.toFixed(2) + (isFinite(w2F) ? " × " + w2F + "%" : ""));
                        /* Blended normEPS Fixed for the headline line. */
                        var blended = null;
                        if (isFinite(e1F) && isFinite(e2F) && isFinite(w1F) && isFinite(w2F)) {
                          blended = (e1F * w1F + e2F * w2F) / 100;
                        } else if (isFinite(e1F)) blended = e1F;
                        else if (isFinite(e2F)) blended = e2F;
                        return (
                          <>
                            {isFinite(pe) && blended !== null && (
                              <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">{pe}× × {activeCurrency} {blended.toFixed(2)}</div>
                            )}
                            <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">{parts.join(" + ")}</div>
                          </>
                        );
                      }
                      if (impliedNormEPSFixed !== null) {
                        return <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">implied EPS: {activeCurrency} {impliedNormEPSFixed.toFixed(2)}</div>;
                      }
                      return null;
                    })()}
                    {pendingTP !== null && (
                      <div className="text-[10px] mt-0.5 font-medium" style={{color:"#b45309"}} title={"Pending TP change submitted by " + (pendingApproval.suggestedBy || "teammate") + " on " + (pendingApproval.suggestedAt || "?")}>
                        ⏳ Pending: <span className="font-bold">{fmtTP(pendingTP, activeCurrency)}</span>
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2 rounded-lg" style={{background:mosFixedStyle?mosFixedStyle.bg:undefined,border:"1px solid "+(mosFixedStyle?"transparent":"#e2e8f0")}}>
                    <div className="text-[10px] mb-0.5" style={{color:mosFixedStyle?mosFixedStyle.color:undefined}}>MOS Fixed</div>
                    <div className="text-[16px] font-bold leading-tight" style={{color:mosFixedStyle?mosFixedStyle.color:undefined}}>{mosFixed!==null?fmtMOS(mosFixed):"--"}</div>
                    {mosFixed!==null&&pv.price&&<div className="text-[10px] mt-0.5" style={{color:mosFixedStyle?mosFixedStyle.color:undefined}}>Price: {activeCurrency} {fmtPrice(pv.price)}</div>}
                    {pendingMOSFixed !== null && (
                      <div className="text-[10px] mt-0.5 font-medium" style={{color:"#b45309"}} title="MOS implied by the pending TP at today's price">
                        ⏳ Pending: <span className="font-bold">{fmtMOS(pendingMOSFixed)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Suggest TP change — primary action for coworkers to
                    propose a new TP from the Valuation tab. Side-by-side
                    Fixed vs Live comparison + per-field "Use →" buttons
                    + editable proposal. Submits via submitTpApproval
                    which routes through the existing TP Approvals
                    panel for peer sign-off. */}
                <TpSuggestPanel
                  selCo={selCo}
                  pv={pv}
                  tpFixed={tpFixed}
                  activeCurrency={activeCurrency}
                />
                {false && (
                <div className="flex items-center gap-2 mb-4 flex-wrap text-xs">
                  <label className="text-gray-500 dark:text-slate-400">TP Fixed ({activeCurrency}):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pv.tpFixed||""}
                    onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{tpFixed:e.target.value,tpFixedDate:todayStr()});});}}
                    placeholder="e.g. 250.00"
                    className={INP + " w-28 !text-xs !px-2 !py-1"}
                  />
                  <button
                    type="button"
                    onClick={function(){
                      if(tp===null||isNaN(tp))return;
                      setPendingVal(function(p){return Object.assign({},p,{tpFixed:String(tp),tpFixedDate:todayStr()});});
                    }}
                    disabled={tp===null||isNaN(tp)}
                    className={BTN_SM + " disabled:opacity-50"}
                    title="Copy the current (live, FactSet-derived) TP into the Fixed field, stamped with today"
                  >
                    {"\u2193"} Snapshot current TP ({tp!==null?fmtTP(tp,activeCurrency):"--"})
                  </button>
                  {(pv.tpFixed||pv.normEPSFixed)&&(
                    <button
                      type="button"
                      onClick={function(){setPendingVal(function(p){var n=Object.assign({},p);delete n.tpFixed;delete n.tpFixedDate;delete n.normEPSFixed;delete n.normEPSFixedDate;return n;});}}
                      className={LNK}
                    >Clear</button>
                  )}
                  <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">Fixed until updated — FactSet estimate changes won't affect it.</span>
                </div>
                )}
 {/* 5-year P/E range visual — shows low/median/avg/high endpoints with a
                    marker at the current FPE. Rendered only when we have enough to place it. */}
                 {(function(){
                    var lo=parseFloat(pv.peLow5),hi=parseFloat(pv.peHigh5);
                    var med=parseFloat(pv.peMed5),avg=parseFloat(pv.peAvg5);
                    var cur=parseFloat(pv.peCurrent);
                    if(isNaN(lo)||isNaN(hi)||hi<=lo)return null;
                    /* extend range a touch if current sits outside low-high */
                    var lowB=lo, highB=hi;
                    if(!isNaN(cur)){if(cur<lowB)lowB=cur;if(cur>highB)highB=cur;}
                    var pad=(highB-lowB)*0.08;
                    var xMin=lowB-pad, xMax=highB+pad;
                    function pct(v){return ((v-xMin)/(xMax-xMin))*100;}
                    var curOutside=!isNaN(cur)&&(cur<lo||cur>hi);
                    return (
                      <div className="mb-3 px-2 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-2 uppercase tracking-wide">5-Year P/E Range</div>
                        <div className="relative h-10">
                          {/* bar */}
                          <div className="absolute top-4 h-2 rounded-full bg-gradient-to-r from-green-300 via-yellow-300 to-red-300 dark:from-green-800 dark:via-yellow-700 dark:to-red-800" style={{left:pct(lo)+"%", width:(pct(hi)-pct(lo))+"%"}}/>
                          {/* low label */}
                          <div className="absolute top-[26px] text-[10px] text-gray-600 dark:text-slate-300 font-medium -translate-x-1/2 whitespace-nowrap" style={{left:pct(lo)+"%"}}>{lo.toFixed(1)}×</div>
                          <div className="absolute top-0 text-[9px] text-gray-500 dark:text-slate-400 -translate-x-1/2" style={{left:pct(lo)+"%"}}>Low</div>
                          {/* high label */}
                          <div className="absolute top-[26px] text-[10px] text-gray-600 dark:text-slate-300 font-medium -translate-x-1/2 whitespace-nowrap" style={{left:pct(hi)+"%"}}>{hi.toFixed(1)}×</div>
                          <div className="absolute top-0 text-[9px] text-gray-500 dark:text-slate-400 -translate-x-1/2" style={{left:pct(hi)+"%"}}>High</div>
                          {/* median tick */}
                          {!isNaN(med)&&(
                            <>
                              <div className="absolute top-3 w-[2px] h-4 bg-slate-600 dark:bg-slate-300" style={{left:"calc("+pct(med)+"% - 1px)"}}/>
                              <div className="absolute top-[26px] text-[10px] text-gray-600 dark:text-slate-300 -translate-x-1/2 whitespace-nowrap" style={{left:pct(med)+"%"}}>{med.toFixed(1)}×</div>
                              <div className="absolute top-0 text-[9px] text-gray-500 dark:text-slate-400 -translate-x-1/2" style={{left:pct(med)+"%"}}>Med</div>
                            </>
                          )}
                          {/* avg tick (only if different from median) */}
                          {!isNaN(avg)&&(isNaN(med)||Math.abs(avg-med)>0.05)&&(
                            <>
                              <div className="absolute top-3 w-[2px] h-4 bg-slate-400 dark:bg-slate-500" style={{left:"calc("+pct(avg)+"% - 1px)"}}/>
                              <div className="absolute top-[26px] text-[10px] text-gray-500 dark:text-slate-400 -translate-x-1/2 whitespace-nowrap" style={{left:pct(avg)+"%"}}>{avg.toFixed(1)}×</div>
                              <div className="absolute top-0 text-[9px] text-gray-400 dark:text-slate-500 -translate-x-1/2" style={{left:pct(avg)+"%"}}>Avg</div>
                            </>
                          )}
                          {/* current marker */}
                          {!isNaN(cur)&&(
                            <>
                              <div className="absolute top-[10px] w-3 h-3 rounded-full border-2 border-white dark:border-slate-900" style={{left:"calc("+pct(cur)+"% - 6px)", background:curOutside?"#dc2626":"#1e40af"}} title={"Current FPE "+cur.toFixed(2)+"x"}/>
                              <div className="absolute -top-0.5 text-[10px] font-semibold -translate-x-1/2 whitespace-nowrap" style={{left:pct(cur)+"%", color:curOutside?"#dc2626":"#1e40af"}}>Current {cur.toFixed(1)}×</div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                 {(pv.peCurrent||pv.peLow5||pv.peHigh5||pv.peAvg5||pv.peMed5||true)&&<div className="flex gap-2 mb-4 flex-wrap">{[["Current",pv.peCurrent],["5Yr Low",pv.peLow5],["5Yr High",pv.peHigh5],["5Yr Avg",pv.peAvg5],["5Yr Median",pv.peMed5]].map(function(item){return item[1]?(<div key={item[0]} className="px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-[80px]"><div className="text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">{item[0]} {item[0]==="Current"?"FPE":"P/E"}</div><div className="text-base font-semibold text-gray-900 dark:text-slate-100">{(function(){var n=parseFloat(item[1]);return isNaN(n)?item[1]:n.toFixed(1);})()}x</div></div>):null;})}</div>}
                {/* Price / P/E inputs removed — both are already shown
                    in the TP Live and TP Fixed cards above, and the
                    Suggest TP Change panel is the right place to
                    propose changes. FY-end month + Reporting Currency
                    surfaced as a compact inline row instead (below)
                    so they're still configurable when needed. */}
                <div className="flex items-center gap-3 flex-wrap text-xs mb-3">
                  <span className="text-gray-500 dark:text-slate-400">FY End:</span>
                  <select
                    value={pv.fyMonth||""}
                    onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{fyMonth:e.target.value});});commitValuation(selCo,Object.assign({},pv,{fyMonth:e.target.value}));}}
                    className={INP + " !text-xs !px-2 !py-0.5 w-20"}
                  >
                    <option value="">--</option>
                    {MONTHS.map(function(m){return <option key={m}>{m}</option>;})}
                  </select>
                  <span className="text-gray-400 dark:text-slate-500">·</span>
                  <span className="text-gray-500 dark:text-slate-400">Reporting currency:</span>
                  <select
                    value={pv.currency||currency}
                    onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{currency:e.target.value});});commitValuation(selCo,Object.assign({},pv,{currency:e.target.value}));}}
                    className={INP + " !text-xs !px-2 !py-0.5 w-20"}
                  >
                    {ALL_CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}
                  </select>
                </div>

                {/* TP Live ↔ TP Fixed drift indicator. Surfaces when the
                    Live valuation (PE × blended Live EPS) has moved more
                    than 10% from the last-approved Fixed TP. That gap
                    means the team's blessed target is materially stale
                    relative to today's consensus — time to revisit.
                    Matches the spirit of the existing MOS-divergence
                    flag on the Companies and Portfolios tables; this
                    surface gives the same signal at the source where the
                    user actually edits assumptions. */}
                {(function(){
                  if(tp === null || tpFixed === null || !isFinite(tp) || !isFinite(tpFixed) || tpFixed <= 0) return null;
                  var driftPct = (tp - tpFixed) / tpFixed * 100;
                  if(Math.abs(driftPct) < 10) return null;
                  var driftUp = driftPct > 0;
                  return (
                    <div
                      className="mb-3 px-3 py-2 rounded-md text-xs border flex items-center gap-2"
                      style={{
                        background: driftUp ? "#fef3c7" : "#fee2e2",
                        borderColor: driftUp ? "#fcd34d" : "#fca5a5",
                        color: driftUp ? "#854d0e" : "#991b1b",
                      }}
                      title="Live valuation has drifted >10% from the last-approved Fixed TP. Consider submitting a TP change."
                    >
                      <span>⚠</span>
                      <span>
                        <span className="font-semibold">TP drift {driftUp ? "+" : ""}{driftPct.toFixed(1)}%</span>
                        <span className="ml-2 opacity-80">— TP Live ({activeCurrency} {fmtPrice(tp)}) has moved from TP Fixed ({activeCurrency} {fmtPrice(tpFixed)}). Consider a TP review.</span>
                      </span>
                    </div>
                  );
                })()}
                {/* 3. EPS Inputs.
                    Two columns of values per fiscal year now:
                    - LIVE: editable, refreshed daily by the Estimates
                      Import. These drive TP Live (recomputed every day).
                    - FIXED: snapshot of what was approved with the last
                      TP change. Read-only (only written by approval) so
                      the team always knows what the "official" EPS
                      assumption is and the next TP proposal's "Previous"
                      row can pre-fill from it. The whole block is
                      gated off here — the cards above + Suggest TP
                      Change panel now cover this surface. Left in code
                      for reference in case the team needs a direct
                      editor back later. */}
                {false && (
                <div className={CARD + " mb-3"}>
                  <div className={SECTION_LABEL}>EPS Inputs</div>
                  <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-2 italic">
                    <span className="font-semibold text-gray-700 dark:text-slate-300">Live</span> values update daily from the Estimates import and drive TP Live.&nbsp;
                    <span className="font-semibold text-gray-700 dark:text-slate-300">Fixed</span> values are snapshotted at the moment of TP approval — they're what TP Fixed (and the next "Previous" approval row) are based on.
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    {[{fy:"fy1",eps:"eps1",w:"w1",fyF:"fy1Fixed",epsF:"eps1Fixed",wF:"w1Fixed",label:"Year 1"},{fy:"fy2",eps:"eps2",w:"w2",fyF:"fy2Fixed",epsF:"eps2Fixed",wF:"w2Fixed",label:"Year 2"}].map(function(item){
                      var fixedDateLabel = pv.tpFixedDate ? " · as of " + pv.tpFixedDate : "";
                      /* FY-end-month suffix on the Year 1 / Year 2 header.
                         Only shown when fyMonth is set and not "Dec" — most
                         US names default to December so adding "(Dec)"
                         would be visual noise everywhere. */
                      var fyMonthSuffix = (pv.fyMonth && pv.fyMonth !== "Dec") ? " (" + pv.fyMonth + ")" : "";
                      return (
                        <div key={item.fy} className="px-2.5 py-2.5 bg-slate-100 dark:bg-slate-800/50 rounded-md">
                          <div className="text-[11px] font-medium text-gray-900 dark:text-slate-100 mb-2">{item.label}{fyMonthSuffix}</div>
                          {/* Fiscal Year — single field, applies to both Live + Fixed */}
                          <div className="mb-1.5"><label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5">Fiscal Year</label><input value={pv[item.fy]||""} onChange={function(e){var p={};p[item.fy]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="e.g. FY2026E" className={INP + " w-full box-border !text-xs"}/></div>
                          {/* Live + Fixed pair, side by side. */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 block mb-0.5">EPS Live ({activeCurrency})</label>
                              <input type="number" step="0.01" value={pv[item.eps]||""} onChange={function(e){var p={};p[item.eps]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="e.g. 4.20" className={INP + " w-full box-border !text-xs"}/>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 block mb-0.5" title={"Locked at last TP approval" + fixedDateLabel}>EPS Fixed ({activeCurrency})</label>
                              <input type="number" step="0.01" value={pv[item.epsF]||""} onChange={function(e){var p={};p[item.epsF]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="—" className={INP + " w-full box-border !text-xs bg-emerald-50 dark:bg-emerald-950/30"}/>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 block mb-0.5">Weight Live %</label>
                              <input type="number" step="1" min="0" max="100" value={pv[item.w]||""} onChange={function(e){var p={};p[item.w]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="50" className={INP + " w-full box-border !text-xs"}/>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 block mb-0.5" title={"Locked at last TP approval" + fixedDateLabel}>Weight Fixed %</label>
                              <input type="number" step="1" min="0" max="100" value={pv[item.wF]||""} onChange={function(e){var p={};p[item.wF]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="—" className={INP + " w-full box-border !text-xs bg-emerald-50 dark:bg-emerald-950/30"}/>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Normalized EPS lines — Live and Fixed both shown so
                      the reader can see how much the underlying assumption
                      has drifted since the last approval. Each row extends
                      the math out to: normEPS × target PE = implied TP, so
                      the reader can see both sides of the equation and the
                      resulting target price in one place. Live uses Live
                      PE (pv.pe). Fixed uses Fixed PE (pv.peFixed) if set,
                      falls back to Live PE — the assumption being that PE
                      typically doesn't move between approvals, so a
                      missing peFixed shouldn't blank out the implied TP. */}
                  {normEPS!==null&&(function(){
                    var pe = parseFloat(pv.pe);
                    var impliedTP = isFinite(pe) && pe > 0 ? pe * normEPS : null;
                    return (
                      <div className="px-3 py-2 rounded-md text-xs mb-1.5" style={{background:"#dbeafe",color:"#1e40af"}}>
                        <span className="font-semibold">Normalized EPS Live: {activeCurrency} {normEPS.toFixed(4)}</span>
                        <span className="ml-2 opacity-70">= ({pv.eps1||"?"}x{pv.w1||"?"}% + {pv.eps2||"?"}x{pv.w2||"?"}%) / 100</span>
                        {impliedTP !== null && (
                          <span className="ml-2">
                            <span className="opacity-70">× {pe.toFixed(1)}× PE = </span>
                            <span className="font-semibold">Implied TP Live: {activeCurrency} {impliedTP.toFixed(2)}</span>
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {(function(){
                    var e1 = parseFloat(pv.eps1Fixed), e2 = parseFloat(pv.eps2Fixed);
                    var w1 = parseFloat(pv.w1Fixed),   w2 = parseFloat(pv.w2Fixed);
                    var fixed = null;
                    if(isFinite(e1) && isFinite(e2) && isFinite(w1) && isFinite(w2)){
                      fixed = (e1*w1 + e2*w2) / 100;
                    } else if(isFinite(e1) && !isFinite(e2)){ fixed = e1; }
                    else if(isFinite(e2) && !isFinite(e1)){ fixed = e2; }
                    if(fixed === null) return null;
                    /* Fixed PE preferred when set; falls back to Live PE
                       since multiples rarely move with each approval. */
                    var peFixedNum = parseFloat(pv.peFixed);
                    var peNum = parseFloat(pv.pe);
                    var peUsed = isFinite(peFixedNum) && peFixedNum > 0 ? peFixedNum
                                 : (isFinite(peNum) && peNum > 0 ? peNum : null);
                    var peSource = isFinite(peFixedNum) && peFixedNum > 0 ? "Fixed" : "Live";
                    var impliedTPFixed = peUsed !== null ? peUsed * fixed : null;
                    return (
                      <div className="px-3 py-2 rounded-md text-xs" style={{background:"#d1fae5",color:"#065f46"}}>
                        <span className="font-semibold">Normalized EPS Fixed: {activeCurrency} {fixed.toFixed(4)}</span>
                        <span className="ml-2 opacity-70">snapshot from last approval{pv.tpFixedDate?" ("+pv.tpFixedDate+")":""}</span>
                        {impliedTPFixed !== null && (
                          <span className="ml-2">
                            <span className="opacity-70">× {peUsed.toFixed(1)}× PE ({peSource}) = </span>
                            <span className="font-semibold">Implied TP Fixed: {activeCurrency} {impliedTPFixed.toFixed(2)}</span>
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                )}

                {/* Save valuation row removed — there's no editable
                    valuation form to save anymore. Live values come
                    from FactSet imports; Fixed values come from
                    approved TP suggestions; FY/Currency commit on
                    change inline. */}
                {false && (
                <div className="flex gap-2 mb-5">
                  <button onClick={function(){commitValuation(selCo,pv);}} className={BTN_PRIMARY}>Save valuation</button>
                  <button onClick={function(){setPendingVal(Object.assign({},selCo.valuation||{}));}} className={BTN}>Discard changes</button>
                </div>
                )}

                {/* 4. Fixed TP History.
                    Sorted by date descending so the most recent
                    approval sits at the top. The original-index map
                    (idxMap) is preserved so the per-row delete button
                    can splice the correct entry out of selCo.tpHistory
                    regardless of the displayed order. */}
                {(function(){
                  var hasHist = selCo.tpHistory && selCo.tpHistory.length > 0;
                  var pendingForCo = (tpApprovals || []).filter(function(a){
                    return a.companyId === selCo.id && a.status === "pending";
                  });
                  if (!hasHist && pendingForCo.length === 0) return null;
                  return (<div className="mb-5">
                  <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2.5">Fixed TP History</div>
                  <div style={{display:"table",width:"100%"}} className="text-xs">
                    <div style={{display:"table-row"}}>{["Date","Target Price","P/E","EPS","Fiscal Quarter",""].map(function(h){return <div key={h} className="text-[10px] uppercase text-gray-500 dark:text-slate-400 font-semibold" style={{display:"table-cell",padding:"4px 10px 8px 0"}}>{h}</div>;})}</div>
                    {/* Pending suggestion rows — surfaced ABOVE the
                        committed history so the team sees what's
                        awaiting approval right at the top. Each pending
                        carries a ⏳ marker; on approval the entry
                        disappears from this list and the new committed
                        row takes its place below. */}
                    {pendingForCo.map(function(rec){
                      var pTp = rec.toTP != null && isFinite(rec.toTP) ? parseFloat(rec.toTP) : null;
                      var pPe = rec.toPE != null && isFinite(rec.toPE) ? parseFloat(rec.toPE) : null;
                      var pEps = pTp !== null && pPe !== null && pPe > 0 ? pTp / pPe : null;
                      return (
                        <div key={"pending-"+rec.id} style={{display:"table-row",background:"rgba(251,191,36,0.10)"}}>
                          <div className="text-gray-700 dark:text-slate-200 font-mono" style={{display:"table-cell",padding:"6px 10px 6px 0"}}>
                            ⏳ <span title={"Suggested by " + (rec.suggestedBy || "?") + " on " + (rec.suggestedAt || "?")}>{fmtDateUS(rec.suggestedAt)}</span>
                          </div>
                          <div className="text-amber-800 dark:text-amber-300 font-semibold font-mono" style={{display:"table-cell",padding:"6px 10px 6px 0"}}>
                            {pTp !== null ? fmtTP(pTp, activeCurrency) : "—"}
                          </div>
                          <div className="text-gray-700 dark:text-slate-200 font-mono" style={{display:"table-cell",padding:"6px 10px 6px 0"}}>
                            {pPe !== null ? pPe.toFixed(1) + "×" : "—"}
                          </div>
                          <div className="text-gray-700 dark:text-slate-200 font-mono" style={{display:"table-cell",padding:"6px 10px 6px 0"}}>
                            {pEps !== null ? activeCurrency + " " + pEps.toFixed(2) : "—"}
                          </div>
                          <div className="text-gray-500 dark:text-slate-400 italic" style={{display:"table-cell",padding:"6px 10px 6px 0"}}>
                            pending approval
                          </div>
                          <div style={{display:"table-cell",padding:"6px 10px 6px 0"}}></div>
                        </div>
                      );
                    })}
                    {(function(){
                      var arr = (selCo.tpHistory||[]).map(function(h, originalIdx){ return { h: h, originalIdx: originalIdx }; });
                      arr.sort(function(a, b){ return (b.h.date || "").localeCompare(a.h.date || ""); });
                      return arr;
                    })().map(function(pair, displayIdx, displayArr){
                      var h = pair.h;
                      var originalIdx = pair.originalIdx;
                      var isLatest = displayIdx === 0;
                      /* % change vs the chronologically prior approval — that's
                         the NEXT row in the display array (since sorted desc).
                         Shown next to the current row's Target Price so each
                         row reads "this TP, this much higher/lower than the
                         previous." The oldest row (no prior to compare against)
                         shows nothing. */
                      var priorTPNum = null;
                      if(displayIdx + 1 < displayArr.length){
                        var priorH = displayArr[displayIdx + 1].h;
                        var pn = parseFloat(priorH && priorH.tp);
                        if(isFinite(pn) && pn > 0) priorTPNum = pn;
                      }
                      var thisTPNum = parseFloat(h.tp);
                      var tpPct = null;
                      if(isFinite(thisTPNum) && priorTPNum !== null && priorTPNum > 0){
                        tpPct = (thisTPNum - priorTPNum) / priorTPNum * 100;
                      }
                      /* EPS shown in the table = the normalized EPS that
                         ACTUALLY reconciles with PE × this = TP for this
                         row. We have three potential sources for the
                         breakdown, and we have to be smart about which
                         one to trust because they can disagree:
                           - row's own h.eps1/eps2/w1/w2 (the snapshot at
                             approval / save time)
                           - latest-row only: valuation.*Fixed (current
                             official Fixed snapshot, post any recent
                             manual edits)
                           - implied = h.tp / h.pe (the math that has to
                             hold by definition)
                         A breakdown is only "trustworthy" if it
                         reconciles with the row's TP (within ~2%). If
                         a stored breakdown produces a normEPS that's
                         materially off from h.tp / h.pe, it means the
                         stored values were captured at a different
                         vintage than the TP (e.g. FactSet had already
                         daily-updated v.eps1 by the time commitValuation
                         ran). In that case the implied calc wins. */
                      var rowPE = parseFloat(h.pe);
                      var rowTP = parseFloat(h.tp);
                      var impliedEps = (isFinite(rowTP) && isFinite(rowPE) && rowPE > 0) ? rowTP / rowPE : null;
                      function _reconciles(blend){
                        if(blend === null || impliedEps === null) return false;
                        return Math.abs(blend - impliedEps) / impliedEps < 0.02; /* 2% tolerance */
                      }
                      /* Try latest-row *Fixed first when applicable — it's
                         the most authoritative snapshot of the active
                         approval and gets updated when the user edits
                         the Fixed inputs on the Valuation card. */
                      var blendedEps = null;
                      var epsFormula = "";
                      var epsIsImplied = false;
                      if(isLatest){
                        var fv = selCo.valuation || {};
                        var fe1 = parseFloat(fv.eps1Fixed);
                        var fe2 = parseFloat(fv.eps2Fixed);
                        var fw1 = parseFloat(fv.w1Fixed);
                        var fw2 = parseFloat(fv.w2Fixed);
                        if(isFinite(fe1) && isFinite(fe2) && isFinite(fw1) && isFinite(fw2)){
                          var fixedBlend = (fe1*fw1 + fe2*fw2) / 100;
                          if(_reconciles(fixedBlend) || impliedEps === null){
                            blendedEps = fixedBlend;
                            epsFormula = "(" + fe1 + "×" + fw1 + "% + " + fe2 + "×" + fw2 + "%)";
                          }
                        }
                      }
                      /* Row's own breakdown — only used when it
                         RECONCILES with the row's TP and PE. A stored
                         breakdown that produces 3.69 when TP/PE implies
                         3.18 is stale data; prefer implied in that case
                         (see Row 2 in the screenshot — the stored
                         eps1=3.7415 / eps2=3.6417 came from
                         daily-updated Live values at the time the row
                         was created, not from the actual approved
                         breakdown). */
                      if(blendedEps === null){
                        var e1 = parseFloat(h.eps1), e2 = parseFloat(h.eps2);
                        var w1 = parseFloat(h.w1),   w2 = parseFloat(h.w2);
                        if(isFinite(e1) && isFinite(e2) && isFinite(w1) && isFinite(w2)){
                          var rowBlend = (e1*w1 + e2*w2) / 100;
                          if(_reconciles(rowBlend) || impliedEps === null){
                            blendedEps = rowBlend;
                            epsFormula = "(" + e1 + "×" + w1 + "% + " + e2 + "×" + w2 + "%)";
                          }
                        } else if(isFinite(e1) && (w1 === 100 || !isFinite(w2))){
                          if(_reconciles(e1) || impliedEps === null) blendedEps = e1;
                        } else if(isFinite(e2) && (w2 === 100 || !isFinite(w1))){
                          if(_reconciles(e2) || impliedEps === null) blendedEps = e2;
                        }
                      }
                      /* Implied fallback — by definition this always
                         reconciles. Used when no breakdown is present
                         OR when every available breakdown is stale. */
                      if(blendedEps === null && impliedEps !== null){
                        blendedEps = impliedEps;
                        epsIsImplied = true;
                      }
                      /* Final fallback: stored h.eps if everything else
                         is missing (should be rare). */
                      if(blendedEps === null && h.eps != null && isFinite(parseFloat(h.eps))){
                        blendedEps = parseFloat(h.eps);
                      }
                      /* Fiscal Quarter cell — the QUARTER of the earnings
                         entry that triggered the TP change (e.g. "Q1 FY26"),
                         not the EPS fiscal-year labels.
                         Resolution order:
                           1. h.quarter — snapshotted at approval time on
                              new entries.
                           2. earnings entry looked up by h.earningsEntryId,
                              then inferQuarter(reportDate, fyMonth).
                              Handles new entries where the snapshot label
                              was blank.
                           3. inferQuarter(h.date, fyMonth) — derives from
                              the approval's OWN date as a soft fallback
                              for legacy entries that have neither quarter
                              nor earningsEntryId stored. Less precise
                              (the approval date may sit a few weeks past
                              the actual earnings release) but usually
                              lands in the right quarter. */
                      var fqLabel = "--";
                      if(h.quarter){
                        fqLabel = h.quarter;
                      } else if(h.earningsEntryId){
                        var srcEntry = (selCo.earningsEntries||[]).find(function(eEnt){ return eEnt.id === h.earningsEntryId; });
                        if(srcEntry){
                          if(srcEntry.quarter){
                            fqLabel = srcEntry.quarter;
                          } else if(srcEntry.reportDate){
                            var inf = inferQuarter(srcEntry.reportDate, (selCo.valuation||{}).fyMonth || "Dec");
                            if(inf && inf.label) fqLabel = inf.label;
                          }
                        }
                      }
                      if(fqLabel === "--" && h.date){
                        var infFromDate = inferQuarter(h.date, (selCo.valuation||{}).fyMonth || "Dec");
                        if(infFromDate && infFromDate.label) fqLabel = infFromDate.label;
                      }
                      return (<div key={originalIdx} style={{display:"table-row"}}>
                        <div className="text-gray-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700" style={{display:"table-cell",padding:"7px 10px 7px 0"}}>{fmtDateUS(h.date)}</div>
                        <div className="border-t border-slate-200 dark:border-slate-700 font-semibold" style={{display:"table-cell",padding:"7px 10px 7px 0",color:isLatest?"#166534":undefined}}>
                          {fmtTP(h.tp,h.currency||activeCurrency)}
                          {tpPct !== null && (
                            <span
                              className="ml-2 text-[10px] font-medium"
                              style={{color: tpPct >= 0 ? "#16a34a" : "#dc2626"}}
                              title={"vs prior TP " + fmtTP(priorTPNum, h.currency||activeCurrency)}
                            >
                              ({tpPct >= 0 ? "+" : ""}{tpPct.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                        <div className="text-gray-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700" style={{display:"table-cell",padding:"7px 10px 7px 0"}}>{h.pe?h.pe+"x":"--"}</div>
                        {/* EPS cell \u2014 shows the BLENDED normEPS recomputed
                            from the row's eps1/eps2/w1/w2 so it always
                            reconciles with PE \u00D7 this = TP. When a full
                            breakdown is present, the (eps1\u00D7w1% + eps2\u00D7w2%)
                            formula is appended in a muted tag so the
                            reader sees where the blend came from. */}
                        <div className="text-gray-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700" style={{display:"table-cell",padding:"7px 10px 7px 0"}}>
                          {blendedEps !== null ? (h.currency||activeCurrency) + " " + blendedEps.toFixed(2) : "--"}
                          {epsFormula && (
                            <span className="ml-1 text-[10px] text-gray-400 dark:text-slate-500 font-mono">{epsFormula}</span>
                          )}
                          {epsIsImplied && (
                            <span className="ml-1 text-[10px] text-gray-400 dark:text-slate-500 italic" title="Implied from TP / PE — breakdown not stored on this row">implied</span>
                          )}
                        </div>
                        <div className="text-gray-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700" style={{display:"table-cell",padding:"7px 10px 7px 0"}}>{fqLabel}</div>
                        <div className="border-t border-slate-200 dark:border-slate-700" style={{display:"table-cell",padding:"7px 0 7px 0"}}><span onClick={function(){var u=Object.assign({},selCo,{tpHistory:selCo.tpHistory.filter(function(_,j){return j!==originalIdx;})});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} className="text-[11px] text-red-600 dark:text-red-400 cursor-pointer">{"\u00D7"}</span></div>
                      </div>);
                    })}
                  </div>
                </div>);
                })()}
              </div>)}
              {/* key={sectionName} forces a full remount on every
                  section switch — otherwise React reuses the same
                  SectionEditTab instance and its internal state
                  (textbox value, editing flag, bullets array) bleeds
                  across sections. Caused Overview edits to surface in
                  the Valuation textbox and vice versa. */}
              <SectionEditTab key={sectionName} title={sectionName} content={selCo.sections&&selCo.sections[sectionName]} onSave={function(newContent){var ns=Object.assign({},selCo.sections,{[sectionName]:newContent});var u=Object.assign({},selCo,{sections:ns,lastUpdated:todayStr()});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}}/>
            </div>);
          }())}

          {/* RATIOS TAB — per-company Ratio Analysis grid with inline
              sparkline charts. Data lives on selCo.ratios, uploaded
              per-company via paste. See RatiosTab.jsx for details. */}
          {coView==="ratios"&&<RatiosTab company={selCo}/>}

          {/* FINANCIALS TAB — per-company Income Statement + Balance Sheet
              + Cash Flow with 10y history + forward IS estimates.
              Data lives on selCo.financials (same shape as selCo.ratios),
              uploaded via Data Hub → Financials. */}
          {coView==="financials"&&<FinancialsTab company={selCo}/>}

          {/* DASHBOARD TAB — "story at a glance" overview: 4 charts
              (Growth, Margins, Returns, Valuation) derived from the
              uploaded financials + ratios + valuation data. */}
          {coView==="dashboard"&&<CompanyDashboard company={selCo}/>}

          {/* SEGMENTS TAB — chart-first view of business segments and
              geography from a one-time uploaded template. */}
          {coView==="segments"&&<SegmentsTab company={selCo}/>}

          {/* E[EPS] REVISIONS TAB — monthly EPS estimate revisions
              charted as line trend + % change bar comparison. */}
          {coView==="epsrev"&&<EpsRevisionsTab company={selCo}/>}

          {/* GUIDANCE TAB — per-metric guidance evolution from FactSet
              Guidance History uploads. Replaces the old Guidance/KPIs
              freeform template section. */}
          {coView==="guidance"&&<GuidanceTab company={selCo}/>}

          {/* SNAPSHOT TAB (formerly Metrics) — chart-first quick-glance:
              trailing performance bars + current values vs 5Y history.
              Replaces the previous numbers-grid Metrics tab. */}
          {coView==="metrics"&&<SnapshotTab company={selCo}/>}

          {coView==="prices"&&<PricesTab company={selCo}/>}

          {/* EARNINGS & THESIS CHECK TAB */}
          {coView==="earnings"&&(<div className="print-target">
            <PreEarningsBrief company={selCo}/>
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Earnings & Thesis Check</div>
              <div className="flex gap-2 items-center">
                <button onClick={function(){ printPage("charts"); }}
                  className="text-xs px-2.5 py-1 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors no-print"
                  title="Print this view (portrait, multi-page)">🖨 Print</button>
                <button onClick={function(){
                  /* Pre-fill quarter + reportDate when we have the
                     context. Two prefill paths:
                       - reportDate: prefer guidance.nextReportDate (if
                         within 30 days of today), else today.
                       - quarter: if the soon-to-be-set reportDate is
                         within 90 days AFTER a closed FY in guidance
                         history, this is the FY-end report → "Q4 FYxx".
                         Otherwise derive Q1-Q4 from reportDate +
                         valuation.fyMonth. */
                  var entry = blankEarnings();
                  var nextRep = (selCo.guidance && selCo.guidance.nextReportDate) || null;
                  var today0 = new Date(); today0.setHours(0,0,0,0);
                  var prefillDate = todayStr();
                  if (nextRep) {
                    var nd = parseDate(nextRep);
                    if (nd && Math.abs(nd.getTime() - today0.getTime()) < 30 * 86400000) {
                      prefillDate = nextRep;
                    }
                  }
                  entry.reportDate = prefillDate;
                  var fyMonthRaw = (selCo.valuation && selCo.valuation.fyMonth) || "Dec";
                  var monthMap = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
                  var fyMonth = monthMap[String(fyMonthRaw).toLowerCase().slice(0,3)] || 12;
                  /* Try matching to a closed FY in guidance.history first. */
                  var matchedFy = null;
                  var hist = (selCo.guidance && selCo.guidance.history) || [];
                  hist.forEach(function(r){
                    if (!r.period) return;
                    var p = parseDate(r.period);
                    var t = parseDate(prefillDate);
                    if (!p || !t) return;
                    var diff = t.getTime() - p.getTime();
                    if (diff < 0 || diff > 90 * 86400000) return;
                    if (!matchedFy || diff < matchedFy.diff) matchedFy = { period: r.period, diff: diff };
                  });
                  if (matchedFy) {
                    var ym = /^(\d{4})/.exec(matchedFy.period);
                    if (ym) entry.quarter = "Q4 FY" + ym[1].slice(2);
                  } else {
                    /* Derive from reportDate (period reported = ~60 days before reportDate). */
                    var rd = parseDate(prefillDate);
                    if (rd) {
                      var per = new Date(rd.getTime() - 60 * 86400000);
                      var py = per.getFullYear();
                      var pm = per.getMonth() + 1;
                      var dist = (fyMonth - pm + 12) % 12;
                      var q = dist <= 2 ? 4 : dist <= 5 ? 3 : dist <= 8 ? 2 : 1;
                      var fy = pm > fyMonth ? py + 1 : py;
                      entry.quarter = "Q" + q + " FY" + String(fy).slice(2);
                    }
                  }
                  var u = Object.assign({}, selCo, { earningsEntries: [entry].concat(earningsEntries) });
                  setSelCo(u);
                  setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});
                }} className={BTN_SM}>+ Add earnings entry</button>
              </div>
            </div>
            {earningsEntries.length===0&&<p className="text-sm text-gray-500 dark:text-slate-400">No earnings entries yet. Click "+ Add earnings entry" to get started.</p>}
            {/* Sort newest first by reportDate (descending). Future-
                dated entries land at the top alongside past entries —
                so an upcoming Q3 sits above the Q1 that already
                reported. Entries with no reportDate keep their
                insertion order at the bottom. */}
            {earningsEntries.slice().sort(function(a,b){
              var ad = (a && a.reportDate) || "";
              var bd = (b && b.reportDate) || "";
              if (!ad && !bd) return 0;
              if (!ad) return 1;
              if (!bd) return -1;
              return bd.localeCompare(ad);
            }).map(function(entry){return(
              <div key={entry.id} id={"earnings-entry-"+entry.id} className="rounded-lg transition-shadow">
                <EarningsEntry entry={entry} currency={activeCurrency} valuation={selCo.valuation||{}}
                  company={selCo}
                  onSave={function(saved){saveEarningsEntry(selCo,saved);}}
                  onDelete={function(){deleteEarningsEntry(selCo,entry.id);}}
                />
              </div>
            );})}
          </div>)}

          {/* LINKED */}
          {coView==="linked"&&(<div>
            <div className="flex justify-between items-center mb-2.5"><div className="text-sm text-gray-500 dark:text-slate-400">{linkedEntries.length} linked entr{linkedEntries.length===1?"y":"ies"}</div><button onClick={function(){setLinkLibOpen(true);}} className={BTN}>+ Link entry</button></div>
            {linkLibOpen&&(<div className={CARD + " mb-2.5"}><div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Select a library entry to tag with "{selCo.name}":</div><div className="max-h-[240px] overflow-y-auto flex flex-col gap-1">{saved.filter(function(s){return!(s.tags||[]).includes(selCo.name);}).map(function(s){return(<div key={s.id} onClick={function(){updEntry(s.id,{tags:(s.tags||[]).concat([selCo.name])});setLinkLibOpen(false);}} className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 cursor-pointer text-xs text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"><span className="font-medium">{s.title}</span><span className="text-gray-500 dark:text-slate-400 ml-2">{fmtDateUS(s.date)}</span></div>);})}</div><span onClick={function(){setLinkLibOpen(false);}} className={LNK + " block mt-2"}>Cancel</span></div>)}
            {linkedEntries.length===0?<p className="text-sm text-gray-500 dark:text-slate-400">No library entries linked to {selCo.name}.</p>:linkedEntries.map(function(s){return(<div key={s.id} className={CARD + " cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"} onClick={function(){setTab("library");setExpanded(s.id);}}><div className="flex gap-2 items-center mb-1 flex-wrap"><span className="text-sm font-medium text-gray-900 dark:text-slate-100">{s.title}</span><span className={PILL_BASE}>{s.format}</span>{getConf(s.result)&&<span className="text-[11px] px-1.5 py-0.5 rounded-full border-none" style={{background:CONF_BG[getConf(s.result)],color:CONF_COLOR[getConf(s.result)]}}>{getConf(s.result)}</span>}<span className={PILL_BASE + " ml-auto"}>{fmtDateUS(s.date)}</span></div><p className="text-xs text-gray-500 dark:text-slate-400 m-0 leading-relaxed">{getCore(s.result)}</p></div>);})}
          </div>)}

          {/* UPLOAD */}
          {coView==="upload"&&(<div>
            <div className="mb-2.5"><label className={LABEL}>Research type</label><select value={upType} onChange={function(e){setUpType(e.target.value);}} className={INP}>{UPLOAD_TYPES.map(function(t){return <option key={t}>{t}</option>;})}</select></div>
            <textarea value={upText} onChange={function(e){setUpText(e.target.value);}} placeholder="Paste research content..." className={TA_BASE + " mb-2"} style={{minHeight:130}}/>
            <button onClick={processUpload} disabled={upLoading||!upText.trim()} className="w-full py-2.5 font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50">{upLoading?"Analyzing...":"Analyze and propose updates"}</button>
            {pendingDiff&&pendingMeta&&(<div className={CARD + " mt-3"}><div className="text-sm mb-2 text-gray-900 dark:text-slate-100" dangerouslySetInnerHTML={{__html:toHTML(pendingMeta.summary)}}/>{pendingDiff.length===0?<p className="text-sm text-gray-500 dark:text-slate-400">No changes needed.</p>:<DiffView diff={pendingDiff} onAccept={acceptDiff} onReject={function(){setPendingDiff(null);setPendingMeta(null);}}/>}</div>)}
          </div>)}

          {/* LOG */}
          {coView==="history"&&(<div>{(selCo.updateLog||[]).length===0?<p className="text-sm text-gray-500 dark:text-slate-400">No updates yet.</p>:(selCo.updateLog||[]).map(function(log,i){return(<div key={i} className={CARD}><div className="flex gap-2 items-center mb-1 flex-wrap"><span className={PILL_BASE}>{log.type}</span><span className="text-xs text-gray-500 dark:text-slate-400">{fmtDateUS(log.date)}</span><span className="text-xs text-gray-500 dark:text-slate-400 ml-auto">{log.changes.join(", ")}</span></div><p className="text-sm m-0 leading-relaxed text-gray-900 dark:text-slate-100">{log.summary}</p></div>);})}</div>)}

          </ErrorBoundary>
        </div>);
}
