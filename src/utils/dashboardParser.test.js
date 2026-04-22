import { describe, it, expect } from "vitest";
import {
  parseDashboardUpload,
  parseFxMatrixBlock,
  splitRow,
} from "./dashboardParser.js";

/* -------------------------- splitRow --------------------------- */

describe("splitRow", () => {
  it("detects tab-separated first", () => {
    expect(splitRow("a\tb\tc")).toEqual(["a", "b", "c"]);
  });

  it("falls back to comma when no tabs", () => {
    expect(splitRow("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace + strips wrapping quotes", () => {
    expect(splitRow('"a",  b ," c "')).toEqual(["a", "b", "c"]);
  });
});

/* ----------------------- parseDashboardUpload ----------------------- */

describe("parseDashboardUpload — flat rows", () => {
  it("parses basic section rows into their buckets", () => {
    const text = [
      "Indices,MSCI ACWI,ACWI-US,0.1,0.8,2.3,5.5,8.7,15.2,23.4",
      "Sectors,Info Tech,IXN-US,0.2,1.5,3.1,7.0,11.0,21.5,35.0",
      "Countries,United States,PBUS-US,0.14,0.88,2.35,5.25,9.10,16.20,26.40",
      "Commodities,Gold,IAU-US,0.35,2.15,4.80,9.50,15.20,22.85,32.40",
      "Bonds,Agg Bond,AGG-US,0.05,0.25,0.85,1.95,3.50,5.20,-2.40",
    ].join("\n");

    const r = parseDashboardUpload(text);
    expect(r.bySection.indices).toHaveLength(1);
    expect(r.bySection.sectors).toHaveLength(1);
    expect(r.bySection.countries).toHaveLength(1);
    expect(r.bySection.commodities).toHaveLength(1);
    expect(r.bySection.bonds).toHaveLength(1);
    expect(r.bySection.indices[0]).toMatchObject({
      label: "MSCI ACWI",
      ticker: "ACWI-US",
    });
    /* Percent-form values stored as decimal */
    expect(r.bySection.indices[0]["1D"]).toBe(0.001);
    expect(r.bySection.indices[0]["3Y"]).toBe(0.234);
    expect(r.bySection.bonds[0]["3Y"]).toBe(-0.024);
  });

  it("auto-skips a header row", () => {
    const text = [
      "Section,Label,Ticker,1D,5D,MTD,QTD,YTD,1Y,3Y",
      "Indices,MSCI ACWI,ACWI-US,0.1,0.8,2.3,5.5,8.7,15.2,23.4",
    ].join("\n");
    const r = parseDashboardUpload(text);
    expect(r.headerSkipped).toBe(true);
    expect(r.bySection.indices).toHaveLength(1);
    expect(r.dropped).toBe(0);
  });

  it("counts dropped rows with bad section / too few cols", () => {
    const text = [
      "Unknown,Foo,Bar,0.1,0.2,0.3,0.4,0.5,0.6,0.7",
      "Indices,Two cols only",
      "Indices,ACWI,ACWI-US,0.1,0.2,0.3,0.4,0.5,0.6,0.7",
    ].join("\n");
    const r = parseDashboardUpload(text);
    expect(r.bySection.indices).toHaveLength(1);
    expect(r.dropped).toBe(2);
  });

  it("case-insensitive section names + tab delimiter", () => {
    const text = [
      "INDICES\tACWI\tACWI-US\t0.1\t0.2\t0.3\t0.4\t0.5\t0.6\t0.7",
      "sectors\tIT\tIXN-US\t0.2\t0.3\t0.4\t0.5\t0.6\t0.7\t0.8",
    ].join("\n");
    const r = parseDashboardUpload(text);
    expect(r.bySection.indices).toHaveLength(1);
    expect(r.bySection.sectors).toHaveLength(1);
  });

  it("percent division is unconditional — fixes the >1.5 heuristic bug", () => {
    /* Small percents (0.5%, 1.2%) used to stay un-divided and render at
     * 50%/120%. pctToDecimal must always divide by 100. */
    const text = "Indices,Test,TEST,0.5,1.2,0.05,0.01,0.7,1.5,0.8";
    const r = parseDashboardUpload(text);
    const row = r.bySection.indices[0];
    expect(row["1D"]).toBe(0.005);
    expect(row["5D"]).toBeCloseTo(0.012, 5);
    expect(row["MTD"]).toBeCloseTo(0.0005, 5);
    expect(row["YTD"]).toBeCloseTo(0.007, 5);
    expect(row["1Y"]).toBeCloseTo(0.015, 5);
  });
});

/* -------------------------- FX matrix --------------------------- */

describe("parseFxMatrixBlock", () => {
  it("parses a 5x5 block with leading '>' marker (xlsx format)", () => {
    const lines = [
      "FX - 3M %,,,,,",
      ",,,,,",
      ">,USD,EUR,GBP,JPY,CAD",
      "USD,-0.45,-0.82,-1.15,2.45,0.62",
      "EUR,0.82,,-0.33,3.29,1.45",
      "GBP,1.15,0.33,,3.62,1.77",
      "JPY,-2.45,-3.29,-3.62,,-1.84",
      "CAD,-0.62,-1.45,-1.77,1.84,",
    ];
    const r = parseFxMatrixBlock(lines, 0);
    expect(r.block).not.toBeNull();
    expect(r.block.cols).toEqual(["USD", "EUR", "GBP", "JPY", "CAD"]);
    expect(r.block.rows).toHaveLength(5);
    /* USD row: DXY in col 0 */
    expect(r.block.rows[0].label).toBe("USD");
    expect(r.block.rows[0].values[0]).toBe(-0.0045);
    /* EUR row: diagonal blank */
    expect(r.block.rows[1].label).toBe("EUR");
    expect(r.block.rows[1].values[1]).toBeNull();
    /* CAD row: last value blank (diagonal) */
    expect(r.block.rows[4].values[4]).toBeNull();
  });

  it("parses a matrix with no '>' marker (col A is blank)", () => {
    const lines = [
      "FX - 3M %",
      ",USD,EUR,GBP,JPY,CAD",
      "USD,-0.45,-0.82,-1.15,2.45,0.62",
      "EUR,0.82,,-0.33,3.29,1.45",
    ];
    const r = parseFxMatrixBlock(lines, 0);
    expect(r.block.cols).toEqual(["USD", "EUR", "GBP", "JPY", "CAD"]);
    expect(r.block.rows).toHaveLength(2);
  });

  it("stops at blank line", () => {
    const lines = [
      "FX - 3M %",
      ">,USD,EUR",
      "USD,-0.45,-0.82",
      "EUR,0.82,",
      "",
      "something-else,1,2",
    ];
    const r = parseFxMatrixBlock(lines, 0);
    expect(r.block.rows).toHaveLength(2);
    expect(r.endIdx).toBe(4); /* index of the blank line */
  });

  it("stops at another FX block header", () => {
    const lines = [
      "FX - 3M %",
      ">,USD,EUR",
      "USD,-0.45,-0.82",
      "FX - 12M %",
      ">,USD,EUR",
      "USD,-1.85,-3.15",
    ];
    const r = parseFxMatrixBlock(lines, 0);
    expect(r.block.rows).toHaveLength(1);
    expect(lines[r.endIdx]).toBe("FX - 12M %");
  });

  it("stops at a flat section row", () => {
    const lines = [
      "FX - 3M %",
      ">,USD,EUR",
      "USD,-0.45,-0.82",
      "Indices,ACWI,ACWI-US,0.1,0.2,0.3,0.4,0.5,0.6,0.7",
    ];
    const r = parseFxMatrixBlock(lines, 0);
    expect(r.block.rows).toHaveLength(1);
  });
});

describe("parseDashboardUpload — mixed content", () => {
  it("handles flat rows + 3M matrix + 12M matrix in one paste", () => {
    const text = [
      "Indices,MSCI ACWI,ACWI-US,0.1,0.8,2.3,5.5,8.7,15.2,23.4",
      "Bonds,Agg Bond,AGG-US,0.05,0.25,0.85,1.95,3.50,5.20,-2.40",
      "FX - 3M %",
      ">,USD,EUR,GBP,JPY,CAD",
      "USD,-0.45,-0.82,-1.15,2.45,0.62",
      "EUR,0.82,,-0.33,3.29,1.45",
      "GBP,1.15,0.33,,3.62,1.77",
      "JPY,-2.45,-3.29,-3.62,,-1.84",
      "CAD,-0.62,-1.45,-1.77,1.84,",
      "FX - 12M %",
      ">,USD,EUR,GBP,JPY,CAD",
      "USD,-1.85,-3.15,-4.28,8.40,2.05",
      "EUR,3.15,,-1.12,11.55,5.15",
      "GBP,4.28,1.12,,12.68,6.30",
      "JPY,-8.40,-11.55,-12.68,,-6.35",
      "CAD,-2.05,-5.15,-6.30,6.35,",
    ].join("\n");

    const r = parseDashboardUpload(text);
    expect(r.bySection.indices).toHaveLength(1);
    expect(r.bySection.bonds).toHaveLength(1);
    expect(Object.keys(r.fxMatrices).sort()).toEqual(["12M", "3M"]);
    expect(r.fxMatrices["3M"].rows).toHaveLength(5);
    expect(r.fxMatrices["12M"].rows).toHaveLength(5);
    /* DXY for 3M */
    expect(r.fxMatrices["3M"].rows[0].values[0]).toBe(-0.0045);
    /* DXY for 12M */
    expect(r.fxMatrices["12M"].rows[0].values[0]).toBe(-0.0185);
  });

  it("blank lines between sections don't break parsing", () => {
    const text = [
      "Indices,ACWI,ACWI-US,0.1,0.2,0.3,0.4,0.5,0.6,0.7",
      "",
      "",
      "Sectors,IT,IXN-US,0.2,0.3,0.4,0.5,0.6,0.7,0.8",
    ].join("\n");
    const r = parseDashboardUpload(text);
    expect(r.bySection.indices).toHaveLength(1);
    expect(r.bySection.sectors).toHaveLength(1);
  });

  it("FX matcher flexibility — different spacings all work", () => {
    const cases = ["FX - 3M %", "FX-3M", "FX 3M", "fx  -  3m"];
    cases.forEach(function (hdr) {
      const text = [hdr, ">,USD,EUR", "USD,-0.45,-0.82"].join("\n");
      const r = parseDashboardUpload(text);
      expect(r.fxMatrices["3M"], "failed for header: " + hdr).toBeDefined();
    });
  });
});
