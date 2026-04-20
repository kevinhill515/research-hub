import { useState } from "react";
import { TEMPLATE_SECTIONS, UPLOAD_TYPES } from '../../constants/index.js';
import { apiCall } from '../../api/index.js';
import DiffView from '../ui/DiffView.jsx';
import { useAlert } from '../ui/DialogProvider.jsx';

function QuickUploadModal({ company, onClose, onAccept }) {
  var [txt, setTxt] = useState("");
  var [utype, setUtype] = useState("Earnings Report");
  var [loading, setLoading] = useState(false);
  var [diff, setDiff] = useState(null);
  var [meta, setMeta] = useState(null);
  var alertFn = useAlert();

  async function run() {
    if (!txt.trim()) return;
    setLoading(true);
    setDiff(null);
    setMeta(null);
    try {
      var allSecs = [...TEMPLATE_SECTIONS, "Earnings & Thesis Check"];
      var cur = allSecs.map(function (s) {
        return "## " + s + "\n" + ((company.sections && company.sections[s]) || "(empty)");
      }).join("\n\n");
      var r = await apiCall(
        "Investment research assistant. New research (" + utype + ") for " + company.name + " (" + company.ticker + "). Current template:\n" + cur + "\n\nReturn ONLY JSON: {changes:[{section,before,after,reason}],summary:string}. No markdown fences.",
        [{ type: "text", text: txt }],
        2500
      );
      var parsed = JSON.parse(r.replace(/```json|```/g, "").trim());
      setDiff(parsed.changes || []);
      setMeta({ summary: parsed.summary, type: utype });
    } catch (e) {
      alertFn("Could not process: " + e.message);
    }
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 w-[600px] max-h-[85vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
            Upload research &mdash; {company.name}
          </div>
          <span
            onClick={onClose}
            className="text-xs text-gray-500 dark:text-slate-400 cursor-pointer hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
          >
            &#x2715;
          </span>
        </div>

        {/* Upload type selector */}
        <select
          value={utype}
          onChange={function (e) { setUtype(e.target.value); }}
          className="text-xs px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 mb-2 focus:ring-2 focus:ring-blue-500 outline-none"
        >
          {UPLOAD_TYPES.map(function (t) { return <option key={t}>{t}</option>; })}
        </select>

        {/* Content textarea */}
        <textarea
          value={txt}
          onChange={function (e) { setTxt(e.target.value); }}
          placeholder="Paste research content..."
          className="w-full min-h-[120px] resize-y text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-[inherit] leading-relaxed mb-2 focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
        />

        {/* Analyze button */}
        <button
          onClick={run}
          disabled={loading || !txt.trim()}
          className="w-full py-2.5 font-medium text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-3"
        >
          {loading ? "Analyzing..." : "Analyze and propose updates"}
        </button>

        {/* Diff results */}
        {diff && meta && (
          diff.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">No changes needed.</p>
          ) : (
            <DiffView
              diff={diff}
              onAccept={function () { onAccept(company, diff, meta); onClose(); }}
              onReject={function () { setDiff(null); setMeta(null); }}
            />
          )
        )}
      </div>
    </div>
  );
}

export default QuickUploadModal;
