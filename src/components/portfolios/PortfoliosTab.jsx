/* Portfolios tab — extracted from App.jsx.
 *
 * Renders the portfolio sub-tab strip (Overlap / Overlap Matrix /
 * per-portfolio breakouts), the active inner table, and the
 * "Discrepancies" panel that flags mismatches between the app's
 * portfolio membership and the rep account's actual holdings.
 *
 * Reads companies / repData straight from useCompanyContext so the
 * parent doesn't have to thread them. Everything else (subtab state,
 * navigation callbacks, transaction-modal openers) comes in as props
 * because it's owned by App.jsx (local useState).
 */
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { PORTFOLIOS, PORT_NAMES } from '../../constants/index.js';
import { todayStr } from '../../utils/index.js';
import { OverlapTable } from './OverlapTable.jsx';
import { OverlapMatrix } from '../tables/index.js';
import { PortfoliosTable } from './PortfoliosTable.jsx';
import OutliersView from './OutliersView.jsx';

/* Tailwind class strings duplicated from App.jsx so this component
   stays self-contained. If we ever extract a shared styles module
   these can dedupe with the originals. */
const TABST_ACTIVE = "px-3 py-1.5 text-xs font-semibold rounded-t border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400";
const TABST_INACTIVE = "px-3 py-1.5 text-xs font-medium rounded-t border-b-2 border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200";

export default function PortfoliosTab(props) {
  const {
    portTab, setPortTab,
    portSort, setPortSort,
    portSortDir, setPortSortDir,
    overlapMode, setOverlapMode,
    overlapFilter, setOverlapFilter,
    setSelCo, setTab, setCoView, setSelCoOrigin,
    setTxFilter, openDiscussions,
    setShowAddTx, setNewTx,
  } = props;
  const { companies, repData } = useCompanyContext();

  /* Discrepancies panel — pure derivation per active portTab. */
  const portRep2 = repData[portTab] || {};
  const repTickers = Object.keys(portRep2).filter(function (t) { return t !== "CASH" && t !== "DIVACC"; });
  const portCos2 = companies.filter(function (c) { return (c.portfolios || []).indexOf(portTab) >= 0; });
  const missingFromRep = portCos2.filter(function (c) {
    const tks = (c.tickers || []).map(function (t) { return (t.ticker || "").toUpperCase(); });
    return !tks.some(function (tk) { return portRep2[tk] !== undefined; });
  });
  const missingFromApp = repTickers.filter(function (tk) {
    return !portCos2.some(function (c) {
      return (c.tickers || []).some(function (t) { return (t.ticker || "").toUpperCase() === tk; });
    });
  });

  return (
    <div>
      <div className="flex gap-1.5 mb-4 flex-wrap border-b border-slate-200 dark:border-slate-700 pb-2.5">
        <button key="overlap" className={portTab === "overlap" ? TABST_ACTIVE : TABST_INACTIVE} onClick={function () { setPortTab("overlap"); }}>Overlap</button>
        <button key="overlap-matrix" className={portTab === "overlap-matrix" ? TABST_ACTIVE : TABST_INACTIVE} onClick={function () { setPortTab("overlap-matrix"); }}>Overlap Matrix</button>
        <button key="outliers" className={portTab === "outliers" ? TABST_ACTIVE : TABST_INACTIVE} onClick={function () { setPortTab("outliers"); }}>Outliers</button>
        {PORTFOLIOS.map(function (p) {
          return <button key={p} className={portTab === p ? TABST_ACTIVE : TABST_INACTIVE} onClick={function () { setPortTab(p); }}>{PORT_NAMES[p] || p}</button>;
        })}
      </div>
      {portTab === "overlap" ? (
        <OverlapTable
          overlapMode={overlapMode} setOverlapMode={setOverlapMode}
          overlapFilter={overlapFilter} setOverlapFilter={setOverlapFilter}
          setSelCo={setSelCo} setTab={setTab} setCoView={setCoView} setSelCoOrigin={setSelCoOrigin}
        />
      ) : portTab === "overlap-matrix" ? (
        <div>
          <div className="text-sm font-medium mb-3 text-gray-900 dark:text-slate-100">Portfolio Overlap</div>
          <OverlapMatrix companies={companies} />
        </div>
      ) : portTab === "outliers" ? (
        <OutliersView />
      ) : (
        <PortfoliosTable
          portTab={portTab}
          portSort={portSort} portSortDir={portSortDir}
          setPortSort={setPortSort} setPortSortDir={setPortSortDir}
          setTxFilter={setTxFilter} setSelCoOrigin={setSelCoOrigin}
          setSelCo={setSelCo} setTab={setTab} setCoView={setCoView}
          openDiscussions={openDiscussions}
          onAddTransaction={function (c) {
            setSelCoOrigin("portfolios");
            setSelCo(c);
            setTab("companies");
            setCoView("transactions");
            setTxFilter(portTab);
            setShowAddTx(true);
            setNewTx(function (prev) { return Object.assign({}, prev || {}, { portfolio: portTab, date: todayStr() }); });
          }}
        />
      )}
      {PORTFOLIOS.indexOf(portTab) >= 0 && (
      <div className="mt-5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 mb-3 no-print">
        {missingFromRep.length === 0 && missingFromApp.length === 0 ? (
          <div className="text-xs text-gray-500 dark:text-slate-400">{"✓"} No discrepancies found.</div>
        ) : (
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-2">Discrepancies</div>
            {missingFromRep.length > 0 && (
              <div className="mb-2.5">
                <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-1">In app but no rep position ({missingFromRep.length}):</div>
                {missingFromRep.map(function (c) {
                  return <span key={c.id} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-gray-900 dark:text-slate-100 mr-1 inline-block mb-1">{c.name}</span>;
                })}
              </div>
            )}
            {missingFromApp.length > 0 && (
              <div>
                <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-1">In rep account but no matching company ({missingFromApp.length}):</div>
                {missingFromApp.map(function (tk) {
                  return <span key={tk} className="text-[11px] px-2 py-0.5 rounded-full mr-1 inline-block mb-1" style={{ background: "#fef9c3", border: "1px solid #d97706", color: "#854d0e" }}>{tk}</span>;
                })}
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
