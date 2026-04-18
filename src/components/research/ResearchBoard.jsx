import { useState, useMemo } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { TEAM_MEMBERS, TEAM_COLORS } from '../../constants/index.js';
import { getTiers, truncName } from '../../utils/index.js';

/* Category config. Each category pulls watchlist names filtered by tier
   (F MC / W MC for GL+IN, F EM / W EM for EM, F SC / W SC for SC). */
const CATEGORIES = [
  { key:"gl", label:"GL", tiers:["F MC","W MC"] },
  { key:"in", label:"IN", tiers:["F MC","W MC"] },
  { key:"em", label:"EM", tiers:["F EM","W EM"] },
  { key:"sc", label:"SC", tiers:["F SC","W SC"] },
];
const SLOTS_PER_SECTION = 3;
const EXISTING_SLOTS = 5;
const REORG_SLOTS = 8;

const BTN_SM = "text-xs px-2 py-0.5 font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";

/* Compact cell — click to pick (or unpick) a company */
function Slot({ companyId, eligible, onChange, onOpenCompany }){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const co = companyId ? eligible.find(c=>c.id===companyId) || { id: companyId, name: "(unknown)", __missing:true } : null;
  /* Even if selected company isn't in `eligible` (e.g., portfolio changed after assignment), show it anyway */
  const matches = useMemo(function(){
    const needle = q.trim().toLowerCase();
    if(!needle) return eligible.slice(0, 30);
    return eligible.filter(c => (c.name||"").toLowerCase().includes(needle) || (c.ticker||"").toLowerCase().includes(needle)).slice(0, 30);
  }, [q, eligible]);

  if(co){
    return (
      <div className="inline-flex items-center gap-1 text-xs">
        <span onClick={function(){onOpenCompany(co);}} className="cursor-pointer hover:underline text-gray-900 dark:text-slate-100 font-medium" title={co.name||"(unknown)"}>{truncName(co.name||"(unknown)",15)}</span>
        <span onClick={function(){onChange(null);}} className="cursor-pointer text-red-500 dark:text-red-400 hover:text-red-700" title="Clear">×</span>
      </div>
    );
  }
  return (
    <div className="relative inline-block">
      <span onClick={function(){setOpen(true);}} className="text-xs text-gray-400 dark:text-slate-500 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400" title="Assign a company">+</span>
      {open && (
        <div className="absolute z-20 top-5 left-0 w-64 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-lg p-2">
          <input autoFocus value={q} onChange={function(e){setQ(e.target.value);}} onBlur={function(){setTimeout(function(){setOpen(false);},150);}} placeholder="Search…" className="w-full text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-1" />
          <div className="max-h-40 overflow-y-auto">
            {matches.length===0 && <div className="text-[11px] text-gray-400 dark:text-slate-500 px-1 py-0.5">no match</div>}
            {matches.map(function(c){
              return <div key={c.id} onMouseDown={function(){onChange(c.id);setOpen(false);setQ("");}} className="text-xs px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-900 dark:text-slate-100">
                {c.name}{c.ticker?<span className="text-gray-400 dark:text-slate-500 ml-1">{c.ticker}</span>:null}
              </div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ResearchBoard(props){
  const { setSelCo, setTab, setCoView, setSelCoOrigin } = props;
  const { companies, researchAssignments, setResearchSlot, setReorgSlot } = useCompanyContext();

  function openCompany(c){
    if(setSelCoOrigin) setSelCoOrigin("research");
    setSelCo(c); setTab("companies"); setCoView("section:Valuation");
  }

  /* Eligibility filters for each row type.
       Category rows → watchlist names whose tier set intersects the category's tiers.
       Existing Hlds → status === "Own".
       Reorgs → any company. */
  function eligibleFor(categoryKey){
    if(categoryKey==="reorgs") return companies;
    if(categoryKey==="existingHlds") return companies.filter(function(c){return c.status==="Own";});
    const cat = CATEGORIES.find(c=>c.key===categoryKey);
    if(!cat) return companies;
    return companies.filter(function(c){var ts=getTiers(c.tier);return ts.some(function(t){return cat.tiers.indexOf(t)>=0;});});
  }

  function getMemberSlot(member, categoryKey, type, pos){
    const mb = (researchAssignments.byMember||{})[member] || {};
    if(categoryKey==="existingHlds") return (mb.existingHlds||[])[pos] || null;
    const cat = mb[categoryKey] || {};
    return (cat[type]||[])[pos] || null;
  }

  /* Row label column width, cell min-width */
  const colLabel = "min-w-[120px] w-[120px] px-2 py-1 text-xs font-medium text-gray-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 align-top";
  const colMember = "min-w-[140px] px-2 py-1 text-xs border-b border-slate-200 dark:border-slate-700 align-top";
  const headerCell = "px-2 py-2 text-xs font-semibold text-center border-b-2 border-slate-300 dark:border-slate-600";
  const sectionHeader = "px-2 py-2 text-sm font-bold text-gray-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-600";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-base font-semibold text-gray-900 dark:text-slate-100">Research Priority List</div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className={headerCell + " text-left"}></th>
              {TEAM_MEMBERS.map(function(m){
                const color = (TEAM_COLORS||{})[m] || "#111";
                return <th key={m} className={headerCell} style={{color:color,textDecoration:"underline"}}>{m}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map(function(cat){
              return [
                <tr key={cat.key+"_header_p"}>
                  <td className={sectionHeader}>{cat.label} — Primary</td>
                  <td colSpan={TEAM_MEMBERS.length} className="border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800"></td>
                </tr>,
                ...Array.from({length:SLOTS_PER_SECTION}).map(function(_,pos){
                  return <tr key={cat.key+"_p_"+pos}>
                    <td className={colLabel}><span className="text-gray-400 dark:text-slate-500">{pos+1})</span></td>
                    {TEAM_MEMBERS.map(function(m){
                      const id = getMemberSlot(m, cat.key, "primary", pos);
                      return <td key={m} className={colMember}>
                        <Slot companyId={id} eligible={eligibleFor(cat.key)} onChange={function(cid){setResearchSlot(m,cat.key,"primary",pos,cid);}} onOpenCompany={openCompany}/>
                      </td>;
                    })}
                  </tr>;
                }),
                <tr key={cat.key+"_header_s"}>
                  <td className={sectionHeader + " pl-4 text-[13px] text-orange-700 dark:text-orange-400"}>Secondary</td>
                  <td colSpan={TEAM_MEMBERS.length} className="border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800"></td>
                </tr>,
                ...Array.from({length:SLOTS_PER_SECTION}).map(function(_,pos){
                  return <tr key={cat.key+"_s_"+pos}>
                    <td className={colLabel}><span className="text-gray-400 dark:text-slate-500 pl-2">{pos+1})</span></td>
                    {TEAM_MEMBERS.map(function(m){
                      const id = getMemberSlot(m, cat.key, "secondary", pos);
                      return <td key={m} className={colMember}>
                        <Slot companyId={id} eligible={eligibleFor(cat.key)} onChange={function(cid){setResearchSlot(m,cat.key,"secondary",pos,cid);}} onOpenCompany={openCompany}/>
                      </td>;
                    })}
                  </tr>;
                }),
              ];
            })}

            {/* Existing Holdings */}
            <tr>
              <td className={sectionHeader}>Existing Hlds <span className="text-[11px] font-normal text-gray-500 dark:text-slate-400 ml-1">(add or trim)</span></td>
              <td colSpan={TEAM_MEMBERS.length} className="border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800"></td>
            </tr>
            {Array.from({length:EXISTING_SLOTS}).map(function(_,pos){
              return <tr key={"eh_"+pos}>
                <td className={colLabel}><span className="text-gray-400 dark:text-slate-500">{pos+1})</span></td>
                {TEAM_MEMBERS.map(function(m){
                  const id = getMemberSlot(m, "existingHlds", null, pos);
                  return <td key={m} className={colMember}>
                    <Slot companyId={id} eligible={eligibleFor("existingHlds")} onChange={function(cid){setResearchSlot(m,"existingHlds",null,pos,cid);}} onOpenCompany={openCompany}/>
                  </td>;
                })}
              </tr>;
            })}

            {/* Reorgs — team-wide shared list */}
            <tr>
              <td className={sectionHeader}>Reorgs <span className="text-[11px] font-normal text-gray-500 dark:text-slate-400 ml-1">(team-wide)</span></td>
              <td colSpan={TEAM_MEMBERS.length} className="border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800"></td>
            </tr>
            <tr>
              <td className={colLabel + " align-top"}></td>
              <td colSpan={TEAM_MEMBERS.length} className="px-2 py-2 border-b border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-4 gap-x-4 gap-y-1">
                  {Array.from({length:REORG_SLOTS}).map(function(_,pos){
                    const id = (researchAssignments.reorgs||[])[pos] || null;
                    return <div key={"ro_"+pos} className="flex items-center gap-1">
                      <span className="text-[11px] text-gray-400 dark:text-slate-500 min-w-[16px]">{pos+1})</span>
                      <Slot companyId={id} eligible={eligibleFor("reorgs")} onChange={function(cid){setReorgSlot(pos,cid);}} onOpenCompany={openCompany}/>
                    </div>;
                  })}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
