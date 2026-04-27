/* Side-by-Side company comparison.
 *
 * Pick up to 4 companies and see their key metrics in adjacent columns:
 * basic info, current valuation, margins, returns, balance sheet,
 * trailing returns, and 5Y P/E range. Color codes the best value in
 * each row green and the worst red so a quick scan tells you which
 * name leads on what dimension.
 *
 * Reads from existing fields on each company (metrics, ratios,
 * valuation, perf) — no new data uploads required.
 */

import { useMemo, useState } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { isFiniteNum } from '../../utils/numbers.js';
import { fmtBn, fmtPct, lastHistorical, lastNFinite } from '../../utils/chart.js';

const TILE = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900";
const MAX_COMPANIES = 4;

/* Each row in the comparison table: how to extract the value, what
 * units to display in, and which direction is "good" (for color
 * coding). */
const ROWS = [
  /* Basic info — no polarity coloring */
  { group: "Basic",     label: "Sector",   kind: "text",  get: function (c) { return c.sector || "--"; } },
  { group: "Basic",     label: "Country",  kind: "text",  get: function (c) { return c.country || "--"; } },
  { group: "Basic",     label: "Tier",     kind: "text",  get: function (c) { return c.tier || "--"; } },
  { group: "Basic",     label: "Status",   kind: "text",  get: function (c) { return c.status || "--"; } },
  { group: "Basic",     label: "Mkt Cap",  kind: "bn",    get: function (c) { return parseFloatOrNull((c.metrics || {}).mktCap); } },

  /* Valuation — lower is generally better */
  { group: "Valuation", label: "P/E",      kind: "x",     polarity: "lower",  get: function (c) {
      const peCur = parseFloatOrNull((c.valuation || {}).peCurrent);
      if (peCur !== null) return peCur;
      return parseFloatOrNull((c.metrics || {}).fpe);
  } },
  { group: "Valuation", label: "P/Sales",  kind: "x",     polarity: "lower",  get: function (c) {
      return latestRatio(c, "Price/Sales");
  } },
  { group: "Valuation", label: "P/Book",   kind: "x",     polarity: "lower",  get: function (c) {
      return latestRatio(c, "Price/Book Value");
  } },
  { group: "Valuation", label: "EV/EBITDA",kind: "x",     polarity: "lower",  get: function (c) {
      return latestRatio(c, "Enterprise Value/EBITDA");
  } },
  { group: "Valuation", label: "FCF Yld",  kind: "pct",   polarity: "higher", get: function (c) {
      return parseFloatOrNull((c.metrics || {}).fcfYld);
  } },
  { group: "Valuation", label: "Div Yld",  kind: "pct",   polarity: "higher", get: function (c) {
      const r = latestRatio(c, "Dividend Yield (%)");
      if (r !== null) return r > 1.5 ? r / 100 : r;
      return parseFloatOrNull((c.metrics || {}).divYld);
  } },

  /* Margins — higher is better */
  { group: "Margins",   label: "Gross",    kind: "pct",   polarity: "higher", get: function (c) {
      return latestRatioPct(c, "Gross Margin", "grMgn");
  } },
  { group: "Margins",   label: "Operating",kind: "pct",   polarity: "higher", get: function (c) {
      return latestRatioPct(c, "Operating Margin", null);
  } },
  { group: "Margins",   label: "Net",      kind: "pct",   polarity: "higher", get: function (c) {
      return latestRatioPct(c, "Net Margin", "netMgn");
  } },

  /* Returns — higher is better */
  { group: "Returns",   label: "ROIC",     kind: "pct",   polarity: "higher", get: function (c) {
      return latestRatioPct(c, "Return on Invested Capital", null);
  } },
  { group: "Returns",   label: "ROE",      kind: "pct",   polarity: "higher", get: function (c) {
      return latestRatioPct(c, "Return on Equity", null);
  } },
  { group: "Returns",   label: "ROA",      kind: "pct",   polarity: "higher", get: function (c) {
      return latestRatioPct(c, "Return on Assets", null);
  } },

  /* Balance — lower leverage / higher coverage is better */
  { group: "Balance",   label: "Net Debt/EBITDA", kind: "x", polarity: "lower",  get: function (c) {
      return latestRatio(c, "Net Debt/EBITDA");
  } },
  { group: "Balance",   label: "Int Coverage",     kind: "x", polarity: "higher", get: function (c) {
      const r = latestRatio(c, "EBIT/Interest Expense (Int. Coverage)");
      if (r !== null) return r;
      return parseFloatOrNull((c.metrics || {}).intCov);
  } },

  /* Trailing returns — higher is better */
  { group: "Trailing",  label: "5D",       kind: "pct",   polarity: "higher", get: function (c) {
      const ord = (c.tickers || []).find(function (t) { return t.isOrdinary; }) || {};
      const v = ord.perf5d;
      if (!v || v === "#N/A") return null;
      const n = parseFloat(v);
      return isFiniteNum(n) ? n / 100 : null;
  } },
  { group: "Trailing",  label: "MTD",      kind: "pct",   polarity: "higher", get: function (c) { return parseFloatOrNull(((c.metrics || {}).perf || {}).MTD); } },
  { group: "Trailing",  label: "QTD",      kind: "pct",   polarity: "higher", get: function (c) { return parseFloatOrNull(((c.metrics || {}).perf || {}).QTD); } },
  { group: "Trailing",  label: "3M",       kind: "pct",   polarity: "higher", get: function (c) { return parseFloatOrNull(((c.metrics || {}).perf || {})["3M"]); } },
  { group: "Trailing",  label: "6M",       kind: "pct",   polarity: "higher", get: function (c) { return parseFloatOrNull(((c.metrics || {}).perf || {})["6M"]); } },
  { group: "Trailing",  label: "YTD",      kind: "pct",   polarity: "higher", get: function (c) { return parseFloatOrNull(((c.metrics || {}).perf || {}).YTD); } },
  { group: "Trailing",  label: "1Y",       kind: "pct",   polarity: "higher", get: function (c) { return parseFloatOrNull(((c.metrics || {}).perf || {})["1Y"]); } },
];

function parseFloatOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isFiniteNum(n) ? n : null;
}

function latestRatio(c, ratioName) {
  const arr = c && c.ratios && c.ratios.values && c.ratios.values[ratioName];
  if (!arr) return null;
  return lastHistorical(arr, c.ratios.estimate);
}

/* Pulls a percent-form ratio as decimal. Uses the 1.5-magnitude
 * rule: any value > 1.5 in the series means raw percent (38.5);
 * else decimal (0.385). Falls back to company.metrics[metricKey]
 * if ratios doesn't have it. */
function latestRatioPct(c, ratioName, metricKey) {
  const arr = c && c.ratios && c.ratios.values && c.ratios.values[ratioName];
  if (arr) {
    const last = lastHistorical(arr, c.ratios.estimate);
    if (last === null) return null;
    const rawAsPct = arr.some(function (v) { return isFiniteNum(v) && Math.abs(v) > 1.5; });
    return rawAsPct ? last / 100 : last;
  }
  if (metricKey && c.metrics && c.metrics[metricKey] != null) {
    return parseFloatOrNull(c.metrics[metricKey]);
  }
  return null;
}

function fmtVal(v, kind) {
  if (v === null || v === undefined) return "--";
  if (kind === "text") return String(v);
  if (kind === "x")    return isFiniteNum(v) ? v.toFixed(1) + "x" : "--";
  if (kind === "pct")  return isFiniteNum(v) ? (v * 100).toFixed(1) + "%" : "--";
  if (kind === "bn")   return isFiniteNum(v) ? "$" + fmtBn(v) : "--";
  return String(v);
}

/* For each row, find the best and worst values across the selected
 * companies (skipping nulls). Returns { bestIdx, worstIdx }. Polarity
 * determines which direction is "best". */
function rankRow(values, polarity) {
  if (!polarity) return { bestIdx: -1, worstIdx: -1 };
  let bestIdx = -1, worstIdx = -1;
  let best = polarity === "higher" ? -Infinity : Infinity;
  let worst = polarity === "higher" ? Infinity : -Infinity;
  values.forEach(function (v, i) {
    if (!isFiniteNum(v)) return;
    if (polarity === "higher") {
      if (v > best)  { best = v;  bestIdx = i; }
      if (v < worst) { worst = v; worstIdx = i; }
    } else {
      if (v < best)  { best = v;  bestIdx = i; }
      if (v > worst) { worst = v; worstIdx = i; }
    }
  });
  /* If only one company has a value, no winner ranking */
  const finiteCount = values.filter(isFiniteNum).length;
  if (finiteCount < 2) return { bestIdx: -1, worstIdx: -1 };
  return { bestIdx: bestIdx, worstIdx: worstIdx };
}

/* ======================================================================== */

