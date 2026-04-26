import { describe, it, expect } from "vitest";
import { parseEpsRevisionsPaste } from "./epsRevisionsParser.js";

/* Build a tab-delimited row: ticker, "", name, then 4 horizons of
 * (anchor + 13 monthly) numbers. */
function buildRow(ticker, name, horizons) {
  const parts = [ticker, "", name];
  horizons.forEach(function (h) {
    parts.push(String(h.anchor));
    h.monthly.forEach(function (v) { parts.push(String(v)); });
  });
  return parts.join("\t");
}

const HEADER = (function () {
  const cells = ["Ticker", "", "Company", "EPS"];
  /* 13 dates oldest first */
  ["4/24/25","5/24/25","6/24/25","7/24/25","8/24/25","9/24/25","10/24/25",
   "11/24/25","12/24/25","1/24/26","2/24/26","3/24/26","4/24/26"]
   .forEach(function (d) { cells.push(d); });
  /* Pad to keep indexing consistent through the rest of the row */
  cells.push("E[EPS] +1");
  for (let i = 0; i < 13; i++) cells.push("4/24/25"); /* same dates */
  cells.push("E[EPS] +2");
  for (let i = 0; i < 13; i++) cells.push("4/24/25");
  cells.push("E[EPS] +3");
  for (let i = 0; i < 13; i++) cells.push("4/24/25");
  return cells.join("\t");
})();

describe("parseEpsRevisionsPaste", function () {
  it("parses dates from E1:Q1", function () {
    const data = HEADER + "\n" + buildRow("SU-FR", "Schneider", [
      { anchor: 7.85, monthly: [7.6, 7.65, 7.7, 7.75, 7.8, 7.82, 7.83, 7.84, 7.85, 7.85, 7.85, 7.85, 7.85] },
      { anchor: 8.50, monthly: [8.0, 8.1, 8.15, 8.2, 8.25, 8.3, 8.35, 8.40, 8.42, 8.45, 8.48, 8.50, 8.50] },
      { anchor: 9.20, monthly: [8.8, 8.85, 8.9, 8.95, 9.0, 9.05, 9.10, 9.13, 9.15, 9.18, 9.20, 9.20, 9.20] },
      { anchor: 9.80, monthly: [9.5, 9.55, 9.6, 9.65, 9.7, 9.72, 9.75, 9.78, 9.78, 9.79, 9.80, 9.80, 9.80] },
    ]);
    const r = parseEpsRevisionsPaste(data);
    expect(r.error).toBeUndefined();
    expect(r.dates.length).toBe(13);
    expect(r.dates[0]).toBe("2025-04-24");
    expect(r.dates[12]).toBe("2026-04-24");
  });

  it("parses ticker, name, and four horizons of values", function () {
    const data = HEADER + "\n" + buildRow("SU-FR", "Schneider", [
      { anchor: 7.85, monthly: [7.6, 7.65, 7.7, 7.75, 7.8, 7.82, 7.83, 7.84, 7.85, 7.85, 7.85, 7.85, 7.85] },
      { anchor: 8.50, monthly: [8.0, 8.1, 8.15, 8.2, 8.25, 8.3, 8.35, 8.40, 8.42, 8.45, 8.48, 8.50, 8.50] },
      { anchor: 9.20, monthly: [8.8, 8.85, 8.9, 8.95, 9.0, 9.05, 9.10, 9.13, 9.15, 9.18, 9.20, 9.20, 9.20] },
      { anchor: 9.80, monthly: [9.5, 9.55, 9.6, 9.65, 9.7, 9.72, 9.75, 9.78, 9.78, 9.79, 9.80, 9.80, 9.80] },
    ]);
    const r = parseEpsRevisionsPaste(data);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].ticker).toBe("SU-FR");
    expect(r.rows[0].name).toBe("Schneider");
    expect(r.rows[0].series.length).toBe(4);
    expect(r.rows[0].series[0].label).toBe("EPS");
    expect(r.rows[0].series[0].anchor).toBeCloseTo(7.85, 2);
    expect(r.rows[0].series[0].monthly[12]).toBeCloseTo(7.85, 2);
    expect(r.rows[0].series[1].label).toBe("E[EPS] +1");
    expect(r.rows[0].series[1].monthly[0]).toBeCloseTo(8.0, 2);
    expect(r.rows[0].series[3].monthly[12]).toBeCloseTo(9.80, 2);
  });

  it("handles empty cells, error tokens, and currency prefixes", function () {
    /* Modified row with mixed bad cells */
    const cells = ["AB-FR", "", "Acme"];
    cells.push("£7.85"); /* currency prefix */
    for (let i = 0; i < 13; i++) cells.push(i < 3 ? "" : i === 5 ? "#N/A" : (7 + i * 0.05).toFixed(2));
    cells.push("8.50");
    for (let i = 0; i < 13; i++) cells.push((8 + i * 0.05).toFixed(2));
    cells.push("9.20");
    for (let i = 0; i < 13; i++) cells.push((9 + i * 0.05).toFixed(2));
    cells.push("9.80");
    for (let i = 0; i < 13; i++) cells.push((9.5 + i * 0.025).toFixed(2));
    const data = HEADER + "\n" + cells.join("\t");
    const r = parseEpsRevisionsPaste(data);
    expect(r.error).toBeUndefined();
    expect(r.rows[0].series[0].anchor).toBeCloseTo(7.85, 2);  /* currency stripped */
    expect(r.rows[0].series[0].monthly[0]).toBeNull();  /* empty */
    expect(r.rows[0].series[0].monthly[5]).toBeNull();  /* #N/A */
    expect(r.rows[0].series[0].monthly[12]).toBeCloseTo(7.6, 2);  /* still parses */
  });

  it("returns error when no date header is present", function () {
    const data = "Ticker\t\tCompany\tEPS\nSU-FR\t\tSchneider\t7.85";
    const r = parseEpsRevisionsPaste(data);
    expect(r.error).toBeDefined();
  });

  it("drops rows with no ticker or name", function () {
    const data = HEADER + "\n\t\t\t7.85\t" + Array(56).fill("0").join("\t");
    const r = parseEpsRevisionsPaste(data);
    expect(r.dropped).toBeGreaterThanOrEqual(1);
  });
});
