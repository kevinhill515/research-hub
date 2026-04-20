/* Tests for the pure portfolio math helpers. These cover the bugs that
 * have bitten us in the past — most notably the FX-direction mistake
 * (multiply vs. divide) that inflated JPY positions to 20% of Small Cap. */

import { describe, it, expect } from "vitest";
import {
  toUSD,
  buildTickerOwners,
  calcCompanyRepMV,
  calcTotalMV,
  calcRepWeight,
  calcDiff,
  getNextReport,
  getPerf5d,
} from "./portfolioMath.js";

/* ------------------------------ toUSD ------------------------------ */
describe("toUSD", () => {
  const fx = { JPY: 152, EUR: 0.93, GBP: 0.74 };

  it("passes USD through unchanged", () => {
    expect(toUSD(1000, "USD", fx)).toBe(1000);
  });

  it("treats missing currency as USD", () => {
    expect(toUSD(1000, undefined, fx)).toBe(1000);
    expect(toUSD(1000, "",        fx)).toBe(1000);
  });

  it("divides by the rate (not multiplies) — regression for Small Cap JPY bug", () => {
    // 1,000 shares × ¥1,000 = ¥1,000,000 → $6,578.95 at 152 JPY/USD
    expect(toUSD(1_000_000, "JPY", fx)).toBeCloseTo(6578.947, 2);
  });

  it("is case-insensitive on currency code", () => {
    expect(toUSD(1_000_000, "jpy", fx)).toBeCloseTo(6578.947, 2);
  });

  it("returns 0 for missing / zero / negative rates (won't poison totals with NaN)", () => {
    expect(toUSD(1000, "XXX", fx)).toBe(0);
    expect(toUSD(1000, "JPY", {})).toBe(0);
    expect(toUSD(1000, "JPY", { JPY: 0 })).toBe(0);
    expect(toUSD(1000, "JPY", { JPY: -10 })).toBe(0);
    expect(toUSD(1000, "JPY", null)).toBe(0);
  });
});

/* ------------------------- buildTickerOwners ---------------------------- */
describe("buildTickerOwners", () => {
  it("gives each ticker to exactly one company, in-portfolio claims first", () => {
    const inPort = [
      { id: "A", tickers: [{ ticker: "AAA" }, { ticker: "SHARED" }] },
      { id: "B", tickers: [{ ticker: "BBB" }] },
    ];
    const other = [
      { id: "C", tickers: [{ ticker: "SHARED" }, { ticker: "CCC" }] }, // SHARED already claimed
    ];
    const owners = buildTickerOwners(inPort, other);
    expect(owners).toEqual({ AAA: "A", BBB: "B", SHARED: "A", CCC: "C" });
  });

  it("uppercases ticker keys and ignores blanks", () => {
    const inPort = [{ id: "A", tickers: [{ ticker: "aaa" }, { ticker: "" }, { ticker: null }] }];
    expect(buildTickerOwners(inPort, [])).toEqual({ AAA: "A" });
  });

  it("handles companies with no tickers array", () => {
    expect(buildTickerOwners([{ id: "A" }], [])).toEqual({});
  });
});

/* ------------------------- calcCompanyRepMV ---------------------------- */
describe("calcCompanyRepMV", () => {
  const fx = { JPY: 152, EUR: 0.93 };

  it("USD position: shares × price (no fx)", () => {
    const c = { id: "A", tickers: [{ ticker: "AAA", price: "50", currency: "USD" }] };
    const rep = { AAA: { shares: 100, avgCost: 40 } };
    expect(calcCompanyRepMV(c, rep, fx)).toBe(5000);
  });

  it("JPY position: shares × price / fx (regression for the 20% bug)", () => {
    const c = { id: "A", tickers: [{ ticker: "JJJ", price: "3000", currency: "JPY" }] };
    const rep = { JJJ: { shares: 5000 } };
    // 5000 × 3000 = ¥15,000,000 → $98,684.21 at 152 JPY/USD
    expect(calcCompanyRepMV(c, rep, fx)).toBeCloseTo(98684.21, 1);
  });

  it("sums multiple tickers on the same company, deduped by ticker", () => {
    const c = {
      id: "A",
      tickers: [
        { ticker: "AAA", price: "50",  currency: "USD" },
        { ticker: "BBB", price: "100", currency: "USD" },
        { ticker: "AAA", price: "50",  currency: "USD" }, // dup - should be ignored
      ],
    };
    const rep = { AAA: { shares: 100 }, BBB: { shares: 20 } };
    expect(calcCompanyRepMV(c, rep, fx)).toBe(100 * 50 + 20 * 100); // 7000
  });

  it("respects tickerOwners — only tickers owned by this company contribute", () => {
    const c = { id: "A", tickers: [{ ticker: "AAA", price: "50", currency: "USD" }] };
    const rep = { AAA: { shares: 100 } };
    const owners = { AAA: "OTHER" };
    expect(calcCompanyRepMV(c, rep, fx, owners)).toBe(0);
  });

  it("skips tickers with zero shares or unparseable price", () => {
    const c = {
      id: "A",
      tickers: [
        { ticker: "AAA", price: "50",   currency: "USD" },
        { ticker: "BBB", price: "abc",  currency: "USD" }, // bad price
        { ticker: "CCC", price: "10",   currency: "USD" }, // no rep shares
      ],
    };
    const rep = { AAA: { shares: 100 } }; // BBB/CCC not in rep
    expect(calcCompanyRepMV(c, rep, fx)).toBe(5000);
  });

  it("missing fx rate drops the position to 0, doesn't poison MV with NaN", () => {
    const c = { id: "A", tickers: [{ ticker: "ZZZ", price: "10", currency: "XYZ" }] };
    const rep = { ZZZ: { shares: 100 } };
    expect(calcCompanyRepMV(c, rep, fx)).toBe(0);
  });

  it("handles null/undefined company safely", () => {
    expect(calcCompanyRepMV(null, {}, fx)).toBe(0);
    expect(calcCompanyRepMV({ id: "A" }, {}, fx)).toBe(0);
  });
});

