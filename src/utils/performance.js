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

/* Rolling 3-year annualized return, anchored at each month M with 36 prior months
   including M. Returns array of { month, value } points, oldest first. */
export function rolling3Y(series,monthsSorted){
  var pts=[];
  for(var i=35;i<monthsSorted.length;i++){
    var window=monthsSorted.slice(i-35,i+1);
    var rs=gather(series,window);
    if(!rs)continue;
    pts.push({month:monthsSorted[i], value:annualized(rs)});
  }
  return pts;
}

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
