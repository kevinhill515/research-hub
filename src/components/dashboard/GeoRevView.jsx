/* Dashboard → GeoRev: portfolio-weighted standardized geography rollup.
 *
 * For each portfolio (or All), aggregates each company's standardized
 * geography (Americas / Europe / Asia-Pac / Africa-ME and their
 * sub-countries) weighted by the company's rep weight. Result tells you
 * the portfolio's total revenue exposure to each region — same buckets
 * across companies so it's a true apples-to-apples view.
 *
 * Math (per region X):
 *   exposure_X = Σ_i [ companyRepWeight_i × stdShare_i_X ]
 *
 * Where stdShare_i_X is taken from each company's most recent fiscal
 * year that has standardized data. Different companies may have
 * different "as-of" dates — that's an acceptable approximation since
 * the alternative (forcing a common calendar year) would lose a lot
 * of recent data.
 */

import { useMemo, useState } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { PORTFOLIOS, PORT_NAMES } from '../../constants/index.js';
import { calcCompanyRepMV, calcTotalMV, buildTickerOwners } from '../../utils/portfolioMath.js';

const TILE = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3";
const PALETTE = [
  "#2563eb", "#059669", "#7c3aed", "#dc2626", "#ea580c",
  "#0891b2", "#ca8a04", "#be185d", "#475569", "#65a30d",
];
function colorFor(idx) { return PALETTE[idx % PALETTE.length]; }

/* The four canonical region names (in display order), matching the
 * names produced by segmentsParser. Region matching across companies
 * is by exact name — segmentsParser preserves the user's punctuation
 * (Asia/Pac, Africa/M.E.) so we just use those literal strings. */
const REGION_ORDER = ["Americas", "Europe", "Asia/Pac", "Africa/M.E."];

const TABST_ACTIVE   = "text-[13px] px-3 py-1.5 border-b-2 border-blue-600 text-gray-900 dark:text-slate-100 font-semibold cursor-pointer bg-transparent";
const TABST_INACTIVE = "text-[13px] px-3 py-1.5 border-b-2 border-transparent text-gray-500 dark:text-slate-400 cursor-pointer bg-transparent hover:text-gray-700 dark:hover:text-slate-300";

function lastFiniteIndex(arr) {
  if (!arr) return -1;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null && arr[i] !== undefined && isFinite(arr[i])) return i;
  }
  return -1;
}

/* Find a region by case-insensitive whitespace-ignoring name match. */
function findRegion(stdGeo, targetName) {
  if (!stdGeo || !stdGeo.regions) return null;
  const tk = targetName.toLowerCase().replace(/\s+/g, "").replace(/[\/\.\-]/g, "");
  for (let i = 0; i < stdGeo.regions.length; i++) {
    const r = stdGeo.regions[i];
    const k = (r.name || "").toLowerCase().replace(/\s+/g, "").replace(/[\/\.\-]/g, "");
    if (k === tk) return r;
  }
  return null;
}

function findCountry(region, targetName) {
  if (!region || !region.countries) return null;
  const tk = targetName.toLowerCase().trim();
  for (let i = 0; i < region.countries.length; i++) {
    const c = region.countries[i];
    if ((c.name || "").toLowerCase().trim() === tk) return c;
  }
  return null;
}

/* For one company, pull the latest standardized region/country shares
 * as a flat map { regionName: { share, countries: { countryName: share } } }.
 * Returns null when the company has no standardized data. */
function companyStdSnapshot(company) {
  /* Standardized geography lives under company.segments.geography.standardized
     (not segments.standardized — that path was a typo in v1 of GeoRev). */
  const std = company
    && company.segments
    && company.segments.geography
    && company.segments.geography.standardized;
  if (!std || !std.regions || std.regions.length === 0) return null;
  const out = {};
  std.regions.forEach(function (r) {
    const idx = lastFiniteIndex(r.values || []);
    if (idx < 0) return;
    const share = r.values[idx];
    if (share === null || !isFinite(share)) return;
    const countries = {};
    (r.countries || []).forEach(function (c) {
      const cIdx = lastFiniteIndex(c.values || []);
      if (cIdx < 0) return;
      const cs = c.values[cIdx];
      if (cs === null || !isFinite(cs)) return;
      countries[c.name] = cs;
    });
    out[r.name] = { share: share, countries: countries };
  });
  return Object.keys(out).length > 0 ? out : null;
}

