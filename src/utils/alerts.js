/* Threshold-based alerts engine.
 *
 * Pure function: takes the current state (companies + marketsSnapshot
 * + active rules) and returns the list of alerts that fire. No side
 * effects — UI components consume the result and render. Rules are
 * stored in Supabase under meta.alertRules so settings persist across
 * sessions / users.
 *
 * Rule shape:
 *   {
 *     id: "price-1d",            // stable rule id
 *     enabled: true,
 *     params: { threshold: 0.05 }
 *   }
 *
 * Alert shape:
 *   {
 *     companyId: string,
 *     ruleId: string,
 *     severity: "warn" | "info",
 *     message: string,           // short headline shown in the panel
 *     context: string | null,    // optional sub-line (e.g. ticker, value)
 *   }
 *
 * Designed so new rule types can be added by extending the RULE_DEFS
 * map below without touching consumers.
 */

import { isFiniteNum } from "./numbers.js";
import { parseDate } from "./index.js";
import { getDataStatus } from "./dataStatus.js";

/* Default per-rule parameters used when meta.alertRules has no entry
 * for the rule yet. Keeps the UI working before the user customizes
 * any thresholds. */
export const DEFAULT_RULES = {
  "price-1d":           { enabled: true, params: { threshold: 0.05 } },          /* |1D return| >= 5% */
  "guidance-revised":   { enabled: true, params: { directions: ["down"] } },     /* guidance revised down on any tracked metric */
  "eps-revisions-trend":{ enabled: true, params: { months: 3, threshold: 0.02, consecutive: 2 } }, /* 2+ consecutive monthly downward revisions on FY+1, total drop >= 2% */
  "earnings-imminent":  { enabled: true, params: { withinDays: 7 } },
  "stale-data":         { enabled: false, params: {} },                          /* off by default — already shown as ⚠ on tabs */
};

/* Helper: read a window from a ticker's perf object with USD-preference
 * (the company's US ticker if present). Returns decimal or null. */
function readUsdPerf(company, key) {
  const tickers = (company && company.tickers) || [];
  const ord = tickers.find(function (t) { return t.isOrdinary; });
  const us = tickers.find(function (t) { return (t.currency || "").toUpperCase() === "USD" && !t.isOrdinary; })
          || (ord && (ord.currency || "").toUpperCase() === "USD" ? ord : null);
  const src = us || ord;
  if (!src) return null;
  const p = src.perf || {};
  if (isFiniteNum(p[key])) return p[key];
  if (key === "1D" && isFiniteNum(p.TODAY)) return p.TODAY;
  return null;
}

/* ----------------------------- Rule evaluators ----------------------------- */

/* Stock moved ≥ threshold on the day. */
function evalPrice1D(company, params) {
  const t = (params && params.threshold) || 0.05;
  const v = readUsdPerf(company, "1D");
  if (!isFiniteNum(v) || Math.abs(v) < t) return null;
  const dir = v >= 0 ? "up" : "down";
  return {
    severity: "warn",
    message: "Moved " + (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "% today",
    context: dir === "up" ? "above" : "below",
  };
}

/* Guidance revised in the configured direction(s) on any tracked
 * metric since the prior announcement. Looks at the most recent two
 * dates within the upcoming/just-closed FY group per metric. */
function evalGuidanceRevised(company, params) {
  const dirs = (params && params.directions) || ["down"];
  const history = company && company.guidance && company.guidance.history;
  if (!history || history.length === 0) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  /* Find the active period: prefer next-future, else most-recent-closed
     within a year, mirroring PreEarningsBrief logic. */
  let upcoming = null, closed = null;
  const staleMs = Date.now() - 365 * 24 * 3600 * 1000;
  history.forEach(function (r) {
    if (!r.period) return;
    if (r.period >= todayStr) {
      if (!upcoming || r.period < upcoming) upcoming = r.period;
    } else {
      const d = parseDate(r.period);
      if (!d || d.getTime() < staleMs) return;
      if (!closed || r.period > closed) closed = r.period;
    }
  });
  const period = upcoming || closed;
  if (!period) return null;

  const byMetric = {};
  history.forEach(function (r) { if (r.period === period) (byMetric[r.item] = byMetric[r.item] || []).push(r); });
  const flagged = [];
  Object.keys(byMetric).forEach(function (m) {
    const arr = byMetric[m].slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });
    if (arr.length < 2) return;
    const last = arr[arr.length - 1];
    const prev = arr[arr.length - 2];
    function mid(r) {
      if (!r) return null;
      if (isFiniteNum(r.low) && isFiniteNum(r.high)) return (r.low + r.high) / 2;
      return isFiniteNum(r.low) ? r.low : (isFiniteNum(r.high) ? r.high : null);
    }
    const lm = mid(last), pm = mid(prev);
    if (!isFiniteNum(lm) || !isFiniteNum(pm) || pm === 0) return;
    const change = (lm - pm) / Math.abs(pm);
    if (Math.abs(change) < 0.005) return;
    const dir = change > 0 ? "up" : "down";
    if (dirs.indexOf(dir) < 0) return;
    flagged.push({ metric: m, change: change, dir: dir });
  });
  if (flagged.length === 0) return null;

  /* Pick the largest absolute change for the headline. */
  flagged.sort(function (a, b) { return Math.abs(b.change) - Math.abs(a.change); });
  const top = flagged[0];
  return {
    severity: top.dir === "down" ? "warn" : "info",
    message: top.metric + " guidance revised " + top.dir + " " + (top.change >= 0 ? "+" : "") + (top.change * 100).toFixed(1) + "%",
    context: flagged.length > 1 ? (flagged.length - 1) + " other metric" + (flagged.length > 2 ? "s" : "") + " also revised" : null,
  };
}

