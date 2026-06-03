/* Dashboard tab — extracted from App.jsx.
 *
 * Renders the dashboard sub-tab strip and the active inner view.
 * Most subtabs are lazy-loaded (Markets, Movers, Characteristics,
 * Ratio Compare, Breakdowns, GeoRev, Side-by-Side, Guidance Compare)
 * and each is wrapped in its OWN ErrorBoundary so a render failure
 * in one chart doesn't take the whole tab down.
 *
 * The "Data Quality" subtab is rendered inline (not lazy) because
 * it's pure derivation over the in-memory `companies` array — no
 * chart libs to chunk-split. It has four warning panels:
 *   - Stale annual data (collapsible)
 *   - Transaction reconciliation (collapsible)
 *   - Date-format audit + one-click ISO normalizer
 *   - Missing-field stat cards + stale-review list
 *
 * Reads companies/setCompanies/repData straight from context; the
 * rest (dashSubTab, navigation callbacks, collapsible state) comes
 * in via props because App.jsx owns it.
 */
import { Suspense, lazy } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { ErrorBoundary } from '../ErrorBoundary.jsx';
import { StatusPill } from '../ui/index.js';
import { FeedbackTab } from '../feedback/FeedbackTab.jsx';
import { annualStaleStatus } from '../../utils/dataStatus.js';
import { daysSince, parseDate } from '../../utils/index.js';

const MarketsDashboard    = lazy(() => import('./MarketsDashboard.jsx'));
const TopBottomMovers     = lazy(() => import('./TopBottomMovers.jsx'));
const BreakdownView       = lazy(() => import('./BreakdownView.jsx'));
const CharacteristicsView = lazy(() => import('./CharacteristicsView.jsx'));
const GeoRevView          = lazy(() => import('./GeoRevView.jsx'));
const CompareView         = lazy(() => import('./CompareView.jsx'));
const GuidanceCompareView = lazy(() => import('./GuidanceCompareView.jsx'));
const RatioCompareView    = lazy(() => import('./RatioCompareView.jsx'));

/* Tailwind class strings duplicated from App.jsx — keeps this
   component self-contained. */
const CARD = "bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 mb-2";
const PILL_BASE = "text-[11px] px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800";
/* Unified subtab style — matches Portfolios / Performance / Companies
   for a consistent feel across top-level tabs. */
const TABST_ACTIVE = "px-3 py-1.5 text-xs font-semibold rounded-t border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400";
const TABST_INACTIVE = "px-3 py-1.5 text-xs font-medium rounded-t border-b-2 border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200";

const SUBTABS = [
  ["markets","Markets"],
  ["movers","Top/Bottom Movers"],
  ["characteristics","Characteristics"],
  ["ratiocompare","Ratio Compare"],
  ["sectors","Sector Breakdown"],
  ["countries","Country Breakdown"],
  ["georev","GeoRev"],
  ["sidebyside","Side-by-Side"],
  ["guidcompare","Guidance Compare"],
  ["quality","Data Quality"],
  ["feedback","Feedback"],
];

