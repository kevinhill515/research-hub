import { useState, useRef, useEffect } from "react";
import { TEAM_MEMBERS, TEAM_COLORS, PORTFOLIOS, PORT_NAMES } from '../../constants/index.js';
import { useCompanyContext } from '../../context/CompanyContext.jsx';
import { useConfirm } from '../ui/DialogProvider.jsx';

function MentionInput({ value, onChange, onSubmit, placeholder, autoFocus }){
  var [suggestions, setSuggestions] = useState([]);
  var ref = useRef();

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
  if(ann.scope === "portfolio") scopeLabel = "Portfolio: " + (PORT_NAMES[ann.portfolio] || ann.portfolio);
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

      <div className="flex gap-3 mt-2 text-xs text-gray-500 dark:text-slate-400">
        {!ann.resolved && <span onClick={function(){setShowReply(!showReply);}} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">Reply</span>}
        {ann.resolved ? (
          <span onClick={function(){onUnresolve(ann.id);}} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">Reopen</span>
        ) : (
          <span onClick={function(){onResolve(ann.id);}} className="cursor-pointer hover:text-green-600 dark:hover:text-green-400">Resolve</span>
        )}
        {ann.author === currentUser && !editing && (
          <>
            <span onClick={function(){setEditing(true);}} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">Edit</span>
            <span
              role="button"
              tabIndex={0}
              onClick={async function(){ if(await confirm("Delete this comment?",{danger:true,okLabel:"Delete"}))onDelete(ann.id); }}
              onKeyDown={function(e){ if(e.key==="Enter"||e.key===" "){e.preventDefault();(async function(){if(await confirm("Delete this comment?",{danger:true,okLabel:"Delete"}))onDelete(ann.id);})();} }}
              className="cursor-pointer hover:text-red-600 dark:hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
            >Delete</span>
          </>
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
  var [filter, setFilter] = useState("active"); // active | archive | mentions
  var [scopeFilter, setScopeFilter] = useState("all"); // all | portfolio | company
  var [newText, setNewText] = useState("");
  /* Scope normalization: legacy "row" → "holding" (renamed for
     clarity per IC feedback). The stored annotation scope is still
     "row" on save for backward compat with existing data and the
     filter logic; "holding" is a UI-only label. */
  var [newScope, setNewScope] = useState(function(){
    var s = initialScope || "portfolio";
    return s === "row" ? "holding" : s;
  });
  var [newPortfolio, setNewPortfolio] = useState(initialPortfolio || "GL");
  /* Holding scope can target multiple portfolios. Initial state seeded
     with the single initialPortfolio (when discussion was opened from
     a specific portfolio-row context). */
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
    if(scopeFilter === "portfolio" && initialPortfolio && a.portfolio !== initialPortfolio && a.scope !== "company") return false;
    if(scopeFilter === "company" && initialCompanyId && a.companyId !== initialCompanyId) return false;
    return true;
  });

  function submitNew(){
    if(!newText.trim()) return;
    /* Persist "holding" scope as legacy "row" + portfolios[] array.
       Existing readers that look at `a.portfolio` continue to work
       (we still write the first portfolio there for a holding pinned
       to one); new readers can use `a.portfolios` for multi-portfolio
       targeting. */
    var ann = { scope: newScope === "holding" ? "row" : newScope, text: newText.trim(), color: TEAM_COLORS[currentUser] || "#2563eb" };
    if(newScope === "portfolio") ann.portfolio = newPortfolio;
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
          {[["active","Active"],["archive","Archive"],["mentions","My mentions"]].map(function(f){
            var active = filter === f[0];
            return <button key={f[0]} onClick={function(){setFilter(f[0]);}} className={"text-xs px-2.5 py-1 rounded-full border " + (active ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium" : "border-slate-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}>{f[1]}</button>;
          })}
        </div>

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
            {(newScope === "portfolio") && (
              <select value={newPortfolio} onChange={function(e){setNewPortfolio(e.target.value);}} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100">
                {PORTFOLIOS.map(function(p){return <option key={p} value={p}>{p}</option>;})}
              </select>
            )}
            {(newScope === "company" || newScope === "holding") && (
              <select value={newCompanyId || ""} onChange={function(e){setNewCompanyId(parseFloat(e.target.value) || e.target.value);}} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 flex-1 min-w-0">
                <option value="">Select company...</option>
                {(companies || []).map(function(c){return <option key={c.id} value={c.id}>{c.name}</option>;})}
              </select>
            )}
          </div>
          {/* Holding scope: pick one or more portfolios this holding
              spans. Click each to toggle. The portfolios list reflects
              the company's current portfolios first, then any others. */}
          {newScope === "holding" && (
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
          {/* Inline scope-explainer with a concrete example. Three
              examples, one per scope choice, so the dropdown isn't
              opaque. */}
          <div className="mb-2 px-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/50 text-[10px] text-gray-500 dark:text-slate-400 leading-snug">
            {newScope === "portfolio" && (<><span className="font-semibold text-gray-700 dark:text-slate-300">Portfolio:</span> a portfolio-wide thread that doesn't pertain to one company. <em>e.g. "FGL needs more cash exposure ahead of Fed."</em></>)}
            {newScope === "company" && (<><span className="font-semibold text-gray-700 dark:text-slate-300">Company-wide:</span> applies to a company across all portfolios it sits in. <em>e.g. "Sony Q4 reaction looks excessive — bull-case still intact."</em></>)}
            {newScope === "holding" && (<><span className="font-semibold text-gray-700 dark:text-slate-300">Holding:</span> a company's position in one or more specific portfolios. <em>e.g. "Sony oversize in FGL + GL — trim 50bp on each."</em></>)}
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
