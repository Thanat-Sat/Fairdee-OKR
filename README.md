# Fairdee OKR & Monthly Metrics Dashboard

A Firebase-hosted internal dashboard suite for Fairdee. It bundles two independent applications behind one entry hub:

1. **OKR Dashboard** — Objectives & Key Results tracking, KAM performance, hunter analysis, fleet analysis.
2. **Monthly Metrics** — Tabbed executive view aggregating Channel, MLM, Focus Team, Agency, Segment, and Renewal performance from Google Sheets.

The site is a static, no-build, vanilla-JS application served from `public/`. There is no bundler, no framework, no transpile step. Open an `.html` file in a browser and it works.

---

## Table of contents

1. [Live URL & deploy target](#live-url--deploy-target)
2. [Tech stack](#tech-stack)
3. [Repository layout](#repository-layout)
4. [Two applications, one site](#two-applications-one-site)
5. [Authentication & Firebase projects](#authentication--firebase-projects)
6. [Data sources — Google Sheets](#data-sources--google-sheets)
7. [Centralized localStorage data store](#centralized-localstorage-data-store)
8. [Targets system (Firestore)](#targets-system-firestore)
9. [Page-by-page walkthrough](#page-by-page-walkthrough)
10. [Sync indicator & in-flight progress](#sync-indicator--in-flight-progress)
11. [Run-rate calculations](#run-rate-calculations)
12. [Local development](#local-development)
13. [Deploy](#deploy)
14. [Common tasks (recipes)](#common-tasks-recipes)
15. [Conventions & code style](#conventions--code-style)
16. [Troubleshooting](#troubleshooting)
17. [Glossary](#glossary)

---

## Live URL & deploy target

- **Hosted at**: `https://fairdee-okr.web.app/`
- **Firebase project (hosting)**: `fairdee-okr` — see [.firebaserc](.firebaserc)
- **Firebase project (auth + Firestore)**: `fairdee-monthly-metr` — see [public/firebase-config.js](public/firebase-config.js) and [public/mm-firebase-config.js](public/mm-firebase-config.js)

> The hosting and the auth/Firestore live in **two different Firebase projects**. Hosting points to `fairdee-okr`; the SDK initialization in app code points to `fairdee-monthly-metr`. Don't confuse the two.

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Hosting | Firebase Hosting | Static `public/` directory |
| Auth | Firebase Authentication (compat SDK 9.22.0) | Email/password |
| Database | Firestore (compat SDK 9.22.0) | Targets only |
| Frontend | Plain HTML + vanilla JS + CSS | No build, no framework |
| Charts | Chart.js 4.4.0 (CDN) | Line and bar charts |
| CSV parsing | PapaParse 5.4.1 (CDN, OKR side) + custom parser (MM side) | |
| PDF export | jsPDF 2.5.1 + jspdf-autotable (OKR side) | |
| Snapshot copy | html2canvas 1.4.1 (lazy-loaded) | "Copy to clipboard" UX |
| Data backend | Google Sheets (CSV export endpoint) | Public-share required |
| Persistence | `localStorage` (data cache) + Firestore (targets) | |

---

## Repository layout

```
.
├── .firebaserc                         # Firebase project alias → fairdee-okr
├── firebase.json                       # Hosting config (root copy)
├── fix_chars.js                        # One-off script to clean encoding issues
├── README.md                           # ← this file
├── public/                             # Hosted root
│   ├── firebase.json                   # (duplicate, harmless)
│   ├── package.json                    # Empty stub (no dependencies)
│   │
│   ├── login.html                      # Sign-in / sign-up
│   ├── index.html                      # Central Hub (landing page)
│   ├── 404.html                        # Not-found page
│   │
│   ├── okr-dashboard.html              # OKR Dashboard (single-page app)
│   ├── script.js                       # OKR logic — 4477 lines (the largest file)
│   │
│   ├── mm.html                         # Monthly Metrics shell — tabs + iframes
│   ├── app.js                          # MM shell behavior (tabs, refresh, sync indicator)
│   │
│   ├── executive-summary.html / .js    # MM tab: aggregated read-only KPIs
│   ├── performance-recap.html / .js    # MM tab: cohort-based recap
│   ├── channel-dashboard.html / .js    # MM tab: channel GWP trend
│   ├── mlm-dashboard.html / .js        # MM tab: MLM team performance
│   ├── focus-team-dashboard.html / .js # MM tab: focus team performance
│   ├── focus-team-data-processor.js    # Shared focus-team parsing helpers
│   ├── agency-dashboard.html / .js     # MM tab: agency performance
│   ├── segment-dashboard.html / .js    # MM tab: segment activation
│   ├── renewal-dashboard.html / .js    # MM tab: renewal rates
│   ├── targets-dashboard.html / .js    # MM tab: central target management
│   ├── fix-focus-team-data.html        # One-off data-fix utility page
│   │
│   ├── dashboard-data-store.js         # Shared localStorage cache (singleton)
│   ├── dashboard-copy.js               # "Copy to clipboard" UX for charts/tables
│   ├── auth.js                         # Login form behavior
│   ├── firebase-config.js              # Auth manager (Hub side)
│   ├── mm-firebase-config.js           # Auth manager + targetsDB (MM side)
│   │
│   ├── styles.css                      # Shared styles for all pages
│   ├── group_targets_2025_2026.csv     # Embedded targets CSV (OKR)
│   └── assets/                         # Logos, icons
│
└── *.csv (root)                        # One-off data exports, unused at runtime
```

---

## Two applications, one site

The hub at `/` ([index.html](public/index.html)) is the entry point. It links to:

| Card | URL | Application |
|---|---|---|
| OKR Dashboard | [okr-dashboard.html](public/okr-dashboard.html) | OKR app (powered by [script.js](public/script.js)) |
| Monthly Metrics | [mm.html](public/mm.html) | MM app (tabbed iframe shell) |
| Fairdee CRM | `http://143.14.9.55:8090/` | External — outside this repo |

The two applications are deliberately decoupled:

- **OKR Dashboard** is a single fat HTML page with all panels rendered together. State lives in JS variables; data is fetched directly on every load.
- **Monthly Metrics** is a thin shell ([mm.html](public/mm.html)) hosting nine sub-dashboards in iframes. Data is shared via a localStorage-based singleton and a postMessage event bus.

They share only:
- The login flow ([login.html](public/login.html), [auth.js](public/auth.js), [firebase-config.js](public/firebase-config.js))
- The hub ([index.html](public/index.html))
- Some CSS classes ([styles.css](public/styles.css))
- The Firebase project for auth

```
                    ┌──────────────────────┐
                    │  index.html (Hub)    │
                    └─────┬──────────┬─────┘
                          │          │
                  ┌───────▼─┐    ┌───▼──────┐
                  │  OKR    │    │   MM     │
                  │ (single │    │ (shell + │
                  │  page)  │    │ iframes) │
                  └─────────┘    └──────────┘
```

---

## Authentication & Firebase projects

### Auth flow

1. User opens any page.
2. Page loads Firebase compat SDK + `firebase-config.js` (or `mm-firebase-config.js`).
3. `authManager.onAuthStateChanged(...)` fires:
   - If no user → redirect to [login.html](public/login.html)
   - If user → render the page

[auth.js](public/auth.js) wires the login/sign-up forms and on success redirects to `index.html` (the Hub).

### Two configs, same project

- [firebase-config.js](public/firebase-config.js) — used by the Hub and OKR pages. Provides `window.authManager`.
- [mm-firebase-config.js](public/mm-firebase-config.js) — used by Monthly Metrics pages. Provides `window.authManager` **plus** `window.targetsDB` (Firestore wrapper).

Both connect to the same Firebase project: `fairdee-monthly-metr`. The split exists because the MM side needs the targets persistence layer; the OKR side does not.

### Firestore collections

| Collection | Used by | Schema |
|---|---|---|
| `users` | Sign-up flow ([firebase-config.js:47-51](public/firebase-config.js#L47)) | `{ name, email, createdAt }` |
| `targets` | All MM dashboards via `targetsDB` | See [Targets system](#targets-system-firestore) |

---

## Data sources — Google Sheets

Both apps load almost all production data from Google Sheets, fetched as CSV.

### Sheet IDs in use

| Sheet ID | Purpose | Used by |
|---|---|---|
| `1M51L7xRu_Y8MRO5ziDVZ4pbWtqi0Mxb1-oJ6WyfwKU0` | Master sales sheet (multiple tabs/gids) | Channel, MLM, Focus Team, Agency, Segment, Renewal, Performance Recap |
| `1BcCiO2TiHhJfWDj62RJ_8U1bmAjIpqxgSpTJjkWsTTg` | Fleet | OKR script.js |
| (OKR sheet IDs) | OKR/KR data | OKR script.js |

### Two fetch patterns

1. **By gid** (preferred — stable across renames):

   ```
   https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}
   ```

2. **By tab name** (only used in two places — breaks if the tab is renamed):

   ```
   https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={tabName}
   ```

   - [script.js:2119](public/script.js#L2119) — `fetchSheetTab()` helper
   - [script.js:3689](public/script.js#L3689) — Fleet "summary" tab

> **Renaming gotcha**: Renaming the spreadsheet file or any tab does **not** change the file ID or gid. It only breaks URLs that use the tab name. Avoid renaming the Fleet sheet's "summary" tab.

### gids per Monthly Metrics dashboard

| Dashboard | gid | File |
|---|---|---|
| Channel | `1126458530` | [channel-dashboard.js:551](public/channel-dashboard.js#L551) |
| MLM | `233478706` | [mlm-dashboard.js:856](public/mlm-dashboard.js#L856) |
| Focus Team | `233478706` | [focus-team-dashboard.js:1123](public/focus-team-dashboard.js#L1123) |
| Agency (status) | `1243827715` | [agency-dashboard.js:456](public/agency-dashboard.js#L456) |
| Agency (agents) | `110469784` | [agency-dashboard.js:457](public/agency-dashboard.js#L457) |
| Segment | `1253670765` | [segment-dashboard.js:392](public/segment-dashboard.js#L392) |
| Renewal | `544634047` | [renewal-dashboard.js:495](public/renewal-dashboard.js#L495) |
| Performance Recap (cohort) | `374336501` | [performance-recap.js](public/performance-recap.js) |

---

## Centralized localStorage data store

[dashboard-data-store.js](public/dashboard-data-store.js) defines a singleton `window.dashboardDataStore` shared across **all Monthly Metrics iframes**.

### Why
Multiple iframes (executive summary, channel, MLM, etc.) need to read the same data. Rather than each one re-parsing CSVs, the first one to fetch a dataset writes a normalized version into `localStorage` under key `dashboard_data_v1`. Other iframes read it back.

### Shape

```js
{
  channel:    { data, months },
  mlm:        { teams, months },
  regional:   { regions, months },
  segment:    { segments, months },
  agency:     { metrics, months },
  renewal:    { channels, months },
  focusTeam:  { teams, months, teamList },
  cohortCsv:  { text },
  lastUpdated: { channel: ISOString, mlm: ISOString, ... }
}
```

### API

```js
window.dashboardDataStore.updateChannelData(data, months);   // also: MLM, Regional, Segment,
                                                              //       Agency, Renewal, FocusTeam, CohortCsv
window.dashboardDataStore.getAllData();                      // → { channel, mlm, ... }
window.dashboardDataStore.getAvailableMonths();              // sorted YYYY-MM list
window.dashboardDataStore.setSelectedMonth('2026-04');
window.dashboardDataStore.getSelectedMonth();
window.dashboardDataStore.clearData();
```

### Cross-iframe notification

Whenever any `update*Data()` is called, the store:

1. Persists to `localStorage`.
2. Dispatches a `dashboardDataUpdated` CustomEvent on the local window.
3. `postMessage({ type: 'dashboardDataUpdated', key })` to `window.parent`.

The shell ([app.js](public/app.js)) catches the parent message and re-broadcasts it to all sibling iframes so they re-render with fresh data.

### Always-fetch policy

As of the latest changes, every MM iframe **bypasses the localStorage cache and always re-fetches from Google Sheets on load** (matching OKR Dashboard behavior). The store is still written, so cross-iframe sharing still works — but each iframe load triggers a fresh GET.

If you need to revert to cache-first, restore the `if (allData.{key} && ...) { use cache } else { fetch }` blocks that previously existed in each `autoLoadData()`.

---

## Targets system (Firestore)

Targets are budgeted/expected values per dashboard, per channel/team/segment, per month.

### Schema (`targets` collection)

```js
{
  type:           'channel' | 'mlm' | 'mlm_agent' | 'focus_team'
                | 'agency' | 'segment' | 'renewal' | 'regional',
  name:           string,                  // e.g. 'Team Agent', 'mlm_agent', 'totalAgents'
  month:          'YYYY-MM',
  value:          number,
  unit:           'THB' | 'percent' | 'count' | 'policies' | 'USD',
  notes:          string,
  updatedBy:      uid,
  updatedByEmail: string,
  updatedAt:      serverTimestamp
}
```

The composite index implied by `(type, month, name)` is **avoided** — code does a single `getAllTargets()` and filters in JS. This sidesteps the need for a Firestore composite index.

### API — `window.targetsDB`

Defined in [mm-firebase-config.js:129](public/mm-firebase-config.js#L129).

```js
await targetsDB.saveTarget({ type, name, month, value, unit });   // upsert
await targetsDB.getAllTargets();   // → { success, targets: [...] }
await targetsDB.deleteTarget(id);
```

### Where targets are set

| Dashboard | Target type | Modal trigger | Inputs |
|---|---|---|---|
| Channel | `channel` | `openTargetsModal()` | Team Agent, IG, FD/AO (THB) |
| MLM | `mlm` | `openMLMTargetsModal()` | Per team (THB) |
| Focus Team | `focus_team` | `openFocusTeamTargetsModal()` | Per anchor code (THB) |
| Agency | `agency` | `openAgencyTargetsModal()` | Total / New / Acq Rate / Active |
| Segment | `segment` | `openSegmentTargetsModal()` | 6 segment buckets (count) |
| Renewal | `renewal` | `openRenewalTargetsModal()` | 4 channels (%) |
| Targets (central) | any | "Add New Target" | Generic form |

The central [targets-dashboard.html](public/targets-dashboard.html) has Import CSV / Export CSV / per-row edit-delete and works across all types.

### How targets flow into a dashboard

```
DataProcessor.loadTargets()
  → targetsDB.getAllTargets()
  → filter by type
  → cache as { 'YYYY-MM-Name': value }

DataProcessor.getTarget(month, name)  → number | null
```

Dashboards that *display* target lines/columns currently: Channel, MLM, Focus Team. Dashboards that *save* targets but don't yet render them inline: Agency, Segment, Renewal (added recently — render-side wiring TODO).

---

## Page-by-page walkthrough

### login.html
Email/password sign-in with sign-up tab. Wired by [auth.js](public/auth.js). On success redirects to `index.html`.

### index.html — Hub
Three cards: OKR Dashboard, Monthly Metrics, Fairdee CRM (external). Auth-gated. Renamed from the old `home.html` so it's served as the default at `/`. The previous "OKR" content lives at [okr-dashboard.html](public/okr-dashboard.html).

### okr-dashboard.html — OKR Dashboard

The largest single page in the project, powered by **[script.js (4477 lines)](public/script.js)**. Major sections by line range:

| Section | Lines |
|---|---|
| Constants — LESS_IS_BETTER_KRs, embedded Hunter targets | 1–88 |
| Helper functions | 153–172 |
| Main OKR data fetch + render | 173–336 |
| Sub-dashboards (top movers, cards, tables, action items) | 1013–2113 |
| Hunter Analysis | 2114–2912 |
| KAM / Team performance | 2913–3666 |
| Fleet Analysis | 3667–end |

Notable:
- KRs are tracked via objects with `current` / `target` / `name`. `LESS_IS_BETTER_KRS` inverts the progress formula (`target / current` instead of `current / target`).
- Hunter targets are **hardcoded arrays** in [script.js:40-69](public/script.js#L40) — 12 monthly values for `FIRST_TRANSACTING` and `EARLY_RETENTION`.
- Loading progress is tracked via `_loadedCount` / `_totalSources = 5`.
- Provides a PDF export via jsPDF (in the report sections).

### mm.html — Monthly Metrics shell

A header (logo, sync indicator, month/year selector, Refresh button, user menu) plus 9 tabs. Each tab is an iframe loading one of the dashboards below. Powered by [app.js](public/app.js):

- Tab switching with fade animation
- Global month/year selector that posts `monthChange` to all iframes
- Refresh button reloads all iframe `src`s and resets the sync indicator
- Sync indicator: `Fetching Google Sheets X/N...` while in flight, `Google Sheets synced at HH:MM` when done

### executive-summary.html / .js — Executive Summary

A read-only consumer. Reads from `dashboardDataStore` and renders KPI cards plus charts for: Channel performance, Focus Team, Monthly Trend, Agency, Segment, Renewal. Re-renders whenever any other dashboard pushes a `dashboardDataUpdated` event. Has no fetch of its own.

### performance-recap.html / .js — Performance Recap

Cohort/MoM analysis driven by a single CSV (gid `374336501`). Renders cohort tables and recap cards.

### channel-dashboard.html / .js — Channel Overview

KPI cards for Total / Team Agent / IG / FD/AO + monthly trend chart + **"Overall GWP trend" table** (the new layout):

- Section bands: "Agency channel" → All account; "Sub channel" → Team Agent / FD/AO / IG
- Columns: each YTD month + `Q{N} run rate` + `EOY run rate`
- Rows per channel: Target / Actual / % (% colored green ≥100%, red <100%)
- Numbers formatted as `XXX.XMB` (millions of baht)

Targets: `type='channel'`, `name ∈ {'Team Agent','IG','FD/AO'}`.

### mlm-dashboard.html / .js — MLM Team Performance

Per-MLM-team table + chart. CSV import for bulk targets (`type='mlm'`). Inline modal for setting one target per team per month (THB).

### focus-team-dashboard.html / .js — Focus Team Performance

Per-anchor-code performance for a curated team list. Targets type `focus_team`. Has its own data processor split out in [focus-team-data-processor.js](public/focus-team-data-processor.js).

### agency-dashboard.html / .js — Agency Performance

Pivot table of agency metrics: Total / New / Existing agents, Acquisition Rate, Active agents. Builds from two CSVs (status + agents). Targets type `agency`, names = metric keys (`totalAgents`, `newAgents`, `acquisitionRate`, `activeAgents`).

### segment-dashboard.html / .js — Segment Activation

6 fixed segments (Enterprise, Extra Large, Large, Medium, Small, Micro). Targets type `segment`, names = the segment label string.

### renewal-dashboard.html / .js — Renewal Rate

KPI cards + trend chart + table for 4 channels: `mlm_agent`, `direct_agent`, `ao_agent`, `inspection_garage`. Targets type `renewal`, unit `percent`.

### targets-dashboard.html / .js — Target Management

Centralized CRUD over the `targets` collection. Has filter-by-type, Import CSV, Export CSV, edit/delete buttons.

### fix-focus-team-data.html
One-off utility page for data cleanup. Not part of normal flow.

---

## Sync indicator & in-flight progress

Defined in [app.js:80-115](public/app.js#L80) and driven by the `key` field on every `dashboardDataUpdated` postMessage from each iframe.

```
Fetching Google Sheets 0/7...   ← initial
Fetching Google Sheets 1/7...   ← channel arrives
Fetching Google Sheets 2/7...   ← mlm arrives
...
Google Sheets synced at 11:19 AM  ← all 7 done
```

The 7 datasets are defined in `GOOGLE_SHEET_DATASETS` in [app.js:53-61](public/app.js#L53):

`channel · mlm · focusTeam · agency · segment · renewal · cohortCsv`

Each iframe completes its fetch by calling `dashboardDataStore.update{Key}Data(...)`, which calls `saveToStorage(key)` → `notifyDataUpdated(key)` → `postMessage({ type: 'dashboardDataUpdated', key }, '*')` to the parent. The parent dedupes by key in a `Set` so duplicate notifications don't double-count.

Refresh button calls `resetSyncTracking()` which clears the set and re-runs the indicator.

---

## Run-rate calculations

Defined for the Channel Overview "Overall GWP trend" table in [channel-dashboard.js](public/channel-dashboard.js):

### Quarter run rate
```
Target = sum of monthly targets across the 3 quarter months
Actual = (sum of completed-month actuals in the quarter / count) × 3
```
i.e., linear projection from completed months in the current quarter.

### EOY run rate
```
Target = sum of monthly targets for all 12 months of the year
Actual = (YTD actual sum / months elapsed) × 12
```

> If your team uses a different formula (e.g. trailing-3-month average, weighted projection, etc.), edit `calculateQuarterRunRate` and `calculateEOYRunRate` in [channel-dashboard.js](public/channel-dashboard.js) to match.

---

## Local development

There is no build step. To run locally:

```bash
cd public
python3 -m http.server 5500
# then open http://localhost:5500/
```

Or, with the Firebase CLI installed:

```bash
firebase serve --only hosting
```

> Pure `file://` doesn't work because Firebase compat SDKs require an HTTP origin and Google Sheets CSV requests need a proper Origin header.

### Firebase CLI

The CLI is **not** installed in this repo's `node_modules`. Install globally:

```bash
npm install -g firebase-tools
firebase login
firebase use fairdee-okr   # already aliased in .firebaserc
```

Or run on demand: `npx firebase-tools deploy`.

---

## Deploy

```bash
firebase deploy --only hosting
```

That's it. Firebase reads [firebase.json](firebase.json):

```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```

…and uploads everything in [public/](public/). No CI is configured — deploys are manual.

### Cache busting
Several `<script>` tags use `?v=1778...` query strings. When you change a JS file and want to force-bust browser cache for users mid-session, bump the suffix on the relevant `<script>` tag in the corresponding HTML.

---

## Common tasks (recipes)

### Add a new dashboard tab

1. Create `mything-dashboard.html` and `mything-dashboard.js` (copy structure from [renewal-dashboard.html](public/renewal-dashboard.html)).
2. Register an iframe + tab button in [mm.html](public/mm.html):
   ```html
   <button class="tab-button" data-tab="mything">My Thing</button>
   <!-- and -->
   <div class="iframe-container" id="mythingContainer" style="display: none;">
     <iframe id="mythingFrame" src="mything-dashboard.html" frameborder="0"></iframe>
   </div>
   ```
3. Wire it in [app.js](public/app.js):
   - Add it to the `iframes` array inside `refreshAllDashboards()`.
   - Add a tab-switch branch in the `.tab-button` click handler.
4. If your dashboard uses Google Sheets, add a key to `GOOGLE_SHEET_DATASETS` and an `update*Data(...)` method in [dashboard-data-store.js](public/dashboard-data-store.js).

### Change which sheet a dashboard pulls from
Find `SHEET_ID` and `GID` in the dashboard's `.js` (e.g. [channel-dashboard.js:550-551](public/channel-dashboard.js#L550)) and replace.

### Add a new target type
1. Decide a `type` string (e.g. `'kpi'`).
2. Add it to the `<select>` options in [targets-dashboard.html](public/targets-dashboard.html) lines 60 & 115.
3. Build an inline modal in your dashboard (see [renewal-dashboard.html](public/renewal-dashboard.html) for a template) that calls `targetsDB.saveTarget({ type: 'kpi', ... })`.

### Force every iframe to use cache instead of always fetching
In each `*-dashboard.js`, restore the conditional in `autoLoadData()`:
```js
if (allData.channel && allData.channel.data && allData.channel.months) {
    /* use cache */
} else {
    fetchChannelSheetData();
}
```
(Mirror for mlm, focusTeam, agency, segment, renewal, performance-recap.)

### Set a target via the UI
Open Monthly Metrics → relevant tab → "Set Targets" button → fill month + values → Save. The data lands in the `targets` collection in Firestore (project `fairdee-monthly-metr`).

### Reset all cached data
Open browser devtools → Application → Local Storage → clear `dashboard_data_v1` and `dashboard_selected_month`. Reload mm.html.

---

## Conventions & code style

- **No build, no transpile.** All code is ES2017+ that runs in modern browsers as-is.
- **No imports.** Scripts attach to `window` and use globals (`window.dashboardDataStore`, `window.authManager`, `window.targetsDB`).
- **Inline styles** are used heavily in dynamically-generated table cells. Static layout uses [styles.css](public/styles.css).
- **Class naming**: `DataProcessor` / `DashboardUI` per dashboard. Renderers are methods on the UI class.
- **Console logging** is verbose by design — useful when running in production for support diagnostics.
- **Encoding**: some files have legacy mojibake (`âœ“` etc. for `✓`) from a past encoding mishap. [fix_chars.js](fix_chars.js) at the repo root is the cleanup script.
- **Cache busting**: querystring versions on `<script src="...">`. There is no automated stamp — bump manually.

---

## Troubleshooting

### "No data" on a dashboard
- Open devtools console — look for failed fetch on the Google Sheets URL.
- Confirm the sheet is shared "Anyone with the link can view".
- Confirm the gid in the dashboard `.js` still exists (sheet tabs can be deleted).
- Run the URL directly in your browser — if it 404s, the sheet/tab is wrong.

### Sync indicator stuck
- Stuck at `0/7` or partial: a fetch is failing silently. Check the network tab for 4xx/5xx.
- Cache key mismatch: verify each `update*Data` in [dashboard-data-store.js](public/dashboard-data-store.js) passes a `saveToStorage('key')` matching one of the entries in `GOOGLE_SHEET_DATASETS` in [app.js:53](public/app.js#L53).

### Auth loops back to login
- Open devtools → Application → IndexedDB and Local Storage → clear Firebase entries.
- Confirm the API key in [firebase-config.js](public/firebase-config.js) and [mm-firebase-config.js](public/mm-firebase-config.js) point to the same project.

### `targetsDB is not defined`
- The page didn't load `mm-firebase-config.js`. Make sure your dashboard's HTML includes the Firebase compat scripts **and** `mm-firebase-config.js` **before** the dashboard script.

### Numbers display as `XXX.XMB` but I want plain numbers
- `formatMB` in [channel-dashboard.js](public/channel-dashboard.js) divides by `1_000_000` and appends `MB`. Replace it (or call `formatNumber` instead).

### Target Management says "User not authenticated"
- Firestore writes require an active session. Make sure you're signed in before opening the modal — check the Hub and re-sign in if necessary. The `targetsDB.waitForCurrentUser()` helper times out after 8s.

---

## Glossary

| Term | Meaning |
|---|---|
| **GWP** | Gross Written Premium — total premium written before deductions (THB unless stated) |
| **MB** | Suffix for "million baht" used in display (`245.1MB`) |
| **MLM** | Multi-level marketing — agent network channel |
| **IG** | Inspection Garage channel |
| **FD/AO** | Fairdee Direct / Account Officer agent channel |
| **OKR** | Objectives & Key Results |
| **KR** | Key Result — a measurable outcome under an Objective |
| **MoM** | Month-over-month |
| **YTD** | Year-to-date |
| **EOY** | End of year |
| **Run rate** | Linear projection of an actual through to end of period |
| **Hunter Analysis** | First-Transacting and Early-Retention agent-cohort analysis (OKR side) |
| **KAM** | Key Account Manager |
| **Anchor code** | Identifier for a focus-team unit |
| **gid** | Google Sheets internal tab identifier (numeric) |
