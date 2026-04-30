import { createContext, useContext, useState, useEffect } from "react";
import { supaGet, supaUpsert } from '../api/index.js';
import { todayStr } from '../utils/index.js';

const CompanyContext=createContext(null);

export function CompanyProvider({children}){
  const [authed,setAuthed]=useState(function(){try{return sessionStorage.getItem("rh_auth")==="1";}catch(e){return false;}});
  const [dark,setDark]=useState(function(){try{return localStorage.getItem("rh_dark")==="1";}catch(e){return false;}});
  const [currentUser,setCurrentUser]=useState(function(){try{return localStorage.getItem("rh_user")||"";}catch(e){return "";}});
  const [showUserPicker,setShowUserPicker]=useState(false);
  useEffect(function(){try{localStorage.setItem("rh_dark",dark?"1":"0");}catch(e){};},[dark]);
  useEffect(function(){try{if(currentUser)localStorage.setItem("rh_user",currentUser);}catch(e){};},[currentUser]);

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
  const [benchmarkWeights,setBenchmarkWeights]=useState({}); /* {benchmarkName: {sectors:{}, countries:{}, asOf:string}} */
  /* Quarterly history of sector/country/metric weights for both benchmarks
     and our portfolios. Shape:
       { "MSCI ACWI": { "2026-03-31": {sectors:{}, countries:{}, metrics:{}} },
         "FGL":       { "2026-03-31": {sectors:{}, countries:{}} },
         ... }
     Populated by the dated 5-col benchmark import. Used by the Dashboard
     Sector/Country breakdown subtabs to draw stacked-area history charts
     and over/underweight-through-time comparisons. */
  const [breakdownHistory,setBreakdownHistory]=useState({});
  const [alertRules,setAlertRules]=useState({}); /* {ruleId: {enabled, params}} — overrides DEFAULT_RULES */
  const [calLastUpdated,setCalLastUpdated]=useState("");
  const [calLastUpdatedBy,setCalLastUpdatedBy]=useState("");
  const [repLastUpdated,setRepLastUpdated]=useState("");
  const [fxLastUpdated,setFxLastUpdated]=useState("");
  const [copied,setCopied]=useState(null);
  const [annotations,setAnnotations]=useState([]);
  /* Research priority board: per-member slot assignments + shared reorgs list.
     Shape: { byMember: { [name]: { gbl: {primary:[], secondary:[]}, intl:{...}, intSmall:{...}, em:{...}, existingHlds:[] } }, reorgs:[] } */
  const [researchAssignments,setResearchAssignments]=useState({byMember:{},reorgs:[]});
  /* Performance board: monthly returns per portfolio + series metadata.
     Shape: { [portfolio]: {
                lastMonthEMV: Number,
                series: [{ name, role, ticker, returns: {"YYYY-MM": Number, ...} }, ...]
              } } */
  const [perfData,setPerfData]=useState({});
  /* Feedback board: team-submitted bugs + improvement suggestions.
     Shape: [{ id, author, type:"bug"|"improvement", area, text, date, resolved }]
     Order in the array = priority (top → bottom). */
  const [feedback,setFeedback]=useState([]);
  /* marketsSnapshot — daily FactSet pull writes to meta.marketsSnapshot.
     Shape: { indices: [{label, ticker, "1d", "5d", ...}], sectors: [...],
     countries: [...], commodities: [...], bonds: [...], fx: {...} }.
     Loaded lazily on first read and cached here so SnapshotTab and
     MarketsDashboard don't each re-fetch. */
  const [marketsSnapshot,setMarketsSnapshot]=useState(null);
  /* "loading" | "ready" — distinguishes "still fetching" from "fetched
     but empty". Used by MarketsDashboard to avoid showing the empty
     state during the initial load. */
  const [marketsStatus,setMarketsStatus]=useState("loading");
  const [marketsLoaded,setMarketsLoaded]=useState(false);
  /* Trigger the lazy load on first call to ensureMarketsSnapshot. */
  function ensureMarketsSnapshot(){
    if(marketsLoaded)return;
    setMarketsLoaded(true);
    (async function(){
      try{
        const r=await supaGet("meta","key","marketsSnapshot");
        if(r&&r.value){
          try{ setMarketsSnapshot(JSON.parse(r.value)); }
          catch(e){ /* ignore */ }
        }
      }catch(e){ /* ignore */ }
      finally{ setMarketsStatus("ready"); }
    })();
  }

  function migratePortfolioKeys(cos){
    var RENAMES={"FIV":"FIN","IV":"IN","FOC1":"FIN1","FOC2":"FIN2","FOC3":"FIN3","MC1":"FIN1","MC2":"FIN2","MC3":"FIN3","MC4":"INGL1","MC5":"INGL2","INTL":"IN1"};
    var changed=false;
    var migrated=cos.map(function(c){
      var upd=Object.assign({},c);
      // Migrate portfolios array
      if(Array.isArray(upd.portfolios)){
        var newP=upd.portfolios.map(function(p){return RENAMES[p]||p;});
        if(newP.join(",")!==upd.portfolios.join(",")){upd.portfolios=newP;changed=true;}
      }
      // Migrate portWeights keys
      if(upd.portWeights){
        var newW={};var wChanged=false;
        Object.keys(upd.portWeights).forEach(function(k){
          var nk=RENAMES[k]||k;
          if(nk!==k)wChanged=true;
          newW[nk]=upd.portWeights[k];
        });
        if(wChanged){upd.portWeights=newW;changed=true;}
      }
      // Migrate portNote
      if(upd.portNote){
        var parts=upd.portNote.split(/[,\s]+/).filter(Boolean);
        var newParts=parts.map(function(p){return RENAMES[p]||p;});
        if(newParts.join(", ")!==parts.join(", ")){upd.portNote=newParts.join(", ");changed=true;}
      }
      // Migrate tier
      if(upd.tier){
        var tiers=String(upd.tier).split(",").map(function(t){var tr=t.trim();return RENAMES[tr]||tr;});
        var newTier=tiers.join(", ");
        if(newTier!==upd.tier){upd.tier=newTier;changed=true;}
      }
      // Migrate country: "Britain" -> "United Kingdom" (post-IC standardization).
      if(upd.country==="Britain"){upd.country="United Kingdom";changed=true;}
      return upd;
    });
    return{data:migrated,changed:changed};
  }
  function migrateSpecialWeights(sw){
    var RENAMES={"FIV":"FIN","IV":"IN"};
    var changed=false;var newSW={};
    Object.keys(sw).forEach(function(label){
      var row=sw[label];var newRow={};
      Object.keys(row).forEach(function(k){
        var nk=RENAMES[k]||k;if(nk!==k)changed=true;
        newRow[nk]=row[k];
      });
      newSW[label]=newRow;
    });
    return{data:newSW,changed:changed};
  }
  function migrateRepData(rd){
    var RENAMES={"FIV":"FIN","IV":"IN"};
    var changed=false;var newRD={};
    Object.keys(rd).forEach(function(k){
      var nk=RENAMES[k]||k;if(nk!==k)changed=true;
      var port=rd[k];var newPort={};
      Object.keys(port||{}).forEach(function(tk){
        var v=port[tk];
        if(typeof v==="number"){newPort[tk]={shares:v,avgCost:0};changed=true;}
        else if(v&&typeof v==="object"){newPort[tk]={shares:Number(v.shares)||0,avgCost:Number(v.avgCost)||0};}
        else{newPort[tk]={shares:0,avgCost:0};changed=true;}
      });
      newRD[nk]=newPort;
    });
    return{data:newRD,changed:changed};
  }
  function migrateTags(entries){
    var RENAMES={"FIV":"FIN","IV":"IN"};
    var changed=false;
    var migrated=entries.map(function(e){
      if(!e.tags||!Array.isArray(e.tags))return e;
      var newTags=e.tags.map(function(t){return RENAMES[t]||t;});
      if(newTags.join(",")!==e.tags.join(",")){changed=true;return Object.assign({},e,{tags:newTags});}
      return e;
    });
    return{data:migrated,changed:changed};
  }

  async function loadFromStorage(){     setLoadStatus({companies:null,library:null});var coOk=false,libOk=false;     try{var r=await supaGet("library","id","shared");if(r){var d=JSON.parse(r.data);if(Array.isArray(d)&&d.length){var libMig=migrateTags(d);setSaved(libMig.data);libOk=libMig.data.length;if(libMig.changed)supaUpsert("library",{id:"shared",data:JSON.stringify(libMig.data)});}}}catch(e){}     try{var r2=await supaGet("companies","id","shared");if(r2){var d2=JSON.parse(r2.data);if(Array.isArray(d2)&&d2.length){var coMig=migratePortfolioKeys(d2);setCompanies(coMig.data);coOk=coMig.data.length;if(coMig.changed)supaUpsert("companies",{id:"shared",data:JSON.stringify(coMig.data)});}}}catch(e){}     try{var r3=await supaGet("meta","key","lastPriceUpdate");if(r3)setLastPriceUpdate(r3.value);}catch(e){}     try{var r4=await supaGet("meta","key","entryComments");if(r4)setEntryComments(JSON.parse(r4.value));}catch(e){} try{var r5=await supaGet("meta","key","calLastUpdated");if(r5&&r5.value){var parts=r5.value.split(" at ");setCalLastUpdatedBy(parts[0]||"");setCalLastUpdated(parts[1]||"");}}catch(e){} try{var r6=await supaGet("meta","key","repData");if(r6&&r6.value){var rdRaw=JSON.parse(r6.value);var rdMig=migrateRepData(rdRaw);setRepData(rdMig.data);if(rdMig.changed)supaUpsert("meta",{key:"repData",value:JSON.stringify(rdMig.data)});}}catch(e){} try{var r7=await supaGet("meta","key","fxRates");if(r7&&r7.value)setFxRates(JSON.parse(r7.value));}catch(e){} try{var r8=await supaGet("meta","key","specialWeights");if(r8&&r8.value){var swRaw=JSON.parse(r8.value);var swMig=migrateSpecialWeights(swRaw);setSpecialWeights(swMig.data);if(swMig.changed)supaUpsert("meta",{key:"specialWeights",value:JSON.stringify(swMig.data)});}}catch(e){} try{var r9=await supaGet("meta","key","annotations");if(r9&&r9.value){var ann=JSON.parse(r9.value);if(Array.isArray(ann))setAnnotations(ann);}}catch(e){} try{var r10=await supaGet("meta","key","researchAssignments");if(r10&&r10.value){var ra=JSON.parse(r10.value);if(ra&&typeof ra==="object"){if(!ra.byMember)ra.byMember={};if(!Array.isArray(ra.reorgs))ra.reorgs=[];/* Migrate legacy category keys: gbl→gl, intl→in, intSmall→sc */var RA_RENAMES={gbl:"gl",intl:"in",intSmall:"sc"};var raChanged=false;Object.keys(ra.byMember).forEach(function(m){var mb=ra.byMember[m]||{};Object.keys(RA_RENAMES).forEach(function(oldK){if(mb[oldK]!==undefined){mb[RA_RENAMES[oldK]]=mb[oldK];delete mb[oldK];raChanged=true;}});ra.byMember[m]=mb;});setResearchAssignments(ra);if(raChanged)supaUpsert("meta",{key:"researchAssignments",value:JSON.stringify(ra)});}}}catch(e){} try{var r11=await supaGet("meta","key","perfData");if(r11&&r11.value){var pd=JSON.parse(r11.value);if(pd&&typeof pd==="object")setPerfData(pd);}}catch(e){} try{var r12=await supaGet("meta","key","feedback");if(r12&&r12.value){var fb=JSON.parse(r12.value);if(Array.isArray(fb))setFeedback(fb);}}catch(e){} try{var r13=await supaGet("meta","key","benchmarkWeights");if(r13&&r13.value){var bw=JSON.parse(r13.value);if(bw&&typeof bw==="object")setBenchmarkWeights(bw);}}catch(e){} try{var r14=await supaGet("meta","key","alertRules");if(r14&&r14.value){var ar=JSON.parse(r14.value);if(ar&&typeof ar==="object")setAlertRules(ar);}}catch(e){} try{var r15=await supaGet("meta","key","breakdownHistory");if(r15&&r15.value){var bh=JSON.parse(r15.value);if(bh&&typeof bh==="object"){
       /* One-time data cleanups, gated by meta flags so they only run
          once and don't repeatedly mutate the saved data. Each cleanup
          returns true if it changed anything; we persist + flag if so. */
       var bhChanged=false;
       try{var rFlag1=await supaGet("meta","key","cleanup_drop_2026_06_30");if(!(rFlag1&&rFlag1.value)){
         /* Stray 2026-06-30 entries got into multiple benchmarks (the
            user reported and partially deleted them earlier). Remove
            from every name in breakdownHistory.  */
         Object.keys(bh).forEach(function(name){
           if(bh[name]&&bh[name]["2026-06-30"]){
             delete bh[name]["2026-06-30"];
             bhChanged=true;
           }
         });
         supaUpsert("meta",{key:"cleanup_drop_2026_06_30",value:"1"});
       }}catch(e){}
       try{var rFlag2=await supaGet("meta","key","cleanup_acwiexus_2025_q2_x100");if(!(rFlag2&&rFlag2.value)){
         /* Q2 2025 ACWI ex US sectors were uploaded in decimal form
            (0.243 instead of 24.3), making them 100x too small. Multiply
            sector values by 100 for that specific name × date. Only
            applied if the existing values look decimal-form (max < 1). */
         ["ACWI ex US","ACWI ex US Value"].forEach(function(name){
           var slot=bh[name]&&bh[name]["2025-06-30"];
           if(!slot||!slot.sectors)return;
           var keys=Object.keys(slot.sectors);
           if(keys.length===0)return;
           var maxV=keys.reduce(function(m,k){var v=parseFloat(slot.sectors[k]);return isFinite(v)&&v>m?v:m;},0);
           if(maxV>=1)return; /* Already in percent form — skip. */
           keys.forEach(function(k){var v=parseFloat(slot.sectors[k]);if(isFinite(v))slot.sectors[k]=v*100;});
           bhChanged=true;
         });
         supaUpsert("meta",{key:"cleanup_acwiexus_2025_q2_x100",value:"1"});
       }}catch(e){}
       try{var rFlag3=await supaGet("meta","key","cleanup_bench_scale_v3");if(!(rFlag3&&rFlag3.value)){
         /* Broad benchmark scale fix. The user pasted FactSet-export
            data in decimal form (0.243 for 24.3%, 0.179 for 17.9%) and
            the importer's /100 step on pct-kind ratios compounded the
            wrong scale. Multiply by 100 to bring back to expected form,
            for benchmark names only (skip portfolio codes). Heuristics
            keep the migration safe to re-run on partially-correct data:
              - sectors / countries: ×100 only if max value < 1
              - pct-kind ratios:     ×100 only if value < 0.5
              - x-kind fwdPe:        ×100 only if value < 1 */
         var PORT_CODES = ["FIN","IN","FGL","GL","EM","SC"];
         /* "ROE on down" per the user — everything from ROE through Debt
            to Capital. Active Share is intentionally not in this set; it
            gets fixed independently if ever uploaded with wrong scale. */
         var PCT_RATIO_KEYS = ["roe","roe5y","epsGrFwd1","epsGrFwd35","epsGrHist3",
                               "adpsGr5","adpsGr1","intGr","divYld","payout","debtCap"];
         function fixBucketIfDecimal(map, threshold) {
           if (!map) return false;
           var keys = Object.keys(map);
           if (keys.length === 0) return false;
           var maxV = keys.reduce(function (m, k) {
             var v = parseFloat(map[k]);
             return isFinite(v) && v > m ? v : m;
           }, 0);
           if (maxV >= threshold) return false;
           keys.forEach(function (k) {
             var v = parseFloat(map[k]);
             if (isFinite(v)) map[k] = v * 100;
           });
           return true;
         }
         Object.keys(bh).forEach(function (name) {
           if (PORT_CODES.indexOf(name) >= 0) return; /* skip portfolios */
           Object.keys(bh[name] || {}).forEach(function (date) {
             var slot = bh[name][date];
             if (!slot) return;
             if (fixBucketIfDecimal(slot.sectors, 1))   bhChanged = true;
             if (fixBucketIfDecimal(slot.countries, 1)) bhChanged = true;
             if (slot.ratios) {
               PCT_RATIO_KEYS.forEach(function (k) {
                 var v = parseFloat(slot.ratios[k]);
                 if (isFinite(v) && Math.abs(v) > 0 && Math.abs(v) < 0.5) {
                   slot.ratios[k] = v * 100;
                   bhChanged = true;
                 }
               });
               var fp = parseFloat(slot.ratios.fwdPe);
               if (isFinite(fp) && Math.abs(fp) > 0 && Math.abs(fp) < 1) {
                 slot.ratios.fwdPe = fp * 100;
                 bhChanged = true;
               }
             }
           });
         });
         supaUpsert("meta",{key:"cleanup_bench_scale_v3",value:"1"});
       }}catch(e){}
       setBreakdownHistory(bh);
       if(bhChanged)supaUpsert("meta",{key:"breakdownHistory",value:JSON.stringify(bh)});
     }}}catch(e){}     setLoadStatus({companies:coOk,library:libOk});setReady(true);return coOk||libOk;}

  useEffect(function(){
    var done=false,attempts=0;
    var iv=setInterval(async function(){if(done){clearInterval(iv);return;}attempts++;var got=await loadFromStorage();if(got){done=true;clearInterval(iv);}else if(attempts>60){clearInterval(iv);setLoadStatus({companies:0,library:0});setReady(true);}},500);
    return function(){done=true;clearInterval(iv);};
  },[]);

  /* Debounce Supabase writes so rapid edits (typing in an input, ★ toggles, etc.)
     collapse into a single upsert after 500ms of quiet. Each row type has its
     own timer so unrelated writes don't block each other. */
  var DEBOUNCE_MS=500;
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){supaUpsert("library",{id:"shared",data:JSON.stringify(saved)});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[saved,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){supaUpsert("companies",{id:"shared",data:JSON.stringify(companies)});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[companies,ready]);
  useEffect(function(){if(!ready||!lastPriceUpdate)return;var t=setTimeout(function(){supaUpsert("meta",{key:"lastPriceUpdate",value:lastPriceUpdate});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[lastPriceUpdate,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){supaUpsert("meta",{key:"entryComments",value:JSON.stringify(entryComments)});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[entryComments,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){supaUpsert("meta",{key:"annotations",value:JSON.stringify(annotations)});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[annotations,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){supaUpsert("meta",{key:"researchAssignments",value:JSON.stringify(researchAssignments)});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[researchAssignments,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){supaUpsert("meta",{key:"perfData",value:JSON.stringify(perfData)});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[perfData,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){supaUpsert("meta",{key:"feedback",value:JSON.stringify(feedback)});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[feedback,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){supaUpsert("meta",{key:"benchmarkWeights",value:JSON.stringify(benchmarkWeights)});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[benchmarkWeights,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){supaUpsert("meta",{key:"breakdownHistory",value:JSON.stringify(breakdownHistory)});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[breakdownHistory,ready]);

  function addComment(entryId,text){   if(!text.trim())return;   var comment={id:Date.now(),text:text.trim(),author:currentUser||"Unknown",date:todayStr()};   setEntryComments(function(prev){return Object.assign({},prev,{[entryId]:([comment].concat(prev[entryId]||[]))});});   setNewCommentText(function(prev){return Object.assign({},prev,{[entryId]:""});}); }
  function deleteComment(entryId,commentId){   setEntryComments(function(prev){return Object.assign({},prev,{[entryId]:(prev[entryId]||[]).filter(function(c){return c.id!==commentId;})});}); }

  function parseMentions(text){var m=text.match(/@([A-Za-z]+)/g)||[];return m.map(function(x){return x.slice(1);});}
  function addAnnotation(ann){var a=Object.assign({id:(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+"-"+Math.random().toString(36).slice(2)),author:currentUser||"Unknown",date:todayStr(),text:"",mentions:parseMentions(ann.text||""),replies:[],resolved:false,resolvedBy:null,resolvedDate:null,readBy:[currentUser||"Unknown"]},ann);setAnnotations(function(prev){return [a].concat(prev);});return a;}
  function updateAnnotation(id,patch){setAnnotations(function(prev){return prev.map(function(a){if(a.id!==id)return a;var merged=Object.assign({},a,patch);if(patch.text!==undefined)merged.mentions=parseMentions(patch.text);return merged;});});}
  function deleteAnnotation(id){setAnnotations(function(prev){return prev.filter(function(a){return a.id!==id;});});}
  function resolveAnnotation(id){setAnnotations(function(prev){return prev.map(function(a){return a.id===id?Object.assign({},a,{resolved:true,resolvedBy:currentUser||"Unknown",resolvedDate:todayStr()}):a;});});}
  function unresolveAnnotation(id){setAnnotations(function(prev){return prev.map(function(a){return a.id===id?Object.assign({},a,{resolved:false,resolvedBy:null,resolvedDate:null}):a;});});}
  function addReply(annotationId,text){if(!text.trim())return;var reply={id:(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+"-"+Math.random().toString(36).slice(2)),author:currentUser||"Unknown",date:todayStr(),text:text.trim(),mentions:parseMentions(text)};setAnnotations(function(prev){return prev.map(function(a){return a.id===annotationId?Object.assign({},a,{replies:(a.replies||[]).concat([reply]),readBy:[currentUser||"Unknown"]}):a;});});}
  function markAnnotationRead(id){if(!currentUser)return;setAnnotations(function(prev){return prev.map(function(a){if(a.id!==id)return a;var rb=a.readBy||[];if(rb.indexOf(currentUser)>=0)return a;return Object.assign({},a,{readBy:rb.concat([currentUser])});});});}

  function updateCo(id,ch){setCompanies(function(cs){return cs.map(function(c){return c.id===id?Object.assign({},c,ch):c;});});}

  /* Research-board helpers. Members get their own bucket; reorgs is shared. */
  function setResearchSlot(member,category,type,position,companyId){
    setResearchAssignments(function(prev){
      var next=Object.assign({},prev,{byMember:Object.assign({},prev.byMember||{})});
      var mb=Object.assign({},next.byMember[member]||{});
      if(category==="existingHlds"){
        var arr=(mb.existingHlds||[]).slice();while(arr.length<=position)arr.push(null);arr[position]=companyId||null;mb.existingHlds=arr;
      }else{
        var cat=Object.assign({},mb[category]||{primary:[],secondary:[]});
        var list=(cat[type]||[]).slice();while(list.length<=position)list.push(null);list[position]=companyId||null;cat[type]=list;mb[category]=cat;
      }
      next.byMember[member]=mb;
      return next;
    });
  }
  /* Feedback-board mutations. */
  function addFeedback(entry){
    var e=Object.assign({
      id:newId(),
      author:currentUser||"Unknown",
      date:todayStr(),
      type:"improvement",
      area:"",
      text:"",
      resolved:false,
    },entry);
    setFeedback(function(prev){return [e].concat(prev||[]);});
  }
  function updateFeedback(id,patch){
    setFeedback(function(prev){return(prev||[]).map(function(f){return f.id===id?Object.assign({},f,patch):f;});});
  }
  function removeFeedback(id){
    setFeedback(function(prev){return(prev||[]).filter(function(f){return f.id!==id;});});
  }
  function moveFeedback(from,to){
    setFeedback(function(prev){
      var arr=(prev||[]).slice();
      if(from<0||from>=arr.length)return prev;
      if(to<0)to=0;if(to>arr.length-1)to=arr.length-1;
      if(from===to)return prev;
      var moved=arr.splice(from,1)[0];
      arr.splice(to,0,moved);
      return arr;
    });
  }
  /* Performance data mutations. All operate on perfData[portfolio].
     When a series is renamed, the old name is pushed onto its aliases array
     so future bulk uploads that still use the old header still match. */
  function setPerfSeries(portfolio,seriesIndex,patch){
    setPerfData(function(prev){
      var port=Object.assign({series:[],lastMonthEMV:0},prev[portfolio]||{});
      port.series=(port.series||[]).slice();
      var existing=port.series[seriesIndex]||{returns:{}};
      var merged=Object.assign({returns:{}},existing,patch);
      if(patch.name!==undefined&&patch.name!==existing.name&&existing.name){
        var aliases=(existing.aliases||[]).slice();
        if(aliases.indexOf(existing.name)<0)aliases.push(existing.name);
        merged.aliases=aliases;
      }
      port.series[seriesIndex]=merged;
      return Object.assign({},prev,{[portfolio]:port});
    });
  }
  function addPerfSeries(portfolio,series){
    setPerfData(function(prev){
      var port=Object.assign({series:[],lastMonthEMV:0},prev[portfolio]||{});
      port.series=(port.series||[]).concat([Object.assign({name:"New series",role:"competitor",ticker:"",returns:{}},series||{})]);
      return Object.assign({},prev,{[portfolio]:port});
    });
  }
  function movePerfSeries(portfolio,from,to){
    setPerfData(function(prev){
      var port=Object.assign({series:[],lastMonthEMV:0},prev[portfolio]||{});
      var arr=(port.series||[]).slice();
      if(from<0||from>=arr.length)return prev;
      if(to<0)to=0;if(to>arr.length-1)to=arr.length-1;
      if(from===to)return prev;
      var moved=arr.splice(from,1)[0];
      arr.splice(to,0,moved);
      port.series=arr;
      return Object.assign({},prev,{[portfolio]:port});
    });
  }
  /* Group-level display order. Stored on the *primary* portfolio of a group
     (e.g. FIN for Int'l, FGL for Global). The merged view in PerformanceTab
     sorts by this array first, then appends any un-ordered series. */
  function setPerfSeriesOrder(portfolio,orderArr){
    setPerfData(function(prev){
      var port=Object.assign({series:[],lastMonthEMV:0},prev[portfolio]||{});
      port.seriesOrder=(orderArr||[]).slice();
      return Object.assign({},prev,{[portfolio]:port});
    });
  }
  function removePerfSeries(portfolio,seriesIndex){
    setPerfData(function(prev){
      var port=Object.assign({series:[],lastMonthEMV:0},prev[portfolio]||{});
      var existing=(port.series||[]);
      var removed=existing[seriesIndex];
      port.series=existing.filter(function(_,i){return i!==seriesIndex;});
      /* Track the deleted series' name + aliases so the next bulk paste
         doesn't auto-recreate the column. Users were getting duplicate
         FIN / APHKX / etc. on every re-upload because applyPerfBulk
         creates a fresh series for any unknown header. */
      if(removed){
        var ignored=(port.ignoredSeries||[]).slice();
        var names=[removed.name].concat(removed.aliases||[]).filter(Boolean);
        names.forEach(function(n){if(ignored.indexOf(n)<0)ignored.push(n);});
        port.ignoredSeries=ignored;
      }
      return Object.assign({},prev,{[portfolio]:port});
    });
  }
  function setPerfReturn(portfolio,seriesIndex,monthKey,value){
    setPerfData(function(prev){
      var port=Object.assign({series:[],lastMonthEMV:0},prev[portfolio]||{});
      port.series=(port.series||[]).slice();
      var s=Object.assign({returns:{}},port.series[seriesIndex]||{});
      s.returns=Object.assign({},s.returns||{});
      if(value===null||value===undefined||value==="")delete s.returns[monthKey];
      else s.returns[monthKey]=Number(value);
      port.series[seriesIndex]=s;
      return Object.assign({},prev,{[portfolio]:port});
    });
  }
  function setPerfLastMonthEMV(portfolio,value){
    setPerfData(function(prev){
      var port=Object.assign({series:[],lastMonthEMV:0},prev[portfolio]||{});
      port.lastMonthEMV=Number(value)||0;
      return Object.assign({},prev,{[portfolio]:port});
    });
  }
  /* Bulk paste from CSV: given a portfolio + parsed {seriesNames, rows: [{month, values:[]}] },
     merge into existing series (match by name), create any missing. Preserves roles/tickers. */
  function applyPerfBulk(portfolio,parsed){
    setPerfData(function(prev){
      var port=Object.assign({series:[],lastMonthEMV:0},prev[portfolio]||{});
      /* Build lookup: exact name OR any alias → index. */
      var lookup={};
      (port.series||[]).forEach(function(s,i){
        lookup[s.name]=i;
        (s.aliases||[]).forEach(function(a){if(lookup[a]===undefined)lookup[a]=i;});
      });
      /* Names the user explicitly deleted — skip them so paste doesn't
         re-create the same dup series the user just removed. */
      var ignored={};
      (port.ignoredSeries||[]).forEach(function(n){ignored[n]=true;});
      var newSeries=(port.series||[]).slice();
      /* Ensure a slot for each column; map each incoming header → target index.
         Headers in the ignored list get headerIdx=-1 (skipped at write time). */
      var headerIdx={};
      parsed.seriesNames.forEach(function(n){
        if(ignored[n]){
          headerIdx[n]=-1;
        }else if(lookup[n]!==undefined){
          var idx=lookup[n];
          newSeries[idx]=Object.assign({},newSeries[idx],{returns:Object.assign({},newSeries[idx].returns||{})});
          headerIdx[n]=idx;
        }else{
          headerIdx[n]=newSeries.length;
          lookup[n]=newSeries.length;
          newSeries.push({name:n,role:newSeries.length===0?"portfolio":"competitor",ticker:"",returns:{}});
        }
      });
      parsed.rows.forEach(function(row){
        parsed.seriesNames.forEach(function(n,i){
          var v=row.values[i];
          if(v===null||v===undefined||v==="")return;
          var num=Number(v);
          if(isNaN(num))return;
          var idx=headerIdx[n];
          if(idx<0)return;            /* ignored series — skip */
          newSeries[idx].returns[row.month]=num;
        });
      });
      port.series=newSeries;
      return Object.assign({},prev,{[portfolio]:port});
    });
  }
  function setReorgSlot(position,companyId){
    setResearchAssignments(function(prev){
      var arr=(prev.reorgs||[]).slice();while(arr.length<=position)arr.push(null);arr[position]=companyId||null;
      return Object.assign({},prev,{reorgs:arr});
    });
  }

  function newId(){return(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+"-"+Math.random().toString(36).slice(2));}
  /* Target-weight edits: log every meaningful change (|delta|>=0.01%) to portWeightHistory and save the new weight. */
  function updateTargetWeight(companyId,portfolio,rawNewValue){
    /* Compute the delta first (in state-update-safe way), so we can
       shift CASH by the opposite amount to preserve target sum = 100%. */
    var deltaForCash=0;
    setCompanies(function(cs){return cs.map(function(c){
      if(c.id!==companyId)return c;
      var oldRaw=(c.portWeights||{})[portfolio];
      var oldNum=parseFloat(oldRaw);if(isNaN(oldNum))oldNum=0;
      var newNum=parseFloat(rawNewValue);if(isNaN(newNum))newNum=0;
      deltaForCash=newNum-oldNum;
      var nw=Object.assign({},c.portWeights||{});
      nw[portfolio]=rawNewValue===""||rawNewValue===null||rawNewValue===undefined?"":rawNewValue;
      /* Only log if the numeric value actually changed */
      if(Math.abs(oldNum-newNum)<0.01)return Object.assign({},c,{portWeights:nw});
      var entry={id:newId(),date:todayStr(),portfolio:portfolio,oldWeight:oldNum,newWeight:newNum,author:currentUser||"Unknown"};
      var hist=[entry].concat(c.portWeightHistory||[]);
      return Object.assign({},c,{portWeights:nw,portWeightHistory:hist});
    });});
    /* If the target actually changed, shift CASH target by the opposite
       delta so the portfolio's total target stays at 100%. Rounded to 1
       decimal to match the display. Clamped at 0 so CASH never goes
       negative (user can still edit it directly if needed). */
    if(Math.abs(deltaForCash)>=0.01){
      setSpecialWeights(function(prev){
        var next=Object.assign({},prev);
        var cashRow=Object.assign({},next.CASH||{});
        var oldCash=parseFloat(cashRow[portfolio]);if(isNaN(oldCash))oldCash=0;
        var newCash=Math.max(0,Math.round((oldCash-deltaForCash)*10)/10);
        cashRow[portfolio]=newCash;
        next.CASH=cashRow;
        return next;
      });
    }
  }
  /* Manual backfill: add a historical entry without changing current portWeights. */
  function addTargetHistoryEntry(companyId,entry){
    setCompanies(function(cs){return cs.map(function(c){
      if(c.id!==companyId)return c;
      var e=Object.assign({id:newId(),author:currentUser||"Unknown",date:todayStr()},entry);
      var hist=(c.portWeightHistory||[]).concat([e]);
      hist.sort(function(a,b){return(b.date||"").localeCompare(a.date||"");});
      return Object.assign({},c,{portWeightHistory:hist});
    });});
  }
  function deleteTargetHistoryEntry(companyId,entryId){
    setCompanies(function(cs){return cs.map(function(c){
      if(c.id!==companyId)return c;
      return Object.assign({},c,{portWeightHistory:(c.portWeightHistory||[]).filter(function(e){return e.id!==entryId;})});
    });});
  }
  function updateInitiatedDate(companyId,portfolio,date){
    setCompanies(function(cs){return cs.map(function(c){
      if(c.id!==companyId)return c;
      var d=Object.assign({},c.initiatedDates||{});
      if(date)d[portfolio]=date;else delete d[portfolio];
      return Object.assign({},c,{initiatedDates:d});
    });});
  }
  function addTransaction(companyId,tx){
    setCompanies(function(cs){return cs.map(function(c){
      if(c.id!==companyId)return c;
      var shares=parseFloat(tx.shares)||0;
      var e=Object.assign({id:newId(),type:shares>=0?"BUY":"SELL"},tx,{shares:shares});
      var txs=(c.transactions||[]).concat([e]);
      txs.sort(function(a,b){return(b.date||"").localeCompare(a.date||"");});
      return Object.assign({},c,{transactions:txs});
    });});
  }
  function deleteTransaction(companyId,txId){
    setCompanies(function(cs){return cs.map(function(c){
      if(c.id!==companyId)return c;
      return Object.assign({},c,{transactions:(c.transactions||[]).filter(function(t){return t.id!==txId;})});
    });});
  }
  function setTxInitOverride(companyId,txId,override){
    setCompanies(function(cs){return cs.map(function(c){
      if(c.id!==companyId)return c;
      return Object.assign({},c,{transactions:(c.transactions||[]).map(function(t){
        if(t.id!==txId)return t;
        var n=Object.assign({},t);
        if(override===undefined||override===null)delete n.initOverride;else n.initOverride=!!override;
        return n;
      })});
    });});
  }
  /* Toggle whether a transaction was driven by a portfolio cash inflow
     or outflow (client money moving, not a discretionary decision).
     Pass true/false to set; pass null/undefined to clear. */
  function setTxCashFlow(companyId,txId,flag){
    setCompanies(function(cs){return cs.map(function(c){
      if(c.id!==companyId)return c;
      return Object.assign({},c,{transactions:(c.transactions||[]).map(function(t){
        if(t.id!==txId)return t;
        var n=Object.assign({},t);
        if(flag===undefined||flag===null)delete n.cashFlow;else n.cashFlow=!!flag;
        return n;
      })});
    });});
  }

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
    benchmarkWeights,setBenchmarkWeights,
    breakdownHistory,setBreakdownHistory,
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
    annotations,setAnnotations,
    addAnnotation,updateAnnotation,deleteAnnotation,resolveAnnotation,unresolveAnnotation,addReply,markAnnotationRead,parseMentions,
    updateTargetWeight,addTargetHistoryEntry,deleteTargetHistoryEntry,
    addTransaction,deleteTransaction,setTxInitOverride,setTxCashFlow,updateInitiatedDate,
    researchAssignments,setResearchAssignments,setResearchSlot,setReorgSlot,
    perfData,setPerfData,setPerfSeries,addPerfSeries,removePerfSeries,movePerfSeries,setPerfSeriesOrder,setPerfReturn,setPerfLastMonthEMV,applyPerfBulk,
    feedback,setFeedback,addFeedback,updateFeedback,removeFeedback,moveFeedback,
    marketsSnapshot,setMarketsSnapshot,marketsStatus,ensureMarketsSnapshot,
    alertRules,setAlertRules,
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyContext(){
  var ctx=useContext(CompanyContext);
  if(!ctx)throw new Error("useCompanyContext must be used within CompanyProvider");
  return ctx;
}
