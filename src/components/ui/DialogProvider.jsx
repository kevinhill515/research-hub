/* Promise-based confirm / alert replacement for native window.confirm and
 * window.alert. The native dialogs are ugly, freeze the event loop, and are
 * sometimes suppressed by browsers.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   const alert   = useAlert();
 *
 *   if (await confirm("Delete this feedback?")) { ... }
 *   await alert("Fill in the area and description.");
 *
 * Confirm resolves to true/false, alert resolves to undefined when dismissed. */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const DialogContext = createContext(null);

export function useConfirm() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useConfirm must be used inside <DialogProvider>");
  return ctx.confirm;
}

export function useAlert() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useAlert must be used inside <DialogProvider>");
  return ctx.alert;
}

export function DialogProvider({ children }) {
  /* Single slot — at most one dialog open at a time. */
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);

  const close = useCallback(function (value) {
    if (resolveRef.current) {
      const r = resolveRef.current;
      resolveRef.current = null;
      r(value);
    }
    setDialog(null);
  }, []);

  const confirm = useCallback(function (message, opts) {
    return new Promise(function (resolve) {
      resolveRef.current = resolve;
      setDialog({
        kind: "confirm",
        message: message,
        title:      (opts && opts.title)       || "Confirm",
        okLabel:    (opts && opts.okLabel)     || "OK",
        cancelLabel:(opts && opts.cancelLabel) || "Cancel",
        danger:     !!(opts && opts.danger),
      });
    });
  }, []);

  const alertFn = useCallback(function (message, opts) {
    return new Promise(function (resolve) {
      resolveRef.current = resolve;
      setDialog({
        kind: "alert",
        message: message,
        title:   (opts && opts.title)   || "Notice",
        okLabel: (opts && opts.okLabel) || "OK",
      });
    });
  }, []);

  /* Keyboard: Enter confirms, Esc cancels/dismisses. */
  useEffect(function () {
    if (!dialog) return;
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(dialog.kind === "confirm" ? false : undefined); }
      if (e.key === "Enter")  { e.preventDefault(); close(dialog.kind === "confirm" ? true  : undefined); }
    }
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
  }, [dialog, close]);

  return (
    <DialogContext.Provider value={{ confirm: confirm, alert: alertFn }}>
      {children}
      {dialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onClick={function (e) {
            /* Click outside the card dismisses (same as Esc). */
            if (e.target === e.currentTarget) close(dialog.kind === "confirm" ? false : undefined);
          }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl max-w-md w-full p-5">
            <div id="dialog-title" className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-2">
              {dialog.title}
            </div>
            <div className="text-sm text-gray-700 dark:text-slate-300 mb-4 whitespace-pre-wrap">
              {dialog.message}
            </div>
            <div className="flex justify-end gap-2">
              {dialog.kind === "confirm" && (
                <button
                  type="button"
                  onClick={function () { close(false); }}
                  className="text-sm px-3 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={function () { close(dialog.kind === "confirm" ? true : undefined); }}
                className={
                  "text-sm px-3 py-1.5 font-semibold rounded-md text-white transition-colors " +
                  (dialog.danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-700 hover:bg-blue-800")
                }
              >
                {dialog.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
