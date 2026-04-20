import { useState, useMemo } from 'react';
import {
  monthsBack, pairReturns,
  upsideCapture, downsideCapture,
  trackingError, betaSlope, correlation,
  sampleStdev, downsideStdev, upsideStdev,
  prevMonthKey,
} from '../../utils/performance.js';

const WINDOW_MONTHS = 60; /* 5-year risk summary */

/* Column definitions. `fmt` picks percentage vs ratio vs raw number display. */
const COLS = [
  { key:"upCap",   label:"Up Cap",   fmt:"pct" },
  { key:"dnCap",   label:"Dn Cap",   fmt:"pct" },
  { key:"ratio",   label:"Ratio",    fmt:"num" },
  { key:"te",      label:"TE",       fmt:"pct" },
  { key:"beta",    label:"Beta",     fmt:"num" },
  { key:"corr",    label:"Corr",     fmt:"num" },
  { key:"sd",      label:"Std Dev",  fmt:"pct" },
  { key:"dnSd",    label:"Down SD",  fmt:"pct" },
  { key:"upSd",    label:"Up SD",    fmt:"pct" },
  { key:"bmSd",    label:"BM SD",    fmt:"pct" },
  { key:"bmDnSd",  label:"BM Dn SD", fmt:"pct" },
  { key:"bmUpSd",  label:"BM Up SD", fmt:"pct" },
];

function fmt(v, type){
  if(v===null||v===undefined||isNaN(v))return "—";
  if(type==="pct")return (v*100).toFixed(2)+"%";
  return v.toFixed(2);
}

export function RiskSummaryTable({ mergedSeries, currentMonth, includeMtd }){
  /* Benchmarks available in the group. */
  const benchmarks = useMemo(function(){
    return (mergedSeries||[]).filter(function(s){return s.role==="benchmark";});
  },[mergedSeries]);

  const [benchName, setBenchName] = useState(null);
  const activeBench = benchmarks.find(function(b){return b.name===benchName;}) || benchmarks[0] || null;

  /* Month window: 60 months ending at currentMonth (include-MTD) or previous
     completed month (exclude-MTD). Mirrors the trailing-returns table. */
  const windowMonths = useMemo(function(){
    var end=includeMtd?currentMonth:prevMonthKey(currentMonth);
    return monthsBack(end,WINDOW_MONTHS);
  },[currentMonth, includeMtd]);

  /* Rows: only portfolio and competitor series. */
  const rows = useMemo(function(){
    if(!activeBench)return [];
    return (mergedSeries||[])
      .filter(function(s){return s.role==="portfolio"||s.role==="competitor";})
      .map(function(s){
        var pair=pairReturns(s,activeBench,windowMonths);
        if(!pair)return { series:s, stats:null };
        var up=upsideCapture(pair.port,pair.bench);
        var dn=downsideCapture(pair.port,pair.bench);
        var ratio=(up===null||dn===null||dn===0)?null:up/dn;
        return {
          series:s,
          stats:{
            upCap: up,
            dnCap: dn,
            ratio: ratio,
            te:    trackingError(pair.port,pair.bench),
            beta:  betaSlope(pair.port,pair.bench),
            corr:  correlation(pair.port,pair.bench),
            sd:    sampleStdev(pair.port),
            dnSd:  downsideStdev(pair.port),
            upSd:  upsideStdev(pair.port),
            bmSd:  sampleStdev(pair.bench),
            bmDnSd:downsideStdev(pair.bench),
            bmUpSd:upsideStdev(pair.bench),
          }
        };
      });
  },[mergedSeries, activeBench, windowMonths]);

  if(benchmarks.length===0){
    return (
      <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 p-3 mt-4">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">5-Year Risk Summary</div>
        <div className="text-xs text-gray-500 dark:text-slate-400 italic">No benchmark series defined. Add a series with role = Benchmark in the editor to see risk statistics.</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 p-3 mt-4">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">5-Year Risk Summary</div>
        <div className="text-[11px] text-gray-500 dark:text-slate-400">vs</div>
        <div className="flex gap-1 flex-wrap">
          {benchmarks.map(function(b){
            var active=activeBench&&activeBench.name===b.name;
            return <button key={b.name} onClick={function(){setBenchName(b.name);}} className={"text-[11px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors "+(active?"bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold":"border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{b.name}</button>;
          })}
        </div>
        <div className="ml-auto text-[10px] text-gray-500 dark:text-slate-400 italic">
          Window: {windowMonths[0]} → {windowMonths[windowMonths.length-1]} ({WINDOW_MONTHS} months)
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-slate-300 dark:border-slate-600">
              <th className="text-left pr-3 pb-1.5 font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Series</th>
              <th className="text-right px-2 pb-1.5 font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Role</th>
              {COLS.map(function(c){
                return <th key={c.key} className="text-right px-2 pb-1.5 font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide text-[10px] whitespace-nowrap">{c.label}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length===0 && (
              <tr><td colSpan={2+COLS.length} className="text-xs text-gray-500 dark:text-slate-400 italic py-3 text-center">No portfolio or competitor series in this view.</td></tr>
            )}
            {rows.map(function(r,i){
              var s=r.series;
              return (
                <tr key={s.name+i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="pr-3 py-1 font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap">{s.name}</td>
                  <td className="px-2 py-1 text-right text-gray-500 dark:text-slate-400 text-[10px] uppercase">{s.role}</td>
                  {COLS.map(function(c){
                    var v=r.stats?r.stats[c.key]:null;
                    return <td key={c.key} className="px-2 py-1 text-right font-mono text-gray-900 dark:text-slate-100">{fmt(v,c.fmt)}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-gray-500 dark:text-slate-400 italic mt-2">
        Rows show 60-month statistics requiring full history for both the series and the selected benchmark. A series with any gap over the window renders as —.
        &nbsp;Up/Dn Cap = geometric-mean ratio over up/down months; TE = sample stdev of (port − bench) × √12;
        Std Dev / Down SD / Up SD are monthly (sample stdev for Std Dev; semi-deviation formula SQRT(AVERAGE(IF…)) for the others).
      </div>
    </div>
  );
}
