import { describe, it, expect } from "vitest";
import {
  isBlankLine,
  splitRow,
  nonBlankLines,
  skipHeaderRow,
  matchCompany,
} from "./uploadHelpers.js";

describe("isBlankLine", () => {
  it("treats empty + whitespace-only as blank", () => {
    expect(isBlankLine("")).toBe(true);
    expect(isBlankLine("   ")).toBe(true);
    expect(isBlankLine("\t\t")).toBe(true);
  });
  it("treats comma-only / delimiter-only as blank", () => {
    expect(isBlankLine(",,,,,")).toBe(true);
    expect(isBlankLine(",, , ,,")).toBe(true);
  });
  it("treats lines with content as non-blank", () => {
    expect(isBlankLine("a")).toBe(false);
    expect(isBlankLine("a,b,c")).toBe(false);
    expect(isBlankLine("0,,,,,")).toBe(false);
  });
});

describe("splitRow", () => {
  it("auto-detects tab vs comma", () => {
    expect(splitRow("a\tb\tc")).toEqual(["a", "b", "c"]);
    expect(splitRow("a,b,c")).toEqual(["a", "b", "c"]);
  });
  it("strips wrapping quotes; preserves inner spaces", () => {
    expect(splitRow('"a","b"," c "')).toEqual(["a", "b", " c "]);
  });
  it("respects an explicit delim arg", () => {
    expect(splitRow("a|b|c", "|")).toEqual(["a", "b", "c"]);
  });
});

describe("nonBlankLines", () => {
  it("strips CR, drops blank lines", () => {
    const text = "a\r\n\r\nb\nc\n  \nd";
    expect(nonBlankLines(text)).toEqual(["a", "b", "c", "d"]);
  });
  it("returns [] for empty/null/undefined", () => {
    expect(nonBlankLines("")).toEqual([]);
    expect(nonBlankLines(null)).toEqual([]);
    expect(nonBlankLines(undefined)).toEqual([]);
  });
});

describe("skipHeaderRow", () => {
  it("removes a matching header row", () => {
    const r = skipHeaderRow(
      ["Section,Label,Ticker", "Indices,ACWI,ACWI-US"],
      ["section", "name", "label"]
    );
    expect(r).toEqual(["Indices,ACWI,ACWI-US"]);
  });
  it("leaves data rows untouched when no header match", () => {
    const r = skipHeaderRow(
      ["Indices,ACWI,ACWI-US"],
      ["section", "name", "label"]
    );
    expect(r).toEqual(["Indices,ACWI,ACWI-US"]);
  });
  it("matches case-insensitively", () => {
    const r = skipHeaderRow(["COMPANY,Ticker,Price"], ["company"]);
    expect(r).toEqual([]);
  });
});

describe("matchCompany", () => {
  const companies = [
    { name: "Shell Plc", tickers: [{ ticker: "SHEL-GB" }, { ticker: "SHEL" }] },
    { name: "Apple Inc", tickers: [{ ticker: "AAPL" }] },
    { name: "Toyota Motor Corp", tickers: [{ ticker: "7203-JP" }] },
  ];

  it("matches by company name (case-insensitive)", () => {
    expect(matchCompany(companies, ["shell plc"]).name).toBe("Shell Plc");
    expect(matchCompany(companies, ["APPLE INC"]).name).toBe("Apple Inc");
  });

  it("falls back to ticker match when tickerCol is given", () => {
    /* parts[0] is some random name, parts[1] is the ticker we know */
    const r = matchCompany(companies, ["whatever", "AAPL"], { tickerCol: 1 });
    expect(r.name).toBe("Apple Inc");
  });

  it("returns null when nothing matches", () => {
    expect(matchCompany(companies, ["unknown"])).toBeNull();
    expect(matchCompany(companies, ["unknown", "XYZ"], { tickerCol: 1 })).toBeNull();
  });

  it("ignores blank cells", () => {
    expect(matchCompany(companies, ["", ""], { tickerCol: 1 })).toBeNull();
  });
});
