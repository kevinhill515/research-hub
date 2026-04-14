import { useState, useRef, useEffect } from "react";
import { PORTFOLIOS, TIER_ORDER, COUNTRY_ORDER, SECTOR_ORDER } from '../../constants/index.js';
import { shortSector, sectorStyle, countryStyle, getTiers, tierPillStyle, tierBg, reviewedColor, daysSince, todayStr, calcNormEPS, calcTP, calcMOS, fmtMOS, mosBg } from '../../utils/index.js';
import StatusPill from '../ui/StatusPill.jsx';
import NotesCell from '../forms/NotesCell.jsx';
import ActionCell from '../forms/ActionCell.jsx';
import FlagCell from '../forms/FlagCell.jsx';
import DatePicker from '../forms/DatePicker.jsx';
import PortPicker from '../ui/PortPicker.jsx';
import PillEl from '../ui/PillEl.jsx';

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
    {show("Portfolio")&&<div style={{...td,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"nowrap"}}><PortPicker active={portfolios} onChange={function(v){onUpdate(company.id,{portfolios:v});}} pillBg="#166534" pillColor="#fff" plusColor="#4ade80"/><PortPicker active={portNote} onChange={function(v){onUpdate(company.id,{portNote:v.join(", ")});}} plusColor={T.dark?"#93c5fd":"#1a3a6b"} opts={availPortNote} dashedPills pillStyleFn={function(){return{bg:"transparent",color:T.dark?"#93c5fd":"#1a3a6b"};}}/></div></div>}
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

export default CoRow;
