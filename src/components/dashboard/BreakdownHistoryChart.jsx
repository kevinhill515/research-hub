/* Quarterly history charts for the Sector / Country breakdown.
 *
 * Three views, controlled by `view` prop:
 *   - "stacked-port"  → stacked-area (sand) chart of the portfolio's
 *                       sector or country weights through time.
 *   - "stacked-bench" → same chart but for the benchmark.
 *   - "diff"          → multi-line chart of (portfolio - benchmark) per
 *                       sector/country through time. Positive = overweight.
 *
 * Data source: ctx.breakdownHistory[name][isoDate][bucket][label] = weight.
 * Populated by the dated 5-col benchmark import (Date, Name, Type, Item,
 * Value). `name` may be either a benchmark (e.g. "MSCI ACWI") or a
 * portfolio code (FGL, GL, etc.).
 *
 * Empty states are handled at the call site — this component assumes it
 * has at least one data point. Returns null otherwise so the caller can
 * skip the section.
 */

import { useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

/* Order labels for the stacked-area legend.
 *
 * Without `groupBy`: rank by total weight across history, biggest first
 * (visual hierarchy — dominant sectors render most prominently).
 *
 * With `groupBy(label) -> groupKey`: cluster all labels in the same group
 * together first, then sort within each group by total weight. This is
 * what the country chart uses to keep all "Asia/Pacific" countries
 * adjacent (and shared region color) in the stack instead of interleaved
 * with European countries by raw weight. Group order itself is ranked by
 * group total weight so the heaviest region anchors the chart. */
function rankLabels(history, name, bucket, groupBy) {
  const sums = {};
  const byDate = (history && history[name]) || {};
  Object.keys(byDate).forEach(function (d) {
    const slice = byDate[d] && byDate[d][bucket];
    if (!slice) return;
    Object.keys(slice).forEach(function (k) {
      sums[k] = (sums[k] || 0) + (slice[k] || 0);
    });
  });
  const labels = Object.keys(sums);
  if (!groupBy) {
    return labels.sort(function (a, b) { return sums[b] - sums[a]; });
  }
  /* Bucket per group, then concatenate groups in descending group-total order. */
  const byGroup = {};
  const groupSums = {};
  labels.forEach(function (k) {
    const g = groupBy(k) || "_other";
    (byGroup[g] = byGroup[g] || []).push(k);
    groupSums[g] = (groupSums[g] || 0) + sums[k];
  });
  const orderedGroups = Object.keys(byGroup).sort(function (a, b) { return groupSums[b] - groupSums[a]; });
  const out = [];
  orderedGroups.forEach(function (g) {
    byGroup[g].sort(function (a, b) { return sums[b] - sums[a]; }).forEach(function (k) { out.push(k); });
  });
  return out;
}

/* Build the recharts data array.
 *   mode "single": rows are { date, [label]: value } from history[name].
 *   mode "diff":   rows are { date, [label]: portValue - benchValue } using
 *                  the union of dates between portfolio and benchmark.
 *
 * Dates that appear only on one side in diff mode are skipped — without
 * both halves the diff is meaningless. */
function buildData(history, primaryName, benchName, bucket, mode) {
  const portByDate = (history && history[primaryName]) || {};
  const benchByDate = (history && history[benchName]) || {};

  if (mode === "single") {
    const dates = Object.keys(portByDate).sort();
    return dates.map(function (d) {
      const slice = (portByDate[d] && portByDate[d][bucket]) || {};
      const row = { date: d };
      Object.keys(slice).forEach(function (k) { row[k] = slice[k]; });
      return row;
    });
  }
  /* diff mode */
  const dates = Object.keys(portByDate)
    .filter(function (d) { return benchByDate[d]; })
    .sort();
  return dates.map(function (d) {
    const port  = (portByDate[d]  && portByDate[d][bucket])  || {};
    const bench = (benchByDate[d] && benchByDate[d][bucket]) || {};
    const labels = new Set([...Object.keys(port), ...Object.keys(bench)]);
    const row = { date: d };
    labels.forEach(function (k) {
      const p = port[k]  || 0;
      const b = bench[k] || 0;
      row[k] = p - b;
    });
    return row;
  });
}

/* Compact legend for stacked + diff charts. Replaces recharts' built-in
   legend so we can show the most-recent quarter's value next to each
   entry — what readers actually want to know at a glance.
 *
 * Three modes:
 *   - Stacked sector (no groupBy, mode "single"): one row per label,
 *     legend ordered largest -> smallest, value adjacent to the label.
 *   - Stacked country (groupBy supplied, mode "single"): one row per
 *     group (region), with the SUM of latest values + comma-separated
 *     members. Largest region first.
 *   - Diff (mode "diff"): one row per label, sorted by latest signed
 *     value descending — so biggest overweight reads at the top and
 *     biggest underweight at the bottom. Values formatted with leading
 *     sign for positive diffs.
 *
 * `data` is the recharts data array; the last row is the most recent
 * quarter (data is sorted ascending by date). */
function ValueLegend({ labels, data, groupBy, colorFor, mode }) {
  const latest = (data && data.length > 0) ? data[data.length - 1] : null;
  const isDiff = mode === "diff";
  const fmt = function (v) {
    if (!isFinite(v)) return "—";
    return (isDiff && v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  };

  /* Diff: one flat row per label, sorted by latest value descending. */
  if (isDiff) {
    const sorted = labels.slice().sort(function (a, b) {
      const va = latest ? (latest[a] || 0) : 0;
      const vb = latest ? (latest[b] || 0) : 0;
      return vb - va;
    });
    return (
      <div className="mt-2 flex justify-center"><div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-[11px]">
        {sorted.map(function (k) {
          const color = colorFor ? colorFor(k) : "#334155";
          const v = latest ? (latest[k] || 0) : 0;
          const sign = v >= 0 ? "#166534" : "#dc2626";
          return (
            <div key={k} className="flex items-center gap-1.5 min-w-0">
              <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-gray-700 dark:text-slate-300 truncate min-w-0" title={k}>{k}</span>
              <span className="font-mono tabular-nums shrink-0" style={{ color: sign }}>{fmt(v)}</span>
            </div>
          );
        })}
      </div></div>
    );
  }

  /* Stacked sector mode — straight row per label, biggest first.
     Value sits right next to the name (no flex-1 spacer). */
  if (!groupBy) {
    return (
      <div className="mt-2 flex justify-center"><div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-[11px]">
        {labels.map(function (k) {
          const color = colorFor ? colorFor(k) : "#334155";
          const v = latest ? (latest[k] || 0) : 0;
          return (
            <div key={k} className="flex items-center gap-1.5 min-w-0">
              <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-gray-700 dark:text-slate-300 truncate min-w-0" title={k}>{k}</span>
              <span className="font-mono tabular-nums text-gray-500 dark:text-slate-400 shrink-0">{fmt(v)}</span>
            </div>
          );
        })}
      </div></div>
    );
  }

  /* Stacked country mode — one row per region with summed total. */
  const seen = {};
  const groups = [];
  labels.forEach(function (k) {
    const g = groupBy(k) || "Other";
    if (!seen[g]) { seen[g] = []; groups.push(g); }
    seen[g].push(k);
  });
  /* Sum each region's latest values. */
  const totals = {};
  Object.keys(seen).forEach(function (g) {
    let s = 0;
    seen[g].forEach(function (k) { s += latest ? (latest[k] || 0) : 0; });
    totals[g] = s;
  });
  /* `groups` is in iteration order of `labels`. With labels biggest-first
     the regions are also biggest-first, which is what we want — so no
     reversal needed. */
  return (
    <div className="mt-2 grid grid-cols-1 gap-y-1 text-[11px]">
      {groups.map(function (g) {
        const sample = seen[g][0];
        const color = colorFor ? colorFor(sample) : "#334155";
        return (
          <div key={g} className="flex items-start gap-2">
            <span className="inline-block w-3 h-3 mt-0.5 rounded-sm shrink-0" style={{ background: color }} />
            <span className="font-semibold text-gray-800 dark:text-slate-200 shrink-0 w-24 truncate" title={g}>{g}</span>
            <span className="font-mono tabular-nums text-gray-700 dark:text-slate-300 shrink-0 w-12 text-right">{fmt(totals[g])}</span>
            <span className="text-gray-500 dark:text-slate-400 flex-1">{seen[g].join(", ")}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Format ISO YYYY-MM-DD as "Q1 '26" for the X axis. */
function quarterLabel(iso) {
  if (!iso || iso.length < 7) return iso || "";
  const y = iso.slice(2, 4);
  const m = parseInt(iso.slice(5, 7), 10);
  const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
  return "Q" + q + " '" + y;
}

export default function BreakdownHistoryChart({
  history, primaryName, benchName, bucket, view, colorFor,
  /* Optional group function for the country view. When supplied, the
     stacked-area legend is ordered by group (region) and labels in the
     same group cluster adjacently — combined with a region-coloring
     `colorFor`, this turns the country sand chart into a region-banded
     view while keeping country-level granularity in tooltips. */
  groupBy,
  height = 280,
}) {
  /* Pick which name's history feeds the chart, and which mode buildData uses. */
  const sourceName = view === "stacked-bench" ? benchName : primaryName;
  const mode = view === "diff" ? "diff" : "single";

  const data = useMemo(function () {
    return buildData(history, primaryName, benchName, bucket, mode);
  }, [history, primaryName, benchName, bucket, mode]);

  /* Labels in display order.
     - stacked: biggest first → renders first → drawn at the BOTTOM of
       the stack. Smallest is rendered last → drawn at the top. Legend
       below reads top-down largest → smallest in the same order.
     - diff:    sorted by most-recent signed value descending → biggest
       overweight first, biggest underweight last. */
  const labels = useMemo(function () {
    if (mode === "single") {
      return rankLabels(history, sourceName, bucket, groupBy);
    }
    /* diff — sort by the latest quarter's diff so the legend (and the
       Lines drawn order) puts overweight at top, underweight at bottom. */
    const latest = data.length > 0 ? data[data.length - 1] : null;
    const allKeys = {};
    data.forEach(function (row) {
      Object.keys(row).forEach(function (k) { if (k !== "date") allKeys[k] = true; });
    });
    return Object.keys(allKeys).sort(function (a, b) {
      const va = latest ? (latest[a] || 0) : 0;
      const vb = latest ? (latest[b] || 0) : 0;
      return vb - va;
    });
  }, [history, sourceName, bucket, mode, data]);

  if (!data || data.length === 0) {
    return (
      <div className="text-xs italic text-gray-500 dark:text-slate-400 py-6 text-center">
        No history data yet. Upload via Data Hub → Benchmarks using the dated 5-col format
        (Date, Name, Type, Item, Value).
      </div>
    );
  }

  const xTickFmt = function (d) { return quarterLabel(d); };
  const yTickFmt = function (v) { return (v >= 0 && mode === "diff" ? "+" : "") + v.toFixed(0) + "%"; };
  const tooltipFmt = function (v) {
    if (typeof v !== "number") return v;
    return (v >= 0 && mode === "diff" ? "+" : "") + v.toFixed(2) + "%";
  };

  if (mode === "single") {
    /* Custom ValueLegend below replaces recharts' default — it shows the
       most-recent quarter's value next to each label (or summed-by-region
       value when groupBy is provided), which is what readers actually
       want to know at a glance. */
    return (
      <div>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
            <XAxis dataKey="date" tickFormatter={xTickFmt} tick={{ fontSize: 11 }} />
            {/* Cap stacked weights at 100% — sector/country mixes shouldn't
                exceed 100. Hard domain stops recharts from auto-scaling
                up past 100 if uploaded values sum slightly over due to
                rounding. */}
            <YAxis tickFormatter={yTickFmt} tick={{ fontSize: 11 }} domain={[0, 100]} allowDataOverflow />
            <Tooltip
              formatter={tooltipFmt}
              labelFormatter={function (l) { return quarterLabel(l) + " (" + l + ")"; }}
              contentStyle={{ fontSize: 12 }}
              /* Sort hover entries greatest -> smallest by signed value.
                 In stacked mode this puts the heaviest sector/country at
                 the top of the popover; in diff mode it puts the most-
                 overweight first and most-underweight at the bottom. */
              itemSorter={function (item) { return -(item.value || 0); }}
            />
            {labels.map(function (k) {
              const c = colorFor ? colorFor(k) : "#334155";
              return (
                <Area
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stackId="weights"
                  stroke={c}
                  fill={c}
                  fillOpacity={0.85}
                  isAnimationActive={false}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
        <ValueLegend labels={labels} data={data} groupBy={groupBy} colorFor={colorFor} mode="single" />
      </div>
    );
  }
  /* diff mode — same custom ValueLegend so the most-recent diff sits
     next to each label, sorted overweight → underweight. */
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
          <XAxis dataKey="date" tickFormatter={xTickFmt} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={yTickFmt} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={tooltipFmt}
            labelFormatter={function (l) { return quarterLabel(l) + " (" + l + ")"; }}
            contentStyle={{ fontSize: 12 }}
            itemSorter={function (item) { return -(item.value || 0); }}
          />
          {labels.map(function (k) {
            const c = colorFor ? colorFor(k) : "#334155";
            return (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={c}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      <ValueLegend labels={labels} data={data} groupBy={null} colorFor={colorFor} mode="diff" />
    </div>
  );
}
