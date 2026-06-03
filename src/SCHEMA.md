# Data model reference

Single source of truth for what's stored in this app. Keep this updated
when adding/renaming fields — the codebase has no compile-time type
checking, so this doc is what catches "I thought that field was named
X" mistakes.

## Storage layers

The app keeps **all** mutable state in Supabase. Three tables:

| Table | Shape | Used for |
|---|---|---|
| `companies` | one row per company; `id` = uuid, `data` = JSON | the entire company portfolio universe (325 names) |
| `library` | one row with `id="shared"`; `data` = JSON array | research-library entries |
| `meta` | key-value rows; `key` text PK, `value` text | everything else (FX, rep holdings, fxRates, approvals, ...) |

Reads via PostgREST. Writes via `supaUpsert` (POST with
`Prefer: resolution=merge-duplicates`). Auth is the publishable anon key;
RLS restricts what unauthenticated traffic can do.

Local state lives in React via `CompanyContext`. Auto-save effects in
`CompanyContext.jsx` debounce every state piece (~500ms light, ~1.5s
heavy) and push to Supabase via `autoSendBlob` / the per-company
chunked upsert. The `lastSentRef` map dedupes redundant writes.

---

## `company` object

One per company row. Lives in `companies` table as `data` column JSON.

```
{
  id: string                   // uuid; PK of the row
  name: string                 // "easyJet plc"
  usTickerName: string?        // alt display name for ADR ("Vinci SA Sponsored ADR")
  ticker: string?              // legacy single-ticker field; the `tickers` array is the source of truth now
  country: string?             // "United Kingdom"
  sector: string?              // "Industrials"
  tier: string?                // "T1" / "T2" / etc.; can be a comma-joined list like "T1, T2"
  status: "Own" | "Focus" | "Watch" | "Sold" | ""
  flag: string?                // "Red flag" / "Amber" etc.; FLAG_STYLES key
  portfolios: string[]         // which portfolios hold or target this name. ["FIN","IN","FGL","GL","EM","SC"]
  portNote: string?            // free-text "considering for" portfolios (comma-joined codes)
  adrRatio: number?            // ords per ADR (e.g. 0.25 for Vinci VCISY). Defaults to 1 via one-shot migration.
  lastReviewed: string?        // ISO date the analyst last reviewed (drives staleness colors)
  lastUpdated: string?         // ISO date; bumped on any edit. Drives the Updated column.
  tickers: Ticker[]            // see Ticker shape below
  valuation: Valuation         // see Valuation shape
  earningsEntries: EarningsEntry[]
  portWeightHistory: PortWeightHistoryEntry[]
  tpHistory: TpHistoryEntry[]
  transactions: Transaction[]
  initiatedDates: { [port: string]: string }   // YYYY-MM-DD per portfolio (manual override of inferred init date)
  portWeights: { [port: string]: string }      // target weight % per portfolio, e.g. {"FIN":"3.5"}
  sections: { [name: string]: string }         // template sections ("Overview", "Valuation", "Thesis", "Key Challenges") → markdown text
  updateLog: UpdateLogEntry[]                  // {date, type, summary, changes:string[]}
  takeaway: string?                            // company-level short takeaway (fallback if no earnings entry has one)
  takeawayLong: string?                        // company-level extended notes
  action: string?                              // legacy field; "Increase TP" / "Decrease TP" — now derived from latest earnings entry's tpChange
}
```

### `Ticker`

```
{
  ticker: string               // "DG-FR", "VCISY", "AAPL"
  price: string|number?        // last price in `currency`
  currency: string?            // "EUR", "USD", "JPY"
  isOrdinary: boolean?         // exactly one ticker per company should be marked ordinary
  perf5d: string|number?       // legacy; new code reads ticker.perf["5D"]
  perf: { TODAY?: number, "5D"?: number, "MTD"?: number, ..., "3YR"?: number }
  priceAsOf: string?           // YYYY-MM-DD; per-ticker freshness stamp
}
```

### `Valuation`

