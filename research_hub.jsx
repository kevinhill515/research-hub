import { useState, useRef, useEffect } from "react";
import { PORTFOLIOS, TIER_ORDER, SECTOR_ORDER, COUNTRY_ORDER, SECTOR_COLORS, SECTOR_SHORT, COUNTRY_GROUPS, COUNTRY_COLORS, REGION_COLORS, REGION_GROUPS, STATUS_RANK, CURRENCY_MAP, ALL_CURRENCIES, MONTHS, CO_SORTS, FORMATS, TONES, LIB_SORTS, PRESET_TAGS, UPLOAD_TYPES, TEMPLATE_SECTIONS, SECTION_SUBHEADINGS, THESIS_STATUSES, TP_CHANGES, AVG_WPM, ALL_COLS, COMPACT_COLS, SHORTCUTS, CONF_BG, CONF_COLOR, ACTIONS, TEAM_MEMBERS, REP_ACCOUNTS, PORT_NAMES, FLAG_STYLES } from './src/constants/index.js';
import { shortSector, sectorStyle, countryStyle, getRegion, getTiers, getCurrency, calcNormEPS, calcTP, calcMOS, fmtPrice, fmtTP, fmtMOS, mosBg, impliedFYLabel, tierPillStyle, tierBg, fmtTime, getCore, getConf, escHTML, toHTML, toMD, simScore, downloadMD, detectCompanyTags, todayStr, parseDate, daysSince, reviewedColor, mkTheme, getStatusRank, getTierIndex, getCompanyMOS, blankEarnings, sortCos, synPrompt } from './src/utils/index.js';
import { supaGet, supaUpsert, ANTHROPIC_KEY, apiCall } from './src/api/index.js';
import { PriceAgeIndicator, BarRow, PillEl, PortPicker, SectionBlock, StatusPill, DiffView } from './src/components/ui/index.js';
import { SectionEditTab, EarningsEntry, NotesCell, ActionCell, FlagCell, DatePicker } from './src/components/forms/index.js';
import { GlobalSearch, TemplateSearch, QuickUploadModal } from './src/components/modals/index.js';
import { CoRow, OverlapMatrix } from './src/components/tables/index.js';
import { EarningsCalendar } from './src/components/calendar/index.js';
import { useCompanyContext } from './src/context/CompanyContext.jsx';
import { ErrorBoundary } from './src/components/ErrorBoundary.jsx';

/* Components extracted to src/components/ — see barrel index.js files in each subdirectory */
export default function App(){
  const { companies, setCompanies, saved, setSaved, ready, setReady, loadStatus, setLoadStatus, lastPriceUpdate, setLastPriceUpdate, entryComments, setEntryComments, newCommentText, setNewCommentText, repData, setRepData, fxRates, setFxRates, specialWeights, setSpecialWeights, currentUser, setCurrentUser, dark, setDark, authed, setAuthed, showUserPicker, setShowUserPicker, calLastUpdated, setCalLastUpdated, calLastUpdatedBy, setCalLastUpdatedBy, repLastUpdated, setRepLastUpdated, fxLastUpdated, setFxLastUpdated, copied, setCopied, loadFromStorage, addComment, deleteComment, updateCo, cp, T } = useCompanyContext();
  const INP={fontSize:13,padding:"6px 8px",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text};
  const CARD={background:T.bgSec,borderRadius:8,border:"1px solid "+T.border,padding:"12px 14px",marginBottom:8};
  const LNK={fontSize:12,color:T.textSec,cursor:"pointer"};
  function PILL(x){return Object.assign({fontSize:11,padding:"2px 7px",borderRadius:99,border:"1px solid "+T.border,color:T.textSec,background:T.bgTer},x||{});}
  function TABST(a){return{padding:"8px 14px",border:"1px solid",borderColor:a?T.borderSec:T.border,borderRadius:6,background:a?T.bgSec:"transparent",cursor:"pointer",fontSize:13,fontWeight:a?500:400,color:T.text};}
  function TABSM(a){return{padding:"5px 10px",border:"1px solid",borderColor:a?T.borderSec:T.border,borderRadius:6,background:a?T.bgSec:"transparent",cursor:"pointer",fontSize:12,fontWeight:a?500:400,color:T.text,whiteSpace:"nowrap"};}
  function TAGBTN(a){return{fontSize:11,padding:"2px 7px",borderRadius:99,border:"1px solid "+(a?T.borderSec:T.border),color:T.text,background:T.bgSec,cursor:"pointer",fontWeight:a?500:400};}
  function TA(h){return{width:"100%",minHeight:h||90,resize:"vertical",fontSize:13,padding:"8px 10px",boxSizing:"border-box",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text,fontFamily:"inherit",lineHeight:1.6};}

  const [tab,setTab]=useState("companies");
  const [selCo,setSelCo]=useState(null);
  const [coView,setCoView]=useState("template");
  const [coSort,setCoSort]=useState("Tier");
  const [coSortDir,setCoSortDir]=useState("asc");
  const [coFilter,setCoFilter]=useState("All");
  const [coStatusFilter,setCoStatusFilter]=useState("All");
  const [coFilterCountry,setCoFilterCountry]=useState("All");
  const [coFilterSector,setCoFilterSector]=useState("All");
  const [coSearch,setCoSearch]=useState("");
  const [selectedIds,setSelectedIds]=useState(new Set());
  const [bulkStatus,setBulkStatus]=useState("");
  const [bulkTier,setBulkTier]=useState("");
  const [visibleCols,setVisibleCols]=useState(new Set(ALL_COLS));
  const [showColPicker,setShowColPicker]=useState(false);
  const [confirmClear,setConfirmClear]=useState(false);
  const [showNew,setShowNew]=useState(false);
  const [showBulk,setShowBulk]=useState(false);
  const [showPriceImport,setShowPriceImport]=useState(false);
  const [priceImportText,setPriceImportText]=useState("");
  const [showRestore,setShowRestore]=useState(false);
  const [restoreText,setRestoreText]=useState("");
  const [newName,setNewName]=useState("");
  const [newTicker,setNewTicker]=useState("");
  const [newFields,setNewFields]=useState({portfolios:[],tier:"",sector:"",country:"",action:""});
  const [bulkText,setBulkText]=useState("");
  const [bulkLoading,setBulkLoading]=useState(false);
  const [bulkPreview,setBulkPreview]=useState(null);
  const [tmplRaw,setTmplRaw]=useState("");
  const [tmplLoading,setTmplLoading]=useState(false);
  const [tmplSearch,setTmplSearch]=useState("");
  const [tmplHighlight,setTmplHighlight]=useState("");
  const [flashSections,setFlashSections]=useState({});
  const [upText,setUpText]=useState("");
  const [upType,setUpType]=useState("Earnings Report");
  const [upLoading,setUpLoading]=useState(false);
  const [pendingDiff,setPendingDiff]=useState(null);
  const [pendingMeta,setPendingMeta]=useState(null);
  const [input,setInput]=useState("");
  const [sources,setSources]=useState([{label:"Source 1",text:""}]);
  const [useSrc,setUseSrc]=useState(false);
  const [format,setFormat]=useState("Key Takeaways");
  const [tone,setTone]=useState("Professional");
  const [custom,setCustom]=useState("");
  const [output,setOutput]=useState("");
  const [loading,setLoading]=useState(false);
  const [expanded,setExpanded]=useState(null);
  const [libSort,setLibSort]=useState("Pinned first");
  const [filterTag,setFilterTag]=useState("All");
  const [search,setSearch]=useState("");
  const [pendingTags,setPendingTags]=useState([]);
  const [recallQ,setRecallQ]=useState("");
  const [recall,setRecall]=useState("");
  const [recallLoading,setRecallLoading]=useState(false);
  const [recallSrcs,setRecallSrcs]=useState([]);
  const [recallHist,setRecallHist]=useState([]);
  const [suggestions,setSuggestions]=useState([]);
  const [cmpIds,setCmpIds]=useState([]);
  const [cmpOut,setCmpOut]=useState("");
  const [cmpLoading,setCmpLoading]=useState(false);
  const [fuQ,setFuQ]=useState("");
  const [fuA,setFuA]=useState("");
  const [fuLoading,setFuLoading]=useState(false);
  const [editId,setEditId]=useState(null);
  const [editTitle,setEditTitle]=useState("");
  const [editNote,setEditNote]=useState("");
  const [dupWarn,setDupWarn]=useState(false);
  const [macroOut,setMacroOut]=useState("");
  const [macroLoading,setMacroLoading]=useState(false);
  const [rsId,setRsId]=useState(null);
  const [rsFmt,setRsFmt]=useState("Key Takeaways");
  const [rsTone,setRsTone]=useState("Professional");
  const [rsOut,setRsOut]=useState("");
  const [rsLoading,setRsLoading]=useState(false);
  const [showDataPanel,setShowDataPanel]=useState(false);
  const [importText,setImportText]=useState("");
  const [importError,setImportError]=useState(""); const [dataHubTab,setDataHubTab]=useState("backup"); const [valImportText,setValImportText]=useState(""); const [estImportText,setEstImportText]=useState(""); const [weightsImportText,setWeightsImportText]=useState("");
  const [compact,setCompact]=useState(false);
  const [showDedupe,setShowDedupe]=useState(false);
  const [dupeGroups,setDupeGroups]=useState([]);
  const [dupeKeep,setDupeKeep]=useState({});
  const [dashPort,setDashPort]=useState("All");
  const [dashSubTab,setDashSubTab]=useState("overview");
  const [showShortcuts,setShowShortcuts]=useState(false);
  const [autoTagSuggestions,setAutoTagSuggestions]=useState([]);
  const [linkLibOpen,setLinkLibOpen]=useState(false);
  const [showTmplSearch,setShowTmplSearch]=useState(false); const [showGlobalSearch,setShowGlobalSearch]=useState(false);
const [quickUploadCo,setQuickUploadCo]=useState(null);
const [calImportText,setCalImportText]=useState(""); const [calFilter,setCalFilter]=useState("All"); const [repText,setRepText]=useState(""); const [portTab,setPortTab]=useState("GL"); const [portSort,setPortSort]=useState("rep"); const [fxText,setFxText]=useState(""); const [pendingVal,setPendingVal]=useState(null);
function applyFxImport(){if(!fxText.trim())return;var lines=fxText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var rates={};lines.forEach(function(line){var delim=line.indexOf("\t")>=0?"\t":",";var parts=line.split(delim).map(function(s){return s.trim();});if(parts.length>=2){var pair=parts[0].toUpperCase();var rate=parseFloat(parts[1]);if(!isNaN(rate))rates[pair]=rate;}});var extracted={};Object.entries(rates).forEach(function(e){var pair=e[0];var rate=e[1];if(pair.startsWith("USD")){var ccy=pair.slice(3);extracted[ccy]=rate;}else if(pair.endsWith("USD")){var ccy=pair.slice(0,3);if(rate!==0)extracted[ccy]=1/rate;}else{extracted[pair]=rate;}});setFxRates(extracted);setFxLastUpdated(currentUser+" "+todayStr());setFxText("");supaUpsert("meta",{key:"fxRates",value:JSON.stringify(extracted)});}
  function applyRepImport(){if(!repText.trim())return;var lines=repText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var data={};lines.forEach(function(line){var delim=line.indexOf("\t")>=0?"\t":",";var parts=line.split(delim).map(function(s){return s.trim();});if(parts.length>=3){var acct=parts[0].toUpperCase();var ticker=parts[1].toUpperCase();var shares=parseFloat(parts[2]);if(!isNaN(shares)){var port=REP_ACCOUNTS[acct];if(port){if(!data[port])data[port]={};data[port][ticker]=(data[port][ticker]||0)+shares;}}}});setRepData(data);setRepLastUpdated(currentUser+" "+todayStr());setRepText("");supaUpsert("meta",{key:"repData",value:JSON.stringify(data)});}
  function applyCalImport(){if(!calImportText||!calImportText.trim())return;var lines=calImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;setCompanies(function(prev){return prev.map(function(c){var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim();});var allTickers2=[(c.ticker||"")].concat((c.tickers||[]).map(function(t){return t.ticker||"";})).map(function(t){return t.toUpperCase();}).filter(Boolean);return allTickers2.indexOf(parts[0].toUpperCase())>=0;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var parts=match.split(delim).map(function(s){return s.trim();});var date=parts[1];if(!date)return c;var entries=(c.earningsEntries||[]).slice();var existing=entries.find(function(e){return e.reportDate===date;});if(!existing){entries.unshift(Object.assign(blankEarnings(),{reportDate:date,open:false}));}count++;return Object.assign({},c,{earningsEntries:entries});});});setTimeout(function(){alert("Updated earnings dates for "+count+" companies.");setCalImportText("");},100);supaUpsert("meta",{key:"calLastUpdated",value:currentUser+" at "+todayStr()});setCalLastUpdatedBy(currentUser);setCalLastUpdated(todayStr());}
