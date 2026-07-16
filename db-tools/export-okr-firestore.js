#!/usr/bin/env node
/* ============================================================================
   Mirror the OKR data from Redshift into Firestore (secure, free).

   Reads th_datamart.fm_fairdee_okr_2026 and writes ONE Firestore document:
     okr_data/okr-2026  = { source, generatedAt, rowCount, months, rows: [...] }

   Why one document: Firestore bills reads per-document, so the dashboard reads
   the whole dataset in a single read (well within the free tier), and the rows
   are protected by security rules (only signed-in @fairdee.co.th users can read;
   nobody can write from the client — this Admin SDK bypasses the rules).

   ENV:
     Redshift:  PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD [PGSSL]
     Firestore: FIRESTORE_SA_JSON  (the fairdee-monthly-metr service-account JSON,
                                     as a single-line string)  -- OR --
                GOOGLE_APPLICATION_CREDENTIALS (path to that JSON file, for local)

   USAGE (local):
     cd db-tools && npm install
     GOOGLE_APPLICATION_CREDENTIALS=./sa-monthly-metr.json node export-okr-firestore.js
   ============================================================================ */
'use strict';

require('dotenv').config();
const { Client } = require('pg');
const admin = require('firebase-admin');

const SOURCE_TABLE = 'th_datamart.fm_fairdee_okr_2026';
const DOC_COLLECTION = 'okr_data';
const DOC_ID = 'okr-2026';

const SQL = `
    SELECT goal_name, objective_name, kr_name, kr_topic_name, kr_title_name,
           kr_owner_name, ultimate_target_number, unit_name,
           TO_CHAR(monthly_baseline_month, 'YYYY-MM-DD') AS monthly_baseline_month,
           result_number, target_value AS monthly_target
      FROM ${SOURCE_TABLE}
     WHERE monthly_baseline_month <= DATE_TRUNC('month', CURRENT_DATE)
`;

const pgCfg = {
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5439', 10),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: (process.env.PGSSL || 'require').toLowerCase() === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
};

function requireEnv() {
    const miss = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].filter(k => !process.env[k]);
    if (miss.length) { console.error('Missing Redshift env: ' + miss.join(', ')); process.exit(1); }
    if (!process.env.FIRESTORE_SA_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.error('Missing Firestore creds: set FIRESTORE_SA_JSON or GOOGLE_APPLICATION_CREDENTIALS.');
        process.exit(1);
    }
}

function initFirestore() {
    let credential;
    if (process.env.FIRESTORE_SA_JSON) {
        credential = admin.credential.cert(JSON.parse(process.env.FIRESTORE_SA_JSON));
    } else {
        credential = admin.credential.applicationDefault(); // uses GOOGLE_APPLICATION_CREDENTIALS
    }
    admin.initializeApp({ credential });
    return admin.firestore();
}

// Stringify every value exactly like a CSV cell (null -> '', else String(v)).
function toStringRow(row) {
    const out = {};
    for (const key of Object.keys(row)) {
        const v = row[key];
        out[key] = (v === null || v === undefined) ? '' : String(v);
    }
    return out;
}

async function main() {
    requireEnv();

    const client = new Client(pgCfg);
    try {
        await client.connect();
    } catch (e) {
        console.error('Redshift connection failed: ' + e.message);
        process.exit(1);
    }

    let rows, months;
    try {
        console.log(`Querying ${SOURCE_TABLE} ...`);
        const res = await client.query(SQL);
        rows = res.rows.map(toStringRow);
        months = Array.from(new Set(rows.map(r => r.monthly_baseline_month).filter(Boolean))).sort();
        if (!rows.length) throw new Error('0 rows returned — refusing to overwrite with empty data');
    } catch (e) {
        console.error('Query failed: ' + e.message);
        await client.end();
        process.exit(1);
    } finally {
        await client.end();
    }

    const fsdb = initFirestore();
    const payload = {
        source: SOURCE_TABLE,
        generatedAt: new Date().toISOString(),
        rowCount: rows.length,
        months: months,
        rows: rows,
    };

    // Guard against the 1 MiB/document limit (rows are ~160 KB today).
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (bytes > 1000000) {
        console.error(`Payload is ${bytes} bytes (> ~1 MB Firestore doc limit). Split into multiple docs.`);
        process.exit(1);
    }

    await fsdb.collection(DOC_COLLECTION).doc(DOC_ID).set(payload);
    console.log(`✓ Wrote ${rows.length} rows (${bytes} bytes) to ${DOC_COLLECTION}/${DOC_ID}`);
    console.log(`  months: ${months.join(', ')}`);
    process.exit(0);
}

main().catch(e => { console.error('Failed: ' + e.message); process.exit(1); });
