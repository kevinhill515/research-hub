import { parseDate } from '../../utils/index.js';

function PriceAgeIndicator({ lastPriceUpdate }) {
  if (!lastPriceUpdate)
    return (
      <span className="text-[10px] text-gray-500 dark:text-slate-400">
        Prices: never updated
      </span>
    );

  var d = parseDate(lastPriceUpdate);
  if (!d) return null;

  /* Calendar-day diff (not elapsed-ms) so a timestamp from yesterday
     morning reads "yesterday" as soon as the clock rolls past midnight,
     not only after 24h have elapsed. */
  var now = new Date();
  var startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var startOfThen  = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
  var days = Math.round((startOfToday - startOfThen) / 86400000);
  var color = days > 14 ? "#dc2626" : days > 7 ? "#d97706" : "#16a34a";
  var label = days === 0 ? "today" : days === 1 ? "yesterday" : days + "d ago";

  return (
    <span
      className="text-[10px]"
      style={{ color, fontWeight: days > 7 ? 600 : 400 }}
    >
      Prices updated: {lastPriceUpdate} ({label}){days > 14 ? " \u26a0" : ""}
    </span>
  );
}

export default PriceAgeIndicator;