function applyWeightsImport(){if(!weightsImportText.trim())return;var lines=weightsImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;var newSpecial={};lines.forEach(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var p=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var nm=p[0].toUpperCase();if(nm==="CASH"||nm==="DIVACC"){newSpecial[nm]={GL:p[1]||"",FGL:p[2]||"",IV:p[3]||"",FIV:p[4]||"",EM:p[5]||"",SC:p[6]||""};}});if(Object.keys(newSpecial).length>0){setSpecialWeights(function(prev){var updated=Object.assign({},prev,newSpecial);supaUpsert("meta",{key:"specialWeights",value:JSON.stringify(updated)});return updated;});}setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newWeights=Object.assign({},c.portWeights||{},{GL:p[1]||"",FGL:p[2]||"",IV:p[3]||"",FIV:p[4]||"",EM:p[5]||"",SC:p[6]||""});count++;return Object.assign({},c,{portWeights:newWeights});});});setTimeout(function(){alert("Updated weights for "+count+" companies.");setWeightsImportText("");},100);}
function applyValImport(){if(!valImportText.trim())return;var lines=valImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newVal=Object.assign({},c.valuation||{},{pe:p[1]||"",fyMonth:p[2]||"",currency:p[3]||"",fy1:p[4]||"",eps1:p[5]||"",w1:p[6]||"",fy2:p[7]||"",eps2:p[8]||"",w2:p[9]||""});count++;return Object.assign({},c,{valuation:newVal});});});setTimeout(function(){alert("Updated valuation for "+count+" companies.");setValImportText("");},100);}
function applyEstImport(){if(!estImportText.trim())return;var lines=estImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newVal=Object.assign({},c.valuation||{},{pe:p[1]||"",peLow5:p[2]||"",peHigh5:p[3]||"",peAvg5:p[4]||"",peMed5:p[5]||"",fyMonth:p[6]||"",currency:p[7]||"",fy1:p[8]||"",eps1:p[9]||"",w1:p[10]||"",fy2:p[11]||"",eps2:p[12]||"",w2:p[13]||""});count++;return Object.assign({},c,{valuation:newVal});});});setTimeout(function(){alert("Updated estimates for "+count+" companies.");setEstImportText("");},100);}
const searchRef=useRef();
  useEffect(function(){
    function onKey(e){
      var tag=document.activeElement.tagName;var typing=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
      if(e.key==="?"&&!typing){setShowShortcuts(function(s){return !s;});return;}
      if(e.key==="Escape"){setShowShortcuts(false);setSelCo(null);setShowNew(false);setShowBulk(false);setShowDataPanel(false);setLinkLibOpen(false);setShowTmplSearch(false);setQuickUploadCo(null);setShowGlobalSearch(false);setShowPriceImport(false);setPendingVal(null);return;}
      if(typing)return;
      if(e.key==="/"){e.preventDefault();setShowGlobalSearch(true);return;}
      if(e.key==="n"){setTab("companies");setShowNew(true);}
      if(e.key==="b"){setTab("companies");setShowBulk(true);}
      if(e.key==="d"){setTab("dashboard");setSelCo(null);}
      if(e.key==="c")setTab("companies");
      if(e.key==="s"){setTab("synthesize");setSelCo(null);}
      if(e.key==="l"){setTab("library");setSelCo(null);}
      if(e.key==="r"){setTab("recall");setSelCo(null);}
    }
    document.addEventListener("keydown",onKey);return function(){document.removeEventListener("keydown",onKey);};
  },[]);

  useEffect(function(){if(selCo){setPendingVal(Object.assign({},selCo.valuation||{}));}else{setPendingVal(null);}},[selCo&&selCo.id]);

  useEffect(function(){if(!output||!companies.length)return;setAutoTagSuggestions(detectCompanyTags(output,companies));},[output]);

  function exportToPDF(title,htmlContent){   var win=window.open("","_blank");   if(!win){alert("Please allow popups to export PDF.");return;}   win.document.write("<!DOCTYPE html><html><head><title>"+title+"</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 40px;color:#111;line-height:1.7;}h1{font-size:22px;border-bottom:2px solid #334155;padding-bottom:10px;margin-bottom:20px;}h2{font-size:16px;color:#1e40af;margin-top:28px;margin-bottom:8px;}p{font-size:14px;}.meta{font-size:12px;color:#6b7280;margin-bottom:20px;}</style></head><body>"+htmlContent+"</body></html>");   win.document.close();   setTimeout(function(){win.print();},500); } function exportCompanyPDF(co){   var html="<h1>"+co.name+(co.ticker?" ("+co.ticker+")":"")+"</h1><div class='meta'>";   if(co.sector)html+="Sector: "+co.sector+" | ";   if(co.country)html+="Country: "+co.country+" | ";   if(co.status)html+="Status: "+co.status;   html+="</div>";   var v=co.valuation||{};var ne=calcNormEPS(v)||parseFloat(v.eps);var tp=calcTP(v.pe,ne);var mos=calcMOS(tp,v.price);var cur=(v.currency)||getCurrency(co.country);   if(tp!==null||v.price){html+="<h2>Valuation</h2><p>";if(v.price)html+="Price: "+cur+" "+fmtPrice(v.price)+" &nbsp;";if(tp!==null)html+="TP: "+fmtTP(tp,cur)+" &nbsp;";if(mos!==null)html+="MOS: "+fmtMOS(mos);html+="</p>";}   TEMPLATE_SECTIONS.forEach(function(s){var c=co.sections&&co.sections[s];if(c&&c.trim()){html+="<h2>"+s+"</h2><p>"+c.replace(/\n/g,"<br/>")+"</p>";}});   if(co.earningsEntries&&co.earningsEntries.length){html+="<h2>Earnings History</h2>";co.earningsEntries.forEach(function(e){html+="<p><strong>"+e.quarter+"</strong> "+e.reportDate+"<br/>"+(e.shortTakeaway||"")+"</p>";});}   exportToPDF(co.name,html); } function exportEntryPDF(entry){   var html="<h1>"+entry.title+"</h1><div class='meta'>Format: "+entry.format+" | Date: "+entry.date+(entry.savedBy?" | Saved by: "+entry.savedBy:"")+"</div><div>"+toHTML(entry.result)+"</div>";   exportToPDF(entry.title,html); }
  function exportAll(){var txt=JSON.stringify({companies,library:saved,exportedAt:new Date().toISOString()},null,2);try{var el=document.createElement("textarea");el.value=txt;el.style.position="fixed";el.style.opacity="0";document.body.appendChild(el);el.focus();el.select();document.execCommand("copy");document.body.removeChild(el);setCopied("exportall");setTimeout(function(){setCopied(null);},2000);}catch(e){setImportText(txt);setShowDataPanel(true);}}   function exportCSV(){
    var rows=[["Name","Ticker","Tier","Status","Country","Sector","Portfolios","Action","Notes","Last Reviewed","Last Updated","Price","TP","MOS%","P/E","FY1","EPS1","FY2","EPS2","W1%","W2%","Norm EPS"]];
    displayedCos.forEach(function(c){var v=c.valuation||{};var ne=calcNormEPS(v)||parseFloat(v.eps);var tp=calcTP(v.pe,ne);var mos=calcMOS(tp,v.price);rows.push([c.name,c.ticker||"",getTiers(c.tier).join("; "),c.status||"",c.country||"",c.sector||"",(c.portfolios||[]).join("; "),c.action||"",c.takeaway||"",c.lastReviewed||"",c.lastUpdated||"",v.price||"",tp!==null?tp:"",mos!==null?mos+"":"",v.pe||"",v.fy1||"",v.eps1||"",v.fy2||"",v.eps2||"",v.w1||"",v.w2||"",ne||""]);});
    var csv=rows.map(function(r){return r.map(function(v){return'"'+String(v).replace(/"/g,'""')+'"';}).join(",");}).join("\n");
    var blob=new Blob([csv],{type:"text/csv"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="companies_export.csv";a.click();
  }
  function importAll(){
    setImportError("");
    try{var d=JSON.parse(importText);var cos=d.companies||(Array.isArray(d)?d:null),lib=d.library||null;if(!cos&&!lib){setImportError("No data found.");return;}if(cos&&Array.isArray(cos)){setCompanies(cos);supaUpsert("companies",{id:"shared",data:JSON.stringify(cos)});}if(lib&&Array.isArray(lib)){setSaved(lib);supaUpsert("library",{id:"shared",data:JSON.stringify(lib)});}setImportText("");setShowDataPanel(false);}
    catch(e){setImportError("Invalid JSON: "+e.message);}
  }
function applyPriceImport(){
    if(!priceImportText.trim())return;var lines=priceImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var ordMap={};var adrMap={};
  var priceData=[];lines.forEach(function(line){var delim=line.indexOf("\t")>=0?"\t":",";var parts=line.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});if(parts.length>=3){var name=parts[0];var ordTicker=parts[1].toUpperCase();var ordPrice=parseFloat(parts[2]);var rawPerf=parts.length>=4&&parts[3]?parts[3]:"";var ordPerf5d=rawPerf==="#N/A"||rawPerf===""?"":rawPerf.replace(/[()%\s]/g,"").replace(/^\((.+)\)$/,"-$1");var adrTicker=parts.length>=6&&parts[4]?parts[4].toUpperCase():"";var adrPrice=parts.length>=6&&parts[5]?parseFloat(parts[5].replace(/,/g,"")):NaN;var rawAdrPerf=parts.length>=7&&parts[6]?parts[6]:"";var adrPerf5d=rawAdrPerf==="#N/A"||rawAdrPerf===""?"":rawAdrPerf.replace(/[()%\s]/g,"").replace(/^\((.+)\)$/,"-$1");priceData.push({name:name,ordTicker:ordTicker,ordPrice:ordPrice,ordPerf5d:ordPerf5d,adrTicker:adrTicker,adrPrice:isNaN(adrPrice)?null:adrPrice,adrPerf5d:adrPerf5d});}});
    var count=0;
    setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=priceData.find(function(d){return d.name.toLowerCase().trim()===cname;});if(!match)return c;var updates={};if(!isNaN(match.ordPrice)){updates.valuation=Object.assign({},c.valuation||{},{price:match.ordPrice});count++;}var newTickers=[{ticker:match.ordTicker,price:match.ordPrice,perf5d:match.ordPerf5d||"",currency:(c.valuation&&c.valuation.currency)||getCurrency(c.country),isOrdinary:true}];if(match.adrTicker&&match.adrPrice!==null)newTickers.push({ticker:match.adrTicker,price:match.adrPrice,perf5d:match.adrPerf5d||"",currency:"USD",isOrdinary:false});updates.tickers=newTickers;return Object.assign({},c,updates);});});
    setPriceImportText("");setShowPriceImport(false);var priceUpdateStr=todayStr()+" "+new Date().toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});setLastPriceUpdate(priceUpdateStr);supaUpsert("meta",{key:"lastPriceUpdate",value:priceUpdateStr});setTimeout(function(){alert("Updated prices for "+count+" companies.");},100);
  }
  function findDupes(){
    var groups={};companies.forEach(function(c){var key=(c.ticker||c.name||"").toUpperCase().trim();if(!key)return;if(!groups[key])groups[key]=[];groups[key].push(c);});
    var dupes=Object.values(groups).filter(function(g){return g.length>1;});setDupeGroups(dupes);
    var keep={};dupes.forEach(function(g){var best=g.reduce(function(a,b){var sa=Object.keys(a.sections||{}).length+(a.updateLog||[]).length,sb=Object.keys(b.sections||{}).length+(b.updateLog||[]).length;return sb>sa?b:a;});keep[(g[0].ticker||g[0].name).toUpperCase()]=best.id;});
    setDupeKeep(keep);setShowDedupe(true);
  }
  function applyDedupe(){
    var keepIds=new Set(Object.values(dupeKeep));var dupeIds=new Set(dupeGroups.reduce(function(acc,g){return acc.concat(g.map(function(c){return c.id;}));},[]));
    setCompanies(function(prev){return prev.filter(function(c){return !dupeIds.has(c.id)||keepIds.has(c.id);});});
    setShowDedupe(false);setDupeGroups([]);setDupeKeep({});
  }
  function applyBulkEdit(){
    if(!selectedIds.size)return;var ch={};if(bulkStatus)ch.status=bulkStatus;if(bulkTier)ch.tier=bulkTier;if(!Object.keys(ch).length)return;
    setCompanies(function(prev){return prev.map(function(c){return selectedIds.has(c.id)?Object.assign({},c,ch):c;});});
    setSelectedIds(new Set());setBulkStatus("");setBulkTier("");
  }
  function toggleSelect(id){setSelectedIds(function(prev){var n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});}
  function selectAll(){setSelectedIds(new Set(displayedCos.map(function(c){return c.id;})));}
  function clearSelected(){setSelectedIds(new Set());}
  function acceptQuickDiff(company,diff,meta){
    var ns=Object.assign({},company.sections);diff.forEach(function(d){ns[d.section]=d.after;});
    var today=todayStr();var log={date:today,type:meta.type||"Update",summary:meta.summary||"",changes:diff.map(function(d){return d.section;})};
    var updated=Object.assign({},company,{sections:ns,updateLog:[log].concat(company.updateLog||[]),lastUpdated:today,lastReviewed:today});
    setCompanies(function(cs){return cs.map(function(c){return c.id===updated.id?updated:c;});});
    setSelCo(function(prev){return prev&&prev.id===updated.id?updated:prev;});
  }

  // Save an earnings entry — updates company, overwrites notes with latest
  function saveEarningsEntry(co,entry){
    var entries=(co.earningsEntries||[]).slice();var idx=entries.findIndex(function(e){return e.id===entry.id;});
    var saved=Object.assign({},entry,{open:false});
    if(idx>=0)entries[idx]=saved;else entries.unshift(saved);
    // Sort by date desc (newest first)
    entries.sort(function(a,b){var da=parseDate(a.reportDate),db=parseDate(b.reportDate);if(!da&&!db)return 0;if(!da)return 1;if(!db)return -1;return db.getTime()-da.getTime();});
    var updates={earningsEntries:entries,lastUpdated:todayStr()};
    // Overwrite notes with most recent entry's takeaways
    if(entries.length>0){var latest=entries[0];if(latest.shortTakeaway)updates.takeaway=latest.shortTakeaway;if(latest.extendedTakeaway)updates.takeawayLong=latest.extendedTakeaway;}
    // If TP changed, log to tpHistory
    if(entry.newTP&&entry.tpChange!=="Unchanged"){
      var currency=(co.valuation&&co.valuation.currency)||getCurrency(co.country);
      var tp=parseFloat(entry.newTP);
      if(!isNaN(tp)){
        var tpEntry={date:entry.reportDate||todayStr(),tp:tp,pe:(co.valuation&&co.valuation.pe)||"",eps:(co.valuation&&co.valuation.eps1)||"",forwardYear:entry.quarter||"",currency,source:"earnings"};
        updates.tpHistory=[tpEntry].concat(co.tpHistory||[]);
      }
    }
    var u=Object.assign({},co,updates);
    setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});
  }
  function deleteEarningsEntry(co,id){
    var entries=(co.earningsEntries||[]).filter(function(e){return e.id!==id;});
    var updates={earningsEntries:entries};
    // Re-sync notes to newest remaining
    if(entries.length>0){var latest=entries[0];if(latest.shortTakeaway)updates.takeaway=latest.shortTakeaway;if(latest.extendedTakeaway)updates.takeawayLong=latest.extendedTakeaway;}
    var u=Object.assign({},co,updates);
    setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});
  }

  function commitValuation(co,newVal){
    var currency=getCurrency(co.country);var activeCurrency=newVal.currency||currency;
    var oldVal=co.valuation||{};var oldNE=calcNormEPS(oldVal)||parseFloat(oldVal.eps);var oldTp=calcTP(oldVal.pe,oldNE);
    var newNE=calcNormEPS(newVal)||parseFloat(newVal.eps);var newTp=calcTP(newVal.pe,newNE);
    var updates={valuation:newVal};
    if(newTp!==null&&newTp!==oldTp){
      var fyLabel=impliedFYLabel(newVal);
      var entry={date:todayStr(),tp:newTp,pe:newVal.pe,eps:String(newNE||""),fyLabel,currency:activeCurrency};
      updates.tpHistory=[entry].concat(co.tpHistory||[]);
    }
    var u=Object.assign({},co,updates);
    setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});
    setPendingVal(Object.assign({},newVal));return u;
  }

  function handleSortClick(colSort){     if(coSort===colSort){setCoSortDir(function(d){return d==="asc"?"desc":"asc";});}     else{setCoSort(colSort);setCoSortDir(colSort==="Last Reviewed"?"desc":"asc");}   }    var flaggedCos=companies.filter(function(c){return c.flag;}).sort(function(a,b){return(a.flag==="Urgent"?0:1)-(b.flag==="Urgent"?0:1);}); var usedCountries=Array.from(new Set(companies.map(function(c){return c.country;}).filter(Boolean))).sort();
  var usedSectors=Array.from(new Set(companies.map(function(c){return c.sector;}).filter(Boolean))).sort();
  var displayedCos=sortCos(companies.filter(function(c){
    if(coFilter!=="All"&&(c.portfolios||[]).indexOf(coFilter)<0)return false;
    if(coStatusFilter!=="All"&&c.status!==coStatusFilter)return false;
    if(coFilterCountry!=="All"&&c.country!==coFilterCountry)return false;
    if(coFilterSector!=="All"&&c.sector!==coFilterSector)return false;
    if(coSearch){var s=coSearch.toLowerCase();if(c.name.toLowerCase().indexOf(s)<0&&(c.ticker||"").toLowerCase().indexOf(s)<0)return false;}
    return true;
  }),coSort,coSortDir);

  function addCompany(){
    if(!newName.trim())return;
    setCompanies(function(p){return [{id:Date.now(),name:newName.trim(),ticker:newTicker.trim().toUpperCase(),portfolios:newFields.portfolios||[],tier:newFields.tier||"",sector:newFields.sector||"",country:newFields.country||"",action:newFields.action||"",takeaway:"",takeawayLong:"",lastReviewed:"",portNote:"",status:"",sections:{},updateLog:[],valuation:{},tpHistory:[],earningsEntries:[],lastUpdated:null,portWeights:{}}].concat(p);});
    setNewName("");setNewTicker("");setNewFields({portfolios:[],tier:"",sector:"",country:"",action:""});setShowNew(false);
  }
  function parseBulk(){
    if(!bulkText.trim())return;setBulkLoading(true);
    try{
      var lines=bulkText.split(/\r?\n/).filter(function(l){return l.trim();});if(lines.length<2){setBulkLoading(false);return;}
      var delim=lines[0].indexOf("\t")>=0?"\t":",";
      function parseRow(line){var cols=[],cur="",inQ=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){inQ=!inQ;}else if(ch===delim&&!inQ){cols.push(cur.trim());cur="";}else{cur+=ch;}}cols.push(cur.trim());return cols.map(function(c){return c.replace(/^"|"$/g,"").trim();});}
      var headers=parseRow(lines[0]).map(function(h){return h.toLowerCase().replace(/[^a-z0-9?]/g," ").trim();});
      function find(){var keys=Array.from(arguments);for(var i=0;i<keys.length;i++){var ix=headers.findIndex(function(h){return h.indexOf(keys[i])>=0;});if(ix>-1)return ix;}return -1;}
      var idx={name:find("company","name"),ticker:find("ticker","symbol"),portfolio:find("portfolio"),port:find("port?","port "),country:find("country"),sector:find("sector"),lastReviewed:find("last reviewed","reviewed"),action:find("action"),takeaway:find("notes","takeaway","summary"),status:find("status"),tier:find("tier"),price:find("price")};
      var rows=lines.slice(1).map(function(line){
        var cols=parseRow(line);function get(i){return i>-1?(cols[i]||""):""}
        var portRaw=get(idx.portfolio).toUpperCase();var portTokens=portRaw.split(/[\s,]+/).filter(Boolean);
        var portfolios=PORTFOLIOS.filter(function(p){return portTokens.indexOf(p)>=0;}).filter(function(p,i,a){return a.indexOf(p)===i;});
        var status=get(idx.status).trim();status=(/^buy$/i.test(status)||/^own$/i.test(status))?"Own":/^focus$/i.test(status)?"Focus":/^watch$/i.test(status)?"Watch":/^sold$/i.test(status)?"Sold":"";
        var action=get(idx.action);action=/increase|up|raise/i.test(action)?"Increase TP":/decrease|down|cut|lower/i.test(action)?"Decrease TP":/no action|hold|maintain/i.test(action)?"No Action":action||"";
        var price=idx.price>-1?parseFloat(get(idx.price)):NaN;
        return{name:get(idx.name),ticker:get(idx.ticker).toUpperCase(),portfolios,portNote:get(idx.port),country:get(idx.country),sector:get(idx.sector),lastReviewed:get(idx.lastReviewed),action,takeaway:get(idx.takeaway),status,tier:get(idx.tier),price:isNaN(price)?undefined:price};
      }).filter(function(r){return r.name||r.ticker;});
      setBulkPreview(rows);
    }catch(e){alert("Parse error: "+e.message);}
    setBulkLoading(false);
  }
  function confirmBulk(mode){
    if(!bulkPreview)return;
    if(mode==="replace"){setCompanies(bulkPreview.map(function(row){var val=row.price!==undefined?{price:row.price}:{};return Object.assign({id:Date.now()+Math.random(),sections:{},updateLog:[],valuation:val,tpHistory:[],earningsEntries:[],lastUpdated:null,takeawayLong:"",portWeights:{}},row);}));}
    else{setCompanies(function(prev){
      var seen=new Set();var deduped=prev.filter(function(c){var t=(c.ticker||"").toUpperCase();if(seen.has(t)&&t)return false;seen.add(t);return true;});var upd=deduped.slice();
      bulkPreview.forEach(function(row){var rt=(row.ticker||"").toUpperCase();var ix=-1;if(rt)ix=upd.findIndex(function(c){return(c.ticker||"").toUpperCase()===rt;});if(ix<0)ix=upd.findIndex(function(c){return c.name.toLowerCase()===row.name.toLowerCase();});var entry={portfolios:row.portfolios||[],portNote:row.portNote||"",country:row.country||"",sector:row.sector||"",lastReviewed:row.lastReviewed||"",action:row.action||"",takeaway:row.takeaway||"",status:row.status||"",tier:row.tier||""};if(row.price!==undefined)entry.valuation=Object.assign({},ix>-1?(upd[ix].valuation||{}):{},{price:row.price});if(ix>-1){upd[ix]=Object.assign({},upd[ix],entry);}else{upd.unshift(Object.assign({id:Date.now()+Math.random(),name:row.name||"Unnamed",ticker:rt,sections:{},updateLog:[],valuation:entry.valuation||{},tpHistory:[],earningsEntries:[],lastUpdated:null,takeawayLong:"",portWeights:{}},entry));}});return upd;
    });}
    setBulkPreview(null);setBulkText("");setShowBulk(false);
  }

  async function importTemplate(){
    if(!tmplRaw.trim())return;setTmplLoading(true);
    try{
      var allKeys=[...TEMPLATE_SECTIONS].map(function(s){return'"'+s+'"';}).join(", ");
      var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:4000,system:"You are a JSON extractor. Extract the following sections from the provided company research template and return ONLY a valid JSON object with exactly these keys: "+allKeys+". If a section is not found, use an empty string. Return nothing else — no markdown, no backticks, no explanation.",messages:[{role:"user",content:[{type:"text",text:tmplRaw.slice(0,20000)}]}]})});
      var json=await res.json();if(json.error){alert("API error: "+JSON.stringify(json.error));setTmplLoading(false);return;}
      var raw=(json.content||[]).map(function(b){return b.text||"";}).join("");
      var clean=raw.replace(/```json/g,"").replace(/```/g,"").trim();
      var parsed=JSON.parse(clean);
      var existing=selCo.sections||{};var merged=Object.assign({},existing);
      TEMPLATE_SECTIONS.forEach(function(s){if(parsed[s]&&parsed[s].trim())merged[s]=parsed[s];});
      var u=Object.assign({},selCo,{sections:merged,lastUpdated:todayStr()});
      setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});setTmplRaw("");
    }catch(e){alert("Failed: "+e.message);}
    setTmplLoading(false);
  }
  async function processUpload(){
    if(!selCo||!upText.trim())return;setUpLoading(true);setPendingDiff(null);setPendingMeta(null);
    try{var allSecs=[...TEMPLATE_SECTIONS];var cur=allSecs.map(function(s){return"## "+s+"\n"+((selCo.sections&&selCo.sections[s])||"(empty)");}).join("\n\n");var r=await apiCall("Investment research assistant. New research ("+upType+") for "+selCo.name+" ("+selCo.ticker+"). Current template:\n"+cur+"\n\nReturn ONLY JSON: {changes:[{section,before,after,reason}],summary:string}. No markdown fences.",[{type:"text",text:upText}],2500);var parsed=JSON.parse(r.replace(/```json|```/g,"").trim());setPendingDiff(parsed.changes||[]);setPendingMeta({summary:parsed.summary,type:upType,date:todayStr()});}catch(e){alert("Could not process: "+e.message);}
    setUpLoading(false);
  }
  function acceptDiff(){
    if(!pendingDiff||!selCo)return;
    var ns=Object.assign({},selCo.sections);pendingDiff.forEach(function(d){ns[d.section]=d.after;});
    var today=todayStr();var log={date:today,type:(pendingMeta&&pendingMeta.type)||"Update",summary:(pendingMeta&&pendingMeta.summary)||"",changes:pendingDiff.map(function(d){return d.section;})};
    var newFlash={};pendingDiff.forEach(function(d){newFlash[d.section]=Date.now();});
    var u=Object.assign({},selCo,{sections:ns,updateLog:[log].concat(selCo.updateLog||[]),lastUpdated:today,lastReviewed:today});
    setFlashSections(newFlash);setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});
    setPendingDiff(null);setPendingMeta(null);setUpText("");setCoView("section:Valuation");
  }
  async function synthesize(){
    var has=useSrc?sources.some(function(s){return s.text.trim();}):input.trim();if(!has)return;setLoading(true);setOutput("");setFuA("");setFuQ("");setAutoTagSuggestions([]);
    try{var txt=useSrc?sources.filter(function(s){return s.text.trim();}).map(function(s){return"["+s.label+"]:\n"+s.text;}).join("\n\n"):input;setOutput(await apiCall(synPrompt(format,tone,custom),[{type:"text",text:txt}]));}catch(e){setOutput("Error.");}
    setLoading(false);
  }
  function saveLib(force){
    if(!output)return;if(!force&&saved.some(function(s){return simScore(s.result,output)>0.6;})){setDupWarn(true);return;}setDupWarn(false);
    var title=(useSrc?(sources[0]&&sources[0].label):input.slice(0,48))||"Untitled";
    setSaved(function(p){return [{id:Date.now(),title,format,tone,result:output,tags:pendingTags,date:todayStr(),ts:Date.now(),pinned:false,note:""}].concat(p);});
    setPendingTags([]);setAutoTagSuggestions([]);
  }
  function updEntry(id,ch){setSaved(function(p){return p.map(function(e){return e.id===id?Object.assign({},e,ch):e;});});}
  async function askFollowUp(){if(!fuQ.trim()||!output)return;setFuLoading(true);try{setFuA(await apiCall("Answer the follow-up concisely from this synthesis:\n\n"+output,fuQ,600));}catch(e){setFuA("Error.");}setFuLoading(false);}
  async function askRecall(){
    if(!recallQ.trim()||!saved.length)return;setRecallLoading(true);setRecall("");setRecallSrcs([]);
    try{var ctx=saved.map(function(s,i){return"[Research "+(i+1)+": "+s.title+"]\n"+s.result;}).join("\n\n---\n\n");var full=await apiCall("Answer drawing on saved entries. Cite (e.g. Research 2). End with SOURCES_USED: [comma-separated numbers]\n\nLIBRARY:\n"+ctx,recallQ,1000);var m=full.match(/SOURCES_USED:\s*([\d,\s]+)/);var ans=m?full.replace(/SOURCES_USED:.*/,"").trim():full;setRecall(ans);if(m)setRecallSrcs(m[1].split(",").map(function(n){return parseInt(n.trim())-1;}).filter(function(n){return !isNaN(n);}).map(function(i){return saved[i];}).filter(Boolean));setRecallHist(function(h){return [{q:recallQ,a:ans,ts:Date.now()}].concat(h.slice(0,9));});}catch(e){setRecall("Error.");}setRecallLoading(false);
  }
  async function genSuggestions(){try{var r=await apiCall("","Suggest 4 cross-cutting questions. Return ONLY a JSON array of strings.\n"+saved.map(function(s,i){return(i+1)+". "+s.title;}).join("\n"),300);setSuggestions(JSON.parse(r.replace(/```json|```/g,"").trim()));}catch(e){}}
  async function doCompare(){if(cmpIds.length<2)return;setCmpLoading(true);setCmpOut("");var entries=cmpIds.map(function(id){return saved.find(function(s){return s.id===id;});}).filter(Boolean);try{setCmpOut(await apiCall("Compare these entries. 1) **Shared themes**, 2) **Key differences**, 3) **Synthesis**.",entries.map(function(e,i){return"[Entry "+(i+1)+": "+e.title+"]\n"+e.result;}).join("\n\n---\n\n"),1000));}catch(e){setCmpOut("Error.");}setCmpLoading(false);}
  async function buildMacro(){var me=saved.filter(function(s){return(s.tags||[]).indexOf("Macro")>=0;});if(!me.length)return;setMacroLoading(true);setMacroOut("");try{setMacroOut(await apiCall("Synthesize these Macro entries. Structure: **Running themes**, **Consensus views**, **Divergences**, **Master core finding**, **Watch list**.",me.map(function(e){return"["+e.title+"]\n"+e.result;}).join("\n\n---\n\n"),1500));}catch(e){setMacroOut("Error.");}setMacroLoading(false);}
  async function doResynth(){var e=saved.find(function(s){return s.id===rsId;});if(!e)return;setRsLoading(true);setRsOut("");try{setRsOut(await apiCall(synPrompt(rsFmt,rsTone,""),e.result));}catch(err){setRsOut("Error.");}setRsLoading(false);}
  function saveResynth(){var e=saved.find(function(s){return s.id===rsId;});if(!e||!rsOut)return;setSaved(function(p){return [{id:Date.now(),title:e.title+" (re-synthesized)",format:rsFmt,tone:rsTone,result:rsOut,tags:e.tags,date:todayStr(),ts:Date.now(),pinned:false,note:""}].concat(p);});setRsId(null);setRsOut("");}

  var allTags=["All"].concat(Array.from(new Set(saved.reduce(function(acc,s){return acc.concat(s.tags||[]);},[]))));
  var filteredSaved=saved.filter(function(s){return filterTag==="All"||(s.tags||[]).indexOf(filterTag)>=0;}).filter(function(s){return !search||s.title.toLowerCase().indexOf(search.toLowerCase())>=0||s.result.toLowerCase().indexOf(search.toLowerCase())>=0;}).sort(function(a,b){if(libSort==="Pinned first")return(b.pinned?1:0)-(a.pinned?1:0)||b.ts-a.ts;if(libSort==="Newest")return b.ts-a.ts;if(libSort==="Oldest")return a.ts-b.ts;if(libSort==="Format")return a.format.localeCompare(b.format);return((a.tags||[])[0]||"").localeCompare((b.tags||[])[0]||"");});
  var macroEntries=saved.filter(function(s){return(s.tags||[]).indexOf("Macro")>=0;});
  var linkedEntries=selCo?saved.filter(function(s){return(s.tags||[]).some(function(t){return t.toLowerCase()===selCo.name.toLowerCase();})||s.result.toLowerCase().indexOf((selCo.name||"").toLowerCase())>=0||(selCo.ticker&&s.result.toLowerCase().indexOf(selCo.ticker.toLowerCase())>=0);}):[];
  var staleWatchCount=companies.filter(function(c){return c.status==="Watch"&&daysSince(c.lastReviewed)>90;}).length;
  var portStats=PORTFOLIOS.map(function(p){var cos=companies.filter(function(c){return(c.portfolios||[]).indexOf(p)>=0;});var byStatus={Own:0,Focus:0,Watch:0,Sold:0};cos.forEach(function(c){if(byStatus[c.status]!==undefined)byStatus[c.status]++;});var bySector={};cos.forEach(function(c){if(c.sector)bySector[c.sector]=(bySector[c.sector]||0)+1;});var top3=Object.entries(bySector).sort(function(a,b){return b[1]-a[1];}).slice(0,3);var byRegion={};cos.forEach(function(c){var r=getRegion(c.country);if(r)byRegion[r]=(byRegion[r]||0)+1;});var regionList=Object.entries(byRegion).sort(function(a,b){return b[1]-a[1];});return{port:p,total:cos.length,byStatus,top3,regionList};}).filter(function(s){return s.total>0;});
  var dashCos=dashPort==="All"?companies:companies.filter(function(c){return(c.portfolios||[]).indexOf(dashPort)>=0;});
  var dashSectors=SECTOR_ORDER.map(function(s){var own=dashCos.filter(function(c){return c.sector===s&&c.status==="Own";}).length;var focus=dashCos.filter(function(c){return c.sector===s&&c.status==="Focus";}).length;var watch=dashCos.filter(function(c){return c.sector===s&&c.status==="Watch";}).length;return{sector:s,own,focus,watch,total:own+focus+watch};}).filter(function(s){return s.total>0;}).sort(function(a,b){return b.own-a.own||b.total-a.total;});
  var sectorMax=dashSectors.reduce(function(m,s){return Math.max(m,s.own+s.focus+s.watch);},1);
  var dashCountryMap={};dashCos.forEach(function(c){if(!c.country)return;if(!dashCountryMap[c.country])dashCountryMap[c.country]={own:0,focus:0,watch:0};if(c.status==="Own")dashCountryMap[c.country].own++;else if(c.status==="Focus")dashCountryMap[c.country].focus++;else if(c.status==="Watch")dashCountryMap[c.country].watch++;});
  var dashCountryEntries=Object.entries(dashCountryMap).filter(function(e){return e[1].own>0;}).sort(function(a,b){return b[1].own-a[1].own||(b[1].focus+b[1].watch)-(a[1].focus+a[1].watch);});
  var dashCountryMax=1;dashCountryEntries.forEach(function(e){var t=e[1].own+e[1].focus+e[1].watch;if(t>dashCountryMax)dashCountryMax=t;});
  var HEADER_COLS=[{label:"Tier(s)",sort:"Tier"},{label:"Name",sort:"Name"},{label:"5D%",sort:null},{label:"Country",sort:"Country"},{label:"Sector",sort:"Sector"},{label:"Portfolio",sort:null},{label:"Action",sort:null},{label:"Notes",sort:null},{label:"Reviewed",sort:"Last Reviewed"},{label:"Updated",sort:null},{label:"Status",sort:null},{label:"",sort:null}];
  var coTabs=[...TEMPLATE_SECTIONS.map(function(s){return{id:"section:"+s,label:s};}),{id:"earnings",label:"Earnings & Thesis Check"},{id:"template",label:"Template"},
    {id:"linked",label:"Linked"+(linkedEntries.length>0?" ("+linkedEntries.length+")":"")},{id:"upload",label:"Upload"},{id:"history",label:"Log"+((selCo&&selCo.updateLog&&selCo.updateLog.length>0)?" ("+selCo.updateLog.length+")":"")}];

  return(
    <div style={{padding:"1rem",boxSizing:"border-box",fontFamily:"system-ui,sans-serif",fontSize:14,color:T.text,background:T.bg,minHeight:"100vh"}}>       {(!currentUser||showUserPicker)&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:T.bg,border:"1px solid "+T.border,borderRadius:12,padding:28,width:320,boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}><div style={{fontSize:16,fontWeight:600,color:T.text,marginBottom:6}}>Who are you?</div><div style={{fontSize:13,color:T.textSec,marginBottom:16}}>Select your name so edits are tracked correctly.</div><div style={{display:"flex",flexDirection:"column",gap:8}}>{TEAM_MEMBERS.map(function(name){return(<button key={name} onClick={function(){setCurrentUser(name);setShowUserPicker(false);}} style={{padding:"10px 16px",fontSize:14,fontWeight:currentUser===name?600:400,background:currentUser===name?"#dbeafe":T.bgSec,color:currentUser===name?"#1e40af":T.text,border:"1px solid "+(currentUser===name?"#93c5fd":T.border),borderRadius:8,cursor:"pointer",textAlign:"left"}}>{name}</button>);})}</div>{currentUser&&<div style={{marginTop:12,fontSize:12,color:T.textSec,textAlign:"right",cursor:"pointer"}} onClick={function(){setShowUserPicker(false);}}>Cancel</div>}</div></div>)}
      {showShortcuts&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={function(){setShowShortcuts(false);}}><div onClick={function(e){e.stopPropagation();}} style={{background:T.bg,border:"1px solid "+T.border,borderRadius:12,padding:"20px 24px",minWidth:320,boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}><div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:14}}>Keyboard Shortcuts</div>{SHORTCUTS.map(function(s){return(<div key={s.key} style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}><span style={{fontSize:12,padding:"2px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bgSec,fontFamily:"monospace",color:T.text,minWidth:28,textAlign:"center"}}>{s.key}</span><span style={{fontSize:13,color:T.textSec}}>{s.desc}</span></div>);})}<div style={{marginTop:14,fontSize:12,color:T.textSec,textAlign:"right",cursor:"pointer"}} onClick={function(){setShowShortcuts(false);}}>Close (Esc)</div></div></div>)}
      {showTmplSearch&&<TemplateSearch companies={companies.filter(function(c){return Object.keys(c.sections||{}).length>0;})} onSelect={function(c,q){setSelCo(c);setTab("companies");setCoView("section:Valuation");setTmplHighlight(q);setTmplSearch(q);}} onClose={function(){setShowTmplSearch(false);}} T={T}/>} {showGlobalSearch&&<GlobalSearch companies={companies} saved={saved} onSelectCompany={function(c){setSelCo(c);setTab("companies");setCoView("section:Valuation");}} onSelectEntry={function(s){setTab("library");setExpanded(s.id);}} onClose={function(){setShowGlobalSearch(false);}} T={T}/>}
      {quickUploadCo&&<QuickUploadModal company={quickUploadCo} onClose={function(){setQuickUploadCo(null);}} onAccept={acceptQuickDiff} T={T}/>}

      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:6,alignItems:"center",flex:1,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:T.textSec}}>Storage:</span>
          <span style={{...PILL(),background:loadStatus.companies===null?T.bgTer:loadStatus.companies>0?"#dcfce7":"#fef9c3",color:loadStatus.companies===null?T.textSec:loadStatus.companies>0?"#166534":"#854d0e",border:"none"}}>{loadStatus.companies===null?"loading…":loadStatus.companies>0?"✓ "+loadStatus.companies+" cos":"⚠ none"}</span>
          <span style={{...PILL(),background:loadStatus.library===null?T.bgTer:loadStatus.library>0?"#dcfce7":"#fef9c3",color:loadStatus.library===null?T.textSec:loadStatus.library>0?"#166534":"#854d0e",border:"none"}}>{loadStatus.library===null?"loading…":loadStatus.library>0?"✓ "+loadStatus.library+" lib":"⚠ none"}</span> {lastPriceUpdate&&<PriceAgeIndicator lastPriceUpdate={lastPriceUpdate} T={T}/>}
        </div>
        <button onClick={function(){setShowGlobalSearch(true);}} style={{fontSize:11,padding:"3px 10px"}}>🔍 Search</button> <button onClick={function(){setShowTmplSearch(true);}} style={{fontSize:11,padding:"3px 10px"}}>Templates</button>
        <button onClick={function(){setDark(function(d){return !d;});}} style={{fontSize:11,padding:"3px 10px"}}>{dark?"☀ Light":"🌙 Dark"}</button>
        <button onClick={function(){setCompact(function(c){var next=!c;setVisibleCols(next?COMPACT_COLS:new Set(ALL_COLS));return next;});}} style={{fontSize:11,padding:"3px 10px"}}>{compact?"⊞ Default":"⊟ Compact"}</button>
        <button onClick={loadFromStorage} style={{fontSize:11,padding:"3px 10px"}}>↺ Reload</button>
        <button onClick={function(){setShowShortcuts(true);}} style={{fontSize:11,padding:"3px 10px"}}>? Keys</button>
        <button onClick={function(){setShowDataPanel(function(s){return !s;});}} style={{fontSize:11,padding:"3px 10px"}}>{showDataPanel?"Close":"Import/Export"}</button>
      </div>
      {flaggedCos.length>0&&(<div style={{marginBottom:8,padding:"8px 14px",background:"#fff5f5",border:"1px solid #fca5a5",borderRadius:8,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:600,color:"#991b1b"}}>⚑ Flagged ({flaggedCos.length}):</span>{flaggedCos.map(function(c){var fs=FLAG_STYLES[c.flag];return(<span key={c.id} onClick={function(){setSelCo(c);setTab("companies");}} style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:fs.bg,color:fs.color,cursor:"pointer",border:"1px solid "+fs.color}}>{fs.icon} {c.name}</span>);})}</div>)} {showDataPanel&&(<div style={{...CARD,marginBottom:12}}><div style={{display:"flex",gap:6,marginBottom:12,borderBottom:"1px solid "+T.border,paddingBottom:10,flexWrap:"wrap"}}>{[["prices","Prices"],["valuation","Valuation"],["weights","Target Weights"],["earnings","Earnings Dates"],["fx","FX Rates"],["rep","Rep Holdings"]].map(function(item){return <button key={item[0]} style={TABSM(dataHubTab===item[0])} onClick={function(){setDataHubTab(item[0]);}}>{item[1]}</button>;})}</div> {dataHubTab==="valuation"&&(<div><div style={{fontSize:13,fontWeight:500,marginBottom:4,color:T.text}}>Earnings Estimates</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Columns: Company, Target PE, 5Yr Low, 5Yr High, 5Yr Avg, 5Yr Median, FY Month, Currency, FY1, EPS1, W1%, FY2, EPS2, W2%</div><textarea value={estImportText||""} onChange={function(e){setEstImportText(e.target.value);}} placeholder="Shell  18.5  12  22  17  16.5  Dec  USD  FY2026E  4.20  50  FY2027E  4.80  50" rows={8} style={{...TA(120),fontFamily:"monospace",marginBottom:8}}/><button onClick={applyEstImport} disabled={!estImportText.trim()} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Import</button></div>)} {dataHubTab==="prices"&&(<div><div style={{fontSize:13,fontWeight:500,marginBottom:4,color:T.text}}>Price Upload</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Columns: Company Name, Ord Ticker, Ord Price, Ord 5D%, ADR Ticker (opt), ADR Price (opt), ADR 5D% (opt)</div><textarea value={priceImportText} onChange={function(e){setPriceImportText(e.target.value);}} placeholder="Shell  SHEL-GB  26.50  -1.2%  SHEL  34.10  -1.2%" rows={8} style={{...TA(120),fontFamily:"monospace",marginBottom:8}}/><button onClick={applyPriceImport} disabled={!priceImportText.trim()} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Import</button></div>)}  {dataHubTab==="weights"&&(<div><div style={{fontSize:13,fontWeight:500,marginBottom:4,color:T.text}}>Target Portfolio Weights</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Columns: Company, GL%, FGL%, IV%, FIV%, EM%, SC%</div><textarea value={weightsImportText||""} onChange={function(e){setWeightsImportText(e.target.value);}} placeholder="Shell  3.5  4.0  3.5  4.0  0  0" rows={8} style={{...TA(120),fontFamily:"monospace",marginBottom:8}}/><button onClick={applyWeightsImport} disabled={!weightsImportText.trim()} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Import</button></div>)} {dataHubTab==="earnings"&&(<div><div style={{fontSize:13,fontWeight:500,marginBottom:4,color:T.text}}>Earnings Dates</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Columns: Ticker, Date (YYYY-MM-DD). {calLastUpdated&&"Last imported by "+calLastUpdatedBy+" at "+calLastUpdated}</div><textarea value={calImportText||""} onChange={function(e){setCalImportText(e.target.value);}} placeholder="AAPL  2026-05-01" rows={8} style={{...TA(120),fontFamily:"monospace",marginBottom:8}}/><button onClick={applyCalImport} disabled={!calImportText.trim()} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Import</button></div>)} {dataHubTab==="fx"&&(<div><div style={{fontSize:13,fontWeight:500,marginBottom:4,color:T.text}}>FX Rates</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Columns: Pair (e.g. GBPUSD), Rate. {fxLastUpdated&&"Last loaded by "+fxLastUpdated}</div><textarea value={fxText} onChange={function(e){setFxText(e.target.value);}} placeholder="GBPUSD  1.3463" rows={8} style={{...TA(120),fontFamily:"monospace",marginBottom:8}}/><button onClick={applyFxImport} disabled={!fxText.trim()} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Load FX</button></div>)} {dataHubTab==="rep"&&(<div><div style={{fontSize:13,fontWeight:500,marginBottom:4,color:T.text}}>Rep Account Holdings</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Columns: Account Number, Ticker, Shares. {repLastUpdated&&"Last loaded by "+repLastUpdated}</div><textarea value={repText} onChange={function(e){setRepText(e.target.value);}} placeholder="LWGA0013  SHEL  1500" rows={8} style={{...TA(120),fontFamily:"monospace",marginBottom:8}}/><button onClick={applyRepImport} disabled={!repText.trim()} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Load</button></div>)} </div>)}
      <div style={{borderTop:"1px solid "+T.border,marginBottom:10}}/>
      <div style={{display:"flex",gap:6,marginBottom:"1rem",flexWrap:"wrap"}}>
        {[["portfolios","Portfolios"],["companies","Companies"],["dashboard","Dashboard"],["synthesize","Synthesize"],["library","Library ("+saved.length+")"],["recall","Recall"],["compare","Compare"],["macro","Macro Master"],["calendar","Earnings Calendar"]].map(function(item){return <button key={item[0]} style={TABST(tab===item[0])} onClick={function(){setTab(item[0]);if(item[0]!=="companies")setSelCo(null);}}>{item[1]}</button>;})}
      </div>

<ErrorBoundary>
{tab==="portfolios"&&(<div>   <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",borderBottom:"1px solid "+T.border,paddingBottom:10}}>     {PORTFOLIOS.map(function(p){return <button key={p} style={TABST(portTab===p)} onClick={function(){setPortTab(p);}}>{PORT_NAMES[p]||p}</button>;})}   </div>   {(function(){     var portCos=companies.filter(function(c){return(c.portfolios||[]).indexOf(portTab)>=0;}).slice().sort(function(a,b){if(portSort==="name")return(a.name||"").localeCompare(b.name||"");if(portSort==="target"){var ta=parseFloat((a.portWeights||{})[portTab])||0;var tb=parseFloat((b.portWeights||{})[portTab])||0;return tb-ta;}if(portSort==="mos"){var ma=calcMOS(calcTP((a.valuation||{}).pe,calcNormEPS(a.valuation||{})||parseFloat((a.valuation||{}).eps)),((a.tickers||[]).find(function(t){return t.isOrdinary;})||{}).price||(a.valuation||{}).price);var mb=calcMOS(calcTP((b.valuation||{}).pe,calcNormEPS(b.valuation||{})||parseFloat((b.valuation||{}).eps)),((b.tickers||[]).find(function(t){return t.isOrdinary;})||{}).price||(b.valuation||{}).price);if(ma===null&&mb===null)return 0;if(ma===null)return 1;if(mb===null)return -1;return mb-ma;}if(portSort==="sector")return(a.sector||"").localeCompare(b.sector||"");if(portSort==="country")return(a.country||"").localeCompare(b.country||"");var getRepMV=function(c){var mv=0;(c.tickers||[]).forEach(function(t){var tk=(t.ticker||"").toUpperCase();var shares=(repData[portTab]||{})[tk];if(shares&&t.price){var ccy=(t.currency||"USD").toUpperCase();var fx=ccy==="USD"?1:(fxRates[ccy]||0);if(fx>0)mv+=shares*parseFloat(t.price)*fx;}});return mv;};return getRepMV(b)-getRepMV(a);});     var portRep=repData[portTab]||{};     var totalMV=0;     portCos.forEach(function(c){       var allTickers=c.tickers||[];       allTickers.forEach(function(t){         var tk=(t.ticker||"").toUpperCase();         var shares=portRep[tk];         if(shares&&t.price){var ccy=(t.currency||"USD").toUpperCase();var fx=ccy==="USD"?1:(fxRates[ccy]||0);if(fx>0)totalMV+=shares*parseFloat(t.price)*fx;}       });     });     return(<div>       <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center",flexWrap:"wrap"}}>         <span style={{fontSize:13,fontWeight:500,color:T.text}}>{PORT_NAMES[portTab]} — {portCos.length} companies</span>         {totalMV>0&&<span style={{fontSize:12,color:T.textSec}}>Rep AUM: ${totalMV.toLocaleString(undefined,{maximumFractionDigits:0})}</span>}         </div><div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>           <span style={{fontSize:11,color:T.textSec}}>Sort:</span>           {[["rep","Rep %"],["target","Target %"],["name","Name"],["mos","MOS"],["sector","Sector"],["country","Country"]].map(function(s){return <span key={s[0]} onClick={function(){setPortSort(s[0]);}} style={{fontSize:11,padding:"2px 8px",borderRadius:99,cursor:"pointer",background:portSort===s[0]?T.bgSec:T.bg,border:"1px solid "+(portSort===s[0]?T.borderSec:T.border),color:portSort===s[0]?T.text:T.textSec}}>{s[1]}</span>;})}         </div>       <div style={{overflowX:"auto"}}><div style={{display:"table",width:"100%",borderCollapse:"separate",borderSpacing:"0 2px"}}>         <div style={{display:"table-row",position:"sticky",top:0,zIndex:10,background:T.bg}}>           {["Company","Country","Sector","Next Report","5D%","MOS","Target %","Rep %","Diff"].map(function(h){return <div key={h} style={{display:"table-cell",fontSize:10,color:T.textSec,textTransform:"uppercase",letterSpacing:"0.05em",paddingBottom:6,paddingRight:12,position:"sticky",top:0,background:T.bg}}>{h}</div>;})}         </div>         {portCos.map(function(c){           var val=c.valuation||{};var ne=calcNormEPS(val)||parseFloat(val.eps);var tp=calcTP(val.pe,ne);var ordTicker=(c.tickers||[]).find(function(t){return t.isOrdinary;});var ordPrice=ordTicker?parseFloat(ordTicker.price):parseFloat(val.price);var mos=calcMOS(tp,ordPrice);var mosStyle=mosBg(mos);           var target=parseFloat((c.portWeights||{})[portTab])||0;           var allTickers=c.tickers||[];           var repMV=0;           allTickers.forEach(function(t){             var tk=(t.ticker||"").toUpperCase();             var shares=portRep[tk];             if(shares&&t.price){var ccy=(t.currency||"USD").toUpperCase();var fx=ccy==="USD"?1:(fxRates[ccy]||1);repMV+=shares*parseFloat(t.price)*fx;}           });           var repWeight=totalMV>0&&repMV>0?Math.round(repMV/totalMV*1000)/10:null;           var diff=repWeight!==null&&target>0?Math.round((repWeight-target)*10)/10:null;           var nextReport=null;           var today=new Date();today.setHours(0,0,0,0);           (c.earningsEntries||[]).forEach(function(e){if(!e.reportDate)return;var d=new Date(e.reportDate);if(d>=today){if(!nextReport||d<nextReport)nextReport=d;}});           var rowBg=diff!==null?(diff<=-0.3?"rgba(220,38,38,0.15)":diff>=0.5?"rgba(22,101,52,0.15)":T.bgSec):T.bgSec;           var td={display:"table-cell",verticalAlign:"middle",paddingRight:12,paddingTop:6,paddingBottom:6,fontSize:13,color:T.text,background:rowBg};           return(<div key={c.id} onClick={function(){setSelCo(c);setTab("companies");setCoView("section:Valuation");}} style={{display:"table-row",cursor:"pointer"}}>             <div style={{...td,fontWeight:500,cursor:"pointer"}}>{c.name}</div>             <div style={{...td,fontSize:12,color:T.textSec}}>{c.country||"--"}</div>             <div style={{...td,fontSize:12,color:T.textSec}}>{c.sector||"--"}</div>             <div style={{...td,fontSize:12,color:nextReport?(Math.round((nextReport-today)/(1000*60*60*24))<=7?(T.dark?"#f87171":"#dc2626"):Math.round((nextReport-today)/(1000*60*60*24))<=14?(T.dark?"#fbbf24":"#d97706"):T.text):T.textSec}}>{nextReport?nextReport.toISOString().slice(0,10):"--"}</div>             <div style={td}>{(function(){var ord=(c.tickers||[]).find(function(t){return t.isOrdinary;});var perf=ord&&ord.perf5d;if(!perf||perf==="#N/A")return"--";var n=parseFloat(perf);if(isNaN(n))return"--";return <span style={{color:n>=0?(T.dark?"#4ade80":"#166534"):(T.dark?"#f87171":"#dc2626"),fontWeight:500}}>{n>=0?"+":""}{n.toFixed(1)}%</span>;})()}</div>             <div style={td}>{mosStyle?<span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:mosStyle.bg,color:mosStyle.color,fontWeight:600}}>{fmtMOS(mos)}</span>:"--"}</div>             <div style={td}>{target>0?parseFloat(target).toFixed(1)+"%":"--"}</div>             <div style={td}>{repWeight!==null?repWeight.toFixed(1)+"%":"--"}</div>             <div style={{...td,fontWeight:600,color:diff===null?"":diff<=-0.3?(T.dark?"#f87171":"#dc2626"):diff>=0.5?(T.dark?"#4ade80":"#166534"):T.textSec}}>{diff!==null?(diff>0?"+":"")+diff+"%":"--"}</div>           </div>);         })} {(function(){   var cashShares=Object.entries(portRep).filter(function(e){return e[0]==="CASH";}).reduce(function(s,e){return s+e[1];},0);   var divShares=Object.entries(portRep).filter(function(e){return e[0]==="DIVACC";}).reduce(function(s,e){return s+e[1];},0);   var specialRows=[];   if(cashShares>0)specialRows.push({label:"CASH",mv:cashShares,target:parseFloat((specialWeights["CASH"]||{})[portTab])||0});   if(divShares>0)specialRows.push({label:"DIVACC",mv:divShares,target:parseFloat((specialWeights["DIVACC"]||{})[portTab])||0});   return specialRows.map(function(r){     var repWeight=totalMV>0?Math.round(r.mv/totalMV*10000)/100:null;     var td={display:"table-cell",verticalAlign:"middle",paddingRight:12,paddingTop:6,paddingBottom:6,fontSize:13,color:T.text,background:T.bgSec};     return(<div key={r.label} style={{display:"table-row"}}>       <div style={{...td,fontWeight:500}}>{r.label}</div>       <div style={td}>--</div>       <div style={td}>--</div>       <div style={td}>--</div>       <div style={td}>--</div>       <div style={td}>--</div>       <div style={td}>{r.target>0?parseFloat(r.target).toFixed(1)+"%":"--"}</div>       <div style={td}>{repWeight!==null?repWeight.toFixed(1)+"%":"--"}</div>       <div style={{...td,fontWeight:600,color:repWeight!==null&&r.target>0?(repWeight-r.target<=-0.3?(T.dark?"#f87171":"#dc2626"):repWeight-r.target>=0.5?(T.dark?"#4ade80":"#166534"):T.textSec):T.textSec}}>{repWeight!==null&&r.target>0?(repWeight-r.target>0?"+":"")+Math.round((repWeight-r.target)*100)/100+"%":"--"}</div>     </div>);   }); })()} {totalMV>0&&(function(){var totalTarget=0;var totalRep=0;portCos.forEach(function(c){var t=parseFloat((c.portWeights||{})[portTab])||0;totalTarget+=t;var repMV=0;(c.tickers||[]).forEach(function(t2){var tk=(t2.ticker||"").toUpperCase();var shares=(repData[portTab]||{})[tk];if(shares&&t2.price){var ccy=(t2.currency||"USD").toUpperCase();var fx=ccy==="USD"?1:(fxRates[ccy]||0);if(fx>0)repMV+=shares*parseFloat(t2.price)*fx;}});totalRep+=totalMV>0&&repMV>0?Math.round(repMV/totalMV*1000)/10:0;});var cashShares=Object.entries(repData[portTab]||{}).filter(function(e){return e[0]==="CASH";}).reduce(function(s,e){return s+e[1];},0);var divShares=Object.entries(repData[portTab]||{}).filter(function(e){return e[0]==="DIVACC";}).reduce(function(s,e){return s+e[1];},0);var cashTarget=parseFloat((specialWeights["CASH"]||{})[portTab])||0;var divTarget=parseFloat((specialWeights["DIVACC"]||{})[portTab])||0;totalTarget+=cashTarget+divTarget;var cashRep=totalMV>0?Math.round(cashShares/totalMV*1000)/10:0;var divRep=totalMV>0?Math.round(divShares/totalMV*1000)/10:0;totalRep+=cashRep+divRep;var td={display:"table-cell",verticalAlign:"middle",paddingRight:12,paddingTop:8,paddingBottom:8,fontSize:13,fontWeight:600,color:T.text,background:T.bg,borderTop:"2px solid "+T.border};return(<div style={{display:"table-row"}}><div style={{...td}}>TOTAL</div><div style={{...td}}>--</div><div style={{...td}}>--</div><div style={{...td}}>--</div><div style={{...td}}>--</div><div style={{...td}}>--</div><div style={{...td}}>{totalTarget>0?totalTarget.toFixed(1)+"%":"--"}</div><div style={{...td}}>{totalRep>0?totalRep.toFixed(1)+"%":"--"}</div><div style={{...td,color:Math.abs(totalRep-totalTarget)>1?"#dc2626":T.textSec}}>{totalTarget>0?(totalRep-totalTarget>0?"+":"")+Math.round((totalRep-totalTarget)*10)/10+"%":"--"}</div></div>);})()} </div></div>     </div>);   })()}   <div style={{marginTop:20,background:T.bgSec,borderRadius:8,border:"1px solid "+T.border,padding:"12px 14px",marginBottom:12}}>{(function(){var portRep2=repData[portTab]||{};var repTickers=Object.keys(portRep2).filter(function(t){return t!=="CASH"&&t!=="DIVACC";});var portCos2=companies.filter(function(c){return(c.portfolios||[]).indexOf(portTab)>=0;});var missingFromRep=portCos2.filter(function(c){var tks=(c.tickers||[]).map(function(t){return(t.ticker||"").toUpperCase();});return!tks.some(function(tk){return portRep2[tk]!==undefined;});});var missingFromApp=repTickers.filter(function(tk){return!portCos2.some(function(c){return(c.tickers||[]).some(function(t){return(t.ticker||"").toUpperCase()===tk;});});});if(missingFromRep.length===0&&missingFromApp.length===0)return<div style={{fontSize:12,color:T.textSec}}>✓ No discrepancies found.</div>;return(<div><div style={{fontSize:13,fontWeight:500,color:T.text,marginBottom:8}}>Discrepancies</div>{missingFromRep.length>0&&(<div style={{marginBottom:10}}><div style={{fontSize:11,color:T.textSec,marginBottom:4}}>In app but no rep position ({missingFromRep.length}):</div>{missingFromRep.map(function(c){return<span key={c.id} style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:T.bgTer,border:"1px solid "+T.border,color:T.text,marginRight:4,display:"inline-block",marginBottom:4}}>{c.name}</span>;})}</div>)}{missingFromApp.length>0&&(<div><div style={{fontSize:11,color:T.textSec,marginBottom:4}}>In rep account but no matching company ({missingFromApp.length}):</div>{missingFromApp.map(function(tk){return<span key={tk} style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:"#fef9c3",border:"1px solid #d97706",color:"#854d0e",marginRight:4,display:"inline-block",marginBottom:4}}>{tk}</span>;})}</div>)}</div>);})()}</div> <div style={{marginTop:12,background:T.bgSec,borderRadius:8,border:"1px solid "+T.border,padding:"12px 14px",marginBottom:12}}><div style={{fontSize:13,fontWeight:500,color:T.text,marginBottom:4}}>FX Rates</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Paste two columns: Pair (e.g. GBPUSD) and Rate. {Object.keys(fxRates).length>0&&Object.keys(fxRates).length+" currencies loaded."}</div><textarea value={fxText} onChange={function(e){setFxText(e.target.value);}} placeholder="GBPUSD  1.3463" rows={4} style={{width:"100%",resize:"vertical",fontSize:13,padding:"8px 10px",boxSizing:"border-box",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text,fontFamily:"inherit",lineHeight:1.6,marginBottom:8}}></textarea><button onClick={applyFxImport} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Load FX</button></div> <div style={{background:T.bgSec,borderRadius:8,border:"1px solid "+T.border,padding:"12px 14px"}}>     <div style={{fontSize:13,fontWeight:500,color:T.text,marginBottom:4}}>Upload rep account holdings</div>     <div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Paste three columns: Account Number, Ticker, Shares. Data is not saved between sessions.</div>     <textarea value={repText} onChange={function(e){setRepText(e.target.value);}} placeholder="LWGA0013  SHEL  1500" rows={5} style={{width:"100%",resize:"vertical",fontSize:13,padding:"8px 10px",boxSizing:"border-box",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text,fontFamily:"inherit",lineHeight:1.6,marginBottom:8}}></textarea><button onClick={applyRepImport} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Load</button></div></div>)}
     {tab==="calendar"&&(<div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}><div style={{fontSize:14,fontWeight:500,color:T.text}}>Upcoming Earnings — Next 30 Days</div><div style={{display:"flex",gap:6}}>{["All","Own","Focus","Watch","Sold"].map(function(s){var active=calFilter===s;var cfg={All:{bg:T.bgSec,color:T.textSec},Own:{bg:"#dcfce7",color:"#166534"},Focus:{bg:"#dbeafe",color:"#1e40af"},Watch:{bg:"#fef9c3",color:"#854d0e"},Sold:{bg:"#fee2e2",color:"#991b1b"}}[s];return <span key={s} onClick={function(){setCalFilter(s);}} style={{fontSize:11,padding:"3px 10px",borderRadius:99,cursor:"pointer",fontWeight:active?600:400,border:"1px solid "+(active?cfg.color:T.border),background:active?cfg.bg:T.bg,color:active?cfg.color:T.textSec}}>{s}</span>;})}</div></div><EarningsCalendar companies={calFilter==="All"?companies:companies.filter(function(c){return c.status===calFilter;})} T={T}></EarningsCalendar><div style={{background:T.bgSec,borderRadius:8,border:"1px solid "+T.border,padding:"12px 14px",marginBottom:16}}><div style={{fontSize:13,fontWeight:500,color:T.text,marginBottom:4}}>Bulk import earnings dates</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Paste two columns: Ticker and Date. One per line.</div>{calLastUpdated&&<div style={{fontSize:11,color:T.textSec,marginTop:4}}>Last imported by {calLastUpdatedBy} at {calLastUpdated}</div>}<textarea value={calImportText||""} onChange={function(e){setCalImportText(e.target.value);}} placeholder="AAPL  2026-05-01" rows={5} style={{width:"100%",resize:"vertical",fontSize:13,padding:"8px 10px",boxSizing:"border-box",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text,fontFamily:"inherit",lineHeight:1.6,marginBottom:8}}></textarea><button onClick={applyCalImport} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Import</button></div></div>)}
      {tab==="dashboard"&&(<div><div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",borderBottom:"1px solid "+T.border,paddingBottom:10}}>          {[["overview","Overview"],["sectors","Sector Breakdown"],["countries","Country Breakdown"],["overlap","Portfolio Overlap"],["quality","Data Quality"]].map(function(item){return <button key={item[0]} style={TABST(dashSubTab===item[0])} onClick={function(){setDashSubTab(item[0]);}}>{item[1]}</button>;})}
        </div>
        {dashSubTab==="overview"&&(<div><div style={{fontSize:13,fontWeight:500,marginBottom:12,color:T.text}}>Portfolio Overview</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:10}}>{portStats.map(function(s){return(<div key={s.port} style={{...CARD,marginBottom:0}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:13,fontWeight:600,color:T.text}}>{s.port}</span><span style={PILL({marginLeft:"auto"})}>{s.total} cos</span></div><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>{Object.entries(s.byStatus).filter(function(e){return e[1]>0;}).map(function(e){var cfg={"Own":{bg:"#dcfce7",color:"#166534"},"Focus":{bg:"#dbeafe",color:"#1e40af"},"Watch":{bg:"#fef9c3",color:"#854d0e"},"Sold":{bg:"#fee2e2",color:"#991b1b"}}[e[0]]||{bg:"#f1f5f9",color:"#6b7280"};return <span key={e[0]} style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:cfg.bg,color:cfg.color,fontWeight:500}}>{e[0]}: {e[1]}</span>;})}</div>{s.top3.length>0&&<div style={{fontSize:11,lineHeight:1.8}}>{s.top3.map(function(e,i){var ss=sectorStyle(e[0]);return <div key={i} style={{color:ss.color}}>{i+1}. {e[0]} ({e[1]})</div>;})}</div>}</div>);})}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>{portStats.filter(function(s){return s.regionList.length>0;}).map(function(s){return(<div key={s.port} style={{...CARD,marginBottom:0}}><div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:6}}>{s.port}</div><div style={{fontSize:11,lineHeight:1.9}}>{s.regionList.map(function(e){return <div key={e[0]} style={{color:REGION_COLORS[e[0]]||"#334155"}}>{e[0]} ({e[1]})</div>;})}</div></div>);})}</div></div>)}
        {(dashSubTab==="sectors"||dashSubTab==="countries")&&(<div><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>{["All"].concat(PORTFOLIOS.filter(function(p){return portStats.some(function(s){return s.port===p;});})).map(function(p){return <button key={p} style={TABST(dashPort===p)} onClick={function(){setDashPort(p);}}>{p}</button>;})}</div>{dashSubTab==="sectors"&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{dashSectors.map(function(s){var ss=sectorStyle(s.sector);return <BarRow key={s.sector} label={s.sector} clr={ss.color} own={s.own} focus={s.focus} watch={s.watch} max={sectorMax} T={T}/>;})}</div>}{dashSubTab==="countries"&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{dashCountryEntries.map(function(e){var g=COUNTRY_GROUPS[e[0]];var clr=g?COUNTRY_COLORS[g].color:"#334155";return <BarRow key={e[0]} label={e[0]} clr={clr} own={e[1].own} focus={e[1].focus} watch={e[1].watch} max={dashCountryMax} T={T}/>;})}</div>}</div>)}
        {dashSubTab==="overlap"&&(<div><div style={{fontSize:13,fontWeight:500,marginBottom:12,color:T.text}}>Portfolio Overlap</div><OverlapMatrix companies={companies} T={T}/></div>)}
        {dashSubTab==="quality"&&(<div><div style={{fontSize:13,fontWeight:500,marginBottom:12,color:T.text}}>Data Quality</div><div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>{[{label:"Missing country",count:companies.filter(function(c){return !c.country;}).length},{label:"Missing sector",count:companies.filter(function(c){return !c.sector;}).length},{label:"Missing tier",count:companies.filter(function(c){return !c.tier;}).length},{label:"No template",count:companies.filter(function(c){return !Object.keys(c.sections||{}).length;}).length},{label:"Not reviewed 30d+",count:companies.filter(function(c){return daysSince(c.lastReviewed)>30;}).length},{label:"Not reviewed 60d+",count:companies.filter(function(c){return daysSince(c.lastReviewed)>60;}).length},{label:"Watch stale 90d+",count:staleWatchCount}].map(function(item){return(<div key={item.label} style={{...CARD,marginBottom:0,minWidth:140,flex:1}}><div style={{fontSize:20,fontWeight:600,color:item.count>0?T.textWarn:T.textSuccess}}>{item.count}</div><div style={{fontSize:12,color:T.textSec}}>{item.label}</div></div>);})}</div><div style={{fontSize:13,fontWeight:500,marginBottom:10,color:T.text}}>Stale companies (60d+ since review)</div>{companies.filter(function(c){return daysSince(c.lastReviewed)>60;}).sort(function(a,b){return daysSince(b.lastReviewed)-daysSince(a.lastReviewed);}).map(function(c){var d=daysSince(c.lastReviewed);return(<div key={c.id} style={{...CARD,marginBottom:6,display:"flex",gap:10,alignItems:"center",cursor:"pointer"}} onClick={function(){setSelCo(c);setTab("companies");setCoView("upload");}}><span style={{fontSize:13,fontWeight:500,color:T.text,flex:1}}>{c.name}</span>{c.ticker&&<span style={PILL()}>{c.ticker}</span>}{c.status&&<StatusPill status={c.status}/>}<span style={{fontSize:11,color:d>90?"#dc2626":d>60?"#d97706":"#ca8a04",fontWeight:600}}>{d===Infinity?"never":d+"d ago"}</span></div>);})}</div>)}
      </div>)}

      {tab==="companies"&&!selCo&&(<div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:6,alignItems:"center"}}>
          <input ref={searchRef} value={coSearch} onChange={function(e){setCoSearch(e.target.value);}} placeholder="Search... (/ to focus)" style={{...INP,flex:1,minWidth:120,fontSize:12,padding:"4px 8px"}}/>
          <select value={coSort} onChange={function(e){var v=e.target.value;setCoSort(v);setCoSortDir(v==="Last Reviewed"?"desc":"asc");}} style={{...INP,fontSize:12,padding:"4px 8px"}}>{CO_SORTS.map(function(s){return <option key={s}>{s}</option>;})}</select>
          <select value={coFilter} onChange={function(e){setCoFilter(e.target.value);}} style={{...INP,fontSize:12,padding:"4px 8px"}}><option value="All">All portfolios</option>{PORTFOLIOS.map(function(p){return <option key={p} value={p}>{p}</option>;})}</select>
          <select value={coFilterCountry} onChange={function(e){setCoFilterCountry(e.target.value);}} style={{...INP,fontSize:12,padding:"4px 8px"}}><option value="All">All countries</option>{usedCountries.map(function(c){return <option key={c} value={c}>{c}</option>;})}</select>
          <select value={coFilterSector} onChange={function(e){setCoFilterSector(e.target.value);}} style={{...INP,fontSize:12,padding:"4px 8px"}}><option value="All">All sectors</option>{usedSectors.map(function(s){return <option key={s} value={s}>{s}</option>;})}</select>
          <span style={{fontSize:12,color:T.textSec}}>{displayedCos.length}/{companies.length}</span>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:T.textSec}}>Status:</span>
          {["All","Own","Focus","Watch","Sold"].map(function(s){var active=coStatusFilter===s;var cfg={All:{bg:T.bgSec,color:T.textSec},Own:{bg:"#dcfce7",color:"#166534"},Focus:{bg:"#dbeafe",color:"#1e40af"},Watch:{bg:"#fef9c3",color:"#854d0e"},Sold:{bg:"#fee2e2",color:"#991b1b"}}[s];return <span key={s} onClick={function(){setCoStatusFilter(s);}} style={{fontSize:11,padding:"3px 10px",borderRadius:99,cursor:"pointer",fontWeight:active?600:400,border:"1px solid "+(active?cfg.color:T.border),background:active?cfg.bg:T.bg,color:active?cfg.color:T.textSec}}>{s}</span>;})}
          <div style={{marginLeft:"auto",position:"relative"}}><button onClick={function(){setShowColPicker(function(s){return !s;});}} style={{fontSize:11,padding:"3px 10px"}}>Columns ▾</button>{showColPicker&&<div style={{position:"absolute",right:0,top:"calc(100% + 4px)",zIndex:100,background:T.bg,border:"1px solid "+T.border,borderRadius:8,padding:"10px 14px",boxShadow:"0 4px 16px rgba(0,0,0,0.12)",minWidth:160}}>{ALL_COLS.map(function(col){var on=visibleCols.has(col);return(<div key={col} onClick={function(){setVisibleCols(function(prev){var n=new Set(prev);on?n.delete(col):n.add(col);return n;});}} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",cursor:"pointer",fontSize:12,color:T.text}}><div style={{width:14,height:14,borderRadius:3,border:"1px solid "+(on?T.textInfo:T.border),background:on?"#dbeafe":"transparent",flexShrink:0}}/>{col}</div>);})}</div>}</div>
        </div>
        {selectedIds.size>0&&(<div style={{...CARD,marginBottom:8,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",background:"#dbeafe",border:"1px solid #93c5fd"}}><span style={{fontSize:12,fontWeight:500,color:"#1e40af"}}>{selectedIds.size} selected</span><select value={bulkStatus} onChange={function(e){setBulkStatus(e.target.value);}} style={{...INP,fontSize:12,padding:"3px 8px"}}><option value="">Set status…</option><option>Own</option><option>Focus</option><option>Watch</option><option>Sold</option></select><select value={bulkTier} onChange={function(e){setBulkTier(e.target.value);}} style={{...INP,fontSize:12,padding:"3px 8px"}}><option value="">Set tier…</option>{TIER_ORDER.map(function(t){return <option key={t}>{t}</option>;})}</select><button onClick={applyBulkEdit} disabled={!bulkStatus&&!bulkTier} style={{fontSize:12,padding:"4px 12px",fontWeight:500}}>Apply</button><span onClick={clearSelected} style={{fontSize:12,color:"#1e40af",cursor:"pointer"}}>Clear</span><span onClick={selectAll} style={{fontSize:12,color:"#1e40af",cursor:"pointer"}}>Select all ({displayedCos.length})</span></div>)}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,justifyContent:"flex-end",alignItems:"center"}}>
          {confirmClear?(<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:12,color:T.textDanger}}>Delete all {companies.length}?</span><button onClick={async function(){setCompanies([]);try{await supaUpsert("companies",{id:"shared",data:"[]"});}catch(e){}setConfirmClear(false);}} style={{fontSize:12,padding:"4px 10px",color:T.textDanger}}>Yes</button><span onClick={function(){setConfirmClear(false);}} style={LNK}>Cancel</span></div>):<button onClick={function(){setConfirmClear(true);}} style={{fontSize:12,padding:"6px 10px",color:T.textDanger}}>Clear all</button>}
          <button onClick={exportCSV} style={{fontSize:12,padding:"6px 10px"}}>⬇ CSV</button>
          <button onClick={findDupes} style={{fontSize:12,padding:"6px 10px"}}>Dedupe</button>
          <button onClick={function(){setShowBulk(function(s){return !s;});setShowNew(false);setShowPriceImport(false);}} style={{fontSize:12,padding:"6px 10px"}}>Bulk import</button>
          <button onClick={function(){setShowNew(function(s){return !s;});setShowBulk(false);setShowPriceImport(false);}} style={{fontSize:12,padding:"6px 10px"}}>+ New</button>
        </div>
        {showPriceImport&&(<div style={{...CARD,marginBottom:10}}><div style={{fontSize:13,fontWeight:500,marginBottom:4,color:T.text}}>Bulk price update</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Paste columns: Company Name, Ord Ticker, Ord Price, ADR Ticker (optional), ADR Price (optional).</div><textarea value={priceImportText} onChange={function(e){setPriceImportText(e.target.value);}} placeholder={"AAPL\t182.50\n..."} style={{...TA(100),fontFamily:"monospace",marginBottom:8}}/><div style={{display:"flex",gap:8}}><button onClick={applyPriceImport} disabled={!priceImportText.trim()} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Apply</button><span onClick={function(){setShowPriceImport(false);setPriceImportText("");}} style={LNK}>Cancel</span></div></div>)}
        {showDedupe&&(<div style={{...CARD,marginBottom:10}}>{dupeGroups.length===0?<div style={{fontSize:13,color:T.textSuccess}}>✓ No duplicates found.</div>:(<><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div style={{fontSize:13,fontWeight:500,color:T.text}}>Found {dupeGroups.length} dupe group(s)</div><span onClick={function(){setShowDedupe(false);}} style={LNK}>Cancel</span></div><div style={{maxHeight:280,overflowY:"auto",marginBottom:10,display:"flex",flexDirection:"column",gap:8}}>{dupeGroups.map(function(g){var gKey=(g[0].ticker||g[0].name||"").toUpperCase();return(<div key={gKey} style={{border:"1px solid "+T.border,borderRadius:6,overflow:"hidden"}}><div style={{padding:"5px 10px",background:T.bgSec,fontSize:11,fontWeight:500,color:T.textSec,textTransform:"uppercase"}}>{gKey}</div>{g.map(function(c){var isKeep=dupeKeep[gKey]===c.id;return(<div key={c.id} onClick={function(){setDupeKeep(function(k){return Object.assign({},k,{[gKey]:c.id});});}} style={{padding:"7px 12px",display:"flex",gap:10,alignItems:"center",cursor:"pointer",background:isKeep?"#dcfce7":"transparent",borderTop:"1px solid "+T.border}}><div style={{width:14,height:14,borderRadius:"50%",border:"2px solid "+(isKeep?"#16a34a":T.borderSec),background:isKeep?"#16a34a":"transparent",flexShrink:0}}/><span style={{fontSize:13,fontWeight:500,color:T.text,flex:1}}>{c.name}</span><span style={PILL()}>{c.tier||"no tier"}</span>{c.status&&<span style={PILL()}>{c.status}</span>}</div>);})}</div>);})}</div><button onClick={applyDedupe} style={{fontSize:12,padding:"6px 14px",color:T.textDanger}}>Remove duplicates</button></>)}</div>)}
        {showRestore&&(<div style={{...CARD,marginBottom:10}}><textarea value={restoreText} onChange={function(e){setRestoreText(e.target.value);}} placeholder="Paste JSON backup..." style={{...TA(80),fontFamily:"monospace",marginBottom:8}}/><div style={{display:"flex",gap:8}}><button onClick={function(){try{var d=JSON.parse(restoreText);if(Array.isArray(d)){setCompanies(d);setShowRestore(false);setRestoreText("");}else alert("Invalid.");}catch(e){alert("Bad JSON.");}}} disabled={!restoreText.trim()} style={{fontSize:12,padding:"6px 12px",fontWeight:500}}>Restore</button><span onClick={function(){setShowRestore(false);}} style={LNK}>Cancel</span></div></div>)}
        {showBulk&&(<div style={{...CARD,marginBottom:10}}><div style={{fontSize:13,fontWeight:500,marginBottom:4,color:T.text}}>Bulk import</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Paste CSV/TSV from Excel.</div><textarea value={bulkText} onChange={function(e){setBulkText(e.target.value);setBulkPreview(null);}} onPaste={function(){setTimeout(function(){var b=document.getElementById("parse-btn");if(b)b.click();},100);}} placeholder="Paste CSV here..." style={{...TA(120),fontFamily:"monospace",marginBottom:8}}/>{!bulkPreview&&<button id="parse-btn" onClick={parseBulk} disabled={bulkLoading||!bulkText.trim()} style={{fontSize:12,padding:"6px 12px",fontWeight:500,marginBottom:8}}>{bulkLoading?"Parsing...":"Parse"}</button>}{bulkPreview&&(<div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Parsed {bulkPreview.length} companies</div><div style={{maxHeight:200,overflowY:"auto",marginBottom:10,display:"flex",flexDirection:"column",gap:3}}>{bulkPreview.map(function(c,i){return(<div key={i} style={{padding:"5px 10px",background:T.bg,borderRadius:6,border:"1px solid "+T.border,fontSize:12,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><span style={{fontWeight:500,minWidth:100,color:T.text}}>{c.name}</span><span style={PILL()}>{c.ticker}</span>{c.tier&&<span style={PILL()}>{c.tier}</span>}{(c.portfolios||[]).map(function(p){return <span key={p} style={PILL({background:"#1a5c2a",color:"#fff",border:"none"})}>{p}</span>;})}{c.status&&<span style={PILL()}>{c.status}</span>}</div>);})}</div><div style={{display:"flex",gap:8}}><button onClick={function(){confirmBulk("merge");}} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Merge</button><button onClick={function(){confirmBulk("replace");}} style={{fontSize:12,padding:"6px 14px"}}>Replace all</button><span onClick={function(){setBulkPreview(null);setBulkText("");}} style={LNK}>Clear</span><span onClick={function(){setShowBulk(false);}} style={LNK}>Cancel</span></div></div>)}</div>)}
        {showNew&&(<div style={{...CARD,marginBottom:10}}><div style={{display:"flex",gap:8,marginBottom:10}}><div style={{flex:2}}><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:3}}>Company name</label><input value={newName} onChange={function(e){setNewName(e.target.value);}} style={{...INP,width:"100%",boxSizing:"border-box"}}/></div><div style={{flex:1}}><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:3}}>Ticker</label><input value={newTicker} onChange={function(e){setNewTicker(e.target.value);}} style={{...INP,width:"100%",boxSizing:"border-box"}}/></div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}><div><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:3}}>Tier</label><select value={newFields.tier||""} onChange={function(e){setNewFields(function(p){return{...p,tier:e.target.value};});}} style={{...INP,width:"100%"}}><option value="">--</option>{TIER_ORDER.map(function(t){return <option key={t}>{t}</option>;})}</select></div><div><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:3}}>Sector</label><select value={newFields.sector||""} onChange={function(e){setNewFields(function(p){return{...p,sector:e.target.value};});}} style={{...INP,width:"100%"}}><option value="">--</option>{SECTOR_ORDER.map(function(s){return <option key={s}>{s}</option>;})}</select></div><div><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:3}}>Country</label><select value={newFields.country||""} onChange={function(e){setNewFields(function(p){return{...p,country:e.target.value};});}} style={{...INP,width:"100%"}}><option value="">--</option>{COUNTRY_ORDER.map(function(c){return <option key={c}>{c}</option>;})}</select></div><div><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:3}}>Action</label><select value={newFields.action||""} onChange={function(e){setNewFields(function(p){return{...p,action:e.target.value};});}} style={{...INP,width:"100%"}}><option value="">--</option><option>Increase TP</option><option>Decrease TP</option><option>No Action</option></select></div></div><div><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:4}}>Portfolio(s)</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{PORTFOLIOS.map(function(p){var sel=(newFields.portfolios||[]).indexOf(p)>=0;return <span key={p} onClick={function(){setNewFields(function(ps){return{...ps,portfolios:sel?(ps.portfolios||[]).filter(function(x){return x!==p;}):(ps.portfolios||[]).concat([p])};});}} style={TAGBTN(sel)}>{p}</span>;})}</div></div><div style={{display:"flex",gap:8,marginTop:12}}><button onClick={addCompany} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Create</button><span onClick={function(){setShowNew(false);}} style={LNK}>Cancel</span></div></div>)}

        {companies.length===0?<p style={{fontSize:14,color:T.textSec}}>No companies yet.</p>:(
          <div style={{overflowX:"auto"}}><div style={{display:"table",width:"100%",borderCollapse:"separate",borderSpacing:"0 2px"}}>
            <div style={{display:"table-row"}}>
              <div style={{display:"table-cell",paddingBottom:4,paddingRight:6}}><input type="checkbox" checked={selectedIds.size===displayedCos.length&&displayedCos.length>0} onChange={function(e){e.target.checked?selectAll():clearSelected();}} style={{cursor:"pointer"}}/></div>
              {HEADER_COLS.filter(function(col){return col.label===""||visibleCols.has(col.label);}).map(function(col,i){var cs=col.sort;var active=cs&&coSort===cs;var arrow=active?(coSortDir==="asc"?" ↑":" ↓"):"";return(<div key={i} onClick={cs?function(){handleSortClick(cs);}:undefined} style={{display:"table-cell",fontSize:10,color:active?T.text:T.textSec,textTransform:"uppercase",letterSpacing:"0.05em",paddingBottom:4,paddingRight:10,whiteSpace:"nowrap",cursor:cs?"pointer":"default",userSelect:"none",fontWeight:active?600:400}}>{col.label}{arrow}</div>);})}
            </div>
            {displayedCos.map(function(c,i){return <CoRow key={c.id+"-"+i} company={c} compact={compact} visibleCols={visibleCols} selected={selectedIds.has(c.id)} onToggleSelect={toggleSelect} T={T} onSelect={function(co){setSelCo(co);setCoView("section:Valuation");setTmplHighlight("");setFlashSections({});}} onDelete={function(id){setCompanies(function(cs){return cs.filter(function(c){return c.id!==id;});});}} onUpdate={updateCo} onQuickUpload={function(c){setQuickUploadCo(c);}}/>;  })}
          </div></div>
        )}
      </div>)}

      {tab==="companies"&&selCo&&(function(){
        var currency=getCurrency(selCo.country);var pv=pendingVal||selCo.valuation||{};var activeCurrency=pv.currency||currency;
        var normEPS=calcNormEPS(pv);var eps=normEPS!==null?normEPS:parseFloat(pv.eps);
        var tp=calcTP(pv.pe,eps);var mos=calcMOS(tp,pv.price);var mosStyle=mosBg(mos);
        var hist=selCo.tpHistory||[];var portfolios=selCo.portfolios||[];var portWeights=selCo.portWeights||{};
        var earningsEntries=selCo.earningsEntries||[];
        return(<div>
          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <button onClick={function(){setSelCo(null);setPendingVal(null);}} style={{fontSize:13,padding:"4px 10px"}}>← Back</button>
            <span style={{fontSize:15,fontWeight:500,color:T.text}}>{selCo.name}</span>
            {(selCo.tickers||[]).filter(function(t){return t.price;}).map(function(t){return <span key={t.ticker} style={{fontSize:12,padding:"2px 10px",borderRadius:99,background:T.bgSec,border:"1px solid "+T.border,color:T.text}}>{t.ticker}: {t.currency||""} {fmtPrice(t.price)}</span>;})}
            {selCo.country&&(function(){var cs=countryStyle(selCo.country);return <span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:cs.bg,color:cs.color,fontWeight:500}}>{selCo.country}</span>;}())}
            {selCo.sector&&(function(){var ss=sectorStyle(selCo.sector);return <span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:ss.bg,color:ss.color,fontWeight:500}}>{selCo.sector}</span>;}())}
            {portfolios.map(function(p){return <span key={p} style={PILL({background:"#1a5c2a",color:"#fff",border:"none"})}>{p}</span>;})}
            {selCo.status&&<StatusPill status={selCo.status}/>}
            {tp!==null&&<span style={{fontSize:12,padding:"2px 10px",borderRadius:99,background:"#dcfce7",color:"#166534",fontWeight:600}}>TP: {fmtTP(tp,activeCurrency)}</span>}
            {mosStyle&&<span style={{fontSize:12,padding:"2px 10px",borderRadius:99,background:mosStyle.bg,color:mosStyle.color,fontWeight:600}}>MOS: {fmtMOS(mos)}</span>}
          </div>
          {/* Tabs */}
          <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
            {coTabs.map(function(t){return <button key={t.id} style={TABSM(coView===t.id)} onClick={function(){setCoView(t.id);}}>{t.label}</button>;})}
          </div>

          {/* TEMPLATE TAB */}
          {coView==="template"&&(<div>
            {/* Portfolio weights card at top */}
            {portfolios.length>0&&(<div style={{...CARD,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:500,color:T.textSec,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Target Weights</div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                {portfolios.map(function(p){return(<div key={p} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,fontWeight:500,color:T.text,minWidth:28}}>{p}</span><input type="number" step="0.1" min="0" max="100" value={portWeights[p]||""} onChange={function(e){var nw=Object.assign({},portWeights,{[p]:e.target.value});var u=Object.assign({},selCo,{portWeights:nw});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} placeholder="0.0" style={{...INP,width:65,fontSize:12}}/><span style={{fontSize:11,color:T.textSec}}>%</span></div>);})}
              </div>
            </div>)}
            {Object.keys(selCo.sections||{}).length===0?(
              <div style={{...CARD,border:"1px dashed "+T.border}}>
                <div style={{fontSize:13,color:T.textSec,marginBottom:8}}>No template yet.</div>
                <textarea value={tmplRaw} onChange={function(e){setTmplRaw(e.target.value);}} placeholder="Paste company template here..." style={{...TA(120),marginBottom:8}}/>
                <button onClick={importTemplate} disabled={tmplLoading||!tmplRaw.trim()} style={{fontSize:12,padding:"6px 12px",fontWeight:500}}>{tmplLoading?"Importing...":"Import template"}</button>
              </div>
            ):(
              <div>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
                  <input value={tmplSearch} onChange={function(e){setTmplSearch(e.target.value);setTmplHighlight(e.target.value);}} placeholder="Search within template..." style={{...INP,flex:1,fontSize:12,padding:"4px 8px"}}/>
                  {tmplSearch&&<span onClick={function(){setTmplSearch("");setTmplHighlight("");}} style={LNK}>Clear</span>}
                  <span style={{fontSize:12,color:T.textSec}}>{selCo.lastUpdated?"Updated: "+selCo.lastUpdated:""}</span> <button onClick={function(){exportCompanyPDF(selCo);}} style={{fontSize:11,padding:"3px 10px",marginLeft:"auto"}}>⬇ PDF</button>
                  <span onClick={function(){
                    if(window.confirm("Clear all sections and re-import?")){
                      var u=Object.assign({},selCo,{sections:{},lastUpdated:null});
                      setSelCo(u);
                      setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});
                      setTmplRaw("");
                      setCoView("section:Valuation");
                    }
                  }} style={{...LNK,color:T.textDanger}}>↺ Clear &amp; re-import</span>
                  <span onClick={function(){downloadMD(selCo.name,TEMPLATE_SECTIONS.map(function(s){return"## "+s+"\n"+((selCo.sections&&selCo.sections[s])||"");}).join("\n\n"));}} style={LNK}>⬇ .md</span>
                </div>
                <details style={{marginBottom:12}}>
                  <summary style={{fontSize:12,color:T.textSec,cursor:"pointer",marginBottom:6}}>↑ Paste more content to fill missing sections</summary>
                  <textarea value={tmplRaw} onChange={function(e){setTmplRaw(e.target.value);}} placeholder="Paste additional content — only fills empty sections..." style={{...TA(80),marginBottom:8}}/>
                  <button onClick={importTemplate} disabled={tmplLoading||!tmplRaw.trim()} style={{fontSize:12,padding:"6px 12px",fontWeight:500}}>{tmplLoading?"Importing...":"Import"}</button>
                </details>
                {TEMPLATE_SECTIONS.map(function(s){return <SectionBlock key={s} title={s} content={selCo.sections&&selCo.sections[s]} highlight={tmplHighlight} flashKey={flashSections[s]} T={T}/>;  })}
              </div>
            )}
          </div>)}

          {/* SECTION TABS */}
          {coView.startsWith("section:")&&(function(){
            var sectionName=coView.replace("section:","");var isValuation=sectionName==="Valuation";var isOverview=sectionName==="Overview";
            return(<div>
              {isOverview&&(<div style={{marginBottom:16}}><div style={{fontSize:12,fontWeight:500,color:T.textSec,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Tickers & Prices</div><div style={{fontSize:11,color:T.textSec,marginBottom:8}}>Add all tickers for this security. Mark the ordinary share used for TP/MOS.</div>{(function(){var co=companies.find(function(c){return c.id===selCo.id;})||selCo;var tickers=co.tickers||(co.ticker?[{ticker:co.ticker,price:(co.valuation&&co.valuation.price)||"",currency:(co.valuation&&co.valuation.currency)||getCurrency(co.country),isOrdinary:true}]:[{ticker:"",price:"",currency:"",isOrdinary:true}]);return tickers.map(function(t,i){function updTicker(patch){var nt=tickers.slice();nt[i]=Object.assign({},nt[i],patch);var u=Object.assign({},selCo,{tickers:nt});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}return(<div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}><input value={t.ticker||""} onChange={function(e){updTicker({ticker:e.target.value.toUpperCase()});}} placeholder="Ticker" style={{fontSize:12,padding:"4px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg,color:T.text,width:90}}/><input value={t.price?fmtPrice(t.price):""} onChange={function(e){updTicker({price:e.target.value.replace(/,/g,"")});}} placeholder="Price" style={{fontSize:12,padding:"4px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg,color:T.text,width:90}}/><select value={t.currency||""} onChange={function(e){updTicker({currency:e.target.value});}} style={{fontSize:12,padding:"4px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg,color:T.text}}><option value="">CCY</option>{ALL_CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}</select><label style={{fontSize:11,color:T.textSec,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}><input type="radio" checked={!!t.isOrdinary} onChange={function(){var nt=tickers.map(function(x,j){return Object.assign({},x,{isOrdinary:j===i});});var u=Object.assign({},selCo,{tickers:nt});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}}/>Ordinary</label>{tickers.length>1&&<span onClick={function(){var nt=tickers.filter(function(_,j){return j!==i;});var u=Object.assign({},selCo,{tickers:nt});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} style={{fontSize:11,color:T.textDanger,cursor:"pointer"}}>×</span>}</div>);});})()}<button onClick={function(){var nt=(selCo.tickers||[]).concat([{ticker:"",price:"",currency:"",isOrdinary:false}]);var u=Object.assign({},selCo,{tickers:nt});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} style={{fontSize:11,padding:"3px 10px",marginTop:4}}>+ Add ticker</button></div>)} {isValuation&&(<div style={{marginBottom:24}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>Target Price</div>
                  {selCo.sections&&selCo.sections["Valuation"]&&(!pv.pe||!pv.eps1)&&(
                    <button onClick={async function(){
                      try{var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,system:"Extract valuation data. Return ONLY valid JSON with keys: pe (number), eps1 (number), eps2 (number), fy1 (string), fy2 (string), fyMonth (string like Dec). If not found use null. No markdown.",messages:[{role:"user",content:[{type:"text",text:selCo.sections["Valuation"]}]}]})});var data=await res.json();if(data.error){alert("Error");return;}var raw=(data.content||[]).map(function(b){return b.text||"";}).join("").replace(/```json|```/g,"").trim();var parsed=JSON.parse(raw);var patch={};if(parsed.pe!=null)patch.pe=String(parsed.pe);if(parsed.eps1!=null)patch.eps1=String(parsed.eps1);if(parsed.eps2!=null)patch.eps2=String(parsed.eps2);if(parsed.fy1)patch.fy1=parsed.fy1;if(parsed.fy2)patch.fy2=parsed.fy2;if(parsed.fyMonth)patch.fyMonth=parsed.fyMonth;if(!pv.w1)patch.w1="50";if(!pv.w2)patch.w2="50";setPendingVal(function(prev){return Object.assign({},prev,patch);});}catch(e){alert("Failed: "+e.message);}
                    }} style={{fontSize:12,padding:"4px 12px"}}>✨ Auto-fill from text</button>
                  )}
                </div>

                {/* 1. TP and MOS display */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                  <div style={{padding:"14px 16px",borderRadius:8,background:tp!==null?"#dcfce7":T.bgTer,border:"1px solid "+(tp!==null?"#86efac":T.border)}}>
                    <div style={{fontSize:11,color:T.textSec,marginBottom:2}}>Target Price{impliedFYLabel(pv)?" ("+impliedFYLabel(pv)+")":""}</div>
                    <div style={{fontSize:22,fontWeight:700,color:tp!==null?"#166534":T.textSec}}>{fmtTP(tp,activeCurrency)}</div>
                    {tp!==null&&<div style={{fontSize:11,color:T.textSec,marginTop:2}}>{pv.pe}x × {activeCurrency} {eps&&eps.toFixed?eps.toFixed(4):eps}</div>}
                  </div>
                  <div style={{padding:"14px 16px",borderRadius:8,background:mosStyle?mosStyle.bg:T.bgTer,border:"1px solid "+(mosStyle?"transparent":T.border)}}>
                    <div style={{fontSize:11,color:mosStyle?mosStyle.color:T.textSec,marginBottom:2}}>Margin of Safety</div>
                    <div style={{fontSize:22,fontWeight:700,color:mosStyle?mosStyle.color:T.textSec}}>{mos!==null?fmtMOS(mos):"--"}</div>
                    {mos!==null&&pv.price&&<div style={{fontSize:11,color:mosStyle?mosStyle.color:T.textSec,marginTop:2}}>Price: {activeCurrency} {fmtPrice(pv.price)}</div>}
                  </div>
                </div>
 {(pv.peLow5||pv.peHigh5||pv.peAvg5||pv.peMed5||true)&&<div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>{[["5Yr Low",pv.peLow5],["5Yr High",pv.peHigh5],["5Yr Avg",pv.peAvg5],["5Yr Median",pv.peMed5]].map(function(item){return item[1]?(<div key={item[0]} style={{padding:"8px 14px",borderRadius:8,background:T.bgSec,border:"1px solid "+T.border,minWidth:80}}><div style={{fontSize:10,color:T.textSec,marginBottom:2}}>{item[0]} P/E</div><div style={{fontSize:16,fontWeight:600,color:T.text}}>{item[1]}x</div></div>):null;})}</div>}
                {/* 2. Price, P/E, currency, FY month */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:16}}>
                  <div><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:4}}>Current Price ({activeCurrency})</label><input type="number" step="0.01" value={pv.price||""} onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{price:e.target.value});});}} placeholder="e.g. 45.20" style={{...INP,width:"100%",boxSizing:"border-box"}}/></div>
                  <div><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:4}}>Target P/E</label><input type="number" step="0.1" value={pv.pe||""} onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{pe:e.target.value});});}} placeholder="e.g. 18.5" style={{...INP,width:"100%",boxSizing:"border-box"}}/></div>
                  <div><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:4}}>Fiscal Year End</label><select value={pv.fyMonth||""} onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{fyMonth:e.target.value});});}} style={{...INP,width:"100%"}}><option value="">-- Month</option>{MONTHS.map(function(m){return <option key={m}>{m}</option>;})}</select></div>
                  <div><label style={{fontSize:11,color:T.textSec,display:"block",marginBottom:4}}>Reporting Currency</label><select value={pv.currency||currency} onChange={function(e){setPendingVal(function(p){return Object.assign({},p,{currency:e.target.value});});}} style={{...INP,width:"100%"}}>{ALL_CURRENCIES.map(function(c){return <option key={c}>{c}</option>;})}</select></div>
                </div>

                {/* 3. EPS Inputs */}
                <div style={{...CARD,marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:500,color:T.textSec,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>EPS Inputs</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:12}}>
                    {[{fy:"fy1",eps:"eps1",w:"w1",label:"Year 1"},{fy:"fy2",eps:"eps2",w:"w2",label:"Year 2"}].map(function(item){return(
                      <div key={item.fy} style={{padding:"10px 12px",background:T.bgTer,borderRadius:6}}>
                        <div style={{fontSize:11,fontWeight:500,color:T.text,marginBottom:8}}>{item.label}</div>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:2}}>Fiscal Year</label><input value={pv[item.fy]||""} onChange={function(e){var p={};p[item.fy]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="e.g. FY2026E" style={{...INP,width:"100%",boxSizing:"border-box",fontSize:12}}/></div>
                          <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:2}}>EPS ({activeCurrency})</label><input type="number" step="0.01" value={pv[item.eps]||""} onChange={function(e){var p={};p[item.eps]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="e.g. 4.20" style={{...INP,width:"100%",boxSizing:"border-box",fontSize:12}}/></div>
                          <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:2}}>Weight %</label><input type="number" step="1" min="0" max="100" value={pv[item.w]||""} onChange={function(e){var p={};p[item.w]=e.target.value;setPendingVal(function(prev){return Object.assign({},prev,p);});}} placeholder="50" style={{...INP,width:"100%",boxSizing:"border-box",fontSize:12}}/></div>
                        </div>
                      </div>
                    );})}
                  </div>
                  {normEPS!==null&&<div style={{padding:"8px 12px",background:"#dbeafe",borderRadius:6,fontSize:12,color:"#1e40af"}}><span style={{fontWeight:600}}>Normalized EPS: {activeCurrency} {normEPS.toFixed(4)}</span><span style={{marginLeft:8,opacity:0.7}}>= ({pv.eps1||"?"}×{pv.w1||"?"}% + {pv.eps2||"?"}×{pv.w2||"?"}%) / 100</span></div>}
                </div>

                {/* Save */}
                <div style={{display:"flex",gap:8,marginBottom:20}}>
                  <button onClick={function(){commitValuation(selCo,pv);}} style={{fontSize:13,padding:"8px 20px",fontWeight:600,background:"#1e40af",color:"#fff",border:"none",borderRadius:6,cursor:"pointer"}}>Save valuation</button>
                  <button onClick={function(){setPendingVal(Object.assign({},selCo.valuation||{}));}} style={{fontSize:12,padding:"8px 14px"}}>Discard changes</button>
                </div>

                {/* 4. TP History */}
                {selCo.tpHistory&&selCo.tpHistory.length>0&&(<div style={{marginBottom:20}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:10}}>TP History</div>
                  <div style={{display:"table",width:"100%",fontSize:12}}>
                    <div style={{display:"table-row"}}>{["Date","Target Price","P/E","EPS","Years",""].map(function(h){return <div key={h} style={{display:"table-cell",padding:"4px 10px 8px 0",fontSize:10,textTransform:"uppercase",color:T.textSec,fontWeight:600}}>{h}</div>;})}</div>
                    {selCo.tpHistory.map(function(h,i){var isLatest=i===0;return(<div key={i} style={{display:"table-row"}}>
                      <div style={{display:"table-cell",padding:"7px 10px 7px 0",color:T.textSec,borderTop:"1px solid "+T.border}}>{h.date}</div>
                      <div style={{display:"table-cell",padding:"7px 10px 7px 0",fontWeight:600,color:isLatest?"#166534":T.text,borderTop:"1px solid "+T.border}}>{fmtTP(h.tp,h.currency||activeCurrency)}</div>
                      <div style={{display:"table-cell",padding:"7px 10px 7px 0",color:T.text,borderTop:"1px solid "+T.border}}>{h.pe?h.pe+"x":"--"}</div>
                      <div style={{display:"table-cell",padding:"7px 10px 7px 0",color:T.text,borderTop:"1px solid "+T.border}}>{h.eps?(h.currency||activeCurrency)+" "+h.eps:"--"}</div>
                      <div style={{display:"table-cell",padding:"7px 10px 7px 0",color:T.textSec,borderTop:"1px solid "+T.border}}>{h.fyLabel||h.forwardYear||"--"}</div>
                      <div style={{display:"table-cell",padding:"7px 0 7px 0",borderTop:"1px solid "+T.border}}><span onClick={function(){var u=Object.assign({},selCo,{tpHistory:selCo.tpHistory.filter(function(_,j){return j!==i;})});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} style={{fontSize:11,color:T.textDanger,cursor:"pointer"}}>×</span></div>
                    </div>);})}
                  </div>
                </div>)}
              </div>)}
              <SectionEditTab title={sectionName} content={selCo.sections&&selCo.sections[sectionName]} onSave={function(newContent){var ns=Object.assign({},selCo.sections,{[sectionName]:newContent});var u=Object.assign({},selCo,{sections:ns,lastUpdated:todayStr()});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} T={T}/>
            </div>);
          }())}

          {/* EARNINGS & THESIS CHECK TAB */}
          {coView==="earnings"&&(<div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:600,color:T.text}}>Earnings & Thesis Check</div>
              <button onClick={function(){var e=blankEarnings();var u=Object.assign({},selCo,{earningsEntries:[e].concat(earningsEntries)});setSelCo(u);setCompanies(function(cs){return cs.map(function(c){return c.id===u.id?u:c;});});}} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>+ Add earnings entry</button>
            </div>
            {earningsEntries.length===0&&<p style={{fontSize:13,color:T.textSec}}>No earnings entries yet. Click "+ Add earnings entry" to get started.</p>}
            {earningsEntries.map(function(entry){return(
              <EarningsEntry key={entry.id} entry={entry} currency={activeCurrency} valuation={selCo.valuation||{}} T={T}
                onSave={function(saved){saveEarningsEntry(selCo,saved);}}
                onDelete={function(){deleteEarningsEntry(selCo,entry.id);}}
              />
            );})}
          </div>)}

          {/* LINKED */}
          {coView==="linked"&&(<div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:13,color:T.textSec}}>{linkedEntries.length} linked entr{linkedEntries.length===1?"y":"ies"}</div><button onClick={function(){setLinkLibOpen(true);}} style={{fontSize:12,padding:"4px 12px"}}>+ Link entry</button></div>
            {linkLibOpen&&(<div style={{...CARD,marginBottom:10}}><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Select a library entry to tag with "{selCo.name}":</div><div style={{maxHeight:240,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>{saved.filter(function(s){return!(s.tags||[]).includes(selCo.name);}).map(function(s){return(<div key={s.id} onClick={function(){updEntry(s.id,{tags:(s.tags||[]).concat([selCo.name])});setLinkLibOpen(false);}} style={{padding:"7px 10px",borderRadius:6,border:"1px solid "+T.border,cursor:"pointer",fontSize:12,color:T.text,background:T.bg}} onMouseEnter={function(e){e.currentTarget.style.background=T.bgSec;}} onMouseLeave={function(e){e.currentTarget.style.background=T.bg;}}><span style={{fontWeight:500}}>{s.title}</span><span style={{color:T.textSec,marginLeft:8}}>{s.date}</span></div>);})}</div><span onClick={function(){setLinkLibOpen(false);}} style={{...LNK,display:"block",marginTop:8}}>Cancel</span></div>)}
            {linkedEntries.length===0?<p style={{fontSize:13,color:T.textSec}}>No library entries linked to {selCo.name}.</p>:linkedEntries.map(function(s){return(<div key={s.id} style={{...CARD,cursor:"pointer"}} onClick={function(){setTab("library");setExpanded(s.id);}}><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}><span style={{fontSize:13,fontWeight:500,color:T.text}}>{s.title}</span><span style={PILL()}>{s.format}</span>{getConf(s.result)&&<span style={{...PILL(),background:CONF_BG[getConf(s.result)],color:CONF_COLOR[getConf(s.result)],border:"none"}}>{getConf(s.result)}</span>}<span style={PILL({marginLeft:"auto"})}>{s.date}</span></div><p style={{fontSize:12,color:T.textSec,margin:0,lineHeight:1.5}}>{getCore(s.result)}</p></div>);})}
          </div>)}

          {/* UPLOAD */}
          {coView==="upload"&&(<div>
            <div style={{marginBottom:10}}><label style={{fontSize:12,color:T.textSec,display:"block",marginBottom:4}}>Research type</label><select value={upType} onChange={function(e){setUpType(e.target.value);}} style={INP}>{UPLOAD_TYPES.map(function(t){return <option key={t}>{t}</option>;})}</select></div>
            <textarea value={upText} onChange={function(e){setUpText(e.target.value);}} placeholder="Paste research content..." style={{...TA(130),marginBottom:8}}/>
            <button onClick={processUpload} disabled={upLoading||!upText.trim()} style={{width:"100%",padding:"10px",fontWeight:500}}>{upLoading?"Analyzing...":"Analyze and propose updates"}</button>
            {pendingDiff&&pendingMeta&&(<div style={{...CARD,marginTop:12}}><div style={{fontSize:13,marginBottom:8,color:T.text}} dangerouslySetInnerHTML={{__html:toHTML(pendingMeta.summary)}}/>{pendingDiff.length===0?<p style={{fontSize:13,color:T.textSec}}>No changes needed.</p>:<DiffView diff={pendingDiff} onAccept={acceptDiff} onReject={function(){setPendingDiff(null);setPendingMeta(null);}} T={T}/>}</div>)}
          </div>)}

          {/* LOG */}
          {coView==="history"&&(<div>{(selCo.updateLog||[]).length===0?<p style={{fontSize:13,color:T.textSec}}>No updates yet.</p>:(selCo.updateLog||[]).map(function(log,i){return(<div key={i} style={CARD}><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}><span style={PILL()}>{log.type}</span><span style={{fontSize:12,color:T.textSec}}>{log.date}</span><span style={{fontSize:12,color:T.textSec,marginLeft:"auto"}}>{log.changes.join(", ")}</span></div><p style={{fontSize:13,margin:0,lineHeight:1.5,color:T.text}}>{log.summary}</p></div>);})}</div>)}
        </div>);
      }())}

      {tab==="synthesize"&&(<div>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:150}}><label style={{fontSize:12,color:T.textSec,display:"block",marginBottom:4}}>Format</label><select value={format} onChange={function(e){setFormat(e.target.value);}} style={{width:"100%",...INP}}>{FORMATS.map(function(f){return <option key={f}>{f}</option>;})}</select></div>
          <div style={{flex:1,minWidth:130}}><label style={{fontSize:12,color:T.textSec,display:"block",marginBottom:4}}>Tone</label><select value={tone} onChange={function(e){setTone(e.target.value);}} style={{width:"100%",...INP}}>{TONES.map(function(t){return <option key={t}>{t}</option>;})}</select></div>
        </div>
        {format==="Custom"&&<textarea value={custom} onChange={function(e){setCustom(e.target.value);}} placeholder="Custom format..." style={{...TA(60),marginBottom:10}}/>}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><input type="checkbox" id="sl" checked={useSrc} onChange={function(e){setUseSrc(e.target.checked);}}/><label htmlFor="sl" style={{fontSize:13,color:T.textSec,cursor:"pointer"}}>Label sources separately</label></div>
        {useSrc?(<div style={{marginBottom:8}}>{sources.map(function(s,i){return(<div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"flex-start"}}><input value={s.label} onChange={function(e){var n=sources.slice();n[i]={...n[i],label:e.target.value};setSources(n);}} style={{...INP,width:100}}/><textarea value={s.text} onChange={function(e){var n=sources.slice();n[i]={...n[i],text:e.target.value};setSources(n);}} style={{...TA(60),flex:1}}/>{sources.length>1&&<span onClick={function(){setSources(sources.filter(function(_,j){return j!==i;}));}} style={{...LNK,paddingTop:8}}>×</span>}</div>);})} <button onClick={function(){setSources(sources.concat([{label:"Source "+(sources.length+1),text:""}]));}} style={{fontSize:12,padding:"4px 10px"}}>+ Add source</button></div>):(<textarea value={input} onChange={function(e){setInput(e.target.value);}} placeholder="Paste raw research..." style={{...TA(140),marginBottom:8}}/>)}
        <div style={{marginBottom:10}}><div style={{fontSize:12,color:T.textSec,marginBottom:6}}>Tags</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{PRESET_TAGS.map(function(t){return <span key={t} onClick={function(){setPendingTags(function(p){return p.indexOf(t)>=0?p.filter(function(x){return x!==t;}):p.concat([t]);});}} style={TAGBTN(pendingTags.indexOf(t)>=0)}>{t}</span>;})}</div></div>
        {dupWarn&&<div style={{fontSize:13,color:"#854d0e",background:"#fef9c3",borderRadius:6,padding:"8px 12px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>Similar entry exists.<span onClick={function(){saveLib(true);}} style={{cursor:"pointer",fontWeight:500}}>Save anyway</span><span onClick={function(){setDupWarn(false);}} style={{cursor:"pointer"}}>Cancel</span></div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={synthesize} disabled={loading||(!input.trim()&&!sources.some(function(s){return s.text.trim();}))} style={{flex:1,padding:"10px",fontWeight:500}}>{loading?"Synthesizing...":"Synthesize"}</button>
          {output&&<button onClick={function(){saveLib(false);}} style={{padding:"10px 16px"}}>Save</button>}
        </div>
        {output&&(<div style={{...CARD,marginTop:"1.5rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:11,color:T.textSec,textTransform:"uppercase"}}>{format} - {tone}</span>{getConf(output)&&<span style={{...PILL(),background:CONF_BG[getConf(output)],color:CONF_COLOR[getConf(output)],border:"none"}}>{getConf(output)} confidence</span>}<span style={PILL()}>{fmtTime(output)}</span></div>
            <div style={{display:"flex",gap:8}}><span onClick={function(){cp(output,"out");}} style={LNK}>{copied==="out"?"✓ Copied!":"Copy"}</span><span onClick={function(){downloadMD("synthesis",toMD({title:"Synthesis",format,tone,date:todayStr(),tags:pendingTags,result:output}));}} style={LNK}>⬇ .md</span></div>
          </div>
          {autoTagSuggestions.length>0&&(<div style={{marginBottom:10,padding:"8px 10px",background:T.bgTer,borderRadius:6,fontSize:12,color:T.textSec}}><span>Companies detected: </span>{autoTagSuggestions.map(function(name){var already=pendingTags.indexOf(name)>=0;return <span key={name} onClick={function(){if(!already)setPendingTags(function(p){return p.concat([name]);});}} style={{marginLeft:6,padding:"1px 7px",borderRadius:99,border:"1px solid "+(already?T.borderSec:T.border),background:already?"#dcfce7":T.bg,color:already?"#166534":T.text,cursor:already?"default":"pointer",fontSize:11}}>{already?"✓ ":""}{name}</span>;})} <span style={{marginLeft:8,opacity:0.6}}>— click to tag</span></div>)}
          <div style={{fontSize:14,lineHeight:1.75,color:T.text}} dangerouslySetInnerHTML={{__html:toHTML(output)}}/>
          <div style={{marginTop:12,borderTop:"1px solid "+T.border,paddingTop:10}}><div style={{fontSize:12,color:T.textSec,marginBottom:6}}>Follow-up question</div><div style={{display:"flex",gap:6}}><input value={fuQ} onChange={function(e){setFuQ(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")askFollowUp();}} placeholder="Ask about this synthesis..." style={{...INP,flex:1}}/><button onClick={askFollowUp} disabled={fuLoading||!fuQ.trim()} style={{fontSize:12,padding:"6px 12px"}}>{fuLoading?"...":"Ask"}</button></div>{fuA&&<div style={{marginTop:8,fontSize:13,lineHeight:1.7,color:T.text}} dangerouslySetInnerHTML={{__html:toHTML(fuA)}}/>}</div>
        </div>)}
      </div>)}

      {tab==="library"&&(<div>
        <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}><input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Search..." style={{...INP,flex:1,minWidth:130}}/><select value={libSort} onChange={function(e){setLibSort(e.target.value);}} style={INP}>{LIB_SORTS.map(function(s){return <option key={s}>{s}</option>;})}</select></div>
        {allTags.length>1&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{allTags.map(function(t){return <span key={t} onClick={function(){setFilterTag(t);}} style={TAGBTN(filterTag===t)}>{t}</span>;})}</div>}
        <div style={{fontSize:12,color:T.textSec,marginBottom:10}}>{filteredSaved.length} entries</div>
        {filteredSaved.length===0?<p style={{fontSize:14,color:T.textSec}}>No entries found.</p>:filteredSaved.map(function(s){return(
          <div key={s.id} style={{marginBottom:8,background:T.bgSec,borderRadius:8,border:"1px solid "+(s.pinned?T.borderSec:T.border),overflow:"hidden"}}>
            <div onClick={function(){setExpanded(expanded===s.id?null:s.id);}} style={{padding:"11px 14px",cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>{s.pinned&&<span style={{fontSize:10}}>📌</span>}<span style={{fontSize:14,fontWeight:500,color:T.text}}>{s.title}</span><span style={PILL()}>{s.format}</span>{getConf(s.result)&&<span style={{...PILL(),background:CONF_BG[getConf(s.result)],color:CONF_COLOR[getConf(s.result)],border:"none"}}>{getConf(s.result)}</span>}{(s.tags||[]).map(function(t){return <span key={t} style={PILL()}>{t}</span>;})}<span style={{...PILL(),marginLeft:"auto"}}>{fmtTime(s.result)}</span><span style={PILL()}>{s.date}</span></div>
                <p style={{fontSize:13,color:T.textSec,margin:0,lineHeight:1.5}}>{getCore(s.result)}</p>
              </div>
              <span style={{fontSize:13,color:T.textSec,flexShrink:0,paddingTop:2}}>{expanded===s.id?"▲":"▼"}</span>
            </div>
            {expanded===s.id&&(<div style={{borderTop:"1px solid "+T.border,padding:"12px 14px"}}>
              {editId===s.id&&(<div style={{marginBottom:10}}><input value={editTitle} onChange={function(e){setEditTitle(e.target.value);}} style={{...INP,width:"100%",marginBottom:6,boxSizing:"border-box"}}/><textarea value={editNote} onChange={function(e){setEditNote(e.target.value);}} placeholder="Add a note..." style={{...TA(50),marginBottom:6}}/><div style={{display:"flex",gap:8}}><button onClick={function(){updEntry(s.id,{title:editTitle,note:editNote});setEditId(null);}} style={{fontSize:12,padding:"4px 10px"}}>Save</button><span onClick={function(){setEditId(null);}} style={LNK}>Cancel</span></div></div>)}
              {rsId===s.id&&(<div style={{marginBottom:10,padding:"10px 12px",background:T.bg,borderRadius:6,border:"1px solid "+T.border}}><div style={{display:"flex",gap:8,marginBottom:8}}><select value={rsFmt} onChange={function(e){setRsFmt(e.target.value);}} style={{flex:1,...INP}}>{FORMATS.map(function(f){return <option key={f}>{f}</option>;})}</select><select value={rsTone} onChange={function(e){setRsTone(e.target.value);}} style={{flex:1,...INP}}>{TONES.map(function(t){return <option key={t}>{t}</option>;})}</select><button onClick={doResynth} disabled={rsLoading} style={{fontSize:12,padding:"4px 10px"}}>{rsLoading?"...":"Run"}</button></div>{rsOut&&(<><div style={{fontSize:13,lineHeight:1.7,marginBottom:8,color:T.text}} dangerouslySetInnerHTML={{__html:toHTML(rsOut)}}/><div style={{display:"flex",gap:10}}><button onClick={saveResynth} style={{fontSize:12,padding:"4px 10px"}}>Save as new</button><span onClick={function(){setRsId(null);setRsOut("");}} style={LNK}>Close</span></div></>)}</div>)}
              {editId!==s.id&&rsId!==s.id&&<div style={{fontSize:13,lineHeight:1.75,marginBottom:10,color:T.text}} dangerouslySetInnerHTML={{__html:toHTML(s.result)}}/>}
              <div style={{borderTop:"1px solid "+T.border,paddingTop:10,marginTop:4}}>   <div style={{fontSize:12,fontWeight:500,color:T.textSec,marginBottom:8}}>💬 Comments ({(entryComments[s.id]||[]).length})</div>   {(entryComments[s.id]||[]).map(function(c){return(<div key={c.id} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:8,padding:"7px 10px",background:T.bgTer,borderRadius:6}}><div style={{flex:1}}><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}><span style={{fontSize:11,fontWeight:600,color:T.text}}>{c.author}</span><span style={{fontSize:10,color:T.textSec}}>{c.date}</span></div><div style={{fontSize:12,color:T.text,lineHeight:1.5}}>{c.text}</div></div>{(c.author===currentUser||!c.author)&&<span onClick={function(){deleteComment(s.id,c.id);}} style={{fontSize:10,color:T.textDanger,cursor:"pointer",flexShrink:0}}>×</span>}</div>);})}   <div style={{display:"flex",gap:6,marginTop:4}}>     <input value={newCommentText[s.id]||""} onChange={function(e){setNewCommentText(function(prev){return Object.assign({},prev,{[s.id]:e.target.value});});}} onKeyDown={function(e){if(e.key==="Enter"&&(newCommentText[s.id]||"").trim()){addComment(s.id,newCommentText[s.id]||"");}}} placeholder={"Comment as "+(currentUser||"Unknown")+"..."} style={{...INP,flex:1,fontSize:12}}/>     <button onClick={function(){addComment(s.id,newCommentText[s.id]||"");}} style={{fontSize:12,padding:"4px 12px"}}>Post</button>   </div> </div> <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap",borderTop:"1px solid "+T.border,paddingTop:10}}>
                <span onClick={function(){updEntry(s.id,{pinned:!s.pinned});}} style={LNK}>{s.pinned?"Unpin":"Pin"}</span>
                <span onClick={function(){setEditId(s.id);setEditTitle(s.title);setEditNote(s.note||"");}} style={LNK}>Rename</span>
                <span onClick={function(){setRsId(s.id);setRsOut("");}} style={LNK}>Re-synthesize</span>
                <span onClick={function(){cp(s.result,s.id+"c");}} style={LNK}>{copied===s.id+"c"?"✓ Copied!":"Copy"}</span>
                <span onClick={function(){downloadMD(s.title,toMD(s));}} style={LNK}>⬇ .md</span> <span onClick={function(){exportEntryPDF(s);}} style={LNK}>⬇ PDF</span>
                <span onClick={function(){setSaved(function(p){return p.filter(function(e){return e.id!==s.id;});});setExpanded(null);}} style={{...LNK,color:T.textDanger}}>Delete</span>
              </div>
            </div>)}
          </div>
        );})}
      </div>)}

      {tab==="recall"&&(<div>
        {saved.length>0&&suggestions.length===0&&<button onClick={genSuggestions} style={{fontSize:12,padding:"6px 12px",marginBottom:12}}>Generate suggested questions</button>}
        {suggestions.length>0&&(<div style={{marginBottom:12}}><div style={{fontSize:12,color:T.textSec,marginBottom:6}}>Suggested questions</div><div style={{display:"flex",flexDirection:"column",gap:5}}>{suggestions.map(function(q,i){return <div key={i} onClick={function(){setRecallQ(q);}} style={{fontSize:13,padding:"7px 12px",background:T.bgSec,borderRadius:6,border:"1px solid "+T.border,cursor:"pointer",color:T.text}}>{q}</div>;})}</div></div>)}
        <textarea value={recallQ} onChange={function(e){setRecallQ(e.target.value);}} placeholder="Ask a question across all saved research..." style={TA(80)}/>
        <button onClick={askRecall} disabled={recallLoading||!recallQ.trim()||!saved.length} style={{marginTop:8,width:"100%",padding:10,fontWeight:500}}>{recallLoading?"Searching...":"Ask across "+saved.length+" entr"+(saved.length===1?"y":"ies")}</button>
        {recall&&(<div style={{marginTop:"1.5rem"}}><div style={{...CARD,fontSize:14,lineHeight:1.75,color:T.text}} dangerouslySetInnerHTML={{__html:toHTML(recall)}}/>{recallSrcs.length>0&&(<div style={{marginTop:8}}><div style={{fontSize:12,color:T.textSec,marginBottom:5}}>Sources used</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{recallSrcs.map(function(s){return <span key={s.id} style={PILL()}>{s.title}</span>;})}</div></div>)}</div>)}
        {recallHist.length>0&&(<div style={{marginTop:"1.5rem"}}><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Recent questions</div>{recallHist.map(function(h){return(<div key={h.ts} style={{...CARD,marginBottom:6}}><div style={{fontSize:13,fontWeight:500,marginBottom:4,cursor:"pointer",color:T.text}} onClick={function(){setRecallQ(h.q);}}>{h.q}</div><div style={{fontSize:12,color:T.textSec,lineHeight:1.5}} dangerouslySetInnerHTML={{__html:toHTML(h.a.slice(0,200)+(h.a.length>200?"...":""))}}/></div>);})}</div>)}
      </div>)}

      {tab==="calendar"&&(<div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}><div style={{fontSize:14,fontWeight:500,color:T.text}}>Upcoming Earnings — Next 30 Days</div><div style={{display:"flex",gap:6}}>{["All","Own","Focus","Watch","Sold"].map(function(s){var active=calFilter===s;var cfg={All:{bg:T.bgSec,color:T.textSec},Own:{bg:"#dcfce7",color:"#166534"},Focus:{bg:"#dbeafe",color:"#1e40af"},Watch:{bg:"#fef9c3",color:"#854d0e"},Sold:{bg:"#fee2e2",color:"#991b1b"}}[s];return <span key={s} onClick={function(){setCalFilter(s);}} style={{fontSize:11,padding:"3px 10px",borderRadius:99,cursor:"pointer",fontWeight:active?600:400,border:"1px solid "+(active?cfg.color:T.border),background:active?cfg.bg:T.bg,color:active?cfg.color:T.textSec}}>{s}</span>;})}</div></div><EarningsCalendar companies={calFilter==="All"?companies:companies.filter(function(c){return c.status===calFilter;})} T={T}/></div>)}        {tab==="compare"&&(<div>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}><button onClick={function(){setCmpIds(saved.filter(function(s){return filterTag==="All"||(s.tags||[]).indexOf(filterTag)>=0;}).slice(0,3).map(function(s){return s.id;}));}} style={{fontSize:12,padding:"5px 10px"}}>Auto-select by tag</button><select value={filterTag} onChange={function(e){setFilterTag(e.target.value);}} style={INP}>{allTags.map(function(t){return <option key={t}>{t}</option>;})}</select></div>
        {saved.length<2?<p style={{fontSize:13,color:T.textSec}}>Save at least 2 entries to compare.</p>:(<><div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>{saved.map(function(s){var sel=cmpIds.indexOf(s.id)>=0;return(<div key={s.id} onClick={function(){setCmpIds(function(p){return sel?p.filter(function(x){return x!==s.id;}):p.length<3?p.concat([s.id]):p;});}} style={{padding:"9px 12px",borderRadius:6,border:"1px solid "+(sel?T.borderSec:T.border),background:sel?T.bgSec:T.bg,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}><div style={{width:14,height:14,borderRadius:3,border:"1px solid "+(sel?T.borderSec:T.border),background:sel?"#dbeafe":"transparent",flexShrink:0}}/><span style={{fontSize:13,fontWeight:sel?500:400,flex:1,color:T.text}}>{s.title}</span><span style={PILL()}>{s.format}</span><span style={PILL()}>{s.date}</span></div>);})}</div><button onClick={doCompare} disabled={cmpIds.length<2||cmpLoading} style={{width:"100%",padding:10,fontWeight:500}}>{cmpLoading?"Comparing...":"Compare "+cmpIds.length+" entr"+(cmpIds.length===1?"y":"ies")}</button>{cmpOut&&<div style={{...CARD,marginTop:"1.5rem",fontSize:14,lineHeight:1.75,color:T.text}} dangerouslySetInnerHTML={{__html:toHTML(cmpOut)}}/>}</>)}
      </div>)}

      {tab==="macro"&&(<div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}><span style={{fontSize:13,color:T.textSec}}>{macroEntries.length} Macro entries</span><button onClick={buildMacro} disabled={macroLoading||!macroEntries.length} style={{padding:"7px 14px",fontWeight:500}}>{macroLoading?"Building...":"Build master"}</button></div>
        {!macroEntries.length?<p style={{fontSize:14,color:T.textSec}}>Tag entries with "Macro" to include them here.</p>:(<div style={{marginBottom:12}}><div style={{fontSize:12,color:T.textSec,marginBottom:6}}>Entries included</div><div style={{display:"flex",flexDirection:"column",gap:4}}>{macroEntries.map(function(s){return <div key={s.id} style={{fontSize:13,padding:"6px 10px",...CARD,marginBottom:0,display:"flex",gap:8,alignItems:"center",color:T.text}}><span style={{flex:1}}>{s.title}</span><span style={PILL()}>{s.date}</span></div>;})}</div></div>)}
        {macroOut&&(<div style={{marginTop:"1rem"}}><div style={{...CARD,fontSize:14,lineHeight:1.8,color:T.text}} dangerouslySetInnerHTML={{__html:toHTML(macroOut)}}/><div style={{marginTop:10,display:"flex",gap:10}}><span onClick={function(){cp(macroOut,"macro");}} style={LNK}>{copied==="macro"?"✓ Copied!":"Copy"}</span><span onClick={function(){downloadMD("macro_master",macroOut);}} style={LNK}>⬇ .md</span><span onClick={function(){setSaved(function(p){return [{id:Date.now(),title:"Macro Master - "+todayStr(),format:"Executive Summary",tone:"Professional",result:macroOut,tags:["Macro"],date:todayStr(),ts:Date.now(),pinned:true,note:""}].concat(p);});}} style={LNK}>Save to library</span></div></div>)}
      </div>)}
</ErrorBoundary>
    </div>
  );
}
