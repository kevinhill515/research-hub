import { describe, it, expect } from "vitest";
import {
  resolveField, weightedAvg, mktCapStats, buildCompaniesById,
  CHARACTERISTIC_METRICS,
} from "./characteristics.js";

function mkCompany(id, metrics) {
  return { id: id, name: "C" + id, metrics: metrics || {} };
}

describe("resolveField", function () {
  it("returns base key for non-variant metrics regardless of variant", function () {
    expect(resolveField("mktCap", "0", false)).toBe("mktCap");
    expect(resolveField("mktCap", "1", false)).toBe("mktCap");
    expect(resolveField("mktCap", "2", false)).toBe("mktCap");
    expect(resolveField("ltEPS",  "1", false)).toBe("ltEPS");
  });
  it("appends 1 or 2 for variant metrics", function () {
    expect(resolveField("fpe", "0", true)).toBe("fpe");
    expect(resolveField("fpe", "1", true)).toBe("fpe1");
    expect(resolveField("fpe", "2", true)).toBe("fpe2");
  });
});

describe("weightedAvg", function () {
  it("uniform weights reduce to simple arithmetic mean", function () {
    const cos = [mkCompany("a", { fpe: 10 }), mkCompany("b", { fpe: 20 })];
    const bc = [{ id: "a", mv: 100 }, { id: "b", mv: 100 }];
    const r = weightedAvg(bc, buildCompaniesById(cos), "fpe");
    expect(r.value).toBe(15);
    expect(r.coverage.used).toBe(2);
    expect(r.coverage.total).toBe(2);
  });
  it("weights properly bias the average", function () {
    /* 10 weighted 9x, 20 weighted 1x -> (90+20)/10 = 11 */
    const cos = [mkCompany("a", { fpe: 10 }), mkCompany("b", { fpe: 20 })];
    const bc = [{ id: "a", mv: 900 }, { id: "b", mv: 100 }];
    const r = weightedAvg(bc, buildCompaniesById(cos), "fpe");
    expect(r.value).toBe(11);
  });
  it("missing metric renormalizes — doesn't dilute with zeros", function () {
    /* Two holdings, one has no fpe. Result must equal the present value,
     * not (10+0)/2 = 5. */
    const cos = [mkCompany("a", { fpe: 10 }), mkCompany("b", {})];
    const bc = [{ id: "a", mv: 100 }, { id: "b", mv: 100 }];
    const r = weightedAvg(bc, buildCompaniesById(cos), "fpe");
    expect(r.value).toBe(10);
    expect(r.coverage.used).toBe(1);
    expect(r.coverage.total).toBe(2);
    expect(r.coverage.weightUsed).toBe(100);
    expect(r.coverage.weightTotal).toBe(200);
  });
  it("non-finite / NaN / string values are skipped", function () {
    const cos = [
      mkCompany("a", { fpe: 10 }),
      mkCompany("b", { fpe: "#N/A" }),
      mkCompany("c", { fpe: NaN }),
    ];
    const bc = [{ id: "a", mv: 50 }, { id: "b", mv: 50 }, { id: "c", mv: 50 }];
    const r = weightedAvg(bc, buildCompaniesById(cos), "fpe");
    expect(r.value).toBe(10);
    expect(r.coverage.used).toBe(1);
  });
  it("empty byCompany returns null value", function () {
    expect(weightedAvg([], {}, "fpe").value).toBeNull();
  });
  it("parses numeric strings (company metrics stored as strings)", function () {
    const cos = [mkCompany("a", { fpe: "12.5" }), mkCompany("b", { fpe: "15.5" })];
    const bc = [{ id: "a", mv: 100 }, { id: "b", mv: 100 }];
    const r = weightedAvg(bc, buildCompaniesById(cos), "fpe");
    expect(r.value).toBe(14);
  });
});

describe("mktCapStats", function () {
  it("odd count median is middle value", function () {
    const cos = [
      mkCompany("a", { mktCap: 10 }),
      mkCompany("b", { mktCap: 50 }),
      mkCompany("c", { mktCap: 100 }),
    ];
    const bc = [{ id: "a", mv: 1 }, { id: "b", mv: 1 }, { id: "c", mv: 1 }];
    const r = mktCapStats(bc, buildCompaniesById(cos));
    expect(r.avg).toBeCloseTo(53.333, 2);
    expect(r.median).toBe(50);
    expect(r.count).toBe(3);
  });
  it("even count median averages the two middles", function () {
    const cos = [
      mkCompany("a", { mktCap: 10 }),
      mkCompany("b", { mktCap: 20 }),
      mkCompany("c", { mktCap: 30 }),
      mkCompany("d", { mktCap: 40 }),
    ];
    const bc = [{ id: "a", mv: 1 }, { id: "b", mv: 1 }, { id: "c", mv: 1 }, { id: "d", mv: 1 }];
    const r = mktCapStats(bc, buildCompaniesById(cos));
    expect(r.avg).toBe(25);
    expect(r.median).toBe(25); /* (20 + 30) / 2 */
  });
  it("skips missing mktCap", function () {
    const cos = [mkCompany("a", { mktCap: 50 }), mkCompany("b", {})];
    const bc = [{ id: "a", mv: 1 }, { id: "b", mv: 1 }];
    const r = mktCapStats(bc, buildCompaniesById(cos));
    expect(r.avg).toBe(50);
    expect(r.median).toBe(50);
    expect(r.count).toBe(1);
  });
  it("empty input returns nulls", function () {
    const r = mktCapStats([], {});
    expect(r.avg).toBeNull();
    expect(r.median).toBeNull();
    expect(r.count).toBe(0);
  });
});

describe("CHARACTERISTIC_METRICS config", function () {
  it("every entry has required fields", function () {
    CHARACTERISTIC_METRICS.forEach(function (m) {
      expect(typeof m.key).toBe("string");
      expect(typeof m.label).toBe("string");
      expect(typeof m.group).toBe("string");
      expect(["bn", "x", "pct", "ratio"]).toContain(m.kind);
      expect(typeof m.hasVariants).toBe("boolean");
    });
  });
  it("mktCap, intCov, ltEPS are declared variantless", function () {
    const byKey = {};
    CHARACTERISTIC_METRICS.forEach(function (m) { byKey[m.key] = m; });
    expect(byKey.mktCap.hasVariants).toBe(false);
    expect(byKey.intCov.hasVariants).toBe(false);
    expect(byKey.ltEPS.hasVariants).toBe(false);
  });
});
