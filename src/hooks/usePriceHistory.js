/* Lazy fetch of a single ticker's daily price history.
 *
 * The prices_history table holds one row per ticker with the full series
 * as a JSON array. Loading every ticker upfront would defeat the purpose
 * of per-row storage — components call usePriceHistory(ticker) and pull
 * just the one they need. Result is cached in-memory so re-mounting a
 * chart on the same ticker is free.
 */

import { useState, useEffect, useRef } from "react";
import { supaGet } from "../api/index.js";

/* Cross-component cache. Keyed by upper-cased ticker. The value can be
   { loading: true } (a fetch is in flight; subsequent callers wait on
   the same Promise), or { series: [...] } (resolved). */
const cache = new Map();

export function usePriceHistory(ticker) {
  const tk = (ticker || "").toUpperCase();
  const [state, setState] = useState(function () {
    const c = cache.get(tk);
    if (c && c.series) return { loading: false, series: c.series, error: null };
    return { loading: !!tk, series: null, error: null };
  });
  /* Track which ticker the current effect was kicked off for so a fast
     ticker swap doesn't race-set stale data. */
  const lastReqRef = useRef(null);

  useEffect(function () {
    if (!tk) {
      setState({ loading: false, series: null, error: null });
      return;
    }
    /* Cache hit → no network. */
    const cached = cache.get(tk);
    if (cached && cached.series) {
      setState({ loading: false, series: cached.series, error: null });
      return;
    }
    /* Active in-flight fetch → wait for it. */
    if (cached && cached.promise) {
      lastReqRef.current = tk;
      cached.promise.then(function (series) {
        if (lastReqRef.current === tk) setState({ loading: false, series: series, error: null });
      }).catch(function (err) {
        if (lastReqRef.current === tk) setState({ loading: false, series: null, error: String(err) });
      });
      return;
    }
    /* Fresh fetch. Wrap in a Promise stored in the cache so concurrent
       hooks for the same ticker share one network request. */
    setState({ loading: true, series: null, error: null });
    lastReqRef.current = tk;
    const p = supaGet("prices_history", "ticker", tk).then(function (row) {
      if (!row || !row.data) return [];
      try {
        const parsed = JSON.parse(row.data);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    });
    cache.set(tk, { promise: p });
    p.then(function (series) {
      cache.set(tk, { series: series });
      if (lastReqRef.current === tk) setState({ loading: false, series: series, error: null });
    }).catch(function (err) {
      cache.delete(tk);
      if (lastReqRef.current === tk) setState({ loading: false, series: null, error: String(err) });
    });
  }, [tk]);

  return state;
}

/* Multi-ticker variant. Takes an array of tickers and returns a map of
   { TICKER: { loading, series, error } }. Each ticker is fetched
   independently and shares the same module-level cache as usePriceHistory,
   so adding a ticker to the array doesn't invalidate the others.

   The tickers array is keyed off its sorted uppercase contents so callers
   can re-render with a fresh array reference without re-fetching. */
export function usePriceHistories(tickers) {
  const list = (tickers || [])
    .map(function (t) { return (t || "").toUpperCase(); })
    .filter(Boolean);
  /* De-dupe + stable order so the dependency key only changes when the
     set of tickers actually changes. */
  const uniq = Array.from(new Set(list)).sort();
  const key = uniq.join("|");

  const [state, setState] = useState(function () {
    const out = {};
    uniq.forEach(function (tk) {
      const c = cache.get(tk);
      if (c && c.series) out[tk] = { loading: false, series: c.series, error: null };
      else out[tk] = { loading: !!tk, series: null, error: null };
    });
    return out;
  });

  /* Mounted flag so async resolutions after unmount don't setState. */
  const mountedRef = useRef(true);
  useEffect(function () { return function () { mountedRef.current = false; }; }, []);

  useEffect(function () {
    /* Reset state to reflect the new ticker set (cached entries skip
       the loading flicker; new ones flag loading=true). */
    setState(function () {
      const out = {};
      uniq.forEach(function (tk) {
        const c = cache.get(tk);
        if (c && c.series) out[tk] = { loading: false, series: c.series, error: null };
        else out[tk] = { loading: true, series: null, error: null };
      });
      return out;
    });

    uniq.forEach(function (tk) {
      const cached = cache.get(tk);
      if (cached && cached.series) return; /* already in state */

      let p;
      if (cached && cached.promise) {
        p = cached.promise;
      } else {
        p = supaGet("prices_history", "ticker", tk).then(function (row) {
          if (!row || !row.data) return [];
          try {
            const parsed = JSON.parse(row.data);
            return Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            return [];
          }
        });
        cache.set(tk, { promise: p });
        p.then(function (series) { cache.set(tk, { series: series }); })
         .catch(function () { cache.delete(tk); });
      }

      p.then(function (series) {
        if (!mountedRef.current) return;
        setState(function (prev) {
          const next = Object.assign({}, prev);
          next[tk] = { loading: false, series: series, error: null };
          return next;
        });
      }).catch(function (err) {
        if (!mountedRef.current) return;
        setState(function (prev) {
          const next = Object.assign({}, prev);
          next[tk] = { loading: false, series: null, error: String(err) };
          return next;
        });
      });
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

/* Drop a ticker's cached series — call after a manual upload that
   refreshes the history so the next render fetches fresh. */
export function invalidatePriceHistory(ticker) {
  cache.delete((ticker || "").toUpperCase());
}

/* Drop everything (used by import-all reset paths). */
export function invalidateAllPriceHistory() {
  cache.clear();
}
