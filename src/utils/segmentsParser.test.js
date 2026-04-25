import { describe, it, expect } from "vitest";
import { parseSegmentsPaste } from "./segmentsParser.js";

const SAMPLE = [
  "Schneider Electric SE",
  "\tFY 2015\tFY 2016\tFY 2017\tFY 2018",
  "\t12/31/2015\t12/31/2016\t12/31/2017\t12/31/2018",
  "Energy Management",
  "Sales\t\t\t\t19,520",
  "EBIT\t\t\t\t4,103",
  "Margin\t\t\t\t21.0%",
  "ROA",
  "Industrial Automation",
  "Sales\t5,696\t5,485\t5,816\t6,200",
  "EBIT\t1,081\t1,015\t1,151\t1,319",
  "Margin\t19.0%\t18.5%\t19.8%\t21.3%",
  "ROA",
  "Central Functions & Digital Costs",
  "Sales",
  "EBIT\t(670.9)\t(683.6)\t(734.3)\t(853.0)",
  "Margin",
  "ROA",
  "Total",
  "Sales\t26,640\t24,459\t24,743\t25,720",
  "EBIT\t3,317\t3,312\t3,493\t3,662",
  "Margin\t12.5%\t13.5%\t14.1%\t14.2%",
  "ROA\t3.4\t4.2\t5.5\t5.7",
  "Revenue by Geography",
  "Revenue\t26,640\t24,459\t24,743\t25,720",
  "France\t6.4%\t6.8%\t6.7%\t6.4%",
  "United States\t22.8%\t23.5%\t23.2%\t23.7%",
  "Asia Pacific\t14.6%\t14.6%\t14.6%\t14.3%",
].join("\n");

describe("parseSegmentsPaste", function () {
  it("extracts company name and years", function () {
    const r = parseSegmentsPaste(SAMPLE);
    expect(r.error).toBeUndefined();
    expect(r.companyName).toBe("Schneider Electric SE");
    expect(r.years).toEqual([2015, 2016, 2017, 2018]);
  });

  it("parses operating segments with Sales/EBIT/Margin", function () {
    const r = parseSegmentsPaste(SAMPLE);
    const ia = r.segments.find(function (s) { return s.name === "Industrial Automation"; });
    expect(ia).toBeDefined();
    expect(ia.sales).toEqual([5696, 5485, 5816, 6200]);
    expect(ia.ebit).toEqual([1081, 1015, 1151, 1319]);
    expect(ia.margin[0]).toBeCloseTo(0.19, 3);  /* 19% → 0.19 */
    expect(ia.isCostCenter).toBe(false);
  });

  it("flags cost centers (no Sales, only EBIT)", function () {
    const r = parseSegmentsPaste(SAMPLE);
    const cc = r.segments.find(function (s) { return /Central Functions/.test(s.name); });
    expect(cc).toBeDefined();
    expect(cc.isCostCenter).toBe(true);
    expect(cc.ebit).toEqual([-670.9, -683.6, -734.3, -853]);
    expect(cc.sales.every(function (v) { return v === null; })).toBe(true);
  });

  it("handles segments with partial history (started later)", function () {
    const r = parseSegmentsPaste(SAMPLE);
    const em = r.segments.find(function (s) { return s.name === "Energy Management"; });
    expect(em).toBeDefined();
    /* First three years are null (no values), 4th has data */
    expect(em.sales).toEqual([null, null, null, 19520]);
    expect(em.margin[3]).toBeCloseTo(0.21, 3);
  });

  it("excludes the parsed Total row from segments", function () {
    const r = parseSegmentsPaste(SAMPLE);
    expect(r.segments.find(function (s) { return s.isTotal; })).toBeUndefined();
    /* But surfaces it for sanity-checking */
    expect(r.parsedTotal).not.toBeNull();
    expect(r.parsedTotal.sales).toEqual([26640, 24459, 24743, 25720]);
  });

  it("parses geography section with regions sorted in paste order", function () {
    const r = parseSegmentsPaste(SAMPLE);
    expect(r.geography.revenue).toEqual([26640, 24459, 24743, 25720]);
    expect(r.geography.regions.map(function (g) { return g.name; }))
      .toEqual(["France", "United States", "Asia Pacific"]);
    expect(r.geography.regions[0].values[0]).toBeCloseTo(0.064, 4);
    expect(r.geography.regions[1].values[0]).toBeCloseTo(0.228, 4);
  });

  it("normalizes margins with % suffix to decimal", function () {
    const r = parseSegmentsPaste(SAMPLE);
    const ia = r.segments.find(function (s) { return s.name === "Industrial Automation"; });
    /* 21.3% → 0.213, never 21.3 */
    expect(ia.margin[3]).toBeCloseTo(0.213, 3);
    expect(Math.abs(ia.margin[3]) <= 1).toBe(true);
  });

  it("normalizes raw-percent margins (no % sign) when any value > 1.5", function () {
    const text = [
      "Acme",
      "\t2020\t2021\t2022",
      "Segment A",
      "Sales\t100\t110\t120",
      "EBIT\t10\t11\t12",
      "Margin\t10.0\t10.0\t10.0",  /* no % sign */
      "ROA",
    ].join("\n");
    const r = parseSegmentsPaste(text);
    const seg = r.segments[0];
    expect(seg.margin).toEqual([0.1, 0.1, 0.1]);  /* 10.0 → 0.10 */
  });

  it("handles parenthesized negatives", function () {
    const r = parseSegmentsPaste(SAMPLE);
    const cc = r.segments.find(function (s) { return /Central Functions/.test(s.name); });
    expect(cc.ebit[0]).toBe(-670.9);
  });

  it('handles "Revenue / by Geography" split across two rows', function () {
    /* FactSet template puts "Revenue" on one row and "by Geography" on
       the next, both with empty value cells. Should switch to geo mode
       without treating either as a segment. */
    const text = [
      "Acme Corp",
      "\tFY 2020\tFY 2021\tFY 2022",
      "Segment A",
      "Sales\t100\t110\t120",
      "EBIT\t10\t11\t12",
      "Margin\t10.0%\t10.0%\t10.0%",
      "ROA",
      "Total",
      "Sales\t100\t110\t120",
      "EBIT\t10\t11\t12",
      "Revenue",
      "by Geography",
      "Revenue\t100\t110\t120",
      "France\t60.0%\t62.0%\t64.0%",
      "Germany\t40.0%\t38.0%\t36.0%",
    ].join("\n");
    const r = parseSegmentsPaste(text);
    expect(r.error).toBeUndefined();
    /* Only one operating segment, no spurious "by Geography" */
    expect(r.segments.map(function (s) { return s.name; })).toEqual(["Segment A"]);
    expect(r.geography.regions.map(function (g) { return g.name; })).toEqual(["France", "Germany"]);
    expect(r.geography.revenue).toEqual([100, 110, 120]);
  });

  it("returns an error when no year header is present", function () {
    const r = parseSegmentsPaste("just a company name\nand some text");
    expect(r.error).toBeDefined();
  });
});
