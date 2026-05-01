import { useState } from "react";
import { useCompanyContext } from '../context/CompanyContext.jsx';
import { todayStr, blankEarnings, getCurrency, parseDate } from '../utils/index.js';
import { supaUpsert, supaGet } from '../api/index.js';
import { pctToDecimal } from '../utils/format.js';
import { parseDashboardUpload } from '../utils/dashboardParser.js';
import { parseRatioPaste } from '../utils/ratioParser.js';
import { parseSegmentsPaste } from '../utils/segmentsParser.js';
import { parseEpsRevisionsPaste } from '../utils/epsRevisionsParser.js';
import { parseGuidancePaste } from '../utils/guidanceParser.js';
import { findCompanyByName, findCompanyByTickerOrName, normalizeCompanyName } from '../utils/nameMatch.js';
import { useAlert } from '../components/ui/DialogProvider.jsx';
import { REP_ACCOUNTS } from '../constants/index.js';

export function useImport(){
  const ctx = useCompanyContext();
  const { companies, setCompanies, saved, setSaved, setCopied, currentUser, repData, setRepData, fxRates, setFxRates, specialWeights, setSpecialWeights, benchmarkWeights, setBenchmarkWeights, breakdownHistory, setBreakdownHistory, calLastUpdated, setCalLastUpdated, calLastUpdatedBy, setCalLastUpdatedBy, repLastUpdated, setRepLastUpdated, fxLastUpdated, setFxLastUpdated, applyPerfBulk } = ctx;
  /* All import functions surface results / errors via the in-app
     alert dialog (instead of native window.alert). Keeps look + feel
     consistent with the rest of the app and unblocks Test/CI environments
     that suppress native dialogs. */
  const alertFn = useAlert();

  const [showDataPanel,setShowDataPanel]=useState(false);
  const [importText,setImportText]=useState("");
  const [importError,setImportError]=useState("");
  const [dataHubTab,setDataHubTab]=useState("backup");
  const [valImportText,setValImportText]=useState("");
  const [estImportText,setEstImportText]=useState("");
  const [metricsImportText,setMetricsImportText]=useState("");
  const [benchmarkImportText,setBenchmarkImportText]=useState("");
  const [benchmarkAsOf,setBenchmarkAsOf]=useState("");
  const [dashboardImportText,setDashboardImportText]=useState("");
  const [weightsImportText,setWeightsImportText]=useState("");
  const [calImportText,setCalImportText]=useState("");
  const [repText,setRepText]=useState("");
  const [fxText,setFxText]=useState("");
  const [txText,setTxText]=useState("");
  const [ratioImportText,setRatioImportText]=useState("");
  const [financialsImportText,setFinancialsImportText]=useState("");
  const [segmentsImportText,setSegmentsImportText]=useState("");
  const [epsRevImportText,setEpsRevImportText]=useState("");
  const [guidanceImportText,setGuidanceImportText]=useState("");
  const [perfPortTargets,setPerfPortTargets]=useState(["FIN"]);
  const [perfText,setPerfText]=useState("");
  const [portTab,setPortTab]=useState("overlap");
  const [portSort,setPortSort]=useState("rep");
  const [portSortDir,setPortSortDir]=useState("desc");

  function applyFxImport(){if(!fxText.trim())return;var lines=fxText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var rates={};lines.forEach(function(line){var delim=line.indexOf("\t")>=0?"\t":",";var parts=line.split(delim).map(function(s){return s.trim();});if(parts.length>=2){var pair=parts[0].toUpperCase();var rate=parseFloat(parts[1]);if(!isNaN(rate))rates[pair]=rate;}});var extracted={};Object.entries(rates).forEach(function(e){var pair=e[0];var rate=e[1];if(pair.startsWith("USD")){var ccy=pair.slice(3);extracted[ccy]=rate;}else if(pair.endsWith("USD")){var ccy=pair.slice(0,3);if(rate!==0)extracted[ccy]=1/rate;}else{extracted[pair]=rate;}});setFxRates(extracted);setFxLastUpdated(currentUser+" "+todayStr());setFxText("");supaUpsert("meta",{key:"fxRates",value:JSON.stringify(extracted)});}
  function applyTxImport(){
    if(!txText.trim())return;
    var lines=txText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});
    var rows=[];
    lines.forEach(function(line){
      var delim=line.indexOf("\t")>=0?"\t":",";
      var parts=line.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});
      if(parts.length>=6){
        var date=parts[0];
        var name=parts[1];
        var portRaw=parts[2].toUpperCase();
        /* Map LW account code → portfolio short code (e.g. LWFOCGL1 → FGL).
           applyRepImport does the same. Fall back to the raw value if the
           code isn't in REP_ACCOUNTS so the row still uploads (and shows
           up as "unmatched portfolio" rather than getting silently dropped). */
        var portfolio=REP_ACCOUNTS[portRaw]||portRaw;
        var shares=parseFloat(parts[3]);
        var price=parseFloat(parts[4]);
        var amount=parseFloat((parts[5]||"").replace(/,/g,""));
        if(name&&!isNaN(shares))rows.push({date:date,name:name,portfolio:portfolio,shares:shares,price:isNaN(price)?0:price,amount:isNaN(amount)?0:amount});
      }
    });
    if(rows.length===0){alertFn("No valid rows parsed. Expected columns: Date, Name, Portfolio, Shares, Price, Amount.");return;}
    var normalize = normalizeCompanyName;  /* shared util — see src/utils/nameMatch.js */
    var byName={},byNorm={};
    rows.forEach(function(r){var k=(r.name||"").toLowerCase().trim();(byName[k]=byName[k]||[]).push(r);(byNorm[normalize(r.name)]=byNorm[normalize(r.name)]||[]).push(r);});
    var matchedNames={};var unmatched=new Set(rows.map(function(r){return r.name;}));
    var txCount=0;
    setCompanies(function(prev){return prev.map(function(c){
      var cname=(c.name||"").toLowerCase().trim();
      var cUsName=(c.usTickerName||"").toLowerCase().trim();
      /* Union all four lookups — Tx files may list the same company under
         multiple names (ord name, US/ADR name, normalized variants). Using
         || would short-circuit on the first hit and leave ADR-name rows
         unclaimed when ord-name rows already matched. Dedupe by row identity. */
      var seenRow=new Set();
      var matches=[];
      function addAll(arr){ if(!arr)return; arr.forEach(function(r){ if(!seenRow.has(r)){ seenRow.add(r); matches.push(r); } }); }
      addAll(byName[cname]);
      if(cUsName) addAll(byName[cUsName]);
      addAll(byNorm[normalize(c.name)]);
      if(cUsName) addAll(byNorm[normalize(c.usTickerName)]);
      if(matches.length===0) matches=null;
      if(!matches||matches.length===0)return c;
      matches.forEach(function(r){matchedNames[r.name]=true;unmatched.delete(r.name);});
      var existing=c.transactions||[];
      var keyOf=function(r){return(r.date||"")+"|"+(r.portfolio||"")+"|"+(r.shares||0)+"|"+(r.price||0)+"|"+(r.amount||0);};
      var existKeys={};existing.forEach(function(t){existKeys[keyOf(t)]=true;});
      var newTx=matches.filter(function(r){return !existKeys[keyOf(r)];}).map(function(r){
        var id=(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+"-"+Math.random().toString(36).slice(2));
        return{id:id,date:r.date,portfolio:r.portfolio,shares:r.shares,price:r.price,amount:r.amount,type:r.shares>=0?"BUY":"SELL"};
      });
      if(newTx.length===0)return c;
      txCount+=newTx.length;
      var all=existing.concat(newTx);all.sort(function(a,b){return(b.date||"").localeCompare(a.date||"");});
      return Object.assign({},c,{transactions:all});
    });});
    setTimeout(function(){var msg="Imported "+txCount+" transactions across "+Object.keys(matchedNames).length+" companies.";if(unmatched.size>0){var list=Array.from(unmatched);msg+="\n\nUnmatched names ("+unmatched.size+"):\n"+list.slice(0,30).join(", ")+(list.length>30?" \u2026 (see console for full list)":"");console.warn("[Tx import] Unmatched security names:",list);}alertFn(msg);setTxText("");},100);
  }
  /* Parse CSV/TSV performance paste. First column = YYYY-MM (or Date header).
     Remaining columns = series (header = series name). Values may have % signs
     which are stripped; numeric values with no % sign are assumed already-decimal. */
  function applyPerfImport(){
    if(!perfText.trim())return;
    var lines=perfText.trim().split(/\r?\n/).filter(function(l){return l.trim();});
    if(lines.length<2){alertFn("Need a header row and at least one data row.");return;}
    var delim=lines[0].indexOf("\t")>=0?"\t":",";
    function parseRow(line){var cols=[];var cur="";var inQ=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){inQ=!inQ;}else if(ch===delim&&!inQ){cols.push(cur);cur="";}else{cur+=ch;}}cols.push(cur);return cols.map(function(c){return c.replace(/^"|"$/g,"").trim();});}
    var headers=parseRow(lines[0]);
    var seriesNames=headers.slice(1).filter(function(h){return h;});
    if(seriesNames.length===0){alertFn("No series columns found in header.");return;}
    function normMonth(s){
      if(!s)return null;
      /* Accept YYYY-MM, YYYY/MM, M/D/YYYY (uses month+year), MMM YYYY */
      var m=s.match(/^(\d{4})[-\/](\d{1,2})/);if(m){return m[1]+"-"+(m[2].length<2?"0":"")+m[2];}
      m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);if(m){var y=m[3];if(y.length===2)y="20"+y;return y+"-"+(m[1].length<2?"0":"")+m[1];}
      var MM={jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};
      m=s.match(/^([A-Za-z]{3})\D+(\d{4})/);if(m){var mn=MM[m[1].toLowerCase()];if(mn)return m[2]+"-"+mn;}
      return null;
    }
    function normVal(s){
      if(s===null||s===undefined)return null;
      var t=String(s).trim();if(!t)return null;
      var hasPct=t.indexOf("%")>=0;
      t=t.replace(/[%,]/g,"").replace(/\((.+)\)/,"-$1").trim();
      if(!t||t==="-"||t==="—"||t==="--")return null;
      var n=parseFloat(t);if(isNaN(n))return null;
      return hasPct?n/100:n;
    }
    var rows=[];var badRows=0;
    for(var i=1;i<lines.length;i++){
      var cols=parseRow(lines[i]);
      var month=normMonth(cols[0]);
      if(!month){badRows++;continue;}
      var vals=seriesNames.map(function(_,j){return normVal(cols[j+1]);});
      rows.push({month:month,values:vals});
    }
    if(rows.length===0){alertFn("No valid data rows parsed (bad date formats).");return;}
    if(!perfPortTargets||perfPortTargets.length===0){alertFn("Select at least one target portfolio.");return;}
    /* Per-target filter: drop columns that match SIBLING portfolio codes
       (case-insensitive). e.g. uploading a combined FGL/GL CSV to both
       FGL and GL — the FGL target keeps the FGL column + benchmarks/comps,
       skips the GL column; GL target does the reverse. */
    var ALL_CODES=["FIN","IN","FGL","GL","EM","SC"];
    perfPortTargets.forEach(function(target){
      var others={};ALL_CODES.forEach(function(c){if(c!==target)others[c]=true;});
      var keepMask=seriesNames.map(function(n){return !others[n.toUpperCase().trim()];});
      var filteredNames=seriesNames.filter(function(_,i){return keepMask[i];});
      var filteredRows=rows.map(function(row){return {month:row.month,values:row.values.filter(function(_,i){return keepMask[i];})};});
      applyPerfBulk(target,{seriesNames:filteredNames,rows:filteredRows});
    });
    setTimeout(function(){
      var msg="Imported "+rows.length+" months × "+seriesNames.length+" series into "+perfPortTargets.join(", ")+".";
      if(perfPortTargets.length>1)msg+=" Each target kept its own portfolio column + all shared series; sibling portfolio columns were skipped per target.";
      if(badRows)msg+=" Skipped "+badRows+" unparseable rows.";
      alertFn(msg);
      setPerfText("");
    },100);
  }
  function applyRepImport(){if(!repText.trim())return;var lines=repText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var data={};lines.forEach(function(line){var delim=line.indexOf("\t")>=0?"\t":",";var parts=line.split(delim).map(function(s){return s.trim();});if(parts.length>=3){var acct=parts[0].toUpperCase();var ticker=parts[1].toUpperCase();var shares=parseFloat(parts[2]);var avgCost=parts.length>=4?parseFloat(parts[3]):0;if(isNaN(avgCost))avgCost=0;if(!isNaN(shares)){var port=REP_ACCOUNTS[acct];if(port){if(!data[port])data[port]={};var prev=data[port][ticker];var prevShares=(prev&&typeof prev==="object")?(prev.shares||0):(prev||0);var prevCost=(prev&&typeof prev==="object")?(prev.avgCost||0):0;var newShares=prevShares+shares;/* Weighted average when the same ticker appears twice in one import */var newAvgCost=newShares>0?((prevShares*prevCost)+(shares*avgCost))/newShares:avgCost;data[port][ticker]={shares:newShares,avgCost:newAvgCost};}}}});setRepData(data);setRepLastUpdated(currentUser+" "+todayStr());setRepText("");supaUpsert("meta",{key:"repData",value:JSON.stringify(data)});}
  /* Earnings Dates upload — 13 columns:
       Ticker, Next Rpt Date, Last Rpt Date,
       Sales Est, Sales Actual, Sales Surp Nom, Sales Surp %,
       EPS Est, EPS Actual, EPS Surp Nom, EPS Surp %,
       Sales+1 Est, EPS+1 Est
     All columns after Last Rpt Date are optional — the legacy 3-col
     paste (Ticker, Next, Last) still works.

     Persistence model:
     - nextDate ⇒ create / find earningsEntries entry with that
       reportDate. Sales+1 / EPS+1 estimates are stored on THAT entry
       as consensus heading into the report.
     - lastDate ⇒ company.lastReportDate. Sales/EPS estimate +
       actual + surprise fields are stored on the earnings entry whose
       reportDate matches lastDate (so post-report data sits with the
       right quarter). If no entry matches, we create a closed one
       so the data has somewhere to live. */
  function applyCalImport(){
    if(!calImportText||!calImportText.trim())return;
    var lines=calImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});
    /* Auto-skip a header row if the first cell looks like a header
       label rather than a ticker. */
    if(lines.length>0){
      var first=lines[0];
      var d0=first.indexOf("\t")>=0?"\t":",";
      var p0=first.split(d0).map(function(s){return s.trim();});
      if(/^ticker$|^name$|^company$/i.test(p0[0]||"")) lines.shift();
    }
    function num(v){var n=parseFloat((v||"").toString().replace(/,/g,""));return isNaN(n)?null:n;}
    var count=0;
    setCompanies(function(prev){return prev.map(function(c){
      var match=lines.find(function(l){
        var delim=l.indexOf("\t")>=0?"\t":",";
        var parts=l.split(delim).map(function(s){return s.trim();});
        var allTickers2=[(c.ticker||"")].concat((c.tickers||[]).map(function(t){return t.ticker||"";})).map(function(t){return t.toUpperCase();}).filter(Boolean);
        return allTickers2.indexOf((parts[0]||"").toUpperCase())>=0;
      });
      if(!match)return c;
      var delim=match.indexOf("\t")>=0?"\t":",";
      var parts=match.split(delim).map(function(s){return s.trim();});
      var nextDate=parts[1]||"";
      var lastDate=parts[2]||"";
      /* Last-quarter (just reported) — estimate / actual / surprises. */
      var lastSalesEst   = num(parts[3]);
      var lastSalesAct   = num(parts[4]);
      var lastSalesSurpN = num(parts[5]);
      var lastSalesSurpP = num(parts[6]);
      var lastEpsEst     = num(parts[7]);
      var lastEpsAct     = num(parts[8]);
      var lastEpsSurpN   = num(parts[9]);
      var lastEpsSurpP   = num(parts[10]);
      /* Next-quarter — consensus heading in (no actuals yet). */
      var nextSalesEst   = num(parts[11]);
      var nextEpsEst     = num(parts[12]);

      var updated=Object.assign({},c);
      var entries=(c.earningsEntries||[]).slice();

      /* Upsert next-quarter entry. */
      if(nextDate){
        var nextEntry=entries.find(function(e){return e.reportDate===nextDate;});
        if(!nextEntry){
          nextEntry=Object.assign(blankEarnings(),{reportDate:nextDate,open:false});
          entries.unshift(nextEntry);
        }
        if(nextSalesEst!==null) nextEntry.salesEst = nextSalesEst;
        if(nextEpsEst!==null)   nextEntry.epsEst   = nextEpsEst;
      }

      /* Upsert last-quarter entry, attach actuals + surprises. */
      if(lastDate){
        updated.lastReportDate=lastDate;
        var lastEntry=entries.find(function(e){return e.reportDate===lastDate;});
        if(!lastEntry){
          lastEntry=Object.assign(blankEarnings(),{reportDate:lastDate,open:false});
          entries.push(lastEntry);
        }
        if(lastSalesEst!==null)   lastEntry.salesEst       = lastSalesEst;
        if(lastSalesAct!==null)   lastEntry.salesActual    = lastSalesAct;
        if(lastSalesSurpN!==null) lastEntry.salesSurpNom   = lastSalesSurpN;
        if(lastSalesSurpP!==null) lastEntry.salesSurpPct   = lastSalesSurpP;
        if(lastEpsEst!==null)     lastEntry.epsEst         = lastEpsEst;
        if(lastEpsAct!==null)     lastEntry.epsActual      = lastEpsAct;
        if(lastEpsSurpN!==null)   lastEntry.epsSurpNom     = lastEpsSurpN;
        if(lastEpsSurpP!==null)   lastEntry.epsSurpPct     = lastEpsSurpP;
      }

      updated.earningsEntries=entries;
      if(nextDate||lastDate)count++;
      return updated;
    });});
    setTimeout(function(){alertFn("Updated earnings dates for "+count+" companies.");setCalImportText("");},100);
    supaUpsert("meta",{key:"calLastUpdated",value:currentUser+" at "+todayStr()});
    setCalLastUpdatedBy(currentUser);
    setCalLastUpdated(todayStr());
  }
  function applyWeightsImport(){if(!weightsImportText.trim())return;var lines=weightsImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;var newSpecial={};lines.forEach(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var p=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var nm=p[0].toUpperCase();if(nm==="CASH"||nm==="DIVACC"){newSpecial[nm]={GL:p[1]||"",FGL:p[2]||"",IV:p[3]||"",FIV:p[4]||"",EM:p[5]||"",SC:p[6]||""};}});if(Object.keys(newSpecial).length>0){setSpecialWeights(function(prev){var updated=Object.assign({},prev,newSpecial);supaUpsert("meta",{key:"specialWeights",value:JSON.stringify(updated)});return updated;});}setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newWeights=Object.assign({},c.portWeights||{},{GL:p[1]||"",FGL:p[2]||"",IV:p[3]||"",FIV:p[4]||"",EM:p[5]||"",SC:p[6]||""});count++;return Object.assign({},c,{portWeights:newWeights});});});setTimeout(function(){alertFn("Updated weights for "+count+" companies.");setWeightsImportText("");},100);}
  function applyValImport(){if(!valImportText.trim())return;var lines=valImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newVal=Object.assign({},c.valuation||{},{pe:p[1]||"",fyMonth:p[2]||"",currency:p[3]||"",fy1:p[4]||"",eps1:p[5]||"",w1:p[6]||"",fy2:p[7]||"",eps2:p[8]||"",w2:p[9]||""});count++;return Object.assign({},c,{valuation:newVal});});});setTimeout(function(){alertFn("Updated valuation for "+count+" companies.");setValImportText("");},100);}
  function applyEstImport(){if(!estImportText.trim())return;var lines=estImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newVal=Object.assign({},c.valuation||{},{pe:p[1]||"",peCurrent:p[2]||"",peLow5:p[3]||"",peHigh5:p[4]||"",peAvg5:p[5]||"",peMed5:p[6]||"",fyMonth:p[7]||"",currency:p[8]||"",fy1:p[9]||"",eps1:p[10]||"",w1:p[11]||"",fy2:p[12]||"",eps2:p[13]||"",w2:p[14]||""});if(p[15]!==undefined&&p[15]!==""){newVal.tpFixed=p[15];newVal.tpFixedDate=todayStr();}count++;return Object.assign({},c,{valuation:newVal});});});setTimeout(function(){alertFn("Updated estimates for "+count+" companies.");setEstImportText("");},100);}
  /* Metrics upload — 31 columns matching the Excel Metrics tab exactly:
     Company, Ord Ticker, MktCap, F P/E +1, F P/E +2,
     FCF Yld +1, FCF Yld +2, Div Yld +1, Div Yld +2,
     Payout +1, Payout +2, Net D/E +1, Net D/E +2, Int Cov, LT EPS,
     Gr Mgn +1, Gr Mgn +2, Net Mgn +1, Net Mgn +2,
     GP/Ass +1, GP/Ass +2, NP/Ass +1, NP/Ass +2, Op ROE +1, Op ROE +2,
     MTD, QTD, 3M, 6M, YTD, 1 YR
     Values are decimals (0.032 for 3.2%) to match the FactSet output.
     If the user pastes with a header row, it's auto-detected and skipped. */
  function applyMetricsImport(){
    if(!metricsImportText.trim())return;
    var lines = metricsImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});
    /* Skip header row if present (first cell is not a numeric mktcap) */
    if(lines.length>0){
      var first=lines[0];
      var delim0=first.indexOf("\t")>=0?"\t":",";
      var firstParts=first.split(delim0);
      /* Header always has something like "Company" in col 0 and "MktCap" / "F P/E" in later cols */
      if(/company/i.test(firstParts[0]||"") || /mktcap/i.test(firstParts[2]||"")){
        lines.shift();
      }
    }
    /* CURRENT layout (44 cols): Company, Ord Ticker, then current+1+2
       triplets per metric, ending with two new triplets (P/B, ROE) and
       three singles (Internal Growth, 5Y / 1Y ADPS Growth). Trailing
       returns now live on the Prices upload (per-ticker, with USD context
       from the US ticker), so the Metrics upload no longer carries them.
       The parser still tolerates the legacy 35-col layout (no P/B, ROE,
       growth columns), the OLD 41-col layout (silently ignores AJ:AO if
       present) and the even-older 31-col layout (no "current" fields).
       New columns are at the END so older pastes still parse cleanly. */
    var METRIC_KEYS_NEW = [
      null, null,  // Company, Ticker — not stored on metrics
      "mktCap",
      "fpe","fpe1","fpe2",
      "fcfYld","fcfYld1","fcfYld2",
      "divYld","divYld1","divYld2",
      "payout","payout1","payout2",
      "netDE","netDE1","netDE2",
      "intCov","ltEPS",
      "grMgn","grMgn1","grMgn2",
      "netMgn","netMgn1","netMgn2",
      "gpAss","gpAss1","gpAss2",
      "npAss","npAss1","npAss2",
      "opROE","opROE1","opROE2",
      /* New ratio-comparison columns (cols 36..44 in the 1-indexed paste).
         P/B and ROE are triplets so they can show up in the +1 / 0 / +2
         horizon toggle alongside fpe etc. The three growth rates are
         single-snapshot — no horizon variant. */
      "pb","pb1","pb2",
      "roe","roe1","roe2",
      "intGr","adpsGr5","adpsGr1",
    ];
    var METRIC_KEYS_OLD = [
      null, null,
      "mktCap","fpe1","fpe2",
      "fcfYld1","fcfYld2","divYld1","divYld2",
      "payout1","payout2","netDE1","netDE2","intCov","ltEPS",
      "grMgn1","grMgn2","netMgn1","netMgn2",
      "gpAss1","gpAss2","npAss1","npAss2","opROE1","opROE2",
    ];
    /* Auto-detect layout by column count.
       Current = 35 (Company + Ticker + 33 metric cols, no perf cols).
       Legacy 41-col still accepted (perf cols 35..40 silently ignored).
       Legacy 31-col (no "current" fields, perf cols 25..30) still accepted.  */
    /* Fields stored as decimals internally (e.g. 0.032 for 3.2%). If
       user pastes in percent form (3.2 for 3.2%), divide by 100. */
    var PCT_FIELDS = {
      fcfYld:1, fcfYld1:1, fcfYld2:1,
      divYld:1, divYld1:1, divYld2:1,
      payout:1, payout1:1, payout2:1,
      netDE:1,  netDE1:1,  netDE2:1,
      ltEPS:1,
      grMgn:1,  grMgn1:1,  grMgn2:1,
      netMgn:1, netMgn1:1, netMgn2:1,
      gpAss:1,  gpAss1:1,  gpAss2:1,
      npAss:1,  npAss1:1,  npAss2:1,
      opROE:1,  opROE1:1,  opROE2:1,
      /* New ratio columns: ROE and growth rates are percent-form on the
         paste; P/B is a multiple (raw number, like P/E). */
      roe:1,    roe1:1,    roe2:1,
      intGr:1,  adpsGr5:1, adpsGr1:1,
    };
    var count=0;
    setCompanies(function(prev){
      return prev.map(function(c){
        var cname = (c.name||"").toLowerCase().trim();
        var ordTicker = ((c.tickers||[]).find(function(t){return t.isOrdinary;})||{}).ticker || c.ticker || "";
        var ordTickerLc = ordTicker.toLowerCase();
        var match = lines.find(function(l){
          var delim = l.indexOf("\t")>=0?"\t":",";
          var p = l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});
          if((p[0]||"").toLowerCase().trim() === cname) return true;
          if(ordTickerLc && (p[1]||"").toLowerCase().trim() === ordTickerLc) return true;
          return false;
        });
        if(!match) return c;
        var delim = match.indexOf("\t")>=0?"\t":",";
        var parts = match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});
        function num(i){ var n = parseFloat(parts[i]); return isNaN(n) ? null : n; }
        /* Choose layout: prefer NEW (41-col) when row has >=36 fields;
           fall back to OLD (31-col) when shorter. Half-filled rows with
           only a few numeric fields still work — unmapped indices are
           just ignored. */
        /* Decide which key map to use. The triplet-style "new" layout
           is the current 35-col format (and the 41-col legacy with
           trailing perf cols we now ignore). Single-value "old" layout
           is the 31-col legacy (or 25-col without perf). */
        /* useNew triggers for both the 35-col layout (no ratio cols) and
           the 44-col layout (with ratio cols). Both share the same
           METRIC_KEYS_NEW prefix, so the loop just stops earlier when the
           paste is 35 cols and reads ratios when it's 44. */
        var useNew = parts.length >= 35;
        var METRIC_KEYS = useNew ? METRIC_KEYS_NEW : METRIC_KEYS_OLD;
        /* Percent-kind fields go through pctToDecimal (shared helper in
           utils/format.js). Non-percent fields (mktCap, fpe*, intCov)
           stay numeric. Keeps metrics + dashboard upload percent-handling
           consistent and tested in one place. */
        var m = {};
        for(var i=2; i<METRIC_KEYS.length; i++){
          var key = METRIC_KEYS[i];
          if(!key) continue;
          var v = PCT_FIELDS[key] ? pctToDecimal(parts[i]) : num(i);
          if(v !== null) m[key] = v;
        }
        /* Trailing perf no longer parsed from this upload — lives on the
           Prices import (per ticker, with USD context). If a legacy 41-col
           row is pasted, the trailing 6 perf cells are silently ignored. */
        if(Object.keys(m).length === 0) return c;
        count++;
        return Object.assign({},c,{metrics:m});
      });
    });
    setTimeout(function(){alertFn("Updated metrics for "+count+" companies.");setMetricsImportText("");},100);
  }

  /* Benchmark weights upload. Paste format is 4 columns:
       Benchmark, Type, Name, Weight%
     Type is "Sector" or "Country". Rows for the same benchmark are merged
     (so you can paste sectors and countries together). Weights should be
     percent (e.g. 11.2 for 11.2%). A header row, if present, is skipped.
     asOf is an optional quarter label like "2026 Q1" stored per benchmark. */
  function applyBenchmarkImport(){
    if(!benchmarkImportText.trim())return;
    var lines=benchmarkImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});
    /* Skip header if present. Header heuristic: first cell is "Benchmark"
       or "Date", or any of the type tokens appears in cols 1-2. */
    var first=lines[0];
    if(first){
      var delim0=first.indexOf("\t")>=0?"\t":",";
      var firstParts=first.split(delim0).map(function(s){return s.trim().replace(/^"|"$/g,"");});
      var c0=firstParts[0]||"", c1=firstParts[1]||"", c2=firstParts[2]||"";
      if(/^benchmark$|^date$|^name$/i.test(c0) || /^benchmark$|^name$|^type$/i.test(c1) || /^sector$|^country$|^metric$/i.test(c1) || /^type$/i.test(c2)) {
        lines.shift();
      }
    }
    /* Percent-type metric keys — values pasted in percent form get divided
     * by 100 so benchmark metrics are stored in the same decimal
     * convention as company metrics (0.072 = 7.2%). x/ratio/bn keys are
     * stored raw (e.g. fpe1 = 19.2 not 0.192). */
    var PCT_METRIC_RE=/^(fcfYld|divYld|payout|netDE|ltEPS|grMgn|netMgn|gpAss|npAss|opROE|roe|intGr|adpsGr1|adpsGr5)[12]?$/;
    /* Ratio Item labels accepted on the dated benchmark import, with the
       canonical key + display kind they map to. Aliases are matched
       case-insensitively against the trimmed Item cell. The "kind" is
       used by the Characteristics view to format and to know whether the
       value should be percent-converted on import. Keep the keys distinct
       from the metric bucket's keys so the same name can mean different
       things in different buckets if needed. */
    var RATIO_ALIASES = [
      /* Mkt cap variants — extreme values + weighted/median/average. */
      { aliases: ["MARKET CAP (LARGEST)", "MKT CAP LARGEST", "LARGEST MKTCAP", "MAX MKTCAP", "LARGEST MARKET CAP"],
                                                                                                          key: "mcLargest", kind: "musd" },
      { aliases: ["MARKET CAP (SMALLEST)", "MKT CAP SMALLEST", "SMALLEST MKTCAP", "MIN MKTCAP", "SMALLEST MARKET CAP"],
                                                                                                          key: "mcSmallest", kind: "musd" },
      { aliases: ["MARKET CAP (WGT. AVERAGE)", "MARKET CAP (WGT AVERAGE)", "WGT AVG MKTCAP", "WEIGHTED AVERAGE MARKET CAP", "MARKET CAP WGT AVG"],
                                                                                                          key: "mcWtdAvg",   kind: "musd" },
      { aliases: ["MARKET CAP (AVERAGE)", "AVERAGE MKTCAP", "AVERAGE MKTCAP (M USD)", "AVG MKTCAP", "AVG MARKET CAP", "AVERAGE MARKET CAP"],
                                                                                                          key: "avgMktCap", kind: "musd" },
      { aliases: ["MARKET CAP (MEDIAN)", "MEDIAN MKTCAP", "MEDIAN MKTCAP (M USD)", "MED MKTCAP", "MEDIAN MARKET CAP"],
                                                                                                          key: "medMktCap", kind: "musd" },
      /* Concentration / count. */
      { aliases: ["NUMBER OF HOLDINGS", "# HOLDINGS", "HOLDINGS COUNT", "N HOLDINGS"],                    key: "nHoldings",  kind: "int"  },
      { aliases: ["ACTIVE SHARE"],                                                                        key: "activeShare",kind: "pct"  },
      /* Valuation. */
      { aliases: ["PRICE TO EARNINGS", "PRICE TO EARNINGS (LAST 12 MOS.)", "PRICE TO EARNINGS (LAST 12 MOS)", "P/E LTM", "P/E (LAST 12 MOS.)", "P/E", "PE"],
                                                                                                          key: "pe",        kind: "x"    },
      { aliases: ["PRICE TO EARNINGS (EXCL. NEGATIVES)", "PRICE TO EARNINGS EXCL NEGATIVES", "P/E EXCL NEGATIVES", "P/E (EXCL. NEG.)", "PE EXCL NEG"],
                                                                                                          key: "peExcl",    kind: "x"    },
      { aliases: ["PRICE TO BOOK VALUE", "PRICE TO BOOK", "P/B", "PB"],                                   key: "pb",        kind: "x"    },
      { aliases: ["PRICE TO BOOK (LAST 12 MOS.)", "PRICE TO BOOK (LAST 12 MOS)", "P/B LTM", "P/B (LTM)"], key: "pbLtm",     kind: "x"    },
      { aliases: ["PRICE TO SALES", "P/S", "PS"],                                                         key: "ps",        kind: "x"    },
      { aliases: ["PRICE TO CASH FLOW", "P/CF", "PCF"],                                                   key: "pcf",       kind: "x"    },
      { aliases: ["FWD PRICE TO EARN", "FORWARD PRICE TO EARNINGS", "PRICE TO EARNINGS (FWD. 12 MOS.)", "PRICE TO EARNINGS (FWD 12 MOS)", "FWD P/E", "FORWARD P/E",
                  /* FactSet's actual export has a typo: "EARNIGS" without the 'N'. */
                  "PRICE TO EARNIGS (FWD. 12 MOS.)", "PRICE TO EARNIGS (FWD 12 MOS)"],
                                                                                                          key: "fwdPe",     kind: "x"    },
      /* Returns. */
      { aliases: ["ROE", "RETURN ON EQUITY", "RETURN ON EQUITY (1Y)", "ROE 1Y"],                          key: "roe",       kind: "pct"  },
      { aliases: ["RETURN ON EQUITY (5Y)", "ROE 5Y", "ROE (5Y)"],                                         key: "roe5y",     kind: "pct"  },
      /* Growth. */
      { aliases: ["EPS GROWTH (1Y FWD.)", "EPS GROWTH (1Y FWD)", "EPS GROWTH 1Y FWD", "1YR EPS GROWTH FWD"],
                                                                                                          key: "epsGrFwd1", kind: "pct"  },
      { aliases: ["EPS GROWTH (3-5Y FWD.)", "EPS GROWTH (3-5Y FWD)", "EPS GROWTH 3-5Y FWD", "EPS LT GROWTH"],
                                                                                                          key: "epsGrFwd35",kind: "pct"  },
      { aliases: ["EPS GROWTH (3Y HIST.)", "EPS GROWTH (3Y HIST)", "EPS GROWTH 3Y HIST", "3YR HIST EPS GROWTH"],
                                                                                                          key: "epsGrHist3",kind: "pct"  },
      { aliases: ["EPS GROWTH (5Y HIST.)", "EPS GROWTH (5Y HIST)", "5 YEARS ADPS GROWTH RATE", "5YR ADPS GROWTH", "5Y ADPS GROWTH", "ADPS 5Y"],
                                                                                                          key: "adpsGr5",   kind: "pct"  },
      { aliases: ["EPS GROWTH (1Y HIST.)", "EPS GROWTH (1Y HIST)", "1 YEAR ADPS GROWTH RATE", "1YR ADPS GROWTH", "1Y ADPS GROWTH", "ADPS 1Y"],
                                                                                                          key: "adpsGr1",   kind: "pct"  },
      { aliases: ["CURR INTERNAL GROWTH RATE", "INTERNAL GROWTH", "INTERNAL GROWTH RATE", "INT GROWTH"],  key: "intGr",     kind: "pct"  },
      /* Yield / payout. */
      { aliases: ["DIVIDEND YIELD", "MONTHLY YIELD", "DIV YLD", "DIV YIELD"],                             key: "divYld",    kind: "pct"  },
      { aliases: ["PAYOUT RATIO", "PAYOUT"],                                                              key: "payout",    kind: "pct"  },
      /* Leverage. */
      { aliases: ["DEBT TO CAPITAL", "DEBT/CAPITAL", "DEBT-TO-CAP"],                                      key: "debtCap",   kind: "pct"  },
      { aliases: ["NET DEBT TO EQUITY", "NET DEBT/EQUITY", "NET D/E"],                                    key: "netDE",     kind: "pct"  },
    ];
    function resolveRatioKey(itemRaw) {
      const u = (itemRaw||"").trim().toUpperCase();
      if (!u) return null;
      for (let i = 0; i < RATIO_ALIASES.length; i++) {
        const def = RATIO_ALIASES[i];
        for (let j = 0; j < def.aliases.length; j++) {
          if (def.aliases[j] === u) return def;
        }
      }
      return null;
    }
    /* m/d/yyyy or mm/dd/yyyy → ISO YYYY-MM-DD. Returns null if not a date. */
    function parseDateMDY(s){
      if(!s)return null;
      var m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if(!m)return null;
      var mm=parseInt(m[1],10),dd=parseInt(m[2],10),yy=parseInt(m[3],10);
      if(yy<100)yy+=2000;
      if(mm<1||mm>12||dd<1||dd>31)return null;
      return yy+"-"+(mm<10?"0":"")+mm+"-"+(dd<10?"0":"")+dd;
    }
    /* current snapshot rows (4-col), keyed by bm name */
    var affected={};
    /* dated history rows (5-col), keyed by [bm][isoDate] */
    var historyRows={};
    var dropped=0;
    /* Track WHY rows were dropped + sample the offending rows. Without
       this the user has no way to debug a "206 rows skipped" message
       beyond manually scanning their paste. */
    var dropReasons = {}; /* { reason: count } */
    var dropSamples = {}; /* { reason: [first 3 raw lines] } */
    var unknownItems = {}; /* { upper-cased item label: count } — for ratios specifically */
    function recordDrop(reason, line) {
      dropped++;
      dropReasons[reason] = (dropReasons[reason] || 0) + 1;
      if (!dropSamples[reason]) dropSamples[reason] = [];
      if (dropSamples[reason].length < 3) dropSamples[reason].push(line);
    }
    lines.forEach(function(line){
      var delim=line.indexOf("\t")>=0?"\t":",";
      var p=line.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});
      if(p.length<4){recordDrop("too few columns (<4)", line); return;}
      /* Detect 5-col dated format: first cell parses as a date. Otherwise
         treat as the legacy 4-col (current-snapshot) format. */
      var dateIso=parseDateMDY(p[0]);
      var bm,type,name,w;
      if(dateIso && p.length>=5){
        bm=p[1]; type=(p[2]||"").toLowerCase(); name=p[3]; w=parseFloat(p[4]);
      } else {
        bm=p[0]; type=(p[1]||"").toLowerCase(); name=p[2]; w=parseFloat(p[3]);
      }
      if(!bm){recordDrop("missing benchmark/portfolio name", line); return;}
      if(!name){recordDrop("missing item name", line); return;}
      if(isNaN(w)){
        /* Distinguish "data not available" sentinels from real parse
           failures. FactSet leaves blanks, "--", "N/A" etc. for periods
           where a metric isn't reported — those aren't user errors and
           shouldn't surface in the panic list. We silently skip them
           by not calling recordDrop(); the row is still excluded from
           storage but the count doesn't appear in the alert. */
        var raw = (dateIso && p.length>=5) ? (p[4]||"") : (p[3]||"");
        var rawTrim = raw.trim();
        if (rawTrim === "" || /^(--|—|n\/?a|#n\/?a|null|#ref!?|@na)$/i.test(rawTrim)) {
          /* Missing data — silent skip. */
          return;
        }
        recordDrop("non-numeric value '"+rawTrim+"'", line);
        return;
      }
      var bucket=type.indexOf("country")>=0?"countries"
              :type.indexOf("sector") >=0?"sectors"
              :type.indexOf("metric") >=0?"metrics"
              :type.indexOf("ratio")  >=0?"ratios"
              :null;
      if(!bucket){recordDrop("unknown type '"+type+"' (expected Sector/Country/Metric/Ratio)", line); return;}
      /* Bucket-specific normalization. metrics already use a fixed
         decimal/percent-form rule. Ratios get the same treatment but
         resolved via RATIO_ALIASES so users can paste FactSet-style
         human labels ("PRICE TO BOOK VALUE") instead of canonical keys. */
      var storedName = name;
      if(bucket==="metrics" && PCT_METRIC_RE.test(name)) w=w/100;
      if(bucket==="ratios"){
        var def = resolveRatioKey(name);
        if(!def){
          var k=(name||"").trim().toUpperCase();
          unknownItems[k]=(unknownItems[k]||0)+1;
          recordDrop("unrecognized ratio item label", line);
          return;
        }
        storedName = def.key;
        if(def.kind==="pct") w=w/100;
        /* Auto-correct decimal-form multiples for x-kind ratios. Real
           P/E, P/B, Fwd P/E etc. are always >= 1; if the pasted value
           is < 1 it almost certainly means FactSet exported as a
           "yield" (1/multiple) or in some other decimal form. Multiply
           by 100 to recover the multiple. Same convention the migration
           uses retroactively. */
        if(def.kind==="x" && Math.abs(w) > 0 && Math.abs(w) < 1) w=w*100;
      }
      if(dateIso){
        if(!historyRows[bm])historyRows[bm]={};
        if(!historyRows[bm][dateIso])historyRows[bm][dateIso]={sectors:{},countries:{},metrics:{},ratios:{}};
        historyRows[bm][dateIso][bucket][storedName]=w;
      } else {
        if(!affected[bm])affected[bm]={sectors:{},countries:{},metrics:{},ratios:{},asOf:benchmarkAsOf||""};
        affected[bm][bucket][storedName]=w;
      }
    });
    /* Surface drop diagnostics — console for the full breakdown, alert
       for a quick read. The console block is most useful when the user
       has a few hundred drops; a curated alert summary mentions the top
       reasons + unrecognized items. */
    if (dropped > 0) {
      /* eslint-disable no-console */
      console.warn("[Benchmark import] "+dropped+" rows skipped. Reasons:", dropReasons);
      console.warn("[Benchmark import] sample skipped rows by reason:", dropSamples);
      if (Object.keys(unknownItems).length > 0) {
        console.warn("[Benchmark import] unrecognized ratio Item labels (counts):", unknownItems);
      }
      /* eslint-enable no-console */
    }
    if(Object.keys(affected).length===0 && Object.keys(historyRows).length===0){
      alertFn("No valid rows parsed. Formats:\n"
            + "  Current snapshot: Benchmark, Type (Sector|Country|Metric|Ratio), Name, Value\n"
            + "  Quarterly history: Date (m/d/yyyy), Name, Type, Item, Value\n"
            + "Name in the dated format may be either a benchmark (e.g. MSCI ACWI) or a portfolio code (FGL, GL, FIN, IN, EM, SC).\n"
            + "Type=Ratio accepts the 11 FactSet labels (AVERAGE MKTCAP, PRICE TO EARNINGS, PRICE TO BOOK VALUE, ROE, FWD PRICE TO EARN, CURR INTERNAL GROWTH RATE, 5 YEARS ADPS GROWTH RATE, 1 YEAR ADPS GROWTH RATE, PAYOUT RATIO, MONTHLY YIELD, MEDIAN MKTCAP).");
      return;
    }
    if(Object.keys(affected).length>0){
      setBenchmarkWeights(function(prev){
        var next=Object.assign({},prev);
        Object.keys(affected).forEach(function(bm){
          var cur=next[bm]||{sectors:{},countries:{},metrics:{},ratios:{},asOf:""};
          /* Merge: for each bucket, incoming REPLACES existing when the
           * paste included that bucket. Untouched buckets are preserved so
           * you can upload sectors/countries one week and metrics the
           * next without clobbering. */
          var inc=affected[bm];
          next[bm]={
            sectors:   Object.keys(inc.sectors  ).length>0 ? inc.sectors   : (cur.sectors  ||{}),
            countries: Object.keys(inc.countries).length>0 ? inc.countries : (cur.countries||{}),
            metrics:   Object.keys(inc.metrics  ).length>0 ? inc.metrics   : (cur.metrics  ||{}),
            ratios:    Object.keys(inc.ratios   ).length>0 ? inc.ratios    : (cur.ratios   ||{}),
            asOf: inc.asOf || cur.asOf || "",
          };
        });
        return next;
      });
    }
    /* History upserts. Each (name, date) bucket is REPLACED when present
       in the paste — so re-uploading 2026-03-31 with a different sector
       set overwrites that quarter rather than merging. Other quarters and
       other names are untouched. */
    if(Object.keys(historyRows).length>0){
      setBreakdownHistory(function(prev){
        var next=Object.assign({},prev||{});
        Object.keys(historyRows).forEach(function(name){
          var byDate=Object.assign({},next[name]||{});
          Object.keys(historyRows[name]).forEach(function(d){
            byDate[d]=historyRows[name][d];
          });
          next[name]=byDate;
        });
        return next;
      });
    }
    var n_curr=Object.keys(affected).length;
    var n_hist=Object.keys(historyRows).reduce(function(s,k){return s+Object.keys(historyRows[k]).length;},0);
    var n_hist_names=Object.keys(historyRows).length;
    var parts=[];
    if(n_curr>0)parts.push("current snapshot for "+n_curr+" benchmark(s): "+Object.keys(affected).join(", "));
    if(n_hist>0)parts.push("history: "+n_hist+" quarter(s) across "+n_hist_names+" name(s) ("+Object.keys(historyRows).join(", ")+")");
    var msg="Updated "+parts.join("; ");
    if(dropped>0){
      msg+="\n\n"+dropped+" row(s) skipped. Top reasons:\n";
      Object.keys(dropReasons)
        .sort(function(a,b){return dropReasons[b]-dropReasons[a];})
        .slice(0,4)
        .forEach(function(r){
          msg+="  • "+dropReasons[r]+"× "+r+"\n";
        });
      var unkKeys=Object.keys(unknownItems);
      if(unkKeys.length>0){
        msg+="\nUnrecognized Ratio Item labels (paste these EXACTLY as shown if FactSet uses them, or tell me to add aliases):\n";
        unkKeys.slice(0,8).forEach(function(k){msg+="  • "+k+" ("+unknownItems[k]+"×)\n";});
        if(unkKeys.length>8)msg+="  …+"+(unkKeys.length-8)+" more (see browser console)\n";
      }
      msg+="\n(Open browser console for full sample list.)";
    }
    setTimeout(function(){alertFn(msg);setBenchmarkImportText("");},100);
  }

  /* Markets dashboard upload — manual path equivalent to what the
     daily FactSet script does. Supports two formats mixed in one paste:

     1. Flat 10-col section rows:
          Section, Label, Ticker, 1D, 5D, MTD, QTD, YTD, 1Y, 3Y
        Section ∈ Indices / Sectors / Countries / Commodities / Bonds.

     2. FX matrix blocks (optional; can be appended after flat rows):
          FX - 3M %
                  USD    EUR    GBP    JPY    CAD
          USD            0.5    0.8    1.2    0.3
          EUR    -0.5           0.3    0.7   -0.1
          ...
          FX - 12M %
          ... (same structure)

     The parser detects matrix blocks by a header line containing
     "FX - 3M" or "FX - 12M" (case-insensitive; the leading ">" in
     Excel-exported header rows is ignored). Values are decimals or
     percent-form — auto-detected by magnitude.

     Replaces snapshot sections in the paste; unaffected sections are
     preserved (FX matrix only overwritten if an FX block is included). */
  function applyDashboardImport(){
    if(!dashboardImportText.trim())return;
    /* Parsing is fully delegated to the pure parser in
       utils/dashboardParser.js (unit-tested there). This hook only
       handles the state update + Supabase write. */
    var parsed=parseDashboardUpload(dashboardImportText);
    var bySection=parsed.bySection;
    var fxMatrices=parsed.fxMatrices;
    var dropped=parsed.dropped;
    var hasFlat=Object.keys(bySection).some(function(k){return bySection[k].length>0;});
    var hasFx=Object.keys(fxMatrices).length>0;
    if(!hasFlat && !hasFx){alertFn("No valid rows parsed. Expected flat rows (Section, Label, Ticker, TODAY, 5D, MTD, 1M, QTD, 3M, 6M, YTD, 1Y, 2Y, 3Y) and/or FX matrix blocks.");return;}

    (async function(){
      var existing={};
      try{
        var r=await supaGet("meta","key","marketsSnapshot");
        if(r&&r.value)existing=JSON.parse(r.value);
      }catch(e){}
      var next=Object.assign({},existing,{asOf:new Date().toISOString()});
      Object.keys(bySection).forEach(function(k){
        if(bySection[k].length>0)next[k]=bySection[k];
      });
      if(fxMatrices["3M"]){
        next.fxMatrix3M=fxMatrices["3M"];
        /* Backward-compat vs-USD list = first column of matrix */
        next.fx3M=fxMatrices["3M"].rows.map(function(r){
          return {label:r.label, value:r.values[0]};
        }).filter(function(x){return x.value!==null;});
      }
      if(fxMatrices["12M"]){
        next.fxMatrix12M=fxMatrices["12M"];
        next.fx12M=fxMatrices["12M"].rows.map(function(r){
          return {label:r.label, value:r.values[0]};
        }).filter(function(x){return x.value!==null;});
      }
      supaUpsert("meta",{key:"marketsSnapshot",value:JSON.stringify(next)});
      var bits=Object.keys(bySection).filter(function(k){return bySection[k].length>0;}).map(function(k){return k+"("+bySection[k].length+")";});
      if(fxMatrices["3M"])bits.push("fxMatrix3M("+fxMatrices["3M"].rows.length+"x"+fxMatrices["3M"].cols.length+")");
      if(fxMatrices["12M"])bits.push("fxMatrix12M("+fxMatrices["12M"].rows.length+"x"+fxMatrices["12M"].cols.length+")");
      var msg="Updated "+bits.join(", ");
      if(dropped>0)msg+=" — skipped "+dropped+" invalid row(s)";
      setTimeout(function(){alertFn(msg);setDashboardImportText("");},100);
    })();
  }

  /* Keys we round-trip in the export's `meta` block. Each key maps to a
     {get, set, supaKey} triple — get reads the current value off the
     context, set is the React setter, supaKey is the meta-table row
     for persistence. Keeping the list explicit here means new context
     fields don't get accidentally serialized; we add them deliberately. */
  function metaSpec(){
    return {
      fxRates:             { get: ctx.fxRates,             set: ctx.setFxRates,             supaKey: "fxRates" },
      repData:             { get: ctx.repData,             set: ctx.setRepData,             supaKey: "repData" },
      specialWeights:      { get: ctx.specialWeights,      set: ctx.setSpecialWeights,      supaKey: "specialWeights" },
      benchmarkWeights:    { get: ctx.benchmarkWeights,    set: ctx.setBenchmarkWeights,    supaKey: "benchmarkWeights" },
      breakdownHistory:    { get: ctx.breakdownHistory,    set: ctx.setBreakdownHistory,    supaKey: "breakdownHistory" },
      marketsSnapshot:     { get: ctx.marketsSnapshot,     set: ctx.setMarketsSnapshot,     supaKey: "marketsSnapshot" },
      perfData:            { get: ctx.perfData,            set: ctx.setPerfData,            supaKey: "perfData" },
      alertRules:          { get: ctx.alertRules,          set: ctx.setAlertRules,          supaKey: "alertRules" },
      annotations:         { get: ctx.annotations,         set: null /* no setter exposed */, supaKey: "annotations" },
      researchAssignments: { get: ctx.researchAssignments, set: ctx.setResearchAssignments, supaKey: "researchAssignments" },
      feedback:            { get: ctx.feedback,            set: ctx.setFeedback,            supaKey: "feedback" },
      entryComments:       { get: ctx.entryComments,       set: ctx.setEntryComments,       supaKey: "entryComments" },
      lastPriceUpdate:     { get: ctx.lastPriceUpdate,     set: ctx.setLastPriceUpdate,     supaKey: "lastPriceUpdate" },
    };
  }

  function importAll(){
    setImportError("");
    try{
      var d = JSON.parse(importText);
      var cos = d.companies || (Array.isArray(d) ? d : null);
      var lib = d.library || null;
      var meta = d.meta || null;
      if(!cos && !lib && !meta){ setImportError("No data found."); return; }
      if(cos && Array.isArray(cos)){
        setCompanies(cos);
        supaUpsert("companies", { id: "shared", data: JSON.stringify(cos) });
      }
      if(lib && Array.isArray(lib)){
        setSaved(lib);
        supaUpsert("library", { id: "shared", data: JSON.stringify(lib) });
      }
      if(meta && typeof meta === "object"){
        var spec = metaSpec();
        Object.keys(meta).forEach(function(k){
          var s = spec[k];
          if(!s) return; /* unknown key — silently skip */
          var v = meta[k];
          if(s.set) s.set(v);
          var serialized = (v === null || v === undefined)
            ? null
            : (typeof v === "string" ? v : JSON.stringify(v));
          if(serialized !== null) supaUpsert("meta", { key: s.supaKey, value: serialized });
        });
      }
      setImportText("");
      setShowDataPanel(false);
    }
    catch(e){ setImportError("Invalid JSON: " + e.message); }
  }
  /* Shared import helper for time-series pastes (Ratio Analysis and
     Financial Statements). First non-empty line before the year header
     is the company name (fuzzy-matched against company.name /
     usTickerName using the same normalize() family as Tx import).
     Re-importing replaces the stored data wholesale. Stores to
     company[dataKey]. */
  function _applyTimeSeriesImport(text, dataKey, label, clearText, parseOpts){
    if(!text || !text.trim())return;
    var parsed = parseRatioPaste(text, parseOpts);
    if(parsed.error){ alertFn("Couldn't parse " + label + ": " + parsed.error); return; }
    if(!parsed.companyName){ alertFn("Could not find a company name above the year header. The first non-empty line should be the company name."); return; }
    if(parsed.ratioNames.length===0){ alertFn("Parser found years but no data rows. Did the paste include the table body?"); return; }

    var targetName = parsed.companyName;
    var match = findCompanyByName(companies, targetName);
    if(!match){
      alertFn('No company matched "' + targetName + '". Add the company first (or check spelling), then re-import.');
      return;
    }

    var next = {
      years: parsed.years,
      estimate: parsed.estimate,
      sections: parsed.sections,
      ratioNames: parsed.ratioNames,
      values: parsed.values,
      updatedAt: new Date().toISOString(),
    };
    var updated = Object.assign({}, match, { [dataKey]: next });
    setCompanies(function(cs){ return cs.map(function(c){ return c.id===updated.id ? updated : c; }); });
    setTimeout(function(){
      alertFn('Imported ' + parsed.ratioNames.length + ' ' + label + ' × ' + parsed.years.length + ' years for "' + match.name + '".' + (parsed.dropped>0 ? '  ('+parsed.dropped+' duplicate rows overwritten)' : ''));
      if(clearText) clearText("");
    }, 50);
  }

  function applyRatioImport()      { _applyTimeSeriesImport(ratioImportText,     "ratios",     "ratios",     setRatioImportText); }
  function applyFinancialsImport() { _applyTimeSeriesImport(financialsImportText, "financials", "line items", setFinancialsImportText, { defaultSectionName: "Income Statement" }); }

  /* Segments + Geography import. Same fuzzy-name matching as the time-series
     imports; replaces company.segments wholesale on each upload. */
  function applySegmentsImport(){
    if(!segmentsImportText.trim())return;
    var parsed = parseSegmentsPaste(segmentsImportText);
    if(parsed.error){ alertFn("Couldn't parse segments: " + parsed.error); return; }
    if(!parsed.companyName){ alertFn("Could not find a company name above the year header. The first non-empty line should be the company name."); return; }
    /* Accept the paste if EITHER segments OR any geography section
       (FactSet-reported regions or standardized) has data. Pre-existing
       segment data is preserved when the user re-uploads with only the
       geography portion. */
    var hasSegments = parsed.segments && parsed.segments.length > 0;
    var hasFactsetGeo = parsed.geography && parsed.geography.regions && parsed.geography.regions.length > 0;
    var hasStdGeo = parsed.geography && parsed.geography.standardized
      && parsed.geography.standardized.regions && parsed.geography.standardized.regions.length > 0;
    if(!hasSegments && !hasFactsetGeo && !hasStdGeo){
      alertFn("Parser found years but no segment, geography, or standardized region rows. Did the paste include the table body?");
      return;
    }

    var targetName = parsed.companyName;
    var match = findCompanyByName(companies, targetName);
    if(!match){
      alertFn('No company matched "' + targetName + '". Add the company first, then re-import.');
      return;
    }

    /* If the new paste has no segment rows but the company already had
       segments saved, preserve the prior segments + parsedTotal so a
       geography-only paste doesn't blow them away. Geography is always
       replaced (it's the section the user is updating). */
    var prior = match.segments || {};
    var next = {
      years:              parsed.years,
      endDates:           parsed.endDates,
      fiscalYearEndMonth: parsed.fiscalYearEndMonth,
      segments:           hasSegments ? parsed.segments : (prior.segments || []),
      geography:          parsed.geography,
      parsedTotal:        hasSegments ? parsed.parsedTotal : (prior.parsedTotal || null),
      updatedAt:          new Date().toISOString(),
    };
    var updated = Object.assign({}, match, { segments: next });
    setCompanies(function(cs){ return cs.map(function(c){ return c.id===updated.id ? updated : c; }); });
    setTimeout(function(){
      var n = parsed.segments.length;
      var g = parsed.geography && parsed.geography.regions ? parsed.geography.regions.length : 0;
      alertFn('Imported ' + n + ' segments + ' + g + ' regions × ' + parsed.years.length + ' years for "' + match.name + '".');
      setSegmentsImportText("");
    }, 50);
  }

  /* Bulk EPS Revisions import — paste a sheet with one row per company.
     Header row 1 has dates in E1:Q1; each data row has ticker, name,
     and 56 monthly EPS estimate values across 4 horizons. Matches
     companies by ticker first (uppercase exact), then falls back to
     the same fuzzy-name match used by the Tx import. */
  function applyEpsRevImport(){
    if(!epsRevImportText.trim())return;
    var parsed = parseEpsRevisionsPaste(epsRevImportText);
    if(parsed.error){ alertFn("Couldn't parse EPS revisions: " + parsed.error); return; }
    if(!parsed.rows || parsed.rows.length === 0){ alertFn("No data rows found in the paste."); return; }

    /* Build a single map by id of new epsRevisions to apply. */
    var updatesById = {};
    var matchedCount = 0;
    var unmatched = [];
    var asOf = new Date().toISOString();

    parsed.rows.forEach(function(row){
      var match = findCompanyByTickerOrName(companies, row.ticker, row.name);
      if(!match){
        unmatched.push(row.ticker || row.name || "(unknown)");
        return;
      }
      updatesById[match.id] = {
        asOf: asOf,
        dates: parsed.dates,
        series: row.series,
      };
      matchedCount++;
    });

    if(matchedCount === 0){
      alertFn("No companies matched. Check ticker spellings or company names. Unmatched: " + unmatched.slice(0,10).join(", "));
      return;
    }

    setCompanies(function(cs){
      return cs.map(function(c){
        var u = updatesById[c.id];
        if(!u) return c;
        return Object.assign({}, c, { epsRevisions: u });
      });
    });

    setTimeout(function(){
      var msg = "Imported EPS revisions for " + matchedCount + " companies.";
      if(unmatched.length > 0){
        msg += " Unmatched (" + unmatched.length + "): " + unmatched.slice(0,10).join(", ");
        if(unmatched.length > 10) msg += " …";
      }
      if(parsed.dropped > 0){
        msg += "  (" + parsed.dropped + " row(s) skipped — no ticker or name)";
      }
      alertFn(msg);
      setEpsRevImportText("");
    }, 50);
  }

  /* Guidance import — paste a FactSet "Guidance History" block for one
     company at a time. Parser auto-locates the title (with ticker in
     parentheses) and the "Date Issued" header row, so the user can paste
     B2:M58 verbatim without trimming the header metadata.
     - Matches the company by ticker first, falls back to fuzzy name.
     - Replaces c.guidance.history wholesale (re-paste each quarter).
     - Stores all rows including closed-FY rows where Actual is populated;
       the GuidanceTab uses those at render time as the Y/Y baseline. */
  function applyGuidanceImport(){
    if(!guidanceImportText.trim())return;
    var parsed = parseGuidancePaste(guidanceImportText);
    if(parsed.error){ alertFn("Couldn't parse guidance: " + parsed.error); return; }
    if(parsed.rows.length === 0){ alertFn("Parser found a header but no usable data rows."); return; }
    var match = findCompanyByTickerOrName(companies, parsed.ticker, parsed.companyName);
    if(!match){
      alertFn('No company matched ticker "' + (parsed.ticker||"?") + '" or name "' + (parsed.companyName||"?") + '". Add the company first, then re-import.');
      return;
    }
    var nextGuidance = {
      ticker: parsed.ticker || null,
      companyName: parsed.companyName || null,
      nextReportDate: parsed.nextReportDate || null,
      history: parsed.rows,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser || "",
    };
    var updated = Object.assign({}, match, { guidance: nextGuidance });
    setCompanies(function(cs){ return cs.map(function(c){ return c.id === updated.id ? updated : c; }); });
    setTimeout(function(){
      /* Summarize: how many distinct metrics, periods, and closed FYs (with actuals). */
      var metrics = {}, periods = {}, closed = 0;
      parsed.rows.forEach(function(r){ metrics[r.item]=true; periods[r.period]=true; if(r.actual!==null) closed++; });
      var msg = 'Imported ' + parsed.rows.length + ' guidance rows for "' + match.name + '" — ' +
        Object.keys(metrics).length + ' metrics × ' + Object.keys(periods).length + ' fiscal periods.';
      if(closed > 0) msg += '  (' + closed + ' rows have Actual populated for Y/Y baseline.)';
      if(parsed.dropped > 0) msg += '  (' + parsed.dropped + ' rows skipped — empty / no item / no values.)';
      alertFn(msg);
      setGuidanceImportText("");
    }, 50);
  }

  /* Full-fidelity backup. Bundles:
       - companies (everything per-company, including guidance/financials/etc.)
       - library
       - meta (fxRates / repData / marketsSnapshot / alertRules / etc.)
     The output is a JSON dump that round-trips through importAll —
     paste it back to fully restore the workspace. Triggers a clipboard
     copy when permitted; falls back to populating the import textarea
     so the user can copy from there. */
  /* Build the full backup payload: companies + library + every meta key
     declared in metaSpec(). Used by both the clipboard-copy variant
     (exportAll) and the file-download variant (downloadBackup). */
  function buildBackupPayload(){
    var spec = metaSpec();
    var meta = {};
    Object.keys(spec).forEach(function(k){
      var v = spec[k].get;
      if(v === undefined || v === null) return;
      /* Empty-string lastPriceUpdate is meaningful; serialize anyway. */
      if(typeof v === "object" && Object.keys(v).length === 0 && !Array.isArray(v)) return;
      meta[k] = v;
    });
    return {
      companies: companies,
      library: saved,
      meta: meta,
      exportedAt: new Date().toISOString(),
      schemaVersion: 2, /* v1 = pre-meta; v2 = meta included */
    };
  }
  function exportAll(){
    var txt = JSON.stringify(buildBackupPayload(), null, 2);
    try{
      var el = document.createElement("textarea");
      el.value = txt;
      el.style.position = "fixed"; el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus(); el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied("exportall");
      setTimeout(function(){ setCopied(null); }, 2000);
    }catch(e){
      setImportText(txt);
      setShowDataPanel(true);
    }
  }
  /* Download the same backup payload as a .json file. Preferred path
     for monthly/manual backups since the file lands directly in the
     user's Downloads folder, no clipboard overhead. Filename includes
     the timestamp so successive backups don't overwrite. */
  function downloadBackup(){
    var payload = buildBackupPayload();
    var txt = JSON.stringify(payload, null, 2);
    var stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    var filename = "research-hub-backup-" + stamp + ".json";
    try{
      var blob = new Blob([txt], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      /* Revoke after a short delay so Chrome has time to start the download. */
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      setCopied("downloadbackup");
      setTimeout(function(){ setCopied(null); }, 2000);
    }catch(e){
      /* Fallback: surface the JSON in the import textarea so the user
         can save manually. Same fallback exportAll uses. */
      setImportText(txt);
      setShowDataPanel(true);
    }
  }

  return {
    showDataPanel,setShowDataPanel,importText,setImportText,importError,setImportError,
    dataHubTab,setDataHubTab,valImportText,setValImportText,estImportText,setEstImportText,
    metricsImportText,setMetricsImportText,
    benchmarkImportText,setBenchmarkImportText,benchmarkAsOf,setBenchmarkAsOf,
    dashboardImportText,setDashboardImportText,
    weightsImportText,setWeightsImportText,calImportText,setCalImportText,
    repText,setRepText,fxText,setFxText,txText,setTxText,perfPortTargets,setPerfPortTargets,perfText,setPerfText,portTab,setPortTab,portSort,setPortSort,portSortDir,setPortSortDir,
    ratioImportText,setRatioImportText,
    financialsImportText,setFinancialsImportText,
    segmentsImportText,setSegmentsImportText,
    epsRevImportText,setEpsRevImportText,
    guidanceImportText,setGuidanceImportText,
    applyFxImport,applyRepImport,applyTxImport,applyPerfImport,applyCalImport,applyWeightsImport,applyValImport,applyEstImport,applyMetricsImport,applyBenchmarkImport,applyDashboardImport,applyRatioImport,applyFinancialsImport,applySegmentsImport,applyEpsRevImport,applyGuidanceImport,
    importAll,exportAll,downloadBackup
  };
}