export default function GeoRevView() {
  const { companies, repData, fxRates } = useCompanyContext();
  const [portKey, setPortKey] = useState(PORTFOLIOS[0] || "GL");
  const [expanded, setExpanded] = useState(function () { return new Set(); });

  const availablePorts = useMemo(function () {
    return PORTFOLIOS.filter(function (p) {
      const pRep = (repData || {})[p] || {};
      return Object.keys(pRep).length > 0;
    });
  }, [repData]);

  /* ---- Compute per-company rep weights for the selected portfolio. ---- */
  const ports = portKey === "All" ? null : [portKey];
  const portfolios = ports || PORTFOLIOS;

  const aggregation = useMemo(function () {
    /* Pool company rep MV across the selected portfolios so a multi-port
       view (All) sums weights correctly. */
    let totalPortMV = 0;
    const perCompanyMV = {};
    portfolios.forEach(function (p) {
      const pRep = (repData || {})[p] || {};
      const inPort  = companies.filter(function (c) { return (c.portfolios || []).indexOf(p) >= 0; });
      const others  = companies.filter(function (c) { return (c.portfolios || []).indexOf(p)  < 0; });
      const owners  = buildTickerOwners(inPort, others);
      const totalMV = calcTotalMV(inPort, pRep, fxRates, owners);
      totalPortMV += totalMV;
      inPort.forEach(function (c) {
        const mv = calcCompanyRepMV(c, pRep, fxRates, owners);
        if (mv > 0) perCompanyMV[c.id] = (perCompanyMV[c.id] || 0) + mv;
      });
    });

    /* For each company with std-geo data, apply weight × share to the
       running totals. Track which companies contributed (covered),
       which are missing data, and which have data that doesn't sum to
       ~100% (so the user knows where the diluted aggregates come from). */
    const regionTotals = {};   /* regionName -> weighted exposure */
    const countryTotals = {};  /* "regionName::countryName" -> weighted exposure */
    let coveredMV = 0;
    const missingCompanies = [];
    const incompleteCompanies = []; /* sum of std regions outside [98%, 102%] */
    Object.keys(perCompanyMV).forEach(function (id) {
      const co = companies.find(function (c) { return c.id === id; });
      if (!co) return;
      const mv = perCompanyMV[id];
      const w = totalPortMV > 0 ? mv / totalPortMV : 0;
      const snap = companyStdSnapshot(co);
      if (!snap) {
        missingCompanies.push({ name: co.name, weight: w });
        return;
      }
      coveredMV += mv;
      let coSum = 0;
      Object.keys(snap).forEach(function (regionName) {
        const r = snap[regionName];
        regionTotals[regionName] = (regionTotals[regionName] || 0) + w * r.share;
        coSum += r.share;
        Object.keys(r.countries).forEach(function (cname) {
          const k = regionName + "::" + cname;
          countryTotals[k] = (countryTotals[k] || 0) + w * r.countries[cname];
        });
      });
      /* Flag companies whose std-geo sum is outside [98%, 102%]. */
      if (coSum < 0.98 || coSum > 1.02) {
        incompleteCompanies.push({ name: co.name, weight: w, sum: coSum });
      }
    });

    /* Build display rows in canonical region order. Country sub-rows
       are aggregated by name within each region, sorted by exposure. */
    const regionRows = REGION_ORDER.map(function (regionName) {
      const exp = regionTotals[regionName] || 0;
      const countries = [];
      Object.keys(countryTotals).forEach(function (k) {
        const parts = k.split("::");
        if (parts[0] === regionName) {
          countries.push({ name: parts[1], exposure: countryTotals[k] });
        }
      });
      countries.sort(function (a, b) { return b.exposure - a.exposure; });
      return { name: regionName, exposure: exp, countries: countries };
    });

    /* Also include any std regions present in the data but not in the
       canonical order (defensive — shouldn't happen if templates are
       consistent). */
    Object.keys(regionTotals).forEach(function (rn) {
      if (REGION_ORDER.indexOf(rn) < 0) {
        const countries = [];
        Object.keys(countryTotals).forEach(function (k) {
          const parts = k.split("::");
          if (parts[0] === rn) countries.push({ name: parts[1], exposure: countryTotals[k] });
        });
        regionRows.push({ name: rn, exposure: regionTotals[rn], countries: countries });
      }
    });

    /* Aggregate sum — useful sanity check. Should be close to coverage
       fraction (i.e. the percentage of portfolio MV that has std data). */
    const totalExposure = regionRows.reduce(function (s, r) { return s + r.exposure; }, 0);

    /* Sort missing companies by weight desc so the user sees the biggest
       coverage gaps first. Same for incomplete (sorted by deviation
       from 100% so the worst offenders are obvious). */
    missingCompanies.sort(function (a, b) { return b.weight - a.weight; });
    incompleteCompanies.sort(function (a, b) {
      return Math.abs(b.sum - 1) - Math.abs(a.sum - 1);
    });

    return {
      regionRows: regionRows,
      totalExposure: totalExposure,
      coverageFraction: totalPortMV > 0 ? coveredMV / totalPortMV : 0,
      missingCompanies: missingCompanies,
      incompleteCompanies: incompleteCompanies,
      totalPortMV: totalPortMV,
    };
  }, [companies, repData, fxRates, portKey]);

  function toggle(name) {
    setExpanded(function (prev) {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const { regionRows, totalExposure, coverageFraction, missingCompanies, incompleteCompanies, totalPortMV } = aggregation;
  const empty = totalPortMV <= 0 || regionRows.every(function (r) { return r.exposure === 0; });

  return (
    <div>
      {/* Portfolio tabs */}
      <div className="flex gap-1 mb-3 border-b border-slate-200 dark:border-slate-700 pb-2 flex-wrap">
        {(availablePorts.length > 0 ? availablePorts : PORTFOLIOS).concat(["All"]).map(function (p) {
          return (
            <button key={p} type="button" onClick={function () { setPortKey(p); }}
                    className={portKey === p ? TABST_ACTIVE : TABST_INACTIVE}>
              {p === "All" ? "All" : p}
            </button>
          );
        })}
      </div>

      {/* Header */}
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
          Geographic Revenue Exposure — {portKey === "All" ? "All Portfolios" : (PORT_NAMES[portKey] || portKey)}
        </div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400">
          Portfolio-weighted rollup of standardized geography from each holding's most recent FY.
        </div>
        <div className="ml-auto flex items-center gap-3 text-[10px]">
          <span className="text-gray-500 dark:text-slate-400">
            Coverage: <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{(coverageFraction * 100).toFixed(0)}%</span>
            <span className="text-gray-400 dark:text-slate-500 italic ml-1">of portfolio MV</span>
          </span>
          <span className="text-gray-500 dark:text-slate-400">
            Σ regions: <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{(totalExposure * 100).toFixed(1)}%</span>
          </span>
        </div>
      </div>

      {empty ? (
        <div className="text-sm text-gray-500 dark:text-slate-400 italic py-6">
          No standardized geography data for this portfolio yet. Upload via Company Detail → Data Hub → Segments for each holding.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <div className={TILE}>
              <div className="grid gap-2 px-1 pb-1 border-b border-slate-200 dark:border-slate-700 text-[9px] uppercase tracking-wide text-gray-400 dark:text-slate-500"
                   style={{ gridTemplateColumns: "minmax(140px, 1.5fr) 2fr 90px" }}>
                <div>Region</div>
                <div></div>
                <div className="text-right">Portfolio Exposure</div>
              </div>
              <div className="space-y-0.5 mt-1">
                {regionRows.map(function (r, ri) {
                  const isOpen = expanded.has(r.name);
                  const hasCountries = r.countries.length > 0;
                  /* Bar width scales to 100% of the portfolio (so a 40%
                     region uses 40% of the bar track). */
                  const w = Math.max(0, Math.min(100, r.exposure * 100));
                  return (
                    <div key={r.name}>
                      <div className={"grid gap-2 px-1 py-1 text-[11px] items-center rounded " +
                          (hasCountries ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800" : "")}
                          style={{ gridTemplateColumns: "minmax(140px, 1.5fr) 2fr 90px" }}
                          onClick={hasCountries ? function () { toggle(r.name); } : undefined}>
                        <span className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-1">
                          {hasCountries ? (
                            <span className="inline-block w-3 text-gray-400 dark:text-slate-500">{isOpen ? "▾" : "▸"}</span>
                          ) : <span className="inline-block w-3" />}
                          <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: colorFor(ri) }} />
                          {r.name}
                          {hasCountries && (
                            <span className="text-[9px] text-gray-400 dark:text-slate-500 font-normal ml-1">
                              ({r.countries.length} {r.countries.length === 1 ? "country" : "countries"})
                            </span>
                          )}
                        </span>
                        <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 rounded" style={{ width: w + "%", background: colorFor(ri), opacity: 0.85 }} />
                        </div>
                        <span className="tabular-nums font-semibold text-right text-gray-900 dark:text-slate-100">
                          {(r.exposure * 100).toFixed(1) + "%"}
                        </span>
                      </div>
                      {isOpen && hasCountries && (
                        <div className="ml-6 space-y-0.5 mb-1">
                          {r.countries.map(function (c) {
                            const cw = Math.max(0, Math.min(100, c.exposure * 100));
                            return (
                              <div key={c.name} className="grid gap-2 px-1 py-0.5 text-[10px] items-center"
                                   style={{ gridTemplateColumns: "minmax(140px, 1.5fr) 2fr 90px" }}>
                                <span className="text-gray-600 dark:text-slate-400 pl-3">{c.name}</span>
                                <div className="h-2 bg-slate-50 dark:bg-slate-900 rounded relative overflow-hidden">
                                  <div className="absolute left-0 top-0 bottom-0 rounded" style={{ width: cw + "%", background: colorFor(ri), opacity: 0.5 }} />
                                </div>
                                <span className="tabular-nums text-right text-gray-700 dark:text-slate-300">
                                  {(c.exposure * 100).toFixed(2) + "%"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Coverage / missing-data sidebar */}
          <div className="flex flex-col gap-3">
            <div className={TILE}>
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">Coverage</div>
              <div className="text-3xl font-bold tabular-nums text-gray-900 dark:text-slate-100">
                {(coverageFraction * 100).toFixed(1) + "%"}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-slate-400 italic">
                of portfolio MV has standardized geography uploaded
              </div>
              {coverageFraction < 0.99 && (
                <div className="mt-2 text-[10px] text-amber-700 dark:text-amber-400 italic">
                  Aggregate region totals are diluted by the {((1 - coverageFraction) * 100).toFixed(1)}% of MV that's missing data — they sum to {(totalExposure * 100).toFixed(1)}% rather than 100%.
                </div>
              )}
            </div>
            {missingCompanies.length > 0 && (
              <div className={TILE}>
                <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">
                  Missing Data ({missingCompanies.length})
                </div>
                <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-1.5">
                  Holdings without standardized geography. Largest weights first.
                </div>
                <div className="space-y-0.5">
                  {missingCompanies.slice(0, 12).map(function (m) {
                    return (
                      <div key={m.name} className="flex items-center justify-between text-[11px]">
                        <span className="truncate text-gray-700 dark:text-slate-300">{m.name}</span>
                        <span className="tabular-nums text-gray-500 dark:text-slate-400 ml-2">{(m.weight * 100).toFixed(1) + "%"}</span>
                      </div>
                    );
                  })}
                  {missingCompanies.length > 12 && (
                    <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-1">
                      … and {missingCompanies.length - 12} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {incompleteCompanies.length > 0 && (
              <div className={TILE}>
                <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">
                  Doesn't Sum to 100% ({incompleteCompanies.length})
                </div>
                <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-1.5">
                  Holdings whose standardized regions sum outside 98–102% — re-check the upload for missing or double-counted regions. Sorted by deviation.
                </div>
                <div className="space-y-0.5">
                  {incompleteCompanies.slice(0, 12).map(function (m) {
                    const dev = m.sum - 1;
                    const color = dev > 0.005 ? "#dc2626" : dev < -0.005 ? "#d97706" : "#64748b";
                    return (
                      <div key={m.name} className="flex items-center justify-between text-[11px]">
                        <span className="truncate text-gray-700 dark:text-slate-300 flex-1">{m.name}</span>
                        <span className="tabular-nums text-gray-500 dark:text-slate-400 mx-2">{(m.weight * 100).toFixed(1) + "%"}</span>
                        <span className="tabular-nums font-semibold w-14 text-right" style={{ color: color }}>
                          {(m.sum * 100).toFixed(1) + "%"}
                        </span>
                      </div>
                    );
                  })}
                  {incompleteCompanies.length > 12 && (
                    <div className="text-[10px] text-gray-400 dark:text-slate-500 italic mt-1">
                      … and {incompleteCompanies.length - 12} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
