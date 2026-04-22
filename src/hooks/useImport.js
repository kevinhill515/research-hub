import { useState } from "react";
import { useCompanyContext } from '../context/CompanyContext.jsx';
import { todayStr, blankEarnings, getCurrency, parseDate } from '../utils/index.js';
import { supaUpsert } from '../api/index.js';
import { REP_ACCOUNTS } from '../constants/index.js';

export function useImport(){
  const { companies, setCompanies, saved, setSaved, setCopied, currentUser, repData, setRepData, fxRates, setFxRates, specialWeights, setSpecialWeights, calLastUpdated, setCalLastUpdated, calLastUpdatedBy, setCalLastUpdatedBy, repLastUpdated, setRepLastUpdated, fxLastUpdated, setFxLastUpdated, applyPerfBulk } = useCompanyContext();

  const [showDataPanel,setShowDataPanel]=useState(false);
  const [importText,setImportText]=useState("");
  const [importError,setImportError]=useState("");
  const [dataHubTab,setDataHubTab]=useState("backup");
  const [valImportText,setValImportText]=useState("");
  const [estImportText,setEstImportText]=useState("");
  const [metricsImportText,setMetricsImportText]=useState("");
  const [weightsImportText,setWeightsImportText]=useState("");
  const [calImportText,setCalImportText]=useState("");
  const [repText,setRepText]=useState("");
  const [fxText,setFxText]=useState("");
  const [txText,setTxText]=useState("");
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
        var portfolio=parts[2].toUpperCase();
        var shares=parseFloat(parts[3]);
        var price=parseFloat(parts[4]);
        var amount=parseFloat((parts[5]||"").replace(/,/g,""));
        if(name&&!isNaN(shares))rows.push({date:date,name:name,portfolio:portfolio,shares:shares,price:isNaN(price)?0:price,amount:isNaN(amount)?0:amount});
      }
    });
    if(rows.length===0){alert("No valid rows parsed. Expected columns: Date, Name, Portfolio, Shares, Price, Amount.");return;}
    function normalize(n){return(n||"").toLowerCase().replace(/\b(corporation|incorporated|international|holdings|holding|company|limited|group|ordinary|preferred|shares|class|depositary|depository|receipts|receipt|common|stock)\b/g,"").replace(/\b(co\.|inc\.|ltd\.|llc|plc|sa|ag|nv|se|co|inc|ltd|corp|gmbh|kgaa|ab|asa|oyj|spa|srl|bv|ord|com|adr|ads|gdr|pref|reit|shs|npv|cdi|cva|units|unit|jsc|pjsc|ojsc|oao|sab|bhd|tbk)\b/g,"").replace(/[.,&'()\-\/]/g," ").replace(/\s+/g," ").trim();}
    var byName={},byNorm={};
    rows.forEach(function(r){var k=(r.name||"").toLowerCase().trim();(byName[k]=byName[k]||[]).push(r);(byNorm[normalize(r.name)]=byNorm[normalize(r.name)]||[]).push(r);});
    var matchedNames={};var unmatched=new Set(rows.map(function(r){return r.name;}));
    var txCount=0;
    setCompanies(function(prev){return prev.map(function(c){
      var cname=(c.name||"").toLowerCase().trim();
      var cUsName=(c.usTickerName||"").toLowerCase().trim();
      var matches=byName[cname]||(cUsName&&byName[cUsName])||byNorm[normalize(c.name)]||(cUsName&&byNorm[normalize(c.usTickerName)]);
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
    setTimeout(function(){var msg="Imported "+txCount+" transactions across "+Object.keys(matchedNames).length+" companies.";if(unmatched.size>0){var list=Array.from(unmatched);msg+="\n\nUnmatched names ("+unmatched.size+"):\n"+list.slice(0,30).join(", ")+(list.length>30?" \u2026 (see console for full list)":"");console.warn("[Tx import] Unmatched security names:",list);}alert(msg);setTxText("");},100);
  }
  /* Parse CSV/TSV performance paste. First column = YYYY-MM (or Date header).
     Remaining columns = series (header = series name). Values may have % signs
     which are stripped; numeric values with no % sign are assumed already-decimal. */
  function applyPerfImport(){
    if(!perfText.trim())return;
    var lines=perfText.trim().split(/\r?\n/).filter(function(l){return l.trim();});
    if(lines.length<2){alert("Need a header row and at least one data row.");return;}
    var delim=lines[0].indexOf("\t")>=0?"\t":",";
    function parseRow(line){var cols=[];var cur="";var inQ=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){inQ=!inQ;}else if(ch===delim&&!inQ){cols.push(cur);cur="";}else{cur+=ch;}}cols.push(cur);return cols.map(function(c){return c.replace(/^"|"$/g,"").trim();});}
    var headers=parseRow(lines[0]);
    var seriesNames=headers.slice(1).filter(function(h){return h;});
    if(seriesNames.length===0){alert("No series columns found in header.");return;}
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
    if(rows.length===0){alert("No valid data rows parsed (bad date formats).");return;}
    if(!perfPortTargets||perfPortTargets.length===0){alert("Select at least one target portfolio.");return;}
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
      alert(msg);
      setPerfText("");
    },100);
  }
  function applyRepImport(){if(!repText.trim())return;var lines=repText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var data={};lines.forEach(function(line){var delim=line.indexOf("\t")>=0?"\t":",";var parts=line.split(delim).map(function(s){return s.trim();});if(parts.length>=3){var acct=parts[0].toUpperCase();var ticker=parts[1].toUpperCase();var shares=parseFloat(parts[2]);var avgCost=parts.length>=4?parseFloat(parts[3]):0;if(isNaN(avgCost))avgCost=0;if(!isNaN(shares)){var port=REP_ACCOUNTS[acct];if(port){if(!data[port])data[port]={};var prev=data[port][ticker];var prevShares=(prev&&typeof prev==="object")?(prev.shares||0):(prev||0);var prevCost=(prev&&typeof prev==="object")?(prev.avgCost||0):0;var newShares=prevShares+shares;/* Weighted average when the same ticker appears twice in one import */var newAvgCost=newShares>0?((prevShares*prevCost)+(shares*avgCost))/newShares:avgCost;data[port][ticker]={shares:newShares,avgCost:newAvgCost};}}}});setRepData(data);setRepLastUpdated(currentUser+" "+todayStr());setRepText("");supaUpsert("meta",{key:"repData",value:JSON.stringify(data)});}
  /* Earnings Dates upload. 3 columns now:
       Ticker, Next Rpt Date, Last Rpt Date (last optional)
     The next date lands as a new/existing earningsEntries[].reportDate;
     the last date is stashed on company.lastReportDate so the calendar's
     "Recent Earnings — Last 30 Days" panel has data. */
  function applyCalImport(){
    if(!calImportText||!calImportText.trim())return;
    var lines=calImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});
    var count=0;
    setCompanies(function(prev){return prev.map(function(c){
      var match=lines.find(function(l){
        var delim=l.indexOf("\t")>=0?"\t":",";
        var parts=l.split(delim).map(function(s){return s.trim();});
        var allTickers2=[(c.ticker||"")].concat((c.tickers||[]).map(function(t){return t.ticker||"";})).map(function(t){return t.toUpperCase();}).filter(Boolean);
        return allTickers2.indexOf(parts[0].toUpperCase())>=0;
      });
      if(!match)return c;
      var delim=match.indexOf("\t")>=0?"\t":",";
      var parts=match.split(delim).map(function(s){return s.trim();});
      var nextDate=parts[1];
      var lastDate=parts[2];
      var updated=Object.assign({},c);
      if(nextDate){
        var entries=(c.earningsEntries||[]).slice();
        var existing=entries.find(function(e){return e.reportDate===nextDate;});
        if(!existing){entries.unshift(Object.assign(blankEarnings(),{reportDate:nextDate,open:false}));}
        updated.earningsEntries=entries;
      }
      if(lastDate){updated.lastReportDate=lastDate;}
      if(nextDate||lastDate)count++;
      return updated;
    });});
    setTimeout(function(){alert("Updated earnings dates for "+count+" companies.");setCalImportText("");},100);
    supaUpsert("meta",{key:"calLastUpdated",value:currentUser+" at "+todayStr()});
    setCalLastUpdatedBy(currentUser);
    setCalLastUpdated(todayStr());
  }
  function applyWeightsImport(){if(!weightsImportText.trim())return;var lines=weightsImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;var newSpecial={};lines.forEach(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var p=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var nm=p[0].toUpperCase();if(nm==="CASH"||nm==="DIVACC"){newSpecial[nm]={GL:p[1]||"",FGL:p[2]||"",IV:p[3]||"",FIV:p[4]||"",EM:p[5]||"",SC:p[6]||""};}});if(Object.keys(newSpecial).length>0){setSpecialWeights(function(prev){var updated=Object.assign({},prev,newSpecial);supaUpsert("meta",{key:"specialWeights",value:JSON.stringify(updated)});return updated;});}setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newWeights=Object.assign({},c.portWeights||{},{GL:p[1]||"",FGL:p[2]||"",IV:p[3]||"",FIV:p[4]||"",EM:p[5]||"",SC:p[6]||""});count++;return Object.assign({},c,{portWeights:newWeights});});});setTimeout(function(){alert("Updated weights for "+count+" companies.");setWeightsImportText("");},100);}
  function applyValImport(){if(!valImportText.trim())return;var lines=valImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newVal=Object.assign({},c.valuation||{},{pe:p[1]||"",fyMonth:p[2]||"",currency:p[3]||"",fy1:p[4]||"",eps1:p[5]||"",w1:p[6]||"",fy2:p[7]||"",eps2:p[8]||"",w2:p[9]||""});count++;return Object.assign({},c,{valuation:newVal});});});setTimeout(function(){alert("Updated valuation for "+count+" companies.");setValImportText("");},100);}
  function applyEstImport(){if(!estImportText.trim())return;var lines=estImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newVal=Object.assign({},c.valuation||{},{pe:p[1]||"",peCurrent:p[2]||"",peLow5:p[3]||"",peHigh5:p[4]||"",peAvg5:p[5]||"",peMed5:p[6]||"",fyMonth:p[7]||"",currency:p[8]||"",fy1:p[9]||"",eps1:p[10]||"",w1:p[11]||"",fy2:p[12]||"",eps2:p[13]||"",w2:p[14]||""});if(p[15]!==undefined&&p[15]!==""){newVal.tpFixed=p[15];newVal.tpFixedDate=todayStr();}count++;return Object.assign({},c,{valuation:newVal});});});setTimeout(function(){alert("Updated estimates for "+count+" companies.");setEstImportText("");},100);}
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
    var METRIC_KEYS = [
      null, null,  // Company, Ticker — not stored on metrics
      "mktCap","fpe1","fpe2",
      "fcfYld1","fcfYld2","divYld1","divYld2",
      "payout1","payout2","netDE1","netDE2","intCov","ltEPS",
      "grMgn1","grMgn2","netMgn1","netMgn2",
      "gpAss1","gpAss2","npAss1","npAss2","opROE1","opROE2",
    ];
    var PERF_KEYS = ["MTD","QTD","3M","6M","YTD","1Y"];
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
        var m = {};
        for(var i=2; i<METRIC_KEYS.length; i++){
          var key = METRIC_KEYS[i];
          if(!key) continue;
          var v = num(i);
          if(v !== null) m[key] = v;
        }
        var perf = {};
        for(var j=0; j<PERF_KEYS.length; j++){
          var v2 = num(25 + j);
          if(v2 !== null) perf[PERF_KEYS[j]] = v2;
        }
        if(Object.keys(perf).length > 0) m.perf = perf;
        if(Object.keys(m).length === 0) return c;
        count++;
        return Object.assign({},c,{metrics:m});
      });
    });
    setTimeout(function(){alert("Updated metrics for "+count+" companies.");setMetricsImportText("");},100);
  }

  function importAll(){
    setImportError("");
    try{var d=JSON.parse(importText);var cos=d.companies||(Array.isArray(d)?d:null),lib=d.library||null;if(!cos&&!lib){setImportError("No data found.");return;}if(cos&&Array.isArray(cos)){setCompanies(cos);supaUpsert("companies",{id:"shared",data:JSON.stringify(cos)});}if(lib&&Array.isArray(lib)){setSaved(lib);supaUpsert("library",{id:"shared",data:JSON.stringify(lib)});}setImportText("");setShowDataPanel(false);}
    catch(e){setImportError("Invalid JSON: "+e.message);}
  }
  function exportAll(){var txt=JSON.stringify({companies,library:saved,exportedAt:new Date().toISOString()},null,2);try{var el=document.createElement("textarea");el.value=txt;el.style.position="fixed";el.style.opacity="0";document.body.appendChild(el);el.focus();el.select();document.execCommand("copy");document.body.removeChild(el);setCopied("exportall");setTimeout(function(){setCopied(null);},2000);}catch(e){setImportText(txt);setShowDataPanel(true);}}

  return {
    showDataPanel,setShowDataPanel,importText,setImportText,importError,setImportError,
    dataHubTab,setDataHubTab,valImportText,setValImportText,estImportText,setEstImportText,
    metricsImportText,setMetricsImportText,
    weightsImportText,setWeightsImportText,calImportText,setCalImportText,
    repText,setRepText,fxText,setFxText,txText,setTxText,perfPortTargets,setPerfPortTargets,perfText,setPerfText,portTab,setPortTab,portSort,setPortSort,portSortDir,setPortSortDir,
    applyFxImport,applyRepImport,applyTxImport,applyPerfImport,applyCalImport,applyWeightsImport,applyValImport,applyEstImport,applyMetricsImport,
    importAll,exportAll
  };
}
