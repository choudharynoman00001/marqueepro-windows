"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCC_CONTROLLERS = exports.SccController = void 0;
exports.canonicalQuery = canonicalQuery;
exports.sign = sign;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("node:crypto"));
const L = __importStar(require("./lib"));
const infra_1 = require("./infra");
/**
 * Subscription Control Center connector, contract scc-1.1 (FREEZE CANDIDATE, updated sections 8-9). Not live, not certified.
 * Off (404) unless SCC_KEY_ID and SCC_SECRET are set in the server environment. The secret is never stored, logged or returned.
 * Nonce store: its own committed transaction (so a nonce stays used even when the business call fails), atomic insert,
 * fail closed with 503 if the store cannot be read or written. SCC_NOT_BEFORE (unix seconds) sets the restore floor after a database restore.
 * Local choices where the candidate is silent are listed in docs/SCC_CONNECTOR.md.
 */
const SKEW_SEC = 300, NONCE_TTL_MS = 900 * 1000, REQ_KEEP_DAYS = 30;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const E = (status, code, msg) => { const e = new L.HttpError(status, msg || code); e.sccCode = code; return e; };
const enc = (x) => encodeURIComponent(x).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function canonicalQuery(search) {
    const p = new URLSearchParams((search || '').replace(/^\?/, ''));
    return [...p.entries()].map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => k + '=' + v).join('&');
}
function sign(secret, p) {
    return crypto.createHmac('sha256', secret).update([p.method.toUpperCase(), p.path, canonicalQuery(p.query), p.timestamp, p.nonce, sha(p.body || '')].join('\n')).digest('hex');
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^[A-Za-z0-9_.-]{1,64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const iso = (ms) => new Date(ms).toISOString();
const parseInstant = (v, field) => { if (typeof v !== 'string' || !ISO.test(v) || Number.isNaN(Date.parse(v)))
    throw E(400, 'bad_json', `${field} must be an ISO-8601 UTC instant with milliseconds, e.g. 2026-10-31T23:59:59.999Z`); return v; };
/** valid_until as an instant. A business with only a calendar period_end is valid through the END of that UTC day (may lag, never early). */
const validUntil = (t) => t.scc_valid_until || (t.period_end ? `${String(t.period_end).slice(0, 10)}T23:59:59.999Z` : null);
function effectiveEnd(t) { const v = validUntil(t); if (!v)
    return null; return Math.max(Date.parse(v), t.scc_grace_until ? Date.parse(t.scc_grace_until) : 0); }
function stateOf(t, now = Date.now()) {
    if (!t)
        return 'absent';
    if (t.access_blocked || t.status === 'suspended')
        return 'suspended';
    const end = effectiveEnd(t);
    if (t.status === 'cancelled' || (end !== null && now > end))
        return 'expired';
    return 'active';
}
const view = (t) => ({ external_ref: t.scc_ref, state: stateOf(t), state_changed_at: t.scc_changed_at || null, valid_until: validUntil(t), grace_until: t.scc_grace_until || validUntil(t) });
function parseUrl(req) { const url = req.originalUrl || req.url; const qi = url.indexOf('?'); return { path: qi < 0 ? url : url.slice(0, qi), query: qi < 0 ? '' : url.slice(qi + 1) }; }
async function tenant(db, ref, lock = false) {
    if (!REF.test(ref))
        return null;
    return db.get('SELECT * FROM tenants WHERE scc_ref=?' + (lock ? ' FOR UPDATE' : ''), ref);
}
const bodyOf = (req) => { const b = req.body; if (b === undefined || b === null || (typeof b === 'object' && !Array.isArray(b)))
    return b || {}; throw E(400, 'bad_json'); };
async function audit(db, t, action, d) {
    await db.run('INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,detail,created_at) VALUES(?,?,?,?,?,?,?)', t.id, null, action, 'tenant', t.id, JSON.stringify(d), L.nowIso());
}
const rid = (b) => { if (b.request_id === undefined || b.request_id === null || b.request_id === '')
    throw E(400, 'request_id_required'); if (typeof b.request_id !== 'string' || !UUID.test(b.request_id))
    throw E(400, 'bad_json', 'request_id must be a UUID'); return b.request_id; };
/** Same request_id and payload: replay the stored answer. Same request_id, other payload: 409 request_id_conflict. */
async function replay(req, db, id, action, ref, ph) {
    await db.run('DELETE FROM scc_requests WHERE created_at < ?', new Date(Date.now() - REQ_KEEP_DAYS * 864e5).toISOString());
    const r = await db.get('SELECT * FROM scc_requests WHERE request_id=?', id);
    if (!r)
        return null;
    if (r.payload_hash !== ph || r.action !== action || r.external_ref !== ref)
        throw E(409, 'request_id_conflict', 'request_id was already used for a different request');
    req.res?.setHeader?.('Idempotent-Replay', 'true');
    return JSON.parse(r.response);
}
async function remember(db, id, action, ref, ph, resp) {
    await db.all('INSERT INTO scc_requests(request_id,action,external_ref,payload_hash,response,created_at) VALUES(?,?,?,?,?,?) RETURNING request_id', id, action, ref, ph, JSON.stringify(resp), L.nowIso());
}
let SccController = class SccController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /** Signature first, then the nonce in its own committed transaction. Returns the body hash. */
    async verify(req) {
        const keyId = process.env.SCC_KEY_ID, secret = process.env.SCC_SECRET;
        if (!keyId || !secret)
            throw E(404, 'not_found');
        const h = req.headers;
        const ts = String(h['x-scc-timestamp'] || ''), nonce = String(h['x-scc-nonce'] || ''), sig = String(h['x-scc-signature'] || ''), kid = String(h['x-scc-key-id'] || '');
        if (!kid || !ts || !nonce || !sig)
            throw E(401, 'missing_auth');
        if (kid !== keyId)
            throw E(401, 'unknown_key');
        const { path, query } = parseUrl(req);
        if (!path.startsWith('/_scc/v1'))
            throw E(401, 'bad_path');
        if (!/^\d{9,12}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > SKEW_SEC)
            throw E(401, 'stale_timestamp');
        if (!/^[0-9a-f]{32,64}$/.test(nonce))
            throw E(401, 'bad_nonce');
        const body = req.rawBody || Buffer.alloc(0);
        const want = sign(secret, { method: req.method, path, query, timestamp: ts, nonce, body });
        const a = Buffer.from(want), b = Buffer.from(sig);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
            throw E(401, 'bad_signature');
        let floor = Number(process.env.SCC_NOT_BEFORE || 0);
        const now = Date.now();
        try {
            const res = await this.prisma.scoped({ system: true }, async (db) => {
                const f = await db.get("SELECT v FROM scc_meta WHERE k='floor'");
                let stored;
                if (f)
                    stored = Number(f.v);
                else {
                    stored = Math.floor(now / 1000);
                    await db.all("INSERT INTO scc_meta(k,v) VALUES('floor',?) ON CONFLICT DO NOTHING RETURNING k", String(stored));
                }
                if (Number(ts) < Math.max(floor, stored))
                    return 'floor';
                await db.run('DELETE FROM scc_nonces WHERE seen_at < ?', now - NONCE_TTL_MS);
                const ins = await db.all('INSERT INTO scc_nonces(key_id,nonce,seen_at) VALUES(?,?,?) ON CONFLICT DO NOTHING RETURNING nonce', keyId, nonce, now);
                return ins.length ? 'ok' : 'replay';
            });
            if (res === 'floor')
                throw E(401, 'before_store_floor');
            if (res === 'replay')
                throw E(401, 'nonce_replayed');
        }
        catch (e) {
            if (e?.sccCode)
                throw e;
            throw E(503, 'nonce_store_unavailable');
        }
        return sha(body);
    }
    async health(req) { await this.verify(req); return { ok: true, product: 'marqueepro', version: '1', contract: 'scc-1.1' }; }
    async list(req, cursor) {
        await this.verify(req);
        const after = /^\d+$/.test(String(cursor || '')) ? Number(cursor) : 0;
        const rows = await req.db.all('SELECT * FROM tenants WHERE scc_ref IS NOT NULL AND id>? ORDER BY id LIMIT 101', after);
        const page = rows.slice(0, 100);
        return { accounts: page.map(view), next_cursor: rows.length > 100 ? String(page[page.length - 1].id) : null };
    }
    async get(req, ref) {
        await this.verify(req);
        const t = await tenant(req.db, ref);
        if (!t)
            return { external_ref: ref, state: 'absent', state_changed_at: null, valid_until: null, grace_until: null };
        return view(t);
    }
    async put(req, ref) {
        const ph = await this.verify(req);
        const db = req.db;
        const b = bodyOf(req);
        const id = rid(b);
        if (!REF.test(ref))
            throw E(400, 'bad_json', 'external_ref must match [A-Za-z0-9_.-]{1,64}');
        const prior = await replay(req, db, id, 'put', ref, ph);
        if (prior)
            return prior;
        const name = L.str(b.name, 'name', { max: 100 });
        if (!name)
            throw E(400, 'bad_json', 'name is required');
        const vu = b.valid_until === undefined || b.valid_until === null ? undefined : parseInstant(b.valid_until, 'valid_until');
        const gu = b.grace_until === undefined || b.grace_until === null ? undefined : parseInstant(b.grace_until, 'grace_until');
        let t = await tenant(db, ref, true);
        let status = 200;
        if (b.local_id !== undefined && b.local_id !== null) {
            const lid = String(b.local_id).slice(0, 100);
            const loc = await db.get('SELECT * FROM tenants WHERE (slug=? OR CAST(id AS TEXT)=?) FOR UPDATE', lid, lid);
            if (!loc)
                throw E(404, 'unknown_account', 'No business with that local_id');
            if (t && t.id !== loc.id)
                throw E(409, 'ref_conflict', 'That external_ref is already bound to a different business');
            if (!t) {
                if (loc.scc_ref && loc.scc_ref !== ref)
                    throw E(409, 'ref_conflict', 'That business is already bound to a different external_ref');
                await db.run('UPDATE tenants SET scc_ref=? WHERE id=?', ref, loc.id);
                t = await db.get('SELECT * FROM tenants WHERE id=? FOR UPDATE', loc.id);
            }
        }
        else if (!t) {
            // Unbound PUT: a shell business with no users, passwords or data. It cannot be signed in to.
            const base = 'scc-' + ref.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
            let slug = base, n = 1;
            while (await db.get('SELECT 1 x FROM tenants WHERE slug=?', slug))
                slug = `${base}-${++n}`;
            const r = await db.run("INSERT INTO tenants(name,slug,status,scc_ref,created_at) VALUES(?,?,'trial',?,?)", name, slug, ref, L.nowIso());
            t = await db.get('SELECT * FROM tenants WHERE id=? FOR UPDATE', r.id);
            status = 201;
        }
        const nv = vu !== undefined ? vu : t.scc_valid_until;
        const ng = gu !== undefined ? gu : t.scc_grace_until;
        const vEff = nv || validUntil(t);
        if (ng && vEff && Date.parse(ng) < Date.parse(vEff))
            throw E(400, 'bad_json', 'grace_until must not be earlier than valid_until');
        await db.run('UPDATE tenants SET name=?, scc_valid_until=?, scc_grace_until=?, period_end=? WHERE id=?', name, nv || null, ng || null, nv ? nv.slice(0, 10) : t.period_end, t.id);
        await audit(db, t, 'scc.put', { request_id: id, created: status === 201 });
        const out = view(await db.get('SELECT * FROM tenants WHERE id=?', t.id));
        await remember(db, id, 'put', ref, ph, out);
        req.res?.status?.(status);
        return out;
    }
    async suspend(req, ref) {
        const ph = await this.verify(req);
        const db = req.db;
        const b = bodyOf(req);
        const id = rid(b);
        const prior = await replay(req, db, id, 'suspend', ref, ph);
        if (prior)
            return prior;
        if (!String(b.reason || '').trim() || !String(b.actor || '').trim())
            throw E(400, 'bad_json', 'reason and actor are required');
        const t = await tenant(db, ref, true);
        if (!t)
            throw E(404, 'unknown_account', 'No such account');
        // Blocks sign-in and use. Nothing is deleted and no password is changed.
        await db.run("UPDATE tenants SET access_blocked=1, scc_prev_status=CASE WHEN status='suspended' THEN scc_prev_status ELSE status END, status='suspended', scc_changed_at=? WHERE id=?", iso(Date.now()), t.id);
        await db.run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id=?)', t.id);
        await audit(db, t, 'scc.suspend', { request_id: id, actor: String(b.actor).slice(0, 100), reason: String(b.reason).slice(0, 300) });
        const out = { state: stateOf(await db.get('SELECT * FROM tenants WHERE id=?', t.id)) };
        await remember(db, id, 'suspend', ref, ph, out);
        return out;
    }
    async restore(req, ref) {
        const ph = await this.verify(req);
        const db = req.db;
        const b = bodyOf(req);
        const id = rid(b);
        const prior = await replay(req, db, id, 'restore', ref, ph);
        if (prior)
            return prior;
        if (!String(b.actor || '').trim())
            throw E(400, 'bad_json', 'actor is required');
        const t = await tenant(db, ref, true);
        if (!t)
            throw E(404, 'unknown_account', 'No such account');
        const end = effectiveEnd(t);
        if (t.status === 'cancelled' || (end !== null && Date.now() > end))
            throw E(409, 'entitlement_expired', 'valid_until (and grace) has passed. Renew it with PUT first. Restore never extends validity.');
        await db.run("UPDATE tenants SET access_blocked=0, status=CASE WHEN status='suspended' THEN COALESCE(scc_prev_status,'active') ELSE status END, scc_prev_status=NULL, scc_changed_at=? WHERE id=?", iso(Date.now()), t.id);
        await audit(db, t, 'scc.restore', { request_id: id, actor: String(b.actor).slice(0, 100) });
        const out = { state: stateOf(await db.get('SELECT * FROM tenants WHERE id=?', t.id)) };
        await remember(db, id, 'restore', ref, ph, out);
        return out;
    }
    async revoke(req, ref) {
        const ph = await this.verify(req);
        const db = req.db;
        const b = bodyOf(req);
        const id = rid(b);
        const prior = await replay(req, db, id, 'revoke', ref, ph);
        if (prior)
            return prior;
        if (!String(b.actor || '').trim())
            throw E(400, 'bad_json', 'actor is required');
        const t = await tenant(db, ref, true);
        if (!t)
            throw E(404, 'unknown_account', 'No such account');
        const r = await db.get('SELECT COUNT(*) n FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id=?)', t.id);
        await db.run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id=?)', t.id);
        await audit(db, t, 'scc.revoke_sessions', { request_id: id, actor: String(b.actor).slice(0, 100), n: Number(r.n) });
        const out = { revoked: Number(r.n) };
        await remember(db, id, 'revoke', ref, ph, out);
        return out;
    }
};
exports.SccController = SccController;
__decorate([
    (0, infra_1.Public)(),
    (0, common_1.Get)('health'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SccController.prototype, "health", null);
__decorate([
    (0, infra_1.Public)(),
    (0, common_1.Get)('accounts'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SccController.prototype, "list", null);
__decorate([
    (0, infra_1.Public)(),
    (0, common_1.Get)('accounts/:ref'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('ref')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SccController.prototype, "get", null);
__decorate([
    (0, infra_1.Public)(),
    (0, common_1.Put)('accounts/:ref'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('ref')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SccController.prototype, "put", null);
__decorate([
    (0, infra_1.Public)(),
    (0, common_1.HttpCode)(200),
    (0, common_1.Post)('accounts/:ref/suspend'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('ref')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SccController.prototype, "suspend", null);
__decorate([
    (0, infra_1.Public)(),
    (0, common_1.HttpCode)(200),
    (0, common_1.Post)('accounts/:ref/restore'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('ref')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SccController.prototype, "restore", null);
__decorate([
    (0, infra_1.Public)(),
    (0, common_1.HttpCode)(200),
    (0, common_1.Post)('accounts/:ref/revoke-sessions'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('ref')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SccController.prototype, "revoke", null);
exports.SccController = SccController = __decorate([
    (0, common_1.Controller)('_scc/v1'),
    __param(0, (0, common_1.Inject)(infra_1.PrismaService)),
    __metadata("design:paramtypes", [infra_1.PrismaService])
], SccController);
exports.SCC_CONTROLLERS = [SccController];
//# sourceMappingURL=scc.js.map