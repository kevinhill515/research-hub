/* Data-currency status for company tabs.
 *
 * Returns one of:
 *   "none"     — nothing imported for this kind
 *   "current"  — most-recent historical year ≥ most-recently-completed FY
 *   "stale"    — most-recent historical year < most-recently-completed FY
 *
 * Used to badge the company-detail tabs (Financials / Ratios / Segments
 * / E[EPS] Revisions / Guidance / Snapshot) with ✓ when fresh and ⚠
 * when one or more fiscal years behind the calendar.
 *
 * The "expected most-recent FY year" is computed from company.valuation.fyMonth
 * (e.g. "Dec", "Mar"), defaulting to "Dec" when missing. We compare just
 * the YEAR part — we don't try to be clever about partial-quarter
 * staleness. A US Dec-FY name on April 27 2026: expected = 2025 (since
 * 2026 hasn't ended); a Japan March-FY name on April 27 2026: expected
 * = 2026 (since 3/31/2026 just passed).
 */

const MONTH_FROM_NAME = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/* End-of-month day for a 1-indexed month number, in the given year.
 * Date(year, month, 0) returns the last day of `month` since "month" is
 * 0-indexed in the constructor and "0" means "previous month's last day". */
function lastDayOfMonth(year, monthNum) {
  return new Date(year, monthNum, 0).getDate();
}

/* Year of the most recently completed FY for a company. */
export function expectedLatestFYYear(company, today) {
  const t = today || new Date();
  const fyMonthRaw = (company && company.valuation && company.valuation.fyMonth) || "Dec";
  const monthKey = String(fyMonthRaw).toLowerCase().slice(0, 3);
  const monthNum = MONTH_FROM_NAME[monthKey] || 12;
  const lastDay = lastDayOfMonth(t.getFullYear(), monthNum);
  const fyEndThisYear = new Date(t.getFullYear(), monthNum - 1, lastDay, 23, 59, 59);
  return t >= fyEndThisYear ? t.getFullYear() : t.getFullYear() - 1;
}

/* Pull a 4-digit year from any string-ish year/period value. */
function extractYear(s) {
  const m = /(\d{4})/.exec(String(s || ""));
  return m ? parseInt(m[1], 10) : null;
}

/* Latest historical year in a years[] array, skipping forward
 * estimates. years and estimate are parallel arrays from the time-series
 * imports (Financials / Ratios). Falls back to last entry if no
 * estimate flags. */
function latestHistoricalYear(years, estimate) {
  if (!years || !years.length) return null;
  for (let i = years.length - 1; i >= 0; i--) {
    if (estimate && estimate[i]) continue;
    const y = extractYear(years[i]);
    if (y) return y;
  }
  /* No estimate flags or all flagged — just use the last parseable year. */
  for (let i = years.length - 1; i >= 0; i--) {
    const y = extractYear(years[i]);
    if (y) return y;
  }
  return null;
}

/* Latest year across an array of Guidance history rows where Actual is
 * populated (i.e. the FY has closed). */
function latestGuidanceActualYear(history) {
  if (!history || !history.length) return null;
  let max = null;
  history.forEach(function (r) {
    if (r.actual === null || r.actual === undefined || !isFinite(r.actual)) return;
    const y = extractYear(r.period);
    if (y && (max === null || y > max)) max = y;
  });
  return max;
}

/* Latest year from EPS revisions header dates. */
function latestEpsRevYear(epsRevisions) {
  if (!epsRevisions || !epsRevisions.dates || !epsRevisions.dates.length) return null;
  /* dates is monthly, but we just want the latest year. */
  let max = null;
  epsRevisions.dates.forEach(function (d) {
    const y = extractYear(d);
    if (y && (max === null || y > max)) max = y;
  });
  return max;
}

/* Public: return status for a single (company, kind) pair. */
export function getDataStatus(company, kind, today) {
  if (!company) return "none";
  const expected = expectedLatestFYYear(company, today);

  let latest = null;
  let hasAny = false;
  if (kind === "financials" || kind === "ratios") {
    const data = company[kind];
    if (data && data.years && data.years.length) {
      hasAny = true;
      latest = latestHistoricalYear(data.years, data.estimate);
    }
  } else if (kind === "segments") {
    const data = company.segments;
    if (data && data.years && data.years.length) {
      hasAny = true;
      latest = latestHistoricalYear(data.years, null);
    }
  } else if (kind === "epsrev") {
    if (company.epsRevisions && company.epsRevisions.dates && company.epsRevisions.dates.length) {
      hasAny = true;
      latest = latestEpsRevYear(company.epsRevisions);
    }
  } else if (kind === "guidance") {
    if (company.guidance && company.guidance.history && company.guidance.history.length) {
      hasAny = true;
      latest = latestGuidanceActualYear(company.guidance.history);
      /* If guidance exists but no Actuals are populated yet (forward-only
       * paste), don't flag stale — the user has uploaded the latest data;
       * actuals just haven't landed in FactSet yet. */
      if (latest === null) return "current";
    }
  } else if (kind === "snapshot") {
    /* Snapshot derives from financials + ratios. Use the freshest of the two. */
    const f = getDataStatus(company, "financials", today);
    const r = getDataStatus(company, "ratios", today);
    if (f === "none" && r === "none") return "none";
    if (f === "current" || r === "current") return "current";
    return "stale";
  }

  if (!hasAny) return "none";
  if (latest === null) return "current"; /* data exists but no parseable year — give benefit of the doubt */
  return latest >= expected ? "current" : "stale";
}

/* Convenience: returns the badge string to append to a tab label. */
export function statusBadge(status) {
  if (status === "current") return " ✓";
  if (status === "stale") return " ⚠";
  return "";
}

/* Tooltip text to surface why ⚠ shows. */
export function staleReason(company, kind, today) {
  const expected = expectedLatestFYYear(company, today);
  return "Latest imported data is one or more fiscal years behind. Expected FY ending in " + expected + " has closed — re-import to refresh.";
}
