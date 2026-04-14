import { useState, useEffect } from "react";
import { SECTION_SUBHEADINGS } from '../../constants/index.js';
import { toHTML } from '../../utils/index.js';

function SectionEditTab({ title, content, onSave }) {
  var TICKER_SECTION = "Overview";
  var bulletSections = new Set(["Thesis", "Segments", "Guidance / KPIs", "Key Challenges"]);
  var useBullets = bulletSections.has(title);
  var isEmpty = !content || !content.trim();

  var [editing, setEditing] = useState(isEmpty);
  var [val, setVal] = useState(content || "");
  var [showRef, setShowRef] = useState(false);
  var subheadings = SECTION_SUBHEADINGS[title] || [];

  function parseBullets(text) {
    var lines = text.split("\n").map(function (l) { return l.replace(/^•\s*/, "").trim(); }).filter(function (l) { return l; });
    while (lines.length < 5) lines.push("");
    return lines.slice(0, 15);
  }

  var [bullets, setBullets] = useState(function () { return useBullets ? parseBullets(content || []) : []; });

  function bulletsToText(bl) { return bl.filter(function (b) { return b.trim(); }).map(function (b) { return "\u2022 " + b; }).join("\n"); }
  function addBullet() { if (bullets.length < 15) setBullets(function (b) { return b.concat([""]); }); }
  function removeBullet(i) { setBullets(function (b) { return b.filter(function (_, j) { return j !== i; }); }); }
  function updBullet(i, v) { setBullets(function (b) { var n = b.slice(); n[i] = v; return n; }); }

  useEffect(function () {
    setVal(content || "");
    if (!content || !content.trim()) setEditing(true);
    if (useBullets) setBullets(parseBullets(content || ""));
  }, [content]);

  /* -------- Bullet mode -------- */
  if (useBullets) {
    var hasBullets = bullets.some(function (b) { return b.trim(); }) || bullets.length >= 5;
    if (!hasBullets) { setBullets(["", "", "", "", ""]); }

    return (
      <div>
        <div className="flex justify-between items-center mb-2.5 flex-wrap gap-1.5">
          <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</span>
          <div className="flex gap-1.5">
            {!editing && (
              <button
                onClick={function () { setEditing(true); setBullets(parseBullets(content || "")); }}
                className="text-xs px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500 dark:text-slate-400 uppercase">
                Bullets ({bullets.filter(function (b) { return b.trim(); }).length}/15)
              </span>
              {bullets.length < 15 && (
                <button
                  onClick={addBullet}
                  className="text-xs px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  + Add
                </button>
              )}
            </div>

            {bullets.map(function (b, i) {
              return (
                <div key={i} className="flex gap-1.5 mb-1 items-center">
                  <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">{"\u2022"}</span>
                  <textarea
                    value={b}
                    onChange={function (e) { updBullet(i, e.target.value); }}
                    placeholder={"Point " + (i + 1)}
                    rows={1}
                    className="text-sm px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 flex-1 resize-none font-[inherit] leading-normal overflow-hidden focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    style={{ fieldSizing: "content" }}
                  />
                  {bullets.length > 1 && (
                    <span
                      onClick={function () { removeBullet(i); }}
                      className="text-xs text-red-600 dark:text-red-400 cursor-pointer shrink-0 hover:text-red-800 dark:hover:text-red-300 transition-colors"
                    >
                      x
                    </span>
                  )}
                </div>
              );
            })}

            <div className="flex gap-2 mt-2">
              <button
                onClick={function () { onSave(bulletsToText(bullets)); setEditing(false); }}
                className="text-xs px-4 py-1.5 font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Save
              </button>
              {!isEmpty && (
                <span
                  onClick={function () { setEditing(false); setBullets(parseBullets(content || "")); }}
                  className="text-xs text-gray-500 dark:text-slate-400 cursor-pointer px-2 py-1.5 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
                >
                  Cancel
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm leading-[1.8] text-gray-900 dark:text-slate-100 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 min-h-[60px]">
            {bullets.filter(function (b) { return b.trim(); }).map(function (b, i) {
              return <div key={i} className="mb-1.5">{"\u2022"} {b}</div>;
            })}
          </div>
        )}
      </div>
    );
  }

  /* -------- Free-text mode -------- */
  var isEmpty2 = !content || !content.trim();

  return (
    <div>
      <div className="flex justify-between items-center mb-2.5 flex-wrap gap-1.5">
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</span>
        <div className="flex gap-1.5">
          {subheadings.length > 0 && (
            <button
              onClick={function () { setShowRef(function (s) { return !s; }); }}
              className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 opacity-70 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {showRef ? "Hide" : "Show"} headings
            </button>
          )}
          {!editing && (
            <button
              onClick={function () { setEditing(true); setVal(content || ""); }}
              className="text-xs px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {showRef && subheadings.length > 0 && (
        <div className="mb-2.5 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 rounded-md border border-yellow-300 dark:border-yellow-700 text-xs text-yellow-800 dark:text-yellow-300">
          <div className="font-medium mb-1">Standard subheadings:</div>
          <div className="flex flex-wrap gap-1.5">
            {subheadings.map(function (h) {
              return (
                <code key={h} className="text-xs bg-yellow-100 dark:bg-yellow-900/50 px-1.5 py-0.5 rounded">
                  {h}
                </code>
              );
            })}
          </div>
        </div>
      )}

      {editing ? (
        <div>
          {subheadings.length > 0 && isEmpty2 && (
            <button
              onClick={function () {
                var txt = subheadings.map(function (h) { return h + "\n"; }).join("\n");
                setVal(function (v) { return v ? v + "\n\n" + txt : txt; });
              }}
              className="text-xs px-2 py-1 mb-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              + Insert standard subheadings
            </button>
          )}

          <textarea
            value={val}
            onChange={function (e) { setVal(e.target.value); }}
            className="w-full min-h-[220px] resize-y text-sm px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-[inherit] leading-relaxed mb-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          <div className="flex gap-2">
            <button
              onClick={function () { onSave(val); setEditing(false); }}
              className="text-xs px-4 py-1.5 font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Save
            </button>
            {!isEmpty2 && (
              <span
                onClick={function () { setEditing(false); setVal(content || ""); }}
                className="text-xs text-gray-500 dark:text-slate-400 cursor-pointer px-2 py-1.5 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
              >
                Cancel
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm leading-[1.8] text-gray-900 dark:text-slate-100 whitespace-pre-wrap px-3 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 min-h-[60px]">
          <span dangerouslySetInnerHTML={{ __html: toHTML(content || "") }} />
        </div>
      )}
    </div>
  );
}

export default SectionEditTab;
