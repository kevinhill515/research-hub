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

/* Sort labels for stacked-area legend so the largest band is on top
   (visual hierarchy: most-weighted sectors render last/most prominent). */
function rankLabels(history, name, bucket) {
  const sums = {};
  const byDate = (history && history[name]) || {};
  Object.keys(byDate).forEach(function (d) {
    const slice = byDate[d] && byDate[d][bucket];
    if (!slice) return;
    Object.keys(slice).forEach(function (k) {
      sums[k] = (sums[k] || 0) + (slice[k] || 0);
    });
  });
  return Object.keys(sums).sort(function (a, b) { return sums[b] - sums[a]; });
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
  height = 280,
}) {
  /* Pick which name's history feeds the chart, and which mode buildData uses. */
  const sourceName = view === "stacked-bench" ? benchName : primaryName;
  const mode = view === "diff" ? "diff" : "single";

  const data = useMemo(function () {
    return buildData(history, primaryName, benchName, bucket, mode);
  }, [history, primaryName, benchName, bucket, mode]);

  /* Labels in display order. For stacked, biggest at the bottom of the
     stack (renders first → drawn at the bottom). For diff lines, just
     order by total absolute diff so dominant lines are on top in legend. */
  const labels = useMemo(function () {
    if (mode === "single") {
      return rankLabels(history, sourceName, bucket).reverse(); /* small first → big on top of stack */
    }
    /* diff: rank by sum of |diff| across dates */
    const absSum = {};
    data.forEach(function (row) {
      Object.keys(row).forEach(function (k) {
        if (k === "date") return;
        absSum[k] = (absSum[k] || 0) + Math.abs(row[k] || 0);
      });
    });
    return Object.keys(absSum).sort(function (a, b) { return absSum[b] - absSum[a]; });
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
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
          <XAxis dataKey="date" tickFormatter={xTickFmt} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={yTickFmt} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={tooltipFmt}
            labelFormatter={function (l) { return quarterLabel(l) + " (" + l + ")"; }}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
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
    );
  }
  /* diff mode */
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
        <XAxis dataKey="date" tickFormatter={xTickFmt} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={yTickFmt} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={tooltipFmt}
          labelFormatter={function (l) { return quarterLabel(l) + " (" + l + ")"; }}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
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
  );
}
