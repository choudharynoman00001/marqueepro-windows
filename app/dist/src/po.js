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
exports.PO_CONTROLLERS = exports.VendorContractController = exports.PurchaseOrderController = void 0;
const pdfUr_1 = require("./pdfUr");
const common_1 = require("@nestjs/common");
const L = __importStar(require("./lib"));
const D = __importStar(require("./domain"));
const infra_1 = require("./infra");
const ops2_1 = require("./ops2");
/** Purchase orders to vendors. Receiving writes an ordinary 'purchase' stock movement (append-only ledger). No bill, payment, tax or terms are created or assumed. */
async function poView(c, id) {
    const po = await c.db.get('SELECT p.*, v.name AS vendor_name FROM purchase_orders p JOIN vendors v ON v.id=p.vendor_id WHERE p.id=? AND p.tenant_id=?', id, c.tid);
    if (!po)
        throw L.notFound('Purchase order not found');
    const lines = await c.db.all(`SELECT l.id, l.item_id, i.name AS item_name, i.unit, l.qty_milli, l.unit_cost_minor,
    COALESCE((SELECT SUM(r.qty_milli) FROM purchase_receipts r WHERE r.po_line_id=l.id),0) AS received_milli
    FROM purchase_order_lines l JOIN inventory_items i ON i.id=l.item_id WHERE l.po_id=? AND l.tenant_id=? ORDER BY l.id`, po.id, c.tid);
    const items = lines.map((l) => ({ ...l, qty_milli: Number(l.qty_milli), received_milli: Number(l.received_milli), outstanding_milli: Number(l.qty_milli) - Number(l.received_milli), unit_cost_minor: Number(l.unit_cost_minor) }));
    const anyRecv = items.some((l) => l.received_milli > 0), allRecv = items.every((l) => l.outstanding_milli <= 0);
    const state = po.status === 'cancelled' ? 'cancelled' : allRecv ? 'received' : anyRecv ? 'partly received' : 'open';
    const ordered_minor = items.reduce((a, l) => a + Math.round(l.qty_milli * l.unit_cost_minor / 1000), 0);
    const received_minor = items.reduce((a, l) => a + Math.round(l.received_milli * l.unit_cost_minor / 1000), 0);
    const bills = await c.db.all('SELECT id, kind, total_minor, billed_on, voided FROM vendor_bills WHERE po_id=? AND tenant_id=? ORDER BY id', po.id, c.tid);
    const billed_minor = bills.filter((x) => !x.voided).reduce((a, x) => a + Number(x.total_minor), 0);
    return { received_minor, billed_minor, unbilled_received_minor: Math.max(0, received_minor - billed_minor), bills: bills.map((x) => ({ ...x, total_minor: Number(x.total_minor) })), id: po.id, vendor_id: po.vendor_id, vendor_name: po.vendor_name, note: po.note, created_at: po.created_at, state, items, ordered_minor,
        basis: 'Ordered value is quantity x the unit cost you entered. It is not a vendor bill; record the bill separately under Vendor bills.' };
}
const reqId = (v) => { if (typeof v !== 'string' || v.trim() === '' || v.length > 64)
    throw L.bad('A request id (text, 1 to 64 characters) is required', 'request_id_required'); return v; };
