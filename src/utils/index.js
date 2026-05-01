import { SECTOR_COLORS, SECTOR_SHORT, COUNTRY_GROUPS, COUNTRY_COLORS, REGION_GROUPS, REGION_COLORS, STATUS_RANK, CURRENCY_MAP, TIER_ORDER, AVG_WPM } from '../constants/index.js';

export function shortSector(s){return SECTOR_SHORT[s]||s;}
export function sectorStyle(s){return SECTOR_COLORS[s]||{bg:"#f1f5f9",color:"#475569"};}
export function countryStyle(c){var g=COUNTRY_GROUPS[c];return g?COUNTRY_COLORS[g]:{bg:"#f1f5f9",color:"#475569"};}
export function getRegion(country){if(!country)return null;var g=COUNTRY_GROUPS[country];return Object.keys(REGION_GROUPS).find(function(r){return REGION_GROUPS[r].indexOf(g)>=0;})||null;}
export function getTiers(t){if(!t)return[];if(Array.isArray(t))return t;return String(t).split(",").map(function(s){var tr=s.trim();return tr.indexOf(" ")===-1?tr.toUpperCase():tr.trim();}).filter(Boolean);}
export function getCurrency(country){return CURRENCY_MAP[country]||"USD";}
export function calcNormEPS(v){var e1=parseFloat(v.eps1),e2=parseFloat(v.eps2),w1=parseFloat(v.w1),w2=parseFloat(v.w2);if(!isNaN(e1)&&!isNaN(e2)&&!isNaN(w1)&&!isNaN(w2)){return Math.round(((e1*w1+e2*w2)/100)*10000)/10000;}if(!isNaN(e1)&&isNaN(e2))return e1;return null;}
export function calcTP(pe,eps){var p=parseFloat(pe),e=parseFloat(eps);if(isNaN(p)||isNaN(e)||p<=0)return null;return Math.round(p*e*100)/100;}
export function calcMOS(tp,price){if(tp===null||tp===undefined)return null;var pr=parseFloat(price);if(isNaN(pr)||pr<=0)return null;return Math.round((tp-pr)/tp*1000)/10;}
export function fmtPrice(val){if(val===null||val===undefined||val==="")return"--";return parseFloat(val).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
export function fmtTP(val,currency){if(val===null||val===undefined)return"--";return currency+" "+val.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
export function fmtMOS(mos){if(mos===null||mos===undefined)return null;return(mos>0?"+":"")+mos+"%";}
export function mosBg(mos){if(mos===null)return null;if(mos>=20)return{bg:"#dcfce7",color:"#166534"};if(mos>=0)return{bg:"#fef9c3",color:"#854d0e"};return{bg:"#fee2e2",color:"#991b1b"};}
export function impliedFYLabel(v){var parts=[];if(v.fy1&&v.w1)parts.push(v.fy1+(v.w2?" "+v.w1+"%":""));if(v.fy2&&v.w2)parts.push(v.fy2+" "+v.w2+"%");return parts.join(" / ")||v.forwardYear||"";}
export function tierPillStyle(t){if(!t)return{bg:"#334155",color:"#fff"};if(t.indexOf("FIN")===0)return{bg:"#1a3a6b",color:"#fff"};if(t.indexOf("INGL")===0)return{bg:"#b45309",color:"#fff"};if(t==="IN1"||t==="IN2")return{bg:"#0f766e",color:"#fff"};if(t.indexOf("US")===0)return{bg:"#1a3a6b",color:"#fff"};if(t.indexOf("EM")===0)return{bg:"#92400e",color:"#fff"};if(t.indexOf("SC")===0)return{bg:"#5b21b6",color:"#fff"};if(t.indexOf("F ")===0||t.indexOf("W ")===0)return{bg:"#9d174d",color:"#fff"};if(t==="Hit TP")return{bg:"#64748b",color:"#fff"};if(t==="Gave Up")return{bg:"#94a3b8",color:"#fff"};if(t==="Remove")return{bg:"#dc2626",color:"#fff"};return{bg:"#334155",color:"#fff"};}
export function tierBg(t){var tiers=getTiers(t),first=tiers[0]||"";if(!first)return"#ffffff";if(first.indexOf("FIN")===0)return"#e8f0f8";if(first.indexOf("INGL")===0)return"#fde8d8";if(first==="IN1"||first==="IN2")return"#d1faf4";if(first.indexOf("US")===0)return"#e8f5ee";if(first.indexOf("EM")===0)return"#fef6e4";if(first.indexOf("SC")===0)return"#f0ecfb";if(first.indexOf("F ")===0||first.indexOf("W ")===0)return"#fceef4";if(first==="Hit TP")return"#f1f5f9";if(first==="Gave Up")return"#f8fafc";if(first==="Remove")return"#fee2e2";return"#ffffff";}
export function fmtTime(t){var m=Math.ceil(t.trim().split(/\s+/).length/AVG_WPM);return m===1?"1 min":m+" min";}
export function getCore(t){var m=t.match(/Core finding:\s*(.+?)(\n|$)/i);return m?m[1].trim():t.slice(0,120)+"...";}
export function getConf(t){var m=t.match(/Confidence:\s*(High|Medium|Low)/i);return m?m[1]:null;}
export function escHTML(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
export function toHTML(t){return escHTML(t).replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br/>");}
export function toMD(e){return"# "+e.title+"\nFormat: "+e.format+" | Tone: "+e.tone+" | Date: "+e.date+"\nTags: "+((e.tags||[]).join(", ")||"none")+"\n\n"+e.result;}
export function simScore(a,b){var sa=new Set(a.toLowerCase().split(/\s+/)),sb=new Set(b.toLowerCase().split(/\s+/)),i=0;sa.forEach(function(w){if(sb.has(w))i++;});return i/(sa.size+sb.size-i);}
export function downloadMD(title,content){var blob=new Blob([content],{type:"text/markdown"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(title||"export").replace(/[^a-z0-9]/gi,"_")+".md";a.click();}
export function detectCompanyTags(text,companies){var found=[];companies.forEach(function(c){if(c.name&&text.toLowerCase().includes(c.name.toLowerCase()))found.push(c.name);});return Array.from(new Set(found)).slice(0,5);}
export function todayStr(){return new Date().toISOString().slice(0,10);}
export function parseDate(s){if(!s)return null;var d=new Date(s);if(!isNaN(d.getTime()))return d;var m=s.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2,4})$/);if(m){var months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};var mo=months[m[2].toLowerCase()];if(mo===undefined)return null;var yr=parseInt(m[3]);if(yr<100)yr+=2000;return new Date(yr,mo,parseInt(m[1]));}return null;}

/* Parse a fiscal-year-end month indicator. Accepts 3-letter or full
   names ("Dec", "December") and numeric strings ("12"). Returns 1-12
   or null when the input doesn't make sense. */
export function parseFyMonth(s){
  if(s===null||s===undefined||s==="")return null;
  var t=String(s).trim().toLowerCase();
  var months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
              january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
  if(months[t])return months[t];
  var n=parseInt(t,10);
  if(n>=1&&n<=12)return n;
  return null;
}

/* Infer the fiscal quarter and FY year for an earnings report given the
   report date and the company's fiscal year-end month. Walks back up to
   ~180 days from the report date to find the most recent fiscal
   quarter-end. FY year = the calendar year the FY ends. Returns
   { qNum, fyYear, label: "Q1 FY26" } or null. */
export function inferQuarter(reportIso, fyMonthStr){
  var d=parseDate(reportIso);
  if(!d)return null;
  var m=parseFyMonth(fyMonthStr);
  if(!m)return null;
  var qEndMonths={};
  for(var n=1;n<=4;n++){
    var qm=((m-1+3*n)%12)+1;
    qEndMonths[qm]=n;
  }
  var best=null;
  for(var yOff=0;yOff>=-1;yOff--){
    var year=d.getFullYear()+yOff;
    Object.keys(qEndMonths).forEach(function(qmStr){
      var qmInt=parseInt(qmStr,10);
      var qe=new Date(year,qmInt,0); qe.setHours(0,0,0,0);
      var diffDays=(d-qe)/86400000;
      if(diffDays>=0&&diffDays<=180){
        if(!best||qe>best.date) best={date:qe,month:qmInt,year:year};
      }
    });
  }
  if(!best)return null;
  var qNum=qEndMonths[best.month];
  var fyYear=best.month>m?best.year+1:best.year;
  return {qNum:qNum, fyYear:fyYear, label:"Q"+qNum+" FY"+String(fyYear).slice(2)};
}

export function daysSince(dateStr){if(!dateStr)return Infinity;var d=parseDate(dateStr);if(!d||isNaN(d.getTime()))return Infinity;return Math.floor((Date.now()-d.getTime())/86400000);}
export function reviewedColor(dateStr){var d=daysSince(dateStr);if(d===Infinity)return"#dc2626";if(d>90)return"#dc2626";if(d>60)return"#d97706";if(d>30)return"#ca8a04";return"#166534";}
export function mkTheme(dark){return{dark,bg:dark?"#0f172a":"#ffffff",bgSec:dark?"#1e293b":"#f8fafc",bgTer:dark?"#334155":"#f1f5f9",border:dark?"#334155":"#e2e8f0",borderSec:dark?"#475569":"#d1d5db",text:dark?"#f1f5f9":"#111111",textSec:dark?"#94a3b8":"#6b7280",textDanger:dark?"#f87171":"#dc2626",textSuccess:dark?"#4ade80":"#166534",textInfo:dark?"#60a5fa":"#1e40af",textWarn:dark?"#fbbf24":"#854d0e"};}
export function getStatusRank(status){var r=STATUS_RANK[status||""];return(r!==undefined&&r!==null)?r:4;}
export function getTierIndex(x){var ts=getTiers(x.tier),best=999;for(var j=0;j<ts.length;j++){var t=ts[j].trim();var idx=TIER_ORDER.indexOf(t);if(idx<0){for(var k=0;k<TIER_ORDER.length;k++){if(TIER_ORDER[k].toUpperCase()===t.toUpperCase()){idx=k;break;}}}if(idx>=0&&idx<best){best=idx;}}return best;}
export function getCompanyMOS(c){var val=c.valuation||{};var eps=calcNormEPS(val)||parseFloat(val.eps);var tp=calcTP(val.pe,eps);return calcMOS(tp,val.price);}
/* Fixed (user-frozen) TP. Reads tpFixed first; falls back to the legacy
   normEPSFixed × PE shape if tpFixed isn't set. */
export function getTpFixed(val){if(!val)return null;var t=parseFloat(val.tpFixed);if(!isNaN(t))return t;var eps=parseFloat(val.normEPSFixed);var pe=parseFloat(val.pe);if(!isNaN(eps)&&!isNaN(pe))return Math.round(pe*eps*100)/100;return null;}
export function getCompanyMOSFixed(c){var val=c.valuation||{};var tp=getTpFixed(val);if(tp===null)return null;var ord=((c.tickers||[]).find(function(t){return t.isOrdinary;})||{});var price=ord.price||val.price;return calcMOS(tp,price);}
/* Same as fmtMOS but rounded to 0 decimals — used in dense table cells. */
export function fmtMOS0(mos){if(mos===null||mos===undefined)return null;var n=Math.round(mos);return(n>0?"+":"")+n+"%";}
export function blankEarnings(){return{id:(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+"-"+Math.random().toString(36).slice(2)),quarter:"",reportDate:"",eps:"",tpChange:"Unchanged",newTP:"",tpRationale:"",bullets:["","","","",""],shortTakeaway:"",extendedTakeaway:"",thesisStatus:"On track",thesisNote:"",open:true};}

/* Rep-data entries are normalized to {shares, avgCost} via migrateRepData, but old numeric values may appear briefly during load. These helpers read either safely. */
/* Trigger browser print with body.printing class so the @media print rules
   in index.css hide everything except .print-target. Before printing we
   measure the target's natural size and compute a zoom factor so the
   content fits the page in one go. Restores on afterprint.

   `mode` controls layout / shrink:
     - "table" (default): aggressive shrink to fit landscape tables on one
       page. Used by the Portfolios print button.
     - "charts": gentler shrink with portrait orientation; chart-heavy
       company views (Dashboard, Snapshot, Financials, Ratios) where
       readability of axis labels and metric values matters more than
       cramming onto one sheet. Multi-page output is fine.
*/
export function printPage(mode){
  if(typeof document==="undefined")return;
  var target=document.querySelector(".print-target");
  var isCharts = mode === "charts";
  var zoom=1;
  if(target && !isCharts){
    /* Landscape letter minus 0.25in margins = 10.5in x 8in of usable space. */
    var natH=target.scrollHeight;
    var natW=target.scrollWidth;
    var availW=1008;var availH=768;
    var shrink=0.45;
    var pageH=availH/shrink;
    var pageW=availW/shrink;
    zoom=Math.min(pageH/natH,pageW/natW,1);
    if(!isFinite(zoom)||zoom<=0)zoom=1;
  }
  if(isCharts){
    /* Charts mode: keep readable font sizes, let it overflow to multiple
       pages. No measurement-based zoom — the print.css rules size the
       target sensibly for portrait letter. */
    zoom=1;
  }
  document.documentElement.style.setProperty("--print-zoom",String(zoom));
  document.body.classList.add("printing");
  if(isCharts) document.body.classList.add("printing-charts");
  /* Broadcast a custom event so collapsed UI (e.g. EarningsEntry cards)
     can self-expand for the print run. Listeners that respond should
     also listen for "ccd-after-print" to optionally restore state. */
  try{ window.dispatchEvent(new CustomEvent("ccd-before-print")); }catch(e){}
  var cleanup=function(){
    document.body.classList.remove("printing");
    document.body.classList.remove("printing-charts");
    document.documentElement.style.removeProperty("--print-zoom");
    window.removeEventListener("afterprint",cleanup);
    try{ window.dispatchEvent(new CustomEvent("ccd-after-print")); }catch(e){}
  };
  window.addEventListener("afterprint",cleanup);
  setTimeout(function(){try{window.print();}catch(e){cleanup();}},50);
  /* Safety cleanup in case afterprint doesn't fire */
  setTimeout(cleanup,10000);
}
/* Truncate company name for list views. Pair with title={fullName} so the
   full name is still available on hover. */
export function truncName(n,max){if(!n)return"";var m=max||15;return n.length>m?n.slice(0,m)+"\u2026":n;}
export function repShares(entry){if(entry==null)return 0;if(typeof entry==="number")return entry;return Number(entry.shares)||0;}
export function repAvgCost(entry){if(entry==null||typeof entry==="number")return 0;return Number(entry.avgCost)||0;}

/* Effective initiated date for a company in a given portfolio.
   Precedence:
     1. Manual override on the company (c.initiatedDates[portfolio])
     2. Most recent transaction with initOverride===true
     3. Most recent auto-detected 0→positive transition, excluding
        any transaction with initOverride===false
   Returns "YYYY-MM-DD" or null. */
export function getInitiatedDate(c,portfolio){
  var manual=((c&&c.initiatedDates)||{})[portfolio];
  if(manual)return manual;
  var txs=((c&&c.transactions)||[]).filter(function(t){return t.portfolio===portfolio&&t.date;});
  if(txs.length===0)return null;
  var sorted=txs.slice().sort(function(a,b){var d=(a.date||"").localeCompare(b.date||"");return d!==0?d:((a.id||"").localeCompare(b.id||""));});
  var running=0;var lastInit=null;
  sorted.forEach(function(t){
    var prev=running;running+=parseFloat(t.shares)||0;
    if(t.initOverride===true){lastInit=t.date;return;}
    if(t.initOverride===false)return;
    if(prev<=0&&running>0)lastInit=t.date;
  });
  return lastInit;
}
/* Returns true if this specific transaction is an initiation event.
   Explicit initOverride (true/false) wins. Otherwise auto-detects by
   walking transactions chronologically and flagging trades where the
   running position transitioned from <=0 to >0. */
export function isInitiationTx(c,tx){
  if(!tx||!tx.date)return false;
  if(tx.initOverride===true)return true;
  if(tx.initOverride===false)return false;
  var txs=((c&&c.transactions)||[]).filter(function(t){return t.portfolio===tx.portfolio&&t.date;});
  var sorted=txs.slice().sort(function(a,b){var d=(a.date||"").localeCompare(b.date||"");return d!==0?d:((a.id||"").localeCompare(b.id||""));});
  var running=0;
  for(var i=0;i<sorted.length;i++){
    var t=sorted[i];var prev=running;running+=parseFloat(t.shares)||0;
    if(prev<=0&&running>0&&t.id===tx.id)return true;
  }
  return false;
}
export function monthsSince(dateStr){
  if(!dateStr)return null;
  var d=new Date(dateStr);
  if(isNaN(d.getTime()))return null;
  var ms=Date.now()-d.getTime();
  if(ms<0)return null;
  return ms/(1000*60*60*24*30.4375);
}

export function tierToStatus(tier){
  var tiers=(tier||"").split(",").map(function(t){return t.trim();}).filter(Boolean);
  for(var i=0;i<tiers.length;i++){
    var t=tiers[i];
    if(t==="F MC"||t==="F SC")return"Focus";
    if(t==="W MC"||t==="W SC")return"Watch";
    if(t==="Hit TP"||t==="Gave Up")return"Sold";
  }
  return null;
}

export function sortCos(list,by,dir){
  var c=list.slice();var WF=new Set(["F MC","W MC","F SC","W SC"]);
  function al(a,b){return a.name.localeCompare(b.name);}
  function isWF(x){var ts=getTiers(x.tier);return ts.length>0&&WF.has(ts[0]);}
  var m=dir==="desc"?-1:1;
  return c.sort(function(a,b){
    var p=0;
    if(by==="Tier"){var ta=getTierIndex(a),tb=getTierIndex(b);if(ta===999&&tb!==999)return 1;if(tb===999&&ta!==999)return -1;p=(ta-tb)*m;if(p!==0)return p;if(isWF(a)&&isWF(b)){var cp=(a.country||"").localeCompare(b.country||"");if(cp!==0)return cp;}var sd=getStatusRank(a.status)-getStatusRank(b.status);if(sd!==0)return sd;return al(a,b);}
    if(by==="Last Reviewed"){var hA=!!a.lastReviewed,hB=!!b.lastReviewed;if(!hA&&!hB)return al(a,b);if(!hA)return 1;if(!hB)return -1;var da=parseDate(a.lastReviewed),db=parseDate(b.lastReviewed);if(!da)return 1;if(!db)return -1;p=(db.getTime()-da.getTime())*m;if(p!==0)return p;return al(a,b);}
    if(by==="MOS"){var ma=getCompanyMOS(a),mb=getCompanyMOS(b);if(ma===null&&mb===null)return al(a,b);if(ma===null)return 1;if(mb===null)return -1;p=(ma-mb)*m;if(p!==0)return p;return al(a,b);}
    if(by==="MOS Fixed"){var mfa=getCompanyMOSFixed(a),mfb=getCompanyMOSFixed(b);if(mfa===null&&mfb===null)return al(a,b);if(mfa===null)return 1;if(mfb===null)return -1;p=(mfa-mfb)*m;if(p!==0)return p;return al(a,b);}
    if(by==="5D%"){function getPerf(x){var ord=(x.tickers||[]).find(function(t){return t.isOrdinary;});if(!ord||!ord.perf5d||ord.perf5d==="#N/A")return null;var n=parseFloat(ord.perf5d);return isNaN(n)?null:n;}var pa=getPerf(a),pb=getPerf(b);if(pa===null&&pb===null)return al(a,b);if(pa===null)return 1;if(pb===null)return -1;p=(pa-pb)*m;if(p!==0)return p;return al(a,b);}
    if(by==="Last Updated"){var hUa=!!a.lastUpdated,hUb=!!b.lastUpdated;if(!hUa&&!hUb)return al(a,b);if(!hUa)return 1;if(!hUb)return -1;var dua=parseDate(a.lastUpdated),dub=parseDate(b.lastUpdated);if(!dua)return 1;if(!dub)return -1;p=(dub.getTime()-dua.getTime())*m;if(p!==0)return p;return al(a,b);}
    if(by==="Name")p=a.name.localeCompare(b.name)*m;
    else if(by==="Country")p=(a.country||"").localeCompare(b.country||"")*m;
    else if(by==="Sector")p=(a.sector||"").localeCompare(b.sector||"")*m;
    if(p!==0)return p;var sd2=getStatusRank(a.status)-getStatusRank(b.status);if(sd2!==0)return sd2;return al(a,b);
  });
}

export function synPrompt(fmt,tn,cust){var fi={"Key Takeaways":"4-6 numbered takeaways.","Executive Summary":"3 paragraphs: situation, findings, implications.","Bullet Points":"Grouped bullets under 2-4 theme headers.","Q&A":"4-5 key questions with concise answers.","Timeline":"Findings chronologically.","Conflict Detector":"Find DISAGREEMENTS between sources.","Custom":cust||"Summarize."};return "Research synthesis assistant.\nFormat: "+fmt+"\nTone: "+tn+"\nInstructions: "+(fi[fmt]||"Summarize.")+"\n- Start with: **Core finding:** [one sentence]\n- Include **Confidence:** High/Medium/Low\n- End with **Gaps & next steps:** 2-3 unknowns\n- Be concise.";}
