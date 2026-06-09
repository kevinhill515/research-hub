/* Portfolios → Outliers subtab.
 *
 * Reads meta.accountHoldings (uploaded via Data Hub → Account Holdings)
 * and surfaces accounts whose weight in a given parent ticker deviates
 * meaningfully from the portfolio-wide mean. Each outlier row supports
 * a free-text note + a status pill (Intentional / Action / blank) so
 * the team can mark a known-good deviation vs one that still needs to
 * be brought into line.
 *
 * Outlier definition: |weight - portMean| > tolerancePct (toggleable
 * 0.25 / 0.5 / 1.0 ppt). The threshold defaults to 0.5 ppt.
 */
import { useState, useMemo } from 'react';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { PORTFOLIOS, PORT_NAMES } from '../../constants/index.js';

const STATUS_OPTIONS = [
  { key: "",            label: "—",         bg: "transparent",   color: "#64748b" },
  { key: "intentional", label: "Intentional",bg: "#dcfce7",      color: "#166534" },
  { key: "action",      label: "Action",     bg: "#fee2e2",      color: "#991b1b" },
];
const STATUS_STYLE = STATUS_OPTIONS.reduce(function(acc, s){ acc[s.key]=s; return acc; }, {});

const THRESHOLDS = [0.25, 0.5, 1.0];

