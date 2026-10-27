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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPS2_CONTROLLERS = exports.VendorDocController = exports.SchedulePdfController = exports.ReportPdfController = exports.ReceiptPdfController = exports.InvoicePdfController = exports.W0 = exports.L0 = exports.negrs = exports.credit = exports.rs = exports.ExportController = exports.FeedbackController = exports.range = exports.toCsv = void 0;
exports.csvCell = csvCell;
exports.pdfBuffer = pdfBuffer;
exports.withLogo = withLogo;
exports.head = head;
exports.kv = kv;
exports.totalRow = totalRow;
const pdfUr_1 = require("./pdfUr");
const common_1 = require("@nestjs/common");
const L = __importStar(require("./lib"));
const D = __importStar(require("./domain"));
const infra_1 = require("./infra");
const pdfkit_1 = __importDefault(require("pdfkit"));
const brandIcon_1 = require("./brandIcon");
const pdfText_1 = require("./pdfText");
/** CSV cell: quote everything, double the quotes, and neutralise spreadsheet formulas (= + - @ tab CR at the start). */
function csvCell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))
        s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
}
const toCsv = (head, rows) => [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
exports.toCsv = toCsv;
const amt = (minor) => (Number(minor) / 100).toFixed(2);
const range = (q) => { const from = L.checkDate(q.from, 'From'), to = L.checkDate(q.to, 'To'); if (to < from)
    throw L.bad('To is before From'); return { from, to }; };
exports.range = range;
let FeedbackController = class FeedbackController {
    async add(c, b) {
        const bk = await D.own(c.db, 'bookings', b.booking_id, c.tid, 'Booking');
        const rating = Number(b.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5)
            throw L.bad('Rating must be 1 to 5');
        if (await c.db.get('SELECT id FROM feedback WHERE booking_id=? AND tenant_id=?', bk.id, c.tid))
            throw L.bad('Feedback for this booking is already recorded');
        const r = await c.db.run('INSERT INTO feedback(tenant_id,booking_id,customer_id,rating,comment,created_by,created_at) VALUES(?,?,?,?,?,?,?)', c.tid, bk.id, bk.customer_id, rating, L.str(b.comment, 'Comment', { max: 1000 }), c.user.id, L.nowIso());
        await D.audit(c.db, c, 'feedback.create', 'feedback', r.id);
        return c.db.get('SELECT * FROM feedback WHERE id=?', r.id);
    }
    list(c) { return c.db.all('SELECT f.*, b.code AS booking_code, cu.name AS customer_name FROM feedback f JOIN bookings b ON b.id=f.booking_id JOIN customers cu ON cu.id=f.customer_id WHERE f.tenant_id=? ORDER BY f.id DESC LIMIT 300', c.tid); }
    async summary(c) { const r = await c.db.get('SELECT COUNT(*) AS n, COALESCE(SUM(rating),0) AS total FROM feedback WHERE tenant_id=?', c.tid); return { count: Number(r.n), average: Number(r.n) ? Math.round((Number(r.total) / Number(r.n)) * 10) / 10 : null }; }
};
exports.FeedbackController = FeedbackController;
__decorate([
    (0, infra_1.Perm)('bookings.write'),
    (0, common_1.Post)(),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FeedbackController.prototype, "add", null);
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)(),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FeedbackController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('summary'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FeedbackController.prototype, "summary", null);
exports.FeedbackController = FeedbackController = __decorate([
    (0, common_1.Controller)('api/feedback')
], FeedbackController);
let ExportController = class ExportController {
    async payments(c, q) {
        const { from, to } = (0, exports.range)(q);
        const rows = await c.db.all('SELECT p.receipt_no, p.received_on, cu.name AS customer, b.code AS booking, p.method, p.amount_minor, p.reference FROM payments p JOIN customers cu ON cu.id=p.customer_id JOIN bookings b ON b.id=p.booking_id WHERE p.tenant_id=? AND p.received_on>=? AND p.received_on<=? ORDER BY p.received_on, p.id', c.tid, from, to);
        return (0, exports.toCsv)(['Receipt', 'Date', 'Customer', 'Booking', 'Method', 'Amount', 'Reference'], rows.map((r) => [r.receipt_no, r.received_on, r.customer, r.booking, r.method, amt(r.amount_minor), r.reference]));
    }
    async expenses(c, q) {
        const { from, to } = (0, exports.range)(q);
        const rows = await c.db.all('SELECT e.spent_on, k.name AS category, e.method, e.amount_minor, e.note, e.voided FROM expenses e JOIN expense_categories k ON k.id=e.category_id WHERE e.tenant_id=? AND e.spent_on>=? AND e.spent_on<=? ORDER BY e.spent_on, e.id', c.tid, from, to);
        return (0, exports.toCsv)(['Date', 'Category', 'Method', 'Amount', 'Note', 'Voided'], rows.map((r) => [r.spent_on, r.category, r.method, amt(r.amount_minor), r.note, Number(r.voided) ? 'yes' : 'no']));
    }
    async bookings(c, q) {
        const { from, to } = (0, exports.range)(q);
        const rows = await c.db.all('SELECT b.code, b.event_date, b.event_type, b.status, b.guests, cu.name AS customer, v.name AS venue FROM bookings b JOIN customers cu ON cu.id=b.customer_id JOIN venues v ON v.id=b.venue_id WHERE b.tenant_id=? AND b.event_date>=? AND b.event_date<=? ORDER BY b.event_date, b.id', c.tid, from, to);
        return (0, exports.toCsv)(['Code', 'Date', 'Type', 'Status', 'Guests', 'Customer', 'Hall'], rows.map((r) => [r.code, r.event_date, r.event_type, r.status, r.guests, r.customer, r.venue]));
    }
};
exports.ExportController = ExportController;
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('payments.csv'),
    (0, common_1.Header)('Content-Type', 'text/csv; charset=utf-8'),
    (0, common_1.Header)('Content-Disposition', 'attachment; filename="payments.csv"'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "payments", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('expenses.csv'),
    (0, common_1.Header)('Content-Type', 'text/csv; charset=utf-8'),
    (0, common_1.Header)('Content-Disposition', 'attachment; filename="expenses.csv"'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "expenses", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('bookings.csv'),
    (0, common_1.Header)('Content-Type', 'text/csv; charset=utf-8'),
    (0, common_1.Header)('Content-Disposition', 'attachment; filename="bookings.csv"'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "bookings", null);
exports.ExportController = ExportController = __decorate([
    (0, common_1.Controller)('api/exports')
], ExportController);
const rs = (minor) => 'Rs ' + (Number(minor) / 100).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
exports.rs = rs;
function pdfBuffer(build, opts = { size: 'A4', margin: 48 }) {
    return new Promise((res, rej) => { const d = new pdfkit_1.default(opts); (0, pdfText_1.withRtl)(d); (0, pdfUr_1.withUrduLabels)(d); const ch = []; d.on('data', (x) => ch.push(x)); d.on('end', () => res(Buffer.concat(ch))); d.on('error', rej); build(d); d.end(); });
}
/** Tenant row with the business logo bytes attached (if one is stored), for the PDF header. */
async function withLogo(c) { const lg = c.tid ? await c.db.get('SELECT data FROM tenant_logos WHERE tenant_id=?', c.tid) : null; return lg ? { ...c.tenant, logo: Buffer.from(lg.data) } : c.tenant; }
const credit = (d) => { d.moveDown(3); const y = d.y; d.image(brandIcon_1.ALPHA_BLUE_PNG, 48, y, { width: 16 }); d.font('Helvetica').fontSize(9).fillColor('#555').text('Developed by Chaudhry Noman | Powered by Alpha Blue Digital - alphablue.digital', 70, y + 4, { link: 'https://alphablue.digital', underline: false }); };
exports.credit = credit;
const negrs = (m) => (Number(m) === 0 ? (0, exports.rs)(0) : '-' + (0, exports.rs)(m));
exports.negrs = negrs;
exports.L0 = 48, exports.W0 = 499;
function head(d, t, title, sub) {
    title = (0, pdfUr_1.TT)(title);
    sub = (0, pdfUr_1.TT)(sub);
    d.image(brandIcon_1.ALPHA_BLUE_PNG, exports.L0, 44, { width: 22 });
    if (t.logo) {
        try {
            d.image(t.logo, exports.L0 + exports.W0 - 60, 40, { fit: [60, 40] });
        }
        catch { /* unreadable logo: skip */ }
    }
    d.font('Helvetica-Bold').fontSize(20).fillColor('#111').text(String(t.name), exports.L0 + 32, 44, { width: exports.W0 - 100 });
    d.font('Helvetica').fontSize(10).fillColor('#555').text([t.address, t.phone].filter(Boolean).join('   ') || ' ', exports.L0 + 32, d.y + 2, { width: exports.W0 - 32 });
    d.moveTo(exports.L0, d.y + 10).lineTo(exports.L0 + exports.W0, d.y + 10).strokeColor('#bbb').lineWidth(1).stroke();
    d.y += 24;
    d.font('Helvetica-Bold').fontSize(16).fillColor('#111').text(title, exports.L0, d.y, { width: exports.W0 });
    d.font('Helvetica').fontSize(11).fillColor('#333').text(sub, exports.L0, d.y + 2, { width: exports.W0 });
    d.moveDown(0.8);
}
function kv(d, k, v) { const y = d.y; d.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(k, exports.L0, y, { width: 90 }); d.font('Helvetica').text(v, exports.L0 + 95, y, { width: exports.W0 - 95 }); d.y = Math.max(d.y, y + 15); }
function totalRow(d, k, v, big = false) { const y = d.y; d.font(big ? 'Helvetica-Bold' : 'Helvetica').fontSize(big ? 14 : 11).fillColor('#111').text(k, exports.L0 + 250, y, { width: 120, align: 'right' }).text(v, exports.L0 + 375, y, { width: exports.W0 - 375, align: 'right' }); d.y = y + (big ? 22 : 17); }
let InvoicePdfController = class InvoicePdfController {
    async pdf(c, id, q) {
        const inv = await D.getInvoice(c.db, c.tid, Number(id));
        const bk = await D.getBooking(c.db, c.tid, inv.booking_id);
        const cu = await c.db.get('SELECT name,phone,address FROM customers WHERE id=?', inv.customer_id);
        const t = await withLogo(c);
        if (q.layout === 'thermal') {
            const w = 205, x = 10;
            const H = 230 + inv.items.reduce((n, i) => n + 12 * Math.ceil(String(i.description).length / 30) + 24, 0) + (inv.terms ? 12 * Math.ceil(String(inv.terms).length / 40) + 20 : 0);
            return new common_1.StreamableFile(await pdfBuffer((d) => {
                d.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(String(t.name), x, 12, { width: w, align: 'center' });
                d.font('Helvetica').fontSize(8).text([t.address, t.phone].filter(Boolean).join(' ') || ' ', x, d.y + 2, { width: w, align: 'center' });
                d.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text(`${String(inv.kind).toUpperCase()} ${inv.number || '(draft)'}`, x, d.y, { width: w, align: 'center' });
                d.font('Helvetica').fontSize(8).text(`${(0, pdfUr_1.T)('Status')}: ${(0, pdfUr_1.TS)(inv.status)}`, x, d.y + 1, { width: w, align: 'center' });
                d.fontSize(9);
                for (const line of [`To: ${cu.name}`, `Booking: ${bk.code}`, `Event: ${bk.event_date}`])
                    d.text(line, x, d.y + 2, { width: w });
                d.moveDown(0.4);
                for (const i of inv.items) {
                    d.font('Helvetica').fontSize(9).text(String(i.description), x, d.y + 2, { width: w });
                    d.fontSize(8).text(`${i.qty_milli / 1000} x ${(0, exports.rs)(i.unit_minor)} = ${(0, exports.rs)(i.line_minor)}`, x + 10, d.y, { width: w - 10, align: 'right' });
                }
                const tr = (a, b, bold = false) => { const y = d.y + 3; d.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).text(a, x, y, { width: 100 }).text(b, x + 100, y, { width: w - 100, align: 'right' }); };
                d.moveDown(0.5);
                tr('Subtotal', (0, exports.rs)(inv.subtotal_minor));
                if (inv.discount_minor > 0)
                    tr('Discount', '-' + (0, exports.rs)(inv.discount_minor));
                if (inv.tax_minor > 0)
                    tr(String(t.tax_label || 'Tax'), (0, exports.rs)(inv.tax_minor));
                tr('Total', (0, exports.rs)(inv.total_minor), true);
                if (inv.terms)
                    d.moveDown(0.6).font('Helvetica').fontSize(7).fillColor('#444').text(String(inv.terms), x, d.y, { width: w });
                d.moveDown(1).font('Helvetica').fontSize(6.5).fillColor('#555').text((0, pdfUr_1.T)('Developed by Chaudhry Noman | Powered by Alpha Blue Digital'), x, d.y, { width: w, align: 'center', link: 'https://alphablue.digital' });
            }, { size: [226.77, Math.max(H, 300)], margin: 0 }));
        }
        return new common_1.StreamableFile(await pdfBuffer((d) => {
            head(d, t, `${String(inv.kind).toUpperCase()} ${inv.number || '(draft)'}`, `Status: ${inv.status}`);
            kv(d, (0, pdfUr_1.T)('Billed to'), `${cu.name}${cu.phone ? '   ' + cu.phone : ''}`);
            kv(d, (0, pdfUr_1.T)('Event'), `${bk.event_type}, ${bk.venue_name}, ${bk.event_date}`);
            kv(d, (0, pdfUr_1.T)('Booking'), String(bk.code));
            d.moveDown(0.8);
            const col = [exports.L0 + 6, exports.L0 + 270, exports.L0 + 330, exports.L0 + 415];
            const amtW = exports.L0 + exports.W0 - col[3] - 6;
            const tableHead = () => { const hy = d.y; d.rect(exports.L0, hy - 4, exports.W0, 20).fill('#eee'); d.fillColor('#111').font('Helvetica-Bold').fontSize(10); d.text((0, pdfUr_1.T)('Description'), col[0], hy, { width: 255 }).text((0, pdfUr_1.T)('Qty'), col[1], hy, { width: 50, align: 'right' }).text((0, pdfUr_1.T)('Rate'), col[2], hy, { width: 80, align: 'right' }).text((0, pdfUr_1.T)('Amount'), col[3], hy, { width: amtW, align: 'right' }); d.y = hy + 22; };
            tableHead();
            for (const i of inv.items) {
                d.font('Helvetica').fontSize(11);
                const h = d.heightOfString(String(i.description), { width: 255 });
                if (d.y + h + 14 > d.page.height - 90) {
                    d.addPage();
                    d.y = 48;
                    tableHead();
                }
                const y = d.y;
                d.font('Helvetica').fontSize(11).fillColor('#111').text(String(i.description), col[0], y, { width: 255 });
                d.text(String(i.qty_milli / 1000), col[1], y, { width: 50, align: 'right' }).text((0, exports.rs)(i.unit_minor), col[2], y, { width: 80, align: 'right' }).text((0, exports.rs)(i.line_minor), col[3], y, { width: amtW, align: 'right' });
                d.y = y + h + 6;
                d.moveTo(exports.L0, d.y).lineTo(exports.L0 + exports.W0, d.y).strokeColor('#ddd').lineWidth(0.5).stroke();
                d.y += 6;
            }
            if (d.y + 120 > d.page.height - 60) {
                d.addPage();
                d.y = 48;
            }
            d.moveDown(0.5);
            totalRow(d, (0, pdfUr_1.T)('Subtotal'), (0, exports.rs)(inv.subtotal_minor));
            if (inv.discount_minor > 0)
                totalRow(d, (0, pdfUr_1.T)('Discount'), '-' + (0, exports.rs)(inv.discount_minor));
            if (inv.tax_minor > 0)
                totalRow(d, String(t.tax_label || 'Tax'), (0, exports.rs)(inv.tax_minor));
            d.moveTo(exports.L0 + 250, d.y).lineTo(exports.L0 + exports.W0, d.y).strokeColor('#111').lineWidth(1).stroke();
            d.y += 6;
            totalRow(d, (0, pdfUr_1.T)('Total'), (0, exports.rs)(inv.total_minor), true);
            if (inv.terms) {
                d.moveDown().font('Helvetica-Bold').fontSize(10).fillColor('#111').text((0, pdfUr_1.T)('Terms'), exports.L0, d.y);
                d.font('Helvetica').fontSize(10).fillColor('#444').text(String(inv.terms), exports.L0, d.y, { width: exports.W0 });
            }
            (0, exports.credit)(d);
        }));
    }
};
exports.InvoicePdfController = InvoicePdfController;
__decorate([
    (0, infra_1.Perm)('invoices.read'),
    (0, common_1.Get)(':id/pdf'),
    (0, common_1.Header)('Content-Type', 'application/pdf'),
    (0, common_1.Header)('Content-Disposition', 'inline; filename="document.pdf"'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InvoicePdfController.prototype, "pdf", null);
exports.InvoicePdfController = InvoicePdfController = __decorate([
    (0, common_1.Controller)('api/invoices')
], InvoicePdfController);
let ReceiptPdfController = class ReceiptPdfController {
    async pdf(c, id, q) {
        const p = await c.db.get('SELECT p.id,p.receipt_no,p.amount_minor,p.method,p.reference,p.received_on,p.booking_id,p.customer_id FROM payments p WHERE p.tenant_id=? AND p.id=?', c.tid, Number(id));
        if (!p)
            throw L.notFound('Receipt not found');
        const net = await D.paymentNet(c.db, p.id);
        const bk = await D.getBooking(c.db, c.tid, p.booking_id);
        const cu = await c.db.get('SELECT name,phone FROM customers WHERE id=?', p.customer_id);
        const t = await withLogo(c);
        if (q.layout === 'thermal') {
            return new common_1.StreamableFile(await pdfBuffer((d) => {
                const w = 205, x = 10;
                d.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(String(t.name), x, 12, { width: w, align: 'center' });
                d.font('Helvetica').fontSize(8).text([t.address, t.phone].filter(Boolean).join(' ') || ' ', x, d.y + 2, { width: w, align: 'center' });
                d.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text(`RECEIPT ${p.receipt_no}`, x, d.y, { width: w, align: 'center' });
                d.font('Helvetica').fontSize(9);
                for (const line of [`Date: ${p.received_on}`, `From: ${cu.name}`, `Booking: ${bk.code}`, `Method: ${p.method}${p.reference ? ' Ref: ' + p.reference : ''}`])
                    d.text(line, x, d.y + 2, { width: w });
                d.moveDown(0.5).font('Helvetica-Bold').fontSize(12).text(`${(0, exports.rs)(p.amount_minor)}`, x, d.y, { width: w, align: 'center' });
                if (net !== p.amount_minor)
                    d.font('Helvetica').fontSize(8).text(`${(0, pdfUr_1.T)('Net after refunds')}: ${(0, exports.rs)(net)}`, x, d.y + 2, { width: w, align: 'center' });
                d.moveDown(1).font('Helvetica').fontSize(6.5).fillColor('#555').text((0, pdfUr_1.T)('Developed by Chaudhry Noman | Powered by Alpha Blue Digital'), x, d.y, { width: w, align: 'center', link: 'https://alphablue.digital' });
            }, { size: [226.77, 330], margin: 0 }));
        }
        return new common_1.StreamableFile(await pdfBuffer((d) => {
            head(d, t, `RECEIPT ${p.receipt_no}`, `Date: ${p.received_on}`);
            kv(d, (0, pdfUr_1.T)('Received from'), `${cu.name}${cu.phone ? '   ' + cu.phone : ''}`);
            kv(d, (0, pdfUr_1.T)('Booking'), `${bk.code} (${bk.event_type}, ${bk.event_date})`);
            kv(d, (0, pdfUr_1.T)('Method'), String(p.method));
            if (p.reference)
                kv(d, (0, pdfUr_1.T)('Reference'), String(p.reference));
            d.moveDown(1);
            d.moveTo(exports.L0 + 250, d.y).lineTo(exports.L0 + exports.W0, d.y).strokeColor('#111').stroke();
            d.y += 8;
            totalRow(d, (0, pdfUr_1.T)('Amount received'), (0, exports.rs)(p.amount_minor), true);
            if (net !== p.amount_minor)
                totalRow(d, (0, pdfUr_1.T)('Net after refunds'), (0, exports.rs)(net));
            (0, exports.credit)(d);
        }));
    }
};
exports.ReceiptPdfController = ReceiptPdfController;
__decorate([
    (0, infra_1.Perm)('payments.read'),
    (0, common_1.Get)(':id/pdf'),
    (0, common_1.Header)('Content-Type', 'application/pdf'),
    (0, common_1.Header)('Content-Disposition', 'inline; filename="receipt.pdf"'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ReceiptPdfController.prototype, "pdf", null);
exports.ReceiptPdfController = ReceiptPdfController = __decorate([
    (0, common_1.Controller)('api/receipts')
], ReceiptPdfController);
let ReportPdfController = class ReportPdfController {
    async collections(c, q) {
        const from = L.checkDate(q.from, 'From'), to = L.checkDate(q.to, 'To');
        if (from > to)
            throw L.bad('From date is after To date');
        const t = await withLogo(c);
        const pays = await c.db.all('SELECT received_on AS day, method, SUM(amount_minor) AS amount FROM payments WHERE tenant_id=? AND received_on BETWEEN ? AND ? GROUP BY received_on, method ORDER BY received_on, method', c.tid, from, to);
        const adj = await c.db.all("SELECT adjusted_on AS day, kind, COALESCE(method,'n/a') AS method, SUM(amount_minor) AS amount FROM payment_adjustments WHERE tenant_id=? AND adjusted_on BETWEEN ? AND ? GROUP BY adjusted_on, kind, method ORDER BY adjusted_on", c.tid, from, to);
        const sum = (a, k) => a.filter((x) => !k || x.kind === k).reduce((n, x) => n + Number(x.amount), 0);
        const received = sum(pays), reversed = sum(adj, 'reversal'), refunded = sum(adj, 'refund');
        return new common_1.StreamableFile(await pdfBuffer((d) => {
            head(d, t, (0, pdfUr_1.T)('COLLECTIONS REPORT'), `${from} to ${to}`);
            const rows = [...pays.map((r) => [r.day, `Received (${r.method})`, (0, exports.rs)(r.amount)]), ...adj.map((r) => [r.day, `${r.kind} (${r.method})`, '-' + (0, exports.negrs)(r.amount)])];
            const tableHead = () => { const hy = d.y; d.rect(exports.L0, hy - 4, exports.W0, 20).fill('#eee'); d.fillColor('#111').font('Helvetica-Bold').fontSize(10).text((0, pdfUr_1.T)('Date'), exports.L0 + 6, hy, { width: 100 }).text((0, pdfUr_1.T)('Entry'), exports.L0 + 120, hy, { width: 220 }).text((0, pdfUr_1.T)('Amount'), exports.L0 + 340, hy, { width: exports.W0 - 346, align: 'right' }); d.y = hy + 22; };
            tableHead();
            for (const r of rows) {
                if (d.y + 24 > d.page.height - 90) {
                    d.addPage();
                    d.y = 48;
                    tableHead();
                }
                const y = d.y;
                d.font('Helvetica').fontSize(11).fillColor('#111').text(r[0], exports.L0 + 6, y, { width: 100 }).text(r[1], exports.L0 + 120, y, { width: 220 }).text(r[2], exports.L0 + 340, y, { width: exports.W0 - 346, align: 'right' });
                d.y = y + 18;
                d.moveTo(exports.L0, d.y - 2).lineTo(exports.L0 + exports.W0, d.y - 2).strokeColor('#ddd').lineWidth(0.5).stroke();
            }
            if (rows.length === 0)
                d.font('Helvetica').fontSize(11).fillColor('#555').text((0, pdfUr_1.T)('No receipts or adjustments in this period.'), exports.L0 + 6, d.y);
            if (d.y + 130 > d.page.height - 60) {
                d.addPage();
                d.y = 48;
            }
            d.moveDown();
            totalRow(d, (0, pdfUr_1.T)('Received'), (0, exports.rs)(received));
            totalRow(d, (0, pdfUr_1.T)('Reversed'), (0, exports.negrs)(reversed));
            totalRow(d, (0, pdfUr_1.T)('Refunded'), (0, exports.negrs)(refunded));
            d.moveTo(exports.L0 + 250, d.y).lineTo(exports.L0 + exports.W0, d.y).strokeColor('#111').lineWidth(1).stroke();
            d.y += 6;
            totalRow(d, (0, pdfUr_1.T)('Net collected'), (0, exports.rs)(received - reversed - refunded), true);
            d.font('Helvetica').fontSize(9).fillColor('#555').text((0, pdfUr_1.T)('Cash collected only. This is not profit.'), exports.L0, d.y + 4);
            (0, exports.credit)(d);
        }));
    }
};
exports.ReportPdfController = ReportPdfController;
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('collections.pdf'),
    (0, common_1.Header)('Content-Type', 'application/pdf'),
    (0, common_1.Header)('Content-Disposition', 'inline; filename="collections-report.pdf"'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ReportPdfController.prototype, "collections", null);
exports.ReportPdfController = ReportPdfController = __decorate([
    (0, common_1.Controller)('api/reports')
], ReportPdfController);
let SchedulePdfController = class SchedulePdfController {
    async schedule(c, q) {
        const day = L.checkDate(q.date, 'Date');
        const t = await withLogo(c);
        const rows = await c.db.all(`SELECT b.code, b.status, b.event_type, b.starts_at, b.ends_at, b.guests, cu.name AS customer, v.name AS venue FROM bookings b JOIN customers cu ON cu.id=b.customer_id JOIN venues v ON v.id=b.venue_id WHERE b.tenant_id=? AND b.status<>'cancelled' AND b.event_date=? ORDER BY b.starts_at, b.id`, c.tid, day);
        return new common_1.StreamableFile(await pdfBuffer((d) => {
            head(d, t, 'DAILY EVENT SCHEDULE', day);
            if (rows.length === 0)
                d.font('Helvetica').fontSize(11).fillColor('#555').text((0, pdfUr_1.T)('No events on this day.'), exports.L0, d.y);
            for (const r of rows) {
                if (d.y + 70 > d.page.height - 70) {
                    d.addPage();
                    d.y = 48;
                }
                const y = d.y;
                d.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(`${r.venue}   ${String(r.starts_at).slice(11, 16)} - ${String(r.ends_at).slice(11, 16)}`, exports.L0, y, { width: exports.W0 });
                d.font('Helvetica').fontSize(11).text(`${r.event_type}, ${r.guests} ${(0, pdfUr_1.T)('Guests')}, ${r.customer}`, exports.L0, d.y + 2, { width: exports.W0 });
                d.fillColor('#555').text(`${r.code}  [${(0, pdfUr_1.TS)(r.status)}]`, exports.L0, d.y + 2, { width: exports.W0 });
                d.moveTo(exports.L0, d.y + 6).lineTo(exports.L0 + exports.W0, d.y + 6).strokeColor('#ddd').lineWidth(0.5).stroke();
                d.y += 14;
            }
            (0, exports.credit)(d);
        }));
    }
};
exports.SchedulePdfController = SchedulePdfController;
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('schedule.pdf'),
    (0, common_1.Header)('Content-Type', 'application/pdf'),
    (0, common_1.Header)('Content-Disposition', 'inline; filename="daily-schedule.pdf"'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SchedulePdfController.prototype, "schedule", null);
exports.SchedulePdfController = SchedulePdfController = __decorate([
    (0, common_1.Controller)('api/reports')
], SchedulePdfController);
const VKIND = { quotation: 'VENDOR QUOTATION', order: 'PURCHASE ORDER', bill: 'VENDOR BILL', advance: 'VENDOR ADVANCE' };
let VendorDocController = class VendorDocController {
    async doc(c, id) {
        const b = await D.own(c.db, 'vendor_bills', id, c.tid, 'Vendor bill');
        const t = await withLogo(c);
        const v = await c.db.get('SELECT name, phone, vendor_type FROM vendors WHERE id=? AND tenant_id=?', b.vendor_id, c.tid);
        const bk = b.booking_id ? await c.db.get('SELECT code, event_date FROM bookings WHERE id=? AND tenant_id=?', b.booking_id, c.tid) : null;
        const paid = await c.db.get('SELECT COALESCE(SUM(amount_minor),0) AS s FROM vendor_payments WHERE vendor_bill_id=? AND tenant_id=?', b.id, c.tid);
        return new common_1.StreamableFile(await pdfBuffer((d) => {
            head(d, t, (VKIND[b.kind] || 'VENDOR DOCUMENT') + (b.voided ? ' (VOIDED)' : ''), `Ref VB-${b.id}   Date ${b.billed_on}`);
            d.font('Helvetica-Bold').fontSize(12).fillColor('#111').text((0, pdfUr_1.T)('Vendor'), exports.L0, d.y);
            d.font('Helvetica').fontSize(11).text(`${v?.name || ''}${v?.phone ? '   ' + v.phone : ''}${v?.vendor_type ? '   (' + v.vendor_type + ')' : ''}`, exports.L0, d.y + 2);
            if (bk)
                d.moveDown(0.5).text(`${(0, pdfUr_1.T)('For booking')} ${bk.code}, ${bk.event_date}`, exports.L0, d.y);
            if (b.due_on)
                d.moveDown(0.5).text(`${(0, pdfUr_1.T)('Due on')} ${b.due_on}`, exports.L0, d.y);
            if (b.note)
                d.moveDown(0.5).text(`${(0, pdfUr_1.T)('Note')}: ${b.note}`, exports.L0, d.y, { width: exports.W0 });
            if (b.voided)
                d.moveDown(0.5).font('Helvetica-Bold').text(`${(0, pdfUr_1.T)('Voided')}${b.voided_at ? ' ' + String(b.voided_at).slice(0, 10) : ''}${b.void_reason ? '. ' + (0, pdfUr_1.T)('Reason') + ': ' + b.void_reason : ''}`, exports.L0, d.y, { width: exports.W0 }).font('Helvetica');
            d.moveDown(1);
            totalRow(d, (0, pdfUr_1.T)('Amount'), (0, exports.rs)(b.total_minor), true);
            if (b.kind === 'bill' || b.kind === 'advance') {
                totalRow(d, (0, pdfUr_1.T)('Paid so far'), (0, exports.rs)(Number(paid?.s || 0)));
                totalRow(d, (0, pdfUr_1.T)('Balance'), (0, exports.rs)(Number(b.total_minor) - Number(paid?.s || 0)));
            }
            d.font('Helvetica').fontSize(9).fillColor('#555').text((0, pdfUr_1.T)('Record of what was entered in the system. It states no terms, tax or delivery conditions; add those by agreement with the vendor.'), exports.L0, d.y + 8, { width: exports.W0 });
            (0, exports.credit)(d);
        }));
    }
};
exports.VendorDocController = VendorDocController;
__decorate([
    (0, infra_1.Perm)('vendors.read'),
    (0, common_1.Get)(':id/document.pdf'),
    (0, common_1.Header)('Content-Type', 'application/pdf'),
    (0, common_1.Header)('Content-Disposition', 'inline; filename="vendor-document.pdf"'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], VendorDocController.prototype, "doc", null);
exports.VendorDocController = VendorDocController = __decorate([
    (0, common_1.Controller)('api/vendor-bills')
], VendorDocController);
exports.OPS2_CONTROLLERS = [FeedbackController, ExportController, InvoicePdfController, ReceiptPdfController, ReportPdfController, SchedulePdfController, VendorDocController];
//# sourceMappingURL=ops2.js.map