import { useState, useMemo } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { PORTFOLIOS, PORT_NAMES } from '../../constants/index.js';
import { repShares } from '../../utils/index.js';
import { currentMonthKey, portfolioMtd } from '../../utils/performance.js';
import { PerformanceChart, seriesColor } from './PerformanceChart.jsx';
import { PerformanceTable } from './PerformanceTable.jsx';

const TABST_ACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-blue-600 text-gray-900 dark:text-slate-100 font-semibold cursor-pointer bg-transparent";
const TABST_INACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-transparent text-gray-500 dark:text-slate-400 cursor-pointer bg-transparent hover:text-gray-700 dark:hover:text-slate-300";
const BTN_SM = "text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
const INP = "text-sm px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none";
const LABEL = "text-[11px] text-gray-500 dark:text-slate-400 block mb-1";

/* Grouped subtabs: benchmarks/competitors are shared across Focus + Standard
   for Int'l (FIN+IN) and Global (FGL+GL). Each group merges its component
   portfolios' series at display time. EM and SC stand alone. */
const GROUPS = [
  { key: "intl",   label: "Int'l",  portfolios: ["FIN","IN"] },
  { key: "global", label: "Global", portfolios: ["FGL","GL"] },
  { key: "em",     label: "EM",     portfolios: ["EM"] },
  { key: "sc",     label: "SC",     portfolios: ["SC"] },
];

