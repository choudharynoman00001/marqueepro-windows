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
exports.KITCHEN_CONTROLLERS = exports.DietaryController = exports.ScheduleController = exports.StockCountController = exports.KitchenController = void 0;
const pdfUr_1 = require("./pdfUr");
const common_1 = require("@nestjs/common");
const L = __importStar(require("./lib"));
const D = __importStar(require("./domain"));
const infra_1 = require("./infra");
const ops2_1 = require("./ops2");
/** Per event equipment: issued - returned - written off = still out. Stock itself stays an append-only ledger. */
async function equipment(c, bookingId) {
    const rows = await c.db.all(`SELECT i.id AS item_id, i.name, i.unit,
      COALESCE(SUM(CASE WHEN m.kind='issue' THEN -m.qty_milli ELSE 0 END),0) AS issued_milli,
      COALESCE(SUM(CASE WHEN m.kind='return' THEN m.qty_milli ELSE 0 END),0) AS returned_milli,
      COALESCE(SUM(CASE WHEN m.kind='writeoff' THEN m.qty_milli ELSE 0 END),0) AS written_off_milli
    FROM stock_movements m JOIN inventory_items i ON i.id=m.item_id WHERE m.booking_id=? AND m.tenant_id=? AND m.kind IN ('issue','return','writeoff') GROUP BY i.id,i.name,i.unit ORDER BY i.name`, bookingId, c.tid);
    return rows.map((r) => ({ ...r, issued_milli: Number(r.issued_milli), returned_milli: Number(r.returned_milli), written_off_milli: Number(r.written_off_milli), outstanding_milli: Number(r.issued_milli) - Number(r.returned_milli) - Number(r.written_off_milli) }));
}
const q = (m) => String(m / 1000);
let KitchenController = class KitchenController {
    async list(c, id) { const bk = await D.own(c.db, 'bookings', Number(id), c.tid, 'Booking'); return { booking_id: bk.id, items: await equipment(c, bk.id) }; }
    async act(c, id, b) {
        const bk = await D.own(c.db, 'bookings', Number(id), c.tid, 'Booking');
        const action = String(b.action);
        if (!['issue', 'return', 'writeoff'].includes(action))
            throw L.bad('Choose issue, return or write off');
        const it = await c.db.get('SELECT * FROM inventory_items WHERE id=? AND tenant_id=? FOR UPDATE', Number(b.item_id), c.tid);
        if (!it)
            throw L.notFound('Item not found');
        const qty = L.parseQty(b.qty, { field: 'Quantity' });
        const note = L.str(b.note, 'Note', { max: 300 });
        const cur = (await equipment(c, bk.id)).find((x) => x.item_id === it.id);
        const out = cur ? cur.outstanding_milli : 0;
        if (action === 'issue') {
            const have = Number((await c.db.get("SELECT COALESCE(SUM(qty_milli),0) s FROM stock_movements WHERE item_id=? AND kind<>'writeoff'", it.id)).s);
            if (have < qty)
                throw L.bad('Not enough stock to issue that much');
        }
        else {
            if (qty > out)
                throw L.bad(out === 0 ? 'Nothing from this item is out with this event' : `Only ${q(out)} ${it.unit} still out with this event`);
            if (action === 'writeoff' && !note)
                throw L.bad('Say why it is being written off (lost or broken)');
        }
        const signed = action === 'issue' ? -qty : qty;
        const r = await c.db.run('INSERT INTO stock_movements(tenant_id,item_id,booking_id,kind,qty_milli,unit_cost_minor,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)', c.tid, it.id, bk.id, action, signed, null, note, c.user.id, L.nowIso());
        await D.audit(c.db, c, 'equipment.' + action, 'booking', bk.id, { item_id: it.id, qty });
        return { id: r.id, items: await equipment(c, bk.id) };
    }
    /** One page for the kitchen: event facts, dishes, ingredient need vs stock, equipment out. Quantities come from the owner's own recipes. */
    async prep(c, id, res) {
        const bk = await D.getBooking(c.db, c.tid, Number(id));
        await D.own(c.db, 'bookings', Number(id), c.tid, 'Booking');
        const t = await (0, ops2_1.withLogo)(c);
        const dishes = await c.db.all('SELECT m.name, m.unit, bm.note FROM booking_menu bm JOIN menu_items m ON m.id=bm.menu_item_id WHERE bm.booking_id=? AND bm.tenant_id=? ORDER BY m.name', bk.id, c.tid);
        const need = await c.db.all(`SELECT i.name, i.unit, SUM(r.qty_per_head_milli) AS per_head_milli, COALESCE((SELECT SUM(qty_milli) FROM stock_movements s WHERE s.item_id=i.id AND s.kind<>'writeoff'),0) AS on_hand_milli
      FROM booking_menu bm JOIN recipe_ingredients r ON r.menu_item_id=bm.menu_item_id JOIN inventory_items i ON i.id=r.inventory_item_id WHERE bm.booking_id=? AND bm.tenant_id=? GROUP BY i.id,i.name,i.unit ORDER BY i.name`, bk.id, c.tid);
        const diet = await c.db.all("SELECT d.category, d.guests, d.note, m.name AS dish_name, (m.id IS NOT NULL AND bm.menu_item_id IS NULL) AS dish_dropped FROM booking_dietary d LEFT JOIN menu_items m ON m.id=d.menu_item_id LEFT JOIN booking_menu bm ON bm.booking_id=d.booking_id AND bm.menu_item_id=d.menu_item_id WHERE d.booking_id=? AND d.tenant_id=? ORDER BY (d.category = 'nut_allergy') DESC, d.id", bk.id, c.tid);
        const eq = await equipment(c, bk.id);
        const tasks = await c.db.all("SELECT title, role, due_at, status FROM event_tasks WHERE booking_id=? AND tenant_id=? ORDER BY id", bk.id, c.tid);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="prep-sheet.pdf"' });
        return new common_1.StreamableFile(await (0, ops2_1.pdfBuffer)((d) => {
            (0, ops2_1.head)(d, t, 'KITCHEN PREP SHEET', `Booking ${bk.code}`);
            (0, ops2_1.kv)(d, (0, pdfUr_1.T)('Event'), `${bk.event_type}, ${bk.venue_name}`);
            (0, ops2_1.kv)(d, (0, pdfUr_1.T)('Date'), `${bk.event_date}   ${String(bk.starts_at).slice(11, 16)} to ${String(bk.ends_at).slice(11, 16)}`);
            (0, ops2_1.kv)(d, (0, pdfUr_1.T)('Guests'), String(bk.guests));
            d.moveDown(0.6);
            const section = (title) => { if (d.y > d.page.height - 140) {
                d.addPage();
                d.y = 48;
            } d.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(title, ops2_1.L0, d.y); d.y += 4; };
            const line = (cols, bold = false) => { if (d.y > d.page.height - 70) {
                d.addPage();
                d.y = 48;
            } const y = d.y + 2; d.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#111'); let h = 14; for (const [s, x, al] of cols) {
                const w = al === 'right' ? 80 : 230;
                d.text(s, x, y, { width: w, align: al });
                h = Math.max(h, d.y - y);
            } d.y = y + h; d.moveTo(ops2_1.L0, d.y).lineTo(ops2_1.L0 + ops2_1.W0, d.y).strokeColor('#ddd').lineWidth(0.5).stroke(); };
            section((0, pdfUr_1.T)('Menu'));
            if (!dishes.length)
                d.font('Helvetica-Oblique').fontSize(10).fillColor('#a00').text((0, pdfUr_1.T)('No menu has been set for this booking.'), ops2_1.L0, d.y + 2);
            else
                for (const m of dishes)
                    line([[`${m.name} (${m.unit})${m.note ? ' - ' + m.note : ''}`, ops2_1.L0 + 4, 'left']]);
            d.moveDown(0.8);
            section((0, pdfUr_1.T)('Dietary requirements'));
            if (!diet.length)
                d.font('Helvetica-Oblique').fontSize(10).fillColor('#444').text((0, pdfUr_1.T)('None recorded.'), ops2_1.L0, d.y + 2);
            else
                for (const r of diet)
                    line([[`${r.category === 'nut_allergy' ? 'ALLERGY: ' : ''}${String(r.category).replace(/_/g, ' ')}${r.dish_name ? ' [dish: ' + r.dish_name + (r.dish_dropped ? ', no longer on this menu' : '') + ']' : ''}${r.note ? ' - ' + r.note : ''}`, ops2_1.L0 + 4, 'left'], [`${r.guests} guests`, ops2_1.L0 + 335, 'right']]);
            d.moveDown(0.8);
            section((0, pdfUr_1.T)('Ingredients needed (recipe quantity per guest x guests)'));
            if (!need.length)
                d.font('Helvetica-Oblique').fontSize(10).fillColor('#a00').text((0, pdfUr_1.T)('No recipes are linked to this menu, so no ingredient quantities can be calculated.'), ops2_1.L0, d.y + 2);
            else {
                line([[(0, pdfUr_1.T)('Item'), ops2_1.L0 + 4, 'left'], [(0, pdfUr_1.T)('Needed'), ops2_1.L0 + 250, 'right'], [(0, pdfUr_1.T)('In stock'), ops2_1.L0 + 335, 'right'], [(0, pdfUr_1.T)('Short'), ops2_1.L0 + 415, 'right']], true);
                for (const n of need) {
                    const needM = Math.round(Number(n.per_head_milli) * bk.guests), have = Number(n.on_hand_milli);
                    line([[String(n.name), ops2_1.L0 + 4, 'left'], [`${q(needM)} ${n.unit}`, ops2_1.L0 + 250, 'right'], [`${q(have)} ${n.unit}`, ops2_1.L0 + 335, 'right'], [needM > have ? `${q(needM - have)} ${n.unit}` : '-', ops2_1.L0 + 415, 'right']]);
                }
            }
            d.moveDown(0.8);
            section((0, pdfUr_1.T)('Equipment out with this event'));
            if (!eq.length)
                d.font('Helvetica').fontSize(10).fillColor('#555').text((0, pdfUr_1.T)('Nothing issued yet.'), ops2_1.L0, d.y + 2);
            else {
                line([[(0, pdfUr_1.T)('Item'), ops2_1.L0 + 4, 'left'], [(0, pdfUr_1.T)('Issued'), ops2_1.L0 + 250, 'right'], [(0, pdfUr_1.T)('Returned'), ops2_1.L0 + 335, 'right'], [(0, pdfUr_1.T)('Still out'), ops2_1.L0 + 415, 'right']], true);
                for (const e of eq)
                    line([[String(e.name), ops2_1.L0 + 4, 'left'], [`${q(e.issued_milli)} ${e.unit}`, ops2_1.L0 + 250, 'right'], [`${q(e.returned_milli + e.written_off_milli)} ${e.unit}`, ops2_1.L0 + 335, 'right'], [`${q(e.outstanding_milli)} ${e.unit}`, ops2_1.L0 + 415, 'right']]);
            }
            if (tasks.length) {
                d.moveDown(0.8);
                section((0, pdfUr_1.T)('Tasks'));
                for (const k of tasks)
                    line([[`${k.status === 'done' ? '[x]' : '[ ]'} ${k.title}${k.role ? ' (' + k.role + ')' : ''}`, ops2_1.L0 + 4, 'left'], [String(k.due_at || '').replace('T', ' ').slice(0, 16), ops2_1.L0 + 250, 'right']]);
            }
            (0, ops2_1.credit)(d);
        }));
    }
};
exports.KitchenController = KitchenController;
__decorate([
    (0, infra_1.Perm)('inventory.read'),
    (0, common_1.Get)(':id/equipment'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], KitchenController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('inventory.write'),
    (0, common_1.Post)(':id/equipment'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], KitchenController.prototype, "act", null);
__decorate([
    (0, infra_1.Perm)('catering.read'),
    (0, common_1.Get)(':id/prep-sheet.pdf'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], KitchenController.prototype, "prep", null);
exports.KitchenController = KitchenController = __decorate([
    (0, common_1.Controller)('api/bookings')
], KitchenController);
/** Stock valuation and physical counts. Valuation uses the unit cost the owner has set on each item (no costing method is assumed). */
let StockCountController = class StockCountController {
    async valuation(c) {
        const rows = await c.db.all(`SELECT i.id, i.name, i.unit, i.unit_cost_minor, COALESCE((SELECT SUM(qty_milli) FROM stock_movements m WHERE m.item_id=i.id AND m.kind<>'writeoff'),0) AS on_hand_milli FROM inventory_items i WHERE i.tenant_id=? AND i.active=1 ORDER BY i.name`, c.tid);
        const items = rows.map((r) => { const on = Number(r.on_hand_milli); const cost = Number(r.unit_cost_minor); return { id: r.id, name: r.name, unit: r.unit, on_hand_milli: on, unit_cost_minor: cost, value_minor: Math.round((on * cost) / 1000), cost_missing: cost === 0 }; });
        return { basis: 'On hand x the unit cost set on each item. Items with no unit cost are valued at 0 and flagged.', items, total_minor: items.reduce((s, x) => s + x.value_minor, 0) };
    }
    /** Physical count: each counted quantity that differs from the book posts one append-only "adjust" movement for the difference. */
    async count(c, b) {
        if (!Array.isArray(b.counts) || !b.counts.length)
            throw L.bad('Enter at least one counted quantity');
        if (b.counts.length > 500)
            throw L.bad('Too many items in one count');
        const note = 'Physical count' + (b.note ? ': ' + L.str(b.note, 'Note', { max: 200 }) : '');
        const out = [];
        for (const x of b.counts) {
            const it = await c.db.get('SELECT * FROM inventory_items WHERE id=? AND tenant_id=? FOR UPDATE', Number(x.item_id), c.tid);
            if (!it)
                throw L.notFound('Item not found');
            const counted = L.parseQty(x.counted, { allowZero: true, field: 'Counted quantity' });
            const book = Number((await c.db.get("SELECT COALESCE(SUM(qty_milli),0) s FROM stock_movements WHERE item_id=? AND kind<>'writeoff'", it.id)).s);
            const diff = counted - book;
            if (diff !== 0)
                await c.db.run('INSERT INTO stock_movements(tenant_id,item_id,kind,qty_milli,note,created_by,created_at) VALUES(?,?,?,?,?,?,?)', c.tid, it.id, 'adjust', diff, note, c.user.id, L.nowIso());
            out.push({ item_id: it.id, name: it.name, book_milli: book, counted_milli: counted, difference_milli: diff });
        }
        await D.audit(c.db, c, 'inventory.count', 'inventory', 0, { items: out.length, changed: out.filter((o) => o.difference_milli !== 0).length });
        return { results: out };
    }
};
exports.StockCountController = StockCountController;
__decorate([
    (0, infra_1.Perm)('inventory.read'),
    (0, common_1.Get)('valuation'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StockCountController.prototype, "valuation", null);
__decorate([
    (0, infra_1.Perm)('inventory.write'),
    (0, common_1.Post)('count'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StockCountController.prototype, "count", null);
exports.StockCountController = StockCountController = __decorate([
    (0, common_1.Controller)('api/inventory')
], StockCountController);
/** Planned instalments. Recorded payments are matched to them oldest due date first, only to show what is covered. */
async function scheduleView(c, bookingId) {
    const rows = await c.db.all("SELECT * FROM payment_schedule WHERE booking_id=? AND tenant_id=? ORDER BY due_on, id", bookingId, c.tid);
    let left = (await D.bookingFinance(c.db, c.tid, bookingId)).received_net_minor;
    const today = L.todayIn(c.tenant.timezone);
    let planned = 0;
    const items = rows.map((r) => {
        if (r.status === 'cancelled')
            return { ...r, state: 'cancelled', covered_minor: 0 };
        planned += Number(r.amount_minor);
        const cov = Math.max(0, Math.min(left, Number(r.amount_minor)));
        left -= cov;
        const state = cov >= Number(r.amount_minor) ? 'covered' : r.due_on < today ? 'overdue' : 'upcoming';
        return { ...r, state, covered_minor: cov };
    });
    return { basis: 'Recorded payments (including card, digital and cheque not yet confirmed cleared) are matched to instalments by due date.', items, planned_minor: planned };
}
let ScheduleController = class ScheduleController {
    async list(c, id) { const bk = await D.own(c.db, 'bookings', Number(id), c.tid, 'Booking'); return scheduleView(c, bk.id); }
    async add(c, id, b) {
        const bk = await D.own(c.db, 'bookings', Number(id), c.tid, 'Booking');
        const amt = L.parseMoney(b.amount, { field: 'Amount' });
        const due = L.checkDate(b.due_on, 'Due date');
        const r = await c.db.run('INSERT INTO payment_schedule(tenant_id,booking_id,due_on,amount_minor,label,created_by,created_at) VALUES(?,?,?,?,?,?,?)', c.tid, bk.id, due, amt, L.str(b.label, 'Label', { max: 80 }), c.user.id, L.nowIso());
        await D.audit(c.db, c, 'schedule.add', 'booking', bk.id, { id: r.id, due, amt });
        return scheduleView(c, bk.id);
    }
    async cancel(c, id, sid) {
        const bk = await D.own(c.db, 'bookings', Number(id), c.tid, 'Booking');
        const row = await c.db.get('SELECT id FROM payment_schedule WHERE id=? AND booking_id=? AND tenant_id=?', Number(sid), bk.id, c.tid);
        if (!row)
            throw L.notFound('Instalment not found');
        await c.db.run("UPDATE payment_schedule SET status='cancelled' WHERE id=?", row.id);
        await D.audit(c.db, c, 'schedule.cancel', 'booking', bk.id, { id: row.id });
        return scheduleView(c, bk.id);
    }
};
exports.ScheduleController = ScheduleController;
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)(':id/schedule'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ScheduleController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('bookings.write'),
    (0, common_1.Post)(':id/schedule'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ScheduleController.prototype, "add", null);
__decorate([
    (0, infra_1.Perm)('bookings.write'),
    (0, common_1.Post)(':id/schedule/:sid/cancel'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('sid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], ScheduleController.prototype, "cancel", null);
exports.ScheduleController = ScheduleController = __decorate([
    (0, common_1.Controller)('api/bookings')
], ScheduleController);
const DIET = ['vegetarian', 'vegan', 'halal_only', 'gluten_free', 'nut_allergy', 'diabetic', 'jain', 'child_meal', 'other'];
let DietaryController = class DietaryController {
    async list(c, id) {
        const bk = await D.own(c.db, 'bookings', Number(id), c.tid, 'Booking');
        const items = await c.db.all("SELECT d.id, d.category, d.guests, d.note, d.menu_item_id, m.name AS dish_name FROM booking_dietary d LEFT JOIN menu_items m ON m.id=d.menu_item_id WHERE d.booking_id=? AND d.tenant_id=? ORDER BY (d.category IN ('nut_allergy','gluten_free','diabetic')) DESC, d.id", bk.id, c.tid);
        const dishes = await c.db.all('SELECT m.id, m.name FROM booking_menu bm JOIN menu_items m ON m.id=bm.menu_item_id WHERE bm.booking_id=? AND bm.tenant_id=? ORDER BY m.name', bk.id, c.tid);
        return { categories: DIET, dishes, items, listed_guest_counts: items.reduce((a, r) => a + Number(r.guests), 0), booking_guests: Number(bk.guests) };
    }
    async add(c, id, b) {
        const bk = await D.own(c.db, 'bookings', Number(id), c.tid, 'Booking');
        if (!DIET.includes(b.category))
            throw L.bad('Choose a dietary category from the list');
        const n = Number(b.guests);
        if (!Number.isInteger(n) || n < 1)
            throw L.bad('Guests must be a whole number, 1 or more');
        if (n > Number(bk.guests))
            throw L.bad('More guests than the booking has');
        const note = L.str(b.note, 'Note', { max: 200 }) || '';
        if (b.category === 'other' && !note)
            throw L.bad('Describe the requirement for "other"');
        let dish = null;
        if (b.menu_item_id !== undefined && b.menu_item_id !== null && b.menu_item_id !== '') {
            dish = Number(b.menu_item_id);
            const on = Number.isSafeInteger(dish) && dish > 0 ? await c.db.get('SELECT 1 AS x FROM booking_menu WHERE booking_id=? AND tenant_id=? AND menu_item_id=?', bk.id, c.tid, dish) : null;
            if (!on)
                throw L.bad('Choose a dish that is on this booking\'s menu');
        }
        const r = await c.db.run('INSERT INTO booking_dietary(tenant_id,booking_id,category,guests,note,created_by,created_at,menu_item_id) VALUES(?,?,?,?,?,?,?,?)', c.tid, bk.id, b.category, n, note, c.user.id, L.nowIso(), dish);
        await D.audit(c.db, c, 'dietary.add', 'booking', bk.id, { id: r.id, category: b.category, guests: n, menu_item_id: dish });
        return this.list(c, id);
    }
    async remove(c, id, did) {
        const bk = await D.own(c.db, 'bookings', Number(id), c.tid, 'Booking');
        const row = await c.db.get('SELECT id FROM booking_dietary WHERE id=? AND booking_id=? AND tenant_id=?', Number(did), bk.id, c.tid);
        if (!row)
            throw L.notFound('Requirement not found');
        await c.db.run('DELETE FROM booking_dietary WHERE id=?', row.id);
        await D.audit(c.db, c, 'dietary.remove', 'booking', bk.id, { id: row.id });
        return this.list(c, id);
    }
};
exports.DietaryController = DietaryController;
__decorate([
    (0, infra_1.Perm)('catering.read'),
    (0, common_1.Get)(':id/dietary'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], DietaryController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('catering.write'),
    (0, common_1.Post)(':id/dietary'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], DietaryController.prototype, "add", null);
__decorate([
    (0, infra_1.Perm)('catering.write'),
    (0, common_1.Post)(':id/dietary/:did/remove'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('did')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], DietaryController.prototype, "remove", null);
exports.DietaryController = DietaryController = __decorate([
    (0, common_1.Controller)('api/bookings')
], DietaryController);
exports.KITCHEN_CONTROLLERS = [KitchenController, StockCountController, ScheduleController, DietaryController];
//# sourceMappingURL=kitchen.js.map