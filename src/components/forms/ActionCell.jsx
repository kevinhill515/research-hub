import { useState, useRef, useEffect } from "react";
import { ACTIONS } from '../../constants/index.js';

function ActionCell({value,onUpdate,T}){
  var [open,setOpen]=useState(false);var ref=useRef();
  useEffect(function(){if(!open)return;function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}document.addEventListener("mousedown",h);return function(){document.removeEventListener("mousedown",h);};},[open]);
  var aColor=value==="Increase TP"?"#166534":value==="Decrease TP"?"#dc2626":"#6b7280";
  var aBg=value==="Increase TP"?"#dcfce7":value==="Decrease TP"?"#fee2e2":value?"#f1f5f9":"transparent";
  return(<div style={{position:"relative"}} ref={ref} onClick={function(e){e.stopPropagation();}}><div onClick={function(){setOpen(function(o){return !o;});}} style={{cursor:"pointer",minWidth:24}}>{value?<span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:aBg,color:aColor}}>{value}</span>:<span style={{fontSize:11,color:"#94a3b8",borderBottom:"1px dashed #e2e8f0"}}>--</span>}</div>{open&&(<div style={{position:"absolute",top:"calc(100% + 2px)",left:0,zIndex:200,background:"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:4,boxShadow:"0 4px 12px rgba(0,0,0,0.15)",minWidth:130}}><div onClick={function(){onUpdate("");setOpen(false);}} style={{fontSize:12,padding:"5px 10px",cursor:"pointer",borderRadius:4,color:"#6b7280"}} onMouseEnter={function(e){e.currentTarget.style.background="#f1f5f9";}} onMouseLeave={function(e){e.currentTarget.style.background="";}}>-- None</div>{ACTIONS.map(function(a){var ac=a==="Increase TP"?"#166534":a==="Decrease TP"?"#dc2626":"#6b7280";return(<div key={a} onClick={function(){onUpdate(a);setOpen(false);}} style={{fontSize:12,padding:"5px 10px",cursor:"pointer",borderRadius:4,color:ac,fontWeight:500}} onMouseEnter={function(e){e.currentTarget.style.background="#f1f5f9";}} onMouseLeave={function(e){e.currentTarget.style.background="";}}>{a}</div>);})}</div>)}</div>);
}

export default ActionCell;
