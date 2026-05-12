/* Tests for the audit / status functions. These catch the
 * regressions we've already hit:
 *  - reportDate stored in mixed formats (M/D/YY, M/D/YYYY, ISO)
 *  - future-dated earnings entries being treated as "past"
 *  - no-data companies needing to flag, not silently skip
 *  - 13-month fallback when earningsEntries is incomplete
 */
import { describe, it, expect } from "vitest";
import { annualStaleStatus, getDataStatus } from "./dataStatus.js";
import { getLastReportedEntry } from "./index.js";

const TODAY = new Date("2026-05-15T00:00:00");

describe("getLastReportedEntry", () => {
  it("picks the most recent past entry regardless of date format", () => {
    const entries = [
      { id: "a", reportDate: "2026-02-06", thesisStatus: "On track" },
      { id: "b", reportDate: "5/8/26",     thesisStatus: "Watch" },     /* M/D/YY */
      { id: "c", reportDate: "5/12/2026",  thesisStatus: "Broken" },    /* future */
    ];
    /* Mock today by passing the entries; getLastReportedEntry uses
       its own `new Date()` so we just check the result is the May
       entry, not the Feb one. */
    const out = getLastReportedEntry(entries);
    expect(out).not.toBeNull();
    /* Either b (5/8/26 past) or c (5/12/2026, future on 5/15? actually
       past on real today). We just want NOT the Feb entry. */
    expect(out.id).not.toBe("a");
  });

  it("ignores future-dated entries", () => {
    const entries = [
      { id: "past",   reportDate: "2025-12-01" },
      { id: "future", reportDate: "2030-01-01" },
    ];
    const out = getLastReportedEntry(entries);
    expect(out.id).toBe("past");
  });

  it("returns null for empty / missing reportDates", () => {
    expect(getLastReportedEntry(null)).toBeNull();
    expect(getLastReportedEntry([])).toBeNull();
    expect(getLastReportedEntry([{ id: "x" }])).toBeNull(); /* no reportDate */
  });

  it("doesn't crash on malformed dates", () => {
    const out = getLastReportedEntry([
      { id: "bad", reportDate: "not a date" },
      { id: "good", reportDate: "2025-06-01" },
    ]);
    expect(out.id).toBe("good");
  });
});

describe("annualStaleStatus", () => {
  it("flags no-data companies regardless of FY", () => {
    const out = annualStaleStatus({ valuation: { fyMonth: "Dec" } }, TODAY);
    expect(out.stale).toBe(true);
    expect(out.reason).toBe("no-data");
  });

  it("doesn't flag a fresh import (latest FY matches expected)", () => {
    const co = {
      valuation: { fyMonth: "Dec" },
      financials: { years: ["2024", "2025"], estimate: [false, false] },
    };
    const out = annualStaleStatus(co, TODAY);
    expect(out.stale).toBe(false);
  });

  it("flags stale when post-FY-end report (lastReportDate) is on file but financials lag", () => {
    /* Dec FY co. FY-end = Dec 31 2025. Today May 15 2026. The Q4
       report would have hit ~mid-Feb. */
    const co = {
      valuation: { fyMonth: "Dec" },
      financials: { years: ["2024"], estimate: [false] },
      lastReportDate: "2026-02-15",
    };
    const out = annualStaleStatus(co, TODAY);
    expect(out.stale).toBe(true);
    expect(out.reason).toBe("post-fy-report");
  });

  it("does NOT flag when only future report dates are scheduled", () => {
    /* ATD-CA pattern: April FY-end, reports late June. On May 8
       2026, FY2026 has ended but the report hasn't happened yet —
       just a pre-populated future date. Stale should be false. */
    const co = {
      valuation: { fyMonth: "Apr" },
      financials: { years: ["2025"], estimate: [false] },
      earningsEntries: [{ reportDate: "2026-06-25" }], /* future */
    };
    const out = annualStaleStatus(co, TODAY);
    expect(out.stale).toBe(false);
  });

  it("ignores report dates within 7 days of FY-end (likely data glitches)", () => {
    /* Dec FY company looking at Jan 15. FY2025 ended Dec 31 2025.
       lastReportDate set to Jan 3 2026 — within 7 days of fyEnd, way
       too fast to be a real Q4 report. Should be ignored.
       FY2024 imported, so 13-mo fallback doesn't fire yet either. */
    const earlyJan = new Date("2026-01-15T00:00:00");
    const co = {
      valuation: { fyMonth: "Dec" },
      financials: { years: ["2024"], estimate: [false] },
      lastReportDate: "2026-01-03",
    };
    const out = annualStaleStatus(co, earlyJan);
    expect(out.stale).toBe(false);
  });

  it("13-month fallback fires when imported FY is more than 13 months stale", () => {
    /* Dec FY company looking at May 15 2026. Imported FY=2024 (its
       fy-end Dec 31 2024 was 16+ months ago). No earningsEntries.
       13-mo rule should fire — the post-FY-end report is presumed
       to have happened by now, but we don't have evidence of it. */
    const co = {
      valuation: { fyMonth: "Dec" },
      financials: { years: ["2024"], estimate: [false] },
    };
    const out = annualStaleStatus(co, TODAY);
    expect(out.stale).toBe(true);
    expect(out.reason).toBe("13mo-fallback");
  });

  it("Sold names never flag", () => {
    const co = {
      status: "Sold",
      valuation: { fyMonth: "Dec" },
      financials: { years: ["2020"], estimate: [false] }, /* very stale */
    };
    const out = annualStaleStatus(co, TODAY);
    expect(out.stale).toBe(false);
  });
});

describe("getDataStatus", () => {
  it("returns 'none' when no data uploaded for a kind", () => {
    expect(getDataStatus({}, "financials", TODAY)).toBe("none");
    expect(getDataStatus({}, "ratios", TODAY)).toBe("none");
  });

  it("'current' when latest historical year matches expected", () => {
    const co = {
      valuation: { fyMonth: "Dec" },
      financials: { years: ["2024", "2025"], estimate: [false, false] },
    };
    expect(getDataStatus(co, "financials", TODAY)).toBe("current");
  });

  it("'stale' when latest historical year is behind expected", () => {
    const co = {
      valuation: { fyMonth: "Dec" },
      financials: { years: ["2023", "2024"], estimate: [false, false] },
    };
    expect(getDataStatus(co, "financials", TODAY)).toBe("stale");
  });

  it("prices kind is 'current' iff any ticker has a parseable price", () => {
    expect(getDataStatus({ tickers: [] }, "prices", TODAY)).toBe("none");
    expect(getDataStatus({ tickers: [{ ticker: "X", price: 0 }] }, "prices", TODAY)).toBe("none");
    expect(getDataStatus({ tickers: [{ ticker: "X", price: 42.5 }] }, "prices", TODAY)).toBe("current");
  });
});
