/* Shared company-name fuzzy matching used by every bulk-import path
 * (Tx, Ratios, Financials, Segments, EPS Revisions, Snapshot, GeoRev).
 *
 * Two-stage match:
 *   1. Exact lowercase trim match against company.name and
 *      company.usTickerName.
 *   2. Normalized match — strips common corporate suffixes (Inc, Plc,
 *      SA, AG, etc.) and punctuation, collapses whitespace, then
 *      compares. Lets "Schneider Electric SE" match "Schneider Electric"
 *      and "Volkswagen AG ADR" match "Volkswagen", etc.
 *
 * Previously inlined identically in 5+ places; consolidating here so
 * the suffix list is single-source-of-truth.
 */

const STOPWORDS_LONG = /\b(corporation|incorporated|international|holdings|holding|company|limited|group|ordinary|preferred|shares|class|depositary|depository|receipts|receipt|common|stock)\b/g;
const STOPWORDS_SHORT = /\b(co\.|inc\.|ltd\.|llc|plc|sa|ag|nv|se|co|inc|ltd|corp|gmbh|kgaa|ab|asa|oyj|spa|srl|bv|ord|com|adr|ads|gdr|pref|reit|shs|npv|cdi|cva|units|unit|jsc|pjsc|ojsc|oao|sab|bhd|tbk)\b/g;
const PUNCT = /[.,&'()\-\/]/g;

/* Reduce a company name to a comparable form: lowercase, no corporate
 * suffixes, no punctuation, single-spaced. */
export function normalizeCompanyName(n) {
  return (n || "").toLowerCase()
    .replace(STOPWORDS_LONG, "")
    .replace(STOPWORDS_SHORT, "")
    .replace(PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Find the first company in `companies` matching the given target name
 * (or null). Tries exact match first against name + usTickerName,
 * then normalized. Case-insensitive throughout. */
export function findCompanyByName(companies, target) {
  if (!target || !companies || companies.length === 0) return null;
  const tLower = String(target).toLowerCase().trim();
  if (!tLower) return null;
  const tNorm = normalizeCompanyName(target);
  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    const cn = (c.name || "").toLowerCase().trim();
    const un = (c.usTickerName || "").toLowerCase().trim();
    if (cn === tLower || un === tLower) return c;
    if (normalizeCompanyName(c.name) === tNorm) return c;
    if (un && normalizeCompanyName(c.usTickerName) === tNorm) return c;
  }
  return null;
}

/* Find a company by ticker (uppercase exact on any of its tickers)
 * with a fuzzy-name fallback. Used by bulk imports where the paste
 * may include a ticker column. */
export function findCompanyByTickerOrName(companies, ticker, name) {
  if (!companies || companies.length === 0) return null;
  const tk = (ticker || "").toUpperCase().trim();
  if (tk) {
    for (let i = 0; i < companies.length; i++) {
      const c = companies[i];
      const tickers = c.tickers || [];
      for (let j = 0; j < tickers.length; j++) {
        if ((tickers[j].ticker || "").toUpperCase().trim() === tk) return c;
      }
    }
  }
  return findCompanyByName(companies, name);
}