export default function OutliersView() {
  const { accountHoldings, accountHoldingsUploadedAt, accountHoldingsNotes, setAccountHoldingsNote, companies } = useCompanyContext();

  /* Ticker → company name lookup. Indexes both the raw ticker AND a
     "-US" / "-USD"-stripped variant so an uploaded "SHEL-US" matches
     a company stored with the bare "SHEL". Same for the reverse —
     stripping handles either direction depending on which side carries
     the suffix. */
  const tickerToName = useMemo(function(){
    const m = {};
    function add(tk, name){
      if(!tk) return;
      var u = String(tk).toUpperCase();
      if(!m[u]) m[u] = name || "";
      /* Index a suffix-stripped variant too — handles uploads with
         "-US" appended to US-listed tickers. */
      var stripped = u.replace(/-(US|USD)$/i, "");
      if(stripped !== u && !m[stripped]) m[stripped] = name || "";
    }
    (companies || []).forEach(function(c){
      (c.tickers || []).forEach(function(t){
        add(t && t.ticker, c.name);
      });
      if(c.ticker) add(c.ticker, c.name);
    });
    return m;
  }, [companies]);
  /* Look up a ticker by trying the raw form first, then the
     "-US" / "-USD"-stripped variant. Mirrors the indexing above so the
     match works regardless of which side carries the suffix. */
  function lookupName(tk){
    if(!tk) return "";
    var u = String(tk).toUpperCase();
    if(tickerToName[u]) return tickerToName[u];
    var stripped = u.replace(/-(US|USD)$/i, "");
    if(stripped !== u && tickerToName[stripped]) return tickerToName[stripped];
    return "";
  }
  const [portFilter, setPortFilter] = useState("All");
  const [threshold, setThreshold] = useState(0.25);
  const [showAll, setShowAll] = useState(false); /* false = only show outliers */
  const [hideCash, setHideCash] = useState(true);   /* hide CASH-US / DIVACC pseudo-tickers */

  /* Tickers we consider "cash placeholders" — uninteresting noise on
     the outliers view. CASH-US is the canonical USD cash bucket; we
     also drop DIVACC and bare CASH for the same reason. Matched case-
     insensitively against the parent ticker. */
  function isCashTicker(tk) {
    var u = String(tk || "").toUpperCase();
    return u === "CASH-US" || u === "CASH" || u === "DIVACC" || u === "CASH-USD" || u === "USD-CASH";
  }

  /* Build rows: for each (portfolio, ticker), compute mean across
     accounts and emit one row per (portfolio, ticker, account) with
     the account's weight + deviation from mean. */
  const rows = useMemo(function(){
    const out = [];
    const ports = Object.keys(accountHoldings || {}).filter(function(p){
      return portFilter === "All" || p === portFilter;
    });
    ports.forEach(function(p){
      const accounts = accountHoldings[p] || {};
      const accountList = Object.keys(accounts);
      /* tickerStats: { [ticker]: { count, sum, mean, weightByAccount } } */
      const tickerStats = {};
      accountList.forEach(function(account){
        const tickers = accounts[account] || {};
        Object.keys(tickers).forEach(function(tk){
          if(hideCash && isCashTicker(tk)) return;
          const w = parseFloat(tickers[tk]);
          if(!isFinite(w) || w <= 0) return;
          if(!tickerStats[tk]) tickerStats[tk] = { count: 0, sum: 0, weightByAccount: {} };
          tickerStats[tk].count++;
          tickerStats[tk].sum += w;
          tickerStats[tk].weightByAccount[account] = w;
        });
      });
      /* Emit one row per (account × every ticker that ANY account in
         this portfolio holds). Accounts missing a ticker get a row
         with weight=0 — surfaces "BBRINTV is missing ATD-CA but the
         rest of the portfolio has ~3.7%" as a large negative
         deviation. Mean is computed only across accounts that
         actually hold the ticker (so it reads as "what the holders
         own on average"); the missing account compares against that
         same benchmark. */
      Object.keys(tickerStats).forEach(function(tk){
        const stats = tickerStats[tk];
        const mean = stats.count > 0 ? stats.sum / stats.count : 0;
        accountList.forEach(function(account){
          const w = stats.weightByAccount[account];
          const isMissing = (w === undefined);
          const weight = isMissing ? 0 : w;
          const dev = weight - mean;
          out.push({
            portfolio: p,
            ticker: tk,
            account: account,
            weight: weight,
            mean: mean,
            dev: dev,
            absDev: Math.abs(dev),
            count: stats.count,        /* holders only */
            totalAccts: accountList.length,
            isMissing: isMissing,
            key: p + "|" + account + "|" + tk,
          });
        });
      });
    });
    /* Sort by portfolio → account → biggest abs deviation per account
       → ticker. Groups all of one account's rows together; outliers
       within each account float to the top of their block. */
    out.sort(function(a, b){
      if(a.portfolio !== b.portfolio) return a.portfolio.localeCompare(b.portfolio);
      if(a.account !== b.account) return a.account.localeCompare(b.account);
      if(b.absDev !== a.absDev) return b.absDev - a.absDev;
      return a.ticker.localeCompare(b.ticker);
    });
    return out;
  }, [accountHoldings, portFilter, hideCash]);

  const filtered = useMemo(function(){
    if(showAll) return rows;
    return rows.filter(function(r){ return r.absDev > threshold; });
  }, [rows, showAll, threshold]);

  /* Group by portfolio → account for display. */
  const byPortAccount = useMemo(function(){
    const m = {};
    filtered.forEach(function(r){
      if(!m[r.portfolio]) m[r.portfolio] = {};
      if(!m[r.portfolio][r.account]) m[r.portfolio][r.account] = [];
      m[r.portfolio][r.account].push(r);
    });
    return m;
  }, [filtered]);

  const portsInData = Object.keys(accountHoldings || {});
  const totalAccountsByPort = useMemo(function(){
    const m = {};
    portsInData.forEach(function(p){
      m[p] = Object.keys(accountHoldings[p] || {}).length;
    });
    return m;
  }, [accountHoldings, portsInData]);

  if (portsInData.length === 0) {
    return (
      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-4 py-6 text-center">
        <div className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">No account holdings uploaded yet</div>
        <div className="text-[11px] text-gray-500 dark:text-slate-400">
          Upload via Data Hub → Account Holdings (4 cols: Account, Parent Ticker, % Weight, Portfolio).
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header: upload stamp + controls */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div>
          <div className="text-base font-semibold text-gray-900 dark:text-slate-100">Account Holdings — Outliers</div>
          {accountHoldingsUploadedAt && (
            <div className="text-[11px] text-gray-500 dark:text-slate-400">Last uploaded: {accountHoldingsUploadedAt}</div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-gray-500 dark:text-slate-400 uppercase">Portfolio:</span>
          {["All"].concat(PORTFOLIOS.filter(function(p){return portsInData.indexOf(p)>=0;})).map(function(p){
            const active = portFilter === p;
            return (
              <button
                key={p}
                onClick={function(){ setPortFilter(p); }}
                className={"text-[11px] px-2 py-0.5 rounded-full border cursor-pointer " + (active
                  ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold"
                  : "border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}
              >{p}</button>
            );
          })}
          <span className="text-[11px] text-gray-500 dark:text-slate-400 uppercase ml-2">Threshold:</span>
          {THRESHOLDS.map(function(t){
            const active = threshold === t;
            return (
              <button
                key={t}
                onClick={function(){ setThreshold(t); }}
                className={"text-[11px] px-2 py-0.5 rounded-full border cursor-pointer " + (active
                  ? "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 font-semibold"
                  : "border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}
              >&gt;{t} ppt</button>
            );
          })}
          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-700 dark:text-slate-300 cursor-pointer ml-2 select-none">
            <input type="checkbox" checked={showAll} onChange={function(e){setShowAll(e.target.checked);}} className="cursor-pointer"/>
            Show all
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-700 dark:text-slate-300 cursor-pointer ml-2 select-none" title="Hide CASH-US / CASH / DIVACC pseudo-ticker rows (uninteresting noise on the outliers view).">
            <input type="checkbox" checked={hideCash} onChange={function(e){setHideCash(e.target.checked);}} className="cursor-pointer"/>
            Hide cash
          </label>
        </div>
      </div>

      {/* Per-portfolio → per-account outlier tables */}
      {Object.keys(byPortAccount).length === 0 ? (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-4 py-6 text-center text-sm text-gray-500 dark:text-slate-400">
          No outliers above {threshold} ppt. Lower the threshold or toggle "Show all" to see every row.
        </div>
      ) : (
        Object.keys(byPortAccount).sort().map(function(p){
          const accounts = byPortAccount[p];
          const accountList = Object.keys(accounts).sort();
          const portRowCount = accountList.reduce(function(acc, a){ return acc + accounts[a].length; }, 0);
          return (
            <div key={p} className="mb-5">
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1.5">
                {PORT_NAMES[p] || p}
                <span className="text-[11px] font-normal text-gray-500 dark:text-slate-400 ml-2">
                  {totalAccountsByPort[p] || 0} account{totalAccountsByPort[p] === 1 ? "" : "s"} · {portRowCount} row{portRowCount === 1 ? "" : "s"} {showAll ? "shown" : "above " + threshold + " ppt"}
                </span>
              </div>
              <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className="text-left  px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium" style={{width:"110px"}}>Account</th>
                      <th className="text-left  px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium" style={{width:"120px"}}>Ticker</th>
                      <th className="text-left  px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Name</th>
                      <th className="text-right px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Weight</th>
                      <th className="text-right px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Port mean</th>
                      <th className="text-right px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium" title="Holders / total accounts in portfolio">Held</th>
                      <th className="text-right px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Δ ppt</th>
                      <th className="text-left  px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium" style={{width:"110px"}}>Status</th>
                      <th className="text-left  px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountList.map(function(acct){
                      const accountRows = accounts[acct];
                      return accountRows.map(function(r, idx){
                        const note = (accountHoldingsNotes || {})[r.key] || { status: "", text: "" };
                        const sStyle = STATUS_STYLE[note.status || ""] || STATUS_STYLE[""];
                        const needsAttention = r.absDev > threshold && !note.status;
                        /* Visually group rows by account: only the first
                           row of each account shows the account code; the
                           rest leave it blank, and the LAST row of the
                           group draws a thicker separator. */
                        const isFirstOfAccount = idx === 0;
                        const isLastOfAccount = idx === accountRows.length - 1;
                        const rowBg = needsAttention ? "bg-amber-50/40 dark:bg-amber-950/20" : "";
                        const borderCls = isLastOfAccount
                          ? "border-b-2 border-slate-200 dark:border-slate-700"
                          : "border-b border-slate-100 dark:border-slate-800";
                        const devColor = r.dev > 0
                          ? "text-emerald-700 dark:text-emerald-300"
                          : r.dev < 0
                            ? "text-rose-700 dark:text-rose-300"
                            : "text-gray-500 dark:text-slate-400";
                        const name = lookupName(r.ticker);
                        return (
                          <tr key={r.key} className={borderCls + " " + rowBg}>
                            <td className="px-2 py-1 font-mono text-gray-700 dark:text-slate-300 align-top">
                              {isFirstOfAccount ? (
                                <span className="font-semibold text-gray-900 dark:text-slate-100">{acct}</span>
                              ) : null}
                            </td>
                            <td className="px-2 py-1 font-mono font-medium text-gray-900 dark:text-slate-100">
                              {r.ticker}
                              {r.isMissing && (
                                <span className="ml-1.5 text-[9px] px-1 py-0 rounded-full font-semibold" style={{ background: "#fee2e2", color: "#991b1b" }} title={"This account doesn't hold " + r.ticker + " but " + r.count + " other account" + (r.count===1?"":"s") + " in this portfolio do(es)."}>missing</span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-gray-700 dark:text-slate-300 truncate" title={name} style={{maxWidth:"260px"}}>{name}</td>
                            <td className={"px-2 py-1 text-right tabular-nums font-mono " + (r.isMissing ? "italic text-gray-400 dark:text-slate-500" : "text-gray-900 dark:text-slate-100")}>
                              {r.isMissing ? "—" : r.weight.toFixed(2) + "%"}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums font-mono text-gray-500 dark:text-slate-400">{r.mean.toFixed(2)}%</td>
                            <td className="px-2 py-1 text-right tabular-nums font-mono text-gray-500 dark:text-slate-400">{r.count}/{r.totalAccts}</td>
                            <td className={"px-2 py-1 text-right tabular-nums font-mono font-semibold " + devColor}>
                              {r.dev >= 0 ? "+" : ""}{r.dev.toFixed(2)}
                            </td>
                            <td className="px-2 py-1">
                              <select
                                value={note.status || ""}
                                onChange={function(e){ setAccountHoldingsNote(r.key, { status: e.target.value, text: note.text || "" }); }}
                                className="text-[10px] px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                                style={{ background: sStyle.bg, color: sStyle.color }}
                              >
                                {STATUS_OPTIONS.map(function(s){
                                  return <option key={s.key} value={s.key}>{s.label}</option>;
                                })}
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                value={note.text || ""}
                                onChange={function(e){ setAccountHoldingsNote(r.key, { status: note.status || "", text: e.target.value }); }}
                                placeholder="add note…"
                                className="text-[11px] w-full px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
