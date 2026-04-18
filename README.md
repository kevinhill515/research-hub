# research-hub

## Local setup

```bash
npm install
npm run setup-hooks   # one time — enables .githooks/pre-push
npm run dev           # local dev server
```

## Pre-push check

After `npm run setup-hooks`, every `git push` runs `npm run check` (which is
`vite build`) first. If the build fails, the push is blocked — this catches
JSX/syntax errors before CI and avoids a red deploy.

Bypass the check for a single push with:

```bash
git push --no-verify
```

The hook no-ops gracefully if `npm` isn't available on the machine.

## Scripts

| script          | what it does                          |
|-----------------|---------------------------------------|
| `npm run dev`   | Vite dev server                       |
| `npm run build` | production build into `dist/`         |
| `npm run check` | same as build — used by pre-push      |
| `npm run preview` | preview built site                  |
| `npm run deploy` | build + gh-pages deploy              |

## Component layout

```
src/
  App.jsx                                      — top-level shell, tab routing
  context/CompanyContext.jsx                   — shared state (companies, repData, annotations, …)
  hooks/
    useCompanies.js                            — selCo/coView/coSort + company CRUD
    useImport.js                               — FX/rep/tx/valuation/estimates/calendar imports
    useLibrary.js                              — library / saved-entries helpers
    useRecall.js                               — recall Q&A
    useSynthesis.js                            — LLM synthesis
  components/
    companies/CompanyDetail.jsx                — company-detail view + all subtabs
    portfolios/PortfoliosTable.jsx             — per-portfolio dashboard (FIN/IN/FGL/GL/EM/SC)
    portfolios/OverlapTable.jsx                — Portfolios → Overlap subtab
    tables/                                    — CoRow, OverlapMatrix
    ui/                                        — small reusable bits (PortPicker, StatusPill, DiffView, BarRow, …)
    forms/                                     — editors (SectionEditTab, EarningsEntry, NotesCell, …)
    modals/                                    — full-screen overlays (GlobalSearch, TemplateSearch, QuickUpload, DiscussionsPanel)
    calendar/                                  — EarningsCalendar
    ErrorBoundary.jsx
  constants/index.js                           — portfolio/sector/country/tier tables + style tokens
  utils/index.js                               — calc helpers, formatters, derived-state helpers
  api/index.js                                 — Anthropic key + Supabase client
```

## Known shortcuts and idioms

- **`selCo` is derived**: `useCompanies` stores only `selCoId` and looks up the
  company from `companies` on every render. Every context mutation is
  therefore immediately visible on the company-detail view — no more manual
  `setSelCo(prev => ...)` mirrors.

- **Rep-data shape**: `{port: {ticker: {shares, avgCost}}}`. Use
  `repShares(entry)` / `repAvgCost(entry)` from `utils` to read; they handle
  both the new object shape and the legacy numeric shape during migration.

- **Ids are UUIDs**. Anywhere an id is generated, use `crypto.randomUUID()`
  with a base-36 fallback; never rely on `Date.now()+Math.random()` — it
  collides within a single bulk import.
