# Template: surface private data in a static web app — secure & free

A reusable pattern for showing **sensitive data** (financials, internal metrics, PII)
in a **static front-end** (Firebase Hosting, GitHub Pages, Netlify, S3, …) **without
leaking it** and **without paying**.

The trap it avoids: dumping the data into a static JSON/CSV the app fetches. Static
files have **no authentication** — anyone with the URL (trivially found in the page's
network tab) can download them. Instead, mirror the data into an **auth-gated data
store** and read it as a signed-in user.

> Copy this file into any project and replace every `<PLACEHOLDER>`. Nothing here is
> tied to a specific app — it's the reusable recipe for "show private data in a static
> site, gated by login, on the free tier."

---

## Fill these in for your project

| Placeholder | Meaning | Example |
|---|---|---|
| `<SOURCE>` | where the private data really lives | Redshift table, Postgres, a REST/BI API |
| `<SOURCE_SECRETS>` | creds to read `<SOURCE>` | `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` |
| `<AUTH_PROJECT>` | Firebase project that has **Auth + Firestore** | `myapp-prod` |
| `<HOSTING_TARGET>` | where the static site is served | `myapp.web.app` |
| `<ALLOWED_DOMAIN>` | who may read (email domain) | `company.com` |
| `<COLLECTION>/<DOC_ID>` | the single Firestore doc holding the snapshot | `app_data/dataset-2026` |
| `<REFRESH_TIME>` | when the mirror runs | daily 09:00 local |

---

## The pattern

```
Scheduled CI job (GitHub Action, cron)
  <SOURCE>  ──(read, <SOURCE_SECRETS>)──►  export script
                                              │ Admin SDK write (service-account secret)
                                              ▼
                        Firestore: <COLLECTION>/<DOC_ID>   (project <AUTH_PROJECT>)
                                              │ read rule: signed-in @<ALLOWED_DOMAIN> only
                                              ▼
                        Static app reads the doc as the logged-in user
```

**Why it's secure:** Firestore security rules are enforced server-side — the client
cannot bypass them. Anonymous visitors and direct-URL hits are denied. No public file
exists.

**Why it's free:** Firestore bills **reads per document**. Store the whole snapshot as
**one document** → **1 read per page load**. The free tier (50k reads/day) covers a
huge amount of internal traffic. The daily write is 1 write/day.

**Constraint:** a Firestore document is capped at **1 MiB**. If the snapshot is larger,
split it across a few docs (e.g. by category/month) and read them together — still a
handful of reads per load.

---

## 🔐 Golden rules for the service-account key

The service-account JSON contains a **private key** — a credential that can write your
data store (often more, depending on its IAM roles).

- **NEVER** paste it into a chat, ticket, commit, or code file.
- **NEVER** commit the JSON. It lives only as a CI **secret**, or a **gitignored** local
  file. Add patterns like `*firebase-adminsdk*.json`, `*serviceaccount*.json`, `sa-*.json`
  to `.gitignore`.
- **If it's ever exposed** (shown on screen, pasted anywhere, emailed): **delete that key**
  in the cloud console and generate a new one. Deletion invalidates it immediately.

---

## Setup

### 1. Security rule (auth-gated read, no client writes)

`firestore.rules` in `<AUTH_PROJECT>`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAllowed() {
      return request.auth != null
        && request.auth.token.email != null
        && request.auth.token.email.matches('.*@<ALLOWED_DOMAIN>$');
    }

    match /<COLLECTION>/{docId} {
      allow read:  if isAllowed();   // signed-in @<ALLOWED_DOMAIN> only
      allow write: if false;         // only the Admin SDK writes (it bypasses rules)
    }
  }
}
```

Deploy: `firebase deploy --only firestore:rules --project <AUTH_PROJECT>`
(or paste into Console → Firestore → Rules).

### 2. Export/mirror script

A small Node script that (a) reads `<SOURCE>`, (b) writes ONE Firestore doc via
`firebase-admin`. Emit values as **strings** if your front-end parser expects
CSV-like cells. Skeleton:

```js
'use strict';
require('dotenv').config();
const admin = require('firebase-admin');
// ... your <SOURCE> client (pg, fetch to an API, etc.)

