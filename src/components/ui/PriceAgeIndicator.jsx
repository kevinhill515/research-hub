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

  var days = Math.floor((Date.now() - d.getTime()) / 86400000);
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
