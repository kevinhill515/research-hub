import { createContext, useContext, useState, useEffect, useRef } from "react";
import { supaGet, supaGetAll, supaGetMetaMany, supaUpsert, supaDelete } from '../api/index.js';
import { todayStr, inferQuarter } from '../utils/index.js';
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
  /* targetChangeReads — sparse acknowledgment map for portWeightHistory
     entries. Shape: { [historyEntryId]: [user, ...] }. Lets the Recent
     Target Changes section on the Agenda tab (and the amber-⏳ pill on
     PortfolioRow / OverlapTable) derive "unread by current user" without
     mutating the history entries themselves. */
  const [targetChangeReads,setTargetChangeReads]=useState({});
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

  /* Refresh JUST the companies table from Supabase — used by the
     "Refresh Portfolios" button so the team can pull live agenda updates
     during a meeting without paying for a full app reload (which would
     re-fetch the library + 15 meta blobs, blowing up egress AND wiping
     any in-progress modal state). Returns the count refreshed so the
     caller can flash a quick confirmation. */
  async function refreshCompaniesFromSupabase(){
    try {
      var rows = await supaGetAll("companies");
      if (!Array.isArray(rows)) return 0;
      var perCo = rows.filter(function(row){ return row && row.id !== "shared"; });
      var loaded = [];
      perCo.forEach(function(row){
        try { var c = JSON.parse(row.data); if (c) loaded.push(c); } catch(_e){}
      });
      if (loaded.length === 0) return 0;
      setCompanies(loaded);
      return loaded.length;
    } catch(_e){
      return -1; /* signal error to caller */
    }
  }
  async function loadFromStorage(){
    setLoadStatus({companies:null,library:null});
    var coOk=false,libOk=false;
    /* Reload uses only THREE concurrent connections instead of the
       previous 17 (1 library + 1 companies + 15 meta blobs). The meta
       blobs all live in the same `meta` table and are now fetched in a
       single request with PostgREST's in.() filter. Cuts the Supabase
       connection-pool pressure 5-6x on every reload, which matters when
       multiple teammates reload at the same time on free tier
       (limited connections + concurrent sessions can wedge the project). */
    var safe=function(p){return p.then(function(r){return r;},function(){return null;});};
    /* The 15 meta keys we need at load time. Kept as a list so a single
       in.() query covers them all. Order doesn't matter — we look up
       each by key from the returned Map. */
    var META_KEYS = [
      "lastPriceUpdate","entryComments","calLastUpdated","repData","fxRates",
      "specialWeights","annotations","researchAssignments","perfData","feedback",
      "benchmarkWeights","alertRules","breakdownHistory","tpApprovals","memoLog",
      "targetChangeReads",
    ];
    var [r, r2, metaMap] = await Promise.all([
      safe(supaGet("library","id","shared")),
      /* Companies are stored as one row per company (each row's data
         column holds a single company JSON, ~30KB typical). Pulled in
         one request. The legacy "shared" single-blob row is migrated below. */
      safe(supaGetAll("companies")),
      safe(supaGetMetaMany(META_KEYS)),
    ]);
    /* Unpack the meta Map into the named slots the rest of this function
       expects. A missing key returns undefined (handled by the same
       try/if(r3) guards that existed when each call was independent). */
    var _m = metaMap || new Map();
    var r3  = _m.get("lastPriceUpdate")     || null;
    var r4  = _m.get("entryComments")       || null;
    var r5  = _m.get("calLastUpdated")      || null;
    var r6  = _m.get("repData")             || null;
    var r7  = _m.get("fxRates")             || null;
    var r8  = _m.get("specialWeights")      || null;
    var r9  = _m.get("annotations")         || null;
    var r10 = _m.get("researchAssignments") || null;
    var r11 = _m.get("perfData")            || null;
    var r12 = _m.get("feedback")            || null;
    var r13 = _m.get("benchmarkWeights")    || null;
    var r14 = _m.get("alertRules")          || null;
    var r15 = _m.get("breakdownHistory")    || null;
    var r16 = _m.get("tpApprovals")         || null;
    var r17 = _m.get("memoLog")             || null;
    var rTCR = _m.get("targetChangeReads")  || null;
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
        /* Baseline tpHistory backfill — DISABLED.
           Migration was crashing the initial load on at least one
           data set. Reverted to a no-op while we diagnose. The live
           write in saveEarningsEntry still fires for any FUTURE first
           save on a company with empty tpHistory, so going forward the
           data shape is correct; only the retroactive sweep is off. */
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
    try{if(r16&&r16.value){
      var tpa=JSON.parse(r16.value);
      if(Array.isArray(tpa)){
        /* Targeted from-value backfill for the 9 pending tp approvals
           outstanding on 2026-05-26. The user supplied the actual
           pre-change values (last approved state) by hand because they
           weren't recoverable from data (the team's workflow updates
           valuation before submitting, so by submission time the "from"
           context was already gone from every accessible source).
           Match by case-insensitive substring on a key distinguishing
           word in the company name. fromW1/fromW2 written even when
           zero so the Weights line renders "100/0 → 50/50" rather than
           "—/— → 50/50". Gated by its own flag so it runs once. */
        try {
          var rManualFlag = await supaGet("meta","key","manual_tpapproval_from_backfill_2026_05_26");
          if (!(rManualFlag && rManualFlag.value)) {
            var MANUAL_FROM = [
              { match: "taiwan semiconductor", fromPE: 21,  fromEPS1: 64.41,  fromW1: 100, fromEPS2: 80.70,  fromW2: 0,   fromTP: 1700 },
              { match: "infineon",             fromPE: 20,  fromEPS1: 2.26,   fromW1: 100, fromEPS2: null,   fromW2: 0,   fromTP: 45.10 },
              { match: "allstate",             fromPE: 9.5, fromEPS1: 25.00,  fromW1: 100, fromEPS2: null,   fromW2: 0,   fromTP: 237.50 },
              { match: "flex ltd",             fromPE: 18,  fromEPS1: 3.63,   fromW1: 50,  fromEPS2: 4.04,   fromW2: 50,  fromTP: 69 },
              { match: "norsk hydro",          fromPE: 12,  fromEPS1: 6.94,   fromW1: 50,  fromEPS2: 7.71,   fromW2: 50,  fromTP: 88 },
              { match: "prysmian",             fromPE: 23,  fromEPS1: 4.65,   fromW1: 50,  fromEPS2: 5.26,   fromW2: 50,  fromTP: 114 },
              { match: "glencore",             fromPE: 17,  fromEPS1: 0.3256, fromW1: 50,  fromEPS2: 0.3474, fromW2: 50,  fromTP: 5.72 },
              { match: "suncor",               fromPE: 18,  fromEPS1: null,   fromW1: 0,   fromEPS2: 5.44,   fromW2: 100, fromTP: 98 },
              { match: "easyjet",              fromPE: 10,  fromEPS1: 0.76,   fromW1: 100, fromEPS2: null,   fromW2: 0,   fromTP: 7.60 },
            ];
            var manualById = {};
            (coMig.data || []).forEach(function(c){
              var n = (c.name || "").toLowerCase();
              for (var i = 0; i < MANUAL_FROM.length; i++) {
                if (n.indexOf(MANUAL_FROM[i].match) >= 0) {
                  manualById[c.id] = MANUAL_FROM[i];
                  break;
                }
              }
            });
            var manualChanged = false;
            tpa.forEach(function(rec){
              if (rec.status !== "pending") return;
              var m = manualById[rec.companyId];
              if (!m) return;
              /* Set unconditionally — the previous undo cleared these to
                 null, and these are user-supplied authoritative values
                 the user explicitly asked to write. */
              rec.fromPE   = m.fromPE;
              rec.fromEPS1 = m.fromEPS1;
              rec.fromEPS2 = m.fromEPS2;
              rec.fromW1   = m.fromW1;
              rec.fromW2   = m.fromW2;
              /* Recompute blended fromEPS from the building blocks when
                 both weights and EPS are present; otherwise use whichever
                 single side has a value. Matches EarningsEntry's logic. */
              if (isFinite(m.fromEPS1) && isFinite(m.fromEPS2) && isFinite(m.fromW1) && isFinite(m.fromW2)) {
                rec.fromEPS = (m.fromEPS1 * m.fromW1 + m.fromEPS2 * m.fromW2) / 100;
              } else if (isFinite(m.fromEPS1) && m.fromW1 === 100) {
                rec.fromEPS = m.fromEPS1;
              } else if (isFinite(m.fromEPS2) && m.fromW2 === 100) {
                rec.fromEPS = m.fromEPS2;
              }
              if (isFinite(m.fromTP)) rec.fromTP = m.fromTP;
              manualChanged = true;
            });
            if (manualChanged) {
              supaUpsert("meta", { key: "tpApprovals", value: JSON.stringify(tpa) });
            }
            supaUpsert("meta", { key: "manual_tpapproval_from_backfill_2026_05_26", value: "1" });
          }
        } catch(_e) {}

        /* UNDO the May-26-2026 backfill (gated by
           backfill_tpapproval_from_2026_05_26). That backfill copied
           the company's current valuation into pending records'
           from-fields, but in practice the team's workflow updates
           valuation BEFORE submitting the approval (via Estimates
           Import / direct edit), so by the time the migration ran the
           valuation already held the proposed values and the backfill
           produced from==to on every field — i.e. cards reported
           "unchanged" when the values had actually changed.

           This cleanup clears fromPE/fromEPS1/fromEPS2/fromW1/fromW2
           (and the blended fromEPS) on PENDING records back to null so
           the cards render an honest "—" rather than misleading
           "unchanged". fromTP and fy1/fy2 are left alone — fromTP was
           legitimately populated for most records, and the FY labels
           are descriptive metadata that don't depend on which side of
           the change they reference. Gated by its own flag so it runs
           once. Decided (approved/rejected) records are immutable
           history and never touched. */
        try {
          var rTpaUndoFlag = await supaGet("meta","key","undo_tpapproval_backfill_2026_05_26");
          if (!(rTpaUndoFlag && rTpaUndoFlag.value)) {
            var tpaUndoChanged = false;
            tpa.forEach(function(rec){
              if (rec.status !== "pending") return;
              ["fromPE","fromEPS1","fromEPS2","fromW1","fromW2","fromEPS"].forEach(function(f){
                if (rec[f] != null) { rec[f] = null; tpaUndoChanged = true; }
              });
            });
            if (tpaUndoChanged) {
              supaUpsert("meta", { key: "tpApprovals", value: JSON.stringify(tpa) });
            }
            supaUpsert("meta", { key: "undo_tpapproval_backfill_2026_05_26", value: "1" });
          }
        } catch(_e) {}
        setTpApprovals(tpa);
      }
    }}catch(e){}
    try{if(r17&&r17.value){var ml=JSON.parse(r17.value);if(Array.isArray(ml))setMemoLog(ml);}}catch(e){}
    try{if(rTCR&&rTCR.value){var tcr=JSON.parse(rTCR.value);if(tcr&&typeof tcr==="object")setTargetChangeReads(tcr);}}catch(e){}
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
  useEffect(function(){if(!ready)return;var t=setTimeout(function(){var j=JSON.stringify(targetChangeReads);autoSendBlob("targetChangeReads",j,"meta",{key:"targetChangeReads",value:j});},DEBOUNCE_MS);return function(){clearTimeout(t);};},[targetChangeReads,ready]);
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
    /* Read rec from the CURRENT closure-captured tpApprovals state up
       front — not from inside the setTpApprovals updater. The updater
       runs asynchronously (React 18 schedules functional updates for
       the next render commit), so reading `rec` from inside it left
       the gate below to read a still-null `rec` on rapid-fire
       approvals — which is why 9 IC-meeting approvals only wrote 2
       through to companies (the first one or two happened to run sync,
       the rest didn't). Capturing here synchronously fixes the race. */
    var rec = (tpApprovals||[]).find(function(a){return a.id===id;});
    if(!rec||rec.status!=="pending"||rec.suggestedBy===currentUser)return;
    var approvedAt=todayStr();
    setTpApprovals(function(prev){
      /* Re-find inside the updater so multi-user races still see the
         freshest state — but if it's already been decided by another
         user, leave it. */
      var live = prev.find(function(a){return a.id===id;});
      if(!live || live.status!=="pending") return prev;
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
    setCompanies(function(cs){
      return cs.map(function(c){
        if(c.id!==rec.companyId)return c;
        var v=Object.assign({},c.valuation||{});
        var today=todayStr();
        var ccy=(c.valuation&&c.valuation.currency)||"USD";
        /* Write every breakdown field the suggestion specifies. PE / EPS1
           / EPS2 / W1 / W2 become the working valuation — these drive TP
           Live, which keeps recomputing as EPS estimates update over
           time. Then snapshot rec.toTP into tpFixed so the firm has a
           stable target frozen at this approval's moment (PE × normEPS
           at sign-off, regardless of subsequent EPS drift). Older records
           that predate the breakdown only carry toPE/toEPS — handle
           both for back-compat. */
        if(rec.toPE!==null&&rec.toPE!==undefined&&rec.toPE!=="")v.pe=rec.toPE;
        if(rec.toEPS1!==null&&rec.toEPS1!==undefined&&rec.toEPS1!=="")v.eps1=rec.toEPS1;
        else if(rec.toEPS!==null&&rec.toEPS!==undefined&&rec.toEPS!=="")v.eps1=rec.toEPS;
        if(rec.toEPS2!==null&&rec.toEPS2!==undefined&&rec.toEPS2!=="")v.eps2=rec.toEPS2;
        if(rec.toW1!==null&&rec.toW1!==undefined&&rec.toW1!=="")v.w1=rec.toW1;
        if(rec.toW2!==null&&rec.toW2!==undefined&&rec.toW2!=="")v.w2=rec.toW2;
        /* Also snapshot the approved values into *Fixed slots. These are
           the locked-at-approval values that the Valuation tab surfaces
           alongside the daily-updated Live values, and they're what the
           next TP proposal pulls into its "Previous (last approved)"
           row. Without these the only way to find the locked EPS was
           to dig through tpHistory. PE/W are usually stable across
           approvals; we still snapshot them for consistency so any
           direct edit on the Live side leaves a clear breadcrumb of
           what was last blessed. */
        if(rec.toPE   !== null && rec.toPE   !== undefined && rec.toPE   !== "") v.peFixed   = rec.toPE;
        if(rec.toEPS1 !== null && rec.toEPS1 !== undefined && rec.toEPS1 !== "") v.eps1Fixed = rec.toEPS1;
        if(rec.toEPS2 !== null && rec.toEPS2 !== undefined && rec.toEPS2 !== "") v.eps2Fixed = rec.toEPS2;
        if(rec.toW1   !== null && rec.toW1   !== undefined && rec.toW1   !== "") v.w1Fixed   = rec.toW1;
        if(rec.toW2   !== null && rec.toW2   !== undefined && rec.toW2   !== "") v.w2Fixed   = rec.toW2;
        if(rec.fy1) v.fy1Fixed = rec.fy1;
        if(rec.fy2) v.fy2Fixed = rec.fy2;
        /* TP Fixed snapshot at the approval moment. Uses the computed
           toTP (PE × normEPS) — the moment-in-time target the team is
           agreeing to. TP Live diverges from this going forward as EPS
           estimates refresh; TP Fixed only changes via the next
           approval. */
        if(rec.toTP!==null&&rec.toTP!==undefined&&isFinite(rec.toTP)){
          v.tpFixed=String(rec.toTP);
          v.tpFixedDate=today;
        }
        /* Find the earnings entry the suggestion was attached to and
           derive its fiscal-quarter label (e.g. "Q1 FY26"). The Fixed
           TP History table displays this so the reader can see WHICH
           quarter's earnings drove the TP change. */
        var qLabel = "";
        var srcEntry = (c.earningsEntries||[]).find(function(eEnt){
          return eEnt.id === rec.earningsEntryId;
        });
        if(srcEntry){
          if(srcEntry.quarter){
            qLabel = String(srcEntry.quarter);
          } else if(srcEntry.reportDate){
            var inferred = inferQuarter(srcEntry.reportDate, (c.valuation||{}).fyMonth || "Dec");
            if(inferred && inferred.label) qLabel = inferred.label;
          }
        }
        var tpEntry={
          date:today,
          tp:rec.toTP,
          pe:rec.toPE,
          eps:rec.toEPS,
          eps1:rec.toEPS1,
          eps2:rec.toEPS2,
          w1:rec.toW1,
          w2:rec.toW2,
          fy1:rec.fy1||"",
          fy2:rec.fy2||"",
          /* Earnings-entry linkage so the Fixed TP History row can
             always resolve its Fiscal Quarter even if the snapshotted
             label gets stale (e.g. user edits the source entry's
             quarter/reportDate after the approval). */
          earningsEntryId:rec.earningsEntryId||"",
          quarter:qLabel,
          currency:ccy,
          source:"approval",
          by:rec.suggestedBy,
          approvedBy:currentUser,
          rationale:rec.rationale||"",
        };
        return Object.assign({},c,{
          valuation:v,
          tpHistory:[tpEntry].concat(c.tpHistory||[]),
          lastUpdated:today,
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
  /* In-place edit of a PENDING approval the current user owns. Lets the
     suggester fix typos or revise the breakdown without going through
     withdraw+resubmit (which is annoying and loses readBy / discussion
     thread continuity). Only the editable proposal fields are spread
     in — id, suggestedBy, status, readBy, earningsEntryId are
     preserved. Updates suggestedAt to today's date and resets readBy
     to just the current user so other teammates see it as new again. */
  function editTpApproval(id, patch){
    if(!currentUser)return;
    setTpApprovals(function(prev){
      return prev.map(function(a){
        if(a.id!==id)return a;
        if(a.status!=="pending"||a.suggestedBy!==currentUser)return a;
        var EDITABLE = ["fromPE","fromEPS1","fromEPS2","fromW1","fromW2","fromEPS","fromTP",
                        "toPE","toEPS1","toEPS2","toW1","toW2","toEPS","toTP",
                        "computedTP","proposedTP","fy1","fy2","rationale"];
        var next = Object.assign({}, a);
        EDITABLE.forEach(function(k){
          if(Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
        });
        next.suggestedAt = todayStr();
        next.readBy = [currentUser]; /* re-flag as unread for everyone else */
        return next;
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
  /* Target-change acknowledgment. historyEntryId can be any string —
     for portWeightHistory entries we use entry.id (auto-assigned at
     write time) or a deterministic synthetic key like
     companyId+"|"+portfolio+"|"+timestamp when the entry lacks one. */
  function markTargetChangeRead(historyEntryId){
    if(!currentUser || !historyEntryId) return;
    setTargetChangeReads(function(prev){
      var p = prev || {};
      var existing = p[historyEntryId] || [];
      if(existing.indexOf(currentUser) >= 0) return p;
      var next = Object.assign({}, p);
      next[historyEntryId] = existing.concat([currentUser]);
      return next;
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
  /* ---- Proposed-vs-committed target-weight lifecycle ----
   *
   * Today's contract used to be: edit a target % → portWeights mutates
   * immediately + a portWeightHistory entry lands with isAgenda:true.
   * Two writes in one motion. There was no "tentative" window — the
   * portfolio's committed target was already the new value.
   *
   * New contract:
   *   proposeTargetWeight(co, port, newW)
   *     - Adds (or REPLACES the existing pending) portWeightHistory entry
   *       with isAgenda:true, recording the proposed newWeight + author.
   *     - Does NOT mutate co.portWeights[port]. Committed target stays put.
   *     - DOES mutate specialWeights.CASH[port] by -delta so the target
   *       column visibly sums to 100% even while proposals are open
   *       (user explicitly chose "CASH moves with each proposal").
   *
   *   clearProposedWeight(co, port)
   *     - Removes the pending entry. Restores CASH by +delta.
   *
   *   commitProposedWeights(port)
   *     - For every company with a pending (isAgenda:true) target entry
   *       on this port: writes the entry's newWeight into portWeights,
   *       flips isAgenda:false. CASH was already moved at propose time
   *       so no CASH adjustment here.
   *     - Also flips any B/A/P/S agenda entries (isAgenda:true with an
   *       action) on this port to isAgenda:false — same role
   *       clearAgendaFlags(util) used to play, now scoped per-port and
   *       in-context so the data flow is one-way.
   *
   * updateTargetWeight kept as a thin one-shot wrapper:
   *   propose → commitProposedWeights(port)
   * so existing callers (OverlapTable, anything else) behave identically
   * until they migrate to the explicit propose/commit cycle.
   */
  function _findPendingTargetEntry(c, portfolio){
    var hist = c.portWeightHistory || [];
    for(var i=0;i<hist.length;i++){
      var h = hist[i];
      /* Pending target = isAgenda:true with a newWeight and NO action
         (B/A/P/S stamps also use isAgenda:true but have an action). */
      if(h && h.isAgenda && h.portfolio === portfolio && !h.action
          && h.newWeight !== undefined && h.newWeight !== null){
        return { entry: h, index: i };
      }
    }
    return null;
  }
  function _shiftCash(portfolio, delta){
    if(!(Math.abs(delta) >= 0.01)) return;
    setSpecialWeights(function(prev){
      var next = Object.assign({}, prev);
      var cashRow = Object.assign({}, next.CASH || {});
      var oldCash = parseFloat(cashRow[portfolio]);
      if(isNaN(oldCash)) oldCash = 0;
      /* CASH absorbs the opposite of the target change so the column
         sums stay at 100%. Clamp at 0; rounded to 0.1 to match display. */
      var newCash = Math.max(0, Math.round((oldCash - delta) * 10) / 10);
      cashRow[portfolio] = newCash;
      next.CASH = cashRow;
      return next;
    });
  }
  function proposeTargetWeight(companyId, portfolio, rawNewValue){
    /* baseline for delta-vs-CASH = currently-proposed value if one
       exists; else committed portWeights value. Lets the same edit
       cell handle "first proposal" and "amend an existing proposal"
       without double-counting CASH.

       Sell-stamp override: when there's an existing agenda Sell stamp
       on this port, treat its stored oldWeight as the baseline (not
       the now-0 portWeights value the Sell zeroed). This lets the IC
       Meeting flow "Sell All → change mind → set new target" produce
       the right allocation-change row ("X% → newTarget%" not
       "0% → newTarget%"). The Sell stamp itself is removed by the
       new target — the user has decided to keep the position. */
    var deltaForCash = 0;
    setCompanies(function(cs){
      return cs.map(function(c){
        if(c.id !== companyId) return c;
        /* Find any existing Sell agenda stamp on this port. */
        var sellIdx = -1;
        var hist0 = c.portWeightHistory || [];
        for(var si=0; si<hist0.length; si++){
          var sh = hist0[si];
          if(sh && sh.isAgenda && sh.portfolio===portfolio && sh.action==="Sell"){
            sellIdx = si; break;
          }
        }
        var sellEntry = sellIdx >= 0 ? hist0[sellIdx] : null;
        var committedRaw = (c.portWeights || {})[portfolio];
        var committedNum = parseFloat(committedRaw); if(isNaN(committedNum)) committedNum = 0;
        /* Override baseline if Sell pre-zeroed portWeights. */
        if(sellEntry){
          var sellOld = parseFloat(sellEntry.oldWeight);
          if(isFinite(sellOld) && sellOld > committedNum) committedNum = sellOld;
        }
        var newNum = parseFloat(rawNewValue); if(isNaN(newNum)) newNum = 0;
        var pending = _findPendingTargetEntry(c, portfolio);
        var prevProposed = pending ? parseFloat(pending.entry.newWeight) : (sellEntry ? 0 : committedNum);
        if(isNaN(prevProposed)) prevProposed = committedNum;
        deltaForCash = newNum - prevProposed;
        /* If proposed === committed, there's nothing pending — clear
           any existing proposal entry on this port. */
        var nowMatchesCommitted = Math.abs(newNum - committedNum) < 0.01;
        var newHist;
        /* Build the working history with the Sell stamp removed first
           (whether or not we keep a target proposal — see below). */
        var histNoSell = sellIdx >= 0
          ? hist0.filter(function(h, i){ return i !== sellIdx; })
          : hist0;
        if(nowMatchesCommitted){
          newHist = histNoSell.filter(function(h, i){
            /* pending.index was relative to the ORIGINAL hist; if we
               filtered out a Sell that came before it, the index
               shifts by -1. Match by id instead to avoid the dance. */
            return !(pending && pending.entry.id && h.id === pending.entry.id);
          });
        } else {
          var entry = {
            id: pending ? pending.entry.id : newId(),
            date: todayStr(),
            portfolio: portfolio,
            oldWeight: committedNum,
            newWeight: newNum,
            author: currentUser || "Unknown",
            isAgenda: true,
          };
          /* Replace existing pending entry in place if present; else
             prepend. Keeps history clean — multiple keystrokes don't
             accumulate noise. */
          if(pending){
            newHist = histNoSell.map(function(h){
              return (h && pending.entry.id && h.id === pending.entry.id) ? entry : h;
            });
          } else {
            newHist = [entry].concat(histNoSell);
          }
        }
        /* If a Sell stamp was just removed, restore portWeights to the
           pre-Sell committed value. The Sell originally mutated
           portWeights to "0"; the target proposal that's replacing it
           should ride on the proper baseline. */
        var newPortWeights = c.portWeights;
        if(sellEntry){
          var restored = parseFloat(sellEntry.oldWeight);
          if(isFinite(restored)){
            newPortWeights = Object.assign({}, c.portWeights || {}, { [portfolio]: String(restored) });
          }
        }
        return Object.assign({}, c, { portWeightHistory: newHist, portWeights: newPortWeights });
      });
    });
    _shiftCash(portfolio, deltaForCash);
  }
  function clearProposedWeight(companyId, portfolio){
    var deltaForCash = 0;
    setCompanies(function(cs){
      return cs.map(function(c){
        if(c.id !== companyId) return c;
        var pending = _findPendingTargetEntry(c, portfolio);
        if(!pending) return c;
        var committedRaw = (c.portWeights || {})[portfolio];
        var committedNum = parseFloat(committedRaw); if(isNaN(committedNum)) committedNum = 0;
        var proposedNum = parseFloat(pending.entry.newWeight); if(isNaN(proposedNum)) proposedNum = committedNum;
        /* Removing the proposal restores CASH by the opposite of the
           proposal's net delta (delta = proposedNum - committedNum). */
        deltaForCash = -(proposedNum - committedNum);
        var newHist = (c.portWeightHistory || []).filter(function(h, i){
          return i !== pending.index;
        });
        return Object.assign({}, c, { portWeightHistory: newHist });
      });
    });
    _shiftCash(portfolio, deltaForCash);
  }
  function commitProposedWeights(portfolio){
    /* Walk every company; for those with a pending target proposal on
       this port, copy newWeight → portWeights and flip the entry's
       isAgenda:false. Also flip B/A/P/S agenda entries (isAgenda:true
       with action set) on this port — that role used to belong to
       clearAgendaFlags(util) but now lives in-context for clean
       one-way data flow. CASH was already moved at propose time. */
    setCompanies(function(cs){
      return cs.map(function(c){
        var hist = c.portWeightHistory || [];
        var changed = false;
        var newPortWeights = Object.assign({}, c.portWeights || {});
        var newHist = hist.map(function(h){
          if(!h || !h.isAgenda || h.portfolio !== portfolio) return h;
          /* Target proposal — write committed weight. */
          if(!h.action && h.newWeight !== undefined && h.newWeight !== null){
            var nw = parseFloat(h.newWeight);
            if(isFinite(nw)){
              newPortWeights[portfolio] = String(nw);
            }
            changed = true;
            return Object.assign({}, h, { isAgenda: false });
          }
          /* B/A/P/S stamp — flip to executed. */
          if(h.action){
            changed = true;
            return Object.assign({}, h, { isAgenda: false });
          }
          return h;
        });
        if(!changed) return c;
        return Object.assign({}, c, { portWeights: newPortWeights, portWeightHistory: newHist });
      });
    });
  }
  /* Back-compat one-shot wrapper. Existing callers (OverlapTable,
     ad-hoc edits) keep working unchanged: a write here looks like
     propose-then-immediately-commit, which net-out matches the old
     contract (portWeights moves now, CASH rebalances now, history
     entry lands with isAgenda:false). */
  function updateTargetWeight(companyId,portfolio,rawNewValue){
    proposeTargetWeight(companyId, portfolio, rawNewValue);
    commitProposedWeights(portfolio);
  }
  /* Append a comment to a pending portWeightHistory entry. Lightweight
     team-collab around a single proposed change — replies / discussion
     without bringing back the deleted meetingProposals system. Each
     comment: { id, author, date, text }. Lives on the entry itself
     (entry.comments[]) so it stays attached even after lock-in (the
     entry persists with isAgenda:false). */
  function commentOnAgendaEntry(companyId, entryId, text){
    if(!currentUser || !text || !text.trim()) return;
    setCompanies(function(cs){
      return cs.map(function(c){
        if(c.id !== companyId) return c;
        var hist = c.portWeightHistory || [];
        var newHist = hist.map(function(h){
          if(!h || h.id !== entryId) return h;
          var comment = {
            id: newId(),
            author: currentUser,
            date: todayStr(),
            text: text.trim(),
          };
          return Object.assign({}, h, {
            comments: (h.comments || []).concat([comment]),
          });
        });
        return Object.assign({}, c, { portWeightHistory: newHist });
      });
    });
  }
  /* Edit an existing comment on an agenda entry. Only the comment's
     own author can edit — guarded both here and (defense-in-depth)
     in the UI. */
  function editAgendaComment(companyId, entryId, commentId, newText){
    if(!currentUser || !newText || !newText.trim()) return;
    setCompanies(function(cs){
      return cs.map(function(c){
        if(c.id !== companyId) return c;
        var hist = c.portWeightHistory || [];
        var newHist = hist.map(function(h){
          if(!h || h.id !== entryId) return h;
          var updatedComments = (h.comments || []).map(function(cm){
            if(cm.id !== commentId) return cm;
            if(cm.author !== currentUser) return cm; /* own-comment guard */
            return Object.assign({}, cm, {
              text: newText.trim(),
              editedAt: todayStr(),
            });
          });
          return Object.assign({}, h, { comments: updatedComments });
        });
        return Object.assign({}, c, { portWeightHistory: newHist });
      });
    });
  }
  /* Delete a comment. Same own-comment guard. */
  function deleteAgendaComment(companyId, entryId, commentId){
    if(!currentUser) return;
    setCompanies(function(cs){
      return cs.map(function(c){
        if(c.id !== companyId) return c;
        var hist = c.portWeightHistory || [];
        var newHist = hist.map(function(h){
          if(!h || h.id !== entryId) return h;
          var filtered = (h.comments || []).filter(function(cm){
            return !(cm.id === commentId && cm.author === currentUser);
          });
          return Object.assign({}, h, { comments: filtered });
        });
        return Object.assign({}, c, { portWeightHistory: newHist });
      });
    });
  }
  /* Discard all pending agenda entries on the given portfolios without
     committing — used by the "Clear Agenda" button on the Generate tab
     when the team wants to throw out proposals (e.g. meeting decided
     against everything). For target-% entries, restores CASH by the
     reverse delta so the column stays at 100%. For B/A/P/S stamps, no
     CASH side-effect — just deletes the entry. */
  function discardAgendaEntries(ports){
    var portsArr = Array.isArray(ports) ? ports : [ports];
    var cashAdjustByPort = {}; /* { port: total delta to add back to CASH } */
    setCompanies(function(cs){
      return cs.map(function(c){
        var hist = c.portWeightHistory || [];
        var kept = [];
        var changed = false;
        hist.forEach(function(h){
          if (!h || !h.isAgenda || portsArr.indexOf(h.portfolio) < 0) {
            kept.push(h);
            return;
          }
          changed = true;
          /* Target proposal — accumulate CASH restoration for this port. */
          if (!h.action && h.newWeight !== undefined && h.newWeight !== null) {
            var committedNum = parseFloat((c.portWeights || {})[h.portfolio]);
            if (isNaN(committedNum)) committedNum = 0;
            var proposedNum = parseFloat(h.newWeight);
            if (isNaN(proposedNum)) proposedNum = committedNum;
            var restore = -(proposedNum - committedNum);
            cashAdjustByPort[h.portfolio] = (cashAdjustByPort[h.portfolio] || 0) + restore;
          }
          /* B/A/P/S stamp — no CASH impact (committed weights didn't move). */
        });
        if (!changed) return c;
        return Object.assign({}, c, { portWeightHistory: kept });
      });
    });
    Object.keys(cashAdjustByPort).forEach(function(port){
      _shiftCash(port, cashAdjustByPort[port]);
    });
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
    tpApprovals,setTpApprovals,submitTpApproval,approveTpApproval,rejectTpApproval,withdrawTpApproval,editTpApproval,markTpApprovalRead,
    saveStatus,
    addAnnotation,updateAnnotation,deleteAnnotation,resolveAnnotation,unresolveAnnotation,addReply,markAnnotationRead,parseMentions,
    updateTargetWeight,markTradeAgenda,addTargetHistoryEntry,deleteTargetHistoryEntry,
    proposeTargetWeight,clearProposedWeight,commitProposedWeights,discardAgendaEntries,
    refreshCompaniesFromSupabase,commentOnAgendaEntry,editAgendaComment,deleteAgendaComment,
    addTransaction,deleteTransaction,setTxInitOverride,setTxCashFlow,updateInitiatedDate,
    researchAssignments,setResearchAssignments,setResearchSlot,setReorgSlot,
    perfData,setPerfData,setPerfSeries,addPerfSeries,removePerfSeries,movePerfSeries,setPerfSeriesOrder,setPerfReturn,setPerfLastMonthEMV,applyPerfBulk,
    feedback,setFeedback,addFeedback,updateFeedback,removeFeedback,moveFeedback,
    memoLog,setMemoLog,addMemoLog,deleteMemoLog,
    targetChangeReads,setTargetChangeReads,markTargetChangeRead,
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