The Live fields update daily from FactSet imports. The `*Fixed` fields
are snapshotted at TP-approval time and only move when a peer-approved
suggestion lands via `approveTpApproval`.

```
{
  // Live (FactSet-driven, daily-refreshed)
  price: string?               // current ord-ticker price
  pe: string|number?           // target PE (the multiple the team uses for TP)
  eps1: string|number?         // Live FY1 EPS estimate
  eps2: string|number?         // Live FY2 EPS estimate
  w1: string|number?           // weight on FY1 in the blended normEPS (0–100)
  w2: string|number?           // weight on FY2 (0–100); w1+w2 should == 100
  fy1: string?                 // label "FY2026E"
  fy2: string?                 // label "FY2027E"
  fyMonth: string?             // "Dec" / "Mar" — fiscal year end month
  currency: string?            // reporting currency
  peCurrent, peLow5, peHigh5, peAvg5, peMed5: string|number?   // 5-year P/E range for the bar visual

  // Fixed (locked at last TP approval; only mutated by approveTpApproval)
  tpFixed: string|number?      // headline locked TP
  tpFixedDate: string?         // YYYY-MM-DD when TP Fixed was last set
  peFixed: string|number?
  eps1Fixed, eps2Fixed, w1Fixed, w2Fixed: string|number?
  fy1Fixed, fy2Fixed: string?
  normEPSFixed: string|number?      // legacy; derived from eps1Fixed/eps2Fixed/w1Fixed/w2Fixed
  normEPSFixedDate: string?         // legacy

  // Metrics (44 fields populated by the Metrics import — fpe/fpe1/fpe2,
  // fcfYld series, divYld series, payout series, netDE series, intCov,
  // ltEPS, gr/net/op margin series, gpAss/npAss series, opROE series,
  // pb series, roe series, intGr, adpsGr5, adpsGr1, mktCap)
  mktCap, fpe, fpe1, fpe2, fcfYld, ..., adpsGr1: string|number?
}
```

### `EarningsEntry`

One row per quarterly report, past or upcoming.

```
{
  id: string                   // newId() at creation
  reportDate: string           // YYYY-MM-DD. Drives "isFutureEntry" gating
  quarter: string?             // "Q1 FY26"; inferred from reportDate + fyMonth if blank
  tpChange: "Increased" | "Decreased" | "Unchanged" | ""
  newTP: string|number?        // analyst's proposed new TP (if tpChange != "Unchanged")
  tpRationale: string?         // why the TP moved
  thesisStatus: "On track" | "Watch" | "Broken" | ""
  thesisNote: string?          // why the thesis status changed
  shortTakeaway: string?       // 1-line headline
  extendedTakeaway: string?    // free-form notes
  bullets: string[]?           // key data points
  open: boolean?               // UI: is this entry expanded?

  // Sales/EPS estimate-vs-actual context (optional, from earnings calendar import)
  salesEst, salesActual, salesSurpNom, salesSurpPct: number?
  epsEst, epsActual, epsSurpNom, epsSurpPct: number?
  salesPlus1Est, epsPlus1Est: number?
}
```

### `PortWeightHistoryEntry`

Every weight change + B/A/P/S trade stamp lands here. Drives the IC
Meeting agenda + memos.

```
{
  id: string
  date: string                 // YYYY-MM-DD
  portfolio: string            // "FIN" / "IN" / "FGL" / "GL" / "EM" / "SC"
  oldWeight: number?           // committed weight before this change
  newWeight: number?           // proposed/committed weight after
  author: string?              // who made the change (TEAM_MEMBERS)
  action?: "Buy" | "Add" | "Pare" | "Sell"   // B/A/P/S trade flag; null/undefined for pure target changes
  isAgenda: boolean            // true = pending (in IC agenda); false = committed
  comments: AgendaComment[]?   // {id, author, date, text, editedAt?}
}
```

