import { useState, useRef, useEffect } from "react";

const PORTFOLIOS=["FIV","IV","FGL","GL","EM","SC"];
const TIER_ORDER=["MC1","MC2","MC3","MC4","MC5","INTL","US1","US2","EM1","EM2","EM3","EM4","SC1","SC2","SC3","SC4","SC5","F MC","W MC","F SC","W SC","Hit TP","Gave Up"];
const SECTOR_ORDER=["Industrials","Information Technology","Energy","Consumer Discretionary","Materials","Consumer Staples","Financials","Health Care","Communication Services","Utilities","Real Estate"];
const COUNTRY_ORDER=["United States","Britain","Japan","Netherlands","France","Canada","Taiwan","Germany","Mexico","Singapore","China","Italy","Norway","Luxembourg","Ireland","Australia","Austria","Spain","Sweden","Switzerland","South Korea","Brazil","Indonesia","Chile","South Africa","India","Greece","Panama","Jordan","Denmark","Israel","Belgium","Egypt","Hungary","Russia"];
const SECTOR_COLORS={"Industrials":{bg:"#ffedd5",color:"#9a3412"},"Information Technology":{bg:"#fef9c3",color:"#854d0e"},"Energy":{bg:"#dcfce7",color:"#166534"},"Consumer Discretionary":{bg:"#dbeafe",color:"#1e40af"},"Materials":{bg:"#f3e8ff",color:"#6b21a8"},"Consumer Staples":{bg:"#fce7f3",color:"#9d174d"},"Financials":{bg:"#fee2e2",color:"#991b1b"},"Health Care":{bg:"#f1f5f9",color:"#475569"},"Communication Services":{bg:"#ccfbf1",color:"#0f766e"},"Utilities":{bg:"#e0e7ff",color:"#3730a3"},"Real Estate":{bg:"#fef3c7",color:"#92400e"}};
const SECTOR_SHORT={"Consumer Discretionary":"Cons Disc","Information Technology":"Info Tech","Communication Services":"Comm Svcs","Consumer Staples":"Cons Staples"};
const COUNTRY_GROUPS={"United States":"us","Canada":"us","Mexico":"amer","Brazil":"amer","Chile":"amer","Panama":"amer","Britain":"europe","Netherlands":"europe","France":"europe","Germany":"europe","Italy":"europe","Norway":"europe","Luxembourg":"europe","Ireland":"europe","Austria":"europe","Spain":"europe","Sweden":"europe","Switzerland":"europe","Greece":"europe","Denmark":"europe","Belgium":"europe","Hungary":"europe","Russia":"europe","Japan":"asia","Taiwan":"asia","Singapore":"asia","China":"asia","South Korea":"asia","Indonesia":"asia","India":"asia","Australia":"asia","South Africa":"africa","Jordan":"africa","Israel":"africa","Egypt":"africa"};
const COUNTRY_COLORS={us:{bg:"#ede9fe",color:"#5b21b6"},amer:{bg:"#dcfce7",color:"#166534"},europe:{bg:"#dbeafe",color:"#1e40af"},asia:{bg:"#ffe4e6",color:"#9f1239"},africa:{bg:"#fef9c3",color:"#854d0e"}};
const REGION_COLORS={"US & Canada":"#5b21b6","Other Americas":"#166534","Europe":"#1e40af","Asia":"#9f1239","Africa & Middle East":"#854d0e"};
const REGION_GROUPS={"US & Canada":["us"],"Other Americas":["amer"],"Europe":["europe"],"Asia":["asia"],"Africa & Middle East":["africa"]};
const STATUS_RANK={"Own":0,"Focus":1,"Watch":2,"Sold":3,"":4};
const CURRENCY_MAP={"United States":"USD","Canada":"CAD","Britain":"GBP","Australia":"AUD","Japan":"JPY","Switzerland":"CHF","Sweden":"SEK","Norway":"NOK","Denmark":"DKK","South Korea":"KRW","Netherlands":"EUR","France":"EUR","Germany":"EUR","Italy":"EUR","Spain":"EUR","Luxembourg":"EUR","Ireland":"EUR","Austria":"EUR","Belgium":"EUR","Greece":"EUR","Taiwan":"TWD","China":"CNY","Singapore":"SGD","India":"INR","Brazil":"BRL","Mexico":"MXN","Chile":"CLP","South Africa":"ZAR","Indonesia":"IDR","Russia":"RUB","Hungary":"HUF","Israel":"ILS","Egypt":"EGP","Jordan":"JOD","Panama":"USD"};
const ALL_CURRENCIES=["USD","EUR","GBP","JPY","CHF","SEK","NOK","DKK","CAD","AUD","TWD","CNY","SGD","INR","BRL","MXN","CLP","ZAR","IDR","KRW","HUF","ILS","EGP","JOD","RUB"];
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CO_SORTS=["Tier","Last Reviewed","Sector","Country","Name","MOS"];
const FORMATS=["Key Takeaways","Executive Summary","Bullet Points","Q&A","Timeline","Conflict Detector","Custom"];
const TONES=["Academic","Professional","Plain English"];
const LIB_SORTS=["Pinned first","Newest","Oldest","Format","Tag"];
const PRESET_TAGS=["Company Template","Macro","FIV","IV","FGL","GL","EM","SC"];
const UPLOAD_TYPES=["Earnings Report","Sell Side Research","Company Release","News Article","Analyst Note","Other"];
const TEMPLATE_SECTIONS=["Valuation","Overview","Thesis","Segments","Guidance / KPIs","Key Challenges"];
const SECTION_SUBHEADINGS={
  "Valuation":["Method:","Multiple:","Target EPS:","Target Price:","Key Assumptions:"],
  "Overview":["Business:","Geography:","Market Position:","Key Products/Segments:"],
  "Thesis":["Core Thesis:","Bull Case:","Bear Case:","Key Catalysts:"],
  "Segments":["Segment Breakdown:","Growth Drivers:","Margins by Segment:"],
  "Guidance / KPIs":["Revenue Guidance:","Margin Guidance:","Key KPIs:","Management Targets:"],
  "Key Challenges":["Key Risks:","Competitive Threats:","Macro Headwinds:","Execution Risk:"]
};
const THESIS_STATUSES=["On track","Watch","Broken"];
const TP_CHANGES=["Increased","Decreased","Unchanged"];
const AVG_WPM=200;
const ALL_COLS=["Tier(s)","Name","Ticker","Country","Sector","Portfolio","Action","Notes","Reviewed","Updated","Status","MOS","Flag","Del"];
const COMPACT_COLS=new Set(["Tier(s)","Name","Ticker","Status","Reviewed","MOS","Flag","Del"]);
const SHORTCUTS=[{key:"/",desc:"Focus search"},{key:"n",desc:"New company"},{key:"b",desc:"Bulk import"},{key:"d",desc:"Dashboard"},{key:"c",desc:"Companies"},{key:"s",desc:"Synthesize"},{key:"l",desc:"Library"},{key:"r",desc:"Recall"},{key:"Escape",desc:"Close/deselect"},{key:"?",desc:"Show shortcuts"}];
const CONF_BG={"High":"#dcfce7","Medium":"#fef9c3","Low":"#fee2e2"};
const CONF_COLOR={"High":"#166534","Medium":"#854d0e","Low":"#991b1b"};
const ACTIONS=["Increase TP","No Action","Decrease TP"]; const TEAM_MEMBERS=["Chris","Al","Bob","Kevin","Ron"]; const FLAG_STYLES={"Needs Review":{bg:"#fef9c3",color:"#854d0e",icon:"⚑"},"Urgent":{bg:"#fee2e2",color:"#991b1b",icon:"🔴"}};

function shortSector(s){return SECTOR_SHORT[s]||s;}
function sectorStyle(s){return SECTOR_COLORS[s]||{bg:"#f1f5f9",color:"#475569"};}
function countryStyle(c){var g=COUNTRY_GROUPS[c];return g?COUNTRY_COLORS[g]:{bg:"#f1f5f9",color:"#475569"};}
function getRegion(country){if(!country)return null;var g=COUNTRY_GROUPS[country];return Object.keys(REGION_GROUPS).find(function(r){return REGION_GROUPS[r].indexOf(g)>=0;})||null;}
function getTiers(t){if(!t)return[];if(Array.isArray(t))return t;return String(t).split(",").map(function(s){var tr=s.trim();return tr.indexOf(" ")===-1?tr.toUpperCase():tr.trim();}).filter(Boolean);}
function getCurrency(country){return CURRENCY_MAP[country]||"USD";}
function calcNormEPS(v){var e1=parseFloat(v.eps1),e2=parseFloat(v.eps2),w1=parseFloat(v.w1),w2=parseFloat(v.w2);if(!isNaN(e1)&&!isNaN(e2)&&!isNaN(w1)&&!isNaN(w2)){return Math.round(((e1*w1+e2*w2)/100)*10000)/10000;}if(!isNaN(e1)&&isNaN(e2))return e1;return null;}
function calcTP(pe,eps){var p=parseFloat(pe),e=parseFloat(eps);if(isNaN(p)||isNaN(e)||p<=0)return null;return Math.round(p*e*100)/100;}
function calcMOS(tp,price){if(tp===null||tp===undefined)return null;var pr=parseFloat(price);if(isNaN(pr)||pr<=0)return null;return Math.round((tp-pr)/tp*1000)/10;}
function fmtTP(val,currency){if(val===null||val===undefined)return"--";return currency+" "+val.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtMOS(mos){if(mos===null||mos===undefined)return null;return(mos>0?"+":"")+mos+"%";}
function mosBg(mos){if(mos===null)return null;if(mos>=20)return{bg:"#dcfce7",color:"#166534"};if(mos>=0)return{bg:"#fef9c3",color:"#854d0e"};return{bg:"#fee2e2",color:"#991b1b"};}
function impliedFYLabel(v){var parts=[];if(v.fy1&&v.w1)parts.push(v.fy1+(v.w2?" "+v.w1+"%":""));if(v.fy2&&v.w2)parts.push(v.fy2+" "+v.w2+"%");return parts.join(" / ")||v.forwardYear||"";}
function tierPillStyle(t){if(!t)return{bg:"#334155",color:"#fff"};if(t.indexOf("MC")===0){var n=parseInt(t.replace("MC",""));return n<=3?{bg:"#1a3a6b",color:"#fff"}:{bg:"#b45309",color:"#fff"};}if(t==="INTL")return{bg:"#0f766e",color:"#fff"};if(t.indexOf("US")===0)return{bg:"#1a3a6b",color:"#fff"};if(t.indexOf("EM")===0)return{bg:"#92400e",color:"#fff"};if(t.indexOf("SC")===0)return{bg:"#5b21b6",color:"#fff"};if(t.indexOf("F ")===0||t.indexOf("W ")===0)return{bg:"#9d174d",color:"#fff"};if(t==="Hit TP")return{bg:"#64748b",color:"#fff"};if(t==="Gave Up")return{bg:"#94a3b8",color:"#fff"};return{bg:"#334155",color:"#fff"};}
function tierBg(t){var tiers=getTiers(t),first=tiers[0]||"";if(!first)return"#ffffff";if(first.indexOf("MC")===0){var n=parseInt(first.replace("MC",""));return n<=3?"#e8f0f8":"#fde8d8";}if(first==="INTL")return"#d1faf4";if(first.indexOf("US")===0)return"#e8f5ee";if(first.indexOf("EM")===0)return"#fef6e4";if(first.indexOf("SC")===0)return"#f0ecfb";if(first.indexOf("F ")===0||first.indexOf("W ")===0)return"#fceef4";if(first==="Hit TP")return"#f1f5f9";if(first==="Gave Up")return"#f8fafc";return"#ffffff";}
function fmtTime(t){var m=Math.ceil(t.trim().split(/\s+/).length/AVG_WPM);return m===1?"1 min":m+" min";}
function getCore(t){var m=t.match(/Core finding:\s*(.+?)(\n|$)/i);return m?m[1].trim():t.slice(0,120)+"...";}
function getConf(t){var m=t.match(/Confidence:\s*(High|Medium|Low)/i);return m?m[1]:null;}
function toHTML(t){return t.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br/>");}
function toMD(e){return"# "+e.title+"\nFormat: "+e.format+" | Tone: "+e.tone+" | Date: "+e.date+"\nTags: "+((e.tags||[]).join(", ")||"none")+"\n\n"+e.result;}
function simScore(a,b){var sa=new Set(a.toLowerCase().split(/\s+/)),sb=new Set(b.toLowerCase().split(/\s+/)),i=0;sa.forEach(function(w){if(sb.has(w))i++;});return i/(sa.size+sb.size-i);}
function downloadMD(title,content){var blob=new Blob([content],{type:"text/markdown"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(title||"export").replace(/[^a-z0-9]/gi,"_")+".md";a.click();}
function detectCompanyTags(text,companies){var found=[];companies.forEach(function(c){if(c.name&&text.toLowerCase().includes(c.name.toLowerCase()))found.push(c.name);});return Array.from(new Set(found)).slice(0,5);}
function todayStr(){return new Date().toISOString().slice(0,10);}
function parseDate(s){if(!s)return null;var d=new Date(s);if(!isNaN(d.getTime()))return d;var m=s.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2,4})$/);if(m){var months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};var mo=months[m[2].toLowerCase()];if(mo===undefined)return null;var yr=parseInt(m[3]);if(yr<100)yr+=2000;return new Date(yr,mo,parseInt(m[1]));}return null;}
function daysSince(dateStr){if(!dateStr)return Infinity;var d=parseDate(dateStr);if(!d||isNaN(d.getTime()))return Infinity;return Math.floor((Date.now()-d.getTime())/86400000);}
function reviewedColor(dateStr,T){var d=daysSince(dateStr);if(d===Infinity)return T.textDanger;if(d>90)return"#dc2626";if(d>60)return"#d97706";if(d>30)return"#ca8a04";return T.textSuccess;}
function mkTheme(dark){return{dark,bg:dark?"#0f172a":"#ffffff",bgSec:dark?"#1e293b":"#f8fafc",bgTer:dark?"#334155":"#f1f5f9",border:dark?"#334155":"#e2e8f0",borderSec:dark?"#475569":"#d1d5db",text:dark?"#f1f5f9":"#111111",textSec:dark?"#94a3b8":"#6b7280",textDanger:dark?"#f87171":"#dc2626",textSuccess:dark?"#4ade80":"#166534",textInfo:dark?"#60a5fa":"#1e40af",textWarn:dark?"#fbbf24":"#854d0e"};}
function getStatusRank(status){var r=STATUS_RANK[status||""];return(r!==undefined&&r!==null)?r:4;}
function getTierIndex(x){var ts=getTiers(x.tier),best=999;for(var j=0;j<ts.length;j++){var t=ts[j].trim();var idx=TIER_ORDER.indexOf(t);if(idx<0){for(var k=0;k<TIER_ORDER.length;k++){if(TIER_ORDER[k].toUpperCase()===t.toUpperCase()){idx=k;break;}}}if(idx>=0&&idx<best){best=idx;}}return best;}
function getCompanyMOS(c){var val=c.valuation||{};var eps=calcNormEPS(val)||parseFloat(val.eps);var tp=calcTP(val.pe,eps);return calcMOS(tp,val.price);}
function blankEarnings(){return{id:Date.now()+Math.random(),quarter:"",reportDate:"",eps:"",tpChange:"Unchanged",newTP:"",tpRationale:"",bullets:["","","","",""],shortTakeaway:"",extendedTakeaway:"",thesisStatus:"On track",thesisNote:"",open:true};}

