/* PM Meeting Memo generator.
 *
 * Builds the post-IC compliance-email text from recent activity:
 *   - Trading Agenda      = portWeightHistory entries flagged isAgenda
 *                           (decisions made at this meeting, not yet
 *                           executed). Stock-centric format.
 *   - Allocation Changes  = portWeightHistory entries from the last 6
 *                           calendar days that are NOT flagged agenda
 *                           (already executed). Portfolio-centric format.
 *   - FV Target Changes   = tpHistory entries with source==="approval"
 *                           from the last 6 calendar days.
 *                           Portfolio-grouped.
 *
 * Two meeting profiles:
 *   tuesday — FIN, IN, FGL, GL — "Multi Cap Strategies"
 *   thursday — EM, SC — "EM ADR, International Small Cap"
 *
 * Section headers (Trading Agenda / Allocation Changes / FV Target
 * Changes) are styled with the Unicode combining low-line (U+0332) so
 * that when the memo is pasted into Outlook / Gmail the headers appear
 * underlined without us needing rich-text clipboard support.
 *
 * Ticker selection: for each (company, portfolio) we pick whichever of
 * the company's tickers actually has rep shares > 0 in that portfolio
 * (the "held" ticker). Falls back to the ordinary ticker when no shares
 * are recorded — covers brand-new agenda entries where a target weight
 * exists but no shares have been bought yet.
 */

import { parseDate, todayStr, repShares, ccyPrefix } from './index.js';

/* Memo-style port labels. These are the abbreviations the IC uses in
 * compliance emails — distinct from the internal storage codes. */
const PORT_MEMO_LABELS = {
  FIN: "FOC",
  IN:  "INTL",
  FGL: "FGL",
  GL:  "GL",
  EM:  "EM ADR",
  SC:  "INSC",
};

const PROFILES = {
  tuesday: {
    header: "*** Multi Cap Strategies: Focused International, International, Focused Global, and Global ***",
    ports: ["FIN", "IN", "FGL", "GL"],
  },
  wednesday: {
    /* Free-form notes meeting. No auto-built memo from portfolio
       data; the user writes whatever they want in an open textarea
       and saves it to memoLog. The Memo tab swaps its rendered
       auto-memo for the free-form composer when profile === 'wednesday'.
       ports: [] tells the rest of the code there are no per-port
       agenda items to derive — Agenda tab gracefully shows empty. */
    header: "*** Wednesday Notes ***",
    ports: [],
    freeform: true,
  },
  thursday: {
    header: "*** EM ADR, International Small Cap***",
    ports: ["EM", "SC"],
  },
};

/* Days back to consider as "recent" — user wanted 6 calendar days. */
const RECENT_DAYS = 6;

function isRecent(dateStr) {
  if (!dateStr) return false;
  const d = parseDate(dateStr);
  if (!d) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return d.getTime() >= cutoff.getTime();
}

/* Format a number with 1 or 2 decimals — trimmed of trailing zeros so
 * "2.0" stays "2.0" but "2.25" stays "2.25". */
function fmtWeight(n) {
  if (n === null || n === undefined || !isFinite(n)) return "";
  // If it's a whole-tenths value, 1 decimal; else use 2.
  return Math.abs(n * 10 - Math.round(n * 10)) < 0.05
    ? n.toFixed(1)
    : n.toFixed(2);
}

/* Attach U+0332 (combining low line) to each character so the text
 * renders as underlined when pasted into an email client. Spaces get
 * the mark too so the underline is unbroken. */
function underline(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    out += s.charAt(i) + "̲";
  }
  return out;
}

/* "M/D - PM Meeting" using today's local date. No zero-pad to match the
 * user's intent (5/21, not 05/21). Re-evaluated on each memo build so
 * generating tomorrow updates the header without code changes. */
function dateHeader() {
  const d = new Date();
  return (d.getMonth() + 1) + "/" + d.getDate() + " - PM Meeting";
}

/* Pick the ticker actually held in a given portfolio. Walks the
 * company's tickers, returns the first one with rep shares > 0 in
 * repData[port]. Falls back to ordinary, then first ticker, then "?". */
export function pickHeldTicker(company, port, repData) {
  const ts = (company && company.tickers) || [];
  const portRep = (repData || {})[port] || {};
  for (let i = 0; i < ts.length; i++) {
    const tk = (ts[i] && ts[i].ticker || "").toUpperCase();
    if (!tk) continue;
    if (repShares(portRep[tk]) > 0) return ts[i].ticker;
  }
  const ord = ts.find(function (t) { return t && t.isOrdinary; });
  return (ord && ord.ticker) || (ts[0] && ts[0].ticker) || (company && company.ticker) || "?";
}

