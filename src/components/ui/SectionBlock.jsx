import { useState, useRef, useEffect } from "react";
import { toHTML } from '../../utils/index.js';

function SectionBlock({title,content,highlight,flashKey,T}){
  var [open,setOpen]=useState(true);var [flash,setFlash]=useState(false);var prevKey=useRef(null);
  useEffect(function(){if(flashKey&&flashKey!==prevKey.current){prevKey.current=flashKey;setFlash(true);setTimeout(function(){setFlash(false);},2000);}},[flashKey]);
  var html=toHTML(content||"--");
  if(highlight){var esc=highlight.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");html=html.replace(new RegExp("("+esc+")","gi"),"<mark style='background:#fef08a;color:#111'>$1</mark>");}
  return(<div style={{marginBottom:8,border:"1px solid "+(flash?"#f59e0b":T.border),borderRadius:6,overflow:"hidden",transition:"border-color 0.5s"}}><div onClick={function(){setOpen(function(o){return !o;});}} style={{padding:"7px 12px",background:flash?"#fef9c3":T.bgSec,cursor:"pointer",display:"flex",justifyContent:"space-between",transition:"background 0.5s"}}><span style={{fontSize:13,fontWeight:500,color:T.text}}>{title}</span><span style={{fontSize:12,color:T.textSec}}>{open?"▲":"▼"}</span></div>{open&&<div style={{padding:"10px 12px",fontSize:13,lineHeight:1.8,color:T.text,whiteSpace:"pre-wrap",background:T.bg}} dangerouslySetInnerHTML={{__html:html}}/>}</div>);
}

export default SectionBlock;
