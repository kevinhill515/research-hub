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

/* Disposition options for clearing a slot. The keys are stored verbatim
   in researchLog entries; the labels render in the dialog + the log
   table. "other" exists so a user with a non-standard outcome can still
   log + keep auditability. */
const DISPOSITIONS = [
  { key: "added",     label: "Added to portfolio" },
  { key: "watchlist", label: "Kept on watchlist" },
  { key: "removed",   label: "Removed from coverage" },
  { key: "other",     label: "Other" },
];
const DISPOSITION_LABEL = DISPOSITIONS.reduce(function(acc, d){ acc[d.key] = d.label; return acc; }, {});
const DISPOSITION_STYLE = {
  added:     { bg: "#dcfce7", color: "#166534" },
  watchlist: { bg: "#fef9c3", color: "#854d0e" },
  removed:   { bg: "#fee2e2", color: "#991b1b" },
  other:     { bg: "#e2e8f0", color: "#334155" },
};

/* Disposition popover — captures what happened to the cleared name
   and writes a researchLog entry. "Clear without logging" exists for
   the typo/reassignment case where no real disposition occurred. */
function DispositionDialog({ company, member, category, onLog, onClearSilent, onCancel }) {
  const [disposition, setDisposition] = useState("added");
  const [note, setNote] = useState("");
  return (
    <div
      onMouseDown={function(e){ e.stopPropagation(); }}
      onClick={function(e){ e.stopPropagation(); }}
      className="absolute z-30 top-5 left-0 w-72 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-lg p-2.5"
    >
      <div className="text-[11px] font-semibold text-gray-700 dark:text-slate-200 mb-1">
        What happened to <span className="text-blue-700 dark:text-blue-300">{truncName(company.name || "(unknown)", 24)}</span>?
      </div>
      <div className="flex flex-col gap-0.5 mb-2">
        {DISPOSITIONS.map(function(d){
          var active = disposition === d.key;
          var ps = DISPOSITION_STYLE[d.key] || {};
          return (
            <label key={d.key} className="flex items-center gap-1.5 text-[11px] cursor-pointer text-gray-900 dark:text-slate-100">
              <input type="radio" checked={active} onChange={function(){setDisposition(d.key);}} className="cursor-pointer"/>
              <span className="px-1.5 py-0 rounded-full text-[10px] font-medium" style={{ background: ps.bg, color: ps.color }}>{d.label}</span>
            </label>
          );
        })}
      </div>
      <input
        value={note}
        onChange={function(e){ setNote(e.target.value); }}
        placeholder="Optional note…"
        className="w-full text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 mb-2"
      />
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={function(){ onLog(disposition, note); }}
          className="text-[11px] px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
        >Log &amp; clear</button>
        <span
          onClick={onClearSilent}
          className="text-[10px] text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 cursor-pointer"
        >Clear without logging</span>
        <span
          onClick={onCancel}
          className="text-[10px] text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 cursor-pointer ml-auto"
        >Cancel</span>
      </div>
    </div>
  );
}

const BTN_SM = "text-xs px-2 py-0.5 font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";

/* Compact cell — click name to open the company, click × to open the
   disposition dialog. The disposition dialog can either log+clear or
   clear silently (typo / reassign). */
