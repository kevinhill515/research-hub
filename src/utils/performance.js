/* Performance analytics helpers.

   Series shape (one per portfolio's series entry):
     { name, role: "portfolio"|"benchmark"|"competitor", ticker, returns: { "YYYY-MM": Number, ... } }

   All returns are decimal (e.g. 0.0234 = 2.34%). Nulls / missing months = no data.

   All computations use the exact formulas the user specified:
     - Window <12 months:   (∏(1+r)) − 1
     - Window ≥12 months:   (∏(1+r))^(12/N) − 1
*/

/* Compose "YYYY-MM" from a Date. */
export function monthKey(d){
  var y=d.getFullYear();var m=d.getMonth()+1;
  return y+"-"+(m<10?"0":"")+m;
}
/* Return the current month key (today) */
export function currentMonthKey(){return monthKey(new Date());}
/* Return last-completed-month key (previous calendar month) */
export function lastCompletedMonthKey(){
  var d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);
  return monthKey(d);
}
/* Parse "YYYY-MM" → Date at first-of-month */
export function monthDate(k){
  var parts=(k||"").split("-");
  if(parts.length!==2)return null;
  var y=parseInt(parts[0]);var m=parseInt(parts[1]);
  if(isNaN(y)||isNaN(m)||m<1||m>12)return null;
  return new Date(y,m-1,1);
}
/* Previous-month key. prevMonthKey("2026-01") === "2025-12" */
export function prevMonthKey(k){
  var d=monthDate(k);if(!d)return null;
  d.setMonth(d.getMonth()-1);
  return monthKey(d);
}
/* Sorted list of YYYY-MM keys across all provided series. */
export function allMonths(series){
  var set={};series.forEach(function(s){Object.keys(s.returns||{}).forEach(function(k){set[k]=true;});});
  return Object.keys(set).sort();
}
/* Compound product of (1+r) − 1. Returns null if array is empty or contains non-numeric. */
export function compound(rs){
  if(!rs||rs.length===0)return null;
  var p=1;
  for(var i=0;i<rs.length;i++){
    var r=rs[i];
    if(r===null||r===undefined||isNaN(r))return null;
    p*=(1+r);
  }
  return p-1;
}
/* Annualized compound: (∏(1+r))^(12/N) − 1. Null on empty / non-numeric. */
export function annualized(rs){
  if(!rs||rs.length===0)return null;
  var p=1;
  for(var i=0;i<rs.length;i++){
    var r=rs[i];
    if(r===null||r===undefined||isNaN(r))return null;
    p*=(1+r);
  }
  return Math.pow(p,12/rs.length)-1;
}

/* Gather contiguous returns for a series over a list of month keys (in order).
   Returns an array of numbers, skipping any month with no data. Caller decides
   whether a missing month invalidates the window. */
export function gather(series,monthKeys){
  var out=[];var r=series.returns||{};
  for(var i=0;i<monthKeys.length;i++){
    var v=r[monthKeys[i]];
    if(v===null||v===undefined||isNaN(v))return null; /* gap → invalidate */
    out.push(Number(v));
  }
  return out;
}

/* Rolling N-year annualized return, anchored at each month M with (years*12)
   prior months including M. Returns array of { month, value } points, oldest
   first. years=1 → trailing-12-month annualized; years=3 → trailing-36; etc. */
export function rollingAnnualized(series,monthsSorted,years){
  var n=Math.max(1,Math.round((years||3)*12));
  var pts=[];
  for(var i=n-1;i<monthsSorted.length;i++){
    var window=monthsSorted.slice(i-(n-1),i+1);
    var rs=gather(series,window);
    if(!rs)continue;
    pts.push({month:monthsSorted[i], value:annualized(rs)});
  }
  return pts;
}
/* Backward-compat alias. */
export function rolling3Y(series,monthsSorted){return rollingAnnualized(series,monthsSorted,3);}

