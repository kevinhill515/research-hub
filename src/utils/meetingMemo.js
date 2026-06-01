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

import { parseDate, todayStr, repShares } from './index.js';

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
    } else {
      verb = action; /* "Buy" */
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
 * source === "approval" (i.e. they went through the approval workflow,
 * not other auto-write paths). Grouped per portfolio: a single TP change
 * is in effect for every portfolio the company belongs to. */
function buildFvUpdates(companies, ports, repData) {
  const byPort = {};
  ports.forEach(function (p) { byPort[p] = []; });
  (companies || []).forEach(function (c) {
    (c.tpHistory || []).forEach(function (h) {
      if (h.source !== "approval") return;
      if (!isRecent(h.date)) return;
      const tpStr = h.tp != null && isFinite(h.tp) ? Number(h.tp).toFixed(2) : "";
      (c.portfolios || []).forEach(function (p) {
        if (ports.indexOf(p) < 0) return;
        byPort[p].push({ company: c, newTp: tpStr });
      });
    });
  });
  return formatPortfolioSection(byPort, ports, repData, function (it) {
    return "$" + it.newTp;
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
    (c.portWeightHistory || []).forEach(function (h) {
      if (ports.indexOf(h.portfolio) < 0) return;
      const hasAction = !!h.action;
      if (hasAction && h.isAgenda) {
        (agendaByCo[c.id] = agendaByCo[c.id] || []).push({
          company: c, port: h.portfolio,
          oldW: h.oldWeight, newW: h.newWeight,
          action: h.action,
        });
      } else if (!hasAction && (h.isAgenda || isRecent(h.date))) {
        /* Target-% change — proposed or recently committed.
           oldW resolution:
             - PROPOSED (isAgenda:true): ALWAYS use the company's
               current portWeights[port]. That IS the live pre-proposal
               value. The entry's stored h.oldWeight is a snapshot
               from proposal time and can go stale if portWeights was
               edited directly between then and now (which is exactly
               the user's TSM-in-FOC case: entry stored oldWeight=0
               from when FOC had no target, but portWeights.FOC was
               later set to 5.0 directly).
             - COMMITTED (!isAgenda): prefer h.oldWeight when present
               (it's the snapshot at the commit moment). If missing,
               walk this company's older portWeightHistory entries on
               the same port for any entry with a numeric newWeight
               and use that as the prior value. portWeights can't help
               here because it's already moved to this entry's value.
             - Last resort: 0 (treat as from-nothing). */
        var oldW;
        if (h.isAgenda) {
          var committed = (c.portWeights || {})[h.portfolio];
          var committedNum = parseFloat(committed);
          oldW = isFinite(committedNum) ? committedNum : 0;
        } else {
          oldW = h.oldWeight;
          if (oldW === undefined || oldW === null || oldW === "") {
            var hist = (c.portWeightHistory || []).slice();
            hist.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
            var prior = null;
            for (var hi = 0; hi < hist.length; hi++) {
              var hh = hist[hi];
              if (!hh || hh.portfolio !== h.portfolio) continue;
              if (hh === h) continue;
              if ((hh.date || "") >= (h.date || "")) continue; /* must be older */
              var hhW = parseFloat(hh.newWeight);
              if (isFinite(hhW)) { prior = hhW; break; }
            }
            oldW = prior != null ? prior : 0;
          }
        }
        allocByPort[h.portfolio].push({
          company: c,
          oldW: oldW,
          newW: h.newWeight,
          date: h.date,
          isProposed: !!h.isAgenda,
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

  /* Trading Agenda. */
  const agendaLines = [];
  Object.keys(agendaByCo).forEach(function (cid) {
    const entries = agendaByCo[cid];
    if (!entries.length) return;
    const company = entries[0].company;
    formatAgendaLines(company, entries, repData).forEach(function (l) { agendaLines.push(l); });
  });
  agendaLines.sort();

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
    /* "X% → Y%" with old + new. partitionWeightChanges' fallback ladder
       already makes sure it.oldW is a number (0 worst case), so this
       formatter should never need to render "—". Belt + suspenders:
       still guard against undefined/non-finite. */
    var oldN = parseFloat(it.oldW);
    var from = isFinite(oldN) ? fmtWeight(oldN) + "%" : "0.0%";
    var to = fmtWeight(it.newW) + "%";
    return from + " → " + to + (it.isProposed ? " (proposed)" : "");
  });

  /* FV Target Changes — TP approvals in the last 6 days. */
  const fvLines = buildFvUpdates(companies, profile.ports, repData);

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
