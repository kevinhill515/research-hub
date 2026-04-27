import { describe, it, expect } from "vitest";
import {
  parseGuidancePaste,
  parseGuidanceDate,
  parseGuidanceNum,
  parseGuidancePct,
} from "./guidanceParser.js";

describe("parseGuidanceDate", () => {
  it("parses M/D/YY", () => { expect(parseGuidanceDate("2/14/25")).toBe("2025-02-14"); });
  it("parses M/D/YYYY", () => { expect(parseGuidanceDate("2/14/2025")).toBe("2025-02-14"); });
  it("parses ISO", () => { expect(parseGuidanceDate("2025-02-14")).toBe("2025-02-14"); });
  it("parses D-Mon-YYYY (FactSet metadata format)", () => {
    expect(parseGuidanceDate("13-May-2026")).toBe("2026-05-13");
    expect(parseGuidanceDate("3-Jan-2027")).toBe("2027-01-03");
  });
  it("parses Mon-D-YYYY", () => {
    expect(parseGuidanceDate("May-13-2026")).toBe("2026-05-13");
  });
  it("zero-pads single-digit month/day", () => { expect(parseGuidanceDate("3/9/26")).toBe("2026-03-09"); });
  it("treats YY < 50 as 2000s, ≥ 50 as 1900s", () => {
    expect(parseGuidanceDate("1/1/49")).toBe("2049-01-01");
    expect(parseGuidanceDate("1/1/50")).toBe("1950-01-01");
  });
  it("returns null for blank/sentinel", () => {
    expect(parseGuidanceDate("")).toBeNull();
    expect(parseGuidanceDate("-")).toBeNull();
    expect(parseGuidanceDate("n.a.")).toBeNull();
    expect(parseGuidanceDate("garbage")).toBeNull();
  });
});

describe("parseGuidanceNum", () => {
  it("strips commas", () => { expect(parseGuidanceNum("13,200,000.0")).toBe(13200000); });
  it("strips trailing %", () => { expect(parseGuidanceNum("8.7%")).toBe(8.7); });
  it("converts parens to negative", () => { expect(parseGuidanceNum("(1,407,163)")).toBe(-1407163); });
  it("returns null for sentinels", () => {
    expect(parseGuidanceNum("-")).toBeNull();
    expect(parseGuidanceNum("")).toBeNull();
    expect(parseGuidanceNum("#N/A")).toBeNull();
    expect(parseGuidanceNum(null)).toBeNull();
  });
});

describe("parseGuidancePct", () => {
  it("converts percent string to decimal", () => {
    expect(parseGuidancePct("8.7%")).toBeCloseTo(0.087, 6);
    expect(parseGuidancePct("(1.8%)")).toBeCloseTo(-0.018, 6);
  });
  it("returns null when blank", () => { expect(parseGuidancePct("-")).toBeNull(); });
});

