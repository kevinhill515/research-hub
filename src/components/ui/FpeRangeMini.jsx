/* Compact 5-Year P/E Range chart for table rows.
 *
 * Behavior:
 *   - Full range available (low, high, optional med/avg/current): renders
 *     a gradient bar with optional tick marks and a current-position dot.
 *     Dot is red when current trades outside the 5Y low/high band.
 *   - Current exists but range is missing/invalid: renders a flat line
 *     with a single dot centered, so users know the current P/E exists
 *     but the 5Y context wasn't imported.
 *   - Nothing available: returns null (caller renders a "--").
 *
 * `width` controls horizontal space; the component auto-hides (returns
 * null) below ~60px since the chart becomes unreadable. Set `width={0}`
 * or a very small value to force hide. */

export default function FpeRangeMini({ valuation, width = 100 }) {
  /* Auto-hide on very narrow cells — the chart is meaningless at <60px. */
  if (width > 0 && width < 60) return null;

  const v = valuation || {};
  const lo  = parseFloat(v.peLow5);
  const hi  = parseFloat(v.peHigh5);
  const med = parseFloat(v.peMed5);
  const avg = parseFloat(v.peAvg5);
  const cur = parseFloat(v.peCurrent);

  const rangeValid = !isNaN(lo) && !isNaN(hi) && hi > lo;
  const curValid = !isNaN(cur);

  /* Fallback: current exists but no range. Show a plain baseline with
     just a dot in the center, so the cell isn't empty. */
  if (!rangeValid) {
    if (!curValid) return null;
    return (
      <div
        className="relative inline-block align-middle"
        style={{ width: width, height: 18 }}
        title={"Current P/E " + cur.toFixed(1) + " (5Y range not available)"}
      >
        <div
          className="absolute top-1/2 h-0.5 bg-slate-200 dark:bg-slate-700"
          style={{ left: 0, right: 0, transform: "translateY(-50%)" }}
        />
        <div
          className="absolute top-1/2 rounded-full bg-slate-400 dark:bg-slate-500 border border-white dark:border-slate-900"
          style={{ left: "50%", width: 8, height: 8, transform: "translate(-50%,-50%)" }}
        />
      </div>
    );
  }

  /* Extend scale if current is outside the 5Y range, so the dot still
     shows (colored red to flag it). */
  let lowB = lo, highB = hi;
  if (curValid) {
    if (cur < lowB) lowB = cur;
    if (cur > highB) highB = cur;
  }
  const pad = (highB - lowB) * 0.05;
  const xMin = lowB - pad, xMax = highB + pad;
  function pct(x) { return ((x - xMin) / (xMax - xMin)) * 100; }

  const curOutside = curValid && (cur < lo || cur > hi);

  const tooltipParts = [
    "5Y P/E",
    "low "  + lo.toFixed(1),
    "high " + hi.toFixed(1),
    !isNaN(med) && "med " + med.toFixed(1),
    !isNaN(avg) && "avg " + avg.toFixed(1),
    curValid  && "current " + cur.toFixed(1) + (curOutside ? " (outside 5Y band)" : ""),
  ].filter(Boolean).join("  ");

  return (
    <div
      className="relative inline-block align-middle"
      style={{ width: width, height: 18 }}
      title={tooltipParts}
      aria-label={tooltipParts}
    >
      {/* baseline */}
      <div
        className="absolute top-1/2 h-0.5 bg-slate-200 dark:bg-slate-700"
        style={{ left: 0, right: 0, transform: "translateY(-50%)" }}
      />
      {/* gradient low-hi band */}
      <div
        className="absolute top-1/2 h-1.5 rounded-full bg-gradient-to-r from-green-400 via-yellow-300 to-red-400"
        style={{ left: pct(lo) + "%", width: (pct(hi) - pct(lo)) + "%", transform: "translateY(-50%)" }}
      />
      {/* med tick */}
      {!isNaN(med) && (
        <div
          className="absolute top-1/2 w-px bg-slate-500 dark:bg-slate-400"
          style={{ left: pct(med) + "%", height: 8, transform: "translate(-50%,-50%)" }}
        />
      )}
      {/* avg tick */}
      {!isNaN(avg) && (
        <div
          className="absolute top-1/2 w-px bg-slate-400 dark:bg-slate-500 opacity-70"
          style={{ left: pct(avg) + "%", height: 6, transform: "translate(-50%,-50%)" }}
        />
      )}
      {/* current marker — red when outside band, with subtle ring for emphasis */}
      {curValid && (
        <div
          className={"absolute top-1/2 rounded-full border " + (curOutside
            ? "bg-red-500 border-white dark:border-slate-900 ring-1 ring-red-300 dark:ring-red-700"
            : "bg-blue-600 border-white dark:border-slate-900")}
          style={{ left: pct(cur) + "%", width: 8, height: 8, transform: "translate(-50%,-50%)" }}
        />
      )}
    </div>
  );
}