function sortCos(list,by,dir){
  var c=list.slice();var WF=new Set(["F MC","W MC","F SC","W SC"]);
  function al(a,b){return a.name.localeCompare(b.name);}
  function isWF(x){var ts=getTiers(x.tier);return ts.length>0&&WF.has(ts[0]);}
  var m=dir==="desc"?-1:1;
  return c.sort(function(a,b){
    var p=0;
    if(by==="Tier"){var ta=getTierIndex(a),tb=getTierIndex(b);if(ta===999&&tb!==999)return 1;if(tb===999&&ta!==999)return -1;p=(ta-tb)*m;if(p!==0)return p;if(isWF(a)&&isWF(b)){var cp=(a.country||"").localeCompare(b.country||"");if(cp!==0)return cp;}var sd=getStatusRank(a.status)-getStatusRank(b.status);if(sd!==0)return sd;return al(a,b);}
    if(by==="Last Reviewed"){var hA=!!a.lastReviewed,hB=!!b.lastReviewed;if(!hA&&!hB)return al(a,b);if(!hA)return 1;if(!hB)return -1;var da=parseDate(a.lastReviewed),db=parseDate(b.lastReviewed);if(!da)return 1;if(!db)return -1;p=(db.getTime()-da.getTime())*m;if(p!==0)return p;return al(a,b);}
    if(by==="MOS"){var ma=getCompanyMOS(a),mb=getCompanyMOS(b);if(ma===null&&mb===null)return al(a,b);if(ma===null)return 1;if(mb===null)return -1;p=(ma-mb)*m;if(p!==0)return p;return al(a,b);}
    if(by==="Name")p=a.name.localeCompare(b.name)*m;
    else if(by==="Country")p=(a.country||"").localeCompare(b.country||"")*m;
    else if(by==="Sector")p=(a.sector||"").localeCompare(b.sector||"")*m;
    if(p!==0)return p;var sd2=getStatusRank(a.status)-getStatusRank(b.status);if(sd2!==0)return sd2;return al(a,b);
  });
}

async function apiCall(system,content,maxTokens){
  var mt=maxTokens||1200;var blocks=typeof content==="string"?[{type:"text",text:content}]:content;
  var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:mt,system,messages:[{role:"user",content:blocks}]})});
  var data=await res.json();if(data.error)throw new Error(JSON.stringify(data.error));
  return(data.content||[]).map(function(b){return b.text||"";}).join("");
}

function PriceAgeIndicator({lastPriceUpdate,T}){   if(!lastPriceUpdate)return <span style={{fontSize:10,color:T.textSec}}>Prices: never updated</span>;   var d=parseDate(lastPriceUpdate);if(!d)return null;   var days=Math.floor((Date.now()-d.getTime())/86400000);   var color=days>14?"#dc2626":days>7?"#d97706":T.textSuccess;   var label=days===0?"today":days===1?"yesterday":days+"d ago";   return <span style={{fontSize:10,color,fontWeight:days>7?600:400}}>Prices updated: {lastPriceUpdate} ({label}){days>14?" ⚠":""}</span>; }  function BarRow({label,clr,own,focus,watch,max,T}){
  var op=max>0?(own/max*100):0,fp=max>0?(focus/max*100):0,wp=max>0?(watch/max*100):0;
  return(<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,fontWeight:500,color:clr,width:140,flexShrink:0}}>{label}</span><div style={{flex:1,height:14,background:"#f1f5f9",borderRadius:4,overflow:"hidden",position:"relative"}}><div style={{position:"absolute",left:0,top:0,width:op+"%",height:"100%",background:clr}}/><div style={{position:"absolute",left:op+"%",top:0,width:fp+"%",height:"100%",background:clr,opacity:0.45}}/><div style={{position:"absolute",left:(op+fp)+"%",top:0,width:wp+"%",height:"100%",background:clr,opacity:0.2}}/></div><div style={{fontSize:11,width:130,flexShrink:0,textAlign:"right"}}>{own>0&&<span style={{color:"#166534",fontWeight:500}}>{own} own</span>}{focus>0&&<span style={{color:"#1e40af"}}>{own>0?" · ":""}{focus} foc</span>}{watch>0&&<span style={{color:"#854d0e"}}>{(own>0||focus>0)?" · ":""}{watch} w</span>}</div></div>);
}

function PillEl({label,bg,color,border,onRemove}){
  return <span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:bg||"#f1f5f9",color:color||"#6b7280",border:border||"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:3,whiteSpace:"nowrap"}}>{label}{onRemove&&<span onClick={function(e){e.stopPropagation();onRemove();}} style={{cursor:"pointer",opacity:0.7,fontSize:10}}>×</span>}</span>;
}

function PortPicker({active,onChange,pillBg,pillColor,plusColor,opts,pillStyleFn,dashedPills}){
  var [open,setOpen]=useState(false);var al=active||[],allOpts=opts||PORTFOLIOS,avail=allOpts.filter(function(p){return al.indexOf(p)<0;});
  function gs(p){return pillStyleFn?pillStyleFn(p):{bg:pillBg,color:pillColor};}
  return(<div onClick={function(e){e.stopPropagation();}} style={{display:"flex",gap:3,alignItems:"center",flexWrap:"nowrap"}}>{al.map(function(p){var s=gs(p);return dashedPills?<span key={p} style={{fontSize:11,padding:"2px 7px",borderRadius:99,border:"1.5px dashed "+s.color,color:s.color,background:"transparent",display:"flex",alignItems:"center",gap:3,whiteSpace:"nowrap"}}>{p}<span onClick={function(){onChange(al.filter(function(x){return x!==p;}));}} style={{cursor:"pointer",opacity:0.7,fontSize:10}}>×</span></span>:<PillEl key={p} label={p} bg={s.bg} color={s.color} border="none" onRemove={function(){onChange(al.filter(function(x){return x!==p;}));}}/>;})}{avail.length>0&&(<div style={{position:"relative",display:"inline-block"}}><span onClick={function(){setOpen(function(o){return !o;});}} style={{fontSize:11,padding:"2px 8px",borderRadius:99,border:"1px dashed "+plusColor,color:plusColor,cursor:"pointer"}}>+</span>{open&&<div onClick={function(e){e.stopPropagation();}} style={{position:"absolute",top:"calc(100% + 2px)",left:0,zIndex:200,background:"#fff",border:"1px solid #ccc",borderRadius:6,padding:4,display:"flex",flexDirection:"column",gap:2,minWidth:80,boxShadow:"0 4px 12px rgba(0,0,0,0.15)"}}>{avail.map(function(p){return <span key={p} onClick={function(){onChange(al.concat([p]));setOpen(false);}} style={{fontSize:12,padding:"5px 10px",cursor:"pointer",borderRadius:4,color:"#111"}} onMouseEnter={function(e){e.target.style.background="#f0f0f0";}} onMouseLeave={function(e){e.target.style.background="";}}>{p}</span>;})}</div>}</div>)}</div>);
}

function SectionBlock({title,content,highlight,flashKey,T}){
  var [open,setOpen]=useState(true);var [flash,setFlash]=useState(false);var prevKey=useRef(null);
  useEffect(function(){if(flashKey&&flashKey!==prevKey.current){prevKey.current=flashKey;setFlash(true);setTimeout(function(){setFlash(false);},2000);}},[flashKey]);
  var html=toHTML(content||"--");
  if(highlight){var esc=highlight.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");html=html.replace(new RegExp("("+esc+")","gi"),"<mark style='background:#fef08a;color:#111'>$1</mark>");}
  return(<div style={{marginBottom:8,border:"1px solid "+(flash?"#f59e0b":T.border),borderRadius:6,overflow:"hidden",transition:"border-color 0.5s"}}><div onClick={function(){setOpen(function(o){return !o;});}} style={{padding:"7px 12px",background:flash?"#fef9c3":T.bgSec,cursor:"pointer",display:"flex",justifyContent:"space-between",transition:"background 0.5s"}}><span style={{fontSize:13,fontWeight:500,color:T.text}}>{title}</span><span style={{fontSize:12,color:T.textSec}}>{open?"▲":"▼"}</span></div>{open&&<div style={{padding:"10px 12px",fontSize:13,lineHeight:1.8,color:T.text,whiteSpace:"pre-wrap",background:T.bg}} dangerouslySetInnerHTML={{__html:html}}/>}</div>);
}

function SectionEditTab({title,content,onSave,T}){
  var isEmpty=!content||!content.trim();var [editing,setEditing]=useState(isEmpty);var [val,setVal]=useState(content||"");var [showRef,setShowRef]=useState(false);
  var subheadings=SECTION_SUBHEADINGS[title]||[];
  useEffect(function(){setVal(content||"");if(!content||!content.trim())setEditing(true);},[content]);
  function insertSubheadings(){var txt=subheadings.map(function(h){return h+"\n";}).join("\n");setVal(function(v){return v?v+"\n\n"+txt:txt;});}
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
      <span style={{fontSize:13,fontWeight:600,color:T.text}}>{title}</span>
      <div style={{display:"flex",gap:6}}>{subheadings.length>0&&<button onClick={function(){setShowRef(function(s){return !s;});}} style={{fontSize:11,padding:"3px 8px",opacity:0.7}}>{showRef?"Hide":"Show"} headings</button>}{!editing&&<button onClick={function(){setEditing(true);setVal(content||"");}} style={{fontSize:12,padding:"4px 12px"}}>Edit</button>}</div>
    </div>
    {showRef&&subheadings.length>0&&(<div style={{marginBottom:10,padding:"8px 12px",background:"#fef9c3",borderRadius:6,border:"1px solid #fde68a",fontSize:12,color:"#854d0e"}}><div style={{fontWeight:500,marginBottom:4}}>Standard subheadings for {title}:</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{subheadings.map(function(h){return <code key={h} style={{fontSize:11,background:"#fef3c7",padding:"1px 6px",borderRadius:4}}>{h}</code>;})}</div></div>)}
    {editing?(<div>{subheadings.length>0&&isEmpty&&<button onClick={insertSubheadings} style={{fontSize:11,padding:"3px 8px",marginBottom:8}}>+ Insert standard subheadings</button>}<textarea value={val} onChange={function(e){setVal(e.target.value);}} style={{width:"100%",minHeight:220,resize:"vertical",fontSize:13,padding:"8px 10px",boxSizing:"border-box",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text,fontFamily:"inherit",lineHeight:1.6,marginBottom:8}}/><div style={{display:"flex",gap:8}}><button onClick={function(){onSave(val);setEditing(false);}} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Save</button>{!isEmpty&&<span onClick={function(){setEditing(false);setVal(content||"");}} style={{fontSize:12,color:T.textSec,cursor:"pointer",padding:"6px 8px"}}>Cancel</span>}</div></div>):(<div style={{fontSize:13,lineHeight:1.8,color:T.text,whiteSpace:"pre-wrap",padding:"10px 12px",background:T.bgSec,borderRadius:6,border:"1px solid "+T.border,minHeight:60}}><span dangerouslySetInnerHTML={{__html:toHTML(content||"")}}/></div>)}
  </div>);
}

