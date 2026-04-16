import { useState, useRef, useEffect } from "react";
import { useCompanyContext } from '../context/CompanyContext.jsx';
import { PORTFOLIOS, TIER_ORDER, SECTOR_ORDER, COUNTRY_ORDER, ALL_COLS, COMPACT_COLS, TEMPLATE_SECTIONS, UPLOAD_TYPES, REP_ACCOUNTS } from '../constants/index.js';
import { getCurrency, calcNormEPS, calcTP, calcMOS, fmtPrice, fmtTP, fmtMOS, impliedFYLabel, todayStr, parseDate, sortCos, blankEarnings, toHTML, downloadMD, getTiers } from '../utils/index.js';
import { ANTHROPIC_KEY, apiCall, supaUpsert } from '../api/index.js';

export function useCompanies(){
  const { companies, setCompanies, saved, setSaved, lastPriceUpdate, setLastPriceUpdate, currentUser, setCopied, updateCo, cp, T, fxRates, setFxRates, fxLastUpdated, setFxLastUpdated, repData, setRepData, repLastUpdated, setRepLastUpdated, specialWeights, setSpecialWeights, calLastUpdated, setCalLastUpdated, calLastUpdatedBy, setCalLastUpdatedBy } = useCompanyContext();

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
  const [pendingVal,setPendingVal]=useState(null);
  const [compact,setCompact]=useState(false);
  const [showDedupe,setShowDedupe]=useState(false);
  const [dupeGroups,setDupeGroups]=useState([]);
  const [dupeKeep,setDupeKeep]=useState({});
  const [quickUploadCo,setQuickUploadCo]=useState(null);
  const [linkLibOpen,setLinkLibOpen]=useState(false);
  const [showTmplSearch,setShowTmplSearch]=useState(false);
  const searchRef=useRef();

  useEffect(function(){if(selCo){setPendingVal(Object.assign({},selCo.valuation||{}));}else{setPendingVal(null);}},[selCo&&selCo.id]);

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
  function applyBulkEdit(){
    if(!selectedIds.size)return;var ch={};if(bulkStatus)ch.status=bulkStatus;if(bulkTier)ch.tier=bulkTier;if(!Object.keys(ch).length)return;
    setCompanies(function(prev){return prev.map(function(c){return selectedIds.has(c.id)?Object.assign({},c,ch):c;});});
    setSelectedIds(new Set());setBulkStatus("");setBulkTier("");
  }
  function toggleSelect(id){setSelectedIds(function(prev){var n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});}
  function selectAll(){setSelectedIds(new Set(displayedCos.map(function(c){return c.id;})));}
  function clearSelected(){setSelectedIds(new Set());}
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
  function acceptQuickDiff(company,diff,meta){
    var ns=Object.assign({},company.sections);diff.forEach(function(d){ns[d.section]=d.after;});
    var today=todayStr();var log={date:today,type:meta.type||"Update",summary:meta.summary||"",changes:diff.map(function(d){return d.section;})};
    var updated=Object.assign({},company,{sections:ns,updateLog:[log].concat(company.updateLog||[]),lastUpdated:today,lastReviewed:today});
    setCompanies(function(cs){return cs.map(function(c){return c.id===updated.id?updated:c;});});
    setSelCo(function(prev){return prev&&prev.id===updated.id?updated:prev;});
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
  function applyPriceImport(){
    if(!priceImportText.trim())return;var lines=priceImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var ordMap={};var adrMap={};
  var priceData=[];lines.forEach(function(line){var delim=line.indexOf("\t")>=0?"\t":",";var parts=line.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});if(parts.length>=3){var name=parts[0];var ordTicker=parts[1].toUpperCase();var ordPrice=parseFloat(parts[2]);var rawPerf=parts.length>=4&&parts[3]?parts[3]:"";var ordPerf5d=rawPerf==="#N/A"||rawPerf===""?"":rawPerf.replace(/[()%\s]/g,"").replace(/^\((.+)\)$/,"-$1");var adrTicker=parts.length>=6&&parts[4]?parts[4].toUpperCase():"";var adrPrice=parts.length>=6&&parts[5]?parseFloat(parts[5].replace(/,/g,"")):NaN;var rawAdrPerf=parts.length>=7&&parts[6]?parts[6]:"";var adrPerf5d=rawAdrPerf==="#N/A"||rawAdrPerf===""?"":rawAdrPerf.replace(/[()%\s]/g,"").replace(/^\((.+)\)$/,"-$1");priceData.push({name:name,ordTicker:ordTicker,ordPrice:ordPrice,ordPerf5d:ordPerf5d,adrTicker:adrTicker,adrPrice:isNaN(adrPrice)?null:adrPrice,adrPerf5d:adrPerf5d});}});
    var count=0;
    setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=priceData.find(function(d){return d.name.toLowerCase().trim()===cname;});if(!match)return c;var updates={};
    // Preserve user's existing ordinary designation if it matches one of the new tickers
    var existingOrdinaryTicker=((c.tickers||[]).find(function(t){return t.isOrdinary;})||{}).ticker;
    var ordIsExistingOrdinary=existingOrdinaryTicker===match.ordTicker;
    var adrIsExistingOrdinary=existingOrdinaryTicker===match.adrTicker;
    var hasExistingOrdinaryMatch=ordIsExistingOrdinary||adrIsExistingOrdinary;
    var newTickers=[{ticker:match.ordTicker,price:match.ordPrice,perf5d:match.ordPerf5d||"",currency:getCurrency(c.country),isOrdinary:hasExistingOrdinaryMatch?ordIsExistingOrdinary:true}];
    if(match.adrTicker&&match.adrPrice!==null&&match.adrTicker!==match.ordTicker)newTickers.push({ticker:match.adrTicker,price:match.adrPrice,perf5d:match.adrPerf5d||"",currency:"USD",isOrdinary:hasExistingOrdinaryMatch?adrIsExistingOrdinary:false});
    // Set valuation.price and currency from whichever ticker is now the ordinary
    var nowOrdinary=newTickers.find(function(t){return t.isOrdinary;})||newTickers[0];
    if(!isNaN(nowOrdinary.price)){updates.valuation=Object.assign({},c.valuation||{},{price:nowOrdinary.price,currency:nowOrdinary.currency});count++;}
    updates.tickers=newTickers;
    return Object.assign({},c,updates);});});
    setPriceImportText("");setShowPriceImport(false);var priceUpdateStr=todayStr()+" "+new Date().toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});setLastPriceUpdate(priceUpdateStr);supaUpsert("meta",{key:"lastPriceUpdate",value:priceUpdateStr});setTimeout(function(){alert("Updated prices for "+count+" companies.");},100);
  }
  function handleSortClick(colSort){     if(coSort===colSort){setCoSortDir(function(d){return d==="asc"?"desc":"asc";});}     else{setCoSort(colSort);var descByDefault=colSort==="Last Reviewed"||colSort==="Last Updated"||colSort==="5D%"||colSort==="MOS";setCoSortDir(descByDefault?"desc":"asc");}   }
  function exportToPDF(title,htmlContent){   var win=window.open("","_blank");   if(!win){alert("Please allow popups to export PDF.");return;}   win.document.write("<!DOCTYPE html><html><head><title>"+title+"</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 40px;color:#111;line-height:1.7;}h1{font-size:22px;border-bottom:2px solid #334155;padding-bottom:10px;margin-bottom:20px;}h2{font-size:16px;color:#1e40af;margin-top:28px;margin-bottom:8px;}p{font-size:14px;}.meta{font-size:12px;color:#6b7280;margin-bottom:20px;}</style></head><body>"+htmlContent+"</body></html>");   win.document.close();   setTimeout(function(){win.print();},500); }
  function exportCompanyPDF(co){   var html="<h1>"+co.name+(co.ticker?" ("+co.ticker+")":"")+"</h1><div class='meta'>";   if(co.sector)html+="Sector: "+co.sector+" | ";   if(co.country)html+="Country: "+co.country+" | ";   if(co.status)html+="Status: "+co.status;   html+="</div>";   var v=co.valuation||{};var ne=calcNormEPS(v)||parseFloat(v.eps);var tp=calcTP(v.pe,ne);var mos=calcMOS(tp,v.price);var cur=(v.currency)||getCurrency(co.country);   if(tp!==null||v.price){html+="<h2>Valuation</h2><p>";if(v.price)html+="Price: "+cur+" "+fmtPrice(v.price)+" &nbsp;";if(tp!==null)html+="TP: "+fmtTP(tp,cur)+" &nbsp;";if(mos!==null)html+="MOS: "+fmtMOS(mos);html+="</p>";}   TEMPLATE_SECTIONS.forEach(function(s){var c=co.sections&&co.sections[s];if(c&&c.trim()){html+="<h2>"+s+"</h2><p>"+c.replace(/\n/g,"<br/>")+"</p>";}});   if(co.earningsEntries&&co.earningsEntries.length){html+="<h2>Earnings History</h2>";co.earningsEntries.forEach(function(e){html+="<p><strong>"+e.quarter+"</strong> "+e.reportDate+"<br/>"+(e.shortTakeaway||"")+"</p>";});}   exportToPDF(co.name,html); }
  function exportCSV(){
    var rows=[["Tier","Name","Country","Sector","Portfolio","Action","Notes","Last Reviewed","Status","Ticker","Port?","Price"]];
    displayedCos.forEach(function(c){var v=c.valuation||{};rows.push([getTiers(c.tier).join(", "),c.name,c.country||"",c.sector||"",(c.portfolios||[]).join(", "),c.action||"",c.takeaway||"",c.lastReviewed||"",c.status||"",c.ticker||"",c.portNote||"",v.price||""]);});
    var csv=rows.map(function(r){return r.map(function(v){return'"'+String(v).replace(/"/g,'""')+'"';}).join(",");}).join("\n");
    var blob=new Blob([csv],{type:"text/csv"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="companies_export.csv";a.click();
  }

  var flaggedCos=companies.filter(function(c){return c.flag;}).sort(function(a,b){return(a.flag==="Urgent"?0:1)-(b.flag==="Urgent"?0:1);});
  var usedCountries=Array.from(new Set(companies.map(function(c){return c.country;}).filter(Boolean))).sort();
  var usedSectors=Array.from(new Set(companies.map(function(c){return c.sector;}).filter(Boolean))).sort();
  var displayedCos=sortCos(companies.filter(function(c){
    if(coFilter!=="All"&&(c.portfolios||[]).indexOf(coFilter)<0)return false;
    if(coStatusFilter!=="All"&&c.status!==coStatusFilter)return false;
    if(coFilterCountry!=="All"&&c.country!==coFilterCountry)return false;
    if(coFilterSector!=="All"&&c.sector!==coFilterSector)return false;
    if(coSearch){var s=coSearch.toLowerCase();if(c.name.toLowerCase().indexOf(s)<0&&(c.ticker||"").toLowerCase().indexOf(s)<0)return false;}
    return true;
  }),coSort,coSortDir);

  return {
    selCo,setSelCo,coView,setCoView,coSort,setCoSort,coSortDir,setCoSortDir,
    coFilter,setCoFilter,coStatusFilter,setCoStatusFilter,coFilterCountry,setCoFilterCountry,
    coFilterSector,setCoFilterSector,coSearch,setCoSearch,selectedIds,setSelectedIds,
    bulkStatus,setBulkStatus,bulkTier,setBulkTier,visibleCols,setVisibleCols,
    showColPicker,setShowColPicker,confirmClear,setConfirmClear,showNew,setShowNew,
    showBulk,setShowBulk,showPriceImport,setShowPriceImport,priceImportText,setPriceImportText,
    showRestore,setShowRestore,restoreText,setRestoreText,newName,setNewName,
    newTicker,setNewTicker,newFields,setNewFields,bulkText,setBulkText,
    bulkLoading,setBulkLoading,bulkPreview,setBulkPreview,tmplRaw,setTmplRaw,
    tmplLoading,setTmplLoading,tmplSearch,setTmplSearch,tmplHighlight,setTmplHighlight,
    flashSections,setFlashSections,upText,setUpText,upType,setUpType,
    upLoading,setUpLoading,pendingDiff,setPendingDiff,pendingMeta,setPendingMeta,
    pendingVal,setPendingVal,compact,setCompact,showDedupe,setShowDedupe,
    dupeGroups,setDupeGroups,dupeKeep,setDupeKeep,quickUploadCo,setQuickUploadCo,
    linkLibOpen,setLinkLibOpen,showTmplSearch,setShowTmplSearch,searchRef,
    addCompany,parseBulk,confirmBulk,applyBulkEdit,toggleSelect,selectAll,clearSelected,
    findDupes,applyDedupe,commitValuation,saveEarningsEntry,deleteEarningsEntry,
    acceptQuickDiff,acceptDiff,importTemplate,processUpload,applyPriceImport,
    handleSortClick,exportCompanyPDF,exportToPDF,exportCSV,
    displayedCos,flaggedCos,usedCountries,usedSectors
  };
}
