import { createContext, useContext, useState, useEffect } from "react";
import { supaGet, supaUpsert } from '../api/index.js';
import { todayStr, mkTheme } from '../utils/index.js';

const CompanyContext=createContext(null);

export function CompanyProvider({children}){
  const [authed,setAuthed]=useState(function(){try{return sessionStorage.getItem("rh_auth")==="1";}catch(e){return false;}});
  const [dark,setDark]=useState(function(){try{return localStorage.getItem("rh_dark")==="1";}catch(e){return false;}});
  const [currentUser,setCurrentUser]=useState(function(){try{return localStorage.getItem("rh_user")||"";}catch(e){return "";}});
  const [showUserPicker,setShowUserPicker]=useState(false);
  useEffect(function(){try{localStorage.setItem("rh_dark",dark?"1":"0");}catch(e){};},[dark]);
  useEffect(function(){try{if(currentUser)localStorage.setItem("rh_user",currentUser);}catch(e){};},[currentUser]);

  const T=mkTheme(dark);

  const [companies,setCompanies]=useState([]);
  const [saved,setSaved]=useState([]);
  const [ready,setReady]=useState(false);
  const [loadStatus,setLoadStatus]=useState({companies:null,library:null});
  const [lastPriceUpdate,setLastPriceUpdate]=useState(null);
  const [entryComments,setEntryComments]=useState({});
  const [newCommentText,setNewCommentText]=useState({});
  const [repData,setRepData]=useState({});
  const [fxRates,setFxRates]=useState({});
  const [specialWeights,setSpecialWeights]=useState({});
  const [calLastUpdated,setCalLastUpdated]=useState("");
  const [calLastUpdatedBy,setCalLastUpdatedBy]=useState("");
  const [repLastUpdated,setRepLastUpdated]=useState("");
  const [fxLastUpdated,setFxLastUpdated]=useState("");
  const [copied,setCopied]=useState(null);

  async function loadFromStorage(){     setLoadStatus({companies:null,library:null});var coOk=false,libOk=false;     try{var r=await supaGet("library","id","shared");if(r){var d=JSON.parse(r.data);if(Array.isArray(d)&&d.length){setSaved(d);libOk=d.length;}}}catch(e){}     try{var r2=await supaGet("companies","id","shared");if(r2){var d2=JSON.parse(r2.data);if(Array.isArray(d2)&&d2.length){setCompanies(d2);coOk=d2.length;}}}catch(e){}     try{var r3=await supaGet("meta","key","lastPriceUpdate");if(r3)setLastPriceUpdate(r3.value);}catch(e){}     try{var r4=await supaGet("meta","key","entryComments");if(r4)setEntryComments(JSON.parse(r4.value));}catch(e){} try{var r5=await supaGet("meta","key","calLastUpdated");if(r5&&r5.value){var parts=r5.value.split(" at ");setCalLastUpdatedBy(parts[0]||"");setCalLastUpdated(parts[1]||"");}}catch(e){} try{var r6=await supaGet("meta","key","repData");if(r6&&r6.value)setRepData(JSON.parse(r6.value));}catch(e){} try{var r7=await supaGet("meta","key","fxRates");if(r7&&r7.value)setFxRates(JSON.parse(r7.value));}catch(e){} try{var r8=await supaGet("meta","key","specialWeights");if(r8&&r8.value)setSpecialWeights(JSON.parse(r8.value));}catch(e){}     setLoadStatus({companies:coOk,library:libOk});setReady(true);return coOk||libOk;}

  useEffect(function(){
    var done=false,attempts=0;
    var iv=setInterval(async function(){if(done){clearInterval(iv);return;}attempts++;var got=await loadFromStorage();if(got){done=true;clearInterval(iv);}else if(attempts>60){clearInterval(iv);setLoadStatus({companies:0,library:0});setReady(true);}},500);
    return function(){done=true;clearInterval(iv);};
  },[]);

  useEffect(function(){if(ready)supaUpsert("library",{id:"shared",data:JSON.stringify(saved)});},[saved,ready]);
  useEffect(function(){if(ready)supaUpsert("companies",{id:"shared",data:JSON.stringify(companies)});},[companies,ready]);
  useEffect(function(){if(ready&&lastPriceUpdate)supaUpsert("meta",{key:"lastPriceUpdate",value:lastPriceUpdate});},[lastPriceUpdate,ready]);
  useEffect(function(){if(ready)supaUpsert("meta",{key:"entryComments",value:JSON.stringify(entryComments)});},[entryComments,ready]);

  function addComment(entryId,text){   if(!text.trim())return;   var comment={id:Date.now(),text:text.trim(),author:currentUser||"Unknown",date:todayStr()};   setEntryComments(function(prev){return Object.assign({},prev,{[entryId]:([comment].concat(prev[entryId]||[]))});});   setNewCommentText(function(prev){return Object.assign({},prev,{[entryId]:""});}); }
  function deleteComment(entryId,commentId){   setEntryComments(function(prev){return Object.assign({},prev,{[entryId]:(prev[entryId]||[]).filter(function(c){return c.id!==commentId;})});}); }

  function updateCo(id,ch){setCompanies(function(cs){return cs.map(function(c){return c.id===id?Object.assign({},c,ch):c;});});}

  function cp(text,key){try{var el=document.createElement("textarea");el.value=text;el.style.position="fixed";el.style.opacity="0";document.body.appendChild(el);el.focus();el.select();document.execCommand("copy");document.body.removeChild(el);setCopied(key);setTimeout(function(){setCopied(null);},1500);}catch(e){}}

  var value={
    companies,setCompanies,
    saved,setSaved,
    ready,setReady,
    loadStatus,setLoadStatus,
    lastPriceUpdate,setLastPriceUpdate,
    entryComments,setEntryComments,
    newCommentText,setNewCommentText,
    repData,setRepData,
    fxRates,setFxRates,
    specialWeights,setSpecialWeights,
    currentUser,setCurrentUser,
    dark,setDark,
    authed,setAuthed,
    showUserPicker,setShowUserPicker,
    calLastUpdated,setCalLastUpdated,
    calLastUpdatedBy,setCalLastUpdatedBy,
    repLastUpdated,setRepLastUpdated,
    fxLastUpdated,setFxLastUpdated,
    copied,setCopied,
    loadFromStorage,
    addComment,
    deleteComment,
    updateCo,
    cp,
    T
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyContext(){
  var ctx=useContext(CompanyContext);
  if(!ctx)throw new Error("useCompanyContext must be used within CompanyProvider");
  return ctx;
}
