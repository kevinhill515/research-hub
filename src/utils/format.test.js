import { describe, it, expect } from "vitest";
import { numOrNull, pctToDecimal, fmtPct, fmtDelta } from "./format.js";

describe("numOrNull", () => {
  it("parses normal numbers", () => {
    expect(numOrNull("3.2")).toBe(3.2);
    expect(numOrNull("0")).toBe(0);
    expect(numOrNull("-1.5")).toBe(-1.5);
    expect(numOrNull(42)).toBe(42);
  });

  it("returns null for blank/invalid input", () => {
    expect(numOrNull("")).toBeNull();
    expect(numOrNull("   ")).toBeNull();
    expect(numOrNull(null)).toBeNull();
    expect(numOrNull(undefined)).toBeNull();
    expect(numOrNull("not a number")).toBeNull();
    expect(numOrNull("#N/A")).toBeNull();
  });

  it("rejects Excel COM error codes", () => {
    /* Excel's #NAME? = -2146826259 etc. should never leak through */
    expect(numOrNull(-2146826259)).toBeNull();
    expect(numOrNull(-2146826246)).toBeNull();
  });
});

describe("pctToDecimal", () => {
  it("divides by 100 — no magnitude heuristic", () => {
    expect(pctToDecimal("3.2")).toBe(0.032);
    expect(pctToDecimal("100")).toBe(1);
    /* The bug that prompted this util: small percents were left undivided */
    expect(pctToDecimal("0.5")).toBe(0.005);
    expect(pctToDecimal("1.2")).toBeCloseTo(0.012, 5);
  });

  it("handles signed values", () => {
    expect(pctToDecimal("-3.2")).toBe(-0.032);
    expect(pctToDecimal("-0.5")).toBe(-0.005);
  });

  it("returns null for blank / invalid", () => {
    expect(pctToDecimal("")).toBeNull();
    expect(pctToDecimal(null)).toBeNull();
    expect(pctToDecimal("garbage")).toBeNull();
  });
});

describe("fmtPct", () => {
  it("formats a decimal as percent with default 1 dp", () => {
    expect(fmtPct(0.032)).toBe("3.2%");
    expect(fmtPct(0.1234)).toBe("12.3%");
    expect(fmtPct(-0.055)).toBe("-5.5%");
  });

  it("honors decimal places", () => {
    expect(fmtPct(0.0321, 2)).toBe("3.21%");
    expect(fmtPct(0.0321, 0)).toBe("3%");
  });

  it("adds + sign when requested", () => {
    expect(fmtPct(0.032, 1, true)).toBe("+3.2%");
    expect(fmtPct(-0.032, 1, true)).toBe("-3.2%");
    expect(fmtPct(0, 1, true)).toBe("+0.0%");
  });

  it("renders -- on null/undefined/NaN", () => {
    expect(fmtPct(null)).toBe("--");
    expect(fmtPct(undefined)).toBe("--");
    expect(fmtPct(NaN)).toBe("--");
  });
});

describe("fmtDelta", () => {
  it("always signs and returns empty string on null", () => {
    expect(fmtDelta(0.015)).toBe("+1.5%");
    expect(fmtDelta(-0.015)).toBe("-1.5%");
    expect(fmtDelta(null)).toBe("");
  });
});
