/* Number utilities — primarily a safe finite-number check.
 *
 * Why this exists: the global `isFinite()` coerces, so `isFinite(null)`
 * returns `true` (because `Number(null) === 0`). Likewise `isFinite("")`
 * returns true. This has caused at least 5 chart bugs in this codebase
 * — most visibly the "discontinued segment line drops to 0%" issue.
 *
 * Use `isFiniteNum(v)` everywhere instead of `isFinite(v)` for chart /
 * data-validity checks. It returns true ONLY for actual finite numbers
 * (or numeric strings that parse to one), and false for null / undefined
 * / NaN / "".
 */

export function isFiniteNum(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") {
    if (!v.trim()) return false;
    const n = parseFloat(v);
    return Number.isFinite(n);
  }
  return false;
}

/* Convenience: parse to number and return null if not finite. Replaces
 * the common `const n = parseFloat(x); if (!isFinite(n)) return null;`
 * pattern. */
export function numOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
