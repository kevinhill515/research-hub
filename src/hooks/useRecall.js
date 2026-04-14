import { useState } from "react";
import { useCompanyContext } from '../context/CompanyContext.jsx';
import { apiCall } from '../api/index.js';

export function useRecall(){
  const { saved } = useCompanyContext();

  const [recallQ,setRecallQ]=useState("");
  const [recall,setRecall]=useState("");
  const [recallLoading,setRecallLoading]=useState(false);
  const [recallSrcs,setRecallSrcs]=useState([]);
  const [recallHist,setRecallHist]=useState([]);
  const [suggestions,setSuggestions]=useState([]);

  async function askRecall(){
    if(!recallQ.trim()||!saved.length)return;setRecallLoading(true);setRecall("");setRecallSrcs([]);
    try{var ctx=saved.map(function(s,i){return"[Research "+(i+1)+": "+s.title+"]\n"+s.result;}).join("\n\n---\n\n");var full=await apiCall("Answer drawing on saved entries. Cite (e.g. Research 2). End with SOURCES_USED: [comma-separated numbers]\n\nLIBRARY:\n"+ctx,recallQ,1000);var m=full.match(/SOURCES_USED:\s*([\d,\s]+)/);var ans=m?full.replace(/SOURCES_USED:.*/,"").trim():full;setRecall(ans);if(m)setRecallSrcs(m[1].split(",").map(function(n){return parseInt(n.trim())-1;}).filter(function(n){return !isNaN(n);}).map(function(i){return saved[i];}).filter(Boolean));setRecallHist(function(h){return [{q:recallQ,a:ans,ts:Date.now()}].concat(h.slice(0,9));});}catch(e){setRecall("Error.");}setRecallLoading(false);
  }
  async function genSuggestions(){try{var r=await apiCall("","Suggest 4 cross-cutting questions. Return ONLY a JSON array of strings.\n"+saved.map(function(s,i){return(i+1)+". "+s.title;}).join("\n"),300);setSuggestions(JSON.parse(r.replace(/```json|```/g,"").trim()));}catch(e){}}

  return {
    recallQ,setRecallQ,recall,setRecall,recallLoading,setRecallLoading,
    recallSrcs,setRecallSrcs,recallHist,setRecallHist,suggestions,setSuggestions,
    askRecall,genSuggestions
  };
}
