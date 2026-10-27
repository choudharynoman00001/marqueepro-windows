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
exports.SESSION_TTL = exports.throttle = exports.AllExceptions = exports.TxInterceptor = exports.AuthGuard = exports.COOKIE = exports.C = exports.AnyAuth = exports.SuperOnly = exports.Perm = exports.Public = exports.ANY_AUTH = exports.SUPER = exports.PERM = exports.PUBLIC = exports.PrismaService = exports.opStats = void 0;
exports.sessionCookie = sessionCookie;
const pdfUr_1 = require("./pdfUr");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const client_1 = require("@prisma/client");
const rxjs_1 = require("rxjs");
const db_1 = require("./db");
const L = __importStar(require("./lib"));
/** In-memory operating counters for the platform status screen. They reset when the server restarts. */
exports.opStats = { startedAt: Date.now(), errors: 0, lastErrorAt: null, backupOkAt: null, backupFailedAt: null, backupScheduled: false, backupIntervalHours: 0 };
let PrismaService = class PrismaService extends client_1.PrismaClient {
    constructor() { super({ datasources: process.env.DATABASE_URL ? { db: { url: process.env.DATABASE_URL } } : undefined }); }
    async onModuleInit() { await this.$connect(); }
    async onModuleDestroy() { await this.$disconnect(); }
    /** One interactive transaction with the tenant (or system) context that Postgres row-level security reads. */
    async scoped(scope, fn) {
        return this.$transaction(async (tx) => {
            await tx.$queryRawUnsafe(`SELECT set_config('app.tenant_id', $1, true), set_config('app.system', $2, true)`, scope.tid ? String(scope.tid) : '', scope.system ? 'on' : '');
            return fn(new db_1.Db(tx));
        }, { timeout: 30000, maxWait: 10000 });
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PrismaService);
exports.PUBLIC = 'public', exports.PERM = 'perm', exports.SUPER = 'super', exports.ANY_AUTH = 'any_auth';
const Public = () => (0, common_1.SetMetadata)(exports.PUBLIC, true);
exports.Public = Public;
const Perm = (p) => (0, common_1.SetMetadata)(exports.PERM, p);
exports.Perm = Perm;
const SuperOnly = () => (0, common_1.SetMetadata)(exports.SUPER, true);
exports.SuperOnly = SuperOnly;
const AnyAuth = () => (0, common_1.SetMetadata)(exports.ANY_AUTH, true); // any logged-in user, regardless of role
exports.AnyAuth = AnyAuth;
exports.C = (0, common_1.createParamDecorator)((_d, ec) => {
    const r = ec.switchToHttp().getRequest();
    return { db: r.db, tid: r.auth?.tenant?.id, user: r.auth?.user, tenant: r.auth?.tenant, req: r };
});
exports.COOKIE = 'mq_session';
const SESSION_MS = 12 * 3600 * 1000;
function sessionCookie(token, clear = false) {
    const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
    return `${exports.COOKIE}=${clear ? '' : token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : SESSION_MS / 1000}${secure}`;
}
let AuthGuard = class AuthGuard {
    prisma;
    reflector;
    constructor(prisma, reflector) {
        this.prisma = prisma;
        this.reflector = reflector;
    }
    async canActivate(ec) {
        const req = ec.switchToHttp().getRequest();
        const h = ec.getHandler(), c = ec.getClass();
        const isPublic = this.reflector.getAllAndOverride(exports.PUBLIC, [h, c]);
        // CSRF: cookie is SameSite=Strict; additionally require a custom header and a same-origin Origin on writes
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.path.startsWith('/api')) {
            if (req.headers['x-requested-with'] !== 'marqueepro')
                throw new L.HttpError(403, 'Missing request header');
            const origin = req.headers.origin;
            if (origin && new URL(origin).host !== req.headers.host)
                throw new L.HttpError(403, 'Cross-origin request blocked');
        }
        if (isPublic)
            return true;
        const token = (req.headers.cookie || '').split(/;\s*/).map((x) => x.split('=')).find((x) => x[0] === exports.COOKIE)?.[1];
        if (!token)
            throw new L.HttpError(401, 'Please sign in');
        const auth = await this.prisma.scoped({ system: true }, async (db) => {
            const s = await db.get('SELECT * FROM sessions WHERE token_hash=? AND expires_at > ?', L.sha(token), Date.now());
            if (!s)
                return null;
            const user = await db.get('SELECT id, tenant_id, username, name, role, branch_id, status, must_change_password FROM users WHERE id=?', s.user_id);
            if (!user || user.status !== 'active')
                return null;
            const tenant = user.tenant_id ? await db.get('SELECT * FROM tenants WHERE id=?', user.tenant_id) : null;
            return { user, tenant };
        });
        if (!auth)
            throw new L.HttpError(401, 'Session expired. Please sign in again.');
        req.auth = auth;
        req.sessionToken = token;
        const isSuper = auth.user.role === 'super';
        if (this.reflector.getAllAndOverride(exports.SUPER, [h, c]) && !isSuper)
            throw L.forbidden('Platform admin only');
        if (!isSuper && auth.tenant?.access_blocked)
            throw new L.HttpError(403, 'This business account is suspended. Contact the platform admin.', 'ACCESS_SUSPENDED');
        if (!isSuper && !this.reflector.getAllAndOverride(exports.SUPER, [h, c])) {
            const need = this.reflector.getAllAndOverride(exports.PERM, [h, c]);
            if (need && !L.can(auth.user.role, need))
                throw L.forbidden();
            if (!need && !this.reflector.getAllAndOverride(exports.ANY_AUTH, [h, c]))
                throw L.forbidden();
            if (auth.user.must_change_password && !req.path.includes('/auth/'))
                throw new L.HttpError(403, 'Please change your password first', 'MUST_CHANGE_PASSWORD');
            // Suspended / cancelled businesses keep read and export access (history is never deleted) but cannot write.
            if (['suspended', 'cancelled'].includes(auth.tenant?.status) && !['GET', 'HEAD'].includes(req.method) && !req.path.includes('/auth/')) {
                throw new L.HttpError(402, `This business account is ${auth.tenant.status}. Records are read-only until the platform admin reactivates it.`, 'SUSPENDED');
            }
        }
        return true;
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(PrismaService)),
    __param(1, (0, common_1.Inject)(core_1.Reflector)),
    __metadata("design:paramtypes", [PrismaService, core_1.Reflector])
], AuthGuard);
let TxInterceptor = class TxInterceptor {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    intercept(ec, next) {
        const req = ec.switchToHttp().getRequest();
        const a = req.auth;
        const scope = a ? (a.user.role === 'super' ? { system: true } : { tid: a.tenant.id }) : { system: true };
        const lang = req.query?.lang === 'ur' ? 'ur' : 'en';
        return (0, rxjs_1.from)(pdfUr_1.pdfLang.run(lang, () => this.prisma.scoped(scope, async (db) => { req.db = db; return (0, rxjs_1.lastValueFrom)(next.handle()); })));
    }
};
exports.TxInterceptor = TxInterceptor;
exports.TxInterceptor = TxInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(PrismaService)),
    __metadata("design:paramtypes", [PrismaService])
], TxInterceptor);
const PG_MAP = {
    '23P01': [409, 'This hall is not free for that time (another booking or block overlaps).'],
    '23505': [409, 'That already exists.'], '23503': [400, 'That record refers to something that does not exist.'], '23514': [400, 'A value is out of the allowed range.'],
};
let AllExceptions = class AllExceptions {
    catch(e, host) {
        const res = host.switchToHttp().getResponse();
        let status = 500, message = 'Something went wrong', code = e?.code;
        if (e instanceof L.HttpError) {
            status = e.status;
            message = e.message;
            code = e.code;
        }
        else if (typeof e?.getStatus === 'function') {
            status = e.getStatus();
            const r = e.getResponse?.();
            message = typeof r === 'string' ? r : r?.message || e.message;
            if (Array.isArray(message))
                message = message.join(', ');
            code = undefined;
        }
        else {
            const txt = String(e?.message || '');
            const pg = e?.meta?.code || (/(\b23P01\b)/.test(txt) ? '23P01' : /\b23505\b/.test(txt) ? '23505' : /\b23503\b/.test(txt) ? '23503' : /\b23514\b/.test(txt) ? '23514' : '');
            if (/OVERLAP/.test(txt)) {
                status = 409;
                message = PG_MAP['23P01'][1];
                code = 'OVERLAP';
            }
            else if (/APPEND_ONLY|INVOICE_FROZEN/.test(txt)) {
                status = 409;
                message = 'This record is locked and cannot be changed. Use a correction instead.';
                code = 'LOCKED';
            }
            else if (/CROSS_TENANT/.test(txt)) {
                status = 400;
                message = 'That record does not belong to this business.';
                code = 'CROSS_TENANT';
            }
            else if (PG_MAP[pg]) {
                [status, message] = PG_MAP[pg];
                code = pg;
            }
            else {
                exports.opStats.errors += 1;
                exports.opStats.lastErrorAt = new Date().toISOString();
                console.error('[error]', txt.slice(0, 500), process.env.SCC_DEBUG ? e?.stack : '');
                code = undefined;
            }
        }
        if (String(host.switchToHttp().getRequest()?.originalUrl || '').startsWith('/_scc/')) {
            res.status(status).json({ error: e?.sccCode || (status === 400 ? 'bad_json' : null) || (status === 500 ? 'product_error' : code) || 'error', message });
            return;
        }
        res.status(status).json({ error: message, code });
    }
};
exports.AllExceptions = AllExceptions;
exports.AllExceptions = AllExceptions = __decorate([
    (0, common_1.Catch)()
], AllExceptions);
// login throttling (per username + ip), in memory
const fails = new Map();
exports.throttle = {
    check(k) { const f = fails.get(k); if (f && f.until > Date.now())
        throw new L.HttpError(429, 'Too many wrong attempts. Try again in a few minutes.'); },
    fail(k) { const f = fails.get(k) || { n: 0, until: 0 }; f.n++; if (f.n >= 5) {
        f.until = Date.now() + 5 * 60000;
        f.n = 0;
    } fails.set(k, f); },
    ok(k) { fails.delete(k); },
};
exports.SESSION_TTL = SESSION_MS;
//# sourceMappingURL=infra.js.map