/* Stock-centric Trading Agenda formatter.
 *   entries: [{company, port, oldW, newW, action}, ...] for ONE company
 *   repData: portfolio rep-share data, used to pick the held ticker.
 *
 * Output is one or more lines. Splits happen when:
 *   - Different action verbs across portfolios (Buy in FOC + Pare in INTL)
 *   - Same action but different held tickers across portfolios (rare —
 *     e.g. ords in one port, ADR in another). We split here so the
 *     memo accurately names what was traded where.
 *
 * Format per line:
 *   "TICKER (Name) – Buy W.W% (FOC), X.X% (FGL)"
 *   "TICKER (Name) – Sell (FOC, GL)"      (no weights, closing)
 *   "TICKER (Name) – Adjust to W.W% (..)" (fallback when no action stamped)
 */
function formatAgendaLines(company, entries, repData) {
  /* Group by (heldTicker, action). */
  const byKey = {};
  entries.forEach(function (e) {
    const tk = pickHeldTicker(company, e.port, repData);
    const act = e.action || "_derive";
    const key = tk + "|" + act;
    if (!byKey[key]) byKey[key] = { ticker: tk, action: act, group: [] };
    byKey[key].group.push(e);
  });
  const lines = [];
  /* Stable ordering: action precedence, then ticker alpha. */
  const actionOrder = { Buy: 0, Add: 1, Pare: 2, Sell: 3, _derive: 4 };
  const keys = Object.keys(byKey).sort(function (a, b) {
    const A = byKey[a], B = byKey[b];
    let oa = actionOrder[A.action]; if (oa === undefined) oa = 5;
    let ob = actionOrder[B.action]; if (ob === undefined) ob = 5;
    if (oa !== ob) return oa - ob;
    return A.ticker.localeCompare(B.ticker);
  });
  keys.forEach(function (key) {
    const slot = byKey[key];
    const ticker = slot.ticker;
    const action = slot.action;
    const group = slot.group;
    if (action === "Sell") {
      const ports = group.map(function (e) { return PORT_MEMO_LABELS[e.port] || e.port; }).join(", ");
      /* "Sell All" instead of "Sell" — makes the intent explicit on
         the compliance memo (full exit, not a trim). */
      lines.push(ticker + " (" + (company.name || "?") + ") – Sell All (" + ports + ")");
      return;
    }
    let verb;
    if (action === "_derive") {
      const allBuys  = group.every(function (e) { return e.newW > e.oldW; });
      const allPares = group.every(function (e) { return e.newW < e.oldW; });
      verb = allBuys ? "Buy" : allPares ? "Pare to" : "Adjust to";
    } else if (action === "Pare") {
      verb = "Pare to";
    } else if (action === "Add") {
      verb = "Add to";
    } else if (action === "Buy") {
      verb = "Buy to";
    } else {
      verb = action;
    }
    const portsText = group
      .map(function (e) { return fmtWeight(e.newW) + "% (" + (PORT_MEMO_LABELS[e.port] || e.port) + ")"; })
      .join(", ");
    lines.push(ticker + " (" + (company.name || "?") + ") – " + verb + " " + portsText);
  });
  return lines;
}

/* Portfolio-centric formatter shared by Allocation Changes and FV Target
 * Changes. Each item: "TICKER (Name) <value>" where the value is
 * provided by the caller (weight % for Allocation, $price for FV Target). */
function formatPortfolioSection(byPort, ports, repData, formatValue) {
  return ports.map(function (p) {
    const items = byPort[p] || [];
    const text = items.map(function (it) {
      const tk = pickHeldTicker(it.company, p, repData);
      return tk + " (" + (it.company.name || "?") + ") " + formatValue(it);
    }).join(", ");
    return (PORT_MEMO_LABELS[p] || p) + " – " + text;
  }).join("\n");
}

/* FV Target Changes — TP changes from tpHistory in last 6 days where
 * source === "approval".
 *
 * Two formatting modes:
 *   - consolidated=true  (Multi Cap meeting): one flat list. A single
 *     TP change applies to every portfolio the company is in, so
 *     breaking out by portfolio just creates 4 duplicates of every
 *     row. Show each approved TP once. The held-ticker used for
 *     display is picked from whichever profile port actually holds
 *     the position; falls back to any if multiple do.
 *   - consolidated=false (EM+SC meeting): per-port grouping kept,
 *     because EM and SC do hold different ticker variants of the
 *     same name and the breakout disambiguates which sleeve was
 *     repriced.
 */
