/* Smoke tests for the memo generator — the IC meeting compliance
 * output. Covers the regressions we've actually hit:
 *  - Wednesday is freeform (no auto-build, no port-derived rows).
 *  - Tuesday consolidates FV Target Changes (no per-port duplicates).
 *  - Thursday keeps per-port FV breakout.
 *  - Trading Agenda only picks isAgenda:true entries with an action.
 *  - Allocation Changes picks isAgenda:true target-% entries
 *    (uses live portWeights as the baseline when oldWeight is stale).
 *  - Sell-All renders as "Sell All (ports)" not "Sell".
 */
import { describe, it, expect } from "vitest";
import { buildMeetingMemo, MEETING_PROFILES, pickHeldTicker } from "./meetingMemo.js";

function company(overrides) {
  return Object.assign({
    id: "c1",
    name: "TestCo",
    ticker: "TST",
    tickers: [{ ticker: "TST", isOrdinary: true }],
    portfolios: ["FIN","IN","FGL","GL"],
    portWeights: { FIN: "3.0", IN: "3.0", FGL: "3.0", GL: "3.0" },
    portWeightHistory: [],
    tpHistory: [],
    earningsEntries: [],
  }, overrides);
}

describe("MEETING_PROFILES", () => {
  it("defines tuesday, wednesday, thursday", () => {
    expect(MEETING_PROFILES.tuesday.ports).toEqual(["FIN","IN","FGL","GL"]);
    expect(MEETING_PROFILES.thursday.ports).toEqual(["EM","SC"]);
    expect(MEETING_PROFILES.wednesday.ports).toEqual([]);
    expect(MEETING_PROFILES.wednesday.freeform).toBe(true);
  });
});

describe("buildMeetingMemo", () => {
  it("returns empty string for unknown profile", () => {
    expect(buildMeetingMemo([], "bogus", {})).toBe("");
  });

  it("includes the profile header", () => {
    const out = buildMeetingMemo([], "tuesday", {});
    expect(out).toContain("Multi Cap Strategies");
  });

  it("renders Trading Agenda lines only for isAgenda:true with an action", () => {
    const cos = [company({
      portWeightHistory: [
        { id: "h1", date: "2026-06-01", portfolio: "FIN", oldWeight: 3, newWeight: 4, action: "Add", isAgenda: true },
        { id: "h2", date: "2026-05-01", portfolio: "IN",  oldWeight: 3, newWeight: 3, action: "Buy", isAgenda: false }, /* committed — skip */
      ],
    })];
    const out = buildMeetingMemo(cos, "tuesday", {});
    expect(out).toContain("TST (TestCo) – Add to 4.0% (FOC)");
    /* The committed isAgenda:false action should NOT appear in Trading Agenda */
    const agendaSection = out.split("Allocation Changes")[0];
    expect(agendaSection).not.toContain("Buy");
  });

  it("renders Sell as 'Sell All' with port labels", () => {
    const cos = [company({
      portWeightHistory: [
        { id: "h1", date: "2026-06-01", portfolio: "FIN", oldWeight: 3, newWeight: 0, action: "Sell", isAgenda: true },
        { id: "h2", date: "2026-06-01", portfolio: "GL",  oldWeight: 3, newWeight: 0, action: "Sell", isAgenda: true },
      ],
    })];
    const out = buildMeetingMemo(cos, "tuesday", {});
    expect(out).toContain("TST (TestCo) – Sell All (FOC, GL)");
  });

  it("Allocation Changes uses live portWeights for oldW (not stale stored value)", () => {
    const cos = [company({
      portWeights: { FIN: "5.0", IN: "3.0", FGL: "3.0", GL: "3.0" }, /* committed at 5% */
      portWeightHistory: [
        /* Stored oldWeight is stale 2; live portWeights says 5 — memo should use 5. */
        { id: "h1", date: "2026-06-01", portfolio: "FIN", oldWeight: 2, newWeight: 6, isAgenda: true },
      ],
    })];
    const out = buildMeetingMemo(cos, "tuesday", {});
    /* Expect "5.0% → 6.0%" in the FOC line of Allocation Changes */
    expect(out).toMatch(/FOC – TST.*5\.0% → 6\.0%/);
  });

  it("consolidates FV Target Changes for Tuesday (Multi Cap) — no port duplicates", () => {
    const cos = [company({
      tpHistory: [
        { date: new Date().toISOString().slice(0,10), tp: 100, pe: 20, source: "approval" },
      ],
    })];
    const out = buildMeetingMemo(cos, "tuesday", {});
    /* Should appear EXACTLY ONCE under FV Target Changes, not 4× for FIN/IN/FGL/GL */
    const fvSection = out.split("FV Target Changes")[1] || "";
    const matches = (fvSection.match(/TST \(TestCo\) \$100\.00/g) || []).length;
    expect(matches).toBe(1);
  });

  it("FV Target Changes for Thursday keeps per-port breakout", () => {
    const cos = [company({
      portfolios: ["EM","SC"],
      portWeights: { EM: "2.0", SC: "2.0" },
      tickers: [{ ticker: "TST-EM", isOrdinary: false }, { ticker: "TST-SC", isOrdinary: true }],
      tpHistory: [
        { date: new Date().toISOString().slice(0,10), tp: 100, pe: 20, source: "approval" },
      ],
    })];
    const repData = { EM: { "TST-EM": { shares: 100 } }, SC: { "TST-SC": { shares: 50 } } };
    const out = buildMeetingMemo(cos, "thursday", repData);
    const fvSection = out.split("FV Target Changes")[1] || "";
    /* Per-port grouping shows the EM and SC sections as separate lines. */
    expect(fvSection).toContain("EM ADR –");
    expect(fvSection).toContain("INSC –");
  });

  it("renders '(none)' in Trading Agenda when nothing pending", () => {
    const out = buildMeetingMemo([company()], "tuesday", {});
    expect(out).toContain("Trading Agenda");
    /* Implementation pushes "(none)" — match the section context. */
    const agendaSection = out.split("Allocation Changes")[0];
    expect(agendaSection).toContain("(none)");
  });
});

describe("pickHeldTicker", () => {
  it("returns the ticker with rep shares > 0", () => {
    const c = { tickers: [{ ticker: "ORD" }, { ticker: "ADR" }] };
    const repData = { FIN: { ORD: { shares: 0 }, ADR: { shares: 100 } } };
    expect(pickHeldTicker(c, "FIN", repData)).toBe("ADR");
  });

  it("falls back to the ordinary ticker when no rep shares", () => {
    const c = { tickers: [{ ticker: "ORD", isOrdinary: true }, { ticker: "ADR" }] };
    expect(pickHeldTicker(c, "FIN", {})).toBe("ORD");
  });

  it("falls back to ticker[0] then company.ticker when neither holds", () => {
    const c = { ticker: "FALLBACK", tickers: [{ ticker: "FIRST" }] };
    expect(pickHeldTicker(c, "FIN", {})).toBe("FIRST");

    const c2 = { ticker: "FALLBACK", tickers: [] };
    expect(pickHeldTicker(c2, "FIN", {})).toBe("FALLBACK");
  });
});
