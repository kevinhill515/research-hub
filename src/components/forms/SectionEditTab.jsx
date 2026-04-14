import { useState, useEffect } from "react";
import { SECTION_SUBHEADINGS } from '../../constants/index.js';
import { toHTML } from '../../utils/index.js';

function SectionEditTab({title,content,onSave,T}){
  var TICKER_SECTION="Overview"; var bulletSections=new Set(["Thesis","Segments","Guidance / KPIs","Key Challenges"]);
  var useBullets=bulletSections.has(title);
  var isEmpty=!content||!content.trim();
  var [editing,setEditing]=useState(isEmpty);
  var [val,setVal]=useState(content||"");
  var [showRef,setShowRef]=useState(false);
  var subheadings=SECTION_SUBHEADINGS[title]||[];
  function parseBullets(text){var lines=text.split("\n").map(function(l){return l.replace(/^•\s*/,"").trim();}).filter(function(l){return l;});while(lines.length<5)lines.push("");return lines.slice(0,15);}
  var [bullets,setBullets]=useState(function(){return useBullets?parseBullets(content||[]):[];});
  function bulletsToText(bl){return bl.filter(function(b){return b.trim();}).map(function(b){return"• "+b;}).join("\n");}
  function addBullet(){if(bullets.length<15)setBullets(function(b){return b.concat([""]);});}
  function removeBullet(i){setBullets(function(b){return b.filter(function(_,j){return j!==i;});});}
  function updBullet(i,v){setBullets(function(b){var n=b.slice();n[i]=v;return n;});}
  useEffect(function(){setVal(content||"");if(!content||!content.trim())setEditing(true);if(useBullets)setBullets(parseBullets(content||""));},[content]);
  if(useBullets){var hasBullets=bullets.some(function(b){return b.trim();})||bullets.length>=5;if(!hasBullets){setBullets(["","","","",""]);} return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
      <span style={{fontSize:13,fontWeight:600,color:T.text}}>{title}</span>
      <div style={{display:"flex",gap:6}}>{!editing&&<button onClick={function(){setEditing(true);setBullets(parseBullets(content||""));}} style={{fontSize:12,padding:"4px 12px"}}>Edit</button>}</div>
    </div>
    {editing?(<div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:11,color:T.textSec,textTransform:"uppercase"}}>Bullets ({bullets.filter(function(b){return b.trim();}).length}/15)</span>
        {bullets.length<15&&<button onClick={addBullet} style={{fontSize:11,padding:"2px 8px"}}>+ Add</button>}
      </div>
      {bullets.map(function(b,i){return(<div key={i} style={{display:"flex",gap:6,marginBottom:4,alignItems:"center"}}>
        <span style={{fontSize:12,color:T.textSec,flexShrink:0}}>•</span>
        <textarea value={b} onChange={function(e){updBullet(i,e.target.value);}} placeholder={"Point "+(i+1)} rows={1} style={{fontSize:13,padding:"5px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg,color:T.text,flex:1,resize:"none",fontFamily:"inherit",lineHeight:1.5,overflow:"hidden",fieldSizing:"content"}}/>
        {bullets.length>1&&<span onClick={function(){removeBullet(i);}} style={{fontSize:11,color:T.textDanger,cursor:"pointer",flexShrink:0}}>×</span>}
      </div>);})}
      <div style={{display:"flex",gap:8,marginTop:8}}><button onClick={function(){onSave(bulletsToText(bullets));setEditing(false);}} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Save</button>{!isEmpty&&<span onClick={function(){setEditing(false);setBullets(parseBullets(content||""));}} style={{fontSize:12,color:T.textSec,cursor:"pointer",padding:"6px 8px"}}>Cancel</span>}</div>
    </div>):(<div style={{fontSize:13,lineHeight:1.8,color:T.text,padding:"10px 12px",background:T.bgSec,borderRadius:6,border:"1px solid "+T.border,minHeight:60}}>{bullets.filter(function(b){return b.trim();}).map(function(b,i){return <div key={i} style={{marginBottom:6}}>• {b}</div>;})}</div>)}
  </div>);}
  var isEmpty2=!content||!content.trim();
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
      <span style={{fontSize:13,fontWeight:600,color:T.text}}>{title}</span>
      <div style={{display:"flex",gap:6}}>{subheadings.length>0&&<button onClick={function(){setShowRef(function(s){return !s;});}} style={{fontSize:11,padding:"3px 8px",opacity:0.7}}>{showRef?"Hide":"Show"} headings</button>}{!editing&&<button onClick={function(){setEditing(true);setVal(content||"");}} style={{fontSize:12,padding:"4px 12px"}}>Edit</button>}</div>
    </div>
    {showRef&&subheadings.length>0&&(<div style={{marginBottom:10,padding:"8px 12px",background:"#fef9c3",borderRadius:6,border:"1px solid #fde68a",fontSize:12,color:"#854d0e"}}><div style={{fontWeight:500,marginBottom:4}}>Standard subheadings:</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{subheadings.map(function(h){return <code key={h} style={{fontSize:11,background:"#fef3c7",padding:"1px 6px",borderRadius:4}}>{h}</code>;})}</div></div>)}
    {editing?(<div>{subheadings.length>0&&isEmpty2&&<button onClick={function(){var txt=subheadings.map(function(h){return h+"\n";}).join("\n");setVal(function(v){return v?v+"\n\n"+txt:txt;});}} style={{fontSize:11,padding:"3px 8px",marginBottom:8}}>+ Insert standard subheadings</button>}<textarea value={val} onChange={function(e){setVal(e.target.value);}} style={{width:"100%",minHeight:220,resize:"vertical",fontSize:13,padding:"8px 10px",boxSizing:"border-box",borderRadius:6,border:"1px solid "+T.border,background:T.bg,color:T.text,fontFamily:"inherit",lineHeight:1.6,marginBottom:8}}/><div style={{display:"flex",gap:8}}><button onClick={function(){onSave(val);setEditing(false);}} style={{fontSize:12,padding:"6px 14px",fontWeight:500}}>Save</button>{!isEmpty2&&<span onClick={function(){setEditing(false);setVal(content||"");}} style={{fontSize:12,color:T.textSec,cursor:"pointer",padding:"6px 8px"}}>Cancel</span>}</div></div>):(<div style={{fontSize:13,lineHeight:1.8,color:T.text,whiteSpace:"pre-wrap",padding:"10px 12px",background:T.bgSec,borderRadius:6,border:"1px solid "+T.border,minHeight:60}}><span dangerouslySetInnerHTML={{__html:toHTML(content||"")}}/></div>)}
  </div>);
}

export default SectionEditTab;