export function PerformanceTab(){
  const { companies, repData, fxRates, perfData, setPerfSeries, addPerfSeries, removePerfSeries, setPerfReturn, setPerfLastMonthEMV, dark } = useCompanyContext();
  const [groupKey, setGroupKey] = useState("intl");
  const [hiddenSeries, setHiddenSeries] = useState({}); /* {groupKey: Set(name)} */
  const [includeMtd, setIncludeMtd] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPort, setEditingPort] = useState(null); /* which portfolio's editor is open within a group */

  const group = GROUPS.find(function(g){return g.key===groupKey;}) || GROUPS[0];
  const curMonth = currentMonthKey();

  /* Compute currentMV for a given portfolio from rep data (same logic as PortfoliosTable). */
  function computeCurrentMV(portTab){
    var portCos = companies.filter(function(c){return(c.portfolios||[]).indexOf(portTab)>=0;});
    var owners = {};
    portCos.forEach(function(c){(c.tickers||[]).forEach(function(t){var tk=(t.ticker||"").toUpperCase();if(tk&&!owners[tk])owners[tk]=c.id;});});
    companies.filter(function(c){return(c.portfolios||[]).indexOf(portTab)<0;}).forEach(function(c){(c.tickers||[]).forEach(function(t){var tk=(t.ticker||"").toUpperCase();if(tk&&!owners[tk])owners[tk]=c.id;});});
    var portRep = repData[portTab] || {};
    var total = 0;
    companies.forEach(function(c){
      var seen={};(c.tickers||[]).forEach(function(t){
        var tk=(t.ticker||"").toUpperCase();if(!tk||seen[tk]||owners[tk]!==c.id)return;seen[tk]=true;
        var shares=repShares(portRep[tk]);
        if(shares&&t.price){
          var ccy=(t.currency||"USD").toUpperCase();var fx=ccy==="USD"?1:(fxRates[ccy]||0);
          if(fx>0)total+=shares*parseFloat(t.price)/fx;
        }
      });
    });
    total+=repShares(portRep["CASH"])+repShares(portRep["DIVACC"]);
    return total;
  }

  /* Per-portfolio current MVs for portfolios in this group. */
  const currentMVs = useMemo(function(){
    var out={};group.portfolios.forEach(function(p){out[p]=computeCurrentMV(p);});
    return out;
  }, [companies,repData,fxRates,group.key]);

  /* Merge series across the group's portfolios. Dedupe by name: first-seen wins.
     Portfolio-role series get their auto-MTD injected for current month. */
  const { mergedSeries, portfolioEmvs } = useMemo(function(){
    var byName = {};
    var portEmvs = {};
    group.portfolios.forEach(function(p){
      var port = perfData[p];
      if(!port)return;
      portEmvs[p] = port.lastMonthEMV || 0;
      var autoMtd = portfolioMtd(currentMVs[p], port.lastMonthEMV);
      (port.series||[]).forEach(function(s){
        if(byName[s.name])return; /* dedupe */
        var copy = Object.assign({}, s, { returns: Object.assign({}, s.returns||{}), _sourcePortfolio: p });
        if(s.role==="portfolio" && autoMtd!==null && (copy.returns[curMonth]===undefined||copy.returns[curMonth]===null)){
          copy.returns[curMonth] = autoMtd;
        }
        byName[s.name] = copy;
      });
    });
    return { mergedSeries: Object.keys(byName).map(function(n){return byName[n];}), portfolioEmvs: portEmvs };
  },[perfData, group.key, currentMVs, curMonth]);

  const colorMap = useMemo(function(){
    var m={};var b=0,c=0;
    (mergedSeries||[]).forEach(function(s){
      m[s.name]=seriesColor(s,b,c);
      if(s.role==="benchmark")b++;else if(s.role==="competitor")c++;
    });
    return m;
  },[mergedSeries]);

  const hidden = hiddenSeries[groupKey] || new Set();
  const visibleSet = useMemo(function(){
    var v=new Set();mergedSeries.forEach(function(s){if(!hidden.has(s.name))v.add(s.name);});
    return v;
  },[mergedSeries,hidden]);

  function toggleSeries(name){
    setHiddenSeries(function(prev){
      var h=new Set(prev[groupKey]||[]);if(h.has(name))h.delete(name);else h.add(name);
      return Object.assign({},prev,{[groupKey]:h});
    });
  }

  const isMulti = group.portfolios.length>1;
  const activeEditPort = editingPort || group.portfolios[0];

  return (
    <div>
      {/* Group subtabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap border-b border-slate-200 dark:border-slate-700 pb-2.5">
        {GROUPS.map(function(g){
          return <button key={g.key} className={groupKey===g.key?TABST_ACTIVE:TABST_INACTIVE} onClick={function(){setGroupKey(g.key);setEditingPort(null);}}>{g.label}</button>;
        })}
      </div>

      {/* Header row: title + controls */}
      <div className="flex gap-3 items-center flex-wrap mb-3">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
          {group.label} — Rolling 3-Year Annualized Return
          {isMulti && <span className="ml-2 text-[11px] text-gray-500 dark:text-slate-400 font-normal">({group.portfolios.map(function(p){return PORT_NAMES[p]||p;}).join(" + ")})</span>}
        </div>
        <label className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={includeMtd} onChange={function(e){setIncludeMtd(e.target.checked);}} className="accent-blue-600"/>
          Include MTD in all trailing periods
        </label>
        <button onClick={function(){setShowEditor(function(v){return !v;});}} className={BTN_SM + " ml-auto"}>{showEditor?"Hide series editor":"Edit series"}</button>
      </div>

      {/* Series legend / toggles */}
      {mergedSeries.length>0 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {mergedSeries.map(function(s){
            var on=visibleSet.has(s.name);
            return <span key={s.name} onClick={function(){toggleSeries(s.name);}} className={"text-[11px] px-2 py-0.5 rounded-full cursor-pointer border transition-colors " + (on?"font-semibold":"font-normal opacity-50")} style={on?{borderColor:colorMap[s.name],background:colorMap[s.name]+"22",color:colorMap[s.name]}:{borderColor:"#cbd5e1"}}>
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{background:colorMap[s.name]}}/>{s.name}
            </span>;
          })}
        </div>
      )}

      {/* Series editor */}
      {showEditor && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 mb-3">
          {isMulti && (
            <div className="flex gap-2 items-center mb-3">
              <label className="text-[11px] text-gray-500 dark:text-slate-400">Editing portfolio:</label>
              {group.portfolios.map(function(p){
                var active=(editingPort||group.portfolios[0])===p;
                return <span key={p} onClick={function(){setEditingPort(p);}} className={"text-[11px] px-2 py-0.5 rounded-full cursor-pointer border transition-colors "+(active?"bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold":"border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400")}>{PORT_NAMES[p]||p}</span>;
              })}
              <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">edits affect the selected portfolio's stored data</span>
            </div>
          )}
          {(function(){
            var p=activeEditPort;
            var port=perfData[p]||{series:[],lastMonthEMV:0};
            var autoMtdValue=portfolioMtd(currentMVs[p], port.lastMonthEMV);
            return (
              <>
                <div className="flex gap-3 items-center flex-wrap mb-2">
                  <div>
                    <label className={LABEL}>{PORT_NAMES[p]||p} last month EMV</label>
                    <input type="number" step="0.01" defaultValue={port.lastMonthEMV||""} key={p+"-emv-"+port.lastMonthEMV} onBlur={function(e){setPerfLastMonthEMV(p,e.target.value);}} placeholder="e.g. 12500000" className={INP+" !text-xs w-40"}/>
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-slate-400 pt-4">
                    Current MV (from rep): <span className="font-mono text-gray-900 dark:text-slate-100">{(currentMVs[p]||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                    {autoMtdValue!==null && <> &nbsp;→ auto MTD: <span className="font-mono font-semibold" style={{color:autoMtdValue>=0?"#166534":"#991b1b"}}>{(autoMtdValue>=0?"+":"")+(autoMtdValue*100).toFixed(2)+"%"}</span></>}
                  </div>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">Series (name / role / ticker). MTD for benchmarks & competitors is their entry in the current month ({curMonth}).</div>
                <div className="space-y-1.5">
                  {(port.series||[]).map(function(s,i){
                    var curMtdVal=(s.returns||{})[curMonth];
                    return (
                      <div key={i} className="flex gap-2 items-center flex-wrap text-xs">
                        <input defaultValue={s.name} key={p+"-sn-"+i+"-"+s.name} onBlur={function(e){setPerfSeries(p,i,{name:e.target.value.trim()||s.name});}} className={INP+" !text-xs w-48"} placeholder="Series name"/>
                        <select value={s.role||"competitor"} onChange={function(e){setPerfSeries(p,i,{role:e.target.value});}} className={INP+" !text-xs"}>
                          <option value="portfolio">Portfolio</option>
                          <option value="benchmark">Benchmark</option>
                          <option value="competitor">Competitor</option>
                        </select>
                        <input defaultValue={s.ticker||""} key={p+"-st-"+i+"-"+(s.ticker||"")} onBlur={function(e){setPerfSeries(p,i,{ticker:e.target.value.trim().toUpperCase()});}} className={INP+" !text-xs w-24"} placeholder="Ticker"/>
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">MTD ({curMonth}):</span>
                        {s.role==="portfolio"
                          ? <span className="text-[11px] text-gray-500 dark:text-slate-400 italic">auto</span>
                          : <input type="number" step="0.0001" defaultValue={curMtdVal!==undefined&&curMtdVal!==null?curMtdVal:""} key={p+"-mtd-"+i+"-"+curMtdVal} onBlur={function(e){setPerfReturn(p,i,curMonth,e.target.value);}} placeholder="0.0123" className={INP+" !text-xs w-24"}/>
                        }
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">({Object.keys(s.returns||{}).length} months)</span>
                        <button onClick={function(){if(confirm('Delete series "'+s.name+'" from '+p+'? This removes all its monthly returns in that portfolio.')){removePerfSeries(p,i);}}} className="text-[11px] text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700 ml-auto">×</button>
                      </div>
                    );
                  })}
                  <button onClick={function(){addPerfSeries(p);}} className={BTN_SM+" mt-2"}>+ Add series to {PORT_NAMES[p]||p}</button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Chart */}
      <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 p-3 mb-4">
        <PerformanceChart series={mergedSeries} visibleSet={visibleSet} dark={dark}/>
      </div>

      {/* Trailing returns table */}
      <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
        <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Trailing period returns · {includeMtd?"including MTD (through "+curMonth+")":"excluding MTD (through last completed month)"}</div>
        <PerformanceTable series={mergedSeries.filter(function(s){return visibleSet.has(s.name);})} currentMonth={curMonth} includeMtd={includeMtd} colorMap={colorMap}/>
      </div>

      {mergedSeries.length===0 && (
        <div className="text-xs text-gray-500 dark:text-slate-400 italic mt-3 text-center">
          No data yet for {group.label}. Go to <b>Data Hub → Performance</b> to paste monthly returns.
        </div>
      )}
    </div>
  );
}
