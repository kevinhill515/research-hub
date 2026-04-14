import { useState, useEffect } from "react";
import { useCompanyContext } from '../context/CompanyContext.jsx';
import { synPrompt, todayStr, simScore, detectCompanyTags, toMD, downloadMD } from '../utils/index.js';
import { apiCall } from '../api/index.js';
import { FORMATS, TONES, PRESET_TAGS } from '../constants/index.js';

export function useSynthesis(){
  const { companies, saved, setSaved, cp, copied, setCopied, T } = useCompanyContext();

  const [input,setInput]=useState("");
  const [sources,setSources]=useState([{label:"Source 1",text:""}]);
  const [useSrc,setUseSrc]=useState(false);
  const [format,setFormat]=useState("Key Takeaways");
  const [tone,setTone]=useState("Professional");
  const [custom,setCustom]=useState("");
  const [output,setOutput]=useState("");
  const [loading,setLoading]=useState(false);
  const [pendingTags,setPendingTags]=useState([]);
  const [autoTagSuggestions,setAutoTagSuggestions]=useState([]);
  const [fuQ,setFuQ]=useState("");
  const [fuA,setFuA]=useState("");
  const [fuLoading,setFuLoading]=useState(false);
  const [dupWarn,setDupWarn]=useState(false);
  const [cmpIds,setCmpIds]=useState([]);
  const [cmpOut,setCmpOut]=useState("");
  const [cmpLoading,setCmpLoading]=useState(false);
  const [macroOut,setMacroOut]=useState("");
  const [macroLoading,setMacroLoading]=useState(false);
  const [rsId,setRsId]=useState(null);
  const [rsFmt,setRsFmt]=useState("Key Takeaways");
  const [rsTone,setRsTone]=useState("Professional");
  const [rsOut,setRsOut]=useState("");
  const [rsLoading,setRsLoading]=useState(false);

  useEffect(function(){if(!output||!companies.length)return;setAutoTagSuggestions(detectCompanyTags(output,companies));},[output]);

  async function synthesize(){
    var has=useSrc?sources.some(function(s){return s.text.trim();}):input.trim();if(!has)return;setLoading(true);setOutput("");setFuA("");setFuQ("");setAutoTagSuggestions([]);
    try{var txt=useSrc?sources.filter(function(s){return s.text.trim();}).map(function(s){return"["+s.label+"]:\n"+s.text;}).join("\n\n"):input;setOutput(await apiCall(synPrompt(format,tone,custom),[{type:"text",text:txt}]));}catch(e){setOutput("Error: "+e.message);}
    setLoading(false);
  }
  function saveLib(force){
    if(!output)return;if(!force&&saved.some(function(s){return simScore(s.result,output)>0.6;})){setDupWarn(true);return;}setDupWarn(false);
    var title=(useSrc?(sources[0]&&sources[0].label):input.slice(0,48))||"Untitled";
    setSaved(function(p){return [{id:Date.now(),title,format,tone,result:output,tags:pendingTags,date:todayStr(),ts:Date.now(),pinned:false,note:""}].concat(p);});
    setPendingTags([]);setAutoTagSuggestions([]);
  }
  async function askFollowUp(){if(!fuQ.trim()||!output)return;setFuLoading(true);try{setFuA(await apiCall("Answer the follow-up concisely from this synthesis:\n\n"+output,fuQ,600));}catch(e){setFuA("Error.");}setFuLoading(false);}
  async function doResynth(){var e=saved.find(function(s){return s.id===rsId;});if(!e)return;setRsLoading(true);setRsOut("");try{setRsOut(await apiCall(synPrompt(rsFmt,rsTone,""),e.result));}catch(err){setRsOut("Error.");}setRsLoading(false);}
  function saveResynth(){var e=saved.find(function(s){return s.id===rsId;});if(!e||!rsOut)return;setSaved(function(p){return [{id:Date.now(),title:e.title+" (re-synthesized)",format:rsFmt,tone:rsTone,result:rsOut,tags:e.tags,date:todayStr(),ts:Date.now(),pinned:false,note:""}].concat(p);});setRsId(null);setRsOut("");}
  async function doCompare(){if(cmpIds.length<2)return;setCmpLoading(true);setCmpOut("");var entries=cmpIds.map(function(id){return saved.find(function(s){return s.id===id;});}).filter(Boolean);try{setCmpOut(await apiCall("Compare these entries. 1) **Shared themes**, 2) **Key differences**, 3) **Synthesis**.",entries.map(function(e,i){return"[Entry "+(i+1)+": "+e.title+"]\n"+e.result;}).join("\n\n---\n\n"),1000));}catch(e){setCmpOut("Error.");}setCmpLoading(false);}
  async function buildMacro(){var me=saved.filter(function(s){return(s.tags||[]).indexOf("Macro")>=0;});if(!me.length)return;setMacroLoading(true);setMacroOut("");try{setMacroOut(await apiCall("Synthesize these Macro entries. Structure: **Running themes**, **Consensus views**, **Divergences**, **Master core finding**, **Watch list**.",me.map(function(e){return"["+e.title+"]\n"+e.result;}).join("\n\n---\n\n"),1500));}catch(e){setMacroOut("Error.");}setMacroLoading(false);}

  return {
    input,setInput,sources,setSources,useSrc,setUseSrc,format,setFormat,
    tone,setTone,custom,setCustom,output,setOutput,loading,setLoading,
    pendingTags,setPendingTags,autoTagSuggestions,setAutoTagSuggestions,
    fuQ,setFuQ,fuA,setFuA,fuLoading,setFuLoading,dupWarn,setDupWarn,
    cmpIds,setCmpIds,cmpOut,setCmpOut,cmpLoading,setCmpLoading,
    macroOut,setMacroOut,macroLoading,setMacroLoading,
    rsId,setRsId,rsFmt,setRsFmt,rsTone,setRsTone,rsOut,setRsOut,rsLoading,setRsLoading,
    synthesize,saveLib,askFollowUp,doResynth,saveResynth,doCompare,buildMacro
  };
}
