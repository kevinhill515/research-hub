/* Small inline line chart for a single ratio's time series.
 *
 * Renders an SVG ~160px tall. x-axis is evenly spaced across the given
 * years (one point per year). Historical and estimate segments get
 * different colors; the segment that crosses the boundary is drawn as
 * a dashed line so the forecast gap is visually explicit.
 *
 * null values in `values` break the line (gap), don't interpolate.
 *
 * Min / max / last value labels sit adjacent to their points so you
 * don't need a tooltip. */

const H = 160;
const PAD_T = 18, PAD_B = 24, PAD_L = 6, PAD_R = 6;
const HIST_COLOR = "#2563eb"; /* blue-600 */
const EST_COLOR  = "#ea580c"; /* orange-600 */

export default function RatioLineChart({ years, values, estimate, width = 800 }) {
  /* Defensive: same length required. */
  const n = years.length;
  if (!n || !values || values.length !== n) return null;

  /* Y-scale: ignore nulls. Add 10% padding top/bottom. */
  const finite = values.filter(function (v) { return v !== null && isFinite(v); });
  if (finite.length === 0) {
    return (
      <div style={{ height: H }} className="flex items-center justify-center text-xs text-gray-400 dark:text-slate-500 italic">
        No data to chart
      </div>
    );
  }
  const vMin = Math.min.apply(null, finite);
  const vMax = Math.max.apply(null, finite);
  const span = vMax - vMin || Math.max(1, Math.abs(vMax));
  const yMin = vMin - span * 0.1;
  const yMax = vMax + span * 0.1;

  const innerW = width - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  function xOf(i) {
    /* Distribute points across the inner width. For n=1, center. */
    if (n === 1) return PAD_L + innerW / 2;
    return PAD_L + (i / (n - 1)) * innerW;
  }
  function yOf(v) {
    return PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  }

  /* Build path segments. Walk the points in order, starting a new
     polyline whenever:
       - we hit a null (end current segment)
       - the estimate-flag flips (end current, start new)
     Each segment records its { isEstimate, boundary } so we can
     style it correctly (solid vs dashed-bridge). */
  const segments = [];
  let current = null;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null || !isFinite(v)) {
      if (current) { segments.push(current); current = null; }
      continue;
    }
    if (!current) {
      current = { isEstimate: estimate[i], points: [[xOf(i), yOf(v), i]] };
    } else if (current.isEstimate === estimate[i]) {
      current.points.push([xOf(i), yOf(v), i]);
    } else {
      /* Boundary crossing: close old segment, open new one, and draw
         a dashed "bridge" line between the last point of the old and
         first of the new. */
      segments.push(current);
      const lastPt = current.points[current.points.length - 1];
      const newPt  = [xOf(i), yOf(v), i];
      segments.push({
        isBridge: true,
        points: [lastPt, newPt],
      });
      current = { isEstimate: estimate[i], points: [newPt] };
    }
  }
  if (current) segments.push(current);

  function segPath(pts) {
    return pts.map(function (p, idx) { return (idx === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
  }

  /* Find the indices of min, max, and last (most recent non-null) for
     annotation. */
  let minIdx = -1, maxIdx = -1, lastIdx = -1;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null || !isFinite(v)) continue;
    if (minIdx < 0 || v < values[minIdx]) minIdx = i;
    if (maxIdx < 0 || v > values[maxIdx]) maxIdx = i;
    lastIdx = i;
  }

  function fmt(v) {
    const n = Math.abs(v);
    if (n >= 1000) return v.toFixed(0);
    if (n >= 10)   return v.toFixed(1);
    return v.toFixed(2);
  }

  /* Baseline at y=0 if 0 is within range — helpful for pct/ratio metrics. */
  const showZero = yMin < 0 && yMax > 0;

  return (
    <svg width={width} height={H} role="img" aria-label="Ratio time series">
      {/* frame */}
      <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} fill="none" stroke="currentColor" strokeOpacity="0.08" />
      {showZero && (
        <line x1={PAD_L} y1={yOf(0)} x2={PAD_L + innerW} y2={yOf(0)} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="3 3" />
      )}

      {/* segments */}
      {segments.map(function (s, idx) {
        if (s.isBridge) {
          return (
            <path key={idx} d={segPath(s.points)} fill="none" stroke={EST_COLOR} strokeWidth="1.5" strokeDasharray="4 3" strokeOpacity="0.6" />
          );
        }
        const color = s.isEstimate ? EST_COLOR : HIST_COLOR;
        return (
          <g key={idx}>
            <path d={segPath(s.points)} fill="none" stroke={color} strokeWidth="2" />
            {s.points.map(function (p, j) {
              return <circle key={j} cx={p[0]} cy={p[1]} r="2.5" fill={color} />;
            })}
          </g>
        );
      })}

      {/* annotations — min, max, last */}
      {[minIdx, maxIdx, lastIdx].filter(function (i, pos, arr) {
        return i >= 0 && arr.indexOf(i) === pos;
      }).map(function (i) {
        const x = xOf(i), y = yOf(values[i]);
        const isEst = estimate[i];
        const color = isEst ? EST_COLOR : HIST_COLOR;
        /* Nudge label above the point by default; if near top, nudge below. */
        const above = y > PAD_T + 14;
        const ly = above ? y - 6 : y + 14;
        return (
          <g key={"ann-" + i}>
            <text x={x} y={ly} fontSize="10" fill={color} textAnchor="middle" fontWeight="600">
              {fmt(values[i])}
            </text>
          </g>
        );
      })}

      {/* x-axis year labels (every year, or every-other if too crowded) */}
      {years.map(function (yr, i) {
        const step = n > 10 ? 2 : 1;
        if (i % step !== 0 && i !== n - 1) return null;
        const color = estimate[i] ? EST_COLOR : "#64748b";
        return (
          <text
            key={i}
            x={xOf(i)}
            y={PAD_T + innerH + 14}
            fontSize="9"
            textAnchor="middle"
            fill={color}
            opacity="0.8"
          >
            {String(yr).slice(2)}
          </text>
        );
      })}
    </svg>
  );
}