/* ---------------------------- calcTotalMV ------------------------------ */
describe("calcTotalMV", () => {
  const fx = { JPY: 152 };

  it("sums all companies plus CASH + DIVACC", () => {
    const portCos = [
      { id: "A", tickers: [{ ticker: "AAA", price: "50", currency: "USD" }] },
      { id: "B", tickers: [{ ticker: "BBB", price: "20", currency: "USD" }] },
    ];
    const rep = {
      AAA: { shares: 100 },
      BBB: { shares: 50 },
      CASH: { shares: 2000 },
      DIVACC: { shares: 500 },
    };
    // 5000 + 1000 + 2000 + 500 = 8500
    expect(calcTotalMV(portCos, rep, fx)).toBe(8500);
  });

  it("FX fix: regression for inflated portfolio total", () => {
    // Before the fix, a ¥152M JPY position would show as $152B.
    // Now it correctly shows as $1M.
    const portCos = [
      { id: "J", tickers: [{ ticker: "JJJ", price: "1000", currency: "JPY" }] },
    ];
    const rep = { JJJ: { shares: 152_000 } };
    // 152,000 × 1000 = ¥152M → $1M
    expect(calcTotalMV(portCos, rep, fx)).toBeCloseTo(1_000_000, 0);
  });
});

/* ---------------------------- calcRepWeight ---------------------------- */
describe("calcRepWeight", () => {
  it("returns percent rounded to 1 decimal", () => {
    expect(calcRepWeight(1234, 10_000)).toBe(12.3);
    expect(calcRepWeight(1_000, 10_000)).toBe(10.0);
  });

  it("returns null for non-positive inputs (so UI can show --)", () => {
    expect(calcRepWeight(0,   10_000)).toBeNull();
    expect(calcRepWeight(100, 0)).toBeNull();
    expect(calcRepWeight(-1,  10_000)).toBeNull();
  });
});

/* ----------------------------- calcDiff -------------------------------- */
describe("calcDiff", () => {
  it("returns (rep - target), rounded to 1 decimal", () => {
    expect(calcDiff(12.3, 10)).toBe(2.3);
    expect(calcDiff(10, 12.5)).toBe(-2.5);
  });

  it("returns null when target is missing or zero", () => {
    expect(calcDiff(12.3, 0)).toBeNull();
    expect(calcDiff(12.3, null)).toBeNull();
    expect(calcDiff(12.3, undefined)).toBeNull();
  });

  it("returns null when repWeight is null", () => {
    expect(calcDiff(null, 10)).toBeNull();
  });
});

/* ---------------------------- getNextReport ---------------------------- */
describe("getNextReport", () => {
  const today = new Date("2026-04-20");

  it("returns the earliest future earnings date", () => {
    const c = {
      earningsEntries: [
        { reportDate: "2026-02-15" }, // past
        { reportDate: "2026-05-10" }, // future
        { reportDate: "2026-04-25" }, // closer future
      ],
    };
    const d = getNextReport(c, today);
    expect(d.toISOString().slice(0, 10)).toBe("2026-04-25");
  });

  it("returns null when no future entries", () => {
    const c = { earningsEntries: [{ reportDate: "2025-01-01" }] };
    expect(getNextReport(c, today)).toBeNull();
  });

  it("skips blank or invalid dates", () => {
    const c = {
      earningsEntries: [
        { reportDate: "" },
        { reportDate: "not-a-date" },
        { reportDate: "2026-05-01" },
      ],
    };
    const d = getNextReport(c, today);
    expect(d.toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("handles missing company / earnings list", () => {
    expect(getNextReport(null, today)).toBeNull();
    expect(getNextReport({}, today)).toBeNull();
  });
});

/* ----------------------------- getPerf5d ------------------------------- */
describe("getPerf5d", () => {
  it("reads perf5d from the ordinary ticker", () => {
    const c = {
      tickers: [
        { ticker: "ADR",  perf5d: "99",  isOrdinary: false },
        { ticker: "ORD",  perf5d: "1.5", isOrdinary: true  },
      ],
    };
    expect(getPerf5d(c)).toBe(1.5);
  });

  it("returns null when perf5d is #N/A or missing", () => {
    expect(getPerf5d({ tickers: [{ isOrdinary: true, perf5d: "#N/A" }] })).toBeNull();
    expect(getPerf5d({ tickers: [{ isOrdinary: true }] })).toBeNull();
    expect(getPerf5d({ tickers: [] })).toBeNull();
    expect(getPerf5d({})).toBeNull();
  });
});
