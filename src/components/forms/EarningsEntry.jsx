import { useState, useEffect } from "react";
import { TP_CHANGES, THESIS_STATUSES } from '../../constants/index.js';
import { apiCall } from '../../api/index.js';
import { useAlert } from '../ui/DialogProvider.jsx';
import { inferQuarter } from '../../utils/index.js';
import GuidanceVsActual from '../companies/GuidanceVsActual.jsx';

function EarningsEntry({ entry, onSave, onDelete, currency, company }) {
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

  var tcColor = e.thesisStatus === "On track" ? "#166534" : e.thesisStatus === "Watch" ? "#854d0e" : "#991b1b";
  var tcBg = e.thesisStatus === "On track" ? "#dcfce7" : e.thesisStatus === "Watch" ? "#fef9c3" : "#fee2e2";
  var tpColor = e.tpChange === "Increased" ? "#166534" : e.tpChange === "Decreased" ? "#991b1b" : "#475569";
  var tpBg = e.tpChange === "Increased" ? "#dcfce7" : e.tpChange === "Decreased" ? "#fee2e2" : "#f1f5f9";

  var inputClasses = "text-xs px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 w-full focus:ring-2 focus:ring-blue-500 focus:outline-none";
  var labelClasses = "text-[10px] text-gray-500 dark:text-slate-400 block mb-1 uppercase";

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
        <span className="text-sm font-bold text-gray-900 dark:text-slate-100 flex-1">
          {headerTitle}
        </span>
        {e.tpChange && e.tpChange !== "Unchanged" && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: tpBg, color: tpColor }}
          >
            {e.tpChange} TP{e.newTP ? " \u2192 " + currency + " " + e.newTP : ""}
          </span>
        )}
        {e.thesisStatus && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: tcBg, color: tcColor }}
          >
            {e.thesisStatus}
          </span>
        )}
        {e.shortTakeaway && (
          <span className="text-xs text-gray-500 dark:text-slate-400 italic max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
            &ldquo;{e.shortTakeaway}&rdquo;
          </span>
        )}
        <span className="text-xs text-gray-500 dark:text-slate-400 ml-auto">
          {open ? "\u25b2" : "\u25bc"}
        </span>
      </div>

      {/* Sales / EPS estimate / actual / surprise strip. Populated by the
          Earnings Dates upload (or the daily script) and rendered whether
          the entry is open or collapsed so the user sees the read at a
          glance. Different content for "next-quarter" entries (consensus
          only, no actuals) vs "last-reported" entries (actuals + surprise). */}
      <EarningsStatsStrip entry={e} currency={currency} />

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
                <textarea
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
                {TP_CHANGES.map(function (t) { return <option key={t}>{t}</option>; })}
              </select>
            </div>
            <div>
              <label className={labelClasses}>New TP ({currency})</label>
              <input type="number" step="0.01" value={e.newTP} onChange={function (ev) { upd({ newTP: ev.target.value }); }} placeholder="e.g. 52.00" className={inputClasses} disabled={e.tpChange === "Unchanged"} />
            </div>
            <div>
              <label className={labelClasses}>TP Rationale</label>
              <input value={e.tpRationale} onChange={function (ev) { upd({ tpRationale: ev.target.value }); }} placeholder="Brief reason" className={inputClasses} />
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
                {THESIS_STATUSES.map(function (s) { return <option key={s}>{s}</option>; })}
              </select>
            </div>
            <div>
              <label className={labelClasses}>Thesis Note</label>
              <input value={e.thesisNote} onChange={function (ev) { upd({ thesisNote: ev.target.value }); }} placeholder="What changed / what to watch" className={inputClasses} />
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
            <textarea
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
                <div key={i} className="flex gap-1.5 mb-1 items-center">
                  <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">{"\u2022"}</span>
                  <input
                    value={b}
                    onChange={function (ev) { updBullet(i, ev.target.value); }}
                    placeholder={"Bullet " + (i + 1)}
                    className={inputClasses + " flex-1"}
                  />
                  {e.bullets.length > 1 && (
                    <span
                      onClick={function () { removeBullet(i); }}
                      className="text-xs text-red-600 dark:text-red-400 cursor-pointer shrink-0 hover:text-red-800 dark:hover:text-red-300 transition-colors"
                    >
                      x
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2.5 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={function () { onSave(e); setOpen(false); }}
              className="text-xs px-4 py-1.5 font-semibold bg-blue-700 text-white border-none rounded-md cursor-pointer hover:bg-blue-800 transition-colors"
            >
              Save entry
            </button>
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
function EarningsStatsStrip({ entry, currency }) {
  if (!entry) return null;
  const has = function (k) { return entry[k] !== null && entry[k] !== undefined && isFinite(entry[k]); };

  /* Sales values come from the upload in MILLIONS (FactSet convention).
     Scale up to absolute dollars then bucket into M/B/T. So 24,800
     uploaded → "$24.8B". */
  function fmtSalesM(n) {
    if (n === null || n === undefined || !isFinite(n)) return null;
    const a = Math.abs(n), s = n < 0 ? "-" : "";
    if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "T";
    if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(1) + "B";
    if (a >= 1)   return s + "$" + a.toFixed(1) + "M";
    return s + "$" + Math.round(a * 1000) + "K";
  }
  function fmtEps(n) {
    if (n === null || n === undefined || !isFinite(n)) return null;
    return (currency ? currency + " " : "") + n.toFixed(2);
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
      <div className="px-3.5 py-1.5 bg-blue-50 dark:bg-blue-950/20 border-b border-slate-200 dark:border-slate-700 text-[11px] flex flex-wrap gap-x-3 items-baseline">
        <span className="uppercase tracking-wide text-gray-400 dark:text-slate-500">Consensus</span>
        {has("salesEst") && <span className="text-gray-700 dark:text-slate-300">Sales <span className="font-mono tabular-nums font-semibold">{fmtSalesM(entry.salesEst)}</span></span>}
        {has("epsEst")   && <span className="text-gray-700 dark:text-slate-300">EPS <span className="font-mono tabular-nums font-semibold">{fmtEps(entry.epsEst)}</span></span>}
      </div>
    );
  }
  /* Result mode (last-reported) — Sales / EPS actual vs est + surprise. */
  const showSales = has("salesActual") || has("salesEst") || has("salesSurpPct");
  const showEps   = has("epsActual")   || has("epsEst")   || has("epsSurpPct");
  return (
    <div className="px-3.5 py-1.5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700 text-[11px] space-y-0.5">
      {showSales && (
        <div className="flex flex-wrap gap-x-2 items-baseline">
          <span className="uppercase tracking-wide text-gray-400 dark:text-slate-500 w-10">Sales</span>
          <span className="font-mono tabular-nums text-gray-900 dark:text-slate-100 font-semibold">{fmtSalesM(entry.salesActual) || "—"}</span>
          {has("salesEst") && <span className="text-gray-500 dark:text-slate-400">vs {fmtSalesM(entry.salesEst)} est</span>}
          {has("salesSurpPct") && <span className="font-mono tabular-nums font-semibold" style={{ color: surpColor(entry.salesSurpPct) }}>{fmtSurpPct(entry.salesSurpPct)}</span>}
          {has("salesSurpNom") && <span className="font-mono tabular-nums text-gray-500 dark:text-slate-400">({fmtSalesM(entry.salesSurpNom)})</span>}
        </div>
      )}
      {showEps && (
        <div className="flex flex-wrap gap-x-2 items-baseline">
          <span className="uppercase tracking-wide text-gray-400 dark:text-slate-500 w-10">EPS</span>
          <span className="font-mono tabular-nums text-gray-900 dark:text-slate-100 font-semibold">{fmtEps(entry.epsActual) || "—"}</span>
          {has("epsEst") && <span className="text-gray-500 dark:text-slate-400">vs {fmtEps(entry.epsEst)} est</span>}
          {has("epsSurpPct") && <span className="font-mono tabular-nums font-semibold" style={{ color: surpColor(entry.epsSurpPct) }}>{fmtSurpPct(entry.epsSurpPct)}</span>}
          {has("epsSurpNom") && <span className="font-mono tabular-nums text-gray-500 dark:text-slate-400">({fmtEps(entry.epsSurpNom)})</span>}
        </div>
      )}
    </div>
  );
}

export default EarningsEntry;
