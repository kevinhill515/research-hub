import { describe, it, expect } from "vitest";
import { normalizeCompanyName, findCompanyByName, findCompanyByTickerOrName } from "./nameMatch.js";

describe("normalizeCompanyName", function () {
  it("strips corporate suffixes case-insensitively", function () {
    expect(normalizeCompanyName("Schneider Electric SE")).toBe("schneider electric");
    expect(normalizeCompanyName("Volkswagen AG")).toBe("volkswagen");
    expect(normalizeCompanyName("Apple Inc.")).toBe("apple");
    expect(normalizeCompanyName("Royal Dutch Shell Plc")).toBe("royal dutch shell");
  });
  it("strips long-form corporate words", function () {
    expect(normalizeCompanyName("Microsoft Corporation")).toBe("microsoft");
    expect(normalizeCompanyName("Berkshire Hathaway Holdings")).toBe("berkshire hathaway");
  });
  it("normalizes punctuation and whitespace", function () {
    expect(normalizeCompanyName("AT&T, Inc.")).toBe("at t");
    expect(normalizeCompanyName("Procter   &   Gamble")).toBe("procter gamble");
  });
});

describe("findCompanyByName", function () {
  const cos = [
    { id: "1", name: "Schneider Electric SE" },
    { id: "2", name: "Volkswagen AG", usTickerName: "Volkswagen ADR" },
    { id: "3", name: "Apple Inc." },
  ];
  it("matches exact name (case-insensitive)", function () {
    expect(findCompanyByName(cos, "Apple Inc.").id).toBe("3");
    expect(findCompanyByName(cos, "apple inc.").id).toBe("3");
  });
  it("matches usTickerName when set", function () {
    expect(findCompanyByName(cos, "Volkswagen ADR").id).toBe("2");
  });
  it("falls back to normalized match", function () {
    expect(findCompanyByName(cos, "Schneider Electric").id).toBe("1");
    expect(findCompanyByName(cos, "Apple").id).toBe("3");
  });
  it("returns null when nothing matches", function () {
    expect(findCompanyByName(cos, "Tesla")).toBeNull();
    expect(findCompanyByName(cos, "")).toBeNull();
    expect(findCompanyByName(cos, null)).toBeNull();
  });
});

describe("findCompanyByTickerOrName", function () {
  const cos = [
    { id: "1", name: "Schneider Electric SE", tickers: [{ ticker: "SU-FR" }] },
    { id: "2", name: "Apple Inc.",            tickers: [{ ticker: "AAPL" }] },
  ];
  it("prefers ticker match", function () {
    expect(findCompanyByTickerOrName(cos, "SU-FR", "Some Other Name").id).toBe("1");
  });
  it("falls back to name match when ticker doesn't match", function () {
    expect(findCompanyByTickerOrName(cos, "XYZ", "Apple").id).toBe("2");
  });
  it("ticker match is case-insensitive", function () {
    expect(findCompanyByTickerOrName(cos, "aapl", null).id).toBe("2");
  });
});
