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

/* Reporting-lag window in days. After an FY closes the company has
 * this much time to report and re-import before the stale-data badge
 * starts firing — covers the typical 4-8 weeks between FY-end and
 * earnings call. Without this, a Mar-FY name flips to ⚠ on April 1
 * even though they don't report until mid-May. */
const FY_REPORT_LAG_DAYS = 30;

/* Year of the most recently completed FY for a company, with a
 * `FY_REPORT_LAG_DAYS` grace period: an FY isn't treated as "should be
 * imported by now" until that many days have passed since its
 * fiscal-year-end. */
export function expectedLatestFYYear(company, today) {
  const t = today || new Date();
  const fyMonthRaw = (company && company.valuation && company.valuation.fyMonth) || "Dec";
  const monthKey = String(fyMonthRaw).toLowerCase().slice(0, 3);
  const monthNum = MONTH_FROM_NAME[monthKey] || 12;
  const lastDay = lastDayOfMonth(t.getFullYear(), monthNum);
  const fyEndThisYear = new Date(t.getFullYear(), monthNum - 1, lastDay, 23, 59, 59);
  /* Apply lag: only treat the FY as "should be imported" once we're
     `FY_REPORT_LAG_DAYS` past its end. Until then, the prior FY is the
     latest one we expect to see in the data. */
  const lagMs = FY_REPORT_LAG_DAYS * 24 * 3600 * 1000;
  return (t.getTime() - lagMs) >= fyEndThisYear.getTime()
    ? t.getFullYear()
    : t.getFullYear() - 1;
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
  } else if (kind === "dashboard") {
    /* Dashboard rolls up Financials, Ratios, Segments. Same "freshest
       wins" rule as Snapshot: any current → current, all stale → stale,
       all none → none. */
    const f = getDataStatus(company, "financials", today);
    const r = getDataStatus(company, "ratios", today);
    const s = getDataStatus(company, "segments", today);
    if (f === "none" && r === "none" && s === "none") return "none";
    if (f === "current" || r === "current" || s === "current") return "current";
    return "stale";
  } else if (kind === "prices") {
    /* Prices tab is fed by company.tickers[].price (current) and the
       async-loaded prices_history series (history depth). We can only
       check the synchronous side here, so:
         current — any ticker has a parseable positive price
         none    — no ticker has a price yet
       We don't surface "stale" because lastPriceUpdate is a global
       timestamp, not per-company; a global age check would mislabel
       individual companies. */
    const tks = (company && company.tickers) || [];
    const hasPrice = tks.some(function (t) { const p = parseFloat(t && t.price); return isFinite(p) && p > 0; });
    return hasPrice ? "current" : "none";
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

/* True iff a company's annual financials are stale, defined as:
 *   The company's most recent FY-end has passed, AND
 *   - either there's an earningsEntries entry with reportDate >= that
 *     FY-end (i.e. the post-FY-end earnings report has happened) but
 *     the latest historical year in financials < FY-end year,
 *   - or it's been more than 13 months since the FY-end and still no
 *     post-FY-end report is recorded (covers companies where
 *     earningsEntries is incomplete).
 *
 * Used by the top-of-Companies banner that lists names whose annual
 * data needs a re-import. Excludes Sold names — they don't need
 * re-imports each cycle.
 *
 * Returns { stale: boolean, fyYear: number, reportSeen: boolean,
 *           latestImportedYear: number|null, fyEnd: string }
 * so the caller can format a useful tooltip ("FY2025 reported on
 * 2026-02-15, latest data is 2024"). */
export function annualStaleStatus(company, today) {
  if (!company) return { stale: false };
  if (company.status === "Sold") return { stale: false };
  const t = today || new Date();
  const fyMonthRaw = (company.valuation && company.valuation.fyMonth) || "Dec";
  const monthKey = String(fyMonthRaw).toLowerCase().slice(0, 3);
  const monthNum = MONTH_FROM_NAME[monthKey] || 12;
  /* Most recent FY-end that's already happened. If today is earlier
     in the calendar than this year's FY-end month/day, the most recent
     FY-end is from last year. */
  let fyYear = t.getFullYear();
  const lastDay = lastDayOfMonth(fyYear, monthNum);
  let fyEnd = new Date(fyYear, monthNum - 1, lastDay, 23, 59, 59);
  if (t < fyEnd) {
    fyYear = fyYear - 1;
    const ld = lastDayOfMonth(fyYear, monthNum);
    fyEnd = new Date(fyYear, monthNum - 1, ld, 23, 59, 59);
  }
  const fyEndIso = fyEnd.toISOString().slice(0, 10);

  /* Has any earnings report been recorded with reportDate >= fyEnd? */
  let reportSeen = false;
  const entries = (company.earningsEntries || []);
  for (let i = 0; i < entries.length; i++) {
    const rd = entries[i] && entries[i].reportDate;
    if (rd && String(rd) >= fyEndIso) { reportSeen = true; break; }
  }

  /* Latest historical year in financials. If financials missing
     entirely, treat as not-stale-yet — we don't pester names that have
     never been imported (those show up as "none" elsewhere). */
  const fin = company.financials || {};
  if (!fin.years || !fin.years.length) return { stale: false, fyYear: fyYear, reportSeen: reportSeen, latestImportedYear: null, fyEnd: fyEndIso };
  const latestImported = latestHistoricalYear(fin.years, fin.estimate);

  /* The 13-month fallback: covers names without earningsEntries. */
  const thirteenMonthsMs = 13 * 30 * 24 * 3600 * 1000;
  const thirteenMonthsPast = (t.getTime() - fyEnd.getTime()) > thirteenMonthsMs;

  if (latestImported && latestImported >= fyYear) {
    /* Already imported the latest FY — fresh. */
    return { stale: false, fyYear: fyYear, reportSeen: reportSeen, latestImportedYear: latestImported, fyEnd: fyEndIso };
  }

  /* Latest imported is behind. Stale if the post-FY report has happened
     OR we're past the 13-month fallback. Otherwise wait — they haven't
     reported yet. */
  const stale = reportSeen || thirteenMonthsPast;
  return { stale: stale, fyYear: fyYear, reportSeen: reportSeen, latestImportedYear: latestImported, fyEnd: fyEndIso };
}

/* Tooltip text to surface why ⚠ shows. */
export function staleReason(company, kind, today) {
  const expected = expectedLatestFYYear(company, today);
  return "Latest imported data is one or more fiscal years behind. Expected FY ending in " + expected + " closed > 30 days ago — re-import to refresh.";
}
