/* PM Meeting Memo modal.
 *
 * Two tabs:
 *   - Generate: pick a meeting profile (Tuesday MultiCap / Thursday EM+SC),
 *     view the generated memo, copy to clipboard, optionally "Clear agenda
 *     (mark executed)" which snapshots the memo to the Log tab and flips
 *     the agenda entries to executed so they roll into Allocation Changes
 *     on the next memo.
 *   - Log: history of every memo that was distributed (via the Clear agenda
 *     button). Each entry can be expanded to view the full text and deleted.
 *
 * Memo content is built by utils/meetingMemo.js from each company's
 * portWeightHistory + tpHistory, with repData passed in so the picker
 * selects whichever ticker is actually held in each portfolio.
 */
import { useState } from "react";
import { useCompanyContext } from "../../context/CompanyContext.jsx";
import { buildMeetingMemo, clearAgendaFlags, MEETING_PROFILES } from "../../utils/meetingMemo.js";

const BTN_PRIMARY = "text-xs px-3 py-1.5 font-medium bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 transition-colors";
const BTN_GHOST = "text-xs px-3 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";

function tabClass(active) {
  return "text-xs px-2.5 py-1 rounded-md cursor-pointer transition-colors " +
    (active
      ? "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200 font-medium"
      : "text-gray-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800");
}

