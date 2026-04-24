/* Financial Statements tab — thin wrapper around TimeSeriesTab.
 * Reads company.financials (populated via Data Hub → Financials). */

import TimeSeriesTab from './TimeSeriesTab.jsx';

export default function FinancialsTab({ company }) {
  return <TimeSeriesTab company={company} dataKey="financials" title="Financial Statements" dataHubLabel="Financials" />;
}