/* EPS revisions trend: N+ consecutive monthly downward revisions for
 * FY+1, with cumulative drop >= threshold. */
function evalEpsRevisionsTrend(company, params) {
  const ths = (params && params.threshold) || 0.02;
  const need = (params && params.consecutive) || 2;
  const er = company && company.epsRevisions;
  if (!er || !er.series) return null;
  const fy1 = er.series.find(function (s) { return s.horizon === 1; });
  if (!fy1 || !fy1.monthly || fy1.monthly.length < need + 1) return null;
  const m = fy1.monthly;
  /* Walk back from the latest month; count consecutive negatives. */
  let count = 0;
  let total = 0;
  let i = m.length - 1;
  while (i > 0) {
    const cur = m[i], prev = m[i - 1];
    if (!isFiniteNum(cur) || !isFiniteNum(prev) || prev === 0) break;
    const d = (cur - prev) / Math.abs(prev);
    if (d >= 0) break;
    count++;
    total += d;
    i--;
    if (count >= need + 4) break;
  }
  if (count < need || Math.abs(total) < ths) return null;
  return {
    severity: "warn",
    message: "FY+1 EPS revised down " + count + "M in a row, total " + (total * 100).toFixed(1) + "%",
    context: null,
  };
}

/* Next earnings within N days. Reads guidance.nextReportDate first,
 * falls back to the soonest future earningsEntries.reportDate. */
function evalEarningsImminent(company, params) {
  const within = (params && params.withinDays) || 7;
  let iso = (company && company.guidance && company.guidance.nextReportDate) || null;
  if (!iso) {
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    ((company && company.earningsEntries) || []).forEach(function (e) {
      if (!e.reportDate) return;
      const d = parseDate(e.reportDate);
      if (!d || d < t0) return;
      const cur = iso ? parseDate(iso) : null;
      if (!cur || d < cur) iso = e.reportDate;
    });
  }
  if (!iso) return null;
  const d = parseDate(iso);
  if (!d) return null;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - t0.getTime()) / (24 * 3600 * 1000));
  if (days < 0 || days > within) return null;
  const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return {
    severity: "info",
    message: days === 0 ? "Reports today" : "Reports in " + days + " day" + (days === 1 ? "" : "s") + " · " + label,
    context: null,
  };
}

/* Stale data: any major data store more than one FY behind. Off by
 * default — the same info is already badged as ⚠ on individual tabs.
 * Surfaced as an alert mostly for triage views ("which 5 names need a
 * re-import?"). */
function evalStaleData(company, _params) {
  /* Defer to dataStatus.js. Only fire when at least one major source
     is stale; "none" (never imported) doesn't qualify here — that's
     a separate concern. */
  const kinds = ["financials", "ratios", "epsrev", "guidance"];
  const stale = [];
  kinds.forEach(function (k) {
    if (getDataStatus(company, k) === "stale") stale.push(k);
  });
  if (stale.length === 0) return null;
  return {
    severity: "info",
    message: stale.length + " data source" + (stale.length === 1 ? "" : "s") + " stale",
    context: stale.join(", "),
  };
}

const RULE_DEFS = {
  "price-1d":            { eval: evalPrice1D,            label: "Stock moved >= threshold on the day" },
  "guidance-revised":    { eval: evalGuidanceRevised,    label: "Guidance revised in the configured direction(s)" },
  "eps-revisions-trend": { eval: evalEpsRevisionsTrend,  label: "Consecutive monthly EPS revisions in one direction" },
  "earnings-imminent":   { eval: evalEarningsImminent,   label: "Earnings report within N days" },
  "stale-data":          { eval: evalStaleData,          label: "One or more data sources is one FY behind" },
};

/* Public: evaluate all enabled rules across all companies. */
export function evaluateAlerts(companies, rules) {
  const merged = Object.assign({}, DEFAULT_RULES);
  if (rules && typeof rules === "object") {
    Object.keys(rules).forEach(function (k) {
      merged[k] = Object.assign({}, merged[k] || {}, rules[k]);
    });
  }
  const out = [];
  (companies || []).forEach(function (c) {
    Object.keys(RULE_DEFS).forEach(function (ruleId) {
      const rule = merged[ruleId];
      if (!rule || rule.enabled === false) return;
      const result = RULE_DEFS[ruleId].eval(c, rule.params || {});
      if (!result) return;
      out.push({
        companyId: c.id,
        companyName: c.name,
        ruleId: ruleId,
        severity: result.severity,
        message: result.message,
        context: result.context,
      });
    });
  });
  return out;
}

/* Group alerts by company for display. */
export function groupAlertsByCompany(alerts) {
  const out = {};
  (alerts || []).forEach(function (a) {
    (out[a.companyId] = out[a.companyId] || { companyName: a.companyName, items: [] }).items.push(a);
  });
  return out;
}

export const RULE_LABELS = (function () {
  const m = {};
  Object.keys(RULE_DEFS).forEach(function (k) { m[k] = RULE_DEFS[k].label; });
  return m;
})();
