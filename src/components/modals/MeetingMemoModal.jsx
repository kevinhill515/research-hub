/* PM Meeting Memo modal.
 *
 * Two-step flow:
 *   1. Pick meeting type (Tuesday MultiCap / Thursday EM+SC).
 *   2. View the generated memo in a textarea, copy to clipboard,
 *      optionally clear agenda flags so the next memo shifts those
 *      entries from Trading Agenda to Target Changes.
 *
 * Memo content is built by utils/meetingMemo.js from each company's
 * portWeightHistory + tpHistory. Lives as a modal (not its own tab)
 * because it's a tail-of-meeting workflow — opened once, copied,
 * dismissed — not something you'd leave open.
 */
import { useState } from "react";
import { useCompanyContext } from "../../context/CompanyContext.jsx";
import { buildMeetingMemo, clearAgendaFlags, MEETING_PROFILES } from "../../utils/meetingMemo.js";

const BTN_PRIMARY = "text-xs px-3 py-1.5 font-medium bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 transition-colors";
const BTN_GHOST = "text-xs px-3 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";

export function MeetingMemoModal({ open, onClose }) {
  const { companies, setCompanies } = useCompanyContext();
  const [profile, setProfile] = useState(null); /* "tuesday" | "thursday" | null */
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  function reset() { setProfile(null); setCopied(false); }
  function close() { reset(); onClose(); }

  const memo = profile ? buildMeetingMemo(companies, profile) : "";

  function copyMemo() {
    if (!memo) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(memo).then(function () { setCopied(true); setTimeout(function(){setCopied(false);}, 2000); });
    } else {
      // Fallback for older browsers / non-secure contexts.
      var ta = document.createElement("textarea");
      ta.value = memo;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(function(){setCopied(false);}, 2000); } catch (_e) {}
      document.body.removeChild(ta);
    }
  }

  function clearAgenda() {
    if (!profile) return;
    const ports = MEETING_PROFILES[profile].ports;
    setCompanies(function (cs) { return clearAgendaFlags(cs, ports); });
    /* Reset to the picker so the user sees the now-empty agenda the
       next time they generate. */
    reset();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[1500] flex items-start justify-center p-4 overflow-y-auto" onClick={close}>
      <div onClick={function(e){e.stopPropagation();}} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl my-8 max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <div className="text-base font-semibold text-gray-900 dark:text-slate-100">PM Meeting Memo</div>
          <button onClick={close} className="ml-auto text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 cursor-pointer">Close ✕</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          {!profile ? (
            <div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                Generate the post-meeting compliance memo from this session's
                weight changes (Trading Agenda) + the last 6 days of weight
                changes (Target Changes) + the last 6 days of approved TP
                changes (FV Target Updates).
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={function(){setProfile("tuesday");}} className={BTN_PRIMARY}>
                  Tuesday — FIN / IN / FGL / GL
                </button>
                <button onClick={function(){setProfile("thursday");}} className={BTN_PRIMARY}>
                  Thursday — EM / SC
                </button>
              </div>
              <div className="text-[11px] text-gray-400 dark:text-slate-500 italic mt-3">
                Tuesday button outputs the "Multi Cap Strategies" header.
                Thursday outputs "EM ADR, International Small Cap".
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <button onClick={reset} className={BTN_GHOST}>← Pick different meeting</button>
                <button onClick={copyMemo} className={BTN_PRIMARY}>{copied ? "✓ Copied" : "Copy to clipboard"}</button>
                <button onClick={clearAgenda} className={BTN_GHOST} title="Mark every Trading Agenda entry for this meeting's portfolios as executed. After this, those entries will surface in the 'Target Changes' section on future memos instead of 'Trading Agenda'.">
                  Clear agenda (mark executed)
                </button>
              </div>
              <textarea
                value={memo}
                readOnly
                rows={20}
                onClick={function(e){e.target.select();}}
                className="w-full text-xs font-mono px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 leading-relaxed resize-y"
              />
              <div className="text-[11px] text-gray-400 dark:text-slate-500 italic mt-2">
                The format is a starting point — edit before pasting into the
                compliance email if any line needs tweaking. After distributing
                the memo, click "Clear agenda" so this session's decisions
                move to the Target Changes section on the next memo.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
