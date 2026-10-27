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
Object.defineProperty(exports, "__esModule", { value: true });
exports.can = exports.ROLE_PERMS = exports.str = exports.newToken = exports.sha = exports.nowIso = exports.shiftMin = exports.fmtMoney = exports.taxOf = exports.lineTotal = exports.forbidden = exports.notFound = exports.bad = exports.HttpError = void 0;
exports.parseMoney = parseMoney;
exports.parseQty = parseQty;
exports.parseBp = parseBp;
exports.checkDate = checkDate;
exports.checkDT = checkDT;
exports.todayIn = todayIn;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.randomPassword = randomPassword;
exports.checkPasswordStrength = checkPasswordStrength;
const crypto = __importStar(require("node:crypto"));
class HttpError extends Error {
    status;
    code;
    constructor(status, msg, code) {
        super(msg);
        this.status = status;
        this.code = code;
    }
}
exports.HttpError = HttpError;
const bad = (m, c) => new HttpError(400, m, c);
exports.bad = bad;
const notFound = (m = 'Not found') => new HttpError(404, m);
exports.notFound = notFound;
const forbidden = (m = 'Not allowed for your role') => new HttpError(403, m);
exports.forbidden = forbidden;
// ---- money: integer minor units (1 rupee = 100 paisa). Never floats. ----
function parseMoney(v, o = {}) {
    const { allowZero = true, field = 'Amount' } = o;
    if (typeof v === 'number') {
        if (!Number.isFinite(v))
            throw (0, exports.bad)(`${field} is not a number`);
        v = String(v);
    }
    if (typeof v !== 'string')
        throw (0, exports.bad)(`${field} is required`);
    const s = v.replace(/[,\s]/g, '').replace(/^(rs\.?|pkr)/i, '');
    if (!/^\d{1,13}(\.\d{1,2})?$/.test(s))
        throw (0, exports.bad)(`${field} must be a positive number with at most 2 decimals`);
    const [a, b = ''] = s.split('.');
    const n = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (!allowZero && n === 0)
        throw (0, exports.bad)(`${field} must be more than zero`);
    return n;
}
function parseQty(v, o = {}) {
    const s = String(v ?? '').replace(/,/g, '').trim();
    if (!/^\d{1,9}(\.\d{1,3})?$/.test(s))
        throw (0, exports.bad)(`${o.field || 'Quantity'} must be a number (max 3 decimals)`);
    const [a, b = ''] = s.split('.');
    const n = Number(a) * 1000 + Number((b + '000').slice(0, 3));
    if (!o.allowZero && n === 0)
        throw (0, exports.bad)(`${o.field || 'Quantity'} must be more than zero`);
    return n;
}
const lineTotal = (qtyMilli, unitMinor) => Math.round((qtyMilli * unitMinor) / 1000);
exports.lineTotal = lineTotal;
const taxOf = (base, bp) => Math.round((base * bp) / 10000);
exports.taxOf = taxOf;
function parseBp(v, field = 'Tax rate') {
    const s = String(v ?? '0').trim();
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s))
        throw (0, exports.bad)(`${field} must be a percent like 5 or 16.5`);
    const bp = Math.round(parseFloat(s) * 100);
    if (bp > 10000)
        throw (0, exports.bad)(`${field} cannot exceed 100%`);
    return bp;
}
const fmtMoney = (minor) => (minor / 100).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
exports.fmtMoney = fmtMoney;
// ---- dates: venue-local wall clock strings, compared lexicographically ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
function checkDate(s, field = 'Date') {
    if (!DATE_RE.test(String(s)))
        throw (0, exports.bad)(`${field} must be YYYY-MM-DD`);
    const d = new Date(s + 'T00:00:00Z');
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s)
        throw (0, exports.bad)(`${field} is not a real date`);
    return s;
}
function checkDT(s, field = 'Date/time') {
    if (!DT_RE.test(String(s)))
        throw (0, exports.bad)(`${field} must be YYYY-MM-DDTHH:MM`);
    const d = new Date(s + ':00Z');
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 16) !== s)
        throw (0, exports.bad)(`${field} is not a real date/time`);
    return s;
}
const shiftMin = (dt, mins) => new Date(new Date(dt + ':00Z').getTime() + mins * 60000).toISOString().slice(0, 16);
exports.shiftMin = shiftMin;
function todayIn(tz) {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    }
    catch {
        return new Date().toISOString().slice(0, 10);
    }
}
const nowIso = () => new Date().toISOString();
exports.nowIso = nowIso;
// ---- passwords / tokens ----
function hashPassword(pw) {
    const salt = crypto.randomBytes(16);
    const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
    return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function verifyPassword(pw, stored) {
    const [alg, s, h] = String(stored).split('$');
    if (alg !== 'scrypt')
        return false;
    const calc = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64, { N: 16384, r: 8, p: 1 });
    const want = Buffer.from(h, 'hex');
    return want.length === calc.length && crypto.timingSafeEqual(want, calc);
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
exports.sha = sha;
const newToken = () => crypto.randomBytes(32).toString('base64url');
exports.newToken = newToken;
function randomPassword(n = 12) {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let o = '';
    for (const b of crypto.randomBytes(n))
        o += a[b % a.length];
    return o;
}
function checkPasswordStrength(pw) {
    if (typeof pw !== 'string' || pw.length < 8)
        throw (0, exports.bad)('Password must be at least 8 characters');
    if (pw.length > 200)
        throw (0, exports.bad)('Password too long');
}
const str = (v, field, o = {}) => {
    const { max = 200, required = false } = o;
    if (v === undefined || v === null || String(v).trim() === '') {
        if (required)
            throw (0, exports.bad)(`${field} is required`);
        return null;
    }
    const s = String(v).trim();
    if (s.length > max)
        throw (0, exports.bad)(`${field} is too long`);
    return s;
};
exports.str = str;
// ---- roles & permissions: enforced by the API on every request ----
const ALL = '*';
exports.ROLE_PERMS = {
    owner: [ALL],
    manager: ['customers.read', 'customers.write', 'bookings.read', 'bookings.write', 'bookings.confirm', 'invoices.read', 'invoices.write', 'invoices.discount',
        'invoices.void', 'payments.read', 'payments.write', 'payments.refund', 'expenses.read', 'expenses.write', 'vendors.read', 'vendors.write', 'inventory.read',
        'inventory.write', 'catering.read', 'catering.write', 'staff.read', 'staff.write', 'reports.read', 'venues.write', 'tasks.update', 'notify.write', 'audit.read'],
    accountant: ['customers.read', 'bookings.read', 'invoices.read', 'invoices.write', 'invoices.discount', 'invoices.void', 'payments.read', 'payments.write',
        'payments.refund', 'expenses.read', 'expenses.write', 'vendors.read', 'vendors.write', 'staff.read', 'payroll', 'reports.read', 'audit.read'],
    booking: ['customers.read', 'customers.write', 'bookings.read', 'bookings.write', 'bookings.confirm', 'invoices.read', 'invoices.write', 'payments.read', 'payments.write',
        'catering.read', 'notify.write'],
    store: ['bookings.read', 'inventory.read', 'inventory.write', 'catering.read', 'vendors.read'],
    event_staff: ['bookings.read.limited', 'tasks.update'],
};
const can = (role, perm) => { const p = exports.ROLE_PERMS[role]; return !!p && (p.includes(ALL) || p.includes(perm)); };
exports.can = can;
//# sourceMappingURL=lib.js.map