/* Month list spanning the last N months ending at latestKey (inclusive). */
export function monthsBack(latestKey,n){
  var d=monthDate(latestKey);if(!d)return [];
  var out=[];
  for(var i=n-1;i>=0;i--){
    var c=new Date(d.getFullYear(),d.getMonth()-i,1);
    out.push(monthKey(c));
  }
  return out;
}

/* Trailing period returns for a series.
   Args:
     series — { returns: {...} }
     period — "MTD" | "QTD" | "YTD" | "1Y" | "3Y" | "5Y" | "7Y" | "10Y"
     ctx    — { currentMonth, includeMtd }
              currentMonth: "YYYY-MM" — the in-progress month for MTD
              includeMtd: true → every non-MTD period includes currentMonth as its last data point
                          false → every non-MTD period ends at the previous (completed) month
                          (MTD itself always returns the currentMonth value.)
   Returns a number or null. Insufficient history → null. */
export function trailingReturn(series,period,ctx){
  var r=series.returns||{};
  var cur=ctx.currentMonth;
  var curDate=monthDate(cur);if(!curDate)return null;
  var include=!!ctx.includeMtd;
  /* The "end" month for non-MTD periods. */
  var endKey=include?cur:prevMonthKey(cur);
  var endDate=monthDate(endKey);if(!endDate)return null;
  var endYear=endDate.getFullYear();
  var endMonthIdx=endDate.getMonth(); /* 0-based */

  if(period==="MTD"){
    var v=r[cur];return(v===null||v===undefined||isNaN(v))?null:v;
  }
  if(period==="QTD"){
    var qStartMonth=Math.floor(endMonthIdx/3)*3;
    var keys=[];
    for(var m=qStartMonth;m<=endMonthIdx;m++){
      keys.push(endYear+"-"+((m+1)<10?"0":"")+(m+1));
    }
    if(keys.length===0)return 0;
    var rs=gather(series,keys);if(!rs)return null;
    return compound(rs);
  }
  if(period==="YTD"){
    /* YTD: Jan of endYear through endKey. If we're at Jan and toggle is OFF,
       endKey is Dec of prior year → YTD spans Jan..Dec of prior year (a full year),
       which is the only sensible read. We return null in that ambiguous corner. */
    if(!include&&endDate.getFullYear()<curDate.getFullYear())return null;
    var keys=[];
    for(var m=0;m<=endMonthIdx;m++){
      keys.push(endYear+"-"+((m+1)<10?"0":"")+(m+1));
    }
    if(keys.length===0)return 0;
    var rs=gather(series,keys);if(!rs)return null;
    return compound(rs);
  }
  /* 1Y/3Y/5Y/7Y/10Y — 12*years months ending at endKey (inclusive). */
  var years={"1Y":1,"3Y":3,"5Y":5,"7Y":7,"10Y":10}[period];
  if(!years)return null;
  var window=monthsBack(endKey,years*12);
  var rs=gather(series,window);if(!rs)return null;
  return rs.length<12?compound(rs):annualized(rs);
}

/* Compute the MTD return for a portfolio from live MV vs last month EMV.
   `currentMV` is the aggregate totalMV computed from rep data + prices + fx
   (already computed in PortfoliosTable). */
export function portfolioMtd(currentMV,lastMonthEMV){
  if(!currentMV||!lastMonthEMV||lastMonthEMV===0)return null;
  return (currentMV/lastMonthEMV)-1;
}

/* ============================================================================
   Risk statistics. All operate on paired monthly-return arrays. Caller is
   responsible for aligning the portfolio and benchmark to the same N months
   (typically the trailing 60 completed months for a 5Y risk summary).
   ============================================================================ */
function _mean(arr){var s=0;for(var i=0;i<arr.length;i++)s+=arr[i];return arr.length?s/arr.length:null;}
function _sampleVar(arr){var n=arr.length;if(n<2)return null;var m=_mean(arr);var s=0;for(var i=0;i<n;i++){var d=arr[i]-m;s+=d*d;}return s/(n-1);}
export function sampleStdev(arr){var v=_sampleVar(arr);return v===null?null:Math.sqrt(v);}
/* Downside / upside semi-deviation, user's formula:
   SQRT(AVERAGE(IF(r<0, r^2, 0)))  — divides by full N (not subset count). */