let PurchaseOrderController = class PurchaseOrderController {
    async list(c) { const ids = await c.db.all('SELECT id FROM purchase_orders WHERE tenant_id=? ORDER BY id DESC LIMIT 200', c.tid); const out = []; for (const r of ids)
        out.push(await poView(c, Number(r.id))); return out; }
    /** Authoritative lookup of one receive request id on this order line (this tenant only): was it applied, and with what. */
    async lookup(c, id, rid) {
        reqId(rid);
        const r = await c.db.get('SELECT r.qty_milli, m.location_id, r.po_line_id AS line_id FROM purchase_receipts r JOIN stock_movements m ON m.id=r.movement_id WHERE r.po_id=? AND r.tenant_id=? AND (r.request_id=? OR r.legacy_request_id=?) ORDER BY r.id LIMIT 1', Number(id), c.tid, rid, rid);
        return r ? { applied: true, line_id: Number(r.line_id), qty_milli: Number(r.qty_milli), location_id: r.location_id == null ? null : Number(r.location_id) } : { applied: false };
    }
    /** Fence a request id: if it was not applied, it can never be applied later (under the order lock). If it was applied, say so. */
    async fence(c, id, rid) {
        const po = await c.db.get('SELECT * FROM purchase_orders WHERE id=? AND tenant_id=? FOR UPDATE', Number(id), c.tid);
        if (!po)
            throw L.notFound('Purchase order not found');
        const r = await this.lookup(c, id, rid);
        if (r.applied)
            return r;
        await c.db.run('INSERT INTO purchase_receipt_fences(tenant_id,po_id,request_id,created_by,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING', c.tid, po.id, reqId(rid), c.user.id, L.nowIso());
        await D.audit(c.db, c, 'po.receive_fence', 'vendor', po.vendor_id, { po: po.id, request_id: rid });
        return { applied: false, fenced: true };
    }
    /** Printable purchase order: lines, ordered and received quantities, and the values from the unit costs you entered. It states no terms, tax, delivery date or payment condition; add those by agreement with the vendor. */
    async doc(c, id) {
        const po = await poView(c, Number(id));
        const t = await (0, ops2_1.withLogo)(c);
        const v = await c.db.get('SELECT name, phone, vendor_type FROM vendors WHERE id=? AND tenant_id=?', po.vendor_id, c.tid);
        const qty = (m) => (Number(m) / 1000).toLocaleString('en-PK', { maximumFractionDigits: 3 });
        return new common_1.StreamableFile(await (0, ops2_1.pdfBuffer)((d) => {
            (0, ops2_1.head)(d, t, `PURCHASE ORDER PO-${po.id}` + (po.state === 'cancelled' ? ' (CANCELLED)' : ''), `Date ${String(po.created_at).slice(0, 10)}   Status: ${po.state}`);
            d.font('Helvetica-Bold').fontSize(12).fillColor('#111').text((0, pdfUr_1.T)('Vendor'), ops2_1.L0, d.y);
            d.font('Helvetica').fontSize(11).text(`${v?.name || ''}${v?.phone ? '   ' + v.phone : ''}${v?.vendor_type ? '   (' + v.vendor_type + ')' : ''}`, ops2_1.L0, d.y + 2);
            if (po.note)
                d.moveDown(0.5).text(`${(0, pdfUr_1.T)('Note')}: ${po.note}`, ops2_1.L0, d.y, { width: ops2_1.W0 });
            d.moveDown(0.8);
            const cols = [ops2_1.L0, ops2_1.L0 + 205, ops2_1.L0 + 255, ops2_1.L0 + 315, ops2_1.L0 + 345], hy = d.y;
            d.font('Helvetica-Bold').fontSize(10).fillColor('#111');
            [(0, pdfUr_1.T)('Item'), (0, pdfUr_1.T)('Unit'), (0, pdfUr_1.T)('Ordered'), (0, pdfUr_1.T)('Received'), (0, pdfUr_1.T)('Unit cost')].forEach((h, i) => d.text(h, cols[i], hy, { width: i === 0 ? 195 : i === 4 ? 70 : 55, align: i === 4 ? 'right' : 'left' }));
            d.text((0, pdfUr_1.T)('Line value'), ops2_1.L0 + 425, hy, { width: ops2_1.W0 - 425, align: 'right' });
            d.y = hy + 16;
            d.moveTo(ops2_1.L0, d.y - 2).lineTo(ops2_1.L0 + ops2_1.W0, d.y - 2).strokeColor('#bbb').stroke();
            for (const l of po.items) {
                if (d.y > 740) {
                    d.addPage();
                    d.y = 48;
                }
                const y = d.y;
                d.font('Helvetica').fontSize(10).fillColor('#111').text(String(l.item_name), cols[0], y, { width: 195 });
                const h = d.y - y;
                d.text(String(l.unit || ''), cols[1], y, { width: 46 }).text(qty(l.qty_milli), cols[2], y, { width: 55 }).text(qty(l.received_milli), cols[3], y, { width: 55 }).text((0, ops2_1.rs)(l.unit_cost_minor).replace('Rs ', ''), cols[4], y, { width: 70, align: 'right' }).text((0, ops2_1.rs)(Math.round(l.qty_milli * l.unit_cost_minor / 1000)).replace('Rs ', ''), ops2_1.L0 + 425, y, { width: ops2_1.W0 - 425, align: 'right' });
                d.y = y + Math.max(h, 14) + 4;
            }
            d.moveDown(0.6);
            (0, ops2_1.totalRow)(d, (0, pdfUr_1.T)('Ordered value'), (0, ops2_1.rs)(po.ordered_minor), true);
            (0, ops2_1.totalRow)(d, (0, pdfUr_1.T)('Received value'), (0, ops2_1.rs)(po.received_minor));
            if (po.bills.some((x) => !x.voided))
                (0, ops2_1.totalRow)(d, (0, pdfUr_1.T)('Billed so far'), (0, ops2_1.rs)(po.billed_minor));
            d.font('Helvetica').fontSize(9).fillColor('#555').text((0, pdfUr_1.T)('Record of what was entered in the system. Values are quantity x the unit cost entered. It states no terms, tax, delivery date or payment condition; add those by agreement with the vendor.'), ops2_1.L0, d.y + 8, { width: ops2_1.W0 });
            (0, ops2_1.credit)(d);
        }));
    }
    async get(c, id) { return poView(c, Number(id)); }
    async create(c, b) {
        const v = await D.own(c.db, 'vendors', Number(b.vendor_id), c.tid, 'Vendor');
        if (!Array.isArray(b.lines) || b.lines.length === 0)
            throw L.bad('Add at least one line');
        if (b.lines.length > 100)
            throw L.bad('Too many lines');
        const parsed = [];
        for (const g of b.lines) {
            const it = await D.own(c.db, 'inventory_items', Number(g.item_id), c.tid, 'Item');
            parsed.push({ it, qty: L.parseQty(g.qty, { field: 'Quantity' }), cost: L.parseMoney(g.unit_cost, { field: 'Unit cost', allowZero: true }) });
        }
        const r = await c.db.run('INSERT INTO purchase_orders(tenant_id,vendor_id,note,created_by,created_at) VALUES(?,?,?,?,?)', c.tid, v.id, L.str(b.note, 'Note', { max: 300 }) || '', c.user.id, L.nowIso());
        for (const p of parsed)
            await c.db.run('INSERT INTO purchase_order_lines(tenant_id,po_id,item_id,qty_milli,unit_cost_minor) VALUES(?,?,?,?,?)', c.tid, r.id, p.it.id, p.qty, p.cost);
        await D.audit(c.db, c, 'po.create', 'vendor', v.id, { po: r.id, lines: parsed.length });
        return poView(c, Number(r.id));
    }
    async receive(c, id, b) {
        const po = await c.db.get('SELECT * FROM purchase_orders WHERE id=? AND tenant_id=? FOR UPDATE', Number(id), c.tid);
        if (!po)
            throw L.notFound('Purchase order not found');
        if (po.status === 'cancelled')
            throw L.bad('This order is cancelled');
        const line = await c.db.get('SELECT * FROM purchase_order_lines WHERE id=? AND po_id=? AND tenant_id=?', Number(b.line_id), po.id, c.tid);
        if (!line)
            throw L.notFound('Order line not found');
        const q = L.parseQty(b.qty, { field: 'Quantity' });
        const rid = reqId(b.request_id);
        if (rid && await c.db.get('SELECT id FROM purchase_receipt_fences WHERE po_id=? AND tenant_id=? AND request_id=?', po.id, c.tid, rid))
            throw new L.HttpError(409, 'This receive request was cancelled and can no longer be applied.', 'request_fenced');
        if (rid) {
            const prev = await c.db.get('SELECT r.qty_milli, r.po_line_id, m.location_id FROM purchase_receipts r JOIN stock_movements m ON m.id=r.movement_id WHERE r.po_id=? AND r.tenant_id=? AND r.request_id=?', po.id, c.tid, rid);
            if (prev) {
                const sameLoc = (prev.location_id == null ? null : Number(prev.location_id)) === (b.location_id ? Number(b.location_id) : null);
                if (Number(prev.po_line_id) !== Number(line.id) || Number(prev.qty_milli) !== q || !sameLoc)
                    throw new L.HttpError(409, 'This request id was already used for a different receipt (line, quantity or location differs). Reconcile the earlier receipt instead of sending a new one.', 'request_conflict');
                return poView(c, po.id);
            }
        }
        const got = Number((await c.db.get('SELECT COALESCE(SUM(qty_milli),0) s FROM purchase_receipts WHERE po_line_id=?', line.id)).s);
        if (got + q > Number(line.qty_milli))
            throw L.bad('Cannot receive more than was ordered');
        const loc = b.location_id ? await D.own(c.db, 'stock_locations', Number(b.location_id), c.tid, 'Location') : null;
        const m = await c.db.run('INSERT INTO stock_movements(tenant_id,item_id,booking_id,kind,qty_milli,unit_cost_minor,note,created_by,created_at,location_id) VALUES(?,?,?,?,?,?,?,?,?,?)', c.tid, line.item_id, null, 'purchase', q, line.unit_cost_minor, `Received on purchase order #${po.id}`, c.user.id, L.nowIso(), loc?.id ?? null);
        await c.db.run('INSERT INTO purchase_receipts(tenant_id,po_id,po_line_id,qty_milli,movement_id,created_by,created_at,request_id) VALUES(?,?,?,?,?,?,?,?)', c.tid, po.id, line.id, q, m.id, c.user.id, L.nowIso(), rid);
        await D.audit(c.db, c, 'po.receive', 'vendor', po.vendor_id, { po: po.id, line: line.id, qty_milli: q });
        return poView(c, po.id);
    }
    /** Raises a vendor bill linked to this order. Default amount = value received (qty x entered unit cost) minus bills already linked to this order; the user may enter the vendor's actual bill total instead. No tax, terms or due date are assumed. */
    async bill(c, id, b) {
        // Serialize with cancel/receive/other bills on the same order, then compute from the locked state.
        const lock = await c.db.get('SELECT id FROM purchase_orders WHERE id=? AND tenant_id=? FOR UPDATE', Number(id), c.tid);
        if (!lock)
            throw L.notFound('Purchase order not found');
        const po = await poView(c, Number(id));
        if (po.state === 'cancelled')
            throw L.bad('This order is cancelled');
        const br = await D.own(c.db, 'branches', b.branch_id, c.tid, 'Branch');
        const total = b.total !== undefined && b.total !== '' ? L.parseMoney(b.total, { field: 'Total', allowZero: true }) : po.unbilled_received_minor;
        if (total <= 0 && (b.total === undefined || b.total === ''))
            throw L.bad('Nothing received and not yet billed on this order. Enter the vendor bill total, or receive stock first.');
        const explicit = b.total !== undefined && b.total !== '';
        const reason = explicit ? L.str(b.reason, 'Reason', { max: 200 }) || '' : '';
        if (explicit && (po.received_minor === 0 || total > po.unbilled_received_minor) && !reason)
            throw L.bad('This total is more than the received value not yet billed (or nothing was received). Give a reason, for example the vendor invoice number, to record it.', 'reason_required');
        const on = b.billed_on ? L.checkDate(b.billed_on, 'Bill date') : L.todayIn((await c.db.get('SELECT timezone FROM tenants WHERE id=?', c.tid)).timezone);
        const r = await c.db.run("INSERT INTO vendor_bills(tenant_id,vendor_id,branch_id,po_id,kind,total_minor,billed_on,due_on,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", c.tid, po.vendor_id, br.id, Number(id), 'bill', total, on, b.due_on ? L.checkDate(b.due_on, 'Due date') : null, `From purchase order #${id}${reason ? '. Reason for amount: ' + reason : ''}`, c.user.id, L.nowIso());
        await D.audit(c.db, c, 'po.bill', 'vendor_bill', r.id, { po: Number(id), total_minor: total, reason: reason || undefined });
        return poView(c, Number(id));
    }
    async cancel(c, id) {
        const po = await c.db.get('SELECT * FROM purchase_orders WHERE id=? AND tenant_id=? FOR UPDATE', Number(id), c.tid);
        if (!po)
            throw L.notFound('Purchase order not found');
        const got = Number((await c.db.get('SELECT COALESCE(SUM(r.qty_milli),0) s FROM purchase_receipts r JOIN purchase_order_lines l ON l.id=r.po_line_id WHERE l.po_id=?', po.id)).s);
        if (got > 0)
            throw L.bad('Something was already received on this order, so it cannot be cancelled');
        const live = Number((await c.db.get('SELECT COUNT(*) n FROM vendor_bills WHERE po_id=? AND tenant_id=? AND voided=0', po.id, c.tid)).n);
        if (live > 0)
            throw L.bad('A vendor bill is linked to this order, so it cannot be cancelled. Void that bill first (with a reason); nothing is changed automatically.');
        await c.db.run("UPDATE purchase_orders SET status='cancelled' WHERE id=?", po.id);
        await D.audit(c.db, c, 'po.cancel', 'vendor', po.vendor_id, { po: po.id });
        return poView(c, po.id);
    }
};
exports.PurchaseOrderController = PurchaseOrderController;
__decorate([
    (0, infra_1.Perm)('vendors.read'),
    (0, common_1.Get)(),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PurchaseOrderController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('vendors.read'),
    (0, common_1.Get)(':id/receipts/:rid'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('rid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], PurchaseOrderController.prototype, "lookup", null);
__decorate([
    (0, infra_1.Perm)('inventory.write'),
    (0, common_1.Post)(':id/receipts/:rid/fence'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('rid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], PurchaseOrderController.prototype, "fence", null);
__decorate([
    (0, infra_1.Perm)('vendors.read'),
    (0, common_1.Get)(':id/document.pdf'),
    (0, common_1.Header)('Content-Type', 'application/pdf'),
    (0, common_1.Header)('Content-Disposition', 'inline; filename="purchase-order.pdf"'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PurchaseOrderController.prototype, "doc", null);
__decorate([
    (0, infra_1.Perm)('vendors.read'),
    (0, common_1.Get)(':id'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PurchaseOrderController.prototype, "get", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Post)(),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PurchaseOrderController.prototype, "create", null);
__decorate([
    (0, infra_1.Perm)('inventory.write'),
    (0, common_1.Post)(':id/receive'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], PurchaseOrderController.prototype, "receive", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Post)(':id/bill'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], PurchaseOrderController.prototype, "bill", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Post)(':id/cancel'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PurchaseOrderController.prototype, "cancel", null);
exports.PurchaseOrderController = PurchaseOrderController = __decorate([
    (0, common_1.Controller)('api/purchase-orders')
], PurchaseOrderController);
const CONTRACT_STATUS = ['draft', 'active', 'ended', 'cancelled'];
const day = (v, f) => { if (v == null || v === '')
    return null; if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z')) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v)
    throw L.bad(`${f} must be a date like 2027-03-31`); return v; };
/** Vendor contract records: the owner's own title, reference, dates, status and notes. No fee, penalty, tax or clause is created, assumed or calculated. */
let VendorContractController = class VendorContractController {
    /** vendors.write, not vendors.read: notes and reference can hold commercial terms, so the store role (which reads vendors and orders) does not see contract records. */
    async list(c) { return c.db.all('SELECT k.*, v.name AS vendor_name FROM vendor_contracts k JOIN vendors v ON v.id=k.vendor_id WHERE k.tenant_id=? ORDER BY k.id DESC LIMIT 300', c.tid); }
    /** On-screen warning list, not a sent message. Only the lead time the owner set is used; with none set nothing is listed. Contracts that are active and already past their end date are listed as overdue. */
    async reminders(c) {
        const t = await c.db.get('SELECT contract_reminder_days, timezone FROM tenants WHERE id=?', c.tid);
        if (t.contract_reminder_days === null || t.contract_reminder_days === undefined)
            return { lead_days: null, rows: [] };
        const lead = Number(t.contract_reminder_days), today = L.todayIn(t.timezone), ms = (d) => Date.parse(d + 'T00:00:00Z');
        const rows = await c.db.all("SELECT k.id, k.title, k.reference, k.ends_on, v.name AS vendor_name FROM vendor_contracts k JOIN vendors v ON v.id=k.vendor_id WHERE k.tenant_id=? AND k.status='active' AND k.ends_on IS NOT NULL ORDER BY k.ends_on, k.id", c.tid);
        return { lead_days: lead, today, rows: rows.map((r) => ({ ...r, days_left: Math.round((ms(r.ends_on) - ms(today)) / 86400000) })).filter((r) => r.days_left <= lead) };
    }
    async setLead(c, b) {
        const raw = b?.days === null || b?.days === undefined ? '' : String(b.days).trim();
        let days = null;
        if (raw !== '') {
            if (!/^\d{1,3}$/.test(raw) || Number(raw) > 365)
                throw L.bad('Enter a whole number of days from 0 to 365, or leave it empty for no warning');
            days = Number(raw);
        }
        await c.db.run('UPDATE tenants SET contract_reminder_days=? WHERE id=?', days, c.tid);
        await D.audit(c.db, c, 'vendor_contract.reminder_lead', 'tenant', c.tid, { days });
        return { lead_days: days };
    }
    async create(c, b) {
        const v = await D.own(c.db, 'vendors', Number(b.vendor_id), c.tid, 'Vendor');
        const title = L.str(b.title, 'Title', { max: 120, required: true });
        const s = day(b.starts_on, 'Start date'), e = day(b.ends_on, 'End date');
        if (s && e && e < s)
            throw L.bad('End date is before the start date');
        const now = L.nowIso();
        const r = await c.db.run('INSERT INTO vendor_contracts(tenant_id,vendor_id,title,reference,starts_on,ends_on,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', c.tid, v.id, title, L.str(b.reference, 'Reference', { max: 80 }) || '', s, e, L.str(b.notes, 'Notes', { max: 2000 }) || '', c.user.id, now, now);
        await D.audit(c.db, c, 'vendor_contract.create', 'vendor', v.id, { contract: r.id });
        return c.db.get('SELECT * FROM vendor_contracts WHERE id=?', r.id);
    }
    async update(c, id, b) {
        const k = await c.db.get('SELECT * FROM vendor_contracts WHERE id=? AND tenant_id=? FOR UPDATE', Number(id), c.tid);
        if (!k)
            throw L.notFound('Contract not found');
        const status = b.status === undefined ? k.status : String(b.status);
        if (!CONTRACT_STATUS.includes(status))
            throw L.bad('Status must be draft, active, ended or cancelled');
        const s = b.starts_on === undefined ? k.starts_on : day(b.starts_on, 'Start date'), e = b.ends_on === undefined ? k.ends_on : day(b.ends_on, 'End date');
        if (s && e && e < s)
            throw L.bad('End date is before the start date');
        const title = b.title === undefined ? k.title : L.str(b.title, 'Title', { max: 120, required: true });
        const notes = b.notes === undefined ? k.notes : L.str(b.notes, 'Notes', { max: 2000 }) || '';
        const ref = b.reference === undefined ? k.reference : L.str(b.reference, 'Reference', { max: 80 }) || '';
        await c.db.run('UPDATE vendor_contracts SET title=?,reference=?,starts_on=?,ends_on=?,notes=?,status=?,updated_at=? WHERE id=?', title, ref, s, e, notes, status, L.nowIso(), k.id);
        await D.audit(c.db, c, 'vendor_contract.update', 'vendor', k.vendor_id, { contract: k.id, from_status: k.status, to_status: status });
        return c.db.get('SELECT * FROM vendor_contracts WHERE id=?', k.id);
    }
};
exports.VendorContractController = VendorContractController;
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Get)(),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VendorContractController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Get)('reminders'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VendorContractController.prototype, "reminders", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Put)('reminder-lead'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], VendorContractController.prototype, "setLead", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Post)(),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], VendorContractController.prototype, "create", null);
__decorate([
    (0, infra_1.Perm)('vendors.write'),
    (0, common_1.Post)(':id/update'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], VendorContractController.prototype, "update", null);
exports.VendorContractController = VendorContractController = __decorate([
    (0, common_1.Controller)('api/vendor-contracts')
], VendorContractController);
exports.PO_CONTROLLERS = [PurchaseOrderController, VendorContractController];
//# sourceMappingURL=po.js.map