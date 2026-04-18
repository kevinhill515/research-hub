import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { ANTHROPIC_KEY } from '../../api/index.js';
import {
  PORTFOLIOS, SECTOR_ORDER, COUNTRY_ORDER, TEMPLATE_SECTIONS, SECTION_SUBHEADINGS,
  TP_CHANGES, THESIS_STATUSES, UPLOAD_TYPES, MONTHS, ALL_CURRENCIES, CURRENCY_MAP,
  FLAG_STYLES, SECTOR_COLORS, COUNTRY_COLORS, CONF_BG, CONF_COLOR,
} from '../../constants/index.js';
import {
  calcNormEPS, calcTP, calcMOS, mosBg, fmtPrice, fmtTP, fmtMOS, fmtTime,
  getCurrency, countryStyle, sectorStyle, impliedFYLabel,
  todayStr, reviewedColor, daysSince, parseDate,
  getTiers, tierToStatus, tierBg, tierPillStyle,
  isInitiationTx, getInitiatedDate, monthsSince, blankEarnings,
  escHTML, getCore, getConf, toHTML, toMD,
} from '../../utils/index.js';
import { StatusPill, PortPicker, SectionBlock, DiffView, BarRow, PillEl, PriceAgeIndicator } from '../ui/index.js';
import { SectionEditTab, EarningsEntry, NotesCell, ActionCell, FlagCell, DatePicker } from '../forms/index.js';

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
    linkedEntries, setExpanded, setSaved,
  } = props;
  const {
    companies, repData, fxRates, specialWeights, annotations, dark, currentUser,
    addComment, deleteComment, entryComments, newCommentText, setNewCommentText,
    addTransaction, deleteTransaction, setTxInitOverride,
    updateTargetWeight, addTargetHistoryEntry, deleteTargetHistoryEntry, updateInitiatedDate,
    updateCo, cp, copied, setCopied,
  } = useCompanyContext();


        var currency=getCurrency(selCo.country);var pv=pendingVal||selCo.valuation||{};var activeCurrency=pv.currency||currency;
        var normEPS=calcNormEPS(pv);var eps=normEPS!==null?normEPS:parseFloat(pv.eps);
        var tp=calcTP(pv.pe,eps);var mos=calcMOS(tp,pv.price);var mosStyle=mosBg(mos);
        var hist=selCo.tpHistory||[];var portfolios=selCo.portfolios||[];var portWeights=selCo.portWeights||{};
        var earningsEntries=selCo.earningsEntries||[];
        return(<div>
          {/* Header */}
          <div className="flex items-center gap-2 mb-3.5 flex-wrap">
            <button onClick={function(){setSelCo(null);setPendingVal(null);if(selCoOrigin){setTab(selCoOrigin);setSelCoOrigin(null);}}} className={BTN}>{"\u2190"} Back</button>
            <span className="text-[15px] font-medium text-gray-900 dark:text-slate-100">{selCo.name}</span>
            {(selCo.tickers||[]).filter(function(t){return t.price;}).map(function(t){return <span key={t.ticker} className="text-xs px-2.5 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-gray-900 dark:text-slate-100">{t.ticker}: {t.currency||""} {fmtPrice(t.price)}</span>;})}
            {selCo.country&&(function(){var cs=countryStyle(selCo.country);return <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{background:cs.bg,color:cs.color}}>{selCo.country}</span>;}())}
            {selCo.sector&&(function(){var ss=sectorStyle(selCo.sector);return <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{background:ss.bg,color:ss.color}}>{selCo.sector}</span>;}())}
            {portfolios.map(function(p){return <span key={p} className="text-[11px] px-1.5 py-0.5 rounded-full font-medium text-white border-none" style={{background:"#1a5c2a"}}>{p}</span>;})}
            {selCo.status&&<StatusPill status={selCo.status}/>}
            {tp!==null&&<span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{background:"#dcfce7",color:"#166534"}}>TP: {fmtTP(tp,activeCurrency)}</span>}
            {mosStyle&&<span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{background:mosStyle.bg,color:mosStyle.color}}>MOS: {fmtMOS(mos)}</span>}
            {(function(){var coAnnotations=annotations.filter(function(a){return !a.resolved&&((a.scope==="company"&&a.companyId===selCo.id)||(a.scope==="row"&&a.companyId===selCo.id));});return <button onClick={function(){openDiscussions({scope:"company",companyId:selCo.id});}} className={BTN+" ml-auto"}>💬 Discuss{coAnnotations.length>0&&<span className="ml-1 text-[10px] px-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold">{coAnnotations.length}</span>}</button>;})()}
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mb-3.5 flex-wrap">
            {coTabs.map(function(t){return <button key={t.id} className={coView===t.id?TABSM_ACTIVE:TABSM_INACTIVE} onClick={function(){setCoView(t.id);}}>{t.label}</button>;})}
          </div>

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
                {selCo.portWeightHistory.slice().filter(function(h){return weightsFilter==="All"||h.portfolio===weightsFilter;}).sort(function(a,b){return(b.date||"").localeCompare(a.date||"");}).map(function(h){var delta=(parseFloat(h.newWeight)||0)-(parseFloat(h.oldWeight)||0);var color=delta>0?"#166534":delta<0?"#dc2626":"#6b7280";return(<div key={h.id} className="flex items-center gap-2 text-xs py-0.5"><span className="text-gray-500 dark:text-slate-400 font-mono">{h.date}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-medium">{h.portfolio}</span><span className="text-gray-700 dark:text-slate-300">{(parseFloat(h.oldWeight)||0).toFixed(1)}% → <span style={{color:color,fontWeight:600}}>{(parseFloat(h.newWeight)||0).toFixed(1)}%</span></span>{h.author&&<span className="text-[10px] text-gray-400 dark:text-slate-500">({h.author})</span>}<span onClick={function(){deleteTargetHistoryEntry(selCo.id,h.id);}} className="ml-auto text-[11px] text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700">{"\u00D7"}</span></div>);})}
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
                <button onClick={function(){if(!newTx.date||!newTx.portfolio||newTx.shares===""||isNaN(parseFloat(newTx.shares)))return;var shares=parseFloat(newTx.shares);var txId=(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+"-"+Math.random().toString(36).slice(2));var txRec={id:txId,date:newTx.date,portfolio:newTx.portfolio,shares:shares,price:parseFloat(newTx.price)||0,amount:parseFloat(newTx.amount)||0,type:shares>=0?"BUY":"SELL"};addTransaction(selCo.id,txRec);setSelCo(function(prev){if(!prev||prev.id!==selCo.id)return prev;var all=(prev.transactions||[]).concat([txRec]);all.sort(function(a,b){return(b.date||"").localeCompare(a.date||"");});return Object.assign({},prev,{transactions:all});});setNewTx({date:"",portfolio:"",shares:"",price:"",amount:""});setShowAddTx(false);}} disabled={!newTx.date||!newTx.portfolio||newTx.shares===""} className={BTN_SM}>Add</button>
              </div>)}
              {selCo.transactions&&selCo.transactions.length>0?(<div style={{display:"table",width:"100%",borderCollapse:"separate",borderSpacing:"0 2px"}}>
                <div style={{display:"table-row"}}>
                  {[["Date"],["Portfolio"],["Type"],["Shares"],["Unit Price"],["Amount"],[""]].map(function(h,i){return <div key={i} className="text-[10px] uppercase tracking-wide pb-1.5 pr-2 text-gray-500 dark:text-slate-400 font-semibold" style={{display:"table-cell"}}>{h[0]}</div>;})}
                </div>
                {selCo.transactions.slice().filter(function(t){return txFilter==="All"||t.portfolio===txFilter;}).sort(function(a,b){return(b.date||"").localeCompare(a.date||"");}).map(function(t){var isBuy=(parseFloat(t.shares)||0)>=0;return(<div key={t.id} style={{display:"table-row"}}>
                  <div className="align-middle pr-2 py-1 text-xs text-gray-700 dark:text-slate-300 font-mono" style={{display:"table-cell"}}>{t.date||"--"}</div>
                  <div className="align-middle pr-2 py-1" style={{display:"table-cell"}}>{t.portfolio?<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-medium">{t.portfolio}</span>:<span className="text-xs text-gray-400 dark:text-slate-500">--</span>}</div>
                  <div className="align-middle pr-2 py-1" style={{display:"table-cell"}}><span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{background:isBuy?"rgba(22,101,52,0.15)":"rgba(220,38,38,0.15)",color:isBuy?"#166534":"#991b1b"}}>{isBuy?"BUY":"SELL"}</span>{isBuy&&(function(){var active=isInitiationTx(selCo,t);return <span onClick={function(){var nv=active?false:true;setTxInitOverride(selCo.id,t.id,nv);setSelCo(function(prev){if(!prev||prev.id!==selCo.id)return prev;return Object.assign({},prev,{transactions:(prev.transactions||[]).map(function(x){if(x.id!==t.id)return x;return Object.assign({},x,{initOverride:nv});})});});}} className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold ml-1 cursor-pointer transition-colors" style={active?{background:"rgba(37,99,235,0.15)",color:"#1e40af"}:{background:"transparent",color:"#9ca3af",border:"1px dashed #9ca3af"}} title={active?"Click to unmark as initiation":"Click to mark as initiation"}>{active?"\u2605 INIT":"\u2606"}</span>;})()}</div>
                  <div className="align-middle pr-2 py-1 text-xs text-gray-700 dark:text-slate-300" style={{display:"table-cell"}}>{Math.abs(parseFloat(t.shares)||0).toLocaleString()}</div>
                  <div className="align-middle pr-2 py-1 text-xs text-gray-700 dark:text-slate-300" style={{display:"table-cell"}}>{t.price?fmtPrice(t.price):"--"}</div>
                  <div className="align-middle pr-2 py-1 text-xs text-gray-700 dark:text-slate-300" style={{display:"table-cell"}}>{t.amount?parseFloat(t.amount).toLocaleString(undefined,{maximumFractionDigits:2}):"--"}</div>
                  <div className="align-middle pr-2 py-1" style={{display:"table-cell"}}><span onClick={function(){deleteTransaction(selCo.id,t.id);setSelCo(function(prev){if(!prev||prev.id!==selCo.id)return prev;return Object.assign({},prev,{transactions:(prev.transactions||[]).filter(function(x){return x.id!==t.id;})});});}} className="text-[11px] text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700">{"\u00D7"}</span></div>
                </div>);})}
              </div>):(<div className="text-xs text-gray-400 dark:text-slate-500 italic">No transactions logged.</div>)}
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
                  <span onClick={function(){
                    if(window.confirm("Clear all sections and re-import?")){
                      var u=Object.assign({},selCo,{sections:{},lastUpdated:null});
                      setSelCo(u);
                      setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});
                      setTmplRaw("");
                      setCoView("section:Valuation");
                    }
                  }} className={LNK + " text-red-600 dark:text-red-400"}>{"\u21BA"} Clear &amp; re-import</span>
                  <span onClick={function(){downloadMD(selCo.name,TEMPLATE_SECTIONS.map(function(s){return"## "+s+"\n"+((selCo.sections&&selCo.sections[s])||"");}).join("\n\n"));}} className={LNK}>{"\u2B07"} .md</span>
                </div>
                <details className="mb-3">
                  <summary className="text-xs text-gray-500 dark:text-slate-400 cursor-pointer mb-1.5">{"\u2191"} Paste more content to fill missing sections</summary>
                  <textarea value={tmplRaw} onChange={function(e){setTmplRaw(e.target.value);}} placeholder="Paste additional content — only fills empty sections..." className={TA_BASE + " mb-2"} style={{minHeight:80}}/>
                  <button onClick={importTemplate} disabled={tmplLoading||!tmplRaw.trim()} className={BTN_SM}>{tmplLoading?"Importing...":"Import"}</button>
                </details>
                {TEMPLATE_SECTIONS.map(function(s){return <SectionBlock key={s} title={s} content={selCo.sections&&selCo.sections[s]} highlight={tmplHighlight} flashKey={flashSections[s]}/>;  })}
              </div>
            )}
          </div>)}

          {/* SECTION TABS */}
          {coView.startsWith("section:")&&(function(){
            var sectionName=coView.replace("section:","");var isValuation=sectionName==="Valuation";var isOverview=sectionName==="Overview";
            return(<div>
              {isOverview&&(<div className="mb-4"><div className={SECTION_LABEL}>Tickers & Prices</div><div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">Add all tickers for this security. Mark the ordinary share used for TP/MOS.</div>{(function(){var co=companies.find(function(c){return c.id===selCo.id;})||selCo;var tickers=co.tickers||(co.ticker?[{ticker:co.ticker,price:(co.valuation&&co.valuation.price)||"",currency:(co.valuation&&co.valuation.currency)||getCurrency(co.country),isOrdinary:true}]:[{ticker:"",price:"",currency:"",isOrdinary:true}]);return tickers.map(function(t,i){function updTicker(patch){var nt=tickers.slice();nt[i]=Object.assign({},nt[i],patch);var u=Object.assign({},selCo,{tickers:nt});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}return(<div key={i} className="flex gap-1.5 mb-1.5 items-center"><input value={t.ticker||""} onChange={function(e){updTicker({ticker:e.target.value.toUpperCase()});}} placeholder="Ticker" className={INP + " w-[90px] !text-xs !px-2 !py-1"}/><input value={t.price||""} onChange={function(e){updTicker({price:e.target.value.replace(/,/g,"")});}} placeholder="Price" className={INP + " w-[90px] !text-xs !px-2 !py-1"}/><select value={t.currency||""} onChange={function(e){updTicker({currency:e.target.value});}} className={INP + " !text-xs !px-2 !py-1"}><option value="">CCY</option>{ALL_CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}</select><label className="text-[11px] text-gray-500 dark:text-slate-400 flex items-center gap-1 cursor-pointer"><input type="radio" checked={!!t.isOrdinary} onChange={function(){var nt=tickers.map(function(x,j){return Object.assign({},x,{isOrdinary:j===i});});var newOrd=nt[i];var newVal=Object.assign({},selCo.valuation||{},{price:newOrd.price,currency:newOrd.currency||getCurrency(selCo.country)});var u=Object.assign({},selCo,{tickers:nt,valuation:newVal});setSelCo(u);setPendingVal(Object.assign({},newVal));setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}}/>Ordinary</label>{tickers.length>1&&<span onClick={function(){var nt=tickers.filter(function(_,j){return j!==i;});var u=Object.assign({},selCo,{tickers:nt});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} className="text-[11px] text-red-600 dark:text-red-400 cursor-pointer">{"\u00D7"}</span>}</div>);});})()}<button onClick={function(){var nt=(selCo.tickers||[]).concat([{ticker:"",price:"",currency:"",isOrdinary:false}]);var u=Object.assign({},selCo,{tickers:nt});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} className={BTN + " mt-1"}>+ Add ticker</button></div>)} {isValuation&&(<div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Target Price</div>
                  {selCo.sections&&selCo.sections["Valuation"]&&(!pv.pe||!pv.eps1)&&(
                    <button onClick={async function(){
                      try{var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,system:"Extract valuation data. Return ONLY valid JSON with keys: pe (number), eps1 (number), eps2 (number), fy1 (string), fy2 (string), fyMonth (string like Dec). If not found use null. No markdown.",messages:[{role:"user",content:[{type:"text",text:selCo.sections["Valuation"]}]}]})});var data=await res.json();if(data.error){alert("Error");return;}var raw=(data.content||[]).map(function(b){return b.text||"";}).join("").replace(/```json|```/g,"").trim();var parsed=JSON.parse(raw);var patch={};if(parsed.pe!=null)patch.pe=String(parsed.pe);if(parsed.eps1!=null)patch.eps1=String(parsed.eps1);if(parsed.eps2!=null)patch.eps2=String(parsed.eps2);if(parsed.fy1)patch.fy1=parsed.fy1;if(parsed.fy2)patch.fy2=parsed.fy2;if(parsed.fyMonth)patch.fyMonth=parsed.fyMonth;if(!pv.w1)patch.w1="50";if(!pv.w2)patch.w2="50";setPendingVal(function(prev){return Object.assign({},prev,patch);});}catch(e){alert("Failed: "+e.message);}
                    }} className={BTN}>{"\u2728"} Auto-fill from text</button>
                  )}
                </div>

                {/* 1. TP and MOS display */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="px-4 py-3.5 rounded-lg" style={{background:tp!==null?"#dcfce7":undefined,border:"1px solid "+(tp!==null?"#86efac":"#e2e8f0")}}>
                    <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-0.5">Target Price{impliedFYLabel(pv)?" ("+impliedFYLabel(pv)+")":""}</div>
                    <div className="text-[22px] font-bold" style={{color:tp!==null?"#166534":undefined}}>{fmtTP(tp,activeCurrency)}</div>
                    {tp!==null&&<div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{pv.pe}x {"\u00D7"} {activeCurrency} {eps&&eps.toFixed?eps.toFixed(4):eps}</div>}
                  </div>
                  <div className="px-4 py-3.5 rounded-lg" style={{background:mosStyle?mosStyle.bg:undefined,border:"1px solid "+(mosStyle?"transparent":"#e2e8f0")}}>
                    <div className="text-[11px] mb-0.5" style={{color:mosStyle?mosStyle.color:undefined}}>Margin of Safety</div>
                    <div className="text-[22px] font-bold" style={{color:mosStyle?mosStyle.color:undefined}}>{mos!==null?fmtMOS(mos):"--"}</div>
                    {mos!==null&&pv.price&&<div className="text-[11px] mt-0.5" style={{color:mosStyle?mosStyle.color:undefined}}>Price: {activeCurrency} {fmtPrice(pv.price)}</div>}
                  </div>
                </div>
 {(pv.peLow5||pv.peHigh5||pv.peAvg5||pv.peMed5||true)&&<div className="flex gap-2 mb-4 flex-wrap">{[["5Yr Low",pv.peLow5],["5Yr High",pv.peHigh5],["5Yr Avg",pv.peAvg5],["5Yr Median",pv.peMed5]].map(function(item){return item[1]?(<div key={item[0]} className="px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-[80px]"><div className="text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">{item[0]} P/E</div><div className="text-base font-semibold text-gray-900 dark:text-slate-100">{item[1]}x</div></div>):null;})}</div>}
                {/* 2. Price, P/E, currency, FY month */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 mb-4">
                  <div><label className={LABEL}>Current Price ({activeCurrency})</label><input type="number" step="0.01" value={pv.price||""} onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{price:e.target.value});});}} placeholder="e.g. 45.20" className={INP + " w-full box-border"}/></div>
                  <div><label className={LABEL}>Target P/E</label><input type="number" step="0.1" value={pv.pe||""} onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{pe:e.target.value});});}} placeholder="e.g. 18.5" className={INP + " w-full box-border"}/></div>
                  <div><label className={LABEL}>Fiscal Year End</label><select value={pv.fyMonth||""} onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{fyMonth:e.target.value});});}} className={INP + " w-full"}><option value="">-- Month</option>{MONTHS.map(function(m){return <option key={m}>{m}</option>;})}</select></div>
                  <div><label className={LABEL}>Reporting Currency</label><select value={pv.currency||currency} onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{currency:e.target.value});});}} className={INP + " w-full"}>{ALL_CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}</select></div>
                </div>

                {/* 3. EPS Inputs */}
                <div className={CARD + " mb-3"}>
                  <div className={SECTION_LABEL}>EPS Inputs</div>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    {[{fy:"fy1",eps:"eps1",w:"w1",label:"Year 1"},{fy:"fy2",eps:"eps2",w:"w2",label:"Year 2"}].map(function(item){return(
                      <div key={item.fy} className="px-2.5 py-2.5 bg-slate-100 dark:bg-slate-800/50 rounded-md">
                        <div className="text-[11px] font-medium text-gray-900 dark:text-slate-100 mb-2">{item.label}</div>
                        <div className="flex flex-col gap-1.5">
                          <div><label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5">Fiscal Year</label><input value={pv[item.fy]||""} onChange={function(e){var p={};p[item.fy]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="e.g. FY2026E" className={INP + " w-full box-border !text-xs"}/></div>
                          <div><label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5">EPS ({activeCurrency})</label><input type="number" step="0.01" value={pv[item.eps]||""} onChange={function(e){var p={};p[item.eps]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="e.g. 4.20" className={INP + " w-full box-border !text-xs"}/></div>
                          <div><label className="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5">Weight %</label><input type="number" step="1" min="0" max="100" value={pv[item.w]||""} onChange={function(e){var p={};p[item.w]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="50" className={INP + " w-full box-border !text-xs"}/></div>
                        </div>
                      </div>
                    );})}
                  </div>
                  {normEPS!==null&&<div className="px-3 py-2 rounded-md text-xs" style={{background:"#dbeafe",color:"#1e40af"}}><span className="font-semibold">Normalized EPS: {activeCurrency} {normEPS.toFixed(4)}</span><span className="ml-2 opacity-70">= ({pv.eps1||"?"}x{pv.w1||"?"}% + {pv.eps2||"?"}x{pv.w2||"?"}%) / 100</span></div>}
                </div>

                {/* Save */}
                <div className="flex gap-2 mb-5">
                  <button onClick={function(){commitValuation(selCo,pv);}} className={BTN_PRIMARY}>Save valuation</button>
                  <button onClick={function(){setPendingVal(Object.assign({},selCo.valuation||{}));}} className={BTN}>Discard changes</button>
                </div>

                {/* 4. TP History */}
                {selCo.tpHistory&&selCo.tpHistory.length>0&&(<div className="mb-5">
                  <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2.5">TP History</div>
                  <div style={{display:"table",width:"100%"}} className="text-xs">
                    <div style={{display:"table-row"}}>{["Date","Target Price","P/E","EPS","Years",""].map(function(h){return <div key={h} className="text-[10px] uppercase text-gray-500 dark:text-slate-400 font-semibold" style={{display:"table-cell",padding:"4px 10px 8px 0"}}>{h}</div>;})}</div>
                    {selCo.tpHistory.map(function(h,i){var isLatest=i===0;return(<div key={i} style={{display:"table-row"}}>
                      <div className="text-gray-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700" style={{display:"table-cell",padding:"7px 10px 7px 0"}}>{h.date}</div>
                      <div className="border-t border-slate-200 dark:border-slate-700 font-semibold" style={{display:"table-cell",padding:"7px 10px 7px 0",color:isLatest?"#166534":undefined}}>{fmtTP(h.tp,h.currency||activeCurrency)}</div>
                      <div className="text-gray-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700" style={{display:"table-cell",padding:"7px 10px 7px 0"}}>{h.pe?h.pe+"x":"--"}</div>
                      <div className="text-gray-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700" style={{display:"table-cell",padding:"7px 10px 7px 0"}}>{h.eps?(h.currency||activeCurrency)+" "+h.eps:"--"}</div>
                      <div className="text-gray-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700" style={{display:"table-cell",padding:"7px 10px 7px 0"}}>{h.fyLabel||h.forwardYear||"--"}</div>
                      <div className="border-t border-slate-200 dark:border-slate-700" style={{display:"table-cell",padding:"7px 0 7px 0"}}><span onClick={function(){var u=Object.assign({},selCo,{tpHistory:selCo.tpHistory.filter(function(_,j){return j!==i;})});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} className="text-[11px] text-red-600 dark:text-red-400 cursor-pointer">{"\u00D7"}</span></div>
                    </div>);})}
                  </div>
                </div>)}
              </div>)}
              <SectionEditTab title={sectionName} content={selCo.sections&&selCo.sections[sectionName]} onSave={function(newContent){var ns=Object.assign({},selCo.sections,{[sectionName]:newContent});var u=Object.assign({},selCo,{sections:ns,lastUpdated:todayStr()});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}}/>
            </div>);
          }())}

          {/* EARNINGS & THESIS CHECK TAB */}
          {coView==="earnings"&&(<div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Earnings & Thesis Check</div>
              <button onClick={function(){var e=blankEarnings();var u=Object.assign({},selCo,{earningsEntries:[e].concat(earningsEntries)});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} className={BTN_SM}>+ Add earnings entry</button>
            </div>
            {earningsEntries.length===0&&<p className="text-sm text-gray-500 dark:text-slate-400">No earnings entries yet. Click "+ Add earnings entry" to get started.</p>}
            {earningsEntries.map(function(entry){return(
              <EarningsEntry key={entry.id} entry={entry} currency={activeCurrency} valuation={selCo.valuation||{}}
                onSave={function(saved){saveEarningsEntry(selCo,saved);}}
                onDelete={function(){deleteEarningsEntry(selCo,entry.id);}}
              />
            );})}
          </div>)}

          {/* LINKED */}
          {coView==="linked"&&(<div>
            <div className="flex justify-between items-center mb-2.5"><div className="text-sm text-gray-500 dark:text-slate-400">{linkedEntries.length} linked entr{linkedEntries.length===1?"y":"ies"}</div><button onClick={function(){setLinkLibOpen(true);}} className={BTN}>+ Link entry</button></div>
            {linkLibOpen&&(<div className={CARD + " mb-2.5"}><div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Select a library entry to tag with "{selCo.name}":</div><div className="max-h-[240px] overflow-y-auto flex flex-col gap-1">{saved.filter(function(s){return!(s.tags||[]).includes(selCo.name);}).map(function(s){return(<div key={s.id} onClick={function(){updEntry(s.id,{tags:(s.tags||[]).concat([selCo.name])});setLinkLibOpen(false);}} className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 cursor-pointer text-xs text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"><span className="font-medium">{s.title}</span><span className="text-gray-500 dark:text-slate-400 ml-2">{s.date}</span></div>);})}</div><span onClick={function(){setLinkLibOpen(false);}} className={LNK + " block mt-2"}>Cancel</span></div>)}
            {linkedEntries.length===0?<p className="text-sm text-gray-500 dark:text-slate-400">No library entries linked to {selCo.name}.</p>:linkedEntries.map(function(s){return(<div key={s.id} className={CARD + " cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"} onClick={function(){setTab("library");setExpanded(s.id);}}><div className="flex gap-2 items-center mb-1 flex-wrap"><span className="text-sm font-medium text-gray-900 dark:text-slate-100">{s.title}</span><span className={PILL_BASE}>{s.format}</span>{getConf(s.result)&&<span className="text-[11px] px-1.5 py-0.5 rounded-full border-none" style={{background:CONF_BG[getConf(s.result)],color:CONF_COLOR[getConf(s.result)]}}>{getConf(s.result)}</span>}<span className={PILL_BASE + " ml-auto"}>{s.date}</span></div><p className="text-xs text-gray-500 dark:text-slate-400 m-0 leading-relaxed">{getCore(s.result)}</p></div>);})}
          </div>)}

          {/* UPLOAD */}
          {coView==="upload"&&(<div>
            <div className="mb-2.5"><label className={LABEL}>Research type</label><select value={upType} onChange={function(e){setUpType(e.target.value);}} className={INP}>{UPLOAD_TYPES.map(function(t){return <option key={t}>{t}</option>;})}</select></div>
            <textarea value={upText} onChange={function(e){setUpText(e.target.value);}} placeholder="Paste research content..." className={TA_BASE + " mb-2"} style={{minHeight:130}}/>
            <button onClick={processUpload} disabled={upLoading||!upText.trim()} className="w-full py-2.5 font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50">{upLoading?"Analyzing...":"Analyze and propose updates"}</button>
            {pendingDiff&&pendingMeta&&(<div className={CARD + " mt-3"}><div className="text-sm mb-2 text-gray-900 dark:text-slate-100" dangerouslySetInnerHTML={{__html:toHTML(pendingMeta.summary)}}/>{pendingDiff.length===0?<p className="text-sm text-gray-500 dark:text-slate-400">No changes needed.</p>:<DiffView diff={pendingDiff} onAccept={acceptDiff} onReject={function(){setPendingDiff(null);setPendingMeta(null);}}/>}</div>)}
          </div>)}

          {/* LOG */}
          {coView==="history"&&(<div>{(selCo.updateLog||[]).length===0?<p className="text-sm text-gray-500 dark:text-slate-400">No updates yet.</p>:(selCo.updateLog||[]).map(function(log,i){return(<div key={i} className={CARD}><div className="flex gap-2 items-center mb-1 flex-wrap"><span className={PILL_BASE}>{log.type}</span><span className="text-xs text-gray-500 dark:text-slate-400">{log.date}</span><span className="text-xs text-gray-500 dark:text-slate-400 ml-auto">{log.changes.join(", ")}</span></div><p className="text-sm m-0 leading-relaxed text-gray-900 dark:text-slate-100">{log.summary}</p></div>);})}</div>)}
        </div>);
}
