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

## Mirror the OKR data into Firestore (secure + free)

Source table: `th_datamart.fm_fairdee_okr_2026`.

The dashboard reads OKR data from a single **Firestore** document
`okr_data/okr-2026` in the **fairdee-monthly-metr** project. Firestore security
rules only allow signed-in `@fairdee.co.th` users to read it, so the numbers are
NOT published to any public file. (One document = one Firestore read per page load
= comfortably inside the free tier.)

`export-okr-firestore.js` reads Redshift and writes that document via the Admin
SDK (which bypasses the client rules).

Local run:

```bash
cd db-tools
npm install
# Service account for the fairdee-monthly-metr project (Firebase console →
# Project settings → Service accounts → Generate new private key):
GOOGLE_APPLICATION_CREDENTIALS=./sa-monthly-metr.json node export-okr-firestore.js
```

Keep the service-account JSON OUT of git (it's a credential). The `db-tools/.env`
still holds the Redshift creds.

## Automated (GitHub Action)

`.github/workflows/refresh-okr-data.yml` runs `export-okr-firestore.js` daily at
09:00 ICT (02:00 UTC) and on manual dispatch. Repo secrets required:

- Redshift: `PGHOST` `PGPORT` `PGDATABASE` `PGUSER` `PGPASSWORD`
- Firestore: `FIRESTORE_SA_JSON` — the fairdee-monthly-metr service-account JSON,
  pasted as a single secret value.

No data or credentials are ever committed or published to hosting.

## Deploy the Firestore rules (once)

```bash
firebase deploy --only firestore:rules --project fairdee-monthly-metr
```

(or paste `firestore.rules` into Firebase console → Firestore → Rules.)
