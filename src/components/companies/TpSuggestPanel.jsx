/* Inline "Suggest TP change" panel for the company > Valuation tab.
 *
 * Mirrors the submit-for-approval flow that lives on the Earnings &
 * Thesis Check tab, but framed around comparing the current Fixed
 * assumptions (PE, EPS1, EPS2, W1, W2 — what was locked at the last
 * approval) with the current Live FactSet expectations. The user
 * can copy any Live value into their proposal with a single "Use →"
 * button, edit any field directly, or set the TP explicitly with an
 * override input. Submits to submitTpApproval which lands in the
 * existing TP Approvals modal for peer sign-off.
 *
 * Layout:
 *   ┌─ Suggest TP change ─────────────────────────┐
 *   │            Fixed (locked)   Live (FactSet)  │
 *   │ PE         18.5x [Use →]    17.2x           │
 *   │ EPS Y1     4.20  [Use →]    4.45            │
 *   │ EPS Y2     4.80  [Use →]    5.10            │
 *   │ Weight Y1  50%   [Use →]    50%             │
 *   │ Weight Y2  50%   [Use →]    50%             │
 *   │                                             │
 *   │ My Proposal                                 │
 *   │ PE [____]  EPS1 [____]  EPS2 [____]         │
 *   │ W1 [____]  W2 [____]                        │
 *   │ Implied TP: $XX.XX    Override: [_______]  │
 *   │                                             │
 *   │ Rationale [_______________________________] │
 *   │ [Submit for approval] [Cancel]              │
 *   └─────────────────────────────────────────────┘
 */
import { useState } from "react";
import { useCompanyContext } from "../../context/CompanyContext.jsx";

const INP = "text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none";
const BTN_GHOST = "text-[10px] px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30";

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  var n = parseFloat(v);
  return isFinite(n) ? n : null;
}

function computeImpliedTP(pe, eps1, eps2, w1, w2) {
  var peN = num(pe);
  if (peN === null || peN <= 0) return null;
  var e1 = num(eps1), e2 = num(eps2);
  var W1 = num(w1), W2 = num(w2);
  var normEps = null;
  if (e1 !== null && e2 !== null && W1 !== null && W2 !== null) {
    normEps = (e1 * W1 + e2 * W2) / 100;
  } else if (e1 !== null && e2 === null) {
    normEps = e1;
  } else if (e2 !== null && e1 === null) {
    normEps = e2;
  }
  return normEps !== null ? peN * normEps : null;
}

