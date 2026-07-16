# DB exploration (local only — never committed)

Read-only Redshift schema explorer to find the tables that back the dashboard's
GWP / OKR / KAM data, so we can move off Google Sheets to a direct connection.

This whole `db-tools/` folder is gitignored. Your `.env` (credentials) stays on
your machine only.

## One-time setup

```bash
cd db-tools
npm i pg dotenv
cp .env.example .env
# open .env and paste the values your data team gave you
```

## Explore

```bash
node explore.js                    # list schemas + table counts
node explore.js search gwp         # find tables/columns with "gwp" in the name
node explore.js search premium     # try other keywords: policy, agent, kam, target...
node explore.js tables public      # list tables in a schema
node explore.js columns public.some_table   # see a table's columns + types
node explore.js sample public.some_table 10  # preview 10 rows
```

It only runs SELECT / catalog queries and never prints your password.

## Export the OKR data for the dashboard (Option A: scheduled export)

Source table: `th_datamart.fm_fairdee_okr_2026`.

```bash
cd db-tools
node export-okr.js        # writes ../public/data/okr-2026.json
```

The dashboard's front-end (`fetchOKRData()` in public/script.js) loads that JSON
instead of the Google Sheet. If the JSON is missing/unreachable it automatically
falls back to the old Google Sheet, so nothing breaks.

After a successful export, deploy (deploy does NOT connect to Redshift):

```bash
cd ..
firebase deploy --only hosting
```

## Automating (later)

Move `node export-okr.js` into a GitHub Action on a cron schedule, with the
Redshift creds stored as **repo secrets** (PGHOST/PGPORT/PGDATABASE/PGUSER/
PGPASSWORD). The action exports, commits `public/data/okr-2026.json`, and
deploys — so credentials never live in the browser or in the repo.