// Structured earnings entry component
function EarningsEntry({entry,onSave,onDelete,currency,T}){
  var [e,setE]=useState(entry);
  var [open,setOpen]=useState(entry.open||false);   var [aiOpen,setAiOpen]=useState(false);   var [aiText,setAiText]=useState("");   var [aiLoading,setAiLoading]=useState(false);   async function runAIFill(){     if(!aiText.trim())return;setAiLoading(true);     try{       var res=await apiCall("You are an investment research assistant. Extract earnings data from the provided notes and return ONLY valid JSON with these keys: quarter (string e.g. Q2 2026), reportDate (YYYY-MM-DD or empty string), eps (number as string), tpChange (one of: Unchanged Increased Decreased), newTP (number as string or empty), tpRationale (short string), thesisStatus (one of: On track Watch Broken), thesisNote (short string), shortTakeaway (max 6 words), extendedTakeaway (2-3 sentences), bullets (array of up to 5 key point strings). Return nothing else.",aiText,1200);       var parsed=JSON.parse(res.replace(/```json|```/g,"").trim());       var patch={};       if(parsed.quarter)patch.quarter=parsed.quarter;       if(parsed.reportDate)patch.reportDate=parsed.reportDate;       if(parsed.eps!==undefined)patch.eps=String(parsed.eps);       if(parsed.tpChange&&TP_CHANGES.includes(parsed.tpChange))patch.tpChange=parsed.tpChange;       if(parsed.newTP)patch.newTP=String(parsed.newTP);       if(parsed.tpRationale)patch.tpRationale=parsed.tpRationale;       if(parsed.thesisStatus&&THESIS_STATUSES.includes(parsed.thesisStatus))patch.thesisStatus=parsed.thesisStatus;       if(parsed.thesisNote)patch.thesisNote=parsed.thesisNote;       if(parsed.shortTakeaway)patch.shortTakeaway=parsed.shortTakeaway;       if(parsed.extendedTakeaway)patch.extendedTakeaway=parsed.extendedTakeaway;       if(parsed.bullets&&Array.isArray(parsed.bullets)){var bl=parsed.bullets.slice(0,15);while(bl.length<5)bl.push("");patch.bullets=bl;}       setE(function(prev){return Object.assign({},prev,patch);});       setAiOpen(false);setAiText("");     }catch(err){alert("Could not parse: "+err.message);}     setAiLoading(false);   }
  function upd(patch){setE(function(prev){return Object.assign({},prev,patch);});}
  function updBullet(i,val){var b=e.bullets.slice();b[i]=val;upd({bullets:b});}
  function addBullet(){if(e.bullets.length<15)upd({bullets:e.bullets.concat([""])});}
  function removeBullet(i){upd({bullets:e.bullets.filter(function(_,j){return j!==i;})});}
  var INP={fontSize:12,padding:"5px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg,color:T.text,width:"100%",boxSizing:"border-box"};
  var tcColor=e.thesisStatus==="On track"?"#166534":e.thesisStatus==="Watch"?"#854d0e":"#991b1b";
  var tcBg=e.thesisStatus==="On track"?"#dcfce7":e.thesisStatus==="Watch"?"#fef9c3":"#fee2e2";
  var tpColor=e.tpChange==="Increased"?"#166534":e.tpChange==="Decreased"?"#991b1b":"#475569";
  var tpBg=e.tpChange==="Increased"?"#dcfce7":e.tpChange==="Decreased"?"#fee2e2":"#f1f5f9";
  return(
    <div style={{border:"2px solid "+T.borderSec,borderRadius:10,overflow:"hidden",marginBottom:12}}>
      {/* Header bar */}
      <div onClick={function(){setOpen(function(o){return !o;});}} style={{padding:"10px 14px",background:T.bgTer,cursor:"pointer",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:13,fontWeight:700,color:T.text,flex:1}}>{e.quarter||"New Earnings Entry"}</span>
        {e.reportDate&&<span style={{fontSize:11,color:T.textSec}}>{e.reportDate}</span>}
        {e.eps&&<span style={{fontSize:11,padding:"1px 7px",borderRadius:99,background:"#dbeafe",color:"#1e40af",fontWeight:500}}>EPS {currency} {e.eps}</span>}
        {e.tpChange&&e.tpChange!=="Unchanged"&&<span style={{fontSize:11,padding:"1px 7px",borderRadius:99,background:tpBg,color:tpColor,fontWeight:500}}>{e.tpChange} TP{e.newTP?" → "+currency+" "+e.newTP:""}</span>}
        {e.thesisStatus&&<span style={{fontSize:11,padding:"1px 7px",borderRadius:99,background:tcBg,color:tcColor,fontWeight:500}}>{e.thesisStatus}</span>}
        {e.shortTakeaway&&<span style={{fontSize:11,color:T.textSec,fontStyle:"italic",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{e.shortTakeaway}"</span>}
        <span style={{fontSize:11,color:T.textSec,marginLeft:"auto"}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{padding:"14px",background:T.bg}}>           <div style={{marginBottom:14,border:"1px solid "+T.border,borderRadius:8,overflow:"hidden"}}>             <div onClick={function(){setAiOpen(function(o){return !o;});}} style={{padding:"8px 12px",background:aiOpen?"#dbeafe":T.bgSec,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>               <span style={{fontSize:12,fontWeight:600,color:aiOpen?"#1e40af":T.text}}>✨ AI Auto-fill from notes</span>               <span style={{fontSize:11,color:T.textSec}}>{aiOpen?"▲":"▼ click to paste earnings notes and auto-fill all fields"}</span>             </div>             {aiOpen&&(<div style={{padding:"12px",background:T.bg}}>               <div style={{fontSize:12,color:T.textSec,marginBottom:6}}>Paste raw earnings notes, report excerpts, or your own commentary. AI will fill all fields automatically.</div>               <textarea value={aiText} onChange={function(ev){setAiText(ev.target.value);}} placeholder="Paste earnings notes here..." style={{width:"100%",minHeight:120,resize:"vertical",fontSize:13,padding:"8px 10px",boxSizing:"border-box",borderRadius:6,border:"1px solid "+T.border,background:T.bgSec,color:T.text,fontFamily:"inherit",lineHeight:1.6,marginBottom:8}}/>               <div style={{display:"flex",gap:8}}>                 <button onClick={runAIFill} disabled={aiLoading||!aiText.trim()} style={{fontSize:12,padding:"6px 16px",fontWeight:600,background:"#1e40af",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",opacity:aiLoading||!aiText.trim()?0.6:1}}>{aiLoading?"Analyzing...":"Auto-fill fields"}</button>                 <button onClick={function(){setAiOpen(false);setAiText("");}} style={{fontSize:12,padding:"6px 12px"}}>Cancel</button>               </div>             </div>)}           </div>
          {/* Row 1: quarter, date, eps */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
            <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:3,textTransform:"uppercase"}}>Quarter</label><input value={e.quarter} onChange={function(ev){upd({quarter:ev.target.value});}} placeholder="e.g. Q2 2026" style={INP}/></div>
            <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:3,textTransform:"uppercase"}}>Report Date</label><input value={e.reportDate} onChange={function(ev){upd({reportDate:ev.target.value});}} placeholder="YYYY-MM-DD" style={INP}/></div>
            <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:3,textTransform:"uppercase"}}>EPS ({currency})</label><input type="number" step="0.01" value={e.eps} onChange={function(ev){upd({eps:ev.target.value});}} placeholder="e.g. 1.85" style={INP}/></div>
          </div>
          {/* Row 2: TP change */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
            <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:3,textTransform:"uppercase"}}>TP Change</label>
              <select value={e.tpChange} onChange={function(ev){upd({tpChange:ev.target.value});}} style={{...INP,appearance:"none"}}>
                {TP_CHANGES.map(function(t){return <option key={t}>{t}</option>;})}
              </select>
            </div>
            <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:3,textTransform:"uppercase"}}>New TP ({currency})</label><input type="number" step="0.01" value={e.newTP} onChange={function(ev){upd({newTP:ev.target.value});}} placeholder="e.g. 52.00" style={INP} disabled={e.tpChange==="Unchanged"}/></div>
            <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:3,textTransform:"uppercase"}}>TP Rationale</label><input value={e.tpRationale} onChange={function(ev){upd({tpRationale:ev.target.value});}} placeholder="Brief reason" style={INP}/></div>
          </div>
          {/* Thesis check */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,marginBottom:12}}>
            <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:3,textTransform:"uppercase"}}>Thesis Check</label>
              <select value={e.thesisStatus} onChange={function(ev){upd({thesisStatus:ev.target.value});}} style={{...INP,appearance:"none",background:tcBg,color:tcColor,fontWeight:500}}>
                {THESIS_STATUSES.map(function(s){return <option key={s}>{s}</option>;})}
              </select>
            </div>
            <div><label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:3,textTransform:"uppercase"}}>Thesis Note</label><input value={e.thesisNote} onChange={function(ev){upd({thesisNote:ev.target.value});}} placeholder="What changed / what to watch" style={INP}/></div>
          </div>
          {/* Takeaways */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:3,textTransform:"uppercase"}}>Six-Word Takeaway <span style={{color:"#1e40af"}}>(→ Note)</span></label>
              <input value={e.shortTakeaway} onChange={function(ev){upd({shortTakeaway:ev.target.value});}} placeholder="Max 6 words" style={INP} maxLength={60}/>
              {e.shortTakeaway&&e.shortTakeaway.split(/\s+/).filter(Boolean).length>6&&<div style={{fontSize:10,color:"#dc2626",marginTop:2}}>Over 6 words</div>}
            </div>
            <div>
              <label style={{fontSize:10,color:T.textSec,display:"block",marginBottom:3,textTransform:"uppercase"}}>Extended Takeaway <span style={{color:"#1e40af"}}>(→ Extended Note)</span></label>
              <textarea value={e.extendedTakeaway} onChange={function(ev){upd({extendedTakeaway:ev.target.value});}} rows={2} style={{...INP,resize:"vertical",fontFamily:"inherit",lineHeight:1.5}}/>
            </div>
          </div>
          {/* Bullets */}
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <label style={{fontSize:10,color:T.textSec,textTransform:"uppercase"}}>Summary Bullets ({e.bullets.filter(function(b){return b.trim();}).length}/15)</label>
              {e.bullets.length<15&&<button onClick={addBullet} style={{fontSize:11,padding:"2px 8px"}}>+ Add</button>}
            </div>
            {e.bullets.map(function(b,i){return(
              <div key={i} style={{display:"flex",gap:6,marginBottom:4,alignItems:"center"}}>
                <span style={{fontSize:12,color:T.textSec,flexShrink:0}}>•</span>
                <input value={b} onChange={function(ev){updBullet(i,ev.target.value);}} placeholder={"Bullet "+(i+1)} style={{...INP,flex:1}}/>
                {e.bullets.length>1&&<span onClick={function(){removeBullet(i);}} style={{fontSize:11,color:T.textDanger,cursor:"pointer",flexShrink:0}}>×</span>}
              </div>
            );})}
          </div>
          {/* Actions */}
          <div style={{display:"flex",gap:8,paddingTop:10,borderTop:"1px solid "+T.border}}>
            <button onClick={function(){onSave(e);setOpen(false);}} style={{fontSize:12,padding:"6px 16px",fontWeight:600,background:"#1e40af",color:"#fff",border:"none",borderRadius:6,cursor:"pointer"}}>Save entry</button>
            <button onClick={function(){setOpen(false);}} style={{fontSize:12,padding:"6px 12px"}}>Close</button>
            <span onClick={onDelete} style={{fontSize:12,color:T.textDanger,cursor:"pointer",marginLeft:"auto",padding:"6px 0"}}>Delete entry</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DiffView({diff,onAccept,onReject,T}){
  return(<div style={{marginTop:10}}><div style={{fontSize:13,fontWeight:500,color:T.text,marginBottom:8}}>Proposed changes</div>{diff.map(function(d,i){return(<div key={i} style={{marginBottom:8,border:"1px solid "+T.border,borderRadius:6,overflow:"hidden"}}><div style={{padding:"6px 10px",background:T.bgSec,fontSize:12,fontWeight:500,color:T.textSec}}>{d.section}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}><div style={{padding:"8px 10px",borderRight:"1px solid "+T.border}}><div style={{fontSize:10,color:T.textDanger,marginBottom:4,textTransform:"uppercase"}}>Before</div><div style={{fontSize:12,lineHeight:1.6,color:T.textSec,whiteSpace:"pre-wrap"}}>{d.before||"(empty)"}</div></div><div style={{padding:"8px 10px"}}><div style={{fontSize:10,color:T.textSuccess,marginBottom:4,textTransform:"uppercase"}}>After</div><div style={{fontSize:12,lineHeight:1.6,color:T.text,whiteSpace:"pre-wrap"}}>{d.after}</div></div></div>{d.reason&&<div style={{padding:"5px 10px",background:T.bgSec,fontSize:11,color:T.textSec,borderTop:"1px solid "+T.border}}>{d.reason}</div>}</div>);})}<div style={{display:"flex",gap:8,marginTop:8}}><button onClick={onAccept} style={{flex:1,padding:"8px",fontWeight:500}}>Accept all changes</button><button onClick={onReject} style={{padding:"8px 14px"}}>Discard</button></div></div>);
}

