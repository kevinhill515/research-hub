/* `compact` shrinks the pill (smaller text + tighter padding). Used
   by the Companies-table Portfolio column where the row is already
   width-constrained and the pills were forcing horizontal scroll. */
function PillEl({ label, bg, color, border, onRemove, compact }) {
  /* Compact density matches the Metrics view tier pill
     (text-[9px] px-1 py-0) so the List + Metrics views feel
     visually consistent. */
  var sizeCls = compact
    ? "text-[9px] px-1 py-0 gap-0.5"
    : "text-xs px-2 py-0.5 gap-1";
  return (
    <span
      className={"inline-flex items-center whitespace-nowrap font-normal rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 " + sizeCls}
      style={{
        ...(bg ? { background: bg } : {}),
        ...(color ? { color } : {}),
        ...(border ? { border } : {}),
      }}
    >
      {label}
      {onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className={"cursor-pointer opacity-70 hover:opacity-100 transition-opacity " + (compact ? "text-[9px]" : "text-[10px]")}
        >
          x
        </span>
      )}
    </span>
  );
}

export default PillEl;
