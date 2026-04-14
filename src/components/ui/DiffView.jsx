function DiffView({ diff, onAccept, onReject }) {
  return (
    <div className="mt-3">
      <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-2">
        Proposed changes
      </div>

      {diff.map(function (d, i) {
        return (
          <div
            key={i}
            className="mb-2 border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden"
          >
            <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-gray-500 dark:text-slate-400">
              {d.section}
            </div>

            <div className="grid grid-cols-2">
              <div className="px-3 py-2 border-r border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-red-600 dark:text-red-400 mb-1 uppercase">
                  Before
                </div>
                <div className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 whitespace-pre-wrap">
                  {d.before || "(empty)"}
                </div>
              </div>
              <div className="px-3 py-2">
                <div className="text-[10px] text-green-600 dark:text-green-400 mb-1 uppercase">
                  After
                </div>
                <div className="text-xs leading-relaxed text-gray-900 dark:text-slate-100 whitespace-pre-wrap">
                  {d.after}
                </div>
              </div>
            </div>

            {d.reason && (
              <div className="px-3 py-1 bg-slate-50 dark:bg-slate-800 text-xs text-gray-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
                {d.reason}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex gap-2 mt-2">
        <button
          onClick={onAccept}
          className="flex-1 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
        >
          Accept all changes
        </button>
        <button
          onClick={onReject}
          className="px-4 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

export default DiffView;
