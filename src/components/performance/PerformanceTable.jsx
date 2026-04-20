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
              return <th key={p} className="text-right px-2 pb-1.5 font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">{p}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {series.map(function(s,i){
            return (
              <tr key={s.name+i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="pr-3 py-1 font-medium text-gray-900 dark:text-slate-100">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{background:(colorMap&&colorMap[s.name])||"#999"}}/>
                  {s.name}
                </td>
                <td className="px-2 py-1 text-right text-gray-500 dark:text-slate-400 text-[10px] uppercase">{s.role||""}</td>
                {PERIODS.map(function(p){
                  var v=trailingReturn(s,p,{currentMonth:currentMonth,includeMtd:includeMtd});
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