export default function DashboardTab(props) {
  const {
    dashSubTab, setDashSubTab,
    showAnnualStale, setShowAnnualStale,
    showTxRecon, setShowTxRecon,
    staleWatchCount,
    setSelCo, setTab, setCoView,
  } = props;
  const { companies, setCompanies, repData } = useCompanyContext();

  return (
    <div>
      <div className="flex gap-1.5 mb-4 flex-wrap border-b border-slate-200 dark:border-slate-700 pb-2.5">
        {SUBTABS.map(function(item){
          return (
            <button
              key={item[0]}
              className={(dashSubTab===item[0]?TABST_ACTIVE:TABST_INACTIVE)+" whitespace-nowrap shrink-0"}
              onClick={function(){setDashSubTab(item[0]);}}
            >{item[1]}</button>
          );
        })}
      </div>
      <Suspense fallback={<div className="text-xs italic text-gray-500 dark:text-slate-400 py-6 text-center">Loading…</div>}>
        {dashSubTab==="markets"        &&<ErrorBoundary resetKey="markets"><MarketsDashboard/></ErrorBoundary>}
        {dashSubTab==="movers"         &&<ErrorBoundary resetKey="movers"><TopBottomMovers onSelectCompany={function(cid){var co=companies.find(function(c){return c.id===cid;});if(co){setSelCo(co);setTab("companies");setCoView("metrics");}}}/></ErrorBoundary>}
        {dashSubTab==="characteristics"&&<ErrorBoundary resetKey="characteristics"><CharacteristicsView/></ErrorBoundary>}
        {dashSubTab==="ratiocompare"   &&<ErrorBoundary resetKey="ratiocompare"><RatioCompareView/></ErrorBoundary>}
        {dashSubTab==="sectors"        &&<ErrorBoundary resetKey="sectors"><BreakdownView kind="sectors"/></ErrorBoundary>}
        {dashSubTab==="countries"      &&<ErrorBoundary resetKey="countries"><BreakdownView kind="countries"/></ErrorBoundary>}
        {dashSubTab==="georev"         &&<ErrorBoundary resetKey="georev"><GeoRevView/></ErrorBoundary>}
        {dashSubTab==="sidebyside"     &&<ErrorBoundary resetKey="sidebyside"><CompareView/></ErrorBoundary>}
        {dashSubTab==="guidcompare"    &&<ErrorBoundary resetKey="guidcompare"><GuidanceCompareView onSelectCompany={function(cid){var co=companies.find(function(c){return c.id===cid;});if(co){setSelCo(co);setTab("companies");setCoView("guidance");}}}/></ErrorBoundary>}
      </Suspense>
      {dashSubTab==="quality" && (
        <DataQualityView
          companies={companies}
          setCompanies={setCompanies}
          repData={repData}
          showAnnualStale={showAnnualStale} setShowAnnualStale={setShowAnnualStale}
          showTxRecon={showTxRecon} setShowTxRecon={setShowTxRecon}
          staleWatchCount={staleWatchCount}
          setSelCo={setSelCo} setTab={setTab} setCoView={setCoView}
        />
      )}
      {dashSubTab==="feedback" && <ErrorBoundary resetKey="feedback"><FeedbackTab/></ErrorBoundary>}
    </div>
  );
}

/* ---- Data Quality subtab — pure derivation over companies. ---- */
function DataQualityView(props) {
  const {
    companies, setCompanies, repData,
    showAnnualStale, setShowAnnualStale,
    showTxRecon, setShowTxRecon,
    staleWatchCount,
    setSelCo, setTab, setCoView,
  } = props;

  return (
    <div>
      <div className="text-sm font-medium mb-3 text-gray-900 dark:text-slate-100">Data Quality</div>
      <StaleAnnualPanel
        companies={companies}
        showAnnualStale={showAnnualStale} setShowAnnualStale={setShowAnnualStale}
        setSelCo={setSelCo} setTab={setTab} setCoView={setCoView}
      />
      <TxReconciliationPanel
        companies={companies} repData={repData}
        showTxRecon={showTxRecon} setShowTxRecon={setShowTxRecon}
        setSelCo={setSelCo} setTab={setTab} setCoView={setCoView}
      />
      <DateFormatAuditPanel
        companies={companies} setCompanies={setCompanies}
      />
      <StatCards companies={companies} staleWatchCount={staleWatchCount} />
      <div className="text-sm font-medium mb-2.5 text-gray-900 dark:text-slate-100">Stale companies (60d+ since review)</div>
      {companies
        .filter(function(c){return daysSince(c.lastReviewed)>60;})
        .sort(function(a,b){return daysSince(b.lastReviewed)-daysSince(a.lastReviewed);})
        .map(function(c){
          var d=daysSince(c.lastReviewed);
          return (
            <div key={c.id} className={CARD + " !mb-1.5 flex gap-2.5 items-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"} onClick={function(){setSelCo(c);setTab("companies");setCoView("upload");}}>
              <span className="text-sm font-medium text-gray-900 dark:text-slate-100 flex-1">{c.name}</span>
              {c.ticker&&<span className={PILL_BASE}>{c.ticker}</span>}
              {c.status&&<StatusPill status={c.status}/>}
              <span className="text-[11px] font-semibold" style={{color:d>90?"#dc2626":d>60?"#d97706":"#ca8a04"}}>{d===Infinity?"never":d+"d ago"}</span>
            </div>
          );
        })}
    </div>
  );
}

