import { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { PORTFOLIOS, TIER_ORDER } from '../../constants/index.js';
import { repShares, tierBg, tierPillStyle, tierToStatus, getTiers, truncName,
         calcNormEPS, calcTP, calcMOS, fmtMOS0, mosBg, getTpFixed } from '../../utils/index.js';
import { PortPicker } from '../ui/index.js';
import FpeRangeMini from '../ui/FpeRangeMini.jsx';

/* Inline editable weight cell for the Overlap target view. Click the
 * value to switch to an input; Enter or blur to commit; Escape to
 * cancel. Calls updateTargetWeight() which writes to
 * c.portWeights[portfolio] AND logs an entry into c.portWeightHistory
 * (used by the PM Meeting memo generator to surface "weight changes
 * in the last 6 days"). Rep mode falls back to the read-only span. */
function EditableWeightCell({ value, onSubmit, displayClassName, cellStyle }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  function startEdit() {
    setDraft(value > 0 ? value.toFixed(1) : "");
    setEditing(true);
  }
  function commit() {
    if (draft.trim() === "" || isNaN(parseFloat(draft))) {
      setEditing(false);
      return;
    }
    onSubmit(parseFloat(draft));
    setEditing(false);
  }
  if (editing) {
    return (
      <div className="align-middle pr-4 py-1.5" style={Object.assign({display:"table-cell"}, cellStyle || {})} onClick={function(e){e.stopPropagation();}}>
        <input
          autoFocus
          value={draft}
          onChange={function(e){setDraft(e.target.value);}}
          onBlur={commit}
          onKeyDown={function(e){
            if(e.key==="Enter") commit();
            if(e.key==="Escape") setEditing(false);
          }}
          className="text-sm w-16 px-1 py-0.5 rounded border border-blue-400 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    );
  }
  return (
    <div
      className={"align-middle pr-4 py-1.5 text-sm cursor-pointer hover:ring-1 hover:ring-blue-300 dark:hover:ring-blue-700 rounded " + (displayClassName || "text-gray-900 dark:text-slate-100")}
      style={Object.assign({display:"table-cell"}, cellStyle || {})}
      onClick={function(e){e.stopPropagation(); startEdit();}}
      title="Click to edit target weight"
    >
      {value > 0 ? value.toFixed(1) + "%" : "--"}
    </div>
  );
}

/* Click-to-edit Tier cell — mirrors the Companies>List Tier(s) cell.
   Click anywhere in the cell to open an Add-Tier popover; removing a
   tier still works via each pill's inline ×. Per-row local state so
   only the clicked row's menu opens. */
function TierCell({ tiers, dark, rowBgColor, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef();
  const popRef = useRef();
  /* useClickOutside is bound to the popover when it's open — the
     trigger cell is excluded by stopPropagation in the toggle handler. */
  useClickOutside(popRef, function () { setOpen(false); }, open);
  /* Position the portal'd popover under the cell on open. Computed in
     useLayoutEffect so it lands in the right spot before paint, even
     after horizontal scroll. */
  useLayoutEffect(function () {
    if (!open || !ref.current) return;
    var r = ref.current.getBoundingClientRect();
    setPos({ top: r.bottom + 2, left: r.left });
  }, [open]);
  function commitTiers(nextTiers) {
    var nt = nextTiers.join(", ");
    var ch = { tier: nt };
    var s = tierToStatus(nt);
    if (s) ch.status = s;
    onUpdate(ch);
  }
  return (
    <div
      ref={ref}
      className="align-middle pr-4 py-1.5 whitespace-nowrap cursor-pointer"
      style={{ display: "table-cell", background: dark ? undefined : rowBgColor, minWidth: 160 }}
      onClick={function (e) { e.stopPropagation(); setOpen(function (o) { return !o; }); }}
    >
      <PortPicker noAdd stack passClicks active={tiers} onChange={commitTiers} plusColor="#334155" opts={TIER_ORDER} pillStyleFn={tierPillStyle} />
      {open && createPortal(
        <div
          ref={popRef}
          onClick={function (e) { e.stopPropagation(); }}
          /* position:fixed via portal — escapes the table's stacking
             contexts that were burying an in-row absolute popover
             behind subsequent rows' sticky cells. */
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-1.5 shadow-lg min-w-[160px] max-h-[260px] overflow-y-auto"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 1000 }}
        >
          <div className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 px-1 pb-0.5">Add Tier</div>
          <div className="flex flex-wrap gap-1">
            {TIER_ORDER.filter(function (t) { return tiers.indexOf(t) < 0; }).map(function (t) {
              var ps = tierPillStyle(t);
              return (
                <span
                  key={t}
                  onClick={function (e) {
                    e.stopPropagation();
                    var next = tiers.concat([t]).sort(function (a, b) { return TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b); });
                    commitTiers(next);
                    setOpen(false);
                  }}
                  className="text-[11px] px-1.5 py-0.5 rounded-full cursor-pointer font-medium"
                  style={{ background: ps.bg, color: ps.color }}
                >{t}</span>
              );
            })}
            {TIER_ORDER.filter(function (t) { return tiers.indexOf(t) < 0; }).length === 0 && (
              <span className="text-[10px] text-gray-400 dark:text-slate-500 italic px-1">all assigned</span>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* Click-to-edit Port? cell — mirrors TierCell. Clicking anywhere
   opens an Add-Port? popover with the portfolios that aren't already
   committed (the dashed "considering" list). Removing a pending entry
   still works via each pill's inline ×. Portal'd so it escapes the
   table's stacking contexts. */
function PortNoteCell({ company, dark, rowBgColor, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef();
  const popRef = useRef();
  useClickOutside(popRef, function () { setOpen(false); }, open);
  useLayoutEffect(function () {
    if (!open || !ref.current) return;
    var r = ref.current.getBoundingClientRect();
    /* Anchor to the cell's right edge so the popover doesn't slide
       off-screen — Port? is the rightmost column. */
    setPos({ top: r.bottom + 2, right: window.innerWidth - r.right });
  }, [open]);
  var portNote = (company.portNote || "").split(/[,\s]+/).filter(Boolean);
  var availPortNote = PORTFOLIOS.filter(function (pp) { return (company.portfolios || []).indexOf(pp) < 0; });
  var remaining = availPortNote.filter(function (p) { return portNote.indexOf(p) < 0; });
  return (
    <div
      ref={ref}
      className="align-middle pr-4 py-1.5 cursor-pointer"
      style={{ display: "table-cell", background: dark ? undefined : rowBgColor }}
      onClick={function (e) { e.stopPropagation(); setOpen(function (o) { return !o; }); }}
    >
      <PortPicker
        noAdd
        stack
        passClicks
        active={portNote}
        onChange={function (v) { onUpdate({ portNote: v.join(", ") }); }}
        plusColor={dark ? "#93c5fd" : "#1a3a6b"}
        opts={availPortNote}
        dashedPills
        pillStyleFn={function () { return { bg: "transparent", color: dark ? "#93c5fd" : "#1a3a6b" }; }}
      />
      {open && createPortal(
        <div
          ref={popRef}
          onClick={function (e) { e.stopPropagation(); }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-1.5 shadow-lg min-w-[140px]"
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 1000 }}
        >
          <div className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 px-1 pb-0.5">Add to Port?</div>
          <div className="flex flex-wrap gap-1">
            {remaining.map(function (p) {
              return (
                <span
                  key={p}
                  onClick={function (e) {
                    e.stopPropagation();
                    var next = portNote.concat([p]);
                    onUpdate({ portNote: next.join(", ") });
                    setOpen(false);
                  }}
                  className="text-[11px] px-1.5 py-0.5 rounded-full cursor-pointer font-medium bg-transparent"
                  style={{ border: "1px dashed " + (dark ? "#93c5fd" : "#1a3a6b"), color: dark ? "#93c5fd" : "#1a3a6b" }}
                >{p}</span>
              );
            })}
            {remaining.length === 0 && (
              <span className="text-[10px] text-gray-400 dark:text-slate-500 italic px-1">none available</span>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* Portfolio Overlap subtab. Extracted from App.jsx verbatim; original inline
   IIFE referenced parent-scope variables via closure, now explicit props +
   context. */
export function OverlapTable(props){
  const { overlapMode, setOverlapMode, overlapFilter, setOverlapFilter,
          setSelCo, setTab, setCoView, setSelCoOrigin } = props;
  const { companies, repData, fxRates, specialWeights, dark, updateCo, updateTargetWeight } = useCompanyContext();

var OVERLAP_ORDER=["FIN","IN","FGL","GL","EM","SC"];var OVERLAP_LABELS={"FIN":"FIN","IN":"IN","FGL":"FGL","GL":"GL","EM":"EM","SC":"SC"};var isRep=overlapMode==="rep";
/* Precompute rep weights per company per portfolio */
var repWts={};if(isRep){OVERLAP_ORDER.forEach(function(port){
  var portRep2=repData[port]||{};
  /* Build ticker-owner map: portfolio members claim first, then any other company */
  var owners={};
  companies.filter(function(c){return(c.portfolios||[]).indexOf(port)>=0;}).forEach(function(c){(c.tickers||[]).forEach(function(t){var tk=(t.ticker||"").toUpperCase();if(tk&&!owners[tk])owners[tk]=c.id;});});
  companies.filter(function(c){return(c.portfolios||[]).indexOf(port)<0;}).forEach(function(c){(c.tickers||[]).forEach(function(t){var tk=(t.ticker||"").toUpperCase();if(tk&&!owners[tk])owners[tk]=c.id;});});
  var total=0;
  companies.forEach(function(c){var seen2={};(c.tickers||[]).forEach(function(t){var tk=(t.ticker||"").toUpperCase();if(!tk||seen2[tk]||owners[tk]!==c.id)return;seen2[tk]=true;var shares=repShares(portRep2[tk]);if(shares&&t.price){var ccy=(t.currency||"USD").toUpperCase();var fx=ccy==="USD"?1:(fxRates[ccy]||0);if(fx>0)total+=shares*parseFloat(t.price)/fx;}});});
  total+=repShares(portRep2["CASH"])+repShares(portRep2["DIVACC"]);
  repWts[port]={};
  if(total>0){companies.forEach(function(c){var mv=0;var seen2={};(c.tickers||[]).forEach(function(t){var tk=(t.ticker||"").toUpperCase();if(!tk||seen2[tk]||owners[tk]!==c.id)return;seen2[tk]=true;var shares=repShares(portRep2[tk]);if(shares&&t.price){var ccy=(t.currency||"USD").toUpperCase();var fx=ccy==="USD"?1:(fxRates[ccy]||0);if(fx>0)mv+=shares*parseFloat(t.price)/fx;}});if(mv>0)repWts[port][c.id]=Math.round(mv/total*1000)/10;});var cashMV=repShares(portRep2["CASH"]);var divMV=repShares(portRep2["DIVACC"]);if(cashMV>0)repWts[port]["CASH"]=Math.round(cashMV/total*1000)/10;if(divMV>0)repWts[port]["DIVACC"]=Math.round(divMV/total*1000)/10;}
});}
function getVal(c,p){if(isRep){var rv=(repWts[p]||{})[c.id];return rv&&!isNaN(rv)?rv:0;}var tv=parseFloat((c.portWeights||{})[p]);return tv&&!isNaN(tv)?tv:0;}
var overlapCos=companies.filter(function(c){if(overlapFilter!=="All"){var fv=getVal(c,overlapFilter);if(!fv||isNaN(fv)||fv<=0)return false;}return OVERLAP_ORDER.some(function(p){return getVal(c,p)>0;});}).slice().sort(function(a,b){for(var i=0;i<OVERLAP_ORDER.length;i++){var p=OVERLAP_ORDER[i];var av=getVal(a,p);var bv=getVal(b,p);if(av!==bv)return bv-av;}return(a.name||"").localeCompare(b.name||"");});
var cashW=specialWeights["CASH"]||{};var divW=specialWeights["DIVACC"]||{};
/* Derived CASH target per port = max(0, 100 - sum(security targets) - DIVACC target).
   Single source of truth: the cash target is whatever's left after the
   security targets, never a separately-stored value that can drift from
   the column sum. Mirrors the construction the Portfolios cash bar uses
   so the two views can't disagree. */
var secSums={};OVERLAP_ORDER.forEach(function(p){var s=0;overlapCos.forEach(function(c){s+=getVal(c,p);});secSums[p]=s;});
var derivedCash={};OVERLAP_ORDER.forEach(function(p){var dv=parseFloat(divW[p])||0;derivedCash[p]=Math.max(0,Math.round((100-secSums[p]-dv)*10)/10);});
var colSums={};OVERLAP_ORDER.forEach(function(p){if(isRep){/* Rep % sums to exactly 100 by construction (all MVs divided by same total); show 100.0 when any data exists, avoiding rounding drift from summing pre-rounded row values */var hasData=Object.keys(repWts[p]||{}).length>0;colSums[p]=hasData?100.0:0;}else{var s=secSums[p]+derivedCash[p]+(parseFloat(divW[p])||0);colSums[p]=Math.round(s*10)/10;}});return(<div><div className="flex gap-2 mb-3 items-center flex-wrap"><span className="text-sm font-medium text-gray-900 dark:text-slate-100">Portfolio Overlap — {overlapCos.length} securities</span><div className="flex gap-1 ml-2">{[["target","Target %"],["rep","Rep %"]].map(function(m){return <button key={m[0]} onClick={function(){setOverlapMode(m[0]);}} className={"text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors "+(overlapMode===m[0]?"bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold":"border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{m[1]}</button>;})}</div><div className="flex gap-1 ml-2 items-center"><span className="text-[10px] text-gray-500 dark:text-slate-400 uppercase">Filter:</span>{["All"].concat(OVERLAP_ORDER).map(function(f){var label=f==="All"?"All":OVERLAP_LABELS[f]||f;return <button key={f} onClick={function(){setOverlapFilter(f);}} className={"text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors "+(overlapFilter===f?"bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-500 text-gray-900 dark:text-slate-100 font-semibold":"border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{label}</button>;})}</div><span className="text-[11px] text-gray-500 dark:text-slate-400">Cells highlighted <span className="px-1 rounded" style={{background:"rgba(220,38,38,0.18)",color:"#991b1b"}}>red</span> if higher than nearest non-blank above, <span className="px-1 rounded" style={{background:"rgba(22,101,52,0.18)",color:"#166534"}}>green</span> if lower than nearest non-blank below.</span></div><div style={{display:"table",width:"100%",borderCollapse:"separate",borderSpacing:"0 2px"}}><div style={{display:"table-row"}} className="bg-white dark:bg-slate-950">{[["Security"],["Tier(s)"],["FPE"],["MOS Live"],["MOS Fixed"]].concat(OVERLAP_ORDER.map(function(p){return [OVERLAP_LABELS[p]];})).concat([["Port?"]]).map(function(h,i){var isName=i===0;return <div key={i} className={"text-[10px] uppercase tracking-wide pb-1.5 pr-4 text-gray-500 dark:text-slate-400 font-semibold sticky top-0 bg-white dark:bg-slate-950 "+(isName?"left-0 z-20":"z-10")} style={{display:"table-cell"}}>{h[0]}</div>;})}</div>
{/* CASH row at top — three placeholder cells for FPE / MOS / MOS Fixed */}
<div style={{display:"table-row"}} className="bg-slate-50 dark:bg-slate-800"><div className="align-middle pr-4 py-1.5 text-sm font-semibold text-gray-900 dark:text-slate-100 sticky left-0 z-[5]" style={{display:"table-cell",background:dark?"#1e293b":"#f8fafc"}}>CASH</div><div className="align-middle pr-4 py-1.5" style={{display:"table-cell"}}>--</div><div className="align-middle pr-4 py-1.5" style={{display:"table-cell"}}>--</div><div className="align-middle pr-4 py-1.5" style={{display:"table-cell"}}>--</div><div className="align-middle pr-4 py-1.5" style={{display:"table-cell"}}>--</div>{OVERLAP_ORDER.map(function(p){var v=isRep?((repWts[p]||{})["CASH"]||0):(derivedCash[p]||0);return <div key={p} className="align-middle pr-4 py-1.5 text-sm text-gray-900 dark:text-slate-100" style={{display:"table-cell"}} title={!isRep?"Derived: 100% - sum(security targets)":undefined}>{v>0?v.toFixed(1)+"%":"--"}</div>;})}<div className="align-middle pr-4 py-1.5" style={{display:"table-cell"}}>--</div></div>
{/* DIVACC row at top — only in Rep mode */}
{isRep&&<div style={{display:"table-row"}} className="bg-slate-50 dark:bg-slate-800"><div className="align-middle pr-4 py-1.5 text-sm font-semibold text-gray-900 dark:text-slate-100 sticky left-0 z-[5]" style={{display:"table-cell",background:dark?"#1e293b":"#f8fafc"}}>DIVACC</div><div className="align-middle pr-4 py-1.5" style={{display:"table-cell"}}>--</div><div className="align-middle pr-4 py-1.5" style={{display:"table-cell"}}>--</div><div className="align-middle pr-4 py-1.5" style={{display:"table-cell"}}>--</div><div className="align-middle pr-4 py-1.5" style={{display:"table-cell"}}>--</div>{OVERLAP_ORDER.map(function(p){var v=(repWts[p]||{})["DIVACC"]||0;return <div key={p} className="align-middle pr-4 py-1.5 text-sm text-gray-900 dark:text-slate-100" style={{display:"table-cell"}}>{v>0?v.toFixed(1)+"%":"--"}</div>;})}<div className="align-middle pr-4 py-1.5" style={{display:"table-cell"}}>--</div></div>}
{overlapCos.map(function(c,rowIdx){var rowBgColor=tierBg(c.tier);var tiers=getTiers(c.tier);
/* Per-row valuation: MOS uses computed TP (PE × normalized EPS); MOS
   Fixed uses tpFixed when set. The amber dot fires when the two values
   differ by more than 10pp, mirroring the mos-divergence alert. */
var rowVal=c.valuation||{};
var rowEps=calcNormEPS(rowVal)||parseFloat(rowVal.eps);
var rowTp=calcTP(rowVal.pe,rowEps);
var rowMos=calcMOS(rowTp,rowVal.price);
var rowMosStyle=mosBg(rowMos);
var rowTpFixed=getTpFixed(rowVal);
var rowMosFixed=rowTpFixed!==null?calcMOS(rowTpFixed,rowVal.price):null;
var rowMosFixedStyle=mosBg(rowMosFixed);
var rowMosGap=(rowMos!==null&&rowMosFixed!==null)?Math.abs(rowMos-rowMosFixed):null;
var rowMosDiverges=rowMosGap!==null&&rowMosGap>10;
return(<div key={c.id} onClick={function(){setSelCoOrigin("portfolios");setSelCo(c);setTab("companies");setCoView("dashboard");}} className="hover:brightness-110 transition-all" style={{display:"table-row",cursor:"pointer"}}><div className="align-middle pr-4 py-1.5 text-sm font-medium text-gray-900 dark:text-slate-100 sticky left-0 z-[5]" style={{display:"table-cell",background:dark?"#020617":(rowBgColor||"#ffffff")}}><span title={c.name}>{truncName(c.name,15)}</span></div><TierCell tiers={tiers} dark={dark} rowBgColor={rowBgColor} onUpdate={function(ch){updateCo(c.id, ch);}}/>
{/* FPE Range mini */}
<div className="align-middle pr-4 py-1.5" style={{display:"table-cell",background:dark?undefined:rowBgColor}}>{(function(){var el=<FpeRangeMini valuation={rowVal} width={100}/>;return el||<span className="text-xs text-gray-400 dark:text-slate-500">--</span>;})()}</div>
{/* MOS */}
<div className="align-middle pr-4 py-1.5" style={{display:"table-cell",background:dark?undefined:rowBgColor}}>{rowMosStyle?<span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold" style={{background:rowMosStyle.bg,color:rowMosStyle.color}}>{fmtMOS0(rowMos)}</span>:<span className="text-xs text-gray-400 dark:text-slate-500">--</span>}</div>
{/* MOS Fixed (with amber divergence dot when |mos - mosFixed| > 10pp) */}
<div className="align-middle pr-4 py-1.5" style={{display:"table-cell",background:dark?undefined:rowBgColor}}>{rowMosFixedStyle?(<span className="inline-flex items-center gap-1 whitespace-nowrap"><span title={rowMosDiverges?"Diverges from MOS by "+rowMosGap.toFixed(1)+"pp — fixed TP may be stale":"MOS using fixed TP"} className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold" style={{background:rowMosFixedStyle.bg,color:rowMosFixedStyle.color}}>{fmtMOS0(rowMosFixed)}</span>{rowMosDiverges&&<span title={"Diverges from MOS by "+rowMosGap.toFixed(1)+"pp"} className="inline-block w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0"/>}</span>):<span className="text-xs text-gray-400 dark:text-slate-500">--</span>}</div>
{OVERLAP_ORDER.map(function(p,colIdx){
  var v=getVal(c,p);
  /* Find nearest non-blank row above */
  var pv=null;
  for(var k=rowIdx-1;k>=0;k--){var kv=getVal(overlapCos[k],p);if(kv>0){pv=kv;break;}}
  /* Find nearest non-blank row below */
  var nv=null;
  for(var k2=rowIdx+1;k2<overlapCos.length;k2++){var kv2=getVal(overlapCos[k2],p);if(kv2>0){nv=kv2;break;}}
  /* Inconsistency coloring — only meaningful on column 1+ (first
     portfolio column has no left neighbor to compare against). Red
     when this row's weight is higher than the nearest non-blank row
     above (cells violating monotonic order — the table is sorted so
     higher weights should appear earlier). Green when this row's
     weight is lower than the nearest non-blank row below. */
  var cellBg=dark?undefined:rowBgColor;
  var cellColor=undefined;
  var cellFontWeight=undefined;
  if(colIdx>0&&v>0){
    if(pv!==null&&v>pv){cellBg=dark?"rgba(220,38,38,0.35)":"rgba(220,38,38,0.25)";cellColor=dark?"#fca5a5":"#991b1b";cellFontWeight=600;}
    else if(nv!==null&&nv>0&&v<nv){cellBg=dark?"rgba(22,101,52,0.35)":"rgba(22,101,52,0.25)";cellColor=dark?"#86efac":"#166534";cellFontWeight=600;}
  }
  /* Target mode: editable. Rep mode: read-only (rep% is computed from
     market values + shares, not stored — can't be edited directly). */
  if (!isRep) {
    return (
      <EditableWeightCell
        key={p}
        value={v}
        onSubmit={function(newVal){ updateTargetWeight(c.id, p, newVal); }}
        displayClassName={cellColor ? "" : "text-gray-900 dark:text-slate-100"}
        cellStyle={{background:cellBg,color:cellColor,fontWeight:cellFontWeight}}
      />
    );
  }
  return <div key={p} className="align-middle pr-4 py-1.5 text-sm text-gray-900 dark:text-slate-100" style={{display:"table-cell",background:cellBg,color:cellColor,fontWeight:cellFontWeight}}>{v>0?v.toFixed(1)+"%":"--"}</div>;
})}<PortNoteCell company={c} dark={dark} rowBgColor={rowBgColor} onUpdate={function(ch){updateCo(c.id, ch);}}/></div>);})}
{/* TOTAL sum row — three blank cells for FPE / MOS / MOS Fixed */}
<div style={{display:"table-row"}} className="bg-white dark:bg-slate-950"><div className="align-middle pr-4 pt-2 pb-2 text-sm font-bold text-gray-900 dark:text-slate-100 border-t-2 border-slate-200 dark:border-slate-700 sticky left-0 z-[5]" style={{display:"table-cell",background:dark?"#020617":"#ffffff"}}>TOTAL</div><div className="align-middle pr-4 pt-2 pb-2 border-t-2 border-slate-200 dark:border-slate-700" style={{display:"table-cell"}}>--</div><div className="align-middle pr-4 pt-2 pb-2 border-t-2 border-slate-200 dark:border-slate-700" style={{display:"table-cell"}}>--</div><div className="align-middle pr-4 pt-2 pb-2 border-t-2 border-slate-200 dark:border-slate-700" style={{display:"table-cell"}}>--</div><div className="align-middle pr-4 pt-2 pb-2 border-t-2 border-slate-200 dark:border-slate-700" style={{display:"table-cell"}}>--</div>{OVERLAP_ORDER.map(function(p){var s=colSums[p];var isOk=Math.abs(s-100)<0.2;var isEmpty=s===0;return <div key={p} className="align-middle pr-4 pt-2 pb-2 text-sm font-bold border-t-2 border-slate-200 dark:border-slate-700" style={{display:"table-cell",color:isEmpty?"#94a3b8":isOk?(dark?"#4ade80":"#166534"):(dark?"#f87171":"#991b1b")}}>{isEmpty?"--":s.toFixed(1)+"%"}</div>;})}<div className="align-middle pr-4 pt-2 pb-2 border-t-2 border-slate-200 dark:border-slate-700" style={{display:"table-cell"}}>--</div></div>
</div>
{/* Overlap Matrices */}
{(function(){var OO=OVERLAP_ORDER;var OL=OVERLAP_LABELS;
/* Count holdings per portfolio */
var portCount={};OO.forEach(function(p){portCount[p]=companies.filter(function(c){return getVal(c,p)>0;}).length;});
/* Count overlap (both non-zero) */
function overlapCount(r,c2){return companies.filter(function(x){return getVal(x,r)>0&&getVal(x,c2)>0;}).length;}
/* Pct overlap: sum of row weights for companies also in col, div by total row weight */
function overlapPct(row,col){var totalRowW=0;var overlapW=0;companies.forEach(function(x){var rv=getVal(x,row);if(rv>0){totalRowW+=rv;if(getVal(x,col)>0)overlapW+=rv;}});return totalRowW>0?Math.round(overlapW/totalRowW*100):0;}
var totalUnique=companies.filter(function(c){return OO.some(function(p){return getVal(c,p)>0;});}).length;
var cellCls="px-3 py-1.5 text-xs text-center border border-slate-200 dark:border-slate-700";
var hdrCls="px-3 py-1.5 text-[10px] font-semibold uppercase text-center border border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800";
return(<div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
<div><div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2">Securities Overlap (# of Holdings)</div>
<table className="border-collapse text-sm"><thead><tr><td className={hdrCls}>{totalUnique}</td>{OO.map(function(p){return <td key={p} className={hdrCls}>{OL[p]}</td>;})}</tr></thead><tbody>{OO.map(function(row,ri){return(<tr key={row}><td className={hdrCls}>{OL[row]}</td>{OO.map(function(col,ci){if(ci>ri)return <td key={col} className={cellCls+" text-gray-300 dark:text-slate-600"} style={{display:"table-cell"}}></td>;var n=ci===ri?portCount[row]:overlapCount(row,col);var diag=ci===ri;return <td key={col} className={cellCls+(diag?" font-bold text-gray-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800":" text-gray-700 dark:text-slate-300")}>{n}</td>;})}</tr>);})}</tbody></table></div>
<div><div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2">Securities Overlap (% of Portfolio)</div>
<table className="border-collapse text-sm"><thead><tr><td className={hdrCls}></td>{OO.map(function(p){return <td key={p} className={hdrCls}>{OL[p]}</td>;})}</tr></thead><tbody>{OO.map(function(row){return(<tr key={row}><td className={hdrCls}>{OL[row]}</td>{OO.map(function(col){var pct=overlapPct(row,col);var diag=row===col;var intensity=pct>0?Math.min(pct/100,1):0;var bg=diag?undefined:"rgba(37,99,235,"+intensity*0.25+")";return <td key={col} className={cellCls+(diag?" font-bold text-gray-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800":" text-gray-700 dark:text-slate-300")} style={{background:bg}}>{pct}%</td>;})}</tr>);})}</tbody></table></div>
</div>);})()}
</div>);
}
