/* Chart utilities used by every chart-y component (CompanyDashboard,
 * SegmentsTab, EpsRevisionsTab, SnapshotTab, GeoRevView, etc.).
 *
 * Things that were previously copy-pasted across 5+ files:
 *   - niceTicks: human-readable axis tick generation
 *   - lastFinite / lastFiniteIndex / lastHistorical: array-walking with
 *     proper null-handling (avoids the isFinite(null) === true trap)
 *   - minMaxAcross: padded range stats across multiple arrays
 *   - format helpers: fmtMoney, fmtMoneyShort, fmtPct, fmtBn
 *   - color helpers: scoreColor for "is this attractive given polarity"
 *   - segmentsByEstimate: build path segments split by historical vs
 *     estimate, with a dashed bridge across the boundary
 *
 * Centralizing here so any future chart change happens in one place. */

import { isFiniteNum } from './numbers.js';

/* ============================ Range / scale ============================ */

/* Generate "nice" tick values in [min, max] — multiples of 1 / 2 / 2.5 / 5
 * times a power of 10, targeting ~`target` ticks. Returns the values
 * inside the range (may exclude exact min/max). */
export function niceTicks(min, max, target) {
  if (!isFinite(min) || !isFinite(max) || max <= min) return [];
  const t = target || 5;
  const range = max - min;
  const rawStep = range / t;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 4) step = 2.5;
  else if (norm < 7) step = 5;
  else step = 10;
  step *= mag;
  const start = Math.ceil(min / step) * step;
  const out = [];
  for (let v = start; v <= max + 1e-9; v += step) {
    out.push(Math.abs(v) < step / 1e6 ? 0 : v);
  }
  return out;
}

/* min/max across one or more arrays, skipping nulls. Returns [0, 1] if
 * no finite values exist; nudges identical min==max apart by 0.5 each. */
export function minMaxAcross(arrays) {
  let mn = Infinity, mx = -Infinity;
  arrays.forEach(function (arr) {
    (arr || []).forEach(function (v) {
      if (!isFiniteNum(v)) return;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    });
  });
  if (!isFinite(mn) || !isFinite(mx)) return [0, 1];
  if (mn === mx) { mn -= 0.5; mx += 0.5; }
  return [mn, mx];
}

/* ============================ Array walking ============================ */

export function lastFinite(arr) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (isFiniteNum(arr[i])) return arr[i];
  }
  return null;
}

export function lastFiniteIndex(arr) {
  if (!arr) return -1;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (isFiniteNum(arr[i])) return i;
  }
  return -1;
}

/* Like lastFinite but skips positions flagged as forward estimates.
 * Used when a value should reflect "most recent reported" rather than
 * "most recent value in the array". */
export function lastHistorical(arr, estimate) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (estimate && estimate[i]) continue;
    if (isFiniteNum(arr[i])) return arr[i];
  }
  return lastFinite(arr);
}

/* Last N finite values, optionally filtering out estimate positions.
 * Returned in original (oldest-first) order. */
export function lastNFinite(arr, n, estimate) {
  if (!arr) return [];
  const out = [];
  for (let i = arr.length - 1; i >= 0 && out.length < n; i--) {
    if (estimate && estimate[i]) continue;
    if (isFiniteNum(arr[i])) out.unshift(arr[i]);
  }
  return out;
}

/* ============================ Series shaping ============================ */

/* Walk a values + estimate-flag pair and emit path-segment groups.
 *
 *   segmentsByEstimate(values, estimate, xOf, yOf) →
 *     [
 *       { isEstimate: false, points: [[x,y], ...] },  // historical
 *       { isBridge: true, points: [[x,y], [x,y]] },   // dashed bridge
 *       { isEstimate: true, points: [[x,y], ...] },   // forward
 *     ]
 *
 * Null values break the line; transitions between historical and
 * estimate are bridged with a 2-point segment so callers can render
 * it dashed (visually "this is the gap between actuals and forecast").
 */
