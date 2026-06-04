import { useState, useEffect, useRef } from "react";
import { TP_CHANGES, THESIS_STATUSES } from '../../constants/index.js';
import { apiCall } from '../../api/index.js';
import { useAlert } from '../ui/DialogProvider.jsx';
import { inferQuarter, calcNormEPS, calcTP, getTpFixed, parseDate, fmtDateUS } from '../../utils/index.js';

/* Parse a fiscal-year label like "FY2027E", "FY27", "FY9/27E", "FY9/2027E"
   into a 4-digit year. Returns null when no year can be confidently
   extracted. Used by resolveEpsForFY below to map valuation FY labels
   onto the horizon series in company.epsRevisions. */
function parseFyYear(label){
  if(!label) return null;
  var s = String(label);
  /* Prefer an explicit 4-digit year (FY2027, FY9/2027, 2027E). */
  var m = s.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/);
  if(m) return parseInt(m[1], 10);
  /* Fall back to a 2-digit year (FY27, FY9/27, 27E). Take the LAST
     2-digit token so "FY9/27" picks 27 (year), not 9 (month). */
  var twoDigitMatches = s.match(/\b(\d{2})\b/g);
  if(twoDigitMatches && twoDigitMatches.length > 0){
    var yy = parseInt(twoDigitMatches[twoDigitMatches.length - 1], 10);
    if(yy >= 0 && yy <= 99) return 2000 + yy;
  }
  return null;
}

/* Resolve an EPS estimate from company.epsRevisions for a given target
   fiscal year. Mirrors the horizon→year math used in EpsRevisionsTab's
   fyLabel function so the value we pull lines up with what the chart
   shows. Returns the latest finite monthly estimate from the matching
   horizon, or null when the year is out of range / no data. */
