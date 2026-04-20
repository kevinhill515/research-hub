import { useState, useMemo } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { PORTFOLIOS, PORT_NAMES } from '../../constants/index.js';
import { repShares } from '../../utils/index.js';
import { currentMonthKey, portfolioMtd, rollingAnnualized, allMonths } from '../../utils/performance.js';
import { PerformanceChart, seriesColor } from './PerformanceChart.jsx';
import { PerformanceTable } from './PerformanceTable.jsx';
import { RiskSummaryTable } from './RiskSummaryTable.jsx';

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
  const { companies, repData, fxRates, perfData, setPerfSeries, addPerfSeries, removePerfSeries, movePerfSeries, setPerfSeriesOrder, setPerfReturn, setPerfLastMonthEMV, dark } = useCompanyContext();
  const [groupKey, setGroupKey] = useState("intl");
  const [hiddenSeries, setHiddenSeries] = useState({}); /* {groupKey: Set(name)} */
  const [includeMtd, setIncludeMtd] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [rollingYears, setRollingYears] = useState(3); /* 1, 3, or 5 */

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
     Portfolio-role series get their auto-MTD injected for current month.
     Display order follows the PRIMARY portfolio's seriesOrder override when
     present, with any extras appended in insertion order. */
  const { mergedSeries, portfolioEmvs } = useMemo(function(){
    var byName = {};
    var portEmvs = {};
    var insertionOrder = [];
    group.portfolios.forEach(function(p){
      var port = perfData[p];
      if(!port)return;
      portEmvs[p] = port.lastMonthEMV || 0;
      var autoMtd = portfolioMtd(currentMVs[p], port.lastMonthEMV);
      (port.series||[]).forEach(function(s){
        if(byName[s.name])return;
        var copy = Object.assign({}, s, { returns: Object.assign({}, s.returns||{}), _sourcePortfolio: p });
        if(s.role==="portfolio" && autoMtd!==null && (copy.returns[curMonth]===undefined||copy.returns[curMonth]===null)){
          copy.returns[curMonth] = autoMtd;
        }
        byName[s.name] = copy;
        insertionOrder.push(s.name);
      });
    });
    var primary = perfData[group.portfolios[0]];
    var savedOrder = (primary && primary.seriesOrder) || [];
    var finalOrder = [];
    savedOrder.forEach(function(n){if(byName[n]&&finalOrder.indexOf(n)<0)finalOrder.push(n);});
    insertionOrder.forEach(function(n){if(finalOrder.indexOf(n)<0)finalOrder.push(n);});
    return { mergedSeries: finalOrder.map(function(n){return byName[n];}), portfolioEmvs: portEmvs };
  },[perfData, group.key, currentMVs, curMonth]);

  /* Swap positions in the group's displayed order (writes to primary's seriesOrder). */
  function moveInGroup(fromIdx, toIdx){
    if(fromIdx===toIdx)return;
    if(fromIdx<0||fromIdx>=mergedSeries.length)return;
    if(toIdx<0||toIdx>=mergedSeries.length)return;
    var names = mergedSeries.map(function(s){return s.name;});
    var moved = names.splice(fromIdx,1)[0];
    names.splice(toIdx,0,moved);
    setPerfSeriesOrder(group.portfolios[0], names);
  }

  const colorMap = useMemo(function(){
    var m={};var b=0,c=0;
    (mergedSeries||[]).forEach(function(s){
      m[s.name]=seriesColor(s,b,c);
      if(s.role==="benchmark")b++;else if(s.role==="competitor")c++;
    });
    return m;
  },[mergedSeries]);

  /* Current (latest) rolling-window annualized per series — shown next to each
     series name on the legend. Tracks the rollingYears toggle. */
  const latestRolling = useMemo(function(){
    var months = allMonths(mergedSeries);
    var out = {};
    mergedSeries.forEach(function(s){
      var pts = rollingAnnualized(s, months, rollingYears);
      out[s.name] = pts.length ? pts[pts.length-1].value : null;
    });
    return out;
  },[mergedSeries, rollingYears]);

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

  return (
    <div>
      {/* Group subtabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap border-b border-slate-200 dark:border-slate-700 pb-2.5">
        {GROUPS.map(function(g){
          return <button key={g.key} className={groupKey===g.key?TABST_ACTIVE:TABST_INACTIVE} onClick={function(){setGroupKey(g.key);}}>{g.label}</button>;
        })}
      </div>

      {/* Header row: title + controls */}
      <div className="flex gap-3 items-center flex-wrap mb-3">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
          {group.label} — Rolling {rollingYears}-Year Annualized Return
        </div>
        <div className="flex gap-1">
          {[1,3,5].map(function(y){
            var active=rollingYears===y;
            return <button key={y} onClick={function(){setRollingYears(y);}} className={"text-[11px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors "+(active?"bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold":"border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{y}Y</button>;
          })}
        </div>
        <label className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={includeMtd} onChange={function(e){setIncludeMtd(e.target.checked);}} className="accent-blue-600"/>
          Include MTD in all trailing periods
        </label>
        <button onClick={function(){setShowEditor(function(v){return !v;});}} className={BTN_SM + " ml-auto"}>{showEditor?"Hide series editor":"Edit series"}</button>
      </div>

      {/* Series legend / toggles — each chip shows the current (latest)
          rolling 3Y annualized return next to the name. */}
      {mergedSeries.length>0 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {mergedSeries.map(function(s){
            var on=visibleSet.has(s.name);
            var v=latestRolling[s.name];
            var pct=(v===null||v===undefined||isNaN(v))?null:v*100;
            return <span key={s.name} onClick={function(){toggleSeries(s.name);}} className={"text-[11px] px-2 py-0.5 rounded-full cursor-pointer border transition-colors " + (on?"font-semibold":"font-normal opacity-50")} style={on?{borderColor:colorMap[s.name],background:colorMap[s.name]+"22",color:colorMap[s.name]}:{borderColor:"#cbd5e1"}}>
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{background:colorMap[s.name]}}/>{s.name}
              {pct!==null && <span className="ml-1.5 font-mono">{(pct>=0?"+":"")+pct.toFixed(1)+"%"}</span>}
            </span>;
          })}
        </div>
      )}

      {/* Series editor — unified view. Each series row knows which underlying
          portfolio stores it (from the merge step); edits route there. */}
      {showEditor && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 mb-3">
          {/* EMV row(s): one per underlying portfolio in the group. Each
              portfolio maintains its own last-month EMV + current MV, and its
              own auto-MTD. */}
          <div className="flex gap-4 flex-wrap mb-3">
            {group.portfolios.map(function(p){
              var port=perfData[p]||{series:[],lastMonthEMV:0};
              var autoMtdValue=portfolioMtd(currentMVs[p], port.lastMonthEMV);
              return (
                <div key={p} className="flex items-end gap-2">
                  <div>
                    <label className={LABEL}>{isMulti?PORT_NAMES[p]||p:""} Last month EMV</label>
                    <input type="number" step="0.01" defaultValue={port.lastMonthEMV||""} key={p+"-emv-"+port.lastMonthEMV} onBlur={function(e){setPerfLastMonthEMV(p,e.target.value);}} placeholder="e.g. 12500000" className={INP+" !text-xs w-40"}/>
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-slate-400 pb-1.5">
                    MV {(currentMVs[p]||0).toLocaleString(undefined,{maximumFractionDigits:0})}
                    {autoMtdValue!==null && <> · <span className="font-mono font-semibold" style={{color:autoMtdValue>=0?"#166534":"#991b1b"}}>{(autoMtdValue>=0?"+":"")+(autoMtdValue*100).toFixed(2)+"%"}</span> MTD</>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">Series (name / role / ticker). MTD for benchmarks &amp; competitors is their entry in the current month ({curMonth}). New series land in {PORT_NAMES[group.portfolios[0]]||group.portfolios[0]}; shared series (same name in both portfolios) edit-in-place there.</div>
          <div className="space-y-1.5">
            {mergedSeries.map(function(s,i,arr){
              var p=s._sourcePortfolio;
              var port=perfData[p]||{series:[]};
              var idx=(port.series||[]).findIndex(function(x){return x.name===s.name;});
              if(idx<0)return null; /* shouldn't happen */
              var stored=port.series[idx];
              var curMtdVal=(stored.returns||{})[curMonth];
              return (
                <div key={s.name+"-"+i} className="flex gap-2 items-center flex-wrap text-xs">
                  <span className="inline-flex flex-col leading-none text-[10px] text-gray-400 dark:text-slate-500 select-none">
                    <button type="button" disabled={i===0} onClick={function(){moveInGroup(i,i-1);}} className={"px-1 py-0 cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 "+(i===0?"opacity-30 cursor-not-allowed":"")} title="Move up">{"\u25B2"}</button>
                    <button type="button" disabled={i===arr.length-1} onClick={function(){moveInGroup(i,i+1);}} className={"px-1 py-0 cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 "+(i===arr.length-1?"opacity-30 cursor-not-allowed":"")} title="Move down">{"\u25BC"}</button>
                  </span>
                  <input defaultValue={stored.name} key={p+"-sn-"+idx+"-"+stored.name} onBlur={function(e){setPerfSeries(p,idx,{name:e.target.value.trim()||stored.name});}} className={INP+" !text-xs w-48"} placeholder="Series name"/>
                  <select value={stored.role||"competitor"} onChange={function(e){setPerfSeries(p,idx,{role:e.target.value});}} className={INP+" !text-xs"}>
                    <option value="portfolio">Portfolio</option>
                    <option value="benchmark">Benchmark</option>
                    <option value="competitor">Competitor</option>
                  </select>
                  <input defaultValue={stored.ticker||""} key={p+"-st-"+idx+"-"+(stored.ticker||"")} onBlur={function(e){setPerfSeries(p,idx,{ticker:e.target.value.trim().toUpperCase()});}} className={INP+" !text-xs w-24"} placeholder="Ticker"/>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400">MTD ({curMonth}):</span>
                  {stored.role==="portfolio"
                    ? <span className="text-[11px] text-gray-500 dark:text-slate-400 italic">auto</span>
                    : <input type="number" step="0.0001" defaultValue={curMtdVal!==undefined&&curMtdVal!==null?curMtdVal:""} key={p+"-mtd-"+idx+"-"+curMtdVal} onBlur={function(e){setPerfReturn(p,idx,curMonth,e.target.value);}} placeholder="0.0123" className={INP+" !text-xs w-24"}/>
                  }
                  <span className="text-[10px] text-gray-500 dark:text-slate-400">({Object.keys(stored.returns||{}).length} months)</span>
                  <button onClick={function(){if(confirm('Delete series "'+stored.name+'"? Removes its monthly returns from every portfolio in this group that has it.')){group.portfolios.forEach(function(gp){var gport=perfData[gp];if(!gport)return;var gi=(gport.series||[]).findIndex(function(x){return x.name===stored.name;});if(gi>=0)removePerfSeries(gp,gi);});}}} className="text-[11px] text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700 ml-auto">×</button>
                </div>
              );
            })}
            <button onClick={function(){addPerfSeries(group.portfolios[0]);}} className={BTN_SM+" mt-2"}>+ Add series</button>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 p-3 mb-4">
        <PerformanceChart series={mergedSeries} visibleSet={visibleSet} dark={dark} rollingYears={rollingYears}/>
      </div>

      {/* Trailing returns table */}
      <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
        <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Trailing period returns · {includeMtd?"including MTD (through "+curMonth+")":"excluding MTD (through last completed month)"}</div>
        <PerformanceTable series={mergedSeries.filter(function(s){return visibleSet.has(s.name);})} currentMonth={curMonth} includeMtd={includeMtd} colorMap={colorMap}/>
      </div>

      {/* 5-Year Risk Summary */}
      <RiskSummaryTable mergedSeries={mergedSeries} currentMonth={curMonth} includeMtd={includeMtd}/>

      {mergedSeries.length===0 && (
        <div className="text-xs text-gray-500 dark:text-slate-400 italic mt-3 text-center">
          No data yet for {group.label}. Go to <b>Data Hub → Performance</b> to paste monthly returns.
        </div>
      )}
    </div>
  );
}
