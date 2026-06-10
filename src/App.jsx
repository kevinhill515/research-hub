import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { evaluateAlertsForCompany } from './utils/alerts.js';
import { PORTFOLIOS, TIER_ORDER, SECTOR_ORDER, COUNTRY_ORDER, SECTOR_COLORS, SECTOR_SHORT, COUNTRY_GROUPS, COUNTRY_COLORS, REGION_COLORS, REGION_GROUPS, STATUS_RANK, CURRENCY_MAP, ALL_CURRENCIES, MONTHS, CO_SORTS, FORMATS, TONES, LIB_SORTS, PRESET_TAGS, UPLOAD_TYPES, TEMPLATE_SECTIONS, SECTION_SUBHEADINGS, THESIS_STATUSES, TP_CHANGES, AVG_WPM, ALL_COLS, COMPACT_COLS, COMPANY_COLUMNS, SHORTCUTS, CONF_BG, CONF_COLOR, ACTIONS, TEAM_MEMBERS, TEAM_COLORS, REP_ACCOUNTS, PORT_NAMES, FLAG_STYLES } from './constants/index.js';
import { shortSector, sectorStyle, countryStyle, getRegion, getTiers, getCurrency, calcNormEPS, calcTP, calcMOS, fmtPrice, fmtTP, fmtMOS, mosBg, impliedFYLabel, tierPillStyle, tierBg, fmtTime, getCore, getConf, escHTML, toHTML, toMD, simScore, downloadMD, detectCompanyTags, todayStr, parseDate, daysSince, reviewedColor, getStatusRank, getTierIndex, getCompanyMOS, blankEarnings, sortCos, synPrompt, tierToStatus, repShares, repAvgCost, getInitiatedDate, monthsSince, isInitiationTx, printPage } from './utils/index.js';
import { supaGet, supaUpsert, ANTHROPIC_KEY, apiCall, setAnthropicKey, hasAnthropicKey, MODEL_TASKS, MODEL_OPTIONS, getModel, setModel } from './api/index.js';
import { getDataStatus, statusBadge, staleReason } from './utils/dataStatus.js';
import AlertsPanel from './components/dashboard/AlertsPanel.jsx';
import ThisWeekEarnings from './components/dashboard/ThisWeekEarnings.jsx';
import { PriceAgeIndicator, BarRow, PillEl, PortPicker, SectionBlock, StatusPill, DiffView } from './components/ui/index.js';
import { SectionEditTab, EarningsEntry, NotesCell, ActionCell, FlagCell, DatePicker } from './components/forms/index.js';
import { GlobalSearch, TemplateSearch, QuickUploadModal, DiscussionsPanel, TpApprovalsPanel, MeetingMemoModal } from './components/modals/index.js';
import { CoRow, OverlapMatrix } from './components/tables/index.js';
import { EarningsCalendar } from './components/calendar/index.js';
import { useCompanyContext } from './context/CompanyContext.jsx';
import { MEETING_PROFILES } from './utils/meetingMemo.js';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
/* Dashboard subtabs are lazy-loaded — recharts (~150KB gz) only ships
   to users who actually open a dashboard view. Each lazy() compiles to
   its own chunk; vite.config manualChunks then groups recharts/d3 into
   a single shared "recharts" chunk so multiple subtabs reuse the cache. */
/* Dashboard subtab lazy-loads moved into DashboardTab.jsx. The preload
   import() calls below in the prefetch effect still warm the chunks
   on idle so navigation feels instant. */
import MetricsTable, { METRICS_COLS, DEFAULT_METRICS_VISIBLE } from './components/tables/MetricsTable.jsx';
import UploadTab from './components/dataHub/UploadTab.jsx';
import ImportPanel from './components/dataHub/ImportPanel.jsx';
import PortfoliosTab from './components/portfolios/PortfoliosTab.jsx';
import DashboardTab from './components/dashboard/DashboardTab.jsx';
import CompaniesListTab from './components/companies/CompaniesListTab.jsx';
import { useCompanies, useSynthesis, useLibrary, useRecall, useImport } from './hooks/index.js';
import { PortfoliosTable } from './components/portfolios/PortfoliosTable.jsx';
import { OverlapTable } from './components/portfolios/OverlapTable.jsx';
import { CompanyDetail } from './components/companies/CompanyDetail.jsx';
import { ResearchBoard } from './components/research/ResearchBoard.jsx';
import { PerformanceTab } from './components/performance/PerformanceTab.jsx';
import { FeedbackTab } from './components/feedback/FeedbackTab.jsx';

