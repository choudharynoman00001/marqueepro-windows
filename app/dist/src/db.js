"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Db = void 0;
// Thin async SQL helper over a Prisma interactive transaction. All domain SQL is parameterised (never string-built from input).
const NO_ID = /^\s*INSERT\s+INTO\s+(counters|sessions|tenant_logos|tenant_integrations)\b/i;
function toPg(sql) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); }
function norm(v) {
    if (typeof v === 'bigint')
        return Number(v);
    if (v instanceof Date)
        return v.toISOString().slice(0, 16);
    if (v && typeof v === 'object' && typeof v.toNumber === 'function')
        return v.toNumber();
    return v;
}
const normRow = (r) => { const o = {}; for (const k of Object.keys(r))
    o[k] = norm(r[k]); return o; };
class Db {
    tx;
    constructor(tx) {
        this.tx = tx;
    }
    async all(sql, ...p) {
        const rows = await this.tx.$queryRawUnsafe(toPg(sql), ...p.map(prm));
        return rows.map(normRow);
    }
    async get(sql, ...p) { return (await this.all(sql, ...p))[0]; }
    /** Executes a write. INSERTs return { id } of the new row (RETURNING id appended unless the statement has its own). */
    async run(sql, ...p) {
        if (/^\s*INSERT/i.test(sql) && !/RETURNING/i.test(sql) && !NO_ID.test(sql)) {
            const rows = await this.all(sql + ' RETURNING id', ...p);
            return { id: rows[0]?.id, changes: rows.length };
        }
        const n = await this.tx.$executeRawUnsafe(toPg(sql), ...p.map(prm));
        return { changes: Number(n) };
    }
    /** Runs inside the request transaction already; kept so domain code reads like a unit of work. */
    async tx_(fn) { return fn(); }
}
exports.Db = Db;
// numbers beyond int4 are sent as BigInt (int8)
function prm(v) { return typeof v === 'number' && Number.isInteger(v) && Math.abs(v) > 2147483647 ? BigInt(v) : v === undefined ? null : v; }
//# sourceMappingURL=db.js.map