function buildFvUpdates(companies, ports, repData, consolidated) {
  if (consolidated) {
    var rows = [];
    var seen = {};
    (companies || []).forEach(function (c) {
      (c.tpHistory || []).forEach(function (h) {
        if (h.source !== "approval") return;
        if (!isRecent(h.date)) return;
        if (!(c.portfolios || []).some(function (p) { return ports.indexOf(p) >= 0; })) return;
        if (seen[c.id]) return; /* one TP per company even with multi approvals */
        seen[c.id] = true;
        var tpStr = h.tp != null && isFinite(h.tp) ? Number(h.tp).toFixed(2) : "";
        /* Pick held ticker from any profile port that holds it. */
        var heldTicker = null;
        for (var i = 0; i < ports.length; i++) {
          var p = ports[i];
          if ((c.portfolios || []).indexOf(p) < 0) continue;
          var tk = pickHeldTicker(c, p, repData);
          if (tk) { heldTicker = tk; break; }
        }
        if (!heldTicker) heldTicker = c.ticker || "?";
        /* Use the tpHistory entry's stored currency (set by
           applyApprovalToCompany at approval time); fall back to the
           company's valuation currency, then USD. Avoids the prior
           hardcoded "$" prefix that misreported every non-USD name. */
        var pfx = ccyPrefix(h.currency || (c.valuation && c.valuation.currency) || "USD");
        rows.push(heldTicker + " (" + (c.name || "?") + ") " + pfx + tpStr);
      });
    });
    return rows.join(", ");
  }
  const byPort = {};
  ports.forEach(function (p) { byPort[p] = []; });
  /* One row per (company, port) — keep the freshest recent approval.
     Without this dedup, re-approving the same name during a meeting
     (or two separate pending records each getting approved) lands
     N copies of the same ticker on the FV Target Changes list. */
  (companies || []).forEach(function (c) {
    var freshest = null;
    (c.tpHistory || []).forEach(function (h) {
      if (h.source !== "approval") return;
      if (!isRecent(h.date)) return;
      if (!freshest || (h.date || "") > (freshest.date || "")) freshest = h;
    });
    if (!freshest) return;
    const tpStr = freshest.tp != null && isFinite(freshest.tp) ? Number(freshest.tp).toFixed(2) : "";
    const pfx = ccyPrefix(freshest.currency || (c.valuation && c.valuation.currency) || "USD");
    (c.portfolios || []).forEach(function (p) {
      if (ports.indexOf(p) < 0) return;
      byPort[p].push({ company: c, newTp: tpStr, pfx: pfx });
    });
  });
  return formatPortfolioSection(byPort, ports, repData, function (it) {
    return (it.pfx || "$") + it.newTp;
  });
}

/* Walk every company's portWeightHistory and partition entries by
 * agenda-vs-executed and recency. Returns:
 *   { agendaByCo: Map<company.id, [entries]>, executedByPort: { port: [entries] } }
 */
