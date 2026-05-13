/* Metrics view of the Companies list.
 *
 * Renders a wide table of FactSet-sourced metrics per company. Companies
 * arrive pre-sorted by the parent (matching Standard view's order); the
 * user can override with header clicks (3-state: default → desc → asc →
 * back to default).
 *
 * Columns beyond the default-visible set can be toggled via the Columns
 * button. By default all "+2" (year+2) projection columns are hidden so
 * the table fits on most screens without horizontal scroll.
 *
 * Row background tints follow the Tier-based coloring used in the
 * Standard view (light mode only, matching CoRow behavior). */

import { useMemo, useState, useEffect, useRef } from 'react';
import { truncName, getTiers, tierBg, tierPillStyle, todayStr } from '../../utils/index.js';
import { supaGet, supaUpsert } from '../../api/index.js';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import FpeRangeMini from '../ui/FpeRangeMini.jsx';

export const METRICS_COLS = [
  /* key, label, kind, width, default-visible
     Current (LTM) columns are placed before their +1/+2 siblings but
     default-hidden so existing users don't see their view suddenly
     double in width. Toggle them on via the Columns picker. */
  { key: "__tier",     label: "Tier",       kind: "tier",     w: 72,  vis: true  },
  { key: "__name",     label: "Name",       kind: "name",     w: 170, vis: true  },
  { key: "mktCap",     label: "MktCap",     kind: "bn",       w: 70,  vis: true  },
  { key: "__fpeRange", label: "FPE Range",  kind: "fperange", w: 110, vis: true  },
  { key: "fpe",        label: "P/E",        kind: "x",        w: 70,  vis: false },
  { key: "fpe1",       label: "P/E +1",     kind: "x",        w: 70,  vis: true  },
  { key: "fpe2",       label: "P/E +2",     kind: "x",        w: 70,  vis: false },
  { key: "fcfYld",     label: "FCF Yld",    kind: "pct",      w: 80,  vis: false },
  { key: "fcfYld1",    label: "FCF Yld +1", kind: "pct",      w: 80,  vis: true  },
  { key: "fcfYld2",    label: "FCF Yld +2", kind: "pct",      w: 80,  vis: false },
  { key: "divYld",     label: "Div Yld",    kind: "pct",      w: 80,  vis: false },
  { key: "divYld1",    label: "Div Yld +1", kind: "pct",      w: 80,  vis: true  },
  { key: "divYld2",    label: "Div Yld +2", kind: "pct",      w: 80,  vis: false },
  { key: "payout",     label: "Payout",     kind: "pct",      w: 75,  vis: false },
  { key: "payout1",    label: "Payout +1",  kind: "pct",      w: 75,  vis: true  },
  { key: "payout2",    label: "Payout +2",  kind: "pct",      w: 75,  vis: false },
  { key: "netDE",      label: "Net D/E",    kind: "pct",      w: 80,  vis: false },
  { key: "netDE1",     label: "Net D/E +1", kind: "pct",      w: 80,  vis: true  },
  { key: "netDE2",     label: "Net D/E +2", kind: "pct",      w: 80,  vis: false },
  { key: "intCov",     label: "Int Cov",    kind: "ratio",    w: 70,  vis: true  },
  { key: "ltEPS",      label: "LT EPS",     kind: "pct",      w: 70,  vis: true  },
  { key: "grMgn",      label: "Gr Mgn",     kind: "pct",      w: 80,  vis: false },
  { key: "grMgn1",     label: "Gr Mgn +1",  kind: "pct",      w: 80,  vis: true  },
  { key: "grMgn2",     label: "Gr Mgn +2",  kind: "pct",      w: 80,  vis: false },
  { key: "netMgn",     label: "Net Mgn",    kind: "pct",      w: 80,  vis: false },
  { key: "netMgn1",    label: "Net Mgn +1", kind: "pct",      w: 80,  vis: true  },
  { key: "netMgn2",    label: "Net Mgn +2", kind: "pct",      w: 80,  vis: false },
  { key: "gpAss",      label: "GP/Ass",     kind: "pct",      w: 75,  vis: false },
  { key: "gpAss1",     label: "GP/Ass +1",  kind: "pct",      w: 75,  vis: true  },
  { key: "gpAss2",     label: "GP/Ass +2",  kind: "pct",      w: 75,  vis: false },
  { key: "npAss",      label: "NP/Ass",     kind: "pct",      w: 75,  vis: false },
  { key: "npAss1",     label: "NP/Ass +1",  kind: "pct",      w: 75,  vis: true  },
  { key: "npAss2",     label: "NP/Ass +2",  kind: "pct",      w: 75,  vis: false },
  { key: "opROE",      label: "Op ROE",     kind: "pct",      w: 75,  vis: false },
  { key: "opROE1",     label: "Op ROE +1",  kind: "pct",      w: 75,  vis: true  },
  { key: "opROE2",     label: "Op ROE +2",  kind: "pct",      w: 75,  vis: false },
  /* Performance — colored cells */
  { key: "perf.MTD",   label: "MTD",        kind: "perf",     w: 60,  vis: true  },
  { key: "perf.QTD",   label: "QTD",        kind: "perf",     w: 60,  vis: true  },
  { key: "perf.3M",    label: "3M",         kind: "perf",     w: 60,  vis: true  },
  { key: "perf.6M",    label: "6M",         kind: "perf",     w: 60,  vis: true  },
  { key: "perf.YTD",   label: "YTD",        kind: "perf",     w: 60,  vis: true  },
  { key: "perf.1Y",    label: "1Y",         kind: "perf",     w: 60,  vis: true  },
];

