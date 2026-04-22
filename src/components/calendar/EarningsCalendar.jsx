import { MONTHS } from '../../constants/index.js';
import { parseDate, sectorStyle, shortSector } from '../../utils/index.js';
import StatusPill from '../ui/StatusPill.jsx';

/* Single row used by both the upcoming (left) and recent (right) panels.
 * `variant` = "upcoming" or "recent" controls the day-label wording and
 * urgency tinting (upcoming uses today/soon red/amber; recent uses a
 * calmer neutral palette). */
function Row({ c, date, daysAway, entry, variant, onClick }) {
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
        {entry && entry.quarter && <div className="text-xs text-gray-500 dark:text-slate-400">{entry.quarter}</div>}
      </div>

      <div className="text-xs font-semibold whitespace-nowrap" style={{ color: labelColor }}>
        <span className="hidden dark:inline" style={{ color: labelColorDark }}>{label}</span>
        <span className="dark:hidden">{label}</span>
      </div>
    </div>
  );
}

function EarningsCalendar({ companies, onSelectCompany }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingCutoff = new Date(today); upcomingCutoff.setDate(upcomingCutoff.getDate() + 30);
  const recentCutoff = new Date(today);   recentCutoff.setDate(recentCutoff.getDate() - 30);

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
     last 30 days. Falls back to earningsEntries in that window for
     companies where lastReportDate hasn't been set yet. */
  const recent = [];
  const seen = {};
  companies.forEach(function (c) {
    const lrd = c.lastReportDate;
    if (lrd) {
      const d = parseDate(lrd);
      if (d) {
        d.setHours(0, 0, 0, 0);
        if (d >= recentCutoff && d <= today) {
          recent.push({ company: c, entry: null, date: d, daysAway: Math.floor((today - d) / 86400000) });
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-2">Upcoming — Next 30 Days</div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">No earnings scheduled in the next 30 days.</p>
        ) : upcoming.map(function (u, i) {
          return <Row key={"u"+i} c={u.company} date={u.date} daysAway={u.daysAway} entry={u.entry} variant="upcoming" onClick={onSelectCompany ? function(){onSelectCompany(u.company);} : undefined} />;
        })}
      </div>
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-2">Recent — Last 30 Days</div>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">No earnings reported in the last 30 days. Run the daily FactSet pull or paste into the Earnings Dates upload (now accepts a 3rd column: Last Rpt Date).</p>
        ) : recent.map(function (r, i) {
          return <Row key={"r"+i} c={r.company} date={r.date} daysAway={r.daysAway} entry={r.entry} variant="recent" onClick={onSelectCompany ? function(){onSelectCompany(r.company);} : undefined} />;
        })}
      </div>
    </div>
  );
}

export default EarningsCalendar;
