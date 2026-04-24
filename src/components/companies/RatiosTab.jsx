/* Ratio Analysis tab — thin wrapper around TimeSeriesTab. */

import TimeSeriesTab from './TimeSeriesTab.jsx';

export default function RatiosTab({ company }) {
  return <TimeSeriesTab company={company} dataKey="ratios" title="Ratio Analysis" dataHubLabel="Ratio Analysis" />;
}