export const DEFAULT_METRICS_VISIBLE = new Set(METRICS_COLS.filter(function (c) { return c.vis; }).map(function (c) { return c.key; }));

function getCellValue(company, key) {
  const m = company.metrics || {};
  if (key === "__name")     return company.name;
  if (key === "__tier")     return company.tier;
  if (key === "__fpeRange") return null; /* not sortable */
  if (key.startsWith("perf.")) {
    /* Trailing returns moved to the Prices upload (per-ticker), so
       company.metrics.perf is no longer maintained. Read from the
       company's tickers instead — US (USD) preferred, falling back
       to ord (local). Same convention as Snapshot + Companies-table
       5D%. Legacy company.metrics.perf still consulted last for any
       data uploaded before the move. */
    const period = key.slice(5);
    const tks = company.tickers || [];
    const us = tks.find(function (t) { return (t.currency || "").toUpperCase() === "USD" && !t.isOrdinary; });
    const ord = tks.find(function (t) { return t.isOrdinary; });
    if (us  && us.perf  && us.perf[period]  !== undefined && us.perf[period]  !== null) return us.perf[period];
    if (ord && ord.perf && ord.perf[period] !== undefined && ord.perf[period] !== null) return ord.perf[period];
    return m.perf ? m.perf[period] : null;
  }
  return m[key];
}