function partitionWeightChanges(companies, ports) {
  /* Two routing decisions per portWeightHistory entry:
       - If entry has an action (B/A/P/S) AND isAgenda:true → Trading
         Agenda. These are actual trade proposals that need execution.
       - Else (no action, just a weight change) → Allocation Changes.
         Includes both isAgenda:true (proposed) and !isAgenda (committed
         within the recent window). Target-% changes are routed here
         regardless of commit state because they don't represent a trade
         action — they're a target reallocation, which the compliance
         section calls "Allocation Changes."
     This routing fixes the user's reported bug where proposing a target
     change on TSM showed up in Trading Agenda (no trade!) and was
     missing from Allocation Changes until lock-in. */
  const agendaByCo = {};
  const allocByPort = {};
  ports.forEach(function (p) { allocByPort[p] = []; });
  (companies || []).forEach(function (c) {
    /* Index target proposals by port so action stamps can borrow the
       latest proposed newWeight for their display. Without this, a
       Buy stamp recorded before the user typed the target % keeps
       newWeight=0 ("Buy 0.0%") even though a 2% proposal exists. */
    var targetProposalByPort = {};
    (c.portWeightHistory || []).forEach(function (h) {
      if (!h || !h.isAgenda || h.action) return;
      if (h.newWeight === undefined || h.newWeight === null) return;
      /* Newest wins — they're prepended, so first hit per port is the
         freshest proposal. */
      if (targetProposalByPort[h.portfolio] === undefined) {
        var nw = parseFloat(h.newWeight);
        if (isFinite(nw)) targetProposalByPort[h.portfolio] = nw;
      }
    });
    (c.portWeightHistory || []).forEach(function (h) {
      if (ports.indexOf(h.portfolio) < 0) return;
      const hasAction = !!h.action;
      if (hasAction && h.isAgenda) {
        /* Override the stamp's stored newWeight with the target
           proposal value if one is pending on the same port — the
           proposal is the live source of truth for "what target are
           we Buying/Paring to". Sell is unaffected (it always goes
           to 0). */
        var effectiveNewW = h.newWeight;
        if (h.action !== "Sell" && targetProposalByPort[h.portfolio] !== undefined) {
          effectiveNewW = targetProposalByPort[h.portfolio];
        }
        (agendaByCo[c.id] = agendaByCo[c.id] || []).push({
          company: c, port: h.portfolio,
          oldW: h.oldWeight, newW: effectiveNewW,
          action: h.action,
        });
        /* An action stamp whose newWeight differs from the committed
           target also represents a target reallocation — Sell goes to
           0, "Pare to new target" lowers the target, etc. File those
           under Allocation Changes too so the IC memo lists the
           weight transition alongside the trade action. Tolerance
           0.05 ppt to skip rounding noise. Without this, a name that
           gets a Sell/Pare stamp during IC is missing from
           Allocation Changes — surfaced after the user noticed Star
           Bulk + Russel Metals (Pare/Sell) were absent while
           Equinox (target-only change) showed correctly. */
        var committedRaw = (c.portWeights || {})[h.portfolio];
        var committedNum = parseFloat(committedRaw);
        var oldForAlloc = isFinite(committedNum) ? committedNum : (parseFloat(h.oldWeight) || 0);
        var newForAlloc = parseFloat(h.newWeight);
        if (isFinite(newForAlloc) && Math.abs(newForAlloc - oldForAlloc) > 0.05) {
          allocByPort[h.portfolio].push({
            company: c,
            oldW: oldForAlloc,
            newW: newForAlloc,
            date: h.date,
          });
        }
      } else if (!hasAction && h.isAgenda) {
        /* Target-% change — PENDING (isAgenda:true) only. The 6-day
           recent-committed window was dropped per user request: once
           an entry is locked in or marked executed (both flip
           isAgenda:false), it vanishes from the memo immediately, so
           it doesn't linger into next week's meeting.
           oldW source: live portWeights[port]. The entry's stored
           h.oldWeight can be stale if portWeights was edited directly
           after the proposal landed. */
        var committed = (c.portWeights || {})[h.portfolio];
        var committedNum2 = parseFloat(committed);
        var oldW = isFinite(committedNum2) ? committedNum2 : 0;
        /* Skip no-op target proposals (committed already equals
           proposed target). Surfaces when a target was committed and
           a stale matching proposal remains, or when a Pare/Add stamp
           lives alongside a target proposal at the same weight.
           Otherwise we'd render "2.0% → 2.0%" in Allocation Changes,
           which is meaningless. */
        var newNum2 = parseFloat(h.newWeight);
        if (isFinite(newNum2) && Math.abs(newNum2 - oldW) <= 0.05) return;
        allocByPort[h.portfolio].push({
          company: c,
          oldW: oldW,
          newW: h.newWeight,
          date: h.date,
        });
      }
    });
  });
  /* Trading Agenda: collapse duplicates per (company, port) keeping latest. */
  Object.keys(agendaByCo).forEach(function (cid) {
    const seen = {};
    const kept = [];
    agendaByCo[cid].forEach(function (e) {
      if (seen[e.port]) return;
      seen[e.port] = true;
      kept.push(e);
    });
    agendaByCo[cid] = kept;
  });
  /* Allocation Changes: dedupe per (company, port) — keep latest. */
  Object.keys(allocByPort).forEach(function (p) {
    const seen = {};
    const kept = [];
    allocByPort[p].forEach(function (e) {
      const k = e.company.id;
      if (seen[k]) return;
      seen[k] = true;
      kept.push(e);
    });
    allocByPort[p] = kept;
  });
  return { agendaByCo: agendaByCo, executedByPort: allocByPort };
}

/* Top-level: build the memo string for a given profile.
 *   companies   — full company array
 *   profileName — "tuesday" | "thursday"
 *   repData     — { port: { TICKER: {shares, ...} } } so we can pick
 *                 the actually-held ticker per portfolio. Optional;
 *                 when omitted we fall back to the ordinary ticker. */
