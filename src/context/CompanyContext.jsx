import { createContext, useContext, useState, useEffect, useRef } from "react";
import { supaGet, supaGetAll, supaUpsert, supaDelete } from '../api/index.js';
import { todayStr } from '../utils/index.js';
import { DEFAULT_PERF_SERIES, findDefaultSeries } from '../constants/perfDefaults.js';

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
  /* True when the initial supabase load gave up after retries with no
     data ever loaded. Distinct from "loaded successfully but empty".
     Used to block the editing UI so user edits don't drop into an empty
     companies array (which would silently no-op cs.map() updates and
     lose data on the next refresh). */
  const [loadFailed,setLoadFailed]=useState(false);
  const [lastPriceUpdate,setLastPriceUpdate]=useState(null);
  /* Who ran the most recent price update. Mirrors calLastUpdatedBy /
     repLastUpdated patterns. Empty string when unknown (e.g. updated
     via a script that didn't set the user). */
  const [lastPriceUpdatedBy,setLastPriceUpdatedBy]=useState("");
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
  /* TP-change approval queue. Flat list stored under meta.tpApprovals,
     loaded/auto-saved like annotations. Each record represents a
     suggested change to a company's TP inputs (PE and/or EPS) plus
     its eventual disposition. Status flows: pending → approved | rejected.
     Approver must differ from suggester (enforced in the UI). Approved
     entries are KEPT for audit — they're how we tell who signed off on
     a TP change historically. Shape:
       { id, companyId,
         suggestedBy, suggestedAt, rationale,
         fromPE, fromEPS, fromTP,
         toPE, toEPS, toTP,
         earningsEntryId,            // optional link back to earnings
         status: "pending" | "approved" | "rejected",
         approvedBy, approvedAt,
         rejectedBy, rejectedAt, rejectReason,
         readBy:[users] }            // for the unread/mention pattern */
  const [tpApprovals,setTpApprovals]=useState([]);
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
  /* PM Meeting Memo log: snapshots of every memo that was distributed
     via the "Clear agenda (mark executed)" button. Lets users refer
     back to what was sent at each prior IC meeting.
     Shape: [{ id, date, profile:"tuesday"|"thursday", author, memo }]
     Order: newest first (matches feedback/annotations convention). */
  const [memoLog,setMemoLog]=useState([]);
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

  async function loadFromStorage(){
    setLoadStatus({companies:null,library:null});
    var coOk=false,libOk=false;
    /* Fan out all 15 reads in parallel — they're independent and were
       previously awaited serially, adding 15× per-call latency on cold
       start. Wrap each in a try so a single failure doesn't block the
       rest, and let Promise.all return the array. */
    var safe=function(p){return p.then(function(r){return r;},function(){return null;});};
    var [r,r2,r3,r4,r5,r6,r7,r8,r9,r10,r11,r12,r13,r14,r15,r16,r17]=await Promise.all([
      safe(supaGet("library","id","shared")),
      /* Companies are now stored as one Supabase row per company (each
         row's data column holds a single company JSON, ~30KB typical).
         Pull every row in one request and parse each. The legacy "shared"
         row containing the whole array is migrated below. */
      safe(supaGetAll("companies")),
      safe(supaGet("meta","key","lastPriceUpdate")),
      safe(supaGet("meta","key","entryComments")),
      safe(supaGet("meta","key","calLastUpdated")),
      safe(supaGet("meta","key","repData")),
      safe(supaGet("meta","key","fxRates")),
      safe(supaGet("meta","key","specialWeights")),
      safe(supaGet("meta","key","annotations")),
      safe(supaGet("meta","key","researchAssignments")),
      safe(supaGet("meta","key","perfData")),
      safe(supaGet("meta","key","feedback")),
      safe(supaGet("meta","key","benchmarkWeights")),
      safe(supaGet("meta","key","alertRules")),
      safe(supaGet("meta","key","breakdownHistory")),
      safe(supaGet("meta","key","tpApprovals")),
      safe(supaGet("meta","key","memoLog")),
    ]);
    try{if(r){var d=JSON.parse(r.data);if(Array.isArray(d)&&d.length){var libMig=migrateTags(d);setSaved(libMig.data);libOk=libMig.data.length;if(libMig.changed)supaUpsert("library",{id:"shared",data:JSON.stringify(libMig.data)});}}}catch(e){}
    try{if(r2&&Array.isArray(r2)){
      /* Two formats coexist during migration:
         1. New (per-row): each row has id=company.id, data=JSON of one
            company. Filter out any "shared" row, parse the rest.
         2. Legacy (single blob): one row with id="shared", data=JSON of
            the full array. Parse it, then migrate by upserting each
            company as its own row and deleting the shared row. */
      var perCo = r2.filter(function(row){ return row.id !== "shared"; });
      var sharedRow = r2.find(function(row){ return row.id === "shared"; });
      var loadedArr = null;
      if (perCo.length > 0) {
        loadedArr = perCo.map(function(row){
          try { return JSON.parse(row.data); } catch(_e) { return null; }
        }).filter(Boolean);
      } else if (sharedRow) {
        try {
          var parsed = JSON.parse(sharedRow.data);
          if (Array.isArray(parsed) && parsed.length) loadedArr = parsed;
        } catch(_e) {}
      }
      if (loadedArr && loadedArr.length) {
        var coMig=migratePortfolioKeys(loadedArr);
        /* One-shot: blank out tpChange="Unchanged" on earnings entries
           that were clearly never reviewed. Old blankEarnings defaulted
           tpChange to "Unchanged" before the new default ("") landed —
           which meant entries the analyst hadn't touched still claimed
           a TP disposition. Criterion is conservative: ALL of
           shortTakeaway, extendedTakeaway, tpRationale, thesisNote, and
           every bullet must be empty. If those are empty AND tpChange
           happens to be "Unchanged", that's the auto-default never
           edited. Reviewed-but-uneventful entries (someone actively
           set Unchanged with notes) are preserved. Gated by a meta
           flag so it runs exactly once. */
        try{
          var rTpFlag=await supaGet("meta","key","cleanup_blank_tpchange_2026_05_14");
          if(!(rTpFlag&&rTpFlag.value)){
            var tpChanged=false;
            coMig.data.forEach(function(c){
              var es=c.earningsEntries;
              if(!es||!es.length)return;
              es.forEach(function(e){
                if(e.tpChange!=="Unchanged")return;
                var allEmpty = !(e.shortTakeaway||"").trim()
                  && !(e.extendedTakeaway||"").trim()
                  && !(e.tpRationale||"").trim()
                  && !(e.thesisNote||"").trim()
                  && !(e.bullets||[]).some(function(b){return (b||"").trim();});
                if(allEmpty){
                  e.tpChange="";
                  tpChanged=true;
                }
              });
            });
            if(tpChanged){
              coMig.changed=true; /* triggers the bulk re-upsert below */
            }
            supaUpsert("meta",{key:"cleanup_blank_tpchange_2026_05_14",value:"1"});
          }
        }catch(_e){}
        /* Twin migration for thesisStatus: same conservative criterion
           (all content fields empty AND the value is the old auto-default
           "On track"). Reviewed-but-positive entries — anyone who
           actively set 'On track' with notes — stay put. Gated by its
           own flag since the tpChange migration may have already run. */
        try{
          var rTsFlag=await supaGet("meta","key","cleanup_blank_thesisstatus_2026_05_14");
          if(!(rTsFlag&&rTsFlag.value)){
            var tsChanged=false;
            coMig.data.forEach(function(c){
              var es=c.earningsEntries;
              if(!es||!es.length)return;
              es.forEach(function(e){
                if(e.thesisStatus!=="On track")return;
                var allEmpty = !(e.shortTakeaway||"").trim()
                  && !(e.extendedTakeaway||"").trim()
                  && !(e.tpRationale||"").trim()
                  && !(e.thesisNote||"").trim()
                  && !(e.bullets||[]).some(function(b){return (b||"").trim();});
                if(allEmpty){
                  e.thesisStatus="";
                  tsChanged=true;
                }
              });
            });
            if(tsChanged){
              coMig.changed=true;
            }
            supaUpsert("meta",{key:"cleanup_blank_thesisstatus_2026_05_14",value:"1"});
          }
        }catch(_e){}
        /* Duplicate upcoming-earnings cleanup. The factset_pull script
           creates a new earnings entry whenever the next-report date
           changes (e.g. FactSet revises 7/29 → 7/30). Result: two or
           more future entries for the same quarter, all consensus-only,
           none reviewed. Keep the latest-dated one per (companyId,
           quarter) for uneditedfuture entries and drop the rest. Idempotent
           — only touches entries that look like duplicates (no
           shortTakeaway/extendedTakeaway/tpRationale/thesisNote/bullets
           and reportDate in the future). */
        try {
          var todayIso = todayStr();
          var dupChanged = false;
          coMig.data.forEach(function(c){
            var es = c.earningsEntries || [];
            if (es.length < 2) return;
            /* Group future-unreviewed entries by quarter. Reviewed ones
               (with any analyst content) are NEVER dropped. */
            var unreviewedFuture = es.filter(function(e){
              if (!e || !e.reportDate) return false;
              if (e.reportDate <= todayIso) return false;
              var hasContent = (e.shortTakeaway||"").trim()
                || (e.extendedTakeaway||"").trim()
                || (e.tpRationale||"").trim()
                || (e.thesisNote||"").trim()
                || (e.bullets||[]).some(function(b){return(b||"").trim();});
              return !hasContent;
            });
            if (unreviewedFuture.length < 2) return;
            /* Group by quarter (entries without quarter use a single
               bucket so we still dedupe "quarter-less" upcoming entries). */
            var byQ = {};
            unreviewedFuture.forEach(function(e){
              var q = e.quarter || "_noquarter";
              (byQ[q] = byQ[q] || []).push(e);
            });
            /* For each quarter with 2+ candidates, keep the one with the
               LATEST reportDate; mark the rest for removal. */
            var toRemove = {};
            Object.keys(byQ).forEach(function(q){
              var arr = byQ[q];
              if (arr.length < 2) return;
              arr.sort(function(a,b){return (b.reportDate||"").localeCompare(a.reportDate||"");});
              for (var k = 1; k < arr.length; k++) toRemove[arr[k].id] = true;
            });
            if (Object.keys(toRemove).length === 0) return;
            c.earningsEntries = es.filter(function(e){return !toRemove[e.id];});
            dupChanged = true;
          });
          if (dupChanged) coMig.changed = true;
        } catch(_e){}
        setCompanies(coMig.data);
        coOk=coMig.data.length;
        /* If we read from the legacy "shared" row, write each company
           as its own row and then delete the legacy row. Done as a
           single bulk upsert + one DELETE; idempotent if interrupted
           since per-row writes will just overwrite next time. */
        if (sharedRow && perCo.length === 0) {
          var bulk = coMig.data.map(function(c){
            return { id: c.id, data: JSON.stringify(c) };
          });
          supaUpsert("companies", bulk).then(function(){
            supaDelete("companies", "id", "shared");
          });
        } else if (coMig.changed) {
          /* Migration pass touched data — re-upsert in 50-row chunks
             so a single 325-row JSON payload can't trip Postgres's
             statement_timeout the way it did in May 2026. Bulk upsert
             is safe to over-write; PostgREST handles ON CONFLICT per row. */
          var bulk2 = coMig.data.map(function(c){
            return { id: c.id, data: JSON.stringify(c) };
          });
          var CHUNK2=50;
          for(var ii2=0; ii2<bulk2.length; ii2+=CHUNK2){
            supaUpsert("companies", bulk2.slice(ii2, ii2+CHUNK2));
          }
        }
      }
    }}catch(e){}
    try{if(r3){
      /* Format on disk: "<user> at <timestamp>" or just "<timestamp>"
         for backward compat with values written before the by-user
         field existed. Mirrors calLastUpdated parsing. */
      var raw=r3.value||"";
      var parts=raw.split(" at ");
      if(parts.length>=2){setLastPriceUpdatedBy(parts[0]||"");setLastPriceUpdate(parts[1]||"");}
      else{setLastPriceUpdate(raw);}
    }}catch(e){}
    try{if(r4)setEntryComments(JSON.parse(r4.value));}catch(e){}
    try{if(r5&&r5.value){var parts=r5.value.split(" at ");setCalLastUpdatedBy(parts[0]||"");setCalLastUpdated(parts[1]||"");}}catch(e){}
    try{if(r6&&r6.value){var rdRaw=JSON.parse(r6.value);var rdMig=migrateRepData(rdRaw);setRepData(rdMig.data);if(rdMig.changed)supaUpsert("meta",{key:"repData",value:JSON.stringify(rdMig.data)});}}catch(e){}
    try{if(r7&&r7.value)setFxRates(JSON.parse(r7.value));}catch(e){}
    try{if(r8&&r8.value){var swRaw=JSON.parse(r8.value);var swMig=migrateSpecialWeights(swRaw);setSpecialWeights(swMig.data);if(swMig.changed)supaUpsert("meta",{key:"specialWeights",value:JSON.stringify(swMig.data)});}}catch(e){}
    try{if(r9&&r9.value){var ann=JSON.parse(r9.value);if(Array.isArray(ann))setAnnotations(ann);}}catch(e){}
    try{if(r16&&r16.value){var tpa=JSON.parse(r16.value);if(Array.isArray(tpa))setTpApprovals(tpa);}}catch(e){}
    try{if(r17&&r17.value){var ml=JSON.parse(r17.value);if(Array.isArray(ml))setMemoLog(ml);}}catch(e){}
    try{if(r10&&r10.value){var ra=JSON.parse(r10.value);if(ra&&typeof ra==="object"){if(!ra.byMember)ra.byMember={};if(!Array.isArray(ra.reorgs))ra.reorgs=[];/* Migrate legacy category keys: gbl→gl, intl→in, intSmall→sc */var RA_RENAMES={gbl:"gl",intl:"in",intSmall:"sc"};var raChanged=false;Object.keys(ra.byMember).forEach(function(m){var mb=ra.byMember[m]||{};Object.keys(RA_RENAMES).forEach(function(oldK){if(mb[oldK]!==undefined){mb[RA_RENAMES[oldK]]=mb[oldK];delete mb[oldK];raChanged=true;}});ra.byMember[m]=mb;});setResearchAssignments(ra);if(raChanged)supaUpsert("meta",{key:"researchAssignments",value:JSON.stringify(ra)});}}}catch(e){}
    try{if(r11&&r11.value){var pd=JSON.parse(r11.value);if(pd&&typeof pd==="object")setPerfData(pd);}}catch(e){}
    try{if(r12&&r12.value){var fb=JSON.parse(r12.value);if(Array.isArray(fb))setFeedback(fb);}}catch(e){}
    try{if(r13&&r13.value){var bw=JSON.parse(r13.value);if(bw&&typeof bw==="object")setBenchmarkWeights(bw);}}catch(e){}
    try{if(r14&&r14.value){var ar=JSON.parse(r14.value);if(ar&&typeof ar==="object")setAlertRules(ar);}}catch(e){}
    try{if(r15&&r15.value){var bh=JSON.parse(r15.value);if(bh&&typeof bh==="object"){
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
       try{var rFlag4=await supaGet("meta","key","cleanup_bench_fwdpe_v4");if(!(rFlag4&&rFlag4.value)){
         /* Re-run the fwdPe ×100 fix one more time. The user re-uploaded
            after v3 ran (which set the flag and exited) and the new
            data was again in decimal form. Idempotent: if value >= 1
            it's already correct and we skip. */
         Object.keys(bh).forEach(function (name) {
           Object.keys(bh[name] || {}).forEach(function (date) {
             var slot = bh[name][date];
             if (!slot || !slot.ratios) return;
             var fp = parseFloat(slot.ratios.fwdPe);
             if (isFinite(fp) && Math.abs(fp) > 0 && Math.abs(fp) < 1) {
               slot.ratios.fwdPe = fp * 100;
               bhChanged = true;
             }
           });
         });
         supaUpsert("meta",{key:"cleanup_bench_fwdpe_v4",value:"1"});
       }}catch(e){}
       setBreakdownHistory(bh);
       if(bhChanged)supaUpsert("meta",{key:"breakdownHistory",value:JSON.stringify(bh)});
     }}}catch(e){}     setLoadStatus({companies:coOk,library:libOk});setReady(true);return coOk||libOk;}

  useEffect(function(){
    /* Sequential retry pattern. Earlier this was a setInterval at 500ms,
       which on mobile cellular fired multiple loadFromStorage calls
       before the first finished — each making 15 Supabase requests in
       parallel. With ~3s loads on a phone, you'd have 60+ concurrent
       requests competing for bandwidth, making everything much slower.
       Now: call once, wait for completion, only retry on failure. */
    var cancelled = false;
    var attempts = 0;
    function attempt() {
      if (cancelled) return;
      attempts++;
      loadFromStorage().then(function (got) {
        if (cancelled) return;
        if (got) return; /* success — done */
        if (attempts >= 60) {
          /* Exhausted retries with no data — flag loadFailed so the app
             shows a blocking banner instead of an editable empty state. */
          setLoadStatus({ companies: 0, library: 0 });
          setLoadFailed(true);
          setReady(true);
          return;
        }
        setTimeout(attempt, 1000);
      }).catch(function () {
        if (cancelled) return;
        if (attempts >= 60) {
          /* Exhausted retries with no data — flag loadFailed so the app
             shows a blocking banner instead of an editable empty state. */
          setLoadStatus({ companies: 0, library: 0 });
          setLoadFailed(true);
          setReady(true);
          return;
        }
        setTimeout(attempt, 1000);
      });
    }
    attempt();
    return function () { cancelled = true; };
  },[]);

  /* Debounce Supabase writes so rapid edits (typing in an input, ★ toggles, etc.)
     collapse into a single upsert after the debounce window of quiet.
     Each row type has its own timer so unrelated writes don't block each other.
     Heaviest payloads (companies, breakdownHistory) get a longer debounce —
     fewer round-trips during a burst of edits.

     A small per-key serialization cache (lastSentRef) skips the upsert
     entirely when the new JSON is byte-equal to what we already sent.
     This catches the surprisingly-common case of an effect firing without
     a real content change (e.g. setCompanies(prev => prev) or React 18
     strict-mode double-fires) and saves a 1-2MB JSON.stringify + network
     round trip for the companies payload. */
  var DEBOUNCE_MS=500;
  var DEBOUNCE_HEAVY_MS=1500;
  var lastSentRef=useRef({});
  /* Save-status tracking. Counts in-flight writes ("saving"), failed
     writes that have exhausted retries ("failed"), and tracks the last
     successful write timestamp. Exposed via context so the header can
     show a small badge — green when all saved, amber when a write is
     in progress, red with count when writes have failed permanently.
     Critical because previously a transient fetch failure on the
     auto-save effect silently dropped the write — local state showed
     the edit but Supabase never got it, and the user only discovered
     the data loss the next day. */
  const [saveStatus,setSaveStatus]=useState({pending:0,failed:0,lastSavedAt:null,lastFailedAt:null});
  /* Wraps supaUpsert with retry (3 attempts, exponential backoff) and
     status accounting. Returns a promise that resolves on success and
     rejects on final failure. Callers MUST chain a .then() that updates
     their lastSentRef ONLY after success — otherwise a failed write
     would mark the data as "sent" and the next auto-save tick wouldn't
     retry, losing the edit permanently. */
  function safeUpsert(table, payload){
    setSaveStatus(function(s){return Object.assign({},s,{pending:s.pending+1});});
    var attempt = 0;
    function tryOnce(){
      return supaUpsert(table, payload).then(function(r){
        if(r && r.ok) return r;
        throw new Error("HTTP " + (r && r.status));
      });
    }
    function withRetry(){
      return tryOnce().catch(function(err){
        attempt++;
        if(attempt >= 3) throw err;
        var delay = 1000 * Math.pow(3, attempt - 1); /* 1s, 3s */
        return new Promise(function(res){setTimeout(res, delay);}).then(withRetry);
      });
    }
    return withRetry()
      .then(function(r){
        setSaveStatus(function(s){return Object.assign({},s,{
          pending: Math.max(0, s.pending - 1),
          lastSavedAt: Date.now(),
        });});
        return r;
      })
      .catch(function(err){
        /* eslint-disable no-console */
        console.warn("safeUpsert failed after retries", table, err);
        /* eslint-enable no-console */
        setSaveStatus(function(s){return Object.assign({},s,{
          pending: Math.max(0, s.pending - 1),
          failed: s.failed + 1,
          lastFailedAt: Date.now(),
        });});
        throw err;
      });
  }
  /* Per-company write tracking. Holds last-sent JSON keyed by company id.
     Declared up here (not next to the per-company effect) so the
     ready-snapshot below can populate it — otherwise the first auto-save
     tick sees every company as "changed" and bulk-uploads all 325, which
     timed out the Postgres statement-timeout in May 2026 and put the
     whole project into 'unhealthy'. */
  var lastSentCompaniesRef = useRef({});
  /* Convenience wrapper for the meta-blob auto-save pattern. Skips
     the write when the value matches the last SUCCESSFULLY-sent one,
     calls safeUpsert (which retries 3x), and updates lastSentRef
     INSIDE the .then() so a failed write does NOT mark the data as
     sent — the next tick will see ref != state and retry. Previously
     each effect set lastSentRef BEFORE the network completed, which
     meant a transient failure silently dropped the write and the
     user only discovered the data loss the next day. */
  function autoSendBlob(key, jsonStr, table, payload){
    if(lastSentRef.current[key] === jsonStr) return;
    safeUpsert(table, payload).then(function(){
      lastSentRef.current[key] = jsonStr;
    }).catch(function(){
      /* lastSentRef NOT updated; next debounce tick retries. */
    });
  }
  /* Legacy helper kept for callers I haven't migrated yet. Sets the
     ref BEFORE the write completes — risky on failure. New code should
     use autoSendBlob() instead. */
  function sendIfChanged(key, fn){
    var json=fn();
    if(lastSentRef.current[key]===json)return false;
    lastSentRef.current[key]=json;
    return true;
  }
  /* One-shot snapshot on ready=true. Without this, a transiently-failed
     fetch (supaGet returns null on network blips or 5xx, indistinguishable
     from a missing row) leaves state at its empty initial. Then the
     auto-save effects below fire, see state !== lastSentRef (which is
     undefined), and upload the empty initial OVER the real data in
     Supabase. This snapshot captures whatever state landed after load,
     so the first auto-save tick compares equal and skips. Critical for
     perfData (reported lost), breakdownHistory (heavy), benchmarkWeights,
     annotations, feedback, researchAssignments, entryComments, alertRules,
     fxRates, repData, specialWeights, lastPriceUpdate. */
  useEffect(function(){
    if (!ready) return;
    lastSentRef.current = Object.assign({}, lastSentRef.current, {
      library:              JSON.stringify(saved),
      perfData:             JSON.stringify(perfData),
      breakdownHistory:     JSON.stringify(breakdownHistory),
      benchmarkWeights:     JSON.stringify(benchmarkWeights),
      annotations:          JSON.stringify(annotations),
      tpApprovals:          JSON.stringify(tpApprovals),
      feedback:             JSON.stringify(feedback),
      memoLog:              JSON.stringify(memoLog),
      researchAssignments:  JSON.stringify(researchAssignments),
      entryComments:        JSON.stringify(entryComments),
      alertRules:           JSON.stringify(alertRules),
      fxRates:              JSON.stringify(fxRates),
      repData:              JSON.stringify(repData),
      specialWeights:       JSON.stringify(specialWeights),
      lastPriceUpdate:      lastPriceUpdate || "",
    });
    /* Critical: also snapshot per-company JSON. Without this, the first
       auto-save tick sees every company as "changed" (the ref is empty
       on mount), and the resulting 325-row bulk upsert times out
       Postgres's statement_timeout. That hammers the DB so badly the
       project's Supabase status goes 'unhealthy'. */
    var byId={};
    (companies||[]).forEach(function(c){
      if(c&&c.id)byId[c.id]=JSON.stringify(c);
    });
    lastSentCompaniesRef.current = byId;
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(saved);autoSendBlob("library",j,"library",{id:"shared",data:j});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[saved,ready]);
  /* Per-company auto-save. The ref is declared above (so the ready
     snapshot can populate it). On each debounce we diff the current
     companies array against the ref, bulk-upsert the changed rows,
     and DELETE any ids that disappeared from the array. */
  useEffect(function(){
    if(!ready)return;
    var t=setTimeout(function(){
      var changed=[];
      var seenIds={};
      (companies||[]).forEach(function(c){
        if(!c||!c.id)return;
        seenIds[c.id]=true;
        var j=JSON.stringify(c);
        if(lastSentCompaniesRef.current[c.id]!==j){
          /* CRITICAL: do NOT update lastSentCompaniesRef here. A failed
             write would leave the ref claiming "sent" and the next tick
             would skip the retry, silently losing the edit (this is
             exactly what bit four companies in May 2026 — user typed
             thesis/valuation/earnings, the writes failed transiently,
             nothing reached Supabase). The ref gets updated INSIDE
             safeUpsert's .then() below, only after the chunk has
             actually committed. */
          changed.push({id:c.id,data:j});
        }
      });
      var deletedIds=Object.keys(lastSentCompaniesRef.current).filter(function(id){return !seenIds[id];});
      if(changed.length>0){
        /* Chunk large bulk upserts. A single 325-row upsert serializes
           ~10 MB of JSON, which routinely takes 10+ seconds on Supabase
           Free/Pro and trips Postgres's statement_timeout. Chunks of 50
           comfortably finish in well under a second each. safeUpsert
           retries 3x with exponential backoff and accounts the result
           into saveStatus (visible in the header). On success the chunk's
           rows get added to lastSentCompaniesRef; on failure they don't,
           so the next debounce tick retries the same rows. */
        var CHUNK=50;
        for(var i=0;i<changed.length;i+=CHUNK){
          (function(chunk){
            safeUpsert("companies", chunk).then(function(){
              chunk.forEach(function(row){
                lastSentCompaniesRef.current[row.id] = row.data;
              });
            }).catch(function(){
              /* lastSentCompaniesRef NOT updated — next tick retries. */
            });
          })(changed.slice(i, i+CHUNK));
        }
      }
      deletedIds.forEach(function(id){
        supaDelete("companies","id",id);
        delete lastSentCompaniesRef.current[id];
      });
    },DEBOUNCE_HEAVY_MS);
    return function(){clearTimeout(t);};
  },[companies,ready]);
  useEffect(function(){if(!ready||!lastPriceUpdate)return;var t=setTimeout(function(){autoSendBlob("lastPriceUpdate",lastPriceUpdate,"meta",{key:"lastPriceUpdate",value:lastPriceUpdate});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[lastPriceUpdate,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(entryComments);autoSendBlob("entryComments",j,"meta",{key:"entryComments",value:j});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[entryComments,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(annotations);autoSendBlob("annotations",j,"meta",{key:"annotations",value:j});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[annotations,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(tpApprovals);autoSendBlob("tpApprovals",j,"meta",{key:"tpApprovals",value:j});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[tpApprovals,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(researchAssignments);autoSendBlob("researchAssignments",j,"meta",{key:"researchAssignments",value:j});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[researchAssignments,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(perfData);autoSendBlob("perfData",j,"meta",{key:"perfData",value:j});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[perfData,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(feedback);autoSendBlob("feedback",j,"meta",{key:"feedback",value:j});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[feedback,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(memoLog);autoSendBlob("memoLog",j,"meta",{key:"memoLog",value:j});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[memoLog,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(benchmarkWeights);autoSendBlob("benchmarkWeights",j,"meta",{key:"benchmarkWeights",value:j});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[benchmarkWeights,ready]);
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(breakdownHistory);autoSendBlob("breakdownHistory",j,"meta",{key:"breakdownHistory",value:j});},DEBOUNCE_HEAVY_MS);return function(){clearTimeout(t);};},[breakdownHistory,ready]);

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

  /* TP approval helpers. Mirror the annotation API (add/update/resolve)
     but with the extra constraint that approvers must differ from the
     submitter — enforced at the call site (the UI hides the Approve
     button when suggestedBy === currentUser) and again here as a hard
     guard so a programmatic caller can't bypass it. */
  function newId(){return (typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+"-"+Math.random().toString(36).slice(2));}
  function submitTpApproval(payload){
    /* payload: { companyId, fromPE, fromEPS, fromTP, toPE, toEPS, toTP,
                  rationale, earningsEntryId? }
       Adds a new pending record. Multiple pending records per company
       are allowed — the approver picks one, which auto-rejects siblings
       (see approveTpApproval below). */
    var rec=Object.assign({
      id:newId(),
      suggestedBy:currentUser||"Unknown",
      suggestedAt:todayStr(),
      status:"pending",
      readBy:[currentUser||"Unknown"],
    },payload);
    setTpApprovals(function(prev){return [rec].concat(prev);});
    return rec;
  }
  function approveTpApproval(id){
    if(!currentUser)return;
    var rec=null;
    setTpApprovals(function(prev){
      rec=prev.find(function(a){return a.id===id;});
      if(!rec||rec.status!=="pending"||rec.suggestedBy===currentUser)return prev;
      var approvedAt=todayStr();
      return prev.map(function(a){
        /* Approve the target. Sibling pending records on the SAME company
           get auto-rejected so a stale change can't sneak in later. */
        if(a.id===id)return Object.assign({},a,{status:"approved",approvedBy:currentUser,approvedAt:approvedAt});
        if(a.status==="pending"&&a.companyId===rec.companyId){
          return Object.assign({},a,{status:"rejected",rejectedBy:currentUser,rejectedAt:approvedAt,rejectReason:"Superseded by another approval"});
        }
        return a;
      });
    });
    /* Apply the change to the company's valuation + push to tpHistory. */
    if(!rec||rec.status!=="pending"||rec.suggestedBy===currentUser)return;
    setCompanies(function(cs){
      return cs.map(function(c){
        if(c.id!==rec.companyId)return c;
        var v=Object.assign({},c.valuation||{});
        /* Write every breakdown field the suggestion specifies. The
           submission form captures the full PE+EPS1+EPS2+W1+W2 shape
           the rest of the app uses, so approval can apply it verbatim
           without back-solving anything. Older records (pre-breakdown
           expansion) only have toPE/toEPS — handle both for back-compat. */
        if(rec.toPE!==null&&rec.toPE!==undefined&&rec.toPE!=="")v.pe=rec.toPE;
        if(rec.toEPS1!==null&&rec.toEPS1!==undefined&&rec.toEPS1!=="")v.eps1=rec.toEPS1;
        else if(rec.toEPS!==null&&rec.toEPS!==undefined&&rec.toEPS!=="")v.eps1=rec.toEPS;
        if(rec.toEPS2!==null&&rec.toEPS2!==undefined&&rec.toEPS2!=="")v.eps2=rec.toEPS2;
        if(rec.toW1!==null&&rec.toW1!==undefined&&rec.toW1!=="")v.w1=rec.toW1;
        if(rec.toW2!==null&&rec.toW2!==undefined&&rec.toW2!=="")v.w2=rec.toW2;
        var tpEntry={
          date:todayStr(),
          tp:rec.toTP,
          pe:rec.toPE,
          eps:rec.toEPS,
          eps1:rec.toEPS1,
          eps2:rec.toEPS2,
          w1:rec.toW1,
          w2:rec.toW2,
          currency:(c.valuation&&c.valuation.currency)||"USD",
          source:"approval",
          by:rec.suggestedBy,
          approvedBy:currentUser,
          rationale:rec.rationale||"",
        };
        return Object.assign({},c,{
          valuation:v,
          tpHistory:[tpEntry].concat(c.tpHistory||[]),
          lastUpdated:todayStr(),
        });
      });
    });
  }
  function rejectTpApproval(id,reason){
    if(!currentUser)return;
    setTpApprovals(function(prev){
      return prev.map(function(a){
        if(a.id!==id||a.status!=="pending"||a.suggestedBy===currentUser)return a;
        return Object.assign({},a,{status:"rejected",rejectedBy:currentUser,rejectedAt:todayStr(),rejectReason:reason||""});
      });
    });
  }
  /* Withdraw your OWN pending suggestion. Only the suggester can call
     this. Deletes the record outright — withdrawn-by-author isn't audit-
     interesting (nothing was ever approved, nothing peer-reviewed), so
     keeping it would just clutter the Decided list. Peer rejections,
     by contrast, stay in Decided as a real audit trail. */
  function withdrawTpApproval(id){
    if(!currentUser)return;
    setTpApprovals(function(prev){
      return prev.filter(function(a){
        return !(a.id===id&&a.status==="pending"&&a.suggestedBy===currentUser);
      });
    });
  }
  function markTpApprovalRead(id){
    if(!currentUser)return;
    setTpApprovals(function(prev){return prev.map(function(a){if(a.id!==id)return a;var rb=a.readBy||[];if(rb.indexOf(currentUser)>=0)return a;return Object.assign({},a,{readBy:rb.concat([currentUser])});});});
  }

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
  /* Memo log mutations. Append-only from the UI side (snapshot saved
     when "Clear agenda" runs); delete is the only edit path. Stored
     newest-first, mirroring feedback/annotations. */
  function addMemoLog(entry){
    var e=Object.assign({
      id:newId(),
      date:todayStr(),
      author:currentUser||"Unknown",
      profile:"",
      memo:"",
    },entry);
    setMemoLog(function(prev){return [e].concat(prev||[]);});
  }
  function deleteMemoLog(id){
    setMemoLog(function(prev){return(prev||[]).filter(function(e){return e.id!==id;});});
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
      /* Build lookup: exact name OR ticker OR any alias → index. Ticker
         matching is critical because users typically rename series for
         display ("Russell 1000 Growth") but their CSV column headers
         stay as the FactSet ticker ("IWF"). Without ticker matching,
         every re-upload creates duplicate competitor rows with
         ticker-as-name, while the original series go stale. */
      var lookup={};
      (port.series||[]).forEach(function(s,i){
        if(s.name)lookup[s.name]=i;
        if(s.name)lookup[s.name.toUpperCase()]=i;
        if(s.ticker&&lookup[s.ticker]===undefined)lookup[s.ticker]=i;
        if(s.ticker&&lookup[s.ticker.toUpperCase()]===undefined)lookup[s.ticker.toUpperCase()]=i;
        (s.aliases||[]).forEach(function(a){
          if(a&&lookup[a]===undefined)lookup[a]=i;
          if(a&&lookup[a.toUpperCase()]===undefined)lookup[a.toUpperCase()]=i;
        });
        /* Also index by DEFAULT-known aliases/ticker/name for this portfolio,
           so a CSV header like "MS899901" matches an existing series whose
           stored name is "ACWI ex US" even when no alias has been recorded
           yet. This is what makes the defaults map work as a "shared brain"
           — every known synonym points at the same series. */
        var defForExisting=findDefaultSeries(portfolio,s.name)||findDefaultSeries(portfolio,s.ticker);
        if(defForExisting){
          var keys=[defForExisting.name,defForExisting.ticker].concat(defForExisting.aliases||[]);
          keys.forEach(function(k){
            if(!k)return;
            if(lookup[k]===undefined)lookup[k]=i;
            if(lookup[k.toUpperCase()]===undefined)lookup[k.toUpperCase()]=i;
          });
        }
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
        var nu=(n||"").toUpperCase();
        if(ignored[n]||ignored[nu]){
          headerIdx[n]=-1;
        }else if(lookup[n]!==undefined||lookup[nu]!==undefined){
          var idx=lookup[n]!==undefined?lookup[n]:lookup[nu];
          /* Preserve role/ticker/name; only refresh returns. Also record
             the incoming header as an alias so future re-uploads short-
             circuit on alias match (covers the case where header text
             differs from both name and ticker). */
          var existing=newSeries[idx];
          var aliases=(existing.aliases||[]).slice();
          if(n&&n!==existing.name&&n!==existing.ticker&&aliases.indexOf(n)<0)aliases.push(n);
          /* Backfill role/ticker from defaults if missing. Preserves any
             user-customized display name. */
          var defMatch=findDefaultSeries(portfolio,n)||findDefaultSeries(portfolio,existing.name)||findDefaultSeries(portfolio,existing.ticker);
          var roleFill=existing.role||(defMatch?defMatch.role:undefined);
          var tickerFill=existing.ticker||(defMatch?defMatch.ticker:"");
          newSeries[idx]=Object.assign({},existing,{role:roleFill,ticker:tickerFill,aliases:aliases,returns:Object.assign({},existing.returns||{})});
          headerIdx[n]=idx;
        }else{
          /* New series — use default mapping (name/role/ticker) when this
             header matches a known entry for the target portfolio.
             Falls back to the legacy "first column = portfolio, rest =
             competitor" heuristic when the header isn't recognized. */
          var def=findDefaultSeries(portfolio,n);
          headerIdx[n]=newSeries.length;
          lookup[n]=newSeries.length;
          if(def){
            var initialAliases=(def.aliases||[]).slice();
            if(n&&n!==def.name&&n!==def.ticker&&initialAliases.indexOf(n)<0)initialAliases.push(n);
            newSeries.push({name:def.name,role:def.role,ticker:def.ticker||"",aliases:initialAliases,returns:{}});
            /* Index the new series under every known synonym so the next
               column for the same series (e.g. an alternative header
               format on a later upload) finds it. */
            var keys=[def.name,def.ticker].concat(def.aliases||[]);
            keys.forEach(function(k){if(k&&lookup[k.toUpperCase()]===undefined)lookup[k.toUpperCase()]=headerIdx[n];});
          }else{
            newSeries.push({name:n,role:newSeries.length===0?"portfolio":"competitor",ticker:"",returns:{}});
          }
        }
      });
      /* Seed any defaults that weren't already in the portfolio. This is
         what makes the "set it up once" promise hold: even if a CSV is
         missing a benchmark column, the empty series gets created so the
         user can paste its returns later without re-rolling the whole
         layout. Defaults are appended; user-added series keep their slots. */
      (DEFAULT_PERF_SERIES[portfolio]||[]).forEach(function(def){
        var nameU=(def.name||"").toUpperCase();
        var tickU=(def.ticker||"").toUpperCase();
        if(lookup[nameU]!==undefined||lookup[tickU]!==undefined)return;
        var aliasHit=(def.aliases||[]).some(function(a){return lookup[(a||"").toUpperCase()]!==undefined;});
        if(aliasHit)return;
        var idx=newSeries.length;
        newSeries.push({name:def.name,role:def.role,ticker:def.ticker||"",aliases:(def.aliases||[]).slice(),returns:{}});
        lookup[nameU]=idx; if(tickU)lookup[tickU]=idx;
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
  /* Toggle a trade-agenda action for a single (company, portfolio)
     pair. Used by the IC-meeting workflow — click B/A/P/S in the
     Portfolios table to mark a planned trade. Behavior:
       - No existing stamp for this port: add the action.
       - Same action already stamped: REMOVE it (toggle off).
         If the prior stamp was Sell, also restore the previous target
         that the Sell zeroed.
       - Different action stamped: switch — remove the old, add the new.
         If switching out of Sell, restore target first.
     Buy/Add/Pare keep the existing target weight (the trade just
     drifts holdings back to target). Sell zeros the target. */
  function markTradeAgenda(companyId, portfolio, action){
    if(!["Buy","Add","Pare","Sell"].includes(action))return;
    if(!portfolio)return;
    var today=todayStr();
    var author=currentUser||"Unknown";
    setCompanies(function(cs){return cs.map(function(c){
      if(c.id!==companyId)return c;
      var hist=c.portWeightHistory||[];
      /* Find the most recent agenda stamp for this portfolio. */
      var existingStamp=null;
      for(var i=0;i<hist.length;i++){
        if(hist[i].isAgenda&&hist[i].portfolio===portfolio&&hist[i].action){
          existingStamp=hist[i];break;
        }
      }
      /* Wipe ALL prior agenda stamps for this portfolio (clean slate
         for the new state) — keeps history compact and avoids
         confusing the memo generator with multiple actions per port. */
      var cleaned=hist.filter(function(h){
        return !(h.isAgenda&&h.portfolio===portfolio&&h.action);
      });
      var nw=Object.assign({},c.portWeights||{});
      /* If the previous stamp was Sell, it zeroed the target; in any
         transition (toggle-off or switch) we restore the pre-Sell
         target from the entry's oldWeight. */
      if(existingStamp&&existingStamp.action==="Sell"){
        nw[portfolio]=String(existingStamp.oldWeight);
      }
      if(existingStamp&&existingStamp.action===action){
        /* Toggle OFF — same button clicked twice. No new entry. */
        return Object.assign({},c,{portWeights:nw,portWeightHistory:cleaned});
      }
      /* Stamp the new action — either first stamp or switching verbs. */
      var oldRaw=nw[portfolio]; /* after potential Sell-restore */
      var oldNum=parseFloat(oldRaw);if(isNaN(oldNum))oldNum=0;
      var newNum=action==="Sell"?0:oldNum;
      var entry={
        id:newId(),date:today,portfolio:portfolio,
        oldWeight:oldNum,newWeight:newNum,
        author:author,isAgenda:true,action:action,
      };
      if(action==="Sell")nw[portfolio]="0";
      return Object.assign({},c,{portWeights:nw,portWeightHistory:[entry].concat(cleaned)});
    });});
  }
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
      /* New weight changes default to isAgenda: true — they represent
         a decision made at the most recent IC meeting that hasn't been
         executed yet. The PM Meeting Memo generator lists these in the
         'Trading Agenda' section. After the trade lands (next-day
         transactions upload) the user can run 'Clear executed agenda'
         to flip isAgenda → false; those entries then surface in the
         'Target Changes' section instead. */
      var entry={id:newId(),date:todayStr(),portfolio:portfolio,oldWeight:oldNum,newWeight:newNum,author:currentUser||"Unknown",isAgenda:true};
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
    loadStatus,setLoadStatus,loadFailed,
    lastPriceUpdate,setLastPriceUpdate,
    lastPriceUpdatedBy,setLastPriceUpdatedBy,
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
    tpApprovals,setTpApprovals,submitTpApproval,approveTpApproval,rejectTpApproval,withdrawTpApproval,markTpApprovalRead,
    saveStatus,
    addAnnotation,updateAnnotation,deleteAnnotation,resolveAnnotation,unresolveAnnotation,addReply,markAnnotationRead,parseMentions,
    updateTargetWeight,markTradeAgenda,addTargetHistoryEntry,deleteTargetHistoryEntry,
    addTransaction,deleteTransaction,setTxInitOverride,setTxCashFlow,updateInitiatedDate,
    researchAssignments,setResearchAssignments,setResearchSlot,setReorgSlot,
    perfData,setPerfData,setPerfSeries,addPerfSeries,removePerfSeries,movePerfSeries,setPerfSeriesOrder,setPerfReturn,setPerfLastMonthEMV,applyPerfBulk,
    feedback,setFeedback,addFeedback,updateFeedback,removeFeedback,moveFeedback,
    memoLog,setMemoLog,addMemoLog,deleteMemoLog,
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
