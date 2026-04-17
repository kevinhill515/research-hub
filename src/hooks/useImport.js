import { useState } from "react";
import { useCompanyContext } from '../context/CompanyContext.jsx';
import { todayStr, blankEarnings, getCurrency, parseDate } from '../utils/index.js';
import { supaUpsert } from '../api/index.js';
import { REP_ACCOUNTS } from '../constants/index.js';

export function useImport(){
  const { companies, setCompanies, saved, setSaved, setCopied, currentUser, repData, setRepData, fxRates, setFxRates, specialWeights, setSpecialWeights, calLastUpdated, setCalLastUpdated, calLastUpdatedBy, setCalLastUpdatedBy, repLastUpdated, setRepLastUpdated, fxLastUpdated, setFxLastUpdated } = useCompanyContext();

  const [showDataPanel,setShowDataPanel]=useState(false);
  const [importText,setImportText]=useState("");
  const [importError,setImportError]=useState("");
  const [dataHubTab,setDataHubTab]=useState("backup");
  const [valImportText,setValImportText]=useState("");
  const [estImportText,setEstImportText]=useState("");
  const [weightsImportText,setWeightsImportText]=useState("");
  const [calImportText,setCalImportText]=useState("");
  const [repText,setRepText]=useState("");
  const [fxText,setFxText]=useState("");
  const [txText,setTxText]=useState("");
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
  function applyRepImport(){if(!repText.trim())return;var lines=repText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var data={};lines.forEach(function(line){var delim=line.indexOf("\t")>=0?"\t":",";var parts=line.split(delim).map(function(s){return s.trim();});if(parts.length>=3){var acct=parts[0].toUpperCase();var ticker=parts[1].toUpperCase();var shares=parseFloat(parts[2]);var avgCost=parts.length>=4?parseFloat(parts[3]):0;if(isNaN(avgCost))avgCost=0;if(!isNaN(shares)){var port=REP_ACCOUNTS[acct];if(port){if(!data[port])data[port]={};var prev=data[port][ticker];var prevShares=(prev&&typeof prev==="object")?(prev.shares||0):(prev||0);var prevCost=(prev&&typeof prev==="object")?(prev.avgCost||0):0;var newShares=prevShares+shares;/* Weighted average when the same ticker appears twice in one import */var newAvgCost=newShares>0?((prevShares*prevCost)+(shares*avgCost))/newShares:avgCost;data[port][ticker]={shares:newShares,avgCost:newAvgCost};}}}});setRepData(data);setRepLastUpdated(currentUser+" "+todayStr());setRepText("");supaUpsert("meta",{key:"repData",value:JSON.stringify(data)});}
  function applyCalImport(){if(!calImportText||!calImportText.trim())return;var lines=calImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;setCompanies(function(prev){return prev.map(function(c){var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim();});var allTickers2=[(c.ticker||"")].concat((c.tickers||[]).map(function(t){return t.ticker||"";})).map(function(t){return t.toUpperCase();}).filter(Boolean);return allTickers2.indexOf(parts[0].toUpperCase())>=0;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var parts=match.split(delim).map(function(s){return s.trim();});var date=parts[1];if(!date)return c;var entries=(c.earningsEntries||[]).slice();var existing=entries.find(function(e){return e.reportDate===date;});if(!existing){entries.unshift(Object.assign(blankEarnings(),{reportDate:date,open:false}));}count++;return Object.assign({},c,{earningsEntries:entries});});});setTimeout(function(){alert("Updated earnings dates for "+count+" companies.");setCalImportText("");},100);supaUpsert("meta",{key:"calLastUpdated",value:currentUser+" at "+todayStr()});setCalLastUpdatedBy(currentUser);setCalLastUpdated(todayStr());}
  function applyWeightsImport(){if(!weightsImportText.trim())return;var lines=weightsImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;var newSpecial={};lines.forEach(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var p=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var nm=p[0].toUpperCase();if(nm==="CASH"||nm==="DIVACC"){newSpecial[nm]={GL:p[1]||"",FGL:p[2]||"",IV:p[3]||"",FIV:p[4]||"",EM:p[5]||"",SC:p[6]||""};}});if(Object.keys(newSpecial).length>0){setSpecialWeights(function(prev){var updated=Object.assign({},prev,newSpecial);supaUpsert("meta",{key:"specialWeights",value:JSON.stringify(updated)});return updated;});}setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newWeights=Object.assign({},c.portWeights||{},{GL:p[1]||"",FGL:p[2]||"",IV:p[3]||"",FIV:p[4]||"",EM:p[5]||"",SC:p[6]||""});count++;return Object.assign({},c,{portWeights:newWeights});});});setTimeout(function(){alert("Updated weights for "+count+" companies.");setWeightsImportText("");},100);}
  function applyValImport(){if(!valImportText.trim())return;var lines=valImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newVal=Object.assign({},c.valuation||{},{pe:p[1]||"",fyMonth:p[2]||"",currency:p[3]||"",fy1:p[4]||"",eps1:p[5]||"",w1:p[6]||"",fy2:p[7]||"",eps2:p[8]||"",w2:p[9]||""});count++;return Object.assign({},c,{valuation:newVal});});});setTimeout(function(){alert("Updated valuation for "+count+" companies.");setValImportText("");},100);}
  function applyEstImport(){if(!estImportText.trim())return;var lines=estImportText.trim().split("\n").map(function(l){return l.replace("\r","");}).filter(function(l){return l.trim();});var count=0;setCompanies(function(prev){return prev.map(function(c){var cname=(c.name||"").toLowerCase().trim();var match=lines.find(function(l){var delim=l.indexOf("\t")>=0?"\t":",";var parts=l.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});return parts[0].toLowerCase().trim()===cname;});if(!match)return c;var delim=match.indexOf("\t")>=0?"\t":",";var p=match.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});var newVal=Object.assign({},c.valuation||{},{pe:p[1]||"",peLow5:p[2]||"",peHigh5:p[3]||"",peAvg5:p[4]||"",peMed5:p[5]||"",fyMonth:p[6]||"",currency:p[7]||"",fy1:p[8]||"",eps1:p[9]||"",w1:p[10]||"",fy2:p[11]||"",eps2:p[12]||"",w2:p[13]||""});count++;return Object.assign({},c,{valuation:newVal});});});setTimeout(function(){alert("Updated estimates for "+count+" companies.");setEstImportText("");},100);}
  function importAll(){
    setImportError("");
    try{var d=JSON.parse(importText);var cos=d.companies||(Array.isArray(d)?d:null),lib=d.library||null;if(!cos&&!lib){setImportError("No data found.");return;}if(cos&&Array.isArray(cos)){setCompanies(cos);supaUpsert("companies",{id:"shared",data:JSON.stringify(cos)});}if(lib&&Array.isArray(lib)){setSaved(lib);supaUpsert("library",{id:"shared",data:JSON.stringify(lib)});}setImportText("");setShowDataPanel(false);}
    catch(e){setImportError("Invalid JSON: "+e.message);}
  }
  function exportAll(){var txt=JSON.stringify({companies,library:saved,exportedAt:new Date().toISOString()},null,2);try{var el=document.createElement("textarea");el.value=txt;el.style.position="fixed";el.style.opacity="0";document.body.appendChild(el);el.focus();el.select();document.execCommand("copy");document.body.removeChild(el);setCopied("exportall");setTimeout(function(){setCopied(null);},2000);}catch(e){setImportText(txt);setShowDataPanel(true);}}

  return {
    showDataPanel,setShowDataPanel,importText,setImportText,importError,setImportError,
    dataHubTab,setDataHubTab,valImportText,setValImportText,estImportText,setEstImportText,
    weightsImportText,setWeightsImportText,calImportText,setCalImportText,
    repText,setRepText,fxText,setFxText,txText,setTxText,portTab,setPortTab,portSort,setPortSort,portSortDir,setPortSortDir,
    applyFxImport,applyRepImport,applyTxImport,applyCalImport,applyWeightsImport,applyValImport,applyEstImport,
    importAll,exportAll
  };
}
