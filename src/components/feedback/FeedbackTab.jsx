import { useState, useMemo } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';

const BTN_SM = "text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
const BTN_PRIMARY = "text-sm px-4 py-2 font-semibold bg-blue-700 text-white border-none rounded-md cursor-pointer hover:bg-blue-800 transition-colors";
const INP = "text-sm px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none";
const TA = "w-full resize-y text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-[inherit] leading-relaxed focus:ring-2 focus:ring-blue-500 focus:outline-none";
const LABEL = "text-[11px] text-gray-500 dark:text-slate-400 block mb-1";

const TAB_OPTIONS = [
  "Portfolios","Research","Companies","Dashboard","Synthesize",
  "Library","Recall","Compare","Macro Master","Earnings Calendar",
  "Performance","Feedback",
];

const TYPE_STYLES = {
  bug:         { bg:"#fee2e2", color:"#991b1b", dark_bg:"rgba(220,38,38,0.25)", dark_color:"#fca5a5", label:"🐞 Bug" },
  improvement: { bg:"#dbeafe", color:"#1e40af", dark_bg:"rgba(37,99,235,0.25)", dark_color:"#93c5fd", label:"✨ Improvement" },
};

export function FeedbackTab(){
  const { feedback, addFeedback, updateFeedback, removeFeedback, moveFeedback, currentUser, dark } = useCompanyContext();
  const [form, setForm] = useState({ type:"improvement", area:"Portfolios", newArea:"", text:"" });
  const [filter, setFilter] = useState("open"); /* open | all | resolved */
  const [editId, setEditId] = useState(null);

  const items = useMemo(function(){
    if(filter==="open")    return (feedback||[]).filter(function(f){return !f.resolved;});
    if(filter==="resolved")return (feedback||[]).filter(function(f){return f.resolved;});
    return feedback||[];
  },[feedback,filter]);

  /* Map filtered display index → index in full feedback array for reorder calls. */
  function rawIndexOf(item){return (feedback||[]).findIndex(function(f){return f.id===item.id;});}

  function submit(){
    var area = form.area==="__new__" ? (form.newArea.trim()?"New: "+form.newArea.trim():"") : form.area;
    if(!form.text.trim() || !area){alert("Fill in the area and description.");return;}
    addFeedback({ type:form.type, area:area, text:form.text.trim() });
    setForm({ type:"improvement", area:form.area==="__new__"?"Portfolios":form.area, newArea:"", text:"" });
  }

  function typeStyle(t){
    var s = TYPE_STYLES[t] || TYPE_STYLES.improvement;
    return dark ? { background:s.dark_bg, color:s.dark_color } : { background:s.bg, color:s.color };
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <div className="text-base font-semibold text-gray-900 dark:text-slate-100">Feedback</div>
          <div className="text-xs text-gray-500 dark:text-slate-400">Log bugs and improvement ideas. Drag priority with ▲▼.</div>
        </div>
        <div className="flex gap-1 text-xs">
          {[["open","Open"],["resolved","Resolved"],["all","All"]].map(function(f){
            var active=filter===f[0];
            return <span key={f[0]} onClick={function(){setFilter(f[0]);}} className={"px-2.5 py-1 rounded-full cursor-pointer border transition-colors "+(active?"bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-500 text-gray-900 dark:text-slate-100 font-semibold":"border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{f[1]}{f[0]!=="all"&&<span className="ml-1 text-[10px] opacity-70">({(feedback||[]).filter(function(x){return f[0]==="open"?!x.resolved:x.resolved;}).length})</span>}</span>;
          })}
        </div>
      </div>

      {/* New-entry form */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 mb-4">
        <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">Submitting as <span className="font-semibold text-gray-900 dark:text-slate-100">{currentUser||"(unknown user)"}</span></div>
        <div className="flex gap-3 flex-wrap items-end mb-2">
          <div>
            <label className={LABEL}>Type</label>
            <div className="flex gap-1">
              {["bug","improvement"].map(function(t){
                var active=form.type===t;
                return <span key={t} onClick={function(){setForm(Object.assign({},form,{type:t}));}} className={"text-xs px-2.5 py-1 rounded-full cursor-pointer border transition-colors"} style={active?typeStyle(t):{borderColor:"#cbd5e1",background:"transparent",color:dark?"#94a3b8":"#64748b"}}>{TYPE_STYLES[t].label}</span>;
              })}
            </div>
          </div>
          <div>
            <label className={LABEL}>Area</label>
            <select value={form.area} onChange={function(e){setForm(Object.assign({},form,{area:e.target.value}));}} className={INP+" !text-xs"}>
              {TAB_OPTIONS.map(function(t){return <option key={t} value={t}>{t}</option>;})}
              <option value="__new__">+ New tab / area…</option>
            </select>
          </div>
          {form.area==="__new__" && (
            <div>
              <label className={LABEL}>New tab name</label>
              <input value={form.newArea} onChange={function(e){setForm(Object.assign({},form,{newArea:e.target.value}));}} placeholder="e.g. Risk Monitor" className={INP+" !text-xs w-48"}/>
            </div>
          )}
        </div>
        <div className="mb-2">
          <label className={LABEL}>Description</label>
          <textarea value={form.text} onChange={function(e){setForm(Object.assign({},form,{text:e.target.value}));}} rows={3} placeholder={form.type==="bug"?"Describe the bug — steps to reproduce, what you expected, what happened.":"What would make the app better? Who benefits?"} className={TA} style={{minHeight:70}}/>
        </div>
        <button onClick={submit} disabled={!form.text.trim()||(form.area==="__new__"&&!form.newArea.trim())} className={BTN_PRIMARY + " disabled:opacity-50 disabled:cursor-not-allowed"}>Submit</button>
      </div>

      {/* List */}
      {items.length===0 ? (
        <div className="text-sm text-gray-500 dark:text-slate-400 italic text-center py-6">
          {filter==="open"?"No open feedback. Submit one above.":filter==="resolved"?"No resolved items yet.":"Nothing logged yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(function(item,i){
            var idx=rawIndexOf(item);
            var isEditing=editId===item.id;
            return (
              <div key={item.id} className={"rounded-lg border px-3.5 py-2.5 bg-white dark:bg-slate-900 "+(item.resolved?"border-slate-200 dark:border-slate-700 opacity-60":"border-slate-300 dark:border-slate-600")}>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col leading-none text-gray-400 dark:text-slate-500 pt-0.5 text-xs">
                    <button type="button" disabled={idx===0} onClick={function(){moveFeedback(idx,idx-1);}} className={"px-1 py-0 cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 "+(idx===0?"opacity-30 cursor-not-allowed":"")} title="Move up">{"\u25B2"}</button>
                    <button type="button" disabled={idx===(feedback||[]).length-1} onClick={function(){moveFeedback(idx,idx+1);}} className={"px-1 py-0 cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 "+(idx===(feedback||[]).length-1?"opacity-30 cursor-not-allowed":"")} title="Move down">{"\u25BC"}</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={typeStyle(item.type)}>{(TYPE_STYLES[item.type]||TYPE_STYLES.improvement).label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-medium">{item.area||"(no area)"}</span>
                      <span className="text-[11px] text-gray-500 dark:text-slate-400">{item.author}</span>
                      <span className="text-[11px] text-gray-400 dark:text-slate-500 font-mono">{item.date}</span>
                      {item.resolved && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-semibold">✓ resolved</span>}
                      <label className="text-[11px] text-gray-500 dark:text-slate-400 flex items-center gap-1 cursor-pointer ml-auto">
                        <input type="checkbox" checked={!!item.resolved} onChange={function(e){updateFeedback(item.id,{resolved:e.target.checked});}} className="accent-green-600"/>
                        Resolved
                      </label>
                      <span onClick={function(){setEditId(isEditing?null:item.id);}} className="text-[11px] text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{isEditing?"Cancel":"Edit"}</span>
                      <span onClick={function(){if(confirm("Delete this feedback?"))removeFeedback(item.id);}} className="text-[11px] text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700">Delete</span>
                    </div>
                    {isEditing ? (
                      <textarea defaultValue={item.text} onBlur={function(e){updateFeedback(item.id,{text:e.target.value.trim()||item.text});setEditId(null);}} rows={3} autoFocus className={TA} style={{minHeight:70}}/>
                    ) : (
                      <div className="text-sm text-gray-900 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">{item.text}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
