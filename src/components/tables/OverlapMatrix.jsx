import { PORTFOLIOS } from '../../constants/index.js';

function OverlapMatrix({ companies }) {
  var ports = PORTFOLIOS.filter(function (p) {
    return companies.some(function (c) { return (c.portfolios || []).indexOf(p) >= 0; });
  });

  if (ports.length < 2) {
    return <p className="text-sm text-gray-500 dark:text-slate-400">Need at least 2 portfolios.</p>;
  }

  function overlap(a, b) {
    return companies.filter(function (c) {
      return (c.portfolios || []).indexOf(a) >= 0 && (c.portfolios || []).indexOf(b) >= 0;
    }).length;
  }

  function total(p) {
    return companies.filter(function (c) { return (c.portfolios || []).indexOf(p) >= 0; }).length;
  }

  return (
    <div className="overflow-x-auto">
      <div className="table border-collapse text-xs">
        {/* Header row */}
        <div className="table-row">
          <div className="table-cell px-2 py-1" />
          {ports.map(function (p) {
            return (
              <div key={p} className="table-cell px-2 py-1 font-semibold text-gray-900 dark:text-slate-100 text-center">
                {p}
                <div className="text-[10px] text-gray-500 dark:text-slate-400 font-normal">{total(p)}</div>
              </div>
            );
          })}
        </div>

        {/* Data rows */}
        {ports.map(function (pa) {
          return (
            <div key={pa} className="table-row">
              <div className="table-cell px-2 py-1 font-semibold text-gray-900 dark:text-slate-100 whitespace-nowrap">
                {pa}
              </div>
              {ports.map(function (pb) {
                var n = pa === pb ? total(pa) : overlap(pa, pb);
                var pct = pa === pb ? 100 : total(pa) > 0 ? Math.round(n / total(pa) * 100) : 0;
                /* Data-driven background color kept as inline style */
                var bg = pa === pb
                  ? undefined
                  : n === 0
                    ? undefined
                    : "rgba(99,102,241," + (0.1 + pct / 100 * 0.6) + ")";

                return (
                  <div
                    key={pb}
                    className={
                      "table-cell px-2.5 py-1.5 text-center text-gray-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded"
                      + (pa === pb ? " bg-slate-100 dark:bg-slate-800" : n === 0 ? " bg-white dark:bg-slate-900" : "")
                    }
                    style={bg ? { background: bg } : undefined}
                  >
                    {pa === pb ? (
                      <span className="text-gray-500 dark:text-slate-400">&mdash;</span>
                    ) : n > 0 ? (
                      <span>
                        <strong>{n}</strong>
                        <span className="text-gray-500 dark:text-slate-400"> ({pct}%)</span>
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">0</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="text-xs text-gray-500 dark:text-slate-400 mt-2">
        Numbers = shared companies. % = relative to row portfolio.
      </div>
    </div>
  );
}

export default OverlapMatrix;
