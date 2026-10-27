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
exports.OPS_CONTROLLERS = exports.NotifyController = exports.InventoryController = exports.StaffController = exports.VendorController = exports.CatalogController = void 0;
const common_1 = require("@nestjs/common");
const L = __importStar(require("./lib"));
const D = __importStar(require("./domain"));
const infra_1 = require("./infra");
const METHODS = ['cash', 'bank', 'card', 'digital', 'cheque'];
const method = (m) => { if (!METHODS.includes(m))
    throw L.bad('Choose a payment method'); return m; };
const today = async (c) => L.todayIn((await c.db.get('SELECT timezone FROM tenants WHERE id=?', c.tid)).timezone);
const act = (v) => (v === undefined ? null : v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
// ---------- packages & service catalog ----------
let CatalogController = class CatalogController {
    pk(c) { return c.db.all('SELECT * FROM packages WHERE tenant_id=? ORDER BY name', c.tid); }
    async addPk(c, b) {
        const r = await c.db.run('INSERT INTO packages(tenant_id,name,per_head_minor,description,created_at) VALUES(?,?,?,?,?)', c.tid, L.str(b.name, 'Package name', { required: true, max: 100 }), L.parseMoney(b.per_head || '0', { field: 'Per-head rate', allowZero: true }), L.str(b.description, 'Description', { max: 1000 }), L.nowIso());
        await D.audit(c.db, c, 'package.create', 'package', r.id);
        return c.db.get('SELECT * FROM packages WHERE id=?', r.id);
    }
    async editPk(c, id, b) {
        const p = await D.own(c.db, 'packages', id, c.tid, 'Package');
        await c.db.run('UPDATE packages SET name=COALESCE(?,name), per_head_minor=COALESCE(?,per_head_minor), description=COALESCE(?,description), active=COALESCE(?,active) WHERE id=? AND tenant_id=?', L.str(b.name, 'Name', { max: 100 }), b.per_head === undefined ? null : L.parseMoney(b.per_head || '0', { allowZero: true }), L.str(b.description, 'Description', { max: 1000 }), act(b.active), p.id, c.tid);
        return c.db.get('SELECT * FROM packages WHERE id=?', p.id);
    }
    sc(c) { return c.db.all('SELECT * FROM service_catalog WHERE tenant_id=? ORDER BY category,name', c.tid); }
    async addSc(c, b) {
        const r = await c.db.run('INSERT INTO service_catalog(tenant_id,name,category,default_price_minor,created_at) VALUES(?,?,?,?,?)', c.tid, L.str(b.name, 'Service name', { required: true, max: 100 }), L.str(b.category, 'Category', { max: 60 }), L.parseMoney(b.default_price || '0', { allowZero: true, field: 'Price' }), L.nowIso());
        return c.db.get('SELECT * FROM service_catalog WHERE id=?', r.id);
    }
};
exports.CatalogController = CatalogController;
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('packages'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "pk", null);
__decorate([
    (0, infra_1.Perm)('venues.write'),
    (0, common_1.Post)('packages'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "addPk", null);
__decorate([
    (0, infra_1.Perm)('venues.write'),
    (0, common_1.Patch)('packages/:id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "editPk", null);
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('service-catalog'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "sc", null);
__decorate([
    (0, infra_1.Perm)('venues.write'),
    (0, common_1.Post)('service-catalog'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "addSc", null);
exports.CatalogController = CatalogController = __decorate([
    (0, common_1.Controller)('api')
], CatalogController);
// ---------- vendors: bills, advances, payments, payable ----------
let VendorController = class VendorController {
    vendors(c) {
        return c.db.all(`SELECT v.*, COALESCE((SELECT SUM(total_minor) FROM vendor_bills b WHERE b.vendor_id=v.id AND b.voided=0 AND b.kind='bill'),0) AS billed_minor,
      COALESCE((SELECT SUM(amount_minor) FROM vendor_payments p WHERE p.vendor_id=v.id),0) AS paid_minor FROM vendors v WHERE v.tenant_id=? ORDER BY v.name`, c.tid)
            .then((r) => r.map((v) => ({ ...v, payable_minor: v.billed_minor - v.paid_minor })));
    }
    async add(c, b) {
        const r = await c.db.run('INSERT INTO vendors(tenant_id,name,phone,vendor_type,notes,created_at) VALUES(?,?,?,?,?,?)', c.tid, L.str(b.name, 'Vendor name', { required: true, max: 100 }), L.str(b.phone, 'Phone', { max: 40 }), L.str(b.vendor_type, 'Type', { max: 60 }), L.str(b.notes, 'Notes', { max: 1000 }), L.nowIso());
        await D.audit(c.db, c, 'vendor.create', 'vendor', r.id);
        return c.db.get('SELECT * FROM vendors WHERE id=?', r.id);
    }
    bills(c) {
        return c.db.all(`SELECT b.*, v.name AS vendor_name, COALESCE((SELECT SUM(amount_minor) FROM vendor_payments p WHERE p.vendor_bill_id=b.id),0) AS paid_minor
      FROM vendor_bills b JOIN vendors v ON v.id=b.vendor_id WHERE b.tenant_id=? ORDER BY b.id DESC LIMIT 300`, c.tid);
    }
    async addBill(c, b) {
        const v = await D.own(c.db, 'vendors', b.vendor_id, c.tid, 'Vendor');
        const br = await D.own(c.db, 'branches', b.branch_id, c.tid, 'Branch');
        const bk = b.booking_id ? await D.own(c.db, 'bookings', b.booking_id, c.tid, 'Booking') : null;
        const kind = b.kind || 'bill';
        if (!['quotation', 'order', 'bill', 'advance'].includes(kind))
            throw L.bad('Bad bill type');
        const on = b.billed_on ? L.checkDate(b.billed_on, 'Bill date') : await today(c);
        const r = await c.db.run('INSERT INTO vendor_bills(tenant_id,vendor_id,branch_id,booking_id,kind,total_minor,billed_on,due_on,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', c.tid, v.id, br.id, bk?.id ?? null, kind, L.parseMoney(b.total, { allowZero: true, field: 'Total' }), on, b.due_on ? L.checkDate(b.due_on, 'Due date') : null, L.str(b.note, 'Note', { max: 500 }), c.user.id, L.nowIso());
        await D.audit(c.db, c, 'vendor_bill.create', 'vendor_bill', r.id);
        return c.db.get('SELECT * FROM vendor_bills WHERE id=?', r.id);
    }
    /** Voids a vendor bill (never deletes it): the row stays with who, when and why. Refused when any payment is recorded against it - this version has no vendor-payment reversal, so nothing is netted or refunded automatically. Voiding a bill raised from a purchase order frees that order's received value to be billed again or the order to be cancelled. */
    async voidBill(c, id, b) {
        const reason = L.str(b?.reason, 'Reason', { required: true, max: 300 });
        const pre = await D.own(c.db, 'vendor_bills', Number(id), c.tid, 'Vendor bill');
        if (pre.po_id)
            await c.db.get('SELECT id FROM purchase_orders WHERE id=? AND tenant_id=? FOR UPDATE', pre.po_id, c.tid); // same lock order as billing/cancelling the order
        const bl = await c.db.get('SELECT * FROM vendor_bills WHERE id=? AND tenant_id=? FOR UPDATE', pre.id, c.tid);
        if (Number(bl.voided))
            throw L.bad('This bill is already voided');
        const paid = await c.db.get('SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor),0) AS s FROM vendor_payments WHERE vendor_bill_id=? AND tenant_id=?', bl.id, c.tid);
        if (Number(paid.n) > 0)
            throw L.bad('A payment is recorded against this bill, so it cannot be voided. This version has no way to reverse a vendor payment, and nothing is changed automatically.', 'bill_has_payments');
        await c.db.run('UPDATE vendor_bills SET voided=1, void_reason=?, voided_by=?, voided_at=? WHERE id=? AND tenant_id=?', reason, c.user.id, L.nowIso(), bl.id, c.tid);
        await D.audit(c.db, c, 'vendor_bill.void', 'vendor_bill', bl.id, { total_minor: Number(bl.total_minor), po: bl.po_id ? Number(bl.po_id) : undefined, reason });
        return c.db.get('SELECT * FROM vendor_bills WHERE id=?', bl.id);
    }
    async pay(c, b) {
        const v = await D.own(c.db, 'vendors', b.vendor_id, c.tid, 'Vendor');
        let billId = null;
        if (b.vendor_bill_id) {
            await D.own(c.db, 'vendor_bills', b.vendor_bill_id, c.tid, 'Bill');
            const bl = await c.db.get('SELECT * FROM vendor_bills WHERE id=? AND tenant_id=? FOR UPDATE', Number(b.vendor_bill_id), c.tid); // serialize with a void of the same bill
            if (bl.vendor_id !== v.id)
                throw L.bad('That bill belongs to another vendor');
            if (Number(bl.voided))
                throw L.bad('That bill is voided, so a payment cannot be recorded against it');
            billId = bl.id;
        }
        const r = await c.db.run('INSERT INTO vendor_payments(tenant_id,vendor_id,vendor_bill_id,amount_minor,method,paid_on,is_advance,reference,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', c.tid, v.id, billId, L.parseMoney(b.amount, { allowZero: false, field: 'Amount' }), method(b.method || 'cash'), b.paid_on ? L.checkDate(b.paid_on, 'Date') : await today(c), b.is_advance ? 1 : 0, L.str(b.reference, 'Reference', { max: 100 }), L.str(b.note, 'Note', { max: 500 }), c.user.id, L.nowIso());
        await D.audit(c.db, c, 'vendor_payment.create', 'vendor_payment', r.id);
        return c.db.get('SELECT * FROM vendor_payments WHERE id=?', r.id);
    }
};
exports.VendorController = VendorController;
__decorate([
    (0, infra_1.Perm)('vendors.read'),
    (0, common_1.Get)('vendors'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], VendorController.prototype, "vendors", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Post)('vendors'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], VendorController.prototype, "add", null);
__decorate([
    (0, infra_1.Perm)('vendors.read'),
    (0, common_1.Get)('vendor-bills'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], VendorController.prototype, "bills", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Post)('vendor-bills'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], VendorController.prototype, "addBill", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Post)('vendor-bills/:id/void'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], VendorController.prototype, "voidBill", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Post)('vendor-payments'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], VendorController.prototype, "pay", null);
exports.VendorController = VendorController = __decorate([
    (0, common_1.Controller)('api')
], VendorController);
// ---------- staff, attendance, payroll ----------
let StaffController = class StaffController {
    list(c) { return c.db.all('SELECT * FROM employees WHERE tenant_id=? ORDER BY name', c.tid); }
    async add(c, b) {
        const br = await D.own(c.db, 'branches', b.branch_id, c.tid, 'Branch');
        const pt = b.pay_type || 'monthly';
        if (!['monthly', 'daily'].includes(pt))
            throw L.bad('Pay type must be monthly or daily');
        const r = await c.db.run('INSERT INTO employees(tenant_id,branch_id,name,job_title,phone,pay_type,pay_minor,overtime_rate_minor,created_at) VALUES(?,?,?,?,?,?,?,?,?)', c.tid, br.id, L.str(b.name, 'Name', { required: true, max: 100 }), L.str(b.job_title, 'Job title', { max: 60 }), L.str(b.phone, 'Phone', { max: 40 }), pt, L.parseMoney(b.pay || '0', { allowZero: true, field: 'Pay' }), L.parseMoney(b.overtime_rate || '0', { allowZero: true, field: 'Overtime rate' }), L.nowIso());
        await D.audit(c.db, c, 'employee.create', 'employee', r.id);
        return c.db.get('SELECT * FROM employees WHERE id=?', r.id);
    }
    async mark(c, b) {
        const e = await D.own(c.db, 'employees', b.employee_id, c.tid, 'Employee');
        if (!['present', 'absent', 'leave', 'half'].includes(b.status))
            throw L.bad('Bad attendance status');
        const ot = Number(b.overtime_min || 0);
        if (!Number.isInteger(ot) || ot < 0 || ot > 1440)
            throw L.bad('Overtime minutes must be 0-1440');
        const day = L.checkDate(b.day, 'Day');
        await c.db.run('INSERT INTO attendance(tenant_id,employee_id,day,status,overtime_min) VALUES(?,?,?,?,?) ON CONFLICT (employee_id,day) DO UPDATE SET status=EXCLUDED.status, overtime_min=EXCLUDED.overtime_min', c.tid, e.id, day, b.status, ot);
        return { ok: true };
    }
    att(c, month) {
        if (!/^\d{4}-\d{2}$/.test(month || ''))
            throw L.bad('month must be YYYY-MM');
        return c.db.all("SELECT * FROM attendance WHERE tenant_id=? AND day LIKE ? ORDER BY day", c.tid, month + '-%');
    }
    /** Payroll preview from attendance. Rates come from the employee record entered by the owner; nothing is assumed. */
    async calc(c, e, period) {
        const rows = await c.db.all('SELECT status, overtime_min FROM attendance WHERE employee_id=? AND tenant_id=? AND day LIKE ?', e.id, c.tid, period + '-%');
        const full = rows.filter((r) => r.status === 'present').length, half = rows.filter((r) => r.status === 'half').length;
        const otMin = rows.reduce((s, r) => s + r.overtime_min, 0);
        const base = e.pay_type === 'daily' ? Math.round(e.pay_minor * (full + half / 2)) : e.pay_minor;
        const overtime = Math.round((e.overtime_rate_minor * otMin) / 60);
        return { employee_id: e.id, name: e.name, period, days_present: full, half_days: half, overtime_min: otMin, base_minor: base, overtime_minor: overtime };
    }
    async preview(c, period) {
        if (!/^\d{4}-\d{2}$/.test(period || ''))
            throw L.bad('period must be YYYY-MM');
        const es = await c.db.all('SELECT * FROM employees WHERE tenant_id=? AND active=1 ORDER BY name', c.tid);
        const paid = await c.db.all('SELECT employee_id FROM payroll_entries WHERE tenant_id=? AND period=?', c.tid, period);
        const out = [];
        for (const e of es)
            out.push({ ...(await this.calc(c, e, period)), already_paid: paid.some((p) => p.employee_id === e.id) });
        return out;
    }
    async pay(c, b) {
        const e = await D.own(c.db, 'employees', b.employee_id, c.tid, 'Employee');
        if (!/^\d{4}-\d{2}$/.test(b.period || ''))
            throw L.bad('period must be YYYY-MM');
        const k = await this.calc(c, e, b.period);
        const ded = L.parseMoney(b.deduction || '0', { allowZero: true, field: 'Deduction' });
        const net = k.base_minor + k.overtime_minor - ded;
        if (net < 0)
            throw L.bad('Deduction is more than pay');
        const r = await c.db.run('INSERT INTO payroll_entries(tenant_id,employee_id,period,base_minor,overtime_minor,deduction_minor,net_minor,method,paid_on,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', c.tid, e.id, b.period, k.base_minor, k.overtime_minor, ded, net, method(b.method || 'cash'), await today(c), L.str(b.note, 'Note', { max: 300 }), c.user.id, L.nowIso());
        await D.audit(c.db, c, 'payroll.pay', 'employee', e.id, { period: b.period, net });
        return c.db.get('SELECT * FROM payroll_entries WHERE id=?', r.id);
    }
};
exports.StaffController = StaffController;
__decorate([
    (0, infra_1.Perm)('staff.read'),
    (0, common_1.Get)('employees'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('staff.write'),
    (0, common_1.Post)('employees'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "add", null);
__decorate([
    (0, infra_1.Perm)('staff.write'),
    (0, common_1.Post)('attendance'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "mark", null);
__decorate([
    (0, infra_1.Perm)('staff.read'),
    (0, common_1.Get)('attendance'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)('month')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "att", null);
__decorate([
    (0, infra_1.Perm)('payroll'),
    (0, common_1.Get)('payroll/preview'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)('period')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "preview", null);
__decorate([
    (0, infra_1.Perm)('payroll'),
    (0, common_1.Post)('payroll'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "pay", null);
exports.StaffController = StaffController = __decorate([
    (0, common_1.Controller)('api')
], StaffController);
// ---------- inventory, menu/recipes, food records ----------
const SIGN = { purchase: 1, return: 1, issue: -1, damage: -1, usage: -1 };
let InventoryController = class InventoryController {
    items(c) {
        return c.db.all(`SELECT i.*, COALESCE((SELECT SUM(qty_milli) FROM stock_movements m WHERE m.item_id=i.id AND m.kind<>'writeoff'),0) AS on_hand_milli FROM inventory_items i WHERE i.tenant_id=? ORDER BY i.name`, c.tid)
            .then((r) => r.map((i) => ({ ...i, low: i.on_hand_milli <= i.min_stock_milli && i.min_stock_milli > 0 })));
    }
    async add(c, b) {
        const r = await c.db.run('INSERT INTO inventory_items(tenant_id,name,category,unit,min_stock_milli,unit_cost_minor,consumable,supplier,created_at) VALUES(?,?,?,?,?,?,?,?,?)', c.tid, L.str(b.name, 'Item name', { required: true, max: 100 }), L.str(b.category, 'Category', { max: 60 }), L.str(b.unit, 'Unit', { max: 20 }) || 'pcs', b.min_stock ? L.parseQty(b.min_stock, { allowZero: true, field: 'Minimum stock' }) : 0, L.parseMoney(b.unit_cost || '0', { allowZero: true, field: 'Unit cost' }), b.consumable ? 1 : 0, L.str(b.supplier, 'Supplier', { max: 100 }), L.nowIso());
        await D.audit(c.db, c, 'inventory.create', 'inventory_item', r.id);
        return c.db.get('SELECT * FROM inventory_items WHERE id=?', r.id);
    }
    /** Stock is a ledger: movements are append-only; corrections are new "adjust" rows. */
    async move(c, b) {
        const it = await c.db.get('SELECT * FROM inventory_items WHERE id=? AND tenant_id=? FOR UPDATE', Number(b.item_id), c.tid);
        if (!it)
            throw L.notFound('Item not found');
        const kind = String(b.kind);
        if (!(kind in SIGN) && kind !== 'adjust')
            throw L.bad('Bad movement type');
        if (b.booking_id)
            await D.own(c.db, 'bookings', b.booking_id, c.tid, 'Booking');
        let q;
        if (kind === 'adjust') {
            const neg = String(b.qty).trim().startsWith('-');
            q = L.parseQty(String(b.qty).replace('-', ''), { field: 'Quantity' }) * (neg ? -1 : 1);
            if (!b.note)
                throw L.bad('Give a reason for the adjustment');
        }
        else
            q = L.parseQty(b.qty, { field: 'Quantity' }) * SIGN[kind];
        const have = (await c.db.get("SELECT COALESCE(SUM(qty_milli),0) s FROM stock_movements WHERE item_id=? AND kind<>'writeoff'", it.id)).s;
        if (have + q < 0)
            throw L.bad('Not enough stock for this movement');
        const loc = b.location_id ? await D.own(c.db, 'stock_locations', b.location_id, c.tid, 'Location') : null;
        if (loc && q < 0) {
            const at = Number((await c.db.get("SELECT COALESCE(SUM(qty_milli),0) s FROM stock_movements WHERE item_id=? AND location_id=? AND kind<>'writeoff'", it.id, loc.id)).s);
            if (at + q < 0)
                throw L.bad(`Not enough stock at ${loc.name} for this movement`);
        }
        const r = await c.db.run('INSERT INTO stock_movements(tenant_id,item_id,booking_id,kind,qty_milli,unit_cost_minor,note,created_by,created_at,location_id) VALUES(?,?,?,?,?,?,?,?,?,?)', c.tid, it.id, b.booking_id || null, kind, q, b.unit_cost ? L.parseMoney(b.unit_cost, { allowZero: true }) : null, L.str(b.note, 'Note', { max: 300 }), c.user.id, L.nowIso(), loc?.id ?? null);
        return { id: r.id, on_hand_milli: have + q };
    }
    locations(c) { return c.db.all('SELECT id, name, active FROM stock_locations WHERE tenant_id=? ORDER BY lower(name)', c.tid); }
    async addLocation(c, b) {
        const name = L.str(b.name, 'Name', { max: 80 });
        if (!name)
            throw L.bad('Name is required');
        const dup = await c.db.get('SELECT 1 AS x FROM stock_locations WHERE tenant_id=? AND lower(name)=lower(?)', c.tid, name);
        if (dup)
            throw new L.HttpError(409, 'A location with this name already exists', 'DUPLICATE');
        const r = await c.db.run('INSERT INTO stock_locations(tenant_id,name,created_at) VALUES(?,?,?)', c.tid, name, L.nowIso());
        await D.audit(c.db, c, 'stock_location.create', 'stock_location', r.id);
        return { id: r.id, name };
    }
    /** Move stock between locations (or from/to "Unassigned" when a side is left out). Two ledger rows; total on hand is unchanged. */
    async transfer(c, b) {
        const it = await c.db.get('SELECT * FROM inventory_items WHERE id=? AND tenant_id=? FOR UPDATE', Number(b.item_id), c.tid);
        if (!it)
            throw L.notFound('Item not found');
        const from = b.from_location_id ? await D.own(c.db, 'stock_locations', b.from_location_id, c.tid, 'From location') : null;
        const to = b.to_location_id ? await D.own(c.db, 'stock_locations', b.to_location_id, c.tid, 'To location') : null;
        if ((from?.id ?? null) === (to?.id ?? null))
            throw L.bad('Pick two different places');
        const q = L.parseQty(b.qty, { field: 'Quantity' });
        const at = Number((await c.db.get("SELECT COALESCE(SUM(qty_milli),0) s FROM stock_movements WHERE item_id=? AND tenant_id=? AND location_id IS NOT DISTINCT FROM ? AND kind<>'writeoff'", it.id, c.tid, from?.id ?? null)).s);
        if (at < q)
            throw L.bad(`Not enough stock at ${from?.name ?? 'Unassigned'} to move`);
        const note = L.str(b.note, 'Note', { max: 300 });
        const now = L.nowIso();
        await c.db.run('INSERT INTO stock_movements(tenant_id,item_id,kind,qty_milli,note,created_by,created_at,location_id) VALUES(?,?,?,?,?,?,?,?)', c.tid, it.id, 'transfer', -q, note, c.user.id, now, from?.id ?? null);
        const r = await c.db.run('INSERT INTO stock_movements(tenant_id,item_id,kind,qty_milli,note,created_by,created_at,location_id) VALUES(?,?,?,?,?,?,?,?)', c.tid, it.id, 'transfer', q, note, c.user.id, now, to?.id ?? null);
        await D.audit(c.db, c, 'stock.transfer', 'stock_movement', r.id);
        return { ok: true, qty_milli: q };
    }
    async byLocation(c) {
        const rows = await c.db.all(`SELECT i.id AS item_id, i.name AS item_name, i.unit, m.location_id, COALESCE(l.name,'Unassigned') AS location_name, SUM(m.qty_milli) AS on_hand_milli
      FROM stock_movements m JOIN inventory_items i ON i.id=m.item_id LEFT JOIN stock_locations l ON l.id=m.location_id
      WHERE m.tenant_id=? AND m.kind<>'writeoff' GROUP BY i.id, i.name, i.unit, m.location_id, l.name HAVING SUM(m.qty_milli)<>0 ORDER BY i.name, location_name`, c.tid);
        return rows.map((r) => ({ ...r, on_hand_milli: Number(r.on_hand_milli) }));
    }
    mv(c) { return c.db.all('SELECT m.*, i.name AS item_name FROM stock_movements m JOIN inventory_items i ON i.id=m.item_id WHERE m.tenant_id=? ORDER BY m.id DESC LIMIT 300', c.tid); }
    async menu(c) {
        const items = await c.db.all('SELECT * FROM menu_items WHERE tenant_id=? ORDER BY name', c.tid);
        const rec = await c.db.all('SELECT r.*, i.name AS item_name, i.unit FROM recipe_ingredients r JOIN inventory_items i ON i.id=r.inventory_item_id WHERE r.tenant_id=?', c.tid);
        return items.map((m) => ({ ...m, recipe: rec.filter((r) => r.menu_item_id === m.id) }));
    }
    async addMenu(c, b) {
        const r = await c.db.run('INSERT INTO menu_items(tenant_id,name,unit,price_minor,created_at) VALUES(?,?,?,?,?)', c.tid, L.str(b.name, 'Dish name', { required: true, max: 100 }), L.str(b.unit, 'Unit', { max: 20 }) || 'plate', L.parseMoney(b.price || '0', { allowZero: true }), L.nowIso());
        for (const g of b.recipe || []) {
            const it = await D.own(c.db, 'inventory_items', g.inventory_item_id, c.tid, 'Ingredient');
            await c.db.run('INSERT INTO recipe_ingredients(tenant_id,menu_item_id,inventory_item_id,qty_per_head_milli) VALUES(?,?,?,?)', c.tid, r.id, it.id, L.parseQty(g.qty_per_head, { field: 'Ingredient quantity' }));
        }
        return c.db.get('SELECT * FROM menu_items WHERE id=?', r.id);
    }
    async setMenu(c, id, b) {
        const bk = await D.own(c.db, 'bookings', id, c.tid, 'Booking');
        const m = await D.own(c.db, 'menu_items', b.menu_item_id, c.tid, 'Dish');
        await c.db.run('INSERT INTO booking_menu(tenant_id,booking_id,menu_item_id,note) VALUES(?,?,?,?) ON CONFLICT (booking_id,menu_item_id) DO UPDATE SET note=EXCLUDED.note', c.tid, bk.id, m.id, L.str(b.note, 'Note', { max: 200 }));
        return { ok: true };
    }
    /** Ingredient requirement for a booking = recipe qty per head x guests, compared with stock. */
    async req(c, id) {
        const bk = await D.own(c.db, 'bookings', id, c.tid, 'Booking');
        const rows = await c.db.all(`SELECT i.id, i.name, i.unit, SUM(r.qty_per_head_milli) AS per_head_milli, COALESCE((SELECT SUM(qty_milli) FROM stock_movements m WHERE m.item_id=i.id AND m.kind<>'writeoff'),0) AS on_hand_milli
      FROM booking_menu bm JOIN recipe_ingredients r ON r.menu_item_id=bm.menu_item_id JOIN inventory_items i ON i.id=r.inventory_item_id WHERE bm.booking_id=? AND bm.tenant_id=? GROUP BY i.id,i.name,i.unit`, bk.id, c.tid);
        return { guests: bk.guests, items: rows.map((r) => { const need = Math.round((r.per_head_milli * bk.guests)); return { ...r, needed_milli: need, short_milli: Math.max(0, need - r.on_hand_milli) }; }) };
    }
    async food(c, id, b) {
        const bk = await D.own(c.db, 'bookings', id, c.tid, 'Booking');
        if (!['cost', 'wastage', 'leftover'].includes(b.kind))
            throw L.bad('Bad record type');
        const r = await c.db.run('INSERT INTO food_records(tenant_id,booking_id,kind,description,amount_minor,created_at) VALUES(?,?,?,?,?,?)', c.tid, bk.id, b.kind, L.str(b.description, 'Description', { required: true, max: 300 }), L.parseMoney(b.amount || '0', { allowZero: true }), L.nowIso());
        return c.db.get('SELECT * FROM food_records WHERE id=?', r.id);
    }
    async foods(c, id) { const bk = await D.own(c.db, 'bookings', id, c.tid, 'Booking'); return c.db.all('SELECT * FROM food_records WHERE booking_id=? AND tenant_id=? ORDER BY id', bk.id, c.tid); }
    /** Estimated versus actual catering cost for one booking. Every figure comes from numbers the business entered: recipe quantities, the unit cost set on each stock item, the booking's per-head rate, and the cost records typed under the booking. No costing or margin policy is applied. */
    async cateringCost(c, id) {
        const bk = await D.own(c.db, 'bookings', id, c.tid, 'Booking');
        const rows = await c.db.all(`SELECT i.id, i.name, i.unit, i.unit_cost_minor, SUM(r.qty_per_head_milli) AS per_head_milli FROM booking_menu bm JOIN recipe_ingredients r ON r.menu_item_id=bm.menu_item_id JOIN inventory_items i ON i.id=r.inventory_item_id WHERE bm.booking_id=? AND bm.tenant_id=? GROUP BY i.id,i.name,i.unit,i.unit_cost_minor ORDER BY i.name`, bk.id, c.tid);
        const guests = Number(bk.guests) || 0, actualGuests = bk.actual_guests == null ? null : Number(bk.actual_guests), rate = Number(bk.per_head_minor) || 0;
        const items = rows.map((r) => { const needed = Math.round(Number(r.per_head_milli) * guests), unit = Number(r.unit_cost_minor); return { name: r.name, unit: r.unit, per_head_milli: Number(r.per_head_milli), needed_milli: needed, unit_cost_minor: unit, cost_minor: Math.round((needed * unit) / 1000), cost_missing: unit === 0 }; });
        const estTotal = items.reduce((t, x) => t + x.cost_minor, 0);
        const recs = await c.db.all('SELECT kind, amount_minor FROM food_records WHERE booking_id=? AND tenant_id=?', bk.id, c.tid);
        const sum = (k) => recs.filter((r) => r.kind === k).reduce((t, r) => t + Number(r.amount_minor), 0);
        const actTotal = sum('cost'), basisGuests = actualGuests && actualGuests > 0 ? actualGuests : guests;
        const per = (x, g) => (g > 0 ? Math.trunc(x / g) : null);
        const estPer = per(estTotal, guests), actPer = per(actTotal, basisGuests);
        return {
            guests, actual_guests: actualGuests, per_head_rate_minor: rate,
            estimate: { items, total_minor: estTotal, per_head_minor: estPer, missing_cost_items: items.filter((x) => x.cost_missing).length, basis: 'Recipe quantity per head x guests x the unit cost set on each stock item. Items with no unit cost count as 0 and are flagged. Only dishes on this booking\'s menu with recipes are included.' },
            actual: { cost_minor: actTotal, per_head_minor: actPer, wastage_minor: sum('wastage'), leftover_minor: sum('leftover'), basis: `Total of the cost records entered for this booking, over ${actualGuests && actualGuests > 0 ? 'actual guests' : 'booked guests'} (${basisGuests}). Wastage and leftover amounts are shown separately and are not added to the cost; enter them as cost too if the business counts them.` },
            margin_per_head: { rate_minor: rate, estimated_minor: rate > 0 && estPer !== null ? rate - estPer : null, actual_minor: rate > 0 && actPer !== null ? rate - actPer : null, basis: 'The booking\'s per-head rate minus the cost per head. Rent, extras and other expenses are not included.' },
        };
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, infra_1.Perm)('inventory.read'),
    (0, common_1.Get)('inventory'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "items", null);
__decorate([
    (0, infra_1.Perm)('inventory.write'),
    (0, common_1.Post)('inventory'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "add", null);
__decorate([
    (0, infra_1.Perm)('inventory.write'),
    (0, common_1.Post)('stock-movements'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "move", null);
__decorate([
    (0, infra_1.Perm)('inventory.read'),
    (0, common_1.Get)('stock-locations'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "locations", null);
__decorate([
    (0, infra_1.Perm)('inventory.write'),
    (0, common_1.Post)('stock-locations'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "addLocation", null);
__decorate([
    (0, infra_1.Perm)('inventory.write'),
    (0, common_1.Post)('stock-transfers'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "transfer", null);
__decorate([
    (0, infra_1.Perm)('inventory.read'),
    (0, common_1.Get)('inventory/by-location'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "byLocation", null);
__decorate([
    (0, infra_1.Perm)('inventory.read'),
    (0, common_1.Get)('stock-movements'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "mv", null);
__decorate([
    (0, infra_1.Perm)('catering.read'),
    (0, common_1.Get)('menu'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "menu", null);
__decorate([
    (0, infra_1.Perm)('catering.write'),
    (0, common_1.Post)('menu'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "addMenu", null);
__decorate([
    (0, infra_1.Perm)('catering.write'),
    (0, common_1.Post)('bookings/:id/menu'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "setMenu", null);
__decorate([
    (0, infra_1.Perm)('catering.read'),
    (0, common_1.Get)('bookings/:id/requirements'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "req", null);
__decorate([
    (0, infra_1.Perm)('catering.write'),
    (0, common_1.Post)('bookings/:id/food-records'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "food", null);
__decorate([
    (0, infra_1.Perm)('catering.read'),
    (0, common_1.Get)('bookings/:id/food-records'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "foods", null);
__decorate([
    (0, infra_1.Perm)('catering.read'),
    (0, common_1.Get)('bookings/:id/catering-cost'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "cateringCost", null);
exports.InventoryController = InventoryController = __decorate([
    (0, common_1.Controller)('api')
], InventoryController);
// ---------- customer messages: prepared text + wa.me link. The server NEVER sends anything. ----------
let NotifyController = class NotifyController {
    list(c) { return c.db.all('SELECT n.*, cu.name AS customer_name FROM notification_outbox n JOIN customers cu ON cu.id=n.customer_id WHERE n.tenant_id=? ORDER BY n.id DESC LIMIT 200', c.tid); }
    async prepare(c, b) {
        const bk = await D.own(c.db, 'bookings', b.booking_id, c.tid, 'Booking');
        const cu = await D.own(c.db, 'customers', bk.customer_id, c.tid, 'Customer');
        const t = await c.db.get('SELECT name FROM tenants WHERE id=?', c.tid);
        const v = await c.db.get('SELECT name FROM venues WHERE id=?', bk.venue_id);
        const fin = await D.bookingFinance(c.db, c.tid, bk.id);
        const T = {
            booking_confirmation: `Assalam o Alaikum ${cu.name}, aap ki booking ${bk.code} (${v.name}, ${bk.starts_at.replace('T', ' ')}) ${t.name} mein darj ho gayi hai.`,
            event_reminder: `Assalam o Alaikum ${cu.name}, yaad dehani: ${bk.code} ka event ${bk.starts_at.replace('T', ' ')} ko ${v.name} mein hai. - ${t.name}`,
            payment_reminder: `Assalam o Alaikum ${cu.name}, ${bk.code} ka baqaya Rs ${L.fmtMoney(Math.max(0, fin.outstanding_minor))} hai. - ${t.name}`,
        };
        const tpl = String(b.template);
        if (!T[tpl])
            throw L.bad('Unknown message template');
        const consent = !!cu.whatsapp_consent && !!cu.phone;
        const body = T[tpl];
        const r = await c.db.run('INSERT INTO notification_outbox(tenant_id,booking_id,customer_id,template,channel,body,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)', c.tid, bk.id, cu.id, tpl, 'whatsapp_link', body, consent ? 'prepared' : 'blocked_no_consent', c.user.id, L.nowIso());
        const digits = String(cu.phone || '').replace(/\D/g, '');
        const intl = digits.startsWith('0') ? '92' + digits.slice(1) : digits; // Pakistan-focused default; staff can edit the number in WhatsApp
        return { id: r.id, status: consent ? 'prepared' : 'blocked_no_consent', body, link: consent ? `https://wa.me/${intl}?text=${encodeURIComponent(body)}` : null,
            note: consent ? 'Nothing is sent by the system. A staff member must open the link and press send.' : 'Customer has not agreed to WhatsApp messages. No link created.' };
    }
    async opened(c, id) { const n = await D.own(c.db, 'notification_outbox', id, c.tid, 'Message'); await c.db.run("UPDATE notification_outbox SET status='opened', opened_at=? WHERE id=? AND tenant_id=? AND status='prepared'", L.nowIso(), n.id, c.tid); return { ok: true }; }
};
exports.NotifyController = NotifyController;
__decorate([
    (0, infra_1.Perm)('notify.write'),
    (0, common_1.Get)(),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotifyController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('notify.write'),
    (0, common_1.Post)('prepare'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NotifyController.prototype, "prepare", null);
__decorate([
    (0, infra_1.Perm)('notify.write'),
    (0, common_1.Post)(':id/opened'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NotifyController.prototype, "opened", null);
exports.NotifyController = NotifyController = __decorate([
    (0, common_1.Controller)('api/notifications')
], NotifyController);
exports.OPS_CONTROLLERS = [CatalogController, VendorController, StaffController, InventoryController, NotifyController];
//# sourceMappingURL=ops.js.map