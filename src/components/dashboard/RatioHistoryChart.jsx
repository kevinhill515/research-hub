/* Inline chart for one ratio, opened by clicking a row in the
 * Characteristics → Ratios table. Plots up to three lines through the
 * available quarters: portfolio (solid), Core benchmark (dashed gray),
 * Value benchmark (dashed amber). All three pull from the same
 * breakdownHistory[name][date].ratios[key] source — caller supplies the
 * three names.
 */

import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

/* Format ISO YYYY-MM-DD as "Q1 '26" for compact X-axis ticks. */
function quarterLabel(iso) {
  if (!iso || iso.length < 7) return iso || "";
  const y = iso.slice(2, 4);
  const m = parseInt(iso.slice(5, 7), 10);
  const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
  return "Q" + q + " '" + y;
}

/* Build a 3-line history series for one ratio across portKey, coreBench,
 * and valueBench. Each row is { date, portfolio, core, value } with
 * missing sides as null. */
function buildSeries(history, portKey, coreBench, valueBench, ratioKey) {
  const get = function (name, d) {
    const slot = history && history[name] && history[name][d];
    if (!slot || !slot.ratios) return null;
    return ratioKey in slot.ratios ? slot.ratios[ratioKey] : null;
  };
  const dateSet = new Set();
  [portKey, coreBench, valueBench].forEach(function (n) {
    if (!n || !history || !history[n]) return;
    Object.keys(history[n]).forEach(function (d) { dateSet.add(d); });
  });
  return Array.from(dateSet).sort().map(function (d) {
    return {
      date: d,
      portfolio: get(portKey, d),
      core: get(coreBench, d),
      value: get(valueBench, d),
    };
  }).filter(function (row) {
    return row.portfolio !== null || row.core !== null || row.value !== null;
  });
}

export default function RatioHistoryChart({
  history, portKey, coreBench, valueBench, ratioKey, kind,
  height = 220,
}) {
  const data = useMemo(function () {
    return buildSeries(history, portKey, coreBench, valueBench, ratioKey);
  }, [history, portKey, coreBench, valueBench, ratioKey]);

  if (data.length === 0) {
    return (
      <div className="text-xs italic text-gray-500 dark:text-slate-400 py-4 text-center bg-slate-50 dark:bg-slate-800/40 rounded">
        No history uploaded for this ratio yet. Upload via Data Hub → Benchmarks
        with Type=Ratio (dated 5-col format) using either a benchmark name
        or a portfolio code.
      </div>
    );
  }

  /* Format Y-axis ticks per ratio kind. pct values are stored as decimals
     (0.184 → 18.4%); musd is plain millions; x is a multiple. */
  const yFmt = function (v) {
    if (v === null || v === undefined) return "";
    if (kind === "pct") return (v * 100).toFixed(1) + "%";
    if (kind === "musd") return Math.round(v).toLocaleString();
    if (kind === "x") return v.toFixed(1) + "x";
    return String(v);
  };
  const tipFmt = function (v, name) {
    if (v === null || v === undefined) return ["--", name];
    if (kind === "pct") return [(v * 100).toFixed(2) + "%", name];
    if (kind === "musd") return ["$" + Math.round(v).toLocaleString() + "M", name];
    if (kind === "x") return [v.toFixed(2) + "x", name];
    return [String(v), name];
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/40 rounded p-2 mt-1">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.3} />
          <XAxis dataKey="date" tickFormatter={quarterLabel} tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={yFmt} tick={{ fontSize: 10 }} width={60} />
          <Tooltip
            formatter={tipFmt}
            labelFormatter={function (l) { return quarterLabel(l) + " (" + l + ")"; }}
            contentStyle={{ fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
          <Line
            type="monotone"
            dataKey="portfolio"
            name={portKey || "Portfolio"}
            stroke="#1d4ed8"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="core"
            name={(coreBench || "Core") + " (Core)"}
            stroke="#64748b"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="value"
            name={(valueBench || "Value") + " (Value)"}
            stroke="#d97706"
            strokeWidth={2}
            strokeDasharray="2 4"
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