function initFirestore() {
  const cred = process.env.FIRESTORE_SA_JSON
    ? admin.credential.cert(JSON.parse(process.env.FIRESTORE_SA_JSON)) // CI
    : admin.credential.applicationDefault();                            // local (GOOGLE_APPLICATION_CREDENTIALS)
  admin.initializeApp({ credential: cred });
  return admin.firestore();
}

async function main() {
  const rows = await readFromSource();          // <-- your query / API call
  if (!rows.length) throw new Error('0 rows — refusing to overwrite with empty data');

  const payload = { generatedAt: new Date().toISOString(), rowCount: rows.length, rows };
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > 1_000_000) throw new Error('> 1 MiB — split into multiple docs');

  await initFirestore().collection('<COLLECTION>').doc('<DOC_ID>').set(payload);
  console.log(`Wrote ${rows.length} rows (${bytes} bytes) to <COLLECTION>/<DOC_ID>`);
}
main().catch(e => { console.error(e.message); process.exit(1); });
```

### 3. Front-end read (after auth)

Read the doc **only once the user is signed in** — the rule requires the auth token.
No public-file fallback (that would defeat the gating).

```js
let _loaded = false;
function loadData() {
  const user = auth && auth.currentUser;
  if (!user) { showStatus('Sign in with your @<ALLOWED_DOMAIN> account…'); return; }
  if (_loaded) return;
  db.collection('<COLLECTION>').doc('<DOC_ID>').get()
    .then(s => { if (!s.exists) throw new Error('not found — run the refresh job');
      _loaded = true; render(s.data().rows); })
    .catch(e => showStatus('Could not load: ' + e.message));
}
auth.onAuthStateChanged(u => { if (u) loadData(); });
```

### 4. Service-account key → CI secret

Cloud console (project `<AUTH_PROJECT>`) → **Service Accounts → Generate new private
key** (JSON). Add its contents as CI secret **`FIRESTORE_SA_JSON`** (plus your
`<SOURCE_SECRETS>`). Copy without opening the file:
`pbcopy < ~/Downloads/<AUTH_PROJECT>-*.json` (macOS), paste, then delete the file.

### 5. Scheduled job (GitHub Action)

```yaml
name: Refresh data
on:
  schedule: [{ cron: '0 2 * * *' }]   # adjust to <REFRESH_TIME> in UTC
  workflow_dispatch: {}
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - working-directory: db-tools
        run: npm install --no-audit --no-fund
      - working-directory: db-tools
        env:
          # <SOURCE_SECRETS> here, e.g. PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD
          FIRESTORE_SA_JSON: ${{ secrets.FIRESTORE_SA_JSON }}
        run: node export-<name>-firestore.js
```

Cron is UTC and has no DST — convert `<REFRESH_TIME>` accordingly.

---

## Verify (always do the incognito check)

1. Run the job manually → the doc appears in Firestore.
2. Signed in with `@<ALLOWED_DOMAIN>` → data loads.
3. **Incognito / signed-out → NO data.** This is the whole point. If data shows while
   signed out, the gating is broken — stop and fix the rule.

---

## Troubleshooting

- **CI can't reach `<SOURCE>` (timeout):** the runner's public IP isn't allowlisted.
  Allow it, use a **self-hosted runner** inside the network, or read via an
  internet-reachable API/BI layer that itself connects to the source.
- **`PERMISSION_DENIED` on write:** service account is from the wrong project, or lacks
  *Cloud Datastore User* / *Firebase Admin*.
- **Data shows while signed out:** the rule isn't deployed, or the app still fetches a
  public file — remove every public copy of the data.
- **`> 1 MiB` doc:** split the snapshot across multiple docs.

---

## Don't forget: close the OTHER doors

Securing the app read is not enough if the same data is exposed elsewhere:
- Un-publish any **public Google Sheet / CSV** the data was mirrored from.
- Delete any **previously-deployed public JSON** from hosting.
- Apply the same pattern to **other sections** of the app that still read public sources.