**Key invariants**:
- `isAgenda:true` AND `action:undefined` AND `newWeight present` → target % proposal (the cell turns amber on Portfolios).
- `isAgenda:true` AND `action:"Sell"` → Sell-All stamp; the Target % cell shows "→ 0%".
- `isAgenda:true` AND `action:"Add"/"Pare"/"Buy"` → trade stamp; doesn't change target weight.
- Lock-in (`commitProposedWeights`) flips `isAgenda:true → false` and writes `newWeight → company.portWeights[port]`.

### `TpHistoryEntry`

Audit trail of every approved TP change.

```
{
  date: string                 // YYYY-MM-DD; suggestedAt on approval rows, edit date otherwise
  tp: number                   // approved TP, in the row's currency
  pe: string|number            // PE multiple used
  eps: string|number?          // blended normEPS (eps1*w1 + eps2*w2)/100
  eps1, eps2, w1, w2: string|number?   // per-leg breakdown (newer rows; legacy rows lack this)
  fy1, fy2: string?            // FY labels
  earningsEntryId: string?     // links to the earnings entry that drove the change
  quarter: string?             // "Q1 FY26"; snapshotted at approval
  currency: string             // for display
  source: "approval"?          // "approval" for rows written by approveTpApproval; absent for legacy/manual rows
  by: string?                  // suggestedBy
  approvedBy: string?
  rationale: string?
  fyLabel: string?             // legacy
}
```

### `Transaction`

Buy / sell history. Per-portfolio rep accounts feed this.

```
{
  id: string
  date: string                 // YYYY-MM-DD trade date
  portfolio: string            // "FIN" / "IN" / etc.
  shares: number               // negative = sell
  price: number?               // unit price
  amount: number?              // total (signed)
  ticker: string?              // optional override (preserves historical ticker across renames)
  currency: string?            // optional override
  cashFlow: boolean?           // true when the trade is forced by deposits/withdrawals, not a discretionary investment decision
  initOverride: boolean?       // overrides the auto-detected "this is the first share in this portfolio" flag
}
```

---

## `meta` blobs

Each row is `{key, value}` where `value` is JSON-stringified except where noted.

| Key | Shape | Updated by |
|---|---|---|
| `lastPriceUpdate` | string `"by-user at YYYY-MM-DD HH:MM"` (NOT json-wrapped) | FactSet pull, manual price import |
| `entryComments` | `{ [entryId]: [{id, text, author, date}] }` | Discussions panel comments on earnings entries |
| `calLastUpdated` | string `"by-user at YYYY-MM-DD HH:MM"` | Earnings Dates import |
| `repData` | `{ [port]: { [TICKER]: {shares, avgCost, ...} } }` | Rep Holdings import / FactSet pull |
| `fxRates` | `{ [ccy]: rate }` — stored as **local-per-USD** (1/EURUSD) | FX import, FactSet pull |
| `specialWeights` | `{ CASH: {[port]: weight}, DIVACC: {[port]: weight} }` | proposeTargetWeight (auto-shifts CASH) |
| `annotations` | `[{id, scope, companyId?, portfolio?, text, author, date, mentions, replies, resolved, ...}]` | Discussions panel |
| `researchAssignments` | `{ byMember: {...}, reorgs: [...] }` | Research priority board (Companies → Research subtab) |
| `perfData` | `{ [port]: { lastMonthEMV, series: { [name]: {returns: {YYYY-MM: r}} } } }` | Performance import + FactSet monthly pulls |
| `feedback` | `[{id, text, author, date, status, ...}]` | Feedback tab |
| `benchmarkWeights` | `{ [name]: {sectors:{}, countries:{}, metrics:{}, asOf} }` | Benchmark import (current snapshot) |
| `alertRules` | `{ [ruleId]: {enabled, params} }` | Alerts panel rule edits |
| `breakdownHistory` | `{ [name]: { [YYYY-MM-DD]: {sectors:{}, countries:{}, ratios:{}, metrics:{}} } }` | Benchmark import (dated 5-col paste). **LAZY-LOADED** — only fetched when a Dashboard breakdown subtab opens |
| `tpApprovals` | `[{id, companyId, status, suggestedBy/At, approvedBy/At, rejectedBy/At, fromPE..., toPE..., toEPS1, toEPS2, toW1, toW2, toTP, rationale, earningsEntryId, ...}]` | Suggest TP Change → submit / approve / reject flows |
| `memoLog` | `[{id, date, profile, memo, author}]` | IC Meeting Commit & log + Wednesday Save to log |
| `targetChangeReads` | `{ [historyEntryKey]: [usernames] }` | sparse ack map for portWeightHistory entries the user has marked seen |
| `wednesdayNotes` | string (NOT json-wrapped) | Wednesday Notes textarea — auto-saved with ~500ms debounce |

