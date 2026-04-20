import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { allMonths, rolling3Y } from '../../utils/performance.js';

/* Palette for series lines. Portfolio = heavy blue; benchmarks = grays;
   competitors cycle through purples/teals/oranges. */
const PORTFOLIO_COLOR = "#1e40af";
const BENCH_COLORS = ["#334155", "#64748b"];
const COMP_COLORS = ["#7c3aed","#0d9488","#ea580c","#9d174d","#ca8a04"];

function seriesColor(s, benchIdx, compIdx){
  if(s.role==="portfolio")return PORTFOLIO_COLOR;
  if(s.role==="benchmark")return BENCH_COLORS[benchIdx%BENCH_COLORS.length];
  return COMP_COLORS[compIdx%COMP_COLORS.length];
}

export function PerformanceChart({ series, visibleSet, dark }){
  /* Pre-compute rolling-3Y points for each series, then merge into one array
     of {month, [seriesName]: value, ...} rows for Recharts. */
  const { data, colorMap, names } = useMemo(function(){
    var sorted=allMonths(series);
    var pointsBySeries={};
    var benchIdx=0,compIdx=0;
    var colorMap={};
    var names=[];
    series.forEach(function(s){
      var color=seriesColor(s,benchIdx,compIdx);
      if(s.role==="benchmark")benchIdx++;
      else if(s.role==="competitor")compIdx++;
      colorMap[s.name]=color;
      names.push(s.name);
      pointsBySeries[s.name]={};
      rolling3Y(s,sorted).forEach(function(p){pointsBySeries[s.name][p.month]=p.value*100;});
    });
    var rowsByMonth={};
    Object.keys(pointsBySeries).forEach(function(n){
      Object.keys(pointsBySeries[n]).forEach(function(m){
        if(!rowsByMonth[m])rowsByMonth[m]={month:m};
        rowsByMonth[m][n]=pointsBySeries[n][m];
      });
    });
    var data=Object.keys(rowsByMonth).sort().map(function(m){return rowsByMonth[m];});
    return {data:data, colorMap:colorMap, names:names};
  },[series]);

  if(data.length===0){
    return <div className="text-xs text-gray-500 dark:text-slate-400 italic py-8 text-center">Not enough data yet — need at least 36 months of returns in a series.</div>;
  }

  const tickFmt = function(v){return v.toFixed(0)+"%";};
  const tickColor = dark?"#94a3b8":"#64748b";
  const gridColor = dark?"#334155":"#e2e8f0";

  return (
    <div className="w-full" style={{height:380}}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{top:10,right:30,left:0,bottom:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor}/>
          <XAxis dataKey="month" tick={{fontSize:10,fill:tickColor}} minTickGap={40}/>
          <YAxis tickFormatter={tickFmt} tick={{fontSize:10,fill:tickColor}}/>
          <Tooltip
            formatter={function(val){return val===null||val===undefined?"—":val.toFixed(2)+"%";}}
            contentStyle={{background:dark?"#0f172a":"#ffffff",border:"1px solid "+gridColor,fontSize:11,borderRadius:6}}
            labelStyle={{color:tickColor,fontWeight:600}}
          />
          <ReferenceLine y={0} stroke={tickColor} strokeDasharray="2 2"/>
          {names.filter(function(n){return visibleSet.has(n);}).map(function(n){
            return <Line key={n} type="monotone" dataKey={n} stroke={colorMap[n]} dot={false} strokeWidth={2} connectNulls={false} isAnimationActive={false}/>;
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export { seriesColor, PORTFOLIO_COLOR, BENCH_COLORS, COMP_COLORS };
