/* Compact "earnings this week" strip for the Companies tab header.
 *
 * Shows companies reporting in the next 7 days, color-coded by urgency
 * (today = bold amber, ≤3 days = amber, ≤7 days = muted). Click a
 * pill → opens the matching company. Source priority per company:
 *   1. c.guidance.nextReportDate (FactSet metadata, freshest)
 *   2. soonest future c.earningsEntries.reportDate
 *
 * Returns null when nothing's due — keeps the header clean. */

import { useMemo } from 'react';
import { parseDate } from '../../utils/index.js';

function daysUntil(iso, t0) {
  const d = parseDate(iso);
  if (!d || isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - t0.getTime()) / (24 * 3600 * 1000));
}

function fmtShort(iso) {
  const d = parseDate(iso);
  if (!d || isNaN(d.getTime())) return iso || "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ThisWeekEarnings({ companies, onSelectCompany }) {
  const upcoming = useMemo(function () {
    if (!companies || companies.length === 0) return [];
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const out = [];
    companies.forEach(function (c) {
      let iso = (c.guidance && c.guidance.nextReportDate) || null;
      if (!iso) {
        ((c.earningsEntries) || []).forEach(function (e) {
          if (!e.reportDate) return;
          const d = parseDate(e.reportDate);
          if (!d || d < t0) return;
          const cur = iso ? parseDate(iso) : null;
          if (!cur || d < cur) iso = e.reportDate;
        });
      }
      if (!iso) return;
      const days = daysUntil(iso, t0);
      if (days == null || days < 0 || days > 7) return;
      out.push({ company: c, iso: iso, days: days });
    });
    out.sort(function (a, b) { return a.days - b.days; });
    return out;
  }, [companies]);

  if (upcoming.length === 0) return null;

  function pillStyle(days) {
    if (days === 0) return "bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold border-amber-400 dark:border-amber-600";
    if (days <= 3) return "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-semibold border-amber-300 dark:border-amber-700";
    return "bg-slate-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-slate-200 dark:border-slate-700";
  }

  return (
    <div className="mb-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold">This week</span>
      {upcoming.map(function (u) {
        const dn = parseDate(u.iso);
        const dow = dn ? DAY_NAMES[dn.getDay()] : "";
        const label = u.days === 0
          ? "Today"
          : (dow + " " + fmtShort(u.iso));
        return (
          <button
            key={u.company.id}
            type="button"
            onClick={function () { onSelectCompany && onSelectCompany(u.company); }}
            className={"text-[11px] px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-90 transition-opacity " + pillStyle(u.days)}
            title={u.company.name + " · reports " + fmtShort(u.iso) + " (" + (u.days === 0 ? "today" : u.days + " day" + (u.days === 1 ? "" : "s")) + ")"}
          >
            <span className="font-medium">{u.company.name}</span>
            <span className="ml-1 text-[10px] opacity-80">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