function fmt(v, kind) {
  if (v === null || v === undefined || (typeof v === "number" && isNaN(v))) return "--";
  if (typeof v === "string" && v.trim() === "") return "--";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (isNaN(n)) return typeof v === "string" ? v : "--";
  switch (kind) {
    case "bn":    return "$" + n.toFixed(1) + "B";
    case "x":     return n.toFixed(1) + "x";
    case "pct":   return (n * 100).toFixed(1) + "%";
    case "perf":  return (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
    case "ratio": return n.toFixed(1);
    default:      return String(v);
  }
}

function perfStyle(v) {
  if (v === null || v === undefined || isNaN(v)) return null;
  const n = v * 100;
  if (Math.abs(n) < 0.05) return null;
  const mag = Math.min(Math.abs(n) / 15, 1);
  const alpha = 0.06 + mag * 0.44;
  if (n >= 0) return { background: `rgba(22,101,52,${alpha})`, color: mag > 0.5 ? "#14532d" : undefined };
  return { background: `rgba(220,38,38,${alpha})`, color: mag > 0.5 ? "#7f1d1d" : undefined };
}

function TierCell({ tier }) {
  const tiers = getTiers(tier);
  if (tiers.length === 0) return <span className="text-gray-400 dark:text-slate-500">--</span>;
  return (
    <div className="flex gap-0.5 flex-wrap">
      {tiers.map(function (t) {
        const ps = tierPillStyle(t);
        return (
          <span key={t} className="text-[9px] px-1 py-0 rounded-full font-medium"
                style={{ background: ps.bg, color: ps.color }}>
            {t}
          </span>
        );
      })}
    </div>
  );
}

/* Kinds that can be numerically screened. Tier / Name / FPE-range
   aren't comparable so they don't get a filter row. */
const SCREENABLE_KINDS = new Set(["bn", "x", "pct", "perf", "ratio"]);

/* Normalize the user's typed value to match the storage scale of the
   column. Percent / perf columns store decimals (0.07 = 7%), so a user
   typing "7" means 0.07. All other numeric kinds compare 1:1. */
function userInputToStorageScale(rawInput, kind) {
  if (rawInput === "" || rawInput == null) return null;
  const cleaned = String(rawInput).replace(/[%,\s]/g, "");
  const n = parseFloat(cleaned);
  if (!isFinite(n)) return null;
  if (kind === "pct" || kind === "perf") return n / 100;
  return n;
}

/* Given a cell's raw stored value + a filter spec, returns:
   - "pass"   the cell satisfies the constraint
   - "fail"   the cell exists but breaks the constraint
   - "none"   no filter on this column, or cell has no value to compare
*/
function evalCell(rawValue, filter, kind) {
  if (!filter || !filter.op || filter.value === "" || filter.value == null) return "none";
  const threshold = userInputToStorageScale(filter.value, kind);
  if (threshold === null) return "none";
  const n = typeof rawValue === "number" ? rawValue : parseFloat(rawValue);
  if (!isFinite(n)) return "fail"; /* missing data counts as a fail */
  if (filter.op === ">") return n > threshold ? "pass" : "fail";
  if (filter.op === "<") return n < threshold ? "pass" : "fail";
  if (filter.op === ">=") return n >= threshold ? "pass" : "fail";
  if (filter.op === "<=") return n <= threshold ? "pass" : "fail";
  return "none";
}

export default function MetricsTable({ companies, search, onSelectCompany, dark, visible }) {
  /* null sortKey = use parent-supplied order (Standard sort). */
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null);
  /* Visibility is controlled by the parent (unified Columns picker in
     App.jsx). Fall back to the default set if not provided. */
  const effectiveVisible = visible || DEFAULT_METRICS_VISIBLE;

  /* Screen state.
     - filters: per-column { op, value }. Sticky across re-renders.
     - screenActive: when true, rows that don't pass are hidden.
       When false, all rows render but failing cells are tinted red so
       the user can preview which names would survive a screen.
     - leeway1: allow ONE failed condition per company (escape-hatch for
       borderline candidates).
     Restored from localStorage so a half-built screen survives page
     reloads — set up once and refine over multiple sessions. */
  const [filters, setFilters] = useState(function () {
    try { return JSON.parse(localStorage.getItem("ccd:metricsFilters") || "{}"); } catch (e) { return {}; }
  });
  const [screenActive, setScreenActive] = useState(false);
  const [leeway1, setLeeway1] = useState(function () {
    try { return localStorage.getItem("ccd:metricsLeeway1") === "1"; } catch (e) { return false; }
  });
  function updateFilter(key, patch) {
    setFilters(function (prev) {
      const next = Object.assign({}, prev);
      const cur = Object.assign({ op: ">", value: "" }, prev[key] || {}, patch);
      if (!cur.value) delete next[key];
      else next[key] = cur;
      try { localStorage.setItem("ccd:metricsFilters", JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }
  function setLeeway(v) { setLeeway1(v); try { localStorage.setItem("ccd:metricsLeeway1", v ? "1" : "0"); } catch (e) {} }
  function clearFilters() {
    setFilters({});
    setActiveScreenId(null);
    try { localStorage.removeItem("ccd:metricsFilters"); } catch (e) {}
  }

  /* Named saved screens — stored in Supabase `meta` so anyone on the
     team can load them. The user's CURRENT filter state stays in
     localStorage (per-browser) so two users can have different working
     screens at once. Save As creates a named entry everyone sees;
     loading a saved screen overwrites the working state. */
  const { currentUser } = useCompanyContext();
  const [savedScreens, setSavedScreens] = useState([]);
  const [activeScreenId, setActiveScreenId] = useState(null); /* id of currently-loaded screen */
  const [screenMenuOpen, setScreenMenuOpen] = useState(false);
  const screenMenuRef = useRef();
  useClickOutside(screenMenuRef, function () { setScreenMenuOpen(false); }, screenMenuOpen);

  /* Load saved screens once on mount. */
  useEffect(function () {
    let cancelled = false;
    supaGet("meta", "key", "metricsScreens").then(function (row) {
      if (cancelled || !row || !row.value) return;
      try {
        const arr = JSON.parse(row.value);
        if (Array.isArray(arr)) setSavedScreens(arr);
      } catch (e) {}
    }).catch(function () {});
    return function () { cancelled = true; };
  }, []);

  function persistScreens(next) {
    setSavedScreens(next);
    supaUpsert("meta", { key: "metricsScreens", value: JSON.stringify(next) }).catch(function () {});
  }

  function loadScreen(s) {
    setFilters(s.filters || {});
    if (s.leeway1 !== undefined) setLeeway(!!s.leeway1);
    setActiveScreenId(s.id);
    try { localStorage.setItem("ccd:metricsFilters", JSON.stringify(s.filters || {})); } catch (e) {}
    setScreenMenuOpen(false);
  }

  function saveAs() {
    const name = (window.prompt("Save screen as:") || "").trim();
    if (!name) return;
    const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(36).slice(2));
    const entry = {
      id: id, name: name, filters: filters, leeway1: leeway1,
      createdBy: currentUser || "", createdAt: todayStr(), updatedAt: todayStr(),
    };
    persistScreens(savedScreens.concat([entry]));
    setActiveScreenId(id);
    setScreenMenuOpen(false);
  }

  function saveOverActive() {
    if (!activeScreenId) return;
    const next = savedScreens.map(function (s) {
      if (s.id !== activeScreenId) return s;
      return Object.assign({}, s, { filters: filters, leeway1: leeway1, updatedAt: todayStr() });
    });
    persistScreens(next);
  }

  function deleteScreen(id) {
    if (!window.confirm("Delete this screen for everyone?")) return;
    persistScreens(savedScreens.filter(function (s) { return s.id !== id; }));
    if (activeScreenId === id) setActiveScreenId(null);
  }

  const activeScreen = savedScreens.find(function (s) { return s.id === activeScreenId; });
  /* Has the current filter state diverged from the loaded screen? */
  const screenDirty = !!activeScreen && JSON.stringify(activeScreen.filters || {}) !== JSON.stringify(filters);

  const filtered = useMemo(function () {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(function (c) {
      if ((c.name || "").toLowerCase().indexOf(q) >= 0) return true;
      return (c.tickers || []).some(function (t) { return (t.ticker || "").toLowerCase().indexOf(q) >= 0; });
    });
  }, [companies, search]);

  /* Per-(company, col) pass/fail map and per-company fail count.
     Precompute once so cell rendering is cheap. */
  const screenStats = useMemo(function () {
    const activeCols = Object.keys(filters).filter(function (k) {
      const col = METRICS_COLS.find(function (c) { return c.key === k; });
      return col && SCREENABLE_KINDS.has(col.kind) && filters[k].value !== "";
    });
    const byCo = {};
    filtered.forEach(function (c) {
      let fails = 0;
      const cell = {};
      activeCols.forEach(function (k) {
        const col = METRICS_COLS.find(function (cc) { return cc.key === k; });
        const v = getCellValue(c, k);
        const status = evalCell(v, filters[k], col.kind);
        cell[k] = status;
        if (status === "fail") fails++;
      });
      const passes = leeway1 ? fails <= 1 : fails === 0;
      byCo[c.id] = { cell: cell, fails: fails, passes: passes, activeColCount: activeCols.length };
    });
    return { byCo: byCo, activeColCount: activeCols.length };
  }, [filtered, filters, leeway1]);

  /* Apply screen if user has activated it. Skip when no active filters
     so toggling Screen on with no filters doesn't hide everything. */
  const screened = useMemo(function () {
    if (!screenActive || screenStats.activeColCount === 0) return filtered;
    return filtered.filter(function (c) {
      const s = screenStats.byCo[c.id];
      return s && s.passes;
    });
  }, [filtered, screenActive, screenStats]);

  const rendered = useMemo(function () {
    if (sortKey === null) return screened; /* parent order */
    const mult = sortDir === "asc" ? 1 : -1;
    return screened.slice().sort(function (a, b) {
      const va = getCellValue(a, sortKey);
      const vb = getCellValue(b, sortKey);
      if (sortKey === "__name" || sortKey === "__tier") {
        return mult * String(va || "").localeCompare(String(vb || ""));
      }
      const na = typeof va === "number" ? va : parseFloat(va);
      const nb = typeof vb === "number" ? vb : parseFloat(vb);
      const aBad = va === null || va === undefined || isNaN(na);
      const bBad = vb === null || vb === undefined || isNaN(nb);
      if (aBad && bBad) return 0;
      if (aBad) return 1;
      if (bBad) return -1;
      return mult * (na - nb);
    });
  }, [screened, sortKey, sortDir]);

  function handleHeaderClick(key) {
    const col = METRICS_COLS.find(function (c) { return c.key === key; });
    if (!col) return;
    if (col.kind === "fperange" || col.key === "__tier") return; /* not sortable */
    /* First click: default direction. Numeric cols -> desc, text -> asc. */
    const firstDir = (col.kind === "name") ? "asc" : "desc";
    if (sortKey !== key) {
      setSortKey(key); setSortDir(firstDir);
    } else if (sortDir === firstDir) {
      setSortDir(firstDir === "asc" ? "desc" : "asc");
    } else {
      /* Third click — clear sort, fall back to parent order */
      setSortKey(null); setSortDir(null);
    }
  }

  const visibleCols = METRICS_COLS.filter(function (c) { return effectiveVisible.has(c.key); });
  const hasMetrics = rendered.filter(function (c) { return c.metrics; }).length;

  const activeFilterCount = screenStats.activeColCount;
  const passingCount = activeFilterCount > 0 ? filtered.filter(function (c) { return (screenStats.byCo[c.id] || {}).passes; }).length : filtered.length;

  return (
    <div>
      {/* Screen toolbar — sits above the table so the user can toggle
          screening + leeway without scrolling away from the data. */}
      <div className="flex items-center gap-2 flex-wrap mb-2 text-xs">
        <button
          onClick={function () { setScreenActive(function (s) { return !s; }); }}
          disabled={activeFilterCount === 0}
          className={"px-3 py-1 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed " + (screenActive
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800")}
          title={activeFilterCount === 0 ? "Set at least one filter on a column header" : (screenActive ? "Showing names that pass the screen — click to show all" : "Filter to names that pass all set criteria")}
        >
          {screenActive ? "✓ Screen on" : "Screen"}
        </button>
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-gray-700 dark:text-slate-300">
          <input type="checkbox" checked={leeway1} onChange={function (e) { setLeeway(e.target.checked); }} className="cursor-pointer" />
          <span>Allow 1 fail</span>
        </label>
        {activeFilterCount > 0 && (
          <span className="text-gray-500 dark:text-slate-400">
            {activeFilterCount} criteri{activeFilterCount === 1 ? "on" : "a"} active · <span className="font-semibold text-gray-700 dark:text-slate-300">{passingCount}</span> of {filtered.length} pass{leeway1 ? " (≤1 fail)" : ""}
          </span>
        )}
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 underline">Clear filters</button>
        )}

        {/* Saved screens — pulled from team-wide meta. The currently
            loaded screen name appears on the button; ↻ marks unsaved
            edits on top of a loaded screen. */}
        <div className="relative ml-auto" ref={screenMenuRef}>
          <button
            onClick={function () { setScreenMenuOpen(function (s) { return !s; }); }}
            className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {activeScreen ? "📋 " + activeScreen.name + (screenDirty ? " ↻" : "") : "📋 Saved screens"} ▾
          </button>
          {screenMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+4px)] z-[200] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg min-w-[260px] max-h-[60vh] overflow-y-auto">
              <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 flex gap-2">
                <button onClick={saveAs} disabled={activeFilterCount === 0} className="text-[11px] px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">Save as…</button>
                {activeScreen && screenDirty && (
                  <button onClick={saveOverActive} className="text-[11px] px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Save changes</button>
                )}
              </div>
              {savedScreens.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-gray-500 dark:text-slate-400 italic">No saved screens yet. Build a filter and click Save as.</div>
              ) : (
                savedScreens.slice().sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); }).map(function (s) {
                  const active = s.id === activeScreenId;
                  return (
                    <div key={s.id} className={"flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 " + (active ? "bg-blue-50 dark:bg-blue-900/30" : "")}>
                      <span onClick={function () { loadScreen(s); }} className="flex-1 cursor-pointer">
                        <span className={"text-xs " + (active ? "font-semibold text-blue-800 dark:text-blue-300" : "text-gray-900 dark:text-slate-100")}>{s.name}</span>
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 ml-1.5">{Object.keys(s.filters || {}).length} criteri{Object.keys(s.filters || {}).length === 1 ? "on" : "a"}{s.createdBy ? " · " + s.createdBy : ""}</span>
                      </span>
                      <span onClick={function () { deleteScreen(s.id); }} title="Delete screen" className="text-[11px] text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700 dark:hover:text-red-300">×</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">
        {hasMetrics} of {rendered.length} companies have metrics data.
      </div>

      {/* On mobile the metrics table is much wider than the viewport
          and previously got clipped by overflow-hidden. Allow horizontal
          scrolling within the bordered container; keep overflow-y visible
          so the sticky thead still attaches to the page viewport (rather
          than to this container, which would chop off the head when the
          page scrolls vertically). */}
      <div
        className="border border-slate-200 dark:border-slate-700 rounded-md"
        style={{ overflowX: "auto", overflowY: "visible" }}
      >
        <table className="text-xs w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {visibleCols.map(function (col) {
                const active = sortKey === col.key;
                const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
                const sortable = col.kind !== "fperange" && col.key !== "__tier";
                /* Pin the Name column to the left edge so the company
                   name stays visible while horizontal scrolling. The
                   sticky-left cell needs its own opaque background; we
                   reuse the header's bg-slate-50/-800. Higher z-index
                   than the regular sticky-top thead so the top-left
                   corner cell stacks above both planes. */
                const isName = col.kind === "name";
                return (
                  <th
                    key={col.key}
                    onClick={sortable ? function () { handleHeaderClick(col.key); } : undefined}
                    className={"sticky top-0 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-[10px] uppercase tracking-wide text-left font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap border-b border-slate-200 dark:border-slate-700 " +
                      (isName ? "left-0 z-20 " : "z-10 ") +
                      (sortable ? "cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 select-none" : "")}
                    style={{ minWidth: col.w }}
                  >
                    {col.label}{arrow}
                  </th>
                );
              })}
            </tr>
            {/* Filter row — one cell per column. Screenable columns get
                an op + value input; others are blank. Inputs stop click
                propagation so typing doesn't trigger header sort. */}
            <tr>
              {visibleCols.map(function (col) {
                const isName = col.kind === "name";
                const screenable = SCREENABLE_KINDS.has(col.kind);
                const f = filters[col.key] || { op: ">", value: "" };
                return (
                  <th
                    key={col.key + "-flt"}
                    className={"sticky bg-slate-50 dark:bg-slate-800 px-1 py-1 border-b border-slate-200 dark:border-slate-700 " + (isName ? "left-0 z-20 " : "z-10 ")}
                    style={{ top: 28, minWidth: col.w }}
                  >
                    {screenable ? (
                      <div className="flex items-center gap-0.5" onClick={function (e) { e.stopPropagation(); }}>
                        <select
                          value={f.op}
                          onChange={function (e) { updateFilter(col.key, { op: e.target.value }); }}
                          className="text-[10px] px-0.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-mono"
                        >
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                          <option value=">=">≥</option>
                          <option value="<=">≤</option>
                        </select>
                        <input
                          type="text"
                          value={f.value}
                          onChange={function (e) { updateFilter(col.key, { value: e.target.value }); }}
                          placeholder={col.kind === "pct" || col.kind === "perf" ? "%" : (col.kind === "bn" ? "B" : col.kind === "x" ? "x" : "")}
                          className="text-[10px] w-full px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-mono"
                          style={{ minWidth: 32 }}
                        />
                      </div>
                    ) : (
                      <span />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rendered.map(function (c) {
              const rowBgLight = tierBg(c.tier);
              const rowStyle = dark ? undefined : { background: rowBgLight };
              return (
                <tr
                  key={c.id}
                  onClick={function () { onSelectCompany(c); }}
                  style={rowStyle}
                  className="border-t border-slate-100 dark:border-slate-800 hover:brightness-95 dark:hover:bg-slate-800/40 cursor-pointer transition-all"
                >
                  {visibleCols.map(function (col) {
                    if (col.kind === "tier") {
                      return (
                        <td key={col.key} className="px-2 py-1 align-middle" style={{ minWidth: col.w }}>
                          <TierCell tier={c.tier} />
                        </td>
                      );
                    }
                    if (col.kind === "name") {
                      /* Sticky-left so the name stays visible during
                         horizontal scroll. Cell needs an opaque bg —
                         the row's tier-tinted bg in light mode, slate-950
                         in dark, white as fallback. */
                      const stickyBg = dark
                        ? "#020617" /* slate-950 */
                        : (rowBgLight || "#ffffff");
                      return (
                        <td key={col.key}
                            className="sticky left-0 z-[5] px-2 py-1 text-gray-900 dark:text-slate-100 font-medium whitespace-nowrap"
                            style={{ minWidth: col.w, background: stickyBg }}
                            title={c.name}>
                          {truncName(c.name, 22)}
                        </td>
                      );
                    }
                    if (col.kind === "fperange") {
                      return (
                        <td key={col.key} className="px-2 py-1 align-middle" style={{ minWidth: col.w }}>
                          {(function () {
                            const el = <FpeRangeMini valuation={c.valuation} width={100} />;
                            return el || <span className="text-gray-400 dark:text-slate-500">--</span>;
                          })()}
                        </td>
                      );
                    }
                    const v = getCellValue(c, col.key);
                    const text = fmt(v, col.kind);
                    const style = col.kind === "perf" ? perfStyle(v) : null;
                    /* Screen tint: failing cells get a red overlay
                       regardless of whether Screen is active, so the
                       user can preview which cells break which
                       criteria. The perf-style tint is replaced (not
                       layered) so a perf cell that also fails reads
                       as "failed" rather than "green and red." */
                    const screenStatus = (screenStats.byCo[c.id] || { cell: {} }).cell[col.key];
                    const cellStyle = screenStatus === "fail"
                      ? Object.assign({ minWidth: col.w }, { background: "rgba(220,38,38,0.22)", color: dark ? "#fca5a5" : "#7f1d1d", fontWeight: 600 })
                      : Object.assign({ minWidth: col.w }, style || {});
                    return (
                      <td
                        key={col.key}
                        className="px-2 py-1 text-right font-mono text-gray-700 dark:text-slate-300 whitespace-nowrap"
                        style={cellStyle}
                        title={screenStatus === "fail" && filters[col.key] ? "Fails " + filters[col.key].op + " " + filters[col.key].value : undefined}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
