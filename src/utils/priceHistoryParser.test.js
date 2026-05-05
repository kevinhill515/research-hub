import { describe, it, expect } from "vitest";
import { parsePriceHistory, mergePriceSeries } from "./priceHistoryParser.js";

describe("parsePriceHistory", function () {
  it("parses a basic wide-format paste with two tickers", function () {
    const text = [
      "Date\tANCTF\tATD-CA",
      "2020-01-02\t35.40\t46.20",
      "2020-01-03\t35.65\t46.31",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.tickers).toBe(2);
    expect(r.dates).toBe(2);
    expect(r.byTicker.ANCTF).toEqual([
      { d: "2020-01-02", p: 35.4 },
      { d: "2020-01-03", p: 35.65 },
    ]);
    expect(r.byTicker["ATD-CA"]).toEqual([
      { d: "2020-01-02", p: 46.2 },
      { d: "2020-01-03", p: 46.31 },
    ]);
  });

  it("normalizes US-style dates to ISO", function () {
    const text = [
      "Date,ANCTF",
      "1/2/2020,35.40",
      "12/31/2020,55.10",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.byTicker.ANCTF).toEqual([
      { d: "2020-01-02", p: 35.4 },
      { d: "2020-12-31", p: 55.1 },
    ]);
  });

  it("skips missing-data sentinels but keeps the row for other tickers", function () {
    const text = [
      "Date\tA\tB\tC",
      "2020-01-02\t10.00\t#N/A\t30.00",
      "2020-01-03\t10.50\t--\t30.10",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.byTicker.A.length).toBe(2);
    expect(r.byTicker.B.length).toBe(0);
    expect(r.byTicker.C.length).toBe(2);
  });

  it("strips thousands commas in numeric cells", function () {
    const text = [
      "Date,A",
      "2020-01-02,\"1,234.56\"",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.byTicker.A[0].p).toBe(1234.56);
  });

  it("counts dropped rows when first cell isn't a date", function () {
    const text = [
      "Date\tA",
      "garbage\t10",
      "2020-01-02\t11",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.dropped).toBe(1);
    expect(r.dates).toBe(1);
    expect(r.byTicker.A).toEqual([{ d: "2020-01-02", p: 11 }]);
  });

  it("ignores blank header columns", function () {
    const text = [
      "Date\tA\t\tB",
      "2020-01-02\t10\t99\t20",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.tickers).toBe(2);
    expect(Object.keys(r.byTicker).sort()).toEqual(["A", "B"]);
  });

  it("uppercases tickers", function () {
    const text = [
      "Date,anctf,atd-ca",
      "2020-01-02,35.40,46.20",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.byTicker.ANCTF).toBeDefined();
    expect(r.byTicker["ATD-CA"]).toBeDefined();
  });

  it("returns errors when input is malformed", function () {
    expect(parsePriceHistory("").errors.length).toBe(0); /* empty input is silent */
    expect(parsePriceHistory("only-one-line").errors.length).toBeGreaterThan(0);
    expect(parsePriceHistory("Date\n2020-01-02").errors.length).toBeGreaterThan(0);
  });

  it("sorts each ticker's series ascending by date", function () {
    const text = [
      "Date\tA",
      "2020-01-05\t15",
      "2020-01-02\t10",
      "2020-01-04\t14",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.byTicker.A.map(function (e) { return e.d; })).toEqual([
      "2020-01-02", "2020-01-04", "2020-01-05",
    ]);
  });
});

describe("parsePriceHistory paired layout", function () {
  it("parses a (Date, Ticker, Date, Ticker) layout with different date axes", function () {
    const text = [
      "Date\tAAPL\tDate\t7203-TKY",
      "2020-01-02\t75.09\t2020-01-06\t1395",
      "2020-01-03\t74.36\t2020-01-07\t1409",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.tickers).toBe(2);
    expect(r.byTicker.AAPL).toEqual([
      { d: "2020-01-02", p: 75.09 },
      { d: "2020-01-03", p: 74.36 },
    ]);
    expect(r.byTicker["7203-TKY"]).toEqual([
      { d: "2020-01-06", p: 1395 },
      { d: "2020-01-07", p: 1409 },
    ]);
  });

  it("handles holiday gaps where one market trades and the other doesn't", function () {
    const text = [
      "Date,AAPL,Date,7203-TKY",
      "2020-01-02,75.09,2020-01-06,1395",
      "2020-01-03,74.36,,",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.byTicker.AAPL.length).toBe(2);
    expect(r.byTicker["7203-TKY"].length).toBe(1);
  });

  it("recognizes 'Trade Date' header as a date column", function () {
    const text = [
      "Trade Date\tAAPL\tTrade Date\t7203-TKY",
      "2020-01-02\t75.09\t2020-01-06\t1395",
    ].join("\n");
    const r = parsePriceHistory(text);
    expect(r.tickers).toBe(2);
    expect(r.byTicker.AAPL[0]).toEqual({ d: "2020-01-02", p: 75.09 });
    expect(r.byTicker["7203-TKY"][0]).toEqual({ d: "2020-01-06", p: 1395 });
  });
});

describe("mergePriceSeries", function () {
  it("preserves existing entries when incoming is empty", function () {
    const existing = [{ d: "2020-01-02", p: 10 }, { d: "2020-01-03", p: 11 }];
    expect(mergePriceSeries(existing, [])).toEqual(existing);
  });

  it("appends new dates beyond the existing tail", function () {
    const existing = [{ d: "2020-01-02", p: 10 }];
    const incoming = [{ d: "2020-01-03", p: 11 }];
    expect(mergePriceSeries(existing, incoming)).toEqual([
      { d: "2020-01-02", p: 10 },
      { d: "2020-01-03", p: 11 },
    ]);
  });

  it("overwrites existing entries when incoming has the same date", function () {
    const existing = [{ d: "2020-01-02", p: 10 }];
    const incoming = [{ d: "2020-01-02", p: 99 }];
    expect(mergePriceSeries(existing, incoming)).toEqual([{ d: "2020-01-02", p: 99 }]);
  });

  it("returns sorted result regardless of input order", function () {
    const existing = [{ d: "2020-01-05", p: 15 }];
    const incoming = [{ d: "2020-01-02", p: 10 }, { d: "2020-01-03", p: 11 }];
    expect(mergePriceSeries(existing, incoming).map(function (e) { return e.d; })).toEqual([
      "2020-01-02", "2020-01-03", "2020-01-05",
    ]);
  });
});
