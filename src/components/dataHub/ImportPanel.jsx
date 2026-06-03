/* Data Hub import panel — collapsible block above the main tabs.
 *
 * Previously lived as a single ~5 KB inline JSX expression in
 * App.jsx; extracted here so App.jsx is easier to navigate and the
 * subtabs are co-located with each other.
 *
 * Accepts the full result of useImport() as `imports` so we don't
 * have to thread 40+ props through. Each subtab renders its own
 * <textarea> + import button bound to the corresponding state in
 * that bundle. The container only renders when `imports.showDataPanel`
 * is true (the "⇪ Import" menu item in the toolbar toggles it).
 *
 * The Prices subtab uses the existing <UploadTab> helper because
 * its placeholder + description are long enough to warrant the
 * dedicated component. Every other subtab inlines its own textarea
 * (small payloads).
 */
import UploadTab from "./UploadTab.jsx";
import { PORTFOLIOS, PORT_NAMES } from "../../constants/index.js";

const CARD = "bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 mb-2";
const INP = "text-sm px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none";
const TA_BASE = "w-full resize-y text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-[inherit] leading-relaxed focus:ring-2 focus:ring-blue-500 focus:outline-none";
const BTN_SM = "text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
const TABSM_BASE = "px-2.5 py-1 border rounded-md cursor-pointer text-xs whitespace-nowrap transition-colors";
const TABSM_ACTIVE = TABSM_BASE + " border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800 font-medium text-gray-900 dark:text-slate-100";
const TABSM_INACTIVE = TABSM_BASE + " border-slate-200 dark:border-slate-700 bg-transparent font-normal text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50";

const TABS = [
  ["prices", "Prices"], ["valuation", "Valuation"], ["epsrev", "E[EPS]"],
  ["guidance", "Guidance"], ["metrics", "Metrics"], ["benchmarks", "Benchmarks"],
  ["dashboard", "Dashboard"], ["weights", "Target Weights"], ["earnings", "Earnings Dates"],
  ["fx", "FX Rates"], ["rep", "Rep Holdings"], ["tx", "Transactions"],
  ["perf", "Performance"], ["ratios", "Ratio Analysis"], ["financials", "Financials"],
  ["segments", "Segments"], ["pricehistory", "Price History"],
];

