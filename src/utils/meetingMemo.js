/* PM Meeting Memo generator.
 *
 * Builds the post-IC compliance-email text from recent activity:
 *   - Trading Agenda      = portWeightHistory entries flagged isAgenda
 *                           (decisions made at this meeting, not yet
 *                           executed). Stock-centric format.
 *   - Allocation Changes  = portWeightHistory entries from the last 6
 *                           calendar days that are NOT flagged agenda
 *                           (already executed). Portfolio-centric format.
 *   - FV Target Updates   = tpHistory entries with source==="approval"
 *                           from the last 6 calendar days.
 *                           Portfolio-grouped.
 *
 * Two meeting profiles:
 *   tuesday — FIN, IN, FGL, GL — "Multi Cap Strategies"
 *   thursday — EM, SC — "EM ADR, International Small Cap"
 */

import { parseDate, todayStr } from './index.js';

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

/* Stock-centric Trading Agenda formatter.
 *   Input: [{company, port, oldW, newW, action}, ...]
 *   Output: "TICKER (Name) – Action W.W% (PORT1), W.W% (PORT2)"
 * Action priority:
 *   1. Explicit action stamped by markTradeAgenda (B/A/P/S buttons) —
 *      use that verb. "Sell" alone (no per-port weight) prints as
 *      "TICKER (Name) – Sell".
 *   2. Fallback: derive from each port's old→new direction. All new>old
 *      → Buy; all new<old → Pare to; mixed → Adjust to.
 */
function formatAgendaLine(company, entries) {
  const ticker = pickDisplayTicker(company);
  // Pick a single representative action — they should all match for a
  // single agenda stamp; if mixed (e.g. user stamped Buy then later
  // Pare), prefer the most recent (first in array since history is
  // prepended).
  const stampedAction = entries.find(e => e.action)?.action || null;
  if (stampedAction === "Sell") {
    // Sell prints without weights — closing the position entirely.
    const ports = entries.map(e => PORT_MEMO_LABELS[e.port] || e.port).join(", ");
    return ticker + " (" + (company.name || "?") + ") – Sell (" + ports + ")";
  }
  let verb;
  if (stampedAction) {
    verb = stampedAction === "Pare" ? "Pare to" : stampedAction; // "Buy" / "Add"
  } else {
    const allBuys  = entries.every(e => e.newW > e.oldW);
    const allPares = entries.every(e => e.newW < e.oldW);
    verb = allBuys ? "Buy" : allPares ? "Pare to" : "Adjust to";
  }
  const portsText = entries
    .map(e => fmtWeight(e.newW) + "% (" + (PORT_MEMO_LABELS[e.port] || e.port) + ")")
    .join(", ");
  return ticker + " (" + (company.name || "?") + ") – " + verb + " " + portsText;
}

/* Picks the most-natural ticker for memo display. Prefers the ord
 * ticker when present; otherwise falls back to whatever ticker is
 * first on the company. */
function pickDisplayTicker(company) {
  const ts = (company && company.tickers) || [];
  const ord = ts.find(t => t && t.isOrdinary);
  return (ord && ord.ticker) || (ts[0] && ts[0].ticker) || (company && company.ticker) || "?";
}

/* Portfolio-centric Allocation/Target Changes formatter.
 *   Input: { port: [{company, newW}, ...] }
 *   Output: lines of "PORT – Stock1 W.W%, Stock2 W.W%"
 * Ports with no entries are still emitted (e.g. "EM – ") so the format
 * mirrors what the user sends to compliance. */
function formatAllocSection(byPort, ports) {
  return ports.map(p => {
    const items = byPort[p] || [];
    const text = items
      .map(it => (it.company.name || "?") + " " + fmtWeight(it.newW) + "%")
      .join(", ");
    return (PORT_MEMO_LABELS[p] || p) + " – " + text;
  }).join("\n");
}

/* FV Target Updates — TP changes from tpHistory in last 6 days where
 * source === "approval" (i.e. they went through the approval workflow,
 * not other auto-write paths). Grouped per portfolio: a single TP
 * change is in effect for every portfolio the company belongs to. */
function buildFvUpdates(companies, ports) {
  const byPort = {};
  ports.forEach(p => { byPort[p] = []; });
  (companies || []).forEach(c => {
    (c.tpHistory || []).forEach(h => {
      if (h.source !== "approval") return;
      if (!isRecent(h.date)) return;
      const tpStr = h.tp != null && isFinite(h.tp) ? Number(h.tp).toFixed(2) : "";
      (c.portfolios || []).forEach(p => {
        if (ports.indexOf(p) < 0) return;
        byPort[p].push({ company: c, newTp: tpStr });
      });
    });
  });
  return ports.map(p => {
    const items = byPort[p];
    if (!items.length) return (PORT_MEMO_LABELS[p] || p) + " – ";
    const text = items.map(it => (it.company.name || "?") + " " + it.newTp).join(", ");
    return (PORT_MEMO_LABELS[p] || p) + " – " + text;
  }).join("\n");
}