### Meeting profiles

Defined in `src/utils/meetingMemo.js#PROFILES`:

| Profile | Ports | Renders |
|---|---|---|
| `tuesday` | FIN, IN, FGL, GL | Multi Cap auto-built memo (Trading Agenda + Allocation Changes + FV Target Changes, consolidated FV) |
| `wednesday` | (none) | Free-form notes composer (`freeform:true`) — no auto-build |
| `thursday` | EM, SC | EM+SC auto-built memo (per-port FV breakout) |

---

## Convention notes (gotchas worth knowing)

- **Date strings are YYYY-MM-DD internally** but display as M/D/YY via `fmtDateUS()`. Lexicographic sort relies on the ISO form — never store M/D/YY.
- **fxRates is local-per-USD** (so `100 EUR / fxRates.EUR ≈ USD value`). The FX importer inverts pasted `EURUSD 1.17` into `fxRates.EUR ≈ 0.857`.
- **CASH target is derived**, not stored: `100 - sum(company.portWeights[port]) - DIVACC`. Don't try to set it directly.
- **TP suggestions go through approval**, not direct edit. The inline TP Fixed editor was removed from the Valuation tab; `approveTpApproval` is the only path that writes `valuation.tpFixed` + the `*Fixed` slots + a `tpHistory` row.
- **One-shot data migrations** live in `loadFromStorage` and `loadBreakdownHistoryIfNeeded`. Gated by `meta.cleanup_*` flags so each runs at most once per workspace.
- **lastSentRef dedup** — every auto-save uses a ref keyed by meta-key (or company id) to skip uploads when JSON.stringify equals the last sent value. Don't bypass autoSendBlob.
- **Per-row companies storage** — each company is its own `companies` table row. Legacy `id="shared"` row migrated away.
- **BroadcastChannel** — same-machine cross-window sync. Echo guard `bcSuppressUntilRef` prevents the loaded state from triggering an immediate re-upload + re-broadcast.

---

## File map (where things live)

| Concern | File |
|---|---|
| Top-level state + Supabase load/save | `src/context/CompanyContext.jsx` |
| TP suggestion / approval flow | same; functions `submitTpApproval`, `approveTpApproval`, `rejectTpApproval`, `withdrawTpApproval`, `editTpApproval` |
| Target weight lifecycle | same; `proposeTargetWeight`, `clearProposedWeight`, `commitProposedWeights`, `markTradeAgenda`, `discardAgendaEntries` |
| Annotations + replies | same; `addAnnotation`, `addReply`, `resolveAnnotation` |
| Companies hook (selection, sorting, filters, valuation/earnings commits) | `src/hooks/useCompanies.js` |
| Per-company table row | `src/components/tables/CoRow.jsx` |
| Portfolios table row | `src/components/portfolios/PortfolioRow.jsx` |
| IC Meeting modal | `src/components/modals/MeetingMemoModal.jsx` |
| TP Approvals modal | `src/components/modals/TpApprovalsPanel.jsx` |
| Discussions panel | `src/components/modals/DiscussionsPanel.jsx` |
| Memo text generation | `src/utils/meetingMemo.js` |
| Date / display / pure helpers | `src/utils/index.js` (`fmtDateUS`, `parseDate`, `todayStr`, `calcNormEPS`, `calcTP`, `calcMOS`, ...) |
| Portfolio math (rep MV, weights) | `src/utils/portfolioMath.js` |
| Alerts engine | `src/utils/alerts.js` |
| Supabase REST helpers | `src/api/index.js` |