export default function TpSuggestPanel({ selCo, pv, tpFixed, activeCurrency }) {
  var { submitTpApproval, currentUser, tpApprovals, valuationSnapshot } = useCompanyContext();
  var [open, setOpen] = useState(false);
  var [proposal, setProposal] = useState(null);   /* lazy-init on open */
  var [rationale, setRationale] = useState("");
  var [overrideTp, setOverrideTp] = useState("");
  var [submitMsg, setSubmitMsg] = useState("");

  /* Pull the Fixed (locked-at-last-approval) inputs out of pv. These
     are written by approveTpApproval when an approval lands; they're
     editable on the EPS Inputs section below but on this panel
     they're rendered read-only — the user is comparing them to Live
     and proposing a *new* TP, not editing them in place. */
  var fixed = {
    pe:   pv.peFixed   != null ? pv.peFixed   : pv.pe,
    eps1: pv.eps1Fixed != null ? pv.eps1Fixed : null,
    eps2: pv.eps2Fixed != null ? pv.eps2Fixed : null,
    w1:   pv.w1Fixed   != null ? pv.w1Fixed   : null,
    w2:   pv.w2Fixed   != null ? pv.w2Fixed   : null,
  };
  var live = {
    pe:   pv.pe,
    eps1: pv.eps1,
    eps2: pv.eps2,
    w1:   pv.w1,
    w2:   pv.w2,
  };

  /* Pending count — drives the chip on the open button so the user
     sees outstanding suggestions before submitting another. */
  var pendingForCo = (tpApprovals || []).filter(function(a){
    return a.companyId === selCo.id && a.status === "pending";
  });

  function openPanel() {
    /* Seed the proposal preferring valuationSnapshot (pinned analyst
       values from the most recent Valuation Upload) so subsequent
       daily refreshes that clobber c.valuation.eps1/eps2 don't bleed
       into TP Suggest. Falls back to Live (c.valuation.*) when no
       snapshot exists for this company. */
    var snap = (valuationSnapshot && valuationSnapshot[selCo.id]) || null;
    function pick(k) {
      if (snap && snap[k] !== undefined && snap[k] !== null && snap[k] !== "") return String(snap[k]);
      return live[k] != null ? String(live[k]) : "";
    }
    setProposal({
      pe:   pick("pe"),
      eps1: pick("eps1"),
      eps2: pick("eps2"),
      w1:   pick("w1"),
      w2:   pick("w2"),
    });
    setRationale("");
    setOverrideTp("");
    setSubmitMsg("");
    setOpen(true);
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button
          onClick={openPanel}
          className="text-xs px-3 py-1.5 font-semibold rounded-md bg-amber-600 hover:bg-amber-700 text-white cursor-pointer transition-colors"
          title="Compare current Fixed assumptions to live FactSet expectations, then submit a TP change for peer approval"
        >
          ⏳ Suggest TP change
          {pendingForCo.length > 0 && (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-white/25 text-white font-semibold">
              {pendingForCo.length} pending
            </span>
          )}
        </button>
        {submitMsg && (
          <span className="ml-2 text-[11px] text-emerald-700 dark:text-emerald-300">{submitMsg}</span>
        )}
      </div>
    );
  }

  var impliedTp = computeImpliedTP(proposal.pe, proposal.eps1, proposal.eps2, proposal.w1, proposal.w2);
  var overrideN = num(overrideTp);
  var finalTp = overrideN !== null && overrideN > 0 ? overrideN : impliedTp;

  /* FY-end-month suffix on EPS row labels. Only shown when fyMonth
     is set and not "Dec" — most US names default to December so
     adding "(Dec)" everywhere would be noise. Matches the existing
     suffix logic on EarningsEntry's tile headers. */
  var fyMonthSuffix = (pv.fyMonth && pv.fyMonth !== "Dec") ? " (" + pv.fyMonth + ")" : "";

  function setField(key, value) {
    setProposal(function(p){ var n = Object.assign({}, p); n[key] = value; return n; });
  }
  function useLive(key) { setField(key, live[key] != null ? String(live[key]) : ""); }
  function useFixed(key) { setField(key, fixed[key] != null ? String(fixed[key]) : ""); }

  function submit() {
    if (finalTp == null || !isFinite(finalTp) || finalTp <= 0) return;
    var payload = {
      companyId: selCo.id,
      fromPE: num(fixed.pe),
      fromEPS1: num(fixed.eps1),
      fromEPS2: num(fixed.eps2),
      fromW1: num(fixed.w1),
      fromW2: num(fixed.w2),
      fromEPS: null,
      fromTP: tpFixed != null ? num(tpFixed) : null,
      toPE: num(proposal.pe),
      toEPS1: num(proposal.eps1),
      toEPS2: num(proposal.eps2),
      toW1: num(proposal.w1),
      toW2: num(proposal.w2),
      toEPS: null,
      toTP: finalTp,
      computedTP: impliedTp,
      proposedTP: overrideN,
      fy1: pv.fy1 || "",
      fy2: pv.fy2 || "",
      rationale: rationale.trim(),
    };
    submitTpApproval(payload);
    setOpen(false);
    setSubmitMsg("✓ Submitted for approval — see TP Approvals modal");
    setTimeout(function(){ setSubmitMsg(""); }, 5000);
  }

  /* Render one row of the comparison grid: label · clickable-fixed ·
     clickable-live · proposal input. The Fixed and Live VALUES
     themselves are clickable (with hover + cursor-pointer + tooltip)
     to copy into the proposal — no separate "Use →" button. This
     makes the action unambiguous: click the number you want and it
     lands in the proposal column. Empty/missing values are static. */
  function ComparisonRow(props) {
    var label = props.label, key = props.k, suffix = props.suffix || "";
    var fmt = function(v) { return v == null || v === "" ? "—" : v + suffix; };
    var fixedClickable = fixed[key] != null && fixed[key] !== "";
    var liveClickable  = live[key]  != null && live[key]  !== "";
    return (
      <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-2 items-center text-xs">
        <div className="text-gray-600 dark:text-slate-300 font-medium">{label}</div>
        <div
          onClick={fixedClickable ? function(){ useFixed(key); } : undefined}
          className={"font-mono px-2 py-1 rounded transition-colors " + (fixedClickable
            ? "text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-transparent hover:border-emerald-300 dark:hover:border-emerald-700"
            : "text-gray-400 dark:text-slate-600 border border-transparent")}
          title={fixedClickable ? "Click to copy " + fmt(fixed[key]) + " into the proposal" : ""}
        >{fmt(fixed[key])}</div>
        <div
          onClick={liveClickable ? function(){ useLive(key); } : undefined}
          className={"font-mono px-2 py-1 rounded transition-colors " + (liveClickable
            ? "text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-transparent hover:border-blue-300 dark:hover:border-blue-700"
            : "text-gray-400 dark:text-slate-600 border border-transparent")}
          title={liveClickable ? "Click to copy " + fmt(live[key]) + " into the proposal" : ""}
        >{fmt(live[key])}</div>
        <input
          type="number"
          step="0.01"
          value={proposal[key] || ""}
          onChange={function(e){ setField(key, e.target.value); }}
          className={INP + " !text-xs !px-1.5 !py-0.5 w-full"}
          placeholder="—"
        />
      </div>
    );
  }

  return (
    <div className="mb-4 px-3.5 py-3 rounded-lg border-2 border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">⏳ Suggest TP change</span>
        <span className="text-[11px] text-amber-700 dark:text-amber-400">
          Submitted as pending — needs another teammate to approve before it lands on TP Fixed.
        </span>
        <button onClick={function(){ setOpen(false); }} className="ml-auto text-[11px] text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 cursor-pointer">✕</button>
      </div>

      {/* Headline: implied TP + MOS to current price. Pulled up here
          (was below the rows) so the proposer sees the impact of the
          assumptions they're entering at the top of the panel, not
          after scrolling past the comparison grid. MOS uses the
          override TP when set, else the implied. Reads from the
          ord-side price (pv.price). */}
      {(function(){
        var finalForMos = finalTp;
        var priceN = num(pv.price);
        var mosPct = (finalForMos != null && priceN != null && priceN > 0)
          ? (finalForMos - priceN) / priceN * 100 : null;
        return (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700">
              <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-0.5">Proposed TP (implied)</div>
              <div className="text-[18px] font-bold text-gray-900 dark:text-slate-100 leading-tight font-mono">
                {finalTp != null ? activeCurrency + " " + finalTp.toFixed(2) : "—"}
              </div>
              {overrideN != null && overrideN > 0 && impliedTp != null && Math.abs(overrideN - impliedTp) > 0.01 && (
                <div className="text-[10px] text-amber-700 dark:text-amber-400 italic mt-0.5">
                  override Δ {((overrideN - impliedTp) / impliedTp * 100).toFixed(1)}% vs implied {activeCurrency} {impliedTp.toFixed(2)}
                </div>
              )}
            </div>
            <div className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700">
              <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-0.5">MOS to current price</div>
              <div
                className="text-[18px] font-bold leading-tight font-mono"
                style={{ color: mosPct == null ? undefined : (mosPct >= 0 ? "#166534" : "#dc2626") }}
              >
                {mosPct != null ? (mosPct >= 0 ? "+" : "") + mosPct.toFixed(1) + "%" : "—"}
              </div>
              {priceN != null && (
                <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">
                  vs {activeCurrency} {priceN.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Header row: label · TP Fixed · TP Live · My Proposal. The
          Fixed and Live cells render the SOURCE values; clicking the
          number itself copies it into the proposal column. */}
      <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-2 items-center text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1 px-0.5">
        <div></div>
        <div className="px-2">TP Fixed (Changing From)</div>
        <div className="px-2">TP Live (FactSet Estimates)</div>
        <div className="px-2">My Proposal (New Fixed TP)</div>
      </div>

      <div className="space-y-1 mb-3">
        <ComparisonRow label="Target P/E" k="pe" />
        <ComparisonRow label={"EPS " + (pv.fy1 || "Y1") + fyMonthSuffix} k="eps1" />
        <ComparisonRow label={"EPS " + (pv.fy2 || "Y2") + fyMonthSuffix} k="eps2" />
        <ComparisonRow label="Weight Y1" k="w1" suffix="%" />
        <ComparisonRow label="Weight Y2" k="w2" suffix="%" />
      </div>

      {/* Optional explicit override — when the proposer wants to
          land on a clean round number (e.g. TWD 2,400 instead of
          the 2,395.83 the math produces) rather than carry forward
          the implied PE × EPS to two decimals. */}
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="text-gray-500 dark:text-slate-400">Round to (override TP):</span>
        <input
          type="number"
          step="0.01"
          value={overrideTp}
          onChange={function(e){ setOverrideTp(e.target.value); }}
          placeholder="—"
          className={INP + " w-24 !text-xs !px-2 !py-1"}
          title="Use this to land on a round number (e.g. TWD 2,400) instead of the precise implied PE × EPS calc. Leave blank to submit the implied TP exactly."
        />
        <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">use this if you want to submit a clean round number; leave blank to use implied</span>
      </div>

      <div className="mb-2">
        <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 block mb-0.5">Rationale</label>
        <textarea
          value={rationale}
          onChange={function(e){ setRationale(e.target.value); }}
          rows={2}
          placeholder="Brief reasoning for the change — what changed in the model, what the approver should look at."
          className={INP + " w-full !text-xs"}
        />
      </div>

      <div className="flex gap-2 items-center">
        <button
          onClick={submit}
          disabled={finalTp == null || !isFinite(finalTp) || finalTp <= 0}
          className={"text-xs px-3 py-1.5 font-semibold rounded-md transition-colors " + (finalTp != null && finalTp > 0
            ? "bg-amber-600 text-white border-none cursor-pointer hover:bg-amber-700"
            : "bg-slate-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 border-none cursor-not-allowed")}
        >Submit for approval</button>
        <button
          onClick={function(){ setOpen(false); }}
          className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >Cancel</button>
        {pendingForCo.length > 0 && (
          <span className="text-[11px] text-amber-700 dark:text-amber-400 ml-2">
            ⏳ {pendingForCo.length} pending suggestion{pendingForCo.length > 1 ? "s" : ""} on this company already
          </span>
        )}
      </div>
    </div>
  );
}