export function segmentsByEstimate(values, estimate, xOf, yOf) {
  const segs = [];
  if (!values) return segs;
  let cur = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isFiniteNum(v)) {
      if (cur) { segs.push(cur); cur = null; }
      continue;
    }
    const est = !!(estimate && estimate[i]);
    const pt = [xOf(i), yOf(v)];
    if (!cur) {
      cur = { isEstimate: est, points: [pt] };
    } else if (cur.isEstimate === est) {
      cur.points.push(pt);
    } else {
      segs.push(cur);
      const last = cur.points[cur.points.length - 1];
      segs.push({ isBridge: true, points: [last, pt] });
      cur = { isEstimate: est, points: [pt] };
    }
  }
  if (cur) segs.push(cur);
  return segs;
}

/* Build a single SVG path "M x,y L x,y L x,y..." string from a list
 * of [x,y] tuples. */
export function pathFromPoints(pts) {
  if (!pts || pts.length === 0) return "";
  return pts.map(function (p, i) {
    return (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1);
  }).join("");
}

/* ============================ Format helpers ============================ */

/* Format a money value (in millions of reporting currency) with
 * appropriate scale + comma thousands.
 *   19,520 EUR-millions   → "19.5 B EUR"
 *   9,774,930 JPY-millions → "9.77 T JPY"
 *   880 USD-millions      → "880 M USD" */
export function fmtMoney(v, ccy) {
  if (!isFiniteNum(v)) return "--";
  const a = Math.abs(v);
  const tag = ccy ? " " + ccy : "";
  if (a >= 1000000) {
    return (v / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " T" + tag;
  }
  if (a >= 1000) {
    return (v / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " B" + tag;
  }
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 }) + " M" + tag;
}

/* Short axis-tick form — no currency tag. */
export function fmtMoneyShort(v) {
  if (!isFiniteNum(v)) return "--";
  const a = Math.abs(v);
  if (a >= 1000000) return (v / 1000000).toFixed(1) + "T";
  if (a >= 1000)    return (v / 1000).toFixed(0) + "B";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/* Decimal → percent string with sign. */
export function fmtPct(v, dp, withSign) {
  if (!isFiniteNum(v)) return "--";
  const d = dp == null ? 1 : dp;
  const sign = withSign && v >= 0 ? "+" : "";
  return sign + (v * 100).toFixed(d) + "%";
}

/* Generic billion-format used by Dashboard tiles (single-line scale,
 * less verbose than fmtMoney). Switches to T at 1M-millions. */
export function fmtBn(v) {
  if (!isFiniteNum(v)) return "";
  const a = Math.abs(v);
  if (a >= 1000000) return (v / 1000000).toFixed(1) + "T";
  if (a >= 1000)    return (v / 1000).toFixed(1) + "B";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/* ============================ Color helpers ============================ */

/* Position [0,1] → green / yellow / red based on metric polarity:
 *   "lower"  — low position is good (e.g. P/E, leverage)
 *   "higher" — high position is good (e.g. ROIC, margins, yields)  */
export function scoreColor(pos, polarity) {
  if (polarity === "lower") {
    if (pos < 0.33) return "#16a34a";
    if (pos < 0.67) return "#ca8a04";
    return "#dc2626";
  }
  if (pos > 0.67) return "#16a34a";
  if (pos > 0.33) return "#ca8a04";
  return "#dc2626";
}

/* Standard chart palette for distinct series (segments, regions, etc.).
 * Cycled when there are more series than entries. */
export const PALETTE = [
  "#2563eb", "#059669", "#7c3aed", "#dc2626", "#ea580c",
  "#0891b2", "#ca8a04", "#be185d", "#475569", "#65a30d",
];
export function paletteColor(idx) {
  return PALETTE[idx % PALETTE.length];
}

/* Standard historical / estimate / total colors used across multiple
 * tiles so legend conventions stay consistent. */
export const HIST_COLOR  = "#2563eb"; /* blue-600 */
export const EST_COLOR   = "#ea580c"; /* orange-600 */
export const TOTAL_COLOR = "#0f172a"; /* slate-900 */
export const GRID_COLOR  = "rgba(100,116,139,0.12)"; /* frame */
export const TICK_COLOR  = "rgba(100,116,139,0.18)"; /* gridlines */
