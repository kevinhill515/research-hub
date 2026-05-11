import { MONTHS } from '../../constants/index.js';
import { parseDate, sectorStyle, shortSector, inferQuarter } from '../../utils/index.js';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import StatusPill from '../ui/StatusPill.jsx';

/* Format a sales value (uploaded in MILLIONS of local currency) with
 * auto unit scaling. Prefix is the local currency code (e.g. "CAD"),
 * not "$" — earlier "$" hardcode misled when the company reports in
 * a non-USD currency. Bucket: K / M / B / T.
 */
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
/* EPS / per-share local currency amount. */
function fmtEps(n, prefix) {
  if (n === null || n === undefined || !isFinite(n)) return null;
  return prefix + " " + n.toFixed(2);
}
/* Signed percent surprise (e.g. "+3.6%" / "−1.2%"). Value is stored
 * as a plain percent number (3.6 means 3.6%), not a decimal. */
function fmtSurpPct(n) {
  if (n === null || n === undefined || !isFinite(n)) return null;
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}
function surpColor(n) {
  if (n === null || n === undefined || !isFinite(n) || Math.abs(n) < 0.05) return undefined;
  return n > 0 ? "#166534" : "#dc2626";
}

/* Stats block under the company name on each calendar tile. Renders
 * sales and EPS in the company's local currency (with a USD-converted
 * line below when the currency isn't USD and an FX rate is available).
 *
 *   currency: company.valuation.currency (e.g. "CAD")
 *   fxRates:  { CAD: 1.36, ... } — local-per-USD; USD = ÷ rate
 */
