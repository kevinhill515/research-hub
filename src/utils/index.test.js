/* Smoke tests for pure helpers in utils/index.js. Covers:
 *  - fmtDateUS (the display-everywhere formatter)
 *  - parseDate (round-trips most input shapes — protects the sort layer)
 *  - calcNormEPS / calcTP / calcMOS (drive TP Live, MOS Live, the
 *    Suggest TP Change implied calc, and the daily egress-saving
 *    autosave dedupe)
 *  - ccyPrefix (Portfolios + Valuation card currency symbols)
 *  - todayStr (the canonical "now" date for entries that lack one)
 */
import { describe, it, expect } from "vitest";
import {
  fmtDateUS, parseDate, todayStr, ccyPrefix,
  calcNormEPS, calcTP, calcMOS,
} from "./index.js";

describe("fmtDateUS", () => {
  it("formats ISO YYYY-MM-DD as M/D/YY", () => {
    expect(fmtDateUS("2026-06-03")).toBe("6/3/26");
    expect(fmtDateUS("2026-01-15")).toBe("1/15/26");
    expect(fmtDateUS("2026-12-31")).toBe("12/31/26");
  });

  it("handles empty / null gracefully", () => {
    expect(fmtDateUS("")).toBe("");
    expect(fmtDateUS(null)).toBe("");
    expect(fmtDateUS(undefined)).toBe("");
  });

  it("passes through unparseable strings unchanged", () => {
    expect(fmtDateUS("not-a-date")).toBe("not-a-date");
  });

  it("falls back to parseDate for legacy non-ISO inputs", () => {
    /* "5-Jun-2026" → parseDate handles the DD-MMM-YYYY regex branch. */
    const out = fmtDateUS("5-Jun-2026");
    expect(out).toBe("6/5/26");
  });
});

describe("parseDate", () => {
  it("parses ISO YYYY-MM-DD", () => {
    /* `new Date("2026-06-03")` is parsed as UTC midnight by spec, so
       the local getDate/getMonth shift in non-UTC zones. Test against
       getUTC* accessors instead so the assertion is timezone-stable. */
    const d = parseDate("2026-06-03");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(3);
  });

  it("parses DD-MMM-YYYY", () => {
    /* This branch builds via `new Date(yr, mo, day)` which uses local
       time, so getDate/getMonth read back as written. */
    const d = parseDate("3-Jun-2026");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(3);
  });

  it("returns null on garbage input", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate("definitely-not-a-date")).toBeNull();
  });
});

describe("todayStr", () => {
  it("returns YYYY-MM-DD shape", () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("ccyPrefix", () => {
  it("maps common currencies to symbols", () => {
    expect(ccyPrefix("USD")).toBe("$");
    expect(ccyPrefix("EUR")).toBe("€");
    expect(ccyPrefix("JPY")).toBe("¥");
    expect(ccyPrefix("GBP")).toBe("£");
    expect(ccyPrefix("CAD")).toBe("C$");
  });

  it("falls back to 3-letter code + space for unknown currencies", () => {
    expect(ccyPrefix("XYZ")).toBe("XYZ ");
  });

  it("handles empty/missing currency", () => {
    expect(ccyPrefix("")).toBe("");
    expect(ccyPrefix(null)).toBe("");
  });

  it("is case-insensitive", () => {
    expect(ccyPrefix("usd")).toBe("$");
    expect(ccyPrefix("Eur")).toBe("€");
  });
});

describe("calcNormEPS", () => {
  it("blends FY1 and FY2 by weights", () => {
    const v = { eps1: 5, eps2: 10, w1: 50, w2: 50 };
    expect(calcNormEPS(v)).toBe(7.5);
  });

  it("respects asymmetric weights (Suncor-style 0/100)", () => {
    const v = { eps1: 5, eps2: 10, w1: 0, w2: 100 };
    expect(calcNormEPS(v)).toBe(10);
  });

  it("falls back to FY1 when FY2 missing", () => {
    /* When eps2 is missing but eps1 is set, returns eps1 directly
       (the team uses single-FY estimates for some names). */
    expect(calcNormEPS({ eps1: 5 })).toBe(5);
  });

  it("returns null when both legs are missing", () => {
    expect(calcNormEPS({})).toBeNull();
  });
});

describe("calcTP", () => {
  it("multiplies PE by normalized EPS", () => {
    expect(calcTP(20, 5)).toBe(100);
    expect(calcTP(17.5, 4.2)).toBeCloseTo(73.5, 2);
  });

  it("returns null on missing or zero inputs", () => {
    expect(calcTP(null, 5)).toBeNull();
    expect(calcTP(20, null)).toBeNull();
    expect(calcTP(0, 5)).toBeNull();
  });
});

describe("calcMOS", () => {
  it("computes (TP - price) / TP as a percentage (upside)", () => {
    /* TP 120, price 100 → MOS = (120-100)/120 = 16.67% upside */
    expect(calcMOS(120, 100)).toBeCloseTo(16.7, 1);
  });

  it("returns negative when price exceeds TP (downside)", () => {
    /* TP 80, price 100 → MOS = (80-100)/80 = -25% */
    expect(calcMOS(80, 100)).toBeCloseTo(-25, 1);
  });

  it("returns null when price or TP is missing/zero", () => {
    expect(calcMOS(100, 0)).toBeNull();
    expect(calcMOS(null, 100)).toBeNull();
    expect(calcMOS(100, null)).toBeNull();
  });
});
