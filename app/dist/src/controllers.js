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
exports.CONTROLLERS = exports.AccountsController = exports.BillingController = exports.BookingController = exports.CustomerController = exports.SetupController = exports.AdminController = exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const L = __importStar(require("./lib"));
const integrations_1 = require("./integrations");
const D = __importStar(require("./domain"));
const infra_1 = require("./infra");
const page = (q) => Math.min(Math.max(parseInt(q.limit || '200', 10) || 200, 1), 500);
const like = (s) => `%${String(s).replace(/[%_\\]/g, '\\$&').slice(0, 60)}%`;
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const RESET_TTL_MS = 24 * 3600 * 1000;
/** Creates a one-time link (shown once). Older unused links for that user stop working. */
async function makeResetLink(c, u) {
    const token = L.newToken(), now = Date.now();
    await c.db.run('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL', now, u.id);
    await c.db.run('INSERT INTO password_resets(tenant_id,user_id,token_hash,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?)', u.tenant_id, u.id, L.sha(token), now + RESET_TTL_MS, c.user.id, now);
    await D.audit(c.db, { tid: u.tenant_id, user: c.user }, 'user.reset_link_issued', 'user', u.id);
    return { username: u.username, path: `/?reset=${token}`, expires_at: new Date(now + RESET_TTL_MS).toISOString(), note: 'Shown once. Works once. Valid for 24 hours. Give it to the user yourself; the system sends no email.' };
}
// ---------------- auth ----------------
let AuthController = class AuthController {
    async login(c, b, res, req) {
        const username = String(b?.username || '').trim().slice(0, 100), password = String(b?.password || '');
        const key = `${username.toLowerCase()}|${req.ip}`;
        infra_1.throttle.check(key);
        const u = await c.db.get('SELECT * FROM users WHERE lower(username)=lower(?)', username);
        const ok = u && u.status === 'active' ? L.verifyPassword(password, u.password_hash) : (L.verifyPassword(password, 'scrypt$00$00'), false);
        if (!ok) {
            infra_1.throttle.fail(key);
            throw new L.HttpError(401, 'Wrong username or password');
        }
        if (u.tenant_id && (await c.db.get('SELECT access_blocked FROM tenants WHERE id=?', u.tenant_id))?.access_blocked)
            throw new L.HttpError(403, 'This business account is suspended. Contact the platform admin.', 'ACCESS_SUSPENDED');
        infra_1.throttle.ok(key);
        const token = L.newToken(), now = Date.now();
        await c.db.run('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)', L.sha(token), u.id, now + infra_1.SESSION_TTL, now);
        await c.db.run('DELETE FROM sessions WHERE expires_at < ?', now);
        await D.audit(c.db, { tid: u.tenant_id, user: u }, 'auth.login', 'user', u.id);
        res.setHeader('Set-Cookie', (0, infra_1.sessionCookie)(token));
        return { ok: true, must_change_password: !!u.must_change_password };
    }
    async logout(c, res) {
        await c.db.run('DELETE FROM sessions WHERE token_hash=?', L.sha(c.req.sessionToken));
        res.setHeader('Set-Cookie', (0, infra_1.sessionCookie)('', true));
        return { ok: true };
    }
    async me(c) {
        const t = c.tenant;
        return { user: c.user, permissions: Object.keys(L.ROLE_PERMS).includes(c.user.role) ? L.ROLE_PERMS[c.user.role] : ['*'],
            tenant: t && { id: t.id, name: t.name, status: t.status, currency: t.currency, timezone: t.timezone, trial_ends: t.period_end, tax_label: t.tax_label, default_tax_bp: t.default_tax_bp,
                address: t.address, phone: t.phone, invoice_prefix: t.invoice_prefix, terms: t.terms, has_logo: !!(c.tid && (await c.db.get('SELECT 1 AS x FROM tenant_logos WHERE tenant_id=?', c.tid))) }, today: t ? L.todayIn(t.timezone) : null };
    }
    /** Asks for a reset. Always answers the same way so it cannot be used to find usernames. No email is sent; the request is only recorded in the audit log for the owner. */
    async forgot(c, b, req) {
        const key = `forgot|${req.ip}`;
        infra_1.throttle.check(key);
        infra_1.throttle.fail(key);
        const username = String(b?.username || '').trim().slice(0, 100);
        const u = username ? await c.db.get("SELECT id, tenant_id FROM users WHERE lower(username)=lower(?) AND status='active'", username) : null;
        if (u)
            await D.audit(c.db, { tid: u.tenant_id, user: { id: u.id } }, 'auth.reset_requested', 'user', u.id);
        return { ok: true, message: 'If that username exists, the business owner or platform admin can now give you a reset link. No email is sent by this system.' };
    }
    async resetWithLink(c, b, req) {
        const key = `reset|${req.ip}`;
        infra_1.throttle.check(key);
        const token = String(b?.token || '');
        const now = Date.now();
        const r = token ? await c.db.get('SELECT * FROM password_resets WHERE token_hash=?', L.sha(token)) : null;
        if (!r || r.used_at || Number(r.expires_at) < now) {
            infra_1.throttle.fail(key);
            throw L.bad('This reset link is invalid, expired or already used. Ask for a new one.');
        }
        const ru = await c.db.get('SELECT status FROM users WHERE id=?', r.user_id);
        if (!ru || ru.status !== 'active') {
            infra_1.throttle.fail(key);
            throw L.bad('This reset link is invalid, expired or already used. Ask for a new one.');
        }
        L.checkPasswordStrength(b?.password);
        const claim = await c.db.run('UPDATE password_resets SET used_at=? WHERE id=? AND used_at IS NULL', now, r.id);
        if (claim && claim.changes === 0)
            throw L.bad('This reset link is invalid, expired or already used. Ask for a new one.');
        await c.db.run('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?', L.hashPassword(b.password), r.user_id);
        await c.db.run('DELETE FROM sessions WHERE user_id=?', r.user_id);
        await D.audit(c.db, { tid: r.tenant_id, user: { id: r.user_id } }, 'auth.reset_with_link', 'user', r.user_id);
        infra_1.throttle.ok(key);
        return { ok: true };
    }
    async change(c, b) {
        const u = await c.db.get('SELECT * FROM users WHERE id=?', c.user.id);
        if (!L.verifyPassword(String(b?.current || ''), u.password_hash))
            throw L.bad('Current password is wrong');
        L.checkPasswordStrength(b?.next);
        await c.db.run('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?', L.hashPassword(b.next), u.id);
        await c.db.run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', u.id, L.sha(c.req.sessionToken));
        await D.audit(c.db, c, 'auth.change_password', 'user', u.id);
        return { ok: true };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, infra_1.Public)(),
    (0, common_1.Post)('login'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, infra_1.AnyAuth)(),
    (0, common_1.Post)('logout'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, infra_1.AnyAuth)(),
    (0, common_1.Get)('me'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
__decorate([
    (0, infra_1.Public)(),
    (0, common_1.Post)('forgot-password'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "forgot", null);
__decorate([
    (0, infra_1.Public)(),
    (0, common_1.Post)('reset-password'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resetWithLink", null);
__decorate([
    (0, infra_1.AnyAuth)(),
    (0, common_1.Post)('change-password'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "change", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('api/auth')
], AuthController);
// ---------------- platform admin (super) ----------------
const STATUSES = ['trial', 'active', 'past_due', 'suspended', 'cancelled'];
const ROLES = ['owner', 'manager', 'accountant', 'booking', 'store', 'event_staff'];
const DEFAULT_CATS = ['Utilities', 'Rent', 'Maintenance', 'Fuel / generator', 'Decoration material', 'Transport', 'Marketing', 'Other'];
let AdminController = class AdminController {
    async tenants(c) {
        return c.db.all(`SELECT t.id,t.name,t.slug,t.status,t.plan_id,p.name AS plan_name,t.period_end,t.created_at,
      (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id) AS users, (SELECT COUNT(*) FROM branches b WHERE b.tenant_id=t.id AND b.active=1) AS branches,
      (SELECT COUNT(*) FROM venues v WHERE v.tenant_id=t.id AND v.active=1) AS venues, (SELECT COUNT(*) FROM bookings k WHERE k.tenant_id=t.id) AS bookings
      FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id ORDER BY t.id`);
    }
    async createTenant(c, b) {
        const name = L.str(b.name, 'Business name', { required: true });
        const slug = String(b.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
        if (!slug)
            throw L.bad('Business short name is required');
        const username = L.str(b.owner_username, 'Owner username', { required: true, max: 50 });
        if (!/^[A-Za-z0-9._-]{3,50}$/.test(username))
            throw L.bad('Username must be 3-50 letters, numbers, dot, dash or underscore');
        const status = b.status || 'trial';
        if (!STATUSES.includes(status))
            throw L.bad('Bad status');
        if (b.plan_id)
            await c.db.get('SELECT id FROM plans WHERE id=?', b.plan_id).then((p) => { if (!p)
                throw L.notFound('Plan not found'); });
        if (await c.db.get('SELECT 1 x FROM users WHERE lower(username)=lower(?)', username))
            throw new L.HttpError(409, 'That username is taken');
        if (await c.db.get('SELECT 1 x FROM tenants WHERE slug=?', slug))
            throw new L.HttpError(409, 'That business short name is taken');
        const now = L.nowIso();
        const t = await c.db.run('INSERT INTO tenants(name,slug,status,plan_id,period_end,address,phone,created_at) VALUES(?,?,?,?,?,?,?,?)', name, slug, status, b.plan_id || null, b.period_end ? L.checkDate(b.period_end, 'Period end') : null, L.str(b.address, 'Address', { max: 300 }), L.str(b.phone, 'Phone', { max: 40 }), now);
        const pw = L.randomPassword();
        await c.db.run('INSERT INTO users(tenant_id,username,name,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?,?,?,?)', t.id, username, L.str(b.owner_name, 'Owner name', { max: 100 }) || name, L.hashPassword(pw), 'owner', 1, now);
        for (const n of DEFAULT_CATS)
            await c.db.run('INSERT INTO expense_categories(tenant_id,name) VALUES(?,?)', t.id, n);
        await D.audit(c.db, { tid: t.id, user: c.user }, 'tenant.create', 'tenant', t.id, { name, slug });
        return { id: t.id, slug, owner_username: username, temporary_password: pw, note: 'Shown once. The owner must change it at first login.' };
    }
    async updateTenant(c, id, b) {
        const t = await c.db.get('SELECT * FROM tenants WHERE id=?', Number(id));
        if (!t)
            throw L.notFound('Business not found');
        const status = b.status ?? t.status;
        if (!STATUSES.includes(status))
            throw L.bad('Bad status');
        if (b.plan_id) {
            const p = await c.db.get('SELECT id FROM plans WHERE id=?', b.plan_id);
            if (!p)
                throw L.notFound('Plan not found');
        }
        await c.db.run('UPDATE tenants SET status=?, plan_id=?, period_end=?, name=? WHERE id=?', status, b.plan_id === undefined ? t.plan_id : (b.plan_id || null), b.period_end === undefined ? t.period_end : (b.period_end ? L.checkDate(b.period_end, 'Period end') : null), L.str(b.name, 'Name') || t.name, t.id);
        await D.audit(c.db, { tid: t.id, user: c.user }, 'tenant.update', 'tenant', t.id, { from: t.status, to: status });
        return c.db.get('SELECT id,name,slug,status,plan_id,period_end FROM tenants WHERE id=?', t.id);
    }
    async resetOwnerLink(c, id) {
        const u = await c.db.get("SELECT * FROM users WHERE tenant_id=? AND role='owner' ORDER BY id LIMIT 1", Number(id));
        if (!u)
            throw L.notFound('Owner not found');
        return makeResetLink(c, u);
    }
    async resetOwner(c, id) {
        const u = await c.db.get("SELECT * FROM users WHERE tenant_id=? AND role='owner' ORDER BY id LIMIT 1", Number(id));
        if (!u)
            throw L.notFound('Owner not found');
        const pw = L.randomPassword();
        await c.db.run('UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?', L.hashPassword(pw), u.id);
        await c.db.run('DELETE FROM sessions WHERE user_id=?', u.id);
        await D.audit(c.db, { tid: u.tenant_id, user: c.user }, 'user.reset_password', 'user', u.id);
        return { username: u.username, temporary_password: pw };
    }
    plans(c) { return c.db.all('SELECT * FROM plans ORDER BY id'); }
    async createPlan(c, b) {
        const lim = (v, f) => (v === undefined || v === null || v === '' ? null : (Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : (() => { throw L.bad(`${f} must be a whole number`); })()));
        const r = await c.db.run('INSERT INTO plans(name,max_branches,max_users,max_venues,price_minor,notes,created_at) VALUES(?,?,?,?,?,?,?)', L.str(b.name, 'Plan name', { required: true, max: 60 }), lim(b.max_branches, 'Branch limit'), lim(b.max_users, 'User limit'), lim(b.max_venues, 'Hall limit'), b.price ? L.parseMoney(b.price, { field: 'Price' }) : null, L.str(b.notes, 'Notes', { max: 300 }), L.nowIso());
        return c.db.get('SELECT * FROM plans WHERE id=?', r.id);
    }
    tickets(c) { return c.db.all('SELECT s.*, t.name AS tenant_name FROM support_tickets s JOIN tenants t ON t.id=s.tenant_id ORDER BY s.id DESC LIMIT 200'); }
    async ticket(c, id, b) {
        if (b.status && !['open', 'in_progress', 'closed'].includes(b.status))
            throw L.bad('Bad status');
        await c.db.run('UPDATE support_tickets SET status=COALESCE(?,status), reply=COALESCE(?,reply) WHERE id=?', b.status || null, L.str(b.reply, 'Reply', { max: 2000 }), Number(id));
        return c.db.get('SELECT * FROM support_tickets WHERE id=?', Number(id));
    }
    async stats(c) {
        return c.db.get(`SELECT (SELECT COUNT(*) FROM tenants) tenants, (SELECT COUNT(*) FROM tenants WHERE status IN ('trial','active','past_due')) live,
      (SELECT COUNT(*) FROM tenants WHERE status='suspended') suspended, (SELECT COUNT(*) FROM bookings) bookings, (SELECT COUNT(*) FROM support_tickets WHERE status<>'closed') open_tickets`);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Get)('tenants'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "tenants", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Post)('tenants'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createTenant", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Patch)('tenants/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateTenant", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Post)('tenants/:id/reset-owner-link'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "resetOwnerLink", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Post)('tenants/:id/reset-owner-password'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "resetOwner", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Get)('plans'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "plans", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Post)('plans'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createPlan", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Get)('tickets'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "tickets", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Patch)('tickets/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "ticket", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Get)('stats'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "stats", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('api/admin')
], AdminController);
// ---------------- business setup: settings, users, branches, halls ----------------
let SetupController = class SetupController {
    /** Business logo: PNG or JPEG, 200 KB at most, checked by file signature (not by the name or type the browser claims). Stored in the database. */
    async putLogo(c, b) {
        const raw = String(b?.data || '').replace(/^data:[^,]*,/, '');
        if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw) || raw.length < 8)
            throw L.bad('Choose a PNG or JPEG image');
        const buf = Buffer.from(raw, 'base64');
        if (buf.length > 200 * 1024)
            throw L.bad('Logo is too large. Use an image under 200 KB.');
        const png = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), jpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
        if (!png && !jpg)
            throw L.bad('Only PNG or JPEG images are accepted');
        const mime = png ? 'image/png' : 'image/jpeg';
        await c.db.run('INSERT INTO tenant_logos(tenant_id,mime,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET mime=excluded.mime, data=excluded.data, updated_at=excluded.updated_at', c.tid, mime, buf, new Date().toISOString());
        await D.audit(c.db, c, 'settings.logo_set', 'tenant', c.tid, { bytes: buf.length, mime });
        return { ok: true, mime, bytes: buf.length };
    }
    async delLogo(c) { await c.db.run('DELETE FROM tenant_logos WHERE tenant_id=?', c.tid); await D.audit(c.db, c, 'settings.logo_removed', 'tenant', c.tid); return { ok: true }; }
    async getLogo(c, res) {
        const r = c.tid ? await c.db.get('SELECT mime, data FROM tenant_logos WHERE tenant_id=?', c.tid) : null;
        if (!r)
            throw L.notFound('No logo');
        res.set({ 'Content-Type': r.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=60', 'Content-Security-Policy': "default-src 'none'" });
        return new common_1.StreamableFile(Buffer.from(r.data));
    }
    async settings(c, b) {
        const t = c.tenant;
        const prefix = b.invoice_prefix === undefined ? t.invoice_prefix : String(b.invoice_prefix).toUpperCase();
        if (!/^[A-Z0-9]{1,8}$/.test(prefix))
            throw L.bad('Invoice prefix must be 1-8 letters or numbers');
        const tz = b.timezone ?? t.timezone;
        try {
            new Intl.DateTimeFormat('en', { timeZone: tz });
        }
        catch {
            throw L.bad('Unknown time zone');
        }
        await c.db.run('UPDATE tenants SET name=?,address=?,phone=?,timezone=?,invoice_prefix=?,tax_label=?,default_tax_bp=?,terms=? WHERE id=?', L.str(b.name, 'Name', { max: 100 }) || t.name, b.address === undefined ? t.address : L.str(b.address, 'Address', { max: 300 }), b.phone === undefined ? t.phone : L.str(b.phone, 'Phone', { max: 40 }), tz, prefix, L.str(b.tax_label, 'Tax label', { max: 20 }) || t.tax_label, b.tax_percent === undefined ? t.default_tax_bp : L.parseBp(b.tax_percent), b.terms === undefined ? t.terms : L.str(b.terms, 'Terms', { max: 4000 }), t.id);
        await D.audit(c.db, c, 'settings.update', 'tenant', t.id);
        return c.db.get('SELECT * FROM tenants WHERE id=?', t.id);
    }
    users(c) { return c.db.all('SELECT id,username,name,role,branch_id,status,must_change_password,created_at FROM users WHERE tenant_id=? ORDER BY id', c.tid); }
    async createUser(c, b) {
        if (!ROLES.includes(b.role))
            throw L.bad('Choose a role');
        const username = L.str(b.username, 'Username', { required: true, max: 50 });
        if (!/^[A-Za-z0-9._-]{3,50}$/.test(username))
            throw L.bad('Username must be 3-50 letters, numbers, dot, dash or underscore');
        if (await c.db.get('SELECT 1 x FROM users WHERE lower(username)=lower(?)', username))
            throw new L.HttpError(409, 'That username is taken');
        await this.limit(c, 'users', 'max_users', 'users');
        const pw = b.password ? (L.checkPasswordStrength(b.password), String(b.password)) : L.randomPassword();
        const r = await c.db.run('INSERT INTO users(tenant_id,username,name,password_hash,role,branch_id,must_change_password,created_at) VALUES(?,?,?,?,?,?,1,?)', c.tid, username, L.str(b.name, 'Name', { required: true, max: 100 }), L.hashPassword(pw), b.role, b.branch_id ? (await D.own(c.db, 'branches', b.branch_id, c.tid, 'Branch')).id : null, L.nowIso());
        await D.audit(c.db, c, 'user.create', 'user', r.id, { username, role: b.role });
        return { id: r.id, username, temporary_password: b.password ? undefined : pw };
    }
    async updateUser(c, id, b) {
        const u = await D.own(c.db, 'users', id, c.tid, 'User');
        if (b.role && !ROLES.includes(b.role))
            throw L.bad('Bad role');
        if (u.id === c.user.id && ((b.role && b.role !== u.role) || b.status === 'disabled'))
            throw L.bad('You cannot change your own role or disable yourself');
        if (b.status && !['active', 'disabled'].includes(b.status))
            throw L.bad('Bad status');
        await c.db.run('UPDATE users SET name=COALESCE(?,name), role=COALESCE(?,role), status=COALESCE(?,status) WHERE id=? AND tenant_id=?', L.str(b.name, 'Name', { max: 100 }), b.role || null, b.status || null, u.id, c.tid);
        if (b.status === 'disabled') {
            await c.db.run('DELETE FROM sessions WHERE user_id=?', u.id);
            await c.db.run('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL', Date.now(), u.id);
        }
        await D.audit(c.db, c, 'user.update', 'user', u.id, { role: b.role, status: b.status });
        return { ok: true };
    }
    async resetLink(c, id) { const u = await D.own(c.db, 'users', id, c.tid, 'User'); if (u.status !== 'active')
        throw L.bad('User is disabled'); return makeResetLink(c, u); }
    async resetPw(c, id) {
        const u = await D.own(c.db, 'users', id, c.tid, 'User');
        const pw = L.randomPassword();
        await c.db.run('UPDATE users SET password_hash=?, must_change_password=1 WHERE id=? AND tenant_id=?', L.hashPassword(pw), u.id, c.tid);
        await c.db.run('DELETE FROM sessions WHERE user_id=?', u.id);
        await D.audit(c.db, c, 'user.reset_password', 'user', u.id);
        return { username: u.username, temporary_password: pw };
    }
    async limit(c, table, col, label) {
        const lim = (await c.db.get('SELECT p.' + col + ' AS l FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=?', c.tid))?.l;
        if (lim == null)
            return;
        const n = (await c.db.get(`SELECT COUNT(*) n FROM ${table} WHERE tenant_id=?${table === 'users' ? '' : ' AND active=1'}`, c.tid)).n;
        if (n >= lim)
            throw new L.HttpError(402, `Your plan allows ${lim} ${label}. Ask the platform admin to change the plan.`, 'PLAN_LIMIT');
    }
    branches(c) { return c.db.all('SELECT * FROM branches WHERE tenant_id=? ORDER BY id', c.tid); }
    async addBranch(c, b) {
        await this.limit(c, 'branches', 'max_branches', 'branches');
        const r = await c.db.run('INSERT INTO branches(tenant_id,name,address,created_at) VALUES(?,?,?,?)', c.tid, L.str(b.name, 'Branch name', { required: true, max: 100 }), L.str(b.address, 'Address', { max: 300 }), L.nowIso());
        await D.audit(c.db, c, 'branch.create', 'branch', r.id);
        return c.db.get('SELECT * FROM branches WHERE id=?', r.id);
    }
    async editBranch(c, id, b) {
        const x = await D.own(c.db, 'branches', id, c.tid, 'Branch');
        await c.db.run('UPDATE branches SET name=COALESCE(?,name), address=COALESCE(?,address), active=COALESCE(?,active) WHERE id=? AND tenant_id=?', L.str(b.name, 'Name', { max: 100 }), L.str(b.address, 'Address', { max: 300 }), b.active === undefined ? null : bool(b.active), x.id, c.tid);
        return c.db.get('SELECT * FROM branches WHERE id=?', x.id);
    }
    venues(c) { return c.db.all('SELECT v.*, b.name AS branch_name FROM venues v JOIN branches b ON b.id=v.branch_id WHERE v.tenant_id=? ORDER BY v.id', c.tid); }
    async addVenue(c, b) {
        await this.limit(c, 'venues', 'max_venues', 'halls');
        const br = await D.own(c.db, 'branches', b.branch_id, c.tid, 'Branch');
        const cap = b.capacity === undefined || b.capacity === '' ? null : Number(b.capacity);
        if (cap !== null && (!Number.isInteger(cap) || cap < 0))
            throw L.bad('Capacity must be a whole number');
        const r = await c.db.run('INSERT INTO venues(tenant_id,branch_id,name,venue_type,capacity,created_at) VALUES(?,?,?,?,?,?)', c.tid, br.id, L.str(b.name, 'Hall name', { required: true, max: 100 }), ['hall', 'marquee', 'lawn'].includes(b.venue_type) ? b.venue_type : 'hall', cap, L.nowIso());
        await D.audit(c.db, c, 'venue.create', 'venue', r.id);
        return c.db.get('SELECT * FROM venues WHERE id=?', r.id);
    }
    async editVenue(c, id, b) {
        const v = await D.own(c.db, 'venues', id, c.tid, 'Hall');
        await c.db.run('UPDATE venues SET name=COALESCE(?,name), capacity=COALESCE(?,capacity), active=COALESCE(?,active) WHERE id=? AND tenant_id=?', L.str(b.name, 'Name', { max: 100 }), b.capacity === undefined ? null : Number(b.capacity), b.active === undefined ? null : bool(b.active), v.id, c.tid);
        return c.db.get('SELECT * FROM venues WHERE id=?', v.id);
    }
    blocks(c) { return c.db.all(`SELECT id,venue_id,to_char(starts_at,'YYYY-MM-DD"T"HH24:MI') starts_at,to_char(ends_at,'YYYY-MM-DD"T"HH24:MI') ends_at,reason FROM venue_blocks WHERE tenant_id=? ORDER BY starts_at DESC LIMIT 200`, c.tid); }
    async addBlock(c, b) {
        const v = await D.own(c.db, 'venues', b.venue_id, c.tid, 'Hall');
        const s = L.checkDT(b.starts_at, 'Start'), e = L.checkDT(b.ends_at, 'End');
        if (e <= s)
            throw L.bad('End must be after start');
        const cf = await D.conflictsFor(c.db, c.tid, v.id, s, e, 0);
        if (cf)
            throw new L.HttpError(409, cf.type === 'booking' ? `Booking ${cf.code} is in that time` : 'Already blocked for part of that time', 'OVERLAP');
        const r = await c.db.run('INSERT INTO venue_blocks(tenant_id,venue_id,starts_at,ends_at,reason,created_by,created_at) VALUES(?,?,?::timestamp,?::timestamp,?,?,?)', c.tid, v.id, s, e, L.str(b.reason, 'Reason', { max: 200 }) || 'Maintenance', c.user.id, L.nowIso());
        await D.audit(c.db, c, 'venue.block', 'venue', v.id, { s, e });
        return { id: r.id };
    }
    async delBlock(c, id) { const b = await D.own(c.db, 'venue_blocks', id, c.tid, 'Block'); await c.db.run('DELETE FROM venue_blocks WHERE id=? AND tenant_id=?', b.id, c.tid); await D.audit(c.db, c, 'venue.unblock', 'venue', b.venue_id); return { ok: true }; }
    async tix(c) { return c.db.all('SELECT * FROM support_tickets WHERE tenant_id=? ORDER BY id DESC LIMIT 100', c.tid); }
    async ticket(c, b) {
        const r = await c.db.run('INSERT INTO support_tickets(tenant_id,subject,body,created_by,created_at) VALUES(?,?,?,?,?)', c.tid, L.str(b.subject, 'Subject', { required: true, max: 150 }), L.str(b.body, 'Details', { max: 3000 }), c.user.id, L.nowIso());
        return { id: r.id };
    }
};
exports.SetupController = SetupController;
__decorate([
    (0, infra_1.Perm)('settings'),
    (0, common_1.Put)('settings/logo'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "putLogo", null);
__decorate([
    (0, infra_1.Perm)('settings'),
    (0, common_1.Delete)('settings/logo'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "delLogo", null);
__decorate([
    (0, infra_1.AnyAuth)(),
    (0, common_1.Get)('logo'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "getLogo", null);
__decorate([
    (0, infra_1.Perm)('settings'),
    (0, common_1.Put)('settings'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "settings", null);
__decorate([
    (0, infra_1.Perm)('users'),
    (0, common_1.Get)('users'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SetupController.prototype, "users", null);
__decorate([
    (0, infra_1.Perm)('users'),
    (0, common_1.Post)('users'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "createUser", null);
__decorate([
    (0, infra_1.Perm)('users'),
    (0, common_1.Patch)('users/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "updateUser", null);
__decorate([
    (0, infra_1.Perm)('users'),
    (0, common_1.Post)('users/:id/reset-link'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "resetLink", null);
__decorate([
    (0, infra_1.Perm)('users'),
    (0, common_1.Post)('users/:id/reset-password'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "resetPw", null);
__decorate([
    (0, infra_1.AnyAuth)(),
    (0, common_1.Get)('branches'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SetupController.prototype, "branches", null);
__decorate([
    (0, infra_1.Perm)('settings'),
    (0, common_1.Post)('branches'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "addBranch", null);
__decorate([
    (0, infra_1.Perm)('settings'),
    (0, common_1.Patch)('branches/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "editBranch", null);
__decorate([
    (0, infra_1.AnyAuth)(),
    (0, common_1.Get)('venues'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SetupController.prototype, "venues", null);
__decorate([
    (0, infra_1.Perm)('venues.write'),
    (0, common_1.Post)('venues'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "addVenue", null);
__decorate([
    (0, infra_1.Perm)('venues.write'),
    (0, common_1.Patch)('venues/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "editVenue", null);
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('venue-blocks'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SetupController.prototype, "blocks", null);
__decorate([
    (0, infra_1.Perm)('venues.write'),
    (0, common_1.Post)('venue-blocks'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "addBlock", null);
__decorate([
    (0, infra_1.Perm)('venues.write'),
    (0, common_1.Delete)('venue-blocks/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "delBlock", null);
__decorate([
    (0, infra_1.Perm)('support'),
    (0, common_1.Get)('support'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "tix", null);
__decorate([
    (0, infra_1.AnyAuth)(),
    (0, common_1.Post)('support'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SetupController.prototype, "ticket", null);
exports.SetupController = SetupController = __decorate([
    (0, common_1.Controller)('api')
], SetupController);
// ---------------- customers ----------------
const maskCnic = (s) => (s ? '*'.repeat(Math.max(0, s.length - 4)) + s.slice(-4) : null);
let CustomerController = class CustomerController {
    async list(c, q) {
        const p = [c.tid];
        let w = 'tenant_id=?';
        if (q.q) {
            w += ` AND (name ILIKE ? OR phone ILIKE ? OR phone2 ILIKE ?)`;
            const l = like(q.q);
            p.push(l, l, l);
        }
        const rows = await c.db.all(`SELECT * FROM customers WHERE ${w} ORDER BY id DESC LIMIT ${page(q)}`, ...p);
        return rows.map((r) => ({ ...r, cnic: maskCnic(r.cnic) }));
    }
    async dupes(c, phone, excl = 0) { return c.db.all('SELECT id,name,phone FROM customers WHERE tenant_id=? AND id<>? AND (phone=? OR phone2=?) LIMIT 5', c.tid, excl, phone, phone); }
    clean(b, ex = {}) {
        const phone = b.phone === undefined ? ex.phone : String(b.phone).replace(/[\s-]/g, '');
        if (!phone || !/^\+?\d{7,15}$/.test(phone))
            throw L.bad('Phone must be 7-15 digits');
        const cnic = b.cnic === undefined ? ex.cnic ?? null : (String(b.cnic).trim() === '' ? null : String(b.cnic).replace(/[\s]/g, ''));
        if (cnic && !/^[0-9-]{13,15}$/.test(cnic))
            throw L.bad('CNIC must be 13 digits');
        const consent = b.whatsapp_consent === undefined ? ex.whatsapp_consent ?? 0 : bool(b.whatsapp_consent);
        return { name: L.str(b.name ?? ex.name, 'Name', { required: true, max: 100 }), phone, phone2: b.phone2 === undefined ? ex.phone2 ?? null : L.str(b.phone2, 'Second phone', { max: 20 }),
            email: b.email === undefined ? ex.email ?? null : ((v) => { if (v && !(0, integrations_1.singleEmail)(v))
                throw L.bad('Email must be one plain address like name@example.com'); return v; })(L.str(b.email, 'Email', { max: 120 })), address: b.address === undefined ? ex.address ?? null : L.str(b.address, 'Address', { max: 300 }),
            notes: b.notes === undefined ? ex.notes ?? null : L.str(b.notes, 'Notes', { max: 1000 }), cnic, consent, marketing: b.marketing_consent === undefined ? ex.marketing_consent ?? 0 : bool(b.marketing_consent) };
    }
    async create(c, b) {
        const x = this.clean(b);
        const dup = await this.dupes(c, x.phone);
        if (dup.length && !b.allow_duplicate)
            throw new L.HttpError(409, `A customer with this phone already exists: ${dup[0].name}`, 'DUPLICATE_CUSTOMER');
        const now = L.nowIso();
        const r = await c.db.run('INSERT INTO customers(tenant_id,name,phone,phone2,email,address,cnic,notes,whatsapp_consent,whatsapp_consent_at,marketing_consent,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', c.tid, x.name, x.phone, x.phone2, x.email, x.address, x.cnic, x.notes, x.consent, x.consent ? now : null, x.marketing, now);
        await D.audit(c.db, c, 'customer.create', 'customer', r.id);
        return { ...(await c.db.get('SELECT * FROM customers WHERE id=?', r.id)), cnic: maskCnic(x.cnic) };
    }
    async one(c, id) {
        const cu = await D.own(c.db, 'customers', id, c.tid, 'Customer');
        const full = ['owner', 'manager'].includes(c.user.role);
        const bookings = await c.db.all('SELECT id,code,status,event_type,event_date,guests FROM bookings WHERE tenant_id=? AND customer_id=? ORDER BY event_date DESC LIMIT 100', c.tid, cu.id);
        const bal = await c.db.get(`SELECT COALESCE(SUM(i.total_minor),0) inv FROM invoices i WHERE i.tenant_id=? AND i.customer_id=? AND i.kind='invoice' AND i.status='issued'`, c.tid, cu.id);
        const paid = await c.db.get('SELECT COALESCE(SUM(a.amount_minor),0) s FROM payment_allocations a JOIN invoices i ON i.id=a.invoice_id WHERE i.tenant_id=? AND i.customer_id=?', c.tid, cu.id);
        const cr = await c.db.get('SELECT COALESCE(SUM(n.amount_minor),0) s FROM credit_notes n JOIN invoices i ON i.id=n.invoice_id WHERE i.tenant_id=? AND i.customer_id=?', c.tid, cu.id);
        return { ...cu, cnic: full ? cu.cnic : maskCnic(cu.cnic), bookings, balance_minor: bal.inv - paid.s - cr.s, notes_log: await c.db.all('SELECT * FROM customer_notes WHERE tenant_id=? AND customer_id=? ORDER BY id DESC LIMIT 100', c.tid, cu.id) };
    }
    async update(c, id, b) {
        const cu = await D.own(c.db, 'customers', id, c.tid, 'Customer');
        const x = this.clean(b, cu);
        const consentChanged = x.consent !== cu.whatsapp_consent;
        await c.db.run('UPDATE customers SET name=?,phone=?,phone2=?,email=?,address=?,cnic=?,notes=?,whatsapp_consent=?,whatsapp_consent_at=?,marketing_consent=? WHERE id=? AND tenant_id=?', x.name, x.phone, x.phone2, x.email, x.address, x.cnic, x.notes, x.consent, consentChanged ? (x.consent ? L.nowIso() : null) : cu.whatsapp_consent_at, x.marketing, cu.id, c.tid);
        await D.audit(c.db, c, 'customer.update', 'customer', cu.id, { consentChanged });
        return { ok: true };
    }
    async note(c, id, b) {
        const cu = await D.own(c.db, 'customers', id, c.tid, 'Customer');
        if (!['note', 'followup', 'feedback', 'complaint'].includes(b.kind))
            throw L.bad('Bad kind');
        const r = await c.db.run('INSERT INTO customer_notes(tenant_id,customer_id,kind,body,due_date,created_by,created_at) VALUES(?,?,?,?,?,?,?)', c.tid, cu.id, b.kind, L.str(b.body, 'Text', { required: true, max: 1000 }), b.due_date ? L.checkDate(b.due_date, 'Due date') : null, c.user.id, L.nowIso());
        return { id: r.id };
    }
    async done(c, nid) { await c.db.run("UPDATE customer_notes SET status='done' WHERE id=? AND tenant_id=?", Number(nid), c.tid); return { ok: true }; }
};
exports.CustomerController = CustomerController;
__decorate([
    (0, infra_1.Perm)('customers.read'),
    (0, common_1.Get)(),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CustomerController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('customers.write'),
    (0, common_1.Post)(),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CustomerController.prototype, "create", null);
__decorate([
    (0, infra_1.Perm)('customers.read'),
    (0, common_1.Get)(':id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CustomerController.prototype, "one", null);
__decorate([
    (0, infra_1.Perm)('customers.write'),
    (0, common_1.Patch)(':id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CustomerController.prototype, "update", null);
__decorate([
    (0, infra_1.Perm)('customers.write'),
    (0, common_1.Post)(':id/notes'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CustomerController.prototype, "note", null);
__decorate([
    (0, infra_1.Perm)('customers.write'),
    (0, common_1.Patch)('notes/:nid/done'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('nid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CustomerController.prototype, "done", null);
exports.CustomerController = CustomerController = __decorate([
    (0, common_1.Controller)('api/customers')
], CustomerController);
// ---------------- bookings, calendar, availability ----------------
let BookingController = class BookingController {
    async list(c, q) {
        const p = [c.tid];
        let w = 'b.tenant_id=?';
        if (q.status) {
            w += ' AND b.status=?';
            p.push(String(q.status));
        }
        if (q.venue_id) {
            w += ' AND b.venue_id=?';
            p.push(Number(q.venue_id));
        }
        if (q.customer_id) {
            w += ' AND b.customer_id=?';
            p.push(Number(q.customer_id));
        }
        if (q.from) {
            w += ' AND b.event_date>=?';
            p.push(L.checkDate(q.from));
        }
        if (q.to) {
            w += ' AND b.event_date<=?';
            p.push(L.checkDate(q.to));
        }
        if (q.q) {
            w += ' AND (b.code ILIKE ? OR c.name ILIKE ? OR c.phone ILIKE ?)';
            const l = like(q.q);
            p.push(l, l, l);
        }
        const rows = await c.db.all(`SELECT b.id,b.code,b.status,b.event_type,b.event_date,b.starts_at,b.ends_at,b.guests,b.per_head_minor,b.rent_minor,b.venue_id,b.customer_id,
      c.name AS customer_name,c.phone AS customer_phone,v.name AS venue_name,
      COALESCE((SELECT SUM(i.total_minor) FROM invoices i WHERE i.booking_id=b.id AND i.kind='invoice' AND i.status='issued'),0) AS invoiced_minor
      FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN venues v ON v.id=b.venue_id WHERE ${w} ORDER BY b.event_date DESC, b.starts_at DESC LIMIT ${page(q)}`, ...p);
        return rows;
    }
    create(c, b) { return D.createBooking(c.db, c, b); }
    async one(c, id) {
        const raw = await D.own(c.db, 'bookings', id, c.tid, 'Booking');
        const b = await D.getBooking(c.db, c.tid, raw.id);
        const invoices = await c.db.all('SELECT id FROM invoices WHERE tenant_id=? AND booking_id=? ORDER BY id', c.tid, raw.id);
        const payments = await c.db.all('SELECT id FROM payments WHERE tenant_id=? AND booking_id=? ORDER BY id', c.tid, raw.id);
        return { ...b, services: await D.bookingServices(c.db, c.tid, raw.id), history: await c.db.all('SELECT * FROM booking_status_history WHERE tenant_id=? AND booking_id=? ORDER BY id', c.tid, raw.id),
            invoices: await Promise.all(invoices.map((i) => D.getInvoice(c.db, c.tid, i.id))), payments: await Promise.all(payments.map(async (p) => D.paymentView(c.db, await c.db.get('SELECT * FROM payments WHERE id=?', p.id)))),
            finance: await D.bookingFinance(c.db, c.tid, raw.id), estimate: await D.bookingEstimate(c.db, raw), tasks: await c.db.all('SELECT t.*, e.name AS employee_name FROM event_tasks t LEFT JOIN employees e ON e.id=t.employee_id WHERE t.tenant_id=? AND t.booking_id=? ORDER BY t.id', c.tid, raw.id) };
    }
    update(c, id, b) { return D.updateBooking(c.db, c, id, b); }
    status(c, id, b) { return D.setStatus(c.db, c, id, String(b.status), b.note); }
    async addService(c, id, b) {
        const bk = await D.own(c.db, 'bookings', id, c.tid, 'Booking');
        const r = await c.db.run('INSERT INTO booking_services(tenant_id,booking_id,description,qty_milli,unit_minor,created_at) VALUES(?,?,?,?,?,?)', c.tid, bk.id, L.str(b.description, 'Description', { required: true, max: 200 }), L.parseQty(b.qty ?? '1'), L.parseMoney(b.unit ?? '0', { field: 'Rate' }), L.nowIso());
        await D.audit(c.db, c, 'booking.service', 'booking', bk.id);
        return { id: r.id };
    }
    async delService(c, id, sid) { const bk = await D.own(c.db, 'bookings', id, c.tid, 'Booking'); await c.db.run('DELETE FROM booking_services WHERE id=? AND booking_id=? AND tenant_id=?', Number(sid), bk.id, c.tid); return { ok: true }; }
    async availability(c, q) {
        const v = await D.own(c.db, 'venues', q.venue_id, c.tid, 'Hall');
        const s = L.checkDT(q.starts_at, 'Start'), e = L.checkDT(q.ends_at, 'End');
        if (e <= s)
            throw L.bad('End must be after start');
        const bs = L.shiftMin(s, -Number(q.setup_min || 0)), be = L.shiftMin(e, Number(q.cleanup_min || 0));
        const cf = await D.conflictsFor(c.db, c.tid, v.id, bs, be, Number(q.exclude_id || 0));
        return { free: !cf, conflict: cf, window: { start: bs, end: be } };
    }
    async calendar(c, q) {
        const from = L.checkDate(q.from, 'From'), to = L.checkDate(q.to, 'To');
        if (to < from)
            throw L.bad('To is before From');
        const p = [c.tid, to + 'T23:59', from + 'T00:00'];
        let w = '';
        if (q.venue_id) {
            w = ' AND b.venue_id=?';
            p.push(Number(q.venue_id));
        }
        if (q.event_type) {
            if (typeof q.event_type !== 'string' || q.event_type.length > 40)
                throw L.bad('Invalid event type');
            w += ' AND b.event_type=?';
            p.push(q.event_type);
        }
        if (q.status) {
            if (!['inquiry', 'tentative', 'confirmed', 'completed'].includes(q.status))
                throw L.bad('Status must be inquiry, tentative, confirmed or completed');
            w += ' AND b.status=?';
            p.push(q.status);
        }
        if (q.branch_id) {
            const bid = Number(q.branch_id);
            if (!Number.isSafeInteger(bid) || bid <= 0)
                throw L.bad('Invalid branch');
            w += ' AND b.venue_id IN (SELECT id FROM venues WHERE tenant_id=b.tenant_id AND branch_id=?)';
            p.push(bid);
        }
        const bookings = await c.db.all(`SELECT b.id,b.code,b.status,b.event_type,b.event_date,b.starts_at,b.ends_at,b.guests,b.venue_id,c.name AS customer_name
      FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.tenant_id=? AND b.status<>'cancelled' AND b.starts_at<=? AND b.ends_at>=?${w} ORDER BY b.starts_at`, ...p);
        let bw = '';
        const bp = [];
        if (q.venue_id) {
            bw += ' AND venue_id=?';
            bp.push(Number(q.venue_id));
        }
        if (q.branch_id) {
            bw += ' AND venue_id IN (SELECT id FROM venues WHERE tenant_id=venue_blocks.tenant_id AND branch_id=?)';
            bp.push(Number(q.branch_id));
        }
        const blocks = await c.db.all(`SELECT id,venue_id,to_char(starts_at,'YYYY-MM-DD"T"HH24:MI') starts_at,to_char(ends_at,'YYYY-MM-DD"T"HH24:MI') ends_at,reason FROM venue_blocks WHERE tenant_id=? AND starts_at<=?::timestamp AND ends_at>=?::timestamp${bw}`, c.tid, to + 'T23:59', from + 'T00:00', ...bp);
        return { bookings, blocks };
    }
    async addTask(c, id, b) {
        const bk = await D.own(c.db, 'bookings', id, c.tid, 'Booking');
        const emp = b.employee_id ? (await D.own(c.db, 'employees', b.employee_id, c.tid, 'Employee')).id : null;
        const r = await c.db.run('INSERT INTO event_tasks(tenant_id,booking_id,title,employee_id,role,due_at,created_at) VALUES(?,?,?,?,?,?,?)', c.tid, bk.id, L.str(b.title, 'Task', { required: true, max: 200 }), emp, L.str(b.role, 'Role', { max: 60 }), b.due_at ? L.checkDT(b.due_at, 'Due') : null, L.nowIso());
        return { id: r.id };
    }
    async task(c, id, b) {
        const t = await D.own(c.db, 'event_tasks', id, c.tid, 'Task');
        if (!['open', 'done'].includes(b.status))
            throw L.bad('Bad status');
        await c.db.run('UPDATE event_tasks SET status=? WHERE id=? AND tenant_id=?', b.status, t.id, c.tid);
        return { ok: true };
    }
};
exports.BookingController = BookingController;
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('bookings'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('bookings.write'),
    (0, common_1.Post)('bookings'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], BookingController.prototype, "create", null);
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('bookings/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "one", null);
__decorate([
    (0, infra_1.Perm)('bookings.write'),
    (0, common_1.Patch)('bookings/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BookingController.prototype, "update", null);
__decorate([
    (0, infra_1.Perm)('bookings.write'),
    (0, common_1.Post)('bookings/:id/status'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BookingController.prototype, "status", null);
__decorate([
    (0, infra_1.Perm)('bookings.write'),
    (0, common_1.Post)('bookings/:id/services'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "addService", null);
__decorate([
    (0, infra_1.Perm)('bookings.write'),
    (0, common_1.Delete)('bookings/:id/services/:sid'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('sid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "delService", null);
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('availability'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "availability", null);
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('calendar'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "calendar", null);
__decorate([
    (0, infra_1.Perm)('bookings.write'),
    (0, common_1.Post)('bookings/:id/tasks'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "addTask", null);
__decorate([
    (0, infra_1.Perm)('tasks.update'),
    (0, common_1.Patch)('tasks/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "task", null);
exports.BookingController = BookingController = __decorate([
    (0, common_1.Controller)('api')
], BookingController);
// ---------------- billing: invoices, payments ----------------
let BillingController = class BillingController {
    async list(c, q) {
        const p = [c.tid];
        let w = 'i.tenant_id=?';
        if (q.booking_id) {
            w += ' AND i.booking_id=?';
            p.push(Number(q.booking_id));
        }
        if (q.status) {
            w += ' AND i.status=?';
            p.push(String(q.status));
        }
        if (q.kind) {
            w += ' AND i.kind=?';
            p.push(String(q.kind));
        }
        return c.db.all(`SELECT i.id,i.number,i.kind,i.status,i.issue_date,i.total_minor,i.booking_id,b.code AS booking_code,cu.name AS customer_name,
      i.total_minor - COALESCE((SELECT SUM(amount_minor) FROM credit_notes n WHERE n.invoice_id=i.id),0) - COALESCE((SELECT SUM(amount_minor) FROM payment_allocations a WHERE a.invoice_id=i.id),0) AS due_calc
      FROM invoices i JOIN bookings b ON b.id=i.booking_id JOIN customers cu ON cu.id=i.customer_id WHERE ${w} ORDER BY i.id DESC LIMIT ${page(q)}`, ...p)
            .then((rows) => rows.map((r) => ({ ...r, due_minor: r.kind === 'invoice' && r.status === 'issued' ? r.due_calc : 0 })));
    }
    create(c, id, b) { return D.createInvoiceDraft(c.db, c, id, b.kind || 'invoice', b); }
    async one(c, id) {
        const inv = await D.getInvoice(c.db, c.tid, Number(id));
        const bk = await D.getBooking(c.db, c.tid, inv.booking_id);
        const cu = await c.db.get('SELECT name,phone,address FROM customers WHERE id=?', inv.customer_id);
        const t = c.tenant;
        return { ...inv, booking: { code: bk.code, event_type: bk.event_type, event_date: bk.event_date, venue_name: bk.venue_name, guests: bk.guests }, customer: cu,
            business: { name: t.name, address: t.address, phone: t.phone, currency: t.currency, tax_label: t.tax_label } };
    }
    update(c, id, b) { return D.updateInvoiceDraft(c.db, c, id, b); }
    del(c, id) { return D.deleteInvoiceDraft(c.db, c, id); }
    issue(c, id) { return D.issueInvoice(c.db, c, id); }
    void_(c, id, b) { return D.voidInvoice(c.db, c, id, b.reason); }
    cn(c, id, b) { return D.creditNote(c.db, c, id, b); }
    async convert(c, id) {
        const q = await D.own(c.db, 'invoices', id, c.tid, 'Quotation');
        if (q.kind !== 'quote' || q.status !== 'issued')
            throw L.bad('Only an issued quotation can be converted');
        const items = await c.db.all('SELECT description, qty_milli, unit_minor FROM invoice_items WHERE invoice_id=? ORDER BY position', q.id);
        return D.createInvoiceDraft(c.db, c, q.booking_id, 'invoice', { items: items.map((i) => ({ description: i.description, qty: String(i.qty_milli / 1000), unit: (i.unit_minor / 100).toFixed(2) })),
            discount: q.discount_minor ? (q.discount_minor / 100).toFixed(2) : undefined, tax_percent: String(q.tax_bp / 100), notes: q.notes });
    }
    async payments(c, q) {
        const p = [c.tid];
        let w = 'p.tenant_id=?';
        if (q.booking_id) {
            w += ' AND p.booking_id=?';
            p.push(Number(q.booking_id));
        }
        if (q.from) {
            w += ' AND p.received_on>=?';
            p.push(L.checkDate(q.from));
        }
        if (q.to) {
            w += ' AND p.received_on<=?';
            p.push(L.checkDate(q.to));
        }
        return c.db.all(`SELECT p.id,p.receipt_no,p.amount_minor,p.method,p.reference,p.received_on,p.booking_id,b.code AS booking_code,cu.name AS customer_name,
      p.amount_minor - COALESCE((SELECT SUM(amount_minor) FROM payment_adjustments x WHERE x.payment_id=p.id),0) AS net_minor
      FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN customers cu ON cu.id=p.customer_id WHERE ${w} ORDER BY p.id DESC LIMIT ${page(q)}`, ...p);
    }
    async pay(c, b) { return D.recordPayment(c.db, c, b); }
    async payment(c, id) {
        const p = await D.own(c.db, 'payments', id, c.tid, 'Payment');
        const v = await D.paymentView(c.db, p);
        const bk = await D.getBooking(c.db, c.tid, p.booking_id);
        const cu = await c.db.get('SELECT name,phone FROM customers WHERE id=?', p.customer_id);
        const t = c.tenant;
        return { ...v, booking: { code: bk.code, event_date: bk.event_date }, customer: cu, business: { name: t.name, address: t.address, phone: t.phone, currency: t.currency } };
    }
    adjust(c, id, b) { return D.adjustPayment(c.db, c, id, b); }
};
exports.BillingController = BillingController;
__decorate([
    (0, infra_1.Perm)('invoices.read'),
    (0, common_1.Get)('invoices'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BillingController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('invoices.write'),
    (0, common_1.Post)('bookings/:id/invoices'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "create", null);
__decorate([
    (0, infra_1.Perm)('invoices.read'),
    (0, common_1.Get)('invoices/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BillingController.prototype, "one", null);
__decorate([
    (0, infra_1.Perm)('invoices.write'),
    (0, common_1.Put)('invoices/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "update", null);
__decorate([
    (0, infra_1.Perm)('invoices.write'),
    (0, common_1.Delete)('invoices/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "del", null);
__decorate([
    (0, infra_1.Perm)('invoices.write'),
    (0, common_1.Post)('invoices/:id/issue'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "issue", null);
__decorate([
    (0, infra_1.Perm)('invoices.void'),
    (0, common_1.Post)('invoices/:id/void'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "void_", null);
__decorate([
    (0, infra_1.Perm)('invoices.void'),
    (0, common_1.Post)('invoices/:id/credit-note'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "cn", null);
__decorate([
    (0, infra_1.Perm)('invoices.write'),
    (0, common_1.Post)('invoices/:id/convert'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BillingController.prototype, "convert", null);
__decorate([
    (0, infra_1.Perm)('payments.read'),
    (0, common_1.Get)('payments'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BillingController.prototype, "payments", null);
__decorate([
    (0, infra_1.Perm)('payments.write'),
    (0, common_1.Post)('payments'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BillingController.prototype, "pay", null);
__decorate([
    (0, infra_1.Perm)('payments.read'),
    (0, common_1.Get)('payments/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BillingController.prototype, "payment", null);
__decorate([
    (0, infra_1.Perm)('payments.refund'),
    (0, common_1.Post)('payments/:id/adjust'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "adjust", null);
exports.BillingController = BillingController = __decorate([
    (0, common_1.Controller)('api')
], BillingController);
// ---------------- expenses, reports, dashboard, audit ----------------
let AccountsController = class AccountsController {
    cats(c) { return c.db.all('SELECT * FROM expense_categories WHERE tenant_id=? ORDER BY name', c.tid); }
    async addCat(c, b) {
        const n = L.str(b.name, 'Category', { required: true, max: 60 });
        const r = await c.db.run('INSERT INTO expense_categories(tenant_id,name) VALUES(?,?) ON CONFLICT(tenant_id,name) DO NOTHING', c.tid, n);
        return { id: r.id };
    }
    async expenses(c, q) {
        const p = [c.tid];
        let w = 'e.tenant_id=?';
        if (q.from) {
            w += ' AND e.spent_on>=?';
            p.push(L.checkDate(q.from));
        }
        if (q.to) {
            w += ' AND e.spent_on<=?';
            p.push(L.checkDate(q.to));
        }
        if (q.booking_id) {
            w += ' AND e.booking_id=?';
            p.push(Number(q.booking_id));
        }
        return c.db.all(`SELECT e.*, k.name AS category_name, b.code AS booking_code FROM expenses e JOIN expense_categories k ON k.id=e.category_id LEFT JOIN bookings b ON b.id=e.booking_id WHERE ${w} ORDER BY e.spent_on DESC, e.id DESC LIMIT ${page(q)}`, ...p);
    }
    async addExpense(c, b) {
        const cat = await c.db.get('SELECT * FROM expense_categories WHERE id=? AND tenant_id=?', Number(b.category_id), c.tid);
        if (!cat)
            throw L.notFound('Category not found');
        const br = await D.own(c.db, 'branches', b.branch_id, c.tid, 'Branch');
        const bk = b.booking_id ? await D.own(c.db, 'bookings', b.booking_id, c.tid, 'Booking') : null;
        const amt = L.parseMoney(b.amount, { allowZero: false, field: 'Amount' });
        if (!['cash', 'bank', 'card', 'digital', 'cheque'].includes(b.method || 'cash'))
            throw L.bad('Bad method');
        const today = L.todayIn(c.tenant.timezone);
        const on = b.spent_on ? L.checkDate(b.spent_on, 'Date') : today;
        if (on > today)
            throw L.bad('Date cannot be in the future');
        const r = await c.db.run('INSERT INTO expenses(tenant_id,branch_id,category_id,booking_id,amount_minor,method,spent_on,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', c.tid, br.id, cat.id, bk?.id ?? null, amt, b.method || 'cash', on, L.str(b.note, 'Note', { max: 300 }), c.user.id, L.nowIso());
        await D.audit(c.db, c, 'expense.create', 'expense', r.id, { amt });
        return { id: r.id };
    }
    async voidExpense(c, id, b) {
        const e = await D.own(c.db, 'expenses', id, c.tid, 'Expense');
        if (e.voided)
            throw L.bad('Already voided');
        await c.db.run('UPDATE expenses SET voided=1, void_reason=? WHERE id=? AND tenant_id=?', L.str(b.reason, 'Reason', { required: true, max: 300 }), e.id, c.tid);
        await D.audit(c.db, c, 'expense.void', 'expense', e.id);
        return { ok: true };
    }
    async dashboard(c) {
        const today = L.todayIn(c.tenant.timezone), month = today.slice(0, 7);
        const one = async (sql, ...p) => (await c.db.get(sql, c.tid, ...p)).n;
        const events_today = await c.db.all(`SELECT b.id,b.code,b.status,b.event_type,b.starts_at,b.ends_at,b.guests,cu.name AS customer_name,v.name AS venue_name FROM bookings b JOIN customers cu ON cu.id=b.customer_id JOIN venues v ON v.id=b.venue_id
      WHERE b.tenant_id=? AND b.event_date=? AND b.status IN ('tentative','confirmed','completed') ORDER BY b.starts_at`, c.tid, today);
        return {
            today, events_today,
            upcoming_count: await one("SELECT COUNT(*) n FROM bookings WHERE tenant_id=? AND event_date>? AND status IN ('tentative','confirmed')", today),
            inquiries_open: await one("SELECT COUNT(*) n FROM bookings WHERE tenant_id=? AND status='inquiry'"),
            collected_today_minor: await one('SELECT COALESCE(SUM(amount_minor),0) n FROM payments WHERE tenant_id=? AND received_on=?', today)
                - await one("SELECT COALESCE(SUM(a.amount_minor),0) n FROM payment_adjustments a WHERE a.tenant_id=? AND a.adjusted_on=?", today),
            booking_value_month_minor: await one(`SELECT COALESCE(SUM(total_minor),0) n FROM invoices WHERE tenant_id=? AND kind='invoice' AND status='issued' AND issue_date LIKE ?`, month + '%')
                - await one(`SELECT COALESCE(SUM(n.amount_minor),0) n FROM credit_notes n JOIN invoices i ON i.id=n.invoice_id WHERE n.tenant_id=? AND i.issue_date LIKE ?`, month + '%'),
            outstanding_minor: (await c.db.get(`SELECT COALESCE(SUM(i.total_minor - COALESCE((SELECT SUM(amount_minor) FROM credit_notes n WHERE n.invoice_id=i.id),0) - COALESCE((SELECT SUM(amount_minor) FROM payment_allocations a WHERE a.invoice_id=i.id),0)),0) n
        FROM invoices i WHERE i.tenant_id=? AND i.kind='invoice' AND i.status='issued'`, c.tid)).n,
            advances_held_minor: (await c.db.get(`SELECT COALESCE(SUM(net - alloc),0) n FROM (SELECT p.amount_minor - COALESCE((SELECT SUM(amount_minor) FROM payment_adjustments x WHERE x.payment_id=p.id),0) AS net,
        COALESCE((SELECT SUM(amount_minor) FROM payment_allocations a WHERE a.payment_id=p.id),0) AS alloc FROM payments p WHERE p.tenant_id=?) q`, c.tid)).n,
            expenses_month_minor: await one('SELECT COALESCE(SUM(amount_minor),0) n FROM expenses WHERE tenant_id=? AND voided=0 AND spent_on LIKE ?', month + '%'),
            note: 'Booking value, cash collected and expenses are separate figures. Collected money is not profit.',
        };
    }
    async collections(c, q) {
        const from = L.checkDate(q.from, 'From'), to = L.checkDate(q.to, 'To');
        const pays = await c.db.all(`SELECT received_on AS day, method, SUM(amount_minor) AS amount FROM payments WHERE tenant_id=? AND received_on BETWEEN ? AND ? GROUP BY received_on, method ORDER BY received_on`, c.tid, from, to);
        const adj = await c.db.all(`SELECT adjusted_on AS day, kind, COALESCE(method,'n/a') AS method, SUM(amount_minor) AS amount FROM payment_adjustments WHERE tenant_id=? AND adjusted_on BETWEEN ? AND ? GROUP BY adjusted_on, kind, method ORDER BY adjusted_on`, c.tid, from, to);
        const received = pays.reduce((s, r) => s + r.amount, 0), reversed = adj.filter((a) => a.kind === 'reversal').reduce((s, r) => s + r.amount, 0), refunded = adj.filter((a) => a.kind === 'refund').reduce((s, r) => s + r.amount, 0);
        return { from, to, receipts: pays, adjustments: adj, received_minor: received, reversed_minor: reversed, refunded_minor: refunded, net_collected_minor: received - reversed - refunded };
    }
    async receivables(c) {
        const today = L.todayIn(c.tenant.timezone);
        const rows = await c.db.all(`SELECT i.id, i.number, i.issue_date, b.code AS booking_code, b.event_date, cu.name AS customer_name, cu.phone,
      i.total_minor - COALESCE((SELECT SUM(amount_minor) FROM credit_notes n WHERE n.invoice_id=i.id),0) - COALESCE((SELECT SUM(amount_minor) FROM payment_allocations a WHERE a.invoice_id=i.id),0) AS due_minor
      FROM invoices i JOIN bookings b ON b.id=i.booking_id JOIN customers cu ON cu.id=i.customer_id WHERE i.tenant_id=? AND i.kind='invoice' AND i.status='issued' ORDER BY i.issue_date`, c.tid);
        const open = rows.filter((r) => r.due_minor > 0);
        return { as_of: today, total_minor: open.reduce((s, r) => s + r.due_minor, 0), rows: open };
    }
    async eventProfit(c, q) {
        const from = L.checkDate(q.from, 'From'), to = L.checkDate(q.to, 'To');
        const rows = await c.db.all(`SELECT b.id,b.code,b.event_type,b.event_date,b.status,b.guests,v.name AS venue_name,
      COALESCE((SELECT SUM(i.total_minor) FROM invoices i WHERE i.booking_id=b.id AND i.kind='invoice' AND i.status='issued'),0)
       - COALESCE((SELECT SUM(n.amount_minor) FROM credit_notes n JOIN invoices i ON i.id=n.invoice_id WHERE i.booking_id=b.id),0) AS invoiced_minor,
      COALESCE((SELECT SUM(e.amount_minor) FROM expenses e WHERE e.booking_id=b.id AND e.voided=0),0) AS expenses_minor
      FROM bookings b JOIN venues v ON v.id=b.venue_id WHERE b.tenant_id=? AND b.event_date BETWEEN ? AND ? AND b.status IN ('confirmed','completed') ORDER BY b.event_date`, c.tid, from, to);
        return { from, to, basis: 'Invoiced revenue minus expenses tagged to the event. Estimate; untagged overheads are not included.',
            rows: rows.map((r) => { const g = Number(r.guests) || 0, m = r.invoiced_minor - r.expenses_minor; const ph = (x) => (g > 0 ? Math.trunc(x / g) : null); return { ...r, estimated_margin_minor: m, per_head_invoiced_minor: ph(r.invoiced_minor), per_head_expenses_minor: ph(r.expenses_minor), per_head_margin_minor: ph(m) }; }), per_head_note: 'Per head = amount divided by the booking guest count, cut to a whole minor unit. Empty when guests is 0.' };
    }
    /** Tax charged on issued invoices in a period, grouped by the rate each invoice carried. Uses only what each invoice stored; no rate or rule is assumed. */
    async taxSummary(c, q) {
        const from = L.checkDate(q.from, 'From'), to = L.checkDate(q.to, 'To');
        if (to < from)
            throw L.bad('To is before From');
        const rows = await c.db.all(`SELECT tax_bp, COUNT(*) AS invoices, SUM(subtotal_minor - discount_minor) AS taxable_minor, SUM(tax_minor) AS tax_minor, SUM(total_minor) AS total_minor
      FROM invoices WHERE tenant_id=? AND kind='invoice' AND status='issued' AND issue_date BETWEEN ? AND ? GROUP BY tax_bp ORDER BY tax_bp`, c.tid, from, to);
        const num = (r) => ({ tax_bp: Number(r.tax_bp), invoices: Number(r.invoices), taxable_minor: Number(r.taxable_minor), tax_minor: Number(r.tax_minor), total_minor: Number(r.total_minor) });
        const out = rows.map(num);
        const sum = (k) => out.reduce((a, r) => a + r[k], 0);
        return { from, to, tax_label: c.tenant.tax_label || 'Tax', rows: out, totals: { taxable_minor: sum('taxable_minor'), tax_minor: sum('tax_minor'), total_minor: sum('total_minor') },
            basis: 'Issued invoices by issue date, grouped by the tax rate stored on each invoice. Taxable = subtotal minus discount. Voided invoices and quotes are left out. Credit notes are not netted because their tax part is not recorded. This is a summary of what was invoiced, not a tax return, and no filing rule is applied.' };
    }
    async hallRevenue(c, q) {
        const from = L.checkDate(q.from, 'From'), to = L.checkDate(q.to, 'To');
        return { from, to, rows: await c.db.all(`SELECT v.id, v.name, COUNT(DISTINCT b.id) AS bookings,
      COALESCE(SUM(i.total_minor),0) AS invoiced_minor FROM venues v LEFT JOIN bookings b ON b.venue_id=v.id AND b.event_date BETWEEN ? AND ? AND b.status IN ('confirmed','completed')
      LEFT JOIN invoices i ON i.booking_id=b.id AND i.kind='invoice' AND i.status='issued' WHERE v.tenant_id=? GROUP BY v.id, v.name ORDER BY v.id`, from, to, c.tid) };
    }
    async audit(c, q) {
        return c.db.all(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.detail,a.created_at,u.name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.tenant_id=? ORDER BY a.id DESC LIMIT ${page({ limit: q.limit || '100' })}`, c.tid);
    }
    async exportAll(c) {
        const t = ['branches', 'venues', 'customers', 'bookings', 'booking_services', 'invoices', 'invoice_items', 'payments', 'payment_allocations', 'payment_adjustments', 'credit_notes', 'expenses', 'expense_categories',
            'vendors', 'vendor_bills', 'vendor_payments', 'employees', 'inventory_items', 'stock_movements', 'menu_items', 'cash_closings', 'bank_reconciliations'];
        const out = { exported_at: L.nowIso(), business: c.tenant.name };
        for (const n of t)
            out[n] = await c.db.all(`SELECT * FROM ${n} WHERE tenant_id=? ORDER BY id`, c.tid);
        await D.audit(c.db, c, 'data.export', 'tenant', c.tid);
        return out;
    }
};
exports.AccountsController = AccountsController;
__decorate([
    (0, infra_1.Perm)('expenses.read'),
    (0, common_1.Get)('expense-categories'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "cats", null);
__decorate([
    (0, infra_1.Perm)('expenses.write'),
    (0, common_1.Post)('expense-categories'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "addCat", null);
__decorate([
    (0, infra_1.Perm)('expenses.read'),
    (0, common_1.Get)('expenses'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "expenses", null);
__decorate([
    (0, infra_1.Perm)('expenses.write'),
    (0, common_1.Post)('expenses'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "addExpense", null);
__decorate([
    (0, infra_1.Perm)('expenses.write'),
    (0, common_1.Post)('expenses/:id/void'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "voidExpense", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('dashboard'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "dashboard", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('reports/collections'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "collections", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('reports/receivables'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "receivables", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('reports/events'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "eventProfit", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('reports/tax-summary'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "taxSummary", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('reports/hall-revenue'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "hallRevenue", null);
__decorate([
    (0, infra_1.Perm)('audit.read'),
    (0, common_1.Get)('audit'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "audit", null);
__decorate([
    (0, infra_1.Perm)('export'),
    (0, common_1.Get)('export'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "exportAll", null);
exports.AccountsController = AccountsController = __decorate([
    (0, common_1.Controller)('api')
], AccountsController);
exports.CONTROLLERS = [AuthController, AdminController, SetupController, CustomerController, BookingController, BillingController, AccountsController];
//# sourceMappingURL=controllers.js.map