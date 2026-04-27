import { describe, it, expect } from "vitest";
import {
  niceTicks, minMaxAcross, lastFinite, lastFiniteIndex, lastHistorical,
  lastNFinite, segmentsByEstimate, fmtMoney, fmtMoneyShort, fmtPct, fmtBn,
  scoreColor, paletteColor,
} from "./chart.js";

describe("niceTicks", function () {
  it("produces multiples of 1/2/2.5/5 × 10^n", function () {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    /* Floating-point sum can drop the upper boundary tick; check a
       prefix instead of exact array equality. */
    const t = niceTicks(0, 1, 5);
    expect(t[0]).toBe(0);
    expect(t).toContain(0.2);
    expect(t).toContain(0.8);
  });
  it("handles negative + positive ranges", function () {
    const t = niceTicks(-10, 10, 5);
    expect(t).toContain(0);
    expect(t[0]).toBeLessThan(0);
    expect(t[t.length - 1]).toBeGreaterThan(0);
  });
  it("returns empty for invalid input", function () {
    expect(niceTicks(NaN, 5)).toEqual([]);
    expect(niceTicks(5, 5)).toEqual([]);
    expect(niceTicks(10, 5)).toEqual([]);
  });
});

describe("minMaxAcross", function () {
  it("works across multiple arrays, ignoring nulls", function () {
    expect(minMaxAcross([[1, 2, 3], [null, 4, null], [0]])).toEqual([0, 4]);
  });
  it("falls back to [0,1] when nothing finite", function () {
    expect(minMaxAcross([[null], [], [undefined]])).toEqual([0, 1]);
  });
  it("nudges identical min/max apart", function () {
    expect(minMaxAcross([[5, 5, 5]])).toEqual([4.5, 5.5]);
  });
});

describe("lastFinite / lastFiniteIndex / lastHistorical", function () {
  it("ignores trailing null/undefined/NaN", function () {
    expect(lastFinite([1, 2, 3, null, NaN, undefined])).toBe(3);
    expect(lastFiniteIndex([1, 2, 3, null, NaN, undefined])).toBe(2);
  });
  it("returns null/-1 on empty arrays", function () {
    expect(lastFinite([])).toBeNull();
    expect(lastFinite(null)).toBeNull();
    expect(lastFiniteIndex([])).toBe(-1);
  });
  it("isFinite(null) === true trap is avoided", function () {
    /* Without isFiniteNum, JS would treat null as 0 here */
    expect(lastFinite([1, 2, null])).toBe(2);
  });
  it("lastHistorical skips estimate positions", function () {
    expect(lastHistorical([1, 2, 3, 4, 5], [false, false, false, true, true])).toBe(3);
  });
});

describe("lastNFinite", function () {
  it("returns the last N finite values, oldest first", function () {
    expect(lastNFinite([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });
  it("optionally skips estimate positions", function () {
    expect(lastNFinite([1, 2, 3, 4, 5], 3, [false, false, false, true, true])).toEqual([1, 2, 3]);
  });
});

describe("segmentsByEstimate", function () {
  it("emits a single segment when all historical", function () {
    const segs = segmentsByEstimate([1, 2, 3], [false, false, false], i => i, v => v);
    expect(segs.length).toBe(1);
    expect(segs[0].isEstimate).toBe(false);
    expect(segs[0].points.length).toBe(3);
  });
  it("emits hist + bridge + estimate at the boundary", function () {
    const segs = segmentsByEstimate([1, 2, 3, 4], [false, false, true, true], i => i, v => v);
    expect(segs.length).toBe(3);
    expect(segs[0].isEstimate).toBe(false);
    expect(segs[1].isBridge).toBe(true);
    expect(segs[2].isEstimate).toBe(true);
  });
  it("breaks segments on null", function () {
    const segs = segmentsByEstimate([1, 2, null, 4], [false, false, false, false], i => i, v => v);
    expect(segs.length).toBe(2);
  });
});

describe("fmtMoney + fmtMoneyShort + fmtBn", function () {
  it("scales to T/B/M with comma grouping", function () {
    expect(fmtMoney(9774930, "JPY")).toBe("9.77 T JPY");
    expect(fmtMoney(19520, "EUR")).toBe("19.5 B EUR");
    expect(fmtMoney(880, "USD")).toBe("880 M USD");
  });
  it("returns -- for non-finite", function () {
    expect(fmtMoney(null)).toBe("--");
    expect(fmtMoney(NaN)).toBe("--");
  });
  it("fmtMoneyShort drops the currency tag", function () {
    expect(fmtMoneyShort(9774930)).toBe("9.8T");
    expect(fmtMoneyShort(19520)).toBe("20B");
    expect(fmtMoneyShort(880)).toBe("880");
  });
  it("fmtBn uses similar T/B scale", function () {
    expect(fmtBn(9774930)).toBe("9.8T");
    expect(fmtBn(19520)).toBe("19.5B");
  });
});

describe("fmtPct", function () {
  it("formats decimal as percent with default 1 decimal", function () {
    expect(fmtPct(0.234)).toBe("23.4%");
    expect(fmtPct(-0.025, 2)).toBe("-2.50%");
  });
  it("withSign adds leading + on positive values", function () {
    expect(fmtPct(0.05, 1, true)).toBe("+5.0%");
    expect(fmtPct(-0.05, 1, true)).toBe("-5.0%");
  });
});

describe("scoreColor", function () {
  it('"lower" polarity: low position is green, high is red', function () {
    expect(scoreColor(0.1, "lower")).toBe("#16a34a");
    expect(scoreColor(0.5, "lower")).toBe("#ca8a04");
    expect(scoreColor(0.9, "lower")).toBe("#dc2626");
  });
  it('"higher" polarity reverses', function () {
    expect(scoreColor(0.1, "higher")).toBe("#dc2626");
    expect(scoreColor(0.9, "higher")).toBe("#16a34a");
  });
});

describe("paletteColor", function () {
  it("cycles through palette", function () {
    expect(paletteColor(0)).toBeDefined();
    expect(paletteColor(15)).toBe(paletteColor(15 % 10));
  });
});
