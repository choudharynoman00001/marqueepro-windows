// Windows proof script (NOT yet run anywhere). Intended for ONE manual run on a Windows runner, after the source is frozen.
// It checks, on real NTFS: folder/file/database-tree permissions, the integration key file, a second local account being refused,
// a restart that re-verifies, and the refusal to reset an empty password file when a database exists.
// It uses only synthetic data in C:\mqproof. It never contacts any provider. Output: win-proof-result.json (exit code 1 if any check fails).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
if (process.platform !== 'win32') { console.error('This proof only means something on Windows.'); process.exit(2); }
if (process.env.GITHUB_ACTIONS !== 'true') { console.error('This proof only runs inside the dedicated CI workflow (it creates and deletes a local account and a folder).'); process.exit(2); }
const root = process.cwd(); const base = 'C:\\mqproof'; const data = path.join(base, 'data'); const MARK = path.join(base, '.mqproof-owned');
const toUrl = (p) => new URL('file:///' + path.resolve(p).replace(/\\/g, '/')).href;
const { sddlUnexpectedSids } = await import(toUrl(path.join(root, 'dist/src/fsacl.js')));
const sys = process.env.SystemRoot || 'C:\\Windows'; const ICACLS = path.join(sys, 'System32', 'icacls.exe'); const WHOAMI = path.join(sys, 'System32', 'whoami.exe');
const PROBE = 'mqp' + Math.random().toString(16).slice(2, 10); const PW = 'Mq!' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + 'Zz9';
// Nothing printed or stored may contain the temporary password or a connection string.
const clean = (t) => String(t ?? '').split(PW).join('[pw]').replace(/postgres(ql)?:\/\/\S+/g, '[db-url]').replace(/\s+/g, ' ').slice(0, 200);
const results = []; const check = (name, ok, detail = '') => { const d = clean(detail); results.push({ name, ok: !!ok, detail: d }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (d ? ' - ' + d : '')); };
const run = (exe, args, o = {}) => spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, ...o });
const me = run(WHOAMI, ['/user', '/fo', 'csv', '/nh']).stdout.trim().split(',')[1]?.replace(/"/g, '').trim();
check('own account SID found', /^S-1-5-/.test(me || ''), me);
const allowed = [me, 'S-1-5-18', 'S-1-5-32-544'];
if (fs.existsSync(base)) { if (!fs.existsSync(MARK)) { console.error('C:\\mqproof exists and was not created by this proof. Nothing was changed.'); process.exit(2); } fs.rmSync(base, { recursive: true, force: true }); }
fs.mkdirSync(base, { recursive: true }); fs.writeFileSync(MARK, 'created by win-proof.mjs\n');
let created = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res) => { http.get(u, (r) => { r.resume(); res(r.statusCode); }).on('error', () => res(0)); });
let child = null; let log = '';
async function start(label) {
  log = ''; child = spawn(process.execPath, ['scripts/local.mjs'], { cwd: root, env: { ...process.env, MARQUEE_DATA: data, PORT: '3911', PGPORT: '54911' }, windowsHide: true });
  child.stdout.on('data', (d) => (log += d)); child.stderr.on('data', (d) => (log += d));
  const t0 = Date.now(); while (Date.now() - t0 < 240000) { if (/MarqueePro is running/.test(log)) break; if (child.exitCode !== null) break; await sleep(1000); }
  const up = /MarqueePro is running/.test(log); check(label + ': launcher started', up, up ? '' : log.slice(-200)); return up;
}
function stop() { if (child && child.exitCode === null) run('taskkill', ['/PID', String(child.pid), '/T', '/F']); child = null; }
function aclCheck(label, target, tree) {
  const out = path.join(base, 'acl-' + Math.random().toString(16).slice(2) + '.txt'); const r = run(ICACLS, [target, '/save', out, ...(tree ? ['/T', '/C'] : [])]);
  if (r.status !== 0 || !fs.existsSync(out)) return check(label, false, 'icacls failed ' + (r.stderr || r.stdout));
  const txt = fs.readFileSync(out, 'utf16le').includes('D:') ? fs.readFileSync(out, 'utf16le') : fs.readFileSync(out, 'utf8'); const lines = txt.split(/\r?\n/).filter((l) => /^D:/.test(l));
  const bad = lines.flatMap((l) => sddlUnexpectedSids(l, allowed));
  check(label, lines.length > 0 && bad.length === 0, `${lines.length} entries read, unexpected trustees: ${[...new Set(bad)].join(' ') || 'none'}`); if (tree) check(label + ' (covers many entries)', lines.length >= 20, lines.length);
}
async function stateChecks(tag) {
  aclCheck(tag + ': data folder', data, false); aclCheck(tag + ': local-secrets.json', path.join(data, 'local-secrets.json'), false); aclCheck(tag + ': database folder, every entry', path.join(data, 'pg'), true);
  check(tag + ': web answers', (await get('http://127.0.0.1:3911/')) === 200);
}
try {
  if (await start('first start')) {
    await stateChecks('first start');
    // key file: created through the real sealing code with DATA_DIR on this folder
    const sealer = run(process.execPath, ['-e', `import(${JSON.stringify(toUrl(path.join(root, 'dist/src/integrations.js')))}).then(m=>{const s=m.seal({x:1},'a');console.log(s.length>10?'sealed':'no')})`], { env: { ...process.env, DATA_DIR: data, NODE_ENV: 'production' } });
    check('integration key file created by real code', /sealed/.test(sealer.stdout) && fs.existsSync(path.join(data, 'integration.key')), 'exit ' + sealer.status);
    aclCheck('integration.key', path.join(data, 'integration.key'), false);
    // a second local account must be refused. Exit 3 means EACCES/EPERM only; any other failure is exit 4 and fails the check, and the target must exist.
    const exists = (await Promise.resolve([path.join(data, 'local-secrets.json'), path.join(data, 'integration.key'), path.join(data, 'bootstrap-admin.txt')])).map((f) => [f, fs.existsSync(f)]);
    for (const [f, ok] of exists) check('target exists: ' + path.basename(f), ok);
    aclCheck('bootstrap-admin.txt', path.join(data, 'bootstrap-admin.txt'), false);
    const pre = run('net', ['user', PROBE]); check('probe account name unused before this run', pre.status !== 0);
    if (pre.status !== 0) {
      const add = run('net', ['user', PROBE, PW, '/add']); created = add.status === 0; check('second local account created', created, 'exit ' + add.status);
      if (created) {
        fs.writeFileSync(path.join(base, 'control.txt'), 'readable control\n');
        fs.writeFileSync(path.join(base, 'probe.js'), "const fs=require('fs');try{if(process.argv[3]==='dir')fs.readdirSync(process.argv[2]);else fs.readFileSync(process.argv[2]);process.exit(0)}catch(e){process.exit(e.code==='EACCES'||e.code==='EPERM'?3:4)}\n");
        const asProbe = (file, mode = 'file') => { const ps = "$p=ConvertTo-SecureString $env:MQ_PW -AsPlainText -Force; $c=New-Object System.Management.Automation.PSCredential('.\\' + $env:MQ_USER,$p); $pr=Start-Process -FilePath $env:MQ_NODE -ArgumentList @($env:MQ_PROBE,$env:MQ_FILE,$env:MQ_MODE) -Credential $c -WorkingDirectory $env:MQ_DIR -PassThru -Wait -WindowStyle Hidden -LoadUserProfile; exit $pr.ExitCode"; return run('powershell', ['-NoProfile', '-Command', ps], { env: { ...process.env, MQ_PW: PW, MQ_USER: PROBE, MQ_NODE: process.execPath, MQ_PROBE: path.join(base, 'probe.js'), MQ_FILE: file, MQ_MODE: mode, MQ_DIR: base } }); };
        const ctl = asProbe(path.join(base, 'control.txt')); check('control file readable by the second account', ctl.status === 0, 'exit ' + ctl.status);
        for (const f of ['local-secrets.json', 'integration.key', 'bootstrap-admin.txt']) { const r = asProbe(path.join(data, f)); check(f + ' refused to the second account (EACCES/EPERM)', r.status === 3, 'exit ' + r.status); }
        const dd = asProbe(data, 'dir'); check('data folder listing refused to the second account (EACCES/EPERM)', dd.status === 3, 'exit ' + dd.status); const pd = asProbe(path.join(data, 'pg'), 'dir'); check('database folder listing refused to the second account (EACCES/EPERM)', pd.status === 3, 'exit ' + pd.status);
        const d = asProbe(path.join(data, 'pg', 'PG_VERSION')); check('database folder file refused to the second account (EACCES/EPERM)', d.status === 3, 'exit ' + d.status);
      }
    }
    stop(); await sleep(5000);
    if (await start('restart')) { await stateChecks('restart'); }
    stop(); await sleep(5000);
    // empty password file while a database exists: must refuse and must not reset it
    const sf = path.join(data, 'local-secrets.json'); const keep = fs.readFileSync(sf, 'utf8'); fs.writeFileSync(sf, '');
    const t = spawnSync(process.execPath, ['scripts/local.mjs'], { cwd: root, encoding: 'utf8', timeout: 120000, env: { ...process.env, MARQUEE_DATA: data, PORT: '3911', PGPORT: '54911' } });
    check('empty password file with a database: start refused', t.status !== 0 && /NOT reset/.test(t.stdout + t.stderr), `exit ${t.status}`); check('empty password file left empty (not reset)', fs.readFileSync(sf, 'utf8') === '');
    fs.writeFileSync(sf, keep);
  }
} catch (e) { check('script error', false, e.message || e); } finally { stop(); if (created) { const del = run('net', ['user', PROBE, '/delete']); if (del.status !== 0) console.log('WARNING: could not delete the temporary account ' + PROBE + '; the runner is discarded after the job.'); } }
fs.writeFileSync('win-proof-result.json', JSON.stringify({ when: new Date().toISOString(), node: process.version, os: process.env.OS, note: 'Hosted runner accounts are administrators: this proof does not claim protection from administrators.', results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
