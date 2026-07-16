#!/usr/bin/env node
/* ============================================================================
   Export the OKR data from Redshift to a static JSON the dashboard can fetch.

   Replaces the Google-Sheet CSV source. Reads the SAME columns the front-end
   already understands (see resolveColumns() in public/script.js), aliasing
   target_value -> monthly_target and formatting the month as ISO (YYYY-MM-DD).

   All values are emitted as STRINGS so the front-end behaves byte-for-byte like
   the old PapaParse(CSV) path (where every cell is a string, and "0" is truthy).

   USAGE:
     cd db-tools
     npm i pg dotenv        # one-time (same as explore.js)
     node export-okr.js     # writes ../public/data/okr-2026.json

   Then commit + deploy (deploy does NOT touch Redshift):
     firebase deploy --only hosting
   ============================================================================ */
'use strict';

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'public', 'data', 'okr-2026.json');
const SOURCE_TABLE = 'th_datamart.fm_fairdee_okr_2026';

const SQL = `
    SELECT goal_name,
           objective_name,
           kr_name,
           kr_topic_name,
           kr_title_name,
           kr_owner_name,
           ultimate_target_number,
           unit_name,
           TO_CHAR(monthly_baseline_month, 'YYYY-MM-DD') AS monthly_baseline_month,
           result_number,
           target_value AS monthly_target
      FROM ${SOURCE_TABLE}
     -- Only months up to and including the current month. The table carries
     -- placeholder rows for future months (e.g. Aug/Dec with tiny values); those
     -- would otherwise make the month selector default to a future month.
     WHERE monthly_baseline_month <= DATE_TRUNC('month', CURRENT_DATE)
`;

const cfg = {
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5439', 10),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: (process.env.PGSSL || 'require').toLowerCase() === 'disable'
        ? false
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
};

function requireEnv() {
    const missing = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].filter(k => !process.env[k]);
    if (missing.length) {
        console.error('Missing in .env: ' + missing.join(', ') + ' (copy .env.example to .env).');
        process.exit(1);
    }
}

// Stringify every value exactly like a CSV cell: null/undefined -> '', else String(v).
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
    const client = new Client(cfg);
    try {
        await client.connect();
    } catch (e) {
        console.error('Connection failed: ' + e.message);
        console.error('Check host/port/SSL and that your IP is allowed in the Redshift security group.');
        process.exit(1);
    }

    try {
        console.log(`Querying ${SOURCE_TABLE} ...`);
        const res = await client.query(SQL);
        const rows = res.rows.map(toStringRow);

        // Quick sanity summary so a bad export is obvious before deploying.
        const monthlyRows = rows.filter(r => /(^|\s)in monthly$/i.test((r.unit_name || '').trim())
            || /gwp in monthly/i.test(r.unit_name || ''));
        const months = Array.from(new Set(rows.map(r => r.monthly_baseline_month).filter(Boolean))).sort();

        const payload = {
            source: SOURCE_TABLE,
            generatedAt: new Date().toISOString(),
            rowCount: rows.length,
            months: months,
            rows: rows,
        };

        fs.mkdirSync(path.dirname(OUT), { recursive: true });
        fs.writeFileSync(OUT, JSON.stringify(payload));

        console.log(`✓ Wrote ${rows.length} rows to ${OUT}`);
        console.log(`  months: ${months.join(', ') || '(none)'}`);
        console.log(`  'GWP in monthly'-ish rows: ${monthlyRows.length}`);
        if (!rows.length) console.warn('  WARNING: 0 rows — the dashboard would be empty.');
    } catch (e) {
        console.error('Query/write failed: ' + e.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main();
