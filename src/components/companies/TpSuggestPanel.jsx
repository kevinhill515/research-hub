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
  var { submitTpApproval, currentUser, tpApprovals } = useCompanyContext();
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
    /* Seed the proposal with Live values (most common starting point
       — "FactSet's numbers, want to lock them in"). User edits or
       copies Fixed values via the "Use Fixed" path. */
    setProposal({
      pe:   live.pe   != null ? String(live.pe)   : "",
      eps1: live.eps1 != null ? String(live.eps1) : "",
      eps2: live.eps2 != null ? String(live.eps2) : "",
      w1:   live.w1   != null ? String(live.w1)   : "",
      w2:   live.w2   != null ? String(live.w2)   : "",
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

  /* Render one row of the comparison grid: label · fixed · use-fixed
     button · live · use-live button · proposal input. Read-only on
     the side-by-side columns; the proposal column is editable. */
  function ComparisonRow(props) {
    var label = props.label, key = props.k, suffix = props.suffix || "";
    var fmt = function(v) { return v == null || v === "" ? "—" : v + suffix; };
    return (
      <div className="grid grid-cols-[80px_1fr_auto_1fr_auto_1fr] gap-2 items-center text-xs">
        <div className="text-gray-600 dark:text-slate-300 font-medium">{label}</div>
        <div className="text-gray-900 dark:text-slate-100 font-mono">{fmt(fixed[key])}</div>
        <button
          onClick={function(){ useFixed(key); }}
          disabled={fixed[key] == null || fixed[key] === ""}
          className={BTN_GHOST + " disabled:opacity-30 disabled:cursor-not-allowed"}
          title="Use Fixed value"
        >Use →</button>
        <div className="text-gray-900 dark:text-slate-100 font-mono">{fmt(live[key])}</div>
        <button
          onClick={function(){ useLive(key); }}
          disabled={live[key] == null || live[key] === ""}
          className={BTN_GHOST + " disabled:opacity-30 disabled:cursor-not-allowed"}
          title="Use Live value"
        >Use →</button>
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

      {/* Header row: label · Fixed · (gap) · Live · (gap) · My Proposal */}
      <div className="grid grid-cols-[80px_1fr_auto_1fr_auto_1fr] gap-2 items-center text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1 px-0.5">
        <div></div>
        <div>Fixed (locked)</div>
        <div></div>
        <div>Live (FactSet)</div>
        <div></div>
        <div>My proposal</div>
      </div>

      <div className="space-y-1 mb-3">
        <ComparisonRow label="Target P/E" k="pe" />
        <ComparisonRow label={"EPS " + (pv.fy1 || "Y1")} k="eps1" />
        <ComparisonRow label={"EPS " + (pv.fy2 || "Y2")} k="eps2" />
        <ComparisonRow label="Weight Y1" k="w1" suffix="%" />
        <ComparisonRow label="Weight Y2" k="w2" suffix="%" />
      </div>

      {/* Implied TP + optional explicit override. Implied recomputes
          as fields change; override wins when set (>0). */}
      <div className="flex items-center gap-3 mb-3 px-2 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-xs flex-wrap">
        <span className="text-gray-500 dark:text-slate-400">Implied TP:</span>
        <span className="font-bold text-gray-900 dark:text-slate-100 font-mono">
          {impliedTp != null ? activeCurrency + " " + impliedTp.toFixed(2) : "—"}
        </span>
        <span className="text-gray-400 dark:text-slate-500">·</span>
        <span className="text-gray-500 dark:text-slate-400">Override (manual TP):</span>
        <input
          type="number"
          step="0.01"
          value={overrideTp}
          onChange={function(e){ setOverrideTp(e.target.value); }}
          placeholder="—"
          className={INP + " w-24 !text-xs !px-2 !py-1"}
          title="Set an explicit TP that overrides the implied PE × EPS calc — for cases where the proposer wants to land on a specific round number"
        />
        {overrideN != null && overrideN > 0 && impliedTp != null && Math.abs(overrideN - impliedTp) > 0.01 && (
          <span className="text-[10px] text-amber-700 dark:text-amber-400 italic">
            (override Δ {((overrideN - impliedTp) / impliedTp * 100).toFixed(1)}%)
          </span>
        )}
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