describe("parseGuidancePaste", () => {
  /* Synthetic block mimicking the FactSet paste format the user supplied.
     Tab-separated; M/D/YY dates; "-" for blanks; % on the surp/impact
     columns; Guidance L sits next to Guidance Low Comment to verify the
     exact-header-match logic doesn't collide. */
  const SAMPLE = [
    "Identifier\t6758-JP",
    "Guidance History - Sony Group Corporation (6758-JP)\tAll Available Guidance History Data\tNext Report Date: 13-May-2026\tLast Refresh: 27-Apr-2026",
    "Date Issued\tPeriod\tItem\tGuidance L\tGuidance Low Comment\tGuidance H\tGuidance High Comment\tMean\tMean Surp (%)\tActual\tActual Surp (%)\tPrice Impact (%)",
    "2/14/25\t3/31/26\tSales\t13,200,000.0\t-\t13,200,000.0\t-\t12,743,433.0\t3.6%\t12,957,064.0\t1.8%\t8.7%",
    "5/14/25\t3/31/26\tSales\t11,700,000.0\t-\t11,700,000.0\t-\t13,348,921.0\t-12.4%\t-\t-\t3.7%",
    "8/7/25\t3/31/26\tEBIT\t1,330,000.0\t-\t1,330,000.0\t-\t1,390,252.3\t-4.3%\t-\t-\t4.1%",
    "11/11/25\t3/31/26\tDividends per Share\t25.0\t-\t25.0\t-\t24.4\t2.6%\t-\t-\t5.5%",
    "2/5/26\t3/31/27\tSales\t12,500,000.0\t-\t13,000,000.0\t-\t-\t-\t-\t-\t0.1%",
    "\t\t\t\t\t\t\t\t\t\t\t",
  ].join("\n");

  it("extracts ticker and company name from the title row", () => {
    const r = parseGuidancePaste(SAMPLE);
    expect(r.ticker).toBe("6758-JP");
    expect(r.companyName).toBe("Sony Group Corporation");
    expect(r.error).toBeNull();
  });

  it("extracts Next Report Date from the metadata block", () => {
    const r = parseGuidancePaste(SAMPLE);
    expect(r.nextReportDate).toBe("2026-05-13");
  });

  it("returns nextReportDate null when not present in metadata", () => {
    const txt = "Guidance History - Apple Inc. (AAPL)\nDate Issued\tPeriod\tItem\tGuidance L\tGuidance H\n2/14/25\t9/30/25\tSales\t100\t110";
    const r = parseGuidancePaste(txt);
    expect(r.nextReportDate).toBeNull();
  });

  it("parses all valid data rows", () => {
    const r = parseGuidancePaste(SAMPLE);
    expect(r.rows.length).toBe(5);
  });

  it("normalizes dates to ISO", () => {
    const r = parseGuidancePaste(SAMPLE);
    expect(r.rows[0].date).toBe("2025-02-14");
    expect(r.rows[0].period).toBe("2026-03-31");
  });

  it("parses point-estimate rows (low === high)", () => {
    const r = parseGuidancePaste(SAMPLE);
    const sales1 = r.rows[0];
    expect(sales1.item).toBe("Sales");
    expect(sales1.low).toBe(13200000);
    expect(sales1.high).toBe(13200000);
  });

  it("parses range rows (low < high)", () => {
    const r = parseGuidancePaste(SAMPLE);
    const fy27 = r.rows.find((x) => x.period === "2027-03-31");
    expect(fy27).toBeTruthy();
    expect(fy27.low).toBe(12500000);
    expect(fy27.high).toBe(13000000);
  });

  it("captures Actual when populated, null when blank", () => {
    const r = parseGuidancePaste(SAMPLE);
    expect(r.rows[0].actual).toBe(12957064);
    expect(r.rows[1].actual).toBeNull();
  });

  it("converts surprise/impact percents to decimals", () => {
    const r = parseGuidancePaste(SAMPLE);
    expect(r.rows[0].priceImpact).toBeCloseTo(0.087, 6);
    expect(r.rows[0].meanSurp).toBeCloseTo(0.036, 6);
    expect(r.rows[1].meanSurp).toBeCloseTo(-0.124, 6);
  });

  it("does NOT treat 'Guidance Low Comment' as the Guidance L column", () => {
    /* Regression for the exact-header-match logic. The header has
       'Guidance L' immediately followed by 'Guidance Low Comment' — a
       contains-substring match would pick up the comment column. */
    const r = parseGuidancePaste(SAMPLE);
    expect(r.rows[0].low).toBe(13200000); /* not "-" parsed as the comment */
  });

  it("tracks future-FY rows (Period beyond the upcoming FY)", () => {
    const r = parseGuidancePaste(SAMPLE);
    const fy26 = r.rows.filter((x) => x.period === "2026-03-31");
    const fy27 = r.rows.filter((x) => x.period === "2027-03-31");
    expect(fy26.length).toBe(4);
    expect(fy27.length).toBe(1);
  });

  it("returns an error if no header row found", () => {
    const r = parseGuidancePaste("just\nrandom\ntext\nwithout a header");
    expect(r.error).toBeTruthy();
    expect(r.rows.length).toBe(0);
  });

  it("handles tickers without exchange suffix (US format)", () => {
    const txt = "Guidance History - Apple Inc. (AAPL)\nDate Issued\tPeriod\tItem\tGuidance L\tGuidance H\n2/14/25\t9/30/25\tSales\t100\t110";
    const r = parseGuidancePaste(txt);
    expect(r.ticker).toBe("AAPL");
    expect(r.companyName).toBe("Apple Inc.");
    expect(r.rows.length).toBe(1);
  });
});