/* Walk every company's portWeightHistory and partition entries by
 * agenda-vs-executed and recency. Returns:
 *   { agenda: Map<company.id, [entries]>, executed: { port: [entries] } }
 *
 * - agenda: any entry with isAgenda===true for a port in the meeting's
 *   profile, regardless of date (a forgotten agenda from 3 weeks ago
 *   should still show up rather than silently drop).
 * - executed: entries where isAgenda is false/missing AND date is
 *   within RECENT_DAYS, grouped by port. These are the
 *   already-executed weight changes for the "Allocation/Target
 *   Changes" section.
 */
function partitionWeightChanges(companies, ports) {
  const agendaByCo = {};   // company.id -> [{company, port, oldW, newW}, ...]
  const executedByPort = {}; // port -> [{company, newW, date}, ...]
  ports.forEach(p => { executedByPort[p] = []; });
  (companies || []).forEach(c => {
    (c.portWeightHistory || []).forEach(h => {
      if (ports.indexOf(h.portfolio) < 0) return;
      if (h.isAgenda) {
        (agendaByCo[c.id] = agendaByCo[c.id] || []).push({
          company: c, port: h.portfolio,
          oldW: h.oldWeight, newW: h.newWeight,
          action: h.action || null,
        });
      } else if (isRecent(h.date)) {
        executedByPort[h.portfolio].push({
          company: c, newW: h.newWeight, date: h.date,
        });
      }
    });
  });
  // For agenda: collapse duplicates per (company, port) keeping the
  // latest entry. Without this, multiple weight tweaks on the same
  // stock during the meeting would all show up.
  Object.keys(agendaByCo).forEach(cid => {
    const seen = {};
    const list = agendaByCo[cid];
    // Walk in reverse (history is prepended; index 0 is newest) and
    // keep the first occurrence per port.
    const kept = [];
    list.forEach(e => {
      if (seen[e.port]) return;
      seen[e.port] = true;
      kept.push(e);
    });
    agendaByCo[cid] = kept;
  });
  // For executed: dedupe per (company, port) similarly — keep latest.
  Object.keys(executedByPort).forEach(p => {
    const seen = {};
    const kept = [];
    executedByPort[p].forEach(e => {
      const k = e.company.id;
      if (seen[k]) return;
      seen[k] = true;
      kept.push(e);
    });
    executedByPort[p] = kept;
  });
  return { agendaByCo, executedByPort };
}

/* Top-level: build the memo string for a given profile. */
export function buildMeetingMemo(companies, profileName) {
  const profile = PROFILES[profileName];
  if (!profile) return "";
  const { agendaByCo, executedByPort } = partitionWeightChanges(companies, profile.ports);

  // Trading Agenda — one line per company.
  const agendaLines = [];
  Object.keys(agendaByCo).forEach(cid => {
    const entries = agendaByCo[cid];
    if (!entries.length) return;
    const company = entries[0].company;
    agendaLines.push(formatAgendaLine(company, entries));
  });
  // Sort agenda by company name for stable output.
  agendaLines.sort();

  // Allocation/Target Changes — port-centric.
  const allocByPort = {};
  profile.ports.forEach(p => {
    allocByPort[p] = (executedByPort[p] || []).map(e => ({
      company: e.company, newW: e.newW,
    }));
  });
  const allocLines = formatAllocSection(allocByPort, profile.ports);

  // FV Target Updates — port-centric, from tpHistory.
  const fvLines = buildFvUpdates(companies, profile.ports);

  const out = [];
  out.push(profile.header);
  out.push("");
  out.push("Trading Agenda");
  if (agendaLines.length) {
    agendaLines.forEach(l => out.push(l));
  } else {
    out.push("(none)");
  }
  out.push("");
  out.push("Allocation/FV Target Changes");
  out.push(allocLines);
  out.push("");
  out.push("FV Target Updates");
  out.push(fvLines);
  out.push("");
  out.push("Generated " + todayStr());
  return out.join("\n");
}

/* Helper for the UI: after the memo is sent, the user can call this to
 * mark every agenda entry (for the given ports) as executed so it falls
 * out of the Trading Agenda section and into the Target Changes section
 * on the next memo. Returns a new companies array — caller passes to
 * setCompanies. */
export function clearAgendaFlags(companies, ports) {
  const portSet = {};
  (ports || []).forEach(p => { portSet[p] = true; });
  return (companies || []).map(c => {
    const hist = c.portWeightHistory || [];
    let touched = false;
    const next = hist.map(h => {
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