function resolveEpsForFY(company, fyLabel){
  if(!company || !company.epsRevisions) return null;
  var er = company.epsRevisions;
  if(!er.dates || !er.dates.length || !er.series || !er.series.length) return null;
  var targetYear = parseFyYear(fyLabel);
  if(targetYear == null) return null;
  var lastIso = er.dates[er.dates.length - 1];
  var m = String(lastIso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return null;
  var y = parseInt(m[1], 10);
  var mo = parseInt(m[2], 10);
  var day = parseInt(m[3], 10);
  var fyEndMonth = (company.segments && company.segments.fiscalYearEndMonth) || 12;
  /* fy0Year = most recently completed fiscal year at lastIso. */
  var fy0Year;
  if(mo > fyEndMonth) fy0Year = y;
  else if(mo === fyEndMonth) fy0Year = day >= 28 ? y : y - 1;
  else fy0Year = y - 1;
  var horizon = targetYear - fy0Year;
  if(horizon < 0 || horizon > 3) return null;
  var series = er.series.find(function(s){ return s.horizon === horizon; });
  if(!series || !series.monthly || !series.monthly.length) return null;
  /* Latest finite value in the monthly array. */
  for(var i = series.monthly.length - 1; i >= 0; i--){
    var v = parseFloat(series.monthly[i]);
    if(isFinite(v)) return v;
  }
  return null;
}
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import GuidanceVsActual from '../companies/GuidanceVsActual.jsx';

/* Textarea that grows with its content. Reset to "auto" so deletions
   shrink it, then size to scrollHeight. Capped at 70vh so a giant
   paste doesn't take over the page. Used for the AI-paste box and the
   Extended Takeaway field. */
function AutoGrowTextarea(props) {
  var ref = useRef();
  useEffect(function () {
    var el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    var maxPx = Math.floor(window.innerHeight * 0.7);
    el.style.height = Math.min(el.scrollHeight, maxPx) + "px";
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
}

function EarningsEntry({ entry, onSave, onDelete, currency, company }) {
  /* fxRates is needed to convert local-currency sales/EPS into USD for
     the secondary line on the stats strip. fxRates[ccy] is stored as
     local-per-USD (so amountUSD = amountLocal / fxRates[ccy]). */
  var { fxRates, submitTpApproval, editTpApproval, tpApprovals, currentUser, valuationSnapshot } = useCompanyContext();
  /* Local UI feedback after submitting a TP change for approval. Set
     to a short status string for ~3s, then cleared. Avoids needing a
     toast system. */
  var [tpSubmitMsg, setTpSubmitMsg] = useState("");
  /* Inline submission form: shown after the user clicks "Submit TP change
     for approval". Captures the full PE × (EPS1×W1 + EPS2×W2)/100
     breakdown — those are the working numbers that drive TP Live, and
     their computed product becomes the new TP Fixed (frozen at the
     approval moment so the firm has a stable target while TP Live
     keeps refreshing daily as EPS estimates move). */
  var [showSubmitForm, setShowSubmitForm] = useState(false);
  var [tpForm, setTpForm] = useState({pe:"", eps1:"", eps2:"", w1:"", w2:""});
  /* Snapshot of the LAST-APPROVED state captured at the moment the user
     opens the proposal form. PE / W1 / W2 / TP come from
     company.valuation (those are stable assumptions that don't change
     with daily price/estimates pulls). EPS1 / EPS2 are user-entered
     because valuation.eps1 / eps2 hold the DAILY-updated consensus
     estimates, not the locked EPS values that were approved with the
     last TP. When a prior approval row exists in tpHistory with a full
     breakdown, those EPS fields get pre-filled from it; otherwise the
     user types them in. Pinning the from-snapshot here (form open time)
     instead of computing it at submit time means the approval card
     always renders a meaningful From -> To. */
  var [tpFrom, setTpFrom] = useState({pe:"", eps1:"", eps2:"", w1:"", w2:"", tp:""});
  /* The pending approval record (if any) tied to THIS earnings entry. We
     used to just check for existence and lock the user out; now we keep
     the full record so the user can re-open the form pre-filled with
     their pending values and edit-in-place (editTpApproval) rather than
     having to withdraw and resubmit. Only the user's OWN pending
     records are editable — peers can't edit each other's suggestions. */
  var pendingForEntry = (tpApprovals||[]).find(function(r){
    return r.earningsEntryId === entry.id && r.status === "pending";
  }) || null;
  var hasPending = !!pendingForEntry;
  var pendingIsMine = pendingForEntry && pendingForEntry.suggestedBy === currentUser;
  /* When set, the submit form is in EDIT mode targeting this approval id
     (instead of CREATE mode that adds a new record). On submit we call
     editTpApproval(id, patch) and clear this. Reset whenever the form
     closes so a stale id can't leak into a future submit. */
  var [editingPendingId, setEditingPendingId] = useState(null);
  var [e, setE] = useState(entry);
  var [open, setOpen] = useState(entry.open || false);
  /* Auto-expand for print so all entries are visible in the printout.
     Restore the user's prior open state once printing finishes so the
     screen view doesn't change underneath them. */
  useEffect(function () {
    var prev = null;
    function onBefore() { prev = open; setOpen(true); }
    function onAfter() { if (prev !== null) setOpen(prev); prev = null; }
    window.addEventListener("ccd-before-print", onBefore);
    window.addEventListener("ccd-after-print", onAfter);
    return function () {
      window.removeEventListener("ccd-before-print", onBefore);
      window.removeEventListener("ccd-after-print", onAfter);
    };
  }, [open]);
  var [aiOpen, setAiOpen] = useState(false);
  var [aiText, setAiText] = useState("");
  var [aiLoading, setAiLoading] = useState(false);

  /* Compute the current TP from the company's valuation. Used to
     auto-fill newTP when tpChange is "Unchanged" so the entry
     persists the actual target price even when the user didn't change
     it. Uses TP FIXED rather than the live PE × normEPS calc — an
     "unchanged" disposition means the analyst is reaffirming the
     committed TP, which is the fixed value (the one the firm voted
     on); the live value drifts as EPS estimates revise and would
     misrepresent the call. Falls back to live TP only when no fixed
     value is stored (older companies that haven't been re-voted). */
  var v = (company && company.valuation) || {};
  var currentNormEPS = calcNormEPS(v);
  var liveTP = calcTP(v.pe, currentNormEPS);
  var fixedTP = getTpFixed(v);
  var currentTP = fixedTP !== null ? fixedTP : liveTP;

  /* Has this earnings entry actually happened yet? Treat any entry
     whose reportDate is strictly in the future as "future" — its
     thesis/TP fields are placeholders until the actual report drops,
     so the tile header shouldn't surface them as if they were real
     decisions yet. Entries with no reportDate are treated as current
     (assume the user is mid-fill, not pre-filling). */
  var isFutureEntry = (function(){
    if (!e.reportDate) return false;
    var rd = parseDate(e.reportDate);
    if (!rd) return false;
    var today0 = new Date(); today0.setHours(0,0,0,0);
    return rd.getTime() > today0.getTime();
  })();

  /* Auto-fill newTP with the current TP (Fixed) whenever the user
     selects "Unchanged". If the user explicitly types something
     after this, normal onChange takes over and the manual value wins. */
  useEffect(function(){
    if (e.tpChange === "Unchanged" && currentTP !== null) {
      var s = String(currentTP);
      if (e.newTP !== s) {
        setE(function(prev){ return Object.assign({}, prev, { newTP: s }); });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.tpChange, currentTP]);
  var alertFn = useAlert();

  /* Build a structured context block from c.guidance / c.epsRevisions /
   * the prior earnings entry so the AI has the same backdrop the human
   * does when writing the thesis check. The model is instructed to use
   * this context when filling thesisStatus, takeaways, and bullets so
   * the synthesized output reflects deltas vs prior expectations rather
   * than reading the raw notes in isolation. */
  function buildContextBlock() {
    if (!company) return "";
    const lines = [];
    lines.push("COMPANY CONTEXT");
    lines.push("Name: " + (company.name || "?"));
    if (company.sector)  lines.push("Sector: " + company.sector);
    if (company.country) lines.push("Country: " + company.country);
    if (company.valuation && company.valuation.fyMonth) lines.push("FY ends: " + company.valuation.fyMonth);
    /* Latest guidance summary — most relevant FY (upcoming, else most-
       recent-closed within a year). Top 5 metrics by row count. */
    var g = company.guidance && company.guidance.history ? company.guidance.history : null;
    if (g && g.length) {
      var todayStr = new Date().toISOString().slice(0, 10);
      var staleMs = Date.now() - 365 * 24 * 3600 * 1000;
      var upcoming = null, closed = null;
      g.forEach(function (r) {
        if (!r.period) return;
        if (r.period >= todayStr) {
          if (!upcoming || r.period < upcoming) upcoming = r.period;
        } else {
          var d = new Date(r.period + "T00:00:00");
          if (isNaN(d.getTime()) || d.getTime() < staleMs) return;
          if (!closed || r.period > closed) closed = r.period;
        }
      });
      var period = upcoming || closed;
      if (period) {
        var byMetric = {};
        g.forEach(function (r) { if (r.period === period) (byMetric[r.item] = byMetric[r.item] || []).push(r); });
        var entries = Object.keys(byMetric).map(function (m) {
          var arr = byMetric[m].slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });
          var last = arr[arr.length - 1];
          var prev = arr.length > 1 ? arr[arr.length - 2] : null;
          function mid(r) {
            if (!r) return null;
            if (r.low != null && r.high != null) return (r.low + r.high) / 2;
            return r.low != null ? r.low : (r.high != null ? r.high : null);
          }
          var lm = mid(last), pm = mid(prev);
          var dir = "";
          if (lm != null && pm != null) {
            if (lm > pm * 1.001) dir = " (revised up)";
            else if (lm < pm * 0.999) dir = " (revised down)";
            else dir = " (unchanged)";
          }
          var lo = last && last.low != null ? last.low : null;
          var hi = last && last.high != null ? last.high : null;
          var rangeStr = "";
          if (lo != null && hi != null && lo !== hi) rangeStr = lo + " – " + hi;
          else if (lm != null) rangeStr = String(lm);
          return { metric: m, count: arr.length, line: m + ": " + rangeStr + dir };
        }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
        lines.push("Latest guidance (" + period + (upcoming ? "" : ", just closed") + "):");
        entries.forEach(function (e) { lines.push("  - " + e.line); });
      }
    }
    /* EPS revisions trend — last 3M direction by horizon. */
    var er = company.epsRevisions;
    if (er && er.series && er.series.length) {
      var hz = er.series.filter(function (s) { return s.horizon > 0 && s.monthly && s.monthly.length >= 4; });
      if (hz.length > 0) {
        lines.push("EPS revisions (last 3M):");
        hz.slice(0, 3).forEach(function (s) {
          var lst = s.monthly[s.monthly.length - 1];
          var bk  = s.monthly[s.monthly.length - 4];
          if (lst == null || bk == null || bk === 0) return;
          var pct = (lst - bk) / Math.abs(bk);
          var arrow = pct > 0.005 ? "up" : pct < -0.005 ? "down" : "flat";
          lines.push("  - FY+" + s.horizon + ": " + arrow + " " + (pct * 100).toFixed(1) + "%");
        });
      }
    }
    /* Prior earnings entry summary — most recent past entry. */
    var prior = ((company.earningsEntries) || [])
      .filter(function (x) { return x.id !== entry.id && x.reportDate; })
      .sort(function (a, b) { return (b.reportDate || "").localeCompare(a.reportDate || ""); })[0];
    if (prior) {
      lines.push("Prior cycle (" + (prior.quarter || prior.reportDate) + "):");
      if (prior.thesisStatus) lines.push("  - Thesis: " + prior.thesisStatus + (prior.thesisNote ? " — " + prior.thesisNote : ""));
      if (prior.shortTakeaway) lines.push("  - Takeaway: " + prior.shortTakeaway);
      if (prior.tpChange && prior.tpChange !== "Unchanged") {
        lines.push("  - TP " + prior.tpChange.toLowerCase() + (prior.newTP ? " to " + prior.newTP : "") + (prior.tpRationale ? " — " + prior.tpRationale : ""));
      }
    }
    return lines.join("\n");
  }

  async function runAIFill() {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      var ctx = buildContextBlock();
      var userMessage = ctx
        ? ctx + "\n\nEARNINGS NOTES\n" + aiText
        : aiText;
      var res = await apiCall(
        "You are an investment research assistant supporting a portfolio team. Use the COMPANY CONTEXT (when present) together with the user's EARNINGS NOTES to extract or synthesize structured fields. Use context to inform thesisStatus, takeaways, and bullets — especially deltas vs the company's most recent guidance and the prior cycle's thesis. Return ONLY valid JSON with these keys: quarter (string e.g. Q2 2026), reportDate (YYYY-MM-DD or empty string), eps (number as string), tpChange (one of: Unchanged Increased Decreased), newTP (number as string or empty), tpRationale (short string), thesisStatus (one of: On track Watch Broken), thesisNote (short string), shortTakeaway (max 6 words), extendedTakeaway (2-3 sentences), bullets (array of up to 5 key point strings). Return nothing else.",
        userMessage, 1200
      );
      var parsed = JSON.parse(res.replace(/```json|```/g, "").trim());
      var patch = {};
      if (parsed.quarter) patch.quarter = parsed.quarter;
      if (parsed.reportDate) patch.reportDate = parsed.reportDate;
      if (parsed.eps !== undefined) patch.eps = String(parsed.eps);
      if (parsed.tpChange && TP_CHANGES.includes(parsed.tpChange)) patch.tpChange = parsed.tpChange;
      if (parsed.newTP) patch.newTP = String(parsed.newTP);
      if (parsed.tpRationale) patch.tpRationale = parsed.tpRationale;
      if (parsed.thesisStatus && THESIS_STATUSES.includes(parsed.thesisStatus)) patch.thesisStatus = parsed.thesisStatus;
      if (parsed.thesisNote) patch.thesisNote = parsed.thesisNote;
      if (parsed.shortTakeaway) patch.shortTakeaway = parsed.shortTakeaway;
      if (parsed.extendedTakeaway) patch.extendedTakeaway = parsed.extendedTakeaway;
      if (parsed.bullets && Array.isArray(parsed.bullets)) {
        var bl = parsed.bullets.slice(0, 15);
        while (bl.length < 5) bl.push("");
        patch.bullets = bl;
      }
      setE(function (prev) { return Object.assign({}, prev, patch); });
      setAiOpen(false);
      setAiText("");
    } catch (err) {
      alertFn("Could not parse: " + err.message);
    }
    setAiLoading(false);
  }

  function upd(patch) { setE(function (prev) { return Object.assign({}, prev, patch); }); }
  function updBullet(i, val) { var b = e.bullets.slice(); b[i] = val; upd({ bullets: b }); }
  function addBullet() { if (e.bullets.length < 15) upd({ bullets: e.bullets.concat([""]) }); }
  function removeBullet(i) { upd({ bullets: e.bullets.filter(function (_, j) { return j !== i; }) }); }

  /* Neutral when blank ("" / --) so the empty default doesn't read as
     "Broken" (red). On track = green, Watch = amber, Broken = red. */
  var tcColor = !e.thesisStatus ? "#475569" : e.thesisStatus === "On track" ? "#166534" : e.thesisStatus === "Watch" ? "#854d0e" : "#991b1b";
  var tcBg    = !e.thesisStatus ? "#f1f5f9" : e.thesisStatus === "On track" ? "#dcfce7" : e.thesisStatus === "Watch" ? "#fef9c3" : "#fee2e2";
  /* Tile palette: green = Increased, red = Decreased, amber = Unchanged.
     Previously Unchanged used neutral grey, but grey reads as "no info"
     when the actual signal is "actively reviewed and held steady" —
     amber distinguishes it from a not-yet-reviewed entry. */
  var tpColor = e.tpChange === "Increased" ? "#166534" : e.tpChange === "Decreased" ? "#991b1b" : "#854d0e";
  var tpBg    = e.tpChange === "Increased" ? "#dcfce7" : e.tpChange === "Decreased" ? "#fee2e2" : "#fef9c3";

  /* Bumped text sizes one tier across the form so the earnings tab
     reads cleanly without squinting. Inputs go xs→sm; labels go
     [10px]→xs. */
  var inputClasses = "text-sm px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 w-full focus:ring-2 focus:ring-blue-500 focus:outline-none";
  var labelClasses = "text-xs text-gray-500 dark:text-slate-400 block mb-1 uppercase";

  /* Build the header title from the report date + inferred quarter.
     Inference uses company.valuation.fyMonth so cross-fiscal-year ends
     resolve correctly (e.g. a Sept 30 report for a June-end FY → Q1
     of next FY). Falls back to entry.quarter (legacy free-text) if
     inference fails or no fyMonth is set. Empty entries show a "New"
     placeholder until the user sets a date. */
  var fyMonth = company && company.valuation && company.valuation.fyMonth;
  var inferred = inferQuarter(e.reportDate, fyMonth);
  var titleQuarter = inferred ? inferred.label : (e.quarter || "");
  var titleDate = fmtDateUS(e.reportDate || "");
  var headerTitle = titleQuarter && titleDate ? (titleQuarter + " · " + titleDate)
                  : titleDate ? titleDate
                  : titleQuarter ? titleQuarter
                  : "New Earnings Entry";

  return (
    <div className="border-2 border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mb-3">
      {/* Header bar */}
      <div
        onClick={function () { setOpen(function (o) { return !o; }); }}
        className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 cursor-pointer flex items-center gap-2.5 flex-wrap hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <span className="text-base font-bold text-gray-900 dark:text-slate-100 flex-1">
          {headerTitle}
        </span>
        {/* TP and thesis status are placeholders until the report
            actually happens \u2014 hide both on future-dated entries so the
            tile header doesn't claim a decision that hasn't been made.
            The fields are still editable inside the open entry; we
            just don't promote them to the closed-tile summary yet. */}
        {!isFutureEntry && e.tpChange && (
          <span
            className="text-sm px-2 py-0.5 rounded-full font-medium"
            style={{ background: tpBg, color: tpColor }}
          >
            {e.tpChange === "Unchanged"
              ? "TP Unchanged" + (e.newTP ? " \u2192 " + currency + " " + e.newTP : "")
              : e.tpChange + " TP" + (e.newTP ? " \u2192 " + currency + " " + e.newTP : "")}
          </span>
        )}
        {!isFutureEntry && e.thesisStatus && (
          <span
            className="text-sm px-2 py-0.5 rounded-full font-medium"
            style={{ background: tcBg, color: tcColor }}
          >
            {e.thesisStatus}
          </span>
        )}
        {isFutureEntry && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 italic" title={"Scheduled for " + fmtDateUS(e.reportDate)}>
            Upcoming
          </span>
        )}
        {e.shortTakeaway && (
          <span className="text-sm text-gray-500 dark:text-slate-400 italic max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap">
            &ldquo;{e.shortTakeaway}&rdquo;
          </span>
        )}
        <span className="text-sm text-gray-500 dark:text-slate-400 ml-auto">
          {open ? "\u25b2" : "\u25bc"}
        </span>
      </div>

      {/* Sales / EPS estimate / actual / surprise strip. Populated by the
          Earnings Dates upload (or the daily script) and rendered whether
          the entry is open or collapsed so the user sees the read at a
          glance. Different content for "next-quarter" entries (consensus
          only, no actuals) vs "last-reported" entries (actuals + surprise). */}
      <EarningsStatsStrip entry={e} currency={currency} fxRates={fxRates} />

      {open && (
        <div className="p-3.5 bg-white dark:bg-slate-900">
          {/* Guidance vs Actual — renders only when this entry's reportDate
              falls within ~90 days after a closed FY-end in c.guidance.history
              (i.e. this is the FY-end report). For mid-FY quarterly reports
              this is null and the form looks unchanged. */}
          <GuidanceVsActual company={company} entry={e} currency={currency}/>

          {/* AI auto-fill */}
          <div className="mb-3.5 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <div
              onClick={function () { setAiOpen(function (o) { return !o; }); }}
              className={
                "px-3 py-2 cursor-pointer flex items-center justify-between transition-colors " +
                (aiOpen
                  ? "bg-blue-100 dark:bg-blue-900/40"
                  : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700")
              }
            >
              <span className={"text-xs font-semibold " + (aiOpen ? "text-blue-700 dark:text-blue-400" : "text-gray-900 dark:text-slate-100")}>
                {"✨"} AI Auto-fill from notes
              </span>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {aiOpen ? "\u25b2" : "\u25bc click to paste earnings notes and auto-fill all fields"}
              </span>
            </div>
            {aiOpen && (
              <div className="p-3 bg-white dark:bg-slate-900">
                <div className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">
                  Paste raw earnings notes, report excerpts, or your own commentary. AI will fill all fields automatically.
                </div>
                <AutoGrowTextarea
                  value={aiText}
                  onChange={function (ev) { setAiText(ev.target.value); }}
                  placeholder="Paste earnings notes here..."
                  className="w-full min-h-[120px] resize-y text-sm px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-[inherit] leading-relaxed mb-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={runAIFill}
                    disabled={aiLoading || !aiText.trim()}
                    className="text-xs px-4 py-1.5 font-semibold bg-blue-700 text-white border-none rounded-md cursor-pointer disabled:opacity-60 hover:bg-blue-800 transition-colors"
                  >
                    {aiLoading ? "Analyzing..." : "Auto-fill fields"}
                  </button>
                  <button
                    onClick={function () { setAiOpen(false); setAiText(""); }}
                    className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Report date — only field still in the form, since quarter
              is auto-inferred from date+fyMonth and EPS is now in the
              stats strip above (epsActual / epsEst from upload).
              Shown as a single narrow input so it doesn't dominate. */}
          <div className="mb-3">
            <label className={labelClasses}>Report Date</label>
            <input
              value={e.reportDate}
              onChange={function (ev) { upd({ reportDate: ev.target.value }); }}
              placeholder="YYYY-MM-DD"
              className={inputClasses + " max-w-[180px]"}
            />
          </div>

          {/* Row 2: TP change */}
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            <div>
              <label className={labelClasses}>TP Change</label>
              <select
                value={e.tpChange}
                onChange={function (ev) { upd({ tpChange: ev.target.value }); }}
                className={inputClasses + " appearance-none"}
              >
                {/* Blank/-- option so a new entry doesn't auto-claim
                    'Unchanged' before the analyst has actually reviewed
                    the report. Stays selectable so the user can revert
                    to unset if they cleared an entry mid-review. */}
                <option value="">--</option>
                {TP_CHANGES.map(function (t) { return <option key={t}>{t}</option>; })}
              </select>
            </div>
            <div>
              <label className={labelClasses}>New TP ({currency})</label>
              <input type="number" step="0.01" value={e.newTP} onChange={function (ev) { upd({ newTP: ev.target.value }); }} placeholder="e.g. 52.00" className={inputClasses} disabled={e.tpChange === "Unchanged"} />
            </div>
            <div>
              <label className={labelClasses}>TP Rationale</label>
              {/* Auto-grow so longer rationales aren't truncated. Same
                  pattern as the AI-paste box and Extended Takeaway. */}
              <AutoGrowTextarea
                value={e.tpRationale}
                onChange={function (ev) { upd({ tpRationale: ev.target.value }); }}
                placeholder="Brief reason"
                rows={1}
                className={inputClasses + " resize-none leading-relaxed"}
              />
            </div>
          </div>

          {/* Thesis check */}
          <div className="grid grid-cols-[1fr_2fr] gap-2.5 mb-3">
            <div>
              <label className={labelClasses}>Thesis Check</label>
              <select
                value={e.thesisStatus}
                onChange={function (ev) { upd({ thesisStatus: ev.target.value }); }}
                className={inputClasses + " appearance-none font-medium"}
                style={{ background: tcBg, color: tcColor }}
              >
                {/* Blank/-- option so a new entry doesn't auto-claim
                    'On track' before the analyst has reviewed the
                    report. Mirrors the tpChange dropdown's blank slot. */}
                <option value="">--</option>
                {THESIS_STATUSES.map(function (s) { return <option key={s}>{s}</option>; })}
              </select>
            </div>
            <div>
              <label className={labelClasses}>Thesis Note</label>
              <AutoGrowTextarea
                value={e.thesisNote}
                onChange={function (ev) { upd({ thesisNote: ev.target.value }); }}
                placeholder="What changed / what to watch"
                rows={1}
                className={inputClasses + " resize-none leading-relaxed"}
              />
            </div>
          </div>

          {/* Takeaways \u2014 short on top (one-liner), extended below
              taking the full width with a much taller textarea. The
              prior side-by-side layout left the extended takeaway
              cramped to 2 rows. */}
          <div className="mb-3">
            <label className={labelClasses}>
              Six-Word Takeaway <span className="text-blue-700 dark:text-blue-400">({"\u2192"} Note)</span>
            </label>
            <input value={e.shortTakeaway} onChange={function (ev) { upd({ shortTakeaway: ev.target.value }); }} placeholder="Max 6 words" className={inputClasses} maxLength={60} />
            {e.shortTakeaway && e.shortTakeaway.split(/\s+/).filter(Boolean).length > 6 && (
              <div className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">Over 6 words</div>
            )}
          </div>
          <div className="mb-3">
            <label className={labelClasses}>
              Extended Takeaway <span className="text-blue-700 dark:text-blue-400">({"\u2192"} Extended Note)</span>
            </label>
            <AutoGrowTextarea
              value={e.extendedTakeaway}
              onChange={function (ev) { upd({ extendedTakeaway: ev.target.value }); }}
              rows={8}
              className={inputClasses + " resize-y font-[inherit] leading-normal min-h-[160px]"}
            />
          </div>

          {/* Bullets */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelClasses}>
                Summary Bullets ({e.bullets.filter(function (b) { return b.trim(); }).length}/15)
              </label>
              {e.bullets.length < 15 && (
                <button
                  onClick={addBullet}
                  className="text-xs px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  + Add
                </button>
              )}
            </div>
            {e.bullets.map(function (b, i) {
              return (
                <div key={i} className="flex gap-1.5 mb-1 items-start">
                  <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0 pt-1.5">{"\u2022"}</span>
                  <AutoGrowTextarea
                    value={b}
                    onChange={function (ev) { updBullet(i, ev.target.value); }}
                    placeholder={"Bullet " + (i + 1)}
                    rows={1}
                    className={inputClasses + " flex-1 resize-none leading-relaxed"}
                  />
                  {e.bullets.length > 1 && (
                    <span
                      onClick={function () { removeBullet(i); }}
                      className="text-xs text-red-600 dark:text-red-400 cursor-pointer shrink-0 hover:text-red-800 dark:hover:text-red-300 transition-colors pt-1.5"
                    >
                      x
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2.5 border-t border-slate-200 dark:border-slate-700 flex-wrap items-center">
            <button
              onClick={function () { onSave(e); setOpen(false); }}
              className="text-xs px-4 py-1.5 font-semibold bg-blue-700 text-white border-none rounded-md cursor-pointer hover:bg-blue-800 transition-colors"
            >
              Save entry
            </button>
            {/* Submit TP change for approval. Only enabled when the user
                has actually proposed a new TP. Saves the entry first (so
                the rationale + takeaway are persisted) and then queues an
                approval record linked to this entry. On approve, the
                proposed PE/EPS1/EPS2/W1/W2 are written to
                company.valuation (driving TP Live going forward) AND
                company.valuation.tpFixed is set to the computed TP at
                the approval moment (so the team's "official" target
                stays stable while TP Live keeps recalculating). */}
            {(function(){
              /* The trigger button — opens the inline form, pre-filling
                 with the company's current valuation breakdown so the
                 user only edits what's actually changing. */
              /* Submit-for-approval is for actual increases/decreases.
                 Empty tpChange (a new entry not yet reviewed) and
                 'Unchanged' (reaffirm, no TP movement) both skip the
                 approval flow. When a pending record from THIS user
                 already exists for this entry, the button switches to
                 "Edit pending submission" — clicking opens the form
                 pre-filled with the pending record's values. Peers see
                 the locked-out button as before. */
              var canCreate = (e.tpChange === "Increased" || e.tpChange === "Decreased") && !hasPending && !!company;
              var canEdit = hasPending && pendingIsMine && !!company;
              var canOpen = canCreate || canEdit;
              function _openForm(){
                if(!canOpen) return;
                var v = company.valuation || {};
                if(canEdit && pendingForEntry){
                  /* EDIT mode: prefill from the pending record itself —
                     both sides as they were originally submitted. */
                  setTpForm({
                    pe:   pendingForEntry.toPE   != null ? String(pendingForEntry.toPE)   : "",
                    eps1: pendingForEntry.toEPS1 != null ? String(pendingForEntry.toEPS1) : "",
                    eps2: pendingForEntry.toEPS2 != null ? String(pendingForEntry.toEPS2) : "",
                    w1:   pendingForEntry.toW1   != null ? String(pendingForEntry.toW1)   : "",
                    w2:   pendingForEntry.toW2   != null ? String(pendingForEntry.toW2)   : "",
                  });
                  setTpFrom({
                    pe:   pendingForEntry.fromPE   != null ? String(pendingForEntry.fromPE)   : "",
                    eps1: pendingForEntry.fromEPS1 != null ? String(pendingForEntry.fromEPS1) : "",
                    eps2: pendingForEntry.fromEPS2 != null ? String(pendingForEntry.fromEPS2) : "",
                    w1:   pendingForEntry.fromW1   != null ? String(pendingForEntry.fromW1)   : "",
                    w2:   pendingForEntry.fromW2   != null ? String(pendingForEntry.fromW2)   : "",
                    tp:   pendingForEntry.fromTP   != null ? String(pendingForEntry.fromTP)   : "",
                  });
                  setEditingPendingId(pendingForEntry.id);
                } else {
                  /* CREATE mode: prefill TO row from valuation, FROM
                     row from tpHistory (or valuation for PE/W) + blanks
                     for EPS the user types in.

                     EPS prefill priority for the PROPOSED row:
                       1. epsRevisions.series for the horizon that matches
                          v.fy1 / v.fy2 label (e.g. "FY2027E" → 9/27 line).
                          Catches the "valuation.eps1 is the 9/26 column
                          but I labeled FY1 as FY2027E" mismatch — by
                          pulling from the chart's matching horizon we
                          surface the value the user expects.
                       2. v.eps1 / v.eps2 (the daily-updated Estimates
                          Import value) when no horizon resolves. */
                  var epsFromHorizon1 = resolveEpsForFY(company, v.fy1);
                  var epsFromHorizon2 = resolveEpsForFY(company, v.fy2);
                  /* Prefill priority (highest first):
                       0. valuationSnapshot — pinned analyst values from
                          the most recent Valuation Upload. Trumps both
                          epsRevisions and live c.valuation so daily
                          FactSet refreshes can't bleed into the form.
                       1. epsRevisions horizon match — daily FactSet
                          line for the matching FY label.
                       2. v.eps1 / v.eps2 — fallback. */
                  var snap = (valuationSnapshot && valuationSnapshot[company.id]) || null;
                  function snapVal(k){
                    if(!snap) return null;
                    var s = snap[k];
                    return (s !== undefined && s !== null && s !== "") ? s : null;
                  }
                  setTpForm({
                    pe:   snapVal("pe")  || (v.pe   != null && v.pe   !== "" ? String(v.pe)   : ""),
                    eps1: snapVal("eps1") ||
                          (epsFromHorizon1 != null ? String(epsFromHorizon1)
                          : (v.eps1 != null && v.eps1 !== "" ? String(v.eps1) : "")),
                    eps2: snapVal("eps2") ||
                          (epsFromHorizon2 != null ? String(epsFromHorizon2)
                          : (v.eps2 != null && v.eps2 !== "" ? String(v.eps2) : "")),
                    w1:   snapVal("w1")  || (v.w1   != null && v.w1   !== "" ? String(v.w1)   : ""),
                    w2:   snapVal("w2")  || (v.w2   != null && v.w2   !== "" ? String(v.w2)   : ""),
                  });
                  var hist = company.tpHistory || [];
                  var priorApproval = null;
                  for(var hi=0; hi<hist.length; hi++){
                    var h = hist[hi];
                    if(h && h.source === "approval"
                        && isFinite(parseFloat(h.pe))
                        && isFinite(parseFloat(h.eps1))
                        && isFinite(parseFloat(h.eps2))
                        && isFinite(parseFloat(h.w1))
                        && isFinite(parseFloat(h.w2))){
                      priorApproval = h;
                      break;
                    }
                  }
                  /* Source priority for each "Previous (last approved)"
                     field, most authoritative first:
                       1. valuation.*Fixed (set by the last approval, or
                          a manual edit on the Valuation card) — this is
                          the snapshot of what the team officially blessed
                          and is the source of truth for "what we're
                          changing from."
                       2. tpHistory's most recent approval row — covers
                          companies whose *Fixed values were never written
                          (older approvals, before the Fixed columns
                          existed).
                       3. valuation (Live values) — last-resort fallback
                          so PE/W get reasonable defaults even when neither
                          Fixed nor history has anything. EPS slots stay
                          blank if both Fixed and history are empty (Live
                          EPS is daily-updated consensus, not a meaningful
                          "from" baseline). */
                  function _pickFrom(fixedKey, liveKey){
                    if(v[fixedKey] != null && v[fixedKey] !== "") return String(v[fixedKey]);
                    if(priorApproval && priorApproval[liveKey] != null && priorApproval[liveKey] !== ""){
                      return String(priorApproval[liveKey]);
                    }
                    if(v[liveKey] != null && v[liveKey] !== "") return String(v[liveKey]);
                    return "";
                  }
                  function _pickEPSFrom(fixedKey, liveKey){
                    /* Same as _pickFrom but doesn't fall back to Live —
                       Live EPS is daily-updated and not a valid "Previous"
                       value. */
                    if(v[fixedKey] != null && v[fixedKey] !== "") return String(v[fixedKey]);
                    if(priorApproval && priorApproval[liveKey] != null && priorApproval[liveKey] !== ""){
                      return String(priorApproval[liveKey]);
                    }
                    return "";
                  }
                  setTpFrom({
                    pe:   _pickFrom("peFixed", "pe"),
                    w1:   _pickFrom("w1Fixed", "w1"),
                    w2:   _pickFrom("w2Fixed", "w2"),
                    eps1: _pickEPSFrom("eps1Fixed", "eps1"),
                    eps2: _pickEPSFrom("eps2Fixed", "eps2"),
                    tp: (function(){
                      var t = getTpFixed(v);
                      return t != null && isFinite(t) ? String(t) : "";
                    })(),
                  });
                  setEditingPendingId(null);
                }
                setShowSubmitForm(true);
              }
              var buttonLabel, buttonTitle;
              if(canEdit){
                buttonLabel = "Edit pending submission";
                buttonTitle = "Re-open the pending TP change to revise its values";
              } else if(hasPending){
                buttonLabel = "TP change pending (by " + (pendingForEntry.suggestedBy || "teammate") + ")";
                buttonTitle = "Another teammate's TP change for this entry is awaiting review";
              } else {
                buttonLabel = "Submit TP change for approval";
                buttonTitle = "Submit the proposed TP for approval by another teammate";
              }
              return (
                <button
                  type="button"
                  onClick={_openForm}
                  disabled={!canOpen}
                  className={"text-xs px-3 py-1.5 font-semibold rounded-md transition-colors " + (canOpen
                    ? (canEdit ? "bg-blue-600 text-white border-none cursor-pointer hover:bg-blue-700"
                               : "bg-amber-600 text-white border-none cursor-pointer hover:bg-amber-700")
                    : "bg-slate-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 border-none cursor-not-allowed")}
                  title={buttonTitle}
                >
                  {buttonLabel}
                </button>
              );
            })()}
            {tpSubmitMsg && (
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300">{tpSubmitMsg}</span>
            )}
            <button
              onClick={function () { setOpen(false); }}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Close
            </button>
            <span
              onClick={onDelete}
              className="text-xs text-red-600 dark:text-red-400 cursor-pointer ml-auto py-1.5 hover:text-red-800 dark:hover:text-red-300 transition-colors"
            >
              Delete entry
            </span>
          </div>

          {/* Inline TP-approval submission form. Captures the full
              valuation breakdown (PE + EPS1 + EPS2 + W1 + W2) — those
              are the working values that drive TP Live, and the
              computed PE × normEPS is what becomes TP Fixed on approve.
              Form pre-fills from company.valuation so the user only
              edits what's actually changing. */}
          {showSubmitForm && (function(){
            var pe   = parseFloat(tpForm.pe);
            var eps1 = parseFloat(tpForm.eps1);
            var eps2 = parseFloat(tpForm.eps2);
            var w1   = parseFloat(tpForm.w1);
            var w2   = parseFloat(tpForm.w2);
            /* normEPS uses the same weighted-blend formula as calcNormEPS
               in utils/index.js. If only eps1 is set with no weights,
               fall back to eps1 alone — same as the existing behavior. */
            var normEPS = null;
            if(isFinite(eps1) && isFinite(eps2) && isFinite(w1) && isFinite(w2)){
              normEPS = (eps1*w1 + eps2*w2) / 100;
            } else if(isFinite(eps1) && !isFinite(eps2)){
              normEPS = eps1;
            }
            var computedTP = (isFinite(pe) && pe>0 && normEPS!==null) ? pe*normEPS : null;
            var enteredTP = parseFloat(e.newTP);
            var weightsTotal = (isFinite(w1)?w1:0) + (isFinite(w2)?w2:0);
            var weightsOK = !isFinite(w1) && !isFinite(w2) ? true : Math.abs(weightsTotal - 100) < 0.01;
            /* Previous-side sanity. Compute Prev PE × Prev normEPS and
               compare against Prev TP, same 2% tolerance as the new-side
               check. Catches typos in the "Previous (last approved)"
               row before they get baked into the approval record. */
            var prevPE   = parseFloat(tpFrom.pe);
            var prevE1   = parseFloat(tpFrom.eps1);
            var prevE2   = parseFloat(tpFrom.eps2);
            var prevW1   = parseFloat(tpFrom.w1);
            var prevW2   = parseFloat(tpFrom.w2);
            var prevTP   = parseFloat(tpFrom.tp);
            var prevNormEPS = null;
            if(isFinite(prevE1) && isFinite(prevE2) && isFinite(prevW1) && isFinite(prevW2)){
              prevNormEPS = (prevE1*prevW1 + prevE2*prevW2) / 100;
            } else if(isFinite(prevE1) && !isFinite(prevE2)){
              prevNormEPS = prevE1;
            } else if(isFinite(prevE2) && !isFinite(prevE1)){
              prevNormEPS = prevE2;
            }
            var prevComputedTP = (isFinite(prevPE) && prevPE>0 && prevNormEPS!==null) ? prevPE*prevNormEPS : null;
            var prevTPOK = !isFinite(prevTP) || prevComputedTP === null
                            || Math.abs(prevComputedTP - prevTP) / prevTP <= 0.02;
            /* FY labels — show next to each EPS input so the suggester
               can see whether FY1 is still the same fiscal year it was
               at last approval (sometimes EPS2 becomes EPS1 when the
               valuation rolls forward across fiscal-year boundaries). */
            var vForFy = company && company.valuation || {};
            var fy1Label = vForFy.fy1 || "";
            var fy2Label = vForFy.fy2 || "";
            var canSubmit = isFinite(pe) && pe>0 && normEPS!==null && computedTP!==null && weightsOK && prevTPOK;
            var INP="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none w-20";
            var LBL="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5 uppercase tracking-wide";
            return (
              <div className="mt-2 p-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
                <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-200 mb-2">{editingPendingId ? "Edit pending TP change — full breakdown" : "Submit TP change for approval — full breakdown"}</div>
                {/* PREVIOUS (last-approved) row.
                    PE / W1 / W2 / TP autofill from valuation + tpHistory
                    when the form opens. EPS1 / EPS2 autofill ONLY from
                    tpHistory (since valuation.eps holds the daily-updated
                    consensus, not the EPS values locked at last
                    approval). Every cell is editable so the user can
                    correct or supply values the system doesn't have. */}
                <div className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">Previous (last approved)</div>
                <div className="flex gap-3 flex-wrap items-end mb-2">
                  <div>
                    <label className={LBL}>PE</label>
                    <input type="number" step="0.1" value={tpFrom.pe} onChange={function(ev){setTpFrom(Object.assign({},tpFrom,{pe:ev.target.value}));}} className={INP}/>
                  </div>
                  <span className="text-gray-500 dark:text-slate-400 pb-1">×</span>
                  <div>
                    <label className={LBL}>EPS {fy1Label || "FY1"}</label>
                    <input type="number" step="0.01" value={tpFrom.eps1} onChange={function(ev){setTpFrom(Object.assign({},tpFrom,{eps1:ev.target.value}));}} className={INP} placeholder="enter"/>
                  </div>
                  <div>
                    <label className={LBL}>W1 %</label>
                    <input type="number" step="1" value={tpFrom.w1} onChange={function(ev){setTpFrom(Object.assign({},tpFrom,{w1:ev.target.value}));}} className={INP}/>
                  </div>
                  <span className="text-gray-500 dark:text-slate-400 pb-1">+</span>
                  <div>
                    <label className={LBL}>EPS {fy2Label || "FY2"}</label>
                    <input type="number" step="0.01" value={tpFrom.eps2} onChange={function(ev){setTpFrom(Object.assign({},tpFrom,{eps2:ev.target.value}));}} className={INP} placeholder="enter"/>
                  </div>
                  <div>
                    <label className={LBL}>W2 %</label>
                    <input type="number" step="1" value={tpFrom.w2} onChange={function(ev){setTpFrom(Object.assign({},tpFrom,{w2:ev.target.value}));}} className={INP}/>
                  </div>
                  <span className="text-gray-400 dark:text-slate-500 pb-1">=</span>
                  <div>
                    <label className={LBL}>Prev TP</label>
                    <input type="number" step="0.01" value={tpFrom.tp} onChange={function(ev){setTpFrom(Object.assign({},tpFrom,{tp:ev.target.value}));}} className={INP}/>
                  </div>
                </div>
                {/* Prev-side sanity: warn (and block submit via prevTPOK
                    feeding canSubmit) when PE × normEPS for the Previous
                    row diverges more than 2% from Prev TP. Catches typos
                    or mismatched-vintage data before it lands in the
                    approval record. */}
                {prevComputedTP !== null && isFinite(prevTP) && !prevTPOK && (
                  <div className="text-[11px] text-rose-600 dark:text-rose-400 mb-2 font-mono">
                    Previous: PE × EPS = {currency} {prevComputedTP.toFixed(2)} but Prev TP = {currency} {prevTP.toFixed(2)} ({((prevComputedTP - prevTP) / prevTP * 100).toFixed(1)}% off) — fix before submitting
                  </div>
                )}
                {/* PROPOSED (new) row */}
                <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-1">Proposed (new)</div>
                <div className="flex gap-3 flex-wrap items-end mb-2">
                  <div>
                    <label className={LBL}>PE</label>
                    <input type="number" step="0.1" value={tpForm.pe} onChange={function(ev){setTpForm(Object.assign({},tpForm,{pe:ev.target.value}));}} className={INP}/>
                  </div>
                  <span className="text-gray-500 dark:text-slate-400 pb-1">×</span>
                  <div>
                    <label className={LBL}>EPS {fy1Label || "FY1"}</label>
                    <input type="number" step="0.01" value={tpForm.eps1} onChange={function(ev){setTpForm(Object.assign({},tpForm,{eps1:ev.target.value}));}} className={INP}/>
                  </div>
                  <div>
                    <label className={LBL}>W1 %</label>
                    <input type="number" step="1" value={tpForm.w1} onChange={function(ev){setTpForm(Object.assign({},tpForm,{w1:ev.target.value}));}} className={INP}/>
                  </div>
                  <span className="text-gray-500 dark:text-slate-400 pb-1">+</span>
                  <div>
                    <label className={LBL}>EPS {fy2Label || "FY2"}</label>
                    <input type="number" step="0.01" value={tpForm.eps2} onChange={function(ev){setTpForm(Object.assign({},tpForm,{eps2:ev.target.value}));}} className={INP}/>
                  </div>
                  <div>
                    <label className={LBL}>W2 %</label>
                    <input type="number" step="1" value={tpForm.w2} onChange={function(ev){setTpForm(Object.assign({},tpForm,{w2:ev.target.value}));}} className={INP}/>
                  </div>
                </div>
                <div className="text-[11px] text-gray-600 dark:text-slate-300 mb-2 font-mono">
                  Norm EPS = {normEPS!==null ? normEPS.toFixed(2) : "—"}
                  &nbsp;·&nbsp; New TP Fixed = {computedTP!==null ? (currency + " " + computedTP.toFixed(2)) : "—"}
                  {isFinite(enteredTP) && enteredTP > 0 && computedTP!==null && Math.abs(computedTP - enteredTP) / enteredTP > 0.02 && (
                    <span className="ml-2 text-rose-600 dark:text-rose-400">Doesn't match entry's New TP ({currency} {enteredTP.toFixed(2)}) — review inputs</span>
                  )}
                  {!weightsOK && (
                    <span className="ml-2 text-rose-600 dark:text-rose-400">Weights must sum to 100 (currently {weightsTotal})</span>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={function(){
                      if(!canSubmit||!company) return;
                      /* "From" values come directly from the tpFrom form
                         state, which was snapshotted from valuation +
                         tpHistory at form-open time AND can be edited
                         by the user in the Previous-state inputs above.
                         This replaces the old strategy of reconstructing
                         "from" at submit time — that approach kept
                         producing wrong values because the valuation
                         had often already moved by submission time
                         (Estimates Imports update v.eps1/v.eps2 daily). */
                      var fromPE   = parseFloat(tpFrom.pe);
                      var fromEPS1 = parseFloat(tpFrom.eps1);
                      var fromEPS2 = parseFloat(tpFrom.eps2);
                      var fromW1   = parseFloat(tpFrom.w1);
                      var fromW2   = parseFloat(tpFrom.w2);
                      var fromNormEPS = null;
                      if(isFinite(fromEPS1) && isFinite(fromEPS2) && isFinite(fromW1) && isFinite(fromW2)){
                        fromNormEPS = (fromEPS1*fromW1 + fromEPS2*fromW2) / 100;
                      } else if(isFinite(fromEPS1) && !isFinite(fromEPS2)){
                        fromNormEPS = fromEPS1;
                      } else if(isFinite(fromEPS2) && !isFinite(fromEPS1)){
                        fromNormEPS = fromEPS2;
                      }
                      var fromTP = parseFloat(tpFrom.tp);
                      if(!isFinite(fromTP)) fromTP = null;
                      onSave(e);
                      /* toTP is what gets stamped onto company.valuation.tpFixed
                         when approved. It's the suggester's PROPOSED value (the
                         entry's "New TP" — typically a clean round number like
                         £6.70 rather than the slightly-off-from-rounding
                         PE × normEPS result of £6.71). Fall back to the
                         computed value when no New TP was typed.

                         computedTP is stored separately so the approval card
                         can show "(PE × EPS ≈ £6.71)" as a sanity check when
                         the proposed and computed values diverge. PE / EPS1 /
                         EPS2 / W1 / W2 still flow through to company.valuation
                         on approve, so TP Live keeps recomputing from them
                         each day. */
                      var finalToTP = isFinite(enteredTP) && enteredTP > 0 ? enteredTP : computedTP;
                      var payload = {
                        companyId: company.id,
                        fromPE: isFinite(fromPE) ? fromPE : null,
                        fromEPS1: isFinite(fromEPS1) ? fromEPS1 : null,
                        fromEPS2: isFinite(fromEPS2) ? fromEPS2 : null,
                        fromW1: isFinite(fromW1) ? fromW1 : null,
                        fromW2: isFinite(fromW2) ? fromW2 : null,
                        fromEPS: fromNormEPS,
                        fromTP: fromTP,
                        toPE: pe,
                        toEPS1: isFinite(eps1) ? eps1 : null,
                        toEPS2: isFinite(eps2) ? eps2 : null,
                        toW1: isFinite(w1) ? w1 : null,
                        toW2: isFinite(w2) ? w2 : null,
                        toEPS: normEPS,
                        toTP: finalToTP,
                        computedTP: computedTP,
                        proposedTP: isFinite(enteredTP) ? enteredTP : null,
                        fy1: v.fy1 || "",
                        fy2: v.fy2 || "",
                        rationale: e.tpRationale || e.extendedTakeaway || "",
                        earningsEntryId: entry.id,
                      };
                      if(editingPendingId){
                        /* EDIT mode: rewrite the existing pending
                           record in place. editTpApproval guards on
                           ownership + status server-side. */
                        editTpApproval(editingPendingId, payload);
                        setTpSubmitMsg("✓ Updated pending submission");
                      } else {
                        submitTpApproval(payload);
                        setTpSubmitMsg("✓ Submitted for approval");
                      }
                      setTimeout(function(){setTpSubmitMsg("");}, 3000);
                      setShowSubmitForm(false);
                      setEditingPendingId(null);
                    }}
                    className={"text-xs px-3 py-1 font-semibold rounded-md transition-colors " + (canSubmit ? (editingPendingId ? "bg-blue-600 text-white border-none cursor-pointer hover:bg-blue-700" : "bg-amber-600 text-white border-none cursor-pointer hover:bg-amber-700") : "bg-slate-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 border-none cursor-not-allowed")}
                  >
                    {editingPendingId ? "Save changes" : "Submit for approval"}
                  </button>
                  <button type="button" onClick={function(){setShowSubmitForm(false); setEditingPendingId(null);}} className="text-xs px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">Cancel</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* Estimates / actuals / surprise strip rendered between the entry header
   and the open body. Two modes:
   - "result" (entry has actuals): two compact rows per metric showing
     "Actual vs Est (±%, nominal)" with green/red on the surprise.
   - "consensus" (entry has only estimates): one row "Consensus: Sales X est ·
     EPS Y est" — used for upcoming-report entries.
   Returns null when no relevant fields are populated so the strip is
   completely invisible until upload data lands.

   Numeric formatting:
   - Sales: auto-scaled K/M/B (sales come in raw, e.g. 12,743,433).
   - EPS: per-share dollars with the entry's local currency prefix.
   - Surprise %: signed with one decimal (e.g. "+3.6%"). */
function EarningsStatsStrip({ entry, currency, fxRates }) {
  if (!entry) return null;
  const has = function (k) { return entry[k] !== null && entry[k] !== undefined && isFinite(entry[k]); };
  const ccy = (currency || "USD").toUpperCase();
  /* fxRates[ccy] is local-per-USD; e.g. fxRates.CAD ≈ 1.36 means 1 USD =
     1.36 CAD. To convert a local amount to USD, divide by the rate.
     USD currency means no conversion. */
  const fx = ccy === "USD" ? 1 : (fxRates && parseFloat(fxRates[ccy])) || null;
  const hasUsd = ccy !== "USD" && fx && fx > 0;

  /* Sales values are uploaded in MILLIONS of local currency. The
     formatter scales the raw number into M / B / T buckets and prefixes
     the local currency code (so a CAD-reporting company shows "CAD 24.8B"
     instead of the misleading "$24.8B"). */
  function fmtSales(n, prefix) {
    if (n === null || n === undefined || !isFinite(n)) return null;
    const a = Math.abs(n), s = n < 0 ? "-" : "";
    let body;
    if (a >= 1e6) body = (a / 1e6).toFixed(2) + "T";
    else if (a >= 1e3) body = (a / 1e3).toFixed(1) + "B";
    else if (a >= 1) body = a.toFixed(1) + "M";
    else body = Math.round(a * 1000) + "K";
    return s + prefix + " " + body;
  }
  /* USD-equivalent of a sales-in-local-millions value. */
  function fmtSalesUsd(n) {
    if (!hasUsd || n === null || n === undefined || !isFinite(n)) return null;
    return fmtSales(n / fx, "$");
  }
  function fmtEps(n, prefix) {
    if (n === null || n === undefined || !isFinite(n)) return null;
    return prefix + " " + n.toFixed(2);
  }
  function fmtEpsUsd(n) {
    if (!hasUsd || n === null || n === undefined || !isFinite(n)) return null;
    return "$" + (n / fx).toFixed(2);
  }
  function fmtSurpPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return null;
    return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  }
  function surpColor(n) {
    if (n === null || n === undefined || !isFinite(n) || Math.abs(n) < 0.05) return undefined;
    return n > 0 ? "#166534" : "#dc2626";
  }

  const hasActual = has("salesActual") || has("epsActual");
  const hasAnyEst = has("salesEst") || has("epsEst");
  if (!hasActual && !hasAnyEst) return null;

  /* Consensus-only mode (next-quarter) — short single line. */
  if (!hasActual) {
    return (
      <div className="px-3.5 py-2 bg-blue-50 dark:bg-blue-950/20 border-b border-slate-200 dark:border-slate-700 text-sm">
        <div className="flex flex-wrap gap-x-3 items-baseline">
          <span className="uppercase tracking-wide text-gray-500 dark:text-slate-400 text-xs">Consensus</span>
          {has("salesEst") && (
            <span className="text-gray-700 dark:text-slate-300">
              Sales <span className="font-mono tabular-nums font-semibold">{fmtSales(entry.salesEst, ccy)}</span>
              {hasUsd && <span className="text-xs text-gray-500 dark:text-slate-400 ml-1">≈ {fmtSalesUsd(entry.salesEst)} USD</span>}
            </span>
          )}
          {has("epsEst") && (
            <span className="text-gray-700 dark:text-slate-300">
              EPS <span className="font-mono tabular-nums font-semibold">{fmtEps(entry.epsEst, ccy)}</span>
              {hasUsd && <span className="text-xs text-gray-500 dark:text-slate-400 ml-1">≈ {fmtEpsUsd(entry.epsEst)} USD</span>}
            </span>
          )}
        </div>
      </div>
    );
  }
  /* Result mode (last-reported) — Sales / EPS actual vs est + surprise.
     Each metric: one main line in local currency (with surprise pill),
     plus a smaller USD-converted line below when ccy is non-USD. */
  const showSales = has("salesActual") || has("salesEst") || has("salesSurpPct");
  const showEps   = has("epsActual")   || has("epsEst")   || has("epsSurpPct");
  return (
    <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700 text-sm space-y-1.5">
      {showSales && (
        <div>
          <div className="flex flex-wrap gap-x-2 items-baseline">
            <span className="uppercase tracking-wide text-gray-500 dark:text-slate-400 w-12 text-xs">Sales</span>
            <span className="font-mono tabular-nums text-gray-900 dark:text-slate-100 font-semibold">{fmtSales(entry.salesActual, ccy) || "—"}</span>
            {has("salesEst") && <span className="text-gray-500 dark:text-slate-400">vs {fmtSales(entry.salesEst, ccy)} est</span>}
            {has("salesSurpPct") && <span className="font-mono tabular-nums font-semibold" style={{ color: surpColor(entry.salesSurpPct) }}>{fmtSurpPct(entry.salesSurpPct)}</span>}
            {has("salesSurpNom") && <span className="font-mono tabular-nums text-gray-500 dark:text-slate-400">({fmtSales(entry.salesSurpNom, ccy)})</span>}
          </div>
          {hasUsd && (has("salesActual") || has("salesEst")) && (
            <div className="flex flex-wrap gap-x-2 items-baseline text-xs text-gray-500 dark:text-slate-400 pl-12">
              <span>≈ {fmtSalesUsd(entry.salesActual) || "—"} USD</span>
              {has("salesEst") && <span>vs {fmtSalesUsd(entry.salesEst)} est</span>}
            </div>
          )}
        </div>
      )}
      {showEps && (
        <div>
          <div className="flex flex-wrap gap-x-2 items-baseline">
            <span className="uppercase tracking-wide text-gray-500 dark:text-slate-400 w-12 text-xs">EPS</span>
            <span className="font-mono tabular-nums text-gray-900 dark:text-slate-100 font-semibold">{fmtEps(entry.epsActual, ccy) || "—"}</span>
            {has("epsEst") && <span className="text-gray-500 dark:text-slate-400">vs {fmtEps(entry.epsEst, ccy)} est</span>}
            {has("epsSurpPct") && <span className="font-mono tabular-nums font-semibold" style={{ color: surpColor(entry.epsSurpPct) }}>{fmtSurpPct(entry.epsSurpPct)}</span>}
            {has("epsSurpNom") && <span className="font-mono tabular-nums text-gray-500 dark:text-slate-400">({fmtEps(entry.epsSurpNom, ccy)})</span>}
          </div>
          {hasUsd && (has("epsActual") || has("epsEst")) && (
            <div className="flex flex-wrap gap-x-2 items-baseline text-xs text-gray-500 dark:text-slate-400 pl-12">
              <span>≈ {fmtEpsUsd(entry.epsActual) || "—"} USD</span>
              {has("epsEst") && <span>vs {fmtEpsUsd(entry.epsEst)} est</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EarningsEntry;
