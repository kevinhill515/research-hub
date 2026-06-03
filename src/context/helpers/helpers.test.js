/* Smoke tests for the three CompanyContext helpers. Each one captures
 * the corner cases that have bitten us in production:
 *  - applyTradeAgenda: toggle-off, Sell-restore, switching verbs.
 *  - applyProposeTargetWeight: Sell-stamp override baseline,
 *    proposed===committed clears the pending entry.
 *  - applyApprovalToApprovals: sibling pending records on the same
 *    company get auto-rejected; race fix preserved.
 *  - applyApprovalToCompany: writes both working + Fixed valuation
 *    slots; prepends tpHistory; preserves currency. */
import { describe, it, expect } from "vitest";
import { applyTradeAgenda } from "./markTradeAgenda.js";
import { applyProposeTargetWeight, findPendingTargetEntry } from "./proposeTargetWeight.js";
import { applyApprovalToApprovals, applyApprovalToCompany } from "./approveTpApproval.js";

const TODAY = "2026-06-03";
const AUTHOR = "kh";
let nextId = 0;
function newId() { return "id" + (++nextId); }
function company(overrides) {
  return Object.assign({
    id: "c1",
    portWeights: { FIN: "3.0" },
    portWeightHistory: [],
  }, overrides);
}

describe("applyTradeAgenda", () => {
  it("ignores invalid action", () => {
    const c = company();
    expect(applyTradeAgenda(c, "FIN", "Bogus", TODAY, AUTHOR, newId)).toBe(c);
  });

  it("stamps a new Buy on a clean company", () => {
    const out = applyTradeAgenda(company(), "FIN", "Buy", TODAY, AUTHOR, newId);
    expect(out.portWeightHistory.length).toBe(1);
    expect(out.portWeightHistory[0].action).toBe("Buy");
    expect(out.portWeightHistory[0].isAgenda).toBe(true);
  });

  it("toggles OFF when the same verb is stamped twice", () => {
    const first = applyTradeAgenda(company(), "FIN", "Buy", TODAY, AUTHOR, newId);
    const out = applyTradeAgenda(first, "FIN", "Buy", TODAY, AUTHOR, newId);
    expect(out.portWeightHistory.length).toBe(0);
  });

  it("Sell zeroes portWeights and stamps Sell", () => {
    const out = applyTradeAgenda(company(), "FIN", "Sell", TODAY, AUTHOR, newId);
    expect(out.portWeights.FIN).toBe("0");
    expect(out.portWeightHistory[0].action).toBe("Sell");
    expect(out.portWeightHistory[0].newWeight).toBe(0);
  });

  it("switching from Sell to Buy restores the pre-Sell weight", () => {
    const sold = applyTradeAgenda(company(), "FIN", "Sell", TODAY, AUTHOR, newId);
    expect(sold.portWeights.FIN).toBe("0");
    const switched = applyTradeAgenda(sold, "FIN", "Buy", TODAY, AUTHOR, newId);
    expect(switched.portWeights.FIN).toBe("3"); /* String(3) — restored */
    expect(switched.portWeightHistory[0].action).toBe("Buy");
    expect(switched.portWeightHistory.filter(h => h.action === "Sell").length).toBe(0);
  });
});

describe("findPendingTargetEntry", () => {
  it("returns null when no proposals exist", () => {
    expect(findPendingTargetEntry(company(), "FIN")).toBeNull();
  });

  it("ignores stamps with an action (those are B/A/P/S)", () => {
    const c = company({ portWeightHistory: [{ isAgenda: true, portfolio: "FIN", action: "Buy", newWeight: 4 }] });
    expect(findPendingTargetEntry(c, "FIN")).toBeNull();
  });

  it("returns target proposals (isAgenda:true, no action, newWeight present)", () => {
    const c = company({ portWeightHistory: [{ id: "x", isAgenda: true, portfolio: "FIN", newWeight: 4 }] });
    const out = findPendingTargetEntry(c, "FIN");
    expect(out?.entry.id).toBe("x");
  });
});

