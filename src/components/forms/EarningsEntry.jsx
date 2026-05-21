import { useState, useEffect, useRef } from "react";
import { TP_CHANGES, THESIS_STATUSES } from '../../constants/index.js';
import { apiCall } from '../../api/index.js';
import { useAlert } from '../ui/DialogProvider.jsx';
import { inferQuarter, calcNormEPS, calcTP, getTpFixed, parseDate } from '../../utils/index.js';
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
  var { fxRates, submitTpApproval, tpApprovals } = useCompanyContext();
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
  /* True when this entry has already spawned a pending approval — used
     to disable the submit button and avoid duplicate requests. */
  var hasPending = (tpApprovals||[]).some(function(r){
    return r.earningsEntryId === entry.id && r.status === "pending";
  });
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
  var titleDate = e.reportDate || "";
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
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 italic" title={"Scheduled for " + e.reportDate}>
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
                 approval flow. */
              var canOpen = (e.tpChange === "Increased" || e.tpChange === "Decreased") && !hasPending && !!company;
              return (
                <button
                  type="button"
                  onClick={function(){
                    if(!canOpen) return;
                    var v = company.valuation || {};
                    setTpForm({
                      pe:   v.pe   != null && v.pe   !== "" ? String(v.pe)   : "",
                      eps1: v.eps1 != null && v.eps1 !== "" ? String(v.eps1) : "",
                      eps2: v.eps2 != null && v.eps2 !== "" ? String(v.eps2) : "",
                      w1:   v.w1   != null && v.w1   !== "" ? String(v.w1)   : "",
                      w2:   v.w2   != null && v.w2   !== "" ? String(v.w2)   : "",
                    });
                    setShowSubmitForm(true);
                  }}
                  disabled={!canOpen}
                  className={"text-xs px-3 py-1.5 font-semibold rounded-md transition-colors " + (canOpen ? "bg-amber-600 text-white border-none cursor-pointer hover:bg-amber-700" : "bg-slate-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 border-none cursor-not-allowed")}
                  title={hasPending ? "A TP change for this entry is already pending review" : "Submit the proposed TP for approval by another teammate"}
                >
                  {hasPending ? "TP change pending" : "Submit TP change for approval"}
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
            var canSubmit = isFinite(pe) && pe>0 && normEPS!==null && computedTP!==null && weightsOK;
            var INP="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none w-20";
            var LBL="text-[10px] text-gray-500 dark:text-slate-400 block mb-0.5 uppercase tracking-wide";
            return (
              <div className="mt-2 p-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
                <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-200 mb-2">Submit TP change for approval — full breakdown</div>
                <div className="flex gap-3 flex-wrap items-end mb-2">
                  <div>
                    <label className={LBL}>PE</label>
                    <input type="number" step="0.1" value={tpForm.pe} onChange={function(ev){setTpForm(Object.assign({},tpForm,{pe:ev.target.value}));}} className={INP}/>
                  </div>
                  <span className="text-gray-500 dark:text-slate-400 pb-1">×</span>
                  <div>
                    <label className={LBL}>EPS FY1</label>
                    <input type="number" step="0.01" value={tpForm.eps1} onChange={function(ev){setTpForm(Object.assign({},tpForm,{eps1:ev.target.value}));}} className={INP}/>
                  </div>
                  <div>
                    <label className={LBL}>W1 %</label>
                    <input type="number" step="1" value={tpForm.w1} onChange={function(ev){setTpForm(Object.assign({},tpForm,{w1:ev.target.value}));}} className={INP}/>
                  </div>
                  <span className="text-gray-500 dark:text-slate-400 pb-1">+</span>
                  <div>
                    <label className={LBL}>EPS FY2</label>
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
                      var v = company.valuation || {};
                      /* "From" snapshot strategy:
                         - fromTP = the value of company.valuation.tpFixed
                           AS IT STANDS RIGHT NOW. That's the previous
                           official TP — whether it landed via a prior
                           approval or a direct edit on the Valuation tab.
                           Falls back to legacy normEPSFixed × PE when
                           tpFixed isn't set.
                         - From breakdown (PE/EPS1/EPS2/W1/W2): pull from
                           the most recent tpHistory row that actually
                           HAS the full breakdown. Prefer source:"approval"
                           rows; if none, any row with the full breakdown
                           fields; if still nothing, leave breakdown null
                           (the card will show "—" rather than wrong data).
                         The from-TP and from-breakdown can refer to
                         different points in time when the user has done
                         direct edits — we surface the breakdown we have
                         on record while keeping fromTP truthful to the
                         current TP Fixed shown on the Valuation card. */
                      function _hasFullBreakdown(src){
                        if(!src) return false;
                        return isFinite(parseFloat(src.pe))
                          && isFinite(parseFloat(src.eps1))
                          && isFinite(parseFloat(src.eps2))
                          && isFinite(parseFloat(src.w1))
                          && isFinite(parseFloat(src.w2));
                      }
                      var hist = company.tpHistory || [];
                      var fromV = null;
                      /* Pass 1: most recent approval row with full breakdown. */
                      for(var hi = 0; hi < hist.length; hi++){
                        if(hist[hi] && hist[hi].source === "approval" && _hasFullBreakdown(hist[hi])){
                          fromV = hist[hi];
                          break;
                        }
                      }
                      /* Pass 2: any row with full breakdown. */
                      if(!fromV){
                        for(var hj = 0; hj < hist.length; hj++){
                          if(_hasFullBreakdown(hist[hj])){
                            fromV = hist[hj];
                            break;
                          }
                        }
                      }
                      /* Pass 3: any row with at least a blended eps. */
                      if(!fromV){
                        for(var hk = 0; hk < hist.length; hk++){
                          var h = hist[hk];
                          if(h && isFinite(parseFloat(h.pe)) && isFinite(parseFloat(h.eps))){
                            fromV = h;
                            break;
                          }
                        }
                      }
                      /* Nothing usable in history — leave breakdown empty. */
                      if(!fromV) fromV = {};
                      var fromPE   = parseFloat(fromV.pe);
                      var fromEPS1 = parseFloat(fromV.eps1);
                      var fromEPS2 = parseFloat(fromV.eps2);
                      var fromW1   = parseFloat(fromV.w1);
                      var fromW2   = parseFloat(fromV.w2);
                      var fromNormEPS = null;
                      if(isFinite(fromEPS1) && isFinite(fromEPS2) && isFinite(fromW1) && isFinite(fromW2)){
                        fromNormEPS = (fromEPS1*fromW1 + fromEPS2*fromW2) / 100;
                      } else if(isFinite(fromEPS1) && !isFinite(fromEPS2)){
                        fromNormEPS = fromEPS1;
                      } else if(isFinite(parseFloat(fromV.eps))){
                        /* Legacy tpHistory entries only have blended `eps`. */
                        fromNormEPS = parseFloat(fromV.eps);
                      }
                      /* fromTP = the company's current TP Fixed (what the
                         user sees as "previous" on the Valuation card).
                         Uses getTpFixed so the legacy normEPSFixed × PE
                         path still works for old data. */
                      var fromTP = getTpFixed(v);
                      if(fromTP === null && isFinite(fromPE) && fromNormEPS !== null){
                        /* Last-ditch fallback when tpFixed has never been
                           set: derive from whatever breakdown we found. */
                        fromTP = fromPE * fromNormEPS;
                      }
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
                      submitTpApproval({
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
                        /* What the PE × normEPS math actually produces, even
                           when the suggester rounded to a cleaner number for
                           the proposed TP. Approval card displays this as a
                           sanity check next to toTP if they differ. */
                        computedTP: computedTP,
                        /* Legacy field, kept for compat with older approval
                           records and the approval-card display logic that
                           reads it. For new records this equals finalToTP. */
                        proposedTP: isFinite(enteredTP) ? enteredTP : null,
                        /* Snapshot FY labels at submission time so the
                           Weights display can read "FY26/FY27 50/50 →
                           0/100" rather than the ambiguous "W1/W2". */
                        fy1: v.fy1 || "",
                        fy2: v.fy2 || "",
                        rationale: e.tpRationale || e.extendedTakeaway || "",
                        earningsEntryId: entry.id,
                      });
                      setTpSubmitMsg("✓ Submitted for approval");
                      setTimeout(function(){setTpSubmitMsg("");}, 3000);
                      setShowSubmitForm(false);
                    }}
                    className={"text-xs px-3 py-1 font-semibold rounded-md transition-colors " + (canSubmit ? "bg-amber-600 text-white border-none cursor-pointer hover:bg-amber-700" : "bg-slate-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 border-none cursor-not-allowed")}
                  >
                    Submit for approval
                  </button>
                  <button type="button" onClick={function(){setShowSubmitForm(false);}} className="text-xs px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">Cancel</button>
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
