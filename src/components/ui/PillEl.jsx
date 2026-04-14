function PillEl({ label, bg, color, border, onRemove }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-normal px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400"
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
          className="cursor-pointer opacity-70 hover:opacity-100 text-[10px] transition-opacity"
        >
          x
        </span>
      )}
    </span>
  );
}

export default PillEl;
