import { useState } from "react";
import { TP_CHANGES, THESIS_STATUSES } from '../../constants/index.js';
import { apiCall } from '../../api/index.js';

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

export default EarningsEntry;