export default function CompareView() {
  const { companies } = useCompanyContext();
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");

  const selected = useMemo(function () {
    return selectedIds.map(function (id) { return companies.find(function (c) { return c.id === id; }); }).filter(Boolean);
  }, [selectedIds, companies]);

  /* Search results — exclude already-selected, fuzzy match name+ticker. */
  const results = useMemo(function () {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return companies
      .filter(function (c) { return selectedIds.indexOf(c.id) < 0; })
      .filter(function (c) {
        if ((c.name || "").toLowerCase().indexOf(q) >= 0) return true;
        if ((c.usTickerName || "").toLowerCase().indexOf(q) >= 0) return true;
        return (c.tickers || []).some(function (t) {
          return (t.ticker || "").toLowerCase().indexOf(q) >= 0;
        });
      })
      .slice(0, 8);
  }, [companies, search, selectedIds]);

  function add(id) {
    if (selectedIds.length >= MAX_COMPANIES) return;
    if (selectedIds.indexOf(id) >= 0) return;
    setSelectedIds(selectedIds.concat([id]));
    setSearch("");
  }
  function remove(id) {
    setSelectedIds(selectedIds.filter(function (x) { return x !== id; }));
  }
  function clearAll() { setSelectedIds([]); }

  /* Group rows for rendering section headers */
  const grouped = useMemo(function () {
    const out = {};
    const order = [];
    ROWS.forEach(function (r) {
      if (!out[r.group]) { out[r.group] = []; order.push(r.group); }
      out[r.group].push(r);
    });
    return { out: out, order: order };
  }, []);

  return (
    <div>
      <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Side-by-Side Compare</div>
      <div className="text-xs text-gray-500 dark:text-slate-400 mb-3">
        Pick up to {MAX_COMPANIES} companies. Best value in each row is highlighted green, worst red. "--" means data isn't loaded for that company.
      </div>

      {/* Selected company chips + search input */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {selected.map(function (c) {
          return (
            <div key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700 text-[12px]">
              <span className="font-semibold text-gray-900 dark:text-slate-100">{c.name}</span>
              <button onClick={function () { remove(c.id); }} className="text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400" title="Remove">×</button>
            </div>
          );
        })}
        {selected.length < MAX_COMPANIES && (
          <div className="relative">
            <input
              value={search}
              onChange={function (e) { setSearch(e.target.value); }}
              placeholder={selected.length === 0 ? "Add company…" : "Add another…"}
              className="text-sm px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              style={{ width: 200 }}
            />
            {results.length > 0 && (
              <div className="absolute top-full left-0 mt-1 z-20 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg max-h-64 overflow-y-auto">
                {results.map(function (c) {
                  return (
                    <button
                      key={c.id}
                      onClick={function () { add(c.id); }}
                      className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-slate-50 dark:hover:bg-slate-800 text-gray-900 dark:text-slate-100"
                    >
                      <span className="font-medium">{c.name}</span>
                      {(c.tickers || [])[0] && (c.tickers[0].ticker) && (
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 ml-1">{c.tickers[0].ticker}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {selected.length > 0 && (
          <button onClick={clearAll} className="text-[11px] text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 ml-auto">Clear all</button>
        )}
      </div>

      {selected.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-slate-400 italic py-6">
          Pick at least 2 companies to compare.
        </div>
      ) : (
        <div className={TILE + " overflow-x-auto"}>
          <div className="grid" style={{ gridTemplateColumns: "200px repeat(" + selected.length + ", minmax(140px, 1fr))" }}>
            {/* Header */}
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700"></div>
            {selected.map(function (c) {
              return (
                <div key={c.id} className="px-3 py-2 bg-slate-50 dark:bg-slate-800 text-[12px] font-semibold text-gray-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 truncate" title={c.name}>
                  {c.name}
                </div>
              );
            })}

            {/* Rows by group */}
            {grouped.order.map(function (gname) {
              return (
                <div key={gname} style={{ display: "contents" }}>
                  {/* Group header — full row */}
                  <div className="col-span-full px-3 py-1 text-[10px] uppercase tracking-wide text-gray-700 dark:text-slate-300 font-semibold bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700"
                       style={{ gridColumn: "1 / -1" }}>
                    {gname}
                  </div>
                  {grouped.out[gname].map(function (row) {
                    const values = selected.map(function (c) { return row.get(c); });
                    const ranking = rankRow(values, row.polarity);
                    return (
                      <div key={row.label} style={{ display: "contents" }}>
                        <div className="px-3 py-1 text-[11px] text-gray-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">{row.label}</div>
                        {values.map(function (v, ci) {
                          let bgClass = "";
                          if (ci === ranking.bestIdx)  bgClass = "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 font-semibold";
                          else if (ci === ranking.worstIdx) bgClass = "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 font-semibold";
                          return (
                            <div
                              key={ci}
                              className={"px-3 py-1 text-[11px] tabular-nums border-b border-slate-100 dark:border-slate-800 " + bgClass}
                            >
                              {fmtVal(v, row.kind)}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
