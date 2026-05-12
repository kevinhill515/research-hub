import { useState, useRef, useEffect } from "react";
import { TEAM_MEMBERS, TEAM_COLORS, PORTFOLIOS, PORT_NAMES } from '../../constants/index.js';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { useConfirm } from '../ui/DialogProvider.jsx';

function MentionInput({ value, onChange, onSubmit, placeholder, autoFocus }){
  var [suggestions, setSuggestions] = useState([]);
  var ref = useRef();

  /* Auto-grow: resize the textarea to fit its content. Reset to "auto"
     first so shrinking works after deletions, then set to scrollHeight.
     Capped at 60vh so a runaway paste doesn't take over the panel. */
  useEffect(function(){
    var el = ref.current;
    if(!el) return;
    el.style.height = "auto";
    var maxPx = Math.floor(window.innerHeight * 0.6);
    el.style.height = Math.min(el.scrollHeight, maxPx) + "px";
  }, [value]);

  function handleChange(e){
    var text = e.target.value;
    onChange(text);
    var cursor = e.target.selectionStart;
    var pre = text.slice(0, cursor);
    var match = pre.match(/@(\w*)$/);
    if(match){
      var q = match[1].toLowerCase();
      setSuggestions(TEAM_MEMBERS.filter(function(m){return m.toLowerCase().startsWith(q);}));
    } else {
      setSuggestions([]);
    }
  }

  function pickMention(name){
    var el = ref.current;
    if(!el) return;
    var pre = value.slice(0, el.selectionStart);
    var post = value.slice(el.selectionStart);
    var newPre = pre.replace(/@\w*$/, "@" + name + " ");
    onChange(newPre + post);
    setSuggestions([]);
    setTimeout(function(){el.focus();}, 0);
  }

  function handleKey(e){
    if(e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit){
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKey}
        placeholder={placeholder || "Add a comment... (use @name to mention)"}
        autoFocus={autoFocus}
        rows={2}
        className="w-full text-sm px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y leading-relaxed"
      />
      {suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg overflow-hidden">
          {suggestions.map(function(m){
            return (
              <div key={m} onClick={function(){pickMention(m);}} className="px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{background:TEAM_COLORS[m]}}/>
                {m}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function renderTextWithMentions(text){
  if(!text) return null;
  var parts = text.split(/(@\w+)/g);
  return parts.map(function(p, i){
    if(p.match(/^@\w+$/)){
      var name = p.slice(1);
      var color = TEAM_COLORS[name];
      if(color){
        return <span key={i} className="font-medium px-1 rounded" style={{color: color, background: color + "20"}}>{p}</span>;
      }
    }
    return <span key={i}>{p}</span>;
  });
}

function AnnotationCard({ ann, onReply, onResolve, onUnresolve, onDelete, onUpdate }){
  var { currentUser, markAnnotationRead } = useCompanyContext();
  var confirm = useConfirm();
  var [replyText, setReplyText] = useState("");
  var [showReply, setShowReply] = useState(false);
  var [editing, setEditing] = useState(false);
  var [editText, setEditText] = useState(ann.text);
  var authorColor = TEAM_COLORS[ann.author] || "#6b7280";
  var isUnread = !(ann.readBy || []).includes(currentUser);

  useEffect(function(){
    if(isUnread && currentUser){
      markAnnotationRead(ann.id);
    }
  }, [ann.id]);

  function submitReply(){
    if(!replyText.trim()) return;
    onReply(ann.id, replyText);
    setReplyText("");
    setShowReply(false);
  }

  function saveEdit(){
    onUpdate(ann.id, { text: editText });
    setEditing(false);
  }

  var scopeLabel = "";
  if(ann.scope === "portfolio") {
    /* Multi-portfolio Portfolio scope: list all when array set;
       legacy single-portfolio annotations still use the string. */
    var pPorts = Array.isArray(ann.portfolios) && ann.portfolios.length > 0
      ? ann.portfolios
      : (ann.portfolio ? [ann.portfolio] : []);
    scopeLabel = "Portfolio: " + (pPorts.length > 0
      ? pPorts.map(function(p){return PORT_NAMES[p] || p;}).join(" & ")
      : "—");
  }
  else if(ann.scope === "company") scopeLabel = "Company-wide";
  else if(ann.scope === "row") {
    /* "Row" was renamed "Holding" per IC. New annotations carry a
       portfolios[] array; legacy ones have a single portfolio string. */
    var ports = Array.isArray(ann.portfolios) && ann.portfolios.length > 0
      ? ann.portfolios
      : (ann.portfolio ? [ann.portfolio] : []);
    scopeLabel = "Holding · " + (ports.length > 0 ? ports.join(" + ") : "portfolio");
  }
  else if(ann.scope === "cell") scopeLabel = "Cell: " + (ann.cellKey || "unknown");

  return (
    <div className={"rounded-lg border p-3 mb-2 " + (ann.resolved ? "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-70" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700")}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full" style={{background: authorColor}}/>
        <span className="text-xs font-semibold text-gray-900 dark:text-slate-100">{ann.author}</span>
        <span className="text-[10px] text-gray-500 dark:text-slate-400">{ann.date}</span>
        <span className="text-[10px] text-gray-500 dark:text-slate-400 ml-auto">{scopeLabel}</span>
      </div>

      {editing ? (
        <div className="mb-2">
          <MentionInput value={editText} onChange={setEditText} onSubmit={saveEdit} autoFocus/>
          <div className="flex gap-2 mt-1">
            <button onClick={saveEdit} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700">Save</button>
            <button onClick={function(){setEditing(false);setEditText(ann.text);}} className="text-xs px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap mb-2">{renderTextWithMentions(ann.text)}</div>
      )}

      {(ann.replies || []).length > 0 && (
        <div className="ml-3 pl-3 border-l-2 border-slate-200 dark:border-slate-700 mt-2 space-y-2">
          {ann.replies.map(function(r){
            var rColor = TEAM_COLORS[r.author] || "#6b7280";
            return (
              <div key={r.id} className="text-xs">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{background: rColor}}/>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">{r.author}</span>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400">{r.date}</span>
                </div>
                <div className="text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{renderTextWithMentions(r.text)}</div>
              </div>
            );
          })}
        </div>
      )}

      {showReply && !ann.resolved && (
        <div className="mt-2">
          <MentionInput value={replyText} onChange={setReplyText} onSubmit={submitReply} placeholder="Reply... (Ctrl+Enter to send)" autoFocus/>
          <div className="flex gap-2 mt-1">
            <button onClick={submitReply} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700">Reply</button>
            <button onClick={function(){setShowReply(false);setReplyText("");}} className="text-xs px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
          </div>
        </div>
      )}

      {/* Follow-up date — set/edit/clear at any time. Surfaces on the
         Companies banner and the Discussions "Follow-ups" tab once the
         date is within 7 days. */}
      {(function(){
        var due = ann.followUpDate || "";
        var today = new Date().toISOString().slice(0, 10);
        var overdue = due && due < today;
        var soon = due && !overdue && (function(){
          var d = new Date(due + "T00:00:00").getTime();
          var n = Date.now();
          return (d - n) / 86400000 <= 7;
        })();
        var color = overdue
          ? "text-red-600 dark:text-red-400"
          : soon
            ? "text-amber-600 dark:text-amber-400"
            : due
              ? "text-blue-600 dark:text-blue-400"
              : "text-gray-500 dark:text-slate-400";
        return (
          <div className="flex items-center gap-2 mb-2 text-[11px]">
            <span className={color}>📅 Follow up:</span>
            <input
              type="date"
              value={due}
              onChange={function(e){ onUpdate(ann.id, { followUpDate: e.target.value || null }); }}
              className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100"
            />
            {due && (
              <span onClick={function(){ onUpdate(ann.id, { followUpDate: null }); }} className="text-[10px] text-gray-400 dark:text-slate-500 cursor-pointer hover:text-red-500 dark:hover:text-red-400">clear</span>
            )}
            {due && <span className={"text-[10px] italic ml-1 " + color}>{overdue ? "overdue" : soon ? "due ≤ 7d" : ""}</span>}
          </div>
        );
      })()}

      <div className="flex gap-3 mt-2 text-xs text-gray-500 dark:text-slate-400">
        {!ann.resolved && <span onClick={function(){setShowReply(!showReply);}} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">Reply</span>}
        {ann.resolved ? (
          <span onClick={function(){onUnresolve(ann.id);}} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">Reopen</span>
        ) : (
          <span onClick={function(){onResolve(ann.id);}} className="cursor-pointer hover:text-green-600 dark:hover:text-green-400">Resolve</span>
        )}
        {ann.author === currentUser && !editing && !ann.resolved && (
          <span onClick={function(){setEditing(true);}} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">Edit</span>
        )}
        {/* Delete: author-only while active; anyone-on-team once resolved
           (so archived discussions can be cleaned up regardless of who
           wrote them). */}
        {(ann.author === currentUser || ann.resolved) && !editing && (
          <span
            role="button"
            tabIndex={0}
            onClick={async function(){ if(await confirm("Delete this comment?",{danger:true,okLabel:"Delete"}))onDelete(ann.id); }}
            onKeyDown={function(e){ if(e.key==="Enter"||e.key===" "){e.preventDefault();(async function(){if(await confirm("Delete this comment?",{danger:true,okLabel:"Delete"}))onDelete(ann.id);})();} }}
            className="cursor-pointer hover:text-red-600 dark:hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
          >Delete</span>
        )}
        {ann.resolved && (
          <span className="ml-auto text-[10px] italic">resolved by {ann.resolvedBy} on {ann.resolvedDate}</span>
        )}
      </div>
    </div>
  );
}

export default function DiscussionsPanel({ open, onClose, initialScope, initialPortfolio, initialCompanyId, companies }){
  var { annotations, addAnnotation, updateAnnotation, deleteAnnotation, resolveAnnotation, unresolveAnnotation, addReply, currentUser } = useCompanyContext();
  var [filter, setFilter] = useState("active"); // active | archive | mentions | followups
  var [scopeFilter, setScopeFilter] = useState("all"); // all | portfolio | company
  /* Archive-only kind filter — once you're in Archive, you usually want
     to triage by scope shape (portfolio thread vs. company-wide vs.
     specific holding) so you can clean up by category. "row" is the
     stored value for what the UI labels "holding". */
  var [archiveKind, setArchiveKind] = useState("all"); // all | portfolio | company | row
  var [newText, setNewText] = useState("");
  /* Scope normalization: legacy "row" → "holding" (renamed for
     clarity per IC feedback). The stored annotation scope is still
     "row" on save for backward compat with existing data and the
     filter logic; "holding" is a UI-only label. */
  var [newScope, setNewScope] = useState(function(){
    var s = initialScope || "portfolio";
    return s === "row" ? "holding" : s;
  });
  /* Both Portfolio and Holding scopes support multi-portfolio
     targeting via a chip selector. Initial state seeded with the
     single initialPortfolio when the panel was opened from a specific
     portfolio context, else default to GL for Portfolio scope. */
  var [newPortfolio, setNewPortfolio] = useState(initialPortfolio || "GL"); /* legacy single-port write */
  var [newPortfolios, setNewPortfolios] = useState(function(){
    return initialPortfolio ? [initialPortfolio] : [];
  });
  var [newCompanyId, setNewCompanyId] = useState(initialCompanyId || null);

  useEffect(function(){
    if(open){
      var s = initialScope || "portfolio";
      setNewScope(s === "row" ? "holding" : s);
      setNewPortfolio(initialPortfolio || "GL");
      setNewPortfolios(initialPortfolio ? [initialPortfolio] : []);
      setNewCompanyId(initialCompanyId || null);
    }
  }, [open, initialScope, initialPortfolio, initialCompanyId]);

  if(!open) return null;

  var filtered = annotations.filter(function(a){
    if(filter === "active" && a.resolved) return false;
    if(filter === "archive" && !a.resolved) return false;
    if(filter === "mentions"){
      var mentioned = (a.mentions || []).indexOf(currentUser) >= 0 ||
                      (a.replies || []).some(function(r){return (r.mentions || []).indexOf(currentUser) >= 0;});
      if(!mentioned) return false;
    }
    if(filter === "followups" && !a.followUpDate) return false;
    if(scopeFilter === "portfolio" && initialPortfolio && a.portfolio !== initialPortfolio && a.scope !== "company") return false;
    if(scopeFilter === "company" && initialCompanyId && a.companyId !== initialCompanyId) return false;
    if(filter === "archive" && archiveKind !== "all" && a.scope !== archiveKind) return false;
    return true;
  });

  /* Archive sort: group by scope kind, then most-recently-resolved first
     within each group. Active/Mentions stay in default chronological order. */
  if(filter === "archive"){
    var kindOrder = { portfolio: 0, company: 1, row: 2, cell: 3 };
    filtered = filtered.slice().sort(function(a, b){
      var ka = kindOrder[a.scope] !== undefined ? kindOrder[a.scope] : 99;
      var kb = kindOrder[b.scope] !== undefined ? kindOrder[b.scope] : 99;
      if(ka !== kb) return ka - kb;
      var ra = a.resolvedDate || a.date || "";
      var rb = b.resolvedDate || b.date || "";
      return rb.localeCompare(ra);
    });
  }
  /* Follow-ups: overdue first, then upcoming by ascending date. */
  if(filter === "followups"){
    filtered = filtered.slice().sort(function(a, b){
      return (a.followUpDate || "").localeCompare(b.followUpDate || "");
    });
  }

  function submitNew(){
    if(!newText.trim()) return;
    /* Persist "holding" scope as legacy "row" + portfolios[] array
       so existing readers that look at `a.portfolio` keep working
       (we write the first portfolio there); new readers consume the
       portfolios[] array for multi-portfolio targeting. */
    var ann = { scope: newScope === "holding" ? "row" : newScope, text: newText.trim(), color: TEAM_COLORS[currentUser] || "#2563eb" };
    if(newScope === "portfolio"){
      var pp = (newPortfolios || []).filter(Boolean);
      if(pp.length === 0) pp = [newPortfolio];
      ann.portfolio = pp[0];
      ann.portfolios = pp;
    }
    if(newScope === "company") ann.companyId = newCompanyId;
    if(newScope === "holding"){
      var ports = (newPortfolios || []).filter(Boolean);
      if(ports.length === 0) ports = [newPortfolio];
      ann.portfolio = ports[0];
      ann.portfolios = ports;
      ann.companyId = newCompanyId;
    }
    addAnnotation(ann);
    setNewText("");
  }

  function companyName(id){
    var c = (companies || []).find(function(x){return x.id === id;});
    return c ? c.name : "Unknown";
  }

  return (
    <div className="fixed inset-0 z-[900] flex justify-end" onClick={onClose}>
      <div className="bg-black/30 absolute inset-0"/>
      <div onClick={function(e){e.stopPropagation();}} className="relative bg-white dark:bg-slate-950 w-full max-w-md h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-700">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">💬 Discussions</div>
          <span onClick={onClose} className="text-xs text-gray-500 dark:text-slate-400 cursor-pointer hover:text-gray-700 dark:hover:text-slate-300">Close ✕</span>
        </div>

        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex gap-1.5 flex-wrap">
          {[["active","Active"],["archive","Archive"],["followups","Follow-ups"],["mentions","My mentions"]].map(function(f){
            var active = filter === f[0];
            return <button key={f[0]} onClick={function(){setFilter(f[0]);}} className={"text-xs px-2.5 py-1 rounded-full border " + (active ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium" : "border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{f[1]}</button>;
          })}
        </div>

        {filter === "archive" && (
          <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex gap-1.5 flex-wrap items-center">
            <span className="text-[10px] text-gray-500 dark:text-slate-400 uppercase">Group by:</span>
            {[["all","All"],["portfolio","Portfolio"],["company","Company-wide"],["row","Holding"]].map(function(k){
              var active = archiveKind === k[0];
              return <button key={k[0]} onClick={function(){setArchiveKind(k[0]);}} className={"text-[11px] px-2 py-0.5 rounded-full border " + (active ? "bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-500 text-gray-900 dark:text-slate-100 font-semibold" : "border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{k[1]}</button>;
            })}
          </div>
        )}

        {(initialPortfolio || initialCompanyId) && (
          <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-500 dark:text-slate-400 self-center uppercase">Scope:</span>
            {[["all","All"],initialPortfolio?["portfolio","This portfolio"]:null,initialCompanyId?["company","This company"]:null].filter(Boolean).map(function(f){
              var active = scopeFilter === f[0];
              return <button key={f[0]} onClick={function(){setScopeFilter(f[0]);}} className={"text-[11px] px-2 py-0.5 rounded-full border " + (active ? "bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-500 text-gray-900 dark:text-slate-100" : "border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400")}>{f[1]}</button>;
            })}
          </div>
        )}

        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="text-[11px] text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">New discussion</div>
          {/* Scope picker — three lanes, each with an example to make the
              choice unambiguous. Per IC feedback: "Company (global)" was
              ambiguous (replaced with "Company-wide"); "Row" was
              opaque (replaced with "Holding"); Holding now supports
              multi-portfolio targeting. */}
          <div className="flex gap-1.5 mb-2 flex-wrap">
            <select value={newScope} onChange={function(e){setNewScope(e.target.value);}} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100">
              <option value="portfolio">Portfolio</option>
              <option value="company">Company-wide</option>
              <option value="holding">Holding</option>
            </select>
            {/* Company dropdown for Company-wide / Holding scopes.
                Companies sorted alphabetically by name, with a context
                tag showing portfolio membership (Own) or status (Focus
                / Watch) so the user can scan to the right name —
                instead of being shown the alphabetically-first name
                (Luckin Coffee) by accident. */}
            {(newScope === "company" || newScope === "holding") && (function(){
              /* Companies eligible for discussions: any non-Sold
                 company. Sorted by name. Each option labelled
                 "{name} — {ports}" (when in portfolios) or
                 "{name} — Focus" / "{name} — Watch". */
              var sorted = (companies || [])
                .filter(function(c){return c && c.name;})
                .slice()
                .sort(function(a, b){ return (a.name || "").localeCompare(b.name || ""); });
              function contextTag(c){
                if(Array.isArray(c.portfolios) && c.portfolios.length > 0) return c.portfolios.join(", ");
                if(c.status === "Focus") return "Focus";
                if(c.status === "Watch") return "Watch";
                if(c.status === "Sold") return "Sold";
                return "";
              }
              return (
                <select value={newCompanyId || ""} onChange={function(e){var v = e.target.value; setNewCompanyId(parseFloat(v) || v);}} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 flex-1 min-w-0">
                  <option value="">Select company...</option>
                  {sorted.map(function(c){
                    var tag = contextTag(c);
                    return <option key={c.id} value={c.id}>{c.name}{tag ? "  —  " + tag : ""}</option>;
                  })}
                </select>
              );
            })()}
          </div>
          {/* Multi-portfolio chip selector — applies to Portfolio scope
              ('FGL & GL: Reduce Energy exposure') and Holding scope
              ('Sony oversize in FGL + GL'). One or more pills can be
              active. */}
          {(newScope === "portfolio" || newScope === "holding") && (
            <div className="mb-2">
              <div className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">Portfolio(s)</div>
              <div className="flex gap-1 flex-wrap">
                {PORTFOLIOS.map(function(p){
                  var on = (newPortfolios || []).indexOf(p) >= 0;
                  return (
                    <span key={p}
                          onClick={function(){
                            setNewPortfolios(function(prev){
                              var cur = prev || [];
                              return cur.indexOf(p) >= 0 ? cur.filter(function(x){return x !== p;}) : cur.concat([p]);
                            });
                          }}
                          className={"text-[11px] px-2 py-0.5 rounded-full cursor-pointer border transition-colors " + (on ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>
                      {p}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {/* Inline scope-explainer with concrete examples. */}
          <div className="mb-2 px-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/50 text-[10px] text-gray-500 dark:text-slate-400 leading-snug">
            {newScope === "portfolio" && (<><span className="font-semibold text-gray-700 dark:text-slate-300">Portfolio:</span> a portfolio-wide thread that doesn&apos;t pertain to one company. <em>e.g. &ldquo;FGL: Reduce Energy exposure&rdquo; or &ldquo;FGL &amp; GL: Reduce Energy exposure&rdquo;.</em></>)}
            {newScope === "company" && (<><span className="font-semibold text-gray-700 dark:text-slate-300">Company-wide:</span> applies to a company across all portfolios it sits in. <em>e.g. &ldquo;Sony Q4 reaction looks excessive — bull-case still intact.&rdquo;</em></>)}
            {newScope === "holding" && (<><span className="font-semibold text-gray-700 dark:text-slate-300">Holding:</span> a company&apos;s position in one or more specific portfolios. <em>e.g. &ldquo;Sony oversize in FGL + GL — trim 50bp on each.&rdquo;</em></>)}
          </div>
          <MentionInput value={newText} onChange={setNewText} onSubmit={submitNew}/>
          <div className="flex gap-2 mt-1.5">
            <button onClick={submitNew} disabled={!newText.trim()} className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">Post</button>
            <span className="text-[10px] text-gray-500 dark:text-slate-400 self-center">Ctrl+Enter to post · @mention to tag someone</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filtered.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-slate-400 text-center py-8">
              {filter === "active" ? "No active discussions. Start one above." :
               filter === "archive" ? "No archived discussions." :
               filter === "followups" ? "No discussions with a follow-up date set. Set one on any card." :
               "No mentions for you."}
            </div>
          ) : (
            filtered.map(function(a){
              var targetLabel = "";
              if(a.scope === "company" && a.companyId) targetLabel = companyName(a.companyId);
              else if(a.scope === "row" && a.companyId) targetLabel = companyName(a.companyId) + " · " + a.portfolio;
              else if(a.scope === "portfolio") targetLabel = PORT_NAMES[a.portfolio] || a.portfolio;
              else if(a.scope === "cell") targetLabel = companyName(a.companyId) + " · " + a.cellKey;
              return (
                <div key={a.id}>
                  {targetLabel && <div className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1 mt-1">{targetLabel}</div>}
                  <AnnotationCard
                    ann={a}
                    onReply={addReply}
                    onResolve={resolveAnnotation}
                    onUnresolve={unresolveAnnotation}
                    onDelete={deleteAnnotation}
                    onUpdate={updateAnnotation}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
