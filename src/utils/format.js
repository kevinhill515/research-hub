/* Shared numeric + display formatters.
 *
 * Internal storage convention:
 *   - All percent-form values (yields, margins, returns, portfolio
 *     weights*) are stored as DECIMAL (0.032 for 3.2%). The UI does the
 *     ×100 multiplication on display.
 *   - User-pasted upload values are always assumed to be in PERCENT form
 *     (3.2 for 3.2%) and divided by 100 on ingest via pctToDecimal.
 *   (*Benchmark weights historically stored as 0-100 scale. That's a
 *    separate subsystem; do not use pctToDecimal there.)
 *
 * Keeping these helpers in one place ensures we don't drift back into
 * the "some fields divided, some not" state that caused multiple bugs.
 */

/* Parse to a number, or null if the input isn't parseable or blank.
 * No unit conversion. Safe against empty strings, whitespace, and
 * Excel error codes (which come through as huge negatives). */
export function numOrNull(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  if (isNaN(n)) return null;
  /* Excel COM error codes are in the -2.15e9 range. Reject them. */
  if (n < -1e12 || n > 1e15) return null;
  return n;
}

/* Convert a user-pasted percent-form value to internal decimal form.
 * 3.2 -> 0.032;  -1.8 -> -0.018;  0.5 -> 0.005.
 * Returns null on unparseable input. Always divides by 100 — no
 * magnitude-based heuristic (those have caused multiple subtle bugs). */
export function pctToDecimal(raw) {
  const n = numOrNull(raw);
  return n === null ? null : n / 100;
}

/* Format a decimal percent for display. 0.032 -> "3.2%".
 * Options: decimals (default 1), withSign (adds "+" prefix when >=0). */
export function fmtPct(decimal, decimals = 1, withSign = false) {
  if (decimal === null || decimal === undefined || isNaN(decimal)) return "--";
  const pct = decimal * 100;
  const prefix = withSign && pct >= 0 ? "+" : "";
  return prefix + pct.toFixed(decimals) + "%";
}

/* Signed delta formatter for "+/-" column displays. Same as
 * fmtPct(..., withSign=true) but defaults to 1 decimal and returns
 * "" (not "--") for nulls so delta columns stay clean. */
export function fmtDelta(decimal, decimals = 1) {
  if (decimal === null || decimal === undefined || isNaN(decimal)) return "";
  const pct = decimal * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(decimals) + "%";
}