function Slot({ companyId, eligible, allCompanies, onChange, onOpenCompany, onLogDisposition, member, categoryKey }){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dispOpen, setDispOpen] = useState(false);
  /* Display lookup falls back to the FULL companies array before
     showing "(unknown)". `eligible` is the pickable set for NEW
     assignments (filtered by tier per category) — but a company
     that's been assigned still has a name even after its tier moved
     it out of that filter. Without this fallback, Bravida (Focus SC
     → SC4 after being added to the portfolio) rendered as "(unknown)"
     on Bob's assignment row. */
  const co = companyId
    ? (eligible.find(c=>c.id===companyId)
        || (allCompanies || []).find(c=>c.id===companyId)
        || { id: companyId, name: "(unknown)", __missing:true })
    : null;
  const matches = useMemo(function(){
    const needle = q.trim().toLowerCase();
    if(!needle) return eligible.slice(0, 30);
    return eligible.filter(c => (c.name||"").toLowerCase().includes(needle) || (c.ticker||"").toLowerCase().includes(needle)).slice(0, 30);
  }, [q, eligible]);

  if(co){
    return (
      <div className="inline-flex items-center gap-1 text-xs relative">
        <span onClick={function(){onOpenCompany(co);}} className="cursor-pointer hover:underline text-gray-900 dark:text-slate-100 font-medium" title={co.name||"(unknown)"}>{truncName(co.name||"(unknown)",15)}</span>
        <span
          onClick={function(){ setDispOpen(true); }}
          className="cursor-pointer text-red-500 dark:text-red-400 hover:text-red-700"
          title="Log disposition + clear"
        >×</span>
        {dispOpen && (
          <DispositionDialog
            company={co}
            member={member}
            category={categoryKey}
            onLog={function(disposition, note){
              onLogDisposition({
                member: member,
                category: categoryKey,
                companyId: co.id,
                companyName: co.name || "(unknown)",
                disposition: disposition,
                note: note,
              });
              onChange(null);
              setDispOpen(false);
            }}
            onClearSilent={function(){
              onChange(null);
              setDispOpen(false);
            }}
            onCancel={function(){ setDispOpen(false); }}
          />
        )}
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
  const { companies, researchAssignments, setResearchSlot, setReorgSlot, researchLog, addResearchLog, deleteResearchLog } = useCompanyContext();

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
                        <Slot
                          companyId={id}
                          eligible={eligibleFor(cat.key)}
                          allCompanies={companies}
                          onChange={function(cid){setResearchSlot(m,cat.key,"primary",pos,cid);}}
                          onOpenCompany={openCompany}
                          onLogDisposition={addResearchLog}
                          member={m}
                          categoryKey={cat.label + " Primary"}
                        />
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
                        <Slot
                          companyId={id}
                          eligible={eligibleFor(cat.key)}
                          allCompanies={companies}
                          onChange={function(cid){setResearchSlot(m,cat.key,"secondary",pos,cid);}}
                          onOpenCompany={openCompany}
                          onLogDisposition={addResearchLog}
                          member={m}
                          categoryKey={cat.label + " Secondary"}
                        />
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
                    <Slot
                      companyId={id}
                      eligible={eligibleFor("existingHlds")}
                      allCompanies={companies}
                      onChange={function(cid){setResearchSlot(m,"existingHlds",null,pos,cid);}}
                      onOpenCompany={openCompany}
                      onLogDisposition={addResearchLog}
                      member={m}
                      categoryKey={"Existing Hlds"}
                    />
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
                      <Slot
                        companyId={id}
                        eligible={eligibleFor("reorgs")}
                        allCompanies={companies}
                        onChange={function(cid){setReorgSlot(pos,cid);}}
                        onOpenCompany={openCompany}
                        onLogDisposition={addResearchLog}
                        member={""}
                        categoryKey={"Reorgs"}
                      />
                    </div>;
                  })}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Disposition log — what's happened to cleared assignments
          recently. Click × on any row to remove it from the log if
          it was a mistake. */}
      {(researchLog || []).length > 0 && (
        <div className="mt-5">
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1.5">Recent dispositions</div>
          <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">
            What happened to each cleared assignment. Most recent first.
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Date</th>
                  <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Who</th>
                  <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Member · Category</th>
                  <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Company</th>
                  <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Outcome</th>
                  <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Note</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {researchLog.map(function(e){
                  var ps = DISPOSITION_STYLE[e.disposition] || DISPOSITION_STYLE.other;
                  var memberColor = (TEAM_COLORS || {})[e.member] || "#94a3b8";
                  return (
                    <tr key={e.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-2 py-1 tabular-nums whitespace-nowrap text-gray-700 dark:text-slate-300">{e.date}</td>
                      <td className="px-2 py-1 whitespace-nowrap text-gray-700 dark:text-slate-300">{e.loggedBy}</td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        <span style={{ color: memberColor, fontWeight: 600 }}>{e.member || "—"}</span>
                        <span className="text-gray-400 dark:text-slate-500"> · </span>
                        <span className="text-gray-700 dark:text-slate-300">{e.category || "—"}</span>
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap text-gray-900 dark:text-slate-100 font-medium">{e.companyName || "(unknown)"}</td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        <span className="text-[10px] px-1.5 py-0 rounded-full font-medium" style={{ background: ps.bg, color: ps.color }}>
                          {DISPOSITION_LABEL[e.disposition] || e.disposition}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-gray-700 dark:text-slate-300">{e.note || ""}</td>
                      <td className="px-2 py-1 text-right">
                        <span
                          onClick={function(){ if(window.confirm("Delete this log entry? This cannot be undone.")) deleteResearchLog(e.id); }}
                          className="text-[10px] text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700 dark:hover:text-red-300"
                          title="Remove this log entry"
                        >×</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
