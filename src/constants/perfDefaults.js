/* Default performance series mapping per portfolio.
 *
 * Used by applyPerfBulk so that re-importing a fresh CSV (after a wipe
 * or for a brand-new portfolio) automatically gets the right role
 * (portfolio / benchmark / competitor), canonical display name, and
 * ticker — no manual reconfiguration required.
 *
 * Matching is by ticker first, then aliases (case-insensitive), then by
 * canonical name. The `aliases` array lists every header that has ever
 * appeared in a CSV for this series — FactSet IDs ("MS899901"), short
 * codes ("ACWI ex US"), redundant ticker variants. Add a new alias here
 * when a new upload format shows up and the system can't find a match.
 *
 * Rules applied during import:
 *  - If an existing series matches a default (by ticker/alias/name) but
 *    is missing role or ticker, the default fills those in. The user's
 *    own customizations (a custom display name, extra aliases) are kept.
 *  - If no series matches, a new one is created with the default's
 *    canonical name + role + ticker, and the incoming header is recorded
 *    as an alias so future re-imports short-circuit.
 *  - Existing series that aren't in the defaults are left alone.
 */
export const DEFAULT_PERF_SERIES = {
  FIN: [
    { name: "Silvercrest Focused International Value", role: "portfolio",  ticker: "FIN",    aliases: ["FIN"] },
    { name: "ACWI ex US",                              role: "benchmark",  ticker: "899901", aliases: ["899901","MS899901","M899901","ACWI ex US","ACWIxUS","ACWI ex-US"] },
    { name: "ACWI ex US Value",                        role: "benchmark",  ticker: "106037", aliases: ["106037","MS106037","M106037","ACWI ex US Value","ACWI ex-US Value"] },
    { name: "Artisan International Value",             role: "competitor", ticker: "APHKX",  aliases: ["APHKX"] },
    { name: "GQG Partners International Opportunities",role: "competitor", ticker: "GSIMX",  aliases: ["GSIMX"] },
    { name: "WCM Focused International Growth",        role: "competitor", ticker: "WCMIX",  aliases: ["WCMIX"] },
    { name: "WCM Focused International Opportunities", role: "competitor", ticker: "WCMOX",  aliases: ["WCMOX"] },
    { name: "S&P 500",                                 role: "benchmark",  ticker: "SP50",   aliases: ["SP50","SP500","S&P 500","SPX","SPY"] },
  ],
  IN: [
    { name: "Silvercrest International Value",         role: "portfolio",  ticker: "IN",     aliases: ["IN"] },
    { name: "ACWI ex US",                              role: "benchmark",  ticker: "899901", aliases: ["899901","MS899901","M899901","ACWI ex US","ACWIxUS","ACWI ex-US"] },
    { name: "ACWI ex US Value",                        role: "benchmark",  ticker: "106037", aliases: ["106037","MS106037","M106037","ACWI ex US Value","ACWI ex-US Value"] },
    { name: "Artisan International Value",             role: "competitor", ticker: "APHKX",  aliases: ["APHKX"] },
    { name: "GQG Partners International Opportunities",role: "competitor", ticker: "GSIMX",  aliases: ["GSIMX"] },
    { name: "WCM Focused International Growth",        role: "competitor", ticker: "WCMIX",  aliases: ["WCMIX"] },
    { name: "WCM Focused International Opportunities", role: "competitor", ticker: "WCMOX",  aliases: ["WCMOX"] },
    { name: "S&P 500",                                 role: "benchmark",  ticker: "SP50",   aliases: ["SP50","SP500","S&P 500","SPX","SPY"] },
  ],
  FGL: [
    { name: "Silvercrest Focused Global Value",        role: "portfolio",  ticker: "FGL",    aliases: ["FGL"] },
    { name: "ACWI",                                    role: "benchmark",  ticker: "892400", aliases: ["892400","MS892400","M892400","ACWI","MSCI ACWI"] },
    { name: "ACWI Value",                              role: "benchmark",  ticker: "106039", aliases: ["106039","MS106039","M106039","ACWI Value","MSCI ACWI Value"] },
    { name: "Artisan Global Value",                    role: "competitor", ticker: "APHGX",  aliases: ["APHGX"] },
    { name: "GQG Partners Global Quality",             role: "competitor", ticker: "GQRIX",  aliases: ["GQRIX"] },
    { name: "WCM Focused Global Growth",               role: "competitor", ticker: "WCMGX",  aliases: ["WCMGX"] },
    { name: "S&P 500",                                 role: "benchmark",  ticker: "SP50",   aliases: ["SP50","SP500","S&P 500","SPX","SPY"] },
  ],
  GL: [
    { name: "Silvercrest Global Value",                role: "portfolio",  ticker: "GL",     aliases: ["GL"] },
    { name: "ACWI",                                    role: "benchmark",  ticker: "892400", aliases: ["892400","MS892400","M892400","ACWI","MSCI ACWI"] },
    { name: "ACWI Value",                              role: "benchmark",  ticker: "106039", aliases: ["106039","MS106039","M106039","ACWI Value","MSCI ACWI Value"] },
    { name: "Artisan Global Value",                    role: "competitor", ticker: "APHGX",  aliases: ["APHGX"] },
    { name: "GQG Partners Global Quality",             role: "competitor", ticker: "GQRIX",  aliases: ["GQRIX"] },
    { name: "WCM Focused Global Growth",               role: "competitor", ticker: "WCMGX",  aliases: ["WCMGX"] },
    { name: "S&P 500",                                 role: "benchmark",  ticker: "SP50",   aliases: ["SP50","SP500","S&P 500","SPX","SPY"] },
  ],
  EM: [
    { name: "Silvercrest Emerging Markets",            role: "portfolio",  ticker: "EM",     aliases: ["EM"] },
    { name: "MSCI EM",                                 role: "benchmark",  ticker: "891800", aliases: ["891800","MS891800","M891800","MSCI EM","EM Index"] },
    { name: "MSCI EM Value",                           role: "benchmark",  ticker: "106063", aliases: ["106063","MS106063","M106063","MSCI EM Value"] },
    { name: "GQG Partners Emerging Markets",           role: "competitor", ticker: "GQGIX",  aliases: ["GQGIX"] },
    { name: "Pacific NoS Global EM Equity",            role: "competitor", ticker: "GEME",   aliases: ["GEME"] },
    { name: "ACWI",                                    role: "benchmark",  ticker: "892400", aliases: ["892400","MS892400","M892400","ACWI","MSCI ACWI"] },
    { name: "ACWI ex US",                              role: "benchmark",  ticker: "899901", aliases: ["899901","MS899901","M899901","ACWI ex US","ACWIxUS","ACWI ex-US"] },
    { name: "S&P 500",                                 role: "benchmark",  ticker: "SP50",   aliases: ["SP50","SP500","S&P 500","SPX","SPY"] },
  ],
  SC: [
    { name: "Silvercrest International Small Cap Value", role: "portfolio",  ticker: "SC",       aliases: ["SC"] },
    { name: "ACWI ex US SC",                             role: "benchmark",  ticker: "MS655052", aliases: ["655052","MS655052","M655052","ACWI ex US SC","ACWI ex-US SC"] },
    { name: "ACWI ex US SC Value",                       role: "benchmark",  ticker: "MS655157", aliases: ["655157","MS655157","M655157","ACWI ex US SC Value","ACWI ex-US SC Value"] },
    { name: "Brandes International Small Cap",           role: "competitor", ticker: "BISAX",    aliases: ["BISAX"] },
    { name: "ACWI",                                      role: "benchmark",  ticker: "892400",   aliases: ["892400","MS892400","M892400","ACWI","MSCI ACWI"] },
    { name: "ACWI ex US",                                role: "benchmark",  ticker: "899901",   aliases: ["899901","MS899901","M899901","ACWI ex US","ACWIxUS","ACWI ex-US"] },
    { name: "S&P 500",                                   role: "benchmark",  ticker: "SP50",     aliases: ["SP50","SP500","S&P 500","SPX","SPY"] },
  ],
};

/* Given a portfolio code and an incoming header (column name from a CSV
 * upload or a series name on an existing entry), return the matching
 * default entry or null. Match priority: exact ticker → alias (case-
 * insensitive) → canonical name (case-insensitive). */
export function findDefaultSeries(portfolio, headerOrName) {
  const defs = DEFAULT_PERF_SERIES[portfolio];
  if (!defs || !headerOrName) return null;
  const h = String(headerOrName).trim();
  const hU = h.toUpperCase();
  /* Ticker exact match */
  for (let i = 0; i < defs.length; i++) {
    if (defs[i].ticker && defs[i].ticker.toUpperCase() === hU) return defs[i];
  }
  /* Alias (case-insensitive) */
  for (let i = 0; i < defs.length; i++) {
    const aliases = defs[i].aliases || [];
    for (let j = 0; j < aliases.length; j++) {
      if ((aliases[j] || "").toUpperCase() === hU) return defs[i];
    }
  }
  /* Canonical name (case-insensitive) */
  for (let i = 0; i < defs.length; i++) {
    if ((defs[i].name || "").toUpperCase() === hU) return defs[i];
  }
  return null;
}
