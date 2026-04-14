function StatusPill({ status }) {
  var cfg = {
    Own:   { bg: "#dcfce7", color: "#166534" },
    Focus: { bg: "#dbeafe", color: "#1e40af" },
    Watch: { bg: "#fef9c3", color: "#854d0e" },
    Sold:  { bg: "#fee2e2", color: "#991b1b" },
  }[status] || { bg: undefined, color: undefined };

  return (
    <span
      className="inline-block whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400"
      style={{
        ...(cfg.bg ? { background: cfg.bg, color: cfg.color } : {}),
      }}
    >
      {status || "--"}
    </span>
  );
}

export default StatusPill;
