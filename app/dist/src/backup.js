"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.packSnapshot = void 0;
exports.backupDb = backupDb;
exports.unpackSnapshot = unpackSnapshot;
exports.verifySnapshot = verifySnapshot;
exports.restoreDb = restoreDb;
const pg_1 = require("pg");
const node_crypto_1 = require("node:crypto");
const node_zlib_1 = require("node:zlib");
const q = (n) => '"' + n.replace(/"/g, '""') + '"';
const sum = (tables, migrations) => (0, node_crypto_1.createHash)('sha256').update(JSON.stringify({ migrations, tables })).digest('hex');
async function tableNames(c) { return (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows.map((r) => r.tablename); }
async function migrationNames(c) { return (await c.query("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name")).rows.map((r) => r.migration_name); }
async function backupDb(adminUrl) {
    const c = new pg_1.Client({ connectionString: adminUrl });
    await c.connect();
    try {
        await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); // one consistent view of every table
        const tables = {}, counts = {};
        for (const t of await tableNames(c)) {
            tables[t] = (await c.query(`SELECT row_to_json(x) AS r FROM ${q(t)} x ORDER BY row_to_json(x)::text`)).rows.map((r) => r.r);
            counts[t] = tables[t].length;
        }
        const migrations = await migrationNames(c);
        await c.query('COMMIT');
        return { format: 'marqueepro-backup-v1', created_at: new Date().toISOString(), migrations, counts, tables, checksum: sum(tables, migrations) };
    }
    finally {
        await c.end();
    }
}
const packSnapshot = (s) => (0, node_zlib_1.gzipSync)(Buffer.from(JSON.stringify(s)));
exports.packSnapshot = packSnapshot;
function unpackSnapshot(buf) { const s = JSON.parse((0, node_zlib_1.gunzipSync)(buf).toString('utf8')); verifySnapshot(s); return s; }
function verifySnapshot(s) {
    if (s.format !== 'marqueepro-backup-v1')
        throw new Error('Not a MarqueePro backup');
    if (sum(s.tables, s.migrations) !== s.checksum)
        throw new Error('Backup checksum mismatch: file is damaged or was edited');
    for (const [t, n] of Object.entries(s.counts))
        if (s.tables[t]?.length !== n)
            throw new Error(`Backup row count mismatch for ${t}`);
}
/** Restore into an EMPTY, freshly migrated database. Refuses anything else. Returns the per-table counts it verified after the restore. */
async function restoreDb(adminUrl, s) {
    verifySnapshot(s);
    const c = new pg_1.Client({ connectionString: adminUrl });
    await c.connect();
    try {
        const mig = await migrationNames(c);
        if (JSON.stringify(mig) !== JSON.stringify(s.migrations))
            throw new Error('Target database schema version differs from the backup (run the same migrations first)');
        const names = await tableNames(c);
        for (const t of names)
            if (Number((await c.query(`SELECT COUNT(*) n FROM ${q(t)}`)).rows[0].n) > 0)
                throw new Error(`Target database is not empty (${t}); restore only into a fresh database`);
        for (const t of Object.keys(s.tables))
            if (!names.includes(t))
                throw new Error(`Target is missing table ${t}`);
        await c.query('BEGIN');
        await c.query("SET LOCAL session_replication_role = 'replica'"); // load in any order; constraints are re-verified below
        for (const [t, rows] of Object.entries(s.tables))
            if (rows.length)
                await c.query(`INSERT INTO ${q(t)} SELECT * FROM json_populate_recordset(null::${q(t)}, $1::json)`, [JSON.stringify(rows)]);
        for (const t of names) {
            if (!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='id'", [t])).rowCount)
                continue;
            const seq = (await c.query('SELECT pg_get_serial_sequence($1, $2) s', [q(t), 'id'])).rows[0]?.s;
            if (seq)
                await c.query(`SELECT setval($1, COALESCE((SELECT MAX(id) FROM ${q(t)}), 0) + 1, false)`, [seq]);
        }
        const out = {};
        for (const [t, n] of Object.entries(s.counts)) {
            const got = Number((await c.query(`SELECT COUNT(*) n FROM ${q(t)}`)).rows[0].n);
            if (got !== n)
                throw new Error(`Restore verification failed for ${t}: ${got} != ${n}`);
            out[t] = got;
        }
        // referential integrity check for every foreign key (replica mode skipped it during load)
        const fks = (await c.query("SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace")).rows;
        for (const fk of fks)
            await c.query(`ALTER TABLE ${fk.tbl} VALIDATE CONSTRAINT ${q(fk.conname)}`);
        await c.query('COMMIT');
        return out;
    }
    catch (e) {
        await c.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        await c.end();
    }
}
//# sourceMappingURL=backup.js.map