export function buildMeetingMemo(companies, profileName, repData) {
  const profile = PROFILES[profileName];
  if (!profile) return "";
  const part = partitionWeightChanges(companies, profile.ports);
  const agendaByCo = part.agendaByCo;
  const executedByPort = part.executedByPort;

  /* Trading Agenda — ordered by the company's primary port in
     profile.ports order (Thursday: EM before SC, Tuesday: FIN before
     IN/FGL/GL). Within a primary-port bucket, ties broken by company
     name. Replaces the prior alphabetic sort which interleaved sleeves. */
  const agendaLines = [];
  function primaryPortIdx(entries) {
    var best = -1;
    for (var i = 0; i < entries.length; i++) {
      var idx = profile.ports.indexOf(entries[i].port);
      if (idx >= 0 && (best < 0 || idx < best)) best = idx;
    }
    return best < 0 ? 999 : best;
  }
  const sortedCids = Object.keys(agendaByCo).sort(function (a, b) {
    var ap = primaryPortIdx(agendaByCo[a]);
    var bp = primaryPortIdx(agendaByCo[b]);
    if (ap !== bp) return ap - bp;
    var aName = (agendaByCo[a][0].company.name || "");
    var bName = (agendaByCo[b][0].company.name || "");
    return aName.localeCompare(bName);
  });
  sortedCids.forEach(function (cid) {
    const entries = agendaByCo[cid];
    if (!entries.length) return;
    const company = entries[0].company;
    formatAgendaLines(company, entries, repData).forEach(function (l) { agendaLines.push(l); });
  });

  /* Allocation Changes — target-% changes (proposed + recently
     committed). partitionWeightChanges already populated the entries
     with company / oldW / newW / date / isProposed; just pass them
     through. The previous map() reconstructed the entries and dropped
     oldW / isProposed, which is exactly why "0.0% → 5.5%" was
     surviving despite the fallback logic upstream. */
  const allocByPort = {};
  profile.ports.forEach(function (p) {
    allocByPort[p] = (executedByPort[p] || []).slice();
  });
  const allocLines = formatPortfolioSection(allocByPort, profile.ports, repData, function (it) {
    /* "X% → Y%" with old + new. Every row here is implicitly a
       pending proposal (the 6-day committed window was dropped) so
       we no longer tag with "(proposed)" — keeps lines clean. */
    var oldN = parseFloat(it.oldW);
    var from = isFinite(oldN) ? fmtWeight(oldN) + "%" : "0.0%";
    var to = fmtWeight(it.newW) + "%";
    return from + " → " + to;
  });

  /* FV Target Changes — TP approvals in the last 6 days. Consolidate
     into a flat list for Tuesday (Multi Cap) where a single TP applies
     across FIN/IN/FGL/GL and per-port breakout was just creating
     duplicates. Thursday (EM+SC) keeps per-port grouping because the
     sleeves often hold different ticker variants. */
  const fvLines = buildFvUpdates(companies, profile.ports, repData, profileName === "tuesday");

  const out = [];
  out.push(dateHeader());
  out.push("");
  out.push(profile.header);
  out.push("");
  out.push(underline("Trading Agenda"));
  if (agendaLines.length) {
    agendaLines.forEach(function (l) { out.push(l); });
  } else {
    out.push("(none)");
  }
  out.push("");
  out.push(underline("Allocation Changes"));
  out.push(allocLines);
  out.push("");
  out.push(underline("FV Target Changes"));
  out.push(fvLines);
  out.push("");
  out.push("Generated " + todayStr());
  return out.join("\n");
}

/* Helper for the UI: after the memo is sent, the user can call this to
 * mark every agenda entry (for the given ports) as executed so it falls
 * out of the Trading Agenda section and into the Allocation Changes
 * section on the next memo. Returns a new companies array — caller
 * passes to setCompanies. */
export function clearAgendaFlags(companies, ports) {
  const portSet = {};
  (ports || []).forEach(function (p) { portSet[p] = true; });
  return (companies || []).map(function (c) {
    const hist = c.portWeightHistory || [];
    let touched = false;
    const next = hist.map(function (h) {
      if (h.isAgenda && portSet[h.portfolio]) {
        touched = true;
        return Object.assign({}, h, { isAgenda: false });
      }
      return h;
    });
    if (!touched) return c;
    return Object.assign({}, c, { portWeightHistory: next });
  });
}

export const MEETING_PROFILES = PROFILES;
