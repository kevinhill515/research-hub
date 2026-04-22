import { useState } from "react";
import { useCompanyContext } from '../context/CompanyContext.jsx';
import { toHTML, toMD, downloadMD, todayStr } from '../utils/index.js';
import { LIB_SORTS } from '../constants/index.js';
import { useAlert } from '../components/ui/DialogProvider.jsx';

export function useLibrary(selCo){
  const { saved, setSaved, T } = useCompanyContext();
  const alertFn = useAlert();

  const [expanded,setExpanded]=useState(null);
  const [libSort,setLibSort]=useState("Pinned first");
  const [filterTag,setFilterTag]=useState("All");
  const [search,setSearch]=useState("");
  const [editId,setEditId]=useState(null);
  const [editTitle,setEditTitle]=useState("");
  const [editNote,setEditNote]=useState("");

  function updEntry(id,ch){setSaved(function(p){return p.map(function(e){return e.id===id?Object.assign({},e,ch):e;});});}
  function exportEntryPDF(entry){   var html="<h1>"+entry.title+"</h1><div class='meta'>Format: "+entry.format+" | Date: "+entry.date+(entry.savedBy?" | Saved by: "+entry.savedBy:"")+"</div><div>"+toHTML(entry.result)+"</div>";   var win=window.open("","_blank");   if(!win){alertFn("Please allow popups to export PDF.");return;}   win.document.write("<!DOCTYPE html><html><head><title>"+entry.title+"</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 40px;color:#111;line-height:1.7;}h1{font-size:22px;border-bottom:2px solid #334155;padding-bottom:10px;margin-bottom:20px;}h2{font-size:16px;color:#1e40af;margin-top:28px;margin-bottom:8px;}p{font-size:14px;}.meta{font-size:12px;color:#6b7280;margin-bottom:20px;}</style></head><body>"+html+"</body></html>");   win.document.close();   setTimeout(function(){win.print();},500); }

  var allTags=["All"].concat(Array.from(new Set(saved.reduce(function(acc,s){return acc.concat(s.tags||[]);},[]))));
  var filteredSaved=saved.filter(function(s){return filterTag==="All"||(s.tags||[]).indexOf(filterTag)>=0;}).filter(function(s){return !search||s.title.toLowerCase().indexOf(search.toLowerCase())>=0||s.result.toLowerCase().indexOf(search.toLowerCase())>=0;}).sort(function(a,b){if(libSort==="Pinned first")return(b.pinned?1:0)-(a.pinned?1:0)||b.ts-a.ts;if(libSort==="Newest")return b.ts-a.ts;if(libSort==="Oldest")return a.ts-b.ts;if(libSort==="Format")return a.format.localeCompare(b.format);return((a.tags||[])[0]||"").localeCompare((b.tags||[])[0]||"");});
  var macroEntries=saved.filter(function(s){return(s.tags||[]).indexOf("Macro")>=0;});
  var linkedEntries=selCo?saved.filter(function(s){return(s.tags||[]).some(function(t){return t.toLowerCase()===selCo.name.toLowerCase();})||s.result.toLowerCase().indexOf((selCo.name||"").toLowerCase())>=0||(selCo.ticker&&s.result.toLowerCase().indexOf(selCo.ticker.toLowerCase())>=0);}):[];

  return {
    expanded,setExpanded,libSort,setLibSort,filterTag,setFilterTag,
    search,setSearch,editId,setEditId,editTitle,setEditTitle,editNote,setEditNote,
    updEntry,exportEntryPDF,
    filteredSaved,allTags,macroEntries,linkedEntries
  };
}
