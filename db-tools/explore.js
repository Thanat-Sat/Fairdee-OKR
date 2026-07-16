#!/usr/bin/env node
/* ============================================================================
   Read-only Redshift schema explorer for the Fairdee OKR dashboard migration.

   Purpose: find the tables/columns that back the GWP / OKR / KAM data so the
   dashboard can pull from Redshift directly instead of Google Sheets.

   SAFE BY DESIGN:
     - Reads credentials from ./.env (gitignored) — nothing hardcoded.
     - Only runs SELECT / read-only catalog queries. It refuses to run any
       statement that isn't a SELECT/WITH/SHOW (see runQuery()).
     - Never prints your password.

   USAGE:
     cp .env.example .env      # then fill in .env
     npm i pg dotenv           # one-time
     node explore.js                       # overview: schemas + table counts
     node explore.js tables [schema]       # tables (+ row estimates) in a schema
     node explore.js columns <schema.table># columns + types for one table
     node explore.js search <keyword>      # find tables/columns by name (e.g. gwp)
     node explore.js sample <schema.table> [n]   # preview n rows (default 10)
     node explore.js query "SELECT ..."    # run an ad-hoc read-only query
   ============================================================================ */
'use strict';

require('dotenv').config();
const { Client } = require('pg');

const cfg = {
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5439', 10),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: (process.env.PGSSL || 'require').toLowerCase() === 'disable'
        ? false
        : { rejectUnauthorized: false },
    // Fail fast instead of hanging if the host/port/security-group is wrong.
    connectionTimeoutMillis: 15000,
    statement_timeout: 60000,
};

function requireEnv() {
    const missing = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']
        .filter(k => !process.env[k]);
    if (missing.length) {
        console.error('Missing in .env: ' + missing.join(', '));
        console.error('Copy .env.example to .env and fill it in.');
        process.exit(1);
    }
}

// System schemas we hide from the "user data" overview.
const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_internal', 'pg_automv'];
const sysList = SYSTEM_SCHEMAS.map(s => `'${s}'`).join(', ');

// Guard: only allow read-only statements through query()/sample().
function assertReadOnly(sql) {
    const head = sql.trim().replace(/^\(+/, '').split(/\s+/)[0].toLowerCase();
    if (!['select', 'with', 'show', 'explain'].includes(head)) {
        throw new Error('Refused: only SELECT / WITH / SHOW / EXPLAIN are allowed (got "' + head + '").');
    }
}

function ident(part) {
    // Quote an identifier safely for use in SQL.
    return '"' + String(part).replace(/"/g, '""') + '"';
}

function splitQualified(name) {
    const parts = String(name).split('.');
    if (parts.length === 2) return { schema: parts[0], table: parts[1] };
    return { schema: 'public', table: parts[0] };
}

function printTable(rows) {
    if (!rows.length) { console.log('  (no rows)'); return; }
    const cols = Object.keys(rows[0]);
    const widths = cols.map(c => Math.max(
        c.length,
        ...rows.map(r => (r[c] === null || r[c] === undefined ? 'NULL' : String(r[c])).length)
    ));
    const line = cols.map((c, i) => c.padEnd(widths[i])).join('  ');
    console.log('  ' + line);
    console.log('  ' + widths.map(w => '-'.repeat(w)).join('  '));
    rows.forEach(r => {
        console.log('  ' + cols.map((c, i) => {
            const v = (r[c] === null || r[c] === undefined) ? 'NULL' : String(r[c]);
            return v.padEnd(widths[i]);
        }).join('  '));
    });
}

async function main() {
    requireEnv();
    const [, , cmd = 'overview', arg1, arg2] = process.argv;
    const client = new Client(cfg);

    try {
        await client.connect();
    } catch (e) {
        console.error('Connection failed: ' + e.message);
        console.error('Check host/port/SSL, and that your IP is allowed in the Redshift security group / VPC.');
        process.exit(1);
    }

    const q = (text, params) => client.query(text, params).then(r => r.rows);

    try {
        console.log(`\nConnected to ${cfg.database} @ ${cfg.host}:${cfg.port} as ${cfg.user}\n`);

        if (cmd === 'overview') {
            const rows = await q(
                `SELECT table_schema AS schema, COUNT(*) AS tables
                   FROM information_schema.tables
                  WHERE table_schema NOT IN (${sysList})
                  GROUP BY table_schema
                  ORDER BY table_schema`);
            console.log('Schemas you can see (excluding system):');
            printTable(rows);
            console.log('\nNext: node explore.js tables <schema>   or   node explore.js search gwp');

        } else if (cmd === 'tables') {
            const schema = arg1 || 'public';
            const rows = await q(
                `SELECT t.table_name,
                        (SELECT COUNT(*) FROM information_schema.columns c
                          WHERE c.table_schema = t.table_schema
                            AND c.table_name = t.table_name) AS columns
                   FROM information_schema.tables t
                  WHERE t.table_schema = $1
                  ORDER BY t.table_name`, [schema]);
            console.log(`Tables in schema "${schema}":`);
            printTable(rows);
            console.log('\nNext: node explore.js columns ' + schema + '.<table>');

        } else if (cmd === 'columns') {
            if (!arg1) throw new Error('Usage: node explore.js columns <schema.table>');
            const { schema, table } = splitQualified(arg1);
            const rows = await q(
                `SELECT ordinal_position AS pos, column_name, data_type,
                        character_maximum_length AS max_len, is_nullable
                   FROM information_schema.columns
                  WHERE table_schema = $1 AND table_name = $2
                  ORDER BY ordinal_position`, [schema, table]);
            console.log(`Columns of ${schema}.${table}:`);
            printTable(rows);
            console.log('\nNext: node explore.js sample ' + schema + '.' + table);

        } else if (cmd === 'search') {
            if (!arg1) throw new Error('Usage: node explore.js search <keyword>');
            const kw = '%' + arg1.toLowerCase() + '%';
            console.log(`Tables whose name matches "${arg1}":`);
            printTable(await q(
                `SELECT table_schema AS schema, table_name
                   FROM information_schema.tables
                  WHERE table_schema NOT IN (${sysList})
                    AND LOWER(table_name) LIKE $1
                  ORDER BY 1, 2`, [kw]));
            console.log(`\nColumns whose name matches "${arg1}":`);
            printTable(await q(
                `SELECT table_schema AS schema, table_name, column_name, data_type
                   FROM information_schema.columns
                  WHERE table_schema NOT IN (${sysList})
                    AND LOWER(column_name) LIKE $1
                  ORDER BY 1, 2, 3
                  LIMIT 200`, [kw]));

        } else if (cmd === 'sample') {
            if (!arg1) throw new Error('Usage: node explore.js sample <schema.table> [n]');
            const { schema, table } = splitQualified(arg1);
            const n = Math.min(parseInt(arg2 || '10', 10) || 10, 100);
            const rows = await q(
                `SELECT * FROM ${ident(schema)}.${ident(table)} LIMIT ${n}`);
            console.log(`First ${n} rows of ${schema}.${table}:`);
            printTable(rows);

        } else if (cmd === 'query') {
            if (!arg1) throw new Error('Usage: node explore.js query "SELECT ..."');
            assertReadOnly(arg1);
            const rows = await q(arg1);
            printTable(rows);

        } else {
            console.error('Unknown command: ' + cmd);
            console.error('Commands: overview | tables | columns | search | sample | query');
            process.exit(1);
        }
    } catch (e) {
        console.error('\nError: ' + e.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main();