describe("applyProposeTargetWeight", () => {
  it("creates a pending entry and reports delta=newW-committed", () => {
    const out = applyProposeTargetWeight(company(), "FIN", "4.0", TODAY, AUTHOR, newId);
    expect(out.deltaForCash).toBeCloseTo(1.0);
    expect(out.company.portWeightHistory.length).toBe(1);
    expect(out.company.portWeightHistory[0].newWeight).toBe(4);
  });

  it("replaces an existing pending entry in place (same id)", () => {
    const first = applyProposeTargetWeight(company(), "FIN", "4.0", TODAY, AUTHOR, newId);
    const firstId = first.company.portWeightHistory[0].id;
    const second = applyProposeTargetWeight(first.company, "FIN", "5.0", TODAY, AUTHOR, newId);
    expect(second.company.portWeightHistory.length).toBe(1);
    expect(second.company.portWeightHistory[0].id).toBe(firstId);
    expect(second.company.portWeightHistory[0].newWeight).toBe(5);
    expect(second.deltaForCash).toBeCloseTo(1.0); /* 5 - 4 */
  });

  it("proposing back to the committed value clears the pending entry", () => {
    const first = applyProposeTargetWeight(company(), "FIN", "4.0", TODAY, AUTHOR, newId);
    const back = applyProposeTargetWeight(first.company, "FIN", "3.0", TODAY, AUTHOR, newId);
    expect(back.company.portWeightHistory.length).toBe(0);
    expect(back.deltaForCash).toBeCloseTo(-1.0);
  });

  it("Sell-stamp override: baseline becomes the pre-Sell oldWeight", () => {
    /* Start with Sell agenda — portWeights.FIN=0, sellEntry.oldWeight=3. */
    const c = company({
      portWeights: { FIN: "0" },
      portWeightHistory: [{ id: "s1", isAgenda: true, portfolio: "FIN", action: "Sell", oldWeight: 3, newWeight: 0 }],
    });
    /* New target = 4. baseline should be 3 (from oldWeight), not 0. */
    const out = applyProposeTargetWeight(c, "FIN", "4.0", TODAY, AUTHOR, newId);
    /* Sell stamp removed, target entry created with oldWeight=3. */
    expect(out.company.portWeightHistory.filter(h => h.action === "Sell").length).toBe(0);
    const target = out.company.portWeightHistory.find(h => !h.action);
    expect(target.oldWeight).toBe(3);
    expect(target.newWeight).toBe(4);
    /* portWeights restored to "3" (the Sell-restored baseline). */
    expect(out.company.portWeights.FIN).toBe("3");
  });
});

describe("applyApprovalToApprovals", () => {
  it("approves the target and auto-rejects sibling pendings on same company", () => {
    const prev = [
      { id: "a1", companyId: "c1", status: "pending", suggestedBy: "alice" },
      { id: "a2", companyId: "c1", status: "pending", suggestedBy: "bob" },
      { id: "a3", companyId: "c2", status: "pending", suggestedBy: "alice" },
    ];
    const rec = prev[0];
    const out = applyApprovalToApprovals(prev, "a1", rec, "kh", TODAY);
    expect(out.find(a => a.id === "a1").status).toBe("approved");
    expect(out.find(a => a.id === "a2").status).toBe("rejected");
    expect(out.find(a => a.id === "a2").rejectReason).toMatch(/Superseded/);
    expect(out.find(a => a.id === "a3").status).toBe("pending"); /* different co */
  });

  it("no-ops when target was already decided in the meantime", () => {
    const prev = [{ id: "a1", companyId: "c1", status: "approved", suggestedBy: "alice" }];
    const out = applyApprovalToApprovals(prev, "a1", prev[0], "kh", TODAY);
    expect(out).toBe(prev);
  });
});

describe("applyApprovalToCompany", () => {
  function rec(extra) {
    return Object.assign({
      companyId: "c1",
      suggestedBy: "alice",
      toPE: 20, toEPS1: 5, toEPS2: 6, toW1: 60, toW2: 40,
      toTP: 110,
      fy1: "FY26", fy2: "FY27",
    }, extra);
  }
  const inferQuarter = () => ({ label: "Q1 FY26" });

  it("writes working + Fixed valuation slots and prepends tpHistory", () => {
    const c = { id: "c1", valuation: { currency: "EUR" }, tpHistory: [] };
    const out = applyApprovalToCompany(c, rec(), "kh", TODAY, inferQuarter);
    expect(out.valuation.pe).toBe(20);
    expect(out.valuation.peFixed).toBe(20);
    expect(out.valuation.tpFixed).toBe("110");
    expect(out.valuation.tpFixedDate).toBe(TODAY);
    expect(out.valuation.fy1Fixed).toBe("FY26");
    expect(out.tpHistory.length).toBe(1);
    expect(out.tpHistory[0].tp).toBe(110);
    expect(out.tpHistory[0].currency).toBe("EUR");
    expect(out.tpHistory[0].source).toBe("approval");
    expect(out.tpHistory[0].approvedBy).toBe("kh");
  });

  it("falls back to toEPS when toEPS1 is missing (older record)", () => {
    const c = { id: "c1", valuation: {}, tpHistory: [] };
    const out = applyApprovalToCompany(c, { companyId: "c1", suggestedBy: "alice", toEPS: 4.2 }, "kh", TODAY, inferQuarter);
    expect(out.valuation.eps1).toBe(4.2);
  });
});
