import { describe, it, expect } from "vitest";
import { parseRatioPaste } from "./ratioParser.js";

const SAMPLE = [
  "Schneider Electric SE",
  "Ratio Analysis\tDec-2016\tDec-2017\tDec-2018\tDec-2026\tDec-2027\tDec-2028",
  "\tFinal/\tFinal/\tFinal/\tEstimate\tEstimate\tEstimate",
  "Profitability",
  "Gross Margin\t38.59\t38.85\t39.28\t42.35\t42.02\t41.54",
  "SG&A to Sales\t25.05\t24.73\t25.05\t19.44\t18.61\t18.61",
  "Valuation",
  "Price/Sales\t1.53\t1.62\t1.30\t3.67\t3.38\t3.12",
  "Price/Tangible Book Value\t-19.67\t-41.11\t-13.31\t#N/A\t#N/A\t#N/A",
  "Per Share",
  "EPS (recurring)\t3.58\t4.31\t4.55\t#NUM!\t \t ",
].join("\n");

describe("parseRatioPaste", function () {
  it("parses years, estimate flags, and sections from the sample", function () {
    const r = parseRatioPaste(SAMPLE);
    expect(r.error).toBeUndefined();
    expect(r.years).toEqual([2016, 2017, 2018, 2026, 2027, 2028]);
    expect(r.estimate).toEqual([false, false, false, true, true, true]);
    /* Three sections, Uncategorized dropped */
    expect(r.sections.map(function (s) { return s.name; })).toEqual([
      "Profitability", "Valuation", "Per Share",
    ]);
  });

  it("populates ratio values including negatives", function () {
    const r = parseRatioPaste(SAMPLE);
    expect(r.values["Gross Margin"]).toEqual([38.59, 38.85, 39.28, 42.35, 42.02, 41.54]);
    expect(r.values["Price/Tangible Book Value"].slice(0, 3)).toEqual([-19.67, -41.11, -13.31]);
  });

  it("coerces Excel error tokens and blanks to null", function () {
    const r = parseRatioPaste(SAMPLE);
    const ptb = r.values["Price/Tangible Book Value"];
    expect(ptb.slice(3)).toEqual([null, null, null]);
    const eps = r.values["EPS (recurring)"];
    expect(eps[3]).toBeNull(); /* #NUM! */
    expect(eps[4]).toBeNull(); /* empty */
  });

  it("handles parenthesized negatives and comma thousands", function () {
    const text = [
      "Ratio Analysis\tDec-2020\tDec-2021\tDec-2022",
      "\tFinal/\tFinal/\tFinal/",
      "Revenue\t1,234.56\t(987.65)\t2,345.00",
    ].join("\n");
    const r = parseRatioPaste(text);
    expect(r.values["Revenue"]).toEqual([1234.56, -987.65, 2345.00]);
  });

  it("supports whitespace-separated cells (copy from web)", function () {
    const text = [
      "Ratio Analysis  Dec-2020  Dec-2021  Dec-2022",
      "                Final/    Final/    Estimate",
      "Profitability",
      "Gross Margin    38.59     39.28     42.02",
    ].join("\n");
    const r = parseRatioPaste(text);
    expect(r.years).toEqual([2020, 2021, 2022]);
    expect(r.estimate).toEqual([false, false, true]);
    expect(r.values["Gross Margin"]).toEqual([38.59, 39.28, 42.02]);
  });

  it("preserves ratio names containing slashes and spaces", function () {
    const r = parseRatioPaste(SAMPLE);
    expect(r.ratioNames).toContain("Price/Tangible Book Value");
    expect(r.ratioNames).toContain("SG&A to Sales");
  });

  it("returns an error when no year header is present", function () {
    const r = parseRatioPaste("some random text\nno dates anywhere");
    expect(r.error).toBeDefined();
  });

  it("returns the company name from the line above the year header", function () {
    const r = parseRatioPaste(SAMPLE);
    expect(r.companyName).toBe("Schneider Electric SE");
  });

  it("parses ISO yyyy-mm-dd date headers", function () {
    const text = [
      "Acme Corp",
      "Ratio Analysis\t2020-12-31\t2021-12-31\t2022-12-31",
      "\tFinal/\tFinal/\tEstimate",
      "Profitability",
      "Gross Margin\t40.0\t41.0\t42.0",
    ].join("\n");
    const r = parseRatioPaste(text);
    expect(r.companyName).toBe("Acme Corp");
    expect(r.years).toEqual([2020, 2021, 2022]);
    expect(r.estimate).toEqual([false, false, true]);
    expect(r.values["Gross Margin"]).toEqual([40.0, 41.0, 42.0]);
  });

  it("parses US m/d/yyyy date headers", function () {
    const text = [
      "Ratio Analysis\t12/31/2020\t12/31/2021\t12/31/2022",
      "\tFinal/\tFinal/\tEstimate",
      "Gross Margin\t40.0\t41.0\t42.0",
    ].join("\n");
    const r = parseRatioPaste(text);
    expect(r.years).toEqual([2020, 2021, 2022]);
  });

  it("parses financials-style -NFY / +NFY metadata row", function () {
    const text = [
      "Acme Corp",
      "\t12/31/2020\t12/31/2021\t12/31/2022\t12/31/2023",
      "\t-3FY\t-2FY\t-1FY\t+1FY",
      "Income Statement",
      "Sales\t1000\t1100\t1200\t1300",
    ].join("\n");
    const r = parseRatioPaste(text);
    expect(r.error).toBeUndefined();
    expect(r.years).toEqual([2020, 2021, 2022, 2023]);
    expect(r.estimate).toEqual([false, false, false, true]);
    expect(r.values["Sales"]).toEqual([1000, 1100, 1200, 1300]);
  });

  it("recognizes -0FY as current-year historical (not estimate)", function () {
    const text = [
      "\t12/31/2024\t12/31/2025\t12/31/2026",
      "\t-1FY\t-0FY\t+1FY",
      "Sales\t1000\t1100\t1200",
    ].join("\n");
    const r = parseRatioPaste(text);
    expect(r.estimate).toEqual([false, false, true]);
  });

  it("skips a 'Ratio Analysis' label row when looking for the company name", function () {
    const text = [
      "",
      "Ratio Analysis",
      "Acme Corp",
      "Ratio Analysis\tDec-2020\tDec-2021\tDec-2022",
      "\tFinal/\tFinal/\tEstimate",
      "Gross Margin\t40.0\t41.0\t42.0",
    ].join("\n");
    const r = parseRatioPaste(text);
    expect(r.companyName).toBe("Acme Corp");
  });

  it("treats a name-only row as a section header", function () {
    const r = parseRatioPaste(SAMPLE);
    expect(r.sections[0].items.length).toBe(2); /* Profitability: Gross Margin + SG&A */
    expect(r.sections[1].items.length).toBe(2); /* Valuation: P/S + PTBV */
    expect(r.sections[2].items.length).toBe(1); /* Per Share: EPS */
  });
});