function StaleAnnualPanel({ companies, showAnnualStale, setShowAnnualStale, setSelCo, setTab, setCoView }) {
  const stale = companies.map(function(c){ return { c: c, st: annualStaleStatus(c) }; })
    .filter(function(x){ return x.st && x.st.stale; });
  if (stale.length === 0) return null;
  stale.sort(function(a,b){
    var ay = (a.st.latestImportedYear || 0);
    var by = (b.st.latestImportedYear || 0);
    if (ay !== by) return ay - by;
    return (a.c.name||"").localeCompare(b.c.name||"");
  });
  return (
    <div className="mb-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
      <div onClick={function(){setShowAnnualStale(function(v){var nv=!v;try{localStorage.setItem("ccd:showAnnualStale",nv?"1":"0");}catch(e){}return nv;});}} className="px-3.5 py-2 cursor-pointer flex items-center gap-2">
        <span className="text-[11px] text-amber-700 dark:text-amber-400">{showAnnualStale?"▼":"▶"}</span>
        <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">⚠ Stale data: {stale.length} compan{stale.length===1?"y":"ies"} need a re-import</span>
        <span className="text-[10px] text-amber-700 dark:text-amber-400 italic ml-auto">{showAnnualStale?"click to collapse":"click to expand"}</span>
      </div>
      {showAnnualStale&&(
        <div className="px-3.5 pb-2">
          <div className="text-[11px] text-amber-700 dark:text-amber-400 mb-1">Each name has reported its latest fiscal year (or it's been 13+ months since FY-end) but the new annual data hasn't been re-imported. Click a chip to jump to the company's Financials tab.</div>
          <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
            {stale.slice(0, 200).map(function(x){
              var c = x.c, st = x.st;
              var tip;
              if (st.reason === "no-data") {
                tip = "No annual financials imported yet · Expected through FY" + st.fyYear;
              } else if (st.reason === "post-fy-report") {
                tip = "Latest imported: FY" + (st.latestImportedYear || "?")
                    + " · Expected through FY" + st.fyYear
                    + " · Post-FY-end report on file (" + (st.reportSeenDate || "?") + ")";
              } else {
                tip = "Latest imported: FY" + (st.latestImportedYear || "?")
                    + " · Expected through FY" + st.fyYear
                    + " · 13+ months past FY-end (" + st.fyEnd + ")";
              }
              var label = st.reason === "no-data"
                ? "no data"
                : "FY" + (st.latestImportedYear || "?") + "→FY" + st.fyYear;
              return (
                <span key={c.id} title={tip} onClick={function(){setSelCo(c);setTab("companies");setCoView("financials");}}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/60">
                  {c.name}<span className="text-amber-700 dark:text-amber-400 ml-1">{label}</span>
                </span>
              );
            })}
            {stale.length > 200 && <span className="text-[11px] text-amber-700 dark:text-amber-400 italic self-center">+ {stale.length - 200} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function TxReconciliationPanel({ companies, repData, showTxRecon, setShowTxRecon, setSelCo, setTab, setCoView }) {
  /* For every (company, portfolio) where rep shares > 0, compute the
     sum of signed transaction shares and compare to actual rep
     shares. Tolerance 0.5 shares to handle FactSet rounding on
     fractional splits / DRIP. */
  var issues = [];
  companies.forEach(function(c){
    var tickerSet = {};
    (c.tickers||[]).forEach(function(t){var k=(t.ticker||"").toUpperCase(); if(k) tickerSet[k]=true;});
    if (Object.keys(tickerSet).length === 0) return;
    var heldByPort = {};
    Object.keys(repData||{}).forEach(function(p){
      var pRep = repData[p] || {};
      Object.keys(pRep).forEach(function(tk){
        if (!tickerSet[tk]) return;
        var sh = (pRep[tk] && typeof pRep[tk] === "object") ? pRep[tk].shares : pRep[tk];
        var n = parseFloat(sh);
        if (isFinite(n) && n > 0) heldByPort[p] = (heldByPort[p] || 0) + n;
      });
    });
    var txByPort = {};
    (c.transactions||[]).forEach(function(t){
      if (!t.portfolio) return;
      var n = parseFloat(t.shares);
      if (!isFinite(n)) return;
      txByPort[t.portfolio] = (txByPort[t.portfolio] || 0) + n;
    });
    var rows = [];
    Object.keys(heldByPort).forEach(function(p){
      var held = heldByPort[p];
      var txSum = txByPort[p];
      if (txSum === undefined) {
        rows.push({ port: p, kind: "missing", held: held, txSum: 0, diff: -held });
      } else if (Math.abs(txSum - held) > 0.5) {
        rows.push({ port: p, kind: "mismatch", held: held, txSum: txSum, diff: txSum - held });
      }
    });
    if (rows.length > 0) issues.push({ c: c, rows: rows });
  });
  if (issues.length === 0) return null;
  var missingCount = issues.reduce(function(s, x){ return s + x.rows.filter(function(r){return r.kind==="missing";}).length; }, 0);
  var mismatchCount = issues.reduce(function(s, x){ return s + x.rows.filter(function(r){return r.kind==="mismatch";}).length; }, 0);
  return (
    <div className="mb-5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800">
      <div onClick={function(){setShowTxRecon(function(v){var nv=!v;try{localStorage.setItem("ccd:showTxRecon",nv?"1":"0");}catch(e){}return nv;});}} className="px-3.5 py-2.5 cursor-pointer flex items-center gap-2">
        <span className="text-[11px] text-rose-700 dark:text-rose-400">{showTxRecon?"▼":"▶"}</span>
        <span className="text-xs font-semibold text-rose-800 dark:text-rose-300">⚠ Transaction reconciliation: {issues.length} compan{issues.length===1?"y":"ies"} ({missingCount} missing, {mismatchCount} mismatched)</span>
        <span className="text-[10px] text-rose-700 dark:text-rose-400 italic ml-auto">{showTxRecon?"click to collapse":"click to expand"}</span>
      </div>
      {showTxRecon&&(
        <div className="px-3.5 pb-2.5">
          <div className="text-[11px] text-rose-700 dark:text-rose-400 mb-2">For each row, transactions summed should equal current rep shares. Chips show <code>port: txSum / rep (diff)</code>. <span className="font-semibold">missing</span> = no transactions; <span className="font-semibold">mismatch</span> = totals don't reconcile. Click a chip to open the company's Transactions tab.</div>
          <div className="flex flex-wrap gap-1 max-h-64 overflow-y-auto">
            {issues.map(function(g){
              return (
                <span key={g.c.id} onClick={function(){setSelCo(g.c);setTab("companies");setCoView("transactions");}} className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 border border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200 cursor-pointer hover:bg-rose-200 dark:hover:bg-rose-900/60">
                  {g.c.name}
                  {g.rows.map(function(r, i){
                    var fmtN = function(n){return Math.round(n).toLocaleString();};
                    var sign = r.diff > 0 ? "+" : "";
                    return (
                      <span key={i} className="ml-1 text-rose-700 dark:text-rose-400">
                        {r.port}: {r.kind === "missing"
                          ? "missing (rep " + fmtN(r.held) + ")"
                          : fmtN(r.txSum) + " / " + fmtN(r.held) + " (" + sign + fmtN(r.diff) + ")"}
                      </span>
                    );
                  })}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DateFormatAuditPanel({ companies, setCompanies }) {
  /* Date-format audit + one-click normalizer. Mixed shapes
     ("5/8/26" vs "2026-02-06") break string sorts/compares; this
     converts everything to ISO YYYY-MM-DD. One-shot — running it
     on already-ISO data is a no-op. */
  var isoRe = /^\d{4}-\d{2}-\d{2}$/;
  var bad = [];
  (companies||[]).forEach(function(c){
    var hits = [];
    if (c.lastReportDate && !isoRe.test(c.lastReportDate)) hits.push("lastReportDate=" + c.lastReportDate);
    (c.earningsEntries||[]).forEach(function(e, idx){
      if (e && e.reportDate && !isoRe.test(e.reportDate)) hits.push("earningsEntries["+idx+"].reportDate=" + e.reportDate);
    });
    if (hits.length > 0) bad.push({ c: c, hits: hits });
  });
  if (bad.length === 0) return null;
  function toIso(s){
    if (s == null) return null;
    s = String(s).trim();
    if (!s) return null;
    if (/^(?:-+|n\/?a|na|null|none)$/i.test(s)) return "";
    if (isoRe.test(s)) return s;
    var m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/);
    if (m) {
      var mo = parseInt(m[1], 10);
      var dy = parseInt(m[2], 10);
      var yr = parseInt(m[3], 10);
      if (yr < 100) yr += yr < 50 ? 2000 : 1900;
      if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
        return yr + "-" + String(mo).padStart(2, "0") + "-" + String(dy).padStart(2, "0");
      }
    }
    var m2 = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (m2) {
      var yr2 = parseInt(m2[1],10);
      var mo2 = parseInt(m2[2],10);
      var dy2 = parseInt(m2[3],10);
      if (mo2>=1&&mo2<=12&&dy2>=1&&dy2<=31) {
        return yr2 + "-" + String(mo2).padStart(2,"0") + "-" + String(dy2).padStart(2,"0");
      }
    }
    var d = parseDate(s);
    if (d && !isNaN(d.getTime())) {
      return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    return null;
  }
  function doNormalize(){
    var skipped = [];
    setCompanies(function(prev){
      return prev.map(function(c){
        var changed = false;
        var u = Object.assign({}, c);
        if (u.lastReportDate && !isoRe.test(u.lastReportDate)) {
          var iso = toIso(u.lastReportDate);
          if (iso !== null) { u.lastReportDate = iso; changed = true; }
          else { skipped.push(c.name + ".lastReportDate=" + u.lastReportDate); }
        }
        if (u.earningsEntries && u.earningsEntries.length) {
          u.earningsEntries = u.earningsEntries.map(function(e){
            if (!e || !e.reportDate || isoRe.test(e.reportDate)) return e;
            var iso2 = toIso(e.reportDate);
            if (iso2 === null) { skipped.push(c.name + ".earningsEntries.reportDate=" + e.reportDate); return e; }
            changed = true;
            return Object.assign({}, e, { reportDate: iso2 });
          });
        }
        return changed ? u : c;
      });
    });
    if (skipped.length) {
      try { console.warn("Normalize: " + skipped.length + " value(s) unparseable", skipped); } catch(e){}
      alert(
        "Normalized what I could. " + skipped.length + " value(s) had an unrecognized format:\n\n  " +
        skipped.join("\n  ") +
        "\n\nFix these on the company's Earnings tab (set the reportDate field to a valid date) and re-run Normalize."
      );
    }
  }
  return (
    <div className="mb-5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 px-3.5 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">⚠ Date formats: {bad.length} compan{bad.length===1?"y":"ies"} have report dates stored in a non-sortable format</div>
        <button onClick={doNormalize} className="text-[11px] px-2.5 py-1 rounded-md bg-amber-600 dark:bg-amber-700 text-white hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors">Fix date storage</button>
      </div>
      <div className="text-[11px] text-amber-700 dark:text-amber-400">Dates display as <b>M/D/YY</b> everywhere, but internally they need to be stored in a sortable form so the Companies dashboard picks the right "most recent earnings." When a stored value is in a mixed shape (e.g. "5/8/26" vs the canonical form), sort/compare breaks. One click fixes the storage — the display stays M/D/YY.</div>
    </div>
  );
}

function StatCards({ companies, staleWatchCount }) {
  const cards = [
    { label: "Missing country", count: companies.filter(function(c){return !c.country;}).length },
    { label: "Missing sector",  count: companies.filter(function(c){return !c.sector;}).length },
    { label: "Missing tier",    count: companies.filter(function(c){return !c.tier;}).length },
    { label: "No template",     count: companies.filter(function(c){return !Object.keys(c.sections||{}).length;}).length },
    { label: "Not reviewed 30d+", count: companies.filter(function(c){return daysSince(c.lastReviewed)>30;}).length },
    { label: "Not reviewed 60d+", count: companies.filter(function(c){return daysSince(c.lastReviewed)>60;}).length },
    { label: "Watch stale 90d+",  count: staleWatchCount },
  ];
  return (
    <div className="flex gap-2.5 flex-wrap mb-5">
      {cards.map(function(item){
        return (
          <div key={item.label} className={CARD + " !mb-0 min-w-[140px] flex-1"}>
            <div className="text-xl font-semibold" style={{color:item.count>0?"#d97706":"#16a34a"}}>{item.count}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">{item.label}</div>
          </div>
        );
      })}
    </div>
  );
}
