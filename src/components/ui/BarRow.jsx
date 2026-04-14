function BarRow({ label, clr, own, focus, watch, max }) {
  var op = max > 0 ? (own / max * 100) : 0;
  var fp = max > 0 ? (focus / max * 100) : 0;
  var wp = max > 0 ? (watch / max * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-xs font-medium w-[140px] shrink-0 truncate"
        style={{ color: clr }}
      >
        {label}
      </span>

      <div className="flex-1 h-3.5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden relative">
        <div className="absolute left-0 top-0 h-full" style={{ width: op + "%", background: clr }} />
        <div className="absolute top-0 h-full" style={{ left: op + "%", width: fp + "%", background: clr, opacity: 0.45 }} />
        <div className="absolute top-0 h-full" style={{ left: (op + fp) + "%", width: wp + "%", background: clr, opacity: 0.2 }} />
      </div>

      <div className="text-xs w-[130px] shrink-0 text-right">
        {own > 0 && <span className="text-green-800 dark:text-green-400 font-medium">{own} own</span>}
        {focus > 0 && <span className="text-blue-800 dark:text-blue-400">{own > 0 ? " \u00b7 " : ""}{focus} foc</span>}
        {watch > 0 && <span className="text-yellow-700 dark:text-yellow-400">{(own > 0 || focus > 0) ? " \u00b7 " : ""}{watch} w</span>}
      </div>
    </div>
  );
}

export default BarRow;