export function MeetingMemoModal({ open, onClose }) {
  const { companies, setCompanies, repData, memoLog, addMemoLog, deleteMemoLog } = useCompanyContext();
  const [tab, setTab] = useState("generate"); /* "generate" | "log" */
  const [profile, setProfile] = useState(null); /* "tuesday" | "thursday" | null */
  const [copied, setCopied] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);

  if (!open) return null;

  function reset() { setProfile(null); setCopied(false); }
  function close() { reset(); setTab("generate"); setExpandedLogId(null); onClose(); }

  const memo = profile ? buildMeetingMemo(companies, profile, repData) : "";

  function copyMemo() {
    if (!memo) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(memo).then(function () { setCopied(true); setTimeout(function () { setCopied(false); }, 2000); });
    } else {
      /* Fallback for older browsers / non-secure contexts. */
      var ta = document.createElement("textarea");
      ta.value = memo;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(function () { setCopied(false); }, 2000); } catch (_e) {}
      document.body.removeChild(ta);
    }
  }

  function clearAgenda() {
    if (!profile) return;
    const ports = MEETING_PROFILES[profile].ports;
    /* Snapshot the memo BEFORE clearing so the Log tab preserves exactly
       what was distributed (including the Trading Agenda lines that are
       about to disappear from the generator). */
    addMemoLog({ profile: profile, memo: memo });
    setCompanies(function (cs) { return clearAgendaFlags(cs, ports); });
    /* Jump to the Log tab so the user can see the entry that just landed. */
    reset();
    setTab("log");
  }

  const logEntries = memoLog || [];

  return (
    <div className="fixed inset-0 bg-black/50 z-[1500] flex items-start justify-center p-4 overflow-y-auto" onClick={close}>
      <div onClick={function (e) { e.stopPropagation(); }} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl my-8 max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="text-base font-semibold text-gray-900 dark:text-slate-100">PM Meeting Memo</div>
          <div className="flex items-center gap-1">
            <button onClick={function () { setTab("generate"); }} className={tabClass(tab === "generate")}>Generate</button>
            <button onClick={function () { setTab("log"); }} className={tabClass(tab === "log")}>
              Log{logEntries.length ? " (" + logEntries.length + ")" : ""}
            </button>
          </div>
          <button onClick={close} className="ml-auto text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 cursor-pointer">Close ✕</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          {tab === "log" ? (
            <LogTab
              entries={logEntries}
              expandedId={expandedLogId}
              onToggle={function (id) { setExpandedLogId(expandedLogId === id ? null : id); }}
              onDelete={function (id) {
                if (typeof window !== "undefined" && window.confirm && !window.confirm("Delete this memo log entry? This cannot be undone.")) return;
                deleteMemoLog(id);
                if (expandedLogId === id) setExpandedLogId(null);
              }}
            />
          ) : !profile ? (
            <GeneratePicker onPick={setProfile} />
          ) : (
            <GenerateView
              memo={memo}
              copied={copied}
              onReset={reset}
              onCopy={copyMemo}
              onClear={clearAgenda}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function GeneratePicker({ onPick }) {
  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-slate-400 mb-3">
        Generate the post-meeting compliance memo from this session's
        weight changes (Trading Agenda) + the last 6 days of weight
        changes (Allocation Changes) + the last 6 days of approved TP
        changes (FV Target Changes).
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={function () { onPick("tuesday"); }} className={BTN_PRIMARY}>
          Tuesday — FIN / IN / FGL / GL
        </button>
        <button onClick={function () { onPick("thursday"); }} className={BTN_PRIMARY}>
          Thursday — EM / SC
        </button>
      </div>
      <div className="text-[11px] text-gray-400 dark:text-slate-500 italic mt-3">
        Tuesday button outputs the "Multi Cap Strategies" header.
        Thursday outputs "EM ADR, International Small Cap".
      </div>
    </div>
  );
}

function GenerateView({ memo, copied, onReset, onCopy, onClear }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={onReset} className={BTN_GHOST}>← Pick different meeting</button>
        <button onClick={onCopy} className={BTN_PRIMARY}>{copied ? "✓ Copied" : "Copy to clipboard"}</button>
        <button onClick={onClear} className={BTN_GHOST} title="Save this memo to the Log tab and mark every Trading Agenda entry for this meeting's portfolios as executed. After this, those entries surface in the 'Allocation Changes' section on future memos instead of 'Trading Agenda'.">
          Clear agenda (mark executed)
        </button>
      </div>
      <textarea
        value={memo}
        readOnly
        rows={20}
        onClick={function (e) { e.target.select(); }}
        className="w-full text-xs font-mono px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 leading-relaxed resize-y"
      />
      <div className="text-[11px] text-gray-400 dark:text-slate-500 italic mt-2">
        The format is a starting point — edit before pasting into the
        compliance email if any line needs tweaking. After distributing
        the memo, click "Clear agenda" so this session's decisions move
        to the Allocation Changes section on the next memo. A snapshot is
        saved to the Log tab so you can refer back to what was sent.
      </div>
    </div>
  );
}

function LogTab({ entries, expandedId, onToggle, onDelete }) {
  if (!entries.length) {
    return (
      <div className="text-sm text-gray-500 dark:text-slate-400">
        No memos logged yet. After generating a memo and clicking
        "Clear agenda (mark executed)" on the Generate tab, a snapshot of
        the memo lands here so you can refer back to what was distributed.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map(function (e) {
        const expanded = expandedId === e.id;
        const profLabel = e.profile === "tuesday"
          ? "Tuesday (MultiCap)"
          : e.profile === "thursday"
          ? "Thursday (EM+SC)"
          : (e.profile || "?");
        return (
          <div key={e.id} className="border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                onClick={function () { onToggle(e.id); }}
                className="text-xs flex-1 text-left cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
              >
                <span className="font-medium">{e.date || "?"}</span>
                <span className="text-gray-500 dark:text-slate-400 ml-2">· {profLabel}</span>
                {e.author ? <span className="text-gray-500 dark:text-slate-400 ml-2">· {e.author}</span> : null}
                <span className="text-gray-400 dark:text-slate-500 ml-2">{expanded ? "▾" : "▸"}</span>
              </button>
              <button
                onClick={function () { onDelete(e.id); }}
                className="text-xs px-2 py-0.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                title="Delete this log entry"
              >
                Delete
              </button>
            </div>
            {expanded ? (
              <pre className="text-xs font-mono px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 whitespace-pre-wrap overflow-x-auto leading-relaxed">{e.memo}</pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
