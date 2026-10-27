// One-computer mode: runs a private PostgreSQL inside ./marqueepro-data and the MarqueePro server on this PC only.
// Works the same on Windows and Linux. Open http://localhost:3000 afterwards. Press Ctrl+C to stop.
import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const root = process.cwd();
const data = path.resolve(process.env.MARQUEE_DATA || path.join(root, 'marqueepro-data'));
const dbDir = path.join(data, 'pg'); const pgPort = Number(process.env.PGPORT || 54329); const webPort = Number(process.env.PORT || 3000);
// Ownership check BEFORE any permission change: only a new or empty folder, a folder carrying our marker, or a recognised earlier MarqueePro data folder is ever touched.
{ const bad = (m) => { console.error(m + ' Nothing was changed. Choose a new or empty folder with MARQUEE_DATA.'); process.exit(1); };
  const home = (await import('node:os')).homedir();
  if (data === path.parse(data).root || data === home || data === root || data === path.dirname(root)) bad(`${data} is not a dedicated MarqueePro data folder.`);
  const marker = path.join(data, '.marqueepro-data'); const exists = fs.existsSync(data);
  if (exists && !fs.statSync(data).isDirectory()) bad(`${data} is not a folder.`);
  if (exists && fs.readdirSync(data).length && !fs.existsSync(marker)) {
    const legacy = fs.existsSync(path.join(data, 'local-secrets.json')) && (fs.existsSync(path.join(data, 'pg', 'PG_VERSION')) || fs.existsSync(path.join(data, 'bootstrap-admin.txt')));
    if (!legacy) bad(`${data} already contains other files and is not a MarqueePro data folder, so its permissions will not be changed.`);
  }
  fs.mkdirSync(data, { recursive: true }); if (!fs.existsSync(marker)) fs.writeFileSync(marker, 'MarqueePro data folder\n'); }
const { protectPath, protectTree } = await import(new URL('file://' + (path.resolve(root, 'dist/src/fsacl.js').startsWith('/') ? '' : '/') + path.resolve(root, 'dist/src/fsacl.js').replace(/\\/g, '/')).href);
// Only this account, SYSTEM and Administrators may open the data folder, the database folder and the password file. Checked on every start; any doubt stops the start (nothing is deleted).
const guard = (f, dir, tree) => { try { tree ? protectTree(f) : protectPath(f, dir, true); } catch (e) { console.error('Cannot protect ' + f + ' so MarqueePro will not start. Nothing was changed or deleted. ' + String(e.message || e)); process.exit(1); } };
guard(data, true);
for (const f of ['dist/src/bootstrap.js', 'apps/web/dist/index.html']) if (!fs.existsSync(path.join(root, f))) { console.error(`Missing ${f}. Run: npm run build:api   and   npm run build:web`); process.exit(1); }

// The two database passwords are made once and kept in the data folder. They never leave this computer.
const secretFile = path.join(data, 'local-secrets.json');
if (fs.existsSync(secretFile) && fs.readFileSync(secretFile, 'utf8').trim() === '') {
  if (fs.existsSync(path.join(dbDir, 'PG_VERSION'))) { console.error(`${secretFile} is empty but a database already exists here, so it was NOT reset (new passwords would not open it). Restore local-secrets.json from a backup of this folder.`); process.exit(1); }
  fs.unlinkSync(secretFile); // empty and no database uses it: a start that stopped halfway; safe to make again
}
if (!fs.existsSync(secretFile)) { const r = () => [...crypto.getRandomValues(new Uint8Array(24))].map((x) => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); const s = JSON.stringify({ admin: r(), app: r() });
  fs.writeFileSync(secretFile, '', { flag: 'wx', mode: 0o600 }); // empty first: the passwords are written only after the file is protected
  try { protectPath(secretFile, false, true); fs.writeFileSync(secretFile, s, { flag: 'r+' }); } catch (e) { try { fs.unlinkSync(secretFile); } catch {} console.error('Cannot protect the password file so none was kept. ' + String(e.message || e)); process.exit(1); } }
guard(secretFile, false); // every start, including files made by older versions
let sec; try { sec = JSON.parse(fs.readFileSync(secretFile, 'utf8')); if (typeof sec?.admin !== 'string' || typeof sec?.app !== 'string' || !sec.admin || !sec.app) throw new Error('missing passwords'); } catch (e) { console.error(`${secretFile} is damaged (${e.message}). It was NOT reset. Restore it from a backup of this folder.`); process.exit(1); }

const server = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: sec.admin, port: pgPort, persistent: true, onLog: process.env.MARQUEE_DEBUG ? (m) => console.log('[pg]', m) : () => {}, onError: process.env.MARQUEE_DEBUG ? (m) => console.error('[pg-err]', m) : () => {} });
const fresh = !fs.existsSync(path.join(dbDir, 'PG_VERSION'));
if (fresh) { fs.mkdirSync(dbDir, { recursive: true }); guard(dbDir, true); await server.initialise(); }
guard(dbDir, true, true); for (const n of ['PG_VERSION', 'postgresql.conf', 'pg_hba.conf', 'postgresql.auto.conf']) if (fs.existsSync(path.join(dbDir, n))) guard(path.join(dbDir, n), false);
await server.start();
const adminUrl = `postgresql://postgres:${sec.admin}@127.0.0.1:${pgPort}/marquee`;
if (fresh) await server.createDatabase('marquee');
const c = new pg.Client({ connectionString: adminUrl }); await c.connect();
const has = await c.query("SELECT 1 FROM pg_roles WHERE rolname='marquee_app'");
if (!has.rowCount) await c.query(`CREATE ROLE marquee_app LOGIN PASSWORD '${sec.app}' NOSUPERUSER NOBYPASSRLS`);
await c.end();
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: root, env: { ...process.env, DATABASE_URL: adminUrl }, stdio: 'inherit' });

process.env.DATABASE_URL = `postgresql://marquee_app:${sec.app}@127.0.0.1:${pgPort}/marquee`;
process.env.DATA_DIR = data; process.env.BACKUP_DIR ||= path.join(data, 'backups');
const { createApp, ensureSuperAdmin } = await import(pathToUrl(path.join(root, 'dist/src/bootstrap.js')));
const { PrismaService } = await import(pathToUrl(path.join(root, 'dist/src/infra.js')));
const app = await createApp({ webDir: path.join(root, 'apps/web/dist') }); await ensureSuperAdmin(app.get(PrismaService));
await app.listen(webPort, '127.0.0.1');
console.log(`\nMarqueePro is running: http://localhost:${webPort}\nYour data folder: ${data}\nFirst start: the platform admin password is in ${path.join(data, 'bootstrap-admin.txt')}\nPress Ctrl+C to stop.`);
const stop = async () => { try { await app.close(); await server.stop(); } finally { process.exit(0); } };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
function pathToUrl(p) { return new URL('file://' + (p.startsWith('/') ? '' : '/') + p.replace(/\\/g, '/')).href; }
