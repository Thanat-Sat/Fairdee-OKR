# Secure OKR data setup (Firestore mirror) — runbook

How the dashboard's OKR numbers are kept **private and free**: a daily GitHub
Action mirrors the Redshift table into a single Firestore document that only
signed-in `@fairdee.co.th` users can read.

```
GitHub Action (daily 09:00 ICT)
  Redshift  ──(read, PG* secrets)──►  export-okr-firestore.js
                                          │ Admin SDK write (FIRESTORE_SA_JSON)
                                          ▼
                         Firestore: okr_data/okr-2026   (fairdee-monthly-metr)
                                          │ read rule: signed-in @fairdee.co.th only
                                          ▼
                         Dashboard reads it as the logged-in user (1 read/load)
```

- Project holding Firestore + Auth: **fairdee-monthly-metr** (see `firebase-config.js`).
- Project holding Hosting: **fairdee-okr**.
- Rule lives in `firestore.rules` (`match /okr_data/{docId}`).
- Writer: `db-tools/export-okr-firestore.js`. Reader: `fetchOKRData()` in `public/script.js`.

---

## 🔐 Golden rules for the service-account key

The service-account JSON contains a **private key**. It is a credential.

- **NEVER** paste it into a chat, an issue, a commit, or a code file.
- **NEVER** commit the JSON. Keep it only as a GitHub **secret**, or a local file
  that is gitignored (`*firebase-adminsdk*.json` and `db-tools/*.json` are ignored).
- If it is ever exposed (shown on screen to anyone, pasted anywhere, emailed):
  **delete that key** in the console and generate a new one. Deleting the key
  invalidates it immediately.

---

## One-time setup

### 1. Create the service-account key (fairdee-monthly-metr)

Firebase Console → make sure the project is **fairdee-monthly-metr** → ⚙️
**Project settings → Service accounts → Generate new private key** → downloads a JSON.

### 2. Add it as a GitHub secret (do NOT open it in an editor you might screen-share)

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `FIRESTORE_SA_JSON` | the entire contents of the downloaded JSON file |
| `PGHOST` `PGPORT` `PGDATABASE` `PGUSER` `PGPASSWORD` | Redshift creds (already added) |

Tip to copy the file contents into your clipboard without opening it:
`pbcopy < ~/Downloads/fairdee-monthly-metr-firebase-adminsdk-*.json` (macOS), then
paste into the secret field, then delete the file.

### 3. Deploy the Firestore rule (once)

```bash
firebase deploy --only firestore:rules --project fairdee-monthly-metr
```

### 4. Deploy the dashboard code

```bash
firebase deploy --only hosting
```

(Safe: the public `okr-2026.json` has been removed, so nothing sensitive is on hosting.)

---

## Run / verify

1. **Actions → "Refresh OKR data from Redshift" → Run workflow.** It should write
   `okr_data/okr-2026`. Green = good.
2. In the Firebase console → Firestore → `okr_data/okr-2026` should show
   `rowCount`, `months`, `rows`.
3. Hard-reload the dashboard **while signed in** with an `@fairdee.co.th` account —
   the OKR numbers load.
4. **Verify it's private:** open the dashboard in a private/incognito window (signed
   out). The OKR section should NOT show numbers. There is no public URL for the data.

---

## Local run (without the Action)

```bash
cd db-tools
npm install
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/sa-monthly-metr.json \
  node export-okr-firestore.js
```

`db-tools/.env` supplies the Redshift creds; the `GOOGLE_APPLICATION_CREDENTIALS`
path points at your service-account JSON (kept out of git).

---

## Troubleshooting

- **Action fails at "Mirror Redshift → Firestore" with a Redshift timeout:** the
  GitHub runner's IP isn't allowed through the Redshift security group. Options:
  ask the data team to allow it, use a self-hosted runner inside the network, or
  switch to the Metabase-API path (`docs/metabase-mirror-playbook.md`).
- **`PERMISSION_DENIED` writing Firestore:** the service account is from the wrong
  project (must be **fairdee-monthly-metr**) or lacks the *Cloud Datastore User* /
  *Firebase Admin* role.
- **Dashboard shows "Sign in… to load OKR data":** expected when signed out — that
  is the access control working. Sign in with `@fairdee.co.th`.
- **Doc missing:** run the workflow at least once to create `okr_data/okr-2026`.

---

## Remaining public exposure to close

- **The OKR Google Sheet is still public** if it was "published to the web."
  Unpublish it: File → Share → Publish to web → Stop publishing.
- **Other dashboard sections** (team-perf, fleet, segmentation, first-transacting)
  still read public Google Sheets. If those numbers are sensitive, migrate them the
  same way (export → Firestore doc → gated read).