function StatusPill({status}){
  var cfg={"Own":{bg:"#dcfce7",color:"#166534"},"Focus":{bg:"#dbeafe",color:"#1e40af"},"Watch":{bg:"#fef9c3",color:"#854d0e"},"Sold":{bg:"#fee2e2",color:"#991b1b"}}[status]||{bg:"#f1f5f9",color:"#6b7280"};
  return <span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:cfg.bg,color:cfg.color,fontWeight:500,whiteSpace:"nowrap"}}>{status||"--"}</span>;
}

function NotesCell({company,onUpdate,T}){
  var [open,setOpen]=useState(false);var [sv,setSv]=useState(company.takeaway||"");var [lv,setLv]=useState(company.takeawayLong||"");var ref=useRef();
  useEffect(function(){if(!open)return;function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}document.addEventListener("mousedown",h);return function(){document.removeEventListener("mousedown",h);};},[open]);
  var hasLong=!!(company.takeawayLong&&company.takeawayLong.trim());
  function save(){onUpdate(company.id,{takeaway:sv,takeawayLong:lv});setOpen(false);}
  return(<div style={{position:"relative"}} onClick={function(e){e.stopPropagation();}}><div style={{display:"flex",alignItems:"center",gap:4}}><span onClick={function(){setOpen(true);setSv(company.takeaway||"");setLv(company.takeawayLong||"");}} style={{fontSize:11,color:company.takeaway?T.textSec:T.border,fontStyle:company.takeaway?"normal":"italic",display:"block",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer",borderBottom:"1px dashed "+T.borderSec}}>{company.takeaway||"add note..."}</span>{hasLong&&<span title="Extended notes" style={{fontSize:9,cursor:"pointer"}} onClick={function(){setOpen(true);setSv(company.takeaway||"");setLv(company.takeawayLong||"");}}>📝</span>}</div>{open&&(<div ref={ref} style={{position:"absolute",top:"100%",left:0,zIndex:300,background:T.bg,border:"1px solid "+T.border,borderRadius:8,padding:12,width:300,boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}><div style={{fontSize:11,color:T.textSec,marginBottom:4}}>Short takeaway</div><input value={sv} onChange={function(e){setSv(e.target.value);}} style={{width:"100%",boxSizing:"border-box",fontSize:12,padding:"5px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bgSec,color:T.text,marginBottom:8}}/><div style={{fontSize:11,color:T.textSec,marginBottom:4}}>Extended notes</div><textarea value={lv} onChange={function(e){setLv(e.target.value);}} rows={5} style={{width:"100%",boxSizing:"border-box",fontSize:12,padding:"5px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bgSec,color:T.text,resize:"vertical",fontFamily:"inherit",lineHeight:1.6,marginBottom:8}}/><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><span onClick={function(){setOpen(false);}} style={{fontSize:12,color:T.textSec,cursor:"pointer",padding:"4px 8px"}}>Cancel</span><button onClick={save} style={{fontSize:12,padding:"4px 12px",fontWeight:500}}>Save</button></div></div>)}</div>);
}

function ActionCell({value,onUpdate,T}){
  var [open,setOpen]=useState(false);var ref=useRef();
  useEffect(function(){if(!open)return;function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}document.addEventListener("mousedown",h);return function(){document.removeEventListener("mousedown",h);};},[open]);
  var aColor=value==="Increase TP"?"#166534":value==="Decrease TP"?"#dc2626":"#6b7280";
  var aBg=value==="Increase TP"?"#dcfce7":value==="Decrease TP"?"#fee2e2":value?"#f1f5f9":"transparent";
  return(<div style={{position:"relative"}} ref={ref} onClick={function(e){e.stopPropagation();}}><div onClick={function(){setOpen(function(o){return !o;});}} style={{cursor:"pointer",minWidth:24}}>{value?<span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:aBg,color:aColor}}>{value}</span>:<span style={{fontSize:11,color:"#94a3b8",borderBottom:"1px dashed #e2e8f0"}}>--</span>}</div>{open&&(<div style={{position:"absolute",top:"calc(100% + 2px)",left:0,zIndex:200,background:"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:4,boxShadow:"0 4px 12px rgba(0,0,0,0.15)",minWidth:130}}><div onClick={function(){onUpdate("");setOpen(false);}} style={{fontSize:12,padding:"5px 10px",cursor:"pointer",borderRadius:4,color:"#6b7280"}} onMouseEnter={function(e){e.currentTarget.style.background="#f1f5f9";}} onMouseLeave={function(e){e.currentTarget.style.background="";}}>-- None</div>{ACTIONS.map(function(a){var ac=a==="Increase TP"?"#166534":a==="Decrease TP"?"#dc2626":"#6b7280";return(<div key={a} onClick={function(){onUpdate(a);setOpen(false);}} style={{fontSize:12,padding:"5px 10px",cursor:"pointer",borderRadius:4,color:ac,fontWeight:500}} onMouseEnter={function(e){e.currentTarget.style.background="#f1f5f9";}} onMouseLeave={function(e){e.currentTarget.style.background="";}}>{a}</div>);})}</div>)}</div>);
}

function FlagCell({value,onUpdate,T}){   var [open,setOpen]=useState(false);var ref=useRef();   useEffect(function(){if(!open)return;function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}document.addEventListener("mousedown",h);return function(){document.removeEventListener("mousedown",h);};},[open]);   var fs=value?FLAG_STYLES[value]:null;   return(<div style={{position:"relative"}} ref={ref} onClick={function(e){e.stopPropagation();}}><div onClick={function(){setOpen(function(o){return !o;});}} style={{cursor:"pointer",minWidth:20}}>{fs?<span style={{fontSize:11,padding:"2px 6px",borderRadius:99,background:fs.bg,color:fs.color,whiteSpace:"nowrap"}}>{fs.icon} {value}</span>:<span style={{fontSize:12,color:T.border}}>—</span>}</div>{open&&(<div style={{position:"absolute",top:"calc(100% + 2px)",left:0,zIndex:200,background:"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:4,boxShadow:"0 4px 12px rgba(0,0,0,0.15)",minWidth:150}}><div onClick={function(){onUpdate("");setOpen(false);}} style={{fontSize:12,padding:"5px 10px",cursor:"pointer",borderRadius:4,color:"#6b7280"}} onMouseEnter={function(e){e.currentTarget.style.background="#f1f5f9";}} onMouseLeave={function(e){e.currentTarget.style.background="";}}>— Clear flag</div>{Object.keys(FLAG_STYLES).map(function(f){var fs2=FLAG_STYLES[f];return(<div key={f} onClick={function(){onUpdate(f);setOpen(false);}} style={{fontSize:12,padding:"5px 10px",cursor:"pointer",borderRadius:4,color:fs2.color,fontWeight:500}} onMouseEnter={function(e){e.currentTarget.style.background="#f1f5f9";}} onMouseLeave={function(e){e.currentTarget.style.background="";}}>{fs2.icon} {f}</div>);})}</div>)}</div>); }  function DatePicker({value,onChange,T}){
  var [open,setOpen]=useState(false);var [viewYear,setViewYear]=useState(function(){var d=value?new Date(value):new Date();return isNaN(d)?new Date().getFullYear():d.getFullYear();});var [viewMonth,setViewMonth]=useState(function(){var d=value?new Date(value):new Date();return isNaN(d)?new Date().getMonth():d.getMonth();});var ref=useRef();
  useEffect(function(){if(!open)return;function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}document.addEventListener("mousedown",h);return function(){document.removeEventListener("mousedown",h);};},[open]);
  var parsed=value?parseDate(value):null;
  function daysInMonth(y,m){return new Date(y,m+1,0).getDate();}function firstDayOfMonth(y,m){return new Date(y,m,1).getDay();}
  function selectDate(d){var s=viewYear+"-"+String(viewMonth+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");onChange(s);setOpen(false);}
  var days=daysInMonth(viewYear,viewMonth);var firstDay=firstDayOfMonth(viewYear,viewMonth);var cells=[];for(var i=0;i<firstDay;i++)cells.push(null);for(var j=1;j<=days;j++)cells.push(j);
  var selectedDay=parsed&&parsed.getFullYear()===viewYear&&parsed.getMonth()===viewMonth?parsed.getDate():null;
  return(<div style={{position:"relative",display:"inline-block"}} ref={ref} onClick={function(e){e.stopPropagation();}}><span onClick={function(){setOpen(function(o){return !o;});if(!open&&value){var d=parseDate(value);if(d&&!isNaN(d)){setViewYear(d.getFullYear());setViewMonth(d.getMonth());}}}} style={{fontSize:10,color:value?"#166534":"#dc2626",fontWeight:value?600:400,cursor:"pointer",borderBottom:"1px dashed #94a3b8",whiteSpace:"nowrap"}}>{value||"--"}</span>{open&&(<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:400,background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",padding:12,minWidth:220}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}><span onClick={function(){if(viewMonth===0){setViewMonth(11);setViewYear(function(y){return y-1;});}else setViewMonth(function(m){return m-1;});}} style={{cursor:"pointer",padding:"2px 8px",borderRadius:4,fontSize:14,fontWeight:600,color:"#334155"}}>‹</span><div style={{display:"flex",gap:6,alignItems:"center"}}><select value={viewMonth} onChange={function(e){setViewMonth(parseInt(e.target.value));}} style={{fontSize:12,border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 4px",color:"#111"}}>{MONTHS.map(function(m,i){return <option key={i} value={i}>{m}</option>;})}</select><input type="number" value={viewYear} onChange={function(e){var y=parseInt(e.target.value);if(!isNaN(y)&&y>1900&&y<2100)setViewYear(y);}} style={{fontSize:12,border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 4px",width:58,color:"#111"}}/></div><span onClick={function(){if(viewMonth===11){setViewMonth(0);setViewYear(function(y){return y+1;});}else setViewMonth(function(m){return m+1;});}} style={{cursor:"pointer",padding:"2px 8px",borderRadius:4,fontSize:14,fontWeight:600,color:"#334155"}}>›</span></div><div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>{["Su","Mo","Tu","We","Th","Fr","Sa"].map(function(d){return <div key={d} style={{fontSize:10,textAlign:"center",color:"#94a3b8",fontWeight:600,padding:"2px 0"}}>{d}</div>;})}</div><div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>{cells.map(function(d,i){return(<div key={i} onClick={d?function(){selectDate(d);}:undefined} style={{fontSize:12,textAlign:"center",padding:"4px 2px",borderRadius:4,cursor:d?"pointer":"default",background:d&&d===selectedDay?"#1e40af":"transparent",color:d&&d===selectedDay?"#fff":d?"#111":"transparent",fontWeight:d&&d===selectedDay?600:400}} onMouseEnter={function(e){if(d&&d!==selectedDay)e.currentTarget.style.background="#f1f5f9";}} onMouseLeave={function(e){if(d&&d!==selectedDay)e.currentTarget.style.background="transparent";}}>{d||""}</div>);})}</div><div style={{marginTop:8,display:"flex",justifyContent:"space-between"}}><span onClick={function(){onChange(todayStr());setOpen(false);}} style={{fontSize:11,color:"#1e40af",cursor:"pointer"}}>Today</span>{value&&<span onClick={function(){onChange("");setOpen(false);}} style={{fontSize:11,color:"#dc2626",cursor:"pointer"}}>Clear</span>}</div></div>)}</div>);
}

function GlobalSearch({companies,saved,onSelectCompany,onSelectEntry,onClose,T}){   var [q,setQ]=useState("");var inp=useRef();   useEffect(function(){if(inp.current)inp.current.focus();},[]);   var results=[];   if(q.trim().length>=2){     var ql=q.toLowerCase();     companies.forEach(function(c){var score=0;if(c.name&&c.name.toLowerCase().includes(ql))score+=3;if(c.ticker&&c.ticker.toLowerCase().includes(ql))score+=3;if(c.sector&&c.sector.toLowerCase().includes(ql))score+=1;if(c.country&&c.country.toLowerCase().includes(ql))score+=1;if(c.takeaway&&c.takeaway.toLowerCase().includes(ql))score+=1;if(Object.values(c.sections||{}).some(function(v){return v&&v.toLowerCase().includes(ql);}))score+=2;if((c.earningsEntries||[]).some(function(e){return(e.shortTakeaway||"").toLowerCase().includes(ql)||(e.extendedTakeaway||"").toLowerCase().includes(ql);}))score+=1;if(score>0)results.push({type:"company",item:c,score});});     saved.forEach(function(s){var score=0;if(s.title&&s.title.toLowerCase().includes(ql))score+=3;if(s.result&&s.result.toLowerCase().includes(ql))score+=1;if((s.tags||[]).some(function(t){return t.toLowerCase().includes(ql);}))score+=2;if(score>0)results.push({type:"library",item:s,score});});     results.sort(function(a,b){return b.score-a.score;});results=results.slice(0,20);   }   return(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:60}} onClick={onClose}><div onClick={function(e){e.stopPropagation();}} style={{background:T.bg,border:"1px solid "+T.border,borderRadius:12,padding:20,width:580,maxHeight:"75vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}>     <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:10}}>🔍 Global Search</div>     <input ref={inp} value={q} onChange={function(e){setQ(e.target.value);}} placeholder="Search companies, tickers, library entries, earnings..." style={{fontSize:13,padding:"8px 10px",borderRadius:6,border:"1px solid "+T.border,background:T.bgSec,color:T.text,marginBottom:10}}/>     <div style={{overflowY:"auto",flex:1}}>       {q.trim().length<2?<div style={{fontSize:12,color:T.textSec}}>Type at least 2 characters to search across everything.</div>:results.length===0?<div style={{fontSize:12,color:T.textSec}}>No results found.</div>:results.map(function(r,i){         if(r.type==="company"){var c=r.item;var ss=c.sector?sectorStyle(c.sector):null;return(<div key={i} onClick={function(){onSelectCompany(c);onClose();}} style={{padding:"10px 12px",borderRadius:8,border:"1px solid "+T.border,marginBottom:6,cursor:"pointer",background:T.bgSec}} onMouseEnter={function(e){e.currentTarget.style.background=T.bgTer;}} onMouseLeave={function(e){e.currentTarget.style.background=T.bgSec;}}><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}><span style={{fontSize:10,padding:"1px 5px",borderRadius:3,background:"#dbeafe",color:"#1e40af",fontWeight:500}}>Co</span><span style={{fontSize:13,fontWeight:500,color:T.text}}>{c.name}</span>{c.ticker&&<span style={{fontSize:11,color:T.textSec}}>{c.ticker}</span>}{ss&&<span style={{fontSize:11,padding:"1px 6px",borderRadius:99,background:ss.bg,color:ss.color}}>{shortSector(c.sector)}</span>}{c.status&&<StatusPill status={c.status}/>}</div>{c.takeaway&&<div style={{fontSize:12,color:T.textSec,fontStyle:"italic"}}>"{c.takeaway}"</div>}</div>);}         if(r.type==="library"){var s=r.item;return(<div key={i} onClick={function(){onSelectEntry(s);onClose();}} style={{padding:"10px 12px",borderRadius:8,border:"1px solid "+T.border,marginBottom:6,cursor:"pointer",background:T.bgSec}} onMouseEnter={function(e){e.currentTarget.style.background=T.bgTer;}} onMouseLeave={function(e){e.currentTarget.style.background=T.bgSec;}}><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3}}><span style={{fontSize:10,padding:"1px 5px",borderRadius:3,background:"#f3e8ff",color:"#6b21a8",fontWeight:500}}>Lib</span><span style={{fontSize:13,fontWeight:500,color:T.text}}>{s.title}</span><span style={{fontSize:11,color:T.textSec}}>{s.date}</span></div><div style={{fontSize:12,color:T.textSec}}>{getCore(s.result)}</div></div>);}         return null;       })}     </div>     <div style={{marginTop:10,fontSize:12,color:T.textSec,textAlign:"right",cursor:"pointer"}} onClick={onClose}>Close (Esc)</div>   </div></div>); }  function EarningsCalendar({companies,T}){   var today=new Date();today.setHours(0,0,0,0);   var cutoff=new Date(today);cutoff.setDate(cutoff.getDate()+30);   var upcoming=[];   companies.forEach(function(c){(c.earningsEntries||[]).forEach(function(e){if(!e.reportDate)return;var d=parseDate(e.reportDate);if(!d)return;d.setHours(0,0,0,0);if(d>=today&&d<=cutoff)upcoming.push({company:c,entry:e,date:d,daysAway:Math.floor((d-today)/86400000)});});});   upcoming.sort(function(a,b){return a.date-b.date;});   if(upcoming.length===0)return <p style={{fontSize:13,color:T.textSec}}>No earnings scheduled in the next 30 days. Add report dates in the Earnings tab of each company.</p>;   return(<div>{upcoming.map(function(u,i){var c=u.company;var e=u.entry;var isToday=u.daysAway===0;var isTomorrow=u.daysAway===1;var label=isToday?"Today":isTomorrow?"Tomorrow":u.daysAway+"d away";var labelColor=isToday?"#dc2626":isTomorrow?"#d97706":"#166534";var ss=c.sector?sectorStyle(c.sector):null;return(<div key={i} style={{display:"flex",gap:12,alignItems:"center",padding:"10px 14px",borderRadius:8,border:"1px solid "+T.border,marginBottom:6,background:isToday?"#fff5f5":isTomorrow?"#fffbeb":T.bgSec}}><div style={{minWidth:60,textAlign:"center"}}><div style={{fontSize:18,fontWeight:700,color:labelColor}}>{u.date.getDate()}</div><div style={{fontSize:10,color:T.textSec}}>{MONTHS[u.date.getMonth()]}</div></div><div style={{flex:1}}><div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:2}}><span style={{fontSize:13,fontWeight:600,color:T.text}}>{c.name}</span>{c.ticker&&<span style={{fontSize:11,color:T.textSec}}>{c.ticker}</span>}{ss&&<span style={{fontSize:11,padding:"1px 6px",borderRadius:99,background:ss.bg,color:ss.color}}>{shortSector(c.sector)}</span>}{c.status&&<StatusPill status={c.status}/>}</div><div style={{fontSize:12,color:T.textSec}}>{e.quarter||"Earnings"}</div></div><div style={{fontSize:12,fontWeight:600,color:labelColor,whiteSpace:"nowrap"}}>{label}</div></div>);})}   </div>); }  function TemplateSearch({companies,onSelect,onClose,T}){
  var [q,setQ]=useState("");var inp=useRef();
  useEffect(function(){if(inp.current)inp.current.focus();},[]);
  var allSections=[...TEMPLATE_SECTIONS,"Earnings & Thesis Check"];
  var results=q.trim().length<2?[]:companies.filter(function(c){return allSections.map(function(s){return(c.sections&&c.sections[s])||"";}).join(" ").toLowerCase().indexOf(q.toLowerCase())>=0;});
  return(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.4)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:80}} onClick={onClose}><div onClick={function(e){e.stopPropagation();}} style={{background:T.bg,border:"1px solid "+T.border,borderRadius:12,padding:20,width:520,maxHeight:"70vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}><div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:10}}>Search across all templates</div><input ref={inp} value={q} onChange={function(e){setQ(e.target.value);}} placeholder="Type at least 2 characters..." style={{fontSize:13,padding:"8px 10px",borderRadius:6,border:"1px solid "+T.border,background:T.bgSec,color:T.text,marginBottom:10}}/><div style={{overflowY:"auto",flex:1}}>{q.trim().length<2?<div style={{fontSize:12,color:T.textSec}}>Type at least 2 characters.</div>:results.length===0?<div style={{fontSize:12,color:T.textSec}}>No matches.</div>:results.map(function(c){var matching=allSections.filter(function(s){return(c.sections&&c.sections[s]||"").toLowerCase().indexOf(q.toLowerCase())>=0;});return(<div key={c.id} onClick={function(){onSelect(c,q);onClose();}} style={{padding:"10px 12px",borderRadius:8,border:"1px solid "+T.border,marginBottom:6,cursor:"pointer",background:T.bgSec}} onMouseEnter={function(e){e.currentTarget.style.background=T.bgTer;}} onMouseLeave={function(e){e.currentTarget.style.background=T.bgSec;}}><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}><span style={{fontSize:13,fontWeight:500,color:T.text}}>{c.name}</span><span style={{fontSize:11,color:T.textSec}}>{c.ticker}</span>{c.sector&&(function(){var ss=sectorStyle(c.sector);return <span style={{fontSize:11,padding:"1px 6px",borderRadius:99,background:ss.bg,color:ss.color}}>{shortSector(c.sector)}</span>;}())}</div><div style={{fontSize:11,color:T.textSec}}>Found in: {matching.join(", ")}</div></div>);})}</div><div style={{marginTop:10,fontSize:12,color:T.textSec,textAlign:"right",cursor:"pointer"}} onClick={onClose}>Close (Esc)</div></div></div>);
}

function OverlapMatrix({companies,T}){
  var ports=PORTFOLIOS.filter(function(p){return companies.some(function(c){return(c.portfolios||[]).indexOf(p)>=0;});});
  if(ports.length<2)return <p style={{fontSize:13,color:T.textSec}}>Need at least 2 portfolios.</p>;
  function overlap(a,b){return companies.filter(function(c){return(c.portfolios||[]).indexOf(a)>=0&&(c.portfolios||[]).indexOf(b)>=0;}).length;}
  function total(p){return companies.filter(function(c){return(c.portfolios||[]).indexOf(p)>=0;}).length;}
  return(<div style={{overflowX:"auto"}}><div style={{display:"table",borderCollapse:"collapse",fontSize:11}}><div style={{display:"table-row"}}><div style={{display:"table-cell",padding:"4px 8px"}}/>{ports.map(function(p){return <div key={p} style={{display:"table-cell",padding:"4px 8px",fontWeight:600,color:T.text,textAlign:"center"}}>{p}<div style={{fontSize:10,color:T.textSec,fontWeight:400}}>{total(p)}</div></div>;})}</div>{ports.map(function(pa){return(<div key={pa} style={{display:"table-row"}}><div style={{display:"table-cell",padding:"4px 8px",fontWeight:600,color:T.text,whiteSpace:"nowrap"}}>{pa}</div>{ports.map(function(pb){var n=pa===pb?total(pa):overlap(pa,pb);var pct=pa===pb?100:total(pa)>0?Math.round(n/total(pa)*100):0;var bg=pa===pb?T.bgTer:n===0?T.bg:"rgba(99,102,241,"+(0.1+pct/100*0.6)+")";return <div key={pb} style={{display:"table-cell",padding:"6px 10px",textAlign:"center",background:bg,color:T.text,border:"1px solid "+T.border,borderRadius:4}}>{pa===pb?<span style={{color:T.textSec}}>—</span>:n>0?<span><strong>{n}</strong><span style={{color:T.textSec}}> ({pct}%)</span></span>:<span style={{color:T.border}}>0</span>}</div>;})}}</div>);})}</div><div style={{fontSize:11,color:T.textSec,marginTop:8}}>Numbers = shared companies. % = relative to row portfolio.</div></div>);
}

function QuickUploadModal({company,onClose,onAccept,T}){
  var [txt,setTxt]=useState("");var [utype,setUtype]=useState("Earnings Report");var [loading,setLoading]=useState(false);var [diff,setDiff]=useState(null);var [meta,setMeta]=useState(null);
  async function run(){if(!txt.trim())return;setLoading(true);setDiff(null);setMeta(null);try{var allSecs=[...TEMPLATE_SECTIONS,"Earnings & Thesis Check"];var cur=allSecs.map(function(s){return"## "+s+"\n"+((company.sections&&company.sections[s])||"(empty)");}).join("\n\n");var r=await apiCall("Investment research assistant. New research ("+utype+") for "+company.name+" ("+company.ticker+"). Current template:\n"+cur+"\n\nReturn ONLY JSON: {changes:[{section,before,after,reason}],summary:string}. No markdown fences.",[{type:"text",text:txt}],2500);var parsed=JSON.parse(r.replace(/```json|```/g,"").trim());setDiff(parsed.changes||[]);setMeta({summary:parsed.summary,type:utype});}catch(e){alert("Could not process: "+e.message);}setLoading(false);}
  return(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}><div onClick={function(e){e.stopPropagation();}} style={{background:T.bg,border:"1px solid "+T.border,borderRadius:12,padding:20,width:600,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:14,fontWeight:600,color:T.text}}>Upload research — {company.name}</div><span onClick={onClose} style={{fontSize:12,color:T.textSec,cursor:"pointer"}}>✕</span></div><select value={utype} onChange={function(e){setUtype(e.target.value);}} style={{fontSize:12,padding:"6px 8px",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text,marginBottom:8}}>{UPLOAD_TYPES.map(function(t){return <option key={t}>{t}</option>;})}</select><textarea value={txt} onChange={function(e){setTxt(e.target.value);}} placeholder="Paste research content..." style={{width:"100%",minHeight:120,resize:"vertical",fontSize:13,padding:"8px 10px",boxSizing:"border-box",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text,fontFamily:"inherit",lineHeight:1.6,marginBottom:8}}/><button onClick={run} disabled={loading||!txt.trim()} style={{width:"100%",padding:"9px",fontWeight:500,marginBottom:12}}>{loading?"Analyzing...":"Analyze and propose updates"}</button>{diff&&meta&&(diff.length===0?<p style={{fontSize:13,color:T.textSec}}>No changes needed.</p>:<DiffView diff={diff} onAccept={function(){onAccept(company,diff,meta);onClose();}} onReject={function(){setDiff(null);setMeta(null);}} T={T}/>)}</div></div>);
}

function CoRow({company,onSelect,onDelete,onUpdate,compact,visibleCols,selected,onToggleSelect,onQuickUpload,T}){
  var [editName,setEditName]=useState(false);var [nameVal,setNameVal]=useState(company.name);
  var [editTicker,setEditTicker]=useState(false);var [tickerVal,setTickerVal]=useState(company.ticker);
  var [editCountry,setEditCountry]=useState(false);var [editSector,setEditSector]=useState(false);
  var [hovered,setHovered]=useState(false);var [showMenu,setShowMenu]=useState(false);var menuRef=useRef();
  useEffect(function(){if(!showMenu)return;function h(e){if(menuRef.current&&!menuRef.current.contains(e.target))setShowMenu(false);}document.addEventListener("mousedown",h);return function(){document.removeEventListener("mousedown",h);};},[showMenu]);
  var missing=[];if(!company.country)missing.push("country");if(!company.sector)missing.push("sector");if(!company.tier)missing.push("tier");
  var tiers=getTiers(company.tier);
  var rowBg=selected?"#1e3a5f":T.dark?(hovered?T.bgTer:T.bgSec):(hovered?"#f8fafc":tierBg(company.tier));
  var rinp={fontSize:11,padding:"2px 4px",borderRadius:4,border:"1px solid "+T.borderSec,background:T.bg,color:T.text};
  var py=compact?2:5;
  var td={display:"table-cell",verticalAlign:"middle",paddingRight:compact?6:10,paddingTop:py,paddingBottom:py,whiteSpace:"nowrap",background:rowBg,cursor:"pointer",transition:"background 0.1s",fontSize:compact?11:14};
  var portfolios=company.portfolios||[];var portNote=(company.portNote||"").split(/[,\s]+/).filter(Boolean);
  var cs=company.country?countryStyle(company.country):null;var ss=company.sector?sectorStyle(company.sector):null;
  var availPortNote=PORTFOLIOS.filter(function(p){return portfolios.indexOf(p)<0;});
  var show=function(col){return visibleCols.has(col);};
  var hasTemplate=Object.keys(company.sections||{}).length>0;
  var rColor=reviewedColor(company.lastReviewed,T);var rBold=daysSince(company.lastReviewed)>60;
  var sCfg={"Own":{bg:"#dcfce7",color:"#166534"},"Focus":{bg:"#dbeafe",color:"#1e40af"},"Watch":{bg:"#fef9c3",color:"#854d0e"},"Sold":{bg:"#fee2e2",color:"#991b1b"}}[company.status]||{bg:T.bgTer,color:T.textSec};
  var val=company.valuation||{};var normEPS=calcNormEPS(val)||parseFloat(val.eps);var tp=calcTP(val.pe,normEPS);var mos=calcMOS(tp,val.price);var mosStyle=mosBg(mos);
  return(<div onClick={function(){onSelect(company);}} onMouseEnter={function(){setHovered(true);}} onMouseLeave={function(){setHovered(false);}} style={{display:"table-row"}}>
    <div style={{...td,paddingRight:6,cursor:"default"}} onClick={function(e){e.stopPropagation();onToggleSelect(company.id);}}><input type="checkbox" checked={selected} onChange={function(){}} style={{cursor:"pointer"}}/></div>
    {show("Tier(s)")&&<div style={{...td,whiteSpace:"normal"}}><PortPicker active={tiers} onChange={function(v){onUpdate(company.id,{tier:v.join(", ")});}} plusColor="#334155" opts={TIER_ORDER} pillStyleFn={tierPillStyle}/></div>}
    {show("Name")&&<div style={td}><div style={{display:"flex",alignItems:"center",gap:4}}>
      <span onClick={function(e){e.stopPropagation();onSelect(company);}} title="Open" style={{fontSize:11,color:T.textInfo,cursor:"pointer",padding:"1px 5px",borderRadius:3,border:"1px solid "+T.borderSec,background:T.bgSec,flexShrink:0}}>↗</span>
      {editName?<input value={nameVal} autoFocus onChange={function(e){setNameVal(e.target.value);}} onBlur={function(){if(nameVal.trim())onUpdate(company.id,{name:nameVal.trim()});setEditName(false);}} onKeyDown={function(e){if(e.key==="Enter"){if(nameVal.trim())onUpdate(company.id,{name:nameVal.trim()});setEditName(false);}if(e.key==="Escape")setEditName(false);}} onClick={function(e){e.stopPropagation();}} style={{...rinp,fontSize:compact?12:13,fontWeight:500,minWidth:100}}/>:<span onClick={function(e){e.stopPropagation();setEditName(true);setNameVal(company.name);}} title="Click to rename" style={{fontSize:compact?12:13,fontWeight:500,color:T.text,borderBottom:"1px dashed "+T.borderSec,cursor:"text"}}>{company.name}</span>}
      {hasTemplate&&<span title="Template loaded" style={{fontSize:8,color:T.textSuccess,flexShrink:0}}>●</span>}
      {mosStyle&&<span title="Margin of Safety" style={{fontSize:10,padding:"1px 6px",borderRadius:99,background:mosStyle.bg,color:mosStyle.color,fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>MOS {fmtMOS(mos)}</span>}
      {hovered&&<div style={{position:"relative",display:"inline-block"}} onClick={function(e){e.stopPropagation();}} ref={menuRef}>
        <span onClick={function(){setShowMenu(function(s){return !s;});}} style={{fontSize:10,color:T.textSec,cursor:"pointer",padding:"1px 4px",borderRadius:3,border:"1px solid "+T.border,marginLeft:2}}>⋯</span>
        {showMenu&&<div style={{position:"absolute",top:"calc(100% + 2px)",left:0,zIndex:200,background:T.bg,border:"1px solid "+T.border,borderRadius:6,padding:4,boxShadow:"0 4px 12px rgba(0,0,0,0.15)",minWidth:160}}>
          <div onClick={function(){setShowMenu(false);onQuickUpload(company);}} style={{fontSize:12,padding:"5px 10px",cursor:"pointer",borderRadius:4,color:T.text}} onMouseEnter={function(e){e.currentTarget.style.background=T.bgSec;}} onMouseLeave={function(e){e.currentTarget.style.background="transparent";}}>↑ Upload research</div>
          <div onClick={function(){var today=todayStr();onUpdate(company.id,{lastReviewed:today});setShowMenu(false);}} style={{fontSize:12,padding:"5px 10px",cursor:"pointer",borderRadius:4,color:T.textSuccess}} onMouseEnter={function(e){e.currentTarget.style.background=T.bgSec;}} onMouseLeave={function(e){e.currentTarget.style.background="transparent";}}>✓ Mark reviewed today</div>
        </div>}
      </div>}
    </div></div>}
    {show("Ticker")&&<div style={td}>{editTicker?<input value={tickerVal} autoFocus onChange={function(e){setTickerVal(e.target.value.toUpperCase());}} onBlur={function(){if(tickerVal.trim())onUpdate(company.id,{ticker:tickerVal.trim()});setEditTicker(false);}} onKeyDown={function(e){if(e.key==="Enter"){if(tickerVal.trim())onUpdate(company.id,{ticker:tickerVal.trim()});setEditTicker(false);}if(e.key==="Escape")setEditTicker(false);}} onClick={function(e){e.stopPropagation();}} style={{...rinp,width:60}}/>:<span onClick={function(e){e.stopPropagation();setEditTicker(true);setTickerVal(company.ticker);}} style={{fontSize:11,padding:"1px 5px",borderRadius:99,border:"1px solid "+T.border,background:T.bgSec,color:T.textSec,cursor:"text"}}>{company.ticker}</span>}</div>}
    {show("Country")&&<div style={td} onClick={function(e){e.stopPropagation();setEditCountry(true);}}>{editCountry?<select autoFocus value={company.country||""} onChange={function(e){onUpdate(company.id,{country:e.target.value});setEditCountry(false);}} onBlur={function(){setEditCountry(false);}} onClick={function(e){e.stopPropagation();}} style={{...rinp,fontSize:11}}><option value="">--</option>{COUNTRY_ORDER.map(function(c){return <option key={c}>{c}</option>;})}</select>:(cs?<span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:cs.bg,color:cs.color,fontWeight:500}}>{company.country}</span>:<span style={{fontSize:11,color:T.textDanger}}>--</span>)}</div>}
    {show("Sector")&&<div style={td} onClick={function(e){e.stopPropagation();setEditSector(true);}}>{editSector?<select autoFocus value={company.sector||""} onChange={function(e){onUpdate(company.id,{sector:e.target.value});setEditSector(false);}} onBlur={function(){setEditSector(false);}} onClick={function(e){e.stopPropagation();}} style={{...rinp,fontSize:11}}><option value="">--</option>{SECTOR_ORDER.map(function(s){return <option key={s}>{s}</option>;})}</select>:(ss?<span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:ss.bg,color:ss.color,fontWeight:500}}>{shortSector(company.sector)}</span>:<span style={{fontSize:11,color:T.textDanger}}>--</span>)}</div>}
    {show("Portfolio")&&<div style={{...td,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"nowrap"}}><PortPicker active={portfolios} onChange={function(v){onUpdate(company.id,{portfolios:v});}} pillBg="#1a5c2a" pillColor="#fff" plusColor="#1a5c2a"/><PortPicker active={portNote} onChange={function(v){onUpdate(company.id,{portNote:v.join(", ")});}} plusColor="#1a3a6b" opts={availPortNote} dashedPills pillStyleFn={function(){return{bg:"transparent",color:"#1a3a6b"};}}/></div></div>}
    {show("Action")&&<div style={td} onClick={function(e){e.stopPropagation();}}><ActionCell value={company.action||""} onUpdate={function(v){onUpdate(company.id,{action:v});}} T={T}/></div>}
    {show("Notes")&&<div style={{...td,maxWidth:170}}><NotesCell company={company} onUpdate={onUpdate} T={T}/></div>}
    {show("Reviewed")&&<div style={td} onClick={function(e){e.stopPropagation();}}><DatePicker value={company.lastReviewed||""} onChange={function(v){onUpdate(company.id,{lastReviewed:v});}} T={T}/></div>}
    {show("Updated")&&<div style={td}><span style={{fontSize:10,color:company.lastUpdated?T.textSuccess:T.border}}>{company.lastUpdated||"--"}</span></div>}
    {show("Status")&&<div style={td} onClick={function(e){e.stopPropagation();}}>
      {missing.length>0&&<span title={"Missing: "+missing.join(", ")} style={{fontSize:10,marginRight:4,color:T.textWarn}}>⚠</span>}
      <select value={company.status||""} onChange={function(e){onUpdate(company.id,{status:e.target.value});}} style={{fontSize:11,padding:"2px 5px",borderRadius:99,border:"none",background:sCfg.bg,color:sCfg.color,cursor:"pointer",fontWeight:500,appearance:"none",WebkitAppearance:"none"}}><option value="">--</option><option>Own</option><option>Focus</option><option>Watch</option><option>Sold</option></select>
    </div>}
    {show("Flag")&&<div style={{...td}} onClick={function(e){e.stopPropagation();}}><FlagCell value={company.flag||""} onUpdate={function(v){onUpdate(company.id,{flag:v});}} T={T}/></div>} {show("Del")&&<div style={{...td,paddingRight:0}}><span onClick={function(e){e.stopPropagation();onDelete(company.id);}} style={{fontSize:11,color:T.textDanger,cursor:"pointer"}}>Del</span></div>}
  </div>);
}

export default function App(){
  const [dark,setDark]=useState(function(){try{return localStorage.getItem("rh_dark")==="1";}catch(e){return false;}}); const [currentUser,setCurrentUser]=useState(function(){try{return localStorage.getItem("rh_user")||"";}catch(e){return "";}}); const [showUserPicker,setShowUserPicker]=useState(false); useEffect(function(){try{localStorage.setItem("rh_dark",dark?"1":"0");}catch(e){};},[dark]); useEffect(function(){try{if(currentUser)localStorage.setItem("rh_user",currentUser);}catch(e){};},[currentUser]);
  const T=mkTheme(dark);
  const INP={fontSize:13,padding:"6px 8px",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text};
  const CARD={background:T.bgSec,borderRadius:8,border:"1px solid "+T.border,padding:"12px 14px",marginBottom:8};
  const LNK={fontSize:12,color:T.textSec,cursor:"pointer"};
  function PILL(x){return Object.assign({fontSize:11,padding:"2px 7px",borderRadius:99,border:"1px solid "+T.border,color:T.textSec,background:T.bgTer},x||{});}
  function TABST(a){return{padding:"8px 14px",border:"1px solid",borderColor:a?T.borderSec:T.border,borderRadius:6,background:a?T.bgSec:"transparent",cursor:"pointer",fontSize:13,fontWeight:a?500:400,color:T.text};}
  function TABSM(a){return{padding:"5px 10px",border:"1px solid",borderColor:a?T.borderSec:T.border,borderRadius:6,background:a?T.bgSec:"transparent",cursor:"pointer",fontSize:12,fontWeight:a?500:400,color:T.text,whiteSpace:"nowrap"};}
  function TAGBTN(a){return{fontSize:11,padding:"2px 7px",borderRadius:99,border:"1px solid "+(a?T.borderSec:T.border),color:T.text,background:T.bgSec,cursor:"pointer",fontWeight:a?500:400};}
  function TA(h){return{width:"100%",minHeight:h||90,resize:"vertical",fontSize:13,padding:"8px 10px",boxSizing:"border-box",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text,fontFamily:"inherit",lineHeight:1.6};}

  const [tab,setTab]=useState("companies");
  const [companies,setCompanies]=useState([]);
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
  const [priceImportText,setPriceImportText]=useState(""); const [lastPriceUpdate,setLastPriceUpdate]=useState(null);
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
  const [saved,setSaved]=useState([]);
  const [ready,setReady]=useState(false);
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
  const [copied,setCopied]=useState(null);
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
  const [loadStatus,setLoadStatus]=useState({companies:null,library:null});
  const [showDataPanel,setShowDataPanel]=useState(false);
  const [importText,setImportText]=useState("");
  const [importError,setImportError]=useState("");
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
  const [pendingVal,setPendingVal]=useState(null); const [entryComments,setEntryComments]=useState({}); const [newCommentText,setNewCommentText]=useState({});
  const searchRef=useRef();

  function handleSortClick(colSort){
    if(coSort===colSort){setCoSortDir(function(d){return d==="asc"?"desc":"asc";});}
    else{setCoSort(colSort);setCoSortDir(colSort==="Last Reviewed"?"desc":"asc");}
  }

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

  async function loadFromStorage(){
    setLoadStatus({companies:null,library:null});var coOk=false,libOk=false;
    try{var r=await window.storage.get("library");if(r&&r.value){var d=JSON.parse(r.value);if(Array.isArray(d)&&d.length){setSaved(d);libOk=d.length;}}}catch(e){}
    try{var r2=await window.storage.get("companies");if(r2&&r2.value){var d2=JSON.parse(r2.value);if(Array.isArray(d2)&&d2.length){setCompanies(d2);coOk=d2.length;}}}catch(e){}
    try{var r3=await window.storage.get("lastPriceUpdate");if(r3&&r3.value)setLastPriceUpdate(r3.value);}catch(e){} try{var r4=await window.storage.get("entryComments");if(r4&&r4.value)setEntryComments(JSON.parse(r4.value));}catch(e){} setLoadStatus({companies:coOk,library:libOk});setReady(true);return coOk||libOk;
  }
  useEffect(function(){
    var done=false,attempts=0;
    var iv=setInterval(async function(){if(done){clearInterval(iv);return;}attempts++;var got=await loadFromStorage();if(got){done=true;clearInterval(iv);}else if(attempts>60){clearInterval(iv);setLoadStatus({companies:0,library:0});setReady(true);}},500);
    return function(){done=true;clearInterval(iv);};
  },[]);
  useEffect(function(){if(ready)window.storage.set("library",JSON.stringify(saved)).catch(function(){});},[saved,ready]);
  useEffect(function(){if(ready)window.storage.set("companies",JSON.stringify(companies)).catch(function(){});},[companies,ready]); useEffect(function(){if(ready&&lastPriceUpdate)window.storage.set("lastPriceUpdate",lastPriceUpdate).catch(function(){});},[lastPriceUpdate,ready]); useEffect(function(){if(ready)window.storage.set("entryComments",JSON.stringify(entryComments)).catch(function(){});},[entryComments,ready]);
  useEffect(function(){if(!output||!companies.length)return;setAutoTagSuggestions(detectCompanyTags(output,companies));},[output]);

  function addComment(entryId,text){   if(!text.trim())return;   var comment={id:Date.now(),text:text.trim(),author:currentUser||"Unknown",date:todayStr()};   setEntryComments(function(prev){return Object.assign({},prev,{[entryId]:([comment].concat(prev[entryId]||[]))});});   setNewCommentText(function(prev){return Object.assign({},prev,{[entryId]:""});}); } function deleteComment(entryId,commentId){   setEntryComments(function(prev){return Object.assign({},prev,{[entryId]:(prev[entryId]||[]).filter(function(c){return c.id!==commentId;})});}); }  function exportToPDF(title,htmlContent){   var win=window.open("","_blank");   if(!win){alert("Please allow popups to export PDF.");return;}   win.document.write("<!DOCTYPE html><html><head><title>"+title+"</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 40px;color:#111;line-height:1.7;}h1{font-size:22px;border-bottom:2px solid #334155;padding-bottom:10px;margin-bottom:20px;}h2{font-size:16px;color:#1e40af;margin-top:28px;margin-bottom:8px;}p{font-size:14px;}.meta{font-size:12px;color:#6b7280;margin-bottom:20px;}</style></head><body>"+htmlContent+"</body></html>");   win.document.close();   setTimeout(function(){win.print();},500); } function exportCompanyPDF(co){   var html="<h1>"+co.name+(co.ticker?" ("+co.ticker+")":"")+"</h1><div class='meta'>";   if(co.sector)html+="Sector: "+co.sector+" | ";   if(co.country)html+="Country: "+co.country+" | ";   if(co.status)html+="Status: "+co.status;   html+="</div>";   var v=co.valuation||{};var ne=calcNormEPS(v)||parseFloat(v.eps);var tp=calcTP(v.pe,ne);var mos=calcMOS(tp,v.price);var cur=(v.currency)||getCurrency(co.country);   if(tp!==null||v.price){html+="<h2>Valuation</h2><p>";if(v.price)html+="Price: "+cur+" "+v.price+" &nbsp;";if(tp!==null)html+="TP: "+fmtTP(tp,cur)+" &nbsp;";if(mos!==null)html+="MOS: "+fmtMOS(mos);html+="</p>";}   TEMPLATE_SECTIONS.forEach(function(s){var c=co.sections&&co.sections[s];if(c&&c.trim()){html+="<h2>"+s+"</h2><p>"+c.replace(/\n/g,"<br/>")+"</p>";}});   if(co.earningsEntries&&co.earningsEntries.length){html+="<h2>Earnings History</h2>";co.earningsEntries.forEach(function(e){html+="<p><strong>"+e.quarter+"</strong> "+e.reportDate+"<br/>"+(e.shortTakeaway||"")+"</p>";});}   exportToPDF(co.name,html); } function exportEntryPDF(entry){   var html="<h1>"+entry.title+"</h1><div class='meta'>Format: "+entry.format+" | Date: "+entry.date+(entry.savedBy?" | Saved by: "+entry.savedBy:"")+"</div><div>"+toHTML(entry.result)+"</div>";   exportToPDF(entry.title,html); }
  function cp(text,key){try{var el=document.createElement("textarea");el.value=text;el.style.position="fixed";el.style.opacity="0";document.body.appendChild(el);el.focus();el.select();document.execCommand("copy");document.body.removeChild(el);setCopied(key);setTimeout(function(){setCopied(null);},1500);}catch(e){}}
  function exportAll(){var txt=JSON.stringify({companies,library:saved,exportedAt:new Date().toISOString()},null,2);try{var el=document.createElement("textarea");el.value=txt;el.style.position="fixed";el.style.opacity="0";document.body.appendChild(el);el.focus();el.select();document.execCommand("copy");document.body.removeChild(el);setCopied("exportall");setTimeout(function(){setCopied(null);},2000);}catch(e){setImportText(txt);setShowDataPanel(true);}}   function exportCSV(){
    var rows=[["Name","Ticker","Tier","Status","Country","Sector","Portfolios","Action","Notes","Last Reviewed","Last Updated","Price","TP","MOS%","P/E","FY1","EPS1","FY2","EPS2","W1%","W2%","Norm EPS"]];
    displayedCos.forEach(function(c){var v=c.valuation||{};var ne=calcNormEPS(v)||parseFloat(v.eps);var tp=calcTP(v.pe,ne);var mos=calcMOS(tp,v.price);rows.push([c.name,c.ticker||"",getTiers(c.tier).join("; "),c.status||"",c.country||"",c.sector||"",(c.portfolios||[]).join("; "),c.action||"",c.takeaway||"",c.lastReviewed||"",c.lastUpdated||"",v.price||"",tp!==null?tp:"",mos!==null?mos+"":"",v.pe||"",v.fy1||"",v.eps1||"",v.fy2||"",v.eps2||"",v.w1||"",v.w2||"",ne||""]);});
    var csv=rows.map(function(r){return r.map(function(v){return'"'+String(v).replace(/"/g,'""')+'"';}).join(",");}).join("\n");
    var blob=new Blob([csv],{type:"text/csv"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="companies_export.csv";a.click();
  }
  function importAll(){
    setImportError("");
    try{var d=JSON.parse(importText);var cos=d.companies||(Array.isArray(d)?d:null),lib=d.library||null;if(!cos&&!lib){setImportError("No data found.");return;}if(cos&&Array.isArray(cos)){setCompanies(cos);window.storage.set("companies",JSON.stringify(cos)).catch(function(){});}if(lib&&Array.isArray(lib)){setSaved(lib);window.storage.set("library",JSON.stringify(lib)).catch(function(){});}setImportText("");setShowDataPanel(false);}
    catch(e){setImportError("Invalid JSON: "+e.message);}
  }
  function applyPriceImport(){
    if(!priceImportText.trim())return;var lines=priceImportText.trim().split(/\r?\n/).filter(function(l){return l.trim();});var map={};
    lines.forEach(function(line){var delim=line.indexOf("\t")>=0?"\t":",";var parts=line.split(delim).map(function(s){return s.trim().replace(/^"|"$/g,"");});if(parts.length>=2){var ticker=parts[0].toUpperCase();var price=parseFloat(parts[1]);if(ticker&&!isNaN(price))map[ticker]=price;}});
    var count=0;
    setCompanies(function(prev){return prev.map(function(c){var t=(c.ticker||"").toUpperCase();if(map[t]!==undefined){count++;return Object.assign({},c,{valuation:Object.assign({},c.valuation||{},{price:map[t]})});}return c;});});
    setPriceImportText("");setShowPriceImport(false);setLastPriceUpdate(todayStr());setTimeout(function(){alert("Updated prices for "+count+" companies.");},100);
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
  function updateCo(id,ch){setCompanies(function(cs){return cs.map(function(c){return c.id===id?Object.assign({},c,ch):c;});});}
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

  var flaggedCos=companies.filter(function(c){return c.flag;}).sort(function(a,b){return(a.flag==="Urgent"?0:1)-(b.flag==="Urgent"?0:1);}); var usedCountries=Array.from(new Set(companies.map(function(c){return c.country;}).filter(Boolean))).sort();
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
      var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:4000,system:"You are a JSON extractor. Extract the following sections from the provided company research template and return ONLY a valid JSON object with exactly these keys: "+allKeys+". If a section is not found, use an empty string. Return nothing else — no markdown, no backticks, no explanation.",messages:[{role:"user",content:[{type:"text",text:tmplRaw.slice(0,20000)}]}]})});
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
    setPendingDiff(null);setPendingMeta(null);setUpText("");setCoView("template");
  }
  function synPrompt(fmt,tn,cust){var fi={"Key Takeaways":"4-6 numbered takeaways.","Executive Summary":"3 paragraphs: situation, findings, implications.","Bullet Points":"Grouped bullets under 2-4 theme headers.","Q&A":"4-5 key questions with concise answers.","Timeline":"Findings chronologically.","Conflict Detector":"Find DISAGREEMENTS between sources.","Custom":cust||"Summarize."};return "Research synthesis assistant.\nFormat: "+fmt+"\nTone: "+tn+"\nInstructions: "+(fi[fmt]||"Summarize.")+"\n- Start with: **Core finding:** [one sentence]\n- Include **Confidence:** High/Medium/Low\n- End with **Gaps & next steps:** 2-3 unknowns\n- Be concise.";}
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
  var HEADER_COLS=[{label:"Tier(s)",sort:"Tier"},{label:"Name",sort:"Name"},{label:"Ticker",sort:null},{label:"Country",sort:"Country"},{label:"Sector",sort:"Sector"},{label:"Portfolio",sort:null},{label:"Action",sort:null},{label:"Notes",sort:null},{label:"Reviewed",sort:"Last Reviewed"},{label:"Updated",sort:null},{label:"Status",sort:null},{label:"MOS",sort:"MOS"},{label:"",sort:null}];
  var coTabs=[{id:"template",label:"Template"},...TEMPLATE_SECTIONS.map(function(s){return{id:"section:"+s,label:s};}),{id:"earnings",label:"Earnings & Thesis Check"},
    {id:"linked",label:"Linked"+(linkedEntries.length>0?" ("+linkedEntries.length+")":"")},{id:"upload",label:"Upload"},{id:"history",label:"Log"+((selCo&&selCo.updateLog&&selCo.updateLog.length>0)?" ("+selCo.updateLog.length+")":"")}];

  return(
    <div style={{padding:"1rem",boxSizing:"border-box",fontFamily:"system-ui,sans-serif",fontSize:14,color:T.text,background:T.bg,minHeight:"100vh"}}>       {(!currentUser||showUserPicker)&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:T.bg,border:"1px solid "+T.border,borderRadius:12,padding:28,width:320,boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}><div style={{fontSize:16,fontWeight:600,color:T.text,marginBottom:6}}>Who are you?</div><div style={{fontSize:13,color:T.textSec,marginBottom:16}}>Select your name so edits are tracked correctly.</div><div style={{display:"flex",flexDirection:"column",gap:8}}>{TEAM_MEMBERS.map(function(name){return(<button key={name} onClick={function(){setCurrentUser(name);setShowUserPicker(false);}} style={{padding:"10px 16px",fontSize:14,fontWeight:currentUser===name?600:400,background:currentUser===name?"#dbeafe":T.bgSec,color:currentUser===name?"#1e40af":T.text,border:"1px solid "+(currentUser===name?"#93c5fd":T.border),borderRadius:8,cursor:"pointer",textAlign:"left"}}>{name}</button>);})}</div>{currentUser&&<div style={{marginTop:12,fontSize:12,color:T.textSec,textAlign:"right",cursor:"pointer"}} onClick={function(){setShowUserPicker(false);}}>Cancel</div>}</div></div>)}
      {showShortcuts&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={function(){setShowShortcuts(false);}}><div onClick={function(e){e.stopPropagation();}} style={{background:T.bg,border:"1px solid "+T.border,borderRadius:12,padding:"20px 24px",minWidth:320,boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}><div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:14}}>Keyboard Shortcuts</div>{SHORTCUTS.map(function(s){return(<div key={s.key} style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}><span style={{fontSize:12,padding:"2px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bgSec,fontFamily:"monospace",color:T.text,minWidth:28,textAlign:"center"}}>{s.key}</span><span style={{fontSize:13,color:T.textSec}}>{s.desc}</span></div>);})}<div style={{marginTop:14,fontSize:12,color:T.textSec,textAlign:"right",cursor:"pointer"}} onClick={function(){setShowShortcuts(false);}}>Close (Esc)</div></div></div>)}
      {showTmplSearch&&<TemplateSearch companies={companies.filter(function(c){return Object.keys(c.sections||{}).length>0;})} onSelect={function(c,q){setSelCo(c);setTab("companies");setCoView("template");setTmplHighlight(q);setTmplSearch(q);}} onClose={function(){setShowTmplSearch(false);}} T={T}/>} {showGlobalSearch&&<GlobalSearch companies={companies} saved={saved} onSelectCompany={function(c){setSelCo(c);setTab("companies");setCoView("template");}} onSelectEntry={function(s){setTab("library");setExpanded(s.id);}} onClose={function(){setShowGlobalSearch(false);}} T={T}/>}
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
      {flaggedCos.length>0&&(<div style={{marginBottom:8,padding:"8px 14px",background:"#fff5f5",border:"1px solid #fca5a5",borderRadius:8,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:600,color:"#991b1b"}}>⚑ Flagged ({flaggedCos.length}):</span>{flaggedCos.map(function(c){var fs=FLAG_STYLES[c.flag];return(<span key={c.id} onClick={function(){setSelCo(c);setTab("companies");}} style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:fs.bg,color:fs.color,cursor:"pointer",border:"1px solid "+fs.color}}>{fs.icon} {c.name}</span>);})}</div>)} {showDataPanel&&(<div style={{...CARD,marginBottom:12}}><div style={{fontSize:13,fontWeight:500,marginBottom:8,color:T.text}}>Data backup &amp; restore</div><div style={{display:"flex",gap:8,marginBottom:12}}><button onClick={exportAll} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>{copied==="exportall"?"✓ Copied!":"⬆ Copy full backup"}</button></div><textarea value={importText} onChange={function(e){setImportText(e.target.value);setImportError("");}} placeholder='Paste backup JSON here to restore...' style={{...TA(80),fontFamily:"monospace",marginBottom:6}}/>{importError&&<div style={{fontSize:12,color:T.textDanger,marginBottom:6}}>{importError}</div>}<div style={{display:"flex",gap:8}}><button onClick={importAll} disabled={!importText.trim()} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>⬇ Restore</button><span onClick={function(){setShowDataPanel(false);}} style={LNK}>Cancel</span></div></div>)}
      <div style={{borderTop:"1px solid "+T.border,marginBottom:10}}/>
      <div style={{display:"flex",gap:6,marginBottom:"1rem",flexWrap:"wrap"}}>
        {[["companies","Companies"],["dashboard","Dashboard"],["synthesize","Synthesize"],["library","Library ("+saved.length+")"],["recall","Recall"],["compare","Compare"],["macro","Macro Master"],["calendar","Earnings Calendar"]].map(function(item){return <button key={item[0]} style={TABST(tab===item[0])} onClick={function(){setTab(item[0]);if(item[0]!=="companies")setSelCo(null);}}>{item[1]}</button>;})}
      </div>

      {tab==="calendar"&&(<div>   <div style={{fontSize:14,fontWeight:500,color:T.text,marginBottom:12}}>Upcoming Earnings — Next 30 Days</div>   <EarningsCalendar companies={companies} T={T}/> </div>)}  {tab==="dashboard"&&(<div>
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",borderBottom:"1px solid "+T.border,paddingBottom:10}}>
          {[["overview","Overview"],["sectors","Sector Breakdown"],["countries","Country Breakdown"],["overlap","Portfolio Overlap"],["quality","Data Quality"]].map(function(item){return <button key={item[0]} style={TABST(dashSubTab===item[0])} onClick={function(){setDashSubTab(item[0]);}}>{item[1]}</button>;})}
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
          {confirmClear?(<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:12,color:T.textDanger}}>Delete all {companies.length}?</span><button onClick={async function(){setCompanies([]);try{await window.storage.set("companies","[]");}catch(e){}setConfirmClear(false);}} style={{fontSize:12,padding:"4px 10px",color:T.textDanger}}>Yes</button><span onClick={function(){setConfirmClear(false);}} style={LNK}>Cancel</span></div>):<button onClick={function(){setConfirmClear(true);}} style={{fontSize:12,padding:"6px 10px",color:T.textDanger}}>Clear all</button>}
          <button onClick={exportCSV} style={{fontSize:12,padding:"6px 10px"}}>⬇ CSV</button>
          <button onClick={function(){cp(JSON.stringify(companies,null,2),"backup");}} style={{fontSize:12,padding:"6px 10px"}}>{copied==="backup"?"✓ Copied!":"Copy backup"}</button>
          <button onClick={function(){setShowRestore(function(s){return !s;});}} style={{fontSize:12,padding:"6px 10px"}}>Restore</button>
          <button onClick={findDupes} style={{fontSize:12,padding:"6px 10px"}}>Dedupe</button>
          <button onClick={function(){setShowPriceImport(function(s){return !s;});setShowBulk(false);setShowNew(false);}} style={{fontSize:12,padding:"6px 10px"}}>$ Prices</button>
          <button onClick={function(){setShowBulk(function(s){return !s;});setShowNew(false);setShowPriceImport(false);}} style={{fontSize:12,padding:"6px 10px"}}>Bulk import</button>
          <button onClick={function(){setShowNew(function(s){return !s;});setShowBulk(false);setShowPriceImport(false);}} style={{fontSize:12,padding:"6px 10px"}}>+ New</button>
        </div>
        {showPriceImport&&(<div style={{...CARD,marginBottom:10}}><div style={{fontSize:13,fontWeight:500,marginBottom:4,color:T.text}}>Bulk price update</div><div style={{fontSize:12,color:T.textSec,marginBottom:8}}>Paste two columns: Ticker and Price.</div><textarea value={priceImportText} onChange={function(e){setPriceImportText(e.target.value);}} placeholder={"AAPL\t182.50\n..."} style={{...TA(100),fontFamily:"monospace",marginBottom:8}}/><div style={{display:"flex",gap:8}}><button onClick={applyPriceImport} disabled={!priceImportText.trim()} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Apply</button><span onClick={function(){setShowPriceImport(false);setPriceImportText("");}} style={LNK}>Cancel</span></div></div>)}
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
            {displayedCos.map(function(c,i){return <CoRow key={c.id+"-"+i} company={c} compact={compact} visibleCols={visibleCols} selected={selectedIds.has(c.id)} onToggleSelect={toggleSelect} T={T} onSelect={function(co){setSelCo(co);setCoView("template");setTmplHighlight("");setFlashSections({});}} onDelete={function(id){setCompanies(function(cs){return cs.filter(function(c){return c.id!==id;});});}} onUpdate={updateCo} onQuickUpload={function(c){setQuickUploadCo(c);}}/>;  })}
          </div></div>
        )}
      </div>)}

      {tab==="companies"&&selCo&&(function(){
        var currency=getCurrency(selCo.country);var pv=pendingVal||selCo.valuation||{};var activeCurrency=pv.currency||currency;
        var normEPS=calcNormEPS(pv);var eps=normEPS!==null?normEPS:parseFloat(pv.eps);
        var tp=calcTP(pv.pe,eps);var mos=calcMOS(tp,pv.price);var mosStyle=mosBg(mos);
        var hist=selCo.tpHistory||{};var portfolios=selCo.portfolios||{};var portWeights=selCo.portWeights||{};
        var earningsEntries=selCo.earningsEntries||[];
        return(<div>
          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <button onClick={function(){setSelCo(null);setPendingVal(null);}} style={{fontSize:13,padding:"4px 10px"}}>← Back</button>
            <span style={{fontSize:15,fontWeight:500,color:T.text}}>{selCo.name}</span>
            <span style={PILL()}>{selCo.ticker}</span>
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
                      setCoView("template");
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
            var sectionName=coView.replace("section:","");var isValuation=sectionName==="Valuation";
            return(<div>
              {isValuation&&(<div style={{marginBottom:24}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>Target Price</div>
                  {selCo.sections&&selCo.sections["Valuation"]&&(!pv.pe||!pv.eps1)&&(
                    <button onClick={async function(){
                      try{var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,system:"Extract valuation data. Return ONLY valid JSON with keys: pe (number), eps1 (number), eps2 (number), fy1 (string), fy2 (string), fyMonth (string like Dec). If not found use null. No markdown.",messages:[{role:"user",content:[{type:"text",text:selCo.sections["Valuation"]}]}]})});var data=await res.json();if(data.error){alert("Error");return;}var raw=(data.content||[]).map(function(b){return b.text||"";}).join("").replace(/```json|```/g,"").trim();var parsed=JSON.parse(raw);var patch={};if(parsed.pe!=null)patch.pe=String(parsed.pe);if(parsed.eps1!=null)patch.eps1=String(parsed.eps1);if(parsed.eps2!=null)patch.eps2=String(parsed.eps2);if(parsed.fy1)patch.fy1=parsed.fy1;if(parsed.fy2)patch.fy2=parsed.fy2;if(parsed.fyMonth)patch.fyMonth=parsed.fyMonth;if(!pv.w1)patch.w1="50";if(!pv.w2)patch.w2="50";setPendingVal(function(prev){return Object.assign({},prev,patch);});}catch(e){alert("Failed: "+e.message);}
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
                    {mos!==null&&pv.price&&<div style={{fontSize:11,color:mosStyle?mosStyle.color:T.textSec,marginTop:2}}>Price: {activeCurrency} {pv.price}</div>}
                  </div>
                </div>

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

      {tab==="compare"&&(<div>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}><button onClick={function(){setCmpIds(saved.filter(function(s){return filterTag==="All"||(s.tags||[]).indexOf(filterTag)>=0;}).slice(0,3).map(function(s){return s.id;}));}} style={{fontSize:12,padding:"5px 10px"}}>Auto-select by tag</button><select value={filterTag} onChange={function(e){setFilterTag(e.target.value);}} style={INP}>{allTags.map(function(t){return <option key={t}>{t}</option>;})}</select></div>
        {saved.length<2?<p style={{fontSize:13,color:T.textSec}}>Save at least 2 entries to compare.</p>:(<><div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>{saved.map(function(s){var sel=cmpIds.indexOf(s.id)>=0;return(<div key={s.id} onClick={function(){setCmpIds(function(p){return sel?p.filter(function(x){return x!==s.id;}):p.length<3?p.concat([s.id]):p;});}} style={{padding:"9px 12px",borderRadius:6,border:"1px solid "+(sel?T.borderSec:T.border),background:sel?T.bgSec:T.bg,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}><div style={{width:14,height:14,borderRadius:3,border:"1px solid "+(sel?T.borderSec:T.border),background:sel?"#dbeafe":"transparent",flexShrink:0}}/><span style={{fontSize:13,fontWeight:sel?500:400,flex:1,color:T.text}}>{s.title}</span><span style={PILL()}>{s.format}</span><span style={PILL()}>{s.date}</span></div>);})}</div><button onClick={doCompare} disabled={cmpIds.length<2||cmpLoading} style={{width:"100%",padding:10,fontWeight:500}}>{cmpLoading?"Comparing...":"Compare "+cmpIds.length+" entr"+(cmpIds.length===1?"y":"ies")}</button>{cmpOut&&<div style={{...CARD,marginTop:"1.5rem",fontSize:14,lineHeight:1.75,color:T.text}} dangerouslySetInnerHTML={{__html:toHTML(cmpOut)}}/>}</>)}
      </div>)}

      {tab==="macro"&&(<div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}><span style={{fontSize:13,color:T.textSec}}>{macroEntries.length} Macro entries</span><button onClick={buildMacro} disabled={macroLoading||!macroEntries.length} style={{padding:"7px 14px",fontWeight:500}}>{macroLoading?"Building...":"Build master"}</button></div>
        {!macroEntries.length?<p style={{fontSize:14,color:T.textSec}}>Tag entries with "Macro" to include them here.</p>:(<div style={{marginBottom:12}}><div style={{fontSize:12,color:T.textSec,marginBottom:6}}>Entries included</div><div style={{display:"flex",flexDirection:"column",gap:4}}>{macroEntries.map(function(s){return <div key={s.id} style={{fontSize:13,padding:"6px 10px",...CARD,marginBottom:0,display:"flex",gap:8,alignItems:"center",color:T.text}}><span style={{flex:1}}>{s.title}</span><span style={PILL()}>{s.date}</span></div>;})}</div></div>)}
        {macroOut&&(<div style={{marginTop:"1rem"}}><div style={{...CARD,fontSize:14,lineHeight:1.8,color:T.text}} dangerouslySetInnerHTML={{__html:toHTML(macroOut)}}/><div style={{marginTop:10,display:"flex",gap:10}}><span onClick={function(){cp(macroOut,"macro");}} style={LNK}>{copied==="macro"?"✓ Copied!":"Copy"}</span><span onClick={function(){downloadMD("macro_master",macroOut);}} style={LNK}>⬇ .md</span><span onClick={function(){setSaved(function(p){return [{id:Date.now(),title:"Macro Master - "+todayStr(),format:"Executive Summary",tone:"Professional",result:macroOut,tags:["Macro"],date:todayStr(),ts:Date.now(),pinned:true,note:""}].concat(p);});}} style={LNK}>Save to library</span></div></div>)}
      </div>)}
    </div>
  );
}
