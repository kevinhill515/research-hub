import { useState, useMemo } from 'react';
import { trailingReturn } from '../../utils/performance.js';

const PERIODS = ["MTD","QTD","YTD","1Y","3Y","5Y","7Y","10Y"];

function fmt(v){
  if(v===null||v===undefined||isNaN(v))return "—";
  var p=v*100;
  return (p>=0?"+":"")+p.toFixed(2)+"%";
}
function color(v){
  if(v===null||v===undefined||isNaN(v))return "#94a3b8";
  if(v>0)return "#166534";
  if(v<0)return "#991b1b";
  return undefined;
}

export function PerformanceTable({ series, currentMonth, includeMtd, colorMap }){
  /* Sort state: {period: null|"MTD"|..., dir: "desc"|"asc"}. dir cycles:
     off → desc (high-to-low, one click) → asc (low-to-high, two clicks)
     → off (third click, restores original series order). */
  const [sortPeriod, setSortPeriod] = useState(null);
  const [sortDir, setSortDir] = useState(null);

  /* Pre-compute every cell so sorting reuses the same numbers the table renders. */
  const rows = useMemo(function(){
    return (series||[]).map(function(s){
      var vals={};PERIODS.forEach(function(p){vals[p]=trailingReturn(s,p,{currentMonth:currentMonth,includeMtd:includeMtd});});
      return { series: s, vals: vals };
    });
  },[series, currentMonth, includeMtd]);

  const sortedRows = useMemo(function(){
    if(!sortPeriod||!sortDir)return rows;
    var sign=sortDir==="desc"?-1:1;
    return rows.slice().sort(function(a,b){
      var av=a.vals[sortPeriod], bv=b.vals[sortPeriod];
      var aNull=(av===null||av===undefined||isNaN(av));
      var bNull=(bv===null||bv===undefined||isNaN(bv));
      if(aNull&&bNull)return 0;
      if(aNull)return 1;  /* nulls always last, regardless of direction */
      if(bNull)return -1;
      return sign*(av-bv);
    });
  },[rows, sortPeriod, sortDir]);

  function cycleSort(p){
    if(sortPeriod!==p){setSortPeriod(p);setSortDir("desc");return;}
    if(sortDir==="desc"){setSortDir("asc");return;}
    if(sortDir==="asc"){setSortPeriod(null);setSortDir(null);return;}
  }

  if(!series||series.length===0){
    return <div className="text-xs text-gray-500 dark:text-slate-400 italic py-4">No series yet — upload data in the Data Hub → Performance tab.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b-2 border-slate-300 dark:border-slate-600">
            <th className="text-left pr-3 pb-1.5 font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Series</th>
            <th className="text-right px-2 pb-1.5 font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Role</th>
            {PERIODS.map(function(p){
              var active=sortPeriod===p;
              var arrow=active?(sortDir==="desc"?" \u2193":sortDir==="asc"?" \u2191":""):"";
              return <th key={p} onClick={function(){cycleSort(p);}} title="Click to sort (high→low, low→high, off)" className={"text-right px-2 pb-1.5 font-semibold uppercase tracking-wide text-[10px] cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 select-none "+(active?"text-gray-900 dark:text-slate-100":"text-gray-500 dark:text-slate-400")}>{p}{arrow}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(function(row,i){
            var s=row.series;
            return (
              <tr key={s.name+i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="pr-3 py-1 font-medium text-gray-900 dark:text-slate-100">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{background:(colorMap&&colorMap[s.name])||"#999"}}/>
                  {s.name}
                </td>
                <td className="px-2 py-1 text-right text-gray-500 dark:text-slate-400 text-[10px] uppercase">{s.role||""}</td>
                {PERIODS.map(function(p){
                  var v=row.vals[p];
                  return <td key={p} className="px-2 py-1 text-right font-mono" style={{color:color(v)}}>{fmt(v)}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
