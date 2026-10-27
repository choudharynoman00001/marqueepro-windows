"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBackupOnce = runBackupOnce;
exports.startBackupSchedule = startBackupSchedule;
const infra_1 = require("./infra");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const backup_1 = require("./backup");
/** Write one verified snapshot file into `dir`, then delete the oldest beyond `keep`. Returns the new file name. */
async function runBackupOnce(adminUrl, dir, keep, now = new Date()) {
    node_fs_1.default.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const buf = (0, backup_1.packSnapshot)(await (0, backup_1.backupDb)(adminUrl));
    const file = `marqueepro-${now.toISOString().replace(/[:.]/g, '-')}.json.gz`;
    const tmp = node_path_1.default.join(dir, file + '.part');
    node_fs_1.default.writeFileSync(tmp, buf, { mode: 0o600 });
    node_fs_1.default.renameSync(tmp, node_path_1.default.join(dir, file));
    const all = node_fs_1.default.readdirSync(dir).filter((f) => /^marqueepro-.*\.json\.gz$/.test(f)).sort();
    const removed = all.slice(0, Math.max(0, all.length - Math.max(1, keep)));
    for (const f of removed)
        node_fs_1.default.unlinkSync(node_path_1.default.join(dir, f));
    return { file, bytes: buf.length, sha256: node_crypto_1.default.createHash('sha256').update(buf).digest('hex'), removed };
}
/** Start the schedule only when BACKUP_DIR and MIGRATE_DATABASE_URL are set. A failed run is logged and retried at the next interval; it never stops the server. */
function startBackupSchedule(env = process.env) {
    const dir = env.BACKUP_DIR, url = env.MIGRATE_DATABASE_URL;
    if (!dir || !url) {
        console.log('Scheduled backups are OFF (set BACKUP_DIR and MIGRATE_DATABASE_URL to turn them on)');
        return null;
    }
    const hours = Math.max(1, Number(env.BACKUP_INTERVAL_HOURS) || 24), keep = Math.max(1, Number(env.BACKUP_KEEP) || 14);
    infra_1.opStats.backupScheduled = true;
    infra_1.opStats.backupIntervalHours = hours;
    const tick = () => runBackupOnce(url, dir, keep).then((r) => { infra_1.opStats.backupOkAt = new Date().toISOString(); console.log('backup ok', r.file, r.bytes, 'bytes', r.sha256); }, (e) => { infra_1.opStats.backupFailedAt = new Date().toISOString(); console.error('backup FAILED', e.message); });
    void tick();
    const t = setInterval(tick, hours * 3600_000);
    t.unref();
    return t;
}
//# sourceMappingURL=backupJob.js.map