export default function ImportPanel({ imports, benchmarkWeights, calLastUpdated, calLastUpdatedBy, fxLastUpdated, repLastUpdated }) {
  if (!imports || !imports.showDataPanel) return null;
  const {
    dataHubTab, setDataHubTab,
    estImportText, setEstImportText, applyEstImport,
    metricsImportText, setMetricsImportText, applyMetricsImport,
    benchmarkImportText, setBenchmarkImportText, benchmarkAsOf, setBenchmarkAsOf, applyBenchmarkImport,
    dashboardImportText, setDashboardImportText, applyDashboardImport,
    priceImportText, setPriceImportText, applyPriceImport,
    weightsImportText, setWeightsImportText, applyWeightsImport,
    calImportText, setCalImportText, applyCalImport,
    fxText, setFxText, applyFxImport,
    repText, setRepText, applyRepImport,
    txText, setTxText, txReplaceMatched, setTxReplaceMatched, applyTxImport,
    perfPortTargets, setPerfPortTargets, perfText, setPerfText, applyPerfImport,
    ratioImportText, setRatioImportText, applyRatioImport,
    financialsImportText, setFinancialsImportText, applyFinancialsImport,
    segmentsImportText, setSegmentsImportText, applySegmentsImport,
    epsRevImportText, setEpsRevImportText, applyEpsRevImport,
    guidanceImportText, setGuidanceImportText, applyGuidanceImport,
    priceHistoryImportText, setPriceHistoryImportText, applyPriceHistoryImport,
  } = imports;

  return (
    <div className={CARD + " mb-3"}>
      <div className="flex gap-1.5 mb-3 border-b border-slate-200 dark:border-slate-700 pb-2.5 flex-wrap">
        {TABS.map(function (item) {
          return <button key={item[0]} className={dataHubTab === item[0] ? TABSM_ACTIVE : TABSM_INACTIVE} onClick={function () { setDataHubTab(item[0]); }}>{item[1]}</button>;
        })}
      </div>

      {dataHubTab === "valuation" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Earnings Estimates</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Columns: Company, Target PE, Current FPE, 5Yr Low, 5Yr High, 5Yr Avg, 5Yr Median, FY Month, Currency, FY1, EPS1, W1%, FY2, EPS2, W2%, TP Fixed (optional)</div>
          <textarea value={estImportText || ""} onChange={function (e) { setEstImportText(e.target.value); }} placeholder="Shell  18.5  15.8  12  22  17  16.5  Dec  USD  FY2026E  4.20  50  FY2027E  4.80  50" rows={8} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 120 }} />
          <button onClick={applyEstImport} disabled={!estImportText.trim()} className={BTN_SM}>Import</button>
        </div>
      )}

      {dataHubTab === "metrics" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Company Metrics</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">44 columns: Company, Ord Ticker, MktCap ($B), P/E, P/E +1, P/E +2, FCF Yld, FCF Yld +1, FCF Yld +2, Div Yld, Div Yld +1, Div Yld +2, Payout, Payout +1, Payout +2, Net D/E, Net D/E +1, Net D/E +2, Int Cov, LT EPS, Gr Mgn, Gr Mgn +1, Gr Mgn +2, Net Mgn, Net Mgn +1, Net Mgn +2, GP/Ass, GP/Ass +1, GP/Ass +2, NP/Ass, NP/Ass +1, NP/Ass +2, Op ROE, Op ROE +1, Op ROE +2, P/B, P/B +1, P/B +2, ROE, ROE +1, ROE +2, Internal Growth, ADPS Growth 5Y, ADPS Growth 1Y. Yield/margin/return/growth values can be pasted as percents (3.2 for 3.2%). Trailing returns moved to the Prices upload (per-ticker, with USD context). Older 35-col layout (no P/B/ROE/growth) and 41-col layout (legacy with perf cols) still accepted. Header row auto-detected.</div>
          <textarea value={metricsImportText || ""} onChange={function (e) { setMetricsImportText(e.target.value); }} placeholder="Shell&#9;SHEL-GB&#9;220&#9;11.2&#9;12.5&#9;11.8&#9;0.07&#9;0.08&#9;0.09&#9;..." rows={8} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 120 }} />
          <button onClick={applyMetricsImport} disabled={!metricsImportText.trim()} className={BTN_SM}>Import</button>
        </div>
      )}

      {dataHubTab === "benchmarks" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Benchmark Weights</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Two formats accepted (mix freely): (a) Current snapshot — 4 cols: Benchmark, Type (Sector | Country | Metric | Ratio), Name, Value. (b) Quarterly history — 5 cols: Date (m/d/yyyy), Name, Type, Item, Value. In the dated format, Name may be either a benchmark or a portfolio code (FGL, GL, FIN, IN, EM, SC) — portfolio rows seed the History view in Breakdown subtabs. Type=Ratio accepts the 11 FactSet labels (AVERAGE/MEDIAN MKTCAP, PRICE TO EARNINGS, PRICE TO BOOK VALUE, ROE, FWD PRICE TO EARN, CURR INTERNAL GROWTH RATE, 5/1 YEAR ADPS GROWTH RATE, PAYOUT RATIO, MONTHLY YIELD) and shows up on the Characteristics → Ratios comparison. A header row is auto-detected. Sectors/Countries power the Breakdown subtabs; Metrics (keys: mktCap, fpe/fpe1/fpe2, fcfYld/fcfYld1/fcfYld2, divYld, payout, netDE, intCov, ltEPS, grMgn, netMgn, gpAss, npAss, opROE — with +1/+2 suffix where applicable) power the Characteristics subtab. Percent-type metric values accept percent form (e.g. 7.2 for 7.2%). Known benchmark names: ACWI, ACWI Value, ACWI ex US, ACWI ex US Value, MSCI EM, MSCI EM Value, ACWI ex US SC, ACWI ex US SC Value. Current data: {Object.keys(benchmarkWeights || {}).length > 0 ? Object.keys(benchmarkWeights).map(function (b) { var bw = benchmarkWeights[b] || {}; var sCount = Object.keys(bw.sectors || {}).length; var cCount = Object.keys(bw.countries || {}).length; var mCount = Object.keys(bw.metrics || {}).length; return b + " (" + sCount + "s/" + cCount + "c/" + mCount + "m" + (bw.asOf ? " • " + bw.asOf : "") + ")"; }).join("; ") : "(none uploaded yet)"}</div>
          <div className="flex gap-2 items-center mb-2">
            <label className="text-[11px] text-gray-500 dark:text-slate-400">As-of label (optional):</label>
            <input value={benchmarkAsOf || ""} onChange={function (e) { setBenchmarkAsOf(e.target.value); }} placeholder="e.g. 2026 Q1" className={INP + " !text-xs w-28"} />
          </div>
          <textarea value={benchmarkImportText || ""} onChange={function (e) { setBenchmarkImportText(e.target.value); }} placeholder={"ACWI	Sector	Industrials	11.2\nACWI	Sector	Information Technology	23.5\nACWI	Country	United States	65.0\nACWI Value	Sector	Industrials	14.5\n..."} rows={10} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 160 }} />
          <button onClick={applyBenchmarkImport} disabled={!benchmarkImportText.trim()} className={BTN_SM}>Import</button>
        </div>
      )}

      {dataHubTab === "dashboard" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Markets Dashboard</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">14-col flat rows + optional FX matrix blocks, mixed in one paste. Flat rows: Section, Label, Ticker, TODAY, 5D, MTD, 1M, QTD, 3M, 6M, YTD, 1Y, 2Y, 3Y — Section ∈ {"{"}Indices, Sectors, Countries, Commodities, Bonds, FX{"}"}. The FX section is for currency-pair returns (USDEUR, USDJPY, etc.); used by the Snapshot tab to convert ord-ticker performance to USD. FX matrix blocks (cross-currency, separate format) start with a header line containing "FX - 3M" or "FX - 12M". Values are percent-form (2.3 for 2.3%, 0.5 for 0.5%). The legacy 10-col layout (1D, 5D, MTD, QTD, YTD, 1Y, 3Y) is also accepted; the parser uses the column-header row to map periods. Replaces the sections you paste; untouched sections preserved.</div>
          <textarea value={dashboardImportText || ""} onChange={function (e) { setDashboardImportText(e.target.value); }} placeholder={"Indices	MSCI ACWI	ACWI-US	0.1	0.8	2.3	5.5	8.7	15.2	23.4\nSectors	Information Technology	IXN-US	0.2	1.5	3.1	7.0	11.0	21.5	35.0\nCommodities	Gold	IAU-US	0.3	1.0	2.2	4.5	7.0	13.5	20.0"} rows={10} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 160 }} />
          <button onClick={applyDashboardImport} disabled={!dashboardImportText.trim()} className={BTN_SM}>Import</button>
        </div>
      )}

      {dataHubTab === "prices" && (
        <UploadTab
          title="Price Upload"
          description="27 columns: Company, Ord Ticker, Ord Price, then 11 trailing returns for the ord ticker (TODAY, 5D, MTD, 1M, QTD, 3M, 6M, YTD, 1YR, 2YR, 3YR), then US Ticker, US Price, then 11 trailing returns for the US ticker. Returns may be percent-form (1.2 / 1.2%) or signed; (-) parens treated as negative. The US-ticker block is optional — leave blank when there's no US listing. Snapshot Trailing Performance + Companies-table 5D% read from the US ticker (USD) when available, else ord (local)."
          placeholder="Shell  SHEL-GB  26.50  0.1  -1.2  3.2  4.5  6.0  8.1  10.3  12.5  15.8  22.0  35.0  SHEL  34.10  0.0  -1.5  3.1  4.4  5.9  8.0  10.2  12.4  15.6  21.8  34.5"
          value={priceImportText}
          onChange={setPriceImportText}
          onImport={applyPriceImport}
        />
      )}

      {dataHubTab === "weights" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Target Portfolio Weights</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Columns: Company, GL%, FGL%, IV%, FIV%, EM%, SC%</div>
          <textarea value={weightsImportText || ""} onChange={function (e) { setWeightsImportText(e.target.value); }} placeholder="Shell  3.5  4.0  3.5  4.0  0  0" rows={8} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 120 }} />
          <button onClick={applyWeightsImport} disabled={!weightsImportText.trim()} className={BTN_SM}>Import</button>
        </div>
      )}

      {dataHubTab === "earnings" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Earnings Dates + Estimates</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">13 columns (all after Last Rpt Date are optional — legacy 3-col paste still works): Ticker, Next Rpt Date, Last Rpt Date, Sales Estimate, Sales Actual, Sales Surprise Nom, Sales Surprise %, EPS Estimate, EPS Actual, EPS Surprise Nom, EPS Surprise %, Sales+1 Estimate, EPS+1 Estimate. Dates as YYYY-MM-DD. The first 8 fields after dates apply to the LAST quarter (just-reported). Sales+1 / EPS+1 are consensus heading INTO the next report. Header row auto-detected. {calLastUpdated && "Last imported by " + calLastUpdatedBy + " at " + calLastUpdated}</div>
          <textarea value={calImportText || ""} onChange={function (e) { setCalImportText(e.target.value); }} placeholder="AAPL  2026-05-01  2026-02-01  120000  124300  4300  3.6  1.95  2.10  0.15  7.7  130000  2.05" rows={8} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 120 }} />
          <button onClick={applyCalImport} disabled={!calImportText.trim()} className={BTN_SM}>Import</button>
        </div>
      )}

      {dataHubTab === "fx" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">FX Rates</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Columns: Pair (e.g. GBPUSD), Rate. {fxLastUpdated && "Last loaded by " + fxLastUpdated}</div>
          <textarea value={fxText} onChange={function (e) { setFxText(e.target.value); }} placeholder="GBPUSD  1.3463" rows={8} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 120 }} />
          <button onClick={applyFxImport} disabled={!fxText.trim()} className={BTN_SM}>Load FX</button>
        </div>
      )}

      {dataHubTab === "rep" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Rep Account Holdings</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Columns: Account Number, Ticker, Shares, Avg Cost (local ccy). {repLastUpdated && "Last loaded by " + repLastUpdated}</div>
          <textarea value={repText} onChange={function (e) { setRepText(e.target.value); }} placeholder="LWGA0013  SHEL  1500  24.80" rows={8} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 120 }} />
          <button onClick={applyRepImport} disabled={!repText.trim()} className={BTN_SM}>Load</button>
        </div>
      )}

      {dataHubTab === "tx" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Transactions Import</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Columns: Trade Date (YYYY-MM-DD), Security Name, Portfolio (FIN/IN/FGL/GL/EM/SC), Shares (neg = sell), Unit Price, Amount. Two optional trailing columns: Ticker (the ticker the trade actually settled in — e.g. ANCUFOLD / ANCTF / BL56KN2 — preserves historical ticker context across renames) and Currency (e.g. USD, CAD, EUR). When supplied, the Tx tab uses them per-row; otherwise it infers from the company's current rep holdings. Rows that match existing transactions (same date/portfolio/shares/price/amount) are skipped.</div>
          <textarea value={txText} onChange={function (e) { setTxText(e.target.value); }} placeholder="2025-03-14  Sega Sammy Holdings  SC  1000  1842.50  1842500" rows={8} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 120 }} />
          <div className="flex items-center gap-2 mb-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-slate-300 cursor-pointer select-none">
              <input type="checkbox" checked={!!txReplaceMatched} onChange={function (e) { setTxReplaceMatched(e.target.checked); }} className="cursor-pointer" />
              <span>Replace existing transactions for matched companies</span>
            </label>
            <span className="text-[10px] text-gray-500 dark:text-slate-400 italic">Wipes & re-imports — use after correcting fields (e.g. USD → local ccy). Untouched companies stay intact.</span>
          </div>
          <button onClick={applyTxImport} disabled={!txText.trim()} className={BTN_SM}>Import</button>
        </div>
      )}

      {dataHubTab === "perf" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Performance Upload</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Pick the target portfolio in the dropdown below, then paste monthly returns. <b>Row 1 is the header</b> — first cell is <code>Date</code>, every column after names a <b>series</b> (your portfolio, benchmarks, competitors). Rows 2+ are data: month in YYYY-MM format, then each series&apos; return for that month. Values can be decimal (<code>0.0234</code>) or percent (<code>2.34%</code>). Blanks are fine (series with short histories just leave early rows empty). Series are merged into the selected portfolio by column name — re-importing with more months or more series is safe.</div>
          <div className="flex gap-2 items-center mb-2 flex-wrap">
            <label className="text-[11px] text-gray-500 dark:text-slate-400">Target portfolio(s):</label>
            {PORTFOLIOS.map(function (p) {
              var on = perfPortTargets.indexOf(p) >= 0;
              return <span key={p} onClick={function () { setPerfPortTargets(function (prev) { var cur = prev || []; var has = cur.indexOf(p) >= 0; return has ? cur.filter(function (x) { return x !== p; }) : cur.concat([p]); }); }} className={"text-[11px] px-2 py-0.5 rounded-full cursor-pointer border transition-colors " + (on ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{PORT_NAMES[p] || p}</span>;
            })}
            <span className="text-[10px] text-gray-400 dark:text-slate-500 italic ml-1">click to toggle; combined pastes (e.g. FGL+GL) apply to both</span>
          </div>
          <textarea value={perfText} onChange={function (e) { setPerfText(e.target.value); }} placeholder={"Date,FIN,MSCI World,Competitor A  (then each row below: 2010-01,0.0234,0.0210,0.0150)"} rows={10} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 160 }} />
          <button onClick={applyPerfImport} disabled={!perfText.trim()} className={BTN_SM}>Import</button>
        </div>
      )}

      {dataHubTab === "ratios" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Ratio Analysis</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Paste the FactSet Ratio Analysis block for one company at a time. Row 1 = company name (auto-matched to an existing company by name, with fuzzy normalization for suffixes like SE/PLC/Inc). Row 2 = year header (accepts Dec-YYYY, YYYY-MM-DD, M/D/YYYY, or YYYY). Row 3 = Final/Estimate flags per column. Subsequent rows = section headers (no values) and ratio rows (name + values). Re-importing for the same company replaces its ratio data — use it when refreshing the forward-year estimates. Empty cells and #N/A / #NUM! / #VALUE! become blank in the chart.</div>
          <textarea value={ratioImportText || ""} onChange={function (e) { setRatioImportText(e.target.value); }} placeholder={"Schneider Electric SE\nRatio Analysis	2016-12-31	2017-12-31…	2030-12-31\n	Final/	Final/…	Estimate\nProfitability\nGross Margin	38.59	38.85…	41.10\n…"} rows={10} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 160 }} />
          <button onClick={applyRatioImport} disabled={!ratioImportText.trim()} className={BTN_SM}>Import Ratios</button>
        </div>
      )}

      {dataHubTab === "financials" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Financial Statements</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Paste the FactSet Financials block (Income Statement + Balance Sheet + Cash Flow, all in one block) for one company at a time. Row 1 = company name. Row 2 = year header (date format — M/D/YYYY, YYYY-MM-DD, Dec-YYYY, or YYYY). Row 3 = FY labels (-10FY through -0FY for historicals, +1FY through +5FY for forward estimates). Subsequent rows = section headers (no values) and line-item rows. Re-importing replaces this company's financials wholesale — use it to refresh forward-year IS estimates. Sub-metric rows (Growth, Margin, % of, per Share, etc.) are auto-detected by name pattern and rendered in red italic, matching the FactSet convention.</div>
          <textarea value={financialsImportText || ""} onChange={function (e) { setFinancialsImportText(e.target.value); }} placeholder={"Schneider Electric SE\n	12/31/2015	12/30/2016…	12/31/2030\n	-10FY	-9FY…	+5FY\nSales	26,640	24,459…	59,230\n…"} rows={10} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 160 }} />
          <button onClick={applyFinancialsImport} disabled={!financialsImportText.trim()} className={BTN_SM}>Import Financials</button>
        </div>
      )}

      {dataHubTab === "epsrev" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">EPS Estimate Revisions</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">One row per company. <b>Header row is optional</b> — if column E1:Q1 contains 13 monthly dates, those drive the x-axis; otherwise the parser synthesizes 13 last-of-month dates ending in the current month. Each data row: Col A = Ticker, Col C = Company name, Col D = EPS0 anchor (last completed FY EPS), E:Q = 13 monthly EPS0 estimates, R = EPS+1 anchor, S:AE = 13 monthly EPS+1 estimates, AF = EPS+2 anchor, AG:AS = 13 monthly EPS+2, AT = EPS+3 anchor, AU:BG = 13 monthly EPS+3. Ticker matches first; falls back to fuzzy company-name match. Also accepts a name-led alternate layout: Col A = company name, Col B = FY-end date, 13 monthly values follow before each next FY date.</div>
          <textarea value={epsRevImportText || ""} onChange={function (e) { setEpsRevImportText(e.target.value); }} placeholder="Paste the EPS revisions block from your spreadsheet…" rows={10} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 160 }} />
          <button onClick={applyEpsRevImport} disabled={!epsRevImportText.trim()} className={BTN_SM}>Import EPS Revisions</button>
        </div>
      )}

      {dataHubTab === "segments" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Segments + Geography</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">One-time upload (or whenever the company restructures). Paste the company's Segments + Revenue by Geography template. Row 1 = company name. Year header row = FY YYYY or 12/31/YYYY. Each segment is a labeled row, followed by Sales, EBIT, Margin, ROA. Cost-center rows (no Sales, only EBIT — typically negative in parens) are auto-detected. After segments comes "Revenue by Geography" with a Revenue total row + region rows whose values are percent of revenue. Replaces this company's segment data wholesale.</div>
          <textarea value={segmentsImportText || ""} onChange={function (e) { setSegmentsImportText(e.target.value); }} placeholder={"Schneider Electric SE\n	FY 2015	FY 2016…	FY 2025\nIndustrial Automation\nSales	5,696	5,485…	7,022\nEBIT	1,081	1,015…	1,121\nMargin	19.0%	18.5%…	16.0%\nROA\n…\nRevenue by Geography\nRevenue	26,640	24,459…	40,152\nFrance	6.4%	6.8%…	5.6%\n…"} rows={10} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 160 }} />
          <button onClick={applySegmentsImport} disabled={!segmentsImportText.trim()} className={BTN_SM}>Import Segments</button>
        </div>
      )}

      {dataHubTab === "guidance" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Guidance History</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Paste a FactSet Guidance History block for one company at a time (typical Excel selection: B2:M58, including the title row with the ticker in parentheses). Parser auto-locates the title row and the Date Issued header, so trimming isn&apos;t needed. Columns: Date Issued, Period (FY end), Item, Guidance L, Guidance H, Mean, Actual, Mean Surp, Actual Surp, Price Impact. All metrics and all periods (including future FYs) are kept; the Guidance tab groups them at render time. Re-paste each quarter to replace the company&apos;s guidance wholesale. Run the FactSet template at 15 calendar months so the prior-FY Actual column is populated for the Y/Y baseline.</div>
          <textarea value={guidanceImportText || ""} onChange={function (e) { setGuidanceImportText(e.target.value); }} placeholder={"Guidance History - Sony Group Corporation (6758-JP)\nDate Issued\tPeriod\tItem\tGuidance L\tGuidance Low Comment\tGuidance H\tGuidance High Comment\tMean\tMean Surp (%)\tActual\tActual Surp (%)\tPrice Impact (%)\n2/14/25\t3/31/26\tSales\t13,200,000\t-\t13,200,000\t-\t12,743,433\t3.6%\t12,957,064\t1.8%\t8.7%\n…"} rows={10} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 160 }} />
          <button onClick={applyGuidanceImport} disabled={!guidanceImportText.trim()} className={BTN_SM}>Import Guidance</button>
        </div>
      )}

      {dataHubTab === "pricehistory" && (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Daily Price History</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">Two layouts accepted. <b>Simple</b>: <code>Date, T1, T2, …</code> (shared date column). <b>Paired</b>: <code>Date, T1, Date, T2, …</code> (each ticker has its own date axis — best for cross-market pastes where holidays differ). Dates: YYYY-MM-DD or M/D/YYYY. Each ticker becomes its own row in <code>prices_history</code>; re-uploads merge with existing series (deduped by date), so partial pastes are safe.</div>
          <textarea value={priceHistoryImportText || ""} onChange={function (e) { setPriceHistoryImportText(e.target.value); }} placeholder={"Date\tANCTF\tATD-CA\n2020-01-02\t35.40\t46.20\n2020-01-03\t35.65\t46.31"} rows={10} className={TA_BASE + " font-mono mb-2"} style={{ minHeight: 160 }} />
          <button onClick={applyPriceHistoryImport} disabled={!priceHistoryImportText || !priceHistoryImportText.trim()} className={BTN_SM}>Import Price History</button>
        </div>
      )}
    </div>
  );
}
