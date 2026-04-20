/* Compact 5-Year P/E Range chart for table rows.
   Shows a gradient bar from 5Y Low → 5Y High with small tick marks for
   Median / Average and a dot for Current FPE. Designed to fit a dense
   table cell (~100px wide × ~18px tall). Renders null when inputs are
   missing or invalid — caller should handle fallback (e.g. "--"). */
export default function FpeRangeMini({ valuation, width = 100 }) {
  var v = valuation || {};
  var lo  = parseFloat(v.peLow5);
  var hi  = parseFloat(v.peHigh5);
  var med = parseFloat(v.peMed5);
  var avg = parseFloat(v.peAvg5);
  var cur = parseFloat(v.peCurrent);
  if (isNaN(lo) || isNaN(hi) || hi <= lo) return null;

  /* Extend scale if current is outside the 5Y range, so the dot still
     shows (colored red to flag it). */
  var lowB = lo, highB = hi;
  if (!isNaN(cur)) {
    if (cur < lowB) lowB = cur;
    if (cur > highB) highB = cur;
  }
  var pad = (highB - lowB) * 0.05;
  var xMin = lowB - pad, xMax = highB + pad;
  function pct(x) { return ((x - xMin) / (xMax - xMin)) * 100; }

  var curOutside = !isNaN(cur) && (cur < lo || cur > hi);

  var title = "5Y P/E  low " + lo.toFixed(1) + "  high " + hi.toFixed(1) +
              (!isNaN(med) ? "  med " + med.toFixed(1) : "") +
              (!isNaN(avg) ? "  avg " + avg.toFixed(1) : "") +
              (!isNaN(cur) ? "  current " + cur.toFixed(1) : "");

  return (
    <div className="relative inline-block align-middle" style={{ width: width, height: 18 }} title={title}>
      {/* baseline */}
      <div className="absolute top-1/2 h-0.5 bg-slate-200 dark:bg-slate-700" style={{ left: 0, right: 0, transform: "translateY(-50%)" }} />
      {/* gradient low-hi band */}
      <div
        className="absolute top-1/2 h-1.5 rounded-full bg-gradient-to-r from-green-400 via-yellow-300 to-red-400"
        style={{ left: pct(lo) + "%", width: (pct(hi) - pct(lo)) + "%", transform: "translateY(-50%)" }}
      />
      {/* med tick */}
      {!isNaN(med) && (
        <div className="absolute top-1/2 w-px bg-slate-500 dark:bg-slate-400"
             style={{ left: pct(med) + "%", height: 8, transform: "translate(-50%,-50%)" }} />
      )}
      {/* avg tick (dashed-feeling via opacity) */}
      {!isNaN(avg) && (
        <div className="absolute top-1/2 w-px bg-slate-400 dark:bg-slate-500 opacity-70"
             style={{ left: pct(avg) + "%", height: 6, transform: "translate(-50%,-50%)" }} />
      )}
      {/* current marker */}
      {!isNaN(cur) && (
        <div
          className={"absolute top-1/2 rounded-full border " + (curOutside
            ? "bg-red-500 border-white dark:border-slate-900"
            : "bg-blue-600 border-white dark:border-slate-900")}
          style={{ left: pct(cur) + "%", width: 8, height: 8, transform: "translate(-50%,-50%)" }}
        />
      )}
    </div>
  );
}
