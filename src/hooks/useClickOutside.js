/* Attach a mousedown listener that fires `onOutside` when a click
 * lands anywhere outside the element pointed to by `ref`.
 *
 * Used by every dropdown / popover in the app (ActionCell, NotesCell,
 * FlagCell, DatePicker, the column picker on AlertsPanel, etc.) — each
 * one previously inlined the same useEffect with subtly different
 * deps, which meant a bug fix in one place wouldn't propagate. Now
 * there's a single implementation to audit.
 *
 * `active` defaults to true; pass false to suspend the listener when
 * the popover is closed so we're not paying for an event on every
 * mouse click app-wide.
 */
import { useEffect } from "react";

export function useClickOutside(ref, onOutside, active) {
  const enabled = active === undefined ? true : !!active;
  useEffect(function () {
    if (!enabled) return;
    function h(e) {
      if (ref.current && !ref.current.contains(e.target)) onOutside(e);
    }
    document.addEventListener("mousedown", h);
    return function () { document.removeEventListener("mousedown", h); };
  }, [enabled, ref, onOutside]);
}