export function downsideStdev(arr){if(!arr||arr.length===0)return null;var s=0;for(var i=0;i<arr.length;i++){if(arr[i]<0)s+=arr[i]*arr[i];}return Math.sqrt(s/arr.length);}
export function upsideStdev(arr){if(!arr||arr.length===0)return null;var s=0;for(var i=0;i<arr.length;i++){if(arr[i]>0)s+=arr[i]*arr[i];}return Math.sqrt(s/arr.length);}
/* Pearson correlation. */
export function correlation(a,b){
  if(!a||!b||a.length!==b.length||a.length<2)return null;
  var n=a.length;var am=_mean(a),bm=_mean(b);
  var num=0,ad=0,bd=0;
  for(var i=0;i<n;i++){var dx=a[i]-am,dy=b[i]-bm;num+=dx*dy;ad+=dx*dx;bd+=dy*dy;}
  var den=Math.sqrt(ad*bd);return den===0?null:num/den;
}
/* Beta = slope of portfolio on benchmark (linear regression). */
export function betaSlope(port,bench){
  if(!port||!bench||port.length!==bench.length||port.length<2)return null;
  var n=port.length;var pm=_mean(port),bm=_mean(bench);
  var num=0,den=0;
  for(var i=0;i<n;i++){var db=bench[i]-bm;num+=(port[i]-pm)*db;den+=db*db;}
  return den===0?null:num/den;
}
/* Tracking error: sample stdev of (port − bench) * sqrt(12) for monthly returns. */
export function trackingError(port,bench){
  if(!port||!bench||port.length!==bench.length||port.length<2)return null;
  var diffs=[];for(var i=0;i<port.length;i++)diffs.push(port[i]-bench[i]);
  var sd=sampleStdev(diffs);return sd===null?null:sd*Math.sqrt(12);
}
/* Upside capture ratio. For each month m:
   pUp_m = (bench_m >= 0) ? 1 + port_m  : 1
   bUp_m = (bench_m >= 0) ? 1 + bench_m : 1
   result = (∏pUp)^(1/N) − 1 over (∏bUp)^(1/N) − 1
   (per-month geometric mean in up markets; ratio divides out the time factor). */
export function upsideCapture(port,bench){
  if(!port||!bench||port.length!==bench.length||port.length===0)return null;
  var n=port.length;var pUp=1,bUp=1;
  for(var i=0;i<n;i++){if(bench[i]>=0){pUp*=(1+port[i]);bUp*=(1+bench[i]);}}
  var pGeo=Math.pow(pUp,1/n)-1;var bGeo=Math.pow(bUp,1/n)-1;
  return bGeo===0?null:pGeo/bGeo;
}
/* Downside capture ratio. Same shape but m where bench_m < 0. */
export function downsideCapture(port,bench){
  if(!port||!bench||port.length!==bench.length||port.length===0)return null;
  var n=port.length;var pDn=1,bDn=1;
  for(var i=0;i<n;i++){if(bench[i]<0){pDn*=(1+port[i]);bDn*=(1+bench[i]);}}
  var pGeo=Math.pow(pDn,1/n)-1;var bGeo=Math.pow(bDn,1/n)-1;
  return bGeo===0?null:pGeo/bGeo;
}
/* Collect paired monthly returns over the trailing `months` array, requiring
   both series to have a value in every month. Returns {port:[], bench:[]} or
   null if any month is missing on either side. */
export function pairReturns(portSeries,benchSeries,months){
  var pr=portSeries&&portSeries.returns||{};
  var br=benchSeries&&benchSeries.returns||{};
  var p=[],b=[];
  for(var i=0;i<months.length;i++){
    var pv=pr[months[i]],bv=br[months[i]];
    if(pv===null||pv===undefined||isNaN(pv))return null;
    if(bv===null||bv===undefined||isNaN(bv))return null;
    p.push(Number(pv));b.push(Number(bv));
  }
  return {port:p,bench:b};
}
