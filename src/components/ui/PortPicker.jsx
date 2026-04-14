import { useState } from "react";
import { PORTFOLIOS } from '../../constants/index.js';
import PillEl from './PillEl.jsx';

function PortPicker({active,onChange,pillBg,pillColor,plusColor,opts,pillStyleFn,dashedPills}){
  var [open,setOpen]=useState(false);var al=active||[],allOpts=opts||PORTFOLIOS,avail=allOpts.filter(function(p){return al.indexOf(p)<0;});
  function gs(p){return pillStyleFn?pillStyleFn(p):{bg:pillBg,color:pillColor};}
  return(<div onClick={function(e){e.stopPropagation();}} style={{display:"flex",gap:3,alignItems:"center",flexWrap:"nowrap"}}>{al.map(function(p){var s=gs(p);return dashedPills?<span key={p} style={{fontSize:11,padding:"2px 7px",borderRadius:99,border:"1.5px dashed "+s.color,color:s.color,background:"transparent",display:"flex",alignItems:"center",gap:3,whiteSpace:"nowrap"}}>{p}<span onClick={function(){onChange(al.filter(function(x){return x!==p;}));}} style={{cursor:"pointer",opacity:0.7,fontSize:10}}>×</span></span>:<PillEl key={p} label={p} bg={s.bg} color={s.color} border="none" onRemove={function(){onChange(al.filter(function(x){return x!==p;}));}}/>;})}{avail.length>0&&(<div style={{position:"relative",display:"inline-block"}}><span onClick={function(){setOpen(function(o){return !o;});}} style={{fontSize:11,padding:"2px 8px",borderRadius:99,border:"1px dashed "+plusColor,color:plusColor,cursor:"pointer"}}>+</span>{open&&<div onClick={function(e){e.stopPropagation();}} style={{position:"absolute",top:"calc(100% + 2px)",left:0,zIndex:200,background:"#fff",border:"1px solid #ccc",borderRadius:6,padding:4,display:"flex",flexDirection:"column",gap:2,minWidth:80,boxShadow:"0 4px 12px rgba(0,0,0,0.15)"}}>{avail.map(function(p){return <span key={p} onClick={function(){onChange(al.concat([p]));setOpen(false);}} style={{fontSize:12,padding:"5px 10px",cursor:"pointer",borderRadius:4,color:"#111"}} onMouseEnter={function(e){e.target.style.background="#f0f0f0";}} onMouseLeave={function(e){e.target.style.background="";}}>{p}</span>;})}</div>}</div>)}</div>);
}

export default PortPicker;
