import { MONTHS } from '../../constants/index.js';
import { parseDate, sectorStyle, shortSector } from '../../utils/index.js';
import StatusPill from '../ui/StatusPill.jsx';

function EarningsCalendar({ companies }) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 30);

  var upcoming = [];
  companies.forEach(function (c) {
    (c.earningsEntries || []).forEach(function (e) {
      if (!e.reportDate) return;
      var d = parseDate(e.reportDate);
      if (!d) return;
      d.setHours(0, 0, 0, 0);
      if (d >= today && d <= cutoff) {
        upcoming.push({ company: c, entry: e, date: d, daysAway: Math.floor((d - today) / 86400000) });
      }
    });
  });

  upcoming.sort(function (a, b) { return a.date - b.date; });

  if (upcoming.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-slate-400">
        No earnings scheduled in the next 30 days. Add report dates in the Earnings tab of each company.
      </p>
    );
  }

  return (
    <div>
      {upcoming.map(function (u, i) {
        var c = u.company;
        var e = u.entry;
        var isToday = u.daysAway <= 7;
        var isTomorrow = u.daysAway <= 14 && u.daysAway > 7;
        var label = u.daysAway === 0 ? "Today" : u.daysAway + "d away";

        /* Muted urgency colors — readable against slate-50 background in light
           mode. Brighter variants used in dark mode for contrast. */
        var labelColor = isToday ? "#991b1b" : isTomorrow ? "#854d0e" : "#166534";
        var labelColorDark = isToday ? "#f87171" : isTomorrow ? "#fbbf24" : "#4ade80";
        var ss = c.sector ? sectorStyle(c.sector) : null;

        /* Urgency accent: colored left-border stripe (same in both themes)
           plus a mode-aware tint via Tailwind so dark mode stays readable. */
        var borderStyle = isToday
          ? "4px solid #dc2626"
          : isTomorrow
          ? "4px solid #d97706"
          : "4px solid transparent";
        var tintClass = isToday
          ? "!bg-red-50 dark:!bg-red-950/30"
          : isTomorrow
          ? "!bg-amber-50 dark:!bg-amber-950/30"
          : "bg-slate-50 dark:bg-slate-800";

        return (
          <div
            key={i}
            className={"flex gap-3 items-center px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 mb-1.5 transition-colors " + tintClass}
            style={{ borderLeft: borderStyle }}
          >
            {/* Date badge */}
            <div className="min-w-[60px] text-center">
              <div className="text-lg font-bold" style={{ color: labelColor }}>
                <span className="hidden dark:inline" style={{ color: labelColorDark }}>{u.date.getDate()}</span>
                <span className="dark:hidden">{u.date.getDate()}</span>
              </div>
              <div className="text-[10px] text-gray-500 dark:text-slate-400">{MONTHS[u.date.getMonth()]}</div>
            </div>

            {/* Company info */}
            <div className="flex-1">
              <div className="flex gap-1.5 items-center flex-wrap mb-0.5">
                <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{c.name}</span>
                {c.ticker && <span className="text-xs text-gray-500 dark:text-slate-400">{c.ticker}</span>}
                {ss && (
                  <span
                    className="text-xs px-1.5 rounded-full"
                    style={{ background: ss.bg, color: ss.color }}
                  >
                    {shortSector(c.sector)}
                  </span>
                )}
                {c.status && <StatusPill status={c.status} />}
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400">{e.quarter || "Earnings"}</div>
            </div>

            {/* Days away label */}
            <div className="text-xs font-semibold whitespace-nowrap" style={{ color: labelColor }}>
              <span className="hidden dark:inline" style={{ color: labelColorDark }}>{label}</span>
              <span className="dark:hidden">{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default EarningsCalendar;