function StatsBlock({ entry, variant, currency, fxRates }) {
  if (!entry) return null;
  const has = function (k) { return entry[k] !== null && entry[k] !== undefined && isFinite(entry[k]); };
  const ccy = (currency || "USD").toUpperCase();
  const fx = ccy === "USD" ? 1 : (fxRates && parseFloat(fxRates[ccy])) || null;
  const hasUsd = ccy !== "USD" && fx && fx > 0;
  const fmtSalesUsd = (n) => (hasUsd && n !== null && n !== undefined && isFinite(n)) ? fmtSales(n / fx, "$") : null;
  const fmtEpsUsd   = (n) => (hasUsd && n !== null && n !== undefined && isFinite(n)) ? "$" + (n / fx).toFixed(2) : null;

  if (variant === "upcoming") {
    if (!has("salesEst") && !has("epsEst")) return null;
    return (
      <div className="mt-1 text-xs leading-tight space-y-0.5">
        <div className="flex flex-wrap gap-x-2 items-baseline">
          <span className="uppercase tracking-wide text-gray-500 dark:text-slate-400">Consensus</span>
          {has("salesEst") && <span>Sales <span className="font-mono tabular-nums text-gray-700 dark:text-slate-300 font-semibold">{fmtSales(entry.salesEst, ccy)}</span></span>}
          {has("epsEst")   && <span>EPS <span className="font-mono tabular-nums text-gray-700 dark:text-slate-300 font-semibold">{fmtEps(entry.epsEst, ccy)}</span></span>}
        </div>
        {hasUsd && (has("salesEst") || has("epsEst")) && (
          <div className="flex flex-wrap gap-x-2 items-baseline text-[10px] text-gray-500 dark:text-slate-400 pl-[58px]">
            {has("salesEst") && <span>≈ {fmtSalesUsd(entry.salesEst)} USD</span>}
            {has("epsEst")   && <span>EPS ≈ {fmtEpsUsd(entry.epsEst)} USD</span>}
          </div>
        )}
      </div>
    );
  }
  /* Recent — show estimate vs actual + surprise per metric. */
  const showSales = has("salesActual") || has("salesEst") || has("salesSurpPct");
  const showEps   = has("epsActual")   || has("epsEst")   || has("epsSurpPct");
  if (!showSales && !showEps) return null;
  return (
    <div className="mt-1 text-xs leading-tight space-y-1">
      {showSales && (
        <div>
          <div className="flex flex-wrap gap-x-1.5 items-baseline">
            <span className="uppercase tracking-wide text-gray-500 dark:text-slate-400 w-10">Sales</span>
            <span className="font-mono tabular-nums text-gray-900 dark:text-slate-100 font-semibold">{fmtSales(entry.salesActual, ccy) || "—"}</span>
            {has("salesEst") && <span className="text-gray-500 dark:text-slate-400">vs {fmtSales(entry.salesEst, ccy)} est</span>}
            {has("salesSurpPct") && <span className="font-mono tabular-nums font-semibold" style={{ color: surpColor(entry.salesSurpPct) }}>{fmtSurpPct(entry.salesSurpPct)}</span>}
            {has("salesSurpNom") && <span className="font-mono tabular-nums text-gray-500 dark:text-slate-400">({fmtSales(entry.salesSurpNom, ccy)})</span>}
          </div>
          {hasUsd && (has("salesActual") || has("salesEst")) && (
            <div className="flex flex-wrap gap-x-1.5 items-baseline text-[10px] text-gray-500 dark:text-slate-400 pl-10">
              <span>≈ {fmtSalesUsd(entry.salesActual) || "—"} USD</span>
              {has("salesEst") && <span>vs {fmtSalesUsd(entry.salesEst)} est</span>}
            </div>
          )}
        </div>
      )}
      {showEps && (
        <div>
          <div className="flex flex-wrap gap-x-1.5 items-baseline">
            <span className="uppercase tracking-wide text-gray-500 dark:text-slate-400 w-10">EPS</span>
            <span className="font-mono tabular-nums text-gray-900 dark:text-slate-100 font-semibold">{fmtEps(entry.epsActual, ccy) || "—"}</span>
            {has("epsEst") && <span className="text-gray-500 dark:text-slate-400">vs {fmtEps(entry.epsEst, ccy)} est</span>}
            {has("epsSurpPct") && <span className="font-mono tabular-nums font-semibold" style={{ color: surpColor(entry.epsSurpPct) }}>{fmtSurpPct(entry.epsSurpPct)}</span>}
            {has("epsSurpNom") && <span className="font-mono tabular-nums text-gray-500 dark:text-slate-400">({fmtEps(entry.epsSurpNom, ccy)})</span>}
          </div>
          {hasUsd && (has("epsActual") || has("epsEst")) && (
            <div className="flex flex-wrap gap-x-1.5 items-baseline text-[10px] text-gray-500 dark:text-slate-400 pl-10">
              <span>≈ {fmtEpsUsd(entry.epsActual) || "—"} USD</span>
              {has("epsEst") && <span>vs {fmtEpsUsd(entry.epsEst)} est</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Single row used by both the upcoming (left) and recent (right) panels.
 * `variant` = "upcoming" or "recent" controls the day-label wording and
 * urgency tinting (upcoming uses today/soon red/amber; recent uses a
 * calmer neutral palette). */
function Row({ c, date, daysAway, entry, variant, onClick, fxRates }) {
  const ss = c.sector ? sectorStyle(c.sector) : null;

  let borderStyle = "4px solid transparent";
  let tintClass = "bg-slate-50 dark:bg-slate-800";
  let labelColor = "#166534";
  let labelColorDark = "#4ade80";
  let label;

  if (variant === "upcoming") {
    const isToday = daysAway <= 7;
    const isTomorrow = daysAway <= 14 && daysAway > 7;
    labelColor = isToday ? "#991b1b" : isTomorrow ? "#854d0e" : "#166534";
    labelColorDark = isToday ? "#f87171" : isTomorrow ? "#fbbf24" : "#4ade80";
    borderStyle = isToday ? "4px solid #dc2626"
                : isTomorrow ? "4px solid #d97706"
                : "4px solid transparent";
    tintClass = isToday ? "!bg-red-50 dark:!bg-red-950/30"
              : isTomorrow ? "!bg-amber-50 dark:!bg-amber-950/30"
              : "bg-slate-50 dark:bg-slate-800";
    label = daysAway === 0 ? "Today" : daysAway + "d away";
  } else {
    /* Recent — just show how many days ago. Neutral styling; more recent
       items get a slightly stronger accent. */
    const isLastWeek = daysAway <= 7;
    labelColor = isLastWeek ? "#1e40af" : "#475569";
    labelColorDark = isLastWeek ? "#60a5fa" : "#94a3b8";
    borderStyle = isLastWeek ? "4px solid #3b82f6" : "4px solid transparent";
    tintClass = isLastWeek ? "!bg-blue-50 dark:!bg-blue-950/30" : "bg-slate-50 dark:bg-slate-800";
    label = daysAway === 0 ? "Today" : daysAway + "d ago";
  }

  return (
    <div
      onClick={onClick}
      className={"flex gap-3 items-center px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 mb-1.5 transition-colors " + tintClass + (onClick ? " cursor-pointer hover:brightness-95 dark:hover:brightness-110" : "")}
      style={{ borderLeft: borderStyle }}
      title={onClick ? "Open " + c.name : undefined}
    >
      <div className="min-w-[60px] text-center">
        <div className="text-lg font-bold" style={{ color: labelColor }}>
          <span className="hidden dark:inline" style={{ color: labelColorDark }}>{date.getDate()}</span>
          <span className="dark:hidden">{date.getDate()}</span>
        </div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400">{MONTHS[date.getMonth()]}</div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex gap-1.5 items-center flex-wrap mb-0.5">
          <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{c.name}</span>
          {c.ticker && <span className="text-xs text-gray-500 dark:text-slate-400">{c.ticker}</span>}
          {ss && (
            <span className="text-xs px-1.5 rounded-full" style={{ background: ss.bg, color: ss.color }}>
              {shortSector(c.sector)}
            </span>
          )}
          {c.status && <StatusPill status={c.status} />}
        </div>
        {(function () {
          /* Caption under company name: prefer entry.quarter (legacy
             free-text from older entries) but fall back to the auto-
             inferred fiscal quarter from the entry's reportDate +
             company.valuation.fyMonth. Most upload-created entries
             have empty quarter strings, so inference fills the gap. */
          var label = (entry && entry.quarter) ? entry.quarter : "";
          if (!label && entry && entry.reportDate) {
            var inf = inferQuarter(entry.reportDate, c.valuation && c.valuation.fyMonth);
            if (inf) label = inf.label;
          }
          return label ? <div className="text-xs text-gray-500 dark:text-slate-400">{label}</div> : null;
        })()}
        <StatsBlock entry={entry} variant={variant} currency={c.valuation && c.valuation.currency} fxRates={fxRates} />
      </div>

      <div className="text-xs font-semibold whitespace-nowrap" style={{ color: labelColor }}>
        <span className="hidden dark:inline" style={{ color: labelColorDark }}>{label}</span>
        <span className="dark:hidden">{label}</span>
      </div>
    </div>
  );
}

function EarningsCalendar({ companies, onSelectCompany }) {
  const { fxRates } = useCompanyContext();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  /* Window: full calendar-quarter aligned, spanning the previous
     quarter through the end of next quarter. So on May 8, 2026
     (Q2-2026) the window is Jan 1, 2026 → Sep 30, 2026 — covering
     the season already in flight (Q1 reporters who are still trickling
     in) plus the next two quarters of upcoming dates. This matches how
     PMs actually think about reporting season instead of an arbitrary
     30-day rolling window. */
  function startOfQuarter(d) {
    const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
    return new Date(d.getFullYear(), qStartMonth, 1);
  }
  function addQuarters(d, n) {
    const q = startOfQuarter(d);
    return new Date(q.getFullYear(), q.getMonth() + n * 3, 1);
  }
  function endOfQuarterStart(qStart) {
    /* Last day of the quarter whose first day is qStart. */
    return new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0, 23, 59, 59);
  }
  const recentCutoff = startOfQuarter(today);                          /* start of current quarter */
  const upcomingCutoff = endOfQuarterStart(startOfQuarter(today));     /* end of current quarter */

  /* Upcoming: any earningsEntry with reportDate in [today, today+30]. */
  const upcoming = [];
  companies.forEach(function (c) {
    (c.earningsEntries || []).forEach(function (e) {
      if (!e.reportDate) return;
      const d = parseDate(e.reportDate);
      if (!d) return;
      d.setHours(0, 0, 0, 0);
      if (d >= today && d <= upcomingCutoff) {
        upcoming.push({ company: c, entry: e, date: d, daysAway: Math.floor((d - today) / 86400000) });
      }
    });
  });
  upcoming.sort(function (a, b) { return a.date - b.date; });

  /* Recent: a company's lastReportDate (from FactSet, populated by the
     daily script or the Earnings Dates upload's 3rd col) falling in the
     last 30 days. We also look up the earnings entry whose reportDate
     matches lastReportDate so its sales/eps estimate/actual/surprise
     fields can render in the row. Falls back to earningsEntries in
     that window for companies where lastReportDate hasn't been set yet. */
  function isoOfDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  const recent = [];
  const seen = {};
  companies.forEach(function (c) {
    const lrd = c.lastReportDate;
    if (lrd) {
      const d = parseDate(lrd);
      if (d) {
        d.setHours(0, 0, 0, 0);
        if (d >= recentCutoff && d <= today) {
          /* Find the entry whose reportDate equals lastReportDate so the
             upload's actuals/surprises render alongside the row. */
          const targetIso = isoOfDate(d);
          const matching = (c.earningsEntries || []).find(function (e) {
            if (!e.reportDate) return false;
            const ed = parseDate(e.reportDate);
            if (!ed) return false;
            ed.setHours(0, 0, 0, 0);
            return isoOfDate(ed) === targetIso;
          }) || null;
          recent.push({ company: c, entry: matching, date: d, daysAway: Math.floor((today - d) / 86400000) });
          seen[c.id] = true;
        }
      }
    }
  });
  /* Fallback: if no lastReportDate, check earningsEntries in the recent
     window. Avoid double-counting companies already captured above. */
  companies.forEach(function (c) {
    if (seen[c.id]) return;
    (c.earningsEntries || []).forEach(function (e) {
      if (!e.reportDate) return;
      const d = parseDate(e.reportDate);
      if (!d) return;
      d.setHours(0, 0, 0, 0);
      if (d >= recentCutoff && d < today) {
        if (!seen[c.id]) {
          recent.push({ company: c, entry: e, date: d, daysAway: Math.floor((today - d) / 86400000) });
          seen[c.id] = true;
        }
      }
    });
  });
  /* Most recent first */
  recent.sort(function (a, b) { return b.date - a.date; });

  /* Season progress: % of in-window companies that have already
     reported. Denominator = all unique companies with a date in the
     full window (recent + upcoming); numerator = those with a recent
     row. Gives a one-glance "we're 60% through this season" read. */
  const inSeason = {};
  recent.forEach(function (r) { inSeason[r.company.id] = "reported"; });
  upcoming.forEach(function (u) { if (!inSeason[u.company.id]) inSeason[u.company.id] = "scheduled"; });
  const totalInSeason = Object.keys(inSeason).length;
  const reportedInSeason = Object.keys(inSeason).filter(function (id) { return inSeason[id] === "reported"; }).length;
  const pctReported = totalInSeason > 0 ? Math.round((reportedInSeason / totalInSeason) * 100) : 0;

  /* Format the window endpoints for the header subtitle. */
  function fmtShort(d) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div className="space-y-3">
      {/* Season progress header */}
      {totalInSeason > 0 && (
        <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div className="text-sm">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{reportedInSeason}</span>
              <span className="text-gray-500 dark:text-slate-400"> reported · </span>
              <span className="font-semibold text-blue-700 dark:text-blue-400">{upcoming.length}</span>
              <span className="text-gray-500 dark:text-slate-400"> upcoming · </span>
              <span className="font-semibold text-gray-900 dark:text-slate-100">{pctReported}%</span>
              <span className="text-gray-500 dark:text-slate-400"> of {totalInSeason} companies have reported this season</span>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400 ml-auto">
              Window: {fmtShort(recentCutoff)} – {fmtShort(upcomingCutoff)}
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-emerald-500 dark:bg-emerald-400" style={{ width: pctReported + "%" }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-2">
            Upcoming — through {fmtShort(upcomingCutoff)} <span className="text-gray-500 dark:text-slate-400 font-normal">({upcoming.length})</span>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">No earnings scheduled through end of next quarter.</p>
          ) : upcoming.map(function (u, i) {
            return <Row key={"u"+i} c={u.company} date={u.date} daysAway={u.daysAway} entry={u.entry} variant="upcoming" fxRates={fxRates} onClick={onSelectCompany ? function(){onSelectCompany(u.company);} : undefined} />;
          })}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-2">
            Recent — back to {fmtShort(recentCutoff)} <span className="text-gray-500 dark:text-slate-400 font-normal">({recent.length})</span>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">No earnings reported since start of last quarter. Run the daily FactSet pull or paste into the Earnings Dates upload (now accepts a 3rd column: Last Rpt Date).</p>
          ) : recent.map(function (r, i) {
            return <Row key={"r"+i} c={r.company} date={r.date} daysAway={r.daysAway} entry={r.entry} variant="recent" fxRates={fxRates} onClick={onSelectCompany ? function(){onSelectCompany(r.company);} : undefined} />;
          })}
        </div>
      </div>
    </div>
  );
}

export default EarningsCalendar;
