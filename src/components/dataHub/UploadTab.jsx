/* Generic Upload Tab body. Each Data Hub upload tab has the same shape:
 * a title + descriptive text + optional config inputs above + a textarea
 * + an Import button. This component renders that shape from a config
 * object. Reduces App.jsx by hundreds of lines of near-duplicate JSX.
 *
 * Usage:
 *   <UploadTab
 *     title="Company Metrics"
 *     description="..."
 *     value={metricsImportText}
 *     onChange={setMetricsImportText}
 *     onImport={applyMetricsImport}
 *     placeholder="..."
 *     extras={<...optional input row...>}
 *     footer={<...optional last-updated text...>}
 *   />
 */

const TA_BASE = "w-full resize-y text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-[inherit] leading-relaxed focus:ring-2 focus:ring-blue-500 focus:outline-none";
const BTN_SM = "text-xs px-2.5 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";

export default function UploadTab(props) {
  const {
    title, description,
    value, onChange,
    onImport, importDisabled, importLabel,
    placeholder, rows = 8, minHeight = 120,
    extras, footer,
    monospace = true,
  } = props;

  return (
    <div>
      <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">{title}</div>
      {description && (
        <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">{description}</div>
      )}
      {extras && (
        <div className="flex gap-2 items-center mb-2 flex-wrap">{extras}</div>
      )}
      <textarea
        value={value || ""}
        onChange={function (e) { onChange(e.target.value); }}
        placeholder={placeholder || ""}
        rows={rows}
        className={TA_BASE + (monospace ? " font-mono" : "") + " mb-2"}
        style={{ minHeight: minHeight }}
      />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onImport}
          disabled={!!importDisabled || !value || !value.trim()}
          className={BTN_SM + " disabled:opacity-50 disabled:cursor-not-allowed"}
        >
          {importLabel || "Import"}
        </button>
        {footer && (
          <span className="text-[11px] text-gray-500 dark:text-slate-400">{footer}</span>
        )}
      </div>
    </div>
  );
}