/* Components extracted to src/components/ — see barrel index.js files in each subdirectory */
export default function App(){
  const { companies, setCompanies, saved, setSaved, ready, setReady, loadStatus, setLoadStatus, loadFailed, tpApprovals, saveStatus, lastPriceUpdate, setLastPriceUpdate, lastPriceUpdatedBy, setLastPriceUpdatedBy, entryComments, setEntryComments, newCommentText, setNewCommentText, repData, setRepData, fxRates, setFxRates, specialWeights, setSpecialWeights, benchmarkWeights, alertRules, currentUser, setCurrentUser, dark, setDark, authed, setAuthed, showUserPicker, setShowUserPicker, calLastUpdated, setCalLastUpdated, calLastUpdatedBy, setCalLastUpdatedBy, repLastUpdated, setRepLastUpdated, fxLastUpdated, setFxLastUpdated, copied, setCopied, loadFromStorage, addComment, deleteComment, updateCo, cp, annotations, updateTargetWeight, addTargetHistoryEntry, deleteTargetHistoryEntry, addTransaction, deleteTransaction, setTxInitOverride, updateInitiatedDate, targetChangeReads } = useCompanyContext();

  /* Memoize the per-company warn-alerts map so CoRow can read its own
     entry without re-evaluating alerts on every render. Recomputes only
     when companies or alertRules actually change. */
  const coAlertsByCoId = useMemo(function () {
    const out = {};
    const ctx = { lastPriceUpdate: lastPriceUpdate };
    (companies || []).forEach(function (c) {
      out[c.id] = evaluateAlertsForCompany(c, alertRules || {}, ctx)
        .filter(function (a) { return a.severity === "warn"; });
    });
    return out;
  }, [companies, alertRules, lastPriceUpdate]);

  /* Pending-TP-approval count by company id, so the Companies row's
     TP Change cell can show 'awaiting approval' when a suggestion is
     in flight. Memoized to avoid recomputing on every unrelated render
     of App.jsx. */
  const pendingTpByCoId = useMemo(function () {
    const out = {};
    (tpApprovals || []).forEach(function (r) {
      if (r.status !== "pending" || !r.companyId) return;
      out[r.companyId] = (out[r.companyId] || 0) + 1;
    });
    return out;
  }, [tpApprovals]);

  /* Rejected-TP-suggestion indicator. Set when the company's most
     recent earnings entry's tpChange has a corresponding TP
     suggestion that was REJECTED — surfaces a ✗ chip next to the
     "Decrease TP" / "Increase TP" pill on the Companies table so
     the team sees at a glance that the proposed change was voted
     down (and the TP Fixed didn't actually move). Match by
     earningsEntryId so we know the rejection lines up with the
     same entry the cell's tpChange came from. */
  const rejectedTpForLatestByCoId = useMemo(function () {
    const out = {};
    (companies || []).forEach(function (c) {
      var entries = c.earningsEntries || [];
      if (!entries.length) return;
      var today = new Date().toISOString().slice(0,10);
      var sorted = entries.slice().sort(function(a,b){return (b.reportDate||"").localeCompare(a.reportDate||"");});
      var latest = sorted.find(function(e){return e && e.reportDate && e.reportDate <= today;});
      if (!latest) return;
      /* Skip flagging if ANY approval landed for the same earnings
         entry — the approval is what counts; rejected siblings are
         just losing proposals from the same cycle (Flex had this:
         a sibling pending got auto-rejected with reason
         "Superseded by another approval" when the winning one was
         approved). Also skip self-withdrawals (rejectReason
         "Withdrawn by suggester") and the auto-reject reason,
         since both are non-decisions from the team's POV. */
      var hasApproved = (tpApprovals || []).some(function(r){
        return r && r.companyId === c.id && r.status === "approved" && r.earningsEntryId === latest.id;
      });
      if (hasApproved) return;
      var hasRejected = (tpApprovals || []).some(function(r){
        if (!r || r.companyId !== c.id || r.status !== "rejected") return false;
        if (r.earningsEntryId !== latest.id) return false;
        if (r.rejectReason === "Withdrawn by suggester") return false;
        if (r.rejectReason === "Superseded by another approval") return false;
        return true;
      });
      if (hasRejected) out[c.id] = true;
    });
    return out;
  }, [companies, tpApprovals]);

  /* Stable handlers so React.memo on CoRow is effective — without
     useCallback, every parent render creates a new function ref and
     defeats the memo's prop-equality check. */
  const handleCoSelect = useCallback(function (co, view) {
    /* Optional 2nd arg lets specific cells deep-link to a different
       sub-view — e.g. the Action / Updated / Thesis cells on the
       Companies row open straight to "earnings" since that's the page
       backing those values. Default to "dashboard" when no view is
       passed. */
    setSelCo(co); setCoView(view || "dashboard"); setTmplHighlight(""); setFlashSections({});
  }, []);
  const handleCoDelete = useCallback(function (id) {
    setCompanies(function (cs) { return cs.filter(function (c) { return c.id !== id; }); });
  }, [setCompanies]);
  const handleCoQuickUpload = useCallback(function (c) { setQuickUploadCo(c); }, []);

  const INP = "text-sm px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none";
  const CARD = "bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 mb-2";
  const LNK = "text-xs text-gray-500 dark:text-slate-400 cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 transition-colors";
  const PILL_BASE = "text-[11px] px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800";
  const TABST_BASE = "px-3.5 py-2 border rounded-md cursor-pointer text-sm transition-colors";
  const TABST_ACTIVE = TABST_BASE + " border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800 font-medium text-gray-900 dark:text-slate-100";
  const TABST_INACTIVE = TABST_BASE + " border-slate-200 dark:border-slate-700 bg-transparent font-normal text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50";
  const TABSM_BASE = "px-2.5 py-1 border rounded-md cursor-pointer text-xs whitespace-nowrap transition-colors";
  const TABSM_ACTIVE = TABSM_BASE + " border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800 font-medium text-gray-900 dark:text-slate-100";
  const TABSM_INACTIVE = TABSM_BASE + " border-slate-200 dark:border-slate-700 bg-transparent font-normal text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50";
  const TAGBTN_BASE = "text-[11px] px-1.5 py-0.5 rounded-full border cursor-pointer bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100 transition-colors";
  const TAGBTN_ACTIVE = TAGBTN_BASE + " border-slate-400 dark:border-slate-500 font-medium";
  const TAGBTN_INACTIVE = TAGBTN_BASE + " border-slate-200 dark:border-slate-700 font-normal";
  const TA_BASE = "w-full resize-y text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-[inherit] leading-relaxed focus:ring-2 focus:ring-blue-500 focus:outline-none";
  const BTN = "text-xs px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
  const BTN_PRIMARY = "text-sm px-5 py-2 font-semibold bg-blue-700 text-white border-none rounded-md cursor-pointer hover:bg-blue-800 transition-colors";
  const BTN_SM = "text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
  const LABEL = "text-[11px] text-gray-500 dark:text-slate-400 block mb-1";
  const SECTION_LABEL = "text-xs font-medium text-gray-500 dark:text-slate-400 mb-2 uppercase tracking-wide";

  const [tab,setTab]=useState("companies");
  const [showAddTargetHist,setShowAddTargetHist]=useState(false);
  const [newTargetHist,setNewTargetHist]=useState({date:"",portfolio:"",oldWeight:"",newWeight:""});
  const [showAddTx,setShowAddTx]=useState(false);
  const [newTx,setNewTx]=useState({date:"",portfolio:"",shares:"",price:"",amount:"",cashFlow:false});
  const [weightsFilter,setWeightsFilter]=useState("All");
  const [txFilter,setTxFilter]=useState("All");
  const [selCoOrigin,setSelCoOrigin]=useState(null);
  const [overlapMode,setOverlapMode]=useState("target");
  const [overlapFilter,setOverlapFilter]=useState("All");
  const [showShortcuts,setShowShortcuts]=useState(false);
  /* "⋯ More" overflow menu: houses low-frequency global toggles
     (Dark mode, Keys, API, Backup) that used to clutter the main
     toolbar. Clicking outside the dropdown closes it. */
  const [showMoreMenu,setShowMoreMenu]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [apiKeyDraft,setApiKeyDraft]=useState("");
  const [showGlobalSearch,setShowGlobalSearch]=useState(false);
  const [dashPort,setDashPort]=useState("All");
  const [dashSubTab,setDashSubTab]=useState("markets");
  /* Collapsible Companies-tab notice panels — defaults to false so the
     view stays clean; localStorage persists the user's preference. */
  const [showFyMonthMissing,setShowFyMonthMissing]=useState(function(){
    try { return localStorage.getItem("ccd:showFyMonthMissing") === "1"; } catch (e) { return false; }
  });
  const [showThisWeek,setShowThisWeek]=useState(function(){
    try { return localStorage.getItem("ccd:showThisWeek") === "1"; } catch (e) { return false; }
  });
  const [showAnnualStale,setShowAnnualStale]=useState(function(){
    try { return localStorage.getItem("ccd:showAnnualStale") === "1"; } catch (e) { return false; }
  });
  const [showTxRecon,setShowTxRecon]=useState(function(){
    try { return localStorage.getItem("ccd:showTxRecon") === "1"; } catch (e) { return false; }
  });
  const [showFollowUps,setShowFollowUps]=useState(function(){
    try { return localStorage.getItem("ccd:showFollowUps") === "1"; } catch (e) { return true; }
  });
  const [companiesView,setCompaniesView]=useState("standard"); /* "standard" | "metrics" */
  const [metricsVisibleCols,setMetricsVisibleCols]=useState(DEFAULT_METRICS_VISIBLE);
  const [calFilter,setCalFilter]=useState("All");
  const [calPortFilter,setCalPortFilter]=useState("All");
  const [showDiscussions,setShowDiscussions]=useState(false);
  const [showTpApprovals,setShowTpApprovals]=useState(false);
  const [showMeetingMemo,setShowMeetingMemo]=useState(false);

  /* Pop-out window detection. When App boots with ?popout=X in the
     URL, the page is being opened as a separate window from a main-
     window "↗ Pop out" click. We skip the full app shell and render
     just the requested modal full-window, with its onClose mapped to
     window.close() so the user can dismiss the popout the same way
     they'd dismiss any modal. Captured once on mount — re-renders
     don't re-read the URL. */
  const popoutKind = useMemo(function(){
    if (typeof window === "undefined") return null;
    var params = new URLSearchParams(window.location.search || "");
    var k = params.get("popout");
    return k === "discussions" || k === "tpApprovals" || k === "icMeeting" ? k : null;
  }, []);
  useEffect(function(){
    if (!popoutKind) return;
    /* Force the matching modal open in the popout window so the
       isolated subtree renders the right component. */
    if (popoutKind === "discussions") setShowDiscussions(true);
    else if (popoutKind === "tpApprovals") setShowTpApprovals(true);
    else if (popoutKind === "icMeeting") setShowMeetingMemo(true);
  }, [popoutKind]);
  const [discussionScope,setDiscussionScope]=useState({scope:null,portfolio:null,companyId:null});
  function openDiscussions(scope){
    setDiscussionScope(scope||{scope:null,portfolio:null,companyId:null});
    setShowDiscussions(true);
  }

  /* Single useCompanies() instance, retained as `useCompaniesApi` so
     the extracted CompaniesListTab can receive the whole bundle as
     one prop. The destructure below keeps the existing references
     working in the rest of App.jsx. */
  const useCompaniesApi = useCompanies();
  const { selCo,setSelCo,coView,setCoView,coSort,setCoSort,coSortDir,setCoSortDir,coFilter,setCoFilter,coStatusFilter,setCoStatusFilter,coStatusSubFilter,setCoStatusSubFilter,coFilterCountry,setCoFilterCountry,coFilterSector,setCoFilterSector,coSearch,setCoSearch,selectedIds,setSelectedIds,bulkStatus,setBulkStatus,bulkTier,setBulkTier,visibleCols,setVisibleCols,showColPicker,setShowColPicker,confirmClear,setConfirmClear,showNew,setShowNew,showBulk,setShowBulk,showPriceImport,setShowPriceImport,priceImportText,setPriceImportText,showRestore,setShowRestore,restoreText,setRestoreText,newName,setNewName,newNameUS,setNewNameUS,newTicker,setNewTicker,newTickerUS,setNewTickerUS,newFields,setNewFields,bulkText,setBulkText,bulkLoading,setBulkLoading,bulkPreview,setBulkPreview,tmplRaw,setTmplRaw,tmplLoading,setTmplLoading,tmplSearch,setTmplSearch,tmplHighlight,setTmplHighlight,flashSections,setFlashSections,upText,setUpText,upType,setUpType,upLoading,setUpLoading,pendingDiff,setPendingDiff,pendingMeta,setPendingMeta,pendingVal,setPendingVal,compact,setCompact,showDedupe,setShowDedupe,dupeGroups,setDupeGroups,dupeKeep,setDupeKeep,quickUploadCo,setQuickUploadCo,linkLibOpen,setLinkLibOpen,showTmplSearch,setShowTmplSearch,searchRef,addCompany,parseBulk,confirmBulk,applyBulkEdit,toggleSelect,selectAll,clearSelected,findDupes,applyDedupe,commitValuation,saveEarningsEntry,deleteEarningsEntry,acceptQuickDiff,acceptDiff,importTemplate,processUpload,applyPriceImport,handleSortClick,exportCompanyPDF,exportToPDF,exportCSV,displayedCos,flaggedCos,usedCountries,usedSectors } = useCompaniesApi;

  const { input,setInput,sources,setSources,useSrc,setUseSrc,format,setFormat,tone,setTone,custom,setCustom,output,setOutput,loading,setLoading,pendingTags,setPendingTags,autoTagSuggestions,setAutoTagSuggestions,fuQ,setFuQ,fuA,setFuA,fuLoading,setFuLoading,dupWarn,setDupWarn,cmpIds,setCmpIds,cmpOut,setCmpOut,cmpLoading,setCmpLoading,macroOut,setMacroOut,macroLoading,setMacroLoading,rsId,setRsId,rsFmt,setRsFmt,rsTone,setRsTone,rsOut,setRsOut,rsLoading,setRsLoading,synthesize,saveLib,askFollowUp,doResynth,saveResynth,doCompare,buildMacro } = useSynthesis();

  const { expanded,setExpanded,libSort,setLibSort,filterTag,setFilterTag,search,setSearch,editId,setEditId,editTitle,setEditTitle,editNote,setEditNote,updEntry,exportEntryPDF,filteredSaved,allTags,macroEntries,linkedEntries } = useLibrary(selCo);

  const { recallQ,setRecallQ,recall,setRecall,recallLoading,setRecallLoading,recallSrcs,setRecallSrcs,recallHist,setRecallHist,suggestions,setSuggestions,askRecall,genSuggestions } = useRecall();

  /* Single useImport() instance, retained as `importsApi` so the
     extracted ImportPanel can receive the whole bundle as one prop
     (avoids threading ~40 individual setters/state). App.jsx itself
     still destructures the handful of pieces it needs directly. */
  const importsApi = useImport();
  const { showDataPanel,setShowDataPanel,importText,setImportText,importError,setImportError,dataHubTab,setDataHubTab,valImportText,setValImportText,estImportText,setEstImportText,metricsImportText,setMetricsImportText,applyMetricsImport,benchmarkImportText,setBenchmarkImportText,benchmarkAsOf,setBenchmarkAsOf,applyBenchmarkImport,dashboardImportText,setDashboardImportText,applyDashboardImport,ratioImportText,setRatioImportText,applyRatioImport,financialsImportText,setFinancialsImportText,applyFinancialsImport,segmentsImportText,setSegmentsImportText,applySegmentsImport,epsRevImportText,setEpsRevImportText,applyEpsRevImport,guidanceImportText,setGuidanceImportText,applyGuidanceImport,weightsImportText,setWeightsImportText,calImportText,setCalImportText,repText,setRepText,fxText,setFxText,txText,setTxText,txReplaceMatched,setTxReplaceMatched,perfPortTargets,setPerfPortTargets,perfText,setPerfText,portTab,setPortTab,portSort,setPortSort,portSortDir,setPortSortDir,applyFxImport,applyRepImport,applyTxImport,applyPerfImport,applyCalImport,applyWeightsImport,applyValImport,applyEstImport,priceHistoryImportText,setPriceHistoryImportText,applyPriceHistoryImport,importAll,exportAll,downloadBackup } = importsApi;
  /* Pre-warm the dashboard chunks during browser idle time so the first
     click into a Dashboard subtab doesn't pay the chunk-download cost.
     Each `import('...')` here matches one of the lazy() calls at the top
     of this file; the browser caches the response, so when the user
     clicks Dashboard later React.lazy resolves instantly.
     Uses requestIdleCallback so we don't compete with user interactions
     for network/CPU; setTimeout fallback covers Safari. */
  useEffect(function () {
    function warm() {
      import('./components/dashboard/MarketsDashboard.jsx');
      import('./components/dashboard/TopBottomMovers.jsx');
      import('./components/dashboard/BreakdownView.jsx');
      import('./components/dashboard/CharacteristicsView.jsx');
      import('./components/dashboard/RatioCompareView.jsx');
      import('./components/dashboard/GeoRevView.jsx');
      import('./components/dashboard/CompareView.jsx');
      import('./components/dashboard/GuidanceCompareView.jsx');
    }
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      var id = window.requestIdleCallback(warm, { timeout: 3000 });
      return function () { try { window.cancelIdleCallback(id); } catch (e) {} };
    }
    var t = setTimeout(warm, 1500);
    return function () { clearTimeout(t); };
  }, []);

  /* Mirror `dark` to the <html> element so global rules (body bg, scroll
     gutter) pick it up. Without this the dark class only applies to the
     root <div>, and horizontal scroll exposes the body's default white
     background to the right of the React root — the "white bleed" the
     user sees in landscape on mobile. */
  useEffect(function () {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [dark]);

  useEffect(function(){
    function onKey(e){
      var tag=document.activeElement.tagName;var typing=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
      if(e.key==="?"&&!typing){setShowShortcuts(function(s){return !s;});return;}
      if(e.key==="Escape"){setShowShortcuts(false);setSelCo(null);setShowNew(false);setShowBulk(false);setShowDataPanel(false);setLinkLibOpen(false);setShowTmplSearch(false);setQuickUploadCo(null);setShowGlobalSearch(false);setShowPriceImport(false);setPendingVal(null);return;}
      if(typing)return;
      if(e.key==="/"){e.preventDefault();setShowGlobalSearch(true);return;}
      if(e.key==="n"){setTab("companies");setShowNew(true);}
      if(e.key==="b"){setTab("companies");setShowBulk(true);}
      if(e.key==="d"){setTab("dashboard");setSelCo(null);}
      if(e.key==="c")setTab("companies");
      /* j / k navigation between companies — only when looking at a
         company detail. Cycles through `displayedCos` (the filtered
         list shown on the Companies tab), so j/k respects the
         user's current filter / sort. Wraps at the ends. */
      if((e.key==="j"||e.key==="k") && tab==="companies" && selCo && displayedCos.length>0){
        var idx = displayedCos.findIndex(function(c){return c.id===selCo.id;});
        if(idx<0) idx = 0;
        var nextIdx = e.key==="j" ? (idx+1)%displayedCos.length : (idx-1+displayedCos.length)%displayedCos.length;
        var nextCo = displayedCos[nextIdx];
        if(nextCo){ setSelCo(nextCo); setCoView("dashboard"); }
      }
      /* Keyboard shortcuts to AI-dependent tabs (s/l/r → synthesize /
         library / recall) disabled while those tabs are hidden from
         the nav. Restore alongside the tab buttons if the Anthropic
         key is reinstated. */
    }
    document.addEventListener("keydown",onKey);return function(){document.removeEventListener("keydown",onKey);};
  },[]);

  var staleWatchCount=companies.filter(function(c){return c.status==="Watch"&&daysSince(c.lastReviewed)>90;}).length;
  var dashCos=dashPort==="All"?companies:companies.filter(function(c){return(c.portfolios||[]).indexOf(dashPort)>=0;});
  var dashSectors=SECTOR_ORDER.map(function(s){var own=dashCos.filter(function(c){return c.sector===s&&c.status==="Own";}).length;var focus=dashCos.filter(function(c){return c.sector===s&&c.status==="Focus";}).length;var watch=dashCos.filter(function(c){return c.sector===s&&c.status==="Watch";}).length;return{sector:s,own,focus,watch,total:own+focus+watch};}).filter(function(s){return s.total>0;}).sort(function(a,b){return b.own-a.own||b.total-a.total;});
  var sectorMax=dashSectors.reduce(function(m,s){return Math.max(m,s.own+s.focus+s.watch);},1);
  var dashCountryMap={};dashCos.forEach(function(c){if(!c.country)return;if(!dashCountryMap[c.country])dashCountryMap[c.country]={own:0,focus:0,watch:0};if(c.status==="Own")dashCountryMap[c.country].own++;else if(c.status==="Focus")dashCountryMap[c.country].focus++;else if(c.status==="Watch")dashCountryMap[c.country].watch++;});
  var dashCountryEntries=Object.entries(dashCountryMap).filter(function(e){return e[1].own>0;}).sort(function(a,b){return b[1].own-a[1].own||(b[1].focus+b[1].watch)-(a[1].focus+a[1].watch);});
  var dashCountryMax=1;dashCountryEntries.forEach(function(e){var t=e[1].own+e[1].focus+e[1].watch;if(t>dashCountryMax)dashCountryMax=t;});
  /* Header row derived from the single column schema in companyColumns.js,
     filtered by which columns the user has toggled visible. */
  var HEADER_COLS=COMPANY_COLUMNS.filter(function(c){return visibleCols.has(c.id);}).map(function(c){return{label:c.label,sort:c.sort};});
  /* Metrics comes before the TEMPLATE_SECTIONS so the first subtab of a
     company is the quick-look Metrics dashboard (its Valuation section is
     the first TEMPLATE_SECTIONS item). */
  /* Per-tab data-currency badge: ✓ = current, ⚠ = one or more FYs
     stale (re-import to refresh). See utils/dataStatus.js. The title
     attribute on stale tabs surfaces *why* via hover tooltip. */
  var sFin = getDataStatus(selCo, "financials");
  var sRat = getDataStatus(selCo, "ratios");
  var sSeg = getDataStatus(selCo, "segments");
  var sEps = getDataStatus(selCo, "epsrev");
  var sGui = getDataStatus(selCo, "guidance");
  var sSnap = getDataStatus(selCo, "snapshot");
  var sDash = getDataStatus(selCo, "dashboard");
  var sPrc  = getDataStatus(selCo, "prices");
  function tipFor(s, k){ return s === "stale" ? staleReason(selCo, k) : undefined; }
  /* Active-segments count: a segment is "active" if its most recent
     historical year has any reported value (sales / EBIT). Discontinued
     segments — where data trails off years before the latest year in
     the dataset — are excluded so the tab count and the tile list
     match what's currently meaningful. */
  function activeSegmentCount(c){
    var segs = (c && c.segments && c.segments.segments) || [];
    var years = (c && c.segments && c.segments.years) || [];
    if (segs.length === 0 || years.length === 0) return 0;
    var lastIdx = years.length - 1;
    return segs.filter(function(s){
      var sales = (s && s.sales) || [];
      var ebit  = (s && s.ebit)  || [];
      var v1 = sales[lastIdx], v2 = ebit[lastIdx];
      var has1 = v1 !== null && v1 !== undefined && v1 !== "" && isFinite(parseFloat(v1));
      var has2 = v2 !== null && v2 !== undefined && v2 !== "" && isFinite(parseFloat(v2));
      return has1 || has2;
    }).length;
  }
  var actSeg = activeSegmentCount(selCo);
  var coTabs=[{id:"dashboard",label:"Dashboard"+statusBadge(sDash),title:tipFor(sDash,"dashboard")},{id:"prices",label:"Prices"+statusBadge(sPrc),title:tipFor(sPrc,"prices")},{id:"financials",label:"Financials"+statusBadge(sFin),title:tipFor(sFin,"financials")},{id:"ratios",label:"Ratios"+statusBadge(sRat),title:tipFor(sRat,"ratios")},{id:"segments",label:"Segments"+(actSeg>0?" ("+actSeg+")":"")+statusBadge(sSeg),title:tipFor(sSeg,"segments")},{id:"epsrev",label:"E[EPS] Revisions"+statusBadge(sEps),title:tipFor(sEps,"epsrev")},{id:"guidance",label:"Guidance"+statusBadge(sGui)+((selCo&&selCo.guidance&&selCo.guidance.notes&&selCo.guidance.notes.trim())?" ✓":""),title:tipFor(sGui,"guidance")},{id:"metrics",label:"Snapshot"+statusBadge(sSnap),title:tipFor(sSnap,"snapshot")},...TEMPLATE_SECTIONS.map(function(s){var filled=selCo&&selCo.sections&&selCo.sections[s]&&selCo.sections[s].trim();return{id:"section:"+s,label:s+(filled?" ✓":""),title:filled?undefined:"Section is empty"};}),{id:"earnings",label:(function(){var ents=(selCo&&selCo.earningsEntries)||[];var hasFilled=ents.some(function(e){return e&&(e.shortTakeaway||e.extendedTakeaway||e.thesisStatus);});return "Earnings & Thesis Check"+(hasFilled?" ✓":"");})()},{id:"template",label:"Template"},
    {id:"weights",label:"Weights"+((selCo&&selCo.portWeightHistory&&selCo.portWeightHistory.length>0)?" ("+selCo.portWeightHistory.length+")":"")},
    {id:"transactions",label:"Transactions"+((selCo&&selCo.transactions&&selCo.transactions.length>0)?" ("+selCo.transactions.length+")":"")},
    {id:"linked",label:"Linked"+(linkedEntries.length>0?" ("+linkedEntries.length+")":"")},{id:"upload",label:"Upload"},{id:"history",label:"Log"+((selCo&&selCo.updateLog&&selCo.updateLog.length>0)?" ("+selCo.updateLog.length+")":"")}];

  /* Pop-out window render path — when the URL carries ?popout=X, skip
     the full app shell (toolbar, tabs, body) and render just the
     requested modal full-window. CompanyContext + DialogProvider
     wrap App at the root so all the modal's data + mutators still
     work the same way as in the main window. The modal's onClose
     calls window.close() instead of toggling local state, so dismiss
     closes the popup. */
  if (popoutKind) {
    var popoutClose = function(){ try { window.close(); } catch(_e){} };
    /* Show a loading state until the initial Supabase fetch has
       completed. Before this gate, the modal would render with the
       empty initial state ([] for annotations/tpApprovals), so a
       popout opened against a workspace with 3 discussions and 4
       pending approvals would visibly say "0" until the fetch
       finished — and the user wouldn't know whether the data was
       loading or actually missing. Once ready flips true the
       CompanyProvider has set the real arrays. */
    if (!ready) {
      return (
        <div className={"min-h-screen flex items-center justify-center font-[system-ui,sans-serif] text-sm text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-950 " + (dark ? "dark" : "")}>
          <div className="text-center">
            <div className="text-2xl mb-2">⏳</div>
            <div>Loading data…</div>
            {loadFailed && (
              <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">Initial load failed — check the main window and retry.</div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className={"min-h-screen font-[system-ui,sans-serif] text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-950 " + (dark ? "dark" : "")}>
        {popoutKind === "discussions" && (
          <DiscussionsPanel
            open={true}
            onClose={popoutClose}
            initialScope={discussionScope.scope}
            initialPortfolio={discussionScope.portfolio}
            initialCompanyId={discussionScope.companyId}
            companies={companies}
          />
        )}
        {popoutKind === "tpApprovals" && (
          <TpApprovalsPanel
            open={true}
            onClose={popoutClose}
            onNavigate={function(companyId, earningsEntryId){
              /* Cross-window navigation: open the company's earnings
                 page in the OPENER window if we can reach it, else
                 fall back to a new tab. Either way close the popout
                 so the user doesn't end up with two duplicate views
                 of the destination. */
              try {
                if (window.opener && !window.opener.closed) {
                  window.opener.focus();
                  /* Best-effort: pass the company id via URL hash so
                     the main window can pick it up. The main window
                     listens on hashchange below. */
                  window.opener.location.hash = "co=" + companyId + (earningsEntryId ? "&ee=" + earningsEntryId : "");
                }
              } catch(_e){}
              popoutClose();
            }}
          />
        )}
        {popoutKind === "icMeeting" && (
          <MeetingMemoModal open={true} onClose={popoutClose}/>
        )}
      </div>
    );
  }

  return(
    <div className={"min-h-screen p-4 font-[system-ui,sans-serif] text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-950 " + (dark ? "dark" : "")}>
      {/* Blocking overlay when the initial Supabase load failed after
          exhausting retries. Critical to render BEFORE the rest of the
          UI: with an empty companies array, any user edit (e.g. saving
          earnings entries) routes through `setCompanies(cs=>cs.map(...))`
          which silently no-ops because the company isn't in cs. The
          local view updates via setSelCo but the edit never reaches
          state.companies — auto-save sees no change — Supabase never
          gets the update — the edit dies on next reload. Four companies
          worth of earnings/thesis edits were lost this way in May 2026.
          Forcing a reload gate stops the silent-drop. */}
      {loadFailed && (
        <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 rounded-xl p-7 max-w-md shadow-2xl">
            <div className="text-base font-semibold text-rose-700 dark:text-rose-300 mb-2">⚠ Could not load data</div>
            <div className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              The app could not reach Supabase after 60 retries. Editing is blocked
              until the load succeeds — if you edit while loaded-empty, your changes
              will appear on screen but get silently dropped instead of saving.
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 mb-4">
              Check your network connection, then reload the page. If the problem
              persists, the Supabase project may be paused or rate-limited.
            </div>
            <button
              onClick={function(){ window.location.reload(); }}
              className="w-full py-2 px-4 text-sm font-medium rounded-md border border-blue-300 dark:border-blue-700 bg-blue-600 text-white cursor-pointer hover:bg-blue-700 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      )}
      {(!currentUser||showUserPicker)&&(<div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center"><div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-7 w-80 shadow-2xl"><div className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-1.5">Who are you?</div><div className="text-sm text-gray-500 dark:text-slate-400 mb-4">Select your name so edits are tracked correctly.</div><div className="flex flex-col gap-2">{TEAM_MEMBERS.map(function(name){return(<button key={name} onClick={function(){setCurrentUser(name);setShowUserPicker(false);}} className={"py-2.5 px-4 text-sm border rounded-lg cursor-pointer text-left transition-colors " + (currentUser===name ? "font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700" : "font-normal bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700")}>{name}</button>);})}</div>{currentUser&&<div className="mt-3 text-xs text-gray-500 dark:text-slate-400 text-right cursor-pointer hover:text-gray-700 dark:hover:text-slate-300" onClick={function(){setShowUserPicker(false);}}>Cancel</div>}</div></div>)}
      {showShortcuts&&(<div className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center" onClick={function(){setShowShortcuts(false);}}><div onClick={function(e){e.stopPropagation();}} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-6 py-5 min-w-[320px] shadow-2xl"><div className="text-[15px] font-semibold text-gray-900 dark:text-slate-100 mb-3.5">Keyboard Shortcuts</div>{SHORTCUTS.map(function(s){return(<div key={s.key} className="flex items-center gap-3 mb-2"><span className="text-xs px-2 py-0.5 rounded-[5px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-gray-900 dark:text-slate-100 min-w-[28px] text-center">{s.key}</span><span className="text-sm text-gray-500 dark:text-slate-400">{s.desc}</span></div>);})}<div className="mt-3.5 text-xs text-gray-500 dark:text-slate-400 text-right cursor-pointer hover:text-gray-700 dark:hover:text-slate-300" onClick={function(){setShowShortcuts(false);}}>Close (Esc)</div></div></div>)}
      {showSettings&&(<div className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center" onClick={function(){setShowSettings(false);}}>
        <div onClick={function(e){e.stopPropagation();}} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-6 py-5 w-[520px] max-w-[92vw] shadow-2xl">
          <div className="text-[15px] font-semibold text-gray-900 dark:text-slate-100 mb-1">API</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-4">Anthropic API key. Per-browser. Not shared with teammates. Currently unused — AI-dependent features are hidden until the key is reinstated.</div>
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-700 dark:text-slate-300 block mb-1">Anthropic API Key</label>
            <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">Required for AI features (synthesis, auto-fill, recall, etc.). Get a key at <span className="font-mono">console.anthropic.com</span>. Stored only in your browser's localStorage — never in the codebase or any team-shared storage.</div>
            <input
              type="password"
              value={apiKeyDraft}
              onChange={function(e){setApiKeyDraft(e.target.value);}}
              placeholder="sk-ant-..."
              className={INP + " w-full font-mono"}
              autoComplete="off"
            />
            {hasAnthropicKey()&&!apiKeyDraft&&<div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">⚠ Saving will clear the existing key.</div>}
          </div>
          {/* Per-task Claude model picker. Per-browser like the key. */}
          <div className="text-[15px] font-semibold text-gray-900 dark:text-slate-100 mb-1">Claude model per task</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-3">Defaults are the durable Claude family. Pick a faster / cheaper or more capable model per task if you want. Settings are per-browser.</div>
          {MODEL_TASKS.map(function(task){
            var label = task === "synth" ? "Synthesis / Recall / Macro"
                      : task === "extract" ? "Valuation prose → JSON extract"
                      : "Full template parse";
            return (
              <div key={task} className="mb-2.5 flex items-center gap-2">
                <label className="text-xs font-medium text-gray-700 dark:text-slate-300 w-[200px] shrink-0">{label}</label>
                <select
                  defaultValue={getModel(task)}
                  onChange={function(e){ setModel(task, e.target.value); }}
                  className={INP + " flex-1 font-mono text-xs"}
                >
                  {MODEL_OPTIONS.map(function(opt){
                    return <option key={opt.id} value={opt.id}>{opt.label}</option>;
                  })}
                </select>
              </div>
            );
          })}
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={function(){setShowSettings(false);}} className={BTN}>Cancel</button>
            {hasAnthropicKey()&&<button onClick={function(){setAnthropicKey("");setApiKeyDraft("");setShowSettings(false);}} className="text-xs px-3 py-1 rounded-md border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">Clear key</button>}
            <button onClick={function(){setAnthropicKey(apiKeyDraft);setShowSettings(false);}} className="text-xs px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</button>
          </div>
        </div>
      </div>)}
      {showTmplSearch&&<TemplateSearch companies={companies.filter(function(c){return Object.keys(c.sections||{}).length>0;})} onSelect={function(c,q){setSelCo(c);setTab("companies");setCoView("dashboard");setTmplHighlight(q);setTmplSearch(q);}} onClose={function(){setShowTmplSearch(false);}}/>} {showGlobalSearch&&<GlobalSearch companies={companies} saved={saved} onSelectCompany={function(c){setSelCo(c);setTab("companies");setCoView("dashboard");}} onSelectEntry={function(s){setTab("library");setExpanded(s.id);}} onClose={function(){setShowGlobalSearch(false);}}/>}
      {quickUploadCo&&<QuickUploadModal company={quickUploadCo} onClose={function(){setQuickUploadCo(null);}} onAccept={acceptQuickDiff}/>}
      <DiscussionsPanel open={showDiscussions} onClose={function(){setShowDiscussions(false);}} initialScope={discussionScope.scope} initialPortfolio={discussionScope.portfolio} initialCompanyId={discussionScope.companyId} companies={companies}/>
      <MeetingMemoModal open={showMeetingMemo} onClose={function(){setShowMeetingMemo(false);}}/>
      <TpApprovalsPanel
        open={showTpApprovals}
        onClose={function(){setShowTpApprovals(false);}}
        onNavigate={function(companyId, earningsEntryId){
          /* Jump to the company's Earnings & Thesis Check tab and scroll
             to the linked entry. Closes the panel first so the user
             actually sees the destination. The entry's DOM id is set in
             CompanyDetail.jsx as 'earnings-entry-{id}'. */
          var co = companies.find(function(c){return c.id===companyId;});
          if(!co) return;
          setShowTpApprovals(false);
          setSelCo(co);
          setTab("companies");
          setCoView("earnings");
          /* Defer scroll so the earnings tab has mounted. 100ms is plenty
             on modern hardware; if the entry's collapsed, the scroll lands
             on the header strip which is still useful context. */
          setTimeout(function(){
            var el = document.getElementById("earnings-entry-" + earningsEntryId);
            if(el && el.scrollIntoView) el.scrollIntoView({behavior:"smooth", block:"start"});
          }, 100);
        }}
      />

      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm pb-2 -mx-4 -mt-4 px-4 pt-4 mb-2">
        {/* Storage row \u2014 collapsed to a single status pill that shows
            the prices-updated timestamp by default, with the full
            load + save story available in the hover tooltip. Library
            pill removed (was only meaningful when Library tab was
            visible; now hidden so the count is noise). */}
        <div className="flex gap-1.5 items-center flex-wrap mb-2">
          {(function(){
            /* Single "primary" status pill: green when companies
               loaded + save healthy, amber when in-flight, red on
               persistent failure. Headline label is the prices-
               updated timestamp (highest-signal info for the team's
               daily flow); tooltip carries the full breakdown. */
            var cosLoaded = loadStatus.companies !== null && loadStatus.companies > 0;
            var loading = loadStatus.companies === null;
            var failed = saveStatus.failed > 0;
            var pending = saveStatus.pending > 0;
            var savedAt = saveStatus.lastSavedAt ? new Date(saveStatus.lastSavedAt).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}) : null;
            var label = lastPriceUpdate ? ("Prices: " + lastPriceUpdate) : (loading ? "loading\u2026" : (cosLoaded ? "Prices: \u2014" : "no data"));
            var bg, color;
            if (failed) { bg = "#fee2e2"; color = "#991b1b"; label = "\u26A0 " + saveStatus.failed + " save" + (saveStatus.failed===1?"":"s") + " failed"; }
            else if (pending || loading) { bg = "#fef9c3"; color = "#854d0e"; }
            else if (cosLoaded) { bg = "#dcfce7"; color = "#166534"; }
            var titleLines = [];
            titleLines.push(loading ? "Loading\u2026" : (cosLoaded ? "\u2713 " + loadStatus.companies + " companies in storage" : "\u26A0 No companies in storage"));
            if (lastPriceUpdate) titleLines.push("Prices last updated: " + lastPriceUpdate + (lastPriceUpdatedBy ? " by " + lastPriceUpdatedBy : ""));
            if (failed) titleLines.push("\u26A0 " + saveStatus.failed + " save(s) failed \u2014 hard-refresh to verify what persisted");
            else if (pending) titleLines.push("Auto-save in progress\u2026");
            else if (savedAt) titleLines.push("\u2713 Last saved " + savedAt);
            return (
              <span className={PILL_BASE + " border-none"} style={{background:bg,color:color}} title={titleLines.join("\n")}>{label}</span>
            );
          })()}
          {/* Old separate save-status + PriceAgeIndicator pills
              consolidated into the single status pill above. */}
        </div>
        {/* Buttons row \u2014 wraps naturally. */}
        <div className="flex gap-2 items-center flex-wrap">
        <button onClick={function(){setShowGlobalSearch(true);}} className={BTN}>{"\uD83D\uDD0D"} Search</button>
        {/* Templates button removed \u2014 its functionality (substring
            search across c.sections) is already covered by the global
            Search modal which scores +2 on sections matches. Keeping
            two surfaces for the same lookup was confusing. */}
        {(function(){var active=annotations.filter(function(a){return !a.resolved;});var mentionCount=active.filter(function(a){return ((a.mentions||[]).indexOf(currentUser)>=0||((a.replies||[]).some(function(r){return(r.mentions||[]).indexOf(currentUser)>=0;})))&&((a.readBy||[]).indexOf(currentUser)<0);}).length;var todayIso=new Date().toISOString().slice(0,10);var dueCount=annotations.filter(function(a){return a.followUpDate&&a.followUpDate<=todayIso;}).length;return(<button onClick={function(){openDiscussions();}} className={BTN+" relative"}>{"\uD83D\uDCAC"} Discussions{dueCount>0&&<span className="ml-1 text-[10px] px-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold" title={dueCount+" follow-up"+(dueCount===1?"":"s")+" due"}>\uD83D\uDCC5 {dueCount}</span>}{active.length>0&&<span className="ml-1 text-[10px] px-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold">{active.length}</span>}{mentionCount>0&&<span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500"/>}</button>);})()}
        {(function(){
          /* TP Approvals button \u2014 mirrors the Discussions chip pattern.
             Amber count = total pending. Red dot when there's a pending
             record this user has the power to act on (suggester \u2260 me).
             Unread tracking reuses readBy[], so the dot clears the next
             time the panel is opened and the cards mark themselves read. */
          var pending=(tpApprovals||[]).filter(function(r){return r.status==="pending";});
          var actionable=pending.filter(function(r){return r.suggestedBy!==currentUser&&!(r.readBy||[]).includes(currentUser);}).length;
          return (
            <button onClick={function(){setShowTpApprovals(true);}} className={BTN+" relative"} title="TP changes awaiting review">
              {"\uD83C\uDFAF"} TP Approvals
              {pending.length>0 && <span className="ml-1 text-[10px] px-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold">{pending.length}</span>}
              {actionable>0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500"/>}
            </button>
          );
        })()}
        {(function(){
          /* IC Meeting chip \u2014 counts pending agenda entries (isAgenda:true)
             across BOTH meeting profiles. Previously also summed
             "unseen recent target changes" but that section was removed
             from the Agenda tab, so the chip stays focused on
             genuinely-pending IC items. */
          var allMeetingPorts = [];
          Object.values(MEETING_PROFILES || {}).forEach(function(p){
            (p.ports || []).forEach(function(port){
              if (allMeetingPorts.indexOf(port) < 0) allMeetingPorts.push(port);
            });
          });
          var totalPending = 0;
          (companies || []).forEach(function(c){
            (c.portWeightHistory || []).forEach(function(h){
              if (!h || !h.portfolio) return;
              if (allMeetingPorts.indexOf(h.portfolio) < 0) return;
              if (h.isAgenda) totalPending++;
            });
          });
          var chipCount = totalPending;
          return (
            <button onClick={function(){setShowMeetingMemo(true);}} className={BTN+" relative"} title="Open the IC Meeting agenda + compliance memo">
              {"\uD83D\uDCDD"} IC Meeting
              {chipCount>0 && (
                /* Purple chip \u2014 distinct from Discussions (blue) +
                   TP Approvals (amber). Avoids red/green which carry
                   their own semantic baggage. */
                <span className="ml-1 text-[10px] px-1.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold">{chipCount}</span>
              )}
            </button>
          );
        })()}
        {/* AlertsPanel (flags) moved here next to IC Meeting so all
            three "things demanding attention" surfaces (Discussions /
            TP Approvals / IC Meeting / Alerts) sit together on the
            left side of the toolbar \u2014 instead of Alerts being
            stranded at the far right. */}
        <AlertsPanel onJumpToCompany={function(cid, ruleId){
          var co=companies.find(function(c){return c.id===cid;});
          if(!co) return;
          /* Route each warn-level rule to the most actionable subtab.
             - eps-revisions-trend → E[EPS] Revisions chart
             - guidance-revised    → Guidance tab
             - mos-divergence      → Valuation section (TP Suggest lives here)
             - price-1d            → Prices tab
             Other rules fall through to whatever coView was last open. */
          var ruleToView = {
            "eps-revisions-trend": "epsrev",
            "guidance-revised":    "guidance",
            "mos-divergence":      "section:Valuation",
            "price-1d":            "prices",
          };
          var view = ruleToView[ruleId];
          setSelCo(co);
          setTab("companies");
          if(view) setCoView(view);
        }}/>
        {/* "Compact / Default" toggle moved to the Companies tab's
            Columns picker (top of the dropdown) \u2014 that toggle only
            ever affected the Standard view's column set, so housing
            it next to the column toggles is the right home. */}
        <button onClick={function(){
          /* Hard reload that picks up new deploys. Strategy:
             1. Bust any service-worker / Cache Storage entries (some
                browsers cache HTML+assets there).
             2. Force a no-cache reload by navigating to the same URL
                with a fresh cache-busting query param. Plain
                location.reload() respects HTTP caches; query change
                forces the browser to round-trip.
             3. Hard timeout: if caches.keys() hangs (seen on some
                Safari/Firefox builds), reload anyway after 1.2s so
                users don't get stuck staring at the spinner. */
          var reloaded = false;
          function doReload(){
            if (reloaded) return;
            reloaded = true;
            var u = new URL(window.location.href);
            u.searchParams.set("_r", Date.now().toString(36));
            window.location.replace(u.toString());
          }
          setTimeout(doReload, 1200);
          try {
            if (typeof caches !== "undefined" && caches.keys) {
              caches.keys().then(function(keys){
                return Promise.all(keys.map(function(k){return caches.delete(k);}));
              }).finally(doReload).catch(doReload);
              return;
            }
          } catch (e) {}
          doReload();
        }} className={BTN} title="Refresh page from network \u2014 picks up any new deploy + reloads all data">{"\u21BA"} Reload</button>
        {/* ⋯ More menu — collapses low-frequency global toggles
            (Import, Dark mode, ? Keys, API, ⇩ Backup) into a single
            dropdown. Each was a standalone button before; the toolbar
            was getting too wide. Import lives here too since with the
            FactSet automated pulls landing daily, manual paste-imports
            are now rare. Clicking outside closes the menu. */}
        <div className="relative">
          <button onClick={function(){setShowMoreMenu(function(s){return !s;});}} className={BTN}>⋯ More</button>
          {showMoreMenu && (
            <>
              <div className="fixed inset-0 z-[90]" onClick={function(){setShowMoreMenu(false);}}/>
              <div className="absolute right-0 top-[calc(100%+4px)] z-[100] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg min-w-[180px] py-1">
                <button
                  onClick={function(){setShowDataPanel(function(s){return !s;});setShowMoreMenu(false);}}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-gray-900 dark:text-slate-100"
                  title="Open the manual data-paste panel (prices, weights, performance, etc.)"
                >{showDataPanel?"✕ Close Import":"⇪ Import"}</button>
                <button
                  onClick={function(){setDark(function(d){return !d;});setShowMoreMenu(false);}}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-gray-900 dark:text-slate-100"
                >{dark?"☀ Light mode":"🌙 Dark mode"}</button>
                <button
                  onClick={function(){setShowShortcuts(true);setShowMoreMenu(false);}}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-gray-900 dark:text-slate-100"
                >? Keys</button>
                <button
                  onClick={function(){setApiKeyDraft(ANTHROPIC_KEY||"");setShowSettings(true);setShowMoreMenu(false);}}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-gray-900 dark:text-slate-100"
                  title="Set / clear the Anthropic API key. Currently unused — AI-dependent features are hidden."
                >⚙ API</button>
                <button
                  onClick={function(){downloadBackup();setShowMoreMenu(false);}}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-gray-900 dark:text-slate-100"
                  title="Download a JSON backup of all data"
                >{copied==="downloadbackup"?"✓ Backup saved":"⇩ Backup"}</button>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
      {flaggedCos.length>0&&(<div className="mb-2 px-3.5 py-2 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg flex gap-2.5 items-center flex-wrap"><span className="text-xs font-semibold text-red-800 dark:text-red-300">{"\u2691"} Flagged ({flaggedCos.length}):</span>{flaggedCos.map(function(c){var fs=FLAG_STYLES[c.flag];return(<span key={c.id} onClick={function(){setSelCo(c);setTab("companies");}} className="text-[11px] px-2 py-0.5 rounded-full cursor-pointer" style={{background:fs.bg,color:fs.color,border:"1px solid "+fs.color}}>{fs.icon} {c.name}</span>);})}</div>)}
      <ImportPanel
        imports={Object.assign({}, importsApi, { priceImportText: priceImportText, setPriceImportText: setPriceImportText, applyPriceImport: applyPriceImport })}
        benchmarkWeights={benchmarkWeights}
        calLastUpdated={calLastUpdated}
        calLastUpdatedBy={calLastUpdatedBy}
        fxLastUpdated={fxLastUpdated}
        repLastUpdated={repLastUpdated}
      />
      <div className="border-t border-slate-200 dark:border-slate-700 mb-2.5"/>
      {/* Top-level nav: horizontally-scrollable strip on small screens
          (saves vertical space — 12 buttons would wrap to 3 rows on a
          phone), wraps normally on desktop. */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {/* Top-level tabs trimmed:
            - AI tabs (Synthesize / Library / Recall / Macro Master)
              hidden — Anthropic key revoked.
            - Research + Earnings Calendar moved into Companies as
              subtabs (alongside Standard / Metrics).
            - Feedback moved into Dashboard as a subtab.
            Code paths for "research" / "calendar" / "feedback" tab
            values still render — the subnav buttons just set the
            tab state to those values + the parent tab to its
            container. */}
        {/* Compare tab also hidden — it uses the AI doCompare flow
            which depends on the revoked Anthropic key. */}
        {[["portfolios","Portfolios"],["companies","Companies"],["dashboard","Dashboard"],["performance","Performance"]].map(function(item){return <button key={item[0]} className={(tab===item[0]?TABST_ACTIVE:TABST_INACTIVE)+" whitespace-nowrap shrink-0"} onClick={function(){setTab(item[0]);if(item[0]!=="companies")setSelCo(null);}}>{item[1]}</button>;})}
      </div>

<ErrorBoundary resetKey={tab}>
      {tab==="portfolios"&&(<PortfoliosTab
        portTab={portTab} setPortTab={setPortTab}
        portSort={portSort} setPortSort={setPortSort}
        portSortDir={portSortDir} setPortSortDir={setPortSortDir}
        overlapMode={overlapMode} setOverlapMode={setOverlapMode}
        overlapFilter={overlapFilter} setOverlapFilter={setOverlapFilter}
        setSelCo={setSelCo} setTab={setTab} setCoView={setCoView} setSelCoOrigin={setSelCoOrigin}
        setTxFilter={setTxFilter} openDiscussions={openDiscussions}
        setShowAddTx={setShowAddTx} setNewTx={setNewTx}
      />)}
     {/* tab==="calendar" render moved into the Companies subtab block
         (companiesView==="calendar"). Bulk import section at the
         bottom dropped — the dedicated Earnings Dates import in
         Import already handles the same paste. */}

      {tab==="dashboard"&&(<DashboardTab
        dashSubTab={dashSubTab} setDashSubTab={setDashSubTab}
        showAnnualStale={showAnnualStale} setShowAnnualStale={setShowAnnualStale}
        showTxRecon={showTxRecon} setShowTxRecon={setShowTxRecon}
        staleWatchCount={staleWatchCount}
        setSelCo={setSelCo} setTab={setTab} setCoView={setCoView}
      />)}

      {/* tab==="research" and tab==="calendar" no longer reachable —
          Research and Calendar are now subtabs of Companies (rendered
          inside the companies block via companiesView). Feedback moved
          to Dashboard as a dashSubTab; rendered in that section
          below. */}

      {tab==="performance"&&(<PerformanceTab/>)}

      {tab==="companies"&&!selCo&&(<CompaniesListTab
        useCompaniesApi={useCompaniesApi}
        calFilter={calFilter} setCalFilter={setCalFilter}
        calPortFilter={calPortFilter} setCalPortFilter={setCalPortFilter}
        coAlertsByCoId={coAlertsByCoId}
        companiesView={companiesView} setCompaniesView={setCompaniesView}
        handleCoDelete={handleCoDelete} handleCoQuickUpload={handleCoQuickUpload} handleCoSelect={handleCoSelect}
        metricsVisibleCols={metricsVisibleCols} setMetricsVisibleCols={setMetricsVisibleCols}
        openDiscussions={openDiscussions}
        pendingTpByCoId={pendingTpByCoId} rejectedTpForLatestByCoId={rejectedTpForLatestByCoId}
        setSelCoOrigin={setSelCoOrigin}
        showFollowUps={showFollowUps} setShowFollowUps={setShowFollowUps}
        showFyMonthMissing={showFyMonthMissing} setShowFyMonthMissing={setShowFyMonthMissing}
        showThisWeek={showThisWeek} setShowThisWeek={setShowThisWeek}
        setTab={setTab}
      />)}

      {tab==="companies"&&selCo&&(<CompanyDetail selCo={selCo} setSelCo={setSelCo} coView={coView} setCoView={setCoView} coTabs={coTabs} pendingVal={pendingVal} setPendingVal={setPendingVal} tmplRaw={tmplRaw} setTmplRaw={setTmplRaw} tmplLoading={tmplLoading} tmplSearch={tmplSearch} setTmplSearch={setTmplSearch} tmplHighlight={tmplHighlight} setTmplHighlight={setTmplHighlight} flashSections={flashSections} upText={upText} setUpText={setUpText} upType={upType} setUpType={setUpType} upLoading={upLoading} pendingDiff={pendingDiff} setPendingDiff={setPendingDiff} pendingMeta={pendingMeta} setPendingMeta={setPendingMeta} commitValuation={commitValuation} saveEarningsEntry={saveEarningsEntry} deleteEarningsEntry={deleteEarningsEntry} acceptDiff={acceptDiff} importTemplate={importTemplate} processUpload={processUpload} exportCompanyPDF={exportCompanyPDF} linkLibOpen={linkLibOpen} setLinkLibOpen={setLinkLibOpen} setTab={setTab} selCoOrigin={selCoOrigin} setSelCoOrigin={setSelCoOrigin} showAddTargetHist={showAddTargetHist} setShowAddTargetHist={setShowAddTargetHist} newTargetHist={newTargetHist} setNewTargetHist={setNewTargetHist} showAddTx={showAddTx} setShowAddTx={setShowAddTx} newTx={newTx} setNewTx={setNewTx} weightsFilter={weightsFilter} setWeightsFilter={setWeightsFilter} txFilter={txFilter} setTxFilter={setTxFilter} openDiscussions={openDiscussions} saved={saved} linkedEntries={linkedEntries} setExpanded={setExpanded} setSaved={setSaved} updEntry={updEntry}/>)}

      {tab==="synthesize"&&(<div>
        <div className="flex gap-2 mb-2.5 flex-wrap">
          <div className="flex-1 min-w-[150px]"><label className={LABEL}>Format</label><select value={format} onChange={function(e){setFormat(e.target.value);}} className={INP + " w-full"}>{FORMATS.map(function(f){return <option key={f}>{f}</option>;})}</select></div>
          <div className="flex-1 min-w-[130px]"><label className={LABEL}>Tone</label><select value={tone} onChange={function(e){setTone(e.target.value);}} className={INP + " w-full"}>{TONES.map(function(t){return <option key={t}>{t}</option>;})}</select></div>
        </div>
        {format==="Custom"&&<textarea value={custom} onChange={function(e){setCustom(e.target.value);}} placeholder="Custom format..." className={TA_BASE + " mb-2.5"} style={{minHeight:60}}/>}
        <div className="flex items-center gap-2 mb-2"><input type="checkbox" id="sl" checked={useSrc} onChange={function(e){setUseSrc(e.target.checked);}}/><label htmlFor="sl" className="text-sm text-gray-500 dark:text-slate-400 cursor-pointer">Label sources separately</label></div>
        {useSrc?(<div className="mb-2">{sources.map(function(s,i){return(<div key={i} className="flex gap-1.5 mb-1.5 items-start"><input value={s.label} onChange={function(e){var n=sources.slice();n[i]={...n[i],label:e.target.value};setSources(n);}} className={INP + " w-[100px]"}/><textarea value={s.text} onChange={function(e){var n=sources.slice();n[i]={...n[i],text:e.target.value};setSources(n);}} className={TA_BASE + " flex-1"} style={{minHeight:60}}/>{sources.length>1&&<span onClick={function(){setSources(sources.filter(function(_,j){return j!==i;}));}} className={LNK + " pt-2"}>{"\u00D7"}</span>}</div>);})} <button onClick={function(){setSources(sources.concat([{label:"Source "+(sources.length+1),text:""}]));}} className={BTN}>+ Add source</button></div>):(<textarea value={input} onChange={function(e){setInput(e.target.value);}} placeholder="Paste raw research..." className={TA_BASE + " mb-2"} style={{minHeight:140}}/>)}
        <div className="mb-2.5"><div className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">Tags</div><div className="flex gap-1.5 flex-wrap">{PRESET_TAGS.map(function(t){return <span key={t} onClick={function(){setPendingTags(function(p){return p.indexOf(t)>=0?p.filter(function(x){return x!==t;}):p.concat([t]);});}} className={pendingTags.indexOf(t)>=0?TAGBTN_ACTIVE:TAGBTN_INACTIVE}>{t}</span>;})}</div></div>
        {dupWarn&&<div className="text-sm rounded-md px-3 py-2 mb-2 flex gap-2.5 items-center" style={{color:"#854d0e",background:"#fef9c3"}}>Similar entry exists.<span onClick={function(){saveLib(true);}} className="cursor-pointer font-medium">Save anyway</span><span onClick={function(){setDupWarn(false);}} className="cursor-pointer">Cancel</span></div>}
        <div className="flex gap-2">
          <button onClick={synthesize} disabled={loading||(!input.trim()&&!sources.some(function(s){return s.text.trim();}))} className="flex-1 py-2.5 font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50">{loading?"Synthesizing...":"Synthesize"}</button>
          {output&&<button onClick={function(){saveLib(false);}} className={BTN + " py-2.5 px-4"}>Save</button>}
        </div>
        {output&&(<div className={CARD + " mt-6"}>
          <div className="flex justify-between items-center mb-2">
            <div className="flex gap-1.5 items-center flex-wrap"><span className="text-[11px] text-gray-500 dark:text-slate-400 uppercase">{format} - {tone}</span>{getConf(output)&&<span className="text-[11px] px-1.5 py-0.5 rounded-full border-none" style={{background:CONF_BG[getConf(output)],color:CONF_COLOR[getConf(output)]}}>{getConf(output)} confidence</span>}<span className={PILL_BASE}>{fmtTime(output)}</span></div>
            <div className="flex gap-2"><span onClick={function(){cp(output,"out");}} className={LNK}>{copied==="out"?"\u2713 Copied!":"Copy"}</span><span onClick={function(){downloadMD("synthesis",toMD({title:"Synthesis",format,tone,date:todayStr(),tags:pendingTags,result:output}));}} className={LNK}>{"\u2B07"} .md</span></div>
          </div>
          {autoTagSuggestions.length>0&&(<div className="mb-2.5 px-2.5 py-2 bg-slate-100 dark:bg-slate-800/50 rounded-md text-xs text-gray-500 dark:text-slate-400"><span>Companies detected: </span>{autoTagSuggestions.map(function(name){var already=pendingTags.indexOf(name)>=0;return <span key={name} onClick={function(){if(!already)setPendingTags(function(p){return p.concat([name]);});}} className="ml-1.5 text-[11px] px-1.5 py-0 rounded-full" style={{border:"1px solid "+(already?"#94a3b8":"#e2e8f0"),background:already?"#dcfce7":undefined,color:already?"#166534":undefined,cursor:already?"default":"pointer"}}>{already?"\u2713 ":""}{name}</span>;})} <span className="ml-2 opacity-60">-- click to tag</span></div>)}
          <div className="text-sm leading-7 text-gray-900 dark:text-slate-100" dangerouslySetInnerHTML={{__html:toHTML(output)}}/>
          <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-2.5"><div className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">Follow-up question</div><div className="flex gap-1.5"><input value={fuQ} onChange={function(e){setFuQ(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")askFollowUp();}} placeholder="Ask about this synthesis..." className={INP + " flex-1"}/><button onClick={askFollowUp} disabled={fuLoading||!fuQ.trim()} className={BTN}>{fuLoading?"...":"Ask"}</button></div>{fuA&&<div className="mt-2 text-sm leading-7 text-gray-900 dark:text-slate-100" dangerouslySetInnerHTML={{__html:toHTML(fuA)}}/>}</div>
        </div>)}
      </div>)}

      {tab==="library"&&(<div>
        <div className="flex gap-2 mb-2.5 items-center flex-wrap"><input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Search..." className={INP + " flex-1 min-w-[130px]"}/><select value={libSort} onChange={function(e){setLibSort(e.target.value);}} className={INP}>{LIB_SORTS.map(function(s){return <option key={s}>{s}</option>;})}</select></div>
        {allTags.length>1&&<div className="flex gap-1.5 flex-wrap mb-2.5">{allTags.map(function(t){return <span key={t} onClick={function(){setFilterTag(t);}} className={filterTag===t?TAGBTN_ACTIVE:TAGBTN_INACTIVE}>{t}</span>;})}</div>}
        <div className="text-xs text-gray-500 dark:text-slate-400 mb-2.5">{filteredSaved.length} entries</div>
        {filteredSaved.length===0?<p className="text-sm text-gray-500 dark:text-slate-400">No entries found.</p>:filteredSaved.map(function(s){return(
          <div key={s.id} className={"mb-2 bg-slate-50 dark:bg-slate-800 rounded-lg overflow-hidden border " + (s.pinned?"border-slate-400 dark:border-slate-500":"border-slate-200 dark:border-slate-700")}>
            <div onClick={function(){setExpanded(expanded===s.id?null:s.id);}} className="px-3.5 py-2.5 cursor-pointer flex gap-2.5 items-start hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">{s.pinned&&<span className="text-[10px]">{"\uD83D\uDCCC"}</span>}<span className="text-sm font-medium text-gray-900 dark:text-slate-100">{s.title}</span><span className={PILL_BASE}>{s.format}</span>{getConf(s.result)&&<span className="text-[11px] px-1.5 py-0.5 rounded-full border-none" style={{background:CONF_BG[getConf(s.result)],color:CONF_COLOR[getConf(s.result)]}}>{getConf(s.result)}</span>}{(s.tags||[]).map(function(t){return <span key={t} className={PILL_BASE}>{t}</span>;})}<span className={PILL_BASE + " ml-auto"}>{fmtTime(s.result)}</span><span className={PILL_BASE}>{s.date}</span></div>
                <p className="text-sm text-gray-500 dark:text-slate-400 m-0 leading-relaxed">{getCore(s.result)}</p>
              </div>
              <span className="text-sm text-gray-500 dark:text-slate-400 shrink-0 pt-0.5">{expanded===s.id?"\u25B2":"\u25BC"}</span>
            </div>
            {expanded===s.id&&(<div className="border-t border-slate-200 dark:border-slate-700 px-3.5 py-3">
              {editId===s.id&&(<div className="mb-2.5"><input value={editTitle} onChange={function(e){setEditTitle(e.target.value);}} className={INP + " w-full mb-1.5 box-border"}/><textarea value={editNote} onChange={function(e){setEditNote(e.target.value);}} placeholder="Add a note..." className={TA_BASE + " mb-1.5"} style={{minHeight:50}}/><div className="flex gap-2"><button onClick={function(){updEntry(s.id,{title:editTitle,note:editNote});setEditId(null);}} className={BTN}>Save</button><span onClick={function(){setEditId(null);}} className={LNK}>Cancel</span></div></div>)}
              {rsId===s.id&&(<div className="mb-2.5 px-2.5 py-2.5 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700"><div className="flex gap-2 mb-2"><select value={rsFmt} onChange={function(e){setRsFmt(e.target.value);}} className={INP + " flex-1"}>{FORMATS.map(function(f){return <option key={f}>{f}</option>;})}</select><select value={rsTone} onChange={function(e){setRsTone(e.target.value);}} className={INP + " flex-1"}>{TONES.map(function(t){return <option key={t}>{t}</option>;})}</select><button onClick={doResynth} disabled={rsLoading} className={BTN}>{rsLoading?"...":"Run"}</button></div>{rsOut&&(<><div className="text-sm leading-7 mb-2 text-gray-900 dark:text-slate-100" dangerouslySetInnerHTML={{__html:toHTML(rsOut)}}/><div className="flex gap-2.5"><button onClick={saveResynth} className={BTN}>Save as new</button><span onClick={function(){setRsId(null);setRsOut("");}} className={LNK}>Close</span></div></>)}</div>)}
              {editId!==s.id&&rsId!==s.id&&<div className="text-sm leading-7 mb-2.5 text-gray-900 dark:text-slate-100" dangerouslySetInnerHTML={{__html:toHTML(s.result)}}/>}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5 mt-1">   <div className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">{"\uD83D\uDCAC"} Comments ({(entryComments[s.id]||[]).length})</div>   {(entryComments[s.id]||[]).map(function(c){return(<div key={c.id} className="flex gap-2 items-start mb-2 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-md"><div className="flex-1"><div className="flex gap-1.5 items-center mb-0.5"><span className="text-[11px] font-semibold text-gray-900 dark:text-slate-100">{c.author}</span><span className="text-[10px] text-gray-500 dark:text-slate-400">{c.date}</span></div><div className="text-xs text-gray-900 dark:text-slate-100 leading-relaxed">{c.text}</div></div>{(c.author===currentUser||!c.author)&&<span onClick={function(){deleteComment(s.id,c.id);}} className="text-[10px] text-red-600 dark:text-red-400 cursor-pointer shrink-0">{"\u00D7"}</span>}</div>);})}   <div className="flex gap-1.5 mt-1">     <input value={newCommentText[s.id]||""} onChange={function(e){setNewCommentText(function(prev){return Object.assign({},prev,{[s.id]:e.target.value});});}} onKeyDown={function(e){if(e.key==="Enter"&&(newCommentText[s.id]||"").trim()){addComment(s.id,newCommentText[s.id]||"");}}} placeholder={"Comment as "+(currentUser||"Unknown")+"..."} className={INP + " flex-1 !text-xs"}/>     <button onClick={function(){addComment(s.id,newCommentText[s.id]||"");}} className={BTN}>Post</button>   </div> </div> <div className="flex gap-2.5 justify-end flex-wrap border-t border-slate-200 dark:border-slate-700 pt-2.5">
                <span onClick={function(){updEntry(s.id,{pinned:!s.pinned});}} className={LNK}>{s.pinned?"Unpin":"Pin"}</span>
                <span onClick={function(){setEditId(s.id);setEditTitle(s.title);setEditNote(s.note||"");}} className={LNK}>Rename</span>
                <span onClick={function(){setRsId(s.id);setRsOut("");}} className={LNK}>Re-synthesize</span>
                <span onClick={function(){cp(s.result,s.id+"c");}} className={LNK}>{copied===s.id+"c"?"\u2713 Copied!":"Copy"}</span>
                <span onClick={function(){downloadMD(s.title,toMD(s));}} className={LNK}>{"\u2B07"} .md</span> <span onClick={function(){exportEntryPDF(s);}} className={LNK}>{"\u2B07"} PDF</span>
                <span onClick={function(){setSaved(function(p){return p.filter(function(e){return e.id!==s.id;});});setExpanded(null);}} className={LNK + " text-red-600 dark:text-red-400"}>Delete</span>
              </div>
            </div>)}
          </div>
        );})}
      </div>)}

      {tab==="recall"&&(<div>
        {saved.length>0&&suggestions.length===0&&<button onClick={genSuggestions} className={BTN + " mb-3"}>Generate suggested questions</button>}
        {suggestions.length>0&&(<div className="mb-3"><div className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">Suggested questions</div><div className="flex flex-col gap-1">{suggestions.map(function(q,i){return <div key={i} onClick={function(){setRecallQ(q);}} className="text-sm px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 cursor-pointer text-gray-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">{q}</div>;})}</div></div>)}
        <textarea value={recallQ} onChange={function(e){setRecallQ(e.target.value);}} placeholder="Ask a question across all saved research..." className={TA_BASE} style={{minHeight:80}}/>
        <button onClick={askRecall} disabled={recallLoading||!recallQ.trim()||!saved.length} className="mt-2 w-full py-2.5 font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50">{recallLoading?"Searching...":"Ask across "+saved.length+" entr"+(saved.length===1?"y":"ies")}</button>
        {recall&&(<div className="mt-6"><div className={CARD + " text-sm leading-7 text-gray-900 dark:text-slate-100"} dangerouslySetInnerHTML={{__html:toHTML(recall)}}/>{recallSrcs.length>0&&(<div className="mt-2"><div className="text-xs text-gray-500 dark:text-slate-400 mb-1">Sources used</div><div className="flex gap-1.5 flex-wrap">{recallSrcs.map(function(s){return <span key={s.id} className={PILL_BASE}>{s.title}</span>;})}</div></div>)}</div>)}
        {recallHist.length>0&&(<div className="mt-6"><div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Recent questions</div>{recallHist.map(function(h){return(<div key={h.ts} className={CARD + " !mb-1.5"}><div className="text-sm font-medium mb-1 cursor-pointer text-gray-900 dark:text-slate-100" onClick={function(){setRecallQ(h.q);}}>{h.q}</div><div className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed" dangerouslySetInnerHTML={{__html:toHTML(h.a.slice(0,200)+(h.a.length>200?"...":""))}}/></div>);})}</div>)}
      </div>)}

              {tab==="compare"&&(<div>
        <div className="flex gap-2 mb-2.5 flex-wrap"><button onClick={function(){setCmpIds(saved.filter(function(s){return filterTag==="All"||(s.tags||[]).indexOf(filterTag)>=0;}).slice(0,3).map(function(s){return s.id;}));}} className={BTN}>Auto-select by tag</button><select value={filterTag} onChange={function(e){setFilterTag(e.target.value);}} className={INP}>{allTags.map(function(t){return <option key={t}>{t}</option>;})}</select></div>
        {saved.length<2?<p className="text-sm text-gray-500 dark:text-slate-400">Save at least 2 entries to compare.</p>:(<><div className="flex flex-col gap-1 mb-2.5">{saved.map(function(s){var sel=cmpIds.indexOf(s.id)>=0;return(<div key={s.id} onClick={function(){setCmpIds(function(p){return sel?p.filter(function(x){return x!==s.id;}):p.length<3?p.concat([s.id]):p;});}} className={"px-3 py-2 rounded-md cursor-pointer flex items-center gap-2 border transition-colors " + (sel?"border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-800":"border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800")}><div className="w-3.5 h-3.5 rounded-[3px] shrink-0" style={{border:"1px solid "+(sel?"#3b82f6":"#cbd5e1"),background:sel?"#dbeafe":"transparent"}}/><span className={"text-sm flex-1 text-gray-900 dark:text-slate-100 " + (sel?"font-medium":"font-normal")}>{s.title}</span><span className={PILL_BASE}>{s.format}</span><span className={PILL_BASE}>{s.date}</span></div>);})}</div><button onClick={doCompare} disabled={cmpIds.length<2||cmpLoading} className="w-full py-2.5 font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50">{cmpLoading?"Comparing...":"Compare "+cmpIds.length+" entr"+(cmpIds.length===1?"y":"ies")}</button>{cmpOut&&<div className={CARD + " mt-6 text-sm leading-7 text-gray-900 dark:text-slate-100"} dangerouslySetInnerHTML={{__html:toHTML(cmpOut)}}/>}</>)}
      </div>)}

      {tab==="macro"&&(<div>
        <div className="flex items-center justify-between mb-2.5"><span className="text-sm text-gray-500 dark:text-slate-400">{macroEntries.length} Macro entries</span><button onClick={buildMacro} disabled={macroLoading||!macroEntries.length} className="py-1.5 px-3.5 font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50">{macroLoading?"Building...":"Build master"}</button></div>
        {!macroEntries.length?<p className="text-sm text-gray-500 dark:text-slate-400">Tag entries with "Macro" to include them here.</p>:(<div className="mb-3"><div className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">Entries included</div><div className="flex flex-col gap-1">{macroEntries.map(function(s){return <div key={s.id} className={CARD + " !mb-0 flex gap-2 items-center text-sm text-gray-900 dark:text-slate-100"}><span className="flex-1">{s.title}</span><span className={PILL_BASE}>{s.date}</span></div>;})}</div></div>)}
        {macroOut&&(<div className="mt-4"><div className={CARD + " text-sm leading-7 text-gray-900 dark:text-slate-100"} dangerouslySetInnerHTML={{__html:toHTML(macroOut)}}/><div className="mt-2.5 flex gap-2.5"><span onClick={function(){cp(macroOut,"macro");}} className={LNK}>{copied==="macro"?"\u2713 Copied!":"Copy"}</span><span onClick={function(){downloadMD("macro_master",macroOut);}} className={LNK}>{"\u2B07"} .md</span><span onClick={function(){setSaved(function(p){return [{id:Date.now(),title:"Macro Master - "+todayStr(),format:"Executive Summary",tone:"Professional",result:macroOut,tags:["Macro"],date:todayStr(),ts:Date.now(),pinned:true,note:""}].concat(p);});}} className={LNK}>Save to library</span></div></div>)}
      </div>)}
</ErrorBoundary>
    </div>
  );
}
